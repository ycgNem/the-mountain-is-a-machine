// The in-game HUD: top bar (with the depot strip), objectives, the Stack, the build bar, radio,
// toasts and hover info.

import type { App } from '../app/app';
import { BUILDING_LIST, BUILDINGS, CATEGORIES, LICENSES, type BuildingDef } from '../data/buildings';
import { ITEMS, itemShort } from '../data/items';
import { LAYERS, PURITY_NAME } from '../data/layers';
import { C } from '../data/palette';
import { MILESTONES, PROJECTS } from '../data/progression';
import { RECIPES } from '../data/recipes';
import { iconCanvas } from '../render/icons';
import { TILE } from '../render/terrain';
import { heldCargo, shaftTraffic } from '../sim/elevator';
import { predictPlacement } from '../sim/env';
import { STOCK_CAP, SURVEY_RADIUS, type Game } from '../sim/game';
import { depotItem } from '../sim/logistics';
import { jamFresh } from '../sim/production';
import { stepProgress } from '../sim/progress';
import type { Building } from '../sim/types';
import { drawText, fitText, LINE_H, measureText, money, wrapText } from './font';
import type { Rect } from './ui';

const STATUS_TEXT: Record<string, string> = {
  ok: 'Working',
  idle: 'Idle',
  no_input: 'Waiting for input',
  blocked: 'Output blocked',
  no_power: 'No power',
  no_recipe: 'No recipe: pick one',
  slowed: 'Slowed',
  misplaced: "Can't work here",
  planned: 'Planned: waiting for goods',
  paused: 'Paused (P resumes)',
  jammed: 'Jammed: wrong item at its input',
};

export function statusText(s: string): string {
  return STATUS_TEXT[s] ?? s;
}

/** A layer's name mid-sentence: "the Shallows" (every layer's name starts with "The"). */
export function layerName(layer: number): string {
  return LAYERS[layer].name.replace(/^The /, 'the ');
}

/** "the HQ" or "the Shallows depot": a layer's depot named mid-sentence. */
export function depotName(layer: number): string {
  return layer === 0 ? 'the HQ' : `${layerName(layer)} depot`;
}

/**
 * A belt pushing into an elevator station's front (its exit), recently: what the station's hover and
 * inspector say, or null. Only a top station turns, so only its line offers R.
 */
export function stationJamText(g: Game, b: Building): string | null {
  if (BUILDINGS[b.type]?.kind !== 'elevator' || b.jamWhy !== 'front' || !jamFresh(g, b)) return null;
  return b.end === 0 ? 'A belt is pushing into the exit: feed a side face, or turn the station with R.' : 'A belt is pushing into the exit: feed a side face.';
}

/** Two belts whose heads push into each other, recently: what each one's hover and inspector say, or null. */
export function headOnText(g: Game, b: Building): string | null {
  return b.jamWhy === 'headon' && jamFresh(g, b) ? 'These belts face each other: turn one with R.' : null;
}

/**
 * A jammed machine's reason (to follow "Jammed: "), or null: the good stuck at its input and what it
 * makes, or the good a belt pushes into its front.
 */
export function machineJamText(b: Building): string | null {
  if (b.status !== 'jammed' || !b.jam) return null;
  const name = ITEMS[b.jam]?.name ?? b.jam;
  if (b.jamWhy === 'front') return `${name} pushed into its front`;
  return `${name} at its input${b.recipe && RECIPES[b.recipe] ? ` (it makes ${RECIPES[b.recipe].name})` : ''}`;
}

/** A sentence-start copy of a name used mid-sentence ("the HQ" -> "The HQ"). */
export function upperFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Why a belt is stuck against the Drill or the Heart (to follow "Jammed: "), or null when it isn't
 * jammed: a good it never takes ('wrong'), or an extra of a finished need its layer's depot is too
 * full to stack ('full').
 */
export function projectJamText(b: Building): string | null {
  if (b.status !== 'jammed' || !b.jam) return null;
  const name = ITEMS[b.jam]?.name ?? b.jam;
  if (b.jamWhy === 'full') {
    // A molten ingot is stacked cooled: name both when they differ.
    const k = depotItem(b.jam) ?? b.jam;
    const extra = k === b.jam ? 'the extra' : `the extra ${name}`;
    return `${depotName(b.layer)} is full of ${ITEMS[k]?.name ?? k}, so ${extra} waits on the belt. Use some, or take it off.`;
  }
  return `${b.type === 'heart' ? 'the Heart' : 'the Drill'} doesn't take ${name}: take it off this belt.`;
}

/**
 * The HUD. With `full` false (the ending sequence is playing, src/app/ending.ts) it steps aside and
 * shows only the paused label, so nothing is sliced by the ending's cards and text.
 */
export function drawHud(app: App, camX: number, camY: number, full = true): void {
  if (full) {
    drawFloats(app, camX, camY);
    topBar(app);
    objectives(app);
    stack(app);
    buildBar(app);
    radio(app);
    toasts(app);
    if (app.card) breakthroughCard(app);
  }
  if (app.paused) {
    const ui = app.ui;
    const t = 'PAUSED (Space)';
    const w = measureText(t) + 10;
    ui.panel(Math.floor(ui.w / 2 - w / 2), 34, w, 13);
    ui.textCenter(t, ui.w / 2, 37, C.pale);
  }
  if (full) hoverInfo(app, camX, camY);
}

/**
 * Is r (a HUD panel, UI px) under the open window or the ending card (app.covers)? Such a panel isn't
 * drawn while they are up: a window's edge would cut its text mid-word.
 */
export function covered(app: App, r: Rect): boolean {
  // Two px of slack: the panels' 1 px ink borders would otherwise touch and merge.
  return app.covers.some((c) => r.x - 2 < c.x + c.w && c.x < r.x + r.w + 2 && r.y - 2 < c.y + c.h && c.y < r.y + r.h + 2);
}

function drawFloats(app: App, camX: number, camY: number): void {
  const ui = app.ui;
  const s = app.uiScale();
  for (const f of app.floats) {
    if (f.layer !== app.layer) continue;
    const sx = ((f.x - camX) * app.zoom) / s;
    const sy = ((f.y - camY) * app.zoom) / s - f.t * 14;
    const w = measureText(f.text);
    ui.ctx.globalAlpha = Math.max(0, 1 - f.t / 1.5);
    drawText(ui.ctx, f.text, Math.round(sx - w / 2), Math.round(sy), f.color, C.ink);
    ui.ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ top bar

function topBar(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const s = g.s;
  const L = g.layer(app.layer);
  ui.panel(0, 0, ui.w, 15);
  let x = 4;
  ui.image(iconCanvas('money'), x, 4);
  x += 10;
  x += ui.text(money(s.money), x, 4, C.pale) + 4;
  const ipm = g.incomePerMin();
  const ix = x;
  x += ui.text(`+${money(ipm)}/min`, x, 4, C.steel2);
  if (ui.hover(ix, 2, x - ix, 11)) ui.tooltip('Income over the last minute\nSales at the Terminal and the Chutes, and contract pay. Milestone rewards add to your money but not to this.');
  x += 10;
  // The layer by its key word ("FUNGAL"); its full name and depth are in the hover, so the depot strip
  // keeps the room underground.
  const def = LAYERS[app.layer];
  const lx = x;
  x += ui.text(def.short.toUpperCase(), x, 4, C.white);
  if (ui.hover(lx, 2, x - lx, 11)) ui.tooltip(`${def.name}${def.depth > 0 ? `, ${def.depth} m down` : ', on the surface'}\n[ and ] switch layers, or click one in the Stack.`);
  x += 10;
  // Power meter. Available power is what the demand is getting plus any spare (supply and imports).
  const p = L.power;
  const avail = p.demand * p.sat + Math.max(0, p.net);
  const px = x;
  ui.image(iconCanvas('power'), x, 4);
  x += 9;
  const frac = avail > 0 ? Math.min(1, p.demand / Math.max(1, avail)) : p.demand > 0 ? 1 : 0;
  const col = p.sat < 0.99 ? C.coral : frac > 0.85 ? C.gold : C.cyan;
  ui.bar(x, 4, 40, 7, frac, col);
  x += 44;
  x += ui.text(`${Math.round(p.demand)}/${Math.round(Math.max(avail, p.demand * p.sat))} kW`, x, 4, p.sat < 0.99 ? C.coral : C.steel3);
  if (ui.hover(px, 2, x - px, 11)) {
    let tip = `Power on this layer\nDemand ${Math.round(p.demand)} kW, satisfied ${Math.round(p.sat * 100)}%`;
    if (app.layer === 0) tip += `\nCompany Line: ${g.lineKw()} kW`;
    if (p.genCap > 0) tip += `\nGenerators: ${Math.round(p.genUsed)}/${Math.round(p.genCap)} kW in use`;
    tip += '\nShaft cables share spare power between layers.';
    if (p.sat < 0.99) tip += '\nShort on power: every machine here runs slower.';
    ui.tooltip(tip);
  }
  x += 6;
  // Right side controls.
  let rx = ui.w - 4;
  const btn = (label: string, w: number, active: boolean, tip: string, icon?: HTMLCanvasElement): boolean => {
    rx -= w;
    const r = ui.button(rx, 2, w, 11, label, { active, tip, icon: icon ?? null });
    rx -= 3;
    return r;
  };
  if (btn('', 13, app.win === 'menu', 'Menu (Esc)', iconCanvas('menu'))) app.win = app.win === 'menu' ? null : 'menu';
  if (btn('2x', 17, app.speed === 2, 'Game speed (Tab)')) app.speed = 2;
  if (btn('1x', 17, app.speed === 1, 'Game speed (Tab)')) app.speed = 1;
  if (btn('', 13, app.paused, 'Pause (Space)', iconCanvas(app.paused ? 'play' : 'pause'))) app.paused = !app.paused;
  rx -= 4;
  if (btn('Help', 28, app.win === 'help', 'Help and knowledge cards (H)')) app.win = app.win === 'help' ? null : 'help';
  if (btn('Company', 44, app.win === 'company', 'Contracts, licenses and the Company Line (C)')) app.win = app.win === 'company' ? null : 'company';
  // Overlay toggles when relevant.
  if (app.layer === 2 || L.sporeBase.some((v) => v > 0)) {
    if (btn('Spores', 38, app.overlays.spores, 'Show the spore overlay')) app.overlays.spores = !app.overlays.spores;
  }
  if (app.layer === 3 || g.s.deepest >= 3) {
    if (btn('Arcs', 28, app.overlays.interference, 'Show interference arcs')) app.overlays.interference = !app.overlays.interference;
  }
  if (app.layer === 4) {
    if (btn('Heat', 28, app.overlays.heat, 'Show hot ground')) app.overlays.heat = !app.overlays.heat;
  }
  // The depot strip fills whatever room is left between the two.
  depotStrip(app, x, rx - 4);
}

// ------------------------------------------------------------------ depot strip

/** The HQ's strip: the basics everything on the Surface is built from. */
const HQ_STRIP = ['iron_plate', 'gear', 'copper_wire', 'brick'];
const STRIP_MAX = 6;
const STRIP_GAP = 5;
/** Seconds of deliveries one "+N" adds up, and how long it shows. */
const FLASH_GATHER = 0.6;
const FLASH_LIFE = 1.2;

const strip = {
  game: null as Game | null,
  layer: -1,
  prev: new Map<string, number>(),
  acc: new Map<string, { n: number; t: number }>(),
  floats: [] as { item: string; text: string; t: number }[],
};

/**
 * The current layer's depot at a glance, in the top bar: the HQ's basics, or an underground depot's
 * requested goods, with counts; anything the oldest planned ghost here still lacks shows in coral.
 * A count that rises flashes "+N". Items that don't fit the room are dropped, never overlapped: the
 * well-stocked ones first, then those below their request, what the plan lacks last. What stays keeps
 * its place in the list.
 */
function depotStrip(app: App, x0: number, x1: number): void {
  const ui = app.ui;
  const g = app.game!;
  const li = app.layer;
  const L = g.layer(li);
  if (strip.game !== g || strip.layer !== li) {
    strip.game = g;
    strip.layer = li;
    strip.prev.clear();
    strip.acc.clear();
    strip.floats = [];
  }
  const base = (li === 0 ? HQ_STRIP : Object.keys(L.requests)).filter((k) => ITEMS[k]);
  const ghost = g.ghostQueue(li)[0];
  const lack: Record<string, number> = {};
  if (ghost) {
    for (const [k, v] of Object.entries(BUILDINGS[ghost.type].cost)) {
      const have = L.stock[k] ?? 0;
      if (have < v) lack[k] = v - have;
    }
  }
  const all = [...base, ...Object.keys(lack).filter((k) => !base.includes(k))];
  const count = (k: string) => Math.max(0, Math.floor(L.stock[k] ?? 0));
  // Deliveries: gather each item's rise for a moment, then flash it.
  for (const k of all) {
    const n = count(k);
    const prev = strip.prev.get(k);
    strip.prev.set(k, n);
    const a = strip.acc.get(k) ?? { n: 0, t: app.time };
    if (prev !== undefined && n > prev) {
      if (a.n === 0) a.t = app.time;
      a.n += n - prev;
    }
    if (a.n > 0 && app.time - a.t >= FLASH_GATHER) {
      strip.floats.push({ item: k, text: `+${a.n}`, t: app.time });
      a.n = 0;
    }
    strip.acc.set(k, a);
  }
  strip.floats = strip.floats.filter((f) => app.time - f.t < FLASH_LIFE);
  // Fit: at most six, and only what the room takes. Dropped first: goods at or above their request
  // (or with none), then goods below it, last what the plan lacks; within each, from the end.
  const entryW = (k: string) => 14 + 2 + measureText(String(count(k)));
  const width = (l: string[]) => l.reduce((a, k) => a + entryW(k) + STRIP_GAP, 0) - STRIP_GAP;
  const keep = (k: string) => (lack[k] ? 2 : L.requests[k] !== undefined && count(k) < L.requests[k] ? 1 : 0);
  const list = [...all];
  while (list.length && (list.length > STRIP_MAX || width(list) > x1 - x0)) {
    const least = Math.min(...list.map(keep));
    let i = list.length - 1;
    while (i > 0 && keep(list[i]) !== least) i--;
    list.splice(i, 1);
  }
  let x = x0;
  for (const k of list) {
    const n = count(k);
    const w = entryW(k);
    ui.spriteCrop(`i_${k}`, x, 0, 14, 14);
    ui.text(String(n), x + 16, 4, lack[k] ? C.coral : n > 0 ? C.white : C.steel2);
    if (ui.hover(x, 1, w, 13)) {
      let tip = `${ITEMS[k].name}: ${n} in ${depotName(li)}`;
      const r = L.requests[k];
      if (r !== undefined) tip += li === 0 ? `\nKept for the Surface: ${r} (the elevator never takes the HQ below it)` : `\nRequested: ${r} (the elevator keeps this many here)`;
      if (lack[k] && ghost) tip += `\nYour planned ${BUILDINGS[ghost.type].name} needs ${lack[k]} more`;
      ui.tooltip(tip);
    }
    // The "+N" drifts up just under the bar. It is drawn last, once every panel is down: where a panel
    // (the inspector, a window) sits under the bar, the count itself flashes lime instead.
    for (const f of strip.floats) {
      if (f.item !== k) continue;
      const age = (app.time - f.t) / FLASH_LIFE;
      const fx = x + 16;
      const fy = Math.round(21 - age * 6);
      const lit = lack[k] ? null : String(n);
      ui.late(() => {
        ui.ctx.globalAlpha = Math.max(0, 1 - age);
        if (!ui.overPanel({ x: fx - 1, y: fy, w: measureText(f.text) + 2, h: 8 })) drawText(ui.ctx, f.text, fx, fy, C.lime, C.ink);
        else if (lit) drawText(ui.ctx, lit, fx, 4, C.lime);
        ui.ctx.globalAlpha = 1;
      });
    }
    x += w + STRIP_GAP;
  }
}

// ------------------------------------------------------------------ objectives

/** The objectives panel's width (UI px). */
export const OBJECTIVES_W = 172;

/**
 * The room a step label gets in the objectives panel: from just right of its checkbox to the panel's
 * edge, or to the count drawn at the right ("3/10"). Labels longer than this are cut (tests/ui-labels).
 */
export function stepLabelRoom(count: string): number {
  return OBJECTIVES_W - 14 - 5 - (count ? measureText(count) + 5 : 0);
}

function objectives(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const s = g.s;
  const m = MILESTONES[s.milestone];
  const x = 4;
  const y = 19;
  const w = OBJECTIVES_W;
  if (s.ended) {
    if (covered(app, { x, y, w, h: 30 })) return;
    ui.panel(x, y, w, 30, 'The Mountain Is Awake');
    ui.text('Free play: contracts never stop.', x + 5, y + 16, C.steel3);
    return;
  }
  if (!m) return;
  const steps = m.steps.map((st) => stepProgress(g, st));
  const hint = m.hint ? wrapText(m.hint, w - 10) : [];
  let h = 16 + steps.length * 11 + 4;
  // Project details for drill milestones.
  const proj = m.steps.find((st) => st.kind === 'project');
  const pdef = proj && proj.kind === 'project' ? PROJECTS[proj.project] : null;
  if (pdef && s.project?.id === pdef.id) h += Object.keys(pdef.needs).length * 10 + 14;
  h += hint.length * LINE_H + (hint.length ? 3 : 0);
  // Under a window it waits: the window's edge would cut its lines mid-word.
  if (covered(app, { x, y, w, h })) return;
  ui.panel(x, y, w, h, `${m.n}. ${m.name}`);
  let cy = y + 16;
  for (const sp of steps) {
    const done = sp.done;
    ui.fill(x + 5, cy + 1, 6, 6, C.ink);
    ui.fill(x + 6, cy + 2, 4, 4, done ? C.lime : C.panel2);
    const count = sp.max > 1 ? `${Math.min(sp.cur, sp.max)}/${sp.max}` : '';
    const room = stepLabelRoom(count);
    ui.text(fitText(sp.label, room), x + 14, cy, done ? C.steel2 : C.white);
    if (count) ui.textRight(count, x + w - 5, cy, done ? C.lime : C.pale);
    if (ui.hover(x, cy - 1, w, 10) && measureText(sp.label) > room) ui.tooltip(sp.label);
    cy += 11;
  }
  if (pdef && s.project?.id === pdef.id) {
    cy += 2;
    const eta = projectEta(app);
    for (const [k, v] of Object.entries(pdef.needs)) {
      const have = Math.min(v, s.project.delivered[k] ?? 0);
      // A needed good with nothing arriving: its count in coral, and the ETA line names it.
      const dry = eta.dry.includes(k);
      ui.sprite(`i_${k}`, x + 5, cy - 4, 1, 1);
      ui.text(ITEMS[k].name, x + 22, cy, have >= v ? C.steel2 : C.steel3);
      ui.textRight(`${have}/${v}`, x + w - 5, cy, have >= v ? C.lime : dry ? C.coral : C.white);
      if (dry && ui.hover(x, cy - 2, w, 10)) ui.tooltip(`${ITEMS[k].name}: no supply\nNone has arrived in the last ${duration(eta.span)}: belt some in.`);
      cy += 10;
    }
    ui.text(fitText(eta.line, w - 10), x + 5, cy + 1, eta.dry.length ? C.coral : C.steel2);
    cy += 12;
  }
  for (const l of hint) {
    ui.text(l, x + 5, cy + 1, C.steel2);
    cy += LINE_H;
  }
}

/** The window (game seconds) each good's delivery rate is taken over: long enough for a slow good. */
const ETA_WINDOW = 120;
/** Seconds between samples of the deliveries. */
const ETA_SAMPLE = 2;
/** Until the samples span this long (game seconds) no good is called dry: the first ones are still on their way. */
const ETA_SETTLE = 10;

/** Samples of the running project's deliveries per good, for its ETA. One history per game and project. */
let eta: { game: Game | null; project: string; hist: { t: number; got: Record<string, number> }[] } = { game: null, project: '', hist: [] };

/**
 * The running project's ETA line, and the needed goods with nothing arriving ("dry") over the game
 * seconds the samples span. Each good's rate comes from its own deliveries over the last ETA_WINDOW;
 * the ETA is the slowest good's. While any needed good is dry no time is printed (it would be a bogus
 * short one): the line names the dry goods.
 */
function projectEta(app: App): { line: string; dry: string[]; span: number } {
  const g = app.game!;
  const p = g.s.project;
  if (!p) return { line: '', dry: [], span: 0 };
  const needs = Object.entries(PROJECTS[p.id].needs);
  const got: Record<string, number> = {};
  for (const [k, v] of needs) got[k] = Math.min(v, p.delivered[k] ?? 0);
  const t = g.s.time;
  // A different operation, a new project, or a clock that went back (a load): start over.
  const last = eta.hist[eta.hist.length - 1];
  if (eta.game !== g || eta.project !== p.id || (last && t < last.t)) eta = { game: g, project: p.id, hist: [] };
  const h = eta.hist;
  if (!h.length || t - h[h.length - 1].t >= ETA_SAMPLE) h.push({ t, got: { ...got } });
  // Keep one sample at or past the window's start: the window then always spans ETA_WINDOW once it can.
  while (h.length > 2 && t - h[1].t >= ETA_WINDOW) h.shift();
  const first = h[0];
  const span = t - first.t;
  const open = needs.filter(([k, v]) => got[k] < v);
  if (!open.length) return { line: 'Complete!', dry: [], span };
  if (needs.every(([k]) => got[k] === 0)) return { line: 'Not being fed yet', dry: [], span };
  let slowest = 0;
  const dry: string[] = [];
  for (const [k, v] of open) {
    const rate = span > 0 ? (got[k] - (first.got[k] ?? 0)) / span : 0;
    if (rate > 0) slowest = Math.max(slowest, (v - got[k]) / rate);
    else if (span >= ETA_SETTLE) dry.push(k);
  }
  if (dry.length) {
    const names = dry.map(itemShort);
    const all = `No supply: ${names.join(', ')}`;
    return { line: measureText(all) <= OBJECTIVES_W - 10 || dry.length === 1 ? all : `No supply: ${names[0]} +${dry.length - 1}`, dry, span };
  }
  // A good not timed yet (the samples are only seconds old) leaves no honest ETA to print.
  if (slowest <= 0 || open.some(([k]) => got[k] === (first.got[k] ?? 0))) return { line: 'Timing the deliveries', dry: [], span };
  return { line: `At this rate: ${duration(slowest)}`, dry: [], span };
}

/** "45 s", "2 min", "11 min 59 s", "1 h 05 min": whole units, floored, so 60 never shows. */
function duration(sec: number): string {
  const s = Math.floor(sec);
  const min = Math.floor(s / 60);
  if (min >= 60) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  if (min === 0) return `${s} s`;
  return s % 60 ? `${min} min ${s % 60} s` : `${min} min`;
}

// ------------------------------------------------------------------ the Stack

/** The Stack column's width (UI px); it sits 3 px from the right edge. */
export const STACK_W = 36;

function stack(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const s = g.s;
  const w = STACK_W;
  const x = ui.w - w - 3;
  const y = 19;
  const bandH = 22;
  const h = 14 + LAYERS.length * bandH + 4;
  ui.panel(x, y, w, h);
  ui.textCenter('STACK', x + w / 2, y + 3, C.steel2);
  for (let i = 0; i < LAYERS.length; i++) {
    const by = y + 13 + i * bandH;
    const open = g.layer(i).open;
    const cur = i === app.layer;
    const def = LAYERS[i];
    const r = { x: x + 2, y: by, w: w - 4, h: bandH - 2 };
    // Band: the layer's colors as a strip of rock.
    ui.fill(r.x, r.y, r.w, r.h, open ? def.wall[1] : C.night);
    if (open) {
      ui.fill(r.x, r.y + 3, r.w, r.h - 6, def.floor[cur ? 0 : 1]);
      // Activity dots: working machines.
      let n = 0;
      for (const b of s.buildings.values()) if (b.layer === i && b.workT < 0.5 && BUILDINGS[b.type].size >= 2) n++;
      for (let k = 0; k < Math.min(8, n); k++) ui.fill(r.x + 2 + (k % 4) * 3, r.y + 5 + Math.floor(k / 4) * 4, 2, 2, C.pale);
      // Power warning light.
      if (g.layer(i).power.sat < 0.99) ui.fill(r.x + r.w - 5, r.y + 4, 3, 3, Math.floor(app.time * 3) % 2 ? C.coral : C.crimson);
    } else {
      ui.textCenter('?', x + w / 2, r.y + 6, C.slate);
    }
    if (cur) {
      ui.fill(r.x - 1, r.y - 1, r.w + 2, 1, C.pale);
      ui.fill(r.x - 1, r.y + r.h, r.w + 2, 1, C.pale);
      ui.fill(r.x - 1, r.y - 1, 1, r.h + 2, C.pale);
      ui.fill(r.x + r.w, r.y - 1, 1, r.h + 2, C.pale);
    }
    // Shafts between bands: the cab position.
    const sh = s.shafts.find((q) => q.layers[0] === i);
    if (sh && i < LAYERS.length - 1) {
      const sx = x + w / 2;
      ui.fill(sx - 1, r.y + r.h - 2, 2, 6, C.ink);
      const cy = r.y + r.h - 2 + Math.round(sh.pos * 4);
      ui.fill(sx - 2, cy, 4, 2, C.gold);
    }
    const hov = ui.inside(r);
    if (hov) {
      ui.tooltip(open ? `${def.name} (${def.depth} m)\nClick to go there. [ and ] also switch layers.` : `${def.name}: not reached yet`);
      if (open && ui.input.pressed[0]) {
        app.setLayer(i);
        ui.used = true;
      }
    }
  }
  // Elevator traffic for the shafts touching the current layer: its tier and the live rate down.
  const shafts = s.shafts.filter((q) => q.layers.includes(app.layer));
  let ty = y + h + 4;
  for (const sh of shafts) {
    const t = shaftTraffic(g, sh.id);
    const rate = Math.round(t.rate);
    ui.panel(x, ty, w, 22);
    ui.textCenter(`Mk${sh.tier + 1}`, x + w / 2, ty + 2, C.pale);
    ui.textCenter(`${t.down}/m`, x + w / 2, ty + 12, t.full ? C.gold : C.steel3);
    if (ui.hover(x, ty, w, 22)) {
      let tip = `Elevator ${LAYERS[sh.layers[0]].short} - ${LAYERS[sh.layers[1]].short}, Mk${sh.tier + 1}`;
      tip += `\nLast minute: down ${t.down}/${rate} (requests ${t.reqDown}, belts ${t.beltDown}), up ${t.up}/${rate}`;
      if (t.full) tip += '\nThe cab is running full: lower a request, or upgrade the shaft.';
      // Belt cargo waiting at the top because the depot below is full of it (999 with what's on its way).
      const held = heldCargo(g, sh);
      if (held) {
        const name = ITEMS[held.item]?.name ?? held.item;
        tip += `\nHeld at the top: ${held.count} ${name}. ${upperFirst(depotName(sh.layers[1]))} is full of it (${STOCK_CAP} with what's on its way); once the bay fills, belts into the top station back up.`;
      }
      tip += '\nUpgrade it from either station.';
      ui.tooltip(tip);
    }
    ty += 25;
  }
}

// ------------------------------------------------------------------ build bar

/** The layer where a building's unlock first comes into reach (its material, act or license). */
function unlockLayer(unlock: string): number {
  const [kind, arg] = unlock.split(':');
  if (kind === 'layer') return Number(arg);
  if (kind === 'assay' || kind === 'made') return ITEMS[arg]?.layer ?? 0;
  // A bought license from its layer; one a milestone grants (the Sorter's) from that milestone's act.
  if (kind === 'license') return LICENSES[arg]?.minLayer ?? (MILESTONES.find((m) => m.reward.license === arg)?.act ?? 1) - 1;
  if (kind === 'milestone') return (MILESTONES.find((m) => m.n === Number(arg))?.act ?? 1) - 1;
  return 0;
}

/** Top edge of the build bar last frame, so panels above it can stack on it. */
let barTop = 0;

/** The top of the build bar, or of the tool help line above it (UI px): panels that stack on the bar stop above it. */
export function buildBarTop(): number {
  return barTop;
}

const BAR_BW = 36;
const BAR_BH = 31;
const BAR_GAP = 3;
const TOOL_LABELS = ['Select', 'Remove', 'Dig', 'Survey'];
/** The tool help line's room above the bar (UI px). */
const HELP_ROOM = 16;

interface BarLayout {
  items: BuildingDef[];
  tabLabels: string[];
  tabW: number;
  toolW: number;
  perRow: number;
  rowW: number;
  totalW: number;
  x0: number;
  y0: number;
  h: number;
}

/**
 * A tab's buildings: what can be built, and what is still locked on a layer already reached (a
 * building that comes with a deeper layer stays off the bar until then; review-3 K4).
 */
function tabItems(app: App, category: string): BuildingDef[] {
  const g = app.game!;
  return BUILDING_LIST.filter((b) => b.category === category && !b.fixed && (g.canBuild(b.id) || unlockLayer(b.unlock) <= g.s.deepest));
}

/**
 * Where the build bar goes this frame, without drawing it. Its size comes from the widest tab, not
 * the open one, so switching tabs moves nothing; the tabs don't depend on the layer shown either (only
 * on the deepest layer reached), so neither does switching layers. One row of buttons whenever the UI
 * is 620 px or wider (the auto scale keeps it at 640 or more); a narrower one wraps.
 */
function barLayout(app: App): BarLayout {
  const ui = app.ui;
  const items = tabItems(app, app.category);
  const most = Math.max(1, ...CATEGORIES.map((t) => tabItems(app, t.id).length));
  const tabLabels = CATEGORIES.map((t) => `${t.key} ${t.name}`);
  const tabW = Math.max(...tabLabels.map((l) => measureText(l))) + 8;
  const toolW = Math.max(...TOOL_LABELS.map((l) => measureText(l))) + 8;
  const toolsW = 2 * toolW + 2;
  // As many buildings per row as fit beside the tools.
  const maxRowW = Math.max(120, ui.w - 8 - toolsW - 10);
  const perRow = Math.max(1, Math.min(most, Math.floor((maxRowW - 8 + BAR_GAP) / (BAR_BW + BAR_GAP))));
  const rows = Math.max(1, Math.ceil(most / perRow));
  const rowW = Math.max(CATEGORIES.length * (tabW + 2) + 4, perRow * (BAR_BW + BAR_GAP) + 8 - BAR_GAP, 120);
  const totalW = rowW + toolsW + 6;
  const x0 = Math.floor(ui.w / 2 - totalW / 2);
  const h = 19 + rows * (BAR_BH + BAR_GAP);
  const y0 = ui.h - h - 2;
  return { items, tabLabels, tabW, toolW, perRow, rowW, totalW, x0, y0, h };
}

/**
 * The top of the build bar with room for its tool help line, shown or not (UI px). Windows sit above
 * it, so picking a tool never moves an open window.
 */
export function barRoomTop(app: App): number {
  return barLayout(app).y0 - HELP_ROOM;
}

function buildBar(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const tabs = CATEGORIES;
  const { items, tabLabels, tabW, toolW, perRow, rowW, totalW, x0, y0, h } = barLayout(app);
  const bw = BAR_BW;
  const bh = BAR_BH;
  const gap = BAR_GAP;
  // The tool help line sits just above the bar: panels that stack on the bar (Mags, the inspector) stop above it too.
  const help = toolHelp(app);
  barTop = help ? y0 - HELP_ROOM : y0;
  ui.panel(x0, y0, totalW, h);
  // Category tabs.
  tabs.forEach((t, i) => {
    if (ui.button(x0 + 3 + i * (tabW + 2), y0 + 3, tabW, 10, tabLabels[i], { active: app.category === t.id, small: true })) app.category = t.id;
  });
  // Buildings in the category (an empty tab says why, in the row's place).
  if (!items.length) ui.text('Nothing here yet: deeper layers bring more.', x0 + 6, y0 + 16 + Math.floor((bh - 7) / 2), C.steel2);
  items.forEach((d, i) => {
    const x = x0 + 4 + (i % perRow) * (bw + gap);
    const y = y0 + 16 + Math.floor(i / perRow) * (bh + gap);
    const unlocked = g.canBuild(d.id);
    const active = app.tool.kind === 'build' && app.tool.type === d.id;
    const clicked = ui.button(x, y, bw, 31, '', { active, disabled: !unlocked });
    if (d.kind === 'belt') drawBeltIcon(app, d.id, x + 10, y + 7);
    else {
      ui.spriteCrop(`b_${d.id}`, x + 1, y + 1, bw - 2, 29, unlocked ? 1 : 0.3);
    }
    if (!unlocked) ui.image(iconCanvas('lock'), x + bw - 9, y + 2);
    if (ui.hover(x, y, bw, 31)) ui.tooltip(buildTip(app, d.id));
    if (clicked && unlocked) app.selectBuild(d.id);
  });
  // Tools.
  const tx = x0 + rowW + 4;
  const toolH = Math.min(21, Math.floor((h - 8) / 2));
  const tool = (i: number, label: string, kind: 'select' | 'remove' | 'dig' | 'survey', tip: string) => {
    const x = tx + (i % 2) * (toolW + 2);
    const y = y0 + 3 + Math.floor(i / 2) * (toolH + 2);
    if (ui.button(x, y, toolW, toolH, label, { active: app.tool.kind === kind, tip })) app.tool = { kind } as App['tool'];
  };
  tool(0, 'Select', 'select', 'Select and inspect (Esc)');
  tool(1, 'Remove', 'remove', 'Remove buildings: click or drag (X). Right-drag works in any mode. Full refund.');
  const underground = app.layer > 0;
  if (underground || g.layer(app.layer).terrain.some((t) => t === 1)) tool(2, 'Dig', 'dig', `Excavate rock: drag over it (E). $${LAYERS[app.layer].digCost} per tile.`);
  if (underground) tool(3, 'Survey', 'survey', `Survey (F): reveals deposits and caverns within ${SURVEY_RADIUS} tiles through the dark. $${LAYERS[app.layer].surveyCost}.`);
  // Current tool help line (not under a window that reaches down to it: its edge would cut the line).
  const helpW = measureText(help) + 10;
  const helpR = { x: Math.floor(ui.w / 2 - helpW / 2), y: y0 - 15, w: helpW, h: 12 };
  if (help && !covered(app, helpR)) {
    ui.panel(helpR.x, helpR.y, helpR.w, helpR.h, undefined, { alpha: 0.9 });
    ui.textCenter(help, ui.w / 2, y0 - 13, C.steel3);
  }
}

function drawBeltIcon(app: App, type: string, x: number, y: number): void {
  // A short run of belt as the icon.
  const ui = app.ui;
  ui.fill(x - 2, y + 2, 20, 14, C.ink);
  ui.fill(x - 1, y + 3, 18, 12, type === 'express_belt' ? C.blue1 : type === 'insulated_belt' ? C.rust1 : C.panel2);
  ui.fill(x, y + 5, 16, 8, C.panel);
  const off = Math.floor(app.time * 16) % 4;
  for (let k = 0; k < 4; k++) ui.fill(x + ((k * 4 + off) % 16), y + 5, 1, 8, type === 'express_belt' ? C.cyan : C.steel);
}

function costLine(app: App, cost: Record<string, number>): string {
  const L = app.game!.layer(app.layer);
  return Object.entries(cost)
    .map(([k, v]) => `${v} ${ITEMS[k].name} (${Math.max(0, L.stock[k] ?? 0)})`)
    .join(', ');
}

export function buildTip(app: App, id: string): string {
  const g = app.game!;
  const d = BUILDINGS[id];
  let t = `${d.name}\n${d.blurb}`;
  t += `\nCost: ${costLine(app, d.cost)}`;
  if (d.power > 0) t += `\nPower: ${d.power} kW while working`;
  if (!g.canBuild(id)) t += `\nLocked: ${unlockText(d.unlock)}`;
  const rec = Object.values(RECIPES).filter((r) => r.machine === id);
  if (rec.length) t += `\nMakes: ${rec.map((r) => r.name).join(', ')}`;
  return t;
}

export function unlockText(key: string): string {
  const [kind, val] = key.split(':');
  switch (kind) {
    case 'milestone':
      return `finish milestone ${val} (${MILESTONES.find((m) => m.n === Number(val))?.name ?? ''})`;
    case 'layer':
      return `reach ${layerName(Number(val))}`;
    case 'assay':
      return `assay ${ITEMS[val]?.name ?? val} in an Assay Lab`;
    case 'made':
      return `make your first ${ITEMS[val]?.name ?? val}`;
    case 'license': {
      // A milestone that grants the license, or else it is bought in the Company window.
      const m = MILESTONES.find((x) => x.reward.license === val);
      return m ? `finish milestone ${m.n} (${m.name})` : 'buy the license (Company window)';
    }
  }
  return key;
}

function toolHelp(app: App): string {
  const t = app.tool;
  switch (t.kind) {
    case 'build': {
      const d = BUILDINGS[t.type];
      if (d.kind === 'belt') return `${d.name}: drag to lay a line. R rotates. Right-click cancels.`;
      if (t.type === 'foundation') return 'Foundation: drag a rectangle. Right-click cancels.';
      return `${d.name}: click to place. R rotates the output. Right-click cancels.`;
    }
    case 'remove':
      return 'Remove: click or drag a box. Everything is refunded to the depot.';
    case 'dig':
      return `Excavate: drag over rock. $${LAYERS[app.layer].digCost} per tile. Right-drag cancels.`;
    case 'survey':
      return `Survey: click a spot. Reveals deposits within ${SURVEY_RADIUS} tiles. $${LAYERS[app.layer].surveyCost}.`;
  }
  return '';
}

// ------------------------------------------------------------------ radio and toasts

function radio(app: App): void {
  const ui = app.ui;
  if (!app.radio.length) return;
  const msg = app.radio[0];
  const w = 210;
  const lines = wrapText(msg.text, w - 62);
  // Text from y+14, then a row for the button.
  const h = Math.max(56, 14 + lines.length * LINE_H + 16);
  const x = 4;
  const y = (barTop || ui.h - 54) - 4 - h;
  // Under a window the message waits, unread time not counted: the window's edge would cut it.
  if (covered(app, { x, y, w, h })) return;
  // Real seconds, whatever the display's frame rate.
  msg.t += app.dt;
  ui.panel(x, y, w, h);
  if (msg.who === 'mags') {
    ui.fill(x + 3, y + 3, 50, 50 > h - 6 ? h - 6 : 50, C.night);
    ui.sprite('p_mags', x + 4, y + 4);
    ui.text('MAGS', x + 58, y + 3, C.gold);
  } else {
    ui.text('THE BOARD', x + 58, y + 3, C.steel2);
    ui.image(iconCanvas('contract'), x + 22, y + 18);
  }
  lines.forEach((l, i) => ui.text(l, x + 58, y + 14 + i * LINE_H, C.white));
  const more = app.radio.length > 1 ? `${app.radio.length - 1} more` : 'OK';
  // As wide as its label ("5 more" is 32 px), its right edge 3 px in from the panel's.
  const bw = Math.max(31, measureText(more) + 8);
  if (ui.button(x + w - 3 - bw, y + h - 13, bw, 10, more, { tip: 'Next message' })) app.radio.shift();
  // Auto-advance long-read messages.
  if (msg.t > 14 + lines.length * 2) app.radio.shift();
}

/** Toasts go over everything but a tooltip: a window or the inspector never hides the answer to a click in it. */
function toasts(app: App): void {
  const ui = app.ui;
  const list = app.toasts.map((t) => ({ text: t.text, kind: t.kind, alpha: Math.min(1, (4.5 - t.t) * 2) }));
  if (!list.length) return;
  ui.late(() => {
    let y = 19;
    for (const t of list) {
      const w = measureText(t.text) + 12;
      const x = Math.floor(ui.w / 2 - w / 2);
      const col = t.kind === 'good' ? C.lime : t.kind === 'bad' ? C.coral : C.cyan;
      // ui.fill and ui.text set their own alpha, so draw straight to the context at the toast's fade.
      const ctx = ui.ctx;
      ctx.globalAlpha = t.alpha;
      ctx.fillStyle = C.ink;
      ctx.fillRect(x - 1, y - 1, w + 2, 13);
      ctx.fillStyle = C.panel2;
      ctx.fillRect(x, y, w, 11);
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 2, 11);
      drawText(ctx, t.text, x + 7, y + 2, C.white);
      ctx.globalAlpha = 1;
      y += 14;
    }
  });
}

// ------------------------------------------------------------------ breakthrough card

/**
 * The new layer's card. It ages here, as it is drawn: under a window it waits, its seconds not
 * counted, so it never runs out unseen (app.ts drops it after 5 s).
 */
/** The layer card's box (UI px): centred, a little above the middle of the screen. */
function layerCardRect(app: App): Rect {
  const ui = app.ui;
  const w = 220;
  const h = 46;
  return { x: Math.floor(ui.w / 2 - w / 2), y: Math.floor(ui.h * 0.28), w, h };
}

/**
 * A layer's card: a gold header over the layer's name and a line about it, between two gold rules on
 * an ink band, at alpha `a`. The breakthrough card, and the ending's climb names each layer with it.
 */
export function drawLayerCard(app: App, header: string, name: string, line: string, a: number): void {
  if (a <= 0) return;
  const ui = app.ui;
  const { x, y, w, h } = layerCardRect(app);
  // ui.fill sets (and resets) the alpha itself; the text takes it from the context.
  ui.fill(x, y, w, h, C.ink, 0.85 * a);
  ui.fill(x, y, w, 1, C.gold, a);
  ui.fill(x, y + h - 1, w, 1, C.gold, a);
  ui.ctx.globalAlpha = a;
  ui.textCenter(header, ui.w / 2, y + 5, C.gold);
  ui.textCenter(name, ui.w / 2, y + 17, C.white);
  ui.textCenter(line, ui.w / 2, y + 30, C.steel3);
  ui.ctx.globalAlpha = 1;
}

function breakthroughCard(app: App): void {
  const c = app.card!;
  const def = LAYERS[c.layer];
  if (covered(app, layerCardRect(app))) return;
  c.t += app.dt;
  const a = c.t < 0.5 ? c.t / 0.5 : c.t > 4 ? Math.max(0, (5 - c.t) / 1) : 1;
  drawLayerCard(app, 'BREAKTHROUGH', def.name.toUpperCase(), def.subtitle, a);
}

// ------------------------------------------------------------------ hover info

function hoverInfo(app: App, camX: number, camY: number): void {
  const ui = app.ui;
  const g = app.game!;
  // Over a panel (last frame's panels: this frame's aren't all drawn yet) the panel's own tips win.
  if (ui.overPrev || ui.input.uiCapture || app.dragStart) return;
  if (app.tool.kind === 'build') {
    const d = BUILDINGS[app.tool.type];
    if (!app.hoverCell) return;
    const a = app.anchor(app.tool.type, app.hoverCell);
    const chk = g.canPlace(app.tool.type, app.layer, a.x, a.y, app.dir);
    let t = d.name;
    if (!chk.ok) t += `\n${chk.reason}`;
    else if (chk.planned && chk.missing) t += `\nPlanned: depot needs ${Object.entries(chk.missing).map(([k, v]) => `${v} more ${ITEMS[k].name}`).join(', ')}`;
    if (d.needsDeposit && chk.ok) {
      const info = g.minerInfo(app.layer, a.x, a.y, d);
      if (info.ore) t += `\n${ITEMS[info.ore].name} (${PURITY_NAME[info.purity] ?? 'normal'}): ${Math.round(info.rate * 60)}/min`;
    }
    if (chk.ok && (d.kind === 'machine' || d.kind === 'miner' || d.kind === 'collector' || d.kind === 'tap')) {
      const p = predictPlacement(g, app.tool.type, app.layer, a.x, a.y);
      if (d.kind === 'tap') t += `\nWould make ${p.tapKw} kW (${p.links} machines interfering)`;
      else if (Math.abs(p.mul - 1) > 0.01) {
        const why = [p.heat ? `${p.heat === 2 ? 'hot' : 'warm'} ground` : '', p.links ? `${p.links} interfering` : '', p.spores > 0.01 ? 'spores' : ''].filter(Boolean).join(', ');
        t += `\nWould run at ${Math.round(p.mul * 100)}%${why ? ` (${why})` : ''}`;
      }
    }
    // Beside the ghost's footprint, above and to its right, so it never covers what it describes.
    const s = app.uiScale();
    const z = app.zoom;
    const size = d.size * TILE;
    ui.tooltipAt(t, { x: Math.floor(((a.x * TILE - camX) * z) / s), y: Math.floor(((a.y * TILE - camY) * z) / s), w: Math.ceil((size * z) / s), h: Math.ceil((size * z) / s) });
    return;
  }
  if (app.hovered == null) {
    // Deposit under the cursor.
    const c = app.hoverCell;
    if (!c) return;
    const L = g.layer(app.layer);
    if (c.x < 0 || c.y < 0 || c.x >= L.w || c.y >= L.h) return;
    const i = c.y * L.w + c.x;
    if (L.revealed[i] && L.ore[i]) {
      const ore = g.oreName(L.ore[i]);
      const pur = PURITY_NAME[L.purity[i]] ?? 'normal';
      ui.tooltip(`${ITEMS[ore].name} deposit (${pur})\n${ore === 'glowcap' ? 'A Fungus Harvester gathers it.' : 'Put a Miner on it.'}`);
    } else if (L.revealed[i] && L.spore[i] > 0.1 && app.overlays.spores) {
      ui.tooltip(`Spores: machines here run at ${Math.round((1 - 0.5 * L.spore[i]) * 100)}%`);
    } else if (L.revealed[i] && L.hot[i]) {
      const hot = L.hot[i] === 2;
      ui.tooltip(
        L.foundation[i]
          ? `${hot ? 'Hot' : 'Warm'} ground, covered by a foundation: no penalty, no bonus`
          : hot
            ? 'Hot ground: ordinary machines run at 50%. Smelters, Foundries and Forges at 200%.'
            : 'Warm ground: ordinary machines run at 75%. Smelters and Foundries at 150%; the Pressure Forge needs hot ground.',
      );
    } else if (L.revealed[i] && L.conduit[i]) {
      ui.tooltip(L.conduitLive[i] ? "Awake conduit: a machine with two tiles on it runs on the nodes' power, not the grid." : 'Dormant conduit: each Heartstone an Engine Node makes wakes the conduit a ring further out.');
    }
    return;
  }
  const b = g.b(app.hovered);
  if (!b || app.hovered === app.selected) return;
  const d = BUILDINGS[b.type];
  let t = d.name;
  if (b.planned) t += `\n${statusText('planned')}`;
  else if (d.kind === 'machine' || d.kind === 'miner' || d.kind === 'collector') {
    // Jammed: the good that is stuck (not the recipe), and what the machine makes.
    const jam = machineJamText(b);
    if (jam) t += `\nJammed: ${jam}`;
    else {
      t += `\n${statusText(b.status)}`;
      if (b.recipe && RECIPES[b.recipe]) t += ` - ${RECIPES[b.recipe].name}`;
      if (b.ore && d.kind !== 'machine') t += ` - ${ITEMS[b.ore].name}`;
    }
  } else if (d.kind === 'drill' || d.kind === 'heart') {
    const jam = projectJamText(b);
    if (jam) t += `\nJammed: ${jam}`;
  } else if (d.kind === 'elevator') {
    const jam = stationJamText(g, b);
    if (jam) t += `\n${jam}`;
  }
  if (b.item) t += `\nCarrying ${ITEMS[b.item.id]?.name ?? b.item.id}`;
  const headOn = headOnText(g, b);
  if (headOn) t += `\n${headOn}`;
  const turns = !d.fixed || (d.kind === 'elevator' && b.end === 0);
  t += `\nClick for details.${turns ? ' R rotates' : ''}${turns && !d.fixed ? ', Q copies.' : turns ? '.' : ''}`;
  ui.tooltip(t);
}
