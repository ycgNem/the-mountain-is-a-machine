# Handoff

Read this first. Status, how to run, the code map and what's next.

## Status

- **2026-10-30, session 2 (owner feedback):** a build-it-yourself tutorial (nothing pre-built, a
  hint and a map marker per step, digging taught in Act I and the Shallows, a new milestone 2
  "Plates for the HQ", saves at version 4 migrate), right-click only cancels (hold to remove,
  Ctrl+Z undoes), belt ghosts with arrows, seamless belts and pieces, a new font and UI kit, rates
  with units everywhere. DECISIONS #121–#125. 271 tests in 21 files pass.
- **2026-10-30, session 1 (autonomous run):** docs, project agents, the full simulation for all six
  layers, rendering, UI, audio, scenarios, tests and the itch.io release zip are written.
  - Plan review 1 (`DECISIONS.md` #21–#63) and review 2 (#64–#89: the indie critic's C1–C13, the
    30 confirmed code-review defects, `docs/reviews/review-2/`, and the fix pass after its verify,
    with that pass's own verify fixes) are built and tested.
  - The PixelLab art run is done: 157 of the 500 generations, 167 with review 3's Heart re-roll
    (the account is at 3,910.1 used of the 4,243.1 cap, 333 left; the $2.00 credit untouched).
    Every sprite name the game asks for has art except `i_filter` and `i_resonant_core`, which stay
    code-drawn, and 29 building sprites glow at the light spots their recipes place. STYLE "Sprite
    status" has the detail.
  - Act bots play all six acts on the real map with no deadlock or rush, every act 6–42% under its
    PLAN §8 floor; the bands stay until people play (#100). The game fixes they found are built and
    tested (#90–#99, `docs/reviews/act-bots/`): the Drill and the Heart stack extras in the depot,
    Unloaders leave what planned ghosts hold, corner-touched caverns open, beacons and bearings for
    the Heart and the nodes, The Governor lands as a milestone, new hints and default requests, and
    light over awake conduit. The bots' own harness fixes are in too, with no WORKAROUND blocks left.
  - Review 3 (#101–#120, `docs/reviews/review-3/`): the indie critic's third round (K1–K13), the
    art director (A1–A15) and QA (Q1–Q11) in the running game, verdict "Ship with fixes". All 39
    findings were accepted and are built: station front jams and Mags's drill-lines line, direction
    you can read (port brackets, a 2 px chute arrow, bowed conveyor rungs, head-on belts), the
    Strange tab on key 5, veins of awake conduit through the rock, the drill ETA, Act I's halved
    milestone cash, a fuelled crew rig, the UI scale and window fixes, decor weights, floor variants,
    the anchors and the elevator pit, the Heart re-rolled, and the ending as a sequence (#103):
    the camera goes to the waking Heart and climbs layer by layer to the Surface at dawn.
  - Review 3's verify pass (27 shots at three window sizes, no console errors) confirmed the round.
    Its leftovers are fixed: the 3×3 chutes start from their anchors, the renderer reads each floor
    set's variant share, the crew-rig wording, the title mock's fit rule. Its visual leftovers are
    item 1 of What's next.
  - 245 tests in 20 files pass; the build is 390 kB of JavaScript (136 kB gzipped).
  - Public on GitHub (`ycgNem/the-mountain-is-a-machine`, branch `main`). Every push to `main` runs
    the tests and the build and deploys it to GitHub Pages:
    https://ycgnem.github.io/the-mountain-is-a-machine/ (`.github/workflows/pages.yml`).
    `ROADMAP.md` has the phase checklist and what's open, `PROGRESS.md` the log and the PixelLab
    spend.

## Environment

- Windows 11. Project folder is inside OneDrive (`C:\Users\jacks\OneDrive\Documents\The Mountain
  Is a Machine`). A git repository on `main`, pushed to GitHub; commits use the GitHub noreply
  address, not a personal email.
- Node 22.20 is portable at `C:\Users\jacks\tools\node-v22.20.0-win-x64`; put it on PATH in new
  shells (`$env:Path = "C:\Users\jacks\tools\node-v22.20.0-win-x64;" + $env:Path`, or in Git Bash
  `export PATH="/c/Users/jacks/tools/node-v22.20.0-win-x64:$PATH"`). Node runs `.ts` scripts
  directly (type stripping), so scripts use erasable syntax and `.ts` import extensions. A scratch
  script that imports `src/` runs with `npx vite-node --root . <script>`.
- Python 3.12 is available (for the pixel-art-studio skill).
- Chrome is installed; Playwright uses it with `channel: 'chrome'` (no browser download).
- Dev server: port 5190 (`npm run dev`, or the `mountain-dev` entry in `.claude/launch.json`).
  Critic, QA and other parallel agents start their own server on 5191 or above with `--strictPort`
  and stop it when done. Something unrelated listens on 0.0.0.0:5199 (it answers 127.0.0.1), so a
  parallel server skips that port, binds to 127.0.0.1 (`--host 127.0.0.1`) with `BASE=` pointed at
  it, or is reached at `http://[::1]:<port>/`. Other agents' saves make Vite reload the page
  mid-shot, so a server for a screenshot sweep runs better with HMR off.
- PixelLab: call `get_balance` before each batch; the first run's cap is 500 generations (stop at
  4,243.1 used; 333 are left at 3,910.1), and the $2.00 credit is never spent.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on 5190 |
| `npm run build` | Typecheck (app and scripts) and build to `dist/` |
| `npm run preview` | Serve the built `dist/` on 5190 |
| `npm run release` | `npm run build`, then `scripts/release.ts` zips `dist/` for itch.io into `release/the-mountain-is-a-machine-v<version>.zip` (refuses absolute paths; upload as an HTML game, 1280×720 or larger) |
| `npm run typecheck` | `tsc` for `src/`+`tests/` and for `scripts/`+`e2e/` |
| `npm test` | Vitest: sim, layer mechanics, data, UI labels and the act bots (`tests/`) |
| `npx vitest run tests/act3.test.ts` | One act bot (any of `act1` to `act6`); it prints its report: times against the PLAN §8 band, stalls, deadlocks, friction, then the log |
| `npm run shots` | Playwright screenshot sweep (needs the dev server; `BASE=` for another port) of every scenario plus windows at 1920×1080 into `e2e/out/shots/` (previous run kept in `shots-prev/`), with `report.json` (each shot's console errors). `node e2e/shots.ts name,name` takes a subset; `OUT=`, `W=`, `H=` change the folder and size |
| `npm run art:build` | Turn the recipes in `art/recipes/` into `public/art/atlas.png` + `atlas.json` and the terrain sheets (`-- --check` validates without writing) |
| `npm run art:sheet` | Contact sheets of every sprite in the atlas (`art/out/contact.png`, `contact-1x.png`), for art review |
| `npm run art:coverage` | Which sprite names still fall back to code art |

## Code map

The simulation is pure TypeScript with no DOM, fixed at 60 ticks a second and deterministic from the
seed. Everything else reads it.

```
src/
  main.ts              creates the App and starts it
  data/                tables only, no logic (PLAN.md §7 in code)
    palette.ts         Apollo 46 colors, named UI colors (C)
    items.ts           45 items: value, fallback icon shape/colors, hot/unstable/glow flags, short
                       names for tight labels (itemShort)
    recipes.ts         every recipe (machine, inputs, outputs, side output, time) and FUELS
    buildings.ts       every building (kind, size, power, cost, unlock key, flags, blurb),
                       CATEGORIES (the build bar's five tabs on keys 1-5; 'strange' holds the 13
                       machines each layer's own material brings), LICENSES, LINE_UPGRADES
    layers.ts          the six layers (size, ambient light, hazard, arrival, bore site, deposits with
                       vent/rig flags, starter crate, decor list and its decorWeights, default
                       requests, the Surface's being the HQ's floor; `short` for the top bar, `at`
                       for Mags: "in the Shallows"), HEART, ENGINE_SEQUENCE, WAKING_SEQUENCE,
                       ENGINE_NODES, CONDUITS, WAKE_RINGS and WAKE_RING_STEP, CONDUIT_KW_PER_NODE,
                       AMBER_SPRITE, TALL_DECOR (the seven 32 px decor names)
    progression.ts     drill PROJECTS (D1 and D2 the tutorials), ASSAYS (lab flag, unlocks), 31
                       MILESTONES (steps with optional labels, rewards (Act I's $725 in all),
                       Mags' lines, hints, `locate` for her bearings to the Heart and the sleeping
                       nodes), CONTRACTS (1.7-2.5x, capped at 2.5x) and the re-roll price
  sim/
    types.ts           Building (jam, JamWhy 'wrong' / 'front' / 'full' / 'headon'), Shaft
                       (reqLast), LayerState, GameState (project.surplus: extras sent to the depot),
                       Contract (chute count), events (node_awake carries ring, rings, tiles);
                       newBuilding()
    rng.ts             mulberry32, nextRand(state), hash2, noise2
    mapgen.ts          designed layer generation: caverns carved around deposits, hidden pockets,
                       fungal pools, magma, heatGrade() (hot 2 / warm 1), exact 2x2 vents, conduits,
                       decor (each name its decorWeights share by a ranking hash, no two TALL_DECOR
                       props within 2 tiles); revealComponent()
    game.ts            Game: create() with only the HQ, Terminal and Drill (the player builds the first line,
                       DECISIONS #121) and the HQ floor,
                       canPlace (hot, steady ground, awake conduit, paid swaps, a stock override for
                       previews), place, planDrag and placeDrag (crossings first, a Crossing at a
                       drag's start on a straight run of a line, fedFromBehind; refusals
                       reported), remove, rotate (never a lower station), setRecipe, setFilter (an
                       Unloader gives back
                       the good it holds), setPaused (machines, miners, collectors), refunds through
                       depotItem and craftInputs, planned ghosts built oldest-first and fairly,
                       ghostHolds (what waiting ghosts hold, cached; depot Unloaders leave it),
                       rushQuote()/rush(), digging queue (one cell every 4 ticks; digCell opens a
                       cavern only where it meets it straight on, darkBeside repairs half-lit ones),
                       surveyCheck/survey (not on the Surface), checkStarved (starveMessage: "has N
                       X; your planned Y needs M" with some in stock, "is out of" with none; howMade
                       for goods made here or deeper; takenMessage when Unloaders take arrivals;
                       noteIn/noteOut), earn (income counts sales and contract pay),
                       licenses, line upgrades, tick() order, debugUnlockAll(); SAVE_VERSION 3
    logistics.ts       belts (one item per tile, downstream-first order), splitter, crossing, sorter,
                       unloader, crate, sequencer, chute (takes any side); insert() into every kind;
                       one output port (outputPort/sidePort), fair merges counted at real ports;
                       pushesInto (does a building hand on into a cell: the drag's start rule);
                       depotItem (a hot good cools, an unstable one is lost); the Drill and the Heart
                       stack a met need's extras in the depot (toDepot; projectRefusal: 'wrong', or
                       'full' at 999); noteJam for machines, Drills, the Heart, a station's front
                       ('front'; side faces that are only full mark nothing) and head-on belts
                       ('headon', both belts); a depot Unloader leaves ghostHolds
                       (depotUnloaders: the ones set to a good); fuel pushed
                       straight into a generator holding GEN_FUEL_CAP of it waits for demand
                       (waitsOnGenerator, fullGenerator); hot items cool on belts and in
                       containers, unstable items shatter; station bays (the lower station hands
                       its depot the first arrival it takes, the top keeps arrival order and holds
                       cargo for a full depot); engine nodes (nodeSequence, 2 s per item, any
                       wrong item out of the side, cooled; nodeJam)
    production.ts      machines (inputs consumed at craft start, output front, byproduct left;
                       craftInputs for refunds), miners, collectors, generators, the conduit pool;
                       a Drill, the Heart or an elevator station shows jammed while a refusal is
                       fresh (jamFresh, JAM_FRESH 30 ticks: the renderer's badges and the hovers
                       read them too); a full output only a full generator refuses is idle, not
                       blocked (outputStatus)
    power.ts           per-layer power solve; Company Line, generators burn by load, thermal,
                       resonance taps, conduits; shaft cables move surplus
    env.ts             spores, interference by footprint gap (shield walls, planned ones excepted;
                       dampers), graded heat, awake conduits, light map (awake conduit every other
                       tile: CONDUIT_LIGHT_R 2.5, CONDUIT_LIGHT 0.7); predictPlacement() for the
                       build ghost (heat, links, spores, speed, tap output)
    elevator.ts        shafts and cabs (wait for a fuller load). Requests: isRequestable and
                       requestableItems (any good the save has made but hot or unstable ones),
                       requestNeed relayed down the stack, pickRequested in turn after Shaft.reqLast,
                       up to half a cab rounded down, held back when the lower depot is full
                       (requestsHeld); requestMissing for a ghost. Live traffic (shaftTraffic: 60 s,
                       not saved). heldCargo and stationStatus (stalls, cargo held at the top, a full
                       depot). upgradeQuote and upgradeElevator (the lower depot pays first, then the
                       upper)
    progress.ts        shipping, Company Chute sales, contracts at the Terminal or a Chute
                       (contractPay, CHUTE_RATE), re-roll, assays and discoveries, drill projects
                       (onProjectSurplus: extras counted, one toast per good; projectNeeds for the
                       inspectors), breakthrough (shaft, depot, crew rig with GEN_FUEL_CAP coal in
                       its generator (placeFixed), the layer's own requests; then checkMilestones at
                       once, so the next milestone's intro leads, then Mags's drill-lines line,
                       drillLinesLine, if drillFeeds found any, then the Board's memo), engine
                       nodes waking their conduit ring by ring (wakeRings: ring 1 one tile past the
                       nearest conduit outside the node, then 3 tiles a ring; no event when nothing
                       lights or after the ending; nodeAwake, sleepingNodes), Mags's bearings
                       (bearing, locateLine), milestones
                       (finishMilestone; the ending lands every one still open through The
                       Governor, in order, without their intros), step progress and stepLabel
    save.ts            serialize/deserialize (localStorage, SAVE_VERSION 3), three slots, loadSlot
                       (empty / ok / error, so a save that won't load is never overwritten). On load:
                       the cut Merger is dropped, version-1 decor migrated, lower stations face their
                       depot again, stray pause flags cleared, contract Chute counts default to 0
  render/
    atlas.ts           loads public/art/atlas.png/json, the ten terrain sheets (TERRAIN_SETS) and
                       the floor variants the build made (terrainVariants); sprite(name) falls back
                       to code art; title_art cut out of the atlas for the title screen
                       (getTitleArt); spriteBox (a sprite's visible-pixel bounds); spriteLights
                       (the light spots: fallbackLights, or atlas.json "lights" for art);
                       spriteAnchor (atlas.json "anchors": art sprites only; the renderer reads
                       the elevator's pit). atlas.json's "variantShare" isn't read yet
    fallback.ts        code-drawn sprite for every sprite name: buildings in their family accents,
                       items, deposits, decor from LAYERS[].decor plus AMBER_SPRITE (dull, never
                       #090a14); fallbackLights
    terrain.ts         per-layer terrain cache (willReadFrequently): dual-grid Wang sheets when art
                       exists (one plain tile in four from a floor variant, VARIANT_SHARE, for every
                       set; a dark recolour for dormant conduits; BED_ON_SHEET, the Alien bed on
                       the slab sheet), else code tiles; the hard-rock dither in each layer's own
                       darker tone (#ad7757 on the Surface); conduitGlass (the lit glass of awake
                       conduit, a layer-sized canvas patched with the terrain); dormantCopy (a
                       sprite in the dormant conduit's colours: a sleeping Engine Node)
    belts.ts           animated code-drawn belts (straight and curves) and pieces, in lockstep with
                       the items on them; conveyor rungs bowed into a blunt '>'
    icons.ts           item icons (atlas or fallback), 7x7 status badges
    particles.ts       sparks, smoke, dust, motes, floats
    world.ts           WorldRenderer, in passes: terrain -> ground (foundations, conduits, deposits
                       (drawDeposit: a variant unlike its west and north neighbours', a ±3 px offset
                       kept on the bed), decor up to a tile tall) -> belts and pieces -> shadows ->
                       back to front by the row things stand on (tall decor that fits, building
                       bodies with their 2 px chute arrows (a sleeping Engine Node in dormant
                       colours; the elevator cab in the art's pit anchor), the items on that row's
                       belts) -> particles -> darkness -> emissive (awake conduit glass 1 px back
                       from standing buildings, drawVeins through unrevealed rock, lit light spots)
                       -> overlays above the darkness (spores on open floor, heat, interference
                       arcs, rings, shields) -> survey markers, beacons (the bore site; the Heart
                       until found and sleeping Engine Nodes while the Governor is open; beacon()),
                       status icons (on a fixed building only a jammed Drill's, Heart's or
                       station's; head-on belts, jamFresh), selection with port brackets on the
                       hovered and selected building (drawPortMarks) -> placement ghosts. The
                       ending's dressing (RenderOpts.ending, an EndingLook): the dawn sky and sun
                       before the terrain and the dawn dither on the ground (the Surface), the
                       night tint or the lift (light from the shaft) in the darkness pass, the
                       Heart's waking rings above it; riseBand draws the rock between layers.
                       Darkness caches for the last three layers drawn (the climb draws two a
                       frame and warms the next ahead of it: warm())
  ui/
    font.ts            hand-drawn 5x7 bitmap font, drawText/measureText/wrapText
    ui.ts              immediate-mode UI kit: panel, button, bar, tooltips (tooltipAt beside a rect,
                       clamped under the top bar), a measure pass and clip rect for panels sized to
                       their content, late draws, overPrev (the mouse was over a panel last frame),
                       occluders (rects nothing under may hover or click: the open window, while
                       the HUD and the inspector draw)
    hud.ts             top bar (money and $/min, the layer's short name with its full name and depth in
                       the hover, power, the depot strip with +N flashes and what the oldest plan
                       lacks, dropping well-stocked goods first), objectives (OBJECTIVES_W,
                       stepLabelRoom; the drill ETA from each good's last 120 s, the slowest good's, or
                       "No supply"), the Stack (STACK_W; each shaft's MkN and live rate, held cargo in
                       its tooltip), build bar (five tabs from CATEGORIES, buildings from layers not
                       reached hidden, its size from the widest tab; buildBarTop; barRoomTop keeps the
                       help line's room), radio (its timer paused while hidden; the next button sized
                       to its label), toasts (drawn late, over windows, fading), the breakthrough card
                       (drawLayerCard, which the ending's climb uses too; it ages only while drawn and
                       uncovered), ghost tooltips with predicted speed, purity and spores, jam reasons
                       on hover (projectJamText for the Drill and the Heart, stationJamText,
                       headOnText, machineJamText); covered() (a panel under a window or the ending
                       card steps aside), layerName ("the Shallows"), depotName, upperFirst
    inspector.ts       per-building panel, measured to its content and scrolled past the build bar:
                       recipes, filters, depot stock and request rows (stock/target, none spare
                       above, Shift 50, wheel 10, the Add row, the HQ's "Keep for the Surface"),
                       "Request the missing goods", Rush, pause, elevator traffic, stalls, held
                       cargo ("is full of it"), requests held for a full depot below apart from none
                       spare, a station's front jam and a head-on belt's line in coral, a lower
                       station's arrivals only when some wait, "Jammed: a belt feeds its front" on
                       a machine, upgrade sources, lab, Engine Node rings and jam warnings, the Drill's
                       and Heart's delivered/needed rows with extras and the Jammed line (a finished
                       good's tip says to switch off a depot Unloader set to it: the extras loop),
                       "The generator is full" for what feeds a full one, the Sequencer's next side
                       by compass face
    windows.ts         title (the art at the largest whole scale that fits, edges extended; three
                       slots and the Settings / What's new row, hidden under an open window; the
                       load-error dialog, the footer on its own strip), Company (contracts with the
                       pay right-aligned and short names, licenses, line; fits its content), the
                       paged Field Manual (a card that unlocks nothing has no Unlocks line), menu,
                       settings (scales above App.autoScale greyed out; 210x88), What's new
                       (PATCHNOTES.md, paged), the save-failure dialog, debug, the ending's UI
                       (the flash, each layer's card, the closing text, then the thank-you card;
                       endingTextShowing is true while the sequence plays); pagedHeight fits the Field
                       Manual and What's new above the bar in a game; windowPos keeps a window
                       clear of the objectives and the build bar, overlayRects feeds App.covers
  engine/
    input.ts           mouse/keyboard state
    audio.ts           WebAudio: procedural effects (balanced levels), the hum of Old Thrum per
                       layer and at the ending, a machine bed per family near the camera
  app/
    app.ts             App: screens, camera per layer (a new game opens on the Drill and the
                       Terminal), tools (select/build/remove/dig/survey), belt drag previewed
                       against a running stock and laid by placeDrag (refusals toasted; a short
                       foundation drag gives its whole shortfall), R and Q over the inspector, event
                       feedback (bursts, sale floats, shake, conduit rings waking), covers (the open
                       window and the ending card, for covered() and ui.occluders), dt (the frame's
                       real seconds, for every UI timer), autoScale (nearest 330 UI px tall, never
                       under 640 wide) and uiScale (a chosen scale capped at it), hintHold (a
                       layer's hints wait for the card, the radio and the intro), no world hover
                       under a blocking window, autosave and trySave, keys (1-5 the build-bar
                       tabs); the ending: cine (the Ending while it plays and until the dawn fades),
                       startEnding on the 'ending' event or for a game loaded within
                       ENDING_REPLAY_S of it (endingPending), seekEnding(t) for shots and tests,
                       endingKeys (Esc or a click skips to the card; Space and Tab still work),
                       humLayer() (the Heart's until the card is dismissed), no HUD, inspector or toast
                       ageing while it plays; window.__app for tests
    ending.ts          the ending sequence (DECISIONS #103), on real seconds: ENDING_BEATS (pan 3,
                       heart 2.8, rise 1.2, hold 2, dawn 2.6, line 2, last 2.8: about 33 s with six
                       layers), ENDING_LINES, ENDING_REPLAY_S (40), climbCardText; the Ending class
                       builds the beats from the open layers, owns the camera (its own views at the
                       default zoom, the player's put back after the card), draws a rise as the old
                       layer, the rock and the new layer (the next layer's terrain, darkness and rock
                       drawn ahead while the camera holds, so a rise never waits on a first draw),
                       rings the arrival bell, gives the renderer each layer's EndingLook and
                       audio.ending its chord(); seek and at(kind, layer, u) hold any moment for
                       shots; EndingStage, EndingView
    scenarios.ts       ?scenario= start states (for `ending`, app.ts opens the Heart's cavern)
tests/                 Vitest (list below)
e2e/shots.ts           Playwright screenshot sweep (27 shots, 35 images; list below)
scripts/
  release.ts           the itch.io zip (written by hand with node:zlib, no dependency)
  art/                 art pipeline: build, sheet, coverage, lib; importers, fixers and review tools
                       (STYLE "Pipeline")
public/                favicon.png; art/ (atlas.png/json and terrain sheets, generated)
art/                   recipes/; raw/ (PixelLab downloads, untouched); edits/ and edit/ (free
                       fixes); ref/ (anchors, swatch, layouts); out/ (review sheets, not kept)
docs/reviews/          review-1 (critic, systems, art, decisions), review-2 (critic, code review,
                       decisions), act-bots (report, decisions) and review-3 (critic, art, qa,
                       decisions): the reports DECISIONS.md cites
PATCHNOTES.md          player-facing notes; the What's new window reads it
```

Tick order (`Game.tick`): rebuild belt order for dirty layers → hazards and light every 20 ticks →
power solve → per layer: production, logistics, digging → elevators → planned ghosts every 30 ticks
→ milestones every 15 ticks, discoveries every 30, the starvation check every 5 s → contract
refresh.

### Tests

`tests/bot.ts`, `tests/core.test.ts`, `tests/act*.test.ts` and `tests/play/` belong to the act-bot
work; the rest test the game directly.

| File | What it covers |
|---|---|
| `helpers.ts` | `run()`, `sandbox()` (an open Surface with full stock) and `paint()` |
| `sim.test.ts` | the tutorial start (nothing pre-built), belts, building (rush, swaps, kept items, fair ghosts, drag crossings, Jammed, Build next, Mags' warnings, the Chute), machines, D1 and elevators, save round-trip |
| `layers.test.ts` | spores, interference and shield walls, taps, overcharged crystal, heat and steady ground, molten ingots, engine nodes, conduit rings, the 60 kW pool against 30 kW Attuners, power rules (the crew's coal rig waits on its full generator as Idle), data checks |
| `maps.test.ts` | three seeds: full-coverage Miner spots, depots and their requests, bore sites, washer water, forge ground, exact vents, the amber ring, the Shallows start pocket, conduits, nodes and the Heart |
| `pacing.test.ts` | every drill project against PLAN §8 from the recipe data; D1 and D2 as tutorials; the chorus routes |
| `elevator.test.ts` | requests and the cab (C1, C2, C3, C7, C9, C11) and the elevator defects (lower-station rotate, arrivals freeze, half-cab rounding) |
| `economy.test.ts` | contracts at a Chute (C12) and what $/min counts (C13) |
| `placement.test.ts` | placement, removal and refunds (the code review's placement defects) and Miner purity |
| `logistics.test.ts` | fair merges at real ports, side outputs, the Chute's faces, planned Shield Walls, spores in the build preview |
| `saves.test.ts` | a slot that won't load is told apart from an empty one |
| `labels.test.ts` | what the sim calls each objective step (`stepLabel`): generated labels leave the count out and use short item names |
| `ui-labels.test.ts` | every step label, at its widest count, fits the room hud.ts gives it (`stepLabelRoom`) |
| `findings.test.ts` | the act bots' findings the owner accepted (G1–G9 and L1, DECISIONS #90–#99): caverns a tunnel touches at a corner, the Drill's and the Heart's extras and jams, Unloaders and ghost holds, Mags's advice and bearings, filter changes, The Governor's milestone (with In Sequence still open, both land), default requests, hints and the drill-lines line, light over awake conduit |
| `review3.test.ts` | review 3's sim findings (DECISIONS #101–#113): a belt into a station's front jams it and a side that is only full doesn't, Mags's drill-lines line, head-on belts, the Strange tab (every tab one row of 13), a drag starting on a line's straight run (and on a turning belt or a machine port behind), the M3 and M5 hints, the starve count and the Board's "the", Act I's cash, the breakthrough's message order, the fuelled rig with the Surface over its line, decor weights and no tall props within 2 tiles on three seeds |
| `bot.ts` | the scripted competent player: only player actions, at real cost (`lay` puts a lane's Crossings down first, as a drag does, and holds the lane until the depot can pay for them); reads every game event by identity, Mags's advice about starved ghosts included (`starveAdvice`); watchers for stalls, deadlocks, jams and starved ghosts, and the start states' stand-in supply and income |
| `play/start.ts` | act start states (`startAct(n)`): the earlier acts' shafts, depots and rigs built through the game's own code, plus stand-ins for their factories (`ACT_SUPPLY` goods into the depots above every second, `ACT_INCOME`, `ACT_MONEY`, shaft tiers) |
| `play/find.ts` | map finders (deposits and full-coverage Miner spots, vents, bore sites, stations, hot and steady ground, water, conduits, nodes, free room), each saying whether a player could know it yet |
| `play/route.ts` | the belt router: paths over revealed floor that cross working belts with Crossings, as a drag does, and tunnels to dig; it keeps a building's side port clear only when something comes out of it (`pushCells`) |
| `play/report.ts` | the printed act summaries: milestone and project times against the PLAN §8 band, the extras the Drill or the Heart passed to the depot, power, elevators, stand-ins, rushes, jams, stalls, deadlocks, friction, then the details |
| `play/act1.ts`–`act6.ts` | the act scripts (`playActI`, `playAct2` to `playAct6`): each act's layout and phases on the seed's map; Act II starts from Act I's real end, Acts III–VI from a start state or from the bot of the act before (after D2 the Act II script belts its drill bits into the Shallows depot, for a chained Act III) |
| `core.test.ts` | smoke tests for the bots' core: every act start state, Act II from Act I's real end, finders, the router (lanes that wait for their Crossings, side ports), digging, surveys, requests, upgrades, reading events once the game's last 400 roll over, a Drill's extras against real jams, and Mags's starve advice |
| `act1.test.ts` | Act I: efficient, starter-only and careless runs to D1 |
| `act2.test.ts` | Act II from Act I's real end to D2 |
| `act3.test.ts`, `act4.test.ts`, `act5.test.ts` | Acts III, IV and V from their start states to D3, D4 and D5 (Act V delivers its molten ingots hot) |
| `act6.test.ts` | Act VI: the Engine woken and the Heart fed to the ending, M31 included |

### Screenshots (`e2e/shots.ts`)

`title`, `start`, `surface`, `surface_zoom4`, `surface_inspect`, `surface_build` (a Miner ghost
over the stone deposit, with its tooltip and the help line), `surface_drill`, `company`, `help`,
`surface_ghost`, `shallows`, `shallows_zoom2`, `shallows_depot`, `shallows_elevator` (the Surface's
top station: "Requested below"), `surface_jams` (the top station jammed by plates pushed into its
front, and a head-on belt pair with both badges, the mouse on one of the pair), `magma_heat` (the
heat overlay alone), `alien_node`, `fungal`, `crystal`, `crystal_overlay` (a selected Cutter's ring,
a Charger ghost's ring, a shielded Cutter, a fed Resonance Tap's arcs, a Press jammed by coal),
`magma` (every overlay off), `alien`, `alien_governor` (the Heart's beacon and the sleeping nodes'
markers in the dark, the radio dismissed, centred on (46, 33) at zoom 1 below 1000 px of height and
zoom 2 above, so every beacon clears the HUD at any size), `alien_awake` (awake conduit under a
loaded belt line and a Press), `alien_belts` (belt contrast: a loaded loop of every belt piece on
plain machine-stone floor round a conveyor laid along an awake conduit), `ending` (the awake Heart
under its layer card, the rings swelling out of its core), `ending_climb` (nine frames, one held in
each beat: the Heart, the rise out of the Strata, the Magma Shelf, the Crystal Depths, the Fungal
Caverns, the Shallows, the dawn, the text, then the thank-you card after a skip). A shot can set the
overlays before its setup (`overlays`), put the mouse over a tile (`mouse`), so build ghosts and
their tooltips show, and save several frames of one page (`frames`); the ending's shots hold the
sequence's clock at a beat (`__app.seekEnding(t)` with `cine.at(kind, layer, u)`), since it runs on
real seconds. Review 3 changed what many shots show (decor, floors, the Heart, the chutes and
belts), so compare against a fresh sweep, not older ones.

## Scenarios

Open `http://localhost:5190/?scenario=<name>` (add `&zoom=<n>` for a zoom level). Each builds a state
as if played; scenario sessions never save.

| Name | State |
|---|---|
| `start` | A new game (same as New Game) |
| `surface` | Act I mid-way: copper line through a crossing, a press line into the drill, milestone 4 |
| `shallows` | Shallows open, a smelter → press loop out of the depot, lamps, the coal rig |
| `fungal` | Fungal Caverns open, sapstone assayed, a separator loop with its resin returned |
| `crystal` | Crystal Depths open, a cutter → charger loop |
| `magma` | Magma Shelf open, a cooling bath loop |
| `alien` | Alien Strata open, everything unlocked, engine glass and cores in stock |
| `ending` | The Governor complete, the Heart's cavern open: the ending plays from the start |

## What's next

1. Review 3's verify leftovers (`ROADMAP.md` Phase 6), all visual: the ending's rise band reads as
   a starfield on the deep layers (the rock flecks in `world.ts` sit too close to `#090a14`) and its
   dawn weakly (a small sun, no horizon line); the breakthrough card covers the station and depot it
   announces; the jammed station's ≠ badge floats above the art (anchor it to the sprite's top or
   the front face); the title's stretched side columns smear at 1366×768. Then `npm run shots` on
   the result.
2. Art leftovers (`ROADMAP.md` Phase 3): the Drill's rim stripes. Optional: conduit pulses above the
   darkness (a second particle pass), the Crystal and Magma ore beds on the checkerboard only.
3. A whole-game chained bot run. Act III chained from the Act II bot's real end (`playAct3(bot)`)
   finishes at 23:03, as from its start state, but Act IV chained on from there stalls at Feed the
   Drill 163/360: the Surface's motor Assembler and the Shallows' drill-bit Assembler keep turning
   the wire and beams the Crystal Depths needs into spare Motors and Drill Bits (`PROGRESS.md` part
   4). The act scripts need to switch spent lines off; then a test can play the game end to end.
4. A depot Unloader feeding a Drill or the Heart loops a good through the depot once that need is
   met: each extra goes straight back into the depot (1,371 Engine Glass round trips in the Act VI
   bot; DECISIONS #91 records it as a known behaviour). The need's tooltip in the inspector tells
   the player to switch that Unloader off. Decide whether the game should stop the loop itself, and
   have the act scripts switch their spent Unloaders off (`ROADMAP.md` Phase 6).
5. Human playtests: the PLAN §8 bands (the bots land 6–42% under the floors: Act I 14:07 now that
   its milestones pay $725, the rest 22–42%), whether money runs short in Act I now and should in
   Act II (#109 left Act II to people), and the other things #100 kept (`ROADMAP.md` Phase 6).
6. PixelLab has 333 generations left under the cap; no paid job is planned.
7. Commit and push only when the owner asks: a push to `main` redeploys the public game.
