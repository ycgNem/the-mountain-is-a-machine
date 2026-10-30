// Money: contracts at the Company Chute (review 2, C12) and what the $/min readout counts (C13).

import { describe, expect, it } from 'vitest';
import { layStarterLine } from '../src/app/scenarios';
import { ITEMS } from '../src/data/items';
import { MILESTONES } from '../src/data/progression';
import { Game } from '../src/sim/game';
import { insert } from '../src/sim/logistics';
import { checkMilestones, contractPay } from '../src/sim/progress';
import { deserialize, serialize } from '../src/sim/save';
import type { Building } from '../src/sim/types';
import { run, sandbox } from './helpers';

function terminal(g: Game): Building {
  return [...g.s.buildings.values()].find((b) => b.type === 'terminal')!;
}

describe('C12: contracts at the Company Chute', () => {
  it('chute deliveries count toward the contract and pay 60% of their share, with no per-item sale', () => {
    const g = sandbox();
    const chute = g.forcePlace('chute', 0, 6, 30, 1);
    const term = terminal(g);
    g.s.contracts.active = { item: 'gear', count: 5, pay: 100, delivered: 0, chute: 0 };
    const money = g.s.money;
    g.events.length = 0;
    for (let i = 0; i < 2; i++) expect(insert(g, chute, { id: 'gear', heat: 0 }, 1)).toBe(true);
    // Contract goods don't also sell at 60% on the spot.
    expect(g.s.money).toBe(money);
    expect(g.s.contracts.active).toMatchObject({ delivered: 2, chute: 2 });
    // The last ones at the Terminal: the pay is proportional, so the last item's door doesn't decide it.
    for (let i = 0; i < 3; i++) expect(insert(g, term, { id: 'gear', heat: 0 }, 2)).toBe(true);
    const pay = Math.round((100 * (3 + 0.6 * 2)) / 5);
    expect(pay).toBe(84);
    expect(g.s.money).toBeCloseTo(money + pay, 5);
    expect(g.s.contracts.active).toBeNull();
    expect(g.s.contracts.done).toBe(1);
    expect(g.events).toContainEqual({ t: 'contract', pay });
    expect(g.events).toContainEqual({ t: 'toast', text: `Contract complete: +$${pay}`, kind: 'good' });
    // With the contract done, the chute sells at 60% again.
    insert(g, chute, { id: 'gear', heat: 0 }, 1);
    expect(g.s.money).toBeCloseTo(money + pay + Math.round(ITEMS.gear.value * 0.6 * 10) / 10, 5);
  });

  it('pays in full for Terminal deliveries and 60% for an all-Chute delivery', () => {
    expect(contractPay({ item: 'gear', count: 40, pay: 250, delivered: 40, chute: 0 })).toBe(250);
    expect(contractPay({ item: 'gear', count: 40, pay: 250, delivered: 40, chute: 40 })).toBe(150);
    expect(contractPay({ item: 'gear', count: 40, pay: 250, delivered: 40, chute: 10 })).toBe(Math.round((250 * (30 + 6)) / 40));
  });

  it('new offers start with no chute deliveries, and old saves load with none', () => {
    const g = Game.create(1);
    expect(g.s.contracts.offers.every((o) => o.chute === 0)).toBe(true);
    g.s.contracts.active = { item: 'gear', count: 5, pay: 100, delivered: 2, chute: 0 };
    const old = JSON.parse(serialize(g));
    delete old.contracts.active.chute;
    for (const o of old.contracts.offers) delete o.chute;
    old.version = 2;
    const h = deserialize(JSON.stringify(old));
    expect(h.s.contracts.active?.chute).toBe(0);
    expect(h.s.contracts.offers.every((o) => o.chute === 0)).toBe(true);
  });
});

describe('C13: the $/min readout', () => {
  it('counts sales and contract pay, not milestone rewards', () => {
    const g = Game.create(1);
    layStarterLine(g);
    run(g, 3);
    expect(g.s.stats.events.first_sale).toBe(1);
    const income = g.incomePerMin();
    const money = g.s.money;
    // First Light's last steps, as if its ingots were made and shipped this instant.
    g.s.stats.produced.iron_ingot = (g.s.stats.produced.iron_ingot ?? 0) + 1;
    g.s.stats.sold.iron_ingot = (g.s.stats.sold.iron_ingot ?? 0) + 5;
    checkMilestones(g);
    expect(g.s.msDone).toContain(1);
    expect(g.s.money).toBe(money + (MILESTONES[0].reward.money ?? 0));
    expect(g.incomePerMin()).toBe(income);
    // Contract pay counts.
    g.s.contracts.active = { item: 'iron_ingot', count: 1, pay: 50, delivered: 0, chute: 0 };
    insert(g, terminal(g), { id: 'iron_ingot', heat: 0 }, 2);
    expect(g.incomePerMin()).toBe(income + 50);
    // earn() without income: money only.
    g.earn(10, false);
    expect(g.incomePerMin()).toBe(income + 50);
    expect(g.s.stats.earned).toBeGreaterThan(0);
  });
});
