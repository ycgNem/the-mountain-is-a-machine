/**
 * Title art layout (batch TA): the hand-blocked starting image passed to create_image_pixflux as
 * init_image (art plan batch TA, STYLE.md "PixelLab settings"). Free; Apollo colours only; 320 x 180.
 *
 *   node scripts/art/title_layout.ts [--out <png>] [--mountain <png>]
 *
 * Writes (default) art/ref/title_layout.png and a 3x preview with the game's logo, tagline, button
 * and footer boxes outlined, art/out/title/<name>-3x.png. Upload the PNG with get_upload_url and pass
 * its upload:<id> as init_image_url (its base64 is too long for a tool argument).
 *   --mountain <png>   take the mountain (x >= 128, from its silhouette down to y 61) from an earlier
 *                      320 x 180 result instead of drawing the polygon one
 *
 * Composition, in art pixels. The game draws the art at 2x on a 640 x 360 UI (src/ui/windows.ts,
 * drawTitle / drawTitleBackdrop) under a 25% #090a14 veil, and draws the logo itself:
 *   y 0-29     dawn sky, empty: logo at x 93-228, y 14-21 (#e8c170 with an ink shadow), tagline at
 *              x 105-215, y 25-29 (#a8b5b2). The top stays dark navy so the pale-gold logo reads.
 *   y 13-61    Old Thrum on the right, its cliff foot at x 128, lit from the upper left
 *   y 30-61    the dig site at the foot of the cliff: HQ, shipping gantry, belt, and the drill rig
 *              (its derrick stays below the tagline)
 *   y 62-67    L0 ochre ground band
 *   y 68-142   L1 umber / L2 violet / L3 navy / L4 basalt bands with caves left and right of the
 *              buttons (x 117-211, y 100-137)
 *   y 143-179  L5 grey-green chamber; the Heart at (160, 155) sits between the buttons and the
 *              footer text (y 169-178)
 *   shafts     x 108-113 (from the drill down) and x 236-241 (from L1 down), company-yellow cabs
 */
import { join, basename } from 'node:path';
import { APOLLO, OUT_DIR, ROOT, createPng, fromRoot, hexToRgb, isApollo, readPng, rel, rgbToHex, scaleNearest, strokeRect, writePng } from './lib.ts';
import type { PNG } from './lib.ts';
import { mulberry32 } from './scene.ts';

const W = 320;
const H = 180;
const GROUND = 62;
const CLIFF_X = 128;
const rng = mulberry32(0x7417e);
const grid: string[] = new Array<string>(W * H).fill('#172038');

const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
function set(x: number, y: number, c: string): void {
  if (inside(x, y)) grid[y * W + x] = c;
}
function get(x: number, y: number): string {
  return inside(x, y) ? grid[y * W + x] : '';
}
function rect(x: number, y: number, w: number, h: number, c: string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, c);
}
function hline(x0: number, x1: number, y: number, c: string): void {
  for (let x = x0; x <= x1; x++) set(x, y, c);
}
function vline(x: number, y0: number, y1: number, c: string): void {
  for (let y = y0; y <= y1; y++) set(x, y, c);
}
/** Pixel centres inside the ellipse; `c` may pick a colour per pixel (null = leave it). */
function ellipse(cx: number, cy: number, rx: number, ry: number, c: string | ((x: number, y: number) => string | null)): void {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const col = typeof c === 'string' ? c : c(x, y);
      if (col) set(x, y, col);
    }
  }
}
/** Even-odd scanline fill of a polygon (pixel centres) into a mask. */
function polyMask(pts: readonly (readonly [number, number])[]): Uint8Array {
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) if (inside(x, y)) mask[y * W + x] = 1;
    }
  }
  return mask;
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

// ---------------------------------------------------------------------------------------------
// Sky: dark navy at the top (the logo band), then blue, violet and plum to a pink dawn glow.

const SKY: readonly (readonly [number, string])[] = [
  [0, '#172038'],
  [27, '#253a5e'],
  [36, '#402751'],
  [44, '#7a367b'],
  [50, '#a23e8c'],
  [54, '#c65197'],
  [59, '#df84a5'],
];
for (let y = 0; y < GROUND; y++) {
  let k = 0;
  while (k + 1 < SKY.length && y >= SKY[k + 1][0]) k++;
  for (let x = 0; x < W; x++) {
    let c = SKY[k][1];
    // Two dithered rows below each band edge.
    if (k > 0 && y - SKY[k][0] < 2 && (x + y) % 2 === 0) c = SKY[k - 1][1];
    set(x, y, c);
  }
}
// A few stars, kept out of the logo box (x 85-236).
for (const [x, y] of [[9, 4], [27, 11], [48, 3], [66, 16], [17, 21], [251, 5], [276, 9], [298, 4], [311, 17], [74, 7]] as const) {
  set(x, y, y < 12 ? '#c7cfcc' : '#819796');
}

// ---------------------------------------------------------------------------------------------
// Old Thrum.

/** Colours of the mountain in a PixelLab result (its sky never uses them). */
const ROCK = new Set(['#341c27', '#4d2b32', '#602c2c', '#411d31', '#7a4841', '#ad7757', '#c09473', '#884b2b', '#241527']);

function pasteMountain(path: string): void {
  const src = readPng(fromRoot(path));
  if (src.width !== W || src.height !== H) throw new Error(`${path} is ${src.width}x${src.height}, not ${W}x${H}`);
  const at = (x: number, y: number): string => {
    const i = (y * W + x) * 4;
    return rgbToHex(src.data[i], src.data[i + 1], src.data[i + 2]);
  };
  for (let x = CLIFF_X; x < W; x++) {
    // The silhouette top: the first of three rock pixels in a row (skips stray specks in the sky).
    let top = -1;
    for (let y = 0; y + 2 < GROUND; y++) {
      if (ROCK.has(at(x, y)) && ROCK.has(at(x, y + 1)) && ROCK.has(at(x, y + 2))) {
        top = y;
        break;
      }
    }
    if (top < 0) continue;
    for (let y = top; y < GROUND; y++) set(x, y, at(x, y));
  }
}

function drawMountain(): void {
  const peakX = 262;
  const mountain = polyMask([
    [127, 62], [128, 56], [130, 50], [133, 45], [137, 41], [142, 39], [150, 38], [158, 36], [166, 37],
    [174, 35], [184, 33], [192, 34], [202, 33], [212, 34], [222, 33], [230, 30], [238, 27], [246, 23],
    [252, 19], [258, 15], [262, 13], [266, 15], [272, 19], [280, 24], [290, 29], [300, 33], [310, 36],
    [320, 38], [320, 62],
  ]);
  const inM = (x: number, y: number): boolean => inside(x, y) && mountain[y * W + x] === 1;
  for (let y = 0; y < GROUND; y++) {
    for (let x = 0; x < W; x++) {
      if (!inM(x, y)) continue;
      let dl = 1;
      while (dl < 9 && inM(x - dl, y)) dl++;
      let du = 1;
      while (du < 9 && inM(x, y - du)) du++;
      let c: string;
      if (dl === 1) c = '#c09473';
      else if (dl <= 3) c = '#ad7757';
      else if (dl <= 7 && x < 152) c = '#7a4841';
      else if (du === 1 && x < peakX) c = '#ad7757';
      else if (du <= 3 && x < peakX) c = '#7a4841';
      else if (du <= 2) c = '#4d2b32';
      else c = x < peakX ? '#4d2b32' : '#341c27';
      set(x, y, c);
    }
  }
}

const mountainFrom = argValue('--mountain');
if (mountainFrom) pasteMountain(mountainFrom);
else drawMountain();

// ---------------------------------------------------------------------------------------------
// Ground and underground bands.

interface Band {
  top: number;
  bottom: number;
  rock: string;
  speck: string;
}
const L0: Band = { top: 62, bottom: 67, rock: '#c09473', speck: '#ad7757' };
const L1: Band = { top: 68, bottom: 87, rock: '#4d2b32', speck: '#341c27' };
const L2: Band = { top: 88, bottom: 106, rock: '#241527', speck: '#1e1d39' };
const L3: Band = { top: 107, bottom: 125, rock: '#172038', speck: '#10141f' };
const L4: Band = { top: 126, bottom: 142, rock: '#151d28', speck: '#10141f' };
const L5: Band = { top: 143, bottom: 179, rock: '#202e37', speck: '#151d28' };
for (const b of [L0, L1, L2, L3, L4, L5]) {
  rect(0, b.top, W, b.bottom - b.top + 1, b.rock);
  for (let i = 0; i < (W * (b.bottom - b.top)) / 9; i++) set(Math.floor(rng() * W), b.top + Math.floor(rng() * (b.bottom - b.top + 1)), b.speck);
}
// Ground surface: lit top line and pebbles.
hline(0, W - 1, GROUND, '#e7d5b3');
for (let i = 0; i < 90; i++) set(Math.floor(rng() * W), 63 + Math.floor(rng() * 4), pick(['#d7b594', '#ad7757', '#e7d5b3']));
// Wavy strata lines between bands, in the darker rock.
for (const [y, c] of [[67, '#7a4841'], [87, '#341c27'], [106, '#1e1d39'], [125, '#10141f'], [142, '#10141f']] as const) {
  for (let x = 0; x < W; x++) set(x, y + Math.round(Math.sin(x / 7 + y) * 0.8), c);
}
// L5 rock is fitted machine stone: dark joints in a slab pattern.
for (let y = L5.top; y <= L5.bottom; y++) {
  for (let x = 0; x < W; x++) {
    const row = Math.floor((y - L5.top) / 6);
    if ((y - L5.top) % 6 === 0 || (x + row * 5) % 11 === 0) set(x, y, '#151d28');
  }
}

// ---------------------------------------------------------------------------------------------
// Caves: an irregular cavity with a flat lit floor. Returns the ceiling row per column.

interface CaveColors {
  wall: string;
  ceiling: string;
  floor: string;
  lip: string;
}
function cave(x0: number, x1: number, top: number, floor: number, col: CaveColors): Map<number, number> {
  const ceil = new Map<number, number>();
  const span = x1 - x0;
  const phase = rng() * 10;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / span;
    const end = Math.min(t, 1 - t) * span; // px from the nearer end
    const round = end < 6 ? Math.round((6 - end) * 1.1) : 0;
    const bump = Math.round(1.2 * Math.sin(x / 5 + phase) + 0.8 * Math.sin(x / 2.3 + phase * 2));
    const c = Math.min(floor - 2, top + Math.max(0, bump) + round);
    ceil.set(x, c);
    for (let y = c; y <= floor; y++) set(x, y, col.wall);
    set(x, c, col.ceiling);
    set(x, floor, col.floor);
    set(x, floor - 1, col.lip);
  }
  return ceil;
}

// L1 Shallows: umber caves, timber frames with hanging lanterns.
const L1C: CaveColors = { wall: '#7a4841', ceiling: '#4d2b32', floor: '#ad7757', lip: '#c09473' };
const L1_FLOOR = 84;
const l1a = cave(12, 113, 71, L1_FLOOR, L1C);
const l1b = cave(140, 196, 72, L1_FLOOR, L1C);
const l1c = cave(214, 304, 71, L1_FLOOR, L1C);
function timberFrame(x: number, ceil: Map<number, number>): void {
  const top = Math.max(ceil.get(x) ?? 72, ceil.get(x + 8) ?? 72) + 1;
  for (const px of [x, x + 7]) {
    vline(px, top, L1_FLOOR - 2, '#ad7757');
    vline(px + 1, top, L1_FLOOR - 2, '#884b2b');
  }
  hline(x - 1, x + 9, top, '#ad7757');
  hline(x - 1, x + 9, top + 1, '#884b2b');
  // A lantern hangs from the middle of the beam, its warm glow dithered on the rock behind.
  const lx = x + 4;
  const ly = top + 4;
  ellipse(lx + 0.5, ly + 1, 4.5, 3.5, (px, py) => (get(px, py) === L1C.wall && (px + py) % 2 === 0 ? '#ad7757' : null));
  vline(lx, top + 2, ly - 1, '#602c2c');
  rect(lx - 1, ly, 3, 3, '#de9e41');
  set(lx, ly + 1, '#e8c170');
  hline(lx - 1, lx + 1, ly + 3, '#884b2b');
}
for (const x of [24, 56, 88]) timberFrame(x, l1a);
timberFrame(164, l1b);
for (const x of [222, 256, 284]) timberFrame(x, l1c);
// A minecart and an ore pile on the L1 floor.
rect(40, 79, 10, 3, '#884b2b');
hline(40, 49, 79, '#be772b');
rect(41, 77, 8, 2, '#577277');
set(42, 82, '#202e37');
set(47, 82, '#202e37');
ellipse(272, 82, 5, 2.5, (x, y) => ((x + y) % 3 === 0 ? '#819796' : '#577277'));

// L2 Fungal Caverns: violet caves, moss, glowcaps, a pool.
const L2C: CaveColors = { wall: '#402751', ceiling: '#241527', floor: '#7a367b', lip: '#25562e' };
const L2_FLOOR = 103;
cave(6, 113, 91, L2_FLOOR, L2C);
cave(218, 316, 91, L2_FLOOR, L2C);
for (let x = 6; x <= 316; x++) {
  if (get(x, L2_FLOOR - 1) === L2C.lip && rng() < 0.35) set(x, L2_FLOOR - 2, rng() < 0.5 ? '#25562e' : '#468232');
}
function glowcap(x: number, h: number, w: number): void {
  const top = L2_FLOOR - 1 - h;
  ellipse(x + 0.5, top + 0.5, w * 0.9 + 2, 3.5, (px, py) => (get(px, py) === L2C.wall && (px * 3 + py) % 4 === 0 ? '#7a367b' : null));
  vline(x, top + 1, L2_FLOOR - 2, '#d0da91');
  hline(x - (w >> 1), x + (w >> 1), top, '#c65197');
  hline(x - (w >> 1) + 1, x + (w >> 1) - 1, top - 1, '#df84a5');
  set(x, top, '#a8ca58');
}
for (const [x, h, w] of [[18, 5, 5], [24, 3, 3], [47, 6, 7], [55, 3, 3], [78, 4, 5], [98, 5, 5], [230, 4, 5], [252, 6, 7], [260, 3, 3], [303, 5, 5]] as const) {
  glowcap(x, h, w);
}
// The pool in the right cavern: water sunk into the floor.
rect(270, L2_FLOOR - 3, 26, 4, '#172038');
hline(271, 294, L2_FLOOR - 3, '#253a5e');
for (const x of [275, 283, 290]) set(x, L2_FLOOR - 2, '#a4dddb');
// Spore motes.
for (let i = 0; i < 26; i++) {
  const x = pick([10 + Math.floor(rng() * 100), 222 + Math.floor(rng() * 90)]);
  const y = 93 + Math.floor(rng() * 7);
  if (get(x, y) === L2C.wall) set(x, y, rng() < 0.5 ? '#c65197' : '#a8ca58');
}

// L3 Crystal Depths: navy caves with cyan crystal clusters.
const L3C: CaveColors = { wall: '#253a5e', ceiling: '#172038', floor: '#4f8fba', lip: '#3c5e8b' };
const L3_FLOOR = 122;
const l3a = cave(16, 113, 110, L3_FLOOR, L3C);
const l3b = cave(236, 308, 110, L3_FLOOR, L3C);
function crystal(x: number, base: number, h: number, up: boolean): void {
  for (let i = 0; i < h; i++) {
    const y = up ? base - i : base + i;
    const half = Math.max(0, Math.round(((h - i) / h) * 1.6));
    for (let dx = -half; dx <= half; dx++) set(x + dx, y, dx < 0 ? '#a4dddb' : dx === 0 ? '#73bed3' : '#4f8fba');
  }
  set(x, up ? base - h + 1 : base + h - 1, '#ebede9');
}
for (const [x, h] of [[24, 6], [28, 9], [32, 5], [58, 7], [62, 4], [84, 8], [88, 5], [244, 7], [248, 9], [253, 5], [282, 6], [296, 8], [300, 4]] as const) {
  crystal(x, L3_FLOOR - 2, h, true);
}
for (const [x, h, c] of [[40, 4, l3a], [72, 5, l3a], [266, 4, l3b], [288, 3, l3b]] as const) crystal(x, (c.get(x) ?? 111) + 1, h, false);
// Crystal veins in the rock.
for (const [x0, y0, len] of [[140, 110, 10], [176, 116, 8], [200, 109, 9], [6, 112, 6], [312, 115, 6]] as const) {
  for (let i = 0; i < len; i++) set(x0 + i, y0 + Math.round(i * 0.6), i % 3 === 0 ? '#73bed3' : '#3c5e8b');
}

// L4 Magma Shelf: a long basalt cave, clusters of hexagonal columns, a magma channel on the floor.
const L4C: CaveColors = { wall: '#202e37', ceiling: '#10141f', floor: '#411d31', lip: '#a53030' };
const L4_FLOOR = 141;
const l4 = cave(4, 316, 128, L4_FLOOR, L4C);
function columns(x: number, heights: readonly number[]): void {
  heights.forEach((h, k) => {
    const cx = x + k * 4;
    const top = Math.max((l4.get(cx) ?? 129) + 2, 137 - h);
    rect(cx, top, 4, 137 - top, '#394a50');
    vline(cx, top, 136, '#577277');
    vline(cx + 3, top, 136, '#202e37');
    hline(cx, cx + 3, top, '#819796');
  });
}
columns(10, [5, 8, 6]);
columns(44, [7, 4]);
columns(78, [6, 9, 5]);
columns(124, [5, 7]);
columns(176, [8, 6]);
columns(214, [4, 7, 5]);
columns(254, [6, 9]);
columns(288, [5, 8, 6]);
for (let x = 4; x <= 316; x++) {
  // The channel swells and narrows; its surface is the hottest.
  const top = 138 - Math.max(0, Math.round(Math.sin(x / 11) * 1.2 + Math.sin(x / 4.7) * 0.6));
  for (let y = top; y <= L4_FLOOR; y++) {
    const c = y === top ? '#e8c170' : y === L4_FLOOR ? '#a53030' : y === L4_FLOOR - 1 ? '#cf573c' : '#da863e';
    set(x, y, c);
  }
  if ((x * 7) % 13 === 0) set(x, top, '#ebede9');
  if (get(x, top - 1) === L4C.wall && x % 2 === 0) set(x, top - 1, '#752438');
  if (get(x, top - 2) === L4C.wall && x % 4 === 1) set(x, top - 2, '#752438');
}

// L5 Alien Strata: a domed chamber of grey-green slabs, conduits, and the Heart.
const HX = 160;
const HY = 155;
const L5_FLOOR = 170;
for (let x = 40; x <= 286; x++) {
  const t = Math.abs(x - HX) / 126;
  const ceil = Math.round(146 + t * t * 8);
  for (let y = ceil; y <= L5_FLOOR + 1; y++) {
    const row = Math.floor((y - 146) / 5);
    const joint = (y - 146) % 5 === 0 || (x + row * 4) % 10 === 0;
    set(x, y, joint ? '#19332d' : '#394a50');
  }
  set(x, ceil, '#151d28');
  set(x, L5_FLOOR, '#819796');
  set(x, L5_FLOOR + 1, '#577277');
}
// Conduits: dark glass pipes with a pale aqua core, running out from the Heart.
for (const [x0, x1] of [[44, HX - 10], [HX + 10, 282]] as const) {
  for (let x = x0; x <= x1; x++) {
    set(x, HY - 1, '#25562e');
    set(x, HY, '#a4dddb');
    set(x, HY + 1, '#19332d');
  }
}
for (const x of [70, 250]) {
  for (let y = 149; y < L5_FLOOR; y++) {
    set(x - 1, y, '#25562e');
    set(x, y, '#a4dddb');
    set(x + 1, y, '#19332d');
  }
}
// Giant stone gears half-sunk in the chamber walls.
function gear(cx: number, cy: number, r: number): void {
  ellipse(cx, cy, r + 2, r + 2, (x, y) => {
    const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r && Math.cos(a * 10) < 0.2) return null;
    if (d < r * 0.35) return '#577277';
    if (d < r * 0.55) return '#202e37';
    return x + y < cx + cy ? '#577277' : '#394a50';
  });
}
gear(26, 162, 12);
gear(300, 160, 11);
// The Heart: stone ring, gear teeth, dark glass, pale aqua core.
ellipse(HX, HY, 16, 14, (x, y) => (['#394a50', '#19332d'].includes(get(x, y)) && (x + y) % 2 === 0 ? '#577277' : null));
ellipse(HX, HY, 12.5, 12.5, (x, y) => {
  const a = Math.atan2(y + 0.5 - HY, x + 0.5 - HX);
  const d = Math.hypot(x + 0.5 - HX, y + 0.5 - HY);
  if (d > 11 && Math.cos(a * 12) < 0.3) return null;
  return x + y < HX + HY - 4 ? '#819796' : '#577277';
});
ellipse(HX, HY, 9, 9, '#25562e');
ellipse(HX, HY, 6.5, 6.5, '#73bed3');
ellipse(HX, HY, 4.5, 4.5, '#a4dddb');
ellipse(HX, HY, 2.2, 2.2, '#ebede9');

// ---------------------------------------------------------------------------------------------
// Shafts (freight elevators) with company-yellow cabs.

function shaft(x: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    set(x, y, '#577277');
    set(x + 1, y, '#10141f');
    set(x + 2, y, '#090a14');
    set(x + 3, y, '#090a14');
    set(x + 4, y, '#10141f');
    set(x + 5, y, '#394a50');
    if ((y - y0) % 6 === 0) hline(x + 1, x + 4, y, '#202e37');
  }
}
function cab(x: number, y: number): void {
  rect(x + 1, y, 4, 4, '#de9e41');
  hline(x + 1, x + 4, y, '#e8c170');
  vline(x + 4, y + 1, y + 3, '#be772b');
  set(x + 2, y + 2, '#151d28');
}
shaft(108, 60, L5_FLOOR);
shaft(236, 72, L5_FLOOR);
cab(108, 77);
cab(108, 131);
cab(236, 96);
cab(236, 160);

// ---------------------------------------------------------------------------------------------
// The dig site at the foot of the cliff.

// Scrub.
for (const [x, w] of [[3, 4], [27, 3], [88, 4]] as const) {
  hline(x, x + w - 1, 61, '#25562e');
  hline(x + 1, x + w - 2, 60, '#468232');
  set(x + 1, 59, '#75a743');
}
// HQ: steel walls, company-yellow flat roof with a white stencil, lit windows, radio mast.
rect(34, 53, 11, 9, '#577277');
rect(45, 53, 12, 9, '#394a50');
vline(34, 53, 61, '#819796');
rect(33, 50, 25, 3, '#de9e41');
hline(33, 57, 50, '#e8c170');
vline(57, 50, 52, '#be772b');
hline(33, 57, 52, '#be772b');
hline(39, 41, 51, '#ebede9');
for (const x of [37, 41, 49, 53]) rect(x, 55, 2, 2, '#e8c170');
rect(45, 58, 3, 4, '#202e37');
vline(54, 41, 49, '#819796');
set(54, 40, '#cf573c');
// Shipping gantry crane over a cargo bay.
rect(60, 59, 26, 3, '#394a50');
hline(60, 85, 59, '#577277');
vline(63, 46, 58, '#e8c170');
vline(64, 46, 58, '#de9e41');
vline(81, 46, 58, '#de9e41');
vline(82, 46, 58, '#be772b');
rect(62, 44, 22, 2, '#de9e41');
hline(62, 83, 44, '#e8c170');
hline(62, 83, 46, '#be772b');
rect(70, 47, 4, 2, '#394a50');
vline(71, 49, 52, '#202e37');
rect(68, 53, 7, 5, '#ad7757');
hline(68, 74, 55, '#7a4841');
vline(74, 53, 57, '#7a4841');
// Belt from the gantry to the drill, with items.
for (let x = 86; x <= 93; x++) {
  set(x, 60, x % 2 === 0 ? '#577277' : '#394a50');
  set(x, 61, '#151d28');
}
for (let x = 58; x <= 59; x++) set(x, 60, '#394a50');
set(88, 59, '#e8c170');
set(92, 59, '#819796');
// The drill rig: hazard-striped base, company-yellow housing with a bore, brass motors, derrick.
rect(94, 56, 34, 6, '#202e37');
for (let x = 94; x <= 127; x++) for (const y of [56, 57]) set(x, y, Math.floor((x + y) / 2) % 2 === 0 ? '#de9e41' : '#151d28');
hline(94, 127, 61, '#151d28');
rect(98, 43, 26, 13, '#de9e41');
hline(98, 123, 43, '#e8c170');
vline(98, 43, 55, '#e8c170');
vline(122, 44, 55, '#be772b');
vline(123, 44, 55, '#be772b');
hline(99, 123, 55, '#be772b');
vline(104, 45, 54, '#be772b');
vline(117, 45, 54, '#be772b');
ellipse(111, 49.5, 4.5, 4.5, (x, y) => (Math.hypot(x + 0.5 - 111, y + 0.5 - 49.5) > 3.3 ? '#394a50' : '#151d28'));
set(110, 48, '#090a14');
set(111, 49, '#090a14');
for (const x of [94, 124]) {
  rect(x, 46, 4, 10, '#be772b');
  vline(x, 46, 55, '#de9e41');
  vline(x + 3, 46, 55, '#884b2b');
  set(x + 1, 45, '#e8c170');
  set(x + 2, 45, '#e8c170');
}
// Derrick: two steel legs and X braces from y 33 (under the tagline), a crown and a work lamp.
for (let y = 33; y <= 42; y++) {
  const spread = Math.round((y - 33) * 0.3);
  set(105 - spread, y, '#577277');
  set(116 + spread, y, '#394a50');
}
for (let k = 0; k < 2; k++) {
  const y0 = 34 + k * 4;
  for (let i = 0; i < 4; i++) {
    set(Math.round(106 + i * 2.6), y0 + i, '#394a50');
    set(Math.round(115 - i * 2.6), y0 + i, '#394a50');
  }
}
rect(103, 31, 16, 2, '#202e37');
hline(103, 118, 31, '#577277');
set(110, 30, '#e8c170');
set(111, 30, '#e8c170');
vline(110, 33, 42, '#819796');
vline(111, 33, 42, '#577277');

// ---------------------------------------------------------------------------------------------
// Write, check, preview.

function toPng(): PNG {
  const png = createPng(W, H);
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = hexToRgb(grid[i]);
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return png;
}

function main(): number {
  const outArg = argValue('--out');
  const out = outArg ? fromRoot(outArg) : join(ROOT, 'art', 'ref', 'title_layout.png');
  const png = toPng();
  const used = new Set<string>();
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = hexToRgb(grid[i]);
    if (!isApollo(r, g, b)) throw new Error(`off-palette colour ${grid[i]} at ${i % W},${Math.floor(i / W)}`);
    used.add(grid[i]);
  }
  writePng(out, png);

  // Preview at 3x with the game's logo, tagline, button and footer boxes outlined (not part of the art).
  const big = scaleNearest(png, 3);
  strokeRect(big, 93 * 3, 14 * 3, (228 - 93) * 3, 8 * 3, '#ebede9');
  strokeRect(big, 105 * 3, 25 * 3, (215 - 105) * 3, 5 * 3, '#a8b5b2');
  strokeRect(big, 117 * 3, 100 * 3, (211 - 117) * 3, 37 * 3, '#cf573c');
  strokeRect(big, 79 * 3, 169 * 3, (241 - 79) * 3, 10 * 3, '#cf573c');
  const preview = join(OUT_DIR, 'title', `${basename(out, '.png')}-3x.png`);
  writePng(preview, big);
  const from = mountainFrom ? `, mountain from ${mountainFrom}` : '';
  console.log(`title layout: ${rel(out)} (${W}x${H}, ${used.size} of ${APOLLO.length} Apollo colours${from}), preview ${rel(preview)}`);
  return 0;
}

process.exitCode = main();
