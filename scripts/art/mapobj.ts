/**
 * Review a create_map_object result (style matching with an inpainting mask). Free, read-only on
 * the raw download.
 *
 *   node scripts/art/mapobj.ts <object.png> --rect x,y,w,h [--scene <scene.png>] [--out <prefix>]
 *                              [--scale n] [--bg <#hex>]
 *
 * <object.png> is the raw download (the whole background canvas, transparent except the object).
 * --rect is the mask rectangle in canvas pixels (the building's footprint). Prints:
 *   - the opaque box (alpha >= 128) of the whole canvas and how many opaque pixels fall outside the
 *     rect (a result that leaks out of the footprint can't be used as is),
 *   - the body size inside the rect and its margins (left, top, right, bottom),
 *   - partial-alpha pixels and the Apollo snap (share snapped, share moved far, worst dE),
 *   - how much of the rect is opaque (a result that is 100% opaque is usually ground, not an object).
 * Writes (with --out):
 *   <prefix>-obj-<n>x.png    the rect, snapped to Apollo like art:build, n x (default 4), on --bg
 *                            (default #577277, the contact-sheet grey) and on #090a14 side by side
 *   <prefix>-scene-<n>x.png  with --scene: the scene with the snapped object drawn over it (the
 *                            object canvas is assumed to be the scene's size, as PixelLab returns it)
 */
import {
  ALPHA_CUTOFF,
  blit,
  clonePng,
  createPng,
  crop,
  fromRoot,
  newQuantizeStats,
  percent,
  quantize,
  readPng,
  rel,
  scaleNearest,
  trimAlpha,
  writePng,
} from './lib.ts';

const USAGE =
  'usage: node scripts/art/mapobj.ts <object.png> --rect x,y,w,h [--scene <scene.png>] [--out <prefix>] [--scale n] [--bg #hex]';

interface Options {
  object: string;
  rect: [number, number, number, number];
  scene: string | null;
  out: string | null;
  scale: number;
  bg: string;
}

function parseArgs(argv: string[]): Options {
  let object = '';
  let rect: [number, number, number, number] | null = null;
  let scene: string | null = null;
  let out: string | null = null;
  let scale = 4;
  let bg = '#577277';
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    const value = (): string => {
      const v = argv[++k];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--rect') {
      const n = value().split(',').map(Number);
      if (n.length !== 4 || n.some((x) => !Number.isInteger(x))) throw new Error('--rect must be x,y,w,h');
      rect = [n[0], n[1], n[2], n[3]];
    } else if (a === '--scene') scene = value();
    else if (a === '--out') out = value();
    else if (a === '--scale') scale = Number(value());
    else if (a === '--bg') bg = value();
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (!object) object = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!object || !rect) throw new Error(USAGE);
  if (!Number.isInteger(scale) || scale < 1) throw new Error('--scale must be a whole number >= 1');
  return { object, rect, scene, out, scale, bg };
}

function main(): void {
  const o = parseArgs(process.argv.slice(2));
  const png = readPng(fromRoot(o.object));
  const [rx, ry, rw, rh] = o.rect;
  const all = trimAlpha(png, ALPHA_CUTOFF);
  let outside = 0;
  let inside = 0;
  let partial = 0;
  const d = png.data;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const a = d[(y * png.width + x) * 4 + 3];
      if (a !== 0 && a !== 255) partial++;
      if (a < ALPHA_CUTOFF) continue;
      if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) inside++;
      else outside++;
    }
  }
  const cut = crop(png, rx, ry, rw, rh);
  const body = trimAlpha(cut, ALPHA_CUTOFF);
  const stats = newQuantizeStats();
  const snapped = quantize(clonePng(cut), stats);
  console.log(`${rel(fromRoot(o.object))}: ${png.width}x${png.height} canvas, rect [${o.rect.join(', ')}]`);
  console.log(`  opaque box of the canvas: ${all ? `[${all.x}, ${all.y}, ${all.w}, ${all.h}]` : 'none'}`);
  console.log(`  opaque pixels: ${inside} inside the rect (${percent(inside, rw * rh)} of it), ${outside} outside`);
  if (body) {
    const right = rw - body.x - body.w;
    const bottom = rh - body.y - body.h;
    console.log(`  body ${body.w}x${body.h} at [${body.x}, ${body.y}] in the rect; margins L${body.x} T${body.y} R${right} B${bottom}`);
  } else console.log('  body: none (nothing opaque inside the rect)');
  console.log(
    `  partial alpha: ${partial} px; Apollo: ${percent(stats.snapped, stats.opaque)} snapped, ` +
      `${percent(stats.far, stats.opaque)} moved far, worst dE ${stats.maxDelta.toFixed(3)}`,
  );
  if (!o.out) return;
  const n = o.scale;
  const pad = 4;
  const sheet = createPng((rw + pad * 3) * 2 - pad, rh + pad * 2, '#151d28');
  const left = createPng(rw + pad * 2, rh + pad * 2, o.bg);
  blit(left, snapped, pad, pad);
  const right = createPng(rw + pad * 2, rh + pad * 2, '#090a14');
  blit(right, snapped, pad, pad);
  blit(sheet, left, 0, 0);
  blit(sheet, right, rw + pad * 3 - pad, 0);
  writePng(fromRoot(`${o.out}-obj-${n}x.png`), scaleNearest(sheet, n));
  console.log(`  wrote ${o.out}-obj-${n}x.png`);
  if (o.scene) {
    const scene = readPng(fromRoot(o.scene));
    const full = quantize(clonePng(png));
    const comp = clonePng(scene);
    blit(comp, full, 0, 0);
    writePng(fromRoot(`${o.out}-scene-${Math.max(2, n - 1)}x.png`), scaleNearest(comp, Math.max(2, n - 1)));
    console.log(`  wrote ${o.out}-scene-${Math.max(2, n - 1)}x.png`);
  }
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
