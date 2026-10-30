// Act VI pacing: a scripted player on the Alien Strata from the breakthrough to the ending, on the
// real map (seed 20261030) from the act's start state (tests/play/start.ts, startAct(6)). Prints the
// timeline, the Engine, what bound the act and the final layer. The script is tests/play/act6.ts
// (playAct6), so a run chained from Act V can play it too.

import { describe, expect, it } from 'vitest';
import { MAP_LEGEND, type Bot, mmss } from './bot';
import { ACT6_BAND, ACT6_CAP, act6Report, playAct6 } from './play/act6';
import { actClock, actSummary, bandVerdict } from './play/report';

/** The short version of actDetails: money, the Alien Strata's depot, the log, Mags, its snapshots and map. */
function details(bot: Bot): string[] {
  const g = bot.g;
  const out: string[] = [];
  out.push(`Money by minute: ${bot.money.filter((m) => m.t >= bot.t0).map((m) => `${actClock(bot, m.t)} $${m.money}`).join(', ')}`);
  out.push(`L5 depot at the end: ${JSON.stringify(g.layer(5).stock)} requests ${JSON.stringify(g.layer(5).requests)}`);
  out.push('Log:');
  for (const l of bot.log) out.push(`  ${l}`);
  out.push('What the game said:');
  for (const m of bot.messages) if (m.t >= bot.t0) out.push(`  ${actClock(bot, m.t)} ${m.who}: ${m.text}`);
  out.push('Each minute (the Alien Strata and the shafts):');
  for (const l of bot.snapshots) if (/ L5 | shafts /.test(l)) out.push(`  ${l}`);
  out.push(`The Alien Strata, x 5..66, y 12..48 (${MAP_LEGEND}):`);
  out.push(bot.map(5, 12, 66, 48, 5));
  return out;
}

describe('Act VI pacing bot', () => {
  it('wakes the Engine, finishes every Act VI milestone and reaches the ending, with no deadlock, rush or jam', () => {
    const t0 = performance.now();
    const bot = playAct6();
    const ms = performance.now() - t0;
    const end = bot.projectTimes.governor;
    const actEnd = end !== undefined && end >= 0 ? end - bot.t0 : undefined;
    console.log(
      [
        ...actSummary(bot, 'Act VI pacing bot: the Alien Strata and the ending', { realMs: ms }),
        ...act6Report(bot),
        `Act time ${actEnd !== undefined ? mmss(actEnd) : 'NOT DONE'} against the PLAN §8 band ${mmss(ACT6_BAND.from)}-${mmss(ACT6_BAND.to)}: ${bandVerdict(actEnd, ACT6_BAND)}`,
        ...details(bot),
      ].join('\n'),
    );

    expect(bot.g.s.ended, 'the Governor should be delivered and the ending reached').toBe(true);
    expect(actEnd, 'the Governor should complete').toBeDefined();
    // M32 (The Governor) lands with the ending, before the game stops looking at milestones.
    for (const n of [28, 29, 30, 31, 32]) expect(bot.msTimes[n], `milestone ${n}`).toBeGreaterThanOrEqual(bot.t0);
    expect(actEnd!).toBeLessThanOrEqual(ACT6_CAP);
    // The bot plays with no reading or placing time, so it may land under the band's floor (the
    // summary says so); the ceiling, with a little slack, is the bound that must hold.
    expect(actEnd!).toBeLessThanOrEqual(ACT6_BAND.to + 5 * 60);
    // No deadlock may last over three minutes (one is only recorded after three).
    for (const d of bot.deadlocks) expect(d.to >= 0 ? d.to - d.from : Infinity, `deadlock on L${d.layer} from ${mmss(d.from)}`).toBeLessThanOrEqual(180 + 1);
    expect(bot.rushes).toEqual([]);
    expect(bot.jams).toEqual([]);
  });
});
