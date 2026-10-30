/**
 * Shared helpers for the art pipeline (scripts/art/*.ts): PNG I/O, the Apollo palette and quantizer,
 * crop / trim / blit / scale, a palette-PNG encoder, WCAG contrast, a 3x5 pixel font for labels, and
 * the list of sprite names the game asks for (parsed as text from src/data/*.ts and the terrain list
 * in src/render/atlas.ts).
 *
 * Runs under Node's built-in type stripping (Node 22.18+), so: erasable TypeScript only (no enums,
 * namespaces or parameter properties), local imports keep their `.ts` extension and type-only
 * imports use `import type`. Images are pngjs `PNG` objects, always 8-bit RGBA (`png.data`, 4 bytes
 * per pixel, row-major). Coordinates are whole pixels.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PNG } from 'pngjs';

export { PNG };

// ---------------------------------------------------------------------------------------------
// Paths

/** Project root (two levels above scripts/art/), with a trailing separator. */
export const ROOT: string = fileURLToPath(new URL('../../', import.meta.url));
export const RECIPES_DIR = join(ROOT, 'art', 'recipes');
export const RAW_DIR = join(ROOT, 'art', 'raw');
export const OUT_DIR = join(ROOT, 'art', 'out');
export const PUBLIC_ART_DIR = join(ROOT, 'public', 'art');
export const ATLAS_PNG = join(PUBLIC_ART_DIR, 'atlas.png');
export const ATLAS_JSON = join(PUBLIC_ART_DIR, 'atlas.json');
export const TERRAIN_DIR = join(PUBLIC_ART_DIR, 'terrain');

/** Resolve a path against the project root (absolute paths pass through unchanged). */
export function fromRoot(path: string): string {
  return resolve(ROOT, path);
}

/** A path for messages: project-relative with forward slashes, or absolute if outside the project. */
export function rel(path: string): string {
  const r = relative(ROOT, path);
  if (r === '') return '.';
  if (r.startsWith('..') || isAbsolute(r)) return path;
  return r.split(sep).join('/');
}

/** Natural sort order ("items_2" before "items_10"). */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

// ---------------------------------------------------------------------------------------------
// PNG I/O

/** A new transparent (or filled) image. */
export function createPng(width: number, height: number, fill?: Color): PNG {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`image size must be whole numbers >= 1, got ${width}x${height}`);
  }
  const png = new PNG({ width, height });
  if (fill !== undefined) fillRect(png, 0, 0, width, height, fill);
  return png;
}

export function clonePng(png: PNG): PNG {
  const out = createPng(png.width, png.height);
  png.data.copy(out.data);
  return out;
}

/** Read a PNG as 8-bit RGBA (palette, grey and 16-bit files are normalized by pngjs). */
export function readPng(path: string): PNG {
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    throw new Error(`cannot read ${rel(path)}: ${err.code === 'ENOENT' ? 'no such file' : err.message}`);
  }
  let parsed: { width: number; height: number; data: Buffer };
  try {
    parsed = PNG.sync.read(buf);
  } catch (e) {
    throw new Error(`${rel(path)} is not a readable PNG: ${(e as Error).message}`);
  }
  // Copy into a fresh PNG so no gamma or other metadata rides along into our outputs.
  const png = createPng(parsed.width, parsed.height);
  parsed.data.copy(png.data, 0, 0, png.data.length);
  return png;
}

/** Write a PNG (8-bit RGBA), creating parent folders. */
export function writePng(path: string, png: PNG): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png, { colorType: 6 }));
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let c = 0xffffffff;
  for (let i = 0; i < body.length; i++) c = CRC_TABLE[(c ^ body[i]) & 0xff] ^ (c >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, body.length + 4);
  return out;
}

/**
 * The image as an 8-bit palette PNG (a tRNS chunk when it has transparency), or null when it has
 * more than 256 distinct colors. Pixel-identical to the RGBA file and many times smaller for
 * palette art (a 144x144 Apollo mock scene: ~2 KB instead of ~26 KB), which matters when a PNG
 * has to travel as base64 inside a tool call.
 */
export function encodeIndexedPng(png: PNG): Buffer | null {
  const d = png.data;
  const lookup = new Map<number, number>();
  const palette: number[][] = [];
  const indices = Buffer.alloc((png.width + 1) * png.height); // each row: filter byte 0 + indices
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const a = d[i + 3];
      const rgba: number[] = a === 0 ? [0, 0, 0, 0] : [d[i], d[i + 1], d[i + 2], a];
      const key = ((rgba[0] * 256 + rgba[1]) * 256 + rgba[2]) * 256 + rgba[3];
      let k = lookup.get(key);
      if (k === undefined) {
        if (palette.length === 256) return null;
        k = palette.length;
        lookup.set(key, k);
        palette.push(rgba);
      }
      indices[y * (png.width + 1) + 1 + x] = k;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(png.width, 0);
  ihdr.writeUInt32BE(png.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // color type: palette
  const plte = Buffer.from(palette.flatMap((c) => [c[0], c[1], c[2]]));
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('PLTE', plte)];
  if (palette.some((c) => c[3] !== 255)) chunks.push(pngChunk('tRNS', Buffer.from(palette.map((c) => c[3]))));
  chunks.push(pngChunk('IDAT', deflateSync(indices, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}

// ---------------------------------------------------------------------------------------------
// Colors and the Apollo palette

export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];
/** '#rrggbb', '#rrggbbaa' or an RGBA tuple (0-255). */
export type Color = string | Rgba;

/**
 * Apollo 46 by AdamCYounis, copied from src/data/palette.ts (scripts don't import src/).
 * `paletteDrift()` reports it if the two ever disagree.
 */
export const APOLLO: readonly string[] = [
  // blues
  '#172038', '#253a5e', '#3c5e8b', '#4f8fba', '#73bed3', '#a4dddb',
  // greens
  '#19332d', '#25562e', '#468232', '#75a743', '#a8ca58', '#d0da91',
  // browns
  '#4d2b32', '#7a4841', '#ad7757', '#c09473', '#d7b594', '#e7d5b3',
  // oranges
  '#341c27', '#602c2c', '#884b2b', '#be772b', '#de9e41', '#e8c170',
  // reds
  '#241527', '#411d31', '#752438', '#a53030', '#cf573c', '#da863e',
  // purples
  '#1e1d39', '#402751', '#7a367b', '#a23e8c', '#c65197', '#df84a5',
  // greys
  '#090a14', '#10141f', '#151d28', '#202e37', '#394a50', '#577277', '#819796', '#a8b5b2', '#c7cfcc', '#ebede9',
];

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb color: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function toRgba(color: Color): Rgba {
  if (typeof color !== 'string') return color;
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (!m) throw new Error(`not a #rrggbb or #rrggbbaa color: ${color}`);
  const [r, g, b] = hexToRgb(m[1]);
  return [r, g, b, m[2] ? parseInt(m[2], 16) : 255];
}

export const APOLLO_RGB: readonly Rgb[] = APOLLO.map(hexToRgb);

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB (0-255) to OKLab: a perceptual space where straight-line distance tracks visible difference. */
export function oklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const APOLLO_LAB = APOLLO_RGB.map(([r, g, b]) => oklab(r, g, b));
const APOLLO_EXACT = new Map<number, number>(
  APOLLO_RGB.map(([r, g, b], i): [number, number] => [(r << 16) | (g << 8) | b, i]),
);
const nearestCache = new Map<number, number>();

/** Index into APOLLO of the color closest to (r, g, b) by OKLab distance. */
export function nearestApollo(r: number, g: number, b: number): number {
  const key = (r << 16) | (g << 8) | b;
  const exact = APOLLO_EXACT.get(key);
  if (exact !== undefined) return exact;
  const hit = nearestCache.get(key);
  if (hit !== undefined) return hit;
  const [L, A, B] = oklab(r, g, b);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < APOLLO_LAB.length; i++) {
    const p = APOLLO_LAB[i];
    const d = (L - p[0]) ** 2 + (A - p[1]) ** 2 + (B - p[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  nearestCache.set(key, best);
  return best;
}

/** True if (r, g, b) is exactly one of the 46 Apollo colors. */
export function isApollo(r: number, g: number, b: number): boolean {
  return APOLLO_EXACT.has((r << 16) | (g << 8) | b);
}

/** WCAG contrast ratio of two sRGB colors (1 = identical luminance, 21 = black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const lum = ([r, g, bl]: Rgb): number => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(bl);
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pixels with alpha below this (50%) become fully transparent; the rest fully opaque. */
export const ALPHA_CUTOFF = 128;

/**
 * A pixel "moved far" when snapping it to Apollo changed its color by more than this OKLab
 * distance: two to three just-noticeable differences. Neighboring Apollo colors are 0.015-0.124
 * apart (median 0.061), so on-palette art that only drifted moves less than ~0.03.
 */
export const FAR_DELTA = 0.05;

export interface QuantizeStats {
  /** Pixels that ended up opaque. */
  opaque: number;
  /** Opaque pixels whose color was not already an Apollo color. */
  snapped: number;
  /** Opaque pixels moved more than FAR_DELTA (a visibly different color). */
  far: number;
  /** Largest OKLab distance any pixel was moved (0 = everything was already on palette). */
  maxDelta: number;
  /** Pixels whose alpha was neither 0 nor 255 before quantizing. */
  partialAlpha: number;
}

export function newQuantizeStats(): QuantizeStats {
  return { opaque: 0, snapped: 0, far: 0, maxDelta: 0, partialAlpha: 0 };
}

/** Add `b` into `a` (for per-batch totals). */
export function addQuantizeStats(a: QuantizeStats, b: QuantizeStats): void {
  a.opaque += b.opaque;
  a.snapped += b.snapped;
  a.far += b.far;
  a.maxDelta = Math.max(a.maxDelta, b.maxDelta);
  a.partialAlpha += b.partialAlpha;
}

/**
 * Snap an image to Apollo, in place: alpha < 128 (50%) becomes fully transparent (0,0,0,0); every
 * other pixel becomes the nearest Apollo color (OKLab distance) at alpha 255. Returns the same image.
 * Pass a stats object to learn how far off-palette the source was.
 */
export function quantize(png: PNG, stats?: QuantizeStats): PNG {
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (stats && a !== 0 && a !== 255) stats.partialAlpha++;
    if (a < ALPHA_CUTOFF) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
      continue;
    }
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const k = nearestApollo(r, g, b);
    const p = APOLLO_RGB[k];
    if (stats) {
      stats.opaque++;
      if (p[0] !== r || p[1] !== g || p[2] !== b) {
        stats.snapped++;
        const [L, A, B] = oklab(r, g, b);
        const q = APOLLO_LAB[k];
        const delta = Math.sqrt((L - q[0]) ** 2 + (A - q[1]) ** 2 + (B - q[2]) ** 2);
        if (delta > FAR_DELTA) stats.far++;
        stats.maxDelta = Math.max(stats.maxDelta, delta);
      }
    }
    d[i] = p[0];
    d[i + 1] = p[1];
    d[i + 2] = p[2];
    d[i + 3] = 255;
  }
  return png;
}

// ---------------------------------------------------------------------------------------------
// Pixel operations

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function assertInts(what: string, ...values: number[]): void {
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`${what}: whole pixels only, got ${values.join(', ')}`);
  }
}

/** A new image holding the rectangle (x, y, w, h) of `png`. Throws if it leaves the image. */
export function crop(png: PNG, x: number, y: number, w: number, h: number): PNG {
  assertInts('crop', x, y, w, h);
  if (w < 1 || h < 1) throw new Error(`crop [${x}, ${y}, ${w}, ${h}] has no area`);
  if (x < 0 || y < 0 || x + w > png.width || y + h > png.height) {
    throw new Error(`crop [${x}, ${y}, ${w}, ${h}] reaches outside the ${png.width}x${png.height} image`);
  }
  const out = createPng(w, h);
  for (let row = 0; row < h; row++) {
    const s = ((y + row) * png.width + x) * 4;
    png.data.copy(out.data, row * w * 4, s, s + w * 4);
  }
  return out;
}

/**
 * Bounding box of the pixels that survive quantizing (alpha >= cutoff), or null if there are none.
 */
export function trimAlpha(png: PNG, cutoff = ALPHA_CUTOFF): Rect | null {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  const d = png.data;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (d[(y * png.width + x) * 4 + 3] >= cutoff) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Draw `src` onto `dst` with its top-left at (dx, dy), clipped to `dst`. Source-over blending with
 * straight alpha: alpha-0 pixels are skipped, alpha-255 pixels are copied exactly.
 */
export function blit(dst: PNG, src: PNG, dx: number, dy: number): void {
  assertInts('blit', dx, dy);
  const x0 = Math.max(0, -dx);
  const y0 = Math.max(0, -dy);
  const x1 = Math.min(src.width, dst.width - dx);
  const y1 = Math.min(src.height, dst.height - dy);
  const s = src.data;
  const d = dst.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const si = (y * src.width + x) * 4;
      const sa = s[si + 3];
      if (sa === 0) continue;
      const di = ((y + dy) * dst.width + (x + dx)) * 4;
      if (sa === 255) {
        d[di] = s[si];
        d[di + 1] = s[si + 1];
        d[di + 2] = s[si + 2];
        d[di + 3] = 255;
        continue;
      }
      const a = sa / 255;
      const da = d[di + 3] / 255;
      const oa = a + da * (1 - a);
      for (let c = 0; c < 3; c++) d[di + c] = Math.round((s[si + c] * a + d[di + c] * da * (1 - a)) / oa);
      d[di + 3] = Math.round(oa * 255);
    }
  }
}

/** Nearest-neighbor upscale by a whole factor (a new image, even for factor 1). */
export function scaleNearest(png: PNG, factor: number): PNG {
  if (!Number.isInteger(factor) || factor < 1) throw new Error(`scale must be a whole number >= 1, got ${factor}`);
  if (factor === 1) return clonePng(png);
  const out = createPng(png.width * factor, png.height * factor);
  const rowBytes = out.width * 4;
  const s = png.data;
  const d = out.data;
  for (let y = 0; y < png.height; y++) {
    const rowStart = y * factor * rowBytes;
    for (let x = 0; x < png.width; x++) {
      const si = (y * png.width + x) * 4;
      for (let i = 0; i < factor; i++) {
        const di = rowStart + (x * factor + i) * 4;
        d[di] = s[si];
        d[di + 1] = s[si + 1];
        d[di + 2] = s[si + 2];
        d[di + 3] = s[si + 3];
      }
    }
    for (let r = 1; r < factor; r++) d.copy(d, rowStart + r * rowBytes, rowStart, rowStart + rowBytes);
  }
  return out;
}

/** Fill a rectangle (clipped; replaces pixels, no blending). */
export function fillRect(png: PNG, x: number, y: number, w: number, h: number, color: Color): void {
  const [r, g, b, a] = toRgba(color);
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(png.width, x + w);
  const y1 = Math.min(png.height, y + h);
  const d = png.data;
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * png.width + xx) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a;
    }
  }
}

/** A 1 px rectangle outline (clipped). */
export function strokeRect(png: PNG, x: number, y: number, w: number, h: number, color: Color): void {
  if (w < 1 || h < 1) return;
  fillRect(png, x, y, w, 1, color);
  fillRect(png, x, y + h - 1, w, 1, color);
  fillRect(png, x, y, 1, h, color);
  fillRect(png, x + w - 1, y, 1, h, color);
}

/** Count of pixels with alpha 0. */
export function countTransparent(png: PNG): number {
  let n = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] === 0) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------
// 3x5 pixel font (uppercase, digits, _ - and a little punctuation; lowercase is drawn uppercase)

export const GLYPH_W = 3;
export const GLYPH_H = 5;
/** Horizontal advance per character (glyph + 1 px gap). */
export const GLYPH_ADVANCE = 4;
/** Vertical advance per line (glyph + 1 px gap). */
export const LINE_HEIGHT = 6;

// Five rows of three pixels each, top to bottom.
const FONT_SRC: Record<string, string> = {
  A: '.#. #.# ### #.# #.#',
  B: '##. #.# ##. #.# ##.',
  C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###',
  F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##',
  H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###',
  J: '..# ..# ..# #.# .#.',
  K: '#.# #.# ##. #.# #.#',
  L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#',
  N: '##. #.# #.# #.# #.#',
  O: '.#. #.# #.# #.# .#.',
  P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##',
  R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.',
  T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###',
  V: '#.# #.# #.# #.# .#.',
  W: '#.# #.# ### ### #.#',
  X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.',
  Z: '### ..# .#. #.. ###',
  '0': '### #.# #.# #.# ###',
  '1': '.#. ##. .#. .#. ###',
  '2': '##. ..# .#. #.. ###',
  '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#',
  '5': '### #.. ##. ..# ##.',
  '6': '.## #.. ### #.# ###',
  '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###',
  '9': '### #.# ### ..# ##.',
  _: '... ... ... ... ###',
  '-': '... ... ### ... ...',
  ' ': '... ... ... ... ...',
  '.': '... ... ... ... .#.',
  ',': '... ... ... .#. #..',
  ':': '... .#. ... .#. ...',
  '/': '..# ..# .#. #.. #..',
  '(': '.#. #.. #.. #.. .#.',
  ')': '.#. ..# ..# ..# .#.',
  '#': '#.# ### #.# ### #.#',
  '%': '#.# ..# .#. #.. #.#',
  '+': '... .#. ### .#. ...',
  '*': '... #.# .#. #.# ...',
  '=': '... ### ... ### ...',
  '?': '##. ..# .#. ... .#.',
  '!': '.#. .#. .#. ... .#.',
  "'": '.#. .#. ... ... ...',
  '<': '..# .#. #.. .#. ..#',
  '>': '#.. .#. ..# .#. #..',
};

/** Glyph rows as 3-bit masks (bit 2 = left column). */
const GLYPHS = new Map<string, number[]>(
  Object.entries(FONT_SRC).map(([ch, src]): [string, number[]] => [
    ch,
    src.split(' ').map((row) => (row[0] === '#' ? 4 : 0) | (row[1] === '#' ? 2 : 0) | (row[2] === '#' ? 1 : 0)),
  ]),
);

export function hasGlyph(ch: string): boolean {
  return GLYPHS.has(ch.toUpperCase());
}

/** Width in pixels of the longest line of `text` (no trailing gap). */
export function textWidth(text: string, scale = 1): number {
  const longest = Math.max(0, ...text.split('\n').map((l) => [...l].length));
  return longest === 0 ? 0 : (longest * GLYPH_ADVANCE - 1) * scale;
}

/** Height in pixels of `text` (lines separated by '\n'). */
export function textHeight(text: string, scale = 1): number {
  return (text.split('\n').length * LINE_HEIGHT - 1) * scale;
}

/**
 * Draw `text` with its top-left at (x, y) in the 3x5 font, each font pixel `scale` x `scale`.
 * Unknown characters draw as '?'. Returns the width drawn.
 */
export function drawText(png: PNG, text: string, x: number, y: number, color: Color, scale = 1): number {
  const rgba = toRgba(color);
  const fallback = GLYPHS.get('?') as number[];
  let cx = x;
  let cy = y;
  let maxX = x;
  for (const ch of text.toUpperCase()) {
    if (ch === '\n') {
      cx = x;
      cy += LINE_HEIGHT * scale;
      continue;
    }
    const rows = GLYPHS.get(ch) ?? fallback;
    for (let r = 0; r < GLYPH_H; r++) {
      for (let c = 0; c < GLYPH_W; c++) {
        if (rows[r] & (4 >> c)) fillRect(png, cx + c * scale, cy + r * scale, scale, scale, rgba);
      }
    }
    cx += GLYPH_ADVANCE * scale;
    maxX = Math.max(maxX, cx - scale);
  }
  return maxX - x;
}

// ---------------------------------------------------------------------------------------------
// atlas.json

export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasJson {
  sprites: Record<string, AtlasRect>;
  built: string;
}

/** Read public/art/atlas.json (or another path); null if it doesn't exist. Throws if malformed. */
export function readAtlasJson(path: string = ATLAS_JSON): AtlasJson | null {
  if (!existsSync(path)) return null;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`${rel(path)} is not valid JSON: ${(e as Error).message}`);
  }
  if (typeof data !== 'object' || data === null || !('sprites' in data)) {
    throw new Error(`${rel(path)} has no "sprites" object`);
  }
  const sprites = (data as { sprites: unknown }).sprites;
  if (typeof sprites !== 'object' || sprites === null || Array.isArray(sprites)) {
    throw new Error(`${rel(path)}: "sprites" is not an object`);
  }
  const out: Record<string, AtlasRect> = {};
  for (const [name, r] of Object.entries(sprites as Record<string, unknown>)) {
    const v = r as Partial<AtlasRect> | null;
    if (!v || ![v.x, v.y, v.w, v.h].every((n) => Number.isInteger(n))) {
      throw new Error(`${rel(path)}: sprite "${name}" needs whole-number x, y, w, h`);
    }
    out[name] = { x: v.x as number, y: v.y as number, w: v.w as number, h: v.h as number };
  }
  const built = (data as { built?: unknown }).built;
  return { sprites: out, built: typeof built === 'string' ? built : '' };
}

// ---------------------------------------------------------------------------------------------
// The sprite names the game asks for (STYLE.md "Asset manifest"), parsed from src/data as text.

export interface WantedSprite {
  name: string;
  /** Prefix group: 'i', 'b', 'd', 't', 'x', 'p' or 'title'. */
  group: string;
  /** Exact size the sprite should have, when known. */
  size?: [number, number];
  /**
   * The game uses it when the art has it and is complete without it (a terrain set's floor
   * variants): never missing, and not an unknown name when it is there.
   */
  optional?: boolean;
}

export const GROUP_LABELS: Record<string, string> = {
  i: 'items',
  b: 'buildings',
  d: 'deposits',
  t: 'terrain',
  p: 'portraits',
  title: 'title',
  x: 'decor',
  other: 'other',
};

/** Prefix group of a sprite name: 'i_iron_ore' -> 'i', 'title_art' -> 'title'. */
export function spriteGroup(name: string): string {
  if (name === 'title_art' || name.startsWith('title')) return 'title';
  const m = /^([a-z])_/.exec(name);
  return m && m[1] in GROUP_LABELS ? m[1] : 'other';
}

/** The nine deposit kinds (item ids of the ores; glowcap is a fungus patch). */
export const DEPOSIT_ORES = [
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

/**
 * Wang terrain sets (STYLE.md "Terrain", the art plan's ten sets); sprite names are `t_<set>`.
 * Only a fallback: the wanted names come from the TERRAIN_SETS list the game itself loads in
 * src/render/atlas.ts (readTerrainSets), so coverage follows the game.
 */
export const TERRAIN_SETS = [
  'l0_ground_rock',
  'l1_floor_rock',
  'l2_floor_rock',
  'l2_floor_water',
  'l3_floor_rock',
  'l4_floor_rock',
  'l4_floor_hot',
  'l4_hot_magma',
  'l5_floor_rock',
  'l5_floor_conduit',
] as const;

/** src/render/atlas.ts as text, or '' if it can't be read (the callers then use their fallbacks). */
function readAtlasTs(): string {
  try {
    return readFileSync(join(ROOT, 'src', 'render', 'atlas.ts'), 'utf8');
  } catch {
    return '';
  }
}

/** Terrain sheet names the game loads (TERRAIN_SETS in src/render/atlas.ts), else the list above. */
export function readTerrainSets(): string[] {
  const m = /\bTERRAIN_SETS\s*=\s*\[([^\]]*)\]/.exec(readAtlasTs());
  const names = m ? [...m[1].matchAll(/['"](t_[a-z0-9_]+)['"]/g)].map((x) => x[1]) : [];
  return names.length > 0 ? [...new Set(names)] : TERRAIN_SETS.map((s) => `t_${s}`);
}

/**
 * How many floor variants a terrain set may have (TERRAIN_VARIANTS in src/render/atlas.ts, else 3):
 * `<set>_v1` .. `<set>_v<n>`, copies of the sheet with only tiles 0 and 15 edited (STYLE.md "Floor
 * variety"). The game loads the ones the atlas has and scatters them among the plain tiles.
 */
export function readTerrainVariants(): number {
  const m = /\bTERRAIN_VARIANTS\s*=\s*(\d+)/.exec(readAtlasTs());
  return m ? Number(m[1]) : 3;
}

/**
 * Belts and the belt pieces are code-drawn (src/render/belts.ts), so they have no building sprite:
 * the pieces' code-drawn housing in fallback.ts only serves the build bar.
 */
const CODE_DRAWN_BUILDINGS = new Set(['belt', 'express_belt', 'insulated_belt', 'splitter', 'crossing', 'sorter']);

/** Decor props drawn 32 x 32 (STYLE.md "Asset manifest"); every other decor sprite is 16 x 16. */
export const DECOR_32 = new Set([
  'x_l0_crate_stack',
  'x_l1_support',
  'x_l1_minecart',
  'x_l2_mushroom_tall',
  'x_l3_crystal_large',
  'x_l4_hex_pillar',
  'x_l5_stone_gear',
]);

function readDataFile(file: string): string {
  const path = join(ROOT, 'src', 'data', file);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new Error(`cannot read ${rel(path)}: ${(e as Error).message}`);
  }
  return text.replace(/^\s*\/\/.*$/gm, ''); // drop whole-line comments
}

/** Item ids from src/data/items.ts (`item('id', ...)` calls), in file order. */
export function readItemIds(): string[] {
  const text = readDataFile('items.ts');
  const ids = [...text.matchAll(/\bitem\(\s*['"]([a-z0-9_]+)['"]/g)].map((m) => m[1]);
  if (ids.length === 0) throw new Error('found no item ids in src/data/items.ts (did its format change?)');
  return [...new Set(ids)];
}

/** Building ids and footprints (tiles) from src/data/buildings.ts (`b({ id: '...', size: n })`). */
export function readBuildings(): { id: string; size: number | null }[] {
  const text = readDataFile('buildings.ts');
  const starts = [...text.matchAll(/\bb\(\s*\{\s*id:\s*['"]([a-z0-9_]+)['"]/g)];
  if (starts.length === 0) throw new Error('found no building ids in src/data/buildings.ts (did its format change?)');
  const out: { id: string; size: number | null }[] = [];
  starts.forEach((m, k) => {
    const from = m.index ?? 0;
    const to = k + 1 < starts.length ? (starts[k + 1].index ?? text.length) : text.length;
    const size = /\bsize:\s*(\d+)/.exec(text.slice(from, to));
    if (!out.some((b) => b.id === m[1])) out.push({ id: m[1], size: size ? Number(size[1]) : null });
  });
  return out;
}

/**
 * Decor sprite names from src/data/layers.ts: every layer's `decor: [...]` list (map decor value v
 * draws LAYERS[layer].decor[v - 1]), then AMBER_SPRITE, the amber-sealed rock at the Shallows bore site.
 */
export function readDecorNames(): string[] {
  const text = readDataFile('layers.ts');
  const names = [...text.matchAll(/\bdecor:\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/['"]([a-z0-9_]+)['"]/g)].map((x) => x[1]));
  if (names.length === 0) throw new Error('found no decor lists in src/data/layers.ts (did its format change?)');
  const amber = /\bAMBER_SPRITE\s*=\s*['"]([a-z0-9_]+)['"]/.exec(text);
  if (amber) names.push(amber[1]);
  return [...new Set(names)];
}

/**
 * Every sprite name the game asks the atlas for, grouped and in a stable order, then the optional
 * floor variants of each terrain set (`optional`: art:coverage never counts them as missing).
 */
export function wantedSprites(): WantedSprite[] {
  const out: WantedSprite[] = [];
  for (const id of readItemIds()) out.push({ name: `i_${id}`, group: 'i', size: [16, 16] });

  const buildings = readBuildings();
  const px = (id: string, fallback: number): number => {
    const tiles = buildings.find((b) => b.id === id)?.size;
    return tiles ? tiles * 16 : fallback;
  };
  const extraStates: Record<string, string> = { drill: 'drill_broken', heart: 'heart_dormant' };
  for (const b of buildings) {
    if (CODE_DRAWN_BUILDINGS.has(b.id)) continue;
    const size: [number, number] | undefined = b.size ? [b.size * 16, b.size * 16] : undefined;
    const state = extraStates[b.id];
    if (state) out.push({ name: `b_${state}`, group: 'b', size });
    out.push({ name: `b_${b.id}`, group: 'b', size });
  }
  if (!out.some((w) => w.name === 'b_drill_broken')) out.push({ name: 'b_drill_broken', group: 'b', size: [px('drill', 80), px('drill', 80)] });
  if (!out.some((w) => w.name === 'b_heart_dormant')) out.push({ name: 'b_heart_dormant', group: 'b', size: [px('heart', 112), px('heart', 112)] });

  for (const ore of DEPOSIT_ORES) {
    for (let v = 1; v <= 3; v++) out.push({ name: `d_${ore}_${v}`, group: 'd', size: [16, 16] });
  }
  for (const name of readDecorNames()) out.push({ name, group: 'x', size: DECOR_32.has(name) ? [32, 32] : [16, 16] });
  const sets = readTerrainSets();
  for (const name of sets) out.push({ name, group: 't', size: [64, 64] });
  out.push({ name: 'p_mags', group: 'p', size: [48, 48] });
  out.push({ name: 'title_art', group: 'title', size: [320, 180] });
  const variants = readTerrainVariants();
  for (const name of sets) {
    for (let v = 1; v <= variants; v++) out.push({ name: `${name}_v${v}`, group: 't', size: [64, 64], optional: true });
  }
  return out;
}

/**
 * Compare APOLLO above with src/data/palette.ts. Returns a message if they differ, else null
 * (also null when the file can't be read: the check is advisory).
 */
export function paletteDrift(): string | null {
  const path = join(ROOT, 'src', 'data', 'palette.ts');
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const start = text.search(/\bAPOLLO\s*=\s*\[/);
  if (start < 0) return null;
  const end = text.indexOf(']', start);
  const theirs = (text.slice(start, end).match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase());
  const ours = new Set(APOLLO);
  const missing = theirs.filter((h) => !ours.has(h));
  const extra = APOLLO.filter((h) => !theirs.includes(h));
  if (missing.length === 0 && extra.length === 0) return null;
  return (
    `scripts/art/lib.ts APOLLO differs from src/data/palette.ts` +
    (missing.length ? `; only in palette.ts: ${missing.join(' ')}` : '') +
    (extra.length ? `; only in lib.ts: ${extra.join(' ')}` : '')
  );
}

// ---------------------------------------------------------------------------------------------
// Console helpers

/** Wrap words into lines of at most `width` characters, each prefixed by `indent`. */
export function wrapWords(words: string[], width = 100, indent = '    '): string {
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && indent.length + line.length + 1 + w.length > width) {
      lines.push(indent + line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(indent + line);
  return lines.join('\n');
}

export function percent(part: number, whole: number, digits = 0): string {
  return whole === 0 ? '0%' : `${((part / whole) * 100).toFixed(digits)}%`;
}
