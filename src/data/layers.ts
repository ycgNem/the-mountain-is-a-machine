// The six layers (PLAN.md §3, §6). Deposit positions are designed, not random, so every player
// gets the same mountain and the pacing holds. Map generation carves caverns around them.

export type Hazard = 'none' | 'dark' | 'spores' | 'interference' | 'heat' | 'engine';
export type Purity = 0 | 1 | 2; // poor, normal, rich

export interface DepositSpec {
  ore: string; // item id the deposit yields (glowcap = fungus patch)
  x: number;
  y: number;
  r: number; // radius in tiles
  purity: Purity;
  /** Hidden in a cavern you have to dig into (underground layers). */
  hidden?: boolean;
  /** A vent: exactly one 2x2 miner's worth of ore (cells x-1..x, y-1..y), so its output is capped. */
  vent?: boolean;
  /** The crew's running rig is built on this deposit when the layer opens (coal miner + generator). */
  rig?: boolean;
}

export interface LayerDef {
  index: number;
  id: string;
  name: string;
  short: string;
  /** Where the layer is, mid-sentence: "on the Surface", "in the Shallows" (Mags: "Up on the Surface ..."). */
  at: string;
  depth: number;
  w: number;
  h: number;
  /** Light everywhere before lamps and machines (1 = no darkness). */
  ambient: number;
  digCost: number;
  surveyCost: number;
  hazard: Hazard;
  /** Fallback terrain colors: floor (3 tones), wall (2). The darkness tint is #090a14 on every layer. */
  floor: [string, string, string];
  wall: [string, string];
  /** Decor sprite names (STYLE: x_l<layer>_<name>); map decor values 1..n pick from this list. */
  decor: string[];
  /**
   * How often map generation picks each `decor` name, in the same order. The 32 x 32 props (TALL_DECOR)
   * weigh least, about 1 prop in 8 or fewer, so they dress the floor instead of filling it; two never
   * stand within 2 tiles of each other (review-3 A1).
   */
  decorWeights: number[];
  /** Where the shaft from the layer above arrives (center of the 3x3 station). */
  arrival?: { x: number; y: number };
  /** Center of the drill's 5x5 bore site on this layer (where the next shaft goes). */
  boreSite?: { x: number; y: number };
  /** Drill project done on this layer. */
  project: string;
  deposits: DepositSpec[];
  starterCrate: Record<string, number>;
  /**
   * The depot's supply requests when the layer opens: what the elevator keeps here, hauled down from
   * the depot above (the player changes them in the depot inspector). On the Surface they are the
   * HQ's "Keep for the Surface" rows: a floor the elevator never takes the HQ below.
   */
  requests: Record<string, number>;
  title: string;
  subtitle: string;
}

export const LAYERS: LayerDef[] = [
  {
    index: 0,
    id: 'surface',
    name: 'The Dig Site',
    short: 'Surface',
    at: 'on the Surface',
    depth: 0,
    w: 64,
    h: 48,
    ambient: 1,
    digCost: 4,
    surveyCost: 150,
    hazard: 'none',
    floor: ['#c09473', '#ad7757', '#d7b594'],
    wall: ['#7a4841', '#4d2b32'],
    decor: ['x_l0_bush', 'x_l0_grass', 'x_l0_pebbles', 'x_l0_crate_stack', 'x_l0_survey_flag'],
    // The crate stack is 1 prop in 12: it read as the player's storage, bigger than the starter line.
    decorWeights: [3, 3, 3, 1, 2],
    boreSite: { x: 32, y: 11 },
    project: 'd1',
    deposits: [
      { ore: 'iron_ore', x: 17, y: 25, r: 2, purity: 1 },
      { ore: 'iron_ore', x: 47, y: 34, r: 2, purity: 1 },
      { ore: 'copper_ore', x: 44, y: 22, r: 2, purity: 1 },
      { ore: 'copper_ore', x: 12, y: 38, r: 2, purity: 1 },
      { ore: 'stone', x: 28, y: 39, r: 2, purity: 1 },
    ],
    // The player builds the first line now (Act I's tutorial): the crate holds what the line that used
    // to come ready-made cost (a Miner, a Smelter, a Press, a Splitter and 14 belts: 40 plates and 11
    // gears), so Act I's economy is where it was.
    starterCrate: { iron_plate: 140, gear: 41, copper_wire: 20, brick: 30 },
    requests: { iron_plate: 20, gear: 10, copper_wire: 10 },
    title: 'The Dig Site',
    subtitle: 'Old Thrum, Halloran Deep Mining Co.',
  },
  {
    index: 1,
    id: 'shallows',
    name: 'The Shallows',
    short: 'Shallows',
    at: 'in the Shallows',
    depth: 120,
    w: 72,
    h: 52,
    ambient: 0.32,
    digCost: 8,
    surveyCost: 300,
    hazard: 'dark',
    floor: ['#7a4841', '#4d2b32', '#ad7757'],
    wall: ['#4d2b32', '#341c27'],
    decor: ['x_l1_support', 'x_l1_stalagmite', 'x_l1_rubble', 'x_l1_minecart'],
    decorWeights: [1, 7, 7, 1],
    arrival: { x: 32, y: 11 },
    boreSite: { x: 58, y: 40 },
    project: 'd2',
    deposits: [
      { ore: 'iron_ore', x: 25, y: 12, r: 2, purity: 2 },
      { ore: 'coal', x: 40, y: 15, r: 2, purity: 1, rig: true },
      { ore: 'stone', x: 26, y: 20, r: 1, purity: 1 },
      { ore: 'copper_ore', x: 50, y: 24, r: 2, purity: 2, hidden: true },
      { ore: 'iron_ore', x: 12, y: 32, r: 2, purity: 2, hidden: true },
      { ore: 'coal', x: 30, y: 36, r: 2, purity: 1, hidden: true },
      { ore: 'copper_ore', x: 64, y: 12, r: 2, purity: 1, hidden: true },
      { ore: 'stone', x: 46, y: 44, r: 2, purity: 1, hidden: true },
    ],
    starterCrate: { iron_plate: 60, gear: 24, copper_wire: 30, brick: 20, motor: 4 },
    requests: { iron_plate: 40, gear: 20, copper_wire: 20, brick: 20 },
    title: 'The Shallows',
    subtitle: '120 m. Old tool marks in the rock.',
  },
  {
    index: 2,
    id: 'fungal',
    name: 'The Fungal Caverns',
    short: 'Fungal',
    at: 'in the Fungal Caverns',
    depth: 340,
    w: 72,
    h: 52,
    ambient: 0.28,
    digCost: 12,
    surveyCost: 450,
    hazard: 'spores',
    floor: ['#402751', '#1e1d39', '#25562e'],
    wall: ['#241527', '#1e1d39'],
    decor: ['x_l2_mushroom_small', 'x_l2_mushroom_tall', 'x_l2_spore_pod', 'x_l2_moss_clump'],
    decorWeights: [3, 1, 3, 3],
    arrival: { x: 58, y: 40 },
    boreSite: { x: 12, y: 14 },
    project: 'd3',
    deposits: [
      { ore: 'sapstone', x: 46, y: 36, r: 2, purity: 1 },
      { ore: 'glowcap', x: 62, y: 28, r: 2, purity: 1 },
      { ore: 'iron_ore', x: 48, y: 46, r: 2, purity: 1 },
      { ore: 'coal', x: 64, y: 45, r: 2, purity: 1, rig: true },
      { ore: 'sapstone', x: 30, y: 26, r: 2, purity: 1, hidden: true },
      { ore: 'glowcap', x: 42, y: 39, r: 2, purity: 1, hidden: true },
      { ore: 'coal', x: 22, y: 42, r: 2, purity: 1, hidden: true },
      { ore: 'sapstone', x: 14, y: 30, r: 2, purity: 2, hidden: true },
      { ore: 'glowcap', x: 27, y: 22, r: 2, purity: 1, hidden: true },
      { ore: 'copper_ore', x: 40, y: 10, r: 2, purity: 1, hidden: true },
    ],
    starterCrate: { iron_plate: 62, gear: 24, copper_wire: 40, brick: 40, steel_beam: 12, motor: 6 },
    requests: { iron_plate: 40, gear: 20, copper_wire: 20, brick: 30, steel_beam: 20, motor: 10 },
    title: 'The Fungal Caverns',
    subtitle: '340 m. The fungus grows in straight lines.',
  },
  {
    index: 3,
    id: 'crystal',
    name: 'The Crystal Depths',
    short: 'Crystal',
    at: 'in the Crystal Depths',
    depth: 610,
    w: 72,
    h: 52,
    ambient: 0.26,
    digCost: 16,
    surveyCost: 600,
    hazard: 'interference',
    floor: ['#253a5e', '#172038', '#3c5e8b'],
    wall: ['#172038', '#10141f'],
    decor: ['x_l3_crystal_small', 'x_l3_crystal_large', 'x_l3_geode'],
    decorWeights: [3, 1, 3],
    arrival: { x: 12, y: 14 },
    boreSite: { x: 56, y: 12 },
    project: 'd4',
    deposits: [
      { ore: 'chorus_crystal', x: 22, y: 20, r: 1, purity: 0, vent: true },
      { ore: 'iron_ore', x: 24, y: 8, r: 2, purity: 1 },
      { ore: 'chorus_crystal', x: 36, y: 32, r: 1, purity: 0, hidden: true, vent: true },
      { ore: 'coal', x: 14, y: 42, r: 2, purity: 1, hidden: true },
      { ore: 'chorus_crystal', x: 52, y: 38, r: 1, purity: 0, hidden: true, vent: true },
      { ore: 'sapstone', x: 40, y: 18, r: 2, purity: 1, hidden: true },
      { ore: 'iron_ore', x: 62, y: 28, r: 2, purity: 2, hidden: true },
    ],
    starterCrate: { iron_plate: 72, gear: 30, copper_wire: 50, steel_beam: 30, motor: 10, cobalt_ingot: 16, brick: 30 },
    // Insulation: the Stabilizer costs 4 and every Resonant Core takes one.
    requests: { copper_wire: 80, steel_beam: 30, cobalt_ingot: 20, insulation: 20, iron_plate: 30, gear: 20, motor: 10 },
    title: 'The Crystal Depths',
    subtitle: '610 m. The crystals ring in chords.',
  },
  {
    index: 4,
    id: 'magma',
    name: 'The Magma Shelf',
    short: 'Magma',
    at: 'on the Magma Shelf',
    depth: 920,
    w: 72,
    h: 52,
    ambient: 0.36,
    digCost: 20,
    surveyCost: 800,
    hazard: 'heat',
    floor: ['#202e37', '#151d28', '#394a50'],
    wall: ['#151d28', '#10141f'],
    decor: ['x_l4_hex_pillar', 'x_l4_vent', 'x_l4_ember_rock'],
    decorWeights: [1, 3, 3],
    arrival: { x: 56, y: 12 },
    boreSite: { x: 16, y: 40 },
    project: 'd5',
    deposits: [
      { ore: 'emberite', x: 44, y: 20, r: 1, purity: 1, vent: true },
      { ore: 'iron_ore', x: 62, y: 24, r: 2, purity: 2 },
      { ore: 'coal', x: 50, y: 9, r: 2, purity: 1, rig: true },
      { ore: 'emberite', x: 30, y: 30, r: 1, purity: 1, hidden: true, vent: true },
      { ore: 'emberite', x: 14, y: 22, r: 1, purity: 1, hidden: true, vent: true },
      { ore: 'copper_ore', x: 36, y: 44, r: 2, purity: 2, hidden: true },
    ],
    starterCrate: { iron_plate: 72, gear: 30, copper_wire: 50, steel_beam: 40, motor: 12, insulation: 12, circuit: 12, brick: 30 },
    requests: { circuit: 20, steel_beam: 30, insulation: 20, iron_plate: 30, motor: 10, gear: 20 },
    title: 'The Magma Shelf',
    subtitle: '920 m. The basalt grows in perfect hexagons.',
  },
  {
    index: 5,
    id: 'alien',
    name: 'The Alien Strata',
    short: 'Alien',
    at: 'in the Alien Strata',
    depth: 1300,
    w: 72,
    h: 52,
    ambient: 0.3,
    digCost: 30,
    surveyCost: 1000,
    hazard: 'engine',
    floor: ['#394a50', '#202e37', '#577277'],
    wall: ['#202e37', '#151d28'],
    decor: ['x_l5_stone_gear', 'x_l5_glass_shard', 'x_l5_relic'],
    decorWeights: [1, 3, 3],
    arrival: { x: 16, y: 40 },
    project: 'governor',
    deposits: [
      { ore: 'thrumstone', x: 26, y: 30, r: 2, purity: 1 },
      { ore: 'coal', x: 10, y: 44, r: 2, purity: 1, rig: true },
      { ore: 'thrumstone', x: 40, y: 16, r: 2, purity: 2, hidden: true },
      { ore: 'iron_ore', x: 12, y: 12, r: 2, purity: 2, hidden: true },
      { ore: 'thrumstone', x: 60, y: 24, r: 2, purity: 1, hidden: true },
      { ore: 'copper_ore', x: 30, y: 46, r: 2, purity: 2, hidden: true },
    ],
    starterCrate: { iron_plate: 80, gear: 40, copper_wire: 50, steel_beam: 50, motor: 16, circuit: 24, battery: 6, heat_shield: 6, brick: 20 },
    // Plates 60: the Heart's and the nodes' lanes are long.
    requests: { battery: 10, resonant_core: 10, circuit: 20, steel_beam: 30, iron_plate: 60, gear: 20, heat_shield: 10 },
    title: 'The Alien Strata',
    subtitle: '1,300 m. The walls are machinery.',
  },
];

/** The Heart and the Engine Nodes on the Alien Strata (centers). */
export const HEART = { x: 52, y: 42 };
/**
 * Engine Nodes take two items strictly alternating, 2 s each; four make a Heartstone. The node nearest
 * the shaft (the Waking Node) takes Batteries and Resonant Cores, so the Engine can be started before
 * any conduit is awake; the other two take Engine Glass and Resonant Cores.
 */
export const ENGINE_SEQUENCE = ['engine_glass', 'resonant_core', 'engine_glass', 'resonant_core'];
export const WAKING_SEQUENCE = ['battery', 'resonant_core', 'battery', 'resonant_core'];
export const ENGINE_NODES = [
  { x: 36, y: 24 },
  { x: 58, y: 30 },
  { x: 28, y: 40, waking: true },
];
/** Seconds per accepted item at an Engine Node. */
export const NODE_ITEM_TIME = 2;
/**
 * A node wakes the conduit around it ring by ring: each Heartstone it makes lights the conduit out to
 * its next ring. Ring 1 reaches 1 tile past the node's nearest conduit outside its own footprint (so
 * the first Heartstone always lights something you can see), each later ring WAKE_RING_STEP tiles
 * further, WAKE_RINGS rings in all, and the last reaches at least WAKE_RADIUS tiles. Distances run
 * from the node's centre to tile centres.
 */
export const WAKE_RINGS = 5;
export const WAKE_RING_STEP = 3;
export const WAKE_RADIUS = 15;
/** Conduit power each awake node lends to machines standing on awake conduit (kW): two Attuners' worth. */
export const CONDUIT_KW_PER_NODE = 60;
/** Conduit lines on the Alien Strata: [x0, y0, x1, y1] straight segments. */
export const CONDUITS: [number, number, number, number][] = [
  [4, 36, 68, 36],
  [36, 4, 36, 48],
  [20, 18, 60, 18],
  [54, 18, 54, 46],
  [12, 26, 30, 26],
];

/** Deposit kinds: miner speed is 30/min at purity 1 (normal), times this multiplier. */
export const PURITY_MULT = [0.5, 1, 2];
export const PURITY_NAME = ['poor', 'normal', 'rich'];

/** The amber-sealed rock at the Shallows bore site (decor value AMBER_DECOR in src/sim/mapgen.ts). */
export const AMBER_SPRITE = 'x_l1_amber';

/**
 * The 32 x 32 decor props (STYLE "Decor"); every other decor name is 16 x 16. The sim can't read sprite
 * sizes, so map generation reads this: it weighs these least (LayerDef.decorWeights) and never stands
 * two within 2 tiles of each other.
 */
export const TALL_DECOR: ReadonlySet<string> = new Set(['x_l0_crate_stack', 'x_l1_support', 'x_l1_minecart', 'x_l2_mushroom_tall', 'x_l3_crystal_large', 'x_l4_hex_pillar', 'x_l5_stone_gear']);
