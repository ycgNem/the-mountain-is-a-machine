// Immediate-mode canvas UI at a whole-number scale. Every panel drawn this frame captures the
// mouse so clicks don't fall through to the world.
//
// Two extras for panels whose content decides their size: a measure pass (`measuring`) lays the
// content out without drawing it or taking clicks, so the panel can be sized before it is drawn; and
// a clip rect (`setClip`) that both cuts the drawing and stops anything outside it from taking the
// mouse, so a scrolled list can't click through its frame.
//
// The look (STYLE.md "UI"): steel plate lit from the top left, in palette colours. A panel is a 2 px
// bevelled frame round a recessed well; a titled panel widens the top of its frame into a riveted
// plate with the title stamped on it. Buttons stand raised and press down 1 px; an active one is
// latched in, amber. Rates, key hints, badges, counters and segmented bars each have one helper, so
// they read the same on every surface.

import { ITEMS, itemShort } from '../data/items';
import { APOLLO, C } from '../data/palette';
import type { Input } from '../engine/input';
import { sprite } from '../render/atlas';
import { drawText, fitText, fmtRate, LINE_H, measureText, money, wrapText, type TextStyle } from './font';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ButtonOpts {
  disabled?: boolean;
  /** Latched in: a selected tab, tool or toggle. */
  active?: boolean;
  tip?: string;
  /** A face colour of its own (any palette colour); its edges come from the colour's ramp. */
  color?: string;
  icon?: CanvasImageSource | null;
  iconSprite?: string;
  danger?: boolean;
  /** A shortcut shown as a key cap at the button's right end ("R"), when it fits beside the label. */
  key?: string;
  /**
   * A 5 px mark drawn by hand in the middle instead of a label: 'cross' (close, remove), 'plus' or
   * 'minus'. The font's × is a 3 px multiplication sign, a speck on a square button, and its - is
   * narrower than its +, so square buttons use these.
   */
  mark?: Mark;
}

/** A square button's mark (ButtonOpts.mark). */
export type Mark = 'cross' | 'plus' | 'minus';

export interface PanelOpts {
  /** The well's opacity (the frame stays solid). */
  alpha?: number;
  /** The well's colour. */
  fill?: string;
  /** 'thick' (2 px frame and an inset well) or 'thin' (1 px bevel); by default thin under 24 x 24. */
  frame?: 'thick' | 'thin';
}

export interface RateOpts {
  /** Money: "$42", so "+$42/min". */
  money?: boolean;
  /** A "+" before a positive amount (a negative one always shows "-"). */
  sign?: boolean;
  /** A glyph before the amount, 2 px from it: a direction or trend ('→', '↓', '▲', '▼'). */
  arrow?: string;
  /** The unit after the amount: "/min" unless given. */
  unit?: string;
  /** The colour of the unit and the arrow: the dim text colour unless given. */
  unitColor?: string;
  /**
   * What the amount is out of, after the unit in the same dim colour: "26/min of 30" (a machine below
   * full speed, a shaft against what its cab can carry).
   */
  of?: number;
}

/** The top bar's height: positioned tooltips never go above it. */
export const TOP_BAR_H = 15;

/** A titled panel's plate covers its top 12 px; content starts below it. */
export const TITLE_H = 12;

/** Height of a chip, pill or key cap: one row above the text's top to one below its baseline. */
export const CHIP_H = 9;

interface Tip {
  text: string;
  x: number;
  y: number;
  /** Placed beside this rect (UI px) instead of at the cursor. */
  anchor?: Rect;
}

/** Apollo's ramps, dark to light (palette.ts lists them that way). */
const RAMPS: readonly (readonly string[])[] = [
  APOLLO.slice(0, 6),
  APOLLO.slice(6, 12),
  APOLLO.slice(12, 18),
  APOLLO.slice(18, 24),
  APOLLO.slice(24, 30),
  APOLLO.slice(30, 36),
  APOLLO.slice(36, 46),
];

/**
 * A colour `steps` along its Apollo ramp: +1 is one shade lighter, -1 darker, clamped at the ramp's
 * ends. A colour outside the palette comes back unchanged. Bars light their fill's top with it, links
 * dim their underline.
 */
export function tone(color: string, steps: number): string {
  for (const r of RAMPS) {
    const i = r.indexOf(color);
    if (i >= 0) return r[Math.max(0, Math.min(r.length - 1, i + steps))];
  }
  return color;
}

/** A rate as plain text, for tooltips and measuring: "30/min", "+$42/min", "→ 15/min", "26/min of 30". */
export function rateText(perMin: number, o: RateOpts = {}): string {
  const p = rateParts(perMin, o);
  return (p.arrow ? p.arrow + ' ' : '') + p.amount + p.unit;
}

/** How wide UI.rate draws a rate. */
export function rateWidth(perMin: number, o: RateOpts = {}): number {
  const p = rateParts(perMin, o);
  return (p.arrow ? measureText(p.arrow) + 2 : 0) + measureText(p.amount + p.unit);
}

/** A rate's pieces: the arrow, the amount, and everything dim after it (the unit and any "of N"). */
function rateParts(perMin: number, o: RateOpts): { arrow: string; amount: string; unit: string } {
  const sign = perMin < 0 ? '-' : o.sign ? '+' : '';
  const num = (v: number): string => (o.money ? money(v) : fmtRate(v));
  const of = o.of != null ? ` of ${num(Math.abs(o.of))}` : '';
  return { arrow: o.arrow ?? '', amount: sign + num(Math.abs(perMin)), unit: (o.unit ?? '/min') + of };
}

/** How wide UI.keyChip draws a key cap (its advance is one more). */
export function keyChipWidth(key: string): number {
  return measureText(key.toUpperCase()) + 4;
}

/** The keys of a combination pressed together: "Ctrl+Z" is Ctrl and Z; a lone "+" is the plus key. */
function comboKeys(combo: string): string[] {
  const keys = combo.split('+');
  return keys.every(Boolean) ? keys : [combo];
}

/** The "+" between two keys pressed together: its advance, with 2 px of air either side. */
const JOIN_W = measureText('+') + 3;

/**
 * How wide UI.keys draws a combination ("Ctrl+Z": two key caps joined by "+"), or a single key cap;
 * its advance is one more.
 */
export function keysWidth(combo: string): number {
  const keys = comboKeys(combo);
  return keys.reduce((a, k) => a + keyChipWidth(k) + 1, 0) + (keys.length - 1) * JOIN_W - 1;
}

/** How wide UI.keyHint draws "[key] label". */
export function keyHintWidth(key: string, label: string): number {
  return keysWidth(key) + 3 + measureText(label);
}

/**
 * An item's name in `room` px: whole when it fits, else its short name ("Aggregate" for
 * "Heat-Resistant Aggregate"), and only then cut.
 */
export function fitItemName(id: string, room: number): string {
  const full = ITEMS[id]?.name ?? id;
  return measureText(full) <= room ? full : fitText(itemShort(id), room);
}

export class UI {
  ctx!: CanvasRenderingContext2D;
  input!: Input;
  scale = 2;
  w = 0;
  h = 0;
  mx = -1;
  my = -1;
  time = 0;
  private tip: Tip | null = null;
  private panels: Rect[] = [];
  private clip: Rect | null = null;
  /** Drawing put off to the end of the frame, over every panel (but under the tooltip). */
  private lateDraws: (() => void)[] = [];
  clicked = false;
  /** A click consumed by a button this frame. */
  used = false;
  onClick: (() => void) | null = null;
  /** Layout only: nothing is drawn, no button takes a click, hover is never true. */
  measuring = false;
  /**
   * Was the mouse over a panel at the end of the last frame? The world reads this before this frame's
   * panels are drawn (hover, ghosts, wheel zoom), because input.uiCapture is cleared every frame.
   */
  overPrev = false;
  /**
   * Rects (UI px) of what is drawn later this frame over what is drawn now: the open window and the
   * ending card. While they are set, nothing drawn now is hovered or clicked under them, so a HUD
   * button under a window never takes the window's click. The app clears them before it draws the
   * windows; begin() and end() clear them too.
   */
  occluders: Rect[] = [];

  begin(ctx: CanvasRenderingContext2D, input: Input, scale: number, time: number): void {
    this.ctx = ctx;
    this.input = input;
    this.scale = scale;
    this.time = time;
    this.w = Math.floor(ctx.canvas.width / scale);
    this.h = Math.floor(ctx.canvas.height / scale);
    this.mx = Math.floor(input.mx / scale);
    this.my = Math.floor(input.my / scale);
    this.tip = null;
    this.panels = [];
    this.clip = null;
    this.occluders = [];
    this.lateDraws = [];
    this.used = false;
    this.measuring = false;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  end(): void {
    // Whether the mouse is over a panel counts every panel, the windows' too.
    this.occluders = [];
    this.setClip(null);
    for (const f of this.lateDraws) f();
    this.lateDraws = [];
    if (this.tip) this.drawTip(this.tip);
    const over = this.panels.some((r) => this.inside(r));
    this.overPrev = over && this.input.inside;
    if (over && this.input.inside) this.input.uiCapture = true;
    if ((this.input.pressed[0] || this.input.pressed[2]) && over) this.input.dragOnUi = true;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Draw this at the end of the frame, over every panel drawn after it (a brief flash that must not hide). */
  late(draw: () => void): void {
    if (!this.measuring) this.lateDraws.push(draw);
  }

  /** Does r overlap any panel drawn so far this frame? (From a late draw: any panel at all.) */
  overPanel(r: Rect): boolean {
    return this.panels.some((p) => r.x < p.x + p.w && p.x < r.x + r.w && r.y < p.y + p.h && p.y < r.y + r.h);
  }

  /**
   * Is the mouse inside r (and inside the clip rect, when one is set)? Never while measuring, and never
   * where an occluder (a window drawn later) covers the mouse.
   */
  inside(r: Rect): boolean {
    if (this.measuring) return false;
    if (this.clip && !within(this.mx, this.my, this.clip)) return false;
    if (this.occluders.some((o) => within(this.mx, this.my, o))) return false;
    return within(this.mx, this.my, r);
  }

  hover(x: number, y: number, w: number, h: number): boolean {
    return this.inside({ x, y, w, h });
  }

  /**
   * Clip drawing and the mouse to r (null clears it). While a clip is set, buttons outside it can't be
   * hovered or clicked, and they only block the world where they show.
   */
  setClip(r: Rect | null): void {
    if (this.clip) this.ctx.restore();
    this.clip = r;
    if (r && !this.measuring) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(r.x, r.y, r.w, r.h);
      this.ctx.clip();
    } else if (r) {
      // Measuring draws nothing, but keep save/restore balanced.
      this.ctx.save();
    }
  }

  /** The part of r that shows through the clip rect (or r itself). */
  private visible(r: Rect): Rect | null {
    if (!this.clip) return r;
    const x0 = Math.max(r.x, this.clip.x);
    const y0 = Math.max(r.y, this.clip.y);
    const x1 = Math.min(r.x + r.w, this.clip.x + this.clip.w);
    const y1 = Math.min(r.y + r.h, this.clip.y + this.clip.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  private addPanel(r: Rect): void {
    const v = this.visible(r);
    if (v) this.panels.push(v);
  }

  /** Register a rect that blocks the world under it without drawing anything. */
  block(x: number, y: number, w: number, h: number): void {
    if (this.measuring) return;
    this.addPanel({ x, y, w, h });
  }

  // ---------------------------------------------------------------- frames

  /**
   * A panel. The rect is its outer edge; a 1 px ink outline sits just outside it. Thick (the default
   * from 24 x 24 up): a lit edge and a steel body, 2 px, with caps on the corners, round a well whose
   * top and left walls are in shadow; the well's clear inside runs from x + 3 to x + w - 4 and from
   * y + 3 (y + TITLE_H + 1 under a title) to y + h - 4, so content sits at x + 5 with 2 px of air.
   * With a title the frame's top widens into a riveted plate, TITLE_H tall, the title on it in the
   * heading style (plateTitle). Thin (under 24 px, or asked for): a 1 px bevel round the fill.
   */
  panel(x: number, y: number, w: number, h: number, title?: string, opts: PanelOpts = {}): void {
    if (this.measuring) return;
    const ctx = this.ctx;
    this.addPanel({ x, y, w, h });
    const thin = !title && (opts.frame === 'thin' || (opts.frame !== 'thick' && (h < 24 || w < 24)));
    // The outline is a ring, not a fill under the well, so a well with alpha shows the world through.
    frameRing(ctx, x - 1, y - 1, w + 2, h + 2, C.ink);
    ctx.globalAlpha = opts.alpha ?? 1;
    rect(ctx, x, y, w, h, opts.fill ?? C.panel);
    ctx.globalAlpha = 1;
    bevel(ctx, x, y, w, h, C.steel, C.panel2);
    if (thin) return;
    frameRing(ctx, x + 1, y + 1, w - 2, h - 2, C.slate);
    const top = title ? y + TITLE_H : y + 2;
    if (title) {
      // The plate: the frame's body carried down past the title, its lower edge shaded, then a hard
      // shadow where it stands over the well.
      rect(ctx, x + 2, y + 2, w - 4, TITLE_H - 3, C.slate);
      rect(ctx, x + 2, top - 1, w - 4, 1, C.panel2);
      rect(ctx, x + 2, top, w - 4, 1, C.ink);
      rivet(ctx, x + 3, y + 5);
      rivet(ctx, x + w - 6, y + 5);
      const t = plateTitle(title, w - 26);
      drawText(ctx, t.text, x + 8, y + 3, C.pale, C.ink, t.style);
    } else {
      rect(ctx, x + 2, top, w - 4, 1, C.night);
    }
    // The well's left wall in shadow, its bottom and right lips catching the light.
    rect(ctx, x + 2, top + 1, 1, y + h - 3 - top, C.night);
    rect(ctx, x + 3, y + h - 3, w - 5, 1, C.panel2);
    rect(ctx, x + w - 3, top + 1, 1, y + h - 4 - top, C.panel2);
    // Corner caps hold the frame's sides together.
    cornerCap(ctx, x, y);
    cornerCap(ctx, x + w - 3, y);
    cornerCap(ctx, x, y + h - 3);
    cornerCap(ctx, x + w - 3, y + h - 3);
  }

  /**
   * A recessed well inside a panel: an item slot, a list, a meter's trough. Its top and left walls are
   * in shadow and its bottom and right lips lit, so it reads as cut into the plate.
   */
  inset(x: number, y: number, w: number, h: number, fill: string = C.night): void {
    if (this.measuring) return;
    const ctx = this.ctx;
    rect(ctx, x, y, w, h, fill);
    rect(ctx, x, y, w, 1, C.ink);
    rect(ctx, x, y + 1, 1, h - 1, C.ink);
    rect(ctx, x + 1, y + h - 1, w - 1, 1, C.slate);
    rect(ctx, x + w - 1, y + 1, 1, h - 2, C.slate);
  }

  /** An engraved rule, 2 px: a shadowed groove over a lit edge. Leave 3 px under it before text. */
  hr(x: number, y: number, w: number): void {
    this.fill(x, y, w, 1, C.ink);
    this.fill(x, y + 1, w, 1, C.slate);
  }

  /**
   * An upright engraved rule, 2 px, h tall: the groove at x and its lit edge to the right, lit from the
   * top left like UI.hr. It splits readouts in a strip (the top bar) and groups in a row (the build bar).
   */
  vr(x: number, y: number, h: number): void {
    this.fill(x, y, 1, h, C.ink);
    this.fill(x + 1, y, 1, h, C.slate);
  }

  /**
   * A section header: the label in the heading style, then a rule to x + w. With `right`, that text is
   * drawn right-aligned at x + w (dim unless coloured) and the rule stops 4 px short of it. Returns the
   * height to move down (12).
   */
  section(label: string, x: number, y: number, w: number, o: { color?: string; right?: string; rightColor?: string } = {}): number {
    if (this.measuring) return 12;
    const ctx = this.ctx;
    const lw = drawText(ctx, label, x, y, o.color ?? C.gold, undefined, 'head');
    let end = x + w;
    if (o.right) {
      const rw = measureText(o.right);
      drawText(ctx, o.right, x + w - rw, y, o.rightColor ?? C.steel2);
      end = x + w - rw - 4;
    }
    const start = x + lw + 3;
    if (end - start >= 4) {
      rect(ctx, start, y + 3, end - start, 1, C.slate);
      rect(ctx, start, y + 4, end - start, 1, C.ink);
    }
    return 12;
  }

  // ---------------------------------------------------------------- text

  /** Draw text; returns its advance (width plus one spacing). */
  text(s: string, x: number, y: number, color: string = C.white, shadow?: string, style: TextStyle = 'body'): number {
    if (this.measuring) return s.length ? measureText(s, style) + 1 : 0;
    return drawText(this.ctx, s, x, y, color, shadow, style);
  }

  /** Text in the heading style (capitals, tracked): returns its advance. */
  head(s: string, x: number, y: number, color: string = C.gold, shadow?: string): number {
    return this.text(s, x, y, color, shadow, 'head');
  }

  textRight(s: string, xr: number, y: number, color: string = C.white, shadow?: string, style: TextStyle = 'body'): void {
    if (this.measuring) return;
    drawText(this.ctx, s, xr - measureText(s, style), y, color, shadow, style);
  }

  textCenter(s: string, cx: number, y: number, color: string = C.white, shadow?: string, style: TextStyle = 'body'): void {
    if (this.measuring) return;
    drawText(this.ctx, s, Math.round(cx - measureText(s, style) / 2), y, color, shadow, style);
  }

  /** Wrapped text; returns the height used. */
  para(s: string, x: number, y: number, w: number, color: string = C.white, lineH = LINE_H): number {
    const lines = wrapText(s, w);
    if (!this.measuring) lines.forEach((l, i) => drawText(this.ctx, l, x, y + i * lineH, color));
    return lines.length * lineH;
  }

  paraHeight(s: string, w: number, lineH = LINE_H): number {
    return wrapText(s, w).length * lineH;
  }

  /**
   * A rate, the same way everywhere: the amount in `color`, then its unit ("/min") in the dim colour,
   * so "per minute" is part of the number. Money rates take o.money and o.sign ("+$42/min"); o.arrow
   * puts a direction or trend first. Returns the advance.
   */
  rate(x: number, y: number, perMin: number, color: string = C.white, o: RateOpts = {}): number {
    const w = rateWidth(perMin, o);
    if (this.measuring) return w + 1;
    const ctx = this.ctx;
    const p = rateParts(perMin, o);
    const dim = o.unitColor ?? C.steel2;
    let cx = x;
    if (p.arrow) cx += drawText(ctx, p.arrow, cx, y, dim) + 1;
    cx += drawText(ctx, p.amount, cx, y, color);
    drawText(ctx, p.unit, cx, y, dim);
    return w + 1;
  }

  /** UI.rate ending at xr; returns where it starts. */
  rateRight(xr: number, y: number, perMin: number, color: string = C.white, o: RateOpts = {}): number {
    const x = xr - rateWidth(perMin, o);
    this.rate(x, y, perMin, color, o);
    return x;
  }

  // ---------------------------------------------------------------- chips, pills, counters

  /**
   * A key cap for a shortcut ("R", "Esc", "Shift"): a small raised key, its label in capitals, CHIP_H
   * tall from y - 1, so it sits in a line of text drawn at y. Returns its advance.
   */
  keyChip(key: string, x: number, y: number): number {
    const w = keyChipWidth(key);
    if (this.measuring) return w + 1;
    const ctx = this.ctx;
    rect(ctx, x, y - 1, w, CHIP_H, C.slate);
    rect(ctx, x, y - 1, w - 1, 1, C.steel2);
    rect(ctx, x, y, 1, 7, C.steel);
    rect(ctx, x + w - 1, y, 1, 7, C.panel2);
    rect(ctx, x, y + 7, w, 1, C.ink);
    drawText(ctx, key.toUpperCase(), x + 2, y, C.white);
    return w + 1;
  }

  /**
   * A shortcut as key caps: one cap ("R"), or a combination's caps joined by a dim "+" ("Ctrl+Z" is
   * [CTRL]+[Z]), the same way everywhere a combination is shown. Returns its advance.
   */
  keys(combo: string, x: number, y: number): number {
    if (this.measuring) return keysWidth(combo) + 1;
    let cx = x;
    comboKeys(combo).forEach((k, i) => {
      if (i) cx += this.join(cx, y);
      cx += this.keyChip(k, cx, y);
    });
    return cx - x;
  }

  /** The dim "+" between two key caps (or a key and a mouse) pressed together, at x after a cap's advance. Returns its advance. */
  join(x: number, y: number): number {
    if (!this.measuring) drawText(this.ctx, '+', x + 1, y, C.steel2);
    return JOIN_W;
  }

  /** "[R] Rotate", "[CTRL]+[Z] undo": the key caps, then what they do. Returns the advance. */
  keyHint(key: string, label: string, x: number, y: number, color: string = C.steel3): number {
    const w = keyHintWidth(key, label);
    if (this.measuring) return w + 1;
    const kw = this.keys(key, x, y);
    drawText(this.ctx, label, x + kw + 2, y, color);
    return w + 1;
  }

  /**
   * A mouse with one button lit ('left', 'right' or 'middle'), 7 x 8 from y - 1, for hints like
   * "right-click cancels". Returns its advance.
   */
  mouseChip(button: 'left' | 'right' | 'middle', x: number, y: number): number {
    if (this.measuring) return 8;
    const ctx = this.ctx;
    // A rounded shell, lit at the top left, its two buttons split above a seam.
    rect(ctx, x + 1, y - 1, 5, 1, C.steel2);
    rect(ctx, x, y, 1, 6, C.steel);
    rect(ctx, x + 6, y, 1, 6, C.panel2);
    rect(ctx, x + 1, y + 6, 5, 1, C.panel2);
    rect(ctx, x + 1, y, 5, 6, C.slate);
    rect(ctx, x + 1, y, 2, 2, button === 'left' ? C.pale : C.steel);
    rect(ctx, x + 4, y, 2, 2, button === 'right' ? C.pale : C.steel);
    rect(ctx, x + 3, y, 1, 2, button === 'middle' ? C.pale : C.ink);
    rect(ctx, x + 1, y + 2, 5, 1, C.ink);
    return 8;
  }

  /**
   * A badge: short text on a coloured plate with cut corners ("NEW", "MK2", "x3"), CHIP_H tall from
   * y - 1. Returns its advance.
   */
  pill(s: string, x: number, y: number, bg: string = C.slate, fg: string = C.white): number {
    const w = measureText(s) + 4;
    if (this.measuring) return w + 1;
    const ctx = this.ctx;
    rect(ctx, x + 1, y - 1, w - 2, CHIP_H, bg);
    rect(ctx, x, y, 1, CHIP_H - 2, bg);
    rect(ctx, x + w - 1, y, 1, CHIP_H - 2, bg);
    rect(ctx, x + 1, y - 1, w - 2, 1, tone(bg, 1));
    drawText(ctx, s, x + 2, y, fg);
    return w + 1;
  }

  /**
   * An icon and a count: the middle 12 x 12 of a sprite (an item's art: `i_${id}`) centred on the
   * text line at y, then the count 1 px after it. Returns the advance.
   */
  counter(x: number, y: number, spriteName: string, value: string | number, color: string = C.white): number {
    const s = String(value);
    const w = 13 + measureText(s);
    if (this.measuring) return w + 1;
    this.icon(spriteName, x, y);
    drawText(this.ctx, s, x + 13, y, color);
    return w + 1;
  }

  /**
   * An icon on a line of text at y: the middle 12 x 12 of a sprite (an item's art, `i_${id}`), from 3 px
   * above the text's top, so it centres on the capitals. Item rows, counters and lists all use it.
   */
  icon(spriteName: string, x: number, y: number, alpha = 1): void {
    this.spriteCrop(spriteName, x, y - 3, 12, 12, alpha);
  }

  /** A 7 x 7 check box, ticked in `color` or empty and sunk. */
  checkbox(x: number, y: number, on: boolean, color: string = C.lime): void {
    if (this.measuring) return;
    const ctx = this.ctx;
    rect(ctx, x, y, 7, 7, C.ink);
    rect(ctx, x + 1, y + 1, 5, 5, on ? C.panel2 : C.night);
    if (!on) {
      rect(ctx, x + 1, y + 5, 5, 1, C.panel2);
      return;
    }
    // A tick: the short stroke, then the long one up to the right.
    rect(ctx, x + 1, y + 3, 1, 1, color);
    rect(ctx, x + 2, y + 4, 1, 1, color);
    rect(ctx, x + 3, y + 3, 1, 1, color);
    rect(ctx, x + 4, y + 2, 1, 1, color);
    rect(ctx, x + 5, y + 1, 1, 1, color);
  }

  // ---------------------------------------------------------------- fills and bars

  fill(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    if (this.measuring) return;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalAlpha = 1;
  }

  /**
   * A meter: an ink-edged trough (the rect) filled from the left to frac. The fill's top row is a
   * shade lighter and, from 6 px tall, its bottom row a shade darker, so it reads as a lit bar.
   */
  bar(x: number, y: number, w: number, h: number, frac: number, color: string, back: string = C.night): void {
    if (this.measuring) return;
    this.fill(x, y, w, h, C.ink);
    this.fill(x + 1, y + 1, w - 2, h - 2, back);
    const f = Math.max(0, Math.min(1, frac));
    if (f > 0) litFill(this.ctx, x + 1, y + 1, Math.max(1, Math.round((w - 2) * f)), h - 2, color);
  }

  /**
   * A bar in n cells with 1 px gaps, `filled` of them lit (a fraction lights part of the next): stock
   * against a cap, steps of a project, at a glance. Pass frac * n for a plain fraction.
   */
  segBar(x: number, y: number, w: number, h: number, filled: number, n: number, color: string, back: string = C.night): void {
    if (this.measuring) return;
    const cells = Math.max(1, Math.floor(n));
    const inner = w - 2;
    this.fill(x, y, w, h, C.ink);
    for (let i = 0; i < cells; i++) {
      const a = x + 1 + Math.round((i * (inner + 1)) / cells);
      const b = x + 1 + Math.round(((i + 1) * (inner + 1)) / cells) - 1;
      if (b <= a) continue;
      rect(this.ctx, a, y + 1, b - a, h - 2, back);
      const lit = Math.max(0, Math.min(1, filled - i));
      if (lit > 0) litFill(this.ctx, a, y + 1, lit >= 1 ? b - a : Math.max(1, Math.round((b - a) * lit)), h - 2, color);
    }
  }

  /**
   * A scrollbar 4 px wide: a sunk track h tall with a raised thumb. `pos` is how far the view is
   * scrolled (0 top, 1 bottom) and `size` the share of the content in view (the thumb's length).
   */
  scrollbar(x: number, y: number, h: number, pos: number, size: number): void {
    if (this.measuring) return;
    const ctx = this.ctx;
    this.inset(x, y, 4, h, C.night);
    const track = h - 2;
    const th = Math.min(track, Math.max(6, Math.round(track * Math.max(0, Math.min(1, size)))));
    const ty = y + 1 + Math.round((track - th) * Math.max(0, Math.min(1, pos)));
    rect(ctx, x + 1, ty, 2, th, C.steel);
    rect(ctx, x + 1, ty, 2, 1, C.steel2);
    rect(ctx, x + 1, ty + th - 1, 2, 1, C.slate);
  }

  // ---------------------------------------------------------------- sprites and images

  sprite(name: string, x: number, y: number, scale = 1, alpha = 1): boolean {
    if (this.measuring) return true;
    const s = sprite(name);
    if (!s) return false;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, y, s.w * scale, s.h * scale);
    this.ctx.globalAlpha = 1;
    return true;
  }

  /** The middle of a sprite, at most w x h, centred in that box: big buildings as small icons, never scaled. */
  spriteCrop(name: string, x: number, y: number, w: number, h: number, alpha = 1): boolean {
    if (this.measuring) return true;
    const s = sprite(name);
    if (!s) return false;
    const cw = Math.min(w, s.w);
    const ch = Math.min(h, s.h);
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(s.img, s.x + Math.floor((s.w - cw) / 2), s.y + Math.floor((s.h - ch) / 2), cw, ch, x + Math.floor((w - cw) / 2), y + Math.floor((h - ch) / 2), cw, ch);
    this.ctx.globalAlpha = 1;
    return true;
  }

  image(img: CanvasImageSource, x: number, y: number, w?: number, h?: number): void {
    if (this.measuring) return;
    if (w != null && h != null) this.ctx.drawImage(img, x, y, w, h);
    else this.ctx.drawImage(img, x, y);
  }

  // ---------------------------------------------------------------- tooltips

  /** A tooltip at the cursor (the last one asked for this frame wins). */
  tooltip(text: string): void {
    if (this.measuring) return;
    this.tip = { text, x: this.mx + 8, y: this.my + 10 };
  }

  /**
   * A tooltip beside a rect (UI px), never over it: above and to the right of it, or to its left when
   * the right side has no room. It slides up or down to stay between the top bar and the screen's
   * bottom; being beside the rect, that never covers it.
   */
  tooltipAt(text: string, anchor: Rect): void {
    if (this.measuring) return;
    this.tip = { text, x: anchor.x + anchor.w + 2, y: anchor.y - 2, anchor };
  }

  /**
   * The size a tooltip's box takes, and how many of its lines are the title. A tip of several lines
   * ("Smelter\nWorking") has its first line, wrapped, on a title plate and the rest in the body under
   * a rule; a single line is a plate alone; a single sentence that wraps has no title at all.
   */
  tipSize(text: string): { w: number; h: number; lines: string[]; title: number } {
    const maxW = 170;
    const paras = text.split('\n');
    const lines = paras.flatMap((l) => wrapText(l, maxW));
    const w = Math.min(maxW, Math.max(...lines.map((l) => measureText(l)))) + 8;
    const title = paras.length > 1 || lines.length === 1 ? wrapText(paras[0], maxW).length : 0;
    const plate = title * LINE_H + 2;
    const body = lines.length - title;
    const h = title === 0 ? lines.length * LINE_H + 5 : body === 0 ? plate + 1 : plate + 3 + body * LINE_H;
    return { w, h, lines, title };
  }

  private drawTip(tip: Tip): void {
    const { w, h, lines, title } = this.tipSize(tip.text);
    let x = tip.x;
    let y: number;
    if (tip.anchor) {
      const a = tip.anchor;
      // Bottom-left at the rect's top-right corner; flip to its left side when the right has no room.
      if (x + w > this.w - 2) x = a.x - 2 - w;
      if (x < 2) x = Math.max(2, Math.min(this.w - 2 - w, a.x + a.w + 2));
      y = tip.y - h;
      y = Math.max(TOP_BAR_H + 3, Math.min(this.h - 2 - h, y));
    } else {
      y = tip.y;
      if (x + w > this.w - 2) x = this.w - 2 - w;
      if (y + h > this.h - 2) y = this.my - h - 4;
    }
    const ctx = this.ctx;
    rect(ctx, x - 1, y - 1, w + 2, h + 2, C.ink);
    rect(ctx, x, y, w, h, C.panel);
    if (!title) {
      // A sentence on its own: plain text in the well.
      bevel(ctx, x, y, w, h, C.steel, C.panel2);
      lines.forEach((l, i) => drawText(ctx, l, x + 4, y + 3 + i * LINE_H, C.white));
      return;
    }
    // The title on a plate, the body in the well under a hard edge.
    const plate = title * LINE_H + 2;
    rect(ctx, x, y, w, plate, C.slate);
    bevel(ctx, x, y, w, h, C.steel, C.panel2);
    lines.slice(0, title).forEach((l, i) => drawText(ctx, l, x + 4, y + 3 + i * LINE_H, C.white, C.ink));
    if (lines.length > title) {
      rect(ctx, x + 1, y + plate, w - 2, 1, C.ink);
      lines.slice(title).forEach((l, i) => drawText(ctx, l, x + 4, y + plate + 3 + i * LINE_H, C.steel3));
    }
  }

  // ---------------------------------------------------------------- buttons and links

  /**
   * A button; returns true on the frame it is clicked. A disabled button still shows its tip (it says
   * why). Raised, it has a lit top and left and a dark side under it; hovered, its face lightens;
   * pressed, it sinks 1 px. An active one is latched in: amber, shadowed at the top, its lower lip lit.
   * Text buttons read best 12 px tall (a label with descenders fits from 11).
   */
  button(x: number, y: number, w: number, h: number, label: string, o: ButtonOpts = {}): boolean {
    if (this.measuring) return false;
    const ctx = this.ctx;
    const r = { x, y, w, h };
    this.addPanel(r);
    const over = this.inside(r);
    const hov = over && !o.disabled;
    const down = hov && this.input.down[0];
    rect(ctx, x - 1, y - 1, w + 2, h + 2, C.ink);
    let col: string = C.white;
    if (o.disabled) {
      // Flat and dim: nothing to press.
      rect(ctx, x, y, w, h, C.panel);
      rect(ctx, x, y, w, 1, C.panel2);
      col = C.steel;
    } else if (down) {
      // Pushed in: the face drops into the shadow its frame casts.
      rect(ctx, x, y, w, h, o.active ? C.amber : o.danger ? C.wine1 : C.panel);
      rect(ctx, x, y, w, 1, C.ink);
      rect(ctx, x, y + 1, 1, h - 1, o.active ? C.rust1 : C.night);
      col = o.active ? C.ink : C.silver;
    } else if (o.active) {
      // Latched in: the top in shadow, the lower lip catching the light.
      rect(ctx, x, y, w, h, hov ? C.gold : C.amber);
      rect(ctx, x, y, w, 1, hov ? C.amber : C.rust1);
      rect(ctx, x, y + 1, 1, h - 1, hov ? C.amber : C.rust1);
      rect(ctx, x + 1, y + h - 1, w - 1, 1, C.pale);
      rect(ctx, x + w - 1, y + 1, 1, h - 2, hov ? C.pale : C.gold);
      col = C.ink;
    } else {
      // Raised: a lit top and left, a dark side under it.
      const face = o.danger ? (hov ? C.red : C.crimson) : o.color ? (hov ? tone(o.color, 1) : o.color) : hov ? C.slate : C.panel2;
      const lit = o.danger ? (hov ? C.coral : C.red) : o.color ? tone(o.color, hov ? 2 : 1) : hov ? C.steel2 : C.steel;
      const left = o.danger ? C.red : o.color ? tone(o.color, 1) : hov ? C.steel : C.slate;
      const side = o.danger ? C.wine1 : o.color ? tone(o.color, -2) : C.night;
      rect(ctx, x, y, w, h, face);
      rect(ctx, x, y, w, 1, lit);
      rect(ctx, x, y + 1, 1, h - 2, left);
      rect(ctx, x, y + h - 1, w, 1, side);
      rect(ctx, x + w - 1, y + 1, 1, h - 2, side);
    }
    const dy = down ? 1 : 0;
    // A shortcut's key cap at the right end, when the label still fits beside it.
    let room = w;
    if (o.key && label) {
      const kw = keyChipWidth(o.key);
      if (measureText(label) + kw + 10 <= w) {
        room = w - kw - 3;
        this.keyChip(o.key, x + w - kw - 3, y + Math.floor((h - 7) / 2) + dy);
      }
    }
    let tx = x + 4;
    if (o.iconSprite) {
      const s = sprite(o.iconSprite);
      if (s) {
        const ix = label ? x + 2 : x + Math.floor((w - s.w) / 2);
        const iy = y + Math.floor((h - s.h) / 2) + dy;
        ctx.globalAlpha = o.disabled ? 0.4 : 1;
        ctx.drawImage(s.img, s.x, s.y, s.w, s.h, ix, iy, s.w, s.h);
        ctx.globalAlpha = 1;
        tx = ix + s.w + 3;
      }
    } else if (o.icon) {
      const iw = (o.icon as HTMLCanvasElement).width;
      const ih = (o.icon as HTMLCanvasElement).height;
      const ix = label ? x + 3 : x + Math.floor((w - iw) / 2);
      ctx.globalAlpha = o.disabled ? 0.4 : 1;
      ctx.drawImage(o.icon, ix, y + Math.floor((h - ih) / 2) + dy);
      ctx.globalAlpha = 1;
      tx = ix + iw + 3;
    }
    if (o.mark) markGlyph(ctx, o.mark, x + Math.floor((w - 5) / 2), y + Math.floor((h - 5) / 2) + dy, col);
    else if (label) {
      const lw = measureText(label);
      const lx = o.iconSprite || o.icon ? tx : x + Math.floor((room - lw) / 2);
      drawText(ctx, label, lx, y + Math.floor((h - 7) / 2) + dy, col);
    }
    if (over && o.tip) this.tooltip(o.tip);
    if (hov && this.input.pressed[0] && !this.used) {
      this.used = true;
      this.input.uiCapture = true;
      this.onClick?.();
      return true;
    }
    return false;
  }

  /** Text button without chrome (links in lists): a dotted underline at rest, white and solid hovered. */
  link(x: number, y: number, label: string, color: string = C.cyan, tip?: string): boolean {
    if (this.measuring) return false;
    const w = measureText(label);
    const r = { x: x - 1, y: y - 1, w: w + 2, h: 10 };
    this.addPanel(r);
    const hov = this.inside(r);
    drawText(this.ctx, label, x, y, hov ? C.white : color);
    if (hov) this.fill(x, y + 8, w, 1, C.white);
    else for (let i = 0; i < w; i += 2) this.fill(x + i, y + 8, 1, 1, tone(color, -1));
    if (hov && tip) this.tooltip(tip);
    if (hov && this.input.pressed[0] && !this.used) {
      this.used = true;
      this.onClick?.();
      return true;
    }
    return false;
  }
}

/**
 * A title for a plate `room` px wide: in the heading style when it fits, else in capitals at body
 * spacing, else as written, and only then cut. A long milestone name stays whole and in capitals.
 */
function plateTitle(title: string, room: number): { text: string; style: TextStyle } {
  if (measureText(title, 'head') <= room) return { text: title, style: 'head' };
  const caps = title.toUpperCase();
  if (measureText(caps) <= room) return { text: caps, style: 'body' };
  // fitText leaves a title that fits as written.
  return { text: fitText(title, room), style: 'body' };
}

function within(x: number, y: number, r: Rect): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** A 1 px bevel on the rect's own edge: lit top and left, shaded bottom and right, the two corners between. */
function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: string, shade: string): void {
  rect(ctx, x, y, w - 1, 1, lit);
  rect(ctx, x, y + 1, 1, h - 2, lit);
  rect(ctx, x + 1, y + h - 1, w - 1, 1, shade);
  rect(ctx, x + w - 1, y, 1, h - 1, shade);
  rect(ctx, x + w - 1, y, 1, 1, C.slate);
  rect(ctx, x, y + h - 1, 1, 1, C.slate);
}

/** A square button's 5 x 5 mark with its top-left at (x, y): a cross, a plus, or a minus on the plus's bar. */
function markGlyph(ctx: CanvasRenderingContext2D, mark: Mark, x: number, y: number, color: string): void {
  if (mark === 'cross') {
    for (let i = 0; i < 5; i++) {
      rect(ctx, x + i, y + i, 1, 1, color);
      rect(ctx, x + 4 - i, y + i, 1, 1, color);
    }
    return;
  }
  rect(ctx, x, y + 2, 5, 1, color);
  if (mark === 'plus') rect(ctx, x + 2, y, 1, 5, color);
}

/** A 1 px ring just inside a rect. */
function frameRing(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  rect(ctx, x, y, w, 1, color);
  rect(ctx, x, y + h - 1, w, 1, color);
  rect(ctx, x, y + 1, 1, h - 2, color);
  rect(ctx, x + w - 1, y + 1, 1, h - 2, color);
}

/** A rivet head on a plate: 2 x 2, glinting at the top left, its shadow falling to the bottom right. */
function rivet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  rect(ctx, x, y, 1, 1, C.steel3);
  rect(ctx, x + 1, y, 1, 1, C.steel2);
  rect(ctx, x, y + 1, 1, 1, C.steel2);
  rect(ctx, x + 1, y + 1, 1, 1, C.steel);
  rect(ctx, x + 2, y + 1, 1, 1, C.panel2);
  rect(ctx, x + 1, y + 2, 2, 1, C.panel2);
}

/** A 3 x 3 cap over a frame's corner: a square boss lit at its top left, shaded at its bottom right. */
function cornerCap(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  rect(ctx, x, y, 3, 3, C.steel);
  rect(ctx, x, y, 2, 1, C.steel3);
  rect(ctx, x, y + 1, 1, 1, C.steel2);
  rect(ctx, x + 2, y + 1, 1, 2, C.slate);
  rect(ctx, x + 1, y + 2, 1, 1, C.slate);
}

/** A fill lit along its top and, from 4 rows, shaded along its bottom. */
function litFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  rect(ctx, x, y, w, h, color);
  if (h >= 3) rect(ctx, x, y, w, 1, tone(color, 1));
  if (h >= 4) rect(ctx, x, y + h - 1, w, 1, tone(color, -1));
}
