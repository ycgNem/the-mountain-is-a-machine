/**
 * title_finish: the free hand cleanup of the chosen title art (batch TA). Raw downloads in
 * art/raw/ta_title/ stay untouched; the result goes to art/edits/title_art.png for the recipe.
 *
 *   node scripts/art/title_finish.ts
 *
 * Base: seed 31106 (layout v2, init strength 350, medium detail), the cleanest of the six seeds.
 *   1. Logo band: stray specks and stars inside the logo and tagline boxes (x 88-236, y 0-25 and
 *      x 88-220, y 26-31, short of the mountain's ridge) become sky.
 *   2. Drill rig: seed 31106 turned the derrick into a grey block. The rig from row 31 down comes
 *      from seed 31105 instead (lattice derrick, company-yellow #de9e41 housing with a round bore,
 *      brass motors); its cyan lamp pixels become pale-gold work lamps, a lamp sits on the crown,
 *      and nothing rises above row 30, so the tagline (y 25-29) stays clear.
 *   3. L1: faint #ad7757 squiggles in the cave walls (what the model made of the minecart and ore
 *      pile) go back to the #7a4841 wall.
 *   4. L4: grey blobs the model drew above the magma become clusters of basalt columns (lit
 *      #819796 tops, #577277 / #394a50 / #151d28 sides), the layer's hexagonal pillars.
 * Then it checks every pixel is an opaque Apollo colour and writes a 3x preview and the title-screen
 * mock (scripts/art/title_mock.ts) for review.
 */
import { join } from 'node:path';
import { OUT_DIR, ROOT, clonePng, hexToRgb, isApollo, readPng, rel, rgbToHex, scaleNearest, writePng } from './lib.ts';
import type { PNG } from './lib.ts';
import { mulberry32 } from './scene.ts';

const RAW = join(ROOT, 'art', 'raw', 'ta_title');
const BASE = join(RAW, 'seed31106_v2_s350_md.png');
const DRILL = join(RAW, 'seed31105_v2_s300_md.png');
const OUT = join(ROOT, 'art', 'edits', 'title_art.png');

const img = readPng(BASE);
const drillSrc = readPng(DRILL);
const W = img.width;
const H = img.height;
if (W !== 320 || H !== 180) throw new Error(`base is ${W}x${H}, expected 320x180`);
const log: string[] = [];

function at(p: PNG, x: number, y: number): string {
  const i = (y * p.width + x) * 4;
  return rgbToHex(p.data[i], p.data[i + 1], p.data[i + 2]);
}
function put(x: number, y: number, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  const i = (y * W + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = 255;
}

// 1. Logo band: the sky there is navy / blue dither only.
{
  const sky = new Set(['#172038', '#253a5e', '#202e37', '#151d28', '#10141f', '#1e1d39']);
  let n = 0;
  for (let y = 0; y <= 31; y++) {
    // Rows 26-31 stop at x 220: the mountain's left ridge comes down to row 28 at x 236.
    for (let x = 88; x <= (y < 26 ? 236 : 220); x++) {
      if (x >= 100 && x <= 124 && y >= 26) continue; // the drill rig (step 2)
      const c = at(img, x, y);
      if (sky.has(c)) continue;
      put(x, y, y < 27 ? '#172038' : at(img, x - 2, y));
      n++;
    }
  }
  log.push(`logo band: ${n} stray pixels -> sky`);
}

// 2. Drill rig from seed 31105, rows 31-61; the sky above it from seed 31106's own clean columns.
{
  const before = clonePng(img);
  for (let y = 26; y <= 30; y++) {
    // Rows above the rig: copy this row's sky from 32 px to the left (same dither phase).
    for (let x = 100; x <= 124; x++) put(x, y, at(before, x - 32, y));
  }
  let n = 0;
  for (let y = 31; y <= 61; y++) {
    for (let x = 92; x <= 127; x++) {
      let c = at(drillSrc, x, y);
      if (c === '#73bed3') c = '#e8c170'; // cyan lamps -> pale-gold work lamps
      put(x, y, c);
      n++;
    }
  }
  // A work lamp on the crown (row 30 stays under the tagline's descenders at row 29).
  put(110, 30, '#e8c170');
  put(111, 30, '#de9e41');
  log.push(`drill: ${n} px from seed 31105 (x 92-127, y 31-61), sky above from x-32, crown lamp`);
}

// 3. L1 squiggles.
{
  let n = 0;
  for (const [x0, x1] of [[12, 107], [140, 196], [214, 235], [242, 304]] as const) {
    for (let y = 73; y <= 82; y++) {
      for (let x = x0; x <= x1; x++) {
        if (at(img, x, y) === '#ad7757') {
          put(x, y, '#7a4841');
          n++;
        }
      }
    }
  }
  log.push(`L1: ${n} squiggle pixels -> #7a4841`);
}

// 4. L4 blobs -> basalt column clusters.
{
  const blobColours = new Set(['#394a50', '#577277', '#819796', '#a8b5b2', '#19332d', '#172038', '#c7cfcc']);
  const seen = new Uint8Array(W * H);
  const blobs: { x0: number; x1: number; y0: number; y1: number; n: number }[] = [];
  const shaft = (x: number): boolean => (x >= 106 && x <= 115) || (x >= 234 && x <= 243);
  for (let y = 128; y <= 135; y++) {
    for (let x = 4; x <= 316; x++) {
      if (seen[y * W + x] || shaft(x) || !blobColours.has(at(img, x, y))) continue;
      const stack: [number, number][] = [[x, y]];
      seen[y * W + x] = 1;
      const b = { x0: x, x1: x, y0: y, y1: y, n: 0 };
      while (stack.length > 0) {
        const [cx, cy] = stack.pop() as [number, number];
        b.n++;
        b.x0 = Math.min(b.x0, cx);
        b.x1 = Math.max(b.x1, cx);
        b.y0 = Math.min(b.y0, cy);
        b.y1 = Math.max(b.y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 4 || nx > 316 || ny < 128 || ny > 135 || shaft(nx) || seen[ny * W + nx]) continue;
          if (!blobColours.has(at(img, nx, ny))) continue;
          seen[ny * W + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      if (b.n >= 8) blobs.push(b);
    }
  }
  const rng = mulberry32(0xba5a17);
  for (const b of blobs) {
    for (let y = 128; y <= 135; y++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) if (!shaft(x)) put(x, y, '#202e37');
    const count = Math.max(2, Math.round((b.x1 - b.x0 + 3) / 4));
    const left = Math.round((b.x0 + b.x1) / 2 - (count * 4) / 2);
    for (let k = 0; k < count; k++) {
      const h = 5 + Math.floor(rng() * 3); // 5-7 px above the magma surface, under the ceiling
      const cx = left + k * 4;
      const top = 136 - h;
      for (let y = top; y <= 135; y++) {
        put(cx, y, '#577277');
        put(cx + 1, y, '#394a50');
        put(cx + 2, y, '#394a50');
        put(cx + 3, y, '#151d28');
      }
      for (let x = cx; x <= cx + 3; x++) put(x, top, '#819796');
    }
  }
  log.push(`L4: ${blobs.length} blobs -> basalt column clusters (${blobs.map((b) => `${b.x0}-${b.x1}`).join(', ')})`);
}

// Check: opaque Apollo only.
for (let i = 0; i < W * H; i++) {
  const r = img.data[i * 4];
  const g = img.data[i * 4 + 1];
  const b = img.data[i * 4 + 2];
  if (img.data[i * 4 + 3] !== 255 || !isApollo(r, g, b)) {
    throw new Error(`pixel ${i % W},${Math.floor(i / W)} is not an opaque Apollo colour`);
  }
}
writePng(OUT, img);
const preview = join(OUT_DIR, 'title', 'title_art-3x.png');
writePng(preview, scaleNearest(img, 3));
for (const line of log) console.log(`  ${line}`);
console.log(`title_finish: ${rel(BASE)} -> ${rel(OUT)}, preview ${rel(preview)}`);
