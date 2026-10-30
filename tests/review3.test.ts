// Review 3's sim-side findings (docs/reviews/review-3/decisions.md): K1 a belt into the top station's
// front and Mags's drill-lines line, K2 belts facing each other, K4 the Strange tab, K7 drags that
// start on a working line, K8 hints, K9 and Q10 message texts, K11 Act I's milestone cash, K13 the
// radio order at a breakthrough, Q2 the crew's fuelled generator, A1 decor weights.

import { describe, expect, it } from 'vitest';
import { BUILDING_LIST, CATEGORIES } from '../src/data/buildings';
import { LAYERS, TALL_DECOR } from '../src/data/layers';
import { CONTRACTS, MILESTONES, PROJECTS } from '../src/data/progression';
import { Game } from '../src/sim/game';
import { BAY_CAP_PER_CAB, GEN_FUEL_CAP, insert, shaftCab } from '../src/sim/logistics';
import { AMBER_DECOR, generateLayer } from '../src/sim/mapgen';
import { JAM_FRESH, jamFresh } from '../src/sim/production';
import { completeProject, drillLinesLine, startMilestone } from '../src/sim/progress';
import { hash2 } from '../src/sim/rng';
import { T_FLOOR, type Building, type Dir, type GameEvent } from '../src/sim/types';
import { starveAdvice } from './bot';
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

function find(g: Game, layer: number, type: string): Building {
  const b = [...g.s.buildings.values()].find((x) => x.layer === layer && x.type === type);
  if (!b) throw new Error(`no ${type} on layer ${layer}`);
  return b;
}

/** Put an item on a belt, halfway along it. */
function load(b: Building, id: string): void {
  b.item = { id, heat: 0 };
  b.prog = 0.5;
  b.inDir = b.dir;
  b.outDir = b.dir;
}

/** Lay belts from (x0, y0) to (x1, y1), all facing `dir`. */
function line(g: Game, x0: number, y0: number, x1: number, y1: number, dir: Dir): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) {
    const b = g.place('belt', 0, x0 + Math.sign(x1 - x0) * k, y0 + Math.sign(y1 - y0) * k, dir);
    if (!b || b.planned) throw new Error('belt not laid');
  }
}

/** A straight drag of `type` from (x0, y0) to (x1, y1), every piece facing `dir`. */
function drag(x0: number, y0: number, x1: number, y1: number, dir: Dir): { x: number; y: number; dir: Dir }[] {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  return Array.from({ length: n + 1 }, (_, k) => ({ x: x0 + Math.sign(x1 - x0) * k, y: y0 + Math.sign(y1 - y0) * k, dir }));
}

describe('K1: the top station front is its exit', () => {
  /** The Shallows open, a belt at (x, y) facing `dir` toward the Surface's top station (31..33, 10..12, front south). */
  function station(belt: { x: number; y: number; dir: Dir }): { g: Game; st: Building; belt: Building } {
    const g = Game.create(3);
    openTo(g, 1);
    const st = find(g, 0, 'elevator');
    expect([st.x, st.y, st.dir]).toEqual([31, 10, 2]);
    const b = g.place('belt', 0, belt.x, belt.y, belt.dir);
    if (!b || b.planned) throw new Error('belt not laid');
    return { g, st, belt: b };
  }

  it('a belt pushing into the front marks the station jammed (front) while it pushes, then it clears', () => {
    const { g, st, belt } = station({ x: 31, y: 13, dir: 0 });
    load(belt, 'reinforced_plate');
    run(g, 2);
    expect(belt.item?.id).toBe('reinforced_plate');
    expect(st.jam).toBe('reinforced_plate');
    expect(st.jamWhy).toBe('front');
    expect(jamFresh(g, st)).toBe(true);
    expect(st.status).toBe('jammed');
    // Taken off, the jam goes stale within JAM_FRESH ticks and the station is idle again.
    g.remove(0, 31, 13);
    for (let i = 0; i <= JAM_FRESH; i++) g.tick();
    expect(jamFresh(g, st)).toBe(false);
    expect(st.status).toBe('idle');
  });

  it('a side face that is only full for now is no jam: a full bay, or a lower depot with 999 of it', () => {
    const { g, st, belt } = station({ x: 30, y: 11, dir: 1 });
    const sh = g.s.shafts[st.shaft];
    // The cab never leaves: the bay stays full.
    const cap = shaftCab(sh.tier) * BAY_CAP_PER_CAB;
    for (let i = 0; i < cap; i++) sh.bay[0].push({ id: 'gear', heat: 0 });
    sh.state = 'move';
    sh.timer = 1e9;
    load(belt, 'gear');
    run(g, 1);
    expect(belt.item?.id).toBe('gear');
    expect(st.jamT).toBeUndefined();
    expect(st.status).toBe('idle');
    // Room in the bay, but the Shallows depot holds 999 gears: the gear waits, still no jam.
    sh.bay[0].length = 0;
    g.layer(1).stock.gear = 999;
    run(g, 1);
    expect(belt.item?.id).toBe('gear');
    expect(st.jamT).toBeUndefined();
    // The depot has room: in it goes.
    g.layer(1).stock.gear = 10;
    run(g, 1);
    expect(belt.item).toBeNull();
    expect(sh.bay[0].map((it) => it.id)).toEqual(['gear']);
  });

  it("Mags says where the drill lines are and that the front is the exit, or to turn the station or use the depot", () => {
    expect(drillLinesLine(0)).toBe('Up on the Surface your drill lines end where the Drill stood: belt them into a side of the top station (its front is the exit) or turn it with R, or belt them into the HQ.');
    expect(drillLinesLine(1)).toBe('Up in the Shallows your drill lines end where the Drill stood: belt them into a side of the top station (its front is the exit) or turn it with R, or belt them into the depot.');
    expect(drillLinesLine(4)).toContain('Up on the Magma Shelf your drill lines');
  });
});

describe('K2: belts whose heads push into each other', () => {
  it('both belts are marked head-on while they push; a turned belt clears them', () => {
    const g = sandbox();
    const a = g.place('belt', 0, 10, 30, 1)!;
    const b = g.place('belt', 0, 11, 30, 3)!;
    load(a, 'gear');
    load(b, 'brick');
    run(g, 1);
    expect(a.item?.id).toBe('gear');
    expect(b.item?.id).toBe('brick');
    for (const x of [a, b]) {
      expect(x.jamWhy).toBe('headon');
      expect(jamFresh(g, x)).toBe(true);
    }
    // Turn the second one east: the line runs and the marks go stale.
    g.rotate(b.id, 1);
    run(g, 1);
    expect(jamFresh(g, a)).toBe(false);
    expect(jamFresh(g, b)).toBe(false);
  });

  it('a backed-up line, a side-load into a full belt and a belt facing a ghost are no jam', () => {
    const g = sandbox();
    // A line east that ends on bare floor: everything on it stops.
    line(g, 20, 32, 22, 32, 1);
    for (const x of [20, 21, 22]) load(g.at(0, x, 32)!, 'gear');
    // A belt side-loading into the end of a north line that is stuck.
    const north = g.place('belt', 0, 30, 30, 0)!;
    const side = g.place('belt', 0, 29, 30, 1)!;
    load(north, 'brick');
    load(side, 'gear');
    // A belt facing a ghost belt that faces it back.
    g.layer(0).stock.iron_plate = 1;
    const real = g.place('belt', 0, 40, 30, 1)!;
    const ghost = g.place('belt', 0, 41, 30, 3)!;
    expect(ghost.planned).toBe(true);
    load(real, 'gear');
    run(g, 1);
    for (const b of [g.at(0, 20, 32)!, g.at(0, 21, 32)!, g.at(0, 22, 32)!, north, side, real, ghost]) expect(b.jamT, `${b.x},${b.y}`).toBeUndefined();
  });
});

describe('K4: each layer\'s own machines have their own tab', () => {
  it('Strange is the fifth tab, on key 5, and every tab fits one row of 13', () => {
    expect(CATEGORIES.map((c) => `${c.key} ${c.id}`)).toEqual(['1 logistics', '2 production', '3 power', '4 utility', '5 strange']);
    const strange = ['washer', 'separator', 'harvester', 'spore_collector', 'cutter', 'crusher', 'charger', 'overcharger', 'stabilizer', 'cooling_bath', 'pressure_forge', 'precision_assembler', 'attuner'];
    expect(BUILDING_LIST.filter((b) => b.category === 'strange').map((b) => b.id)).toEqual(strange);
    expect(BUILDING_LIST.filter((b) => b.category === 'production').map((b) => b.id)).toEqual(['miner', 'smelter', 'press', 'assembler', 'foundry']);
    for (const c of CATEGORIES) expect(BUILDING_LIST.filter((b) => b.category === c.id && !b.fixed).length, c.id).toBeLessThanOrEqual(13);
    expect(BUILDING_LIST.filter((b) => b.category === 'special').every((b) => b.fixed)).toBe(true);
  });
});

describe('K7: a drag that starts on a working line', () => {
  it('starting on a straight run of a line across it, it lays a Crossing there: the new line crosses instead of merging', () => {
    const g = sandbox();
    // A brick line north along x = 29 (y 26 -> 15) into a crate; a gear line east along y = 20 ending at (28,20).
    line(g, 29, 26, 29, 15, 0);
    const north = g.forcePlace('crate', 0, 29, 14, 0);
    line(g, 24, 20, 28, 20, 1);
    const pieces = drag(29, 20, 33, 20, 1);
    const plan = g.planDrag(0, 'belt', pieces);
    expect(plan[0]).toMatchObject({ x: 29, y: 20, type: 'crossing', skip: false });
    expect(plan.slice(1).every((p) => p.type === 'belt' && !p.skip)).toBe(true);
    expect(g.placeDrag(0, 'belt', pieces).refused).toEqual([]);
    expect(g.at(0, 29, 20)?.type).toBe('crossing');
    const east = g.forcePlace('crate', 0, 34, 20, 1);
    for (const x of [24, 26]) load(g.at(0, x, 20)!, 'gear');
    for (const y of [24, 22]) load(g.at(0, 29, y)!, 'brick');
    run(g, 12);
    // Gears went east across the brick line, bricks north across the gear line.
    expect(east.stockItem).toBe('gear');
    expect(east.stockCount + (east.item ? 1 : 0)).toBe(2);
    expect(north.stockItem).toBe('brick');
    expect(north.stockCount + (north.item ? 1 : 0)).toBe(2);
  });

  it('a machine pushing into the start belt from behind makes it a straight run too', () => {
    const g = sandbox();
    // A Press facing north pushes out of its front-right tile, (51,29), into a north belt there.
    const press = g.place('press', 0, 50, 30, 0, { recipe: 'iron_plate' })!;
    expect(press.planned).toBe(false);
    line(g, 51, 29, 51, 26, 0);
    expect(g.planDrag(0, 'belt', drag(51, 29, 55, 29, 1))[0]).toMatchObject({ type: 'crossing', skip: false });
  });

  it('starting on a line turning there, or ending on any line, it leaves that belt alone, and the line still delivers', () => {
    const g = sandbox();
    // A line from the west turning north at (40,20) up to a crate at (40,14).
    line(g, 35, 20, 39, 20, 1);
    line(g, 40, 20, 40, 15, 0);
    const crate = g.forcePlace('crate', 0, 40, 14, 0);
    const pieces = drag(40, 20, 44, 20, 1);
    const plan = g.planDrag(0, 'belt', pieces);
    expect(plan[0]).toMatchObject({ x: 40, y: 20, type: 'belt', skip: true });
    g.placeDrag(0, 'belt', pieces);
    expect(g.at(0, 40, 20)).toMatchObject({ type: 'belt', dir: 0 });
    load(g.at(0, 36, 20)!, 'gear');
    run(g, 10);
    // A crate passes what it holds on into its out-slot (nothing takes it from there).
    expect(crate.item?.id).toBe('gear');
    // Ending on a straight run of a line (from the west, into its side) still side-loads into it.
    line(g, 46, 26, 46, 22, 0);
    const end = g.planDrag(0, 'belt', drag(43, 24, 46, 24, 1));
    expect(end[3]).toMatchObject({ x: 46, y: 24, skip: true });
    // A one-tile drag is a single placement: it replaces what it lands on.
    expect(g.planDrag(0, 'belt', [{ x: 46, y: 24, dir: 1 }])[0]).toMatchObject({ type: 'belt', skip: false });
  });
});

describe('K8: Act I hints', () => {
  it('M4 says to keep some plates going into the HQ; M6 that machines only take parts from belts', () => {
    expect(MILESTONES.find((m) => m.n === 4)!.hint).toBe('Everything you build is paid from the HQ: keep some plates flowing into it.');
    expect(MILESTONES.find((m) => m.n === 6)!.hint).toBe('Machines only take parts from belts, never from the HQ: give the Assembler its own plate line and turn the brick line into it.');
  });
});

describe('K9 and Q10: message texts', () => {
  it('with some in stock but too few, Mags says how many there are and how many the ghost needs', () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock = { iron_plate: 50, gear: 3 };
    expect(g.starveMessage(0, 'gear', 'press')).toBe('The HQ has 3 Gear; your planned Press needs 4 and none is coming in. Make some and belt it into the HQ, or Rush the plan.');
    expect(starveAdvice(g.starveMessage(0, 'gear', 'press'))).toEqual({ layer: 0, item: 'gear', advice: 'make' });
    // The warning itself, a minute after the ghost started waiting.
    const press = g.place('press', 0, 6, 30, 1)!;
    expect(press.planned).toBe(true);
    g.events.length = 0;
    run(g, 70);
    expect(messages(g)).toContain('The HQ has 3 Gear; your planned Press needs 4 and none is coming in. Make some and belt it into the HQ, or Rush the plan.');
    // None at all: "out of", as before.
    L.stock.gear = 0;
    expect(g.starveMessage(0, 'gear', 'press')).toBe('The HQ is out of Gear and none is coming in. Your planned Press is waiting on it. Make some and belt it into the HQ, or Rush the plan.');
  });

  it("the Board's memo names the new layer with a lower-case 'the'", () => {
    const g = Game.create(3);
    openTo(g, 3);
    const memos = g.events.filter((e) => e.t === 'message' && e.who === 'board').map((e) => (e as { text: string }).text);
    expect(memos).toEqual([
      'Memo from the Board: breakthrough to the Shallows noted. Production targets will be revised upward.',
      'Memo from the Board: breakthrough to the Fungal Caverns noted. Production targets will be revised upward.',
      'Memo from the Board: breakthrough to the Crystal Depths noted. Production targets will be revised upward.',
    ]);
  });
});

describe('K11: Act I money', () => {
  it("Act I's milestone cash is halved ($725 in all); Act II's stays; contracts stay on the Surface's board", () => {
    const cash = (act: number) => MILESTONES.filter((m) => m.act === act).map((m) => m.reward.money ?? 0);
    // First Light's $50 is split with Plates for the HQ, the tutorial's second milestone.
    expect(cash(1)).toEqual([25, 25, 75, 75, 125, 150, 250]);
    expect(cash(1).reduce((a, b) => a + b, 0)).toBe(725);
    expect(cash(2)).toEqual([200, 300, 400, 500, 800]);
    const g = Game.create(20261030);
    expect(g.s.money).toBe(400);
    expect(g.s.contracts.offers.length).toBe(3);
    expect(g.s.contracts.offers.every((o) => CONTRACTS.some((c) => c.item === o.item && c.minLayer === 0))).toBe(true);
  });
});

describe('K13: the radio at a breakthrough', () => {
  it("Mags's introduction to the new layer comes first, then the drill-lines line, then the Board's memo", () => {
    const g = Game.create(20261030);
    const m7 = MILESTONES.findIndex((m) => m.n === 7);
    for (const m of MILESTONES.slice(0, m7)) g.s.msDone.push(m.n);
    startMilestone(g, m7);
    const drill = find(g, 0, 'drill');
    expect(g.place('belt', 0, drill.x + 2, drill.y + 5, 0)?.planned).toBe(false);
    const p = g.s.project!;
    for (const [k, v] of Object.entries(PROJECTS.d1.needs)) p.delivered[k] = v;
    p.delivered.gear = PROJECTS.d1.needs.gear - 1;
    g.events.length = 0;
    expect(insert(g, drill, { id: 'gear', heat: 0 }, 0)).toBe(true);
    // Repair the Drill lands at once, and Down the Shaft starts, before anything else goes on the radio.
    expect(g.s.msDone).toContain(7);
    expect(MILESTONES[g.s.milestone].n).toBe(8);
    expect(messages(g)).toEqual([
      MILESTONES[m7 + 1].intro,
      drillLinesLine(0),
      'Memo from the Board: breakthrough to the Shallows noted. Production targets will be revised upward.',
    ]);
    const kinds = g.events.map((e) => e.t);
    expect(kinds.indexOf('breakthrough')).toBeLessThan(kinds.indexOf('milestone'));
    expect(kinds.indexOf('milestone')).toBeLessThan(kinds.indexOf('message'));
    // M7's reward is paid once.
    const money = g.s.money;
    run(g, 1);
    expect(g.s.msDone.filter((n) => n === 7)).toEqual([7]);
    expect(g.s.money).toBeGreaterThanOrEqual(money);
  });
});

describe("Q2: the crew's rig runs from the first second", () => {
  it('the generator comes with GEN_FUEL_CAP coal, so the rig burns even when the Surface has no power to spare', () => {
    const g = Game.create(20261030);
    expect(g.s.lineLevel).toBe(0);
    // Eight presses kept working (inputs topped up, outputs cleared) hold the Surface over its 60 kW line.
    const presses: Building[] = [];
    for (let k = 0; k < 8; k++) {
      const pr = g.forcePlace('press', 0, 4 + k * 3, 40, 1);
      pr.recipe = 'iron_plate';
      presses.push(pr);
    }
    const tick = () => {
      for (const pr of presses) {
        pr.inBuf.iron_ingot = 10;
        pr.outBuf.length = 0;
      }
      g.tick();
    };
    for (let i = 0; i < 120; i++) tick();
    expect(g.layer(0).power.demand).toBeGreaterThan(60);
    expect(g.layer(0).power.sat).toBeLessThan(1);
    openTo(g, 1);
    const gen = find(g, 1, 'generator');
    const miner = [...g.s.buildings.values()].find((b) => b.layer === 1 && b.type === 'miner' && b.ore === 'coal')!;
    expect(gen.inBuf.coal).toBe(GEN_FUEL_CAP);
    for (let i = 0; i < 120; i++) tick();
    expect(gen.burn).toBeGreaterThan(0);
    expect(miner.status).not.toBe('no_power');
    expect(g.layer(1).power.sat).toBe(1);
    // Its spare power goes up the shaft's cable: the Surface is covered too.
    expect(g.layer(0).power.sat).toBe(1);
  });
});

describe('A1: decor weights', () => {
  /** Count each decor name on a layer (the amber rock left out). */
  function counts(li: number, seed: number): Record<string, number> {
    const L = generateLayer(li, seed);
    const out: Record<string, number> = {};
    for (const v of L.decor) if (v > 0 && v !== AMBER_DECOR) out[LAYERS[li].decor[v - 1]] = (out[LAYERS[li].decor[v - 1]] ?? 0) + 1;
    return out;
  }

  it('every layer weighs each decor name, the 32 px props least', () => {
    for (const def of LAYERS) {
      expect(def.decorWeights.length, def.id).toBe(def.decor.length);
      const tall = def.decor.filter((n) => TALL_DECOR.has(n));
      const short = def.decor.filter((n) => !TALL_DECOR.has(n));
      expect(tall.length, def.id).toBeGreaterThan(0);
      const w = (n: string) => def.decorWeights[def.decor.indexOf(n)];
      for (const t of tall) for (const s of short) expect(w(t), `${t} vs ${s}`).toBeLessThan(w(s));
      const share = tall.reduce((a, n) => a + w(n), 0) / def.decorWeights.reduce((a, b) => a + b, 0);
      expect(share, def.id).toBeLessThanOrEqual(1 / 7);
    }
    expect(TALL_DECOR.size).toBe(7);
    for (const n of TALL_DECOR) expect(LAYERS.some((L) => L.decor.includes(n)), n).toBe(true);
  });

  it("each name gets its share of a layer's props on every map: the crate stacks 1 in 12 on the Surface, tall props 1 in 8 on the Shallows", () => {
    // Where props stand is unchanged on the real map: 144 on the Surface, 52 (plus 21 amber) on the Shallows.
    const l0 = counts(0, 20261030);
    expect(Object.values(l0).reduce((a, b) => a + b, 0)).toBe(144);
    expect(l0.x_l0_crate_stack).toBeGreaterThanOrEqual(10);
    expect(l0.x_l0_crate_stack).toBeLessThanOrEqual(12);
    const l1 = counts(1, 20261030);
    expect(Object.values(l1).reduce((a, b) => a + b, 0)).toBe(52);
    expect((l1.x_l1_support ?? 0) + (l1.x_l1_minecart ?? 0)).toBeLessThanOrEqual(7);
    // Every map: a name never gets more than its weight's share (rounded up); 32 px props can get
    // fewer, where the neighbour rule turned one into a 16 px prop.
    for (const seed of [20261030, 3, 1, 42]) {
      for (let li = 0; li < LAYERS.length; li++) {
        const def = LAYERS[li];
        const c = counts(li, seed);
        const total = Object.values(c).reduce((a, b) => a + b, 0);
        const W = def.decorWeights.reduce((a, b) => a + b, 0);
        def.decor.forEach((n, k) => {
          if (TALL_DECOR.has(n)) expect(c[n] ?? 0, `${n} seed ${seed}`).toBeLessThanOrEqual(Math.ceil((total * def.decorWeights[k]) / W));
          else expect(c[n] ?? 0, `${n} seed ${seed}`).toBeGreaterThanOrEqual(Math.floor((total * def.decorWeights[k]) / W));
        });
      }
    }
  });

  it('no two 32 px props stand within 2 tiles of each other, and maps stay deterministic', () => {
    for (const seed of [20261030, 3, 1]) {
      for (let li = 0; li < LAYERS.length; li++) {
        const L = generateLayer(li, seed);
        expect(Array.from(generateLayer(li, seed).decor), `layer ${li} seed ${seed}`).toEqual(Array.from(L.decor));
        const tall: { x: number; y: number }[] = [];
        for (let i = 0; i < L.decor.length; i++) {
          const v = L.decor[i];
          if (v > 0 && v !== AMBER_DECOR && TALL_DECOR.has(LAYERS[li].decor[v - 1])) tall.push({ x: i % L.w, y: Math.floor(i / L.w) });
        }
        for (let a = 0; a < tall.length; a++) {
          for (let b = a + 1; b < tall.length; b++) {
            const d = Math.max(Math.abs(tall[a].x - tall[b].x), Math.abs(tall[a].y - tall[b].y));
            expect(d, `layer ${li} seed ${seed}: ${tall[a].x},${tall[a].y} and ${tall[b].x},${tall[b].y}`).toBeGreaterThan(2);
          }
        }
        // Decor stands on the cells the placement hash picks (floor without ore), whatever the weights.
        if (li === 1) continue;
        const s = seed + li * 7919;
        for (let y = 1; y < L.h - 1; y++) {
          for (let x = 1; x < L.w - 1; x++) {
            const i = y * L.w + x;
            const want = L.terrain[i] === T_FLOOR && !L.ore[i] && hash2(x, y, s + 11) < 0.06;
            expect(L.decor[i] > 0, `layer ${li} seed ${seed} at ${x},${y}`).toBe(want);
          }
        }
      }
    }
  });
});

