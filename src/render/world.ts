// Draws one layer of the mountain into a game-resolution buffer (1 px = 1 game pixel).
// The app scales the buffer to the screen by a whole number.
//
// Order: terrain (cached) -> ground (foundations, conduits, deposits, decor up to a tile tall) ->
// belts and logistics pieces -> shadows -> everything that stands, back to front by the row it
// stands on (taller decor, building bodies with their chutes, items on belts) -> particles ->
// darkness -> emissive (awake conduit glass, its veins through the rock, working machines' light
// spots) -> overlays (spores, heat, interference: above the darkness so they read in unlit ground)
// -> survey markers, beacons (bore site; the Heart and sleeping Engine Nodes while the Governor is
// open), status icons (jammed stations and belts too), selection and port brackets -> the
// tutorial's guide frames and a hold-to-remove sweep -> placement ghosts.
//
// Belts join seamlessly (belts.ts): each belt and piece looks at its neighbours, with the sim's own
// rules for what feeds what (pushes, takes), to choose its curve and which sides a lane crosses, and
// a lane that runs into a building, or out of its chute, is carried on to the building's art.
// Planned buildings and placement ghosts take part, so a line shows its joins before it is built.
//
// The ending sequence (src/app/ending.ts) dresses a layer through RenderOpts.ending: the dawn sky over
// the Surface's north edge (before the terrain) and its warm dither on the ground (after the ground
// pass), the last of the night over the Surface (where the darkness would go), light spreading from
// the shaft under the darkness (drawDarkness's lift) and the Heart's waking rings (above it). Its
// climb also takes the rock between two layers from riseBand.

import { BUILDINGS } from '../data/buildings';
import { ITEMS } from '../data/items';
import { AMBER_SPRITE, ENGINE_NODES, HEART, LAYERS } from '../data/layers';
import { C, hexToRgb } from '../data/palette';
import { PROJECTS } from '../data/progression';
import { recipesFor } from '../data/recipes';
import { INTERFERENCE_GAP, isInterferer } from '../sim/env';
import type { Game } from '../sim/game';
import { isSlot, outputPort, sidePort } from '../sim/logistics';
import { AMBER_DECOR, ORE_LIST } from '../sim/mapgen';
import { jamFresh } from '../sim/production';
import { nodeAwake } from '../sim/progress';
import { hash2 } from '../sim/rng';
import { DX, DY, leftOf, newBuilding, opp, rightOf, T_FLOOR, T_HARD, T_MAGMA, T_WATER, type Building, type Dir, type LayerState } from '../sim/types';
import { sprite, spriteAnchor, spriteBox, spriteChuteEdges, spriteLights, type Sprite } from './atlas';
import { arrowTile, beltFrame, beltTile, isPieceKind, laneStrip, lockstepPx, pieceSides, pieceTile, sideBit, SIDE_B, SIDE_F, SIDE_L, SIDE_R, TINT_COL, type BeltShape, type Tint } from './belts';
import { statusIcon } from './icons';
import { Particles } from './particles';
import { conduitArt, conduitGlass, dormantCopy, terrainCanvas, TERRAIN_PAL, TILE } from './terrain';

export interface View {
  layer: number;
  /** Top-left of the buffer in world pixels (whole numbers). */
  camX: number;
  camY: number;
  /** Buffer size in game pixels. */
  w: number;
  h: number;
}

export interface GhostPiece {
  type: string;
  x: number;
  y: number;
  dir: Dir;
  ok: boolean;
  planned: boolean;
  /** A drag leaves what stands here (Game.planDrag's skip): nothing is drawn, and the joins see what stands. */
  skip?: boolean;
}

/** A tile rect on the shown layer, in tiles. */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How the ending sequence (src/app/ending.ts) dresses a layer it shows. Presentation only: the
 * renderer reads the game as always and writes nothing back.
 */
export interface EndingLook {
  /**
   * Light that spreads from the shaft (or the Heart) as the sequence reaches a layer: revealed tiles
   * within `r` world px of (x, y) are lit to at least `level` (0..1, as the light map) under the
   * darkness. Unrevealed tiles stay solid.
   */
  lift?: { x: number; y: number; r: number; level: number };
  /** The Heart's waking rings, 0..1 (drawn when the Heart is on this layer). */
  heart?: number;
  /** Dawn on the Surface, 0..1: a sky above the map's north edge and a warm dither on the ground. */
  dawn?: number;
  /** How far the sun has come up over the north edge, 0..1. */
  sun?: number;
  /** The last of the night over the Surface before the dawn lifts it, 0..1: a #172038 tint. */
  night?: number;
}

export interface RenderOpts {
  time: number;
  ghosts: GhostPiece[];
  selected: number | null;
  hovered: number | null;
  hoverCell: { x: number; y: number } | null;
  rect: { x0: number; y0: number; x1: number; y1: number; kind: 'dig' | 'remove' } | null;
  mode: string;
  overlays: { spores: boolean; heat: boolean; interference: boolean };
  particles: Particles;
  reveal: number;
  /** The ending sequence's dressing for this layer, while it plays (and the dawn until the card goes). */
  ending?: EndingLook;
  /**
   * Tile rects on the shown layer the tutorial points at (put a Miner here, belt into the Terminal):
   * each gets a pulsing bracket frame and a bobbing arrow, above the darkness and everything built.
   */
  guides?: TileRect[];
  /**
   * The building the player is holding the right button on to remove it (its footprint in tiles) and
   * how far the hold has come (0..1): a coral sweep over the footprint.
   */
  removeHold?: (TileRect & { frac: number }) | null;
}

/**
 * Ghost colours (STYLE code-drawn table, belts.ts TINT_COL): valid, blocked, planned. A ghost keeps
 * its sprite or belt tile readable: the colour is in the sprite's dark line work and a 1 px outline
 * round it (a blocked one also gets a dither of it), or in a belt's rails and a piece's housing, with
 * a bold chevron for the way the belt runs or the output leaves.
 */
const GHOST_PLANNED = TINT_COL.planned;
/** How fast a ghost belt's rungs run, in px per real second: a conveyor's 24 px/s. */
const GHOST_PX_PER_S = 24;
/**
 * How far a lane is carried past a tile edge into a building to meet its art (px). Art that stands
 * further in than this leaves the lane at the footprint's edge.
 */
const STRIP_MAX = 12;
/** The longest run of crossings in a row the joins follow back to what feeds it (wider than any layer). */
const CROSSING_RUN = 128;

/** What a cell holds as the joins see it: a building (built or planned) or a placement ghost. */
type Stand = Building | GhostPiece;

/** A sprite's opaque pixels (alpha 128 or more), read back once per sprite. */
interface Mask {
  s: Sprite;
  w: number;
  h: number;
  a: Uint8Array;
}

/**
 * The interference overlay (PLAN §5.10, STYLE Effects), all 1 px lines:
 * RING, dotted: how far a machine's interference reaches, INTERFERENCE_GAP tiles out from its
 * footprint, while it is hovered, selected or the placement ghost (whatever the overlay toggle says).
 * SHIELD, dotted: the rectangle spanning a pair whose interference a Shield Wall inside it blocks.
 * ARC, jagged: live interference between machines, and the machines feeding a Resonance Tap, whose
 * arcs carry one ARC_HI pixel toward the tap.
 */
const RING = C.rose;
const SHIELD = C.steel3;
const ARC = C.ice;
const ARC_HI = C.white;
/** Rings show once the player has reached the layer whose hazard is interference (before that no machine can be slowed by it). */
const INTERFERENCE_LAYER = LAYERS.findIndex((l) => l.hazard === 'interference');

/** The next brighter colour on a light spot's own ramp, for the core pixel of its glow. */
const HOTTER: Record<string, string> = {
  [C.red]: C.coral,
  [C.coral]: C.orange,
  [C.orange]: C.pale,
  [C.amber]: C.gold,
  [C.gold]: C.pale,
  [C.pale]: C.white,
  [C.blue3]: C.cyan,
  [C.cyan]: C.ice,
  [C.ice]: C.white,
  [C.pink]: C.rose,
  [C.rose]: C.white,
  [C.lime]: C.sage,
  [C.sage]: C.white,
};

const FRONT_OUT = new Map<string, boolean>();
const SIDE_OUT = new Map<string, boolean>();
const RINGED = new Map<string, boolean>();

/**
 * Does this building type push items out of its front, so it gets a front chute (and its placement
 * ghost a port bracket)? Machines do when any of their recipes has a front output (the Thermal
 * Extractor's has none: its slag leaves by the side); miners and collectors push what they extract,
 * elevator stations their arrivals and Engine Nodes their Heartstones. Generators only burn fuel,
 * and nothing else pushes items (logistics.ts pushOutputs). Built sprites, planned ghosts and
 * placement ghosts all ask this, so they agree.
 */
function frontOutput(type: string): boolean {
  let v = FRONT_OUT.get(type);
  if (v === undefined) {
    const k = BUILDINGS[type]?.kind;
    v = k === 'machine' ? recipesFor(type).some((r) => Object.keys(r.outputs).length > 0) : k === 'miner' || k === 'collector' || k === 'elevator' || k === 'engine_node';
    FRONT_OUT.set(type, v);
  }
  return v;
}

/** Does it push a byproduct out of its left side (Separator, Thermal Extractor; an Engine Node returns a wrong item there)? */
function sideOutput(type: string): boolean {
  let v = SIDE_OUT.get(type);
  if (v === undefined) {
    const k = BUILDINGS[type]?.kind;
    v = k === 'machine' ? recipesFor(type).some((r) => !!r.side && Object.keys(r.side).length > 0) : k === 'engine_node';
    SIDE_OUT.set(type, v);
  }
  return v;
}

/**
 * Does this type take part in interference, so hovering, selecting or placing one shows its ring?
 * Sensitive crystal machines, Resonance Taps (the ring is what they collect from) and every type
 * that interferes while it works (env.ts isInterferer, asked of a working stand-in).
 */
function ringed(type: string): boolean {
  let v = RINGED.get(type);
  if (v === undefined) {
    const def = BUILDINGS[type];
    const probe = newBuilding(-1, type, 0, 0, 0, 0);
    probe.active = true;
    v = !!def && (!!def.sensitive || def.kind === 'tap' || isInterferer(probe));
    RINGED.set(type, v);
  }
  return v;
}

/** The sprite for map decor value `v`: LAYERS[layer].decor[v - 1], or the Shallows bore site's amber. */
function decorSprite(layer: number, v: number): string | null {
  if (v === AMBER_DECOR) return AMBER_SPRITE;
  return LAYERS[layer]?.decor[v - 1] ?? null;
}

/** The row a building stands on (its footprint's bottom row), which the back-to-front pass sorts by. */
function baseRow(b: Building): number {
  return b.y + BUILDINGS[b.type].size - 1;
}

// ------------------------------------------------------------------ darkness stamps

/** Tint alpha per band (art review issue 9); unrevealed tiles are fully dark. */
const DARK_ALPHA = [0, 0.35, 0.65, 0.85];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Stamp index for an unrevealed tile. */
const DARK_SOLID = 256;

/** Light at a tile corner -> band 0 (lit) .. 3 (darkest revealed). Ambient light (0.26-0.36) is band 2. */
function lightBand(l: number): number {
  return l >= 0.7 ? 0 : l >= 0.45 ? 1 : l >= 0.2 ? 2 : 3;
}

let stampSheet: HTMLCanvasElement | null = null;

/**
 * All 4^4 corner-band combinations as 16x16 tint stamps (plus one solid stamp), in a 16-column
 * sheet. Inside a stamp the corner bands are interpolated per pixel and quantized with a 4x4 Bayer
 * matrix; stamps sit on 16 px tile boundaries, so the dither is anchored to the world and never
 * crawls when the camera pans.
 */
function darkStamps(): HTMLCanvasElement {
  if (stampSheet) return stampSheet;
  const c = document.createElement('canvas');
  c.width = 16 * TILE;
  c.height = 17 * TILE;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  const [r, g, b] = hexToRgb(C.ink);
  const A = DARK_ALPHA.map((a) => Math.round(a * 255));
  for (let s = 0; s <= DARK_SOLID; s++) {
    const ox = (s % 16) * TILE;
    const oy = Math.floor(s / 16) * TILE;
    const c00 = (s >> 6) & 3;
    const c10 = (s >> 4) & 3;
    const c01 = (s >> 2) & 3;
    const c11 = s & 3;
    for (let j = 0; j < TILE; j++) {
      for (let i = 0; i < TILE; i++) {
        let a = 255;
        if (s !== DARK_SOLID) {
          const fx = (i + 0.5) / TILE;
          const fy = (j + 0.5) / TILE;
          const beta = (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy;
          a = A[Math.min(3, Math.floor(beta + (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16))];
        }
        const p = ((oy + j) * c.width + ox + i) * 4;
        img.data[p] = r;
        img.data[p + 1] = g;
        img.data[p + 2] = b;
        img.data[p + 3] = a;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  stampSheet = c;
  return c;
}

/**
 * Output chute, 6x4 px, drawn for a facing (canonical: pointing north, row 0 outermost): an arrowhead
 * drawn in 2 px strokes, its 2 px tip standing proud of the body, then 4 and 6 px rows, then two
 * 2 px barbs either side of a 2 px notch, so the facing reads at the default zoom.
 */
const CHUTE_ROWS = ['DDAADD', 'DAAAAD', 'AAAAAA', 'AADDAA'];

/**
 * The elevator cab's pit on the code-drawn station, in sprite pixels: filled black, the cab drawn over
 * all of it. Atlas art brings its own pit (the recipe's `pit` anchor, spriteAnchor).
 */
const CODE_PIT = { x: 16, y: 14, w: 16, h: 18 };

// ------------------------------------------------------------------ the ending's dawn and climb

/**
 * The dawn sky above the Surface's north edge (the map's top row is the horizon), from the horizon
 * up: cream at the edge through gold, orange and coral to magenta, purple, violet and indigo, then
 * the night (ink) it pushes back. Each step is a solid band with a short ordered dither into the next.
 */
const DAWN_SKY = [C.cream, C.pale, C.gold, C.orange, C.coral, C.magenta, C.purple, C.violet, C.indigo, C.ink];
/** How far up the glow reaches at full dawn (world px over the horizon). */
const DAWN_SKY_H = 96;
/** The sun's radius (world px) and where it comes up: a little east of the old Drill site. */
const SUN_R = 9;
const SUN_X = 40 * 16 + 8;
/**
 * Dawn's warm dither on the Surface's ground: #e8c170 pixels in a world-anchored 4x4 Bayer order, this
 * many in 16 at the horizon, thinning to the second figure DAWN_FALL world px further south.
 */
const DAWN_DITHER = [3, 1];
const DAWN_FALL = 320;
/** The night's #172038 tint over the Surface before the dawn lifts it (alpha at its darkest). */
const NIGHT_ALPHA = 0.55;
/**
 * The darkness caches kept at once: the ending's climb draws two layers a frame and warms the next
 * one ahead of it (WorldRenderer.warm).
 */
const DARK_CACHES = 3;

interface DarkCache {
  c: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stamp: Uint16Array;
  used: number;
}

export class WorldRenderer {
  buf: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private shadowCache = new Map<string, HTMLCanvasElement>();
  /** Ghost looks of sprites (ghostSprite), per sprite name and tint; rebuilt if the sprite changes (the atlas loading). */
  private ghostCache = new Map<string, { s: Sprite; c: HTMLCanvasElement }>();
  /** Opaque pixels per sprite name (mask), and the art's depth behind a footprint edge (artDepth). */
  private masks = new Map<string, { s: Sprite; m: Mask | null }>();
  private depths = new Map<string, { s: Sprite; d: number[] | null }>();
  /** This frame's placement ghosts by cell (every cell of a footprint) on `ghostLayer`, for the joins. */
  private ghostAt = new Map<number, GhostPiece>();
  private ghostLayer = -1;
  /** A world-anchored 50% #cf573c checker for the hold-to-remove sweep. */
  private removeFill: CanvasPattern | null = null;
  private chuteCache = new Map<string, HTMLCanvasElement>();
  private patternCache = new Map<string, HTMLCanvasElement>();
  private lastEmit = 0;
  /** Visible tiles holding decor taller than a tile, in row order (found by drawGround, drawn standing). */
  private tallDecor: number[] = [];
  /** Scratch list of item boxes for the emissive pass (reused, so no allocation per frame). */
  private holes: number[] = [];
  /** Scratch list of the awake conduit cells the rock hides, drawn as veins by the emissive pass. */
  private veins: number[] = [];
  /** A scratch tile where the emissive pass cuts items and chute tips out of a conduit's glass. */
  private glass: HTMLCanvasElement;
  private gctx: CanvasRenderingContext2D;
  // Darkness: a tint canvas the size of the layer, patched tile by tile when a stamp changes; one per
  // layer for the last DARK_CACHES layers drawn, so the ending's climb can draw two layers a frame.
  private darks = new Map<number, DarkCache>();
  private darkUse = 0;
  private corners = new Uint8Array(0);
  /** The ending: the rock between two layers as the camera rises (riseBand), and the dawn sky's pixels. */
  private band: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private rock: HTMLCanvasElement | null = null;
  private rockKey = '';
  private sky: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private dawnPatterns: (CanvasPattern | null)[] = [];

  constructor() {
    this.buf = document.createElement('canvas');
    this.ctx = this.buf.getContext('2d')!;
    this.glass = document.createElement('canvas');
    this.glass.width = TILE;
    this.glass.height = TILE;
    this.gctx = this.glass.getContext('2d')!;
    this.band = document.createElement('canvas');
    this.bctx = this.band.getContext('2d')!;
    this.sky = document.createElement('canvas');
    this.sctx = this.sky.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    if (this.buf.width !== w || this.buf.height !== h) {
      this.buf.width = w;
      this.buf.height = h;
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  render(g: Game, v: View, o: RenderOpts): HTMLCanvasElement {
    this.resize(v.w, v.h);
    const ctx = this.ctx;
    const L = g.layer(v.layer);
    const def = LAYERS[v.layer];
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, v.w, v.h);
    ctx.setTransform(1, 0, 0, 1, -v.camX, -v.camY);

    const x0 = Math.max(0, Math.floor(v.camX / TILE) - 1);
    const y0 = Math.max(0, Math.floor(v.camY / TILE) - 1);
    const x1 = Math.min(L.w - 1, Math.ceil((v.camX + v.w) / TILE) + 1);
    const y1 = Math.min(L.h - 1, Math.ceil((v.camY + v.h) / TILE) + 1);

    // The ending's dawn: the sky over the north edge (outside the map, where the ink is), and later a
    // warm dither on the ground under everything that stands.
    const look = o.ending;
    const dawn = look?.dawn && def.ambient >= 1 ? look.dawn : 0;
    if (dawn > 0) this.drawSky(L, v, dawn, look?.sun ?? 0);

    // Terrain (cached).
    this.blitWorld(terrainCanvas(L), v);

    // The placement ghosts by cell, so belts beside them show the joins they would make.
    this.ghostAt.clear();
    this.ghostLayer = v.layer;
    for (const gh of o.ghosts) {
      const size = BUILDINGS[gh.type]?.size ?? 0;
      if (gh.skip) continue;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const x = gh.x + dx;
          const y = gh.y + dy;
          if (x >= 0 && y >= 0 && x < L.w && y < L.h) this.ghostAt.set(y * L.w + x, gh);
        }
      }
    }

    this.drawGround(g, v, o, x0, y0, x1, y1);
    if (dawn > 0) this.drawDawnGround(L, v, dawn);
    const blds = this.visibleBuildings(g, v, x0, y0, x1, y1);
    this.drawBuildings(g, v, o, blds);
    this.emitParticles(g, v, o, blds);
    this.drawParticles(v, o);
    if (def.ambient < 1) this.drawDarkness(g, v, look?.lift);
    else if (look?.night) this.drawNight(L, v, look.night);
    this.drawEmissive(g, v, o, x0, y0, x1, y1, blds);
    this.drawOverlays(g, v, o, x0, y0, x1, y1, blds);
    if (look?.heart) this.drawHeartWake(g, v, o.time, look.heart);
    this.drawAboveDark(g, v, o, x0, y0, x1, y1, blds);
    if (o.guides?.length) this.drawGuides(o.guides, o.time);
    if (o.removeHold) this.drawRemoveHold(o.removeHold, o.time);
    this.drawGhosts(g, v, o);
    this.ghostAt.clear();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return this.buf;
  }

  /** Draw the visible part of a layer-sized canvas (world pixel = canvas pixel). */
  private blitWorld(c: HTMLCanvasElement, v: View): void {
    const sx = Math.max(0, v.camX);
    const sy = Math.max(0, v.camY);
    const sw = Math.min(c.width - sx, v.camX + v.w - sx);
    const sh = Math.min(c.height - sy, v.camY + v.h - sy);
    if (sw > 0 && sh > 0) this.ctx.drawImage(c, sx, sy, sw, sh, sx, sy, sw, sh);
  }

  // ------------------------------------------------------------ ground: foundations, conduits, deposits, decor

  private drawGround(g: Game, v: View, o: RenderOpts, x0: number, y0: number, x1: number, y1: number): void {
    const ctx = this.ctx;
    const L = g.layer(v.layer);
    const conduitSheet = conduitArt(v.layer);
    const tall = this.tallDecor;
    tall.length = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * L.w + x;
        if (!L.revealed[i] || L.terrain[i] !== T_FLOOR) continue;
        const px = x * TILE;
        const py = y * TILE;
        if (L.foundation[i]) {
          const s = sprite('b_foundation');
          if (s) ctx.drawImage(s.img, s.x, s.y, s.w, s.h, px, py, 16, 16);
        }
        // Conduit channels (the glass of awake ones is drawn again above the darkness). The ending
        // wakes every conduit in the sim; `ended` only covers saves from before it did.
        if (L.conduit[i] && !conduitSheet) this.drawConduit(ctx, L, x, y, o.time, L.conduitLive[i] === 1 || g.s.ended, false);
        const ore = L.ore[i];
        if (ore) {
          this.drawDeposit(L, x, y, ore);
          continue;
        }
        const dk = L.decor[i];
        if (dk && L.occ[i] < 0 && !L.foundation[i] && !L.conduit[i]) {
          // Decor never glows (art review issue 10). It stands bottom-centred on its tile. A prop
          // bigger than its tile is left out where it would reach anything built (decorFits), so
          // it never covers a building; a prop up to a tile tall lies in this pass, a taller one
          // (32 x 32) stands in the back-to-front pass, in front of what lies behind it.
          const name = decorSprite(v.layer, dk);
          const s = name ? sprite(name) : null;
          if (!name || !s || ((s.w > TILE || s.h > TILE) && !this.decorFits(L, x, y, name, s))) continue;
          if (s.h > TILE) tall.push(i);
          else ctx.drawImage(s.img, s.x, s.y, s.w, s.h, px + 8 - (s.w >> 1), py + TILE - s.h, s.w, s.h);
        }
      }
    }
  }

  /**
   * A deposit tile: half-buried chunks on its ore bed (terrain), one of the ore's three decals. The
   * decal differs from the base pick of the same ore's tiles west and north of it (stepping on at
   * most twice), so a patch never repeats one decal along a row or column, and it shifts a seeded
   * +-3 px, but never toward a side whose neighbour isn't ore, so it stays on its bed (review 3 A14).
   * A pure function of the tile, so nothing changes as the camera pans.
   */
  private drawDeposit(L: LayerState, x: number, y: number, ore: number): void {
    const oreAt = (xx: number, yy: number): number => {
      if (xx < 0 || yy < 0 || xx >= L.w || yy >= L.h) return 0;
      const j = yy * L.w + xx;
      return L.terrain[j] === T_FLOOR ? L.ore[j] : 0;
    };
    const base = (xx: number, yy: number): number => 1 + Math.floor(hash2(xx, yy, 5) * 3);
    const west = oreAt(x - 1, y) === ore ? base(x - 1, y) : 0;
    const north = oreAt(x, y - 1) === ore ? base(x, y - 1) : 0;
    let v = base(x, y);
    for (let k = 0; k < 2 && (v === west || v === north); k++) v = (v % 3) + 1;
    const s = sprite(`d_${ORE_LIST[ore - 1]}_${v}`);
    if (!s) return;
    let ox = Math.floor(hash2(x, y, 41) * 7) - 3;
    let oy = Math.floor(hash2(x, y, 43) * 7) - 3;
    if (ox > 0 ? !oreAt(x + 1, y) : ox < 0 && !oreAt(x - 1, y)) ox = 0;
    if (oy > 0 ? !oreAt(x, y + 1) : oy < 0 && !oreAt(x, y - 1)) oy = 0;
    this.ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x * TILE + ox, y * TILE + oy, 16, 16);
  }

  /**
   * May the prop `name` (sprite `s`) stand on tile (x, y)? Drawn bottom-centred, a prop bigger than
   * its tile reaches into its neighbours (a 32 x 32 one 8 px each side and a tile upward). It is
   * left out when its visible pixels reach any other tile that holds a building or a planned ghost,
   * or that isn't open floor: unrevealed, not floor, a Foundation or a conduit channel (whose awake
   * glass shines above everything). So dressing never covers what the player builds, and never
   * hangs over rock, water, magma or the dark.
   */
  private decorFits(L: LayerState, x: number, y: number, name: string, s: Sprite): boolean {
    const box = spriteBox(name);
    if (!box) return true;
    const left = x * TILE + 8 - (s.w >> 1) + box.x;
    const top = y * TILE + TILE - s.h + box.y;
    const tx0 = Math.floor(left / TILE);
    const tx1 = Math.floor((left + box.w - 1) / TILE);
    const ty0 = Math.floor(top / TILE);
    const ty1 = Math.floor((top + box.h - 1) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tx === x && ty === y) continue;
        if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return false;
        const j = ty * L.w + tx;
        if (L.occ[j] >= 0 || !L.revealed[j] || L.terrain[j] !== T_FLOOR || L.foundation[j] || L.conduit[j]) return false;
      }
    }
    return true;
  }

  /**
   * A glass channel cut into the floor, drawn into `ctx` in world pixels. Awake conduits glow with
   * a pulse running along them; dormant ones are dark, unlit glass. `coreOnly` draws just the lit
   * glass (the emissive pass).
   */
  private drawConduit(ctx: CanvasRenderingContext2D, L: { w: number; h: number; conduit: Uint8Array }, x: number, y: number, t: number, live: boolean, coreOnly: boolean): void {
    const px = x * TILE;
    const py = y * TILE;
    const has = (dx: number, dy: number) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < L.w && ny < L.h && L.conduit[ny * L.w + nx] === 1;
    };
    const runH = has(1, 0) || has(-1, 0);
    const runV = has(0, 1) || has(0, -1);
    const span = (a: boolean, b: boolean): [number, number] => [a ? 0 : 4, (a ? 0 : 4) + (a && b ? 16 : a || b ? 12 : 8)];
    const [hx0, hx1] = span(has(-1, 0), has(1, 0));
    const [vy0, vy1] = span(has(0, -1), has(0, 1));
    // Channel walls (8 px), then the glass (4 px) and a 1 px highlight.
    const band = (inset: number, width: number, col: string) => {
      ctx.fillStyle = col;
      if (runH || !runV) ctx.fillRect(px + hx0, py + 4 + inset, hx1 - hx0, width);
      if (runV) ctx.fillRect(px + 4 + inset, py + vy0, width, vy1 - vy0);
    };
    if (live) {
      const pulse = (Math.floor(t * 8) - x - y) & 7;
      if (!coreOnly) {
        band(0, 8, C.ink);
        band(1, 6, C.pine);
      }
      band(2, 4, pulse === 0 ? C.white : pulse === 1 ? C.ice : C.cyan);
      band(2, 1, C.ice);
    } else if (!coreOnly) {
      band(0, 8, C.night);
      band(1, 6, C.panel);
      band(2, 4, C.navy);
      band(2, 1, C.blue1);
    }
  }

  /**
   * Light that shines through the darkness: the glass of awake conduits, except under anything that
   * stands on it (the building, belt or ghost covers the glass, and so do its items, and the chutes
   * standing 1 px proud of a building next to it), veins where the rock still hides awake conduit
   * (drawVeins), and the light spots of working machines. The ending wakes every conduit in the sim
   * (progress.ts), so the terrain cache and this pass already see them; `ended` only covers saves
   * from before that.
   */
  private drawEmissive(g: Game, v: View, o: RenderOpts, x0: number, y0: number, x1: number, y1: number, blds: Building[]): void {
    const ctx = this.ctx;
    const L = g.layer(v.layer);
    const all = g.s.ended;
    const sheet = conduitArt(v.layer);
    const holes = this.holes;
    const veins = this.veins;
    veins.length = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * L.w + x;
        if (!L.conduit[i] || L.occ[i] >= 0 || (!all && L.conduitLive[i] !== 1)) continue;
        if (!L.revealed[i] || L.terrain[i] !== T_FLOOR) {
          veins.push(i);
          continue;
        }
        // An item waiting at the end of a belt hangs into this tile, and a chute stands 1 px proud
        // of its building into it: the glass stays under both.
        holes.length = 0;
        this.overhangs(g, L, x, y, holes);
        const edges = this.standingEdges(g, L, x, y);
        if (!holes.length && !edges) {
          this.drawGlass(ctx, L, x, y, o.time, sheet);
          continue;
        }
        // Cut out on a scratch tile with destination-out, so overlapping cut-outs (two items
        // hanging into one corner) stay cut instead of cancelling the way an even-odd clip does.
        const px = x * TILE;
        const py = y * TILE;
        const gc = this.gctx;
        gc.setTransform(1, 0, 0, 1, 0, 0);
        gc.clearRect(0, 0, TILE, TILE);
        gc.setTransform(1, 0, 0, 1, -px, -py);
        this.drawGlass(gc, L, x, y, o.time, sheet);
        gc.globalCompositeOperation = 'destination-out';
        gc.fillStyle = C.ink;
        for (let k = 0; k < holes.length; k += 2) gc.fillRect(holes[k] + 1, holes[k + 1] + 1, 14, 14);
        // 1 px back from every edge a standing building touches.
        if (edges & 1) gc.fillRect(px, py, TILE, 1);
        if (edges & 2) gc.fillRect(px + TILE - 1, py, 1, TILE);
        if (edges & 4) gc.fillRect(px, py + TILE - 1, TILE, 1);
        if (edges & 8) gc.fillRect(px, py, 1, TILE);
        gc.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.glass, px, py);
      }
    }
    if (veins.length) this.drawVeins(L, veins, o.time, all, sheet);
    this.drawLightSpots(g, o, blds);
  }

  /**
   * Awake conduit the rock still hides, in unrevealed cells and under rock: a dim 2 px glass vein
   * through the dark, from each cell's centre to every awake conduit beside it (into the lit channel
   * where the cave opens), breathing on the beacons' 1.67 s beat. So a node's waking runs visibly
   * through the mountain and the lit lines point at what they reach. Never over a cell anything
   * stands in (machines in an unrevealed cavern still occupy theirs: drawEmissive skips them).
   */
  private drawVeins(L: LayerState, cells: number[], t: number, all: boolean, sheet: boolean): void {
    const ctx = this.ctx;
    // How far past the shared edge an arm toward (x, y) runs: -1, no arm (not awake conduit); 0, to
    // the edge; 8, on across the half of a lit channel cell the sheet leaves bare beside rock (its
    // channel tiles stop at the vertices that touch it), so the vein meets the glass.
    const reach = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= L.w || y >= L.h) return -1;
      const j = y * L.w + x;
      if (L.conduit[j] !== 1 || (!all && L.conduitLive[j] !== 1)) return -1;
      return sheet && L.revealed[j] && L.terrain[j] === T_FLOOR && L.occ[j] < 0 ? 8 : 0;
    };
    // The vein runs where the channel's glass does, so it meets the lit channel where the cave
    // opens: the sheet's glass band is the top (or left) 7 px of a conduit cell, the code-drawn
    // channel's glass its middle.
    const c = sheet ? 3 : 7;
    const k = (t * 0.6) % 1;
    const draw = (col: string, inset: number): void => {
      ctx.fillStyle = col;
      const a = c + inset;
      const w = 2 - inset;
      const far = TILE - c - 2;
      for (const i of cells) {
        const x = i % L.w;
        const y = (i / L.w) | 0;
        const px = x * TILE;
        const py = y * TILE;
        // The 2 px core, then an arm to (or across) the edge of each awake neighbour.
        ctx.fillRect(px + a, py + a, w, w);
        let r = reach(x, y - 1);
        if (r >= 0) ctx.fillRect(px + a, py - r, w, a + r);
        r = reach(x, y + 1);
        if (r >= 0) ctx.fillRect(px + a, py + c + 2, w, far + r);
        r = reach(x - 1, y);
        if (r >= 0) ctx.fillRect(px - r, py + a, a + r, w);
        r = reach(x + 1, y);
        if (r >= 0) ctx.fillRect(px + c + 2, py + a, far + r, w);
      }
    };
    // A 2 px #73bed3 vein with a 1 px #a4dddb core line on its lower right side.
    ctx.globalAlpha = 0.3 + 0.25 * (1 - k);
    draw(C.cyan, 0);
    ctx.globalAlpha = 0.25 + 0.3 * (1 - k);
    draw(C.ice, 1);
    ctx.globalAlpha = 1;
  }

  /**
   * The lit glass of an awake conduit tile, in world pixels: with the sheet, the tile's own glass
   * pixels (conduitGlass, cached with the terrain) under the running light; else the code-drawn glass.
   */
  private drawGlass(ctx: CanvasRenderingContext2D, L: LayerState, x: number, y: number, t: number, sheet: boolean): void {
    if (sheet) {
      const glass = conduitGlass(L.index);
      if (glass) ctx.drawImage(glass, x * TILE, y * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      this.drawConduitPulse(ctx, x, y, t);
    } else this.drawConduit(ctx, L, x, y, t, true, true);
  }

  /**
   * The sides of tile (x, y) whose neighbour holds a standing building, built or planned (bit `1 << d`
   * for direction d): its chutes stand 1 px proud into this tile. Belts and pieces lie flat.
   */
  private standingEdges(g: Game, L: LayerState, x: number, y: number): number {
    let m = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const id = L.occ[ny * L.w + nx];
      const b = id >= 0 ? g.b(id) : undefined;
      if (b && !this.isFlat(b.type)) m |= 1 << d;
    }
    return m;
  }

  /** Boxes (x, y pairs) of items on neighbouring belts or pieces that hang into tile (x, y). */
  private overhangs(g: Game, L: LayerState, x: number, y: number, out: number[]): void {
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const id = L.occ[ny * L.w + nx];
      const b = id >= 0 ? g.b(id) : undefined;
      if (!b || b.planned) continue;
      for (let k = 0; k < 2; k++) {
        if (!(k ? b.item2 : b.item)) continue;
        const p = this.itemXY(g, b, k === 1);
        // The opaque art keeps a 1 px margin in its 16 px box (14 px on its long axis at most).
        if (p.x + 15 > x * TILE && p.x + 1 < (x + 1) * TILE && p.y + 15 > y * TILE && p.y + 1 < (y + 1) * TILE) out.push(p.x, p.y);
      }
    }
  }

  /** Is this building lit up right now, so its light spot glows? */
  private lit(g: Game, b: Building): boolean {
    if (b.planned || b.paused) return false;
    switch (BUILDINGS[b.type].kind) {
      case 'lamp':
        return true;
      case 'tap':
        return b.links.length > 0;
      case 'spore_filter':
        return b.status === 'ok';
      case 'engine_node':
        return b.active;
      case 'heart':
        return g.s.ended;
      default:
        return b.workT < 0.3;
    }
  }

  /**
   * A working machine's light spot (furnace mouth, lamp, coil; STYLE Perspective) glows: a brighter
   * core pixel inside a 1 px halo of the spot's own colour (2 px for big spots), breathing on a slow
   * 2.4 s pulse, phase-shifted per machine. Drawn above the darkness like any light.
   */
  private drawLightSpots(g: Game, o: RenderOpts, blds: Building[]): void {
    const ctx = this.ctx;
    const t = o.time;
    for (const b of blds) {
      if (!this.lit(g, b)) continue;
      const spots = spriteLights(this.spriteName(g, b));
      if (!spots.length) continue;
      const px = b.x * TILE;
      const py = b.y * TILE - this.lift(b, t);
      const k = 0.5 + 0.5 * Math.sin(t * 2.6 + b.id * 1.7);
      for (const l of spots) {
        const cx = px + Math.floor(l.x);
        const cy = py + Math.floor(l.y);
        ctx.fillStyle = l.color;
        ctx.globalAlpha = 0.2 + 0.3 * k;
        ctx.fillRect(cx - 1, cy, 1, 1);
        ctx.fillRect(cx + 1, cy, 1, 1);
        ctx.fillRect(cx, cy - 1, 1, 1);
        ctx.fillRect(cx, cy + 1, 1, 1);
        if (l.r >= 5) {
          ctx.globalAlpha = 0.1 + 0.2 * k;
          ctx.fillRect(cx - 2, cy, 1, 1);
          ctx.fillRect(cx + 2, cy, 1, 1);
          ctx.fillRect(cx, cy - 2, 1, 1);
          ctx.fillRect(cx, cy + 2, 1, 1);
          ctx.fillRect(cx - 1, cy - 1, 1, 1);
          ctx.fillRect(cx + 1, cy - 1, 1, 1);
          ctx.fillRect(cx - 1, cy + 1, 1, 1);
          ctx.fillRect(cx + 1, cy + 1, 1, 1);
        }
        ctx.fillStyle = HOTTER[l.color] ?? C.white;
        ctx.globalAlpha = 0.4 + 0.5 * k;
        ctx.fillRect(cx, cy, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The running light on an awake conduit drawn from the terrain sheet, into `ctx` in world pixels. */
  private drawConduitPulse(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const pulse = (Math.floor(t * 8) - x - y) & 7;
    if (pulse > 1) return;
    ctx.fillStyle = pulse === 0 ? C.white : C.ice;
    ctx.fillRect(x * TILE + 7, y * TILE + 7, 2, 2);
  }

  // ------------------------------------------------------------ buildings

  private visibleBuildings(g: Game, v: View, x0: number, y0: number, x1: number, y1: number): Building[] {
    const out: Building[] = [];
    for (const b of g.s.buildings.values()) {
      if (b.layer !== v.layer) continue;
      const s = BUILDINGS[b.type].size;
      if (b.x + s < x0 || b.y + s < y0 || b.x > x1 || b.y > y1) continue;
      out.push(b);
    }
    out.sort((a, b) => baseRow(a) - baseRow(b) || a.x - b.x);
    return out;
  }

  private shadowOf(name: string): HTMLCanvasElement | null {
    let c = this.shadowCache.get(name);
    if (c) return c;
    const s = sprite(name);
    if (!s) return null;
    c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const x = c.getContext('2d')!;
    x.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = C.ink;
    x.fillRect(0, 0, s.w, s.h);
    this.shadowCache.set(name, c);
    return c;
  }

  /** A sprite's opaque pixels, read back once (again if the sprite changes when the atlas loads); null if unreadable. */
  private mask(name: string): Mask | null {
    const s = sprite(name);
    if (!s) return null;
    const had = this.masks.get(name);
    if (had && had.s === s) return had.m;
    let m: Mask | null = null;
    const c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (x) {
      try {
        x.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
        const d = x.getImageData(0, 0, s.w, s.h).data;
        const a = new Uint8Array(s.w * s.h);
        for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
        m = { s, w: s.w, h: s.h, a };
      } catch {
        // unreadable pixels: no outline, no lanes carried to the art
      }
    }
    this.masks.set(name, { s, m });
    return m;
  }

  /**
   * A sprite as a ghost (STYLE code-drawn table): the art kept whole with its own dark outline and
   * line work (the near-black pixels) turned the ghost's colour, inside a 1 px outline of that colour
   * round its silhouette; a blocked ghost also gets a dither of it over one pixel in four, so it
   * reads as blocked at a glance. A wide dark area (a Miner's pit, a tank's opening) keeps its dark
   * inside and only its rim turns, so it stays a hole rather than a blot of colour. 2 px wider and
   * taller than the sprite: draw it 1 px up and left. Cached per sprite and tint.
   */
  private ghostSprite(name: string, tint: Exclude<Tint, 'steel'>): HTMLCanvasElement | null {
    const s = sprite(name);
    if (!s) return null;
    const key = `${name}|${tint}`;
    const had = this.ghostCache.get(key);
    if (had && had.s === s) return had.c;
    const w = s.w + 2;
    const h = s.h + 2;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(s.img, s.x, s.y, s.w, s.h, 1, 1, s.w, s.h);
    const m = this.mask(name);
    if (m) {
      let px: Uint8ClampedArray | null = null;
      try {
        px = x.getImageData(0, 0, w, h).data;
      } catch {
        // unreadable: the outline alone
      }
      x.fillStyle = TINT_COL[tint];
      const solid = (i: number, j: number) => i >= 0 && j >= 0 && i < m.w && j < m.h && m.a[j * m.w + i] === 1;
      // The art's darkest colours (#090a14, #10141f, #151d28 and the like) carry its outline.
      const dark = (i: number, j: number): boolean => {
        if (!px || !solid(i, j)) return false;
        const p = ((j + 1) * w + i + 1) * 4;
        return Math.max(px[p], px[p + 1], px[p + 2]) <= 40;
      };
      for (let j = -1; j <= m.h; j++) {
        for (let i = -1; i <= m.w; i++) {
          if (solid(i, j)) {
            // Line work and the rim of a dark area: a dark pixel with something other than dark art
            // beside it.
            const line = dark(i, j) && !(dark(i - 1, j) && dark(i + 1, j) && dark(i, j - 1) && dark(i, j + 1));
            // The dither keeps to the world's grid (sprites sit on whole tiles).
            if (line || (tint === 'bad' && (i & 1) === 0 && (j & 1) === 0)) x.fillRect(i + 1, j + 1, 1, 1);
            continue;
          }
          let edge = false;
          for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) if (solid(i + di, j + dj)) edge = true;
          if (edge) x.fillRect(i + 1, j + 1, 1, 1);
        }
      }
    }
    this.ghostCache.set(key, { s, c });
    return c;
  }

  spriteName(g: Game, b: Building): string {
    if (b.type === 'drill') return b.layer === 0 ? 'b_drill_broken' : 'b_drill';
    if (b.type === 'heart') return g.s.ended ? 'b_heart' : 'b_heart_dormant';
    return `b_${b.type}`;
  }

  /** The sprite a building or a placement ghost is drawn with. */
  private standName(g: Game, n: Stand): string {
    return 'id' in n ? this.spriteName(g, n) : n.type === 'drill' ? 'b_drill' : `b_${n.type}`;
  }

  /** Belts and logistics pieces lie flat on the ground and are drawn from code. */
  private isFlat(type: string): boolean {
    const k: string = BUILDINGS[type]?.kind ?? '';
    return k === 'belt' || isPieceKind(k);
  }

  // ------------------------------------------------------------ joins: what feeds what

  /**
   * What stands at a cell as the joins see it: a placement ghost stands in for whatever it would
   * replace (a blocked ghost only when `ghosts` is set, for other ghosts: it will never be built),
   * else the building there, built or planned.
   */
  private standAt(g: Game, layer: number, x: number, y: number, ghosts: boolean): Stand | null {
    if (this.ghostAt.size && layer === this.ghostLayer) {
      const L = g.layer(layer);
      if (x < 0 || y < 0 || x >= L.w || y >= L.h) return null;
      const gh = this.ghostAt.get(y * L.w + x);
      if (gh && (ghosts || gh.ok)) return gh;
    }
    return g.at(layer, x, y);
  }

  /**
   * Does `f` hand items into cell (x, y), travelling `travel`? The sim's rule (logistics.ts
   * pushesInto), for buildings and ghosts alike: belts and 1x1 pieces along their facing, a splitter
   * out of its front and both sides, a sorter out of its front and left, a crossing straight on along
   * an axis something feeds it on, and buildings out of their output port (and byproduct port).
   */
  private pushes(g: Game, layer: number, f: Stand, x: number, y: number, travel: Dir, ghosts: boolean, depth = 0): boolean {
    const def = BUILDINGS[f.type];
    if (!def) return false;
    const k = def.kind;
    if (isSlot(k)) {
      if (f.x + DX[travel] !== x || f.y + DY[travel] !== y) return false;
      if (k === 'crossing') {
        // A belt crossing a bus lays a crossing per line, side by side, and each passes on what the
        // one behind it does. The run is straight, so it ends within a map's width (the guard only
        // bounds the recursion).
        if (depth > CROSSING_RUN) return false;
        const b = this.standAt(g, layer, f.x - DX[travel], f.y - DY[travel], ghosts);
        return !!b && b !== f && this.pushes(g, layer, b, f.x, f.y, travel, ghosts, depth + 1);
      }
      if (k === 'splitter') return travel === f.dir || travel === leftOf(f.dir) || travel === rightOf(f.dir);
      if (k === 'sorter') return travel === f.dir || travel === leftOf(f.dir);
      return travel === f.dir;
    }
    if (travel === f.dir && frontOutput(f.type)) {
      const p = outputPort(f as Building);
      if (p.x === x && p.y === y) return true;
    }
    if (travel === leftOf(f.dir) && sideOutput(f.type)) {
      const p = sidePort(f as Building);
      if (p.x === x && p.y === y) return true;
    }
    return false;
  }

  /** Would `n` ever take an item travelling `travel` into it? The sim's insert() by kind, leaving out what an item is. */
  private takes(n: Stand, travel: Dir): boolean {
    switch (BUILDINGS[n.type]?.kind) {
      case 'belt':
      case 'crate':
      case 'machine':
      case 'elevator':
      case 'engine_node':
        return travel !== opp(n.dir);
      case 'splitter':
      case 'sorter':
        return travel === n.dir;
      case 'sequencer':
        return travel === rightOf(n.dir) || travel === leftOf(n.dir);
      case 'crossing':
      case 'generator':
      case 'depot':
      case 'terminal':
      case 'chute':
      case 'drill':
      case 'heart':
      case 'lab':
        return true;
      default:
        return false;
    }
  }

  /** Does the neighbour of `b` in direction `a` hand items into it? */
  private fedFrom(g: Game, layer: number, b: Stand, a: Dir, ghosts: boolean): boolean {
    const n = this.standAt(g, layer, b.x + DX[a], b.y + DY[a], ghosts);
    return !!n && n !== b && this.pushes(g, layer, n, b.x, b.y, opp(a), ghosts);
  }

  /** Does the neighbour of `b` in direction `a` take what `b` hands it that way? */
  private feedsTo(g: Game, layer: number, b: Stand, a: Dir, ghosts: boolean): boolean {
    const n = this.standAt(g, layer, b.x + DX[a], b.y + DY[a], ghosts);
    return !!n && n !== b && this.takes(n, a);
  }

  /**
   * A belt's shape and open sides (belts.ts SIDE_ bits). Fed from behind it runs straight, open at
   * the back and on any hand something feeds into (a side-load); fed from one hand only it curves;
   * fed by nothing (or from both hands) it runs straight with its back closed, the start of a line.
   * Its front is open when what is in front takes from it, else closed: the end of a line. A curve
   * keeps its open bits for the lanes carried into buildings (beltStrips).
   */
  private beltLook(g: Game, layer: number, b: Stand, ghosts: boolean): { shape: BeltShape; open: number } {
    const d = b.dir;
    const back = this.fedFrom(g, layer, b, opp(d), ghosts);
    const fromL = this.fedFrom(g, layer, b, leftOf(d), ghosts);
    const fromR = this.fedFrom(g, layer, b, rightOf(d), ghosts);
    let open = (back ? SIDE_B : 0) | (fromL ? SIDE_L : 0) | (fromR ? SIDE_R : 0);
    if (this.feedsTo(g, layer, b, d, ghosts)) open |= SIDE_F;
    const shape: BeltShape = !back && fromL !== fromR ? (fromL ? 'L' : 'R') : 'S';
    return { shape, open };
  }

  /**
   * A splitter's, sorter's or crossing's open sides: its back where something feeds it, an exit where
   * what is there takes from it. A crossing is open on a side something feeds it from or it hands on
   * to; one with nothing joined on any side shows all four open, so it still reads as a crossing.
   */
  private pieceOpen(g: Game, layer: number, b: Stand, ghosts: boolean): number {
    const k = BUILDINGS[b.type].kind;
    const sides = pieceSides(k);
    let open = 0;
    for (let a = 0; a < 4; a++) {
      const dir = a as Dir;
      const bit = sideBit(b.dir, dir);
      if (!(sides & bit)) continue;
      let on: boolean;
      if (k === 'crossing') {
        const n = this.standAt(g, layer, b.x + DX[dir], b.y + DY[dir], ghosts);
        on = !!n && n !== b && (this.pushes(g, layer, n, b.x, b.y, opp(dir), ghosts) || (this.takes(n, dir) && this.pushes(g, layer, b, b.x + DX[dir], b.y + DY[dir], dir, ghosts)));
      } else on = bit === SIDE_B ? this.fedFrom(g, layer, b, dir, ghosts) : this.feedsTo(g, layer, b, dir, ghosts);
      if (on) open |= bit;
    }
    return k === 'crossing' && !open ? sides : open;
  }

  // ------------------------------------------------------------ belts and pieces

  /**
   * A belt's or logistics piece's tile, joined to its neighbours, in a tint (steel when built), at an
   * animation frame. `ghosts`: the tile is itself a placement ghost (blocked ghosts count as its
   * neighbours). `arrow`: a belt gets the ghost's chevron. `strips`: lanes are carried into the
   * standing buildings it feeds or is fed by.
   */
  private drawFlat(g: Game, layer: number, b: Stand, frame: number, tint: Tint, ghosts: boolean, arrow: boolean, strips: boolean): void {
    const def = BUILDINGS[b.type];
    const px = b.x * TILE;
    const py = b.y * TILE;
    if (def.kind === 'belt') {
      const look = this.beltLook(g, layer, b, ghosts);
      this.ctx.drawImage(beltTile(b.type, b.dir, look.shape, frame, look.open, tint, arrow), px, py);
      if (strips) this.drawStrips(g, layer, b, b.type, look.open, frame, tint, ghosts);
      return;
    }
    const open = this.pieceOpen(g, layer, b, ghosts);
    this.ctx.drawImage(pieceTile(def.kind, b.dir, frame, open, tint), px, py);
    if (strips) this.drawStrips(g, layer, b, 'belt', open, frame, tint, ghosts);
  }

  /**
   * The lanes of a flat tile carried across its open edges into the standing buildings there, up to
   * their art: out of an output chute (a side that feeds it) or into an intake (a side it hands on
   * across). A belt then runs into or out of a building instead of stopping short of its sprite. The
   * strips lie under the building, which is drawn later.
   */
  private drawStrips(g: Game, layer: number, b: Stand, kind: string, open: number, frame: number, tint: Tint, ghosts: boolean): void {
    for (let a = 0; a < 4; a++) {
      const dir = a as Dir;
      if (!(open & sideBit(b.dir, dir))) continue;
      const tx = b.x + DX[dir];
      const ty = b.y + DY[dir];
      const n = this.standAt(g, layer, tx, ty, ghosts);
      if (!n || n === b || this.isFlat(n.type)) continue;
      // Into it when this tile hands on that way, else out of it.
      const into = this.takes(n, dir) && this.pushes(g, layer, b, tx, ty, dir, ghosts);
      const travel = into ? dir : opp(dir);
      const depth = this.artDepth(g, n, tx, ty, travel, into);
      if (depth) this.ctx.drawImage(laneStrip(kind, travel, frame, into, depth, tint), tx * TILE, ty * TILE);
    }
  }

  /**
   * How far in from the footprint's edge building `n`'s art starts, at each pixel across a lane that
   * crosses into its edge tile (tx, ty) travelling `travel`: `into` it (the strip starts at the tile's
   * near edge), or out of it (the strip ends at the edge it shares with the lane's tile). Indexed by
   * the lane's canonical across coordinate (belts.ts). Up to STRIP_MAX; 0 where the art doesn't come
   * that close. One more pixel on a building's south face, so a 2x2 machine's 1 px work shudder never
   * opens a gap. Cached per sprite, tile and direction.
   */
  private artDepth(g: Game, n: Stand, tx: number, ty: number, travel: Dir, into: boolean): number[] | null {
    const name = this.standName(g, n);
    const s = sprite(name);
    if (!s) return null;
    const key = `${name}:${tx - n.x}:${ty - n.y}:${travel}:${into ? 1 : 0}`;
    const had = this.depths.get(key);
    if (had && had.s === s) return had.d;
    const m = this.mask(name);
    let out: number[] | null = null;
    if (m) {
      out = [];
      // Step from the shared edge into the building: the lane's own direction into it, against it out of it.
      const step = into ? travel : opp(travel);
      const south = step === 0;
      let any = false;
      for (let v = 0; v < 16; v++) {
        // The canonical edge pixel at this across coordinate (belts.ts map), in the building's sprite.
        const u = into ? 0 : 15;
        const [lx, ly] = travel === 1 ? [u, v] : travel === 2 ? [15 - v, u] : travel === 3 ? [15 - u, 15 - v] : [v, 15 - u];
        let x = (tx - n.x) * TILE + lx;
        let y = (ty - n.y) * TILE + ly;
        let k = 0;
        for (; k < STRIP_MAX; k++) {
          if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.a[y * m.w + x]) break;
          x += DX[step];
          y += DY[step];
        }
        const dd = k >= STRIP_MAX ? 0 : south ? Math.min(STRIP_MAX, k + 1) : k;
        if (dd) any = true;
        out.push(dd);
      }
      if (!any) out = null;
    }
    this.depths.set(key, { s, d: out });
    return out;
  }

  /** The animation frame of a ghost belt: it runs on real time, so it moves while the game is paused too. */
  private ghostFrame(type: string, t: number): number {
    return Math.floor(t * GHOST_PX_PER_S * ((BUILDINGS[type]?.speed ?? 1.5) / 1.5));
  }

  /**
   * The ghost's bold chevron just outside the face its output leaves by (and a #a8b5b2 one at a
   * byproduct port), so "R rotates the output" shows; a 1x1 piece that hands on out of its front
   * (Unloader, Crate, Sequencer) gets one in front of it.
   */
  private outArrow(b: { type: string; x: number; y: number; dir: Dir }, tint: Exclude<Tint, 'steel'>): void {
    const k = BUILDINGS[b.type]?.kind;
    const at = b as Building;
    if (frontOutput(b.type) || k === 'unloader' || k === 'crate' || k === 'sequencer') {
      const p = outputPort(at);
      this.ctx.drawImage(arrowTile(b.dir, tint), p.x * TILE, p.y * TILE);
    }
    if (sideOutput(b.type)) {
      const p = sidePort(at);
      this.ctx.drawImage(arrowTile(leftOf(b.dir), tint, C.steel3), p.x * TILE, p.y * TILE);
    }
  }

  private drawBuildings(g: Game, v: View, o: RenderOpts, blds: Building[]): void {
    const ctx = this.ctx;
    const tick = g.s.tick;
    // Belts and pieces first, flat on the ground. Their frame comes from the sim tick; a planned one
    // stands still in the planned tint with its chevron, so its direction shows before it is built.
    const L = g.layer(v.layer);
    for (const b of blds) {
      if (!this.isFlat(b.type)) continue;
      // A placement ghost that would replace it is drawn instead (a curve's open corners would show
      // the old tile through).
      if (this.ghostAt.get(b.y * L.w + b.x)?.ok) continue;
      const def = BUILDINGS[b.type];
      if (b.planned) {
        this.drawFlat(g, v.layer, b, 0, 'planned', false, true, true);
        continue;
      }
      this.drawFlat(g, v.layer, b, beltFrame(tick, def.speed ?? 1.5), 'steel', false, false, true);
      if (def.kind === 'sorter' && b.filter) this.drawFilter(b.filter, b.x * TILE, b.y * TILE);
    }
    // Shadows under everything that stands.
    for (const b of blds) {
      if (b.planned || this.isFlat(b.type)) continue;
      const def = BUILDINGS[b.type];
      if (def.size === 1 && isSlot(def.kind)) continue;
      const sh = this.shadowOf(this.spriteName(g, b));
      if (sh) {
        ctx.globalAlpha = 0.35;
        ctx.drawImage(sh, b.x * TILE + 2, b.y * TILE + 2);
        ctx.globalAlpha = 1;
      }
    }
    this.drawStanding(g, v, o, blds);
  }

  /**
   * Everything that stands, back to front by the row it stands on (in the 3/4 view a lower row is
   * nearer): on each row the tall decor, then building bodies, then the items on that row's belts.
   * So a 32 px prop stands in front of an item hanging in behind it (it never reaches a building's
   * tile: decorFits), a machine hides an item sliding into its back, and an item leaving a
   * machine's front shows over its edge. `blds` is sorted by base row.
   */
  private drawStanding(g: Game, v: View, o: RenderOpts, blds: Building[]): void {
    const L = g.layer(v.layer);
    const tall = this.tallDecor;
    const n = blds.length;
    let r0 = n ? baseRow(blds[0]) : Infinity;
    let r1 = n ? baseRow(blds[n - 1]) : -Infinity;
    if (tall.length) {
      r0 = Math.min(r0, (tall[0] / L.w) | 0);
      r1 = Math.max(r1, (tall[tall.length - 1] / L.w) | 0);
    }
    let ti = 0;
    let bi = 0;
    for (let r = r0; r <= r1; r++) {
      for (; ti < tall.length && ((tall[ti] / L.w) | 0) === r; ti++) this.drawTallDecor(v.layer, L, tall[ti]);
      let bj = bi;
      for (; bj < n && baseRow(blds[bj]) === r; bj++) if (!this.isFlat(blds[bj].type)) this.drawBody(g, o, blds[bj]);
      for (let k = bi; k < bj; k++) if (!blds[k].planned) this.drawItemsOn(g, o, blds[k]);
      bi = bj;
    }
  }

  /** A decor prop taller than its tile, bottom-centred on it. */
  private drawTallDecor(layer: number, L: LayerState, i: number): void {
    const name = decorSprite(layer, L.decor[i]);
    const s = name ? sprite(name) : null;
    if (!s) return;
    const px = (i % L.w) * TILE;
    const py = ((i / L.w) | 0) * TILE;
    this.ctx.drawImage(s.img, s.x, s.y, s.w, s.h, px + 8 - (s.w >> 1), py + TILE - s.h, s.w, s.h);
  }

  /** A working 2x2 machine shudders 1 px up now and then, phase-shifted per machine. */
  private lift(b: Building, t: number): number {
    const def = BUILDINGS[b.type];
    if (b.planned || b.paused || b.workT >= 0.3 || def.size !== 2 || def.kind === 'tap') return 0;
    return Math.floor(t * 10 + b.id * 0.37) % 4 === 0 ? 1 : 0;
  }

  /** A building's sprite with its chutes, slot marks, elevator cab or project bar. */
  private drawBody(g: Game, o: RenderOpts, b: Building): void {
    const ctx = this.ctx;
    const t = o.time;
    const def = BUILDINGS[b.type];
    const name = this.spriteName(g, b);
    const s = sprite(name);
    const px = b.x * TILE;
    if (b.planned) {
      // Planned ghost, as a placement ghost looks: the sprite kept whole with its line work and a
      // 1 px outline in #4f8fba, its dashed footprint, its chutes and the chevron where its output leaves.
      const py = b.y * TILE;
      const gs = this.ghostSprite(name, 'planned');
      if (gs) ctx.drawImage(gs, px - 1, py - 1);
      this.dashedRect(px, py, def.size * TILE, def.size * TILE, GHOST_PLANNED, t);
      this.drawChutes(b, false);
      this.outArrow(b, 'planned');
      return;
    }
    if (s) {
      const py = b.y * TILE - this.lift(b, t);
      // An Engine Node sleeps with its glass dark, like dormant conduit, until its first Heartstone
      // (or the ending) wakes it; its light spot still glows while it works on a sequence.
      if (def.kind === 'engine_node' && !nodeAwake(b) && !g.s.ended) ctx.drawImage(dormantCopy(s.img, s.x, s.y, s.w, s.h), px, py);
      else ctx.drawImage(s.img, s.x, s.y, s.w, s.h, px, py, s.w, s.h);
    }
    if (def.size === 1 && isSlot(def.kind)) this.drawSlotMarks(b, px, b.y * TILE);
    this.drawChutes(b, false);
    if (def.kind === 'elevator') this.drawCab(g, b, t);
    if (def.kind === 'drill' || def.kind === 'heart') this.drawProjectBar(g, b);
  }

  private dashedRect(x: number, y: number, w: number, h: number, col: string, t: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = col;
    const off = Math.floor(t * 8) % 4;
    for (let i = 0; i < w; i++) {
      if ((i + off) % 4 < 2) {
        ctx.fillRect(x + i, y, 1, 1);
        ctx.fillRect(x + w - 1 - i, y + h - 1, 1, 1);
      }
    }
    for (let i = 0; i < h; i++) {
      if ((i + off) % 4 < 2) {
        ctx.fillRect(x + w - 1, y + i, 1, 1);
        ctx.fillRect(x, y + h - 1 - i, 1, 1);
      }
    }
  }

  /** A chute canvas for a facing: #202e37 with an arrow pointing out of the machine. */
  private chuteTile(d: Dir, arrow: string): HTMLCanvasElement {
    const key = `${d}:${arrow}`;
    let c = this.chuteCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const vert = d === 0 || d === 2;
    c.width = vert ? 6 : 4;
    c.height = vert ? 4 : 6;
    const x = c.getContext('2d')!;
    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 6; cx++) {
        const ch = CHUTE_ROWS[cy][cx];
        let px: number;
        let py: number;
        if (d === 0) [px, py] = [cx, cy];
        else if (d === 2) [px, py] = [5 - cx, 3 - cy];
        else if (d === 1) [px, py] = [3 - cy, cx];
        else [px, py] = [cy, 5 - cx];
        x.fillStyle = ch === 'A' ? arrow : C.panel2;
        x.fillRect(px, py, 1, 1);
      }
    }
    this.chuteCache.set(key, c);
    return c;
  }

  /**
   * A 6x4 chute on the edge `d` of a building, centred on the port tile, overlapping the body by
   * 3 px and standing 1 px proud of it (art review issue 4). Atlas art that stands inside its
   * footprint (the `chute` anchor of sprite `name`) gets the chute's body carried in from its edge.
   */
  private chute(b: { x: number; y: number }, size: number, d: Dir, port: { x: number; y: number }, arrow: string, name?: string): void {
    let x: number;
    let y: number;
    switch (d) {
      case 0:
        x = port.x * TILE + 5;
        y = b.y * TILE - 1;
        break;
      case 2:
        x = port.x * TILE + 5;
        y = (b.y + size) * TILE - 3;
        break;
      case 1:
        x = (b.x + size) * TILE - 3;
        y = port.y * TILE + 5;
        break;
      default:
        x = b.x * TILE - 1;
        y = port.y * TILE + 5;
    }
    const side = name ? spriteChuteEdges(name)?.[(['N', 'E', 'S', 'W'] as const)[d]] : undefined;
    if (side) {
      // The spout runs from the art's edge pixel (measured at the port tile's centre) to the chute tile.
      const e = side[Math.max(0, Math.min(side.length - 1, d === 0 || d === 2 ? port.x - b.x : port.y - b.y))];
      const bx = b.x * TILE;
      const by = b.y * TILE;
      this.ctx.fillStyle = C.panel2;
      if (d === 0 && e > 3) this.ctx.fillRect(x, by + 3, 6, e - 2);
      else if (d === 2 && by + e < y) this.ctx.fillRect(x, by + e, 6, y - (by + e));
      else if (d === 1 && bx + e < x) this.ctx.fillRect(bx + e, y, x - (bx + e), 6);
      else if (d === 3 && e > 3) this.ctx.fillRect(bx + 3, y, e - 2, 6);
    }
    this.ctx.drawImage(this.chuteTile(d, arrow), x, y);
  }

  /**
   * The output chute (#e8c170 arrow) at the output port of a building that has a front output, and
   * the byproduct chute (#a8b5b2 arrow) at the side port of one with a side output; `marks` also
   * brackets those cells (placement ghosts show where the belt goes). A building with neither (a
   * Combustion Generator) shows no chute: its facing doesn't matter.
   */
  private drawChutes(b: { type: string; x: number; y: number; dir: Dir }, marks: boolean): void {
    const size = BUILDINGS[b.type].size;
    // outputPort and sidePort read only the type, position and facing.
    const at = b as Building;
    if (frontOutput(b.type)) {
      const p = outputPort(at);
      this.chute(b, size, b.dir, p, C.pale, `b_${b.type}`);
      if (marks) this.portMark(p, C.pale);
    }
    if (sideOutput(b.type)) {
      const p = sidePort(at);
      this.chute(b, size, leftOf(b.dir), p, C.steel3, `b_${b.type}`);
      if (marks) this.portMark(p, C.steel3);
    }
  }

  /** The corner brackets alone on the port cells of a building with chutes (the hovered and selected one). */
  private drawPortMarks(b: Building): void {
    if (frontOutput(b.type)) this.portMark(outputPort(b), C.pale);
    if (sideOutput(b.type)) this.portMark(sidePort(b), C.steel3);
  }

  /** Corner brackets on a port cell (placement ghosts show where the belt goes). */
  private portMark(c: { x: number; y: number }, col: string): void {
    const ctx = this.ctx;
    const x = c.x * TILE;
    const y = c.y * TILE;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 3, 1);
    ctx.fillRect(x, y, 1, 3);
    ctx.fillRect(x + 13, y, 3, 1);
    ctx.fillRect(x + 15, y, 1, 3);
    ctx.fillRect(x, y + 15, 3, 1);
    ctx.fillRect(x, y + 13, 1, 3);
    ctx.fillRect(x + 13, y + 15, 3, 1);
    ctx.fillRect(x + 15, y + 13, 1, 3);
  }

  /**
   * A sorter's filter in its window (belts.ts): the item icon's middle 10 x 10, as the Unloader and
   * the Crate show theirs, on the dark glass, so it never reads as an item riding the belt.
   */
  private drawFilter(id: string, px: number, py: number): void {
    const s = sprite(`i_${id}`);
    if (s) this.ctx.drawImage(s.img, s.x + 3, s.y + 3, 10, 10, px + 3, py + 3, 10, 10);
  }

  /** Direction marks and item icons on 1x1 sprite pieces (unloader, crate, sequencer). */
  private drawSlotMarks(b: Building, px: number, py: number): void {
    const ctx = this.ctx;
    const k: string = BUILDINGS[b.type].kind;
    const arrow = (d: Dir, col: string) => {
      const cx = px + 8 + DX[d] * 5;
      const cy = py + 8 + DY[d] * 5;
      ctx.fillStyle = col;
      if (d === 1 || d === 3) {
        ctx.fillRect(cx, cy - 1, 1, 3);
        ctx.fillRect(cx + DX[d], cy, 1, 1);
      } else {
        ctx.fillRect(cx - 1, cy, 3, 1);
        ctx.fillRect(cx, cy + DY[d], 1, 1);
      }
    };
    if (k === 'unloader' || k === 'crate' || k === 'sequencer') arrow(b.dir, C.pale);
    if ((k === 'unloader' || k === 'crate') && (b.filter || b.stockItem)) {
      const id = b.filter ?? b.stockItem!;
      const s = sprite(`i_${id}`);
      if (s) ctx.drawImage(s.img, s.x + 3, s.y + 3, 10, 10, px + 3, py + 3, 10, 10);
    }
  }

  /**
   * The cab in the station's pit: a yellow cage with up to 8 cargo pips while it dwells here, a
   * running cable down the middle of the pit while it is away. On atlas art the pit is the recipe's
   * `pit` anchor, already dark in the art, and the cab fills it inset 1 px. The code-drawn station (or
   * art without the anchor) keeps the fixed pit CODE_PIT, filled black.
   */
  private drawCab(g: Game, b: Building, t: number): void {
    const sh = g.s.shafts[b.shaft];
    if (!sh) return;
    const ctx = this.ctx;
    const px = b.x * TILE;
    const py = b.y * TILE;
    const art = spriteAnchor(this.spriteName(g, b), 'pit');
    const pit = art ?? CODE_PIT;
    const here = sh.state === 'dwell' && sh.at === b.end;
    if (!art) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(px + pit.x, py + pit.y, pit.w, pit.h);
    }
    // Bars, cable and pips sit on the pit's middle column (x 23 on both pits).
    const mid = px + pit.x + ((pit.w - 1) >> 1);
    if (here) {
      // The cage: gold rim, amber inner rim, dark floor, three gold bars 4 px apart.
      const cx = art ? px + pit.x + 1 : px + pit.x;
      const cy = art ? py + pit.y + 1 : py + pit.y;
      const cw = art ? pit.w - 2 : pit.w;
      const ch = art ? pit.h - 2 : pit.h;
      ctx.fillStyle = C.gold;
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = C.amber;
      ctx.fillRect(cx + 1, cy + 1, cw - 2, ch - 2);
      ctx.fillStyle = C.panel2;
      ctx.fillRect(cx + 2, cy + 2, cw - 4, ch - 4);
      ctx.fillStyle = C.gold;
      for (let k = -1; k <= 1; k++) ctx.fillRect(mid + k * 4, cy + 2, 1, ch - 4);
      // Cargo: 2 x 2 pips in two rows of four, 3 px apart across; the rows 6 px apart in the tall
      // code pit, 3 px apart in the art's shallower one (both centred in the cage).
      const rowGap = art ? 3 : 6;
      const x0 = art ? mid - 5 : mid - 4;
      const y0 = art ? cy + 2 + ((ch - 4 - (rowGap + 2) + 1) >> 1) : cy + 4;
      const n = sh.cab.length;
      for (let k = 0; k < Math.min(n, 8); k++) {
        const it = sh.cab[k];
        ctx.fillStyle = ITEMS[it.id]?.color[1] ?? C.white;
        ctx.fillRect(x0 + (k % 4) * 3, y0 + Math.floor(k / 4) * rowGap, 2, 2);
      }
    } else {
      // Cable running down the pit while the cab is away.
      ctx.fillStyle = C.slate;
      const off = Math.floor(t * 20) % 4;
      for (let y = 0; y < pit.h; y++) if ((y + off) % 4 < 2) ctx.fillRect(mid, py + pit.y + y, 2, 1);
    }
  }

  private drawProjectBar(g: Game, b: Building): void {
    const p = g.s.project;
    if (!p || PROJECTS[p.id].layer !== b.layer) return;
    const def = PROJECTS[p.id];
    let have = 0;
    let need = 0;
    for (const [k, v] of Object.entries(def.needs)) {
      have += Math.min(v, p.delivered[k] ?? 0);
      need += v;
    }
    const ctx = this.ctx;
    const size = BUILDINGS[b.type].size * TILE;
    const x = b.x * TILE + 4;
    const y = b.y * TILE - 6;
    const w = size - 8;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = C.gold;
    ctx.fillRect(x, y, Math.round((w * have) / Math.max(1, need)), 3);
  }

  // ------------------------------------------------------------ items on belts

  /**
   * Where an item sits along its path through a slot, at visual progress `p` (tile units). On a curve
   * it follows the arc; on a straight belt an item fed in from a side comes in through that side's
   * opening to the middle, then runs on to the front.
   */
  private itemPos(g: Game, b: Building, second: boolean, p: number): { x: number; y: number } {
    const isBelt = BUILDINGS[b.type].kind === 'belt';
    const inDir = second ? b.inDir2 : b.inDir;
    const outDir = second ? b.inDir2 : b.outDir;
    if (isBelt && inDir !== b.dir && !second) {
      const shape = this.beltLook(g, b.layer, b, false).shape;
      const fromLeft = inDir === rightOf(b.dir);
      if ((shape === 'L' && fromLeft) || (shape === 'R' && !fromLeft)) {
        // Follow the arc: canonical east-facing, pivot at the inner corner.
        const a = p * (Math.PI / 2);
        const u = 16 - 8 * Math.cos(a);
        let vv = 8 * Math.sin(a);
        if (shape === 'R') vv = 16 - vv;
        let x: number;
        let y: number;
        switch (b.dir) {
          case 1:
            x = u;
            y = vv;
            break;
          case 2:
            x = 16 - vv;
            y = u;
            break;
          case 3:
            x = 16 - u;
            y = 16 - vv;
            break;
          default:
            x = vv;
            y = 16 - u;
        }
        return { x: x / 16, y: y / 16 };
      }
    }
    const t = p - 0.5;
    const d = p < 0.5 ? inDir : outDir;
    return { x: 0.5 + DX[d] * t, y: 0.5 + DY[d] * t };
  }

  /** The items a belt or logistics piece holds (drawn on its row of the back-to-front pass). */
  private drawItemsOn(g: Game, o: RenderOpts, b: Building): void {
    if (b.item) {
      const p = this.itemXY(g, b, false);
      this.drawItem(b.item.id, p.x, p.y, o.time, b.item.heat);
    }
    if (b.item2) {
      const p = this.itemXY(g, b, true);
      this.drawItem(b.item2.id, p.x, p.y, o.time, b.item2.heat);
    }
  }

  /** Top-left of an item's 16 px box: whole-pixel progress in lockstep with the belt rungs (belts.ts lockstepPx). */
  private itemXY(g: Game, b: Building, second: boolean): { x: number; y: number } {
    const speed = BUILDINGS[b.type].speed ?? 1.5;
    const prog = second ? b.prog2 : b.prog;
    const p = this.itemPos(g, b, second, lockstepPx(g.s.tick, speed, prog) / 16);
    return { x: Math.round(b.x * TILE + p.x * TILE - 8), y: Math.round(b.y * TILE + p.y * TILE - 8) };
  }

  drawItem(id: string, x: number, y: number, t: number, heat = 0): void {
    const ctx = this.ctx;
    const def = ITEMS[id];
    if (def?.glow) {
      // A soft pixel halo for charged and exotic items.
      ctx.fillStyle = def.glow;
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 5 + x);
      ctx.fillRect(x + 3, y + 1, 10, 14);
      ctx.fillRect(x + 1, y + 3, 14, 10);
      ctx.globalAlpha = 1;
    }
    const s = sprite(`i_${id}`);
    if (s) ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, y, s.w, s.h);
    if (def?.hot && heat > 0) {
      // Shimmer: bright pixels while hot, dimming as it cools.
      const n = heat > 60 ? 3 : heat > 25 ? 2 : 1;
      ctx.fillStyle = heat > 40 ? C.pale : C.orange;
      for (let k = 0; k < n; k++) {
        const hx = x + 4 + Math.floor(hash2(k, Math.floor(t * 12), 3) * 8);
        const hy = y + 2 + Math.floor(hash2(Math.floor(t * 12), k, 4) * 4);
        ctx.fillRect(hx, hy, 1, 1);
      }
    }
  }

  // ------------------------------------------------------------ particles

  private emitParticles(g: Game, v: View, o: RenderOpts, blds: Building[]): void {
    const P = o.particles;
    const t = o.time;
    if (t - this.lastEmit < 1 / 20) return;
    this.lastEmit = t;
    for (const b of blds) {
      if (b.planned || b.paused || b.workT > 0.3) continue;
      const def = BUILDINGS[b.type];
      const cx = b.x * TILE + def.size * 8;
      const cy = b.y * TILE + def.size * 8;
      const r = P.rand();
      switch (b.type) {
        case 'smelter':
        case 'foundry':
        case 'pressure_forge':
          if (r < 0.35) P.add({ x: cx - 4 + P.rand() * 8, y: b.y * TILE + 2, vx: (P.rand() - 0.5) * 4, vy: -10 - P.rand() * 6, life: 1.2, color: P.rand() < 0.5 ? C.slate : C.steel, size: 2, grav: 0, layer: v.layer });
          if (r > 0.85) P.add({ x: cx, y: cy, vx: (P.rand() - 0.5) * 30, vy: -20 - P.rand() * 20, life: 0.5, color: P.rand() < 0.5 ? C.pale : C.orange, size: 1, grav: 60, layer: v.layer });
          break;
        case 'miner':
        case 'harvester':
          if (r < 0.3) P.add({ x: cx + (P.rand() - 0.5) * 20, y: cy + 8, vx: (P.rand() - 0.5) * 16, vy: -14, life: 0.5, color: TERRAIN_PAL[v.layer]?.fleck ?? C.sand, size: 1, grav: 50, layer: v.layer });
          break;
        case 'press':
        case 'assembler':
        case 'precision_assembler':
          if (r < 0.12) P.add({ x: cx + (P.rand() - 0.5) * 16, y: cy - 6, vx: 0, vy: -6, life: 0.6, color: C.steel3, size: 1, grav: 0, layer: v.layer });
          break;
        case 'generator':
          if (r < 0.4) P.add({ x: b.x * TILE + 24, y: b.y * TILE + 2, vx: (P.rand() - 0.5) * 3, vy: -12, life: 1.6, color: P.rand() < 0.5 ? C.slate : C.panel2, size: 2, grav: 0, layer: v.layer });
          break;
        case 'washer':
        case 'cooling_bath':
          if (r < 0.3) P.add({ x: cx + (P.rand() - 0.5) * 12, y: b.y * TILE + 4, vx: (P.rand() - 0.5) * 4, vy: -10, life: 1, color: P.rand() < 0.5 ? C.silver : C.steel3, size: 1, grav: 0, layer: v.layer });
          break;
        case 'charger':
        case 'overcharger':
        case 'resonance_tap':
          if (r < 0.25) P.add({ x: cx + (P.rand() - 0.5) * 20, y: cy + (P.rand() - 0.5) * 20, vx: 0, vy: 0, life: 0.15, color: C.ice, size: 1, grav: 0, layer: v.layer });
          break;
        case 'thermal_extractor':
          if (r < 0.3) P.add({ x: cx + (P.rand() - 0.5) * 10, y: b.y * TILE + 2, vx: 0, vy: -16, life: 0.8, color: P.rand() < 0.5 ? C.orange : C.coral, size: 1, grav: 0, layer: v.layer });
          break;
        case 'spore_collector':
          if (r < 0.3) P.add({ x: cx + (P.rand() - 0.5) * 40, y: cy + (P.rand() - 0.5) * 40, vx: 0, vy: 0, life: 0.6, color: C.pink, size: 1, grav: 0, layer: v.layer });
          break;
      }
    }
    // Ambient: spores drifting, magma embers, dust on the surface.
    const L = g.layer(v.layer);
    for (let k = 0; k < 3; k++) {
      const wx = v.camX + P.rand() * v.w;
      const wy = v.camY + P.rand() * v.h;
      const cx = Math.floor(wx / TILE);
      const cy = Math.floor(wy / TILE);
      if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) continue;
      const i = cy * L.w + cx;
      if (!L.revealed[i]) continue;
      if (L.spore[i] > 0.15 && P.rand() < L.spore[i]) {
        P.add({ x: wx, y: wy, vx: (P.rand() - 0.5) * 6, vy: -3 - P.rand() * 3, life: 2.5, color: P.rand() < 0.6 ? C.pink : C.lime, size: 1, grav: 0, layer: v.layer });
      }
      if (L.terrain[i] === T_MAGMA && P.rand() < 0.5) {
        P.add({ x: wx, y: wy, vx: (P.rand() - 0.5) * 4, vy: -14 - P.rand() * 10, life: 1, color: P.rand() < 0.5 ? C.orange : C.pale, size: 1, grav: -4, layer: v.layer });
      }
      if (L.terrain[i] === T_FLOOR && L.hot[i] >= 2 && P.rand() < 0.12) {
        P.add({ x: wx, y: wy, vx: 0, vy: -6 - P.rand() * 4, life: 0.6, color: C.coral, size: 1, grav: 0, layer: v.layer });
      }
      if (L.terrain[i] === T_WATER && P.rand() < 0.15) {
        P.add({ x: wx, y: wy, vx: 0, vy: 0, life: 0.4, color: C.ice, size: 1, grav: 0, layer: v.layer });
      }
      if (v.layer === 0 && P.rand() < 0.08) {
        P.add({ x: wx, y: wy, vx: 8 + P.rand() * 6, vy: -1, life: 2, color: C.cream, size: 1, grav: 0, layer: v.layer });
      }
      if (v.layer === 3 && L.ore[i] && P.rand() < 0.3) {
        P.add({ x: wx, y: wy, vx: 0, vy: 0, life: 0.3, color: C.white, size: 1, grav: 0, layer: v.layer });
      }
    }
  }

  private drawParticles(v: View, o: RenderOpts): void {
    const ctx = this.ctx;
    for (const p of o.particles.list) {
      if (p.layer !== v.layer || p.text) continue;
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.4));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ overlays

  private drawOverlays(g: Game, v: View, o: RenderOpts, x0: number, y0: number, x1: number, y1: number, blds: Building[]): void {
    const ctx = this.ctx;
    const L = g.layer(v.layer);
    const t = o.time;
    if (o.overlays.spores && L.sporeBase.some((x) => x > 0)) {
      // Two-level checker dither (the patterns repeat within a tile, so they stay world-anchored).
      // Only on open floor, like the heat overlay: spores slow what stands there, and a haze over
      // the walls and water only hid them (review 3 A8). The glowcap patches keep theirs: a Spore
      // Collector or any machine can stand on them.
      const dense = this.patternTile('spore2', C.pink, (xx, yy) => (yy & 1) === 0 && ((xx + (yy >> 1)) & 1) === 0);
      const thin = this.patternTile('spore1', C.pink, (xx, yy) => (yy & 1) === 0 && (xx & 3) === ((yy >> 1) & 1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * L.w + x;
          const d = L.spore[i];
          if (d < 0.08 || !L.revealed[i] || L.terrain[i] !== T_FLOOR) continue;
          ctx.drawImage(d > 0.5 ? dense : thin, x * 16, y * 16);
        }
      }
    }
    if (o.overlays.heat) {
      // Hot ground (within 2 tiles of magma): dashed diagonal hatching in #cf573c.
      // Warm ground (3-4 tiles): sparse #da863e dots. Foundations neutralize both (grey).
      const hatch = (xx: number, yy: number) => ((yy >> 1) & 1) === 0 && ((xx + yy) & 3) === 0;
      const dots = (xx: number, yy: number) => (xx & 3) === 2 && (yy & 3) === 2;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * L.w + x;
          const h = L.hot[i];
          if (!h || !L.revealed[i] || L.terrain[i] !== T_FLOOR) continue;
          const f = L.foundation[i] === 1;
          const tile = h >= 2 ? this.patternTile(f ? 'hotF' : 'hot', f ? C.steel : C.coral, hatch) : this.patternTile(f ? 'warmF' : 'warm', f ? C.steel : C.orange, dots);
          ctx.drawImage(tile, x * 16, y * 16);
        }
      }
    }
    if (o.overlays.interference) this.drawInterference(g, t, blds);
    // The reach of the selected and hovered machine shows whatever the overlay toggle says.
    this.ringFor(g, v.layer, o.selected);
    if (o.hovered !== o.selected) this.ringFor(g, v.layer, o.hovered);
  }

  /**
   * Live interference: jagged arcs between machines that slow each other, always drawn from the
   * lower id to the higher, so a pair that lists each other draws one arc. A Resonance Tap's arcs
   * run from the machines feeding it and carry a highlight pixel toward the tap. A pair a Shield
   * Wall blocks shows the dotted rectangle spanning both footprints (where the wall stands) instead.
   */
  private drawInterference(g: Game, t: number, blds: Building[]): void {
    for (const b of blds) {
      const bd = BUILDINGS[b.type];
      const bx = b.x * TILE + bd.size * 8;
      const by = b.y * TILE + bd.size * 8;
      for (const id of b.links) {
        const ob = g.b(id);
        if (!ob) continue;
        const os = BUILDINGS[ob.type].size;
        const ox = ob.x * TILE + os * 8;
        const oy = ob.y * TILE + os * 8;
        if (bd.kind === 'tap') this.arc(ox, oy, bx, by, t, ARC, (t * 0.8 + hash2(b.id, id, 9)) % 1);
        else if (b.id < id) this.arc(bx, by, ox, oy, t, ARC);
        else this.arc(ox, oy, bx, by, t, ARC);
      }
      if (!b.shielded) continue;
      for (const id of b.shielded) {
        const ob = g.b(id);
        if (!ob) continue;
        const os = BUILDINGS[ob.type].size;
        const rx0 = Math.min(b.x, ob.x);
        const ry0 = Math.min(b.y, ob.y);
        const rx1 = Math.max(b.x + bd.size, ob.x + os);
        const ry1 = Math.max(b.y + bd.size, ob.y + os);
        this.dottedRect(rx0 * TILE, ry0 * TILE, (rx1 - rx0) * TILE, (ry1 - ry0) * TILE, SHIELD);
      }
    }
  }

  /** The ring of building `id`, if it is on this layer and takes part in interference. */
  private ringFor(g: Game, layer: number, id: number | null): void {
    if (id == null || g.s.deepest < INTERFERENCE_LAYER) return;
    const b = g.b(id);
    if (b && b.layer === layer && ringed(b.type)) this.ring(b.x, b.y, BUILDINGS[b.type].size);
  }

  /** How far interference reaches: a dotted square INTERFERENCE_GAP tiles out from a footprint. */
  private ring(x: number, y: number, size: number): void {
    const G = INTERFERENCE_GAP;
    const s = (size + 2 * G) * TILE;
    this.dottedRect((x - G) * TILE, (y - G) * TILE, s, s, RING);
  }

  /** A 1 px dotted outline, one pixel on and one off, anchored to the world so lines never crawl. */
  private dottedRect(x: number, y: number, w: number, h: number, col: string): void {
    const ctx = this.ctx;
    const x1 = x + w - 1;
    const y1 = y + h - 1;
    ctx.fillStyle = col;
    for (let i = x + ((x + y) & 1); i <= x1; i += 2) ctx.fillRect(i, y, 1, 1);
    for (let i = x + ((x + y1) & 1); i <= x1; i += 2) ctx.fillRect(i, y1, 1, 1);
    for (let j = y + 1 + ((x + y + 1) & 1); j < y1; j += 2) ctx.fillRect(x, j, 1, 1);
    for (let j = y + 1 + ((x1 + y + 1) & 1); j < y1; j += 2) ctx.fillRect(x1, j, 1, 1);
  }

  /** A cached 16x16 overlay tile: `on(x, y)` pixels in `col`, the rest transparent. */
  private patternTile(key: string, col: string, on: (x: number, y: number) => boolean): HTMLCanvasElement {
    let c = this.patternCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = TILE;
    c.height = TILE;
    const x = c.getContext('2d')!;
    x.fillStyle = col;
    for (let yy = 0; yy < TILE; yy++) for (let xx = 0; xx < TILE; xx++) if (on(xx, yy)) x.fillRect(xx, yy, 1, 1);
    this.patternCache.set(key, c);
    return c;
  }

  /**
   * A jagged 1 px arc from (x0, y0) to (x1, y1), re-jittered 12 times a second. With `hi` in
   * [0, 1) one ARC_HI pixel also sits that far along it, on one of the arc's own pixels.
   */
  private arc(x0: number, y0: number, x1: number, y1: number, t: number, col: string, hi = -1): void {
    const n = Math.max(2, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 6));
    const seed = Math.floor(t * 12);
    const hk = hi >= 0 ? Math.min(n - 1, Math.floor(hi * n)) : -1;
    let px = x0;
    let py = y0;
    let hx = 0;
    let hy = 0;
    this.ctx.fillStyle = col;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const jx = i < n ? (hash2(i, seed, 7) - 0.5) * 6 : 0;
      const jy = i < n ? (hash2(seed, i, 8) - 0.5) * 6 : 0;
      const nx = x0 + (x1 - x0) * f + jx;
      const ny = y0 + (y1 - y0) * f + jy;
      this.line(px, py, nx, ny);
      if (i - 1 === hk) {
        // The step line() would draw there, rounded the same way.
        const m = Math.max(Math.abs(nx - px), Math.abs(ny - py));
        const s = m ? Math.min(Math.floor(m), Math.round((hi * n - hk) * m)) / m : 0;
        hx = Math.round(px + (nx - px) * s);
        hy = Math.round(py + (ny - py) * s);
      }
      px = nx;
      py = ny;
    }
    if (hk >= 0) {
      this.ctx.fillStyle = ARC_HI;
      this.ctx.fillRect(hx, hy, 1, 1);
    }
  }

  private line(x0: number, y0: number, x1: number, y1: number): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const f = n ? i / n : 0;
      this.ctx.fillRect(Math.round(x0 + (x1 - x0) * f), Math.round(y0 + (y1 - y0) * f), 1, 1);
    }
  }

  // ------------------------------------------------------------ darkness

  /**
   * Light is averaged at tile corners, banded, interpolated per pixel and dithered with a
   * world-anchored Bayer matrix via the stamp sheet (art review issue 9). The tint canvas for the
   * whole layer is patched only where a tile's stamp changed, then the visible part is drawn.
   */
  private drawDarkness(g: Game, v: View, lift?: EndingLook['lift']): void {
    this.blitWorld(this.darkness(g, v.layer, lift), v);
  }

  /**
   * Get a layer drawn ahead (its terrain and, underground, its darkness), so the frame that first
   * shows it doesn't stall on them: the ending warms each layer of its climb before the camera rises
   * into it.
   */
  warm(g: Game, layer: number): void {
    const L = g.layer(layer);
    terrainCanvas(L);
    if (LAYERS[layer].ambient < 1) this.darkness(g, layer);
  }

  /** The layer's darkness tint canvas, patched where a tile's stamp changed (see drawDarkness). */
  private darkness(g: Game, layer: number, lift?: EndingLook['lift']): HTMLCanvasElement {
    const L = g.layer(layer);
    const W = L.w * TILE;
    const H = L.h * TILE;
    let d = this.darks.get(layer);
    if (!d || d.c.width !== W || d.c.height !== H) {
      if (!d && this.darks.size >= DARK_CACHES) {
        // Drop the cache drawn longest ago.
        let old = -1;
        for (const [k, e] of this.darks) if (old < 0 || e.used < this.darks.get(old)!.used) old = k;
        this.darks.delete(old);
      }
      const c = d?.c ?? document.createElement('canvas');
      c.width = W;
      c.height = H;
      const dctx = c.getContext('2d')!;
      dctx.imageSmoothingEnabled = false;
      d = { c, ctx: dctx, stamp: new Uint16Array(L.w * L.h).fill(0xffff), used: 0 };
      this.darks.set(layer, d);
    }
    d.used = ++this.darkUse;
    const cw = L.w + 1;
    const ch = L.h + 1;
    if (this.corners.length !== cw * ch) this.corners = new Uint8Array(cw * ch);
    const light = L.light;
    const rev = L.revealed;
    // The ending lights revealed tiles near the shaft to at least lift.level (tile centres within r).
    const lr2 = lift ? lift.r * lift.r : -1;
    const lt = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= L.w || y >= L.h) return 0;
      const i = y * L.w + x;
      if (!rev[i]) return 0;
      const l = light[i];
      if (lift && l < lift.level) {
        const dx = x * TILE + 8 - lift.x;
        const dy = y * TILE + 8 - lift.y;
        if (dx * dx + dy * dy < lr2) return lift.level;
      }
      return l;
    };
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        this.corners[cy * cw + cx] = lightBand((lt(cx - 1, cy - 1) + lt(cx, cy - 1) + lt(cx - 1, cy) + lt(cx, cy)) / 4);
      }
    }
    const sheet = darkStamps();
    const cb = this.corners;
    const stamp = d.stamp;
    const dctx = d.ctx;
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        const i = y * L.w + x;
        const s = rev[i] ? (cb[y * cw + x] << 6) | (cb[y * cw + x + 1] << 4) | (cb[(y + 1) * cw + x] << 2) | cb[(y + 1) * cw + x + 1] : DARK_SOLID;
        if (s === stamp[i]) continue;
        stamp[i] = s;
        dctx.clearRect(x * TILE, y * TILE, TILE, TILE);
        dctx.drawImage(sheet, (s % 16) * TILE, Math.floor(s / 16) * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    }
    return d.c;
  }

  // ------------------------------------------------------------ the ending: the Heart waking, dawn, the climb

  /**
   * The Heart waking (review 3 A6): rings of light swelling out of its glass core on the beacons'
   * beat (1.67 s), two half a beat apart, fading as they go: a 1 px #a4dddb ring (#ebede9 as it
   * leaves the core) with a #73bed3 ring 2 px inside it; drawn above the darkness. `k` (0..1) fades
   * them all.
   */
  private drawHeartWake(g: Game, v: View, t: number, k: number): void {
    const heart = g.at(v.layer, HEART.x, HEART.y);
    if (!heart || heart.type !== 'heart') return;
    const core = spriteAnchor(this.spriteName(g, heart), 'core');
    const cx = core ? heart.x * TILE + core.x + (core.w >> 1) : HEART.x * TILE + 8;
    const cy = core ? heart.y * TILE + core.y + (core.h >> 1) : HEART.y * TILE + 8;
    const ctx = this.ctx;
    // Each pixel of a ring once (two angles can round to one pixel, which would blend twice).
    const seen = new Set<number>();
    const ring = (r: number, col: string): void => {
      const n = Math.max(24, Math.round((Math.PI * 2 * r) / 1.4));
      ctx.fillStyle = col;
      seen.clear();
      for (let a = 0; a < n; a++) {
        const ang = (a / n) * Math.PI * 2;
        const px = Math.round(cx + Math.cos(ang) * r);
        const py = Math.round(cy + Math.sin(ang) * r);
        const key = py * 65536 + px;
        if (seen.has(key)) continue;
        seen.add(key);
        ctx.fillRect(px, py, 1, 1);
      }
    };
    for (const phase of [0, 0.5]) {
      const f = (t * 0.6 + phase) % 1;
      const r = 12 + 108 * f;
      ctx.globalAlpha = k * 0.9 * Math.pow(1 - f, 0.7);
      ring(r, f < 0.25 ? C.white : C.ice);
      ctx.globalAlpha = k * 0.6 * Math.pow(1 - f, 0.7);
      ring(r - 2, C.cyan);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The dawn sky over the Surface's north edge: the part of the view above the map (world y < 0, the
   * ink outside it), in DAWN_SKY's bands from the horizon up, each blending into the next over a few
   * rows of world-anchored Bayer dither. `amount` (0..1) raises the glow from the horizon; `sun`
   * (0..1) brings the sun's disc up over the edge, east of the old Drill site.
   */
  private drawSky(L: LayerState, v: View, amount: number, sun: number): void {
    const rows = Math.min(v.h, -v.camY);
    // Over the map's width only: beside the map the void stays the void.
    const left = Math.max(0, v.camX);
    const w = Math.min(L.w * TILE, v.camX + v.w) - left;
    if (rows <= 0 || w <= 0) return;
    if (this.sky.width !== w || this.sky.height !== rows) {
      this.sky.width = w;
      this.sky.height = rows;
    }
    const img = this.sctx.createImageData(w, rows);
    const ramp = DAWN_SKY.map((c) => hexToRgb(c));
    const last = ramp.length - 1;
    const reach = DAWN_SKY_H * Math.max(0.02, amount);
    // The sun: its centre comes up from just under the edge until three quarters of the disc show,
    // in a dithered #e8c170 halo.
    const sx = SUN_X;
    const sy = SUN_R + 1 - Math.round((SUN_R * 1.5 + 1) * sun);
    const r2 = SUN_R * SUN_R + SUN_R;
    const rim2 = (SUN_R - 1) * (SUN_R - 1) + SUN_R - 1;
    const halo2 = (SUN_R + 3) * (SUN_R + 3);
    const sunRim = hexToRgb(C.pale);
    const sunCore = hexToRgb(C.white);
    for (let j = 0; j < rows; j++) {
      const wy = v.camY + j;
      const f = Math.min(1, -wy / reach) * last;
      const base = Math.floor(f);
      // Solid bands, dithered only across the middle of each step.
      const frac = Math.max(0, Math.min(1, (f - base - 0.5) * 2.5 + 0.5));
      for (let i = 0; i < w; i++) {
        const wx = left + i;
        let rgb = ramp[Math.min(last, base + (frac > (BAYER[(wy & 3) * 4 + (wx & 3)] + 0.5) / 16 ? 1 : 0))];
        if (sun > 0) {
          const d2 = (wx - sx) * (wx - sx) + (wy - sy) * (wy - sy);
          if (d2 <= r2) rgb = d2 >= rim2 ? sunRim : sunCore;
          else if (d2 <= halo2 && BAYER[(wy & 3) * 4 + (wx & 3)] < 6) rgb = sunRim;
        }
        const p = (j * w + i) * 4;
        img.data[p] = rgb[0];
        img.data[p + 1] = rgb[1];
        img.data[p + 2] = rgb[2];
        img.data[p + 3] = 255;
      }
    }
    this.sctx.putImageData(img, 0, 0);
    this.ctx.drawImage(this.sky, left, v.camY);
  }

  /**
   * The last of the night over the Surface as the ending's camera comes up into it: the map under a
   * #172038 tint (alpha up to NIGHT_ALPHA, like the darkness's own translucent bands), lifting as the
   * dawn comes. Working machines' light spots glow above it (the emissive pass follows).
   */
  private drawNight(L: LayerState, v: View, k: number): void {
    const x0 = Math.max(0, v.camX);
    const y0 = Math.max(0, v.camY);
    const x1 = Math.min(L.w * TILE, v.camX + v.w);
    const y1 = Math.min(L.h * TILE, v.camY + v.h);
    if (x1 <= x0 || y1 <= y0) return;
    this.ctx.globalAlpha = NIGHT_ALPHA * Math.max(0, Math.min(1, k));
    this.ctx.fillStyle = C.navy;
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    this.ctx.globalAlpha = 1;
  }

  /**
   * Dawn on the Surface's ground: #e8c170 pixels in a world-anchored 4x4 Bayer order, thickest at the
   * north edge where the light comes over (DAWN_DITHER), drawn over the terrain and what lies on it,
   * under everything that stands. `amount` (0..1) fades it in.
   */
  private drawDawnGround(L: LayerState, v: View, amount: number): void {
    const ctx = this.ctx;
    if (!this.dawnPatterns.length) {
      for (let k = 0; k <= 16; k++) {
        const c = document.createElement('canvas');
        c.width = 4;
        c.height = 4;
        const pc = c.getContext('2d')!;
        pc.fillStyle = C.pale;
        for (let i = 0; i < 16; i++) if (BAYER[i] < k) pc.fillRect(i % 4, i >> 2, 1, 1);
        this.dawnPatterns.push(ctx.createPattern(c, 'repeat'));
      }
    }
    const top = Math.max(0, v.camY) & ~3;
    const bottom = Math.min(L.h * TILE, v.camY + v.h);
    const x0 = Math.max(0, v.camX);
    const x1 = Math.min(L.w * TILE, v.camX + v.w);
    if (x1 <= x0) return;
    for (let y = top; y < bottom; y += 4) {
      const f = Math.min(1, y / DAWN_FALL);
      const k = Math.round(amount * (DAWN_DITHER[0] + (DAWN_DITHER[1] - DAWN_DITHER[0]) * f));
      const pat = k > 0 ? this.dawnPatterns[k] : null;
      if (!pat) continue;
      ctx.fillStyle = pat;
      ctx.fillRect(x0, y, x1 - x0, 4);
    }
  }

  /**
   * The rock between two layers as the ending's camera rises from `from` up to `to` (review 3 K3):
   * a `w` x `h` strip in world pixels (the app scales it like the world). Each layer's rock tone
   * (`to`'s at the top, `from`'s at the bottom) thins in a wavy, world-anchored Bayer dither into the
   * #090a14 dark between them, crossed by broken seams and flecks; and the shaft's light at column
   * `sx`: a 3 px #73bed3 line with a #a4dddb core and a #ebede9 pulse running up it as `p` (0..1)
   * goes. The rock is drawn once per pair of layers and size (it doesn't shimmer as it slides).
   * Palette colours only.
   */
  riseBand(w: number, h: number, from: number, to: number, sx: number, p: number): HTMLCanvasElement {
    const c = this.band;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.rockBand(w, h, from, to), 0, 0);
    // The shaft's light.
    ctx.fillStyle = C.cyan;
    ctx.fillRect(sx - 1, 0, 3, h);
    ctx.fillStyle = C.ice;
    ctx.fillRect(sx, 0, 1, h);
    const py = Math.round(h - p * (h + 12));
    ctx.fillStyle = C.white;
    ctx.fillRect(sx - 1, py, 3, 12);
    return c;
  }

  /** riseBand's rock, cached for the last pair of layers and size. */
  private rockBand(w: number, h: number, from: number, to: number): HTMLCanvasElement {
    const key = `${w}x${h}:${from}>${to}`;
    if (this.rockKey === key && this.rock) return this.rock;
    const c = this.rock ?? document.createElement('canvas');
    c.width = w;
    c.height = h;
    const img = c.getContext('2d')!.createImageData(w, h);
    const pal = (l: number) => TERRAIN_PAL[Math.max(0, Math.min(TERRAIN_PAL.length - 1, l))];
    const up = pal(to);
    const down = pal(from);
    const ink = hexToRgb(C.ink);
    const [upTop, upTop2, upFace, upFleck] = [up.top, up.top2, up.face, up.fleck].map(hexToRgb);
    const [dnTop, dnTop2, dnFace, dnFleck] = [down.top, down.top2, down.face, down.fleck].map(hexToRgb);
    // The zones' edges wave along the band, so the rock reads as strata, not stripes (per column).
    const wave = new Int8Array(w);
    for (let x = 0; x < w; x++) wave[x] = Math.round(3 * Math.sin(x * 0.07 + from) + 2 * Math.sin(x * 0.19 + to * 1.3));
    // Seams: broken lines along the waves, two in each layer's rock, in 4 px dashes (each on or off).
    const seams = [0.12, 0.3, 0.7, 0.88].map((s) => {
      const on = new Uint8Array((w >> 2) + 1);
      for (let k = 0; k < on.length; k++) on[k] = hash2(k, Math.round(s * 100), 73 + from * 7 + to) > 0.35 ? 1 : 0;
      return { row: Math.round(s * h), on, rgb: s < 0.5 ? upFace : dnFace };
    });
    // Each layer's rock reaches this far into the band (rows), its dither thinning to nothing.
    const reach = h * 0.45;
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const yy = y + wave[x];
        const b = BAYER[(y & 3) * 4 + (x & 3)];
        const du = Math.round(10 * Math.max(0, 1 - yy / reach));
        const dd = Math.round(10 * Math.max(0, 1 - (h - 1 - yy) / reach));
        let v = ink;
        if (b < du) v = yy < reach * 0.35 ? upTop : upTop2;
        else if (b < dd) v = h - 1 - yy < reach * 0.35 ? dnTop : dnTop2;
        for (const s of seams) if (yy === s.row && s.on[x >> 2]) v = s.rgb;
        // A few flecks, only in the rock (in the dark between they would read as stars).
        if ((du > 2 || dd > 2) && hash2(x, y, 79 + from * 7 + to) < 0.008) v = y < h / 2 ? upFleck : dnFleck;
        const i = (y * w + x) * 4;
        d[i] = v[0];
        d[i + 1] = v[1];
        d[i + 2] = v[2];
        d[i + 3] = 255;
      }
    }
    c.getContext('2d')!.putImageData(img, 0, 0);
    this.rock = c;
    this.rockKey = key;
    return c;
  }

  // ------------------------------------------------------------ above the darkness: markers, status, selection

  private drawAboveDark(g: Game, v: View, o: RenderOpts, x0: number, y0: number, x1: number, y1: number, blds: Building[]): void {
    const ctx = this.ctx;
    const L = g.layer(v.layer);
    const t = o.time;
    // Survey markers: deposits found through the dark.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * L.w + x;
        if (L.revealed[i] || !L.surveyed[i] || !L.ore[i]) continue;
        if ((x + y) % 2) continue;
        const it = ITEMS[ORE_LIST[L.ore[i] - 1]];
        if (!it) continue;
        const pulse = Math.floor(t * 3 + x * 0.3) % 3 === 0;
        ctx.fillStyle = pulse ? it.color[1] : it.color[0];
        ctx.fillRect(x * 16 + 6, y * 16 + 6, 3, 3);
      }
    }
    // The open project's beacon through the rock and the dark, until its site is found.
    const def = LAYERS[v.layer];
    const project = g.s.project;
    if (project && PROJECTS[project.id].layer === v.layer) {
      if (def.boreSite && !L.revealed[def.boreSite.y * L.w + def.boreSite.x]) this.beacon(def.boreSite.x * 16 + 8, def.boreSite.y * 16 + 8, t, 'full');
      // The Alien Strata has no bore site (placeFixed would put a drill there): while the Governor is
      // open the Heart gets the same beacon until it is found, and each Engine Node a dimmer one until
      // it wakes (progress.ts nodeAwake: its first Heartstone). A node the rock still hides gets the
      // pip; one in sight gets the ring alone, pinging out from its glass core.
      if (project.id === 'governor') {
        if (!L.revealed[HEART.y * L.w + HEART.x]) this.beacon(HEART.x * 16 + 8, HEART.y * 16 + 8, t, 'full');
        for (const n of ENGINE_NODES) {
          const node = g.at(v.layer, n.x, n.y);
          if (!node || node.type !== 'engine_node' || nodeAwake(node)) continue;
          if (!L.revealed[n.y * L.w + n.x]) {
            this.beacon(n.x * 16 + 8, n.y * 16 + 8, t, 'dim');
            continue;
          }
          const core = spriteLights(this.spriteName(g, node))[0];
          if (core) this.beacon(node.x * TILE + Math.floor(core.x), node.y * TILE + Math.floor(core.y), t, 'ring', core.r + 1);
          else this.beacon(n.x * 16 + 8, n.y * 16 + 8, t, 'ring');
        }
      }
    }
    // Dig queue marks.
    if (L.digQueue.length) {
      ctx.fillStyle = C.gold;
      for (const i of L.digQueue) {
        const x = i % L.w;
        const y = (i / L.w) | 0;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        for (let k = 0; k < 16; k += 4) ctx.fillRect(x * 16 + k, y * 16 + k, 2, 1);
      }
    }
    // Status badges (7x7), centred on the machine's top edge: chutes only ever sit on the right
    // tile of a 2x2's top edge or on the other edges, so the badge never covers one (on a jammed
    // station facing north it covers the lower half of the chute's arrow, right where the belt
    // pushes in, and the tip still shows). Fixed buildings show none, except the jammed one on the
    // Drill, the Heart and an elevator station: a belt is stuck against it (at a station, pushing
    // into the front its arrivals come out of). A belt whose head pushes into another belt's head
    // shows the jammed badge in the middle of its tile (both belts of the pair are marked): stopped
    // items wait at the tile edges, so it sits in the gap between the stuck item and the one queued
    // behind it, over at most 2 px of either.
    const jammed = statusIcon('jammed');
    for (const b of blds) {
      if (b.planned) continue;
      const bd = BUILDINGS[b.type];
      if (bd.kind === 'belt') {
        if (jammed && jamFresh(g, b)) ctx.drawImage(jammed, b.x * 16 + 4, b.y * 16 + 4);
        continue;
      }
      const st: string = b.paused ? 'paused' : b.status;
      if (bd.size < 2 || (bd.fixed && !(st === 'jammed' && (bd.kind === 'drill' || bd.kind === 'heart' || bd.kind === 'elevator')))) continue;
      if (st === 'ok' || st === 'idle') continue;
      if (st === 'no_input' && b.type !== 'generator' && bd.kind !== 'collector' && bd.kind !== 'machine') continue;
      if (st === 'no_input' && Math.floor(t * 1.5) % 2 === 1) continue;
      const ic = statusIcon(st);
      if (ic) ctx.drawImage(ic, b.x * 16 + Math.floor((bd.size * 16 - 7) / 2), b.y * 16 + 1);
    }
    // Hover: corner brackets. Selection: a blinking 1 px outline, #ebede9 / #e8c170 (never a fill).
    // Both also bracket the building's port cells, as its placement ghost did, so a built machine's
    // facing reads at any zoom: where its output (and byproduct) leaves.
    if (o.hovered != null && o.hovered !== o.selected) {
      const b = g.b(o.hovered);
      if (b && b.layer === v.layer) {
        this.drawPortMarks(b);
        const s = BUILDINGS[b.type].size * 16;
        const x = b.x * 16 - 1;
        const y = b.y * 16 - 1;
        const w = s + 2;
        const k = Math.min(5, Math.floor(s / 3));
        ctx.fillStyle = C.silver;
        ctx.fillRect(x, y, k, 1);
        ctx.fillRect(x, y, 1, k);
        ctx.fillRect(x + w - k, y, k, 1);
        ctx.fillRect(x + w - 1, y, 1, k);
        ctx.fillRect(x, y + w - 1, k, 1);
        ctx.fillRect(x, y + w - k, 1, k);
        ctx.fillRect(x + w - k, y + w - 1, k, 1);
        ctx.fillRect(x + w - 1, y + w - k, 1, k);
      }
    }
    if (o.selected != null) {
      const b = g.b(o.selected);
      if (b && b.layer === v.layer) {
        this.drawPortMarks(b);
        const s = BUILDINGS[b.type].size * 16;
        ctx.fillStyle = Math.floor(t * 3) % 2 === 0 ? C.white : C.pale;
        const x = b.x * 16 - 1;
        const y = b.y * 16 - 1;
        ctx.fillRect(x, y, s + 2, 1);
        ctx.fillRect(x, y + s + 1, s + 2, 1);
        ctx.fillRect(x, y, 1, s + 2);
        ctx.fillRect(x + s + 1, y, 1, s + 2);
      }
    }
    // Selection rectangle (dig / remove).
    if (o.rect) {
      const r = o.rect;
      const col = r.kind === 'dig' ? C.gold : C.coral;
      this.dashedRect(r.x0 * 16, r.y0 * 16, (r.x1 - r.x0 + 1) * 16, (r.y1 - r.y0 + 1) * 16, col, t);
    }
    if (o.hoverCell && (o.mode === 'dig' || o.mode === 'survey' || o.mode === 'remove')) {
      const c = o.hoverCell;
      const inside = c.x >= 0 && c.y >= 0 && c.x < L.w && c.y < L.h;
      // Hard rock can't be dug: the dig cursor turns red over it.
      const hard = !inside || L.terrain[c.y * L.w + c.x] === T_HARD;
      ctx.fillStyle = o.mode === 'remove' || (o.mode === 'dig' && hard) ? C.coral : o.mode === 'dig' ? C.gold : C.cyan;
      for (let k = 0; k < 16; k++) {
        if ((k & 1) === 0) continue;
        ctx.fillRect(c.x * 16 + k, c.y * 16, 1, 1);
        ctx.fillRect(c.x * 16 + k, c.y * 16 + 15, 1, 1);
        ctx.fillRect(c.x * 16, c.y * 16 + k, 1, 1);
        ctx.fillRect(c.x * 16 + 15, c.y * 16 + k, 1, 1);
      }
      if (o.mode === 'survey') {
        ctx.fillStyle = C.cyan;
        for (let a = 0; a < 96; a += 2) {
          const ang = (a / 96) * Math.PI * 2;
          ctx.fillRect(Math.round(c.x * 16 + 8 + Math.cos(ang) * 12 * 16), Math.round(c.y * 16 + 8 + Math.sin(ang) * 12 * 16), 2, 2);
        }
      }
    }
  }

  /**
   * A beacon pulsing above the darkness, centred on world pixel (cx, cy): a ring of dots swelling
   * out from radius `r0` and fading, over a square pip. 'full' (a bore site, the Heart): gold, the
   * ring 6 to 36 px, a 5x5 pip with a pale core. 'dim' (a sleeping Engine Node): amber from 60%, the
   * ring 4 to 22 px, a 3x3 pip with a gold core. 'ring': the dim ring alone, 18 px out from `r0`
   * (just outside a node's glass core: its sprite marks the spot). All keep one beat (1.67 s), so
   * the Heart and its nodes pulse together.
   */
  private beacon(cx: number, cy: number, t: number, kind: 'full' | 'dim' | 'ring', r0 = kind === 'full' ? 6 : 4): void {
    const ctx = this.ctx;
    const full = kind === 'full';
    const col = full ? C.gold : C.amber;
    const k = (t * 0.6) % 1;
    const r = r0 + (full ? 30 : 18) * k;
    const dots = full ? 48 : 32;
    ctx.fillStyle = col;
    ctx.globalAlpha = (full ? 1 : 0.6) * (1 - k);
    for (let a = 0; a < dots; a++) {
      const ang = (a / dots) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 1, 1);
    }
    ctx.globalAlpha = 1;
    if (kind === 'ring') return;
    const s = full ? 2 : 1;
    ctx.fillStyle = col;
    ctx.fillRect(cx - s, cy - s, 2 * s + 1, 2 * s + 1);
    ctx.fillStyle = full ? C.pale : C.gold;
    ctx.fillRect(cx - s + 1, cy - s + 1, 2 * s - 1, 2 * s - 1);
  }

  // ------------------------------------------------------------ ghosts

  /**
   * Placement ghosts. A belt or piece is its real tile joined as it would be (curving where the drag
   * turns, side-loading or turning into or out of what stands), its rungs running on real time and
   * its rails in the ghost's colour, with a bold chevron on a belt. A building is its sprite kept
   * whole in the ghost's outline and dither, its dashed footprint, its chutes with the port cells
   * bracketed and a chevron just outside the face its output leaves by. Blocked ghosts are coral,
   * planned ones (built when the depot has the goods) blue. A piece the drag leaves alone is not drawn.
   */
  private drawGhosts(g: Game, v: View, o: RenderOpts): void {
    const ctx = this.ctx;
    for (const gh of o.ghosts) {
      const def = BUILDINGS[gh.type];
      if (!def || gh.skip) continue;
      const px = gh.x * 16;
      const py = gh.y * 16;
      const S = def.size * 16;
      const tint: Exclude<Tint, 'steel'> = !gh.ok ? 'bad' : gh.planned ? 'planned' : 'ok';
      if (this.isFlat(gh.type)) {
        this.drawFlat(g, v.layer, gh, this.ghostFrame(gh.type, o.time), tint, true, true, false);
        continue;
      }
      const gs = this.ghostSprite(gh.type === 'drill' ? 'b_drill' : `b_${gh.type}`, tint);
      if (gs) ctx.drawImage(gs, px - 1, py - 1);
      this.dashedRect(px, py, S, S, TINT_COL[tint], o.time);
      // Where the output (and byproduct) leaves: the same chutes the built sprite gets, the port
      // cells bracketed so the belt can be laid to them, and the chevron in them.
      this.drawChutes(gh, true);
      this.outArrow(gh, tint);
      // A machine that takes part in interference shows how far it reaches.
      if (g.s.deepest >= INTERFERENCE_LAYER && ringed(gh.type)) this.ring(gh.x, gh.y, def.size);
    }
  }

  // ------------------------------------------------------------ the tutorial's guides, hold to remove

  /**
   * Where the tutorial points (RenderOpts.guides): a bracket at each corner of the tile rect, 2 px
   * thick in #e8c170 (#de9e41 as it closes in) inside a #090a14 outline that reads on any floor,
   * swinging 2 to 4 px out and back on the beacons' beat, and a chevron bobbing above the rect
   * pointing down at it. The motion is what catches the eye at zoom 1. Drawn above the darkness and
   * everything built.
   */
  private drawGuides(rects: TileRect[], t: number): void {
    const ctx = this.ctx;
    const beat = (t * 0.6) % 1;
    const out = [2, 3, 4, 3][Math.floor(beat * 4)];
    const col = out >= 3 ? C.pale : C.gold;
    const bob = Math.round(2 * Math.sin(t * 5));
    for (const r of rects) {
      const x0 = r.x * TILE - out;
      const y0 = r.y * TILE - out;
      const x1 = (r.x + r.w) * TILE + out - 1;
      const y1 = (r.y + r.h) * TILE + out - 1;
      const arm = Math.max(5, Math.min(10, Math.floor((Math.min(r.w, r.h) * TILE) / 3)));
      // Each corner as two 2 px bars; the outline first, then the colour over it.
      const bars = (pad: number, c: string) => {
        ctx.fillStyle = c;
        for (const [cx, sx] of [
          [x0, 1],
          [x1, -1],
        ] as const) {
          for (const [cy, sy] of [
            [y0, 1],
            [y1, -1],
          ] as const) {
            const hx = sx > 0 ? cx : cx - arm + 1;
            const vy = sy > 0 ? cy : cy - arm + 1;
            ctx.fillRect(hx - pad, (sy > 0 ? cy : cy - 1) - pad, arm + 2 * pad, 2 + 2 * pad);
            ctx.fillRect((sx > 0 ? cx : cx - 1) - pad, vy - pad, 2 + 2 * pad, arm + 2 * pad);
          }
        }
      };
      bars(1, C.ink);
      bars(0, col);
      // The pointer: the ghost's chevron turned down, over the middle of the top edge.
      const ax = Math.round((x0 + x1 + 1) / 2) - 8;
      const ay = y0 - 15 + bob;
      ctx.drawImage(arrowTile(2, 'ok', col), ax, ay);
    }
  }

  /**
   * Holding the right button on a building to remove it (RenderOpts.removeHold): a 50% #cf573c checker
   * sweeps over its footprint from the left as the hold fills, led by a solid #cf573c line, inside a
   * 1 px #cf573c outline just outside the footprint, so a removal reads as deliberate.
   */
  private drawRemoveHold(r: TileRect & { frac: number }, t: number): void {
    const ctx = this.ctx;
    const x0 = r.x * TILE;
    const y0 = r.y * TILE;
    const w = r.w * TILE;
    const h = r.h * TILE;
    const f = Math.max(0, Math.min(1, r.frac));
    const sw = Math.round(w * f);
    if (!this.removeFill) {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      const pc = c.getContext('2d')!;
      pc.fillStyle = C.coral;
      pc.fillRect(0, 0, 1, 1);
      pc.fillRect(1, 1, 1, 1);
      this.removeFill = ctx.createPattern(c, 'repeat');
    }
    if (sw > 0 && this.removeFill) {
      // The pattern sits in world space (the transform holds the camera), so the checker never crawls.
      ctx.fillStyle = this.removeFill;
      ctx.fillRect(x0, y0, sw, h);
      ctx.fillStyle = C.coral;
      if (sw < w) ctx.fillRect(x0 + sw - 1, y0, 1, h);
    }
    // The outline blinks between coral and ink once the hold is nearly through.
    ctx.fillStyle = f > 0.85 && Math.floor(t * 8) % 2 ? C.ink : C.coral;
    ctx.fillRect(x0 - 1, y0 - 1, w + 2, 1);
    ctx.fillRect(x0 - 1, y0 + h, w + 2, 1);
    ctx.fillRect(x0 - 1, y0, 1, h);
    ctx.fillRect(x0 + w, y0, 1, h);
  }
}

/** Used by the app to colour the minimap etc. */
export function terrainColor(layer: number, t: number): string {
  const p = TERRAIN_PAL[Math.max(0, Math.min(TERRAIN_PAL.length - 1, layer))];
  if (t === T_FLOOR) return p.floor;
  if (t === T_WATER) return C.navy;
  if (t === T_MAGMA) return C.red;
  return p.top;
}
