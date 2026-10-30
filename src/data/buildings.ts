// Every building (PLAN.md §7.3).

export type BuildingKind =
  | 'belt'
  | 'splitter'
  | 'crossing'
  | 'sorter'
  | 'unloader'
  | 'crate'
  | 'sequencer'
  | 'machine'
  | 'miner'
  | 'generator'
  | 'collector'
  | 'lamp'
  | 'wall'
  | 'foundation'
  | 'spore_filter'
  | 'tap'
  | 'lab'
  | 'depot'
  | 'terminal'
  | 'chute'
  | 'elevator'
  | 'drill'
  | 'engine_node'
  | 'heart';

/**
 * The build bar's tabs. 'strange' holds each layer's own machines, the ones its strange material
 * unlocks (review-3 K4: every tab fits one row); 'special' is the fixed buildings, never on the bar.
 */
export type Category = 'logistics' | 'production' | 'power' | 'utility' | 'strange' | 'special';

export interface BuildingDef {
  id: string;
  name: string;
  kind: BuildingKind;
  size: number;
  /** kW drawn while working. */
  power: number;
  cost: Record<string, number>;
  category: Category;
  /** 'start' | 'milestone:<n>' | 'layer:<n>' | 'assay:<id>' | 'made:<item>' | 'license:<id>' */
  unlock: string;
  blurb: string;
  fixed?: boolean;
  /** Belts: tiles per second. */
  speed?: number;
  /** Miners/harvesters: deposit kinds they can stand on. */
  needsDeposit?: string[];
  needsWater?: boolean;
  needsHot?: boolean;
  needsConduit?: boolean;
  sporeImmune?: boolean;
  /** Crystal machines lose speed to interference. */
  sensitive?: boolean;
  /** Runs faster on hot ground instead of overheating. */
  heatLoving?: boolean;
  /** Power generators (combustion). */
  generator?: boolean;
  lightRadius?: number;
  /** Belt variants keep heat (Insulated Belt). */
  insulated?: boolean;
  /** Must stand at least 8 tiles from any hot ground (Precision Assembler). */
  steadyGround?: boolean;
}

function b(def: Omit<BuildingDef, 'power'> & { power?: number }): BuildingDef {
  return { power: 0, ...def };
}

export const BELT_SPEED = 1.5;
export const EXPRESS_SPEED = 3;

export const BUILDING_LIST: BuildingDef[] = [
  // Logistics
  b({ id: 'belt', name: 'Conveyor', kind: 'belt', size: 1, cost: { iron_plate: 1 }, category: 'logistics', unlock: 'start', speed: BELT_SPEED, blurb: 'Moves items, one per tile. 90/min.' }),
  b({ id: 'splitter', name: 'Splitter', kind: 'splitter', size: 1, cost: { iron_plate: 2, gear: 1 }, category: 'logistics', unlock: 'start', speed: BELT_SPEED, blurb: 'Takes items from behind and deals them front, left and right in turn.' }),
  b({ id: 'crossing', name: 'Crossing', kind: 'crossing', size: 1, cost: { iron_plate: 2 }, category: 'logistics', unlock: 'start', speed: BELT_SPEED, blurb: 'Two lines pass straight through each other.' }),
  b({ id: 'sorter', name: 'Sorter', kind: 'sorter', size: 1, power: 1, cost: { iron_plate: 2, gear: 1, copper_wire: 2 }, category: 'logistics', unlock: 'license:sorter', speed: BELT_SPEED, blurb: 'The chosen item turns left; everything else goes straight on.' }),
  b({ id: 'unloader', name: 'Unloader', kind: 'unloader', size: 1, power: 1, cost: { iron_plate: 3, gear: 2 }, category: 'logistics', unlock: 'layer:1', speed: BELT_SPEED, blurb: 'Pulls the chosen item out of the depot, crate or elevator behind it.' }),
  b({ id: 'crate', name: 'Storage Crate', kind: 'crate', size: 1, cost: { iron_plate: 6 }, category: 'logistics', unlock: 'layer:1', speed: BELT_SPEED, blurb: 'Buffers up to 100 of one item and passes them on in order.' }),
  b({ id: 'express_belt', name: 'Express Belt', kind: 'belt', size: 1, cost: { steel_beam: 1, conductive_powder: 1 }, category: 'logistics', unlock: 'license:express_belt', speed: EXPRESS_SPEED, blurb: 'A faster conveyor. 180/min.' }),
  b({ id: 'insulated_belt', name: 'Insulated Belt', kind: 'belt', size: 1, cost: { iron_plate: 1, insulation: 1 }, category: 'logistics', unlock: 'assay:emberite', speed: BELT_SPEED, insulated: true, blurb: 'A conveyor lined with insulation. Hot items cool 10x slower.' }),
  b({ id: 'sequencer', name: 'Sequencer', kind: 'sequencer', size: 1, power: 2, cost: { circuit: 2, steel_beam: 2 }, category: 'logistics', unlock: 'assay:thrumstone', speed: BELT_SPEED, blurb: 'Takes from its left, then its right, then its left: a strict A, B, A, B stream.' }),
  b({ id: 'chute', name: 'Company Chute', kind: 'chute', size: 1, cost: { iron_plate: 4, gear: 2 }, category: 'logistics', unlock: 'layer:1', blurb: 'Sells what you belt into it, on the spot, at 60% of its value. Contract goods count here too, at 60% of their share of the pay.' }),

  // Production
  b({ id: 'miner', name: 'Miner', kind: 'miner', size: 2, power: 8, cost: { iron_plate: 8, gear: 4 }, category: 'production', unlock: 'start', needsDeposit: ['iron_ore', 'copper_ore', 'stone', 'coal', 'sapstone', 'chorus_crystal', 'emberite', 'thrumstone'], blurb: 'Mines the deposit under it. 30/min on a normal deposit, 60 on a rich one.' }),
  b({ id: 'smelter', name: 'Smelter', kind: 'machine', size: 2, power: 12, cost: { iron_plate: 10, gear: 2 }, category: 'production', unlock: 'start', blurb: 'Smelts ore into ingots and stone into brick.' }),
  b({ id: 'press', name: 'Press', kind: 'machine', size: 2, power: 8, cost: { iron_plate: 6, gear: 4 }, category: 'production', unlock: 'start', blurb: 'Presses ingots into plates, gears, wire and beams.' }),
  b({ id: 'assembler', name: 'Assembler', kind: 'machine', size: 2, power: 15, cost: { iron_plate: 10, gear: 6, copper_wire: 8 }, category: 'production', unlock: 'milestone:4', blurb: 'Joins two different parts into one.' }),
  b({ id: 'foundry', name: 'Foundry', kind: 'machine', size: 2, power: 18, cost: { brick: 12, iron_plate: 6, motor: 2 }, category: 'production', unlock: 'layer:1', blurb: 'Fuses iron ingots and coal into steel.' }),

  // Strange: each layer's own machines, unlocked by its strange material (the fifth tab, key 5)
  b({ id: 'washer', name: 'Washer', kind: 'machine', size: 2, power: 10, cost: { iron_plate: 8, copper_wire: 6, motor: 2 }, category: 'strange', unlock: 'assay:sapstone', needsWater: true, blurb: 'Washes sapstone clean: fast, but the resin goes down the drain. Must touch water.' }),
  b({ id: 'separator', name: 'Separator', kind: 'machine', size: 2, power: 20, cost: { steel_beam: 6, motor: 3 }, category: 'strange', unlock: 'assay:sapstone', blurb: 'Spins sapstone apart: slow, but keeps the resin (out of its left side).' }),
  b({ id: 'harvester', name: 'Fungus Harvester', kind: 'miner', size: 2, power: 4, cost: { iron_plate: 6, gear: 4 }, category: 'strange', unlock: 'layer:2', needsDeposit: ['glowcap'], sporeImmune: true, blurb: 'Harvests glowcaps from a patch.' }),
  b({ id: 'spore_collector', name: 'Spore Collector', kind: 'collector', size: 2, power: 6, cost: { iron_plate: 6, filter: 2 }, category: 'strange', unlock: 'made:glowcap', sporeImmune: true, blurb: 'Pulls spore dust out of the air. The thicker the spores, the faster.' }),
  b({ id: 'cutter', name: 'Crystal Cutter', kind: 'machine', size: 2, power: 10, cost: { steel_beam: 4, motor: 2, cobalt_ingot: 4 }, category: 'strange', unlock: 'assay:chorus_crystal', sensitive: true, blurb: 'Cuts chorus crystal symmetrical. Sensitive to interference.' }),
  b({ id: 'crusher', name: 'Crusher', kind: 'machine', size: 2, power: 12, cost: { steel_beam: 6, gear: 6 }, category: 'strange', unlock: 'assay:chorus_crystal', blurb: 'Crushes crystal to grit. Any charge is lost.' }),
  b({ id: 'charger', name: 'Charger', kind: 'machine', size: 2, power: 30, cost: { copper_wire: 12, cobalt_ingot: 4, steel_beam: 4 }, category: 'strange', unlock: 'assay:chorus_crystal', sensitive: true, blurb: 'Charges cut crystal, or grit into conductive powder. Sensitive to interference.' }),
  b({ id: 'overcharger', name: 'Overcharger', kind: 'machine', size: 2, power: 45, cost: { battery: 2, circuit: 4, steel_beam: 4 }, category: 'strange', unlock: 'made:charged_crystal', sensitive: true, blurb: 'Overcharges a charged crystal. The result shatters on belts: output straight into a Stabilizer.' }),
  b({ id: 'stabilizer', name: 'Stabilizer', kind: 'machine', size: 2, power: 15, cost: { insulation: 4, circuit: 2, steel_beam: 4 }, category: 'strange', unlock: 'made:charged_crystal', blurb: 'Seals an overcharged crystal in insulation: a Resonant Core.' }),
  b({ id: 'cooling_bath', name: 'Cooling Bath', kind: 'machine', size: 2, power: 10, cost: { steel_beam: 6, insulation: 2 }, category: 'strange', unlock: 'assay:emberite', blurb: 'Quenches emberite into heat-resistant aggregate.' }),
  b({ id: 'pressure_forge', name: 'Pressure Forge', kind: 'machine', size: 2, power: 40, cost: { heat_shield: 2, steel_beam: 8, motor: 4 }, category: 'strange', unlock: 'assay:emberite', needsHot: true, heatLoving: true, blurb: 'Forges emberite and steel into a molten ingot. Only works on hot ground.' }),
  b({ id: 'precision_assembler', name: 'Precision Assembler', kind: 'machine', size: 2, power: 50, cost: { circuit: 6, battery: 2, steel_beam: 8 }, category: 'strange', unlock: 'assay:emberite', steadyGround: true, blurb: 'Builds Ember Cores from molten ingots, and fast batteries and circuits. Needs steady ground: at least 8 tiles from any hot ground.' }),
  b({ id: 'attuner', name: 'Attuner', kind: 'machine', size: 2, power: 30, cost: { heat_shield: 2, circuit: 6, battery: 2 }, category: 'strange', unlock: 'assay:thrumstone', needsConduit: true, blurb: 'Attunes thrumstone into engine glass. Works only with two or more tiles on an awake conduit, and draws from the conduit, not the grid.' }),

  // Power
  b({ id: 'generator', name: 'Combustion Generator', kind: 'generator', size: 2, cost: { brick: 10, iron_plate: 8, motor: 2 }, category: 'power', unlock: 'layer:1', generator: true, blurb: 'Burns coal (80 kW), biofuel (120 kW) or resin (60 kW). Only burns what the grid needs.' }),
  b({ id: 'thermal_extractor', name: 'Thermal Extractor', kind: 'machine', size: 2, cost: { steel_beam: 8, aggregate: 4, circuit: 2 }, category: 'power', unlock: 'assay:emberite', blurb: 'Drains emberite of its heat: 220 kW. Slag comes out of its left side; a Cooling Bath turns slag into aggregate.' }),
  b({ id: 'resonance_tap', name: 'Resonance Tap', kind: 'tap', size: 2, cost: { circuit: 4, copper_wire: 10 }, category: 'power', unlock: 'made:charged_crystal', blurb: 'Turns interference into power: 20 kW for each working machine (8 kW or more) within 2 tiles of it, up to 6.' }),

  // Utility
  b({ id: 'lamp', name: 'Lamp', kind: 'lamp', size: 1, cost: { iron_plate: 1, copper_wire: 1 }, category: 'utility', unlock: 'layer:1', lightRadius: 6, blurb: 'Lights the dark around it.' }),
  b({ id: 'shield_wall', name: 'Shield Wall', kind: 'wall', size: 1, cost: { steel_beam: 1, cobalt_ingot: 1 }, category: 'utility', unlock: 'assay:chorus_crystal', blurb: 'Blocks interference between two machines when it stands anywhere in the rectangle that spans them.' }),
  b({ id: 'foundation', name: 'Foundation', kind: 'foundation', size: 1, cost: { aggregate: 2 }, category: 'utility', unlock: 'assay:emberite', blurb: 'Heat-proof floor. A machine standing on foundations does not overheat.' }),
  b({ id: 'spore_filter', name: 'Spore Filter', kind: 'spore_filter', size: 2, power: 10, cost: { filter: 4, iron_plate: 6, motor: 1 }, category: 'utility', unlock: 'made:resin', blurb: 'Clears spores within 6 tiles.' }),
  b({ id: 'assay_lab', name: 'Assay Lab', kind: 'lab', size: 3, power: 10, cost: { iron_plate: 12, copper_wire: 10, brick: 10 }, category: 'utility', unlock: 'layer:2', blurb: 'Studies samples of strange materials. Belt them in.' }),

  // Fixed
  b({ id: 'hq', name: 'HQ', kind: 'depot', size: 3, cost: {}, category: 'special', unlock: 'start', fixed: true, blurb: "The Surface depot. Buildings up here are paid from its stock. Belt goods in to stock it." }),
  b({ id: 'depot', name: 'Depot', kind: 'depot', size: 3, cost: {}, category: 'special', unlock: 'start', fixed: true, blurb: "This layer's depot. Buildings on this layer are paid from its stock." }),
  b({ id: 'terminal', name: 'Shipping Terminal', kind: 'terminal', size: 3, cost: {}, category: 'special', unlock: 'start', fixed: true, blurb: 'Sells everything belted into it at full price. Contract goods delivered here earn their full share of the pay.' }),
  b({ id: 'elevator', name: 'Freight Elevator', kind: 'elevator', size: 3, cost: {}, category: 'special', unlock: 'start', fixed: true, blurb: 'Carries items to the other end of the shaft. Arrivals come out of its front.' }),
  b({ id: 'drill', name: 'The Drill', kind: 'drill', size: 5, cost: {}, category: 'special', unlock: 'start', fixed: true, blurb: 'Belt the project goods in to bore deeper.' }),
  b({ id: 'engine_node', name: 'Engine Node', kind: 'engine_node', size: 3, cost: {}, category: 'special', unlock: 'start', fixed: true, blurb: 'An alien machine. Feed it its sequence and it makes a Heartstone.' }),
  b({ id: 'heart', name: 'The Heart', kind: 'heart', size: 7, cost: {}, category: 'special', unlock: 'start', fixed: true, blurb: "The mountain's engine. Build the Governor here." }),
];

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(BUILDING_LIST.map((x) => [x.id, x]));

export const CATEGORIES: { id: Category; name: string; key: string }[] = [
  { id: 'logistics', name: 'Logistics', key: '1' },
  { id: 'production', name: 'Production', key: '2' },
  { id: 'power', name: 'Power', key: '3' },
  { id: 'utility', name: 'Utility', key: '4' },
  { id: 'strange', name: 'Strange', key: '5' },
];

/** Licenses bought with money. */
export const LICENSES: Record<string, { name: string; price: number; minLayer: number; blurb: string }> = {
  express_belt: { name: 'Express Belt', price: 2500, minLayer: 3, blurb: '180/min, twice a conveyor.' },
};

/** Surface power line upgrades bought with money. */
export const LINE_UPGRADES = [
  { kw: 60, price: 0 },
  { kw: 100, price: 600 },
  { kw: 160, price: 1000 },
];
