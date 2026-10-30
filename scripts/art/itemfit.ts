/**
 * Item fit: a recorded, free hand-edit that brings a PixelLab item candidate inside the STYLE.md item
 * envelope and closes its outline, written to a separate file (the raw download stays untouched).
 * Art plan batch I: PixelLab draws 16 px objects about 14 x 14, art:build rejects items over 12 x 12.
 *
 *   node scripts/art/itemfit.ts <src.png> <item id> <out.png> [--cols <i,j>] [--rows <i,j>]
 *                               [--map <#from=#to,...>] [--specks <n>] [--px <x,y,#hex;...>]
 *                               [--keep-rim] [--compare <out.png>] [--quiet]
 *
 * Steps, in order (--cols / --rows count in the trimmed art after steps 1-2):
 *   1. snap to Apollo exactly as art:build does, trim transparent margins
 *   2. --map: recolour whole colours (ramp fixes, e.g. a cyan glint on iron); --specks n: delete
 *      detached groups under n pixels (sparkles are a code effect, and a closed rim would turn them
 *      into black dots), then trim again
 *   3. remove whole columns and rows until the art fits 12 x 12 (14 on its long axis, 12 on the
 *      other, for steel_beam, drill_bit, cobalt_drill_head and copper_wire). --cols / --rows name
 *      them; otherwise the most redundant line goes first: the interior line (never the first or
 *      last) that differs least from a neighbour, so repeated rows of a bar or plate go and the
 *      silhouette, highlights and details stay. Nothing is resampled
 *   4. close the outline: every edge pixel (opaque, with a transparent 4-neighbour) becomes
 *      #090a14 (STYLE "Items": a closed 1 px outline). --keep-rim skips this
 *   5. --px: set single pixels of the result by hand (x, y in the final art)
 * Prints the chosen lines and the before/after pixel maps; --compare writes before | after on a
 * conveyor tile at 8x. Exit 1 if the result still breaks the envelope.
 */
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  blit,
  createPng,
  crop,
  fillRect,
  fromRoot,
  quantize,
  readPng,
  rel,
  rgbToHex,
  scaleNearest,
  toRgba,
  trimAlpha,
  writePng,
} from './lib.ts';
import type { PNG } from './lib.ts';

const USAGE =
  'usage: node scripts/art/itemfit.ts <src.png> <item id> <out.png> [--cols <i,j>] [--rows <i,j>] [--map <#from=#to,...>] [--specks <n>] [--px <x,y,#hex;...>] [--keep-rim] [--compare <out.png>] [--quiet]';
const ITEM_BOX = 12;
const LONG_ITEM_BOX = 14;
const LONG_ITEMS = new Set(['steel_beam', 'drill_bit', 'cobalt_drill_head', 'copper_wire']);
const INK = '#090a14';

/** Pixel grid of hex colours ('' = transparent). */
type Grid = string[][];

function toGrid(png: PNG): Grid {
  const g: Grid = [];
  for (let y = 0; y < png.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      row.push(png.data[i + 3] === 255 ? rgbToHex(png.data[i], png.data[i + 1], png.data[i + 2]) : '');
    }
    g.push(row);
  }
  return g;
}

function toPng(g: Grid): PNG {
  const h = g.length;
  const w = h ? g[0].length : 0;
  const png = createPng(Math.max(1, w), Math.max(1, h));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x]) fillRect(png, x, y, 1, 1, g[y][x]);
  return png;
}

const transpose = (g: Grid): Grid => (g.length ? g[0].map((_, x) => g.map((row) => row[x])) : []);

/** Pixels that differ between two columns of the grid. */
function colDiff(g: Grid, a: number, b: number): number {
  let n = 0;
  for (const row of g) if (row[a] !== row[b]) n++;
  return n;
}

/**
 * Remove `count` columns: the given ones (indices into the current grid, highest first) or the most
 * redundant interior ones. Returns the removed indices in the coordinates of the grid passed in.
 */
function removeCols(g: Grid, count: number, given: number[] | null): { grid: Grid; removed: number[] } {
  let grid = g.map((row) => [...row]);
  // Track original indices so we can report them.
  let index = grid.length ? grid[0].map((_, i) => i) : [];
  const removed: number[] = [];
  if (given) {
    for (const c of [...given].sort((a, b) => b - a)) {
      if (c < 0 || c >= index.length) throw new Error(`line ${c} is outside the ${index.length}-wide art`);
      grid = grid.map((row) => row.filter((_, x) => x !== c));
      removed.push(index[c]);
      index = index.filter((_, x) => x !== c);
    }
    return { grid, removed: removed.sort((a, b) => a - b) };
  }
  for (let k = 0; k < count; k++) {
    const w = index.length;
    let best = -1;
    let bestCost = Infinity;
    for (let c = 1; c < w - 1; c++) {
      const cost = Math.min(colDiff(grid, c, c - 1), colDiff(grid, c, c + 1));
      // Prefer lines near the middle on ties (the ends carry the silhouette's corners).
      const tie = Math.abs(c - (w - 1) / 2) / w;
      if (cost + tie < bestCost) {
        bestCost = cost + tie;
        best = c;
      }
    }
    if (best < 0) throw new Error('art too narrow to remove a line');
    grid = grid.map((row) => row.filter((_, x) => x !== best));
    removed.push(index[best]);
    index = index.filter((_, x) => x !== best);
  }
  return { grid, removed: removed.sort((a, b) => a - b) };
}

/** Remove 8-connected opaque groups smaller than `min` pixels (stray sparkles); returns pixels removed. */
function dropSpecks(g: Grid, min: number): number {
  const h = g.length;
  const w = h ? g[0].length : 0;
  const seen = g.map((row) => row.map(() => false));
  let removed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!g[y][x] || seen[y][x]) continue;
      const group: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen[y][x] = true;
      while (stack.length) {
        const [px, py] = stack.pop() as [number, number];
        group.push([px, py]);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny][nx] || !g[ny][nx]) continue;
            seen[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
      if (group.length < min) {
        for (const [px, py] of group) g[py][px] = '';
        removed += group.length;
      }
    }
  }
  return removed;
}

/** Drop fully transparent border rows and columns. */
function trimGrid(g: Grid): Grid {
  const rows = g.map((row) => row.some((c) => c !== ''));
  const cols = g[0].map((_, x) => g.some((row) => row[x] !== ''));
  const y0 = rows.indexOf(true);
  const y1 = rows.lastIndexOf(true);
  const x0 = cols.indexOf(true);
  const x1 = cols.lastIndexOf(true);
  if (y0 < 0) throw new Error('nothing left after dropping specks');
  return g.slice(y0, y1 + 1).map((row) => row.slice(x0, x1 + 1));
}

function closeOutline(g: Grid): number {
  const h = g.length;
  const w = h ? g[0].length : 0;
  const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && g[y][x] !== '';
  const edge: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) edge.push([x, y]);
    }
  }
  let changed = 0;
  for (const [x, y] of edge) {
    if (g[y][x] !== INK) changed++;
    g[y][x] = INK;
  }
  return changed;
}

function show(g: Grid, title: string): void {
  const keys = new Map<string, string>();
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  console.log(title);
  for (const row of g) {
    console.log(
      '  ' +
        row
          .map((c) => {
            if (!c) return '.';
            if (c === INK) return '#';
            if (!keys.has(c)) keys.set(c, letters[keys.size % letters.length]);
            return keys.get(c);
          })
          .join(''),
    );
  }
  console.log('  ' + [...keys.entries()].map(([h, k]) => `${k}=${h}`).join(' '));
}

/** A straight conveyor tile running east (src/render/belts.ts, frame 0). */
function beltTile(): PNG {
  const t = createPng(16, 16);
  for (let v = 0; v < 16; v++) {
    for (let u = 0; u < 16; u++) {
      const a = v + 0.5;
      let col = '#394a50';
      if (a < 1 || a >= 15) col = '#151d28';
      else {
        const ph = (u + 0.5) % 8;
        const centre = Math.abs(a - 8) < 3 ? 1.5 : 0.5;
        const dd = Math.abs(ph - centre);
        if (Math.min(dd, 8 - dd) < 0.5) col = '#577277';
      }
      fillRect(t, u, v, 1, 1, col);
    }
  }
  return t;
}

function onTile(art: PNG, bg: PNG): PNG {
  const t = createPng(16, 16);
  blit(t, bg, 0, 0);
  blit(t, art, Math.floor((16 - art.width) / 2), Math.floor((16 - art.height) / 2));
  return t;
}

function main(argv: string[]): void {
  const pos: string[] = [];
  let cols: number[] | null = null;
  let rows: number[] | null = null;
  const map = new Map<string, string>();
  let keepRim = false;
  let compare = '';
  let quiet = false;
  let specks = 0;
  const touch: [number, number, string][] = [];
  const ints = (s: string): number[] => (s === '' ? [] : s.split(',').map((v) => Number.parseInt(v, 10)));
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value\n${USAGE}`);
      return v;
    };
    if (a === '--cols') cols = ints(next());
    else if (a === '--rows') rows = ints(next());
    else if (a === '--map') {
      for (const pair of next().split(',')) {
        const [from, to] = pair.split('=');
        if (!/^#[0-9a-f]{6}$/i.test(from ?? '') || !/^#[0-9a-f]{6}$/i.test(to ?? '')) throw new Error(`--map: bad pair ${pair}`);
        map.set(from.toLowerCase(), to.toLowerCase());
      }
    } else if (a === '--specks') specks = Number.parseInt(next(), 10);
    else if (a === '--px') {
      for (const spec of next().split(';')) {
        const [xs, ys, hex] = spec.split(',');
        const x = Number.parseInt(xs ?? '', 10);
        const y = Number.parseInt(ys ?? '', 10);
        if (!Number.isInteger(x) || !Number.isInteger(y) || !/^#[0-9a-f]{6}$/i.test(hex ?? '')) throw new Error(`--px: bad pixel ${spec}`);
        touch.push([x, y, hex.toLowerCase()]);
      }
    } else if (a === '--keep-rim') keepRim = true;
    else if (a === '--compare') compare = fromRoot(next());
    else if (a === '--quiet') quiet = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}\n${USAGE}`);
    else pos.push(a);
  }
  if (pos.length !== 3) throw new Error(USAGE);
  const [srcArg, item, outArg] = pos;
  const src = fromRoot(srcArg);
  const out = fromRoot(outArg);
  const snapped = quantize(readPng(src));
  const box = trimAlpha(snapped);
  if (!box) throw new Error(`${rel(src)} has no opaque pixels`);
  const before = toGrid(crop(snapped, box.x, box.y, box.w, box.h));
  let g = before.map((row) => row.map((c) => (c && map.has(c) ? (map.get(c) as string) : c)));
  const dropped = specks > 0 ? dropSpecks(g, specks) : 0;
  if (dropped) g = trimGrid(g);
  const w0 = g[0].length;
  const h0 = g.length;
  let limW = ITEM_BOX;
  let limH = ITEM_BOX;
  if (LONG_ITEMS.has(item)) {
    if (w0 >= h0) limW = LONG_ITEM_BOX;
    else limH = LONG_ITEM_BOX;
  }
  const c = removeCols(g, Math.max(0, w0 - limW), cols);
  g = c.grid;
  const r = removeCols(transpose(g), Math.max(0, h0 - limH), rows);
  g = transpose(r.grid);
  const recoloured = keepRim ? 0 : closeOutline(g);
  const w = g[0].length;
  const h = g.length;
  for (const [x, y, hex] of touch) {
    if (x < 0 || y < 0 || x >= w || y >= h) throw new Error(`--px ${x},${y} is outside the ${w}x${h} result`);
    g[y][x] = hex;
  }
  const ok = Math.max(w, h) <= Math.max(limW, limH) && Math.min(w, h) <= ITEM_BOX;
  if (!quiet) {
    show(before, `${rel(src)} (${item}): ${w0}x${h0}`);
    show(g, `after: ${w}x${h}`);
  }
  console.log(
    `${item}: ${w0}x${h0} -> ${w}x${h}; removed columns [${c.removed.join(',')}] rows [${r.removed.join(',')}]` +
      `${map.size ? `; map ${[...map].map(([f, t]) => `${f}=${t}`).join(',')}` : ''}${dropped ? `; ${dropped} speck pixels dropped` : ''}` +
      `; ${keepRim ? 'rim kept' : `${recoloured} rim pixels to ${INK}`}${touch.length ? `; ${touch.length} pixels set by hand` : ''}` +
      `${ok ? '' : ' STILL TOO BIG'}`,
  );
  const result = toPng(g);
  mkdirSync(dirname(out), { recursive: true });
  writePng(out, result);
  if (compare) {
    const belt = beltTile();
    const sheet = createPng(16 * 2 * 8 + 8, 16 * 8, toRgba('#202e37'));
    blit(sheet, scaleNearest(onTile(toPng(before), belt), 8), 0, 0);
    blit(sheet, scaleNearest(onTile(result, belt), 8), 16 * 8 + 8, 0);
    mkdirSync(dirname(compare), { recursive: true });
    writePng(compare, sheet);
  }
  if (!ok) process.exitCode = 1;
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
