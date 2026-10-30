// Act III pacing: a scripted player on the Fungal Caverns from the breakthrough to D3, on the real
// map (seed 20261030) from the act's start state (tests/play/start.ts, startAct(3)). Prints the
// timeline, what bound D3, spores, resin, power, the elevator and the final layer. The script is
// tests/play/act3.ts (playAct3), so a run chained from Act II can play it too.

import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../src/data/progression';
import { MAP_LEGEND, type Bot, mmss } from './bot';
import { ACT3_BAND, ACT3_CAP, L2, act3Report, playAct3 } from './play/act3';
import { actClock, actSummary, bandVerdict } from './play/report';

const ACT3 = MILESTONES.filter((m) => m.act === 3).map((m) => m.n);

/** The time each milestone took after the one before it. */
function took(bot: Bot): string {
  let prev = bot.t0;
  return ACT3.map((n) => {
    const t = bot.msTimes[n];
    if (t === undefined) return `M${n} --`;
    const d = mmss(t - prev);
    prev = t;
    return `M${n} ${d}`;
  }).join('  ');
}

/** The short version of actDetails: money, the Fungal Caverns' depot, the log, Mags, its snapshots and map. */
function details(bot: Bot): string[] {
  const g = bot.g;
  const out: string[] = [];
  out.push(`Money by minute: ${bot.money.filter((m) => m.t >= bot.t0).map((m) => `${actClock(bot, m.t)} $${m.money}`).join(', ')}`);
  out.push(`L2 depot at the end: ${JSON.stringify(g.layer(L2).stock)} requests ${JSON.stringify(g.layer(L2).requests)}`);
  out.push('Log:');
  for (const l of bot.log) out.push(`  ${l}`);
  out.push('What the game said:');
  for (const m of bot.messages) if (m.t >= bot.t0) out.push(`  ${actClock(bot, m.t)} ${m.who}: ${m.text}`);
  out.push('Each minute (the Fungal Caverns and the shafts):');
  for (const l of bot.snapshots) if (/ L2 | shafts /.test(l)) out.push(`  ${l}`);
  out.push(`The Fungal Caverns, x 4..71, y 6..50 (${MAP_LEGEND}):`);
  out.push(bot.map(4, 6, 71, 50, L2));
  return out;
}

describe('Act III pacing bot', () => {
  it('a competent player finishes M13-M18 and D3, opening the Crystal Depths, with no deadlock, rush or jam', () => {
    const t0 = performance.now();
    const bot = playAct3({}, ACT3_CAP);
    const ms = performance.now() - t0;
    const done = bot.projectTimes.d3;
    const act = done !== undefined && done >= 0 ? done - bot.t0 : undefined;
    console.log(
      [
        ...actSummary(bot, 'Act III pacing bot: competent player on the Fungal Caverns', { realMs: ms }),
        `Each milestone took: ${took(bot)}`,
        ...act3Report(bot),
        `Act time ${act !== undefined ? mmss(act) : 'NOT DONE'} against the PLAN §8 band ${mmss(ACT3_BAND.from)}-${mmss(ACT3_BAND.to)}: ${bandVerdict(act, ACT3_BAND)}`,
        ...details(bot),
      ].join('\n'),
    );

    expect(act, 'D3 should complete').toBeDefined();
    for (const n of ACT3) expect(bot.msTimes[n], `milestone ${n}`).toBeGreaterThanOrEqual(bot.t0);
    expect(bot.g.layer(3).open, 'D3 opens the Crystal Depths').toBe(true);
    expect(act!).toBeLessThanOrEqual(ACT3_CAP);
    // The bot plays with no reading or placing time, so it lands under the band's floor (the summary
    // says how far); the ceiling, with a little slack, is the bound that must hold.
    expect(act!, `Act III band ${mmss(ACT3_BAND.from)}-${mmss(ACT3_BAND.to)}: ${bandVerdict(act, ACT3_BAND)}`).toBeLessThanOrEqual(ACT3_BAND.to + 5 * 60);
    // No deadlock may last over three minutes (one is only recorded after three).
    for (const d of bot.deadlocks) expect(d.to >= 0 ? d.to - d.from : Infinity, `deadlock on L${d.layer} from ${mmss(d.from)}`).toBeLessThanOrEqual(180 + 1);
    expect(bot.rushes).toEqual([]);
    expect(bot.jams).toEqual([]);
  }, 60_000);
});
