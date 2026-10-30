// Every item in the game (PLAN.md §7.1). Values are what the Shipping Terminal pays.

export interface ItemDef {
  id: string;
  name: string;
  layer: number;
  value: number;
  /** Two palette colors for the code-drawn fallback icon: body, highlight. */
  color: [string, string];
  /** Fallback icon shape. */
  shape: 'lump' | 'bar' | 'plate' | 'gear' | 'coil' | 'block' | 'gem' | 'orb' | 'cap' | 'dust' | 'beam' | 'part' | 'drop';
  /** Items with heat cool on belts (Molten Ember Ingot). */
  hot?: boolean;
  /** Item breaks when it touches a belt (Overcharged Crystal). */
  unstable?: boolean;
  /** Glow color drawn by the renderer (charged/exotic items). */
  glow?: string;
  /** One line shown in tooltips. */
  blurb: string;
  /** A shorter name for tight labels (objective steps), when the full one is long. */
  short?: string;
}

function item(
  id: string,
  name: string,
  layer: number,
  value: number,
  shape: ItemDef['shape'],
  color: [string, string],
  blurb: string,
  extra: Partial<ItemDef> = {},
): ItemDef {
  return { id, name, layer, value, shape, color, blurb, ...extra };
}

export const ITEM_LIST: ItemDef[] = [
  // Layer 0: the Dig Site
  item('iron_ore', 'Iron Ore', 0, 1, 'lump', ['#7a4841', '#ad7757'], 'Rusty rock with iron in it.'),
  item('copper_ore', 'Copper Ore', 0, 1, 'lump', ['#468232', '#da863e'], 'Green-streaked rock with copper in it.'),
  item('stone', 'Stone', 0, 1, 'lump', ['#819796', '#c7cfcc'], 'Plain stone. Bakes into brick.'),
  item('iron_ingot', 'Iron Ingot', 0, 3, 'bar', ['#577277', '#c7cfcc'], 'Smelted iron.'),
  item('copper_ingot', 'Copper Ingot', 0, 3, 'bar', ['#be772b', '#e8c170'], 'Smelted copper.'),
  item('brick', 'Brick', 0, 3, 'block', ['#a53030', '#cf573c'], 'Fired stone. Furnaces are built from it.'),
  item('iron_plate', 'Iron Plate', 0, 4, 'plate', ['#819796', '#ebede9'], 'Pressed iron. The basic building material.'),
  item('gear', 'Gear', 0, 4, 'gear', ['#577277', '#c7cfcc'], 'Pressed iron gear.'),
  item('copper_wire', 'Copper Wire', 0, 2, 'coil', ['#be772b', '#e8c170'], 'Two coils from every copper ingot.'),
  item('reinforced_plate', 'Reinforced Plate', 0, 14, 'plate', ['#577277', '#de9e41'], 'Iron plates riveted over brick.'),

  // Layer 1: the Shallows
  item('coal', 'Coal', 1, 2, 'lump', ['#151d28', '#394a50'], 'Burns in generators; hardens iron into steel.'),
  item('steel_ingot', 'Steel Ingot', 1, 9, 'bar', ['#394a50', '#a8b5b2'], 'Iron and coal, fused.'),
  item('steel_beam', 'Steel Beam', 1, 11, 'beam', ['#394a50', '#a8b5b2'], 'Pressed steel. Holds up everything below.'),
  item('motor', 'Motor', 1, 24, 'part', ['#577277', '#da863e'], 'Gears wound with copper.'),
  item('drill_bit', 'Drill Bit', 1, 40, 'part', ['#394a50', '#de9e41'], 'A steel cutting head on a riveted mount.'),

  // Layer 2: the Fungal Caverns
  item('sapstone', 'Sapstone', 2, 3, 'lump', ['#3c5e8b', '#de9e41'], 'Cobalt ore sealed in fungal resin.'),
  item('cobalt_ore', 'Cobalt Ore', 2, 4, 'lump', ['#253a5e', '#4f8fba'], 'Clean cobalt ore, resin removed.'),
  item('resin', 'Resin', 2, 6, 'drop', ['#be772b', '#e8c170'], 'Amber resin. Insulates heat and seals filters.'),
  item('cobalt_ingot', 'Cobalt Ingot', 2, 12, 'bar', ['#3c5e8b', '#73bed3'], 'Smelted cobalt. Hard and heat-proof.'),
  item('glowcap', 'Glowcap', 2, 2, 'cap', ['#a23e8c', '#a8ca58'], 'A mushroom that glows. Spores pour off it.'),
  item('mycelium', 'Mycelium Fiber', 2, 2, 'coil', ['#d0da91', '#ebede9'], 'Tough fungal thread.'),
  item('spore_dust', 'Spore Dust', 2, 1, 'dust', ['#c65197', '#a8ca58'], 'Spores pulled out of the air.'),
  item('biofuel', 'Biofuel', 2, 8, 'drop', ['#75a743', '#d0da91'], 'Burns hotter and longer than coal.', { glow: '#a8ca58' }),
  item('insulation', 'Insulation', 2, 14, 'block', ['#de9e41', '#e7d5b3'], 'Resin-bound fiber batting.'),
  item('filter', 'Filter', 2, 16, 'block', ['#d0da91', '#be772b'], 'Fiber mesh sealed with resin.'),
  item('cobalt_drill_head', 'Cobalt Drill Head', 2, 120, 'part', ['#3c5e8b', '#de9e41'], 'A drill bit clad in cobalt.'),

  // Layer 3: the Crystal Depths
  item('chorus_crystal', 'Chorus Crystal', 3, 6, 'gem', ['#3c5e8b', '#a4dddb'], 'A crystal that hums when power runs near it.'),
  item('cut_crystal', 'Cut Crystal', 3, 10, 'gem', ['#4f8fba', '#ebede9'], 'Cut and symmetrical. Holds a charge well.'),
  item('crystal_grit', 'Crystal Grit', 3, 3, 'dust', ['#4f8fba', '#a4dddb'], 'Crushed crystal. Any charge is gone.'),
  item('charged_crystal', 'Charged Crystal', 3, 18, 'gem', ['#73bed3', '#ebede9'], 'A cut crystal full of charge.', { glow: '#73bed3' }),
  item('conductive_powder', 'Conductive Powder', 3, 8, 'dust', ['#73bed3', '#ebede9'], 'Charged grit. Conducts like copper.', { glow: '#a4dddb' }),
  item('overcharged_crystal', 'Overcharged Crystal', 3, 0, 'gem', ['#ebede9', '#a4dddb'], 'Unstable. Shatters on a belt: feed it straight into a Stabilizer.', { glow: '#ebede9', unstable: true }),
  item('resonant_core', 'Resonant Core', 3, 90, 'orb', ['#3c5e8b', '#a4dddb'], 'A stabilized overcharge in an insulated casing.', { glow: '#a4dddb' }),
  item('battery', 'Battery', 3, 60, 'part', ['#3c5e8b', '#73bed3'], 'A charged crystal in a cobalt shell.', { glow: '#73bed3' }),
  item('circuit', 'Circuit', 3, 30, 'plate', ['#25562e', '#de9e41'], 'Conductive traces and copper on a board.'),

  // Layer 4: the Magma Shelf
  item('emberite', 'Emberite', 4, 8, 'lump', ['#a53030', '#da863e'], 'An orange mineral that stores heat.', { glow: '#da863e' }),
  item('aggregate', 'Heat-Resistant Aggregate', 4, 14, 'block', ['#4d2b32', '#c09473'], 'Quenched emberite. Shrugs off heat.', { short: 'Aggregate' }),
  item('slag', 'Slag', 4, 1, 'lump', ['#202e37', '#577277'], 'Spent stone. Worth almost nothing.'),
  item('hot_ember_ingot', 'Molten Ember Ingot', 4, 0, 'bar', ['#cf573c', '#e8c170'], 'Forged hot. Below half heat it cools for good: keep it moving, keep it insulated. It cools at once in any container.', { glow: '#e8c170', hot: true }),
  item('cold_ember_ingot', 'Cooled Ember Ingot', 4, 10, 'bar', ['#4d2b32', '#a53030'], 'An ember ingot that cooled. A forge can reheat it.'),
  item('ember_core', 'Ember Core', 4, 160, 'orb', ['#a53030', '#e8c170'], 'A molten heart sealed in circuitry.', { glow: '#da863e' }),
  item('heat_shield', 'Heat Shield', 4, 80, 'plate', ['#4d2b32', '#de9e41'], 'Aggregate tiles on a steel frame.'),

  // Layer 5: the Alien Strata
  item('thrumstone', 'Thrumstone', 5, 15, 'lump', ['#394a50', '#73bed3'], 'Stone that vibrates. Only the mountain can work it.', { glow: '#73bed3' }),
  item('engine_glass', 'Engine Glass', 5, 40, 'gem', ['#19332d', '#a4dddb'], 'Thrumstone attuned on a conduit.', { glow: '#a4dddb' }),
  item('heartstone', 'Heartstone', 5, 400, 'orb', ['#7a367b', '#a4dddb'], 'What the Engine makes when you feed it in order.', { glow: '#df84a5' }),
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]));

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? id;
}

/** The item's short name for tight labels, or its full name. */
export function itemShort(id: string): string {
  return ITEMS[id]?.short ?? ITEMS[id]?.name ?? id;
}
