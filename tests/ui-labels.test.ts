// Objective step labels must fit the HUD's objectives panel (review 2, C13). This one measures every
// milestone step's label, generated or hand-written, with the UI font against the room hud.ts itself
// gives it (stepLabelRoom), with the step's count at its widest.

import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../src/data/progression';
import { Game } from '../src/sim/game';
import { stepProgress } from '../src/sim/progress';
import { measureText } from '../src/ui/font';
import { OBJECTIVES_W, stepLabelRoom } from '../src/ui/hud';

/** The widest count a step can show beside its label: cur/max for any cur up to max (only when max > 1). */
function widestCount(max: number): string {
  let widest = '';
  if (max > 1) for (let c = 0; c <= max; c++) if (measureText(`${c}/${max}`) > measureText(widest)) widest = `${c}/${max}`;
  return widest;
}

describe('HUD objective labels', () => {
  const g = Game.create(1);
  const steps = MILESTONES.flatMap((m) => m.steps.map((st, i) => ({ n: m.n, i, st })));

  it.each(steps)('milestone $n step $i fits the room the HUD gives it', ({ st }) => {
    const sp = stepProgress(g, st);
    const room = stepLabelRoom(widestCount(sp.max));
    expect(measureText(sp.label), `"${sp.label}" in ${room} px`).toBeLessThanOrEqual(room);
  });

  it('the room is the panel less the checkbox and margins, and less the count with its gap', () => {
    expect(stepLabelRoom('')).toBe(OBJECTIVES_W - 14 - 5);
    expect(stepLabelRoom('3/10')).toBe(OBJECTIVES_W - 14 - 5 - measureText('3/10') - 5);
  });
});
