// The in-game HUD: the top bar (money, income, the layer, power, the depot strip, the buttons),
// objectives, the Stack, the build bar with its tool help line, the radio, toasts, the breakthrough
// card and hover info.
//
// Everything is drawn with the UI kit (ui.ts, STYLE.md "UI"). The top bar and the help line are thin
// strips of readouts split by engraved rules; every rate is its number with a dim "/min" after it
// (UI.rate, rateText); every shortcut is a key cap. The tutorial's next step glows where its control
// is (guideFocus): the building's slot or its tab, or the Dig or Survey tool.

import type { App } from '../app/app';
import { BUILDING_LIST, BUILDINGS, CATEGORIES, LICENSES, type BuildingDef } from '../data/buildings';
import { ITEMS, itemShort } from '../data/items';
import { LAYERS, PURITY_NAME } from '../data/layers';
import { C, UIC } from '../data/palette';
import { MILESTONES, PROJECTS, type MilestoneDef } from '../data/progression';
import { RECIPES } from '../data/recipes';
import { beltFrame, beltTile } from '../render/belts';
import { iconCanvas } from '../render/icons';
import { TILE } from '../render/terrain';
import { heldCargo, shaftTraffic } from '../sim/elevator';
import { predictPlacement } from '../sim/env';
import { STOCK_CAP, SURVEY_RADIUS, type Game } from '../sim/game';
import { depotItem } from '../sim/logistics';
import { jamFresh } from '../sim/production';
import { currentHint, currentStep, stepProgress } from '../sim/progress';
import { T_ROCK, type Building } from '../sim/types';
import { drawText, fitText, LINE_H, measureText, money, wrapText } from './font';
import { fitItemName, keyChipWidth, keyHintWidth, rateText, rateWidth, TOP_BAR_H, type Rect, type UI } from './ui';

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
    const focus = guideFocus(app);
    drawFloats(app, camX, camY);
    topBar(app, focus);
    objectives(app);
    stack(app);
    buildBar(app, focus);
    radio(app);
    toasts(app);
    if (app.card) breakthroughCard(app);
  }
  if (app.paused) pausedPlate(app);
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

/** The free middle of the screen's top (UI px): from right of the objectives to left of the Stack or the open inspector. */
function topGap(app: App): { left: number; right: number } {
  return { left: 4 + OBJECTIVES_W + 4, right: (app.inspectorRect?.x ?? app.ui.w - STACK_W - 3) - 4 };
}

/**
 * A w px wide strip's x in the top gap: the paused plate and the toasts are centred there, one over
 * the other, so they don't cover a panel's title. One wider than the gap starts at its left, clear of
 * the objectives, and runs over the right side.
 */
function gapX(app: App, w: number): number {
  const ui = app.ui;
  const { left, right } = topGap(app);
  if (w <= right - left) return Math.floor((left + right) / 2 - w / 2);
  return Math.max(2, Math.min(left, ui.w - 2 - w));
}

/** The paused plate, under the top bar; the toasts start under it while it shows. */
const PAUSED_Y = 19;
const PAUSED_H = 13;

/** "PAUSED" under the top bar, with the key that resumes. */
function pausedPlate(app: App): void {
  const ui = app.ui;
  const label = 'Paused';
  const w = 6 + measureText(label, 'head') + 7 + keyHintWidth('Space', 'resumes') + 6;
  const x = gapX(app, w);
  ui.panel(x, PAUSED_Y, w, PAUSED_H);
  const cx = x + 6 + ui.head(label, x + 6, PAUSED_Y + 3, UIC.title) + 6;
  ui.keyHint('Space', 'resumes', cx, PAUSED_Y + 3, UIC.soft);
}

// ------------------------------------------------------------------ small pieces

/** The top bar's text line. */
const BAR_TY = 4;

/** An engraved upright rule between two of the top bar's readouts, at x. Returns where the next readout starts. */
function rule(ui: UI, x: number): number {
  ui.vr(x, 3, 9);
  return x + 6;
}

/**
 * The tutorial's pointer at a control: a pale ring just outside the button's outline that breathes
 * slowly, so it draws the eye without flashing. It fits the 1 px gap between neighbouring buttons.
 */
function guideRing(app: App, x: number, y: number, w: number, h: number): void {
  const ui = app.ui;
  const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(app.time * Math.PI * 1.6));
  ui.fill(x - 2, y - 2, w + 4, 1, C.pale, a);
  ui.fill(x - 2, y + h + 1, w + 4, 1, C.pale, a);
  ui.fill(x - 2, y - 1, 1, h + 2, C.pale, a);
  ui.fill(x + w + 1, y - 1, 1, h + 2, C.pale, a);
  // A wash over the face, fainter, so a ring on a dark slot still reads at a glance.
  ui.fill(x, y, w, h, C.pale, 0.12 * a);
}

const ICONS = new Map<string, HTMLCanvasElement>();

/** A small pixel icon from rows of colour keys, made on first use (tests load this file without a DOM). */
function pixelIcon(name: string, rows: string[], colors: Record<string, string>): HTMLCanvasElement {
  let c = ICONS.get(name);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext('2d')!;
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const col = colors[r[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  ICONS.set(name, c);
  return c;
}

// ------------------------------------------------------------------ top bar

function topBar(app: App, focus: Focus): void {
  const ui = app.ui;
  const g = app.game!;
  const s = g.s;
  const L = g.layer(app.layer);
  ui.panel(0, 0, ui.w, TOP_BAR_H);
  const ty = BAR_TY;
  let x = 4;
  // Money.
  const mx = x;
  ui.image(iconCanvas('money'), x, ty);
  x += 10;
  x += ui.text(money(s.money), x, ty, UIC.money);
  if (ui.hover(mx - 1, 1, x - mx + 1, 13)) ui.tooltip(`Money: ${money(s.money)}\nSales and contracts pay it in. Digging, surveys, rushes, licenses and upgrades spend it. Buildings are paid in goods from the depot, not money.`);
  x = rule(ui, x + 3);
  x = income(app, x);
  x = rule(ui, x + 3);
  // The layer by its key word ("FUNGAL"); its full name and depth are in the hover, so the depot strip
  // keeps the room underground.
  const def = LAYERS[app.layer];
  const lx = x;
  x += ui.head(def.short, x, ty, UIC.text);
  if (ui.hover(lx - 1, 1, x - lx + 1, 13)) ui.tooltip(`${def.name}${def.depth > 0 ? `, ${def.depth} m down` : ', on the surface'}\n[ and ] switch layers, or click one in the Stack.`);
  x = rule(ui, x + 3);
  // Power meter. Available power is what the demand is getting plus any spare (supply and imports).
  const p = L.power;
  const avail = p.demand * p.sat + Math.max(0, p.net);
  const px = x;
  ui.image(iconCanvas('power'), x, ty);
  x += 9;
  const frac = avail > 0 ? Math.min(1, p.demand / Math.max(1, avail)) : p.demand > 0 ? 1 : 0;
  const short = p.sat < 0.99;
  ui.bar(x, ty, 32, 7, frac, short ? UIC.bad : frac > 0.85 ? UIC.warn : UIC.power);
  x += 36;
  x += ui.text(`${Math.round(p.demand)}/${Math.round(Math.max(avail, p.demand * p.sat))}`, x, ty, short ? UIC.bad : UIC.text);
  x += ui.text('kW', x + 3, ty, UIC.dim) + 3;
  if (ui.hover(px - 1, 1, x - px + 1, 13)) {
    let tip = `Power on this layer\nDemand ${Math.round(p.demand)} kW, satisfied ${Math.round(p.sat * 100)}%`;
    if (app.layer === 0) tip += `\nCompany Line: ${g.lineKw()} kW`;
    if (p.genCap > 0) tip += `\nGenerators: ${Math.round(p.genUsed)}/${Math.round(p.genCap)} kW in use`;
    tip += '\nShaft cables share spare power between layers.';
    if (short) tip += '\nShort on power: every machine here runs slower.';
    ui.tooltip(tip);
  }
  x = rule(ui, x + 3);
  // Right side controls.
  let rx = ui.w - 4;
  const btn = (label: string, w: number, active: boolean, tip: string, icon?: HTMLCanvasElement): boolean => {
    rx -= w;
    const r = ui.button(rx, 2, w, 11, label, { active, tip, icon: icon ?? null });
    rx -= 3;
    return r;
  };
  if (btn('', 13, app.win === 'menu', 'Menu (Esc)', iconCanvas('menu'))) app.win = app.win === 'menu' ? null : 'menu';
  if (btn('2×', 16, app.speed === 2, 'Double speed (Tab)')) app.speed = 2;
  if (btn('1×', 16, app.speed === 1, 'Normal speed (Tab)')) app.speed = 1;
  if (btn('', 13, app.paused, app.paused ? 'Resume (Space)' : 'Pause (Space)', iconCanvas(app.paused ? 'play' : 'pause'))) app.paused = !app.paused;
  rx -= 4;
  if (btn('Help', 28, app.win === 'help', 'Help and knowledge cards (H)')) app.win = app.win === 'help' ? null : 'help';
  if (btn('Company', 44, app.win === 'company', 'Contracts, licenses and the Company Line (C)')) app.win = app.win === 'company' ? null : 'company';
  if (focus?.company) guideRing(app, rx + 3, 2, 44, 11);
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

/**
 * Income, as its own readout: a dim INCOME label, then the amount in the gain colour with a dim
 * "/min" after it, so it never reads as part of the money beside it. Returns where it ends.
 */
function income(app: App, x0: number): number {
  const ui = app.ui;
  const ipm = app.game!.incomePerMin();
  let x = x0;
  x += ui.text('INCOME', x, BAR_TY, UIC.dim) + 2;
  x += ui.rate(x, BAR_TY, ipm, ipm > 0 ? UIC.good : UIC.dim, { money: true, sign: true });
  if (ui.hover(x0 - 2, 1, x - x0 + 3, 13)) {
    ui.tooltip(`Income: ${rateText(ipm, { money: true, sign: true })}\nWhat came in over the last minute: sales at the Shipping Terminal and the Company Chutes, and contract pay. Milestone rewards add to your money, but they aren't income.`);
  }
  return x;
}

// ------------------------------------------------------------------ depot strip

/** The HQ's strip: the basics everything on the Surface is built from. */
const HQ_STRIP = ['iron_plate', 'gear', 'copper_wire', 'brick'];
const STRIP_MAX = 6;
const STRIP_GAP = 6;
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
  const entryW = (k: string) => 13 + measureText(String(count(k)));
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
    ui.counter(x, BAR_TY, `i_${k}`, n, lack[k] ? UIC.bad : n > 0 ? UIC.text : UIC.dim);
    if (ui.hover(x - 1, 1, w + 2, 13)) {
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
      const fx = x + 13;
      const fy = Math.round(21 - age * 6);
      const lit = lack[k] ? null : String(n);
      ui.late(() => {
        ui.ctx.globalAlpha = Math.max(0, 1 - age);
        if (!ui.overPanel({ x: fx - 1, y: fy, w: measureText(f.text) + 2, h: 8 })) drawText(ui.ctx, f.text, fx, fy, UIC.good, C.ink);
        else if (lit) drawText(ui.ctx, lit, fx, BAR_TY, UIC.good);
        ui.ctx.globalAlpha = 1;
      });
    }
    x += w + STRIP_GAP;
  }
}

// ------------------------------------------------------------------ objectives

/** The objectives panel's width (UI px). */
export const OBJECTIVES_W = 172;
/** Where a step's label starts in the objectives panel: past its 7 px check box at x + 5 and a 3 px gap. */
const STEP_LABEL_X = 15;
/** A step's row: a line with a check box. */
const STEP_ROW = 11;

/**
 * The room a step label gets in the objectives panel: from just right of its checkbox to the panel's
 * edge, or to the count drawn at the right ("3/10"). Labels longer than this are cut (tests/ui-labels).
 */
export function stepLabelRoom(count: string): number {
  return OBJECTIVES_W - STEP_LABEL_X - 5 - (count ? measureText(count) + 5 : 0);
}

/**
 * The hint under the steps: the current step's own (the UI path and the control for what to do next),
 * else the milestone's (progress.ts currentHint).
 */
function objectiveHint(g: Game): string | undefined {
  return currentHint(g);
}

function objectives(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const s = g.s;
  const x = 4;
  const y = 19;
  const w = OBJECTIVES_W;
  if (s.ended) {
    const h = 31;
    if (covered(app, { x, y, w, h })) return;
    ui.panel(x, y, w, h, 'The Mountain Is Awake');
    ui.text('Free play: contracts never stop.', x + 5, y + 16, UIC.soft);
    return;
  }
  const m = MILESTONES[s.milestone];
  if (!m) return;
  const eta = feedsProject(g, m) ? projectEta(app) : null;
  // Lay the body out without drawing it to size the panel, then draw it.
  ui.measuring = true;
  let end = y;
  try {
    end = objectivesBody(app, m, eta, x, y, w);
  } finally {
    ui.measuring = false;
  }
  const h = end - y + 6;
  // Under a window it waits: the window's edge would cut its lines mid-word.
  if (covered(app, { x, y, w, h })) return;
  ui.panel(x, y, w, h, `${m.n}. ${m.name}`);
  objectivesBody(app, m, eta, x, y, w);
}

/** Is this milestone's drill project the one running now (so its needs and pace show)? */
function feedsProject(g: Game, m: MilestoneDef): boolean {
  const st = m.steps.find((q) => q.kind === 'project');
  return !!st && st.kind === 'project' && g.s.project?.id === st.project;
}

/**
 * The objectives under the title: the steps (the one to do now on a lit band, done ones ticked), the
 * running project's goods and pace, then the hint. Returns the bottom row of what it drew.
 */
function objectivesBody(app: App, m: MilestoneDef, eta: Eta | null, x: number, y: number, w: number): number {
  const ui = app.ui;
  const g = app.game!;
  const now = currentStep(g);
  let cy = y + 16;
  let end = cy;
  for (const st of m.steps) {
    const sp = stepProgress(g, st);
    const cur = st === now;
    if (cur) {
      ui.fill(x + 3, cy - 2, w - 6, STEP_ROW, C.panel2);
      ui.fill(x + 3, cy - 2, 1, STEP_ROW, C.amber);
    }
    stepBox(ui, x + 5, cy, sp.done, cur);
    const count = sp.max > 1 ? `${Math.min(sp.cur, sp.max)}/${sp.max}` : '';
    const room = stepLabelRoom(count);
    ui.text(fitText(sp.label, room), x + STEP_LABEL_X, cy, sp.done ? UIC.dim : cur ? UIC.text : UIC.soft);
    if (count) ui.textRight(count, x + w - 5, cy, sp.done ? UIC.good : cur ? UIC.text : UIC.dim);
    if (ui.hover(x, cy - 2, w, STEP_ROW) && measureText(sp.label) > room) ui.tooltip(sp.label);
    end = cy + 8;
    cy += STEP_ROW;
  }
  if (eta) end = projectRows(app, eta, x, end + 3, w);
  const hint = objectiveHint(g);
  if (hint) end = hintRows(ui, hint, x, end + 3, w);
  return end;
}

/** A step's check box: ticked once done; the step to do now has an amber rim round a dark middle. */
function stepBox(ui: UI, x: number, y: number, done: boolean, cur: boolean): void {
  if (done || !cur) {
    ui.checkbox(x, y, done, UIC.good);
    return;
  }
  ui.fill(x, y, 7, 7, C.ink);
  ui.fill(x + 1, y + 1, 5, 5, C.amber);
  ui.fill(x + 2, y + 2, 3, 3, C.night);
}

/**
 * The running project's goods under a rule: each one's icon, name, delivery pace and count, then when
 * it finishes at that pace. Returns the bottom row.
 */
function projectRows(app: App, eta: Eta, x: number, y: number, w: number): number {
  const ui = app.ui;
  const p = app.game!.s.project!;
  ui.hr(x + 5, y, w - 10);
  let cy = y + 5;
  const needs = Object.entries(PROJECTS[p.id].needs);
  // The counts get one column, as wide as the widest can grow, so the paces line up down the rows.
  const countW = Math.max(...needs.map(([, v]) => measureText(`${v}/${v}`)));
  const paceR = x + w - 5 - countW - 6;
  for (const [k, v] of needs) {
    const have = Math.min(v, p.delivered[k] ?? 0);
    const done = have >= v;
    // A needed good with nothing arriving: its count in coral, and the line under the goods names it.
    const dry = eta.dry.includes(k);
    ui.icon(`i_${k}`, x + 5, cy);
    const count = `${have}/${v}`;
    ui.textRight(count, x + w - 5, cy, done ? UIC.good : dry ? UIC.bad : UIC.text);
    let nameEnd = paceR;
    const pace = eta.rates[k] ?? 0;
    if (!done && pace > 0) nameEnd = ui.rateRight(paceR, cy, pace, UIC.soft) - 5;
    ui.text(fitItemName(k, nameEnd - (x + 19)), x + 19, cy, done ? UIC.dim : UIC.soft);
    if (dry && ui.hover(x, cy - 2, w, STEP_ROW)) ui.tooltip(`${ITEMS[k].name}: no supply\nNone has arrived in the last ${duration(eta.span)}: belt some in.`);
    cy += STEP_ROW;
  }
  // The finish: a label and its value, like the rows above.
  if (eta.dry.length) {
    const label = 'No supply';
    ui.text(label, x + 5, cy, UIC.bad);
    ui.textRight(fitText(eta.dry.map(itemShort).join(', '), w - 10 - measureText(label) - 6), x + w - 5, cy, UIC.bad);
  } else if (eta.secs > 0) {
    ui.text('At this pace', x + 5, cy, UIC.dim);
    ui.textRight(duration(eta.secs), x + w - 5, cy, UIC.text);
  } else {
    ui.text(eta.note, x + 5, cy, UIC.dim);
  }
  return cy + 8;
}

/** The hint, under a rule, in the secondary colour. Returns the bottom row. */
function hintRows(ui: UI, hint: string, x: number, y: number, w: number): number {
  ui.hr(x + 5, y, w - 10);
  let cy = y + 5;
  for (const l of wrapText(hint, w - 10)) {
    ui.text(l, x + 5, cy, UIC.soft);
    cy += LINE_H;
  }
  return cy - LINE_H + 8;
}

/** The window (game seconds) each good's delivery rate is taken over: long enough for a slow good. */
const ETA_WINDOW = 120;
/** Seconds between samples of the deliveries. */
const ETA_SAMPLE = 2;
/** Until the samples span this long (game seconds) no good is called dry: the first ones are still on their way. */
const ETA_SETTLE = 10;

/** Samples of the running project's deliveries per good, for its ETA. One history per game and project. */
let etaHist: { game: Game | null; project: string; hist: { t: number; got: Record<string, number> }[] } = { game: null, project: '', hist: [] };

interface Eta {
  /** Seconds to finish at this pace, or 0 when there is no honest time to give (`note` says why). */
  secs: number;
  note: string;
  /** Needed goods with nothing arriving over `span`. */
  dry: string[];
  /** Game seconds the samples span. */
  span: number;
  /** Each unfinished good's delivery pace per minute, once it has one. */
  rates: Record<string, number>;
}

/**
 * The running project's pace: each good's rate from its own deliveries over the last ETA_WINDOW, the
 * finish time from the slowest good's, and the needed goods with nothing arriving ("dry") over the
 * game seconds the samples span. While any needed good is dry no time is given (it would be a bogus
 * short one): the dry goods are named instead.
 */
function projectEta(app: App): Eta {
  const g = app.game!;
  const p = g.s.project;
  const none: Eta = { secs: 0, note: '', dry: [], span: 0, rates: {} };
  if (!p) return none;
  const needs = Object.entries(PROJECTS[p.id].needs);
  const got: Record<string, number> = {};
  for (const [k, v] of needs) got[k] = Math.min(v, p.delivered[k] ?? 0);
  const t = g.s.time;
  // A different operation, a new project, or a clock that went back (a load): start over.
  const last = etaHist.hist[etaHist.hist.length - 1];
  if (etaHist.game !== g || etaHist.project !== p.id || (last && t < last.t)) etaHist = { game: g, project: p.id, hist: [] };
  const h = etaHist.hist;
  if (!h.length || t - h[h.length - 1].t >= ETA_SAMPLE) h.push({ t, got: { ...got } });
  // Keep one sample at or past the window's start: the window then always spans ETA_WINDOW once it can.
  while (h.length > 2 && t - h[1].t >= ETA_WINDOW) h.shift();
  const first = h[0];
  const span = t - first.t;
  const open = needs.filter(([k, v]) => got[k] < v);
  if (!open.length) return { ...none, note: 'Complete!', span };
  if (needs.every(([k]) => got[k] === 0)) return { ...none, note: 'Not being fed yet', span };
  let slowest = 0;
  const dry: string[] = [];
  const rates: Record<string, number> = {};
  for (const [k, v] of open) {
    const rate = span > 0 ? (got[k] - (first.got[k] ?? 0)) / span : 0;
    if (rate > 0) {
      slowest = Math.max(slowest, (v - got[k]) / rate);
      rates[k] = rate * 60;
    } else if (span >= ETA_SETTLE) dry.push(k);
  }
  if (dry.length) return { secs: 0, note: '', dry, span, rates };
  // A good not timed yet (the samples are only seconds old) leaves no honest ETA to give.
  if (slowest <= 0 || open.some(([k]) => got[k] === (first.got[k] ?? 0))) return { secs: 0, note: 'Timing the deliveries…', dry: [], span, rates };
  return { secs: slowest, note: '', dry: [], span, rates };
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
/** One layer's band and the 2 px of shaft under it. */
const STACK_BAND = 22;
/** An elevator readout under the Stack: its tier, then the rate down. */
const SHAFT_BOX_H = 24;

function stack(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const s = g.s;
  const w = STACK_W;
  const x = ui.w - w - 3;
  const y = 19;
  const top = y + 16;
  const h = 16 + LAYERS.length * STACK_BAND + 3;
  ui.panel(x, y, w, h);
  // Capitals at body spacing: tracked, STACK is 29 px and touches the well's lip in this 36 px column.
  ui.textCenter('STACK', x + w / 2, y + 5, UIC.dim);
  for (let i = 0; i < LAYERS.length; i++) {
    const open = g.layer(i).open;
    const cur = i === app.layer;
    const def = LAYERS[i];
    const r = { x: x + 4, y: top + i * STACK_BAND, w: w - 8, h: STACK_BAND - 2 };
    if (open) {
      // The layer's colours as a strip of rock.
      ui.fill(r.x, r.y, r.w, r.h, def.wall[1]);
      ui.fill(r.x, r.y + 3, r.w, r.h - 6, def.floor[cur ? 0 : 1]);
      // Activity dots: working machines.
      let n = 0;
      for (const b of s.buildings.values()) if (b.layer === i && b.workT < 0.5 && BUILDINGS[b.type].size >= 2) n++;
      for (let k = 0; k < Math.min(8, n); k++) ui.fill(r.x + 2 + (k % 4) * 3, r.y + 5 + Math.floor(k / 4) * 4, 2, 2, C.pale);
      // Power warning light.
      if (g.layer(i).power.sat < 0.99) ui.fill(r.x + r.w - 5, r.y + 4, 3, 3, Math.floor(app.time * 3) % 2 ? C.coral : C.crimson);
    } else {
      // Not reached: a dark slot cut into the plate.
      ui.inset(r.x, r.y, r.w, r.h, C.night);
      ui.textCenter('?', r.x + r.w / 2, r.y + 6, C.slate);
    }
    if (cur) {
      ui.fill(r.x - 1, r.y - 1, r.w + 2, 1, C.pale);
      ui.fill(r.x - 1, r.y + r.h, r.w + 2, 1, C.pale);
      ui.fill(r.x - 1, r.y, 1, r.h, C.pale);
      ui.fill(r.x + r.w, r.y, 1, r.h, C.pale);
    }
    // Shafts between bands: the cab position.
    const sh = s.shafts.find((q) => q.layers[0] === i);
    if (sh && i < LAYERS.length - 1) {
      const sx = x + w / 2;
      ui.fill(sx - 1, r.y + r.h - 2, 2, 6, C.ink);
      const cy = r.y + r.h - 2 + Math.round(sh.pos * 4);
      ui.fill(sx - 2, cy, 4, 2, C.gold);
    }
    if (ui.inside(r)) {
      ui.tooltip(open ? `${def.name}, ${def.depth > 0 ? `${def.depth} m down` : 'on the surface'}\nClick to go there. [ and ] also switch layers.` : `${def.name}: not reached yet`);
      if (open && ui.input.pressed[0]) {
        app.setLayer(i);
        ui.used = true;
      }
    }
  }
  // Elevator traffic for the shafts touching the current layer: its tier and the live rate down.
  let ty = y + h + 4;
  for (const sh of s.shafts.filter((q) => q.layers.includes(app.layer))) {
    const t = shaftTraffic(g, sh.id);
    ui.panel(x, ty, w, SHAFT_BOX_H, undefined, { frame: 'thin' });
    const tier = `MK${sh.tier + 1}`;
    ui.pill(tier, x + Math.floor(w / 2 - (measureText(tier) + 4) / 2), ty + 3, C.slate, UIC.text);
    ui.rate(x + Math.round(w / 2 - rateWidth(t.down) / 2), ty + 13, t.down, t.full ? UIC.warn : UIC.text);
    if (ui.hover(x, ty, w, SHAFT_BOX_H)) {
      let tip = `Elevator ${LAYERS[sh.layers[0]].short} – ${LAYERS[sh.layers[1]].short}, Mk${sh.tier + 1}`;
      tip += `\nDown ${rateText(t.down)} of ${Math.round(t.rate)} (requests ${t.reqDown}, belts ${t.beltDown}), up ${rateText(t.up)}, over the last minute`;
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
    ty += SHAFT_BOX_H + 4;
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
/** Between neighbouring buttons: 1 px of air between their outlines. */
const BAR_GAP = 3;
const TAB_H = 12;
const TOOL_H = 21;
/** The tool help line: a 13 px strip, and its room above the bar with the outlines and a 2 px gap. */
const HELP_H = 13;
const HELP_ROOM = 18;

type ToolKind = 'select' | 'remove' | 'dig' | 'survey';
/** What the tutorial's current step points at (guideFocus). */
type Focus = { building?: string; tab?: string; tool?: ToolKind; company?: boolean } | null;
const TOOLS: { kind: ToolKind; label: string }[] = [
  { kind: 'select', label: 'Select' },
  { kind: 'remove', label: 'Remove' },
  { kind: 'dig', label: 'Dig' },
  { kind: 'survey', label: 'Survey' },
];

interface BarLayout {
  items: BuildingDef[];
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
 * is 640 px or wider (the auto scale keeps it there): 13 buildings and the tools fit in 628 px; a
 * narrower one wraps.
 */
function barLayout(app: App): BarLayout {
  const ui = app.ui;
  const items = tabItems(app, app.category);
  const most = Math.max(1, ...CATEGORIES.map((t) => tabItems(app, t.id).length));
  // A tab: its name centred beside its key cap. A tool: its icon, then its name.
  const tabW = Math.max(...CATEGORIES.map((t) => measureText(t.name) + keyChipWidth(t.key) + 13));
  const toolW = Math.max(...TOOLS.map((t) => 14 + measureText(t.label) + 4));
  // 5 px inside the frame on each side, and 9 between the buildings and the tools for a rule.
  const fixed = 5 + 9 + 2 * toolW + BAR_GAP + 5;
  const maxRowW = Math.max(120, ui.w - 4 - fixed);
  const perRow = Math.max(1, Math.min(most, Math.floor((maxRowW + BAR_GAP) / (BAR_BW + BAR_GAP))));
  const rows = Math.max(1, Math.ceil(most / perRow));
  const tabsW = CATEGORIES.length * (tabW + BAR_GAP) - BAR_GAP;
  const rowW = Math.max(tabsW, perRow * (BAR_BW + BAR_GAP) - BAR_GAP, 120);
  const totalW = rowW + fixed;
  const x0 = Math.floor(ui.w / 2 - totalW / 2);
  const h = 4 + TAB_H + 3 + rows * (BAR_BH + BAR_GAP) - BAR_GAP + 5;
  const y0 = ui.h - h - 2;
  return { items, tabW, toolW, perRow, rowW, totalW, x0, y0, h };
}

/**
 * The top of the build bar with room for its tool help line, shown or not (UI px). Windows sit above
 * it, so picking a tool never moves an open window.
 */
export function barRoomTop(app: App): number {
  return barLayout(app).y0 - HELP_ROOM;
}

/**
 * What the tutorial's current step wants used, so the HUD can point at it: the building a build step
 * asks for (its slot, or its tab while another is open), the Dig or Survey tool, or the Company
 * button for the line upgrade. A step that moves goods points at the Conveyor until the first belt
 * is down. Nothing once the player has it in hand.
 */
function guideFocus(app: App): Focus {
  const g = app.game!;
  const st = currentStep(g);
  if (!st) return null;
  let building: string | null = null;
  let tool: ToolKind | null = null;
  if (st.kind === 'build') building = st.building;
  else if (st.kind === 'dig' || st.kind === 'reach') tool = 'dig';
  else if (st.kind === 'event' && st.event === 'surveyed') tool = 'survey';
  else if (st.kind === 'event' && st.event === 'bore_site_reached') tool = 'dig';
  else if (st.kind === 'event' && st.event === 'line_upgraded') return app.win === 'company' ? null : { company: true };
  else if ((st.kind === 'produce' || st.kind === 'sell' || st.kind === 'deliver') && !hasBelt(g)) building = 'belt';
  if (building) {
    if (!g.canBuild(building) || (app.tool.kind === 'build' && app.tool.type === building)) return null;
    const cat = BUILDINGS[building].category;
    return cat === app.category ? { building } : { tab: cat };
  }
  if (tool && app.tool.kind !== tool) return { tool };
  return null;
}

/** Has the player laid a Conveyor anywhere yet? */
function hasBelt(g: Game): boolean {
  for (const b of g.s.buildings.values()) if (b.type === 'belt') return true;
  return false;
}

function buildBar(app: App, focus: Focus): void {
  const ui = app.ui;
  const g = app.game!;
  const { items, tabW, toolW, perRow, rowW, totalW, x0, y0, h } = barLayout(app);
  // The tool help line sits just above the bar: panels that stack on the bar (Mags, the inspector) stop above it too.
  const help = helpLine(app);
  barTop = help ? y0 - HELP_ROOM : y0;
  ui.panel(x0, y0, totalW, h);
  // Category tabs, each with its number key.
  CATEGORIES.forEach((t, i) => {
    const tx = x0 + 5 + i * (tabW + BAR_GAP);
    if (ui.button(tx, y0 + 4, tabW, TAB_H, t.name, { active: app.category === t.id, key: t.key })) app.category = t.id;
    if (focus?.tab === t.id) guideRing(app, tx, y0 + 4, tabW, TAB_H);
  });
  // Buildings in the category (an empty tab says why, in the row's place).
  const sy = y0 + 4 + TAB_H + 3;
  if (!items.length) ui.text('Nothing here yet: deeper layers bring more.', x0 + 6, sy + 12, UIC.dim);
  items.forEach((d, i) => {
    const x = x0 + 5 + (i % perRow) * (BAR_BW + BAR_GAP);
    const y = sy + Math.floor(i / perRow) * (BAR_BH + BAR_GAP);
    const unlocked = g.canBuild(d.id);
    const active = app.tool.kind === 'build' && app.tool.type === d.id;
    const hov = ui.hover(x, y, BAR_BW, BAR_BH);
    // The picture sinks with the button while it is held down.
    const dy = hov && unlocked && ui.input.down[0] ? 1 : 0;
    const clicked = ui.button(x, y, BAR_BW, BAR_BH, '', { active, disabled: !unlocked });
    if (d.kind === 'belt') drawBeltIcon(app, d.id, x + 2, y + 7 + dy, unlocked);
    else ui.spriteCrop(`b_${d.id}`, x + 1, y + 1 + dy, BAR_BW - 2, BAR_BH - 2, unlocked ? 1 : 0.3);
    if (!unlocked) ui.image(iconCanvas('lock'), x + BAR_BW - 9, y + 2);
    // Tips on the bar sit beside the button, never over it.
    if (hov) ui.tooltipAt(buildTip(app, d.id), { x, y, w: BAR_BW, h: BAR_BH });
    if (focus?.building === d.id) guideRing(app, x, y, BAR_BW, BAR_BH);
    if (clicked && unlocked) app.selectBuild(d.id);
  });
  // The tools, past an engraved rule: Dig and Survey show what they would do even where they can't.
  const tx0 = x0 + 5 + rowW + 9;
  ui.vr(tx0 - 5, y0 + 4, h - 9);
  const underground = app.layer > 0;
  const rock = underground || g.layer(app.layer).terrain.some((t) => t === T_ROCK);
  TOOLS.forEach((t, i) => {
    const x = tx0 + (i % 2) * (toolW + BAR_GAP);
    const y = y0 + 4 + Math.floor(i / 2) * (TOOL_H + 4);
    const off = (t.kind === 'dig' && !rock) || (t.kind === 'survey' && !underground);
    const active = app.tool.kind === t.kind;
    if (ui.button(x, y, toolW, TOOL_H, t.label, { active, disabled: off, icon: toolIcon(t.kind) })) app.tool = { kind: t.kind };
    if (ui.hover(x, y, toolW, TOOL_H)) ui.tooltipAt(toolTip(app, t.kind, off), { x, y, w: toolW, h: TOOL_H });
    if (focus?.tool === t.kind && !off) guideRing(app, x, y, toolW, TOOL_H);
  });
  // The current tool's help line (not under a window that reaches down to it: its edge would cut the line).
  if (help) {
    const w = help.w + 12;
    const r = { x: Math.floor(ui.w / 2 - w / 2), y: y0 - HELP_ROOM + 1, w, h: HELP_H };
    if (!covered(app, r)) {
      ui.panel(r.x, r.y, r.w, r.h, undefined, { alpha: 0.92 });
      help.draw(r.x + 6, r.y + 3);
    }
  }
}

/** What a tool does and its key, for its button. A tool that can't work here says why. */
function toolTip(app: App, kind: ToolKind, off: boolean): string {
  const def = LAYERS[app.layer];
  switch (kind) {
    case 'select':
      return 'Select (Esc)\nClick a building to see what it makes, what it needs and what is wrong. Esc or a right-click brings you back here from any tool.';
    case 'remove':
      return 'Remove (X)\nClick a building, or drag a box over several, to take them down. Everything goes back to the depot, and Ctrl+Z puts the last removal back. Holding the right button on a building for half a second removes it too, in any tool but Dig.';
    case 'dig':
      if (off) return 'Dig (E)\nNo rock left to dig on the Surface. Below, the Dig tool cuts tunnels through the rock.';
      return `Dig (E)\nExcavate rock: drag over it and the crew digs it out, $${def.digCost} a tile. Tunnel to deposits and caves, or clear room to build. A right-drag over queued digging cancels it.`;
    case 'survey':
      if (off) return 'Survey (F)\nWorks underground: the Surface is in plain sight. Below, a survey shows deposits and caves through the dark.';
      return `Survey (F)\nClick a spot in the dark: deposits and caves within ${SURVEY_RADIUS} tiles show through the rock. $${def.surveyCost} a survey.`;
  }
}

/**
 * The tools' icons, all 8 x 8 so the labels after them line up: a pointer for Select, a red cross
 * for Remove, a pickaxe for Dig, an eye for Survey. Each reads on the raised face and the amber one.
 */
function toolIcon(kind: ToolKind): HTMLCanvasElement {
  switch (kind) {
    case 'select':
      return pixelIcon('tool_select', ['w.......', 'ww......', 'www.....', 'wwww....', 'wwwww...', 'www.....', 'w.ww....', '...ww...'], { w: C.white });
    case 'remove':
      return pixelIcon('tool_remove', ['........', 'c.....c.', 'cr...cr.', '.cr.cr..', '..crr...', '.cr.cr..', 'cr...cr.', 'r.....r.'], { c: C.coral, r: C.red });
    case 'dig':
      return pixelIcon('tool_dig', ['........', '..sss...', '.sttss..', 's..dhts.', '..dh..ts', '.dh....s', 'dh......', 'h.......'], { s: C.silver, t: C.steel3, d: C.earth1, h: C.earth2 });
    case 'survey':
      return pixelIcon('tool_survey', ['........', '........', '..www...', '.wcccw..', 'wcckccw.', '.wcccw..', '..www...', '........'], { w: C.white, c: C.cyan, k: C.ink });
  }
}

/**
 * A belt's slot picture: two tiles of the real belt (render/belts.ts) running east at the belt's own
 * speed, so the slot looks like what it lays and shows that a belt runs one way.
 */
function drawBeltIcon(app: App, type: string, x: number, y: number, unlocked: boolean): void {
  const ui = app.ui;
  const tile = beltTile(type, 1, 'S', beltFrame(Math.floor(app.time * 60), BUILDINGS[type].speed ?? 1.5));
  ui.ctx.globalAlpha = unlocked ? 1 : 0.3;
  ui.image(tile, x, y);
  ui.image(tile, x + TILE, y);
  ui.ctx.globalAlpha = 1;
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

// ------------------------------------------------------------------ the tool help line

/** A placement's facing (app.dir, 0 north to 3 west) as an arrow and a word. */
const DIR_ARROW = ['↑', '→', '↓', '←'];
const DIR_NAME = ['north', 'east', 'south', 'west'];
/** Pieces a drag lays as a line (app.ts LINE_TYPES, less the Foundation's rectangle). */
const DRAG_LINE = new Set(['belt', 'express_belt', 'insulated_belt', 'shield_wall', 'lamp']);

/**
 * What R turns on a building: the way a belt piece runs, or the face a machine's output leaves by.
 * Null for one whose facing changes nothing (a Lamp, a wall, a generator).
 */
function facing(type: string): 'runs' | 'output' | null {
  const k = BUILDINGS[type]?.kind;
  if (k === 'belt' || k === 'splitter' || k === 'sorter') return 'runs';
  if (k === 'miner' || k === 'collector' || k === 'unloader' || k === 'crate' || k === 'sequencer') return 'output';
  if (k === 'machine') return Object.values(RECIPES).some((r) => r.machine === type && Object.keys(r.outputs).length > 0) ? 'output' : null;
  return null;
}

/** One piece of a help line: its width, and how to draw it with its text's top at (x, y). */
interface Seg {
  w: number;
  draw: (x: number, y: number) => void;
}

/** Between two pieces: a dim dot with 4 px either side. */
const SEP_W = 9;

/** The help line's pieces for the current tool, laid end to end with dots between; null for Select. */
function helpLine(app: App): { w: number; draw: (x: number, y: number) => void } | null {
  const ui = app.ui;
  const name = (s: string): Seg => ({ w: measureText(s, 'head'), draw: (x, y) => ui.head(s, x, y, UIC.text) });
  const text = (s: string, color: string = UIC.soft): Seg => ({ w: measureText(s), draw: (x, y) => ui.text(s, x, y, color) });
  const key = (k: string, s: string): Seg => ({ w: keyHintWidth(k, s), draw: (x, y) => ui.keyHint(k, s, x, y, UIC.soft) });
  const mouse = (b: 'left' | 'right', s: string): Seg => ({
    w: 10 + measureText(s),
    draw: (x, y) => {
      ui.mouseChip(b, x, y);
      ui.text(s, x + 10, y, UIC.soft);
    },
  });
  const cost = (amount: number, s: string): Seg => {
    const m = money(amount);
    return { w: measureText(m) + 1 + measureText(s), draw: (x, y) => ui.text(s, x + ui.text(m, x, y, UIC.money), y, UIC.soft) };
  };
  // "[R] runs → east": the key, then which way, the arrow lit so it reads at a glance.
  const turn = (how: 'runs' | 'output'): Seg => {
    const arrow = DIR_ARROW[app.dir];
    const dir = DIR_NAME[app.dir];
    const kw = keyChipWidth('R') + 3;
    return {
      w: kw + measureText(how) + 4 + measureText(arrow) + 4 + measureText(dir),
      draw: (x, y) => {
        ui.keyChip('R', x, y);
        let cx = x + kw;
        cx += ui.text(how, cx, y, UIC.soft) + 3;
        cx += ui.text(arrow, cx, y, UIC.title) + 3;
        ui.text(dir, cx, y, UIC.soft);
      },
    };
  };
  // The right button is named in words as well as lit on the mouse: it used to remove, and the lit
  // corner alone is too small to tell from the left one.
  const cancel = mouse('right', 'right-click to cancel');
  const t = app.tool;
  let segs: Seg[];
  switch (t.kind) {
    case 'build': {
      const d = BUILDINGS[t.type];
      if (t.type === 'foundation') segs = [name(d.name), mouse('left', 'drag a rectangle'), cancel];
      else {
        segs = [name(d.name), mouse('left', d.kind === 'belt' ? 'drag to lay a line' : DRAG_LINE.has(t.type) ? 'click, or drag a line' : 'click to place')];
        // "[R] runs ↓ south" names the facing with its arrow, as the ghost shows it.
        const how = facing(t.type);
        if (how) segs.push(turn(how));
        segs.push(cancel);
      }
      break;
    }
    case 'remove':
      segs = [name('Remove'), mouse('left', 'click, or drag a box'), text('refunded to the depot'), key('Ctrl+Z', 'undo'), cancel];
      break;
    case 'dig':
      segs = [name('Dig'), mouse('left', 'drag over rock to excavate it'), cost(LAYERS[app.layer].digCost, ' a tile'), cancel];
      break;
    case 'survey':
      segs = [name('Survey'), mouse('left', `click a spot: ore and caves within ${SURVEY_RADIUS} tiles show`), cost(LAYERS[app.layer].surveyCost, ' a survey'), cancel];
      break;
    default:
      return null;
  }
  const w = segs.reduce((a, s) => a + s.w, 0) + (segs.length - 1) * SEP_W;
  return {
    w,
    draw: (x, y) => {
      let cx = x;
      segs.forEach((s, i) => {
        if (i > 0) {
          ui.text('·', cx + 4, y, UIC.dim);
          cx += SEP_W;
        }
        s.draw(cx, y);
        cx += s.w;
      });
    },
  };
}

// ------------------------------------------------------------------ radio and toasts

function radio(app: App): void {
  const ui = app.ui;
  if (!app.radio.length) return;
  const msg = app.radio[0];
  const w = 214;
  const x = 4;
  // The text column, right of the portrait's slot.
  const tx = x + 61;
  const tw = x + w - 5 - tx;
  const lines = wrapText(msg.text, tw);
  // The name at y + 5, the text from y + 17, then the button's row.
  const h = Math.max(60, 17 + lines.length * LINE_H + 19);
  const y = (barTop || ui.h - 54) - 4 - h;
  // Under a window the message waits, unread time not counted: the window's edge would cut it.
  if (covered(app, { x, y, w, h })) return;
  // Real seconds, whatever the display's frame rate.
  msg.t += app.dt;
  ui.panel(x, y, w, h);
  ui.inset(x + 4, y + 4, 52, 52, C.night);
  if (msg.who === 'mags') {
    ui.sprite('p_mags', x + 6, y + 6);
    ui.section('Mags', tx, y + 5, tw, { color: UIC.head });
  } else {
    ui.image(iconCanvas('contract'), x + 27, y + 27);
    ui.section('The Board', tx, y + 5, tw, { color: UIC.soft });
  }
  lines.forEach((l, i) => ui.text(l, tx, y + 17 + i * LINE_H, UIC.text));
  const more = app.radio.length > 1 ? `Next (${app.radio.length - 1} more)` : 'OK';
  // As wide as its label, its right edge on the text column's.
  const bw = Math.max(30, measureText(more) + 10);
  if (ui.button(x + w - 5 - bw, y + h - 17, bw, 12, more, { tip: app.radio.length > 1 ? 'Next message' : 'Done' })) app.radio.shift();
  // Auto-advance long-read messages.
  if (msg.t > 14 + lines.length * 2) app.radio.shift();
}

/** Toasts go over everything but a tooltip: a window or the inspector never hides the answer to a click in it. */
function toasts(app: App): void {
  const ui = app.ui;
  const list = app.toasts.map((t) => ({ text: t.text, kind: t.kind, alpha: Math.min(1, (4.5 - t.t) * 2) }));
  if (!list.length) return;
  ui.late(() => {
    const ctx = ui.ctx;
    const box = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    // A long toast wraps to the gap between the objectives and the Stack or the inspector, instead of
    // running over the inspector's lines for its few seconds.
    const { left, right } = topGap(app);
    const room = Math.max(140, right - left - 19);
    let y = app.paused ? PAUSED_Y + PAUSED_H + 5 : PAUSED_Y;
    for (const t of list) {
      const col = t.kind === 'good' ? UIC.good : t.kind === 'bad' ? UIC.bad : UIC.power;
      const mark = t.kind === 'good' ? '✓' : t.kind === 'bad' ? '!' : '•';
      // A mark in its colour on a strip of it, then the text: what happened reads before what it says.
      const lines = wrapText(t.text, room);
      const w = 13 + Math.max(...lines.map((l) => measureText(l))) + 6;
      const h = 3 + lines.length * LINE_H;
      const x = gapX(app, w);
      // ui.fill and ui.text set their own alpha, so draw straight to the context at the toast's fade.
      ctx.globalAlpha = t.alpha;
      box(x - 1, y - 1, w + 2, h + 2, C.ink);
      box(x, y, w, h, C.panel);
      box(x, y, w - 1, 1, C.steel);
      box(x, y + 1, 1, h - 2, C.steel);
      box(x + 1, y + h - 1, w - 1, 1, C.panel2);
      box(x + w - 1, y, 1, h - 1, C.panel2);
      box(x + 1, y + 1, 9, h - 2, C.panel2);
      box(x + 1, y + 1, 1, h - 2, col);
      drawText(ctx, mark, x + 6 - Math.floor(measureText(mark) / 2), y + 3, col);
      lines.forEach((l, i) => drawText(ctx, l, x + 13, y + 3 + i * LINE_H, UIC.text));
      ctx.globalAlpha = 1;
      y += h + 4;
    }
  });
}

// ------------------------------------------------------------------ breakthrough card

/** The layer card's box (UI px): centred, a little above the middle of the screen. */
function layerCardRect(app: App): Rect {
  const ui = app.ui;
  const w = 220;
  const h = 46;
  return { x: Math.floor(ui.w / 2 - w / 2), y: Math.floor(ui.h * 0.28), w, h };
}

/**
 * A layer's card: a header over the layer's name, stamped in the heading style, and a line about it,
 * between two gold rules on an ink band, at alpha `a`. The breakthrough card, and the ending's climb
 * names each layer with it.
 */
export function drawLayerCard(app: App, header: string, name: string, line: string, a: number): void {
  if (a <= 0) return;
  const ui = app.ui;
  const { x, y, w, h } = layerCardRect(app);
  // ui.fill sets (and resets) the alpha itself; the text takes it from the context.
  ui.fill(x, y, w, h, C.ink, 0.85 * a);
  // Each rule has its shadow under it, like the edge of a brass plate.
  ui.fill(x, y, w, 1, C.gold, a);
  ui.fill(x, y + 1, w, 1, C.rust0, a);
  ui.fill(x, y + h - 2, w, 1, C.gold, a);
  ui.fill(x, y + h - 1, w, 1, C.rust0, a);
  ui.ctx.globalAlpha = a;
  ui.textCenter(header, ui.w / 2, y + 6, UIC.head, undefined, 'head');
  ui.textCenter(name, ui.w / 2, y + 18, UIC.text, C.ink, 'head');
  ui.textCenter(line, ui.w / 2, y + 31, UIC.soft);
  ui.ctx.globalAlpha = 1;
}

/**
 * The new layer's card. It ages here, as it is drawn: under a window it waits, its seconds not
 * counted, so it never runs out unseen (app.ts drops it after 5 s).
 */
function breakthroughCard(app: App): void {
  const c = app.card!;
  const def = LAYERS[c.layer];
  if (covered(app, layerCardRect(app))) return;
  c.t += app.dt;
  const a = c.t < 0.5 ? c.t / 0.5 : c.t > 4 ? Math.max(0, (5 - c.t) / 1) : 1;
  drawLayerCard(app, 'Breakthrough', def.name, def.subtitle, a);
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
      if (info.ore) t += `\n${ITEMS[info.ore].name} (${PURITY_NAME[info.purity] ?? 'normal'}): ${rateText(info.rate * 60)}`;
    }
    if (chk.ok && (d.kind === 'machine' || d.kind === 'miner' || d.kind === 'collector' || d.kind === 'tap')) {
      const p = predictPlacement(g, app.tool.type, app.layer, a.x, a.y);
      if (d.kind === 'tap') t += `\nWould make ${p.tapKw} kW (${p.links} machines interfering)`;
      else if (Math.abs(p.mul - 1) > 0.01) {
        const why = [p.heat ? `${p.heat === 2 ? 'hot' : 'warm'} ground` : '', p.links ? `${p.links} interfering` : '', p.spores > 0.01 ? 'spores' : ''].filter(Boolean).join(', ');
        t += `\nWould run at ${Math.round(p.mul * 100)}%${why ? ` (${why})` : ''}`;
      }
    }
    // Which way it faces, beside the ghost where the eye already is.
    const how = facing(app.tool.type);
    if (how) t += `\n${how === 'runs' ? 'Runs' : 'Output'} ${DIR_ARROW[app.dir]} ${DIR_NAME[app.dir]} (R turns it)`;
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
    } else if (L.revealed[i] && L.terrain[i] === T_ROCK && app.tool.kind === 'select' && g.s.stats.dug === 0) {
      // Until the first dig, rock says that it can be dug: nothing else on the map does.
      ui.tooltip(`Rock\nThe Dig tool (E) excavates it: drag over rock, $${LAYERS[app.layer].digCost} a tile.`);
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
      if (b.recipe && RECIPES[b.recipe]) t += ` · ${RECIPES[b.recipe].name}`;
      if (b.ore && d.kind !== 'machine') t += ` · ${ITEMS[b.ore].name}`;
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
  // What a click and the keys do here, in the tool in hand: with Remove a click takes it down.
  const turns = !d.fixed || (d.kind === 'elevator' && b.end === 0);
  const keys = `${turns ? 'R rotates' : ''}${turns && !d.fixed ? ', Q copies' : ''}`;
  if (app.tool.kind === 'remove') t += d.fixed ? '\nFixed in place: it can\'t be removed.' : '\nClick to remove it: refunded to the depot, Ctrl+Z puts it back.';
  else if (app.tool.kind === 'select') t += `\nClick for details.${keys ? ` ${keys}.` : ''}`;
  else if (keys) t += `\n${keys}.`;
  ui.tooltip(t);
}
