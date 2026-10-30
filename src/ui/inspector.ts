// The inspector: everything about the selected building, plus its controls.
//
// Its height comes from what it draws: a measure pass lays the body out first (ui.measuring draws
// nothing and takes no clicks), then the panel is drawn to fit. When the body is taller than the room
// above the build bar it scrolls with the wheel inside a clip, beside a scrollbar, so nothing ever lands
// under the action row or outside the panel, and nothing hidden can take a click.
//
// Every number per unit of time carries its unit and says which pace it is. A machine's rows show what it
// does at the speed it runs at now: "26/min of 30" when power, spores, heat or interference slow it (of
// its full speed), a ×2 badge when hot ground speeds it up. A belt's is the most it moves; the elevator's
// and the Drill's are counted over the last minute. What a machine holds is pips, apart from its rates.

import type { App } from '../app/app';
import { BUILDINGS } from '../data/buildings';
import { ITEM_LIST, ITEMS, itemShort } from '../data/items';
import { NODE_ITEM_TIME, PURITY_NAME, WAKE_RINGS } from '../data/layers';
import { C, UIC } from '../data/palette';
import { ASSAYS, PROJECTS } from '../data/progression';
import { FUELS, RECIPES, recipesFor } from '../data/recipes';
import {
  REQUEST_ADD,
  REQUEST_MAX,
  REQUEST_STEP,
  SHAFT_FULL,
  elevatorRate,
  requestCandidates,
  requestMissing,
  requestNeed,
  requestableItems,
  requestsHeld,
  shaftTraffic,
  spareAbove,
  stationStatus,
  upgradeElevator,
  upgradeQuote,
} from '../sim/elevator';
import { HEAT_FAMILY, HEAT_FAMILY_MUL, HEAT_MUL, heatProof, heatUnder, SPORE_FILTER_RADIUS } from '../sim/env';
import { isPausable, STOCK_CAP, type Game } from '../sim/game';
import { BAY_CAP_PER_CAB, depotItem, depotUnloaders, fullGenerator, GEN_FUEL_CAP, nodeJam, nodeSequence, OUT_CAP, shaftCab } from '../sim/logistics';
import { CABLE_KW, TAP_KW, TAP_MAX } from '../sim/power';
import { liveConduitTiles, onLiveConduit } from '../sim/production';
import { CHUTE_RATE, contractPay, projectFraction, projectNeeds } from '../sim/progress';
import { DIR_NAME, leftOf, rightOf, type Building } from '../sim/types';
import { fitText, measureText, money } from './font';
import { buildBarTop, covered, depotName, headOnText, layerName, projectJamText, STACK_W, stationJamText, statusText, unlockText, upperFirst } from './hud';
import { TITLE_H, fitItemName, rateText, rateWidth, type UI } from './ui';

/** The panel's width: four action buttons with their key caps fit across it. */
const W = 188;
/** The shortest the panel gets. */
const MIN_H = 40;
/**
 * The action row's share of the panel's height: an engraved rule, then 12 px buttons whose tops sit
 * 17 px above the panel's bottom, clear of the well's lip.
 */
const ACT_H = 19;
/** An item row's icon (its 12 x 12 middle) and the gap before the name. */
const ICON_W = 14;
/** Rows holding an item icon: the icons never touch. */
const ROW_ITEM = 12;
/** Request rows: 11 px buttons with their outlines. */
const ROW_REQUEST = 13;
/** Gap before a section header. */
const GAP = 3;
/** Request rows move 50 at a time with Shift held. */
const REQUEST_BIG_STEP = 50;
/** A machine runs slowed under this share of its full speed (production.ts says 'slowed' there too). */
const SLOW = 0.98;
const FAST = 1.02;

const DEPOT_TEXT = 'Buildings on this layer are paid from this stock. Belt goods in to fill it.';
const HQ_TEXT = 'Buildings on the Surface are paid from this stock. Belt goods in to fill it.';

/** The status line's colour: what is fine, what wants a look, what is stuck. */
const STATUS_COLOR: Record<string, string> = {
  ok: UIC.good,
  slowed: UIC.warn,
  idle: UIC.soft,
  paused: UIC.dim,
  planned: UIC.power,
  no_input: UIC.warn,
  no_recipe: UIC.warn,
  blocked: UIC.bad,
  jammed: UIC.bad,
  no_power: UIC.bad,
  misplaced: UIC.bad,
};

/** Per selection: how far the body is scrolled, and whether the depot's Add row shows every item. */
const view = { id: -1, scroll: 0, moreAdd: false };

export function drawInspector(app: App): void {
  const g = app.game!;
  const b = g.b(app.selected!);
  if (!b || b.layer !== app.layer) {
    app.selected = null;
    app.inspectorRect = null;
    return;
  }
  const ui = app.ui;
  if (view.id !== b.id) {
    view.id = b.id;
    view.scroll = 0;
    view.moreAdd = false;
  }
  sampleArrivals(g);
  const d = BUILDINGS[b.type];
  // Beside the Stack, 4 px from it.
  const x = ui.w - STACK_W - 3 - 4 - W;
  const y = 19;
  const left = x + 5;
  const top = y + TITLE_H + 4;
  const actH = hasActions(b) ? ACT_H : 0;
  const bottom = Math.min(ui.h - 4, (buildBarTop() || ui.h) - 4);
  // Lay the body out without drawing it, then size the panel to it (stopping above the build bar). A
  // body too tall for the room is laid out again 6 px narrower, to leave its scrollbar room.
  let right = x + W - 5;
  let end = measure(app, b, left, right, top);
  if (end + 4 + actH > bottom) {
    right = x + W - 11;
    end = measure(app, b, left, right, top);
  }
  const h = Math.max(MIN_H, Math.min(bottom - y, end - y + 4 + actH));
  // Under a window it waits (the selection stays): the window's edge would cut its lines mid-word.
  if (covered(app, { x, y, w: W, h })) {
    app.inspectorRect = null;
    return;
  }
  ui.panel(x, y, W, h, d.name);
  app.inspectorRect = { x, y, w: W, h };
  if (ui.button(x + W - 14, y + 1, 10, 10, '', { mark: 'cross', tip: 'Close (Esc)\nA right-click on the map closes it too.' })) {
    app.selected = null;
    return;
  }
  // The body, clipped to the well (above the action row) and scrolled when it doesn't fit.
  const viewTop = y + TITLE_H + 1;
  const viewBottom = y + h - 3 - actH;
  const overflow = Math.max(0, end + 1 - viewBottom);
  view.scroll = Math.max(0, Math.min(overflow, view.scroll));
  ui.setClip({ x: x + 3, y: viewTop, w: W - 6, h: viewBottom - viewTop });
  body(app, b, left, right, top - view.scroll);
  ui.setClip(null);
  if (overflow > 0) {
    // The wheel scrolls it (a request row under the cursor takes the wheel first).
    if (ui.input.wheel && ui.hover(x, viewTop, W, viewBottom - viewTop)) {
      view.scroll = Math.max(0, Math.min(overflow, view.scroll + Math.sign(ui.input.wheel) * 20));
      ui.input.wheel = 0;
    }
    const track = viewBottom - viewTop - 2;
    ui.scrollbar(x + W - 8, viewTop + 1, track, view.scroll / overflow, track / (track + overflow));
    if (ui.hover(x + W - 9, viewTop, 6, track + 2)) ui.tooltip('Scroll with the mouse wheel');
  }
  if (actH) {
    ui.hr(x + 3, y + h - 22, W - 6);
    actions(app, b, left, y + h - 17);
  }
}

function measure(app: App, b: Building, left: number, right: number, top: number): number {
  const ui = app.ui;
  ui.measuring = true;
  try {
    return body(app, b, left, right, top);
  } finally {
    ui.measuring = false;
  }
}

/** A lower elevator station can't turn, be copied or removed: it has no action row at all. */
function hasActions(b: Building): boolean {
  const d = BUILDINGS[b.type];
  if (d.kind === 'elevator') return b.end === 0;
  return !d.fixed;
}

/**
 * Rotate, Copy, Remove and Pause, each with its key cap. Remove is the danger button and goes through
 * the App, so Ctrl+Z puts the building back.
 */
function actions(app: App, b: Building, left: number, ay: number): void {
  const g = app.game!;
  const ui = app.ui;
  const d = BUILDINGS[b.type];
  let ax = left;
  // A chute takes goods from any side, so turning it would change nothing.
  if (d.kind !== 'chute') {
    const tip = d.kind === 'elevator' ? 'Rotate (R)\nTurns the face up-cargo comes out of.' : 'Rotate (R)';
    if (ui.button(ax, ay, 47, 12, 'Rotate', { key: 'R', tip })) g.rotate(b.id);
    ax += 50;
  }
  if (d.fixed) return;
  const canCopy = g.canBuild(b.type);
  const copyTip = canCopy ? 'Copy (Q)\nBuild another one like it, facing the same way.' : "Copy (Q)\nNot unlocked: it can't be built yet.";
  if (ui.button(ax, ay, 37, 12, 'Copy', { key: 'Q', disabled: !canCopy, tip: copyTip })) {
    app.tool = { kind: 'build', type: b.type };
    app.dir = b.dir;
    app.category = d.category;
    app.selected = null;
  }
  ax += 40;
  const refund = b.planned
    ? 'Nothing was paid for the plan yet.'
    : b.rushed
      ? `Refunds what ${depotName(b.layer)} paid; the rushed goods are lost.`
      : `Its cost goes back to ${depotName(b.layer)}.`;
  if (ui.button(ax, ay, 43, 12, 'Remove', { danger: true, tip: `${b.planned ? 'Remove the plan' : 'Remove'}\n${refund} Ctrl+Z puts it back.` })) {
    app.removeBuilding(b.id);
    return;
  }
  ax += 46;
  if (!b.planned && isPausable(b.type)) {
    // A toggle: latched in while it is paused.
    const tip = b.paused ? 'Resume (P)\nIt starts working again.' : 'Pause (P)\nIt finishes what it is making, then stops and draws no power.';
    if (ui.button(ax, ay, 42, 12, 'Pause', { key: 'P', active: !!b.paused, tip })) g.setPaused(b.id, !b.paused);
  }
}

/** Everything under the title; returns the y of the line after the last one. */
function body(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const d = BUILDINGS[b.type];
  const tw = right - left;
  if (d.kind === 'machine' || d.kind === 'miner' || d.kind === 'collector' || d.kind === 'generator' || b.planned) {
    cy = statusLine(app, b, left, right, cy);
    if (!b.planned) cy = whyLines(app, b, left, right, cy);
  }
  if (b.planned) return planned(app, b, left, right, cy);
  switch (d.kind) {
    case 'machine':
      return machine(app, b, left, right, cy);
    case 'miner':
    case 'collector':
      return miner(app, b, left, right, cy);
    case 'generator':
      return generator(app, b, left, right, cy);
    case 'depot':
      return depot(app, b, left, right, cy);
    case 'terminal':
      return terminal(app, left, right, cy);
    case 'chute':
      return chute(app, left, right, cy);
    case 'elevator':
      return elevator(app, b, left, right, cy);
    case 'drill':
    case 'heart':
      return project(app, b, left, right, cy);
    case 'lab':
      return lab(app, b, left, right, cy);
    case 'engine_node':
      return engineNode(app, b, left, right, cy);
    case 'sorter':
    case 'unloader':
      return filterPicker(app, b, left, right, cy);
    case 'crate':
      return crate(app, b, left, right, cy);
    case 'tap': {
      cy += ui.para(d.blurb, left, cy, tw, UIC.soft) + GAP;
      const n = Math.min(TAP_MAX, b.links.length);
      cy = kvOf(ui, 'Machines in range', `${b.links.length}`, `${TAP_MAX}`, left, right, cy, UIC.text);
      return kvOf(ui, 'Making', `${n * TAP_KW}`, `${TAP_MAX * TAP_KW} kW`, left, right, cy, UIC.power);
    }
    case 'spore_filter':
      cy += ui.para(`Clears spores within ${SPORE_FILTER_RADIUS} tiles while powered.`, left, cy, tw, UIC.soft) + GAP;
      return kv(ui, 'Power', `${d.power} kW`, left, right, cy, UIC.power);
    case 'belt':
    case 'splitter':
    case 'crossing':
    case 'sequencer': {
      // Two belts whose heads push into each other: neither moves until one turns.
      const headOn = headOnText(g, b);
      if (headOn) cy += ui.para(headOn, left, cy, tw, UIC.bad) + GAP;
      if (d.kind !== 'belt') cy += ui.para(d.blurb, left, cy, tw, UIC.soft) + GAP;
      // A belt's speed is the most it can move: it holds one item a tile, so what it carries is its feed's pace.
      ui.text('Moves up to', left, cy, UIC.dim);
      ui.rateRight(right, cy, (d.speed ?? 1.5) * 60, UIC.text);
      if (ui.hover(left, cy - 1, tw, 10)) ui.tooltip(`Moves up to ${rateText((d.speed ?? 1.5) * 60)}\nOne item a tile: it carries as much as its line is fed, up to this.`);
      cy += 10;
      if (b.item) cy = itemKv(ui, 'Carrying', b.item.id, left, right, cy);
      if (b.item2) cy = itemKv(ui, 'Crossing it', b.item2.id, left, right, cy);
      if (d.kind === 'sequencer') {
        // seqPos 0 wants an item travelling to its right, which comes in by its left face (logistics.ts
        // insert): a fresh Sequencer takes the left first. Each side is named by compass too.
        const fromLeft = b.seqPos === 0;
        const face = DIR_NAME[fromLeft ? leftOf(b.dir) : rightOf(b.dir)];
        if (ui.hover(left, cy - 1, tw, 10)) {
          ui.tooltip(`Next from the ${fromLeft ? 'left' : 'right'}\nIt takes one item from its left (${DIR_NAME[leftOf(b.dir)]} face), then one from its right (${DIR_NAME[rightOf(b.dir)]} face), in turn; the other side waits. Out of the front (${DIR_NAME[b.dir]} face).`);
        }
        cy = kv(ui, 'Next', `from the ${fromLeft ? 'left' : 'right'}, ${face} face`, left, right, cy, UIC.title);
      }
      return cy;
    }
    default:
      return cy + ui.para(d.blurb, left, cy, tw, UIC.soft);
  }
}

// ------------------------------------------------------------------ status and speed

/** The status in its colour, and how fast it runs against full speed when that isn't 100%. */
function statusLine(app: App, b: Building, left: number, right: number, cy: number): number {
  const ui = app.ui;
  const tw = right - left;
  const st = b.planned ? 'planned' : b.status;
  const col = STATUS_COLOR[st] ?? UIC.warn;
  // A belt pushing into the front is no wrong item: say which it is (the line under it names the good).
  const label = !b.planned && b.status === 'jammed' && b.jamWhy === 'front' ? 'Jammed: a belt feeds its front' : statusText(st);
  // A stopped building says why instead; a long status goes first and the speed steps aside.
  const sp = b.speed;
  const pct = `${Math.round(sp * 100)}%`;
  const showSpeed = !b.planned && isPausable(b.type) && sp > 0.01 && (sp < SLOW || sp > FAST);
  const sw = measureText(`${pct} speed`);
  if (showSpeed && measureText(label) <= tw - sw - 6) {
    ui.text(label, left, cy, col);
    const sx = right - sw;
    const adv = ui.text(pct, sx, cy, sp < 1 ? UIC.warn : UIC.good);
    ui.text(' speed', sx + adv, cy, UIC.dim);
    if (ui.hover(sx, cy - 1, sw, 10)) ui.tooltip(`${pct} of full speed\nEverything it takes and makes runs at this pace: the rows below show it.`);
  } else ui.text(fitText(label, tw), left, cy, col);
  return cy + 11;
}

/**
 * Why it is stuck, then what sets its speed: each factor and what it does to it, as env.ts and
 * production.ts multiply them, so the player can see which one to fix.
 */
function whyLines(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const d = BUILDINGS[b.type];
  const L = g.layer(b.layer);
  const tw = right - left;
  if (b.status === 'jammed' && b.jam) {
    const name = ITEMS[b.jam]?.name ?? b.jam;
    const why = b.jamWhy === 'front' ? `${name} is pushed into its front: belts must come in from the back or the sides.` : `${name} is stuck at its input: this recipe doesn't use it. Sort it out of the line, or take it off the belt.`;
    cy += ui.para(why, left, cy, tw, UIC.bad) + 1;
  }
  if (b.status === 'misplaced') {
    let why = '';
    if (d.needsConduit && liveConduitTiles(g, b) < 2) why = 'It needs 2 of its tiles on awake conduit.';
    else if (d.needsHot && heatUnder(L, b.x, b.y, d.size) < 2) why = 'It needs hot ground: 2 tiles from magma.';
    else if (!b.ore && (d.kind === 'miner' || d.kind === 'collector')) why = 'There is no deposit under it.';
    if (why) cy += ui.para(why, left, cy, tw, UIC.bad) + 1;
  }
  // Fuel pushed straight into a generator that holds all it can: it waits for demand (Idle, no badge).
  // Its load says whether it could burn more (logistics.ts waitsOnGenerator).
  const gen = fullGenerator(g, b);
  if (gen) cy += ui.para(gen.speed < 0.99 ? 'The generator it feeds is full: it burns more when the layer needs more power.' : 'The generator it feeds is full and burning flat out: a second generator would burn the rest.', left, cy, tw, UIC.soft) + 1;
  const factors: { label: string; text: string; color: string; tip: string }[] = [];
  const pctText = (mul: number) => `${mul > 1 ? '+' : ''}${Math.round((mul - 1) * 100)}%`;
  if (d.power > 0 && !onLiveConduit(g, b) && L.power.sat < 0.99) {
    const s = L.power.sat;
    factors.push({ label: 'Power', text: pctText(s), color: UIC.bad, tip: `Power: ${Math.round(s * 100)}%\nThis layer's machines draw more power than it has, so every powered machine on it gets ${Math.round(s * 100)}% and runs that much slower.` });
  }
  if (onLiveConduit(g, b) && d.power > 0) {
    const s = L.power.poolSat;
    factors.push(s < 0.99
      ? { label: 'Conduit power', text: pctText(s), color: UIC.bad, tip: `Conduit power: ${Math.round(s * 100)}%\nThe machines on the awake conduit draw more than its nodes give.` }
      : { label: 'Conduit power', text: 'free', color: UIC.power, tip: 'Conduit power\nIt stands on an awake conduit and draws from it, not from the grid.' });
  }
  if (b.envMul < 0.99 || b.envMul > 1.01) {
    let sp = 0;
    let n = 0;
    for (let dy = 0; dy < d.size; dy++) {
      for (let dx = 0; dx < d.size; dx++) {
        sp += L.spore[(b.y + dy) * L.w + b.x + dx];
        n++;
      }
    }
    if (!d.sporeImmune && sp / n > 0.05) {
      factors.push({ label: 'Spores', text: pctText(1 - 0.5 * (sp / n)), color: UIC.bad, tip: `Spores\nSpore dust over it slows it. A Spore Filter clears spores within ${SPORE_FILTER_RADIUS} tiles.` });
    }
    const heat = heatUnder(L, b.x, b.y, d.size);
    if (heat && !heatProof(b.type) && !(d.needsHot && heat < 2)) {
      const ground = heat === 2 ? 'Hot ground' : 'Warm ground';
      const mul = d.needsHot || HEAT_FAMILY.has(b.type) ? HEAT_FAMILY_MUL[heat] : HEAT_MUL[heat];
      const tip = mul > 1 ? `${ground}\nIt works faster in the heat.` : `${ground}\nThe heat slows it. Foundations under it keep the heat off.`;
      factors.push({ label: ground, text: pctText(mul), color: mul > 1 ? UIC.good : UIC.bad, tip });
    }
    if (d.sensitive && b.links.length) {
      const n2 = b.links.length;
      factors.push({ label: `Interference (${n2} machine${n2 === 1 ? '' : 's'})`, text: pctText(Math.max(0.25, 1 - 0.25 * n2)), color: UIC.bad, tip: `Interference\n${n2 === 1 ? 'A working machine' : `${n2} working machines`} within 2 tiles ${n2 === 1 ? 'disturbs' : 'disturb'} it. Move ${n2 === 1 ? 'it' : 'them'} away, or stand a Shield Wall between.` });
    }
  }
  for (const f of factors) {
    ui.text(fitText(f.label, tw - 40), left + 6, cy, UIC.soft);
    ui.textRight(f.text, right, cy, f.color);
    if (ui.hover(left, cy - 1, tw, 10)) ui.tooltip(f.tip);
    cy += 10;
  }
  return cy;
}

// ------------------------------------------------------------------ rates, rows and pips

type Pace = 'full' | 'slow' | 'fast';

function paceOf(now: number, full: number): Pace {
  if (full <= 0) return 'full';
  const f = now / full;
  return f < SLOW ? 'slow' : f > FAST ? 'fast' : 'full';
}

/** "1.8" for a speed-up: whole when it is whole. */
function mulText(f: number): string {
  return Math.abs(f - Math.round(f)) < 0.05 ? `${Math.round(f)}` : f.toFixed(1);
}

/** How wide pace() draws. */
function paceWidth(now: number, full: number): number {
  const k = paceOf(now, full);
  if (k === 'slow') return rateWidth(now, { of: full });
  if (k === 'fast') return rateWidth(now) + 3 + measureText(`×${mulText(now / full)}`) + 4;
  return rateWidth(full);
}

/** The amount's colour for a pace: short of full speed in warn, past it in good. */
function paceColor(now: number, full: number): string {
  const k = paceOf(now, full);
  return k === 'slow' ? UIC.warn : k === 'fast' ? UIC.good : UIC.text;
}

/**
 * A pace right-aligned at xr: "30/min" at full speed, "26/min of 30" (of its full speed) slower,
 * "60/min" with a ×2 badge faster. The amount is coloured by how it compares, unless `color` is given.
 */
function pace(ui: UI, xr: number, y: number, now: number, full: number, color?: string): void {
  const x0 = xr - paceWidth(now, full);
  const k = paceOf(now, full);
  const col = color ?? paceColor(now, full);
  if (k === 'full') ui.rate(x0, y, full, col);
  else if (k === 'slow') ui.rate(x0, y, now, col, { of: full });
  else ui.pill(`×${mulText(now / full)}`, x0 + ui.rate(x0, y, now, col) + 2, y, C.green1, C.lime);
}

/** A sentence for a tooltip: "takes 26/min now; 30/min at full speed". */
function paceSentence(verb: string, now: number, full: number): string {
  if (paceOf(now, full) === 'full') return `${upperFirst(verb)} ${rateText(full)} at full speed.`;
  return `${upperFirst(verb)} ${rateText(now)} now; ${rateText(full)} at full speed.`;
}

/** An item's art (its 12 x 12 middle) on a text line at y, as the kit's counter draws it. */
function itemIcon(ui: UI, k: string, x: number, y: number, alpha = 1): void {
  ui.icon(`i_${k}`, x, y, alpha);
}

/** Buffer pips: `cap` cells, `held` of them lit, on a text line at y. */
function pips(ui: UI, x: number, y: number, held: number, cap: number, color: string): void {
  ui.segBar(x, y, pipsWidth(cap), 7, held, cap, color);
}

function pipsWidth(cap: number): number {
  return cap * 4 + 1;
}

/** A label (dim) and its value right-aligned. Returns the next line's y. */
function kv(ui: UI, label: string, value: string, left: number, right: number, cy: number, color: string = UIC.text): number {
  const lw = measureText(label);
  ui.text(label, left, cy, UIC.dim);
  ui.textRight(fitText(value, right - left - lw - 6), right, cy, color);
  return cy + 10;
}

/** A label and "15 of 80 kW": the amount in its colour, the rest dim. Returns the next line's y. */
function kvOf(ui: UI, label: string, amount: string, of: string, left: number, right: number, cy: number, color: string): number {
  ui.text(label, left, cy, UIC.dim);
  amountOf(ui, right, cy, amount, of, color);
  return cy + 10;
}

/** "15 of 80 kW" right-aligned at xr. */
function amountOf(ui: UI, xr: number, y: number, amount: string, of: string, color: string): void {
  const rest = ` of ${of}`;
  const x0 = xr - measureText(amount + rest);
  const adv = ui.text(amount, x0, y, color);
  ui.text(rest, x0 + adv, y, UIC.dim);
}

/** A label and an item: its icon and name right-aligned. */
function itemKv(ui: UI, label: string, k: string, left: number, right: number, cy: number): number {
  const lw = measureText(label);
  const name = fitItemName(k, right - left - lw - 6 - ICON_W);
  ui.text(label, left, cy, UIC.dim);
  const nx = right - measureText(name);
  itemIcon(ui, k, nx - ICON_W, cy);
  ui.text(name, nx, cy, UIC.text);
  return cy + ROW_ITEM;
}

/** Icon and name for an item row, the name cut to end 4 px before `nameEnd`. */
function itemName(ui: UI, k: string, left: number, nameEnd: number, cy: number, color: string = UIC.text, alpha = 1): void {
  itemIcon(ui, k, left, cy, alpha);
  ui.text(fitItemName(k, nameEnd - 4 - (left + ICON_W)), left + ICON_W, cy, color);
}

// ------------------------------------------------------------------ planned ghosts

/** A planned ghost: what it waits for, its place in the queue, Rush, and (underground) asking for the goods. */
function planned(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const d = BUILDINGS[b.type];
  const L = g.layer(b.layer);
  const tw = right - left;
  cy += GAP;
  cy += ui.section('Needs', left, cy, tw, { right: `in ${depotName(b.layer)}` });
  let short = false;
  for (const [k, v] of Object.entries(d.cost)) {
    const have = Math.max(0, L.stock[k] ?? 0);
    if (have < v) short = true;
    const count = `${Math.min(have, v)}/${v}`;
    itemName(ui, k, left, right - measureText(count), cy);
    ui.textRight(count, right, cy, have >= v ? UIC.good : UIC.bad);
    if (ui.hover(left, cy - 2, tw, ROW_ITEM)) ui.tooltip(`${ITEMS[k].name}\n${have >= v ? 'The depot has it.' : `The depot has ${Math.floor(have)} of the ${v} it needs.`}`);
    cy += ROW_ITEM;
  }
  const queue = g.ghostQueue(b.layer);
  const pos = queue.findIndex((q2) => q2.id === b.id);
  if (pos > 0) {
    cy += GAP;
    ui.text(`${pos} plan${pos === 1 ? '' : 's'} ahead of it`, left, cy, UIC.soft);
    const bw = measureText('Build next') + 10;
    if (ui.button(right - bw, cy - 2, bw, 12, 'Build next', { tip: "Build next\nMove it to the front of this depot's queue: it gets the goods first." })) g.buildNext(b.id);
    cy += 14;
  }
  const q = g.rushQuote(b.id);
  if (q && q.price > 0) {
    cy += GAP;
    const tip = `Rush it: ${money(q.price)}\nThe Company ships the missing goods straight to the site at 3× their value. It builds at once; rushed goods are never refunded.${g.s.money < q.price ? '\nNot enough money.' : ''}`;
    if (ui.button(left, cy, tw, 12, `Rush it: ${money(q.price)}`, { disabled: g.s.money < q.price, tip })) {
      if (!g.rush(b.id)) app.toast('Not enough money to rush it', 'bad');
    }
    cy += 15;
  }
  // Underground the depot above can send what is missing: one click adds or raises the requests.
  if (b.layer > 0 && short) {
    if (!q || q.price <= 0) cy += GAP;
    const tip = `Request the missing goods\nAdd or raise ${depotName(b.layer)}'s requests so the elevator brings what this plan lacks, counting the plans ahead of it.`;
    if (ui.button(left, cy, tw, 12, 'Request the missing goods', { tip })) {
      const set = requestMissing(g, b.id);
      const keys = Object.keys(set);
      if (keys.length) app.toast(`Requested: ${keys.map((k) => `${set[k]} ${itemShort(k)}`).join(', ')}`, 'good');
      else app.toast('The depot already requests enough of what it lacks', 'info');
    }
    cy += 15;
  }
  return cy;
}

// ------------------------------------------------------------------ machines, miners, generators

interface IoRow {
  k: string;
  /** Per minute at full speed. */
  full: number;
  /** What it holds of this good, and how many it can. */
  held: number;
  cap: number;
  pipColor: string;
  tip: string;
  /** A byproduct: the face it leaves by. */
  face?: string;
}

function machine(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const tw = right - left;
  const all = recipesFor(b.type);
  const r = b.recipe ? RECIPES[b.recipe] : null;
  if (all.length > 1) {
    cy += GAP;
    cy += ui.section('Recipe', left, cy, tw, { right: r ? r.name : 'none picked', rightColor: r ? UIC.soft : UIC.warn });
    let rx = left;
    for (const rec of all) {
      if (rx + 19 > right) {
        rx = left;
        cy += 22;
      }
      const unlocked = g.recipeUnlocked(rec.id);
      const out = Object.keys(rec.outputs)[0] ?? Object.keys(rec.side ?? {})[0];
      const tip = unlocked ? `${rec.name}\n${recipeLine(rec.id)}` : `${rec.name}\nLocked: ${unlockText(rec.unlock ?? '')}`;
      if (ui.button(rx, cy, 19, 19, '', { active: b.recipe === rec.id, disabled: !unlocked, iconSprite: `i_${out}`, tip })) g.setRecipe(b.id, rec.id);
      rx += 22;
    }
    cy += 22;
  }
  if (!r) return cy + GAP + ui.para('Pick a recipe, or just belt something in: it picks the recipe from the first thing that fits.', left, cy + GAP, tw, UIC.soft);
  // Crafts a minute at full speed; everything runs at b.speed of it (power, spores, heat, interference).
  const crafts = 60 / r.time;
  const sp = b.speed;
  const outCount = (k: string) => b.outBuf.filter((it) => it.id === k).length;
  const sideCount = (k: string) => b.sideBuf.filter((it) => it.id === k).length;
  const ins: IoRow[] = Object.entries(r.inputs).map(([k, v]) => {
    const held = b.inBuf[k] ?? 0;
    const cap = Math.max(v * 2, 4);
    // Short of a craft's worth while idle is what starves it; mid-craft an empty buffer is normal.
    const pipColor = held >= v ? UIC.good : b.active ? UIC.soft : UIC.warn;
    const tip = `${ITEMS[k].name}\n${paceSentence('takes', v * crafts * sp, v * crafts)}\nHolds ${held} (room for ${cap}); each craft takes ${v}.`;
    return { k, full: v * crafts, held, cap, pipColor, tip };
  });
  // Byproducts leave by the machine's left face: name it by compass, as the map shows it.
  const sideFace = DIR_NAME[leftOf(b.dir)];
  const outs: IoRow[] = [
    ...Object.entries(r.outputs).map(([k, v]) => ({ k, v, held: outCount(k), face: undefined as string | undefined })),
    ...Object.entries(r.side ?? {}).map(([k, v]) => ({ k, v, held: sideCount(k), face: sideFace })),
  ].map(({ k, v, held, face }) => {
    const where = face ? `It leaves by the ${face} face (the machine's left side), apart from the main output. ` : '';
    const tip = `${ITEMS[k].name}\n${where}${paceSentence('makes', v * crafts * sp, v * crafts)}\n${held} waiting to go out; it stops at ${OUT_CAP}.`;
    return { k, full: v * crafts, held, cap: OUT_CAP, pipColor: held >= OUT_CAP ? UIC.bad : UIC.soft, tip, face };
  });
  // One rate column and one pips column for both sections, so the numbers line up.
  const rows = [...ins, ...outs];
  const rateCol = Math.max(...rows.map((io) => paceWidth(io.full * sp, io.full)));
  const pipsRight = right - rateCol - 6;
  const row = (io: IoRow) => {
    const pw = pipsWidth(io.cap);
    itemIcon(ui, io.k, left, cy);
    const nameEnd = pipsRight - pw - 4;
    const name = fitItemName(io.k, nameEnd - (left + ICON_W));
    const adv = ui.text(name, left + ICON_W, cy, UIC.text);
    // A byproduct names its face after it, dim, when there is room.
    if (io.face && left + ICON_W + adv + measureText(`${io.face} face`) + 3 <= nameEnd) ui.text(`${io.face} face`, left + ICON_W + adv + 3, cy, UIC.dim);
    pips(ui, pipsRight - pw, cy, io.held, io.cap, io.pipColor);
    pace(ui, right, cy, io.full * sp, io.full);
    if (ui.hover(left, cy - 2, tw, ROW_ITEM)) ui.tooltip(io.tip);
    cy += ROW_ITEM;
  };
  if (ins.length) {
    cy += GAP;
    cy += ui.section('In', left, cy, tw);
    ins.forEach(row);
  }
  if (outs.length) {
    cy += GAP;
    cy += ui.section('Out', left, cy, tw);
    outs.forEach(row);
  }
  // The craft under way.
  ui.bar(left, cy, tw, 5, b.active ? b.craft / r.time : 0, C.gold);
  if (ui.hover(left, cy - 1, tw, 7)) ui.tooltip(b.active ? `Crafting: ${Math.floor((b.craft / r.time) * 100)}%\nA craft takes ${r.time} s at full speed.` : `Not crafting\nA craft takes ${r.time} s at full speed.`);
  cy += 9;
  if (r.powerOut) cy = kv(ui, 'Makes', `${r.powerOut} kW while running`, left, right, cy, UIC.power);
  const d = BUILDINGS[b.type];
  if (d.power > 0) cy = kv(ui, 'Power', onLiveConduit(g, b) ? `${d.power} kW from the conduit` : `${d.power} kW`, left, right, cy, UIC.power);
  return cy;
}

function recipeLine(id: string): string {
  const r = RECIPES[id];
  const ins = Object.entries(r.inputs).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(' + ');
  const outs = Object.entries(r.outputs).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(' + ');
  const side = r.side ? ' + ' + Object.entries(r.side).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(' + ') : '';
  return `${ins} → ${outs || '(heat)'}${side} in ${r.time} s`;
}

function miner(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const d = BUILDINGS[b.type];
  const tw = right - left;
  if (!b.ore) return cy;
  const collector = d.kind === 'collector';
  // A collector's rate follows the spores (production.ts): its most is in the thickest of them.
  const full = (collector ? 0.5 : b.rate) * 60;
  const now = b.rate * 60 * b.speed;
  cy += GAP;
  cy += ui.section(collector ? 'Collects' : 'Mines', left, cy, tw);
  const held = b.outBuf.length;
  const pw = pipsWidth(OUT_CAP);
  const pipsRight = right - paceWidth(now, full) - 6;
  itemName(ui, b.ore, left, pipsRight - pw, cy);
  pips(ui, pipsRight - pw, cy, held, OUT_CAP, held >= OUT_CAP ? UIC.bad : UIC.soft);
  pace(ui, right, cy, now, full);
  if (ui.hover(left, cy - 2, tw, ROW_ITEM)) {
    const pace2 = collector
      ? paceOf(now, full) === 'full' ? `Collects ${rateText(full)}: the most it can.` : `Collects ${rateText(now)} now; ${rateText(full)} in the thickest spores at full speed.`
      : paceSentence('mines', now, full);
    ui.tooltip(`${ITEMS[b.ore].name}\n${pace2}\n${held} waiting to go out; it stops at ${OUT_CAP}.`);
  }
  cy += ROW_ITEM;
  if (!collector) {
    // The purity it really mines at: its ore's best tile, as minerInfo uses it.
    const info = g.minerInfo(b.layer, b.x, b.y, d);
    cy = kv(ui, 'Deposit', `${upperFirst(PURITY_NAME[info.purity] ?? 'normal')}, ${Math.round(info.coverage * 4)}/4 tiles on ore`, left, right, cy, UIC.text);
  } else cy += ui.para('Faster in thicker spores. Spore Filters nearby stop it.', left, cy, tw, UIC.soft) + 2;
  if (d.power > 0) cy = kv(ui, 'Power', onLiveConduit(g, b) ? `${d.power} kW from the conduit` : `${d.power} kW`, left, right, cy, UIC.power);
  return cy;
}

function generator(app: App, b: Building, left: number, right: number, cy: number): number {
  const ui = app.ui;
  const tw = right - left;
  cy += GAP;
  cy += ui.section('Fuel', left, cy, tw);
  const pw = pipsWidth(GEN_FUEL_CAP);
  const kwRight = right - pw - 6;
  for (const f of Object.keys(FUELS)) {
    const held = b.inBuf[f] ?? 0;
    const kw = `${FUELS[f].power} kW`;
    itemName(ui, f, left, kwRight - measureText(kw), cy);
    ui.textRight(kw, kwRight, cy, UIC.power);
    pips(ui, right - pw, cy, held, GEN_FUEL_CAP, held > 0 ? UIC.good : UIC.soft);
    if (ui.hover(left, cy - 2, tw, ROW_ITEM)) ui.tooltip(`${ITEMS[f].name}\nEach one burns ${FUELS[f].time} s for ${kw} at full load: ${rateText(60 / FUELS[f].time)}. Holds ${held} of ${GEN_FUEL_CAP}.`);
    cy += ROW_ITEM;
  }
  cy += GAP;
  // What it makes now, of what the fuel it burns could give at full load (b.speed is its load).
  if (b.burn > 0) {
    cy = kvOf(ui, 'Making', `${Math.round(b.fuelPower * b.speed)}`, `${b.fuelPower} kW`, left, right, cy, UIC.power);
    const fuel = Object.keys(FUELS).find((f) => FUELS[f].power === b.fuelPower);
    if (fuel) {
      const full = 60 / FUELS[fuel].time;
      // Burning slower than flat out saves fuel: no warning colour for it.
      ui.text(`Burns ${ITEMS[fuel].name}`, left, cy, UIC.dim);
      pace(ui, right, cy, full * b.speed, full, UIC.text);
      if (ui.hover(left, cy - 1, tw, 10)) ui.tooltip(`Burns ${ITEMS[fuel].name}\n${rateText(full * b.speed)} now, at the load the grid asks for; ${rateText(full)} flat out.`);
      cy += 10;
    }
  } else cy = kv(ui, 'Making', 'nothing', left, right, cy, UIC.dim);
  return cy + ui.para('Only burns what the grid needs.', left, cy, tw, UIC.soft);
}

// ------------------------------------------------------------------ depots

/** Change a request row by `delta`: never above REQUEST_MAX; going down stops at one step, and the step itself removes the row. */
function stepRequest(req: Record<string, number>, k: string, delta: number, canRemove: boolean): void {
  const v = req[k] ?? 0;
  if (delta > 0) req[k] = Math.min(REQUEST_MAX, v + delta);
  else if (v <= REQUEST_STEP) {
    if (canRemove) delete req[k];
  } else req[k] = Math.max(REQUEST_STEP, v + delta);
}

function depot(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const L = g.layer(b.layer);
  const hq = b.layer === 0;
  const tw = right - left;
  cy += ui.para(hq ? HQ_TEXT : DEPOT_TEXT, left, cy, tw, UIC.soft);
  // Stock: a counter per good, cheapest first, four to a row with room for 999.
  const entries = Object.entries(L.stock)
    .filter(([, v]) => v > 0)
    .sort((a, b2) => ITEMS[a[0]].value - ITEMS[b2[0]].value);
  cy += GAP;
  cy += ui.section('Stock', left, cy, tw, { right: `up to ${STOCK_CAP} each` });
  const perRow = Math.max(1, Math.floor((tw + 4) / 44));
  const colW = Math.floor((tw + 4) / perRow);
  entries.forEach(([k, v], i) => {
    const ix = left + (i % perRow) * colW;
    const iy = cy + Math.floor(i / perRow) * ROW_ITEM;
    ui.counter(ix, iy, `i_${k}`, Math.floor(v), v >= STOCK_CAP ? UIC.warn : UIC.text);
    if (ui.hover(ix, iy - 3, colW - 2, ROW_ITEM)) {
      const req = L.requests[k];
      ui.tooltip(`${ITEMS[k].name}\n${Math.floor(v)} here${v >= STOCK_CAP ? ': full' : ''}.${req !== undefined ? ` ${hq ? 'Kept for the Surface' : 'Requested'}: ${req}.` : ''}`);
    }
  });
  if (entries.length) cy += Math.ceil(entries.length / perRow) * ROW_ITEM;
  else {
    ui.text('Empty', left, cy, UIC.dim);
    cy += 10;
  }
  // Requests: underground, what the elevator keeps here; on the HQ, a floor it never takes the HQ below.
  cy += GAP;
  const title = hq ? 'Keep for the Surface' : 'Requests from above';
  if (ui.hover(left, cy - 1, tw, 10)) {
    const how = '\nShift-click a button: 50 at a time. Mouse wheel over a row: 10.';
    ui.tooltip(
      hq
        ? `${title}\nWhen a depot below asks for these, the elevator never takes the HQ's stock below this: it is the Surface's floor (the Surface has no depot above it).${how}`
        : `${title}\nThe elevator keeps this much of each item here, taken from ${depotName(b.layer - 1)} (never below its own requests). Requested goods load first (up to half of each cab, rounded down), then belt cargo; any room left goes to more requests.${how}`,
    );
  }
  cy += ui.section(title, left, cy, tw);
  const need = hq ? {} : requestNeed(g, b.layer);
  const step = ui.input.key('Shift') ? REQUEST_BIG_STEP : REQUEST_STEP;
  // Three 11 px buttons, 3 px apart, at the right of each row.
  const bx = right - 39;
  const reqs = Object.entries(L.requests);
  if (!reqs.length) {
    ui.text(hq ? 'Nothing kept back: add a good below.' : 'Nothing requested: add a good below.', left, cy, UIC.dim);
    cy += 10;
  }
  for (const [k, v] of reqs) {
    const stock = Math.max(0, Math.floor(L.stock[k] ?? 0));
    const count = `${stock}/${v}`;
    const countRight = bx - 5;
    itemIcon(ui, k, left, cy);
    ui.text(fitText(itemShort(k), countRight - measureText(count) - 4 - (left + ICON_W)), left + ICON_W, cy, UIC.text);
    ui.textRight(count, countRight, cy, stock >= v ? UIC.good : UIC.text);
    if (ui.hover(left, cy - 3, countRight - left, ROW_REQUEST)) {
      ui.tooltip(`${ITEMS[k].name}\n${stock} here; ${hq ? 'keep' : 'requested'} ${v}.`);
    }
    if (ui.button(bx, cy - 2, 11, 11, '', { mark: 'minus', tip: v > REQUEST_STEP ? `Keep ${step} fewer (Shift: 50)` : hq ? 'Stop keeping it' : 'Stop requesting it' })) stepRequest(L.requests, k, -step, true);
    if (ui.button(bx + 14, cy - 2, 11, 11, '', { mark: 'plus', tip: `Keep ${step} more (Shift: 50)` })) stepRequest(L.requests, k, step, true);
    if (ui.button(bx + 28, cy - 2, 11, 11, '', { mark: 'cross', tip: hq ? 'Stop keeping it' : 'Stop requesting it' })) delete L.requests[k];
    // The wheel over a row moves it by 10 (and never removes it).
    if (ui.input.wheel && L.requests[k] !== undefined && ui.hover(left, cy - 3, tw, ROW_REQUEST)) {
      stepRequest(L.requests, k, -Math.sign(ui.input.wheel) * REQUEST_STEP, false);
      ui.input.wheel = 0;
    }
    cy += ROW_REQUEST;
    // Underground: say so when the depot above has none of it to spare.
    if (!hq && (need[k] ?? 0) > 0 && spareAbove(g, b.layer, k) <= 0) {
      ui.text('↑ none spare above', left + ICON_W, cy - 2, UIC.bad);
      if (ui.hover(left, cy - 3, tw, 10)) ui.tooltip(`None spare above\n${upperFirst(depotName(b.layer - 1))} has no ${ITEMS[k].name} beyond its own requests. Stock it up there, or make it down here.`);
      cy += 9;
    }
  }
  // Add: anything made and stable, deepest first; two rows, the rest behind "+N more".
  const more = requestableItems(g, b.layer);
  if (more.length) {
    cy += GAP;
    const perRow2 = Math.max(1, Math.floor((tw + 3) / 21));
    const cap = 2 * perRow2;
    const showAll = view.moreAdd || more.length <= cap;
    const shown = showAll ? more : more.slice(0, cap);
    const link = more.length > cap ? (view.moreAdd ? 'less' : `+${more.length - cap} more`) : '';
    const lw = link ? measureText(link) : 0;
    ui.section('Add', left, cy, link ? tw - lw - 4 : tw);
    if (link && ui.link(right - lw, cy, link, UIC.link, view.moreAdd ? 'Show two rows' : `${more.length - cap} more items you can ${hq ? 'keep' : 'request'}`)) view.moreAdd = !view.moreAdd;
    cy += 12;
    shown.forEach((k, i) => {
      const rx = left + (i % perRow2) * 21;
      const ry = cy + Math.floor(i / perRow2) * 21;
      const tip = `${ITEMS[k].name}\n${hq ? `Keep ${REQUEST_ADD} in the HQ` : `Request ${REQUEST_ADD}`}`;
      if (ui.button(rx, ry, 18, 18, '', { iconSprite: `i_${k}`, tip })) L.requests[k] = REQUEST_ADD;
    });
    cy += Math.ceil(shown.length / perRow2) * 21;
  }
  return cy;
}

// ------------------------------------------------------------------ selling

function terminal(app: App, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const tw = right - left;
  ui.text('Earning', left, cy, UIC.dim);
  ui.rateRight(right, cy, g.incomePerMin(), UIC.money, { money: true, sign: true });
  if (ui.hover(left, cy - 1, tw, 10)) ui.tooltip('Earning, over the last minute\nSales and contract pay from the Terminal and every Chute. Milestone rewards are not income.');
  cy += 10;
  cy = contractLines(app, left, right, cy);
  cy += GAP;
  cy += ui.para(`Sells everything belted in at full price. Contract goods earn their full share here; a Company Chute pays ${Math.round(CHUTE_RATE * 100)}% of it.`, left, cy, tw, UIC.soft) + GAP;
  const bw = measureText('Contracts') + 18 + 4;
  if (ui.button(left, cy, bw, 12, 'Contracts', { key: 'C', tip: 'Contracts (C)\nTake a contract, or see the licenses and the line.' })) app.win = 'company';
  return cy + 14;
}

function chute(app: App, left: number, right: number, cy: number): number {
  const ui = app.ui;
  cy += ui.para(`Sells anything belted in from any side, right here, at ${Math.round(CHUTE_RATE * 100)}% of its value. Contract goods count toward the contract here too, at ${Math.round(CHUTE_RATE * 100)}% of their share; the Shipping Terminal pays the full share.`, left, cy, right - left, UIC.soft);
  return contractLines(app, left, right, cy);
}

/** The running contract: progress, and what it is worth so far (Chute deliveries count CHUTE_RATE of their share). */
function contractLines(app: App, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const tw = right - left;
  const c = g.s.contracts.active;
  cy += GAP;
  cy += ui.section('Contract', left, cy, tw, c ? { right: `pays ${money(c.pay)}`, rightColor: UIC.money } : {});
  if (!c) {
    ui.text('No contract running', left, cy, UIC.soft);
    return cy + 10;
  }
  const count = `${c.delivered}/${c.count}`;
  itemName(ui, c.item, left, right - measureText(count), cy);
  ui.textRight(count, right, cy, c.delivered >= c.count ? UIC.good : UIC.text);
  cy += ROW_ITEM;
  ui.bar(left, cy, tw, 5, c.delivered / c.count, C.gold);
  cy += 9;
  if (c.chute > 0) {
    // Paid on completion: what the goods delivered so far are worth, Chute ones at their reduced share.
    cy += ui.para(`Worth ${money(contractPay(c))} so far: ${c.chute} came through a Chute, at ${Math.round(CHUTE_RATE * 100)}%.`, left, cy, tw, UIC.soft);
  }
  return cy;
}

// ------------------------------------------------------------------ elevators

function elevator(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const tw = right - left;
  const sh = g.s.shafts[b.shaft];
  if (!sh) return cy;
  const top = b.end === 0;
  const other = sh.layers[1 - b.end];
  // A belt pushing into the exit comes first, like a machine's jam: nothing on it moves.
  const jam = stationJamText(g, b);
  if (jam) cy += ui.para(jam, left, cy, tw, UIC.bad) + GAP;
  // The shaft: its tier, where it goes, and its cab.
  const adv = ui.pill(`MK${sh.tier + 1}`, left, cy);
  const cab = `cab holds ${shaftCab(sh.tier)}`;
  ui.text(fitText(`to ${layerName(other)}`, tw - adv - 2 - measureText(cab) - 6), left + adv + 2, cy, UIC.text);
  ui.textRight(cab, right, cy, UIC.dim);
  cy += 11;
  // Live traffic over the last minute, against what the cab can carry each way.
  const t = shaftTraffic(g, sh.id);
  const rate = Math.round(t.rate);
  const upFull = t.rate > 0 && t.up >= SHAFT_FULL * t.rate;
  cy += GAP;
  cy += ui.section('Traffic', left, cy, tw, { right: 'last minute' });
  const ty = cy;
  const way = (arrow: string, label: string, n: number, full: boolean) => {
    const a = ui.text(arrow, left, cy, UIC.dim);
    ui.text(label, left + a + 2, cy, UIC.text);
    ui.rateRight(right, cy, n, full ? UIC.warn : UIC.text, { of: rate });
    cy += 10;
  };
  way('↓', 'Down', t.down, t.full);
  if (t.down > 0) {
    ui.text(`${t.reqDown} requested · ${t.beltDown} off belts`, left + 8, cy, UIC.dim);
    cy += 10;
  }
  way('↑', 'Up', t.up, upFull);
  if (ui.hover(left, ty - 1, tw, cy - ty)) ui.tooltip(`Traffic over the last minute\nItems the cab carried each way, of the ${rate} a minute it can. Amber: it is running full; lower a request or upgrade the shaft.`);
  // The power cable: what flows through it now, of what it can carry.
  if (Math.abs(sh.flow) > 0.5) cy = kvOf(ui, `Cable ${sh.flow > 0 ? '↓' : '↑'}`, `${Math.round(Math.abs(sh.flow))}`, `${CABLE_KW[sh.tier]} kW`, left, right, cy, UIC.power);
  else cy = kv(ui, 'Cable', `${CABLE_KW[sh.tier]} kW, idle`, left, right, cy, UIC.power);
  // The bays: what waits to go, what has come and waits to come out.
  const st = stationStatus(g, b);
  // At the top: belt cargo the depot below can't take waits in the bay. The depot counts as full at
  // 999 with what is already on its way down (heldCargo), so part of the 999 may still be in the cab.
  const held = top ? st?.held ?? null : null;
  const bayCap = shaftCab(sh.tier) * BAY_CAP_PER_CAB;
  cy += GAP;
  cy += ui.section('Bay', left, cy, tw);
  const waiting = sh.bay[b.end].length;
  cy = kvOf(ui, `To go ${top ? 'down' : 'up'}`, `${waiting}`, `${bayCap}`, left, right, cy, held || waiting >= bayCap ? UIC.bad : UIC.text);
  if (held) {
    const name = ITEMS[held.item]?.name ?? held.item;
    const below = depotName(other);
    const hy = cy;
    cy += ui.para(`${held.count} ${name} held: ${below} is full of it (${STOCK_CAP} with what's on its way).`, left, cy, tw, UIC.bad);
    if (ui.hover(left, hy - 1, tw, cy - hy)) {
      ui.tooltip(`Waiting for room below\n${upperFirst(below)} is full of ${name}: a depot holds ${STOCK_CAP} at most, counting what is already on its way down, so the ${name} belted in here waits. It still fills the bay: once the bay is full, every belt into this station backs up. Use some ${name} down there, or stop sending it.`);
    }
  }
  // A lower station hands arrivals straight to its depot: it only holds one while the depot can't take it.
  if (top || sh.arr[b.end].length > 0) cy = kv(ui, 'Arrived, to come out', `${sh.arr[b.end].length}`, left, right, cy, st?.stalled ? UIC.bad : UIC.text);
  if (st?.stalled) {
    if (top) cy += ui.para(`Up-cargo blocked: nothing takes it at the ${st.face} face.`, left, cy, tw, UIC.bad);
    else if (st.depotFull && st.item) cy += ui.para(`Depot full: it holds ${STOCK_CAP} ${ITEMS[st.item]?.name ?? st.item}.`, left, cy, tw, UIC.bad);
    else cy += ui.para('The depot is taking nothing it brings.', left, cy, tw, UIC.bad);
  }
  cy += 2;
  const how = top
    ? `Belt items in anywhere but the front to send them down. Arrivals from below come out of the front (${DIR_NAME[b.dir]} face), in order.`
    : 'Belt items in anywhere but the front to send them up. Arrivals go straight into the depot it faces.';
  cy += ui.para(how, left, cy, tw, UIC.soft);
  // Requests waiting below: only at the top, where the cab loads them.
  if (top) {
    const n = sh.layers[1];
    const below = requestNeed(g, n);
    const wanted = Object.values(below).reduce((a, v) => a + v, 0);
    if (wanted > 0) {
      // Each request the cab can't load now is either held (the depot below is full of it, counting
      // what is on its way) or has none spare in this depot.
      const heldReq = requestsHeld(g, sh);
      cy += GAP;
      if (ui.hover(left, cy - 1, tw, 10)) {
        const why = (k: string) => (spareAbove(g, n, k) <= 0 ? ' (none spare here)' : heldReq.includes(k) ? ` (held: ${depotName(n)} is full)` : '');
        ui.tooltip(`Requested below\n${Object.entries(below).map(([k, v]) => `${v} ${ITEMS[k].name}${why(k)}`).join('\n')}`);
      }
      cy = kv(ui, 'Requested below', `${wanted} items`, left, right, cy, UIC.power);
      if (!requestCandidates(g, sh).length) {
        if (heldReq.length) {
          const what = heldReq.length === 1 ? 'that request' : 'those requests';
          const hy = cy;
          cy += ui.para(`${upperFirst(depotName(n))} is full of ${nameList(heldReq)}: the cab holds ${what} back.`, left, cy, tw, UIC.bad);
          if (ui.hover(left, hy - 1, tw, cy - hy)) {
            ui.tooltip(`Held back\nA depot holds ${STOCK_CAP} of an item at most, counting what is already on its way down. The cab sends more once ${depotName(n)} has room.`);
          }
        }
        // "None spare" only for the requests this depot really has none of beyond its own requests.
        const short = Object.keys(below).filter((k) => spareAbove(g, n, k) <= 0);
        if (short.length) {
          const above = depotName(sh.layers[0]);
          const text = heldReq.length ? `None spare in ${above}: ${nameList(short)}. Stock ${short.length === 1 ? 'it' : 'them'} here.` : `None of it is spare in ${above}: stock it here.`;
          cy += ui.para(text, left, cy, tw, UIC.bad);
        }
      }
    }
  }
  return upgrade(app, sh.id, left, right, cy);
}

/** Item names for a sentence: "Iron Plate", "Iron Plate and Gear", "Iron Plate, Gear and 2 more". */
function nameList(ids: string[]): string {
  const names = ids.map((k) => ITEMS[k]?.name ?? k);
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** The next elevator upgrade: grey until both depots and the money cover it; each good as "below + above". */
function upgrade(app: App, shaftId: number, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const tw = right - left;
  const q = upgradeQuote(g, shaftId);
  if (!q) return cy;
  const sh = g.s.shafts[shaftId];
  const lower = depotName(sh.layers[1]);
  const upper = depotName(sh.layers[0]);
  const lines = q.goods.map((x) => {
    const name = ITEMS[x.item].name;
    if (!x.ok) return `${x.need} ${name}: ${x.below} below + ${x.above} above, short by ${x.need - x.below - x.above}`;
    const from = [x.fromBelow ? `${x.fromBelow} from ${lower}` : '', x.fromAbove ? `${x.fromAbove} from ${upper}` : ''].filter(Boolean).join(', ');
    return `${x.need} ${name}: ${from}`;
  });
  const tip = `Upgrade to Mk${q.tier + 1}\nA cab holds ${shaftCab(q.tier)}: ${rateText(elevatorRate(q.tier))} each way.\nCosts ${money(q.money)}${q.moneyOk ? '' : ' (not enough money)'} and:\n${lines.join('\n')}\nEach good comes from ${lower} first; ${upper} pays the rest.`;
  cy += GAP + 2;
  if (ui.button(left, cy, tw, 12, `Upgrade to Mk${q.tier + 1}: ${money(q.money)}`, { disabled: !q.ok, tip })) {
    if (!upgradeElevator(g, shaftId)) app.toast('Not enough goods or money for the upgrade', 'bad');
  }
  cy += 15;
  cy += ui.section('Upgrade goods', left, cy, tw, { right: 'below + above' });
  for (const x of q.goods) {
    const num = `${x.below} + ${x.above}`;
    itemIcon(ui, x.item, left, cy);
    ui.text(fitText(`${x.need} ${itemShort(x.item)}`, right - measureText(num) - 4 - (left + ICON_W)), left + ICON_W, cy, x.ok ? UIC.text : UIC.bad);
    ui.textRight(num, right, cy, x.ok ? UIC.good : UIC.bad);
    cy += ROW_ITEM;
  }
  if (!q.moneyOk) cy = kv(ui, 'Money', `needs ${money(q.money)}`, left, right, cy, UIC.bad);
  return cy;
}

// ------------------------------------------------------------------ the Drill and the Heart

/** How long arrivals at the Drill or the Heart are counted over, in game seconds. */
const ARRIVE_WINDOW = 60;
/** Until the samples span this long no pace is shown: the first few would be noise. */
const ARRIVE_SETTLE = 6;

/**
 * The running project's deliveries, sampled each second the inspector is open (game seconds), for the
 * Drill's and the Heart's pace of arrivals. One history per game and project.
 */
let arrivals: { game: Game | null; project: string; hist: { t: number; got: Record<string, number> }[] } = { game: null, project: '', hist: [] };

function sampleArrivals(g: Game): void {
  const p = g.s.project;
  if (!p) return;
  const t = g.s.time;
  const last = arrivals.hist[arrivals.hist.length - 1];
  // A different game, a new project, or a clock that went back (a load): start over.
  if (arrivals.game !== g || arrivals.project !== p.id || (last && t < last.t)) arrivals = { game: g, project: p.id, hist: [] };
  const h = arrivals.hist;
  if (!h.length || t - h[h.length - 1].t >= 1) h.push({ t, got: { ...p.delivered } });
  // Keep one sample at or past the window's start, so the window spans ARRIVE_WINDOW once it can.
  while (h.length > 2 && t - h[1].t >= ARRIVE_WINDOW) h.shift();
}

/** A good's arrivals a minute over the samples, and the seconds they span; null until they span enough. */
function arrivalRate(g: Game, k: string): { perMin: number; span: number } | null {
  const h = arrivals.hist;
  if (arrivals.game !== g || h.length < 2) return null;
  const a = h[0];
  const z = h[h.length - 1];
  const span = z.t - a.t;
  if (span < ARRIVE_SETTLE) return null;
  return { perMin: (((z.got[k] ?? 0) - (a.got[k] ?? 0)) / span) * 60, span };
}

function project(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const tw = right - left;
  const p = g.s.project;
  // A belt stuck against it comes first, like a machine's status: a good it never takes, or an extra
  // its depot is too full to stack.
  const jam = projectJamText(b);
  if (jam) cy += ui.para(`Jammed: ${jam}`, left, cy, tw, UIC.bad) + GAP;
  if (!p || PROJECTS[p.id].layer !== b.layer) {
    const idle = b.type === 'drill' ? 'The rig is waiting for its next project.' : g.s.ended ? 'The Heart is awake. The mountain is running.' : 'The Heart sleeps.';
    return cy + ui.para(idle, left, cy, tw, g.s.ended && b.type === 'heart' ? UIC.title : UIC.soft);
  }
  const def = PROJECTS[p.id];
  const L = g.layer(b.layer);
  const depot = depotName(b.layer);
  const needs = projectNeeds(g);
  cy += ui.para(def.name, left, cy, tw, UIC.title) + 1;
  // The whole project at a glance.
  ui.bar(left, cy, tw, 5, projectFraction(g), C.gold);
  cy += 8;
  cy += GAP;
  cy += ui.section('Needs', left, cy, tw, { right: 'delivered' });
  // Each need as delivered/needed, its pace of arrivals beside it. A good whose need is met is still
  // taken: the crew stacks the extra in this layer's depot (a hot good cools), until that depot holds
  // STOCK_CAP of it.
  const countW = Math.max(...needs.map((n) => measureText(`${n.delivered}/${n.need}`)));
  const rateRight = right - countW - 6;
  // Arrivals show once a few seconds are counted (the column keeps its room meanwhile). A good with
  // none arriving is in coral once others arrive; before anything is fed at all, nothing is late.
  const rates = needs.map((n) => (n.delivered >= n.need ? null : arrivalRate(g, n.item)));
  const fed = needs.some((n) => n.delivered > 0);
  const rateW = Math.max(rateWidth(99), ...rates.map((r) => (r ? rateWidth(r.perMin) : 0)));
  const full: string[] = [];
  needs.forEach((n, i) => {
    const name = ITEMS[n.item]?.name ?? n.item;
    const done = n.delivered >= n.need;
    const stockId = depotItem(n.item);
    const capped = done && !!stockId && (L.stock[stockId] ?? 0) >= STOCK_CAP;
    if (capped && stockId) full.push(stockId);
    itemName(ui, n.item, left, rateRight - rateW, cy);
    const r = rates[i];
    if (!done && r) ui.rateRight(rateRight, cy, r.perMin, r.perMin > 0 ? UIC.text : fed ? UIC.bad : UIC.dim);
    ui.textRight(`${n.delivered}/${n.need}`, right, cy, capped ? UIC.bad : done ? UIC.good : UIC.text);
    if (ui.hover(left, cy - 2, tw, ROW_ITEM)) {
      // Done: how many extras the crew stacked so far (or where they would go), and a full depot.
      const cool = ITEMS[n.item]?.hot ? 'cool and ' : '';
      const sent = n.surplus ? `\n${n.surplus} extra${n.surplus === 1 ? '' : 's'} went to ${depot}.` : stockId && !capped ? `\nExtras ${cool}go to ${depot}.` : '';
      const after = !stockId ? '\nExtras are lost.' : capped ? `\n${upperFirst(depot)} is full of ${ITEMS[stockId]?.name ?? stockId}: more of it backs up on the belt.` : '';
      // An Unloader sending a finished good out of this depot loops it: each extra goes straight back
      // (DECISIONS #91). Only a good stacked as itself can go round; a cooled ingot jams instead.
      const loop = done && stockId === n.item && depotUnloaders(g, b.layer, n.item).length ? `\nIf an Unloader set to ${name} feeds ${BUILDINGS[b.type].name.replace(/^The /, 'the ')} from ${depot}, switch it off: the extras only go back there and round again.` : '';
      const span = r ? (r.span >= ARRIVE_WINDOW - 1 ? 'the last minute' : `the last ${Math.round(r.span)} s`) : '';
      const paceLine = r ? `\nArriving at ${rateText(r.perMin)} over ${span}.` : '\nTiming its arrivals.';
      ui.tooltip(done ? `${name}\nAll ${n.need} delivered.${sent}${after}${loop}` : `${name}\n${n.delivered} of ${n.need} delivered, ${n.need - n.delivered} to go.${paceLine}`);
    }
    cy += ROW_ITEM;
  });
  // A finished good its depot can't stack any more of (the jam line already says so when a belt is stuck).
  if (full.length && !(jam && b.jamWhy === 'full')) {
    cy += ui.para(`${upperFirst(depot)} is full of ${nameList(full)}: more of ${full.length === 1 ? 'it' : 'them'} belted in here backs up.`, left, cy, tw, UIC.bad) + 1;
  }
  return cy + ui.para(`Belt these in from any side, even all on one belt: extras go to ${depot}.`, left, cy, tw, UIC.soft);
}

// ------------------------------------------------------------------ the rest

function lab(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const tw = right - left;
  cy += ui.para(BUILDINGS[b.type].blurb, left, cy, tw, UIC.soft);
  cy += GAP;
  cy += ui.section('Assays', left, cy, tw, { right: 'samples' });
  for (const a of Object.values(ASSAYS)) {
    const done = g.s.assaysDone.includes(a.id);
    const n = Math.min(a.samples, g.s.assays[a.id] ?? 0);
    const seen = done || n > 0 || (g.s.stats.produced[a.id] ?? 0) > 0;
    const right2 = done ? '✓ done' : a.lab ? `${n}/${a.samples}` : 'make one';
    itemIcon(ui, a.id, left, cy, seen ? 1 : 0.25);
    ui.text(fitText(seen ? a.name : '???', right - measureText(right2) - 4 - (left + ICON_W)), left + ICON_W, cy, done ? UIC.soft : UIC.text);
    ui.textRight(right2, right, cy, done ? UIC.good : a.lab ? UIC.text : UIC.dim);
    if (ui.hover(left, cy - 2, tw, ROW_ITEM)) {
      if (done) ui.tooltip(`${a.name}\n${a.card}`);
      else if (a.lab) ui.tooltip(`${seen ? a.name : 'Unknown'}\nBelt ${a.samples} samples into the lab: ${n} so far.`);
      else ui.tooltip(`${seen ? a.name : 'Unknown'}\nNo lab work: making one is enough.`);
    }
    cy += ROW_ITEM;
  }
  return cy;
}

function engineNode(app: App, b: Building, left: number, right: number, cy: number): number {
  const ui = app.ui;
  const tw = right - left;
  const seq = nodeSequence(b);
  const ring = Math.min(b.stockCount, WAKE_RINGS);
  ui.text(b.recipe === 'waking' ? 'The Waking Node' : 'Engine Node', left, cy, UIC.title);
  ui.textRight(b.stockCount > 0 ? 'awake' : 'asleep', right, cy, b.stockCount > 0 ? UIC.good : UIC.dim);
  cy += 11;
  cy += ui.para(`Feed it this order, again and again: one item every ${NODE_ITEM_TIME} s, up to ${rateText(60 / NODE_ITEM_TIME)}.`, left, cy, tw, UIC.soft) + GAP;
  // The order as slots: done in green, the one it wants next in amber.
  seq.forEach((id, i) => {
    const sx = left + i * 23;
    ui.inset(sx, cy, 20, 20, i < b.seqPos ? C.green1 : i === b.seqPos ? C.amber : C.night);
    ui.spriteCrop(`i_${id}`, sx + 4, cy + 4, 12, 12);
    if (ui.hover(sx, cy, 20, 20)) ui.tooltip(`${ITEMS[id].name}\n${i < b.seqPos ? 'Taken.' : i === b.seqPos ? 'It wants this one next.' : 'Later in the order.'}`);
  });
  const seqW = seq.length * 23 - 3;
  // Heartstones made so far: an arrow from the order to the count.
  const hx = left + seqW + 6;
  ui.text('→', hx, cy + 6, UIC.dim);
  ui.counter(hx + 9, cy + 6, 'i_heartstone', `×${b.stockCount}`, b.stockCount > 0 ? UIC.text : UIC.dim);
  if (ui.hover(hx, cy, right - hx, 20)) ui.tooltip(`Heartstones made: ${b.stockCount}\nFour items in order make one.`);
  cy += 22;
  // The item under way: each takes NODE_ITEM_TIME.
  if (b.craft > 0) ui.bar(left, cy, seqW, 4, 1 - b.craft / NODE_ITEM_TIME, C.cyan);
  cy += 7;
  if (ui.hover(left, cy - 1, tw, 10)) ui.tooltip(`Conduit rings awake: ${ring} of ${WAKE_RINGS}\nEach Heartstone wakes its conduit a ring further out.`);
  cy = kvOf(ui, 'Conduit rings awake', `${ring}`, `${WAKE_RINGS}`, left, right, cy, ring > 0 ? UIC.good : UIC.text);
  // Why it stopped taking items, when it has: four Heartstones at its front, or four rejects at its side.
  const jam = nodeJam(b);
  if (jam.outFull) cy += ui.para('Output full: belt the Heartstones away.', left, cy, tw, UIC.bad);
  if (jam.sideFull) cy += ui.para(`Side chute full: belt the wrong items away (${jam.sideFace} face).`, left, cy, tw, UIC.bad);
  cy += 2;
  const wake = ring >= WAKE_RINGS ? 'Its whole conduit is awake.' : 'Each Heartstone wakes its conduit a ring further out.';
  return cy + ui.para(`Heartstones come out of the front (${DIR_NAME[b.dir]} face); a wrong item comes out of the ${jam.sideFace} face, cooled, and the order keeps its place. ${wake}`, left, cy, tw, UIC.soft);
}

function filterPicker(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const tw = right - left;
  const k = BUILDINGS[b.type].kind;
  cy += ui.para(k === 'sorter' ? `The chosen item turns left (${DIR_NAME[leftOf(b.dir)]} face); the rest go straight on.` : 'Pulls the chosen item out of the depot, crate or elevator behind it.', left, cy, tw, UIC.soft);
  // Candidates: items this save has seen.
  const seen = ITEM_LIST.filter((i) => (g.s.stats.produced[i.id] ?? 0) > 0 || (g.layer(b.layer).stock[i.id] ?? 0) > 0 || (g.s.stats.delivered[i.id] ?? 0) > 0);
  cy += GAP;
  const chosen = b.filter ? ITEMS[b.filter]?.name ?? b.filter : k === 'sorter' ? 'none: all straight on' : 'none: it pulls nothing';
  cy += ui.section('Item', left, cy, tw, { right: chosen, rightColor: b.filter ? UIC.text : UIC.warn });
  let rx = left;
  for (const it of seen) {
    if (rx + 18 > right) {
      rx = left;
      cy += 21;
    }
    if (ui.button(rx, cy, 18, 18, '', { active: b.filter === it.id, iconSprite: `i_${it.id}`, tip: b.filter === it.id ? `${it.name}\nChosen: click to clear it.` : it.name })) g.setFilter(b.id, b.filter === it.id ? null : it.id);
    rx += 21;
  }
  return cy + (seen.length ? 21 : 0);
}

function crate(app: App, b: Building, left: number, right: number, cy: number): number {
  const ui = app.ui;
  const tw = right - left;
  cy += ui.para(BUILDINGS[b.type].blurb, left, cy, tw, UIC.soft) + GAP;
  if (!b.stockItem) return kv(ui, 'Holds', 'nothing yet', left, right, cy, UIC.dim);
  const count = `${b.stockCount}/100`;
  itemName(ui, b.stockItem, left, right - measureText(count), cy);
  ui.textRight(count, right, cy, b.stockCount >= 100 ? UIC.warn : UIC.text);
  cy += ROW_ITEM;
  ui.bar(left, cy, tw, 5, b.stockCount / 100, C.gold);
  return cy + 8;
}
