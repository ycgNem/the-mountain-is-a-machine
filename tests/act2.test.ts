// Act II pacing: a scripted player takes the real end of Act I (tests/play/act1.ts, about 12:40 of
// game time) down into the Shallows and plays to D2 on the real map. Prints the act's timeline,
// money, power, elevators and the final factory. The script itself is tests/play/act2.ts (playAct2),
// so Act III can start from its real end.

import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../src/data/progression';
import { type Bot, mmss } from './bot';
import { ACT2_BAND, machineCount, playAct2 } from './play/act2';
import { actDetails, actSummary, bandVerdict } from './play/report';

const ACT2 = MILESTONES.filter((m) => m.act === 2).map((m) => m.n);
/** A generous cap: half again the band's ceiling. */
const CAP = 45 * 60;

function play(): { bot: Bot; ms: number } {
  const t0 = performance.now();
  const bot = playAct2({ maxSeconds: CAP });
  return { bot, ms: performance.now() - t0 };
}

/** The headline plus what this act adds: the time each milestone took, machine counts, elevator traffic. */
function summary(bot: Bot, ms: number): string[] {
  const out = actSummary(bot, 'Act II pacing bot: competent player from the real end of Act I', { realMs: ms });
  let prev = bot.t0;
  const took = ACT2.map((n) => {
    const t = bot.msTimes[n];
    if (t === undefined) return `M${n} --`;
    const d = mmss(t - prev);
    prev = t;
    return `M${n} ${d}`;
  });
  out.push(`Each milestone took: ${took.join('  ')}`);
  out.push(`Machines standing at the end: Surface ${machineCount(bot, 0)}, Shallows ${machineCount(bot, 1)} (miners, machines, generators)`);
  return out;
}

/** actDetails without Act I: its log lines and snapshots carry absolute times before the act's start. */
function details(bot: Bot): string[] {
  const lines = actDetails(bot, [
    { layer: 1, x0: 20, y0: 3, x1: 66, y1: 46 },
    { layer: 0, x0: 24, y0: 8, x1: 50, y1: 26 },
  ]);
  let timed = false;
  return lines.filter((l) => {
    if (l === 'Log:' || l === 'Each minute:') timed = true;
    else if (/^What the game said|^Layer \d/.test(l)) timed = false;
    const m = timed ? /^ {2}(\d+):(\d\d)/.exec(l) : null;
    return !m || Number(m[1]) * 60 + Number(m[2]) >= Math.floor(bot.t0);
  });
}

describe('Act II pacing bot', () => {
  // The bot plays with no reading or placing time, so it lands under the band's floor (Act I's bot
  // does too, DECISIONS #54); the ceiling is the bound that must hold, with a minute of slack. The
  // summary line says how far under the floor it is.
  it('a competent player finishes Act II (M8-M12, D2) inside the cap, with no deadlock', () => {
    const { bot, ms } = play();
    console.log([...summary(bot, ms), ...details(bot)].join('\n'));

    const d2 = bot.projectTimes.d2;
    expect(d2, 'D2 should complete').toBeDefined();
    const act = d2 - bot.t0;
    for (const n of ACT2) expect(bot.msTimes[n], `milestone ${n}`).toBeDefined();
    expect(act).toBeLessThanOrEqual(CAP);
    expect(act, `Act II band ${mmss(ACT2_BAND.from)}-${mmss(ACT2_BAND.to)}: ${bandVerdict(act, ACT2_BAND)}`).toBeLessThanOrEqual(ACT2_BAND.to + 60);
    // A deadlock is three minutes with ghosts waiting and none built: none may happen.
    expect(bot.deadlocks).toEqual([]);
  });
});
