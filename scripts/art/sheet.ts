/**
 * art:sheet: contact sheets of the built art, for review.
 *
 *   node scripts/art/sheet.ts
 *
 * Reads public/art/atlas.png + atlas.json and public/art/terrain/*.png (run art:build first) and
 * writes two images:
 *   art/out/contact.png     every atlas sprite at 2x on #151d28, grouped by prefix, each with its
 *                           name and size in the 3x5 font and a frame showing its canvas; every
 *                           terrain sheet at 2x as a 4x4 index grid (tile number + a corner key:
 *                           light = upper terrain) next to a dual-grid sample patch
 *   art/out/contact-1x.png  the same sprites and terrain at 1x, once on mid-grey and once on
 *                           #10141f, to judge readability at game size (same order as contact.png)
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ATLAS_JSON,
  ATLAS_PNG,
  GLYPH_ADVANCE,
  GROUP_LABELS,
  LINE_HEIGHT,
  OUT_DIR,
  TERRAIN_DIR,
  blit,
  createPng,
  crop,
  drawText,
  fillRect,
  naturalCompare,
  readAtlasJson,
  readPng,
  rel,
  scaleNearest,
  spriteGroup,
  strokeRect,
  writePng,
} from './lib.ts';
import type { AtlasJson, PNG } from './lib.ts';

const CONTACT = join(OUT_DIR, 'contact.png');
const CONTACT_1X = join(OUT_DIR, 'contact-1x.png');

const BG = '#151d28';
const TEXT = '#ebede9';
const DIM = '#819796';
const ACCENT = '#e8c170';
const FRAME = '#202e37';
const UPPER = '#e8c170';
const LOWER = '#394a50';
const MID_GREY = '#808080';
const NIGHT = '#10141f';
const INK = '#090a14';

const GROUP_ORDER = ['i', 'b', 'd', 'x', 'p', 'title', 'other'];

/**
 * Corner map for the dual-grid sample patch (1 = upper terrain). Every one of the 16 corner
 * combinations appears at least once, so a bad tile shows up as a seam.
 */
const SAMPLE = [
  '000000000000',
  '011000011100',
  '011100110110',
  '001110100010',
  '000111100110',
  '010011000100',
  '001000011000',
  '000000000000',
];

interface Sprite {
  name: string;
  png: PNG;
}

interface Terrain {
  name: string;
  png: PNG;
  /** Tile size, or null when the image isn't a square 4x4 sheet. */
  tile: number | null;
}

type Draw = (png: PNG) => void;

// ---------------------------------------------------------------------------------------------
// Helpers

/** Split a name into lines of at most `max` characters, preferring breaks before underscores. */
function wrapLabel(name: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (let token of name.split(/(?=_)/)) {
    while (token.length > max) {
      if (line) lines.push(line);
      line = '';
      lines.push(token.slice(0, max));
      token = token.slice(max);
    }
    if (line && line.length + token.length > max) {
      lines.push(line);
      line = token;
    } else {
      line += token;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Left-to-right flow with wrapping; returns each box's position and the total height. */
function flow(
  boxes: { w: number; h: number }[],
  maxW: number,
  gapX: number,
  gapY: number,
): { pos: { x: number; y: number }[]; height: number } {
  const pos: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let row = 0;
  for (const b of boxes) {
    if (x > 0 && x + b.w > maxW) {
      x = 0;
      y += row + gapY;
      row = 0;
    }
    pos.push({ x, y });
    x += b.w + gapX;
    row = Math.max(row, b.h);
  }
  return { pos, height: boxes.length ? y + row : 0 };
}

/** The corner index (nw*8 + ne*4 + sw*2 + se) of every tile of the sample patch. */
function sampleIndices(): number[][] {
  const c = (x: number, y: number): number => (SAMPLE[y][x] === '1' ? 1 : 0);
  const rows: number[][] = [];
  for (let y = 0; y + 1 < SAMPLE.length; y++) {
    const row: number[] = [];
    for (let x = 0; x + 1 < SAMPLE[0].length; x++) {
      row.push(c(x, y) * 8 + c(x + 1, y) * 4 + c(x, y + 1) * 2 + c(x + 1, y + 1));
    }
    rows.push(row);
  }
  return rows;
}

/** The sample patch drawn with a terrain sheet at 1x, as the game's dual grid would draw it. */
function samplePatch(t: Terrain & { tile: number }): PNG {
  const rows = sampleIndices();
  const out = createPng(rows[0].length * t.tile, rows.length * t.tile);
  rows.forEach((row, ty) =>
    row.forEach((i, tx) => {
      blit(out, crop(t.png, (i % 4) * t.tile, Math.floor(i / 4) * t.tile, t.tile, t.tile), tx * t.tile, ty * t.tile);
    }),
  );
  return out;
}

function hasTile(t: Terrain): t is Terrain & { tile: number } {
  return t.tile !== null;
}

function groupSprites(sprites: Sprite[]): { group: string; items: Sprite[] }[] {
  const byGroup = new Map<string, Sprite[]>();
  for (const s of sprites) {
    const g = GROUP_ORDER.includes(spriteGroup(s.name)) ? spriteGroup(s.name) : 'other';
    const list = byGroup.get(g) ?? [];
    list.push(s);
    byGroup.set(g, list);
  }
  return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
    group: g,
    items: (byGroup.get(g) as Sprite[]).sort((a, b) => naturalCompare(a.name, b.name)),
  }));
}

const groupTitle = (group: string, n: number): string =>
  `${GROUP_LABELS[group] ?? group}${group.length === 1 ? ` (${group}_)` : ''} - ${n}`;

// ---------------------------------------------------------------------------------------------
// contact.png: 2x, labeled

function contactSheet(groups: { group: string; items: Sprite[] }[], terrains: Terrain[], subtitle: string): PNG {
  const M = 12;
  const ops: Draw[] = [];
  let width = 1024;
  let y = M;

  const title = 'THE MOUNTAIN IS A MACHINE - CONTACT SHEET';
  ops.push((png) => drawText(png, title, M, M, TEXT, 2));
  y += 10 + 6;
  const sub = y;
  ops.push((png) => drawText(png, subtitle, M, sub, DIM));
  /** Just below the last thing drawn; `y` is where the next block starts. */
  let bottom = sub + LINE_HEIGHT;
  y = bottom + 12;

  if (groups.length === 0 && terrains.length === 0) {
    const at = y;
    ops.push((png) => drawText(png, 'THE ATLAS IS EMPTY: ADD RECIPES TO ART/RECIPES AND RUN NPM RUN ART:BUILD', M, at, ACCENT));
    bottom = at + LINE_HEIGHT;
    y = bottom + 12;
  }

  for (const { group, items } of groups) {
    const headY = y;
    const head = groupTitle(group, items.length);
    ops.push((png) => drawText(png, head, M, headY, ACCENT));
    y += LINE_HEIGHT + 6;

    const cells = items.map((s) => {
      const w2 = s.png.width * 2;
      const h2 = s.png.height * 2;
      const w = Math.max(w2 + 2, 16 * GLYPH_ADVANCE - 1);
      const lines = wrapLabel(s.name, Math.floor((w + 1) / GLYPH_ADVANCE));
      return { s, w, h: h2 + 2 + 3 + (lines.length + 1) * LINE_HEIGHT - 1, lines, w2, h2 };
    });
    width = Math.max(width, ...cells.map((c) => c.w + 2 * M));
    const laid = flow(cells, width - 2 * M, 10, 12);
    const top = y;
    cells.forEach((c, k) => {
      const x = M + laid.pos[k].x;
      const cy = top + laid.pos[k].y;
      ops.push((png) => {
        strokeRect(png, x, cy, c.w2 + 2, c.h2 + 2, FRAME);
        blit(png, scaleNearest(c.s.png, 2), x + 1, cy + 1);
        let ly = cy + c.h2 + 2 + 3;
        for (const line of c.lines) {
          drawText(png, line, x, ly, TEXT);
          ly += LINE_HEIGHT;
        }
        drawText(png, `${c.s.png.width}x${c.s.png.height}`, x, ly, DIM);
      });
    });
    bottom = top + laid.height;
    y = bottom + 18;
  }

  if (terrains.length > 0) {
    const headY = y;
    const head = `${GROUP_LABELS.t} (t_) - ${terrains.length}`;
    ops.push((png) => drawText(png, head, M, headY, ACCENT));
    y += LINE_HEIGHT + 6;
  }
  for (const t of terrains) {
    const labelY = y;
    const label = t.tile ? `${t.name}  (${t.tile} px tiles: index = nw*8 + ne*4 + sw*2 + se)` : `${t.name}  (not a 4x4 sheet)`;
    ops.push((png) => drawText(png, label, M, labelY, TEXT));
    y += LINE_HEIGHT + 4;
    const top = y;

    if (!hasTile(t)) {
      ops.push((png) => blit(png, scaleNearest(t.png, 2), M, top));
      width = Math.max(width, t.png.width * 2 + 2 * M);
      bottom = top + t.png.height * 2;
      y = bottom + 18;
      continue;
    }

    // 4x4 index grid: each tile at 2x, its number and a corner key under it.
    const T2 = t.tile * 2;
    const gap = 4;
    const cellH = T2 + 2 + 7;
    for (let i = 0; i < 16; i++) {
      const x = M + (i % 4) * (T2 + gap);
      const ty = top + Math.floor(i / 4) * (cellH + gap);
      ops.push((png) => {
        blit(png, scaleNearest(crop(t.png, (i % 4) * t.tile, Math.floor(i / 4) * t.tile, t.tile, t.tile), 2), x, ty);
        drawText(png, String(i), x, ty + T2 + 3, DIM);
        const kx = x + T2 - 7;
        const ky = ty + T2 + 2;
        const bits = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1];
        bits.forEach((b, k) => fillRect(png, kx + (k % 2) * 4, ky + Math.floor(k / 2) * 4, 3, 3, b ? UPPER : LOWER));
      });
    }
    const gridW = 4 * T2 + 3 * gap;
    const gridH = 4 * cellH + 3 * gap;

    // Dual-grid sample patch at 2x.
    const patch = scaleNearest(samplePatch(t), 2);
    const px = M + gridW + 24;
    ops.push((png) => {
      drawText(png, 'DUAL-GRID SAMPLE', px, top, DIM);
      blit(png, patch, px, top + LINE_HEIGHT + 2);
    });
    width = Math.max(width, px + patch.width + M);
    bottom = top + Math.max(gridH, LINE_HEIGHT + 2 + patch.height);
    y = bottom + 18;
  }

  const png = createPng(width, bottom + M, BG);
  for (const op of ops) op(png);
  return png;
}

// ---------------------------------------------------------------------------------------------
// contact-1x.png: 1x on mid-grey and on #10141f

function contact1x(groups: { group: string; items: Sprite[] }[], terrains: Terrain[]): PNG {
  const M = 8;
  const GAP = 4;
  let pw = 480;
  for (const { items } of groups) for (const s of items) pw = Math.max(pw, s.png.width + 2 * M);

  type PanelDraw = (png: PNG, ox: number, ink: string, dim: string) => void;
  const ops: PanelDraw[] = [];
  let y = M + LINE_HEIGHT + 8; // panel title goes at M

  for (const { group, items } of groups) {
    const headY = y;
    const head = groupTitle(group, items.length);
    ops.push((png, ox, _ink, dim) => drawText(png, head, ox + M, headY, dim));
    y += LINE_HEIGHT + 4;
    const laid = flow(
      items.map((s) => ({ w: s.png.width, h: s.png.height })),
      pw - 2 * M,
      GAP,
      GAP,
    );
    const top = y;
    items.forEach((s, k) => {
      const x = M + laid.pos[k].x;
      const sy = top + laid.pos[k].y;
      ops.push((png, ox) => blit(png, s.png, ox + x, sy));
    });
    y = top + laid.height + 10;
  }

  for (const t of terrains) {
    const labelY = y;
    ops.push((png, ox, _ink, dim) => drawText(png, t.name, ox + M, labelY, dim));
    y += LINE_HEIGHT + 3;
    const top = y;
    ops.push((png, ox) => blit(png, t.png, ox + M, top));
    let h = t.png.height;
    let w = t.png.width;
    if (hasTile(t)) {
      const patch = samplePatch(t);
      ops.push((png, ox) => blit(png, patch, ox + M + t.png.width + 8, top));
      h = Math.max(h, patch.height);
      w += 8 + patch.width;
    }
    pw = Math.max(pw, w + 2 * M);
    y = top + h + 10;
  }

  const height = Math.max(y - 10 + M, M + LINE_HEIGHT + 8);
  const png = createPng(pw * 2, height, MID_GREY);
  fillRect(png, pw, 0, pw, height, NIGHT);
  const panels: { ox: number; ink: string; dim: string; title: string }[] = [
    { ox: 0, ink: INK, dim: INK, title: '1X ON MID-GREY' },
    { ox: pw, ink: TEXT, dim: DIM, title: '1X ON #10141F' },
  ];
  for (const p of panels) {
    drawText(png, `${p.title} - SAME ORDER AS CONTACT.PNG`, p.ox + M, M, p.ink);
    for (const op of ops) op(png, p.ox, p.ink, p.dim);
  }
  return png;
}

// ---------------------------------------------------------------------------------------------
// Main

function main(): number {
  let atlasJson: AtlasJson | null;
  try {
    atlasJson = readAtlasJson();
  } catch (e) {
    console.error(`art:sheet: ${(e as Error).message}`);
    return 1;
  }
  if (!atlasJson || !existsSync(ATLAS_PNG)) {
    console.error(`art:sheet: ${rel(ATLAS_JSON)} or ${rel(ATLAS_PNG)} is missing; run npm run art:build first.`);
    return 1;
  }
  const atlas = readPng(ATLAS_PNG);

  // Terrain: the sheets in public/art/terrain/, plus any t_ atlas entry without a file.
  const terrains: Terrain[] = [];
  const tileOf = (png: PNG): number | null =>
    png.width === png.height && png.width % 4 === 0 ? png.width / 4 : null;
  if (existsSync(TERRAIN_DIR)) {
    for (const f of readdirSync(TERRAIN_DIR).filter((f) => f.toLowerCase().endsWith('.png'))) {
      const png = readPng(join(TERRAIN_DIR, f));
      terrains.push({ name: f.slice(0, -4), png, tile: tileOf(png) });
    }
  }

  const sprites: Sprite[] = [];
  for (const [name, r] of Object.entries(atlasJson.sprites)) {
    if (terrains.some((t) => t.name === name)) continue;
    let png: PNG;
    try {
      png = crop(atlas, r.x, r.y, r.w, r.h);
    } catch (e) {
      console.error(`art:sheet: atlas entry ${name}: ${(e as Error).message}`);
      return 1;
    }
    if (name.startsWith('t_')) terrains.push({ name, png, tile: tileOf(png) });
    else sprites.push({ name, png });
  }
  terrains.sort((a, b) => naturalCompare(a.name, b.name));
  const groups = groupSprites(sprites);

  const built = atlasJson.built ? atlasJson.built.replace('T', ' ').slice(0, 16) + ' UTC' : 'UNKNOWN';
  const subtitle =
    `${sprites.length} SPRITES, ${terrains.length} TERRAIN SETS - ATLAS ${atlas.width}X${atlas.height}, BUILT ${built}`;

  const sheet = contactSheet(groups, terrains, subtitle);
  writePng(CONTACT, sheet);
  const small = contact1x(groups, terrains);
  writePng(CONTACT_1X, small);
  console.log(
    `art:sheet: ${sprites.length} sprites, ${terrains.length} terrain sets\n` +
      `Wrote ${rel(CONTACT)} (${sheet.width}x${sheet.height})\n` +
      `Wrote ${rel(CONTACT_1X)} (${small.width}x${small.height})`,
  );
  return 0;
}

process.exitCode = main();
