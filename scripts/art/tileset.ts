/**
 * Import a PixelLab top-down Wang tileset (create_topdown_tileset) as a dual-grid terrain sheet and
 * its recipe. Free: it only downloads.
 *
 *   node scripts/art/tileset.ts <tileset-id> <set> [options]
 *
 * <set> is the terrain sprite name, e.g. t_l1_floor_rock (l1_floor_rock works too). It fetches
 * https://api.pixellab.ai/mcp/tilesets/<id>/metadata and .../image?inline=true (no auth: the UUID is
 * the key; falls back to the CDN redirect of .../image; waits while PixelLab answers 423 "still
 * generating"), then
 *   - requires every tile corner to be "lower" or "upper" (a "transition" corner is the 25-tile
 *     cliff layout of transition_size above 0.25 (pro) / 0.5 (standard): regenerate at 0 or 0.25)
 *     and the tiles to be 16 x 16;
 *   - gives each tile the index i = NW*8 + NE*4 + SW*2 + SE*1 (upper = 1), cuts it by its
 *     bounding_box and pastes it at column i % 4, row floor(i / 4) of a 64 x 64 sheet;
 *   - fails loudly unless all 16 indices are there; --twin fills a missing one on purpose.
 * Writes (raw downloads byte for byte; nothing is quantized here, art:build does that):
 *   art/raw/terrain/<set>.pixellab.png    the sheet as PixelLab sent it
 *   art/raw/terrain/<set>.metadata.json   its metadata (corners, bounding boxes, base tile ids)
 *   art/raw/terrain/<set>.png             the 64 x 64 sheet in corner-index order
 *   art/recipes/terrain_<set>.json        the terrain recipe: 16 tiles, twins marked as "twin"
 *   art/out/mock/<set>.png (+ -3x, -bands, -bands-3x)   a seeded random cave map drawn with the
 *                                         sheet snapped to Apollo, lit and under the 4 darkness bands
 * and prints a palette report (pixels snapped / moved far, colours outside the layer palette of
 * art/ref/layer_palettes.json, floor and rock contrast against the darkness tint #090a14) and the
 * base tile ids to chain the layer's next set (lower_base_tile_id).
 *
 * Options
 *   --twin <missing>=<source>  fill the missing corner combination with a copy of another tile;
 *                    each side is an index 0-15 or four corner bits nw ne sw se: 6=4 or 0110=0100
 *                    (repeatable). The recipe lists it as "twin" so art:build warns about it.
 *   --tag <tag>      write art/raw/terrain/<set>.<tag>.* and art/out/mock/<set>.<tag>* (compare
 *                    pilot candidates side by side; usually with --no-recipe)
 *   --no-recipe      don't write the recipe (otherwise it points at this import, replacing any other)
 *   --no-preview     don't write the art/out/mock previews
 *   --metadata <json> --image <png>   use files already downloaded (e.g. with curl) instead
 *   --wait <seconds> how long to wait for a tileset still generating (default 300)
 *   --verbose        list where every tile came from
 *   --raw-dir <dir> --recipes-dir <dir> --preview-dir <dir>   other output folders (for tests)
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  FAR_DELTA,
  OUT_DIR,
  RAW_DIR,
  RECIPES_DIR,
  blit,
  clonePng,
  contrastRatio,
  countTransparent,
  createPng,
  crop,
  fromRoot,
  hexToRgb,
  newQuantizeStats,
  percent,
  quantize,
  readPng,
  rel,
  rgbToHex,
  scaleNearest,
  writePng,
} from './lib.ts';
import type { PNG } from './lib.ts';
import { LAYER_PALETTES, layerOfSet } from './palettes.ts';
import { DARK_TINT, TILE, darkBands, drawTerrain, randomMapAllTiles } from './scene.ts';

const API = 'https://api.pixellab.ai/mcp/tilesets';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SET_RE = /^t_[a-z0-9_]+$/;
const CORNERS = ['NW', 'NE', 'SW', 'SE'] as const;
/** Art plan issue 1: a floor base must reach this contrast against the darkness tint. */
const FLOOR_MIN_CONTRAST = 1.4;
const USAGE =
  'usage: node scripts/art/tileset.ts <tileset-id> <t_set_name> [--twin <missing>=<source>] [--tag <tag>] ' +
  '[--no-recipe] [--no-preview] [--metadata <json> --image <png>] [--wait <s>] [--verbose]';

interface Options {
  id: string;
  set: string;
  twins: [number, number][];
  tag: string | null;
  recipe: boolean;
  preview: boolean;
  metadata: string | null;
  image: string | null;
  wait: number;
  verbose: boolean;
  rawDir: string;
  recipesDir: string;
  previewDir: string;
}

/** An index 0-15, or four corner bits "nw ne sw se" such as 0110. */
function parseIndex(s: string, what: string): number {
  if (/^[01]{4}$/.test(s)) return parseInt(s, 2);
  if (/^\d{1,2}$/.test(s) && Number(s) <= 15) return Number(s);
  throw new Error(`${what}: "${s}" is neither a tile index 0-15 nor four corner bits like 0110`);
}

function bits(i: number): string {
  return `${(i >> 3) & 1}${(i >> 2) & 1}${(i >> 1) & 1}${i & 1}`;
}

/** "tile 6 [nw ne sw se = 0110]" for messages. */
function label(i: number): string {
  return `${i} (nw ne sw se = ${bits(i).split('').join(' ')})`;
}

function parseArgs(argv: string[]): Options {
  const o: Options = {
    id: '',
    set: '',
    twins: [],
    tag: null,
    recipe: true,
    preview: true,
    metadata: null,
    image: null,
    wait: 300,
    verbose: false,
    rawDir: join(RAW_DIR, 'terrain'),
    recipesDir: RECIPES_DIR,
    previewDir: join(OUT_DIR, 'mock'),
  };
  const positional: string[] = [];
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    const value = (): string => {
      const v = argv[++k];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--twin': {
        const v = value();
        const m = /^([^=]+)=([^=]+)$/.exec(v);
        if (!m) throw new Error(`--twin ${v}: write <missing>=<source>, e.g. 6=4 or 0110=0100`);
        const missing = parseIndex(m[1], `--twin ${v}`);
        const src = parseIndex(m[2], `--twin ${v}`);
        if (missing === src) throw new Error(`--twin ${v}: a tile can't be its own twin`);
        o.twins.push([missing, src]);
        break;
      }
      case '--tag':
        o.tag = value();
        if (!/^[a-z0-9_-]+$/i.test(o.tag)) throw new Error('--tag may only use letters, digits, - and _');
        break;
      case '--no-recipe':
        o.recipe = false;
        break;
      case '--no-preview':
        o.preview = false;
        break;
      case '--metadata':
        o.metadata = fromRoot(value());
        break;
      case '--image':
        o.image = fromRoot(value());
        break;
      case '--wait':
        o.wait = Number(value());
        if (!(o.wait >= 0)) throw new Error('--wait must be a number of seconds');
        break;
      case '--verbose':
      case '-v':
        o.verbose = true;
        break;
      case '--raw-dir':
        o.rawDir = fromRoot(value());
        break;
      case '--recipes-dir':
        o.recipesDir = fromRoot(value());
        break;
      case '--preview-dir':
        o.previewDir = fromRoot(value());
        break;
      default:
        if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
        positional.push(a);
    }
  }
  if (positional.length !== 2) throw new Error('give the tileset id and the set name');
  [o.id, o.set] = positional;
  if (!UUID_RE.test(o.id)) throw new Error(`"${o.id}" is not a PixelLab tileset id (a UUID)`);
  if (!o.set.startsWith('t_')) o.set = `t_${o.set}`;
  if (!SET_RE.test(o.set)) throw new Error(`"${o.set}" is not a terrain name (t_ then a-z, 0-9, _)`);
  if ((o.metadata === null) !== (o.image === null)) throw new Error('--metadata and --image go together');
  return o;
}

// ---------------------------------------------------------------------------------------------
// Download

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** GET a URL as bytes, waiting out 423 "still generating" until `waitS` seconds have passed. */
async function download(url: string, waitS: number): Promise<Buffer> {
  const deadline = Date.now() + waitS * 1000;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'follow' });
    } catch (e) {
      throw new Error(`GET ${url} failed: ${(e as Error).message}`);
    }
    if (res.status === 423) {
      const after = Math.max(2, Math.min(60, Number(res.headers.get('retry-after')) || 10));
      if (Date.now() + after * 1000 > deadline) {
        throw new Error(`the tileset is still generating (HTTP 423) after waiting ${waitS} s: run again later or raise --wait`);
      }
      console.log(`  still generating; trying again in ${after} s`);
      await sleep(after * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status} ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

async function downloadImage(id: string, waitS: number): Promise<Buffer> {
  const urls = [`${API}/${id}/image?inline=true`, `${API}/${id}/image`];
  const errs: string[] = [];
  for (const url of urls) {
    try {
      return await download(url, waitS);
    } catch (e) {
      errs.push((e as Error).message);
      if ((e as Error).message.includes('still generating')) break;
    }
  }
  throw new Error(
    `couldn't download the sheet:\n    ${errs.join('\n    ')}\n  Download it yourself (curl -L -o sheet.png "${urls[0]}") ` +
      'and pass --image and --metadata',
  );
}

// ---------------------------------------------------------------------------------------------
// Metadata

interface MetaTile {
  id: string;
  name: string;
  corners: Record<(typeof CORNERS)[number], string>;
  box: { x: number; y: number; w: number; h: number };
}

interface Meta {
  tiles: MetaTile[];
  tileW: number;
  tileH: number;
  raw: Record<string, unknown>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v));

function parseMeta(buf: Buffer, what: string): Meta {
  let j: unknown;
  try {
    j = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new Error(`${what} is not JSON: ${(e as Error).message}`);
  }
  if (!isObj(j)) throw new Error(`${what} is not a JSON object`);
  const data = j.tileset_data;
  const list = isObj(data) ? data.tiles : undefined;
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${what} has no tileset_data.tiles list`);
  const size = isObj(j.tile_size) ? j.tile_size : isObj(data) && isObj(data.tile_size) ? data.tile_size : null;
  const tileW = size && typeof size.width === 'number' ? size.width : TILE;
  const tileH = size && typeof size.height === 'number' ? size.height : TILE;
  const tiles = list.map((t: unknown, k: number): MetaTile => {
    if (!isObj(t) || !isObj(t.corners) || !isObj(t.bounding_box)) {
      throw new Error(`${what}: tile ${k} lacks "corners" or "bounding_box"`);
    }
    const c = t.corners;
    const corner = (key: string): string => str(c[key] ?? c[key.toLowerCase()]);
    const b = t.bounding_box;
    const box = { x: b.x, y: b.y, w: b.width, h: b.height };
    if (![box.x, box.y, box.w, box.h].every((n) => Number.isInteger(n))) {
      throw new Error(`${what}: tile ${k} (${str(t.name)}) has a bounding_box that isn't whole pixels`);
    }
    return {
      id: str(t.id),
      name: str(t.name) || `#${k}`,
      corners: { NW: corner('NW'), NE: corner('NE'), SW: corner('SW'), SE: corner('SE') },
      box: box as MetaTile['box'],
    };
  });
  return { tiles, tileW, tileH, raw: j };
}

// ---------------------------------------------------------------------------------------------
// Report helpers

/** The most common colour of a tile of `sheet` and its share. */
function dominant(sheet: PNG, index: number): { hex: string; share: number } {
  const tile = crop(sheet, (index % 4) * TILE, Math.floor(index / 4) * TILE, TILE, TILE);
  const counts = new Map<string, number>();
  for (let i = 0; i < tile.data.length; i += 4) {
    if (tile.data[i + 3] === 0) continue;
    const hex = rgbToHex(tile.data[i], tile.data[i + 1], tile.data[i + 2]);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [hex, c] of counts) if (c > n) [best, n] = [hex, c];
  return { hex: best, share: n / (TILE * TILE) };
}

function recipeText(set: string, src: string, note: string, slots: { index: number; twin: number | null }[]): string {
  const b = (i: number): string => `[${bits(i).split('').join(', ')}]`;
  const lines = slots.map((s, k) => {
    const comma = k < slots.length - 1 ? ',' : '';
    return s.twin === null
      ? `        { "rect": [${(s.index % 4) * TILE}, ${Math.floor(s.index / 4) * TILE}], "corners": ${b(s.index)} }${comma}`
      : `        { "twin": ${b(s.twin)}, "corners": ${b(s.index)} }${comma}`;
  });
  return [
    '{',
    `  "batch": ${JSON.stringify(`terrain_${set}`)},`,
    `  "note": ${JSON.stringify(note)},`,
    '  "terrain": [',
    '    {',
    `      "name": ${JSON.stringify(set)},`,
    `      "src": ${JSON.stringify(src)},`,
    `      "tile": ${TILE},`,
    '      "tiles": [',
    ...lines,
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Main

async function main(argv: string[]): Promise<number> {
  let o: Options;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`tileset: ${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const stem = o.tag ? `${o.set}.${o.tag}` : o.set;
  mkdirSync(o.rawDir, { recursive: true });
  const rawPng = join(o.rawDir, `${stem}.pixellab.png`);
  const rawMeta = join(o.rawDir, `${stem}.metadata.json`);
  const sheetPath = join(o.rawDir, `${stem}.png`);
  const recipePath = join(o.recipesDir, `terrain_${o.set}.json`);

  // 1. The raw downloads, kept byte for byte.
  if (o.metadata && o.image) {
    if (resolve(o.metadata) !== resolve(rawMeta)) copyFileSync(o.metadata, rawMeta);
    if (resolve(o.image) !== resolve(rawPng)) copyFileSync(o.image, rawPng);
  } else {
    console.log(`tileset: downloading ${o.id} from ${API}/`);
    const meta = await download(`${API}/${o.id}/metadata`, o.wait);
    const image = await downloadImage(o.id, o.wait);
    writeFileSync(rawMeta, meta);
    writeFileSync(rawPng, image);
  }
  const meta = parseMeta(readFileSync(rawMeta), rel(rawMeta));
  const source = readPng(rawPng);
  const raw = meta.raw;
  const metaId = str(raw.id);
  if (metaId && metaId !== o.id) console.log(`tileset: note: the metadata is for tileset ${metaId}, not ${o.id}`);

  // 2. Every tile: 16 x 16, inside the image, corners lower/upper only.
  const problems: string[] = [];
  if (meta.tileW !== TILE || meta.tileH !== TILE) {
    problems.push(`tile_size is ${meta.tileW}x${meta.tileH}; the game's terrain tiles are 16x16: regenerate with tile_size 16`);
  }
  const transition = meta.tiles.filter((t) => CORNERS.some((c) => t.corners[c] === 'transition'));
  if (transition.length > 0) {
    problems.push(
      `${transition.length} of ${meta.tiles.length} tiles have "transition" corners (${transition.slice(0, 4).map((t) => t.name).join(', ')}` +
        `${transition.length > 4 ? ', ...' : ''}): this is the 25-tile cliff layout that transition_size above 0.25 (pro) or ` +
        `0.5 (standard) produces (transition_size here: ${str(raw.transition_size)}). The dual grid needs the 16-tile set: ` +
        'regenerate with transition_size 0 or 0.25',
    );
  }
  for (const t of meta.tiles) {
    const odd = CORNERS.filter((c) => t.corners[c] !== 'lower' && t.corners[c] !== 'upper' && t.corners[c] !== 'transition');
    if (odd.length > 0) {
      problems.push(`tile ${t.name}: corners ${odd.map((c) => `${c}="${t.corners[c]}"`).join(', ')} are not "lower" or "upper"`);
    }
    const { x, y, w, h } = t.box;
    if (w !== TILE || h !== TILE) problems.push(`tile ${t.name}: bounding_box is ${w}x${h}, not ${TILE}x${TILE}`);
    else if (x < 0 || y < 0 || x + w > source.width || y + h > source.height) {
      problems.push(`tile ${t.name}: bounding_box [${x}, ${y}, ${w}, ${h}] leaves the ${source.width}x${source.height} sheet`);
    }
  }
  if (problems.length > 0) return failed(o, problems, rawPng, rawMeta);

  // 3. Index the tiles by their corners.
  const byIndex = new Map<number, MetaTile>();
  const dupes: string[] = [];
  for (const t of meta.tiles) {
    const up = (c: (typeof CORNERS)[number]): number => (t.corners[c] === 'upper' ? 1 : 0);
    const i = up('NW') * 8 + up('NE') * 4 + up('SW') * 2 + up('SE');
    const prev = byIndex.get(i);
    if (prev) dupes.push(`index ${label(i)}: ${prev.name} and ${t.name} (kept ${prev.name})`);
    else byIndex.set(i, t);
  }
  const twinOf = new Map<number, number>();
  for (const [missing, src] of o.twins) {
    if (byIndex.has(missing)) problems.push(`--twin ${missing}=${src}: tile ${label(missing)} is there (${byIndex.get(missing)?.name}); no twin needed`);
    else if (!byIndex.has(src)) problems.push(`--twin ${missing}=${src}: the source tile ${label(src)} is missing too`);
    else if (twinOf.has(missing)) problems.push(`--twin: ${label(missing)} is given twice`);
    else twinOf.set(missing, src);
  }
  const missing = Array.from({ length: 16 }, (_, i) => i).filter((i) => !byIndex.has(i) && !twinOf.has(i));
  if (missing.length > 0) {
    problems.push(
      `only ${16 - missing.length} of the 16 corner combinations came back (${meta.tiles.length} tiles). Missing: ` +
        `${missing.map(label).join(', ')}. Regenerate, or fill a gap on purpose with --twin <missing>=<source> ` +
        '(a stand-in: it will seam wherever that combination appears, so check the mock)',
    );
  }
  if (dupes.length > 0) {
    const msg = `tiles share a corner combination: ${dupes.join('; ')}`;
    if (missing.length > 0) problems.push(msg);
    else console.log(`tileset: note: ${msg}`);
  }
  if (problems.length > 0) return failed(o, problems, rawPng, rawMeta);

  // 4. The 64 x 64 sheet in corner-index order (unquantized).
  const sheet = createPng(TILE * 4, TILE * 4);
  for (let i = 0; i < 16; i++) {
    const t = byIndex.get(i) ?? (byIndex.get(twinOf.get(i) as number) as MetaTile);
    blit(sheet, crop(source, t.box.x, t.box.y, t.box.w, t.box.h), (i % 4) * TILE, Math.floor(i / 4) * TILE);
  }
  writePng(sheetPath, sheet);

  // 5. Palette report on a quantized copy (what art:build will make of it).
  const layer = layerOfSet(o.set);
  const stats = newQuantizeStats();
  const q = quantize(clonePng(sheet), stats);
  const holes = countTransparent(sheet);
  const report: string[] = [];
  report.push(
    `palette: ${percent(stats.snapped, stats.opaque, 1)} of pixels were off Apollo, ${percent(stats.far, stats.opaque, 1)} ` +
      `(${stats.far} px) moved far (OKLab dE > ${FAR_DELTA}), furthest ${stats.maxDelta.toFixed(3)}` +
      (holes ? `; ${holes} transparent px (terrain should be opaque)` : ''),
  );
  if (layer) {
    const allowed = new Set(LAYER_PALETTES[layer]);
    const outside = new Map<string, number>();
    for (let i = 0; i < q.data.length; i += 4) {
      if (q.data[i + 3] === 0) continue;
      const hex = rgbToHex(q.data[i], q.data[i + 1], q.data[i + 2]);
      if (!allowed.has(hex)) outside.set(hex, (outside.get(hex) ?? 0) + 1);
    }
    const n = [...outside.values()].reduce((a, b) => a + b, 0);
    const top = [...outside.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    report.push(
      n === 0
        ? `layer palette ${layer}: every pixel is in it`
        : `layer palette ${layer}: ${percent(n, stats.opaque, 1)} of pixels fall outside it (${top.map(([h, c]) => `${h} ${c}`).join(', ')})`,
    );
  } else {
    report.push(`layer palette: unknown layer for ${o.set} (names look like t_l1_floor_rock)`);
  }
  const ink = hexToRgb(DARK_TINT);
  const floor = dominant(q, 0);
  const rock = dominant(q, 15);
  const cFloor = contrastRatio(hexToRgb(floor.hex), ink);
  const cRock = contrastRatio(hexToRgb(rock.hex), ink);
  const cPair = contrastRatio(hexToRgb(floor.hex), hexToRgb(rock.hex));
  report.push(
    `contrast vs ${DARK_TINT}: lower (tile 0) mostly ${floor.hex} (${percent(floor.share, 1)}) ${cFloor.toFixed(2)}:1` +
      `${cFloor < FLOOR_MIN_CONTRAST ? ` BELOW the ${FLOOR_MIN_CONTRAST}:1 floor rule (art plan issue 1)` : ''}; ` +
      `upper (tile 15) mostly ${rock.hex} (${percent(rock.share, 1)}) ${cRock.toFixed(2)}:1; lower vs upper ${cPair.toFixed(2)}:1`,
  );

  // 6. The recipe.
  const created = str(raw.created_at);
  const baseIds = isObj(raw.base_tile_ids) ? raw.base_tile_ids : {};
  const note =
    `PixelLab create_topdown_tileset ${o.id}${created ? ` (${created.slice(0, 10)})` : ''}, transition_size ${str(raw.transition_size)}` +
    `, view ${str(raw.view)}. lower: ${str(raw.lower_description)} | upper: ${str(raw.upper_description)}` +
    `${str(raw.transition_description) ? ` | transition: ${str(raw.transition_description)}` : ''}. ` +
    `Base tiles: lower ${str(baseIds.lower)}, upper ${str(baseIds.upper)}. ` +
    `Imported by scripts/art/tileset.ts on ${new Date().toISOString().slice(0, 10)}` +
    `${twinOf.size ? `; twins: ${[...twinOf].map(([m, s]) => `${m}<-${s}`).join(', ')}` : ''}.`;
  if (o.recipe) {
    const text = recipeText(
      o.set,
      rel(sheetPath),
      note,
      Array.from({ length: 16 }, (_, i) => ({ index: i, twin: twinOf.get(i) ?? null })),
    );
    JSON.parse(text); // must stay valid JSON
    mkdirSync(o.recipesDir, { recursive: true });
    writeFileSync(recipePath, text);
  }

  // 7. Preview: a seeded random cave map, lit and under the four darkness bands.
  const written = [rel(rawPng), rel(rawMeta), rel(sheetPath), ...(o.recipe ? [rel(recipePath)] : [])];
  if (o.preview) {
    const { map } = randomMapAllTiles(12, 8, 1, 0.45, '.', '#');
    const problemsPreview: string[] = [];
    const drawn = drawTerrain(map, [{ name: o.set, sheet: q, lower: '.', upper: '#' }], problemsPreview);
    const base = join(o.previewDir, stem);
    writePng(`${base}.png`, drawn.png);
    writePng(`${base}-3x.png`, scaleNearest(drawn.png, 3));
    const dark = darkBands(drawn.png);
    writePng(`${base}-bands.png`, dark);
    writePng(`${base}-bands-3x.png`, scaleNearest(dark, 3));
    written.push(`${rel(base)}.png, -3x.png, -bands.png, -bands-3x.png (random map, ${drawn.used[0].size}/16 tiles shown)`);
  }

  // Report.
  console.log(
    `tileset: ${o.set} <- PixelLab ${o.id}: ${meta.tiles.length} tiles, all 16 corner combinations` +
      `${twinOf.size ? ` (${twinOf.size} from --twin)` : ''}`,
  );
  if (o.verbose) {
    for (let i = 0; i < 16; i++) {
      const t = byIndex.get(i);
      const from = t ? `${t.name} at [${t.box.x}, ${t.box.y}]` : `twin of ${twinOf.get(i)}`;
      console.log(`  ${String(i).padStart(2)} ${bits(i)}  <- ${from}`);
    }
  }
  for (const r of report) console.log(`  ${r}`);
  console.log(`  base tile ids (chain the layer's next set with lower_base_tile_id): lower ${str(baseIds.lower)}, upper ${str(baseIds.upper)}`);
  console.log(`Wrote:\n${written.map((w) => `  ${w}`).join('\n')}`);
  if (!o.recipe) console.log('  (no recipe: --no-recipe)');
  return 0;
}

function failed(o: Options, problems: string[], rawPng: string, rawMeta: string): number {
  console.error(`tileset: ${o.set} <- PixelLab ${o.id}: can't build the dual-grid sheet; no sheet or recipe written:`);
  for (const p of problems) console.error(`  x ${p}`);
  console.error(`  (raw downloads kept: ${rel(rawPng)}, ${rel(rawMeta)})`);
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(`tileset: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  },
);
