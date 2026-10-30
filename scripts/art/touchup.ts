/**
 * touchup: free, reproducible hand edits of a raw PixelLab image, written to a separate file so the
 * raw download stays untouched (STYLE.md "Pipeline"). The recipe then points at the edited file.
 *
 *   node scripts/art/touchup.ts <edits.json> [--preview <scale>]
 *
 * edits.json:
 *   {
 *     "src": "art/raw/p_portrait/mags_03.png",      raw image (project-relative)
 *     "out": "art/edits/p_mags.png",                edited copy
 *     "note": "anything (ignored)",
 *     "ops": [
 *       { "op": "map",  "region": [x0, y0, x1, y1], "colors": { "#from": "#to" }, "reason": "..." },
 *       { "op": "set",  "pixels": [[x, y, "#expected", "#new"], ...], "reason": "..." },
 *       { "op": "fill", "region": [x0, y0, x1, y1], "color": "#rrggbb" | "transparent", "reason": "..." },
 *       { "op": "copy", "region": [x0, y0, x1, y1], "to": [x, y], "reason": "..." }
 *     ]
 *   }
 * Regions are inclusive pixel rectangles. "set" checks each pixel's current colour ("#expected", or
 * "transparent") before replacing it and fails on a mismatch, so an edit never lands on the wrong
 * pixel. "copy" reads from the image as it was before that op. Every op needs a "reason". The result
 * must be Apollo colours at alpha 255 or fully transparent, or nothing is written. --preview n also
 * writes <out>-<n>x.png (on #10141f where transparent) next to art/out/edits/ for review.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { OUT_DIR, blit, clonePng, createPng, fromRoot, hexToRgb, isApollo, readPng, rel, rgbToHex, scaleNearest, writePng } from './lib.ts';
import type { PNG } from './lib.ts';

type Region = [number, number, number, number];
interface MapOp {
  op: 'map';
  region: Region;
  colors: Record<string, string>;
  reason: string;
}
interface SetOp {
  op: 'set';
  pixels: [number, number, string, string][];
  reason: string;
}
interface FillOp {
  op: 'fill';
  region: Region;
  color: string;
  reason: string;
}
interface CopyOp {
  op: 'copy';
  region: Region;
  to: [number, number];
  reason: string;
}
type Op = MapOp | SetOp | FillOp | CopyOp;
interface Edits {
  src: string;
  out: string;
  ops: Op[];
}

const TRANSPARENT = 'transparent';

function colorAt(png: PNG, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) throw new Error(`pixel ${x},${y} is outside the ${png.width}x${png.height} image`);
  const i = (y * png.width + x) * 4;
  if (png.data[i + 3] === 0) return TRANSPARENT;
  return rgbToHex(png.data[i], png.data[i + 1], png.data[i + 2]) + (png.data[i + 3] === 255 ? '' : png.data[i + 3].toString(16).padStart(2, '0'));
}

function paint(png: PNG, x: number, y: number, color: string): void {
  const i = (y * png.width + x) * 4;
  if (color === TRANSPARENT) {
    png.data.fill(0, i, i + 4);
    return;
  }
  const [r, g, b] = hexToRgb(color);
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = 255;
}

function checkColor(c: string, where: string): string {
  const v = c.toLowerCase();
  if (v === TRANSPARENT) return v;
  const [r, g, b] = hexToRgb(v);
  if (!isApollo(r, g, b)) throw new Error(`${where}: ${c} is not an Apollo colour`);
  return v;
}

function checkRegion(png: PNG, r: Region, where: string): void {
  const [x0, y0, x1, y1] = r;
  if (![x0, y0, x1, y1].every(Number.isInteger) || x0 > x1 || y0 > y1 || x0 < 0 || y0 < 0 || x1 >= png.width || y1 >= png.height) {
    throw new Error(`${where}: region [${r.join(', ')}] is not inside the ${png.width}x${png.height} image`);
  }
}

function apply(png: PNG, op: Op, k: number): number {
  const where = `op ${k + 1} (${op.op})`;
  if (typeof op.reason !== 'string' || op.reason.trim() === '') throw new Error(`${where}: every op needs a "reason"`);
  let changed = 0;
  switch (op.op) {
    case 'map': {
      checkRegion(png, op.region, where);
      const map = new Map<string, string>();
      for (const [from, to] of Object.entries(op.colors)) map.set(checkColor(from, where), checkColor(to, where));
      const [x0, y0, x1, y1] = op.region;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const to = map.get(colorAt(png, x, y));
          if (to !== undefined) {
            paint(png, x, y, to);
            changed++;
          }
        }
      }
      return changed;
    }
    case 'set': {
      for (const [x, y, expected, next] of op.pixels) {
        const now = colorAt(png, x, y);
        if (now !== expected.toLowerCase()) throw new Error(`${where}: pixel ${x},${y} is ${now}, expected ${expected}`);
        paint(png, x, y, checkColor(next, where));
        changed++;
      }
      return changed;
    }
    case 'fill': {
      checkRegion(png, op.region, where);
      const c = checkColor(op.color, where);
      const [x0, y0, x1, y1] = op.region;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paint(png, x, y, c);
      return (x1 - x0 + 1) * (y1 - y0 + 1);
    }
    case 'copy': {
      checkRegion(png, op.region, where);
      const [x0, y0, x1, y1] = op.region;
      const [tx, ty] = op.to;
      checkRegion(png, [tx, ty, tx + x1 - x0, ty + y1 - y0], `${where} target`);
      const before = clonePng(png);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const s = (y * png.width + x) * 4;
          const d = ((ty + y - y0) * png.width + (tx + x - x0)) * 4;
          before.data.copy(png.data, d, s, s + 4);
          changed++;
        }
      }
      return changed;
    }
    default:
      throw new Error(`${where}: unknown op`);
  }
}

function main(): number {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const pIdx = args.indexOf('--preview');
  const previewScale = pIdx >= 0 ? Number(args[pIdx + 1]) : 0;
  if (!file) {
    console.error('usage: node scripts/art/touchup.ts <edits.json> [--preview <scale>]');
    return 2;
  }
  const edits = JSON.parse(readFileSync(fromRoot(file), 'utf8')) as Edits;
  const png = readPng(fromRoot(edits.src));
  let total = 0;
  edits.ops.forEach((op, k) => {
    const n = apply(png, op, k);
    total += n;
    console.log(`  ${String(k + 1).padStart(2)} ${op.op.padEnd(4)} ${String(n).padStart(5)} px  ${op.reason}`);
  });
  // The result must already be game-ready: Apollo at alpha 255, or fully transparent.
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const a = png.data[i + 3];
      if (a === 0) continue;
      if (a !== 255 || !isApollo(png.data[i], png.data[i + 1], png.data[i + 2])) {
        throw new Error(`pixel ${x},${y} is ${colorAt(png, x, y)}: not Apollo at alpha 255 (nothing written)`);
      }
    }
  }
  const out = fromRoot(edits.out);
  writePng(out, png);
  console.log(`touchup: ${rel(fromRoot(edits.src))} -> ${rel(out)}, ${edits.ops.length} ops, ${total} px changed`);
  if (previewScale > 0) {
    const bg = createPng(png.width, png.height, '#10141f');
    blit(bg, png, 0, 0);
    const preview = join(OUT_DIR, 'edits', `${basename(out, '.png')}-${previewScale}x.png`);
    writePng(preview, scaleNearest(bg, previewScale));
    console.log(`preview: ${rel(preview)}`);
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`touchup: ${(e as Error).message}`);
  process.exitCode = 1;
}
