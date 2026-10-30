/**
 * Item icon check: measure 16 x 16 item candidates against STYLE.md "Items" and lay them out on the
 * conveyor they will ride, to pick candidates before select_object_frames (art plan batch I). Free
 * (no PixelLab calls).
 *
 *   node scripts/art/items.ts --in <dir> --out <prefix> [--slots <json>] [--only <i,j,...>]
 *                             [--scale <n>] [--cols <n>]
 *
 * --in     folder of PNG frames, read in natural filename order (frame_0, frame_1, ... frame_63)
 * --out    output prefix: writes <prefix>-<scale>x.png, <prefix>-belt.png and <prefix>.json
 * --slots  JSON file holding an array of item ids (no i_ prefix), one per frame, in frame order
 *          (the job's item_descriptions order); enables the long-item envelope and the ramp rules.
 *          Without it, a file named i_<id>.png counts as item <id>.
 * --only   comma-separated frame indices to include, in that order (default: all)
 * --scale  enlargement of the big sheet (default 4); --cols frames per row (default 8)
 *
 * Every frame is first snapped to Apollo exactly as art:build does (alpha < 128 transparent, the
 * rest the nearest Apollo colour), trimmed and centred on a 16 x 16 canvas, then measured:
 *   box    opaque bounding box; ENV fails above 12 x 12 (14 on one axis, 12 on the other, for
 *          steel_beam, drill_bit, cobalt_drill_head and copper_wire), which art:build rejects
 *   rim    edge pixels (opaque with a transparent 4-neighbour) that are #090a14; 100% = the closed
 *          1 px outline STYLE asks for. dark = edge pixels in #090a14 / #10141f / #151d28
 *   hi3    opaque pixels at 3:1 or more against the belt surface #394a50 (STYLE: a highlight at
 *          3:1, at least 3 px)
 *   light  mean luminance (x100) of the inner pixels in the upper-left half minus the lower-right
 *          half, split on the anti-diagonal through the box centre; > 0 = lit from the upper left
 *   ramp   per-item colour rules from STYLE "Material ramps" (art plan issue 6), as notes
 * Sheets: <prefix>-<scale>x.png shows each frame on a conveyor tile and on the darkness tint, with
 * its index, item and failed checks; <prefix>-belt.png shows every frame at game size (1x, then the
 * whole strip at 3x) on a conveyor and on a #151d28 UI panel.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  blit,
  contrastRatio,
  createPng,
  crop,
  drawText,
  fillRect,
  fromRoot,
  hexToRgb,
  naturalCompare,
  quantize,
  readPng,
  rel,
  rgbToHex,
  scaleNearest,
  trimAlpha,
  writePng,
} from './lib.ts';
import type { PNG, Rgb } from './lib.ts';

const USAGE =
  'usage: node scripts/art/items.ts --in <dir> --out <prefix> [--slots <json>] [--only <i,j,...>] [--scale <n>] [--cols <n>]';

const ITEM_BOX = 12;
const LONG_ITEM_BOX = 14;
const LONG_ITEMS = new Set(['steel_beam', 'drill_bit', 'cobalt_drill_head', 'copper_wire']);
const INK = '#090a14';
const DARK_RIM = new Set(['#090a14', '#10141f', '#151d28']);
const BELT = '#394a50';
const RUNG = '#577277';
const RAIL = '#151d28';
const PANEL = '#151d28';
const TINT = '#090a14';
/** 3:1, counted to two decimals as STYLE does (#819796 on #394a50 is 2.996, "3.00"). */
const HI_RATIO = 2.995;

/** Colour rules per item id: `forbid` colours must not appear, `want` should (STYLE ramps, issue 6). */
interface RampRule {
  forbid?: string[];
  want?: string[];
  /** The most common non-outline colour must be one of these. */
  body?: string[];
}
const COBALT_FORBID = ['#73bed3', '#a4dddb', '#ebede9'];
const CRYSTAL_FORBID = ['#172038', '#253a5e'];
const RULES: Record<string, RampRule> = {
  iron_ore: { want: ['#7a4841'], body: ['#394a50', '#577277', '#819796'] },
  iron_ingot: { forbid: ['#ebede9'], want: ['#7a4841'], body: ['#394a50', '#577277', '#819796'] },
  steel_ingot: { forbid: ['#394a50', '#202e37'], want: ['#4f8fba'], body: ['#819796', '#a8b5b2', '#c7cfcc', '#ebede9'] },
  steel_beam: { want: ['#4f8fba'], body: ['#819796', '#a8b5b2', '#c7cfcc', '#ebede9', '#577277'] },
  coal: { want: ['#819796'], body: ['#090a14', '#10141f', '#151d28', '#202e37', '#394a50'] },
  slag: { want: ['#752438'] },
  cold_ember_ingot: { want: ['#752438'], forbid: ['#e8c170', '#ebede9', '#da863e'] },
  cobalt_ore: { forbid: COBALT_FORBID, body: ['#172038', '#253a5e', '#3c5e8b'] },
  cobalt_ingot: { forbid: COBALT_FORBID, body: ['#172038', '#253a5e', '#3c5e8b'] },
  cobalt_drill_head: { forbid: ['#73bed3', '#a4dddb'] },
  sapstone: { forbid: ['#73bed3', '#a4dddb'] },
  cut_crystal: { forbid: CRYSTAL_FORBID, body: ['#4f8fba', '#73bed3', '#a4dddb', '#ebede9'] },
  charged_crystal: { forbid: CRYSTAL_FORBID, body: ['#4f8fba', '#73bed3', '#a4dddb', '#ebede9'] },
  overcharged_crystal: { forbid: CRYSTAL_FORBID },
  conductive_powder: { forbid: CRYSTAL_FORBID },
  chorus_crystal: { want: ['#73bed3'] },
};

interface Args {
  inDir: string;
  out: string;
  slots: string[];
  only: number[] | null;
  scale: number;
  cols: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { inDir: '', out: '', slots: [], only: null, scale: 4, cols: 8 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value\n${USAGE}`);
      return v;
    };
    if (flag === '--in') a.inDir = fromRoot(next());
    else if (flag === '--out') a.out = fromRoot(next());
    else if (flag === '--slots') {
      const v: unknown = JSON.parse(readFileSync(fromRoot(next()), 'utf8'));
      if (!Array.isArray(v) || !v.every((s) => typeof s === 'string')) throw new Error('--slots must hold a JSON array of strings');
      a.slots = v as string[];
    } else if (flag === '--only') a.only = next().split(',').map((s) => Number.parseInt(s, 10));
    else if (flag === '--scale') a.scale = Number.parseInt(next(), 10);
    else if (flag === '--cols') a.cols = Number.parseInt(next(), 10);
    else throw new Error(`unknown option ${flag}\n${USAGE}`);
  }
  if (!a.inDir || !a.out) throw new Error(USAGE);
  if (!(a.scale >= 1) || !(a.cols >= 1)) throw new Error(`--scale and --cols must be whole numbers >= 1\n${USAGE}`);
  if (a.only && a.only.some((n) => !Number.isInteger(n) || n < 0)) throw new Error('--only takes frame indices');
  return a;
}

const lum = ([r, g, b]: Rgb): number => {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

interface Result {
  index: number;
  file: string;
  item: string;
  box: [number, number, number, number] | null;
  envOk: boolean;
  edge: number;
  rimInk: number;
  rimDark: number;
  hi3: number;
  light: number;
  colors: [string, number][];
  ramp: string[];
  fails: string[];
}

/** The frame as art:build would place an item: snapped, trimmed, centred on 16 x 16. */
function place(raw: PNG): PNG | null {
  const snapped = quantize(crop(raw, 0, 0, raw.width, raw.height));
  const box = trimAlpha(snapped);
  if (!box) return null;
  const art = crop(snapped, box.x, box.y, box.w, box.h);
  const W = Math.max(16, art.width);
  const H = Math.max(16, art.height);
  const out = createPng(W, H);
  blit(out, art, Math.floor((W - art.width) / 2), Math.floor((H - art.height) / 2));
  return out;
}

function measure(index: number, file: string, item: string, raw: PNG): Result {
  const r: Result = {
    index, file, item, box: null, envOk: false, edge: 0, rimInk: 0, rimDark: 0, hi3: 0, light: 0, colors: [], ramp: [], fails: [],
  };
  const snapped = quantize(crop(raw, 0, 0, raw.width, raw.height));
  const box = trimAlpha(snapped);
  if (!box) {
    r.fails.push('EMPTY');
    return r;
  }
  r.box = [box.x, box.y, box.w, box.h];
  const lo = Math.min(box.w, box.h);
  const hi = Math.max(box.w, box.h);
  r.envOk = LONG_ITEMS.has(item) ? lo <= ITEM_BOX && hi <= LONG_ITEM_BOX : hi <= ITEM_BOX;
  const W = snapped.width;
  const H = snapped.height;
  const d = snapped.data;
  const opaque = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] === 255;
  const hexAt = (x: number, y: number): string => {
    const i = (y * W + x) * 4;
    return rgbToHex(d[i], d[i + 1], d[i + 2]);
  };
  const belt = hexToRgb(BELT);
  const counts = new Map<string, number>();
  const cx = box.x + (box.w - 1) / 2;
  const cy = box.y + (box.h - 1) / 2;
  let ulSum = 0;
  let ulN = 0;
  let lrSum = 0;
  let lrN = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!opaque(x, y)) continue;
      const hex = hexAt(x, y);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
      const rgb = hexToRgb(hex);
      if (contrastRatio(rgb, belt) >= HI_RATIO) r.hi3++;
      const isEdge = !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1);
      if (isEdge) {
        r.edge++;
        if (hex === INK) r.rimInk++;
        if (DARK_RIM.has(hex)) r.rimDark++;
        continue;
      }
      const side = x - cx + (y - cy);
      if (side < 0) {
        ulSum += lum(rgb);
        ulN++;
      } else if (side > 0) {
        lrSum += lum(rgb);
        lrN++;
      }
    }
  }
  r.light = ulN && lrN ? Math.round((ulSum / ulN - lrSum / lrN) * 1000) / 10 : 0;
  r.colors = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const rule = RULES[item];
  if (rule) {
    for (const f of rule.forbid ?? []) if (counts.has(f)) r.ramp.push(`has ${f}`);
    for (const w of rule.want ?? []) if (!counts.has(w)) r.ramp.push(`no ${w}`);
    if (rule.body) {
      const body = r.colors.find(([hex]) => hex !== INK);
      if (body && !rule.body.includes(body[0])) r.ramp.push(`body ${body[0]}`);
    }
  }
  if (!r.envOk) r.fails.push(`ENV ${box.w}x${box.h}`);
  if (r.rimInk < r.edge) r.fails.push(`RIM ${Math.round((100 * r.rimInk) / r.edge)}%`);
  if (r.hi3 < 3) r.fails.push(`HI ${r.hi3}`);
  if (r.light < 0) r.fails.push('LIGHT');
  if (r.ramp.length) r.fails.push('RAMP');
  return r;
}

/** A straight conveyor tile running east (src/render/belts.ts, frame 0). */
function beltTile(): PNG {
  const t = createPng(16, 16);
  for (let v = 0; v < 16; v++) {
    for (let u = 0; u < 16; u++) {
      const a = v + 0.5;
      let col = BELT;
      if (a < 1 || a >= 15) col = RAIL;
      else {
        const ph = (u + 0.5) % 8;
        const centre = Math.abs(a - 8) < 3 ? 1.5 : 0.5;
        const dd = Math.abs(ph - centre);
        if (Math.min(dd, 8 - dd) < 0.5) col = RUNG;
      }
      fillRect(t, u, v, 1, 1, col);
    }
  }
  return t;
}

function main(argv: string[]): void {
  const args = parseArgs(argv);
  const files = readdirSync(args.inDir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort(naturalCompare);
  if (files.length === 0) throw new Error(`no PNG files in ${rel(args.inDir)}`);
  const order = args.only ?? files.map((_, i) => i);
  for (const i of order) if (i >= files.length) throw new Error(`--only ${i}: there are only ${files.length} frames`);
  const results: Result[] = [];
  const placed: (PNG | null)[] = [];
  for (const i of order) {
    const raw = readPng(join(args.inDir, files[i]));
    const item = args.slots[i] ?? /^i_([a-z0-9_]+)\.png$/i.exec(files[i])?.[1] ?? '';
    results.push(measure(i, files[i], item, raw));
    placed.push(place(raw));
  }

  // Big sheet: per frame a conveyor tile and a darkness-tint tile, label underneath.
  const S = args.scale;
  const tile = 16 * S;
  const gap = 4;
  const cellW = tile * 2 + gap;
  const labelH = 2 * 6 * 2 + 4;
  const cellH = tile + labelH;
  const cols = Math.min(args.cols, results.length);
  const rows = Math.ceil(results.length / cols);
  const sheet = createPng(cols * (cellW + 12) + 12, rows * (cellH + 8) + 8, '#202e37');
  const belt = beltTile();
  results.forEach((r, k) => {
    const x0 = 12 + (k % cols) * (cellW + 12);
    const y0 = 8 + Math.floor(k / cols) * (cellH + 8);
    const art = placed[k];
    const a = createPng(16, 16);
    blit(a, belt, 0, 0);
    const b = createPng(16, 16, TINT);
    if (art) {
      const ox = Math.floor((16 - art.width) / 2);
      const oy = Math.floor((16 - art.height) / 2);
      blit(a, art, ox, oy);
      blit(b, art, ox, oy);
    }
    blit(sheet, scaleNearest(a, S), x0, y0);
    blit(sheet, scaleNearest(b, S), x0 + tile + gap, y0);
    const name = `${r.index} ${r.item}`.toUpperCase().slice(0, Math.floor(cellW / 8));
    drawText(sheet, name, x0, y0 + tile + 3, '#ebede9', 2);
    const flags = r.fails.length ? r.fails.join(' ') : 'OK';
    const fl = flags.replace(/[^A-Za-z0-9_ ]/g, '').toUpperCase();
    const fit = fl.slice(0, Math.max(1, Math.floor(cellW / 4)));
    drawText(sheet, fit, x0, y0 + tile + 3 + 13, r.fails.length ? '#de9e41' : '#a8ca58', 1);
  });
  const bigPath = `${args.out}-${S}x.png`;
  writePng(bigPath, sheet);

  // Game-size strip: every frame on a conveyor row and on a UI panel, 16 per row, shown at 3x.
  const per = 16;
  const strips = Math.ceil(results.length / per);
  const strip = createPng(per * 16 + 8, strips * (16 * 2 + 10) + 4, '#202e37');
  results.forEach((_, k) => {
    const x = 4 + (k % per) * 16;
    const y = 4 + Math.floor(k / per) * (16 * 2 + 10);
    blit(strip, belt, x, y);
    fillRect(strip, x, y + 18, 16, 16, PANEL);
    const art = placed[k];
    if (art) {
      const ox = Math.floor((16 - art.width) / 2);
      const oy = Math.floor((16 - art.height) / 2);
      blit(strip, art, x + ox, y + oy);
      blit(strip, art, x + ox, y + 18 + oy);
    }
  });
  const beltPath = `${args.out}-belt.png`;
  writePng(beltPath, scaleNearest(strip, 3));

  writeFileSync(`${args.out}.json`, JSON.stringify(results, null, 1));
  for (const r of results) {
    const box = r.box ? `${r.box[2]}x${r.box[3]}`.padEnd(5) : '-    ';
    const top = r.colors
      .slice(0, 4)
      .map(([h, n]) => `${h}:${n}`)
      .join(' ');
    console.log(
      `${String(r.index).padStart(2)} ${r.item.padEnd(20)} box ${box} rim ${r.rimInk}/${r.edge} dark ${r.rimDark} hi3 ${String(r.hi3).padStart(3)} light ${String(r.light).padStart(5)} ${r.fails.length ? r.fails.join(',') : 'OK'}${r.ramp.length ? ` [${r.ramp.join('; ')}]` : ''}  ${top}`,
    );
  }
  const pass = results.filter((r) => r.fails.length === 0).length;
  const env = results.filter((r) => r.envOk).length;
  console.log(`${results.length} frames: ${env} inside the envelope, ${pass} pass every check`);
  console.log(`wrote ${rel(bigPath)}, ${rel(beltPath)} and ${rel(args.out)}.json`);
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
