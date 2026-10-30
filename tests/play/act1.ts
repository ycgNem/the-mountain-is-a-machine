// Act I as a reusable script: a scripted player builds the Surface from the first sale to D1 on the
// real map. tests/act1.test.ts prints and checks it; start.ts's startFromActI() hands its end state
// to Act II.
//
// The layout (x, y are top-left corners; machines push out of one port: a 2x2 from its front-right
// tile, so a Press facing N at (32,14) pushes into (33,13)):
//   starter   Miner (16,24) E -> Smelter (22,24) E -> Splitter (25,25): ahead to the Terminal,
//             left up into the HQ Press P1 (25,22) N -> HQ. A second Miner (17,26) and Smelter
//             (19,26) side-load the lane at (24,25), doubling it.
//   copper    Mags's Miner (43,20) S -> Smelter CS (42,22) W -> Splitter CSP (41,22) W: left down
//             and west along y=24 into the Terminal, right into the wire Press WP (40,20) W ->
//             west along y=20, north up x=34 into the Drill.
//   bricks    stone Miner (28,37) N -> Smelter BS (28,35) N -> north up x=29, a Crossing over the
//             starter lane at (29,25), into the HQ at (29,17) until the Assembler is built.
//   east iron Miners (46,32), (48,33) N -> Smelters (46,30), (48,31) N -> up x=49, west along
//             y=17, a Crossing over the wire line at (34,17), Splitter SP1 (33,17) W: right into
//             the drill Press PD (32,14) N, ahead into the Assembler's Press PA (30,16) N.
//   drill     Assembler AS (30,14) N, plates from PA, bricks from (29,15) E.
//
// After D1 the Drill is gone and the Surface's top station stands in its place (31..33, 10..12):
// the wire line (34,14), PD (33,13) and AS (31,13) then point at empty floor until Act II re-routes
// them. Named buildings: P1, CM, CS, CSP, I2, S2, WP, X1, X2, BS, SM, PD, PA, SP1, SB1, SB2, IB1,
// IB2, AS (bot.get(name)).

import { Game } from '../../src/sim/game';
import { Bot, E, N, S, W } from '../bot';

export interface Style {
  /** A second Miner and Smelter on the starter deposit, merged into the starter lane: twice the HQ plates and twice the iron sales. */
  doubleStarter: boolean;
  /**
   * Lay splitters and crossings with their lines. Without it, lines are dragged straight across
   * working belts (a belt dragged over a belt turns it) and splitters and crossings are swapped in
   * later, which the game refuses while the HQ can't pay for them in full.
   */
  planAhead: boolean;
  /** Build the brick line with the wire line (M3), not when Brickwork asks for it (M4). */
  brickFirst: boolean;
  /** Switch the HQ press to gears whenever the ghosts are short of gears. */
  gearKeeper: boolean;
}

export const EFFICIENT: Style = { doubleStarter: true, planAhead: true, brickFirst: true, gearKeeper: true };
export const STARTER_ONLY: Style = { ...EFFICIENT, doubleStarter: false };
export const CARELESS: Style = { doubleStarter: true, planAhead: false, brickFirst: false, gearKeeper: false };

/** PLAN.md §8: Act I (Surface, D1 done) takes 15-25 minutes; the first sale comes inside 20 s. */
export const ACT1_BAND = { from: 15 * 60, to: 25 * 60 };

/** The seed every new game uses. */
export const SEED = 20261030;

/** The Act I build order, as phases keyed to milestones, plus watchers that tweak recipes. All on layer 0. */
export function actOne(bot: Bot, style: Style): void {
  const has = (n: number) => (b: Bot) => b.g.s.msDone.includes(n);
  const L0 = { layer: 0 };
  bot.adopt('P1', 25, 22, 'press', 0);

  // M1 First Light: the line sells by itself; Mags asks the player to click the Drill.
  bot.phases.push({ name: 'look at the Drill (M1)', when: (b) => b.t >= 5, act: (b) => b.inspectDrill() });

  // M2 Copper Line: Mags marks a Miner on the copper; a smelter right under it, a splitter (later
  // the wire press's feed) and a belt west along y=24 into the Terminal.
  bot.phases.push({
    name: 'copper smelter under Mags\'s Miner, into the terminal (M2)',
    when: has(1),
    act: (b) => {
      b.adopt('CM', 43, 20, 'miner', 0);
      b.put('smelter', 42, 22, W, { recipe: 'copper_ingot', name: 'CS', ...L0 });
      if (style.planAhead) b.put('splitter', 41, 22, W, { name: 'CSP', ...L0 });
      else b.put('belt', 41, 22, S, L0);
      b.put('belt', 41, 23, S, L0);
      b.run(41, 24, 35, 24, W, 0);
    },
  });

  if (style.doubleStarter) {
    bot.phases.push({
      name: 'second iron Miner and Smelter into the starter lane (M2)',
      when: has(1),
      act: (b) => {
        b.put('miner', 17, 26, E, { name: 'I2', ...L0 });
        b.put('smelter', 19, 26, E, { recipe: 'iron_ingot', name: 'S2', ...L0 });
        b.run(21, 27, 23, 27, E, 0);
        b.run(24, 27, 24, 26, N, 0);
      },
    });
  }

  // M3 Wire and Gears: the copper splitter's right exit feeds a wire press whose wire runs into
  // the drill; the HQ press makes the 15 gears.
  let gearBase = -1;
  bot.phases.push({
    name: 'wire press into the drill; P1 on gears (M3)',
    when: has(2),
    act: (b) => {
      // Drill end first so the line works the moment its last ghost is built.
      b.run(34, 14, 34, 16, N, 0);
      if (style.planAhead) b.put('crossing', 34, 17, N, { name: 'X1', ...L0 });
      else b.put('belt', 34, 17, N, L0);
      b.run(34, 18, 34, 20, N, 0);
      b.run(35, 20, 39, 20, W, 0);
      b.put('press', 40, 20, W, { recipe: 'copper_wire', name: 'WP', ...L0 });
      if (!style.planAhead) b.swap('splitter', 41, 22, W, { name: 'CSP', ...L0 });
      b.recipe(b.get('P1'), 'gear');
      gearBase = b.g.s.stats.produced.gear ?? 0;
    },
  });
  let m3GearsDone = false;
  bot.watchers.push({
    name: 'P1 back to plates after 15 gears',
    check: (b) => {
      if (gearBase < 0 || (b.g.s.stats.produced.gear ?? 0) - gearBase < 15) return;
      b.recipe(b.get('P1'), 'iron_plate');
      b.note('P1 back to iron plates');
      m3GearsDone = true;
      return true;
    },
  });
  if (style.gearKeeper) {
    let on = false;
    bot.watchers.push({
      name: 'HQ gear keeper',
      check: (b) => {
        if (!m3GearsDone) return;
        const p1 = b.get('P1');
        const short = b.ghostShortfall(0).gear ?? 0;
        if (!on && short > 0) {
          b.recipe(p1, 'gear');
          on = true;
          b.note(`P1 on gears: ghosts short ${short} gears`);
        } else if (on && short === 0 && (b.g.layer(0).stock.gear ?? 0) >= 8) {
          b.recipe(p1, 'iron_plate');
          on = false;
          b.note('P1 back to iron plates');
        }
      },
    });
  }

  // Bricks: stone Miner -> brick Smelter -> north up x=29 into the HQ's east face. The lane has to
  // cross the starter line's terminal belt at (29,25). A planner swaps a crossing in; a careless
  // player drags the whole lane in one go. Dragging used to turn the starter belt north (iron
  // ingots went up the brick line into the HQ until the player noticed); since DECISIONS #54 the
  // drag lays the crossing by itself, which this run checks.
  let dragAt = -1;
  bot.phases.push({
    name: `stone -> brick -> HQ (${style.brickFirst ? 'early, with the wire line' : 'M4'})`,
    when: has(style.brickFirst ? 2 : 3),
    act: (b) => {
      b.put('belt', 29, 17, W, L0);
      if (style.planAhead) {
        b.run(29, 18, 29, 24, N, 0);
        b.swap('crossing', 29, 25, N, { name: 'X2', ...L0 });
        b.run(29, 26, 29, 34, N, 0);
      } else {
        const laid = b.drag(29, 34, 29, 18, N, 0);
        if (b.g.at(0, 29, 25)?.type === 'crossing') b.note(`dragged the brick lane over the starter lane: the drag laid ${laid.join(', ')}`);
        else {
          dragAt = b.t;
          b.note('the brick belt dragged over the starter lane turned (29,25) north: iron ingots now go up into the HQ');
        }
      }
      b.put('smelter', 28, 35, N, { recipe: 'brick', name: 'BS', ...L0 });
      b.put('miner', 28, 37, N, { name: 'SM', ...L0 });
    },
  });
  if (!style.planAhead) {
    // A careless player notices three minutes after the iron sales stop and swaps a crossing in.
    // Ingots already on the brick line stay there; if it was turned to the Assembler meanwhile,
    // one of them jams its brick input until the player takes the belts up (Bot.clearJams).
    let sold = -1;
    let soldAt = 0;
    bot.watchers.push({
      name: 'notice the iron sales stopped',
      check: (b) => {
        if (dragAt < 0) return;
        const n = b.g.s.stats.sold.iron_ingot ?? 0;
        if (n !== sold) {
          sold = n;
          soldAt = b.t;
          return;
        }
        if (b.t - soldAt < 180) return;
        b.note(`noticed the iron sales stopped (${Math.round(b.t - dragAt)} s after the drag; ${b.g.layer(0).stock.iron_ingot ?? 0} iron ingots in the HQ, where nothing uses them)`);
        b.swap('crossing', 29, 25, N, { name: 'X2', ...L0 });
        return true;
      },
    });
  }

  // The east iron line: two Miners and Smelters on the east deposit, a trunk up x=49 and west
  // along y=17 over the wire line, into a splitter between the drill press (PD) and the
  // assembler's press (PA). A planner lays it with the wire line; a careless player waits for
  // Brickwork to be done.
  bot.phases.push({
    name: 'east iron trunk and drill hub',
    when: has(style.planAhead ? 2 : 4),
    act: (b) => {
      b.put('press', 32, 14, N, { recipe: 'iron_plate', name: 'PD', ...L0 });
      b.put('press', 30, 16, N, { recipe: 'iron_plate', name: 'PA', ...L0 });
      b.put('belt', 33, 16, N, L0);
      b.put('belt', 32, 17, W, L0);
      b.put('splitter', 33, 17, W, { name: 'SP1', ...L0 });
      if (!style.planAhead) b.swap('crossing', 34, 17, N, { name: 'X1', ...L0 });
      b.run(35, 17, 49, 17, W, 0);
      b.run(49, 18, 49, 30, N, 0);
      b.run(48, 29, 47, 29, E, 0);
      b.put('smelter', 46, 30, N, { recipe: 'iron_ingot', name: 'SB1', ...L0 });
      b.put('smelter', 48, 31, N, { recipe: 'iron_ingot', name: 'SB2', ...L0 });
      b.put('miner', 46, 32, N, { name: 'IB1', ...L0 });
      b.put('miner', 48, 33, N, { name: 'IB2', ...L0 });
    },
  });

  // M5 Reinforcement: the assembler on the drill's south face, fed plates straight from PA and
  // bricks by turning the brick line away from the HQ.
  bot.phases.push({
    name: 'assembler on the drill, bricks turned to it (M5)',
    when: has(4),
    act: (b) => {
      b.put('assembler', 30, 14, N, { recipe: 'reinforced_plate', name: 'AS', ...L0 });
      b.put('belt', 29, 15, E, L0);
      b.put('belt', 29, 16, N, L0);
      b.turn(29, 17, N, 0);
    },
  });

  // PD makes the drill's plates, then its gears.
  bot.watchers.push({
    name: 'PD to gears when the drill has its plates',
    check: (b) => {
      if (!b.named.PD || !b.g.s.project || b.g.s.project.id !== 'd1') return;
      if (b.delivered('iron_plate') < b.needs('iron_plate')) return;
      b.recipe(b.get('PD'), 'gear');
      b.note('PD switched to gears');
      return true;
    },
  });
}

/**
 * Play Act I from a new game until D1 is done (or `maxSeconds` of game time pass) and return the bot
 * at that moment: the Shallows have just opened, the clock reads about 14 minutes (efficient style),
 * and the Act I phases and watchers are still attached (all phases have run; the HQ gear keeper
 * keeps switching P1 to gears whenever layer-0 ghosts are short of them).
 */
export function playActI(style: Style = EFFICIENT, seed = SEED, maxSeconds = 60 * 60): Bot {
  const g = Game.create(seed);
  const bot = new Bot(g);
  actOne(bot, style);
  bot.play(maxSeconds, (b) => b.g.s.projectsDone.includes('d1'));
  return bot;
}
