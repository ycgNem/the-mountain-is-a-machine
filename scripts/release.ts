// Package dist/ as an itch.io-ready zip: index.html at the root, relative paths (vite base './').
//
//   npm run release        build, then write release/the-mountain-is-a-machine-v<version>.zip
//
// The zip is written by hand (deflate from node:zlib, CRC from zlib.crc32) so there is no extra
// dependency and it works the same on every OS.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(ROOT, 'release');

interface Entry {
  name: string;
  data: Buffer;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (f.startsWith('.')) continue; // .gitkeep and friends
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** DOS date and time for the zip headers (fixed, so the same build gives the same zip). */
function dosStamp(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function zip(entries: Entry[], stamp: Date): Buffer {
  const { time, date } = dosStamp(stamp);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const packed = deflateRawSync(e.data, { level: 9 });
    const stored = packed.length >= e.data.length;
    const body = stored ? e.data : packed;
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

function main(): number {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('release: dist/index.html is missing; run npm run build first (npm run release does both)');
    return 1;
  }
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  if (/(src|href)="\/(?!\/)/.test(html)) {
    console.error('release: dist/index.html uses absolute paths; itch.io needs base "./" in vite.config.ts');
    return 1;
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name: string; version: string };
  const files = walk(DIST);
  const entries = files.map((p) => ({ name: relative(DIST, p).split(sep).join('/'), data: readFileSync(p) }));
  const newest = new Date(Math.max(...files.map((p) => statSync(p).mtimeMs)));
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `${pkg.name}-v${pkg.version}.zip`);
  const buf = zip(entries, newest);
  writeFileSync(out, buf);
  const raw = entries.reduce((n, e) => n + e.data.length, 0);
  console.log(`release: ${relative(ROOT, out)} (${entries.length} files, ${(raw / 1024).toFixed(0)} kB -> ${(buf.length / 1024).toFixed(0)} kB)`);
  console.log('Upload it to itch.io as an HTML game ("This file will be played in the browser"), viewport 1280x720 or larger, fullscreen button on.');
  return 0;
}

process.exit(main());
