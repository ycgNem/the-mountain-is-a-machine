// Map finders for the act bots: what a player reads off a layer (deposits and where a Miner covers
// them fully, vents, the bore site, the depot and stations, hot and warm ground, steady ground,
// water, conduits, Engine Nodes, free room), computed from the real map. Each result says whether a
// player could know it yet (`known`: revealed, or surveyed through the dark). Using something a
// player can't know yet is friction to report (Bot.noteFriction).

import { BUILDINGS } from '../../src/data/buildings';
import { LAYERS, type DepositSpec } from '../../src/data/layers';
import { heatUnder, predictPlacement } from '../../src/sim/env';
import { STEADY_GROUND, type Game } from '../../src/sim/game';
import { edgeCells, nodeSequence, outputPort, sidePort } from '../../src/sim/logistics';
import { liveConduitTiles } from '../../src/sim/production';
import { DX, DY, T_FLOOR, T_WATER, leftOf, opp, rightOf, type Building, type Dir } from '../../src/sim/types';
import type { RouteEnd } from './route';

export interface Cell {
  x: number;
  y: number;
}

/** A top-left corner for a building, and its distance from where the search was centred. */
export interface Spot extends Cell {
  dist: number;
}

export function inBounds(g: Game, layer: number, x: number, y: number): boolean {
  const L = g.layer(layer);
  return x >= 0 && y >= 0 && x < L.w && y < L.h;
}

/** Can a player see this cell (revealed) or at least its survey marker? */
export function known(g: Game, layer: number, x: number, y: number): boolean {
  const L = g.layer(layer);
  const i = y * L.w + x;
  return !!(L.revealed[i] || L.surveyed[i]);
}

/** Is the size x size footprint at (x, y) revealed open floor with nothing standing on it? */
export function isFree(g: Game, layer: number, x: number, y: number, size = 1): boolean {
  const L = g.layer(layer);
  if (x < 1 || y < 1 || x + size > L.w - 1 || y + size > L.h - 1) return false;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const i = (y + dy) * L.w + x + dx;
      if (!L.revealed[i] || L.terrain[i] !== T_FLOOR || L.occ[i] >= 0) return false;
    }
  }
  return true;
}

function centreOf(b: Building): { x: number; y: number } {
  const s = BUILDINGS[b.type].size;
  return { x: b.x + s / 2, y: b.y + s / 2 };
}

/** The layer's depot (the HQ on the Surface). */
export function depot(g: Game, layer: number): Building {
  for (const b of g.s.buildings.values()) if (b.layer === layer && (b.type === 'depot' || b.type === 'hq')) return b;
  throw new Error(`no depot on layer ${layer}`);
}

/** The station the shaft from above arrives at (it faces the depot), or null on the Surface. */
export function lowerStation(g: Game, layer: number): Building | null {
  for (const b of g.s.buildings.values()) if (b.layer === layer && b.type === 'elevator' && b.end === 1) return b;
  return null;
}

/** The station at this layer's bore site, once its project broke through (the shaft down starts here). */
export function topStation(g: Game, layer: number): Building | null {
  for (const b of g.s.buildings.values()) if (b.layer === layer && b.type === 'elevator' && b.end === 0) return b;
  return null;
}

/** The Drill (or the Heart on the Alien Strata) on this layer, if it stands. */
export function drill(g: Game, layer: number): Building | null {
  for (const b of g.s.buildings.values()) if (b.layer === layer && (b.type === 'drill' || b.type === 'heart')) return b;
  return null;
}

/** The bore site (centre of the drill's 5x5), its drill, and whether a player has reached it (revealed). */
export function boreSite(g: Game, layer: number): { x: number; y: number; drill: Building | null; reached: boolean } | null {
  const b = LAYERS[layer].boreSite;
  if (!b) {
    const h = drill(g, layer);
    if (!h) return null;
    const c = centreOf(h);
    return { x: Math.floor(c.x), y: Math.floor(c.y), drill: h, reached: !!g.layer(layer).revealed[Math.floor(c.y) * g.layer(layer).w + Math.floor(c.x)] };
  }
  const L = g.layer(layer);
  return { x: b.x, y: b.y, drill: drill(g, layer), reached: !!L.revealed[b.y * L.w + b.x] };
}

export interface MinerSpot extends Spot {
  ore: string;
  /** Items a minute at full speed (before hazards and power). */
  perMin: number;
  coverage: number;
  deposit: DepositSpec;
  /** A player can see all four tiles (revealed) or their survey markers. */
  known: boolean;
  revealed: boolean;
  /** Open floor with nothing on it: placeable now (if revealed). */
  free: boolean;
}

/**
 * Every 2x2 spot on this layer's deposits of `ore` where a Miner (a Fungus Harvester for glowcap)
 * covers at least `minCoverage` of its tiles (default 1: full coverage), nearest the deposit's centre
 * first. Vents give exactly one spot.
 */
export function minerSpots(g: Game, layer: number, ore: string, opts: { minCoverage?: number; type?: string } = {}): MinerSpot[] {
  const type = opts.type ?? (ore === 'glowcap' ? 'harvester' : 'miner');
  const def = BUILDINGS[type];
  const L = g.layer(layer);
  const out: MinerSpot[] = [];
  for (const d of LAYERS[layer].deposits) {
    if (d.ore !== ore) continue;
    for (let y = d.y - d.r - 1; y <= d.y + d.r; y++) {
      for (let x = d.x - d.r - 1; x <= d.x + d.r; x++) {
        if (x < 1 || y < 1 || x + 2 > L.w - 1 || y + 2 > L.h - 1) continue;
        const info = g.minerInfo(layer, x, y, def);
        if (info.ore !== ore || info.coverage < (opts.minCoverage ?? 1)) continue;
        const cells = g.footprintCells(layer, x, y, 2);
        if (!cells.every((i) => L.terrain[i] === T_FLOOR)) continue;
        out.push({
          x,
          y,
          dist: Math.hypot(x + 1 - d.x, y + 1 - d.y),
          ore,
          perMin: info.rate * 60,
          coverage: info.coverage,
          deposit: d,
          known: cells.every((i) => L.revealed[i] || L.surveyed[i]),
          revealed: cells.every((i) => L.revealed[i]),
          free: cells.every((i) => L.occ[i] < 0),
        });
      }
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

/**
 * Up to `n` non-overlapping free full-coverage Miner spots on `ore`, nearest `near` first (default:
 * this layer's depot). Only revealed spots (placeable now) unless `unrevealed` is set, which also
 * returns spots still in the dark (dig to them first; a player knows them only once `known`).
 * `gap` keeps that many tiles clear between the picked Miners (default 0: they may touch).
 */
export function pickMinerSpots(g: Game, layer: number, ore: string, n: number, opts: { near?: Cell; gap?: number; unrevealed?: boolean; minCoverage?: number } = {}): MinerSpot[] {
  const near = opts.near ?? centreOf(depot(g, layer));
  const gap = opts.gap ?? 0;
  const cand = minerSpots(g, layer, ore, { minCoverage: opts.minCoverage })
    .filter((s) => s.free && (opts.unrevealed || s.revealed))
    .map((s) => ({ ...s, dist: Math.hypot(s.x + 1 - near.x, s.y + 1 - near.y) }))
    .sort((a, b) => a.dist - b.dist);
  const picked: MinerSpot[] = [];
  for (const s of cand) {
    if (picked.length >= n) break;
    if (picked.some((p) => Math.abs(p.x - s.x) < 2 + gap && Math.abs(p.y - s.y) < 2 + gap)) continue;
    picked.push(s);
  }
  return picked;
}

/** Deposits on this layer (optionally of one ore), with whether a player can see them yet. */
export function deposits(g: Game, layer: number, ore?: string): (DepositSpec & { known: boolean; revealed: boolean })[] {
  return LAYERS[layer].deposits
    .filter((d) => !ore || d.ore === ore)
    .map((d) => ({ ...d, known: known(g, layer, d.x, d.y), revealed: !!g.layer(layer).revealed[d.y * g.layer(layer).w + d.x] }));
}

/** Vents (single-Miner deposits): the Miner's top-left, its heat grade, and whether it is free and revealed. */
export function vents(g: Game, layer: number, ore?: string): { x: number; y: number; ore: string; deposit: DepositSpec; heat: number; free: boolean; revealed: boolean; known: boolean }[] {
  const L = g.layer(layer);
  return LAYERS[layer].deposits
    .filter((d) => d.vent && (!ore || d.ore === ore))
    .map((d) => {
      const cells = g.footprintCells(layer, d.x - 1, d.y - 1, 2);
      return {
        x: d.x - 1,
        y: d.y - 1,
        ore: d.ore,
        deposit: d,
        heat: heatUnder(L, d.x - 1, d.y - 1, 2),
        free: cells.every((i) => L.occ[i] < 0),
        revealed: cells.every((i) => L.revealed[i]),
        known: cells.every((i) => L.revealed[i] || L.surveyed[i]),
      };
    });
}

/**
 * Free size x size spots (revealed open floor, nothing on it) nearest `near` (default: the depot),
 * optionally within `maxDist` and passing `filter`. `limit` caps the list (default 50).
 */
export function freeSpots(g: Game, layer: number, size: number, opts: { near?: Cell; maxDist?: number; filter?: (x: number, y: number) => boolean; limit?: number } = {}): Spot[] {
  const L = g.layer(layer);
  const near = opts.near ?? centreOf(depot(g, layer));
  const out: Spot[] = [];
  for (let y = 1; y + size <= L.h - 1; y++) {
    for (let x = 1; x + size <= L.w - 1; x++) {
      const dist = Math.hypot(x + size / 2 - near.x, y + size / 2 - near.y);
      if (opts.maxDist !== undefined && dist > opts.maxDist) continue;
      if (!isFree(g, layer, x, y, size)) continue;
      if (opts.filter && !opts.filter(x, y)) continue;
      out.push({ x, y, dist });
    }
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, opts.limit ?? 50);
}

/** Free spots whose heat grade (the hottest uncovered tile under them) is `grade`: 2 hot, 1 warm, 0 neither. */
export function heatSpots(g: Game, layer: number, grade: 0 | 1 | 2, opts: { size?: number; near?: Cell; maxDist?: number; limit?: number } = {}): Spot[] {
  const L = g.layer(layer);
  const size = opts.size ?? 2;
  return freeSpots(g, layer, size, { ...opts, filter: (x, y) => heatUnder(L, x, y, size) === grade });
}

/** Free spots on steady ground (at least 8 tiles from any hot ground): where a Precision Assembler may stand. */
export function steadySpots(g: Game, layer: number, opts: { size?: number; near?: Cell; maxDist?: number; limit?: number } = {}): Spot[] {
  const size = opts.size ?? 2;
  return freeSpots(g, layer, size, { ...opts, filter: (x, y) => !g.nearHotGround(layer, x, y, size, STEADY_GROUND) });
}

/** Free spots touching water (where a Washer may stand). */
export function waterSpots(g: Game, layer: number, opts: { size?: number; near?: Cell; maxDist?: number; limit?: number } = {}): Spot[] {
  const size = opts.size ?? 2;
  return freeSpots(g, layer, size, { ...opts, filter: (x, y) => g.touchesTerrain(layer, x, y, size, T_WATER) });
}

/**
 * Free spots with at least `min` footprint tiles (default 2) on conduit: awake conduit by default
 * (where an Attuner works and machines draw from the pool), or any conduit with `awake: false`.
 */
export function conduitSpots(g: Game, layer: number, opts: { awake?: boolean; min?: number; size?: number; near?: Cell; maxDist?: number; limit?: number } = {}): Spot[] {
  const L = g.layer(layer);
  const size = opts.size ?? 2;
  const min = opts.min ?? 2;
  const arr = opts.awake === false ? L.conduit : L.conduitLive;
  return freeSpots(g, layer, size, {
    ...opts,
    filter: (x, y) => {
      let n = 0;
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (arr[(y + dy) * L.w + x + dx]) n++;
      return n >= min;
    },
  });
}

/** Footprint tiles of a standing building on awake conduit. */
export function onConduit(g: Game, b: Building): number {
  return liveConduitTiles(g, b);
}

/** The Engine Nodes (Alien Strata): which is the Waking Node, what it takes in order, whether it woke, and where belts can feed it. */
export function engineNodes(g: Game): { b: Building; waking: boolean; sequence: string[]; awake: boolean; heartstones: number; inputs: RouteEnd[] }[] {
  const out = [];
  for (const b of g.s.buildings.values()) {
    if (b.type !== 'engine_node') continue;
    out.push({ b, waking: b.recipe === 'waking', sequence: nodeSequence(b), awake: b.stockCount > 0, heartstones: b.stockCount, inputs: inputCells(g, b) });
  }
  return out.sort((a, b) => (a.waking === b.waking ? a.b.id - b.b.id : a.waking ? -1 : 1));
}

/** Spore density (0..1) on a tile right now (filters included). */
export function sporeAt(g: Game, layer: number, x: number, y: number): number {
  const L = g.layer(layer);
  return L.spore[y * L.w + x] ?? 0;
}

/**
 * Where a belt can feed this building: the cell and the facing of a last belt that pushes into it
 * from outside. Machines, stations, nodes and chutes don't take items through their front; a belt
 * takes from behind and both sides; a splitter or sorter only from behind; a sequencer from its
 * sides. Miners, generators' neighbours etc. are included only where the building takes items.
 */
export function inputCells(g: Game, b: Building): RouteEnd[] {
  const def = BUILDINGS[b.type];
  let faces: Dir[];
  switch (def.kind) {
    case 'depot':
    case 'terminal':
    case 'drill':
    case 'heart':
    case 'lab':
    case 'generator':
    case 'crossing':
      faces = [0, 1, 2, 3];
      break;
    case 'machine':
    case 'elevator':
    case 'engine_node':
    case 'chute':
    case 'belt':
    case 'crate':
      faces = ([0, 1, 2, 3] as Dir[]).filter((f) => f !== b.dir);
      break;
    case 'splitter':
    case 'sorter':
      faces = [opp(b.dir)];
      break;
    case 'sequencer':
      faces = [leftOf(b.dir), rightOf(b.dir)];
      break;
    default:
      faces = [];
  }
  const out: RouteEnd[] = [];
  for (const f of faces) for (const c of edgeCells(b.x, b.y, def.size, f)) if (inBounds(g, b.layer, c.x, c.y)) out.push({ x: c.x, y: c.y, dir: opp(f) });
  return out;
}

/**
 * Where a splitter, sorter or other 1x1 piece hands items on: one { x, y, feed } per exit (a
 * splitter's front, left and right; a sorter's front and its left for the filtered item). Start a
 * route at an exit with feed = its `feed`.
 */
export function exits(b: Building): { x: number; y: number; feed: Dir; which: 'front' | 'left' | 'right' }[] {
  const kind = BUILDINGS[b.type].kind;
  const at = (d: Dir, which: 'front' | 'left' | 'right') => ({ x: b.x + DX[d], y: b.y + DY[d], feed: d, which });
  if (kind === 'splitter') return [at(b.dir, 'front'), at(leftOf(b.dir), 'left'), at(rightOf(b.dir), 'right')];
  if (kind === 'sorter') return [at(b.dir, 'front'), at(leftOf(b.dir), 'left')];
  return [at(b.dir, 'front')];
}

/**
 * The output port (or side port) a building of `type` would have at (x, y) facing `dir`, before it
 * is placed: for lining a machine up against another (an Overcharger straight into a Stabilizer).
 */
export function portOf(type: string, x: number, y: number, dir: Dir, side = false): { x: number; y: number; feed: Dir } {
  const probe = { type, x, y, dir } as Building;
  return side ? { ...sidePort(probe), feed: leftOf(dir) } : { ...outputPort(probe), feed: dir };
}

/** How a building placed here would run (the build ghost's prediction): heat grade, interferers, speed multiplier, a tap's kW. */
export function predict(g: Game, type: string, layer: number, x: number, y: number): { heat: number; links: number; mul: number; tapKw: number } {
  return predictPlacement(g, type, layer, x, y);
}

/**
 * The cell a building pushes its output into, and the way items travel into it: a machine's,
 * miner's, station's or node's output port (or its side port with `side`), or the tile ahead of a
 * belt, unloader, crate or other 1x1 piece.
 */
export function outputOf(b: Building, side = false): { x: number; y: number; feed: Dir } {
  const def = BUILDINGS[b.type];
  switch (def.kind) {
    case 'machine':
    case 'engine_node':
      return side ? { ...sidePort(b), feed: leftOf(b.dir) } : { ...outputPort(b), feed: b.dir };
    case 'miner':
    case 'collector':
    case 'elevator':
      return { ...outputPort(b), feed: b.dir };
    default:
      return { x: b.x + DX[b.dir], y: b.y + DY[b.dir], feed: b.dir };
  }
}
