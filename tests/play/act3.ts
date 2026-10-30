// Act III as a reusable script: a scripted player plays the Fungal Caverns (layer 2) from the
// breakthrough to D3 on the real map (seed 20261030), from the act's start state (tests/play/start.ts,
// startAct(3)) or from a chained run. Every move is one a player can make, at its real cost: ghosts
// built from the depot, request rows the elevator serves, digging, recipes and Unloader filters.
// What the bot leans on that the game never says goes to Bot.noteFriction.
//
// The plan, by milestone (coordinates are the seed's map):
//   M13  a miner on the sapstone west of the depot feeds an Assay Lab; a survey of the way to the
//        bore site's beacon, then the tunnel through the caverns it shows.
//   M14  the lab comes up: the sapstone splits to two Separators; cobalt ore goes to a smelter, the
//        resin (their side output) into the depot, which holds the surplus.
//   M15  a fiber room dug out north of the depot: a harvester on the glowcap patch, two presses, a
//        filter assembler and an insulation assembler fed resin from the depot by an Unloader, and
//        a Spore Filter over the sapstone line.
//   M16  drill heads: Unloaders on the depot push Drill Bits (requested from the Shallows) and cobalt
//        ingots into an assembler; its heads go back into the depot.
//   M17  a Spore Collector in the patch's thick spores and a harvester feed a biofuel assembler that
//        burns its fuel in a generator beside it.
//   M18  the trunk: an Unloader on the depot, switched between the goods the Drill's panel still
//        shows short, belts them through the tunnel to the Drill (extras that arrive after a good is
//        full go on into the depot). Once the Drill's filters are covered, the filter assembler makes
//        insulation too.
//   And when the power meter turns amber, a second coal rig on the start pocket's coal.

import { BUILDINGS } from '../../src/data/buildings';
import { ITEMS } from '../../src/data/items';
import { PROJECTS } from '../../src/data/progression';
import { shaftTraffic } from '../../src/sim/elevator';
import { DX, DY, type Building, type Dir } from '../../src/sim/types';
import { Bot, E, N, S, W, mmss, starveAdvice } from '../bot';
import * as F from './find';
import { actClock } from './report';
import type { RoutePiece } from './route';
import { ACT_BANDS, type StartOpts, startAct } from './start';

export const L2 = 2;

/** PLAN §8: Act III takes 40-60 minutes. */
export const ACT3_BAND = ACT_BANDS[3];

/** A generous cap on the act: half again the band's ceiling. */
export const ACT3_CAP = 90 * 60;

/** The drill goods D3 asks for. */
const D3_GOODS = ['cobalt_drill_head', 'insulation', 'filter'];

/** The trunk to the drill: its cells (Unloader first) and the cell that feeds the drill. */
export interface Trunk {
  cells: F.Cell[];
  end: F.Cell | null;
}

/** Per-run state of the Act III script, for the report. Times are game seconds. */
export interface Act3State {
  trunk: Trunk;
  /** Buildings on the layer before the act (the crew's station, depot, coal rig and drill). */
  before: Set<number>;
  /** When each named building of the plan was built. */
  builtAt: Record<string, number>;
  /** When each D3 good reached its need, and when the first one reached the Drill (-1: not yet). */
  full: Record<string, number>;
  firstDelivery: number;
  /** When the filter assembler went over to insulation (-1: never). */
  switchedAt: number;
  /** The last second a ghost stood on the layer. */
  lastGhostAt: number;
  /** The sapstone line's speed in the spores while no Spore Filter stood over it, by machine name. */
  sporeBefore: Record<string, number>;
  /** Seconds a Separator stood blocked (an output with nowhere to go: the resin backing up). */
  sepBlockedSec: number;
  /** Seconds the layer's power fell short, and its lowest satisfaction. */
  lowPowerSec: number;
  minSat: number;
  /** Seconds the Shallows-to-Caverns elevator ran full, and the first and last of them. */
  shaftFull: { sec: number; from: number; to: number };
  moneyMin: number;
}

const STATE = new WeakMap<Bot, Act3State>();

/** The Act III script's state for a bot that played it. */
export function act3State(bot: Bot): Act3State | undefined {
  return STATE.get(bot);
}

/** The Act III build order, as phases keyed to milestones, plus watchers. */
export function actThree(bot: Bot): void {
  const g = bot.g;
  const has = (n: number) => (b: Bot) => b.g.s.msDone.includes(n);
  const trunk: Trunk = { cells: [], end: null };
  const before = new Set<number>();
  for (const b of g.s.buildings.values()) if (b.layer === L2) before.add(b.id);
  const st: Act3State = {
    trunk,
    before,
    builtAt: {},
    full: {},
    firstDelivery: -1,
    switchedAt: -1,
    lastGhostAt: -1,
    sporeBefore: {},
    sepBlockedSec: 0,
    lowPowerSec: 0,
    minSat: 1,
    shaftFull: { sec: 0, from: -1, to: -1 },
    moneyMin: g.s.money,
  };
  STATE.set(bot, st);

  // M13 Something Growing: a miner on the sapstone feeds the lab its samples. The bore site's beacon
  // shows through the dark; a survey on the way there shows the caverns between, and the tunnel runs
  // through them (a cavern opens once the tunnel meets it straight on).
  bot.phases.push({
    name: 'down to the Fungal Caverns: a lab on the sapstone; survey, then the tunnel to the beacon (M13)',
    when: () => true,
    act: (b) => {
      b.focus(L2);
      b.put('miner', 47, 36, E, { name: 'SM1', layer: L2 });
      b.put('assay_lab', 49, 37, S, { name: 'LAB', layer: L2 });
      b.survey(30, 28, L2);
      const bore = F.boreSite(g, L2)!;
      b.digPath(bore, { layer: L2 });
    },
  });

  // M14 Wash or Separate: the lab has done its job; SM1's sapstone splits to two separators. Their
  // cobalt ore goes to a smelter, their resin into the depot (it buffers the surplus). The assay
  // also shows the drill head's recipe (two cobalt ingots and a Drill Bit from the Shallows), so the
  // depot starts asking for bits.
  bot.phases.push({
    name: 'take up the lab; SM1 -> splitter -> two separators, ore to a smelter, resin to the depot (M14)',
    when: (b) => b.g.s.assaysDone.includes('sapstone'),
    act: (b) => {
      b.request('drill_bit', 40, L2);
      b.del(49, 37, L2);
      b.put('splitter', 49, 37, E, { name: 'SP1', layer: L2 });
      const z1 = b.put('separator', 50, 37, S, { name: 'Z1', layer: L2 });
      const z2 = b.put('separator', 48, 38, W, { name: 'Z2', layer: L2 });
      const cs = machine(b, 'smelter', 49, 42, S, 'cobalt_ingot', 'CS');
      const depot = F.depot(g, L2);
      b.connect(z1, cs);
      b.connect(z2, cs);
      b.connect(z1, depot, { side: true });
      b.connect(z2, depot, { side: true });
      b.connect(cs, depot);
      // A room for the fiber line: dig out the rock between the cavern and the north glowcap patch,
      // and a gap through the rock north of the sapstone for the trunk to the drill.
      b.digRect(50, 27, 58, 33, L2);
      b.digRect(51, 34, 53, 34, L2);
      b.dig([{ x: 52, y: 35 }], L2);
    },
  });

  // The fiber room (after the dig): glowcap from the north patch, two presses, a filter assembler
  // and an insulation assembler fed resin from the depot; their goods ride the resin line into the
  // depot. A spore filter over the sapstone line for Clean Air (M15).
  bot.phases.push({
    name: 'fiber room: harvester, presses, filter and insulation assemblers; resin from the depot (M15)',
    when: (b) => b.g.recipeUnlocked('filter') && b.g.layer(L2).digQueue.length === 0,
    act: (b) => {
      b.put('harvester', 60, 27, W, { name: 'HVA', layer: L2 });
      path(b, 59, 27, 'WW');
      b.put('splitter', 57, 27, W, { name: 'SPG', layer: L2 });
      path(b, 56, 27, 'WWS');
      b.put('press', 57, 28, S, { name: 'MPF', layer: L2 });
      b.put('press', 53, 28, S, { name: 'MPI', layer: L2 });
      machine(b, 'assembler', 57, 30, S, 'filter', 'FA');
      machine(b, 'assembler', 53, 30, S, 'insulation', 'IA');
      // Resin: an Unloader on the depot's north face, up the east side and west along row 33.
      b.put('unloader', 62, 38, N, { name: 'UR', layer: L2, filter: 'resin' });
      path(b, 62, 37, 'ENNNWWNWWWW+WNN');
      b.put('splitter', 55, 31, N, { name: 'SPR', layer: L2 });
      path(b, 56, 31, 'E');
      // Products down into the resin line on row 38 (crossing row 36, where the trunk will run).
      path(b, 57, 32, 'S+SS+S');
      path(b, 53, 32, 'SSSS+S');
      b.put('spore_filter', 49, 35, N, { name: 'SF1', layer: L2 });
      askForGhosts(b);
    },
  });

  // Drill heads: two Unloaders on the depot's east face (Drill Bits from the elevator, Cobalt Ingots
  // from the smelter) push straight into an assembler; its heads go back into the depot.
  bot.phases.push({
    name: 'drill-head assembler on the depot: bits and ingots by Unloader, heads back in',
    when: (b) => built(b, 'FA') && built(b, 'IA'),
    act: (b) => {
      b.put('unloader', 63, 39, E, { name: 'UB', layer: L2, filter: 'drill_bit' });
      b.put('unloader', 63, 40, E, { name: 'UI', layer: L2, filter: 'cobalt_ingot' });
      machine(b, 'assembler', 64, 39, S, 'cobalt_drill_head', 'DH');
      path(b, 64, 41, 'WW');
      askForGhosts(b);
    },
  });

  // A second spore filter over the fiber room (the north patch's spores slow its presses), clear of
  // the patch's far side, where the spore collector will stand.
  bot.phases.push({
    name: 'second spore filter over the fiber room',
    when: has(15),
    act: (b) => {
      b.put('spore_filter', 55, 29, N, { name: 'SF2', layer: L2 });
      askForGhosts(b);
    },
  });

  // M17 Spore Power: a collector in the thickest spores on the north patch and a harvester feed a
  // biofuel assembler, which burns its fuel in a generator next to it.
  bot.phases.push({
    name: 'spore collector, harvester and biofuel assembler into a generator (M17)',
    when: has(15),
    act: (b) => {
      b.put('harvester', 62, 26, E, { name: 'HVC', layer: L2 });
      path(b, 64, 27, 'ES');
      b.put('spore_collector', 63, 28, E, { name: 'SC', layer: L2 });
      machine(b, 'assembler', 65, 28, S, 'biofuel', 'BA');
      b.put('generator', 64, 30, N, { name: 'GB', layer: L2 });
      askForGhosts(b);
    },
  });

  // The trunk to the drill: an Unloader on the depot's north face, west along row 36 through the gap
  // dug north of the sapstone, then the router's way through the tunnel to the drill.
  bot.phases.push({
    name: 'the trunk: depot -> tunnel -> the Drill',
    when: (b) => built(b, 'DH') && b.ghosts(L2).length === 0,
    act: (b) => {
      const u = b.put('unloader', 61, 38, N, { name: 'UT', layer: L2 });
      trunk.cells.push({ x: u.x, y: u.y });
      trunk.cells.push(...pathCells(61, 37, 'NWWWW+WWW+NNWW'));
      path(b, 61, 37, 'NWWWW+WWW+NNWW');
      const drill = F.drill(g, L2)!;
      const pieces = b.connect({ x: 50, y: 34, feed: W }, drill);
      trunk.cells.push(...pieces.map((p) => ({ x: p.x, y: p.y })));
      const last = pieces[pieces.length - 1];
      trunk.end = { x: last.x, y: last.y };
      askForGhosts(b);
    },
  });

  // What the trunk Unloader pulls: a drill good the Drill's panel still shows short and the depot has
  // to spare, keeping to the good it is on while there is some. Filters wait for the filter buildings
  // the plan hasn't placed yet (the depot already leaves planned ghosts what they hold). A good that
  // fills while more of it rides the trunk is no trouble: the Drill passes the extras into the depot.
  // Once D3 is done the player turns it off.
  bot.watchers.push({
    name: 'trunk feed',
    check: (b) => {
      const u = b.named.UT !== undefined ? b.get('UT') : null;
      if (!u || u.planned) return;
      const p = g.s.project;
      if (!p || p.id !== 'd3') {
        b.filter(u, null);
        return true;
      }
      const reserve = filterReserve(b);
      let pick: string | null = null;
      let best = 0;
      for (const it of D3_GOODS) {
        const left = b.needs(it) - b.delivered(it);
        const spare = b.stock(it, L2) - (it === 'filter' ? reserve : 0);
        if (left <= 0 || spare <= 0) continue;
        const score = it === u.filter ? 1e6 : left;
        if (score > best) {
          best = score;
          pick = it;
        }
      }
      if (u.filter !== pick) b.filter(u, pick);
    },
  });

  // Once the Drill's filters are covered (delivered, on the trunk or in the depot, beyond what the
  // filter buildings still need), the filter assembler makes insulation too: the depot shows the
  // filters piling up and the Drill's panel shows how much insulation is still to come.
  bot.watchers.push({
    name: 'filters covered: the filter assembler makes insulation',
    check: (b) => {
      const p = g.s.project;
      if (!built(b, 'FA') || !p || p.id !== 'd3') return;
      const fa = b.get('FA');
      if (fa.recipe !== 'filter') return true;
      const covered = b.delivered('filter') + (trunkCounts(b, trunk).filter ?? 0) + b.stock('filter', L2) - filterReserve(b);
      if (covered < b.needs('filter')) return;
      b.recipe(fa, 'insulation');
      st.switchedAt = b.t;
      b.note(`the Drill's ${b.needs('filter')} filters are covered (${b.delivered('filter')} delivered, the rest on the trunk or in the depot): FA makes insulation now`);
      return true;
    },
  });

  // The power meter turns amber once the build-out outgrows the crew's coal rig and the Shallows'
  // cable: the player puts a second rig on the start pocket's coal, below the first.
  bot.watchers.push({
    name: 'power short: a second coal rig',
    check: (b) => {
      if (g.layer(L2).power.sat >= 0.95) return;
      b.note(`L2 power ${g.layer(L2).power.demand} kW wanted, satisfaction ${g.layer(L2).power.sat.toFixed(2)}: a second coal rig`);
      b.put('miner', 63, 46, E, { name: 'CM2', layer: L2 });
      b.put('generator', 65, 46, E, { name: 'CG2', layer: L2 });
      askForGhosts(b);
      return true;
    },
  });

  // Mags warns when a ghost has waited a minute on goods nobody brings. When her advice is the
  // elevator, the player opens the ghost and presses "Request the missing goods" on the newest one (it
  // covers the whole queue ahead); a good she says to make down here comes from the layer's own line.
  let seen = bot.messages.length;
  bot.watchers.push({
    name: 'answer Mags about starved ghosts',
    check: (b) => {
      for (; seen < b.messages.length; seen++) {
        const m = b.messages[seen];
        const a = m.who === 'mags' ? starveAdvice(m.text) : null;
        if (!a || a.layer !== L2) continue;
        if (a.advice === 'make' || a.advice === 'deeper') b.note(`Mags: make the ${ITEMS[a.item].name} down here (the line makes it)`);
        else askForGhosts(b);
      }
    },
  });

  // The record for the report (reads only).
  bot.watchers.push({
    name: 'act III record',
    check: (b) => {
      const p = g.s.project;
      if (p && p.id === 'd3') {
        for (const it of D3_GOODS) {
          const n = p.delivered[it] ?? 0;
          if (n > 0 && st.firstDelivery < 0) st.firstDelivery = b.t;
          if (st.full[it] === undefined && n >= b.needs(it)) st.full[it] = b.t;
        }
      }
      for (const name of Object.keys(b.named)) if (st.builtAt[name] === undefined && built(b, name)) st.builtAt[name] = b.t;
      if (b.ghosts(L2).length) st.lastGhostAt = b.t;
      if (!built(b, 'SF1')) for (const name of ['SM1', 'Z1', 'Z2', 'CS']) if (built(b, name)) st.sporeBefore[name] = b.get(name).envMul;
      for (const name of ['Z1', 'Z2']) if (built(b, name) && b.get(name).status === 'blocked') st.sepBlockedSec++;
      const pw = g.layer(L2).power;
      if (pw.sat < 0.999) st.lowPowerSec++;
      st.minSat = Math.min(st.minSat, pw.sat);
      const sh = g.s.shafts.find((q) => q.layers[1] === L2);
      if (sh && shaftTraffic(g, sh.id).full) {
        st.shaftFull.sec++;
        if (st.shaftFull.from < 0) st.shaftFull.from = b.t;
        st.shaftFull.to = b.t;
      }
      st.moneyMin = Math.min(st.moneyMin, g.s.money);
    },
  });
}

/** Drill goods on the trunk right now, by item (the Unloader's slot included). */
function trunkCounts(b: Bot, trunk: Trunk): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of trunk.cells) {
    const o = b.g.at(L2, c.x, c.y);
    if (!o) continue;
    if (o.item) out[o.item.id] = (out[o.item.id] ?? 0) + 1;
    if (o.item2) out[o.item2.id] = (out[o.item2.id] ?? 0) + 1;
  }
  return out;
}

/**
 * Filters the depot must keep: what the layer's planned ghosts hold (a depot Unloader leaves those),
 * and the cost of the filter buildings the plan hasn't placed yet (both spore filters, the collector).
 */
function filterReserve(b: Bot): number {
  let n = b.g.ghostHolds(L2).filter ?? 0;
  for (const [name, type] of [['SF1', 'spore_filter'], ['SF2', 'spore_filter'], ['SC', 'spore_collector']] as const) {
    if (b.named[name] === undefined) n += BUILDINGS[type].cost.filter ?? 0;
  }
  return n;
}

/** Has the named building been placed and built (not a ghost)? */
function built(b: Bot, name: string): boolean {
  const id = b.named[name];
  if (id === undefined) return false;
  const s = b.g.s.buildings.get(id);
  return !!s && !s.planned;
}

/** "Request the missing goods" on the newest ghost on the layer (its rows cover the queue ahead of it). */
function askForGhosts(b: Bot): void {
  const q = b.g.ghostQueue(L2);
  const last = q[q.length - 1];
  if (last) b.requestMissing(last);
}

/** The cells a path() string lays, in order. */
function pathCells(x: number, y: number, dirs: string): F.Cell[] {
  const DIR: Record<string, Dir> = { N, E, S, W };
  let d: Dir = N;
  let cx = x;
  let cy = y;
  const out: F.Cell[] = [];
  for (const ch of dirs) {
    if (ch !== '+') d = DIR[ch];
    out.push({ x: cx, y: cy });
    cx += DX[d];
    cy += DY[d];
  }
  return out;
}

/** Place a machine, setting a recipe only if the game has unlocked it (the inspector's picker). */
function machine(b: Bot, type: string, x: number, y: number, dir: Dir, recipe: string | null, name: string): Building {
  const m = b.put(type, x, y, dir, { name, layer: L2 });
  if (recipe) {
    if (!b.g.recipeUnlocked(recipe)) throw new Error(`[${mmss(b.t)}] ${recipe} is not unlocked yet for ${name}`);
    b.recipe(m, recipe);
  }
  return m;
}

/**
 * Lay a belt path on the act's layer, starting at (x, y): each letter is the facing of the belt on
 * that cell (N E S W), and the next cell is the way it faces. '+' lays a Crossing and carries on
 * straight (the line passes through it on its own axis); one already there stays. Bot.lay puts the
 * Crossings down first, and holds the whole path back while the depot can't pay to swap one in over
 * a working belt.
 */
function path(b: Bot, x: number, y: number, dirs: string): void {
  const DIR: Record<string, Dir> = { N, E, S, W };
  let d: Dir = N;
  let cx = x;
  let cy = y;
  const pieces: RoutePiece[] = [];
  for (const ch of dirs) {
    if (ch !== '+') d = DIR[ch];
    pieces.push({ x: cx, y: cy, dir: d, type: ch === '+' ? 'crossing' : 'belt' });
    cx += DX[d];
    cy += DY[d];
  }
  b.lay(pieces, { layer: L2 });
}

/**
 * Play Act III and return the bot when D3 is done (or when `maxSeconds` of act time ran out). `from`
 * is either a bot handed over from Act II right after D2 (its clock keeps running: bot.t0 marks the
 * act's start) or the options for a fresh start state (startAct(3, from)).
 */
export function playAct3(from: Bot | StartOpts = {}, maxSeconds = ACT3_CAP): Bot {
  let bot: Bot;
  if (from instanceof Bot) {
    bot = from;
    bot.act = 3;
    bot.t0 = bot.t;
  } else {
    bot = startAct(3, from).bot;
  }
  actThree(bot);
  bot.play(bot.t0 + maxSeconds, (b) => b.g.s.projectsDone.includes('d3'));
  return bot;
}

/** Machines standing on a layer (miners, machines, collectors, generators), as the Act II test counts them. */
export function machineCount(bot: Bot, layer = L2): number {
  let n = 0;
  for (const b of bot.g.s.buildings.values()) {
    if (b.layer !== layer || b.planned) continue;
    const k = BUILDINGS[b.type].kind;
    if (k === 'machine' || k === 'miner' || k === 'collector' || k === 'generator') n++;
  }
  return n;
}

/** What Act III adds to the summary: the build, D3 and what bound it, spores, resin, power, the elevator, money. */
export function act3Report(bot: Bot): string[] {
  const g = bot.g;
  const st = act3State(bot);
  if (!st) return ['(no Act III record: actThree() never ran on this bot)'];
  const out: string[] = [];
  const done = bot.projectTimes.d3;
  const needs = PROJECTS.d3.needs;
  // A good that filled on D3's last tick is recorded at D3's time.
  const full: Record<string, number> = { ...st.full };
  if (done !== undefined && done >= 0) for (const k of Object.keys(needs)) full[k] ??= done;
  const got = done !== undefined ? needs : g.s.project?.id === 'd3' ? g.s.project.delivered : {};

  const kinds: Record<string, number> = {};
  let all = 0;
  for (const b of g.s.buildings.values()) {
    // The station of the shaft D3 opens is the game's, not the bot's.
    if (b.layer !== L2 || b.planned || st.before.has(b.id) || BUILDINGS[b.type].kind === 'elevator') continue;
    kinds[b.type] = (kinds[b.type] ?? 0) + 1;
    all++;
  }
  out.push(
    `Machines on the Fungal Caverns at the end: ${machineCount(bot)} (the crew's coal rig included); the bot built ${all} buildings ${JSON.stringify(kinds)}; ` +
      `the last ghost stood at ${actClock(bot, st.lastGhostAt)}`,
  );
  out.push(
    `D3: ${Object.entries(needs).map(([k, v]) => `${ITEMS[k].name} ${Math.min(v, got[k] ?? 0)}/${v}${full[k] !== undefined ? ` (full at ${actClock(bot, full[k])})` : ''}`).join(', ')}; ` +
      `first good at the Drill ${actClock(bot, st.firstDelivery)}; the filter assembler went over to insulation ${st.switchedAt >= 0 ? `at ${actClock(bot, st.switchedAt)}` : 'never'}; ` +
      `extras the Drill passed into the depot: ${Object.entries(bot.surplus.d3 ?? {}).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(', ') || 'none'}`,
  );
  const rate = (it: string) => bot.perMin(it, 300).toFixed(1);
  const bits = bot.supplies.find((s) => s.item === 'drill_bit');
  out.push(
    `Made a minute over the last 5 minutes: Cobalt Drill Head ${rate('cobalt_drill_head')}, Cobalt Ingot ${rate('cobalt_ingot')}, Insulation ${rate('insulation')}, Resin ${rate('resin')}; ` +
      `Drill Bits come from the Shallows' stand-in at ${bits ? `${bits.perMin}/min (${bits.added} added)` : 'none'}`,
  );
  const named = Object.keys(bot.named).filter((n) => built(bot, n)).map((n) => ({ n, b: bot.get(n) }))
    .filter(({ b }) => b.layer === L2 && !BUILDINGS[b.type].sporeImmune && (BUILDINGS[b.type].kind === 'machine' || BUILDINGS[b.type].kind === 'miner'));
  out.push(
    `Spores: until SF1 stood (${actClock(bot, st.builtAt.SF1)}) the sapstone line ran at ${Object.entries(st.sporeBefore).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ') || '-'}; ` +
      `at the end ${named.map(({ n, b }) => `${n} ${Math.round(b.envMul * 100)}%`).join(', ')}`,
  );
  const made = g.s.stats.produced;
  const L = g.layer(L2);
  const forBuildings = 2 * (BUILDINGS.spore_filter.cost.filter ?? 0) + (BUILDINGS.spore_collector.cost.filter ?? 0);
  out.push(
    `Resin: ${made.resin ?? 0} separated, ${(made.insulation ?? 0) + (made.filter ?? 0)} into insulation and filters, ${L.stock.resin ?? 0} in the depot at the end; ` +
      `the Separators stood blocked ${st.sepBlockedSec} s in all (the depot takes their resin); no Washer built, no resin burned; ` +
      `filters made ${made.filter ?? 0} (the Drill took ${needs.filter}, the buildings ${forBuildings}), insulation made ${made.insulation ?? 0}`,
  );
  const pw = bot.powerStats(L2);
  out.push(
    `Power on the Fungal Caverns: peak ${pw.peak} kW at ${actClock(bot, pw.peakAt)}, short for ${st.lowPowerSec} s (lowest satisfaction ${st.minSat.toFixed(2)}); ` +
      `${made.biofuel ?? 0} biofuel made`,
  );
  out.push(
    `Elevator Shallows > Fungal Caverns: full for ${st.shaftFull.sec} s${st.shaftFull.sec ? ` between ${actClock(bot, st.shaftFull.from)} and ${actClock(bot, st.shaftFull.to)}` : ''}`,
  );
  out.push(`Money: lowest $${Math.round(st.moneyMin)} during the act, $${Math.round(g.s.money)} at the end`);
  return out;
}
