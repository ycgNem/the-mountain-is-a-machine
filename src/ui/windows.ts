// Title screen, menus and windows: Company (contracts, licenses, power line), the Field Manual
// (basics, knowledge cards, controls), settings, What's new (PATCHNOTES.md), the debug panel, the
// ending, and the two save dialogs (a save that can't be loaded, a save that can't be written).
//
// Every window is a titled panel from the UI kit (ui.ts) laid out on its grid: content from x + 5 to
// x + w - 5, the first line at y + 16, group headings through ui.section, stacked 12 px buttons 15 px
// apart (3 px between faces), and a window's action row with its buttons' tops at y + h - 17.

import type { App } from '../app/app';
import { climbCardText, ENDING_LINES } from '../app/ending';
import { BUILDINGS, LICENSES, LINE_UPGRADES } from '../data/buildings';
import { ITEMS, itemShort } from '../data/items';
import { LAYERS } from '../data/layers';
import { C, UIC } from '../data/palette';
import { ASSAYS, CONTRACT_REROLL, PROJECTS } from '../data/progression';
import { RECIPES } from '../data/recipes';
import { getTitleArt } from '../render/atlas';
import type { Game } from '../sim/game';
import { abandonContract, acceptContract, CHUTE_RATE, completeProject, rerollContracts } from '../sim/progress';
import { clearSlot, deserialize, saveMeta, saveToStorage, serialize, SLOTS } from '../sim/save';
import { T_ROCK, type Contract } from '../sim/types';
import { revealComponent } from '../sim/mapgen';
import { drawText, fitText, LINE_H, measureText, money, wrapText } from './font';
import { barRoomTop, drawLayerCard, layerName, OBJECTIVES_W, STACK_W } from './hud';
import type { Rect, UI } from './ui';
import PATCH_NOTES from '../../PATCHNOTES.md?raw';

// ------------------------------------------------------------------ title

/** The game's name on the title: 2x stamped capitals. */
const GAME_NAME = 'THE MOUNTAIN IS A MACHINE';
/** An operation's button on the title (UI px tall): a little taller than a window's, the screen's main choice. */
const SLOT_H = 16;

export function drawTitle(app: App): void {
  const ui = app.ui;
  const art = drawTitleBackdrop(app, app.time);
  // The name on the art's dark sky band (art rows 14-21) at any window size; the subtitle at art row
  // 25. Without the art they keep their places (y 14 and 50).
  const k = ui.scale;
  const logoY = art ? Math.round((art.top + 14 * art.s) / (2 * k)) : 14;
  const subY = art ? Math.round((art.top + 25 * art.s) / k) : 50;
  const ctx = ui.ctx;
  const tw = measureText(GAME_NAME, 'head') * 2;
  ctx.save();
  ctx.scale(2, 2);
  drawText(ctx, GAME_NAME, Math.round((ui.w / 2 - tw / 2) / 2), logoY, UIC.title, C.ink, 'head');
  ctx.restore();
  ui.textCenter('A factory game about a mountain that hums.', ui.w / 2, subY, UIC.soft, C.ink);
  // Three operations, one per save slot: click to continue one, or to start one in an empty slot.
  // While a window is open they, and the Settings / What's new row, aren't drawn at all: the window
  // would cut a label in half, and nothing under it may take its clicks (Esc or its × closes it).
  if (!app.win) {
    const metas = Array.from({ length: SLOTS }, (_, i) => saveMeta(i));
    const names = metas.map((_, i) => `Operation ${i + 1}`);
    const details = metas.map((m) => (m ? `${LAYERS[m.deepest]?.name ?? LAYERS[0].name} · ${playTime(m.time)}` : 'New operation'));
    const bw = Math.max(216, ...names.map((n, i) => measureText(n, 'head') + measureText(details[i]) + 32));
    const bx = Math.floor(ui.w / 2 - bw / 2);
    let by = Math.floor(ui.h * 0.56);
    for (let i = 0; i < SLOTS; i++) {
      const meta = metas[i];
      const tip = meta ? `Continue\nLast saved ${new Date(meta.saved).toLocaleString()}.` : 'Start a new operation in this slot.';
      if (slotButton(app, bx, by, bw, names[i], details[i], !!meta, !!meta && i === app.slot, tip)) {
        if (meta) app.continueGame(i);
        else app.newGame(i);
      }
      if (meta && eraseButton(app, bx + bw + 3, by) && confirmErase(i)) clearSlot(i);
      by += SLOT_H + 4;
    }
    by += 4;
    const half = Math.floor((bw - 3) / 2);
    if (ui.button(bx, by, half, 14, 'Settings')) app.win = 'settings';
    if (ui.button(bx + bw - half, by, half, 14, "What's new")) app.win = 'news';
  }
  // The footer sits on a dark strip of its own: the title art's pipes and bricks run under it. The
  // version is the newest heading in the patch notes, so it never goes stale.
  const newest = NOTE_BLOCKS.find((b) => b.kind === 'version');
  const v = newest ? versionParts(newest.text) : null;
  const version = v ? (v.name ? `${v.num} · ${v.name}` : v.num) : '';
  const foot = ['Your progress saves in this browser. Clearing site data erases it.', version];
  const fw = Math.max(...foot.map((l) => measureText(l))) + 14;
  ui.fill(Math.floor(ui.w / 2 - fw / 2), ui.h - 26, fw, 26, C.ink, 0.88);
  ui.textCenter(foot[0], ui.w / 2, ui.h - 22, UIC.soft);
  ui.textCenter(foot[1], ui.w / 2, ui.h - 12, UIC.dim);
  if (app.win === 'settings') settings(app);
  if (app.win === 'news') news(app);
  if (app.win === 'loaderror') loadError(app);
}

/**
 * An operation on the title: a button with the operation's name stamped on its left and where it
 * stands on its right (a button centres its own label, so these are drawn over it and sink with it).
 * The one played last has its name in gold and an arrow at it.
 */
function slotButton(app: App, x: number, y: number, w: number, name: string, detail: string, saved: boolean, last: boolean, tip: string): boolean {
  const ui = app.ui;
  const clicked = ui.button(x, y, w, SLOT_H, '', { tip });
  const dy = ui.hover(x, y, w, SLOT_H) && app.input.down[0] ? 1 : 0;
  ui.head(name, x + 6, y + 4 + dy, last ? UIC.title : UIC.text);
  ui.textRight(detail, x + w - 6, y + 4 + dy, saved ? UIC.soft : UIC.dim);
  if (last) ui.text('→', x - 9, y + 4, UIC.title, C.ink);
  return clicked;
}

/** The danger button beside a saved operation, with the kit's 5 px cross. */
function eraseButton(app: App, x: number, y: number): boolean {
  return app.ui.button(x, y, SLOT_H, SLOT_H, '', { danger: true, mark: 'cross', tip: 'Erase this operation' });
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
  const text = `This save was made by a newer version of the game, or it is damaged (${e.error}). Nothing has been changed: it stays in its slot, and nothing will be saved over it. Erase it with the × beside it, or export it to keep it.`;
  const h = 16 + ui.paraHeight(text, w - 10) + 5 + 17;
  const { x, y } = windowFrame(app, w, h, `Operation ${e.slot + 1} can't be loaded`);
  ui.para(text, x + 5, y + 16, w - 10, UIC.text);
  const by = y + h - 17;
  const label = 'Export the save file';
  if (ui.button(x + 5, by, measureText(label) + 14, 12, label, { tip: 'Download it as a file: keep it, or load it in a newer build' })) {
    download(`mountain-operation-${e.slot + 1}-unread.json`, e.raw);
  }
  if (ui.button(x + w - 5 - 44, by, 44, 12, 'OK')) {
    app.win = null;
    app.loadError = null;
  }
}

// ------------------------------------------------------------------ in-game windows

export function drawOverlayWindows(app: App): void {
  samplePace(app);
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

/** A window's action row: its buttons' tops this far above its bottom, clear of the well's lip. */
const ACTION_ROW = 17;
/** Stacked buttons: 12 px tall, 15 px apart, so their faces are 3 px apart. */
const BTN_H = 12;
const BTN_STEP = 15;

/** The menu's buttons in groups, an engraved rule between groups. */
const MENU: { label: string; tip?: string; act: (app: App) => void }[][] = [
  [{ label: 'Resume', tip: 'Back to the game (Esc)', act: (app) => (app.win = null) }],
  [
    {
      label: 'Save now',
      tip: 'Save to this operation (Ctrl+S). It also saves every minute.',
      act: (app) => {
        if (!app.canSave()) app.toast('Scenarios are not saved', 'info');
        else if (saveToStorage(app.game!, app.slot)) app.toast(`Saved to operation ${app.slot + 1}`, 'good');
        else app.toast('Could not save (storage full or blocked): export a save file', 'bad');
      },
    },
    { label: 'Export save file', tip: 'Download this game as a file: a backup, or to move it to another browser.', act: (app) => exportSave(app) },
    { label: 'Import save file', tip: 'Load a game from an exported file. This game is saved first.', act: (app) => importSave(app) },
  ],
  [
    { label: 'Settings', act: (app) => (app.win = 'settings') },
    { label: 'Field Manual', tip: 'How the mountain works, and every control (H)', act: (app) => (app.win = 'help') },
    { label: "What's new", act: (app) => (app.win = 'news') },
  ],
  [{ label: 'Save and quit to title', act: (app) => app.quitToTitle() }],
];
/** From the top of a group's last button to the next group's first: room for a rule between them. */
const MENU_GROUP_STEP = 22;

function menuHeight(): number {
  const buttons = MENU.reduce((n, grp) => n + grp.length, 0);
  return 16 + (buttons - MENU.length) * BTN_STEP + (MENU.length - 1) * MENU_GROUP_STEP + BTN_H + 5;
}

/**
 * Window sizes (UI px). The Field Manual and What's new page their text into the height pagedHeight()
 * gives them; the Company window fits its content; the menu and the debug panel their buttons; the
 * save-failure dialog its text.
 */
const WIN = {
  help: { w: 320, h: 250 },
  news: { w: 320, h: 250 },
  menu: { w: 136, h: menuHeight() },
  settings: { w: 210, h: 16 + 3 * BTN_STEP + BTN_H + 5 },
  debug: { w: 180, h: 16 + 6 * BTN_STEP + 3 + LINE_H + 4 },
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

/** The save-failure dialog's height: its text, then two rows of buttons. */
function saveFailHeight(ui: UI): number {
  return 16 + ui.paraHeight(SAVE_FAIL_TEXT, SAVE_FAIL_W - 10) + 5 + BTN_STEP + ACTION_ROW;
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
      return { w: SAVE_FAIL_W, h: saveFailHeight(app.ui) };
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

/** A titled window with its close button on the plate, clear of the corner cap. */
function windowFrame(app: App, w: number, h: number, title: string): { x: number; y: number } {
  const ui = app.ui;
  const { x, y } = windowPos(app, w, h);
  ui.panel(x, y, w, h, title);
  if (ui.button(x + w - 14, y + 1, 10, 10, '', { mark: 'cross', tip: 'Close (Esc)' })) app.win = null;
  return { x, y };
}

/** Paged windows: "Page 2 of 5" at the left of the action row, Back and Next at its right. */
const PAGER_W = 40;
/** A paged window's text ends this far above its bottom: clear of the rule over the pager. */
const PAGED_FOOT = 24;

/**
 * The action row of a window paging its text, under an engraved rule. Next keeps the right end and
 * Back stands left of it, each drawn only when it leads somewhere, so neither ever moves. Returns the
 * page to show.
 */
function pager(app: App, x: number, y: number, w: number, h: number, page: number, pages: number): number {
  const ui = app.ui;
  if (pages <= 1) return page;
  const by = y + h - ACTION_ROW;
  const nx = x + w - 5 - PAGER_W;
  ui.hr(x + 5, by - 5, w - 10);
  ui.text(`Page ${page + 1} of ${pages}`, x + 5, by + 2, UIC.dim);
  if (page < pages - 1 && ui.button(nx, by, PAGER_W, BTN_H, 'Next →')) return page + 1;
  if (page > 0 && ui.button(nx - 3 - PAGER_W, by, PAGER_W, BTN_H, '← Back')) return page - 1;
  return page;
}

// ------------------------------------------------------------------ the Company

/** The Company window's height: its content laid out without drawing it, plus the bottom margin. */
function companyHeight(app: App): number {
  const ui = app.ui;
  const was = ui.measuring;
  ui.measuring = true;
  try {
    return companyBody(app, 0, 0) + 4;
  } finally {
    ui.measuring = was;
  }
}

function company(app: App): void {
  const { x, y } = windowFrame(app, COMPANY_W, companyHeight(app), 'Halloran Deep Mining Co.');
  companyBody(app, x, y);
}

/** The offers' Accept buttons, and the room the pay and its multiplier keep left of them. */
const ACCEPT_W = 40;
const MUL_W = measureText('2.5×');

/** The Company window's content for a window at (x, y); returns the y under its last line. */
function companyBody(app: App, x: number, y: number): number {
  const ui = app.ui;
  const g = app.game!;
  const s = g.s;
  const left = x + 5;
  const right = x + COMPANY_W - 5;
  const iw = right - left;
  const chutePct = Math.round(CHUTE_RATE * 100);
  let cy = y + 16;
  // Contracts: the running one on a ticket of its own, then the offers.
  const note = `Terminal 100% · Chute ${chutePct}%`;
  ui.section('Contracts', left, cy, iw, { right: note });
  if (ui.hover(right - measureText(note), cy - 1, measureText(note), 10)) {
    ui.tooltip(`Where contract goods count\nAt the Shipping Terminal or any Company Chute. Each one earns its share of the pay (all of it at the Terminal, ${chutePct}% of it at a Chute), paid when the contract is complete.`);
  }
  cy += 13;
  const c = s.contracts.active;
  if (c) cy = runningContract(app, c, left, cy, iw);
  else {
    ui.text('No contract running. Accept one:', left, cy, UIC.soft);
    cy += 14;
  }
  // The offers: the goods, the pay right-aligned, its multiplier over the Terminal's price, Accept.
  const ax = right - ACCEPT_W;
  const mulR = ax - 6;
  const payR = mulR - MUL_W - 7;
  s.contracts.offers.forEach((o, i) => {
    const pay = money(o.pay);
    const normal = ITEMS[o.item].value * o.count;
    const mul = `${(o.pay / Math.max(1, normal)).toFixed(1)}×`;
    ui.icon(`i_${o.item}`, left, cy);
    ui.text(fitText(`${o.count} ${itemShort(o.item)}`, payR - measureText(pay) - 6 - (left + 15)), left + 15, cy, UIC.text);
    ui.textRight(pay, payR, cy, UIC.money);
    ui.textRight(mul, mulR, cy, UIC.dim);
    if (ui.hover(left, cy - 3, ax - 4 - left, 13)) ui.tooltip(`${o.count} ${ITEMS[o.item].name}\nPays ${pay}: ${mul} what the Terminal pays for them.`);
    const tip = c ? 'Finish or abandon the running contract first.' : `Goods you ship, or sell through a Chute, count toward it first (a Chute pays ${chutePct}% of their share).`;
    if (ui.button(ax, cy - 2, ACCEPT_W, BTN_H, 'Accept', { disabled: !!c, tip })) acceptContract(g, i);
    cy += BTN_STEP;
  });
  ui.text(`New offers in ${Math.ceil(s.contracts.refresh / 60)} min`, left, cy, UIC.dim);
  const reroll = `Re-roll ${money(CONTRACT_REROLL)}`;
  const rw = measureText(reroll) + 12;
  const poor = s.money < CONTRACT_REROLL;
  if (ui.button(right - rw, cy - 2, rw, BTN_H, reroll, { disabled: poor, tip: poor ? `Needs ${money(CONTRACT_REROLL)}.` : 'Throw these offers away and draw three new ones.' })) rerollContracts(g);
  cy += BTN_STEP + 5;
  // Licenses: what each one buys, its rate in the rate style.
  cy += ui.section('Licenses', left, cy, iw);
  for (const [id, lic] of Object.entries(LICENSES)) {
    const owned = s.licenses.includes(id);
    let endR = right;
    if (owned) {
      endR = right - measureText('✓ Owned') - 6;
      ui.textRight('✓ Owned', right, cy, UIC.good);
    } else if (s.deepest < lic.minLayer) {
      const at = `Reach ${layerName(lic.minLayer)}`;
      endR = right - measureText(at) - 6;
      ui.textRight(at, right, cy, UIC.dim);
    } else {
      const price = money(lic.price);
      const pw = measureText(price) + 14;
      endR = right - pw - 6;
      const short = s.money < lic.price;
      if (ui.button(right - pw, cy - 2, pw, BTN_H, price, { disabled: short, tip: short ? `Needs ${price}.` : `Buy the ${lic.name} license` })) g.buyLicense(id);
    }
    licenseLine(ui, lic.name, lic.blurb, left, cy, endR - left, owned);
    cy += BTN_STEP;
  }
  cy += 5;
  // The Company line: the Surface's power, and what the next upgrade gives.
  cy += ui.section('Company line', left, cy, iw, { right: `Surface power ${g.lineKw()} kW`, rightColor: UIC.power });
  const next = LINE_UPGRADES[s.lineLevel + 1];
  if (next) {
    ui.text(`Upgrade to ${next.kw} kW`, left, cy, UIC.text);
    const price = money(next.price);
    const pw = measureText(price) + 14;
    const short = s.money < next.price;
    if (ui.button(right - pw, cy - 2, pw, BTN_H, price, { disabled: short, tip: short ? `Needs ${price}.` : `Raise the Surface's power to ${next.kw} kW` })) g.upgradeLine();
  } else ui.text('✓ Fully upgraded', left, cy, UIC.good);
  cy += BTN_STEP;
  // The operation so far: dim labels, their values in the lighter grey.
  ui.hr(left, cy - 1, iw);
  cy += 4;
  const mins = Math.floor(s.time / 60);
  const stats: [string, string][] = [
    ['On site', `${Math.floor(mins / 60)}h ${mins % 60}m`],
    ['Earned', money(s.stats.earned)],
    ['Dug', `${s.stats.dug} tiles`],
    ['Contracts done', `${s.contracts.done}`],
  ];
  let sx = left;
  for (const [label, value] of stats) {
    sx += ui.text(label, sx, cy, UIC.dim) + 3;
    sx += ui.text(value, sx, cy, UIC.soft) + 9;
  }
  return cy + LINE_H;
}

/**
 * The running contract, on a ticket sunk into the window: the goods and the pay; a bar with the count
 * against the Abandon button; then its pace and how long it has left at that pace. `y` is its first
 * text line; returns the next row's.
 */
function runningContract(app: App, c: Contract, x: number, y: number, w: number): number {
  const ui = app.ui;
  const g = app.game!;
  const right = x + w - 4;
  const tx = x + 18;
  ui.inset(x, y - 3, w, 41);
  ui.spriteCrop(`i_${c.item}`, x + 3, y - 2, 12, 12);
  ui.text(`${c.count} ${ITEMS[c.item].name}`, tx, y, UIC.text);
  const pay = money(c.pay);
  ui.textRight(pay, right, y, UIC.money);
  ui.textRight('pays', right - measureText(pay) - 4, y, UIC.dim);
  // The count sits against the Abandon button; the bar takes the room left of it.
  const ay = y + 14;
  const aw = measureText('Abandon') + 12;
  if (ui.button(right - aw, ay - 2, aw, BTN_H, 'Abandon', { danger: true, tip: 'Give up this contract. A contract pays when it is complete: the goods delivered to it so far earn nothing.' })) abandonContract(g);
  const total = `/${c.count}`;
  const countR = right - aw - 6;
  ui.textRight(total, countR, ay, UIC.dim);
  const done = String(c.delivered);
  const countX = countR - measureText(total) - 1 - measureText(done);
  ui.text(done, countX, ay, UIC.text);
  ui.bar(tx, ay + 1, Math.max(40, countX - 6 - tx), 6, c.delivered / c.count, UIC.warn);
  // Its pace over the last two minutes of play, once there is a minute of it to go on, and how long
  // that leaves; what came in by Chute at the right.
  const py = y + 27;
  const pace = contractPace(c, g.s.time);
  if (c.chute) ui.textRight(`${c.chute} by Chute`, right, py, UIC.dim);
  if (!pace) ui.text('Deliver at the Terminal or a Chute', tx, py, UIC.dim);
  else if (pace.perMin < 0.05) ui.text(`None delivered in the last ${duration(pace.span / 60)}`, tx, py, UIC.warn);
  else {
    const px = tx + ui.rate(tx, py, pace.perMin, UIC.text) + 2;
    const mins = (c.count - c.delivered) / pace.perMin;
    ui.text(`· ${mins < 1 ? 'under a minute' : `about ${duration(mins)}`} left`, px, py, UIC.dim);
  }
  return y + 44;
}

/** Minutes as "6 min" or "1h 05m". */
function duration(mins: number): string {
  const m = Math.ceil(mins);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
}

/**
 * A license: its name, then what it buys, in `w`. A blurb that opens with a rate ("180/min, twice a
 * conveyor.") shows that rate in the rate style and the rest after it only when the rest fits whole
 * (half a phrase reads worse than none); the hover has the whole blurb.
 */
function licenseLine(ui: UI, name: string, blurb: string, x: number, y: number, w: number, owned: boolean): void {
  let tx = x + ui.text(name, x, y, owned ? UIC.soft : UIC.text) + 4;
  const m = /^(\d+(?:\.\d+)?)\/min[,.]?\s*(.*)$/.exec(blurb);
  if (!m) ui.text(fitText(blurb, x + w - tx), tx, y, UIC.soft);
  else {
    tx += ui.rate(tx, y, Number(m[1]), owned ? UIC.soft : UIC.text) + 3;
    const rest = m[2] ? `· ${m[2].replace(/\.$/, '')}` : '';
    if (rest && measureText(rest) <= x + w - tx) ui.text(rest, tx, y, UIC.soft);
  }
  if (ui.hover(x, y - 2, w, 11)) ui.tooltip(`${name}\n${blurb}`);
}

// The running contract's pace: its deliveries sampled every PACE_SAMPLE game seconds while the game
// runs (drawOverlayWindows samples every frame, the Company window open or not), over the last
// PACE_WINDOW seconds. One history per game and contract.
const PACE_WINDOW = 120;
const PACE_SAMPLE = 2;
/** Seconds of samples before a pace is shown at all: one delivery in the first seconds is no pace. */
const PACE_SETTLE = 60;
let pace: { game: Game | null; contract: Contract | null; hist: { t: number; n: number }[] } = { game: null, contract: null, hist: [] };

function samplePace(app: App): void {
  const g = app.game;
  const c = app.screen === 'game' && g ? g.s.contracts.active : null;
  if (!g || !c) {
    if (pace.contract) pace = { game: null, contract: null, hist: [] };
    return;
  }
  const t = g.s.time;
  const h = pace.hist;
  if (pace.game !== g || pace.contract !== c || (h.length && t < h[h.length - 1].t)) pace = { game: g, contract: c, hist: [] };
  const hist = pace.hist;
  if (!hist.length || t - hist[hist.length - 1].t >= PACE_SAMPLE) hist.push({ t, n: c.delivered });
  // Keep one sample at or past the window's start, so the window spans PACE_WINDOW once it can.
  while (hist.length > 2 && t - hist[1].t >= PACE_WINDOW) hist.shift();
}

/**
 * The running contract's deliveries a minute and the game seconds that is over, or null until the
 * samples span PACE_SETTLE seconds.
 */
function contractPace(c: Contract, now: number): { perMin: number; span: number } | null {
  if (pace.contract !== c || !pace.hist.length) return null;
  const first = pace.hist[0];
  const span = now - first.t;
  if (span < PACE_SETTLE) return null;
  return { perMin: ((c.delivered - first.n) / span) * 60, span };
}

// ------------------------------------------------------------------ the Field Manual

/** The Field Manual's Basics: a topic and what to know about it. Digging costs what it does on the shown layer. */
function basics(app: App): [string, string][] {
  const chute = Math.round(CHUTE_RATE * 100);
  const dig = LAYERS[app.layer].digCost;
  return [
    ['The goal', 'Mine ore, smelt it, press it, assemble it. Belt the goods each drill project needs into the Drill to bore down to the next layer.'],
    ['Building', 'Pick a building on the build bar, then click to place it. R turns what you are placing. Drag to lay a belt in a line: the arrows on a belt show which way it runs. Right-click cancels the tool.'],
    [
      'Digging',
      `Rock walls you in, and digging through it is up to you. Pick Dig on the build bar (or press E), then drag over rock: each tile costs $${dig} here, paid as it is dug, working in from the open floor. A right-drag cancels digging still to do. Underground, tunnel to deposits, caverns and the bore site: a cavern opens the moment a tunnel meets it. Survey (F) reveals what lies nearby in the dark.`,
    ],
    ['Removing', 'Nothing you build is ever destroyed. Pick Remove (X), then click a building or drag a box: everything is refunded but rushed goods. To remove one building, hold the right button on it for half a second, or use Remove in its panel. Ctrl+Z undoes the last removal.'],
    [
      'Depots and elevators',
      "Every layer has its own depot, and buildings there are paid from it. A depot's requests tell the elevator what to keep in stock: it hauls them down from the depot above by itself, in turn. You can request any good you have made but hot or unstable ones. The elevator never takes the HQ below its own requests.",
    ],
    ['Plans', "Can't afford something? Place it anyway: it becomes a plan and builds itself when the goods arrive. Underground, its panel can request the missing goods. In a hurry, Rush it: the Company ships what's missing at 3× the price."],
    [
      'Money',
      `Money comes from the Shipping Terminal on the Surface, or ${chute}% on the spot from a Company Chute below. Contract goods count at either: their full share at the Terminal, ${chute}% of it at a Chute. Money buys digging, surveys, licenses and rushes. Drill projects need goods.`,
    ],
    ['Machines', 'Machines push out of one chute: a 2×2 at its front-right corner, a 3×3 at its front-centre. Byproducts leave from the left face.'],
    ['Power', 'Each layer has its own power. Spare power flows through the shaft cables. Short on power, everything runs slower.'],
    ['Strange materials', "Each deeper layer has one strange material and one hazard. Assay the material (belt samples into an Assay Lab) to learn its rules. The machines it brings are on the build bar's Strange tab (5)."],
  ];
}

/** A mouse button and what is done with it ("Click", "Drag", "Hold"). */
interface MouseCap {
  mouse: 'left' | 'right' | 'middle';
  act: string;
}
/** A key cap ("R", "Esc") or a mouse button. */
type Cap = string | MouseCap;
/** One way to do it: caps pressed together (drawn with "+" between). */
type Combo = Cap[];

const LMB = (act: string): MouseCap => ({ mouse: 'left', act });
const RMB = (act: string): MouseCap => ({ mouse: 'right', act });
const MMB = (act: string): MouseCap => ({ mouse: 'middle', act });

/**
 * The controls by group: each row's ways to do it (drawn with "/" between) and what it does. The mouse
 * rows name the button in words as well as lighting it on the mouse: left and right must never be
 * mistaken, now that the right button cancels and only a held one removes.
 */
const CONTROLS: { head: string; rows: [Combo[], string][] }[] = [
  {
    head: 'Mouse',
    rows: [
      [[[LMB('Left click')]], 'place what you picked, or select a building'],
      [[[LMB('Left drag')]], 'lay a belt line; with Remove or Dig, drag a box'],
      [[[RMB('Right click')]], 'cancel the tool, or close the building panel'],
      [[[RMB('Right hold')]], 'remove the building you point at (half a second)'],
    ],
  },
  {
    head: 'Building',
    rows: [
      [[['R']], 'turn what you are placing, or what you point at'],
      [[['Q']], 'copy the building you point at'],
      [[['X'], ['Del']], 'Remove tool: click a building, or drag a box'],
      [[['Ctrl', 'Z']], 'put back what you last removed'],
      [[['E']], 'Dig tool: drag over rock to excavate it'],
      [[['F']], 'Survey tool, underground'],
      [[['P']], 'pause or resume the selected machine'],
      [[['Shift', LMB('Click')]], "on a request's + or -: 50 at a time"],
      [[['1–5']], 'build-bar tabs (5: Strange)'],
    ],
  },
  {
    head: 'Camera and game',
    rows: [
      [[['WASD'], ['Arrows']], 'pan the camera (hold Shift: faster)'],
      [[[MMB('Middle drag')]], 'pan the camera'],
      [[[MMB('Wheel')]], 'zoom; over a request row, change it by 10'],
      [[['['], [']']], 'layer up / down (or click the Stack)'],
      [[['Space']], 'pause'],
      [[['Tab']], 'game speed 1× or 2×'],
      [[['C']], 'the Company'],
      [[['H'], ['F1']], 'this manual'],
      [[['Ctrl', 'S']], 'save (it also saves every minute)'],
      [[['Esc']], 'cancel, close, menu'],
    ],
  },
];

/**
 * Draw a control's caps from x on a text line at y: key caps and mice, joined by "+" inside a
 * combination as the kit joins them everywhere (UI.join), "/" between the ways. Returns the x after
 * them. While measuring it draws nothing (capsWidth).
 */
function drawCaps(ui: UI, ways: Combo[], x: number, y: number): number {
  ways.forEach((combo, i) => {
    if (i) x += ui.text('/', x + 1, y, UIC.dim) + 3;
    combo.forEach((cap, j) => {
      if (j) x += ui.join(x, y);
      if (typeof cap === 'string') x += ui.keyChip(cap, x, y);
      else {
        x += ui.mouseChip(cap.mouse, x, y) + 1;
        x += ui.text(cap.act, x, y, UIC.text);
      }
    });
  });
  return x;
}

function capsWidth(ui: UI, ways: Combo[]): number {
  const was = ui.measuring;
  ui.measuring = true;
  try {
    return drawCaps(ui, ways, 0, 0);
  } finally {
    ui.measuring = was;
  }
}

/** What an assay unlocks, by name (items, buildings or recipes). */
function unlockName(id: string): string {
  return ITEMS[id]?.name ?? BUILDINGS[id]?.name ?? RECIPES[id]?.name ?? id.replace(/_/g, ' ');
}

/** A piece of a paged window: measured before it is drawn, so the pages are cut between pieces. */
interface Block {
  /** The height it draws. */
  h: number;
  /** The space under it before the next piece (dropped at the foot of a page). */
  gap: number;
  /**
   * Kept with the piece under it: a heading never ends a page, and a group's last row never starts
   * one alone.
   */
  keep?: boolean;
  /** A knowledge card's id, so the manual can open on its page. */
  key?: string;
  draw: (cy: number) => void;
}

/** Split blocks into pages no taller than `room` (a block taller than a page gets a page of its own). */
function paginate(blocks: Block[], room: number): Block[][] {
  const pages: Block[][] = [[]];
  let used = 0;
  blocks.forEach((b, i) => {
    const under = blocks[i + 1];
    const need = b.keep && under ? b.h + b.gap + under.h : b.h;
    if (used + need > room && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(b);
    used += b.h + b.gap;
  });
  return pages;
}

/** A section heading as a block; `gap` more under it before what it heads. */
function headBlock(ui: UI, label: string, x: number, w: number, right?: string, gap = 0): Block {
  return { h: 12, gap, keep: true, draw: (cy) => ui.section(label, x, cy, w, { right }) };
}

/** A list as lines no wider than w, broken only between its entries (" · " between them). */
function wrapList(items: string[], w: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const it of items) {
    const test = line ? `${line} · ${it}` : it;
    if (line && measureText(test) > w) {
      lines.push(line);
      line = it;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** The page shown on each Field Manual tab. */
const helpSub = [0, 0, 0];
const HELP_TABS = ['Basics', 'Knowledge', 'Controls'];
const HELP_TAB_W = 64;

function help(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const w = WIN.help.w;
  const h = pagedHeight(app, WIN.help.h);
  const { x, y } = windowFrame(app, w, h, 'Field Manual');
  const left = x + 5;
  const tw = w - 10;
  HELP_TABS.forEach((label, i) => {
    if (ui.button(left + i * (HELP_TAB_W + 3), y + 16, HELP_TAB_W, BTN_H, label, { active: app.helpPage === i })) app.helpPage = i;
  });
  ui.hr(left, y + 31, tw);
  const top = y + 36;
  // Every block is measured before it is drawn, so nothing runs past the window: the rest pages.
  const blocks: Block[] = [];
  if (app.helpPage === 0) {
    for (const [topic, p] of basics(app)) {
      blocks.push(headBlock(ui, topic, left, tw));
      blocks.push({ h: ui.paraHeight(p, tw), gap: 7, draw: (cy) => ui.para(p, left, cy, tw, UIC.text) });
    }
  } else if (app.helpPage === 1) {
    const done = g.s.assaysDone;
    blocks.push(headBlock(ui, 'Assays', left, tw, `${done.length} of ${Object.keys(ASSAYS).length} known`, 4));
    if (!done.length) {
      const p = 'No assays yet. Strange materials start in the Fungal Caverns: belt samples into an Assay Lab to learn their rules.';
      blocks.push({ h: ui.paraHeight(p, tw), gap: 0, draw: (cy) => ui.para(p, left, cy, tw, UIC.soft) });
    }
    const cw = tw - 20;
    const lw = measureText('Unlocks') + 5;
    for (const id of done) {
      const a = ASSAYS[id];
      // A card that unlocks nothing (Engine Glass) has no "Unlocks" line, and no room kept for one.
      // The list breaks between names, never inside one.
      const unl = wrapList(a.unlocks.map(unlockName), cw - lw);
      const cardH = ui.paraHeight(a.card, cw);
      const unlH = unl.length ? 3 + unl.length * LINE_H : 0;
      blocks.push({
        h: 12 + cardH + unlH,
        gap: 8,
        key: id,
        draw: (cy) => {
          const focus = app.knowledgeFocus === id;
          ui.sprite(`i_${id}`, left, cy - 4);
          ui.head(a.name, left + 20, cy, focus ? UIC.title : UIC.head);
          ui.para(a.card, left + 20, cy + 12, cw, focus ? UIC.text : UIC.soft);
          if (!unl.length) return;
          const uy = cy + 15 + cardH;
          ui.text('Unlocks', left + 20, uy, UIC.dim);
          unl.forEach((l, i) => ui.text(l, left + 20 + lw, uy + i * LINE_H, focus ? UIC.text : UIC.soft));
        },
      });
    }
  } else {
    // The caps column is as wide as the widest row's caps; a long description wraps beside them.
    const kw = Math.max(...CONTROLS.flatMap((grp) => grp.rows.map(([ways]) => capsWidth(ui, ways)))) + 6;
    for (const grp of CONTROLS) {
      blocks.push(headBlock(ui, grp.head, left, tw));
      grp.rows.forEach(([ways, what], i) => {
        const last = i === grp.rows.length - 1;
        blocks.push({
          h: Math.max(10, ui.paraHeight(what, tw - kw)),
          gap: last ? 7 : 1,
          keep: i === grp.rows.length - 2,
          draw: (cy) => {
            drawCaps(ui, ways, left, cy);
            ui.para(what, left + kw, cy, tw - kw, UIC.text);
          },
        });
      });
    }
  }
  const pages = paginate(blocks, y + h - PAGED_FOOT - top);
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
    cy += b.h + b.gap;
  }
  helpSub[tab] = pager(app, x, y, w, h, helpSub[tab], pages.length);
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
  const bx = x + 5;
  const bw = w - 10;
  let cy = y + 16;
  MENU.forEach((grp, gi) => {
    if (gi) {
      ui.hr(bx, cy - BTN_STEP + BTN_H + 4, bw);
      cy += MENU_GROUP_STEP - BTN_STEP;
    }
    for (const item of grp) {
      if (ui.button(bx, cy, bw, BTN_H, item.label, { tip: item.tip })) item.act(app);
      cy += BTN_STEP;
    }
  });
}

/** "Save and quit" found the save failing: stay in the game until the player decides. */
function saveFail(app: App): void {
  const ui = app.ui;
  const w = SAVE_FAIL_W;
  const h = saveFailHeight(ui);
  const { x, y } = windowFrame(app, w, h, "Couldn't save");
  ui.para(SAVE_FAIL_TEXT, x + 5, y + 16, w - 10, UIC.text);
  const by = y + h - ACTION_ROW;
  if (ui.button(x + 5, by - BTN_STEP, w - 10, BTN_H, 'Export save file', { tip: 'Download this game as a file' })) exportSave(app);
  const half = Math.floor((w - 10 - 3) / 2);
  if (ui.button(x + 5, by, half, BTN_H, 'Keep playing')) app.win = null;
  if (ui.button(x + w - 5 - half, by, half, BTN_H, 'Quit without saving', { danger: true, tip: 'Everything since the last save is lost' })) app.quitToTitle(true);
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

/** A version heading ("v0.1 - First build") as its number and its name (empty when it has none). */
function versionParts(text: string): { num: string; name: string } {
  const m = /^(\S+)\s+[-–—]\s+(.+)$/.exec(text);
  return m ? { num: m[1], name: m[2] } : { num: text, name: '' };
}

let newsPage = 0;

function news(app: App): void {
  const ui = app.ui;
  const w = WIN.news.w;
  const h = pagedHeight(app, WIN.news.h);
  const { x, y } = windowFrame(app, w, h, "What's new");
  const left = x + 5;
  const tw = w - 10;
  const top = y + 16;
  // A version is a section heading (its name, then the number at the right: "FIRST BUILD ... v0.1");
  // a group heading in the title gold; items bulleted; notes in the lighter grey.
  const blocks: Block[] = NOTE_BLOCKS.map((b): Block => {
    switch (b.kind) {
      case 'version': {
        const v = versionParts(b.text);
        return { h: 12, gap: 2, keep: true, draw: (cy) => ui.section(v.name || v.num, left, cy, tw, v.name ? { right: v.num } : {}) };
      }
      case 'head':
        return { h: 12, gap: 0, keep: true, draw: (cy) => ui.text(b.text, left, cy + 1, UIC.title) };
      case 'item':
        return {
          h: ui.paraHeight(b.text, tw - 8),
          gap: 3,
          draw: (cy) => {
            ui.text('•', left + 1, cy, UIC.dim);
            ui.para(b.text, left + 8, cy, tw - 8, UIC.text);
          },
        };
      default:
        return { h: ui.paraHeight(b.text, tw), gap: 5, draw: (cy) => ui.para(b.text, left, cy, tw, UIC.soft) };
    }
  });
  const pages = paginate(blocks, y + h - PAGED_FOOT - top);
  newsPage = Math.max(0, Math.min(pages.length - 1, newsPage));
  let cy = top;
  for (const b of pages[newsPage]) {
    b.draw(cy);
    cy += b.h + b.gap;
  }
  newsPage = pager(app, x, y, w, h, newsPage, pages.length);
}

// ------------------------------------------------------------------ settings and debug

/** Settings: the labels' column, then each row's buttons. */
const SET_COL = 64;

function settings(app: App): void {
  const ui = app.ui;
  const { w, h } = WIN.settings;
  const { x, y } = windowFrame(app, w, h, 'Settings');
  const left = x + 5;
  const bx = left + SET_COL;
  let cy = y + 16;
  const s = app.settings;
  const label = (t: string): void => {
    ui.text(t, left, cy + 2, UIC.soft);
  };
  label('UI scale');
  // Only scales that fit this window can be picked (the auto one is the largest); a chosen scale the
  // window has since outgrown is capped, and the scale really in use shows as the active button.
  const auto = app.autoScale();
  const using = app.uiScale();
  let sx = bx;
  for (let i = 0; i <= 4; i++) {
    const fits = i <= auto;
    const active = i === 0 ? s.uiScale === 0 : s.uiScale > 0 && using === i;
    const tip = i === 0 ? `The largest scale that fits this window: ${auto}× now` : fits ? (s.uiScale > auto && using === i ? `Using ${i}×: the ${s.uiScale}× you chose doesn't fit this window` : undefined) : 'Too large for this window';
    const bw = i === 0 ? 30 : 20;
    if (ui.button(sx, cy, bw, BTN_H, i === 0 ? 'Auto' : `${i}×`, { active, disabled: !fits, tip })) {
      s.uiScale = i;
      app.saveSettings();
    }
    sx += bw + 3;
  }
  cy += BTN_STEP;
  const volume = (name: string, v: number, set: (n: number) => void): void => {
    label(name);
    for (let i = 0; i <= 5; i++) {
      const val = i / 5;
      if (ui.button(bx + i * 23, cy, 20, BTN_H, `${i * 20}`, { active: Math.abs(v - val) < 0.05 })) {
        set(val);
        app.saveSettings();
      }
    }
    cy += BTN_STEP;
  };
  volume('Effects', s.sfx, (n) => (s.sfx = n));
  volume('Hum + music', s.music, (n) => (s.music = n));
  label('Screen shake');
  ['Off', 'On'].forEach((t, i) => {
    if (ui.button(bx + i * 33, cy, 30, BTN_H, t, { active: s.shake === (i === 1) }) && s.shake !== (i === 1)) {
      s.shake = i === 1;
      app.saveSettings();
    }
  });
}

function debug(app: App): void {
  const ui = app.ui;
  const g = app.game!;
  const { w, h } = WIN.debug;
  const { x, y } = windowFrame(app, w, h, 'Debug (`)');
  let cy = y + 16;
  const b = (label: string, fn: () => void): void => {
    if (ui.button(x + 5, cy, w - 10, BTN_H, label)) fn();
    cy += BTN_STEP;
  };
  b('+$10,000', () => (g.s.money += 10000));
  b('Unlock everything', () => g.debugUnlockAll());
  b('Fill this depot: +200 basics', () => {
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
  b(`Sim speed ×${g.speedMul === 1 ? 10 : 1}`, () => (g.speedMul = g.speedMul === 1 ? 10 : 1));
  ui.text(`${Math.round(app.fps)} fps · ${g.s.buildings.size} buildings`, x + 5, cy + 3, UIC.dim);
}

// ------------------------------------------------------------------ ending

const ENDING_CARD_W = 260;
const KEEP_BUILDING = 'Keep building (free play)';
const ENDING_INTRO = 'You industrialized Old Thrum, all six layers, and woke the engine at its heart.';
/** The thank-you card's ledger of the operation: as wide as this, centred. */
const LEDGER_W = 176;

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

/** What the operation came to, for the thank-you card's ledger. */
function endingStats(app: App): [string, string][] {
  const s = app.game!.s;
  const mins = Math.floor(s.time / 60);
  return [
    ['Operation time', `${Math.floor(mins / 60)} h ${mins % 60} min`],
    ['Money earned', money(s.stats.earned)],
    ['Items made', Object.values(s.stats.produced).reduce((p, n) => p + n, 0).toLocaleString('en-US')],
    ['Tiles dug', s.stats.dug.toLocaleString('en-US')],
    ['Contracts', s.contracts.done.toLocaleString('en-US')],
  ];
}

/** The card fits its sentence, the ledger, the thanks and the button under them. */
function endingCardRect(app: App): Rect {
  const ui = app.ui;
  const w = ENDING_CARD_W;
  const h = 16 + wrapText(ENDING_INTRO, w - 10).length * LINE_H + 4 + endingStats(app).length * LINE_H + 5 + LINE_H + 3 + ACTION_ROW;
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
      // The closing lines appear one by one on a band already sized for all of them, ruled in gold
      // like the climb's layer cards.
      const lines = ENDING_LINES;
      const boxH = lines.length * 12 + 12;
      const y0 = Math.floor(ui.h * 0.3);
      ui.fill(0, y0, ui.w, boxH, C.ink, 0.75 * text.a);
      ui.fill(0, y0, ui.w, 1, C.gold, text.a);
      ui.fill(0, y0 + boxH - 1, ui.w, 1, C.gold, text.a);
      ui.ctx.globalAlpha = text.a;
      for (let i = 0; i < text.shown; i++) ui.textCenter(lines[i], ui.w / 2, y0 + 7 + i * 12, i === lines.length - 1 ? UIC.title : UIC.text);
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
  let cy = y + 16;
  for (const l of wrapText(ENDING_INTRO, w - 10)) {
    ui.textCenter(l, x + w / 2, cy, UIC.text);
    cy += LINE_H;
  }
  cy += 4;
  const lx = Math.floor(x + w / 2 - LEDGER_W / 2);
  for (const [label, value] of endingStats(app)) {
    ledgerRow(ui, label, value, lx, cy, LEDGER_W);
    cy += LINE_H;
  }
  ui.textCenter('Thank you for playing.', x + w / 2, cy + 5, UIC.title);
  const bw = measureText(KEEP_BUILDING) + 16;
  if (ui.button(Math.floor(x + w / 2 - bw / 2), y + h - ACTION_ROW, bw, BTN_H, KEEP_BUILDING, { tip: 'Back to your operation, to build on' })) app.endingShown = true;
}

/** A ledger line: the label at the left, the value right-aligned at x + w, dotted leaders between. */
function ledgerRow(ui: UI, label: string, value: string, x: number, y: number, w: number): void {
  const lx = x + ui.text(label, x, y, UIC.dim) + 2;
  const vw = measureText(value);
  ui.textRight(value, x + w, y, UIC.text);
  for (let dx = lx + ((lx - x) % 2); dx < x + w - vw - 3; dx += 2) ui.fill(dx, y + 6, 1, 1, C.slate);
}
