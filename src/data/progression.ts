// Drill projects, assays, milestones and contracts (PLAN.md §5.7, §5.9, §5.13, §5.8).

import { LAYERS } from './layers';

export interface ProjectDef {
  id: string;
  name: string;
  layer: number;
  needs: Record<string, number>;
  /** Layer that opens when it completes (or -1 for the ending). */
  opens: number;
}

// Sized so the first working chain (one machine per recipe) takes 25-35 minutes and a line that
// finishes in 10 minutes needs 24-45 machines (PLAN §8), from D3 on. D1 and D2 are the two
// tutorials: D1 stays short (about 9 minutes) and D2's first chain stays under 22 minutes.
export const PROJECTS: Record<string, ProjectDef> = {
  d1: { id: 'd1', name: 'Repair the Drill', layer: 0, opens: 1, needs: { iron_plate: 40, gear: 30, copper_wire: 60, reinforced_plate: 30 } },
  d2: { id: 'd2', name: 'Bore to the Fungal Caverns', layer: 1, opens: 2, needs: { steel_beam: 100, motor: 30, drill_bit: 50 } },
  d3: { id: 'd3', name: 'Bore to the Crystal Depths', layer: 2, opens: 3, needs: { cobalt_drill_head: 100, insulation: 200, filter: 60 } },
  d4: { id: 'd4', name: 'Bore to the Magma Shelf', layer: 3, opens: 4, needs: { circuit: 200, battery: 100, resonant_core: 60 } },
  d5: { id: 'd5', name: 'Bore to the Alien Strata', layer: 4, opens: 5, needs: { ember_core: 60, heat_shield: 160, circuit: 40, hot_ember_ingot: 20 } },
  governor: { id: 'governor', name: 'The Governor', layer: 5, opens: -1, needs: { heartstone: 60, engine_glass: 120, battery: 40, ember_core: 60 } },
};

export interface AssayDef {
  id: string; // also the sample item id
  name: string;
  /** Belted into an Assay Lab (the four signature materials); the rest are learned on first production. */
  lab: boolean;
  samples: number;
  unlocks: string[]; // building ids and recipe ids, for display
  card: string; // the rule, one or two lines
}

export const ASSAYS: Record<string, AssayDef> = {
  sapstone: { id: 'sapstone', name: 'Sapstone', lab: true, samples: 20, unlocks: ['washer', 'separator', 'cobalt_ingot', 'cobalt_drill_head'], card: 'Cobalt ore sealed in fungal resin. Washing strips the resin fast but loses it (needs water). Separating keeps the resin, slowly. There is more cobalt in it than you will need resin for.' },
  glowcap: { id: 'glowcap', name: 'Glowcap', lab: false, samples: 0, unlocks: ['mycelium', 'spore_collector', 'biofuel'], card: 'Glowcaps fill the air with spores, and spores slow machines. Pressed, glowcaps give fiber. A collector in thick spores turns the air itself into fuel.' },
  resin: { id: 'resin', name: 'Resin', lab: false, samples: 0, unlocks: ['insulation', 'filter', 'spore_filter'], card: 'Resin seals and insulates. With fiber it makes insulation and spore filters. Surplus resin burns in a generator.' },
  chorus_crystal: { id: 'chorus_crystal', name: 'Chorus Crystal', lab: true, samples: 20, unlocks: ['cutter', 'crusher', 'charger', 'shield_wall', 'circuit'], card: 'Order matters. Cut then charge: a charged crystal. Crush then charge: conductive powder. Crush a charged crystal: twice the powder. Working machines within 2 tiles slow crystal machines; a shield wall between them blocks it.' },
  charged_crystal: { id: 'charged_crystal', name: 'Charged Crystal', lab: false, samples: 0, unlocks: ['overcharger', 'stabilizer', 'battery', 'resonance_tap'], card: 'Charge a charged crystal again and it overcharges. Overcharged crystals shatter on belts: feed them straight from the Overcharger into a Stabilizer. Interference can be tapped for power.' },
  emberite: { id: 'emberite', name: 'Emberite', lab: true, samples: 20, unlocks: ['cooling_bath', 'thermal_extractor', 'pressure_forge', 'precision_assembler', 'foundation', 'insulated_belt', 'heat_shield'], card: 'Emberite stores heat. Cool it into aggregate, burn it for power, or forge it hot into ingots that cool on belts. Hot ground halves most machines and doubles forges; foundations cancel both.' },
  thrumstone: { id: 'thrumstone', name: 'Thrumstone', lab: true, samples: 20, unlocks: ['attuner', 'sequencer'], card: "Only the mountain's conduits can work thrumstone, and the conduits sleep until an Engine Node runs: each Heartstone it makes wakes them a ring further out. The Waking Node, nearest the shaft, takes Batteries and Resonant Cores strictly alternating: a Sequencer interleaves two belts for it. Machines on an awake conduit draw from its power instead of the grid, and they share it." },
  engine_glass: { id: 'engine_glass', name: 'Engine Glass', lab: false, samples: 0, unlocks: [], card: 'Engine Nodes want two items strictly alternating. Four in a row make a Heartstone. A wrong item comes out of the side. A Sequencer interleaves two belts.' },
};

/**
 * What a tutorial step points at on the map. progress.ts guideMarks turns it into tile rects from the
 * game as generated: deposit cells and fixed buildings are read from the map, not written down here.
 */
export type MarkDef =
  /** The deposit of this ore on the layer nearest its depot (the HQ up top, the shaft's arrival below). */
  | { kind: 'deposit'; layer: number; ore: string }
  /** A fixed building's footprint on the layer: the HQ, the Shipping Terminal, the Drill. */
  | { kind: 'building'; layer: number; building: string }
  /** The rock still standing in the Surface's ridge between the copper and the Terminal (mapgen.ts SURFACE.outcrop). */
  | { kind: 'outcrop' }
  /** The layer's bore site, the 5x5 the next Drill stands on. */
  | { kind: 'bore'; layer: number };

/**
 * A step's tutorial help. `hint` names the UI path and the control; the objectives panel shows it
 * while this is the milestone's first unfinished step (progress.ts currentHint), and `mark` outlines
 * what it is about on the map meanwhile (guideMarks).
 */
interface StepGuide {
  hint?: string;
  mark?: MarkDef;
}

export type StepDef = StepGuide &
  (
    | { kind: 'event'; event: string; label: string }
    | { kind: 'sell'; item: string; count: number }
    /** Counts what is made from the milestone's start (msBase). `label` replaces the generated one. */
    | { kind: 'produce'; item: string; count: number; label?: string }
    /** Counts goods belted into a depot from the milestone's start (refunds don't count). */
    | { kind: 'deliver'; item: string; count: number; label?: string }
    /** Counts finished buildings that stand now (optionally on an ore or a layer). */
    | { kind: 'build'; building: string; count: number; label?: string; ore?: string; layer?: number }
    /** Counts rock tiles dug anywhere from the milestone's start. */
    | { kind: 'dig'; count: number; label?: string }
    | { kind: 'elevator'; count: number }
    | { kind: 'assay'; assay: string }
    | { kind: 'project'; project: string }
    | { kind: 'visit'; layer: number }
    /** Done once the cave around the deposit of `ore` nearest the layer's arrival is open (its centre revealed). */
    | { kind: 'reach'; layer: number; ore: string; label: string }
  );

export interface MilestoneDef {
  n: number;
  act: number;
  name: string;
  steps: StepDef[];
  reward: { money?: number; license?: string };
  /** Mags on the radio when the milestone starts. */
  intro: string;
  /** Mags when it's done. */
  outro?: string;
  /** Short hint shown under the steps. */
  hint?: string;
  /**
   * When it starts, Mags also says where these are on their layer, by compass and distance from the
   * shaft: the Heart, and the Engine Nodes still asleep (progress.ts locateLine).
   */
  locate?: Locate[];
}

export type Locate = 'heart' | 'nodes';

export const MILESTONES: MilestoneDef[] = [
  // Act I: the Dig Site. Nothing runs when the game opens: the first two milestones walk the player
  // through building the first line, one action a step, and the Copper Line teaches the Dig tool on
  // the ridge in its way. The milestone cash is halved ($725 in all, review-3 K11; First Light's
  // $50 is split with Plates for the HQ): Terminal sales have to fund the second line upgrade, so
  // sending everything into the Drill costs something. Contracts stay on the board as the catch-up
  // valve.
  { n: 1, act: 1, name: 'First Light', steps: [
      { kind: 'build', building: 'miner', count: 1, ore: 'iron_ore', label: 'Build a Miner on iron', mark: { kind: 'deposit', layer: 0, ore: 'iron_ore' },
        hint: 'Production tab (2): Miner, on the iron ore by the HQ. R turns it before you click: its chute arrow is where ore comes out.' },
      { kind: 'build', building: 'smelter', count: 1,
        hint: 'Production tab (2): Smelter, a few tiles from the Miner. It makes ingots from the ore belted into it.' },
      { kind: 'produce', item: 'iron_ingot', count: 1, label: 'Belt ore into the Smelter',
        hint: "Logistics tab (1): Conveyor. Drag from the Miner's chute to the Smelter's back or side, never its chute. Arrows show which way a belt runs." },
      { kind: 'sell', item: 'iron_ingot', count: 5, mark: { kind: 'building', layer: 0, building: 'terminal' },
        hint: "Belt the Smelter's ingots into the Shipping Terminal: it sells all it gets. A piece in the wrong place? X is the Remove tool." },
    ], reward: { money: 25 },
    intro: "Morning, foreman. The Company left us an HQ full of parts, a shipping terminal and a broken drill. Nothing's running yet. Put a Miner on that iron ore and let's make something.",
    outro: 'First money in. The Company noticed. Barely.' },
  { n: 2, act: 1, name: 'Plates for the HQ', steps: [
      { kind: 'build', building: 'press', count: 1,
        hint: 'Building is paid in plates and gears from the HQ. Production tab (2): a Press turns ingots into plates.' },
      { kind: 'deliver', item: 'iron_plate', count: 5, label: 'Stock the HQ with plates', mark: { kind: 'building', layer: 0, building: 'hq' },
        hint: 'A Splitter (Logistics, 1) in the ingot belt deals items front, left and right in turn. Feed the Press from one side, its plates into the HQ.' },
      { kind: 'event', event: 'drill_inspected', label: 'Click the Drill', mark: { kind: 'building', layer: 0, building: 'drill' },
        hint: 'The Drill is up by the mountain: WASD or the middle mouse pans, the wheel zooms. Click it to see what it needs.' },
    ], reward: { money: 25 },
    intro: "Everything we build comes out of the HQ's crate, and the crate won't last. Press some of those ingots into plate and belt it in. Then go and look at the Drill up top: it's why we're here.",
    outro: "That drill is our ticket down. Let's make more than one thing." },
  { n: 3, act: 1, name: 'Copper Line', steps: [
      { kind: 'build', building: 'miner', count: 1, ore: 'copper_ore', label: 'Build a Miner on copper', mark: { kind: 'deposit', layer: 0, ore: 'copper_ore' },
        hint: 'Copper ore lies east of the Terminal. A Miner on it, a Smelter after: it picks its recipe from the first ore in.' },
      { kind: 'dig', count: 3, label: 'Dig through the rock', mark: { kind: 'outcrop' },
        hint: `Rock blocks the way to the Terminal. Dig tool (E): drag a lane across it, $${LAYERS[0].digCost} a tile. A right-drag cancels.` },
      { kind: 'sell', item: 'copper_ingot', count: 10, mark: { kind: 'building', layer: 0, building: 'terminal' },
        hint: 'Belt the copper ingots into the Terminal. Machines take items in at the back and sides, never the front.' },
    ], reward: { money: 75 },
    intro: "Copper next. There's a deposit east of the terminal, and a ridge of rock between the two. Miner, smelter, and dig us a way through." },
  { n: 4, act: 1, name: 'Wire and Gears', steps: [{ kind: 'produce', item: 'copper_wire', count: 30 }, { kind: 'produce', item: 'gear', count: 15 }], reward: { money: 75, license: 'sorter' },
    intro: 'The drill wants wire and gears. Presses make both: pick the recipe in the inspector.', outro: "Company sent a Sorter license. Mixed belts won't scare you now.", hint: 'Everything you build is paid from the HQ: keep some plates flowing into it.' },
  { n: 5, act: 1, name: 'Brickwork', steps: [
      { kind: 'produce', item: 'brick', count: 20, mark: { kind: 'deposit', layer: 0, ore: 'stone' },
        hint: 'Stone lies south of the factory. A Miner on it and a Smelter after it make brick: belt it into the HQ.' },
      { kind: 'event', event: 'line_upgraded', label: 'Upgrade the Company Line',
        hint: 'The Company window (C) sells the line upgrade. The power bar turns red when demand passes supply.' },
    ], reward: { money: 125 },
    intro: "Stone deposit to the south. Bake it into brick: the drill needs a reinforced frame. And we're drawing more than the Company line gives us. Buy the upgrade in the Company window.",
    outro: 'Assemblers are unlocked. They join two parts into one.', hint: 'The power bar turns red when demand passes supply, and everything slows down.' },
  { n: 6, act: 1, name: 'Reinforcement', steps: [{ kind: 'build', building: 'assembler', count: 1 }, { kind: 'produce', item: 'reinforced_plate', count: 10 }], reward: { money: 150 },
    intro: 'Two plates, one brick, one assembler: reinforced plate.', hint: 'Machines only take parts from belts, never from the HQ: give the Assembler its own plate line and turn the brick line into it.' },
  { n: 7, act: 1, name: 'Repair the Drill', steps: [{ kind: 'project', project: 'd1', mark: { kind: 'building', layer: 0, building: 'drill' } }], reward: { money: 250 },
    intro: "That's everything the drill needs, just a lot more of it. Belt it all into the drill.", hint: 'The drill shows what it still needs and how long at the current rate.' },

  // Act II: the Shallows. Arriving teaches the dark: lamps, then a survey that finds the rich copper
  // just south-east of the pocket, then a tunnel to it, before the bore site asks for a long one.
  { n: 8, act: 2, name: 'Down the Shaft', steps: [
      { kind: 'visit', layer: 1 },
      { kind: 'build', building: 'lamp', count: 3, layer: 1, label: 'Light the Shallows',
        hint: 'Utility tab (4): Lamp. Three around the depot light enough to build by.' },
      { kind: 'event', event: 'surveyed', label: 'Survey the dark', mark: { kind: 'deposit', layer: 1, ore: 'copper_ore' },
        hint: `Survey tool (F): click south-east of the pocket, by the mark. Ore and caves near it show through the dark. $${LAYERS[1].surveyCost}.` },
      { kind: 'reach', layer: 1, ore: 'copper_ore', label: 'Dig to the copper', mark: { kind: 'deposit', layer: 1, ore: 'copper_ore' },
        hint: `Dig tool (E): drag a tunnel from the pocket to the copper, $${LAYERS[1].digCost} a tile. Break into its cave and it all shows.` },
    ], reward: { money: 200 },
    intro: "We're through. The crew left a rig burning coal down here, and the elevator stocks the depot from the HQ by itself: its requests say what it keeps. Lamps first. Then let's see what the dark is hiding.",
    outro: "Rich copper, right next door. The mountain's being generous. I don't trust it.",
    hint: 'Switch layers with [ and ] or the Stack on the right. Lamps (Utility) light the dark.' },
  { n: 9, act: 2, name: 'Steel', steps: [{ kind: 'produce', item: 'steel_ingot', count: 30 }], reward: { money: 300 },
    intro: 'Foundry: iron ingot plus coal. Steel holds up everything below.',
    hint: 'Foundry (Production, 2): iron ingots and coal in. Short of parts? Click the depot: its requests say what the elevator brings down.' },
  { n: 10, act: 2, name: 'Motors', steps: [{ kind: 'produce', item: 'motor', count: 10 }], reward: { money: 400 },
    intro: 'Motors: gears wound with copper wire. Foundries and generators eat them.',
    hint: 'An Assembler takes gears and wire from belts. An Unloader (Logistics, 1) on the depot pulls out the good you pick.' },
  { n: 11, act: 2, name: 'The Bore Site', steps: [
      { kind: 'event', event: 'bore_site_reached', label: 'Dig through to the bore site', mark: { kind: 'bore', layer: 1 },
        hint: `The gold beacon is the bore site. Dig tool (E): drag a tunnel to it, $${LAYERS[1].digCost} a tile. A right-drag cancels.` },
      { kind: 'elevator', count: 80 },
    ], reward: { money: 500 },
    intro: "The crew's moving the rig to the marked site. Dig us a way through to it, and keep that elevator busy.",
    hint: 'The elevator carries 45 items a minute each way: requests and belts share it.' },
  { n: 12, act: 2, name: 'Bore to the Fungal Caverns', steps: [{ kind: 'project', project: 'd2' }], reward: { money: 800 },
    intro: 'Steel beams, motors, drill bits. A lot of them. Make it hum.' },

  // Act III: the Fungal Caverns
  { n: 13, act: 3, name: 'Something Growing', steps: [{ kind: 'build', building: 'assay_lab', count: 1 }, { kind: 'assay', assay: 'sapstone' }], reward: { money: 600 },
    intro: "Something's growing down here, foreman. And the ore is wrapped in... sap? Build a lab and send samples.", hint: 'Belt 20 Sapstone into an Assay Lab.' },
  { n: 14, act: 3, name: 'Wash or Separate', steps: [{ kind: 'produce', item: 'cobalt_ore', count: 20 }, { kind: 'produce', item: 'resin', count: 10 }], reward: { money: 600 },
    intro: "Washing is fast but loses the resin. Separating keeps it, slowly. There's more cobalt in this rock than we'll ever need resin for: split the stream." },
  { n: 15, act: 3, name: 'Clean Air', steps: [{ kind: 'build', building: 'spore_filter', count: 1 }], reward: { money: 800 },
    intro: "Those spores are gumming up the machines. Resin and fiber make filters.", hint: 'The spore overlay shows where machines slow down.' },
  { n: 16, act: 3, name: 'Cobalt', steps: [{ kind: 'produce', item: 'cobalt_ingot', count: 30 }], reward: { money: 800 },
    intro: 'Clean cobalt smelts into the hardest metal we have.' },
  { n: 17, act: 3, name: 'Spore Power', steps: [{ kind: 'produce', item: 'biofuel', count: 10 }], reward: { money: 1000 },
    intro: 'Here is a thought: if the air is full of spores, the air is full of fuel.' },
  { n: 18, act: 3, name: 'Bore to the Crystal Depths', steps: [{ kind: 'project', project: 'd3' }], reward: { money: 1500 },
    intro: "Cobalt drill heads, insulation, filters. Whatever's below is ringing. I can hear it through my boots." },

  // Act IV: the Crystal Depths
  { n: 19, act: 4, name: 'The Singing Rock', steps: [{ kind: 'assay', assay: 'chorus_crystal' }], reward: { money: 1200 },
    intro: 'The crystals sing when the machines run. Assay them before we touch anything. And there is no copper down here: wire comes down the shaft.' },
  { n: 20, act: 4, name: 'Order Matters', steps: [{ kind: 'produce', item: 'charged_crystal', count: 10 }, { kind: 'produce', item: 'conductive_powder', count: 10 }], reward: { money: 1500 },
    intro: 'Cut, then charge. Crush, then charge. Same rock, two different products.' },
  { n: 21, act: 4, name: 'Quiet Please', steps: [{ kind: 'event', event: 'shield_blocking', label: 'Wall off interference' }], reward: { money: 1500 },
    intro: 'Machines packed tight make the crystal ones stutter. Put a shield wall between them.', hint: 'The interference overlay draws arcs between machines that interfere. A wall anywhere between two machines blocks it.' },
  { n: 22, act: 4, name: 'Overcharge', steps: [{ kind: 'produce', item: 'resonant_core', count: 5 }], reward: { money: 2000 },
    intro: "Charge it past full and it gets... unstable. Don't let it touch a belt." },
  { n: 23, act: 4, name: 'Bore to the Magma Shelf', steps: [{ kind: 'project', project: 'd4' }], reward: { money: 2500 },
    intro: 'Circuits, batteries, resonant cores. And then we go somewhere hot.' },

  // Act V: the Magma Shelf
  { n: 24, act: 5, name: 'Hot Rock', steps: [{ kind: 'assay', assay: 'emberite' }], reward: { money: 1500 },
    intro: 'Orange rock that stays warm in your hand. Assay it.' },
  { n: 25, act: 5, name: 'Three Routes', steps: [{ kind: 'produce', item: 'aggregate', count: 20 }, { kind: 'event', event: 'thermal_running', label: 'Run a Thermal Extractor' }, { kind: 'produce', item: 'hot_ember_ingot', count: 5 }], reward: { money: 2000 },
    intro: 'Cool it, burn it, or forge it hot. We are going to need all three, and there are only three vents.' },
  { n: 26, act: 5, name: 'Keep It Hot', steps: [{ kind: 'produce', item: 'ember_core', count: 10 }], reward: { money: 2500 },
    intro: 'Molten ingots cool on the belt, and the Precision Assembler wants steady ground well away from the heat. Insulate the line.', hint: 'Below half heat an ingot cools for good. Insulated belts keep heat ten times longer, but a hot line that backs up still cools: give it an overflow into the depot.' },
  { n: 27, act: 5, name: 'Bore to the Alien Strata', steps: [{ kind: 'project', project: 'd5' }], reward: { money: 3000 },
    intro: "Ember cores for the drill head, and twenty molten ingots delivered hot. Whatever's humming, it's right under us." },

  // Act VI: the Alien Strata
  { n: 28, act: 6, name: 'The Walls Are Machines', steps: [{ kind: 'assay', assay: 'thrumstone' }], reward: { money: 3000 },
    intro: 'Foreman. The walls are gears. The whole mountain is a machine. Let us find out what that stone is.' },
  { n: 29, act: 6, name: 'Wake the Engine', steps: [{ kind: 'produce', item: 'heartstone', count: 5, label: 'Wake the Waking Node' }], reward: { money: 2500 },
    intro: 'That node by the shaft has sockets that fit our batteries and cores. Feed it, one then the other.', hint: 'The nearest node takes Batteries and Resonant Cores, alternating. Each Heartstone wakes the conduit a ring further out. Ask the depot to keep them in stock. Belt the Heartstones away from its front: it holds only four.' },
  { n: 30, act: 6, name: 'Engine Glass', steps: [{ kind: 'build', building: 'attuner', count: 1 }, { kind: 'produce', item: 'engine_glass', count: 20 }], reward: { money: 1500 },
    intro: 'The conduits around it are awake. Anything standing on them runs on the mountain.' },
  { n: 31, act: 6, name: 'In Sequence', steps: [{ kind: 'event', event: 'all_nodes_awake', label: 'Wake all three Engine Nodes' }], reward: { money: 1000 },
    intro: 'The other nodes want glass and cores, glass and cores, in that order. Feed them right.', locate: ['nodes'] },
  { n: 32, act: 6, name: 'The Governor', steps: [{ kind: 'project', project: 'governor' }], reward: {},
    intro: 'The Heart is asleep. The Governor ties our machine to its machine. Everything we have learned goes into this.', locate: ['heart', 'nodes'] },
];

export interface ContractTemplate {
  item: string;
  /** About five minutes of one machine's output. */
  count: number;
  minLayer: number;
  /** Pay multiplier on shipping value, 1.7-2.5x (never above 2.5x). */
  mul: number;
}

/** Contract offers by the deepest layer reached; three are on the board at a time. */
export const CONTRACTS: ContractTemplate[] = [
  { item: 'iron_plate', count: 75, minLayer: 0, mul: 1.8 },
  { item: 'copper_wire', count: 150, minLayer: 0, mul: 1.8 },
  { item: 'brick', count: 75, minLayer: 0, mul: 1.7 },
  { item: 'gear', count: 75, minLayer: 0, mul: 1.8 },
  { item: 'reinforced_plate', count: 40, minLayer: 0, mul: 2.0 },
  { item: 'steel_beam', count: 75, minLayer: 1, mul: 1.8 },
  { item: 'motor', count: 40, minLayer: 1, mul: 2.0 },
  { item: 'steel_ingot', count: 75, minLayer: 1, mul: 1.7 },
  { item: 'drill_bit', count: 40, minLayer: 1, mul: 2.0 },
  { item: 'resin', count: 50, minLayer: 2, mul: 2.2 },
  { item: 'cobalt_ingot', count: 75, minLayer: 2, mul: 1.9 },
  { item: 'insulation', count: 50, minLayer: 2, mul: 2.0 },
  { item: 'filter', count: 50, minLayer: 2, mul: 2.0 },
  { item: 'charged_crystal', count: 75, minLayer: 3, mul: 2.2 },
  { item: 'circuit', count: 40, minLayer: 3, mul: 2.0 },
  { item: 'battery', count: 40, minLayer: 3, mul: 2.0 },
  { item: 'aggregate', count: 150, minLayer: 4, mul: 1.9 },
  { item: 'heat_shield', count: 40, minLayer: 4, mul: 2.0 },
  { item: 'ember_core', count: 40, minLayer: 4, mul: 2.2 },
  { item: 'engine_glass', count: 40, minLayer: 5, mul: 2.0 },
  { item: 'heartstone', count: 40, minLayer: 5, mul: 2.5 },
];

/** Pay multipliers never exceed this, so rushing goods can never feed a contract at a profit. */
export const CONTRACT_MUL_CAP = 2.5;
/** Re-rolling the contract board costs this much. */
export const CONTRACT_REROLL = 200;
