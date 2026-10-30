/**
 * Mock scenes: terrain, belts and sprites composed into one image, to judge art at game size and
 * under the darkness, and to make create_map_object backgrounds and inpainting masks. Free.
 *
 *   node scripts/art/mock.ts --out <file> --terrain <sheet.png>[=<lower><upper...>] [options]
 *
 * Paths are relative to the project root (absolute paths work too). Writes:
 *   <out>.png, <out>-3x.png              the lit scene at 1x and 3x
 *   <out>-bands.png, <out>-bands-3x.png  with --dark: the scene in four vertical strips under the
 *                                        darkness bands 0 / 0.35 / 0.65 / 0.85 of #090a14
 *   <out>-dark.png, <out>-dark-3x.png    with --light: lamp-lit darkness, banded, Bayer-dithered
 *   <out>-mask.png                       with --mask: 8-bit grayscale, black, white inside each mask
 *                                        rect (create_map_object's convention: white = generate)
 *   <out>.background.json                with --b64: {"type":"base64","base64":...} of the lit scene
 *                                        as a palette PNG (pixel-identical to <out>.png, ~1/10 the
 *                                        base64) and {"type":"mask","mask_image":...} of the mask:
 *   <out>-mask.inpainting.json           paste the file contents as create_map_object's
 *                                        background_image and inpainting arguments
 *
 * Options
 *   --out <file>     output path; ".png" is optional
 *   --terrain <png>[=<l><u...>]   a 64x64 dual-grid sheet in corner-index order (art/raw/terrain/
 *                    <set>.png from tileset.ts, or public/art/terrain/<set>.png). After "=", the first
 *                    character is the set's lower terrain symbol, the rest count as its upper terrain
 *                    (default ".#"). Repeat for chained sets: the first draws everywhere, later ones
 *                    only where their upper terrain touches, on top, like the game:
 *                    --terrain l4_floor_rock.png=.# --terrain l4_floor_hot.png=.hm --terrain l4_hot_magma.png=hm
 *   --map <txt>      one character per cell, one line per row, symbols from --terrain. Without it, a
 *                    random cave map of the first sheet's two terrains; cells under sprites, belts
 *                    and masks are kept lower (floor)
 *   --size <W>x<H>   image size in px (default 192x128; with --map, the map's size)
 *   --seed <n>       random map seed (default 1)     --fill <0..1>  share of upper terrain (0.45)
 *   --all-tiles      use the first seed from --seed on whose random map shows all 16 tiles (a full
 *                    seam test; the seed used is printed)
 *   --sprite <src>@<cx>,<cy>[,<fw>,<fh>]   a sprite on the footprint whose top-left cell is (cx, cy).
 *                    src: <png>, <png>#x,y,w,h (a rect of it) or atlas:<name> (public/art/atlas.png).
 *                    PNG art is trimmed to its opaque pixels; the footprint defaults to the art's
 *                    size rounded up to whole cells; 1x1 is centred, larger is bottom-centred
 *   --belt <cx0>,<cy0>:<cx1>,<cy1>   a straight code-drawn conveyor (art plan colours)
 *   --dark           also write the -bands images
 *   --light <cx>,<cy>[,<r>]   a lamp at a cell, radius r cells (default 6); also writes -dark images;
 *                    --ambient <0..1> is the light away from lamps (default 0.1)
 *   --mask <x>,<y>,<w>,<h>    a white rect in px in <out>-mask.png (repeatable)
 *   --b64            also write the two .json files; --b64-rgba: the same with a plain RGBA PNG in
 *                    the background (only if PixelLab ever mishandles the palette PNG)
 *   --raw            draw sheets and sprites as they are (default: snapped to Apollo like art:build)
 *   --scale <n>      factor of the big copies (default 3)
 * Repeatable: --terrain, --sprite, --belt, --light, --mask. Problems in the scene (a symbol no sheet
 * draws, three terrains in one tile window, a crooked belt) are errors: exit code 1, nothing written.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import {
  ATLAS_JSON,
  ATLAS_PNG,
  PNG,
  createPng,
  crop,
  encodeIndexedPng,
  fillRect,
  fromRoot,
  quantize,
  readAtlasJson,
  readPng,
  rel,
  scaleNearest,
  writePng,
} from './lib.ts';
import {
  TILE,
  darkBands,
  darkLights,
  drawBelt,
  drawSprites,
  drawTerrain,
  footprintOf,
  parseMap,
  randomMap,
  randomMapAllTiles,
  trimOpaque,
} from './scene.ts';
import type { CellMap, Light, Placement, TerrainLayer } from './scene.ts';

const USAGE =
  'usage: node scripts/art/mock.ts --out <file> --terrain <sheet.png>[=<lower><upper>] [--map <txt>] [--size WxH] ' +
  '[--seed n] [--fill f] [--all-tiles] [--sprite <png>[#x,y,w,h]@cx,cy[,fw,fh]] [--belt cx0,cy0:cx1,cy1] [--dark] ' +
  '[--light cx,cy[,r]] [--ambient a] [--mask x,y,w,h] [--b64 | --b64-rgba] [--raw] [--scale n]';

interface Options {
  out: string;
  terrains: string[];
  map: string | null;
  size: [number, number] | null;
  seed: number;
  fill: number;
  allTiles: boolean;
  sprites: string[];
  belts: string[];
  dark: boolean;
  lights: string[];
  ambient: number;
  masks: string[];
  b64: boolean;
  b64Rgba: boolean;
  raw: boolean;
  scale: number;
}

function numbers(s: string, what: string, counts: number[]): number[] {
  const parts = s.split(',').map((p) => p.trim());
  const ns = parts.map(Number);
  if (!counts.includes(parts.length) || ns.some((n) => !Number.isInteger(n))) {
    throw new Error(`${what} "${s}" must be ${counts.join(' or ')} whole numbers separated by commas`);
  }
  return ns;
}

function parseArgs(argv: string[]): Options {
  const o: Options = {
    out: '',
    terrains: [],
    map: null,
    size: null,
    seed: 1,
    fill: 0.45,
    allTiles: false,
    sprites: [],
    belts: [],
    dark: false,
    lights: [],
    ambient: 0.1,
    masks: [],
    b64: false,
    b64Rgba: false,
    raw: false,
    scale: 3,
  };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    const value = (): string => {
      const v = argv[++k];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--out':
        o.out = value();
        break;
      case '--terrain':
        o.terrains.push(value());
        break;
      case '--map':
        o.map = value();
        break;
      case '--size': {
        const m = /^(\d+)x(\d+)$/i.exec(value());
        if (!m) throw new Error('--size must look like 192x128');
        o.size = [Number(m[1]), Number(m[2])];
        if (o.size[0] < 1 || o.size[1] < 1) throw new Error('--size must be at least 1x1');
        break;
      }
      case '--seed':
        o.seed = Number(value());
        if (!Number.isInteger(o.seed)) throw new Error('--seed must be a whole number');
        break;
      case '--fill':
        o.fill = Number(value());
        if (!(o.fill >= 0 && o.fill <= 1)) throw new Error('--fill must be between 0 and 1');
        break;
      case '--all-tiles':
        o.allTiles = true;
        break;
      case '--sprite':
        o.sprites.push(value());
        break;
      case '--belt':
        o.belts.push(value());
        break;
      case '--dark':
        o.dark = true;
        break;
      case '--light':
        o.lights.push(value());
        break;
      case '--ambient':
        o.ambient = Number(value());
        if (!(o.ambient >= 0 && o.ambient <= 1)) throw new Error('--ambient must be between 0 and 1');
        break;
      case '--mask':
        o.masks.push(value());
        break;
      case '--b64':
        o.b64 = true;
        break;
      case '--b64-rgba':
        o.b64 = true;
        o.b64Rgba = true;
        break;
      case '--raw':
        o.raw = true;
        break;
      case '--scale':
        o.scale = Number(value());
        if (!Number.isInteger(o.scale) || o.scale < 1 || o.scale > 16) throw new Error('--scale must be a whole number from 1 to 16');
        break;
      default:
        throw new Error(`unknown option ${a}`);
    }
  }
  if (!o.out) throw new Error('--out is required');
  if (o.terrains.length === 0) throw new Error('at least one --terrain sheet is required');
  return o;
}

/** "<png>=<symbols>" -> layer. The "=" split only applies when what follows has no path characters. */
function parseTerrain(spec: string, raw: boolean): TerrainLayer {
  let path = spec;
  let symbols = '.#';
  const eq = spec.lastIndexOf('=');
  if (eq > 0 && !/[\\/]/.test(spec.slice(eq + 1)) && !spec.slice(eq + 1).toLowerCase().endsWith('.png')) {
    path = spec.slice(0, eq);
    symbols = spec.slice(eq + 1);
  }
  const chars = [...symbols];
  if (chars.length < 2 || new Set(chars).size !== chars.length || chars.some((c) => /\s/.test(c))) {
    throw new Error(`--terrain ${spec}: after "=" give the lower symbol then the upper symbol(s), all different, e.g. =.#`);
  }
  const sheet = readPng(fromRoot(path));
  if (!raw) quantize(sheet);
  return { name: rel(fromRoot(path)), sheet, lower: chars[0], upper: chars.slice(1).join('') };
}

interface SpriteArg {
  placement: Placement;
  what: string;
}

let atlasCache: { png: PNG; sprites: Record<string, { x: number; y: number; w: number; h: number }> } | null = null;

function parseSprite(spec: string, raw: boolean): SpriteArg {
  const at = spec.lastIndexOf('@');
  if (at <= 0) throw new Error(`--sprite ${spec}: write <src>@<cx>,<cy>[,<fw>,<fh>]`);
  const src = spec.slice(0, at);
  const pos = numbers(spec.slice(at + 1), `--sprite ${spec}: the cell`, [2, 4]);
  let img: PNG;
  if (src.startsWith('atlas:')) {
    const name = src.slice('atlas:'.length);
    if (!atlasCache) {
      const json = readAtlasJson();
      if (!json) throw new Error(`--sprite ${spec}: ${rel(ATLAS_JSON)} doesn't exist (npm run art:build makes it)`);
      atlasCache = { png: readPng(ATLAS_PNG), sprites: json.sprites };
    }
    const r = atlasCache.sprites[name];
    if (!r) throw new Error(`--sprite ${spec}: "${name}" is not in ${rel(ATLAS_JSON)}`);
    img = crop(atlasCache.png, r.x, r.y, r.w, r.h); // already on its canvas: placed as the game does
  } else {
    const hash = src.lastIndexOf('#');
    const path = hash > 0 ? src.slice(0, hash) : src;
    img = readPng(fromRoot(path));
    if (hash > 0) {
      const [x, y, w, h] = numbers(src.slice(hash + 1), `--sprite ${spec}: the rect`, [4]);
      img = crop(img, x, y, w, h);
    }
    img = trimOpaque(img, `--sprite ${spec}`);
    if (!raw) quantize(img);
  }
  const [fw, fh] = pos.length === 4 ? [pos[2], pos[3]] : footprintOf(img.width, img.height);
  if (fw < 1 || fh < 1) throw new Error(`--sprite ${spec}: the footprint must be at least 1x1`);
  return { placement: { img, cx: pos[0], cy: pos[1], fw, fh }, what: spec };
}

function parseBelt(spec: string): [number, number, number, number] {
  const m = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*:\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(spec);
  if (!m) throw new Error(`--belt ${spec}: write <cx0>,<cy0>:<cx1>,<cy1>`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

function outBase(out: string): string {
  const p = fromRoot(out);
  return p.toLowerCase().endsWith('.png') ? p.slice(0, -4) : p;
}

function main(argv: string[]): number {
  let o: Options;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`mock: ${(e as Error).message}\n${USAGE}`);
    return 2;
  }

  const layers = o.terrains.map((t) => parseTerrain(t, o.raw));
  const sprites = o.sprites.map((s) => parseSprite(s, o.raw));
  const belts = o.belts.map(parseBelt);
  const masks = o.masks.map((m) => numbers(m, `--mask ${m}`, [4]));
  const lights: Light[] = o.lights.map((l) => {
    const n = numbers(l, `--light ${l}`, [2, 3]);
    return { x: n[0], y: n[1], r: n.length === 3 ? n[2] : 6 };
  });

  // The cell map.
  let map: CellMap;
  let W: number;
  let H: number;
  if (o.map) {
    map = parseMap(readFileSync(fromRoot(o.map), 'utf8'), rel(fromRoot(o.map)));
    W = map.cols * TILE;
    H = map.rows * TILE;
    if (o.size && (o.size[0] !== W || o.size[1] !== H)) {
      throw new Error(`--size ${o.size[0]}x${o.size[1]} doesn't match the map: ${map.cols}x${map.rows} cells = ${W}x${H} px`);
    }
  } else {
    [W, H] = o.size ?? [192, 128];
    const cols = Math.ceil(W / TILE);
    const rows = Math.ceil(H / TILE);
    const keep = new Set<number>();
    const keepRect = (x0: number, y0: number, x1: number, y1: number): void => {
      for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) keep.add(y * cols + x);
    };
    for (const { placement: p } of sprites) keepRect(p.cx, p.cy, p.cx + p.fw - 1, p.cy + p.fh - 1);
    for (const [x0, y0, x1, y1] of belts) keepRect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
    for (const [x, y, w, h] of masks) keepRect(Math.floor(x / TILE), Math.floor(y / TILE), Math.floor((x + w - 1) / TILE), Math.floor((y + h - 1) / TILE));
    const first = layers[0];
    const keepLower = (x: number, y: number): boolean => keep.has(y * cols + x);
    if (o.allTiles) {
      const found = randomMapAllTiles(cols, rows, o.seed, o.fill, first.lower, first.upper[0], keepLower);
      if (!found.complete) console.log(`mock: note: no seed from ${o.seed} to ${o.seed + 499} shows all 16 tiles here; using ${o.seed}`);
      else if (found.seed !== o.seed) console.log(`mock: --all-tiles: seed ${found.seed} is the first from ${o.seed} to show all 16 tiles`);
      map = found.map;
      o.seed = found.seed;
    } else {
      map = randomMap(cols, rows, o.seed, o.fill, first.lower, first.upper[0], keepLower);
    }
  }
  for (const [x, y, w, h] of masks) {
    if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > W || y + h > H) {
      throw new Error(`--mask ${x},${y},${w},${h} reaches outside the ${W}x${H} scene`);
    }
  }

  // Draw.
  const problems: string[] = [];
  const drawn = drawTerrain(map, layers, problems);
  for (const [x0, y0, x1, y1] of belts) drawBelt(drawn.png, x0, y0, x1, y1);
  for (const s of sprites) {
    const p = s.placement;
    if (p.cx < 0 || p.cy < 0 || p.cx + p.fw > map.cols || p.cy + p.fh > map.rows) {
      console.log(`mock: note: --sprite ${s.what} reaches outside the ${map.cols}x${map.rows} cell map (clipped)`);
    }
  }
  drawSprites(
    drawn.png,
    sprites.map((s) => s.placement),
  );
  if (problems.length > 0) {
    console.error(`mock: ${problems.length} tile window(s) have no art; nothing written:`);
    for (const p of problems.slice(0, 10)) console.error(`  x ${p}`);
    if (problems.length > 10) console.error(`  ... and ${problems.length - 10} more`);
    return 1;
  }
  const scene = drawn.png.width === W && drawn.png.height === H ? drawn.png : crop(drawn.png, 0, 0, W, H);

  // Write.
  const base = outBase(o.out);
  const written: string[] = [];
  const write = (suffix: string, png: PNG): string => {
    const path = `${base}${suffix}.png`;
    writePng(path, png);
    written.push(`${rel(path)} (${png.width}x${png.height})`);
    return path;
  };
  write('', scene);
  write(`-${o.scale}x`, scaleNearest(scene, o.scale));
  if (o.dark) {
    const dark = darkBands(scene);
    write('-bands', dark);
    write(`-bands-${o.scale}x`, scaleNearest(dark, o.scale));
  }
  if (lights.length > 0) {
    const dark = darkLights(scene, map.cols, map.rows, lights, o.ambient);
    write('-dark', dark);
    write(`-dark-${o.scale}x`, scaleNearest(dark, o.scale));
  }
  let maskPath: string | null = null;
  if (masks.length > 0) {
    const mask = createPng(W, H, '#000000');
    for (const [x, y, w, h] of masks) fillRect(mask, x, y, w, h, '#ffffff');
    // 8-bit grayscale, no alpha or palette: 0 = keep, 255 = generate, nothing else to misread.
    maskPath = `${base}-mask.png`;
    mkdirSync(dirname(maskPath), { recursive: true });
    writeFileSync(maskPath, PNG.sync.write(mask, { colorType: 0 }));
    written.push(`${rel(maskPath)} (${W}x${H}, grayscale)`);
  }
  if (o.b64) {
    // The scene as a palette PNG (pixel-identical to <out>.png, a fraction of the base64), unless
    // --b64-rgba asks for the plain RGBA file.
    const indexed = o.b64Rgba ? null : encodeIndexedPng(scene);
    const bytes = indexed ?? PNG.sync.write(scene, { colorType: 6 });
    const bg = `${base}.background.json`;
    const b64 = bytes.toString('base64');
    writeFileSync(bg, JSON.stringify({ type: 'base64', base64: b64 }));
    written.push(`${rel(bg)} (background_image: ${indexed ? 'palette' : 'RGBA'} PNG, ${b64.length} base64 chars)`);
    if (maskPath) {
      const inp = `${base}-mask.inpainting.json`;
      const m64 = readFileSync(maskPath).toString('base64');
      writeFileSync(inp, JSON.stringify({ type: 'mask', mask_image: m64 }));
      written.push(`${rel(inp)} (inpainting: ${m64.length} base64 chars)`);
    }
  }

  // Report.
  const limit = masks.length > 0 ? 192 : 400;
  if (o.b64 || masks.length > 0) {
    if (W < 32 || H < 32 || W > limit || H > limit) {
      console.log(`mock: note: create_map_object takes 32-${limit} px per side ${masks.length > 0 ? 'when inpainting' : ''}; this scene is ${W}x${H}`);
    }
  }
  const usage = layers
    .map((l, k) => {
      const used = drawn.used[k];
      const missing = Array.from({ length: 16 }, (_, i) => i).filter((i) => !used.has(i) && !(k > 0 && i === 0));
      return `${basename(l.name)} '${l.lower}'/'${l.upper}': ${used.size} tiles used${missing.length ? ` (not shown: ${missing.join(' ')})` : ''}`;
    })
    .join('; ');
  console.log(
    `mock: ${W}x${H} px, ${map.cols}x${map.rows} cells (${o.map ? `map ${o.map}` : `random, seed ${o.seed}, fill ${o.fill}`}), ` +
      `${sprites.length} sprite(s), ${belts.length} belt(s)${o.raw ? ', raw colours' : ', snapped to Apollo'}\n  ${usage}\nWrote:\n` +
      written.map((w) => `  ${w}`).join('\n'),
  );
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`mock: ${(e as Error).message}`);
  process.exitCode = 1;
}
