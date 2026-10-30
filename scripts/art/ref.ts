/**
 * Reference files for PixelLab calls, written to art/ref/ (safe to re-run; free, no generations):
 *
 *   node scripts/art/ref.ts
 *
 *   apollo_swatch.png       the 46 Apollo colours as 8x8 swatches in one row (368x8), fully opaque,
 *                           no other colour: pass it as create_image_pixflux color_image to force
 *                           the palette
 *   apollo_swatch.b64.txt   the same PNG as base64, for color_image_base64 (prefix it with
 *                           "data:image/png;base64," for color_image_url)
 *   layer_palettes.json     { "apollo": [46 hexes], "layers": { "l0": [...], ... "l5": [...] },
 *                             "sets": { "t_l1_floor_rock": "l1", ... } }: the per-layer terrain
 *                           palettes of the art plan, ready to paste as a tool's `palette`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APOLLO, ROOT, createPng, fillRect, readPng, rel, rgbToHex, writePng } from './lib.ts';
import { LAYER_PALETTES, TERRAIN_SET_LAYERS, checkLayerPalettes } from './palettes.ts';

const REF_DIR = join(ROOT, 'art', 'ref');
const SWATCH = join(REF_DIR, 'apollo_swatch.png');
const SWATCH_B64 = join(REF_DIR, 'apollo_swatch.b64.txt');
const LAYERS_JSON = join(REF_DIR, 'layer_palettes.json');
const CELL = 8;

function main(): number {
  checkLayerPalettes();

  const swatch = createPng(APOLLO.length * CELL, CELL);
  APOLLO.forEach((hex, i) => fillRect(swatch, i * CELL, 0, CELL, CELL, hex));
  writePng(SWATCH, swatch);

  // Read it back: exactly the 46 colours, all opaque.
  const check = readPng(SWATCH);
  const seen = new Set<string>();
  for (let i = 0; i < check.data.length; i += 4) {
    if (check.data[i + 3] !== 255) throw new Error(`${rel(SWATCH)} has a transparent pixel`);
    seen.add(rgbToHex(check.data[i], check.data[i + 1], check.data[i + 2]));
  }
  if (seen.size !== APOLLO.length || !APOLLO.every((h) => seen.has(h))) {
    throw new Error(`${rel(SWATCH)} holds ${seen.size} colours, not the 46 Apollo colours`);
  }
  writeFileSync(SWATCH_B64, readFileSync(SWATCH).toString('base64'));

  const json = {
    note:
      'Apollo 46 and the per-layer terrain palettes of the art plan (batch T). Pass "layers.<lN>" as ' +
      'create_topdown_tileset palette (palette_name "Apollo") for every set of that layer; pass "apollo" ' +
      'to object and image tools. Written by scripts/art/ref.ts from scripts/art/palettes.ts.',
    apollo: APOLLO,
    layers: LAYER_PALETTES,
    sets: TERRAIN_SET_LAYERS,
  };
  const lines = [
    '{',
    `  "note": ${JSON.stringify(json.note)},`,
    `  "apollo": ${JSON.stringify(json.apollo)},`,
    '  "layers": {',
    ...Object.entries(json.layers).map(
      ([k, v], i, all) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < all.length - 1 ? ',' : ''}`,
    ),
    '  },',
    '  "sets": {',
    ...Object.entries(json.sets).map(
      ([k, v], i, all) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < all.length - 1 ? ',' : ''}`,
    ),
    '  }',
    '}',
    '',
  ];
  const text = lines.join('\n');
  JSON.parse(text); // must stay valid JSON
  writeFileSync(LAYERS_JSON, text);

  const sizes = Object.entries(LAYER_PALETTES)
    .map(([k, v]) => `${k} ${v.length}`)
    .join(', ');
  console.log(
    `art:ref: wrote ${rel(SWATCH)} (${swatch.width}x${swatch.height}, ${APOLLO.length} colours), ` +
      `${rel(SWATCH_B64)} (${readFileSync(SWATCH_B64, 'utf8').length} chars) and ${rel(LAYERS_JSON)} (${sizes})`,
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`art:ref: ${(e as Error).message}`);
  process.exitCode = 1;
}
