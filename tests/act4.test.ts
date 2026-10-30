// Act IV pacing: a scripted player on the Crystal Depths from the breakthrough to D4 (Bore to the
// Magma Shelf) on the real map (seed 20261030), from the act's start state (tests/play/start.ts,
// startAct(4)). Prints the timeline, power, elevators, what stands on the layer, when each D4 good was
// in, Mags, the log and the final layer. The script is tests/play/act4.ts (playAct4), so a run chained
// from Act III can play it too (playAct4({ from: bot })).

import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../src/data/progression';
import { MAP_LEGEND, type Bot, mmss } from './bot';
import { act4Report, L3, playAct4 } from './play/act4';
import { actClock, actSummary, bandVerdict } from './play/report';
import { ACT_BANDS } from './play/start';

const ACT4 = MILESTONES.filter((m) => m.act === 4).map((m) => m.n);
const BAND = ACT_BANDS[4];
/** A generous cap: half again the band's ceiling. */
const CAP = 90 * 60;

/** How long each milestone took after the one before (the first from the act's start). */
function took(bot: Bot): string {
  let prev = bot.t0;
  return ACT4.map((n) => {
    const t = bot.msTimes[n];
    if (t === undefined) return `M${n} --`;
    const d = mmss(t - prev);
    prev = t;
    return `M${n} ${d}`;
  }).join('  ');
}

/** The short version of actDetails: money, the Crystal Depths' depot, the log, Mags, its snapshots and map. */
function details(bot: Bot): string[] {
  const g = bot.g;
  const out: string[] = [];
  out.push(`Money by minute: ${bot.money.filter((m) => m.t >= bot.t0).map((m) => `${actClock(bot, m.t)} $${m.money}`).join(', ')}`);
  out.push(`L3 depot at the end: ${JSON.stringify(g.layer(L3).stock)} requests ${JSON.stringify(g.layer(L3).requests)}`);
  out.push('Log:');
  for (const l of bot.log) out.push(`  ${l}`);
  out.push('What the game said:');
  for (const m of bot.messages) if (m.t >= bot.t0) out.push(`  ${actClock(bot, m.t)} ${m.who}: ${m.text}`);
  out.push('Each minute (the Crystal Depths and the shafts):');
  for (const l of bot.snapshots) if (/ L3 | shafts /.test(l)) out.push(`  ${l}`);
  out.push(`The Crystal Depths, x 0..60, y 2..24 (${MAP_LEGEND}):`);
  out.push(bot.map(0, 2, 60, 24, L3));
  return out;
}

describe('Act IV pacing bot', () => {
  it('finishes M18-M22 and D4 inside the cap, with no deadlock, rush or jam', () => {
    const t0 = performance.now();
    const bot = playAct4({ maxSeconds: CAP });
    const ms = performance.now() - t0;
    const d4 = bot.projectTimes.d4;
    const act = d4 !== undefined && d4 >= 0 ? d4 - bot.t0 : undefined;
    const under = act !== undefined && act < BAND.from ? ` (${mmss(BAND.from - act)} under the floor)` : '';
    console.log(
      [
        ...actSummary(bot, 'Act IV pacing bot: the Crystal Depths from the breakthrough to D4', { realMs: ms }),
        `Each milestone took: ${took(bot)}`,
        ...act4Report(bot),
        `Act time ${act !== undefined ? mmss(act) : 'NOT DONE'} against the PLAN §8 band ${mmss(BAND.from)}-${mmss(BAND.to)}: ${bandVerdict(act, BAND)}${under}`,
        ...details(bot),
      ].join('\n'),
    );

    expect(act, 'D4 should complete').toBeDefined();
    for (const n of ACT4) expect(bot.msTimes[n], `milestone ${n}`).toBeGreaterThanOrEqual(bot.t0);
    expect(act!).toBeLessThanOrEqual(CAP);
    // The bot plays with no reading or placing time, so it lands under the band's floor (the summary
    // says by how much, as Act I's and Act II's bots do); the ceiling, with a little slack, must hold.
    expect(act!).toBeLessThanOrEqual(BAND.to + 3 * 60);
    // No deadlock may last over three minutes (one is only recorded after three).
    expect(bot.deadlocks).toEqual([]);
    expect(bot.rushes).toEqual([]);
    expect(bot.jams).toEqual([]);
  }, 60_000);
});
