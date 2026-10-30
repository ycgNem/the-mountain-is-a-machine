// Every recipe (PLAN.md §7.2). Times in seconds at full speed.

export interface RecipeDef {
  id: string;
  name: string;
  machine: string;
  inputs: Record<string, number>;
  /** Pushed out of the machine's front. */
  outputs: Record<string, number>;
  /** Byproduct pushed out of the machine's left side. */
  side?: Record<string, number>;
  time: number;
  /** Generators: kW produced while this recipe runs. */
  powerOut?: number;
  /** Unlock key needed besides the machine itself: 'assay:<id>' or 'made:<item>' (first produced). */
  unlock?: string;
}

function r(
  id: string,
  name: string,
  machine: string,
  inputs: Record<string, number>,
  outputs: Record<string, number>,
  time: number,
  extra: Partial<RecipeDef> = {},
): RecipeDef {
  return { id, name, machine, inputs, outputs, time, ...extra };
}

export const RECIPE_LIST: RecipeDef[] = [
  // Clean ratios (PLAN §7.2): one normal Miner (30/min) feeds whole machines down every chain.

  // Smelter
  r('iron_ingot', 'Iron Ingot', 'smelter', { iron_ore: 2 }, { iron_ingot: 1 }, 4),
  r('copper_ingot', 'Copper Ingot', 'smelter', { copper_ore: 2 }, { copper_ingot: 1 }, 4),
  r('brick', 'Brick', 'smelter', { stone: 2 }, { brick: 1 }, 4),
  r('cobalt_ingot', 'Cobalt Ingot', 'smelter', { cobalt_ore: 2 }, { cobalt_ingot: 1 }, 4, { unlock: 'assay:sapstone' }),

  // Press
  r('iron_plate', 'Iron Plate', 'press', { iron_ingot: 1 }, { iron_plate: 1 }, 4),
  r('gear', 'Gear', 'press', { iron_ingot: 1 }, { gear: 1 }, 4),
  r('copper_wire', 'Copper Wire', 'press', { copper_ingot: 1 }, { copper_wire: 2 }, 4),
  r('steel_beam', 'Steel Beam', 'press', { steel_ingot: 1 }, { steel_beam: 1 }, 4),
  r('mycelium', 'Mycelium Fiber', 'press', { glowcap: 1 }, { mycelium: 2 }, 4, { unlock: 'made:glowcap' }),

  // Foundry
  r('steel_ingot', 'Steel Ingot', 'foundry', { iron_ingot: 1, coal: 1 }, { steel_ingot: 1 }, 4),

  // Assembler
  r('reinforced_plate', 'Reinforced Plate', 'assembler', { iron_plate: 2, brick: 1 }, { reinforced_plate: 1 }, 8),
  r('motor', 'Motor', 'assembler', { gear: 2, copper_wire: 4 }, { motor: 1 }, 8),
  r('drill_bit', 'Drill Bit', 'assembler', { steel_beam: 1, reinforced_plate: 1 }, { drill_bit: 1 }, 8),
  r('insulation', 'Insulation', 'assembler', { resin: 1, mycelium: 1 }, { insulation: 1 }, 6, { unlock: 'made:resin' }),
  r('filter', 'Filter', 'assembler', { resin: 1, mycelium: 3 }, { filter: 1 }, 6, { unlock: 'made:resin' }),
  r('biofuel', 'Biofuel', 'assembler', { spore_dust: 4, glowcap: 1 }, { biofuel: 1 }, 8, { unlock: 'made:glowcap' }),
  r('cobalt_drill_head', 'Cobalt Drill Head', 'assembler', { cobalt_ingot: 2, drill_bit: 1 }, { cobalt_drill_head: 1 }, 8, { unlock: 'assay:sapstone' }),
  r('battery', 'Battery', 'assembler', { charged_crystal: 1, cobalt_ingot: 2 }, { battery: 1 }, 8, { unlock: 'made:charged_crystal' }),
  r('circuit', 'Circuit', 'assembler', { conductive_powder: 2, copper_wire: 4 }, { circuit: 1 }, 8, { unlock: 'assay:chorus_crystal' }),
  r('heat_shield', 'Heat Shield', 'assembler', { aggregate: 4, steel_beam: 1 }, { heat_shield: 1 }, 8, { unlock: 'assay:emberite' }),

  // Fungal chemistry: washing is fast and loses the resin; separating keeps it, slowly.
  r('wash_sapstone', 'Wash Sapstone', 'washer', { sapstone: 1 }, { cobalt_ore: 1 }, 2),
  r('separate_sapstone', 'Separate Sapstone', 'separator', { sapstone: 1 }, { cobalt_ore: 1 }, 6, { side: { resin: 1 } }),

  // Crystal: order matters. Cut then charge, crush then charge, or cut, charge and crush for double powder.
  // The rich route (cut, charge, crush charged) gets twice the powder from scarce crystal; charging grit
  // is quick, so the cheap route (crush, charge grit) saves machines once crystal is slack.
  r('cut_crystal', 'Cut Crystal', 'cutter', { chorus_crystal: 1 }, { cut_crystal: 1 }, 4),
  r('crush_crystal', 'Crush Crystal', 'crusher', { chorus_crystal: 1 }, { crystal_grit: 2 }, 4),
  r('crush_charged', 'Crush Charged Crystal', 'crusher', { charged_crystal: 1 }, { conductive_powder: 2 }, 8),
  r('charge_cut', 'Charge Cut Crystal', 'charger', { cut_crystal: 1 }, { charged_crystal: 1 }, 4),
  r('charge_grit', 'Charge Grit', 'charger', { crystal_grit: 2 }, { conductive_powder: 1 }, 2),
  r('overcharge', 'Overcharge', 'overcharger', { charged_crystal: 1 }, { overcharged_crystal: 1 }, 8),
  r('stabilize', 'Stabilize', 'stabilizer', { overcharged_crystal: 1, insulation: 1 }, { resonant_core: 1 }, 8),

  // Magma: cool it, burn it, or forge it hot.
  r('quench', 'Quench Emberite', 'cooling_bath', { emberite: 1 }, { aggregate: 1 }, 2),
  r('quench_slag', 'Quench Slag', 'cooling_bath', { slag: 2 }, { aggregate: 1 }, 4),
  r('extract', 'Extract Heat', 'thermal_extractor', { emberite: 1 }, {}, 4, { side: { slag: 1 }, powerOut: 220 }),
  r('forge_ember', 'Forge Ember Ingot', 'pressure_forge', { emberite: 2, steel_ingot: 1 }, { hot_ember_ingot: 1 }, 8),
  r('reheat_ember', 'Reheat Ember Ingot', 'pressure_forge', { cold_ember_ingot: 1 }, { hot_ember_ingot: 1 }, 4),
  r('ember_core', 'Ember Core', 'precision_assembler', { hot_ember_ingot: 1, circuit: 2 }, { ember_core: 1 }, 8),
  r('pa_battery', 'Battery', 'precision_assembler', { charged_crystal: 1, cobalt_ingot: 2 }, { battery: 1 }, 4, { unlock: 'made:charged_crystal' }),
  r('pa_circuit', 'Circuit', 'precision_assembler', { conductive_powder: 2, copper_wire: 4 }, { circuit: 1 }, 4),

  // Alien
  r('attune', 'Attune Thrumstone', 'attuner', { thrumstone: 2 }, { engine_glass: 1 }, 8),
];

export const RECIPES: Record<string, RecipeDef> = Object.fromEntries(RECIPE_LIST.map((x) => [x.id, x]));

export function recipesFor(machine: string): RecipeDef[] {
  return RECIPE_LIST.filter((x) => x.machine === machine);
}

/** Generator fuels: seconds one item burns and kW while it burns. */
export const FUELS: Record<string, { time: number; power: number }> = {
  coal: { time: 4, power: 80 },
  biofuel: { time: 8, power: 120 },
  // Surplus resin burns, so a separator line that makes too much is a choice, not a wall.
  resin: { time: 4, power: 60 },
};
