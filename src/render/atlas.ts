// Sprites by name: PixelLab art from public/art/atlas.{png,json} when present, otherwise the
// code-drawn fallback (src/render/fallback.ts). The game always runs with or without art.

import { fallbackLights, makeFallback } from './fallback';

export interface Sprite {
  img: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when this is real art from the atlas. */
  art: boolean;
}

const cache = new Map<string, Sprite | null>();
let atlasImg: HTMLImageElement | null = null;
let atlasMap: Record<string, { x: number; y: number; w: number; h: number }> = {};
/** atlas.json "lights": each art sprite's light spots, [x, y, "#rrggbb", r] in sprite pixels (scripts/art/build.ts). */
let atlasLights: Record<string, unknown> = {};
/**
 * atlas.json "anchors": rectangles a recipe records on its art, `{ "<sprite name>": { "pit": [x, y, w, h] } }`
 * in sprite pixels, from the recipe that wins for that name (scripts/art/build.ts). Optional: an
 * atlas without them still draws, with the code-drawn sprites' own positions.
 */
let atlasAnchors: Record<string, unknown> = {};
/** atlas.json "variantShare": per terrain set, the share of plain tiles drawn from its variants (0..1). */
let atlasShares: Record<string, unknown> = {};
const terrain = new Map<string, HTMLImageElement>();
const variants = new Map<string, HTMLImageElement[]>();
let titleArt: HTMLImageElement | null = null;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * The ten dual-grid sets (STYLE "Terrain: the dual grid"). scripts/art/lib.ts readTerrainSets reads
 * this list for art:coverage, so it holds only names the art plan makes.
 */
export const TERRAIN_SETS = [
  't_l0_ground_rock',
  't_l1_floor_rock',
  't_l2_floor_rock',
  't_l2_floor_water',
  't_l3_floor_rock',
  't_l4_floor_rock',
  't_l4_floor_hot',
  't_l4_hot_magma',
  't_l5_floor_rock',
  't_l5_floor_conduit',
];

/**
 * Floor variants per set (STYLE "Floor variety"): `<set>_v1` .. `<set>_v<n>`, copies of the sheet
 * with only its plain tiles edited (0, all lower, and 15, all upper: a crack, a fleck of moss), which
 * the terrain pass scatters among the plain ones. Optional: a set has as many as the art build made.
 * scripts/art/lib.ts reads this number too, so art:build and art:coverage accept those names.
 */
export const TERRAIN_VARIANTS = 3;

/** Load the atlas, terrain sheets and floor variants if they exist. Safe to call when there is no art yet. */
export async function loadArt(): Promise<void> {
  try {
    const res = await fetch(`./art/atlas.json?v=${Date.now()}`);
    if (res.ok) {
      const json = await res.json();
      const img = await loadImage(`./art/atlas.png?v=${Date.now()}`);
      if (img && json?.sprites) {
        atlasImg = img;
        atlasMap = json.sprites;
        atlasLights = json.lights && typeof json.lights === 'object' ? json.lights : {};
        atlasAnchors = json.anchors && typeof json.anchors === 'object' ? json.anchors : {};
        atlasShares = json.variantShare && typeof json.variantShare === 'object' ? json.variantShare : {};
      }
    }
  } catch {
    // no art yet
  }
  const sheet = async (name: string): Promise<HTMLImageElement | null> => {
    const img = await loadImage(`./art/terrain/${name}.png`);
    return img && img.width === 64 && img.height === 64 ? img : null;
  };
  await Promise.all(
    TERRAIN_SETS.map(async (name) => {
      const img = await sheet(name);
      if (img) terrain.set(name, img);
      // Only the variants the art build made (they are in atlas.json too), so nothing is asked for
      // that isn't there.
      const names: string[] = [];
      for (let k = 1; k <= TERRAIN_VARIANTS; k++) if (atlasMap[`${name}_v${k}`]) names.push(`${name}_v${k}`);
      const vs = await Promise.all(names.map(sheet));
      variants.set(name, vs.filter((v): v is HTMLImageElement => v !== null));
    }),
  );
  // The title art is packed into the atlas like any other sprite (STYLE "Grid and sizes"; there is
  // no separate title file). The title screen scales it as a whole image, so it is cut out of the
  // atlas here, locally: nothing else is requested.
  const t = atlasMap.title_art;
  titleArt = t && atlasImg ? await cutOut(atlasImg, t) : null;
  cache.clear();
  lightCache.clear();
  boxCache.clear();
  anchorCache.clear();
  chuteEdgeCache.clear();
}

/** One rectangle of the atlas as an image of its own, made from a canvas (no request); null if it can't be read back. */
async function cutOut(img: HTMLImageElement, r: { x: number; y: number; w: number; h: number }): Promise<HTMLImageElement | null> {
  const c = document.createElement('canvas');
  c.width = r.w;
  c.height = r.h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  try {
    return await loadImage(c.toDataURL('image/png'));
  } catch {
    return null;
  }
}

export function sprite(name: string): Sprite | null {
  if (cache.has(name)) return cache.get(name)!;
  let s: Sprite | null = null;
  const a = atlasMap[name];
  if (a && atlasImg) {
    s = { img: atlasImg, x: a.x, y: a.y, w: a.w, h: a.h, art: true };
  } else {
    const c = makeFallback(name);
    if (c) s = { img: c, x: 0, y: 0, w: c.width, h: c.height, art: false };
  }
  cache.set(name, s);
  return s;
}

export function hasArt(name: string): boolean {
  return !!atlasMap[name];
}

/** A rectangle in sprite pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxCache = new Map<string, Box | null>();

/**
 * The bounding box of a sprite's visible pixels, in sprite pixels: null for a sprite with none (or
 * no sprite). Read back once per name; if the pixels can't be read, the whole sprite counts.
 */
export function spriteBox(name: string): Box | null {
  if (boxCache.has(name)) return boxCache.get(name)!;
  const s = sprite(name);
  let box: Box | null = null;
  if (s) {
    box = { x: 0, y: 0, w: s.w, h: s.h };
    const c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      try {
        ctx.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
        const d = ctx.getImageData(0, 0, s.w, s.h).data;
        let x0 = s.w;
        let y0 = s.h;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < s.h; y++) {
          for (let x = 0; x < s.w; x++) {
            if (d[(y * s.w + x) * 4 + 3] === 0) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            y1 = y;
          }
        }
        box = x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      } catch {
        // unreadable pixels: keep the whole sprite
      }
    }
  }
  boxCache.set(name, box);
  return box;
}

const anchorCache = new Map<string, Box | null>();

/** Per side (N, E, S, W): the art body's edge pixel at each footprint tile along that side. */
export type ChuteEdges = Partial<Record<'N' | 'E' | 'S' | 'W', number[]>>;
const chuteEdgeCache = new Map<string, ChuteEdges | null>();

/**
 * The `chute` anchor of sprite `name` (atlas.json "anchors"): per side, the first drawn pixel in from
 * that side at each footprint tile's centre (y for N and S, x for E and W; scripts/art/build.ts). Art
 * that stands inside its footprint uses it to carry a chute across the empty margin. Null for
 * code-drawn sprites and art without the anchor.
 */
export function spriteChuteEdges(name: string): ChuteEdges | null {
  if (chuteEdgeCache.has(name)) return chuteEdgeCache.get(name)!;
  let out: ChuteEdges | null = null;
  const s = sprite(name);
  const rec = atlasAnchors[name];
  const v = s?.art && rec && typeof rec === 'object' ? (rec as Record<string, unknown>).chute : undefined;
  if (s && v && typeof v === 'object') {
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const a = (v as Record<string, unknown>)[side];
      if (Array.isArray(a) && a.length > 0 && a.every((n) => Number.isInteger(n) && n >= 0 && n <= Math.max(s.w, s.h))) (out ??= {})[side] = a as number[];
    }
  }
  chuteEdgeCache.set(name, out);
  return out;
}

/**
 * A rectangle the art's recipe anchored on sprite `name` (atlas.json "anchors"), such as the elevator
 * station's `pit`, in sprite pixels. Null for code-drawn sprites (their layout is the code's own), for
 * art without that anchor, and for anything malformed or outside the sprite. Cached per name and key.
 */
export function spriteAnchor(name: string, key: string): Box | null {
  const ck = `${name}|${key}`;
  if (anchorCache.has(ck)) return anchorCache.get(ck)!;
  let box: Box | null = null;
  const s = sprite(name);
  const rec = atlasAnchors[name];
  const v = s?.art && rec && typeof rec === 'object' ? (rec as Record<string, unknown>)[key] : undefined;
  if (s && Array.isArray(v) && v.length === 4 && v.every((n) => Number.isInteger(n))) {
    const [x, y, w, h] = v as number[];
    if (w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= s.w && y + h <= s.h) box = { x, y, w, h };
  }
  anchorCache.set(ck, box);
  return box;
}

/** A light spot in sprite pixels: centre, suggested glow radius and its Apollo colour. */
export type LightSpot = ReturnType<typeof fallbackLights>[number];

const lightCache = new Map<string, readonly LightSpot[]>();

/**
 * The light spots (furnace mouth, lamp, coil) the renderer glows while a building works (STYLE
 * Perspective: "every machine has a light source spot"). Code-drawn sprites record theirs; atlas art
 * brings the ones its recipe placed on the lit lamp or window (atlas.json "lights"), and art without
 * any gets no glow rather than a misplaced one. Cached per name.
 */
export function spriteLights(name: string): readonly LightSpot[] {
  let l = lightCache.get(name);
  if (!l) {
    const s = sprite(name);
    l = !s ? [] : s.art ? artLights(name) : fallbackLights(name);
    lightCache.set(name, l);
  }
  return l;
}

/** An art sprite's light spots from atlas.json; anything malformed is left out. */
function artLights(name: string): LightSpot[] {
  const list = atlasLights[name];
  if (!Array.isArray(list)) return [];
  const out: LightSpot[] = [];
  for (const v of list) {
    if (!Array.isArray(v)) continue;
    const [x, y, color, r] = v as unknown[];
    if (typeof x === 'number' && typeof y === 'number' && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
      out.push({ x, y, r: typeof r === 'number' ? r : 3, color: color.toLowerCase() });
    }
  }
  return out;
}

export function terrainSheet(name: string): HTMLImageElement | null {
  return terrain.get(name) ?? null;
}

/** The floor variant sheets of a terrain set (none when the art has none, or the set itself is missing). */
export function terrainVariants(name: string): readonly HTMLImageElement[] {
  return terrain.has(name) ? (variants.get(name) ?? []) : [];
}

/** The share of a set's plain tiles its variants take (atlas.json "variantShare"), or null to use the default. */
export function terrainVariantShare(name: string): number | null {
  const v = atlasShares[name];
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : null;
}

/** The atlas sprite `title_art` as an image of its own (cut out by loadArt); null when the atlas has none. */
export function getTitleArt(): HTMLImageElement | null {
  return titleArt;
}

export function drawSprite(ctx: CanvasRenderingContext2D, name: string, x: number, y: number): boolean {
  const s = sprite(name);
  if (!s) return false;
  ctx.drawImage(s.img, s.x, s.y, s.w, s.h, Math.round(x), Math.round(y), s.w, s.h);
  return true;
}
