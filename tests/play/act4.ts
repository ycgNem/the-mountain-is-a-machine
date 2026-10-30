// Act IV as a reusable script: a scripted player opens the Crystal Depths (layer 3) and plays it from
// the breakthrough to D4 on the real map (seed 20261030): assay the chorus crystal, cut and charge it
// behind shield walls, crush charged crystal for powder, make circuits, batteries and resonant cores,
// power the layer with Resonance Taps, and belt it all into the Drill. tests/act4.test.ts prints and
// checks it; a later act can chain from playAct4's bot.
//
// The layout (x, y are top-left corners; a 2x2 pushes out of its front-right tile, see find.portOf):
//   vent      Miner MA (21,19) N on the start pocket's chorus vent; its port (22,18) feeds the Assay
//             Lab (21,16) for M19, then the chorus lane up x=22 into the Cutter.
//   quiet     Cutter K (21,8) W -> belt (20,8) -> Charger B (18,8) W -> Splitter SPB (17,8): ahead
//             into the Overcharger Q (14,8) W, which pushes straight into the Stabilizer NS (12,8) S
//             (an overcharged crystal never touches a belt); left down the charged lane x=17. Shield
//             walls (20,9) (K|B), (16,9) (B|Q) and (19,11) (the crusher below|K, B, Q) keep the
//             sensitive line at full speed and raise "Quiet Please".
//   depot hub The charged lane ends in Splitter SPC (17,12) S: left into the Crusher CR (18,12) S
//             (crush charged), which pushes powder into the circuit Assembler CA (18,14) E; ahead
//             into the depot's east face (17,13 W). UW (17,14) E feeds CA wire. Circuits run (20,15)
//             S, west along y=16 into the depot at (16,16). The battery Assembler BA (14,17) E takes
//             charged crystals (UCB 14,16) and cobalt (UB 15,16) and pushes batteries up x=16 into
//             the depot. Insulation leaves the depot's north face (UI 14,12 N) and runs west along
//             y=11 and up x=11 into NS's west face.
//   2nd line  Once the Drill has its batteries, the battery corner becomes a second circuit line:
//             Crusher CR2 (13,17) E on UCB's charged crystals, Assembler CA2 (15,17) S with wire from
//             UW2 (15,16, the cobalt unloader put down again), circuits east along y=19 and up x=19
//             into the y=16 lane.
//   drill     A survey at (40,12) shows the caverns between the start pocket and the Drill's beacon;
//             the rock is thinnest along y=10, so the dig tool goes along that row. Cores leave NS at
//             (12,10) and the router belts them east along y=10 (crossings over the charged lane at
//             (17,10) and the chorus lane at (22,10)) into the Drill at (54,10). Unloaders UCIR
//             (16,12) and UBAT (15,12) put the depot's circuits and batteries onto it once the
//             overcharger, stabilizer and taps are paid for.
//   power     Resonance Taps by the noisy machines (T1 20,12 by CR and CA, more where the ghost
//             predicts two or more interferers) on top of the Fungal Caverns' 60 kW cable.
//
// Watchers: Mags's starved-ghost warnings (her advice: request what comes from above, make the rest
// down here), more taps while the power bar stays short, the battery assembler and the overcharger
// pause once the Drill has or will have its batteries and cores, and each depot unloader stops once
// the Drill's panel shows its good full (any still on the line go on into the depot).
//
// Chained from an earlier act's bot, the script first pauses machines still making goods nothing
// needs any more (the Act III drill-head assembler would eat the Fungal Caverns' cobalt).
//
// Named buildings: MA, LAB, K, B, SPB, SPC, Q, NS, CR, CA, BA, UW, UCB, UB, UI, UCIR, UBAT, CR2, CA2,
// UW2 (UB with a new filter), T1.. (bot.get).

import { BUILDINGS } from '../../src/data/buildings';
import { ITEMS } from '../../src/data/items';
import { ASSAYS, CONTRACTS, MILESTONES, PROJECTS } from '../../src/data/progression';
import { FUELS, RECIPES } from '../../src/data/recipes';
import { ELEVATOR_UPGRADES } from '../../src/sim/elevator';
import { DX, DY, type Building, type Dir } from '../../src/sim/types';
import { Bot, E, N, S, W, mmss, starveAdvice } from '../bot';
import * as F from './find';
import { actDone, startAct, type StartOpts } from './start';

/** The Crystal Depths. */
export const L3 = 3;

export interface Act4Opts extends StartOpts {
  /** Game seconds of act time before giving up (default 90 minutes). */
  maxSeconds?: number;
  /** Chain from an earlier act's bot instead of startAct(4) (its layer 3 must have just opened). */
  from?: Bot;
}

/** Play Act IV from its start state (or a chained bot) until D4 is done or the cap runs out. */
export function playAct4(opts: Act4Opts = {}): Bot {
  const bot = opts.from ?? startAct(4, opts).bot;
  if (opts.from) {
    bot.act = 4;
    bot.t0 = bot.t;
  }
  actFour(bot);
  bot.play(bot.t0 + (opts.maxSeconds ?? 90 * 60), (b) => actDone(b, 4));
  return bot;
}

const has = (n: number) => (b: Bot) => b.g.s.msDone.includes(n);
/**
 * A building this script named, if it stands (or is planned) on the Crystal Depths. A chained bot
 * still carries the earlier acts' names (Act III has its own UI, UB and LAB on the Fungal Caverns).
 */
function own(b: Bot, name: string): Building | undefined {
  const id = b.named[name];
  const x = id === undefined ? undefined : b.g.s.buildings.get(id);
  return x && x.layer === L3 ? x : undefined;
}
const built = (name: string) => (b: Bot) => {
  const x = own(b, name);
  return !!x && !x.planned;
};

/** The Act IV build order as phases keyed to milestones and what stands, plus watchers. All on layer 3. */
export function actFour(bot: Bot): void {
  const at = { layer: L3 };
  pauseSpentLines(bot);
  bot.focus(L3);
  bot.watchItems[L3] = ['copper_wire', 'cobalt_ingot', 'insulation', 'steel_beam', 'iron_plate', 'gear', 'charged_crystal', 'circuit', 'battery'];

  // M19 The Singing Rock: Mags asks for an assay. A Miner on the vent in the start pocket pushes
  // straight into an Assay Lab (both paid from the starter crate).
  bot.put('miner', 21, 19, N, { name: 'MA', ...at });
  bot.put('assay_lab', 21, 16, N, { name: 'LAB', ...at });

  // M20 Order Matters: cut, then charge. The lab has done its job: take it up (its goods go back to
  // the depot) and run the chorus up to a Cutter; a Charger behind a shield wall; the charged
  // crystals down a lane that feeds a Crusher (crush charged: 2 powder each, into a circuit
  // Assembler) and the depot. The circuit recipe shows the copper it eats (4 wire each, 800 for D4),
  // and Mags said wire comes down the shaft: ask the depot to keep 400.
  bot.phases.push({
    name: 'cut, wall, charge, crush (M20, M21)',
    when: has(19),
    act: (b) => {
      b.del(21, 16, L3);
      b.note('took up the Assay Lab (assay done)');
      b.run(22, 18, 22, 10, N, L3);
      b.put('cutter', 21, 8, W, { recipe: 'cut_crystal', name: 'K', ...at });
      b.put('belt', 20, 8, W, at);
      b.put('shield_wall', 20, 9, N, at);
      b.put('charger', 18, 8, W, { recipe: 'charge_cut', name: 'B', ...at });
      b.put('splitter', 17, 8, W, { name: 'SPB', ...at });
      b.put('belt', 16, 8, W, at);
      b.put('shield_wall', 16, 9, N, at);
      // The charged lane down x=17 to a splitter: left into the crusher, ahead into the depot's east face.
      b.run(17, 9, 17, 11, S, L3);
      b.put('splitter', 17, 12, S, { name: 'SPC', ...at });
      b.put('belt', 17, 13, W, at);
      b.put('shield_wall', 19, 11, N, at);
      b.put('crusher', 18, 12, S, { recipe: 'crush_charged', name: 'CR', ...at });
      b.put('assembler', 18, 14, E, { recipe: 'circuit', name: 'CA', ...at });
      b.put('unloader', 17, 14, E, { filter: 'copper_wire', name: 'UW', ...at });
      // Circuits back into the depot's south face.
      b.put('belt', 20, 15, S, at);
      b.run(20, 16, 17, 16, W, L3);
      b.put('belt', 16, 16, N, at);
      b.request('copper_wire', 400, L3);
      // The Drill's beacon shows through the dark to the east. A survey halfway there shows the
      // caverns in between; along y=10 the rock is thinnest (a cavern at x 38-45): drag the dig tool
      // along that row to the Drill.
      b.survey(40, 12, L3);
      b.digRect(29, 10, 53, 10, L3);
    },
  });

  // The first Charged Crystal unlocks the Overcharger, Stabilizer, Battery and Resonance Tap. The
  // Stabilizer's cost shows Insulation, which no row asks for yet.
  bot.phases.push({
    name: 'taps, batteries, the overcharger and stabilizer (M22)',
    when: (b) => (b.g.s.stats.produced.charged_crystal ?? 0) > 0,
    act: (b) => {
      b.request('insulation', 40, L3);
      b.put('resonance_tap', 20, 12, N, { name: 'T1', ...at });
      b.put('assembler', 14, 17, E, { recipe: 'battery', name: 'BA', ...at });
      b.put('unloader', 14, 16, S, { filter: 'charged_crystal', name: 'UCB', ...at });
      b.put('unloader', 15, 16, S, { filter: 'cobalt_ingot', name: 'UB', ...at });
      b.run(16, 18, 16, 17, N, L3);
      b.put('overcharger', 14, 8, W, { recipe: 'overcharge', name: 'Q', ...at });
      b.put('stabilizer', 12, 8, S, { recipe: 'stabilize', name: 'NS', ...at });
    },
  });

  // Insulation for the stabilizer out of the depot's north face, west along y=11 and up x=11 into its
  // west face. (Off the station's arrivals it would only flow while the depot's row is unmet.)
  bot.phases.push({
    name: 'insulation to the stabilizer',
    when: built('NS'),
    act: (b) => {
      b.put('unloader', 14, 12, N, { filter: 'insulation', name: 'UI', ...at });
      b.run(14, 11, 12, 11, W, L3);
      b.run(11, 11, 11, 10, N, L3);
      b.put('belt', 11, 9, E, at);
    },
  });

  // The drill line, once the overcharger, stabilizer and first tap have their circuits: from the
  // stabilizer's port along the dug row into the Drill, crossing the charged and chorus lanes.
  const line: F.Cell[] = [];
  bot.phases.push({
    name: 'the drill line along y=10',
    when: (b) => built('Q')(b) && built('NS')(b) && built('T1')(b) && b.g.layer(L3).digQueue.length === 0,
    act: (b) => {
      // 45 belts and pieces: ask the depot for more plate than its row of 30.
      b.request('iron_plate', 60, L3);
      const pieces = b.connect(own(b, 'NS')!, F.drill(b.g, L3)!, { layer: L3 });
      // The depot's circuits and batteries side-load it from the south at (16,10) and (15,10).
      for (const x of [15, 16]) if (!pieces.some((p) => p.x === x && p.y === 10)) throw new Error(`the drill line misses ${x},10, where the depot's unloaders feed it`);
      b.put('unloader', 16, 12, N, { filter: 'circuit', name: 'UCIR', ...at });
      b.put('belt', 16, 11, N, at);
      b.put('unloader', 15, 12, N, { filter: 'battery', name: 'UBAT', ...at });
      b.put('belt', 15, 11, N, at);
      line.push(...pieces.map((p) => ({ x: p.x, y: p.y })), { x: 16, y: 11 }, { x: 15, y: 11 });
    },
  });

  // Batteries done, circuits still short, charged crystals and wire piling up in the depot: the
  // battery corner becomes a second crusher and circuit assembler. The battery assembler comes up
  // (its goods back to the depot), the crusher takes UCB's charged crystals, the cobalt unloader is
  // turned to wire for the new assembler, whose circuits join the first line's lane into the depot.
  bot.phases.push({
    name: 'batteries done: a second circuit line in the battery corner',
    when: (b) => {
      const p = b.g.s.project;
      return !!p && p.id === 'd4' && (p.delivered.battery ?? 0) >= PROJECTS.d4.needs.battery && (p.delivered.circuit ?? 0) < PROJECTS.d4.needs.circuit - 20;
    },
    act: (b) => {
      b.del(14, 17, L3);
      delete b.named.BA;
      b.del(16, 18, L3);
      b.del(16, 17, L3);
      b.note('took up the battery assembler and its belts');
      b.put('crusher', 13, 17, E, { recipe: 'crush_charged', name: 'CR2', ...at });
      // Wire comes in from the north (UW2 above it), so it faces south and its circuits run east
      // along y=19 and up x=19 into the circuit lane on y=16.
      b.put('assembler', 15, 17, S, { recipe: 'circuit', name: 'CA2', ...at });
      b.run(15, 19, 18, 19, E, L3);
      b.run(19, 19, 19, 17, N, L3);
      // The cobalt unloader becomes a wire unloader (its filter, in the inspector: the cobalt ingot it
      // still holds goes back to the depot).
      const ub = own(b, 'UB')!;
      b.filter(ub, 'copper_wire');
      b.named.UW2 = ub.id;
      delete b.named.UB;
      b.note('the cobalt unloader at 15,16 now unloads Copper Wire into the second circuit assembler (UW2)');
    },
  });

  watchStarved(bot);
  watchPower(bot);
  watchDrill(bot, line);
}

/**
 * After a breakthrough the earlier acts' machines keep running. One still making only goods that no
 * recipe, building, generator, elevator upgrade, open drill project, milestone or contract takes (the
 * Act III drill-head assembler, once D3 is through) just eats inputs this act needs: pause it, as a
 * player would. Chained from the Act III bot that is its drill-head assembler on the Fungal Caverns,
 * which would keep eating the cobalt; a no-op from startAct(4).
 */
function pauseSpentLines(bot: Bot): void {
  const g = bot.g;
  const used = new Set<string>([...CONTRACTS.map((c) => c.item), ...Object.keys(FUELS), ...Object.keys(ASSAYS)]);
  for (const r of Object.values(RECIPES)) for (const k of Object.keys(r.inputs)) used.add(k);
  for (const d of Object.values(BUILDINGS)) for (const k of Object.keys(d.cost)) used.add(k);
  for (const u of ELEVATOR_UPGRADES) for (const k of Object.keys(u.cost)) used.add(k);
  for (const p of Object.values(PROJECTS)) if (!g.s.projectsDone.includes(p.id)) for (const k of Object.keys(p.needs)) used.add(k);
  for (const m of MILESTONES) if (!g.s.msDone.includes(m.n)) for (const st of m.steps) if ('item' in st) used.add(st.item);
  for (const b of g.s.buildings.values()) {
    if (b.planned || b.paused || !b.recipe) continue;
    const outs = Object.keys(RECIPES[b.recipe].outputs);
    if (outs.some((k) => used.has(k))) continue;
    bot.pause(b);
    bot.note(`paused the ${BUILDINGS[b.type].name} at ${b.x},${b.y} on L${b.layer}: its ${outs.map((k) => ITEMS[k].name).join(', ')} are no longer needed`);
  }
}

/**
 * Mags's starved-ghost warning names a depot, an item and what to do. Goods she says to make down
 * here (circuits, batteries: this layer's own line makes them) are on their way from its machines;
 * for the rest the player presses "Request the missing goods" on the first ghost that needs it.
 */
function watchStarved(bot: Bot): void {
  let seen = bot.messages.length;
  bot.watchers.push({
    name: 'answer Mags when a ghost starves',
    check: (b) => {
      for (; seen < b.messages.length; seen++) {
        const m = b.messages[seen];
        const a = m.who === 'mags' ? starveAdvice(m.text) : null;
        if (!a || a.layer !== L3) continue;
        if (a.advice === 'make' || a.advice === 'deeper') continue;
        for (const gh of b.g.ghostQueue(L3)) {
          if (!(BUILDINGS[gh.type].cost[a.item] > 0)) continue;
          b.requestMissing(gh);
          break;
        }
      }
    },
  });
}

/**
 * Power: the layer runs on the 60 kW cable and its taps. When the power bar stays short, place another
 * Resonance Tap where its ghost predicts the most interferers (the ghost shows it), up to six taps.
 */
function watchPower(bot: Bot): void {
  let shortSince = -1;
  bot.watchers.push({
    name: 'more taps when power runs short',
    check: (b) => {
      const pw = b.g.layer(L3).power;
      if (pw.sat >= 0.97) {
        shortSince = -1;
        return;
      }
      if (shortSince < 0) shortSince = b.t;
      if (b.t - shortSince < 30) return;
      if (!b.g.isUnlocked('made:charged_crystal')) return;
      const taps = [...b.g.s.buildings.values()].filter((x) => x.layer === L3 && x.type === 'resonance_tap');
      if (taps.some((x) => x.planned) || taps.length >= 6) return;
      const best = bestTapSpot(b);
      if (!best || best.links < 2) return;
      const name = `T${taps.length + 1}`;
      b.put('resonance_tap', best.x, best.y, N, { name, layer: L3 });
      b.note(`power ${pw.demand} kW wanted, satisfaction ${pw.sat.toFixed(2)}: tap ${name} at ${best.x},${best.y} (ghost predicts ${best.links} interferers, ${best.links * 20} kW)`);
      shortSince = b.t;
    },
  });
}

/** The free 2x2 spot whose tap ghost predicts the most interferers (never one blocking a belt's path). */
function bestTapSpot(bot: Bot): { x: number; y: number; links: number } | null {
  const g = bot.g;
  let best: { x: number; y: number; links: number } | null = null;
  const blocked = new Set<number>();
  const L = g.layer(L3);
  for (const b of g.s.buildings.values()) {
    if (b.layer !== L3) continue;
    // Cells a belt, unloader or machine pushes into stay clear (a tap there would stop a line).
    const ahead = (d: Dir) => (b.y + DY[d]) * L.w + b.x + DX[d];
    if (BUILDINGS[b.type].size === 1) blocked.add(ahead(b.dir));
  }
  // The battery corner's later second circuit line: CR2, CA2 and their circuits along y=19 and x=19.
  const later = (x: number, y: number) => (y >= 17 && y <= 18 && x >= 13 && x <= 16) || (y === 19 && x >= 15 && x <= 19) || (x === 19 && y >= 17 && y <= 19);
  for (let y = 17; y <= 19; y++) for (let x = 13; x <= 19; x++) if (later(x, y)) blocked.add(y * L.w + x);
  for (const s of F.freeSpots(g, L3, 2, { limit: 400 })) {
    const cells = g.footprintCells(L3, s.x, s.y, 2);
    if (cells.some((i) => blocked.has(i))) continue;
    // Keep the drill tunnel row and the chorus column free.
    if (s.y <= 10 && s.y + 1 >= 10) continue;
    const p = F.predict(g, 'resonance_tap', L3, s.x, s.y);
    if (!best || p.links > best.links) best = { x: s.x, y: s.y, links: p.links };
  }
  return best;
}

/**
 * One line carries cores, circuits and batteries into the Drill. Making: once the Drill has, or will
 * have, all its batteries or cores (delivered, plus those on the line and, for cores, inside the
 * overcharger and stabilizer), the battery assembler or the overcharger pauses, so its charged
 * crystals go to circuits. Sending: once the Drill's panel shows a good full, its depot unloader goes
 * off; any still on the line go on into the depot.
 */
function watchDrill(bot: Bot, line: F.Cell[]): void {
  const made = new Set<string>();
  const sent = new Set<string>();
  bot.watchers.push({
    name: 'stop making and sending finished drill goods',
    check: (b) => {
      const p = b.g.s.project;
      if (!p || p.id !== 'd4') return;
      const needs = PROJECTS.d4.needs;
      const done = goodsDone.get(b) ?? {};
      goodsDone.set(b, done);
      const onWay: Record<string, number> = {};
      const add = (id: string, n = 1) => (onWay[id] = (onWay[id] ?? 0) + n);
      for (const c of line) {
        const x = b.g.at(L3, c.x, c.y);
        if (!x || x.planned) continue;
        if (x.item) add(x.item.id);
        if (x.item2) add(x.item2.id);
      }
      const ns = own(b, 'NS');
      const q = own(b, 'Q');
      if (ns && q) {
        for (const it of ns.outBuf) add(it.id);
        add('resonant_core', (ns.inBuf.overcharged_crystal ?? 0) + (ns.active ? 1 : 0) + q.outBuf.length + (q.active ? 1 : 0));
      }
      for (const [item, need] of Object.entries(needs)) {
        const del = p.delivered[item] ?? 0;
        const ba = own(b, 'BA');
        if (!made.has(item) && del + (onWay[item] ?? 0) >= need && (item === 'battery' || item === 'resonant_core')) {
          made.add(item);
          if (item === 'battery' && ba) b.pause(ba);
          if (item === 'resonant_core' && q) b.pause(q);
          b.note(`the Drill has or will have all ${need} ${ITEMS[item].name} (${del} in, ${onWay[item] ?? 0} on the way): paused the ${item === 'battery' ? 'battery assembler' : 'overcharger'}`);
        }
        if (del < need) continue;
        done[item] ??= b.actTime;
        if (sent.has(item)) continue;
        sent.add(item);
        const ucir = own(b, 'UCIR');
        const ubat = own(b, 'UBAT');
        if (item === 'circuit' && ucir) b.filter(ucir, null);
        if (item === 'battery' && ubat) b.filter(ubat, null);
        b.note(`the Drill has all ${need} ${ITEMS[item].name}: stopped sending more`);
      }
      // Once the Drill has all its batteries and cores, the shaft can stop hauling cobalt and insulation
      // for them (the stabilizer finishes what is in it first).
      for (const [item, input] of [['battery', 'cobalt_ingot'], ['resonant_core', 'insulation']] as const) {
        if ((p.delivered[item] ?? 0) >= needs[item] && b.g.layer(L3).requests[input] !== undefined) b.request(input, 0, L3);
      }
    },
  });
}

/** The act time each D4 good was fully delivered, per bot (filled by the drill watcher). */
const goodsDone = new WeakMap<Bot, Record<string, number>>();

/** What Act IV adds to the summary: what stands on the Crystal Depths, the taps, when each D4 good was in. */
export function act4Report(bot: Bot): string[] {
  const g = bot.g;
  const kinds: Record<string, number> = {};
  let walls = 0;
  let unloaders = 0;
  const taps: string[] = [];
  for (const b of g.s.buildings.values()) {
    if (b.layer !== L3 || b.planned) continue;
    const d = BUILDINGS[b.type];
    if (b.type === 'shield_wall') walls++;
    if (b.type === 'unloader') unloaders++;
    if (b.type === 'resonance_tap') taps.push(`${b.x},${b.y}`);
    if (!d.fixed && d.size >= 2) kinds[d.name] = (kinds[d.name] ?? 0) + 1;
  }
  // The last good in completes the project, which the watcher no longer sees: that is D4's time.
  const d4 = bot.projectTimes.d4;
  const done = { ...goodsDone.get(bot) };
  const needs = PROJECTS.d4.needs;
  if (d4 !== undefined && d4 >= 0) for (const k of Object.keys(needs)) done[k] ??= d4 - bot.t0;
  return [
    `Machines on the Crystal Depths at the end: ${act4Machines(bot)} (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}); ${walls} Shield Walls, ${unloaders} Unloaders; Resonance Taps at ${taps.join(' ') || 'none'}`,
    `D4 goods all in at: ${Object.entries(needs).map(([k, n]) => `${n} ${ITEMS[k].name} ${done[k] !== undefined ? mmss(done[k]) : '--:--'}`).join(', ')}`,
  ];
}

/** Buildings of a type on layer 3 (built ones unless `ghosts`). */
export function act4Count(bot: Bot, type: string, ghosts = false): number {
  let n = 0;
  for (const b of bot.g.s.buildings.values()) if (b.layer === L3 && b.type === type && b.planned === ghosts) n++;
  return n;
}

/** Machines (2x2 and up, not fixed) standing on layer 3: the act's machine count. */
export function act4Machines(bot: Bot): number {
  let n = 0;
  for (const b of bot.g.s.buildings.values()) {
    if (b.layer !== L3 || b.planned) continue;
    const d = BUILDINGS[b.type];
    if (!d.fixed && d.size >= 2) n++;
  }
  return n;
}

export type { Building };
