// Title screen, menus and windows: Company (contracts, licenses, power line), Help and
// knowledge cards, settings, What's new (PATCHNOTES.md), the debug panel, the ending, and the two
// save dialogs (a save that can't be loaded, a save that can't be written).

import type { App } from '../app/app';
import { climbCardText, ENDING_LINES } from '../app/ending';
import { BUILDINGS, LICENSES, LINE_UPGRADES } from '../data/buildings';
import { ITEMS, itemShort } from '../data/items';
import { LAYERS } from '../data/layers';
import { C } from '../data/palette';
import { ASSAYS, CONTRACT_REROLL, PROJECTS } from '../data/progression';
import { RECIPES } from '../data/recipes';
import { getTitleArt } from '../render/atlas';
import { abandonContract, acceptContract, CHUTE_RATE, completeProject, rerollContracts } from '../sim/progress';
import { clearSlot, deserialize, saveMeta, saveToStorage, serialize, SLOTS } from '../sim/save';
import { T_ROCK } from '../sim/types';
import { revealComponent } from '../sim/mapgen';
import { drawText, fitText, measureText, money } from './font';
import { barRoomTop, drawLayerCard, OBJECTIVES_W, STACK_W } from './hud';
import type { Rect } from './ui';
import PATCH_NOTES from '../../PATCHNOTES.md?raw';

// ------------------------------------------------------------------ title

export function drawTitle(app: App): void {
  const ui = app.ui;
  const t = app.time;
  const art = drawTitleBackdrop(app, t);
  // Title in 2x letters, on the art's dark sky band (art rows 14-21) at any window size; the subtitle
  // at art row 25. Without the art they keep their places (y 14 and 50).
  const k = ui.scale;
  const logoY = art ? Math.round((art.top + 14 * art.s) / (2 * k)) : 14;
  const subY = art ? Math.round((art.top + 25 * art.s) / k) : 50;
  const ctx = ui.ctx;
  const title = 'THE MOUNTAIN IS A MACHINE';
  const tw = measureText(title) * 2;
  ctx.save();
  ctx.scale(2, 2);
  drawText(ctx, title, Math.round((ui.w / 2 - tw / 2) / 2) + 1, logoY + 1, C.ink);
  drawText(ctx, title, Math.round((ui.w / 2 - tw / 2) / 2), logoY, C.pale);
  ctx.restore();
  ui.textCenter('A factory game about a mountain that hums.', ui.w / 2, subY, C.steel3, C.ink);
  // Three operations, one per save slot: click to continue one, or to start one in an empty slot.
  // While a window is open they, and the Settings / What's new row, aren't drawn at all: the window
  // would cut a label in half, and nothing under it may take its clicks (Esc or its x closes it).
  if (!app.win) {
    const metas = Array.from({ length: SLOTS }, (_, i) => saveMeta(i));
    const labels = metas.map((meta, i) => (meta ? `Operation ${i + 1}: ${LAYERS[meta.deepest]?.name ?? 'The Dig Site'}, ${playTime(meta.time)}` : `Operation ${i + 1}: start a new one`));
    const bw = Math.max(170, ...labels.map((l) => measureText(l) + 10));
    const bx = Math.floor(ui.w / 2 - bw / 2);
    let by = Math.floor(ui.h * 0.56);
    for (let i = 0; i < SLOTS; i++) {
      const meta = metas[i];
      const tip = meta ? `Continue. Last saved ${new Date(meta.saved).toLocaleString()}.` : 'A fresh dig site in this slot.';
      if (ui.button(bx, by, bw, 14, labels[i], { active: i === app.slot && !!meta, tip })) {
        if (meta) app.continueGame(i);
        else app.newGame(i);
      }
      if (meta && ui.button(bx + bw + 3, by, 14, 14, 'x', { danger: true, tip: 'Erase this operation' }) && confirmErase(i)) clearSlot(i);
      by += 18;
    }
    by += 4;
    const half = Math.floor((bw - 6) / 2);
    if (ui.button(bx, by, half, 14, 'Settings')) app.win = 'settings';
    if (ui.button(bx + bw - half, by, half, 14, "What's new")) app.win = 'news';
  }
  // The footer sits on a dark strip of its own: the title art's pipes and bricks run under it.
  const foot = ['Your progress saves in this browser. Clearing site data erases it.', 'v0.1 - first build'];
  const fw = Math.max(...foot.map((l) => measureText(l))) + 14;
  ui.fill(Math.floor(ui.w / 2 - fw / 2), ui.h - 26, fw, 26, C.ink, 0.88);
  ui.textCenter(foot[0], ui.w / 2, ui.h - 22, C.steel3);
  ui.textCenter(foot[1], ui.w / 2, ui.h - 12, C.steel2);
  if (app.win === 'settings') settings(app);
  if (app.win === 'news') news(app);
  if (app.win === 'loaderror') loadError(app);
}

function confirmErase(slot: number): boolean {
  return window.confirm(`Erase operation ${slot + 1}? This can't be undone.`);
}

function playTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

/**
 * The title's backdrop. The art is drawn whole, at the largest whole-number scale (screen pixels) that
 * fits the window, centred; the margins carry it on: the sky's #172038 above, #151d28 (its bottom
 * row's commonest colour) below, and each side's edge column stretched out sideways. Returns where the
 * art's top is (screen px) and its scale, or null when the atlas has no title art (the code-drawn one).
 */
function drawTitleBackdrop(app: App, t: number): { top: number; s: number } | null {
  const ui = app.ui;
  const ctx = ui.ctx;
  const art = getTitleArt();
  if (art) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const s = Math.max(1, Math.floor(Math.min(W / art.width, H / art.height)));
    const w = art.width * s;
    const h = art.height * s;
    const ox = Math.floor((W - w) / 2);
    const oy = Math.floor((H - h) / 2);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.navy;
    ctx.fillRect(0, 0, W, oy);
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, oy + h, W, H - oy - h);
    if (ox > 0) {
      ctx.drawImage(art, 0, 0, 1, art.height, 0, oy, ox, h);
      ctx.drawImage(art, art.width - 1, 0, 1, art.height, ox + w, oy, W - ox - w, h);
    }
    ctx.drawImage(art, ox, oy, w, h);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return { top: oy, s };
  }
  // Code-drawn cross-section of the mountain with lit layers.
  ui.fill(0, 0, ui.w, ui.h, C.night);
  // Sky gradient bands.
  const sky = [C.navy, C.blue1, C.indigo, C.violet];
  for (let i = 0; i < 4; i++) ui.fill(0, i * 14, ui.w, 14, sky[i]);
  // Stars.
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % ui.w;
    const y = (i * 37) % 50;
    if ((i + Math.floor(t * 2)) % 7) ui.fill(x, y, 1, 1, C.silver);
  }
  const cx = ui.w / 2;
  const top = 58;
  const base = ui.h + 10;
  const halfAt = (y: number) => ((y - top) / (base - top)) * (ui.w * 0.62) + 6;
  const bands = LAYERS.map((l) => l.wall[0]);
  const floors = LAYERS.map((l) => l.floor[0]);
  for (let y = top; y < base; y++) {
    const hw = halfAt(y);
    const f = (y - top) / (base - top);
    const li = Math.min(5, Math.floor(f * 6.2));
    ui.fill(Math.round(cx - hw), y, Math.round(hw * 2), 1, bands[li]);
    // Lit factory strips inside each band.
    const inBand = (f * 6.2) % 1;
    if (inBand > 0.35 && inBand < 0.65) {
      const w = hw * 1.2;
      ui.fill(Math.round(cx - w / 2), y, Math.round(w), 1, floors[li]);
    }
  }
  // Windows of light: machines working in each layer.
  for (let li = 0; li < 6; li++) {
    const y = top + ((li + 0.5) / 6.2) * (base - top);
    const hw = halfAt(y) * 0.55;
    for (let k = 0; k < 10; k++) {
      const x = cx - hw + (k / 9) * hw * 2;
      const on = Math.sin(t * 2 + k * 1.7 + li) > -0.2;
      if (on) ui.fill(Math.round(x), Math.round(y), 2, 2, li === 4 ? C.orange : li === 3 ? C.cyan : li === 2 ? C.pink : li === 5 ? C.ice : C.pale);
    }
  }
  // The shaft running down the middle with a cab.
  ui.fill(Math.round(cx) - 1, top + 6, 2, base - top, C.ink);
  const cabY = top + 6 + ((Math.sin(t * 0.6) + 1) / 2) * (base - top - 20);
  ui.fill(Math.round(cx) - 2, Math.round(cabY), 4, 3, C.gold);
  return null;
}

/** A slot whose save exists but can't be loaded: say so, offer the raw file, change nothing. */
function loadError(app: App): void {
  const ui = app.ui;
  const e = app.loadError;
  if (!e) {
    app.win = null;
    return;
  }
  const w = 260;
  const text = `This save was made by a newer version of the game, or it is damaged (${e.error}). Nothing has been changed: it stays in its slot, and nothing will be saved over it. Erase it with the x beside it, or export it to keep it.`;
  const h = 17 + ui.paraHeight(text, w - 16) + 8 + 13 + 7;
  const { x, y } = windowFrame(app, w, h, `Operation ${e.slot + 1} can't be loaded`);
  let cy = y + 17;
  cy += ui.para(text, x + 8, cy, w - 16, C.white) + 8;
  if (ui.button(x + 8, cy, 110, 13, 'Export the save file', { tip: 'Download it as a file: keep it, or load it in a newer build' })) {
    download(`mountain-operation-${e.slot + 1}-unread.json`, e.raw);
  }
  if (ui.button(x + w - 58, cy, 50, 13, 'OK')) {
    app.win = null;
    app.loadError = null;
  }
}

// ------------------------------------------------------------------ in-game windows

export function drawOverlayWindows(app: App): void {
  if (app.cine) ending(app);
  switch (app.win) {
    case 'company':
      company(app);
      break;
    case 'help':
      help(app);
      break;
    case 'menu':
      menu(app);
      break;
    case 'settings':
      settings(app);
      break;
    case 'debug':
      debug(app);
      break;
    case 'news':
      news(app);
      break;
    case 'savefail':
      saveFail(app);
      break;
  }
}

/**
 * Window sizes (UI px). The Field Manual and What's new page their text into the height pagedHeight()
 * gives them; the Company window fits its content; the save-failure dialog its text.
 */
const WIN = {
  help: { w: 320, h: 250 },
  news: { w: 320, h: 250 },
  menu: { w: 130, h: 163 },
  settings: { w: 210, h: 88 },
  debug: { w: 180, h: 150 },
};
const COMPANY_W = 300;
const SAVE_FAIL_W = 250;
const SAVE_FAIL_TEXT = "The browser won't let the game save: its storage is full or blocked. Quitting now loses everything since the last save. Export a save file first; Import save file in the menu loads it again.";
/** The paged windows never get shorter than this, however little room the build bar leaves (UI px). */
const PAGED_MIN_H = 150;

/**
 * The Field Manual's and What's new's height: 250 UI px, or in a game what fits between the top bar and
 * the build bar's room (windowPos), so their Back and Next never sit over the bar. On the title, 250.
 */
function pagedHeight(app: App, full: number): number {
  if (app.screen !== 'game' || !app.game) return full;
  return Math.min(full, Math.max(PAGED_MIN_H, barRoomTop(app) - 4 - 18));
}

/** The open in-game window's size (UI px), or null when none is open. */
function windowSize(app: App): { w: number; h: number } | null {
  switch (app.win) {
    case 'company':
      return { w: COMPANY_W, h: companyHeight(app) };
    case 'help':
    case 'news':
      return { w: WIN[app.win].w, h: pagedHeight(app, WIN[app.win].h) };
    case 'menu':
    case 'settings':
    case 'debug':
      return WIN[app.win];
    case 'savefail':
      return { w: SAVE_FAIL_W, h: 17 + app.ui.paraHeight(SAVE_FAIL_TEXT, SAVE_FAIL_W - 16) + 8 + 13 + 4 + 13 + 7 };
  }
  return null;
}

/**
 * Where a w x h window goes: centred. In a game it also keeps clear, whenever it fits, of the
 * objectives column (moving right, short of the Stack) and of the build bar with the room it keeps for
 * its tool help line (moving up). A HUD panel it still overlaps steps aside (hud.ts covered()).
 */
function windowPos(app: App, w: number, h: number): { x: number; y: number } {
  const ui = app.ui;
  let x = Math.floor(ui.w / 2 - w / 2);
  let y = Math.floor(ui.h / 2 - h / 2) - 10;
  if (app.screen === 'game' && app.game) {
    const leftCol = 4 + OBJECTIVES_W + 4;
    const rightCol = ui.w - STACK_W - 3 - 4;
    if (x < leftCol && leftCol + w <= rightCol) x = leftCol;
    y = Math.min(y, barRoomTop(app) - 4 - h);
  }
  return { x, y: Math.max(18, y) };
}

/**
 * The open window and the ending's card this frame (UI px). App keeps them as `covers` before the HUD
 * is drawn: a HUD panel they overlap steps aside instead of showing cut (hud.ts covered()).
 */
export function overlayRects(app: App): Rect[] {
  const out: Rect[] = [];
  if (endingCardShowing(app)) out.push(endingCardRect(app));
  const size = windowSize(app);
  if (size) out.push({ ...windowPos(app, size.w, size.h), ...size });
  return out;
}

function windowFrame(app: App, w: number, h: number, title: string): { x: number; y: number } {
  const ui = app.ui;
  const { x, y } = windowPos(app, w, h);
  ui.panel(x, y, w, h, title);
  if (ui.button(x + w - 12, y + 1, 10, 10, 'x', { tip: 'Close (Esc)' })) app.win = null;
  return { x, y };
}

/** The Company window's height: its content laid out without drawing it, plus the bottom margin. */
function companyHeight(app: App): number {
  const ui = app.ui;
  const was = ui.measuring;
  ui.measuring = true;
  try {
    return companyBody(app, 0, 0) + 5;
  } finally {
    ui.measuring = was;
  }
}

function company(app: App): void {
  const { x, y } = windowFrame(app, COMPANY_W, companyHeight(app), 'Halloran Deep Mining Co.');
  companyBody(app, x, y);
}

/** The Company window's content for a window at (x, y); returns the y under its last line. */
function companyBody(app: App, x: number, y: number): number {
  const ui = app.ui;
  const g = app.game!;
  const s = g.s;
  const w = COMPANY_W;
  let cy = y + 17;
  const left = x + 6;
  const right = x + w - 6;
  const chutePct = Math.round(CHUTE_RATE * 100);
  ui.text('CONTRACTS', left, cy, C.gold);
  ui.textRight(`Terminal: full pay. Chute: ${chutePct}%`, right, cy, C.steel2);
  if (ui.hover(right - 150, cy - 2, 150, 10)) ui.tooltip(`Contract goods count at the Shipping Terminal or any Company Chute. Each one earns its share of the pay: all of it at the Terminal, ${chutePct}% of it at a Chute.`);
  cy += 12;
  const c = s.contracts.active;
  if (c) {
    ui.sprite(`i_${c.item}`, left, cy - 3);
    ui.text(`${c.count} ${ITEMS[c.item].name} - pays ${money(c.pay)}`, left + 18, cy, C.white);
    cy += 11;
    // The count sits against the Abandon button; the bar takes the room left of it.
    const prog = `${c.delivered}/${c.count}${c.chute ? ` (${c.chute} by Chute)` : ''}`;
    const progX = right - 54 - measureText(prog);
    ui.bar(left + 18, cy, Math.max(40, progX - 6 - (left + 18)), 6, c.delivered / c.count, C.gold);
    ui.text(prog, progX, cy - 1, C.steel3);
    if (ui.button(right - 50, cy - 3, 50, 11, 'Abandon', { danger: true })) abandonContract(g);
    cy += 12;
  } else {
    ui.text('No contract running. Pick one:', left, cy, C.steel3);
    cy += 11;
  }
  s.contracts.offers.forEach((o, i) => {
    // The pay ends 4 px short of the multiplier; the goods take the room the pay leaves them (short
    // names first, cut if still too long), with the full line in the hover.
    const pay = money(o.pay);
    const payR = left + 186;
    const name = `${o.count} ${itemShort(o.item)}`;
    const nameRoom = payR - measureText(pay) - 6 - (left + 18);
    const normal = ITEMS[o.item].value * o.count;
    const mul = `${(o.pay / Math.max(1, normal)).toFixed(1)}x`;
    ui.sprite(`i_${o.item}`, left, cy - 3);
    ui.text(fitText(name, nameRoom), left + 18, cy, C.white);
    ui.textRight(pay, payR, cy, C.pale);
    ui.text(`(${mul})`, left + 190, cy, C.steel2);
    if (ui.hover(left, cy - 2, 216, 11)) ui.tooltip(`${o.count} ${ITEMS[o.item].name}\nPays ${pay}: ${mul} what the Terminal pays for them`);
    if (ui.button(right - 44, cy - 2, 44, 11, 'Accept', { disabled: !!c, tip: c ? 'Finish or abandon the running contract first' : `Goods you ship, or sell through a Chute, count toward it first (a Chute pays ${chutePct}% of their share)` })) acceptContract(g, i);
    cy += 13;
  });
  ui.text(`New offers in ${Math.ceil(s.contracts.refresh / 60)} min. Done so far: ${s.contracts.done}`, left, cy, C.steel2);
  if (ui.button(right - 70, cy - 2, 70, 11, `Re-roll ${money(CONTRACT_REROLL)}`, { disabled: s.money < CONTRACT_REROLL, tip: 'Throw these offers away and draw three new ones' })) rerollContracts(g);
  cy += 14;
  ui.hr(left, cy, w - 12);
  cy += 5;
  ui.text('LICENSES', left, cy, C.gold);
  cy += 12;
  for (const [id, lic] of Object.entries(LICENSES)) {
    const owned = s.licenses.includes(id);
    ui.text(`${lic.name}: ${lic.blurb}`, left, cy, owned ? C.steel2 : C.white);
    if (owned) ui.textRight('owned', right, cy, C.lime);
    else if (s.deepest < lic.minLayer) ui.textRight(`at ${LAYERS[lic.minLayer].short}`, right, cy, C.steel2);
    else if (ui.button(right - 52, cy - 2, 52, 11, money(lic.price), { disabled: s.money < lic.price })) g.buyLicense(id);
    cy += 13;
  }
  ui.hr(left, cy, w - 12);
  cy += 5;
  ui.text('COMPANY LINE', left, cy, C.gold);
  ui.textRight(`Surface power: ${g.lineKw()} kW`, right, cy, C.cyan);
  cy += 12;
  const next = LINE_UPGRADES[s.lineLevel + 1];
  if (next) {
    ui.text(`Upgrade to ${next.kw} kW`, left, cy, C.white);
    if (ui.button(right - 52, cy - 2, 52, 11, money(next.price), { disabled: s.money < next.price })) g.upgradeLine();
  } else ui.text('Fully upgraded.', left, cy, C.steel2);
  cy += 14;
  ui.hr(left, cy, w - 12);
  cy += 5;
  const mins = Math.floor(s.time / 60);
  ui.text(`Operation time ${Math.floor(mins / 60)}h ${mins % 60}m - earned ${money(s.stats.earned)} - dug ${s.stats.dug} tiles`, left, cy, C.steel2);
  return cy + 10;
}

// ------------------------------------------------------------------ the Field Manual

const BASICS = [
  'Mine ore, smelt it, press it, assemble it. Belt goods into the drill to bore deeper.',
  "Every layer has its own depot. Buildings there are paid from it. A depot's requests tell the elevator what to keep in stock: it hauls them down from the depot above by itself, taking the requests in turn. You can request anything you have made except hot or unstable goods. The HQ's requests are what it keeps for the Surface: the elevator never takes it below them.",
  "Can't afford something? Place it anyway: it becomes a plan and builds itself when the goods arrive. Underground, its inspector can request the missing goods. In a hurry, Rush it: the Company ships what's missing at 3x the price.",
  `Money comes from the Shipping Terminal on the Surface, or ${Math.round(CHUTE_RATE * 100)}% on the spot from a Company Chute below. Contract goods count at either: their full share at the Terminal, ${Math.round(CHUTE_RATE * 100)}% of it at a Chute. Money buys digging, surveys, licenses and rushes. Drill projects need goods.`,
  'Machines push out of one chute: a 2x2 at its front-right corner, a 3x3 at its front-centre. Byproducts leave from the left face.',
  'Power: each layer has its own. Spare power flows through the shaft cables. Short on power, everything runs slower.',
  "Each deeper layer has one strange material and one hazard. Assay the material (belt samples into an Assay Lab) to learn its rules. The machines it brings are on the build bar's Strange tab (5).",
  'Nothing you build is ever destroyed. Remove refunds everything except rushed goods.',
];

const CONTROLS: [string, string][] = [
  ['Left click / drag', 'place, select; drag belts in a line'],
  ['Right click / drag', 'remove (refunds); cancel a tool'],
  ['WASD / arrows', 'pan the camera (Shift: faster)'],
  ['Middle drag', 'pan the camera'],
  ['Wheel', 'zoom; over a request row: +/- 10'],
  ['R', 'rotate a building, or what you place'],
  ['Q', 'copy the building under the cursor'],
  ['X / E / F', 'remove / excavate / survey tools'],
  ['P', 'pause or resume the selected machine'],
  ['Shift-click', 'request + and -: 50 at a time'],
  ['[ and ]', 'layer up / down (or click the Stack)'],
  ['1-5', 'build-bar tabs (5: Strange)'],
  ['Space / Tab', 'pause / game speed 1x-2x'],
  ['C / H', 'Company / this manual'],
  ['Ctrl+S', 'save (it also autosaves every minute)'],
  ['Esc', 'cancel, close, menu'],
];

/** What an assay unlocks, by name (items, buildings or recipes). */
function unlockName(id: string): string {
  return ITEMS[id]?.name ?? BUILDINGS[id]?.name ?? RECIPES[id]?.name ?? id.replace(/_/g, ' ');
}

interface Block {
  h: number;
  /** A knowledge card's id, so the manual can open on its page. */
  key?: string;
  draw: (cy: number) => void;
}

/** Split blocks into pages no taller than `room` (a block taller than a page gets a page of its own). */
function paginate(blocks: Block[], room: number): Block[][] {
  const pages: Block[][] = [[]];
  let used = 0;
  for (const b of blocks) {
    if (used + b.h > room && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(b);
    used += b.h;
  }
  return pages;
}

/** The page shown on each Field Manual tab. */
const helpSub = [0, 0, 0];

function help(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const w = WIN.help.w;
  const h = pagedHeight(app, WIN.help.h);
  const { x, y } = windowFrame(app, w, h, 'Field Manual');
  const left = x + 6;
  if (ui.button(left, y + 15, 60, 11, 'Basics', { active: app.helpPage === 0 })) app.helpPage = 0;
  if (ui.button(left + 63, y + 15, 76, 11, 'Knowledge', { active: app.helpPage === 1 })) app.helpPage = 1;
  if (ui.button(left + 142, y + 15, 60, 11, 'Controls', { active: app.helpPage === 2 })) app.helpPage = 2;
  const top = y + 32;
  const bottom = y + h - 18;
  const tw = w - 12;
  // Every block is measured before it is drawn, so nothing runs past the window: the rest pages.
  const blocks: Block[] = [];
  if (app.helpPage === 0) {
    for (const p of BASICS) blocks.push({ h: ui.paraHeight(p, tw) + 4, draw: (cy) => ui.para(p, left, cy, tw, C.white) });
  } else if (app.helpPage === 1) {
    const done = g.s.assaysDone;
    if (!done.length) {
      const p = 'No assays yet. Strange materials start in the Fungal Caverns: belt samples into an Assay Lab.';
      blocks.push({ h: ui.paraHeight(p, tw), draw: (cy) => ui.para(p, left, cy, tw, C.steel3) });
    }
    for (const id of done) {
      const a = ASSAYS[id];
      // A card that unlocks nothing (Engine Glass) has no "Unlocks" line, and no room kept for one.
      const unl = a.unlocks.length ? `Unlocks: ${a.unlocks.map(unlockName).join(', ')}` : '';
      const cardH = ui.paraHeight(a.card, tw - 18);
      const bh = 14 + cardH + (unl ? 2 + ui.paraHeight(unl, tw - 18) : 0) + 5;
      blocks.push({
        h: bh,
        key: id,
        draw: (cy) => {
          const focus = app.knowledgeFocus === id;
          ui.sprite(`i_${id}`, left, cy - 2);
          ui.text(a.name.toUpperCase(), left + 18, cy + 2, focus ? C.pale : C.gold);
          ui.para(a.card, left + 18, cy + 14, tw - 18, focus ? C.white : C.steel3);
          if (unl) ui.para(unl, left + 18, cy + 14 + cardH + 2, tw - 18, C.steel2);
        },
      });
    }
  } else {
    // The key column is as wide as its widest key; a long description wraps rather than leaving the window.
    const kw = Math.max(...CONTROLS.map(([k]) => measureText(k))) + 6;
    for (const [k, v] of CONTROLS) {
      blocks.push({
        h: Math.max(12, ui.paraHeight(v, tw - kw) + 2),
        draw: (cy) => {
          ui.text(k, left, cy, C.pale);
          ui.para(v, left + kw, cy, tw - kw, C.white);
        },
      });
    }
  }
  const pages = paginate(blocks, bottom - top);
  const tab = app.helpPage;
  // An assay opens the manual on the page that holds its card.
  if (app.helpJump && tab === 1) {
    app.helpJump = false;
    const i = pages.findIndex((pg) => pg.some((b) => b.key === app.knowledgeFocus));
    if (i >= 0) helpSub[1] = i;
  }
  helpSub[tab] = Math.max(0, Math.min(pages.length - 1, helpSub[tab] ?? 0));
  let cy = top;
  for (const b of pages[helpSub[tab]]) {
    b.draw(cy);
    cy += b.h;
  }
  if (pages.length > 1) {
    ui.text(`Page ${helpSub[tab] + 1} of ${pages.length}`, left, y + h - 13, C.steel2);
    if (helpSub[tab] > 0 && ui.button(x + w - 92, y + h - 15, 40, 11, 'Back')) helpSub[tab]--;
    if (helpSub[tab] < pages.length - 1 && ui.button(x + w - 48, y + h - 15, 40, 11, 'Next')) helpSub[tab]++;
  }
}

// ------------------------------------------------------------------ saves

/** Offer a text file for download. */
function download(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Download the current game as a JSON file. */
function exportSave(app: App): void {
  const g = app.game!;
  const mins = Math.floor(g.s.time / 60);
  download(`mountain-${LAYERS[g.s.deepest].id}-${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m.json`, serialize(g));
  app.toast('Save exported', 'good');
}

/** Pick a save file and load it into an empty slot (the current game is saved first). */
function importSave(app: App): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const f = input.files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      let g;
      try {
        g = deserialize(txt);
      } catch {
        app.toast('That file is not a Mountain save', 'bad');
        return;
      }
      if (app.game && app.canSave()) saveToStorage(app.game, app.slot);
      let slot = -1;
      for (let i = 0; i < SLOTS && slot < 0; i++) if (!saveMeta(i)) slot = i;
      if (slot < 0) {
        if (!window.confirm(`All ${SLOTS} operations are in use. Replace operation ${app.slot + 1} with the imported one?`)) return;
        slot = app.slot;
      }
      // Only now is this a real game: a scenario session that cancelled above still never saves.
      app.scenario = false;
      app.useSlot(slot);
      app.enterGame(g, false);
      if (saveToStorage(g, slot)) app.toast(`Save imported as operation ${slot + 1}`, 'good');
      else app.toast('Imported, but it could not be saved here (storage full or blocked)', 'bad');
    });
  };
  input.click();
}

function menu(app: App): void {
  const ui = app.ui;
  const { w, h } = WIN.menu;
  const { x, y } = windowFrame(app, w, h, 'Paused');
  let cy = y + 18;
  const bx = x + 10;
  const bw = w - 20;
  if (ui.button(bx, cy, bw, 13, 'Resume')) app.win = null;
  cy += 17;
  if (ui.button(bx, cy, bw, 13, 'Save now')) {
    if (!app.canSave()) app.toast('Scenarios are not saved', 'info');
    else if (saveToStorage(app.game!, app.slot)) app.toast(`Saved to operation ${app.slot + 1}`, 'good');
    else app.toast('Could not save (storage full or blocked): export a save file', 'bad');
  }
  cy += 17;
  if (ui.button(bx, cy, bw, 13, 'Settings')) app.win = 'settings';
  cy += 17;
  if (ui.button(bx, cy, bw, 13, 'Field Manual')) app.win = 'help';
  cy += 17;
  if (ui.button(bx, cy, bw, 13, "What's new")) app.win = 'news';
  cy += 17;
  if (ui.button(bx, cy, bw, 13, 'Export save file', { tip: 'Download this game as a file: a backup, or to move it to another browser.' })) exportSave(app);
  cy += 17;
  if (ui.button(bx, cy, bw, 13, 'Import save file', { tip: 'Load a game from an exported file. This game is saved first.' })) importSave(app);
  cy += 17;
  if (ui.button(bx, cy, bw, 13, 'Save and quit to title')) app.quitToTitle();
}

/** "Save and quit" found the save failing: stay in the game until the player decides. */
function saveFail(app: App): void {
  const ui = app.ui;
  const w = SAVE_FAIL_W;
  const text = SAVE_FAIL_TEXT;
  const h = windowSize(app)?.h ?? 17 + ui.paraHeight(text, w - 16) + 8 + 13 + 4 + 13 + 7;
  const { x, y } = windowFrame(app, w, h, "Couldn't save");
  let cy = y + 17;
  cy += ui.para(text, x + 8, cy, w - 16, C.white) + 8;
  if (ui.button(x + 8, cy, w - 16, 13, 'Export save file', { tip: 'Download this game as a file' })) exportSave(app);
  cy += 17;
  const half = Math.floor((w - 16 - 4) / 2);
  if (ui.button(x + 8, cy, half, 13, 'Keep playing')) app.win = null;
  if (ui.button(x + w - 8 - half, cy, half, 13, 'Quit without saving', { danger: true })) app.quitToTitle(true);
}

// ------------------------------------------------------------------ what's new

interface NoteBlock {
  kind: 'version' | 'head' | 'item' | 'text';
  text: string;
}

/** PATCHNOTES.md as blocks from the first "## v..." on: versions, "### ..." headings, "- ..." items, other paragraphs. */
const NOTE_BLOCKS: NoteBlock[] = (() => {
  const out: NoteBlock[] = [];
  let para: string[] = [];
  const flush = (): void => {
    if (para.length) out.push({ kind: 'text', text: para.join(' ') });
    para = [];
  };
  const from = PATCH_NOTES.search(/^## /m);
  for (const raw of PATCH_NOTES.slice(from < 0 ? 0 : from).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('# ')) {
      flush();
      continue;
    }
    const clean = (s: string): string => s.replace(/\*\*|`/g, '');
    if (line.startsWith('## ')) {
      flush();
      out.push({ kind: 'version', text: clean(line.slice(3)) });
    } else if (line.startsWith('### ')) {
      flush();
      out.push({ kind: 'head', text: clean(line.slice(4)) });
    } else if (line.startsWith('- ')) {
      flush();
      out.push({ kind: 'item', text: clean(line.slice(2)) });
    } else if (out.length && out[out.length - 1].kind === 'item' && raw.startsWith('  ')) {
      out[out.length - 1].text += ' ' + clean(line);
    } else {
      para.push(clean(line));
    }
  }
  flush();
  return out;
})();

let newsPage = 0;

function news(app: App): void {
  const ui = app.ui;
  const w = WIN.news.w;
  const h = pagedHeight(app, WIN.news.h);
  const { x, y } = windowFrame(app, w, h, "What's new");
  const left = x + 8;
  const tw = w - 16;
  const top = y + 16;
  const bottom = y + h - 18;
  // Split into pages that fit; a page never starts with a lone heading's body.
  const blockH = (b: NoteBlock): number => (b.kind === 'version' ? 14 : b.kind === 'head' ? 12 : ui.paraHeight(b.text, b.kind === 'item' ? tw - 8 : tw) + 3);
  const pages: NoteBlock[][] = [[]];
  let used = 0;
  for (const b of NOTE_BLOCKS) {
    const bh = blockH(b);
    if (used + bh > bottom - top && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(b);
    used += bh;
  }
  newsPage = Math.max(0, Math.min(pages.length - 1, newsPage));
  let cy = top;
  for (const b of pages[newsPage]) {
    if (b.kind === 'version') {
      ui.text(b.text.toUpperCase(), left, cy + 2, C.gold);
      cy += 14;
    } else if (b.kind === 'head') {
      ui.text(b.text, left, cy + 1, C.pale);
      cy += 12;
    } else if (b.kind === 'item') {
      ui.fill(left + 1, cy + 3, 2, 2, C.steel3);
      cy += ui.para(b.text, left + 8, cy, tw - 8, C.white) + 3;
    } else {
      cy += ui.para(b.text, left, cy, tw, C.steel3) + 3;
    }
  }
  if (pages.length > 1) {
    ui.text(`Page ${newsPage + 1} of ${pages.length}`, left, y + h - 13, C.steel2);
    if (newsPage > 0 && ui.button(x + w - 92, y + h - 15, 40, 11, 'Back')) newsPage--;
    if (newsPage < pages.length - 1 && ui.button(x + w - 48, y + h - 15, 40, 11, 'Next')) newsPage++;
  }
}

function settings(app: App): void {
  const ui = app.ui;
  const { w, h } = WIN.settings;
  const { x, y } = windowFrame(app, w, h, 'Settings');
  const left = x + 8;
  let cy = y + 18;
  const s = app.settings;
  ui.text('UI scale', left, cy + 2, C.white);
  // Only scales that fit this window can be picked (the auto one is the largest); a chosen scale the
  // window has since outgrown is capped, and the scale really in use shows as the active button.
  const auto = app.autoScale();
  const using = app.uiScale();
  for (let i = 0; i <= 4; i++) {
    const fits = i <= auto;
    const active = i === 0 ? s.uiScale === 0 : s.uiScale > 0 && using === i;
    const tip = i === 0 ? `The largest scale that fits this window: ${auto}x now` : fits ? (s.uiScale > auto && using === i ? `Using ${i}x: the ${s.uiScale}x you chose doesn't fit this window` : undefined) : 'Too large for this window';
    if (ui.button(left + 70 + i * 26, cy, 24, 11, i === 0 ? 'auto' : `${i}x`, { active, disabled: !fits, tip })) {
      s.uiScale = i;
      app.saveSettings();
    }
  }
  cy += 16;
  const slider = (label: string, v: number, set: (n: number) => void) => {
    ui.text(label, left, cy + 2, C.white);
    for (let i = 0; i <= 5; i++) {
      const val = i / 5;
      if (ui.button(left + 70 + i * 20, cy, 18, 11, `${i * 20}`, { active: Math.abs(v - val) < 0.05 })) {
        set(val);
        app.saveSettings();
      }
    }
    cy += 16;
  };
  slider('Effects', s.sfx, (n) => (s.sfx = n));
  slider('Hum + music', s.music, (n) => (s.music = n));
  ui.text('Screen shake', left, cy + 2, C.white);
  if (ui.button(left + 70, cy, 40, 11, s.shake ? 'on' : 'off', { active: s.shake })) {
    s.shake = !s.shake;
    app.saveSettings();
  }
}

function debug(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const { w, h } = WIN.debug;
  const { x, y } = windowFrame(app, w, h, 'Debug (`)');
  let cy = y + 17;
  const b = (label: string, fn: () => void) => {
    if (ui.button(x + 8, cy, w - 16, 12, label)) fn();
    cy += 15;
  };
  b('+$10,000', () => (g.s.money += 10000));
  b('Unlock everything', () => g.debugUnlockAll());
  b('Fill this layer depot (+200 each basic)', () => {
    const L = g.layer(app.layer);
    for (const k of ['iron_plate', 'gear', 'copper_wire', 'brick', 'steel_beam', 'motor', 'circuit', 'insulation', 'filter', 'battery', 'heat_shield', 'aggregate', 'cobalt_ingot']) L.stock[k] = (L.stock[k] ?? 0) + 200;
  });
  b('Complete the drill project', () => {
    const p = g.s.project;
    if (!p) return;
    for (const [k, v] of Object.entries(PROJECTS[p.id].needs)) p.delivered[k] = v;
    completeProject(g);
  });
  b('Reveal this layer', () => {
    const L = g.layer(app.layer);
    for (let i = 0; i < L.w * L.h; i++) if (L.terrain[i] !== T_ROCK) revealComponent(L, i % L.w, Math.floor(i / L.w));
    L.revealed.fill(1);
  });
  b(`Sim speed x${g.speedMul === 1 ? 10 : 1}`, () => (g.speedMul = g.speedMul === 1 ? 10 : 1));
  ui.text(`${Math.round(app.fps)} fps, ${g.s.buildings.size} buildings`, x + 8, cy, C.steel2);
}

// ------------------------------------------------------------------ ending

const ENDING_CARD_W = 260;
const KEEP_BUILDING = 'Keep building (free play)';

/**
 * The ending sequence is playing (src/app/ending.ts: the Heart, the climb, the dawn and the closing
 * text): the HUD and the inspector step aside for it (app.ts), so nothing slices its cards or text.
 */
export function endingTextShowing(app: App): boolean {
  return !!app.cine && app.cine.cinematic();
}

/** The thank-you card shows from the sequence's end until it is dismissed. */
function endingCardShowing(app: App): boolean {
  return !!app.cine && app.cine.stage() === 'card' && !app.endingShown;
}

/** The thank-you card's lines: what the operation came to. */
function endingCardLines(app: App): string[] {
  const s = app.game!.s;
  const mins = Math.floor(s.time / 60);
  return [
    'You industrialized Old Thrum, all six layers, and woke the engine at its heart.',
    `Operation time: ${Math.floor(mins / 60)} h ${mins % 60} min`,
    `Money earned: ${money(s.stats.earned)}`,
    `Items made: ${Object.values(s.stats.produced).reduce((p, n) => p + n, 0).toLocaleString('en-US')}`,
    `Tiles dug: ${s.stats.dug}   Contracts: ${s.contracts.done}`,
    'Thank you for playing.',
  ];
}

/** The card fits its lines and the button under them. */
function endingCardRect(app: App): Rect {
  const ui = app.ui;
  const w = ENDING_CARD_W;
  const textH = endingCardLines(app).reduce((a, l) => a + ui.paraHeight(l, w - 16) + 2, 0);
  const h = 18 + textH + 5 + 13 + 6;
  return { x: Math.floor(ui.w / 2 - w / 2), y: Math.floor(ui.h / 2 - h / 2), w, h };
}

function ending(app: App): void {
  const ui = app.ui;
  const cine = app.cine!;
  // While it plays: the flash as the Heart wakes, each layer's card on the climb, then the closing
  // text over the Surface at dawn. The camera's views are the sequence's own (app.ts draws them).
  if (cine.cinematic()) {
    const flash = cine.flash();
    if (flash > 0) ui.fill(0, 0, ui.w, ui.h, C.white, flash);
    const card = cine.card();
    if (card) {
      const c = climbCardText(card.layer);
      drawLayerCard(app, c.header, c.name, c.line, card.a);
    }
    const text = cine.text();
    if (text) {
      const lines = ENDING_LINES;
      const boxH = text.shown * 12 + 12;
      const y0 = Math.floor(ui.h * 0.3);
      ui.fill(0, y0, ui.w, boxH, C.ink, 0.75 * text.a);
      ui.ctx.globalAlpha = text.a;
      for (let i = 0; i < text.shown; i++) ui.textCenter(lines[i], ui.w / 2, y0 + 7 + i * 12, i === lines.length - 1 ? C.pale : C.white);
      ui.ctx.globalAlpha = 1;
    }
    // Nothing under it takes a click: a click skips to the card (app.ts).
    ui.block(0, 0, ui.w, ui.h);
    return;
  }
  // Then the thank-you card.
  if (!endingCardShowing(app)) return;
  const { x, y, w, h } = endingCardRect(app);
  ui.panel(x, y, w, h, 'The Mountain Is Awake');
  let cy = y + 18;
  for (const l of endingCardLines(app)) cy += ui.para(l, x + 8, cy, w - 16, l.startsWith('Thank') ? C.pale : C.white) + 2;
  const bw = measureText(KEEP_BUILDING) + 12;
  if (ui.button(Math.floor(x + w / 2 - bw / 2), y + h - 19, bw, 13, KEEP_BUILDING, { active: true })) app.endingShown = true;
}
