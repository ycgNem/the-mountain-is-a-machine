// Crafting machines, miners, collectors and generators.

import { BUILDINGS } from '../data/buildings';
import { ITEMS } from '../data/items';
import { FUELS, RECIPES } from '../data/recipes';
import type { Game } from './game';
import { OUT_CAP, waitsOnGenerator } from './logistics';
import { TICK, type Building, type Status } from './types';

export function tickProduction(g: Game, layer: number): void {
  const L = g.layer(layer);
  const movers = g.movers[layer];
  for (let i = 0; i < movers.length; i++) {
    const b = g.s.buildings.get(movers[i]);
    if (!b || b.planned) continue;
    b.workT += TICK;
    const def = BUILDINGS[b.type];
    switch (def.kind) {
      case 'machine':
        tickMachine(g, b, L.power.sat);
        break;
      case 'miner':
      case 'collector':
        tickMiner(g, b, L.power.sat);
        break;
      case 'generator':
        tickGenerator(g, b);
        break;
      case 'spore_filter':
        b.status = L.power.sat > 0.5 ? 'ok' : 'no_power';
        b.active = true;
        break;
      case 'lab':
        b.active = b.workT < 2;
        b.status = 'ok';
        break;
      case 'engine_node':
        // The 2 s it spends on each accepted item. With four Heartstones or four wrong items waiting
        // it takes nothing more until they are belted away.
        if (b.craft > 0) b.craft = Math.max(0, b.craft - TICK);
        b.active = b.craft > 0;
        b.status = b.outBuf.length >= OUT_CAP || b.sideBuf.length >= OUT_CAP ? 'blocked' : b.active ? 'ok' : 'idle';
        break;
      case 'drill':
      case 'heart':
        // It takes every project good (extras go to the depot), so it only stops a belt for a good its
        // project never needs, or for an extra the full depot can't stack (b.jamWhy says which).
        b.status = jamFresh(g, b) ? 'jammed' : 'idle';
        break;
      case 'elevator':
        // A station only jams when a belt pushes into its front, the face arrivals come out of.
        b.status = jamFresh(g, b) ? 'jammed' : 'idle';
        break;
    }
  }
}

/** Footprint tiles on awake conduit (Alien Strata). */
export function liveConduitTiles(g: Game, b: Building): number {
  const L = g.layer(b.layer);
  const size = BUILDINGS[b.type].size;
  let n = 0;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (L.conduitLive[(b.y + dy) * L.w + b.x + dx]) n++;
  return n;
}

/** Machines with at least two footprint tiles on awake conduit draw from the conduit pool, not the grid. */
export function onLiveConduit(g: Game, b: Building): boolean {
  return liveConduitTiles(g, b) >= 2;
}

function powerFactor(g: Game, b: Building, sat: number): number {
  const def = BUILDINGS[b.type];
  if (def.power <= 0) return 1;
  if (onLiveConduit(g, b)) return g.layer(b.layer).power.poolSat;
  return sat;
}

function tickMachine(g: Game, b: Building, sat: number): void {
  const rec = b.recipe ? RECIPES[b.recipe] : null;
  if (b.paused && !b.active) {
    b.status = 'paused';
    b.speed = 0;
    return;
  }
  if (!rec) {
    b.active = false;
    b.status = 'no_recipe';
    b.speed = 0;
    return;
  }
  const def = BUILDINGS[b.type];
  if ((def.needsHot || def.needsConduit) && b.envMul <= 0) {
    // The craft stops; the inputs it took go back into its buffer rather than vanish.
    if (b.active && !rec.powerOut) for (const [k, v] of Object.entries(rec.inputs)) b.inBuf[k] = (b.inBuf[k] ?? 0) + v;
    b.active = false;
    b.craft = 0;
    b.status = 'misplaced';
    b.speed = 0;
    return;
  }
  const pf = powerFactor(g, b, sat);
  const speed = b.envMul * pf;
  b.speed = speed;
  if (!b.active) {
    const hasInputs = Object.entries(rec.inputs).every(([k, v]) => (b.inBuf[k] ?? 0) >= v);
    if (!hasInputs) {
      // A wrong item stuck at an input stops the line for good: say so instead of "waiting".
      b.status = jamFresh(g, b) ? 'jammed' : 'no_input';
      return;
    }
    if (!outputRoom(b, rec.outputs, rec.side)) {
      b.status = outputStatus(g, b);
      return;
    }
    for (const [k, v] of Object.entries(rec.inputs)) b.inBuf[k] -= v;
    b.active = true;
    b.craft = 0;
  }
  if (b.craft < rec.time) {
    b.craft += TICK * speed;
    if (speed > 0) b.workT = 0;
  }
  if (b.craft >= rec.time) {
    if (!outputRoom(b, rec.outputs, rec.side)) {
      b.status = outputStatus(g, b);
      return;
    }
    for (const [k, v] of Object.entries(rec.outputs)) {
      for (let n = 0; n < v; n++) b.outBuf.push({ id: k, heat: ITEMS[k]?.hot ? 100 : 0 });
      g.s.stats.produced[k] = (g.s.stats.produced[k] ?? 0) + v;
    }
    if (rec.side) {
      for (const [k, v] of Object.entries(rec.side)) {
        for (let n = 0; n < v; n++) b.sideBuf.push({ id: k, heat: 0 });
        g.s.stats.produced[k] = (g.s.stats.produced[k] ?? 0) + v;
      }
    }
    if (rec.powerOut) g.s.stats.events.thermal_running = 1;
    b.active = false;
    b.craft = 0;
  }
  b.status = pf <= 0.01 ? 'no_power' : speed < 0.98 ? 'slowed' : 'ok';
}

/**
 * A full output: blocked, or idle when only a generator holding all the fuel it can refuses it (it
 * burns more when the layer needs power: waiting for demand is no fault).
 */
function outputStatus(g: Game, b: Building): Status {
  return waitsOnGenerator(g, b) ? 'idle' : 'blocked';
}

function outputRoom(b: Building, out: Record<string, number>, side?: Record<string, number>): boolean {
  let n = 0;
  for (const v of Object.values(out)) n += v;
  if (b.outBuf.length + n > OUT_CAP + Math.max(0, n - 1)) return false;
  if (side) {
    let m = 0;
    for (const v of Object.values(side)) m += v;
    if (b.sideBuf.length + m > OUT_CAP) return false;
  }
  return true;
}

function tickMiner(g: Game, b: Building, sat: number): void {
  if (b.paused) {
    b.status = 'paused';
    b.active = false;
    b.speed = 0;
    return;
  }
  if (!b.ore) {
    b.status = 'misplaced';
    b.active = false;
    return;
  }
  let rate = b.rate;
  if (BUILDINGS[b.type].kind === 'collector') {
    const L = g.layer(b.layer);
    let sum = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) sum += L.spore[(b.y + dy) * L.w + b.x + dx];
    rate = 0.5 * (sum / 4);
    b.rate = rate;
    if (rate <= 0.01) {
      b.status = 'no_input';
      b.active = false;
      return;
    }
  }
  if (b.outBuf.length >= OUT_CAP) {
    b.status = outputStatus(g, b);
    b.active = false;
    return;
  }
  const pf = powerFactor(g, b, sat);
  const speed = b.envMul * pf;
  b.speed = speed;
  b.active = true;
  b.craft += TICK * rate * speed;
  if (speed > 0) b.workT = 0;
  if (b.craft >= 1) {
    b.craft -= 1;
    b.outBuf.push({ id: b.ore, heat: 0 });
    g.s.stats.produced[b.ore] = (g.s.stats.produced[b.ore] ?? 0) + 1;
  }
  b.status = pf <= 0.01 ? 'no_power' : speed < 0.98 ? 'slowed' : 'ok';
}

/**
 * Ticks a refused item keeps a building marked as jammed: a machine, a Drill or the Heart, a station
 * a belt pushes into the front of, and two belts whose heads push into each other.
 */
export const JAM_FRESH = 30;

/** Is this building's last jam recent (within JAM_FRESH ticks)? The renderer's ≠ badge and the hovers read it. */
export function jamFresh(g: Game, b: Building): boolean {
  return b.jamT !== undefined && g.s.tick - b.jamT < JAM_FRESH;
}

/**
 * The inputs a machine's unfinished craft took when it started (they come back if it is removed or
 * its recipe changes). Fuel already burning in a powerOut recipe is spent, like a generator's.
 */
export function craftInputs(b: Building): Record<string, number> {
  if (!b.active || !b.recipe || BUILDINGS[b.type].kind !== 'machine') return {};
  const rec = RECIPES[b.recipe];
  if (!rec || rec.powerOut) return {};
  return { ...rec.inputs };
}

/** Capacity this generator can offer the grid this tick (kW). */
export function generatorCapacity(b: Building): number {
  if (b.burn > 0) return b.fuelPower;
  let best = 0;
  for (const f of Object.keys(FUELS)) if ((b.inBuf[f] ?? 0) > 0) best = Math.max(best, FUELS[f].power);
  return best;
}

function tickGenerator(g: Game, b: Building): void {
  // b.speed holds the load fraction the power solve asked of this generator.
  const load = b.speed;
  if (b.burn > 0) {
    b.burn -= TICK * load;
    if (load > 0) b.workT = 0;
  }
  if (b.burn <= 0 && load > 0) {
    // Burn the hottest fuel on hand first.
    let fuel: string | null = null;
    for (const f of Object.keys(FUELS)) if ((b.inBuf[f] ?? 0) > 0 && (!fuel || FUELS[f].power > FUELS[fuel].power)) fuel = f;
    if (fuel) {
      b.inBuf[fuel]--;
      b.burn += FUELS[fuel].time;
      b.fuelPower = FUELS[fuel].power;
      g.s.stats.events.generator_fueled = 1;
    } else {
      b.burn = 0;
      b.fuelPower = 0;
    }
  }
  b.active = b.burn > 0;
  b.status = b.burn > 0 ? 'ok' : generatorCapacity(b) > 0 ? 'idle' : 'no_input';
}
