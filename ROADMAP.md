# Roadmap

How the game in `PLAN.md` gets built, in order, with exit criteria. Tick boxes as phases land and
record the details in `PROGRESS.md`. Phases can overlap: art (Phase 3) runs alongside code.

**Where it stands (2026-10-30):** session 1 built the first version of everything in Phases 0–5 and
most of 6 and 7: the simulation for all six layers, rendering, UI, audio, scenarios, tests and the
release zip. Plan review 1 (`DECISIONS.md` #21–#63) and review 2 (#64–#89: the indie critic's
C1–C13, 30 confirmed code-review defects, `docs/reviews/review-2/`, and the fix pass after its
verify) are built and tested. The PixelLab art run is done (157 of the 500 generations, 167 with
review 3's Heart): every sprite name the game asks for has art except two items, which stay
code-drawn on purpose, and 29 building sprites glow at the light spots their recipes place. The act
bots play all six acts on the real map with no deadlock or rush, every act faster than its PLAN §8
band; the game fixes they found are in (#90–#99; the bands stay until people play, #100), and so are
their harness's own fixes. Review 3 (the critic's third round, the art director and QA in the
running game; #101–#120, `docs/reviews/review-3/`) said "Ship with fixes", and its 39 accepted
findings are built. A verify pass in the running game confirmed them, and its leftovers are fixed
(the 3×3 chutes from their anchors, each floor set's variant share) or listed in Phase 6. The game
is public at https://ycgnem.github.io/the-mountain-is-a-machine/ (GitHub Pages, deployed from
`main`). Open: the verify's visual leftovers, human playtests against the bands, a bot run chained
through the whole game, and a desktop wrapper if wanted.

## Version 1.0: the whole mountain

### Phase 0 — Docs and setup
- [x] PLAN.md (full design), STYLE.md (art bible + asset manifest), ROADMAP.md, DECISIONS.md,
      HANDOFF.md, PROGRESS.md, README.md, CLAUDE.md
- [x] Project agents: `art-director`, `indie-critic`, `qa-screens`
- [x] Critic review of the plan; revisions folded in (review 1: indie critic, systems and art
      reviews in `docs/reviews/review-1/`; DECISIONS #21–#63, the last nine from its verify pass)
- [x] Vite + strict TypeScript scaffold, Vitest, Playwright screenshot script, art pipeline scripts

**Exit:** `npm run dev` shows a canvas; `npm test` passes; docs reviewed.

### Phase 1 — Engine core
- [x] Fixed-timestep loop, input, camera (pan, whole-step zoom), canvas scaling
- [x] Grid per layer, building placement (ghost, rotate, costs, refunds, planned ghosts)
- [x] Belts, splitter, crossing, sorter, unloader, crate (one item per tile, side-loading)
- [x] Machines with recipes, buffers, status; miners on deposits
- [x] Per-layer power with shaft cables
- [x] Layers, shafts, freight elevator (cab, bays, throughput)
- [x] Depots, Shipping Terminal, money
- [x] Save/load (localStorage, versioned), autosave
- [x] Vitest coverage of belts, machines, elevator, power, save round-trip

Review 1:
- [x] Elevator tiers: cabs 6 / 9 / 15, travel 3 / 2 / 1.5 s, 45 / 90 / 180 items a minute each way;
      upgrades paid from the upper station's depot (#21; review 2 has the lower depot pay first)
- [x] Depot supply requests: a request list per underground depot, requests loaded first (up to
      half the cab, never below the upper depot's own request), relayed down the stack, default
      requests on new layers, a request editor in the depot inspector (#22; review 2 widened what can
      be requested and made the defaults per layer)
- [x] One output port per machine (2×2 front-right, 3×3 front-centre; side output on the left
      face's front-most tile: `outputPort` / `sidePort` in `logistics.ts`), drawn as a chute, and a
      front chute only where something comes out of the front (#42, #61)
- [x] Cut the Merger; belts take turns fairly between their inputs; the Merger's dead code removed,
      and a save holding one loads without it (#42, #63)
- [x] Planned ghosts build fairly; unpaid swaps refused ("Not enough goods to swap this in"); a
      replaced belt hands its item to the new piece or the depot (#48)
- [x] Machine pause in the inspector: no new crafts, no power draw (#51)
- [x] Power rules as built, with tests: full draw when slowed, surplus crosses shafts nearest-first
      within cable caps (#43)
- [x] Game speed 1× / 2× (#34)

**Exit:** a hand-built Surface factory runs for 10 minutes without a jam that isn't the player's fault.

### Phase 2 — Act I playable (Surface)
- [x] Surface map, starter line, the Drill and D1
- [x] UI: top bar, build bar, inspector, objective tracker, Mags's radio, toasts, the Stack
- [x] Milestones 1–6 (Act I of the 31), breakthrough sequence
- [x] Code-drawn placeholder art for everything; atlas loader with fallbacks
- [x] Debug panel and `?scenario=` start states
- [x] Act I pacing bot (`tests/bot.ts`, `tests/act1.test.ts`): before review 1, an efficient run
      reached D1 at 13:09 game time

Review 1:
- [x] Starter line Miner → Smelter → Splitter → Terminal and Press → HQ; the HQ starts with 100 Iron
      Plate (#38)
- [x] Act I in six milestones: First Light adds "click the Drill", Copper Line pre-places a planned
      copper Miner ghost, Pressed Metal is gone, Brickwork adds "upgrade the Company Line" (#38)
- [x] Smelter costs 10 Iron Plate + 2 Gear; Company Line 160 kW costs $1,000 (#49)
- [x] "Build" steps count what already stands (#50)
- [x] The Act I bot reaches D1 on the new rules: efficient 12:58 with no deadlock or rush; the
      careless run's two traps are now prevented (drags lay crossings) or warned (dry depots) (#54).
      On the review-2 rules (the pre-filled starter line): efficient 12:40 (first sale 00:01),
      starter-only 16:17, careless 15:07; after the act bots' fixes 12:45, 16:17 and 15:13; with
      review 3's halved Act I cash 14:07, 17:22 and 16:00 (#109)
- [x] Jammed: its own status and `≠` icon, with the item and the reason in the inspector (#54, #62)

**Exit:** a new player can go from page load to D1 complete without outside help.

### Phase 3 — Art pass (parallel from Phase 1)
- [x] Terrain: the L1 pilot chose standard tilesets over pro; all ten sets (including
      `t_l4_floor_hot`, `t_l4_hot_magma`, `t_l5_floor_conduit`), re-packed by their metadata
      corners, eight with free recolours (`terrain-fix.ts`)
- [x] Items (43 of 45: `i_filter` and `i_resonant_core` failed both rolls and stay code-drawn),
      deposits, decor and 1×1 buildings (`b_chute` included): I1 and G1, then the anchored re-rolls
      I2 and G2
- [x] 2×2 machines (M1 view pilot, M2, and M3 for the Separator); 3×3 buildings, the Drill and the
      Heart with `create_1_direction_object` at 48, 80 and 112 px (style-matching
      `create_map_object` only continued the background in three tries); the broken Drill and the
      awake Heart as hand edits
- [x] Mags portrait (`create_image_pro`, 48×48), title art (pixflux, 320×180, read from the atlas)
- [x] Contact sheet and shot review by the art director ("ships once a short list is fixed"), and its
      13-item redo: one paid job (M3) and free recolours
- [x] Art director review in the running game (review 3, "Ship with fixes") and its fixes: the
      eleven props' `#090a14` outlines and off-ramp colours, the Shallows' cream and gold rock lip,
      the Alien floor's green joints, floor variants for the Surface, the Shallows, the Crystal Depths
      and the magma, and the Heart re-rolled with a margin (one paid job, 10 generations)
      (#113–#119)
- [ ] The Drill's rim stripes (`#e8c170` / `#341c27`, not the Extraction `#de9e41` / `#151d28`)

Review 1:
- [x] `art:build` pad-and-fail rules: pad and centre, fail over the size limit, OKLab with a 50%
      alpha cut-off, a moved-pixel report (#47)
- [x] Light spots for atlas art: a recipe's `light` key, written into `atlas.json` "lights" by
      `art:build` and glowed by the renderer (29 of the 39 building sprites) (#47)
- [x] Recipe anchors in `atlas.json` ("anchors": the pit, the bore and core rectangles, the 3×3
      chute edges, checked by `art:build`), and the elevator cab drawn in the art's pit (#116)
- [x] The 3×3 chutes drawn from their anchors: a spout from the art's edge to the chute (#116)
- [ ] `art:coverage` checks closed item outlines and the 3:1 rule; shadow stripping (no PixelLab
      sprite has needed it) (#47)
- [x] `src/render/terrain.ts` reads `atlas.json` "variantShare" (0.75 for the Surface ground and the
      magma, 0.25 for the rest) (#115); `scripts/art/title_mock.ts` copies the title's fit rule (#114)
- [x] Darkness computed at tile corners with a world-anchored Bayer dither (bands 0 / 0.35 / 0.65 /
      0.85, unrevealed 1.0) and one tint `#090a14`; lit lips on rock edges; ore-bed tint and
      seeded ±2 px deposit offsets (#47)
- [x] Code-drawn art per the STYLE table: belt colours with an 8 px pattern period, items in
      lockstep with the belts, splitter, crossing and sorter, output and side-output chutes, 7×7
      status icons (no input, can't work here, paused and jammed included), ghost and selection
      colours (#47, #62)
- [x] Renderer fixes from the verify pass: heat grades in the heat overlay, dormant and awake
      conduits (awake glass above the darkness, never over buildings), the interference overlay's
      2-tile ring and shield rectangles, tap arc colour, hazard overlays above the darkness (#59)
- [x] Canonical sprite names in the data, the map and the renderer: deposits `d_<ore id>_<1-3>`,
      decor from the layer data, `x_l1_amber` at decor value 99 (#56)
- [x] Fallback art to the verify-pass rules: decor drawn under the layer data's names, dull decor,
      hazard stripes on Extraction sprites only (#56, #60)

After review 2 (renderer and fallback passes, the art run's follow-ups):
- [x] Tall decor never covers a building, a ghost or the dark (checked against the sprite's visible
      pixels); awake conduit glass kept 1 px back from standing buildings, with `destination-out`
      cut-outs; the terrain cache reads back without a GPU stall (`willReadFrequently`)
- [x] Title art read from the atlas (`title_art`, 320 × 180, in the build's wanted list); a 32 × 32
      Apollo favicon
- [x] Fallback art: decor never in the darkness tint (and the Magma Shelf's wall colours in the layer
      data, `#151d28 #10141f`, off it too); Separator, Precision Assembler and Assay Lab redrawn in
      their own families, Chemistry glass without `#73bed3`, top-face light spots everywhere
- [x] Precision Assembler and Assay Lab atlas art recoloured to their families
- [x] Belts with more contrast on every floor
- [x] Fungal floor variants (`t_l2_floor_rock_v1`–`_v3`) so one tile doesn't pave the floor
- [x] `art:coverage` counts decor and the code-drawn belt pieces
- [x] The art director's renderer list (review 3): awake conduit glass from the sheet lit above
      the darkness (#105); per-name decor weights (1 crate stack in 12 props on the Surface, tall
      props 1 in 8 on the Shallows) and no two 32 px props within 2 tiles (#113); a softer hard-rock
      dither on the Surface (#117); the Alien Strata's ore beds no longer read as pits (#118); the
      Heart, a working Heat line and the Washer beside the Separator checked in the running game.
      Left optional: the Crystal and Magma beds on the checkerboard only

**Exit:** `npm run art:coverage` reports nothing missing; art director signs off on consistency.

### Phase 4 — Acts II and III (Shallows, Fungal Caverns)
- [x] Darkness and light, excavation, hidden caverns, survey, bore sites
- [x] Coal power, steel, motors, drill bits; D2
- [x] Assay Lab and knowledge cards
- [x] Sapstone (wash vs separate), water rule, spores (field, filters, collectors, biofuel); D3
- [x] Contracts board, licenses, elevator upgrades
- [x] Milestones 7–17 (Acts II and III)

Review 1:
- [x] Act II in five milestones (Down the Shaft, Steel, Motors, The Bore Site, D2); Shallows start
      pocket ~22×14 with iron and coal; amber-sealed rock and a Mags line at the bore site (#40)
- [x] Running rigs (a coal Miner feeding a Combustion Generator) on every layer with coal in its
      start pocket; starter crates carry an Assay Lab's goods below the Shallows (and an Attuner's
      on the Alien Strata) and, on the Shallows, 4 Motors and 30 Copper Wire (#39)
- [x] Clean-ratio recipe times (PLAN §7.2) and the D2 and D3 sizes (#31, #32; review 2 shrank D2)
- [x] Sapstone: Insulation 1 Resin + 1 Mycelium, Separator 6 s, generators burn Resin (60 kW); two
      of three Sapstone deposits 3–5 tiles from glowcaps (#24)
- [x] Four assays; Glowcap, Resin and Charged Crystal unlock on first production, and the first
      Engine Glass shows its card (#41, #57)
- [x] Rush replaces Requisition: 3× the missing goods' value, refunds only depot goods (#35)
- [x] Company Chute: underground, 60% of value, instant (#37; review 2 lets contracts count there)
- [x] Contracts of about 5 minutes of one machine's output at 1.7–2.5×, a $200 re-roll; no Sorter
      price, a free Storage Crate, Express Belt $2,500; no Surface surveys (#36)
- [x] Item values: Heat Shield $80, Battery $60, Heartstone $400, Insulation $14, Molten $0 (#33)
- [x] Milestone table renumbered to 31 (PLAN §5.13)

### Phase 5 — Acts IV–VI and the ending
- [x] Crystal Depths: order-dependent crystal chain, interference, shield walls, resonance taps,
      overcharge adjacency rule, express belt; D4
- [x] Magma Shelf: heat, foundations, item heat on belts, insulated belt, three Emberite routes; D5
- [x] Alien Strata: conduits, Attuner, Engine Nodes, Sequencer, the Heart, the Governor
- [x] Ending sequence, free play, stats screen (the climb PLAN §2 describes was built in review 3,
      #103; before it the ending was text over a still view)
- [x] Milestones 18–31 (Acts IV–VI)

Review 1:
- [x] Crystal Depths without copper; Chorus Crystal from 3 single-miner vents; Crush charged gives
      2 Conductive Powder (8 s); Overcharger 8 s (#21, #27; review 2 made the vents poor)
- [x] Interference by footprint gap (2 tiles or less, Chebyshev); a Shield Wall anywhere in the
      spanning rectangle blocks it; interferers draw at least 8 kW; Stabilizers damp; taps count
      interferers from the last refresh; the ghost predicts speed and tap output (#28)
- [x] Heat grades: hot (2 tiles or less) and warm (3–4); ordinary ×0.5 / ×0.75, heat family ×2 /
      ×1.5; Foundations on deposit tiles; the Pressure Forge on hot ground only (#26)
- [x] Hot items: 10 heat a second on belts, 1 on insulated, Cooled below 50, containers cool at
      once; the Precision Assembler on steady ground (8 tiles from hot ground); Emberite from 3
      vents in the hot band; D5's hot delivery (#25)
- [x] Quench Slag (2 Slag → 1 Aggregate, 4 s); Thermal Extractor 4 s (#29)
- [x] The Engine: dormant conduits; the Waking Node (Battery and Resonant Core); 2 s per item; each
      Heartstone wakes its node's conduit a ring further out (5 rings, 3 tiles apart, ring 1 just
      past the nearest conduit outside the node, the last at least 15 tiles out); the conduit pool
      (60 kW per awake node); the Attuner on 2+ tiles of awake conduit, drawing 30 kW; Wake the
      Engine, 5 Heartstones (#30, with review 2's #71 and #73)
- [x] D4, D5 and Governor sizes; Act V and VI rewards flattened (about $6,000 before Act V's
      breakthrough, $8,000 in Act VI) (#32, #36)
- [x] No Chorus vent on the Magma Shelf; the hidden basic deposits below the Shallows kept on
      purpose (#55)
- [x] The Sequencer unlocks with the Thrumstone assay, in time to feed the Waking Node (#57)
- [x] Every conduit wakes at the ending (#58)

**Exit:** the pacing bot plays the whole path; every act inside its PLAN §8 time band.

### Phase 6 — Critic loops and polish
- [x] indie-critic full review on a playable build → fix everything accepted, log in DECISIONS
      (review 2 and review 3, below)
- [x] A scenario playtest of every act by the indie critic (review 2 played the build end to end,
      headless, through every layer's scenario; #45)
- [x] Both reference lines for each project, computed from the recipe data in
      `tests/pacing.test.ts`: the first chain in 25–35 minutes from D3 on, a 10-minute line of 24–45
      machines, more machine-minutes every act; D1 and D2 are the tutorials (#32, #52, critic-2 C6)
- [x] The pacing bot plays every act on the real map (`tests/act1.test.ts`–`act6.test.ts`, scripts
      in `tests/play/`), with no deadlock or rush in any competent run; Act V has one 3-minute stall
      while its 73-tile trunk waits for plates and carries its first goods. Acts III–VI start from
      start states with stand-in supply for the acts before (report and owner calls in
      `docs/reviews/act-bots/`)
- [x] The act bots' findings fixed (#90–#99): a cavern a tunnel touches at a corner opens when a dig
      meets it straight on (G1); the Drill and the Heart stack extras in the depot and say Jammed
      when they can't (G2); depot Unloaders leave what planned ghosts hold, and Mags names Unloaders
      that take arrivals (G3); Mags says to make a good down here when no layer above has any (G4);
      a filter change gives back the held item (G5); beacons on the Heart and the sleeping nodes,
      and Mags's bearings (G6); The Governor lands as a milestone (G7); Insulation requested on the
      Crystal Depths and 60 plates on the Alien Strata (G8); three hints (G9); light over awake
      conduit (L1)
- [x] The act bots' own harness fixes (`docs/reviews/act-bots/decisions.md`): the game's events read
      by identity (it keeps the last 400), Crossings laid first in `Bot.lay` with the lane waiting
      until they are paid, `canUse` at the Drill and the Heart from the game's own refusal, side
      ports kept clear in the router only where something comes out of them, and Act II's drill-bit
      line turned into the Shallows depot after D2, so Act III can chain from Act II's real end.
      No WORKAROUND blocks are left; `tests/core.test.ts` tests the first four
- [ ] A bot run chained through the whole game, as a test. Act III chained from Act II's real end
      finishes at 23:03, as from its start state, but Act IV chained on from there stalls at Feed
      the Drill 163/360: the Surface's motor line and the Shallows' drill-bit line keep turning the
      wire and beams the Crystal Depths needs into spare goods. The act scripts must switch spent
      lines off (`PROGRESS.md`, session 1 part 4)
- [ ] Every act inside its PLAN §8 band with people playing. The bots finish every act 6–42% under
      its floor (I 14:07 against 15–25, II 12:15 against 20–30, III 23:03, IV 30:50 and V 25:02
      against 40–60, VI 23:17 against 30–45); the bands stay until human playtests (#100), which
      also decide whether money should run short (Act I's halved cash, #109, now holds the
      efficient bot's 160 kW line back to 12:05; Act II and later never run short for the bots) and
      watch for the ghost-hold stall #92 describes
- [ ] A depot Unloader feeding a Drill or the Heart loops a good through the depot once that need is
      met: each extra goes straight back into the depot it came from (1,371 Engine Glass round trips
      in the Act VI bot; #91 records it as a known behaviour). The need's tooltip in the inspector
      tells the player to switch that Unloader off. Open: whether the game should stop the loop
      itself, and the act scripts switching their spent Unloaders off
- [x] art-director review in game → fix (review 3, below)
- [x] qa-screens sweep → fix (review 3, below)
- [x] Repeat until the critic's verdict is "ship with fixes" or better (review 2: "Not yet"; review
      3: "Ship with fixes")
- [ ] A verify pass on review 3's fixes (each earlier round's verify found problems in its own
      fixes), and the `npm run shots` sweep at 1280×720 and 1920×1080 on the combined build
- [x] Audio: the hum of Old Thrum per layer (and at the ending), a machine bed per family near the
      camera, procedural effects at balanced levels
- [x] Juice: a placement burst and sound, `+$N` sale floats, screen shake at breakthroughs and the
      ending (a setting), the jammed `≠` badge, light running along conduit rings as they wake
- [x] Settings, export/import
- [x] Three save slots (title screen; import goes to an empty slot; scenarios never save, #53)

Review 2 (critic-2 C1–C13, code-2; `docs/reviews/review-2/`):
- [x] Requests for any good the save has made except hot or unstable ones, served in turn (the shaft
      saves the last one served), up to half a cab rounded down (3 / 4 / 7); a starvation message
      that names the real cause (C1, C2, code-2 half-cab-ceil)
- [x] The cab shown: each station's last minute of traffic each way, the Stack's live rate, request
      rows as stock / target with "none spare above", Shift-click 50, the wheel 10, "Request the
      missing goods" on an underground ghost (C3)
- [x] Chorus vents poor (15 a minute each, 45 in all) and Charge Grit 2 s: the rich route opens, the
      cheap one saves machines later (C4)
- [x] The first minute: the starter line pre-filled (first sale at 1 s), a depot strip in the top
      bar, a camera that shows the Drill and the Terminal, "Click the Drill" (C5)
- [x] D2 is 100 Steel Beam, 30 Motor, 50 Drill Bit, a second tutorial (first chain 20.7 min) (C6)
- [x] Elevator upgrades take goods from the lower depot first, then the upper (C7)
- [x] The Engine wakes ring by ring: 5 rings, 3 tiles apart, ring 1 just past the nearest conduit
      outside the node; any wrong item comes out of the side, cooled; no ring event when nothing lights
      (C8, code-2 F4)
- [x] Lower stations can't turn and are reset on load (`SAVE_VERSION` 3); the top station warns when
      up-cargo can't come out (C9, code-2 lower-station-rotate)
- [x] The conduit pool is 60 kW per awake node; an Attuner draws 30 kW (C10)
- [x] Per-layer default requests and the HQ's "Keep for the Surface" floor (C11)
- [x] Contracts can be delivered at a Company Chute, at 60% of their share (C12)
- [x] Text: lock text from the milestones, the Express Belt line, "Planned: waiting for goods", step
      labels that fit the HUD (tested), income without milestone rewards, the build tooltip beside the
      ghost (C13)
- [x] The 30 confirmed code-review defects: drags that lay crossings first and report refusals,
      planned crossings, foundations, paid swaps, pausing, surveys, refunds of crafts and hot items,
      fair merges at real ports, planned Shield Walls, the Chute's faces, arrivals that froze a shaft,
      saves that fail to load or save, panels the mouse fell through, inspector heights, knowledge
      cards, ETA history, the power meter, rule texts (code-2)
- [x] The verify pass's leftovers: a placed foundation no longer reported as refused, requested
      goods held back when the lower depot is full, held top-bay cargo named at the top station,
      the Thrumstone assay unlocking the Attuner and the Sequencer (Engine Glass unlocks nothing)
      (#87)
- [x] The fix pass's UI: windows keep clear of the HUD and a panel still under one steps aside, UI
      timers on real seconds, toasts over windows and fading, no HUD over the ending's text, the
      title footer strip, a short foundation drag's whole shortfall (#88); then its verify's fixes:
      the Sequencer's next side, held requests told apart from none spare, the Engine Glass card,
      three screenshots (#89)

Review 3 (critic K1–K13, art A1–A15, QA Q1–Q11; `docs/reviews/review-3/`):
- [x] A belt into a station's front shows the station Jammed, and Mags says where the drill lines
      go: a side of the top station, R, or the HQ (K1; the front's corners stay part of the exit)
- [x] Direction reads once built: port brackets on the hovered and selected building, a 2 px chute
      arrow, the conveyor's bowed `>` rungs, head-on belts marked ≠ (K2)
- [x] Five build tabs (Strange on key 5), deeper layers' buttons hidden, one row, a bar that doesn't
      move (K4)
- [x] Veins of awake conduit through the rock, lit glass from the sheet, dormant Engine Nodes (K5,
      A9, A10)
- [x] The drill ETA is the slowest good's, with "No supply"; the short layer label and the depot
      strip's drop order (K6, K10)
- [x] A drag starting on a line's straight run crosses it (K7)
- [x] Hints for M3 and M5, starve counts, jam texts, the breakthrough's message order, "the"
      mid-sentence (K8, K9, K13, Q10)
- [x] Act I's milestone cash halved, the act bots re-run; PLAN's length about 3–5 hours (K11, K12)
- [x] The crew's rig starts with 4 coal (Q2)
- [x] The auto UI scale keeps 640 UI px of width, and a chosen scale is capped (Q3, Q5)
- [x] Paged windows fit above the build bar, the HUD under a window takes no mouse, Company rows,
      no world hover under the menu, one-shot feedback that waits, the radio button, the title under
      a window (Q1, Q4, Q6–Q9)
- [x] Decor weights and no tall props side by side, wood crates, decor outlines (A1, A13); the
      title fits the window (A2); floor variants (A3); anchors and the elevator pit (A4); terrain
      colours (A5, A8, A11, A15); deposits (A7, A14); the Heart re-rolled (A12)
- [x] Screenshots: `alien_governor` framed at any size, the new `surface_jams` (Q11)
- [x] The ending as a sequence on real seconds: the camera to the waking Heart, up through every
      layer with light spreading from each shaft and its card, the Surface at dawn, the text, the
      card; no HUD, Esc or a click skips, the chord left alone; the `ending` shot held on the Heart
      and `ending_climb`, nine held frames (K3, A6)
- [x] The verify pass on review 3 (27 shots at three window sizes, no console errors): its leftovers
      fixed (the chutes, the variant share, the crew-rig wording, the title mock, #108 citing #98)
      and two scenario fixes (M3's Sorter license in `surface`, awake nodes in `alien_awake`)
- [ ] The verify's visual leftovers: the ending's rise band reads as a starfield on the deep layers
      (V3) and its dawn weakly, a small sun and no horizon (V4); the breakthrough card covers the
      arrival it announces (V5); a jammed station's ≠ badge floats above the art (V6); the title's
      stretched side columns smear at 1366×768 (V7); the Field Manual's Esc row could say it skips
      the ending

### Phase 7 — Release prep
- [x] `npm run build` clean, bundle size checked (390 kB of JavaScript, 136 kB gzipped; 770 kB in
      all with the art), and `npm run release` zips `dist/` for itch.io into `release/`
- [x] PATCHNOTES.md and the in-game "What's new" window (title screen and menu), read from it
- [x] A public repository and GitHub Pages: `.github/workflows/pages.yml` runs the tests and the
      build on every push to `main` and deploys it to https://ycgnem.github.io/the-mountain-is-a-machine/
- [ ] Desktop wrapper (Electron) if wanted

## Beyond 1.0 (planned, not scheduled)

- **Mastery:** per-family mastery from use (bulk / precision / compact miner; batch charger; long-haul
  insulated belt). Different tools, not upgrades that obsolete the old ones.
- **Challenge sites:** small fixed maps with one rule each (limited power, cramped, one-ore economy,
  no rushes). Medals for time and footprint.
- **New operations:** start another mountain with a different loadout; the first factory stays.
- **Blueprints:** copy/paste areas, save and share layouts as strings.
- **More overlays:** conduit pool load, power demand per machine (1.0 has Spores, Arcs and Heat;
  belt direction shows in a conveyor's bowed rungs and the head-on ≠, so it needs no overlay).
- **Elevator lanes:** dedicated input/output lanes, priority shipments, liquid freight.
- **Maintenance and depleting deposits** as optional challenge rules.
- **Fluids** (pipes) if the item-only model starts limiting recipes.
