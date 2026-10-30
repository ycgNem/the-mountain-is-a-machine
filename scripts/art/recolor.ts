/**
 * Free pixel fixes: apply guarded colour maps and pixel patches to raw art and write the result to a
 * separate file, so raw downloads stay byte-for-byte untouched and every fix is a reproducible
 * spec. No PixelLab calls.
 *
 *   node scripts/art/recolor.ts <edits.json> [--only <name,...>] [--dry]
 *
 * edits.json (paths relative to the project root):
 *   { "edits": [ { "name": "b_miner", "src": "art/raw/m1/b_miner.png", "out": "art/edit/m2/b_miner.png",
 *                  "ops": [ ... ], "note": "why" } ] }
 * Ops run in order, each on the result of the previous one. Coordinates are src pixels.
 *   { "map": { "#from": "#to", ... }, "region": [x, y, w, h], "except": [[x, y, w, h], ...] }
 *       every opaque pixel inside region (default: the whole image) and outside every except rect
 *       whose colour is a key becomes that key's value; a pixel changes at most once per op, so
 *       swaps and chains ({"#a": "#b", "#b": "#c"}) do what they say
 *   { "map": {...}, "flood": [x, y], "stop": ["#hex", ...] }   (inside a map op, with or without
 *       region) only the pixels connected (4-way) to x, y through opaque pixels of any colour but
 *       the stop colours: one shape inside its outline (a gem inside its #090a14 rim), however
 *       round. The start pixel must be opaque and not a stop colour
 *   { "pixels": [[x, y, "#expected", "#replacement"], ...] }
 *       guarded single pixels: the pixel must currently be #expected ("none" = transparent), else
 *       the edit fails; "none" as the replacement erases
 *   { "expect": n }  (inside a map op) fail unless exactly n pixels changed, to catch a spec that
 *       drifted from its art
 *   { "copy": [x, y, w, h], "to": [dx, dy], "flipX": true }
 *       copy a rect (as it is before this op, transparency included) to dx, dy, optionally mirrored
 *       left to right: to make a symmetric south face from its plain half, say; both rects must lie
 *       inside the image
 * Every colour must be Apollo. Prints the pixels changed per op. Exit code 1 on any problem, and
 * then nothing is written. --dry checks and reports without writing; --only limits it to names.
 */
import { readFileSync } from 'node:fs';
import { fromRoot, isApollo, readPng, rel, toRgba, writePng } from './lib.ts';
import type { PNG } from './lib.ts';

const USAGE = 'usage: node scripts/art/recolor.ts <edits.json> [--only <name,...>] [--dry]';

type Obj = Record<string, unknown>;
type Rect4 = [number, number, number, number];

interface MapOp {
  kind: 'map';
  map: Map<number, number>;
  region: Rect4 | null;
  except: Rect4[];
  expect: number | null;
  /** Only the 4-connected shape around this pixel, bounded by the stop colours and transparency. */
  flood: [number, number] | null;
  stop: Set<number>;
}
interface PixelsOp {
  kind: 'pixels';
  pixels: { x: number; y: number; expected: number | null; replacement: number | null }[];
}
interface CopyOp {
  kind: 'copy';
  from: Rect4;
  to: [number, number];
  flipX: boolean;
}
type Op = MapOp | PixelsOp | CopyOp;

interface Edit {
  name: string;
  src: string;
  out: string;
  ops: Op[];
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function rect4(v: unknown, what: string): Rect4 {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => Number.isInteger(n))) {
    throw new Error(`${what} must be [x, y, w, h] in whole pixels`);
  }
  const [x, y, w, h] = v as number[];
  if (w < 1 || h < 1) throw new Error(`${what} has an empty size`);
  return [x, y, w, h];
}

/** An Apollo colour as 0xRRGGBB, or null for "none" (transparent) when allowed. */
function colour(v: unknown, what: string, allowNone: boolean): number | null {
  if (allowNone && v === 'none') return null;
  if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${what} must be "#rrggbb"`);
  const [r, g, b] = toRgba(v);
  if (!isApollo(r, g, b)) throw new Error(`${what} ${v} is not an Apollo colour`);
  return (r << 16) | (g << 8) | b;
}

function parseOp(v: unknown, where: string): Op {
  if (!isObj(v)) throw new Error(`${where}: an op must be an object`);
  if (isObj(v.map)) {
    const map = new Map<number, number>();
    for (const [from, to] of Object.entries(v.map)) {
      const f = colour(from, `${where} map key`, false);
      const t = colour(to, `${where} map value`, false);
      if (f === null || t === null) throw new Error(`${where}: map colours can't be "none"`);
      map.set(f, t);
    }
    const except = v.except === undefined ? [] : v.except;
    if (!Array.isArray(except)) throw new Error(`${where}: except must be a list of rects`);
    const expect = v.expect === undefined ? null : v.expect;
    if (expect !== null && !Number.isInteger(expect)) throw new Error(`${where}: expect must be a whole number`);
    let flood: [number, number] | null = null;
    const stop = new Set<number>();
    if (v.flood !== undefined) {
      const f = v.flood;
      if (!Array.isArray(f) || f.length !== 2 || !f.every((n) => Number.isInteger(n))) throw new Error(`${where}: flood must be [x, y]`);
      if (!Array.isArray(v.stop) || v.stop.length === 0) throw new Error(`${where}: flood needs "stop": the colours that bound the shape`);
      flood = [f[0] as number, f[1] as number];
      v.stop.forEach((c, i) => stop.add(colour(c, `${where} stop[${i}]`, false) as number));
    } else if (v.stop !== undefined) {
      throw new Error(`${where}: stop only goes with flood`);
    }
    return {
      kind: 'map',
      map,
      region: v.region === undefined ? null : rect4(v.region, `${where} region`),
      except: except.map((r, i) => rect4(r, `${where} except[${i}]`)),
      expect: expect as number | null,
      flood,
      stop,
    };
  }
  if (Array.isArray(v.pixels)) {
    return {
      kind: 'pixels',
      pixels: v.pixels.map((p, i) => {
        const w = `${where} pixels[${i}]`;
        if (!Array.isArray(p) || p.length !== 4 || !Number.isInteger(p[0]) || !Number.isInteger(p[1])) {
          throw new Error(`${w} must be [x, y, "#expected", "#replacement"]`);
        }
        return {
          x: p[0] as number,
          y: p[1] as number,
          expected: colour(p[2], `${w} expected`, true),
          replacement: colour(p[3], `${w} replacement`, true),
        };
      }),
    };
  }
  if (v.copy !== undefined) {
    const to = v.to;
    if (!Array.isArray(to) || to.length !== 2 || !to.every((n) => Number.isInteger(n))) {
      throw new Error(`${where}: copy needs "to": [dx, dy]`);
    }
    if (v.flipX !== undefined && typeof v.flipX !== 'boolean') throw new Error(`${where}: flipX must be true or false`);
    return { kind: 'copy', from: rect4(v.copy, `${where} copy`), to: [to[0] as number, to[1] as number], flipX: v.flipX === true };
  }
  throw new Error(`${where}: an op needs "map", "pixels" or "copy"`);
}

function parseEdits(path: string): Edit[] {
  const json: unknown = JSON.parse(readFileSync(fromRoot(path), 'utf8'));
  if (!isObj(json) || !Array.isArray(json.edits)) throw new Error(`${path}: expected { "edits": [...] }`);
  return json.edits.map((e, i): Edit => {
    const where = `edits[${i}]`;
    if (!isObj(e) || typeof e.name !== 'string' || typeof e.src !== 'string' || typeof e.out !== 'string') {
      throw new Error(`${where} needs name, src and out`);
    }
    if (fromRoot(e.src) === fromRoot(e.out)) throw new Error(`${where} (${e.name}): out must not overwrite src`);
    if (!Array.isArray(e.ops) || e.ops.length === 0) throw new Error(`${where} (${e.name}) needs ops`);
    return { name: e.name, src: e.src, out: e.out, ops: e.ops.map((o, j) => parseOp(o, `${e.name} op ${j}`)) };
  });
}

const inside = (x: number, y: number, r: Rect4): boolean => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];

/** The 4-connected shape around (sx, sy): opaque pixels whose colour isn't a stop colour. */
function floodMask(png: PNG, sx: number, sy: number, stop: Set<number>, where: string): Uint8Array {
  const W = png.width;
  const d = png.data;
  const open = (x: number, y: number): boolean => {
    const i = (y * W + x) * 4;
    return d[i + 3] >= 128 && !stop.has((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  };
  if (sx < 0 || sy < 0 || sx >= W || sy >= png.height || !open(sx, sy)) {
    throw new Error(`${where}: flood start ${sx},${sy} must be an opaque pixel that isn't a stop colour`);
  }
  const mask = new Uint8Array(W * png.height);
  const queue = [sy * W + sx];
  mask[sy * W + sx] = 1;
  while (queue.length > 0) {
    const p = queue.pop() as number;
    const x = p % W;
    const y = (p - x) / W;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= png.height || mask[ny * W + nx] || !open(nx, ny)) continue;
      mask[ny * W + nx] = 1;
      queue.push(ny * W + nx);
    }
  }
  return mask;
}

/** Apply one op in place; returns the number of pixels changed. Throws on a failed guard. */
function apply(png: PNG, op: Op, where: string): number {
  const d = png.data;
  const W = png.width;
  if (op.kind === 'map') {
    let n = 0;
    const region = op.region ?? [0, 0, png.width, png.height];
    const mask = op.flood ? floodMask(png, op.flood[0], op.flood[1], op.stop, where) : null;
    for (let y = Math.max(0, region[1]); y < Math.min(png.height, region[1] + region[3]); y++) {
      for (let x = Math.max(0, region[0]); x < Math.min(W, region[0] + region[2]); x++) {
        if (op.except.some((r) => inside(x, y, r))) continue;
        if (mask && !mask[y * W + x]) continue;
        const i = (y * W + x) * 4;
        if (d[i + 3] < 128) continue;
        const to = op.map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        if (to === undefined) continue;
        d[i] = (to >> 16) & 255;
        d[i + 1] = (to >> 8) & 255;
        d[i + 2] = to & 255;
        d[i + 3] = 255;
        n++;
      }
    }
    if (op.expect !== null && n !== op.expect) throw new Error(`${where}: changed ${n} pixels, expected ${op.expect}`);
    return n;
  }
  if (op.kind === 'copy') {
    const [sx, sy, w, h] = op.from;
    const [dx, dy] = op.to;
    const fits = (x: number, y: number): boolean => x >= 0 && y >= 0 && x + w <= W && y + h <= png.height;
    if (!fits(sx, sy) || !fits(dx, dy)) throw new Error(`${where}: copy rects must lie inside the ${W}x${png.height} image`);
    const before = Buffer.from(d);
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((sy + y) * W + sx + (op.flipX ? w - 1 - x : x)) * 4;
        const t = ((dy + y) * W + dx + x) * 4;
        if (before.readUInt32BE(s) !== d.readUInt32BE(t)) n++;
        before.copy(d, t, s, s + 4);
      }
    }
    return n;
  }
  let n = 0;
  for (const p of op.pixels) {
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= png.height) throw new Error(`${where}: pixel ${p.x},${p.y} is outside the image`);
    const i = (p.y * W + p.x) * 4;
    const now = d[i + 3] < 128 ? null : (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    if (now !== p.expected) {
      const hex = (c: number | null): string => (c === null ? 'none' : '#' + c.toString(16).padStart(6, '0'));
      throw new Error(`${where}: pixel ${p.x},${p.y} is ${hex(now)}, expected ${hex(p.expected)}`);
    }
    if (p.replacement === null) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
    } else {
      d[i] = (p.replacement >> 16) & 255;
      d[i + 1] = (p.replacement >> 8) & 255;
      d[i + 2] = p.replacement & 255;
      d[i + 3] = 255;
    }
    n++;
  }
  return n;
}

function main(): number {
  const args = process.argv.slice(2);
  let file: string | null = null;
  let only: Set<string> | null = null;
  let dry = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry') dry = true;
    else if (a === '--only') only = new Set((args[++i] ?? '').split(',').filter(Boolean));
    else if (!a.startsWith('--') && file === null) file = a;
    else {
      console.error(`unknown argument ${a}\n${USAGE}`);
      return 1;
    }
  }
  if (file === null) {
    console.error(USAGE);
    return 1;
  }
  let edits: Edit[];
  try {
    edits = parseEdits(file);
  } catch (e) {
    console.error(`ERROR ${(e as Error).message}`);
    return 1;
  }
  const results: { edit: Edit; png: PNG; counts: number[] }[] = [];
  let failed = false;
  for (const edit of edits) {
    if (only && !only.has(edit.name)) continue;
    try {
      const png = readPng(fromRoot(edit.src));
      const counts = edit.ops.map((op, j) => apply(png, op, `${edit.name} op ${j}`));
      results.push({ edit, png, counts });
    } catch (e) {
      console.error(`ERROR ${(e as Error).message}`);
      failed = true;
    }
  }
  if (failed) {
    console.error('nothing written');
    return 1;
  }
  for (const { edit, png, counts } of results) {
    if (!dry) writePng(fromRoot(edit.out), png);
    console.log(`${dry ? 'would write' : 'wrote'} ${rel(fromRoot(edit.out))} from ${edit.src}: ${counts.map((c, j) => `op ${j} ${c} px`).join(', ')}`);
  }
  return 0;
}

process.exitCode = main();
