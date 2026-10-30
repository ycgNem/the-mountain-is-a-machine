// Printable summaries for act pacing tests: the act's milestones and drill project against its
// PLAN §8 band, power, elevators, stand-in supply, rushes, refusals, jams, stalls, deadlocks and
// friction, then the details (money, production, depots, log, snapshots, maps). Times are act times
// (game seconds since bot.t0).

import { ITEMS } from '../../src/data/items';
import { MILESTONES, PROJECTS } from '../../src/data/progression';
import { type Bot, MAP_LEGEND, mmss } from '../bot';
import { ACT_BANDS, actProject } from './start';

/** An act time as mm:ss ('--:--' when it never happened, 'before' when it happened before the act). */
export function actClock(bot: Bot, t: number | undefined): string {
  if (t === undefined) return '--:--';
  if (t < 0 || t < bot.t0 - 1e-6) return 'before';
  return mmss(t - bot.t0);
}

/** Where a time lands in a band. */
export function bandVerdict(t: number | undefined, band: { from: number; to: number }): string {
  return t === undefined ? 'missed' : t < band.from ? 'too fast' : t > band.to ? 'too slow' : 'inside';
}

/** The headline: milestones, the project against its band, and every watcher's findings. */
export function actSummary(bot: Bot, title: string, opts: { act?: number; realMs?: number } = {}): string[] {
  const act = opts.act ?? bot.act;
  const g = bot.g;
  const out: string[] = [];
  const band = ACT_BANDS[act];
  const proj = act === 1 ? 'd1' : actProject(act);
  const doneAt = bot.projectTimes[proj];
  const doneRel = doneAt !== undefined && doneAt >= 0 ? doneAt - bot.t0 : undefined;
  out.push(`=== ${title} (seed ${g.s.seed})${opts.realMs !== undefined ? `, ${(opts.realMs / 1000).toFixed(1)} s real time` : ''} for ${mmss(bot.actTime)} of act time ===`);
  out.push(`Milestones: ${MILESTONES.filter((m) => m.act === act).map((m) => `M${m.n} ${actClock(bot, bot.msTimes[m.n])}`).join('  ')}`);
  out.push(`${PROJECTS[proj].name}: ${doneRel !== undefined ? mmss(doneRel) : 'NOT DONE'} (PLAN §8 Act ${act} band ${mmss(band.from)}-${mmss(band.to)}: ${bandVerdict(doneRel, band)})`);
  const extras = Object.entries(bot.surplus[proj] ?? {});
  out.push(`Extras the ${proj === 'governor' ? 'Heart' : 'Drill'} passed into the depot once a need was met: ${extras.length ? extras.map(([k, v]) => `${v} ${ITEMS[k]?.name ?? k}`).join(', ') : 'none'}`);
  out.push(`Power: ${bot.openLayers().map((li) => {
    const p = bot.powerStats(li);
    return `L${li} peak ${p.peak} kW at ${actClock(bot, p.peakAt)}, average satisfaction ${p.avgSat.toFixed(2)}`;
  }).join('; ')}`);
  out.push(`Elevators: ${g.s.shafts.map((sh) => `L${sh.layers[0]}>L${sh.layers[1]} Mk${sh.tier + 1}`).join(', ') || 'none'}; ${g.s.stats.elevator} items moved in all`);
  if (bot.supplies.length || bot.incomePerMin) {
    out.push(`Stand-in supply: ${bot.supplies.map((s) => `${s.item}@L${s.layer}${s.via === 'station' ? ' (station)' : ''} ${s.perMin}/min +${s.added}${s.blocked ? ` (${s.blocked} backed up)` : ''}`).join(', ') || 'none'}; income $${bot.incomePerMin}/min`);
  }
  out.push(`Rushed: ${bot.rushes.length} ghost(s), goods ${JSON.stringify(bot.rushedGoods)}, $${bot.rushSpent}${bot.rushes.length ? ': ' + bot.rushes.map((r) => `${actClock(bot, r.t)} L${r.layer} ${r.type} ${r.x},${r.y} $${r.price}`).join(', ') : ''}`);
  out.push(`Refused swaps (depot couldn't pay in full): ${bot.refusals.length ? bot.refusals.map((r) => `${r.what} ${actClock(bot, r.from)}-${r.to >= 0 ? actClock(bot, r.to) : 'never'}`).join(', ') : 'none'}`);
  out.push(`Jams cleared by hand: ${bot.jams.length ? bot.jams.map((j) => `L${j.layer} ${j.item} at ${j.x},${j.y} into ${j.into} ${actClock(bot, j.since)}-${actClock(bot, j.t)}`).join(', ') : 'none'}`);
  out.push(`Stalls (3+ min without milestone or drill progress): ${bot.stuck.length ? bot.stuck.map((s) => `${actClock(bot, s.from)}-${s.to >= 0 ? actClock(bot, s.to) : 'now'} ${s.why}`).join(' | ') : 'none'}`);
  out.push(`Deadlocks (3+ min, ghosts waiting, none built): ${bot.deadlocks.length ? bot.deadlocks.map((d) => `L${d.layer} ${actClock(bot, d.from)}-${d.to >= 0 ? actClock(bot, d.to) : 'end'} ${d.why}${d.end ? ` -> ${d.end}` : ''}`).join(' | ') : 'none'}`);
  out.push(`Friction (the bot relied on something the game never says): ${bot.friction.length ? bot.friction.join(' | ') : 'none'}`);
  return out;
}

/** The long version: money by minute, production, every depot, the log, the snapshots and maps. */
export function actDetails(bot: Bot, maps: { layer: number; x0: number; y0: number; x1: number; y1: number; all?: boolean }[] = []): string[] {
  const g = bot.g;
  const out: string[] = [];
  out.push(`Money by minute: ${bot.money.filter((m) => m.t >= bot.t0).map((m) => `${actClock(bot, m.t)} $${m.money} (+$${m.income}/min)`).join(', ')}`);
  const p = g.s.project;
  if (p) out.push(`${PROJECTS[p.id].name} delivered so far: ${JSON.stringify(p.delivered)}`);
  out.push(`Produced (whole game): ${JSON.stringify(g.s.stats.produced)}`);
  out.push(`Sold (whole game): ${JSON.stringify(g.s.stats.sold)}`);
  for (const li of bot.openLayers()) out.push(`L${li} depot at the end: ${JSON.stringify(g.layer(li).stock)}${li ? ` requests ${JSON.stringify(g.layer(li).requests)}` : ''}`);
  out.push('Log:');
  for (const l of bot.log) out.push(`  ${l}`);
  out.push('What the game said (messages and toasts):');
  for (const m of bot.messages) if (m.t >= bot.t0) out.push(`  ${actClock(bot, m.t)} ${m.who}: ${m.text}`);
  out.push('Each minute:');
  for (const l of bot.snapshots) out.push(`  ${l}`);
  for (const m of maps) {
    out.push(`Layer ${m.layer}, x ${m.x0}..${m.x1}, y ${m.y0}..${m.y1} (${MAP_LEGEND}):`);
    out.push(bot.map(m.x0, m.y0, m.x1, m.y1, m.layer, { all: m.all }));
  }
  return out;
}
