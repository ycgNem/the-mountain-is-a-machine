// Act start states for the pacing bots: the game as if a competent player had just finished the
// earlier acts, built through the game's own code paths (completeProject -> breakthrough for every
// shaft, station, depot and rig; startMilestone for the act's first milestone; upgradeLine and
// upgradeElevator for upgrades), plus stand-ins for the factories those acts built: goods added to
// the depots above the act's layer every second (Bot.supply) and their sales (Bot.income). Goods
// reach the act only by riding the elevators: pulled down by its depot's requests, or carried as
// belt cargo from a station supply. Nothing is ever put straight into the act's own depot.

import { digOutcrop, layStarterLine } from '../../src/app/scenarios';
import { LAYERS } from '../../src/data/layers';
import { MILESTONES, PROJECTS } from '../../src/data/progression';
import { ELEVATOR_UPGRADES, upgradeElevator } from '../../src/sim/elevator';
import { Game } from '../../src/sim/game';
import { completeProject, startMilestone } from '../../src/sim/progress';
import { T_ROCK } from '../../src/sim/types';
import { Bot } from '../bot';
import { EFFICIENT, SEED, playActI } from './act1';
import { digRoute } from './route';

export { SEED };

export type ActNo = 2 | 3 | 4 | 5 | 6;

/** PLAN.md §8 time bands per act, in game seconds from the act's start (Act VI includes the ending). */
export const ACT_BANDS: Record<number, { from: number; to: number }> = {
  1: { from: 15 * 60, to: 25 * 60 },
  2: { from: 20 * 60, to: 30 * 60 },
  3: { from: 40 * 60, to: 60 * 60 },
  4: { from: 40 * 60, to: 60 * 60 },
  5: { from: 40 * 60, to: 60 * 60 },
  6: { from: 30 * 60, to: 45 * 60 },
};

/** The layer an act is played on (Act II: the Shallows, layer 1). */
export function actLayer(act: number): number {
  return act - 1;
}

/** Index into MILESTONES of an act's first milestone. */
export function firstMilestone(act: number): number {
  return MILESTONES.findIndex((m) => m.act === act);
}

/** The drill project that ends an act (d2 for Act II ... governor for Act VI). */
export function actProject(act: number): string {
  return LAYERS[actLayer(act)].project;
}

/** Has the act's drill project been completed? */
export function actDone(bot: Bot, act = bot.act): boolean {
  return bot.g.s.projectsDone.includes(actProject(act));
}

export interface SupplySpec {
  layer: number;
  item: string;
  perMin: number;
  /** 'depot' (default): into that layer's depot, pulled down by requests. 'station': belt cargo into its top station. */
  via?: 'depot' | 'station';
}

/**
 * Money in the bank when each act starts. Act II: what the Act I bot really has at D1 ($374, M7's
 * reward included, since review-3 K11 halved Act I's milestone cash; it was $1,237).
 * Later acts: the previous act's breakthrough reward plus half its other milestone rewards (the
 * other half went on digging, surveys and upgrades), so money is slightly short in an act's first
 * 20 minutes (PLAN §8) and the act's own rewards make it comfortable.
 */
export const ACT_MONEY: Record<ActNo, number> = { 2: 380, 3: 1500, 4: 3400, 5: 5600, 6: 6000 };

/**
 * Money a minute from earlier acts' sales (Bot.income). The Act I factory sells about $90 a minute
 * after D1 if left alone; the starter line (which runs in every start state) is about $25 of that,
 * so Act II gets $60. Each later act's factory adds $40-50 a minute of surplus sold at a Chute.
 */
export const ACT_INCOME: Record<ActNo, number> = { 2: 60, 3: 100, 4: 150, 5: 200, 6: 250 };

/** The Act I factory with its drill lines turned into the HQ: plates (P1, PA), gears (PD), wire (WP), bricks (BS). */
const ACT1_FACTORY: SupplySpec[] = [
  { layer: 0, item: 'iron_plate', perMin: 20 },
  { layer: 0, item: 'gear', perMin: 10 },
  { layer: 0, item: 'copper_wire', perMin: 15 },
  { layer: 0, item: 'brick', perMin: 10 },
];

/**
 * Default stand-ins for earlier acts' factories, per act (items a minute). Rates come from what the
 * act builds and its project needs (PLAN §7, §8), so the act is neither starved nor flooded: the
 * Mk1 shaft (45 a minute, shared by everything) stays the act's real limit, and anything beyond
 * these rates the act has to make itself.
 *   II   the Act I factory (plates, gears, wire, bricks) into the HQ.
 *   III  + the Shallows (Act II): steel beams, motors, plates and gears from its rich iron, and
 *        5 Drill Bits a minute (D3's 100 Cobalt Drill Heads take one each). The Fungal Caverns'
 *        default rows don't ask for Drill Bits: the act requests them (bot.request('drill_bit', n, 2)).
 *   IV   + copper wire from the Shallows' rich copper (D4's 200 circuits need 800 wire: the copper
 *        rides down, DECISIONS #21), cobalt ingots (batteries, crystal machines) and insulation
 *        (resonant cores, stabilizers) from the Fungal Caverns.
 *   V    + circuits and batteries from the Crystal Depths (Ember Cores take 2 circuits each, D5
 *        another 40), more steel beams (160 heat shields) and insulation (insulated belts). Steel
 *        ingots for the forges are left to the Magma Shelf's own rich iron and coal.
 *   VI   + batteries, circuits and 5 Resonant Cores a minute from the Crystal Depths, heat shields
 *        and 3 Ember Cores a minute from the Magma Shelf (the Waking Node alternates Batteries and
 *        Resonant Cores; the Governor takes 60 Ember Cores). The Alien Strata's default rows ask for
 *        Batteries, Resonant Cores and Heat Shields, so those ride down from the first second (the
 *        Resonant Cores through two shafts); Ember Cores wait until the act requests them
 *        (bot.request('ember_core', n, 5)).
 * A 'station' line (belt cargo into a top station, no request needed) stands in for a line that
 * runs straight into the shaft; no default uses it.
 */
export const ACT_SUPPLY: Record<ActNo, SupplySpec[]> = {
  2: [...ACT1_FACTORY],
  3: [
    ...ACT1_FACTORY,
    { layer: 1, item: 'steel_beam', perMin: 6 },
    { layer: 1, item: 'motor', perMin: 3 },
    { layer: 1, item: 'iron_plate', perMin: 10 },
    { layer: 1, item: 'gear', perMin: 5 },
    { layer: 1, item: 'drill_bit', perMin: 5 },
  ],
  4: [
    ...ACT1_FACTORY,
    { layer: 1, item: 'steel_beam', perMin: 8 },
    { layer: 1, item: 'motor', perMin: 3 },
    { layer: 1, item: 'iron_plate', perMin: 10 },
    { layer: 1, item: 'gear', perMin: 5 },
    { layer: 1, item: 'copper_wire', perMin: 20 },
    { layer: 2, item: 'cobalt_ingot', perMin: 8 },
    { layer: 2, item: 'insulation', perMin: 3 },
  ],
  5: [
    ...ACT1_FACTORY,
    { layer: 1, item: 'steel_beam', perMin: 10 },
    { layer: 1, item: 'motor', perMin: 3 },
    { layer: 1, item: 'iron_plate', perMin: 10 },
    { layer: 1, item: 'gear', perMin: 5 },
    { layer: 1, item: 'copper_wire', perMin: 10 },
    { layer: 2, item: 'insulation', perMin: 4 },
    { layer: 2, item: 'cobalt_ingot', perMin: 2 },
    { layer: 3, item: 'circuit', perMin: 6 },
    { layer: 3, item: 'battery', perMin: 1 },
  ],
  6: [
    ...ACT1_FACTORY,
    { layer: 1, item: 'steel_beam', perMin: 6 },
    { layer: 1, item: 'motor', perMin: 2 },
    { layer: 1, item: 'iron_plate', perMin: 10 },
    { layer: 1, item: 'gear', perMin: 5 },
    { layer: 1, item: 'copper_wire', perMin: 10 },
    { layer: 2, item: 'insulation', perMin: 2 },
    { layer: 2, item: 'cobalt_ingot', perMin: 2 },
    { layer: 3, item: 'battery', perMin: 3 },
    { layer: 3, item: 'circuit', perMin: 3 },
    { layer: 3, item: 'resonant_core', perMin: 5 },
    { layer: 4, item: 'heat_shield', perMin: 1 },
    { layer: 4, item: 'ember_core', perMin: 3 },
  ],
};

/**
 * Elevator tiers per shaft (shaft i joins layer i and i+1) when each act starts. Act IV is where a
 * competent player upgrades the Fungal->Crystal shaft (DECISIONS #21: D4's copper makes Mk2 a real
 * call), and Act V the Crystal->Magma one (circuits, batteries and beams for D5); the rest stay Mk1.
 */
export const ACT_TIERS: Record<ActNo, number[]> = { 2: [0], 3: [0, 0], 4: [0, 0, 0], 5: [0, 0, 1, 0], 6: [0, 0, 1, 1, 0] };

/** Lab assays and first-production discoveries each finished act left behind. */
const ACT_ASSAYS: Record<number, string[]> = { 3: ['sapstone', 'glowcap', 'resin'], 4: ['chorus_crystal', 'charged_crystal'], 5: ['emberite'] };
/** Event flags each finished act's milestones raised. */
const ACT_EVENTS: Record<number, string[]> = {
  1: ['first_sale', 'drill_inspected', 'line_upgraded'],
  2: ['surveyed', 'bore_site_reached', 'bore_1', 'generator_fueled'],
  4: ['shield_blocking'],
  5: ['thermal_running'],
};
/** What each finished act made, roughly (for "made:" unlocks, the inspector's "seen" goods and stats). */
const ACT_MADE: Record<number, Record<string, number>> = {
  1: { iron_ore: 1078, iron_ingot: 531, copper_ore: 378, iron_plate: 270, copper_ingot: 187, stone: 216, gear: 50, copper_wire: 76, brick: 104, reinforced_plate: 31 },
  2: { iron_ore: 800, iron_ingot: 400, coal: 250, steel_ingot: 190, steel_beam: 155, gear: 120, copper_ore: 360, copper_ingot: 180, copper_wire: 360, motor: 45, reinforced_plate: 55, drill_bit: 55 },
  3: { sapstone: 440, cobalt_ore: 420, resin: 270, cobalt_ingot: 240, glowcap: 160, mycelium: 400, spore_dust: 60, biofuel: 12, insulation: 210, filter: 70, cobalt_drill_head: 100 },
  4: { chorus_crystal: 700, cut_crystal: 330, crystal_grit: 120, charged_crystal: 330, conductive_powder: 420, overcharged_crystal: 66, resonant_core: 66, battery: 110, circuit: 210 },
  5: { emberite: 700, aggregate: 760, slag: 120, hot_ember_ingot: 100, cold_ember_ingot: 8, ember_core: 72, heat_shield: 168 },
};

export interface StartOpts {
  seed?: number;
  /** Money when the act starts (default ACT_MONEY). */
  money?: number;
  /** Stand-in supply (default ACT_SUPPLY[act]); [] for none. */
  supply?: SupplySpec[];
  /** Stand-in income a minute (default ACT_INCOME[act]). */
  income?: number;
  /** Elevator tier per shaft (default ACT_TIERS[act]). */
  tiers?: number[];
}

/**
 * The game as if a competent player had just finished every act before `act` (startAct(3) or
 * startAct(3, seed) or startAct(3, { seed, money, supply, income, tiers })), at the moment of the
 * breakthrough into the act's layer, with the bot focused on that layer (not yet visited: call
 * bot.focus(layer), which also ticks Act II's "Go down to the Shallows" step). The clock reads 0.
 *
 * - Every earlier drill project is delivered and completed by the game's own completeProject, so
 *   each shaft, station pair, depot (starter crate, default requests), crew rig and hidden drill is
 *   exactly where real play puts it. The act's layer is untouched: its depot holds the starter crate
 *   (LAYERS[layer].starterCrate) and its default request rows (LAYERS[layer].requests); the HQ keeps
 *   its "Keep for the Surface" floor rows (LAYERS[0].requests).
 * - Every earlier finished layer has a 2-wide tunnel dug from its arrival to its bore site (the
 *   player had to reach the drill), by the game's own digCell.
 * - Earlier milestones are done with their rewards (Sorter license) and unlocks (assays, first
 *   productions, events); the act's first milestone has just started (startMilestone).
 * - The Company Line is at 160 kW (bought with upgradeLine), and shafts are at ACT_TIERS (bought
 *   with the game's upgradeElevator).
 * - Depots above the act hold their own request rows (the HQ: its floor rows) plus two minutes of
 *   their supply, and the stand-in supply and income run from the first second.
 */
export function startAct(act: ActNo, seedOrOpts: number | StartOpts = {}): { g: Game; bot: Bot } {
  const opts: StartOpts = typeof seedOrOpts === 'number' ? { seed: seedOrOpts } : seedOrOpts;
  const g = Game.create(opts.seed ?? SEED);
  // Act I's tutorial line (the one a new game used to open with) runs in every start state, and the
  // Copper Line dug the rock out of its way.
  layStarterLine(g);
  digOutcrop(g);
  const s = g.s;
  const layer = actLayer(act);
  // Earlier drill projects, delivered and completed: breakthrough builds every shaft, station, depot and rig.
  while (s.deepest < layer && s.project) {
    const p = s.project;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
  }
  // Earlier players dug through to their bore sites.
  for (let li = 1; li < layer; li++) {
    const a = LAYERS[li].arrival!;
    const b = LAYERS[li].boreSite!;
    const cells = digRoute(g, li, { x: a.x, y: a.y + 2 }, { x: b.x, y: b.y }, 2) ?? [];
    for (const c of cells) if (g.layer(li).terrain[c.y * g.layer(li).w + c.x] === T_ROCK) g.digCell(li, c.x, c.y);
  }
  // Earlier milestones, with their rewards.
  const first = firstMilestone(act);
  for (let i = 0; i < first; i++) {
    const m = MILESTONES[i];
    if (s.msDone.includes(m.n)) continue;
    s.msDone.push(m.n);
    if (m.reward.money) g.earn(m.reward.money);
    if (m.reward.license && !s.licenses.includes(m.reward.license)) s.licenses.push(m.reward.license);
  }
  // What those milestones left behind: assays, first productions, events, production totals.
  for (let a = 1; a < act; a++) {
    for (const id of ACT_ASSAYS[a] ?? []) {
      if (!s.assaysDone.includes(id)) s.assaysDone.push(id);
      s.assays[id] = 20;
    }
    for (const e of ACT_EVENTS[a] ?? []) s.stats.events[e] = 1;
    for (const [k, v] of Object.entries(ACT_MADE[a] ?? {})) s.stats.produced[k] = (s.stats.produced[k] ?? 0) + v;
    if (a >= 2 && !s.visited.includes(a - 1)) s.visited.push(a - 1);
  }
  // The Company Line at 160 kW, as Act I bought it.
  s.money += 1600;
  while (g.upgradeLine());
  // Elevator upgrades earlier acts made, bought with the game's own upgradeElevator. It pays from the
  // lower depot first, so the goods go there: a starter crate below is never spent on them.
  const tiers = opts.tiers ?? ACT_TIERS[act];
  for (const sh of s.shafts) {
    while (sh.tier < (tiers[sh.id] ?? 0)) {
      const next = ELEVATOR_UPGRADES[sh.tier + 1];
      const bottom = g.layer(sh.layers[1]);
      for (const [k, v] of Object.entries(next.cost)) bottom.stock[k] = (bottom.stock[k] ?? 0) + v;
      s.money += next.money;
      if (!upgradeElevator(g, sh.id)) throw new Error(`could not upgrade shaft ${sh.id}`);
    }
  }
  // Depots above the act in a steady state: their own requests met, plus two minutes of supply.
  const supply = opts.supply ?? ACT_SUPPLY[act];
  for (const sp of supply) if (sp.layer >= layer) throw new Error(`supply of ${sp.item} goes into layer ${sp.layer}, not above the act's layer ${layer}`);
  for (let li = 0; li < layer; li++) {
    const L = g.layer(li);
    L.stock = { ...L.requests };
    for (const sp of supply) if (sp.layer === li && (sp.via ?? 'depot') === 'depot') L.stock[sp.item] = (L.stock[sp.item] ?? 0) + Math.round(sp.perMin * 2);
  }
  s.money = opts.money ?? ACT_MONEY[act];
  s.income.fill(0);
  // The act's first milestone starts now (Mags's intro is the first event).
  g.events.length = 0;
  startMilestone(g, first);
  const bot = new Bot(g, layer);
  bot.act = act;
  bot.t0 = s.time;
  for (const sp of supply) bot.supply(sp.layer, sp.item, sp.perMin, sp.via ?? 'depot');
  bot.income(opts.income ?? ACT_INCOME[act]);
  bot.note(`Act ${act} starts on ${LAYERS[layer].name}: $${Math.round(s.money)}, shafts ${s.shafts.map((q) => `Mk${q.tier + 1}`).join(' ')}, ${supply.length} supply lines, $${bot.incomePerMin}/min income`);
  return { g, bot };
}

/**
 * Act II from the real end of Act I: runs the efficient Act I bot to D1 (about a second) and hands
 * over its game and bot, focused on the Surface, with the clock at about 14 minutes (bot.t0 marks
 * the act's start). The Act I factory is really there, so there is no stand-in supply unless asked
 * for. Its drill lines point at empty floor now (the top station replaced the Drill); turning them
 * into the HQ or the top station is Act II's call. The Act I phases and watchers stay attached.
 */
export function startFromActI(opts: { seed?: number; supply?: SupplySpec[]; income?: number } = {}): { g: Game; bot: Bot } {
  const bot = playActI(EFFICIENT, opts.seed ?? SEED);
  if (!bot.g.s.projectsDone.includes('d1')) throw new Error('the Act I bot did not finish D1');
  bot.act = 2;
  bot.t0 = bot.t;
  for (const sp of opts.supply ?? []) bot.supply(sp.layer, sp.item, sp.perMin, sp.via ?? 'depot');
  if (opts.income) bot.income(opts.income);
  bot.note(`Act II starts from the real end of Act I: $${Math.round(bot.g.s.money)}`);
  return { g: bot.g, bot };
}
