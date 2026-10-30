// Save and load. Typed arrays are stored as base64; derived fields are rebuilt on load.

import { BUILDINGS } from '../data/buildings';
import { LAYERS } from '../data/layers';
import { LOWER_STATION_DIR } from './elevator';
import { Game, SAVE_VERSION, isPausable } from './game';
import { AMBER_DECOR } from './mapgen';
import type { Building, Contract, GameState, LayerState } from './types';

const LAYER_ARRAYS = ['terrain', 'ore', 'purity', 'revealed', 'surveyed', 'hot', 'conduit', 'conduitLive', 'foundation', 'decor', 'sporeBase'] as const;

function b64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function serialize(g: Game): string {
  const s = g.s;
  const layers = s.layers.map((L) => {
    const o: Record<string, unknown> = { index: L.index, w: L.w, h: L.h, open: L.open, stock: L.stock, requests: L.requests, digQueue: L.digQueue };
    for (const k of LAYER_ARRAYS) o[k] = b64(L[k]);
    return o;
  });
  const data = {
    ...s,
    layers,
    buildings: [...s.buildings.values()],
  };
  return JSON.stringify(data);
}

export function deserialize(json: string): Game {
  const d = JSON.parse(json);
  if (!d || typeof d !== 'object' || d.version > SAVE_VERSION) throw new Error('Unsupported save');
  const layers: LayerState[] = d.layers.map((o: Record<string, unknown>, i: number) => {
    const def = LAYERS[i];
    const n = (o.w as number) * (o.h as number);
    const L: LayerState = {
      index: i,
      w: o.w as number,
      h: o.h as number,
      open: !!o.open,
      terrain: new Uint8Array(n),
      ore: new Uint8Array(n),
      purity: new Uint8Array(n),
      revealed: new Uint8Array(n),
      surveyed: new Uint8Array(n),
      hot: new Uint8Array(n),
      conduit: new Uint8Array(n),
      conduitLive: new Uint8Array(n),
      foundation: new Uint8Array(n),
      decor: new Uint8Array(n),
      sporeBase: new Uint8Array(n),
      occ: new Int32Array(n).fill(-1),
      spore: new Float32Array(n),
      light: new Float32Array(n).fill(def.ambient),
      stock: (o.stock as Record<string, number>) ?? {},
      requests: (o.requests as Record<string, number>) ?? {},
      power: { supply: 0, demand: 0, sat: 1, genCap: 0, genUsed: 0, net: 0, pool: 0, poolDemand: 0, poolSat: 1 },
      digQueue: (o.digQueue as number[]) ?? [],
    };
    for (const k of LAYER_ARRAYS) if (typeof o[k] === 'string') L[k].set(unb64(o[k] as string));
    if ((d.version ?? 1) < 2) migrateDecor(L, def.decor.length);
    return L;
  });
  const buildings = new Map<number, Building>();
  for (const b of d.buildings as Building[]) {
    // A building type that no longer exists (the cut Merger) is dropped rather than breaking the load.
    if (!BUILDINGS[b.type]) continue;
    b.links = [];
    b.envMul = b.envMul ?? 1;
    b.workT = 99;
    // A lower station always faces its depot (older builds let it turn and jam the shaft).
    if (b.type === 'elevator' && b.end === 1) b.dir = LOWER_STATION_DIR;
    // Only machines, miners and collectors honour a pause; a stray flag would only fake the badge.
    if (b.paused && !isPausable(b.type)) delete b.paused;
    buildings.set(b.id, b);
  }
  // Contracts count Chute deliveries since version 3.
  const contracts = d.contracts as GameState['contracts'] | undefined;
  if (contracts) {
    const fix = (c: Contract | null) => {
      if (c) c.chute = c.chute ?? 0;
    };
    fix(contracts.active);
    for (const o of contracts.offers ?? []) fix(o);
  }
  // Occupancy from footprints.
  for (const b of buildings.values()) {
    const size = BUILDINGS[b.type].size;
    const L = layers[b.layer];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) L.occ[(b.y + dy) * L.w + b.x + dx] = b.id;
  }
  const s: GameState = { ...d, layers, buildings, version: SAVE_VERSION };
  return new Game(s);
}

/** Version 1 saves: the amber rock was decor 5 on the Shallows; values past a layer's decor list are cleared. */
function migrateDecor(L: LayerState, kinds: number): void {
  for (let i = 0; i < L.decor.length; i++) {
    const v = L.decor[i];
    if (L.index === 1 && v === 5) L.decor[i] = AMBER_DECOR;
    else if (v > kinds && v !== AMBER_DECOR) L.decor[i] = 0;
  }
}

export const SAVE_KEY = 'mountain-save-';

export function saveToStorage(g: Game, slot = 0): boolean {
  try {
    localStorage.setItem(SAVE_KEY + slot, serialize(g));
    localStorage.setItem(SAVE_KEY + slot + '-meta', JSON.stringify({ time: g.s.time, money: g.s.money, deepest: g.s.deepest, saved: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a slot and say what happened: 'empty' (no save there), 'ok', or 'error' when a save exists but
 * can't be loaded (from a newer build, or corrupted). On an error the raw text is kept so it can be
 * exported; never start a new game over it.
 */
export type SlotLoad = { status: 'empty' } | { status: 'ok'; game: Game } | { status: 'error'; error: string; raw: string };

export function loadSlot(slot = 0): SlotLoad {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SAVE_KEY + slot);
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e), raw: '' };
  }
  if (!raw) return { status: 'empty' };
  try {
    return { status: 'ok', game: deserialize(raw) };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e), raw };
  }
}

/** The game in a slot, or null when it is empty or can't be loaded (use loadSlot to tell them apart). */
export function loadFromStorage(slot = 0): Game | null {
  const r = loadSlot(slot);
  return r.status === 'ok' ? r.game : null;
}

/** Save slots on the title screen. */
export const SLOTS = 3;

/** Erase one slot. */
export function clearSlot(slot: number): void {
  try {
    localStorage.removeItem(SAVE_KEY + slot);
    localStorage.removeItem(SAVE_KEY + slot + '-meta');
  } catch {
    // storage blocked: nothing to erase
  }
}

export function saveMeta(slot = 0): { time: number; money: number; deepest: number; saved: number } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY + slot + '-meta');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
