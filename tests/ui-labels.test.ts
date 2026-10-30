// Objective step labels must fit the HUD's objectives panel (review 2, C13). This one measures every
// milestone step's label, generated or hand-written, with the UI font against the room hud.ts itself
// gives it (stepLabelRoom), with the step's count at its widest.

import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../src/data/progression';
import { Game } from '../src/sim/game';
import { stepProgress } from '../src/sim/progress';
import { measureText } from '../src/ui/font';
import { OBJECTIVES_W, stepLabelRoom } from '../src/ui/hud';
import { fitItemName, keyChipWidth, keyHintWidth, keysWidth, rateText, rateWidth } from '../src/ui/ui';

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

  it('the room is the panel less the check box (x + 5, 7 px, then 3 px) and the right margin, and less the count with its gap', () => {
    expect(stepLabelRoom('')).toBe(OBJECTIVES_W - 15 - 5);
    expect(stepLabelRoom('3/10')).toBe(OBJECTIVES_W - 15 - 5 - measureText('3/10') - 5);
  });
});

// The UI kit's text helpers (src/ui/ui.ts): every rate carries its unit, and a shortcut reads the
// same on every surface.
describe('UI kit text', () => {
  it('a rate carries its unit, and what it is out of after it', () => {
    expect(rateText(30)).toBe('30/min');
    expect(rateText(7.5)).toBe('7.5/min');
    expect(rateText(42, { money: true, sign: true })).toBe('+$42/min');
    expect(rateText(26, { of: 30 })).toBe('26/min of 30');
    expect(rateText(0, { of: 45 })).toBe('0/min of 45');
    expect(rateWidth(26, { of: 30 })).toBe(measureText('26/min of 30'));
  });

  it('a key combination is its keys joined by "+", a single key one cap', () => {
    expect(keysWidth('R')).toBe(keyChipWidth('R'));
    expect(keysWidth('Ctrl+Z')).toBe(keyChipWidth('Ctrl') + 1 + measureText('+') + 3 + keyChipWidth('Z'));
    expect(keysWidth('+')).toBe(keyChipWidth('+'));
    expect(keyHintWidth('Ctrl+Z', 'undo')).toBe(keysWidth('Ctrl+Z') + 3 + measureText('undo'));
  });

  it('an item name too long for its room falls back to its short name before it is cut', () => {
    expect(fitItemName('aggregate', 400)).toBe('Heat-Resistant Aggregate');
    expect(fitItemName('aggregate', measureText('Aggregate'))).toBe('Aggregate');
    expect(fitItemName('aggregate', 20).endsWith('…')).toBe(true);
  });
});
