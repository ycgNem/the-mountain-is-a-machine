// Save slots tell an empty slot from one that won't load (sim review #25): the title screen must not
// start a new game over a save it couldn't read. Older saves are brought up to date on load.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layStarterLine } from '../src/app/scenarios';
import { BUILDINGS } from '../src/data/buildings';
import { MILESTONES } from '../src/data/progression';
import { Game, SAVE_VERSION } from '../src/sim/game';
import { outcropCells } from '../src/sim/mapgen';
import { startMilestone, stepLabel, stepProgress } from '../src/sim/progress';
import { SAVE_KEY, deserialize, loadFromStorage, loadSlot, saveToStorage, serialize } from '../src/sim/save';
import { T_FLOOR } from '../src/sim/types';

/** An in-memory localStorage (vitest runs in node). */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

describe('save slots', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('an empty slot is empty, a good save loads', () => {
    expect(loadSlot(1)).toEqual({ status: 'empty' });
    const g = Game.create(7);
    g.s.money = 1234;
    expect(saveToStorage(g, 1)).toBe(true);
    const r = loadSlot(1);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.game.s.money).toBe(1234);
    expect(loadFromStorage(1)?.s.money).toBe(1234);
  });

  it('a corrupted or newer save is an error that keeps the raw text, not an empty slot', () => {
    localStorage.setItem(SAVE_KEY + 0, '{"version": 2, "layers": [');
    const bad = loadSlot(0);
    expect(bad.status).toBe('error');
    if (bad.status === 'error') expect(bad.raw).toBe('{"version": 2, "layers": [');
    const newer = serialize(Game.create(7)).replace(`"version":${SAVE_VERSION}`, `"version":${SAVE_VERSION + 1}`);
    localStorage.setItem(SAVE_KEY + 2, newer);
    const r = loadSlot(2);
    expect(r).toMatchObject({ status: 'error', error: 'Unsupported save' });
    if (r.status === 'error') expect(r.raw).toBe(newer);
    // The old call still gives null for both, as before.
    expect(loadFromStorage(0)).toBeNull();
    expect(loadFromStorage(2)).toBeNull();
  });

  it('blocked storage reads as an error, not an empty slot', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadSlot(0)).toMatchObject({ status: 'error', error: 'blocked' });
  });
});

describe('version 3 saves: the tutorial gained Plates for the HQ (n 2)', () => {
  /** A save as version 3 wrote it: this game with the old milestone numbering, on a map with no ridge. */
  function v3(milestone: number, msDone: number[]): string {
    const g = Game.create(7);
    layStarterLine(g);
    const L = g.layer(0);
    for (const c of outcropCells()) L.terrain[c.y * L.w + c.x] = T_FLOOR;
    const d = JSON.parse(serialize(g));
    d.version = 3;
    d.milestone = milestone;
    d.msDone = msDone;
    return JSON.stringify(d);
  }

  it('moves the open milestone and the finished ones from the Copper Line on up by one', () => {
    expect(SAVE_VERSION).toBe(4);
    // Old index 2 was Wire and Gears (n 3), with First Light and the Copper Line done.
    const g = deserialize(v3(2, [1, 2]));
    expect(g.s.version).toBe(4);
    expect(g.s.milestone).toBe(3);
    expect(MILESTONES[g.s.milestone].name).toBe('Wire and Gears');
    // The ready-made line's Press stocked the HQ and First Light had the Drill clicked: Plates for the HQ is done too.
    expect(g.s.msDone).toEqual([1, 2, 3]);
    expect(g.s.msDone.map((n) => MILESTONES.find((m) => m.n === n)?.name)).toEqual(['First Light', 'Plates for the HQ', 'Copper Line']);
    // The Assembler unlocks with Brickwork, n 5 now (it was 4).
    expect(g.isUnlocked('milestone:5')).toBe(false);
    expect(deserialize(v3(4, [1, 2, 3, 4])).isUnlocked(BUILDINGS.assembler.unlock)).toBe(true);
  });

  it('its map has no ridge, so the Copper Line counts its dig step done, on it or reaching it later', () => {
    const d = JSON.parse(v3(1, [1]));
    d.msBase = { ...d.stats, sold: { copper_ingot: 2 } };
    d.stats.sold = { copper_ingot: 6 };
    const g = deserialize(JSON.stringify(d));
    const m = MILESTONES[g.s.milestone];
    expect(m.name).toBe('Copper Line');
    expect(g.s.msDone).toEqual([1, 2]);
    expect(m.steps.map((st) => [stepLabel(st), stepProgress(g, st).done])).toEqual([
      ['Build a Miner on copper', false],
      ['Dig through the rock', true],
      ['Ship Copper Ingot', false],
    ]);
    expect(stepProgress(g, m.steps[2]).cur).toBe(4);
    // The counts are left as they were.
    expect(g.s.msBase.dug).toBe(0);
    // A save still on First Light reaches the Copper Line later: its dig step is done as it opens.
    const copper = MILESTONES.findIndex((x) => x.name === 'Copper Line');
    const early = deserialize(v3(0, []));
    early.s.msDone = [1, 2];
    startMilestone(early, copper);
    expect(stepProgress(early, MILESTONES[copper].steps[1]).done).toBe(true);
    // On a new game's map the ridge is rock: there the step waits for digging.
    const fresh = Game.create(7);
    fresh.s.msDone = [1, 2];
    startMilestone(fresh, copper);
    expect(stepProgress(fresh, MILESTONES[copper].steps[1])).toMatchObject({ cur: 0, done: false });
  });

  it('leaves a save still on First Light where it was, and one past the ending past the last milestone', () => {
    const first = deserialize(v3(0, []));
    expect(first.s.milestone).toBe(0);
    expect(first.s.msDone).toEqual([]);
    // Its ready-made line finishes the new First Light's steps by itself.
    for (let i = 0; i < 40 * 60 && !first.s.msDone.includes(1); i++) first.tick();
    expect(first.s.msDone).toEqual([1]);
    const ended = deserialize(v3(31, Array.from({ length: 31 }, (_, i) => i + 1)));
    expect(ended.s.milestone).toBe(MILESTONES.length);
    expect(ended.s.msDone).toEqual(MILESTONES.map((m) => m.n));
  });

  it('a version 4 save loads as it was saved', () => {
    const g = Game.create(7);
    g.s.milestone = 2;
    g.s.msDone = [1, 2];
    const h = deserialize(serialize(g));
    expect(h.s.milestone).toBe(2);
    expect(h.s.msDone).toEqual([1, 2]);
  });
});
