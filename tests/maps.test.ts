import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { ENGINE_NODES, HEART, LAYERS } from '../src/data/layers';
import { PROJECTS } from '../src/data/progression';
import { Game } from '../src/sim/game';
import { heatUnder } from '../src/sim/env';
import { AMBER_DECOR } from '../src/sim/mapgen';
import { completeProject } from '../src/sim/progress';
import { T_FLOOR, T_ROCK, type LayerState } from '../src/sim/types';

/** The seed every new game uses, plus two others to catch layouts that only work by luck. */
const SEEDS = [20261030, 1, 777];

function openAll(seed: number): Game {
  const g = Game.create(seed);
  while (g.s.project && PROJECTS[g.s.project.id].opens > 0) {
    const p = g.s.project;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
  }
  return g;
}

/** Cells reachable from (x, y) by walking floor and digging rock. */
function reach(L: LayerState, x: number, y: number): Uint8Array {
  const seen = new Uint8Array(L.w * L.h);
  const q = [y * L.w + x];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const cx = i % L.w;
    const cy = (i / L.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const j = ny * L.w + nx;
      if (seen[j]) continue;
      const t = L.terrain[j];
      if (t !== T_FLOOR && t !== T_ROCK) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

/** Is there a size×size block, all floor (or rock you can dig), meeting `ok` for some cell? */
function someBlock(L: LayerState, size: number, cellOk: (i: number) => boolean, anyOk: (i: number) => boolean, x0 = 0, y0 = 0, x1 = L.w, y1 = L.h): boolean {
  for (let y = Math.max(1, y0); y + size <= Math.min(L.h - 1, y1); y++) {
    for (let x = Math.max(1, x0); x + size <= Math.min(L.w - 1, x1); x++) {
      let all = true;
      let any = false;
      for (let dy = 0; dy < size && all; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const i = (y + dy) * L.w + x + dx;
          if (!cellOk(i)) {
            all = false;
            break;
          }
          if (anyOk(i)) any = true;
        }
      }
      if (all && any) return true;
    }
  }
  return false;
}

describe.each(SEEDS)('maps (seed %i)', (seed) => {
  const g = openAll(seed);

  it('every deposit has room for a full-coverage miner, reachable from the shaft', () => {
    for (const def of LAYERS) {
      const L = g.layer(def.index);
      const start = def.arrival ?? { x: 30, y: 20 };
      const seen = reach(L, start.x, start.y);
      for (const d of def.deposits) {
        const type = d.ore === 'glowcap' ? 'harvester' : 'miner';
        let found = false;
        for (let y = d.y - d.r - 1; y <= d.y + d.r && !found; y++) {
          for (let x = d.x - d.r - 1; x <= d.x + d.r && !found; x++) {
            const info = g.minerInfo(def.index, x, y, BUILDINGS[type]);
            if (info.ore !== d.ore || info.coverage < 1) continue;
            const cells = g.footprintCells(def.index, x, y, 2);
            if (cells.every((i) => L.terrain[i] === T_FLOOR && seen[i] && L.occ[i] < 0)) found = true;
          }
        }
        expect(found, `${def.id}: ${d.ore} at ${d.x},${d.y}`).toBe(true);
      }
    }
  });

  it('every layer has a depot by its station with room to work beside it, asking for its own goods', () => {
    // The HQ's rows are its floor ("Keep for the Surface").
    expect(g.layer(0).requests).toEqual(LAYERS[0].requests);
    for (const def of LAYERS) {
      if (!def.arrival) continue;
      const L = g.layer(def.index);
      const a = def.arrival;
      expect(L.requests, def.id).toEqual(def.requests);
      expect(g.at(def.index, a.x + 2, a.y - 1)?.type, def.id).toBe('depot');
      expect(g.at(def.index, a.x, a.y)?.type, def.id).toBe('elevator');
      // The column east of the depot is open floor, for unloaders.
      for (let y = a.y - 1; y <= a.y + 1; y++) expect(L.terrain[y * L.w + a.x + 5], `${def.id} ${a.x + 5},${y}`).toBe(T_FLOOR);
    }
  });

  it('every bore site holds the next rig and can be dug to', () => {
    for (const def of LAYERS) {
      if (!def.boreSite || def.index === 0) continue;
      const L = g.layer(def.index);
      const b = def.boreSite;
      const a = def.arrival!;
      // The rig on this layer was removed when it broke through; its 5x5 is floor.
      for (let y = b.y - 2; y <= b.y + 2; y++) for (let x = b.x - 2; x <= b.x + 2; x++) expect(L.terrain[y * L.w + x], `${def.id} ${x},${y}`).toBe(T_FLOOR);
      expect(reach(L, a.x, a.y)[b.y * L.w + b.x], def.id).toBe(1);
    }
  });

  it('the fungal caverns have water a washer can touch', () => {
    const L = g.layer(2);
    const seen = reach(L, LAYERS[2].arrival!.x, LAYERS[2].arrival!.y);
    const floor = (i: number) => L.terrain[i] === T_FLOOR && seen[i] === 1;
    // A 2x2 floor block with water on one of its sides.
    let ok = false;
    for (let y = 1; y < L.h - 3 && !ok; y++) {
      for (let x = 1; x < L.w - 3 && !ok; x++) {
        const cells = g.footprintCells(2, x, y, 2);
        if (!cells.every(floor)) continue;
        if (g.touchesTerrain(2, x, y, 2, 3)) ok = true;
      }
    }
    expect(ok).toBe(true);
  });

  it('the magma shelf has hot ground a forge can stand on', () => {
    const L = g.layer(4);
    const seen = reach(L, LAYERS[4].arrival!.x, LAYERS[4].arrival!.y);
    expect(someBlock(L, 2, (i) => L.terrain[i] === T_FLOOR && seen[i] === 1, (i) => L.hot[i] === 2)).toBe(true);
  });

  it('every vent is exactly one Miner footprint, and the emberite vents sit on hot ground', () => {
    for (const def of LAYERS) {
      const L = g.layer(def.index);
      for (const d of def.deposits) {
        if (!d.vent) continue;
        let n = 0;
        for (let y = d.y - 3; y <= d.y + 3; y++) for (let x = d.x - 3; x <= d.x + 3; x++) if (L.ore[y * L.w + x] && g.oreName(L.ore[y * L.w + x]) === d.ore) n++;
        expect(n, `${def.id} vent ${d.x},${d.y}`).toBe(4);
        const info = g.minerInfo(def.index, d.x - 1, d.y - 1, BUILDINGS.miner);
        expect(info.coverage, `${def.id} vent ${d.x},${d.y}`).toBe(1);
        if (d.ore === 'emberite') expect(heatUnder(L, d.x - 1, d.y - 1, 2), `${def.id} vent ${d.x},${d.y}`).toBe(2);
        // The Crystal Depths' chorus vents are poor: 15 a minute each, 45 in all.
        if (d.ore === 'chorus_crystal') {
          expect(info.purity, `${def.id} vent ${d.x},${d.y}`).toBe(0);
          expect(Math.round(info.rate * 60), `${def.id} vent ${d.x},${d.y}`).toBe(15);
        }
      }
    }
  });

  it('the Shallows bore site shows amber-sealed rock, and nowhere else does', () => {
    const L = g.layer(1);
    const b = LAYERS[1].boreSite!;
    let near = 0;
    let far = 0;
    for (let i = 0; i < L.w * L.h; i++) {
      if (L.decor[i] !== AMBER_DECOR) continue;
      if (Math.hypot((i % L.w) - b.x, Math.floor(i / L.w) - b.y) <= 9) near++;
      else far++;
    }
    expect(near).toBeGreaterThanOrEqual(6);
    expect(far).toBe(0);
    for (const li of [0, 2, 3, 4, 5]) expect(g.layer(li).decor.includes(AMBER_DECOR), `layer ${li}`).toBe(false);
  });

  it('the Shallows start pocket holds iron and the coal rig', () => {
    const L = g.layer(1);
    const a = LAYERS[1].arrival!;
    const seen = reach(L, a.x, a.y);
    // Walkable with no digging: floor all the way.
    const floorOnly = new Uint8Array(L.w * L.h);
    const q = [a.y * L.w + a.x];
    floorOnly[q[0]] = 1;
    while (q.length) {
      const i = q.pop()!;
      for (const j of [i + 1, i - 1, i + L.w, i - L.w]) {
        if (j < 0 || j >= L.w * L.h || floorOnly[j] || L.terrain[j] !== T_FLOOR) continue;
        floorOnly[j] = 1;
        q.push(j);
      }
    }
    for (const d of LAYERS[1].deposits.filter((d) => !d.hidden && (d.ore === 'iron_ore' || d.ore === 'coal'))) {
      expect(floorOnly[d.y * L.w + d.x], `${d.ore} at ${d.x},${d.y}`).toBe(1);
    }
    expect(seen[a.y * L.w + a.x]).toBe(1);
    const rig = [...g.s.buildings.values()].filter((b) => b.layer === 1 && (b.type === 'generator' || (b.type === 'miner' && b.ore === 'coal')));
    expect(rig.length).toBe(2);
  });

  it('the alien strata have conduits to build on, and every node and the Heart can be reached', () => {
    const L = g.layer(5);
    const a = LAYERS[5].arrival!;
    const seen = reach(L, a.x, a.y);
    expect(someBlock(L, 2, (i) => L.terrain[i] === T_FLOOR && seen[i] === 1 && L.occ[i] < 0, (i) => L.conduit[i] === 1)).toBe(true);
    for (const n of ENGINE_NODES) {
      expect(g.at(5, n.x, n.y)?.type).toBe('engine_node');
      expect(seen[n.y * L.w + n.x + 2], `node ${n.x},${n.y}`).toBe(1);
    }
    expect(g.at(5, HEART.x, HEART.y)?.type).toBe('heart');
    expect(seen[HEART.y * L.w + HEART.x - 4]).toBe(1);
  });
});
