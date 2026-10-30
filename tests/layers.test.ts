import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_LIST, LICENSES } from '../src/data/buildings';
import { ITEMS } from '../src/data/items';
import { CONDUIT_KW_PER_NODE, ENGINE_NODES, LAYERS, WAKE_RADIUS, WAKE_RINGS } from '../src/data/layers';
import { ASSAYS, MILESTONES, PROJECTS } from '../src/data/progression';
import { RECIPE_LIST, RECIPES } from '../src/data/recipes';
import { refreshEnv } from '../src/sim/env';
import { Game } from '../src/sim/game';
import { solvePower } from '../src/sim/power';
import { checkMilestones, completeProject, onNodeHeartstone, startMilestone, stepProgress, wakeRings } from '../src/sim/progress';
import { fullGenerator, GEN_FUEL_CAP, insert, nodeJam, waitsOnGenerator } from '../src/sim/logistics';
import type { GameEvent } from '../src/sim/types';
import { paint, run, sandbox } from './helpers';

/** The real Alien Strata, opened by completing every drill project before the Governor. */
function alienStrata(): Game {
  const g = Game.create(20261030);
  while (g.s.project && PROJECTS[g.s.project.id].opens > 0) {
    const p = g.s.project;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
  }
  g.events.length = 0;
  return g;
}

/** Place or fail the test. */
function put(g: Game, type: string, x: number, y: number, dir: 0 | 1 | 2 | 3, opts: { recipe?: string; filter?: string } = {}) {
  const b = g.place(type, 0, x, y, dir, opts);
  if (!b) throw new Error(`could not place ${type} at ${x},${y}: ${g.canPlace(type, 0, x, y, dir).reason}`);
  return b;
}

const RICH = { cobalt_ingot: 99, insulation: 99, circuit: 99, battery: 99, aggregate: 99, heat_shield: 99, filter: 99, conductive_powder: 99 };

describe('Fungal Caverns: spores', () => {
  it('thick spores halve machine speed and a powered filter clears them', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    L.sporeBase.fill(255);
    const press = put(g, 'press', 6, 30, 1);
    const harvesterProof = put(g, 'smelter', 20, 30, 1);
    g.tick();
    refreshEnv(g, 0, true);
    expect(press.envMul).toBeCloseTo(0.5, 5);
    expect(harvesterProof.envMul).toBeCloseTo(0.5, 5);
    // A filter 4 tiles from the press clears its air; the far smelter is untouched.
    put(g, 'spore_filter', 10, 30, 1);
    g.tick();
    refreshEnv(g, 0, true);
    expect(press.envMul).toBeCloseTo(1, 5);
    expect(harvesterProof.envMul).toBeCloseTo(0.5, 5);
  });
});

describe('Crystal Depths: interference', () => {
  it('a working machine nearby slows a crystal machine; a shield wall blocks it', () => {
    const g = sandbox(RICH);
    const cutter = put(g, 'cutter', 6, 30, 1, { recipe: 'cut_crystal' });
    const press = put(g, 'press', 10, 30, 1);
    press.active = true;
    refreshEnv(g, 0, true);
    expect(cutter.links).toContain(press.id);
    expect(cutter.envMul).toBeCloseTo(0.75, 5);
    // A wall across the line between them.
    put(g, 'shield_wall', 9, 30, 0);
    put(g, 'shield_wall', 9, 31, 0);
    refreshEnv(g, 0, true);
    expect(cutter.links.length).toBe(0);
    expect(cutter.envMul).toBeCloseTo(1, 5);
    expect(g.s.stats.events.shield_blocking).toBe(1);
  });

  it('far machines do not interfere', () => {
    const g = sandbox(RICH);
    const cutter = put(g, 'cutter', 6, 30, 1, { recipe: 'cut_crystal' });
    const press = put(g, 'press', 14, 30, 1);
    press.active = true;
    refreshEnv(g, 0, true);
    expect(cutter.envMul).toBeCloseTo(1, 5);
  });

  it('a resonance tap turns interference into power', () => {
    const g = sandbox(RICH);
    const tap = put(g, 'resonance_tap', 10, 30, 1);
    for (const [x, y] of [[6, 30], [14, 30], [10, 26]] as const) put(g, 'press', x, y, 1).active = true;
    refreshEnv(g, 0, true);
    expect(tap.links.length).toBe(3);
  });

  it('overcharged crystal shatters on a belt but goes machine to machine intact', () => {
    const g = sandbox(RICH);
    const belt = put(g, 'belt', 4, 30, 1);
    expect(insert(g, belt, { id: 'overcharged_crystal', heat: 0 }, 1)).toBe(true);
    expect(belt.item?.id).toBe('crystal_grit');
    expect(g.s.stats.events.shattered).toBe(1);

    const g2 = sandbox(RICH);
    const over = put(g2, 'overcharger', 6, 30, 1, { recipe: 'overcharge' });
    put(g2, 'stabilizer', 8, 30, 1, { recipe: 'stabilize' });
    over.inBuf.charged_crystal = 2;
    const stab = g2.at(0, 8, 30)!;
    stab.inBuf.insulation = 2;
    // Room for the cores to land.
    put(g2, 'belt', 10, 30, 1);
    put(g2, 'belt', 11, 30, 1);
    run(g2, 30);
    expect(g2.s.stats.produced.resonant_core ?? 0).toBe(2);
    expect(g2.s.stats.events.shattered ?? 0).toBe(0);
  });
});

describe('Magma Shelf: heat', () => {
  it('hot ground halves ordinary machines and doubles the heat family; warm is milder; foundations cancel both', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    paint(L.hot, L.w, 4, 28, 16, 2);
    paint(L.hot, L.w, 4, 44, 12, 1);
    const press = put(g, 'press', 4, 28, 1);
    const smelter = put(g, 'smelter', 8, 28, 1);
    const bath = put(g, 'cooling_bath', 12, 28, 1);
    const forge = put(g, 'pressure_forge', 16, 28, 1);
    // Foundations first, then the machine on top.
    for (const [x, y] of [[4, 34], [5, 34], [4, 35], [5, 35]] as const) g.place('foundation', 0, x, y, 0);
    const safe = put(g, 'press', 4, 34, 1);
    const warmPress = put(g, 'press', 4, 44, 1);
    const warmSmelter = put(g, 'smelter', 8, 44, 1);
    refreshEnv(g, 0, true);
    expect(press.envMul).toBeCloseTo(0.5, 5);
    expect(smelter.envMul).toBeCloseTo(2, 5);
    expect(bath.envMul).toBeCloseTo(1, 5);
    expect(forge.envMul).toBeCloseTo(2, 5);
    expect(safe.envMul).toBeCloseTo(1, 5);
    expect(warmPress.envMul).toBeCloseTo(0.75, 5);
    expect(warmSmelter.envMul).toBeCloseTo(1.5, 5);
  });

  it('a forge refuses cold and warm ground', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    expect(g.canPlace('pressure_forge', 0, 4, 28, 1).ok).toBe(false);
    paint(L.hot, L.w, 4, 28, 2, 1);
    expect(g.canPlace('pressure_forge', 0, 4, 28, 1).ok).toBe(false);
  });

  it('the Precision Assembler needs steady ground, 8 tiles from any hot ground', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    L.hot[30 * L.w + 20] = 2;
    expect(g.canPlace('precision_assembler', 0, 28, 30, 1).ok).toBe(false);
    expect(g.canPlace('precision_assembler', 0, 29, 30, 1).ok).toBe(true);
  });

  it('molten ingots cool on plain belts and keep their heat on insulated ones', () => {
    const lineOf = (type: string) => {
      const g = sandbox(RICH);
      for (let x = 2; x < 60; x++) put(g, type, x, 40, 1);
      const first = g.at(0, 2, 40)!;
      first.item = { id: 'hot_ember_ingot', heat: 100 };
      first.prog = 0.5;
      run(g, 20);
      return [...g.s.buildings.values()].find((b) => b.item)?.item?.id;
    };
    expect(lineOf('belt')).toBe('cold_ember_ingot');
    expect(lineOf('insulated_belt')).toBe('hot_ember_ingot');
  });
});

describe('Alien Strata: engine nodes', () => {
  it('two items in strict alternation, 2 s each, make a heartstone; a wrong item comes out of the side', () => {
    const g = sandbox(RICH);
    const node = g.forcePlace('engine_node', 0, 10, 30, 1);
    const offer = (id: string) => insert(g, node, { id, heat: 0 }, 1);
    // Each accepted item keeps the node busy for 2 s.
    expect(offer('engine_glass')).toBe(true);
    expect(offer('resonant_core')).toBe(false);
    run(g, 2.1);
    expect(offer('resonant_core')).toBe(true);
    const feed = (id: string) => {
      node.craft = 0;
      expect(offer(id)).toBe(true);
    };
    feed('engine_glass');
    feed('resonant_core');
    expect(node.outBuf.map((i) => i.id)).toEqual(['heartstone']);
    expect(node.stockCount).toBe(1);
    expect(g.s.stats.events.node_woke).toBe(1);
    // A core out of turn comes out of the side, and the node keeps its place.
    feed('resonant_core');
    expect(node.sideBuf.map((i) => i.id)).toEqual(['resonant_core']);
    expect(node.seqPos).toBe(0);
    feed('engine_glass');
    feed('engine_glass');
    expect(node.seqPos).toBe(1);
    expect(g.s.stats.events.node_reject).toBe(2);
    // Anything outside its pair comes out of the side too (it used to be refused at the door, silently
    // stopping the belt); a molten ingot cools on the way.
    feed('iron_plate');
    expect(node.seqPos).toBe(1);
    feed('hot_ember_ingot');
    expect(node.sideBuf.map((i) => i.id)).toEqual(['resonant_core', 'engine_glass', 'iron_plate', 'cold_ember_ingot']);
    expect(g.s.stats.events.node_reject).toBe(4);
    // Four wrong items with nowhere to go: the side chute is full and the node takes nothing more.
    node.craft = 0;
    expect(offer('engine_glass')).toBe(false);
    expect(nodeJam(node)).toEqual({ outFull: false, sideFull: true, sideFace: 'north' });
    run(g, 0.1);
    expect(node.status).toBe('blocked');
  });

  it("the Waking Node takes batteries and cores, and its first heartstone wakes the conduit around it", () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    for (let x = 0; x < L.w; x++) L.conduit[20 * L.w + x] = 1;
    const node = g.forcePlace('engine_node', 0, 10, 18, 1);
    node.recipe = 'waking';
    const offer = (id: string) => {
      node.craft = 0;
      return insert(g, node, { id, heat: 0 }, 1);
    };
    // Engine Glass isn't in its pair: it comes out of the side.
    expect(offer('engine_glass')).toBe(true);
    expect(node.sideBuf.map((i) => i.id)).toEqual(['engine_glass']);
    for (const id of ['battery', 'resonant_core', 'battery', 'resonant_core']) expect(offer(id)).toBe(true);
    expect(node.stockCount).toBe(1);
    expect(L.conduitLive[20 * L.w + 11]).toBe(1);
    expect(L.conduitLive[20 * L.w + 40]).toBe(0);
  });

  it('a node wakes its conduit ring by ring: five Heartstones, each one 3 tiles further', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    // A conduit line 4 tiles below the node's centre, like the Waking Node's.
    for (let x = 0; x < L.w; x++) L.conduit[44 * L.w + x] = 1;
    const node = g.forcePlace('engine_node', 0, 20, 39, 1);
    node.recipe = 'waking';
    const rings = wakeRings(g, node);
    expect(rings.length).toBe(WAKE_RINGS);
    // Ring 1 reaches 1 tile past the nearest conduit (4 tiles), then +3 each, the last at least the old 15.
    expect(rings).toEqual([5, 8, 11, 14, 17]);
    expect(rings[rings.length - 1]).toBeGreaterThanOrEqual(WAKE_RADIUS);
    const live = () => L.conduitLive.reduce((a, v) => a + v, 0);
    const heartstone = () => {
      for (const id of ['battery', 'resonant_core', 'battery', 'resonant_core']) {
        node.craft = 0;
        expect(insert(g, node, { id, heat: 0 }, 1)).toBe(true);
      }
      node.outBuf = [];
    };
    g.events.length = 0;
    const counts: number[] = [];
    for (let k = 0; k < 6; k++) {
      heartstone();
      counts.push(live());
    }
    // Each ring lights more; the first always lights something; the sixth Heartstone adds nothing.
    for (let k = 1; k < 5; k++) expect(counts[k]).toBeGreaterThan(counts[k - 1]);
    expect(counts[5]).toBe(counts[4]);
    // Ring 1 at radius 5 on a line 4 tiles away: the 7 tiles under the node, x 18..24.
    expect(counts[0]).toBe(7);
    const awake = g.events.filter((e): e is Extract<GameEvent, { t: 'node_awake' }> => e.t === 'node_awake');
    expect(awake.map((e) => e.ring)).toEqual([1, 2, 3, 4, 5]);
    expect(awake.reduce((a, e) => a + e.tiles.length, 0)).toBe(counts[4]);
    // Mags speaks on the first ring only.
    expect(g.events.filter((e) => e.t === 'message').length).toBe(1);
    expect(node.stockCount).toBe(6);
  });

  it('on the real Alien Strata the first Heartstone of every node lights some conduit', () => {
    const g = Game.create(20261030);
    while (g.s.project && PROJECTS[g.s.project.id].opens > 0) {
      const p = g.s.project;
      for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
      completeProject(g);
    }
    const L = g.layer(5);
    for (const n of ENGINE_NODES) {
      const node = g.at(5, n.x, n.y)!;
      const before = L.conduitLive.reduce((a, v) => a + v, 0);
      const seq = node.recipe === 'waking' ? ['battery', 'resonant_core'] : ['engine_glass', 'resonant_core'];
      for (let k = 0; k < 4; k++) {
        node.craft = 0;
        expect(insert(g, node, { id: seq[k % 2], heat: 0 }, node.dir)).toBe(true);
      }
      expect(node.stockCount, `node ${n.x},${n.y}`).toBe(1);
      expect(L.conduitLive.reduce((a, v) => a + v, 0), `node ${n.x},${n.y}`).toBeGreaterThan(before);
    }
    expect(g.s.stats.events.all_nodes_awake).toBe(1);
  });

  it("every real node's first ring lights conduit outside its own footprint, not only the tiles it hides", () => {
    const g = alienStrata();
    const L = g.layer(5);
    const asleep = L.conduitLive.slice();
    const size = BUILDINGS.engine_node.size;
    for (const n of ENGINE_NODES) {
      const node = g.at(5, n.x, n.y)!;
      L.conduitLive.set(asleep);
      g.events.length = 0;
      onNodeHeartstone(g, node);
      const e = g.events.find((x): x is Extract<GameEvent, { t: 'node_awake' }> => x.t === 'node_awake');
      const outside = (e?.tiles ?? []).filter((i) => {
        const x = i % L.w;
        const y = Math.floor(i / L.w);
        return x < node.x || x >= node.x + size || y < node.y || y >= node.y + size;
      });
      expect(outside.length, `node ${n.x},${n.y}`).toBeGreaterThan(0);
    }
  });

  it('a ring that lights nothing new, or any Heartstone after the ending, makes no pulse, toast or speech', () => {
    const g = alienStrata();
    const L = g.layer(5);
    const [a, b] = ENGINE_NODES.filter((n) => !n.waking).map((n) => g.at(5, n.x, n.y)!);
    // An older save whose first ring lit everything: the next ring finds nothing to wake.
    L.conduitLive.set(L.conduit);
    a.stockCount = 1;
    g.events.length = 0;
    onNodeHeartstone(g, a);
    expect(a.stockCount).toBe(2);
    expect(g.events).toEqual([]);
    // A first ring that finds its conduit already awake still starts the node: Mags says so, no pulse.
    onNodeHeartstone(g, b);
    expect(b.stockCount).toBe(1);
    expect(g.events.map((e) => e.t)).toEqual(['message']);
    // The Governor delivered: the ending wakes everything and later Heartstones stay quiet, even in a
    // save from before the ending woke the conduit, where the ring still wakes its tiles.
    const p = g.s.project!;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
    expect(g.s.ended).toBe(true);
    L.conduitLive.fill(0);
    const w = ENGINE_NODES.find((n) => n.waking)!;
    const waking = g.at(5, w.x, w.y)!;
    g.events.length = 0;
    onNodeHeartstone(g, waking);
    onNodeHeartstone(g, a);
    expect(g.events).toEqual([]);
    expect(waking.stockCount).toBe(1);
    expect(L.conduitLive.reduce((n, v) => n + v, 0)).toBeGreaterThan(0);
  });

  it('milestone 29 (Wake the Engine) asks for five Heartstones, one per ring, and completes on the fifth', () => {
    const g = Game.create(20261030);
    while (g.s.project && PROJECTS[g.s.project.id].opens > 0) {
      const p = g.s.project;
      for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
      completeProject(g);
    }
    const idx = MILESTONES.findIndex((m) => m.n === 29);
    startMilestone(g, idx);
    const st = MILESTONES[idx].steps[0];
    expect(st).toMatchObject({ kind: 'produce', item: 'heartstone', count: WAKE_RINGS });
    const waking = ENGINE_NODES.find((n) => n.waking)!;
    const node = g.at(5, waking.x, waking.y)!;
    const heartstone = () => {
      for (const id of ['battery', 'resonant_core', 'battery', 'resonant_core']) {
        node.craft = 0;
        expect(insert(g, node, { id, heat: 0 }, node.dir)).toBe(true);
      }
      node.outBuf = [];
    };
    for (let k = 0; k < 4; k++) heartstone();
    checkMilestones(g);
    expect(stepProgress(g, st)).toMatchObject({ cur: 4, max: 5, done: false, label: 'Wake the Waking Node' });
    expect(g.s.msDone).not.toContain(29);
    heartstone();
    expect(node.stockCount).toBe(5);
    checkMilestones(g);
    expect(g.s.msDone).toContain(29);
    expect(g.s.milestone).toBe(idx + 1);
  });

  it('machines on awake conduit run on the node pool, and attuners need two tiles of it', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    expect(g.canPlace('attuner', 0, 4, 28, 1).ok).toBe(false);
    for (let x = 0; x < L.w; x++) L.conduit[28 * L.w + x] = 1;
    // Dormant conduit is not enough.
    expect(g.canPlace('attuner', 0, 4, 28, 1).ok).toBe(false);
    for (let x = 0; x < L.w; x++) L.conduitLive[28 * L.w + x] = 1;
    // One awake node feeds the pool.
    const node = g.forcePlace('engine_node', 0, 30, 34, 1);
    node.stockCount = 1;
    const att = put(g, 'attuner', 4, 28, 1, { recipe: 'attune' });
    att.inBuf.thrumstone = 4;
    put(g, 'belt', 6, 29, 1);
    put(g, 'belt', 7, 29, 1);
    run(g, 20);
    expect(g.s.stats.produced.engine_glass ?? 0).toBe(2);
    expect(g.layer(0).power.demand).toBe(0);
    expect(g.layer(0).power.pool).toBeGreaterThan(0);
  });

  it('one awake node runs exactly two Attuners; a third shares the pool and slows them all', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    for (let x = 0; x < L.w; x++) {
      L.conduit[28 * L.w + x] = 1;
      L.conduitLive[28 * L.w + x] = 1;
    }
    const node = g.forcePlace('engine_node', 0, 30, 34, 1);
    node.stockCount = 1;
    const atts = [4, 8, 12].map((x) => put(g, 'attuner', x, 28, 1, { recipe: 'attune' }));
    for (const a of atts) {
      a.active = true;
      a.craft = 0;
    }
    expect(CONDUIT_KW_PER_NODE).toBe(60);
    expect(BUILDINGS.attuner.power).toBe(30);
    solvePower(g);
    expect(L.power.pool).toBe(60);
    expect(L.power.poolDemand).toBe(90);
    expect(L.power.poolSat).toBeCloseTo(60 / 90, 5);
    atts[2].active = false;
    solvePower(g);
    expect(L.power.poolSat).toBe(1);
  });
});

describe('power', () => {
  it('a working machine draws its full rating even when a hazard slows it', () => {
    const g = sandbox(RICH);
    const L = g.layer(0);
    paint(L.hot, L.w, 4, 28, 2, 2);
    const press = put(g, 'press', 4, 28, 1, { recipe: 'iron_plate' });
    refreshEnv(g, 0, true);
    expect(press.envMul).toBeCloseTo(0.5, 5);
    press.active = true;
    press.craft = 0;
    for (const b of g.s.buildings.values()) if (b.id !== press.id) b.active = false;
    solvePower(g);
    expect(L.power.demand).toBe(BUILDINGS.press.power);
  });

  it('spare power crosses the shafts nearest layer first, within each cable', () => {
    const g = Game.create(3);
    for (let k = 0; k < 2; k++) {
      const p = g.s.project!;
      for (const [item, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[item] = v;
      completeProject(g);
    }
    expect(g.layer(2).open).toBe(true);
    // Quiet everything already built: no demand, no fuel.
    for (const b of g.s.buildings.values()) {
      b.active = false;
      if (BUILDINGS[b.type].kind === 'generator') {
        b.inBuf = {};
        b.burn = 0;
      }
    }
    g.s.lineLevel = 2;
    // 96 kW of presses on the Fungal Caverns.
    for (let k = 0; k < 12; k++) {
      const p = g.forcePlace('press', 2, 6 + k * 3, 6, 1);
      p.recipe = 'iron_plate';
      p.active = true;
      p.craft = 0;
    }
    solvePower(g);
    // Only the Surface has spare power: two Mk1 cables carry 60 kW of it down.
    expect(g.layer(2).power.sat).toBeCloseTo(60 / 96, 5);
    expect(g.s.shafts[0].flow).toBe(60);
    expect(g.s.shafts[1].flow).toBe(60);
    // A fuelled generator on the Shallows is nearer, so it supplies first.
    const gen = [...g.s.buildings.values()].find((b) => b.layer === 1 && BUILDINGS[b.type].kind === 'generator')!;
    gen.inBuf = { coal: 4 };
    solvePower(g);
    expect(g.layer(1).power.genUsed).toBe(60);
    expect(g.s.shafts[0].flow).toBe(0);
    // Mk2 cables (150 kW) carry the whole load: 80 kW from the Shallows, the rest from the Surface.
    g.s.shafts[0].tier = 1;
    g.s.shafts[1].tier = 1;
    solvePower(g);
    expect(g.layer(2).power.sat).toBe(1);
    expect(g.layer(1).power.genUsed).toBe(80);
    expect(g.s.shafts[0].flow).toBe(16);
  });

  it('a generator burns only what the grid needs', () => {
    const g = sandbox(RICH);
    g.s.lineLevel = 0;
    // 60 kW from the Company Line covers this press; the generator stays cold.
    const gen = put(g, 'generator', 20, 30, 1);
    gen.inBuf.coal = 4;
    run(g, 5);
    expect(gen.inBuf.coal).toBe(4);
    // Drop the line out of the picture: a press now needs the generator.
    const L = g.layer(0);
    L.stock.copper_ingot = 0;
    const press = put(g, 'press', 6, 30, 1, { recipe: 'copper_wire' });
    press.inBuf.copper_ingot = 2;
    // Ten presses' worth of demand: more than the line alone.
    for (let k = 0; k < 8; k++) {
      const p = put(g, 'press', 6 + (k % 4) * 3, 33 + Math.floor(k / 4) * 3, 1, { recipe: 'copper_wire' });
      p.inBuf.copper_ingot = 2;
    }
    run(g, 2);
    expect(gen.inBuf.coal).toBeLessThan(4);
  });

  it("the crew's coal rig waits on its full generator as Idle, not Output blocked; a generator that refuses the ore blocks", () => {
    // Every new layer with coal opens on a coal Miner pushing straight into a Combustion Generator, on
    // a layer that draws next to no power: the generator fills, then burns only what the layer needs.
    for (const layer of [1, 2, 4, 5]) {
      const g = Game.create(20261030);
      while (g.s.deepest < layer && g.s.project) {
        const p = g.s.project;
        for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
        completeProject(g);
      }
      const miner = [...g.s.buildings.values()].find((b) => b.layer === layer && b.type === 'miner' && b.ore === 'coal');
      const gen = [...g.s.buildings.values()].find((b) => b.layer === layer && b.type === 'generator');
      if (!miner || !gen) throw new Error(`no coal rig on layer ${layer}`);
      run(g, 15);
      const seen = new Set<string>();
      for (let t = 0; t < 60 * 30; t++) {
        g.tick();
        seen.add(miner.status);
      }
      expect([...seen].sort(), `layer ${layer}`).not.toContain('blocked');
      expect(seen.has('idle'), `layer ${layer}`).toBe(true);
      expect(gen.inBuf.coal).toBe(GEN_FUEL_CAP);
      expect(fullGenerator(g, miner)).toBe(gen);
    }
    // Iron is no fuel: a generator that refuses the ore is a real block.
    const g = sandbox();
    const m = g.forcePlace('miner', 0, 10, 30, 1);
    m.ore = 'iron_ore';
    m.rate = 0.5;
    g.forcePlace('generator', 0, 12, 31, 1);
    run(g, 12);
    expect(m.outBuf.length).toBe(4);
    expect(m.status).toBe('blocked');
    expect(waitsOnGenerator(g, m)).toBe(false);
    expect(fullGenerator(g, m)).toBeNull();
  });
});

// ------------------------------------------------------------------ data: can the game be finished?

/** Everything a player can make by the time `layer` is open, given the unlocks reachable by then. */
function reachable(layer: number): Set<string> {
  const have = new Set<string>();
  // Deposits and the crews' starter crates on every open layer (the elevator carries between them).
  for (let l = 0; l <= layer; l++) {
    for (const d of LAYERS[l].deposits) have.add(d.ore);
    for (const k of Object.keys(LAYERS[l].starterCrate)) have.add(k);
  }
  if (layer >= 2) have.add('spore_dust');
  const assays = new Set<string>();
  const unlocked = (key: string): boolean => {
    const [kind, arg] = key.split(':');
    if (kind === 'start' || kind === 'milestone') return true;
    if (kind === 'layer') return Number(arg) <= layer;
    if (kind === 'assay') return assays.has(arg);
    if (kind === 'made') return have.has(arg);
    if (kind === 'license') return (LICENSES[arg]?.minLayer ?? 0) <= layer;
    return false;
  };
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of Object.values(ASSAYS)) {
      if (!assays.has(a.id) && have.has(a.id)) {
        assays.add(a.id);
        grew = true;
      }
    }
    for (const r of RECIPE_LIST) {
      const machine = BUILDINGS[r.machine];
      if (!unlocked(machine.unlock) || (r.unlock && !unlocked(r.unlock))) continue;
      if (!Object.keys(r.inputs).every((k) => have.has(k))) continue;
      if (!Object.values(machine.cost).length || !Object.keys(machine.cost).every((k) => have.has(k))) continue;
      for (const k of [...Object.keys(r.outputs), ...Object.keys(r.side ?? {})]) {
        if (!have.has(k)) {
          have.add(k);
          grew = true;
        }
      }
    }
    if (layer >= 5 && have.has('engine_glass') && have.has('resonant_core') && !have.has('heartstone')) {
      have.add('heartstone');
      grew = true;
    }
    if (have.has('hot_ember_ingot') && !have.has('cold_ember_ingot')) {
      have.add('cold_ember_ingot');
      grew = true;
    }
  }
  return have;
}

describe('data', () => {
  it('every drill project can be made from what is reachable on its layer', () => {
    for (const p of Object.values(PROJECTS)) {
      const have = reachable(p.layer);
      for (const k of Object.keys(p.needs)) expect(have.has(k), `${p.id} needs ${k}`).toBe(true);
    }
  });

  it('every building can be paid for on the layer it unlocks', () => {
    // The layer by which each assay can be done.
    const assayLayer = (id: string) => [0, 1, 2, 3, 4, 5].find((l) => reachable(l).has(id)) ?? 99;
    for (const b of BUILDING_LIST) {
      if (b.fixed) continue;
      const [kind, arg] = b.unlock.split(':');
      const layer = kind === 'layer' ? Number(arg) : kind === 'assay' || kind === 'made' ? assayLayer(arg) : kind === 'license' ? (LICENSES[arg]?.minLayer ?? 0) : 0;
      const have = reachable(layer);
      for (const k of Object.keys(b.cost)) expect(have.has(k), `${b.id} costs ${k} (layer ${layer})`).toBe(true);
    }
  });

  it("each knowledge card's Unlocks line names what its assay or first production really unlocks", () => {
    // The Field Manual shows a.unlocks by name (an item's name first, as the manual does).
    const shown = (id: string) => ITEMS[id]?.name ?? BUILDINGS[id]?.name ?? RECIPES[id]?.name ?? `?${id}`;
    for (const a of Object.values(ASSAYS)) {
      const keys = new Set([`assay:${a.id}`, `made:${a.id}`]);
      const real = new Set([...BUILDING_LIST.filter((b) => keys.has(b.unlock)).map((b) => b.name), ...RECIPE_LIST.filter((r) => r.unlock && keys.has(r.unlock)).map((r) => r.name)]);
      expect([...new Set(a.unlocks.map(shown))].sort(), a.id).toEqual([...real].sort());
    }
    // The Sequencer comes with the Thrumstone assay, in time to feed the Waking Node (DECISIONS #57).
    expect(ASSAYS.thrumstone.unlocks).toEqual(['attuner', 'sequencer']);
    expect(ASSAYS.engine_glass.unlocks).toEqual([]);
  });

  it('every item has a source and every milestone step names real things', () => {
    const have = reachable(5);
    for (const id of Object.keys(ITEMS)) expect(have.has(id), `no way to make ${id}`).toBe(true);
    for (const m of MILESTONES) {
      for (const st of m.steps) {
        if ('item' in st) expect(ITEMS[st.item], `${m.n}: ${st.item}`).toBeTruthy();
        if ('building' in st) expect(BUILDINGS[st.building], `${m.n}: ${st.building}`).toBeTruthy();
        if ('assay' in st) expect(ASSAYS[st.assay], `${m.n}: ${st.assay}`).toBeTruthy();
        if ('project' in st) expect(PROJECTS[st.project], `${m.n}: ${st.project}`).toBeTruthy();
      }
    }
  });

  it('each layer milestone asks only for what that layer can reach', () => {
    for (const m of MILESTONES) {
      const have = reachable(m.act - 1);
      for (const st of m.steps) {
        if (st.kind === 'produce' || st.kind === 'sell' || st.kind === 'deliver') expect(have.has(st.item), `milestone ${m.n} wants ${st.item}`).toBe(true);
      }
    }
  });
});
