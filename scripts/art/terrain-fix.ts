/**
 * Free recolour fixes for a re-packed dual-grid terrain sheet (the 64 x 64 corner-index sheet that
 * scripts/art/tileset.ts writes). The raw sheet is never touched: the fix goes to a separate file
 * that a recipe can point at. Free: no PixelLab call.
 *
 *   node scripts/art/terrain-fix.ts <in.png> <out.png> [--barrier <hex,...>] [--rule <rule>]... [--report]
 *
 * The sheet is first snapped to Apollo exactly as art:build snaps it. Then every --rule is tried
 * on every pixel, in order; the first rule that matches recolours it:
 *
 *   [upper[+d]:|lower[+d]:]<from>[<c|>c]=<to>
 *     upper: / lower:   only pixels of that terrain (needs --barrier, see below)
 *     +d                only those at least d px (diagonals count as 1) from every pixel of their
 *                       tile outside that terrain: lower+3: leaves the floor's 2 px next to a lip
 *                       alone (its contact shadow) and recolours the joints further out
 *     <from>            the pixel's snapped Apollo colour, e.g. #577277, or * for any colour
 *     <c / >c           only if the RAW pixel's contrast against #090a14 is below / above c
 *                       (separates raw values that snapping merged into one Apollo colour)
 *     <to>              an Apollo colour
 *   e.g. --rule "upper:#577277=#394a50" --rule "#253a5e<1.5=#172038" --rule "lower+3:#394a50=#25562e"
 *
 * Terrain regions: in each tile, flood fill (4-connected) from the tile's corners and the edge
 * pixels near them, through every pixel whose snapped colour is NOT in --barrier (the boundary
 * line between the two terrains: a lip, an outline, a cliff face). A corner's pixels get that
 * corner's terrain (tile index bits, 1 = upper). Tiles 0 and 15 are one terrain throughout.
 * Pixels both fills reach mean the barrier has a gap there: that is an error (exit 1, nothing
 * written). Pockets no fill reaches take the terrain of the nearest filled pixel. Barrier pixels
 * keep their colour unless a rule without upper:/lower: matches them.
 *
 *   --pixel x,y,#expected,#replacement   after the rules, one guarded pixel (sheet coordinates): it
 *               must be #expected by then, or nothing is written (repeatable)
 *   --report    print, per terrain region, the snapped colours and their counts (to pick rules)
 *   --preview <png>  also write the fixed sheet at 6x next to the input snapped (to review)
 *
 * Recipe mode (re-runs the fixes a terrain recipe records):
 *
 *   node scripts/art/terrain-fix.ts --recipe art/recipes/terrain_<set>.json [--report]
 *
 * Every "terrain" entry with a "_fix" key ({"from": <raw sheet>, "barrier": [hex...], "rules":
 * [rule...], "pixels": [[x, y, "#expected", "#replacement"], ...]}; art:build ignores keys starting
 * with "_") is rebuilt from "from" into its "src".
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  APOLLO,
  blit,
  clonePng,
  contrastRatio,
  createPng,
  drawText,
  fromRoot,
  hexToRgb,
  quantize,
  readPng,
  rel,
  rgbToHex,
  scaleNearest,
  writePng,
} from './lib.ts';
import type { PNG } from './lib.ts';

const TILE = 16;
const SEED_REACH = 4;
const INK = hexToRgb('#090a14');
const USAGE =
  'usage: node scripts/art/terrain-fix.ts <in.png> <out.png> [--barrier <hex,...>] ' +
  '[--rule "[upper[+d]:|lower[+d]:]<from>[<c|>c]=<to>"]... [--report] [--preview <png>]\n' +
  '   or: node scripts/art/terrain-fix.ts --recipe art/recipes/terrain_<set>.json [--report]';

type Region = 'upper' | 'lower';

interface Rule {
  text: string;
  region: Region | null;
  /** With a region: only pixels at least this many px (Chebyshev) from the rest of their tile; 0 = all. */
  margin: number;
  from: string | null;
  below: number | null;
  above: number | null;
  to: string;
  hits: number;
}

/** A guarded single-pixel patch applied after the rules (sheet coordinates). */
interface PixelFix {
  x: number;
  y: number;
  expected: string;
  replacement: string;
}

interface Options {
  input: string;
  output: string;
  barrier: Set<string>;
  rules: Rule[];
  pixels: PixelFix[];
  report: boolean;
  preview: string | null;
}

function parsePixel(v: unknown, what: string): PixelFix {
  const parts = typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v.map(String) : null;
  if (!parts || parts.length !== 4 || !/^\d+$/.test(parts[0].trim()) || !/^\d+$/.test(parts[1].trim())) {
    throw new Error(`${what}: a pixel is [x, y, "#expected", "#replacement"] (on the command line x,y,#expected,#replacement)`);
  }
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (x >= TILE * 4 || y >= TILE * 4) throw new Error(`${what}: ${x},${y} is outside the 64 x 64 sheet`);
  return { x, y, expected: apolloHex(parts[2], what), replacement: apolloHex(parts[3], what) };
}

const HEX_RE = /^#[0-9a-f]{6}$/;
const APOLLO_SET = new Set(APOLLO);

function apolloHex(s: string, what: string): string {
  const h = s.trim().toLowerCase();
  if (!HEX_RE.test(h)) throw new Error(`${what}: "${s}" is not a #rrggbb colour`);
  if (!APOLLO_SET.has(h)) throw new Error(`${what}: ${h} is not an Apollo colour`);
  return h;
}

function parseRule(text: string): Rule {
  const m = /^(?:(upper|lower)(?:\+(\d+))?:)?(\*|#[0-9a-fA-F]{6})(?:([<>])(\d+(?:\.\d+)?))?=(#[0-9a-fA-F]{6})$/.exec(text.trim());
  if (!m) throw new Error(`--rule "${text}": write [upper[+d]:|lower[+d]:]<from>[<c|>c]=<to>, e.g. upper:#577277=#394a50`);
  const [, region, margin, from, cmp, num, to] = m;
  return {
    text,
    region: region === 'upper' || region === 'lower' ? region : null,
    margin: margin === undefined ? 0 : Number(margin),
    from: from === '*' ? null : apolloHex(from, `--rule "${text}"`),
    below: cmp === '<' ? Number(num) : null,
    above: cmp === '>' ? Number(num) : null,
    to: apolloHex(to, `--rule "${text}"`),
    hits: 0,
  };
}

function parseArgs(argv: string[]): Options[] {
  const o: Options = { input: '', output: '', barrier: new Set(), rules: [], pixels: [], report: false, preview: null };
  const positional: string[] = [];
  let recipe: string | null = null;
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    const value = (): string => {
      const v = argv[++k];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--barrier':
        for (const h of value().split(',')) if (h.trim()) o.barrier.add(apolloHex(h, '--barrier'));
        break;
      case '--rule':
        o.rules.push(parseRule(value()));
        break;
      case '--pixel':
        o.pixels.push(parsePixel(value(), '--pixel'));
        break;
      case '--report':
        o.report = true;
        break;
      case '--preview':
        o.preview = fromRoot(value());
        break;
      case '--recipe':
        recipe = fromRoot(value());
        break;
      default:
        if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
        positional.push(a);
    }
  }
  if (recipe !== null) {
    if (positional.length > 0 || o.rules.length > 0 || o.pixels.length > 0 || o.barrier.size > 0 || o.preview !== null) {
      throw new Error('--recipe takes the sheets, barrier and rules from the recipe: add nothing but --report');
    }
    return recipeJobs(recipe, o.report);
  }
  if (positional.length !== 2) throw new Error('give the input sheet and the output path');
  [o.input, o.output] = positional.map(fromRoot);
  checkRegions(o);
  return [o];
}

function checkRegions(o: Options): void {
  if (o.rules.some((r) => r.region !== null) && o.barrier.size === 0) {
    throw new Error('upper: and lower: rules need --barrier (the colours of the line between the terrains)');
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function strings(v: unknown, what: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`${what} must be a list of strings`);
  return v as string[];
}

/** One job per terrain entry of the recipe that carries a "_fix". */
function recipeJobs(path: string, report: boolean): Options[] {
  const j: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const terrain = isObj(j) ? j.terrain : undefined;
  if (!Array.isArray(terrain)) throw new Error(`${rel(path)} has no "terrain" list`);
  const jobs: Options[] = [];
  for (const t of terrain) {
    if (!isObj(t) || !isObj(t._fix)) continue;
    const f = t._fix;
    const what = `${rel(path)}: ${String(t.name)}._fix`;
    if (typeof f.from !== 'string' || typeof t.src !== 'string') throw new Error(`${what} needs "from", and the entry a "src"`);
    if (f.pixels !== undefined && !Array.isArray(f.pixels)) throw new Error(`${what}.pixels must be a list of [x, y, "#expected", "#replacement"]`);
    const o: Options = {
      input: fromRoot(f.from),
      output: fromRoot(t.src),
      barrier: new Set(strings(f.barrier, `${what}.barrier`).map((h) => apolloHex(h, `${what}.barrier`))),
      rules: strings(f.rules, `${what}.rules`).map(parseRule),
      pixels: ((f.pixels ?? []) as unknown[]).map((p, i) => parsePixel(p, `${what}.pixels[${i}]`)),
      report,
      preview: null,
    };
    if (o.input === o.output) throw new Error(`${what}: "from" and "src" are one file; the raw sheet must stay untouched`);
    checkRegions(o);
    jobs.push(o);
  }
  if (jobs.length === 0) throw new Error(`${rel(path)} has no terrain entry with a "_fix"`);
  return jobs;
}

/** Per pixel of the sheet: 1 = upper, 0 = lower, -1 = barrier or unlabelled. Throws on a leak. */
function labelRegions(q: PNG, barrier: Set<string>): Int8Array {
  const label = new Int8Array(q.width * q.height).fill(-1);
  const isBarrier = (x: number, y: number): boolean => {
    const i = (y * q.width + x) * 4;
    return barrier.has(rgbToHex(q.data[i], q.data[i + 1], q.data[i + 2]));
  };
  const leaks: string[] = [];
  for (let t = 0; t < 16; t++) {
    const ox = (t % 4) * TILE;
    const oy = Math.floor(t / 4) * TILE;
    const bitsOf = [(t >> 3) & 1, (t >> 2) & 1, (t >> 1) & 1, t & 1]; // nw ne sw se
    const reached = [new Uint8Array(TILE * TILE), new Uint8Array(TILE * TILE)]; // [lower, upper]
    if (t === 0 || t === 15) {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (!isBarrier(ox + x, oy + y)) reached[t === 15 ? 1 : 0][y * TILE + x] = 1;
    } else {
      const corners: [number, number, number][] = [
        [0, 0, bitsOf[0]],
        [TILE - 1, 0, bitsOf[1]],
        [0, TILE - 1, bitsOf[2]],
        [TILE - 1, TILE - 1, bitsOf[3]],
      ];
      for (const [cx, cy, up] of corners) {
        const seeds: [number, number][] = [];
        const dx = cx === 0 ? 1 : -1;
        const dy = cy === 0 ? 1 : -1;
        for (let d = 0; d <= SEED_REACH; d++) {
          seeds.push([cx + dx * d, cy], [cx, cy + dy * d]);
        }
        const seen = reached[up];
        const queue: number[] = [];
        for (const [sx, sy] of seeds) {
          if (isBarrier(ox + sx, oy + sy) || seen[sy * TILE + sx]) continue;
          seen[sy * TILE + sx] = 1;
          queue.push(sy * TILE + sx);
        }
        while (queue.length > 0) {
          const p = queue.pop() as number;
          const x = p % TILE;
          const y = Math.floor(p / TILE);
          for (const [nx, ny] of [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
          ]) {
            if (nx < 0 || ny < 0 || nx >= TILE || ny >= TILE) continue;
            const n = ny * TILE + nx;
            if (seen[n] || isBarrier(ox + nx, oy + ny)) continue;
            seen[n] = 1;
            queue.push(n);
          }
        }
      }
    }
    let both = 0;
    for (let p = 0; p < TILE * TILE; p++) {
      if (reached[0][p] && reached[1][p]) both++;
      else if (reached[1][p]) label[(oy + Math.floor(p / TILE)) * q.width + ox + (p % TILE)] = 1;
      else if (reached[0][p]) label[(oy + Math.floor(p / TILE)) * q.width + ox + (p % TILE)] = 0;
    }
    if (both > 0) leaks.push(`tile ${t}: ${both} px reached from both terrains (a gap in the barrier)`);
    // Pockets: non-barrier pixels neither fill reached take the nearest filled pixel's terrain.
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const gi = (oy + y) * q.width + ox + x;
        if (label[gi] !== -1 || isBarrier(ox + x, oy + y)) continue;
        let best = -1;
        let bestD = Infinity;
        for (let yy = 0; yy < TILE; yy++) {
          for (let xx = 0; xx < TILE; xx++) {
            const l = label[(oy + yy) * q.width + ox + xx];
            const d = Math.abs(xx - x) + Math.abs(yy - y);
            if (l !== -1 && (reached[0][yy * TILE + xx] || reached[1][yy * TILE + xx]) && d < bestD) {
              bestD = d;
              best = l;
            }
          }
        }
        if (best !== -1) label[gi] = best;
      }
    }
  }
  if (leaks.length > 0) throw new Error(`the barrier doesn't separate the terrains:\n  ${leaks.join('\n  ')}`);
  return label;
}

/**
 * Per labelled pixel: how far (Chebyshev, in px) the nearest pixel of its own tile with another label
 * (the other terrain, the barrier or an unlabelled pixel) is; Infinity when the whole tile is one
 * terrain. The tile's own edge doesn't count: the neighbouring tile in the map can be anything.
 */
function edgeDistance(label: Int8Array, width: number): Float64Array {
  const dist = new Float64Array(label.length).fill(Infinity);
  for (let t = 0; t < 16; t++) {
    const ox = (t % 4) * TILE;
    const oy = Math.floor(t / 4) * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const p = (oy + y) * width + ox + x;
        if (label[p] === -1) continue;
        let best = Infinity;
        for (let yy = 0; yy < TILE; yy++) {
          for (let xx = 0; xx < TILE; xx++) {
            if (label[(oy + yy) * width + ox + xx] === label[p]) continue;
            best = Math.min(best, Math.max(Math.abs(xx - x), Math.abs(yy - y)));
          }
        }
        dist[p] = best;
      }
    }
  }
  return dist;
}

function main(argv: string[]): number {
  let jobs: Options[];
  try {
    jobs = parseArgs(argv);
  } catch (e) {
    console.error(`terrain-fix: ${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  let code = 0;
  for (const o of jobs) code = Math.max(code, runFix(o));
  return code;
}

function runFix(o: Options): number {
  const raw = readPng(o.input);
  if (raw.width !== TILE * 4 || raw.height !== TILE * 4) {
    console.error(`terrain-fix: ${rel(o.input)} is ${raw.width}x${raw.height}; a terrain sheet is 64x64`);
    return 1;
  }
  const q = quantize(clonePng(raw));
  let label: Int8Array | null = null;
  if (o.barrier.size > 0) {
    try {
      label = labelRegions(q, o.barrier);
    } catch (e) {
      console.error(`terrain-fix: ${rel(o.input)}: ${(e as Error).message}`);
      return 1;
    }
  }

  if (o.report) {
    const groups = new Map<string, Map<string, number>>();
    for (let p = 0; p < q.width * q.height; p++) {
      const i = p * 4;
      if (q.data[i + 3] === 0) continue;
      const hex = rgbToHex(q.data[i], q.data[i + 1], q.data[i + 2]);
      const g = label === null ? 'all' : label[p] === 1 ? 'upper' : label[p] === 0 ? 'lower' : 'barrier/unlabelled';
      const m = groups.get(g) ?? new Map<string, number>();
      m.set(hex, (m.get(hex) ?? 0) + 1);
      groups.set(g, m);
    }
    for (const [g, m] of groups) {
      const list = [...m.entries()].sort((a, b) => b[1] - a[1]);
      console.log(`  ${g}: ${list.map(([h, c]) => `${h} ${c} (${contrastRatio(hexToRgb(h), INK).toFixed(2)})`).join(', ')}`);
    }
  }

  const out = clonePng(q);
  const dist = label !== null && o.rules.some((r) => r.margin > 0) ? edgeDistance(label, q.width) : null;
  let changed = 0;
  for (let p = 0; p < q.width * q.height; p++) {
    const i = p * 4;
    if (q.data[i + 3] === 0) continue;
    const hex = rgbToHex(q.data[i], q.data[i + 1], q.data[i + 2]);
    const region: Region | null = label === null ? null : label[p] === 1 ? 'upper' : label[p] === 0 ? 'lower' : null;
    const c = contrastRatio([raw.data[i], raw.data[i + 1], raw.data[i + 2]], INK);
    for (const r of o.rules) {
      if (r.region !== null && r.region !== region) continue;
      if (r.margin > 0 && (dist === null || dist[p] < r.margin)) continue;
      if (r.from !== null && r.from !== hex) continue;
      if (r.below !== null && !(c < r.below)) continue;
      if (r.above !== null && !(c > r.above)) continue;
      const [nr, ng, nb] = hexToRgb(r.to);
      out.data[i] = nr;
      out.data[i + 1] = ng;
      out.data[i + 2] = nb;
      r.hits++;
      if (r.to !== hex) changed++;
      break;
    }
  }

  for (const px of o.pixels) {
    const i = (px.y * out.width + px.x) * 4;
    const now = rgbToHex(out.data[i], out.data[i + 1], out.data[i + 2]);
    if (now !== px.expected) {
      console.error(`terrain-fix: ${rel(o.input)}: pixel ${px.x},${px.y} is ${now} after the rules, expected ${px.expected}; nothing written`);
      return 1;
    }
    const [nr, ng, nb] = hexToRgb(px.replacement);
    out.data[i] = nr;
    out.data[i + 1] = ng;
    out.data[i + 2] = nb;
    if (px.replacement !== now) changed++;
  }

  mkdirSync(dirname(o.output), { recursive: true });
  writePng(o.output, out);
  if (o.preview) {
    const S = 6;
    const GAP = 8;
    const prev = createPng(GAP * 3 + 64 * S * 2, GAP * 2 + 12 + 64 * S, '#151d28');
    drawText(prev, 'snapped | fixed', GAP, 4, '#ebede9', 1);
    blit(prev, scaleNearest(q, S), GAP, GAP + 12);
    blit(prev, scaleNearest(out, S), GAP * 2 + 64 * S, GAP + 12);
    mkdirSync(dirname(o.preview), { recursive: true });
    writePng(o.preview, prev);
  }
  console.log(`terrain-fix: ${rel(o.input)} -> ${rel(o.output)}: ${changed} px recoloured`);
  for (const r of o.rules) console.log(`  ${r.text}: ${r.hits} px`);
  for (const px of o.pixels) console.log(`  pixel ${px.x},${px.y}: ${px.expected} -> ${px.replacement}`);
  if (label !== null) {
    let up = 0;
    let lo = 0;
    let none = 0;
    for (const l of label) {
      if (l === 1) up++;
      else if (l === 0) lo++;
      else none++;
    }
    console.log(`  regions: upper ${up} px, lower ${lo} px, barrier/unlabelled ${none} px`);
  }
  if (o.preview) console.log(`  preview ${rel(o.preview)}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
