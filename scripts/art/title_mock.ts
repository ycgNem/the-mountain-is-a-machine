/**
 * title_mock: the title screen as the game draws it (src/ui/windows.ts drawTitle), to judge title art
 * in place before it ships. Free; reads src/ (font glyphs) as text only.
 *
 *   node scripts/art/title_mock.ts <art.png> [<art.png> ...] [--outdir art/out/title]
 *
 * For each 320 x 180 art: a 640 x 360 UI frame (the usual UI size: uiScale 2 at 720p, 3 at 1080p,
 * 4 at 1440p) with the art at 2x, the 25% #090a14 veil, the logo in 2x letters (#e8c170 with an ink
 * shadow), the tagline (#a8b5b2), the three slot buttons, Settings and the footer lines, written as
 * <outdir>/<name>-ui.png and at 2x (a 1280 x 720 screen) as <outdir>/<name>-ui-2x.png. The art
 * scaling copies drawTitleBackdrop: the largest whole scale that fits, centred (DECISIONS #114).
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { OUT_DIR, ROOT, createPng, fillRect, fromRoot, hexToRgb, readPng, rel, scaleNearest, writePng } from './lib.ts';
import type { PNG } from './lib.ts';

const UI_W = 640;
const UI_H = 360;
const INK = '#090a14';

// The game's 5x7 font, parsed from src/ui/font.ts (rows split by '/', '#' = ink).
function loadFont(): Map<string, string[]> {
  const text = readFileSync(join(ROOT, 'src', 'ui', 'font.ts'), 'utf8');
  const glyphs = new Map<string, string[]>();
  const re = /^\s*(?:'((?:\\.|[^'])*)'|"([^"]*)"|([A-Za-z0-9_$]+))\s*:\s*'([^']*)',?\s*$/gm;
  for (const m of text.matchAll(re)) {
    const key = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\(.)/g, '$1');
    if (key.length === 1) glyphs.set(key, m[4].split('/'));
  }
  if (!glyphs.has('A') || !glyphs.has(' ')) throw new Error('could not parse the glyphs in src/ui/font.ts');
  return glyphs;
}
const FONT = loadFont();
const glyph = (ch: string): string[] => FONT.get(ch) ?? FONT.get('?') ?? ['#'];
const glyphW = (ch: string): number => Math.max(...glyph(ch).map((r) => r.length));

function measure(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) w += glyphW(text[i]) + (i < text.length - 1 ? 1 : 0);
  return w;
}

/** Draw text with its top-left at (x, y); `scale` = the canvas transform (2 for the logo). */
function text(png: PNG, s: string, x: number, y: number, color: string, scale = 1, shadow?: string): void {
  if (shadow) text(png, s, x + 1, y + 1, shadow, scale);
  let cx = Math.round(x);
  for (const ch of s) {
    const rows = glyph(ch);
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') fillRect(png, (cx + rx) * scale, (Math.round(y) + ry) * scale, scale, scale, color);
    });
    cx += glyphW(ch) + 1;
  }
}
const textCenter = (png: PNG, s: string, cx: number, y: number, color: string, shadow?: string): void =>
  text(png, s, Math.round(cx - measure(s) / 2), y, color, 1, shadow);

function button(png: PNG, x: number, y: number, w: number, h: number, label: string): void {
  fillRect(png, x - 1, y - 1, w + 2, h + 2, INK);
  fillRect(png, x, y, w, h, '#202e37');
  fillRect(png, x, y, w, 1, '#577277');
  fillRect(png, x, y + h - 1, w, 1, '#10141f');
  text(png, label, x + Math.floor((w - measure(label)) / 2), y + Math.floor((h - 7) / 2), '#ebede9');
}

function mock(art: PNG): PNG {
  const ui = createPng(UI_W, UI_H, INK);
  // Art of another size than 320 x 180 leaves ink margins here; the game carries the art on into them.
  const s = Math.max(1, Math.floor(Math.min(UI_W / art.width, UI_H / art.height)));
  const big = scaleNearest(art, s);
  const ox = Math.floor(UI_W / 2 - big.width / 2);
  const oy = Math.floor(UI_H / 2 - big.height / 2);
  const [ir, ig, ib] = hexToRgb(INK);
  for (let y = 0; y < UI_H; y++) {
    for (let x = 0; x < UI_W; x++) {
      const sx = x - ox;
      const sy = y - oy;
      if (sx < 0 || sy < 0 || sx >= big.width || sy >= big.height) continue;
      const si = (sy * big.width + sx) * 4;
      const di = (y * UI_W + x) * 4;
      // drawImage, then fill(0, 0, w, h, ink, 0.25).
      ui.data[di] = Math.round(big.data[si] * 0.75 + ir * 0.25);
      ui.data[di + 1] = Math.round(big.data[si + 1] * 0.75 + ig * 0.25);
      ui.data[di + 2] = Math.round(big.data[si + 2] * 0.75 + ib * 0.25);
      ui.data[di + 3] = 255;
    }
  }
  const title = 'THE MOUNTAIN IS A MACHINE';
  const tw = measure(title) * 2;
  text(ui, title, Math.round((UI_W / 2 - tw / 2) / 2) + 1, 15, INK, 2);
  text(ui, title, Math.round((UI_W / 2 - tw / 2) / 2), 14, '#e8c170', 2);
  textCenter(ui, 'A factory game about a mountain that hums.', UI_W / 2, 50, '#a8b5b2', INK);
  const bw = 170;
  const bx = Math.floor(UI_W / 2 - bw / 2);
  let by = Math.floor(UI_H * 0.56);
  for (let i = 0; i < 3; i++) {
    button(ui, bx, by, bw, 14, `Operation ${i + 1}: start a new one`);
    by += 18;
  }
  by += 4;
  button(ui, bx + 25, by, bw - 50, 14, 'Settings');
  textCenter(ui, 'Your progress saves in this browser. Clearing site data erases it.', UI_W / 2, UI_H - 22, '#819796', INK);
  textCenter(ui, 'v0.1 - first build', UI_W / 2, UI_H - 12, '#394a50');
  return ui;
}

function main(): number {
  const args = process.argv.slice(2);
  const o = args.indexOf('--outdir');
  const outDir = o >= 0 && args[o + 1] ? fromRoot(args[o + 1]) : join(OUT_DIR, 'title');
  const files = args.filter((a, i) => !a.startsWith('--') && !(o >= 0 && i === o + 1));
  if (files.length === 0) {
    console.error('usage: node scripts/art/title_mock.ts <art.png> [...] [--outdir <dir>]');
    return 2;
  }
  for (const f of files) {
    const ui = mock(readPng(fromRoot(f)));
    const name = basename(f, '.png');
    const one = join(outDir, `${name}-ui.png`);
    const two = join(outDir, `${name}-ui-2x.png`);
    writePng(one, ui);
    writePng(two, scaleNearest(ui, 2));
    console.log(`${rel(fromRoot(f))} -> ${rel(one)}, ${rel(two)}`);
  }
  return 0;
}

process.exitCode = main();
