// Act VI as a reusable script: a scripted player on the Alien Strata (layer 5) from the breakthrough
// to the ending. It assays Thrumstone, wakes the Waking Node with Batteries and Resonant Cores, puts
// Attuners on the conduit it woke, wakes the other two Engine Nodes with Engine Glass and Resonant
// Cores, and feeds the Heart until the Governor is done (s.ended). tests/act6.test.ts prints and
// checks it; playAct6() takes a fresh start state (startAct(6)) or a bot handed over from Act V.
//
// The layout on the real map (seed 20261030; x, y are top-left corners; a 2x2 machine pushes out of
// its front-right tile, a 3x3 one out of its front-centre tile):
//   depot     (18..20, 39..41); the lower station fills its west face.
//   M27       thrumstone Miner TM1 (24,29) W pushes straight into the Assay Lab LAB (21,29): no belts.
//   M28       Unloaders UB (21,39) Battery and UR (21,41) Resonant Core on the depot's east face, belts
//             (22,39) S and (22,41) N into Sequencer SW (22,40) E (left input first: the Battery), a
//             belt into the Waking Node's west face. A tunnel (33..46, 42..46) reaches the Heart's
//             chamber; Heartstones run from the node's port (28,42) along y=42 into the Heart.
//   M29       the Waking Node's five rings wake the conduit on y=36: Attuners A1 (18,36), A2 (20,36),
//             A3 (14,36) and A4 (16,36) face S; A1 and A2 push glass straight down into the depot's
//             north face ((18,38), (20,38)), A3 and A4 east along y=38 into A1's belt. TM1's line runs
//             down x=22 to splitters at (21,35), (19,35) and (17,35) W, each dealing left into an
//             Attuner, the rest down (15,35) into A3. A second Miner TM2 (26,31) W side-loads TM1's
//             line at (22,31). The lab comes up.
//   M30       passages: x=31 (y=27..37) and (32..33, 27) into node 1's cavern; y=38 (x=32..45) east to
//             the Heart's chamber; (55..57, 34..35) north into node 2's cavern. The east-face pair
//             again (UG Engine Glass, UR Resonant Core, Sequencer S) feeds node 1 up x=31 until it
//             wakes; then it is taken up and rebuilt (a fresh Sequencer, so the stream starts with
//             glass) to feed node 2 along y=38 and up x=55. Node 2's Heartstones run down x=56..58
//             into the Heart's east face.
//   M31       the depot's south face: Unloaders UHE (18,42) Ember Core, UHB (19,42) Battery, UHG
//             (20,42) Engine Glass, one lane each along y=45, 44, 43 into the Heart's west face.
// Named buildings: TM1, TM2, LAB, UB, UR, SW, A1-A4, UG1, UR1, S1, UG2, UR2, S2, UHE, UHB, UHG (bot.get).

import { BUILDINGS } from '../../src/data/buildings';
import { ITEMS } from '../../src/data/items';
import { LAYERS } from '../../src/data/layers';
import { PROJECTS } from '../../src/data/progression';
import { T_ROCK } from '../../src/sim/types';
import { type Bot, E, N, S, W, mmss, starveAdvice } from '../bot';
import * as F from './find';
import type { RoutePiece } from './route';
import { ACT_BANDS, type StartOpts, startAct } from './start';
import { actClock } from './report';

/** PLAN.md §8: Act VI and the ending take 30-45 minutes. */
export const ACT6_BAND = ACT_BANDS[6];
/** A generous cap on the act (game seconds from its start). */
export const ACT6_CAP = 75 * 60;
/** The Alien Strata. */
const L = 5;

type Cell = { x: number; y: number };

function rect(x0: number, y0: number, x1: number, y1: number): Cell[] {
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

/** What the Act VI script laid and saw, for the report and for taking lanes up again. */
export interface Act6State {
  /** Lanes standing now, by name. */
  lanes: Record<string, RoutePiece[]>;
  /** Every lane laid, with its length and whether it was taken up again. */
  laid: { name: string; tiles: number; takenUp: boolean }[];
  /** Buildings on the Alien Strata before the act (depot, stations, the crew's rig, nodes, the Heart). */
  before: Set<number>;
  /** Engine Nodes' wrong items seen so far (they come out of the node's side). */
  rejects: number;
  /** The conduit pool: the most kW machines on it wanted, the pool then, and the lowest share they got. */
  poolPeak: number;
  poolAtPeak: number;
  poolSatMin: number;
  /** The lowest bank balance during the act. */
  moneyMin: number;
  /** When each of the Governor's needs was delivered in full (game time). */
  needDone: Record<string, number>;
}

const STATE = new WeakMap<Bot, Act6State>();

/** The Act VI script's lanes and counters for a bot that played it. */
export function act6State(bot: Bot): Act6State {
  let st = STATE.get(bot);
  if (!st) {
    st = { lanes: {}, laid: [], before: new Set(), rejects: 0, poolPeak: 0, poolAtPeak: 0, poolSatMin: 1, moneyMin: Infinity, needDone: {} };
    STATE.set(bot, st);
  }
  return st;
}

/** Lay a lane with bot.connect and remember it by name. */
function lane(bot: Bot, name: string, ...args: Parameters<Bot['connect']>): RoutePiece[] {
  const st = act6State(bot);
  const p = bot.connect(...args);
  st.lanes[name] = p;
  st.laid.push({ name, tiles: p.length, takenUp: false });
  return p;
}

/** Take up a lane laid earlier: its belts come back to the depot, with what they carry. */
function takeUp(bot: Bot, name: string): void {
  const st = act6State(bot);
  let n = 0;
  for (const p of st.lanes[name] ?? []) {
    const b = bot.g.at(L, p.x, p.y);
    if (!b || BUILDINGS[b.type].fixed) continue;
    bot.del(p.x, p.y, L);
    n++;
  }
  delete st.lanes[name];
  for (const l of st.laid) if (l.name === name) l.takenUp = true;
  bot.note(`took up the ${name} lane (${n} pieces; their goods went back to the depot)`);
}

/** Every rock tile in the cells has been dug (the dig queue may still hold cells elsewhere). */
function dug(bot: Bot, cells: Cell[]): boolean {
  const Ls = bot.g.layer(L);
  return cells.every((c) => Ls.terrain[c.y * Ls.w + c.x] !== T_ROCK);
}

/**
 * The Act VI build order, as phases keyed to milestones, plus its watchers. The bot must be focused
 * on the Alien Strata with the Governor as the open project (startAct(6), or a run handed over from
 * Act V right after D5).
 */
export function actSix(bot: Bot): void {
  const g = bot.g;
  const st = act6State(bot);
  const on = { layer: L };
  const has = (n: number) => (b: Bot) => b.g.s.msDone.includes(n);
  const [waking, node1, node2] = F.engineNodes(g);
  if (!waking?.waking || !node1 || !node2) throw new Error('the Alien Strata should have three Engine Nodes, the Waking Node first');
  const heart = F.drill(g, L);
  if (!heart || heart.type !== 'heart') throw new Error('no Heart on the Alien Strata');
  const dep = F.depot(g, L);
  // The Heart's west face: one cell per lane (y = heart.y + 3 .. + 6), each lane's last belt facing east.
  const heartWest = (k: number) => [{ x: heart.x - 1, y: heart.y + k, dir: E }];

  const tunnel = rect(33, 42, 46, 46);
  const toNode1 = [...rect(31, 27, 31, 37), { x: 32, y: 27 }, { x: 33, y: 27 }];
  const north = rect(32, 38, 45, 38);
  const toNode2 = [{ x: 55, y: 34 }, { x: 55, y: 35 }, { x: 56, y: 35 }, { x: 57, y: 35 }];

  // Plates for the build-out: about 200 belt tiles on top of the starter crate's 80.
  bot.phases.push({
    name: 'plates for the build-out; a thrumstone Miner straight into an Assay Lab (M27)',
    when: () => true,
    act: (b) => {
      b.request('iron_plate', 150, L);
      const m = b.put('miner', 24, 29, W, { name: 'TM1', ...on });
      if (m.ore !== 'thrumstone') throw new Error(`TM1 at 24,29 mines ${m.ore}, not thrumstone`);
      const port = F.outputOf(m);
      b.put('assay_lab', port.x - 2, port.y, N, { name: 'LAB', ...on });
    },
  });

  // M28: the Waking Node takes Battery, Resonant Core, Battery, Resonant Core. The depot already asks
  // for both (Mags: "Ask the depot to keep them in stock"); a Sequencer between two Unloaders makes
  // the stream. Its Heartstones need somewhere to go: four waiting at its front stop it (its inspector
  // says "Output full: belt the Heartstones away"), and M28 wants five. The bot digs to the Heart.
  bot.phases.push({
    name: 'batteries and cores into the Waking Node through a Sequencer; dig to the Heart (M28)',
    when: has(27),
    act: (b) => {
      b.request('resonant_core', 40, L);
      b.request('battery', 30, L);
      b.put('unloader', dep.x + 3, dep.y, E, { filter: 'battery', name: 'UB', ...on });
      b.put('unloader', dep.x + 3, dep.y + 2, E, { filter: 'resonant_core', name: 'UR', ...on });
      b.put('belt', dep.x + 4, dep.y, S, on);
      b.put('belt', dep.x + 4, dep.y + 2, N, on);
      const sw = b.put('sequencer', dep.x + 4, dep.y + 1, E, { name: 'SW', ...on });
      lane(b, 'waking', sw, waking.b, on);
      // While the Governor is open the Heart's beacon and the sleeping nodes' markers show through the
      // dark: dig toward the Heart's.
      b.dig(tunnel, L);
    },
  });

  bot.phases.push({
    name: "the Waking Node's Heartstones into the Heart; ask for Ember Cores (Governor)",
    when: (b) => dug(b, tunnel) && F.known(b.g, L, heart.x, heart.y),
    act: (b) => {
      lane(b, 'wakingOut', waking.b, heartWest(3), on);
      // The Heart's list wants 60 Ember Cores and the depot's default rows don't ask for them: the
      // depot inspector's Add row offers them (anything made and stable).
      b.request('ember_core', 60, L);
    },
  });

  // After M28 the Waking Node stops: every Heartstone costs two Resonant Cores wherever it is made,
  // but here also two Batteries, and the Attuners (2 each) and the Governor (40) need those.
  bot.phases.push({
    name: 'stop the Waking Node; Attuners on the awake conduit, glass into the depot; dig to nodes 1 and 2 (M29)',
    when: has(28),
    act: (b) => {
      // The pair, its Sequencer and the waking lane come up together; what they hold goes back.
      takeUp(b, 'waking');
      b.clearRect(dep.x + 3, dep.y, dep.x + 4, dep.y + 2, L);
      // The assay is done: the lab comes up (its goods go back) and TM1's port feeds the Attuners.
      const lab = b.get('LAB');
      b.del(lab.x, lab.y, L);
      // Four Attuners on y=36: 120 kW, twice what one awake node lends, so they run at half speed
      // until nodes 1 and 2 wake (Mags: "60 kW more in the conduit"). Glass runs into the depot's
      // north face: A1 and A2 straight down, A3 and A4 east along y=38 into A1's belt.
      for (const [name, x] of [['A1', 18], ['A2', 20], ['A3', 14], ['A4', 16]] as const) {
        const chk = b.g.canPlace('attuner', L, x, 36, S);
        if (!chk.ok) throw new Error(`[${mmss(b.t)}] can't place Attuner ${name} at ${x},36: ${chk.reason}`);
        b.put('attuner', x, 36, S, { name, ...on });
      }
      b.put('belt', 18, 38, S, on);
      b.put('belt', 20, 38, S, on);
      b.run(14, 38, 17, 38, E, L);
      // Thrumstone down x=22 into a chain of splitters along y=35, each dealing left into an Attuner.
      b.put('splitter', 21, 35, W, on);
      b.put('belt', 20, 35, W, on);
      b.put('splitter', 19, 35, W, on);
      b.put('belt', 18, 35, W, on);
      b.put('splitter', 17, 35, W, on);
      b.put('belt', 16, 35, W, on);
      b.put('belt', 15, 35, S, on);
      lane(b, 'thrum', b.get('TM1'), [{ x: 22, y: 35, dir: W }], on);
      // A second Miner on the deposit: four Attuners take 60 thrumstone a minute. It side-loads TM1's line.
      const tm2 = b.put('miner', 26, 31, W, { name: 'TM2', ...on });
      lane(b, 'thrum2', tm2, [{ x: 23, y: 31, dir: W }], on);
      b.dig(toNode1, L);
      b.dig(north, L);
      b.dig(toNode2, L);
    },
  });

  // M30: node 1 only has to wake (one Heartstone); the east-face pair feeds it for that long.
  const pair = (b: Bot, k: string) => {
    b.put('unloader', dep.x + 3, dep.y, E, { filter: 'engine_glass', name: `UG${k}`, ...on });
    b.put('unloader', dep.x + 3, dep.y + 2, E, { filter: 'resonant_core', name: `UR${k}`, ...on });
    b.put('belt', dep.x + 4, dep.y, S, on);
    b.put('belt', dep.x + 4, dep.y + 2, N, on);
    return b.put('sequencer', dep.x + 4, dep.y + 1, E, { name: `S${k}`, ...on });
  };
  bot.phases.push({
    name: 'glass and cores to node 1 through the passage at x=31 (M30)',
    when: (b) => dug(b, toNode1) && F.known(b.g, L, node1.b.x, node1.b.y),
    act: (b) => {
      lane(b, 'node1', pair(b, '1'), node1.b, on);
    },
  });

  // Node 1 is awake: take its feed up (its goods go back to the depot) and rebuild the pair with a
  // fresh Sequencer for node 2, the one that makes the Governor's Heartstones next to the Heart.
  bot.phases.push({
    name: "node 1 is awake: the pair moves to node 2; node 2's Heartstones into the Heart (M30)",
    when: (b) => node1.b.stockCount > 0 && dug(b, north) && dug(b, toNode2) && F.known(b.g, L, node2.b.x, node2.b.y),
    act: (b) => {
      takeUp(b, 'node1');
      b.clearRect(dep.x + 3, dep.y, dep.x + 4, dep.y + 2, L);
      lane(b, 'node2out', node2.b, heart, on);
      lane(b, 'node2', pair(b, '2'), node2.b, on);
    },
  });

  // The Governor: glass, batteries and ember cores from the depot's south face, one lane each.
  bot.phases.push({
    name: 'the Heart: Engine Glass, Batteries and Ember Cores from the depot (M31)',
    when: (b) => b.phases.some((p) => p.done && p.name.startsWith('node 1 is awake')),
    act: (b) => {
      const sy = dep.y + 3;
      b.put('unloader', dep.x, sy, S, { filter: 'ember_core', name: 'UHE', ...on });
      b.put('unloader', dep.x + 1, sy, S, { filter: 'battery', name: 'UHB', ...on });
      b.put('unloader', dep.x + 2, sy, S, { filter: 'engine_glass', name: 'UHG', ...on });
      // Copper ore lies under these rows east of the depot; the lanes cross it (oreCost 0).
      lane(b, 'heartGlass', { x: dep.x + 2, y: sy + 1, feed: S }, heartWest(4), { ...on, oreCost: 0 });
      lane(b, 'heartBattery', { x: dep.x + 1, y: sy + 1, feed: S }, heartWest(5), { ...on, oreCost: 0 });
      lane(b, 'heartEmber', { x: dep.x, y: sy + 1, feed: S }, heartWest(6), { ...on, oreCost: 0 });
    },
  });

  // Once the Heart's panel shows a good full (a toast says the crew stacks the extras by the depot),
  // its Unloader goes off: the extras would only ride round into the depot and back.
  bot.watchers.push({
    name: "the Heart's Unloaders off once its goods are in",
    check: (b) => {
      const p = b.g.s.project;
      if (!p || p.id !== 'governor') return true;
      for (const [name, item] of [['UHE', 'ember_core'], ['UHB', 'battery'], ['UHG', 'engine_glass']] as const) {
        const u = b.named[name] !== undefined ? b.get(name) : null;
        if (!u || u.planned || !u.filter || (p.delivered[item] ?? 0) < PROJECTS.governor.needs[item]) continue;
        b.filter(u, null);
        b.note(`the Heart has all ${PROJECTS.governor.needs[item]} ${ITEMS[item].name}: ${name} off`);
      }
    },
  });

  bot.phases.push({
    name: 'build-out done: plates back to the default request',
    when: (b) => b.phases.some((p) => p.done && p.name.startsWith('the Heart:')) && b.ghosts(L).length === 0,
    act: (b) => {
      b.request('iron_plate', LAYERS[L].requests.iron_plate ?? 0, L);
    },
  });

  // Mags warns when a ghost has waited a minute on goods nobody is bringing: when her advice is the
  // elevator, press "Request the missing goods" on the Alien Strata's ghosts (a good she says to make
  // down here, such as Engine Glass, comes from the Attuners).
  let seen = bot.messages.length;
  bot.watchers.push({
    name: 'react to Mags about starved ghosts',
    check: (b) => {
      for (; seen < b.messages.length; seen++) {
        const m = b.messages[seen];
        const a = m.who === 'mags' ? starveAdvice(m.text) : null;
        if (!a || a.layer !== L || a.advice === 'make' || a.advice === 'deeper') continue;
        for (const gh of b.ghosts(L)) b.requestMissing(gh);
      }
    },
  });
  // What the report wants each second: the conduit pool's load and the lowest balance.
  for (const b of g.s.buildings.values()) if (b.layer === L) st.before.add(b.id);
  bot.watchers.push({
    name: 'conduit pool and money',
    check: (b) => {
      const pw = b.g.layer(L).power;
      if (pw.poolDemand > st.poolPeak) {
        st.poolPeak = pw.poolDemand;
        st.poolAtPeak = pw.pool;
      }
      st.poolSatMin = Math.min(st.poolSatMin, pw.poolSat);
      st.moneyMin = Math.min(st.moneyMin, b.g.s.money);
      const p = b.g.s.project;
      const needs = PROJECTS.governor.needs;
      for (const [k, v] of Object.entries(needs)) {
        if (st.needDone[k] !== undefined) continue;
        if (b.g.s.ended || (p?.id === 'governor' && (p.delivered[k] ?? 0) >= v)) st.needDone[k] = b.t;
      }
    },
  });
  // Wrong items at the nodes come out of their sides: count them (four in a side chute stop a node).
  bot.watchers.push({
    name: 'count Engine Node rejects',
    check: (b) => {
      const n = b.g.s.stats.events.node_reject ?? 0;
      if (n > st.rejects) {
        b.note(`an Engine Node pushed out ${n - st.rejects} wrong item(s) (${n} in all)`);
        st.rejects = n;
      }
    },
  });
}

/**
 * Play Act VI and return the bot at the ending (or when `maxSeconds` of act time ran out). `from` is
 * either a bot handed over from Act V right after D5 (its clock keeps running: bot.t0 marks the act's
 * start) or the options for a fresh start state (startAct(6, from)).
 */
export function playAct6(from: Bot | StartOpts = {}, maxSeconds = ACT6_CAP): Bot {
  let bot: Bot;
  if ('g' in from) {
    bot = from;
    bot.act = 6;
    bot.t0 = bot.t;
  } else {
    bot = startAct(6, from).bot;
  }
  bot.focus(L);
  actSix(bot);
  bot.play(bot.t0 + maxSeconds, (b) => b.g.s.ended);
  return bot;
}

/** Report lines the generic summary doesn't have: the ending, machines, lanes, imports and what bound the act. */
export function act6Report(bot: Bot): string[] {
  const g = bot.g;
  const st = act6State(bot);
  const out: string[] = [];
  const end = bot.projectTimes.governor;
  out.push(`Ending: ${g.s.ended ? `reached at ${actClock(bot, end)}` : 'NOT reached'}; M31 "The Governor" ${g.s.msDone.includes(31) ? `done at ${actClock(bot, bot.msTimes[31])}` : 'not done'}`);
  const kinds: Record<string, number> = {};
  let machines = 0;
  let all = 0;
  for (const b of g.s.buildings.values()) {
    if (b.layer !== L || b.planned || st.before.has(b.id)) continue;
    kinds[b.type] = (kinds[b.type] ?? 0) + 1;
    all++;
    const k = BUILDINGS[b.type].kind;
    if (k === 'machine' || k === 'miner' || k === 'collector' || k === 'lab') machines++;
  }
  out.push(`Machines the bot built on the Alien Strata (standing at the end): ${machines}, of ${all} buildings ${JSON.stringify(kinds)}; the crew's coal rig was there already`);
  out.push(`Lanes laid (tiles): ${st.laid.map((l) => `${l.name} ${l.tiles}${l.takenUp ? ' (taken up)' : ''}`).join(', ')}`);
  out.push(`Engine Nodes: ${F.engineNodes(g).map((n) => `${n.waking ? 'the Waking Node' : `node ${n.b.x},${n.b.y}`} ${n.heartstones} Heartstone(s)`).join(', ')}; wrong items pushed out: ${st.rejects}`);
  out.push(`Conduit pool: Attuners wanted at most ${st.poolPeak} kW (the pool held ${st.poolAtPeak} kW then); lowest share ${st.poolSatMin.toFixed(2)}`);
  const p = PROJECTS.governor.needs;
  const got = g.s.ended ? p : (g.s.project?.delivered ?? {});
  out.push(`Governor: ${Object.entries(p).map(([k, v]) => `${ITEMS[k].name} ${Math.min(v, got[k] ?? 0)}/${v}${st.needDone[k] !== undefined ? ` (full at ${actClock(bot, st.needDone[k])})` : ''}`).join(', ')}`);
  const sup = bot.supplies.filter((s) => ['resonant_core', 'battery', 'ember_core'].includes(s.item));
  out.push(`Imports the Governor waits on (stand-in supply): ${sup.map((s) => `${ITEMS[s.item].name} ${s.perMin}/min from L${s.layer} (${s.added} added)`).join('; ')}`);
  const made = g.s.stats.produced;
  out.push(`Made on the way: ${['thrumstone', 'engine_glass', 'heartstone'].map((k) => `${ITEMS[k].name} ${made[k] ?? 0}`).join(', ')}`);
  out.push(`Money: lowest $${Math.round(st.moneyMin)} during the act, $${Math.round(g.s.money)} at the end`);
  return out;
}
