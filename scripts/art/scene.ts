/**
 * Scene helpers shared by scripts/art/mock.ts and scripts/art/tileset.ts: a seeded RNG, cave-like
 * random cell maps, the game's dual-grid terrain drawing (as src/render/terrain.ts draws it), the
 * art plan's code-drawn belt (issue 5), sprites placed on footprints, and the darkness overlay:
 * four bands of #090a14 (0 / 0.35 / 0.65 / 0.85) with a 4x4 Bayer dither anchored to image pixels
 * (art plan issue 9). Images are pngjs RGBA at 1x; a cell is 16 px.
 */
import { blit, clonePng, createPng, crop, hexToRgb, trimAlpha, ALPHA_CUTOFF } from './lib.ts';
import type { PNG, Rgb } from './lib.ts';

export const TILE = 16;
export const DARK_TINT = '#090a14';
/** Darkness bands from lit to darkest: tint alpha. */
export const DARK_BANDS: readonly number[] = [0, 0.35, 0.65, 0.85];
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** mulberry32: a small seeded RNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Cell maps

export interface CellMap {
  cols: number;
  rows: number;
  /** One terrain symbol (a single character) per cell, row-major. */
  cells: string[];
}

/** The symbol at (x, y); cells past the edge repeat the edge (as the game does). */
export function cellAt(map: CellMap, x: number, y: number): string {
  const cx = Math.max(0, Math.min(map.cols - 1, x));
  const cy = Math.max(0, Math.min(map.rows - 1, y));
  return map.cells[cy * map.cols + cx];
}

/**
 * A cave-like map of two terrains: seeded noise (share `fill` upper) smoothed by two majority
 * votes, then a few single cells flipped so lone pillars and diagonal tiles show up too. Cells for
 * which `keepLower(x, y)` is true are always the lower terrain.
 */
export function randomMap(
  cols: number,
  rows: number,
  seed: number,
  fill: number,
  lower: string,
  upper: string,
  keepLower?: (x: number, y: number) => boolean,
): CellMap {
  const rand = mulberry32(seed);
  let up = new Uint8Array(cols * rows);
  for (let i = 0; i < up.length; i++) up[i] = rand() < fill ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(up.length);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.max(0, Math.min(cols - 1, x + dx));
            const ny = Math.max(0, Math.min(rows - 1, y + dy));
            n += up[ny * cols + nx];
          }
        }
        next[y * cols + x] = n >= 5 ? 1 : 0;
      }
    }
    up = next;
  }
  const flips = Math.max(1, Math.round((cols * rows) / 40));
  for (let k = 0; k < flips; k++) up[Math.floor(rand() * up.length)] ^= 1;
  const cells: string[] = [];
  for (let i = 0; i < up.length; i++) {
    const x = i % cols;
    const y = Math.floor(i / cols);
    cells.push(keepLower?.(x, y) ? lower : up[i] ? upper : lower);
  }
  return { cols, rows, cells };
}

/** The tile indices the dual grid draws for `map` when the `upper` symbols count as upper. */
export function tileIndices(map: CellMap, upper: string): Set<number> {
  const up = (x: number, y: number): number => (upper.includes(cellAt(map, x, y)) ? 1 : 0);
  const used = new Set<number>();
  for (let vy = 0; vy <= map.rows; vy++) {
    for (let vx = 0; vx <= map.cols; vx++) {
      used.add(up(vx - 1, vy - 1) * 8 + up(vx, vy - 1) * 4 + up(vx - 1, vy) * 2 + up(vx, vy));
    }
  }
  return used;
}

/**
 * randomMap() for the first seed from `seed` on whose map shows all 16 tiles (a full seam test),
 * trying up to `tries` seeds; falls back to the map of `seed` if none does.
 */
export function randomMapAllTiles(
  cols: number,
  rows: number,
  seed: number,
  fill: number,
  lower: string,
  upper: string,
  keepLower?: (x: number, y: number) => boolean,
  tries = 500,
): { map: CellMap; seed: number; complete: boolean } {
  for (let s = seed; s < seed + tries; s++) {
    const map = randomMap(cols, rows, s, fill, lower, upper, keepLower);
    if (tileIndices(map, upper).size === 16) return { map, seed: s, complete: true };
  }
  return { map: randomMap(cols, rows, seed, fill, lower, upper, keepLower), seed, complete: false };
}

/**
 * A map from text: one character per cell, one line per row. Blank lines and trailing whitespace
 * are ignored; every row must have the same length; whitespace is not a terrain symbol.
 */
export function parseMap(text: string, what: string): CellMap {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l !== '');
  if (lines.length === 0) throw new Error(`${what}: the map has no rows`);
  const cols = [...lines[0]].length;
  const cells: string[] = [];
  lines.forEach((line, k) => {
    const chars = [...line];
    if (chars.length !== cols) throw new Error(`${what}: row ${k + 1} has ${chars.length} cells, row 1 has ${cols}`);
    if (chars.some((c) => /\s/.test(c))) throw new Error(`${what}: row ${k + 1} has a space; every cell needs a symbol`);
    cells.push(...chars);
  });
  return { cols, rows: lines.length, cells };
}

// ---------------------------------------------------------------------------------------------
// Terrain: the dual grid

export interface TerrainLayer {
  /** For messages (usually the sheet's path). */
  name: string;
  /** 64 x 64 sheet in corner-index order: tile i at column i % 4, row floor(i / 4). */
  sheet: PNG;
  /** This set's lower terrain symbol. */
  lower: string;
  /** The symbols this set draws as its upper terrain. */
  upper: string;
}

/** Throws unless `sheet` is a 4 x 4 sheet of 16 px tiles. */
export function checkSheet(sheet: PNG, what: string): void {
  if (sheet.width !== TILE * 4 || sheet.height !== TILE * 4) {
    throw new Error(`${what} is ${sheet.width}x${sheet.height}; a terrain sheet is 64x64 (4 x 4 tiles of 16 px)`);
  }
}

export interface TerrainDrawing {
  png: PNG;
  /** Per layer: the tile indices it drew. */
  used: Set<number>[];
}

/**
 * Draw `map` with the game's dual grid (src/render/terrain.ts): the tile at vertex (vx, vy) reads
 * the four cells around it, nw = (vx-1, vy-1), ne = (vx, vy-1), sw = (vx-1, vy), se = (vx, vy), takes
 * index nw*8 + ne*4 + sw*2 + se (1 = upper) and is drawn at (vx*16 - 8, vy*16 - 8). The first layer
 * draws every vertex; later layers draw only vertices touching their upper terrain, on top (how the
 * game lays water and magma over floor and rock). Tile windows a layer has no art for (three
 * terrains, e.g. rock touching water) are listed in `problems`.
 */
export function drawTerrain(map: CellMap, layers: readonly TerrainLayer[], problems: string[]): TerrainDrawing {
  if (layers.length === 0) throw new Error('no terrain sheet given');
  for (const l of layers) checkSheet(l.sheet, l.name);
  const drawable = new Set<string>([layers[0].lower, ...layers.flatMap((l) => [...l.upper])]);
  const unknown = [...new Set(map.cells)].filter((c) => !drawable.has(c));
  if (unknown.length > 0) {
    throw new Error(
      `map symbols ${unknown.map((c) => `'${c}'`).join(', ')} are drawn by no sheet: the first sheet's lower ` +
        `terrain is '${layers[0].lower}' and the upper terrains are ${[...drawable].filter((c) => c !== layers[0].lower).map((c) => `'${c}'`).join(', ')}`,
    );
  }
  const png = createPng(map.cols * TILE, map.rows * TILE);
  const used: Set<number>[] = [];
  layers.forEach((layer, k) => {
    const tiles = Array.from({ length: 16 }, (_, i) => crop(layer.sheet, (i % 4) * TILE, Math.floor(i / 4) * TILE, TILE, TILE));
    const isUp = (c: string): boolean => layer.upper.includes(c);
    const known = new Set<string>([layer.lower, ...layer.upper]);
    const drew = new Set<number>();
    for (let vy = 0; vy <= map.rows; vy++) {
      for (let vx = 0; vx <= map.cols; vx++) {
        const c = [cellAt(map, vx - 1, vy - 1), cellAt(map, vx, vy - 1), cellAt(map, vx - 1, vy), cellAt(map, vx, vy)];
        const idx = (isUp(c[0]) ? 8 : 0) + (isUp(c[1]) ? 4 : 0) + (isUp(c[2]) ? 2 : 0) + (isUp(c[3]) ? 1 : 0);
        if (k > 0 && idx === 0) continue;
        if (k > 0 && c.some((s) => !known.has(s))) {
          problems.push(
            `vertex (${vx}, ${vy}) between cells (${vx - 1}..${vx}, ${vy - 1}..${vy}) holds ${[...new Set(c)].map((s) => `'${s}'`).join(' ')}, ` +
              `but ${layer.name} only has '${layer.lower}' and '${layer.upper}' (three terrains in one tile: no art)`,
          );
        }
        blit(png, tiles[idx], vx * TILE - TILE / 2, vy * TILE - TILE / 2);
        drew.add(idx);
      }
    }
    used.push(drew);
  });
  return { png, used };
}

// ---------------------------------------------------------------------------------------------
// Belts (art plan issue 5: #394a50 surface, #577277 rungs every 8 px, #151d28 1 px rails, 14 px lane)

const BELT_RAIL = hexToRgb('#151d28');
const BELT_BED = hexToRgb('#394a50');
const BELT_RUNG = hexToRgb('#577277');

function put(png: PNG, x: number, y: number, [r, g, b]: Rgb): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = 255;
}

/** A straight conveyor from cell (x0, y0) to cell (x1, y1): same row or same column. */
export function drawBelt(png: PNG, x0: number, y0: number, x1: number, y1: number): void {
  if (x0 !== x1 && y0 !== y1) throw new Error(`belt ${x0},${y0}:${x1},${y1} is not straight (same row or same column)`);
  const horizontal = y0 === y1;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  for (let k = 0; k <= n; k++) {
    const cx = x0 + sx * k;
    const cy = y0 + sy * k;
    for (let u = 0; u < TILE; u++) {
      for (let v = 1; v < TILE - 1; v++) {
        const color = v === 1 || v === TILE - 2 ? BELT_RAIL : u % 8 === 0 ? BELT_RUNG : BELT_BED;
        put(png, cx * TILE + (horizontal ? u : v), cy * TILE + (horizontal ? v : u), color);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Sprites on footprints

export interface Placement {
  img: PNG;
  /** Top-left cell of the footprint and its size in cells. */
  cx: number;
  cy: number;
  fw: number;
  fh: number;
}

/** The image cut down to its opaque pixels (alpha >= 128); throws if there are none. */
export function trimOpaque(png: PNG, what: string): PNG {
  const box = trimAlpha(png, ALPHA_CUTOFF);
  if (!box) throw new Error(`${what} has no opaque pixel (alpha >= 128)`);
  return crop(png, box.x, box.y, box.w, box.h);
}

/** Footprint in cells for art of w x h: its size rounded up to whole cells. */
export function footprintOf(w: number, h: number): [number, number] {
  return [Math.max(1, Math.ceil(w / TILE)), Math.max(1, Math.ceil(h / TILE))];
}

/**
 * Draw sprites like art:build places them on their canvas: a 1x1 footprint centered in its cell,
 * larger ones bottom-centered on the footprint (art taller than it rises above, 3/4 view). Drawn
 * north to south so southern sprites overlap northern ones.
 */
export function drawSprites(png: PNG, list: readonly Placement[]): void {
  const order = [...list].sort((a, b) => a.cy + a.fh - (b.cy + b.fh) || a.cx - b.cx);
  for (const p of order) {
    const W = p.fw * TILE;
    const H = p.fh * TILE;
    const dx = p.cx * TILE + Math.floor((W - p.img.width) / 2);
    const dy = p.fw === 1 && p.fh === 1 ? p.cy * TILE + Math.floor((H - p.img.height) / 2) : p.cy * TILE + H - p.img.height;
    blit(png, p.img, dx, dy);
  }
}

// ---------------------------------------------------------------------------------------------
// Darkness

function tint(png: PNG, alphaAt: (x: number, y: number) => number): PNG {
  const out = clonePng(png);
  const [tr, tg, tb] = hexToRgb(DARK_TINT);
  const d = out.data;
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const a = alphaAt(x, y);
      if (a <= 0) continue;
      const i = (y * out.width + x) * 4;
      d[i] = Math.round(d[i] * (1 - a) + tr * a);
      d[i + 1] = Math.round(d[i + 1] * (1 - a) + tg * a);
      d[i + 2] = Math.round(d[i + 2] * (1 - a) + tb * a);
    }
  }
  return out;
}

/** The image in four vertical strips under the four darkness bands, lit (left) to darkest (right). */
export function darkBands(png: PNG): PNG {
  return tint(png, (x) => DARK_BANDS[Math.min(DARK_BANDS.length - 1, Math.floor((x * DARK_BANDS.length) / png.width))]);
}

export interface Light {
  /** Cell of the lamp and its radius in cells. */
  x: number;
  y: number;
  r: number;
}

/**
 * Lamp-lit darkness: light per cell is the brightest of `ambient` and each lamp's linear falloff
 * (1 at the lamp, 0 at r cells), interpolated per pixel between cell centers as the game does,
 * then cut into the four bands with the 4x4 Bayer dither anchored to image (world) pixels.
 */
export function darkLights(png: PNG, cols: number, rows: number, lights: readonly Light[], ambient: number): PNG {
  const light = new Float32Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let l = ambient;
      for (const s of lights) l = Math.max(l, 1 - Math.hypot(cx - s.x, cy - s.y) / s.r);
      light[cy * cols + cx] = Math.min(1, Math.max(0, l));
    }
  }
  const at = (cx: number, cy: number): number =>
    light[Math.max(0, Math.min(rows - 1, cy)) * cols + Math.max(0, Math.min(cols - 1, cx))];
  return tint(png, (x, y) => {
    const fx = (x + 0.5) / TILE - 0.5;
    const fy = (y + 0.5) / TILE - 0.5;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const tx = fx - cx;
    const ty = fy - cy;
    const l = (at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx) * (1 - ty) + (at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx) * ty;
    const q = l + (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.22;
    return DARK_BANDS[q >= 0.72 ? 0 : q >= 0.45 ? 1 : q >= 0.2 ? 2 : 3];
  });
}
