// Start states for testing, screenshots and critics: ?scenario=<name>.

import { LAYERS } from '../data/layers';
import { ASSAYS, MILESTONES, PROJECTS } from '../data/progression';
import { Game } from '../sim/game';
import { completeProject, startMilestone } from '../sim/progress';
import { T_FLOOR, T_ROCK, type Dir } from '../sim/types';

export const SCENARIOS = ['start', 'surface', 'shallows', 'fungal', 'crystal', 'magma', 'alien', 'ending'];

function runSeconds(g: Game, s: number): void {
  for (let i = 0; i < s * 60; i++) g.tick();
}

/** Complete drill projects until `layer` is open, as if played. */
function advanceTo(g: Game, layer: number): void {
  while (g.s.deepest < layer && g.s.project) {
    const p = g.s.project;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
  }
  // Milestones: mark everything before this layer's act as done.
  const firstOfAct = MILESTONES.findIndex((m) => m.act === layer + 1);
  for (let i = 0; i < firstOfAct; i++) if (!g.s.msDone.includes(MILESTONES[i].n)) g.s.msDone.push(MILESTONES[i].n);
  if (firstOfAct >= 0) startMilestone(g, firstOfAct, true);
  g.s.money = 5000 + layer * 6000;
  g.events.length = 0;
}

/** Open up a box of floor around the shaft so demo lines fit. */
function clearBox(g: Game, layer: number, x0: number, y0: number, x1: number, y1: number): void {
  const L = g.layer(layer);
  for (let y = Math.max(1, y0); y <= Math.min(L.h - 2, y1); y++) {
    for (let x = Math.max(1, x0); x <= Math.min(L.w - 2, x1); x++) {
      const i = y * L.w + x;
      if (L.terrain[i] === T_ROCK) L.terrain[i] = T_FLOOR;
      L.revealed[i] = 1;
    }
  }
  for (let y = Math.max(0, y0 - 1); y <= Math.min(L.h - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(L.w - 1, x1 + 1); x++) L.revealed[y * L.w + x] = 1;
  g.staticLight[layer] = new Float32Array(0);
}

/** Assays as if finished: known, and a lab assay's samples all delivered (its objective reads 20/20, not 0/20). */
function assayed(g: Game, ids: string[]): void {
  for (const id of ids) {
    if (!g.s.assaysDone.includes(id)) g.s.assaysDone.push(id);
    if (ASSAYS[id].lab) g.s.assays[id] = ASSAYS[id].samples;
  }
}

function stock(g: Game, layer: number, items: Record<string, number>): void {
  const L = g.layer(layer);
  for (const [k, v] of Object.entries(items)) L.stock[k] = (L.stock[k] ?? 0) + v;
}

/**
 * A loop out of the depot: an unloader pulls `input` from the depot's east side, the item runs
 * east through each machine, then the line turns and comes back into the depot's south face.
 */
function depotLoop(g: Game, layer: number, input: string, machines: { type: string; recipe?: string }[], row = 0): void {
  const a = LAYERS[layer].arrival!;
  const dx = a.x + 2; // depot top-left
  const dy = a.y - 1;
  const y = dy + row; // row 0 = depot's top row
  const place = (type: string, x: number, yy: number, dir: Dir, opts: { recipe?: string; filter?: string } = {}) => g.place(type, layer, x, yy, dir, { ...opts, noPlan: false });
  place('unloader', dx + 3, y, 1, { filter: input });
  let x = dx + 4;
  for (const m of machines) {
    place('belt', x, y, 1);
    x++;
    // One row up, so the machine's front-right port lands back on the line.
    place(m.type, x, y - 1, 1, { recipe: m.recipe });
    x += 2;
  }
  // Out of the last machine, down, back west along the row under the depot, up into it.
  const back = dy + 3;
  place('belt', x, y, 2);
  for (let yy = y + 1; yy < back; yy++) place('belt', x, yy, 2);
  for (let xx = x; xx > dx + 1; xx--) place('belt', xx, back, 3);
  for (let yy = back; yy > dy + 3; yy--) place('belt', dx + 1, yy, 0);
  place('belt', dx + 1, dy + 3, 0);
}

export function buildScenario(name: string): Game {
  const g = Game.create(20261030);
  g.events.length = 0;
  switch (name) {
    case 'start':
      break;
    case 'surface': {
      // A real mid-Act I state: only what a player has at milestone 4.
      stock(g, 0, { iron_plate: 200, gear: 100, copper_wire: 100, brick: 100 });
      // Copper line: the marked Miner, a Smelter, then west into the terminal's east side.
      g.place('miner', 0, 43, 20, 2);
      g.place('belt', 0, 43, 22, 2);
      g.place('belt', 0, 43, 23, 2);
      g.place('smelter', 0, 42, 24, 3, { recipe: 'copper_ingot' });
      g.place('crossing', 0, 41, 24, 3);
      for (let x = 40; x >= 35; x--) g.place('belt', 0, x, 24, 3);
      // A press making plates off a second iron line, up through the crossing into the drill.
      g.place('miner', 0, 46, 33, 3);
      g.place('belt', 0, 45, 33, 3);
      g.place('smelter', 0, 43, 33, 3, { recipe: 'iron_ingot' });
      g.place('belt', 0, 42, 33, 3);
      g.place('press', 0, 40, 33, 0, { recipe: 'iron_plate' });
      for (let y = 32; y >= 15; y--) if (y !== 24) g.place('belt', 0, 41, y, 0);
      g.place('belt', 0, 41, 14, 3);
      for (let x = 40; x >= 35; x--) g.place('belt', 0, x, 14, 3);
      // Up into the drill's bottom-right corner.
      g.place('belt', 0, 34, 14, 0);
      g.s.money = 2400;
      runSeconds(g, 40);
      startMilestone(g, 3, true);
      g.s.msDone = [1, 2, 3];
      // M3's reward, as if it had been earned.
      if (!g.s.licenses.includes('sorter')) g.s.licenses.push('sorter');
      break;
    }
    case 'shallows': {
      advanceTo(g, 1);
      const a = LAYERS[1].arrival!;
      clearBox(g, 1, a.x - 4, a.y - 5, a.x + 22, a.y + 8);
      stock(g, 1, { iron_ore: 600, coal: 300, iron_plate: 200, gear: 100, copper_wire: 100, brick: 100, motor: 20 });
      depotLoop(g, 1, 'iron_ore', [{ type: 'smelter', recipe: 'iron_ingot' }, { type: 'press', recipe: 'iron_plate' }]);
      for (let k = 0; k < 4; k++) g.place('lamp', 1, a.x - 3 + k * 7, a.y - 4, 0);
      runSeconds(g, 30);
      break;
    }
    case 'fungal': {
      advanceTo(g, 2);
      const a = LAYERS[2].arrival!;
      clearBox(g, 2, a.x - 16, a.y - 8, a.x + 10, a.y + 8);
      assayed(g, ['sapstone', 'resin', 'glowcap']);
      stock(g, 2, { sapstone: 600, iron_plate: 200, gear: 100, copper_wire: 100, brick: 60, steel_beam: 60, motor: 30, filter: 20 });
      depotLoop(g, 2, 'sapstone', [{ type: 'separator', recipe: 'separate_sapstone' }]);
      // The separator's resin leaves from its left face: back west over the top into the depot.
      for (let x = a.x + 8; x >= a.x + 5; x--) g.place('belt', 2, x, a.y - 3, 3);
      g.place('belt', 2, a.x + 4, a.y - 3, 2);
      g.place('belt', 2, a.x + 4, a.y - 2, 2);
      runSeconds(g, 30);
      break;
    }
    case 'crystal': {
      advanceTo(g, 3);
      const a = LAYERS[3].arrival!;
      clearBox(g, 3, a.x - 4, a.y - 6, a.x + 24, a.y + 9);
      assayed(g, ['sapstone', 'resin', 'glowcap', 'chorus_crystal']);
      stock(g, 3, { chorus_crystal: 600, iron_plate: 200, gear: 100, copper_wire: 200, steel_beam: 100, motor: 30, cobalt_ingot: 60 });
      depotLoop(g, 3, 'chorus_crystal', [{ type: 'cutter', recipe: 'cut_crystal' }, { type: 'charger', recipe: 'charge_cut' }]);
      runSeconds(g, 30);
      break;
    }
    case 'magma': {
      advanceTo(g, 4);
      const a = LAYERS[4].arrival!;
      clearBox(g, 4, a.x - 14, a.y - 6, a.x + 10, a.y + 12);
      assayed(g, ['sapstone', 'resin', 'glowcap', 'chorus_crystal', 'charged_crystal', 'emberite']);
      stock(g, 4, { emberite: 600, iron_plate: 200, gear: 100, copper_wire: 100, steel_beam: 100, motor: 30, insulation: 40, aggregate: 60, circuit: 20 });
      depotLoop(g, 4, 'emberite', [{ type: 'cooling_bath', recipe: 'quench' }]);
      runSeconds(g, 30);
      break;
    }
    case 'alien': {
      advanceTo(g, 5);
      const a = LAYERS[5].arrival!;
      clearBox(g, 5, a.x - 6, a.y - 8, a.x + 16, a.y + 6);
      assayed(g, ['sapstone', 'resin', 'glowcap', 'chorus_crystal', 'charged_crystal', 'emberite']);
      stock(g, 5, { thrumstone: 400, engine_glass: 40, resonant_core: 40 });
      runSeconds(g, 20);
      break;
    }
    case 'ending': {
      advanceTo(g, 5);
      const p = g.s.project!;
      for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
      completeProject(g);
      runSeconds(g, 4);
      break;
    }
  }
  g.events.length = 0;
  return g;
}
