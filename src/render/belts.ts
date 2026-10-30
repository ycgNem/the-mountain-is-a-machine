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
// conveyor, 48 on an express. (There is no merger: belts alternate their side inputs fairly,
// DECISIONS #42.)
//
// Joins are seamless: a tile only draws a rail on a side where no lane crosses its edge. Where a
// lane runs on into the next tile (a line, a belt fed into another's side, a piece's exit) the rail
// is left out and the rails of the two lanes turn the corner into each other; where nothing runs on
// (the start or the end of a line, a curve's front included) the rail closes across the lane, so a
// line reads as finished. The express belt's chevrons keep their shape round a curve, turning with it.
// Splitter, crossing and sorter are the same lane with a low housing in the middle, so a line runs
// through them unbroken and each reads at a glance: a splitter is a 4 x 4 steel hub with bold
// #e8c170 arrowheads on its three exit arms; a sorter is a dark window in a raised steel rim showing
// its filter (the renderer draws the item in it) with an #e8c170 arrowhead toward its left exit and a
// #a8b5b2 one toward its front; a crossing is a still #394a50 plate with a steel '+' where its two
// lanes cross. Ghosts are the real tile with the rails in the ghost's colour and a bold, ink-outlined
// chevron in a belt's lane; a piece's housing takes the ghost's colour too.

import { C } from '../data/palette';
import type { Dir } from '../sim/types';

export type BeltShape = 'S' | 'L' | 'R';
type Kind = 'belt' | 'express_belt' | 'insulated_belt';

/**
 * How a tile is coloured: built steel, or a placement ghost that is valid ('ok'), blocked ('bad') or
 * waiting for goods ('planned', which is also how a planned building is drawn). A ghost keeps the real
 * lane and rungs; its rails carry the ghost's colour.
 */
export type Tint = 'steel' | 'ok' | 'bad' | 'planned';

/**
 * A tile's four sides relative to its facing, as bits of an `open` mask: an open side is one a lane
 * crosses into the next tile, a closed one carries a rail.
 */
export const SIDE_F = 1;
export const SIDE_R = 2;
export const SIDE_B = 4;
export const SIDE_L = 8;
/** A straight run: open at the back and the front, rails along both hands. */
export const STRAIGHT = SIDE_F | SIDE_B;

/** The `open` bit for absolute direction `a` on a tile facing `d`. */
export function sideBit(d: Dir, a: Dir): number {
  return 1 << ((a - d + 4) % 4);
}

/** Rung pattern period in px; one animation frame per pixel. */
export const BELT_PERIOD = 8;
export const BELT_FRAMES = 8;

/** The ghost colours (STYLE code-drawn table): what a tint's rails and chevron are drawn in. */
export const TINT_COL: Record<Exclude<Tint, 'steel'>, string> = { ok: C.lime, bad: C.coral, planned: C.blue3 };
/** The chevron's fill on each tint: light on a valid ghost, coral on a blocked one, blue on a planned one. */
const ARROW_COL: Record<Exclude<Tint, 'steel'>, string> = { ok: C.white, bad: C.coral, planned: C.cyan };

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

function frameOf(frame: number): number {
  return ((frame % BELT_FRAMES) + BELT_FRAMES) % BELT_FRAMES;
}

type Put = (u: number, v: number, col: string) => void;

/** A 16 x 16 canvas and a pen that writes canonical pixels into it for a facing. */
function tile(d: Dir): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; put: Put } {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const put: Put = (u, v, col) => {
    const [x, y] = map(d, u, v);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  return { c, ctx, put };
}

// ------------------------------------------------------------------ rails

/** The rail colours: the outer edge, the inner top and the insulated belt's stitch (every 4 px). */
interface Rails {
  edge: string;
  top: string;
  stitch: string | null;
}

/**
 * Steel rails, or the insulated belt's padding; a ghost's rails are its colour outside a dark inner
 * line, so a ghost line reads as an outline round a real belt.
 */
function railsFor(k: Kind, tint: Tint): Rails {
  if (tint !== 'steel') return { edge: TINT_COL[tint], top: C.panel, stitch: null };
  return k === 'insulated_belt' ? { edge: C.rust1, top: C.amber, stitch: C.rust1 } : { edge: C.panel, top: C.steel2, stitch: null };
}

/** Pixel classes of the rail frame. */
const LANE = 0;
const EDGE = 1;
const TOP = 2;
const NONE = 3;

/**
 * Which part of the rail frame canonical pixel (u, v) is, for a tile whose open sides are `open`
 * (SIDE_ bits). A closed side's 2 px band is its rail (outer edge, then the lit top); an open side's is
 * lane. In a corner a closed side's rail runs through to the edge when its neighbour is open (it
 * meets the rail of the lane next door); two open sides meet in an inner corner (the corner pixel
 * dark, the rest lit), where the rails of the two lanes turn into each other; two closed sides
 * round off (the corner pixel left empty).
 */
function railAt(u: number, v: number, open: number): number {
  const nL = v <= 1;
  const nR = v >= 14;
  const nB = u <= 1;
  const nF = u >= 14;
  const oL = (open & SIDE_L) !== 0;
  const oR = (open & SIDE_R) !== 0;
  const oB = (open & SIDE_B) !== 0;
  const oF = (open & SIDE_F) !== 0;
  if ((nL || nR) && (nB || nF)) {
    const yo = nL ? oL : oR;
    const yd = nL ? v : 15 - v;
    const xo = nB ? oB : oF;
    const xd = nB ? u : 15 - u;
    if (yo && xo) return yd === 0 && xd === 0 ? EDGE : TOP;
    if (!yo && xo) return yd === 0 ? EDGE : TOP;
    if (yo && !xo) return xd === 0 ? EDGE : TOP;
    if (yd === 0 && xd === 0) return NONE;
    return yd === 0 || xd === 0 ? EDGE : TOP;
  }
  if (nL) return oL ? LANE : v === 0 ? EDGE : TOP;
  if (nR) return oR ? LANE : v === 15 ? EDGE : TOP;
  if (nB) return oB ? LANE : u === 0 ? EDGE : TOP;
  if (nF) return oF ? LANE : u === 15 ? EDGE : TOP;
  return LANE;
}

/** A rail pixel's colour; `along` is its place along the rail (the insulated belt's stitch). */
function railCol(r: Rails, cls: number, along: number): string {
  if (cls === EDGE) return r.edge;
  return r.stitch && (along & 3) === 0 ? r.stitch : r.top;
}

// ------------------------------------------------------------------ the lane

/**
 * One lane pixel without its rails: `s` along the motion (0..16 over the tile), `a` across it (0..16,
 * 0 = the left rail). `w` is half the width of a 1 px line in `s` units (0.5 on a straight tile, more
 * on the inside of a curve where the arc is shorter), so rungs and bars stay 1 px lines on curves
 * too. `chevrons` false leaves out the express belt's chevrons: a curve carries its own round
 * (curveChevrons).
 */
function lanePat(k: Kind, s: number, a: number, frame: number, w = 0.5, chevrons = true): string {
  const ph = (((s - frame) % BELT_PERIOD) + BELT_PERIOD) % BELT_PERIOD;
  const on = (centre: number) => {
    const d = Math.abs(ph - centre);
    return Math.min(d, BELT_PERIOD - d) < w;
  };
  const dv = Math.abs(a - 8);
  if (k === 'express_belt') {
    if (on(0.5)) return C.blue2;
    // A '>' chevron 3 px deep over the middle 6 px of the lane (its pixels are CHEVRON).
    if (chevrons && dv < 3 && on(6 - dv)) return C.cyan;
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

/**
 * A curve pixel from its centre in lane coordinates (`a` is the radius round the inner corner): the
 * rails at either edge of the quarter ring, the lane between.
 */
function curvePx(k: Kind, r: Rails, s: number, a: number, frame: number, w: number): string {
  if (a < 1 || a >= 15) return r.edge;
  if (a < 2 || a >= 14) return railCol(r, TOP, Math.floor(s));
  return lanePat(k, s, a, frame, w, false);
}

/**
 * The express chevron's pixels on a straight tile, as (along, across) from its tip point: the two tip
 * pixels either side of the centre line, then each arm 1 and 2 px further back and out.
 */
const CHEVRON: readonly (readonly [number, number])[] = [
  [0, -0.5],
  [0, 0.5],
  [-1, -1.5],
  [-1, 1.5],
  [-2, -2.5],
  [-2, 2.5],
];

/**
 * The express belt's chevrons round a curve, as pixels u * 16 + v of the canonical 'L' curve (inner
 * corner at (16, 0)). Each is the straight tile's chevron (its tip at phase 5.5 on the centre line)
 * carried round the arc whole: every pixel keeps its radius and its distance behind the tip along
 * that radius's arc. Bending it by the lane's phase instead squeezes its inner arm into scattered
 * pixels, since the inner arc is shorter. A chevron whose tip is already in the straight beyond
 * trails its arms back into the curve as that straight draws them; one whose arms reach back into the
 * feeder leaves them to the feeder.
 */
function curveChevrons(frame: number): Set<number> {
  const out = new Set<number>();
  for (let st = ((frame + 5.5) % BELT_PERIOD) - BELT_PERIOD; st < 19; st += BELT_PERIOD) {
    for (const [ds, da] of CHEVRON) {
      const a = 8 + da;
      let x: number;
      let y: number;
      if (st <= 16) {
        const th = (st / 16) * (Math.PI / 2) + ds / a;
        if (th < 0) continue;
        x = 16 - a * Math.cos(th);
        y = a * Math.sin(th);
      } else {
        x = st + ds;
        y = a;
      }
      const u = Math.floor(x);
      const v = Math.floor(y);
      if (u >= 0 && u < 16 && v >= 0 && v < 16) out.add(u * 16 + v);
    }
  }
  return out;
}

// ------------------------------------------------------------------ the ghost's chevron

/**
 * A bold chevron pointing +u in canonical pixels: 2 px strokes, 8 rows tall with the tip on rows
 * c-1 and c, its tip's back pixel at column t, inside a 1 px #090a14 outline (so it reads on any lane
 * and floor). Fill `col`.
 */
function chevron(put: Put, t: number, c: number, col: string): void {
  const lit = new Set<number>();
  for (let k = 0; k < 4; k++) {
    for (const v of [c - 1 - k, c + k]) {
      lit.add((t - k) * 32 + v);
      lit.add((t - k + 1) * 32 + v);
    }
  }
  for (const key of lit) {
    const u = Math.floor(key / 32);
    const v = key % 32;
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) if (!lit.has((u + du) * 32 + v + dv)) put(u + du, v + dv, C.ink);
  }
  for (const key of lit) put(Math.floor(key / 32), key % 32, col);
}

// ------------------------------------------------------------------ belts

/**
 * A straight belt tile: open on the sides in `open` (a lane crosses them), railed on the rest. A belt
 * fed into from a side is open there, so the feeder's lane runs flush into it; a line's first and
 * last belts are closed behind and in front.
 */
function buildStraight(k: Kind, d: Dir, frame: number, open: number, tint: Tint, arrow: boolean): HTMLCanvasElement {
  const { c, put } = tile(d);
  const r = railsFor(k, tint);
  for (let u = 0; u < 16; u++) {
    for (let v = 0; v < 16; v++) {
      const cls = railAt(u, v, open);
      if (cls === NONE) continue;
      put(u, v, cls === LANE ? lanePat(k, u + 0.5, v + 0.5, frame) : railCol(r, cls, v <= 1 || v >= 14 ? u : v));
    }
  }
  if (arrow && tint !== 'steel') chevron(put, 9, 8, ARROW_COL[tint]);
  return c;
}

function buildCurve(k: Kind, d: Dir, shape: BeltShape, frame: number, open: number, tint: Tint, arrow: boolean): HTMLCanvasElement {
  const { c, put } = tile(d);
  const r = railsFor(k, tint);
  // Canonical facing east; 'L' comes in from the north (the left hand), 'R' from the south. A quarter
  // ring around the inner corner; the pattern runs 16 px along it like a straight tile, which is
  // also how far an item travels through it. Its rails meet a straight tile's at both edges (the
  // radius at an edge pixel's centre stands for the across coordinate there), and `s` runs from 0 at
  // the entry to 16 at the exit as a straight's does, so the feeder's rungs run on without a step.
  const mirror = shape === 'R';
  // A curve at the end of a line (nothing takes from its front) closes across its exit as a straight
  // end does: its last two columns are a straight tile's, open only on the side the lane came in by.
  const capped = (open & SIDE_F) === 0;
  const chev = k === 'express_belt' ? curveChevrons(frame) : null;
  for (let u = 0; u < 16; u++) {
    for (let v = 0; v < 16; v++) {
      const vv = mirror ? 15 - v : v;
      if (capped && u >= 14) {
        const cls = railAt(u, vv, SIDE_L);
        if (cls !== NONE) put(u, v, railCol(r, cls, vv));
        continue;
      }
      const dx = 16 - (u + 0.5);
      const dy = vv + 0.5;
      const rad = Math.hypot(dx, dy);
      if (rad >= 16) continue;
      if (chev && rad >= 2 && rad < 14 && chev.has(u * 16 + vv)) {
        put(u, v, C.cyan);
        continue;
      }
      const ang = Math.atan2(dy, dx); // ~0 at the entry edge, pi/2 at the exit edge
      const s = (ang / (Math.PI / 2)) * 16;
      put(u, v, curvePx(k, r, s, rad, frame, Math.min(1.2, 16 / (Math.PI * Math.max(rad, 1)))));
    }
  }
  // The chevron points at the exit from the lane's middle near it, inside the ring.
  if (arrow && tint !== 'steel') chevron(mirror ? (u, v, col) => put(u, 15 - v, col) : put, 11, 6, ARROW_COL[tint]);
  return c;
}

/**
 * A belt tile for a facing, shape, animation frame, open sides (SIDE_ bits: every side on a straight;
 * on a curve only the front counts, its entry being always open and its outer sides always railed)
 * and tint; `arrow` adds a ghost's chevron. Cached per variant, so a frame draws only cached tiles.
 */
export function beltTile(kind: string, d: Dir, shape: BeltShape, frame: number, open = STRAIGHT, tint: Tint = 'steel', arrow = false): HTMLCanvasElement {
  const k = kindOf(kind);
  const f = frameOf(frame);
  const o = shape === 'S' ? open & 15 : open & SIDE_F;
  const key = `${k}:${d}:${shape}:${f}:${o}:${tint}:${arrow ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) {
    c = shape === 'S' ? buildStraight(k, d, f, o, tint, arrow) : buildCurve(k, d, shape, f, o, tint, arrow);
    cache.set(key, c);
  }
  return c;
}

/**
 * The lane carried on across a tile edge into a building, up to its art: a 16 x 16 tile holding the
 * pixels of a straight belt facing `d` that lie within `depth[v]` px of the shared edge (v across the
 * lane, as the canonical tile), so the rails and rungs run on unbroken. `front`: the tile in front of
 * the belt (the lane runs into the building); else the tile behind it (the lane comes out of it).
 * Cached per depth profile.
 */
export function laneStrip(kind: string, d: Dir, frame: number, front: boolean, depth: readonly number[], tint: Tint = 'steel'): HTMLCanvasElement {
  const k = kindOf(kind);
  const f = frameOf(frame);
  const key = `strip:${k}:${d}:${f}:${front ? 1 : 0}:${tint}:${depth.join(',')}`;
  let c = cache.get(key);
  if (!c) {
    const t = tile(d);
    const r = railsFor(k, tint);
    for (let v = 0; v < 16; v++) {
      const n = depth[v] ?? 0;
      for (let i = 0; i < n; i++) {
        const u = front ? i : 15 - i;
        const cls = railAt(u, v, STRAIGHT);
        if (cls !== NONE) t.put(u, v, cls === LANE ? lanePat(k, u + 0.5, v + 0.5, f) : railCol(r, cls, u));
      }
    }
    c = t.c;
    cache.set(key, c);
  }
  return c;
}

/** The ghost's chevron alone, pointing `d` from the middle of a 16 x 16 tile, in a tint's arrow colour (or `col`). */
export function arrowTile(d: Dir, tint: Exclude<Tint, 'steel'>, col?: string): HTMLCanvasElement {
  const fill = col ?? ARROW_COL[tint];
  const key = `arrow:${d}:${fill}`;
  let c = cache.get(key);
  if (!c) {
    const t = tile(d);
    chevron(t.put, 9, 8, fill);
    c = t.c;
    cache.set(key, c);
  }
  return c;
}

// ------------------------------------------------------------------ splitter, crossing, sorter

/** Exits of each piece, as SIDE_ bits: where its arrows point and its lanes run out. */
const PIECE_EXITS: Record<string, number> = {
  splitter: SIDE_F | SIDE_L | SIDE_R,
  sorter: SIDE_F | SIDE_L,
  crossing: SIDE_F | SIDE_L | SIDE_R | SIDE_B,
};

export function isPieceKind(kind: string): boolean {
  return kind in PIECE_EXITS;
}

/** The sides a piece may open: its exits and its back (a crossing takes from any side). */
export function pieceSides(kind: string): number {
  return (PIECE_EXITS[kind] ?? 0) | SIDE_B;
}

/**
 * A lane pixel of a piece outside its housing: in the arm of the nearest open side, moving out of an
 * exit (or in at the back), with the rung phase a straight belt there would have, so the arms run on
 * into the belts beyond. A pixel nearest a closed side belongs to the main lane along the facing.
 */
function armPx(k: Kind, u: number, v: number, frame: number, open: number): string {
  const along = Math.min(u, 15 - u);
  const toL = (open & SIDE_L) !== 0 ? v : 99;
  const toR = (open & SIDE_R) !== 0 ? 15 - v : 99;
  if (toL < along && toL <= toR) return lanePat(k, 16 - (v + 0.5), u + 0.5, frame);
  if (toR < along) return lanePat(k, v + 0.5, 16 - (u + 0.5), frame);
  return lanePat(k, u + 0.5, v + 0.5, frame);
}

/**
 * An arrowhead pointing out of side `side` (SIDE_ bit), its back row `back` px in from that edge:
 * 4 px wide and 2 deep, or 6 wide and 3 deep when `big`.
 */
function arrowhead(put: Put, side: number, back: number, col: string, big = false): void {
  const rows: [number, number][] = [];
  const n = big ? 3 : 2;
  for (let k = 0; k < n; k++) for (let i = 0; i < 2 * (n - k); i++) rows.push([back - k, 8 - (n - k) + i]);
  for (const [depth, across] of rows) {
    if (side === SIDE_F) put(15 - depth, across, col);
    else if (side === SIDE_B) put(depth, across, col);
    else if (side === SIDE_L) put(across, depth, col);
    else put(across, 15 - depth, col);
  }
}

function buildPiece(kind: string, d: Dir, frame: number, open: number, tint: Tint): HTMLCanvasElement {
  const { c, ctx, put } = tile(d);
  const cross = kind === 'crossing';
  const r = railsFor('belt', tint);
  // A crossing carries both axes either way, so its lane is a still plate with no rungs (still
  // rungs would draw lines along its edges).
  for (let u = 0; u < 16; u++) {
    for (let v = 0; v < 16; v++) {
      const cls = railAt(u, v, open);
      if (cls === NONE) continue;
      put(u, v, cls === LANE ? (cross ? C.slate : armPx('belt', u, v, frame, open)) : railCol(r, cls, 0));
    }
  }
  // Housings are lit from the top left of the screen whatever the facing, so they are drawn in
  // screen pixels; the arrows after them in the piece's own frame. A ghost's housing is its colour,
  // unlit: a piece joined on every side has no rail left to carry it.
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  const ghost = tint === 'steel' ? null : TINT_COL[tint];
  if (kind === 'splitter') {
    // A low 4 x 4 hub where the lanes part (#819796, lit #a8b5b2 top left, shaded #202e37 bottom
    // right) and a bold #e8c170 arrowhead on each of the three exit arms, so where items go reads
    // whether or not a belt is joined there yet.
    px(6, 6, 4, 4, ghost ?? C.steel2);
    if (!ghost) {
      px(6, 6, 4, 1, C.steel3);
      px(6, 6, 1, 4, C.steel3);
    }
    px(6, 9, 4, 1, C.panel2);
    px(9, 6, 1, 4, C.panel2);
    for (const s of [SIDE_F, SIDE_L, SIDE_R]) arrowhead(put, s, 5, C.pale, true);
  } else if (kind === 'sorter') {
    // A dark window in a raised steel rim (lit #a8b5b2 top and left, #577277 bottom and right) for
    // the filter item, which the renderer draws in it (the item's middle 10 x 10): the rim tells a
    // setting from an item riding the belt. An #e8c170 arrowhead on the rim points to the left exit
    // that item takes, a #a8b5b2 one to the front, where everything else goes, so the facing reads.
    px(2, 2, 12, 12, ghost ?? C.steel);
    if (!ghost) {
      px(2, 2, 12, 1, C.steel3);
      px(2, 2, 1, 12, C.steel3);
    }
    px(3, 3, 10, 10, C.night);
    arrowhead(put, SIDE_L, 2, C.pale);
    arrowhead(put, SIDE_F, 2, C.steel3);
  } else if (cross) {
    // A steel '+' where the two lanes cross, 2 px wide, its arms as long as the lanes are open.
    const lit = (u: number, v: number) => put(u, v, ghost ?? C.steel2);
    for (let i = 2; i <= 13; i++) {
      if ((i < 7 && open & SIDE_B) || (i > 8 && open & SIDE_F) || (i >= 7 && i <= 8)) {
        lit(i, 7);
        lit(i, 8);
      }
      if ((i < 7 && open & SIDE_L) || (i > 8 && open & SIDE_R) || (i >= 7 && i <= 8)) {
        lit(7, i);
        lit(8, i);
      }
    }
  }
  return c;
}

/**
 * A splitter, crossing or sorter tile for a facing, belt frame, open sides (SIDE_ bits: where a
 * lane crosses its edge) and tint.
 */
export function pieceTile(kind: string, d: Dir, frame: number, open = pieceSides(kind), tint: Tint = 'steel'): HTMLCanvasElement {
  const f = kind === 'crossing' ? 0 : frameOf(frame);
  const o = open & 15;
  const key = `piece:${kind}:${d}:${f}:${o}:${tint}`;
  let c = cache.get(key);
  if (!c) {
    c = buildPiece(kind, d, f, o, tint);
    cache.set(key, c);
  }
  return c;
}
