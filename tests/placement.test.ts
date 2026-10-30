// Placement, removal and refunds: the sim review's placement defects (planned crossings, drags that
// turn on a line, fake planned foundations, foundation drags reported as refused, swaps over rushed
// pieces, pausing, surveys off the map, refunds of crafts in progress and of hot items) and the
// Miner's purity.

import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { PROJECTS } from '../src/data/progression';
import { Game } from '../src/sim/game';
import { oreIndex } from '../src/sim/mapgen';
import { completeProject } from '../src/sim/progress';
import { deserialize, serialize } from '../src/sim/save';
import { paint, run, sandbox } from './helpers';

const RICH = { cobalt_ingot: 99, insulation: 99, circuit: 99, battery: 99, aggregate: 99, heat_shield: 99, filter: 99, conductive_powder: 99 };

describe('belt drags', () => {
  it('a crossing can be planned over a ghost line, and the lines cross once built', () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock = {};
    // A ghost line north along x = 20.
    for (let y = 45; y >= 31; y--) expect(g.place('belt', 0, 20, y, 0)?.planned).toBe(true);
    const across = Array.from({ length: 17 }, (_, k) => ({ x: 12 + k, y: 38, dir: 1 as const }));
    expect(g.planDrag(0, 'belt', across).find((p) => p.x === 20)).toMatchObject({ type: 'crossing', skip: false });
    expect(g.canPlace('crossing', 0, 20, 38, 1)).toMatchObject({ ok: true, planned: true });
    const r = g.placeDrag(0, 'belt', across);
    expect(r.refused).toEqual([]);
    expect(r.planned).toBe(17);
    expect(g.at(0, 20, 38)?.type).toBe('crossing');
    // Goods arrive, everything builds, and gears fed into the east line go east, not north.
    L.stock = { iron_plate: 200 };
    run(g, 1);
    expect(g.ghostQueue(0).length).toBe(0);
    const sink = g.forcePlace('crate', 0, 29, 38, 1);
    for (const x of [12, 14, 16]) g.at(0, x, 38)!.item = { id: 'gear', heat: 0 };
    run(g, 15);
    // The crate holds them (one waits in its out-slot); none went north.
    expect(sink.stockCount + (sink.item ? 1 : 0)).toBe(3);
  });

  it('a drag over a working line lays its crossing first, so the goods go to the crossing', () => {
    const g = sandbox();
    const L = g.layer(0);
    for (let y = 45; y >= 31; y--) g.place('belt', 0, 20, y, 0);
    // One plate, plus the one the crossed belt refunds: exactly one crossing. Laid in drag order, the
    // first belt would take the plate and the crossing would be refused.
    L.stock = { iron_plate: 1 };
    const r = g.placeDrag(0, 'belt', [18, 19, 20, 21, 22].map((x) => ({ x, y: 38, dir: 1 as const })));
    expect(r).toEqual({ placed: 1, planned: 4, refused: [] });
    expect(g.at(0, 20, 38)?.type).toBe('crossing');
    // With nothing at all, the crossing is refused and the release says so.
    const r2 = g.placeDrag(0, 'belt', [18, 19, 20, 21, 22].map((x) => ({ x, y: 40, dir: 1 as const })));
    expect(r2.refused).toEqual([{ x: 20, y: 40, type: 'crossing', reason: 'Not enough goods to swap this in' }]);
  });

  it("a drag that starts or turns on a line's corner leaves it alone; one along the line re-lays it", () => {
    const g = sandbox();
    // A working line west along y = 30 from x = 26, turning north at (20,30) up to y = 26.
    for (let x = 21; x <= 26; x++) g.place('belt', 0, x, 30, 3);
    for (let y = 30; y >= 26; y--) g.place('belt', 0, 20, y, 0);
    // East along y = 30, turning south at (20,30): the corner is the second leg's first tile.
    const pieces = [...[14, 15, 16, 17, 18, 19].map((x) => ({ x, y: 30, dir: 1 as const })), ...[30, 31, 32, 33, 34].map((y) => ({ x: 20, y, dir: 2 as const }))];
    expect(g.planDrag(0, 'belt', pieces).find((p) => p.x === 20 && p.y === 30)?.skip).toBe(true);
    // Starting on it and going south.
    expect(g.planDrag(0, 'belt', [{ x: 20, y: 30, dir: 2 }, { x: 20, y: 31, dir: 2 }])[0].skip).toBe(true);
    // Ending on it from the west (perpendicular): side-load, as before.
    expect(g.planDrag(0, 'belt', [17, 18, 19, 20].map((x) => ({ x, y: 30, dir: 1 as const })))[3].skip).toBe(true);
    // Running along the north leg re-lays it, end to end: that reverses the leg.
    const along = g.planDrag(0, 'belt', [30, 29, 28, 27, 26].map((y) => ({ x: 20, y, dir: 2 as const })));
    expect(along.every((p) => !p.skip && p.type === 'belt')).toBe(true);
    // The line still delivers after the turning drag is laid.
    for (const p of g.planDrag(0, 'belt', pieces)) if (!p.skip) g.place(p.type, 0, p.x, p.y, p.dir);
    expect(g.at(0, 20, 30)?.dir).toBe(0);
  });
});

describe('placement rules', () => {
  it("a foundation the depot can't pay for is refused, not shown as planned", () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock.aggregate = 0;
    const chk = g.canPlace('foundation', 0, 10, 30, 0);
    expect(chk.ok).toBe(false);
    expect(chk.reason).toBe(`Foundations can't be planned: the depot needs 2 more Heat-Resistant Aggregate`);
    expect(g.place('foundation', 0, 10, 30, 0)).toBeNull();
    expect(g.ghostQueue(0).length).toBe(0);
    L.stock.aggregate = 2;
    expect(g.canPlace('foundation', 0, 10, 30, 0)).toMatchObject({ ok: true, planned: false });
    g.place('foundation', 0, 10, 30, 0);
    expect(L.foundation[30 * L.w + 10]).toBe(1);
    expect(L.stock.aggregate).toBe(0);
  });

  it('a foundation drag counts every foundation it lays as placed (the build release toasts refusals)', () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock.aggregate = 6;
    const row = (y: number, xs: number[]) => xs.map((x) => ({ x, y, dir: 0 as const }));
    expect(g.placeDrag(0, 'foundation', row(30, [10, 11, 12]))).toEqual({ placed: 3, planned: 0, refused: [] });
    expect([10, 11, 12].map((x) => L.foundation[30 * L.w + x])).toEqual([1, 1, 1]);
    expect(L.stock.aggregate).toBe(0);
    // A single click on a laid one is refused with its reason.
    expect(g.placeDrag(0, 'foundation', row(30, [11]))).toEqual({ placed: 0, planned: 0, refused: [{ x: 11, y: 30, type: 'foundation', reason: 'Already a foundation' }] });
    // Goods for two of three: two laid, the third refused (foundations are never planned).
    L.stock.aggregate = 4;
    const r = g.placeDrag(0, 'foundation', row(32, [10, 11, 12]));
    expect(r).toMatchObject({ placed: 2, planned: 0 });
    expect(r.refused).toEqual([{ x: 12, y: 32, type: 'foundation', reason: "Foundations can't be planned: the depot needs 2 more Heat-Resistant Aggregate" }]);
    expect(g.ghostQueue(0).length).toBe(0);
  });

  it("a swap can't be paid with a rushed piece's goods: they never come back", () => {
    const g = sandbox();
    const L = g.layer(0);
    L.stock = {};
    const sp = g.place('splitter', 0, 6, 30, 1)!;
    expect(g.rush(sp.id)).toBe(true);
    expect(g.canPlace('belt', 0, 6, 30, 1)).toMatchObject({ ok: false, reason: 'Not enough goods to swap this in' });
    expect(g.place('belt', 0, 6, 30, 1)).toBeNull();
    const b = g.place('belt', 0, 8, 30, 1)!;
    expect(g.rush(b.id)).toBe(true);
    expect(g.canPlace('belt', 0, 8, 30, 2).ok).toBe(false);
    // R still turns it, for free.
    expect(g.rotate(b.id)).toBe(true);
    expect(Object.values(L.stock).every((v) => v >= 0)).toBe(true);
  });

  it('only machines, miners and collectors pause; anything can resume; loading clears stray flags', () => {
    const g = sandbox();
    const gen = g.place('generator', 0, 20, 30, 1)!;
    expect(g.setPaused(gen.id, true)).toBe(false);
    expect(gen.paused).toBeUndefined();
    const press = g.place('press', 0, 6, 30, 1)!;
    expect(g.setPaused(press.id, true)).toBe(true);
    expect(press.paused).toBe(true);
    // A flag left by an older build can be cleared, and loading clears it.
    gen.paused = true;
    expect(g.setPaused(gen.id, false)).toBe(true);
    expect(gen.paused).toBeUndefined();
    gen.paused = true;
    const h = deserialize(serialize(g));
    expect(h.b(gen.id)!.paused).toBeUndefined();
    expect(h.b(press.id)!.paused).toBe(true);
  });

  it('a survey beside the map costs nothing and says why; one reaching the map still works', () => {
    const g = Game.create(3);
    const p = g.s.project!;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
    const L = g.layer(1);
    g.s.money = 1000;
    expect(g.surveyCheck(1, -40, -40)).toMatchObject({ ok: false, reason: 'Nothing new to survey here' });
    expect(g.survey(1, -40, -40)).toBe(false);
    expect(g.s.money).toBe(1000);
    // Just off the edge, the circle still reaches the map.
    expect(g.survey(1, -3, 20)).toBe(true);
    expect(g.s.money).toBe(700);
    expect(L.surveyed[20 * L.w]).toBe(1);
    // Nothing new there now.
    expect(g.survey(1, -3, 20)).toBe(false);
    expect(g.s.money).toBe(700);
    g.s.money = 10;
    expect(g.surveyCheck(1, 40, 30)).toMatchObject({ ok: false, reason: 'A survey costs $300' });
    expect(g.surveyCheck(0, 20, 20).ok).toBe(false);
  });
});

describe('refunds', () => {
  it('removing a machine mid-craft gives back the inputs the craft took', () => {
    const g = sandbox();
    const L = g.layer(0);
    const sm = g.place('smelter', 0, 10, 30, 1, { recipe: 'iron_ingot' })!;
    sm.inBuf.iron_ore = 2;
    run(g, 0.5);
    expect(sm.active).toBe(true);
    expect(sm.inBuf.iron_ore).toBe(0);
    L.stock.iron_ore = 0;
    g.remove(0, 10, 30);
    expect(L.stock.iron_ore).toBe(2);
  });

  it('a recipe change mid-craft refunds the craft; hot items come back cooled, unstable ones are lost', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    const pa = g.place('precision_assembler', 0, 30, 34, 1, { recipe: 'ember_core' })!;
    pa.inBuf = { hot_ember_ingot: 1, circuit: 2 };
    run(g, 1);
    expect(pa.active).toBe(true);
    const circuits = L.stock.circuit ?? 0;
    g.setRecipe(pa.id, 'pa_circuit');
    expect(L.stock.cold_ember_ingot).toBe(1);
    expect(L.stock.circuit).toBe(circuits + 2);
    expect(L.stock.hot_ember_ingot).toBeUndefined();
    // A Stabilizer mid-craft: its overcharged crystal is lost, its insulation comes back.
    const st = g.place('stabilizer', 0, 6, 40, 1, { recipe: 'stabilize' })!;
    st.inBuf = { overcharged_crystal: 1, insulation: 1 };
    run(g, 1);
    expect(st.active).toBe(true);
    const ins = L.stock.insulation ?? 0;
    g.remove(0, 6, 40);
    expect(L.stock.insulation).toBe(ins + 1 + (BUILDINGS.stabilizer.cost.insulation ?? 0));
    expect(L.stock.overcharged_crystal).toBeUndefined();
  });

  it('molten ingots removed with a belt or swapped out of a crossing come back cooled', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    const belt = g.place('insulated_belt', 0, 6, 34, 1)!;
    belt.item = { id: 'hot_ember_ingot', heat: 90 };
    g.remove(0, 6, 34);
    const cr = g.place('crossing', 0, 8, 34, 1)!;
    cr.item2 = { id: 'hot_ember_ingot', heat: 90 };
    g.place('belt', 0, 8, 34, 2);
    expect(L.stock.cold_ember_ingot).toBe(2);
    expect(L.stock.hot_ember_ingot).toBeUndefined();
  });

  it('a forge that loses its hot ground mid-craft keeps its inputs', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    paint(L.hot, L.w, 10, 30, 2, 2);
    const f = g.place('pressure_forge', 0, 10, 30, 1, { recipe: 'forge_ember' })!;
    f.inBuf = { emberite: 2, steel_ingot: 1 };
    run(g, 1);
    expect(f.active).toBe(true);
    expect(f.inBuf).toEqual({ emberite: 0, steel_ingot: 0 });
    // Foundations under it: no hot ground, so it can't work here.
    paint(L.foundation, L.w, 10, 30, 2, 1);
    run(g, 1);
    expect(f.status).toBe('misplaced');
    expect(f.active).toBe(false);
    expect(f.inBuf).toEqual({ emberite: 2, steel_ingot: 1 });
  });
});

describe('miners', () => {
  it('report the purity they mine at (their ore tiles), not the top-left tile', () => {
    const g = sandbox();
    const L = g.layer(0);
    // A 2x2 whose top-left tile has no ore; the other three are rich iron.
    for (const [x, y] of [[41, 40], [40, 41], [41, 41]]) {
      L.ore[y * L.w + x] = oreIndex('iron_ore');
      L.purity[y * L.w + x] = 2;
    }
    const info = g.minerInfo(0, 40, 40, BUILDINGS.miner);
    expect(info).toMatchObject({ ore: 'iron_ore', coverage: 0.75, purity: 2 });
    expect(Math.round(info.rate * 60)).toBe(45);
  });
});
