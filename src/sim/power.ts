// Per-layer power with shaft cables (PLAN.md §5.4).
//
// Each layer: demand from working machines; fixed supply (Company Line, thermal extractors,
// resonance taps); flexible supply from combustion generators, which only burn what is needed.
// Surplus flows to deficits through the shafts, nearest layers first, within each cable's capacity.

import { BUILDINGS } from '../data/buildings';
import { LINE_UPGRADES } from '../data/buildings';
import { CONDUIT_KW_PER_NODE } from '../data/layers';
import { RECIPES } from '../data/recipes';
import type { Game } from './game';
import { generatorCapacity, onLiveConduit } from './production';

export const CABLE_KW = [60, 150, 400];
export const TAP_KW = 20;
export const TAP_MAX = 6;

export function solvePower(g: Game): void {
  const s = g.s;
  const n = s.layers.length;
  const demand = new Array(n).fill(0);
  const fixed = new Array(n).fill(0);
  const genCap = new Array(n).fill(0);
  const gens: number[][] = Array.from({ length: n }, () => []);
  // The conduit pool: awake Engine Nodes lend power to machines standing on awake conduit.
  const pool = new Array(n).fill(0);
  const poolDemand = new Array(n).fill(0);

  fixed[0] = LINE_UPGRADES[s.lineLevel].kw;
  for (const b of s.buildings.values()) {
    if (b.planned) continue;
    const L = s.layers[b.layer];
    if (!L.open) continue;
    const def = BUILDINGS[b.type];
    switch (def.kind) {
      case 'generator': {
        b.speed = 0;
        const c = generatorCapacity(b);
        genCap[b.layer] += c;
        if (c > 0) gens[b.layer].push(b.id);
        break;
      }
      case 'tap':
        fixed[b.layer] += TAP_KW * Math.min(TAP_MAX, b.links.length);
        break;
      case 'engine_node':
        if (b.stockCount > 0) pool[b.layer] += CONDUIT_KW_PER_NODE;
        break;
      case 'machine': {
        const rec = b.recipe ? RECIPES[b.recipe] : null;
        if (rec?.powerOut) {
          if (b.active && b.craft < rec.time) fixed[b.layer] += rec.powerOut * Math.min(1, b.envMul);
          break;
        }
        // A working machine draws its full rating even when a hazard slows it.
        if (def.power > 0 && b.active && (!rec || b.craft < rec.time)) {
          if (onLiveConduit(g, b)) poolDemand[b.layer] += def.power;
          else demand[b.layer] += def.power;
        }
        break;
      }
      case 'miner':
      case 'collector':
        if (b.active) {
          if (onLiveConduit(g, b)) poolDemand[b.layer] += def.power;
          else demand[b.layer] += def.power;
        }
        break;
      case 'spore_filter':
      case 'lab':
        if (b.active) demand[b.layer] += def.power;
        break;
      case 'sorter':
      case 'unloader':
      case 'sequencer':
        demand[b.layer] += def.power;
        break;
    }
  }

  // Local first: fixed supply, then generators.
  const need = new Array(n).fill(0);
  const spareFixed = new Array(n).fill(0);
  const spareGen = new Array(n).fill(0);
  const genUsed = new Array(n).fill(0);
  const imported = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const f = Math.min(fixed[i], demand[i]);
    spareFixed[i] = fixed[i] - f;
    let rem = demand[i] - f;
    const gu = Math.min(genCap[i], rem);
    genUsed[i] = gu;
    rem -= gu;
    spareGen[i] = genCap[i] - gu;
    need[i] = rem;
  }
  // Shafts: cable capacity between layer a and a+1.
  const capRem = new Array(Math.max(0, n - 1)).fill(0);
  const flow = new Array(Math.max(0, n - 1)).fill(0);
  for (const sh of s.shafts) capRem[sh.layers[0]] = CABLE_KW[sh.tier] ?? 60;
  for (let d = 0; d < n; d++) {
    if (need[d] <= 0) continue;
    for (let dist = 1; dist < n && need[d] > 0; dist++) {
      for (const src of [d - dist, d + dist]) {
        if (src < 0 || src >= n || need[d] <= 0) continue;
        const spare = spareFixed[src] + spareGen[src];
        if (spare <= 0) continue;
        const lo = Math.min(src, d);
        const hi = Math.max(src, d);
        let path = Infinity;
        for (let e = lo; e < hi; e++) path = Math.min(path, capRem[e] ?? 0);
        const x = Math.min(need[d], spare, path);
        if (x <= 0) continue;
        const fromFixed = Math.min(spareFixed[src], x);
        spareFixed[src] -= fromFixed;
        spareGen[src] -= x - fromFixed;
        genUsed[src] += x - fromFixed;
        for (let e = lo; e < hi; e++) {
          capRem[e] -= x;
          flow[e] += src < d ? x : -x;
        }
        need[d] -= x;
        imported[d] += x;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const L = s.layers[i];
    const sat = demand[i] > 0 ? Math.max(0, Math.min(1, (demand[i] - need[i]) / demand[i])) : 1;
    L.power = {
      supply: fixed[i] + genCap[i],
      demand: demand[i],
      sat,
      genCap: genCap[i],
      genUsed: genUsed[i],
      net: fixed[i] + genCap[i] + imported[i] - demand[i],
      pool: pool[i],
      poolDemand: poolDemand[i],
      poolSat: poolDemand[i] > 0 ? Math.max(0, Math.min(1, pool[i] / poolDemand[i])) : 1,
    };
    const load = genCap[i] > 0 ? Math.min(1, genUsed[i] / genCap[i]) : 0;
    for (const id of gens[i]) {
      const b = s.buildings.get(id)!;
      b.speed = load;
    }
  }
  for (const sh of s.shafts) sh.flow = flow[sh.layers[0]] ?? 0;
}
