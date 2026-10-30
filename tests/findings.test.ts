// The act bots' game findings the owner accepted (docs/reviews/act-bots/decisions.md): G1 digging,
// G2 Drill and Heart surplus, G3 Unloaders and planned buildings, G4 Mags on goods made here, G5 an
// Unloader's filter change, G6 where the Engine is, G7 The Governor's milestone, G8 default requests,
// G9 hints and the breakthrough line, and L1 the light over awake conduit.

import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { LAYERS } from '../src/data/layers';
import { MILESTONES, PROJECTS } from '../src/data/progression';
import { refreshEnv } from '../src/sim/env';
import { Game, STOCK_CAP } from '../src/sim/game';
import { insert } from '../src/sim/logistics';
import { completeProject, projectNeeds, sleepingNodes, startMilestone } from '../src/sim/progress';
import { T_FLOOR, T_ROCK, type Building, type Dir, type GameEvent } from '../src/sim/types';
import { run, sandbox } from './helpers';

/** Complete drill projects, as if delivered, until `layer` is open. */
function openTo(g: Game, layer: number): void {
  while (g.s.deepest < layer && g.s.project) {
    const p = g.s.project;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
  }
}

function messages(g: Game): string[] {
  return g.events.filter((e): e is Extract<GameEvent, { t: 'message' }> => e.t === 'message').map((e) => e.text);
}

function toasts(g: Game): string[] {
  return g.events.filter((e): e is Extract<GameEvent, { t: 'toast' }> => e.t === 'toast').map((e) => e.text);
}

function find(g: Game, layer: number, type: string): Building {
  const b = [...g.s.buildings.values()].find((x) => x.layer === layer && x.type === type);
  if (!b) throw new Error(`no ${type} on layer ${layer}`);
  return b;
}

/** A free spot for a building on a layer (scans from the top-left). */
function spot(g: Game, layer: number, type: string): { x: number; y: number } {
  const L = g.layer(layer);
  for (let y = 2; y < L.h - 2; y++) for (let x = 2; x < L.w - 2; x++) if (g.canPlace(type, layer, x, y, 1).ok) return { x, y };
  throw new Error(`no room for ${type} on layer ${layer}`);
}

/** Open, revealed floor under these cells. */
function floor(g: Game, layer: number, cells: [number, number][]): void {
  const L = g.layer(layer);
  for (const [x, y] of cells) {
    L.terrain[y * L.w + x] = T_FLOOR;
    L.revealed[y * L.w + x] = 1;
  }
}

/** Put an item on a belt, halfway along it. */
function load(b: Building, id: string): void {
  b.item = { id, heat: 0 };
  b.prog = 0.5;
  b.inDir = b.dir;
  b.outDir = b.dir;
}

describe('G1: a cavern a tunnel only touches at a corner stays dark until a dig meets it straight on', () => {
  /** A rock box on the Shallows holding a lit 3x3 room and, south-east of it, a dark 4x4 cavern (10..13, 36..39). */
  function caverns(): Game {
    const g = Game.create(3);
    openTo(g, 1);
    g.s.money = 10000;
    const L = g.layer(1);
    for (let y = 28; y <= 46; y++) {
      for (let x = 1; x <= 20; x++) {
        L.terrain[y * L.w + x] = T_ROCK;
        L.revealed[y * L.w + x] = 0;
      }
    }
    for (let y = 32; y <= 34; y++) for (let x = 3; x <= 5; x++) floor(g, 1, [[x, y]]);
    for (let y = 36; y <= 39; y++) for (let x = 10; x <= 13; x++) L.terrain[y * L.w + x] = T_FLOOR;
    return g;
  }

  it('a corner touch lights nothing; the next straight-on dig floods the cavern and the queue digs on past it', () => {
    const g = caverns();
    const L = g.layer(1);
    const rev = (x: number, y: number) => L.revealed[y * L.w + x];
    const rock = (x: number, y: number) => L.terrain[y * L.w + x] === T_ROCK;
    // East out of the room, then south: (9,35) touches the cavern's corner tile (10,36) diagonally,
    // (10,35) meets it straight on, and (14,37) is reachable only through the cavern.
    const cells = [[6, 33], [7, 33], [8, 33], [9, 33], [9, 34], [9, 35], [10, 35], [14, 37]].map(([x, y]) => ({ x, y }));
    expect(g.queueDig(1, cells)).toBe(8);
    for (let i = 0; i < 600 && rock(9, 35); i++) g.tick();
    expect(rock(9, 35)).toBe(false);
    expect(rock(10, 35)).toBe(true);
    // The corner tile is not lit on its own: that used to leave the cavern dark for good.
    expect(rev(10, 36)).toBe(0);
    expect(rev(12, 38)).toBe(0);
    run(g, 2);
    expect(L.digQueue).toEqual([]);
    for (let y = 36; y <= 39; y++) for (let x = 10; x <= 13; x++) expect(rev(x, y), `${x},${y}`).toBe(1);
    expect(rock(14, 37)).toBe(false);
    expect(g.events.some((e) => e.t === 'reveal' && e.layer === 1)).toBe(true);
  });

  it('a cavern an older build half lit (its corner tile only) floods when a dig meets that tile straight on', () => {
    const g = caverns();
    const L = g.layer(1);
    for (const [x, y] of [[6, 33], [7, 33], [8, 33], [9, 33], [9, 34], [9, 35]]) g.digCell(1, x, y);
    // What the old digCell left: the corner tile lit, the cavern behind it dark.
    L.revealed[36 * L.w + 10] = 1;
    expect(L.revealed[38 * L.w + 12]).toBe(0);
    g.digCell(1, 10, 35);
    expect(L.revealed[38 * L.w + 12]).toBe(1);
    expect(L.revealed[39 * L.w + 13]).toBe(1);
  });

  it("on the real Shallows the report's 1-wide tunnel past the hidden copper cavern digs through", () => {
    const g = Game.create(20261030);
    openTo(g, 1);
    g.s.money = 5000;
    const L = g.layer(1);
    const cells = [[44, 18], [45, 18], [46, 18], [47, 18], [48, 18], [48, 19], [49, 19], [50, 19], [54, 27]].map(([x, y]) => ({ x, y }));
    expect(g.queueDig(1, cells)).toBe(9);
    run(g, 2);
    expect(L.digQueue).toEqual([]);
    for (const c of cells) expect(L.terrain[c.y * L.w + c.x], `${c.x},${c.y}`).toBe(T_FLOOR);
    // (50,22) is floor in the cavern (48,19) touched at a corner: it used to stay dark.
    expect(L.revealed[22 * L.w + 50]).toBe(1);
  });
});

describe('G2: a Drill or the Heart that has all of a good stacks the extras by the depot', () => {
  /** A belt into the Surface Drill's bottom row, from the south. */
  function drillBelt(g: Game): { drill: Building; belt: Building } {
    const drill = find(g, 0, 'drill');
    const belt = g.place('belt', 0, drill.x + 2, drill.y + 5, 0 as Dir);
    if (!belt || belt.planned) throw new Error('no belt into the drill');
    return { drill, belt };
  }

  it('takes a spare off the belt into the HQ, says so once, and never counts it toward the project', () => {
    const g = sandbox();
    const L = g.layer(0);
    const { belt } = drillBelt(g);
    const p = g.s.project!;
    p.delivered.gear = PROJECTS.d1.needs.gear;
    L.stock.gear = 10;
    g.events.length = 0;
    load(belt, 'gear');
    run(g, 1);
    expect(belt.item).toBeNull();
    expect(L.stock.gear).toBe(11);
    expect(p.delivered.gear).toBe(PROJECTS.d1.needs.gear);
    expect(p.surplus?.gear).toBe(1);
    expect(toasts(g)).toEqual(['The Drill has all its Gear; the crew stacks extras by the HQ']);
    load(belt, 'gear');
    run(g, 1);
    expect(L.stock.gear).toBe(12);
    expect(toasts(g).length).toBe(1);
    // The inspector's rows: delivered/needed, and the extras beside them.
    expect(projectNeeds(g).find((r) => r.item === 'gear')).toEqual({ item: 'gear', delivered: 30, need: 30, surplus: 2 });
    // A good it still needs counts toward the project as before.
    load(belt, 'iron_plate');
    run(g, 1);
    expect(p.delivered.iron_plate).toBe(1);
  });

  it('a molten ingot past its need cools in the depot; a cooled one is no D5 good; the Heart stacks its extras too', () => {
    const g = Game.create(3);
    openTo(g, 4);
    const L4 = g.layer(4);
    const drill = find(g, 4, 'drill');
    const p = g.s.project!;
    expect(p.id).toBe('d5');
    p.delivered.hot_ember_ingot = PROJECTS.d5.needs.hot_ember_ingot;
    const cold = L4.stock.cold_ember_ingot ?? 0;
    expect(insert(g, drill, { id: 'hot_ember_ingot', heat: 90 }, 0)).toBe(true);
    expect(L4.stock.cold_ember_ingot).toBe(cold + 1);
    expect(p.delivered.hot_ember_ingot).toBe(PROJECTS.d5.needs.hot_ember_ingot);
    expect(p.surplus?.hot_ember_ingot).toBe(1);
    expect(insert(g, drill, { id: 'cold_ember_ingot', heat: 0 }, 0)).toBe(false);
    // The Governor: an extra Engine Glass goes to the Alien Strata depot.
    openTo(g, 5);
    const heart = find(g, 5, 'heart');
    g.s.project!.delivered.engine_glass = PROJECTS.governor.needs.engine_glass;
    const glass = g.layer(5).stock.engine_glass ?? 0;
    g.events.length = 0;
    expect(insert(g, heart, { id: 'engine_glass', heat: 0 }, 0)).toBe(true);
    expect(g.layer(5).stock.engine_glass).toBe(glass + 1);
    expect(toasts(g)).toEqual(['The Heart has all its Engine Glass; the crew stacks extras by the depot']);
  });

  it('a full depot refuses the extra and the Drill says jammed (full); a good it never takes jams it (wrong)', () => {
    const g = sandbox();
    const L = g.layer(0);
    const { drill, belt } = drillBelt(g);
    g.s.project!.delivered.gear = PROJECTS.d1.needs.gear;
    L.stock.gear = STOCK_CAP;
    load(belt, 'gear');
    run(g, 1);
    expect(belt.item?.id).toBe('gear');
    expect(L.stock.gear).toBe(STOCK_CAP);
    expect(drill.status).toBe('jammed');
    expect(drill.jam).toBe('gear');
    expect(drill.jamWhy).toBe('full');
    // Room in the depot: the extra goes and the jam clears.
    L.stock.gear = 500;
    run(g, 1);
    expect(belt.item).toBeNull();
    expect(L.stock.gear).toBe(501);
    expect(drill.status).toBe('idle');
    // Iron ore is nothing D1 needs: it stops the belt, and the Drill says why.
    load(belt, 'iron_ore');
    run(g, 1);
    expect(belt.item?.id).toBe('iron_ore');
    expect(drill.status).toBe('jammed');
    expect(drill.jam).toBe('iron_ore');
    expect(drill.jamWhy).toBe('wrong');
  });
});

describe('G3: Unloaders and planned buildings', () => {
  it('a depot Unloader leaves what the queued ghosts hold, and takes the rest once they are built', () => {
    const g = sandbox();
    const L = g.layer(0);
    const hq = find(g, 0, 'hq');
    // An Unloader under the HQ into a Storage Crate.
    g.place('unloader', 0, hq.x + 1, hq.y + 3, 2, { filter: 'iron_plate' });
    g.place('crate', 0, hq.x + 1, hq.y + 4, 2);
    L.stock = { iron_plate: 50 };
    // A Smelter ghost waits for gears and holds its 10 plates.
    const sm = g.place('smelter', 0, 10, 30, 1)!;
    expect(sm.planned).toBe(true);
    expect(g.ghostHolds(0)).toEqual({ iron_plate: 10, gear: 2 });
    run(g, 40);
    expect(L.stock.iron_plate).toBe(10);
    expect(sm.planned).toBe(true);
    // The gears come: the Smelter is built from the plates it held, and nothing is held any more.
    L.stock.gear = 2;
    run(g, 1);
    expect(sm.planned).toBe(false);
    expect(L.stock.iron_plate ?? 0).toBe(0);
    expect(g.ghostHolds(0)).toEqual({});
  });

  it('Mags names the Unloaders when goods come in but they take them as they arrive', () => {
    const g = Game.create(3);
    openTo(g, 1);
    g.debugUnlockAll();
    const [L0, L1] = [g.layer(0), g.layer(1)];
    const st = find(g, 1, 'elevator');
    // An Unloader on the lower station's south face takes its gear arrivals into a Company Chute.
    const ux = st.x + 1;
    const uy = st.y + 3;
    floor(g, 1, [[ux, uy], [ux, uy + 1]]);
    expect(g.place('unloader', 1, ux, uy, 2, { filter: 'gear' })?.planned).toBe(false);
    expect(g.place('chute', 1, ux, uy + 1, 2)?.planned).toBe(false);
    // The depot keeps 2 gears; the HQ has plenty. A Press ghost needs 4.
    L1.requests = { gear: 2 };
    L1.stock.gear = 0;
    L0.stock.gear = 200;
    const at = spot(g, 1, 'press');
    const press = g.place('press', 1, at.x, at.y, 1)!;
    expect(press.planned).toBe(true);
    g.events.length = 0;
    run(g, 90);
    expect(press.planned).toBe(true);
    // Some gears reach the depot, but never the 4 the Press needs.
    expect(L1.stock.gear ?? 0).toBeGreaterThan(0);
    const about = messages(g).filter((t) => t.includes('Gear'));
    expect(about).toContain('The Shallows depot gets Gear, but Unloaders take it as it comes in. Your planned Press is waiting on it: turn them off until it is paid, or Rush the plan.');
    expect(about.some((t) => t.includes('none is coming in'))).toBe(false);
  });
});

describe('G4: Mags on goods only made on this layer or deeper', () => {
  it('with none in any depot above, says to make it down here and how, or that a deeper layer makes it', () => {
    const g = Game.create(3);
    openTo(g, 4);
    expect(g.starveMessage(4, 'heat_shield', 'pressure_forge')).toBe(
      'The Magma Shelf depot is out of Heat Shield and none is coming in. Your planned Pressure Forge is waiting on it. Make it down here (an Assembler: Aggregate and Steel Beam), or Rush the plan.',
    );
    expect(g.starveMessage(3, 'battery', 'overcharger')).toBe(
      'The Crystal Depths depot is out of Battery and none is coming in. Your planned Overcharger is waiting on it. Make it down here (an Assembler: Charged Crystal and Cobalt Ingot), or Rush the plan.',
    );
    expect(g.starveMessage(1, 'circuit', 'sequencer')).toBe(
      'The Shallows depot is out of Circuit and none is coming in. Your planned Sequencer is waiting on it. Only a deeper layer makes it (an Assembler: Conductive Powder and Copper Wire): send some up the shaft, or Rush the plan.',
    );
    // Some in a depot above: asking the elevator can work, so Mags says that again.
    g.layer(2).stock.battery = 5;
    expect(g.starveMessage(3, 'battery', 'overcharger')).toContain('Request it so the elevator brings it');
    // A good made higher up keeps the elevator advice.
    expect(g.starveMessage(3, 'cobalt_ingot', 'cutter')).toContain('The Fungal Caverns depot has none to spare');
  });
});

describe("G5: changing an Unloader's filter gives back what it holds", () => {
  it('the held good goes back to the depot and the new one comes out; switched off, it gives that back too', () => {
    const g = sandbox();
    const L = g.layer(0);
    const hq = find(g, 0, 'hq');
    // Nothing in front of it: it holds one gear.
    const un = g.place('unloader', 0, hq.x + 1, hq.y + 3, 2, { filter: 'gear' })!;
    run(g, 1);
    expect(un.item?.id).toBe('gear');
    const gears = L.stock.gear;
    const plates = L.stock.iron_plate;
    g.setFilter(un.id, 'gear');
    expect(un.item?.id).toBe('gear');
    g.setFilter(un.id, 'iron_plate');
    expect(un.item).toBeNull();
    expect(L.stock.gear).toBe(gears + 1);
    run(g, 1);
    expect(un.item?.id).toBe('iron_plate');
    expect(L.stock.iron_plate).toBe(plates - 1);
    g.setFilter(un.id, null);
    expect(un.item).toBeNull();
    expect(L.stock.iron_plate).toBe(plates);
  });
});

describe('G6: Mags says where the Engine is', () => {
  it('at M31 the nodes still asleep, at M32 the Heart, by compass and distance from the shaft', () => {
    const g = Game.create(3);
    openTo(g, 5);
    const nodes = [...g.s.buildings.values()].filter((b) => b.type === 'engine_node');
    expect(sleepingNodes(g).length).toBe(3);
    // The Waking Node made its first Heartstone at M29.
    const waking = nodes.find((b) => b.recipe === 'waking')!;
    waking.stockCount = 1;
    expect(sleepingNodes(g).map((b) => b.id)).toEqual(nodes.filter((b) => b !== waking).map((b) => b.id));
    const m31 = MILESTONES.findIndex((m) => m.n === 31);
    g.events.length = 0;
    startMilestone(g, m31);
    expect(messages(g)).toEqual([MILESTONES[m31].intro, 'The sleeping nodes are 26 tiles north-east and 43 tiles east of the shaft.']);
    for (const n of nodes) n.stockCount = 1;
    expect(sleepingNodes(g)).toEqual([]);
    g.events.length = 0;
    startMilestone(g, m31 + 1);
    expect(messages(g)).toEqual([MILESTONES[m31 + 1].intro, 'The Heart lies 36 tiles east of the shaft.']);
  });
});

describe('G7: The Governor lands as a milestone before the ending', () => {
  it('the last Heartstone into the Heart completes M32: in msDone, with its milestone event, then the ending', () => {
    const g = Game.create(3);
    openTo(g, 5);
    const m32 = MILESTONES.findIndex((m) => m.n === 32);
    startMilestone(g, m32);
    const p = g.s.project!;
    for (const [k, v] of Object.entries(PROJECTS.governor.needs)) p.delivered[k] = v;
    p.delivered.heartstone = PROJECTS.governor.needs.heartstone - 1;
    g.events.length = 0;
    expect(insert(g, find(g, 5, 'heart'), { id: 'heartstone', heat: 0 }, 0)).toBe(true);
    expect(g.s.ended).toBe(true);
    expect(g.s.msDone).toContain(32);
    expect(g.s.milestone).toBe(MILESTONES.length);
    expect(g.events).toContainEqual({ t: 'milestone', n: 32, name: 'The Governor' });
    const kinds = g.events.map((e) => e.t);
    expect(kinds.indexOf('milestone')).toBeLessThan(kinds.indexOf('ending'));
    run(g, 1);
    expect(g.s.msDone.filter((n) => n === 32)).toEqual([32]);
  });

  it('with In Sequence (M31) still open, the last Heartstone lands M31 and then M32, each with its reward, before the ending', () => {
    const g = Game.create(3);
    openTo(g, 5);
    const m31 = MILESTONES.findIndex((m) => m.n === 31);
    for (const m of MILESTONES.slice(0, m31)) g.s.msDone.push(m.n);
    startMilestone(g, m31);
    // Only the Waking Node woke: the Heart is fed before the other two nodes, so In Sequence is open.
    const waking = [...g.s.buildings.values()].find((b) => b.type === 'engine_node' && b.recipe === 'waking')!;
    waking.stockCount = 1;
    expect(g.s.stats.events.all_nodes_awake).toBeUndefined();
    const p = g.s.project!;
    expect(p.id).toBe('governor');
    for (const [k, v] of Object.entries(PROJECTS.governor.needs)) p.delivered[k] = v;
    p.delivered.heartstone = PROJECTS.governor.needs.heartstone - 1;
    const money = g.s.money;
    const income = g.incomePerMin();
    g.events.length = 0;
    expect(insert(g, find(g, 5, 'heart'), { id: 'heartstone', heat: 0 }, 0)).toBe(true);
    expect(g.s.ended).toBe(true);
    expect(g.s.msDone.slice(-2)).toEqual([31, 32]);
    expect(g.s.milestone).toBe(MILESTONES.length);
    // In Sequence pays its $1,000 as money, not income; The Governor's reward is the ending itself.
    expect(MILESTONES[m31].reward.money).toBe(1000);
    expect(MILESTONES[m31 + 1].reward).toEqual({});
    expect(g.s.money).toBe(money + 1000);
    expect(g.incomePerMin()).toBe(income);
    // Both toasts, in order, before the ending; The Governor's intro and bearings don't play over it.
    expect(g.events.filter((e) => e.t === 'milestone')).toEqual([
      { t: 'milestone', n: 31, name: 'In Sequence' },
      { t: 'milestone', n: 32, name: 'The Governor' },
    ]);
    const kinds = g.events.map((e) => e.t);
    expect(kinds.lastIndexOf('milestone')).toBeLessThan(kinds.indexOf('ending'));
    expect(messages(g)).toEqual(['Foreman... listen. It is not humming any more. It is singing.']);
    run(g, 1);
    expect(g.s.msDone.filter((n) => n >= 31)).toEqual([31, 32]);
  });
});

describe('G8: default requests', () => {
  it('the Crystal Depths keep insulation for Stabilizers and cores; the Alien Strata keep 60 plates for long lanes', () => {
    expect(LAYERS[3].requests.insulation).toBe(20);
    expect(LAYERS[3].requests.insulation).toBeGreaterThanOrEqual(BUILDINGS.stabilizer.cost.insulation);
    expect(LAYERS[5].requests.iron_plate).toBe(60);
    const g = Game.create(3);
    openTo(g, 3);
    expect(g.layer(3).requests.insulation).toBe(20);
    // The elevator brings it down from the Fungal Caverns.
    g.layer(2).stock.insulation = 50;
    run(g, 40);
    expect(g.layer(3).stock.insulation ?? 0).toBeGreaterThan(0);
  });
});

describe('G9: hints, and the breakthrough line about drill lines', () => {
  it('Mags says the drill lines end where the Drill stood when belts fed it, and nothing when none did', () => {
    const g = Game.create(3);
    const drill = find(g, 0, 'drill');
    expect(g.place('belt', 0, drill.x + 2, drill.y + 5, 0)?.planned).toBe(false);
    g.events.length = 0;
    openTo(g, 1);
    // The top station's front is its exit (review-3 K1): Mags says to feed a side or turn it, and where.
    expect(messages(g)).toContain('Up on the Surface your drill lines end where the Drill stood: belt them into a side of the top station (its front is the exit) or turn it with R, or belt them into the HQ.');
    // Below, the depot: a belt into the Shallows Drill from the south.
    const d1 = find(g, 1, 'drill');
    floor(g, 1, [[d1.x + 2, d1.y + 5]]);
    expect(g.place('belt', 1, d1.x + 2, d1.y + 5, 0)?.planned).toBe(false);
    g.events.length = 0;
    openTo(g, 2);
    expect(messages(g)).toContain('Up in the Shallows your drill lines end where the Drill stood: belt them into a side of the top station (its front is the exit) or turn it with R, or belt them into the depot.');
    // Nothing fed the Fungal Caverns drill.
    g.events.length = 0;
    openTo(g, 3);
    expect(messages(g).some((t) => t.includes('your drill lines'))).toBe(false);
  });

  it('M29 says to belt the Heartstones away; M26 says a hot line needs an overflow into the depot', () => {
    expect(MILESTONES.find((m) => m.n === 29)!.hint).toContain('Belt the Heartstones away from its front: it holds only four.');
    expect(MILESTONES.find((m) => m.n === 26)!.hint).toContain('a hot line that backs up still cools: give it an overflow into the depot.');
  });
});

describe('L1: light over awake conduit', () => {
  /** world.ts lightBand: a tile corner whose four tiles average 0.45 or more is band 1 (0.35 tint) or 0. */
  const LIT = 0.45;

  it('a belt laid along awake conduit sits in a lit band; dormant conduit adds no light', () => {
    // The alien_awake shot: the Alien Strata with every conduit awake and a loaded belt line along the
    // y = 36 conduit beside the shaft.
    const g = Game.create(20261030);
    openTo(g, 5);
    g.debugUnlockAll();
    const L = g.layer(5);
    for (let y = 32; y <= 46; y++) for (let x = 10; x <= 32; x++) if (L.occ[y * L.w + x] < 0) floor(g, 5, [[x, y]]);
    L.stock.iron_plate = 100;
    L.conduitLive.fill(0);
    refreshEnv(g, 5, true);
    const dormant = Float32Array.from(g.staticLight[5]);
    const conduit = Uint8Array.from(L.conduit);
    L.conduit.fill(0);
    refreshEnv(g, 5, true);
    expect(Array.from(g.staticLight[5])).toEqual(Array.from(dormant));
    L.conduit.set(conduit);
    L.conduitLive.set(L.conduit);
    for (let x = 14; x <= 22; x++) {
      expect(L.conduit[36 * L.w + x], `conduit at ${x},36`).toBe(1);
      const b = g.place('belt', 5, x, 36, 1);
      expect(b?.planned).toBe(false);
      if (b && x % 2 === 0) load(b, 'thrumstone');
    }
    refreshEnv(g, 5, true);
    const lt = (x: number, y: number) => (L.revealed[y * L.w + x] ? L.light[y * L.w + x] : 0);
    const corner = (cx: number, cy: number) => (lt(cx - 1, cy - 1) + lt(cx, cy - 1) + lt(cx - 1, cy) + lt(cx, cy)) / 4;
    for (let x = 14; x <= 22; x++) {
      for (const [cx, cy] of [[x, 36], [x + 1, 36], [x, 37], [x + 1, 37]]) expect(corner(cx, cy), `corner ${cx},${cy}`).toBeGreaterThanOrEqual(LIT);
    }
  });
});
