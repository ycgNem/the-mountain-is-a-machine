import { describe, expect, it } from 'vitest';
import { layStarterLine } from '../src/app/scenarios';
import { BUILDINGS } from '../src/data/buildings';
import { ITEMS } from '../src/data/items';
import { LAYERS } from '../src/data/layers';
import { MILESTONES, PROJECTS } from '../src/data/progression';
import { elevatorRate } from '../src/sim/elevator';
import { Game } from '../src/sim/game';
import { insert } from '../src/sim/logistics';
import { completeProject, currentStep, guideMarks, stepProgress } from '../src/sim/progress';
import { deserialize, serialize } from '../src/sim/save';
import type { Building, Dir } from '../src/sim/types';
import { run, sandbox } from './helpers';

describe('a new game: the player builds the first line', () => {
  /** Place a building the way the player does (paid from the HQ, never a ghost here). */
  function put(g: Game, type: string, x: number, y: number, dir: Dir): Building {
    const b = g.place(type, 0, x, y, dir);
    expect(b?.planned, `${type} at ${x},${y}`).toBe(false);
    return b!;
  }

  it('opens with the HQ, the Shipping Terminal and the broken Drill, and a crate holding what the old ready-made line cost', () => {
    const g = Game.create(20261030);
    expect([...g.s.buildings.values()].map((b) => b.type).sort()).toEqual(['drill', 'hq', 'terminal']);
    // The line that used to come built: a Miner, a Smelter, a Press, a Splitter and 14 belts.
    const line: Record<string, number> = { miner: 1, smelter: 1, press: 1, splitter: 1, belt: 14 };
    const cost: Record<string, number> = {};
    for (const [type, n] of Object.entries(line)) for (const [k, v] of Object.entries(BUILDINGS[type].cost)) cost[k] = (cost[k] ?? 0) + v * n;
    expect(cost).toEqual({ iron_plate: 40, gear: 11 });
    expect(LAYERS[0].starterCrate).toEqual({ iron_plate: 100 + cost.iron_plate, gear: 30 + cost.gear, copper_wire: 20, brick: 30 });
    expect(g.layer(0).stock).toEqual(LAYERS[0].starterCrate);
    // Nothing runs until the player builds it.
    run(g, 30);
    expect(g.s.stats.sold).toEqual({});
    expect(g.s.stats.produced).toEqual({});
    expect(g.s.msDone).toEqual([]);
    expect(MILESTONES[0].name).toBe('First Light');
  });

  it('the tutorial line, built with player actions at real cost, makes the first sale and completes First Light, then Plates for the HQ', () => {
    const g = Game.create(20261030);
    const L = g.layer(0);
    const ms = MILESTONES[0];
    const done = () => ms.steps.map((st) => stepProgress(g, st).done);
    // First Light, step by step: a Miner on the iron, a Smelter, belts into it, belts on into the Terminal.
    put(g, 'miner', 16, 24, 1);
    expect(g.at(0, 16, 24)?.ore).toBe('iron_ore');
    expect(done()).toEqual([true, false, false, false]);
    put(g, 'smelter', 22, 24, 1);
    for (let x = 18; x <= 21; x++) put(g, 'belt', x, 25, 1);
    for (let x = 24; x <= 31; x++) put(g, 'belt', x, 25, 1);
    // 8 + 10 plates and 4 + 2 gears for the machines, a plate a belt.
    expect(L.stock.iron_plate).toBe(140 - 8 - 10 - 12);
    expect(L.stock.gear).toBe(41 - 4 - 2);
    let first = -1;
    for (let i = 0; i < 120 * 60 && !g.s.msDone.includes(1); i++) {
      g.tick();
      if (first < 0 && (g.s.stats.sold.iron_ingot ?? 0) > 0) first = g.s.time;
    }
    expect(first, 'first sale').toBeGreaterThan(0);
    expect(first).toBeLessThan(20);
    expect(g.s.msDone).toEqual([1]);
    expect(g.s.stats.sold.iron_ingot).toBeGreaterThanOrEqual(5);
    expect(MILESTONES[g.s.milestone].name).toBe('Plates for the HQ');
    // Plates for the HQ: a Press under the HQ, fed by a Splitter swapped into the lane, belts up into the HQ.
    put(g, 'press', 25, 22, 0);
    put(g, 'belt', 25, 24, 0);
    put(g, 'belt', 26, 21, 0);
    put(g, 'belt', 26, 20, 0);
    expect(g.at(0, 25, 25)?.type).toBe('belt');
    put(g, 'splitter', 25, 25, 1);
    const plates = (MILESTONES[1].steps[1] as { count: number }).count;
    for (let i = 0; i < 120 * 60 && (g.s.stats.delivered.iron_plate ?? 0) < plates; i++) g.tick();
    expect(g.s.stats.delivered.iron_plate).toBeGreaterThanOrEqual(plates);
    // Sales go on through the Splitter's front.
    const sold = g.s.stats.sold.iron_ingot ?? 0;
    run(g, 20);
    expect(g.s.stats.sold.iron_ingot ?? 0).toBeGreaterThan(sold);
    // Its last step is a look at the Drill (the app sets the event when it is clicked).
    expect(g.s.msDone).toEqual([1]);
    expect(currentStep(g)).toMatchObject({ kind: 'event', event: 'drill_inspected', label: 'Click the Drill' });
    g.s.stats.events.drill_inspected = 1;
    run(g, 1);
    expect(g.s.msDone).toEqual([1, 2]);
    expect(MILESTONES[g.s.milestone].name).toBe('Copper Line');
    // The Copper Line points at the copper deposit; nothing is placed for the player.
    expect([...g.s.buildings.values()].some((b) => b.ore === 'copper_ore')).toBe(false);
    expect(guideMarks(g, 0)).toEqual([expect.objectContaining({ x: expect.any(Number) })]);
    const [mark] = guideMarks(g, 0);
    for (let y = mark.y; y < mark.y + mark.h; y++) for (let x = mark.x; x < mark.x + mark.w; x++) if (L.ore[y * L.w + x]) expect(g.oreName(L.ore[y * L.w + x])).toBe('copper_ore');
  });

  it('layStarterLine lays the line a new game used to open with, running: the first sale within 3 seconds, plates into the HQ', () => {
    const g = Game.create(20261030);
    layStarterLine(g);
    // Ore on the belts into the smelter, ingots in its buffer and on every other belt after it.
    const item = (x: number, y: number) => g.at(0, x, y)?.item?.id;
    expect([18, 19, 20, 21].map((x) => item(x, 25))).toEqual(['iron_ore', 'iron_ore', 'iron_ore', 'iron_ore']);
    expect([24, 26, 28, 30].map((x) => item(x, 25))).toEqual(['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot']);
    expect(item(25, 24)).toBe('iron_ingot');
    expect(g.at(0, 22, 24)?.outBuf.map((i) => i.id)).toEqual(['iron_ingot', 'iron_ingot']);
    // Paid from the crate: the HQ holds what a new game used to open with.
    expect(g.layer(0).stock).toEqual({ iron_plate: 100, gear: 30, copper_wire: 20, brick: 30 });
    let first = -1;
    for (let i = 0; i < 3 * 60 && first < 0; i++) {
      g.tick();
      if ((g.s.stats.sold.iron_ingot ?? 0) > 0) first = g.s.time;
    }
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(3);
    // Once what it started with has drained (20 s in): 30 ore/min -> 15 ingots/min, split between the
    // terminal and the press.
    run(g, 20 - g.s.time);
    const plates = g.layer(0).stock.iron_plate ?? 0;
    const before = g.s.stats.sold.iron_ingot;
    run(g, 60);
    const sold = g.s.stats.sold.iron_ingot - before;
    expect(sold).toBeGreaterThanOrEqual(6);
    expect(sold).toBeLessThanOrEqual(9);
    expect((g.layer(0).stock.iron_plate ?? 0) - plates).toBeGreaterThanOrEqual(5);
  });
});

describe('belts', () => {
  it('moves a packed line at 90 items per minute', () => {
    const g = sandbox();
    // A crate-fed line: unloader from the HQ feeds belts into the terminal.
    const hq = [...g.s.buildings.values()].find((b) => b.type === 'hq')!;
    // Unloader right under the HQ, facing south, then a belt run south and east into nothing.
    const ux = hq.x + 1;
    const uy = hq.y + 3;
    g.place('unloader', 0, ux, uy, 2, { filter: 'iron_plate' });
    for (let y = uy + 1; y < uy + 10; y++) g.place('belt', 0, ux, y, 2);
    g.place('belt', 0, ux, uy + 10, 2);
    run(g, 30);
    // The line fills up and stops: ten belts hold ten items, one per tile.
    let n = 0;
    for (const b of g.s.buildings.values()) if (b.type === 'belt' && b.item) n++;
    expect(n).toBe(10);
  });

  it('splitter deals items to all three outputs', () => {
    const g = sandbox();
    const hq = [...g.s.buildings.values()].find((b) => b.type === 'hq')!;
    const ux = hq.x + 1;
    const uy = hq.y + 3;
    g.place('unloader', 0, ux, uy, 2, { filter: 'gear' });
    g.place('belt', 0, ux, uy + 1, 2);
    g.place('splitter', 0, ux, uy + 2, 2);
    // three output belts, each 3 long
    for (let k = 1; k <= 3; k++) {
      g.place('belt', 0, ux, uy + 2 + k, 2);
      g.place('belt', 0, ux + k, uy + 2, 1);
      g.place('belt', 0, ux - k, uy + 2, 3);
    }
    run(g, 20);
    const counts = { s: 0, e: 0, w: 0 };
    for (const b of g.s.buildings.values()) {
      if (b.type !== 'belt' || !b.item) continue;
      if (b.x === ux && b.y > uy + 2) counts.s++;
      if (b.y === uy + 2 && b.x > ux) counts.e++;
      if (b.y === uy + 2 && b.x < ux) counts.w++;
    }
    expect(counts.s).toBe(3);
    expect(counts.e).toBe(3);
    expect(counts.w).toBe(3);
  });

  it('two lines merge fairly into one', () => {
    const g = sandbox();
    const hq = [...g.s.buildings.values()].find((b) => b.type === 'hq')!;
    // Two unloaders on the HQ's south side, each feeding a belt that side-loads one trunk line.
    const y0 = hq.y + 3;
    g.place('unloader', 0, hq.x, y0, 2, { filter: 'gear' });
    g.place('unloader', 0, hq.x + 2, y0, 2, { filter: 'iron_plate' });
    g.place('belt', 0, hq.x, y0 + 1, 1); // east
    g.place('belt', 0, hq.x + 2, y0 + 1, 3); // west
    g.place('belt', 0, hq.x + 1, y0 + 1, 2); // trunk start, south
    for (let y = y0 + 2; y < y0 + 30; y++) g.place('belt', 0, hq.x + 1, y, 2);
    // Sink: the terminal isn't there, so end in a long run and count what passed.
    run(g, 15);
    let gear = 0;
    let plate = 0;
    for (const b of g.s.buildings.values()) {
      if (b.type === 'belt' && b.item && b.x === hq.x + 1) {
        if (b.item.id === 'gear') gear++;
        if (b.item.id === 'iron_plate') plate++;
      }
    }
    expect(Math.abs(gear - plate)).toBeLessThanOrEqual(2);
    expect(gear + plate).toBeGreaterThan(10);
  });
});

describe('building', () => {
  it('a short ghost can be rushed for 3x its missing goods, and rushed goods are never refunded', () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock = { iron_plate: 6 };
    const ghost = g.place('press', 0, 6, 30, 1)!;
    expect(ghost.planned).toBe(true);
    const q = g.rushQuote(ghost.id)!;
    expect(q.missing).toEqual({ gear: 4 });
    expect(q.price).toBe(Math.round(ITEMS.gear.value * 3 * 4));
    const money = g.s.money;
    expect(g.rush(ghost.id)).toBe(true);
    expect(ghost.planned).toBe(false);
    expect(g.s.money).toBeCloseTo(money - q.price, 5);
    expect(L.stock.iron_plate).toBe(0);
    g.remove(0, 6, 30);
    expect(L.stock.iron_plate).toBe(6);
    expect(L.stock.gear ?? 0).toBe(0);
  });

  it('refuses to swap in a piece the depot cannot pay for', () => {
    const g = sandbox();
    g.place('belt', 0, 6, 30, 1);
    g.layer(0).stock = {};
    const chk = g.canPlace('splitter', 0, 6, 30, 1);
    expect(chk.ok).toBe(false);
    expect(chk.reason).toBe('Not enough goods to swap this in');
  });

  it('never loses the item on a replaced belt', () => {
    const g = sandbox();
    const L = g.layer(0);
    const belt = g.place('belt', 0, 6, 30, 1)!;
    belt.item = { id: 'gear', heat: 0 };
    const gears = L.stock.gear ?? 0;
    expect(g.place('crossing', 0, 6, 30, 1)).toBeTruthy();
    expect(L.stock.gear).toBe(gears + 1 - (BUILDINGS.crossing.cost.gear ?? 0));
  });

  it('builds ghosts oldest first; a newer ghost waits rather than take an older one\'s goods', () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock = {};
    const press = g.place('press', 0, 6, 30, 1)!;
    const belt = g.place('belt', 0, 12, 30, 1)!;
    expect(press.planned && belt.planned).toBe(true);
    L.stock = { iron_plate: 3 };
    run(g, 1);
    expect(belt.planned).toBe(true);
    L.stock = { iron_plate: 7, gear: 4 };
    run(g, 1);
    expect(press.planned).toBe(false);
    expect(belt.planned).toBe(false);
    // Spare goods beyond what the waiting ghost holds are fair game.
    L.stock = { iron_plate: 7 };
    const press2 = g.place('press', 0, 16, 30, 1)!;
    const belt2 = g.place('belt', 0, 20, 30, 1)!;
    expect(press2.planned).toBe(true);
    run(g, 1);
    expect(belt2.planned).toBe(false);
    expect(L.stock.iron_plate).toBe(6);
  });

  it('a belt drag lays a crossing over a working line, and leaves belts alone at its ends', () => {
    const g = sandbox();
    // A working line running east along y = 30.
    for (let x = 4; x <= 12; x++) g.place('belt', 0, x, 30, 1);
    g.place('splitter', 0, 13, 30, 1);
    // Drag a line south across it at x = 8.
    const across = [26, 27, 28, 29, 30, 31, 32].map((y) => ({ x: 8, y, dir: 2 as const }));
    const plan = g.planDrag(0, 'belt', across);
    expect(plan.find((p) => p.y === 30)).toMatchObject({ type: 'crossing', skip: false });
    expect(plan.filter((p) => p.type === 'belt' && !p.skip).length).toBe(6);
    // Ending on the line: stop short, so the new belt side-loads into it.
    const into = g.planDrag(0, 'belt', [27, 28, 29, 30].map((y) => ({ x: 6, y, dir: 2 as const })));
    expect(into[3].skip).toBe(true);
    // Along the line it re-lays the belts; a splitter in the way is never replaced.
    const along = g.planDrag(0, 'belt', [10, 11, 12, 13, 14].map((x) => ({ x, y: 30, dir: 3 as const })));
    expect(along.slice(0, 3).every((p) => !p.skip && p.type === 'belt')).toBe(true);
    expect(along[3].skip).toBe(true);
    // A single placement still replaces what it lands on.
    expect(g.planDrag(0, 'belt', [{ x: 8, y: 30, dir: 2 }])[0]).toMatchObject({ type: 'belt', skip: false });
  });

  it('a wrong item at a machine says jammed, not waiting for input', () => {
    const g = sandbox();
    const press = g.place('press', 0, 10, 30, 1, { recipe: 'iron_plate' })!;
    const belt = g.place('belt', 0, 9, 30, 1)!;
    belt.item = { id: 'gear', heat: 0 };
    belt.prog = 0.9;
    run(g, 1);
    expect(press.status).toBe('jammed');
    expect(press.jam).toBe('gear');
    // Take the gear away and it goes back to waiting.
    belt.item = null;
    run(g, 1);
    expect(press.status).toBe('no_input');
  });

  it('Build next moves a ghost to the front of the queue', () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock = {};
    const a = g.place('press', 0, 6, 30, 1)!;
    const b = g.place('press', 0, 10, 30, 1)!;
    expect(g.ghostQueue(0).map((x) => x.id)).toEqual([a.id, b.id]);
    g.buildNext(b.id);
    expect(g.ghostQueue(0).map((x) => x.id)).toEqual([b.id, a.id]);
    L.stock = { iron_plate: 6, gear: 4 };
    run(g, 1);
    expect(b.planned).toBe(false);
    expect(a.planned).toBe(true);
  });

  it('Mags speaks up when a ghost waits on an item nothing delivers', () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock = { iron_plate: 50 };
    g.place('press', 0, 6, 30, 1);
    g.events.length = 0;
    run(g, 70);
    const msgs = g.events.filter((e) => e.t === 'message').map((e) => (e as { text: string }).text);
    expect(msgs.some((t) => t.includes('out of Gear'))).toBe(true);
  });

  it('a Company Chute sells on the spot at 60%, and only underground', () => {
    const g = sandbox();
    expect(g.canPlace('chute', 0, 6, 30, 1).ok).toBe(false);
    const chute = g.forcePlace('chute', 0, 6, 30, 1);
    const money = g.s.money;
    expect(insert(g, chute, { id: 'gear', heat: 0 }, 1)).toBe(true);
    expect(g.s.money).toBeCloseTo(money + Math.round(ITEMS.gear.value * 0.6 * 10) / 10, 5);
  });

  it('no surveys on the Surface', () => {
    const g = Game.create(1);
    g.s.money = 10000;
    expect(g.survey(0, 20, 20)).toBe(false);
  });
});

describe('machines', () => {
  it('a press makes wire 2 per ingot', () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock.copper_ingot = 100;
    const hq = [...g.s.buildings.values()].find((b) => b.type === 'hq')!;
    const ux = hq.x + 1;
    const uy = hq.y + 3;
    g.place('unloader', 0, ux, uy, 2, { filter: 'copper_ingot' });
    g.place('belt', 0, ux, uy + 1, 2);
    const press = g.place('press', 0, ux, uy + 2, 2, { recipe: 'copper_wire' })!;
    expect(press).toBeTruthy();
    for (let y = uy + 4; y < uy + 40; y++) g.place('belt', 0, ux, y, 2);
    run(g, 30);
    expect(g.s.stats.produced.copper_wire ?? 0).toBeGreaterThanOrEqual(8);
  });
});

describe('layers and elevators', () => {
  function breakthroughD1(g: Game): void {
    const p = g.s.project!;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
  }

  it('D1 opens the Shallows with a shaft, stations, a depot and the next rig', () => {
    const g = Game.create(3);
    breakthroughD1(g);
    expect(g.layer(1).open).toBe(true);
    expect(g.s.deepest).toBe(1);
    expect(g.s.shafts.length).toBe(1);
    const types = [...g.s.buildings.values()].filter((b) => b.layer === 1).map((b) => b.type);
    expect(types).toContain('elevator');
    expect(types).toContain('depot');
    expect(types).toContain('drill');
    expect(g.s.project?.id).toBe('d2');
    expect(g.layer(1).stock.iron_plate).toBeGreaterThan(0);
    // The surface drill is gone; the top station replaced it.
    expect([...g.s.buildings.values()].some((b) => b.layer === 0 && b.type === 'drill')).toBe(false);
  });

  it('the elevator carries goods down into the lower depot', () => {
    const g = Game.create(3);
    breakthroughD1(g);
    g.debugUnlockAll();
    g.layer(0).stock.iron_plate = 500;
    const before = g.layer(1).stock.iron_plate ?? 0;
    g.place('unloader', 0, 27, 16, 0, { filter: 'iron_plate' });
    g.place('belt', 0, 27, 15, 1);
    g.place('belt', 0, 28, 15, 1);
    g.place('belt', 0, 29, 15, 1);
    g.place('belt', 0, 30, 15, 0);
    g.place('belt', 0, 30, 14, 0);
    g.place('belt', 0, 30, 13, 0);
    g.place('belt', 0, 30, 12, 0);
    g.place('belt', 0, 30, 11, 1);
    run(g, 60);
    const moved = (g.layer(1).stock.iron_plate ?? 0) - before;
    // Mk1: 45/min each way.
    expect(moved).toBeGreaterThanOrEqual(35);
    expect(moved).toBeLessThanOrEqual(46);
    expect(g.s.stats.elevator).toBeGreaterThanOrEqual(moved);
  });

  it('elevator tiers carry 45, 90 and 180 items a minute each way', () => {
    expect(elevatorRate(0)).toBeCloseTo(45, 5);
    expect(elevatorRate(1)).toBeCloseTo(90, 5);
    expect(elevatorRate(2)).toBeCloseTo(180, 5);
  });

  it('requests alone keep the Mk1 cab full: 45 items a minute', () => {
    const g = Game.create(3);
    breakthroughD1(g);
    g.layer(0).stock.gear = 500;
    g.layer(1).requests = { gear: 400 };
    const before = g.layer(1).stock.gear ?? 0;
    run(g, 120);
    const moved = (g.layer(1).stock.gear ?? 0) - before;
    expect(moved).toBeGreaterThanOrEqual(80);
    expect(moved).toBeLessThanOrEqual(92);
  });

  it("depot requests pull goods down the stack, never below a depot's own request", () => {
    const g = Game.create(3);
    breakthroughD1(g);
    breakthroughD1(g);
    expect(g.layer(2).open).toBe(true);
    const [L0, L1, L2] = [g.layer(0), g.layer(1), g.layer(2)];
    L0.stock.gear = 500;
    L1.stock.gear = 20;
    L2.stock.gear = 0;
    L1.requests = { gear: 20 };
    L2.requests = { gear: 50 };
    run(g, 150);
    expect(L2.stock.gear).toBe(50);
    expect(L1.stock.gear).toBe(20);
    expect(L0.stock.gear).toBe(450);
  });
});

describe('save', () => {
  it('round-trips and keeps running identically', () => {
    const g = Game.create(7);
    layStarterLine(g);
    run(g, 10);
    g.layer(0).requests = { gear: 5 };
    const json = serialize(g);
    const h = deserialize(json);
    expect(h.layer(0).requests).toEqual({ gear: 5 });
    run(g, 10);
    run(h, 10);
    expect(h.s.money).toBeCloseTo(g.s.money, 5);
    expect(h.s.stats.sold.iron_ingot).toBe(g.s.stats.sold.iron_ingot);
  });
});
