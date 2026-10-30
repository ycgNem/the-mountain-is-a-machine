// Milestones, drill projects, assays, shipping and contracts (PLAN.md §5.7–5.9, §5.13).

import { BUILDINGS } from '../data/buildings';
import { ITEMS, itemShort } from '../data/items';
import { CONDUIT_KW_PER_NODE, ENGINE_NODES, HEART, LAYERS, WAKE_RADIUS, WAKE_RING_STEP, WAKE_RINGS } from '../data/layers';
import { ASSAYS, CONTRACT_MUL_CAP, CONTRACT_REROLL, CONTRACTS, MILESTONES, PROJECTS, type Locate, type MarkDef, type StepDef } from '../data/progression';
import { createShaft } from './elevator';
import type { Game } from './game';
import { GEN_FUEL_CAP, isSlot, outputPort } from './logistics';
import { SURFACE, oreIndex, outcropCells } from './mapgen';
import { nextRand } from './rng';
import { DX, DY, T_ROCK, cloneStats, leftOf, rightOf, type Building, type Contract, type Dir, type Item } from './types';

// ------------------------------------------------------------------ shipping

export function onSale(g: Game, t: Building, item: Item): void {
  const s = g.s;
  const id = ITEMS[item.id]?.hot ? 'hot_ember_ingot' : item.id;
  s.stats.sold[id] = (s.stats.sold[id] ?? 0) + 1;
  t.workT = 0;
  if (deliverContract(g, id, false)) return;
  const v = ITEMS[id]?.value ?? 0;
  if (v > 0) {
    g.earn(v);
    g.emit({ t: 'sale', layer: t.layer, x: t.x + 1, y: t.y + 1, amount: v });
  }
  if (!s.stats.events.first_sale) s.stats.events.first_sale = 1;
}

/** Company Chute: sells on the spot at 60% of value; contract goods delivered here earn 60% of their share. */
export const CHUTE_RATE = 0.6;

export function onChuteSale(g: Game, t: Building, item: Item): void {
  const s = g.s;
  const id = ITEMS[item.id]?.hot ? 'hot_ember_ingot' : item.id;
  s.stats.sold[id] = (s.stats.sold[id] ?? 0) + 1;
  t.workT = 0;
  if (deliverContract(g, id, true)) return;
  const v = Math.round((ITEMS[id]?.value ?? 0) * CHUTE_RATE * 10) / 10;
  if (v > 0) {
    g.earn(v);
    g.emit({ t: 'sale', layer: t.layer, x: t.x, y: t.y, amount: v });
  }
}

/**
 * What a contract pays for what has been delivered: each item delivered at the Terminal earns its
 * full share (pay / count), each one through a Company Chute 60% of it. On completion that is
 * round(pay x (terminal + 0.6 x chute) / count).
 */
export function contractPay(c: Contract): number {
  const chute = Math.min(c.chute ?? 0, c.delivered);
  const terminal = c.delivered - chute;
  return Math.round((c.pay * (terminal + CHUTE_RATE * chute)) / c.count);
}

/** One item toward the running contract, at the Terminal or a Chute. False when it isn't a contract item. */
function deliverContract(g: Game, id: string, chute: boolean): boolean {
  const s = g.s;
  const c = s.contracts.active;
  if (!c || c.item !== id || c.delivered >= c.count) return false;
  c.delivered++;
  if (chute) c.chute = (c.chute ?? 0) + 1;
  if (c.delivered >= c.count) {
    const pay = contractPay(c);
    g.earn(pay);
    s.contracts.active = null;
    s.contracts.done++;
    g.emit({ t: 'contract', pay });
    g.emit({ t: 'toast', text: `Contract complete: +$${pay}`, kind: 'good' });
  }
  return true;
}

// ------------------------------------------------------------------ the Engine

/**
 * The radii of a node's wake rings (tiles from its centre to tile centres): ring 1 reaches 1 tile past
 * its nearest conduit outside its own footprint (conduit under the node is hidden by it), so the first
 * Heartstone always lights something you can see; each later ring reaches WAKE_RING_STEP tiles
 * further, and the last at least WAKE_RADIUS.
 */
export function wakeRings(g: Game, t: Building): number[] {
  const L = g.layer(t.layer);
  const size = BUILDINGS[t.type].size;
  const half = size / 2;
  const cx = t.x + half;
  const cy = t.y + half;
  let near = Infinity;
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      if (x >= t.x && x < t.x + size && y >= t.y && y < t.y + size) continue;
      if (L.conduit[y * L.w + x]) near = Math.min(near, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    }
  }
  const first = (Number.isFinite(near) ? near : 0) + 1;
  const rings: number[] = [];
  for (let k = 0; k < WAKE_RINGS; k++) rings.push(first + WAKE_RING_STEP * k);
  rings[WAKE_RINGS - 1] = Math.max(rings[WAKE_RINGS - 1], WAKE_RADIUS);
  return rings;
}

/**
 * A node made a Heartstone: it wakes the conduit around it out to its next ring, for good. A node
 * counts as awake (its conduit pool, all_nodes_awake) from its first ring. A ring that lights nothing
 * new (another node's rings or an older save got there first) says nothing, and after the ending,
 * which woke the whole Engine, no Heartstone does.
 */
export function onNodeHeartstone(g: Game, t: Building): void {
  const s = g.s;
  t.stockCount++;
  const rings = wakeRings(g, t);
  const ring = t.stockCount;
  if (ring > rings.length) return;
  const R = rings[ring - 1];
  const L = g.layer(t.layer);
  const half = BUILDINGS[t.type].size / 2;
  const cx = t.x + half;
  const cy = t.y + half;
  const tiles: number[] = [];
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      if (x < 0 || y < 0 || x >= L.w || y >= L.h) continue;
      const i = y * L.w + x;
      if (L.conduit[i] && !L.conduitLive[i] && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= R * R) {
        L.conduitLive[i] = 1;
        tiles.push(i);
      }
    }
  }
  if (tiles.length) {
    g.staticLight[t.layer] = new Float32Array(0);
    g.dirty[t.layer] = true;
  }
  s.stats.events.node_woke = 1;
  const awake = [...s.buildings.values()].filter(nodeAwake).length;
  if (awake >= ENGINE_NODES.length) s.stats.events.all_nodes_awake = 1;
  if (s.ended) return;
  if (tiles.length) g.emit({ t: 'node_awake', layer: t.layer, x: t.x + 1, y: t.y + 1, cells: tiles.length, ring, rings: rings.length, tiles });
  if (ring !== 1) return;
  g.emit({
    t: 'message',
    who: 'mags',
    text:
      awake === 1
        ? `It took them! The conduits around that node just lit up: ${CONDUIT_KW_PER_NODE} kW of the mountain's own power, enough for two Attuners and free to anything standing on them. Keep feeding it: every Heartstone wakes the conduit a ring further out.`
        : awake >= ENGINE_NODES.length
          ? 'All three nodes are running. The Heart is listening, foreman.'
          : `Another node is running: ${CONDUIT_KW_PER_NODE} kW more in the conduit, and its own rings to wake.`,
  });
}

/** An Engine Node is awake from its first Heartstone (its conduit ring, its share of the pool). */
export function nodeAwake(b: Building): boolean {
  return b.type === 'engine_node' && b.stockCount > 0;
}

/** The Engine Nodes still asleep (no Heartstone made yet), for the renderer's markers while the Governor is open. */
export function sleepingNodes(g: Game): Building[] {
  return [...g.s.buildings.values()].filter((b) => b.type === 'engine_node' && !nodeAwake(b));
}

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

/** The 8-point compass direction and the whole-tile distance from one tile to another (y grows south). */
export function bearing(from: { x: number; y: number }, to: { x: number; y: number }): { dir: string; dist: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return { dir: COMPASS[k], dist: Math.round(Math.hypot(dx, dy)) };
}

/**
 * Where Mags says things are when a milestone starts (its `locate` list): the Heart, and the Engine
 * Nodes still asleep, nearest first, by compass and distance from the shaft's arrival on their layer.
 * Null when there is nothing to point at (or their layer isn't open).
 */
export function locateLine(g: Game, what: readonly Locate[]): string | null {
  const blds = [...g.s.buildings.values()];
  const heart = blds.find((b) => b.type === 'heart');
  const li = heart?.layer ?? blds.find((b) => b.type === 'engine_node')?.layer;
  const a = li !== undefined ? LAYERS[li].arrival : undefined;
  if (li === undefined || !a || !g.layer(li).open) return null;
  const centre = (b: Building) => {
    const half = (BUILDINGS[b.type].size - 1) / 2;
    return { x: b.x + half, y: b.y + half };
  };
  const at = (b: { dir: string; dist: number }) => `${b.dist} tiles ${b.dir}`;
  const parts: string[] = [];
  for (const w of what) {
    if (w === 'heart' && heart) parts.push(`The Heart lies ${at(bearing(a, centre(heart)))} of the shaft.`);
    if (w === 'nodes') {
      const asleep = sleepingNodes(g)
        .filter((b) => b.layer === li)
        .map((b) => bearing(a, centre(b)))
        .sort((p, q) => p.dist - q.dist);
      if (asleep.length === 1) parts.push(`The last sleeping node is ${at(asleep[0])} of the shaft.`);
      else if (asleep.length > 1) parts.push(`The sleeping nodes are ${asleep.slice(0, -1).map(at).join(', ')} and ${at(asleep[asleep.length - 1])} of the shaft.`);
    }
  }
  return parts.length ? parts.join(' ') : null;
}

/** Materials learned by making them (no lab): the card appears the first time one is produced. */
export function checkDiscoveries(g: Game): void {
  const s = g.s;
  for (const a of Object.values(ASSAYS)) {
    if (a.lab || s.assaysDone.includes(a.id)) continue;
    if ((s.stats.produced[a.id] ?? 0) > 0) {
      s.assaysDone.push(a.id);
      g.emit({ t: 'assay', id: a.id });
      g.emit({ t: 'toast', text: `New knowledge: ${a.name}`, kind: 'good' });
    }
  }
}

// ------------------------------------------------------------------ contracts

export function fillContracts(g: Game, rotate = false): void {
  const s = g.s;
  const offers = s.contracts.offers;
  if (rotate && offers.length) offers.shift();
  const pool = CONTRACTS.filter((c) => c.minLayer <= s.deepest);
  let guard = 0;
  while (offers.length < 3 && guard++ < 50) {
    const t = pool[Math.floor(nextRand(s) * pool.length)];
    if (!t || offers.some((o) => o.item === t.item) || s.contracts.active?.item === t.item) continue;
    const scale = 1 + Math.max(0, s.deepest - t.minLayer) * 0.5;
    const count = Math.round((t.count * scale) / 5) * 5;
    const pay = Math.round((ITEMS[t.item].value * count * Math.min(CONTRACT_MUL_CAP, t.mul)) / 10) * 10;
    offers.push({ item: t.item, count, pay, delivered: 0, chute: 0 });
  }
  s.contracts.refresh = 300;
}

/** Throw away the offers on the board and draw three new ones. */
export function rerollContracts(g: Game): boolean {
  const s = g.s;
  if (s.money < CONTRACT_REROLL) return false;
  s.money -= CONTRACT_REROLL;
  s.contracts.offers = [];
  fillContracts(g);
  g.emit({ t: 'toast', text: `New contracts on the board (-$${CONTRACT_REROLL})`, kind: 'info' });
  return true;
}

export function acceptContract(g: Game, i: number): boolean {
  const s = g.s;
  if (s.contracts.active) return false;
  const o = s.contracts.offers[i];
  if (!o) return false;
  s.contracts.active = o;
  s.contracts.offers.splice(i, 1);
  fillContracts(g);
  g.emit({ t: 'toast', text: `Contract accepted: ${o.count} ${ITEMS[o.item].name}`, kind: 'info' });
  return true;
}

export function abandonContract(g: Game): void {
  if (!g.s.contracts.active) return;
  g.s.contracts.active = null;
  g.emit({ t: 'toast', text: 'Contract abandoned', kind: 'info' });
}

// ------------------------------------------------------------------ assays

export function onAssaySample(g: Game, t: Building, item: Item): void {
  const s = g.s;
  const a = ASSAYS[item.id];
  t.workT = 0;
  s.assays[a.id] = (s.assays[a.id] ?? 0) + 1;
  if (s.assays[a.id] >= a.samples && !s.assaysDone.includes(a.id)) {
    s.assaysDone.push(a.id);
    g.emit({ t: 'assay', id: a.id });
    g.emit({ t: 'toast', text: `Assay complete: ${a.name}`, kind: 'good' });
  }
}

// ------------------------------------------------------------------ drill projects

export function onProjectItem(g: Game, t: Building, item: Item): void {
  const p = g.s.project!;
  const id = ITEMS[item.id]?.hot ? 'hot_ember_ingot' : item.id;
  p.delivered[id] = (p.delivered[id] ?? 0) + 1;
  t.workT = 0;
  g.emit({ t: 'project_item', layer: t.layer, x: t.x, y: t.y });
  const def = PROJECTS[p.id];
  if (Object.entries(def.needs).every(([k, v]) => (p.delivered[k] ?? 0) >= v)) completeProject(g);
}

/**
 * A Drill or the Heart took a good it already has all of; logistics stacked it in the layer's depot.
 * Count it, and the first time for each good of a project say so once.
 */
export function onProjectSurplus(g: Game, t: Building, item: Item): void {
  const p = g.s.project!;
  const id = ITEMS[item.id]?.hot ? 'hot_ember_ingot' : item.id;
  const surplus = (p.surplus ??= {});
  surplus[id] = (surplus[id] ?? 0) + 1;
  if (surplus[id] > 1) return;
  const depot = t.layer === 0 ? 'the HQ' : 'the depot';
  g.emit({ t: 'toast', text: `${BUILDINGS[t.type].name} has all its ${ITEMS[id]?.name ?? id}; the crew stacks extras by ${depot}`, kind: 'info' });
}

export interface ProjectNeed {
  item: string;
  /** Delivered so far, never above the need. */
  delivered: number;
  need: number;
  /** Extras that came in after the need was met, stacked in the layer's depot. */
  surplus: number;
}

/** The open project's needs, for the Drill and Heart inspectors: delivered/needed per good, and the extras sent to the depot. */
export function projectNeeds(g: Game): ProjectNeed[] {
  const p = g.s.project;
  if (!p) return [];
  return Object.entries(PROJECTS[p.id].needs).map(([item, need]) => ({ item, delivered: Math.min(need, p.delivered[item] ?? 0), need, surplus: p.surplus?.[item] ?? 0 }));
}

export function projectFraction(g: Game): number {
  const p = g.s.project;
  if (!p) return 1;
  const def = PROJECTS[p.id];
  let have = 0;
  let need = 0;
  for (const [k, v] of Object.entries(def.needs)) {
    have += Math.min(v, p.delivered[k] ?? 0);
    need += v;
  }
  return need ? have / need : 1;
}

export function completeProject(g: Game): void {
  const s = g.s;
  const p = s.project!;
  const def = PROJECTS[p.id];
  s.projectsDone.push(p.id);
  s.project = null;
  if (def.opens < 0) {
    // Every milestone from the open one up to its own (The Governor) lands first, in order, each with
    // its reward and toast: In Sequence is still open when the Heart is fed before every node wakes,
    // and once the game has ended checkMilestones never looks again.
    const last = MILESTONES.findIndex((x) => x.steps.some((st) => st.kind === 'project' && st.project === p.id));
    while (last >= 0 && s.milestone <= last) finishMilestone(g, true);
    s.ended = true;
    s.endTime = 0;
    // The whole mountain wakes: every conduit on every layer, for good.
    for (let li = 0; li < s.layers.length; li++) {
      const L = s.layers[li];
      L.conduitLive.set(L.conduit);
      g.staticLight[li] = new Float32Array(0);
      g.dirty[li] = true;
    }
    g.emit({ t: 'ending' });
    g.emit({ t: 'message', who: 'mags', text: 'Foreman... listen. It is not humming any more. It is singing.' });
    return;
  }
  breakthrough(g, def.layer, def.opens);
}

/** The drill sinks: open the next layer, build the shaft and its stations, move the rig. */
export function breakthrough(g: Game, from: number, to: number): void {
  const s = g.s;
  const fromDef = LAYERS[from];
  const bs = fromDef.boreSite!;
  // The cells the lines feeding the Drill push into: once the top station takes the middle of its
  // footprint, the ring around it is bare floor and those lines stop there.
  const fed = drillFeeds(g, from);
  // Remove the drill on the upper layer.
  for (const b of [...s.buildings.values()]) {
    if (b.layer === from && b.type === 'drill') {
      const L = g.layer(from);
      for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) L.occ[(b.y + dy) * L.w + b.x + dx] = -1;
      s.buildings.delete(b.id);
      g.dirty[from] = true;
    }
  }
  const L = g.layer(to);
  L.open = true;
  s.deepest = Math.max(s.deepest, to);
  createShaft(g, from, bs.x, bs.y);
  placeFixed(g, to);
  L.stock = { ...LAYERS[to].starterCrate };
  L.requests = { ...LAYERS[to].requests };
  const next = LAYERS[to].project;
  s.project = { id: next, delivered: {} };
  g.emit({ t: 'breakthrough', layer: to });
  // Mags's introduction to the new layer goes on the radio first: the milestone that waited on this
  // project lands now (its toast and reward, then the next milestone's intro) instead of up to 15
  // ticks later, behind the lines below (review-3 K13).
  checkMilestones(g);
  if (fed.some((c) => !g.at(from, c.x, c.y))) g.emit({ t: 'message', who: 'mags', text: drillLinesLine(from) });
  g.emit({ t: 'message', who: 'board', text: `Memo from the Board: breakthrough to ${LAYERS[to].name.replace(/^The /, 'the ')} noted. Production targets will be revised upward.` });
  fillContracts(g, true);
  g.staticLight[to] = new Float32Array(0);
}

/**
 * Mags at a breakthrough when lines fed the Drill on the layer above (the camera is already on the
 * new layer, so she says where): the top station's front is its exit, so they go into a side of it,
 * or the station turns with R, or they go into the depot (review-3 K1).
 */
export function drillLinesLine(from: number): string {
  return `Up ${LAYERS[from].at} your drill lines end where the Drill stood: belt them into a side of the top station (its front is the exit) or turn it with R, or belt them into ${from === 0 ? 'the HQ' : 'the depot'}.`;
}

/**
 * The cells inside the Drill's footprint on this layer that built belts and other logistics pieces
 * (by their exits) and machines (by their output ports) push into: the lines feeding the Drill.
 */
function drillFeeds(g: Game, layer: number): { x: number; y: number }[] {
  const drill = [...g.s.buildings.values()].find((b) => b.layer === layer && b.type === 'drill');
  if (!drill) return [];
  const size = BUILDINGS.drill.size;
  const inside = (c: { x: number; y: number }) => c.x >= drill.x && c.x < drill.x + size && c.y >= drill.y && c.y < drill.y + size;
  const out: { x: number; y: number }[] = [];
  for (const b of g.s.buildings.values()) {
    if (b.layer !== layer || b.planned || b.id === drill.id) continue;
    const k = BUILDINGS[b.type].kind;
    let cells: { x: number; y: number }[] = [];
    if (isSlot(k)) {
      const dirs: Dir[] = k === 'splitter' ? [b.dir, leftOf(b.dir), rightOf(b.dir)] : k === 'sorter' ? [b.dir, leftOf(b.dir)] : k === 'crossing' ? [0, 1, 2, 3] : [b.dir];
      cells = dirs.map((d) => ({ x: b.x + DX[d], y: b.y + DY[d] }));
    } else if (k === 'machine' || k === 'miner' || k === 'collector') {
      cells = [outputPort(b)];
    }
    for (const c of cells) if (inside(c)) out.push(c);
  }
  return out;
}

/** Depot, drill rig, the crew's power rig, and the Alien Strata's fixed machines for a newly opened layer. */
export function placeFixed(g: Game, n: number): void {
  const def = LAYERS[n];
  if (!def.arrival) return;
  const a = def.arrival;
  g.forcePlace('depot', n, a.x + 2, a.y - 1, 2);
  // The crew's rig: a coal Miner pushing straight into a Combustion Generator. The generator comes
  // stocked with all the coal it holds, so the rig runs at once even when the layer above has no power
  // to spare for its Miner (review-3 Q2): 4 coal last 160 s at the Miner's 8 kW.
  for (const d of def.deposits) {
    if (!d.rig) continue;
    const m = g.forcePlace('miner', n, d.x - 1, d.y - 1, 1);
    const info = g.minerInfo(n, m.x, m.y, BUILDINGS.miner);
    m.ore = info.ore;
    m.rate = info.rate;
    const gen = g.forcePlace('generator', n, d.x + 1, d.y - 1, 1);
    gen.inBuf.coal = GEN_FUEL_CAP;
  }
  // Rigs and alien machines in hidden caverns stay hidden until you dig to them.
  const hiddenPlace = (type: string, x: number, y: number) => {
    const L = g.layer(n);
    const size = BUILDINGS[type].size;
    const was: number[] = [];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) was.push(L.revealed[(y + dy) * L.w + x + dx]);
    g.forcePlace(type, n, x, y, 2);
    let k = 0;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) L.revealed[(y + dy) * L.w + x + dx] = was[k++];
  };
  if (def.boreSite) hiddenPlace('drill', def.boreSite.x - 2, def.boreSite.y - 2);
  if (n === 5) {
    hiddenPlace('heart', HEART.x - 3, HEART.y - 3);
    for (const node of ENGINE_NODES) {
      hiddenPlace('engine_node', node.x - 1, node.y - 1);
      if (node.waking) {
        const b = g.at(n, node.x, node.y);
        if (b) b.recipe = 'waking';
      }
    }
  }
}

// ------------------------------------------------------------------ milestones

export function startMilestone(g: Game, index: number, silent = false): void {
  const s = g.s;
  s.milestone = index;
  s.msBase = cloneStats(s.stats);
  const m = MILESTONES[index];
  if (m) g.emit({ t: 'message', who: 'mags', text: m.intro });
  const where = m?.locate ? locateLine(g, m.locate) : null;
  if (where) g.emit({ t: 'message', who: 'mags', text: where });
  void silent;
}

export interface StepProgress {
  cur: number;
  max: number;
  done: boolean;
  label: string;
}

/**
 * A step's label in the objectives panel. The count shows beside it (cur/max), so generated labels
 * leave the number out and use short item names: they must fit the panel (tests/ui-labels.test.ts).
 */
export function stepLabel(st: StepDef): string {
  switch (st.kind) {
    case 'event':
      return st.label;
    case 'sell':
      return `Ship ${itemShort(st.item)}`;
    case 'produce':
      return st.label ?? `Make ${itemShort(st.item)}`;
    case 'deliver':
      return st.label ?? `Deliver ${itemShort(st.item)}`;
    case 'build': {
      if (st.label) return st.label;
      const name = BUILDINGS[st.building].name;
      return st.count > 1 ? `Build ${name}s` : `Build ${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
    }
    case 'dig':
      return st.label ?? 'Excavate rock';
    case 'reach':
      return st.label;
    case 'elevator':
      return 'Move items by elevator';
    case 'assay':
      return `Assay ${ASSAYS[st.assay].name}`;
    case 'project':
      return PROJECTS[st.project].opens < 0 ? 'Feed the Heart' : 'Feed the Drill';
    case 'visit':
      return `Go down to ${LAYERS[st.layer].name.replace(/^The /, 'the ')}`;
  }
}

export function stepProgress(g: Game, st: StepDef): StepProgress {
  const s = g.s;
  const base = s.msBase;
  const label = stepLabel(st);
  const d = (a: Record<string, number>, b: Record<string, number>, k: string) => (a[k] ?? 0) - (b[k] ?? 0);
  switch (st.kind) {
    case 'event': {
      const done = !!s.stats.events[st.event];
      return { cur: done ? 1 : 0, max: 1, done, label };
    }
    case 'sell': {
      const cur = d(s.stats.sold, base.sold, st.item);
      return { cur, max: st.count, done: cur >= st.count, label };
    }
    case 'produce': {
      const cur = d(s.stats.produced, base.produced, st.item);
      return { cur, max: st.count, done: cur >= st.count, label };
    }
    case 'deliver': {
      const cur = d(s.stats.delivered, base.delivered, st.item);
      return { cur, max: st.count, done: cur >= st.count, label };
    }
    case 'build': {
      // What stands now counts, wherever and whenever it was built (ghosts don't).
      let cur = 0;
      for (const b of s.buildings.values()) {
        if (b.type !== st.building || b.planned) continue;
        if (st.ore && b.ore !== st.ore) continue;
        if (st.layer !== undefined && b.layer !== st.layer) continue;
        cur++;
      }
      return { cur, max: st.count, done: cur >= st.count, label };
    }
    case 'dig': {
      // Tiles dug since the milestone began. The Copper Line's step, marked on the Surface ridge, also
      // counts the ridge already open: dug before the step came up, or never there on a map from before
      // the ridge (save.ts), so nobody is sent to dig rock that isn't there.
      let cur = s.stats.dug - base.dug;
      if (st.mark?.kind === 'outcrop') cur = Math.max(cur, ridgeOpen(g));
      return { cur, max: st.count, done: cur >= st.count, label };
    }
    case 'elevator': {
      const cur = s.stats.elevator - base.elevator;
      return { cur, max: st.count, done: cur >= st.count, label };
    }
    case 'assay': {
      const a = ASSAYS[st.assay];
      const cur = Math.min(a.samples, s.assays[st.assay] ?? 0);
      const done = s.assaysDone.includes(st.assay);
      return { cur, max: a.samples, done, label };
    }
    case 'project': {
      const done = s.projectsDone.includes(st.project);
      const p = PROJECTS[st.project];
      let cur = 0;
      let max = 0;
      for (const [k, v] of Object.entries(p.needs)) {
        max += v;
        cur += done ? v : s.project?.id === st.project ? Math.min(v, s.project.delivered[k] ?? 0) : 0;
      }
      return { cur, max, done, label };
    }
    case 'visit': {
      const done = s.visited.includes(st.layer);
      return { cur: done ? 1 : 0, max: 1, done, label };
    }
    case 'reach': {
      const d = nearestDeposit(st.layer, st.ore);
      const L = g.layer(st.layer);
      const done = !!d && !!L?.open && !!L.revealed[d.y * L.w + d.x];
      return { cur: done ? 1 : 0, max: 1, done, label };
    }
  }
}

// ------------------------------------------------------------------ the tutorial's hints and guide marks

/** A rectangle of tiles: top-left corner and size. */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The step the hint and the guide marks follow: the open milestone's first unfinished one (none after the ending). */
export function currentStep(g: Game): StepDef | undefined {
  const m = MILESTONES[g.s.milestone];
  if (!m || g.s.ended) return undefined;
  return m.steps.find((st) => !stepProgress(g, st).done);
}

/**
 * The objectives panel's hint: the first unfinished step's own hint (the UI path and the control for
 * what to do next), else the milestone's.
 */
export function currentHint(g: Game): string | undefined {
  const m = MILESTONES[g.s.milestone];
  if (!m || g.s.ended) return undefined;
  return currentStep(g)?.hint ?? m.hint;
}

/**
 * What the current step points at on one layer, as tile rects for the renderer to outline: the
 * deposit to mine or dig to, the building to belt into or click, the rock to dig. Read from the map
 * as generated, so it follows whatever a seed did to a deposit's edge. Empty when the step points at
 * nothing, or at something on another layer.
 */
export function guideMarks(g: Game, layer: number): TileRect[] {
  const mark = currentStep(g)?.mark;
  if (!mark || markLayer(mark) !== layer || !g.layer(layer)?.open) return [];
  const r = markRect(g, mark);
  return r ? [r] : [];
}

function markLayer(mark: MarkDef): number {
  return mark.kind === 'outcrop' ? 0 : mark.layer;
}

function markRect(g: Game, mark: MarkDef): TileRect | null {
  switch (mark.kind) {
    case 'deposit':
      return depositRect(g, mark.layer, mark.ore);
    case 'building': {
      // Asked every frame: walk the buildings rather than copy them all into an array.
      for (const b of g.s.buildings.values()) {
        if (b.layer !== mark.layer || b.type !== mark.building) continue;
        const size = BUILDINGS[b.type].size;
        return { x: b.x, y: b.y, w: size, h: size };
      }
      return null;
    }
    case 'outcrop': {
      // The rock left standing: the mark shrinks as it is dug and goes once it is all floor.
      const L = g.layer(0);
      return cellsRect(outcropCells().filter((c) => L.terrain[c.y * L.w + c.x] === T_ROCK));
    }
    case 'bore': {
      const b = LAYERS[mark.layer].boreSite;
      return b ? { x: b.x - 2, y: b.y - 2, w: 5, h: 5 } : null;
    }
  }
}

/** How many of the Surface ridge's tiles are open floor now: dug, or on an older map never rock. */
function ridgeOpen(g: Game): number {
  const L = g.layer(0);
  let n = 0;
  for (const c of outcropCells()) if (L.terrain[c.y * L.w + c.x] !== T_ROCK) n++;
  return n;
}

/** The smallest rect holding every cell, or null for none. */
function cellsRect(cells: { x: number; y: number }[]): TileRect | null {
  if (!cells.length) return null;
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

/**
 * A layer's deposit of an ore nearest where the player starts on it: the HQ on the Surface, the
 * shaft's arrival below. The designed deposits (data/layers.ts) are the same on every seed; only their
 * edges vary, so their ore cells are read from the map (depositRect).
 */
export function nearestDeposit(layer: number, ore: string): { x: number; y: number; r: number } | null {
  const def = LAYERS[layer];
  const from = def.arrival ?? { x: SURFACE.hq.x + 1, y: SURFACE.hq.y + 1 };
  let best: { x: number; y: number; r: number } | null = null;
  let bd = Infinity;
  for (const d of def.deposits) {
    if (d.ore !== ore) continue;
    const dist = Math.hypot(d.x - from.x, d.y - from.y);
    if (dist < bd) {
      bd = dist;
      best = d;
    }
  }
  return best;
}

/** The tiles of the nearest deposit of an ore on a layer (nearestDeposit) that really hold it. */
function depositRect(g: Game, layer: number, ore: string): TileRect | null {
  const d = nearestDeposit(layer, ore);
  if (!d) return null;
  const L = g.layer(layer);
  const idx = oreIndex(ore);
  const cells: { x: number; y: number }[] = [];
  for (let y = d.y - d.r - 1; y <= d.y + d.r + 1; y++) {
    for (let x = d.x - d.r - 1; x <= d.x + d.r + 1; x++) {
      if (x >= 0 && y >= 0 && x < L.w && y < L.h && L.ore[y * L.w + x] === idx) cells.push({ x, y });
    }
  }
  return cellsRect(cells);
}

export function checkMilestones(g: Game): void {
  const s = g.s;
  const m = MILESTONES[s.milestone];
  if (!m || s.ended) return;
  // A milestone only counts once its layer is open (the Shallows ones wait for D1, etc.).
  if (!m.steps.every((st) => stepProgress(g, st).done)) return;
  finishMilestone(g);
}

/**
 * The open milestone is done: its reward, the toast and Mags's outro, then the next one starts. At
 * the ending (`ending`), which lands every milestone left up to The Governor in a row, the next one
 * opens without Mags's intro or bearings.
 */
function finishMilestone(g: Game, ending = false): void {
  const s = g.s;
  const m = MILESTONES[s.milestone];
  s.msDone.push(m.n);
  // Rewards are money, not income: the $/min readout counts sales and contracts only.
  if (m.reward.money) g.earn(m.reward.money, false);
  if (m.reward.license && !s.licenses.includes(m.reward.license)) s.licenses.push(m.reward.license);
  g.emit({ t: 'milestone', n: m.n, name: m.name });
  if (m.outro) g.emit({ t: 'message', who: 'mags', text: m.outro });
  const next = s.milestone + 1;
  if (next >= MILESTONES.length) s.milestone = MILESTONES.length;
  else if (ending) {
    s.milestone = next;
    s.msBase = cloneStats(s.stats);
  } else startMilestone(g, next);
}
