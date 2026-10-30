// Act II as a reusable script: a scripted player takes the Act I factory at D1 down into the
// Shallows (layer 1) and plays to D2 on the real map (seed 20261030). tests/act2.test.ts prints and
// checks it; playAct2() returns the bot at the moment D2 completes, so Act III can chain from it.
//
// The plan a competent player reads off the two maps (x, y are top-left corners; a 2x2 machine pushes
// out of its front-right tile, so a Smelter facing E at (26,13) pushes into (28,14)):
//
//   Surface (the Act I factory; the Drill is gone and the top station stands at 31..33, 10..12, its
//   front facing S): the drill lines are turned into the shaft.
//     AS (30,14) N reinforced plates -> (31,13) W, (30,13) N, (30,12) E into the station's west face.
//     AMS motor Assembler (34,12) N: PD's gears in from (33,13) E, WP's wire straight up x=34 into
//     it; motors out of (35,11) -> (34,11) W into the station's east face. Belt cargo lands in the
//     Shallows depot.
//   Shallows (depot 34..36, 10..12; lower station 31..33, 10..12; the crew's rig: coal Miner (39,14)
//   into Generator (41,14)):
//     steel  rich iron Miner MI1 (24,13) E -> Smelter SI1 (26,13) E -> Foundry F1 (28,13) E -> beam
//            Press PB (30,13) E -> (32,14) N, east along y=13 under the depot -> Splitter SPB (37,13)
//            E: left up (37,12) E into the drill-bit Assembler, ahead onto the drill trunk.
//     coal   Miner MC1 (39,16) W -> Splitter SPC (38,16) W: left into Generator G2 (37,17), ahead
//            west along y=16 and up x=29 into F1's south face.
//     press  rich iron Miner MI2 (23,11) N -> Smelter SI2 (24,9) E -> Press PL (26,9) N -> east along
//            y=8 and down x=34 into the depot: gears while the Shallows ghosts lack them (the HQ
//            has none to spare) or, once the Fungal Caverns are open, while their depot asks for
//            more than the Shallows can spare; plates otherwise.
//     bits   Unloader URP (37,11) E pulls the Surface's reinforced plates out of the depot into
//            Assembler ADB (38,11) S; its drill bits drop onto the trunk at (38,13).
//     motors Unloader UM (37,10) E -> east along y=10, down x=43 onto the trunk.
//     trunk  (38,13) E to x=43, down to (43,18), then through a 1-wide tunnel dug toward the bore
//            site's beacon (it breaks into the hidden copper cavern on the way) into the Drill (56..60,
//            38..42). One trunk carries beams, bits and motors: once the Drill has all of a good,
//            the crew stacks the extras by the depot, so a spare never stops it.
//     after D2  the Drill is gone and the trunk ends on bare floor; ADB comes back on, turned east,
//            and belts its bits into the depot's north face for the Fungal Caverns below.
//
// Named buildings: AMS (L0); MI1 SI1 F1 MC1 SPC MI2 SI2 PL PB SPB G2 URP ADB UM (L1).

import { BUILDINGS } from '../../src/data/buildings';
import { ITEMS } from '../../src/data/items';
import { requestNeed } from '../../src/sim/elevator';
import { Bot, E, N, S, W, starveAdvice } from '../bot';
import { boreSite, depot, drill } from './find';
import { actDone, startFromActI } from './start';

/** PLAN.md §8: Act II takes 20-30 minutes. */
export const ACT2_BAND = { from: 20 * 60, to: 30 * 60 };

export interface Act2Style {
  /** Send every copper ingot to the wire Press (take up the copper splitter's belt to the Terminal): twice the wire for motors, less money. */
  allCopperToWire: boolean;
}

export const COMPETENT: Act2Style = { allCopperToWire: false };

const L0 = { layer: 0 };
const L1 = { layer: 1 };

/** Where the trunk leaves the start pocket, and where the tunnel toward the bore site begins. */
const POCKET_EXIT = { x: 43, y: 18 };

/** Items of `item` riding belts and other slot pieces on a layer (what a player sees on its way to the Drill). */
export function onBelts(bot: Bot, item: string, layer: number): number {
  let n = 0;
  for (const b of bot.g.s.buildings.values()) {
    if (b.layer !== layer || b.planned) continue;
    if (b.item?.id === item) n++;
    if (b.item2?.id === item) n++;
  }
  return n;
}

/** Finished production buildings on a layer (machines, miners, collectors, generators): the machine count. */
export function machineCount(bot: Bot, layer: number): number {
  let n = 0;
  for (const b of bot.g.s.buildings.values()) {
    if (b.layer !== layer || b.planned) continue;
    const k = BUILDINGS[b.type].kind;
    if (k === 'machine' || k === 'miner' || k === 'collector' || k === 'generator') n++;
  }
  return n;
}

/**
 * The Act II build order as phases and watchers, for a bot handed over at D1 by the Act I script
 * (startFromActI, or playActI's bot): the Surface part turns Act I's drill lines (AS, PD, WP) into the
 * shaft, so startAct(2)'s stand-in Surface won't do. Everything is a player action with real costs.
 * Phases are placed in the order the depot should pay for them: ghosts are built oldest first.
 */
export function actTwo(bot: Bot, style: Act2Style = COMPETENT): void {
  const built = (name: string) => (b: Bot) => !!b.named[name] && !b.get(name).planned;
  // Act I's HQ gear keeper stays on: the Surface's motor Assembler needs 6 gears and the HQ has none.
  let trunkLaid = false;

  // M7 Down the Shaft: ride down, light the pocket. The Surface's dead drill lines go into the shaft.
  bot.phases.push({
    name: 'down the shaft: lamps (M7), Surface drill lines into the top station',
    when: () => true,
    act: (b) => {
      b.focus(1);
      for (const [x, y] of [[30, 6], [38, 7], [25, 16]]) b.put('lamp', x, y, N, L1);
      // Surface: the Drill's three feeds now point at empty floor in front of the top station.
      b.put('belt', 31, 13, W, L0);
      b.put('belt', 30, 13, N, L0);
      b.put('belt', 30, 12, E, L0);
      b.put('assembler', 34, 12, N, { recipe: 'motor', name: 'AMS', ...L0 });
      b.put('belt', 33, 13, E, L0);
      b.put('belt', 35, 11, W, L0);
      b.put('belt', 34, 11, W, L0);
      if (style.allCopperToWire) b.del(41, 23, 0);
    },
  });

  // M8 Steel: rich iron straight into a smelter and the foundry; coal from the second coal spot.
  bot.phases.push({
    name: 'steel: iron, coal, foundry (M8)',
    when: () => true,
    act: (b) => {
      b.put('miner', 24, 13, E, { name: 'MI1', ...L1 });
      b.put('smelter', 26, 13, E, { recipe: 'iron_ingot', name: 'SI1', ...L1 });
      b.put('foundry', 28, 13, E, { recipe: 'steel_ingot', name: 'F1', ...L1 });
      b.put('miner', 39, 16, W, { name: 'MC1', ...L1 });
      b.put('splitter', 38, 16, W, { name: 'SPC', ...L1 });
      b.run(37, 16, 30, 16, W, 1);
      b.put('belt', 29, 16, N, L1);
      b.put('belt', 29, 15, N, L1);
    },
  });

  // The crate's 24 gears don't cover the steel line and everything after it, and the HQ has none to
  // spare: a press down here, on gears first (see the keeper below), plates once the ghosts are paid.
  bot.phases.push({
    name: 'Shallows press into the depot (gears, then plates)',
    when: () => true,
    act: (b) => {
      b.put('miner', 23, 11, N, { name: 'MI2', ...L1 });
      b.put('smelter', 24, 9, E, { recipe: 'iron_ingot', name: 'SI2', ...L1 });
      b.put('press', 26, 9, N, { recipe: 'iron_plate', name: 'PL', ...L1 });
      b.run(27, 8, 33, 8, E, 1);
      b.put('belt', 34, 8, S, L1);
      b.put('belt', 34, 9, S, L1);
    },
  });

  bot.phases.push({
    name: 'beam press and splitter (drill bits left, the Drill ahead)',
    when: () => true,
    act: (b) => {
      b.put('press', 30, 13, E, { recipe: 'steel_beam', name: 'PB', ...L1 });
      b.put('belt', 32, 14, N, L1);
      b.run(32, 13, 36, 13, E, 1);
      b.put('splitter', 37, 13, E, { name: 'SPB', ...L1 });
      b.put('belt', 37, 12, E, L1);
    },
  });

  // Power: the rig's 80 kW won't carry two iron lines, the foundry, the presses and the assemblers,
  // and the Surface has nothing to spare up the cable.
  bot.phases.push({
    name: 'second generator on the coal splitter',
    when: () => true,
    act: (b) => {
      b.put('generator', 37, 17, N, { name: 'G2', ...L1 });
    },
  });

  // The beacon shows through the dark from the start, and the trunk needs the tunnel: one belt wide.
  bot.phases.push({
    name: 'dig toward the bore site beacon',
    when: () => true,
    act: (b) => {
      b.digPath(boreSite(b.g, 1)!, { from: POCKET_EXIT, layer: 1 });
    },
  });

  // The trunk to the Drill, once the tunnel is through. It carries beams, bits and motors: a good the
  // Drill has all of goes on into the depot (the crew stacks it there), so nothing blocks it.
  bot.phases.push({
    name: 'trunk through the tunnel into the Drill',
    when: (b) => b.g.layer(1).digQueue.length === 0 && !!boreSite(b.g, 1)?.reached,
    act: (b) => {
      b.run(38, 13, 42, 13, E, 1);
      b.run(43, 13, 43, 17, S, 1);
      b.connect({ ...POCKET_EXIT, feed: S }, drill(b.g, 1)!, { layer: 1 });
      trunkLaid = true;
    },
  });

  // Drill bits: the Surface's reinforced plates come down as belt cargo; beams from the splitter.
  bot.phases.push({
    name: 'drill-bit assembler fed from the depot and the beam splitter',
    when: () => trunkLaid,
    act: (b) => {
      b.put('unloader', 37, 11, E, { filter: 'reinforced_plate', name: 'URP', ...L1 });
      b.put('assembler', 38, 11, S, { recipe: 'drill_bit', name: 'ADB', ...L1 });
    },
  });

  // Motors: once the generator is up (it took the crate's last two), pull the Surface's motors out
  // of the depot onto the trunk.
  bot.phases.push({
    name: 'motor unloader onto the trunk',
    when: (b) => trunkLaid && built('G2')(b) && b.stock('motor', 1) > 0 && b.ghosts(1).every((x) => !BUILDINGS[x.type].cost.motor),
    act: (b) => {
      b.put('unloader', 37, 10, E, { filter: 'motor', name: 'UM', ...L1 });
      b.run(38, 10, 42, 10, E, 1);
      b.run(43, 10, 43, 12, S, 1);
    },
  });

  // Motors: stop pulling them once the Drill's panel shows all 30 in (any still on the trunk go on
  // into the depot).
  bot.watchers.push({
    name: 'motor unloader off when the Drill has its motors',
    check: (b) => {
      if (!b.named.UM) return;
      const need = b.needs('motor');
      if (!need || b.delivered('motor') < need) return;
      b.filter(b.get('UM'), null);
      b.note(`UM off: the Drill has its ${b.delivered('motor')} motors (${onBelts(b, 'motor', 1)} more on the way go into the depot)`);
      return true;
    },
  });

  // Drill bits: once the Drill has (or is about to have) its 50, pause the Assembler so the beam
  // splitter sends every beam ahead to the Drill (beams are what D2 waits on).
  bot.watchers.push({
    name: 'pause the drill-bit Assembler when the Drill has its bits',
    check: (b) => {
      if (!built('ADB')(b)) return;
      const need = b.needs('drill_bit');
      if (!need || b.delivered('drill_bit') + onBelts(b, 'drill_bit', 1) < need) return;
      b.pause(b.get('ADB'));
      b.note(`ADB paused: the Drill has ${b.delivered('drill_bit')} drill bits and ${onBelts(b, 'drill_bit', 1)} are on the way`);
      return true;
    },
  });

  // After D2 the Drill is gone and the trunk ends on bare floor (Mags says the drill lines end where
  // the Drill stood). The Fungal Caverns' Cobalt Drill Heads take a Drill Bit each: ADB comes back
  // on, turned east, and its bits go into the Shallows depot, where the Caverns' depot requests pick
  // them up.
  bot.phases.push({
    name: 'after D2: the drill-bit Assembler into the depot',
    when: (b) => b.g.s.projectsDone.includes('d2') && built('ADB')(b),
    act: (b) => {
      const adb = b.get('ADB');
      b.turn(adb.x, adb.y, E, 1);
      b.pause(adb, false);
      b.connect(adb, depot(b.g, 1), { layer: 1 });
    },
  });

  // The Shallows press makes gears whenever the Shallows ghosts lack them, plates otherwise. Once the
  // Fungal Caverns are open (a chained run), it also makes the gears their depot asks for that the
  // Shallows can't spare (Mags: "The Shallows depot has none to spare: stock it up there").
  let pressOnGears = false;
  bot.watchers.push({
    name: 'Shallows press keeper (gears when the ghosts or the depot below lack them)',
    check: (b) => {
      if (!built('PL')(b)) return;
      const L1 = b.g.layer(1);
      const spare = Math.max(0, (L1.stock.gear ?? 0) - (L1.requests.gear ?? 0));
      const below = b.g.layer(2).open ? Math.max(0, (requestNeed(b.g, 2).gear ?? 0) - spare) : 0;
      const short = (b.ghostShortfall(1).gear ?? 0) + below;
      if (!pressOnGears && short > 0) {
        b.recipe(b.get('PL'), 'gear');
        pressOnGears = true;
        b.note(`PL on gears: Shallows ghosts short ${b.ghostShortfall(1).gear ?? 0} gears, the depot below ${below}`);
      } else if (pressOnGears && short === 0 && (b.g.layer(2).open ? spare : b.stock('gear', 1)) >= 10) {
        b.recipe(b.get('PL'), 'iron_plate');
        pressOnGears = false;
        b.note('PL back to iron plates');
      }
    },
  });

  // "Produce" steps count from the milestone's start: note what a player who built ahead loses.
  const motorsAtStart = bot.g.s.stats.produced.motor ?? 0;
  bot.watchers.push({
    name: 'motors made before Motors (M9) started',
    check: (b) => {
      if (!b.g.s.msDone.includes(8)) return;
      const early = (b.g.s.msBase.produced.motor ?? 0) - motorsAtStart;
      if (early > 0) {
        b.noteFriction(
          `Motors (M9) counts only motors made after it starts (stepProgress in src/sim/progress.ts counts produce steps from msBase): the ${early} the Surface motor Assembler made while Steel (M8) ran ` +
            "don't count, though build steps count what already stands (DECISIONS #50). The objectives panel can't show it: M9 isn't listed until M8 is done",
        );
      }
      return true;
    },
  });

  // Read Mags: a depot running dry gets its request row added or raised, the way the inspector does,
  // when that is her advice.
  let seen = bot.messages.length;
  bot.watchers.push({
    name: "act on Mags's empty-depot warnings",
    check: (b) => {
      for (; seen < b.messages.length; seen++) {
        const m = b.messages[seen];
        const a = m.who === 'mags' ? starveAdvice(m.text) : null;
        if (!a || a.layer !== 1) continue;
        const L = b.g.layer(1);
        if (a.advice === 'request' || a.advice === 'raise') b.request(a.item, Math.min(400, Math.ceil(((L.requests[a.item] ?? 0) + 20) / 10) * 10), 1);
        else b.note(`Mags says the Shallows depot is short of ${ITEMS[a.item].name}: ${m.text.replace(/^.*?\. /, '')}`);
      }
    },
  });
}

export interface PlayAct2Opts {
  style?: Act2Style;
  /** Game seconds of act time to give up after (default 60 minutes). */
  maxSeconds?: number;
  /** Continue from this bot (at the end of Act I) instead of a fresh startFromActI(). */
  bot?: Bot;
}

/**
 * Play Act II from the real end of Act I until D2 is done and Act II's last milestone is paid (or
 * `maxSeconds` of act time pass) and return the bot at that moment: the Fungal Caverns have just
 * opened, and the Act II phases and watchers are still attached.
 */
export function playAct2(opts: PlayAct2Opts = {}): Bot {
  const bot = opts.bot ?? startFromActI().bot;
  if (opts.bot) {
    bot.act = 2;
    bot.t0 = bot.t;
    bot.note(`Act II starts: $${Math.round(bot.g.s.money)}`);
  }
  actTwo(bot, opts.style ?? COMPETENT);
  bot.play(bot.t0 + (opts.maxSeconds ?? 60 * 60), (b) => actDone(b, 2) && b.g.s.msDone.includes(11));
  return bot;
}
