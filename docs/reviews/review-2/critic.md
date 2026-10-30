# Review 2: indie critic

The indie critic (`.claude/agents/indie-critic.md`) played the build headless after plan review 1 was
built. Each finding was then checked against the code by a skeptic. The owner decisions are in
`decisions.md`; DECISIONS.md cites findings as "critic-2 C<n>".

**Verdict:** Not yet. The game plays end to end and Emberite now earns its place, but the new elevator and request system is arbitrary and hard to read: only building goods can be requested, which makes the Act VI hint impossible; one big request silently starved a 10-plate ghost for 7.7 minutes; and nothing shows how full the cab is. Chorus Crystal and Thrumstone still have one dominant answer, and D2 breaks the Act II time band. Every fix below is a small data or UI change.

## C1 (blocker, logistics)

**Problem.** Depots can only request goods that some building costs. Nothing in the game says so, and the game's own text contradicts it. You can request Circuits but not Resonant Cores, Ember Cores, Reinforced Plate, Drill Bits, coal, biofuel, resin or copper ingots.

**Evidence.** [code] inspector.ts:24-28 and :43: requestable() only offers BUILD_GOODS, the set of every building's cost keys. [played] Alien scenario, milestone 28 'Wake the Engine': the hint (progression.ts:142) says 'Ask the depot to keep them in stock'. The Alien depot holds 40 Resonant Cores, and its Add row offers Steel Beam, Aggregate, Motor, Circuit, Battery and Heat Shield, but no Resonant Core (screenshot a02). [math] Eight drill-project goods can't be requested: reinforced_plate, drill_bit, cobalt_drill_head, resonant_core, ember_core, hot_ember_ingot, heartstone, engine_glass. Nor can any fuel (coal, biofuel, resin), though PLAN §4 and §5.6 describe the cab decision as 'construction stock, fuel or product'. Copper ingots can't be requested either, though DECISIONS #21 relies on 'shipping ingots instead of wire halves the load'. Reinforced Plate, a Mk2 upgrade good, can't be requested. So in a real Act VI, the 2 Resonant Cores that wake the Engine have to be unloaded from the Magma depot and belted about 68 tiles, from (56,12) to the Magma top station at (16,40).

**Proposed fix.** In inspector.ts, replace BUILD_GOODS with every item that is neither unstable nor hot (that excludes overcharged_crystal and hot_ember_ingot) and that the save has seen in stats.produced, any depot's stock or stats.delivered. Sort the Add row by the item's layer, newest first, and cap it at 2 rows of 7 with a 'more' toggle. Rewrite the PLAN §5.6 and §5.15 lines as 'a depot can request any item you have made'. Milestone 28's hint becomes true, and ingots versus wire becomes a visible request choice.

**Check: real.** inspector.ts:23-28 requestable() only filters BUILD_GOODS (line 43), which is every building's cost keys. That is 14 goods: plate, gear, wire, brick, beam, motor, powder, insulation, filter, cobalt ingot, circuit, battery, heat shield, aggregate. Nothing else adds requests except DEFAULT_REQUESTS (progress.ts:240). Running the critic's math.ts on the current code lists the 8 project goods it names as not requestable, and coal, biofuel, resin and copper_ingot can't be requested either. progression.ts:142 tells the player to 'Ask the depot to keep them in stock' for Batteries and Resonant Cores, but only Battery is requestable. Alien scenario at load: the Alien depot holds 40 Resonant Cores and its Add row is Steel Beam, Insulation, Motor, Circuit, Battery, Heat Shield. That is Insulation rather than the claimed Aggregate, but there is no Resonant Core either way. Shafts are Crystal->Magma at (56,12) and Magma->Alien at (16,40), 68 tiles apart (Manhattan). DECISIONS #21's 660-item figure assumes shipping copper ingots, which requests can't carry. Overstated parts: PLAN §5.6 (line 262) deliberately limits requests to construction stock ('Construction stock moves itself; belts into a top station are for production cargo'), and §5.5 says cross-layer logistics is 'a chain, on purpose'. §4's 'construction stock, fuel or product' describes how requests and belts share the cab, not what can be requested. 'Blocker' is too strong: an Unloader plus a belt route works. The hard contradiction is the milestone 28 hint.

**Notes on the fix.** Letting a depot request any seen item reverses PLAN §5.5/§5.6's deliberate split (requests carry construction stock, belts carry product). Cores and every product would then relay down automatically and the deliberate belt hops would disappear. That needs DECISIONS-level amendments (#22, #6/#7), not just a rewrite of the §5.6/§5.15 lines. A narrower fix for the actual contradiction: reword the M28 hint, or add only resonant_core, battery and reinforced_plate (the Mk2 upgrade good) to the requestable set. If the broad version goes ahead, depotHeight() (inspector.ts:37-38) sizes the Add rows as ceil(more/7)*19 and must match the 2-row cap and 'more' toggle. Excluding hot_ember_ingot and overcharged_crystal is right. 'Any depot's stock' is a different test from the current own-plus-above check.

## C2 (major, logistics)

**Problem.** The cab always serves the biggest shortfall first. One large request starves every other request on that shaft, and on the shafts relaying it, for minutes. The new starvation warning then gives the wrong advice and doubles 'The'.

**Evidence.** [code] elevator.ts:54-67: pickRequested takes the item with the largest min(need, spare above). [headless] Crystal scenario, scratchpad cab.ts: the Crystal depot requests 300 Copper Wire and the default 40 Iron Plate; the Shallows holds 900 of each; a planned Assembler needs 10 plates. Wire arrived at 42-48 a minute. Not one plate reached the Crystal Depths in the first 7 minutes, and none reached the Fungal depot in the first 5, because the relay hop starves too. The Assembler ghost built after 464.5 s. checkStarved (game.ts:843-866) fired 3 times with 'The The Crystal Depths depot is out of Iron Plate and none is coming in... Raise its request so the elevator brings it'. The request already existed. Line 859 builds `The ${LAYERS[li].name}`, and every layer name already starts with 'The'.

**Proposed fix.** Serve requests round-robin. Add sh.reqRR; each loadRequested call takes the next row, in the lower depot's list order plus relayed rows, that has need > 0 and spare goods above, so 300 wire and 40 plates alternate. In checkStarved, when the item is already requested and none arrived in the last minute while the cab ran full, say 'The elevator is full of other requests (N Copper Wire queued): lower that request, upgrade the shaft, or Rush the plan.' Change line 859 to `${LAYERS[li].name} depot`.

**Check: real.** elevator.ts:54-67 pickRequested returns the item with the largest min(need, upper spare), and loadRequested calls it once per item. I ran the critic's scratchpad cab.ts against the current code. Crystal wire arrived at 22, 42, 48, 42, 48, 30 and 24 a minute. Crystal plates were 0 for minutes 1-7 and the first 15 came in minute 8; Fungal depot plates were 0 for minutes 1-5. The Assembler ghost built at 464.5 s. Mags sent 3 messages reading 'The The Crystal Depths depot is out of Iron Plate... Raise its request so the elevator brings it...'. game.ts:859 builds `The ${LAYERS[li].name} depot`, and all six layer names start with 'The'. One nuance: under the current biggest-shortfall rule, raising the plate request above the roughly 300-wire shortfall would make plates win on both hops. So the advice is misleading, because it hides the real cause, rather than strictly wrong.

**Notes on the fix.** Round-robin needs reqRR on the Shaft type, serialized in save.ts with a default for old saves. Otherwise saves with several requests no longer resume identically. The row order must be deterministic: requestNeed merges own and relayed keys through a Set, and that order shifts when a row is deleted and re-added. The new checkStarved branch needs per-shaft 'cab ran full' tracking. Keep 'out of <Item>' in the HQ wording (li===0): sim.test.ts:232-240 and act1.test.ts:313 assert 'out of Gear'. The existing request tests (sim.test.ts:329-356) use a single item, so round-robin leaves them valid. The line 859 fix is correct. With round-robin, 'raise its request' stops working as a workaround, so the message change has to ship with it.

## C3 (major, ui-text)

**Problem.** You can't see whether the cab is the bottleneck, so the decision it is meant to create reads as 'things are slow'. The cab only binds in Act IV anyway; in the other acts requests are a free convenience.

**Evidence.** [played] The elevator inspector (screenshots s03 and s04) shows a fixed '45 items/min each way', 'Waiting to go', and 'Arrived, waiting to leave', which actually means waiting to come out. Its 3-line paragraph draws over 'Requests below: 36 items to haul' because inspector.ts:491-492 uses a fixed cy += 22. 'Requests below' also shows on the lower station, where it means this depot's own requests. With 60 Motors requested and none in the HQ, the panel said '36 items to haul' and the cab never moved, with no hint that the depot above was empty. The Stack badge (hud.ts:276-278) is a fixed '45/m'. Requesting 300 wire takes 28 clicks of '+10' (inspector.ts:428). [math] Imports through the arrival shaft over each project's first chain: D4 is 1,060 items in 26.7 min, about 40 a minute, which binds at Mk1. By estimate, Acts II-III import under 20 a minute, and D5 and the Governor about 15-20 a minute. After one $2,000 Mk2 upgrade (Act IV pays $8,700 in rewards) the cab never binds again.

**Proposed fix.** Replace the fixed rate with a live 60 s count: 'Down 44/45 a min (requests 30, belts 14) / Up 3/45', amber at 90% or more; show the same live down-rate on the Stack badge. Size the paragraph with ui.paraHeight. Show 'Requested below' only on the top station. Rename the other line 'Arrived, waiting to come out: N'. Give each request row 'stock/target' plus '+N/min', or in coral 'none spare in the <layer> depot'. Shift-click changes a row by 50, and the mouse wheel by 10. Add a 'Request the missing goods' button to underground planned ghosts that adds or raises those request rows. Add a test to pacing.test.ts that prints each project's imports per first-chain minute through its arrival shaft, so making Act IV the elevator act is a deliberate choice.

**Check: real.** Confirmed in code: inspector.ts:479 prints the fixed elevatorRate(tier), and the Stack badge at hud.ts:276-278 is a fixed '45/m'. At inspector.ts:491-492 the paragraph wraps to 3 lines (30 px, measured with wrapText at 162 px) but cy += 22, so 'front, mixed.' draws over 'Requests below' (screenshot s04 confirms). Line 493 uses requestNeed(sh.layers[1]) on both stations, so on the lower station it shows that depot's own need. The total ignores whether the depot above has anything spare; pickRequested then returns null and the cab stays put. Add sets 20 and '+' adds 10 (lines 441 and 428), so reaching 300 takes 28 clicks. Act IV rewards total $8,700. D4's first chain is 26.7 min (the circuit Assembler), with imports of 800 wire, 200 cobalt and 60 insulation = 1,060, about 40 a minute. Caveats: the Crystal Depths has a hidden sapstone deposit at (40,18), so cobalt can be made locally (860, about 32 a minute). My count for D5 is about 6-12 a minute (160 circuits or 320 powder over 26.7 min) and for the Governor about 7 (220 items over 32 min), plus construction stock, so '15-20' is high but the conclusion holds. 'After Mk2 the cab never binds again' is wrong: a 10-minute D4 line shipping wire needs about 106 a minute against Mk2's 90, and Mk2 also needs 20 Reinforced Plate, which can't be requested (C1).

**Notes on the fix.** contentHeight() returns a fixed 165 for elevators (inspector.ts:216). The live lines and a paragraph sized with paraHeight need that height recomputed, or the panel clips. A live 60 s count split into requests and belts needs new deterministic per-shaft counters in the sim (types.ts Shaft, save.ts). 'stock/target' plus '+N/min' plus the -, +, x buttons won't fit on a 162 px row next to long names like 'Heat-Resistant Aggregate'. A second line per row changes depotHeight(). A pacing test that only prints asserts nothing. 'Imports through the arrival shaft' also needs a per-layer table of what each layer can make locally, which pacing.test.ts doesn't model (cobalt, for example, can be local in the Crystal Depths). The wheel adjustment is feasible because app.ts:537 skips zoom when k.uiCapture is set.

## C4 (major, layer 3)

**Problem.** Chorus Crystal still has one dominant answer. Per unit of powder, the rich route needs the same number of machines and sensitive machines as the cheap one, uses less power and half the crystal. The vent cap never binds, so crystal is never scarce enough for the saving to matter.

**Evidence.** [math] scratchpad math.ts, recipes.ts:66-72. Per 60 powder a minute, the rich route (cut, charge, crush charged) takes 2 Cutters, 2 Chargers and 4 Crushers: 8 machines, 4 of them sensitive, 128 kW, 30 crystal a minute. The cheap route (crush, then charge grit) takes 4 Crushers and 4 Chargers: 8 machines, 4 sensitive, 168 kW, 60 crystal a minute. DECISIONS #27's 'two sensitive machines in the line instead of one' holds per line, not per unit of powder. D4 needs 360 crystal on the rich route (pace.ts), 13.5 a minute over the 26.7-minute first chain, so the one start-pocket vent (30 a minute) covers it and the two hidden vents never matter. D5 needs 160 and the Governor 280, both under 10 a minute. For comparison, Emberite works: D5's first chain is limited by the Emberite miner (800 Emberite, 26.7 min), with three routes competing for the capped vents. Sapstone passes weakly: its split is a ratio that the knowledge card and Mags spell out.

**Proposed fix.** Change charge_grit from 4 s to 2 s (recipes.ts:71). The cheap route then needs 4 Crushers and 2 Chargers per 60 powder a minute: 6 machines, 2 sensitive, 108 kW, but 60 crystal a minute. Make the three Crystal Depths vents poor (layers.ts:165, 167, 169: purity 1 to 0), so each gives 15 a minute, 45 in all. A 10-minute D4 then needs 56 crystal a minute on the cheap route, which the vents can't supply, and 36 a minute on the rich route, which takes all three vents: start cheap, then dig for vents and switch to the rich route to scale. In pacing.test.ts, use a miner rate of 15 for chorus_crystal; D4's first chain stays at 26.7 min and its 10-minute line becomes 38 machines. Amend DECISIONS #27 and PLAN §6 (Crystal Depths).

**Check: real.** recipes.ts:67-71 gives cut 4 s, crush 4 s (2 grit), crush_charged 8 s (2 powder), charge_cut 4 s and charge_grit 4 s (2 grit to 1 powder). Power is 10 kW for the Cutter, 12 for the Crusher and 30 for the Charger. Per 60 powder a minute, the rich route takes 2 Cutters, 2 Chargers and 4 Crushers: 8 machines, 4 sensitive, 128 kW, 30 crystal a minute. The cheap route takes 4 Crushers and 4 Chargers: 8 machines, 4 sensitive, 168 kW, 60 crystal a minute. At scale the rich route is never worse; the cheap route only wins as a minimum line (2 machines against 3). The vents (layers.ts:165/167/169) are normal purity, single-miner, 30 a minute each and 90 in all. Recomputed: D4 needs 360 crystal over 26.7 min (13.5 a minute), D5 160 (6 a minute) and the Governor 280 (8.75 a minute). A 10-minute D4 needs only 36 (rich) or 56 (cheap), so the cap never binds. The Emberite comparison checks out: D5's first chain is limited by the Emberite miner (800, 26.7 min).

**Notes on the fix.** The arithmetic checks out. With charge_grit at 2 s the cheap route is 4 Crushers and 2 Chargers, 2 sensitive, 108 kW. Poor vents give 15 a minute each, 45 in all. With the pacing miner rate at 15, D4's first chain stays 26.7 min and its 10-minute line becomes 38. The change also raises D5 to 42 and the Governor to 44 machines; both stay inside 24-45, and machine-minutes still rise (287.7 < 293.3 < 305.3). But the 'start cheap, then switch to rich' arc is backwards. With only the start-pocket vent at 15 a minute, D4's first chain needs about 21 crystal a minute on the cheap route (400 powder plus 160 charged crystals for batteries and cores) against 13.5 on the rich route. So rich becomes the forced opener, and cheap becomes the machine-saving choice later, when crystal is slack (D5, Governor). Also update PLAN §7.2 line 780 ('Charge grit ... 4 s') and §6 line 643 ('30/min, 90/min in all'), not only DECISIONS #27.

## C5 (major, onboarding)

**Problem.** The first minute doesn't show the lesson DECISIONS #38 was built around. The starter line starts empty; the first sale comes at about 20 s and is worth $3; the HQ's stock never appears on screen; the Drill sits under the top bar; Mags's box covers the Miner; and the first step's label is cut off.

**Evidence.** [played] first5.ts at 1280×720: nothing sold at 0.3 s or 5 s; at 20.5 s money was $403 (one Iron Ingot sold). The HQ showed 100 plates at 20.5 s and 101 at 24.6 s, but only if you click the HQ: the top bar (hud.ts topBar) has no depot readout and no float plays when goods enter a depot. The camera starts at (26,23) (app.ts:231), so only about 40 px of the Drill (rows 9-13) shows below the top bar (screenshot f01_new.png). Mags's opening box covers the Miner at (16,24) until it auto-dismisses at about 18 s. The first objective reads 'Click the Drill to see what it n.' (hud.ts:168 fitText on progression.ts:73).

**Proposed fix.** Prewarm the starter line: in Game.create after setupSurface, tick 30 s, then zero stats.sold, stats.produced and the events. Every belt is then full and 'Watch the line make a sale' completes at about 2 s. Add a depot strip to the top bar for the current layer: up to 6 icons with counts (for the HQ: plate, gear, wire, brick), each flashing '+1' on delivery. Start the camera at (22,18) tiles (app.ts:231): at 1280×720 and zoom 2 the whole Drill shows below the bar and the Miner stays clear of the radio box. Shorten the step label to 'Click the Drill'.

**Check: real.** setupSurface (game.ts:178-200) places the line with no items on it. Simulating the shipped seed: no sale at 0.3 s or 5 s. The first sale (1 Iron Ingot, $3) comes at 16.0 s rather than about 20 s, and money is $403 at 20.5 s. The HQ holds 100 plates at 20.5 s and 101 at 24.6 s. topBar (hud.ts:72-108) shows only money, layer and power, and handleEvents (app.ts:408+) has no event for goods entering a depot. The camera starts at (26,23) tiles (app.ts:231). At 1280x720 with zoom 2 and UI scale 2, camY is 188, so the Drill (rows 9-13) shows only 42 px below the 30 px top bar (f01_new.png matches). The radio box (hud.ts:438-461) is 210x100 UI at x 4, y about 201-301, which covers the Miner at UI x 160-192, y 196-228. It auto-dismisses after 14 + 7x2 = 28 s at 60 fps; the critic's 18 s depends on frame rate. fitText cuts the 174 px label to 'Click the Drill to see what it n.' in 153 px.

**Notes on the fix.** Prewarm: the belts won't be 'full'. After 30 s only 3 of 15 belt and splitter tiles hold an item, because the line runs 15-30 items a minute on 90-a-minute belts. The next sale does come 2.1 s after a 30 s prewarm. 'Zero the events' must include stats.events.first_sale, or the step counts as done at 0 s; also decide what to do with money ($406), stats.earned, income and s.time. The prewarm runs inside every Game.create (tests, maps.test.ts, scenarios), adding 1,800 ticks each and shifting the act1 bot's timings. Camera (22,18): the Drill shows whole and the Miner clears the radio box (UI x 224 against the box edge at 214). But the Shipping Terminal (UI x 480-528, y 276-324), where the first step's sale happens, is partly hidden under the build bar (UI x about 125-515 from y 305), and the starter line's bottom edge touches the bar. From the top of the Drill (row 9) to the bottom of the Terminal (row 26) is 288 UI px against 290 available, so only a camera y of about 19.25 tiles shows both. The depot strip has about 240 UI px free in the top bar at 1280x720, and less underground, where the Spores/Arcs/Heat toggles and longer layer names take room.

## C6 (major, pacing)

**Problem.** D2's size breaks PLAN §8's own Act II band. An unscaled Act II runs over 40 minutes, so Sapstone, the first strange material, arrives about an hour in, which is the problem DECISIONS #40 was written to fix.

**Evidence.** [math] pacing.test.ts formula, scratchpad pace.ts. D2 (160 Steel Beam, 60 Motor, 80 Drill Bit) needs 520 Iron Ingots; one 4 s Smelter makes that a 34.7-minute first chain (D2's 10-minute line is 26 machines). PLAN §8 gives Act II 20-30 minutes. Down the Shaft, Steel, Motors and the dig to a bore site about 39 tiles away come on top. With Act I at 15-25 minutes, Act III begins 55-70 minutes in. pacing.test.ts requires 25-35 minutes for D2, so the test itself enforces the conflict.

**Proposed fix.** Treat D2 as the second tutorial, exempt like D1, and set it to { steel_beam: 100, motor: 30, drill_bit: 50 } at progression.ts:16. That gives a 20.7-minute first chain, a 19-machine 10-minute line and 113 machine-minutes, still below D3's 226, so machine-minutes keep rising. In pacing.test.ts, run the 25-35 minute check on d3 through the Governor only and add 'D2 first chain at most 22 min'. Update PLAN §5.7 and §8.

**Check: real.** The numbers hold, but only for the unscaled reference line. I recomputed the pacing.test.ts formula myself in <session scratchpad>\verify_c6c10\pace.ts. D2 (progression.ts:16) needs 520 Iron Ingots: 160 for beams, 120 for gears, 80 for the drill bits' beams and 160 for the Reinforced Plates' iron plates. On one 4 s Smelter that is a 34.67 min first chain, with a 26-machine 10-minute line and 192 machine-minutes, the same as DECISIONS #52. PLAN §8 sets Act II at 20-30 min, and pacing.test.ts:94-101 requires D2's first chain to be 25-35 min. So a strict one-machine-per-recipe Act II spends at least 25 min on D2 alone. On top come Down the Shaft, Steel (30 ingots), Motors (20 gears' worth of ingots) and the dig to the bore site, which is 38.9 tiles from the arrival ((32,11) to (58,40), layers.ts:96-97). That is about 40+ min, and Sapstone then arrives 55-70 min in. D2 is the only project whose first chain is longer than its whole act band (D3 26.0, D4 26.7, D5 26.7 against 40-60; the Governor 32 against 30-45). Caveats: the design expects players to scale (pillar 2, core loop step 5, milestone 11's 'A lot of them. Make it hum.'). The Shallows' start-pocket iron is rich (60/min), so one extra Smelter halves the bottleneck to 17.3 min (the next bottleneck is 16 min) and puts Act II at about 25-30 min. DECISIONS #40's 'first strange thing ~30 min in' is the amber rock at the bore site (milestone 10), which comes before D2, so D2's size doesn't affect it. Treat this as a real tension in PLAN §8 that the owner should decide, not a hard contradiction.

**Notes on the fix.** The proposed numbers are correct. {steel_beam 100, motor 30, drill_bit 50} gives a 20.67 min first chain (iron ingot and iron miner tie), a 19-machine 10-minute line and 113 machine-minutes, against D3's 225.7.
- Because 19 is below the 24-machine floor, D2 has to leave the whole it.each in pacing.test.ts, not just the minute check.
- Keep d2 in the 'more work than the one before' list if `later` is split; 113 < 225.7 still passes.
- Also update the progression.ts:12-13 comment ('D1 is the tutorial'), the pacing.test.ts header comment, PLAN §5.7's table and §8 ('From D2 on', 'D1 ... exempt'), and DECISIONS #32 and #52, which quote D2 at 34.7 min and 26 machines. Log the change as a new DECISIONS entry.
- PLAN.md and DECISIONS.md were being edited during this check, so re-find line numbers before editing.
- Alternative: keep D2 and state that Act II's band assumes about two Smelters on the rich iron, for example with an Act II bot or a test that a 2x-bottleneck line fits in 30 min.

## C7 (major, logistics)

**Problem.** Elevator upgrades are paid from the upper depot, which often lacks the goods: the upper layer can't make them, so upgrading means shipping goods up by hand, and the button doesn't say so.

**Evidence.** [code] elevator.ts:166-178 pays from layer sh.layers[0], the upper end. The Surface-Shallows Mk2 needs 30 Steel Beam in the HQ, but the Surface has no coal (layers.ts, Surface deposits), so steel must be shipped up. Every Mk2 below the Shallows needs 20 Reinforced Plate, which can't be requested (C1), on layers with no stone. The Fungal-Crystal Mk3 needs 10 Battery and 30 Circuit in the Fungal depot. Both are made a layer below and arrive at the Fungal top station (12,14), about 72 belt tiles from the Fungal depot at (58,40). [played] The button reads only 'Upgrade to Mk2: $2,000' (screenshot s03); the goods are in its tooltip, and a failure just says 'Not enough goods or money'.

**Proposed fix.** Pay from the lower station's depot first, where requests already deliver, and fall back to the upper depot. The Surface-Shallows Mk2 then uses the Shallows' own beams, motors and Reinforced Plate, and the Fungal-Crystal Mk3 uses circuits and batteries made on the Crystal Depths. List the goods under the button with live counts from the depot that will pay: '20 Motor (12) · 30 Steel Beam (30) · 20 Reinforced Plate (0)'. Update PLAN §5.5 and the glossary.

**Check: real.** upgradeElevator (elevator.ts:165-179) checks and spends goods from g.layer(sh.layers[0]), the upper depot. This is the documented rule: PLAN §5.5 (~line 244), §5.8 (~324), the glossary (~532) and DECISIONS #21. Costs (elevator.ts:14-18): Mk2 is 20 Motor, 30 Steel Beam, 20 Reinforced Plate and $2,000; Mk3 is 10 Battery, 30 Circuit, 40 Steel Beam and $8,000.
- The Surface has no coal (layers.ts:66-72) and the HQ never holds steel. Requests only flow down (requestNeed and pickRequested, elevator.ts:35-67), so the Surface-Shallows Mk2's 30 beams have to be belted up.
- Reinforced Plate is not in any building cost, so it is missing from BUILD_GOODS (inspector.ts:43) and can't be requested. The Fungal Caverns, Crystal Depths and Magma Shelf have no stone.
- Batteries and Circuits need Chorus Crystal, which only the Crystal Depths has. They arrive at the Fungal top station at (12,14); the Fungal depot sits at (60-62, 39-41), next to the arrival at (58,40). That is a belt of about 70-75 tiles.
- inspector.ts:503-504: the button label is only 'Upgrade to MkN: $money'. The goods are listed only in the tooltip ('Needs ... from the The Dig Site depot'). A failure shows the toast 'Not enough goods or money for the upgrade', and the button is never disabled.
- Nuance: on layers without stone, Reinforced Plate can still be assembled from Brick, which is on every default request list (progress.ts:240), or belted into the top station above, where it lands in the lower depot. The hard cases are Steel Beam at the HQ and Batteries and Circuits above the Crystal Depths.

**Notes on the fix.** 1. Paying from the lower depot first doesn't fix the Mk3 on the top two shafts. Batteries and Circuits are made only on the Crystal Depths and never reach the Shallows or Fungal depot by request. Under the fix, the Shallows-Fungal Mk3 is paid from the Fungal depot and needs the same ~72-tile Fungal belt the finding cites; the Surface-Shallows Mk3 still needs goods shipped up two shafts.
2. Define where each good comes from: take each one from the lower depot if it holds enough, otherwise from the upper, or let the player choose. A single 'depot that will pay' fails when the goods are split between the two depots.
3. Paying from below first can silently spend a newly opened layer's construction stock. The Crystal Depths opens with exactly 30 Steel Beam and 10 Motor (layers.ts:172), which its Cutters, Crushers and Chargers need, and Steel Beam is not on the default request list. Show both depots' counts and which one will pay before the click.
4. Update PLAN §5.5, §5.8, the glossary and DECISIONS #21. Note that this amends #18, which makes the return trip up the intended logistics puzzle.
5. Also fix the doubled article in the tooltip ('the The Dig Site depot') and grey the button out when the player can't afford it.

## C8 (major, layer 5)

**Problem.** Waking the Engine takes 4 items and about 10 seconds, so it is a gate, not a problem. Act VI's hazard boils down to belting 2 Resonant Cores across the Magma Shelf. A jammed node shows no sign of it.

**Evidence.** [headless] Alien scenario, scratchpad wake.ts: two Unloaders on the depot (Battery and Resonant Core) side-load onto a 6-tile belt into the Waking Node. Its first Heartstone came at 10.7 s and woke 57 of 195 conduit tiles. That cost 2 Batteries and 2 Cores, and the Alien starter crate already holds 6 Batteries (layers.ts:232). After 4 wrong items the side buffer was full (battery, resonant_core ×3) and the node refused everything (logistics.ts:382), with no status shown. The node inspector says wrong items leave 'the left side' (inspector.ts:566); the nodes face south, so that is the face on the right of the screen (east).

**Proposed fix.** Wake conduit gradually in progress.ts onNodeHeartstone: each Heartstone a node makes wakes conduit 3 tiles further out (3/6/9/12/15 tiles). A full wake then takes 5 Heartstones, which is 10 Batteries and 10 Resonant Cores at the Waking Node, and the conduit lights up ring by ring, with a sound per ring. Feeding two items steadily becomes the challenge, and Act VI gets a build-up. In the node inspector, show 'Side chute full: belt the wrong items away' in coral when the side buffer holds 4 items, and name the side by compass direction ('east face'). Change milestone 28's step to 'Wake the Waking Node (5 Heartstones)'.

**Check: real.** Reproduced in the alien scenario with <session scratchpad>\verify_c6c10\wake.ts. A Battery Unloader at (21,40) and a Resonant Core Unloader at (21,41) side-load onto one belt into the Waking Node's west face.
- The first Heartstone came at 10.70 s and woke 57 of 195 conduit cells. WAKING_SEQUENCE is Battery, Core, Battery, Core, so it took 2 + 2 items. The Alien starter crate holds 6 Batteries (layers.ts:232).
- progress.ts:59 returns early after the first Heartstone (`if (t.stockCount > 1) return`), so later Heartstones never wake more conduit.
- With nothing at the side port, the side buffer filled at 26.15 s with [battery, resonant_core x3], and from then on the node refused every item (logistics.ts:382 refuses when sideBuf or outBuf holds OUT_CAP = 4).
- Nothing shows the jam. node.status stays 'idle'; the inspector's status line covers only machines, miners, collectors and generators (inspector.ts:67); the world's status badges skip fixed buildings (world.ts:~1045).
- inspector.ts:566 says wrong items leave by 'the left side'. Nodes are placed facing south (dir 2), and leftOf(2) is east (types.ts:12), so the side port is on the screen-right face.
- Resonant Core is in no building cost, so it can't be requested and must be belted down. In practice that means a belt across the Magma Shelf (depot at (58-60, 11-13) to the shaft-4 top station at (16,40), about 67 tiles), plus a belt on the Crystal Depths to its own top station.
- Calling it 'a gate, not a problem' is a design judgment, but every fact behind it is correct.

**Notes on the fix.** 1. The 3/6/9/12/15 ring schedule fails at the first ring (checked with <session scratchpad>\verify_c6c10\rings.ts). The Waking Node's nearest conduit is exactly 4.0 tiles from its centre, so a radius of 3 wakes 0 tiles. Its counts are r4=1, r5=7, r6=9, r9=25, r12=39, r15=57; the node at (57,29) also wakes 0 at r3. The first Heartstone would still fire milestone 28's node_woke and Mags's 'The conduits around that node just lit up' with nothing lit. Start the rings at 5-6 tiles or measure them from the nearest conduit.
2. Heartstones queue in outBuf (cap 4), and logistics.ts:382 also refuses all input once 4 are waiting. A 5-Heartstone wake therefore also needs a belt carrying Heartstones away, and the new inspector status should report a full output, not only a full side chute.
3. Remove the early return at progress.ts:59. The conduit pool (power.ts:47), the 'awake' label and all_nodes_awake all use stockCount > 0, so decide whether a node lends its full pool after the first ring.
4. For milestone 28, a step of { kind: 'produce', item: 'heartstone', count: 5 } works, because only the Waking Node can make Heartstones at that point; note that produce steps count from msBase.
5. Update PLAN §5.10 (~line 414), the glossary's 'Dormant conduits' (~570) and DECISIONS #30. layers.test.ts:188 still passes at radius 3, since the checked tile is 1 tile away.
6. Ten Batteries exceed the crate's 6; the rest arrive by request. Ten Cores must be belted down.

## C9 (major, controls)

**Problem.** One click on Rotate on the lower elevator station stops the shaft in both directions. That breaks the glossary rule 'everything sent down a shaft lands in the lower layer's depot'.

**Evidence.** [code] inspector.ts:175 shows a Rotate button on every elevator station, and game.ts:536 allows it. [headless] Shallows scenario, scratchpad rotate.ts: after rotating the lower station once, 2 minutes later the cab sat at the bottom (still loaded with 6 items, the station's 12-item arrival bay full, state 'dwell'). A minute after that, 2 Coal waiting in the bottom bay to go up still hadn't moved.

**Proposed fix.** Don't let lower stations rotate: refuse in game.rotate when the building is an elevator with bld.end === 1, and hide the button there. Alternatively, push a lower station's arrivals straight into its layer's depot whatever its facing. Keep Rotate on top stations, where it chooses which face up-cargo comes out of.

**Check: real.** game.ts:533-540 rotate() bails out only for fixed buildings that aren't elevators, so both stations can be rotated. inspector.ts:175-178 shows Rotate on every elevator station, and the R key rotates whatever building is hovered (app.ts:765-769). The lower station is placed facing east (dir 1), toward its depot (elevator.ts:136-137), and pushOutputs (logistics.ts:597) pushes arrivals only to outputPort(b) in b.dir.

Reproduced in the Shallows scenario with <session scratchpad>\verify_c6c10\rotate.ts:
- One rotate turns the station to dir 2, with its port at (32,13), where nothing stands.
- After 2 minutes the cab sits at the bottom holding 6 Iron Plate, arr[1] is full at 12 (2 cabs), the state is 'dwell' and loading is false. The cab only leaves once loading starts, and loading starts only after the cab is empty (elevator.ts:86-116).
- After one more minute, 2 Coal in the bottom bay still hadn't moved.
- Rotating it back with three more clicks recovered the shaft.

While it is rotated, the glossary's 'Down: everything sent down a shaft lands in the lower layer's depot' (~PLAN line 525) and DECISIONS #18 don't hold. The only feedback is 'Arrived, waiting to leave: 12' in coral in the station's inspector.

**Notes on the fix.** - Refusing in game.rotate when end === 1 covers both the Rotate button and the R hotkey.
- A lower station is fixed, so it has no Copy or Remove buttons; hide the whole actions row there.
- Saves with an already-rotated lower station stay jammed. On load, reset lower stations to face their depot (dir 1, as createShaft places them), or use the finding's alternative and deliver lower arrivals straight to the depot whatever the facing.
- The top station stalls the same way (the cab can't unload while arr[0] is full) if it is rotated away from its output belt, or that belt backs up, while cargo is coming up. Keeping Rotate on top stations keeps a smaller version of this trap; consider letting the cab leave with undelivered cargo, or warning in the inspector.

## C10 (major, layer 5)

**Problem.** Thrumstone creates no factory decision. The Attuner must stand on awake conduit, but the conduit power pool is never contested, so deciding what goes on the conduit never costs anything.

**Evidence.** [code] layers.ts:257 sets CONDUIT_KW_PER_NODE to 150; the Attuner draws 20 kW (buildings.ts:103). [math] The Governor needs 240 Engine Glass (120 directly plus 2 for each of its 60 Heartstones), which is 32 Attuner-minutes. A 10-minute line is 4 Attuners drawing 80 kW, about half of one awake node's pool. With all three nodes awake there is 450 kW of free power. Waking the second and third nodes (milestone 30) adds nothing to Engine Glass output.

**Proposed fix.** Set CONDUIT_KW_PER_NODE to 60 (from 150) and the Attuner's power to 30 kW (from 20). Each awake node then runs exactly 2 Attuners. The Governor's Engine Glass takes 16 minutes on one node's pool and 5.3 minutes on three, so waking the other nodes becomes the way to scale. A 50 kW Precision Assembler placed on conduit visibly slows Engine Glass. One Attuner still runs at full speed, so the Governor's first chain stays at 32 minutes. Amend DECISIONS #30.

**Check: real.** layers.ts:257 sets CONDUIT_KW_PER_NODE to 150, and the Attuner draws 20 kW and needs conduit (buildings.ts:103). power.ts:46-47 adds 150 kW to the layer's pool for each node with stockCount > 0. Machines with at least 2 tiles on awake conduit draw from that pool and slow by poolSat (power.ts:56-58 and 139, production.ts:56-64).
- The Governor needs 120 + 2 x 60 = 240 Engine Glass at 8 s each, which is 32 Attuner-minutes (my recompute: attune = 32.00).
- A 10-minute line is 4 Attuners drawing 80 kW, 53% of one node's pool. One node runs 7 Attuners at full speed, and three nodes give 450 kW.
- So waking nodes 2 and 3 (milestone 30) adds no Engine Glass throughput unless the player builds more than 7 Attuners. It does wake conduit near the rich Thrumstone at (40,16), which helps placement only.
- 'Never contested' is slightly overstated: other machines parked on conduit (a Precision Assembler at 50 kW, an Overcharger at 45 kW) can contest the pool, but the Attuner line alone never does.
- DECISIONS #30's intent, conduit power that slows by supply and demand instead of being free and unlimited, doesn't bind in practice.

**Notes on the fix.** - The proposed math is right. At 60 kW per node and 30 kW per Attuner, each node runs 2 Attuners. The Governor's glass takes 32 / 2 = 16 min on one node and 32 / 6 = 5.3 min on three. One Attuner (30 kW of a 60 kW pool) still runs at full speed, so the first chain stays 32 min; pacing.test.ts ignores power anyway.
- It matches PLAN §7.2's existing clean ratio 'one Thrumstone Miner : 2 Attuners : one Engine Node'.
- The Governor's 10-minute line (4 Attuners, 120 kW) would then need two awake nodes.
- layers.test.ts:205 still passes (one 30 kW Attuner on a 60 kW pool).
- Besides DECISIONS #30, update every place that says 150 kW or 20 kW: PLAN §5.4 (~line 222), §5.10 (~416-418), the glossary (~574 and ~576) and the §7.3 Attuner row (~856). The Mags line at progress.ts:83 reads the constant, but check that '60 kW of the mountain's own power' still reads as a reward.

## C11 (minor, logistics)

**Problem.** Requests can drain the HQ to zero, because the Surface has no request list to act as a floor. Every new layer also opens with the same generic requests, whatever that layer actually imports.

**Evidence.** [headless] rotate.ts, second part: with the Shallows requesting 40 plates, the HQ went from 30 Iron Plate to 1 in a minute. pickRequested only holds back what the upper depot itself requests (elevator.ts:60), and the HQ can't have requests: inspector.ts:412 returns before drawing the editor on layer 0. [played] screenshot x03: the Crystal Depths depot opens requesting Iron Plate 40, Gear 20, Copper Wire 20 and Brick 20 (progress.ts:240). That layer mainly imports wire, beams and cobalt, and barely uses brick.

**Proposed fix.** Show the request rows on the HQ under the heading 'Keep for the Surface', defaulting to plate 40, gear 20, wire 20. The Surface has no shaft above it, so these rows only act as a floor. Move the default requests into layers.ts, one list per layer. Shallows: plate 40, gear 20, wire 20, brick 20. Fungal Caverns: plate 40, gear 20, wire 20, brick 30, steel beam 20, motor 10. Crystal Depths: wire 80, steel beam 30, cobalt ingot 20, plate 30, gear 20, motor 10. Magma Shelf: circuit 20, steel beam 30, insulation 20, plate 30, motor 10. Alien Strata: battery 10, resonant core 10 (needs C1), circuit 20, steel beam 30, plate 30.

**Check: real.** Both parts are confirmed.

HQ floor: elevator.ts:60 only holds back `up.requests[k]`. mapgen.ts:118 gives every layer, the Surface included, `requests: {}`, and inspector.ts:412 returns before the request editor on layer 0, so the HQ can never have a floor.

Headless repro (vite-node): Game.create, D1 completed, HQ iron_plate set to 30, Shallows set to 0, default Shallows requests. Over 60 s the HQ plates went 30, 18, 13, 8, 3, 1, 1 while the Shallows went 0 to 35. The starter press keeps feeding the HQ and the cab ships those plates straight back down. DECISIONS #54 already records the Act I bot ending with no gears in the HQ.

Generic defaults: progress.ts:230 copies one DEFAULT_REQUESTS (progress.ts:240: plate 40, gear 20, wire 20, brick 20) to every new layer. The Crystal Depths has no copper or stone deposit (layers.ts:164-172), and its machines cost steel beams, cobalt and wire. Brick is used there only by the generator and the assay lab (10 each), so the description fits.

The omission matches PLAN §5.6 and DECISIONS #22 wording ("every underground depot"). So this is a design gap, not a misread of the code.

**Notes on the fix.** - **HQ inspector would crash:** `requestable()` reads `g.layer(b.layer - 1).stock` and the header tooltip reads `LAYERS[b.layer - 1].name`. On the HQ both use index -1 and throw. `depotHeight()` also returns early for layer 0. All three need a layer-0 case, plus a different tooltip.
- **Where the defaults go:** set the HQ defaults in Game.create/setupSurface, because mapgen gives `{}`. Saves made before the change keep `{}` unless they are migrated.
- **Act II pacing:** a 40/20/20 floor means the Shallows gets nothing from the HQ until the HQ is above the floor. The Act I bot ends with about 0 gears in the HQ (DECISIONS #54), so early Act II would run on the Shallows crate alone. Check the pacing.
- **Tests:** the existing request tests in sim.test.ts:329-357 put 500 gears in the HQ, so a 20-gear floor doesn't break them.
- **Resonant core:** `resonant_core` is not in BUILD_GOODS. It can be a default, but it can't be added back from the Add row without C1.
- **Gaps in the proposed lists:** the Magma list has no gear (miners need 4, splitters 1). The Alien list has no gear or heat_shield (the Attuner needs 2 heat shields).
- **Docs:** update the PLAN §5.6 sentences on underground depots and on the default list, DECISIONS #22, and add a new DECISIONS entry.

## C12 (minor, economy)

**Problem.** Chute versus shipping up is decided by layer, not by item: below the Shallows the Chute always wins, and contracts for deep goods are offers almost nobody can deliver. Rush itself works.

**Evidence.** [math] Rush at 3x is a working emergency valve: rushing a whole 41-machine D5 line comes to roughly $16,000, against about $6,000 in Act V rewards before D5 (a Precision Assembler is $1,164, a Pressure Forge $1,032; math.ts). Shipping up from the Shallows takes about 15 belt tiles for +67%, so it always beats the Chute there. From the Fungal Caverns it takes about 55 more tiles across the Shallows, and from the Crystal Depths about 72 more across the Fungal Caverns, so below the Shallows the Chute always wins. Contracts are delivered only at the Terminal (progress.ts onChuteSale ignores them). Once the Magma Shelf is open, 10 of the 19 contract templates are Fungal-or-deeper goods (resin, cobalt, insulation, filter, charged crystal, circuit, battery, aggregate, heat shield, ember core). They take board slots and push players to the $200 re-roll.

**Proposed fix.** Let a contract also be delivered at any Company Chute, paying 60% of its price. In onChuteSale, count the item toward s.contracts.active and pay round(c.pay × 0.6) on completion. Deep contracts then become worth taking where their goods are made, and the Terminal keeps its +67% for players who build a line up the shafts. Update the glossary line 'Company Chute ... never counts toward a contract'.

**Check: real.** The code and data facts all check out.

- **Chute ignores contracts:** progress.ts:42-51 onChuteSale never touches s.contracts. The Terminal-only rule is deliberate: DECISIONS #37, PLAN §5.8 and the rules at PLAN.md:582/584 ("it never counts toward a contract").
- **Contract templates:** with minLayer ≤ 4 there are 19 templates (progression.ts:161-180), and exactly 10 have minLayer 2-4: resin, cobalt_ingot, insulation, filter, charged_crystal, circuit, battery, aggregate, heat_shield, ember_core.
- **Re-roll:** CONTRACT_REROLL is 200.
- **Belt distances:** arrival to bore site is 26+29=55 tiles on the Shallows and 46+26=72 on the Fungal Caverns (layers.ts). From the Surface shaft station to the Terminal is about 11 tiles.
- **Rush prices:** a Precision Assembler is (6×30 + 2×60 + 8×11) × 3 = $1,164. A Pressure Forge is (2×80 + 8×11 + 4×24) × 3 = $1,032. Milestones 23-25 pay $6,000.

The multi-hop barrier that #37 cites to justify Chute sales applies equally to contracts.

Two parts are overstated:
- **"Below the Shallows the Chute always wins" is not shown.** The belt route is a one-time cost of 55-72 plates plus digging. The cab's upward leg carries only belt cargo, because requests ride down (elevator.ts:97-101). So a steady stream still earns +67% after that one cost; this is an effort argument, not a money one.
- **The re-roll pressure is weaker than stated.** One offer rotates out free every 300 s (game.ts:835-836, progress.ts:105/116). By my estimate, only about 12% of fresh boards are all-deep.

**Notes on the fix.** - **Last-item exploit:** paying either round(c.pay × 0.6) or the full pay depending on where the last item lands lets a player deliver N-1 items at a Chute and the last at the Terminal for full pay, or lose 40% by accident. Track Chute deliveries on the contract and pay round(c.pay × (terminal + 0.6 × chute) / count). Add the field to the contract type and to the deserialize defaults.
- **Mirror onSale:** use the same item-id mapping, return early so contract items don't also get the 60% per-item sale, and emit the contract event and toast.
- **Docs and text:** this reverses part of DECISIONS #37, so add a new DECISIONS entry. Also update:
  - PLAN §5.8 "Contracts are delivered only here" and PLAN.md:582
  - the line at PLAN.md:584
  - buildings.ts:83 (Chute blurb) and :120 (Terminal blurb)
  - inspector.ts:151 (Chute text)
  - windows.ts:175 ("Delivered to the Shipping Terminal") and the help text at :248
  - PATCHNOTES.md:32
- **Cap still holds:** 0.6 × the 2.5 cap is 1.5× value, still under the 3× Rush price, so the CONTRACT_MUL_CAP rule still holds.

## C13 (minor, ui-text)

**Problem.** Several pieces of text are wrong or clipped.

**Evidence.** [code] hud.ts:412: the Sorter's lock text reads 'finish milestone 4 (Wire and Gears)', but Wire and Gears is milestone 3. [played] buildings.ts:138: the Express Belt license text, 'Belts at 180/min: one Mk3 elevator, emptied.', is cut off under its price button in the Company window (screenshot x02). The planned status 'Planned: waiting for goods in the depot' (hud.ts:26) runs past the inspector's edge (x04). Objective labels are clipped at 172 px: 'Click the Drill to see what it n.' and 'Feed the Waking Node batteri.' (a02). game.ts:874-878: earn() adds milestone and contract rewards to the income counter, so the top bar showed '+$106/min' at 0:22 and '+$3,003/min' just after Act VI's assay. The build tooltip covers the 2×2 ghost it describes (c02).

**Proposed fix.** Build the lock text from MILESTONES.find(m => m.reward.license === val). Express Belt text: '180 items a minute, twice a conveyor.' Planned status: 'Planned: waiting for goods'. Step labels: 'Click the Drill' and 'Wake the Waking Node', plus a test that every step label fits in 158 px of the UI font. Count only Terminal and Chute sales in s.income; rewards still go to money and stats.earned. Anchor the build tooltip above and to the right of the ghost's footprint instead of at the cursor.

**Check: real.** Every sub-claim is confirmed. Widths were measured with src/ui/font.ts measureText via vite-node.

(a) **Sorter lock text:** hud.ts:412 hardcodes 'finish milestone 4 (Wire and Gears)', but progression.ts:78 makes Wire and Gears milestone 3, which grants the 'sorter' license.

(b) **Express Belt line:** 'Express Belt: Belts at 180/min: one Mk3 elevator, emptied.' is 289 px. The Company window content is 288 px wide and the price button starts 236 px in (windows.ts:206-211), so the text runs under the button.

(c) **Planned status:** 'Planned: waiting for goods in the depot' is 197 px, against 162 px of room in the 172-px inspector (inspector.ts:19, 69). It runs about 30 px past the panel edge.

(d) **Step labels:** hud.ts:167-168 fits labels to 153 px when a step has no count. fitText gives exactly 'Click the Drill to see what it n.' (174 px) and 'Feed the Waking Node batteri.' (213 px). Also clipped: M20 'Block interference with a Shield Wall' (181 px) and 13 generated labels with counts, such as 'Produce 20 Heat-Resistant Aggregate' (192 px against 125). Hovering shows the full label (hud.ts:170).

(e) **Income counter:** game.ts:874-878 earn() adds every amount to s.income. It is called for milestone rewards (progress.ts:373) and contract pay (progress.ts:23).

(f) **Build tooltip:** app.ts:578-581 puts a 2×2 ghost's top-left on the hovered cell, and ui.tooltip draws at the cursor +8,+10 UI px, going right and down (ui.ts:172-182). At 1080p (uiScale 3, zoom 3) the 96-px ghost is mostly under the tooltip.

**Notes on the fix.** - **Express Belt text:** the proposed 'Express Belt: 180 items a minute, twice a conveyor.' is 255 px. It still runs under the price button (starts at 236 px) and the 'at Crystal' label (starts at 237 px). 'Express Belt: 180/min, twice a conveyor.' is 201 px and fits.
- **Step-label test width:** 158 px is the wrong limit. The HUD gives 153 px with no count and 107-131 px with one (172 − 19 − count width − 5).
- **The test fails as written:** even at 158 px it fails on M20 'Block interference with a Shield Wall' (181 px) and the generated 'Produce 20 Heat-Resistant Aggregate' (192 px), and the fix shortens neither. Against the real room, 16 labels fail, mostly generated 'Produce N <item>' and 'Bore to …' with counts. Test against the HUD's own room calculation, and shorten generated labels or widen the panel.
- **Income:** items delivered toward a contract earn $0 each, because onSale returns before earn. Dropping contract pay from s.income would make a line feeding a contract read about $0/min. Either credit pay/count per delivered item to s.income, or exclude only milestone rewards.
- **Tooltip anchor:** ui.tooltip takes no position. It needs a positioned variant plus a world-to-UI conversion (camera, zoom, uiScale). drawTip only clamps the right and bottom edges, so 'above the ghost' needs a fallback near the top bar.
- **Lock text:** building it from MILESTONES.find(m => m.reward.license === val) works. It gives milestone 3, and express_belt falls back to the Company-window text.
