// A scripted "competent player" for pacing tests. It only uses player actions, with real costs:
// place (a planned ghost when the depot is short), remove, rotate, set a recipe or a filter, pause,
// "Build next", look at the Drill, switch layers, set depot requests the way the depot inspector
// does, upgrade the Company Line or an elevator, dig and survey, buy licenses, take contracts, and
// rush a ghost (only to get out of a deadlock). It ticks the sim at 60 Hz and reacts the way a
// player would.
//
// It acts on any open layer: `layer` is the focus (the layer on screen) and every placement method
// also takes a layer. Its watchers run every game second over every open layer: stalls (three
// minutes without milestone or drill progress), deadlocks (three minutes with ghosts waiting and none
// built), jams (a wrong item stuck at a machine, Drill or node, cleared by hand after a minute), ghost
// shortfalls, per-minute snapshots, and the start states' stand-ins for earlier acts' factories
// (supply, income). It reads what the game says (messages and toasts) every second, and lays belt
// lanes the way a drag does: Crossings first, the lane held back until the depot can pay for them.
//
// tests/play/ holds the rest: find.ts (map finders), route.ts (belt router and dig paths), start.ts
// (act start states), act1.ts (the Act I script) and report.ts (summaries).

import { BUILDINGS, LINE_UPGRADES } from '../src/data/buildings';
import { ITEMS } from '../src/data/items';
import { LAYERS } from '../src/data/layers';
import { ASSAYS, MILESTONES, PROJECTS } from '../src/data/progression';
import { FUELS, RECIPES } from '../src/data/recipes';
import { REQUEST_MAX, REQUEST_STEP, isRequestable, requestMissing, requestableItems, shaftTraffic, upgradeElevator, upgradeQuote } from '../src/sim/elevator';
import { Game, STOCK_CAP } from '../src/sim/game';
import { BAY_CAP_PER_CAB, nodeSequence, projectRefusal, shaftCab } from '../src/sim/logistics';
import { ORE_LIST } from '../src/sim/mapgen';
import { acceptContract, nodeAwake, rerollContracts, stepProgress } from '../src/sim/progress';
import { DX, DY, T_FLOOR, T_HARD, T_MAGMA, T_ROCK, T_WATER, type Building, type Dir, type GameEvent, type Item } from '../src/sim/types';
import { depot, inputCells, isFree, known, outputOf, type Cell } from './play/find';
import { blockedCells, digRoute, route, type RouteEnd, type RouteOpts, type RoutePiece } from './play/route';

export const N: Dir = 0;
export const E: Dir = 1;
export const S: Dir = 2;
export const W: Dir = 3;

export function mmss(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface Phase {
  name: string;
  when: (bot: Bot) => boolean;
  act: (bot: Bot) => void;
  done?: boolean;
}

export interface Watcher {
  name: string;
  /** Runs every game second; return true once it never needs to run again. */
  check: (bot: Bot) => boolean | void;
  done?: boolean;
}

export interface PutOpts {
  recipe?: string;
  filter?: string;
  name?: string;
  /** Place on this layer instead of the focus layer. */
  layer?: number;
}

/** A placement the game refused (a swap the depot can't pay for in full), retried every second. */
interface Pending {
  type: string;
  layer: number;
  x: number;
  y: number;
  dir: Dir;
  opts: PutOpts;
  since: number;
  reason: string;
  /** Its entry in `refusals` once a run ended with it still waiting. */
  reported?: { what: string; from: number; to: number; reason: string };
}

/**
 * A belt lane Bot.lay holds back because the depot can't pay yet to swap in its Crossings over working
 * belts: none of its pieces is down, so it can't feed the lines it crosses. Laid in full, Crossings
 * first, once the depot can pay for every one (retried every second).
 */
export interface WaitingLane {
  pieces: RoutePiece[];
  layer: number;
  type: string;
  since: number;
  /** What the depot lacked at the last try. */
  short: Record<string, number>;
  /** Its entry in `refusals` once a run ended with it still waiting. */
  reported?: { what: string; from: number; to: number; reason: string };
}

/**
 * Mags's advice in a starved-ghost warning (Game.starveMessage, Game.takenMessage), read back from
 * what she says:
 * - request: "Request it so the elevator brings it"; raise: "Its request is already met: raise it";
 * - spare: "<the depot above> has none to spare: stock it up there"; full: "The elevator is full of
 *   other requests"; elevator: "nothing has come down for a minute: check the elevator";
 * - make: "Make it down here (<machine>: <inputs>)", or on the Surface "Make some and belt it into the
 *   HQ"; deeper: "Only a deeper layer makes it";
 * - unloaders: "<depot> gets <Item>, but Unloaders take it as it comes in".
 * The warning opens "<depot> is out of <Item>", or with some in stock "<depot> has 3 <Item>; your
 * planned <building> needs 4".
 */
export interface StarveAdvice {
  /** The depot's layer (0: the HQ). */
  layer: number;
  item: string;
  advice: 'request' | 'raise' | 'spare' | 'full' | 'elevator' | 'make' | 'deeper' | 'unloaders';
}

const ITEM_BY_NAME = new Map(Object.values(ITEMS).map((it) => [it.name, it.id]));

/** Why a lane waited (its `refusals` entry). */
const LANE_WAIT = 'Not enough goods to swap its Crossings in';

/** A waiting lane in the report: where it starts, its length and Crossings. */
function laneName(w: WaitingLane): string {
  const p = w.pieces[0];
  return `${w.pieces.length}-tile lane from ${p.x},${p.y}${w.layer ? ` on L${w.layer}` : ''} (${w.pieces.filter((q) => q.type === 'crossing').length} crossing(s))`;
}

/** What a Mags message advises about a starved ghost, or null when it is no such warning. */
export function starveAdvice(text: string): StarveAdvice | null {
  const m = /^(?:The HQ|(.+?) depot) (?:is out of (.+?)(?: and none is coming in\.|;)|has \d+ (.+?); your planned |gets (.+?), but Unloaders take it as it comes in\.)/.exec(text);
  if (!m) return null;
  const layer = m[1] === undefined ? 0 : LAYERS.findIndex((L) => L.name === m[1]);
  const item = ITEM_BY_NAME.get(m[2] ?? m[3] ?? m[4] ?? '');
  if (layer < 0 || !item) return null;
  let advice: StarveAdvice['advice'];
  if (m[4] !== undefined) advice = 'unloaders';
  else if (/Only a deeper layer makes it/.test(text)) advice = 'deeper';
  else if (/Make it down here|Make some and belt it into the HQ/.test(text)) advice = 'make';
  else if (/Request it so the elevator brings it/.test(text)) advice = 'request';
  else if (/raise it so the elevator brings more/.test(text)) advice = 'raise';
  else if (/has none to spare/.test(text)) advice = 'spare';
  else if (/The elevator is full of other requests/.test(text)) advice = 'full';
  else if (/nothing has come down for a minute/.test(text)) advice = 'elevator';
  else return null;
  return { layer, item, advice };
}

/** Per-layer watcher state. */
interface LayerWatch {
  prevGhosts: Set<number>;
  /** Index of this layer's open deadlock in `deadlocks`, or -1. */
  deadlock: number;
  lastBuiltAt: number;
  oldestId: number;
  lackStock: Record<string, number>;
  lackGainAt: number;
  lastRushAt: number;
  peak: number;
  peakAt: number;
  satSum: number;
  satN: number;
}

/** A stand-in for an earlier act's factory: goods added upstream every second (see Bot.supply). */
export interface SupplyLine {
  layer: number;
  item: string;
  perMin: number;
  via: 'depot' | 'station';
  /** Items added so far, and items the full depot or bay couldn't take (the factory backed up). */
  added: number;
  blocked: number;
  acc: number;
}

/** Where a belt line starts: a building's output (see find.outputOf), or a cell and the way items enter it. */
export type Source = Building | { x: number; y: number; feed?: Dir };

export interface ConnectOpts extends RouteOpts {
  layer?: number;
  /** Belt type to lay (default 'belt'; 'insulated_belt' or 'express_belt' once unlocked). Crossings stay Crossings. */
  type?: string;
  /** Start from the source machine's side port (byproducts: resin, slag) instead of its output port. */
  side?: boolean;
}

/** Map letters (lowercase = planned ghost; belts are arrows, ghost belts 'o'). */
const LETTER: Record<string, string> = {
  miner: 'M', smelter: 'S', press: 'P', assembler: 'A', hq: 'H', terminal: 'T', drill: 'D', elevator: 'E',
  splitter: 'Y', crossing: '+', sorter: '%', crate: 'C', depot: 'H', lamp: '*',
  foundry: 'F', generator: 'G', washer: 'W', separator: 'Z', harvester: 'V', spore_collector: 'O', cutter: 'K', crusher: 'R',
  charger: 'B', overcharger: 'Q', stabilizer: 'N', cooling_bath: 'I', assay_lab: 'L', unloader: 'U', chute: 'J', shield_wall: '|',
  pressure_forge: '1', precision_assembler: '2', thermal_extractor: '3', attuner: '4', resonance_tap: '5', spore_filter: '6',
  engine_node: '7', heart: '8', sequencer: '9',
};
export const MAP_LEGEND =
  'belts ^>v< (o ghost belt), lowercase = ghost; M miner S smelter P press A assembler F foundry G generator W washer Z separator ' +
  'V harvester O spore collector K cutter R crusher B charger Q overcharger N stabilizer I cooling bath L assay lab U unloader J chute ' +
  'C crate Y splitter + crossing % sorter * lamp | shield wall 1 forge 2 precision assembler 3 thermal extractor 4 attuner 5 tap ' +
  '6 spore filter 7 engine node 8 heart 9 sequencer H depot/HQ T terminal D drill E elevator; terrain . floor # rock X hard ~ water ' +
  "= magma : ore ; stone _ foundation ` dormant conduit ' awake conduit, blank = unknown (dark, not surveyed)";

export class Bot {
  readonly g: Game;
  /** The focus layer (the layer on screen): what put/drag/del/at/... act on unless given a layer. */
  layer: number;
  /** The act being played and the game time it started (start.ts sets both). */
  act = 1;
  t0 = 0;
  log: string[] = [];
  msTimes: Record<number, number> = {};
  projectTimes: Record<string, number> = {};
  firstSaleAt = -1;
  firstBuildAt = -1;
  money: { t: number; money: number; income: number }[] = [];
  /** Goods bought by rushing ghosts, by item. */
  rushedGoods: Record<string, number> = {};
  /** Every rushed ghost: when, where, what it lacked and the price. */
  rushes: { t: number; layer: number; type: string; x: number; y: number; missing: Record<string, number>; price: number }[] = [];
  rushSpent = 0;
  /**
   * Swaps the game refused because the depot couldn't pay in full, and lanes Bot.lay held back until
   * it could pay for their Crossings: how long until they went in (-1: never).
   */
  refusals: { what: string; from: number; to: number; reason: string }[] = [];
  /** Three minutes without milestone or drill progress (to = -1 while it lasts). */
  stuck: { from: number; to: number; why: string }[] = [];
  /**
   * Three minutes in which no ghost got built on a layer and its depot gained none of what the oldest
   * ghost lacks: nothing changes there without the player.
   */
  deadlocks: { layer: number; from: number; to: number; why: string; end?: string }[] = [];
  /** Belts whose front item the machine (or drill, node, lab) ahead can never take, cleared by hand after a minute. */
  jams: { t: number; layer: number; x: number; y: number; item: string; into: string; since: number }[] = [];
  /** Per-minute snapshots for finding bottlenecks. */
  snapshots: string[] = [];
  /** Things the bot relied on that the game's text never tells a player (deduplicated). */
  friction: string[] = [];
  /**
   * What the game told the player, read from g.events every second (never drained): Mags's and the
   * Board's messages (milestone intros, starved-ghost advice, ...) and toasts. Not logged; actDetails prints them.
   */
  messages: { t: number; who: string; text: string }[] = [];
  /**
   * Extras each drill project (the Drill or the Heart) took after a need was met and stacked in its
   * layer's depot, by project and good (the project's own `surplus`, copied every second while it is open).
   */
  surplus: Record<string, Record<string, number>> = {};
  phases: Phase[] = [];
  watchers: Watcher[] = [];
  named: Record<string, number> = {};
  placedAt: Record<string, number> = {};
  pending: Pending[] = [];
  /** Lanes waiting for the depot to pay for their Crossings (see lay). */
  waitingLanes: WaitingLane[] = [];
  /** Stand-ins for earlier acts' factories (start.ts). */
  supplies: SupplyLine[] = [];
  /** Money a minute from earlier acts' sales (start.ts), paid every second. */
  incomePerMin = 0;
  /** Buy the next Company Line upgrade as soon as it's affordable (Act I behaviour). */
  autoLine = true;
  /** In a deadlock, rush the waiting ghosts oldest first while the money lasts. */
  autoRush = true;
  /** Clear jammed belts by hand after a minute. */
  autoClearJams = true;
  /** Items listed in each layer's per-minute snapshot (default: its requests and its drill project). */
  watchItems: Record<number, string[]> = {};

  private builtSeen = new Set<string>();
  private saleSeen = false;
  /** The last game event read (readEvents finds it again by identity). */
  private lastEvent: GameEvent | null = null;
  private lastScore = -1;
  private lastScoreAt = 0;
  private stallIdx = -1;
  private stuckWhy = '';
  private stallGhostsBuilt = 0;
  private watch = new Map<number, LayerWatch>();
  private jamSeen = new Map<string, number>();
  /** Stats every 10 game seconds, the last 10 minutes (for perMin). */
  private rateLog: { t: number; produced: Record<string, number>; sold: Record<string, number>; delivered: Record<string, number> }[] = [];

  constructor(g: Game, layer = 0) {
    this.g = g;
    this.layer = layer;
    for (const li of this.openLayers()) this.lw(li);
    // What was done before the bot took over (a start state) is not news: it shows as time -1.
    for (const n of g.s.msDone) this.msTimes[n] = -1;
    for (const p of g.s.projectsDone) this.projectTimes[p] = -1;
    this.saleSeen = !!g.s.stats.events.first_sale;
  }

  get t(): number {
    return this.g.s.time;
  }

  /** Seconds since the act started. */
  get actTime(): number {
    return this.t - this.t0;
  }

  note(msg: string): void {
    this.log.push(`${mmss(this.t)}  ${msg}`);
  }

  /** Record something the bot relied on that the UI never tells a player (once per message). */
  noteFriction(msg: string): void {
    if (this.friction.includes(msg)) return;
    this.friction.push(msg);
    this.note(`FRICTION: ${msg}`);
  }

  openLayers(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.g.s.layers.length; i++) if (this.g.s.layers[i].open) out.push(i);
    return out;
  }

  /** Switch the view to a layer (it counts as a visit, as in the app) and make it the focus. */
  focus(layer: number): void {
    if (!this.g.layer(layer).open) throw new Error(`[${mmss(this.t)}] layer ${layer} is not open`);
    this.layer = layer;
    if (!this.g.s.visited.includes(layer)) {
      this.g.s.visited.push(layer);
      this.note(`went down to ${LAYERS[layer].name}`);
    }
  }

  stock(item: string, layer = this.layer): number {
    return this.g.layer(layer).stock[item] ?? 0;
  }

  // ------------------------------------------------------------------ placing

  /** Place or throw. A placement the depot can't pay for yet becomes a planned ghost (allowed). */
  put(type: string, x: number, y: number, dir: Dir, opts: PutOpts = {}): Building {
    const layer = opts.layer ?? this.layer;
    if (BUILDINGS[type]?.kind === 'foundation') throw new Error('Foundations are floors, not buildings: use bot.foundation(x, y) or bot.foundations(x, y, size)');
    const chk = this.g.canPlace(type, layer, x, y, dir);
    if (!chk.ok) throw new Error(`[${mmss(this.t)}] can't place ${type} at ${x},${y}${layer ? ` on L${layer}` : ''}: ${chk.reason}`);
    const b = this.g.place(type, layer, x, y, dir, { recipe: opts.recipe ?? null, filter: opts.filter ?? null });
    if (!b) throw new Error(`[${mmss(this.t)}] place ${type} at ${x},${y}${layer ? ` on L${layer}` : ''} returned null`);
    if (opts.recipe && b.recipe !== opts.recipe) throw new Error(`${type} at ${x},${y} has recipe ${b.recipe}, wanted ${opts.recipe}`);
    if (!b.planned && this.firstBuildAt < 0) this.firstBuildAt = this.t;
    if (opts.name) {
      this.named[opts.name] = b.id;
      this.placedAt[opts.name] = this.t;
      // Paid on the spot: never a ghost, so no "built after waiting" note.
      if (!b.planned) this.builtSeen.add(opts.name);
      else this.builtSeen.delete(opts.name);
    }
    return b;
  }

  /**
   * Lay a Foundation: a floor, not a building (Game.place returns null for it), so put() can't. It is
   * paid on the spot (2 Aggregate) or not laid at all: a foundation is never a ghost. True if it went down.
   */
  foundation(x: number, y: number, layer = this.layer): boolean {
    const chk = this.g.canPlace('foundation', layer, x, y, N);
    if (!chk.ok || chk.planned) {
      this.note(`can't lay a foundation at ${x},${y} on L${layer}: ${chk.ok ? `short ${JSON.stringify(chk.missing)}` : chk.reason}`);
      return false;
    }
    this.g.place('foundation', layer, x, y, N);
    const L = this.g.layer(layer);
    return !!L.foundation[y * L.w + x];
  }

  /** Foundations under a size x size footprint (where a machine will stand). Returns how many went down. */
  foundations(x: number, y: number, size: number, layer = this.layer): number {
    let n = 0;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (this.foundation(x + dx, y + dy, layer)) n++;
    return n;
  }

  /** The remove tool dragged over a rectangle: every building in it comes up, its goods back in the depot. */
  clearRect(x0: number, y0: number, x1: number, y1: number, layer = this.layer): number {
    let n = 0;
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const b = this.g.at(layer, x, y);
        if (b && this.g.remove(layer, x, y)) n++;
      }
    }
    if (n) this.note(`removed ${n} building(s) in ${x0},${y0}..${x1},${y1}${layer ? ` on L${layer}` : ''}`);
    return n;
  }

  /** put(), or null (with the reason in the log) where the game refuses the placement. */
  tryPut(type: string, x: number, y: number, dir: Dir, opts: PutOpts = {}): Building | null {
    const layer = opts.layer ?? this.layer;
    const chk = this.g.canPlace(type, layer, x, y, dir);
    if (!chk.ok) {
      this.note(`can't place ${type} at ${x},${y}${layer ? ` on L${layer}` : ''}: ${chk.reason}`);
      return null;
    }
    return this.put(type, x, y, dir, opts);
  }

  /**
   * Swap a piece onto a working belt. The game refuses a swap the depot can't pay for in full (a
   * ghost there would cut the line), so a refused swap is retried every second, like a player
   * clicking again until the goods are in.
   */
  swap(type: string, x: number, y: number, dir: Dir, opts: PutOpts = {}): Building | null {
    const layer = opts.layer ?? this.layer;
    const chk = this.g.canPlace(type, layer, x, y, dir);
    if (chk.ok) return this.put(type, x, y, dir, opts);
    if (chk.reason !== 'Not enough goods to swap this in') throw new Error(`[${mmss(this.t)}] can't swap ${type} in at ${x},${y}${layer ? ` on L${layer}` : ''}: ${chk.reason}`);
    this.note(`REFUSED: ${type} at ${x},${y}${layer ? ` on L${layer}` : ''} (${chk.reason}: ${JSON.stringify(chk.missing ?? {})} short); trying again every second`);
    this.pending.push({ type, layer, x, y, dir, opts, since: this.t, reason: chk.reason });
    return null;
  }

  private retryPending(): void {
    for (const p of [...this.pending]) {
      const chk = this.g.canPlace(p.type, p.layer, p.x, p.y, p.dir);
      if (!chk.ok) continue;
      this.put(p.type, p.x, p.y, p.dir, { ...p.opts, layer: p.layer });
      this.pending.splice(this.pending.indexOf(p), 1);
      if (p.reported) p.reported.to = this.t;
      else this.refusals.push({ what: `${p.type} at ${p.x},${p.y}`, from: p.since, to: this.t, reason: p.reason });
      this.note(`swapped in ${p.type} at ${p.x},${p.y} after ${Math.round(this.t - p.since)} s of refusals`);
    }
  }

  /** A straight run of belts from (x0, y0) to (x1, y1), all facing `dir`. */
  run(x0: number, y0: number, x1: number, y1: number, dir: Dir, layer = this.layer): void {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) this.put('belt', x0 + dx * k, y0 + dy * k, dir, { layer });
  }

  /**
   * Drag a belt line the way the UI does (Game.planDrag): a crossing where it passes over a working
   * belt, and belts at its ends left alone. Pieces the depot can't pay for yet become ghosts.
   */
  drag(x0: number, y0: number, x1: number, y1: number, dir: Dir, layer = this.layer, type = 'belt'): string[] {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const pieces: { x: number; y: number; dir: Dir }[] = [];
    for (let k = 0; k <= n; k++) pieces.push({ x: x0 + dx * k, y: y0 + dy * k, dir });
    const laid: string[] = [];
    for (const p of this.g.planDrag(layer, type, pieces)) {
      if (p.skip) continue;
      if (!this.g.canPlace(p.type, layer, p.x, p.y, p.dir).ok) {
        this.note(`drag: ${p.type} at ${p.x},${p.y} REFUSED`);
        continue;
      }
      this.g.place(p.type, layer, p.x, p.y, p.dir);
      if (p.type !== type) laid.push(`${p.type} at ${p.x},${p.y}`);
    }
    return laid;
  }

  del(x: number, y: number, layer = this.layer): void {
    if (!this.g.remove(layer, x, y)) throw new Error(`[${mmss(this.t)}] nothing to remove at ${x},${y}${layer ? ` on L${layer}` : ''}`);
  }

  at(x: number, y: number, layer = this.layer): Building {
    const b = this.g.at(layer, x, y);
    if (!b) throw new Error(`[${mmss(this.t)}] no building at ${x},${y}${layer ? ` on L${layer}` : ''}`);
    return b;
  }

  get(name: string): Building {
    const b = this.g.s.buildings.get(this.named[name]);
    if (!b) throw new Error(`no building named ${name}`);
    return b;
  }

  /** Name a building that's already standing (the starter line, Mags's copper Miner, a rig). */
  adopt(name: string, x: number, y: number, type: string, layer = this.layer): Building {
    const b = this.at(x, y, layer);
    if (b.type !== type) throw new Error(`[${mmss(this.t)}] expected a ${type} at ${x},${y}, found a ${b.type}`);
    this.named[name] = b.id;
    this.placedAt[name] = this.t;
    if (!b.planned) this.builtSeen.add(name);
    return b;
  }

  turn(x: number, y: number, dir: Dir, layer = this.layer): void {
    this.g.rotate(this.at(x, y, layer).id, dir);
  }

  recipe(b: Building, id: string): void {
    this.g.setRecipe(b.id, id);
    if (b.recipe !== id) throw new Error(`[${mmss(this.t)}] could not set ${b.type} to ${id}`);
  }

  /** Set a sorter's or unloader's item (the inspector's filter picker). */
  filter(b: Building, item: string | null): void {
    this.g.setFilter(b.id, item);
  }

  pause(b: Building, paused = true): void {
    this.g.setPaused(b.id, paused);
  }

  /** "Build next": move a planned ghost to the front of its depot's queue. */
  buildNext(b: Building): void {
    this.g.buildNext(b.id);
  }

  /** Rush a ghost on purpose (the deadlock watcher rushes by itself). Records it like the watcher does. */
  rush(b: Building): boolean {
    const q = this.g.rushQuote(b.id);
    if (!q || !this.g.rush(b.id)) return false;
    for (const [k, v] of Object.entries(q.missing)) this.rushedGoods[k] = (this.rushedGoods[k] ?? 0) + v;
    this.rushes.push({ t: this.t, layer: b.layer, type: b.type, x: b.x, y: b.y, missing: q.missing, price: q.price });
    this.rushSpent += q.price;
    this.note(`rushed the ${b.type} ghost at ${b.x},${b.y} for $${q.price} (lacked ${JSON.stringify(q.missing)})`);
    return true;
  }

  /** What the app does when the player clicks the Drill: it shows the project and counts as a look. */
  inspectDrill(): void {
    if (this.g.s.stats.events.drill_inspected) return;
    this.g.s.stats.events.drill_inspected = 1;
    this.note('clicked the Drill');
  }

  ghosts(layer = this.layer): Building[] {
    return [...this.g.s.buildings.values()].filter((b) => b.planned && b.layer === layer);
  }

  /** Goods a layer's ghosts still need beyond what its depot holds. */
  ghostShortfall(layer = this.layer): Record<string, number> {
    const need: Record<string, number> = {};
    for (const b of this.ghosts(layer)) for (const [k, v] of Object.entries(BUILDINGS[b.type].cost)) need[k] = (need[k] ?? 0) + v;
    const L = this.g.layer(layer);
    const short: Record<string, number> = {};
    for (const [k, v] of Object.entries(need)) if ((L.stock[k] ?? 0) < v) short[k] = v - (L.stock[k] ?? 0);
    return short;
  }

  delivered(item: string): number {
    return this.g.s.project?.delivered[item] ?? 0;
  }

  /**
   * Items a minute of `item` over about the last `seconds` (up to 10 minutes): made anywhere
   * ('produced', default), sold at the Terminal or a Chute ('sold'), or belted into depots
   * ('delivered'). Sampled every 10 game seconds.
   */
  perMin(item: string, seconds = 60, kind: 'produced' | 'sold' | 'delivered' = 'produced'): number {
    let base = this.rateLog[0];
    for (let i = this.rateLog.length - 1; i >= 0; i--) {
      if (this.t - this.rateLog[i].t >= seconds - 1e-6) {
        base = this.rateLog[i];
        break;
      }
    }
    if (!base || this.t - base.t <= 0) return 0;
    return (((this.g.s.stats[kind][item] ?? 0) - (base[kind][item] ?? 0)) * 60) / (this.t - base.t);
  }

  needs(item: string): number {
    const p = this.g.s.project;
    return p ? (PROJECTS[p.id].needs[item] ?? 0) : 0;
  }

  // ------------------------------------------------------------------ belts by route

  /** The cheapest belt path from `start` to one of `ends` (or into a building), or null. See play/route.ts. */
  route(start: Cell, to: RouteEnd[] | Building, opts: RouteOpts & { layer?: number } = {}): RoutePiece[] | null {
    const layer = opts.layer ?? (Array.isArray(to) ? this.layer : to.layer);
    return route(this.g, layer, start, Array.isArray(to) ? to : inputCells(this.g, to), opts);
  }

  /**
   * Lay a route the way a belt drag does (Game.placeDrag): its Crossings first, so the depot pays for
   * them before the plain belts, then the belts (ghosts if the depot is short). A Crossing over a
   * working belt can't wait as a ghost (the game refuses the swap), and a lane laid around an unswapped
   * cell would feed the line it should cross. So while the depot can't pay for every such swap, the
   * whole lane waits (nothing of it goes down) and is laid in full once it can (retried every second).
   * True when it went down now, false when it waits (waitingLanes).
   */
  lay(pieces: RoutePiece[], opts: { layer?: number; type?: string } = {}): boolean {
    const layer = opts.layer ?? this.layer;
    const type = opts.type ?? 'belt';
    const short = this.crossingsShort(pieces, layer);
    if (short) {
      this.waitingLanes.push({ pieces, layer, type, since: this.t, short });
      this.note(
        `WAITING: the ${pieces.length}-tile lane from ${pieces[0].x},${pieces[0].y}${layer ? ` on L${layer}` : ''} can't swap in its ` +
          `${pieces.filter((p) => p.type === 'crossing').length} Crossing(s) yet (${JSON.stringify(short)} short); laying it once the depot can pay`,
      );
      return false;
    }
    this.layNow(pieces, layer, type);
    return true;
  }

  /**
   * What the depot lacks to swap in every Crossing of a lane that replaces a working belt, all at once
   * (each swap refunds the belt it replaces, less goods a Rush paid for), or null when it can pay. A
   * Crossing on an empty cell or over a ghost may wait as a ghost; one already there stays.
   */
  private crossingsShort(pieces: RoutePiece[], layer: number): Record<string, number> | null {
    const L = this.g.layer(layer);
    const net: Record<string, number> = {};
    for (const p of pieces) {
      if (p.type !== 'crossing') continue;
      const o = this.g.at(layer, p.x, p.y);
      if (!o || o.planned || o.type === 'crossing') continue;
      for (const [k, v] of Object.entries(BUILDINGS[o.type].cost)) net[k] = (net[k] ?? 0) + v - (o.rushed?.[k] ?? 0);
      for (const [k, v] of Object.entries(BUILDINGS.crossing.cost)) net[k] = (net[k] ?? 0) - v;
    }
    const short: Record<string, number> = {};
    for (const [k, v] of Object.entries(net)) if ((L.stock[k] ?? 0) + v < 0) short[k] = -((L.stock[k] ?? 0) + v);
    return Object.keys(short).length ? short : null;
  }

  /** Put a lane down: Crossings first (one already standing stays), then the belts. */
  private layNow(pieces: RoutePiece[], layer: number, type: string): void {
    for (const p of pieces) if (p.type === 'crossing' && this.g.at(layer, p.x, p.y)?.type !== 'crossing') this.put('crossing', p.x, p.y, p.dir, { layer });
    for (const p of pieces) if (p.type !== 'crossing') this.put(type, p.x, p.y, p.dir, { layer });
  }

  private retryLanes(): void {
    for (const w of [...this.waitingLanes]) {
      const short = this.crossingsShort(w.pieces, w.layer);
      if (short) {
        w.short = short;
        continue;
      }
      this.waitingLanes.splice(this.waitingLanes.indexOf(w), 1);
      this.layNow(w.pieces, w.layer, w.type);
      const what = laneName(w);
      if (w.reported) w.reported.to = this.t;
      else this.refusals.push({ what, from: w.since, to: this.t, reason: LANE_WAIT });
      this.note(`laid the ${what} after waiting ${Math.round(this.t - w.since)} s for its Crossings`);
    }
  }

  /**
   * Belt `src`'s output into `dst`: from a machine's, miner's, station's or node's output port (its
   * side port with `side`), the tile ahead of a belt end or unloader, or a raw cell, to any face of
   * `dst` that takes items (or one of the given ends). Lays the cheapest route with lay (a lane that
   * crosses a working belt may wait for its Crossings) and returns it (empty when the output port
   * already touches `dst`). Throws when there is no way through.
   */
  connect(src: Source, dst: Building | RouteEnd[], opts: ConnectOpts = {}): RoutePiece[] {
    const isB = (v: Source): v is Building => 'type' in v;
    const layer = opts.layer ?? (isB(src) ? src.layer : Array.isArray(dst) ? this.layer : dst.layer);
    const start = isB(src) ? outputOf(src, opts.side) : { x: src.x, y: src.y, feed: src.feed };
    if (!Array.isArray(dst) && this.g.at(layer, start.x, start.y)?.id === dst.id) return [];
    const ends = Array.isArray(dst) ? dst : inputCells(this.g, dst);
    const pieces = route(this.g, layer, start, ends, { ...opts, feed: start.feed });
    const what = (v: Source | Building | RouteEnd[]) => (Array.isArray(v) ? `${v.length} end cells` : 'type' in v ? `${v.type} at ${v.x},${v.y}` : `${v.x},${v.y}`);
    if (!pieces) throw new Error(`[${mmss(this.t)}] no belt route on L${layer} from ${what(src)} (port ${start.x},${start.y}) to ${what(dst)}`);
    const now = this.lay(pieces, { layer, type: opts.type });
    const xs = pieces.filter((p) => p.type === 'crossing').length;
    this.note(`belted ${what(src)} into ${what(dst)}${layer ? ` on L${layer}` : ''}: ${pieces.length} tiles${xs ? `, ${xs} crossing(s)` : ''}${now ? '' : ' (waiting for its Crossings)'}`);
    return pieces;
  }

  /**
   * An Unloader pulling `item` out of a depot (default: this layer's), crate or station, on a face
   * with a free tile ahead of it (east first: the column east of every depot is kept open). Returns
   * it and the cell its items go to (start a route there with feed = its facing).
   */
  unload(item: string, opts: { layer?: number; from?: Building; face?: Dir; near?: Cell } = {}): { unloader: Building; out: { x: number; y: number; feed: Dir } } {
    const layer = opts.layer ?? opts.from?.layer ?? this.layer;
    const src = opts.from ?? depot(this.g, layer);
    const size = BUILDINGS[src.type].size;
    const blocked = blockedCells(this.g, layer);
    const L = this.g.layer(layer);
    const cands: { x: number; y: number; dir: Dir; d: number }[] = [];
    const faces: Dir[] = opts.face !== undefined ? [opts.face] : [E, S, N, W];
    faces.forEach((f, fi) => {
      for (let k = 0; k < size; k++) {
        const c = f === N ? { x: src.x + k, y: src.y - 1 } : f === E ? { x: src.x + size, y: src.y + k } : f === S ? { x: src.x + k, y: src.y + size } : { x: src.x - 1, y: src.y + k };
        const o = { x: c.x + DX[f], y: c.y + DY[f] };
        if (!isFree(this.g, layer, c.x, c.y) || !isFree(this.g, layer, o.x, o.y)) continue;
        if (blocked.has(c.y * L.w + c.x) || blocked.has(o.y * L.w + o.x)) continue;
        const d = opts.near ? Math.hypot(o.x - opts.near.x, o.y - opts.near.y) : fi * 10 + k;
        cands.push({ ...c, dir: f, d });
      }
    });
    cands.sort((a, b) => a.d - b.d);
    const c = cands[0];
    if (!c) throw new Error(`[${mmss(this.t)}] no free face to unload ${item} from the ${src.type} at ${src.x},${src.y} on L${layer}`);
    const u = this.put('unloader', c.x, c.y, c.dir, { layer, filter: item });
    this.note(`unloader for ${item} at ${c.x},${c.y}${layer ? ` on L${layer}` : ''}`);
    return { unloader: u, out: { x: c.x + DX[c.dir], y: c.y + DY[c.dir], feed: c.dir } };
  }

  // ------------------------------------------------------------------ depots, elevators, money

  /**
   * Set a depot's request row the way its inspector does: "Add" puts an item on the list at
   * REQUEST_ADD (20), then +/- move it by REQUEST_STEP (10) up to REQUEST_MAX (400), and x (0 here)
   * drops it. The Add row offers what the sim's requestableItems() lists: anything that neither
   * shatters nor cools and that the game has seen (made, delivered, or in any depot). On the HQ a row
   * is a "keep for the Surface" floor: the cab never takes the HQ below it. Returns false (and logs
   * it) when the Add row doesn't offer the item yet; throws on a value the inspector can't set.
   */
  request(item: string, n: number, layer = this.layer): boolean {
    if (!ITEMS[item]) throw new Error(`unknown item ${item}`);
    if (n !== 0 && (n < REQUEST_STEP || n > REQUEST_MAX || n % REQUEST_STEP !== 0)) {
      throw new Error(`request ${n} ${item}: the depot inspector keeps ${REQUEST_STEP} to ${REQUEST_MAX} in steps of ${REQUEST_STEP} (Add sets 20), or 0 to stop`);
    }
    const L = this.g.layer(layer);
    const was = L.requests[item];
    if (n === 0) {
      if (was !== undefined) {
        delete L.requests[item];
        this.note(`L${layer} depot: stopped requesting ${ITEMS[item].name}`);
      }
      return true;
    }
    if (was === undefined && !requestableItems(this.g, layer).includes(item)) {
      this.note(`can't add a request for ${ITEMS[item].name} on L${layer}: ${isRequestable(item) ? 'not on the Add row until the game has seen one' : 'it shatters or cools'}`);
      return false;
    }
    if (was === n) return true;
    L.requests[item] = n;
    this.note(`L${layer} ${layer ? 'depot' : 'HQ'}: keep ${n} ${ITEMS[item].name}${was !== undefined ? ` (was ${was})` : ''}`);
    return true;
  }

  /** A planned ghost's "Request the missing goods" button (underground): raises its depot's rows so the elevator brings what it lacks. */
  requestMissing(b: Building): Record<string, number> {
    const set = requestMissing(this.g, b.id);
    if (Object.keys(set).length) this.note(`requested the missing goods for the ${b.type} ghost at ${b.x},${b.y} on L${b.layer}: ${JSON.stringify(set)}`);
    return set;
  }

  /**
   * The elevator inspector's Upgrade button for the shaft whose lower station is on `toLayer`: money,
   * plus each good from the lower depot first and the rest from the depot above (the game's
   * upgradeQuote). False (and logged with what is short) when it can't pay or is already Mk3.
   */
  upgradeElevator(toLayer: number): boolean {
    const sh = this.g.s.shafts.find((q) => q.layers[1] === toLayer);
    if (!sh) throw new Error(`no shaft down to layer ${toLayer}`);
    const q = upgradeQuote(this.g, sh.id);
    if (!q) return false;
    if (!q.ok || !upgradeElevator(this.g, sh.id)) {
      const short = q.goods.filter((x) => !x.ok).map((x) => `${x.need - x.below - x.above} ${x.item}`);
      if (!q.moneyOk) short.push(`$${Math.round(q.money - this.g.s.money)}`);
      this.note(`can't upgrade the elevator to L${toLayer} to Mk${q.tier + 1} yet: short ${short.join(', ') || 'nothing'}`);
      return false;
    }
    const paid = q.goods.map((x) => `${x.need} ${x.item}${x.fromBelow ? ` (${x.fromBelow} from L${toLayer})` : ''}`).join(', ');
    this.note(`elevator to L${toLayer} upgraded to Mk${q.tier + 1}: $${q.money}, ${paid}`);
    return true;
  }

  /** Buy the next Company Line upgrade as soon as it's affordable. */
  upgradeLine(): void {
    const next = LINE_UPGRADES[this.g.s.lineLevel + 1];
    if (next && this.g.s.money >= next.price && this.g.upgradeLine()) this.note(`Company Line upgraded to ${next.kw} kW ($${next.price})`);
  }

  buyLicense(id: string): boolean {
    const ok = this.g.buyLicense(id);
    this.note(ok ? `bought the ${id} license` : `can't buy the ${id} license yet`);
    return ok;
  }

  /** Take contract offer i from the Terminal's board. */
  acceptContract(i: number): boolean {
    const o = this.g.s.contracts.offers[i];
    const ok = acceptContract(this.g, i);
    if (ok && o) this.note(`took a contract: ${o.count} ${o.item} for $${o.pay}`);
    return ok;
  }

  rerollContracts(): boolean {
    const ok = rerollContracts(this.g);
    if (ok) this.note('re-rolled the contract board');
    return ok;
  }

  // ------------------------------------------------------------------ digging and surveys

  /** Queue rock cells for excavation (the dig tool); returns how many were queued. */
  dig(cells: Cell[], layer = this.layer): number {
    const n = this.g.queueDig(layer, cells);
    if (n) this.note(`queued ${n} tiles to dig on L${layer} ($${n * this.g.digCost(layer)})`);
    return n;
  }

  /** The dig tool dragged over a rectangle. */
  digRect(x0: number, y0: number, x1: number, y1: number, layer = this.layer): number {
    const cells: Cell[] = [];
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cells.push({ x, y });
    return this.dig(cells, layer);
  }

  /**
   * Dig a tunnel toward `to` (a beacon, a surveyed deposit) from `from` (default: the layer's
   * arrival), the cheapest way through what a player can see: known floor is free, rock and dark
   * tiles cost a dig each. `width` 2 makes room for 2x2 machines along it. Returns the tiles queued
   * and their price; the queue runs at 15 tiles a second and stops if the money runs out.
   */
  digPath(to: Cell, opts: { from?: Cell; width?: 1 | 2; layer?: number } = {}): { tiles: number; cost: number } {
    const layer = opts.layer ?? this.layer;
    const a = LAYERS[layer].arrival;
    const d = depot(this.g, layer);
    const from = opts.from ?? (a ? { x: a.x, y: a.y } : { x: d.x + 1, y: d.y + 1 });
    const cells = digRoute(this.g, layer, from, to, opts.width ?? 1);
    if (!cells) throw new Error(`[${mmss(this.t)}] no way to dig from ${from.x},${from.y} to ${to.x},${to.y} on L${layer}`);
    // The bore site's beacon shows through the dark, and while the Governor is open so do the Heart's
    // and each sleeping Engine Node's; anything else a player sees only once surveyed.
    const beacons: Cell[] = [];
    if (LAYERS[layer].boreSite) beacons.push(LAYERS[layer].boreSite!);
    if (this.g.s.project?.id === 'governor') {
      for (const b of this.g.s.buildings.values()) {
        if (b.layer !== layer || !(b.type === 'heart' || (b.type === 'engine_node' && !nodeAwake(b)))) continue;
        const half = (BUILDINGS[b.type].size - 1) / 2;
        beacons.push({ x: b.x + half, y: b.y + half });
      }
    }
    const beacon = beacons.some((c) => Math.abs(to.x - c.x) <= 2 && Math.abs(to.y - c.y) <= 2);
    if (!beacon && !known(this.g, layer, to.x, to.y)) this.noteFriction(`dug toward ${to.x},${to.y} on L${layer}, which a player can't see yet (survey first)`);
    const n = this.g.queueDig(layer, cells);
    const cost = n * this.g.digCost(layer);
    this.note(`queued a ${n}-tile tunnel on L${layer} toward ${to.x},${to.y} ($${cost}${this.g.s.money < cost ? `; only $${Math.round(this.g.s.money)} in the bank` : ''})`);
    return { tiles: n, cost };
  }

  /** Wait (ticking, watchers on) until the layer's dig queue is empty. */
  waitDig(maxSeconds = 600, layer = this.layer): boolean {
    return this.waitFor(() => this.g.layer(layer).digQueue.length === 0, maxSeconds);
  }

  /** Survey at (x, y): deposits and caverns within 12 tiles show through the dark. */
  survey(x: number, y: number, layer = this.layer): boolean {
    const ok = this.g.survey(layer, x, y);
    this.note(ok ? `surveyed L${layer} at ${x},${y} ($${LAYERS[layer].surveyCost})` : `can't survey L${layer} at ${x},${y} ($${LAYERS[layer].surveyCost}, $${Math.round(this.g.s.money)} in the bank)`);
    return ok;
  }

  // ------------------------------------------------------------------ stand-ins for earlier acts

  /**
   * A stand-in for a factory built in an earlier act: every second it adds `perMin` / 60 of `item`
   * (fractions carry over) to `layer`'s depot (via 'depot', up to the 999 cap), or into the bay of
   * the station at `layer`'s bore site as belt cargo for the shaft down (via 'station', up to the
   * bay's two cabs). It only feeds layers above the act's own: goods reach the act by riding the
   * elevators, pulled by depot requests (depot) or carried as cargo (station). 'station' stands in
   * for a line belted straight into the shaft: its cargo lands in the next depot down unasked, and
   * what doesn't fit in the bay counts as `blocked`.
   */
  supply(layer: number, item: string, perMin: number, via: 'depot' | 'station' = 'depot'): SupplyLine {
    if (!ITEMS[item]) throw new Error(`unknown item ${item}`);
    if (this.act > 1 && layer >= this.act - 1) throw new Error(`supply goes into a layer above the act's own (layer ${this.act - 1}), not layer ${layer}`);
    if (via === 'station' && !this.g.s.shafts.some((q) => q.layers[0] === layer)) throw new Error(`no shaft down from layer ${layer} for a station supply`);
    const s: SupplyLine = { layer, item, perMin, via, added: 0, blocked: 0, acc: 0 };
    this.supplies.push(s);
    return s;
  }

  /** Money a minute from earlier acts' sales, paid every second (a stand-in, like supply). */
  income(perMin: number): void {
    this.incomePerMin = perMin;
  }

  private runSupplies(): void {
    for (const s of this.supplies) {
      if (s.perMin <= 0) continue;
      s.acc += s.perMin / 60;
      let n = Math.floor(s.acc + 1e-9);
      if (n <= 0) continue;
      s.acc -= n;
      if (s.via === 'station') {
        const sh = this.g.s.shafts.find((q) => q.layers[0] === s.layer);
        if (!sh) {
          s.blocked += n;
          continue;
        }
        const cap = shaftCab(sh.tier) * BAY_CAP_PER_CAB;
        while (n > 0 && sh.bay[0].length < cap) {
          sh.bay[0].push({ id: s.item, heat: 0 });
          n--;
          s.added++;
        }
        s.blocked += n;
      } else {
        const L = this.g.layer(s.layer);
        const k = Math.min(n, Math.max(0, STOCK_CAP - (L.stock[s.item] ?? 0)));
        if (k > 0) {
          L.stock[s.item] = (L.stock[s.item] ?? 0) + k;
          this.g.noteIn(s.layer, s.item);
        }
        s.added += k;
        s.blocked += n - k;
      }
    }
    if (this.incomePerMin > 0) this.g.earn(this.incomePerMin / 60);
  }

  // ------------------------------------------------------------------ watchers

  /** Something that only moves when the player is getting somewhere. */
  private score(): number {
    const s = this.g.s;
    let v = s.msDone.length * 1e6 + s.projectsDone.length * 1e7;
    const m = MILESTONES[s.milestone];
    if (m) for (const st of m.steps) v += stepProgress(this.g, st).cur;
    if (s.project) for (const n of Object.values(s.project.delivered)) v += n;
    return v;
  }

  private lw(li: number): LayerWatch {
    let w = this.watch.get(li);
    if (!w) {
      w = { prevGhosts: new Set(), deadlock: -1, lastBuiltAt: this.t, oldestId: -1, lackStock: {}, lackGainAt: this.t, lastRushAt: -999, peak: 0, peakAt: 0, satSum: 0, satN: 0 };
      this.watch.set(li, w);
    }
    return w;
  }

  /** Peak power demand on a layer, when it peaked, and the average satisfaction (per game second). */
  powerStats(layer = this.layer): { peak: number; peakAt: number; avgSat: number } {
    const w = this.lw(layer);
    return { peak: w.peak, peakAt: w.peakAt, avgSat: w.satSum / Math.max(1, w.satN) };
  }

  /**
   * The item at the front of the belt at (x, y) if the building that belt feeds can never take it
   * (not an input of its recipe, nothing the drill's project takes, out of a node's sequence, not a
   * fuel, a sample the lab is done with): only the player can clear it.
   */
  foreignItem(x: number, y: number, layer = this.layer): { item: string; target: Building } | null {
    const b = this.g.at(layer, x, y);
    if (!b || b.planned || !b.item || b.prog < 1 || BUILDINGS[b.type].kind !== 'belt') return null;
    const t = this.g.at(layer, x + DX[b.dir], y + DY[b.dir]);
    if (!t || t.planned || this.canUse(t, b.item)) return null;
    return { item: b.item.id, target: t };
  }

  /**
   * Could this building ever take the item? Machines: an input of their recipe. A Drill or the Heart:
   * any good its layer's open project needs, even once that need is met (the crew stacks the extra in
   * the depot), unless the depot already holds 999 of the extra; the game shows both refusals (a good
   * the project never takes, a full depot) as Jammed. Anything else: yes.
   */
  private canUse(t: Building, item: Item): boolean {
    const id = item.id;
    const kind = BUILDINGS[t.type].kind;
    if (kind === 'machine') return !t.recipe || !!RECIPES[t.recipe].inputs[id];
    if (kind === 'drill' || kind === 'heart') return projectRefusal(this.g, t, item) === null;
    if (kind === 'engine_node') return nodeSequence(t).includes(id);
    if (kind === 'generator') return !!FUELS[id];
    if (kind === 'lab') return !!ASSAYS[id]?.lab && !this.g.s.assaysDone.includes(id);
    return true;
  }

  /**
   * A player notices a machine that stopped behind a wrong item a minute ago and takes up the jammed
   * run by hand: the belt in front and every belt feeding it that holds something the machine can't
   * use (their items go to the depot), then lays the belts again.
   */
  private clearJams(layer: number): void {
    const seen = new Set<string>();
    for (const b of [...this.g.s.buildings.values()]) {
      if (b.layer !== layer || b.planned || BUILDINGS[b.type].kind !== 'belt') continue;
      const f = this.foreignItem(b.x, b.y, layer);
      if (!f) continue;
      const key = `${layer}:${b.x},${b.y},${f.item}`;
      seen.add(key);
      const since = this.jamSeen.get(key) ?? this.t;
      this.jamSeen.set(key, since);
      if (this.t - since < 60) continue;
      // Walk the belts that feed this one, up to 60 tiles back.
      const chain: Building[] = [b];
      for (let i = 0; i < chain.length && chain.length < 60; i++) {
        const c = chain[i];
        for (const d of [c.dir, ((c.dir + 1) % 4) as Dir, ((c.dir + 3) % 4) as Dir]) {
          const f2 = this.g.at(layer, c.x - DX[d], c.y - DY[d]);
          if (f2 && !f2.planned && BUILDINGS[f2.type].kind === 'belt' && f2.dir === d && !chain.includes(f2)) chain.push(f2);
        }
      }
      const wrong = chain.filter((c) => c.item && !this.canUse(f.target, c.item));
      for (const c of wrong) {
        const dir = c.dir;
        const type = c.type;
        this.del(c.x, c.y, layer);
        this.put(type, c.x, c.y, dir, { layer });
      }
      const into = BUILDINGS[f.target.type].name + (f.target.type === 'drill' ? '' : ` at ${f.target.x},${f.target.y}`);
      this.jams.push({ t: this.t, layer, x: b.x, y: b.y, item: f.item, into, since });
      this.note(`JAM cleared by hand: ${/^[aeiou]/.test(f.item) ? 'an' : 'a'} ${f.item} at ${b.x},${b.y}${layer ? ` on L${layer}` : ''} had stopped the ${into} since ${mmss(since)}; took up ${wrong.length} belt(s) holding wrong items`);
      seen.delete(key);
    }
    for (const k of [...this.jamSeen.keys()]) if (k.startsWith(`${layer}:`) && !seen.has(k)) this.jamSeen.delete(k);
  }

  /** In a deadlock, rush the layer's waiting ghosts, oldest first, while the money lasts. */
  private rushIfDeadlocked(layer: number): void {
    const w = this.lw(layer);
    if (w.deadlock < 0 || this.t - w.lastRushAt < 30) return;
    w.lastRushAt = this.t;
    let n = 0;
    let spent = 0;
    for (const gh of this.g.ghostQueue(layer)) {
      const q = this.g.rushQuote(gh.id);
      if (!q || this.g.s.money < q.price || !this.g.rush(gh.id)) break;
      for (const [k, v] of Object.entries(q.missing)) this.rushedGoods[k] = (this.rushedGoods[k] ?? 0) + v;
      this.rushes.push({ t: this.t, layer, type: gh.type, x: gh.x, y: gh.y, missing: q.missing, price: q.price });
      this.rushSpent += q.price;
      spent += q.price;
      n++;
      this.note(`rushed the ${gh.type} ghost at ${gh.x},${gh.y}${layer ? ` on L${layer}` : ''} for $${q.price} (lacked ${JSON.stringify(q.missing)})`);
    }
    if (n) this.deadlocks[w.deadlock].end = `rushed ${n} ghost(s) for $${spent}`;
    else this.note(`deadlocked and can't afford to rush the oldest ghost ($${Math.round(this.g.s.money)} in the bank)`);
  }

  private snapshot(open: number[]): void {
    const s = this.g.s;
    const p = s.project;
    for (const li of open) {
      const L = this.g.layer(li);
      if (li === 0) {
        this.snapshots.push(
          `${mmss(this.t)} M${MILESTONES[s.milestone]?.n ?? '-'} $${Math.round(s.money)} ghosts=${this.ghosts(0).length} short=${JSON.stringify(this.ghostShortfall(0))} ` +
            `HQ plate=${L.stock.iron_plate ?? 0} gear=${L.stock.gear ?? 0} wire=${L.stock.copper_wire ?? 0} brick=${L.stock.brick ?? 0} ` +
            `power ${L.power.demand}/${this.g.lineKw()} kW sat=${L.power.sat.toFixed(2)} drill=${p && PROJECTS[p.id].layer === 0 ? JSON.stringify(p.delivered) : '-'}`,
        );
        continue;
      }
      const items = this.watchItems[li] ?? [...new Set([...Object.keys(L.requests), ...(p && PROJECTS[p.id].layer === li ? Object.keys(PROJECTS[p.id].needs) : [])])];
      const pw = L.power;
      const status: Record<string, number> = {};
      for (const b of s.buildings.values()) {
        if (b.layer !== li || b.planned) continue;
        const k = BUILDINGS[b.type].kind;
        if (k !== 'machine' && k !== 'miner' && k !== 'collector') continue;
        status[b.status] = (status[b.status] ?? 0) + 1;
      }
      this.snapshots.push(
        `${mmss(this.t)} L${li} M${MILESTONES[s.milestone]?.n ?? '-'} $${Math.round(s.money)} ghosts=${this.ghosts(li).length} short=${JSON.stringify(this.ghostShortfall(li))} ` +
          `depot ${items.map((k) => `${k}=${L.stock[k] ?? 0}`).join(' ')} power ${pw.demand}/${Math.round(pw.demand + pw.net)} kW sat=${pw.sat.toFixed(2)} ` +
          `machines ${JSON.stringify(status)}${p && PROJECTS[p.id].layer === li ? ` drill=${JSON.stringify(p.delivered)}` : ''}`,
      );
    }
    if (s.shafts.length && open.length > 1) {
      const shafts = s.shafts.map((sh) => {
        const t = shaftTraffic(this.g, sh.id);
        return `L${sh.layers[0]}>L${sh.layers[1]} Mk${sh.tier + 1} down ${t.down}/${t.rate} (requested ${t.reqDown})${t.full ? ' FULL' : ''} up ${t.up} bay ${sh.bay[0].length}/${sh.bay[1].length} arr ${sh.arr[0].length}/${sh.arr[1].length}`;
      });
      this.snapshots.push(`${mmss(this.t)} shafts ${shafts.join(', ')}; ${s.stats.elevator} items moved`);
    }
  }

  /**
   * Read the game's new messages and toasts (g.events is left as it is: the app drains it, tests
   * don't). Game.emit keeps only the last 400 events, so once the buffer is full its length stops
   * growing: the bot finds the last event it read by identity and reads on after it (from the start
   * when that one fell off the buffer, or the buffer was drained).
   */
  private readEvents(): void {
    const ev = this.g.events;
    const from = this.lastEvent ? ev.lastIndexOf(this.lastEvent) + 1 : 0;
    for (let i = from; i < ev.length; i++) {
      const e = ev[i];
      if (e.t === 'message') this.messages.push({ t: this.t, who: e.who, text: e.text });
      else if (e.t === 'toast') this.messages.push({ t: this.t, who: `toast (${e.kind})`, text: e.text });
    }
    if (ev.length) this.lastEvent = ev[ev.length - 1];
  }

  private everySecond(): void {
    const s = this.g.s;
    this.readEvents();
    if (s.project?.surplus) this.surplus[s.project.id] = { ...s.project.surplus };
    this.runSupplies();
    if (!this.saleSeen && s.stats.events.first_sale) {
      this.saleSeen = true;
      this.firstSaleAt = this.t;
      this.note('first sale');
    }
    for (const [name, id] of Object.entries(this.named)) {
      const b = s.buildings.get(id);
      if (b && !b.planned && !this.builtSeen.has(name)) {
        this.builtSeen.add(name);
        if (this.t - this.placedAt[name] > 1) this.note(`built ${name} (${b.type}) after waiting ${Math.round(this.t - this.placedAt[name])} s as a ghost`);
      }
    }
    const open = this.openLayers();
    if (Math.round(this.t) % 60 === 0) this.snapshot(open);
    for (const n of s.msDone) {
      if (this.msTimes[n] === undefined) {
        this.msTimes[n] = this.t;
        this.note(`milestone ${n} done: ${MILESTONES.find((m) => m.n === n)?.name}`);
      }
    }
    for (const p of s.projectsDone) {
      if (this.projectTimes[p] === undefined) {
        this.projectTimes[p] = this.t;
        this.note(`project ${p} done: ${PROJECTS[p].name}`);
      }
    }
    for (const li of open) {
      const w = this.lw(li);
      const pw = this.g.layer(li).power;
      if (pw.demand > w.peak) {
        w.peak = pw.demand;
        w.peakAt = this.t;
      }
      w.satSum += pw.sat;
      w.satN++;
    }
    if (Math.round(this.t) % 60 === 0) this.money.push({ t: this.t, money: Math.round(s.money), income: Math.round(this.g.incomePerMin()) });
    if (Math.round(this.t) % 10 === 0) {
      this.rateLog.push({ t: this.t, produced: { ...s.stats.produced }, sold: { ...s.stats.sold }, delivered: { ...s.stats.delivered } });
      if (this.rateLog.length > 61) this.rateLog.shift();
    }

    this.retryPending();
    this.retryLanes();
    for (const ph of this.phases) {
      if (ph.done || !ph.when(this)) continue;
      ph.done = true;
      this.note(`start: ${ph.name}`);
      ph.act(this);
    }
    for (const w of this.watchers) {
      if (w.done) continue;
      if (w.check(this) === true) w.done = true;
    }
    if (this.autoLine) this.upgradeLine();
    if (this.autoClearJams) for (const li of open) this.clearJams(li);

    // Ghosts from a second ago that are gone now (built, rushed or taken up), per layer.
    const sc = this.score();
    const per: { li: number; ghosts: Building[]; gone: number }[] = [];
    let goneAll = 0;
    for (const li of open) {
      const w = this.lw(li);
      const ghosts = this.g.ghostQueue(li);
      let gone = 0;
      for (const id of w.prevGhosts) if (!s.buildings.get(id)?.planned) gone++;
      w.prevGhosts = new Set(ghosts.map((b) => b.id));
      per.push({ li, ghosts, gone });
      goneAll += gone;
    }
    // A stall: three minutes without milestone or project progress.
    if (sc !== this.lastScore) {
      this.closeStall();
      this.lastScore = sc;
      this.lastScoreAt = this.t;
    } else if (this.stallIdx < 0 && this.t - this.lastScoreAt >= 180) {
      this.stuckWhy = this.describeState();
      this.stallGhostsBuilt = 0;
      this.stallIdx = this.stuck.length;
      this.stuck.push({ from: this.lastScoreAt, to: -1, why: this.stuckWhy });
      this.note(`STALL since ${mmss(this.lastScoreAt)}: ${this.stuckWhy}`);
    }
    if (this.stallIdx >= 0) this.stallGhostsBuilt += goneAll;

    // A deadlock: three minutes in which no ghost got built on a layer and its depot gained none of
    // what the oldest ghost lacks (ghosts are built oldest first, so nothing behind it moves either).
    for (const { li, ghosts, gone } of per) {
      const w = this.lw(li);
      if (ghosts.length === 0 || gone > 0) {
        w.lastBuiltAt = this.t;
        if (w.deadlock >= 0) this.deadlocks[w.deadlock].to = this.t;
        w.deadlock = -1;
      }
      const oldest = ghosts[0];
      if (oldest) {
        const L = this.g.layer(li);
        const lacks = Object.keys(this.g.rushQuote(oldest.id)?.missing ?? {});
        if (oldest.id !== w.oldestId || lacks.some((k) => (L.stock[k] ?? 0) > (w.lackStock[k] ?? 0))) w.lackGainAt = this.t;
        w.oldestId = oldest.id;
        w.lackStock = Object.fromEntries(lacks.map((k) => [k, L.stock[k] ?? 0]));
        if (w.deadlock < 0 && this.t - w.lastBuiltAt >= 180 && this.t - w.lackGainAt >= 180) {
          w.deadlock = this.deadlocks.length;
          this.deadlocks.push({ layer: li, from: Math.max(w.lastBuiltAt, w.lackGainAt), to: -1, why: this.describeState(li) });
          this.note(`DEADLOCK${open.length > 1 ? ` on L${li}` : ''}: ${this.deadlocks[w.deadlock].why}`);
        }
      }
      if (this.autoRush) this.rushIfDeadlocked(li);
    }
  }

  private closeStall(): void {
    if (this.stallIdx < 0) return;
    const st = this.stuck[this.stallIdx];
    st.to = this.t;
    st.why = `${this.stuckWhy}; ghosts built meanwhile: ${this.stallGhostsBuilt}`;
    this.stallIdx = -1;
  }

  /** The milestone's steps, and per layer (the given one, or every one with ghosts) its ghosts, shortfall and power. */
  describeState(layer?: number): string {
    const s = this.g.s;
    const m = MILESTONES[s.milestone];
    const steps = m
      ? m.steps.map((st) => {
          const p = stepProgress(this.g, st);
          return `${p.label} ${p.cur}/${p.max}`;
        })
      : [];
    const open = this.openLayers();
    let layers = layer !== undefined ? [layer] : open.filter((l) => this.g.ghostQueue(l).length);
    if (!layers.length) layers = [this.layer];
    const parts = layers.map((l) => {
      const q = this.g.ghostQueue(l);
      const head = q[0] ? ` oldest ghost: ${q[0].type} at ${q[0].x},${q[0].y}` : '';
      return `${open.length > 1 ? `L${l} ` : ''}ghosts=${q.length}${head} short=${JSON.stringify(this.ghostShortfall(l))} sat=${this.g.layer(l).power.sat.toFixed(2)}`;
    });
    return `M${m?.n ?? '-'} [${steps.join('; ')}] ${parts.join(' | ')}`;
  }

  // ------------------------------------------------------------------ time

  /** Tick (watchers on) until `pred` holds or `maxSeconds` more game seconds pass. True if it held. */
  waitFor(pred: (bot: Bot) => boolean, maxSeconds: number): boolean {
    const end = this.t + maxSeconds - 1e-6;
    while (this.t < end) {
      for (let i = 0; i < 60; i++) this.g.tick();
      this.everySecond();
      if (pred(this)) return true;
    }
    return false;
  }

  /** Let `seconds` of game time pass (watchers on). */
  wait(seconds: number): void {
    this.waitFor(() => false, seconds);
  }

  /** Tick until `until` is true or the game clock reaches `maxSeconds` (absolute), then close the books (finish). */
  play(maxSeconds: number, until: (bot: Bot) => boolean): void {
    const g = this.g;
    while (g.s.time < maxSeconds) {
      for (let i = 0; i < 60; i++) g.tick();
      this.everySecond();
      if (until(this)) break;
    }
    this.finish();
  }

  /**
   * Close the books for a report: an open stall or deadlock gets an end time (it stays open if play
   * goes on), and swaps still refused and lanes still waiting are listed in `refusals` with to = -1.
   */
  finish(): void {
    if (this.stallIdx >= 0) {
      const st = this.stuck[this.stallIdx];
      st.to = this.t;
      st.why = `${this.stuckWhy}; ghosts built meanwhile: ${this.stallGhostsBuilt}`;
    }
    for (const w of this.watch.values()) if (w.deadlock >= 0) this.deadlocks[w.deadlock].to = this.t;
    for (const p of this.pending) {
      if (p.reported) continue;
      p.reported = { what: `${p.type} at ${p.x},${p.y}`, from: p.since, to: -1, reason: p.reason };
      this.refusals.push(p.reported);
    }
    for (const w of this.waitingLanes) {
      if (w.reported) continue;
      w.reported = { what: laneName(w), from: w.since, to: -1, reason: LANE_WAIT };
      this.refusals.push(w.reported);
    }
  }

  // ------------------------------------------------------------------ looking

  /**
   * ASCII map of a window of a layer (MAP_LEGEND): belts as arrows, buildings by letter, ghosts
   * lowercase. Underground, tiles a player can't see yet are blank unless `all` is set.
   */
  map(x0: number, y0: number, x1: number, y1: number, layer = this.layer, opts: { all?: boolean } = {}): string {
    const L = this.g.layer(layer);
    const ARROWS = ['^', '>', 'v', '<'];
    const lines: string[] = [];
    let head = '    ';
    for (let x = x0; x <= x1; x++) head += x % 10 === 0 ? String((x / 10) % 10) : ' ';
    lines.push(head);
    head = '    ';
    for (let x = x0; x <= x1; x++) head += String(x % 10);
    lines.push(head);
    for (let y = y0; y <= y1; y++) {
      let row = String(y).padStart(3) + ' ';
      for (let x = x0; x <= x1; x++) {
        const i = y * L.w + x;
        const b = this.g.at(layer, x, y);
        let c: string;
        if (b) {
          const k = BUILDINGS[b.type].kind;
          c = k === 'belt' ? ARROWS[b.dir] : (LETTER[b.type] ?? b.type[0].toUpperCase());
          if (b.planned) c = c === ARROWS[b.dir] ? 'o' : c.toLowerCase();
        } else if (!opts.all && !L.revealed[i] && !L.surveyed[i]) {
          c = ' ';
        } else {
          const t = L.terrain[i];
          c = t === T_HARD ? 'X' : t === T_ROCK ? '#' : t === T_WATER ? '~' : t === T_MAGMA ? '=' : L.ore[i] ? ':' : '.';
          if (t === T_FLOOR && L.ore[i]) c = ORE_LIST[L.ore[i] - 1] === 'stone' ? ';' : ':';
          else if (t === T_FLOOR && L.foundation[i]) c = '_';
          else if (t === T_FLOOR && L.conduit[i]) c = L.conduitLive[i] ? "'" : '`';
        }
        row += c;
      }
      lines.push(row);
    }
    return lines.join('\n');
  }
}
