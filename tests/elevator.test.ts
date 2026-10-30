// Elevators and depot requests: review 2 decisions C1, C2, C3, C7, C9, C11 and the sim review's
// elevator defects (lower-station rotate, arrivals head-of-line freeze, half-cab rounding), and the
// verifier's: requests overfilling a relay depot, belt cargo held in the top bay for a full depot.

import { describe, expect, it } from 'vitest';
import { layStarterLine } from '../src/app/scenarios';
import { ITEMS } from '../src/data/items';
import { LAYERS } from '../src/data/layers';
import { PROJECTS } from '../src/data/progression';
import { pickRequested, requestableItems, requestCandidates, requestMissing, requestNeed, requestsHeld, shaftTraffic, spareAbove, stationStatus, TRAVEL, upgradeElevator, upgradeQuote } from '../src/sim/elevator';
import { Game } from '../src/sim/game';
import { BAY_CAP_PER_CAB, insert, shaftCab } from '../src/sim/logistics';
import { completeProject } from '../src/sim/progress';
import { deserialize, serialize } from '../src/sim/save';
import { run } from './helpers';

function breakthrough(g: Game): void {
  const p = g.s.project!;
  for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
  completeProject(g);
}

/** A free spot for a building on a layer (scans from the top-left). */
function spot(g: Game, layer: number, type: string): { x: number; y: number } {
  for (let y = 2; y < g.layer(layer).h - 2; y++) for (let x = 2; x < g.layer(layer).w - 2; x++) if (g.canPlace(type, layer, x, y, 1).ok) return { x, y };
  throw new Error(`no room for ${type} on layer ${layer}`);
}

describe('C1: requests for any stable, cool item the save has seen', () => {
  it('offers what has been made, delivered or stocked anywhere, never hot or unstable goods, deepest first', () => {
    const g = Game.create(3);
    layStarterLine(g);
    breakthrough(g);
    const L1 = g.layer(1);
    L1.requests = {};
    let items = requestableItems(g, 1);
    expect(items).toContain('iron_plate');
    expect(items).not.toContain('iron_ingot');
    run(g, 10);
    items = requestableItems(g, 1);
    expect(items).toContain('iron_ingot'); // the first iron line made one
    expect(items).not.toContain('resonant_core');
    // Seen: a core in the HQ, a drill bit delivered somewhere, hot and unstable goods made.
    g.layer(0).stock.resonant_core = 1;
    g.s.stats.delivered.drill_bit = 1;
    g.s.stats.produced.hot_ember_ingot = 3;
    g.s.stats.produced.overcharged_crystal = 2;
    items = requestableItems(g, 1);
    expect(items).toContain('resonant_core');
    expect(items).toContain('drill_bit');
    expect(items).not.toContain('hot_ember_ingot');
    expect(items).not.toContain('overcharged_crystal');
    // Deepest home layer first.
    const homes = items.map((k) => ITEMS[k].layer);
    expect(homes).toEqual([...homes].sort((a, b) => b - a));
    expect(items[0]).toBe('resonant_core');
    // A row already on the list isn't offered again; the HQ (no layer above) works the same way.
    L1.requests.resonant_core = 20;
    expect(requestableItems(g, 1)).not.toContain('resonant_core');
    expect(requestableItems(g, 0)).not.toContain('iron_plate');
    expect(requestableItems(g, 0)).toContain('brick');
  });

  it('a requested Resonant Core rides down like any other good', () => {
    const g = Game.create(3);
    while (g.s.deepest < 5) breakthrough(g);
    expect(g.layer(5).requests.resonant_core).toBe(10);
    g.layer(4).stock.resonant_core = 40;
    g.layer(5).stock.resonant_core = 0;
    run(g, 120);
    expect(g.layer(5).stock.resonant_core).toBe(10);
    expect(g.layer(4).stock.resonant_core).toBe(30);
  });
});

describe('C2: the cab serves requests in turn', () => {
  it('300 wire and 40 plates alternate in the cab, and neither starves', () => {
    const g = Game.create(3);
    breakthrough(g);
    const [L0, L1] = [g.layer(0), g.layer(1)];
    L0.stock.iron_plate = 500;
    L0.stock.copper_wire = 500;
    L1.stock.iron_plate = 0;
    L1.requests = { copper_wire: 300, iron_plate: 40 };
    const sh = g.s.shafts[0];
    expect(sh.reqLast).toBeUndefined();
    while (!(sh.state === 'move' && sh.at === 1)) g.tick();
    // ITEMS order: Iron Plate comes before Copper Wire, then they take turns.
    expect(sh.cab.map((i) => i.id)).toEqual(['iron_plate', 'copper_wire', 'iron_plate', 'copper_wire', 'iron_plate', 'copper_wire']);
    expect(sh.reqLast).toBe('copper_wire');
    expect(pickRequested(g, sh)).toBe('iron_plate');
    const w0 = L1.stock.copper_wire ?? 0;
    run(g, 60);
    const plates = L1.stock.iron_plate ?? 0;
    const wire = (L1.stock.copper_wire ?? 0) - w0;
    expect(plates).toBeGreaterThanOrEqual(18);
    expect(Math.abs(plates - wire)).toBeLessThanOrEqual(3);
  });

  it('the last item served is saved, so a loaded game picks up the same turn', () => {
    const g = Game.create(3);
    breakthrough(g);
    g.layer(0).stock.copper_wire = 500;
    g.layer(1).requests = { copper_wire: 300, iron_plate: 400, gear: 100 };
    run(g, 7.3);
    const h = deserialize(serialize(g));
    expect(h.s.shafts[0].reqLast).toBe(g.s.shafts[0].reqLast);
    run(g, 20);
    run(h, 20);
    expect(h.layer(1).stock).toEqual(g.layer(1).stock);
    // Saves from before the rule have no last item: the turn starts at the top of ITEMS.
    const old = JSON.parse(serialize(g));
    delete old.shafts[0].reqLast;
    expect(deserialize(JSON.stringify(old)).s.shafts[0].reqLast).toBeUndefined();
  });
});

describe('C2: starvation warnings say why nothing is coming down', () => {
  it('a Shallows ghost waiting on goods nobody requested: "Request it", no doubled article', () => {
    const g = Game.create(3);
    breakthrough(g);
    g.debugUnlockAll();
    const L1 = g.layer(1);
    L1.requests = {};
    L1.stock = {};
    const at = spot(g, 1, 'crate');
    expect(g.place('crate', 1, at.x, at.y, 1)?.planned).toBe(true);
    g.events.length = 0;
    run(g, 70);
    const msgs = g.events.filter((e) => e.t === 'message').map((e) => (e as { text: string }).text);
    const m = msgs.find((t) => t.includes('Iron Plate'));
    expect(m).toBe('The Shallows depot is out of Iron Plate and none is coming in. Your planned Storage Crate is waiting on it. Request it so the elevator brings it, make it down here, or Rush the plan.');
    expect(msgs.some((t) => t.includes('The The'))).toBe(false);
  });

  it('names the real cause: a met request, nothing spare above, or a cab full of other requests', () => {
    const g = Game.create(3);
    breakthrough(g);
    const [L0, L1] = [g.layer(0), g.layer(1)];
    // The request is already met, but the ghost needs more than it keeps: 10 in stock read as "out of"
    // (review-3 K9), so Mags says how many there are and how many it needs.
    L1.requests = { iron_plate: 10 };
    L1.stock.iron_plate = 10;
    expect(g.starveMessage(1, 'iron_plate', 'assay_lab')).toBe(
      'The Shallows depot has 10 Iron Plate; your planned Assay Lab needs 12 and none is coming in. Its request is already met: raise it so the elevator brings more, make it down here, or Rush the plan.',
    );
    // Requested, but the HQ is at its floor.
    L1.requests = { iron_plate: 40 };
    L1.stock.iron_plate = 0;
    L0.stock.iron_plate = 15;
    expect(spareAbove(g, 1, 'iron_plate')).toBe(0);
    expect(g.starveMessage(1, 'iron_plate', 'assay_lab')).toContain('The HQ has none to spare: stock it up there, make it down here, or Rush the plan.');
    // Requested and spare above, but the cab has run full of 300 wire for a minute.
    L0.stock.copper_wire = 900;
    L1.requests = { copper_wire: 300 };
    run(g, 70);
    expect(shaftTraffic(g, 0).full).toBe(true);
    L1.requests.iron_plate = 40;
    L1.stock.iron_plate = 0;
    L0.stock.iron_plate = 500;
    const wire = requestNeed(g, 1).copper_wire;
    expect(g.starveMessage(1, 'iron_plate', 'press')).toBe(
      `The Shallows depot is out of Iron Plate; your planned Press is waiting on it. The elevator is full of other requests (${wire} Copper Wire queued): lower that request, upgrade the shaft, or Rush the plan.`,
    );
    // The HQ keeps its wording.
    expect(g.starveMessage(0, 'gear', 'press')).toContain('The HQ is out of Gear');
  });
});

describe('C3: live elevator traffic', () => {
  it('counts the last minute: down by requests and by belt cargo, and up; restarts on load', () => {
    const g = Game.create(3);
    breakthrough(g);
    const sh = g.s.shafts[0];
    g.layer(0).stock.gear = 999;
    g.layer(1).requests = { gear: 400 };
    const top = g.b(sh.stations[0])!;
    for (let i = 0; i < 90 * 60; i++) {
      // A saturated belt into the top station, cargo waiting to go up, and the top's arrivals taken away.
      while (insert(g, top, { id: 'brick', heat: 0 }, 1));
      if (sh.bay[1].length < 6) sh.bay[1].push({ id: 'iron_ore', heat: 0 });
      sh.arr[0].length = 0;
      g.tick();
    }
    const t = shaftTraffic(g, sh.id);
    expect(t.rate).toBeCloseTo(45, 5);
    // Requests take half of each cab, belt cargo the other half.
    expect(t.reqDown).toBeGreaterThanOrEqual(21);
    expect(t.beltDown).toBeGreaterThanOrEqual(21);
    expect(t.down).toBeGreaterThanOrEqual(42);
    expect(t.down).toBeLessThanOrEqual(48);
    expect(t.full).toBe(true);
    expect(t.up).toBeGreaterThanOrEqual(40);
    // Not saved.
    expect(shaftTraffic(deserialize(serialize(g)), 0).down).toBe(0);
  });
});

describe('the requests-first share', () => {
  it('is half the cab rounded down: 3 of 6, 4 of 9, 7 of 15', () => {
    for (const [tier, req] of [[0, 3], [1, 4], [2, 7]]) {
      const g = Game.create(3);
      breakthrough(g);
      const sh = g.s.shafts[0];
      sh.tier = tier;
      g.layer(0).stock.gear = 999;
      g.layer(1).requests = { gear: 400 };
      for (let i = 0; i < shaftCab(tier) * 2; i++) sh.bay[0].push({ id: 'coal', heat: 0 });
      g.tick();
      const ids = sh.cab.map((i) => i.id);
      expect(ids.filter((x) => x === 'gear').length, `Mk${tier + 1}`).toBe(req);
      expect(ids.filter((x) => x === 'coal').length, `Mk${tier + 1}`).toBe(shaftCab(tier) - req);
    }
  });
});

describe('C7: upgrades paid from both depots', () => {
  it('takes each good from the lower depot first and the rest from the upper', () => {
    const g = Game.create(3);
    breakthrough(g);
    const [L0, L1] = [g.layer(0), g.layer(1)];
    g.s.money = 5000;
    Object.assign(L1.stock, { motor: 12, steel_beam: 30, reinforced_plate: 0 });
    Object.assign(L0.stock, { motor: 20, steel_beam: 5, reinforced_plate: 10 });
    let q = upgradeQuote(g, 0)!;
    expect(q.goods.find((x) => x.item === 'reinforced_plate')).toMatchObject({ need: 20, below: 0, above: 10, ok: false });
    expect(q.ok).toBe(false);
    expect(upgradeElevator(g, 0)).toBe(false);
    L0.stock.reinforced_plate = 25;
    q = upgradeQuote(g, 0)!;
    expect(q.goods).toEqual([
      { item: 'motor', need: 20, below: 12, above: 20, fromBelow: 12, fromAbove: 8, ok: true },
      { item: 'steel_beam', need: 30, below: 30, above: 5, fromBelow: 30, fromAbove: 0, ok: true },
      { item: 'reinforced_plate', need: 20, below: 0, above: 25, fromBelow: 0, fromAbove: 20, ok: true },
    ]);
    expect(q).toMatchObject({ tier: 1, money: 2000, moneyOk: true, ok: true });
    g.s.money = 100;
    expect(upgradeQuote(g, 0)).toMatchObject({ moneyOk: false, ok: false });
    expect(upgradeElevator(g, 0)).toBe(false);
    g.s.money = 5000;
    expect(upgradeElevator(g, 0)).toBe(true);
    expect(g.s.shafts[0].tier).toBe(1);
    expect([L1.stock.motor, L1.stock.steel_beam, L0.stock.motor, L0.stock.steel_beam, L0.stock.reinforced_plate]).toEqual([0, 0, 12, 5, 5]);
    expect(g.s.money).toBe(3000);
  });
});

describe('C9: lower stations never turn', () => {
  it('refuses to rotate a lower station (button and R), still turns a top one, and repairs old saves', () => {
    const g = Game.create(3);
    breakthrough(g);
    const sh = g.s.shafts[0];
    const top = g.b(sh.stations[0])!;
    const bottom = g.b(sh.stations[1])!;
    expect(bottom.dir).toBe(1);
    expect(g.rotate(bottom.id)).toBe(false);
    expect(g.rotate(bottom.id, 2)).toBe(false);
    expect(bottom.dir).toBe(1);
    expect(g.rotate(top.id)).toBe(true);
    expect(top.dir).toBe(3);
    // A save from an older build, with the lower station turned away from its depot.
    bottom.dir = 2;
    const h = deserialize(serialize(g));
    expect(h.b(bottom.id)!.dir).toBe(1);
    expect(h.b(top.id)!.dir).toBe(3);
    // And the goods it brings land in the depot again.
    h.layer(0).stock.gear = 500;
    h.layer(1).requests = { gear: 60 };
    run(h, 90);
    expect(h.layer(1).stock.gear).toBe(60);
  });

  it('a top station whose up-cargo has nowhere to go says so, naming its face', () => {
    const g = Game.create(3);
    breakthrough(g);
    const sh = g.s.shafts[0];
    for (let i = 0; i < 3; i++) sh.bay[1].push({ id: 'coal', heat: 0 });
    run(g, 20);
    expect(stationStatus(g, g.b(sh.stations[0])!)).toMatchObject({ end: 0, waiting: 3, stalled: true, face: 'south', item: 'coal', depotFull: false });
    expect(stationStatus(g, g.b(sh.stations[1])!)).toMatchObject({ end: 1, waiting: 0, stalled: false });
  });
});

describe('arrivals below never freeze the shaft', () => {
  it('a full item at the head of the arrivals lets the requested goods behind it in', () => {
    const g = Game.create(3);
    breakthrough(g);
    const sh = g.s.shafts[0];
    const [L0, L1] = [g.layer(0), g.layer(1)];
    L0.stock.gear = 500;
    L1.stock.coal = 999;
    L1.stock.gear = 24;
    L1.requests = { gear: 60 };
    // Two coal arrived below before the depot filled up.
    sh.arr[1].push({ id: 'coal', heat: 0 }, { id: 'coal', heat: 0 });
    run(g, 90);
    expect(L1.stock.gear).toBe(60);
    expect(sh.arr[1].map((i) => i.id)).toEqual(['coal', 'coal']);
    expect(stationStatus(g, g.b(sh.stations[1])!)).toMatchObject({ stalled: true, depotFull: true, item: 'coal' });
    // Nothing more of it is sent down while the depot below holds 999: only that belt backs up.
    const top = g.b(sh.stations[0])!;
    expect(insert(g, top, { id: 'coal', heat: 0 }, 1)).toBe(false);
    expect(insert(g, top, { id: 'gear', heat: 0 }, 1)).toBe(true);
    // Coal already in the top bay waits there instead of riding down.
    sh.bay[0].unshift({ id: 'coal', heat: 0 });
    run(g, 10);
    expect(sh.bay[0].map((i) => i.id)).toEqual(['coal']);
    // Room below: it all flows again.
    L1.stock.coal = 900;
    run(g, 15);
    expect(sh.arr[1].length).toBe(0);
    expect(sh.bay[0].length).toBe(0);
    expect(L1.stock.coal).toBe(903);
  });

  it('a fast shaft relaying into a slow one fills the depot between them to 999 and no further', () => {
    const g = Game.create(3);
    breakthrough(g);
    breakthrough(g);
    const [L0, L1, L2] = [g.layer(0), g.layer(1), g.layer(2)];
    const sh0 = g.s.shafts[0];
    // Mk3 into the Shallows, Mk1 on to the Fungal Caverns, which want more plates than the Shallows holds.
    sh0.tier = 2;
    L1.requests = { iron_plate: 400 };
    L2.requests = { iron_plate: 900 };
    L1.stock.iron_plate = 980;
    const lower = g.b(sh0.stations[1])!;
    let most = 0;
    for (let s = 0; s < 120; s++) {
      L0.stock.iron_plate = 999;
      run(g, 1);
      most = Math.max(most, L1.stock.iron_plate ?? 0);
      // Requested plates only ride down while they fit: the arrivals below never wait on a full depot.
      expect(stationStatus(g, lower), `${s} s`).toMatchObject({ stalled: false, depotFull: false });
    }
    expect(most).toBe(999);
    // Full, and still needed below: held back, and the inspector can say why.
    L1.stock.iron_plate = 999;
    expect(requestNeed(g, 1).iron_plate).toBeGreaterThan(0);
    expect(requestCandidates(g, sh0)).not.toContain('iron_plate');
    expect(requestsHeld(g, sh0)).toEqual(['iron_plate']);
    // The Fungal Caverns stop asking: nothing is left stuck, so up-cargo and other requests still move.
    L2.requests = {};
    sh0.bay[1].push({ id: 'coal', heat: 0 }, { id: 'coal', heat: 0 }, { id: 'coal', heat: 0 });
    L0.stock.gear = 500;
    L1.stock.gear = 0;
    L1.requests.gear = 60;
    run(g, 60);
    expect(sh0.bay[1].length).toBe(0);
    expect(L1.stock.gear).toBe(60);
    expect(sh0.arr[1].length).toBe(0);
  });
});

describe('belt cargo held for a full depot below', () => {
  it('shows at the top station and goes down first, before requested goods, once there is room', () => {
    const g = Game.create(3);
    breakthrough(g);
    const [L0, L1] = [g.layer(0), g.layer(1)];
    const sh = g.s.shafts[0];
    const top = g.b(sh.stations[0])!;
    // The Shallows wants more plates than its depot can hold, and the HQ has plenty to spare.
    L1.requests = { iron_plate: 2000 };
    L0.stock.iron_plate = 500;
    L1.stock.iron_plate = 960;
    // The cab is on its way down, so belted plates pile into the top bay: 12 fill a Mk1 bay.
    sh.state = 'move';
    sh.at = 1;
    sh.timer = TRAVEL[0];
    let taken = 0;
    while (insert(g, top, { id: 'iron_plate', heat: 0 }, 1)) taken++;
    expect(taken).toBe(shaftCab(0) * BAY_CAP_PER_CAB);
    // Then the Shallows fills its own depot to 999: the plates wait, and the full bay takes nothing else.
    L1.stock.iron_plate = 999;
    run(g, 30);
    expect(sh.bay[0].length).toBe(12);
    expect(insert(g, top, { id: 'gear', heat: 0 }, 1)).toBe(false);
    expect(stationStatus(g, top)?.held).toEqual({ item: 'iron_plate', count: 12 });
    expect(stationStatus(g, g.b(sh.stations[1])!)?.held ?? null).toBeNull();
    // Room for 9: the held plates take it, not plates requested from the HQ.
    L1.stock.iron_plate = 990;
    run(g, 30);
    expect(L1.stock.iron_plate).toBe(999);
    expect(sh.bay[0].length).toBe(3);
    expect(shaftTraffic(g, sh.id)).toMatchObject({ reqDown: 0, beltDown: 9 });
    expect(stationStatus(g, top)?.held).toEqual({ item: 'iron_plate', count: 3 });
    // Room for all of them: the bay empties and takes other cargo again.
    L1.stock.iron_plate = 500;
    run(g, 20);
    expect(sh.bay[0].length).toBe(0);
    expect(stationStatus(g, top)?.held).toBeNull();
    expect(insert(g, top, { id: 'gear', heat: 0 }, 1)).toBe(true);
  });
});

describe('C11: per-layer requests and the HQ floor', () => {
  it('the HQ keeps its "Keep for the Surface" rows: the elevator never takes it below them', () => {
    const g = Game.create(3);
    expect(g.layer(0).requests).toEqual(LAYERS[0].requests);
    expect(LAYERS[0].requests).toEqual({ iron_plate: 20, gear: 10, copper_wire: 10 });
    breakthrough(g);
    expect(g.layer(1).requests).toEqual({ iron_plate: 40, gear: 20, copper_wire: 20, brick: 20 });
    const [L0, L1] = [g.layer(0), g.layer(1)];
    L0.stock.gear = 30;
    L1.stock.gear = 0;
    L1.requests = { gear: 60 };
    let low = Infinity;
    for (let i = 0; i < 90 * 60; i++) {
      g.tick();
      low = Math.min(low, L0.stock.gear ?? 0);
    }
    expect(low).toBe(10);
    expect(L1.stock.gear).toBe(20);
  });
});

describe('Request the missing goods', () => {
  it('adds or raises the rows a planned ghost underground lacks, counting the ghosts ahead of it', () => {
    const g = Game.create(3);
    breakthrough(g);
    const L1 = g.layer(1);
    L1.stock = { iron_plate: 100, gear: 3 };
    L1.requests = {};
    const a = spot(g, 1, 'press');
    const first = g.place('press', 1, a.x, a.y, 1)!;
    const b = spot(g, 1, 'press');
    const second = g.place('press', 1, b.x, b.y, 1)!;
    expect(first.planned && second.planned).toBe(true);
    // The second press waits behind the first: 8 gears in all, rounded up to a row of 10.
    expect(requestMissing(g, second.id)).toEqual({ gear: 10 });
    expect(L1.requests).toEqual({ gear: 10 });
    expect(requestMissing(g, first.id)).toEqual({});
    // The elevator brings them and both get built.
    run(g, 60);
    expect(first.planned || second.planned).toBe(false);
    // On the Surface there is no elevator to ask.
    g.layer(0).stock.gear = 0;
    const s = spot(g, 0, 'press');
    const hq = g.place('press', 0, s.x, s.y, 1)!;
    expect(hq.planned).toBe(true);
    expect(requestMissing(g, hq.id)).toEqual({});
  });
});
