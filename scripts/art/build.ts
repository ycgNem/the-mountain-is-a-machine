/**
 * art:build: turn art/recipes/*.json into the game's sprite atlas and terrain sheets.
 *
 *   node scripts/art/build.ts [--check] [--verbose] [--recipes <dir>]
 *
 * Reads every art/recipes/*.json in natural filename order (items_2 before items_10) and writes
 *   public/art/atlas.png + atlas.json   every sprite and terrain sheet, shelf-packed (max 1024 wide,
 *                                       1 px padding); atlas.json = { "sprites": { name: { x, y, w, h } },
 *                                       "lights": { name: [[x, y, "#rrggbb", r], ...] },
 *                                       "anchors": { name: { "pit"?: [x, y, w, h], "bore"?: ..., "core"?: ...,
 *                                                            "chute"?: { "N"?: [a, b, c], "E"?: ..., ... } } },
 *                                       "variantShare": { set: share },
 *                                       "built": ISO date }
 *   public/art/terrain/<name>.png       each terrain sheet on its own (64 x 64 for 16 px tiles)
 * Every output pixel is an Apollo color at alpha 255, or fully transparent: alpha < 128 (50%)
 * becomes transparent, every other pixel the nearest Apollo color by OKLab distance. The report
 * counts pixels that moved far (OKLab dE > 0.05, FAR_DELTA in lib.ts) and warns about any sprite or
 * sheet where more than 3% did (art that ignored the palette). If any recipe has an error (including
 * art too big for its sprite, see below), nothing is written and the exit code is 1. Warnings
 * (wrong size, unknown name, override, colors moved far, ...) don't stop the build.
 *   --check            validate and report, write nothing
 *   --verbose          one line per sprite
 *   --recipes <dir>    with --check only: validate the recipes in <dir> instead of art/recipes/
 *
 * Recipe format (also in STYLE.md, "Pipeline"):
 *
 *   {
 *     "batch": "items_1",
 *     "note": "ignored: prompt, PixelLab job id, anything",
 *     "sprites": [
 *       { "name": "i_iron_ore", "src": "art/raw/items_1/iron_ore.png", "rect": [x, y, w, h],
 *         "size": [16, 16], "fit": "center", "trim": true, "scale": 1 }
 *     ],
 *     "terrain": [
 *       { "name": "t_l1_floor_rock", "src": "art/raw/terrain/l1.png", "tile": 16,
 *         "tiles": [ { "rect": [x, y, w, h], "corners": [nw, ne, sw, se] } ] }
 *     ]
 *   }
 *
 * Sprites
 *   name   the atlas key the game asks for, [a-z0-9_] (STYLE.md "Asset manifest")
 *   src    PNG path relative to the project root (absolute paths work too)
 *   rect   optional [x, y, w, h] cut from src; default: the whole image
 *   trim   optional, default true: cut away transparent margins (alpha < 128) inside rect, so the
 *          art is padded and placed by "fit" whatever margins PixelLab drew; false keeps the rect
 *          exactly as cut (then the whole rect must fit the canvas)
 *   scale  optional whole-number nearest-neighbor upscale, default 1
 *   size   [w, h] of the finished sprite: the art is placed on a transparent canvas this big
 *   fit    "center" or "bottom" (bottom-center: standing on its footprint). Default: "bottom" for
 *          canvases of 32 x 32 and up (2x2 machines and larger), "center" below (items, deposits,
 *          1x1). An odd leftover pixel goes to the right / bottom.
 *   light  optional light spot(s) the renderer glows while the building works (STYLE.md "Perspective,
 *          light and outline"): [x, y, "#rrggbb"] or [x, y, "#rrggbb", r], or a list of them. x, y is
 *          the lit lamp or window pixel in finished sprite pixels (after trim and fit; look at the
 *          sprite at 4x in art:sheet), the colour is the light's Apollo colour (the renderer draws the
 *          next brighter colour of its ramp on the pixel and a halo of this one around it) and r the
 *          glow radius, default 3 (5 and up get a 2 px halo). It must sit on a drawn pixel, or the
 *          build fails. Written to atlas.json "lights"; sprites without one get no glow.
 *   pit, bore, core   optional anchors, [x, y, w, h] in finished sprite pixels (after trim and fit):
 *          the elevator station's cab pit, the Drill's bore, the Heart's core gem. Every pixel of the
 *          rect must be drawn (it is part of the art), or the build fails.
 *   chute  optional anchor, the body's edge on each side the renderer may draw a chute from:
 *          { "N": [a, b, c], "E": ..., "S": ..., "W": ... } (any of the four), where a, b, c are the
 *          first drawn pixel in from that side along the three tile centres (x or y = 8, 24, 40 on a
 *          48 px 3x3 building): N and S give y at x = 8, 24, 40, E and W give x at y = 8, 24, 40. Out
 *          of the canvas fails the build; a value that isn't the art's edge there is a warning.
 *          Anchors go to atlas.json "anchors" (one object per sprite that has any), from the recipe
 *          that wins for the name. "_pit" and the like (with "_") stay notes.
 *   Art is never shrunk or cut to fit. The opaque bounding box (alpha >= 128, after rect and scale)
 *   must fit the canvas, and an item's (i_) must fit the central 12 x 12, or 14 on one axis and
 *   12 on the other for the long items i_steel_beam, i_drill_bit, i_cobalt_drill_head and
 *   i_copper_wire (STYLE.md "Item icon"); otherwise the build fails and says which art is too big.
 *   Then the sprite is quantized to Apollo.
 * Terrain (STYLE.md "Terrain: the dual grid")
 *   name   t_<set>: written to public/art/terrain/<name>.png AND packed into the atlas as <name>
 *   src    PNG holding the tiles; tile = tile size in px (default 16)
 *   tiles  one entry per corner combination, corners = [nw, ne, sw, se] with 1 = upper terrain
 *          (rock, water, magma), 0 = lower (floor). rect is [x, y, w, h] (w = h = tile) or [x, y].
 *          Instead of rect, "twin": [nw, ne, sw, se] reuses the tile listed for another combination:
 *          an explicit duplicate when the source art lacks one. All 16 combinations must be there.
 *          Tile i = nw*8 + ne*4 + sw*2 + se lands at column i % 4, row floor(i / 4) of the sheet.
 *   variantShare   optional, on a set's own entry (t_<set>, not a _v<n> variant): the share of its
 *          plain tiles (0 and 15) the renderer draws from its floor variants t_<set>_v1.._v<n> (STYLE.md
 *          "Floor variety"), above 0 and at most 1. Written to atlas.json "variantShare" for every set
 *          that has a share and at least one variant; a set with variants and no share is left to the
 *          renderer's default (and warned about).
 * A later recipe (or a later entry) with the same name overrides the earlier one, with a warning.
 * Keys named "note" or starting with "_" are ignored at every level.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  APOLLO,
  ATLAS_JSON,
  ATLAS_PNG,
  FAR_DELTA,
  RECIPES_DIR,
  TERRAIN_DIR,
  addQuantizeStats,
  blit,
  clonePng,
  countTransparent,
  createPng,
  crop,
  fromRoot,
  naturalCompare,
  newQuantizeStats,
  paletteDrift,
  percent,
  quantize,
  readPng,
  rel,
  scaleNearest,
  spriteGroup,
  trimAlpha,
  wantedSprites,
  writePng,
} from './lib.ts';
import type { AtlasRect, PNG, QuantizeStats, Rect, WantedSprite } from './lib.ts';

const ATLAS_MAX_W = 1024;
const PAD = 1;
const NAME_RE = /^[a-z0-9_]+$/;
/** A floor variant sheet's suffix: t_<set>_v<n> (STYLE.md "Floor variety"). */
const VARIANT_RE = /_v\d+$/;
const USAGE = 'usage: node scripts/art/build.ts [--check] [--verbose] [--recipes <dir>]';
/** Item art fits the central ITEM_BOX x ITEM_BOX; long items may use LONG_ITEM_BOX on one axis. */
const ITEM_BOX = 12;
const LONG_ITEM_BOX = 14;
const LONG_ITEMS = new Set(['i_steel_beam', 'i_drill_bit', 'i_cobalt_drill_head', 'i_copper_wire']);
/** Warn when more than this share of a sprite's opaque pixels moved far (FAR_DELTA) onto Apollo. */
const FAR_SHARE = 0.03;

// ---------------------------------------------------------------------------------------------
// Diagnostics

const errors: string[] = [];
const warnings: string[] = [];
const fail = (msg: string): void => void errors.push(msg);
const warn = (msg: string): void => void warnings.push(msg);
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------------------------
// Recipe parsing

/** A light spot in finished sprite pixels: the pixel the renderer glows on, its Apollo colour, a glow radius. */
interface LightSpec {
  x: number;
  y: number;
  color: string;
  r: number;
}

type Rect4 = [number, number, number, number];
type Side = 'N' | 'E' | 'S' | 'W';
const SIDES: readonly Side[] = ['N', 'E', 'S', 'W'];
/** Rect anchors in finished sprite pixels: the elevator's cab pit, the Drill's bore, the Heart's core. */
const RECT_ANCHORS = ['pit', 'bore', 'core'] as const;
type RectAnchor = (typeof RECT_ANCHORS)[number];

/** A sprite's anchors (atlas.json "anchors"), in finished sprite pixels. */
interface Anchors {
  pit?: Rect4;
  bore?: Rect4;
  core?: Rect4;
  /** Per side, the body's edge along the three tile centres (8, 24, 40): y for N and S, x for E and W. */
  chute?: Partial<Record<Side, [number, number, number]>>;
}

interface SpriteSpec {
  name: string;
  src: string;
  rect: Rect | null;
  size: [number, number];
  fit: 'center' | 'bottom';
  trim: boolean;
  scale: number;
  light: LightSpec[];
  anchors: Anchors;
}

interface TileSpec {
  /** Corner index nw*8 + ne*4 + sw*2 + se. */
  index: number;
  rect: Rect | null;
  /** Corner index of the tile this one copies. */
  twin: number | null;
}

interface TerrainSpec {
  name: string;
  src: string;
  tile: number;
  tiles: TileSpec[];
  /** Share of the set's plain tiles drawn from its floor variants (atlas.json "variantShare"); null = renderer default. */
  variantShare: number | null;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** An array of `n` whole numbers, or null. */
function ints(v: unknown, n: number): number[] | null {
  return Array.isArray(v) && v.length === n && v.every((x) => Number.isInteger(x)) ? (v as number[]) : null;
}

function wholeIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function checkKeys(o: Obj, allowed: string[], ctx: string): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k) && k !== 'note' && !k.startsWith('_')) warn(`${ctx}: unknown key "${k}" (ignored)`);
  }
}

function cornersOf(v: unknown): number | null {
  const c = ints(v, 4);
  if (!c || !c.every((x) => x === 0 || x === 1)) return null;
  return c[0] * 8 + c[1] * 4 + c[2] * 2 + c[3];
}

function cornerLabel(index: number): string {
  const bits = [(index >> 3) & 1, (index >> 2) & 1, (index >> 1) & 1, index & 1];
  return `[${bits.join(', ')}] (tile ${index})`;
}

function parseName(o: Obj, ctx: string): string | null {
  if (typeof o.name !== 'string' || !NAME_RE.test(o.name)) {
    fail(`${ctx}: "name" must be a string of a-z, 0-9 and _ (got ${JSON.stringify(o.name)})`);
    return null;
  }
  return o.name;
}

function parseSrc(o: Obj, ctx: string): string | null {
  if (typeof o.src !== 'string' || o.src.trim() === '') {
    fail(`${ctx}: "src" must be a PNG path relative to the project root`);
    return null;
  }
  return o.src;
}

/** Default glow radius of a light spot (the renderer gives r >= 5 a 2 px halo, smaller ones 1 px). */
const LIGHT_R = 3;

/** "light": one spot [x, y, "#rrggbb"] (optionally a 4th element, the glow radius) or a list of them. */
function parseLight(v: unknown, ctx: string): LightSpec[] {
  if (v === undefined) return [];
  const spots: unknown[] = Array.isArray(v) && v.length > 0 && !Array.isArray(v[0]) ? [v] : Array.isArray(v) ? v : [null];
  const out: LightSpec[] = [];
  spots.forEach((s, k) => {
    const where = spots.length > 1 ? `${ctx} light[${k}]` : `${ctx} light`;
    const ok =
      Array.isArray(s) &&
      (s.length === 3 || s.length === 4) &&
      Number.isInteger(s[0]) &&
      Number.isInteger(s[1]) &&
      typeof s[2] === 'string' &&
      (s.length === 3 || wholeIn(s[3], 1, 32) !== null);
    if (!ok) {
      fail(`${where}: a light spot is [x, y, "#rrggbb"] or [x, y, "#rrggbb", r] in finished sprite pixels (r: glow radius 1-32)`);
      return;
    }
    const [x, y, color] = s as [number, number, string];
    const hex = color.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex) || !APOLLO.includes(hex)) {
      fail(`${where}: ${JSON.stringify(color)} is not an Apollo colour`);
      return;
    }
    out.push({ x, y, color: hex, r: s.length === 4 ? (s[3] as number) : LIGHT_R });
  });
  return out;
}

/**
 * "pit", "bore", "core" ([x, y, w, h]) and "chute" ({ side: [a, b, c] }) in finished sprite pixels,
 * checked against the W x H canvas here; buildSprite checks them against the art.
 */
function parseAnchors(v: Obj, ctx: string, size: number[] | null): Anchors {
  const out: Anchors = {};
  const W = size?.[0] ?? Infinity;
  const H = size?.[1] ?? Infinity;
  for (const key of RECT_ANCHORS) {
    if (v[key] === undefined) continue;
    const r = ints(v[key], 4);
    if (!r || r[2] < 1 || r[3] < 1) {
      fail(`${ctx}: "${key}" must be [x, y, w, h] in finished sprite pixels (after trim and fit)`);
    } else if (r[0] < 0 || r[1] < 0 || r[0] + r[2] > W || r[1] + r[3] > H) {
      fail(`${ctx}: "${key}" [${r.join(', ')}] reaches outside the ${W}x${H} sprite`);
    } else {
      out[key as RectAnchor] = [r[0], r[1], r[2], r[3]];
    }
  }
  if (v.chute !== undefined) {
    const c = v.chute;
    const bad = (): void => fail(`${ctx}: "chute" must be { "N": [a, b, c], "E": ..., "S": ..., "W": ... } (any of the four sides; whole sprite pixels)`);
    if (!isObj(c) || Object.keys(c).length === 0 || Object.keys(c).some((k) => !SIDES.includes(k as Side))) {
      bad();
    } else {
      const chute: Partial<Record<Side, [number, number, number]>> = {};
      let malformed = false;
      let outside = false;
      for (const side of SIDES) {
        if (c[side] === undefined) continue;
        const e = ints(c[side], 3);
        const max = side === 'N' || side === 'S' ? H : W;
        if (!e) {
          malformed = true;
        } else if (e.some((n) => n < 0 || n >= max)) {
          fail(`${ctx}: chute ${side} [${e.join(', ')}] reaches outside the ${W}x${H} sprite`);
          outside = true;
        } else {
          chute[side] = [e[0], e[1], e[2]];
        }
      }
      if (malformed) bad();
      if (!malformed && !outside) out.chute = chute;
    }
  }
  return out;
}

function parseSprite(v: unknown, at: string): SpriteSpec | null {
  if (!isObj(v)) {
    fail(`${at}: must be an object`);
    return null;
  }
  const name = parseName(v, at);
  if (name === null) return null;
  const ctx = `${at} ${name}`;
  checkKeys(v, ['name', 'src', 'rect', 'size', 'fit', 'trim', 'scale', 'light', 'pit', 'bore', 'core', 'chute'], ctx);
  const before = errors.length;
  const src = parseSrc(v, ctx);

  const size = ints(v.size, 2);
  if (!size || size[0] < 1 || size[1] < 1) fail(`${ctx}: "size" must be [w, h] in whole pixels, e.g. [16, 16]`);
  else if (size[0] > ATLAS_MAX_W) fail(`${ctx}: size ${size[0]}x${size[1]} is wider than the ${ATLAS_MAX_W} px atlas`);

  let rect: Rect | null = null;
  if (v.rect !== undefined) {
    const r = ints(v.rect, 4);
    if (!r || r[0] < 0 || r[1] < 0 || r[2] < 1 || r[3] < 1) fail(`${ctx}: "rect" must be [x, y, w, h] in whole pixels`);
    else rect = { x: r[0], y: r[1], w: r[2], h: r[3] };
  }

  // 2x2 and larger stand on the bottom of their footprint; items, deposits and 1x1 sit centered.
  let fit: 'center' | 'bottom' = size && size[0] >= 32 && size[1] >= 32 ? 'bottom' : 'center';
  if (v.fit === 'bottom' || v.fit === 'center') fit = v.fit;
  else if (v.fit !== undefined) {
    fail(`${ctx}: "fit" must be "center" or "bottom" (got ${JSON.stringify(v.fit)})`);
  }

  let trim = true;
  if (typeof v.trim === 'boolean') trim = v.trim;
  else if (v.trim !== undefined) fail(`${ctx}: "trim" must be true or false`);

  let scale = 1;
  if (v.scale !== undefined) {
    const s = wholeIn(v.scale, 1, 16);
    if (s === null) fail(`${ctx}: "scale" must be a whole number from 1 to 16 (pixel art only scales by whole factors)`);
    else scale = s;
  }
  const light = parseLight(v.light, ctx);
  const anchors = parseAnchors(v, ctx, size);

  if (errors.length > before || src === null || !size) return null;
  return { name, src, rect, size: [size[0], size[1]], fit, trim, scale, light, anchors };
}

function parseTile(t: unknown, ctx: string, tile: number): TileSpec | null {
  if (!isObj(t)) {
    fail(`${ctx}: must be an object`);
    return null;
  }
  checkKeys(t, ['rect', 'corners', 'twin'], ctx);
  const index = cornersOf(t.corners);
  if (index === null) {
    fail(`${ctx}: "corners" must be [nw, ne, sw, se], each 0 (lower terrain) or 1 (upper)`);
    return null;
  }
  if ((t.rect === undefined) === (t.twin === undefined)) {
    fail(`${ctx}: give either "rect" (where the tile is in src) or "twin" (corners of a listed tile to copy)`);
    return null;
  }
  if (t.twin !== undefined) {
    const twin = cornersOf(t.twin);
    if (twin === null) fail(`${ctx}: "twin" must be [nw, ne, sw, se] of another listed tile`);
    else if (twin === index) fail(`${ctx}: a tile can't be its own twin`);
    return twin === null || twin === index ? null : { index, rect: null, twin };
  }
  const r = Array.isArray(t.rect) && t.rect.length === 2 ? ints(t.rect, 2) : ints(t.rect, 4);
  if (!r || r[0] < 0 || r[1] < 0) {
    fail(`${ctx}: "rect" must be [x, y, w, h] or [x, y] in whole pixels`);
    return null;
  }
  const w = r.length === 4 ? r[2] : tile;
  const h = r.length === 4 ? r[3] : tile;
  if (w !== tile || h !== tile) {
    fail(`${ctx}: rect is ${w}x${h} but tile is ${tile}: terrain tiles are cut 1:1, never scaled`);
    return null;
  }
  return { index, rect: { x: r[0], y: r[1], w, h }, twin: null };
}

function parseTerrain(v: unknown, at: string): TerrainSpec | null {
  if (!isObj(v)) {
    fail(`${at}: must be an object`);
    return null;
  }
  const name = parseName(v, at);
  if (name === null) return null;
  const ctx = `${at} ${name}`;
  checkKeys(v, ['name', 'src', 'tile', 'tiles', 'variantShare'], ctx);
  const before = errors.length;
  const src = parseSrc(v, ctx);
  if (!name.startsWith('t_')) warn(`${ctx}: terrain names start with t_ (STYLE.md "Asset manifest")`);
  let variantShare: number | null = null;
  if (v.variantShare !== undefined) {
    const sh = v.variantShare;
    if (typeof sh !== 'number' || !(sh > 0 && sh <= 1)) fail(`${ctx}: "variantShare" must be a number above 0 and at most 1`);
    else if (VARIANT_RE.test(name)) fail(`${ctx}: "variantShare" belongs on the set's own entry (${name.replace(VARIANT_RE, '')}), not on a variant`);
    else variantShare = sh;
  }

  let tile = 16;
  if (v.tile !== undefined) {
    const t = wholeIn(v.tile, 1, ATLAS_MAX_W / 4);
    if (t === null) fail(`${ctx}: "tile" must be the tile size in whole pixels (16)`);
    else tile = t;
  }
  if (tile !== 16) warn(`${ctx}: tile is ${tile} px; the game's terrain tiles are 16 px`);

  const tiles: TileSpec[] = [];
  if (!Array.isArray(v.tiles)) {
    fail(`${ctx}: "tiles" must be a list of { "rect": [x, y, w, h], "corners": [nw, ne, sw, se] }`);
    return null;
  }
  /** Corner index -> first entry listing it (even if that entry has other errors). */
  const seen = new Map<number, number>();
  v.tiles.forEach((t: unknown, k: number) => {
    const listed = isObj(t) ? cornersOf(t.corners) : null;
    if (listed !== null) {
      const prev = seen.get(listed);
      if (prev !== undefined) {
        fail(`${ctx} tiles[${k}]: corners ${cornerLabel(listed)} are already listed in tiles[${prev}]`);
        return;
      }
      seen.set(listed, k);
    }
    const spec = parseTile(t, `${ctx} tiles[${k}]`, tile);
    if (spec) tiles.push(spec);
  });
  const withRect = new Set(tiles.filter((t) => t.rect).map((t) => t.index));
  for (const t of tiles) {
    if (t.twin !== null && !withRect.has(t.twin)) {
      fail(`${ctx}: the twin of ${cornerLabel(t.index)} is ${cornerLabel(t.twin)}, which has no "rect" of its own`);
    }
  }
  const missing: string[] = [];
  for (let i = 0; i < 16; i++) if (!seen.has(i)) missing.push(cornerLabel(i));
  if (missing.length > 0) {
    fail(
      `${ctx}: ${missing.length} of the 16 corner combinations are missing: ${missing.join(', ')}` +
        ` (if the source art lacks one, list it with "twin" pointing at a tile to duplicate)`,
    );
  }

  if (errors.length > before || src === null) return null;
  return { name, src, tile, tiles, variantShare };
}

// ---------------------------------------------------------------------------------------------
// Building sprites and terrain sheets

const sources = new Map<string, PNG | Error>();

/** Load a source PNG once per build (many sprites usually share one sheet). */
function source(src: string): PNG {
  const path = fromRoot(src);
  let s = sources.get(path);
  if (s === undefined) {
    try {
      s = readPng(path);
    } catch (e) {
      s = new Error(message(e));
    }
    sources.set(path, s);
  }
  if (s instanceof Error) throw s;
  return s;
}

/**
 * Why opaque art of w x h is too big for sprite `name` on a W x H canvas, or null if it fits.
 * Items must fit the central 12 x 12 (STYLE.md "Item icon"), long items 14 on one axis.
 */
function tooBig(name: string, w: number, h: number, W: number, H: number): string | null {
  if (spriteGroup(name) === 'i') {
    if (LONG_ITEMS.has(name)) {
      const fits = (w <= LONG_ITEM_BOX && h <= ITEM_BOX) || (w <= ITEM_BOX && h <= LONG_ITEM_BOX);
      if (!fits) return `long items fit ${LONG_ITEM_BOX}x${ITEM_BOX} or ${ITEM_BOX}x${LONG_ITEM_BOX} (STYLE.md "Item icon")`;
    } else if (w > ITEM_BOX || h > ITEM_BOX) {
      return `items fit the central ${ITEM_BOX}x${ITEM_BOX} (STYLE.md "Item icon"; 14 on one axis only for steel_beam, drill_bit, cobalt_drill_head, copper_wire)`;
    }
  }
  if (w > W || h > H) return `the sprite's canvas ("size") is ${W}x${H}`;
  return null;
}

function buildSprite(s: SpriteSpec, ctx: string, stats: QuantizeStats): PNG | null {
  let img: PNG;
  try {
    const src = source(s.src);
    img = s.rect ? crop(src, s.rect.x, s.rect.y, s.rect.w, s.rect.h) : clonePng(src);
  } catch (e) {
    fail(`${ctx}: ${message(e)}`);
    return null;
  }
  const where = `${s.src}${s.rect ? ` rect [${s.rect.x}, ${s.rect.y}, ${s.rect.w}, ${s.rect.h}]` : ''}`;
  const opaque = trimAlpha(img);
  if (!opaque) {
    fail(`${ctx}: nothing to draw: every pixel of ${where} has alpha < 128 (50%)`);
    return null;
  }
  if (s.trim) img = crop(img, opaque.x, opaque.y, opaque.w, opaque.h);
  if (s.scale > 1) img = scaleNearest(img, s.scale);

  const [W, H] = s.size;
  const bw = opaque.w * s.scale;
  const bh = opaque.h * s.scale;
  const why = tooBig(s.name, bw, bh, W, H);
  if (why) {
    fail(
      `${ctx}: TOO BIG: opaque art is ${bw}x${bh}${s.scale > 1 ? ` (scale ${s.scale})` : ''} but ${why}. ` +
        `Art is never shrunk or cropped: pick another candidate, fix it in pixelart_workbench, or cut a tighter "rect". ` +
        `Source: ${where}`,
    );
    return null;
  }
  if (img.width > W || img.height > H) {
    // Only with "trim": false: the margins around art that fits are what doesn't.
    fail(
      `${ctx}: with "trim": false the cut is ${img.width}x${img.height}, bigger than the ${W}x${H} canvas, ` +
        `though its opaque art (${bw}x${bh}) fits: drop "trim": false or cut a smaller "rect". Source: ${where}`,
    );
    return null;
  }

  const out = createPng(W, H);
  const dx = Math.floor((W - img.width) / 2);
  const dy = s.fit === 'bottom' ? H - img.height : Math.floor((H - img.height) / 2);
  blit(out, img, dx, dy);
  quantize(out, stats);
  // A light spot glows on the lamp it names, so it must sit on a drawn pixel of the finished sprite.
  for (const l of s.light) {
    const inside = l.x >= 0 && l.y >= 0 && l.x < W && l.y < H;
    if (!inside || out.data[(l.y * W + l.x) * 4 + 3] === 0) {
      fail(
        `${ctx}: light [${l.x}, ${l.y}] is ${inside ? 'a transparent pixel' : `outside the ${W}x${H} sprite`}: ` +
          'light spots are finished sprite pixels on the lamp or window that glows (check it at 4x with art:sheet)',
      );
      return null;
    }
  }
  if (!checkAnchors(s, out, ctx)) return null;
  return out;
}

/** Tile centres along a 48 px side, where chute anchors are measured. */
const CHUTE_CENTRES = [8, 24, 40] as const;

/**
 * Anchors name parts of the art, so a rect anchor must lie on drawn pixels only (fails otherwise), and
 * a chute anchor should be the body's edge where it is measured (warns otherwise: the art moved).
 */
function checkAnchors(s: SpriteSpec, out: PNG, ctx: string): boolean {
  const W = out.width;
  const drawn = (x: number, y: number): boolean => out.data[(y * W + x) * 4 + 3] !== 0;
  for (const key of RECT_ANCHORS) {
    const r = s.anchors[key];
    if (!r) continue;
    let holes = 0;
    for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) if (!drawn(x, y)) holes++;
    if (holes > 0) {
      fail(`${ctx}: "${key}" [${r.join(', ')}] covers ${plural(holes, 'transparent pixel')}: an anchor names drawn art (check it at 4x with art:sheet)`);
      return false;
    }
  }
  const chute = s.anchors.chute;
  if (chute) {
    if (W !== 48 || out.height !== 48) {
      fail(`${ctx}: "chute" anchors are measured on 3x3 (48 x 48) sprites, this one is ${W}x${out.height}`);
      return false;
    }
    const edge = (side: Side, c: number): number => {
      for (let k = 0; k < 48; k++) {
        const [x, y] = side === 'N' ? [c, k] : side === 'S' ? [c, 47 - k] : side === 'W' ? [k, c] : [47 - k, c];
        if (drawn(x, y)) return side === 'N' || side === 'S' ? y : x;
      }
      return -1;
    };
    for (const side of SIDES) {
      const want = chute[side];
      if (!want) continue;
      const got = CHUTE_CENTRES.map((c) => edge(side, c));
      if (got.some((g, k) => g !== want[k])) {
        warn(`${ctx}: chute ${side} is [${want.join(', ')}] but the art's edge there is [${got.join(', ')}] (at ${CHUTE_CENTRES.join(', ')})`);
      }
    }
  }
  return true;
}

function buildTerrain(t: TerrainSpec, ctx: string, stats: QuantizeStats): PNG | null {
  let src: PNG;
  try {
    src = source(t.src);
  } catch (e) {
    fail(`${ctx}: ${message(e)}`);
    return null;
  }
  const byIndex = new Map<number, PNG>();
  let ok = true;
  for (const tile of t.tiles) {
    if (!tile.rect) continue;
    try {
      byIndex.set(tile.index, crop(src, tile.rect.x, tile.rect.y, tile.rect.w, tile.rect.h));
    } catch (e) {
      fail(`${ctx} ${cornerLabel(tile.index)}: ${message(e)}`);
      ok = false;
    }
  }
  if (!ok) return null;
  for (const tile of t.tiles) {
    if (tile.twin !== null) byIndex.set(tile.index, byIndex.get(tile.twin) as PNG);
  }
  const sheet = createPng(t.tile * 4, t.tile * 4);
  for (let i = 0; i < 16; i++) blit(sheet, byIndex.get(i) as PNG, (i % 4) * t.tile, Math.floor(i / 4) * t.tile);
  quantize(sheet, stats);
  const holes = countTransparent(sheet);
  if (holes > 0) warn(`${ctx}: ${holes} transparent pixels; terrain tiles should be fully opaque`);
  return sheet;
}

// ---------------------------------------------------------------------------------------------
// Checks against the art bible (warnings only)

let wanted: Map<string, WantedSprite> | null = null;

function checkOutput(name: string, png: PNG, ctx: string, kind: 'sprite' | 'terrain'): void {
  const box = trimAlpha(png);
  if (!box) warn(`${ctx}: the sprite is fully transparent`);
  const group = spriteGroup(name);
  const want = wanted?.get(name);
  if (wanted && !want) {
    warn(`${ctx}: "${name}" is not a sprite name the game asks for (typo? npm run art:coverage lists them)`);
  }
  if (want?.size && (png.width !== want.size[0] || png.height !== want.size[1])) {
    warn(`${ctx}: ${png.width}x${png.height}, but ${name} is drawn at ${want.size[0]}x${want.size[1]} (STYLE.md "Grid and sizes")`);
  }
  if (group === 'x' && !want && !((png.width === 16 && png.height === 16) || (png.width === 32 && png.height === 32))) {
    warn(`${ctx}: decor props are 16x16 or 32x32, this one is ${png.width}x${png.height}`);
  }
  // (Item art outside the 12 x 12 envelope is an error in buildSprite, not a warning here.)
  if (group === 't' && kind === 'sprite') {
    warn(`${ctx}: terrain belongs under "terrain" (a sprite is not written to public/art/terrain/)`);
  }
}

// ---------------------------------------------------------------------------------------------
// Packing

interface Output {
  name: string;
  png: PNG;
  kind: 'sprite' | 'terrain';
  file: string;
  light: LightSpec[];
  anchors: Anchors;
  /** Terrain only: the set's variantShare, when its entry gives one. */
  variantShare: number | null;
}

interface Placed {
  name: string;
  png: PNG;
  x: number;
  y: number;
}

/** Shelf packer: tallest first, left to right, a new shelf when the row would pass 1024 px. */
function pack(items: Output[]): { width: number; height: number; placed: Placed[] } {
  const sorted = [...items].sort(
    (a, b) => b.png.height - a.png.height || b.png.width - a.png.width || naturalCompare(a.name, b.name),
  );
  const placed: Placed[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  let width = 0;
  for (const it of sorted) {
    const { width: w, height: h } = it.png;
    if (x > 0 && x + w > ATLAS_MAX_W) {
      y += shelf + PAD;
      x = 0;
      shelf = 0;
    }
    placed.push({ name: it.name, png: it.png, x, y });
    width = Math.max(width, x + w);
    x += w + PAD;
    shelf = Math.max(shelf, h);
  }
  return { width: Math.max(1, width), height: Math.max(1, y + shelf), placed };
}

/** One sprite's anchors as compact JSON on one line: {"pit": [x, y, w, h], "chute": {"N": [a, b, c], ...}}. */
function anchorsText(a: Anchors): string {
  const parts: string[] = [];
  for (const key of RECT_ANCHORS) {
    const r = a[key];
    if (r) parts.push(`"${key}": [${r.join(', ')}]`);
  }
  if (a.chute) {
    const sides = SIDES.filter((s) => a.chute?.[s]).map((s) => `"${s}": [${(a.chute?.[s] as number[]).join(', ')}]`);
    parts.push(`"chute": { ${sides.join(', ')} }`);
  }
  return `{ ${parts.join(', ')} }`;
}

const hasAnchors = (a: Anchors | undefined): boolean => !!a && (RECT_ANCHORS.some((k) => a[k]) || !!a.chute);

/**
 * atlas.json with one sprite per line (readable diffs), names in natural order. "lights" maps each
 * sprite that has light spots to [[x, y, "#rrggbb", r], ...] in sprite pixels (src/render/atlas.ts
 * spriteLights reads them); "anchors" each sprite that has any to its pit / bore / core rects and
 * chute edges; "variantShare" each terrain set with floor variants and a share to that share.
 */
function atlasJsonText(
  rects: Map<string, AtlasRect>,
  lights: Map<string, LightSpec[]>,
  anchors: Map<string, Anchors>,
  shares: Map<string, number>,
  built: string,
): string {
  const names = [...rects.keys()].sort(naturalCompare);
  const block = (key: string, lines: string[]): string => (lines.length === 0 ? `  "${key}": {}` : `  "${key}": {\n${lines.join(',\n')}\n  }`);
  const spriteLines = names.map((n) => {
    const r = rects.get(n) as AtlasRect;
    return `    ${JSON.stringify(n)}: { "x": ${r.x}, "y": ${r.y}, "w": ${r.w}, "h": ${r.h} }`;
  });
  const lightLines = names
    .filter((n) => (lights.get(n)?.length ?? 0) > 0)
    .map((n) => `    ${JSON.stringify(n)}: [${(lights.get(n) as LightSpec[]).map((l) => `[${l.x}, ${l.y}, "${l.color}", ${l.r}]`).join(', ')}]`);
  const anchorLines = names.filter((n) => hasAnchors(anchors.get(n))).map((n) => `    ${JSON.stringify(n)}: ${anchorsText(anchors.get(n) as Anchors)}`);
  const shareLines = [...shares.keys()].sort(naturalCompare).map((n) => `    ${JSON.stringify(n)}: ${shares.get(n)}`);
  return (
    `{\n${block('sprites', spriteLines)},\n${block('lights', lightLines)},\n${block('anchors', anchorLines)},\n` +
    `${block('variantShare', shareLines)},\n  "built": ${JSON.stringify(built)}\n}\n`
  );
}

// ---------------------------------------------------------------------------------------------
// Main

interface BatchSummary {
  file: string;
  batch: string;
  sprites: number;
  terrain: number;
  stats: QuantizeStats;
}

/** Warn when snapping to Apollo moved more than FAR_SHARE of the opaque pixels far. */
function checkFar(stats: QuantizeStats, ctx: string): void {
  if (stats.opaque > 0 && stats.far / stats.opaque > FAR_SHARE) {
    warn(
      `${ctx}: ${percent(stats.far, stats.opaque, 1)} of its pixels (${stats.far}) moved far (OKLab dE > ${FAR_DELTA}) ` +
        `when snapped to Apollo: the art ignored the palette; check it at 1x (art:sheet) or pick another candidate`,
    );
  }
}

function main(argv: string[]): number {
  const check = argv.includes('--check');
  const verbose = argv.includes('--verbose') || argv.includes('-v');
  let recipesDir = RECIPES_DIR;
  const unknown: string[] = [];
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === '--recipes') {
      const dir = argv[++k];
      if (dir === undefined || dir.startsWith('--')) {
        console.error(`art:build: --recipes needs a folder\n${USAGE}`);
        return 2;
      }
      recipesDir = fromRoot(dir);
    } else if (!['--check', '--verbose', '-v'].includes(a)) {
      unknown.push(a);
    }
  }
  if (unknown.length > 0) {
    console.error(`art:build: unknown option ${unknown.join(' ')}\n${USAGE}`);
    return 2;
  }
  if (recipesDir !== RECIPES_DIR && !check) {
    console.error(`art:build: --recipes only works with --check (the atlas is built from ${rel(RECIPES_DIR)}/ only)`);
    return 2;
  }

  try {
    wanted = new Map(wantedSprites().map((w) => [w.name, w]));
  } catch (e) {
    warn(`can't check sprite names and sizes against src/data: ${message(e)}`);
  }

  const outputs = new Map<string, Output>();
  const summaries: BatchSummary[] = [];
  const verboseLines: string[] = [];

  const addOutput = (o: Output, ctx: string): void => {
    const prev = outputs.get(o.name);
    if (prev) {
      warn(
        prev.file === o.file
          ? `${ctx}: "${o.name}" is listed twice in ${o.file}; the later entry wins`
          : `${ctx}: overrides "${o.name}" from ${prev.file}`,
      );
    }
    outputs.set(o.name, o);
  };

  const recipeFiles = existsSync(recipesDir)
    ? readdirSync(recipesDir)
        .filter((f) => f.toLowerCase().endsWith('.json'))
        .sort(naturalCompare)
    : [];

  for (const file of recipeFiles) {
    let recipe: unknown;
    try {
      recipe = JSON.parse(readFileSync(join(recipesDir, file), 'utf8'));
    } catch (e) {
      fail(`${file}: not valid JSON: ${message(e)}`);
      continue;
    }
    if (!isObj(recipe)) {
      fail(`${file}: a recipe is a JSON object with "batch", "sprites" and/or "terrain"`);
      continue;
    }
    checkKeys(recipe, ['batch', 'sprites', 'terrain'], file);
    let batch = basename(file, '.json');
    if (typeof recipe.batch === 'string' && recipe.batch !== '') batch = recipe.batch;
    else warn(`${file}: no "batch" name; using "${batch}"`);

    const summary: BatchSummary = { file, batch, sprites: 0, terrain: 0, stats: newQuantizeStats() };
    summaries.push(summary);
    const sprites: unknown = recipe.sprites ?? [];
    const terrain: unknown = recipe.terrain ?? [];
    if (!Array.isArray(sprites)) fail(`${file}: "sprites" must be a list`);
    if (!Array.isArray(terrain)) fail(`${file}: "terrain" must be a list`);
    if (Array.isArray(sprites) && Array.isArray(terrain) && sprites.length + terrain.length === 0) {
      warn(`${file}: no sprites and no terrain`);
    }

    if (Array.isArray(sprites)) {
      sprites.forEach((v: unknown, k: number) => {
        const spec = parseSprite(v, `${file} sprites[${k}]`);
        if (!spec) return;
        const ctx = `${file} ${spec.name}`;
        const stats = newQuantizeStats();
        const png = buildSprite(spec, ctx, stats);
        if (!png) return;
        addQuantizeStats(summary.stats, stats);
        checkOutput(spec.name, png, ctx, 'sprite');
        checkFar(stats, ctx);
        addOutput({ name: spec.name, png, kind: 'sprite', file, light: spec.light, anchors: spec.anchors, variantShare: null }, ctx);
        summary.sprites++;
        if (verbose) {
          const r = spec.rect ? ` [${spec.rect.x}, ${spec.rect.y}, ${spec.rect.w}, ${spec.rect.h}]` : '';
          const box = trimAlpha(png);
          const light = spec.light.map((l) => `light ${l.x},${l.y} ${l.color}`).join(', ');
          const flags = [spec.trim ? '' : 'no trim', spec.scale > 1 ? `scale ${spec.scale}` : '', spec.fit, light]
            .filter((x) => x !== '')
            .join(', ');
          verboseLines.push(
            `  ${spec.name.padEnd(28)} ${`${png.width}x${png.height}`.padEnd(8)} ` +
              `${(box ? `art ${box.w}x${box.h}` : 'empty').padEnd(12)} ` +
              `${percent(stats.snapped, stats.opaque).padStart(4)} snapped ${percent(stats.far, stats.opaque).padStart(4)} far  ` +
              `<- ${spec.src}${r}${flags ? ` (${flags})` : ''}`,
          );
        }
      });
    }

    if (Array.isArray(terrain)) {
      terrain.forEach((v: unknown, k: number) => {
        const spec = parseTerrain(v, `${file} terrain[${k}]`);
        if (!spec) return;
        const ctx = `${file} ${spec.name}`;
        const stats = newQuantizeStats();
        const png = buildTerrain(spec, ctx, stats);
        if (!png) return;
        addQuantizeStats(summary.stats, stats);
        checkOutput(spec.name, png, ctx, 'terrain');
        checkFar(stats, ctx);
        addOutput({ name: spec.name, png, kind: 'terrain', file, light: [], anchors: {}, variantShare: spec.variantShare }, ctx);
        summary.terrain++;
        const twins = spec.tiles.filter((t) => t.twin !== null).map((t) => cornerLabel(t.index));
        if (twins.length > 0) warn(`${ctx}: filled from a twin: ${twins.join(', ')}`);
        if (verbose) {
          verboseLines.push(
            `  ${spec.name.padEnd(28)} ${`${png.width}x${png.height}`.padEnd(8)} ${'terrain'.padEnd(12)} ` +
              `${percent(stats.snapped, stats.opaque).padStart(4)} snapped ${percent(stats.far, stats.opaque).padStart(4)} far  ` +
              `<- ${spec.src}`,
          );
        }
      });
    }
  }

  const drift = paletteDrift();
  if (drift) warn(drift);

  // Floor-variant shares: a set's share goes to atlas.json only when the set has variants.
  const shares = new Map<string, number>();
  for (const o of outputs.values()) {
    if (o.kind !== 'terrain' || VARIANT_RE.test(o.name)) continue;
    const variants = [...outputs.keys()].filter((n) => n.startsWith(`${o.name}_v`) && VARIANT_RE.test(n) && n.replace(VARIANT_RE, '') === o.name);
    if (o.variantShare !== null && variants.length === 0) warn(`${o.file} ${o.name}: "variantShare" ${o.variantShare} but the set has no floor variants (${o.name}_v1 ...)`);
    else if (o.variantShare === null && variants.length > 0) warn(`${o.file} ${o.name}: ${plural(variants.length, 'floor variant')} but no "variantShare" (the renderer's default applies)`);
    else if (o.variantShare !== null) shares.set(o.name, o.variantShare);
  }

  // Report
  const all = [...outputs.values()];
  const nSprites = all.filter((o) => o.kind === 'sprite').length;
  const terrains = all.filter((o) => o.kind === 'terrain').sort((a, b) => naturalCompare(a.name, b.name));
  const bullet = (items: string[], mark: string): string => items.map((m) => `  ${mark} ${m}`).join('\n');

  console.log(
    `art:build: ${plural(recipeFiles.length, 'recipe')} in ${rel(recipesDir)}/ -> ` +
      `${plural(nSprites, 'sprite')}, ${plural(terrains.length, 'terrain set')}`,
  );
  for (const s of summaries) {
    const counts = plural(s.sprites, 'sprite') + (s.terrain ? `, ${s.terrain} terrain` : '');
    const snap =
      s.stats.opaque === 0
        ? ''
        : `${percent(s.stats.snapped, s.stats.opaque, 1)} of pixels snapped to Apollo` +
          (s.stats.snapped ? ` (furthest: OKLab dE ${s.stats.maxDelta.toFixed(3)})` : '') +
          `; ${s.stats.far} px (${percent(s.stats.far, s.stats.opaque, 1)}) moved far (dE > ${FAR_DELTA})` +
          (s.stats.partialAlpha ? `; ${s.stats.partialAlpha} half-transparent px made solid or clear` : '');
    console.log(`  ${s.batch.padEnd(16)} ${s.file.padEnd(24)} ${counts.padEnd(22)} ${snap}`.trimEnd());
  }
  if (recipeFiles.length === 0) console.log('  (no recipes yet: add art/recipes/<batch>.json, see STYLE.md "Pipeline")');
  if (verbose && verboseLines.length > 0) console.log(verboseLines.join('\n'));
  if (warnings.length > 0) console.log(`Warnings (${warnings.length}):\n${bullet(warnings, '-')}`);

  if (errors.length > 0) {
    console.error(`art:build failed with ${plural(errors.length, 'error')}; nothing was written:`);
    console.error(bullet(errors, 'x'));
    return 1;
  }

  // Pack and write
  const atlas = pack(all);
  const atlasPng = createPng(atlas.width, atlas.height);
  const rects = new Map<string, AtlasRect>();
  let used = 0;
  for (const p of atlas.placed) {
    blit(atlasPng, p.png, p.x, p.y);
    rects.set(p.name, { x: p.x, y: p.y, w: p.png.width, h: p.png.height });
    used += p.png.width * p.png.height;
  }
  const n = atlas.placed.length;
  const about = `${atlas.width}x${atlas.height} (${n} ${n === 1 ? 'entry' : 'entries'}, ${percent(used, atlas.width * atlas.height)} filled)`;

  if (check) {
    console.log(`Check only, nothing written. The atlas would be ${about}.`);
  } else {
    mkdirSync(TERRAIN_DIR, { recursive: true });
    writePng(ATLAS_PNG, atlasPng);
    writeFileSync(
      ATLAS_JSON,
      atlasJsonText(rects, new Map(all.map((o) => [o.name, o.light])), new Map(all.map((o) => [o.name, o.anchors])), shares, new Date().toISOString()),
    );
    console.log(`Wrote ${rel(ATLAS_PNG)} ${about} and ${rel(ATLAS_JSON)}`);
    for (const t of terrains) {
      const path = join(TERRAIN_DIR, `${t.name}.png`);
      writePng(path, t.png);
      console.log(`Wrote ${rel(path)} (${t.png.width}x${t.png.height})`);
    }
  }

  // Terrain sheets nobody made any more are reported, never deleted (someone may have put them there).
  if (existsSync(TERRAIN_DIR)) {
    for (const f of readdirSync(TERRAIN_DIR)) {
      if (f.toLowerCase().endsWith('.png') && !terrains.some((t) => `${t.name}.png` === f)) {
        console.log(`Note: ${rel(join(TERRAIN_DIR, f))} was not made by any recipe (stale? left in place)`);
      }
    }
  }

  if (wanted) {
    const needed = [...wanted.values()].filter((w) => !w.optional);
    const covered = needed.filter((w) => outputs.has(w.name)).length;
    console.log(
      `Coverage: ${covered}/${needed.length} sprite names the game asks for (${percent(covered, needed.length)}); ` +
        'npm run art:coverage lists the missing ones.',
    );
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
