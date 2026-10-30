// The act bots' belt router: lays a belt path between two cells over revealed open floor, turning
// where it needs to, and crossing a working belt at right angles with a Crossing the way a belt drag
// does (Game.planDrag). It never touches rock, buildings or a cell some other building pushes into,
// so a new line can't pick up another line's items.

import { BUILDINGS } from '../../src/data/buildings';
import { RECIPES, recipesFor } from '../../src/data/recipes';
import type { Game } from '../../src/sim/game';
import { isSlot, outputPort, sidePort } from '../../src/sim/logistics';
import { DX, DY, T_FLOOR, leftOf, opp, rightOf, type Building, type Dir } from '../../src/sim/types';

/** The last belt of a route: it stands on (x, y) and faces `dir` (into whatever it feeds). */
export interface RouteEnd {
  x: number;
  y: number;
  dir: Dir;
}

export interface RoutePiece {
  x: number;
  y: number;
  dir: Dir;
  /** 'crossing' where the path passes over a working belt at right angles. */
  type: 'belt' | 'crossing';
}

export interface RouteOpts {
  /**
   * Items enter the first cell travelling this way (a machine pushes along its facing, an Unloader
   * along its facing). The first belt never faces back against it. Leave it out for a free start.
   */
  feed?: Dir;
  /** Cells the path must not use. */
  avoid?: (x: number, y: number) => boolean;
  /** Cross working belts at right angles with a Crossing (default true). */
  cross?: boolean;
  /** Cost of a turn in quarter tiles (default 1: a straighter line wins a tie). */
  turnCost?: number;
  /** Extra cost, in quarter tiles, of a belt on a deposit tile (default 6: keep deposits free for miners). */
  oreCost?: number;
  /** Extra cost of a crossing in quarter tiles (default 6). */
  crossCost?: number;
  /** Give up beyond this many tiles (default 300). */
  maxTiles?: number;
}

const STEP = 4;
const ANY = 4;

/**
 * Cells some building pushes items into: machine, miner, station and node ports (and side ports where
 * there is a side output, see hasSideOutput), and the cells belts and other 1x1 pieces hand on to. A
 * new belt there would take those items.
 */
export function blockedCells(g: Game, layer: number): Set<number> {
  const L = g.layer(layer);
  const out = new Set<number>();
  const add = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < L.w && y < L.h) out.add(y * L.w + x);
  };
  for (const b of g.s.buildings.values()) {
    if (b.layer !== layer) continue;
    for (const c of pushCells(b)) add(c.x, c.y);
  }
  return out;
}

/** Cells a machine, miner, station or node pushes into (not slot pieces). */
export function portCells(g: Game, layer: number): Set<number> {
  const L = g.layer(layer);
  const out = new Set<number>();
  for (const b of g.s.buildings.values()) {
    if (b.layer !== layer || isSlot(BUILDINGS[b.type].kind)) continue;
    for (const c of pushCells(b)) if (c.x >= 0 && c.y >= 0 && c.x < L.w && c.y < L.h) out.add(c.y * L.w + c.x);
  }
  return out;
}

/**
 * Does this building push anything out of its side port? A machine whose recipe has a byproduct (a
 * Separator's resin, a Thermal Extractor's slag), or with no recipe yet one it could pick does, or one
 * still holding side output from an earlier recipe; an Engine Node always (wrong items come out of its
 * side).
 */
export function hasSideOutput(b: Building): boolean {
  const kind = BUILDINGS[b.type].kind;
  if (kind === 'engine_node') return true;
  if (kind !== 'machine') return false;
  if (b.sideBuf.length) return true;
  return b.recipe ? !!RECIPES[b.recipe].side : recipesFor(b.type).some((r) => !!r.side);
}

/** Where a building can push items. */
export function pushCells(b: Building): { x: number; y: number }[] {
  const def = BUILDINGS[b.type];
  const ahead = (d: Dir) => ({ x: b.x + DX[d], y: b.y + DY[d] });
  switch (def.kind) {
    case 'machine':
    case 'engine_node':
      return hasSideOutput(b) ? [outputPort(b), sidePort(b)] : [outputPort(b)];
    case 'miner':
    case 'collector':
    case 'elevator':
      return [outputPort(b)];
    case 'belt':
    case 'unloader':
    case 'crate':
    case 'sequencer':
      return [ahead(b.dir)];
    case 'splitter':
      return [ahead(b.dir), ahead(leftOf(b.dir)), ahead(rightOf(b.dir))];
    case 'sorter':
      return [ahead(b.dir), ahead(leftOf(b.dir))];
    case 'crossing':
      return [ahead(0), ahead(1), ahead(2), ahead(3)];
    default:
      return [];
  }
}

/** A small binary heap of (cost, state) pairs. */
class Heap {
  private c: number[] = [];
  private s: number[] = [];
  get size(): number {
    return this.c.length;
  }
  push(cost: number, state: number): void {
    const c = this.c;
    const s = this.s;
    let i = c.length;
    c.push(cost);
    s.push(state);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] <= cost) break;
      c[i] = c[p];
      s[i] = s[p];
      i = p;
    }
    c[i] = cost;
    s[i] = state;
  }
  pop(): [number, number] {
    const c = this.c;
    const s = this.s;
    const top: [number, number] = [c[0], s[0]];
    const lc = c.pop()!;
    const ls = s.pop()!;
    if (c.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= c.length) break;
        const r = l + 1;
        const m = r < c.length && c[r] < c[l] ? r : l;
        if (c[m] >= lc) break;
        c[i] = c[m];
        s[i] = s[m];
        i = m;
      }
      c[i] = lc;
      s[i] = ls;
    }
    return top;
  }
}

/**
 * The cheapest belt path from `start` (the first belt's cell) to one of `ends` (a last belt's cell
 * and facing), over revealed open floor with nothing on it. Belts turn where the path turns: a
 * corner belt faces along the way out, so the item side-loads onto it. Crossing a working belt at
 * right angles lays a Crossing there (straight through, never on the first or last tile), the way a
 * drag does. Returns null when there is no way through (dig first, or clear the way).
 */
export function route(g: Game, layer: number, start: { x: number; y: number }, ends: RouteEnd[], opts: RouteOpts = {}): RoutePiece[] | null {
  const L = g.layer(layer);
  const W = L.w;
  const H = L.h;
  const blocked = blockedCells(g, layer);
  const ports = portCells(g, layer);
  const turnCost = opts.turnCost ?? 1;
  const oreCost = opts.oreCost ?? 6;
  const crossCost = opts.crossCost ?? 6;
  const maxCost = (opts.maxTiles ?? 300) * STEP * 3;
  const cross = opts.cross !== false;
  const sIdx = start.y * W + start.x;
  const inside = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const free = (i: number): boolean => {
    const x = i % W;
    const y = (i / W) | 0;
    if (!inside(x, y) || !L.revealed[i] || L.terrain[i] !== T_FLOOR || L.occ[i] >= 0) return false;
    if (i !== sIdx && blocked.has(i)) return false;
    return !opts.avoid?.(x, y);
  };
  /** A working belt this path may cross at right angles: its facing, or -1. */
  const crossable = (i: number): number => {
    if (!cross || L.occ[i] < 0 || ports.has(i)) return -1;
    const b = g.s.buildings.get(L.occ[i]);
    if (!b || BUILDINGS[b.type].kind !== 'belt' || BUILDINGS[b.type].fixed) return -1;
    if (opts.avoid?.(i % W, (i / W) | 0)) return -1;
    return b.dir;
  };
  if (!free(sIdx)) return null;
  const endAt = new Map<number, Dir[]>();
  for (const e of ends) {
    const i = e.y * W + e.x;
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || !free(i)) continue;
    const list = endAt.get(i) ?? [];
    list.push(e.dir);
    endAt.set(i, list);
  }
  if (!endAt.size) return null;

  const N = W * H * 5;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new Heap();
  const s0 = sIdx * 5 + (opts.feed ?? ANY);
  dist[s0] = 0;
  heap.push(0, s0);
  let found = -1;
  let foundDir: Dir = 0;
  while (heap.size) {
    const [cost, st] = heap.pop();
    if (cost > dist[st]) continue;
    if (cost > maxCost) break;
    const i = (st / 5) | 0;
    const din = st % 5;
    const onBelt = L.occ[i] >= 0 && i !== sIdx;
    if (!onBelt && endAt.has(i)) {
      const ok = endAt.get(i)!.find((e) => din === ANY || din !== opp(e));
      if (ok !== undefined) {
        found = st;
        foundDir = ok;
        break;
      }
    }
    const x = i % W;
    const y = (i / W) | 0;
    for (let k = 0; k < 4; k++) {
      const d = k as Dir;
      if (din !== ANY && d === opp(din as Dir)) continue;
      if (onBelt && d !== din) continue;
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (!inside(nx, ny)) continue;
      const j = ny * W + nx;
      let c = cost + STEP + (din !== ANY && d !== din ? turnCost : 0);
      if (free(j)) {
        if (L.ore[j]) c += oreCost;
      } else {
        const bd = crossable(j);
        if (bd < 0 || bd % 2 === d % 2 || endAt.has(j)) continue;
        c += crossCost;
      }
      const ns = j * 5 + d;
      if (c < dist[ns]) {
        dist[ns] = c;
        prev[ns] = st;
        heap.push(c, ns);
      }
    }
  }
  if (found < 0) return null;
  const cells: number[] = [];
  for (let st = found; st >= 0; st = prev[st]) cells.push((st / 5) | 0);
  cells.reverse();
  if (new Set(cells).size !== cells.length) return null;
  const pieces: RoutePiece[] = [];
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k];
    const x = i % W;
    const y = (i / W) | 0;
    let dir: Dir = foundDir;
    if (k + 1 < cells.length) {
      const j = cells[k + 1];
      const dx = (j % W) - x;
      const dy = ((j / W) | 0) - y;
      dir = (dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0) as Dir;
    }
    pieces.push({ x, y, dir, type: L.occ[i] >= 0 && k > 0 ? 'crossing' : 'belt' });
  }
  return pieces;
}

/**
 * The cheapest tunnel from `from` to `to` for excavation, as the cells to dig in order (rock only).
 * Known floor (revealed or surveyed) costs nothing; rock and unknown cells cost one dig each. Water,
 * magma and the map's hard edge can't be dug. `width` 2 also digs the cell to the path's right.
 */
export function digRoute(g: Game, layer: number, from: { x: number; y: number }, to: { x: number; y: number }, width: 1 | 2 = 1): { x: number; y: number }[] | null {
  const L = g.layer(layer);
  const W = L.w;
  const H = L.h;
  const inside = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const ROCK = 1;
  const pass = (i: number): number => {
    const t = L.terrain[i];
    if (t === ROCK) return 1;
    if (t !== T_FLOOR) return -1;
    return L.revealed[i] || L.surveyed[i] ? 0 : 1;
  };
  const N = W * H;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new Heap();
  const s = from.y * W + from.x;
  const t = to.y * W + to.x;
  dist[s] = 0;
  heap.push(0, s);
  while (heap.size) {
    const [cost, i] = heap.pop();
    if (cost > dist[i]) continue;
    if (i === t) break;
    const x = i % W;
    const y = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (!inside(nx, ny)) continue;
      const j = ny * W + nx;
      const p = pass(j);
      if (p < 0) continue;
      // A tiny bias for straight-ish tunnels: prefer the axis that closes the larger gap.
      const c = cost + p * 16 + 1;
      if (c < dist[j]) {
        dist[j] = c;
        prev[j] = i;
        heap.push(c, j);
      }
    }
  }
  if (!Number.isFinite(dist[t])) return null;
  const path: number[] = [];
  for (let i = t; i >= 0; i = prev[i]) path.push(i);
  path.reverse();
  const out: { x: number; y: number }[] = [];
  const seen = new Set<number>();
  const addRock = (i: number) => {
    if (seen.has(i) || L.terrain[i] !== ROCK) return;
    const x = i % W;
    const y = (i / W) | 0;
    if (!inside(x, y)) return;
    seen.add(i);
    out.push({ x, y });
  };
  for (let k = 0; k < path.length; k++) {
    const i = path[k];
    addRock(i);
    if (width === 2) {
      const j = path[Math.min(path.length - 1, k + 1)];
      const h = path[Math.max(0, k - 1)];
      const dirs = new Set<Dir>();
      for (const [a, b] of [[i, j], [h, i]] as const) {
        if (a === b) continue;
        const dx = (b % W) - (a % W);
        const dy = ((b / W) | 0) - ((a / W) | 0);
        dirs.add((dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0) as Dir);
      }
      for (const d of dirs) {
        const r = rightOf(d);
        const x = (i % W) + DX[r];
        const y = ((i / W) | 0) + DY[r];
        if (inside(x, y)) addRock(y * W + x);
      }
    }
  }
  return out;
}
