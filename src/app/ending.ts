// The ending sequence (PLAN §2; review 3 K3 and A6). When the Governor is complete the camera pans to
// the Heart as it wakes on the Alien Strata, then climbs layer by layer to the Surface: on each layer
// the light spreads out from the shaft (from the Heart on the Strata) and a layer card names it, and
// the rock passes between layers as the camera rises. The Surface comes up at dawn, the closing text
// plays over it, and then the thank-you card.
//
// Presentation only. It runs on real seconds (App.dt), never on the sim's endTime, so 2x speed and
// the Space pause leave it alone, and it never writes to the game: it renders its own views of the
// layers (the player's layer and cameras are untouched until the card) and the sim keeps running
// under it, machines and all. The HUD stays hidden until the card; Esc or a click skips to the card.
// The hum is set to the Heart's layer once, as it starts, and left alone through the climb, so
// nothing overrides the ending's chord (audio.ending).

import { HEART, LAYERS } from '../data/layers';
import { C } from '../data/palette';
import { audio } from '../engine/audio';
import { terrainCanvas, TILE } from '../render/terrain';
import type { EndingLook } from '../render/world';
import type { Game } from '../sim/game';
import type { App } from './app';

/** Real seconds of each beat. */
export const ENDING_BEATS = {
  /** From the player's view to the Heart. */
  pan: 3,
  /** On the Heart as it wakes, its layer named. */
  heart: 2.8,
  /** Up through the rock to the next layer. */
  rise: 1.2,
  /** On each layer on the way up, its name on the card. */
  hold: 2,
  /** On the Surface as the dawn comes up, before the text. */
  dawn: 2.6,
  /** Between two lines of the closing text; the last line holds `last` before the card. */
  line: 2,
  last: 2.8,
};

/** The closing text, over the Surface at dawn. */
export const ENDING_LINES = [
  'The hum stops.',
  'Then it comes back as a chord.',
  'Light climbs through every layer, from the Heart to the Surface.',
  'The mountain is a machine.',
  'And now it is running.',
];

/**
 * A game loaded within this much game time of the Governor's completion (a save made while the ending
 * played, or the ending scenario) plays the ending from the start; one loaded later has seen it.
 */
export const ENDING_REPLAY_S = 40;

/** The camera sits this far north of what it looks at (world px), so the subject shows under the layer card. */
const ABOVE_HEART = 64;
const ABOVE_STATION = 48;
/** The camera keeps rising while it holds on a layer: this far north over a hold (world px). */
const DRIFT = 12;
/** The rock between two layers as the camera rises, world px tall. */
const BAND_H = 96;
/** Over the Surface at dawn the view shows this much sky above the map's north edge (world px). */
const SKY_PX = 56;
/**
 * The light that spreads from the shaft as the camera reaches a layer: out to `r` world px over `s`
 * seconds, lighting revealed ground to `level` (the light map's scale: the darkness's 0.35 band).
 */
const LIFT = { r: 26 * TILE, s: 1.8, level: 0.5 };
/** The arrival bell as each layer comes up, rising through A major: A5, C#6, E6, A6, C#7. */
const BELL_SEMIS = [0, 4, 7, 12, 16];
/** After the card is dismissed, the dawn fades over this many seconds. */
const AFTER_S = 1.2;
const NO_OVERLAYS = { spores: false, heat: false, interference: false };

type BeatKind = 'pan' | 'hold' | 'rise' | 'dawn' | 'text';

interface Beat {
  kind: BeatKind;
  /** The layer shown (a rise: the layer it rises to). */
  layer: number;
  /** A rise: the layer it leaves. */
  from: number;
  t0: number;
  t1: number;
}

export type EndingStage = 'heart' | 'climb' | 'dawn' | 'text' | 'card' | 'after';

interface Cam {
  x: number;
  y: number;
}

/** A view the sequence drew this frame: which layer, and where its buffer's top-left sits in the world. */
export interface EndingView {
  layer: number;
  camX: number;
  camY: number;
  w: number;
  h: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeInOut = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
const smooth = (a: number, b: number, v: number): number => {
  const p = clamp01((v - a) / (b - a));
  return p * p * (3 - 2 * p);
};

/** A layer's card on the climb: its depth (the Surface's says dawn), its name and the line it was known by. */
export function climbCardText(layer: number): { header: string; name: string; line: string } {
  const d = LAYERS[layer];
  return {
    header: d.depth > 0 ? `${d.depth.toLocaleString('en-US')} M` : 'DAWN',
    name: d.name.toUpperCase(),
    // The subtitles open with the depth ("610 m. The crystals ring in chords."), which the header has.
    line: d.subtitle.replace(/^[\d,]+ m\. /, ''),
  };
}

export class Ending {
  /** Real seconds since the Governor was completed (or since a game loaded mid-ending began it again). */
  t = 0;
  /** For screenshots (seek): the clock stands still. */
  hold = false;
  /** The cinematic zoom: the window's default, so every window size frames the same. */
  readonly zoom: number;
  /** The layer whose hum plays through the sequence: the Heart's. */
  readonly humLayer: number;
  /** When the thank-you card shows and the HUD comes back. */
  readonly cardAt: number;
  readonly beats: Beat[];
  /** The player's view when the ending began, put back when the card is dismissed. */
  private readonly back: { layer: number; zoom: number; cams: Cam[] };
  /** Where the camera was on the Heart's layer when the ending began: the pan starts there. */
  private readonly panFrom: Cam;
  private readonly climb: number[];
  /** Layers whose terrain is drawn ahead (one a frame), so the climb never waits on a first draw. */
  private warmed = 0;
  /** The layer whose darkness, and then whose rock below it, was drawn ahead for the next rise. */
  private prepared = -1;
  private banded = -1;
  private lastT = 0;
  /** The view the card opened on, to tell whether the player has moved since. */
  private cardView: { layer: number; zoom: number; x: number; y: number } | null = null;
  /** Seconds since the card was dismissed (the dawn fades), or -1 while it hasn't been. */
  private afterT = -1;

  constructor(app: App, g: Game) {
    const T = ENDING_BEATS;
    this.zoom = app.defaultZoom();
    const heartLayer = Math.max(0, LAYERS.findIndex((l) => l.hazard === 'engine'));
    this.humLayer = heartLayer;
    // From the Heart's layer up, every layer the game has open (all six by the ending).
    this.climb = [];
    for (let l = heartLayer; l >= 0; l--) if (l <= g.s.deepest && g.layer(l).open) this.climb.push(l);
    if (!this.climb.length) this.climb.push(app.layer);
    this.back = { layer: app.layer, zoom: app.zoom, cams: app.cams.map((c) => ({ x: c.x, y: c.y })) };
    this.panFrom = { ...(app.cams[this.climb[0]] ?? this.holdCam(this.climb[0], 0)) };
    const beats: Beat[] = [];
    const add = (kind: BeatKind, layer: number, from: number, s: number): void => {
      const t0 = beats.length ? beats[beats.length - 1].t1 : 0;
      beats.push({ kind, layer, from, t0, t1: t0 + s });
    };
    const first = this.climb[0];
    add('pan', first, first, T.pan);
    add('hold', first, first, T.heart);
    for (let i = 1; i < this.climb.length; i++) {
      const l = this.climb[i];
      add('rise', l, this.climb[i - 1], T.rise);
      add(l === 0 ? 'dawn' : 'hold', l, l, l === 0 ? T.dawn : T.hold);
    }
    const last = this.climb[this.climb.length - 1];
    add('text', last, last, (ENDING_LINES.length - 1) * T.line + T.last);
    this.beats = beats;
    this.cardAt = beats[beats.length - 1].t1;
  }

  // ---------------------------------------------------------------- the clock

  /**
   * Advance the clock by real seconds `dt` (not while a blocking window is open, nor while held),
   * warm the next layer's terrain, ring the bell as each layer comes up, set up the card's view when
   * the card comes, and put the player's view back once the card is dismissed.
   */
  update(app: App, dt: number, blocked: boolean): void {
    if (!this.hold && !blocked) this.t += dt;
    const g = app.game;
    if (g) {
      // Draw ahead, so no frame of the climb waits on a first draw: every layer's terrain, one a
      // frame under the opening flash; while the camera holds on a layer, the next one's darkness,
      // then the rock it rises through (two frames apart).
      if (this.warmed < this.climb.length) terrainCanvas(g.layer(this.climb[this.warmed++]));
      const b = this.beat();
      const next = this.beats[this.beats.indexOf(b) + 1];
      if (next?.kind === 'rise' && this.cinematic()) {
        const u = (this.t - b.t0) / (b.t1 - b.t0);
        if (this.prepared !== next.layer && u > 0.4) {
          app.world.warm(g, next.layer);
          this.prepared = next.layer;
        } else if (this.prepared === next.layer && this.banded !== next.layer && u > 0.6) {
          app.world.riseBand(Math.ceil(app.canvas.width / this.zoom) + 1, BAND_H, next.from, next.layer, 0, 0);
          this.banded = next.layer;
        }
      }
    }
    let n = 0;
    for (const b of this.beats) {
      if (b.kind !== 'rise') continue;
      // A layer's bell rings as the rise into it ends (a seek or a skip past it rings nothing).
      if (this.lastT < b.t1 && this.t >= b.t1 && this.t - b.t1 < 0.5) audio.play('elevator', { volume: 0.5, pitch: Math.pow(2, BELL_SEMIS[Math.min(n, BELL_SEMIS.length - 1)] / 12) });
      n++;
    }
    this.lastT = this.t;
    if (this.t >= this.cardAt && !this.cardView && this.afterT < 0) this.openCard(app);
    if (this.afterT < 0 && this.cardView && app.endingShown) {
      this.afterT = 0;
      // Put the player back where they were, unless they have moved since the card came up.
      const v = this.cardView;
      const cam = app.cams[v.layer];
      const moved = app.layer !== v.layer || app.zoom !== v.zoom || Math.abs(cam.x - v.x) > 1 || Math.abs(cam.y - v.y) > 1;
      if (!moved) {
        app.layer = this.back.layer;
        app.zoom = this.back.zoom;
        this.back.cams.forEach((c, i) => (app.cams[i] = { ...c }));
      }
      audio.setLayer(app.layer);
    } else if (this.afterT >= 0) {
      this.afterT += dt;
      if (this.afterT >= AFTER_S) app.cine = null;
    }
  }

  /** Skip to the card (Esc or a click while the sequence plays). */
  skip(app: App): void {
    if (this.t >= this.cardAt) return;
    this.t = this.cardAt;
    this.lastT = this.t;
    this.openCard(app);
  }

  /** Jump to `t` real seconds in (for screenshots): `hold` stops the clock there. */
  seek(t: number, hold = true): void {
    this.t = Math.max(0, t);
    this.lastT = this.t;
    this.hold = hold;
  }

  /**
   * When `u` (0..1) of the way through the beat `kind` on `layer` falls (real seconds), for
   * screenshots: at('hold', 3) is the middle of the Crystal Depths' hold. The card's time if none.
   */
  at(kind: BeatKind, layer: number, u = 0.5): number {
    const b = this.beats.find((x) => x.kind === kind && x.layer === layer);
    return b ? b.t0 + (b.t1 - b.t0) * u : this.cardAt;
  }

  /** The sequence is playing: the HUD and the inspector stay hidden, and it owns the camera and the input. */
  cinematic(): boolean {
    return this.t < this.cardAt && this.afterT < 0;
  }

  stage(): EndingStage {
    if (this.afterT >= 0) return 'after';
    if (this.t >= this.cardAt) return 'card';
    const b = this.beat();
    if (b.kind === 'pan' || (b.kind === 'hold' && b.layer === this.climb[0])) return 'heart';
    if (b.kind === 'dawn' || b.kind === 'text') return b.kind;
    return 'climb';
  }

  /** The beat playing now (the first before it starts, the last after it ends). */
  private beat(): Beat {
    for (const b of this.beats) if (this.t < b.t1) return b;
    return this.beats[this.beats.length - 1];
  }

  /** The card: the last layer of the climb (the Surface) at dawn, at the cinematic zoom, for the player to take over. */
  private openCard(app: App): void {
    const end = this.beats[this.beats.length - 1];
    const last = end.layer;
    const cam = this.camOn(end, Math.ceil(app.canvas.height / this.zoom) + 1, 1);
    app.layer = last;
    app.zoom = this.zoom;
    app.cams[last] = { ...cam };
    app.selected = null;
    this.cardView = { layer: last, zoom: this.zoom, ...cam };
  }

  // ---------------------------------------------------------------- what shows

  /** The white flash as the Heart wakes (UI alpha). */
  flash(): number {
    return this.cinematic() ? Math.max(0, 0.5 - this.t * 0.2) : 0;
  }

  /** The layer card showing now, and its alpha: the Heart's layer while the camera holds on the Heart, each layer as it comes up. */
  card(): { layer: number; a: number } | null {
    if (!this.cinematic()) return null;
    const b = this.beat();
    if (b.kind !== 'hold' && b.kind !== 'dawn') return null;
    const a = Math.min(1, (this.t - b.t0) / 0.3, (b.t1 - this.t) / 0.4);
    return a > 0 ? { layer: b.layer, a } : null;
  }

  /** The closing text: how many lines show, and the band's alpha. */
  text(): { shown: number; a: number } | null {
    if (!this.cinematic()) return null;
    const b = this.beat();
    if (b.kind !== 'text') return null;
    const tt = this.t - b.t0;
    return { shown: Math.min(ENDING_LINES.length, Math.floor(tt / ENDING_BEATS.line) + 1), a: Math.min(1, tt / 0.6) };
  }

  /**
   * The ending's progress for the hum (audio.ending): it builds toward the chord through the climb,
   * and the suspension resolves (at 0.5) as the Surface comes up at dawn; full by the text's end.
   */
  chord(): number {
    if (!this.cinematic()) return 1;
    const dawn = this.beats.find((b) => b.kind === 'dawn' || b.kind === 'text')!.t0;
    if (this.t < dawn) return 0.45 * (this.t / dawn);
    return Math.min(1, 0.5 + (0.5 * (this.t - dawn)) / 6);
  }

  /** How the renderer dresses `layer` now: the light from its shaft, the Heart's rings, the dawn. */
  look(layer: number): EndingLook | undefined {
    const out: EndingLook = {};
    const last = this.climb[this.climb.length - 1];
    if (this.cinematic()) {
      if (layer === this.climb[0]) out.heart = 1;
      const s = this.liftStart(layer);
      if (s != null && this.t > s) {
        const f = this.focus(layer);
        out.lift = { x: f.x, y: f.y, r: LIFT.r * easeOut(clamp01((this.t - s) / LIFT.s)), level: LIFT.level };
      }
    }
    if (layer === last && LAYERS[layer].ambient >= 1) {
      const dawn = this.beats.find((b) => b.kind === 'dawn');
      if (dawn) {
        // The Surface comes up in the last of the night; the dawn lifts it.
        const d = this.afterT >= 0 ? 1 - clamp01(this.afterT / AFTER_S) : this.t >= dawn.t1 ? 1 : smooth(dawn.t0 + 0.2, dawn.t0 + 2.2, this.t);
        out.dawn = d;
        if (this.cinematic()) out.night = 1 - d;
        out.sun = easeOut(clamp01((this.t - dawn.t0) / (dawn.t1 - dawn.t0 + 6)));
      }
    }
    return out.lift || out.heart || out.dawn || out.night ? out : undefined;
  }

  /** When the light starts spreading on `layer`: on the Heart's layer as the pan arrives, else as the rise into it ends. */
  private liftStart(layer: number): number | null {
    if (layer === this.climb[0]) return ENDING_BEATS.pan - 1;
    const rise = this.beats.find((b) => b.kind === 'rise' && b.layer === layer);
    return rise ? rise.t1 - 0.2 : null;
  }

  // ---------------------------------------------------------------- cameras

  /** What a layer's shot looks at (world px): the Heart, the lower station the shaft from above arrives in, or on the Surface the top station at the old Drill site. */
  private focus(layer: number): Cam {
    if (layer === this.climb[0] && this.climb[0] === this.humLayer) return { x: (HEART.x + 0.5) * TILE, y: (HEART.y + 0.5) * TILE };
    const d = LAYERS[layer];
    const p = d.arrival ?? d.boreSite ?? { x: Math.floor(d.w / 2), y: Math.floor(d.h / 2) };
    return { x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE };
  }

  /** The camera holding on `layer`, `u` (0..1) of the way through the hold: drifting north. */
  private holdCam(layer: number, u: number): Cam {
    const f = this.focus(layer);
    const above = layer === this.climb[0] ? ABOVE_HEART : ABOVE_STATION;
    return { x: f.x, y: f.y - above - DRIFT * u };
  }

  /** The Surface at dawn: the top station under the text, with SKY_PX of sky above the north edge. */
  private dawnCam(layer: number, bh: number): Cam {
    return { x: this.focus(layer).x, y: Math.round(bh / 2) - SKY_PX };
  }

  /** Where the camera is on beat `b` now (or `u` of the way through it). */
  private camOn(b: Beat, bh: number, u = clamp01((this.t - b.t0) / (b.t1 - b.t0))): Cam {
    // Without a dawn (a climb that ends underground) the text plays where the last hold ended.
    const dawn = LAYERS[b.layer].ambient >= 1;
    switch (b.kind) {
      case 'pan': {
        const to = this.holdCam(b.layer, 0);
        const e = easeInOut(u);
        return { x: this.panFrom.x + (to.x - this.panFrom.x) * e, y: this.panFrom.y + (to.y - this.panFrom.y) * e };
      }
      case 'dawn': {
        const a = this.holdCam(b.layer, 0);
        const to = this.dawnCam(b.layer, bh);
        const e = easeInOut(u);
        return { x: a.x + (to.x - a.x) * e, y: a.y + (to.y - a.y) * e };
      }
      case 'text':
        return dawn ? this.dawnCam(b.layer, bh) : this.holdCam(b.layer, 1);
      default:
        return this.holdCam(b.layer, u);
    }
  }

  // ---------------------------------------------------------------- drawing

  /**
   * Draw the sequence's world into the screen (device px, W x H), shaken by (sx, sy) world px: one
   * layer, or during a rise the layer above coming down from the top, the rock, and the layer left
   * behind sliding off the bottom. Returns the main view (for the machine bed's sound).
   */
  draw(app: App, ctx: CanvasRenderingContext2D, W: number, H: number, sx: number, sy: number): EndingView {
    const z = this.zoom;
    const bw = Math.ceil(W / z) + 1;
    const bh = Math.ceil(H / z) + 1;
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);
    const b = this.beat();
    if (b.kind !== 'rise') return this.blit(app, ctx, b.layer, this.camOn(b, bh), bw, bh, 0, sx, sy);
    const p = clamp01((this.t - b.t0) / (b.t1 - b.t0));
    // Everything moves down the screen as the camera rises: the old layer off the bottom, the rock
    // after it, the new layer in from the top. Whole world pixels, so the pixel grid never shears.
    const bandPx = BAND_H * z;
    const off = Math.round((easeInOut(p) * (H + bandPx)) / z) * z;
    const fromCam = this.holdCam(b.from, 1);
    const toCam = this.holdCam(b.layer, 0);
    const bandY = off - bandPx;
    const rows = Math.ceil(H / z);
    let main: EndingView | null = null;
    if (bandY > 0) main = this.blit(app, ctx, b.layer, toCam, bw, bh, bandY - rows * z, 0, 0);
    if (bandY < H && bandY + bandPx > 0) {
      // The shaft's light sits where both layers' subjects are: the middle of the view.
      const shaft = Math.round(this.focus(b.from).x) - Math.round(fromCam.x - bw / 2);
      const band = app.world.riseBand(bw, BAND_H, b.from, b.layer, shaft, p);
      ctx.drawImage(band, 0, 0, bw, BAND_H, 0, bandY, bw * z, bandPx);
    }
    if (off < H) {
      const v = this.blit(app, ctx, b.from, fromCam, bw, bh, off, 0, 0);
      if (!main || p < 0.5) main = v;
    }
    return main ?? { layer: b.layer, camX: 0, camY: 0, w: bw, h: bh };
  }

  /** Render `layer` around `cam` and draw it at screen row `y`. */
  private blit(app: App, ctx: CanvasRenderingContext2D, layer: number, cam: Cam, bw: number, bh: number, y: number, sx: number, sy: number): EndingView {
    const g = app.game!;
    const camX = Math.round(cam.x - bw / 2) + sx;
    const camY = Math.round(cam.y - bh / 2) + sy;
    const buf = app.world.render(
      g,
      { layer, camX, camY, w: bw, h: bh },
      {
        time: app.time,
        ghosts: [],
        selected: null,
        hovered: null,
        hoverCell: null,
        rect: null,
        mode: 'select',
        overlays: NO_OVERLAYS,
        particles: app.particles,
        reveal: 0,
        ending: this.look(layer),
      },
    );
    ctx.drawImage(buf, 0, 0, bw, bh, 0, y, bw * this.zoom, bh * this.zoom);
    return { layer, camX, camY, w: bw, h: bh };
  }
}
