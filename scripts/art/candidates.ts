/**
 * Candidate review: measure a folder of PixelLab candidate frames and lay them out on labelled
 * contact sheets, to pick candidates before select_object_frames. Free (no PixelLab calls).
 *
 *   node scripts/art/candidates.ts --in <dir> --out <prefix> [--labels <json>] [--scale <n>]
 *                                  [--cols <n>] [--only <i,j,...>] [--bgs <#rrggbb,...>]
 *
 * --in      folder of PNG frames, read in natural filename order (frame_0, frame_1, ... frame_10);
 *           frame i is the i-th file
 * --out     output prefix; writes <prefix>-<scale>x.png (each frame scaled up once per background,
 *           side by side, with index and label), <prefix>-1x.png (the same at 1x, to judge game
 *           size) and <prefix>.json (the numbers)
 * --labels  JSON array of strings, one label per frame (short sprite names); default: none
 * --scale   enlargement of the big sheet (default 4)
 * --cols    frames per row (default 8)
 * --only    comma-separated frame indices to include, in that order (default: all)
 * --bgs     backgrounds behind each frame (default #577277,#10141f,#c09473: mid grey, the dark
 *           tint, light ochre)
 *
 * Numbers per frame (alpha >= 128 counts as opaque, like art:build):
 *   bbox      opaque bounding box [x, y, w, h] in the frame
 *   opaque    opaque pixel count; fill = opaque / (bbox area)
 *   colors    distinct opaque colours; offApollo = share of opaque pixels not exactly Apollo
 *   far       share of opaque pixels that move more than FAR_DELTA when snapped to Apollo
 *   partial   pixels with 0 < alpha < 255 (soft edges)
 *   darkBelow opaque rows under the body that are mostly #090a14..#202e37 (a baked shadow hint)
 * Frames are drawn as-is (not snapped), so palette problems stay visible.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APOLLO_RGB,
  ALPHA_CUTOFF,
  blit,
  clonePng,
  createPng,
  drawText,
  fromRoot,
  isApollo,
  naturalCompare,
  newQuantizeStats,
  quantize,
  readPng,
  rel,
  scaleNearest,
  textWidth,
  trimAlpha,
  writePng,
} from './lib.ts';
import type { PNG, Rect } from './lib.ts';

const readFileSyncText = (path: string): string => readFileSync(path, 'utf8');

const USAGE =
  'usage: node scripts/art/candidates.ts --in <dir> --out <prefix> [--labels <json>] [--scale <n>] [--cols <n>] [--only <i,j,...>] [--bgs <#rrggbb,...>]';

interface Args {
  inDir: string;
  out: string;
  labels: string[];
  scale: number;
  cols: number;
  only: number[] | null;
  bgs: readonly string[];
}

function parseArgs(argv: string[]): Args {
  let inDir = '';
  let out = '';
  let labels: string[] = [];
  let scale = 4;
  let cols = 8;
  let only: number[] | null = null;
  let bgs: readonly string[] = BACKGROUNDS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value\n${USAGE}`);
      return v;
    };
    if (a === '--in') inDir = fromRoot(next());
    else if (a === '--out') out = fromRoot(next());
    else if (a === '--labels') {
      const parsed: unknown = JSON.parse(readFileSyncText(fromRoot(next())));
      if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === 'string')) {
        throw new Error('--labels must be a JSON array of strings');
      }
      labels = parsed;
    } else if (a === '--scale') scale = Number(next());
    else if (a === '--cols') cols = Number(next());
    else if (a === '--only') only = next().split(',').map((s) => Number(s.trim()));
    else if (a === '--bgs') bgs = next().split(',').map((s) => s.trim());
    else throw new Error(`unknown option ${a}\n${USAGE}`);
  }
  if (!inDir || !out) throw new Error(USAGE);
  if (!Number.isInteger(scale) || scale < 1) throw new Error('--scale must be a whole number >= 1');
  if (!Number.isInteger(cols) || cols < 1) throw new Error('--cols must be a whole number >= 1');
  if (only && !only.every((n) => Number.isInteger(n) && n >= 0)) throw new Error('--only takes whole indices');
  if (bgs.length === 0 || !bgs.every((c) => /^#[0-9a-fA-F]{6}$/.test(c))) throw new Error('--bgs takes #rrggbb colours, comma-separated');
  return { inDir, out, labels, scale, cols, only, bgs };
}

interface FrameStats {
  index: number;
  file: string;
  label: string;
  size: [number, number];
  bbox: [number, number, number, number] | null;
  opaque: number;
  fill: number;
  colors: number;
  offApollo: number;
  far: number;
  partial: number;
  darkBelow: number;
}

const DARK_SET = new Set(['#090a14', '#10141f', '#151d28', '#202e37']);

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Rows at the bottom of the bbox whose opaque pixels are at least 80% near-black (shadow hint). */
function darkRowsBelow(png: PNG, box: Rect): number {
  let rows = 0;
  for (let y = box.y + box.h - 1; y >= box.y; y--) {
    let opaque = 0;
    let dark = 0;
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] < ALPHA_CUTOFF) continue;
      opaque++;
      const k = APOLLO_RGB.findIndex(([r, g, b]) => r === png.data[i] && g === png.data[i + 1] && b === png.data[i + 2]);
      const h = k >= 0 ? hex(...APOLLO_RGB[k]) : hex(png.data[i], png.data[i + 1], png.data[i + 2]);
      if (DARK_SET.has(h)) dark++;
    }
    if (opaque === 0 || dark / opaque < 0.8) break;
    rows++;
  }
  return rows;
}

function measure(png: PNG, index: number, file: string, label: string): FrameStats {
  const box = trimAlpha(png);
  const colors = new Set<number>();
  let opaque = 0;
  let off = 0;
  let partial = 0;
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a !== 0 && a !== 255) partial++;
    if (a < ALPHA_CUTOFF) continue;
    opaque++;
    colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (!isApollo(d[i], d[i + 1], d[i + 2])) off++;
  }
  const stats = newQuantizeStats();
  quantize(clonePng(png), stats);
  return {
    index,
    file,
    label,
    size: [png.width, png.height],
    bbox: box ? [box.x, box.y, box.w, box.h] : null,
    opaque,
    fill: box ? opaque / (box.w * box.h) : 0,
    colors: colors.size,
    offApollo: opaque ? off / opaque : 0,
    far: stats.opaque ? stats.far / stats.opaque : 0,
    partial,
    darkBelow: box ? darkRowsBelow(png, box) : 0,
  };
}

/** Default backgrounds behind each frame: mid grey, the dark tint, light ochre. */
const BACKGROUNDS: readonly string[] = ['#577277', '#10141f', '#c09473'];

/** One sheet: per frame one swatch per background side by side, scaled, with a caption. */
function sheet(frames: { png: PNG; stats: FrameStats }[], scale: number, cols: number, backgrounds: readonly string[]): PNG {
  const fw = Math.max(...frames.map((f) => f.png.width));
  const fh = Math.max(...frames.map((f) => f.png.height));
  const gap = scale >= 2 ? 2 * scale : 2;
  const caption = scale >= 2 ? 7 * Math.min(scale, 2) : 7;
  const textScale = scale >= 2 ? Math.min(scale, 2) : 1;
  const cellW = backgrounds.length * fw * scale + gap;
  const cellH = fh * scale + caption + gap;
  const rows = Math.ceil(frames.length / cols);
  const out = createPng(cols * cellW + gap, rows * cellH + gap, '#202e37');
  frames.forEach((f, n) => {
    const cx = gap + (n % cols) * cellW;
    const cy = gap + Math.floor(n / cols) * cellH;
    const big = scaleNearest(f.png, scale);
    backgrounds.forEach((bg, k) => {
      const tile = createPng(fw * scale, fh * scale, bg);
      blit(tile, big, 0, 0);
      blit(out, tile, cx + k * fw * scale, cy);
    });
    const text = `${f.stats.index} ${f.stats.label}`.toUpperCase();
    let t = text;
    const maxW = cellW - gap;
    while (t.length > 1 && textWidth(t, textScale) > maxW) t = t.slice(0, -1);
    drawText(out, t, cx, cy + fh * scale + 1, '#ebede9', textScale);
  });
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const files = readdirSync(args.inDir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort(naturalCompare);
  if (files.length === 0) throw new Error(`no PNG files in ${rel(args.inDir)}`);
  const wanted = args.only ?? files.map((_, i) => i);
  const frames: { png: PNG; stats: FrameStats }[] = [];
  for (const i of wanted) {
    const file = files[i];
    if (file === undefined) throw new Error(`frame ${i}: only ${files.length} files in ${rel(args.inDir)}`);
    const png = readPng(join(args.inDir, file));
    frames.push({ png, stats: measure(png, i, file, args.labels[i] ?? '') });
  }
  writePng(`${args.out}-${args.scale}x.png`, sheet(frames, args.scale, args.cols, args.bgs));
  writePng(`${args.out}-1x.png`, sheet(frames, 1, args.cols, args.bgs));
  writeFileSync(`${args.out}.json`, JSON.stringify(frames.map((f) => f.stats), null, 1));
  const pct = (v: number): string => `${(v * 100).toFixed(0)}%`.padStart(4);
  for (const { stats: s } of frames) {
    const box = s.bbox ? `${s.bbox[0]},${s.bbox[1]} ${s.bbox[2]}x${s.bbox[3]}` : 'empty';
    console.log(
      `${String(s.index).padStart(2)} ${s.label.padEnd(24)} bbox ${box.padEnd(13)} fill ${pct(s.fill)} ` +
        `colors ${String(s.colors).padStart(2)} off ${pct(s.offApollo)} far ${pct(s.far)} ` +
        `partial ${String(s.partial).padStart(3)} darkBelow ${s.darkBelow}`,
    );
  }
  console.log(`wrote ${rel(args.out)}-${args.scale}x.png, -1x.png and .json (${frames.length} frames)`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
