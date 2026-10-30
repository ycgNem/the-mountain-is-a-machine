// Act I pacing: a scripted player builds the Surface from the first sale to D1 on the real map.
// Prints a timeline, money, power and the final factory. The script itself is tests/play/act1.ts
// (playActI), so Act II can start from its real end (tests/play/start.ts, startFromActI).

import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../src/data/progression';
import type { Game } from '../src/sim/game';
import { type Bot, mmss } from './bot';
import { ACT1_BAND, CARELESS, EFFICIENT, STARTER_ONLY, playActI, type Style } from './play/act1';

function play(style: Style): { bot: Bot; g: Game; ms: number } {
  const t0 = performance.now();
  const bot = playActI(style);
  return { bot, g: bot.g, ms: performance.now() - t0 };
}

function summary(title: string, bot: Bot, g: Game, ms: number): string[] {
  const out: string[] = [];
  const d1 = bot.projectTimes.d1;
  out.push(`=== ${title} (seed 20261030), ${(ms / 1000).toFixed(1)} s real time for ${mmss(g.s.time)} game time ===`);
  out.push(`Milestones: ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `M${n} ${bot.msTimes[n] !== undefined ? mmss(bot.msTimes[n]) : '--:--'}`).join('  ')}`);
  out.push(
    `D1 complete: ${d1 !== undefined ? mmss(d1) : 'NOT DONE'} (PLAN §8 Act I band ${mmss(ACT1_BAND.from)}-${mmss(ACT1_BAND.to)}: ` +
      `${d1 === undefined ? 'missed' : d1 < ACT1_BAND.from ? 'too fast' : d1 > ACT1_BAND.to ? 'too slow' : 'inside'}); first sale ${bot.firstSaleAt >= 0 ? mmss(bot.firstSaleAt) : '--:--'}, first building ${bot.firstBuildAt >= 0 ? mmss(bot.firstBuildAt) : '--:--'}`,
  );
  const pw = bot.powerStats(0);
  out.push(`Peak Surface power demand: ${pw.peak} kW at ${mmss(pw.peakAt)}; average satisfaction ${pw.avgSat.toFixed(2)}; line level ${g.s.lineLevel}`);
  out.push(`Rushed: ${bot.rushes.length} ghost(s), goods ${JSON.stringify(bot.rushedGoods)}, $${bot.rushSpent}${bot.rushes.length ? ': ' + bot.rushes.map((r) => `${mmss(r.t)} ${r.type} ${r.x},${r.y} $${r.price}`).join(', ') : ''}`);
  out.push(`Refused swaps (depot couldn't pay in full): ${bot.refusals.length ? bot.refusals.map((r) => `${r.what} ${mmss(r.from)}-${r.to >= 0 ? mmss(r.to) : 'never'}`).join(', ') : 'none'}`);
  out.push(`Jams cleared by hand (a wrong item at a machine's input): ${bot.jams.length ? bot.jams.map((j) => `${j.item} at ${j.x},${j.y} into ${j.into} ${mmss(j.since)}-${mmss(j.t)}`).join(', ') : 'none'}`);
  out.push(`Stalls (3+ min without milestone or drill progress): ${bot.stuck.length ? bot.stuck.map((s) => `${mmss(s.from)}-${mmss(s.to)} ${s.why}`).join(' | ') : 'none'}`);
  out.push(`Deadlocks (3+ min, ghosts waiting, none built): ${bot.deadlocks.length ? bot.deadlocks.map((s) => `${mmss(s.from)}-${s.to >= 0 ? mmss(s.to) : 'end'} ${s.why}${s.end ? ` -> ${s.end}` : ''}`).join(' | ') : 'none'}`);
  return out;
}

function details(bot: Bot, g: Game): string[] {
  const out: string[] = [];
  out.push(`Money by minute: ${bot.money.map((m) => `${mmss(m.t)} $${m.money} (+$${m.income}/min)`).join(', ')}`);
  const p = g.s.project;
  if (p && p.id === 'd1') out.push(`D1 delivered so far: ${JSON.stringify(p.delivered)}`);
  out.push(`Produced: ${JSON.stringify(g.s.stats.produced)}`);
  out.push(`Sold: ${JSON.stringify(g.s.stats.sold)}`);
  out.push(`HQ stock at the end: ${JSON.stringify(g.layer(0).stock)}`);
  out.push('Log:');
  for (const l of bot.log) out.push(`  ${l}`);
  out.push('Each minute:');
  for (const l of bot.snapshots) out.push(`  ${l}`);
  out.push('Final factory (x 12..52, y 7..42; belts ^>v<, o = ghost belt, lowercase = ghost, Y splitter, + crossing):');
  out.push(bot.map(12, 7, 52, 42));
  return out;
}

describe('Act I pacing bot', () => {
  // The bot plays with no thinking time, so it should land at or under the band's floor; the
  // ceiling is the bound that must hold (PLAN §8: tuning changes keep the bot inside the bands).
  // The summary line says whether it is under the floor.
  it('an efficient player finishes Act I inside the PLAN band\'s 25 minutes, with no deadlock, rush or jam', () => {
    const { bot, g, ms } = play(EFFICIENT);
    console.log([...summary('Act I pacing bot: efficient player', bot, g, ms), ...details(bot, g)].join('\n'));

    expect(bot.firstSaleAt, 'first sale (PLAN §8: under 20 s)').toBeGreaterThanOrEqual(0);
    expect(bot.firstSaleAt).toBeLessThanOrEqual(20);
    expect(bot.projectTimes.d1, 'D1 should complete').toBeDefined();
    expect(bot.projectTimes.d1).toBeLessThanOrEqual(ACT1_BAND.to);
    expect(bot.deadlocks).toEqual([]);
    expect(bot.rushes).toEqual([]);
    expect(bot.jams).toEqual([]);
    // The bot reads what the game says to the end (g.events keeps only the last 400, full by about
    // 8 minutes in): Mags's intro to D1 (M7) and the Board's memo at the breakthrough.
    expect(bot.messages.some((m) => m.who === 'mags' && m.text === MILESTONES.find((x) => x.n === 7)?.intro)).toBe(true);
    expect(bot.messages.some((m) => m.who === 'board' && m.text.includes('breakthrough to the Shallows'))).toBe(true);
  });

  it('with only the starter iron line feeding the HQ it still finishes, slower, without deadlocks', () => {
    const { bot, g, ms } = play(STARTER_ONLY);
    console.log(summary('Act I variant: only the starter iron line feeds the HQ', bot, g, ms).join('\n'));
    expect(bot.projectTimes.d1, 'D1 should complete').toBeDefined();
    expect(bot.projectTimes.d1).toBeLessThanOrEqual(60 * 60);
    expect(bot.deadlocks).toEqual([]);
  });

  it('a careless player drags belts over working lines and lets the gears run out (documents the traps)', () => {
    const { bot, g, ms } = play(CARELESS);
    const out = summary('Act I variant: careless (no crossings planned, brick line late, no gear upkeep)', bot, g, ms);
    out.push(...bot.log.filter((l) => /rush|REFUSED|swapped|DEADLOCK|STALL|JAM|dragged|noticed|milestone|project/.test(l)).map((l) => `  ${l}`));
    console.log(out.join('\n'));
    expect(bot.projectTimes.d1, 'D1 should complete').toBeDefined();
    expect(bot.projectTimes.d1).toBeLessThanOrEqual(60 * 60);
    // The drag no longer cuts the starter lane: it lays a crossing (DECISIONS #54).
    expect(g.at(0, 29, 25)?.type).toBe('crossing');
    expect(bot.log.some((l) => l.includes('turned (29,25) north'))).toBe(false);
    // Running out of gears with a ghost waiting gets a word from Mags (DECISIONS #54): the HQ "is out of
    // Gear", or "has 3 Gear; your planned Assembler needs 6" when some are left (review-3 K9).
    expect(bot.messages.some((m) => m.who === 'mags' && /^The HQ (?:is out of Gear|has \d+ Gear;)/.test(m.text))).toBe(true);
  });
});
