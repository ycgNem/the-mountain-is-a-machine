// Core simulation types. The sim is pure (no DOM) and runs at a fixed 60 Hz.

export const TICK = 1 / 60;

export type Dir = 0 | 1 | 2 | 3; // N, E, S, W
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const DIR_NAME = ['north', 'east', 'south', 'west'] as const;

export const opp = (d: Dir): Dir => ((d + 2) % 4) as Dir;
/** Counter-clockwise: the facing's left hand. */
export const leftOf = (d: Dir): Dir => ((d + 3) % 4) as Dir;
export const rightOf = (d: Dir): Dir => ((d + 1) % 4) as Dir;

// Terrain kinds
export const T_FLOOR = 0;
export const T_ROCK = 1;
export const T_HARD = 2;
export const T_WATER = 3;
export const T_MAGMA = 4;

export interface Item {
  id: string;
  /** Only meaningful for hot items (0..100). */
  heat: number;
}

export type Status =
  | 'ok'
  | 'idle'
  | 'no_input'
  | 'blocked'
  | 'no_power'
  | 'no_recipe'
  | 'slowed'
  | 'misplaced'
  | 'paused'
  | 'jammed'
  | 'planned';

export interface Building {
  id: number;
  type: string;
  layer: number;
  x: number;
  y: number;
  dir: Dir;
  /** Planned ghost waiting for its cost to arrive in the depot. */
  planned: boolean;

  // 1x1 logistics slot
  item: Item | null;
  prog: number;
  inDir: Dir;
  outDir: Dir;
  rr: number;
  // crossing: second axis slot
  item2: Item | null;
  prog2: number;
  inDir2: Dir;

  /** Sorter/unloader item filter. */
  filter: string | null;

  // machines
  recipe: string | null;
  active: boolean;
  craft: number;
  inBuf: Record<string, number>;
  outBuf: Item[];
  sideBuf: Item[];
  outRR: number;
  status: Status;
  /** Effective speed factor last tick (power x hazards). */
  speed: number;

  // generators
  burn: number;
  fuelPower: number;

  // crate
  stockItem: string | null;
  stockCount: number;

  // sequencer / engine node
  seqPos: number;

  // elevator station
  shaft: number;
  end: number;

  // miners / collectors: what they extract and items per second at full speed
  ore: string | null;
  rate: number;

  /** Hazard multiplier (spores, heat, interference), refreshed a few times a second. */
  envMul: number;
  /** Ids of machines interfering with this one (for the arcs overlay). */
  links: number[];
  /** Ids of machines that would interfere but a Shield Wall blocks (for the overlay's rectangles). */
  shielded?: number[];
  /** Seconds since this building last did something visible (for animation). */
  workT: number;
  /** Goods paid for by a Rush (money), never refunded on removal. */
  rushed?: Record<string, number>;
  /** Paused by the player: starts no new crafts and draws no power. */
  paused?: boolean;
  /** Planned ghosts build in this order (default: their id); "Build next" moves one to the front. */
  queue?: number;
  /**
   * The last item a belt couldn't hand this building: one a machine never takes ('wrong'), one pushed
   * into the front of a machine or an elevator station, the face its output comes out of ('front'), a
   * project good the Drill or Heart has all of while its layer's depot already holds STOCK_CAP of it,
   * so the extra can't be stacked there ('full'), or, on two belts whose heads push into each other,
   * the item stuck where they meet ('headon', marked on both belts).
   */
  jam?: string;
  jamWhy?: JamWhy;
  /**
   * Tick of that refusal. A recent one (production.ts jamFresh, JAM_FRESH ticks) turns "waiting for
   * input" (a Drill's, Heart's or station's "idle") into "jammed"; on belts the renderer and hovers read it.
   */
  jamT?: number;
}

export type JamWhy = 'wrong' | 'front' | 'full' | 'headon';

export interface Shaft {
  id: number;
  /** Station building ids at the top (layer a) and bottom (layer a+1). */
  stations: [number, number];
  layers: [number, number];
  x: number;
  y: number;
  tier: number;
  /** Cab position 0 = top, 1 = bottom. */
  pos: number;
  state: 'dwell' | 'move';
  /** Which end the cab is at (dwell) or heading to (move). */
  at: number;
  timer: number;
  cab: Item[];
  /** Outbound bays at each end. */
  bay: [Item[], Item[]];
  /** Arrivals waiting to leave each station. */
  arr: [Item[], Item[]];
  /** kW moved through the cable last solve (+ = downward). */
  flow: number;
  /** Seconds the cab has waited with cargo for more to arrive. */
  hold: number;
  /** True once the cab has unloaded at this end and is taking on cargo. */
  loading: boolean;
  /** Requested items loaded at the top this stop (they take at most half the cab, rounded down, before belt cargo). */
  reqN?: number;
  /** The last requested item the cab loaded: requests are served in turn, in ITEMS order after it. */
  reqLast?: string;
}

export interface LayerPower {
  supply: number;
  demand: number;
  sat: number;
  genCap: number;
  genUsed: number;
  net: number;
  /** Conduit pool (Alien Strata): kW lent by awake nodes, drawn by machines on awake conduit. */
  pool: number;
  poolDemand: number;
  poolSat: number;
}

export interface LayerState {
  index: number;
  w: number;
  h: number;
  open: boolean;
  terrain: Uint8Array;
  /** Deposit item index + 1 (0 = none). */
  ore: Uint8Array;
  purity: Uint8Array;
  revealed: Uint8Array;
  surveyed: Uint8Array;
  /** Heat field: 0 none, 1 warm (3-4 tiles from magma), 2 hot (within 2 tiles). */
  hot: Uint8Array;
  conduit: Uint8Array;
  /** Conduit tiles woken by a running Engine Node (Alien Strata). */
  conduitLive: Uint8Array;
  foundation: Uint8Array;
  decor: Uint8Array;
  /** Spore density before filters, 0..255. */
  sporeBase: Uint8Array;
  /** Building id per cell, -1 for none. */
  occ: Int32Array;
  /** Derived each refresh. */
  spore: Float32Array;
  light: Float32Array;
  stock: Record<string, number>;
  /** Supply requests: keep this many of each item, hauled down from the depot above by the cab. */
  requests: Record<string, number>;
  power: LayerPower;
  digQueue: number[];
}

export interface Contract {
  item: string;
  count: number;
  pay: number;
  delivered: number;
  /** How many of the delivered items went into a Company Chute: each pays 60% of its share. */
  chute: number;
}

export interface Stats {
  produced: Record<string, number>;
  sold: Record<string, number>;
  delivered: Record<string, number>;
  built: Record<string, number>;
  dug: number;
  elevator: number;
  earned: number;
  events: Record<string, number>;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  tick: number;
  time: number;
  money: number;
  layers: LayerState[];
  buildings: Map<number, Building>;
  nextId: number;
  shafts: Shaft[];
  deepest: number;
  visited: number[];
  /**
   * The open drill project: what has been delivered (never above a need) and, per good, the extras
   * that came in after its need was met and were stacked in the layer's depot instead (optional:
   * older saves have none).
   */
  project: { id: string; delivered: Record<string, number>; surplus?: Record<string, number> } | null;
  projectsDone: string[];
  milestone: number;
  msBase: Stats;
  msDone: number[];
  stats: Stats;
  licenses: string[];
  lineLevel: number;
  assays: Record<string, number>;
  assaysDone: string[];
  contracts: { offers: Contract[]; active: Contract | null; done: number; refresh: number };
  /** Money earned per second, last 60 s (ring). */
  income: number[];
  ended: boolean;
  /** Seconds since the ending, for the ending sequence. */
  endTime: number;
  /** Debug and test states: every building and recipe is unlocked. */
  unlockAll?: boolean;
}

export type GameEvent =
  | { t: 'sale'; layer: number; x: number; y: number; amount: number }
  | { t: 'message'; text: string; who: 'mags' | 'board' }
  | { t: 'toast'; text: string; kind: 'good' | 'bad' | 'info' }
  | { t: 'milestone'; n: number; name: string }
  | { t: 'breakthrough'; layer: number }
  | { t: 'placed'; layer: number; x: number; y: number; type: string }
  | { t: 'removed'; layer: number; x: number; y: number }
  | { t: 'dug'; layer: number; x: number; y: number }
  | { t: 'reveal'; layer: number; cells: number }
  /** A node's Heartstone woke conduit ring `ring` of `rings`; `tiles` are the newly lit cells (y * w + x). */
  | { t: 'node_awake'; layer: number; x: number; y: number; cells: number; ring: number; rings: number; tiles: number[] }
  | { t: 'survey'; layer: number; x: number; y: number }
  | { t: 'assay'; id: string }
  | { t: 'contract'; pay: number }
  | { t: 'shatter'; layer: number; x: number; y: number }
  | { t: 'project_item'; layer: number; x: number; y: number }
  | { t: 'ending' };

export function emptyStats(): Stats {
  return { produced: {}, sold: {}, delivered: {}, built: {}, dug: 0, elevator: 0, earned: 0, events: {} };
}

export function cloneStats(s: Stats): Stats {
  return {
    produced: { ...s.produced },
    sold: { ...s.sold },
    delivered: { ...s.delivered },
    built: { ...s.built },
    dug: s.dug,
    elevator: s.elevator,
    earned: s.earned,
    events: { ...s.events },
  };
}

export function newBuilding(id: number, type: string, layer: number, x: number, y: number, dir: Dir): Building {
  return {
    id,
    type,
    layer,
    x,
    y,
    dir,
    planned: false,
    item: null,
    prog: 0,
    inDir: dir,
    outDir: dir,
    rr: 0,
    item2: null,
    prog2: 0,
    inDir2: dir,
    filter: null,
    recipe: null,
    active: false,
    craft: 0,
    inBuf: {},
    outBuf: [],
    sideBuf: [],
    outRR: 0,
    status: 'idle',
    speed: 0,
    burn: 0,
    fuelPower: 0,
    stockItem: null,
    stockCount: 0,
    seqPos: 0,
    shaft: -1,
    end: -1,
    ore: null,
    rate: 0,
    envMul: 1,
    links: [],
    workT: 99,
  };
}
