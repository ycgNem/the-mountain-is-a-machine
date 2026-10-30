// The Game: owns the state, runs the fixed tick, and exposes every player action.

import { BUILDINGS, LINE_UPGRADES, LICENSES, type BuildingDef } from '../data/buildings';
import { ITEMS, itemShort } from '../data/items';
import { LAYERS, PURITY_MULT } from '../data/layers';
import { MILESTONES } from '../data/progression';
import { RECIPE_LIST, RECIPES, recipesFor } from '../data/recipes';
import { refreshEnv } from './env';
import { requestNeed, shaftTraffic, spareAbove, tickElevators, type ShaftTraffic } from './elevator';
import { depotItem, isSlot, pushesInto, rebuildOrder, tickLogistics } from './logistics';
import { generateLayer, heatGrade, oreAt, revealComponent, SURFACE, ORE_LIST } from './mapgen';
import { solvePower } from './power';
import { craftInputs, tickProduction } from './production';
import { checkDiscoveries, checkMilestones, fillContracts, placeFixed, startMilestone } from './progress';
import {
  DX,
  DY,
  TICK,
  T_FLOOR,
  T_HARD,
  T_MAGMA,
  T_ROCK,
  T_WATER,
  emptyStats,
  newBuilding,
  type Building,
  type Dir,
  type GameEvent,
  type GameState,
  type LayerState,
} from './types';

/**
 * 2: decor values index LAYERS[].decor and the amber rock is AMBER_DECOR (save.ts migrates 1).
 * 3: contracts count Chute deliveries (`chute`), shafts remember the last request served (`reqLast`);
 * on load lower stations face their depot again and stray pause flags are cleared.
 * 4: Act I's tutorial has a second milestone (Plates for the HQ), so every milestone from the Copper
 * Line on is numbered one higher (save.ts moves an older save's milestone and msDone up).
 */
export const SAVE_VERSION = 4;
export const STOCK_CAP = 999;

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
  /** Cost can't be paid now: it will be placed as a planned ghost. */
  planned?: boolean;
  /** Belt-like buildings this placement replaces. */
  replace?: number[];
  /** Missing goods for the cost. */
  missing?: Record<string, number>;
}

export class Game {
  s: GameState;
  events: GameEvent[] = [];
  /** Per layer: slot-node ids, downstream first. */
  order: number[][] = [];
  /** Per layer: non-slot buildings that tick. */
  movers: number[][] = [];
  dirty: boolean[] = [];
  /** Live elevator traffic per shaft id (not saved): see shaftTraffic() in elevator.ts. */
  traffic: ShaftTraffic[] = [];
  /** Starved-ghost warning state (not saved): when each layer:item started waiting, last warning, last arrival. */
  private starve = new Map<string, number>();
  private starveWarned = new Map<string, number>();
  private lastIn: Record<string, number>[] = [];
  /** Tick an Unloader last took each item on a layer (from the depot or the shaft's arrivals). */
  private lastOut: Record<string, number>[] = [];
  /** The most a depot has held of each layer:item since a ghost started waiting on it. */
  private peak = new Map<string, number>();
  /** What each layer's queued ghosts hold (ghostHolds), rebuilt after any ghost is placed, built or removed. */
  private holds: Record<string, number>[] | null = null;
  staticLight: Float32Array[] = [];
  envTimer = 0;
  speedMul = 1;

  constructor(s: GameState) {
    this.s = s;
    for (let i = 0; i < s.layers.length; i++) {
      this.order.push([]);
      this.movers.push([]);
      this.dirty.push(true);
      this.staticLight.push(new Float32Array(0));
    }
    for (let i = 0; i < s.layers.length; i++) refreshEnv(this, i, true);
  }

  static create(seed = 20261030): Game {
    const layers = LAYERS.map((d) => generateLayer(d.index, seed));
    const s: GameState = {
      version: SAVE_VERSION,
      seed,
      rng: seed ^ 0x5bd1e995,
      tick: 0,
      time: 0,
      money: 400,
      layers,
      buildings: new Map(),
      nextId: 1,
      shafts: [],
      deepest: 0,
      visited: [0],
      project: { id: 'd1', delivered: {} },
      projectsDone: [],
      milestone: 0,
      msBase: emptyStats(),
      msDone: [],
      stats: emptyStats(),
      licenses: [],
      lineLevel: 0,
      assays: {},
      assaysDone: [],
      contracts: { offers: [], active: null, done: 0, refresh: 300 },
      income: new Array(60).fill(0),
      ended: false,
      endTime: 0,
    };
    const g = new Game(s);
    g.setupSurface();
    fillContracts(g);
    startMilestone(g, 0, true);
    return g;
  }

  // ---------------------------------------------------------------- queries

  layer(i: number): LayerState {
    return this.s.layers[i];
  }

  b(id: number): Building | undefined {
    return this.s.buildings.get(id);
  }

  def(b: Building): BuildingDef {
    return BUILDINGS[b.type];
  }

  at(layer: number, x: number, y: number): Building | null {
    const L = this.s.layers[layer];
    if (!L || x < 0 || y < 0 || x >= L.w || y >= L.h) return null;
    const id = L.occ[y * L.w + x];
    return id >= 0 ? (this.s.buildings.get(id) ?? null) : null;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  isUnlocked(key: string): boolean {
    if (key === 'start' || this.s.unlockAll) return true;
    const [kind, val] = key.split(':');
    switch (kind) {
      case 'milestone':
        return this.s.msDone.includes(Number(val));
      case 'layer':
        return this.s.deepest >= Number(val);
      case 'assay':
        return this.s.assaysDone.includes(val);
      case 'license':
        return this.s.licenses.includes(val);
      case 'made':
        return (this.s.stats.produced[val] ?? 0) > 0;
    }
    return false;
  }

  canBuild(type: string): boolean {
    const d = BUILDINGS[type];
    return !!d && !d.fixed && this.isUnlocked(d.unlock);
  }

  recipeUnlocked(id: string): boolean {
    const r = RECIPES[id];
    if (!r) return false;
    return !r.unlock || this.isUnlocked(r.unlock);
  }

  availableRecipes(type: string): string[] {
    return recipesFor(type)
      .filter((r) => this.recipeUnlocked(r.id))
      .map((r) => r.id);
  }

  /** Spare power per layer etc. are in layer.power; this is the Surface line capacity. */
  lineKw(): number {
    return LINE_UPGRADES[this.s.lineLevel].kw;
  }

  // ---------------------------------------------------------------- setup

  /**
   * The Surface as a new game opens: the HQ with its crate, the Shipping Terminal and the broken Drill,
   * and nothing else. The player builds the first line (Act I's first milestones walk them through it);
   * the crate holds what the line that used to come ready-made cost (data/layers.ts).
   */
  private setupSurface(): void {
    const L = this.layer(0);
    L.stock = { ...LAYERS[0].starterCrate };
    // "Keep for the Surface": the elevator never takes the HQ below these.
    L.requests = { ...LAYERS[0].requests };
    this.spawnFixed('hq', 0, SURFACE.hq.x, SURFACE.hq.y, 2);
    this.spawnFixed('terminal', 0, SURFACE.terminal.x, SURFACE.terminal.y, 2);
    this.spawnFixed('drill', 0, SURFACE.drill.x, SURFACE.drill.y, 2);
  }

  /** Fixed buildings (HQ, depot, terminal, drill, elevator, nodes, heart). */
  spawnFixed(type: string, layer: number, x: number, y: number, dir: Dir): Building {
    const bld = this.forcePlace(type, layer, x, y, dir);
    return bld;
  }

  /** Place without cost or rules (setup, fixed buildings). */
  forcePlace(type: string, layer: number, x: number, y: number, dir: Dir): Building {
    const def = BUILDINGS[type];
    const L = this.layer(layer);
    const bld = newBuilding(this.s.nextId++, type, layer, x, y, dir);
    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        const i = (y + dy) * L.w + (x + dx);
        const old = L.occ[i];
        if (old >= 0) this.deleteBuilding(old);
        L.terrain[i] = L.terrain[i] === T_HARD || L.terrain[i] === T_ROCK ? T_FLOOR : L.terrain[i];
        L.occ[i] = bld.id;
        L.revealed[i] = 1;
      }
    }
    this.s.buildings.set(bld.id, bld);
    this.initBuilding(bld);
    this.dirty[layer] = true;
    return bld;
  }

  private initBuilding(bld: Building): void {
    const def = BUILDINGS[bld.type];
    if (def.kind === 'miner') {
      const info = this.minerInfo(bld.layer, bld.x, bld.y, def);
      bld.ore = info.ore;
      bld.rate = info.rate;
    }
    if (def.kind === 'collector') bld.ore = 'spore_dust';
    bld.envMul = 1;
  }

  /** What a miner/harvester at (x, y) would extract, how fast (items/s), and the purity it mines at (its ore's best tile). */
  minerInfo(layer: number, x: number, y: number, def: BuildingDef): { ore: string | null; rate: number; coverage: number; purity: number } {
    const L = this.layer(layer);
    const counts = new Map<string, { n: number; purity: number }>();
    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) continue;
        const ore = oreAt(L, cx, cy);
        if (!ore || !def.needsDeposit?.includes(ore)) continue;
        const c = counts.get(ore) ?? { n: 0, purity: 0 };
        c.n++;
        c.purity = Math.max(c.purity, L.purity[cy * L.w + cx]);
        counts.set(ore, c);
      }
    }
    let best: string | null = null;
    let bn = 0;
    let bp = 1;
    for (const [ore, c] of counts) {
      if (c.n > bn) {
        best = ore;
        bn = c.n;
        bp = c.purity;
      }
    }
    const cells = def.size * def.size;
    const coverage = bn / cells;
    return { ore: best, rate: best ? 0.5 * PURITY_MULT[bp] * coverage : 0, coverage, purity: bp };
  }

  // ---------------------------------------------------------------- placement

  footprintCells(layer: number, x: number, y: number, size: number): number[] {
    const L = this.layer(layer);
    const out: number[] = [];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push((y + dy) * L.w + (x + dx));
    return out;
  }

  /**
   * Can this be placed here, and is it paid now or planned? `stock` stands in for the depot's stock (a
   * drag preview checks each piece against what the pieces before it left).
   */
  canPlace(type: string, layer: number, x: number, y: number, dir: Dir, stock?: Record<string, number>): PlaceCheck {
    const def = BUILDINGS[type];
    const L = this.layer(layer);
    if (!def) return { ok: false, reason: 'Unknown building' };
    if (!L.open) return { ok: false, reason: 'This layer is not open yet' };
    if (!this.canBuild(type)) return { ok: false, reason: 'Locked' };
    if (x < 0 || y < 0 || x + def.size > L.w || y + def.size > L.h) return { ok: false, reason: 'Out of bounds' };
    if (def.kind === 'chute' && layer === 0) return { ok: false, reason: 'Up here, sell at the Shipping Terminal' };
    const replace: number[] = [];
    let anyHot = false;
    let liveConduit = 0;
    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        const i = cy * L.w + cx;
        if (!L.revealed[i]) return { ok: false, reason: "Can't build in the dark" };
        const t = L.terrain[i];
        if (t === T_ROCK || t === T_HARD) return { ok: false, reason: 'Solid rock: excavate first (E)' };
        if (t === T_WATER) return { ok: false, reason: 'Water' };
        if (t === T_MAGMA) return { ok: false, reason: 'Magma' };
        if (def.kind === 'foundation') {
          if (L.foundation[i]) return { ok: false, reason: 'Already a foundation' };
          continue;
        }
        const occ = L.occ[i];
        if (occ >= 0) {
          const other = this.s.buildings.get(occ)!;
          if (def.size === 1 && isSlot(def.kind) && isSlot(BUILDINGS[other.type].kind) && !BUILDINGS[other.type].fixed) {
            if (other.type === type && other.dir === dir) return { ok: false, reason: 'Same building already here' };
            replace.push(occ);
          } else {
            return { ok: false, reason: `${BUILDINGS[other.type].name} in the way` };
          }
        }
        if (L.hot[i] === 2 && !L.foundation[i]) anyHot = true;
        if (L.conduitLive[i]) liveConduit++;
      }
    }
    if (def.needsDeposit) {
      const info = this.minerInfo(layer, x, y, def);
      if (!info.ore) return { ok: false, reason: def.kind === 'miner' && def.id === 'harvester' ? 'Needs a glowcap patch' : 'Needs a deposit under it' };
    }
    if (def.needsWater && !this.touchesTerrain(layer, x, y, def.size, T_WATER)) return { ok: false, reason: 'Must touch water' };
    if (def.needsHot && !anyHot) return { ok: false, reason: 'Must stand on hot ground (within 2 tiles of magma)' };
    if (def.needsConduit && liveConduit < 2) return { ok: false, reason: 'Needs two tiles on an awake conduit' };
    if (def.steadyGround && this.nearHotGround(layer, x, y, def.size, STEADY_GROUND)) return { ok: false, reason: `Needs steady ground: ${STEADY_GROUND} tiles from any hot ground` };
    // Cost (replacing refunds the old pieces first, less any goods a Rush paid for: those never come back).
    const refund: Record<string, number> = {};
    for (const id of replace) {
      const o = this.s.buildings.get(id)!;
      if (o.planned) continue;
      for (const [k, v] of Object.entries(BUILDINGS[o.type].cost)) refund[k] = (refund[k] ?? 0) + v - (o.rushed?.[k] ?? 0);
    }
    const have0 = stock ?? L.stock;
    const missing: Record<string, number> = {};
    let short = false;
    for (const [k, v] of Object.entries(def.cost)) {
      const have = (have0[k] ?? 0) + (refund[k] ?? 0);
      if (have < v) {
        missing[k] = v - have;
        short = true;
      }
    }
    // Foundations are paid on the spot or not at all: they can't wait as ghosts.
    if (short && def.kind === 'foundation') {
      const list = Object.entries(missing).map(([k, v]) => `${v} more ${ITEMS[k]?.name ?? k}`).join(', ');
      return { ok: false, reason: `Foundations can't be planned: the depot needs ${list}`, missing };
    }
    // A ghost can't take a working piece's place: the old one would be gone and the line cut. Over a
    // ghost it can: the new piece waits for its goods instead.
    if (short && replace.some((id) => !this.s.buildings.get(id)!.planned)) return { ok: false, reason: 'Not enough goods to swap this in' };
    return { ok: true, replace, planned: short, missing: short ? missing : undefined };
  }

  /** Is any hot ground (grade 2) within `dist` tiles of this footprint? */
  nearHotGround(layer: number, x: number, y: number, size: number, dist: number): boolean {
    const L = this.layer(layer);
    for (let cy = Math.max(0, y - dist); cy < Math.min(L.h, y + size + dist); cy++) {
      for (let cx = Math.max(0, x - dist); cx < Math.min(L.w, x + size + dist); cx++) {
        if (L.hot[cy * L.w + cx] === 2) return true;
      }
    }
    return false;
  }

  touchesTerrain(layer: number, x: number, y: number, size: number, t: number): boolean {
    const L = this.layer(layer);
    for (let k = 0; k < size; k++) {
      const pts = [
        [x + k, y - 1],
        [x + k, y + size],
        [x - 1, y + k],
        [x + size, y + k],
      ];
      for (const [px, py] of pts) {
        if (px < 0 || py < 0 || px >= L.w || py >= L.h) continue;
        if (L.terrain[py * L.w + px] === t) return true;
      }
    }
    return false;
  }

  /**
   * Place a building, paying from the layer's depot or as a planned ghost. A foundation is a tile, not
   * a building: it is paid for and laid on the spot (never planned) and null comes back either way.
   */
  place(type: string, layer: number, x: number, y: number, dir: Dir, opts: { recipe?: string | null; filter?: string | null; noPlan?: boolean } = {}): Building | null {
    const chk = this.canPlace(type, layer, x, y, dir);
    if (!chk.ok) return null;
    if (chk.planned && opts.noPlan) return null;
    const def = BUILDINGS[type];
    const L = this.layer(layer);
    if (def.kind === 'foundation') {
      if (chk.planned) return null;
      this.pay(L, def.cost);
      L.foundation[y * L.w + x] = 1;
      this.s.stats.built[type] = (this.s.stats.built[type] ?? 0) + 1;
      this.emit({ t: 'placed', layer, x, y, type });
      return null;
    }
    // Carry an item across a belt replacement so lines don't lose cargo.
    let carried: Building | null = null;
    for (const id of chk.replace ?? []) {
      const o = this.s.buildings.get(id)!;
      if (o.item && !carried) carried = o;
      this.removeBuilding(o, true);
    }
    const bld = newBuilding(this.s.nextId++, type, layer, x, y, dir);
    bld.recipe = opts.recipe ?? null;
    bld.filter = opts.filter ?? null;
    if (carried && carried.item && isSlot(def.kind) && def.kind !== 'crossing' && def.kind !== 'unloader' && def.kind !== 'crate') {
      bld.item = carried.item;
      bld.prog = Math.min(carried.prog, 0.5);
      bld.inDir = dir;
      bld.outDir = dir;
      carried.item = null;
    } else if (carried && carried.item) {
      // The new piece can't hold it: it goes to the depot instead of vanishing.
      const id = depotItem(carried.item.id);
      if (id) L.stock[id] = (L.stock[id] ?? 0) + 1;
      carried.item = null;
    }
    for (const i of this.footprintCells(layer, x, y, def.size)) L.occ[i] = bld.id;
    this.s.buildings.set(bld.id, bld);
    this.initBuilding(bld);
    if (chk.planned) {
      bld.planned = true;
      bld.status = 'planned';
      this.holds = null;
    } else {
      this.pay(L, def.cost);
      this.s.stats.built[type] = (this.s.stats.built[type] ?? 0) + 1;
      this.countBuiltOn(bld);
    }
    if (def.kind === 'machine' && !bld.recipe) {
      const av = this.availableRecipes(type);
      if (av.length === 1) bld.recipe = av[0];
    }
    this.dirty[layer] = true;
    this.emit({ t: 'placed', layer, x, y, type });
    return bld;
  }

  private countBuiltOn(bld: Building): void {
    if (bld.ore) {
      const key = `${bld.type}:${bld.ore}`;
      this.s.stats.built[key] = (this.s.stats.built[key] ?? 0) + 1;
    }
    const key2 = `${bld.type}@${bld.layer}`;
    this.s.stats.built[key2] = (this.s.stats.built[key2] ?? 0) + 1;
  }

  pay(L: LayerState, cost: Record<string, number>): void {
    for (const [k, v] of Object.entries(cost)) L.stock[k] = (L.stock[k] ?? 0) - v;
  }

  refund(L: LayerState, items: Record<string, number>): void {
    for (const [k, v] of Object.entries(items)) {
      if (v > 0) L.stock[k] = (L.stock[k] ?? 0) + v;
    }
  }

  /**
   * What a layer's queued ghosts hold of each good: every waiting ghost's whole cost, the running sum
   * buildPlanned and requestMissing count. A depot Unloader leaves the depot this much.
   */
  ghostHolds(layer: number): Record<string, number> {
    if (!this.holds) {
      const holds: Record<string, number>[] = this.s.layers.map(() => ({}));
      for (const b of this.s.buildings.values()) {
        if (!b.planned) continue;
        const h = holds[b.layer];
        for (const [k, v] of Object.entries(BUILDINGS[b.type].cost)) h[k] = (h[k] ?? 0) + v;
      }
      this.holds = holds;
    }
    return this.holds[layer] ?? {};
  }

  /** Planned ghosts get built, oldest first, when the depot can pay. */
  buildPlanned(layer: number): void {
    const L = this.layer(layer);
    const ids = this.ghostQueue(layer).map((b) => b.id);
    // Oldest first. A ghost still waiting holds the goods it needs; newer ghosts only use what is left.
    const held: Record<string, number> = {};
    for (const id of ids) {
      const bld = this.s.buildings.get(id)!;
      const def = BUILDINGS[bld.type];
      const costs = Object.entries(def.cost);
      if (!costs.every(([k, v]) => (L.stock[k] ?? 0) - (held[k] ?? 0) >= v)) {
        for (const [k, v] of costs) held[k] = (held[k] ?? 0) + v;
        continue;
      }
      {
        this.pay(L, def.cost);
        bld.planned = false;
        bld.status = 'idle';
        this.holds = null;
        this.s.stats.built[bld.type] = (this.s.stats.built[bld.type] ?? 0) + 1;
        this.countBuiltOn(bld);
        this.dirty[layer] = true;
        this.emit({ t: 'placed', layer, x: bld.x, y: bld.y, type: bld.type });
      }
    }
  }

  /** Remove whatever is at (x, y), refunding its cost and contents to the layer's depot. */
  remove(layer: number, x: number, y: number): boolean {
    const L = this.layer(layer);
    const bld = this.at(layer, x, y);
    if (!bld) {
      const i = y * L.w + x;
      if (L.foundation[i]) {
        L.foundation[i] = 0;
        this.refund(L, BUILDINGS.foundation.cost);
        this.emit({ t: 'removed', layer, x, y });
        return true;
      }
      return false;
    }
    if (BUILDINGS[bld.type].fixed) return false;
    this.removeBuilding(bld, false);
    this.emit({ t: 'removed', layer, x, y });
    return true;
  }

  private removeBuilding(bld: Building, replacing: boolean): void {
    const def = BUILDINGS[bld.type];
    const L = this.layer(bld.layer);
    if (!bld.planned) {
      // Goods bought with a Rush were never in the depot, so they don't come back.
      const back: Record<string, number> = {};
      for (const [k, v] of Object.entries(def.cost)) back[k] = v - (bld.rushed?.[k] ?? 0);
      this.refund(L, back);
    }
    // Contents go back to the depot, and so do the inputs of a craft in progress.
    const back = this.contentsBack(bld);
    if (bld.item && !replacing) addBack(back, bld.item.id);
    if (bld.item2) addBack(back, bld.item2.id);
    if (bld.stockItem && bld.stockCount) addBack(back, bld.stockItem, bld.stockCount);
    this.refund(L, back);
    this.deleteBuilding(bld.id);
  }

  /**
   * A machine's buffers plus the inputs its unfinished craft took, as depot goods (hot items cool,
   * unstable ones are lost): what removal and a recipe change give back.
   */
  private contentsBack(bld: Building): Record<string, number> {
    const back: Record<string, number> = {};
    for (const [k, v] of Object.entries(bld.inBuf)) addBack(back, k, v);
    for (const it of bld.outBuf) addBack(back, it.id);
    for (const it of bld.sideBuf) addBack(back, it.id);
    for (const [k, v] of Object.entries(craftInputs(bld))) addBack(back, k, v);
    return back;
  }

  private deleteBuilding(id: number): void {
    const bld = this.s.buildings.get(id);
    if (!bld) return;
    const L = this.layer(bld.layer);
    const size = BUILDINGS[bld.type].size;
    for (const i of this.footprintCells(bld.layer, bld.x, bld.y, size)) if (L.occ[i] === id) L.occ[i] = -1;
    this.s.buildings.delete(id);
    if (bld.planned) this.holds = null;
    this.dirty[bld.layer] = true;
  }

  /**
   * Turn a building a quarter clockwise, or to `dir` (the Rotate button and R). Fixed buildings don't
   * turn, except a top elevator station, which picks the face up-cargo comes out of. A lower station
   * always faces its depot, so everything sent down lands in stock. Returns whether it turned.
   */
  rotate(id: number, dir?: Dir): boolean {
    const bld = this.s.buildings.get(id);
    if (!bld) return false;
    const def = BUILDINGS[bld.type];
    if (def.fixed && def.kind !== 'elevator') return false;
    if (def.kind === 'elevator' && bld.end === 1) return false;
    bld.dir = dir ?? (((bld.dir + 1) % 4) as Dir);
    if (isSlot(def.kind)) bld.outDir = bld.dir;
    this.dirty[bld.layer] = true;
    return true;
  }

  setRecipe(id: number, recipe: string | null): void {
    const bld = this.s.buildings.get(id);
    if (!bld || bld.recipe === recipe) return;
    if (recipe && (!this.recipeUnlocked(recipe) || RECIPES[recipe].machine !== bld.type)) return;
    const L = this.layer(bld.layer);
    this.refund(L, this.contentsBack(bld));
    bld.inBuf = {};
    bld.outBuf = [];
    bld.sideBuf = [];
    bld.active = false;
    bld.craft = 0;
    bld.recipe = recipe;
  }

  /**
   * Set a Sorter's or Unloader's filter. An Unloader holding a good the new filter no longer takes
   * gives it back to its layer's depot (as a refund: a hot good cools), so it can't push the old good
   * into whatever it feeds now.
   */
  setFilter(id: number, item: string | null): void {
    const bld = this.s.buildings.get(id);
    if (!bld) return;
    bld.filter = item;
    if (BUILDINGS[bld.type].kind === 'unloader' && bld.item && bld.item.id !== item) {
      const back: Record<string, number> = {};
      addBack(back, bld.item.id);
      this.refund(this.layer(bld.layer), back);
      bld.item = null;
      bld.prog = 0;
    }
  }

  // ---------------------------------------------------------------- money actions

  buyLicense(id: string): boolean {
    const lic = LICENSES[id];
    if (!lic || this.s.licenses.includes(id) || this.s.money < lic.price || this.s.deepest < lic.minLayer) return false;
    this.s.money -= lic.price;
    this.s.licenses.push(id);
    this.emit({ t: 'toast', text: `${lic.name} license bought`, kind: 'good' });
    return true;
  }

  upgradeLine(): boolean {
    const next = LINE_UPGRADES[this.s.lineLevel + 1];
    if (!next || this.s.money < next.price) return false;
    this.s.money -= next.price;
    this.s.lineLevel++;
    this.s.stats.events.line_upgraded = 1;
    this.emit({ t: 'toast', text: `Company Line upgraded to ${next.kw} kW`, kind: 'good' });
    return true;
  }

  /**
   * What a belt drag really lays down. Across a working belt it lays a Crossing instead of turning
   * that belt. Where the drag starts, ends or turns on a belt it leaves that belt alone (so a new line
   * ending at a belt side-loads into it, and a drag turning on a line's corner doesn't cut it), unless
   * the belt already runs the drag's way or the drag runs along that belt's line: running along a line
   * re-lays it (end to end, that reverses it). A drag that starts on a straight run of a line across
   * its path (the cell behind that belt pushes into it) and goes on past it crosses it with a Crossing,
   * so the new line doesn't merge into the old one; a line turning there keeps its belt (review-3 K7).
   * A drag that starts on a line's last belt, one that hands on to nothing, and goes off across it
   * turns that belt into the drag, so the line carries on: that is how a player extends a line, and
   * there is nothing past it to cross or to cut off.
   * It never replaces a splitter, sorter, crossing or other logistics piece. A single placement still
   * replaces whatever it is placed on.
   */
  planDrag(layer: number, type: string, pieces: { x: number; y: number; dir: Dir }[]): DragPiece[] {
    if (BUILDINGS[type]?.kind !== 'belt' || pieces.length < 2) return pieces.map((p) => ({ type, ...p, skip: false }));
    const last = pieces.length - 1;
    return pieces.map((p, i) => {
      const o = this.at(layer, p.x, p.y);
      const def = o ? BUILDINGS[o.type] : null;
      if (!o || !def || def.fixed || !isSlot(def.kind)) return { type, ...p, skip: false };
      if (def.kind !== 'belt') return { type, ...p, skip: true };
      const corner = i > 0 && pieces[i - 1].dir !== p.dir;
      if (i === 0 || i === last || corner) {
        if (o.dir === p.dir) return { type, ...p, skip: false };
        if (i === 0 && i < last && o.dir % 2 !== p.dir % 2) {
          if (!this.at(layer, o.x + DX[o.dir], o.y + DY[o.dir])) return { type, ...p, skip: false };
          if (this.fedFromBehind(layer, o)) return { type: 'crossing', ...p, skip: false };
        }
        // The next drag tile at the start or a corner (the corner is the second leg's first tile), the
        // one before at the end: the drag runs along this line if a belt there is on the same axis.
        const j = i === 0 || corner ? (i < last ? i + 1 : -1) : i - 1;
        const n = j >= 0 ? this.at(layer, pieces[j].x, pieces[j].y) : null;
        const along = o.dir % 2 === p.dir % 2 && !!n && BUILDINGS[n.type].kind === 'belt' && n.dir % 2 === p.dir % 2;
        return { type, ...p, skip: !along };
      }
      if (o.dir % 2 === p.dir % 2) return { type, ...p, skip: false };
      return { type: 'crossing', ...p, skip: false };
    });
  }

  /**
   * Is this belt a straight run of its line: does the cell behind it push into it? A belt or other
   * piece there that hands on this way, or a machine, miner, station or node whose output port (or
   * byproduct port) is this cell. A belt only fed from a side is a line turning onto it.
   */
  private fedFromBehind(layer: number, o: Building): boolean {
    const f = this.at(layer, o.x - DX[o.dir], o.y - DY[o.dir]);
    return !!f && f.id !== o.id && pushesInto(f, o.x, o.y, o.dir);
  }

  /**
   * Lay a belt drag as planDrag plans it. Crossings go first, so the depot's goods go to them before
   * plain belts (a crossing over a working line can't wait as a ghost); the rest follow in drag order.
   * A piece the depot can't pay for becomes a ghost; refused pieces are listed with the reason. A
   * foundation counts as placed once its tile is laid (it is no building, so place() returns null).
   */
  placeDrag(layer: number, type: string, pieces: { x: number; y: number; dir: Dir }[]): { placed: number; planned: number; refused: { x: number; y: number; type: string; reason: string }[] } {
    const plan = this.planDrag(layer, type, pieces).filter((p) => !p.skip);
    const order = [...plan.filter((p) => p.type === 'crossing'), ...plan.filter((p) => p.type !== 'crossing')];
    const L = this.layer(layer);
    let placed = 0;
    let planned = 0;
    const refused: { x: number; y: number; type: string; reason: string }[] = [];
    for (const p of order) {
      const chk = this.canPlace(p.type, layer, p.x, p.y, p.dir);
      let laid = false;
      let ghost = false;
      if (chk.ok && BUILDINGS[p.type].kind === 'foundation') {
        this.place(p.type, layer, p.x, p.y, p.dir);
        laid = L.foundation[p.y * L.w + p.x] === 1;
      } else if (chk.ok) {
        const b = this.place(p.type, layer, p.x, p.y, p.dir);
        laid = !!b;
        ghost = !!b?.planned;
      }
      if (!laid) {
        refused.push({ x: p.x, y: p.y, type: p.type, reason: chk.reason ?? "Can't build here" });
        continue;
      }
      if (ghost) planned++;
      else placed++;
    }
    return { placed, planned, refused };
  }

  /** A layer's planned ghosts in build order: oldest first, unless the player moved one up. */
  ghostQueue(layer: number): Building[] {
    return [...this.s.buildings.values()].filter((b) => b.planned && b.layer === layer).sort((a, b) => (a.queue ?? a.id) - (b.queue ?? b.id));
  }

  /** "Build next": move a planned ghost to the front of its depot's queue. */
  buildNext(id: number): boolean {
    const bld = this.s.buildings.get(id);
    if (!bld || !bld.planned) return false;
    const first = this.ghostQueue(bld.layer)[0];
    if (first && first.id !== id) bld.queue = (first.queue ?? first.id) - 1;
    return true;
  }

  /**
   * Pause or resume a machine, miner or collector: once its current craft is done it starts no new one
   * and draws no power. Nothing else can be paused (it would keep running under a Paused badge), but
   * anything can be resumed. Returns whether the flag took.
   */
  setPaused(id: number, paused: boolean): boolean {
    const b = this.s.buildings.get(id);
    if (!b) return false;
    if (paused) {
      if (!isPausable(b.type)) return false;
      b.paused = true;
    } else delete b.paused;
    return true;
  }

  /** What a planned ghost is missing from its depot, and what rushing it would cost. */
  rushQuote(id: number): { missing: Record<string, number>; price: number } | null {
    const bld = this.s.buildings.get(id);
    if (!bld || !bld.planned) return null;
    const L = this.layer(bld.layer);
    const missing: Record<string, number> = {};
    let price = 0;
    for (const [k, v] of Object.entries(BUILDINGS[bld.type].cost)) {
      const short = Math.max(0, v - (L.stock[k] ?? 0));
      if (short > 0) {
        missing[k] = short;
        price += rushPrice(k, short);
      }
    }
    return { missing, price };
  }

  /**
   * Rush a planned ghost: the Company ships the missing goods straight onto the site for 3x their
   * value. It builds at once; the rushed goods never reach the depot and are never refunded.
   */
  rush(id: number): boolean {
    const q = this.rushQuote(id);
    const bld = this.s.buildings.get(id);
    if (!q || !bld || this.s.money < q.price) return false;
    const L = this.layer(bld.layer);
    const def = BUILDINGS[bld.type];
    this.s.money -= q.price;
    for (const [k, v] of Object.entries(def.cost)) L.stock[k] = (L.stock[k] ?? 0) - (v - (q.missing[k] ?? 0));
    bld.rushed = q.missing;
    bld.planned = false;
    bld.status = 'idle';
    this.holds = null;
    this.s.stats.built[bld.type] = (this.s.stats.built[bld.type] ?? 0) + 1;
    this.countBuiltOn(bld);
    this.dirty[bld.layer] = true;
    this.emit({ t: 'placed', layer: bld.layer, x: bld.x, y: bld.y, type: bld.type });
    this.emit({ t: 'toast', text: `${def.name} rushed for $${q.price}`, kind: 'info' });
    return true;
  }

  // ---------------------------------------------------------------- excavation

  digCost(layer: number): number {
    return LAYERS[layer].digCost;
  }

  /** Queue rock cells for excavation. Returns how many were queued. */
  queueDig(layer: number, cells: { x: number; y: number }[]): number {
    const L = this.layer(layer);
    if (!L.open) return 0;
    let n = 0;
    const queued = new Set(L.digQueue);
    for (const c of cells) {
      if (c.x <= 0 || c.y <= 0 || c.x >= L.w - 1 || c.y >= L.h - 1) continue;
      const i = c.y * L.w + c.x;
      if (L.terrain[i] !== T_ROCK || queued.has(i)) continue;
      L.digQueue.push(i);
      queued.add(i);
      n++;
    }
    return n;
  }

  cancelDig(layer: number, cells?: { x: number; y: number }[]): void {
    const L = this.layer(layer);
    if (!cells) {
      L.digQueue = [];
      return;
    }
    const drop = new Set(cells.map((c) => c.y * L.w + c.x));
    L.digQueue = L.digQueue.filter((i) => !drop.has(i));
  }

  private tickDig(layer: number): void {
    const L = this.layer(layer);
    if (!L.digQueue.length) return;
    if (this.s.tick % 4 !== 0) return;
    const cost = this.digCost(layer);
    // Dig the first queued cell that touches open floor.
    for (let k = 0; k < L.digQueue.length; k++) {
      const i = L.digQueue[k];
      if (L.terrain[i] !== T_ROCK) {
        L.digQueue.splice(k, 1);
        k--;
        continue;
      }
      const x = i % L.w;
      const y = (i / L.w) | 0;
      if (!this.touchesOpen(L, x, y)) continue;
      if (this.s.money < cost) {
        L.digQueue = [];
        this.emit({ t: 'toast', text: 'Out of money: excavation stopped', kind: 'bad' });
        return;
      }
      this.s.money -= cost;
      L.digQueue.splice(k, 1);
      this.digCell(layer, x, y);
      return;
    }
    // Nothing left that touches open floor.
    L.digQueue = [];
  }

  private touchesOpen(L: LayerState, x: number, y: number): boolean {
    for (let d = 0; d < 4; d++) {
      const nx = x + [0, 1, 0, -1][d];
      const ny = y + [-1, 0, 1, 0][d];
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const j = ny * L.w + nx;
      const t = L.terrain[j];
      if ((t === T_FLOOR || t === T_WATER || t === T_MAGMA) && L.revealed[j]) return true;
    }
    return false;
  }

  digCell(layer: number, x: number, y: number): void {
    const L = this.layer(layer);
    const i = y * L.w + x;
    L.terrain[i] = T_FLOOR;
    L.revealed[i] = 1;
    if (layer === 4) L.hot[i] = heatGrade(L, x, y);
    this.s.stats.dug++;
    let revealed = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const j = ny * L.w + nx;
        const t = L.terrain[j];
        if (t === T_FLOOR || t === T_WATER || t === T_MAGMA) {
          // A cavern opens all at once, where the tunnel meets it straight on. A corner touch leaves it
          // dark: lighting that one tile would leave the cavern behind it dark for good, and the dig
          // queue past it dropped. A straight-on tile lit that way by an older build floods now.
          if ((dx === 0 || dy === 0) && (!L.revealed[j] || darkBeside(L, nx, ny))) revealed += revealComponent(L, nx, ny);
          continue;
        }
        L.revealed[j] = 1;
      }
    }
    this.emit({ t: 'dug', layer, x, y });
    if (revealed > 6) this.emit({ t: 'reveal', layer, cells: revealed });
    // A tunnel can reach the bore site without opening a cavern, so check after every dig.
    this.onReveal(layer);
    this.staticLight[layer] = new Float32Array(0);
  }

  private onReveal(layer: number): void {
    const def = LAYERS[layer];
    const L = this.layer(layer);
    if (def.boreSite && this.s.project && this.s.project.id === def.project) {
      const b = def.boreSite;
      if (L.revealed[b.y * L.w + b.x] && !this.s.stats.events[`bore_${layer}`]) {
        this.s.stats.events[`bore_${layer}`] = 1;
        this.s.stats.events.bore_site_reached = 1;
        this.emit({
          t: 'message',
          who: 'mags',
          text: layer === 1 ? "That's the bore site. And foreman... the rock here is sealed in something like amber. It's seeping up from below." : "That's the bore site. The crew is setting up the rig.",
        });
      }
    }
  }

  /**
   * Would a survey centred here do anything? It must reach at least one cell of the map not surveyed
   * yet (a click beside the map costs nothing), and the money must be there. `reason` says why not.
   */
  surveyCheck(layer: number, x: number, y: number): { ok: boolean; reason?: string; cells: number } {
    const L = this.layer(layer);
    if (layer === 0) return { ok: false, reason: 'Nothing to survey up here: the Surface is in plain sight', cells: 0 };
    if (!L || !L.open) return { ok: false, reason: 'This layer is not open yet', cells: 0 };
    const R = SURVEY_RADIUS;
    let cells = 0;
    for (let cy = Math.max(0, y - R); cy <= Math.min(L.h - 1, y + R); cy++) {
      for (let cx = Math.max(0, x - R); cx <= Math.min(L.w - 1, x + R); cx++) {
        if ((cx - x) ** 2 + (cy - y) ** 2 <= R * R && !L.surveyed[cy * L.w + cx]) cells++;
      }
    }
    if (!cells) return { ok: false, reason: 'Nothing new to survey here', cells: 0 };
    const cost = LAYERS[layer].surveyCost;
    if (this.s.money < cost) return { ok: false, reason: `A survey costs $${cost}`, cells };
    return { ok: true, cells };
  }

  survey(layer: number, x: number, y: number): boolean {
    if (!this.surveyCheck(layer, x, y).ok) return false;
    const L = this.layer(layer);
    this.s.money -= LAYERS[layer].surveyCost;
    const R = SURVEY_RADIUS;
    for (let cy = y - R; cy <= y + R; cy++) {
      for (let cx = x - R; cx <= x + R; cx++) {
        if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) continue;
        if ((cx - x) ** 2 + (cy - y) ** 2 <= R * R) L.surveyed[cy * L.w + cx] = 1;
      }
    }
    this.s.stats.events.surveyed = (this.s.stats.events.surveyed ?? 0) + 1;
    this.emit({ t: 'survey', layer, x, y });
    return true;
  }

  // ---------------------------------------------------------------- tick

  tick(): void {
    const s = this.s;
    if (s.ended) s.endTime += TICK;
    s.tick++;
    s.time += TICK;
    for (let li = 0; li < s.layers.length; li++) {
      if (!s.layers[li].open) continue;
      if (this.dirty[li]) rebuildOrder(this, li);
    }
    // Environment (spores, heat, interference, light) a few times a second.
    if (s.tick % 20 === 0) for (let li = 0; li < s.layers.length; li++) if (s.layers[li].open) refreshEnv(this, li, false);
    solvePower(this);
    for (let li = 0; li < s.layers.length; li++) {
      if (!s.layers[li].open) continue;
      tickProduction(this, li);
      tickLogistics(this, li);
      this.tickDig(li);
    }
    tickElevators(this);
    if (s.tick % 30 === 0) for (let li = 0; li < s.layers.length; li++) if (s.layers[li].open) this.buildPlanned(li);
    if (s.tick % 60 === 0) {
      s.income.shift();
      s.income.push(0);
    }
    if (s.tick % 15 === 0) checkMilestones(this);
    if (s.tick % 30 === 7) checkDiscoveries(this);
    if (s.tick % 300 === 150) this.checkStarved();
    s.contracts.refresh -= TICK;
    if (s.contracts.refresh <= 0) fillContracts(this, true);
  }

  /**
   * A planned ghost has waited a minute for an item: tell the player, once per item every few
   * minutes. Either none has come in for a minute (the Act I bot sat in exactly this for three
   * minutes), or some came in but Unloaders took it as it arrived, so the stock never reached the
   * ghost's cost. (A depot Unloader leaves what ghosts hold, so that is one at the shaft's arrivals.)
   */
  private checkStarved(): void {
    const now = this.s.tick;
    const seen = new Set<string>();
    for (let li = 0; li < this.s.layers.length; li++) {
      const L = this.s.layers[li];
      if (!L.open) continue;
      for (const gh of this.ghostQueue(li)) {
        for (const [k, v] of Object.entries(BUILDINGS[gh.type].cost)) {
          const stock = L.stock[k] ?? 0;
          if (stock >= v) continue;
          const key = `${li}:${k}`;
          seen.add(key);
          const since = this.starve.get(key) ?? now;
          this.starve.set(key, since);
          this.peak.set(key, Math.max(this.peak.get(key) ?? 0, stock));
          if (now - since < STARVE_WAIT || (this.starveWarned.get(key) ?? -Infinity) > now - STARVE_REPEAT) continue;
          const lastIn = this.lastIn[li]?.[k] ?? -Infinity;
          const taken = (this.lastOut[li]?.[k] ?? -Infinity) >= since;
          let text: string | null = null;
          if (taken && (this.peak.get(key) ?? 0) < v) text = this.takenMessage(li, k, gh.type);
          else if (now - lastIn >= STARVE_WAIT) text = this.starveMessage(li, k, gh.type);
          if (!text) continue;
          this.starveWarned.set(key, now);
          this.emit({ t: 'message', who: 'mags', text });
        }
      }
    }
    for (const key of [...this.starve.keys()]) {
      if (seen.has(key)) continue;
      this.starve.delete(key);
      this.peak.delete(key);
    }
  }

  /**
   * How a good is made, for Mags's advice: "an Assembler: Aggregate and Steel Beam". The first recipe
   * for it the player can use now, else the first there is; null for goods no machine makes.
   */
  howMade(item: string): string | null {
    const all = RECIPE_LIST.filter((r) => r.outputs[item] || r.side?.[item]);
    const r = all.find((x) => this.recipeUnlocked(x.id) && this.canBuild(x.machine)) ?? all[0];
    if (!r) return null;
    const machine = BUILDINGS[r.machine].name;
    const ins = Object.keys(r.inputs).map(itemShort);
    const list = ins.length > 1 ? `${ins.slice(0, -1).join(', ')} and ${ins[ins.length - 1]}` : (ins[0] ?? '');
    return `${/^[AEIOU]/.test(machine) ? 'an' : 'a'} ${machine}: ${list}`;
  }

  /** What Mags says when goods a ghost waits on come in but Unloaders take them as they arrive. */
  takenMessage(li: number, item: string, ghostType: string): string {
    const name = ITEMS[item]?.name ?? item;
    const ghost = BUILDINGS[ghostType]?.name ?? ghostType;
    const where = li === 0 ? 'The HQ' : `${LAYERS[li].name} depot`;
    return `${where} gets ${name}, but Unloaders take it as it comes in. Your planned ${ghost} is waiting on it: turn them off until it is paid, or Rush the plan.`;
  }

  /**
   * What Mags says when a planned ghost on layer li has waited a minute for an item and none has come
   * in for a minute: why nothing is coming down, and what to do about it. The depot "is out of" the
   * good, or, with some in stock but fewer than the ghost costs, "has 3 Gear; your planned Miner needs
   * 4" (review-3 K9: 3 of 4 used to read as "out of").
   */
  starveMessage(li: number, item: string, ghostType: string): string {
    const name = ITEMS[item]?.name ?? item;
    const ghost = BUILDINGS[ghostType]?.name ?? ghostType;
    const L = this.layer(li);
    const have = L.stock[item] ?? 0;
    const cost = BUILDINGS[ghostType]?.cost[item] ?? 0;
    const some = have > 0 && have < cost;
    // Layer names already start with "The".
    const where = li === 0 ? 'The HQ' : `${LAYERS[li].name} depot`;
    const lead = some
      ? `${where} has ${have} ${name}; your planned ${ghost} needs ${cost} and none is coming in.`
      : `${where} is out of ${name} and none is coming in. Your planned ${ghost} is waiting on it.`;
    if (li === 0) return `${lead} Make some and belt it into the HQ, or Rush the plan.`;
    // A good first made on this layer or deeper, with none in any depot above: asking the elevator for
    // it or stocking it up there can't work.
    const home = ITEMS[item]?.layer ?? 0;
    if (home >= li && !this.s.layers.slice(0, li).some((U) => (U.stock[item] ?? 0) > 0)) {
      const how = this.howMade(item);
      return home === li
        ? `${lead} Make it down here${how ? ` (${how})` : ''}, or Rush the plan.`
        : `${lead} Only a deeper layer makes it${how ? ` (${how})` : ''}: send some up the shaft, or Rush the plan.`;
    }
    const need = requestNeed(this, li);
    if (!need[item]) {
      return L.requests[item] !== undefined
        ? `${lead} Its request is already met: raise it so the elevator brings more, make it down here, or Rush the plan.`
        : `${lead} Request it so the elevator brings it, make it down here, or Rush the plan.`;
    }
    if (spareAbove(this, li, item) <= 0) {
      const above = li === 1 ? 'The HQ' : `${LAYERS[li - 1].name} depot`;
      return `${lead} ${above} has none to spare: stock it up there, make it down here, or Rush the plan.`;
    }
    const sh = this.s.shafts.find((q) => q.layers[1] === li);
    if (sh && shaftTraffic(this, sh.id).full) {
      // The biggest other request queued for this shaft.
      let top = '';
      let n = 0;
      for (const [k, v] of Object.entries(need)) {
        if (k !== item && v > n) {
          top = k;
          n = v;
        }
      }
      const queued = top ? ` (${n} ${ITEMS[top]?.name ?? top} queued)` : '';
      const short = some ? `${where} has ${have} ${name}; your planned ${ghost} needs ${cost}.` : `${where} is out of ${name}; your planned ${ghost} is waiting on it.`;
      return `${short} The elevator is full of other requests${queued}: lower that request, upgrade the shaft, or Rush the plan.`;
    }
    return `${lead} It is requested and spare up above, but nothing has come down for a minute: check the elevator, or Rush the plan.`;
  }

  /** An item went into a depot (for the starved-ghost warning). */
  noteIn(layer: number, item: string): void {
    (this.lastIn[layer] ??= {})[item] = this.s.tick;
    const key = `${layer}:${item}`;
    if (this.starve.has(key)) this.peak.set(key, Math.max(this.peak.get(key) ?? 0, this.layer(layer).stock[item] ?? 0));
  }

  /** An Unloader took an item on this layer, out of the depot or the shaft's arrivals (for the starved-ghost warning). */
  noteOut(layer: number, item: string): void {
    (this.lastOut[layer] ??= {})[item] = this.s.tick;
  }

  /** Money in. Sales and contract pay count toward the $/min readout; milestone rewards pass income = false. */
  earn(amount: number, income = true): void {
    this.s.money += amount;
    this.s.stats.earned += amount;
    if (income) this.s.income[this.s.income.length - 1] += amount;
  }

  incomePerMin(): number {
    return this.s.income.reduce((a, b) => a + b, 0);
  }

  /** Used by progress.ts when a layer opens. */
  openLayer(n: number): void {
    placeFixed(this, n);
  }

  oreName(i: number): string {
    return ORE_LIST[i - 1] ?? '';
  }

  /** Debug: unlock every building, recipe and license. Opens no layers and leaves progress alone. */
  debugUnlockAll(): void {
    const s = this.s;
    s.unlockAll = true;
    for (const id of Object.keys(LICENSES)) if (!s.licenses.includes(id)) s.licenses.push(id);
  }
}

/** One piece of a belt drag: what to place there, or skip to leave what stands. */
export interface DragPiece {
  type: string;
  x: number;
  y: number;
  dir: Dir;
  skip: boolean;
}

/** Machines, miners and collectors can be paused; nothing else honours the flag. */
export function isPausable(type: string): boolean {
  const k = BUILDINGS[type]?.kind;
  return k === 'machine' || k === 'miner' || k === 'collector';
}

/** Is a revealed open tile next to (straight on) an open tile still in the dark? Its cavern was only half lit. */
function darkBeside(L: LayerState, x: number, y: number): boolean {
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
    const j = ny * L.w + nx;
    const t = L.terrain[j];
    if ((t === T_FLOOR || t === T_WATER || t === T_MAGMA) && !L.revealed[j]) return true;
  }
  return false;
}

/** Add n of an item to a refund, as depot goods (hot items cool, unstable ones are lost). */
function addBack(back: Record<string, number>, id: string, n = 1): void {
  const k = depotItem(id);
  if (k) back[k] = (back[k] ?? 0) + n;
}

/** Tiles a survey reveals around its centre. */
export const SURVEY_RADIUS = 12;

/** Rushing a ghost costs 3x the shipping value of its missing goods. */
export function rushPrice(item: string, n: number): number {
  return Math.max(1, Math.round(ITEMS[item].value * 3 * n));
}

/** The Precision Assembler's distance from hot ground. */
export const STEADY_GROUND = 8;

/** A ghost waits this long (ticks) on an item nobody delivers before Mags speaks up, and not again sooner than this. */
const STARVE_WAIT = 60 * 60;
const STARVE_REPEAT = 180 * 60;

export { MILESTONES };
