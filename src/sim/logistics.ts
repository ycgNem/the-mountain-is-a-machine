// Belts and every other 1x1 logistics node, plus how items enter any building.
//
// A slot node holds one item that travels from the edge it entered (inDir) to the center and out
// toward outDir (prog 0 -> 0.5 -> 1). Nodes update downstream first so a packed line moves together,
// and an item never passes the progress of the item in the node ahead of it (one tile of spacing).

import { BUILDINGS, type BuildingKind } from '../data/buildings';
import { ITEMS } from '../data/items';
import { ASSAYS, PROJECTS } from '../data/progression';
import { FUELS, RECIPES, recipesFor } from '../data/recipes';
import { ENGINE_SEQUENCE, NODE_ITEM_TIME, WAKING_SEQUENCE } from '../data/layers';
import { inBay, lowerDepotFull, noteStationOut } from './elevator';
import type { Game } from './game';
import { STOCK_CAP } from './game';
import { onAssaySample, onChuteSale, onNodeHeartstone, onProjectItem, onProjectSurplus, onSale } from './progress';
import { DIR_NAME, DX, DY, TICK, leftOf, opp, rightOf, type Building, type Dir, type Item, type JamWhy } from './types';

const SLOT_KINDS: BuildingKind[] = ['belt', 'splitter', 'crossing', 'sorter', 'unloader', 'crate', 'sequencer'];

export function isSlot(kind: BuildingKind): boolean {
  return SLOT_KINDS.includes(kind);
}

export const OUT_CAP = 4;
export const BAY_CAP_PER_CAB = 2;
/** A Combustion Generator holds up to this many of each fuel. */
export const GEN_FUEL_CAP = 4;

/** Heat lost per second on a normal / insulated belt ("10x slower"). */
export const HEAT_LOSS = 10;
export const HEAT_LOSS_INSULATED = 1;
/** A molten ingot below this heat has cooled for good. */
export const HOT_MIN = 50;

/** What a hot item becomes when it cools, or when it goes into anything that isn't a machine or a belt. */
function cooled(item: Item): Item {
  return ITEMS[item.id]?.hot ? { id: 'cold_ember_ingot', heat: 0 } : item;
}

/**
 * What an item becomes when it goes back into a depot (refunds): hot items cool at once, unstable
 * ones are lost (null).
 */
export function depotItem(id: string): string | null {
  const d = ITEMS[id];
  if (d?.unstable) return null;
  return d?.hot ? 'cold_ember_ingot' : id;
}

/**
 * Put one good into a layer's depot stock, where it counts as delivered (the starved-ghost warning
 * hears it come in). False when the depot already holds STOCK_CAP of it. With `dry`, only checks.
 */
function toDepot(g: Game, layer: number, id: string, dry: boolean): boolean {
  const L = g.layer(layer);
  if ((L.stock[id] ?? 0) >= STOCK_CAP) return false;
  if (dry) return true;
  L.stock[id] = (L.stock[id] ?? 0) + 1;
  g.s.stats.delivered[id] = (g.s.stats.delivered[id] ?? 0) + 1;
  g.noteIn(layer, id);
  return true;
}

/** What a good counts as at a Drill or the Heart: molten ingots only while hot and only for D5; anything else hot cools on the way in. */
function projectGood(project: string, item: Item): Item {
  return item.id === 'hot_ember_ingot' && PROJECTS[project].needs.hot_ember_ingot ? item : cooled(item);
}

/**
 * Why a Drill or the Heart refuses a good: not a need of its layer's open project ('wrong'), or a
 * need it has all of while the depot holds STOCK_CAP of the extra ('full'). Null when it takes it.
 */
export function projectRefusal(g: Game, t: Building, item: Item): 'wrong' | 'full' | null {
  const p = g.s.project;
  if (!p || PROJECTS[p.id].layer !== t.layer) return 'wrong';
  const it = projectGood(p.id, item);
  const need = PROJECTS[p.id].needs[it.id] ?? 0;
  if (!need) return 'wrong';
  if ((p.delivered[it.id] ?? 0) < need) return null;
  const back = depotItem(it.id);
  return back && (g.layer(t.layer).stock[back] ?? 0) >= STOCK_CAP ? 'full' : null;
}

/** Is this engine node the Waking Node (takes Batteries and Resonant Cores)? */
export function nodeSequence(b: Building): string[] {
  return b.recipe === 'waking' ? WAKING_SEQUENCE : ENGINE_SEQUENCE;
}

// ------------------------------------------------------------------ ordering

export function rebuildOrder(g: Game, layer: number): void {
  const nodes: Building[] = [];
  const movers: number[] = [];
  for (const b of g.s.buildings.values()) {
    if (b.layer !== layer || b.planned) continue;
    const k = BUILDINGS[b.type].kind;
    if (isSlot(k)) nodes.push(b);
    else movers.push(b.id);
  }
  // Iterative DFS post-order on "feeds into" edges: downstream nodes come first.
  const visited = new Set<number>();
  const order: number[] = [];
  for (const start of nodes) {
    if (visited.has(start.id)) continue;
    const stack: { b: Building; next: Building[]; i: number }[] = [{ b: start, next: downstream(g, start), i: 0 }];
    visited.add(start.id);
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i < top.next.length) {
        const n = top.next[top.i++];
        if (!visited.has(n.id)) {
          visited.add(n.id);
          stack.push({ b: n, next: downstream(g, n), i: 0 });
        }
      } else {
        order.push(top.b.id);
        stack.pop();
      }
    }
  }
  g.order[layer] = order;
  movers.sort((a, b) => a - b);
  g.movers[layer] = movers;
  g.dirty[layer] = false;
}

function downstream(g: Game, b: Building): Building[] {
  const k = BUILDINGS[b.type].kind;
  let dirs: Dir[];
  if (k === 'splitter') dirs = [b.dir, leftOf(b.dir), rightOf(b.dir)];
  else if (k === 'sorter') dirs = [b.dir, leftOf(b.dir)];
  else if (k === 'crossing') dirs = [0, 1, 2, 3];
  else dirs = [b.dir];
  const out: Building[] = [];
  for (const d of dirs) {
    const n = g.at(b.layer, b.x + DX[d], b.y + DY[d]);
    if (n && !n.planned && isSlot(BUILDINGS[n.type].kind)) out.push(n);
  }
  return out;
}

// ------------------------------------------------------------------ helpers

/**
 * The one cell a machine pushes its main output into: just outside its front face, at the
 * front-right tile for even sizes (2x2) and the front-centre tile for odd sizes (3x3).
 */
export function outputPort(b: Building): { x: number; y: number } {
  const size = BUILDINGS[b.type].size;
  const cells = edgeCells(b.x, b.y, size, b.dir);
  if (size % 2 === 1) return cells[(size - 1) / 2];
  return cells[b.dir === 0 || b.dir === 1 ? size - 1 : 0];
}

/** The cell a machine pushes its byproduct into: outside its left face, at the front-most tile. */
export function sidePort(b: Building): { x: number; y: number } {
  const size = BUILDINGS[b.type].size;
  const cells = edgeCells(b.x, b.y, size, leftOf(b.dir));
  return cells[b.dir === 0 || b.dir === 3 ? 0 : size - 1];
}

/**
 * Does building `f` push items into the cell (x, y), travelling `travel`? A belt, Unloader, Crate or
 * Sequencer along its facing; a Splitter out of its front and both sides, a Sorter out of its front
 * and left; a Crossing straight on along either axis; a machine, miner, collector, station or Engine
 * Node out of its output port, and a machine with a byproduct (or a node, for wrong items) out of its
 * side port. Ghosts count: they push once built.
 */
export function pushesInto(f: Building, x: number, y: number, travel: Dir): boolean {
  const k = BUILDINGS[f.type].kind;
  if (isSlot(k)) {
    if (f.x + DX[travel] !== x || f.y + DY[travel] !== y) return false;
    if (k === 'crossing') return true;
    if (k === 'splitter') return travel === f.dir || travel === leftOf(f.dir) || travel === rightOf(f.dir);
    if (k === 'sorter') return travel === f.dir || travel === leftOf(f.dir);
    return travel === f.dir;
  }
  if (k !== 'machine' && k !== 'miner' && k !== 'collector' && k !== 'elevator' && k !== 'engine_node') return false;
  const p = outputPort(f);
  if (travel === f.dir && p.x === x && p.y === y) return true;
  const side = k === 'engine_node' || (k === 'machine' && (f.sideBuf.length > 0 || !!(f.recipe && RECIPES[f.recipe]?.side)));
  if (!side || travel !== leftOf(f.dir)) return false;
  const q = sidePort(f);
  return q.x === x && q.y === y;
}

/** Cells just outside the front face, and the travel direction into them. */
export function frontCells(b: Building): { x: number; y: number }[] {
  const size = BUILDINGS[b.type].size;
  return edgeCells(b.x, b.y, size, b.dir);
}

export function edgeCells(x: number, y: number, size: number, d: Dir): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < size; k++) {
    if (d === 0) out.push({ x: x + k, y: y - 1 });
    else if (d === 1) out.push({ x: x + size, y: y + k });
    else if (d === 2) out.push({ x: x + k, y: y + size });
    else out.push({ x: x - 1, y: y + k });
  }
  return out;
}

/** Where along its path an item in this slot sits, in tile units relative to the tile's top-left. */
export function slotPos(b: Building, second = false): { x: number; y: number } {
  const prog = second ? b.prog2 : b.prog;
  const inDir = second ? b.inDir2 : b.inDir;
  const outDir = second ? b.inDir2 : b.outDir;
  if (prog < 0.5) {
    const t = prog - 0.5;
    return { x: 0.5 + DX[inDir] * t, y: 0.5 + DY[inDir] * t };
  }
  const t = prog - 0.5;
  return { x: 0.5 + DX[outDir] * t, y: 0.5 + DY[outDir] * t };
}

/** The item in `t` that an item travelling `travel` would queue behind. */
function itemAhead(t: Building, travel: Dir): { item: Item | null; prog: number; inDir: Dir } {
  const k = BUILDINGS[t.type].kind;
  if (k === 'crossing') return travel % 2 === 0 ? { item: t.item, prog: t.prog, inDir: t.inDir } : { item: t.item2, prog: t.prog2, inDir: t.inDir2 };
  return { item: t.item, prog: t.prog, inDir: t.inDir };
}

/**
 * How far an item travelling `travel` toward slot node `t` may advance (0..1). An item only queues
 * behind one that entered on the same path; one that came in from another side doesn't block it.
 */
function spacingCap(t: Building | null, travel: Dir): number {
  if (!t || t.planned || !isSlot(BUILDINGS[t.type].kind)) return 1;
  const a = itemAhead(t, travel);
  if (a.item && a.inDir === travel) return Math.min(1, a.prog);
  return 1;
}

/**
 * Is there an item waiting in the building that feeds `t` from travel direction `cand`? A machine,
 * miner, station or node only feeds the one cell it pushes into: its output port (main output) or its
 * side port (byproduct), so a belt merely passing its face never waits for it.
 */
function feederWaiting(g: Game, t: Building, cand: Dir): boolean {
  const fx = t.x - DX[cand];
  const fy = t.y - DY[cand];
  const f = g.at(t.layer, fx, fy);
  if (!f || f.planned || f.id === t.id) return false;
  const k = BUILDINGS[f.type].kind;
  if (isSlot(k)) {
    if (k === 'crossing') {
      if (cand % 2 === 0) return !!f.item && f.prog >= 1 && f.inDir === cand;
      return !!f.item2 && f.prog2 >= 1 && f.inDir2 === cand;
    }
    return !!f.item && f.prog >= 1 && f.outDir === cand;
  }
  if (cand === f.dir) {
    const p = outputPort(f);
    if (p.x !== t.x || p.y !== t.y) return false;
    if (k === 'elevator') {
      const sh = g.s.shafts[f.shaft];
      return !!sh && sh.arr[f.end].length > 0;
    }
    return f.outBuf.length > 0;
  }
  if (cand === leftOf(f.dir) && k !== 'elevator') {
    const p = sidePort(f);
    return p.x === t.x && p.y === t.y && f.sideBuf.length > 0;
  }
  return false;
}

/** Valid travel directions into a slot node, in a fixed order for round-robin fairness. */
function inputDirs(t: Building, k: BuildingKind): Dir[] {
  switch (k) {
    case 'belt':
      return [t.dir, rightOf(t.dir), leftOf(t.dir)];
    case 'splitter':
    case 'sorter':
      return [t.dir];
    case 'sequencer':
      return [rightOf(t.dir), leftOf(t.dir)];
    case 'crate':
      return [t.dir, rightOf(t.dir), leftOf(t.dir)];
    default:
      return [];
  }
}

function fairTurn(g: Game, t: Building, k: BuildingKind, travel: Dir): boolean {
  const dirs = inputDirs(t, k);
  if (dirs.length < 2) return true;
  const last = t.rr % dirs.length;
  for (let n = 1; n <= dirs.length; n++) {
    const cand = dirs[(last + n) % dirs.length];
    if (cand === travel) return true;
    if (feederWaiting(g, t, cand)) return false;
  }
  return true;
}

// ------------------------------------------------------------------ insertion

/**
 * Try to move `item` into building `t`, travelling in direction `travel`.
 * With `dry`, only reports whether it would be accepted.
 */
export function insert(g: Game, t: Building, item: Item, travel: Dir, dry = false): boolean {
  if (t.planned) return false;
  const def = BUILDINGS[t.type];
  const k = def.kind;
  const idef = ITEMS[item.id];

  if (isSlot(k)) {
    if (idef?.unstable) {
      // Overcharged crystals shatter the moment they touch a belt.
      if (dry) return insert(g, t, { id: 'crystal_grit', heat: 0 }, travel, true);
      const ok = insert(g, t, { id: 'crystal_grit', heat: 0 }, travel, false);
      if (ok) {
        g.s.stats.events.shattered = (g.s.stats.events.shattered ?? 0) + 1;
        g.emit({ t: 'shatter', layer: t.layer, x: t.x, y: t.y });
      }
      return ok;
    }
    switch (k) {
      case 'belt': {
        if (t.item || travel === opp(t.dir)) return false;
        if (!fairTurn(g, t, k, travel)) return false;
        if (dry) return true;
        t.item = item;
        t.prog = 0;
        t.inDir = travel;
        t.outDir = t.dir;
        t.rr = inputDirs(t, k).indexOf(travel);
        return true;
      }
      case 'splitter': {
        if (t.item || travel !== t.dir) return false;
        if (dry) return true;
        t.item = item;
        t.prog = 0;
        t.inDir = travel;
        t.outDir = t.dir;
        return true;
      }
      case 'sorter': {
        if (t.item || travel !== t.dir) return false;
        if (dry) return true;
        t.item = item;
        t.prog = 0;
        t.inDir = travel;
        t.outDir = t.filter && item.id === t.filter ? leftOf(t.dir) : t.dir;
        return true;
      }
      case 'crossing': {
        if (travel % 2 === 0) {
          if (t.item) return false;
          if (dry) return true;
          t.item = item;
          t.prog = 0;
          t.inDir = travel;
          t.outDir = travel;
        } else {
          if (t.item2) return false;
          if (dry) return true;
          t.item2 = item;
          t.prog2 = 0;
          t.inDir2 = travel;
        }
        return true;
      }
      case 'sequencer': {
        if (t.item) return false;
        const want = t.seqPos === 0 ? rightOf(t.dir) : leftOf(t.dir);
        if (travel !== want) return false;
        if (dry) return true;
        t.item = item;
        t.prog = 0;
        t.inDir = travel;
        t.outDir = t.dir;
        t.seqPos ^= 1;
        return true;
      }
      case 'crate': {
        if (travel === opp(t.dir)) return false;
        const id = cooled(item).id;
        if (t.stockItem && t.stockItem !== id) return false;
        if (t.stockCount >= 100) return false;
        if (dry) return true;
        t.stockItem = id;
        t.stockCount++;
        return true;
      }
      case 'unloader':
        return false;
    }
    return false;
  }

  switch (k) {
    case 'machine':
      return insertMachine(g, t, item, travel, dry);
    case 'generator': {
      if (!FUELS[item.id]) return false;
      if ((t.inBuf[item.id] ?? 0) >= GEN_FUEL_CAP) return false;
      if (dry) return true;
      t.inBuf[item.id] = (t.inBuf[item.id] ?? 0) + 1;
      return true;
    }
    case 'depot': {
      if (idef?.unstable) return false;
      return toDepot(g, t.layer, cooled(item).id, dry);
    }
    case 'terminal': {
      if (idef?.unstable) return false;
      if (dry) return true;
      onSale(g, t, cooled(item));
      return true;
    }
    case 'chute': {
      // A pure sink: it takes goods from any side, its facing means nothing.
      if (idef?.unstable) return false;
      if (dry) return true;
      onChuteSale(g, t, cooled(item));
      return true;
    }
    case 'drill':
    case 'heart': {
      const p = g.s.project;
      if (!p || PROJECTS[p.id].layer !== t.layer) return false;
      const it = projectGood(p.id, item);
      const need = PROJECTS[p.id].needs[it.id] ?? 0;
      if (!need) return false;
      if ((p.delivered[it.id] ?? 0) < need) {
        if (dry) return true;
        onProjectItem(g, t, it);
        return true;
      }
      // It has all of this good: the crew stacks the extra by the layer's depot (a hot good cools, an
      // unstable one is lost), so a trunk shared by several goods never stops behind a spare. A depot
      // already holding STOCK_CAP of it refuses, and the belt shows the Drill or Heart jammed.
      const back = depotItem(it.id);
      if (back && !toDepot(g, t.layer, back, true)) return false;
      if (dry) return true;
      if (back) toDepot(g, t.layer, back, false);
      onProjectSurplus(g, t, it);
      return true;
    }
    case 'lab': {
      const a = ASSAYS[item.id];
      if (!a || !a.lab || g.s.assaysDone.includes(a.id)) return false;
      if (dry) return true;
      onAssaySample(g, t, item);
      return true;
    }
    case 'elevator': {
      if (travel === opp(t.dir)) return false;
      const sh = g.s.shafts[t.shaft];
      if (!sh) return false;
      const cap = shaftCab(sh.tier) * BAY_CAP_PER_CAB;
      if (sh.bay[t.end].length >= cap) return false;
      if (idef?.unstable) return false;
      const it = cooled(item);
      // Down: the lower depot holds 999 of it, counting what is on its way, so only this belt backs up.
      if (t.end === 0 && lowerDepotFull(g, sh, it.id, inBay(sh, 0, it.id))) return false;
      if (dry) return true;
      sh.bay[t.end].push(it);
      return true;
    }
    case 'engine_node': {
      // Two items strictly alternating, 2 s each; four make a Heartstone. Anything else, or the right
      // item out of turn, comes out of the side and the sequence keeps its place.
      if (travel === opp(t.dir)) return false;
      if (idef?.unstable) return false;
      const seq = nodeSequence(t);
      if (t.craft > 0) return false;
      if (t.outBuf.length >= OUT_CAP || t.sideBuf.length >= OUT_CAP) return false;
      if (dry) return true;
      t.workT = 0;
      if (item.id === seq[t.seqPos]) {
        t.craft = NODE_ITEM_TIME;
        t.seqPos++;
        if (t.seqPos >= seq.length) {
          t.seqPos = 0;
          t.outBuf.push({ id: 'heartstone', heat: 0 });
          g.s.stats.produced.heartstone = (g.s.stats.produced.heartstone ?? 0) + 1;
          onNodeHeartstone(g, t);
        }
      } else {
        t.sideBuf.push(cooled(item));
        g.s.stats.events.node_reject = (g.s.stats.events.node_reject ?? 0) + 1;
      }
      return true;
    }
  }
  return false;
}

function insertMachine(g: Game, t: Building, item: Item, travel: Dir, dry: boolean): boolean {
  if (travel === opp(t.dir)) return false;
  let recipe = t.recipe ? RECIPES[t.recipe] : null;
  if (!recipe) {
    // Pick a recipe from the first item that fits exactly one (or the first listed).
    const options = recipesFor(t.type).filter((r) => g.recipeUnlocked(r.id) && r.inputs[item.id]);
    if (!options.length) return false;
    if (dry) return true;
    t.recipe = options[0].id;
    recipe = options[0];
  }
  const need = recipe.inputs[item.id];
  if (!need) return false;
  const cap = Math.max(need * 2, 4);
  if ((t.inBuf[item.id] ?? 0) >= cap) return false;
  if (dry) return true;
  t.inBuf[item.id] = (t.inBuf[item.id] ?? 0) + 1;
  return true;
}

/** Cab capacity per elevator tier (Mk1 45/min, Mk2 90/min, Mk3 180/min with the travel times). */
export function shaftCab(tier: number): number {
  return [6, 9, 15][tier] ?? 6;
}

// ------------------------------------------------------------------ the tick

export function tickLogistics(g: Game, layer: number): void {
  const order = g.order[layer];
  for (let i = 0; i < order.length; i++) {
    const b = g.s.buildings.get(order[i]);
    if (!b || b.planned) continue;
    const def = BUILDINGS[b.type];
    const k = def.kind;
    if (k === 'crossing') {
      moveCrossing(g, b, def.speed ?? 1.5);
      continue;
    }
    if (k === 'unloader' && !b.item && b.filter) pullUnloader(g, b);
    if (k === 'crate' && !b.item && b.stockCount > 0 && b.stockItem) {
      b.item = { id: b.stockItem, heat: 0 };
      b.prog = 0;
      b.inDir = b.dir;
      b.outDir = b.dir;
      if (--b.stockCount <= 0) b.stockItem = null;
    }
    if (!b.item) continue;
    moveSlot(g, b, def.speed ?? 1.5, !!def.insulated);
  }
  // Machines, miners, stations and nodes push their output.
  const movers = g.movers[layer];
  for (let i = 0; i < movers.length; i++) {
    const b = g.s.buildings.get(movers[i]);
    if (!b || b.planned) continue;
    pushOutputs(g, b);
  }
}

function cool(g: Game, b: Building, item: Item, insulated: boolean): Item {
  if (!ITEMS[item.id]?.hot) return item;
  item.heat -= (insulated ? HEAT_LOSS_INSULATED : HEAT_LOSS) * TICK;
  if (item.heat < HOT_MIN) {
    g.s.stats.events.cooled = (g.s.stats.events.cooled ?? 0) + 1;
    return cooled(item);
  }
  return item;
}

function moveSlot(g: Game, b: Building, speed: number, insulated: boolean): void {
  const item = cool(g, b, b.item!, insulated);
  b.item = item;
  const k = BUILDINGS[b.type].kind;
  if (k === 'splitter' && b.prog < 0.5 && b.prog + speed * TICK >= 0.5) b.outDir = pickSplitterExit(g, b, item);
  const target = g.at(b.layer, b.x + DX[b.outDir], b.y + DY[b.outDir]);
  const cap = spacingCap(target, b.outDir);
  const np = Math.min(cap, b.prog + speed * TICK);
  if (np > b.prog) b.prog = np;
  if (b.prog < 1) return;
  if (target && insert(g, target, item, b.outDir)) {
    b.item = null;
    b.prog = 0;
    b.workT = 0;
    if (k === 'splitter') b.rr = (b.rr + 1) % 3;
    return;
  }
  if (target && k !== 'splitter' && JAM_KINDS.includes(BUILDINGS[target.type].kind)) noteJam(g, b, target, item, b.outDir);
  if (k === 'splitter') {
    // Blocked: re-route to any exit that takes it now.
    const exits: Dir[] = [b.dir, leftOf(b.dir), rightOf(b.dir)];
    for (const d of exits) {
      if (d === b.outDir) continue;
      const t2 = g.at(b.layer, b.x + DX[d], b.y + DY[d]);
      if (t2 && insert(g, t2, item, d)) {
        b.item = null;
        b.prog = 0;
        b.outDir = d;
        return;
      }
    }
  }
}

/** Buildings that say "jammed" when a belt holds something they won't take, and belts facing a belt head-on. */
const JAM_KINDS: BuildingKind[] = ['machine', 'drill', 'heart', 'elevator', 'belt'];

/**
 * Slot piece `from` is stuck against `t`. Remember it on `t` when `t` will never take the item from
 * there: a machine that never uses it ('wrong') or whose front it is ('front'); a Drill or the Heart
 * that never takes it, or can't stack the extra because the depot is full (projectRefusal); an
 * elevator station whose front it is, the face arrivals come out of ('front'). A station's side face
 * that is only full for now (its bay, the depot below, an unstable item) is no jam, and its refusals
 * never go through the recipe lookup. Two belts whose heads push into each other are both marked
 * ('headon'); a belt merely backed up behind another is not.
 */
function noteJam(g: Game, from: Building, t: Building, item: Item, travel: Dir): void {
  const kind = BUILDINGS[t.type].kind;
  if (kind === 'belt') {
    if (t.planned || BUILDINGS[from.type].kind !== 'belt' || t.dir !== opp(travel)) return;
    markJam(g, from, item.id, 'headon');
    markJam(g, t, item.id, 'headon');
    return;
  }
  let why: JamWhy | null = null;
  if (kind === 'drill' || kind === 'heart') why = projectRefusal(g, t, item);
  else if (kind === 'elevator') {
    if (travel !== opp(t.dir)) return;
    why = 'front';
  } else if (travel === opp(t.dir)) why = 'front';
  else {
    const r = t.recipe ? RECIPES[t.recipe] : null;
    const takes = r ? !!r.inputs[item.id] : recipesFor(t.type).some((x) => g.recipeUnlocked(x.id) && x.inputs[item.id]);
    if (!takes) why = 'wrong';
  }
  if (why) markJam(g, t, item.id, why);
}

function markJam(g: Game, t: Building, item: string, why: JamWhy): void {
  t.jam = item;
  t.jamWhy = why;
  t.jamT = g.s.tick;
}

function pickSplitterExit(g: Game, b: Building, item: Item): Dir {
  const exits: Dir[] = [b.dir, leftOf(b.dir), rightOf(b.dir)];
  for (let n = 0; n < 3; n++) {
    const d = exits[(b.rr + n) % 3];
    const t = g.at(b.layer, b.x + DX[d], b.y + DY[d]);
    if (!t || t.planned) continue;
    if (insert(g, t, item, d, true) || (isSlot(BUILDINGS[t.type].kind) && itemAhead(t, d).item)) {
      b.rr = (b.rr + n) % 3;
      return d;
    }
  }
  return b.dir;
}

function moveCrossing(g: Game, b: Building, speed: number): void {
  // Vertical slot.
  if (b.item) {
    b.item = cool(g, b, b.item, false);
    const d = b.inDir;
    const t = g.at(b.layer, b.x + DX[d], b.y + DY[d]);
    const cap = spacingCap(t, d);
    const np = Math.min(cap, b.prog + speed * TICK);
    if (np > b.prog) b.prog = np;
    if (b.prog >= 1 && t && insert(g, t, b.item, d)) {
      b.item = null;
      b.prog = 0;
    }
  }
  if (b.item2) {
    b.item2 = cool(g, b, b.item2, false);
    const d = b.inDir2;
    const t = g.at(b.layer, b.x + DX[d], b.y + DY[d]);
    const cap = spacingCap(t, d);
    const np = Math.min(cap, b.prog2 + speed * TICK);
    if (np > b.prog2) b.prog2 = np;
    if (b.prog2 >= 1 && t && insert(g, t, b.item2, d)) {
      b.item2 = null;
      b.prog2 = 0;
    }
  }
}

function pullUnloader(g: Game, b: Building): void {
  const src = g.at(b.layer, b.x - DX[b.dir], b.y - DY[b.dir]);
  if (!src || src.planned || !b.filter) return;
  const k = BUILDINGS[src.type].kind;
  const f = b.filter;
  let got = false;
  if (k === 'depot') {
    // Planned buildings are paid first: an Unloader leaves the depot what the layer's queued ghosts hold.
    const L = g.layer(b.layer);
    if ((L.stock[f] ?? 0) > (g.ghostHolds(b.layer)[f] ?? 0)) {
      L.stock[f]--;
      got = true;
      g.noteOut(b.layer, f);
    }
  } else if (k === 'crate') {
    if (src.stockItem === f && src.stockCount > 0) {
      if (--src.stockCount <= 0) src.stockItem = null;
      got = true;
    }
  } else if (k === 'elevator') {
    const sh = g.s.shafts[src.shaft];
    const arr = sh?.arr[src.end];
    const idx = arr ? arr.findIndex((it) => it.id === f) : -1;
    if (arr && idx >= 0) {
      arr.splice(idx, 1);
      got = true;
      // Taken from the shaft's arrivals before they reach the depot (the starved-ghost warning names it).
      g.noteOut(b.layer, f);
    }
  }
  if (got) {
    b.item = { id: f, heat: 0 };
    b.prog = 0;
    b.inDir = b.dir;
    b.outDir = b.dir;
  }
}

function pushOutputs(g: Game, b: Building): void {
  const k = BUILDINGS[b.type].kind;
  if (k === 'elevator') {
    const sh = g.s.shafts[b.shaft];
    if (!sh) return;
    const arr = sh.arr[b.end];
    if (!arr.length) {
      noteStationOut(g, sh, b.end);
      return;
    }
    // The lower station hands the depot the first arrival it takes, so a full item can't block the
    // requested goods behind it. The top station keeps arrival order: its port may feed a sorter.
    const out = b.end === 1 ? pushAny(g, b, arr, b.dir, outputPort(b)) : pushFrom(g, b, arr, b.dir, [outputPort(b)]);
    if (out) noteStationOut(g, sh, b.end);
    return;
  }
  if (b.outBuf.length) pushFrom(g, b, b.outBuf, b.dir, [outputPort(b)]);
  if (b.sideBuf.length) pushFrom(g, b, b.sideBuf, leftOf(b.dir), [sidePort(b)]);
}

function pushFrom(g: Game, b: Building, buf: Item[], travel: Dir, cells: { x: number; y: number }[]): boolean {
  const n = cells.length;
  for (let k = 0; k < n; k++) {
    const c = cells[(b.outRR + k) % n];
    const t = g.at(b.layer, c.x, c.y);
    if (!t || t.id === b.id) continue;
    if (insert(g, t, buf[0], travel)) {
      buf.shift();
      b.outRR = (b.outRR + k + 1) % n;
      return true;
    }
  }
  return false;
}

/** Push the first item in `buf` that the building at `cell` takes (one a tick). */
function pushAny(g: Game, b: Building, buf: Item[], travel: Dir, cell: { x: number; y: number }): boolean {
  const t = g.at(b.layer, cell.x, cell.y);
  if (!t || t.id === b.id) return false;
  for (let i = 0; i < buf.length; i++) {
    if (insert(g, t, buf[i], travel)) {
      buf.splice(i, 1);
      return true;
    }
  }
  return false;
}

/** The Unloaders on a layer set to pull `item` out of its depot (the HQ on the Surface). */
export function depotUnloaders(g: Game, layer: number, item: string): Building[] {
  const out: Building[] = [];
  for (const b of g.s.buildings.values()) {
    if (b.layer !== layer || b.planned || b.filter !== item || BUILDINGS[b.type].kind !== 'unloader') continue;
    const src = g.at(layer, b.x - DX[b.dir], b.y - DY[b.dir]);
    if (src && !src.planned && BUILDINGS[src.type].kind === 'depot') out.push(b);
  }
  return out;
}

/** The generator at `port` when the next item in `buf` is a fuel it already holds GEN_FUEL_CAP of. */
function fullGeneratorAt(g: Game, b: Building, buf: Item[], port: { x: number; y: number }): Building | null {
  const fuel = buf[0]?.id;
  if (!fuel || !FUELS[fuel]) return null;
  const t = g.at(b.layer, port.x, port.y);
  if (!t || t.planned || BUILDINGS[t.type].kind !== 'generator') return null;
  return (t.inBuf[fuel] ?? 0) >= GEN_FUEL_CAP ? t : null;
}

/**
 * Is this building's output held up only by full Combustion Generators? Each of its full buffers
 * (main output, byproduct) pushes straight into a generator holding all of that fuel it can. A
 * generator burns only what its layer needs, so the building is waiting for demand, not faulted: it
 * shows Idle, not Output blocked (the crew's coal rig on a layer that draws little power).
 */
export function waitsOnGenerator(g: Game, b: Building): boolean {
  const out = b.outBuf.length >= OUT_CAP;
  const side = b.sideBuf.length >= OUT_CAP;
  if (!out && !side) return false;
  return (!out || !!fullGeneratorAt(g, b, b.outBuf, outputPort(b))) && (!side || !!fullGeneratorAt(g, b, b.sideBuf, sidePort(b)));
}

/** A generator this building pushes fuel straight into that holds all of that fuel it can (for the inspector). */
export function fullGenerator(g: Game, b: Building): Building | null {
  return fullGeneratorAt(g, b, b.outBuf, outputPort(b)) ?? fullGeneratorAt(g, b, b.sideBuf, sidePort(b));
}

/**
 * Why an Engine Node stopped taking items: four Heartstones waiting at its front (belt them away), or
 * four wrong items in its side chute, which opens on the `sideFace` compass face.
 */
export function nodeJam(b: Building): { outFull: boolean; sideFull: boolean; sideFace: string } {
  return { outFull: b.outBuf.length >= OUT_CAP, sideFull: b.sideBuf.length >= OUT_CAP, sideFace: DIR_NAME[leftOf(b.dir)] };
}
