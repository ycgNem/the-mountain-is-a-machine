// The inspector: everything about the selected building, plus its controls.
//
// Its height comes from what it draws: a measure pass lays the body out first (ui.measuring draws
// nothing and takes no clicks), then the panel is drawn to fit. When the body is taller than the room
// above the build bar it scrolls with the wheel inside a clip, so nothing ever lands under the action
// row or outside the panel, and nothing hidden can take a click.

import type { App } from '../app/app';
import { BUILDINGS } from '../data/buildings';
import { ITEM_LIST, ITEMS, itemShort } from '../data/items';
import { NODE_ITEM_TIME, PURITY_NAME, WAKE_RINGS } from '../data/layers';
import { C } from '../data/palette';
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
import { HEAT_FAMILY, heatProof, heatUnder } from '../sim/env';
import { isPausable, STOCK_CAP } from '../sim/game';
import { depotItem, depotUnloaders, fullGenerator, nodeJam, nodeSequence, shaftCab } from '../sim/logistics';
import { CABLE_KW } from '../sim/power';
import { liveConduitTiles, onLiveConduit } from '../sim/production';
import { CHUTE_RATE, contractPay, projectNeeds } from '../sim/progress';
import { DIR_NAME, leftOf, rightOf, type Building } from '../sim/types';
import { fitText, measureText, money } from './font';
import { buildBarTop, covered, depotName, headOnText, layerName, projectJamText, stationJamText, statusText, unlockText, upperFirst } from './hud';

const W = 172;
/** Text width inside the panel. */
const TW = W - 10;
/** Request rows move 50 at a time with Shift held. */
const REQUEST_BIG_STEP = 50;

const DEPOT_TEXT = 'Buildings on this layer are paid from this stock. Belt goods in to fill it.';
const HQ_TEXT = 'Buildings on the Surface are paid from this stock. Belt goods in to fill it.';

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
  const d = BUILDINGS[b.type];
  const x = ui.w - 36 - 3 - 4 - W;
  const y = 19;
  const left = x + 5;
  const right = x + W - 5;
  const top = y + 16;
  // Lay the body out without drawing it, then size the panel to it (stopping above the build bar).
  ui.measuring = true;
  let end = top;
  try {
    end = body(app, b, left, right, top);
  } finally {
    ui.measuring = false;
  }
  const actH = hasActions(b) ? 15 : 0;
  const bottom = Math.min(ui.h - 4, (buildBarTop() || ui.h) - 4);
  const h = Math.max(48, Math.min(bottom - y, end - top + 16 + 3 + actH));
  // Under a window it waits (the selection stays): the window's edge would cut its lines mid-word.
  if (covered(app, { x, y, w: W, h })) {
    app.inspectorRect = null;
    return;
  }
  ui.panel(x, y, W, h, d.name);
  app.inspectorRect = { x, y, w: W, h };
  if (ui.button(x + W - 12, y + 1, 10, 10, 'x', { tip: 'Close (Esc)' })) {
    app.selected = null;
    return;
  }
  // The body, clipped to the panel (above the action row) and scrolled when it doesn't fit.
  const viewTop = y + 13;
  const viewBottom = y + h - actH - 2;
  const overflow = Math.max(0, end + 1 - viewBottom);
  view.scroll = Math.max(0, Math.min(overflow, view.scroll));
  ui.setClip({ x: x + 1, y: viewTop, w: W - 2, h: viewBottom - viewTop });
  body(app, b, left, right, top - view.scroll);
  ui.setClip(null);
  if (overflow > 0) {
    // The wheel scrolls it (a request row under the cursor takes the wheel first).
    if (ui.input.wheel && ui.hover(x, viewTop, W, viewBottom - viewTop)) {
      view.scroll = Math.max(0, Math.min(overflow, view.scroll + Math.sign(ui.input.wheel) * 20));
      ui.input.wheel = 0;
    }
    const track = viewBottom - viewTop - 2;
    const thumb = Math.max(8, Math.round((track * track) / (track + overflow)));
    ui.fill(x + W - 3, viewTop + 1, 2, track, C.night);
    ui.fill(x + W - 3, viewTop + 1 + Math.round(((track - thumb) * view.scroll) / overflow), 2, thumb, C.steel);
    if (ui.hover(x + W - 5, viewTop, 5, track)) ui.tooltip('Scroll with the mouse wheel');
  }
  if (actH) actions(app, b, left, y + h - 14);
}

/** A lower elevator station can't turn, be copied or removed: it has no action row at all. */
function hasActions(b: Building): boolean {
  const d = BUILDINGS[b.type];
  if (d.kind === 'elevator') return b.end === 0;
  return !d.fixed;
}

function actions(app: App, b: Building, left: number, ay: number): void {
  const g = app.game!;
  const ui = app.ui;
  const d = BUILDINGS[b.type];
  let ax = left;
  // A chute takes goods from any side, so turning it would change nothing.
  if (d.kind !== 'chute') {
    const tip = d.kind === 'elevator' ? 'Rotate (R): the face up-cargo comes out of' : 'Rotate (R)';
    if (ui.button(ax, ay, 40, 11, 'Rotate', { tip })) g.rotate(b.id);
    ax += 43;
  }
  if (d.fixed) return;
  if (ui.button(ax, ay, 34, 11, 'Copy', { tip: 'Copy this building (Q)' })) {
    app.tool = { kind: 'build', type: b.type };
    app.dir = b.dir;
    app.category = d.category;
    app.selected = null;
  }
  ax += 37;
  if (ui.button(ax, ay, 44, 11, 'Remove', { danger: true, tip: b.planned ? 'Remove the plan (nothing was paid yet)' : b.rushed ? 'Remove (refunds what the depot paid; rushed goods are lost)' : 'Remove (full refund)' })) {
    g.remove(b.layer, b.x, b.y);
    app.selected = null;
    return;
  }
  ax += 47;
  if (!b.planned && isPausable(b.type)) {
    if (ui.button(ax, ay, 38, 11, b.paused ? 'Resume' : 'Pause', { active: !!b.paused, tip: b.paused ? 'Start crafting again (P)' : 'Finish the current craft, then stop and draw no power (P)' })) g.setPaused(b.id, !b.paused);
  }
}

/** Everything under the title; returns the y after the last line. */
function body(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const d = BUILDINGS[b.type];
  // Status line.
  if (d.kind === 'machine' || d.kind === 'miner' || d.kind === 'collector' || d.kind === 'generator' || b.planned) {
    const col = b.status === 'ok' ? C.lime : b.status === 'idle' ? C.steel3 : b.status === 'slowed' ? C.cyan : b.planned ? C.cyan : C.gold;
    // A belt pushing into the front is no wrong item: say which it is (the line under it names the good).
    const label = !b.planned && b.status === 'jammed' && b.jamWhy === 'front' ? 'Jammed: a belt feeds its front' : statusText(b.planned ? 'planned' : b.status);
    // The speed shows beside the status when both fit (a long status like "Jammed" goes first).
    const showSpeed = !b.planned && isPausable(b.type) && measureText(label) <= TW - 26;
    ui.text(fitText(label, TW), left, cy, col);
    if (showSpeed) ui.textRight(`${Math.round(b.speed * 100)}%`, right, cy, C.steel3);
    cy += 11;
    if (!b.planned) cy = speedBreakdown(app, b, left, cy);
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
      return terminal(app, left, cy);
    case 'chute':
      return chute(app, left, cy);
    case 'elevator':
      return elevator(app, b, left, right, cy);
    case 'drill':
    case 'heart':
      return project(app, b, left, right, cy);
    case 'lab':
      return lab(app, left, right, cy);
    case 'engine_node':
      return engineNode(app, b, left, right, cy);
    case 'sorter':
    case 'unloader':
      return filterPicker(app, b, left, right, cy);
    case 'crate':
      ui.text(b.stockItem ? `${ITEMS[b.stockItem].name}: ${b.stockCount}/100` : 'Empty', left, cy, C.white);
      return cy + 12;
    case 'tap':
      ui.text(`${b.links.length} machines interfering`, left, cy, C.white);
      cy += 10;
      ui.text(`Making ${20 * Math.min(6, b.links.length)} kW`, left, cy, C.cyan);
      return cy + 12;
    case 'spore_filter':
      return cy + ui.para('Clears spores within 6 tiles while powered.', left, cy, TW, C.steel3) + 2;
    case 'belt':
    case 'splitter':
    case 'crossing':
    case 'sequencer': {
      // Two belts whose heads push into each other: neither moves until one turns.
      const headOn = headOnText(g, b);
      if (headOn) cy += ui.para(headOn, left, cy, TW, C.coral) + 2;
      ui.text(`${Math.round((d.speed ?? 1.5) * 60)} items/min`, left, cy, C.steel3);
      cy += 10;
      if (b.item) {
        ui.text(fitText(`Carrying ${ITEMS[b.item.id]?.name ?? b.item.id}`, TW), left, cy, C.white);
        cy += 10;
      }
      if (b.item2) {
        ui.text(fitText(`Crossing: ${ITEMS[b.item2.id]?.name ?? b.item2.id}`, TW), left, cy, C.white);
        cy += 10;
      }
      if (d.kind === 'sequencer') {
        // seqPos 0 wants an item travelling to its right, which comes in by its left face (logistics.ts
        // insert): a fresh Sequencer takes the left first. Each side is named by compass too.
        const fromLeft = b.seqPos === 0;
        const face = DIR_NAME[fromLeft ? leftOf(b.dir) : rightOf(b.dir)];
        ui.text(fitText(`Next from the ${fromLeft ? 'left' : 'right'}, ${face} face`, TW), left, cy, C.pale);
        if (ui.hover(left, cy - 2, TW, 10)) {
          ui.tooltip(`It takes one item from its left (${DIR_NAME[leftOf(b.dir)]} face), then one from its right (${DIR_NAME[rightOf(b.dir)]} face), in turn; the other side waits. Out of the front (${DIR_NAME[b.dir]} face).`);
        }
        cy += 10;
      }
      return cy + 2;
    }
    default:
      return cy + ui.para(d.blurb, left, cy, TW, C.steel3) + 2;
  }
}

/** A planned ghost: what it waits for, its place in the queue, Rush, and (underground) asking for the goods. */
function planned(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const d = BUILDINGS[b.type];
  const L = g.layer(b.layer);
  ui.text('Needs in the depot:', left, cy, C.steel3);
  cy += 10;
  let short = false;
  for (const [k, v] of Object.entries(d.cost)) {
    const have = Math.max(0, L.stock[k] ?? 0);
    if (have < v) short = true;
    const count = `${Math.min(have, v)}/${v}`;
    ui.sprite(`i_${k}`, left, cy - 4);
    ui.text(fitText(ITEMS[k].name, right - left - 17 - measureText(count) - 4), left + 17, cy, C.white);
    ui.textRight(count, right, cy, have >= v ? C.lime : C.coral);
    cy += 11;
  }
  const queue = g.ghostQueue(b.layer);
  const pos = queue.findIndex((q2) => q2.id === b.id);
  if (pos > 0) {
    cy += 2;
    ui.text(`${pos} plan${pos === 1 ? '' : 's'} ahead of it`, left, cy, C.steel3);
    if (ui.button(right - 50, cy - 2, 50, 11, 'Build next', { tip: "Move it to the front of this depot's queue: it gets the goods first" })) g.buildNext(b.id);
    cy += 12;
  }
  const q = g.rushQuote(b.id);
  if (q && q.price > 0) {
    cy += 2;
    const tip = `The Company ships the missing goods straight to the site at 3x their value. It builds at once; rushed goods are never refunded.${g.s.money < q.price ? '\nNot enough money.' : ''}`;
    if (ui.button(left, cy, TW, 12, `Rush it: ${money(q.price)}`, { disabled: g.s.money < q.price, tip })) {
      if (!g.rush(b.id)) app.toast('Not enough money to rush it', 'bad');
    }
    cy += 15;
  }
  // Underground the depot above can send what is missing: one click adds or raises the requests.
  if (b.layer > 0 && short) {
    const tip = `Add or raise ${depotName(b.layer)}'s requests so the elevator brings what this plan lacks, counting the plans ahead of it.`;
    if (ui.button(left, cy, TW, 12, 'Request the missing goods', { tip })) {
      const set = requestMissing(g, b.id);
      const keys = Object.keys(set);
      if (keys.length) app.toast(`Requested: ${keys.map((k) => `${set[k]} ${itemShort(k)}`).join(', ')}`, 'good');
      else app.toast('The depot already requests enough of what it lacks', 'info');
    }
    cy += 15;
  }
  return cy;
}

function speedBreakdown(app: App, b: Building, left: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const d = BUILDINGS[b.type];
  const L = g.layer(b.layer);
  const parts: string[] = [];
  if (b.status === 'jammed' && b.jam) {
    const name = ITEMS[b.jam]?.name ?? b.jam;
    parts.push(b.jamWhy === 'front' ? `${name} is pushed into its front: belts must come in from the back or sides.` : `${name} is stuck at its input: it does not use it. Sort it out or remove it.`);
  }
  if (b.status === 'misplaced') {
    if (d.needsConduit && liveConduitTiles(g, b) < 2) parts.push('Needs 2 tiles on awake conduit.');
    else if (d.needsHot && heatUnder(L, b.x, b.y, d.size) < 2) parts.push('Needs hot ground (2 tiles from magma).');
    else if (!b.ore && (d.kind === 'miner' || d.kind === 'collector')) parts.push('No deposit under it.');
  }
  // Fuel pushed straight into a generator that holds all it can: it waits for demand (Idle, no badge).
  // Its load says whether it could burn more (logistics.ts waitsOnGenerator).
  const gen = fullGenerator(g, b);
  if (gen) parts.push(gen.speed < 0.99 ? 'The generator is full: it burns more when the layer needs power.' : 'The generator is full and burning flat out: a second generator would burn the rest.');
  if (d.power > 0 && !onLiveConduit(g, b) && L.power.sat < 0.99) parts.push(`power ${Math.round(L.power.sat * 100)}%`);
  if (onLiveConduit(g, b) && d.power > 0) parts.push(L.power.poolSat < 0.99 ? `conduit power ${Math.round(L.power.poolSat * 100)}%` : 'on an awake conduit: free power');
  if (b.envMul < 0.99 || b.envMul > 1.01) {
    let sp = 0;
    let n = 0;
    for (let dy = 0; dy < d.size; dy++) {
      for (let dx = 0; dx < d.size; dx++) {
        sp += L.spore[(b.y + dy) * L.w + b.x + dx];
        n++;
      }
    }
    if (!d.sporeImmune && sp / n > 0.05) parts.push(`spores -${Math.round((sp / n) * 50)}%`);
    const heat = heatUnder(L, b.x, b.y, d.size);
    if (heat && !heatProof(b.type)) {
      const ground = heat === 2 ? 'hot ground' : 'warm ground';
      if (d.needsHot) parts.push(heat === 2 ? 'hot ground +100%' : 'needs hot ground');
      else if (HEAT_FAMILY.has(b.type)) parts.push(`${ground} +${heat === 2 ? 100 : 50}%`);
      else parts.push(`${ground} -${heat === 2 ? 50 : 25}%`);
    }
    if (d.sensitive && b.links.length) parts.push(`interference x${b.links.length}: -${Math.min(75, b.links.length * 25)}%`);
  }
  for (const p of parts) cy += ui.para(p, left, cy, TW, C.steel2);
  return cy;
}

function machine(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const all = recipesFor(b.type);
  if (all.length > 1) {
    ui.text('Recipe', left, cy, C.steel3);
    cy += 10;
    let rx = left;
    for (const r of all) {
      const unlocked = g.recipeUnlocked(r.id);
      const out = Object.keys(r.outputs)[0] ?? Object.keys(r.side ?? {})[0];
      if (rx + 20 > right) {
        rx = left;
        cy += 21;
      }
      const tip = unlocked ? `${r.name}\n${recipeLine(r.id)}` : `${r.name}\nLocked: ${unlockText(r.unlock ?? '')}`;
      if (ui.button(rx, cy, 19, 19, '', { active: b.recipe === r.id, disabled: !unlocked, iconSprite: `i_${out}`, tip })) g.setRecipe(b.id, r.id);
      rx += 21;
    }
    cy += 23;
  }
  const r = b.recipe ? RECIPES[b.recipe] : null;
  if (!r) return cy + ui.para('Pick a recipe, or just belt something in: it picks the recipe from the first thing that fits.', left, cy, TW, C.steel3) + 2;
  const perMin = 60 / r.time;
  ui.text('In', left, cy, C.steel3);
  ui.textRight('per min', right, cy, C.steel2);
  cy += 10;
  for (const [k, v] of Object.entries(r.inputs)) {
    const num = `${b.inBuf[k] ?? 0}/${v}   ${fmtRate(v * perMin)}`;
    ui.sprite(`i_${k}`, left, cy - 4);
    ui.text(fitText(ITEMS[k].name, right - left - 17 - measureText(num) - 4), left + 17, cy, C.white);
    ui.textRight(num, right, cy, (b.inBuf[k] ?? 0) >= v ? C.lime : C.steel3);
    cy += 12;
  }
  ui.text('Out', left, cy, C.steel3);
  cy += 10;
  for (const [k, v] of Object.entries(r.outputs)) {
    const num = fmtRate(v * perMin);
    ui.sprite(`i_${k}`, left, cy - 4);
    ui.text(fitText(ITEMS[k].name, right - left - 17 - measureText(num) - 4), left + 17, cy, C.white);
    ui.textRight(num, right, cy, C.pale);
    cy += 12;
  }
  // Byproducts leave by the machine's left face: name it by compass, as the map shows it.
  const sideFace = DIR_NAME[leftOf(b.dir)];
  for (const [k, v] of Object.entries(r.side ?? {})) {
    const num = fmtRate(v * perMin);
    const label = `${ITEMS[k].name} (${sideFace} face)`;
    ui.sprite(`i_${k}`, left, cy - 4);
    ui.text(fitText(label, right - left - 17 - measureText(num) - 4), left + 17, cy, C.lime);
    if (ui.hover(left, cy - 2, TW, 11)) ui.tooltip(`${ITEMS[k].name} leaves by the ${sideFace} face (the machine's left side), apart from the main output.`);
    ui.textRight(num, right, cy, C.pale);
    cy += 12;
  }
  if (r.powerOut) {
    ui.text(`Makes ${r.powerOut} kW while running`, left, cy, C.cyan);
    cy += 10;
  }
  ui.bar(left, cy + 1, TW, 5, b.active ? b.craft / r.time : 0, C.gold);
  cy += 9;
  const d = BUILDINGS[b.type];
  if (d.power > 0) {
    ui.text(onLiveConduit(g, b) ? `Power ${d.power} kW from the conduit` : `Power ${d.power} kW`, left, cy, C.steel2);
    cy += 10;
  }
  return cy + 2;
}

function fmtRate(n: number): string {
  return n >= 10 ? `${Math.round(n)}` : n.toFixed(1).replace(/\.0$/, '');
}

function recipeLine(id: string): string {
  const r = RECIPES[id];
  const ins = Object.entries(r.inputs).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(' + ');
  const outs = Object.entries(r.outputs).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(' + ');
  const side = r.side ? ' + ' + Object.entries(r.side).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(' + ') : '';
  return `${ins} -> ${outs || '(heat)'}${side} in ${r.time} s`;
}

function miner(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  if (!b.ore) return cy;
  const num = `${fmtRate(b.rate * 60 * b.speed)}/min`;
  ui.sprite(`i_${b.ore}`, left, cy - 4);
  ui.text(fitText(ITEMS[b.ore].name, right - left - 17 - measureText(num) - 4), left + 17, cy, C.white);
  ui.textRight(num, right, cy, C.pale);
  cy += 12;
  if (BUILDINGS[b.type].kind === 'miner') {
    // The purity it really mines at: its ore's best tile, as minerInfo uses it.
    const info = g.minerInfo(b.layer, b.x, b.y, BUILDINGS[b.type]);
    ui.text(`Deposit: ${PURITY_NAME[info.purity] ?? 'normal'}, ${Math.round(info.coverage * 4)}/4 tiles on ore`, left, cy, C.steel3);
    cy += 10;
    ui.text(`Full speed: ${fmtRate(b.rate * 60)}/min`, left, cy, C.steel2);
    return cy + 12;
  }
  return cy + ui.para('Faster in thicker spores. Spore Filters nearby stop it.', left, cy, TW, C.steel3) + 2;
}

function generator(app: App, b: Building, left: number, right: number, cy: number): number {
  const ui = app.ui;
  for (const f of Object.keys(FUELS)) {
    ui.sprite(`i_${f}`, left, cy - 4);
    ui.text(`${ITEMS[f].name}: ${b.inBuf[f] ?? 0}`, left + 17, cy, C.white);
    ui.textRight(`${FUELS[f].power} kW`, right, cy, C.steel3);
    cy += 12;
  }
  ui.text(b.burn > 0 ? `Burning: ${Math.round(b.fuelPower * b.speed)} of ${b.fuelPower} kW used` : 'Not burning', left, cy, b.burn > 0 ? C.cyan : C.steel3);
  cy += 10;
  return cy + ui.para('Only burns what the grid needs.', left, cy, TW, C.steel2) + 2;
}

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
  cy += ui.para(hq ? HQ_TEXT : DEPOT_TEXT, left, cy, TW, C.steel3) + 2;
  // Stock, four to a row.
  const entries = Object.entries(L.stock)
    .filter(([, v]) => v > 0)
    .sort((a, b2) => ITEMS[a[0]].value - ITEMS[b2[0]].value);
  let col = 0;
  for (const [k, v] of entries) {
    const ix = left + col * 40;
    ui.sprite(`i_${k}`, ix, cy - 3);
    ui.text(`${v}`, ix + 17, cy + 1, C.white);
    if (ui.hover(ix, cy - 3, 39, 14)) ui.tooltip(`${ITEMS[k].name}: ${v}${L.requests[k] !== undefined ? `\n${hq ? 'Kept for the Surface' : 'Requested'}: ${L.requests[k]}` : ''}`);
    col++;
    if (col === 4) {
      col = 0;
      cy += 15;
    }
  }
  if (col) cy += 15;
  if (!entries.length) {
    ui.text('Empty', left, cy, C.steel2);
    cy += 12;
  }
  // Requests: underground, what the elevator keeps here; on the HQ, a floor it never takes the HQ below.
  ui.hr(left, cy, TW);
  cy += 4;
  ui.text(hq ? 'Keep for the Surface' : 'Requests from above', left, cy, C.gold);
  if (ui.hover(left, cy - 2, TW, 10)) {
    const how = '\nShift-click a button: 50 at a time. Mouse wheel over a row: 10.';
    ui.tooltip(
      hq
        ? `When a depot below asks for these, the elevator never takes the HQ's stock below this: it is the Surface's floor (the Surface has no depot above it).${how}`
        : `The elevator keeps this much of each item here, taken from ${depotName(b.layer - 1)} (never below its own requests). Requested goods load first (up to half of each cab, rounded down), then belt cargo; any room left goes to more requests.${how}`,
    );
  }
  cy += 11;
  const need = hq ? {} : requestNeed(g, b.layer);
  const step = ui.input.key('Shift') ? REQUEST_BIG_STEP : REQUEST_STEP;
  for (const [k, v] of Object.entries(L.requests)) {
    const stock = Math.max(0, Math.floor(L.stock[k] ?? 0));
    const count = `${stock}/${v}`;
    const nameRoom = right - 40 - 4 - measureText(count) - (left + 17);
    ui.sprite(`i_${k}`, left, cy - 4);
    ui.text(fitText(itemShort(k), nameRoom), left + 17, cy, C.white);
    ui.textRight(count, right - 40, cy, stock >= v ? C.lime : C.white);
    if (ui.hover(left, cy - 3, right - 40 - left, 12)) {
      ui.tooltip(`${ITEMS[k].name}: ${stock} here, ${hq ? 'keep' : 'requested'} ${v}`);
    }
    if (ui.button(right - 37, cy - 2, 12, 11, '-', { tip: v > REQUEST_STEP ? `Keep ${step} fewer (Shift: 50)` : hq ? 'Stop keeping it' : 'Stop requesting it' })) stepRequest(L.requests, k, -step, true);
    if (ui.button(right - 24, cy - 2, 12, 11, '+', { tip: `Keep ${step} more (Shift: 50)` })) stepRequest(L.requests, k, step, true);
    if (ui.button(right - 11, cy - 2, 11, 11, 'x', { tip: hq ? 'Stop keeping it' : 'Stop requesting it' })) delete L.requests[k];
    // The wheel over a row moves it by 10 (and never removes it).
    if (ui.input.wheel && L.requests[k] !== undefined && ui.hover(left, cy - 3, TW, 12)) {
      stepRequest(L.requests, k, -Math.sign(ui.input.wheel) * REQUEST_STEP, false);
      ui.input.wheel = 0;
    }
    cy += 12;
    // Underground: say so when the depot above has none of it to spare.
    if (!hq && (need[k] ?? 0) > 0 && spareAbove(g, b.layer, k) <= 0) {
      ui.text('none spare above', left + 17, cy - 1, C.coral);
      if (ui.hover(left, cy - 2, TW, 10)) ui.tooltip(`${depotName(b.layer - 1)} has no ${ITEMS[k].name} beyond its own requests. Stock it up there, or make it down here.`);
      cy += 10;
    }
  }
  // Add: anything made and stable, deepest first; two rows of seven, the rest behind "more".
  const more = requestableItems(g, b.layer);
  if (more.length) {
    const perRow = 7;
    const cap = 2 * perRow;
    const showAll = view.moreAdd || more.length <= cap;
    const shown = showAll ? more : more.slice(0, cap);
    ui.text('Add:', left, cy + 5, C.steel2);
    if (more.length > cap) {
      const label = view.moreAdd ? 'less' : `+${more.length - cap}`;
      if (ui.link(left, cy + 24, label, C.cyan, view.moreAdd ? 'Show two rows' : `${more.length - cap} more items you can request`)) view.moreAdd = !view.moreAdd;
    }
    const rowY = cy;
    shown.forEach((k, i) => {
      const rx = left + 22 + (i % perRow) * 19;
      const ry = rowY + Math.floor(i / perRow) * 19;
      const tip = `${ITEMS[k].name}\n${hq ? `Keep ${REQUEST_ADD} in the HQ` : `Request ${REQUEST_ADD}`}`;
      if (ui.button(rx, ry, 18, 18, '', { iconSprite: `i_${k}`, tip })) L.requests[k] = REQUEST_ADD;
    });
    const rows = Math.ceil(shown.length / perRow);
    cy = rowY + Math.max(rows * 19, more.length > cap ? 34 : 0) + 1;
  }
  return cy + 2;
}

function terminal(app: App, left: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  ui.text(`Earning ${money(g.incomePerMin())}/min`, left, cy, C.pale);
  if (ui.hover(left, cy - 2, TW, 10)) ui.tooltip('Sales and contract pay over the last minute, from the Terminal and every Chute. Milestone rewards are not income.');
  cy += 11;
  cy = contractLines(app, left, cy);
  cy += ui.para(`Sells everything belted in at full price. Contract goods earn their full share here; a Company Chute pays ${Math.round(CHUTE_RATE * 100)}% of it.`, left, cy, TW, C.steel2) + 3;
  if (ui.button(left, cy, 90, 12, 'Contracts (C)')) app.win = 'company';
  return cy + 15;
}

function chute(app: App, left: number, cy: number): number {
  const ui = app.ui;
  cy += ui.para(`Sells anything belted in from any side, right here, at ${Math.round(CHUTE_RATE * 100)}% of its value. Contract goods count toward the contract here too, at ${Math.round(CHUTE_RATE * 100)}% of their share; the Shipping Terminal pays the full share.`, left, cy, TW, C.steel3) + 3;
  return contractLines(app, left, cy);
}

/** The running contract: progress, and what it is worth so far (Chute deliveries count CHUTE_RATE of their share). */
function contractLines(app: App, left: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const c = g.s.contracts.active;
  if (!c) {
    ui.text('No contract running', left, cy, C.steel3);
    return cy + 12;
  }
  ui.text(fitText(`Contract: ${c.count} ${ITEMS[c.item].name}`, TW), left, cy, C.white);
  cy += 10;
  ui.bar(left, cy, TW, 6, c.delivered / c.count, C.gold);
  cy += 9;
  ui.text(`${c.delivered}/${c.count}, pays ${money(c.pay)}`, left, cy, C.steel3);
  cy += 10;
  if (c.chute > 0) {
    // Paid on completion: what the goods delivered so far are worth, Chute ones at their reduced share.
    cy += ui.para(`Worth ${money(contractPay(c))} so far (${c.chute} came through a Chute, at ${Math.round(CHUTE_RATE * 100)}%)`, left, cy, TW, C.steel2);
  }
  return cy + 2;
}

function elevator(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const sh = g.s.shafts[b.shaft];
  if (!sh) return cy;
  const top = b.end === 0;
  const other = sh.layers[1 - b.end];
  // A belt pushing into the exit comes first, like a machine's jam: nothing on it moves.
  const jam = stationJamText(g, b);
  if (jam) cy += ui.para(jam, left, cy, TW, C.coral) + 2;
  cy += ui.para(`Mk${sh.tier + 1} to ${layerName(other)}`, left, cy, TW, C.white);
  // Live traffic over the last minute, against what the cab can carry each way.
  const t = shaftTraffic(g, sh.id);
  const rate = Math.round(t.rate);
  const upFull = t.rate > 0 && t.up >= SHAFT_FULL * t.rate;
  const ty = cy;
  cy += ui.para(`Down ${t.down}/${rate} a min (requests ${t.reqDown}, belts ${t.beltDown})`, left, cy, TW, t.full ? C.gold : C.steel3);
  cy += ui.para(`Up ${t.up}/${rate} a min`, left, cy, TW, upFull ? C.gold : C.steel3);
  if (ui.hover(left, ty - 2, TW, cy - ty)) ui.tooltip(`Items the cab carried in the last minute, out of the ${rate} a minute it can carry each way. Amber: it is running full; lower a request or upgrade the shaft.`);
  ui.text(`Cab holds ${shaftCab(sh.tier)}, cable ${CABLE_KW[sh.tier]} kW`, left, cy, C.steel3);
  cy += 10;
  if (Math.abs(sh.flow) > 0.5) {
    ui.text(`Power ${sh.flow > 0 ? 'down' : 'up'}: ${Math.round(Math.abs(sh.flow))} kW`, left, cy, C.cyan);
    cy += 10;
  }
  const st = stationStatus(g, b);
  // At the top: belt cargo the depot below can't take waits in the bay. The depot counts as full at
  // 999 with what is already on its way down (heldCargo), so part of the 999 may still be in the cab.
  const held = top ? st?.held ?? null : null;
  ui.text(`Waiting to go ${top ? 'down' : 'up'}: ${sh.bay[b.end].length}`, left, cy, held ? C.coral : C.white);
  cy += 10;
  if (held) {
    const name = ITEMS[held.item]?.name ?? held.item;
    const below = depotName(other);
    const hy = cy;
    cy += ui.para(`${held.count} ${name} held: ${below} is full of it (${STOCK_CAP} with what's on its way).`, left, cy, TW, C.coral);
    if (ui.hover(left, hy - 2, TW, cy - hy)) {
      ui.tooltip(`Waiting for room below\n${upperFirst(below)} is full of ${name}: a depot holds ${STOCK_CAP} at most, counting what is already on its way down, so the ${name} belted in here waits. It still fills the bay: once the bay is full, every belt into this station backs up. Use some ${name} down there, or stop sending it.`);
    }
  }
  // A lower station hands arrivals straight to its depot: it only holds one while the depot can't take it.
  if (top || sh.arr[b.end].length > 0) {
    ui.text(`Arrived, waiting to come out: ${sh.arr[b.end].length}`, left, cy, st?.stalled ? C.coral : C.white);
    cy += 10;
  }
  if (st?.stalled) {
    if (top) cy += ui.para(`Up-cargo blocked: nothing takes it at the ${st.face} face`, left, cy, TW, C.coral);
    else if (st.depotFull && st.item) cy += ui.para(`Depot full: it holds ${STOCK_CAP} ${ITEMS[st.item]?.name ?? st.item}`, left, cy, TW, C.coral);
    else cy += ui.para('The depot is taking nothing it brings', left, cy, TW, C.coral);
  }
  cy += 2;
  const how = top
    ? `Belt items into any side but the front to send them down. Arrivals from below come out of the front (${DIR_NAME[b.dir]} face), in order.`
    : 'Belt items into any side but the front to send them up. Arrivals go straight into the depot it faces; it never turns.';
  cy += ui.para(how, left, cy, TW, C.steel2) + 2;
  // Requests waiting below: only at the top, where the cab loads them.
  if (top) {
    const n = sh.layers[1];
    const below = requestNeed(g, n);
    const wanted = Object.values(below).reduce((a, v) => a + v, 0);
    if (wanted > 0) {
      // Each request the cab can't load now is either held (the depot below is full of it, counting
      // what is on its way) or has none spare in this depot.
      const heldReq = requestsHeld(g, sh);
      ui.text(`Requested below: ${wanted} items`, left, cy, C.cyan);
      if (ui.hover(left, cy - 2, TW, 10)) {
        const why = (k: string) => (spareAbove(g, n, k) <= 0 ? ' (none spare here)' : heldReq.includes(k) ? ` (held: ${depotName(n)} is full)` : '');
        ui.tooltip(Object.entries(below).map(([k, v]) => `${v} ${ITEMS[k].name}${why(k)}`).join('\n'));
      }
      cy += 11;
      if (!requestCandidates(g, sh).length) {
        if (heldReq.length) {
          const what = heldReq.length === 1 ? 'that request' : 'those requests';
          const hy = cy;
          cy += ui.para(`${upperFirst(depotName(n))} is full of ${nameList(heldReq)}: the cab holds ${what} back.`, left, cy, TW, C.coral) + 1;
          if (ui.hover(left, hy - 2, TW, cy - hy)) {
            ui.tooltip(`A depot holds ${STOCK_CAP} of an item at most, counting what is already on its way down. The cab sends more once ${depotName(n)} has room.`);
          }
        }
        // "None spare" only for the requests this depot really has none of beyond its own requests.
        const short = Object.keys(below).filter((k) => spareAbove(g, n, k) <= 0);
        if (short.length) {
          const above = depotName(sh.layers[0]);
          const text = heldReq.length ? `None spare in ${above}: ${nameList(short)}. Stock ${short.length === 1 ? 'it' : 'them'} here.` : `None of it is spare in ${above}: stock it here.`;
          cy += ui.para(text, left, cy, TW, C.coral) + 1;
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
  const tip = `Mk${q.tier + 1}: ${shaftCab(q.tier)} to a cab, ${Math.round(elevatorRate(q.tier))} items a minute each way.\nPays ${money(q.money)}${q.moneyOk ? '' : ' (not enough money)'} and:\n${lines.join('\n')}\nEach good comes from ${lower} first; ${upper} pays the rest.`;
  cy += 2;
  if (ui.button(left, cy, TW, 12, `Upgrade to Mk${q.tier + 1}: ${money(q.money)}`, { disabled: !q.ok, tip })) {
    if (!upgradeElevator(g, shaftId)) app.toast('Not enough goods or money for the upgrade', 'bad');
  }
  cy += 15;
  ui.text('Goods', left, cy, C.steel2);
  ui.textRight('below + above', right, cy, C.steel2);
  cy += 10;
  for (const x of q.goods) {
    const num = `${x.below} + ${x.above}`;
    ui.text(fitText(`${x.need} ${itemShort(x.item)}`, right - left - measureText(num) - 6), left, cy, x.ok ? C.steel3 : C.coral);
    ui.textRight(num, right, cy, x.ok ? C.lime : C.coral);
    cy += 10;
  }
  if (!q.moneyOk) {
    ui.text(`Needs ${money(q.money)}`, left, cy, C.coral);
    cy += 10;
  }
  return cy + 2;
}

function project(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const p = g.s.project;
  // A belt stuck against it comes first, like a machine's status: a good it never takes, or an extra
  // its depot is too full to stack.
  const jam = projectJamText(b);
  if (jam) cy += ui.para(`Jammed: ${jam}`, left, cy, TW, C.coral) + 2;
  if (!p || PROJECTS[p.id].layer !== b.layer) {
    const idle = b.type === 'drill' ? 'The rig is waiting for its next project.' : g.s.ended ? 'The Heart is awake. The mountain is running.' : 'The Heart sleeps.';
    return cy + ui.para(idle, left, cy, TW, g.s.ended && b.type === 'heart' ? C.pale : C.steel3) + 2;
  }
  const def = PROJECTS[p.id];
  const L = g.layer(b.layer);
  const depot = depotName(b.layer);
  cy += ui.para(def.name, left, cy, TW, C.pale) + 2;
  ui.text('Needs', left, cy, C.steel3);
  ui.textRight('delivered/needed', right, cy, C.steel2);
  cy += 10;
  // Each need as delivered/needed. A good whose need is met is still taken: the crew stacks the extra
  // in this layer's depot (a hot good cools), until that depot holds STOCK_CAP of it.
  const full: string[] = [];
  for (const n of projectNeeds(g)) {
    const name = ITEMS[n.item]?.name ?? n.item;
    const done = n.delivered >= n.need;
    const stockId = depotItem(n.item);
    const capped = done && !!stockId && (L.stock[stockId] ?? 0) >= STOCK_CAP;
    if (capped && stockId) full.push(stockId);
    const count = `${n.delivered}/${n.need}`;
    ui.sprite(`i_${n.item}`, left, cy - 4);
    ui.text(fitText(name, right - left - 17 - measureText(count) - 4), left + 17, cy, C.white);
    ui.textRight(count, right, cy, capped ? C.coral : done ? C.lime : C.white);
    if (ui.hover(left, cy - 4, TW, 12)) {
      // Done: how many extras the crew stacked so far (or where they would go), and a full depot.
      const cool = ITEMS[n.item]?.hot ? 'cool and ' : '';
      const sent = n.surplus ? `\n${n.surplus} extra${n.surplus === 1 ? '' : 's'} went to ${depot}.` : stockId && !capped ? `\nExtras ${cool}go to ${depot}.` : '';
      const after = !stockId ? '\nExtras are lost.' : capped ? `\n${upperFirst(depot)} is full of ${ITEMS[stockId]?.name ?? stockId}: more of it backs up on the belt.` : '';
      // An Unloader sending a finished good out of this depot loops it: each extra goes straight back
      // (DECISIONS #91). Only a good stacked as itself can go round; a cooled ingot jams instead.
      const loop = done && stockId === n.item && depotUnloaders(g, b.layer, n.item).length ? `\nIf an Unloader set to ${name} feeds ${BUILDINGS[b.type].name.replace(/^The /, 'the ')} from ${depot}, switch it off: the extras only go back there and round again.` : '';
      ui.tooltip(done ? `${name}: all ${n.need} delivered${sent}${after}${loop}` : `${name}: ${n.delivered} of ${n.need} delivered, ${n.need - n.delivered} to go`);
    }
    cy += 12;
  }
  // A finished good its depot can't stack any more of (the jam line already says so when a belt is stuck).
  if (full.length && !(jam && b.jamWhy === 'full')) {
    cy += ui.para(`${upperFirst(depot)} is full of ${nameList(full)}: more of ${full.length === 1 ? 'it' : 'them'} belted in here backs up.`, left, cy, TW, C.coral) + 2;
  }
  return cy + ui.para(`Belt these in from any side, even all on one belt: extras go to ${depot}.`, left, cy, TW, C.steel2) + 2;
}

function lab(app: App, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  for (const a of Object.values(ASSAYS)) {
    const done = g.s.assaysDone.includes(a.id);
    const n = Math.min(a.samples, g.s.assays[a.id] ?? 0);
    const seen = done || n > 0 || (g.s.stats.produced[a.id] ?? 0) > 0;
    ui.sprite(`i_${a.id}`, left, cy - 4, 1, seen ? 1 : 0.25);
    ui.text(seen ? a.name : '???', left + 17, cy, done ? C.lime : C.white);
    ui.textRight(done ? 'done' : a.lab ? `${n}/${a.samples}` : 'make one', right, cy, done ? C.lime : C.steel3);
    if (ui.hover(left, cy - 4, right - left, 12) && done) ui.tooltip(`${a.name}\n${a.card}`);
    cy += 11;
  }
  return cy + 1;
}

function engineNode(app: App, b: Building, left: number, right: number, cy: number): number {
  const ui = app.ui;
  const seq = nodeSequence(b);
  const ring = Math.min(b.stockCount, WAKE_RINGS);
  ui.text(b.recipe === 'waking' ? 'The Waking Node' : 'Engine Node', left, cy, C.pale);
  ui.textRight(b.stockCount > 0 ? `awake: ring ${ring}/${WAKE_RINGS}` : 'asleep', right, cy, b.stockCount > 0 ? C.lime : C.steel2);
  cy += 11;
  cy += ui.para(`Wants this order, again and again. Each item takes ${NODE_ITEM_TIME} s:`, left, cy, TW, C.steel3) + 2;
  seq.forEach((id, i) => {
    const x = left + i * 22;
    ui.fill(x, cy, 20, 20, i < b.seqPos ? C.green1 : i === b.seqPos ? C.amber : C.panel2);
    ui.sprite(`i_${id}`, x + 2, cy + 2);
    if (ui.hover(x, cy, 20, 20)) ui.tooltip(ITEMS[id].name);
  });
  if (b.craft > 0) ui.bar(left, cy + 22, 86, 3, 1 - b.craft / NODE_ITEM_TIME, C.cyan);
  // Heartstones made so far: an icon and the count, beside the sequence.
  ui.sprite('i_heartstone', left + 94, cy + 2);
  ui.text(`x${b.stockCount}`, left + 112, cy + 6, b.stockCount > 0 ? C.white : C.steel2);
  if (ui.hover(left + 92, cy, 50, 20)) ui.tooltip(`Heartstones made: ${b.stockCount}`);
  cy += 28;
  // Why it stopped taking items, when it has: four Heartstones at its front, or four rejects at its side.
  const jam = nodeJam(b);
  if (jam.outFull) cy += ui.para('Output full: belt the Heartstones away', left, cy, TW, C.coral);
  if (jam.sideFull) cy += ui.para(`Side chute full: belt the wrong items away (${jam.sideFace} face)`, left, cy, TW, C.coral);
  if (jam.outFull || jam.sideFull) cy += 2;
  const wake = ring >= WAKE_RINGS ? `All ${WAKE_RINGS} rings of its conduit are awake.` : `Each Heartstone wakes its conduit a ring further out: ${WAKE_RINGS - ring} of ${WAKE_RINGS} to go.`;
  cy += ui.para(`Heartstones come out of the front (${DIR_NAME[b.dir]} face). A wrong item comes out of the ${jam.sideFace} face, cooled; the order keeps its place. ${wake}`, left, cy, TW, C.steel2);
  return cy + 2;
}

function filterPicker(app: App, b: Building, left: number, right: number, cy: number): number {
  const g = app.game!;
  const ui = app.ui;
  const k = BUILDINGS[b.type].kind;
  cy += ui.para(k === 'sorter' ? `The chosen item turns left (${DIR_NAME[leftOf(b.dir)]}), the rest go straight on.` : 'Pulls the chosen item out of the depot, crate or elevator behind it.', left, cy, TW, C.steel3) + 3;
  // Candidates: items this save has seen.
  const seen = ITEM_LIST.filter((i) => (g.s.stats.produced[i.id] ?? 0) > 0 || (g.layer(b.layer).stock[i.id] ?? 0) > 0 || (g.s.stats.delivered[i.id] ?? 0) > 0);
  let rx = left;
  for (const it of seen) {
    if (rx + 19 > right) {
      rx = left;
      cy += 19;
    }
    if (ui.button(rx, cy, 18, 18, '', { active: b.filter === it.id, iconSprite: `i_${it.id}`, tip: it.name })) g.setFilter(b.id, b.filter === it.id ? null : it.id);
    rx += 19;
  }
  return cy + (seen.length ? 21 : 0);
}
