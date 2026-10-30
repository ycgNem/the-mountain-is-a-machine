// Terrain drawn once per layer into a big cached canvas, patched when cells change.
//
// With PixelLab art the layer uses its dual-grid Wang sheets (STYLE Terrain): the floor/rock set,
// then water (L2), hot ground and magma (L4) and conduits (L5) laid over it; anything without a
// sheet is code-drawn. Where the art has floor variants of a set (STYLE "Floor variety"), one plain
// tile in four comes from a variant, so no single tile paves a whole floor. The awake conduit's lit
// glass is copied into a glass canvas of its own (conduitGlass), which the renderer draws again
// above the darkness.
//
// Without art every cell is code-drawn pixel by pixel (art review issue 1):
// floors in the layer's base colour with 1 px cracks, rock tops that fade toward the darkness tint
// away from open ground, a lit 1-2 px lip wherever rock meets open ground and a south face where
// open ground lies below. Hot ground glows (hot) or shows faint cracks (warm); deposits sit on a
// darker ore bed; hard rock carries a dither of a dark tone from the layer's own wall ramp (the
// darkness tint #090a14 is never a terrain fill, STYLE Layer moods). Only revealed cells count as
// open, so an edge never gives away a hidden cavern.

import { C, hexToRgb } from '../data/palette';
import { hash2, noise2 } from '../sim/rng';
import { T_FLOOR, T_HARD, T_MAGMA, T_ROCK, T_WATER, type LayerState } from '../sim/types';
import { terrainSheet, terrainVariants, terrainVariantShare } from './atlas';

export const TILE = 16;

/** Code-drawn terrain colours per layer (art review issues 1 and 8). Apollo only. */
export interface TerrainPal {
  /** Floor base (at least 1.4:1 against the #090a14 tint). */
  floor: string;
  /** 1 px cracks and contact shadows. */
  crack: string;
  /** Speckles, pebbles, moss. */
  fleck: string;
  /** Rare second speckle. */
  fleck2: string;
  /** Ore bed under deposits. */
  bed: string;
  /** Rock top next to open ground, one tile in, and deep inside. */
  top: string;
  top2: string;
  deep: string;
  /** South face and its strata. */
  face: string;
  face2: string;
  /** The lit lip where rock meets open ground, and its accent (L3 crystal veins). */
  lip: string;
  lip2: string;
  /**
   * Dither on hard rock (the uncuttable map edge): the darkest tone of the layer's own wall ramp
   * in STYLE's terrain table, never the darkness tint. It only replaces pixels lighter than
   * itself, so it darkens hard rock and never speckles the deep interior lighter.
   */
  shade: string;
}

export const TERRAIN_PAL: TerrainPal[] = [
  // 0 Surface: ochre gravel; umber cliffs with a sandstone-light lip. Hard rock (the mountain face)
  // is dithered with #ad7757 (2.62:1 on the sheet's #e7d5b3 sandstone tops): textured sandstone,
  // still darker than the rock a player can dig, where #341c27 (10.86:1) read as a screen-door mesh
  // (review 3 A5). Code-drawn rock is darker than #ad7757, so without the sheet only its lip takes
  // the dither.
  { floor: C.earth3, crack: C.earth2, fleck: C.sand, fleck2: C.cream, bed: C.earth2, top: C.earth1, top2: C.earth0, deep: C.earth0, face: C.earth0, face2: C.plum, lip: C.sand, lip2: C.cream, shade: C.earth2 },
  // 1 Shallows: umber earth with tan speckles; brown rock with a tan lip. Wall ramp #4d2b32 #341c27.
  { floor: C.earth1, crack: C.earth0, fleck: C.earth2, fleck2: C.earth3, bed: C.earth0, top: C.earth0, top2: C.plum, deep: C.wine0, face: C.plum, face2: C.wine0, lip: C.earth2, lip2: C.earth3, shade: C.plum },
  // 2 Fungal: violet stone with teal moss; dark violet rock with a plum lip. Wall ramp #241527 #1e1d39.
  { floor: C.violet, crack: C.indigo, fleck: C.green1, fleck2: C.pine, bed: C.indigo, top: C.wine0, top2: C.indigo, deep: C.night, face: C.indigo, face2: C.night, lip: C.purple, lip2: C.magenta, shade: C.wine0 },
  // 3 Crystal: blue slabs with navy cracks; navy rock with a mid-blue lip and cyan veins. Wall ramp #172038 #10141f.
  { floor: C.blue1, crack: C.navy, fleck: C.blue2, fleck2: C.blue3, bed: C.navy, top: C.navy, top2: C.night, deep: C.night, face: C.night, face2: C.navy, lip: C.blue3, lip2: C.cyan, shade: C.night },
  // 4 Magma: neutral basalt; black hexagonal columns with a slate lip. Wall ramp #10141f (its
  // #090a14 is the darkness tint, so not that).
  { floor: C.panel2, crack: C.panel, fleck: C.slate, fleck2: C.steel, bed: C.panel, top: C.panel, top2: C.night, deep: C.night, face: C.night, face2: C.panel, lip: C.steel, lip2: C.steel2, shade: C.night },
  // 5 Alien: grey-green slabs with dark green joints; carved stone with a pale grey lip. Wall ramp #202e37 #151d28.
  // The #202e37 bed suits the code floor; on the sheet's #577277 slabs it is BED_ON_SHEET.
  { floor: C.slate, crack: C.pine, fleck: C.steel, fleck2: C.green1, bed: C.panel2, top: C.panel2, top2: C.panel, deep: C.night, face: C.panel, face2: C.night, lip: C.steel2, lip2: C.steel3, shade: C.panel },
];

/**
 * Ore beds where a layer's floor comes from its sheet and the code bed would read as a pit: the Alien
 * Strata's #202e37 sat at 2.71:1 under every deposit on the #577277 slabs (the other layers' beds sit
 * at 1.22-1.66), so there it is #394a50 (1.80:1). Not on the code floor, which is #394a50 itself
 * (review 3 A7).
 */
const BED_ON_SHEET: Partial<Record<number, string>> = { 5: C.slate };

// ------------------------------------------------------------------ sheets

/** A terrain set's sheet and its variants (STYLE "Floor variety": copies with only tiles 0 and 15 edited). */
interface Sheet {
  img: HTMLImageElement;
  vars: readonly HTMLImageElement[];
  /** Share of plain tiles drawn from `vars` (atlas.json "variantShare", else VARIANT_SHARE). */
  share: number;
}

interface Sheets {
  rock: Sheet | null;
  water: Sheet | null;
  /** Floor to hot ground (L4). */
  hot: Sheet | null;
  /** Hot ground to magma (L4), or the older floor-to-magma set. */
  magma: Sheet | null;
  /** Floor to conduit (L5): awake glass, and a dark recolour for dormant conduits. */
  conduit: Sheet | null;
}

function sheet(name: string): Sheet | null {
  const img = terrainSheet(name);
  return img ? { img, vars: terrainVariants(name), share: terrainVariantShare(name) ?? VARIANT_SHARE } : null;
}

function sheetsFor(layer: number): Sheets {
  const s: Sheets = { rock: null, water: null, hot: null, magma: null, conduit: null };
  switch (layer) {
    case 0:
      s.rock = sheet('t_l0_ground_rock');
      break;
    case 1:
      s.rock = sheet('t_l1_floor_rock');
      break;
    case 2:
      s.rock = sheet('t_l2_floor_rock');
      s.water = sheet('t_l2_floor_water');
      break;
    case 3:
      s.rock = sheet('t_l3_floor_rock');
      break;
    case 4:
      s.rock = sheet('t_l4_floor_rock');
      s.hot = sheet('t_l4_floor_hot');
      s.magma = sheet('t_l4_hot_magma');
      break;
    default:
      s.rock = sheet('t_l5_floor_rock');
      s.conduit = sheet('t_l5_floor_conduit');
  }
  return s;
}

/** Default share of plain tiles drawn from a variant: enough that no one tile paves a floor, few enough that the marks stay rare. */
const VARIANT_SHARE = 0.25;

/**
 * The sheet the tile with index `idx` at vertex (vx, vy) comes from. A plain tile (0, all lower, or
 * 15, all upper) is taken from a variant at the set's share of vertices (atlas.json "variantShare",
 * one in four by default), the vertex and the variant both picked by a hash of the vertex:
 * deterministic and cheap, so a patched region redraws exactly what was there. Edge tiles always come
 * from the base sheet, which is what they seam with.
 */
function sheetAt(s: Sheet, idx: number, vx: number, vy: number): HTMLImageElement {
  if (s.vars.length === 0 || s.share <= 0 || (idx !== 0 && idx !== 15)) return s.img;
  const h = hash2(vx, vy, 907);
  return h < s.share ? s.vars[Math.min(s.vars.length - 1, Math.floor((h / s.share) * s.vars.length))] : s.img;
}

/** True when conduits on this layer come from the t_l5_floor_conduit sheet (the renderer only adds the pulse). */
export function conduitArt(layer: number): boolean {
  const s = sheetsFor(layer);
  return !!(s.rock && s.conduit);
}

const dormantSheets = new Map<HTMLImageElement, HTMLCanvasElement>();

/** Lit glass to dark, unlit glass (and the glow greens to moss): the dormant conduit's recolour. */
const DORMANT_MAP: [string, string][] = [
  [C.white, C.blue2],
  [C.ice, C.blue1],
  [C.cyan, C.navy],
  [C.blue3, C.navy],
  [C.lime, C.green1],
  [C.sage, C.green1],
];

/** A canvas holding `w` x `h` of `img` from (sx, sy), recoloured by DORMANT_MAP. */
function dormantCanvas(img: CanvasImageSource, sx: number, sy: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const swap = new Map<number, [number, number, number]>();
  const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
  for (const [from, to] of DORMANT_MAP) {
    const [r, g, b] = hexToRgb(from);
    swap.set(key(r, g, b), hexToRgb(to));
  }
  const d = data.data;
  for (let p = 0; p < d.length; p += 4) {
    const t = swap.get(key(d[p], d[p + 1], d[p + 2]));
    if (t) {
      d[p] = t[0];
      d[p + 1] = t[1];
      d[p + 2] = t[2];
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

/** The conduit sheet with its lit glass recoloured to dark, unlit glass. */
function dormantSheet(img: HTMLImageElement): HTMLCanvasElement {
  let c = dormantSheets.get(img);
  if (!c) {
    c = dormantCanvas(img, 0, 0, img.width, img.height);
    dormantSheets.set(img, c);
  }
  return c;
}

const dormantCopies = new WeakMap<object, Map<string, HTMLCanvasElement>>();

/**
 * A sprite rectangle of `img` with its glass recoloured dark like dormant conduit (DORMANT_MAP):
 * an Engine Node until it wakes (review 3 A10). Cached per image and rectangle.
 */
export function dormantCopy(img: CanvasImageSource, sx: number, sy: number, w: number, h: number): HTMLCanvasElement {
  let m = dormantCopies.get(img);
  if (!m) {
    m = new Map();
    dormantCopies.set(img, m);
  }
  const k = `${sx},${sy},${w},${h}`;
  let c = m.get(k);
  if (!c) {
    c = dormantCanvas(img, sx, sy, w, h);
    m.set(k, c);
  }
  return c;
}

// ------------------------------------------------------------------ pixel painting

const packed = new Map<string, number>();

/** A colour as one little-endian RGBA word for a Uint32Array view of ImageData. */
function pk(hex: string): number {
  let v = packed.get(hex);
  if (v === undefined) {
    const [r, g, b] = hexToRgb(hex);
    v = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    packed.set(hex, v);
  }
  return v;
}

interface Buf {
  d: Uint32Array;
  w: number;
  h: number;
  /** World pixel of the buffer's top-left. */
  ox: number;
  oy: number;
}

function isRock(t: number): boolean {
  return t === T_ROCK || t === T_HARD;
}

/** Packed palette for one layer. */
interface PP {
  floor: number;
  crack: number;
  fleck: number;
  fleck2: number;
  bed: number;
  top: number;
  top2: number;
  deep: number;
  face: number;
  face2: number;
  lip: number;
  lip2: number;
  shade: number;
  shadeLuma: number;
}

/** Rough luma (x256) of a packed colour, enough to order the palette's darks. */
function luma(c: number): number {
  return 54 * (c & 255) + 183 * ((c >>> 8) & 255) + 19 * ((c >>> 16) & 255);
}

/** Hard rock: a 1-in-4 dither of the layer's dark wall tone, only where it darkens the pixel. */
function hardShade(p: PP, wx: number, wy: number, col: number): number {
  return ((wx & 1) | (wy & 1)) === 0 && luma(col) > p.shadeLuma ? p.shade : col;
}

function packPal(p: TerrainPal): PP {
  return {
    floor: pk(p.floor),
    crack: pk(p.crack),
    fleck: pk(p.fleck),
    fleck2: pk(p.fleck2),
    bed: pk(p.bed),
    top: pk(p.top),
    top2: pk(p.top2),
    deep: pk(p.deep),
    face: pk(p.face),
    face2: pk(p.face2),
    lip: pk(p.lip),
    lip2: pk(p.lip2),
    shade: pk(p.shade),
    shadeLuma: luma(pk(p.shade)),
  };
}

const FACE_H = 6;

/** What a cell painter needs to know about a layer. */
class Ground {
  readonly L: LayerState;
  readonly li: number;
  readonly p: PP;
  /** Rock depth memo: 0 open, 1..3 = Chebyshev distance to the nearest open cell (capped). */
  private depthMemo = new Map<number, number>();

  /** `sheet`: the floor comes from the layer's terrain sheet (its ore bed may differ, BED_ON_SHEET). */
  constructor(L: LayerState, sheet: boolean) {
    this.L = L;
    this.li = Math.max(0, Math.min(TERRAIN_PAL.length - 1, L.index));
    this.p = packPal(TERRAIN_PAL[this.li]);
    const bed = sheet ? BED_ON_SHEET[this.li] : undefined;
    if (bed) this.p.bed = pk(bed);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.L.w && y < this.L.h;
  }

  ter(x: number, y: number): number {
    return this.inside(x, y) ? this.L.terrain[y * this.L.w + x] : T_HARD;
  }

  /** Revealed open ground (floor, water, magma). Unrevealed cells count as solid. */
  open(x: number, y: number): boolean {
    if (!this.inside(x, y)) return false;
    const i = y * this.L.w + x;
    return this.L.revealed[i] === 1 && !isRock(this.L.terrain[i]);
  }

  depth(x: number, y: number): number {
    if (this.open(x, y)) return 0;
    const key = y * 4096 + x;
    const m = this.depthMemo.get(key);
    if (m !== undefined) return m;
    let d = 3;
    for (let r = 1; r <= 2 && d === 3; r++) {
      for (let dy = -r; dy <= r && d === 3; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.open(x + dx, y + dy)) {
            d = r;
            break;
          }
        }
      }
    }
    this.depthMemo.set(key, d);
    return d;
  }

  isOre(x: number, y: number): boolean {
    return this.inside(x, y) && this.L.ore[y * this.L.w + x] > 0 && this.L.terrain[y * this.L.w + x] === T_FLOOR;
  }
}

function put(b: Buf, wx: number, wy: number, col: number): void {
  const x = wx - b.ox;
  const y = wy - b.oy;
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  b.d[y * b.w + x] = col;
}

/** A short 1 px crack: a wandering walk inside the cell. `paint(wx, wy, k)` colours step k. */
function crack(px: number, py: number, seed: number, len: number, paint: (wx: number, wy: number, k: number) => void): void {
  let cx = 1 + Math.floor(hash2(seed, 1, 7) * 14);
  let cy = 1 + Math.floor(hash2(seed, 2, 7) * 14);
  const dx = hash2(seed, 3, 7) < 0.5 ? 1 : -1;
  const dy = hash2(seed, 4, 7) < 0.5 ? 1 : -1;
  const steep = hash2(seed, 5, 7) < 0.35;
  for (let k = 0; k < len; k++) {
    paint(px + cx, py + cy, k);
    const r = hash2(seed, 10 + k, 7);
    if (steep) {
      if (r < 0.6) cy += dy;
      else if (r < 0.85) {
        cy += dy;
        cx += dx;
      } else cx += dx;
    } else if (r < 0.6) cx += dx;
    else if (r < 0.85) {
      cx += dx;
      cy += dy;
    } else cy += dy;
    if (cx < 0 || cy < 0 || cx > 15 || cy > 15) break;
  }
}

function paintFloor(b: Buf, G: Ground, x: number, y: number, opts: { hotCode: boolean; warmCode: boolean; base: boolean }): void {
  const L = G.L;
  const p = G.p;
  const li = G.li;
  const i = y * L.w + x;
  const px = x * TILE;
  const py = y * TILE;
  const seed = 101 + li * 13;
  if (opts.base) {
    for (let j = 0; j < TILE; j++) {
      for (let k = 0; k < TILE; k++) {
        const wx = px + k;
        const wy = py + j;
        let col = p.floor;
        const h = hash2(wx, wy, seed);
        if (li === 5 && ((wx & 7) === 7 || (wy & 7) === 7)) {
          // Fitted slabs with dark green joints, the odd joint grown green.
          col = h < 0.12 ? p.fleck2 : p.crack;
        } else if (li === 2) {
          // Teal moss patches on the violet stone, with a dithered shaded rim.
          const n = noise2(wx * 0.15, wy * 0.15, 51) * 0.75 + noise2(wx * 0.5, wy * 0.5, 52) * 0.25;
          if (n > 0.76) col = p.fleck;
          else if (n > 0.72) col = (wx + wy) & 1 ? p.fleck2 : p.floor;
          else if (h < 0.012) col = p.fleck;
        } else if (h < (li === 0 ? 0.05 : li === 3 ? 0.012 : 0.03)) col = p.fleck;
        else if (h > 0.994) col = p.fleck2;
        put(b, wx, wy, col);
      }
    }
    if (li === 0) {
      // Gravel: a few pebbles, lit on top with a tan shadow below.
      const n = Math.floor(hash2(x, y, seed + 3) * 3);
      for (let k = 0; k < n; k++) {
        const cx = px + 1 + Math.floor(hash2(x + k, y, seed + 4) * 13);
        const cy = py + 1 + Math.floor(hash2(x, y + k, seed + 5) * 13);
        put(b, cx, cy, p.fleck);
        put(b, cx + 1, cy, p.fleck2);
        put(b, cx, cy + 1, p.crack);
        put(b, cx + 1, cy + 1, p.crack);
      }
    }
    // 1 px cracks in the second floor colour (never speckle fields of it).
    const n = li === 5 ? (hash2(x, y, seed + 6) < 0.25 ? 1 : 0) : Math.floor(hash2(x, y, seed + 7) * 2.4);
    for (let k = 0; k < n; k++) {
      const len = li === 3 ? 6 + Math.floor(hash2(x, y, seed + 8 + k) * 5) : 3 + Math.floor(hash2(x, y, seed + 8 + k) * 4);
      crack(px, py, (x * 73856093) ^ (y * 19349663) ^ (k * 83492791) ^ (li * 977), len, (wx, wy) => put(b, wx, wy, p.crack));
    }
    // Contact shadow under rock to the north and beside rock to the west.
    if (isRock(G.ter(x, y - 1)) && G.inside(x, y - 1) && L.revealed[(y - 1) * L.w + x]) {
      for (let k = 0; k < TILE; k++) put(b, px + k, py, p.crack);
    }
    if (isRock(G.ter(x - 1, y)) && G.inside(x - 1, y) && L.revealed[y * L.w + x - 1]) {
      for (let j = 0; j < TILE; j += 2) put(b, px, py + j, p.crack);
    }
  }
  // Ore bed: a darker patch under the deposit, dithered at its outer edge.
  if (L.ore[i]) {
    const oN = G.isOre(x, y - 1);
    const oS = G.isOre(x, y + 1);
    const oW = G.isOre(x - 1, y);
    const oE = G.isOre(x + 1, y);
    for (let j = 0; j < TILE; j++) {
      for (let k = 0; k < TILE; k++) {
        const e = Math.min(oN ? 99 : j, oS ? 99 : 15 - j, oW ? 99 : k, oE ? 99 : 15 - k);
        const wx = px + k;
        const wy = py + j;
        if (e >= 2 || ((wx + wy) & 1) === 0) put(b, wx, wy, p.bed);
      }
    }
  }
  // Hot ground glows; warm ground shows faint dull cracks.
  const heat = L.hot[i];
  if (heat >= 2 && opts.hotCode) {
    const n = 2 + Math.floor(hash2(x, y, 61) * 2);
    for (let k = 0; k < n; k++) {
      const len = 5 + Math.floor(hash2(x + k, y, 62) * 6);
      crack(px, py, (x * 91138233) ^ (y * 2654435761) ^ (k * 40503), len, (wx, wy, s) => {
        put(b, wx, wy, s === 0 || s === len - 1 ? pk(C.red) : s % 3 === 1 ? pk(C.orange) : pk(C.coral));
        if (hash2(wx, wy, 63) < 0.45) put(b, wx + (hash2(wx, wy, 64) < 0.5 ? 1 : 0), wy + 1, pk(C.crimson));
      });
    }
  } else if (heat === 1 && opts.warmCode) {
    const len = 3 + Math.floor(hash2(x, y, 65) * 4);
    crack(px, py, (x * 2246822519) ^ (y * 3266489917), len, (wx, wy, s) => put(b, wx, wy, s === 1 ? pk(C.red) : pk(C.crimson)));
  }
}

function paintRock(b: Buf, G: Ground, x: number, y: number): void {
  const L = G.L;
  const p = G.p;
  const li = G.li;
  const px = x * TILE;
  const py = y * TILE;
  const hard = G.ter(x, y) === T_HARD;
  // Depth at the four corners, interpolated per pixel and dithered into top / top2 / deep.
  const cd = (cx: number, cy: number) => (G.depth(cx - 1, cy - 1) + G.depth(cx, cy - 1) + G.depth(cx - 1, cy) + G.depth(cx, cy)) / 4;
  const c00 = cd(x, y);
  const c10 = cd(x + 1, y);
  const c01 = cd(x, y + 1);
  const c11 = cd(x + 1, y + 1);
  const ramp = [p.top, p.top2, p.deep];
  const seed = 211 + li * 17;
  for (let j = 0; j < TILE; j++) {
    const fy = (j + 0.5) / TILE;
    for (let k = 0; k < TILE; k++) {
      const fx = (k + 0.5) / TILE;
      const wx = px + k;
      const wy = py + j;
      const l = (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy;
      const t = Math.max(0, Math.min(2, l - 1));
      // A stippled (hashed) threshold reads as rock grain; an ordered one would look like a screen.
      let band = Math.min(2, Math.floor(t + hash2(wx, wy, seed + 3)));
      const h = hash2(wx, wy, seed);
      if (h < 0.07) band = Math.min(2, band + 1);
      let col = ramp[band];
      if (li === 4 && band < 2) {
        // Basalt column tops: a staggered hexagon-ish lattice.
        const colI = Math.floor(wx / 6);
        const ry = wy + (colI & 1) * 3;
        if (wx % 6 === 0 || ry % 6 === 0) col = p.top2;
        else if (wx % 6 === 1 && ry % 6 === 1 && band === 0) col = p.fleck;
      } else if (li === 5 && band < 2) {
        // Carved machine stone: block seams and the odd rivet.
        if ((wx & 7) === 0 || (wy & 7) === 0) col = p.top2;
        else if ((wx & 7) === 2 && (wy & 7) === 2 && band === 0 && hash2(wx >> 3, wy >> 3, 9) < 0.5) col = p.fleck;
      }
      if (hard) col = hardShade(p, wx, wy, col);
      put(b, wx, wy, col);
    }
  }
  // Crystal veins in the rock near open ground (L3).
  if (li === 3 && hash2(x, y, 71) < 0.45 && G.depth(x, y) <= 1) {
    const sx = px + 3 + Math.floor(hash2(x, y, 72) * 9);
    const sy = py + 3 + Math.floor(hash2(x, y, 73) * 6);
    for (let k = 0; k < 4; k++) put(b, sx + k, sy - (k >> 1), k === 1 ? p.lip2 : p.lip);
  }
  const oN = G.open(x, y - 1);
  const oS = G.open(x, y + 1);
  const oW = G.open(x - 1, y);
  const oE = G.open(x + 1, y);
  const lipAt = (wx: number, wy: number) => put(b, wx, wy, li === 3 && hash2(wx, wy, 74) < 0.14 ? p.lip2 : p.lip);
  const lipBottom = oS ? TILE - FACE_H - 1 : TILE - 1;
  if (oS) {
    // South face with vertical strata, a dark foot and a 2 px lit ridge above it.
    for (let j = TILE - FACE_H; j < TILE; j++) {
      for (let k = 0; k < TILE; k++) {
        const wx = px + k;
        const strata = hash2(wx, 5, seed + 1) < 0.28;
        put(b, wx, py + j, j === TILE - 1 || strata ? p.face2 : p.face);
      }
    }
    for (let k = 0; k < TILE; k++) {
      lipAt(px + k, py + TILE - FACE_H - 1);
      lipAt(px + k, py + TILE - FACE_H - 2);
    }
  }
  if (oN) for (let k = 0; k < TILE; k++) lipAt(px + k, py);
  if (oW) for (let j = 0; j <= lipBottom; j++) lipAt(px, py + j);
  if (oE) for (let j = 0; j <= lipBottom; j += 2) lipAt(px + TILE - 1, py + j);
  // Outer corners touched only diagonally.
  if (!oN && !oW && G.open(x - 1, y - 1)) lipAt(px, py);
  if (!oN && !oE && G.open(x + 1, y - 1)) lipAt(px + TILE - 1, py);
  if (!oS && !oW && G.open(x - 1, y + 1)) lipAt(px, py + TILE - 1);
  if (!oS && !oE && G.open(x + 1, y + 1)) lipAt(px + TILE - 1, py + TILE - 1);
}

/**
 * How deep in a liquid of terrain `t` the pixel (wx, wy) lies: the liquid mask interpolated
 * between cell centres (1 inside, 0.5 on a straight edge, about 0.25 at an outer corner). Shores
 * are cut where it drops under a wobbling threshold, so pools come out round, never as squares.
 */
function liquidCover(G: Ground, t: number, wx: number, wy: number): number {
  const X = (wx + 0.5) / TILE - 0.5;
  const Y = (wy + 0.5) / TILE - 0.5;
  const cx = Math.floor(X);
  const cy = Math.floor(Y);
  const tx = X - cx;
  const ty = Y - cy;
  const q = (x: number, y: number) => (G.ter(x, y) === t ? 1 : 0);
  return (q(cx, cy) * (1 - tx) + q(cx + 1, cy) * tx) * (1 - ty) + (q(cx, cy + 1) * (1 - tx) + q(cx + 1, cy + 1) * tx) * ty;
}

function shoreThreshold(wx: number, wy: number, seed: number): number {
  return 0.5 + noise2(wx * 0.3, wy * 0.3, seed) * 0.24;
}

function paintWater(b: Buf, G: Ground, x: number, y: number): void {
  const p = G.p;
  const px = x * TILE;
  const py = y * TILE;
  for (let j = 0; j < TILE; j++) {
    for (let k = 0; k < TILE; k++) {
      const wx = px + k;
      const wy = py + j;
      const cover = liquidCover(G, T_WATER, wx, wy);
      const thr = shoreThreshold(wx, wy, 85);
      let col: number;
      if (cover < thr - 0.1) col = hash2(wx, wy, 101 + G.li * 13) < 0.03 ? p.fleck : p.floor;
      else if (cover < thr) col = p.crack; // the wet bank
      else {
        const n = noise2(wx * 0.12, wy * 0.45, 81);
        col = pk(C.navy);
        if (n > 0.8) col = pk(C.blue2);
        else if (n > 0.6) col = pk(C.blue1);
        if (hash2(wx, wy, 82) < 0.004) col = pk(C.ice);
      }
      put(b, wx, wy, col);
    }
  }
}

function paintMagma(b: Buf, G: Ground, x: number, y: number): void {
  const p = G.p;
  const px = x * TILE;
  const py = y * TILE;
  for (let j = 0; j < TILE; j++) {
    for (let k = 0; k < TILE; k++) {
      const wx = px + k;
      const wy = py + j;
      const cover = liquidCover(G, T_MAGMA, wx, wy);
      const thr = shoreThreshold(wx, wy, 86);
      let col: number;
      if (cover < thr - 0.12) col = p.floor;
      else if (cover < thr - 0.04) col = pk(C.wine1); // cooled crust
      else if (cover < thr) col = pk(C.crimson);
      else {
        const v = noise2(wx * 0.16, wy * 0.16, 77) * 0.7 + noise2(wx * 0.07, wy * 0.3, 78) * 0.3;
        let c: string = C.red;
        if (v < 0.3) c = C.crimson;
        else if (v < 0.5) c = C.red;
        else if (v < 0.66) c = C.coral;
        else if (v < 0.8) c = C.orange;
        else if (v < 0.9) c = C.pale;
        else c = C.white;
        col = pk(c);
      }
      put(b, wx, wy, col);
    }
  }
}

function fillCell(b: Buf, x: number, y: number, col: number): void {
  for (let j = 0; j < TILE; j++) for (let k = 0; k < TILE; k++) put(b, x * TILE + k, y * TILE + j, col);
}

// ------------------------------------------------------------------ the cache

interface Cache {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /**
   * With the conduit sheet: the lit glass pixels of awake conduit (the sheet's #a4dddb, #73bed3 and
   * #ebede9 inside awake cells), transparent elsewhere, patched with the terrain. The emissive pass
   * draws it above the darkness, so the glass reads lit (review 3 A9).
   */
  glass: HTMLCanvasElement | null;
  gctx: CanvasRenderingContext2D | null;
  /** Snapshots so changed cells can be found. */
  terrain: Uint8Array;
  revealed: Uint8Array;
  hot: Uint8Array;
  live: Uint8Array;
  artKey: string;
}

const caches = new Map<number, Cache>();

/**
 * Dual-grid drawing: the sheet tile at vertex (vx, vy) covers the four cells around it. Plain tiles
 * may come from a variant (sheetAt); `look` may swap the chosen sheet for a recolour of it (dormant
 * conduit glass) from the vertex's cells.
 */
function wangPass(
  ctx: CanvasRenderingContext2D,
  L: LayerState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  s: Sheet,
  upper: (i: number) => boolean,
  opts: {
    onlyIfAny: boolean;
    skip?: (i: number) => boolean;
    look?: (cells: number[], img: HTMLImageElement) => CanvasImageSource;
  },
): void {
  const cell = (x: number, y: number): number => Math.max(0, Math.min(L.h - 1, y)) * L.w + Math.max(0, Math.min(L.w - 1, x));
  for (let vy = y0; vy <= y1 + 1; vy++) {
    for (let vx = x0; vx <= x1 + 1; vx++) {
      const cells = [cell(vx - 1, vy - 1), cell(vx, vy - 1), cell(vx - 1, vy), cell(vx, vy)];
      if (opts.skip && cells.some(opts.skip)) continue;
      const idx = (upper(cells[0]) ? 8 : 0) + (upper(cells[1]) ? 4 : 0) + (upper(cells[2]) ? 2 : 0) + (upper(cells[3]) ? 1 : 0);
      if (opts.onlyIfAny && idx === 0) continue;
      const pick = sheetAt(s, idx, vx, vy);
      const img = opts.look ? opts.look(cells, pick) : pick;
      ctx.drawImage(img, (idx % 4) * TILE, Math.floor(idx / 4) * TILE, TILE, TILE, vx * TILE - TILE / 2, vy * TILE - TILE / 2, TILE, TILE);
    }
  }
}

function redraw(c: Cache, L: LayerState, x0: number, y0: number, x1: number, y1: number): void {
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(L.w - 1, x1);
  y1 = Math.min(L.h - 1, y1);
  if (x1 < x0 || y1 < y0) return;
  const ctx = c.ctx;
  const S = sheetsFor(L.index);
  const G = new Ground(L, !!S.rock);
  const bx = x0 * TILE;
  const by = y0 * TILE;
  const bw = (x1 - x0 + 1) * TILE;
  const bh = (y1 - y0 + 1) * TILE;
  const ink = pk(C.ink);

  if (!S.rock) {
    // All code: paint every cell into a buffer.
    const img = ctx.createImageData(bw, bh);
    const b: Buf = { d: new Uint32Array(img.data.buffer), w: bw, h: bh, ox: bx, oy: by };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * L.w + x;
        if (!L.revealed[i]) {
          fillCell(b, x, y, ink);
          continue;
        }
        const t = L.terrain[i];
        if (t === T_FLOOR) paintFloor(b, G, x, y, { base: true, hotCode: true, warmCode: true });
        else if (t === T_WATER) paintWater(b, G, x, y);
        else if (t === T_MAGMA) paintMagma(b, G, x, y);
        else paintRock(b, G, x, y);
      }
    }
    ctx.putImageData(img, bx, by);
    return;
  }

  // Sheets, clipped to the region.
  const rev = (i: number) => L.revealed[i] === 1;
  const solid = (i: number) => !rev(i) || isRock(L.terrain[i]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.clip();
  wangPass(ctx, L, x0, y0, x1, y1, S.rock, solid, { onlyIfAny: false });
  if (S.water) wangPass(ctx, L, x0, y0, x1, y1, S.water, (i) => rev(i) && L.terrain[i] === T_WATER, { onlyIfAny: true, skip: solid });
  if (S.hot) wangPass(ctx, L, x0, y0, x1, y1, S.hot, (i) => rev(i) && (L.hot[i] >= 2 || L.terrain[i] === T_MAGMA), { onlyIfAny: true, skip: solid });
  if (S.magma) wangPass(ctx, L, x0, y0, x1, y1, S.magma, (i) => rev(i) && L.terrain[i] === T_MAGMA, { onlyIfAny: true, skip: solid });
  if (S.conduit) {
    wangPass(ctx, L, x0, y0, x1, y1, S.conduit, (i) => rev(i) && L.terrain[i] === T_FLOOR && L.conduit[i] === 1, {
      onlyIfAny: true,
      skip: solid,
      look: (cells, img) => (cells.some((i) => L.conduit[i] === 1 && L.conduitLive[i] === 1) ? img : dormantSheet(img)),
    });
  }
  ctx.restore();

  // Code passes over the sheets: whatever has no sheet, ore beds, warm ground, hard rock, the dark.
  const img = ctx.getImageData(bx, by, bw, bh);
  const b: Buf = { d: new Uint32Array(img.data.buffer), w: bw, h: bh, ox: bx, oy: by };
  if (S.conduit && c.gctx) copyGlass(c.gctx, L, b);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * L.w + x;
      if (!L.revealed[i]) {
        fillCell(b, x, y, ink);
        continue;
      }
      const t = L.terrain[i];
      if (t === T_WATER && !S.water) paintWater(b, G, x, y);
      else if (t === T_MAGMA && !S.magma) paintMagma(b, G, x, y);
      else if (t === T_FLOOR) paintFloor(b, G, x, y, { base: false, hotCode: !S.hot, warmCode: true });
      else if (t === T_HARD) {
        for (let j = 0; j < TILE; j += 2) {
          for (let k = 0; k < TILE; k += 2) {
            const p = (y * TILE + j - by) * bw + x * TILE + k - bx;
            b.d[p] = hardShade(G.p, x * TILE + k, y * TILE + j, b.d[p]);
          }
        }
      }
    }
  }
  ctx.putImageData(img, bx, by);
}

/** The conduit sheet's lit glass colours. */
const GLASS = [C.ice, C.cyan, C.white];

/**
 * Copy the lit glass of awake conduit in the region `b` (the sheets just drawn, before the code
 * passes) into the glass canvas, replacing what was there: glass colours inside revealed, awake
 * conduit cells, transparent everywhere else (so dormant glass, and cells gone dormant or hidden,
 * add nothing).
 */
function copyGlass(gctx: CanvasRenderingContext2D, L: LayerState, b: Buf): void {
  const out = gctx.createImageData(b.w, b.h);
  const o = new Uint32Array(out.data.buffer);
  const glass = GLASS.map(pk);
  for (let j = 0; j < b.h; j++) {
    const y = (b.oy + j) >> 4;
    for (let k = 0; k < b.w; k++) {
      const x = (b.ox + k) >> 4;
      const i = y * L.w + x;
      if (!L.conduit[i] || L.conduitLive[i] !== 1 || !L.revealed[i] || L.terrain[i] !== T_FLOOR) continue;
      const col = b.d[j * b.w + k];
      if (glass.includes(col)) o[j * b.w + k] = col;
    }
  }
  gctx.putImageData(out, b.ox, b.oy);
}

/** The lit glass of a layer's awake conduit (its terrain cache's, see Cache.glass); null without the conduit sheet. */
export function conduitGlass(layer: number): HTMLCanvasElement | null {
  return caches.get(layer)?.glass ?? null;
}

function artKeyFor(layer: number): string {
  const s = sheetsFor(layer);
  return [s.rock, s.water, s.hot, s.magma, s.conduit].map((x) => (x ? 1 + x.vars.length : 0)).join('');
}

/** The cached terrain canvas for a layer, patched for any cells that changed since the last call. */
export function terrainCanvas(L: LayerState): HTMLCanvasElement {
  const artKey = artKeyFor(L.index);
  let c = caches.get(L.index);
  if (!c || c.artKey !== artKey || c.canvas.width !== L.w * TILE || c.canvas.height !== L.h * TILE) {
    const canvas = document.createElement('canvas');
    canvas.width = L.w * TILE;
    canvas.height = L.h * TILE;
    // Every patch over the sheets reads the canvas back (redraw), so keep it in CPU memory: no GPU
    // readback stall per dug cell, and no Chrome readback warning.
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = false;
    let glass: HTMLCanvasElement | null = null;
    let gctx: CanvasRenderingContext2D | null = null;
    if (sheetsFor(L.index).conduit) {
      glass = document.createElement('canvas');
      glass.width = canvas.width;
      glass.height = canvas.height;
      gctx = glass.getContext('2d')!;
    }
    c = { canvas, ctx, glass, gctx, terrain: L.terrain.slice(), revealed: L.revealed.slice(), hot: L.hot.slice(), live: L.conduitLive.slice(), artKey };
    caches.set(L.index, c);
    redraw(c, L, 0, 0, L.w - 1, L.h - 1);
    return c.canvas;
  }
  // Find changed cells and patch a box around them (rock shading reaches 3 cells).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < L.terrain.length; i++) {
    if (L.terrain[i] !== c.terrain[i] || L.revealed[i] !== c.revealed[i] || L.hot[i] !== c.hot[i] || L.conduitLive[i] !== c.live[i]) {
      const x = i % L.w;
      const y = (i / L.w) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX >= 0) {
    redraw(c, L, minX - 3, minY - 3, maxX + 3, maxY + 3);
    c.terrain.set(L.terrain);
    c.revealed.set(L.revealed);
    c.hot.set(L.hot);
    c.live.set(L.conduitLive);
  }
  return c.canvas;
}

export function resetTerrainCaches(): void {
  caches.clear();
}
