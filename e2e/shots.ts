// Screenshot sweep: every scenario plus a few windows, using the installed Chrome.
// Usage: node e2e/shots.ts [name,name,...]   (BASE=http://localhost:5190/ by default)

import { chromium } from 'playwright';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5190/';
/** Output folder (OUT=... lets a second run write elsewhere); the previous full run moves to <OUT>-prev. */
const OUT = process.env.OUT ?? 'e2e/out/shots';
const PREV = `${OUT}-prev`;
const W = Number(process.env.W ?? 1920);
const H = Number(process.env.H ?? 1080);

interface Overlays {
  spores: boolean;
  heat: boolean;
  interference: boolean;
}

interface Shot {
  name: string;
  query: string;
  /** The hazard overlays for this shot, set before `setup` (every overlay starts on in the app). */
  overlays?: Overlays;
  /** JS run in the page after load (window.__app is the App). */
  setup?: string;
  /** A tile on the shown layer to put the mouse over after `setup` (build ghosts and their tooltips follow the mouse). */
  mouse?: { x: number; y: number };
  wait?: number;
  /**
   * Several screenshots of one page instead of one: after `setup` and `wait`, each frame runs its JS,
   * waits its own `wait` (400 ms by default) and saves <name>_<suffix>.png.
   */
  frames?: { suffix: string; js: string; wait?: number }[];
}

/**
 * The ending sequence held at `u` of the way through one of its beats (src/app/ending.ts at()): it runs
 * on real seconds, so a screenshot seeks it and holds the clock instead of timing the page.
 */
const endingAt = (kind: string, layer: number, u: number): string => `__app.seekEnding(0); __app.seekEnding(__app.cine.at('${kind}', ${layer}, ${u}));`;

const OVERLAYS_OFF: Overlays = { spores: false, heat: false, interference: false };

const SHOTS: Shot[] = [
  { name: 'title', query: '' },
  { name: 'start', query: 'scenario=start', wait: 4000 },
  { name: 'surface', query: 'scenario=surface' },
  { name: 'surface_zoom4', query: 'scenario=surface&zoom=4' },
  { name: 'surface_inspect', query: 'scenario=surface', setup: `const g=__app.game; const b=[...g.s.buildings.values()].find(b=>b.type==='smelter'); __app.selected=b.id;` },
  // The build tool with its ghost and tooltip: a Miner (unlocked at milestone 4, unlike the Assembler)
  // over the stone deposit the Brickwork milestone needs.
  { name: 'surface_build', query: 'scenario=surface', setup: `__app.selectBuild('miner'); __app.category='production'; __app.cams[0]={x:28*16,y:37*16};`, mouse: { x: 27, y: 38 } },
  { name: 'surface_drill', query: 'scenario=surface', setup: `const g=__app.game; const b=[...g.s.buildings.values()].find(b=>b.type==='drill'); __app.selected=b.id; __app.cams[0]={x:32*16,y:14*16};` },
  { name: 'company', query: 'scenario=surface', setup: `__app.win='company';` },
  { name: 'help', query: 'scenario=surface', setup: `__app.win='help';` },
  { name: 'surface_ghost', query: 'scenario=surface', setup: `const g=__app.game; g.layer(0).stock.gear=0; const b=g.place('press',0,36,28,1); __app.selected=b.id; __app.cams[0]={x:37*16,y:29*16};` },
  // Placing belts must show which way they run: one Conveyor ghost facing south at zoom 4, then a
  // drag that turns (east, then south), the way the release will lay it.
  { name: 'surface_belt_ghost', query: 'scenario=surface&zoom=4', setup: `__app.selectBuild('belt'); __app.category='logistics'; __app.dir=2; __app.cams[0]={x:34*16,y:36*16};`, mouse: { x: 34, y: 36 } },
  { name: 'surface_belt_drag', query: 'scenario=surface&zoom=4', setup: `__app.selectBuild('belt'); __app.category='logistics'; __app.cams[0]={x:34*16,y:36*16}; __app.dragStart={x:31,y:34,button:0};`, mouse: { x: 36, y: 38 } },
  // Holding the right button on a building removes it after half a second: the sweep 60% of the way.
  { name: 'surface_remove_hold', query: 'scenario=surface&zoom=4', setup: `const g=__app.game; const b=[...g.s.buildings.values()].find(b=>b.type==='smelter'&&b.layer===0); __app.rightHold={id:b.id,t:0.3}; __app.cams[0]={x:b.x*16+16,y:b.y*16+16};` },
  { name: 'shallows', query: 'scenario=shallows' },
  { name: 'shallows_zoom2', query: 'scenario=shallows&zoom=2' },
  { name: 'shallows_depot', query: 'scenario=shallows', setup: `const g=__app.game; const b=[...g.s.buildings.values()].find(b=>b.type==='depot'&&b.layer===1); __app.selected=b.id;` },
  // The shaft's top station (on the Surface), where the cab loads what the Shallows asks for: its
  // inspector shows "Requested below", which the lower station never does.
  { name: 'shallows_elevator', query: 'scenario=shallows&layer=0', setup: `const g=__app.game; g.layer(1).requests.motor=60; const b=[...g.s.buildings.values()].find(b=>b.type==='elevator'&&b.layer===0&&b.end===0); __app.selected=b.id; __app.cams[0]={x:b.x*16+24,y:b.y*16+24};` },
  // Jams the player can't see otherwise (review 3 K1, K2): a belt pushing plates into the top
  // station's front, the face its arrivals come out of, and two belts pushing into each other head-on,
  // each with the jammed badge; the mouse rests on one of the pair (its hover names the jam).
  { name: 'surface_jams', query: 'scenario=shallows&layer=0', setup: `const g=__app.game; g.layer(0).stock.iron_plate=50; const st=[...g.s.buildings.values()].find(b=>b.type==='elevator'&&b.layer===0); for (let y=st.y+3;y<=st.y+5;y++) { const b=g.place('belt',0,st.x+1,y,0); if (b) { b.item={id:'iron_plate',heat:0}; b.prog=0.5; } } for (const [x,d] of [[st.x+5,1],[st.x+6,3]]) { const b=g.place('belt',0,x,st.y+3,d); if (b) { b.item={id:'iron_plate',heat:0}; b.prog=0.5; } } __app.radio.length=0; __app.cams[0]={x:(st.x+3)*16,y:(st.y+4)*16};`, mouse: { x: 36, y: 13 } },
  { name: 'magma_heat', query: 'scenario=magma', overlays: { ...OVERLAYS_OFF, heat: true } },
  { name: 'alien_node', query: 'scenario=alien', setup: `const g=__app.game; const b=[...g.s.buildings.values()].find(b=>b.type==='engine_node'&&b.recipe==='waking'); __app.selected=b.id; __app.cams[5]={x:b.x*16+24,y:b.y*16+24};` },
  { name: 'fungal', query: 'scenario=fungal' },
  { name: 'crystal', query: 'scenario=crystal' },
  // Interference overlay: the selected Cutter's ring, a Charger ghost's ring, a second Cutter a Shield
  // Wall protects (shield rectangles), a Resonance Tap fed by the Charger (tap arcs), and a Press
  // jammed by coal on its input belt (the jammed badge).
  { name: 'crystal_overlay', query: 'scenario=crystal', setup: `const g=__app.game; g.debugUnlockAll(); const L=g.layer(3); for (const [k,v] of Object.entries({circuit:20,copper_wire:40,steel_beam:20,cobalt_ingot:20,motor:10,gear:20,iron_plate:40})) L.stock[k]=(L.stock[k]??0)+v; const cut=[...g.s.buildings.values()].find(b=>b.type==='cutter'&&b.layer===3); g.place('cutter',3,22,9,1,{recipe:'cut_crystal'}); g.place('shield_wall',3,22,11,0); g.place('resonance_tap',3,25,12,1); g.place('press',3,28,9,1,{recipe:'iron_plate'}); const bl=g.place('belt',3,27,9,1); if (bl) { bl.item={id:'coal',heat:0}; bl.prog=0.6; } __app.cams[3]={x:24*16,y:12*16}; __app.selectBuild('charger'); __app.selected=cut.id;`, mouse: { x: 29, y: 16 } },
  { name: 'magma', query: 'scenario=magma', overlays: OVERLAYS_OFF },
  { name: 'alien', query: 'scenario=alien' },
  // The Governor open at the start of Act VI: the Heart's beacon and the dimmer markers on the Engine
  // Nodes, through the rock and the dark (the Waking Node, in sight, shows only the ring). Mags's box
  // is dismissed so it doesn't cover the Waking Node. Framed between the nodes and the Heart, at zoom
  // 1 below 1000 px of height (1280x720, 1600x900) and zoom 2 above it, so every beacon stays clear
  // of the top bar, the Stack and the build bar at any size (review 3 Q11).
  { name: 'alien_governor', query: 'scenario=alien', setup: `__app.radio.length=0; __app.zoom=__app.canvas.height>=1000?2:1; __app.cams[5]={x:46*16,y:33*16};` },
  // Awake conduits under a loaded belt line and a Press: the glow stays under what stands on it.
  { name: 'alien_awake', query: 'scenario=alien', setup: `const g=__app.game; g.debugUnlockAll(); const L=g.layer(5); L.conduitLive.set(L.conduit); for (const n of g.s.buildings.values()) if (n.type==='engine_node' && n.stockCount===0) n.stockCount=1; g.staticLight[5]=new Float32Array(0); L.stock.iron_plate=(L.stock.iron_plate??0)+40; L.stock.gear=(L.stock.gear??0)+20; for (let x=14;x<=22;x++) { const b=g.place('belt',5,x,36,1); if (b && x%2===0) { b.item={id:'thrumstone',heat:0}; b.prog=0.5; } } g.place('press',5,24,35,1,{recipe:'iron_plate'}); __app.cams[5]={x:20*16,y:37*16};` },
  // Belt contrast on the Alien Strata: a loaded loop on plain machine-stone floor (express top row,
  // insulated right side, a splitter, sorter and crossing on the bottom row) round a conveyor laid
  // along an awake conduit, the floor where belts used to vanish.
  { name: 'alien_belts', query: 'scenario=alien', setup: `const g=__app.game; g.debugUnlockAll(); const L=g.layer(5); L.conduitLive.set(L.conduit); g.staticLight[5]=new Float32Array(0); for (const k of ['iron_plate','gear','copper_wire','steel_beam','conductive_powder','insulation']) L.stock[k]=(L.stock[k]??0)+100; const it=['thrumstone','iron_plate','coal','gear','copper_ingot']; let n=0; const put=(t,x,y,d,item)=>{ const b=g.place(t,5,x,y,d); if (b && item && !b.planned) { b.item={id:it[n++%it.length],heat:0}; b.prog=0.5; } return b; }; for (let x=13;x<=20;x++) put('express_belt',x,34,1,x%2===1); for (let y=34;y<=37;y++) put('insulated_belt',21,y,2,y%2===1); for (let x=21;x>=14;x--) { const t=x===19?'splitter':x===17?'sorter':x===15?'crossing':'belt'; const b=put(t,x,38,3,t==='belt'&&x%2===0); if (t==='sorter' && b) b.filter='coal'; } for (let y=38;y>=35;y--) put('belt',13,y,0,y%2===1); for (let x=15;x<=19;x++) put('belt',x,36,1,x%2===0); __app.cams[5]={x:17.5*16,y:36.5*16};` },
  // The ending (review 3 K3, A6): the awake Heart framed on the Alien Strata under its layer card, the
  // wake rings swelling out of its core.
  { name: 'ending', query: 'scenario=ending', setup: endingAt('hold', 5, 0.5) },
  // The whole sequence, one held frame per beat: the Heart, the rise out of the Strata (the rock and
  // the shaft's light between two layers), each layer up the climb under its card with the light
  // spread from its shaft, the Surface at dawn, the closing text over it, then a click skips to the
  // thank-you card with the HUD back.
  {
    name: 'ending_climb',
    query: 'scenario=ending',
    wait: 600,
    frames: [
      { suffix: '1_heart', js: endingAt('hold', 5, 0.5) },
      { suffix: '2_rise', js: endingAt('rise', 4, 0.5) },
      { suffix: '3_magma', js: endingAt('hold', 4, 0.6) },
      { suffix: '4_crystal', js: endingAt('hold', 3, 0.6) },
      { suffix: '5_fungal', js: endingAt('hold', 2, 0.6) },
      { suffix: '6_shallows', js: endingAt('hold', 1, 0.6) },
      { suffix: '7_dawn', js: endingAt('dawn', 0, 0.8) },
      { suffix: '8_text', js: endingAt('text', 0, 0.95) },
      { suffix: '9_card', js: `__app.cine.hold = false; __app.cine.skip(__app);`, wait: 800 },
    ],
  },
];

async function main(): Promise<void> {
  const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
  if (!only) {
    if (existsSync(PREV)) rmSync(PREV, { recursive: true, force: true });
    if (existsSync(OUT)) renameSync(OUT, PREV);
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report: { name: string; errors: string[] }[] = [];
  for (const s of SHOTS) {
    if (only && !only.has(s.name)) continue;
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    const url = `${BASE}${s.query ? '?' + s.query + '&shots=1' : '?shots=1'}`;
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 30000 });
    if (s.overlays) await page.evaluate(`(() => { Object.assign(window.__app.overlays, ${JSON.stringify(s.overlays)}); })()`);
    if (s.setup) await page.evaluate(`(() => { const __app = window.__app; ${s.setup} })()`);
    if (s.mouse) {
      // The client point over the tile's centre, the way the app maps the mouse (app.ts frame and cellAt).
      await page.evaluate(`(() => {
        const a = window.__app, c = a.canvas, z = a.zoom, cam = a.cams[a.layer], r = c.getBoundingClientRect();
        const camX = Math.round(cam.x - (Math.ceil(c.width / z) + 1) / 2), camY = Math.round(cam.y - (Math.ceil(c.height / z) + 1) / 2);
        c.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + (${s.mouse.x} * 16 + 8 - camX) * z, clientY: r.top + (${s.mouse.y} * 16 + 8 - camY) * z }));
      })()`);
    }
    await page.waitForTimeout(s.wait ?? 1800);
    if (s.frames) {
      for (const f of s.frames) {
        await page.evaluate(`(() => { const __app = window.__app; ${f.js} })()`);
        await page.waitForTimeout(f.wait ?? 400);
        await page.screenshot({ path: `${OUT}/${s.name}_${f.suffix}.png` });
      }
    } else await page.screenshot({ path: `${OUT}/${s.name}.png` });
    report.push({ name: s.name, errors });
    console.log(`${s.name}: ${errors.length ? errors.length + ' console issues' : 'ok'}`);
    await page.close();
  }
  await browser.close();
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
