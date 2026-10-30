// Code-drawn conveyors (STYLE code-drawn table, art review issue 5).
//
// Conveyor: a 12 px #394a50 lane with #577277 rungs between steel rails, each a 1 px #151d28 outer
// edge and a 1 px #819796 lit top. Each rung bows forward into a blunt '>' (2 px deep), so a still
// belt shows which way it runs. The dark edge reads on light floors and the lit top on dark ones,
// so a belt never sinks into its floor: the #394a50 lane is the Alien Strata's conduit fill and close
// to the Magma basalt, the Crystal navy and the Fungal violet. Express belt: #3c5e8b rungs and
// #73bed3 chevrons. Insulated belt: padded #884b2b/#be772b rails around the same 12 px lane. Items
// keep their 12 x 12 art inside the lane. The rung pattern repeats every 8 px and is drawn as eight
// 1 px frames. The frame is the whole number of pixels the belt has run, and the renderer places
// items on belts from the same number (lockstepPx), so rungs and items move together: 24 px/s on a
// conveyor, 48 on an express. Splitter, crossing and sorter are the same lane under an #819796
// housing with #e8c170 arrows on their exits. (There is no merger: belts alternate their side inputs
// fairly, DECISIONS #42.)

import { C } from '../data/palette';
import type { Dir } from '../sim/types';

export type BeltShape = 'S' | 'L' | 'R';
type Kind = 'belt' | 'express_belt' | 'insulated_belt';

/** Rung pattern period in px; one animation frame per pixel. */
export const BELT_PERIOD = 8;
export const BELT_FRAMES = 8;

/**
 * How far a belt running at `speed` tiles/s has moved after `tick` sim ticks, in fifths of a pixel
 * (16 px per tile, 60 ticks per second). Exact integers for 1.5 and 3 tiles/s.
 */
export function beltRun5(tick: number, speed: number): number {
  return Math.round((tick * speed * 4) / 3);
}

/** The animation frame (0..7) of every belt of this speed at this tick. */
export function beltFrame(tick: number, speed: number): number {
  const px = Math.floor(beltRun5(tick, speed) / 5);
  return ((px % BELT_FRAMES) + BELT_FRAMES) % BELT_FRAMES;
}

/**
 * Whole pixels (0..16) an item has travelled along its 16 px path through a slot, stepping on the
 * same ticks as the belt pattern. While the item moves freely, (belt run - item run) is constant,
 * so this changes exactly when floor(belt run) does; an item stopped at the end of its tile stays put.
 */
export function lockstepPx(tick: number, speed: number, prog: number): number {
  const d5 = beltRun5(tick, speed);
  const s5 = Math.round(Math.max(0, Math.min(1, prog)) * 80);
  return Math.floor(d5 / 5) - Math.floor((d5 - s5) / 5);
}

const cache = new Map<string, HTMLCanvasElement>();

/** Map canonical (u along motion, v across, facing east) to the tile pixel for a facing. */
function map(d: Dir, u: number, v: number): [number, number] {
  switch (d) {
    case 1:
      return [u, v];
    case 2:
      return [15 - v, u];
    case 3:
      return [15 - u, 15 - v];
    default:
      return [v, 15 - u];
  }
}

function kindOf(kind: string): Kind {
  return kind === 'express_belt' || kind === 'insulated_belt' ? kind : 'belt';
}

/**
 * One lane pixel, from its centre in lane coordinates: `s` along the motion (0..16 over the tile),
 * `a` across it (0..16, 0 = the left rail). `w` is half the width of a 1 px line in `s` units
 * (0.5 on a straight tile, more on the inside of a curve where the arc is shorter), so rungs and
 * chevrons stay 1 px lines on curves too.
 */
function lanePx(k: Kind, s: number, a: number, frame: number, w = 0.5): string {
  if (a < 1 || a >= 15) return k === 'insulated_belt' ? C.rust1 : C.panel;
  if (a < 2 || a >= 14) {
    // Padded rail: brass quilting with a stitch every 4 px (the rails stand still).
    if (k === 'insulated_belt') return (Math.floor(s) & 3) === 0 ? C.rust1 : C.amber;
    // Steel rail: the lit top inside the dark edge.
    return C.steel2;
  }
  const ph = (((s - frame) % BELT_PERIOD) + BELT_PERIOD) % BELT_PERIOD;
  const on = (centre: number) => {
    const d = Math.abs(ph - centre);
    return Math.min(d, BELT_PERIOD - d) < w;
  };
  const dv = Math.abs(a - 8);
  if (k === 'express_belt') {
    if (on(0.5)) return C.blue2;
    // A '>' chevron 3 px deep over the middle 6 px of the lane.
    if (dv < 3 && on(6 - dv)) return C.cyan;
    return C.slate;
  }
  // Rungs bow forward into a blunt '>' (1 px over the middle 6 px of the lane, 2 px over its middle
  // 4), so a still belt shows its direction; the express belt's chevron stays its own.
  if (on(0.5 + bow(dv))) return C.steel;
  return C.slate;
}

/** How far a conveyor rung bows forward at `dv` px from the lane's centre line. */
function bow(dv: number): number {
  return dv < 2 ? 2 : dv < 3 ? 1 : 0;
}

function build(kind: Kind, d: Dir, shape: BeltShape, frame: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const put = (u: number, v: number, col: string) => {
    const [x, y] = map(d, u, v);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  if (shape === 'S') {
    for (let u = 0; u < 16; u++) for (let v = 0; v < 16; v++) put(u, v, lanePx(kind, u + 0.5, v + 0.5, frame));
    return c;
  }
  // Curves: canonical facing east; 'L' comes in from the north (the left hand), 'R' from the south.
  // A quarter ring around the inner corner; the pattern runs 16 px along it like a straight tile,
  // which is also how far an item travels through it. (The lane is symmetric across, so the
  // radius can stand for the across coordinate on both hands.)
  const mirror = shape === 'R';
  for (let u = 0; u < 16; u++) {
    for (let v = 0; v < 16; v++) {
      const vv = mirror ? 15 - v : v;
      const dx = 16 - (u + 0.5);
      const dy = vv + 0.5;
      const r = Math.hypot(dx, dy);
      if (r >= 16) continue;
      const ang = Math.atan2(dy, dx); // ~0 at the entry edge, pi/2 at the exit edge
      const s = (ang / (Math.PI / 2)) * 16;
      put(u, v, lanePx(kind, s, r, frame, Math.min(1.2, 16 / (Math.PI * Math.max(r, 1)))));
    }
  }
  return c;
}

export function beltTile(kind: string, d: Dir, shape: BeltShape, frame: number): HTMLCanvasElement {
  const k = kindOf(kind);
  const f = ((frame % BELT_FRAMES) + BELT_FRAMES) % BELT_FRAMES;
  const key = `${k}:${d}:${shape}:${f}`;
  let c = cache.get(key);
  if (!c) {
    c = build(k, d, shape, f);
    cache.set(key, c);
  }
  return c;
}

// ------------------------------------------------------------------ splitter, crossing, sorter

/** Exits that get an arrow, in canonical directions (E = front, N = left, S = right). */
const PIECE_EXITS: Record<string, ('E' | 'N' | 'S' | 'W')[]> = {
  splitter: ['E', 'N', 'S'],
  sorter: ['E', 'N'],
  crossing: ['E', 'N', 'S', 'W'],
};

/** Open sides where a lane runs through the housing. */
const PIECE_OPEN: Record<string, ('E' | 'N' | 'S' | 'W')[]> = {
  splitter: ['E', 'N', 'S', 'W'],
  sorter: ['E', 'N', 'W'],
  crossing: ['E', 'N', 'S', 'W'],
};

export function isPieceKind(kind: string): boolean {
  return kind in PIECE_EXITS;
}

function buildPiece(kind: string, d: Dir, frame: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const put = (u: number, v: number, col: string) => {
    const [x, y] = map(d, u, v);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  const open = new Set(PIECE_OPEN[kind] ?? []);
  const cross = kind === 'crossing';
  // The lane, moving along the facing (a crossing carries both axes, so its surface stands still).
  for (let u = 0; u < 16; u++) {
    for (let v = 0; v < 16; v++) {
      let col = lanePx('belt', u + 0.5, v + 0.5, cross ? 0 : frame);
      if (cross && col === C.steel) col = C.slate;
      // Side openings cut through the rails (edge and lit top).
      const mid = (n: number) => n >= 3 && n <= 12;
      if (v <= 1 && mid(u) && open.has('N')) col = C.slate;
      if (v >= 14 && mid(u) && open.has('S')) col = C.slate;
      put(u, v, col);
    }
  }
  // Housing: a steel block in each corner (lit top-left, shadow bottom-right) ...
  const block = (u0: number, v0: number, w: number, h: number) => {
    for (let u = u0; u < u0 + w; u++) {
      for (let v = v0; v < v0 + h; v++) {
        let col: string = C.steel2;
        if (u === u0 || v === v0) col = C.steel3;
        if (u === u0 + w - 1 || v === v0 + h - 1) col = C.steel;
        put(u, v, col);
      }
    }
  };
  block(0, 0, 3, 3);
  block(13, 0, 3, 3);
  block(0, 13, 3, 3);
  block(13, 13, 3, 3);
  // ... and a solid wall on any closed side.
  if (!open.has('N')) block(0, 0, 16, 3);
  if (!open.has('S')) block(0, 13, 16, 3);
  // Arrows on the exits, at the very edge so a sorter's filter icon never covers them.
  for (const e of PIECE_EXITS[kind] ?? []) {
    const px: [number, number][] =
      e === 'E'
        ? [[14, 6], [14, 7], [14, 8], [14, 9], [15, 7], [15, 8]]
        : e === 'W'
          ? [[1, 6], [1, 7], [1, 8], [1, 9], [0, 7], [0, 8]]
          : e === 'N'
            ? [[6, 1], [7, 1], [8, 1], [9, 1], [7, 0], [8, 0]]
            : [[6, 14], [7, 14], [8, 14], [9, 14], [7, 15], [8, 15]];
    for (const [u, v] of px) put(u, v, C.pale);
  }
  return c;
}

/** A splitter, crossing or sorter tile for a facing and belt frame. */
export function pieceTile(kind: string, d: Dir, frame: number): HTMLCanvasElement {
  const f = kind === 'crossing' ? 0 : ((frame % BELT_FRAMES) + BELT_FRAMES) % BELT_FRAMES;
  const key = `piece:${kind}:${d}:${f}`;
  let c = cache.get(key);
  if (!c) {
    c = buildPiece(kind, d, f);
    cache.set(key, c);
  }
  return c;
}
