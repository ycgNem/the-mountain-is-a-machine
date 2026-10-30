// Save slots tell an empty slot from one that won't load (sim review #25): the title screen must not
// start a new game over a save it couldn't read.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game, SAVE_VERSION } from '../src/sim/game';
import { SAVE_KEY, loadFromStorage, loadSlot, saveToStorage, serialize } from '../src/sim/save';

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
