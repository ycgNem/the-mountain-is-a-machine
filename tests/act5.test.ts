// Act V pacing: a scripted player on the Magma Shelf from the breakthrough to D5 (Bore to the Alien
// Strata), on the real map (seed 20261030) from the act's start state (tests/play/start.ts,
// startAct(5)). Prints the timeline, the factory's work, what filled D5 last, and the final layer.
// The script is tests/play/act5.ts (playAct5), so a run chained from Act IV can play it too.

import { describe, expect, it } from 'vitest';
import { MAP_LEGEND, type Bot, mmss } from './bot';
import { act5Report, playAct5 } from './play/act5';
import { actClock, actSummary, bandVerdict } from './play/report';
import { ACT_BANDS } from './play/start';

const BAND = ACT_BANDS[5];
/** A generous cap: half again the band's ceiling. */
const CAP = 90 * 60;

/** The short version of actDetails: money, the Magma Shelf's depot, the log, Mags, its snapshots and map. */
function details(bot: Bot): string[] {
  const g = bot.g;
  const out: string[] = [];
  out.push(`Money by minute: ${bot.money.filter((m) => m.t >= bot.t0).map((m) => `${actClock(bot, m.t)} $${m.money}`).join(', ')}`);
  out.push(`L4 depot at the end: ${JSON.stringify(g.layer(4).stock)} requests ${JSON.stringify(g.layer(4).requests)}`);
  out.push('Log:');
  for (const l of bot.log) out.push(`  ${l}`);
  out.push('What the game said:');
  for (const m of bot.messages) if (m.t >= bot.t0) out.push(`  ${actClock(bot, m.t)} ${m.who}: ${m.text}`);
  out.push('Each minute (the Magma Shelf and the shafts):');
  for (const l of bot.snapshots) if (/ L4 | shafts /.test(l)) out.push(`  ${l}`);
  out.push(`The Magma Shelf, x 8..68, y 4..47 (${MAP_LEGEND}):`);
  out.push(bot.map(8, 4, 68, 47, 4));
  return out;
}

describe('Act V pacing bot', () => {
  it('finishes every Act V milestone and D5 with molten ingots delivered hot, with no deadlock, rush or jam', () => {
    const t0 = performance.now();
    const bot = playAct5({ maxSeconds: CAP });
    const ms = performance.now() - t0;
    const end = bot.projectTimes.d5;
    const act = end !== undefined && end >= 0 ? end - bot.t0 : undefined;
    console.log(
      [
        ...actSummary(bot, 'Act V pacing bot: the Magma Shelf', { realMs: ms }),
        ...act5Report(bot),
        `Act time ${act !== undefined ? mmss(act) : 'NOT DONE'} against the PLAN §8 band ${mmss(BAND.from)}-${mmss(BAND.to)}: ${bandVerdict(act, BAND)}`,
        ...details(bot),
      ].join('\n'),
    );

    expect(act, 'D5 should complete').toBeDefined();
    for (const n of [24, 25, 26, 27]) expect(bot.msTimes[n], `milestone ${n}`).toBeGreaterThanOrEqual(bot.t0);
    expect(act!).toBeLessThanOrEqual(CAP);
    // The bot plays with no reading or placing time, so it lands under the band's floor (the summary
    // says how far); the ceiling, with a little slack, is the bound that must hold.
    expect(act!).toBeLessThanOrEqual(BAND.to + 5 * 60);
    // No deadlock may last over three minutes (one is only recorded after three).
    for (const d of bot.deadlocks) expect(d.to >= 0 ? d.to - d.from : Infinity, `deadlock on L${d.layer} from ${mmss(d.from)}`).toBeLessThanOrEqual(180 + 1);
    expect(bot.rushes).toEqual([]);
    expect(bot.jams).toEqual([]);
  });
});
