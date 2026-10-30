/**
 * Stretch a sprite vertically by repeating whole rows: a free, replayable hand edit that deepens a
 * south face (a flat-looking slab becomes a block) without resampling anything. Raw files stay
 * untouched; the result is a new PNG.
 *
 *   node scripts/art/stretch.ts <in.png> --out <out.png> --dup <y>:<n> [--dup <y>:<n> ...]
 *                               [--rect x,y,w,h]
 *
 * --rect     cut this rectangle of <in.png> first (default: the whole image); row numbers in --dup
 *            are in <in.png> coordinates either way
 * --dup y:n  insert n extra copies of source row y directly below it (repeatable; each row once)
 * Every output row is a copy of one source row, pixel for pixel, so the palette never changes.
 * Prints the output size and the source row of each output row.
 */
import { createPng, crop, fromRoot, readPng, rel, writePng } from './lib.ts';

const USAGE = 'usage: node scripts/art/stretch.ts <in.png> --out <out.png> --dup <y>:<n> [--dup <y>:<n> ...] [--rect x,y,w,h]';

function main(): void {
  const argv = process.argv.slice(2);
  let input = '';
  let out = '';
  let rect: number[] | null = null;
  const dups = new Map<number, number>();
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    const value = (): string => {
      const v = argv[++k];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--out') out = value();
    else if (a === '--rect') {
      rect = value().split(',').map(Number);
      if (rect.length !== 4 || rect.some((n) => !Number.isInteger(n))) throw new Error('--rect must be x,y,w,h');
    } else if (a === '--dup') {
      const m = /^(\d+):(\d+)$/.exec(value());
      if (!m) throw new Error('--dup must be <row>:<count>');
      const y = Number(m[1]);
      if (dups.has(y)) throw new Error(`row ${y} is given twice`);
      dups.set(y, Number(m[2]));
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (!input) input = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!input || !out || dups.size === 0) throw new Error(USAGE);
  const src = readPng(fromRoot(input));
  const [rx, ry, rw, rh] = rect ?? [0, 0, src.width, src.height];
  const cut = crop(src, rx, ry, rw, rh);
  for (const y of dups.keys()) {
    if (y < ry || y >= ry + rh) throw new Error(`row ${y} is outside the cut rows ${ry}..${ry + rh - 1}`);
  }
  const rows: number[] = [];
  for (let y = ry; y < ry + rh; y++) {
    rows.push(y);
    for (let i = 0; i < (dups.get(y) ?? 0); i++) rows.push(y);
  }
  const dst = createPng(rw, rows.length);
  rows.forEach((sy, dy) => {
    const s = (sy - ry) * rw * 4;
    cut.data.copy(dst.data, dy * rw * 4, s, s + rw * 4);
  });
  writePng(fromRoot(out), dst);
  console.log(`${rel(fromRoot(input))} [${rx}, ${ry}, ${rw}, ${rh}] -> ${out}: ${rw}x${rows.length}`);
  console.log(`  source rows: ${rows.join(' ')}`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
