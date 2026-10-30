// Code-drawn placeholder pixel art for every sprite the game asks for by name (STYLE.md).
// It is what players see wherever the PixelLab atlas has no sprite, so it follows the art bible:
// Apollo colors only, light from the upper left, selective dark outline (#090a14 / #151d28),
// and the item language (raw lumps -> bars -> crisp parts -> glowing exotics).
//
// Machine families (STYLE "Machine families"): each family's accent is a colour and a pattern,
// and no sprite borrows another family's: Extraction hazard stripes on the rim (Miner, Harvester,
// Spore Collector), Company flat #de9e41 roof panels with #ebede9 stencils (HQ, Depot, Terminal,
// Elevator, Assay Lab, Company Chute), Fabrication steel with #be772b rivet dots, Chemistry glass
// tanks of amber or lime fluid, Heat brick with a #e8c170 mouth on the top face, Power an iron
// drum with copper pipes and a smokestack, Crystal dark steel with #73bed3 coils, Alien stone with
// #a4dddb light. South faces are plain plating; every light spot sits on the top face.
//
// Decor is always dull (STYLE "Deposits and decor", DECISIONS 33): its layer's floor and wall
// colours plus at most one muted accent that is no ore's colour, no glow, no light, a soft
// shadow-side edge, so it never competes with deposits, conduits or machines. Decor never uses
// the darkness tint #090a14 (STYLE: never a terrain or decor fill), so a prop never reads as a
// hole into unrevealed rock. The amber-sealed rock at the Shallows bore site (AMBER_SPRITE) is
// the one exception to the colour rule, on purpose.
//
// Everything is drawn into an indexed pixel buffer (palette indices, whole pixels, no
// anti-aliasing, own pixel line/circle/polygon helpers) and copied into a fresh canvas with
// putImageData, so no smoothing or blending can ever touch it.
//
// Names (see fallbackNames()):
//   b_<building id>        size*16 square, every BUILDING_LIST id except belts
//   b_drill_broken         80, the drill rig before repair
//   b_heart_dormant        112, the Heart asleep
//   i_<item id>            16, art inside the central 12x12 (beams 14 wide)
//   d_<ore>_<1|2|3>        16, transparent deposit decal drawn over floor tiles
//   x_l<layer>_<name>      every name in LAYERS[layer].decor, plus AMBER_SPRITE: transparent
//                          decor, 16 or 32 square (DECOR_ART), drawn bottom-centred on its tile
//                          with its foot on the bottom rows; 32 px props stand 24-28 px tall
//   p_mags                 48, Mags Okafor on the radio
// Buildings, items, ores and decor added to the data later get a generic sprite in their
// family's or layer's colors.
//
// API: makeFallback(name) -> new canvas | null; fallbackNames(); fallbackPixels(name) -> RGBA
// without the DOM (tests, scripts); fallbackLights(name) -> a machine's light spots (furnace
// mouth, lamp, coil, core) in sprite pixels, for the renderer's glow while it works. Every
// machine, miner, collector, filter, generator, tap, lab, lamp and big building has at least one
// (the Sequencer has its two side lamps); the other logistics pieces, foundations, the broken
// Drill, the dormant Heart and all decor have none.

import { APOLLO, C, hexToRgb } from '../data/palette';
import { BUILDING_LIST, type BuildingDef } from '../data/buildings';
import { ITEM_LIST, type ItemDef } from '../data/items';
import { AMBER_SPRITE, LAYERS } from '../data/layers';

// =============================================================================================
// Palette
// =============================================================================================

const RGB: [number, number, number][] = APOLLO.map((h) => hexToRgb(h));
const INDEX = new Map<string, number>(APOLLO.map((h, i): [string, number] => [h.toLowerCase(), i]));

/** Apollo index of a hex color. Anything outside the palette snaps to the nearest entry. */
function pal(hex: string): number {
  const hit = INDEX.get(hex.toLowerCase());
  if (hit !== undefined) return hit;
  const [r, g, b] = hexToRgb(hex);
  let best = 0;
  let bestD = Infinity;
  RGB.forEach(([R, G, B], i) => {
    const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

type ColorName = keyof typeof C;
/** Palette indices by the names in palette.ts (K.steel, K.gold, ...). */
const K = Object.fromEntries((Object.keys(C) as ColorName[]).map((k) => [k, pal(C[k])])) as Record<ColorName, number>;

type Ramp = readonly number[];

/** Material ramps, shadow -> light (STYLE.md "Material ramps"); one-off ramps are written inline. */
const R = {
  steel: [K.panel2, K.slate, K.steel, K.steel2, K.steel3, K.silver, K.white],
  dark: [K.ink, K.night, K.panel, K.panel2, K.slate, K.steel, K.steel2],
  brass: [K.plum, K.rust0, K.rust1, K.amber, K.gold, K.pale],
  paint: [K.plum, K.rust0, K.rust1, K.amber, K.gold, K.pale],
  copper: [K.earth0, K.earth1, K.earth2, K.orange, K.pale],
  heat: [K.wine0, K.wine1, K.crimson, K.red, K.coral, K.orange, K.pale],
  cobalt: [K.navy, K.blue1, K.blue2, K.blue3, K.cyan, K.ice],
  alien: [K.ink, K.pine, K.panel2, K.slate, K.steel, K.steel2, K.steel3],
  wood: [K.plum, K.earth0, K.earth1, K.earth2, K.earth3, K.sand],
} as const satisfies Record<string, Ramp>;

/** Ramp color with the index clamped into the ramp. */
function rc(r: Ramp, i: number): number {
  return r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];
}

/** Color at brightness t (0..1) along a ramp. */
function rt(r: Ramp, t: number): number {
  return r[Math.max(0, Math.min(r.length - 1, Math.floor(t * r.length)))];
}

// =============================================================================================
// Deterministic noise (every sprite looks the same every time it is made)
// =============================================================================================

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small seeded generator in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash of a pixel to [0, 1). */
function h2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1): blobs about `cell` pixels across. */
function vnoise(x: number, y: number, cell: number, s: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h2(gx, gy, s) + (h2(gx + 1, gy, s) - h2(gx, gy, s)) * sx;
  const b = h2(gx, gy + 1, s) + (h2(gx + 1, gy + 1, s) - h2(gx, gy + 1, s)) * sx;
  return a + (b - a) * sy;
}

// =============================================================================================
// Pixel buffer and drawing helpers
// =============================================================================================

const CLEAR = -1;

/** A spot the renderer can light up while the machine works (furnace mouth, lamp, coil). */
export interface FallbackLight {
  x: number;
  y: number;
  /** Suggested glow radius in pixels. */
  r: number;
  /** Apollo hex color of the glow. */
  color: string;
}

type Pt = readonly [number, number];

/** True when pixel (i, j) of a w x h box lies inside the ellipse inscribed in that box. */
function inEll(i: number, j: number, w: number, h: number, k = 1): boolean {
  if (i < 0 || j < 0 || i >= w || j >= h) return false;
  const dx = (i + 0.5 - w / 2) / (w / 2);
  const dy = (j + 0.5 - h / 2) / (h / 2);
  return dx * dx + dy * dy <= k;
}

class Pix {
  readonly w: number;
  readonly h: number;
  /** Palette index per pixel, CLEAR for transparent. */
  readonly a: Int8Array;
  readonly lights: FallbackLight[] = [];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.a = new Int8Array(w * h).fill(CLEAR);
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return CLEAR;
    return this.a[y * this.w + x];
  }

  on(x: number, y: number): boolean {
    return this.get(x, y) !== CLEAR;
  }

  /** One pixel; c = CLEAR erases. */
  px(x: number, y: number, c: number): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    this.a[yi * this.w + xi] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  hl(x0: number, x1: number, y: number, c: number): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, c);
  }

  vl(x: number, y0: number, y1: number, c: number): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.px(x, y, c);
  }

  /** Bresenham line, whole pixels. */
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const sx = x < xe ? 1 : -1;
    const dy = -Math.abs(ye - y);
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x, y, c);
      if (x === xe && y === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Filled ellipse inscribed in the box (x, y, w, h). k > 1 fattens small circles. */
  ell(x: number, y: number, w: number, h: number, c: number, k = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (inEll(i, j, w, h, k)) this.px(x + i, y + j, c);
  }

  /** 1 px ring: the edge of ell(x, y, w, h). */
  ring(x: number, y: number, w: number, h: number, c: number, k = 1): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!inEll(i, j, w, h, k)) continue;
        if (!inEll(i - 1, j, w, h, k) || !inEll(i + 1, j, w, h, k) || !inEll(i, j - 1, w, h, k) || !inEll(i, j + 1, w, h, k)) {
          this.px(x + i, y + j, c);
        }
      }
    }
  }

  /** Scanline polygon fill over pixel centers (vertices on pixel corners). */
  poly(pts: readonly Pt[], c: number): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [xa, ya] = pts[i];
        const [xb, yb] = pts[(i + 1) % pts.length];
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) xs.push(xa + ((yc - ya) * (xb - xa)) / (yb - ya));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.px(x, y, c);
      }
    }
  }

  /** Stamp a small hand-placed pattern; characters missing from the key are skipped. */
  stamp(x: number, y: number, rows: readonly string[], key: Readonly<Record<string, number>>): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = key[row[i]];
        if (c !== undefined) this.px(x + i, y + j, c);
      }
    });
  }

  /** Paint a box with a per-pixel function; null leaves the pixel alone. */
  paint(x: number, y: number, w: number, h: number, f: (x: number, y: number) => number | null): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const c = f(x + i, y + j);
        if (c !== null) this.px(x + i, y + j, c);
      }
    }
  }

  /**
   * Selective 1 px outline around everything drawn so far: `lit` where the outline sits above or
   * left of the shape (the lit side), `dark` below and right of it.
   */
  outline(lit: number, dark: number): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.on(x, y)) continue;
        if (this.on(x - 1, y) || this.on(x, y - 1)) add.push(x, y, dark);
        else if (this.on(x + 1, y) || this.on(x, y + 1)) add.push(x, y, lit);
      }
    }
    for (let i = 0; i < add.length; i += 3) this.px(add[i], add[i + 1], add[i + 2]);
  }

  /** Copy every drawn pixel of another buffer onto this one. */
  blit(src: Pix, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.on(x, y)) this.px(dx + x, dy + y, src.get(x, y));
  }

  /** Record the light spot the renderer may glow. */
  light(x: number, y: number, r: number, c: number): void {
    this.lights.push({ x, y, r, color: APOLLO[c] });
  }
}

/** Brightness 0..1 of a sphere point (nx, ny in -1..1 across it) lit from the upper left. */
function sphereLight(nx: number, ny: number): number {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const l = -0.48 * nx - 0.58 * ny + 0.66 * nz;
  return Math.max(0, Math.min(0.999, (l + 0.32) / 1.3));
}

/** Shade a mask (any drawn pixels of m) onto p as one rounded volume lit from the upper left. */
function shadeMask(p: Pix, m: Pix, r: Ramp, bias = 0): void {
  let x0 = m.w;
  let y0 = m.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.on(x, y)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return;
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;
  const rx = (x1 - x0 + 1) / 2;
  const ry = (y1 - y0 + 1) / 2;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!m.on(x, y)) continue;
      const t = sphereLight((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) + bias;
      p.px(x, y, rt(r, t));
    }
  }
}

/** Cylinder band across a width: +1 lit band, 0 body, -1 shadow side (light from the left). */
function cylBand(i: number, w: number): number {
  const t = (i + 0.5) / w;
  if (t < 0.14) return 0;
  if (t < 0.42) return 1;
  if (t < 0.74) return 0;
  return -1;
}

// =============================================================================================
// Machine parts
// =============================================================================================

/**
 * A 3/4 box: a top face `top` rows tall, then a south face `front` rows tall below it.
 * `b` is the ramp index of the top face; edges and the south face are shaded from it.
 */
function block(p: Pix, x: number, y: number, w: number, top: number, front: number, r: Ramp, b: number): void {
  p.rect(x, y, w, top, rc(r, b));
  p.hl(x, x + w - 1, y, rc(r, b + 1));
  p.vl(x, y, y + top - 1, rc(r, b + 1));
  p.vl(x + w - 1, y + 1, y + top - 1, rc(r, b - 1));
  if (front <= 0) return;
  p.hl(x, x + w - 2, y + top - 1, rc(r, b + 1));
  p.rect(x, y + top, w, front, rc(r, b - 1));
  p.vl(x, y + top, y + top + front - 1, rc(r, b));
  p.vl(x + w - 1, y + top, y + top + front - 1, rc(r, b - 2));
  p.hl(x, x + w - 1, y + top + front - 1, rc(r, b - 2));
}

/** Same as block() but the top face is an octagon (corners cut by `cut` pixels). */
function octBlock(p: Pix, x: number, y: number, w: number, top: number, front: number, cut: number, r: Ramp, b: number): void {
  const m = new Pix(p.w, p.h);
  const yb = y + top + front;
  m.poly([[x + cut, y], [x + w - cut, y], [x + w, y + cut], [x + w, yb - cut], [x + w - cut, yb], [x + cut, yb], [x, yb - cut], [x, y + cut]], 0);
  for (let j = 0; j < top + front; j++) {
    for (let i = 0; i < w; i++) {
      const X = x + i;
      const Y = y + j;
      if (!m.on(X, Y)) continue;
      const front_ = j >= top;
      let c = front_ ? rc(r, b - 1) : rc(r, b);
      const up = !m.on(X, Y - 1);
      const left = !m.on(X - 1, Y);
      const right = !m.on(X + 1, Y);
      const down = !m.on(X, Y + 1);
      if (!front_) {
        if (up || left) c = rc(r, b + 1);
        else if (right) c = rc(r, b - 1);
        if (j === top - 1 && !left && !right) c = rc(r, b + 1);
      } else {
        if (down || right) c = rc(r, b - 2);
        else if (left) c = rc(r, b);
      }
      p.px(X, Y, c);
    }
  }
}

/** Upright cylinder (tank, chimney, coil) with an elliptical lid `cap` rows tall. */
function tankV(p: Pix, x: number, y: number, w: number, h: number, r: Ramp, b: number, cap = Math.max(3, Math.round(w * 0.45))): void {
  const half = Math.floor(cap / 2);
  for (let j = half; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (j >= h - cap && !inEll(i, j - (h - cap), w, cap)) continue;
      p.px(x + i, y + j, rc(r, b + cylBand(i, w)));
    }
  }
  lid(p, x, y, w, cap, r, b + 1);
}

/** Elliptical lid: flat top in ramp[b], lit rim on the upper left, shaded rim lower right. */
function lid(p: Pix, x: number, y: number, w: number, h: number, r: Ramp, b: number): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!inEll(i, j, w, h)) continue;
      const edge = !inEll(i - 1, j, w, h) || !inEll(i + 1, j, w, h) || !inEll(i, j - 1, w, h) || !inEll(i, j + 1, w, h);
      let c = rc(r, b);
      if (edge) c = j < h / 2 && i < w * 0.6 ? rc(r, b + 1) : rc(r, b - 1);
      p.px(x + i, y + j, c);
    }
  }
}

/** Lying cylinder (boiler, drum, roller): banded top-light to bottom-dark, rounded ends. */
function drumH(p: Pix, x: number, y: number, w: number, h: number, r: Ramp, b: number, end = Math.max(2, Math.round(h * 0.3))): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const li = i < end ? i : i >= w - end ? i - (w - 2 * end) : -1;
      if (li >= 0 && !inEll(li, j, end * 2, h, 1.08)) continue;
      p.px(x + i, y + j, rc(r, b + cylBand(j, h)));
    }
  }
}

/** Diagonal hazard stripes (brass and soft black), 2 on 2 off. */
function hazard(p: Pix, x: number, y: number, w: number, h: number, phase = 0, a = K.gold, b = K.panel): void {
  p.paint(x, y, w, h, (X, Y) => (((X + Y + phase) & 3) < 2 ? a : b));
}

/** A rivet or bolt head: lit pixel with a shadow below right. */
function rivet(p: Pix, x: number, y: number, hi = K.pale, lo = K.rust1): void {
  p.px(x, y, hi);
  p.px(x + 1, y + 1, lo);
}

/** Horizontal vent slats. */
function grille(p: Pix, x: number, y: number, w: number, h: number, dark = K.night, lit = K.slate): void {
  for (let j = 0; j < h; j++) p.hl(x, x + w - 1, y + j, j % 2 === 0 ? dark : lit);
}

/** Horizontal pipe 3 px tall. */
function pipeH(p: Pix, x0: number, x1: number, y: number, r: Ramp, b: number): void {
  p.hl(x0, x1, y, rc(r, b + 1));
  p.hl(x0, x1, y + 1, rc(r, b));
  p.hl(x0, x1, y + 2, rc(r, b - 1));
}

/** Vertical pipe 3 px wide. */
function pipeV(p: Pix, x: number, y0: number, y1: number, r: Ramp, b: number): void {
  p.vl(x, y0, y1, rc(r, b + 1));
  p.vl(x + 1, y0, y1, rc(r, b));
  p.vl(x + 2, y0, y1, rc(r, b - 1));
}

/**
 * A light source: bright core with a glow ring in a dark housing. Records the light spot.
 * size 2 or 3; `glow` runs dim -> bright.
 */
function lamp(p: Pix, x: number, y: number, glow: Ramp, size = 2, housing = K.panel): void {
  p.rect(x - 1, y - 1, size + 2, size + 2, housing);
  p.rect(x, y, size, size, rc(glow, glow.length - 2));
  p.px(x, y, rc(glow, glow.length - 1));
  if (size >= 3) {
    p.px(x + size - 1, y + size - 1, rc(glow, glow.length - 3));
    p.px(x + 1, y + 1, rc(glow, glow.length - 1));
  }
  p.light(x + size / 2, y + size / 2, size + 2, rc(glow, glow.length - 2));
}

/** Copper windings: alternating lit/dark rows (coils on chargers, motors, taps). */
function windings(p: Pix, x: number, y: number, w: number, h: number, r: Ramp = R.copper): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const band = cylBand(i, w);
      p.px(x + i, y + j, j % 2 === 0 ? rc(r, 2 + band) : rc(r, 1 + band));
    }
  }
}

/** Finish a building: soft outline on the lit side, deep outline on the shadow side. */
function finish(p: Pix): void {
  p.outline(K.panel, K.ink);
}

/**
 * Lay an open structure (lattice, rails) over a finished sprite: it is outlined only where it
 * stands against empty space, and drops a 1 px shadow to its right onto what lies below.
 */
function overlay(p: Pix, t: Pix, shadow: number = K.panel): void {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (t.on(x, y)) continue;
      const l = t.on(x - 1, y);
      const u = t.on(x, y - 1);
      if (!(l || u || t.on(x + 1, y) || t.on(x, y + 1))) continue;
      if (!p.on(x, y)) p.px(x, y, l || u ? K.ink : K.panel);
      else if (l) p.px(x, y, shadow);
    }
  }
  p.blit(t, 0, 0);
}

// =============================================================================================
// Buildings (b_<id>): top-down 3/4, the top face plus a sliver of the south face, filling the
// footprint. No facing arrows: the renderer adds the output chute. Every machine records the
// light spot the renderer glows while it works.
// =============================================================================================

/** Glow ramps for light spots, dim -> bright. */
const G = {
  amber: [K.rust1, K.amber, K.gold, K.pale],
  cyan: [K.blue2, K.blue3, K.cyan, K.ice, K.white],
  lime: [K.green2, K.green3, K.lime, K.sage],
  /** Alien light: #25562e glass to an #a4dddb core (never the Crystal family's #73bed3). */
  alien: [K.green1, K.steel2, K.ice, K.white],
} as const satisfies Record<string, Ramp>;

/**
 * Chemistry glass: dark blue panes lit to an #a4dddb glint at most, never the Crystal family's
 * #73bed3 (STYLE "Machine families": Chemistry is glass tanks with a #a4dddb glint).
 */
const GLASS: Ramp = [K.navy, K.blue1, K.blue2, K.blue3, K.ice];

const BUILDING_ART: Record<string, (p: Pix) => void> = {
  splitter: bSplitter,
  crossing: bCrossing,
  sorter: bSorter,
  unloader: bUnloader,
  sequencer: bSequencer,
  chute: bChute,
  crate: bCrate,
  lamp: bLamp,
  shield_wall: bShieldWall,
  foundation: bFoundation,
  miner: bMiner,
  smelter: bSmelter,
  press: bPress,
  assembler: bAssembler,
  foundry: bFoundry,
  washer: bWasher,
  separator: bSeparator,
  harvester: bHarvester,
  spore_collector: bSporeCollector,
  spore_filter: bSporeFilter,
  cutter: bCutter,
  crusher: bCrusher,
  charger: bCharger,
  overcharger: bOvercharger,
  stabilizer: bStabilizer,
  cooling_bath: bCoolingBath,
  pressure_forge: bPressureForge,
  precision_assembler: bPrecisionAssembler,
  attuner: bAttuner,
  generator: bGenerator,
  thermal_extractor: bThermalExtractor,
  resonance_tap: bResonanceTap,
  assay_lab: bAssayLab,
  hq: bHQ,
  depot: bDepot,
  terminal: bTerminal,
  elevator: bElevator,
  engine_node: bEngineNode,
  drill: (p) => drill(p, false),
  heart: (p) => heart(p, true),
};

function drawBuilding(p: Pix, def: BuildingDef): void {
  const art = BUILDING_ART[def.id];
  if (art) art(p);
  else genericBuilding(p, def);
}

/** Any building added to the data later still gets a family-colored machine. */
function genericBuilding(p: Pix, def: BuildingDef): void {
  const s = p.w;
  const top = Math.round(s * 0.62);
  block(p, 1, 2, s - 2, top, s - 3 - top, R.steel, 3);
  const trim = def.category === 'power' ? R.heat : def.category === 'logistics' ? R.dark : R.brass;
  p.rect(2, 2 + top, s - 4, 2, rc(trim, 3));
  grille(p, 4, 5, Math.round(s / 3), 5);
  lamp(p, s - 7, 4, G.amber, 2);
  rivet(p, 3, 3);
  rivet(p, s - 5, 3);
  finish(p);
}

// ---------------------------------------------------------------------------------------------
// 1x1 logistics: belt-colored housing with a symmetric symbol (the renderer overlays arrows)
// ---------------------------------------------------------------------------------------------

/** Low belt-colored housing filling the tile; the plate is x 1..14, y 1..11. */
function housing(p: Pix): void {
  p.rect(0, 0, 16, 16, K.panel2);
  p.rect(1, 1, 14, 11, K.slate);
  p.hl(1, 14, 1, K.steel);
  p.vl(1, 1, 11, K.steel);
  p.vl(14, 2, 11, K.panel2);
  p.hl(2, 14, 11, K.panel2);
  p.rect(1, 12, 14, 3, K.panel2);
  p.hl(1, 14, 12, K.slate);
  p.hl(0, 15, 15, K.ink);
  p.vl(15, 0, 15, K.ink);
  p.hl(0, 15, 0, K.panel);
  p.vl(0, 0, 14, K.panel);
  for (const [x, y] of [[2, 2], [12, 2], [2, 9], [12, 9]] as const) {
    p.px(x, y, K.steel2);
    p.px(x + 1, y + 1, K.panel2);
  }
  // Belt slots on the front lip so it reads as part of the line.
  for (let x = 3; x <= 12; x += 3) p.px(x, 13, K.panel);
}

function bSplitter(p: Pix): void {
  housing(p);
  // Brass dealing wheel: rim, four spokes, hub.
  p.ell(3, 1, 10, 10, K.panel);
  p.ring(3, 1, 10, 10, K.amber);
  p.ring(4, 2, 8, 8, K.gold);
  p.hl(4, 11, 6, K.gold);
  p.hl(4, 11, 5, K.gold);
  p.vl(7, 2, 9, K.gold);
  p.vl(8, 2, 9, K.gold);
  p.rect(6, 4, 4, 4, K.amber);
  p.rect(7, 5, 2, 2, K.pale);
  p.px(5, 3, K.pale);
}

function bCrossing(p: Pix): void {
  housing(p);
  // A sunken plus: two belt channels crossing, a raised bridge plate where they meet.
  p.rect(0, 4, 16, 5, K.panel);
  p.rect(5, 0, 6, 12, K.panel);
  p.paint(0, 0, 16, 13, (x, y) => {
    if (p.get(x, y) !== K.panel) return null;
    const up = p.get(x, y - 1) !== K.panel && y > 0;
    const left = p.get(x - 1, y) !== K.panel && x > 0;
    const down = p.get(x, y + 1) !== K.panel;
    const right = p.get(x + 1, y) !== K.panel && x < 15;
    if (up || left) return K.ink;
    if (down || right) return K.steel;
    return null;
  });
  for (let k = 1; k <= 14; k += 3) {
    if (k < 5 || k > 10) p.vl(k, 5, 7, K.panel2);
    if (k < 4 || k > 8) p.hl(6, 9, k, K.panel2);
  }
  p.rect(6, 5, 4, 3, K.steel2);
  p.hl(6, 9, 5, K.silver);
  p.px(9, 7, K.slate);
}

function bSorter(p: Pix): void {
  housing(p);
  // Scanner lens with a grille, two status lamps on the diagonal.
  p.ell(3, 1, 10, 10, K.panel);
  p.ell(4, 2, 8, 8, K.blue1);
  p.ring(4, 2, 8, 8, K.navy);
  p.hl(5, 10, 6, K.blue2);
  p.vl(7, 3, 8, K.blue2);
  p.px(5, 4, K.ice);
  p.px(6, 3, K.cyan);
  p.px(9, 8, K.blue3);
  p.ring(3, 1, 10, 10, K.steel2);
  p.px(2, 2, K.lime);
  p.px(13, 10, K.lime);
  p.px(13, 2, K.coral);
  p.px(2, 10, K.coral);
}

function bUnloader(p: Pix): void {
  housing(p);
  // A steel hatch frame over the dark take-out, a four-jaw grab on its rod, a pale-gold
  // indicator (logistics trim: no family accent, no hazard stripes).
  p.rect(3, 2, 10, 9, K.steel);
  p.hl(3, 12, 2, K.steel3);
  p.vl(3, 2, 10, K.steel2);
  p.vl(12, 3, 10, K.slate);
  p.hl(4, 12, 10, K.slate);
  p.rect(4, 3, 8, 7, K.ink);
  p.rect(5, 4, 6, 5, K.night);
  for (const [x, y] of [[4, 3], [10, 3], [4, 8], [10, 8]] as const) {
    p.rect(x, y, 2, 2, K.steel2);
    p.px(x + (x < 7 ? 1 : 0), y + (y < 6 ? 1 : 0), K.silver);
  }
  p.rect(7, 5, 2, 3, K.steel);
  p.px(7, 5, K.steel3);
  p.px(12, 2, K.pale);
}

function bSequencer(p: Pix): void {
  housing(p);
  // An alien switch box (it comes with the Thrumstone assay): a block of grey-green machine stone
  // with a carved switch groove, and two pale aqua lamps, left (A) and right (B).
  p.rect(4, 2, 8, 5, K.steel);
  p.hl(4, 11, 2, K.steel2);
  p.vl(4, 2, 6, K.steel2);
  p.vl(11, 3, 6, K.slate);
  p.rect(4, 7, 8, 4, K.slate);
  p.vl(4, 7, 10, K.steel);
  p.vl(11, 7, 10, K.panel2);
  p.hl(4, 11, 10, K.panel2);
  p.hl(5, 10, 8, K.green1);
  // The switch groove and its stone toggle, thrown toward the left input.
  p.hl(5, 10, 4, K.pine);
  p.hl(6, 10, 5, K.slate);
  p.rect(5, 3, 2, 2, K.steel2);
  p.px(5, 3, K.steel3);
  // Lamps in dark glass sockets on the housing, either side of the block.
  for (const x of [1, 12]) {
    p.rect(x, 4, 3, 4, K.pine);
    p.rect(x + 1, 5, 1, 2, K.ice);
    p.px(x + 1, 5, K.white);
    p.px(x + 1, 7, K.green1);
    p.light(x + 1.5, 6, 3, K.ice);
  }
}

function bChute(p: Pix): void {
  // Company Chute: flat company-yellow panels over a hopper that steps down into the dark, a
  // white stencil chevron on the lip, plain steel plating below (Company family accent).
  p.rect(1, 1, 14, 10, K.gold);
  p.hl(1, 14, 1, K.pale);
  p.vl(1, 1, 10, K.pale);
  p.vl(14, 2, 10, K.amber);
  p.hl(2, 14, 10, K.amber);
  // Hopper: dark steel rim, shaded north and west walls, lit south and east walls, the throat.
  p.rect(3, 2, 10, 5, K.panel2);
  p.rect(4, 3, 8, 3, K.gold);
  p.hl(4, 11, 3, K.rust1);
  p.vl(4, 3, 5, K.amber);
  p.hl(5, 11, 5, K.pale);
  p.vl(11, 4, 5, K.pale);
  p.rect(5, 4, 6, 1, K.ink);
  p.px(5, 4, K.night);
  // White stencil: a chevron pointing into the hopper.
  p.px(5, 7, K.white);
  p.px(10, 7, K.white);
  p.px(6, 8, K.white);
  p.px(9, 8, K.white);
  p.hl(7, 8, 9, K.white);
  // Plain steel south face.
  p.rect(1, 11, 14, 4, K.steel);
  p.hl(1, 14, 11, K.steel2);
  p.vl(14, 11, 14, K.slate);
  p.hl(1, 14, 14, K.slate);
  p.vl(8, 12, 13, K.slate);
  finish(p);
}

// ---------------------------------------------------------------------------------------------
// 1x1 utility pieces
// ---------------------------------------------------------------------------------------------

function bCrate(p: Pix): void {
  // A steel storage crate: blue-grey lid and ribbed plating, corner bolts, and one flat
  // company-yellow band with a white stencil mark (STYLE: decor crates are wood, this is steel).
  block(p, 1, 2, 14, 6, 7, R.steel, 3);
  // Lid: a raised centre panel with a recessed seam round it.
  p.rect(3, 3, 10, 3, K.steel3);
  p.hl(3, 12, 3, K.silver);
  p.hl(3, 12, 6, K.steel);
  p.vl(12, 4, 5, K.steel);
  // Ribbed front plating.
  for (const x of [4, 7, 10]) {
    p.vl(x, 9, 13, K.slate);
    p.vl(x + 1, 9, 13, K.steel2);
  }
  // The band and its stencil.
  p.rect(1, 10, 14, 2, K.gold);
  p.hl(1, 13, 10, K.pale);
  p.px(14, 10, K.amber);
  p.px(14, 11, K.amber);
  p.hl(6, 9, 11, K.white);
  p.px(6, 10, K.white);
  // Corner bolts.
  for (const [x, y] of [[2, 3], [12, 3], [2, 13], [12, 13]] as const) {
    p.px(x, y, K.silver);
    p.px(x + 1, y + (y < 8 ? 1 : 0), K.slate);
  }
  finish(p);
}

function bLamp(p: Pix): void {
  // Base plate, post, lantern.
  p.ell(3, 11, 10, 4, K.panel2);
  p.ell(4, 11, 8, 3, K.slate);
  p.px(5, 11, K.steel);
  p.vl(7, 6, 12, K.steel2);
  p.vl(8, 6, 12, K.slate);
  block(p, 4, 0, 8, 2, 1, R.dark, 4);
  p.rect(4, 3, 8, 4, K.panel);
  p.rect(5, 3, 6, 3, K.gold);
  p.rect(6, 3, 4, 2, K.pale);
  p.px(7, 3, K.white);
  p.vl(7, 3, 5, K.white);
  p.hl(5, 10, 6, K.amber);
  p.px(4, 3, K.slate);
  p.light(8, 4, 6, K.pale);
  finish(p);
}

function bShieldWall(p: Pix): void {
  // A wall segment that tiles in rows: steel cap, cobalt face, cyan insulating band.
  p.rect(0, 1, 16, 4, K.steel2);
  p.hl(0, 15, 1, K.silver);
  p.hl(0, 15, 4, K.steel);
  p.rect(0, 5, 16, 10, K.blue2);
  p.rect(0, 5, 16, 1, K.blue3);
  for (let y = 6; y <= 13; y++) p.px(15, y, K.blue1);
  p.hl(0, 15, 9, K.navy);
  p.hl(0, 15, 10, K.cyan);
  p.hl(0, 15, 11, K.navy);
  p.hl(0, 15, 14, K.blue1);
  p.vl(0, 1, 14, K.slate);
  p.vl(0, 5, 14, K.blue1);
  for (const x of [2, 13]) {
    rivet(p, x, 6, K.steel3, K.blue1);
    rivet(p, x, 12, K.steel3, K.blue1);
  }
  p.hl(0, 15, 0, K.panel);
  p.hl(0, 15, 15, K.ink);
  p.light(8, 10, 2, K.cyan);
}

function bFoundation(p: Pix): void {
  // Opaque floor tile of quenched aggregate with a bevelled edge.
  const r = rng(77);
  p.rect(0, 0, 16, 16, K.earth0);
  for (let i = 0; i < 26; i++) {
    const x = 1 + Math.floor(r() * 13);
    const y = 1 + Math.floor(r() * 13);
    const big = r() < 0.4;
    const tone = r() < 0.5 ? K.earth1 : K.earth2;
    p.px(x, y, tone);
    if (big) {
      p.px(x + 1, y, tone);
      p.px(x, y + 1, K.earth1);
      p.px(x + 1, y + 1, K.plum);
    }
    if (r() < 0.45) p.px(x, y, K.earth3);
  }
  for (let i = 0; i < 6; i++) p.px(1 + Math.floor(r() * 14), 1 + Math.floor(r() * 14), K.sand);
  p.hl(0, 15, 0, K.earth2);
  p.vl(0, 0, 15, K.earth2);
  p.hl(1, 15, 15, K.plum);
  p.vl(15, 1, 15, K.plum);
  p.px(0, 15, K.earth1);
  p.px(15, 0, K.earth1);
}

// ---------------------------------------------------------------------------------------------
// 2x2 machines (32 x 32). Bodies sit in x 1..30 with the south face ending on row 30.
// ---------------------------------------------------------------------------------------------

/** Glowing cyan coil bands (crystal family). */
function cyanCoil(p: Pix, x: number, y: number, w: number, h: number): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const band = cylBand(i, w);
      p.px(x + i, y + j, j % 2 === 0 ? rc(G.cyan, 2 + band) : rc(G.cyan, band));
    }
  }
}

/** Small round pressure gauge, 5 x 5. */
function gauge(p: Pix, x: number, y: number): void {
  p.ell(x, y, 5, 5, K.panel2);
  p.ell(x + 1, y + 1, 3, 3, K.silver);
  p.px(x + 1, y + 1, K.white);
  p.px(x + 3, y + 1, K.red);
  p.px(x + 2, y + 2, K.panel);
}

function bMiner(p: Pix): void {
  const s = R.steel;
  // Skid and deck with a hazard-striped south face.
  block(p, 1, 14, 30, 11, 6, s, 2);
  for (let y = 16; y <= 23; y += 2) for (let x = 3 + ((y >> 1) & 1); x < 29; x += 3) p.px(x, y, K.steel2);
  hazard(p, 2, 26, 28, 4);
  // Bore collar with a hazard rim, wider than the tower so it shows on both sides.
  p.paint(3, 14, 26, 10, (x, y) => (inEll(x - 3, y - 14, 26, 10) ? (((x - y) & 3) < 2 ? K.gold : K.panel) : null));
  p.ell(5, 15, 22, 8, K.panel2);
  p.ell(7, 16, 18, 6, K.ink);
  p.hl(9, 22, 16, K.night);
  // Winch drum and its motor on the right of the deck.
  drumH(p, 24, 15, 6, 7, R.steel, 3);
  p.rect(24, 15, 2, 7, K.amber);
  p.vl(24, 15, 21, K.gold);
  // Derrick over the bore, drill string down its middle, crown block with the work lamp.
  derrick(p, 9, 22, 21, 12, 19, 3, 3);
  p.vl(15, 4, 19, K.steel3);
  p.vl(16, 4, 19, K.steel);
  p.rect(14, 19, 4, 2, K.slate);
  p.hl(14, 17, 19, K.steel2);
  block(p, 10, 0, 12, 2, 3, s, 4);
  p.rect(10, 2, 12, 1, K.steel3);
  lamp(p, 15, 2, G.amber, 2, K.panel2);
  finish(p);
}

/**
 * Lattice tower between two raking legs, drawn opaque (dark bays with steel bracing) so the
 * silhouette stays clean: base legs at xl0/xr0 on row y0, top legs at xl1/xr1 on row y1.
 */
function derrick(p: Pix, xl0: number, xr0: number, y0: number, xl1: number, xr1: number, y1: number, bays: number, lean = 0): void {
  const f = (y: number): number => (y0 - y) / (y0 - y1);
  const L = (y: number): number => Math.round(xl0 + (xl1 - xl0 + lean) * f(y));
  const Rt = (y: number): number => Math.round(xr0 + (xr1 - xr0 + lean) * f(y));
  for (let y = y1; y <= y0; y++) p.hl(L(y), Rt(y), y, K.panel2);
  for (let k = 0; k <= bays; k++) {
    const by = Math.round(y1 + ((y0 - y1) * k) / bays);
    p.hl(L(by), Rt(by), by, K.steel3);
    if (by + 1 <= y0) p.hl(L(by + 1) + 1, Rt(by + 1) - 1, by + 1, K.slate);
    if (k < bays) {
      const ny = Math.round(y1 + ((y0 - y1) * (k + 1)) / bays);
      p.line(L(by) + 2, by + 2, Rt(ny) - 2, ny - 1, K.steel);
      p.line(Rt(by) - 2, by + 2, L(ny) + 2, ny - 1, K.slate);
    }
  }
  for (let y = y1; y <= y0; y++) {
    p.px(L(y), y, K.silver);
    p.px(L(y) + 1, y, K.steel2);
    p.px(Rt(y) - 1, y, K.steel);
    p.px(Rt(y), y, K.slate);
  }
}

function bSmelter(p: Pix): void {
  // A squat brick furnace (Heat family): a brick deck under two dark steel bands with the glowing
  // furnace mouth on the top face, a plain brick south face, the flue at the back left.
  bricks(p, 2, 9, 28, 12);
  p.hl(2, 28, 9, K.coral);
  p.vl(2, 9, 19, K.coral);
  for (const y of [11, 17]) {
    p.hl(2, 29, y, K.slate);
    p.hl(2, 29, y + 1, K.panel2);
    for (const x of [4, 27]) p.px(x, y, K.steel3);
  }
  // Plain brick south face on a steel plinth.
  bricks(p, 2, 21, 28, 9);
  p.hl(2, 29, 21, K.crimson);
  p.hl(2, 29, 30, K.panel2);
  p.hl(2, 28, 29, K.slate);
  // The mouth: a steel collar round a slot of melt, white-hot at its heart.
  p.ell(8, 12, 17, 8, K.panel2);
  p.ring(8, 12, 17, 8, K.slate);
  p.paint(8, 12, 17, 4, (x, y) => (p.get(x, y) === K.slate ? K.steel2 : null));
  p.ell(10, 13, 13, 6, K.wine1);
  p.ell(11, 14, 11, 5, K.red);
  p.ell(12, 14, 9, 4, K.coral);
  p.ell(13, 15, 7, 3, K.orange);
  p.hl(14, 18, 16, K.pale);
  p.px(16, 16, K.white);
  p.px(12, 17, K.crimson);
  p.px(20, 15, K.crimson);
  p.light(16, 16, 6, K.orange);
  // Flue stack, standing on the back of the deck.
  tankV(p, 4, 0, 7, 11, R.dark, 3);
  p.ell(5, 0, 5, 2, K.ink);
  p.hl(4, 10, 4, K.rust1);
  p.hl(4, 10, 5, K.rust0);
  p.px(5, 4, K.amber);
  finish(p);
}

/** Brick courses: mortar every third row, joints offset on alternate courses. */
function bricks(p: Pix, x: number, y: number, w: number, h: number): void {
  for (let j = 0; j < h; j++) {
    const course = Math.floor(j / 3);
    for (let i = 0; i < w; i++) {
      const mortar = j % 3 === 2 || (i + (course % 2) * 3) % 6 === 5;
      let c = mortar ? K.crimson : K.red;
      if (!mortar && j % 3 === 0) c = K.coral;
      if (i === w - 1 || j === h - 1) c = mortar ? K.wine1 : K.crimson;
      p.px(x + i, y + j, c);
    }
  }
}

function bPress(p: Pix): void {
  const s = R.steel;
  // Bed with a plate on the die.
  block(p, 1, 20, 30, 5, 6, s, 2);
  p.rect(9, 21, 14, 3, K.panel2);
  p.rect(10, 21, 12, 2, K.steel2);
  p.hl(10, 21, 21, K.silver);
  grille(p, 10, 26, 12, 3);
  for (const x of [3, 27]) rivet(p, x, 26, K.amber, K.panel2);
  // Two columns with open bays between them and the ram (the floor shows through).
  for (const cx of [2, 26]) {
    for (let y = 8; y <= 24; y++) for (let i = 0; i < 4; i++) p.px(cx + i, y, rc(s, 3 + cylBand(i, 4)));
    p.rect(cx - 1, 22, 6, 3, K.slate);
    p.hl(cx - 1, cx + 4, 22, K.steel2);
  }
  // Header with brass rivets, hydraulic cylinder on top, indicator lamp.
  block(p, 1, 4, 30, 3, 4, s, 3);
  for (const x of [3, 8, 22, 27]) rivet(p, x, 8, K.amber, K.panel2);
  tankV(p, 10, 0, 12, 7, s, 3, 4);
  p.hl(10, 21, 4, K.amber);
  lamp(p, 15, 1, G.amber, 2, K.panel2);
  // Ram on its rod.
  block(p, 11, 11, 10, 2, 3, s, 3);
  p.rect(15, 9, 2, 2, K.steel3);
  p.hl(11, 20, 15, K.silver);
  p.hl(11, 20, 16, K.slate);
  rivet(p, 12, 13, K.amber, K.panel2);
  rivet(p, 18, 13, K.amber, K.panel2);
  finish(p);
}

function bAssembler(p: Pix): void {
  const s = R.steel;
  block(p, 1, 9, 30, 15, 7, s, 3);
  // Recessed work table with a part on it.
  p.rect(5, 12, 22, 10, K.panel2);
  p.hl(5, 26, 12, K.panel);
  p.vl(5, 12, 21, K.panel);
  p.hl(6, 26, 21, K.steel);
  p.vl(26, 13, 21, K.slate);
  for (let y = 14; y <= 20; y += 3) for (let x = 8; x <= 24; x += 4) p.px(x, y, K.slate);
  p.rect(16, 15, 6, 4, K.earth2);
  p.hl(16, 21, 15, K.orange);
  p.rect(17, 16, 4, 2, K.steel2);
  p.px(17, 16, K.silver);
  // Front: plain plating, a vent either side of the middle, rivet dots. No status lights: the
  // south face shows for every facing, and lime and coral are other families' colours.
  grille(p, 5, 26, 8, 3);
  grille(p, 19, 26, 8, 3);
  for (const x of [2, 28]) rivet(p, x, 25, K.amber, K.panel2);
  // Arm turret at the back left, arm reaching over the table.
  tankV(p, 2, 1, 9, 12, s, 3);
  p.hl(2, 10, 8, K.amber);
  p.hl(3, 9, 9, K.rust1);
  p.ell(4, 2, 5, 3, K.steel3);
  for (let k = 0; k < 3; k++) p.line(7, 3 + k, 19, 4 + k, k === 0 ? K.silver : k === 1 ? K.steel2 : K.slate);
  p.line(19, 6, 21, 13, K.steel2);
  p.line(20, 6, 22, 13, K.steel);
  p.line(21, 6, 23, 13, K.slate);
  p.ell(17, 2, 5, 5, K.amber);
  p.px(18, 3, K.pale);
  p.px(20, 5, K.rust1);
  p.ell(5, 2, 4, 3, K.amber);
  p.px(6, 2, K.pale);
  // Tool head and its lamp.
  p.rect(19, 13, 6, 3, K.panel2);
  p.px(19, 16, K.slate);
  p.px(24, 16, K.slate);
  lamp(p, 21, 13, G.amber, 2, K.panel2);
  finish(p);
}

function bFoundry(p: Pix): void {
  // Octagonal rust-red furnace (Heat family) with an open crucible of melt on its top face. The
  // south face is brick courses a shade darker than the top, strapped in steel: the family's
  // brick pattern, and no glowing spout (STYLE: the south face is plain, every mouth on top).
  octBlock(p, 1, 6, 30, 15, 10, 4, R.heat, 3);
  p.paint(2, 21, 28, 9, (x, y) => {
    if (!(p.on(x - 1, y) && p.on(x + 1, y) && p.on(x, y + 1))) return null;
    const j = y < 24 ? y - 21 : y - 26;
    const course = y < 24 ? 0 : 1 + Math.floor(j / 3);
    const mortar = j % 3 === 2 || (x + (course % 2) * 3) % 6 === 5;
    return mortar ? K.wine1 : j % 3 === 0 ? K.red : K.crimson;
  });
  p.hl(2, 29, 24, K.slate);
  p.hl(2, 29, 25, K.panel2);
  for (const x of [4, 10, 21, 27]) rivet(p, x, 24, K.steel3, K.panel);
  // Crucible rim and melt.
  p.ell(4, 8, 21, 12, K.steel2);
  p.ring(4, 8, 21, 12, K.slate);
  p.paint(4, 8, 21, 6, (x, y) => (inEll(x - 4, y - 8, 21, 12) && !inEll(x - 5, y - 9, 19, 10) ? K.steel3 : null));
  p.ell(6, 10, 17, 8, K.red);
  p.ell(7, 10, 15, 7, K.coral);
  p.ell(9, 11, 11, 5, K.orange);
  p.ell(11, 12, 7, 3, K.pale);
  p.hl(13, 15, 12, K.white);
  p.px(8, 15, K.crimson);
  p.px(9, 15, K.crimson);
  p.px(19, 12, K.crimson);
  p.light(14, 13, 7, K.orange);
  // Exhaust stack at the back right.
  tankV(p, 24, 0, 6, 12, R.dark, 3);
  p.ell(25, 0, 4, 2, K.ink);
  p.hl(24, 29, 5, K.rust1);
  finish(p);
}

function bGenerator(p: Pix): void {
  // Power family: a dark iron boiler drum on a skid, copper pipes, the firebox glowing on top of
  // the drum, a smokestack at the back right.
  block(p, 1, 23, 30, 2, 6, R.dark, 4);
  drumH(p, 1, 6, 23, 18, R.dark, 3);
  // Riveted iron bands round the drum.
  for (const sx of [3, 20]) {
    for (let y = 6; y <= 23; y++) {
      if (!p.on(sx, y)) continue;
      p.px(sx, y, y < 13 ? K.steel : K.slate);
      p.px(sx + 1, y, y < 13 ? K.slate : K.panel);
    }
    rivet(p, sx, 10, K.steel3, K.panel);
    rivet(p, sx, 17, K.steel2, K.panel);
  }
  // Firebox hatch on top of the drum, its slits glowing.
  p.rect(7, 8, 9, 6, K.panel);
  p.rect(8, 9, 7, 4, K.night);
  p.hl(8, 14, 9, K.orange);
  p.hl(8, 14, 11, K.coral);
  p.px(10, 9, K.pale);
  p.px(12, 11, K.orange);
  p.hl(7, 15, 13, K.slate);
  p.light(11, 10, 5, K.orange);
  gauge(p, 15, 15);
  // Copper pipes: risers out of the drum into a header that runs into the stack.
  pipeH(p, 4, 23, 1, R.copper, 2);
  pipeV(p, 4, 2, 7, R.copper, 2);
  pipeV(p, 16, 2, 7, R.copper, 2);
  p.px(4, 1, K.pale);
  // Smokestack with a flared cap.
  tankV(p, 23, 3, 7, 22, R.dark, 3);
  lid(p, 22, 0, 9, 4, R.dark, 4);
  p.ell(24, 1, 5, 2, K.ink);
  p.hl(23, 29, 9, K.rust0);
  p.hl(23, 29, 10, K.panel);
  finish(p);
}

function bWasher(p: Pix): void {
  // Base frame.
  block(p, 1, 20, 30, 4, 7, R.steel, 2);
  grille(p, 9, 26, 14, 3);
  // Glass drum: air above the water line, water below with sapstone tumbling in it. Water ramp
  // and #a4dddb glints only: #73bed3 is the Crystal family's coil colour.
  drumH(p, 3, 4, 26, 18, GLASS, 2);
  p.paint(3, 4, 26, 18, (x, y) => {
    if (!p.on(x, y)) return null;
    if (y < 12) return y === 5 || (x + y) % 9 === 0 ? K.blue3 : K.blue2;
    if (y === 12) return h2(x, y, 5) < 0.3 ? K.ice : K.blue3;
    if (y >= 19) return K.navy;
    const h = h2(x, y, 3);
    if (h < 0.06) return K.gold;
    if (h < 0.1) return K.ice;
    return y < 15 ? K.blue2 : K.blue1;
  });
  for (let k = 0; k < 4; k++) p.px(8 + k, 9 - k, K.ice);
  p.px(13, 6, K.ice);
  // Steel end rings and a centre band (Chemistry: the glass carries the accent, not brass).
  for (const [x0, w] of [[3, 4], [25, 4], [15, 2]] as const) {
    for (let y = 4; y < 22; y++) for (let i = 0; i < w; i++) if (p.on(x0 + i, y)) p.px(x0 + i, y, rc(R.steel, 3 + cylBand(y - 4, 18)));
  }
  // Inlet pipe and a steel valve wheel (red is the Heat family's brick colour).
  pipeV(p, 9, 0, 4, R.steel, 3);
  p.hl(7, 13, 1, K.slate);
  p.px(7, 1, K.steel3);
  p.px(10, 1, K.silver);
  p.light(16, 14, 7, K.ice);
  finish(p);
}

function bSeparator(p: Pix): void {
  block(p, 1, 19, 30, 5, 7, R.steel, 2);
  grille(p, 12, 26, 10, 3);
  // Resin tank on the left (resin leaves from the left side).
  tankV(p, 1, 3, 8, 23, R.steel, 3);
  p.rect(3, 8, 4, 14, K.panel2);
  p.paint(3, 9, 4, 12, (x, y) => (y < 11 ? K.blue1 : x === 3 ? K.pale : x === 6 ? K.amber : (x + y) % 5 === 0 ? K.pale : K.gold));
  p.light(5, 15, 4, K.gold);
  // Centrifuge with a domed lid and a glass window round the bowl (Chemistry: a glass tank of
  // amber fluid with a #a4dddb glint). Dark glass over the amber slurry, shaded round the drum,
  // the spin shown by short level streaks; never diagonal stripes, which are Extraction's hazard
  // pattern and read as one at 1x.
  tankV(p, 10, 3, 15, 23, R.steel, 3, 7);
  const dome = new Pix(32, 32);
  dome.ell(10, 0, 15, 9, 0);
  shadeMask(p, dome, [K.slate, K.steel, K.steel2, K.steel3, K.silver], -0.02);
  p.rect(16, 2, 3, 2, K.steel3);
  p.px(16, 2, K.silver);
  for (const y of [11, 21]) for (let x = 10; x < 25; x++) if (p.on(x, y)) p.px(x, y, rc(R.steel, 2 + cylBand(x - 10, 15)));
  const slurry: Ramp = [K.rust0, K.rust1, K.amber, K.gold, K.pale];
  for (let x = 11; x <= 23; x++) {
    const band = x === 23 ? -2 : cylBand(x - 11, 13);
    p.px(x, 13, band > 0 ? K.blue2 : K.blue1);
    for (let y = 14; y <= 18; y++) p.px(x, y, rc(slurry, (y === 18 ? 2 : 3) + band));
  }
  for (const [x0, x1, y, c] of [[17, 19, 15, K.pale], [13, 15, 17, K.gold], [21, 22, 16, K.gold], [16, 18, 18, K.gold]] as const) {
    p.hl(x0, x1, y, c);
  }
  p.vl(13, 13, 14, K.ice);
  // Motor on the right driving the bowl.
  block(p, 25, 9, 6, 5, 6, R.steel, 2);
  grille(p, 26, 15, 4, 4);
  p.line(24, 12, 25, 12, K.ink);
  pipeH(p, 7, 10, 14, R.steel, 3);
  finish(p);
}

function bHarvester(p: Pix): void {
  // Tracked fungus harvester: treads, deck, open hopper of caps, front reel.
  for (const tx of [1, 26]) {
    p.rect(tx, 5, 5, 26, K.panel);
    for (let y = 5; y <= 30; y++) p.hl(tx + 1, tx + 3, y, y % 3 === 0 ? K.slate : K.panel2);
    p.vl(tx, 5, 30, K.panel2);
  }
  block(p, 5, 6, 22, 15, 10, R.steel, 3);
  hazard(p, 6, 26, 20, 3);
  // Hopper heaped with glowcaps.
  p.rect(8, 2, 16, 12, K.steel3);
  p.rect(9, 3, 14, 10, K.violet);
  p.hl(9, 22, 3, K.indigo);
  p.vl(23, 2, 13, K.steel);
  p.hl(8, 23, 13, K.steel);
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 4; k++) {
      const x = 9 + k * 4 - (row % 2) * 2 + 1;
      const y = 4 + row * 3;
      if (x < 9 || x + 2 > 22) continue;
      p.hl(x, x + 2, y, K.pink);
      p.px(x + 1, y, K.rose);
      p.hl(x, x + 2, y + 1, K.magenta);
      p.px(x + (row + k) % 3, y, K.lime);
    }
  }
  // Cutting reel across the front, bold diagonal blades.
  drumH(p, 3, 16, 26, 6, R.steel, 3);
  for (let x = 4; x <= 26; x += 4) p.line(x, 16, x + 3, 21, K.panel2);
  p.rect(2, 16, 2, 6, K.amber);
  p.rect(28, 16, 2, 6, K.amber);
  p.px(2, 16, K.gold);
  // Work lamp on a mast.
  p.vl(26, 3, 8, K.slate);
  lamp(p, 25, 1, G.lime, 2, K.panel2);
  finish(p);
}

function bSporeCollector(p: Pix): void {
  block(p, 1, 16, 30, 7, 8, R.steel, 2);
  hazard(p, 2, 25, 28, 4);
  // Big intake fan housing.
  tankV(p, 4, 0, 22, 20, R.steel, 3, 14);
  p.ell(6, 1, 18, 12, K.ink);
  p.paint(6, 1, 18, 12, (x, y) => {
    if (!inEll(x - 6, y - 1, 18, 12)) return null;
    const dx = x + 0.5 - 15;
    const dy = (y + 0.5 - 7) * 1.5;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) + r * 0.09 + Math.PI * 2;
    const blade = (a % (Math.PI / 2)) / (Math.PI / 2) < 0.42;
    if (!blade || r < 2) return null;
    return a % (Math.PI * 2) < Math.PI ? K.slate : K.steel2;
  });
  p.ring(6, 1, 18, 12, K.steel3);
  p.paint(6, 1, 18, 12, (x, y) => (p.get(x, y) === K.steel3 && y > 7 ? K.steel : null));
  p.ell(13, 5, 5, 4, K.amber);
  p.px(14, 5, K.pale);
  p.px(15, 6, K.gold);
  // Dust canister glowing with spores.
  tankV(p, 23, 11, 7, 15, R.steel, 3);
  p.rect(25, 15, 3, 9, K.panel);
  p.paint(25, 17, 3, 7, (x, y) => (h2(x, y, 9) < 0.25 ? K.lime : y < 19 ? K.pink : K.magenta));
  p.px(25, 16, K.rose);
  p.light(26, 19, 5, K.pink);
  finish(p);
}

function bSporeFilter(p: Pix): void {
  block(p, 1, 21, 30, 3, 7, R.steel, 2);
  grille(p, 11, 26, 10, 3);
  // Twin glass filter towers in steel frames (Chemistry): lime fluid round the cartridges, a pale
  // aqua glint down the lit side of the glass.
  for (const tx of [2, 18]) {
    tankV(p, tx, 1, 12, 25, R.steel, 3, 5);
    p.rect(tx + 2, 6, 8, 17, K.panel2);
    p.paint(tx + 3, 7, 6, 15, (x, y) => {
      if (x === tx + 4) return y < 9 ? K.white : K.ice;
      if (y < 9) return K.green1;
      if (y % 4 === 1) return K.green2;
      return x === tx + 3 ? K.green3 : x >= tx + 7 ? K.green3 : K.lime;
    });
    p.hl(tx + 3, tx + 8, 9, K.sage);
  }
  // Bridge pipe and the status lamp between the towers.
  pipeH(p, 13, 18, 4, R.steel, 3);
  lamp(p, 15, 12, G.lime, 2, K.panel);
  finish(p);
}

function bCutter(p: Pix): void {
  const d = R.dark;
  block(p, 1, 11, 30, 12, 8, d, 4);
  cyanCoil(p, 3, 24, 6, 5);
  cyanCoil(p, 23, 24, 6, 5);
  grille(p, 11, 25, 10, 3);
  // Cutting bed with a crystal on it.
  p.rect(4, 14, 12, 6, K.panel);
  p.hl(4, 15, 19, K.slate);
  p.hl(4, 15, 14, K.ink);
  p.poly([[9, 14], [12, 15.5], [12, 18], [9, 19.5], [6, 18], [6, 15.5]], K.blue3);
  p.vl(7, 16, 17, K.ice);
  p.px(8, 15, K.white);
  p.vl(10, 16, 18, K.blue2);
  p.px(11, 17, K.blue1);
  // Saw disc at the back right with a narrow guard over its top edge.
  p.ell(15, 1, 15, 15, K.steel2);
  p.paint(15, 1, 15, 15, (x, y) => {
    if (!inEll(x - 15, y - 1, 15, 15)) return null;
    const edge = !inEll(x - 16, y - 2, 13, 13);
    if (edge) return (x + y) % 2 === 0 ? K.silver : K.slate;
    return x + y < 33 ? K.steel3 : K.steel2;
  });
  // Hub: a cyan arbor (an amber dot would be the Fabrication family's rivet).
  p.ell(20, 6, 5, 5, K.panel2);
  p.ell(21, 7, 3, 3, K.cyan);
  p.px(21, 7, K.ice);
  p.paint(14, 0, 18, 9, (x, y) => {
    const guard = inEll(x - 14, y, 17, 17, 1.1) && !inEll(x - 17, y - 3, 11, 11) && y < 6 && x > 19;
    return guard ? (y < 2 ? K.slate : K.panel2) : null;
  });
  // Emitter arm with the laser lens.
  p.rect(2, 5, 4, 8, K.panel2);
  p.vl(2, 5, 12, K.slate);
  p.line(5, 7, 11, 10, K.slate);
  p.line(5, 8, 11, 11, K.panel2);
  lamp(p, 11, 10, G.cyan, 2, K.panel);
  p.px(13, 13, K.ice);
  p.px(14, 14, K.cyan);
  finish(p);
}

function bCrusher(p: Pix): void {
  const d = R.dark;
  // Body below the hopper: the coil band on its south face (the family accent, never lit), the
  // charge lamp on its top face (STYLE: every light spot on the top face).
  block(p, 5, 13, 22, 8, 10, d, 4);
  cyanCoil(p, 8, 23, 16, 5);
  p.rect(14, 16, 4, 4, K.panel);
  p.rect(15, 17, 2, 2, K.cyan);
  p.px(15, 17, K.ice);
  p.light(16, 18, 6, K.cyan);
  // Hopper: wide rim, sloped inner walls, toothed rollers in the throat.
  p.poly([[1, 1], [31, 1], [26, 15], [6, 15]], K.slate);
  p.poly([[3, 2], [29, 2], [24.5, 13], [7.5, 13]], K.panel2);
  p.paint(3, 2, 27, 12, (x, y) => (p.get(x, y) === K.panel2 ? (y < 5 ? K.slate : y < 8 ? K.panel2 : K.panel) : null));
  p.hl(1, 30, 1, K.steel2);
  p.line(1, 1, 6, 14, K.steel);
  p.line(30, 1, 26, 14, K.panel2);
  p.rect(9, 8, 14, 5, K.ink);
  drumH(p, 9, 8, 14, 3, R.steel, 3);
  drumH(p, 9, 11, 14, 3, R.steel, 2);
  for (let x = 10; x <= 21; x += 2) {
    p.px(x, 9, K.panel);
    p.px(x + 1, 12, K.panel);
  }
  finish(p);
}

function bCharger(p: Pix): void {
  octBlock(p, 2, 17, 28, 7, 7, 3, R.dark, 4);
  cyanCoil(p, 6, 26, 4, 3);
  cyanCoil(p, 22, 26, 4, 3);
  // Corner coil posts wired to the column.
  for (const cx of [4, 24]) {
    cyanCoil(p, cx, 14, 4, 6);
    p.rect(cx, 13, 4, 1, K.steel);
  }
  p.line(8, 17, 12, 19, K.panel);
  p.line(23, 17, 19, 19, K.panel);
  // Wound column.
  windings(p, 12, 8, 8, 13);
  block(p, 11, 20, 10, 2, 2, R.steel, 3);
  // Torus with the charge orb.
  p.ell(7, 0, 18, 10, K.slate);
  p.ring(7, 0, 18, 10, K.steel2);
  p.paint(7, 5, 18, 5, (x, y) => (inEll(x - 7, y, 18, 10) && !inEll(x - 8, y - 1, 16, 8) ? K.panel2 : null));
  p.ell(11, 2, 10, 6, K.blue3);
  p.ell(12, 2, 8, 5, K.cyan);
  p.ell(13, 3, 5, 3, K.ice);
  p.px(14, 3, K.white);
  p.light(16, 5, 7, K.cyan);
  finish(p);
}

function bOvercharger(p: Pix): void {
  block(p, 1, 16, 30, 6, 9, R.dark, 4);
  cyanCoil(p, 3, 24, 26, 3);
  // Two coil towers with charge orbs.
  for (const tx of [2, 23]) {
    windings(p, tx + 1, 7, 5, 13);
    p.rect(tx, 18, 7, 3, K.slate);
    p.hl(tx, tx + 6, 18, K.steel2);
    const orb = new Pix(32, 32);
    orb.ell(tx, 0, 7, 7, 0);
    shadeMask(p, orb, [K.blue2, K.blue3, K.cyan, K.ice, K.white], 0.1);
  }
  // Central glass chamber holding a white-hot crystal.
  tankV(p, 11, 4, 10, 19, R.dark, 4);
  p.rect(13, 8, 6, 11, K.navy);
  p.hl(13, 18, 8, K.blue1);
  p.poly([[16, 9], [18.5, 13], [16, 18], [13.5, 13]], K.ice);
  p.vl(15, 11, 15, K.white);
  p.px(17, 14, K.cyan);
  p.light(16, 13, 7, K.ice);
  // Static arcs from the orbs.
  for (const [x0, s] of [[9, 1], [22, -1]] as const) {
    p.px(x0, 4, K.ice);
    p.px(x0 + s, 5, K.white);
    p.px(x0 + s, 6, K.ice);
    p.px(x0 + 2 * s, 7, K.ice);
  }
  finish(p);
}

function bStabilizer(p: Pix): void {
  block(p, 1, 18, 30, 6, 7, R.steel, 2);
  // Insulation wraps on the south face.
  p.paint(3, 25, 26, 4, (x, y) => ((x + (y % 2) * 2) % 4 === 0 ? K.sand : y === 25 ? K.white : K.cream));
  p.hl(3, 28, 28, K.earth3);
  // Containment sphere (Chemistry): dark glass with an #a4dddb glint, amber fluid in the lower
  // half, the core in the middle. No #73bed3: that is the Crystal family's coil colour.
  const m = new Pix(32, 32);
  m.ell(7, 1, 18, 18, 0);
  shadeMask(p, m, [K.navy, K.blue1, K.blue2, K.blue3], -0.05);
  p.paint(7, 11, 18, 8, (x, y) => (m.on(x, y) ? (x < 12 ? K.gold : x > 21 ? K.rust1 : y > 15 ? K.amber : K.gold) : null));
  p.hl(9, 23, 11, K.pale);
  p.poly([[16, 5], [19, 10], [16, 15], [13, 10]], K.ice);
  p.vl(15, 7, 12, K.white);
  p.px(17, 11, K.blue3);
  p.px(10, 4, K.ice);
  p.px(11, 3, K.ice);
  p.px(9, 5, K.ice);
  p.light(16, 10, 7, K.ice);
  // Steel cradle clamps.
  for (const x of [6, 24]) {
    p.rect(x, 7, 2, 12, K.steel);
    p.vl(x, 7, 18, K.steel3);
    p.px(x + 1, 18, K.slate);
  }
  p.rect(13, 0, 6, 2, K.steel2);
  p.hl(13, 18, 0, K.silver);
  finish(p);
}

function bResonanceTap(p: Pix): void {
  block(p, 1, 19, 30, 5, 7, R.dark, 4);
  windings(p, 11, 25, 10, 4);
  cyanCoil(p, 3, 25, 5, 4);
  cyanCoil(p, 24, 25, 5, 4);
  // Tuning fork.
  for (const fx of [5, 23]) {
    for (let y = 3; y <= 18; y++) for (let i = 0; i < 4; i++) p.px(fx + i, y, rc(R.steel, 3 + cylBand(i, 4)));
    p.poly([[fx + 2, 0], [fx + 4, 3], [fx, 3]], K.cyan);
    p.px(fx + 1, 2, K.ice);
  }
  p.rect(5, 15, 22, 4, K.steel2);
  p.hl(5, 26, 15, K.silver);
  p.hl(5, 26, 18, K.slate);
  p.rect(14, 19, 4, 3, K.steel);
  // Resonator crystal hanging between the prongs.
  p.poly([[16, 3], [20, 9], [16, 14], [12, 9]], K.blue3);
  p.poly([[16, 3], [16, 14], [12, 9]], K.ice);
  p.px(15, 6, K.white);
  p.vl(16, 4, 13, K.cyan);
  for (const y of [6, 9, 12]) {
    p.px(10, y, K.blue3);
    p.px(21, y, K.blue3);
  }
  p.light(16, 9, 7, K.cyan);
  finish(p);
}

function bCoolingBath(p: Pix): void {
  // Low quench tub of water under a hoist gantry, a glowing ingot cooling in it.
  block(p, 1, 12, 30, 12, 7, R.heat, 3);
  p.rect(4, 14, 24, 8, K.blue2);
  p.hl(4, 27, 14, K.navy);
  p.hl(4, 27, 15, K.blue1);
  p.vl(4, 14, 21, K.blue1);
  for (const [x, y, w] of [[6, 16, 4], [21, 17, 5], [7, 20, 6], [19, 20, 4]] as const) {
    p.hl(x, x + w - 1, y, K.blue3);
  }
  p.px(24, 16, K.ice);
  p.px(9, 19, K.ice);
  // The hot ingot cooling under the surface, a warm halo in the water around it.
  p.rect(11, 16, 10, 5, K.blue3);
  p.rect(12, 17, 8, 3, K.coral);
  p.hl(12, 19, 17, K.orange);
  p.hl(14, 17, 18, K.pale);
  p.hl(12, 19, 19, K.red);
  p.light(16, 18, 6, K.orange);
  bricks(p, 1, 24, 30, 7);
  for (const x of [3, 28]) {
    rivet(p, x, 25, K.steel3, K.wine1);
    rivet(p, x, 28, K.steel3, K.wine1);
  }
  // Gantry posts and beam.
  for (const gx of [2, 27]) for (let y = 2; y <= 14; y++) for (let i = 0; i < 3; i++) p.px(gx + i, y, rc(R.steel, 3 + cylBand(i, 3)));
  block(p, 1, 0, 30, 2, 3, R.steel, 3);
  rivet(p, 4, 2, K.steel3, K.panel2);
  rivet(p, 26, 2, K.steel3, K.panel2);
  // Chain and hook.
  for (let y = 5; y <= 15; y++) p.px(16, y, y % 2 === 0 ? K.steel3 : K.slate);
  p.px(15, 15, K.steel2);
  p.px(17, 16, K.steel2);
  finish(p);
}

function bThermalExtractor(p: Pix): void {
  block(p, 5, 6, 22, 15, 10, R.heat, 3);
  // Radiator fins on both flanks.
  for (let y = 8; y <= 28; y += 2) {
    p.hl(1, 4, y, K.steel2);
    p.px(1, y, K.steel3);
    p.hl(27, 30, y, K.steel);
    p.px(30, y, K.slate);
    p.hl(1, 4, y + 1, K.panel2);
    p.hl(27, 30, y + 1, K.panel);
  }
  // Glowing heat core behind a grate.
  p.ell(9, 8, 14, 12, K.panel);
  p.ell(10, 9, 12, 10, K.red);
  p.ell(11, 10, 10, 8, K.coral);
  p.ell(12, 11, 8, 6, K.orange);
  p.ell(14, 12, 4, 4, K.pale);
  for (const x of [13, 18]) p.vl(x, 9, 18, K.panel);
  p.hl(10, 21, 14, K.panel);
  p.light(16, 14, 7, K.orange);
  // Steel pipes to the fins (copper pipes belong to the Power family), plate rivets.
  pipeH(p, 5, 9, 11, R.steel, 3);
  pipeH(p, 22, 26, 16, R.steel, 3);
  grille(p, 9, 23, 14, 5);
  for (const x of [7, 24]) rivet(p, x, 23, K.steel3, K.wine1);
  // Vent stack.
  tankV(p, 13, 0, 6, 8, R.dark, 3);
  p.ell(14, 0, 4, 2, K.ink);
  finish(p);
}

function bPressureForge(p: Pix): void {
  // Heat family: a heavy brick forge, its white-hot hearth open on the top face in front of the
  // hydraulic press head, a plain brick south face strapped in steel.
  block(p, 1, 11, 30, 11, 9, R.heat, 3);
  bricks(p, 1, 22, 30, 9);
  for (const sx of [3, 27]) {
    p.rect(sx, 22, 2, 9, K.slate);
    p.vl(sx, 22, 30, K.steel);
    rivet(p, sx, 24, K.steel3, K.panel2);
    rivet(p, sx, 28, K.steel3, K.panel2);
  }
  // Anvil plate on top with the hearth slot in it.
  block(p, 3, 12, 26, 9, 0, R.steel, 2);
  gauge(p, 4, 14);
  gauge(p, 23, 14);
  p.rect(9, 14, 14, 6, K.panel);
  p.rect(10, 15, 12, 4, K.red);
  p.rect(10, 16, 12, 3, K.coral);
  p.hl(11, 20, 16, K.orange);
  p.hl(12, 19, 17, K.pale);
  p.hl(14, 17, 17, K.white);
  p.hl(10, 21, 18, K.orange);
  p.hl(10, 21, 15, K.crimson);
  p.light(16, 17, 7, K.orange);
  // Hydraulic press cylinder behind the hearth, its steel lines.
  tankV(p, 10, 0, 12, 14, R.steel, 3, 5);
  p.ell(13, 1, 6, 3, K.slate);
  p.rect(15, 1, 2, 2, K.silver);
  for (const y of [7, 11]) for (let x = 10; x < 22; x++) if (p.on(x, y)) p.px(x, y, rc(R.steel, 2 + cylBand(x - 10, 12)));
  pipeV(p, 6, 6, 12, R.steel, 3);
  pipeV(p, 23, 6, 12, R.steel, 3);
  finish(p);
}

function bPrecisionAssembler(p: Pix): void {
  // Fabrication family, nothing borrowed: #577277 / #819796 steel with #be772b rivet dots. Its
  // own top-view shape is a round indexing table ringed with fixtures, under a slim jointed arm
  // whose fine tool head carries the work lamp (the light spot, on the top face). No glass dome
  // (glass is Chemistry's, cyan the Crystal family's) and no control panel: the south face is
  // plain plating with a centred vent, as on the Press.
  const s = R.steel;
  block(p, 1, 8, 30, 15, 8, s, 2);
  grille(p, 10, 26, 12, 3);
  for (const [x, y] of [[3, 25], [27, 25], [3, 28], [27, 28], [3, 10], [3, 20], [27, 20]] as const) {
    rivet(p, x, y, K.amber, K.panel2);
  }
  // The indexing table: a raised steel disc, six fixture slots inside its rim, the hub.
  disc(p, 5, 9, 22, 11, 2, s, 4);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const fx = Math.round(16 + Math.cos(a) * 6.2) - 1;
    const fy = Math.round(14.5 + Math.sin(a) * 2.9);
    p.hl(fx, fx + 1, fy, K.slate);
    p.hl(fx, fx + 1, fy + 1, K.steel2);
  }
  p.rect(15, 14, 2, 1, K.slate);
  p.px(15, 14, K.steel);
  // The arm: a post at the back right, two slim links with a rivet-dot elbow, the tool head.
  tankV(p, 25, 0, 5, 13, s, 3, 3);
  p.line(25, 3, 21, 5, K.steel3);
  p.line(25, 4, 21, 6, K.slate);
  p.line(20, 6, 18, 9, K.steel3);
  p.line(21, 6, 19, 9, K.slate);
  p.rect(20, 5, 2, 2, K.steel2);
  rivet(p, 20, 5, K.amber, K.slate);
  lamp(p, 15, 10, G.amber, 2, K.panel2);
  finish(p);
}

function bAttuner(p: Pix): void {
  // Alien family: grey-green machine stone with #a4dddb light, never the Crystal family's cyan.
  const a = R.alien;
  block(p, 1, 17, 30, 6, 8, a, 4);
  // The conduit channel it stands on (#25562e glass, a pale aqua core), and carved glyphs.
  p.hl(2, 29, 20, K.ice);
  p.hl(2, 29, 21, K.green1);
  for (let x = 4; x <= 27; x += 4) {
    p.px(x, 25, K.pine);
    p.px(x + 1, 26, K.green1);
    p.px(x, 27, K.pine);
  }
  // Standing stone ring with a glowing inner rim of glass.
  p.paint(4, 0, 24, 21, (x, y) => {
    if (!inEll(x - 4, y, 24, 21) || inEll(x - 9, y - 4, 14, 13)) return null;
    const t = sphereLight((x + 0.5 - 16) / 12, (y + 0.5 - 10.5) / 10.5);
    return rt([K.pine, K.panel2, K.slate, K.steel, K.steel2], t + 0.1);
  });
  p.ring(9, 4, 14, 13, K.green1);
  p.paint(9, 4, 14, 7, (x, y) => (p.get(x, y) === K.green1 ? K.ice : null));
  for (const [x, y] of [[5, 7], [26, 7], [16, 0]] as const) {
    p.px(x, y, K.ice);
  }
  // Floating engine-glass prism.
  p.poly([[16, 6], [19, 8], [19, 12], [16, 14], [13, 12], [13, 8]], K.pine);
  p.vl(14, 8, 12, K.green1);
  p.vl(16, 7, 13, K.ice);
  p.px(15, 8, K.white);
  p.px(18, 11, K.green1);
  p.light(16, 10, 6, K.ice);
  finish(p);
}

// ---------------------------------------------------------------------------------------------
// 3x3 buildings (48 x 48). The Company's wear its accent: flat company-yellow roof panels with
// white stencils over steel walls, never hazard stripes (those are Extraction's). The Engine Node
// is Alien: grey-green stone with #a4dddb light.
// ---------------------------------------------------------------------------------------------

/**
 * Company roof: flat company-yellow panels, a seam every `seam` px across and one along the
 * middle, lit back and left edges, a shaded right edge and front lip (STYLE Company accent).
 */
function companyRoof(p: Pix, x: number, y: number, w: number, h: number, seam = 11): void {
  const mid = h >= 12 ? Math.floor(h / 2) : -1;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let c = K.gold;
      if ((i > 0 && i % seam === 0) || j === mid) c = K.amber;
      if (j === 0 || i === 0) c = K.pale;
      if (i === w - 1 || j === h - 1) c = K.amber;
      p.px(x + i, y + j, c);
    }
  }
}

/** Plain steel wall plating for a south face: vertical seams, a lit top lip, darker at the foot. */
function steelWall(p: Pix, x: number, y: number, w: number, h: number, seam = 8): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let c = j >= h - 3 ? K.slate : K.steel;
      if (i % seam === seam - 1) c = K.slate;
      if (j === 0 || i === 0) c = K.steel2;
      if (i === w - 1 || j === h - 1) c = K.panel2;
      p.px(x + i, y + j, c);
    }
  }
}

/** Warm lit window with a mullion. */
function warmWindow(p: Pix, x: number, y: number, w: number, h: number): void {
  p.rect(x, y, w, h, K.panel);
  p.rect(x + 1, y + 1, w - 2, h - 2, K.gold);
  p.hl(x + 1, x + w - 2, y + 1, K.pale);
  p.vl(x + Math.floor(w / 2), y + 1, y + h - 2, K.rust1);
  p.px(x + 1, y + 1, K.white);
  p.hl(x + 1, x + w - 2, y + h - 2, K.amber);
  p.light(x + w / 2, y + h / 2, 6, K.pale);
}

/** Tiny 3x5 stencil letters, and two-row chevrons ('^' up, 'v' down) for stencil arrows. */
const GLYPH: Record<string, readonly string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  $: ['.##', '##.', '.#.', '.##', '##.'],
  '^': ['.#.', '#.#'],
  v: ['#.#', '.#.'],
};

/** Stencil text in the 3x5 glyphs, each glyph pixel s x s, 4*s apart. */
function letters(p: Pix, x: number, y: number, text: string, c: number, s = 1): void {
  for (const ch of text) {
    const g = GLYPH[ch];
    if (g) g.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') p.rect(x + i * s, y + j * s, s, s, c);
    });
    x += 4 * s;
  }
}

function bHQ(p: Pix): void {
  // Radio mast at the back right, behind the roof.
  for (let y = 0; y <= 14; y++) {
    const spread = Math.floor((y * 3) / 14);
    p.px(40 - spread, y, K.steel2);
    p.px(42 + spread, y, K.slate);
    if (y % 4 === 3) p.hl(40 - spread, 42 + spread, y, K.steel);
  }
  p.rect(40, 0, 3, 2, K.red);
  p.px(41, 0, K.coral);
  // The office: flat company-yellow roof panels with the white HQ stencil, steel walls.
  companyRoof(p, 2, 8, 44, 22, 11);
  steelWall(p, 2, 30, 44, 16);
  letters(p, 17, 14, 'HQ', K.white, 2);
  // Roof gear: an AC unit, a vent stack and a hatch.
  block(p, 5, 11, 9, 6, 3, R.steel, 4);
  p.ring(6, 12, 6, 4, K.slate);
  p.px(8, 13, K.panel2);
  tankV(p, 35, 13, 5, 9, R.dark, 4);
  p.rect(36, 24, 6, 4, K.slate);
  p.hl(36, 41, 24, K.steel2);
  p.vl(41, 25, 27, K.panel2);
  // Lit windows along the south wall (no door: the south face is plating).
  warmWindow(p, 5, 34, 10, 6);
  warmWindow(p, 19, 34, 10, 6);
  warmWindow(p, 33, 34, 10, 6);
  finish(p);
}

function bDepot(p: Pix): void {
  // Supply depot: a warehouse under flat company-yellow roof panels with a white stencil, its
  // open bays facing a loading yard of stacked goods, steel walls round the yard.
  companyRoof(p, 2, 1, 44, 17, 11);
  letters(p, 14, 7, 'DEPOT', K.white);
  // The warehouse wall facing the yard, with two open bays.
  steelWall(p, 2, 18, 44, 5);
  for (const bx of [6, 27]) {
    p.rect(bx, 19, 15, 4, K.night);
    p.hl(bx, bx + 14, 19, K.ink);
    p.rect(bx + 2, 21, 4, 2, K.earth1);
    p.px(bx + 2, 21, K.earth2);
    p.rect(bx + 8, 21, 3, 2, K.slate);
  }
  // Yard floor and its side walls.
  p.rect(2, 23, 44, 14, K.slate);
  p.paint(5, 23, 38, 14, (x, y) => (h2(x, y, 31) < 0.08 ? K.steel : (x + y) % 23 === 0 ? K.panel2 : null));
  p.hl(5, 42, 23, K.panel2);
  p.rect(2, 23, 3, 14, K.steel2);
  p.vl(2, 23, 36, K.steel3);
  p.rect(43, 23, 3, 14, K.steel);
  p.vl(45, 23, 36, K.slate);
  // Goods: crates, drums, sacks, a stack of plates.
  goodsCrate(p, 7, 25);
  goodsCrate(p, 15, 25);
  goodsCrate(p, 11, 30);
  for (const bx of [24, 29]) {
    tankV(p, bx, 25, 5, 9, R.steel, 3, 3);
    p.hl(bx, bx + 4, 29, K.slate);
  }
  p.ell(35, 26, 7, 4, K.sand);
  p.ell(36, 26, 5, 2, K.cream);
  p.ell(35, 30, 7, 4, K.earth3);
  p.ell(36, 30, 4, 2, K.sand);
  for (let k = 0; k < 3; k++) block(p, 23, 34 - k * 2, 10, 1, 1, R.steel, 4);
  // Front wall: plain steel plating.
  block(p, 1, 37, 46, 2, 8, R.steel, 3);
  for (let x = 8; x <= 40; x += 8) p.vl(x, 40, 44, K.slate);
  // Floodlight on the yard's left wall.
  lamp(p, 2, 24, G.amber, 2, K.panel);
  finish(p);
}

/** A small wooden crate seen from above, 7 x 6. */
function goodsCrate(p: Pix, x: number, y: number): void {
  block(p, x, y, 7, 4, 2, R.wood, 3);
  p.line(x + 1, y + 1, x + 5, y + 3, K.earth1);
  p.px(x, y, K.steel2);
  p.px(x + 6, y, K.steel2);
}

function bTerminal(p: Pix): void {
  // Shipping terminal: a steel loading deck, the cargo bay framed by flat company-yellow panels
  // with white stencils (arrows in, the coin), a steel container at the back, a yellow gantry.
  block(p, 1, 12, 46, 25, 10, R.steel, 2);
  for (let y = 14; y <= 35; y += 3) for (let x = 3 + (y % 2); x <= 44; x += 4) p.px(x, y, K.steel2);
  for (let x = 8; x <= 40; x += 8) p.vl(x, 39, 44, K.slate);
  // The bay: a yellow frame, walls stepping down into the dark hold.
  companyRoof(p, 6, 15, 26, 21, 13);
  p.rect(9, 18, 20, 12, K.panel2);
  p.rect(10, 19, 18, 10, K.gold);
  p.rect(10, 19, 18, 2, K.rust1);
  p.rect(10, 19, 2, 10, K.amber);
  p.rect(12, 21, 14, 7, K.panel);
  p.rect(14, 23, 10, 3, K.ink);
  p.hl(12, 25, 27, K.panel2);
  p.vl(25, 21, 27, K.panel2);
  letters(p, 18, 16, 'v', K.white);
  letters(p, 17, 31, '$', K.white);
  // Container at the back.
  block(p, 3, 1, 26, 5, 6, R.steel, 2);
  for (let x = 5; x <= 27; x += 2) p.vl(x, 6, 11, K.slate);
  p.rect(23, 6, 4, 6, K.slate);
  p.vl(25, 6, 11, K.steel2);
  // Gantry crane: yellow legs and beam, a white stencil on the beam, the hoist.
  for (const gx of [33, 43]) for (let y = 2; y <= 22; y++) for (let i = 0; i < 3; i++) p.px(gx + i, y, rc(R.paint, 4 + cylBand(i, 3)));
  block(p, 31, 0, 16, 2, 3, R.paint, 4);
  letters(p, 37, 2, '^', K.white);
  p.vl(39, 5, 14, K.slate);
  p.rect(38, 14, 3, 2, K.steel2);
  lamp(p, 44, 0, G.amber, 2, K.panel);
  finish(p);
}

function bElevator(p: Pix): void {
  // Freight elevator station: a steel deck round the shaft pit (the renderer draws the cab in
  // it), a flat company-yellow rim round the pit with white stencil arrows, the headframe with
  // its yellow crossbeam, the pulley and cables. South face: plain plating.
  block(p, 1, 9, 46, 29, 9, R.steel, 2);
  for (let y = 11; y <= 36; y += 3) for (let x = 3 + (y % 2); x <= 44; x += 4) p.px(x, y, K.steel2);
  for (let x = 8; x <= 40; x += 8) p.vl(x, 41, 45, K.slate);
  companyRoof(p, 9, 12, 30, 25, 10);
  letters(p, 15, 35, '^', K.white);
  letters(p, 30, 35, 'v', K.white);
  p.rect(11, 14, 26, 21, K.ink);
  // The shaft's far wall and guide rails.
  p.rect(11, 14, 26, 4, K.panel2);
  p.hl(11, 36, 14, K.slate);
  for (let x = 12; x <= 35; x += 4) p.vl(x, 15, 17, K.panel);
  p.rect(11, 18, 26, 3, K.night);
  for (const x of [13, 34]) {
    p.vl(x, 14, 34, K.steel);
    p.vl(x + 1, 14, 34, K.panel2);
  }
  // Headframe posts and the yellow crossbeam.
  for (const gx of [4, 40]) for (let y = 2; y <= 33; y++) for (let i = 0; i < 4; i++) p.px(gx + i, y, rc(R.steel, 3 + cylBand(i, 4)));
  for (const gx of [3, 39]) block(p, gx, 32, 6, 2, 3, R.steel, 3);
  block(p, 2, 1, 44, 2, 4, R.paint, 4);
  letters(p, 5, 4, '^', K.white);
  letters(p, 40, 4, 'v', K.white);
  // Pulley wheel and cables.
  p.ell(17, 0, 14, 9, K.slate);
  p.ring(17, 0, 14, 9, K.steel3);
  p.ring(19, 1, 10, 7, K.panel2);
  p.hl(19, 28, 4, K.steel2);
  p.vl(24, 1, 7, K.steel2);
  p.rect(23, 3, 2, 2, K.steel3);
  for (const x of [20, 27]) p.vl(x, 8, 22, K.steel3);
  lamp(p, 9, 2, G.amber, 2, K.panel);
  finish(p);
}

function bAssayLab(p: Pix): void {
  // Assay lab (Company family: flat company-yellow roof panels with white stencils, steel
  // walls): a steel analyzer dome on the roof with its slot open over the warm analyzer lamp, a
  // sample hopper and a vent stack; a steel south wall with a dim window of sample flasks in one
  // muted colour (no door: the south face shows for every facing). Nothing borrowed: no glass
  // colours (Chemistry's, and the Crystal family's cyan), no fluid colours in the flasks.
  companyRoof(p, 2, 12, 44, 18, 11);
  steelWall(p, 2, 30, 44, 16);
  letters(p, 31, 23, 'LAB', K.white);
  // Window of flasks: dark steel behind the glass, one muted sample colour.
  p.rect(13, 33, 22, 9, K.panel);
  p.rect(14, 34, 20, 7, K.panel2);
  p.hl(14, 33, 34, K.slate);
  for (const fx of [15, 20, 25, 30]) {
    p.vl(fx + 1, 35, 36, K.steel2);
    p.rect(fx, 37, 3, 3, K.earth2);
    p.px(fx, 37, K.earth3);
  }
  p.hl(14, 33, 40, K.steel);
  // Sample hopper on the roof.
  p.rect(29, 14, 8, 6, K.panel2);
  p.rect(30, 15, 6, 4, K.steel);
  p.rect(31, 16, 4, 2, K.ink);
  p.hl(30, 35, 15, K.steel2);
  // Vent stack.
  tankV(p, 38, 2, 6, 14, R.steel, 3);
  p.ell(39, 2, 4, 2, K.ink);
  // Steel analyzer dome on a base ring, plate seams down its sides, the slot open from the crown
  // with the analyzer lamp glowing warm inside it.
  p.ell(4, 13, 22, 7, K.steel2);
  const m = new Pix(48, 48);
  m.paint(5, 0, 20, 17, (x, y) => (inEll(x - 5, y, 20, 32) && y < 16 ? 0 : null));
  shadeMask(p, m, [K.slate, K.steel, K.steel2, K.steel3, K.silver], -0.06);
  for (const x of [9, 21]) p.paint(x, 0, 1, 16, (X, Y) => (m.on(X, Y) && m.on(X, Y - 1) ? K.slate : null));
  p.hl(5, 24, 12, K.steel3);
  p.rect(12, 1, 6, 12, K.panel2);
  p.rect(13, 1, 4, 11, K.night);
  p.vl(12, 1, 12, K.steel);
  lamp(p, 14, 7, G.amber, 2, K.panel2);
  p.hl(13, 16, 3, K.panel);
  finish(p);
}

function bEngineNode(p: Pix): void {
  // Alien family: carved grey-green machine stone (#394a50 / #19332d), its own conduit channels
  // of dark #25562e glass, and the one light, the #a4dddb core in its socket. No cyan, no stripes.
  const a = R.alien;
  octBlock(p, 1, 4, 46, 33, 10, 8, a, 4);
  // Fitted stone blocks with green-black seams.
  for (const y of [12, 29]) p.paint(2, y, 44, 1, (x, Y) => (p.get(x, Y) === K.steel ? K.pine : null));
  for (const [x, y0, y1] of [[12, 5, 11], [35, 5, 11], [8, 30, 36], [39, 30, 36], [6, 13, 28], [41, 13, 28]] as const) {
    p.paint(x, y0, 1, y1 - y0 + 1, (X, Y) => (p.get(X, Y) === K.steel ? K.pine : null));
  }
  p.paint(2, 5, 44, 31, (x, y) => (p.get(x, y) === K.steel && h2(x, y, 55) < 0.05 ? K.slate : null));
  // Carved panels on the south face: plain stone, no light.
  for (let x = 6; x <= 40; x += 6) {
    p.rect(x, 39, 4, 5, K.panel2);
    p.vl(x, 39, 43, K.pine);
    p.px(x + 2, 41, K.green1);
  }
  // Conduit channels running in from all four sides: dark glass with a faint core line.
  p.rect(2, 19, 44, 3, K.panel);
  p.hl(2, 45, 20, K.green1);
  p.rect(22, 5, 4, 32, K.panel);
  p.vl(23, 5, 36, K.green1);
  p.vl(24, 5, 36, K.pine);
  // Stone gear ring.
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4 + Math.PI / 8;
    const tx = Math.round(24 + Math.cos(ang) * 15 - 2);
    const ty = Math.round(20 + Math.sin(ang) * 12 - 2);
    block(p, tx, ty, 5, 3, 2, a, 5);
  }
  p.ell(10, 8, 28, 25, K.steel);
  p.ring(10, 8, 28, 25, K.steel2);
  p.paint(10, 8, 28, 25, (x, y) => (inEll(x - 10, y - 8, 28, 25) && !inEll(x - 11, y - 9, 26, 23) && y > 22 ? K.slate : null));
  p.ell(13, 11, 22, 19, K.panel2);
  // Socket with the core: a dark collar, a ring of glass, the pale aqua core.
  p.ell(16, 13, 16, 15, K.panel);
  p.ell(17, 14, 14, 13, K.ink);
  p.ring(17, 14, 14, 13, K.green1);
  p.ell(19, 15, 10, 10, K.green1);
  p.ell(20, 16, 8, 8, K.steel2);
  p.ell(21, 17, 6, 6, K.ice);
  p.px(22, 18, K.white);
  p.px(23, 18, K.white);
  p.light(24, 20, 9, K.ice);
  finish(p);
}

// ---------------------------------------------------------------------------------------------
// The Drill (5x5, 80 px): working rig, or broken (leaning derrick, missing panels, rust, dark)
// ---------------------------------------------------------------------------------------------

/** Rust blotches over company paint and steel (the broken drill). */
function rustOver(p: Pix, x: number, y: number, w: number, h: number, seed: number, amount: number): void {
  const yellow = new Set([K.gold, K.pale, K.amber]);
  const steel = new Set([K.steel, K.steel2, K.steel3, K.silver]);
  p.paint(x, y, w, h, (X, Y) => {
    const c = p.get(X, Y);
    if (c === CLEAR) return null;
    const n = vnoise(X, Y, 6, seed) * 0.75 + h2(X, Y, seed + 1) * 0.25;
    if (n > amount) return null;
    if (yellow.has(c)) return c === K.pale ? K.amber : n < amount * 0.45 ? K.rust0 : K.rust1;
    if (steel.has(c)) return n < amount * 0.5 ? K.earth1 : K.earth2;
    return null;
  });
}

function drill(p: Pix, broken: boolean): void {
  const lean = broken ? 9 : 0;
  // Crawler tracks on both sides.
  for (const tx of [2, 68]) {
    p.rect(tx, 30, 10, 49, K.panel);
    for (let y = 30; y <= 77; y++) {
      const seg = y % 4;
      p.hl(tx + 1, tx + 8, y, seg === 0 ? K.slate : seg === 1 ? K.panel2 : K.panel);
      p.px(tx + 1, y, seg === 0 ? K.steel : K.panel2);
    }
    for (let y = 34; y <= 74; y += 10) {
      p.ell(tx + 2, y, 6, 5, K.slate);
      p.ell(tx + 3, y + 1, 4, 3, K.panel2);
      p.px(tx + 3, y + 1, K.steel2);
    }
    p.hl(tx, tx + 9, 78, K.ink);
  }
  if (broken) p.rect(70, 52, 8, 6, CLEAR);
  // Deck: steel plate with company-yellow trim and a hazard-striped south face.
  block(p, 10, 28, 60, 42, 9, R.steel, 2);
  for (let y = 31; y <= 67; y += 3) for (let x = 12 + (y % 2) * 2; x <= 67; x += 4) p.px(x, y, K.steel2);
  p.rect(10, 28, 60, 2, K.gold);
  p.hl(10, 69, 28, K.pale);
  p.rect(10, 28, 2, 42, K.gold);
  p.rect(68, 30, 2, 40, K.amber);
  hazard(p, 11, 71, 58, 6);
  for (let x = 14; x <= 66; x += 13) rivet(p, x, 70, K.steel3, K.panel2);
  // Handrails.
  for (let x = 13; x <= 67; x++) if (x % 9 !== 4) p.px(x, 68, x % 9 === 3 ? K.amber : K.gold);
  // Bore collar and the bit.
  const bx = 40 + (broken ? 3 : 0);
  p.paint(25, 46, 30, 18, (x, y) => (inEll(x - 25, y - 46, 30, 18) ? (((x - y) & 3) < 2 ? K.gold : K.panel) : null));
  p.ell(28, 48, 24, 14, K.panel2);
  p.ell(30, 49, 20, 11, K.ink);
  if (broken) {
    p.poly([[bx - 6, 50], [bx + 7, 53], [bx + 2, 60], [bx - 8, 57]], K.earth1);
    p.line(bx - 6, 51, bx + 5, 54, K.earth2);
    p.line(bx - 7, 55, bx + 2, 58, K.earth0);
  } else {
    p.ell(31, 49, 18, 10, K.slate);
    p.paint(31, 49, 18, 10, (x, y) => {
      if (!inEll(x - 31, y - 49, 18, 10)) return null;
      const a = Math.atan2((y + 0.5 - 54) * 1.8, x + 0.5 - 40);
      const r = Math.hypot(x + 0.5 - 40, (y + 0.5 - 54) * 1.8);
      const groove = Math.sin(a * 3 + r * 0.55) > 0.3;
      return groove ? (y < 54 ? K.steel3 : K.steel) : y < 53 ? K.steel2 : K.slate;
    });
    p.rect(39, 53, 3, 2, K.silver);
    p.light(40, 54, 8, K.pale);
  }
  // Engine house (back left) with exhaust stacks.
  block(p, 13, 14, 22, 12, 10, R.paint, 4);
  grille(p, 15, 28, 18, 5, K.rust0, K.amber);
  p.rect(16, 16, 8, 7, K.amber);
  p.hl(16, 23, 16, K.gold);
  for (let y = 17; y <= 22; y += 2) p.hl(17, 22, y, K.rust1);
  for (const sx of [26, 30]) {
    tankV(p, sx, 2, 4, 15, R.dark, 4, 2);
    p.hl(sx, sx + 3, 2, K.ink);
  }
  if (broken) {
    // A panel torn off: dark interior and bare ribs.
    p.rect(15, 15, 10, 9, K.ink);
    p.vl(18, 15, 23, K.panel2);
    p.vl(22, 15, 23, K.panel2);
    p.hl(15, 24, 19, K.panel2);
    p.px(15, 15, K.rust1);
    p.px(24, 23, K.rust1);
  }
  // Cable drum (back right).
  for (const sx of [50, 66]) p.rect(sx, 26, 3, 6, K.slate);
  drumH(p, 49, 15, 21, 12, R.steel, 3);
  for (let x = 51; x <= 67; x += 2) p.vl(x, 16, 25, K.slate);
  p.rect(49, 15, 3, 12, K.gold);
  p.rect(67, 15, 3, 12, K.amber);
  if (broken) {
    // Slack cable hanging off the drum.
    for (let x = 58; x <= 74; x++) p.px(x, 27 + Math.round(Math.sin(((x - 58) / 16) * Math.PI) * 9), K.panel2);
  }
  // Operator cab (front right).
  block(p, 53, 42, 15, 10, 13, R.paint, 4);
  p.rect(55, 54, 11, 6, K.panel);
  if (broken) {
    p.rect(56, 55, 9, 4, K.night);
    p.line(56, 55, 61, 58, K.steel2);
    p.line(61, 55, 64, 57, K.slate);
  } else {
    p.rect(56, 55, 9, 4, K.gold);
    p.hl(56, 64, 55, K.pale);
    p.px(56, 55, K.white);
    p.vl(60, 55, 58, K.rust1);
    p.light(60, 57, 7, K.pale);
  }
  p.rect(54, 44, 13, 2, K.pale);
  rivet(p, 55, 62, K.pale, K.rust1);
  if (broken) {
    rustOver(p, 0, 0, 80, 80, 404, 0.34);
    // Missing deck plates.
    p.rect(14, 56, 9, 6, K.ink);
    p.hl(14, 22, 58, K.panel2);
    p.vl(18, 56, 61, K.panel2);
    p.rect(44, 33, 6, 5, K.ink);
    p.hl(44, 49, 35, K.panel2);
  }
  finish(p);

  // Derrick: an open lattice tower over the bore, laid over the finished rig (leaning when broken).
  const t = new Pix(80, 80);
  const top = broken ? 7 : 4;
  lattice(t, 24, 56, 58, 33, 47, top, 6, lean);
  if (broken) {
    const sx = 40 + lean - 1;
    t.line(sx, top + 4, bx - 2, 51, K.steel3);
    t.line(sx + 1, top + 4, bx - 1, 51, K.steel);
    t.line(sx + 2, top + 4, bx, 51, K.panel2);
    // A snapped brace hanging off the left leg.
    t.line(30, 35, 27, 44, K.steel2);
    t.line(31, 35, 28, 44, K.slate);
  } else {
    t.rect(38, 6, 4, 46, K.steel);
    t.vl(38, 6, 51, K.steel3);
    t.vl(39, 6, 51, K.steel2);
    t.vl(41, 6, 51, K.slate);
    for (let y = 12; y <= 46; y += 8) t.hl(37, 42, y, K.amber);
  }
  // Crown block with its sheaves and work lamp.
  const cx = 31 + lean;
  block(t, cx, top - 4, 18, 3, 5, R.paint, 4);
  t.rect(cx + 3, top + 1, 12, 2, K.rust1);
  for (const sx of [cx + 4, cx + 9]) {
    t.ell(sx, top - 3, 5, 4, K.slate);
    t.px(sx + 2, top - 2, K.steel3);
  }
  if (broken) {
    t.rect(cx + 14, top - 3, 3, 3, K.panel2);
    t.px(cx + 15, top - 2, K.steel2);
    t.px(cx + 14, top - 3, K.night);
    rustOver(t, 0, 0, 80, 80, 405, 0.4);
  } else {
    lamp(t, cx + 14, top - 3, G.amber, 2, K.panel2);
    for (const l of t.lights) p.lights.push(l);
  }
  overlay(p, t, K.slate);
}

/** Open lattice tower: 2 px raking legs, a brace at every bay and X bracing, bays left empty. */
function lattice(t: Pix, xl0: number, xr0: number, y0: number, xl1: number, xr1: number, y1: number, bays: number, lean = 0): void {
  const f = (y: number): number => (y0 - y) / (y0 - y1);
  const L = (y: number): number => Math.round(xl0 + (xl1 - xl0 + lean) * f(y));
  const Rt = (y: number): number => Math.round(xr0 + (xr1 - xr0 + lean) * f(y));
  for (let k = 0; k <= bays; k++) {
    const by = Math.round(y1 + ((y0 - y1) * k) / bays);
    t.hl(L(by), Rt(by), by, K.steel3);
    t.hl(L(by + 1), Rt(by + 1), by + 1, K.slate);
    if (k < bays) {
      // One diagonal per bay, alternating (a Warren truss reads cleaner than X bracing).
      const ny = Math.round(y1 + ((y0 - y1) * (k + 1)) / bays);
      if (k % 2 === 0) t.line(L(by) + 2, by + 2, Rt(ny) - 2, ny - 1, K.steel2);
      else t.line(Rt(by) - 2, by + 2, L(ny) + 2, ny - 1, K.steel);
    }
  }
  for (let y = y1; y <= y0; y++) {
    t.px(L(y), y, K.silver);
    t.px(L(y) + 1, y, K.steel2);
    t.px(Rt(y) - 1, y, K.steel);
    t.px(Rt(y), y, K.slate);
  }
}

// ---------------------------------------------------------------------------------------------
// The Heart (7x7, 112 px): a stepped stone dais of geared rings around an engine-glass core
// ---------------------------------------------------------------------------------------------

/** A short upright disc in 3/4: elliptical top over a curved south face `depth` rows tall. */
function disc(p: Pix, x: number, y: number, w: number, h: number, depth: number, r: Ramp, b: number): void {
  for (let i = 0; i < w; i++) {
    let low = -1;
    for (let j = h - 1; j >= 0; j--) {
      if (inEll(i, j, w, h)) {
        low = j;
        break;
      }
    }
    if (low < 0) continue;
    const band = cylBand(i, w);
    for (let d = 1; d <= depth; d++) p.px(x + i, y + low + d, d === depth ? rc(r, b - 3) : rc(r, b - 1 + band));
  }
  lid(p, x, y, w, h, r, b);
}

function heart(p: Pix, awake: boolean): void {
  const stone: Ramp = awake
    ? [K.ink, K.pine, K.panel2, K.slate, K.steel, K.steel2, K.steel3]
    : [K.ink, K.ink, K.night, K.panel, K.panel2, K.slate, K.steel];
  // Alien light: #a4dddb in #25562e glass when awake, dark glass while it sleeps (never cyan).
  const glow: Ramp = awake ? [K.green1, K.steel2, K.ice, K.white] : [K.night, K.panel, K.pine, K.green1];
  const cx = 56;
  // Gear teeth around the base.
  for (let k = 0; k < 20; k++) {
    const ang = (k / 20) * Math.PI * 2;
    const tx = Math.round(cx + Math.cos(ang) * 50 - 3);
    const ty = Math.round(50 + Math.sin(ang) * 44 - 3);
    block(p, tx, ty, 7, 5, 4, stone, 4);
  }
  // Base disc, middle ring, upper ring.
  disc(p, 6, 8, 100, 88, 12, stone, 3);
  for (let k = 0; k < 24; k++) {
    const ang = (k / 24) * Math.PI * 2;
    const gx = Math.round(cx + Math.cos(ang) * 44);
    const gy = Math.round(52 + Math.sin(ang) * 38);
    p.px(gx, gy, k % 2 === 0 ? rc(glow, 1) : rc(stone, 2));
  }
  disc(p, 20, 18, 72, 62, 8, stone, 4);
  p.ring(26, 23, 60, 51, rc(stone, 2));
  disc(p, 33, 27, 46, 40, 7, stone, 5);
  // Conduits running in from the four sides, glowing when awake.
  const conduit = (x0: number, y0: number, x1: number, y1: number): void => {
    const horiz = y0 === y1;
    for (let t = 0; t <= Math.abs(horiz ? x1 - x0 : y1 - y0); t++) {
      const x = horiz ? Math.min(x0, x1) + t : x0;
      const y = horiz ? y0 : Math.min(y0, y1) + t;
      if (horiz) {
        p.px(x, y - 2, rc(stone, 1));
        p.px(x, y - 1, rc(glow, 1));
        p.px(x, y, rc(glow, 2));
        p.px(x, y + 1, rc(glow, 0));
        p.px(x, y + 2, rc(stone, 1));
      } else {
        p.px(x - 2, y, rc(stone, 1));
        p.px(x - 1, y, rc(glow, 1));
        p.px(x, y, rc(glow, 2));
        p.px(x + 1, y, rc(glow, 0));
        p.px(x + 2, y, rc(stone, 1));
      }
    }
  };
  conduit(4, 52, 36, 52);
  conduit(76, 52, 108, 52);
  conduit(cx, 6, cx, 30);
  conduit(cx, 74, cx, 109);
  if (awake) for (const [x, y] of [[14, 52], [27, 52], [88, 52], [100, 52], [cx, 14], [cx, 92], [cx, 102]] as const) p.px(x, y, K.white);
  // Glowing glyph ring on the upper step.
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2 + 0.2;
    const gx = Math.round(cx + Math.cos(ang) * 19);
    const gy = Math.round(46 + Math.sin(ang) * 15);
    p.px(gx, gy, rc(glow, k % 4 === 0 ? 3 : 1));
    p.px(gx + 1, gy, rc(glow, 0));
  }
  // The core seated in a socket: dark collar, teal rim light, a sphere of engine glass.
  p.ell(38, 27, 36, 35, rc(stone, 1));
  p.ring(38, 27, 36, 35, rc(glow, 1));
  const core = new Pix(112, 112);
  core.ell(41, 29, 30, 30, 0);
  const coreRamp: Ramp = awake ? [K.pine, K.green1, K.steel2, K.ice, K.ice, K.white] : [K.ink, K.pine, K.pine, K.green1, K.slate];
  shadeMask(p, core, coreRamp, awake ? 0.02 : -0.1);
  // Teal veins across the glass.
  for (const [x0, y0, x1, y1] of [[44, 39, 52, 45], [52, 45, 50, 55], [66, 37, 60, 46], [60, 46, 64, 54], [50, 55, 56, 58]] as const) {
    p.line(x0, y0, x1, y1, awake ? K.white : K.green1);
  }
  if (awake) {
    p.ell(48, 34, 10, 8, K.ice);
    p.ell(50, 35, 5, 4, K.white);
    p.px(63, 51, K.ice);
  }
  // Four stone claws gripping the core.
  for (const [x, y, dx] of [[36, 30, 1], [68, 30, -1], [36, 52, 1], [68, 52, -1]] as const) {
    block(p, x, y, 8, 4, 4, stone, 5);
    p.px(dx > 0 ? x + 7 : x, y + 3, rc(glow, 2));
  }
  if (awake) p.light(56, 44, 22, K.ice);
  finish(p);
}

// =============================================================================================
// Items (i_<id>): 16 x 16, art inside the central 12 x 12 (x and y in 2..13, the outline
// included), 14 wide for beams. Follow the rock: raw ores are dull lumps with ore flecks, smelted
// metal is a bar with a strong top highlight, pressed parts are crisp shapes, assembled parts mix
// materials with a bright detail, exotics glow or wear a casing.
// =============================================================================================

const ITEM_ART: Record<string, (p: Pix) => void> = {
  // Layer 0
  iron_ore: iIronOre,
  copper_ore: iCopperOre,
  stone: iStone,
  iron_ingot: (p) => ingot(p, [K.panel2, K.slate, K.steel, K.steel2, K.steel3, K.silver, K.white], K.panel2),
  copper_ingot: (p) => ingot(p, [K.earth0, K.rust1, K.amber, K.orange, K.gold, K.pale, K.white], K.earth0),
  brick: iBrick,
  iron_plate: iIronPlate,
  gear: iGear,
  copper_wire: iCopperWire,
  reinforced_plate: iReinforcedPlate,
  // Layer 1
  coal: iCoal,
  steel_ingot: iSteelIngot,
  steel_beam: iSteelBeam,
  motor: iMotor,
  drill_bit: iDrillBit,
  // Layer 2
  sapstone: iSapstone,
  cobalt_ore: iCobaltOre,
  resin: iResin,
  cobalt_ingot: (p) => ingot(p, [K.navy, K.blue1, K.blue2, K.blue3, K.cyan, K.ice, K.white], K.navy),
  glowcap: iGlowcap,
  mycelium: iMycelium,
  spore_dust: iSporeDust,
  biofuel: iBiofuel,
  insulation: iInsulation,
  filter: iFilter,
  cobalt_drill_head: iCobaltDrillHead,
  // Layer 3
  chorus_crystal: iChorusCrystal,
  cut_crystal: (p) => cutGem(p, [K.navy, K.blue1, K.blue2, K.blue3, K.cyan, K.ice, K.white], false),
  crystal_grit: iCrystalGrit,
  charged_crystal: (p) => cutGem(p, [K.blue1, K.blue2, K.blue3, K.cyan, K.ice, K.white, K.white], true),
  conductive_powder: iConductivePowder,
  overcharged_crystal: iOverchargedCrystal,
  resonant_core: iResonantCore,
  battery: iBattery,
  circuit: iCircuit,
  // Layer 4
  emberite: iEmberite,
  aggregate: iAggregate,
  slag: iSlag,
  hot_ember_ingot: (p) => ingot(p, [K.crimson, K.red, K.coral, K.orange, K.pale, K.white, K.white], K.wine1),
  cold_ember_ingot: (p) => ingot(p, [K.wine0, K.wine1, K.earth0, K.crimson, K.red, K.coral, K.orange], K.wine0),
  ember_core: iEmberCore,
  heat_shield: iHeatShield,
  // Layer 5
  thrumstone: iThrumstone,
  engine_glass: iEngineGlass,
  heartstone: iHeartstone,
};

function drawItem(p: Pix, it: ItemDef): void {
  const art = ITEM_ART[it.id];
  if (art) art(p);
  else genericItem(p, it);
}

/** Items added to the data later still get an icon in their own colors and shape. */
function genericItem(p: Pix, it: ItemDef): void {
  const body = pal(it.color[0]);
  const hi = pal(it.color[1]);
  const r: Ramp = [K.ink, body, body, hi, hi];
  switch (it.shape) {
    case 'bar':
      ingot(p, [K.ink, K.panel, body, body, hi, hi, K.white], K.panel);
      return;
    case 'gem':
      cutGem(p, [K.ink, body, body, hi, hi, K.white, K.white], !!it.glow);
      return;
    case 'dust':
      heap(p, [K.ink, body, body, hi, hi], [hi], 2);
      return;
    default: {
      const m = new Pix(16, 16);
      if (it.shape === 'plate' || it.shape === 'block') m.rect(3, 4, 10, 8, 0);
      else m.ell(3, 3, 10, 10, 0);
      volume(p, m, r);
      p.outline(K.panel, K.ink);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------------------------

/** Shade a mask as one volume lit from the upper left, with a rim light and rim shadow. */
function volume(p: Pix, m: Pix, r: Ramp, bias = 0): void {
  shadeMask(p, m, r, bias);
  const set: number[] = [];
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.on(x, y)) continue;
      const i = r.indexOf(p.get(x, y));
      if (i < 0) continue;
      const lit = !m.on(x, y - 1) || !m.on(x - 1, y);
      const shade = !m.on(x, y + 1) || !m.on(x + 1, y);
      if (lit && !shade) set.push(x, y, r[Math.min(r.length - 1, i + 1)]);
      else if (shade && !lit) set.push(x, y, r[Math.max(0, i - 1)]);
    }
  }
  for (let i = 0; i < set.length; i += 3) p.px(set[i], set[i + 1], set[i + 2]);
}

/** A rock-like lump from a polygon, volume shaded. Returns its mask. */
function lumpShape(p: Pix, shape: readonly Pt[], r: Ramp, bias = 0): Pix {
  const m = new Pix(16, 16);
  m.poly(shape, 0);
  volume(p, m, r, bias);
  return m;
}

/** True when a pixel and its four neighbours are all inside the mask. */
function inside(m: Pix, x: number, y: number): boolean {
  return m.on(x, y) && m.on(x - 1, y) && m.on(x + 1, y) && m.on(x, y - 1) && m.on(x, y + 1);
}

/** Ore flecks: a bright pixel with a darker one to its lower right, only inside the lump. */
function flecks(p: Pix, m: Pix, spots: readonly Pt[], hi: number, lo: number): void {
  for (const [x, y] of spots) {
    if (!m.on(x, y)) continue;
    p.px(x, y, hi);
    if (m.on(x + 1, y + 1)) p.px(x + 1, y + 1, lo);
  }
}

/**
 * Smelted bar: trapezoid prism with a strong top highlight. r: 7 shades dark -> light
 * (r[4] top face, r[5]/r[6] highlights, r[2] front face).
 */
function ingot(p: Pix, r: Ramp, outlineLit: number): void {
  // Top face, front face.
  p.poly([[5, 4], [11, 4], [12, 8], [4, 8]], r[4]);
  p.poly([[4, 8], [12, 8], [13, 12], [3, 12]], r[2]);
  p.hl(5, 10, 4, r[5]);
  p.hl(4, 11, 8, r[3]);
  p.hl(3, 12, 11, r[1]);
  // Slanted ends: lit on the left, shaded on the right.
  for (let y = 4; y <= 11; y++) {
    let x0 = 15;
    let x1 = 0;
    for (let x = 0; x < 16; x++) {
      if (!p.on(x, y)) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
    if (y < 8) {
      p.px(x0, y, r[5]);
      p.px(x1, y, r[3]);
    } else {
      p.px(x0, y, r[3]);
      p.px(x1, y, r[1]);
    }
  }
  // Specular glint and a cast mark.
  p.hl(6, 8, 5, r[6]);
  p.px(6, 6, r[6]);
  p.hl(7, 9, 10, r[1]);
  p.px(7, 9, r[1]);
  p.outline(outlineLit, K.ink);
}

/** Powder heap: a cone of powder, lit on its left flank, grainy, with colored specks. */
function heap(p: Pix, r: Ramp, specks: readonly number[], seed: number): void {
  const top = (x: number): number => Math.round(12.4 - 8.2 * Math.max(0, 1 - ((x + 0.5 - 8) / 5.6) ** 2));
  const rr = rng(seed * 31 + 7);
  for (let x = 3; x <= 12; x++) {
    const t0 = top(x);
    for (let y = t0; y <= 12; y++) {
      // Left flank lit, right flank in shade, the crest brightest.
      const side = (x + 0.5 - 8) / 5;
      let i = 2 - Math.round(side * 1.6) + (y === t0 ? 1 : 0) - (y >= 12 ? 1 : 0);
      const v = rr();
      if (v < 0.22) i -= 1;
      else if (v > 0.9) i += 1;
      p.px(x, y, rc(r, i));
    }
  }
  for (let k = 0; k < 7; k++) {
    const x = 3 + Math.floor(rr() * 10);
    const y = top(x) + 1 + Math.floor(rr() * Math.max(1, 11 - top(x)));
    if (y < 12 && p.on(x, y)) p.px(x, y, specks[k % specks.length]);
  }
  p.outline(r[0], K.ink);
}

/**
 * Brilliant-cut gem, symmetric: table, crown facets, pavilion. r: 7 shades dark -> light.
 * charged adds a white-hot center and spark pixels.
 */
function cutGem(p: Pix, r: Ramp, charged: boolean): void {
  // Crown (upper trapezoid) and pavilion (lower triangle).
  p.poly([[5, 3], [11, 3], [13, 7], [3, 7]], r[4]);
  p.poly([[3, 7], [13, 7], [8, 13]], r[2]);
  // Table and crown facets.
  p.hl(6, 9, 4, r[5]);
  p.hl(6, 9, 5, r[5]);
  p.px(5, 4, r[6]);
  p.px(4, 5, r[5]);
  p.px(11, 5, r[3]);
  p.px(10, 4, r[4]);
  p.hl(3, 12, 6, r[3]);
  p.px(3, 6, r[5]);
  // Pavilion facets: lit left half, shaded right half, a center keel.
  p.paint(3, 7, 10, 6, (x, y) => {
    if (!p.on(x, y)) return null;
    if (x < 8) return (x + y) % 3 === 0 ? r[4] : r[3];
    return (x - y) % 3 === 0 ? r[2] : r[1];
  });
  p.vl(7, 7, 11, r[4]);
  p.vl(8, 7, 11, r[2]);
  p.hl(3, 12, 7, r[5]);
  p.px(12, 7, r[3]);
  if (charged) {
    p.rect(7, 5, 2, 4, r[6]);
    p.px(6, 6, r[5]);
    p.px(9, 7, r[5]);
  } else {
    p.px(5, 8, r[6]);
  }
  p.outline(r[0], K.ink);
  if (charged) {
    for (const [x, y] of [[2, 3], [13, 2], [13, 11], [2, 11]] as const) {
      p.px(x, y, K.ice);
    }
    p.px(3, 2, K.cyan);
    p.px(12, 3, K.cyan);
  }
}

// ---------------------------------------------------------------------------------------------
// Raw lumps
// ---------------------------------------------------------------------------------------------

function iIronOre(p: Pix): void {
  const m = lumpShape(
    p,
    [[4, 5], [7, 3], [11, 3], [13, 6], [13, 10], [11, 13], [5, 13], [3, 10]],
    [K.plum, K.earth0, K.earth1, K.earth2, K.earth3],
  );
  // Facet cracks, rust stains, metallic iron glints.
  p.line(7, 4, 6, 8, K.earth0);
  p.line(6, 8, 10, 10, K.earth0);
  p.px(10, 5, K.coral);
  p.px(4, 9, K.rust1);
  flecks(p, m, [[8, 6], [5, 11], [10, 8], [11, 11]], K.silver, K.slate);
  p.px(9, 6, K.steel2);
  p.outline(K.plum, K.ink);
}

function iCopperOre(p: Pix): void {
  const m = lumpShape(
    p,
    [[3, 7], [5, 4], [9, 3], [12, 5], [13, 9], [11, 12], [6, 13], [3, 11]],
    [K.pine, K.panel2, K.slate, K.steel, K.steel2],
  );
  // Green malachite streaks and bright copper flecks.
  for (const [x0, y0, x1, y1] of [[4, 10, 9, 5], [7, 12, 12, 7]] as const) {
    p.line(x0, y0, x1, y1, K.green2);
    p.line(x0, y0 - 1, x1, y1 - 1, K.green3);
  }
  flecks(p, m, [[6, 5], [10, 9], [5, 11]], K.orange, K.earth1);
  p.px(6, 4, K.pale);
  p.px(11, 6, K.orange);
  p.outline(K.pine, K.ink);
}

function iStone(p: Pix): void {
  const m = new Pix(16, 16);
  m.ell(3, 4, 10, 9, 0);
  m.rect(4, 6, 8, 5, 0);
  volume(p, m, [K.slate, K.steel, K.steel2, K.steel3, K.silver]);
  // A crack and a few speckles.
  p.line(8, 5, 7, 8, K.steel);
  p.px(8, 9, K.steel);
  p.px(9, 10, K.slate);
  for (const [x, y] of [[5, 9], [10, 7], [6, 11]] as const) {
    p.px(x, y, K.steel2);
  }
  p.px(5, 6, K.white);
  p.outline(K.slate, K.ink);
}

function iCoal(p: Pix): void {
  const m = lumpShape(
    p,
    [[3, 8], [5, 4], [9, 3], [12, 4], [13, 8], [12, 12], [7, 13], [4, 12]],
    [K.ink, K.night, K.panel, K.panel2, K.slate],
    0.05,
  );
  // Glossy facets: sharp edges with blue-grey glints.
  p.line(5, 5, 8, 9, K.night);
  p.line(8, 9, 12, 7, K.night);
  p.line(8, 9, 7, 12, K.night);
  p.hl(6, 8, 4, K.steel);
  p.px(9, 4, K.steel2);
  p.px(5, 6, K.steel);
  p.px(10, 6, K.slate);
  p.px(4, 9, K.slate);
  if (m.on(11, 9)) p.px(11, 9, K.slate);
  p.outline(K.night, K.ink);
}

function iSapstone(p: Pix): void {
  // Cobalt ore sealed in fungal resin: blue rock under an amber shell with drips.
  const m = lumpShape(
    p,
    [[3, 8], [5, 4], [10, 3], [13, 6], [13, 10], [10, 13], [5, 13], [3, 11]],
    [K.navy, K.blue1, K.blue2, K.blue3, K.cyan],
  );
  p.paint(3, 3, 11, 11, (x, y) => {
    if (!m.on(x, y)) return null;
    const shell = x + y * 1.15 < 13.5 || (x === 6 && y <= 10) || (x === 9 && y <= 8) || (x === 10 && y <= 7);
    if (!shell) return null;
    if (x + y * 1.15 < 9) return K.pale;
    return (x + y) % 4 === 0 ? K.amber : K.gold;
  });
  p.px(6, 11, K.amber);
  p.px(9, 9, K.amber);
  p.px(5, 5, K.white);
  flecks(p, m, [[11, 9], [8, 11]], K.cyan, K.blue1);
  p.outline(K.rust1, K.ink);
}

function iCobaltOre(p: Pix): void {
  // Washed: the same lump, rounder, pure ore color, one highlight.
  const m = new Pix(16, 16);
  m.ell(3, 4, 10, 9, 0);
  m.ell(4, 3, 7, 5, 0);
  volume(p, m, [K.navy, K.blue1, K.blue2, K.blue3, K.cyan]);
  p.px(9, 9, K.blue1);
  p.px(10, 8, K.blue2);
  p.rect(5, 5, 2, 1, K.ice);
  p.px(5, 6, K.cyan);
  p.outline(K.navy, K.ink);
}

function iEmberite(p: Pix): void {
  // Dark red crust split by glowing orange cracks.
  lumpShape(
    p,
    [[3, 9], [4, 5], [8, 3], [12, 4], [13, 9], [11, 13], [6, 13]],
    [K.wine0, K.wine1, K.crimson, K.red, K.coral],
  );
  for (const [x0, y0, x1, y1] of [[5, 6, 8, 8], [8, 8, 12, 6], [8, 8, 7, 12]] as const) {
    p.line(x0, y0, x1, y1, K.orange);
  }
  p.px(8, 8, K.pale);
  p.px(7, 7, K.pale);
  p.px(10, 7, K.pale);
  p.px(5, 5, K.coral);
  p.outline(K.wine1, K.ink);
}

function iSlag(p: Pix): void {
  // Spent stone: a low porous blob.
  const m = new Pix(16, 16);
  m.ell(3, 6, 10, 7, 0);
  m.ell(4, 4, 7, 5, 0);
  m.ell(8, 5, 4, 4, 0);
  volume(p, m, [K.night, K.panel, K.panel2, K.slate, K.steel]);
  for (const [x, y] of [[5, 6], [9, 7], [6, 9], [10, 10], [8, 10]] as const) {
    p.px(x, y, K.ink);
    p.px(x, y + 1, K.steel);
  }
  p.px(10, 5, K.rust1);
  p.outline(K.panel, K.ink);
}

function iThrumstone(p: Pix): void {
  // A grey stone cut too clean, with a teal line humming through it.
  const m = lumpShape(
    p,
    [[3, 6], [6, 3], [11, 3], [13, 6], [13, 10], [10, 13], [5, 13], [3, 10]],
    [K.panel2, K.slate, K.steel, K.steel2, K.steel3],
  );
  p.paint(3, 3, 11, 11, (x, y) => (m.on(x, y) && y === 8 ? K.cyan : m.on(x, y) && y === 7 && x > 4 && x < 12 ? K.blue2 : null));
  p.hl(6, 9, 8, K.ice);
  p.px(7, 8, K.white);
  p.px(8, 5, K.cyan);
  p.px(8, 11, K.cyan);
  p.px(5, 5, K.steel3);
  p.outline(K.panel2, K.ink);
}

// ---------------------------------------------------------------------------------------------
// Bars, plates and pressed parts
// ---------------------------------------------------------------------------------------------

function iSteelIngot(p: Pix): void {
  // A darker blued bar, flatter than iron, with a stamped band.
  p.poly([[5, 5], [11, 5], [12, 8], [4, 8]], K.steel2);
  p.poly([[4, 8], [12, 8], [13, 11], [3, 11]], K.slate);
  p.hl(5, 10, 5, K.silver);
  p.hl(4, 11, 8, K.steel);
  p.hl(3, 12, 10, K.panel2);
  p.px(4, 7, K.steel3);
  p.px(5, 5, K.white);
  p.hl(6, 7, 6, K.white);
  p.px(11, 6, K.steel);
  p.px(12, 9, K.panel2);
  p.vl(8, 5, 7, K.steel);
  p.vl(8, 8, 10, K.panel2);
  p.outline(K.panel2, K.ink);
}

function iBrick(p: Pix): void {
  // A fired brick: top face, long front face with pits.
  block(p, 3, 4, 10, 4, 5, [K.wine1, K.crimson, K.red, K.coral, K.orange], 3);
  p.px(4, 5, K.pale);
  p.px(9, 6, K.red);
  for (const [x, y] of [[5, 10], [9, 9], [11, 11], [7, 11]] as const) {
    p.px(x, y, K.crimson);
  }
  p.px(6, 9, K.coral);
  p.outline(K.wine1, K.ink);
}

function iIronPlate(p: Pix): void {
  // Square plate with a crisp bevel.
  block(p, 3, 3, 10, 8, 2, [K.slate, K.steel, K.steel2, K.steel3, K.silver, K.white], 3);
  p.hl(3, 12, 3, K.white);
  p.vl(3, 3, 10, K.silver);
  p.rect(5, 5, 6, 4, K.steel3);
  p.hl(5, 10, 9, K.silver);
  p.vl(11, 5, 9, K.silver);
  p.hl(5, 10, 4, K.steel2);
  p.vl(4, 5, 9, K.steel2);
  p.px(5, 5, K.white);
  p.outline(K.slate, K.ink);
}

function iReinforcedPlate(p: Pix): void {
  // Iron plate riveted over brick: red brick showing under the steel, brass rivets.
  p.rect(5, 5, 8, 7, K.red);
  p.hl(5, 12, 11, K.crimson);
  p.vl(12, 5, 11, K.crimson);
  p.px(12, 5, K.coral);
  block(p, 3, 3, 9, 6, 2, [K.panel2, K.slate, K.steel, K.steel2, K.steel3], 3);
  p.line(4, 4, 10, 8, K.steel);
  p.line(4, 5, 9, 8, K.steel3);
  for (const [x, y] of [[4, 4], [9, 4], [4, 7], [9, 7]] as const) {
    p.px(x, y, K.pale);
    p.px(x + 1, y + 1, K.rust1);
  }
  p.outline(K.panel2, K.ink);
}

function iGear(p: Pix): void {
  // Pressed gear: six teeth (top, bottom, two on each flank), a hole, a little thickness below.
  const m = new Pix(16, 16);
  m.stamp(3, 3, [
    '....##....',
    '..######..',
    '##########',
    '.########.',
    '.########.',
    '.########.',
    '##########',
    '..######..',
    '....##....',
  ], { '#': 0 });
  for (let y = 15; y >= 1; y--) for (let x = 0; x < 16; x++) if (m.on(x, y - 1) && !m.on(x, y)) p.px(x, y, K.slate);
  volume(p, m, [K.slate, K.steel, K.steel2, K.steel3, K.silver]);
  p.rect(7, 6, 2, 3, K.panel);
  p.px(7, 6, K.panel2);
  p.px(8, 8, K.steel);
  p.hl(5, 6, 4, K.white);
  p.outline(K.slate, K.ink);
}

function iCopperWire(p: Pix): void {
  // A coil of copper wire: an elliptical ring of wraps with a loose end.
  const m = new Pix(16, 16);
  m.ell(3, 3, 10, 9, 0);
  m.paint(0, 0, 16, 16, (x, y) => (inEll(x - 6, y - 5, 4, 4) ? CLEAR : null));
  volume(p, m, [K.earth0, K.earth1, K.amber, K.orange, K.pale]);
  // Wraps: diagonal grooves around the ring.
  p.paint(3, 3, 10, 9, (x, y) => (m.on(x, y) && (x - y + 16) % 3 === 0 ? K.earth1 : null));
  p.ell(6, 5, 4, 4, K.night);
  p.px(7, 6, K.ink);
  p.paint(3, 3, 6, 4, (x, y) => (m.on(x, y) && !m.on(x - 1, y) ? K.pale : null));
  // Loose wire end.
  p.line(11, 10, 12, 12, K.orange);
  p.px(12, 12, K.pale);
  p.outline(K.earth0, K.ink);
}

function iSteelBeam(p: Pix): void {
  // I-beam lying across the belt, its end profile showing on the left (14 px wide).
  p.rect(3, 5, 11, 2, K.steel3);
  p.hl(3, 13, 5, K.silver);
  p.hl(3, 13, 7, K.steel);
  p.rect(4, 8, 10, 2, K.panel2);
  p.hl(4, 13, 8, K.panel);
  p.hl(3, 13, 10, K.slate);
  p.hl(3, 13, 11, K.panel2);
  // End profile: the "I".
  p.rect(2, 5, 3, 3, K.steel2);
  p.px(2, 5, K.white);
  p.rect(3, 8, 1, 2, K.steel);
  p.rect(2, 10, 3, 2, K.steel);
  p.px(2, 10, K.steel3);
  p.px(13, 6, K.steel2);
  for (const x of [7, 11]) p.px(x, 7, K.slate);
  p.outline(K.panel2, K.ink);
}

function iCircuit(p: Pix): void {
  // Green board, gold traces, a dark chip with silver legs.
  block(p, 3, 3, 10, 8, 2, [K.pine, K.pine, K.green1, K.green2, K.green3], 2);
  p.hl(4, 6, 5, K.gold);
  p.vl(6, 5, 7, K.gold);
  p.hl(9, 11, 9, K.gold);
  p.vl(9, 8, 9, K.gold);
  p.hl(4, 5, 9, K.gold);
  p.px(4, 9, K.pale);
  p.px(11, 9, K.pale);
  p.px(4, 5, K.pale);
  p.rect(7, 5, 4, 3, K.panel);
  p.hl(7, 10, 5, K.slate);
  for (const x of [7, 9]) {
    p.px(x, 4, K.silver);
    p.px(x + 1, 8, K.silver);
  }
  p.px(11, 4, K.lime);
  p.outline(K.pine, K.ink);
}

function iHeatShield(p: Pix): void {
  // Four aggregate tiles on a steel frame, brass rivets.
  block(p, 3, 3, 9, 7, 2, [K.panel2, K.slate, K.steel, K.steel2, K.steel3], 3);
  for (const [x, y] of [[4, 4], [8, 4], [4, 7], [8, 7]] as const) {
    p.rect(x, y, 3, 2, K.earth0);
    p.hl(x, x + 2, y, K.earth2);
    p.px(x + 1, y, K.earth3);
    p.px(x + 2, y + 1, K.earth1);
  }
  p.px(3, 3, K.pale);
  p.px(11, 3, K.gold);
  p.px(3, 9, K.gold);
  p.px(11, 9, K.amber);
  p.px(7, 6, K.gold);
  p.outline(K.panel2, K.ink);
}

function iAggregate(p: Pix): void {
  // A cut block of quenched conglomerate.
  block(p, 3, 4, 10, 5, 4, [K.plum, K.earth0, K.earth1, K.earth2, K.earth3], 3);
  const pebbles = [
    [5, 5, K.earth3], [9, 6, K.sand], [7, 7, K.earth3], [11, 5, K.earth1],
    [5, 10, K.earth2], [9, 11, K.earth2], [11, 10, K.earth3], [7, 10, K.earth3],
  ] as const;
  for (const [x, y, c] of pebbles) {
    p.px(x, y, c);
  }
  p.px(4, 5, K.cream);
  p.outline(K.plum, K.ink);
}

function iInsulation(p: Pix): void {
  // A puffy quilted batt bound with an amber resin band.
  const m = new Pix(16, 16);
  m.rect(3, 4, 10, 8, 0);
  m.px(3, 4, CLEAR);
  m.px(12, 4, CLEAR);
  m.px(3, 11, CLEAR);
  m.px(12, 11, CLEAR);
  volume(p, m, [K.earth3, K.sand, K.cream, K.cream, K.white]);
  for (const [x, y] of [[5, 6], [10, 6], [5, 9], [10, 9]] as const) {
    p.px(x, y, K.sand);
    p.px(x + 1, y + 1, K.earth3);
  }
  p.rect(7, 4, 2, 8, K.gold);
  p.vl(7, 4, 11, K.pale);
  p.px(8, 11, K.amber);
  p.outline(K.earth2, K.ink);
}

function iFilter(p: Pix): void {
  // A fiber mesh in a resin frame.
  p.rect(3, 3, 10, 10, K.amber);
  p.hl(3, 12, 3, K.gold);
  p.vl(3, 3, 12, K.gold);
  p.hl(3, 12, 12, K.rust1);
  p.vl(12, 3, 12, K.rust1);
  p.rect(5, 5, 6, 6, K.sage);
  p.paint(5, 5, 6, 6, (x, y) => ((x + y) % 2 === 0 ? K.cream : (x - y + 16) % 4 === 0 ? K.green3 : null));
  p.hl(5, 10, 5, K.lime);
  p.px(3, 3, K.pale);
  p.outline(K.rust0, K.ink);
}

function iMycelium(p: Pix): void {
  // A ball of tough pale fungal thread, wound strands showing, a loose end trailing.
  const m = new Pix(16, 16);
  m.ell(3, 3, 10, 10, 0);
  volume(p, m, [K.green2, K.green3, K.sage, K.cream, K.white]);
  p.paint(3, 3, 10, 10, (x, y) => {
    if (!inside(m, x, y)) return null;
    const a = (x - 8) * 0.7 + (y - 8) * 0.3;
    const b = (x - 8) * 0.25 - (y - 8) * 0.8;
    if (Math.abs(Math.round(a * 1.4) % 3) === 0 && y < 10) return x < 8 ? K.white : K.cream;
    if (Math.abs(Math.round(b * 1.3) % 3) === 0 && y >= 7) return x > 9 ? K.green3 : K.sage;
    return null;
  });
  p.px(5, 5, K.white);
  p.px(12, 11, K.sage);
  p.px(12, 12, K.cream);
  p.outline(K.green1, K.ink);
}

// ---------------------------------------------------------------------------------------------
// Assembled parts
// ---------------------------------------------------------------------------------------------

function iMotor(p: Pix): void {
  // Steel housing, copper windings in the slots, shaft with a small gear, brass terminal box.
  drumH(p, 3, 5, 8, 8, [K.panel2, K.slate, K.steel, K.steel2, K.steel3], 2, 2);
  for (const x of [5, 7, 9]) {
    p.vl(x, 6, 10, K.orange);
    p.px(x, 6, K.pale);
    p.px(x, 10, K.earth1);
  }
  p.rect(10, 7, 2, 3, K.steel2);
  p.vl(12, 6, 10, K.steel);
  p.px(12, 6, K.steel3);
  p.px(12, 8, K.steel3);
  p.rect(5, 3, 4, 2, K.gold);
  p.hl(5, 8, 3, K.pale);
  p.outline(K.panel2, K.ink);
}

function iDrillBit(p: Pix): void {
  // A fluted steel cutting cone on a riveted brass mount.
  block(p, 4, 3, 8, 1, 2, [K.rust0, K.rust1, K.amber, K.gold, K.pale], 3);
  p.px(5, 4, K.pale);
  p.px(10, 4, K.pale);
  p.poly([[4, 6], [12, 6], [8, 13]], K.steel2);
  p.paint(4, 6, 8, 7, (x, y) => {
    if (!p.on(x, y) || y < 6) return null;
    const flute = (x + y * 2) % 4;
    if (flute === 0) return K.slate;
    if (flute === 1) return x < 8 ? K.silver : K.steel;
    return x < 8 ? K.steel3 : K.steel2;
  });
  p.px(7, 12, K.white);
  p.outline(K.rust0, K.ink);
}

function iCobaltDrillHead(p: Pix): void {
  // The drill bit grown up: a wide cobalt-clad cone with gold cutting edges, riveted collar.
  block(p, 3, 3, 10, 1, 2, [K.rust0, K.rust1, K.amber, K.gold, K.pale], 3);
  p.px(4, 4, K.pale);
  p.px(11, 4, K.pale);
  p.px(7, 4, K.pale);
  p.poly([[3, 6], [13, 6], [8, 13]], K.blue2);
  p.paint(3, 6, 10, 7, (x, y) => {
    if (!p.on(x, y) || y < 6) return null;
    const flute = (x + y * 2) % 5;
    if (flute === 0) return K.navy;
    if (flute === 1) return x < 8 ? K.ice : K.blue3;
    return x < 8 ? K.blue3 : K.blue1;
  });
  for (const [x, y] of [[3, 6], [5, 8], [6, 10], [12, 6], [10, 8], [9, 10]] as const) {
    p.px(x, y, K.gold);
  }
  p.px(7, 12, K.pale);
  p.outline(K.navy, K.ink);
}

function iBattery(p: Pix): void {
  // Cobalt cell with a glowing crystal window and a steel terminal cap.
  tankV(p, 4, 4, 8, 9, [K.navy, K.blue1, K.blue2, K.blue3, K.cyan], 2, 3);
  lid(p, 4, 4, 8, 3, [K.slate, K.steel, K.steel2, K.steel3, K.silver], 3);
  p.rect(7, 3, 2, 2, K.steel3);
  p.px(7, 3, K.white);
  p.rect(6, 7, 4, 4, K.navy);
  p.rect(7, 8, 2, 2, K.cyan);
  p.px(7, 8, K.white);
  p.px(8, 9, K.ice);
  p.hl(5, 10, 12, K.blue1);
  p.outline(K.navy, K.ink);
}

// ---------------------------------------------------------------------------------------------
// Fungal goods
// ---------------------------------------------------------------------------------------------

function iGlowcap(p: Pix): void {
  // Magenta cap with lime spots on a pale stem.
  p.rect(6, 8, 4, 5, K.cream);
  p.vl(6, 8, 12, K.white);
  p.vl(9, 8, 12, K.sand);
  p.hl(6, 9, 12, K.sand);
  const m = new Pix(16, 16);
  m.paint(3, 3, 10, 6, (x, y) => (inEll(x - 3, y - 3, 10, 11) && y <= 8 ? 0 : null));
  volume(p, m, [K.purple, K.magenta, K.pink, K.rose], 0.05);
  p.hl(3, 12, 8, K.purple);
  p.hl(4, 11, 9, K.violet);
  for (const [x, y] of [[5, 5], [9, 4], [10, 7], [6, 7]] as const) {
    p.px(x, y, K.lime);
  }
  p.px(6, 4, K.sage);
  p.outline(K.violet, K.ink);
}

function iResin(p: Pix): void {
  // An amber teardrop, translucent: dark rim, bright core, sharp glint.
  const m = new Pix(16, 16);
  m.ell(4, 5, 8, 8, 0);
  m.poly([[8, 3], [11.5, 8], [4.5, 8]], 0);
  volume(p, m, [K.rust0, K.rust1, K.amber, K.gold, K.pale]);
  p.rect(7, 8, 3, 3, K.pale);
  p.px(9, 10, K.gold);
  p.px(6, 6, K.white);
  p.px(7, 5, K.pale);
  p.outline(K.rust0, K.ink);
}

function iSporeDust(p: Pix): void {
  heap(p, [K.violet, K.purple, K.magenta, K.pink, K.rose], [K.lime, K.sage, K.rose], 3);
  // Spores drifting off the top.
  p.px(4, 4, K.pink);
  p.px(11, 3, K.lime);
  p.px(7, 2, K.rose);
  p.px(13, 6, K.pink);
}

function iBiofuel(p: Pix): void {
  // A glowing green blob with a smaller droplet beside it.
  const m = new Pix(16, 16);
  m.ell(3, 5, 8, 8, 0);
  m.ell(4, 4, 6, 4, 0);
  volume(p, m, [K.pine, K.green1, K.green2, K.green3, K.lime]);
  const d = new Pix(16, 16);
  d.ell(10, 8, 3, 5, 0);
  d.px(11, 7, 0);
  volume(p, d, [K.green1, K.green2, K.green3, K.lime]);
  p.rect(5, 7, 3, 3, K.lime);
  p.px(5, 7, K.sage);
  p.px(6, 6, K.white);
  p.px(11, 9, K.sage);
  p.outline(K.pine, K.ink);
}

// ---------------------------------------------------------------------------------------------
// Crystals and exotics
// ---------------------------------------------------------------------------------------------

function iChorusCrystal(p: Pix): void {
  // A raw cluster: three hexagonal prisms rising from a rock base.
  p.ell(3, 9, 10, 4, K.slate);
  p.hl(4, 11, 9, K.steel);
  const prism = (x: number, top: number, w: number, bottom: number): void => {
    const mid = x + Math.floor(w / 2);
    p.poly([[mid, top], [x + w, top + 2], [x + w, bottom], [x, bottom], [x, top + 2]], K.blue2);
    p.paint(x, top, w, bottom - top, (X, Y) => (p.get(X, Y) === K.blue2 ? (X < mid ? K.blue3 : X === mid ? K.ice : K.blue1) : null));
    p.px(x, top + 2, K.ice);
  };
  prism(3, 6, 4, 11);
  prism(9, 5, 4, 11);
  prism(6, 3, 4, 11);
  p.px(7, 4, K.white);
  p.outline(K.navy, K.ink);
}

function iCrystalGrit(p: Pix): void {
  // A heap of angular blue grains with glints.
  heap(p, [K.navy, K.blue1, K.blue2, K.blue3, K.cyan], [K.ice, K.blue1], 5);
  for (const [x, y] of [[5, 6], [9, 8], [7, 10], [11, 10]] as const) {
    p.px(x, y, K.ice);
    p.px(x + 1, y, K.blue3);
  }
}

function iConductivePowder(p: Pix): void {
  // Charged grit: a cyan heap with white sparks around it.
  heap(p, [K.blue2, K.blue3, K.cyan, K.ice, K.white], [K.white, K.ice], 9);
  for (const [x, y] of [[7, 5], [10, 8], [5, 9]] as const) {
    p.px(x, y, K.white);
  }
  p.px(2, 3, K.ice);
  p.px(13, 4, K.white);
  p.px(13, 3, K.cyan);
}

function iOverchargedCrystal(p: Pix): void {
  // White-hot, spiky and cracked: about to go.
  p.stamp(3, 3, [
    '....##....',
    '....##....',
    '.#..##..#.',
    '..######..',
    '##########',
    '##########',
    '..######..',
    '.#..##..#.',
    '....##....',
    '....##....',
  ], { '#': K.ice });
  p.paint(3, 3, 10, 10, (x, y) => (p.on(x, y) ? (x + y < 15 ? K.white : x > y + 1 ? K.cyan : K.ice) : null));
  p.px(7, 6, K.blue3);
  p.px(9, 8, K.blue3);
  p.px(8, 10, K.blue3);
  p.rect(7, 7, 2, 2, K.white);
  p.outline(K.blue2, K.ink);
}

function iResonantCore(p: Pix): void {
  // A cyan charge sealed in an insulated casing: cream bands, steel caps.
  const m = new Pix(16, 16);
  m.ell(3, 3, 10, 10, 0);
  volume(p, m, [K.blue1, K.blue2, K.blue3, K.cyan, K.ice]);
  p.rect(6, 6, 4, 4, K.ice);
  p.rect(7, 7, 2, 2, K.white);
  p.paint(3, 3, 10, 10, (x, y) => {
    if (!m.on(x, y)) return null;
    const ny = Math.abs((y + 0.5 - 8) / 5 + ((x + 0.5 - 8) / 5) ** 2 * 0.25);
    if (ny > 0.42 && ny < 0.72) return x < 7 ? K.white : x < 10 ? K.cream : K.sand;
    return null;
  });
  p.hl(7, 8, 3, K.steel3);
  p.hl(7, 8, 12, K.slate);
  p.px(5, 5, K.white);
  p.outline(K.blue1, K.ink);
}

function iEmberCore(p: Pix): void {
  // A molten heart caged in circuit-green ribs with gold traces.
  const m = new Pix(16, 16);
  m.ell(3, 3, 10, 10, 0);
  volume(p, m, [K.crimson, K.red, K.coral, K.orange, K.pale]);
  p.rect(6, 6, 3, 3, K.pale);
  p.px(6, 6, K.white);
  for (const x of [5, 10]) p.paint(x, 3, 1, 10, (X, y) => (m.on(X, y) ? (y % 3 === 0 ? K.gold : K.green1) : null));
  p.paint(3, 8, 10, 1, (x, y) => (m.on(x, y) ? (x % 3 === 0 ? K.gold : K.green1) : null));
  p.paint(3, 3, 10, 10, (x, y) => (m.on(x, y) && !inside(m, x, y) ? (x + y < 15 ? K.green2 : K.pine) : null));
  p.outline(K.pine, K.ink);
}

function iEngineGlass(p: Pix): void {
  // A hexagonal pane of dark alien glass with teal light running in rings.
  p.poly([[8, 3], [12.5, 5.5], [12.5, 10.5], [8, 13], [3.5, 10.5], [3.5, 5.5]], K.pine);
  p.poly([[8, 5.5], [10.5, 7], [10.5, 9.5], [8, 11], [5.5, 9.5], [5.5, 7]], K.panel2);
  p.paint(3, 3, 10, 10, (x, y) => {
    const c = p.get(x, y);
    if (c === CLEAR) return null;
    const edge = !p.on(x - 1, y) || !p.on(x, y - 1) || !p.on(x + 1, y) || !p.on(x, y + 1);
    if (edge) return x + y < 15 ? K.ice : K.blue2;
    if (c === K.pine && (x === 4 || y === 4)) return K.cyan;
    return null;
  });
  p.rect(7, 7, 2, 2, K.cyan);
  p.px(7, 7, K.white);
  p.px(6, 6, K.blue2);
  p.outline(K.pine, K.ink);
}

function iHeartstone(p: Pix): void {
  // A heart-shaped stone: violet shell, rose light inside, teal veins.
  const m = new Pix(16, 16);
  m.stamp(3, 3, [
    '.###..###.',
    '##########',
    '##########',
    '##########',
    '.########.',
    '..######..',
    '...####...',
    '....##....',
  ], { '#': 0 });
  volume(p, m, [K.violet, K.purple, K.magenta, K.pink, K.rose]);
  p.rect(6, 6, 4, 2, K.rose);
  p.hl(7, 8, 6, K.white);
  p.line(4, 4, 6, 7, K.ice);
  p.line(11, 4, 10, 7, K.cyan);
  p.px(5, 3, K.rose);
  p.outline(K.violet, K.ink);
}

// =============================================================================================
// Deposit decals (d_<ore>_<1|2|3>): 16 x 16, transparent, drawn over floor tiles. Ore chunks
// half-sunk into the floor, three layouts per ore so a patch never shows a repeat.
// =============================================================================================

const DEPOSIT_ORES = ['iron_ore', 'copper_ore', 'stone', 'coal', 'sapstone', 'glowcap', 'chorus_crystal', 'emberite', 'thrumstone'];

/** Every ore that needs decals: the list above plus anything the layer data places. */
function depositOres(): string[] {
  const all = new Set(DEPOSIT_ORES);
  for (const L of LAYERS) for (const d of L.deposits) all.add(d.ore);
  for (const b of BUILDING_LIST) for (const ore of b.needsDeposit ?? []) all.add(ore);
  return [...all];
}

/** Chunk boxes [x, y, w, h] per variant, biggest first; all inside 1..14. */
const DEPOSIT_LAYOUT: readonly (readonly [number, number, number, number])[][] = [
  [[2, 3, 7, 6], [9, 9, 5, 5], [10, 2, 4, 4]],
  [[6, 6, 8, 6], [2, 2, 5, 4], [2, 10, 4, 4]],
  [[2, 7, 6, 6], [8, 2, 6, 5], [10, 10, 4, 4]],
];

interface OreLook {
  ramp: Ramp;
  /** Polygon corners per chunk and how ragged they are. */
  sides: number;
  jag: number;
  /** Paints the ore's own detail on one chunk (mask m, box x, y, w, h). */
  detail: (p: Pix, m: Pix, x: number, y: number, w: number, h: number, r: () => number) => void;
}

/** A pixel inside the mask, near the box center, picked by the generator. */
function spotIn(m: Pix, x: number, y: number, w: number, h: number, r: () => number): Pt | null {
  for (let k = 0; k < 12; k++) {
    const sx = x + 1 + Math.floor(r() * Math.max(1, w - 2));
    const sy = y + 1 + Math.floor(r() * Math.max(1, h - 2));
    if (inside(m, sx, sy)) return [sx, sy];
  }
  return null;
}

const ORE_LOOK: Record<string, OreLook> = {
  iron_ore: {
    ramp: [K.plum, K.earth0, K.earth1, K.earth2, K.earth3],
    sides: 7,
    jag: 0.14,
    detail: (p, m, x, y, w, h, r) => {
      const s = spotIn(m, x, y, w, h, r);
      if (s) {
        p.px(s[0], s[1], K.silver);
        p.px(s[0] + 1, s[1] + 1, K.slate);
      }
      const t = spotIn(m, x, y, w, h, r);
      if (t && w > 4) p.px(t[0], t[1], K.coral);
    },
  },
  copper_ore: {
    ramp: [K.pine, K.panel2, K.slate, K.steel, K.steel2],
    sides: 0,
    jag: 0,
    detail: (p, m, x, y, w, h, r) => {
      for (let i = x; i < x + w; i++) {
        const j = y + Math.floor(h / 2) + Math.round((i - x - w / 2) * -0.5);
        if (inside(m, i, j)) p.px(i, j, K.green3);
        if (inside(m, i, j + 1)) p.px(i, j + 1, K.green2);
      }
      const s = spotIn(m, x, y, w, h, r);
      if (s) {
        p.px(s[0], s[1], K.orange);
        p.px(s[0] + 1, s[1] + 1, K.earth1);
      }
    },
  },
  stone: {
    ramp: [K.slate, K.steel, K.steel2, K.steel3, K.silver],
    sides: 0,
    jag: 0,
    detail: (p, m, x, y, w, h, r) => {
      const s = spotIn(m, x, y, w, h, r);
      if (s && w > 4) {
        p.px(s[0], s[1], K.steel);
        p.px(s[0] + 1, s[1] - 1, K.steel);
      }
    },
  },
  coal: {
    ramp: [K.ink, K.night, K.panel, K.panel2, K.slate, K.steel],
    sides: 6,
    jag: 0.15,
    detail: (p, m, x, y, w, h, r) => {
      const s = spotIn(m, x, y, w, h, r);
      if (s) {
        p.px(s[0], s[1], K.steel);
        if (m.on(s[0] + 1, s[1])) p.px(s[0] + 1, s[1], K.slate);
      }
    },
  },
  sapstone: {
    ramp: [K.navy, K.blue1, K.blue2, K.blue3, K.cyan],
    sides: 0,
    jag: 0,
    detail: (p, m, x, y, w, h) => {
      // Resin coat over the upper-left half, a drip down the face.
      p.paint(x, y, w, h, (X, Y) => (m.on(X, Y) && X - x + (Y - y) * 1.3 < w * 0.6 ? (X - x + Y - y < 2 ? K.pale : K.gold) : null));
      const dx = x + Math.floor(w / 2);
      for (let Y = y + 1; Y < y + h - 1; Y++) if (inside(m, dx, Y)) p.px(dx, Y, K.amber);
    },
  },
  emberite: {
    ramp: [K.wine0, K.wine1, K.crimson, K.red, K.coral],
    sides: 6,
    jag: 0.15,
    detail: (p, m, x, y, w, h) => {
      // Glowing cracks through the crust.
      const cy = y + Math.floor(h / 2);
      for (let X = x + 1; X < x + w - 1; X++) {
        const Y = cy + ((X - x) % 3 === 0 ? -1 : 0);
        if (inside(m, X, Y)) p.px(X, Y, X === x + Math.floor(w / 2) ? K.pale : K.orange);
      }
    },
  },
  thrumstone: {
    ramp: [K.pine, K.panel2, K.slate, K.steel, K.steel2, K.steel3],
    sides: 0,
    jag: 0,
    detail: (p, m, x, y, w, h) => {
      // One straight teal line humming through the stone.
      const Y = y + Math.floor(h / 2);
      for (let X = x; X < x + w; X++) {
        if (m.on(X, Y) && m.on(X - 1, Y) && m.on(X + 1, Y)) p.px(X, Y, X === x + Math.floor(w / 2) ? K.ice : K.cyan);
      }
    },
  },
};

function drawDeposit(p: Pix, ore: string, v: number): void {
  const r = rng(hashStr(`${ore}:${v}`));
  const layout = DEPOSIT_LAYOUT[(v - 1) % 3];
  if (ore === 'glowcap') return glowcapPatch(p, layout, r);
  if (ore === 'chorus_crystal') return crystalPatch(p, layout, r);
  const look = ORE_LOOK[ore] ?? genericLook(ore);
  for (const [x, y, w, h] of layout) {
    const m = new Pix(16, 16);
    if (look.sides > 0) m.poly(rockPoly(x, y, w, h, look.sides, look.jag, r), 0);
    else {
      m.ell(x, y + 1, w, h - 1, 0, 1.1);
      const bw = Math.max(3, w - 2);
      m.ell(x + Math.floor(r() * (w - bw + 1)), y, bw, h - 1, 0, 1.1);
    }
    volume(p, m, look.ramp, 0.08);
    look.detail(p, m, x, y, w, h, r);
  }
  p.outline(look.ramp[1], K.ink);
  // Loose grit between the chunks (not outlined).
  for (let k = 0, placed = 0; k < 20 && placed < 3; k++) {
    const fx = 1 + Math.floor(r() * 14);
    const fy = 1 + Math.floor(r() * 13);
    if (p.on(fx, fy) || p.on(fx, fy + 1) || p.on(fx - 1, fy) || p.on(fx + 1, fy) || p.on(fx, fy - 1)) continue;
    p.px(fx, fy, look.ramp[3]);
    p.px(fx, fy + 1, look.ramp[1]);
    placed++;
  }
}

function genericLook(ore: string): OreLook {
  const it = ITEM_LIST.find((i) => i.id === ore);
  const body = it ? pal(it.color[0]) : K.steel;
  const hi = it ? pal(it.color[1]) : K.steel2;
  return { ramp: [K.ink, K.panel, body, body, hi], sides: 0, jag: 0, detail: () => undefined };
}

/** Irregular rock outline around a box. */
function rockPoly(x: number, y: number, w: number, h: number, n: number, jag: number, r: () => number): Pt[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const a0 = r() * Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const k = 1.08 - jag * r();
    pts.push([cx + Math.cos(a) * (w / 2) * k, cy + Math.sin(a) * (h / 2) * k]);
  }
  return pts;
}

/** Small glowing mushrooms with moss at their feet. */
function glowcapPatch(p: Pix, layout: readonly (readonly [number, number, number, number])[], r: () => number): void {
  for (const [x, y, w, h] of layout) {
    const base = y + h - 1;
    p.ell(x, base - 1, w, 3, K.green1);
    p.hl(x + 1, x + w - 2, base - 1, K.green2);
    if (w >= 6) {
      mushroom(p, x, base, 5, 2 + Math.floor(r() * 2));
      mushroom(p, x + w - 3, base + 1, 3, 1);
    } else {
      mushroom(p, x + Math.floor((w - 4) / 2), base, w >= 5 ? 5 : 3, 1 + Math.floor(r() * 2));
    }
  }
  p.outline(K.violet, K.ink);
}

/** Chorus crystals breaking out of the floor in tight clusters. */
function crystalPatch(p: Pix, layout: readonly (readonly [number, number, number, number])[], r: () => number): void {
  for (const [x, y, w, h] of layout) {
    const base = y + h - 1;
    p.ell(x, base - 1, w, 3, K.slate);
    p.hl(x + 1, x + w - 2, base - 1, K.steel);
    const tall = Math.min(base - 1, w >= 6 ? 8 : 5);
    if (w >= 6) {
      prism(p, x, base, 3, tall - 3, -1, CRYSTAL);
      prism(p, x + w - 3, base, 3, tall - 2, 1, CRYSTAL);
      prism(p, x + Math.floor(w / 2) - 1, base, 3, tall, 0, CRYSTAL);
    } else {
      prism(p, x, base, 2, tall - 2, 0, CRYSTAL);
      prism(p, x + 1, base, 3, tall - Math.floor(r() * 2), 0, CRYSTAL);
    }
  }
  p.outline(K.navy, K.ink);
}

// ---------------------------------------------------------------------------------------------
// Deposit helpers: the glowcap and the chorus crystal (resources glow; decor below never does)
// ---------------------------------------------------------------------------------------------

/** A glowcap: stem from (x, base) up `stem` pixels, cap w wide. */
function mushroom(p: Pix, x: number, base: number, w: number, stem: number): void {
  const sx = x + Math.floor(w / 2);
  p.vl(sx, base - stem, base, K.cream);
  if (w >= 5) p.vl(sx - 1, base - stem, base, K.white);
  p.px(sx, base, K.sand);
  const capH = w >= 7 ? 4 : 3;
  const top = base - stem - capH + 1;
  const m = new Pix(16, 16);
  m.paint(x, top, w, capH, (X, Y) => (inEll(X - x, Y - top, w, capH * 2) ? 0 : null));
  volume(p, m, [K.purple, K.magenta, K.pink, K.rose]);
  p.hl(x, x + w - 1, top + capH - 1, K.purple);
  p.px(x + 1, top + 1, K.lime);
  if (w >= 5) p.px(x + w - 2, top + capH - 2, K.lime);
  if (w >= 7) p.px(x + Math.floor(w / 2), top, K.sage);
}

const CRYSTAL: Ramp = [K.navy, K.blue2, K.blue3, K.cyan, K.ice, K.white];

/** A crystal prism standing on (x, base), w wide, tall high, leaning by `lean` at the tip. */
function prism(p: Pix, x: number, base: number, w: number, tall: number, lean: number, r: Ramp): void {
  const tip = x + w / 2 + lean;
  const shoulder = base - tall + Math.ceil(w / 2);
  p.poly([[tip, base - tall], [x + w, shoulder], [x + w, base + 1], [x, base + 1], [x, shoulder]], r[2]);
  const mid = Math.floor(x + w / 2 + lean / 2);
  p.paint(x, base - tall, w + 1, tall + 2, (X, Y) => {
    if (p.get(X, Y) !== r[2]) return null;
    if (X < mid) return r[4];
    if (X === mid) return r[3];
    return r[1];
  });
  p.px(Math.floor(tip), base - tall, r[5]);
  p.px(x, shoulder, r[5]);
}

// =============================================================================================
// Decor (x_l<layer>_<name>: every name in LAYERS[layer].decor, plus AMBER_SPRITE). Transparent,
// non-blocking dressing, 16 x 16 or 32 x 32 (DECOR_ART). The renderer draws decor bottom-centred
// on its tile, so each prop stands with its foot on the bottom rows; a 32 px prop (24-28 px tall)
// rises into the tile above and overhangs its neighbours.
//
// Always dull (STYLE "Deposits and decor", DECISIONS 33): the layer's floor and wall colours plus
// at most one muted accent that is no ore's colour; no glow, no light spot, no white. The edge is
// soft: the layer's darkest wall colour on the shadow side (the big props and the flag add a
// muted lit-side edge), where items and deposits get a closed #090a14 outline, so decor sits in
// the ground and never competes with deposits, conduits or machines. Decor never uses the
// darkness tint #090a14 itself, not even on the Magma Shelf, whose darkest wall colour is #10141f:
//   L0 Surface   earth #4d2b32..#e7d5b3                    accent: dry scrub #19332d #25562e #468232
//   L1 Shallows  earth #341c27..#c09473                    accent: old iron #602c2c #884b2b
//   L2 Fungal    violet #1e1d39 #241527 #402751 #7a367b     accent: moss #19332d #25562e #468232
//   L3 Crystal   navy #10141f #172038 #253a5e #3c5e8b       accent: blue-grey #202e37 #394a50 #577277
//   L4 Magma     basalt #10141f..#394a50, #577277 tops      accent: dull maroon #241527 #411d31
//   L5 Alien     machine stone #151d28..#819796, #19332d / #25562e joints (no accent)
// The one exception is on purpose: AMBER_SPRITE, rock sealed in Sapstone's amber, only around the
// Shallows bore site, the first sign of what seeps up from below. Its closed outline is in the
// Shallows' wall colours (#4d2b32 / #341c27), not the darkness tint.
// =============================================================================================

/** Decor drawings by sprite name, with their canvas size (STYLE "Grid and sizes": 16 or 32). */
const DECOR_ART: Record<string, { size: 16 | 32; draw: (p: Pix) => void }> = {
  x_l0_bush: { size: 16, draw: xBush },
  x_l0_grass: { size: 16, draw: xGrass },
  x_l0_pebbles: { size: 16, draw: xPebbles },
  x_l0_crate_stack: { size: 32, draw: xCrateStack },
  x_l0_survey_flag: { size: 16, draw: xSurveyFlag },
  x_l1_support: { size: 32, draw: xSupport },
  x_l1_stalagmite: { size: 16, draw: xStalagmite },
  x_l1_rubble: { size: 16, draw: xRubble },
  x_l1_minecart: { size: 32, draw: xMinecart },
  [AMBER_SPRITE]: { size: 16, draw: xAmber },
  x_l2_mushroom_small: { size: 16, draw: xMushroomSmall },
  x_l2_mushroom_tall: { size: 32, draw: xMushroomTall },
  x_l2_spore_pod: { size: 16, draw: xSporePod },
  x_l2_moss_clump: { size: 16, draw: xMossClump },
  x_l3_crystal_small: { size: 16, draw: xCrystalSmall },
  x_l3_crystal_large: { size: 32, draw: xCrystalLarge },
  x_l3_geode: { size: 16, draw: xGeode },
  x_l4_hex_pillar: { size: 32, draw: xHexPillar },
  x_l4_vent: { size: 16, draw: xVent },
  x_l4_ember_rock: { size: 16, draw: xEmberRock },
  x_l5_stone_gear: { size: 32, draw: xStoneGear },
  x_l5_glass_shard: { size: 16, draw: xGlassShard },
  x_l5_relic: { size: 16, draw: xRelic },
};

/**
 * Decor's soft edge: a 1 px `dark` line on the shadow side (right of and below the shape), and
 * `lit` on the lit side only when given.
 */
function edge(p: Pix, dark: number, lit?: number): void {
  const add: number[] = [];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.on(x, y)) continue;
      if (p.on(x - 1, y) || p.on(x, y - 1)) add.push(x, y, dark);
      else if (lit !== undefined && (p.on(x + 1, y) || p.on(x, y + 1))) add.push(x, y, lit);
    }
  }
  for (let i = 0; i < add.length; i += 3) p.px(add[i], add[i + 1], add[i + 2]);
}

/** Paint the pixels of a mask lit (upper-left rim), dark (lower-right rim) or body. */
function rimShade(p: Pix, m: Pix, lit: number, body: number, dark: number): void {
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.on(x, y)) continue;
      const l = !m.on(x, y - 1) || !m.on(x - 1, y);
      const d = !m.on(x + 1, y) || !m.on(x, y + 1);
      p.px(x, y, l && !d ? lit : d && !l ? dark : body);
    }
  }
}

/**
 * A layer colour for decor: the palette entry, except that the darkness tint #090a14 (which the
 * layer data may list as a wall tone) becomes #10141f, the darkest colour decor may use.
 */
function decorTone(hex: string): number {
  const c = pal(hex);
  return c === K.ink ? K.night : c;
}

/** A decor name with no drawing yet: a dull pebble cluster in its layer's floor and wall colours. */
function genericDecor(p: Pix, layer: number): void {
  const L = LAYERS[layer] ?? LAYERS[0];
  const ramp: Ramp = [decorTone(L.wall[0]), decorTone(L.floor[0]), decorTone(L.floor[2])];
  for (const [x, y, w, h] of [[3, 9, 5, 4], [8, 10, 5, 4], [6, 7, 4, 3]] as const) {
    const m = new Pix(16, 16);
    m.ell(x, y, w, h, 0, 1.1);
    shadeMask(p, m, ramp, 0);
  }
  edge(p, decorTone(L.wall[1]));
}

// ---------------------------------------------------------------------------------------------
// Layer 0: the Dig Site (ochre gravel, sandstone, daylight). Accent: dry scrub green.
// ---------------------------------------------------------------------------------------------

function xBush(p: Pix): void {
  // Dry desert scrub: dark olive leaf clumps over a few tan twigs, sun-bleached tips. No lime.
  p.line(5, 14, 3, 11, K.earth1);
  p.line(8, 14, 8, 10, K.earth1);
  p.line(10, 14, 13, 11, K.earth1);
  const m = new Pix(16, 16);
  for (const [x, y, w, h] of [[1, 7, 7, 6], [4, 4, 8, 7], [8, 6, 7, 7], [3, 8, 10, 5]] as const) m.ell(x, y, w, h, 0);
  shadeMask(p, m, [K.pine, K.green1, K.green1, K.green2], 0.04);
  p.paint(1, 4, 14, 9, (x, y) => {
    if (!inside(m, x, y)) return null;
    const h = h2(x, y, 17);
    if (h < 0.14) return K.pine;
    if (h > 0.9 && x + y < 16) return K.green2;
    return null;
  });
  for (const [x, y] of [[6, 4], [9, 5], [3, 7]] as const) p.px(x, y, K.sand);
  edge(p, K.pine);
}

function xGrass(p: Pix): void {
  // A tuft of dry, sand-coloured grass: blades fan out of a spread root, the lit ones on the
  // left, shaded ones on the right, two olive blades among them.
  const blades: [number, number, number, number, number][] = [
    // root x, bend x, bend y, tip x, tip y
    [6, 4, 8, 2, 5],
    [7, 6, 6, 5, 2],
    [8, 8, 7, 8, 3],
    [9, 10, 6, 11, 2],
    [10, 12, 8, 14, 6],
    [7, 5, 10, 3, 9],
    [9, 11, 10, 13, 9],
    [8, 7, 9, 6, 5],
    [9, 9, 9, 10, 4],
  ];
  const colour = [K.sand, K.cream, K.earth2, K.sand, K.earth1, K.green2, K.green2, K.sand, K.earth2];
  blades.forEach(([rx, bx, by, tx, ty], k) => {
    p.line(rx, 13, bx, by, colour[k]);
    p.line(bx, by, tx, ty, colour[k]);
  });
  p.px(5, 2, K.cream);
  p.px(11, 2, K.sand);
  p.rect(6, 12, 5, 2, K.earth1);
  p.hl(6, 9, 12, K.earth2);
  p.hl(7, 10, 14, K.earth0);
}

function xPebbles(p: Pix): void {
  // Four small flat pebbles of the ground's own sandstone, lit from the upper left.
  for (const [x, y, w, h] of [[2, 6, 4, 3], [9, 9, 5, 3], [4, 11, 3, 2], [11, 4, 3, 2]] as const) {
    const m = new Pix(16, 16);
    m.ell(x, y, w, h, 0, 1.15);
    shadeMask(p, m, [K.earth1, K.earth2, K.earth2, K.earth3, K.sand], 0.02);
  }
  edge(p, K.earth1);
}

/** A weathered wooden crate in 3/4: plank lid, plank front between corner battens, a brace. */
function woodCrate(p: Pix, x: number, y: number, w: number, top: number, front: number): void {
  p.rect(x, y, w, top, K.earth3);
  for (let j = 2; j < top; j += 2) p.hl(x + 1, x + w - 2, y + j, K.earth2);
  p.hl(x, x + w - 1, y, K.sand);
  p.vl(x, y, y + top - 1, K.sand);
  p.vl(x + w - 1, y + 1, y + top - 1, K.earth2);
  const fy = y + top;
  p.rect(x, fy, w, front, K.earth2);
  for (let j = 3; j < front - 1; j += 3) p.hl(x + 2, x + w - 3, fy + j, K.earth1);
  p.line(x + 2, fy + front - 2, x + w - 3, fy + 1, K.earth1);
  p.hl(x, x + w - 1, fy, K.earth3);
  p.rect(x, fy, 2, front, K.earth2);
  p.vl(x, fy, fy + front - 1, K.earth3);
  p.rect(x + w - 2, fy, 2, front, K.earth1);
  p.vl(x + w - 1, fy, fy + front - 1, K.earth0);
  p.hl(x, x + w - 1, fy + front - 1, K.earth0);
  p.px(x + 4, fy + 2, K.earth1);
  p.px(x + w - 5, y + 1, K.earth2);
}

function xCrateStack(p: Pix): void {
  // Three weathered wooden crates, unpainted (STYLE: decor crates are wood; b_crate is steel).
  woodCrate(p, 2, 15, 15, 5, 11);
  woodCrate(p, 16, 18, 13, 4, 9);
  woodCrate(p, 8, 5, 14, 5, 9);
  edge(p, K.plum, K.earth1);
}

function xSurveyFlag(p: Pix): void {
  // A thin survey stake with a small faded pennant: wood and weathered cloth, no bright paint.
  p.vl(5, 3, 14, K.earth2);
  p.vl(6, 4, 14, K.earth1);
  p.px(5, 2, K.sand);
  p.poly([[7, 2.5], [14, 5], [7, 8.5]], K.earth1);
  p.hl(7, 10, 3, K.earth2);
  p.px(7, 4, K.earth2);
  p.line(8, 7, 12, 5, K.earth0);
  p.px(9, 5, K.earth2);
  edge(p, K.earth0, K.earth1);
}

// ---------------------------------------------------------------------------------------------
// Layer 1: the Shallows (umber rock, timber). Accent: old rusted iron.
// ---------------------------------------------------------------------------------------------

function xSupport(p: Pix): void {
  // A timber mine set: two thick posts under a cap beam, iron straps at the joints, dark knots.
  for (const x0 of [6, 21]) {
    for (let y = 12; y <= 30; y++) for (let i = 0; i < 5; i++) p.px(x0 + i, y, rc(R.wood, 3 + cylBand(i, 5)));
    p.px(x0 + 2, 18, K.earth0);
    p.px(x0 + 3, 19, K.earth1);
    p.px(x0 + 1, 25, K.earth0);
    p.hl(x0, x0 + 4, 30, K.earth1);
    p.rect(x0, 13, 5, 2, K.rust0);
    p.hl(x0, x0 + 4, 13, K.rust1);
    p.px(x0 + 1, 14, K.rust1);
  }
  block(p, 3, 6, 26, 3, 4, R.wood, 4);
  p.px(9, 7, K.earth2);
  p.px(20, 8, K.earth2);
  p.px(14, 11, K.earth1);
  edge(p, K.plum, K.earth0);
}

function xStalagmite(p: Pix): void {
  // A short umber stalagmite, a lit tan tip, drip rings on its shadow side.
  const m = new Pix(16, 16);
  m.poly([[8, 1.5], [10, 6], [12, 12], [4, 12], [6, 6]], 0);
  m.ell(3, 10, 10, 5, 0);
  shadeMask(p, m, [K.earth0, K.earth1, K.earth1, K.earth2, K.earth3], 0.02);
  for (const y of [5, 8, 11]) p.paint(3, y, 10, 1, (x, Y) => (m.on(x, Y) && x > 8 && m.on(x + 1, Y) ? K.earth0 : null));
  p.px(8, 2, K.earth3);
  p.px(7, 3, K.earth3);
  edge(p, K.plum);
}

function xRubble(p: Pix): void {
  // A small pile of broken umber and tan rock, nothing bright in it.
  const r = rng(91);
  for (const [x, y, w, h] of [[2, 8, 6, 5], [7, 10, 6, 4], [6, 6, 5, 4], [11, 8, 3, 3], [3, 12, 3, 2]] as const) {
    const m = new Pix(16, 16);
    m.poly(rockPoly(x, y, w, h, 6, 0.3, r), 0);
    shadeMask(p, m, [K.earth0, K.earth1, K.earth2, K.earth2, K.earth3], 0.02);
  }
  edge(p, K.plum);
}

function xAmber(p: Pix): void {
  // The exception (STYLE): rock sealed in Sapstone's amber, seeping up from below. Only around
  // the Shallows bore site.
  const r = rng(47);
  const rock = new Pix(16, 16);
  rock.poly(rockPoly(2, 7, 10, 7, 7, 0.3, r), 0);
  volume(p, rock, [K.plum, K.earth0, K.earth1, K.earth2, K.earth3]);
  const seal = new Pix(16, 16);
  seal.ell(6, 3, 9, 10, 0);
  volume(p, seal, [K.rust0, K.rust1, K.amber, K.gold, K.pale]);
  // A dark fleck caught inside, and a glint.
  p.px(9, 8, K.earth0);
  p.px(10, 8, K.rust0);
  p.px(8, 5, K.pale);
  p.px(9, 5, K.cream);
  // Closed outline in the Shallows' wall colours (decor never takes the darkness tint).
  p.outline(K.earth0, K.plum);
}

function xMinecart(p: Pix): void {
  // An old empty minecart on a short run of track: rusted iron on umber timber.
  for (let x = 2; x <= 27; x += 5) {
    p.rect(x, 22, 3, 9, K.earth1);
    p.vl(x, 22, 29, K.earth2);
    p.hl(x, x + 2, 30, K.earth0);
  }
  for (const y of [23, 28]) {
    p.hl(1, 30, y, K.rust1);
    p.hl(1, 30, y + 1, K.rust0);
  }
  // Near wheels on the front rail.
  for (const wx of [8, 19]) {
    p.ell(wx, 23, 6, 6, K.earth0);
    p.ell(wx + 1, 24, 4, 4, K.plum);
    p.px(wx + 2, 25, K.rust1);
  }
  // The tub: a lit rim round the dark, empty inside; ribbed plates on its front.
  p.rect(5, 9, 22, 7, K.rust1);
  p.hl(5, 26, 9, K.earth2);
  p.vl(5, 9, 15, K.earth2);
  p.vl(26, 10, 15, K.rust0);
  p.rect(7, 10, 18, 4, K.plum);
  p.hl(7, 24, 10, K.rust0);
  p.hl(7, 24, 11, K.earth0);
  p.poly([[5, 16], [27, 16], [25, 25], [7, 25]], K.rust0);
  for (const x of [10, 16, 22]) {
    p.vl(x, 17, 23, K.rust1);
    p.vl(x + 1, 17, 23, K.plum);
  }
  p.hl(7, 24, 24, K.plum);
  for (const x of [7, 24]) p.px(x, 17, K.rust1);
  edge(p, K.plum, K.earth0);
}

// ---------------------------------------------------------------------------------------------
// Layer 2: the Fungal Caverns (violet stone). Accent: dark moss. Only glowcaps glow.
// ---------------------------------------------------------------------------------------------

/** A dull cave mushroom (decor, never a glowcap): cap w wide on a stem `stem` tall from (x, base). */
function caveShroom(p: Pix, x: number, base: number, w: number, stem: number): void {
  const sx = x + Math.floor((w - 1) / 2);
  for (let y = base - stem; y <= base; y++) {
    p.px(sx, y, K.purple);
    if (w >= 5) p.px(sx + 1, y, K.violet);
  }
  const capH = w >= 6 ? 3 : 2;
  const top = base - stem - capH + 1;
  const m = new Pix(p.w, p.h);
  m.paint(x, top, w, capH, (X, Y) => (inEll(X - x, Y - top, w, capH * 2) ? 0 : null));
  shadeMask(p, m, [K.violet, K.purple, K.purple], 0);
  p.hl(x, x + w - 1, top + capH - 1, K.wine0);
}

function xMushroomSmall(p: Pix): void {
  // A pair of small cave mushrooms: dull plum caps on violet stems, moss at their feet.
  const moss = new Pix(16, 16);
  moss.ell(3, 12, 10, 3, 0);
  shadeMask(p, moss, [K.pine, K.green1, K.green1], 0);
  caveShroom(p, 3, 13, 6, 4);
  caveShroom(p, 9, 13, 4, 2);
  p.px(4, 12, K.green2);
  edge(p, K.indigo);
}

function xMushroomTall(p: Pix): void {
  // A tall cave fungus: a broad deep violet cap over plum gills on a violet stem, moss at its
  // foot. No spots, no pink, no glow.
  const moss = new Pix(32, 32);
  moss.ell(8, 26, 16, 5, 0);
  shadeMask(p, moss, [K.pine, K.green1, K.green1, K.green2], -0.05);
  for (let y = 15; y <= 28; y++) for (let i = 0; i < 4; i++) p.px(14 + i, y, rc([K.wine0, K.violet, K.purple], 1 + cylBand(i, 4)));
  p.px(13, 23, K.violet);
  p.px(18, 24, K.wine0);
  // A crescent of plum gills under the cap's front rim, then the cap: a broad dome seen from
  // above, lit on the upper left, darkening to its rim.
  p.paint(4, 11, 24, 8, (x, y) => (inEll(x - 4, y - 9, 24, 9) && y >= 14 ? (y === 15 && x % 3 === 1 ? K.violet : K.wine0) : null));
  const cap = new Pix(32, 32);
  cap.ell(3, 4, 26, 12, 0);
  shadeMask(p, cap, [K.wine0, K.violet, K.purple, K.purple], 0.04);
  for (const [x, y] of [[8, 8], [12, 7], [18, 6], [22, 8]] as const) if (p.get(x, y) === K.purple) p.px(x, y, K.violet);
  edge(p, K.indigo);
}

function xSporePod(p: Pix): void {
  // A closed fungal pod, deep violet and plum, its seams shut, in a husk of dark green leaves.
  const m = new Pix(16, 16);
  m.ell(4, 3, 8, 10, 0);
  m.rect(7, 2, 2, 2, 0);
  shadeMask(p, m, [K.wine0, K.violet, K.violet, K.purple], 0.02);
  for (let y = 4; y <= 11; y++) {
    const bow = y >= 6 && y <= 9 ? 1 : 0;
    p.px(6 - bow, y, K.violet);
    p.px(9 + bow, y, K.wine0);
  }
  for (const pts of [[[3, 14], [5, 9], [7, 14]], [[9, 14], [11, 9], [13, 14]], [[6, 14], [8, 10], [10, 14]]] as Pt[][]) {
    const leaf = new Pix(16, 16);
    leaf.poly(pts, 0);
    rimShade(p, leaf, K.green2, K.green1, K.pine);
  }
  edge(p, K.indigo);
}

function xMossClump(p: Pix): void {
  // A low clump of dark green moss, a few olive tips catching the light.
  const m = new Pix(16, 16);
  m.ell(1, 9, 8, 5, 0);
  m.ell(5, 7, 9, 7, 0);
  m.ell(10, 10, 5, 4, 0);
  shadeMask(p, m, [K.pine, K.green1, K.green1, K.green2], -0.08);
  p.paint(1, 7, 14, 7, (x, y) => (inside(m, x, y) && h2(x, y, 5) < 0.2 ? K.pine : null));
  for (const [x, y] of [[7, 7], [10, 8], [3, 9]] as const) p.px(x, y, K.green2);
  edge(p, K.pine);
}

// ---------------------------------------------------------------------------------------------
// Layer 3: the Crystal Depths (navy stone). Accent: blue-grey rock. Only chorus is bright.
// ---------------------------------------------------------------------------------------------

/** Decor crystal: deep blue facets, a blue-grey tip; never chorus's cyan, ice or white. */
const DULL_CRYSTAL: Ramp = [K.night, K.navy, K.blue1, K.blue1, K.blue2, K.steel];

/** A dull crystal column, painted from its own mask so its neighbours are never repainted. */
function dullPrism(p: Pix, x: number, base: number, w: number, tall: number, lean: number): void {
  const r = DULL_CRYSTAL;
  const tip = x + w / 2 + lean;
  const shoulder = base - tall + Math.ceil(w / 2);
  const m = new Pix(p.w, p.h);
  m.poly([[tip, base - tall], [x + w, shoulder], [x + w, base + 1], [x, base + 1], [x, shoulder]], 0);
  const mid = Math.floor(x + w / 2 + lean / 2);
  for (let y = 0; y < p.h; y++) {
    for (let X = 0; X < p.w; X++) if (m.on(X, y)) p.px(X, y, X < mid ? r[4] : X === mid ? r[3] : r[1]);
  }
  p.px(Math.floor(tip), base - tall, r[5]);
  p.px(x, shoulder, r[5]);
}

function xCrystalSmall(p: Pix): void {
  // A stubby cluster of dull dark-blue crystal on a blue-grey stone. No glow.
  const base = new Pix(16, 16);
  base.ell(3, 11, 10, 4, 0);
  shadeMask(p, base, [K.panel2, K.slate, K.slate], 0);
  dullPrism(p, 4, 12, 3, 6, -1);
  dullPrism(p, 8, 12, 3, 4, 1);
  dullPrism(p, 6, 13, 2, 3, 0);
  edge(p, K.night);
}

function xCrystalLarge(p: Pix): void {
  // A cluster of dull dark-blue crystal columns on blue-grey rubble. No glow.
  const r = rng(303);
  for (const [x, y, w, h] of [[4, 25, 9, 5], [11, 26, 10, 4], [19, 25, 9, 5]] as const) {
    const m = new Pix(32, 32);
    m.poly(rockPoly(x, y, w, h, 7, 0.2, r), 0);
    shadeMask(p, m, [K.panel2, K.slate, K.slate, K.steel], 0);
  }
  dullPrism(p, 6, 27, 5, 13, -2);
  dullPrism(p, 20, 27, 5, 15, 2);
  dullPrism(p, 12, 28, 6, 22, 0);
  dullPrism(p, 9, 29, 4, 9, -1);
  dullPrism(p, 18, 29, 4, 7, 1);
  edge(p, K.night);
}

function xGeode(p: Pix): void {
  // A split geode: a rough blue-grey rind, its hollow open on top and lined with dull dark-blue
  // crystal points along the lit inner wall. No cyan, no white.
  const m = new Pix(16, 16);
  m.poly([[2, 9], [3, 6], [6, 4], [11, 4], [14, 7], [14, 11], [11, 14], [5, 14], [2, 12]], 0);
  shadeMask(p, m, [K.panel2, K.slate, K.slate, K.steel], 0.04);
  p.ell(4, 5, 9, 5, K.night);
  p.hl(5, 11, 5, K.navy);
  p.hl(5, 11, 6, K.navy);
  for (const x of [5, 7, 9, 11]) {
    p.px(x, 8, K.blue2);
    p.px(x + 1, 8, K.blue1);
    p.px(x, 7, K.blue1);
  }
  p.px(7, 6, K.blue1);
  p.line(3, 10, 5, 13, K.panel2);
  p.px(12, 12, K.panel2);
  edge(p, K.night);
}

// ---------------------------------------------------------------------------------------------
// Layer 4: the Magma Shelf (basalt). Accent: dull maroon. Only magma and emberite glow. The
// darkest colour is the wall's #10141f (STYLE L4 wall interior #151d28 #10141f), never the
// darkness tint.
// ---------------------------------------------------------------------------------------------

/** A basalt column: a hexagonal slate top over three dark side facets, h rows of side. */
function basaltColumn(p: Pix, cx: number, top: number, rx: number, ry: number, h: number): void {
  const half = rx / 2;
  const l = cx - rx;
  const r = cx + rx;
  const bot = top + ry;
  const side = new Pix(p.w, p.h);
  side.poly([[l, top], [cx - half, bot], [cx + half, bot], [r, top], [r, top + h], [cx + half, bot + h], [cx - half, bot + h], [l, top + h]], 0);
  const cap = new Pix(p.w, p.h);
  cap.poly([[l, top], [cx - half, top - ry], [cx + half, top - ry], [r, top], [cx + half, bot], [cx - half, bot]], 0);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (cap.on(x, y) || !side.on(x, y)) continue;
      const u = x + 0.5 - cx;
      if (x === Math.floor(cx - half)) p.px(x, y, K.slate);
      else p.px(x, y, u < -half ? (side.on(x - 1, y) ? K.panel2 : K.slate) : u > half ? K.night : K.panel);
    }
  }
  rimShade(p, cap, K.steel, K.slate, K.panel2);
}

function xHexPillar(p: Pix): void {
  // Columnar basalt: a tall hexagonal column with a shorter one beside it, slate tops, black
  // sides with dull maroon cracks.
  basaltColumn(p, 13, 9, 6, 3, 19);
  basaltColumn(p, 22, 18, 4.5, 2, 11);
  for (const [x0, y0, x1, y1] of [[12, 16, 13, 20], [13, 20, 12, 24], [9, 22, 10, 26], [22, 23, 23, 27]] as const) {
    p.line(x0, y0, x1, y1, K.wine1);
  }
  p.px(12, 25, K.wine0);
  edge(p, K.night);
}

function xVent(p: Pix): void {
  // A cold fumarole: a low basalt cone round a dark throat with a dull maroon rim, grey soot. The
  // throat is the wall's #10141f under a #151d28 far wall: dark, but never the darkness tint.
  const cone = new Pix(16, 16);
  cone.ell(1, 6, 14, 8, 0);
  shadeMask(p, cone, [K.panel, K.panel2, K.panel2, K.slate], 0.02);
  p.ell(4, 7, 8, 5, K.wine1);
  p.ell(5, 8, 6, 3, K.night);
  p.hl(6, 9, 8, K.panel);
  p.px(4, 9, K.wine0);
  p.px(11, 9, K.wine0);
  for (const [x, y] of [[3, 8], [12, 11], [9, 6], [2, 11], [13, 8]] as const) p.px(x, y, K.slate);
  p.px(10, 6, K.steel);
  edge(p, K.night);
}

function xEmberRock(p: Pix): void {
  // Black basalt with dull dark maroon cracks. It never glows: only emberite does.
  const m = lumpShape(p, [[3, 10], [5, 6], [9, 5], [13, 8], [12, 13], [5, 13]], [K.night, K.night, K.panel, K.panel2, K.slate]);
  const crack: Pt[] = [[5, 9], [6, 9], [7, 8], [8, 8], [9, 9], [10, 9], [11, 10], [8, 9], [8, 10], [7, 11]];
  for (const [x, y] of crack) if (inside(m, x, y)) p.px(x, y, K.wine1);
  if (inside(m, 7, 12)) p.px(7, 12, K.wine0);
  edge(p, K.night);
}

// ---------------------------------------------------------------------------------------------
// Layer 5: the Alien Strata (grey-green machine stone). No accent: carved, never lit.
// ---------------------------------------------------------------------------------------------

function xStoneGear(p: Pix): void {
  // A giant stone gear standing half sunk in the floor: carved grey-green teeth, its tread lit
  // along the top, a carved ring and dark green joints between its stones, a raised hub. No glow.
  const cx = 16;
  const cy = 23;
  const gear = (oy: number): Pix => {
    const m = new Pix(32, 32);
    m.paint(0, 0, 32, 31, (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - (cy + oy);
      const r = Math.hypot(dx, dy);
      if (r <= 11.6) return 0;
      if (r > 14.2) return null;
      const k = ((((Math.atan2(dy, dx) / (Math.PI * 2)) * 12 + 12.25) % 1) + 1) % 1;
      return k < 0.5 ? 0 : null;
    });
    return m;
  };
  const back = gear(-2);
  const face = gear(0);
  for (let y = 0; y < 31; y++) for (let x = 0; x < 32; x++) if (back.on(x, y) && !face.on(x, y)) p.px(x, y, K.steel2);
  rimShade(p, face, K.steel, K.steel, K.slate);
  // Carvings, kept inside the face.
  const c = new Pix(32, 32);
  c.ring(cx - 8, cy - 8, 16, 16, K.pine);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    c.line(cx + Math.cos(a) * 8.5, cy + Math.sin(a) * 8.5, cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, K.green1);
  }
  c.ell(cx - 4, cy - 4, 8, 8, K.pine);
  c.ell(cx - 3, cy - 3, 6, 6, K.steel2);
  c.ell(cx - 2, cy - 2, 5, 5, K.steel);
  c.px(cx - 2, cy - 3, K.steel2);
  c.px(cx + 1, cy + 1, K.slate);
  for (let y = 0; y < 31; y++) for (let x = 0; x < 32; x++) if (c.on(x, y) && face.on(x, y)) p.px(x, y, c.get(x, y));
  // Sunk: the floor closes over its lower part.
  for (let x = 1; x <= 30; x++) if (p.on(x, 30)) p.px(x, 30, h2(x, 30, 61) < 0.5 ? K.panel2 : K.pine);
  edge(p, K.panel);
}

function xGlassShard(p: Pix): void {
  // A broken shard of dead, dull green glass stuck in a stone: no aqua, no glow.
  const base = new Pix(16, 16);
  base.ell(3, 11, 10, 4, 0);
  shadeMask(p, base, [K.panel2, K.slate, K.slate, K.steel], 0);
  const m = new Pix(16, 16);
  m.poly([[5, 13], [6, 5], [10, 1], [12, 7], [11, 13]], 0);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!m.on(x, y)) continue;
      // Two flat facets split by a ridge from the tip down to the stone.
      const ridge = 10 - (y - 1) * (2 / 12);
      p.px(x, y, !m.on(x - 1, y) ? K.steel : x < ridge - 0.5 ? K.green1 : x < ridge + 0.5 ? K.slate : K.pine);
    }
  }
  p.line(6, 10, 8, 5, K.slate);
  edge(p, K.panel);
}

function xRelic(p: Pix): void {
  // A small carved tablet of machine stone, a ring glyph cut into its face (carved, never lit).
  p.rect(4, 2, 8, 3, K.steel2);
  p.vl(11, 3, 4, K.steel);
  p.rect(4, 5, 8, 9, K.steel);
  p.vl(4, 5, 13, K.steel2);
  p.vl(11, 5, 13, K.slate);
  p.hl(5, 11, 13, K.slate);
  p.hl(4, 11, 5, K.steel2);
  p.ring(5, 7, 6, 6, K.pine);
  p.px(7, 9, K.pine);
  p.px(8, 10, K.green1);
  p.px(6, 6, K.green1);
  p.px(9, 6, K.green1);
  p.px(3, 13, K.slate);
  p.px(12, 13, K.panel2);
  edge(p, K.panel);
}

// =============================================================================================
// Portrait (p_mags): 48 x 48. Mags Okafor, site engineer, on the radio: warm brown skin, short
// dark hair under a yellow hard hat with a headlamp, work jacket, headset mic, dark panel behind.
// =============================================================================================

function portraitMags(p: Pix): void {
  // Panel background with a dithered halo behind her head.
  p.rect(0, 0, 48, 48, K.panel);
  p.paint(0, 0, 48, 48, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 23, (y + 0.5 - 20) / 23);
    if (d < 0.72) return K.panel2;
    if (d < 0.86) return (x + y) % 2 === 0 ? K.panel2 : null;
    if (d < 0.96) return (x % 2 === 0 && y % 2 === 0) ? K.panel2 : null;
    return null;
  });

  const f = new Pix(48, 48);

  // Work jacket: shoulders, collar, reflective band, company patch.
  f.poly([[2, 48], [6, 41], [13, 38], [19, 36], [29, 36], [35, 38], [42, 41], [46, 48]], K.blue1);
  f.paint(0, 36, 48, 12, (x, y) => {
    if (f.get(x, y) !== K.blue1) return null;
    if (y < 41 && x < 14) return K.blue2;
    if (x > 38) return K.navy;
    return null;
  });
  f.poly([[19, 36], [24, 44], [29, 36]], K.slate);
  f.hl(21, 27, 36, K.steel);
  f.poly([[16, 37], [19, 36], [23, 43], [20, 44]], K.blue3);
  f.poly([[32, 37], [29, 36], [25, 43], [28, 44]], K.blue2);
  f.vl(24, 44, 47, K.steel2);
  const cloth = new Set([K.blue1, K.blue2, K.navy]);
  f.paint(0, 44, 48, 2, (x, y) => (cloth.has(f.get(x, y)) ? (y === 44 ? K.silver : K.steel3) : null));
  f.rect(31, 39, 5, 3, K.gold);
  f.hl(31, 35, 39, K.pale);
  f.px(33, 40, K.rust1);

  // Neck, slim, in the shadow of the jaw.
  f.rect(20, 31, 8, 7, K.earth1);
  f.vl(20, 31, 36, K.earth2);
  f.vl(21, 33, 36, K.earth2);
  f.hl(21, 26, 32, K.earth0);

  // Ear (her right, our left) with a gold stud, short dark curls at the temples and nape.
  f.ell(11, 20, 5, 7, K.earth2);
  f.px(12, 21, K.earth3);
  f.px(13, 23, K.earth1);
  f.px(13, 24, K.earth0);
  f.px(12, 26, K.gold);
  for (const [x0, x1, y0, y1] of [[13, 16, 15, 24], [31, 34, 15, 22], [14, 16, 25, 28]] as const) {
    f.paint(x0, y0, x1 - x0 + 1, y1 - y0 + 1, (x, y) => ((x * 2 + y) % 4 === 0 ? K.plum : (x + y) % 5 === 0 ? K.earth0 : K.wine0));
  }

  // Face: a soft rounded oval, shaded from the upper left.
  const face = new Pix(48, 48);
  face.ell(14, 12, 20, 19, 0);
  face.ell(15, 18, 18, 15, 0);
  face.ell(18, 27, 12, 7, 0);
  // Cel shading: warm base, lit cheek and temple on our left, a soft shadow down the right.
  f.paint(14, 12, 20, 22, (x, y) => {
    if (!face.on(x, y)) return null;
    if (!face.on(x, y + 1) || !face.on(x + 1, y)) return K.earth1;
    if (!face.on(x + 3, y) || (y > 29 && !face.on(x + 4, y))) return x > 30 || y > 31 ? K.earth1 : K.earth2;
    if (x < 20 && y > 19 && y < 30) return !face.on(x - 2, y) ? K.earth2 : K.earth3;
    return K.earth2;
  });
  f.px(17, 26, K.sand);
  f.px(18, 27, K.earth3);
  // Shadow of the hat brim across the brow.
  f.paint(14, 18, 20, 2, (x, y) => (face.on(x, y) ? (y === 18 ? K.earth1 : null) : null));
  // Arched brows, lashed eyes with a catchlight.
  for (const [x, y] of [[16, 21], [17, 20], [18, 20], [19, 20], [27, 20], [28, 20], [29, 20], [30, 21]] as const) {
    f.px(x, y, K.wine0);
  }
  for (const [ex, flick] of [[17, 16], [26, 30]] as const) {
    f.hl(ex, ex + 3, 22, K.wine0);
    f.px(flick, 22, K.wine0);
    f.hl(ex, ex + 3, 23, K.cream);
    f.rect(ex + 1, 23, 2, 2, K.wine0);
    f.px(ex + 1, 23, K.white);
    f.px(ex + 2, 24, K.plum);
    f.hl(ex + 1, ex + 2, 25, K.earth2);
  }
  // Nose.
  f.vl(23, 24, 26, K.earth3);
  f.vl(25, 25, 27, K.earth1);
  f.hl(23, 24, 27, K.sand);
  f.px(22, 28, K.earth1);
  f.px(25, 28, K.earth0);
  // Lips in a warm grin.
  f.hl(21, 26, 30, K.crimson);
  f.px(20, 29, K.earth1);
  f.px(27, 29, K.earth1);
  f.hl(21, 26, 31, K.cream);
  f.px(26, 31, K.sand);
  f.hl(21, 26, 32, K.red);
  f.hl(22, 23, 32, K.coral);
  f.px(20, 31, K.crimson);
  f.px(27, 31, K.crimson);

  // Headset: ear cup on her left (our right), band under the hat, boom mic to the mouth.
  f.ell(31, 19, 7, 10, K.panel2);
  f.ell(32, 20, 5, 8, K.slate);
  f.px(33, 21, K.steel2);
  f.px(32, 22, K.steel);
  f.vl(33, 15, 19, K.panel);
  for (const [x, y] of [[34, 28], [33, 29], [32, 30], [31, 31], [30, 31], [29, 32]] as const) {
    f.px(x, y, K.slate);
  }
  f.rect(27, 31, 3, 3, K.panel2);
  f.px(27, 31, K.steel);
  f.px(29, 33, K.panel);

  // Hard hat: dome, ridge, brim, headlamp.
  const dome = new Pix(48, 48);
  dome.paint(11, 2, 26, 13, (x, y) => (inEll(x - 11, y - 2, 26, 24) ? 0 : null));
  shadeMask(f, dome, [K.rust1, K.amber, K.gold, K.gold, K.pale, K.pale], 0.04);
  f.vl(23, 2, 13, K.pale);
  f.vl(24, 2, 13, K.amber);
  f.vl(25, 3, 13, K.amber);
  f.ell(7, 12, 34, 7, K.gold);
  f.paint(7, 12, 34, 7, (x, y) => {
    if (!inEll(x - 7, y - 12, 34, 7)) return null;
    if (y >= 17) return K.rust1;
    if (y === 16) return K.amber;
    if (x < 16 && y <= 14) return K.pale;
    if (x > 34) return K.amber;
    return null;
  });
  f.ell(19, 6, 10, 8, K.panel2);
  f.ell(20, 7, 8, 6, K.slate);
  f.ell(21, 8, 6, 4, K.pale);
  f.rect(22, 9, 3, 2, K.white);
  f.px(26, 11, K.gold);
  f.px(12, 9, K.white);

  f.outline(K.ink, K.ink);
  p.blit(f, 0, 0);
  // Headlamp glow spilling over the brim edge.
  p.px(20, 5, K.pale);
  p.px(27, 5, K.gold);
}

// =============================================================================================
// Registry: sprite name -> drawer, and the public API
// =============================================================================================

type Drawer = () => Pix;

const REGISTRY = new Map<string, Drawer>();

function sized(size: number, draw: (p: Pix) => void): Drawer {
  return () => {
    const p = new Pix(size, size);
    draw(p);
    return p;
  };
}

for (const def of BUILDING_LIST) {
  if (def.kind === 'belt') continue;
  REGISTRY.set(`b_${def.id}`, sized(def.size * 16, (p) => drawBuilding(p, def)));
}
REGISTRY.set('b_drill_broken', sized(80, (p) => drill(p, true)));
REGISTRY.set('b_heart_dormant', sized(112, (p) => heart(p, false)));
for (const it of ITEM_LIST) REGISTRY.set(`i_${it.id}`, sized(16, (p) => drawItem(p, it)));
for (const ore of depositOres()) {
  for (let v = 1; v <= 3; v++) REGISTRY.set(`d_${ore}_${v}`, sized(16, (p) => drawDeposit(p, ore, v)));
}
/** The layer a decor name belongs to: x_l<n>_..., else the layer that lists it. */
function decorLayer(name: string): number {
  const m = /^x_l(\d+)_/.exec(name);
  if (m) return Number(m[1]);
  return Math.max(0, LAYERS.findIndex((L) => L.decor.includes(name)));
}
// Decor straight from the data: every name a layer lists (map decor value v draws
// LAYERS[layer].decor[v - 1]) plus the amber-sealed rock; a name without a drawing still gets a
// dull pebble cluster in its layer's colours.
for (const name of new Set([...LAYERS.flatMap((L) => L.decor), AMBER_SPRITE])) {
  const art = DECOR_ART[name];
  REGISTRY.set(name, art ? sized(art.size, art.draw) : sized(16, (p) => genericDecor(p, decorLayer(name))));
}
REGISTRY.set('p_mags', sized(48, portraitMags));

/** Every sprite name this module can draw. */
export function fallbackNames(): string[] {
  return [...REGISTRY.keys()];
}

export interface FallbackPixels {
  w: number;
  h: number;
  /** Straight RGBA, 4 bytes per pixel, row-major. Transparent pixels are all zero. */
  rgba: Uint8ClampedArray;
  /** Light spots the renderer may glow (machines only). */
  lights: FallbackLight[];
}

/** The sprite as raw RGBA without touching the DOM (tests, Node scripts, contact sheets). */
export function fallbackPixels(name: string): FallbackPixels | null {
  const draw = REGISTRY.get(name);
  if (!draw) return null;
  const p = draw();
  const rgba = new Uint8ClampedArray(p.w * p.h * 4);
  for (let i = 0; i < p.a.length; i++) {
    const c = p.a[i];
    if (c < 0) continue;
    const [r, g, b] = RGB[c];
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { w: p.w, h: p.h, rgba, lights: p.lights };
}

/** Light spots of a building sprite (furnace mouth, lamp, coil), in sprite pixels. */
export function fallbackLights(name: string): FallbackLight[] {
  return REGISTRY.get(name)?.().lights ?? [];
}

/** A new canvas with the code-drawn sprite, or null for names this module does not know. */
export function makeFallback(name: string): HTMLCanvasElement | null {
  const px = fallbackPixels(name);
  if (!px) return null;
  const canvas = document.createElement('canvas');
  canvas.width = px.w;
  canvas.height = px.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  const img = ctx.createImageData(px.w, px.h);
  img.data.set(px.rgba);
  ctx.putImageData(img, 0, 0);
  return canvas;
}
