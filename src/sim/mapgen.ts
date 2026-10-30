// Builds each layer's map from its designed deposits plus seeded noise (PLAN.md §6).

import { CONDUITS, ENGINE_NODES, HEART, LAYERS, TALL_DECOR, type LayerDef } from '../data/layers';
import { hash2, mulberry32, noise2 } from './rng';
import { T_FLOOR, T_HARD, T_MAGMA, T_ROCK, T_WATER, type LayerState } from './types';

export const ORE_LIST = [
  'iron_ore',
  'copper_ore',
  'stone',
  'coal',
  'sapstone',
  'glowcap',
  'chorus_crystal',
  'emberite',
  'thrumstone',
] as const;

export function oreIndex(id: string): number {
  return ORE_LIST.indexOf(id as (typeof ORE_LIST)[number]) + 1;
}

export function oreAt(L: LayerState, x: number, y: number): string | null {
  const v = L.ore[y * L.w + x];
  return v ? ORE_LIST[v - 1] : null;
}

/** Fixed Surface layout (top-left corners). */
export const SURFACE = {
  hq: { x: 26, y: 17 },
  terminal: { x: 32, y: 24 },
  drill: { x: 30, y: 9 },
};

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

class Carver {
  L: LayerState;
  seed: number;
  constructor(L: LayerState, seed: number) {
    this.L = L;
    this.seed = seed;
  }
  inside(x: number, y: number): boolean {
    return x > 0 && y > 0 && x < this.L.w - 1 && y < this.L.h - 1;
  }
  set(x: number, y: number, t: number): void {
    if (!this.inside(x, y)) return;
    this.L.terrain[y * this.L.w + x] = t;
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.L.w || y >= this.L.h) return T_HARD;
    return this.L.terrain[y * this.L.w + x];
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, amp: number, t: number = T_FLOOR): void {
    const pad = Math.ceil(amp + 1);
    for (let y = Math.floor(cy - ry - pad); y <= Math.ceil(cy + ry + pad); y++) {
      for (let x = Math.floor(cx - rx - pad); x <= Math.ceil(cx + rx + pad); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        const n = (noise2(x * 0.3, y * 0.3, this.seed) - 0.5) * amp;
        if (d < 1 + n * 0.5) this.set(x, y, t);
      }
    }
  }
  rect(r: Rect, t: number): void {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) this.set(x, y, t);
  }
  /** A wiggly corridor of the given width. */
  corridor(x0: number, y0: number, x1: number, y1: number, width: number): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wob = (noise2(i * 0.15, 3.3, this.seed) - 0.5) * 3;
      const nx = -(y1 - y0);
      const ny = x1 - x0;
      const nl = Math.hypot(nx, ny) || 1;
      const px = x0 + (x1 - x0) * t + (nx / nl) * wob;
      const py = y0 + (y1 - y0) * t + (ny / nl) * wob;
      const r = width / 2;
      for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) {
        for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
          if ((x - px) ** 2 + (y - py) ** 2 <= r * r + 0.3) this.set(x, y, T_FLOOR);
        }
      }
    }
  }
}

export function emptyLayer(def: LayerDef): LayerState {
  const n = def.w * def.h;
  return {
    index: def.index,
    w: def.w,
    h: def.h,
    open: def.index === 0,
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
    stock: {},
    requests: {},
    power: { supply: 0, demand: 0, sat: 1, genCap: 0, genUsed: 0, net: 0, pool: 0, poolDemand: 0, poolSat: 1 },
    digQueue: [],
  };
}

export function generateLayer(index: number, seed: number): LayerState {
  const def = LAYERS[index];
  const L = emptyLayer(def);
  const s = seed + index * 7919;
  const c = new Carver(L, s);
  const rand = mulberry32(s);

  if (index === 0) {
    generateSurface(L, def, c, rand, s);
  } else {
    generateUnderground(L, def, c, rand, s);
  }
  placeDeposits(L, def, s);
  if (index === 2) computeSporeBase(L, def);
  placeDecor(L, def, s);
  revealStart(L, def);
  return L;
}

function generateSurface(L: LayerState, def: LayerDef, c: Carver, rand: () => number, s: number): void {
  L.terrain.fill(T_FLOOR);
  // Hard border and the mountain face across the top.
  for (let x = 0; x < L.w; x++) {
    let face = 7 + Math.round((noise2(x * 0.18, 0.5, s) - 0.5) * 5);
    if (x >= 28 && x <= 36) face = 9;
    for (let y = 0; y < face; y++) L.terrain[y * L.w + x] = T_HARD;
  }
  for (let x = 0; x < L.w; x++) {
    L.terrain[x] = T_HARD;
    L.terrain[(L.h - 1) * L.w + x] = T_HARD;
  }
  for (let y = 0; y < L.h; y++) {
    L.terrain[y * L.w] = T_HARD;
    L.terrain[y * L.w + L.w - 1] = T_HARD;
  }
  // Boulder clusters, kept clear of the fixed layout and deposits.
  const keepClear: Rect[] = [
    { x0: 26, y0: 8, x1: 38, y1: 14 },
    { x0: 13, y0: 15, x1: 37, y1: 28 },
  ];
  for (const d of def.deposits) keepClear.push({ x0: d.x - d.r - 2, y0: d.y - d.r - 2, x1: d.x + d.r + 2, y1: d.y + d.r + 2 });
  let placed = 0;
  for (let tries = 0; tries < 200 && placed < 14; tries++) {
    const cx = 3 + Math.floor(rand() * (L.w - 6));
    const cy = 11 + Math.floor(rand() * (L.h - 14));
    if (keepClear.some((r) => cx >= r.x0 - 2 && cx <= r.x1 + 2 && cy >= r.y0 - 2 && cy <= r.y1 + 2)) continue;
    const rx = 1 + rand() * 1.6;
    const ry = 0.8 + rand() * 1.2;
    c.ellipse(cx, cy, rx, ry, 0.8, T_ROCK);
    placed++;
  }
}

function generateUnderground(L: LayerState, def: LayerDef, c: Carver, rand: () => number, s: number): void {
  L.terrain.fill(T_ROCK);
  for (let x = 0; x < L.w; x++) {
    L.terrain[x] = T_HARD;
    L.terrain[(L.h - 1) * L.w + x] = T_HARD;
  }
  for (let y = 0; y < L.h; y++) {
    L.terrain[y * L.w] = T_HARD;
    L.terrain[y * L.w + L.w - 1] = T_HARD;
  }
  const a = def.arrival!;
  // Start pocket around the shaft, with room for the station and the depot.
  c.ellipse(a.x + 1, a.y, 11, 7, 0.6);
  c.rect({ x0: a.x - 2, y0: a.y - 2, x1: a.x + 6, y1: a.y + 2 }, T_FLOOR);

  // Visible deposits: caverns joined to the pocket.
  for (const d of def.deposits) {
    if (d.hidden) continue;
    c.ellipse(d.x, d.y, d.r + 3, d.r + 2.5, 0.7);
    c.corridor(a.x, a.y, d.x, d.y, 3);
  }
  // Hidden deposits: caverns you dig into.
  for (const d of def.deposits) {
    if (!d.hidden) continue;
    c.ellipse(d.x, d.y, d.r + 3.5, d.r + 3, 0.8);
  }
  // The bore site: a hidden cavern with room for the drill.
  if (def.boreSite) {
    const b = def.boreSite;
    c.ellipse(b.x, b.y, 7, 5.5, 0.6);
    c.rect({ x0: b.x - 3, y0: b.y - 3, x1: b.x + 3, y1: b.y + 3 }, T_FLOOR);
  }
  // Alien strata: the Heart's chamber and the Engine Nodes.
  if (def.index === 5) {
    c.ellipse(HEART.x, HEART.y, 8, 6.5, 0.4);
    c.rect({ x0: HEART.x - 4, y0: HEART.y - 4, x1: HEART.x + 4, y1: HEART.y + 4 }, T_FLOOR);
    ENGINE_NODES.forEach((n, i) => {
      c.ellipse(n.x, n.y, 4.5, 4, 0.5);
      c.rect({ x0: n.x - 2, y0: n.y - 2, x1: n.x + 2, y1: n.y + 2 }, T_FLOOR);
      if (i === 2) c.corridor(a.x, a.y, n.x, n.y, 3);
    });
  }
  // A few empty caverns to find.
  for (let k = 0; k < 6; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const x = 6 + Math.floor(rand() * (L.w - 12));
      const y = 5 + Math.floor(rand() * (L.h - 10));
      if (Math.hypot(x - a.x, y - a.y) < 16) continue;
      if (def.boreSite && Math.hypot(x - def.boreSite.x, y - def.boreSite.y) < 10) continue;
      c.ellipse(x, y, 2.5 + rand() * 2.5, 2 + rand() * 2, 0.9);
      break;
    }
  }
  // Rock pillars inside big caverns, away from anything that needs space.
  for (let i = 0; i < L.w * L.h * 0.012; i++) {
    const x = 2 + Math.floor(rand() * (L.w - 4));
    const y = 2 + Math.floor(rand() * (L.h - 4));
    if (Math.hypot(x - a.x - 2, y - a.y) < 8) continue;
    if (def.boreSite && Math.hypot(x - def.boreSite.x, y - def.boreSite.y) < 6) continue;
    if (def.deposits.some((d) => Math.hypot(x - d.x, y - d.y) < d.r + 2)) continue;
    if (def.index === 5 && (Math.hypot(x - HEART.x, y - HEART.y) < 7 || ENGINE_NODES.some((n) => Math.hypot(x - n.x, y - n.y) < 4))) continue;
    let open = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (c.get(x + dx, y + dy) === T_FLOOR) open++;
    if (open === 9) c.set(x, y, T_ROCK);
  }

  if (def.index === 2) placePools(L, def, c, rand, T_WATER, s);
  if (def.index === 4) placeMagma(L, def, c, rand, s);
  if (def.index === 5) placeConduits(L);
}

function nearReserved(def: LayerDef, x: number, y: number, margin: number): boolean {
  const a = def.arrival;
  if (a && x >= a.x - 3 - margin && x <= a.x + 7 + margin && y >= a.y - 3 - margin && y <= a.y + 3 + margin) return true;
  const b = def.boreSite;
  if (b && Math.abs(x - b.x) <= 3 + margin && Math.abs(y - b.y) <= 3 + margin) return true;
  if (def.deposits.some((d) => Math.hypot(x - d.x, y - d.y) <= d.r + 0.5 + margin)) return true;
  return false;
}

/** Fungal pools: water inside caverns, never touching rock. */
function placePools(L: LayerState, def: LayerDef, c: Carver, rand: () => number, t: number, s: number): void {
  const centers: { x: number; y: number }[] = [
    { x: 52, y: 43 },
    { x: 63, y: 35 },
  ];
  for (const d of def.deposits) {
    if (d.ore === 'sapstone' && d.hidden) centers.push({ x: d.x + (rand() < 0.5 ? -5 : 5), y: d.y + 2 });
  }
  for (let k = 0; k < 3; k++) centers.push({ x: 6 + Math.floor(rand() * (L.w - 12)), y: 6 + Math.floor(rand() * (L.h - 12)) });
  for (const p of centers) {
    const rx = 1.6 + rand() * 1.4;
    const ry = 1.3 + rand() * 1.0;
    for (let y = Math.floor(p.y - ry - 1); y <= Math.ceil(p.y + ry + 1); y++) {
      for (let x = Math.floor(p.x - rx - 1); x <= Math.ceil(p.x + rx + 1); x++) {
        if (!c.inside(x, y)) continue;
        const d = Math.hypot((x - p.x) / rx, (y - p.y) / ry) + (noise2(x * 0.5, y * 0.5, s + 5) - 0.5) * 0.5;
        if (d < 1 && c.get(x, y) === T_FLOOR && !nearReserved(def, x, y, 1)) c.set(x, y, t);
      }
    }
  }
  clearAgainstRock(L, c, t);
}

/** Magma pools next to emberite, with a hot band around them. */
function placeMagma(L: LayerState, def: LayerDef, c: Carver, rand: () => number, s: number): void {
  const centers: { x: number; y: number; rx: number; ry: number }[] = [];
  const vents = def.deposits.filter((d) => d.ore === 'emberite');
  for (const d of vents) centers.push({ x: d.x + 3.5, y: d.y, rx: 2.2, ry: 1.8 });
  centers.push({ x: 40, y: 8, rx: 2.2, ry: 1.5 });
  centers.push({ x: 22, y: 34, rx: 2.5, ry: 1.7 });
  for (const p of centers) {
    // Make sure the cavern exists around the pool.
    c.ellipse(p.x, p.y, p.rx + 3, p.ry + 2.5, 0.4);
    for (let y = Math.floor(p.y - p.ry - 1); y <= Math.ceil(p.y + p.ry + 1); y++) {
      for (let x = Math.floor(p.x - p.rx - 1); x <= Math.ceil(p.x + p.rx + 1); x++) {
        if (!c.inside(x, y)) continue;
        const d = Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry) + (noise2(x * 0.5, y * 0.5, s + 9) - 0.5) * 0.4;
        if (d < 1 && !nearReserved(def, x, y, 0)) c.set(x, y, T_MAGMA);
      }
    }
  }
  clearAgainstRock(L, c, T_MAGMA);
  // Every emberite vent is on hot ground, whatever the noise did.
  for (const d of vents) if (heatGrade(L, d.x, d.y) < 2) c.set(d.x + 2, d.y, T_MAGMA);
  // Heat on open floor: hot within 2 tiles of magma, warm at 3-4. Dug tiles get theirs when dug.
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      if (c.get(x, y) === T_FLOOR) L.hot[y * L.w + x] = heatGrade(L, x, y);
    }
  }
}

/** Heat grade of a tile from the magma around it: 2 hot (within 2 tiles), 1 warm (3-4 tiles), else 0. */
export function heatGrade(L: LayerState, x: number, y: number): number {
  let d = 99;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h || L.terrain[ny * L.w + nx] !== T_MAGMA) continue;
      d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
    }
  }
  return d <= 2 ? 2 : d <= 4 ? 1 : 0;
}

function clearAgainstRock(L: LayerState, c: Carver, t: number): void {
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        if (c.get(x, y) !== t) continue;
        let touches = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const n = c.get(x + dx, y + dy);
          if (n === T_ROCK || n === T_HARD) touches = true;
        }
        if (touches) c.set(x, y, T_FLOOR);
      }
    }
  }
}

function placeConduits(L: LayerState): void {
  for (const [x0, y0, x1, y1] of CONDUITS) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      if (x > 0 && y > 0 && x < L.w - 1 && y < L.h - 1) L.conduit[y * L.w + x] = 1;
    }
  }
}

function placeDeposits(L: LayerState, def: LayerDef, s: number): void {
  for (const d of def.deposits) {
    const idx = oreIndex(d.ore);
    if (d.vent) {
      // A vent is exactly one Miner's footprint: (x-1, y-1) to (x, y).
      for (let y = d.y - 1; y <= d.y; y++) {
        for (let x = d.x - 1; x <= d.x; x++) {
          const i = y * L.w + x;
          L.terrain[i] = T_FLOOR;
          L.ore[i] = idx;
          L.purity[i] = d.purity;
        }
      }
      continue;
    }
    for (let y = d.y - d.r - 1; y <= d.y + d.r + 1; y++) {
      for (let x = d.x - d.r - 1; x <= d.x + d.r + 1; x++) {
        if (x <= 0 || y <= 0 || x >= L.w - 1 || y >= L.h - 1) continue;
        const i = y * L.w + x;
        const dist = Math.hypot(x - d.x, y - d.y) + (hash2(x, y, s + 3) - 0.5) * 0.8;
        if (dist <= d.r + 0.6 && L.terrain[i] === T_FLOOR) {
          L.ore[i] = idx;
          L.purity[i] = d.purity;
        }
      }
    }
  }
}

function computeSporeBase(L: LayerState, def: LayerDef): void {
  const R = 9;
  for (const d of def.deposits) {
    if (d.ore !== 'glowcap') continue;
    for (let y = d.y - R; y <= d.y + R; y++) {
      for (let x = d.x - R; x <= d.x + R; x++) {
        if (x < 0 || y < 0 || x >= L.w || y >= L.h) continue;
        const dist = Math.hypot(x - d.x, y - d.y);
        const v = Math.max(0, Math.min(1, 1.15 - dist / R));
        const i = y * L.w + x;
        L.sporeBase[i] = Math.max(L.sporeBase[i], Math.round(v * 255));
      }
    }
  }
}

function placeDecor(L: LayerState, def: LayerDef, s: number): void {
  // Where decor stands is one hash per cell, the same whatever the weights.
  const cells: number[] = [];
  for (let y = 1; y < L.h - 1; y++) {
    for (let x = 1; x < L.w - 1; x++) {
      const i = y * L.w + x;
      if (L.terrain[i] !== T_FLOOR || L.ore[i]) continue;
      if (hash2(x, y, s + 11) < 0.06) cells.push(i);
    }
  }
  // Which prop: every name gets its weight's share of the layer's props (to within one), and a second
  // hash ranks the cells to decide which get which, so the shares hold on every map, however few props
  // it has (review-3 A1). Row by row, a 32 px prop with another within 2 tiles becomes one of the
  // layer's 16 px props, by the same rank: no rows of minecarts.
  const tall = def.decor.map((n) => TALL_DECOR.has(n));
  const all = def.decor.map((_, k) => k);
  const short = all.filter((k) => !tall[k]);
  const pick = cells.map((i) => hash2(i % L.w, Math.floor(i / L.w), s + 12));
  const byRank = cells.map((_, n) => n).sort((a, b) => pick[a] - pick[b] || a - b);
  const frac = new Float64Array(cells.length);
  byRank.forEach((n, r) => (frac[n] = (r + 0.5) / cells.length));
  cells.forEach((i, n) => {
    let k = weightedPick(def.decorWeights, all, frac[n]);
    if (tall[k] && short.length && tallNear(L, tall, i % L.w, Math.floor(i / L.w))) k = weightedPick(def.decorWeights, short, frac[n]);
    L.decor[i] = 1 + k;
  });
  // The Shallows bore site: rock sealed in amber, seeping up from below (AMBER_DECOR, 99: the first strange thing).
  const b = def.boreSite;
  if (def.index === 1 && b) {
    for (let y = b.y - 7; y <= b.y + 7; y++) {
      for (let x = b.x - 9; x <= b.x + 9; x++) {
        if (x < 1 || y < 1 || x >= L.w - 1 || y >= L.h - 1) continue;
        const i = y * L.w + x;
        const d = Math.hypot((x - b.x) / 1.25, y - b.y);
        if (L.terrain[i] !== T_FLOOR || L.ore[i] || d < 3.6 || d > 6.5) continue;
        L.decor[i] = hash2(x, y, s + 13) < 0.3 ? AMBER_DECOR : 0;
      }
    }
  }
}

/** One of `options` (indices into `weights`), chosen by h in [0, 1) in proportion to their weights. */
function weightedPick(weights: number[], options: number[], h: number): number {
  let total = 0;
  for (const k of options) total += weights[k] ?? 0;
  let r = h * total;
  for (const k of options) {
    r -= weights[k] ?? 0;
    if (r < 0) return k;
  }
  return options[options.length - 1];
}

/**
 * Is a 32 px prop already standing within 2 tiles of (x, y)? Decor is placed row by row, so only the
 * cells already decided are read: rows y-2 and y-1 from x-2 to x+2, and row y from x-2 to x-1. That
 * catches every pair, whichever of the two comes second.
 */
function tallNear(L: LayerState, tall: boolean[], x: number, y: number): boolean {
  for (let dy = -2; dy <= 0; dy++) {
    for (let dx = -2; dx <= (dy < 0 ? 2 : -1); dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const v = L.decor[ny * L.w + nx];
      if (v > 0 && tall[v - 1]) return true;
    }
  }
  return false;
}

/** Decor value of the amber-sealed rock at the Shallows bore site (drawn as AMBER_SPRITE). */
export const AMBER_DECOR = 99;

/** Reveal the cavern connected to the shaft (or everything on the Surface). */
function revealStart(L: LayerState, def: LayerDef): void {
  if (def.index === 0) {
    L.revealed.fill(1);
    return;
  }
  const a = def.arrival!;
  revealComponent(L, a.x, a.y);
}

/** Flood-fill reveal of the floor region containing (x, y), plus the walls around it. */
export function revealComponent(L: LayerState, x: number, y: number): number {
  const w = L.w;
  const start = y * w + x;
  if (L.terrain[start] === T_ROCK || L.terrain[start] === T_HARD) return 0;
  const seen = new Uint8Array(L.w * L.h);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    const cx = i % w;
    const cy = (i / w) | 0;
    if (!L.revealed[i]) count++;
    L.revealed[i] = 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= L.h) continue;
        const j = ny * w + nx;
        const t = L.terrain[j];
        if (t === T_ROCK || t === T_HARD) {
          if (!L.revealed[j]) count++;
          L.revealed[j] = 1;
        } else if (!seen[j] && (dx === 0 || dy === 0)) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  return count;
}
