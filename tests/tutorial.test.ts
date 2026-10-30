// The tutorial (owner, 2026-10-30: "make it so I have to place everything", then "I did not realize
// excavating was a thing that needed to be taught"). Every step of the first two acts that points at
// something finds it on any seed, the ridge the Copper Line digs through is the same rock on every
// seed and stands in the copper's way, and the hints say what the map and the prices really are.

import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { LAYERS } from '../src/data/layers';
import { MILESTONES, PROJECTS, type MilestoneDef, type StepDef } from '../src/data/progression';
import { Game } from '../src/sim/game';
import { SURFACE, outcropCells } from '../src/sim/mapgen';
import { checkMilestones, completeProject, currentHint, currentStep, guideMarks, nearestDeposit, stepLabel, stepProgress, type TileRect } from '../src/sim/progress';
import { T_FLOOR, T_ROCK } from '../src/sim/types';

const SEEDS = [20261030, 1, 777, 31337];
const TUTORIAL = MILESTONES.filter((m) => m.act <= 2);
/** The ridge's tiles as a rect: x 36-38, rows 19-27. */
const RIDGE: TileRect = { x: SURFACE.outcrop.x, y: SURFACE.outcrop.y, w: 3, h: SURFACE.outcrop.rows.length };

/** Where a building fits on bare floor with nothing under it, scanning out in rings from (cx, cy). */
function freeSpot(g: Game, layer: number, type: string, cx: number, cy: number): { x: number; y: number } {
  const L = g.layer(layer);
  const size = BUILDINGS[type].size;
  for (let r = 0; r < 30; r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || x < 1 || y < 1 || x + size >= L.w || y + size >= L.h) continue;
        if (g.footprintCells(layer, x, y, size).every((i) => L.terrain[i] === T_FLOOR && L.occ[i] < 0)) return { x, y };
      }
    }
  }
  throw new Error(`no room for a ${type} near ${cx},${cy} on layer ${layer}`);
}

/** A Miner's spot inside a marked rect where all four of its tiles are that ore. */
function minerSpot(g: Game, layer: number, r: TileRect, ore: string): { x: number; y: number } {
  for (let y = r.y; y <= r.y + r.h - 2; y++) {
    for (let x = r.x; x <= r.x + r.w - 2; x++) {
      const info = g.minerInfo(layer, x, y, BUILDINGS.miner);
      if (info.ore === ore && info.coverage === 1) return { x, y };
    }
  }
  throw new Error(`no full ${ore} spot for a Miner in ${JSON.stringify(r)}`);
}

/** The rect the open step's mark outlines, if any. */
function markOf(g: Game, st: StepDef): TileRect | null {
  if (!st.mark) return null;
  return guideMarks(g, st.mark.kind === 'outcrop' ? 0 : st.mark.layer)[0] ?? null;
}

/** Every layer's guide marks, as the renderer would ask for them. */
function allMarks(g: Game): TileRect[][] {
  return g.s.layers.map((_, li) => guideMarks(g, li));
}

/** What the open step's mark outlines: one rect on its own layer, nothing anywhere else. */
function checkMark(g: Game, st: StepDef, where: string): TileRect | null {
  const marks = allMarks(g);
  const mark = st.mark;
  if (!mark) {
    expect(marks.flat(), where).toEqual([]);
    return null;
  }
  const layer = mark.kind === 'outcrop' ? 0 : mark.layer;
  marks.forEach((m, li) => expect(m, `${where}: marks on layer ${li}`).toHaveLength(li === layer ? 1 : 0));
  const r = marks[layer][0];
  const L = g.layer(layer);
  expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= L.w && r.y + r.h <= L.h, `${where}: inside the map`).toBe(true);
  switch (mark.kind) {
    case 'deposit': {
      // Around the designed deposit's centre and no further than its reach, as the seed left its edge.
      const d = nearestDeposit(layer, mark.ore)!;
      expect(d.x >= r.x && d.x < r.x + r.w && d.y >= r.y && d.y < r.y + r.h, `${where}: holds the deposit's centre`).toBe(true);
      expect(r.w <= 2 * d.r + 3 && r.h <= 2 * d.r + 3, `${where}: no wider than the deposit`).toBe(true);
      break;
    }
    case 'building': {
      const b = [...g.s.buildings.values()].find((x) => x.layer === layer && x.type === mark.building)!;
      expect(r, where).toEqual({ x: b.x, y: b.y, w: BUILDINGS[b.type].size, h: BUILDINGS[b.type].size });
      break;
    }
    case 'outcrop':
      // Nothing dug yet: the whole ridge.
      expect(r, where).toEqual(RIDGE);
      break;
    case 'bore': {
      const bs = LAYERS[layer].boreSite!;
      expect(r, where).toEqual({ x: bs.x - 2, y: bs.y - 2, w: 5, h: 5 });
      break;
    }
  }
  return r;
}

/** Make the open step done the quickest way its counter allows (this is not the player: the bots play). */
function satisfy(g: Game, st: StepDef, mark: TileRect | null): void {
  const s = g.s;
  const base = s.msBase;
  switch (st.kind) {
    case 'build': {
      const layer = st.layer ?? 0;
      for (let i = 0; i < st.count; i++) {
        // A Miner goes on full ore inside the mark (which also proves the mark can be mined); the rest
        // go anywhere near the HQ or the arrival.
        const at = st.ore && mark ? minerSpot(g, layer, mark, st.ore) : freeSpot(g, layer, st.building, LAYERS[layer].arrival?.x ?? 20, LAYERS[layer].arrival?.y ?? 30);
        const b = g.forcePlace(st.building, layer, at.x, at.y, 0);
        if (st.ore) expect(b.ore).toBe(st.ore);
      }
      break;
    }
    case 'produce':
      s.stats.produced[st.item] = (base.produced[st.item] ?? 0) + st.count;
      break;
    case 'sell':
      s.stats.sold[st.item] = (base.sold[st.item] ?? 0) + st.count;
      break;
    case 'deliver':
      s.stats.delivered[st.item] = (base.delivered[st.item] ?? 0) + st.count;
      break;
    case 'event':
      s.stats.events[st.event] = 1;
      break;
    case 'dig':
      s.stats.dug = base.dug + st.count;
      break;
    case 'elevator':
      s.stats.elevator = base.elevator + st.count;
      break;
    case 'visit':
      s.visited.push(st.layer);
      break;
    case 'reach': {
      const d = nearestDeposit(st.layer, st.ore)!;
      const L = g.layer(st.layer);
      L.revealed[d.y * L.w + d.x] = 1;
      break;
    }
    case 'project': {
      const p = s.project!;
      expect(p.id).toBe(st.project);
      for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
      completeProject(g);
      break;
    }
    default:
      throw new Error(`no shortcut for a ${st.kind} step`);
  }
}

describe('the tutorial points at things that are there', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: each step of Acts I and II is current in turn, with its hint and a mark on its target`, () => {
      const g = Game.create(seed);
      for (const m of TUTORIAL) {
        expect(MILESTONES[g.s.milestone]).toBe(m);
        m.steps.forEach((st, i) => {
          const where = `seed ${seed}, M${m.n} ${m.name}, step ${i + 1} (${stepProgress(g, st).label})`;
          expect(stepProgress(g, st).done, where).toBe(false);
          expect(currentStep(g), where).toBe(st);
          expect(currentHint(g), where).toBe(st.hint ?? m.hint);
          satisfy(g, st, checkMark(g, st, where));
          expect(stepProgress(g, st).done, where).toBe(true);
        });
        // A project step's breakthrough has already moved the milestone on.
        checkMilestones(g);
        expect(g.s.msDone).toContain(m.n);
      }
      expect(MILESTONES[g.s.milestone].act).toBe(3);
    });
  }

  it('says where things are as the map has them', () => {
    const iron = nearestDeposit(0, 'iron_ore')!;
    const copper = nearestDeposit(0, 'copper_ore')!;
    const stone = nearestDeposit(0, 'stone')!;
    const shallowsCopper = nearestDeposit(1, 'copper_ore')!;
    const hq = { x: SURFACE.hq.x + 1, y: SURFACE.hq.y + 1 };
    // First Light: "the iron ore by the HQ" (the nearest deposit of anything to it).
    for (const ore of ['copper_ore', 'stone']) {
      const d = nearestDeposit(0, ore)!;
      expect(Math.hypot(iron.x - hq.x, iron.y - hq.y)).toBeLessThan(Math.hypot(d.x - hq.x, d.y - hq.y));
    }
    // The Copper Line: "east of the Terminal", with the ridge between the two.
    expect(copper.x - copper.r).toBeGreaterThan(SURFACE.terminal.x + 2);
    expect(SURFACE.outcrop.x).toBeGreaterThan(SURFACE.terminal.x + 2);
    expect(SURFACE.outcrop.x + 2).toBeLessThan(copper.x - copper.r);
    // Brickwork: "south of the factory".
    expect(stone.y).toBeGreaterThan(hq.y);
    // Down the Shaft: survey "south-east of the pocket", the deposit about as far south as east of the
    // arrival (the Act II bot's tunnel there is timed in act2.test.ts).
    const a = LAYERS[1].arrival!;
    expect(shallowsCopper.x - a.x).toBeGreaterThan(0);
    expect(shallowsCopper.y - a.y).toBeGreaterThan((shallowsCopper.x - a.x) / 2);
  });
});

describe('the ridge that teaches the Dig tool', () => {
  it('is the same rock on every seed, holds no ore, and nothing joins it', () => {
    const cells = outcropCells();
    expect(cells).toHaveLength(24);
    for (const seed of SEEDS) {
      const L = Game.create(seed).layer(0);
      const rock = new Set(cells.map((c) => c.y * L.w + c.x));
      for (const i of rock) {
        expect(L.terrain[i], `seed ${seed}`).toBe(T_ROCK);
        expect(L.ore[i], `seed ${seed}`).toBe(0);
      }
      // A ring of floor round it: the mark outlines all the rock there is, and lanes can pass it.
      for (let y = RIDGE.y - 1; y <= RIDGE.y + RIDGE.h; y++) {
        for (let x = RIDGE.x - 1; x <= RIDGE.x + RIDGE.w; x++) {
          if (!rock.has(y * L.w + x)) expect(L.terrain[y * L.w + x], `seed ${seed}: ${x},${y}`).toBe(T_FLOOR);
        }
      }
    }
  });

  it('stands across every straight way from the copper to the Terminal, so digging through it is the short way', () => {
    const L = Game.create(20261030).layer(0);
    const copper = nearestDeposit(0, 'copper_ore')!;
    const t = SURFACE.terminal;
    // Every row from above the copper's top to below the Terminal's bottom: a lane west from beside
    // the copper meets rock, 3 tiles of it from the copper's top row down to the Terminal's middle
    // one (y 20-25), 2 at the ridge's ends.
    for (let y = copper.y - copper.r - 1; y <= t.y + 3; y++) {
      const lane = [];
      for (let x = t.x + 3; x < copper.x - copper.r; x++) lane.push(L.terrain[y * L.w + x]);
      const rock = lane.filter((v) => v === T_ROCK).length;
      expect(rock, `row ${y}`).toBeGreaterThanOrEqual(2);
      if (y >= copper.y - copper.r && y <= t.y + 1) expect(rock, `row ${y}`).toBe(3);
    }
  });

  it('is dug with the real queue at the Surface price; its mark shrinks to the rock left, then moves on', () => {
    const g = Game.create(20261030);
    // Straight to the Copper Line, with its Miner built.
    for (const m of TUTORIAL.slice(0, 2)) {
      for (const st of m.steps) satisfy(g, st, markOf(g, st));
      checkMilestones(g);
    }
    expect(MILESTONES[g.s.milestone].name).toBe('Copper Line');
    const minerStep = MILESTONES[g.s.milestone].steps[0];
    satisfy(g, minerStep, markOf(g, minerStep));
    expect(stepProgress(g, currentStep(g)!).label).toBe('Dig through the rock');
    expect(guideMarks(g, 0)).toEqual([RIDGE]);
    const money = g.s.money;
    // The bottom row first: two tiles, and the rock left ends a row higher.
    expect(g.queueDig(0, [{ x: 36, y: 27 }, { x: 37, y: 27 }])).toBe(2);
    for (let i = 0; i < 60 && g.layer(0).digQueue.length; i++) g.tick();
    expect(g.s.money).toBe(money - 2 * LAYERS[0].digCost);
    expect(guideMarks(g, 0)).toEqual([{ ...RIDGE, h: RIDGE.h - 1 }]);
    expect(stepProgress(g, currentStep(g)!).cur).toBe(2);
    // A third tile finishes the step: the mark moves on to the Terminal the copper sells at.
    expect(g.queueDig(0, [{ x: 38, y: 24 }])).toBe(1);
    for (let i = 0; i < 60 && g.layer(0).digQueue.length; i++) g.tick();
    expect(currentStep(g)).toMatchObject({ kind: 'sell', item: 'copper_ingot' });
    expect(guideMarks(g, 0)).toEqual([{ x: SURFACE.terminal.x, y: SURFACE.terminal.y, w: 3, h: 3 }]);
  });

  it('a way dug through it before the Copper Line comes up still counts: nobody is sent to dig rock that is gone', () => {
    const g = Game.create(20261030);
    // A player who found the Dig tool during First Light and dug a lane through the ridge.
    expect(g.queueDig(0, [36, 37, 38].map((x) => ({ x, y: 24 })))).toBe(3);
    for (let i = 0; i < 60 && g.layer(0).digQueue.length; i++) g.tick();
    for (const m of TUTORIAL.slice(0, 2)) {
      for (const st of m.steps) satisfy(g, st, markOf(g, st));
      checkMilestones(g);
    }
    const m = MILESTONES[g.s.milestone];
    expect(m.name).toBe('Copper Line');
    expect(stepProgress(g, m.steps[1])).toMatchObject({ cur: 3, max: 3, done: true });
  });
});

describe('the hints', () => {
  const texts = (m: MilestoneDef) => [m.hint, ...m.steps.map((st) => st.hint)].filter((t): t is string => !!t);

  it('show their costs as money, from the layer data', () => {
    for (const m of MILESTONES) {
      for (const t of texts(m)) {
        expect(t, `M${m.n}`).not.toMatch(/\$\{|undefined|NaN/);
        if (/ a tile/.test(t)) expect(t, `M${m.n}`).toMatch(/\$\d+ a tile/);
      }
    }
    const step = (n: number, label: string) => MILESTONES.find((m) => m.n === n)!.steps.find((st) => stepLabel(st) === label)!.hint!;
    expect(step(3, 'Dig through the rock')).toContain(`$${LAYERS[0].digCost} a tile`);
    expect(step(8, 'Survey the dark')).toContain(`$${LAYERS[1].surveyCost}.`);
    expect(step(8, 'Dig to the copper')).toContain(`$${LAYERS[1].digCost} a tile`);
    expect(step(11, 'Dig through to the bore site')).toContain(`$${LAYERS[1].digCost} a tile`);
  });

  it('name every tool the first two acts need, by its key', () => {
    const all = TUTORIAL.flatMap(texts).join(' ');
    for (const tool of ['Dig tool (E)', 'Survey tool (F)', 'X is the Remove tool', 'Lamp', 'Splitter', 'Conveyor', 'Unloader', 'requests', 'R turns', 'Company window (C)']) {
      expect(all, tool).toContain(tool);
    }
    // The Dig tool comes before the Shallows ask for a tunnel: Act I's Copper Line.
    const firstDig = TUTORIAL.find((m) => texts(m).some((t) => t.includes('Dig tool (E)')))!;
    expect(firstDig.name).toBe('Copper Line');
  });
});
