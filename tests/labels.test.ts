// Objective step labels (review 2, C13): what the sim calls each milestone step. Whether every label
// fits the HUD's objectives panel is tests/ui-labels.test.ts, measured against the room hud.ts gives
// it (stepLabelRoom).

import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../src/data/progression';
import { Game } from '../src/sim/game';
import { stepLabel, stepProgress } from '../src/sim/progress';

describe('objective step labels', () => {
  it("every step's progress carries its stepLabel", () => {
    const g = Game.create(1);
    for (const m of MILESTONES) {
      m.steps.forEach((st, i) => expect(stepProgress(g, st).label, `milestone ${m.n} step ${i}`).toBe(stepLabel(st)));
    }
  });

  it('generated labels leave the count out (it shows beside them) and use short item names', () => {
    expect(stepLabel({ kind: 'produce', item: 'aggregate', count: 20 })).toBe('Make Aggregate');
    expect(stepLabel({ kind: 'sell', item: 'copper_ingot', count: 10 })).toBe('Ship Copper Ingot');
    expect(stepLabel({ kind: 'build', building: 'assembler', count: 1 })).toBe('Build an Assembler');
    expect(stepLabel({ kind: 'project', project: 'd2' })).toBe('Feed the Drill');
    expect(stepLabel({ kind: 'project', project: 'governor' })).toBe('Feed the Heart');
    expect(stepLabel({ kind: 'visit', layer: 1 })).toBe('Go down to the Shallows');
    expect(stepLabel({ kind: 'produce', item: 'heartstone', count: 5, label: 'Wake the Waking Node' })).toBe('Wake the Waking Node');
  });
});
