// Act V as a reusable script: a scripted player builds the Magma Shelf (layer 4) from the
// breakthrough to D5 (Bore to the Alien Strata) on the real map. tests/act5.test.ts prints and checks
// it; playAct5() returns the bot at the moment D5 completes so a later run can chain acts.
//
// The plan (seed 20261030; coordinates are the real map's):
// - M24: the one vent in sight (V1, 43,19) faces south straight into an Assay Lab: no belts.
// - At once, dig: a tunnel along row 23 from the vent's pocket into the middle cave, a neck down to
//   the second vent (V2, 29,29), a link from the north magma pocket into the middle cave (the trunk
//   to the drill runs that way), and room south of the steel chain for the aggregate lane.
// - M25: V1 north into a splitter: a Cooling Bath (aggregate) and a Pressure Forge on hot ground
//   (F1), fed steel by a Foundry and Smelter standing port-to-port beside it (coal from the rig's
//   field, ore from the rich iron). Aggregate rides a lane round the south of the magma into the
//   depot; Heat Shield Assemblers at the depot (A0, A1) make the forges' shields, then the drill's.
//   V2 feeds a Thermal Extractor (220 kW, slag sold at a Chute) and a second bath whose aggregate
//   joins the lane. Foundations go under both vent miners (hot ground halves a Miner); the
//   assemblers' aggregate unloaders stay off while the foundations still wait for aggregate (a
//   foundation is paid on the spot, never planned, so the depot holds nothing back for it).
// - M26: F1's molten ingots run along an insulated line to a splitter beside the Precision
//   Assembler on steady ground east of the depot: the PA takes what it can, the rest cools into the
//   depot. Circuits come from an unloader.
// - D5: a trunk from the depot round the north to the drill. The unloader at its head is switched
//   between Ember Cores, Circuits, Heat Shields and cold ingots as the drill's panel shows them short
//   (extras that arrive after a good is full go on into the depot); at the drill a Sorter turns cold
//   ingots into a reheating forge whose molten ingots go straight in. The shield assemblers push
//   into the trunk's head and pause once the drill has its 160 shields; the PA stops at 60 cores so
//   the last circuits go to the drill.
// - Requests: plates, circuits and batteries from the start; the cab serves requested items one
//   each in turn, so beams and gears stay at the default rows (raised by the ghosts' "request the
//   missing goods" button) until the plate-hungry building is done, then go up for the shields.

import { BUILDINGS } from '../../src/data/buildings';
import { PROJECTS } from '../../src/data/progression';
import type { Building, Dir } from '../../src/sim/types';
import { Bot, E, N, S, W, mmss } from '../bot';
import { route } from './route';
import { SEED, actDone, startAct } from './start';

export const L4 = 4;

export interface Act5Opts {
  seed?: number;
  /** Play on from this bot (a chained run) instead of a fresh startAct(5). */
  bot?: Bot;
  /** Stop after this many act seconds (default 90 minutes). */
  maxSeconds?: number;
}

/** A belt-line piece: x, y, facing, and the piece type (default: the line's type). */
type Piece = [number, number, Dir, string?];

/** A straight run of pieces from (x0, y0) to (x1, y1) facing d. */
function run(x0: number, y0: number, x1: number, y1: number, d: Dir, type?: string): Piece[] {
  const out: Piece[] = [];
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) out.push([x0 + dx * k, y0 + dy * k, d, type]);
  return out;
}

/** Lay a hand-planned line on empty floor: belts (ghosts while the depot is short) and Crossings. */
function lay(bot: Bot, pieces: Piece[], type = 'belt'): void {
  for (const [x, y, d, t] of pieces) bot.put(t ?? type, x, y, d, { layer: L4 });
}

/** Items on a run of belts, crossings and sorters (both lanes of a crossing). */
function itemsOn(bot: Bot, cells: { x: number; y: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string) => (out[id] = (out[id] ?? 0) + 1);
  for (const c of cells) {
    const b = bot.g.at(L4, c.x, c.y);
    if (!b || b.planned) continue;
    if (b.item) add(b.item.id);
    if (b.item2) add(b.item2.id);
  }
  return out;
}

/** How many of an item a machine holds: in its input buffer and its output buffer. */
function heldBy(b: Building | undefined, item: string): number {
  if (!b || b.planned) return 0;
  let n = b.inBuf[item] ?? 0;
  for (const it of b.outBuf) if (it.id === item) n++;
  return n;
}

/** What the Act V bot measures beyond the shared report: work done and when each of D5's needs filled. */
export interface Act5Stats {
  /** Seconds each machine type on the Magma Shelf spent working (crafting, or mining). */
  workSec: Record<string, number>;
  /** Act time each D5 need was filled. */
  filled: Record<string, number>;
  /** Act time the elevator had brought the act's last circuit (168: 120 for cores, 40 for D5, 8 to build). */
  circuitsIn?: number;
  /** Production counts when the act started (a chained run carries earlier acts' totals). */
  made0: Record<string, number>;
}

const STATS = new WeakMap<Bot, Act5Stats>();

/** The Act V bot's own measurements (empty before actFive runs). */
export function act5Stats(bot: Bot): Act5Stats {
  let s = STATS.get(bot);
  if (!s) {
    s = { workSec: {}, filled: {}, made0: {} };
    STATS.set(bot, s);
  }
  return s;
}

/** Machines, Miners and generators standing on a layer. */
export function machineCount(bot: Bot, layer = L4): number {
  let n = 0;
  for (const b of bot.g.s.buildings.values()) {
    if (b.layer !== layer || b.planned) continue;
    const k = BUILDINGS[b.type].kind;
    if (k === 'machine' || k === 'miner' || k === 'collector' || k === 'generator') n++;
  }
  return n;
}

/** Lines for the Act V test: the factory, its work, what filled D5 last, and what was wasted. */
export function act5Report(bot: Bot): string[] {
  const s = act5Stats(bot);
  const g = bot.g;
  const out: string[] = [];
  const work = Object.entries(s.workSec).sort((a, b) => b[1] - a[1]);
  const total = work.reduce((a, [, v]) => a + v, 0) / 60;
  out.push(`Magma Shelf at the end: ${machineCount(bot)} machines, miners and generators (the crew rig's two included)`);
  out.push(`Machine-minutes worked on the Magma Shelf: ${total.toFixed(0)} (${work.map(([k, v]) => `${k} ${(v / 60).toFixed(1)}`).join(', ')}); pacing.test's D5 reference line is 293`);
  const filled = Object.entries(s.filled).sort((a, b) => a[1] - b[1]);
  out.push(`D5 needs filled: ${filled.length ? filled.map(([k, t]) => `${k} ${mmss(t)}`).join(', ') : 'none'}; the act's 168th circuit came down at ${s.circuitsIn !== undefined ? mmss(s.circuitsIn) : '--:--'}`);
  const made = (k: string) => (g.s.stats.produced[k] ?? 0) - (s.made0[k] ?? 0);
  out.push(
    `Made in the act: emberite ${made('emberite')}, aggregate ${made('aggregate')}, slag ${made('slag')}, heat shields ${made('heat_shield')}, ` +
      `molten ingots ${made('hot_ember_ingot')} (cold ones left in the depot ${g.layer(L4).stock.cold_ember_ingot ?? 0}), ember cores ${made('ember_core')}, steel ingots ${made('steel_ingot')}`,
  );
  return out;
}

/** The Act V build order as phases and watchers on layer 4. */
export function actFive(bot: Bot): void {
  const g = bot.g;
  const stats = act5Stats(bot);
  // Work done, D5's needs as they fill, and the circuits the elevator brought down.
  const circuitsSeen = g.layer(L4).stock.circuit ?? 0;
  stats.made0 = { ...g.s.stats.produced };
  const circuitBase = g.s.stats.delivered.circuit ?? 0;
  bot.watchers.push({
    name: 'Act V measurements',
    check: (b) => {
      for (const x of g.s.buildings.values()) {
        if (x.layer !== L4 || x.planned || !x.active) continue;
        const k = BUILDINGS[x.type].kind;
        if (k === 'machine' || k === 'miner') stats.workSec[x.type] = (stats.workSec[x.type] ?? 0) + 1;
      }
      const p = g.s.project;
      if (p && p.id === 'd5') {
        for (const [k, v] of Object.entries(PROJECTS.d5.needs)) if ((p.delivered[k] ?? 0) >= v && stats.filled[k] === undefined) stats.filled[k] = b.actTime;
      }
      // Circuits come down only by the elevator into this depot.
      const inNow = (g.s.stats.delivered.circuit ?? 0) - circuitBase + circuitsSeen;
      if (stats.circuitsIn === undefined && inNow >= 168) stats.circuitsIn = b.actTime;
    },
  });
  const has = (n: number) => (b: Bot) => b.g.s.msDone.includes(n);
  const L = { layer: L4 };
  const stock = (item: string) => g.layer(L4).stock[item] ?? 0;
  const built = (name: string) => bot.named[name] !== undefined && !bot.get(name).planned;
  bot.watchItems[L4] = ['aggregate', 'heat_shield', 'circuit', 'ember_core', 'cold_ember_ingot', 'steel_beam', 'iron_plate', 'insulation', 'gear', 'battery', 'motor'];

  // ---------------------------------------------------------------- M24 Hot Rock
  bot.phases.push({
    name: 'down to the Magma Shelf: requests, the vent Miner straight into an Assay Lab, and the digging (M24)',
    when: () => true,
    act: (b) => {
      b.focus(L4);
      // The depot inspector: what the elevator should keep down here. The cab serves requested items
      // in turn, one each, so every extra row slows the others: plates first (every belt and most
      // machines), circuits (cores and the drill) and batteries (the Precision Assembler). Beams,
      // gears and insulation stay at the layer's default rows until the build needs more.
      b.request('iron_plate', 200);
      b.request('circuit', 200);
      b.request('battery', 10);
      // The one vent in sight faces south into a lab standing on its port: twenty samples, no belts.
      b.put('miner', 43, 19, S, { name: 'V1', ...L });
      b.put('assay_lab', 42, 21, N, { name: 'LAB', ...L });
      // Dig while the samples go in: the tunnel west along row 23 (it breaks into the middle cave), the
      // neck down to the second vent, room for the aggregate lane south of the magma, and the link
      // from the north magma pocket into the middle cave for the trunk to the drill.
      const cells: { x: number; y: number }[] = [];
      for (let x = 41; x >= 32; x--) cells.push({ x, y: 23 });
      cells.push({ x: 30, y: 25 }, { x: 29, y: 24 }, { x: 29, y: 25 });
      for (let x = 52; x <= 56; x++) cells.push({ x, y: 23 });
      cells.push({ x: 36, y: 11 }, { x: 36, y: 12 }, { x: 36, y: 13 }, { x: 35, y: 13 }, { x: 34, y: 13 });
      b.dig(cells);
    },
  });

  // ---------------------------------------------------------------- M25 Three Routes
  bot.phases.push({
    name: 'assay done: the vent split between a Cooling Bath and a Pressure Forge, the aggregate lane, the shield assembler (M25)',
    when: has(24),
    act: (b) => {
      // The lab is done with: take it up (its goods go back to the depot) and turn the vent north.
      b.del(42, 21);
      b.turn(43, 19, N);
      // V1 north into a splitter: left into the bath, right along two belts into the forge.
      b.put('splitter', 44, 18, N, { name: 'SV', ...L });
      b.put('cooling_bath', 42, 17, S, { recipe: 'quench', name: 'B1', ...L });
      lay(b, [[45, 18, E], [46, 18, N]]);
      // The aggregate lane: B1 south, east along row 23 under the magma, through the dug room, north
      // up column 59 (crossing the ore line and, later, the hot line) into the depot's south face.
      // V2's return lane joins it at (42,23) from the tunnel.
      lay(b, [
        ...run(42, 19, 42, 22, S),
        ...run(42, 23, 58, 23, E),
        ...run(59, 23, 59, 19, N),
        [59, 18, N, 'crossing'],
        ...run(59, 17, 59, 16, N),
        [59, 15, N, 'crossing'],
        [59, 14, N],
      ]);
      // The shield assembler at the depot's north face, fed straight by two unloaders; its shields
      // go back in (later, into the trunk's head).
      b.put('assembler', 58, 8, E, { recipe: 'heat_shield', name: 'A0', ...L });
      b.put('unloader', 59, 10, N, { filter: 'steel_beam', name: 'UB0', ...L });
      b.put('unloader', 58, 10, N, { name: 'UA0', ...L });
      lay(b, [[60, 9, S], [60, 10, S]]);
      b.note('A0 heat shield assembler at the depot: its aggregate unloader stays off until the vents have their foundations');
    },
  });
  bot.phases.push({
    name: 'the second vent: a Thermal Extractor (slag to a Chute) and a bath whose aggregate rides back to the depot',
    when: has(24),
    act: (b) => {
      b.put('miner', 29, 29, E, { name: 'V2', ...L });
      b.put('splitter', 31, 30, E, { name: 'SV2', ...L });
      lay(b, [[31, 31, S]]);
      b.put('thermal_extractor', 31, 32, S, { recipe: 'extract', name: 'TE', ...L });
      b.put('chute', 33, 33, E, { name: 'CHUTE', ...L });
      lay(b, [[31, 29, N], [31, 28, N]]);
      b.put('cooling_bath', 31, 26, W, { recipe: 'quench', name: 'B2', ...L });
      lay(b, [...run(30, 26, 30, 24, N), ...run(30, 23, 41, 23, E)]);
    },
  });
  bot.phases.push({
    name: 'steel for the forge: coal and rich iron into a Smelter and Foundry standing port to port beside it',
    when: has(24),
    act: (b) => {
      b.put('miner', 48, 10, S, { name: 'CM', ...L });
      lay(b, [...run(48, 12, 48, 14, S), [48, 15, S, 'crossing']]);
      b.put('foundry', 48, 16, W, { recipe: 'steel_ingot', name: 'FD', ...L });
      b.put('smelter', 50, 16, W, { recipe: 'iron_ingot', name: 'SM', ...L });
      b.put('miner', 61, 22, N, { name: 'IM', ...L });
      lay(b, [
        ...run(62, 21, 61, 21, W),
        ...run(60, 21, 60, 19, N),
        [60, 18, W],
        ...run(58, 18, 53, 18, W),
        [52, 18, N],
        [52, 17, W],
      ]);
      b.put('pressure_forge', 46, 16, N, { recipe: 'forge_ember', name: 'F1', ...L });
    },
  });

  // ---------------------------------------------------------------- M26 Keep It Hot
  bot.phases.push({
    name: 'the hot line: insulated belts from the forge to a splitter beside the Precision Assembler on steady ground',
    when: has(24),
    act: (b) => {
      lay(b, [[47, 15, E], ...run(49, 15, 58, 15, E)], 'insulated_belt');
      // The splitter is the overflow M26's hint asks for: the forge runs twice as fast as the
      // assembler, and a full line holds each ingot long enough to cool for good even insulated.
      b.put('splitter', 60, 15, E, { name: 'SPP', ...L });
      lay(b, [[60, 14, N]]);
      b.put('precision_assembler', 61, 15, S, { recipe: 'ember_core', name: 'PA', ...L });
      // Its cores side-load into the aggregate lane, which runs into the depot.
      lay(b, [[61, 17, W], [60, 17, W]]);
    },
  });
  bot.phases.push({
    name: 'the Precision Assembler is built: an unloader feeds it circuits',
    when: () => built('PA'),
    act: (b) => {
      b.put('unloader', 61, 13, E, { filter: 'circuit', name: 'UPC', ...L });
      lay(b, [[62, 13, S], [62, 14, S]]);
    },
  });
  // A second shield assembler on the depot's east face. Its shields side-load onto A0's return belt
  // (and, once the trunk opens, into the trunk's head).
  bot.phases.push({
    name: 'a second heat shield assembler on the depot\'s east face',
    when: has(24),
    act: (b) => {
      b.put('assembler', 62, 11, N, { recipe: 'heat_shield', name: 'A1', ...L });
      b.put('unloader', 61, 11, E, { name: 'UA1', ...L });
      b.put('unloader', 61, 12, E, { filter: 'steel_beam', name: 'UB1', ...L });
      lay(b, [[63, 10, W], [62, 10, W], [61, 10, N], [61, 9, W]]);
    },
  });

  // ---------------------------------------------------------------- D5
  const trunk: { x: number; y: number }[] = [];
  bot.phases.push({
    name: 'D5: the drill end (a sorter into a reheating forge) and the trunk round the north',
    when: has(24),
    act: (b) => {
      b.put('sorter', 18, 35, S, { filter: 'cold_ember_ingot', name: 'SD', ...L });
      b.put('pressure_forge', 19, 35, S, { recipe: 'reheat_ember', name: 'FDR', ...L });
      lay(b, [[18, 36, S], [18, 37, S], [19, 37, W]]);
      // The trunk: from the depot's north face to the drill end, the router's way (Bot.lay puts any
      // Crossings down first, and holds the whole trunk back until the depot can pay for them).
      const reserved = new Set<string>();
      for (const [x, y] of [[60, 9], [60, 10], [61, 9], [61, 10], [62, 10], [63, 10]]) reserved.add(`${x},${y}`);
      const pieces = route(g, L4, { x: 60, y: 8 }, [{ x: 18, y: 34, dir: S }], { feed: N, avoid: (x, y) => reserved.has(`${x},${y}`) });
      if (!pieces) throw new Error('no trunk route to the drill');
      b.lay(pieces, L);
      b.note(`trunk: ${pieces.length} tiles from 60,8 to 18,34${pieces.some((p) => p.type === 'crossing') ? `, crossings at ${pieces.filter((p) => p.type === 'crossing').map((p) => `${p.x},${p.y}`).join(' ')}` : ''}`);
      trunk.push({ x: 60, y: 10 }, { x: 60, y: 9 }, ...pieces.map((p) => ({ x: p.x, y: p.y })), { x: 18, y: 35 }, { x: 18, y: 36 }, { x: 18, y: 37 }, { x: 19, y: 37 });
    },
  });
  // Once both forges stand (their shields came through the depot) and every trunk belt is built, the
  // trunk's head goes in: the depot's north-face belt becomes an unloader and the assemblers' shared
  // return cell a trunk belt, so new shields go straight to the drill.
  const trunkBuilt = () => trunk.length > 0 && trunk.slice(2).every((c) => { const t = g.at(L4, c.x, c.y); return !!t && !t.planned; });
  bot.phases.push({
    name: 'D5: open the trunk (the shield assemblers now push into it)',
    when: () => built('F1') && built('FDR') && trunkBuilt(),
    act: (b) => {
      b.del(60, 10);
      b.del(60, 9);
      b.put('unloader', 60, 10, N, { name: 'UTR', ...L });
      b.put('belt', 60, 9, N, L);
    },
  });

  // ---------------------------------------------------------------- watchers
  // Foundations under the vent miners (hot ground halves a miner): V1 at once; V2 once the first
  // forge stands (its two shields come first: they gate the molten ingots).
  const footprints: [string, number, number, () => boolean][] = [
    ['V1', 43, 19, () => true],
    ['V2', 29, 29, () => built('F1')],
  ];
  /** Uncovered hot or warm tiles under the vent miners that are due a foundation now. */
  const pendingFoundations = (b: Bot): { name: string; x: number; y: number }[] => {
    const Ly = g.layer(L4);
    const out: { name: string; x: number; y: number }[] = [];
    for (const [name, x0, y0, due] of footprints) {
      if (b.named[name] === undefined || !due()) continue;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = (y0 + dy) * Ly.w + x0 + dx;
        if (!Ly.foundation[i] && Ly.hot[i]) out.push({ name, x: x0 + dx, y: y0 + dy });
      }
    }
    return out;
  };
  bot.watchers.push({
    name: 'foundations under the vent miners',
    check: (b) => {
      for (const f of pendingFoundations(b)) {
        if (stock('aggregate') < 2 || !g.canPlace('foundation', L4, f.x, f.y, N).ok) break;
        b.foundation(f.x, f.y, L4);
        b.note(`foundation under ${f.name} at ${f.x},${f.y}`);
      }
      return footprints.every(([name]) => b.named[name] !== undefined) && built('F1') && pendingFoundations(b).length === 0;
    },
  });
  // The depot inspector again: a ghost that has waited gets its "Request the missing goods" button;
  // once the plate-hungry building is done, beams go up for the 160 heat shields.
  bot.watchers.push({
    name: 'requests follow the ghosts, then the shields',
    check: (b) => {
      if (Math.round(b.t) % 10 !== 0) return;
      const q = g.ghostQueue(L4);
      for (const gh of q.slice(0, 3)) {
        const miss = g.rushQuote(gh.id)?.missing ?? {};
        if (Object.keys(miss).some((k) => k !== 'iron_plate' && k !== 'heat_shield' && k !== 'aggregate')) b.requestMissing(gh);
      }
      const plateShort = b.ghostShortfall(L4).iron_plate ?? 0;
      if (built('A0') && plateShort <= 10) {
        b.request('steel_beam', 150);
        b.request('gear', 40);
        return true;
      }
    },
  });
  // A foundation is paid on the spot or not at all (it never waits as a ghost, so the depot holds
  // nothing back for it): the shield assemblers' aggregate unloaders stay off while the vent miners'
  // foundations still wait for aggregate, or they would take every piece as it comes in. Planned
  // ghosts need no such care: a depot Unloader leaves them what they hold.
  bot.watchers.push({
    name: 'aggregate unloaders wait for the foundations',
    check: (b) => {
      const want = 2 * pendingFoundations(b).length;
      const on = want === 0 || stock('aggregate') >= want + 4;
      for (const name of ['UA0', 'UA1']) {
        if (b.named[name] === undefined) continue;
        const u = b.get(name);
        if (u.planned) continue;
        const f = on ? 'aggregate' : null;
        if (u.filter !== f) b.filter(u, f);
      }
    },
  });
  // The trunk: its head unloader takes whichever of the drill's goods the drill's panel shows
  // furthest from full and the depot has (a good that fills while more of it rides the trunk is no
  // trouble: the drill passes the extras into the depot). The depot's cold ingots stand for the
  // molten ones (the forge at the drill reheats them). While the Precision Assembler still makes
  // cores, a few circuits stay in the depot for it. The shield assemblers push into the trunk's head;
  // they pause once the drill has, or will have, its 160 shields (delivered, on the trunk, in the
  // depot and leaving the assemblers), so no aggregate or beams go into shields nobody needs.
  bot.watchers.push({
    name: 'trunk: switch the head unloader between the drill\'s goods; pause the shield assemblers when 160 shields are on their way',
    check: (b) => {
      if (b.named.UTR === undefined || b.get('UTR').planned) return;
      const p = g.s.project;
      if (!p || p.id !== 'd5') return true;
      const need = PROJECTS.d5.needs;
      const del = (k: string) => p.delivered[k] ?? 0;
      const utr = b.get('UTR');
      const asm = ['A0', 'A1'].filter((n) => b.named[n] !== undefined).map((n) => b.get(n));
      let shields = del('heat_shield') + (itemsOn(b, trunk).heat_shield ?? 0) + stock('heat_shield');
      for (const a of asm) shields += a.outBuf.filter((it) => it.id === 'heat_shield').length + (a.active ? 1 : 0);
      for (const a of asm) {
        if (a.planned) continue;
        const pause = shields >= need.heat_shield;
        if (!!a.paused !== pause) b.pause(a, pause);
      }
      const left: Record<string, number> = {
        ember_core: need.ember_core - del('ember_core'),
        circuit: need.circuit - del('circuit'),
        cold_ember_ingot: need.hot_ember_ingot - del('hot_ember_ingot'),
        heat_shield: need.heat_shield - del('heat_shield'),
      };
      const coresToMake = !(built('PA') && b.get('PA').paused) && need.ember_core - del('ember_core') - stock('ember_core') > 0;
      const reserve = (k: string) => (k === 'circuit' && coresToMake ? 4 : 0);
      const cands = Object.keys(left).filter((k) => left[k] > 0 && stock(k) > reserve(k));
      cands.sort((a, c) => left[c] - left[a]);
      const pick = cands[0] ?? null;
      if (utr.filter !== pick) b.filter(utr, pick);
    },
  });
  // Enough cores: once the drill's 60 are made (delivered, on the trunk, in the depot or on their
  // way to it), the Precision Assembler and its circuit unloader stop, so the last circuits go to the
  // drill instead of into cores nobody needs. The forge stops too once the drill's cold ingots are in.
  const coreWay: { x: number; y: number }[] = [{ x: 61, y: 17 }, { x: 60, y: 17 }];
  for (let y = 14; y <= 17; y++) coreWay.push({ x: 59, y });
  bot.watchers.push({
    name: 'stop the Precision Assembler and the forge when the drill has enough cores coming',
    check: (b) => {
      if (!built('PA') || b.named.UPC === undefined || b.get('UPC').planned) return;
      const p = g.s.project;
      if (!p || p.id !== 'd5') return true;
      const pa = b.get('PA');
      const cores = (p.delivered.ember_core ?? 0) + (itemsOn(b, trunk).ember_core ?? 0) + stock('ember_core') + heldBy(pa, 'ember_core') + (pa.active ? 1 : 0) + (itemsOn(b, coreWay).ember_core ?? 0);
      if (cores < PROJECTS.d5.needs.ember_core) return;
      b.pause(pa);
      b.filter(b.get('UPC'), null);
      b.note(`${cores} Ember Cores made: paused the Precision Assembler and turned its circuit unloader off`);
      return true;
    },
  });
  bot.watchers.push({
    name: 'stop the forge once the Precision Assembler is done and the drill\'s ingots are covered',
    check: (b) => {
      const p = g.s.project;
      if (!p || p.id !== 'd5') return true;
      if (!built('PA') || !b.get('PA').paused || !built('F1')) return;
      const onTrunk = itemsOn(b, trunk);
      const ingots = (p.delivered.hot_ember_ingot ?? 0) + stock('cold_ember_ingot') + (onTrunk.cold_ember_ingot ?? 0) + (onTrunk.hot_ember_ingot ?? 0);
      if (ingots < PROJECTS.d5.needs.hot_ember_ingot) return;
      b.pause(b.get('F1'));
      b.note('paused the forge: the depot holds the cold ingots the drill still needs');
      return true;
    },
  });
}

export function playAct5(opts: Act5Opts = {}): Bot {
  const bot = opts.bot ?? startAct(5, opts.seed ?? SEED).bot;
  if (opts.bot) {
    bot.act = 5;
    bot.t0 = bot.t;
  }
  actFive(bot);
  bot.play(bot.t0 + (opts.maxSeconds ?? 90 * 60), (b) => actDone(b, 5));
  return bot;
}

