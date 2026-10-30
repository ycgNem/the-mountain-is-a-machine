// Fair merges with machines, side outputs, the chute's faces, ghost walls and the build preview:
// the sim review's logistics defects F1, F2, F3, F5 and F9 (spores).

import { describe, expect, it } from 'vitest';
import { PROJECTS } from '../src/data/progression';
import { predictPlacement, refreshEnv } from '../src/sim/env';
import { Game } from '../src/sim/game';
import { insert } from '../src/sim/logistics';
import { completeProject } from '../src/sim/progress';
import { sandbox } from './helpers';

const RICH = { cobalt_ingot: 99, insulation: 99, circuit: 99, battery: 99, aggregate: 99, heat_shield: 99, filter: 99, conductive_powder: 99 };

describe('a machine only waits on the belt at its port', () => {
  it('a belt leaving the port along the machine’s own face keeps flowing (2 wires a craft)', () => {
    const g = sandbox();
    // Press facing north at (10,30): its port is the front-right cell (11,29); the belt runs west along its face.
    const press = g.place('press', 0, 10, 30, 0, { recipe: 'copper_wire' })!;
    for (const x of [11, 10, 9, 8, 7, 6, 5]) g.place('belt', 0, x, 29, 3);
    g.forcePlace('chute', 0, 4, 29, 3);
    for (let t = 0; t < 60 * 60; t++) {
      press.inBuf.copper_ingot = Math.max(press.inBuf.copper_ingot ?? 0, 2);
      g.tick();
    }
    // 15 crafts a minute make 30 wires; it used to block for good after 6.
    expect(g.s.stats.produced.copper_wire ?? 0).toBeGreaterThanOrEqual(28);
  });

  it('a line passing a backed-up machine’s front (not its port) keeps moving', () => {
    const g = sandbox();
    // The press's port (11,29) is a dead end, so it backs up.
    const press = g.place('press', 0, 10, 30, 0, { recipe: 'iron_plate' })!;
    g.place('belt', 0, 11, 29, 0);
    // A gear line from the west turns north at (10,29), right in front of the press.
    const src = g.place('crate', 0, 4, 29, 1)!;
    for (let x = 5; x <= 9; x++) g.place('belt', 0, x, 29, 1);
    for (let y = 29; y >= 20; y--) g.place('belt', 0, 10, y, 0);
    const sink = g.place('crate', 0, 10, 19, 0)!;
    let passed = 0;
    for (let t = 0; t < 60 * 60; t++) {
      src.stockItem = 'gear';
      src.stockCount = 50;
      passed += sink.stockCount;
      sink.stockCount = 0;
      sink.stockItem = null;
      press.inBuf.iron_ingot = 2;
      g.tick();
    }
    expect(press.outBuf.length).toBe(4);
    // About 82 a minute pass (it used to be a handful once the press backed up).
    expect(passed).toBeGreaterThanOrEqual(70);
  });

  it('up-cargo leaving a top station along its face comes out', () => {
    const g = Game.create(1);
    const p = g.s.project!;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
    g.layer(0).stock.iron_plate = 999;
    const sh = g.s.shafts[0];
    // The top station (31..33, 10..12) faces south: its port is (32,13). The belt turns east along its face.
    for (const x of [32, 33, 34, 35]) expect(g.place('belt', 0, x, 13, 1)).toBeTruthy();
    for (let i = 0; i < 12; i++) sh.bay[1].push({ id: 'gear', heat: 0 });
    let drained = 0;
    for (let t = 0; t < 60 * 40; t++) {
      const end = g.at(0, 35, 13)!;
      if (end.item && end.prog >= 1) {
        end.item = null;
        drained++;
      }
      g.tick();
    }
    expect(drained).toBe(12);
  });

  it('a byproduct side-loaded onto a busy belt gets its turn', () => {
    const g = sandbox();
    // A packed north-running column at x = 9, fed from a crate and emptied at the top.
    const src = g.place('crate', 0, 9, 45, 0)!;
    for (let y = 44; y >= 21; y--) g.place('belt', 0, 9, y, 0);
    const sink = g.place('crate', 0, 9, 20, 0)!;
    // A Separator facing north at (10,30): its side port is (9,30), on the column.
    const sep = g.place('separator', 0, 10, 30, 0, { recipe: 'separate_sapstone' })!;
    g.place('belt', 0, 11, 29, 1);
    g.place('belt', 0, 12, 29, 1);
    const mainSink = g.place('crate', 0, 13, 29, 1)!;
    for (let t = 0; t < 60 * 60; t++) {
      src.stockItem = 'gear';
      src.stockCount = 50;
      sink.stockCount = 0;
      sink.stockItem = null;
      mainSink.stockCount = 0;
      mainSink.stockItem = null;
      sep.inBuf.sapstone = 2;
      g.tick();
    }
    // 10 crafts a minute; it used to stop after 5 with its side chute full.
    expect(g.s.stats.produced.resin ?? 0).toBeGreaterThanOrEqual(9);
    expect(sep.status).not.toBe('blocked');
  });
});

describe('the Company Chute', () => {
  it('takes goods from every side, whichever way it faces', () => {
    for (const dir of [0, 1, 2, 3] as const) {
      const g = sandbox();
      const chute = g.forcePlace('chute', 0, 6, 30, dir);
      for (const travel of [0, 1, 2, 3] as const) expect(insert(g, chute, { id: 'gear', heat: 0 }, travel), `facing ${dir}, from ${travel}`).toBe(true);
      expect(insert(g, chute, { id: 'overcharged_crystal', heat: 0 }, 1)).toBe(false);
    }
  });
});

describe('ghosts do nothing', () => {
  it('a planned Shield Wall blocks no interference and completes no milestone', () => {
    const g = sandbox(RICH);
    const cutter = g.place('cutter', 0, 6, 30, 1, { recipe: 'cut_crystal' })!;
    const press = g.place('press', 0, 10, 30, 1)!;
    press.active = true;
    g.layer(0).stock.steel_beam = 0;
    const wall = g.place('shield_wall', 0, 9, 30, 0)!;
    expect(wall.planned).toBe(true);
    refreshEnv(g, 0, true);
    expect(cutter.links).toContain(press.id);
    expect(cutter.envMul).toBeCloseTo(0.75, 5);
    expect(g.s.stats.events.shield_blocking).toBeUndefined();
    // Built, it blocks.
    g.layer(0).stock.steel_beam = 10;
    g.buildPlanned(0);
    expect(wall.planned).toBe(false);
    refreshEnv(g, 0, true);
    expect(cutter.links.length).toBe(0);
    expect(g.s.stats.events.shield_blocking).toBe(1);
  });
});

describe('the build preview', () => {
  it('counts spores, as the built machine will feel them', () => {
    const g = sandbox();
    const L = g.layer(0);
    L.sporeBase.fill(255);
    refreshEnv(g, 0, true);
    const p = predictPlacement(g, 'press', 0, 6, 30);
    expect(p.spores).toBeCloseTo(1, 5);
    expect(p.mul).toBeCloseTo(0.5, 5);
    // Spore-proof buildings and collectors aren't slowed.
    expect(predictPlacement(g, 'harvester', 0, 20, 30)).toMatchObject({ spores: 0, mul: 1 });
    expect(predictPlacement(g, 'spore_collector', 0, 20, 30)).toMatchObject({ spores: 0, mul: 1 });
    const press = g.place('press', 0, 6, 30, 1)!;
    refreshEnv(g, 0, true);
    expect(press.envMul).toBeCloseTo(p.mul, 5);
  });
});
