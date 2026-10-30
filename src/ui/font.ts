// The game's bitmap face: condensed and squared, like the stamped plates and readouts on the
// machines. Caps and lowercase are 4 px wide (M W T V X Y 5), m and w 7 px so their counters match
// n's, rounds cut by a 1 px chamfer, flat terminals, and tabular figures: every digit is 4 px wide,
// so a count that ticks over never shifts the text after it. I l 1 |, O 0 (slashed), 5 S and rn m
// are told apart by shape, not context.
//
// Rows 0-6 stand above the baseline (CAP_H), 7-8 are descenders. '#' is ink. Glyphs are drawn
// through one atlas per colour, so text is always crisp at any whole-number scale.
//
// Two styles: 'body' for running text, and 'head' for panel titles and section headers: the same
// glyphs in capitals with 1 px more tracking, like letters stamped into a plate.

const G: Record<string, string> = {
  A: '.##./#..#/#..#/####/#..#/#..#/#..#',
  B: '###./#..#/#..#/###./#..#/#..#/###.',
  C: '.###/#.../#.../#.../#.../#.../.###',
  D: '###./#..#/#..#/#..#/#..#/#..#/###.',
  E: '####/#.../#.../###./#.../#.../####',
  F: '####/#.../#.../###./#.../#.../#...',
  G: '.###/#.../#.../#.##/#..#/#..#/.###',
  H: '#..#/#..#/#..#/####/#..#/#..#/#..#',
  I: '###/.#./.#./.#./.#./.#./###',
  J: '...#/...#/...#/...#/...#/#..#/.##.',
  K: '#..#/#..#/#.#./##../#.#./#..#/#..#',
  L: '#.../#.../#.../#.../#.../#.../####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#..#/##.#/##.#/#.##/#.##/#..#/#..#',
  O: '.##./#..#/#..#/#..#/#..#/#..#/.##.',
  P: '###./#..#/#..#/###./#.../#.../#...',
  Q: '.##./#..#/#..#/#..#/#..#/#.#./.#.#',
  R: '###./#..#/#..#/###./#.#./#..#/#..#',
  S: '.###/#.../#.../.##./...#/...#/###.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#..#/#..#/#..#/#..#/#..#/#..#/.##.',
  V: '#...#/#...#/#...#/#...#/.#.#./.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '####/...#/..#./..#./.#../#.../####',
  a: '..../..../###./...#/.###/#..#/.###',
  b: '#.../#.../###./#..#/#..#/#..#/###.',
  c: '..../..../.###/#.../#.../#.../.###',
  d: '...#/...#/.###/#..#/#..#/#..#/.###',
  e: '..../..../.##./#..#/####/#.../.###',
  f: '.##/#../###/#../#../#../#..',
  g: '..../..../.###/#..#/#..#/#..#/.###/...#/###.',
  h: '#.../#.../###./#..#/#..#/#..#/#..#',
  i: '#/./#/#/#/#/#',
  j: '..#/.../..#/..#/..#/..#/..#/..#/##.',
  k: '#.../#.../#..#/#.#./##../#.#./#..#',
  l: '#./#./#./#./#./#./.#',
  m: '......./......./###.##./#..#..#/#..#..#/#..#..#/#..#..#',
  n: '..../..../###./#..#/#..#/#..#/#..#',
  o: '..../..../.##./#..#/#..#/#..#/.##.',
  p: '..../..../###./#..#/#..#/#..#/###./#.../#...',
  q: '..../..../.###/#..#/#..#/#..#/.###/...#/...#',
  r: '.../.../###/#../#../#../#..',
  s: '..../..../.###/#.../.##./...#/###.',
  t: '..../.#../####/.#../.#../.#../..##',
  u: '..../..../#..#/#..#/#..#/#..#/.###',
  v: '...../...../#...#/#...#/.#.#./.#.#./..#..',
  w: '......./......./#.....#/#..#..#/#..#..#/#..#..#/.##.##.',
  x: '..../..../#..#/#..#/.##./#..#/#..#',
  y: '..../..../#..#/#..#/#..#/#..#/.###/...#/###.',
  z: '..../..../####/...#/.##./#.../####',
  '0': '.##./#..#/#..#/#.##/##.#/#..#/.##.',
  '1': '..#./.##./..#./..#./..#./..#./.###',
  '2': '###./...#/...#/.##./#.../#.../####',
  '3': '###./...#/...#/.##./...#/...#/###.',
  '4': '#..#/#..#/#..#/####/...#/...#/...#',
  '5': '####/#.../#.../###./...#/...#/###.',
  '6': '.##./#.../#.../###./#..#/#..#/.##.',
  '7': '####/...#/...#/..#./..#./..#./..#.',
  '8': '.##./#..#/#..#/.##./#..#/#..#/.##.',
  '9': '.##./#..#/#..#/.###/...#/...#/.##.',
  ' ': '.../.../.../.../.../.../...',
  '!': '#/#/#/#/#/./#',
  '"': '#.#/#.#',
  '#': '...../.#.#./#####/.#.#./#####/.#.#.',
  $: '..#../.####/#.#../.###./..#.#/####./..#..',
  '%': '##../##.#/...#/..#./.#../#.##/#.##',
  '&': '.#.../#.#../#.#../.#.../#.#.#/#..#./.##.#',
  "'": '#/#',
  '(': '.#/#./#./#./#./#./.#',
  ')': '#./.#/.#/.#/.#/.#/#.',
  '*': '.../#.#/.#./#.#',
  '+': '...../..#../..#../#####/..#../..#..',
  ',': '../../../../../../.#/#.',
  '-': '.../.../.../###',
  '.': '././././././#',
  '/': '..#/..#/.#./.#./.#./#../#..',
  ':': './././#/././#',
  ';': '../../../.#/../../.#/#.',
  '<': '.../..#/.#./#../.#./..#',
  '=': '.../.../###/.../###',
  '>': '.../#../.#./..#/.#./#..',
  '?': '.##./#..#/...#/..#./.#../..../.#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  '[': '##/#./#./#./#./#./##',
  '\\': '#../#../.#./.#./.#./..#/..#',
  ']': '##/.#/.#/.#/.#/.#/##',
  '^': '.#./#.#',
  _: '..../..../..../..../..../..../..../####',
  '`': '#./.#',
  '{': '..#/.#./.#./#../.#./.#./..#',
  '|': '#/#/#/#/#/#/#',
  '}': '#../.#./.#./..#/.#./.#./#..',
  '~': '..../..../.#.#/#.#.',
  // Directions and rates, marks and separators.
  '→': '...../..#../...#./#####/...#./..#..',
  '←': '...../..#../.#.../#####/.#.../..#..',
  '↑': '..#../.###./#.#.#/..#../..#../..#../..#..',
  '↓': '..#../..#../..#../..#../#.#.#/.###./..#..',
  '×': '.../.../.../#.#/.#./#.#',
  '·': './././#',
  '•': '../../../##/##',
  '✓': '....../.....#/....#./...#../#.#.../.#....',
  '▲': '...../...../...../..#../.###./#####',
  '▼': '...../...../...../#####/.###./..#..',
  '…': '...../...../...../...../...../...../#.#.#',
  '–': '..../..../..../####',
  '—': '......./......./......./#######',
};

interface Glyph {
  w: number;
  rows: string[];
}

const GLYPHS: Record<string, Glyph> = {};
for (const [ch, s] of Object.entries(G)) {
  const rows = s.split('/');
  GLYPHS[ch] = { w: Math.max(...rows.map((r) => r.length)), rows };
}

/** 'body' for running text; 'head' (capitals, 1 px more tracking) for panel titles and section headers. */
export type TextStyle = 'body' | 'head';

/** Rows above the baseline: a capital's height. */
export const CAP_H = 7;
/** A line of text, descenders and leading included. */
export const LINE_H = 10;
/** Every digit's advance without the spacing (tabular figures). */
export const DIGIT_W = 4;
const ATLAS_H = 9;
const SPACING = 1;
const HEAD_TRACK = 1;

interface Atlas {
  canvas: HTMLCanvasElement;
  x: Record<string, number>;
}

const atlases = new Map<string, Atlas>();
const order = Object.keys(GLYPHS);

function atlasFor(color: string): Atlas {
  let a = atlases.get(color);
  if (a) return a;
  let total = 0;
  const xs: Record<string, number> = {};
  for (const ch of order) {
    xs[ch] = total;
    total += GLYPHS[ch].w + 1;
  }
  const canvas = document.createElement('canvas');
  canvas.width = total;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  for (const ch of order) {
    const g = GLYPHS[ch];
    for (let y = 0; y < g.rows.length; y++) {
      const row = g.rows[y];
      for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.fillRect(xs[ch] + x, y, 1, 1);
    }
  }
  a = { canvas, x: xs };
  atlases.set(color, a);
  return a;
}

function glyph(ch: string): Glyph {
  return GLYPHS[ch] ?? GLYPHS['?'];
}

/** The glyph's rows ('#' ink, '.' blank), for anything that rasterises text itself (scripts, tests). */
export function glyphRows(ch: string): readonly string[] {
  return glyph(ch).rows;
}

function styled(text: string, style: TextStyle): string {
  return style === 'head' ? text.toUpperCase() : text;
}

function gap(style: TextStyle): number {
  return style === 'head' ? SPACING + HEAD_TRACK : SPACING;
}

export function measureText(text: string, style: TextStyle = 'body'): number {
  const t = styled(text, style);
  const sp = gap(style);
  let w = 0;
  for (let i = 0; i < t.length; i++) {
    w += glyph(t[i]).w;
    if (i < t.length - 1) w += sp;
  }
  return w;
}

/**
 * Draw text with its top-left at (x, y) in the context's current transform. Returns its advance: the
 * width plus one spacing (0 for an empty string), so `x += drawText(...)` leaves a 1 px gap.
 */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, shadow?: string, style: TextStyle = 'body'): number {
  if (!text) return 0;
  if (shadow) drawText(ctx, text, x + 1, y + 1, shadow, undefined, style);
  const t = styled(text, style);
  const sp = gap(style);
  const a = atlasFor(color);
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (let i = 0; i < t.length; i++) {
    const ch = GLYPHS[t[i]] ? t[i] : '?';
    const g = GLYPHS[ch];
    ctx.drawImage(a.canvas, a.x[ch], 0, g.w, ATLAS_H, cx, cy, g.w, ATLAS_H);
    cx += g.w + sp;
  }
  // The loop ran one gap past the last glyph: swap it for a body spacing.
  return cx - Math.round(x) - sp + SPACING;
}

/** Shorten text with a trailing '…' until it is no wider than maxW. */
export function fitText(text: string, maxW: number, style: TextStyle = 'body'): string {
  if (measureText(text, style) <= maxW) return text;
  let t = text;
  while (t.length > 1 && measureText(t.trimEnd() + '…', style) > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** Split text into lines no wider than maxW. Respects explicit newlines. */
export function wrapText(text: string, maxW: number, style: TextStyle = 'body'): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (measureText(test, style) <= maxW || !line) {
        line = test;
      } else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

/** Format money: $1,234 or $12.3k for big numbers. */
export function money(n: number): string {
  const v = Math.floor(n);
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(v) >= 100_000) return '$' + (v / 1000).toFixed(1) + 'k';
  return '$' + v.toLocaleString('en-US');
}

export function fmt(n: number, digits = 0): string {
  return n.toFixed(digits);
}

/**
 * A per-minute amount as a number alone ("30", "7.5", "0.2", "1,240", "12.4k"): one decimal only
 * under 10 and only when it isn't whole, so whole rates never grow a ".0". The unit is the caller's
 * ("/min", see UI.rate).
 */
export function fmtRate(perMin: number): string {
  const v = Math.abs(perMin);
  const sign = perMin < 0 ? '-' : '';
  if (v >= 100_000) return sign + (v / 1000).toFixed(1) + 'k';
  if (v >= 10 || Math.abs(v - Math.round(v)) < 0.05) return sign + Math.round(v).toLocaleString('en-US');
  return sign + v.toFixed(1);
}
