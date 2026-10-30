# Progress

What is actually built, newest first. `ROADMAP.md` has the plan; this is the log.

## 2026-10-30 — Session 1, part 6: the verify pass, and the game goes public

- **Review 3's verify pass:** one agent in the running game at 1280×720, 1366×768 and 1920×1080
  (27 shots and 35 PNGs with no console errors, the ending start to finish and a real D1 flow)
  confirmed all 39 findings as built and found five leftovers, now fixed: the 3×3 chutes start from
  their `chute` anchors (`spriteChuteEdges`: a `#202e37` spout from the art's edge pixel, so the
  stations' east, west and north chutes meet the body); the renderer reads each floor set's
  variant share (`terrainVariantShare`: 0.75 for the Surface ground and the magma, 0.25 for the
  rest); PATCHNOTES and PLAN no longer promise a coal rig on the Crystal Depths; `title_mock.ts`
  uses the title's fit rule; #108 cites the #98 order it reverses. Two scenario fixes: `surface`
  holds M3's Sorter license, `alien_awake` wakes its nodes.
- **Open from the verify** (all visual, `ROADMAP.md` Phase 6): the ending's rise band and dawn,
  the breakthrough card over the arrival, the jammed station's badge, the title's side columns at
  1366×768.
- **Published:** the public repository `ycgNem/the-mountain-is-a-machine` and GitHub Pages:
  `.github/workflows/pages.yml` runs the tests and the build on every push to `main` and deploys
  `dist/` to https://ycgnem.github.io/the-mountain-is-a-machine/.
- **Checks:** 245 tests in 20 files pass, the typecheck passes, the build is 390 kB of JavaScript
  (136 kB gzipped).
- **PixelLab:** nothing spent: 167 of the 500, 333 left, the credit untouched.

## 2026-10-30 — Session 1, part 5: review 3

- **Review 3** (`docs/reviews/review-3/`): three reviewers played the finished first version
  headless. The indie critic (K1–K13) said "Ship with fixes": the first 15 minutes work, a sloppy
  run still repaired the Drill at 17:06, the elevator and requests now read clearly and the ghost
  tooltips are the best thing in the build. The art director in the running game (A1–A15) said
  "Ship with fixes", and QA with a performance pass (Q1–Q11) "Ship once a few fixes are in": no
  console errors in any run, 0.63 ms of JavaScript a frame in the alien scenario at 1920×1080 and
  1.59 ms on a 650-building stress layer at zoom 3, nothing over 8 ms. A skeptic reproduced all 39
  findings, and the owner accepted every one, declining only K1's third fix (the front's corners
  taking cargo). DECISIONS #101–#120.
- **What they found:** at the first breakthrough Mags sent the drill lines to a station whose whole
  south face, where they arrive, silently refuses cargo; a machine's facing and a belt's direction
  couldn't be read once built, and a head-on pair of belts said nothing; from the Fungal Caverns on
  the build bar took a quarter of the screen and moved its buttons; the finale happened off screen
  (the ending a static view over the arrival, most of the conduit a node wakes under unrevealed
  rock); the drill ETA pooled every good and printed "11 min 60 s"; Act I's money never bound; PLAN
  claimed 4–6 hours against its own bands' 3:05–4:40. The art: crate stacks shouting over the
  starter line, one floor tile paving the Surface, the mountain face a screen-door mesh, the title
  cropped at in-between window sizes, the elevator cab drawn off the art's pit, the Alien ore beds
  as pits, the Heart's ring clipped, eleven decor outlines in the darkness tint. QA: windows over
  the build bar whose buttons the bar took, an automatic UI scale that ignored width, a crew rig
  that never started with no power above, Company rows that overprinted.
- **Fixed:**
  - Sim: a belt into a station's front marks it Jammed (`jamWhy` 'front') and Mags's drill-lines
    line says where, per layer (K1); head-on belts are marked on both (K2); the Strange category on
    key 5 (K4); a drag starting on a line's straight run lays a Crossing (`pushesInto`, K7); the M3
    and M5 hints (K8); the starve line's count with some in stock (K9); Act I's milestone cash
    halved to $725 (K11); the breakthrough's message order (K13); the crew rig's generator starts
    with 4 coal (Q2); "the Shallows" mid-sentence (Q10); decor by per-name shares with no two tall
    props within 2 tiles (A1). New test file `tests/review3.test.ts` (18 tests); the act-bot tests
    and `starveAdvice` follow the new wordings, and Act II's start money is Act I's real end.
  - Render: the `≠` badge on a jammed station and on head-on belts, port brackets on the hovered and
    selected building, the 2 px chute arrow, the conveyor's bowed `>` rungs (K1, K2); veins of awake
    conduit through the rock (K5); the cab in the art's pit (A4); the Surface's hard rock in
    `#ad7757` (A5); the Alien ore bed on the sheet (A7); spores on open floor only (A8); lit glass
    from the conduit sheet (A9); dormant Engine Nodes (A10); deposit decals that step away from
    their neighbours' variants, ±3 px on the bed (A14); `alien_governor` framed at any size and the
    new `surface_jams` shot, 26 in all (Q11).
  - UI: station and head-on jam texts, a machine's hover naming the stuck good (K1, K2, K9); the
    fifth tab, hidden deeper buttons and a bar that doesn't move (K4); the slowest good's ETA and
    "No supply" (K6); the short layer label and the strip's drop order (K10); layer hints that wait
    for the card, the radio and the intro (K13); the title fitted to the window (A2); paged windows
    above the bar and `UI.occluders` (Q1); the automatic scale's width floor and the capped choice
    (Q3, Q5); Company rows (Q4); no world hover under a blocking window (Q6); the card and the
    toasts that wait (Q7); the radio's button (Q8); the title under a window (Q9).
  - Art: wood crate planks (A1); floor variant sheets for the Surface, the Shallows, the Crystal
    Depths and the magma, with a share per set (A3); recipe anchors and variant shares built into
    `atlas.json` (A4); the Shallows lip (A11); the Heart re-rolled, one paid job (A12); the decor
    outlines and off-ramp colours (A13); the Alien floor's green joints (A15). New tool options:
    `recolor.ts` flood ops, `terrain-fix.ts` edge margins and guarded pixel patches. The atlas
    holds 159 entries; `art:coverage` stays 144 of 146.
  - The ending (K3, A6): a sequence on real seconds, about 33 s with six layers, in the new
    `src/app/ending.ts`. The camera pans to the Heart as it wakes (rings out of its core, light over
    its cave) and climbs layer by layer to the Surface, through the rock between them, with light
    spreading from each shaft, each layer's card and a rising bell; the Surface comes up at dawn
    (sky, sun, a warm dither) under the closing text, then the thank-you card. No HUD until the
    card; Esc or a click skips; the hum stays on the Heart's chord; the player's view comes back
    after. Renderer passes for the dawn, the night, the Heart's rings, the light from the shaft
    and the rock band (`EndingLook`, `riseBand`); the layer card shared with the breakthrough
    (`drawLayerCard`). The `ending` shot holds on the Heart and the new `ending_climb` takes nine
    held frames of the sequence: 27 shots.
  - Docs: this round (DECISIONS #101–#120, PLAN, STYLE, ROADMAP, HANDOFF, README, PATCHNOTES).
- **Act times on today's build** (seed 20261030, act time): Act I efficient 14:07 (12:45 before
  this round; M5 at 10:47, the 160 kW line bought at 12:05 instead of 8:14, the Surface at 0.63 of
  its power for about 3.5 minutes, $383 at D1 with M6's reward), starter line only 17:22 (16:17),
  careless 16:00 (15:13, the same $60 gear rush); Act II from Act I's real end, starting with $383
  instead of $1,105: D2 at 12:15 (12:19), M10 at 12:21; Acts III–VI unchanged at 23:03, 30:50,
  25:02 and 23:17. Act I now lands 6% under its floor, the others 22–42%; the six acts add up to
  about 2 h 09 min. No new stall or deadlock.
- **Tests:** 245 in 20 files, all passing (ui-labels 45, layers 27, maps 27, core 26, sim 24,
  review3 18, findings 17, elevator 16, placement 13, pacing 8, logistics 7, economy 4, act1 3,
  saves 3, labels 2, and one each in act2 to act6). `npm run typecheck` passes.
- **Build:** 389 kB of JavaScript (135 kB gzipped), 770 kB in all (the atlas 268 kB, the terrain
  sheets 100 kB).
- **PixelLab:** one job, H2, the Heart (10 generations; 3,900.1 to 3,910.1 used, the credit
  untouched): 167 of the 500 spent, 333 left. Table below.
- **Open:** a verify pass on this round and a shot sweep on the combined build; `terrain.ts`
  reading the per-set variant share; the 3×3 chute anchors; `title_mock.ts`'s fit rule; the
  Drill's rim stripes; human playtests (the bands, and money now that Act I pays half); the
  chained whole-game bot run; the depot-Unloader loop.

## 2026-10-30 — Session 1, part 4: what the act bots found

- **The act bots** (`tests/bot.ts` and the act scripts in `tests/play/`, run by
  `tests/act1.test.ts`–`act6.test.ts`) played every act on the real map (seed 20261030) with player
  actions only, at real cost: Act II from Act I's real end, Acts III–VI from start states with
  stand-in supply for the acts before. Every act finished, with no deadlock or rush in a competent
  run, and faster than its PLAN §8 band. The report and the owner's calls are in
  `docs/reviews/act-bots/`; DECISIONS #90–#100 cite them.
- **What they found:** a cavern a tunnel touched at a corner stayed dark and the rest of the dig
  queue was dropped (Acts II and III); the Drill refused a good it had all of and showed Idle, so a
  trunk shared by several goods stopped for good behind the first spare (Acts II–V); Unloaders took
  what planned ghosts waited for while Mags said nothing (Acts IV and V); Mags told players to
  request goods only their own layer makes (Acts III–V); a filter change pushed the old item on into
  a machine (Act IV); nothing showed where the Heart and the two far nodes are (Act VI); The Governor
  never entered the finished milestones (Act VI); the Crystal Depths requested no Insulation and the
  Alien Strata too few plates; and three things the bots needed that no hint said (the node's
  four-Heartstone front, a hot line's overflow, drill lines left ending on bare floor).
- **Fixed** (owner's calls G1–G9 and L1):
  - Sim: digging opens a cavern only where it meets it straight on, and repairs caverns an older
    build half lit (G1); the Drill and the Heart stack a met need's extras in the depot, with one
    toast per good, and say Jammed when the depot is full or the good is wrong (G2); depot Unloaders
    leave what waiting ghosts hold, and Mags names Unloaders that take arrivals (G3); Mags says how
    to make a good down here when no depot above has any (G4); a filter change gives the held good
    back (G5); Mags gives bearings to the sleeping nodes and the Heart at M30 and M31 (G6); The
    Governor lands as a milestone before the ending (G7); Insulation 20 on the Crystal Depths' list
    and 60 Iron Plate on the Alien Strata's (G8); the M28 and M25 hints and the breakthrough's
    drill-lines line (G9); awake conduit lights every other tile at radius 2.5 and 0.7 (L1).
  - Render: the Heart's beacon and the sleeping nodes' markers while the Governor is open (G6).
    Screenshots: 25, with the new `alien_governor`; `surface_build`, `shallows_elevator`, `magma` and
    `magma_heat` redone so each shows what it is for; a shot can set the overlays and the mouse.
  - UI: the Drill's and the Heart's delivered/needed rows with extras and the Jammed line (G2); the
    fix pass's verify items (#89): the Sequencer's next side by compass, held requests told apart
    from none spare, held cargo worded "is full of it", the Stack's tooltip on held cargo, no bare
    "Unlocks:" on the Engine Glass card.
  - Docs: the fix pass's verify items (ROADMAP's Engine rule, Mags as the site engineer, the 999
    hold, silent rings, contracts at 1.7–2.5×, the review-2 range, the UI pass), and this round.
- **The verify's leftovers:** the ending lands every milestone still open through The Governor, in
  order, with their rewards (In Sequence never landed when the Heart was fed first; #96); a jammed
  Drill or Heart wears the `≠` badge in the world (#91); a Miner or machine whose fuel waits on a
  generator that holds all it can shows Idle, not Output blocked, with "The generator is full" in
  its inspector (every new layer's coal rig showed the red `✕`; #39); the fungal, crystal, magma
  and alien scenarios count their finished assays' samples (the fungal objectives read "Assay
  Sapstone 0/20" ticked); a finished need's tooltip says to switch off a depot Unloader set to it,
  whose extras only loop through the depot (a known behaviour, #91; ROADMAP Phase 6); a comment and
  a test citation corrected.
- **Kept as it is** (#100): produce steps count from the milestone's start; money is never short
  for the bots; wash or separate rarely bites; Act VI mostly waits on imports; the PLAN §8 bands stay
  until people play.
- **The bots' own fixes** (the "Test harness" list in `docs/reviews/act-bots/decisions.md`): they
  read the game's events by identity, so none are lost once `g.events` rolls past its last 400;
  `Bot.lay` puts a lane's Crossings down first, as a drag does, and holds the lane until the depot
  can pay for them; the Drill and the Heart count as taking whatever `projectRefusal` lets through;
  the router keeps a side port clear only where something comes out of it; after D2 the Act II
  script belts its drill bits into the Shallows depot, for a chained Act III. No WORKAROUND blocks
  are left. Four new tests in `tests/core.test.ts`: side ports, events past the last 400, a Drill's
  extras against real jams, and reading Mags's advice about a starved ghost.
- **Act times on today's build** (act time, band in brackets): Act I efficient 12:45, starter line
  only 16:17, careless 15:13 (15–25; the careless run still rushes its one gear deadlock); Act II
  12:19 (20–30; M10 at 11:35); Act III 23:03, Act IV 30:50 and Act V 25:02 (40–60; Act V's one
  stall, 07:34–10:49, is its 73-tile trunk waiting for plates, then carrying its first goods); Act VI
  23:17 (30–45), with M31 now finished at 23:17. Every act lands 15–42% under its floor. Before this
  round: Act I efficient 12:40 and careless 15:07, Act II 12:27, Act III 23:02, Act IV 30:54.
- **Chained runs** (scratch runs, not tests): Act III chained from the Act II bot's real end
  finishes D3 at 23:03, as from its start state; Act IV chained from an Act III bot that began at
  its start state finishes at 35:38 (30:50 from Act IV's own start state; the report had 35:39).
  Chained all the way from Act I, Act IV stalls at Feed the Drill 163/360 from 21:04: the earlier
  acts' lines keep eating what the Crystal Depths needs (the Surface's motor Assembler turns its
  wire into Motors and the Shallows' drill-bit Assembler turns Steel Beams into Drill Bits: 232
  spare Motors and 323 spare Drill Bits in the Shallows depot by Act IV's 40th minute), so only 3
  of D4's 200 Circuits arrive. The act scripts don't switch spent lines off yet.
- **Tests:** 227 in 19 files, all passing (ui-labels 45, layers 27, maps 27, core 26, sim 24,
  findings 17, elevator 16, placement 13, pacing 8, logistics 7, economy 4, act1 3, saves 3,
  labels 2, and one each in act2 to act6). `tests/findings.test.ts` is new: one or more tests per
  finding. `npm run typecheck` passes.
- **Build:** 365 kB of JavaScript (126 kB gzipped), 656 kB in all.
- **Open:** human playtests against the bands, and for money; the ghost-hold stall #92 warns about;
  a whole-game chained bot run (the spent lines above); the art director and QA in the running
  game; a third critic round.

## 2026-10-30 — Session 1, part 3: review 2, the art run, the act bots

- **Review 2** (`docs/reviews/review-2/`): the indie critic played the build headless through every
  layer's scenario. Verdict "Not yet": the elevator and request system was arbitrary and hard to
  read (only building goods could be requested, one big request starved a 10-plate ghost for 7.7
  minutes, nothing showed how full the cab was), Chorus Crystal and Thrumstone had one dominant
  answer, and D2 broke the Act II band. All 13 findings were confirmed and accepted (critic-2
  C1–C13). A code review of the review-1 changes confirmed 30 defects and rejected 3 (code-2).
- **Built from review 2** (sim and data, then UI; DECISIONS #64–#81):
  - Requests for any good the save has made except hot or unstable ones, served in turn (the shaft
    saves the last one served), up to half a cab rounded down (3 / 4 / 7); starvation messages that
    name the real cause; live shaft traffic; "Request the missing goods" for a ghost; upgrades paid
    from the lower depot first; lower stations that can't turn and are repaired on load
    (`SAVE_VERSION` 3).
  - Chorus vents poor (15 a minute each, 45 in all) and Charge Grit 2 s; D2 is 100 Steel Beam,
    30 Motor, 50 Drill Bit (first chain 20.7 minutes, a second tutorial); the Engine wakes ring by
    ring (5 rings, 3 tiles apart), 60 kW per awake node, Attuners 30 kW; per-layer default requests
    and the HQ's floor (Iron Plate 20, Gear 10, Copper Wire 10); contracts at a Chute, paying
    round(pay × (terminal + 0.6 × chute) / count); income without milestone rewards.
  - The starter line starts pre-filled (first sale at 1 s), the camera opens on the Drill and the
    Terminal, and the first step reads "Click the Drill".
  - The 30 code defects: drags lay crossings first and report what they refused, planned crossings,
    short foundations refused, swaps over rushed goods, pause only on machines, miners and
    collectors, surveys charged only when they reveal something, refunds through one helper (hot
    goods cool, unstable ones are lost, unfinished crafts come back), fair merges at real ports,
    planned Shield Walls that don't shield, the Chute from any side, nodes ejecting wrong items
    cooled, arrivals that froze a shaft, saves that fail to load or save, panels the mouse fell
    through, inspector heights, knowledge cards, ETA history, the power meter, rule texts.
  - UI: the depot strip in the top bar, station traffic and the Stack's live rate, request rows
    (stock/target, "none spare above", Shift 50, wheel 10, the Add row deepest layer first), the
    upgrade button's sources, node ring and jam lines, the HQ's "Keep for the Surface", the build
    tooltip beside the ghost, an inspector measured to its content that scrolls, a paged Field Manual,
    the load-error and save-failure dialogs. Checked in 34 screenshots at 1280×720.
  - The Act I bot on the new rules: efficient D1 12:40 (first sale 00:01, first building 00:06),
    starter-only 16:17, careless 15:07.
- **The fix pass after review 2's verify** (DECISIONS #87, #88): a placed Foundation is no longer
  reported as refused; requested goods are held back when the lower depot is full; held top-bay
  cargo is named at the top station; ring 1 is measured from conduit outside the node's footprint;
  no `node_awake` event when nothing lights; the Thrumstone assay unlocks the Attuner and the
  Sequencer and Engine Glass unlocks nothing; the Magma Shelf's wall colours are `#151d28 #10141f`;
  belts have more contrast on every floor; the Fungal floor variant sheets; `art:coverage` counts
  decor and the code-drawn pieces; `title_art` is built at 320 × 180; the Precision Assembler's and
  Assay Lab's atlas art is recoloured to their families; atlas art carries light spots (a recipe's
  `light` key, written into `atlas.json` "lights" by `art:build`), so 29 building sprites glow while
  they work.
- **The fix pass's UI** (#88): windows open clear of the objectives column and the build bar
  (`barRoomTop`, `STACK_W`), and a HUD panel still under a window or the ending card steps aside
  (`App.covers`, `overlayRects`, `covered()`); toasts, floats, the breakthrough card and Mags run on
  real seconds (`App.dt`; at 240 fps they had run four times too fast); toasts draw over windows
  and fade; the HUD and inspector step aside while the ending's text plays, and its card fits its
  text; the title footer sits on its own dark strip; a short foundation drag gives the whole
  shortfall. Checked at 1280×720 and 1920×1080 with 204 tests passing.
- **Renderer and fallback passes** (no PixelLab spend; #82, #83):
  - `world.ts` draws in passes: ground, then everything that stands back to front by row (tall decor,
    building bodies with their chutes, items on belts), darkness, the emissive pass, overlays above
    the darkness. Code-drawn machines' light spots glow while they work. The interference ring shows
    only from the Crystal Depths on, around taps too, and tap arcs carry a travelling pixel. Also
    the jammed `≠` badge, front chutes only where items leave, and the hard-rock dither in each
    layer's own dark tone.
  - Tall decor is left out wherever it would reach a building, a ghost or anything but open floor
    (checked against its visible pixels); awake conduit glass stays 1 px back from standing
    buildings and is cut out with `destination-out`; `title_art` is read from the atlas; a 32 × 32
    Apollo favicon; `willReadFrequently` on the terrain cache.
  - Fallback art: decor from the layer data, dull, one muted accent per layer and never `#090a14`;
    family accents made unique (steel crate, alien switch-box Sequencer, iron-drum generator, glass
    Spore Filter, the Separator's amber window, the Precision Assembler's turntable, the Assay Lab's
    steel dome, Chemistry glass without `#73bed3`, every light spot on a top face); the Merger's last
    code gone.
- **The art run** (PixelLab, 157 generations; table below; #84–#86):
  - Terrain: standard tilesets won the L1 pilot over pro (pro inverted the values, at 15 a set);
    all ten sets came back with 16 combinations, eight with free recolours (`terrain-fix.ts`).
  - Items: 43 of 45. I1 came back about 14 × 14, so its picks were fitted to 12 × 12 for free
    (`itemfit.ts`); I2, anchored on them, came back inside. The filter and the resonant core failed
    both rolls and stay code-drawn.
  - G1 and G2: all 27 deposits, the 16 px decor (15 props and the amber-sealed rock) and the 7 1×1
    buildings. M1, M2 and M3: all 22 2×2 machines (M1 picks recoloured to their family accents) and
    the seven 32 px props.
  - Style-matching `create_map_object` only continued the background in three tries, so the 3×3
    buildings, the Drill and the Heart came from `create_1_direction_object` at 48, 80 and 112 px;
    the broken Drill and the awake Heart are hand edits. Mags (`create_image_pro`, candidate 3 of
    25) and the title (pixflux seed 31106 of six, cleaned up).
  - The art director's review ("ships once a short list is fixed"): one paid job (M3, the Separator
    as a tank pair) and free recolours: glints on the Shallows deposits, cobalt shine, the Crystal
    machines off the Alien aqua, the crate stack and minecart softened, the Terminal in company
    yellow, the Heat Shield in aggregate browns, the Stabilizer's cyan chamber, glow colours off two
    props, three Fungal floor variants.
  - `art:coverage`: 121 of the 126 names it then counted; the five gaps were the two code-drawn items
    and the three belt pieces the game never asks the atlas for.
  - New free tools in `scripts/art/`: `ref`, `palettes`, `tileset`, `mock`, `scene`, `candidates`,
    `items`, `anchors`, `itemfit`, `recolor`, `touchup`, `stretch`, `terrain-fix`, `mapobj`,
    `title_layout`, `title_mock`, `title_finish`.
- **Act bots for every act** (real map, seed 20261030; no deadlock or rush in any): Act II reaches
  D2 at 12:27 of act time (band 20–30), Act III D3 at 23:02 (40–60), Act IV D4 at 30:54 (40–60),
  Act V D5 at 25:02 (40–60, with one stall from 07:34 to 10:41 while its Drill waited on a shared
  belt) and Act VI the Governor at 23:17 (30–45). Every act is faster than its band; Act II starts
  from Act I's real end, Acts III–VI from start states with stand-in supply for the acts before.
  Their friction list is in `ROADMAP.md` Phase 6.
- **Tests:** 205 in 18 files, all passing (ui-labels 45, maps 27, layers 26, sim 24, core 22,
  elevator 16, placement 13, pacing 8, logistics 7, economy 4, act1 3, saves 3, labels 2, and one
  each in act2 to act6). The count fell from 241 when `labels.test.ts` stopped measuring every label
  a second time (`ui-labels.test.ts` measures them against the HUD's own room).
- **Build:** 353 kB of JavaScript (122 kB gzipped), 644 kB in all with the atlas (232 kB) and the
  terrain sheets. `npm run release` writes the itch.io zip.
- **Open** (`ROADMAP.md`): the bots' friction list, and the PLAN §8 bands against the bots' times;
  the renderer reading the art's other anchors (the elevator pit, the 3×3 chutes); awake
  conduit glass from the sheet lit above the darkness; decor weights and stacking props; a tall prop
  can still cover the 1 px tip of a chute poking into an empty tile; the art director and QA in the
  running game; a third critic round.

## 2026-10-30 — Session 1, part 2: plan review 1 built

- **Sim and data (DECISIONS #21–#53; #54–#63 followed from the Act I bot and the verify pass):**
  - Elevators: 45/90/180 items a minute; depot supply requests hauled down by the cab (half the cab
    first, then belt cargo, then more requests; relayed down the stack; never below the upper
    depot's own request); default requests on new layers; upgrades paid from the upper depot.
  - Rush replaces requisition; Company Chute (60%, instant); contract cap and a $200 re-roll; no
    Surface surveys; game speed 1x/2x.
  - Graded heat (hot 2 tiles, warm 3–4), exact 2×2 vents (Emberite vents on hot ground), the
    Precision Assembler on steady ground, hot items cool in containers; bigger start pockets; the
    amber-sealed rock and Mags's line at the Shallows bore site.
  - Interference by footprint gap with shield walls anywhere in the spanning rectangle; the
    placement ghost predicts speed and tap output.
  - The Engine wakes: dormant conduit, the Waking Node, 2 s per item, the conduit pool.
  - One output port per machine; placement refuses unpaid swaps; a replaced belt never loses its
    item; ghosts build oldest first and hold what they need; machines pause.
  - The starter line splits into the Terminal and a Press feeding the HQ; First Light asks to click
    the Drill; Copper Line marks a Miner on the copper; Brickwork asks for the line upgrade.
  - The Governor asks for 60 Ember Cores (#52); three save slots, and scenarios never save (#53).
- **UI:** Rush button on ghosts, depot request editor, elevator traffic line, pause button and P key,
  contract re-roll, ghost tooltips with predicted speed, hot/warm/conduit ground tips, Waking Node
  panel, chute panel, cropped icons for big buildings in the build bar, three-slot title screen,
  updated Field Manual; sound effects at their own balanced levels; jsfxr removed.
- **Tests:** 79 in five files (the Act I bot's three runs included): request relay across two depots (exact counts),
  45/min with requests alone, rush and refunds, paid swaps, kept belt items, fair ghosts, chute,
  heat grades and foundations, steady ground, node timing and wrong items, waking conduit, the
  conduit pool, power draw when slowed and across cables, vents and the amber ring on three seeds,
  and `tests/pacing.test.ts` holding every project to PLAN §8.
- **Act I bot on the new rules (#54):** efficient D1 12:58 with no deadlock or rush; starter-only
  16:43; careless 15:25. Its findings are fixed: drags lay crossings instead of turning working
  belts, a "Jammed" status names the wrong item, "Build next" reorders ghosts, Mags warns when a
  depot runs dry, rushed buildings count in the build stats.
- **Build:** `npm run build` clean; 304 kB of JavaScript (103 kB gzipped).

## 2026-10-30 — Session 1 (autonomous first run)

- **Tests:** 42 passing (`tests/sim.test.ts`, `tests/layers.test.ts`, `tests/maps.test.ts`):
  - belts (packed line, splitter 3/3/3, fair merge), press, starter line (first sale under 20 s,
    13–16 ingots/min), milestone 1, D1 breakthrough (shaft, stations, depot, next rig), elevator
    throughput, save round-trip;
  - layer mechanics: spores and filters, interference and shield walls, resonance taps, overcharged
    crystal shattering on belts but going machine to machine intact, heat (slow, forge bonus, immune
    bath, foundations), forges refusing cold ground, ingots cooling on plain belts but not insulated
    ones, engine node sequence and resets, conduit power and attuners, generators burning only what
    the grid needs;
  - data: every drill project and every building cost reachable on its layer, every item has a
    source, every milestone names real things;
  - maps (three seeds): every deposit has a full-coverage miner spot reachable from the shaft, depots
    beside the lower stations, bore sites floor and reachable, washer water, forge hot ground,
    attuner conduits, every engine node and the Heart reachable.
- **Fixes from testing:** spacing cap only for items from the same side (merges were freezing);
  power loop; save occupancy order; hidden rigs stay hidden; belt curve direction; the elevator cab
  now waits for a fuller load (full, other end has cargo, or 2.5 s); the lower station faces its
  depot so goods sent down land in stock; the "dig to the bore site" milestone now fires when a
  tunnel (not just a cavern reveal) reaches the site; the surface scenario's plate line now ends in
  the drill.
- **Code:** the full simulation for all six layers, rendering (terrain cache, animated belts,
  darkness, overlays), immediate-mode UI (HUD, inspector, windows), app shell with scenarios,
  Playwright shots, art pipeline scripts, code-drawn fallback art for every sprite name.
- **Docs:** PLAN (full game, six layers, ending), STYLE (Apollo palette, sizes, manifest, PixelLab
  settings, recipe format), ROADMAP, DECISIONS, HANDOFF (code map, scenarios, commands), README,
  CLAUDE.md, project agents.

## PixelLab spend

Cap for the first run: 500 generations (stop at 4,243.1 used on the account). The $2.00 credit is
never spent.

| Date | Batch | Generations | Account used after |
|---|---|---|---|
| 2026-10-30 | (start) | 0 | 3,743.1 |
| 2026-10-30 | T pilot: L1 terrain, pro (15) against standard (3 rolls at 1); standard won | 18 | 3,761.1 |
| 2026-10-30 | M1 machine view pilot (`create_1_direction_object` 32 px, 64 candidates; 14 machines and 6 decor kept) | 10 | 3,771.1 |
| 2026-10-30 | T: the other nine terrain sets (9 first rolls, 6 retries) | 15 | (parallel) |
| 2026-10-30 | I1 and I2 items (I2 anchored) | 20 | (parallel) |
| 2026-10-30 | G1 and G2: deposits, decor, 1×1 buildings (G2 anchored) | 20 | (parallel) |
| 2026-10-30 | M2 machines (anchored) | 10 | (parallel) |
| 2026-10-30 | P portrait (`create_image_pro`, 10) and TA title (6 pixflux seeds) | 16 | 3,852.1 after all five |
| 2026-10-30 | C 3×3 buildings (3 failed `create_map_object` tries, one size-48 job: 13), D the Drill (size 80: 15), H the Heart (size 112: 10) | 38 | 3,890.1 |
| 2026-10-30 | Redo: M3 (the Separator, with alternates for four more) | 10 | 3,900.1 |
| 2026-10-30 | Review 3, H2: the Heart re-rolled (`create_1_direction_object` at size 100, 4 candidates; `get_balance` 3,900.1 before; review object 2d7ee6c3-b775-4e70-881e-d84371a1a209, frame 0 promoted free as object 59baacf8-c64b-4462-8249-b5f2b175be49) | 10 | 3,910.1 |
| | **Total** | **167 of 500** | 333 left; the $2.00 credit untouched |
