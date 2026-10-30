// The App: screens, camera, tools, the frame loop, and turning game events into feedback.

import { BUILDINGS, BELT_SPEED, CATEGORIES } from '../data/buildings';
import { ITEMS, itemShort } from '../data/items';
import { HEART, LAYERS } from '../data/layers';
import { C } from '../data/palette';
import { audio } from '../engine/audio';
import { Input } from '../engine/input';
import { loadArt } from '../render/atlas';
import { Particles } from '../render/particles';
import { TILE } from '../render/terrain';
import { WorldRenderer, type GhostPiece } from '../render/world';
import { refreshEnv } from '../sim/env';
import { guideMarks } from '../sim/progress';
import { Game, type DragPiece } from '../sim/game';
import { revealComponent } from '../sim/mapgen';
import { loadSlot, saveMeta, saveToStorage, SLOTS } from '../sim/save';
import { TICK, type Building, type Dir, type GameEvent } from '../sim/types';
import { drawHud } from '../ui/hud';
import { drawInspector } from '../ui/inspector';
import { UI, type Rect } from '../ui/ui';
import { drawOverlayWindows, drawTitle, endingTextShowing, overlayRects } from '../ui/windows';
import { Ending, ENDING_REPLAY_S, type EndingView } from './ending';
import { buildScenario, SCENARIOS } from './scenarios';

export type Tool =
  | { kind: 'select' }
  | { kind: 'build'; type: string }
  | { kind: 'remove' }
  | { kind: 'dig' }
  | { kind: 'survey' };

export type WindowId = null | 'company' | 'help' | 'menu' | 'settings' | 'debug' | 'stats' | 'news' | 'savefail' | 'loaderror';

export interface Settings {
  uiScale: number; // 0 = auto
  sfx: number;
  music: number;
  shake: boolean;
}

export interface RadioMsg {
  text: string;
  who: 'mags' | 'board';
  t: number;
}

export interface Toast {
  text: string;
  kind: 'good' | 'bad' | 'info';
  t: number;
}

export interface FloatText {
  layer: number;
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

/** What a removal took, so Ctrl+Z can put it back where it stood (a bare foundation tile is type 'foundation'). */
interface Removed {
  type: string;
  layer: number;
  x: number;
  y: number;
  dir: Dir;
  recipe: string | null;
  filter: string | null;
  paused: boolean;
}

/**
 * How long the right button must be held on a building to remove it (real seconds): long enough that
 * a right-click meant to cancel never removes anything.
 */
const REMOVE_HOLD_S = 0.5;
/** A hold this short is still a click: the removal sweep only shows after it. */
const REMOVE_HOLD_SHOW_S = 0.1;
/** How many removals Ctrl+Z remembers. */
const UNDO_DEPTH = 20;

const BELT_TYPES = new Set(['belt', 'express_belt', 'insulated_belt']);
const LINE_TYPES = new Set(['belt', 'express_belt', 'insulated_belt', 'shield_wall', 'lamp', 'foundation']);
/** Drag refusals that only mean "already there": not worth a toast on a multi-piece drag. */
const NO_OP_REFUSALS = new Set(['Same building already here', 'Already a foundation']);
/** Where the camera starts on the Surface (tiles): the first line's ground (the iron deposit, the HQ and the Shipping Terminal) shows above the build bar at 1280x720. */
const START_CAM = { x: 24, y: 20.25 };
/** Windows that stop the simulation and the world's input while open. */
const BLOCKING: WindowId[] = ['menu', 'settings', 'savefail'];
const SETTINGS_KEY = 'mountain-settings';
/** The save slot played last. */
const SLOT_KEY = 'mountain-slot';

export class App {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  input: Input;
  ui = new UI();
  world = new WorldRenderer();
  particles = new Particles();
  game: Game | null = null;
  screen: 'title' | 'game' = 'title';
  layer = 0;
  cams: { x: number; y: number }[] = [];
  zoom = 3;
  tool: Tool = { kind: 'select' };
  dir: Dir = 1;
  selected: number | null = null;
  hovered: number | null = null;
  hoverCell: { x: number; y: number } | null = null;
  dragStart: { x: number; y: number; button: number } | null = null;
  /** The right button went down on the world; `used` once it removed something or cancelled digging. */
  rightPress: { used: boolean } | null = null;
  /** The building the right button is held on, and for how long (real seconds). */
  rightHold: { id: number; t: number } | null = null;
  /** Removals Ctrl+Z can put back, oldest first: each is one click, drag or hold. */
  undoStack: Removed[][] = [];
  speed = 1;
  /** The save slot this operation saves into (0..SLOTS-1). */
  slot = readSlot();
  paused = false;
  acc = 0;
  time = 0;
  /** This frame's real seconds (capped at 0.1): UI timers (toasts, Mags, floats) run on it, at any refresh rate. */
  dt = 0;
  last = 0;
  win: WindowId = null;
  helpPage = 0;
  knowledgeFocus: string | null = null;
  category = 'logistics';
  radio: RadioMsg[] = [];
  toasts: Toast[] = [];
  floats: FloatText[] = [];
  saleAcc = new Map<number, { amount: number; t: number; x: number; y: number; layer: number }>();
  card: { layer: number; t: number } | null = null;
  /** Layer hints wait until this sim tick: a breakthrough's milestone intro is out by then (milestones are checked every 15 ticks). */
  hintHold = 0;
  shake = 0;
  settings: Settings = { uiScale: 0, sfx: 0.8, music: 0.6, shake: true };
  saveTimer = 0;
  overlays = { spores: true, heat: true, interference: true };
  hintsShown = new Set<string>();
  midPan: { x: number; y: number } | null = null;
  ready = false;
  fps = 60;
  shotMode = false;
  /** Scenario sessions (?scenario=) are for testing: they never write over a player's save. */
  scenario = false;
  /** The thank-you card has been dismissed (or this game's ending was seen before it was loaded). */
  endingShown = false;
  /** The ending sequence (ending.ts), from the Governor's completion until the card is dismissed. */
  cine: Ending | null = null;
  /** A game loaded mid-ending plays it from the start on the next frame (after a scenario's own setup). */
  endingPending = false;
  /** The inspector panel this frame (UI px), so keys act on the selection when the cursor is over it. */
  inspectorRect: Rect | null = null;
  /** The open window and the ending card this frame (UI px): HUD panels they overlap step aside. */
  covers: Rect[] = [];
  /** Open the Field Manual's Knowledge tab on the page with knowledgeFocus. */
  helpJump = false;
  /** A slot whose save exists but can't be loaded (shown on the title; nothing is written over it). */
  loadError: { slot: number; error: string; raw: string } | null = null;
  /** Saving is failing (storage full or blocked): said once per run of failures. */
  saveFailing = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.input = new Input(canvas);
    this.input.onFirstGesture = () => {
      audio.init();
      audio.setVolumes(this.settings.sfx, this.settings.music);
      audio.setLayer(this.humLayer());
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) };
    } catch {
      // defaults
    }
    this.ui.onClick = () => audio.play('click');
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      audio.setPaused(document.hidden);
      // A failure here can't show anything now: its toast waits until the tab is back.
      if (document.hidden && this.screen === 'game') this.trySave();
    });
    window.addEventListener('beforeunload', () => {
      if (this.screen === 'game') this.trySave();
    });
    this.resize();
  }

  async start(): Promise<void> {
    await loadArt();
    const params = new URLSearchParams(location.search);
    const sc = params.get('scenario');
    this.shotMode = params.has('shots');
    if (sc && SCENARIOS.includes(sc)) {
      this.scenario = true;
      const g = buildScenario(sc);
      // The ending scenario completes the Governor without ever reaching the Heart: open its cavern, as
      // feeding it always has in a played game, so the ending's camera finds it awake, not in the dark.
      if (sc === 'ending') {
        const li = LAYERS.findIndex((l) => l.hazard === 'engine');
        revealComponent(g.layer(li), HEART.x, HEART.y);
        g.staticLight[li] = new Float32Array(0);
        refreshEnv(g, li, true);
      }
      this.enterGame(g, true);
      // Scenarios open on the layer they are about unless ?layer= says otherwise.
      const lay = params.get('layer');
      this.setLayer(lay != null ? Number(lay) : g.s.deepest);
      const z = params.get('zoom');
      if (z) this.zoom = Number(z);
    }
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    (window as unknown as Record<string, unknown>).__app = this;
    this.ready = true;
    (window as unknown as Record<string, unknown>).__ready = true;
  }

  saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
    audio.setVolumes(this.settings.sfx, this.settings.music);
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.input.dpr = dpr;
    this.canvas.width = Math.max(320, Math.floor(window.innerWidth * dpr));
    this.canvas.height = Math.max(240, Math.floor(window.innerHeight * dpr));
  }

  /**
   * The automatic UI scale: the one nearest 330 UI px tall, but never under 640 UI px wide (the top
   * bar's and the build bar's room), 1-4x. It is also the largest scale Settings offers.
   */
  autoScale(): number {
    return Math.max(1, Math.min(4, Math.round(this.canvas.height / 330), Math.floor(this.canvas.width / 640)));
  }

  /** The UI scale in use: the chosen one, capped at what fits this window (autoScale), or the automatic one. */
  uiScale(): number {
    const auto = this.autoScale();
    return this.settings.uiScale > 0 ? Math.min(this.settings.uiScale, auto) : auto;
  }

  defaultZoom(): number {
    return Math.max(2, Math.min(5, Math.round(this.canvas.width / (TILE * 42))));
  }

  // ------------------------------------------------------------------ game lifecycle

  hasSave(): boolean {
    for (let i = 0; i < SLOTS; i++) if (saveMeta(i)) return true;
    return false;
  }

  /** Real games save; scenario and screenshot sessions never touch the player's slots. */
  canSave(): boolean {
    return !this.shotMode && !this.scenario;
  }

  /** Start a new operation in a save slot. */
  newGame(slot = this.slot): void {
    this.scenario = false;
    this.useSlot(slot);
    this.enterGame(Game.create(20261030), false);
  }

  /**
   * Load a slot's operation (or start one there if it is empty). A save that exists but can't be
   * loaded (a newer build's, or damaged) keeps the title up with an error: no new game is ever started
   * over it, so nothing can save over it.
   */
  continueGame(slot = this.slot): void {
    const r = loadSlot(slot);
    if (r.status === 'error') {
      this.loadError = { slot, error: r.error, raw: r.raw };
      this.win = 'loaderror';
      return;
    }
    this.scenario = false;
    this.useSlot(slot);
    if (r.status === 'ok') this.enterGame(r.game, false);
    else this.newGame(slot);
  }

  /** Save this operation now. A failure (storage full or blocked) is toasted once per run of failures. */
  trySave(): boolean {
    if (!this.game || !this.canSave()) return false;
    const ok = saveToStorage(this.game, this.slot);
    if (ok) this.saveFailing = false;
    else if (!this.saveFailing) {
      this.saveFailing = true;
      this.toast('Could not save (storage full or blocked): export a save file from the menu', 'bad');
    }
    return ok;
  }

  useSlot(slot: number): void {
    this.slot = Math.max(0, Math.min(SLOTS - 1, slot));
    try {
      localStorage.setItem(SLOT_KEY, String(this.slot));
    } catch {
      // storage blocked: the slot just isn't remembered
    }
  }

  enterGame(g: Game, quiet: boolean): void {
    this.game = g;
    this.screen = 'game';
    this.cams = LAYERS.map((d) => {
      const c = d.arrival ?? { x: 30, y: 22 };
      return { x: (c.x + 2) * TILE, y: (c.y + 4) * TILE };
    });
    this.cams[0] = { x: START_CAM.x * TILE, y: START_CAM.y * TILE };
    this.zoom = this.defaultZoom();
    this.layer = Math.max(0, Math.min(g.s.deepest, this.layer));
    if (g.s.deepest > 0 && !quiet) this.layer = g.s.deepest;
    this.selected = null;
    this.tool = { kind: 'select' };
    this.radio = [];
    this.toasts = [];
    this.win = null;
    this.card = null;
    this.hintHold = 0;
    // A game loaded while its ending was playing (a save made then, or the ending scenario) plays it
    // again from the start; one loaded later has seen it.
    const replay = g.s.ended && g.s.endTime < ENDING_REPLAY_S;
    this.endingShown = g.s.ended && !replay;
    this.cine = null;
    this.endingPending = replay;
    // Drain setup events (Mags's first line stays).
    const evs = g.events.splice(0);
    for (const e of evs) if (e.t === 'message') this.pushRadio(e.text, e.who);
    if (quiet) this.radio = [];
    audio.setLayer(this.layer);
  }

  /** Save and go back to the title. If the save fails, stay in the game and say so (unless `force`). */
  quitToTitle(force = false): void {
    if (!force && this.game && this.canSave() && !saveToStorage(this.game, this.slot)) {
      this.win = 'savefail';
      return;
    }
    this.scenario = false;
    this.screen = 'title';
    this.win = null;
    this.selected = null;
    this.inspectorRect = null;
    this.cine = null;
    this.endingPending = false;
  }

  /** The layer whose hum plays: the Heart's while the ending runs (nothing changes it mid-climb), else the shown one. */
  humLayer(): number {
    return this.cine && this.cine.stage() !== 'after' ? this.cine.humLayer : this.layer;
  }

  /**
   * The ending sequence begins (the Governor is complete, or a game loaded mid-ending): it takes the
   * screen from the player's view, the hum goes to the Heart's layer once, and nothing is selected.
   */
  startEnding(): void {
    const g = this.game;
    if (!g || !g.s.ended) return;
    this.endingPending = false;
    this.endingShown = false;
    this.cine = new Ending(this, g);
    this.selected = null;
    this.dragStart = null;
    this.hovered = null;
    this.hoverCell = null;
    audio.setLayer(this.cine.humLayer);
  }

  /** Screenshots and tests: jump the ending to `t` real seconds in, held there (starting it if it waits). */
  seekEnding(t: number, hold = true): void {
    if (this.endingPending) this.startEnding();
    this.cine?.seek(t, hold);
  }

  setLayer(n: number): void {
    const g = this.game;
    if (!g) return;
    // While the ending plays it owns the camera (and the hum stays on the Heart's chord).
    if (this.cine?.cinematic()) return;
    if (n < 0 || n > g.s.deepest || !g.layer(n).open) return;
    if (n === this.layer) return;
    this.layer = n;
    this.selected = null;
    if (!g.s.visited.includes(n)) g.s.visited.push(n);
    audio.setLayer(n);
    audio.play('elevator');
    if (this.tool.kind === 'build' && !g.canBuild(this.tool.type)) this.tool = { kind: 'select' };
    if (this.tool.kind === 'survey' && n === 0) this.tool = { kind: 'select' };
  }

  // ------------------------------------------------------------------ frame

  frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.dt = dt;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (this.screen === 'title' || !this.game) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.covers = [];
      this.ui.begin(ctx, this.input, this.uiScale(), this.time);
      drawTitle(this);
      this.ui.end();
      if (this.input.hit('Escape')) this.win = null;
      this.input.endFrame();
      requestAnimationFrame((t) => this.frame(t));
      return;
    }
    const g = this.game;
    // Simulation.
    const blocking = BLOCKING.includes(this.win);
    if (!this.paused && !blocking) {
      this.acc += dt * this.speed * g.speedMul;
      let n = 0;
      const maxTicks = 60 * 25;
      while (this.acc >= TICK && n < maxTicks) {
        g.tick();
        this.acc -= TICK;
        n++;
      }
      if (n >= maxTicks) this.acc = 0;
    }
    this.handleEvents(g, dt);
    // The ending sequence: a game loaded mid-ending starts it now (after a scenario's own setup), and
    // it runs on real seconds, not while a blocking window is open.
    if (this.endingPending) this.startEnding();
    this.cine?.update(this, dt, BLOCKING.includes(this.win));
    const cinematic = endingTextShowing(this);
    this.particles.update(dt);
    if (!cinematic) this.updateCamera(dt);
    // Visit tracking (milestone "Down the Shaft"). The ending's climb leaves this.layer alone.
    if (!g.s.visited.includes(this.layer)) g.s.visited.push(this.layer);
    // World.
    const W = this.canvas.width;
    const H = this.canvas.height;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0 && this.settings.shake) {
      sx = Math.round((Math.random() - 0.5) * this.shake * 6);
      sy = Math.round((Math.random() - 0.5) * this.shake * 6);
      this.shake = Math.max(0, this.shake - dt);
    }
    let view: EndingView;
    if (cinematic) {
      // The sequence draws its own views of the layers; nothing in the world is hovered meanwhile.
      this.hoverCell = null;
      this.hovered = null;
      view = this.cine!.draw(this, ctx, W, H, sx, sy);
    } else {
      const z = this.zoom;
      const bw = Math.ceil(W / z) + 1;
      const bh = Math.ceil(H / z) + 1;
      const cam = this.cams[this.layer];
      const camX = Math.round(cam.x - bw / 2) + sx;
      const camY = Math.round(cam.y - bh / 2) + sy;
      this.updateHover(camX, camY);
      const ghosts = this.computeGhosts();
      const buf = this.world.render(
        g,
        { layer: this.layer, camX, camY, w: bw, h: bh },
        {
          time: this.time,
          ghosts,
          selected: this.selected,
          hovered: this.hovered,
          hoverCell: this.hoverCell,
          rect: this.dragRect(),
          mode: this.tool.kind,
          overlays: {
            spores: this.overlays.spores,
            heat: this.overlays.heat,
            interference: this.overlays.interference,
          },
          particles: this.particles,
          reveal: 0,
          removeHold: this.removeHoldRect(),
          guides: guideMarks(g, this.layer),
          // The dawn stays on the Surface under the thank-you card.
          ending: this.cine?.look(this.layer),
        },
      );
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(buf, 0, 0, bw, bh, 0, 0, bw * z, bh * z);
      view = { layer: this.layer, camX, camY, w: bw, h: bh };
    }
    const camX = view.camX;
    const camY = view.camY;
    // UI. While the ending plays the HUD and the inspector step aside (its cards and text would slice them).
    this.ui.begin(ctx, this.input, this.uiScale(), this.time);
    this.covers = cinematic ? [] : overlayRects(this);
    // The HUD and the inspector are drawn before the window over them: under it they take no hover
    // and no click (the build bar's buttons would otherwise take the window's own clicks).
    this.ui.occluders = this.covers;
    drawHud(this, camX, camY, !cinematic);
    this.inspectorRect = null;
    if (this.selected != null && !cinematic) drawInspector(this);
    this.ui.occluders = [];
    drawOverlayWindows(this);
    this.ui.end();
    // World input after the UI has claimed what it needs. While the ending plays: Esc or a click skips
    // to the card, and only Space and Tab (the sim's pause and speed) still work.
    if (cinematic) this.endingKeys();
    else {
      this.handleWorldInput(camX, camY);
      this.handleKeys();
    }
    // Autosave.
    this.saveTimer += dt;
    if (this.saveTimer > 60 && this.canSave()) {
      this.saveTimer = 0;
      this.trySave();
    }
    // Audio bed.
    if (Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) this.feedAudio(g, view);
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** The keys and clicks the ending takes while it plays. */
  private endingKeys(): void {
    const k = this.input;
    const blocking = BLOCKING.includes(this.win);
    if (k.hit('Escape')) {
      if (this.win) this.win = null;
      else this.cine?.skip(this);
    } else if (!blocking && (k.pressed[0] || k.pressed[2])) this.cine?.skip(this);
    if (blocking) return;
    if (k.hit(' ')) this.paused = !this.paused;
    if (k.hit('Tab')) this.speed = this.speed >= 2 ? 1 : 2;
  }

  /** The machine bed for what the view shows (the ending's climb included), and the ending's chord. */
  private feedAudio(g: Game, v: EndingView): void {
    const { camX, camY } = v;
    const bw = v.w;
    const bh = v.h;
    let count = 0;
    const fam = { heat: 0, crystal: 0, fabrication: 0, extraction: 0 };
    for (const b of g.s.buildings.values()) {
      if (b.layer !== v.layer || b.workT > 0.5 || b.planned) continue;
      if (b.x * TILE < camX - 64 || b.y * TILE < camY - 64 || b.x * TILE > camX + bw + 64 || b.y * TILE > camY + bh + 64) continue;
      const d = BUILDINGS[b.type];
      if (d.size < 2) continue;
      count++;
      if (['smelter', 'foundry', 'pressure_forge', 'thermal_extractor', 'cooling_bath', 'generator'].includes(b.type)) fam.heat++;
      else if (['cutter', 'charger', 'overcharger', 'crusher', 'stabilizer', 'resonance_tap'].includes(b.type)) fam.crystal++;
      else if (d.kind === 'miner' || d.kind === 'collector') fam.extraction++;
      else fam.fabrication++;
    }
    audio.machines(count, fam);
    // The chord follows the sequence's own clock (real seconds), so 2x and the pause leave it alone.
    if (g.s.ended) audio.ending(this.cine ? this.cine.chord() : 1);
  }

  // ------------------------------------------------------------------ events

  pushRadio(text: string, who: 'mags' | 'board'): void {
    if (this.radio.length && this.radio[this.radio.length - 1].text === text) return;
    this.radio.push({ text, who, t: 0 });
    if (this.radio.length > 6) this.radio.shift();
  }

  toast(text: string, kind: Toast['kind'] = 'info'): void {
    this.toasts.push({ text, kind, t: 0 });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  hint(key: string, text: string): void {
    if (this.hintsShown.has(key)) return;
    this.hintsShown.add(key);
    this.pushRadio(text, 'mags');
  }

  /** Turn the sim's events into feedback; `dt` (real seconds) ages the toasts and floats. */
  private handleEvents(g: Game, dt: number): void {
    const evs: GameEvent[] = g.events.splice(0);
    for (const e of evs) {
      switch (e.t) {
        case 'sale': {
          const key = e.layer * 10000 + e.y * 100 + e.x;
          const a = this.saleAcc.get(key) ?? { amount: 0, t: this.time, x: e.x, y: e.y, layer: e.layer };
          a.amount += e.amount;
          this.saleAcc.set(key, a);
          audio.play('sale');
          break;
        }
        case 'message':
          this.pushRadio(e.text, e.who);
          break;
        case 'toast':
          this.toast(e.text, e.kind);
          if (e.kind === 'bad') audio.play('error');
          break;
        case 'milestone':
          this.toast(`Milestone: ${e.name}`, 'good');
          audio.play('milestone');
          break;
        case 'breakthrough':
          this.card = { layer: e.layer, t: 0 };
          this.hintHold = g.s.tick + 30;
          this.shake = 1.6;
          audio.play('breakthrough');
          this.setLayer(e.layer);
          {
            const a = LAYERS[e.layer].arrival;
            if (a) this.cams[e.layer] = { x: (a.x + 2) * TILE, y: (a.y + 3) * TILE };
          }
          break;
        case 'placed':
          if (e.layer === this.layer) {
            audio.play('place');
            const d = BUILDINGS[e.type];
            if (d) this.particles.burst(e.layer, e.x * TILE + d.size * 8, e.y * TILE + d.size * 8, 4 + d.size * 2, [C.sand, C.steel3], 20, 0.4, 30);
          }
          break;
        case 'removed':
          if (e.layer === this.layer) audio.play('remove');
          break;
        case 'dug':
          if (e.layer === this.layer) {
            this.particles.burst(e.layer, e.x * TILE + 8, e.y * TILE + 8, 8, [LAYERS[e.layer].wall[0], LAYERS[e.layer].floor[2]], 30, 0.6, 60, 2);
            audio.play('dig');
          }
          break;
        case 'reveal':
          if (e.layer === this.layer) {
            audio.play('reveal');
            this.toast(`Broke into a cavern (${e.cells} tiles)`, 'good');
          }
          break;
        case 'survey':
          audio.play('survey');
          for (let r = 0; r < 3; r++) this.particles.burst(e.layer, e.x * TILE + 8, e.y * TILE + 8, 24, [C.cyan, C.ice], 120 + r * 40, 0.8);
          break;
        case 'assay':
          audio.play('assay');
          this.knowledgeFocus = e.id;
          this.win = 'help';
          this.helpPage = 1;
          this.helpJump = true;
          break;
        case 'node_awake':
          // Each Heartstone wakes the node's conduit a ring further out: a pulse, and light running
          // along the tiles that just woke.
          if (e.layer === this.layer) {
            audio.play('pulse');
            const L = g.layer(e.layer);
            const per = e.tiles.length > 60 ? 2 : e.tiles.length > 20 ? 3 : 4;
            e.tiles.forEach((i, n) => {
              const px = (i % L.w) * TILE + 8;
              const py = Math.floor(i / L.w) * TILE + 8;
              this.particles.burst(e.layer, px, py, per, [C.cyan, C.ice, C.white], 16, 0.9, -12);
              if (n % 3 === 0) this.particles.burst(e.layer, px, py, 1, [C.white, C.cyan], 8, 1.2, -16, 2);
            });
          }
          if (e.ring > 1) this.toast(`Conduit ring ${e.ring}/${e.rings} awake${e.cells ? `: ${e.cells} tiles lit` : ''}`, 'good');
          break;
        case 'contract':
          audio.play('contract');
          break;
        case 'shatter':
          if (e.layer === this.layer) {
            this.particles.burst(e.layer, e.x * TILE + 8, e.y * TILE + 8, 10, [C.ice, C.white, C.cyan], 40, 0.5, 40);
            audio.play('shatter');
          }
          this.hint('shatter', 'That overcharged crystal shattered on the belt. Point the Overcharger straight into a Stabilizer.');
          break;
        case 'project_item':
          if (e.layer === this.layer && Math.random() < 0.3) audio.play('drill_tick');
          break;
        case 'ending':
          this.shake = 2.5;
          audio.play('breakthrough');
          // The ending takes the screen: an open Company or Field Manual window would sit over it.
          if (!BLOCKING.includes(this.win)) this.win = null;
          this.startEnding();
          break;
      }
    }
    // Turn accumulated sales into one floating number per terminal per second.
    for (const [k, a] of this.saleAcc) {
      if (this.time - a.t >= 1) {
        if (a.layer === this.layer) this.floats.push({ layer: a.layer, x: a.x * TILE + 8, y: a.y * TILE - 4, text: `+$${Math.round(a.amount)}`, color: C.pale, t: 0 });
        this.saleAcc.delete(k);
      }
    }
    // Real seconds, so a 144 Hz display doesn't hurry them.
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.5);
    // No toast is drawn while the ending plays: they wait for the HUD to come back (the milestones the
    // ending lands toast then, beside the thank-you card).
    if (!endingTextShowing(this)) {
      for (const t of this.toasts) t.t += dt;
      this.toasts = this.toasts.filter((t) => t.t < 4.5);
    }
    // The breakthrough card ages where it is drawn (hud.ts), only while nothing covers it.
    if (this.card && this.card.t > 5) this.card = null;
    // Contextual hints (none once the mountain is awake: every conduit is lit, nothing is new).
    if (g.s.ended) return;
    // A layer's hint waits for Mags's introduction to it: nothing until the breakthrough's milestone
    // intro is out, nor while the breakthrough card is up or the radio still has messages to show, so
    // the intro comes first and nothing stacks behind it.
    if (this.card || this.radio.length || g.s.tick < this.hintHold) return;
    if (g.s.deepest >= 1 && this.layer === 1) this.hint('dark', "It's dark down here. Lamps (Utility) light it up. E digs, F surveys.");
    if (this.layer === 2) this.hint('spores', 'See that pink haze? Spores. Machines in it run slow. Toggle the overlay in the top bar.');
    if (this.layer === 3) this.hint('interference', 'Powered machines close together make the crystal machines stutter. Watch the arcs.');
    if (this.layer === 4) this.hint('heat', 'Hot ground near the magma overheats machines. Foundations fix that; forges love it.');
    if (this.layer === 5) this.hint('conduits', 'Those dark channels are conduits. Each Heartstone an Engine Node makes wakes them a ring further out; a machine on two awake tiles runs on the mountain.');
  }

  // ------------------------------------------------------------------ camera

  private updateCamera(dt: number): void {
    const g = this.game!;
    const cam = this.cams[this.layer];
    const k = this.input;
    if (this.win !== 'menu') {
      const sp = (900 / this.zoom) * dt * (k.key('Shift') ? 2 : 1);
      if (k.key('w') || k.key('ArrowUp')) cam.y -= sp;
      if (k.key('s') || k.key('ArrowDown')) cam.y += sp;
      if (k.key('a') || k.key('ArrowLeft')) cam.x -= sp;
      if (k.key('d') || k.key('ArrowRight')) cam.x += sp;
    }
    // Middle-drag pan.
    if (k.down[1]) {
      if (this.midPan) {
        cam.x -= (k.mx - this.midPan.x) / this.zoom;
        cam.y -= (k.my - this.midPan.y) / this.zoom;
      }
      this.midPan = { x: k.mx, y: k.my };
    } else this.midPan = null;
    // Zoom about the cursor (not over a panel: the inspector uses the wheel itself).
    if (k.wheel && !k.uiCapture && !this.ui.overPrev) {
      const old = this.zoom;
      const nz = Math.max(1, Math.min(6, this.zoom - Math.sign(k.wheel)));
      if (nz !== old) {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const wx = cam.x + (k.mx - W / 2) / old;
        const wy = cam.y + (k.my - H / 2) / old;
        this.zoom = nz;
        cam.x = wx - (k.mx - W / 2) / nz;
        cam.y = wy - (k.my - H / 2) / nz;
      }
    }
    const L = g.layer(this.layer);
    cam.x = Math.max(0, Math.min(L.w * TILE, cam.x));
    cam.y = Math.max(0, Math.min(L.h * TILE, cam.y));
  }

  /** Mouse to world cell. */
  cellAt(camX: number, camY: number): { x: number; y: number } {
    const wx = camX + this.input.mx / this.zoom;
    const wy = camY + this.input.my / this.zoom;
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }

  private updateHover(camX: number, camY: number): void {
    const g = this.game!;
    // Over a panel nothing in the world is hovered, except while a drag runs on under it. While a
    // blocking window is open (menu, Settings, the save-failure dialog) the world takes no input, so
    // nothing is hovered at all: no tooltips, no build ghosts, no drag rectangle.
    if (BLOCKING.includes(this.win) || !this.input.inside || (this.ui.overPrev && !this.dragStart)) {
      this.hoverCell = null;
      this.hovered = null;
      return;
    }
    const c = this.cellAt(camX, camY);
    this.hoverCell = c;
    const b = g.at(this.layer, c.x, c.y);
    this.hovered = b ? b.id : null;
  }

  // ------------------------------------------------------------------ tools and placement

  /** Top-left cell for a building of `size` centered on the cursor cell. */
  anchor(type: string, c: { x: number; y: number }): { x: number; y: number } {
    const size = BUILDINGS[type].size;
    const off = Math.floor((size - 1) / 2);
    return { x: c.x - off, y: c.y - off };
  }

  linePath(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; dir: Dir }[] {
    const out: { x: number; y: number; dir: Dir }[] = [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return [{ x: a.x, y: a.y, dir: this.dir }];
    const horizFirst = Math.abs(dx) >= Math.abs(dy);
    const hd: Dir = dx >= 0 ? 1 : 3;
    const vd: Dir = dy >= 0 ? 2 : 0;
    let x = a.x;
    let y = a.y;
    if (horizFirst) {
      while (x !== b.x) {
        out.push({ x, y, dir: hd });
        x += Math.sign(dx);
      }
      if (dy === 0) out.push({ x, y, dir: hd });
      while (y !== b.y) {
        out.push({ x, y, dir: vd });
        y += Math.sign(dy);
      }
      if (dy !== 0) out.push({ x, y, dir: vd });
    } else {
      while (y !== b.y) {
        out.push({ x, y, dir: vd });
        y += Math.sign(dy);
      }
      if (dx === 0) out.push({ x, y, dir: vd });
      while (x !== b.x) {
        out.push({ x, y, dir: hd });
        x += Math.sign(dx);
      }
      if (dx !== 0) out.push({ x, y, dir: hd });
    }
    return out;
  }

  /**
   * The pieces a build tool lays from a drag (or a single click): a belt line keeps each tile's travel
   * direction; anything else faces the placement direction (R).
   */
  private toolPieces(type: string, start: { x: number; y: number; button: number } | null, cell: { x: number; y: number }): { x: number; y: number; dir: Dir }[] {
    const pieces: { x: number; y: number; dir: Dir }[] = [];
    if (LINE_TYPES.has(type) && start && start.button === 0) {
      if (type === 'foundation') {
        const r = this.rectOf(start, cell);
        for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) pieces.push({ x, y, dir: this.dir });
      } else {
        for (const p of this.linePath(start, cell)) pieces.push(BELT_TYPES.has(type) ? p : { ...p, dir: this.dir });
      }
    } else {
      const a = this.anchor(type, cell);
      pieces.push({ x: a.x, y: a.y, dir: this.dir });
    }
    return pieces;
  }

  /**
   * The build preview, exactly as the release will lay it (Game.placeDrag): crossings first, then the
   * rest in drag order, each checked against what the pieces before it left in the depot (a piece paid
   * now takes its cost and gives back the working pieces it replaces, less rushed goods).
   */
  private computeGhosts(): GhostPiece[] {
    const g = this.game!;
    if (this.tool.kind !== 'build' || !this.hoverCell) return [];
    if ((this.ui.overPrev || this.input.uiCapture) && !this.dragStart) return [];
    const type = this.tool.type;
    const plan = this.dragPlan(type, this.toolPieces(type, this.dragStart, this.hoverCell).slice(0, 400));
    const out: GhostPiece[] = plan.map((p) => ({ type: p.type, x: p.x, y: p.y, dir: p.dir, ok: false, planned: false, skip: p.skip }));
    const order = plan.map((_, i) => i).filter((i) => !plan[i].skip);
    order.sort((a, b) => (plan[a].type === 'crossing' ? 0 : 1) - (plan[b].type === 'crossing' ? 0 : 1) || a - b);
    const stock: Record<string, number> = { ...g.layer(this.layer).stock };
    for (const i of order) {
      const p = plan[i];
      const chk = g.canPlace(p.type, this.layer, p.x, p.y, p.dir, stock);
      out[i].ok = chk.ok;
      out[i].planned = !!chk.planned;
      // A drag along a line that is already there changes nothing on those tiles: show what stands.
      if (!chk.ok && plan.length > 1 && NO_OP_REFUSALS.has(chk.reason ?? '')) out[i].skip = true;
      if (!chk.ok || chk.planned) continue;
      for (const id of chk.replace ?? []) {
        const o = g.b(id);
        if (!o || o.planned) continue;
        for (const [k, v] of Object.entries(BUILDINGS[o.type].cost)) stock[k] = (stock[k] ?? 0) + v - (o.rushed?.[k] ?? 0);
      }
      for (const [k, v] of Object.entries(BUILDINGS[p.type].cost)) stock[k] = (stock[k] ?? 0) - v;
    }
    return out;
  }

  private dragPlan(type: string, pieces: { x: number; y: number; dir: Dir }[]): DragPiece[] {
    return this.game!.planDrag(this.layer, type, pieces);
  }

  rectOf(a: { x: number; y: number }, b: { x: number; y: number }): { x0: number; y0: number; x1: number; y1: number } {
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  }

  dragRect(): { x0: number; y0: number; x1: number; y1: number; kind: 'dig' | 'remove' } | null {
    if (!this.dragStart || !this.hoverCell) return null;
    const removing = this.tool.kind === 'remove' || this.dragStart.button === 2;
    if (this.tool.kind === 'dig' && this.dragStart.button === 0) return { ...this.rectOf(this.dragStart, this.hoverCell), kind: 'dig' };
    if (removing) return { ...this.rectOf(this.dragStart, this.hoverCell), kind: 'remove' };
    return null;
  }

  private handleWorldInput(camX: number, camY: number): void {
    const g = this.game!;
    const k = this.input;
    if (BLOCKING.includes(this.win)) return;
    const overUi = k.uiCapture || k.dragOnUi;
    const c = this.cellAt(camX, camY);
    // Press: start drags.
    if (!overUi && k.pressed[0]) {
      if (this.tool.kind === 'select') {
        const b = g.at(this.layer, c.x, c.y);
        this.selected = b ? b.id : null;
        if (b) audio.play('click');
        if (b?.type === 'drill') g.s.stats.events.drill_inspected = 1;
      } else if (this.tool.kind === 'survey') {
        // Only a survey that reaches unsurveyed map costs anything; otherwise say why not.
        const chk = g.surveyCheck(this.layer, c.x, c.y);
        if (chk.ok && g.survey(this.layer, c.x, c.y)) this.toast(`Survey: $${LAYERS[this.layer].surveyCost}, ${chk.cells} tiles`, 'info');
        else this.toast(chk.reason ?? 'Nothing to survey here', 'bad');
      } else {
        this.dragStart = { x: c.x, y: c.y, button: 0 };
      }
    }
    // The right button never removes on a click: right-click-to-remove cost players buildings by
    // accident. A click cancels (the tool, else the selection). Held on a building for REMOVE_HOLD_S it
    // removes that one, as an undoable removal; moving on to another while still holding starts that
    // one's own hold. In the Dig tool a right-drag cancels the queued digging under it instead.
    if (!overUi && k.pressed[2]) {
      this.rightPress = { used: false };
      this.rightHold = null;
      if (this.tool.kind === 'dig') this.dragStart = { x: c.x, y: c.y, button: 2 };
    }
    if (this.rightPress && k.down[2] && this.tool.kind !== 'dig') this.holdToRemove();
    // Release: apply.
    if (this.dragStart && ((this.dragStart.button === 0 && k.released[0]) || (this.dragStart.button === 2 && k.released[2]))) {
      const ds = this.dragStart;
      this.dragStart = null;
      if (ds.button === 2) {
        const r = this.rectOf(ds, c);
        const cells = [];
        for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) cells.push({ x, y });
        const L = g.layer(this.layer);
        const queued = L.digQueue.length;
        g.cancelDig(this.layer, cells);
        if (L.digQueue.length < queued && this.rightPress) this.rightPress.used = true;
      } else if (this.tool.kind === 'remove') {
        const r = this.rectOf(ds, c);
        const L = g.layer(this.layer);
        const batch: Removed[] = [];
        const seen = new Set<number>();
        for (let y = r.y0; y <= r.y1; y++) {
          for (let x = r.x0; x <= r.x1; x++) {
            const b = g.at(this.layer, x, y);
            if (b) {
              if (seen.has(b.id)) continue;
              seen.add(b.id);
              const was = removedOf(b);
              if (g.remove(this.layer, x, y)) batch.push(was);
            } else if (L.foundation[y * L.w + x] && g.remove(this.layer, x, y)) {
              batch.push({ type: 'foundation', layer: this.layer, x, y, dir: 0, recipe: null, filter: null, paused: false });
            }
          }
        }
        this.pushUndo(batch);
        if (batch.length && this.selected != null && !g.b(this.selected)) this.selected = null;
      } else if (this.tool.kind === 'dig') {
        const r = this.rectOf(ds, c);
        const cells = [];
        for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) cells.push({ x, y });
        const n = g.queueDig(this.layer, cells);
        if (n) this.toast(`Excavating ${n} tiles ($${n * g.digCost(this.layer)})`, 'info');
      } else if (this.tool.kind === 'build') {
        // The sim lays it (crossings first, so a crossing gets the goods before plain belts) and lists
        // what it refused; every real refusal is said, so a drag never silently stops short.
        const type = this.tool.type;
        const pieces = this.toolPieces(type, ds, c);
        const crossings = this.dragPlan(type, pieces).filter((p) => !p.skip && p.type === 'crossing').length;
        const r = g.placeDrag(this.layer, type, pieces);
        const refused = pieces.length === 1 ? r.refused : r.refused.filter((f) => !NO_OP_REFUSALS.has(f.reason));
        const crossFail = refused.filter((f) => f.type === 'crossing');
        const laid = crossings - crossFail.length;
        if (laid > 0) this.toast(`${laid} crossing${laid === 1 ? '' : 's'} laid where the belt crosses a line`, 'info');
        if (BELT_TYPES.has(type) && pieces.length > 1) this.dir = pieces[pieces.length - 1].dir;
        if (crossFail.length) this.toast(`Crossing not laid: ${crossFail[0].reason}`, 'bad');
        else if (refused.length) this.toast(pieces.length === 1 ? refused[0].reason : this.refusalText(type, refused), 'bad');
        if (r.planned) this.toast(`${r.planned} planned: built when the depot has the goods`, 'info');
      }
    }
    if (k.released[2] && this.rightPress) {
      // A right-click that removed nothing and cancelled no digging cancels: the tool, else the selection.
      if (!this.rightPress.used) {
        if (this.tool.kind !== 'select') this.tool = { kind: 'select' };
        else this.selected = null;
      }
      this.rightPress = null;
      this.rightHold = null;
    }
    if (k.released[0] && this.dragStart?.button === 0) this.dragStart = null;
    if (k.released[2] && this.dragStart?.button === 2) this.dragStart = null;
  }

  /**
   * One frame of the right button held on the world: the building under it goes once it has been held
   * for REMOVE_HOLD_S. Over a panel, over nothing or over a fixed building the hold starts again.
   */
  private holdToRemove(): void {
    const g = this.game!;
    const c = this.hoverCell;
    const b = c ? g.at(this.layer, c.x, c.y) : null;
    if (!b || BUILDINGS[b.type].fixed) {
      this.rightHold = null;
      return;
    }
    if (this.rightHold?.id !== b.id) this.rightHold = { id: b.id, t: 0 };
    this.rightHold.t += this.dt;
    if (this.rightHold.t < REMOVE_HOLD_S) return;
    this.rightHold = null;
    if (this.removeBuilding(b.id) && this.rightPress) this.rightPress.used = true;
  }

  /** The building a held right button is removing, for the renderer's sweep (tiles; frac 0..1), once the hold is no longer a click. */
  removeHoldRect(): { x: number; y: number; w: number; h: number; frac: number } | null {
    const h = this.rightHold;
    const b = h ? this.game?.b(h.id) : undefined;
    if (!h || !b || h.t < REMOVE_HOLD_SHOW_S) return null;
    const s = BUILDINGS[b.type].size;
    return { x: b.x, y: b.y, w: s, h: s, frac: Math.min(1, h.t / REMOVE_HOLD_S) };
  }

  /** Remove one building as an undoable removal (a held right button, the inspector's Remove button). */
  removeBuilding(id: number): boolean {
    const g = this.game!;
    const b = g.b(id);
    if (!b) return false;
    const was = removedOf(b);
    if (!g.remove(b.layer, b.x, b.y)) return false;
    this.pushUndo([was]);
    if (this.selected === id) this.selected = null;
    return true;
  }

  /** Remember a removal for Ctrl+Z, and say that it can be undone. */
  private pushUndo(batch: Removed[]): void {
    if (!batch.length) return;
    this.undoStack.push(batch);
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    const one = batch.length === 1;
    const what = one ? BUILDINGS[batch[0].type].name : `${batch.length} pieces`;
    this.toast(`${what} removed. Ctrl+Z puts ${one ? 'it' : 'them'} back`, 'info');
  }

  /**
   * Ctrl+Z: the last removal goes back where it stood, with its facing, recipe, filter and pause. Each
   * piece is paid for again (removing refunded it); one the depot can't pay for yet goes down as a
   * planned ghost, as any placement would. Something built there since stays and that piece is skipped.
   */
  undoRemove(): void {
    const g = this.game!;
    const batch = this.undoStack.pop();
    if (!batch) {
      this.toast('Nothing to undo', 'info');
      return;
    }
    let back = 0;
    let planned = 0;
    for (const r of batch) {
      if (r.type === 'foundation') {
        const L = g.layer(r.layer);
        g.place('foundation', r.layer, r.x, r.y, r.dir);
        if (L.foundation[r.y * L.w + r.x]) back++;
        continue;
      }
      const b = g.place(r.type, r.layer, r.x, r.y, r.dir, { recipe: r.recipe, filter: r.filter });
      if (!b) continue;
      if (r.paused) g.setPaused(b.id, true);
      back++;
      if (b.planned) planned++;
    }
    const skipped = batch.length - back;
    if (!back) {
      this.toast(batch.length === 1 ? "Can't put it back: something else is there now" : "Can't put them back: something else is there now", 'bad');
      return;
    }
    const parts = [`Put back ${back === 1 && batch.length === 1 ? BUILDINGS[batch[0].type].name : back}`];
    if (planned) parts.push(`${planned} planned until the depot has the goods`);
    if (skipped) parts.push(`${skipped} blocked by what stands there now`);
    this.toast(parts.join('; '), skipped ? 'bad' : 'good');
  }

  /**
   * What a multi-piece drag says about the pieces it refused: the first reason, with the count. When
   * every refusal is a foundation the depot couldn't pay for (foundations are never planned), the
   * shortfall is for all of them, not the one tile the sim's reason counts.
   */
  private refusalText(type: string, refused: { x: number; y: number; type: string; reason: string }[]): string {
    const g = this.game!;
    const unpaid = BUILDINGS[type]?.kind === 'foundation' ? refused.filter((f) => g.canPlace(f.type, this.layer, f.x, f.y, this.dir).missing) : [];
    if (unpaid.length > 1 && unpaid.length === refused.length) {
      const L = g.layer(this.layer);
      const need = Object.entries(BUILDINGS[type].cost)
        .map(([k, v]) => ({ k, n: v * unpaid.length - Math.max(0, Math.floor(L.stock[k] ?? 0)) }))
        .filter((e) => e.n > 0);
      if (need.length) return `${unpaid.length} not placed: the depot needs ${need.map((e) => `${e.n} more ${itemShort(e.k)}`).join(', ')} for them`;
    }
    return `${refused.length} not placed: ${refused[0].reason}`;
  }

  private handleKeys(): void {
    const g = this.game!;
    const k = this.input;
    if (k.hit('Escape')) {
      if (this.win) this.win = null;
      else if (this.tool.kind !== 'select') this.tool = { kind: 'select' };
      else if (this.selected != null) this.selected = null;
      else this.win = 'menu';
    }
    if (BLOCKING.includes(this.win)) return;
    // R and Q act on the building under the cursor; over the inspector, on the one it shows; over any
    // other panel, on nothing (the world under a panel is out of reach).
    const r = this.inspectorRect;
    const overInspector = !!r && this.ui.mx >= r.x && this.ui.my >= r.y && this.ui.mx < r.x + r.w && this.ui.my < r.y + r.h;
    const target = k.uiCapture ? (overInspector ? this.selected : null) : this.hovered;
    if (k.hit('r')) {
      if (this.tool.kind === 'build') this.dir = ((this.dir + 1) % 4) as Dir;
      else if (target != null) {
        const b = g.b(target);
        if (g.rotate(target)) audio.play('rotate');
        else if (b?.type === 'elevator' && b.end === 1) this.toast('A lower station always faces its depot', 'info');
      }
    }
    if (k.hit('q') && target != null) {
      const b = g.b(target);
      if (b && g.canBuild(b.type)) {
        this.tool = { kind: 'build', type: b.type };
        this.dir = b.dir;
        this.category = BUILDINGS[b.type].category;
      }
    }
    if (k.hit('x') || k.hit('Delete')) this.tool = this.tool.kind === 'remove' ? { kind: 'select' } : { kind: 'remove' };
    if (k.hit('e')) this.tool = this.tool.kind === 'dig' ? { kind: 'select' } : { kind: 'dig' };
    if (k.hit('f') && this.layer > 0) this.tool = this.tool.kind === 'survey' ? { kind: 'select' } : { kind: 'survey' };
    if (k.hit('[') || k.hit('PageUp')) this.setLayer(this.layer - 1);
    if (k.hit(']') || k.hit('PageDown')) this.setLayer(this.layer + 1);
    if (k.hit(' ')) this.paused = !this.paused;
    if (k.hit('Tab')) this.speed = this.speed >= 2 ? 1 : 2;
    if (k.hit('p') && this.selected != null) {
      const sel = g.b(this.selected);
      if (sel && !g.setPaused(sel.id, !sel.paused)) this.toast('Only machines, miners and collectors can be paused', 'info');
    }
    if (k.hit('h') || k.hit('F1')) this.win = this.win === 'help' ? null : 'help';
    if (k.hit('c')) this.win = this.win === 'company' ? null : 'company';
    if (k.hit('`')) this.win = this.win === 'debug' ? null : 'debug';
    // Build-bar tabs: 1 Logistics to 5 Strange.
    for (const t of CATEGORIES) if (k.hit(t.key)) this.category = t.id;
    if (k.hit('Mod+z')) this.undoRemove();
    if (k.hit('Mod+s')) {
      if (!this.canSave()) this.toast('Scenarios are not saved', 'info');
      else if (saveToStorage(g, this.slot)) this.toast('Saved', 'good');
      else this.toast('Could not save (storage full or blocked): export a save file', 'bad');
    }
  }

  // ------------------------------------------------------------------ helpers for the UI

  selectBuild(type: string): void {
    const g = this.game!;
    if (!g.canBuild(type)) return;
    this.tool = { kind: 'build', type };
    this.selected = null;
  }

  beltRate(): number {
    return BELT_SPEED * 60;
  }

  itemName(id: string): string {
    return ITEMS[id]?.name ?? id;
  }
}

function removedOf(b: Building): Removed {
  return { type: b.type, layer: b.layer, x: b.x, y: b.y, dir: b.dir, recipe: b.recipe, filter: b.filter, paused: !!b.paused };
}

function readSlot(): number {
  try {
    const n = Number(localStorage.getItem(SLOT_KEY) ?? 0);
    return Number.isInteger(n) && n >= 0 && n < SLOTS ? n : 0;
  } catch {
    return 0;
  }
}
