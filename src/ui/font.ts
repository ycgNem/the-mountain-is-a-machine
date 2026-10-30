// A hand-drawn 5x7 proportional bitmap font with descenders. Rows: 0-6 above the baseline,
// 7-8 descenders. '#' is ink. Drawn through per-color glyph atlases, so text is always crisp.

const G: Record<string, string> = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '###/.#./.#./.#./.#./.#./###',
  J: '..###/...#./...#./...#./#..#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  a: '...../...../.###./....#/.####/#...#/.####',
  b: '#..../#..../####./#...#/#...#/#...#/####.',
  c: '...../...../.###./#..../#..../#..../.###.',
  d: '....#/....#/.####/#...#/#...#/#...#/.####',
  e: '...../...../.###./#...#/#####/#..../.###.',
  f: '..##/.#../####/.#../.#../.#../.#..',
  g: '...../...../.####/#...#/#...#/#...#/.####/....#/.###.',
  h: '#..../#..../####./#...#/#...#/#...#/#...#',
  i: '#/./#/#/#/#/#',
  j: '..#/.../..#/..#/..#/..#/..#/#.#/.#.',
  k: '#.../#.../#..#/#.#./##../#.#./#..#',
  l: '#./#./#./#./#./#./.#',
  m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#',
  n: '...../...../####./#...#/#...#/#...#/#...#',
  o: '...../...../.###./#...#/#...#/#...#/.###.',
  p: '...../...../####./#...#/#...#/#...#/####./#..../#....',
  q: '...../...../.####/#...#/#...#/#...#/.####/....#/....#',
  r: '..../..../#.##/##../#.../#.../#...',
  s: '...../...../.####/#..../.###./....#/####.',
  t: '.#../.#../####/.#../.#../.#../..##',
  u: '...../...../#...#/#...#/#...#/#...#/.####',
  v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '...../...../#...#/#...#/#...#/#...#/.####/....#/.###.',
  z: '...../...../#####/...#./..#../.#.../#####',
  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '.#./##./.#./.#./.#./.#./###',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '####./....#/....#/.###./....#/....#/####.',
  '4': '#...#/#...#/#...#/#####/....#/....#/....#',
  '5': '#####/#..../#..../####./....#/....#/####.',
  '6': '.###./#..../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../..#../..#../..#..',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/....#/.###.',
  ' ': '.../.../.../.../.../.../...',
  '!': '#/#/#/#/#/./#',
  '"': '#.#/#.#/.../.../.../.../...',
  '#': '...../.#.#./#####/.#.#./#####/.#.#./.....',
  $: '..#../.####/#.#../.###./..#.#/####./..#..',
  '%': '##.../##..#/...#./..#../.#.../#..##/...##',
  '&': '.#.../#.#../#.#../.#.../#.#.#/#..#./.##.#',
  "'": '#/#/./././././',
  '(': '.#/#./#./#./#./#./.#',
  ')': '#./.#/.#/.#/.#/.#/#.',
  '*': '.../#.#/.#./#.#/.../.../...',
  '+': '...../..#../..#../#####/..#../..#../.....',
  ',': '../../../../../.#/.#/#.',
  '-': '..../..../..../####/..../..../....',
  '.': './././././././#',
  '/': '....#/...#./...#./..#../.#.../.#.../#....',
  ':': './#/./././#/.',
  ';': '../.#/../../../.#/.#/#.',
  '<': '...#/..#./.#../#.../.#../..#./...#',
  '=': '..../..../####/..../####/..../....',
  '>': '#.../.#../..#./...#/..#./.#../#...',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  '[': '##/#./#./#./#./#./##',
  '\\': '#..../.#.../.#.../..#../...#./...#./....#',
  ']': '##/.#/.#/.#/.#/.#/##',
  '^': '.#./#.#/.../.../.../.../...',
  _: '...../...../...../...../...../...../#####',
  '`': '#./.#/../../../../..',
  '{': '..#/.#./.#./#../.#./.#./..#',
  '|': '#/#/#/#/#/#/#',
  '}': '#../.#./.#./..#/.#./.#./#..',
  '~': '...../...../.#.../#.#.#/...#./...../.....',
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

export const CAP_H = 7;
export const LINE_H = 10;
const ATLAS_H = 9;
const SPACING = 1;

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

export function measureText(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += glyph(text[i]).w;
    if (i < text.length - 1) w += SPACING;
  }
  return w;
}

/** Draw text with its top-left at (x, y) in the context's current transform. Returns the width. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, shadow?: string): number {
  if (shadow) drawText(ctx, text, x + 1, y + 1, shadow);
  const a = atlasFor(color);
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (let i = 0; i < text.length; i++) {
    const ch = GLYPHS[text[i]] ? text[i] : '?';
    const g = GLYPHS[ch];
    ctx.drawImage(a.canvas, a.x[ch], 0, g.w, ATLAS_H, cx, cy, g.w, ATLAS_H);
    cx += g.w + SPACING;
  }
  return cx - Math.round(x);
}

/** Shorten text with a trailing '.' until it is no wider than maxW. */
export function fitText(text: string, maxW: number): string {
  if (measureText(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && measureText(t + '.') > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '.';
}

/** Split text into lines no wider than maxW. Respects explicit newlines. */
export function wrapText(text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (measureText(test) <= maxW || !line) {
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
