// Freight elevators: a cab shuttles between the two stations of a shaft (PLAN.md §5.5).
// At the top it also hauls the lower depot's supply requests down, relayed depot to depot, serving
// the requested items in turn.

import { BUILDINGS } from '../data/buildings';
import { ITEM_LIST, ITEMS } from '../data/items';
import type { Game } from './game';
import { STOCK_CAP } from './game';
import { shaftCab } from './logistics';
import { DIR_NAME, TICK, type Building, type Shaft } from './types';

/** Seconds from one end to the other per tier: with the cabs, Mk1 45, Mk2 90, Mk3 180 items/min each way. */
export const TRAVEL = [3, 2, 1.5];
export const DWELL = 1;
/** A part-loaded cab leaves after waiting this long for more. */
export const HOLD = 2.5;
/** The lower station faces east, into its depot (placed at arrival.x + 2); it never turns. */
export const LOWER_STATION_DIR = 1;

export const ELEVATOR_UPGRADES: { cost: Record<string, number>; money: number }[] = [
  { cost: {}, money: 0 },
  { cost: { motor: 20, steel_beam: 30, reinforced_plate: 20 }, money: 2000 },
  { cost: { battery: 10, circuit: 30, steel_beam: 40 }, money: 8000 },
];

/** Depot request rows: "Add" puts an item on the list at REQUEST_ADD; rows move in steps of REQUEST_STEP up to REQUEST_MAX. */
export const REQUEST_ADD = 20;
export const REQUEST_STEP = 10;
export const REQUEST_MAX = 400;

/** The cab counts as running full when the last minute's traffic one way is at least this share of its rate. */
export const SHAFT_FULL = 0.9;
/** A station whose arrivals haven't moved for this many ticks is stuck. */
const STALL_TICKS = 120;
/** The traffic window: one bucket a second over the last minute. */
const WINDOW = 60;

/** Items per minute each way for a tier. */
export function elevatorRate(tier: number): number {
  return (shaftCab(tier) / (TRAVEL[tier] * 2 + DWELL * 2)) * 60;
}

/** Is the cab's cargo on its way down? */
function cabGoingDown(sh: Shaft): boolean {
  if (sh.state === 'move') return sh.at === 1;
  return sh.at === 1 ? !sh.loading : sh.loading;
}

// ------------------------------------------------------------------ requests

/** ITEMS table order: requests are served in turn in this order. */
const ITEM_ORDER = new Map(ITEM_LIST.map((it, i) => [it.id, i]));
function itemOrder(id: string): number {
  return ITEM_ORDER.get(id) ?? ITEM_LIST.length;
}

/** Can a depot ask the elevator for this item at all? Anything that neither shatters nor cools. */
export function isRequestable(id: string): boolean {
  const d = ITEMS[id];
  return !!d && !d.unstable && !d.hot;
}

/**
 * The items a depot can add a request for (its inspector's Add row): anything that neither shatters
 * (Overcharged Crystal) nor cools (Molten Ember Ingot) and that this save has seen, made or delivered
 * to a depot or in any depot's stock, and that isn't on this depot's list yet. Deepest home layer
 * first, then in ITEMS order. On the HQ (layer 0) the rows are its "Keep for the Surface" floor.
 */
export function requestableItems(g: Game, layer: number): string[] {
  const s = g.s;
  const L = g.layer(layer);
  const seen = (id: string) => (s.stats.produced[id] ?? 0) > 0 || (s.stats.delivered[id] ?? 0) > 0 || s.layers.some((x) => (x.stock[id] ?? 0) > 0);
  return ITEM_LIST.filter((it) => isRequestable(it.id) && L.requests[it.id] === undefined && seen(it.id))
    .sort((a, b) => b.layer - a.layer || itemOrder(a.id) - itemOrder(b.id))
    .map((it) => it.id);
}

/**
 * What layer n still needs from the layer above: its own requests plus everything the layers below
 * need through it, less its stock and what is already on its way down to it.
 */
export function requestNeed(g: Game, n: number): Record<string, number> {
  const L = g.layer(n);
  const below = g.s.shafts.find((q) => q.layers[0] === n);
  const above = g.s.shafts.find((q) => q.layers[1] === n);
  const down = below ? requestNeed(g, n + 1) : {};
  const coming: Record<string, number> = {};
  if (above) {
    if (cabGoingDown(above)) for (const it of above.cab) coming[it.id] = (coming[it.id] ?? 0) + 1;
    for (const it of above.arr[1]) coming[it.id] = (coming[it.id] ?? 0) + 1;
  }
  const need: Record<string, number> = {};
  for (const k of new Set([...Object.keys(L.requests), ...Object.keys(down)])) {
    if (!isRequestable(k)) continue;
    const v = (L.requests[k] ?? 0) + (down[k] ?? 0) - (L.stock[k] ?? 0) - (coming[k] ?? 0);
    if (v > 0) need[k] = v;
  }
  return need;
}

/** What the depot above layer n can send down of an item: its stock above its own request (the HQ's rows are a floor). */
export function spareAbove(g: Game, n: number, item: string): number {
  if (n <= 0) return 0;
  const up = g.layer(n - 1);
  return Math.max(0, (up.stock[item] ?? 0) - (up.requests[item] ?? 0));
}

/** Requested items needed below and spare above, in ITEMS order: those the depot below has room for, or (held) those it hasn't. */
function requested(g: Game, sh: Shaft, held: boolean): string[] {
  const n = sh.layers[1];
  const need = requestNeed(g, n);
  return Object.keys(need)
    .filter((k) => need[k] > 0 && spareAbove(g, n, k) > 0 && lowerDepotFull(g, sh, k, inBay(sh, 0, k)) === held)
    .sort((a, b) => itemOrder(a) - itemOrder(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The requested items the cab could load at the top now, in ITEMS order: needed below, spare above,
 * and with room in the depot below. That depot holds 999 at most, counting what is on its way down and
 * the belt cargo of the item waiting in the top bay (it goes first), so a relay depot a slower shaft
 * drains is never overfilled and its arrivals never jam the shaft.
 */
export function requestCandidates(g: Game, sh: Shaft): string[] {
  return requested(g, sh, false);
}

/**
 * Requested items the cab holds back because the depot below has no room for them (999, counting what
 * is on its way and the top bay's): needed below and spare above. For the elevator inspector, which
 * would otherwise blame the depot above.
 */
export function requestsHeld(g: Game, sh: Shaft): string[] {
  return requested(g, sh, true);
}

/**
 * The next requested item for the cab. Requests are served in turn, not biggest first: the first
 * candidate in ITEMS order after the last item served (wrapping), so 300 wire and 40 plates alternate.
 */
export function pickRequested(g: Game, sh: Shaft): string | null {
  const c = requestCandidates(g, sh);
  if (!c.length) return null;
  const last = sh.reqLast !== undefined ? itemOrder(sh.reqLast) : -1;
  return c.find((k) => itemOrder(k) > last) ?? c[0];
}

function loadRequested(g: Game, sh: Shaft): boolean {
  const k = pickRequested(g, sh);
  if (!k) return false;
  const up = g.layer(sh.layers[0]);
  up.stock[k]--;
  sh.cab.push({ id: k, heat: 0 });
  sh.reqLast = k;
  count(g, sh, 'req');
  return true;
}

/**
 * "Request the missing goods" for a planned ghost underground: add or raise its depot's request rows
 * so the elevator brings what it lacks (counting what the ghosts ahead of it in the queue hold), in
 * steps of REQUEST_STEP up to REQUEST_MAX. Returns the rows it set.
 */
export function requestMissing(g: Game, id: number): Record<string, number> {
  const b = g.b(id);
  if (!b || !b.planned || b.layer <= 0) return {};
  const L = g.layer(b.layer);
  const held: Record<string, number> = {};
  for (const q of g.ghostQueue(b.layer)) {
    if (q.id === id) break;
    for (const [k, v] of Object.entries(BUILDINGS[q.type].cost)) held[k] = (held[k] ?? 0) + v;
  }
  const changed: Record<string, number> = {};
  for (const [k, v] of Object.entries(BUILDINGS[b.type].cost)) {
    const want = (held[k] ?? 0) + v;
    if ((L.stock[k] ?? 0) >= want || !isRequestable(k)) continue;
    const target = Math.min(REQUEST_MAX, Math.ceil(want / REQUEST_STEP) * REQUEST_STEP);
    if ((L.requests[k] ?? 0) >= target) continue;
    L.requests[k] = target;
    changed[k] = target;
  }
  return changed;
}

// ------------------------------------------------------------------ traffic (live, not saved)

/** What a shaft loaded, in one-second buckets over the last minute. Not saved: it restarts on load. */
export interface ShaftTraffic {
  /** The second each bucket holds (-1 = empty). */
  sec: number[];
  /** Down by requests, down by belt cargo, up. */
  req: number[];
  belt: number[];
  up: number[];
  /** Tick each end last let an arrival out (for the stall warning). */
  outAt: [number, number];
}

export function trafficOf(g: Game, shaftId: number): ShaftTraffic {
  let t = g.traffic[shaftId];
  if (!t) {
    t = { sec: new Array(WINDOW).fill(-1), req: new Array(WINDOW).fill(0), belt: new Array(WINDOW).fill(0), up: new Array(WINDOW).fill(0), outAt: [g.s.tick, g.s.tick] };
    g.traffic[shaftId] = t;
  }
  return t;
}

function count(g: Game, sh: Shaft, kind: 'req' | 'belt' | 'up'): void {
  const t = trafficOf(g, sh.id);
  const sec = Math.floor(g.s.tick / 60);
  const i = sec % WINDOW;
  if (t.sec[i] !== sec) {
    t.sec[i] = sec;
    t.req[i] = 0;
    t.belt[i] = 0;
    t.up[i] = 0;
  }
  t[kind][i]++;
}

/** A station let an arrival out (logistics.ts calls this). */
export function noteStationOut(g: Game, sh: Shaft, end: number): void {
  trafficOf(g, sh.id).outAt[end] = g.s.tick;
}

export interface TrafficReading {
  /** Items loaded at the top in the last minute: requested goods, belt cargo, both. */
  reqDown: number;
  beltDown: number;
  down: number;
  /** Items loaded at the bottom in the last minute. */
  up: number;
  /** The tier's rate each way (items a minute). */
  rate: number;
  /** The cab ran full on the way down (at least SHAFT_FULL of its rate). */
  full: boolean;
}

/** The live traffic of a shaft over the last minute, for the elevator inspector and the Stack badge. */
export function shaftTraffic(g: Game, shaftId: number): TrafficReading {
  const sh = g.s.shafts[shaftId];
  const rate = sh ? elevatorRate(sh.tier) : 0;
  const t = g.traffic[shaftId];
  const now = Math.floor(g.s.tick / 60);
  let req = 0;
  let belt = 0;
  let up = 0;
  if (t) {
    for (let i = 0; i < WINDOW; i++) {
      if (t.sec[i] <= now - WINDOW || t.sec[i] > now) continue;
      req += t.req[i];
      belt += t.belt[i];
      up += t.up[i];
    }
  }
  return { reqDown: req, beltDown: belt, down: req + belt, up, rate, full: rate > 0 && req + belt >= SHAFT_FULL * rate };
}

// ------------------------------------------------------------------ the depot below

/** How many of this item are already on their way down the shaft (in a cab going down, or arrived below). */
function inFlightDown(sh: Shaft, id: string): number {
  let n = 0;
  if (cabGoingDown(sh)) for (const it of sh.cab) if (it.id === id) n++;
  for (const it of sh.arr[1]) if (it.id === id) n++;
  return n;
}

/**
 * Would one more of this item sent down overfill the lower depot (999)? Counts what is already on its
 * way, plus `extra` (the top bay's). Such cargo waits at the top so it can't block the arrivals below.
 */
export function lowerDepotFull(g: Game, sh: Shaft, id: string, extra = 0): boolean {
  const L = g.layer(sh.layers[1]);
  return (L.stock[id] ?? 0) + inFlightDown(sh, id) + extra >= STOCK_CAP;
}

/** How many of this item wait in a station's bay. */
export function inBay(sh: Shaft, end: number, id: string): number {
  let n = 0;
  for (const it of sh.bay[end]) if (it.id === id) n++;
  return n;
}

/**
 * Belt cargo in the top bay that waits because the depot below holds 999 of it (counting what is on
 * its way): the first such item in the bay and how many of it wait. It still takes bay room, so the
 * top station may refuse every belt until that depot has room; then it goes down first.
 */
export function heldCargo(g: Game, sh: Shaft): { item: string; count: number } | null {
  for (const it of sh.bay[0]) if (lowerDepotFull(g, sh, it.id)) return { item: it.id, count: inBay(sh, 0, it.id) };
  return null;
}

/** Load belt cargo from this end's bay; at the top, goods the depot below can't take stay in the bay. */
function loadBelt(g: Game, sh: Shaft, e: number, cab: number): void {
  const bay = sh.bay[e];
  for (let i = 0; i < bay.length && sh.cab.length < cab; ) {
    if (e === 0 && lowerDepotFull(g, sh, bay[i].id)) {
      i++;
      continue;
    }
    sh.cab.push(bay.splice(i, 1)[0]);
    count(g, sh, e === 0 ? 'belt' : 'up');
  }
}

/** Is there belt cargo at this end the cab could take? */
function bayWork(g: Game, sh: Shaft, end: number): boolean {
  if (end === 1) return sh.bay[1].length > 0;
  return sh.bay[0].some((it) => !lowerDepotFull(g, sh, it.id));
}

export interface StationStatus {
  end: number;
  /** Arrivals waiting to come out of the front. */
  waiting: number;
  /** Arrivals wait and nothing has come out of the front for 2 s. */
  stalled: boolean;
  face: string;
  /** The head arrival. */
  item: string | null;
  /** At the bottom: the depot holds 999 of every waiting arrival. */
  depotFull: boolean;
  /** At the top: belt cargo held in the bay because the depot below holds 999 of it (heldCargo). */
  held?: { item: string; count: number } | null;
}

/**
 * A station's arrivals and whether they are stuck (nothing has come out of its front for 2 s while
 * arrivals wait). At the bottom, `depotFull` says the depot holds 999 of every waiting item (name it
 * with `item`); at the top, nothing at its `face` takes the head item, and `held` names belt cargo
 * waiting in the bay for room in the depot below.
 */
export function stationStatus(g: Game, b: Building): StationStatus | null {
  const sh = g.s.shafts[b.shaft];
  if (!sh || (b.end !== 0 && b.end !== 1)) return null;
  const arr = sh.arr[b.end];
  const t = g.traffic[sh.id];
  const stalled = arr.length > 0 && !!t && g.s.tick - t.outAt[b.end] >= STALL_TICKS;
  const L = g.layer(b.layer);
  const depotFull = b.end === 1 && arr.length > 0 && arr.every((it) => (L.stock[it.id] ?? 0) >= STOCK_CAP);
  const held = b.end === 0 ? heldCargo(g, sh) : null;
  return { end: b.end, waiting: arr.length, stalled, face: DIR_NAME[b.dir], item: arr[0]?.id ?? null, depotFull, held };
}

// ------------------------------------------------------------------ the cab

export function tickElevators(g: Game): void {
  for (const sh of g.s.shafts) {
    const cab = shaftCab(sh.tier);
    if (sh.state === 'dwell') {
      const e = sh.at;
      const other = 1 - e;
      const arrCap = cab * 2;
      // Unload everything that came for this end first.
      if (!sh.loading) {
        while (sh.cab.length && sh.arr[e].length < arrCap) {
          sh.arr[e].push(sh.cab.shift()!);
          g.s.stats.elevator++;
        }
        if (sh.cab.length === 0) {
          sh.loading = true;
          sh.reqN = 0;
        }
      }
      if (sh.loading) {
        // At the top, requested goods take up to half the cab first (rounded down); belt cargo loads as it arrives.
        if (e === 0) {
          while (sh.cab.length < cab && (sh.reqN ?? 0) < Math.floor(cab / 2) && loadRequested(g, sh)) sh.reqN = (sh.reqN ?? 0) + 1;
        }
        loadBelt(g, sh, e, cab);
      }
      sh.timer -= TICK;
      if (sh.timer <= 0 && sh.loading) {
        // Once the dwell is over, any room belt cargo didn't take goes to more requested goods.
        if (e === 0) while (sh.cab.length < cab && loadRequested(g, sh));
        if (sh.cab.length) sh.hold += TICK;
        // Leave when full, when the other end has work waiting, or after a short wait.
        const work = bayWork(g, sh, other) || (e === 1 && pickRequested(g, sh) !== null);
        if (sh.cab.length >= cab || work || (sh.cab.length && sh.hold >= HOLD)) {
          sh.state = 'move';
          sh.at = other;
          sh.timer = TRAVEL[sh.tier];
          sh.hold = 0;
          sh.loading = false;
        }
      }
    } else {
      sh.timer -= TICK;
      const T = TRAVEL[sh.tier];
      const f = Math.max(0, Math.min(1, 1 - sh.timer / T));
      sh.pos = sh.at === 1 ? f : 1 - f;
      if (sh.timer <= 0) {
        sh.state = 'dwell';
        sh.pos = sh.at;
        sh.timer = DWELL;
      }
    }
  }
}

/** Create the shaft between layer a and a+1 at (cx, cy), with a station at each end. */
export function createShaft(g: Game, a: number, cx: number, cy: number): Shaft {
  const id = g.s.shafts.length;
  // The lower station faces its layer's depot, so goods sent down land in stock with no belts.
  const top = g.forcePlace('elevator', a, cx - 1, cy - 1, 2);
  const bottom = g.forcePlace('elevator', a + 1, cx - 1, cy - 1, LOWER_STATION_DIR);
  top.shaft = id;
  top.end = 0;
  bottom.shaft = id;
  bottom.end = 1;
  const sh: Shaft = {
    id,
    stations: [top.id, bottom.id],
    layers: [a, a + 1],
    x: cx,
    y: cy,
    tier: 0,
    pos: 0,
    state: 'dwell',
    at: 0,
    timer: DWELL,
    cab: [],
    bay: [[], []],
    arr: [[], []],
    flow: 0,
    hold: 0,
    loading: true,
    reqN: 0,
  };
  g.s.shafts.push(sh);
  return sh;
}

// ------------------------------------------------------------------ upgrades

export interface UpgradeGood {
  item: string;
  need: number;
  /** Stock in the lower and the upper depot. */
  below: number;
  above: number;
  /** What each depot would pay: the lower one first, the rest from the upper one. */
  fromBelow: number;
  fromAbove: number;
  /** The two depots together hold enough. */
  ok: boolean;
}

export interface UpgradeQuote {
  /** The tier it upgrades to (0-based: 1 is Mk2). */
  tier: number;
  money: number;
  moneyOk: boolean;
  goods: UpgradeGood[];
  /** Every good and the money are there. */
  ok: boolean;
}

/**
 * The next upgrade for a shaft and who pays for it: each good comes from the lower depot first and
 * the rest from the upper depot (goods made deeper still go up by cab only if the lower depot lacks
 * them). Null when the shaft is already Mk3.
 */
export function upgradeQuote(g: Game, shaftId: number): UpgradeQuote | null {
  const sh = g.s.shafts[shaftId];
  if (!sh) return null;
  const next = ELEVATOR_UPGRADES[sh.tier + 1];
  if (!next) return null;
  const top = g.layer(sh.layers[0]);
  const bottom = g.layer(sh.layers[1]);
  const goods = Object.entries(next.cost).map(([item, need]) => {
    const below = Math.max(0, bottom.stock[item] ?? 0);
    const above = Math.max(0, top.stock[item] ?? 0);
    const fromBelow = Math.min(need, below);
    const fromAbove = Math.min(need - fromBelow, above);
    return { item, need, below, above, fromBelow, fromAbove, ok: fromBelow + fromAbove >= need };
  });
  const moneyOk = g.s.money >= next.money;
  return { tier: sh.tier + 1, money: next.money, moneyOk, goods, ok: moneyOk && goods.every((x) => x.ok) };
}

/** Upgrade a shaft's elevator: money, plus goods from the lower depot first and the upper depot for the rest. */
export function upgradeElevator(g: Game, shaftId: number): boolean {
  const q = upgradeQuote(g, shaftId);
  if (!q || !q.ok) return false;
  const sh = g.s.shafts[shaftId];
  const top = g.layer(sh.layers[0]);
  const bottom = g.layer(sh.layers[1]);
  g.s.money -= q.money;
  for (const x of q.goods) {
    bottom.stock[x.item] = (bottom.stock[x.item] ?? 0) - x.fromBelow;
    top.stock[x.item] = (top.stock[x.item] ?? 0) - x.fromAbove;
  }
  sh.tier++;
  g.emit({ t: 'toast', text: `Elevator upgraded to Mk${sh.tier + 1}`, kind: 'good' });
  return true;
}
