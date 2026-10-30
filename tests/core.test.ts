// Smoke tests for the act bots' core: every act start state (tests/play/start.ts), Act II from the
// real end of Act I, and the helpers the act scripts lean on: finders (tests/play/find.ts), the
// belt router (tests/play/route.ts) and how lanes with Crossings go down, digging, surveys, depot
// requests, elevator upgrades, reading what the game says, and the watchers on layers below the
// Surface (tests/bot.ts).

import { describe, expect, it } from 'vitest';
import { LAYERS } from '../src/data/layers';
import { MILESTONES, PROJECTS } from '../src/data/progression';
import { Game, STOCK_CAP } from '../src/sim/game';
import { outputPort, sidePort } from '../src/sim/logistics';
import { newBuilding, type Building } from '../src/sim/types';
import { Bot, E, N, S, starveAdvice } from './bot';
import { SEED } from './play/act1';
import * as F from './play/find';
import { pushCells } from './play/route';
import { ACT_MONEY, ACT_SUPPLY, ACT_TIERS, type ActNo, actLayer, firstMilestone, startAct, startFromActI } from './play/start';

const ACTS: ActNo[] = [2, 3, 4, 5, 6];

describe.each(ACTS)('Act %i start state', (act) => {
  it('opens the act layer on its depot and station, with every earlier act done', () => {
    const { g, bot } = startAct(act);
    const li = actLayer(act);
    expect(g.layer(li).open).toBe(true);
    expect(g.s.deepest).toBe(li);
    for (let k = li + 1; k < LAYERS.length; k++) expect(g.layer(k).open).toBe(false);
    expect(g.s.project?.id).toBe(LAYERS[li].project);
    expect(g.s.projectsDone.length).toBe(act - 1);
    expect(g.s.milestone).toBe(firstMilestone(act));
    expect(MILESTONES[g.s.milestone].act).toBe(act);
    expect(g.s.msDone).toEqual(MILESTONES.slice(0, firstMilestone(act)).map((m) => m.n));
    expect(g.s.money).toBe(ACT_MONEY[act]);
    expect(g.s.lineLevel).toBe(2);
    expect(g.s.licenses).toContain('sorter');
    expect(g.s.shafts.map((sh) => sh.tier)).toEqual(ACT_TIERS[act]);
    expect(g.s.time).toBe(0);
    expect(bot.layer).toBe(li);
    expect(bot.t0).toBe(0);
    // The lower station faces the depot right next to it; the depot holds the starter crate.
    const depot = F.depot(g, li);
    const station = F.lowerStation(g, li)!;
    expect(depot.type).toBe('depot');
    expect(station.dir).toBe(E);
    expect(g.at(li, station.x + 3, station.y + 1)?.id).toBe(depot.id);
    expect(g.layer(li).stock).toEqual(LAYERS[li].starterCrate);
    expect(g.layer(li).requests).toEqual(LAYERS[li].requests);
    expect(g.layer(0).requests).toEqual(LAYERS[0].requests); // the HQ's "Keep for the Surface" floor
    // Every layer above has its top station; every finished underground layer was dug through to it.
    for (let k = 0; k < li; k++) expect(F.topStation(g, k), `top station on layer ${k}`).toBeTruthy();
    for (let k = 1; k < li; k++) expect(F.boreSite(g, k)?.reached, `bore site on layer ${k}`).toBe(true);
    // The stand-ins only feed layers above the act.
    for (const s of bot.supplies) expect(s.layer).toBeLessThan(li);
    expect(bot.supplies.length).toBe(ACT_SUPPLY[act].length);
    // The bot reads what the game says: Mags's intro to the act's first milestone.
    bot.wait(1);
    expect(bot.messages[0]).toMatchObject({ who: 'mags', text: MILESTONES[firstMilestone(act)].intro });
  });

  it('has room for a Miner on every visible deposit, paid from the starter crate', () => {
    const { g, bot } = startAct(act);
    const li = actLayer(act);
    const ores = [...new Set(LAYERS[li].deposits.filter((d) => !d.hidden && !d.rig).map((d) => d.ore))];
    expect(ores.length).toBeGreaterThan(0);
    for (const ore of ores) {
      const [spot] = F.pickMinerSpots(g, li, ore, 1);
      expect(spot, ore).toBeDefined();
      expect(g.canPlace(ore === 'glowcap' ? 'harvester' : 'miner', li, spot.x, spot.y, N).ok, ore).toBe(true);
    }
    const [spot] = F.pickMinerSpots(g, li, ores[0], 1);
    const m = bot.put(ores[0] === 'glowcap' ? 'harvester' : 'miner', spot.x, spot.y, N);
    expect(m.planned).toBe(false);
    expect(m.ore).toBe(ores[0]);
  });

  it('gets its upstream supply down the elevators within a few minutes', () => {
    const { g, bot } = startAct(act);
    const li = actLayer(act);
    const L = g.layer(li);
    // A requested good: the busiest depot supply on the nearest layer above that has a steady one.
    const depotSupply = ACT_SUPPLY[act].filter((s) => (s.via ?? 'depot') === 'depot' && s.perMin >= 3);
    const near = Math.max(...depotSupply.map((s) => s.layer));
    const spec = depotSupply.filter((s) => s.layer === near).sort((a, b) => b.perMin - a.perMin)[0];
    const before = L.stock[spec.item] ?? 0;
    expect(bot.request(spec.item, Math.ceil((before + 20) / 10) * 10)).toBe(true);
    const moved = g.s.stats.elevator;
    expect(bot.waitFor(() => (L.stock[spec.item] ?? 0) >= before + 10, 180), `${spec.item} from layer ${spec.layer}`).toBe(true);
    expect(g.s.stats.elevator).toBeGreaterThan(moved);
    // Station cargo: a line running straight into the top station above lands in the act's depot unasked.
    const stone = L.stock.stone ?? 0;
    bot.supply(li - 1, 'stone', 6, 'station');
    expect(bot.waitFor(() => (L.stock.stone ?? 0) >= stone + 3, 180), 'stone as station cargo').toBe(true);
    expect(bot.friction).toEqual([]);
  });
});

describe('Act II from the real end of Act I', () => {
  it('hands over the Act I bot at D1 with the Shallows open', () => {
    const { g, bot } = startFromActI();
    expect(g.s.projectsDone).toContain('d1');
    expect(g.layer(1).open).toBe(true);
    expect(g.s.milestone).toBe(firstMilestone(2));
    expect(bot.act).toBe(2);
    expect(bot.t0).toBe(bot.t);
    expect(bot.t0).toBeLessThan(25 * 60);
    expect(bot.get('P1').type).toBe('press');
    expect(F.topStation(g, 0)).toBeTruthy();
    bot.focus(1);
    expect(g.s.visited).toContain(1);
    // The Act I factory keeps running: P1 still stocks the HQ.
    const plates = g.layer(0).stock.iron_plate ?? 0;
    bot.wait(60);
    expect(g.layer(0).stock.iron_plate ?? 0).toBeGreaterThan(plates);
  });
});

describe('helpers on the real map', () => {
  it('connect() belts a rich iron Miner into a Smelter into the Shallows depot', () => {
    const { g, bot } = startAct(2);
    bot.focus(1);
    const [spot] = F.pickMinerSpots(g, 1, 'iron_ore', 1);
    const miner = bot.put('miner', spot.x, spot.y, E);
    const [room] = F.freeSpots(g, 1, 2, { near: { x: spot.x + 6, y: spot.y + 3 }, limit: 1 });
    const smelter = bot.put('smelter', room.x, room.y, E, { recipe: 'iron_ingot' });
    expect(bot.connect(miner, smelter).length).toBeGreaterThan(0);
    expect(bot.connect(smelter, F.depot(g, 1)).length).toBeGreaterThan(0);
    expect(bot.waitFor(() => (g.layer(1).stock.iron_ingot ?? 0) >= 5, 120)).toBe(true);
  });

  it('the router lays a Crossing over a working line, and both lines keep moving', () => {
    const { g, bot } = startAct(2);
    bot.focus(0);
    // Line A: wire out of the HQ's east face, east along y=18, south down x=40 into a crate. (Wire
    // and bricks, because an Unloader takes plates and gears the ghosts are waiting for.)
    bot.put('unloader', 29, 18, E, { filter: 'copper_wire' });
    bot.run(30, 18, 39, 18, E);
    bot.run(40, 18, 40, 30, S);
    const crateA = bot.put('crate', 40, 31, S);
    bot.wait(30);
    // Line B: bricks from the HQ's south face to a crate east of line A, which walls it off. With no
    // plates in the HQ the Crossing can't be swapped in, so the whole lane waits: none of it goes
    // down, and line A's belt is left as it is.
    const { out } = bot.unload('brick', { face: S });
    const crateB = bot.put('crate', 46, 24, E);
    const hq = g.layer(0);
    const plates = hq.stock.iron_plate ?? 0;
    hq.stock.iron_plate = 0;
    const pieces = bot.connect(out, crateB);
    const xs = pieces.filter((p) => p.type === 'crossing');
    expect(xs.length).toBeGreaterThan(0);
    expect(bot.waitingLanes.length).toBe(1);
    for (const p of pieces) expect(g.at(0, p.x, p.y)?.type ?? null).toBe(p.type === 'crossing' ? 'belt' : null);
    // Plates back: the lane goes down within a second, Crossings first.
    hq.stock.iron_plate = plates;
    bot.wait(1);
    expect(bot.waitingLanes.length).toBe(0);
    for (const p of xs) expect(g.at(0, p.x, p.y)?.type).toBe('crossing');
    expect(bot.refusals.filter((r) => r.what.includes('lane') && r.to >= 0).length).toBe(1);
    const a = crateA.stockCount;
    expect(bot.waitFor(() => crateB.stockCount >= 5 && crateA.stockCount >= a + 5, 240)).toBe(true);
    expect(crateA.stockItem).toBe('copper_wire');
    expect(crateB.stockItem).toBe('brick');
  });

  it('the router keeps clear of side ports only where something comes out of them', () => {
    const press = newBuilding(1, 'press', 0, 10, 10, E);
    press.recipe = 'iron_plate';
    expect(pushCells(press)).toEqual([outputPort(press)]);
    const sep = newBuilding(2, 'separator', 2, 10, 10, E);
    sep.recipe = 'separate_sapstone';
    expect(pushCells(sep)).toEqual([outputPort(sep), sidePort(sep)]);
    // No recipe yet: the only one a Separator can pick has its resin out of the side.
    expect(pushCells(newBuilding(3, 'separator', 2, 10, 10, E))).toHaveLength(2);
    // Wrong items come out of an Engine Node's side.
    expect(pushCells(newBuilding(4, 'engine_node', 5, 10, 10, E))).toHaveLength(2);
  });

  it('reads every message after g.events fills up (the game keeps the last 400)', () => {
    const { g, bot } = startAct(2);
    for (let i = 0; i < 450; i++) g.emit({ t: 'removed', layer: 0, x: 0, y: 0 });
    bot.wait(1);
    expect(g.events.length).toBe(400);
    const n = bot.messages.length;
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 10; i++) g.emit({ t: 'removed', layer: 0, x: 0, y: 0 });
      g.emit({ t: 'message', who: 'mags', text: `test ${k}` });
      bot.wait(1);
    }
    expect(bot.messages.slice(n).filter((m) => m.text.startsWith('test ')).map((m) => m.text)).toEqual(['test 0', 'test 1', 'test 2']);
  });

  it("a Drill's extra good is no jam; a good it never takes, or one the full depot can't stack, is", () => {
    const g = Game.create(SEED);
    const bot = new Bot(g);
    const drill = F.drill(g, 0)!;
    const end = F.inputCells(g, drill).find((c) => F.isFree(g, 0, c.x, c.y))!;
    const belt = bot.put('belt', end.x, end.y, end.dir);
    const load = (id: string) => {
      belt.item = { id, heat: 0 };
      belt.prog = 1;
    };
    g.s.project!.delivered.iron_plate = PROJECTS.d1.needs.iron_plate;
    load('iron_plate');
    expect(bot.foreignItem(end.x, end.y, 0)).toBeNull();
    load('coal');
    expect(bot.foreignItem(end.x, end.y, 0)?.item).toBe('coal');
    g.layer(0).stock.iron_plate = STOCK_CAP;
    load('iron_plate');
    expect(bot.foreignItem(end.x, end.y, 0)?.item).toBe('iron_plate');
  });

  it("reads Mags's advice about a starved ghost", () => {
    const { g } = startAct(5);
    expect(starveAdvice(g.starveMessage(4, 'heat_shield', 'pressure_forge'))).toEqual({ layer: 4, item: 'heat_shield', advice: 'make' });
    expect(starveAdvice(g.starveMessage(4, 'brick', 'assembler'))).toEqual({ layer: 4, item: 'brick', advice: 'request' });
    expect(starveAdvice(g.takenMessage(4, 'aggregate', 'thermal_extractor'))).toEqual({ layer: 4, item: 'aggregate', advice: 'unloaders' });
    expect(starveAdvice(g.starveMessage(0, 'gear', 'assembler'))).toEqual({ layer: 0, item: 'gear', advice: 'make' });
    expect(starveAdvice("That's the bore site. The crew is setting up the rig.")).toBeNull();
  });

  it('digPath reaches the Shallows bore site; surveys and requests follow the UI', () => {
    const { g, bot } = startAct(2);
    bot.focus(1);
    const bore = F.boreSite(g, 1)!;
    expect(bore.reached).toBe(false);
    const money = g.s.money;
    const { tiles, cost } = bot.digPath(bore);
    expect(tiles).toBeGreaterThan(0);
    expect(bot.waitDig(120)).toBe(true);
    expect(F.boreSite(g, 1)!.reached).toBe(true);
    expect(g.s.stats.events.bore_site_reached).toBe(1);
    expect(cost).toBe(tiles * LAYERS[1].digCost);
    expect(g.s.money).toBeLessThan(money);
    // Surveys: underground only, for money. One costs $300 on the Shallows, more than the start state
    // has left after the tunnel since Act I's milestone cash was halved (review-3 K11): a player waits
    // for a few minutes of sales; here the money is simply there.
    g.s.money += LAYERS[1].surveyCost;
    expect(bot.survey(50, 24)).toBe(true);
    expect(bot.survey(30, 30, 0)).toBe(false);
    // Requests: what the depot inspector can set, and nothing else.
    expect(() => bot.request('iron_plate', 25)).toThrow(); // steps of 10
    expect(() => bot.request('iron_plate', 410)).toThrow(); // at most 400
    expect(bot.request('steel_beam', 20)).toBe(false); // never seen yet: not on the Add row
    expect(bot.request('coal', 20)).toBe(false); // nor coal, until the game has seen some
    expect(bot.request('hot_ember_ingot', 20)).toBe(false); // it cools: never on the Add row
    expect(bot.request('motor', 30)).toBe(true); // the starter crate's Motors put it there
    expect(g.layer(1).requests.motor).toBe(30);
    expect(bot.request('motor', 0)).toBe(true);
    expect(g.layer(1).requests.motor).toBeUndefined();
    // The HQ's rows are its "Keep for the Surface" floor.
    expect(bot.request('iron_plate', 60, 0)).toBe(true);
    expect(g.layer(0).requests.iron_plate).toBe(60);
    expect(bot.friction).toEqual([]);
    // "Request the missing goods" on a ghost: Generators cost 2 Motors and the crate has 4.
    let ghost: Building | undefined;
    for (const s of F.freeSpots(g, 1, 2, { near: { x: 40, y: 18 }, limit: 80 })) {
      if (ghost) break;
      if (!F.isFree(g, 1, s.x - 1, s.y - 1, 4)) continue;
      const b = bot.put('generator', s.x, s.y, N);
      if (b.planned) ghost = b;
    }
    expect(ghost).toBeDefined();
    expect(bot.requestMissing(ghost!)).toEqual({ motor: 10 });
    expect(g.layer(1).requests.motor).toBe(10);
    // An elevator upgrade pays from the lower depot first, then the one above: neither has Steel Beams.
    expect(bot.upgradeElevator(1)).toBe(false);
  });

  it('finds what each layer offers: vents, hot, warm and steady ground, water, conduits, nodes', () => {
    {
      const { g } = startAct(3);
      expect(F.waterSpots(g, 2).length).toBeGreaterThan(0);
      expect(F.pickMinerSpots(g, 2, 'glowcap', 1).length).toBe(1);
      expect(F.sporeAt(g, 2, 62, 28)).toBeGreaterThan(0.5);
    }
    {
      const { g } = startAct(4);
      const vents = F.vents(g, 3);
      expect(vents.length).toBe(3);
      expect(vents.filter((v) => v.revealed).length).toBe(1);
    }
    {
      const { g } = startAct(5);
      expect(F.vents(g, 4).every((v) => v.heat === 2)).toBe(true);
      expect(F.heatSpots(g, 4, 2).length).toBeGreaterThan(0);
      expect(F.heatSpots(g, 4, 1).length).toBeGreaterThan(0);
      const [steady] = F.steadySpots(g, 4);
      expect(g.canPlace('precision_assembler', 4, steady.x, steady.y, N).reason).toBe('Locked');
    }
    {
      const { g } = startAct(6);
      expect(F.conduitSpots(g, 5, { awake: false }).length).toBeGreaterThan(0);
      expect(F.conduitSpots(g, 5).length).toBe(0);
      const nodes = F.engineNodes(g);
      expect(nodes.length).toBe(3);
      expect(nodes[0].waking).toBe(true);
      expect(nodes[0].sequence).toEqual(['battery', 'resonant_core', 'battery', 'resonant_core']);
      expect(nodes.every((n) => n.inputs.length === 9 && !n.awake)).toBe(true);
      expect(F.drill(g, 5)?.type).toBe('heart');
    }
  });

  it('foundations, production rates, ports and splitter exits', () => {
    const { g, bot } = startAct(6);
    bot.focus(5);
    // Aggregate isn't in the default supply: add a Magma Shelf stand-in, request it, lay foundations.
    bot.supply(4, 'aggregate', 30);
    expect(bot.request('aggregate', 40)).toBe(true);
    expect(bot.waitFor(() => bot.stock('aggregate') >= 8, 180)).toBe(true);
    const [room] = F.freeSpots(g, 5, 2, { limit: 1 });
    expect(bot.foundations(room.x, room.y, 2)).toBe(4);
    expect(bot.foundation(room.x, room.y)).toBe(false);
    expect(() => bot.put('foundation', room.x + 2, room.y, N)).toThrow();
    // A Miner on thrumstone: its port is where portOf said, and perMin sees its ore.
    const [spot] = F.pickMinerSpots(g, 5, 'thrumstone', 1);
    const port = F.portOf('miner', spot.x, spot.y, E);
    const miner = bot.put('miner', spot.x, spot.y, E);
    expect(F.outputOf(miner)).toEqual(port);
    const sp = bot.put('splitter', port.x, port.y, E);
    expect(F.exits(sp).map((x) => x.which)).toEqual(['front', 'left', 'right']);
    bot.connect(F.exits(sp)[0], F.depot(g, 5));
    bot.wait(90);
    expect(bot.perMin('thrumstone', 60)).toBeGreaterThan(10);
    expect(bot.perMin('thrumstone', 60, 'delivered')).toBeGreaterThan(5);
  });

  it('watchers cover every open layer: a deadlock and a jam on the Shallows', () => {
    const { g, bot } = startAct(2);
    bot.focus(1);
    // Generators cost 2 Motors; the depot has 4 and nothing brings more: the third ghost waits.
    const used: { x: number; y: number }[] = [];
    for (const s of F.freeSpots(g, 1, 2, { near: { x: 40, y: 18 }, limit: 80 })) {
      if (used.length >= 3) break;
      if (used.some((u) => Math.abs(u.x - s.x) < 3 && Math.abs(u.y - s.y) < 3)) continue;
      bot.put('generator', s.x, s.y, N);
      used.push(s);
    }
    expect(bot.ghosts(1).length).toBe(1);
    // A gear belted into an iron Smelter jams it.
    const [room] = F.freeSpots(g, 1, 2, { near: { x: 24, y: 7 }, limit: 1 });
    const smelter = bot.put('smelter', room.x, room.y, N, { recipe: 'iron_ingot' });
    const { out } = bot.unload('gear', { face: N });
    bot.connect(out, smelter);
    expect(bot.waitFor((b) => b.rushes.length > 0, 300)).toBe(true);
    expect(bot.deadlocks[0].layer).toBe(1);
    expect(bot.rushes[0].layer).toBe(1);
    expect(bot.jams.length).toBeGreaterThan(0);
    expect(bot.jams[0].layer).toBe(1);
    expect(bot.snapshots.some((l) => / L1 /.test(l))).toBe(true);
  });
});
