// Drill project sizing (PLAN.md §8): the two reference lines, computed from the recipe data.
//
// The first chain is one machine (or Miner) per recipe, Miners at 30 a minute (15 on the Crystal
// Depths' poor vents): its time is the busiest machine's. The 10-minute line is the machines needed to
// finish in 10 minutes. From D3 on, every project takes the first chain 25-35 minutes and needs a
// 10-minute line of 24-45 machines. D1 and D2 are the tutorials: D1 about 9 minutes, D2's first chain
// at most 22. From D2 on, each project asks for more machine-minutes than the one before.

import { describe, expect, it } from 'vitest';
import { NODE_ITEM_TIME } from '../src/data/layers';
import { PROJECTS } from '../src/data/progression';
import { RECIPES } from '../src/data/recipes';

/** The recipe the reference chain uses for each made item (the rich crystal route for powder). */
const ROUTE: Record<string, string> = {
  iron_ingot: 'iron_ingot',
  copper_ingot: 'copper_ingot',
  brick: 'brick',
  cobalt_ingot: 'cobalt_ingot',
  iron_plate: 'iron_plate',
  gear: 'gear',
  copper_wire: 'copper_wire',
  steel_beam: 'steel_beam',
  mycelium: 'mycelium',
  steel_ingot: 'steel_ingot',
  reinforced_plate: 'reinforced_plate',
  motor: 'motor',
  drill_bit: 'drill_bit',
  insulation: 'insulation',
  filter: 'filter',
  cobalt_drill_head: 'cobalt_drill_head',
  battery: 'battery',
  circuit: 'circuit',
  heat_shield: 'heat_shield',
  cut_crystal: 'cut_crystal',
  charged_crystal: 'charge_cut',
  conductive_powder: 'crush_charged',
  overcharged_crystal: 'overcharge',
  resonant_core: 'stabilize',
  aggregate: 'quench',
  hot_ember_ingot: 'forge_ember',
  ember_core: 'ember_core',
  engine_glass: 'attune',
};
const MINED = new Set(['iron_ore', 'copper_ore', 'stone', 'coal', 'sapstone', 'glowcap', 'chorus_crystal', 'emberite', 'thrumstone', 'spore_dust']);
/** A Miner on a normal deposit makes 30 a minute; the Crystal Depths' chorus vents are poor (15). */
function minerRate(ore: string): number {
  return ore === 'chorus_crystal' ? 15 : 30;
}

/** Minutes of work per machine (recipe id, `miner:<ore>` or `engine_node`) to make a project. */
function work(needs: Record<string, number>): Record<string, number> {
  const w: Record<string, number> = {};
  const add = (k: string, minutes: number) => (w[k] = (w[k] ?? 0) + minutes);
  let resin = 0;
  let cobaltOre = 0;
  const make = (item: string, n: number): void => {
    if (item === 'heartstone') {
      // An Engine Node takes two Engine Glass and two Resonant Cores, one at a time.
      add('engine_node', (n * 4 * NODE_ITEM_TIME) / 60);
      make('engine_glass', 2 * n);
      make('resonant_core', 2 * n);
    } else if (item === 'resin') resin += n;
    else if (item === 'cobalt_ore') cobaltOre += n;
    else if (MINED.has(item)) add(`miner:${item}`, n / minerRate(item));
    else {
      const r = RECIPES[ROUTE[item]];
      if (!r) throw new Error(`no reference route for ${item}`);
      const crafts = n / r.outputs[item];
      add(r.id, (crafts * r.time) / 60);
      for (const [k, v] of Object.entries(r.inputs)) make(k, v * crafts);
    }
  };
  for (const [k, v] of Object.entries(needs)) make(k, v);
  // Sapstone: separate for the resin (cobalt ore comes with it), wash for the rest of the ore.
  const separated = resin;
  const washed = Math.max(0, cobaltOre - separated);
  if (separated) add('separate_sapstone', (separated * RECIPES.separate_sapstone.time) / 60);
  if (washed) add('wash_sapstone', (washed * RECIPES.wash_sapstone.time) / 60);
  if (separated + washed) add('miner:sapstone', (separated + washed) / minerRate('sapstone'));
  return w;
}

function lines(needs: Record<string, number>): { firstChain: number; tenMinuteLine: number; machineMinutes: number } {
  const t = Object.values(work(needs));
  return {
    firstChain: Math.max(...t),
    tenMinuteLine: t.reduce((a, m) => a + Math.ceil(m / 10 - 1e-9), 0),
    machineMinutes: t.reduce((a, m) => a + m, 0),
  };
}

describe('drill project sizing (PLAN §8)', () => {
  it('D1 is the tutorial: about 9 minutes on the first chain', () => {
    expect(lines(PROJECTS.d1.needs).firstChain).toBeLessThanOrEqual(10);
  });

  it('D2 is the second tutorial: first chain at most 22 min', () => {
    const l = lines(PROJECTS.d2.needs);
    expect(l.firstChain).toBeLessThanOrEqual(22);
    expect(l.firstChain).toBeGreaterThan(lines(PROJECTS.d1.needs).firstChain);
  });

  const banded = ['d3', 'd4', 'd5', 'governor'];
  it.each(banded)('%s: first chain 25-35 min, 10-minute line 24-45 machines', (id) => {
    const l = lines(PROJECTS[id].needs);
    expect(l.firstChain).toBeGreaterThanOrEqual(25);
    expect(l.firstChain).toBeLessThanOrEqual(35);
    expect(l.tenMinuteLine).toBeGreaterThanOrEqual(24);
    expect(l.tenMinuteLine).toBeLessThanOrEqual(45);
  });

  it('every project from D2 on asks for more work than the one before', () => {
    const later = ['d2', ...banded];
    const mm = later.map((id) => lines(PROJECTS[id].needs).machineMinutes);
    for (let i = 1; i < mm.length; i++) expect(mm[i], `${later[i]} after ${later[i - 1]}`).toBeGreaterThan(mm[i - 1]);
  });

  it('chorus crystal: the rich route doubles the powder per crystal, the cheap route saves machines', () => {
    // Machines for 60 conductive powder a minute: crafts a minute needed over crafts a minute per machine.
    const perMin = (id: string) => 60 / RECIPES[id].time;
    const rich = { crystal: 30, machines: 30 / perMin('cut_crystal') + 30 / perMin('charge_cut') + 30 / perMin('crush_charged') };
    const cheap = { crystal: 60, machines: 60 / perMin('crush_crystal') + 60 / perMin('charge_grit') };
    expect(rich).toEqual({ crystal: 30, machines: 8 });
    expect(cheap).toEqual({ crystal: 60, machines: 6 });
    // The vents are poor: one gives 15 crystal a minute (30 powder on the rich route, 15 on the cheap
    // one), all three 45. Crystal is scarce at first, so the rich route opens and the cheap one saves
    // machines later.
    expect(minerRate('chorus_crystal') * 3).toBe(45);
  });
});
