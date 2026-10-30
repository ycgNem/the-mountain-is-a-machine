// Immediate-mode canvas UI at a whole-number scale. Every panel drawn this frame captures the
// mouse so clicks don't fall through to the world.
//
// Two extras for panels whose content decides their size: a measure pass (`measuring`) lays the
// content out without drawing it or taking clicks, so the panel can be sized before it is drawn; and
// a clip rect (`setClip`) that both cuts the drawing and stops anything outside it from taking the
// mouse, so a scrolled list can't click through its frame.

import { C } from '../data/palette';
import type { Input } from '../engine/input';
import { sprite } from '../render/atlas';
import { drawText, LINE_H, measureText, wrapText } from './font';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ButtonOpts {
  disabled?: boolean;
  active?: boolean;
  tip?: string;
  color?: string;
  icon?: CanvasImageSource | null;
  iconSprite?: string;
  small?: boolean;
  danger?: boolean;
  key?: string;
}

/** The top bar's height: positioned tooltips never go above it. */
export const TOP_BAR_H = 15;

interface Tip {
  text: string;
  x: number;
  y: number;
  /** Placed beside this rect (UI px) instead of at the cursor. */
  anchor?: Rect;
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

  panel(x: number, y: number, w: number, h: number, title?: string, opts: { alpha?: number; fill?: string } = {}): void {
    if (this.measuring) return;
    const ctx = this.ctx;
    this.addPanel({ x, y, w, h });
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = opts.fill ?? C.panel;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.slate;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = C.night;
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x + w - 1, y, 1, h);
    if (title) {
      ctx.fillStyle = C.panel2;
      ctx.fillRect(x + 1, y + 1, w - 2, 11);
      ctx.fillStyle = C.slate;
      ctx.fillRect(x + 1, y + 12, w - 2, 1);
      // Rivets.
      ctx.fillStyle = C.steel;
      ctx.fillRect(x + 3, y + 5, 1, 1);
      ctx.fillRect(x + w - 4, y + 5, 1, 1);
      drawText(ctx, title, x + 7, y + 2, C.pale, C.ink);
    }
  }

  /** Draw text; returns its advance (width plus one spacing). */
  text(s: string, x: number, y: number, color: string = C.white, shadow?: string): number {
    if (this.measuring) return s.length ? measureText(s) + 1 : 0;
    return drawText(this.ctx, s, x, y, color, shadow);
  }

  textRight(s: string, xr: number, y: number, color: string = C.white, shadow?: string): void {
    if (this.measuring) return;
    drawText(this.ctx, s, xr - measureText(s), y, color, shadow);
  }

  textCenter(s: string, cx: number, y: number, color: string = C.white, shadow?: string): void {
    if (this.measuring) return;
    drawText(this.ctx, s, Math.round(cx - measureText(s) / 2), y, color, shadow);
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

  fill(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    if (this.measuring) return;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalAlpha = 1;
  }

  bar(x: number, y: number, w: number, h: number, frac: number, color: string, back: string = C.panel2): void {
    if (this.measuring) return;
    this.fill(x, y, w, h, C.ink);
    this.fill(x + 1, y + 1, w - 2, h - 2, back);
    const f = Math.max(0, Math.min(1, frac));
    if (f > 0) this.fill(x + 1, y + 1, Math.max(1, Math.round((w - 2) * f)), h - 2, color);
  }

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

  /** The size a tooltip's box takes. */
  tipSize(text: string): { w: number; h: number; lines: string[] } {
    const maxW = 170;
    const lines = text.split('\n').flatMap((l) => wrapText(l, maxW));
    const w = Math.min(maxW, Math.max(...lines.map((l) => measureText(l)))) + 8;
    const h = lines.length * LINE_H + 5;
    return { w, h, lines };
  }

  private drawTip(tip: Tip): void {
    const { w, h, lines } = this.tipSize(tip.text);
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
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = C.panel2;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.steel;
    ctx.fillRect(x, y, w, 1);
    lines.forEach((l, i) => {
      // First line bright, the rest softer.
      drawText(ctx, l, x + 4, y + 3 + i * LINE_H, i === 0 ? C.white : C.steel3);
    });
  }

  /** A button; returns true on the frame it is clicked. A disabled button still shows its tip (it says why). */
  button(x: number, y: number, w: number, h: number, label: string, o: ButtonOpts = {}): boolean {
    if (this.measuring) return false;
    const ctx = this.ctx;
    const r = { x, y, w, h };
    this.addPanel(r);
    const over = this.inside(r);
    const hov = over && !o.disabled;
    const down = hov && this.input.down[0];
    const base = o.active ? C.amber : o.danger ? C.crimson : o.color ?? C.panel2;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = o.disabled ? C.panel : down ? C.night : hov ? (o.active ? C.gold : C.slate) : base;
    ctx.fillRect(x, y, w, h);
    if (!down) {
      ctx.fillStyle = o.disabled ? C.panel2 : o.active ? C.pale : C.steel;
      ctx.fillRect(x, y, w, 1);
      ctx.fillStyle = C.night;
      ctx.fillRect(x, y + h - 1, w, 1);
    }
    let tx = x + 4;
    if (o.iconSprite) {
      const s = sprite(o.iconSprite);
      if (s) {
        const ix = label ? x + 2 : x + Math.floor((w - s.w) / 2);
        const iy = y + Math.floor((h - s.h) / 2) + (down ? 1 : 0);
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
      ctx.drawImage(o.icon, ix, y + Math.floor((h - ih) / 2) + (down ? 1 : 0));
      ctx.globalAlpha = 1;
      tx = ix + iw + 3;
    }
    if (label) {
      const col = o.disabled ? C.steel : o.active ? C.ink : C.white;
      const lw = measureText(label);
      const lx = o.iconSprite || o.icon ? tx : x + Math.floor((w - lw) / 2);
      drawText(ctx, label, lx, y + Math.floor((h - 7) / 2) + (down ? 1 : 0), col);
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

  /** Text button without chrome (links in lists). */
  link(x: number, y: number, label: string, color: string = C.cyan, tip?: string): boolean {
    if (this.measuring) return false;
    const w = measureText(label);
    const r = { x: x - 1, y: y - 1, w: w + 2, h: 10 };
    this.addPanel(r);
    const hov = this.inside(r);
    drawText(this.ctx, label, x, y, hov ? C.white : color);
    if (hov) this.fill(x, y + 8, w, 1, hov ? C.white : color);
    if (hov && tip) this.tooltip(tip);
    if (hov && this.input.pressed[0] && !this.used) {
      this.used = true;
      this.onClick?.();
      return true;
    }
    return false;
  }

  /** Thin divider line. */
  hr(x: number, y: number, w: number): void {
    this.fill(x, y, w, 1, C.slate);
  }
}

function within(x: number, y: number, r: Rect): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}
