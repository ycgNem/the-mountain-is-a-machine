// Hazards and light, refreshed a few times a second (PLAN.md §5.10).

import { BUILDINGS } from '../data/buildings';
import { LAYERS } from '../data/layers';
import type { Game } from './game';
import { ORE_LIST } from './mapgen';
import { TAP_KW, TAP_MAX } from './power';
import { liveConduitTiles } from './production';
import { T_MAGMA, type Building, type LayerState } from './types';

export const SPORE_FILTER_RADIUS = 6;
/** Two working machines interfere when the gap between their footprints is this many tiles or less. */
export const INTERFERENCE_GAP = 2;
/** Interferers are working production machines drawing at least this much power. */
export const INTERFERER_MIN_KW = 8;
/** Speed on hot (2) and warm (1) ground: ordinary machines, and the heat family. */
export const HEAT_MUL: Record<number, number> = { 0: 1, 1: 0.75, 2: 0.5 };
export const HEAT_FAMILY_MUL: Record<number, number> = { 0: 1, 1: 1.5, 2: 2 };

/** Unaffected by heat. */
const HEAT_IMMUNE = new Set(['cooling_bath', 'thermal_extractor']);
/** The heat family runs faster on hot ground. */
export const HEAT_FAMILY = new Set(['smelter', 'foundry', 'pressure_forge']);
/** Stabilizers damp interference: they emit none. */
const DAMPERS = new Set(['stabilizer']);

/** Footprint gap in tiles between two buildings (0 = touching), Chebyshev. */
export function footprintGap(ax: number, ay: number, as: number, bx: number, by: number, bs: number): number {
  const gx = Math.max(0, Math.max(ax - (bx + bs), bx - (ax + as)));
  const gy = Math.max(0, Math.max(ay - (by + bs), by - (ay + as)));
  return Math.max(gx, gy);
}

/** Can this building interfere with crystal machines right now? */
export function isInterferer(b: Building): boolean {
  const def = BUILDINGS[b.type];
  if (!b.active || b.planned) return false;
  if (def.kind !== 'machine' && def.kind !== 'miner' && def.kind !== 'collector') return false;
  if (DAMPERS.has(b.type)) return false;
  return def.power >= INTERFERER_MIN_KW;
}

/** Heat grade under a footprint (the hottest uncovered tile): 0 none, 1 warm, 2 hot. */
export function heatUnder(L: LayerState, x: number, y: number, size: number): number {
  let h = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const i = (y + dy) * L.w + x + dx;
      if (!L.foundation[i] && L.hot[i] > h) h = L.hot[i];
    }
  }
  return h;
}

/**
 * Machines that interfere with a sensitive machine or tap at (x, y, size): working interferers whose
 * footprint gap is 2 or less, unless a Shield Wall stands inside the rectangle spanning both.
 */
export function interferersFor(g: Game, li: number, x: number, y: number, size: number, selfId: number, noisy: Building[]): { links: number[]; shielded: number[] } {
  const links: number[] = [];
  const shielded: number[] = [];
  for (const o of noisy) {
    if (o.id === selfId) continue;
    const os = BUILDINGS[o.type].size;
    if (footprintGap(x, y, size, o.x, o.y, os) > INTERFERENCE_GAP) continue;
    if (shieldBetween(g, li, x, y, size, o.x, o.y, os)) shielded.push(o.id);
    else links.push(o.id);
  }
  return { links, shielded };
}

export function center(b: Building): { x: number; y: number } {
  const s = BUILDINGS[b.type].size;
  return { x: b.x + s / 2, y: b.y + s / 2 };
}

export function refreshEnv(g: Game, li: number, full: boolean): void {
  const L = g.layer(li);
  const blds: Building[] = [];
  for (const b of g.s.buildings.values()) if (b.layer === li && !b.planned) blds.push(b);

  // Spores: base field minus powered filters.
  if (L.sporeBase.some((v) => v > 0)) {
    for (let i = 0; i < L.spore.length; i++) L.spore[i] = L.sporeBase[i] / 255;
    for (const b of blds) {
      if (BUILDINGS[b.type].kind !== 'spore_filter' || L.power.sat < 0.5) continue;
      const c = center(b);
      const R = SPORE_FILTER_RADIUS;
      for (let y = Math.floor(c.y - R); y <= Math.ceil(c.y + R); y++) {
        for (let x = Math.floor(c.x - R); x <= Math.ceil(c.x + R); x++) {
          if (x < 0 || y < 0 || x >= L.w || y >= L.h) continue;
          if ((x + 0.5 - c.x) ** 2 + (y + 0.5 - c.y) ** 2 <= R * R) L.spore[y * L.w + x] = 0;
        }
      }
    }
  }

  // Interference sources: working production machines drawing 8 kW or more (dampers emit nothing).
  const noisy = blds.filter(isInterferer);

  let shieldBlocks = false;
  for (const b of blds) {
    const def = BUILDINGS[b.type];
    let mul = 1;
    // Spores
    if (!def.sporeImmune && (def.kind === 'machine' || def.kind === 'miner')) {
      let sum = 0;
      let n = 0;
      for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) {
        sum += L.spore[(b.y + dy) * L.w + b.x + dx];
        n++;
      }
      mul *= 1 - 0.5 * (sum / n);
    }
    // Heat: hot (2) and warm (1) ground; foundations cancel penalty and bonus.
    if (def.kind === 'machine' || def.kind === 'miner' || def.kind === 'collector') {
      const heat = heatUnder(L, b.x, b.y, def.size);
      if (def.needsHot) mul *= heat === 2 ? HEAT_FAMILY_MUL[2] : 0;
      else if (HEAT_FAMILY.has(b.type)) mul *= HEAT_FAMILY_MUL[heat];
      else if (!HEAT_IMMUNE.has(b.type)) mul *= HEAT_MUL[heat];
    }
    // Conduit machines need two footprint tiles on awake conduit.
    if (def.needsConduit && liveConduitTiles(g, b) < 2) mul = 0;
    // Interference
    b.links = [];
    if (b.shielded) delete b.shielded;
    if (def.sensitive || def.kind === 'tap') {
      const r = interferersFor(g, li, b.x, b.y, def.size, b.id, noisy);
      b.links = r.links;
      if (r.shielded.length) {
        b.shielded = r.shielded;
        shieldBlocks = true;
      }
      if (def.sensitive) mul *= Math.max(0.25, 1 - 0.25 * b.links.length);
    }
    b.envMul = mul;
  }
  if (shieldBlocks) g.s.stats.events.shield_blocking = 1;

  computeLight(g, li, L, blds, full);
}

/** Is a built Shield Wall (not a planned ghost) standing anywhere inside the rectangle spanned by both footprints? */
function shieldBetween(g: Game, li: number, ax: number, ay: number, as: number, bx: number, by: number, bs: number): boolean {
  const x0 = Math.min(ax, bx);
  const y0 = Math.min(ay, by);
  const x1 = Math.max(ax + as, bx + bs);
  const y1 = Math.max(ay + as, by + bs);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = g.at(li, x, y);
      if (o && !o.planned && o.type === 'shield_wall') return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------ light

/** Awake conduit: a light every other tile along it, this radius (tiles) and intensity. */
export const CONDUIT_LIGHT_R = 2.5;
export const CONDUIT_LIGHT = 0.7;

const LIGHT_ORE: Record<string, [number, number]> = {
  glowcap: [3, 0.7],
  chorus_crystal: [2.5, 0.6],
  emberite: [2.5, 0.6],
  thrumstone: [2, 0.5],
};

function addLight(L: LayerState, arr: Float32Array, cx: number, cy: number, r: number, inten: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    if (y < 0 || y >= L.h) continue;
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || x >= L.w) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d >= r) continue;
      const v = inten * (1 - (d / r) ** 1.6);
      const i = y * L.w + x;
      if (v > arr[i]) arr[i] = v;
    }
  }
}

function staticLight(g: Game, li: number, L: LayerState): Float32Array {
  const amb = LAYERS[li].ambient;
  const arr = new Float32Array(L.w * L.h).fill(amb);
  if (amb >= 1) return arr;
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x;
      if (!L.revealed[i]) continue;
      const ore = L.ore[i] ? ORE_LIST[L.ore[i] - 1] : null;
      if (ore && LIGHT_ORE[ore] && (x + y) % 2 === 0) addLight(L, arr, x + 0.5, y + 0.5, LIGHT_ORE[ore][0], LIGHT_ORE[ore][1]);
      if (L.terrain[i] === T_MAGMA && (x + y) % 2 === 0) addLight(L, arr, x + 0.5, y + 0.5, 3.5, 0.85);
      // Awake conduit glows enough that a belt laid along it sits in a light band (0 or 0.35 tint),
      // never the 0.65 band where its rungs and direction vanish. Dormant conduit stays unlit.
      if (L.conduitLive[i] && (x + y) % 2 === 0) addLight(L, arr, x + 0.5, y + 0.5, CONDUIT_LIGHT_R, CONDUIT_LIGHT);
    }
  }
  return arr;
}

function computeLight(g: Game, li: number, L: LayerState, blds: Building[], full: boolean): void {
  if (LAYERS[li].ambient >= 1) {
    L.light.fill(1);
    return;
  }
  if (full || g.staticLight[li].length !== L.w * L.h) g.staticLight[li] = staticLight(g, li, L);
  L.light.set(g.staticLight[li]);
  for (const b of blds) {
    const def = BUILDINGS[b.type];
    const c = center(b);
    if (def.kind === 'lamp') addLight(L, L.light, c.x, c.y, def.lightRadius ?? 6, 1);
    else if (def.fixed) addLight(L, L.light, c.x, c.y, def.size + 2.5, 0.95);
    else if (def.size >= 2) addLight(L, L.light, c.x, c.y, b.workT < 1 ? 4 : 2.6, b.workT < 1 ? 0.85 : 0.6);
    else addLight(L, L.light, c.x, c.y, 1.6, 0.5);
  }
}

/**
 * How a building placed here would run: heat grade, interfering machines, the mean spore density
 * under it (0..1, only for machines and miners that spores slow), speed, and a tap's output.
 */
export function predictPlacement(g: Game, type: string, li: number, x: number, y: number): { heat: number; links: number; spores: number; mul: number; tapKw: number } {
  const def = BUILDINGS[type];
  const L = g.layer(li);
  const heat = heatUnder(L, x, y, def.size);
  let mul = 1;
  // Spores, as refreshEnv counts them (the current field, powered filters included).
  let spores = 0;
  if (!def.sporeImmune && (def.kind === 'machine' || def.kind === 'miner')) {
    let sum = 0;
    let n = 0;
    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) continue;
        sum += L.spore[cy * L.w + cx];
        n++;
      }
    }
    spores = n ? sum / n : 0;
    mul *= 1 - 0.5 * spores;
  }
  if (def.kind === 'machine' || def.kind === 'miner' || def.kind === 'collector') {
    if (def.needsHot) mul *= heat === 2 ? HEAT_FAMILY_MUL[2] : 0;
    else if (HEAT_FAMILY.has(type)) mul *= HEAT_FAMILY_MUL[heat];
    else if (!HEAT_IMMUNE.has(type)) mul *= HEAT_MUL[heat];
  }
  let links = 0;
  if (def.sensitive || def.kind === 'tap') {
    const noisy = [...g.s.buildings.values()].filter((b) => b.layer === li && isInterferer(b));
    links = interferersFor(g, li, x, y, def.size, -1, noisy).links.length;
    if (def.sensitive) mul *= Math.max(0.25, 1 - 0.25 * links);
  }
  return { heat, links, spores, mul, tapKw: def.kind === 'tap' ? TAP_KW * Math.min(TAP_MAX, links) : 0 };
}

/** Is this machine unaffected by heat? */
export function heatProof(type: string): boolean {
  return HEAT_IMMUNE.has(type);
}
