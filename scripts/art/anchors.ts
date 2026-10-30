/**
 * Style anchors for anchored re-rolls (art plan: I2, G2, M2, M3): render approved sprites exactly as
 * art:build places them (cut rect, trim, scale, put on the "size" canvas by "fit", snap to Apollo)
 * and write them as PNGs plus a ready-to-paste style_images list. Free (no PixelLab calls).
 *
 *   node scripts/art/anchors.ts --out <dir> [--recipes <dir>] <sprite name> [<sprite name> ...]
 *
 * Reads every art/recipes/*.json (or --recipes <dir>) in natural filename order; a later entry with
 * the same name wins, like art:build. Writes
 *   <dir>/<name>.png            each anchor at its finished sprite size (RGBA)
 *   <dir>/style_images.json     [{"base64": ..., "format": "png"}, ...] in the order given, each an
 *                               8-bit palette PNG (pixel-identical, a fraction of the base64)
 * All anchors must share one canvas size: create_1_direction_object takes its output size from the
 * largest style image, so a smaller anchor would shrink the whole job (art plan issue 3: pad anchors
 * to the target canvas). Exit code 1 on any problem, nothing written.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  RECIPES_DIR,
  blit,
  clonePng,
  createPng,
  crop,
  encodeIndexedPng,
  fromRoot,
  naturalCompare,
  quantize,
  readPng,
  rel,
  scaleNearest,
  trimAlpha,
  writePng,
} from './lib.ts';
import type { PNG } from './lib.ts';

const USAGE = 'usage: node scripts/art/anchors.ts --out <dir> [--recipes <dir>] <sprite name> [<sprite name> ...]';

interface Spec {
  name: string;
  src: string;
  rect: [number, number, number, number] | null;
  size: [number, number];
  fit: 'center' | 'bottom';
  trim: boolean;
  scale: number;
  recipe: string;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ints = (v: unknown, n: number): number[] | null =>
  Array.isArray(v) && v.length === n && v.every((x) => Number.isInteger(x)) ? (v as number[]) : null;

/** The sprite specs of every recipe, by name (later recipes and entries win, as in art:build). */
function readSpecs(dir: string): Map<string, Spec> {
  const specs = new Map<string, Spec>();
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort(naturalCompare);
  for (const file of files) {
    const recipe: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (!isObj(recipe) || !Array.isArray(recipe.sprites)) continue;
    for (const v of recipe.sprites) {
      if (!isObj(v) || typeof v.name !== 'string' || typeof v.src !== 'string') continue;
      const size = ints(v.size, 2);
      if (!size) continue;
      const rect = ints(v.rect, 4);
      const fit: 'center' | 'bottom' =
        v.fit === 'bottom' || v.fit === 'center' ? v.fit : size[0] >= 32 && size[1] >= 32 ? 'bottom' : 'center';
      specs.set(v.name, {
        name: v.name,
        src: v.src,
        rect: rect ? [rect[0], rect[1], rect[2], rect[3]] : null,
        size: [size[0], size[1]],
        fit,
        trim: typeof v.trim === 'boolean' ? v.trim : true,
        scale: Number.isInteger(v.scale) ? (v.scale as number) : 1,
        recipe: file,
      });
    }
  }
  return specs;
}

/** The finished sprite, placed like build.ts buildSprite (without its size checks). */
function render(s: Spec): PNG {
  const src = readPng(fromRoot(s.src));
  let img = s.rect ? crop(src, ...s.rect) : clonePng(src);
  const box = trimAlpha(img);
  if (!box) throw new Error(`${s.name}: ${s.src} has no opaque pixels`);
  if (s.trim) img = crop(img, box.x, box.y, box.w, box.h);
  if (s.scale > 1) img = scaleNearest(img, s.scale);
  const [W, H] = s.size;
  if (img.width > W || img.height > H) throw new Error(`${s.name}: art ${img.width}x${img.height} is bigger than its ${W}x${H} canvas`);
  const out = createPng(W, H);
  const dx = Math.floor((W - img.width) / 2);
  const dy = s.fit === 'bottom' ? H - img.height : Math.floor((H - img.height) / 2);
  blit(out, img, dx, dy);
  return quantize(out);
}

function main(argv: string[]): void {
  let out = '';
  let recipes = RECIPES_DIR;
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '--recipes') {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value\n${USAGE}`);
      if (a === '--out') out = fromRoot(v);
      else recipes = fromRoot(v);
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}\n${USAGE}`);
    else names.push(a);
  }
  if (!out || names.length === 0) throw new Error(USAGE);
  const specs = readSpecs(recipes);
  const missing = names.filter((n) => !specs.has(n));
  if (missing.length) throw new Error(`not in any recipe in ${rel(recipes)}: ${missing.join(', ')}`);
  const list = names.map((n) => specs.get(n) as Spec);
  const sizes = new Set(list.map((s) => `${s.size[0]}x${s.size[1]}`));
  if (sizes.size > 1) throw new Error(`anchors must share one canvas size, got ${[...sizes].join(', ')}`);
  const rendered = list.map((s) => ({ spec: s, png: render(s) }));
  mkdirSync(out, { recursive: true });
  const images: { base64: string; format: 'png' }[] = [];
  for (const { spec, png } of rendered) {
    writePng(join(out, `${spec.name}.png`), png);
    const indexed = encodeIndexedPng(png);
    if (!indexed) throw new Error(`${spec.name}: more than 256 colours after snapping (cannot happen with Apollo)`);
    images.push({ base64: indexed.toString('base64'), format: 'png' });
    console.log(`${spec.name.padEnd(24)} ${spec.size[0]}x${spec.size[1]} from ${spec.src} (${spec.recipe}), ${indexed.length} bytes`);
  }
  writeFileSync(join(out, 'style_images.json'), JSON.stringify(images));
  console.log(`wrote ${rendered.length} anchors and style_images.json to ${rel(out)}`);
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
