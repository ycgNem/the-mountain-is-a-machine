# Decisions

Design and technical decisions with their reasons, newest last. Challenge any of them with a
better reason; reversals get a new entry that points back.

1. **TypeScript strict + Vite + Canvas 2D, no engine.** The owner's standard stack for every game
   (global instructions, 2026-10-16) and the same as Sprocket & Sprout. Full control of pixel-exact
   rendering.
2. **Mouse-driven, no avatar.** Walking adds chores, not decisions, to a factory game. The player is
   the foreman's cursor.
3. **16 px tiles, one item per belt tile.** Every item on a line is visible and centered, so you can
   follow a rock through the factory (pillar 6). Throughput is capped by belt speed (90/min,
   later 180/min), which is plenty because elevators are the real bottleneck.
   (Amended by #21.)
4. **Apollo 46 palette.** Strong earth, rust, blue, purple and grey ramps cover all six layer moods
   (ochre surface to teal conduits) in one coherent palette. A different palette from Sprocket &
   Sprout's Resurrect 64 gives this game its own identity.
5. **One sprite per machine for all facings, with a code-drawn output chute.** Rotating pixel art
   breaks it; four directional sprites per machine would quadruple the art budget for little gain.
   (Amended by #61: only buildings with a front output get the chute.)
6. **Per-layer depots for construction.** Buildings are paid from the layer's own stockpile, which
   makes "send it down or make it here?" a real question (pillar 4). Friction is softened by starter
   crates, planned ghosts that build when goods arrive, the Unloader and Requisitions.
   (Amended by #22, #35, #39 and #64.)
7. **Each layer's bore site is somewhere else.** Shafts don't line up, so cargo between distant
   layers changes elevators and crosses intermediate layers, which makes the stack one connected
   machine. (Amended by #22, #37, #64 and #75; the distances stay, #23.)
8. **Deposits are infinite with fixed rates.** Expansion comes from needing more throughput or a new
   material, not from relocating miners (from the owner's notes). Depletion may come back as a
   challenge rule. (Amended by #25 and #27: Emberite and Chorus Crystal come from capped vents.)
9. **Per-layer power without wires; shaft cables move surplus automatically.** Wires are layout
   tedium; a per-layer grid still makes power a location decision. (Clarified by #43.)
10. **Drill projects cost goods only; money buys options.** "You can be rich and still unable to
    reach the next layer" (owner's notes, pillar 3). (Amended by #35.)
11. **Assays turn discovery into a physical act.** Learning a material means producing and belting
    in samples, so Phase A ("figure it out") happens on the factory floor, not in a menu.
    (Amended by #41.)
12. **One hazard per underground layer, each with a turn.** Spores → biofuel, interference →
    resonance taps, heat → heat-loving forges, conduits → free power. Matches "the best environmental
    mechanic starts as a problem and becomes an advantage". (Amended by #26 and #30.)
13. **Overcharged crystals shatter on belts.** Forces direct machine-to-machine insertion, which
    clashes with interference: a small, readable layout puzzle instead of a hidden timer.
    (Amended by #28.)
14. **Hot items carry heat and cool on belts.** The physical version of the owner's "the processed
    material cools during transport"; insulation from layer 2 solves layer 4. (Amended by #25.)
15. **Planned ghosts instead of blocking placement.** You can always lay out your design; it builds
    itself when the depot has the goods. (Amended by #35 and #48.)
16. **The story is one authored path.** One milestone order for every player (lesson from Sprocket &
    Sprout: the owner prefers one coherent path).
17. **Code-drawn fallback for every sprite name.** The game always runs while art arrives in batches,
    and the art pipeline can't break the build.
18. **The lower elevator station faces its layer's depot.** Goods sent down land in stock with no
    belts, so supplying a new layer from above is "belt it into the top station" and nothing more.
    Sending goods back up still takes belts into the lower station's other faces, so the return trip
    is the logistics puzzle, not the delivery. (Amended by #22 and #70; clarified by #72: the lower
    station never turns.)
19. **The elevator cab waits for a fuller load.** It leaves when full, when cargo is waiting at the
    other end, or after 2.5 s with a part load. Leaving the moment one item arrived ran the first
    trips nearly empty and cost about 30% of throughput; the wait keeps a trickle moving and a busy
    line shipping full cabs, so the Mk1 table number (48/min) holds in play.
    (Amended by #21: Mk1 now moves 45/min.)
20. **Act-level checks are tests, not hopes.** Data tests prove every project and building cost is
    reachable on its layer; map tests prove every deposit, bore site, pool, hot patch, conduit, node
    and the Heart can be reached and built on, for the shipped seed and two others.

## Plan review 1 (2026-10-30)

Entries 21–51 fold in the first plan review: the indie critic (cited as critic #N), the systems and
numbers review (systems #N) and the art director (art #N), plus what the Act I pacing bot
(`tests/act1.test.ts`, `tests/bot.ts`) found. The three reports, and the owner's calls on them, are
in `docs/reviews/review-1/` (`critic.md`, `systems.md`, `art.md`, `decisions.md`). Rejected
findings are recorded too (#23, #45). Entries 52–54 came from building it: the pacing test, the
save slots and the Act I bot on the new rules.

21. **Elevators bind: Mk1 45/min, Mk2 90, Mk3 180; the Crystal Depths has no copper.** Cabs of 6, 9
    and 15 with travel of 3, 2 and 1.5 s and a 1 s dwell at each end give round trips of 8, 6 and
    5 s: half a conveyor, one conveyor, one express belt. Upgrade costs are unchanged and paid from
    the upper station's depot; cables stay 60/150/400 kW, and the cab still waits for a fuller load
    (#19). At 48/120/274 a minute nothing ever waited on a shaft, because peak drill imports were
    12–24 a minute (critic #1, systems #7). With the Crystal Depths' copper deposit removed, circuit
    copper rides the elevators down from the layers above (the Shallows' copper, or the Fungal
    Caverns' hidden deposit, #55), so D4 alone sends about 660 items through the Fungal→Crystal
    shaft (66 a minute over a 10-minute run): Mk1 is the limit, Mk2 is a real Act IV call, and
    shipping ingots instead of wire halves the load. Amends #3 by making its reason true instead of
    dropping it, and #19's 48/min. (Amended by #70: upgrade goods come from the lower depot first.)
22. **Depot supply requests.** Every underground depot keeps a request list (item → target). When a
    cab loads at the top of a shaft it takes requested goods from the upper depot first, up to half
    the cab and never below that depot's own request, then belt cargo from the top bay, then more
    requests if room is left. Requests relay down the stack, and everything sent down lands in the
    lower depot. New layers open asking for Iron Plate 40, Gear 20, Copper Wire 20 and Brick 20.
    Supplying every layer by hand meant an Unloader, a long belt and a station per hop, a chore with
    no trade-off (critic #1). Now the per-layer decision is how to spend 45 items a minute of cab on
    construction stock, fuel or product, the way Factorio's landing pads share rocket capacity. Belts
    into a top station carry production cargo and volume. Amends #6, #7 and #18. (Amended by #64:
    any good can be requested; #65: in turn; #74: per-layer lists and the HQ's floor. Clarified by
    #79: half the cab rounded down.)
23. **Bore-site distances stay (critic #13, rejected).** The critic asked for bore sites 12–20 tiles
    from the arrival shaft instead of 25–40. Requests (#22) and Company Chutes (#37) already remove
    the pass-through belts that made the distance a tax, and moving every bore site would mean
    re-laying all five underground maps. #7 stands.
24. **Sapstone makes resin you have to manage.** Insulation is 1 Resin + 1 Mycelium Fiber (6 s), the
    Separator takes 6 s (10 a minute), and the Combustion Generator also burns Resin (60 kW, 4 s
    each). D3 (100 Cobalt Drill Head, 200 Insulation, 60 Filter) needs 400 ore against 260 resin:
    separate about 260 and wash about 140, so both machines earn their place. Two of the three
    Sapstone deposits sit 3–5 tiles from a glowcap patch, so spores slow the core line 20–35% until
    it is filtered. Before, separating everything was nearly right and the Washer was a cobalt top-up
    (critic #2, systems #8), and spores near no ore made the Spore Filter a checkbox (critic #6).
    Burning resin makes a surplus a choice, not a wall.
25. **Emberite: heat that runs out, capped vents, steady ground.** Belt-type tiles take 10 heat a
    second from a hot item and an Insulated Belt 1 (10× slower); below 50 heat an ember ingot becomes
    a Cooled Ember Ingot, so a plain run lasts about 7.5 tiles and an insulated one about 75. A hot
    item entering anything that isn't a machine or a belt-type tile (depot, crate, elevator,
    terminal, chute, the Drill except D5's hot delivery) cools at once, and the Molten ingot sells
    for $0. The Precision Assembler needs steady ground: at least 8 tiles from any hot ground.
    Emberite comes from 3 single-miner vents (2×2, 90 a minute in all), each inside the hot band, so
    their miners run at half speed until Foundations go down (Foundations may sit on deposit tiles).
    D5 asks for 20 Molten Ember Ingots delivered hot. Before this, a forge placed against an
    assembler skipped belts, heat and insulation entirely, containers had no heat rule, and big
    deposits let all three Emberite routes run at once (critic #3, systems #9). Amends #14 and #8.
26. **Heat is a field with grades.** Hot ground is within 2 tiles of magma, warm ground 3–4 tiles.
    Ordinary machines run ×0.5 on hot and ×0.75 on warm; the heat family (Smelter, Foundry, Pressure
    Forge) runs ×2 on hot and ×1.5 on warm; the Cooling Bath and Thermal Extractor don't care. A
    Foundation removes both penalty and bonus, and the Pressure Forge needs hot, not warm, ground. A
    2-tile band you could simply avoid was a tax on careless players, and the plan never said which
    machines counted as ordinary (critic #6, systems #12). At ×2, one rich Magma iron Miner (60 a
    minute) feeds exactly one hot Smelter. With #24 and #28 this writes hazards as physics, not
    zones: each rule applies wherever its cause is. Amends #12.
27. **Chorus Crystal: two routes to powder, capped vents.** "Crush charged" becomes 1 Charged Crystal
    → 2 Conductive Powder in 8 s. The rich route (cut → charge → crush) yields 2 powder per crystal
    against 1 for the cheap route (crush → charge grit), but it puts two sensitive machines in the
    line instead of one. Chorus comes from 3 single-miner vents (90 a minute in all), so by Act V
    circuits, batteries and cores compete for crystal. The Overcharger takes 8 s to match its
    Stabilizer. "Order matters" used to mean one valid order per product plus a trap that turned a
    charged crystal into grit (critic #9). Amends #8. (Amended by #67: the vents are poor, 45 a
    minute in all, and Charge Grit takes 2 s.)
28. **Interference by footprint gap; Stabilizers damp; taps count real work.** Two working machines
    interfere when the gap between their footprints is 2 tiles or less (whole tiles, Chebyshev), and
    a Shield Wall anywhere inside the rectangle spanned by both footprints blocks it. Interferers are
    working 2×2-or-larger production machines (machine, miner, collector) drawing at least 8 kW, on
    the grid or a conduit. Stabilizers are dampers and emit nothing; neither do taps, generators or
    extractors. Sensitive machines lose 25% per interferer (25% at worst). A tap makes 20 kW per
    interferer (up to 6), counted from the last hazard refresh, and the placement ghost shows a
    sensitive machine's predicted speed and a tap's output. The old centre-distance line test was
    ambiguous on a grid, a tap ringed by 1 kW Unloaders or by other taps was free power, and the
    overcharge pair could never be shielded (systems #2, #10; critic #8). Now the pair runs clean and
    the puzzle is shielding it from everything else. Amends #13.
29. **Slag quenches into Aggregate.** The Cooling Bath gets a second recipe, Quench Slag (2 Slag → 1
    Aggregate, 4 s), and the Thermal Extractor takes 4 s per Emberite (15 a minute, 220 kW). Slag had
    no use: it filled the Magma depot within an hour and then stopped the layer's main power source
    (systems #4). Burning now yields 220 kW plus half an Aggregate against a whole Aggregate for
    quenching, so the three routes stay a trade.
30. **The Engine wakes.** Conduits start dormant. Every Engine Node takes 2 s per accepted item and 4
    items per Heartstone (8 s, 7.5 a minute). The node nearest the arrival, the Waking Node, takes
    Battery and Resonant Core alternating; the other two take Engine Glass and Resonant Core
    alternating. A wrong item is pushed out of the node's side and progress is kept. A node's first
    Heartstone wakes every conduit tile within 15 tiles of it, permanently. Machines with at least 2
    footprint tiles on awake conduit draw from the conduit pool instead of the grid, 150 kW per awake
    node, and slow by supply/demand beyond it; the Attuner needs that footing and draws 20 kW from
    the pool. The Governor is 60 Heartstone, 120 Engine Glass, 40 Battery and 40 Ember Core (60 since #52). Free,
    unlimited conduit power made the finale the easiest layer, the node recipe read as either 1 + 2
    or 2 + 2, and a wrong item threw away accepted items against PLAN §5.12 (critic #7, systems #11).
    The Engine now starts as a problem that tests the shaft chain (Batteries and Resonant Cores from
    the Crystal Depths) and becomes a tool; Act VI gets a "Wake the Engine" milestone for it.
    Amends #12. (Amended by #58: every conduit wakes at the ending; #71: conduit wakes ring by ring
    and wrong items leave cooled; #73: 60 kW per awake node, the Attuner 30 kW.)
31. **Clean ratios.** Recipe times are set so one normal Miner (30 a minute) feeds whole machines
    down every chain: Press plate, wire and mycelium 4 s; Cobalt Ingot 4 s; Reinforced Plate 8 s;
    Motor = 2 Gear + 4 Copper Wire, 8 s; Separator 6 s; Biofuel 8 s, burning 8 s for 120 kW; Cobalt
    Drill Head 8 s; Crusher 4 s; Charge cut 4 s; Overcharger 8 s; Circuit = 2 Conductive Powder + 4
    Copper Wire, 8 s; Heat Shield = 4 Aggregate + 1 Steel Beam, 8 s; Quench 2 s; Forge 8 s; Ember
    Core 8 s; Attuner 8 s. The old times put fractional machine counts into nearly every chain, the
    tutorial included (systems #5). A 4 : 3 puzzle is fun once; the interesting ratios should come
    from the materials (surplus resin, two powder routes, capped vents), not from arithmetic.
32. **Bigger drill projects and a pacing rule you can test.** D2 is 160 Steel Beam, 60 Motor, 80
    Drill Bit; D3 100 Cobalt Drill Head, 200 Insulation, 60 Filter; D4 200 Circuit, 100 Battery, 60
    Resonant Core; D5 60 Ember Core, 160 Heat Shield, 40 Circuit and 20 Molten Ember Ingot delivered
    hot; the Governor 60 Heartstone, 120 Engine Glass, 40 Battery, 40 Ember Core (60 since #52). D1 is unchanged as
    the tutorial. PLAN §8's rule is now testable: the first chain (one machine per recipe) takes
    25–35 minutes, the 10-minute line needs 24–45 machines, machine-minutes rise every act, and D1 is
    exempt. At the old sizes one machine per recipe finished every project in 8–17 minutes, D3 and D4
    needed less work than D2, and the "unscaled starter line" in §8 was never defined, so the pacing
    bot had nothing to check (systems #1, critic #12). (Amended by #69: D2 is 100 Steel Beam, 30
    Motor, 50 Drill Bit and exempt like D1.)
33. **Item values that add up.** Heat Shield $80, Battery $60, Heartstone $400, Insulation $14, and
    the Molten Ember Ingot $0 (unsellable). A Heat Shield sold for less than its inputs, a Battery and
    a Heartstone added almost nothing to theirs, and the Molten ingot's $30 could never be collected
    (systems #14).
34. **Game speed 1× and 2×.** 3× is gone: waiting must not beat building. At 3× an unscaled line
    finished projects faster than a player could scale one (critic #12); Factorio and Satisfactory
    ship no fast-forward for the same reason.
35. **Requisition becomes Rush.** A planned ghost can be rushed for 3× the value of its missing
    goods; it builds at once, and removing it later refunds only the goods that came from the depot.
    Requisition into depots is gone, so money can no longer buy drill goods. An Unloader could pull
    requisitioned goods into the Drill, and rushing then removing a building would have laundered
    goods through the full refund, so money bought out D4 to the Governor (systems #6, critic #10).
    Amends #10, #6 and #15.
36. **Money: contracts capped, late rewards flattened, dead prices removed.** A contract asks for
    about 5 minutes of one machine's output of its item and pays 1.5–2.5× its value, never above 2.5×
    (free play included); re-rolling the board costs $200. Act V's milestones pay about $6,000 before
    the breakthrough and Act VI's about $8,000. The Sorter license is no longer sold (the Wire and
    Gears milestone grants it), the Storage Crate unlocks free with the Shallows, and the Express
    Belt license stays, at $2,500 on the Crystal Depths. The Surface has no surveys, because it is
    never dark. Contract size was undefined, free play's rising payouts above the 3× rush price were
    an infinite money loop, rewards rose 26× from Act I to Act VI while digging rose 7.5×, and two
    prices were never paid (systems #6, #14; critic #10). (Clarified by #89: the contract templates
    pay 1.7–2.5×.)
37. **Company Chute.** A 1×1 building on any underground layer sells whatever is belted into it at
    60% of its value, instantly. Full value and contracts stay at the Surface Terminal, so "ship it up
    for +67%?" is the decision. Selling from the Magma Shelf meant four elevator hops and a long belt
    across every layer in between, so players would have stopped selling deep goods and the
    sell-or-use tension would have died below the Fungal Caverns (critic #13). Amends #7 (with #22).
    (Amended by #75: contracts can be delivered at a Chute too.)
38. **Onboarding teaches the depot in the first minute.** The starter line is Miner → Smelter →
    Splitter, feeding both the Terminal and a Press → HQ, so the HQ's plate count ticks up from the
    first minute, and the HQ starts with 100 Iron Plate. First Light also asks for a click on the
    Drill to see what it needs; Copper Line pre-places a planned copper Miner ghost; Brickwork adds a
    step, upgrade the Company Line. The old opening taught "machines make money", hid the depot rule
    until the third milestone, and let an eager belt drag leave unexplained blue ghosts (critic #11);
    no milestone taught the Company Line, though the Surface passes 60 kW around Brickwork (systems
    #3). With a Press already feeding the HQ, the old Pressed Metal milestone had nothing left to
    teach and is gone, so Act I has six milestones. (Amended by #68: the line starts full, and the
    top bar shows the HQ's stock.)
39. **Every underground layer opens on a running rig.** Layers with coal in the start pocket
    (Shallows, Fungal Caverns, Magma Shelf, Alien Strata) open with a pre-built coal Miner feeding a
    Combustion Generator; the Crystal Depths runs on the Fungal Caverns' cable and its taps. Starter
    crates below the Shallows carry an Assay Lab's goods, because each of those layers opens with an
    assay milestone, and the Alien Strata's also carries an Attuner's; the Shallows' crate carries 4
    Motors and 30 Copper Wire. Without them a new layer couldn't run anything: the Shallows
    needed Motors to build a generator and a generator to make Motors, and the labs below needed
    copper and brick their start pockets don't have (systems #3). This is pillar 10 on every layer.
    Amends #6. The rig's Miner soon fills the generator, which burns only what the layer needs, and
    waits: a building whose only refused output goes into a generator holding all of that fuel it
    can (4) shows Idle with no badge, and its inspector says "The generator is full: it burns more
    when the layer needs power" (or that the generator is burning flat out). It showed the red
    Output blocked `✕` on the rig the crew just left, as if it were broken.
40. **Act II in five milestones.** Down the Shaft (visit + 3 Lamps), Steel, Motors, The Bore Site
    (dig to it + 80 items by elevator) and Bore to the Fungal Caverns, for a 20–30 minute act. The
    Shallows start pocket grows to about 22×14 with iron and coal inside, and the bore-site cavern
    shows amber-sealed rock that Mags remarks on: the first strange thing, about 30 minutes in. Act II
    had no strange material and several pure chores, so Sapstone arrived 45–70 minutes in, after most
    web players have decided whether the hook is real (critic #5). Coal Power went with the running
    rig (#39).
41. **Four assays.** Sapstone, Chorus Crystal, Emberite and Thrumstone keep their Assay Lab step.
    Glowcap, Resin, Charged Crystal and Engine Glass unlock what uses them the first time one is
    produced, and milestones that asked for those assays ask for production instead. Eight assays
    repeated one act; four keep the point of #11, a strange material learned on the factory floor
    (critic cut list). Amends #11. (Amended by #57: the Sequencer comes with the Thrumstone assay.)
42. **One output port; the Merger is cut.** A machine's output is one tile: front-right on a 2×2
    (relative to its facing), front-centre on a 3×3; a side output is the front-most tile of the left
    face. It is drawn as a chute (STYLE). Belts take turns fairly between their inputs, so a merge is
    plain side-loading and the Merger had no job. A 2-tile output face could feed two neighbours, and
    which tile pushed was undefined (systems #13, critic cut list). (Amended by #61: no front chute
    without a front output; #63 removes the Merger's code.)
43. **Power rules, as built.** A working machine draws its full rating even when a hazard slows it,
    and surplus crosses shafts to short layers nearest-first within each cable's cap. The plan left
    both open (systems #2). Clarifies #9.
44. **A rules glossary in PLAN §5.15.** One line per rule, so the open questions (node recipes,
    conduit footing, heat in containers, which machines love heat, what counts as an interferer,
    where elevator cargo lands, where contracts count) are settled in the doc, not ad hoc in code
    (critic #14).
45. **Scope gating rejected (critic #4).** The critic asked to build Acts II–III as a gated vertical
    slice, with indie-critic sign-off at D3 before any Act IV code and a contingency to merge the last
    two layers. All six layers are already built, and every layer's rules are covered by tests.
    Instead, every act gets a scenario playtest by the critic; `tests/pacing.test.ts` computes both
    reference lines (#32) from the recipe data and holds every project to them; and the Act I bot
    (`tests/act1.test.ts`) records Act I times and holds the efficient run under the Act I band's
    25-minute ceiling (#54).
46. **Art plan: pilots first, ten terrain sets, anchored batches, scenes for the big pieces.** Ten
    terrain sets (adding t_l4_floor_hot and t_l5_floor_conduit, and renaming the magma set
    t_l4_hot_magma); an L1 pilot picks pro or standard tilesets for all ten; items and ground objects
    at 16 px with re-rolls anchored on approved icons; machines at 32 px with a view-angle pilot; 3×3
    buildings, the Drill and the Heart drawn with create_map_object inside mock scenes of approved
    art; the portrait from create_image_pro at 48×48; the title at 320×180 with pixflux. Budget: 273
    planned + 150 reserve, inside the 500 cap. New sprite b_chute; b_merger is cut. Separate jobs
    drift in angle and style, hot ground and conduits had no terrain, the portrait tool STYLE named
    can't draw from text, and 400×225 can't scale by a whole number to 1080p (art #2, #3, #13).
    (Amended by #84: standard terrain; #85: one-direction objects for the big pieces too; #86: 157
    generations spent.)
47. **Art style rules from review 1.** Lit lips on rock edges and one darkness tint (#090a14);
    darkness computed at tile corners and dithered per world pixel (world-anchored Bayer, bands at 0
    / 0.35 / 0.65 / 0.85, unrevealed 1.0); belt colours and an 8 px pattern period moving in lockstep
    with items; closed 1 px item outlines inside a 12×12 envelope; separated ramps (cobalt vs
    crystal, iron vs steel, glossy coal); family and layer accents that never repeat; deposits as
    half-buried chunks with a seeded ±2 px offset and an ore-bed tint; dull decor; plain south faces
    and a distinct top-view shape per machine, with a specified output chute; openings in sprites
    for their animations; pad-and-fail import rules; a code-drawn art table. Revealed rock looked
    like unrevealed void from the Fungal Caverns down, dark items vanished on dark belts, cobalt and
    crystal shared four colours, and a Miner read as a Company building (art #1, #4–#12, #14).
48. **Planned ghosts build fairly; swaps must be paid; a replaced belt keeps its item.** Ghosts
    build oldest first, and a ghost still waiting holds the goods it needs: newer ghosts only use the
    depot stock beyond what older waiting ghosts hold (spare goods are fair game, so one expensive
    ghost doesn't freeze every belt behind it). A
    planned ghost dropped on a working building is refused unless the depot can pay now ("Not enough
    goods to swap this in"). Replacing a belt never loses its item: if the new piece can't carry it,
    it goes to the depot. The Act I pacing bot found all three: cheap belt ghosts starved waiting
    machines, and a ghost dropped on a working belt removed it at once and could never be paid for,
    deadlocking the line. A careless run deadlocked three times and only escaped by requisitioning.
    Amends #15. (Amended by #77: a swap counts the refund less rushed goods; #78: over a ghost the
    new piece waits; #92: a depot Unloader leaves what waiting ghosts hold.)
49. **Act I costs: no brick in the Smelter; the 160 kW line costs $1,000.** The Smelter costs 10
    Iron Plate + 2 Gear: bricks only come from smelters, so building three smelters before a brick
    line locked the player out. The Company Line's 160 kW step drops from $1,800 to $1,000: Act I
    earns about $30–45 a minute, so it only arrived at D1 (Act I pacing bot; its efficient run
    reached D1 at 13:09 game time).
50. **"Build" steps count what already stands.** A build step counts finished (non-ghost) buildings
    that match it, not only the ones built since the milestone began, so a player who built ahead is
    never asked to build again (Act I pacing bot).
51. **Machines can be paused.** The inspector pauses a machine: no new crafts, no power draw. A
    player short of power or input can stop a line without tearing it down and losing its layout and
    recipe (Act I pacing bot; pillar 8). (Clarified by #78: machines, miners and collectors only,
    and a paused machine finishes its craft.)
52. **The Governor asks for 60 Ember Cores (was 40), and a test holds every project to PLAN §8.**
    `tests/pacing.test.ts` computes both reference lines from the recipe data: the first chain (one
    machine or Miner per recipe, Miners at 30 a minute) takes D2 34.7, D3 26.0, D4 26.7, D5 26.7 and
    the Governor 32.0 minutes; the 10-minute lines need 26 / 31 / 37 / 41 / 43 machines. With 40
    Ember Cores the Governor was 251 machine-minutes of work against D5's 288, so the finale asked
    for less than the act before it. 60 Ember Cores make it 296 without moving its first chain
    (the Attuner stays the bottleneck at 32 minutes) or pushing its line past 45 machines.
    (Amended by #67 and #69: D2 takes 20.7 minutes and is exempt; the lines are 19 / 31 / 38 / 42 /
    44 machines, and the Governor is 305.3 machine-minutes.)
53. **Three save slots, and test sessions never save.** The title screen lists three operations:
    click one to continue it or to start a new one in an empty slot; a small x erases one after a
    confirm. The last slot played is remembered. An imported save goes into the first empty slot
    (or, if all are full, replaces the current one after a confirm); before, it saved the running
    game and then wrote the import over it in the same slot. Scenario (`?scenario=`) and screenshot
    sessions never write to a slot, so testing a scenario can't overwrite a player's operation.
    (Amended by #81: a failed load or save is never silent, and never costs the slot.)
54. **From the Act I bot on the review-1 rules.** The efficient bot reaches D1 at 12:58 with no
    deadlock or rush (M1 0:17, M2 1:10, M3 3:11, M4 4:28, M5 10:09); the starter-line-only run at
    16:43; the careless run at 15:25. (Amended by #68, which has the times on the review-2 rules,
    #78, which refines the drag rule, and #92 and #93, which widen Mags's warning.) Changes:
    - **A belt drag never re-routes a working line.** Where a dragged belt crosses a belt running
      the other way it lays a Crossing; where the drag starts, ends or turns on a belt it leaves
      that belt alone (so a line ending at a belt side-loads into it); a drag never replaces a
      splitter, sorter, crossing or other logistics piece (`Game.planDrag`). A single placement
      still replaces. The careless bot's drag across the starter lane used to turn it north and
      send the terminal's ingots into the HQ for three minutes.
    - **Jammed.** A belt stuck against a machine that will never take its item (or pushing into
      its front) turns "Waiting for input" into "Jammed", and the inspector names the item and
      why. A wrong ingot at the Assembler's brick input stopped Act I for good in one bot run,
      while the status said it was waiting.
    - **Build next.** A planned ghost can move to the front of its depot's queue: the bot's
      Assembler waited 252 s behind belt ghosts.
    - **Mags warns when a depot runs dry.** A ghost waiting a minute on an item no delivery has
      brought in for a minute gets one radio line (at most every 3 minutes per item) with the
      fix for that layer: the careless bot sat out of gears for three minutes, and the efficient
      one ends Act I with none in the HQ for the Shallows' default request.
    - Rushed buildings now count in the per-ore and per-layer build stats.
    - **Act I stays as tuned.** The bot plays with no reading or placing time, so landing two
      minutes under the 15-minute floor is expected; the band is for people. The test holds the
      efficient bot under the 25-minute ceiling.

## Review 1 verify pass (2026-10-30)

Entries 55–63 come from checking the docs against the build once review 1 was in: where the two
disagreed, one side was settled and the other fixed, and the renderer got the fixes below.

55. **No Chorus vent on the Magma Shelf; the hidden basic deposits stay.** The Magma Shelf's hidden
    fourth Chorus Crystal vent is gone: it lifted the cap #27 set with three vents. Chorus stays at
    90 a minute from the Crystal Depths' three vents, so circuits, batteries and cores still compete
    for it in Act V. The other hidden deposits of older layers' ores
    below the Shallows stay on purpose: copper on the Fungal Caverns, the Magma Shelf and the Alien
    Strata; iron on the Crystal Depths and the Alien Strata; coal on the Fungal Caverns and the
    Crystal Depths; Sapstone on the Crystal Depths. Each one is a choice paid for with a survey and
    digging: keep spending cab capacity on basics hauled down the elevators (#21, #22), or dig out
    a local supply. The ores that belong to one layer stay there: Glowcap on the Fungal Caverns,
    Chorus Crystal on the Crystal Depths, Emberite on the Magma Shelf, Thrumstone on the Alien
    Strata. (Amended by #67: the three vents are poor, 45 a minute in all.)
56. **Canonical sprite names; the layer data owns decor.** Deposits are `d_<ore id>_<1-3>` with the
    item ids in `ORE_LIST` (`src/sim/mapgen.ts`, the same list as `DEPOSIT_ORES` in
    `scripts/art/lib.ts`): iron_ore, copper_ore, stone, coal, sapstone, glowcap, chorus_crystal,
    emberite, thrumstone. Decor names are exactly each layer's `decor` list in `src/data/layers.ts`
    (5, 4, 4, 3, 3 and 3 names): map decor value v draws `LAYERS[layer].decor[v - 1]`, and value 99
    (`AMBER_DECOR`) draws `x_l1_amber` (`AMBER_SPRITE`). STYLE named deposits by short ore names
    (`d_iron_1`) and the amber rock `x_1_amber`, the fallback art drew four decor per layer under
    other names (`x_0_flag`, `x_1_cart`), and the map stored the amber rock as decor 5 of a
    four-name list, so art made to STYLE's names would never have been drawn. One list, in the
    data, is the source of truth; version 1 saves move the amber rock to 99 and clear decor values
    past a layer's list.
57. **The Sequencer unlocks with the Thrumstone assay.** It used to unlock with the first Engine
    Glass. Engine Glass needs an Attuner on awake conduit, and conduit only wakes once the Waking
    Node has made a Heartstone, so the Sequencer arrived after the one feeding job it was made for:
    the Waking Node's strict Battery, Resonant Core alternation (#30). Now it comes with milestone
    27, before Wake the Engine, so two Unloaders at the depot and a Sequencer can feed the node (a
    fair belt merge still works too). The first Engine Glass unlocks nothing now; it only shows its
    card. Amends #41. (The Field Manual's unlock lists caught up in #87.)
58. **The whole Engine wakes at the ending.** When the Governor is delivered, every conduit tile
    wakes for good (`conduitLive` becomes `conduit` on every layer) and the light maps are rebuilt. A
    node only wakes conduit within 15 tiles of itself (#30), so stretches of the Alien Strata's
    lines stayed dormant after all three nodes ran, through an ending that PLAN §2 says lights
    every conduit. The renderer faked it by drawing them lit, so lit glass gave no light and powered
    nothing. Now the glass, the light map and the conduit pool agree.
59. **Renderer fixes from the verify pass.** Awake conduit glass, drawn a second time above the
    darkness so it glows, is never drawn over a building: it hid the Attuners standing on it. The
    interference overlay draws what PLAN §5.10 promised: a dotted `#df84a5` ring 2 tiles out around
    a hovered, selected or placing sensitive machine, tap or noisy machine, and a dotted `#a8b5b2`
    rectangle where a Shield Wall blocks a pair (the sim records blocked pairs in
    `Building.shielded`). Tap arcs are `#a4dddb` with an `#ebede9` highlight instead of lime, which
    is the Fungal Caverns' accent and the valid-ghost colour. The hazard overlays (spores, heat, interference) draw after
    the darkness: under it an unlit cave dimmed them to a third or less, and that is where a player
    reads them to decide where to build. (Amended by #82: the ring shows from the Crystal Depths
    on, around taps too, and the glass is cut out around items.)
60. **Dull decor; family accents stay unique.** Decor uses its layer's terrain ramp only: no glow,
    no ore or hazard colours, and at most one muted non-ore accent per layer. The diagonal hazard
    stripes belong to the Extraction family alone: Company sprites and the Engine Node never use
    them. The code-drawn fallbacks had drifted from art #7 and #10: crystal props in the full
    chorus ramp, an ember rock and a vent glowing in magma colours, spore pods with lime pores,
    glass shards in engine-glass teal, and hazard stripes on the Depot, Terminal, Elevator station
    and Company Chute. Decor read as resources again, and a Miner as a Company building (#47).
    (Amended by #83: decor from the data, one muted accent per layer, the families' fixes.)
61. **Front chutes only where something comes out of the front.** A chute says "items leave here".
    Machines, miners, collectors, elevator stations and Engine Nodes get one at their output port.
    The Combustion Generator (no item output; it takes fuel on every face) and the Thermal Extractor
    (its only item, Slag, leaves its side) don't: their front chutes invited a belt that would never
    carry anything. The Thermal Extractor keeps its side chute, which still shows its facing; a
    generator's facing doesn't matter. Amends #5 and #42. (Clarified by #82: chutes come from the
    recipe data.)
62. **Jammed has its own status and icon.** A machine whose input belt holds an item it never takes,
    or that is fed through its front, shows Jammed: a `#da863e` `≠` over it, and the inspector names
    the item and why (#54). It used to show ○ no input, which means "wait", while the line had
    stopped for good: a wrong ingot at the Assembler's brick input stopped Act I in one bot run
    while the status said it was waiting. Jammed means "fix it", so it gets a shape of its own.
63. **The Merger's dead code is gone.** #42 cut the Merger, but its building kind and belt logic
    (`buildings.ts`, `logistics.ts`), its belt-piece tile (`belts.ts`) and its fallback sprite
    (`fallback.ts`) stayed in the code. They are removed, so nothing can place or draw one, and a
    save that still holds a Merger loads without it.

## Review 2 (2026-10-30)

Entries 64–76 fold in the second review. The indie critic played the build headless through every
layer's scenario (cited as critic-2 C1 to C13); a skeptic checked each finding against the code, all
13 were real, and the owner accepted every one, taking the skeptic's correction wherever it
disagreed with the proposed fix. A code review of the review-1 changes (cited as code-2 and the
finding's id) confirmed 30 defects and rejected 3: entries 77–81 group its fixes and record the
rejections. Entries 82–86 record the renderer and code-drawn art passes and the PixelLab art run
that went in alongside, 87 the fixes from checking review 2 once it was built, 88 the UI pass that
went in with them, and 89 the fixes from checking that pass. The reports and the owner's calls are
in `docs/reviews/review-2/` (`critic.md`, `code-review.md`, `decisions.md`).

64. **Requests: any stable, cool good you have made.** A depot can request any item this save has
    produced, delivered or holds in any depot, except an unstable or hot one (the Overcharged
    Crystal, the Molten Ember Ingot). One function decides (`requestableItems` in
    `src/sim/elevator.ts`), so the inspector and the tests agree. The Add row lists the goods by
    home layer, deepest first, two rows of seven with the rest behind a toggle. Requests used to
    cover only the 14 goods some building costs, and nothing said so: milestone 28's hint ("Ask the
    depot to keep them in stock") couldn't be followed for Resonant Cores, which had to be belted
    about 68 tiles across the Magma Shelf; fuel couldn't be requested, though the cab's decision is
    construction stock, fuel or product; nor could copper ingots, though #21 counts on shipping
    ingots instead of wire, nor Reinforced Plate, a Mk2 upgrade good. Now requests carry any good
    down the stack, and belts into a top station push cargo down without going through a depot
    (volume, and goods you would rather not stock). The cab stays the shared limit, so the question
    is no longer what may be requested but what is worth the cab (critic-2 C1). Amends #22, #6
    and #7.
65. **Requests are served in turn.** The cab loads requested items round-robin in ITEMS order,
    starting after the last item it served (`Shaft.reqLast`, saved; older saves start from none), so
    300 wire and 40 plates alternate. It used to serve the biggest shortfall first: with 300 Copper
    Wire requested at the Crystal Depths, no Iron Plate reached that depot for 7 minutes, nor the
    Fungal depot that relays it for 5, and a planned Assembler short of 10 plates waited 464.5 s.
    Meanwhile Mags told the player to raise a request that already existed, and called the depot
    "The The Crystal Depths depot". Her starvation line now names the real cause: nothing requested,
    the request already met, nothing spare above, or "The elevator is full of other requests (300
    Copper Wire queued): lower that request, upgrade the shaft, or Rush the plan." The HQ keeps its
    "out of Gear" wording (critic-2 C2). Amends #22. (Amended by #93: no elevator advice for a good
    no depot above holds or makes.)
66. **The cab shows its load.** Each shaft counts what its cab loaded over the last minute (in the
    sim, 60 one-second buckets, not saved: a reload starts the count again). A station's inspector
    shows "Down 44/45 a min (requests 30, belts 14)" and "Up 3/45 a min" on two lines (the UI font
    has no middle dot), amber at 90% or more; "Requested below" shows on the top station only, where
    the cab loads, and arrivals read "Arrived, waiting to come out". The Stack badge shows each
    shaft's tier and live rate down. Request rows show stock/target, and "none spare above" in coral
    when the depot above has none to give; Shift-click moves a row by 50 and the wheel by 10; an
    underground planned ghost has Request the missing goods (up to 400); depot stock lists four to a
    row. Before, the inspector printed a fixed "45 items/min" and the Stack a fixed "45/m", "36 items
    to haul" showed while the cab sat idle because the depot above had none, and reaching 300 took
    28 clicks, so the decision the cab exists for read as "things are slow". The critic's test that
    printed each project's shaft imports was dropped: it would assert nothing, and imports depend on
    what a layer makes locally, which the pacing test doesn't model (critic-2 C3).
67. **Chorus Crystal: poor vents and a fast Charge Grit.** The three Crystal Depths vents are poor,
    15 a minute each and 45 in all, and Charge Grit takes 2 s (was 4). Per 60 powder a minute, the
    rich route (cut, charge, crush) takes 8 machines, 4 of them sensitive, and 30 crystal a minute;
    the cheap route (crush, charge grit) now takes 6 machines, 2 sensitive, and 60 crystal. Before,
    the cheap route needed as many machines and sensitive machines as the rich one plus twice the
    crystal, so the rich route was never worse, and three 30-a-minute vents never ran short (a
    10-minute D4 line needs 36 crystal a minute on the rich route, 56 on the cheap one). Now crystal
    binds: a 10-minute D4 line needs all three vents on the rich route and can't run on the cheap
    one, and over D4's first chain the cheap route needs about 21 a minute (560 in all, against 360
    on the rich route), more than the start-pocket vent's 15. So the rich route opens the layer, and
    the cheap route saves machines later, when crystal is slack (D5, the Governor). The critic had
    the arc the other way round, start cheap and switch to rich; the skeptic's numbers showed the
    rich route is the forced opener. The pacing test mines Chorus at 15 a minute: D4's first chain
    stays 26.7 minutes, and the 10-minute lines become D4 38, D5 42 and the Governor 44 machines
    (287.7, 293.3 and 305.3 machine-minutes) (critic-2 C4). Amends #27 and #55.
68. **The first minute shows the lesson.** The starter line starts running: ore on the belts into
    the Smelter, an ingot on every other belt after it and two in the Smelter's output, so the first
    sale lands about a second in; it came at 16 s and was worth $3. A 30-second prewarm was
    rejected: it would add 1,800 ticks to every `Game.create`, shift every test and bot, and still
    leave most belts empty. The top bar gets a depot strip for the current layer: up to six goods
    with counts (the HQ's plate, gear, wire and brick, or an underground depot's requested goods),
    plus in coral what the oldest planned ghost lacks, and a rise flashes "+N". The HQ's count, the
    lesson #38 was built around, only showed if you clicked the HQ. The camera opens at (22, 19.25)
    tiles, so the Drill and the Terminal both show at 1280×720 (the Drill sat under the top bar and
    Mags's box covered the Miner), and the first step reads "Click the Drill" (it was cut to "Click
    the Drill to see what it n."). The Act I bot on these rules: efficient D1 at 12:40 (first sale
    0:01, first building 0:06), starter-only 16:17, careless 15:07, against 12:58, 16:43 and 15:25
    (critic-2 C5). Amends #38 and #54.
69. **D2 is the second tutorial.** D2 asks for 100 Steel Beam, 30 Motor and 50 Drill Bit (was 160,
    60 and 80): a 20.7-minute first chain (was 34.7), a 19-machine 10-minute line and 113
    machine-minutes, half of D3's 225.7, so the work still rises project to project. Like D1 it is
    exempt from the 25–35-minute and 24–45-machine bands, and the pacing test holds its first chain
    to 22 minutes or less instead. At the old size D2's first chain alone was longer than Act II's
    whole 20–30-minute band, so an unscaled Act II ran past 40 minutes and Act III, with Sapstone,
    began 55–70 minutes in: the lateness #40 was written to fix (critic-2 C6). Amends #32 and #52.
70. **Elevator upgrades are paid from both ends.** Each upgrade good comes from the lower depot
    first and the rest from the upper depot (`upgradeQuote`). The button lists every good as need
    (below + above), greys out when the two depots together can't pay, and its tooltip says which
    depot pays what. Paid from the upper depot alone, an upgrade often asked a layer for goods it
    can't make: the Surface has no coal for the first Mk2's 30 Steel Beam; Reinforced Plate couldn't
    be requested (#64); the Fungal–Crystal Mk3's Batteries and Circuits are made on the Crystal
    Depths and, after the cab brought them up, had to be belted about 72 tiles to the Fungal depot;
    and the button showed only its price. Requests already deliver to the lower depot, so that is
    where the goods usually are. Goods made deeper than both depots still ride up by cab: that
    return trip stays the puzzle #18 made it (critic-2 C7). Amends #18 and #21.
71. **The Engine wakes ring by ring.** Each Heartstone a node makes wakes its conduit out to the
    next of five rings. Ring 1 reaches 1 tile past the node's nearest conduit outside its own
    footprint, so the first Heartstone always lights something you can see; each later ring reaches
    3 tiles further, and the last at least 15 (5/8/11/14/17 tiles for the Waking Node). A node is
    awake (its pool, its label, `all_nodes_awake`) from its first ring. Each ring plays the pulse
    and a burst along the tiles it lit; Mags speaks on the first ring only. Milestone 28 asks for 5
    Heartstones, a full wake: 10 Batteries and 10 Resonant Cores at the Waking Node. Any item a node
    doesn't take in turn comes out of its side, cooled if it was hot; an unstable one is refused.
    The node inspector says "Output full: belt the Heartstones away" and "Side chute full: belt the
    wrong items away (east face)" in coral. Before, 4 items and about 10.7 s woke 57 of the layer's
    195 conduit tiles for good, from a crate that already held 6 Batteries, so the Engine was a gate
    and not a problem; a node refused any item outside its pair instead of pushing it out
    (code-2 F4), a full side chute stopped it with no sign, and the inspector said "the left side"
    on a south-facing node, whose left is east. The critic's 3/6/9/12/15 rings would have lit
    nothing on the first ring: the Waking Node's nearest conduit is 4 tiles from its centre
    (critic-2 C8). Amends #30.
72. **Lower stations can't turn.** `Game.rotate` refuses a lower station (the button and R alike),
    its inspector has no action row, R over one says "A lower station always faces its depot", and
    loading a save turns any that were turned back to face their depot. One turn stopped the shaft
    both ways for good (the cab couldn't unload, so it never loaded again), and with a Chute at the
    new face the HQ drained from 500 Gears to 410 in two minutes while the request never filled. The
    top station still turns, because it picks the face up-cargo comes out of, and its inspector
    warns when nothing takes that cargo ("Up-cargo blocked: nothing takes it at the south face")
    (critic-2 C9, code-2 lower-station-rotate). Clarifies #18.
73. **The conduit pool is shared.** Each awake node adds 60 kW to its layer's conduit pool (was
    150), and an Attuner draws 30 kW (was 20), so one awake node runs exactly two Attuners. The
    Governor's 240 Engine Glass (120, plus 2 in each of its 60 Heartstones) is 32 Attuner-minutes:
    16 minutes on one node's pool, 5.3 on three, so waking the other nodes is how Engine Glass
    scales, and a Precision Assembler parked on conduit (50 kW) slows it. One Attuner still runs at
    full speed, so the Governor's first chain stays 32 minutes. At 150 kW one node ran seven
    Attuners and three gave 450 kW nothing used, so what stood on the conduit never cost anything
    and Thrumstone made no factory decision. Mags still announces it as a gift: "60 kW of the
    mountain's own power, enough for two Attuners and free to anything standing on them"
    (critic-2 C10). Amends #30.
74. **Per-layer request lists, and a floor for the HQ.** Each layer's opening requests live in
    `src/data/layers.ts`, matched to what that layer imports (PLAN §5.6 has the table): the four
    basics on the Shallows, 80 Copper Wire, 30 Steel Beam and 20 Cobalt Ingot ahead of a few basics
    on the Crystal Depths, Batteries, Resonant Cores and Heat Shields on the Alien Strata. The HQ
    gets "Keep for the Surface" rows that only act as a floor the elevator never takes it below:
    Iron Plate 20, Gear 10, Copper Wire 10. That is half the critic's 40/20/20, because the Act I
    bot ends with almost no gears in the HQ and a bigger floor would starve early Act II. Building
    on the Surface can still spend below it, and saves from before keep no floor. Before, the cab
    took the HQ from 30 Iron Plate to 1 in a minute while its own Press kept refilling it, and every
    layer opened asking for the same plate, gear, wire and brick, brick included on the Crystal
    Depths, which barely uses it (critic-2 C11). Amends #22. (Amended by #97: Insulation 20 on the
    Crystal Depths, Iron Plate 60 on the Alien Strata.)
75. **Contracts can be delivered at a Chute.** A contract counts items belted into any Company Chute
    as well as the Terminal, and on completion pays round(pay × (Terminal items + 0.6 × Chute
    items) / count): full pay for a Terminal delivery, 60% for an all-Chute one, in proportion for a
    mix. Contract items don't also sell for the Chute's 60%, and a Chute delivery raises the same
    contract toast. Paying in proportion closes a gap in the critic's version, where paying 60% or
    100% by where the last item landed would let a player send all but one through a Chute and the
    last to the Terminal for full pay. Checked over 10,953 offer and Chute-share combinations: every
    payout is a whole number, never above full pay and never below 60% of it. Through a Chute a
    contract pays at most 0.6 × 2.5 = 1.5× the goods' value, under the 3× Rush price, so #36's cap
    holds. Once the Magma Shelf is open, 10 of the 19 contract templates are for Fungal-or-deeper
    goods, and reaching the Terminal meant 55–72 more belt tiles on each layer in between, so deep
    contracts were offers nobody took (critic-2 C12). Reverses the part of #37 that kept contracts
    at the Terminal; the Terminal keeps its full price.
76. **Text that says what the game does.** Lock texts come from the milestone that grants the
    license (the Sorter's named milestone 4; Wire and Gears is milestone 3). The Express Belt reads
    "180/min, twice a conveyor." (the old line ran under its price button), and the planned status
    "Planned: waiting for goods" (the old one ran 30 px past the inspector). Step labels are
    shortened until they fit: generated ones leave out the count that shows beside them and use
    short item names, and two tests (`tests/labels.test.ts`, `tests/ui-labels.test.ts`) measure
    every label with the UI font against the room the HUD gives it, which the critic's single 158 px
    limit didn't match. $/min counts Terminal and Chute sales and contract pay, not milestone
    rewards (it read +$3,003 a minute just after Act VI's assay). The build tooltip sits beside the
    ghost's footprint, above and to the right, not over it (critic-2 C13).
77. **Refunds never create or destroy goods.** Everything going into a depot passes one rule
    (`depotItem`): a hot item arrives Cooled and an unstable one is lost. Removing a building
    refunds its cost (less goods a Rush paid for), its contents and the inputs of an unfinished
    craft; changing a recipe refunds them too, and a machine that loses its footing mid-craft (hot
    ground, awake conduit) gets them back in its input buffer. A burn in progress is not refunded:
    a Thermal Extractor's Emberite is fuel already spent (the owner's call). A swap counts the old
    piece's refund less its rushed goods. Before, removing a machine mid-craft destroyed the inputs
    it had taken, against the help's "Nothing you build is ever destroyed"; refunded Molten Ember
    Ingots entered the depot hot; and a swap onto a rushed piece passed on credit and drove the
    depot negative (code-2 remove-mid-craft-loses-inputs, remove-refunds-hot-ingot, F7, F8,
    swap-over-rushed-negative-stock). Pre-placed buildings (the starter line, each layer's rig)
    refund their full cost, though nothing was paid for them: removing one turns a gift into goods
    of the same construction value once, with no loop and no path from money to goods (#35's
    concern), and a running line is worth more than its refund (code-2 gift-buildings-refund,
    rejected). Amends #48.
78. **Placement: drags, crossings, foundations, walls, pause and surveys.** Amends #48 and #54 and
    clarifies #51:
    - **Crossings first.** A belt drag lays its Crossings before its plain belts, so they get the
      depot's goods first. The preview runs the same plan against a running stock, so it shows
      exactly what the release will lay, and every piece the drag refuses is said ("Crossing not
      laid: ...", "3 not placed: ..."). An unpaid swap is refused only over a built piece; over a
      planned ghost the new piece waits as a ghost, so a Crossing can be planned across a planned
      line. Before, a Crossing could never be planned, and a drag that ran out of goods before its
      crossing dropped it without a word, so the new line side-loaded into the one it was meant to
      cross (code-2 crossing-never-planned).
    - **Ends and turns first.** Where a drag starts, ends or turns on a belt, that belt is left
      alone unless the drag runs along its line. The along-the-line test used to come first, so a
      drag starting on a line's turning belt re-laid it backwards and cut the line
      (code-2 drag-turn-cuts-line).
    - **Foundations.** A Foundation is paid on the spot or refused ("Foundations can't be planned:
      the depot needs ..."). One the depot couldn't pay for was shown as planned by the preview,
      the tooltip and the toast, and never built (code-2 foundation-fake-planned).
    - **Walls.** A planned Shield Wall blocks nothing. A ghost wall used to block interference and
      complete Quiet Please ($1,500) without a wall ever being built (code-2 F3).
    - **Pause.** Only machines, miners and collectors pause, and a paused machine finishes its
      craft. A paused generator, filter, lab or tap kept running under the Paused badge
      (code-2 pause-non-machines).
    - **Surveys** charge only when they reach unsurveyed cells: a click beside the map cost
      $300–$1,000 for nothing (code-2 survey-off-map).
    - **Rejected:** a dragged Crossing over an Express or Insulated line is a plain conveyor-speed
      crossing, as a hand-placed one is. The rules define the Crossing that way and the release
      says it laid one; an express or insulated crossing would be a new piece, not a fix
      (code-2 plain-crossing-on-express-insulated).
79. **The elevator can't freeze on its arrivals; requests take half a cab, rounded down.**
    Clarifies #22:
    - **Arrivals.** A lower station hands its depot the first arrival the depot will take, so one
      item the depot is full of can't hold up the rest, and goods for an item the lower depot holds
      999 of wait at the top (finished by #87); the station's inspector names a stall. Before,
      arrivals left strictly head first: one item the lower depot was full of, or nothing at the
      top station's output, froze the shaft both ways for good, and the frozen goods counted as on
      their way, so the requests behind them never refilled
      (code-2 arrivals-head-of-line-freeze). The top station still puts up-cargo out in arrival
      order.
    - **Half a cab.** Requests take up to half the cab, rounded down, before belt cargo: 3 of 6,
      4 of 9, 7 of 15. The code rounded up (5 of 9, 8 of 15) against #22's "up to half"
      (code-2 half-cab-ceil). The depot's tooltip now says that requested goods load first, up to
      half of each cab, and that room belt cargo leaves goes to more requests; it promised a cap
      the sim doesn't have (code-2 tooltip-half-cab).
80. **Belts take turns only at real ports; the Chute takes any side.**
    - **Fair merges.** A belt counts a building beside it as one of its inputs only at the tile the
      building pushes into, its output or side port. A machine used to count as waiting for every
      belt tile along its front, so a line leaving a port along the machine's own face deadlocked
      for good and a line passing a backed-up machine stopped; and a side output was never counted,
      so a Separator or Thermal Extractor stopped once its byproduct backed up on a busy belt
      (code-2 F1, F2).
    - **The Chute** takes items from any side and has no Rotate. It had a hidden front that refused
      items and reported nothing, so a Chute placed facing its belt stopped the line silently
      (code-2 F5).
    - **Miner purity** is read from the best ore tile under the Miner, as the sim mines. The
      inspector read the top-left tile and could say "poor" over a normal deposit (code-2 F9).
    - **Engine Nodes** push wrong items out of their side (#71, code-2 F4).
    - **Rejected:** a node emits its Heartstone on accepting the fourth item, before that item's
      2 s, so the first Heartstone comes after 6 s, not 8. The 2 s lock after each item still runs,
      so a fed node makes one every 8 s (7.5 a minute), as #30 says; only the first is 2 s early,
      and delaying it would mean saving a pending Heartstone for a difference nobody can see
      (code-2 F6).
81. **Saves are never lost silently, and the UI fits its panels.** Amends #53:
    - **Failed loads.** A save that fails to load is never overwritten: the slot opens a load-error
      dialog that can export the raw save. Before, the game started a new operation in that slot
      without a word, and the next autosave wrote over the unloadable one
      (code-2 F2-failed-load-overwrites-slot).
    - **Scenarios.** Cancelling an import's "Replace operation N?" leaves a scenario session a
      scenario, so it never saves; it used to save over the last operation played, against #53
      (code-2 F1-import-cancel-scenario-saves).
    - **Failed saves.** Every save checks its result: the autosave, tab hide, page close and Save
      and quit (`trySave`). A failure opens a save-failed dialog; before, only the menu's Save now
      reported one, and Save and quit left anyway (code-2 F7-silent-save-failure-on-quit).
    - **Save version 3** repairs older saves on load: lower stations face their depot again, pause
      flags come off buildings that can't pause, and contracts get a Chute count of 0.
    - **Panels take the mouse.** The world ignores the mouse over a panel (hover, ghosts, world
      tooltips, the wheel), and R and Q over the inspector act on the building it shows. They used
      to act on whatever lay under the panel (code-2 F3-hover-through-ui-panels).
    - **The inspector** measures its content before drawing it and scrolls when it is taller than
      the screen. Fixed heights per building kind put text under the action row, and on a
      late-game Sorter the visible Remove button set a filter
      (code-2 F4-inspector-height-cuts-content).
    - **The Field Manual** pages its Basics and Knowledge tabs: from the fifth assay on, the card
      the game opened the manual for was off the bottom (code-2 F5-knowledge-cards-cut-off).
    - **Smaller fixes.** The drill's ETA history resets with each game (it said "Not being fed yet"
      after a slot switch, code-2 F6-eta-history-survives-slot-switch); the power meter counts
      supply once (the Surface's 60 kW line read "0/120 kW", code-2 F8-power-meter-double-counts);
      the ghost's speed prediction includes spores (code-2 F9-ghost-prediction-ignores-spores); and
      four rule texts match the sim: the warm-ground forge rate, the cab's request share, the
      Sorter's milestone and a Miner's purity (code-2 F10-rule-texts-contradict-sim).
    - **Small calls made while building these:** the title screen's slots ignore the mouse under an
      open window; the depot strip gathers a count's rises for 0.6 s before it flashes "+N", and
      where a panel covers the space under the bar the count itself flashes instead; the tool help
      line counts as part of the build bar for the mouse.
82. **Renderer rules from folds 2 and 3.** Two passes over the review-1 verify list, each checked in
    screenshots. Amends #59 and clarifies #61:
    - **Tall decor is hidden, not re-sorted,** wherever its visible pixels would reach a building, a
      ghost or anything but open floor (`decorFits`, from each sprite's visible-pixel box,
      `spriteBox`). Drawn back to front by row, a crate stack still covered the Terminal on the
      first screen and a tall mushroom the Fungal elevator: decor is set dressing, and the building
      is what the player reads.
    - **Conduit glass** stays 1 px back from any standing building, built or planned, and is cut
      out around items hanging into its tile with `destination-out` on a 16 px scratch tile. The
      even-odd clip it replaced still drew the glass's highlight where two items overlapped, and the
      glass covered a Press's chute tip.
    - **The interference ring** and overlay show only once the Crystal Depths are open
      (`INTERFERENCE_LAYER`), so Acts I and II show no pink squares around machines that can't
      interfere yet. Taps get the ring too (it is what they collect from), live arcs are drawn once
      per pair, and each tap arc carries one travelling `#ebede9` pixel toward the tap.
    - **Chutes come from the recipe data:** a front chute if any recipe has outputs, a side chute
      if one has a side output, so #61's rule has no list to keep in step.
    - **Jammed** draws as #62 says: a `#da863e` `≠` on `#151d28` with an ink outline.
    - **Light spots** glow while a building works. Code-drawn sprites record theirs; atlas art
      brings the ones its recipe places on the lit lamp or window (atlas.json "lights", 29 building
      sprites so far). Art without any gets no glow rather than a misplaced one.
    - **Hard rock** is dithered in each layer's own dark tone and only darkened; below the Shallows
      the tone was the darkness tint `#090a14`, which no terrain may use.
    - **`willReadFrequently`** on the terrain cache canvas: every patch reads it back, and Chrome
      warned about it once the terrain sheets existed.
    - **`title_art`** is cut out of the atlas. The `title.png` the game asked for was never written,
      so the title fell back to code.
    - **A favicon,** 32×32 in Apollo colours (`public/favicon.png`): a cutaway mountain with its
      shaft and the Heart. The page had none, and the browser's request for one failed on every
      load.
83. **Code-drawn art: decor from the data, dull decor, unique family accents.** The fallback art
    (`src/render/fallback.ts`) still draws every sprite the atlas lacks, and everything before the
    art loads (#17), so it keeps the art's rules. Amends #60:
    - **Decor** comes from each layer's `decor` list (#56); 32 px props stand 24–28 px tall on the
      tile's bottom edge, and a name with no drawing gets dull pebbles in its layer's colours.
    - **Dull decor:** its layer's ramp plus at most one muted accent (L0 scrub green, L1 rusted
      iron, L2 moss, L3 blue-grey rock, L4 dull maroon, L5 none), and never the darkness tint
      `#090a14`: edges take the layer's darkest wall colour.
    - **Family accents stay unique.** Company buildings have flat yellow roofs, white stencils and
      plain steel walls; the Engine Node, Attuner and Heart are stone with pale aqua light in dark
      green glass; Chemistry glass never uses the Crystal blue `#73bed3`; the Separator has an
      amber window, the Precision Assembler a turntable, the Assay Lab a steel dome, the Sequencer
      an alien switch box, the generator an iron drum, and the crate is steel. Diagonal hazard
      stripes appear only on Extraction machines and the Drill, and glowing mouths sit on top faces,
      so south faces stay plain. Every light spot sits on its glow source.
    - The audits found decor in ore and hazard colours with `#090a14` outlines, cyan domes and
      diagonal bands on machines outside the Crystal family, and accents borrowed across families,
      so decor read as resources and machines as the wrong family (#47).
84. **Terrain: standard tilesets, not pro.** The L1 pilot set one pro tileset (15 generations)
    against three standard rolls (1 each). Pro inverted the values (a `#341c27` floor at 1.26:1
    against the darkness, under STYLE's 1.4:1), drew no lit lip and repeated a hatch every 16 px;
    the winning standard roll laid an umber `#7a4841` floor at 2.66:1. So all ten sets are
    standard, snapped to Apollo on import, fixed with free recolours where they missed
    (`terrain-fix.ts`, eight of the ten) and re-rolled at most once. Standard varies a lot from roll
    to roll, and when two terrains share colour words it gives both one fill, so the upper terrain
    gets different words. Terrain cost 33 generations, where the review-1 art plan set aside 153 in
    case pro won. Amends #46.
85. **Objects: one-direction objects, no map objects.** Amends #46:
    - **The one-direction route.** Items, deposits, decor, 1×1 buildings and 2×2 machines came
      from `create_1_direction_object`. The M1 pilot came back all Apollo with no partial alpha or
      baked shadow, and 14 of its 22 machines passed. Prompts describe the top surface, because
      upright subjects came back as front elevations with their glow on the south face; re-rolls
      are anchored on approved picks, and M1's picks were recoloured to their family accents for
      free.
    - **Items** came back about 14×14 in the first batch and were fitted to the 12×12 envelope for
      free (`itemfit.ts`) instead of being re-rolled.
    - **No style matching.** `create_map_object` inside a mock scene of approved art, #46's plan
      for the 3×3 buildings, the Drill and the Heart, only continued the background in three
      tries: the scene is style context, not a style match. So those came from
      `create_1_direction_object` at 48, 80 and 112 px, and the broken Drill and the awake Heart
      are free hand edits of the working Drill and the dormant Heart.
    - **Two items stay code-drawn.** `i_filter` and `i_resonant_core` failed both rolls (a cabbage,
      then a citrus slice; a multicolour mosaic), and the code-drawn square brass filter reads
      better.
    - **Belts and belt pieces** are always code-drawn: their rungs move in lockstep with the items
      on them.
    - **Mags and the title.** Mags is candidate 3 of 25 from `create_image_pro` at 48×48. The title
      is pixflux seed 31106 of six, with a dark navy sky behind the logo band: the logo's `#e8c170`
      reads at about 9.5:1 there, against 1.1–1.5:1 on the pale sky the plan asked for.
86. **The art director's redo, and the art follow-ups.** The art director judged the set in the
    running game: it "ships once a short list is fixed". The list cost one paid job, M3 (10
    generations: the Separator as a tank pair, with alternates for four more machines), and free
    recolours: glints on the Shallows deposits, cobalt shine, the five Crystal machines off the
    Alien aqua onto `#73bed3` and the Stabilizer's chamber pale cyan, the crate stack and minecart
    softened, the Terminal in company yellow with a `T` stencil, the Heat Shield in aggregate
    browns, glow colours off two props, and three Fungal floor variant sheets, because the Fungal
    floor came back one flat `#402751` (the renderer scatters them among the plain tiles, one in
    four; STYLE "Floor variety"). With the review-2 verify the code caught up: belts have a dark
    outer edge and a lit top on every rail, so a belt never sinks into its floor (the `#394a50`
    lane is close to four layers' floors); `art:coverage` counts decor and leaves out the belt
    pieces the game never asks the atlas for (144 of 146 names covered, the two code-drawn items
    missing); `title_art` is built at 320×180; and the Precision Assembler's and Assay Lab's atlas
    art lost the cyan glass domes that read as Crystal machines (polished steel and a pale-gold
    lamp; a warm company-yellow skylight). The run spent 157 of the 500 generations (3,900.1 used on
    the account, against the stop at 4,243.1), and the $2.00 credit is untouched. What is still
    open is in STYLE "Sprite status, as built". Amends #46.
87. **Fixes from the review-2 verify.** Checking review 2 once it was built found six problems in
    it, all fixed:
    - **S1.** A Foundation laid by a drag or a click counts as placed. It is a tile, not a
      building, so `place` returns nothing for it, and a drag that laid and paid for three was
      toasted "3 not placed: Can't build here" (a click, "Can't build here").
    - **S2.** Requested goods are held back while the lower depot holds 999 of the item, counting
      what is on its way and the top bay's cargo of it (`requestCandidates`). With the Surface
      shaft at Mk3 over a Mk1 shaft below it and 400 Iron Plate requested on four layers, the
      Shallows depot reached 999 at about 390 s, its arrivals filled and the cab sat at the bottom;
      if the deeper requests were lowered then, the shaft never moved again.
    - **S3.** Belt cargo waiting in the top bay for that reason is named at the top station, in
      coral ("Held: the Shallows depot holds 999 Iron Plate (12 waiting)"). It still takes bay
      room, and a bay full of it refused every belt with no reason shown.
    - **S4.** Ring 1 is measured from the node's nearest conduit outside its own footprint. The
      node at (36,24) stands on three conduit tiles, so its first ring lit only those, hidden under
      the node; its rings are now 3/6/9/12/15 tiles.
    - **S5.** A Heartstone whose ring lights nothing new raises no `node_awake` event, so no pulse,
      burst or toast: after the ending, or in a version 2 save, each later Heartstone announced
      "Conduit ring 2/5 awake" with nothing lit.
    - **S6.** The Field Manual lists the Attuner and the Sequencer under the Thrumstone assay and
      nothing under Engine Glass, as #57 has it; its unlock lists still had the old split. The
      Magma Shelf's wall colours are `#151d28 #10141f`, as STYLE has them. They were
      `#10141f #090a14`, and the Stack drew the layer's band in the second, the darkness tint.
88. **The HUD makes room for windows, and UI timers run on real time.** The UI half of the fix pass
    after review 2's verify, with two problems found while checking it (the timers and the toasts):
    - **Windows and HUD panels.** In a game a window keeps clear, whenever it fits, of the
      objectives column (it moves right, short of the Stack, `STACK_W`) and of the build bar with
      the room its tool help line takes (`barRoomTop`), so picking a tool never moves an open
      window. Each frame the app keeps the open window and the ending's card as `App.covers`
      (`overlayRects` in `windows.ts`), and a HUD panel still under one (the objectives, Mags's
      radio, the inspector, the help line) isn't drawn until it closes (`covered()` in `hud.ts`); a
      message waiting under a window keeps its unread time. The Company window fits its content.
      Before, a window's edge cut the panels under it mid-word, and the Company window was a fixed
      236 px with about 67 px of it empty on the Surface.
    - **Real-time UI timers.** Toasts, sale floats, the breakthrough card and Mags's auto-advance
      age by the frame's real seconds (`App.dt`, at most 0.1 s). They counted every frame as 1/60 s,
      so above 60 Hz they ran early: four times too fast at the 240 fps headless Chrome draws.
    - **Toasts** draw over windows and the inspector, so the answer to a click in a window is never
      hidden, and they fade over the last half second of their 4.5 s. They never faded: `ui.fill`
      reset the alpha.
    - **The ending.** While its text plays (the first 14 s, `endingTextShowing`) no HUD or inspector
      is drawn, only the paused label, so the text's band slices nothing. Open windows close when it
      starts, Mags's layer hints stop after it (the conduit hint was showing during it), the Heart's
      inspector says it is awake, and the thank-you card and its button fit their text ("Keep
      building (free play)" ran past a 120 px button).
    - **The title footer** sits on its own `#090a14` strip at 0.88, in `#a8b5b2` and `#819796`: the
      title art's pipe ran through the lines, and the version line was hard to read.
    - **A foundation drag that runs short** reports the whole shortfall ("8 not placed: the depot
      needs 15 more Aggregate for them"); it gave one tile's ("needs 1 more").
89. **Fixes from checking the fix pass.** Its verify found three wrong texts, a dark belt, three
    weak screenshots and stale docs; all are fixed:
    - **The Sequencer's panel** says which side it takes next, with the compass face ("Next from the
      left, west face" on a north-facing one), and its tooltip explains the turn. It said "Next from
      the right" on a fresh Sequencer, which takes the left first (PLAN §5.2).
    - **Held requests are told apart from none spare.** When the cab can load no request, the top
      station names the requests held back because the depot below is full ("The Shallows depot is
      full of Iron Plate: the cab holds that request back.", #87 S2) and keeps "None of it is spare
      in the HQ: stock it here." for goods with nothing spare above. It blamed the depot above even
      while that held 999. Held belt cargo reads "12 Iron Plate held: the Shallows depot is full of
      it (999 with what's on its way)": part of that 999 may still be in the cab, so "holds 999"
      overstated it. The Stack's traffic tooltip names held cargo too.
    - **The Engine Glass card** has no bare "Unlocks:" line now that it unlocks nothing (#57).
    - **The belt along awake conduit** sat in the 0.65 dither band, its rungs and direction lost:
      #99.
    - **Screenshots** (`e2e/shots.ts`, 25 now): `surface_build` shows a Miner ghost over the stone
      deposit with its tooltip (it picked the Assembler, still locked there, and showed nothing);
      `shallows_elevator` selects the Surface's top station, where "Requested below" draws; `magma`
      has every overlay off and `magma_heat` only heat (every overlay starts on, so the two
      matched); the new `alien_governor` shows the Heart's and the nodes' beacons (#95). A shot can
      set the overlays and put the mouse over a tile.
    - **Docs:** ROADMAP's Engine item still had the old rule (15 tiles, 150 kW, 20 kW Attuners),
      PLAN lacked the bay's share of the 999 hold and #87 S5's silent rings and said contracts pay
      from 1.5× (the templates run 1.7–2.5×), and the patch notes called Mags the foreman.

## Act bots (2026-10-30)

Entries 90–100 come from the act bots: scripted competent players (`tests/bot.ts`, `tests/play/`)
that played every act on the real map (seed 20261030) with player actions only, at real cost, Act II
from the real end of Act I and Acts III–VI from start states with stand-in supply for the acts
before. Every act finished, with no deadlock or rush in a competent run. Their report and the
owner's calls are in `docs/reviews/act-bots/` (`report.md`, `decisions.md`), cited as "bots <act>
<id>", where an act's friction list is "friction". The owner accepted nine game fixes, G1–G9
(#90–#98); #99 is the light over awake conduit that went in with them, and #100 records what stays
as it is. The bots' own harness fixes in `decisions.md` change tests, not the game.

90. **A tunnel opens a cavern where it meets it straight on (G1).** Digging a tile no longer lights
    a dark floor, water or magma tile it touches only at a corner. A straight-on open neighbour
    floods its whole cavern (`revealComponent`), as before, and so does a straight-on tile an older
    build lit on its own while its cavern stayed dark (`darkBeside`), which repairs saves made
    before. A corner touch used to light that one tile; the next dig that met it straight on found
    it already lit and never flooded the cavern, so the cavern stayed dark and the dig queue dropped
    every tile past it ("Nothing left that touches open floor"). On the real Shallows a 1-wide
    tunnel toward the bore site stopped at the hidden copper cavern with 8 tiles dug; it now digs
    all 9 queued and opens the cavern's 109 tiles, and the Act III route that stopped at (35,29)
    floods its cavern (bots II DIG-DIAG, bots III B1). Of the report's two fixes this is the one the
    owner chose: the cavern opens where the tunnel breaks into it, the contact digging itself needs
    (a queued tile digs only beside revealed open floor, straight on).
91. **A Drill or the Heart takes extras into the depot, and says Jammed when it can't (G2).** A
    Drill or the Heart accepts a project good it already has all of and stacks it in its layer's
    depot by the refund rule (`depotItem`, #77): a Molten ingot cools, an unstable good is lost. The
    extra counts as coming into that depot (the starved-ghost warning hears it), never toward the
    project: `delivered` stops at the need, and `project.surplus` counts the extras (saved; absent
    in older saves). The first extra of each good gets one toast, "The Drill has all its Gear; the
    crew stacks extras by the HQ" ("by the depot" below the Surface; "The Heart" for the Governor).
    A depot already holding 999 of it refuses the good, and a good the project never takes is
    refused too; either way the Drill or the Heart says Jammed (`noteJam` covers both now, with
    `jamWhy` 'full' or 'wrong'). The inspector lists each need as delivered/needed with its
    extras and where they went, leads with a coral "Jammed: ..." line when a belt is stuck (hovering
    the building in the world says the same, and the world shows the `≠` badge over it, the one
    status badge a fixed building wears), and warns when a finished good's depot is already
    full. Before, the Drill refused a good it had all of and showed Idle, so one shared trunk, the
    natural way to deliver a project's three or four goods, stopped for good behind the first spare;
    the bots avoided it only by counting every good on 42- to 73-tile trunks and inside the
    machines, which no player will do (bots II friction, bots III B2, bots IV B1, bots V
    drill-surplus). Stacking the extra keeps the trunk moving and costs nothing: money still can't
    buy drill goods, and only an unstable good is lost, as on any refund. **A known behaviour:** a
    depot Unloader feeding a Drill or the Heart keeps sending a good once its need is met and each
    extra goes straight back into the depot, so the good loops (1,371 Engine Glass round trips in
    the Act VI bot) and keeps the belt busy carrying nothing new; the need's tooltip in the
    inspector says to switch that Unloader off, and whether the game should stop the loop itself is
    open (ROADMAP Phase 6).
92. **Unloaders leave what planned buildings hold, and Mags names Unloaders that eat arrivals
    (G3).** A depot Unloader takes a good only while the depot holds more of it than the layer's
    waiting ghosts hold (every ghost's whole cost, the running sum `buildPlanned` and
    `requestMissing` count; `ghostHolds`, rebuilt whenever a ghost is placed, built, rushed or
    removed), so planned buildings are paid first. An Unloader on a lower station takes from the
    shaft's arrivals before they reach the depot, where that rule can't hold. So when a ghost has
    waited a minute, an Unloader took the good during the wait, and the depot's stock never reached
    the ghost's cost, Mags says so in place of "none is coming in": "The Shallows depot gets Gear,
    but Unloaders take it as it comes in. Your planned Press is waiting on it: turn them off until
    it is paid, or Rush the plan." Before, an Unloader took every unit as it arrived, and Mags
    stayed quiet because the good kept arriving: a Resonance Tap ghost waited 323 s for circuits
    until the bot rushed it, and a Thermal Extractor ghost was built at 12:20 instead of 02:21,
    which moved M24 from 04:47 to 12:24 (bots IV B2, bots V starve-silent; bots III and VI
    friction). The warning needs an Unloader to have taken the good, or a long queue of cheap ghosts
    using each arrival in turn would get the line falsely. **A risk to watch:** holds can stall a
    layer when a ghost waits on a good made there from an input a depot Unloader feeds and the
    ghosts hold more of that input than its request row lets the stock reach. Ten Resonance Tap
    ghosts hold 100 wire against an 80-wire row, so the wire Unloader stops, circuits stop and the
    taps never pay; Request the missing goods raises the row and clears it, but Mags only ever names
    the circuits. The bots never hit it. Amends #48.
93. **Mags says to make a good down here when no layer above has any (G4).** When a ghost starves
    for a good whose home layer is the ghost's own or deeper and no depot above holds any, Mags
    drops the request and stock-up advice and says how it is made (`howMade`: the first recipe for
    it the player can use, else the first there is): "The Magma Shelf depot is out of Heat Shield
    and none is coming in. Your planned Pressure Forge is waiting on it. Make it down here (an
    Assembler: Aggregate and Steel Beam), or Rush the plan." For a good only a deeper layer makes
    she says "Only a deeper layer makes it (...): send some up the shaft, or Rush the plan." Once a
    depot above holds some, the elevator advice comes back. She used to tell the player to request
    Filters, Batteries, Circuits and Heat Shields that no layer above makes or holds, a row that
    could never fill (bots III B3, bots IV B4, bots V mags-shield-advice). Amends #54 and #65.
94. **Changing an Unloader's filter gives back what it holds (G5).** Setting an Unloader to another
    good, or switching its filter off, returns the good it holds to its layer's depot as a refund
    and clears it, so the next item out is the new good. It pushed the old good on, so an Unloader
    re-used in front of a machine jammed that machine until the player picked it up and put it down
    again (bots IV B3).
95. **Beacons on the Heart and the sleeping nodes, and Mags's bearings (G6).** While the Governor is
    open (all of Act VI), the Heart shows the bore-site beacon through rock and darkness until its
    centre tile is revealed, and each Engine Node a dimmer amber marker until it wakes (its first
    Heartstone, `nodeAwake`); a node already in sight keeps only the ring, round its glass core, so
    the Waking Node is ringed when Act VI opens. They share the bore site's 1.67 s beat. When In
    Sequence (M30) and The Governor (M31) start, Mags adds where they are, by compass and whole
    tiles from the shaft's arrival, sleeping nodes only and nearest first (`MilestoneDef.locate`,
    `locateLine`): "The sleeping nodes are 26 tiles north-east and 43 tiles east of the shaft." and
    "The Heart lies 36 tiles east of the shaft." Nothing pointed at the Heart or the two far nodes:
    they sit in hidden caverns, the Alien Strata has no bore site, and a survey marks only ore, so a
    player would dig blind at $30 a tile (the bot dug to them from the map, bots VI HEART-HIDDEN).
    The layer still gets no `boreSite`: `placeFixed` would put a Drill on it.
96. **The Governor lands as a milestone before the ending (G7).** When the Heart has everything,
    `completeProject` first completes the unfinished milestone whose step is the Governor (with
    `finishMilestone`, which `checkMilestones` uses too): it joins `msDone` and its 'milestone'
    event plays the toast and sound, then the ending starts. `checkMilestones` stops once the game
    has ended, and the ending came first, so M31 never landed: no toast or sound, and a save showed
    the last milestone unfinished (bots VI M31-MSDONE). The Act VI bot now finishes M31 at 23:17.
    When an earlier Act VI milestone is still open (In Sequence, if the Heart is fed while a node
    sleeps), the ending lands every milestone from the open one through The Governor, in order, each
    with its reward and toast, and plays none of their intros; it used to land M31 alone, and the
    open one never landed.
97. **The Crystal Depths request Insulation; the Alien Strata keep 60 plates (G8).** The Crystal
    Depths open with Insulation 20 on their list: the Stabilizer costs 4 and every Resonant Core
    takes 1, and with no row a player waited a minute for Mags to mention it. The Alien Strata's
    Iron Plate row goes from 30 to 60: the lanes to the nodes and the Heart run to about 200 belt
    tiles, and 30 left them waiting as ghosts for minutes (bots IV friction, bots VI friction).
    Amends #74.
98. **Hints for what the rules leave out (G9).** Wake the Engine's hint (M28) adds "Belt the
    Heartstones away from its front: it holds only four." Keep It Hot's (M25) adds "but a hot line
    that backs up still cools: give it an overflow into the depot." At each breakthrough, when a
    belt or logistics piece (by its exits) or a machine, miner or collector (by its output port) fed
    the Drill and that cell is bare floor once the top station stands, Mags follows the Board's memo
    with "Your drill lines end where the Drill stood: belt them into the top station to send goods
    down, or into the depot." ("the HQ" on the Surface). The bots found each by failing: a node
    holds four Heartstones, so the fifth waits on a clear front; without an overflow the forge, ×2
    on hot ground, backs up the insulated line until an ingot cools and jams the Precision Assembler
    for good (0 Ember Cores in 16 minutes); and at D1 Act I's best lines pushed into empty floor
    with nothing saying they could feed the shaft (bots VI friction, bots V friction, bots II
    friction).
99. **Awake conduit gives real light (L1).** Awake conduit lights every other tile along it, the
    checkerboard ore and magma use, at radius 2.5 and strength 0.7 (`CONDUIT_LIGHT_R`,
    `CONDUIT_LIGHT` in `env.ts`); it was every third tile at 2 and 0.55. In the `alien_awake` setup
    all 36 corners of a belt laid along awake conduit now sit in the 0.35 band (16 did, and 20 sat
    in the 0.65 band), so its rungs and direction read, and the bare awake conduit's corners moved
    from mostly the 0.65 band (114 of 132) to mostly the 0.35 band (102); every corner still darker
    touches unrevealed rock. Dormant conduit gives no light. The fix pass's verify found the
    conveyor on awake conduit dithered so dark its rungs vanished (#89), and pillar 7 wants a
    thriving layer to look thriving. The awake glass reads lit now too, though with the PixelLab
    sheet it is still drawn under the darkness (the art director's open item).
100. **What the act bots found that stays as it is.** The owner kept four things (bots decisions,
     "Not changed"), and the PLAN §8 bands:
     - **Produce steps count from the milestone's start** (`msBase`): goods made earlier don't
       count, so the 14 motors made during Steel left Motors to take 2:37 more (bots II friction).
       It is how every milestone reads, "now make N"; build steps count what stands (#50).
     - **Money is never short for the bots** in Acts II, IV and VI (about $4,000 at the end of Act
       II, $14k unspent in Act IV, never below $6,007 in Act VI), against PLAN §8's "slightly short
       in the first 20 minutes". The bots never misplace, survey or dig more than they must; human
       playtests decide it (ROADMAP Phase 6).
     - **Wash or separate rarely bites,** because a depot takes resin up to 999: the Act III bot
       separated all 425 Sapstone, built no Washer and burned no resin (bots III friction). A known
       softness; capping a depot's resin was the alternative.
     - **Act VI is mostly waiting** on imports at the start state's stand-in rates (Resonant Cores
       at 5 a minute set about 23 minutes; the building is done by 5:53, bots VI friction). A real
       player scales the upstream lines.
     - **The PLAN §8 bands stay.** Every act's bot lands 15–42% under its floor (PLAN §8 has the
       table), because a bot spends no time reading, placing by hand, misplacing or fixing; Acts
       III–VI also run on stand-in supply, and in the report Act IV chained from the Act III bot
       took 35:39 against 30:54 from its start state. Act IV's report puts it plainly: setup plus a
       25–35-minute first chain only reaches the 40-minute floor with about 10 minutes of human
       overhead. Revisit the bands, and the projects, with people playing.

## Review 3 (2026-10-30)

Entries 101–120 fold in the third review, on the finished first version. Three reviewers played the
build headless: the indie critic (cited as review-3 K1 to K13), the art director in the running game
(review-3 A1 to A15) and visual QA with a performance pass (review-3 Q1 to Q11). Their verdicts were
"Ship with fixes", "Ship with fixes" and "Ship once a few fixes are in". A skeptic reproduced all 39
findings and the owner accepted every one; where the skeptic's notes on the fix corrected the
reviewer's fix, the notes won, and the owner's own calls won over both. One part was declined (K1's
third fix, in #101). The reports and the owner's calls are in `docs/reviews/review-3/` (`critic.md`,
`art.md`, `qa.md`, `decisions.md`).

101. **A belt into a station's front is a jam, and Mags says where the drill lines go (review-3
     K1).** At a breakthrough where belts fed the Drill, Mags now says "Up on the Surface your drill
     lines end where the Drill stood: belt them into a side of the top station (its front is the
     exit) or turn it with R, or belt them into the HQ." Deeper down it is "Up in the Shallows ..."
     and "... or belt them into the depot." (`drillLinesLine`, from each layer's `at`). A belt
     pushing into a station's front, the face its arrivals come out of, marks the station Jammed
     (`jamWhy` 'front') while it pushes and for half a second after (`JAM_FRESH`, 30 ticks). It gets
     the `≠` badge centred on its top edge, as the Drill does, and a coral line in its hover and at
     the top of its inspector: "A belt is pushing into the exit: feed a side face, or turn the
     station with R." A lower station never turns, so its line stops at "feed a side face." A side
     face that is only full for now (a full bay, a depot below holding 999 of the item, an unstable
     item) marks nothing, and a station's refusals never go through the recipe lookup, which would
     have called every one of them a wrong item. The old line sent players to "the top station" at
     the first breakthrough, but on the Surface the drill lines come from the south, where the
     station's whole front is: the Drill's footprint becomes a 3×3 station facing south, so every
     line that fed the Drill's south face at x 31–33 points at the exit (two of the Act I bot's
     three feeds do). A belt pushed in there just stopped, with no badge, hover text or message, and
     Mags spoke while the camera was already on the new layer, so she now says where. **Declined:**
     letting the front's two corner tiles take cargo, so that only the output tile refuses (the
     critic's third fix). The whole front stays the exit: one rule for every station (PLAN §5.5,
     "any face except its front"), R already turns a top station, and `insert()` has no entry cell
     to tell a corner from the centre. Amends #98's quote, and #62 and #91: a jammed station is the
     third fixed building with a badge.
102. **Direction reads once a thing is built (review-3 K2).** Two of the critic's three mistakes in
     the first 15 minutes came from facings and belt directions that can't be read at the default
     zoom. Four changes:
     - **Port brackets.** The hovered and the selected built building get the placement ghost's
       brackets on their port cells, `#e8c170` on the output and `#a8b5b2` on the side output
       (`drawPortMarks`). The ghost's brackets read at once; a built machine's facing didn't.
     - **A 2 px chute arrow.** The chute's arrow is an arrowhead in 2 px strokes: a 2 px tip
       standing proud of the body, 4 and 6 px rows, then two 2 px barbs either side of a 2 px notch.
       The chute stays 6×4, 3 px into the body and 1 px proud, and a side chute has the same shape
       in `#a8b5b2`. At zoom 2 the old arrow was a few pixels, and on the south-facing copper Miner
       the chute's `#202e37` merged with the sprite's dark edge.
     - **The conveyor's bow.** Rungs bow forward into a blunt `>`, 1 px over the middle 6 px of the
       lane and 2 px over the middle 4, always on, so no build-mode variant doubles the belt cache.
       The old 1 px bow was a 2 px kink at zoom 2. The critic's fix, the Express Belt's chevron at
       50% on plain conveyors in build mode, was refused: the chevron is the Express Belt's
       identity, and build mode is when players compare belt types.
     - **Head-on belts.** Two belts whose heads push into each other are both marked Jammed
       (`jamWhy` 'headon'): a `≠` in the middle of each tile, between the stuck item and the one
       behind it, and "These belts face each other: turn one with R." in the hover and the
       inspector. A backed-up line, a side-load into a full belt and a belt facing a planned ghost
       are no jam. At 5:31 the critic pressed R three times instead of once; the belt faced south
       into the brick line and stopped every brick for about 40 s while the Assembler said only
       "Waiting for input".
     Amends #47 (the output chute it specified) and #62. PLAN §9's "Later" no longer waits on belt
     direction arrows: the bow and the head-on badge show direction in 1.0.
103. **The ending is a sequence (review-3 K3, A6).** PLAN §2 promised the camera rising through
     every layer to the Surface at dawn, and ROADMAP ticked it, but completing the Governor gave a
     white fade and five lines of text over wherever the camera was, then the card, all timed on
     `s.endTime` (game time, so 2x halved it and Space froze it). In the ending scenario the text
     played over the Alien start pocket, 36 tiles from the Heart, which was never on screen (A6),
     and its line "all the way to the surface" couldn't be shown: only the Alien Strata has
     conduit (0 tiles on layers 0–4, 195 on layer 5). Now `src/app/ending.ts` plays it on real
     seconds (`App.dt`), about 33 s with all six layers:
     - **The Heart.** A white flash fades over 2.5 s while the camera pans from the player's view
       to the Heart (3 s) and holds on it (2.8 s) under its layer card. Rings of light swell out of
       its glass core on the beacons' 1.67 s beat, and light spreads out from it over the revealed
       cave (26 tiles over 1.8 s, to the darkness's middle band).
     - **The climb.** Then layer by layer to the Surface: 1.2 s rising through 96 px of rock
       (each layer's strata, the shaft's light running up the middle) and 2 s on each layer's lower
       station, the camera still drifting north, as the light spreads out from the shaft and the
       layer card gives the depth, the name and the layer's line. The elevator bell rings a step
       higher through A major as each layer comes up.
     - **Dawn.** The Surface comes up in the last of the night (a `#172038` tint), and over 2.6 s
       the dawn lifts it: a sky over the map's north edge, the sun coming up 8 tiles east of the old
       Drill site, and a warm `#e8c170` dither on the ground.
     - **The text and the card.** The five closing lines come one every 2 s over the dawn and the
       last holds 2.8 s. Then the thank-you card ("The Mountain Is Awake": operation time, money
       earned, items made, tiles dug, contracts) and the HUD come back, with the toasts of the
       milestones the ending landed (#96). "Keep building (free play)" puts the player's layer,
       zoom and cameras back unless they moved, and the dawn fades over 1.2 s.
     The camera uses the window's default zoom, so every size frames the same. The HUD (all but the
     paused label) and the inspector stay hidden throughout, the world takes no input, and Esc or a
     click skips to the card; Space and Tab still pause and speed the sim, which keeps running under
     it, and a blocking window left open (the menu, Settings, the save-failure dialog) holds the
     sequence's clock. It is presentation only: it renders its own views of the layers and writes
     nothing to the game. The hum goes to the Heart's layer once as it starts and nothing changes it
     during the climb, so the chord builds through the climb, its suspension resolves as the Surface
     comes up, and it is full by the text's end. A game loaded within 40 s of game time of the
     Governor's completion (`ENDING_REPLAY_S`: a save made during the ending, or the ending
     scenario) plays it from the start; one loaded later has seen it. K3 asked for each layer's
     conduits and lamps lit on the way up; with conduit only on the Alien Strata, that became the
     light spreading from each layer's shaft (lamps light as always). A6's fix, cutting to the Heart
     with a ring on the beacon beat, is the first beat. The `ending` shot now holds on the Heart,
     and a new `ending_climb` shot holds one frame of each beat (nine frames, the last after a click
     skips to the card) by seeking the sequence's clock (`App.seekEnding`, `Ending.at`): its old 6 s
     wait would land mid-sequence. Amends #88 (the HUD now steps aside for the whole sequence, not
     the first 14 s of text) and PLAN §2 and §5.14.
104. **Five build tabs, and nothing from a layer not reached yet (review-3 K4).** The build bar has a
     fifth tab, Strange (key 5), for the 13 machines each layer's own material brings: the Washer,
     Separator, Fungus Harvester, Spore Collector, Crystal Cutter, Crusher, Charger, Overcharger,
     Stabilizer, Cooling Bath, Pressure Forge, Precision Assembler and Attuner. Production keeps the
     Miner, Smelter, Press, Assembler and Foundry. A building whose unlock belongs to a layer deeper
     than the deepest reached is hidden (a license a milestone grants counts at that milestone's
     act), and an empty tab says "Nothing here yet: deeper layers bring more." No tab holds more
     than 13, so each is one row whenever the UI is 620 px wide or more, which the automatic scale
     keeps (#111). The bar's width and rows come from its widest tab at the deepest layer reached, so
     no button moves between tabs or layers: at 640 UI px the bar is 463 px wide from the Surface to
     the Crystal Depths, 567 at the Magma Shelf and 606 at the Alien Strata. From the Fungal Caverns
     on, Production had wrapped into two rows (14 buttons, 6 of them locked, then 17 and 18), so the
     bar took 89 of 360 UI px, about a quarter of the screen, and its centred width moved the
     buttons between tabs and layers, so a remembered click landed on another machine. **A teaser
     goes:** Production used to show locked machines up to one layer ahead on purpose. What a
     deeper layer brings now appears when you get there, and the Field Manual's Basics says its
     machines are on the Strange tab. The controls ("1–5") and the Field Manual's Controls page
     follow.
105. **The Engine's waking shows: veins, lit glass, dormant nodes (review-3 K5, A9, A10).**
     - **Veins (K5).** Awake conduit that the rock still hides, in unrevealed cells or under rock,
       is drawn above the darkness as a dim vein: 2 px of `#73bed3` (alpha about 0.30–0.55) with a
       1 px `#a4dddb` core (0.25–0.55), breathing on the beacons' 1.67 s beat, from each cell to
       every awake neighbour and on into a lit channel, so it meets the glass where the cave opens.
       Cells anything stands in are skipped, because alien machines in hidden caverns still occupy
       theirs. In the alien scenario 5 Heartstones woke 68 conduit tiles and 26 were drawn, and the
       ending scenario drew 21 of 195, so a toast said "21 tiles lit" while only a short line in the
       cave glowed, and the lit lines running toward the far nodes and the Heart couldn't guide
       anyone. Unrevealed tiles stay solid `#090a14` except beacons and these veins. Pulses rising
       above the darkness were left out: they would need a second particle pass.
     - **Lit glass (A9).** With the PixelLab conduit sheet, the glass pixels (`#a4dddb`, `#73bed3`,
       `#ebede9`) of revealed, awake floor conduit go into a layer-sized canvas that is cached and
       patched with the terrain (`conduitGlass`), and the emissive pass draws each cell from it
       before the pulse, under the same cut-outs. Only the 2×2 pulse used to be drawn above the
       darkness, so the glass read as matte paint: the open item #99 left. Saves from before #58,
       lit only by `ended`, still show dormant terrain glass (accepted).
     - **Dormant nodes (A10).** A sleeping Engine Node is drawn as a dormant recolour of its sprite,
       with the dormant conduit's colour map (`dormantCopy`, cached), until its first Heartstone or
       the ending. Its 100 px of aqua glass made it look awake while its inspector said it slept. A
       node being fed before its first Heartstone is active, so its light spot glows on the dark
       core and it reads as waking; its beacon still centres on that spot.
     Amends #47 (unrevealed is the tint at 1.0) and #99.
106. **The drill ETA and the top bar tell the truth (review-3 K6, K10).**
     - **ETA (K6).** The drill project's ETA is its slowest good's: each good's rate over the last
       120 s of game time (sampled every 2 s) gives its time to finish, and the longest wins,
       floored ("45 s", "1 min 23 s", "1 h 05 min"). A needed good with nothing delivered in that
       window shows its count in coral, and the line reads "No supply: Gear" ("No supply: Gear +2"
       when several don't fit its 162 px; any single good fits, the longest being Molten Ember Ingot
       at 150 px); hovering the row says none has arrived. "Timing the deliveries" shows for the
       first seconds. One pooled rate printed a short time while a good had no supply at all (D1 at
       11:25: "At this rate: 1 min 33 s" with Gear 0/30 and no gear line), and rounding printed
       "11 min 60 s". The proposed 60 s window is noisy for slow goods (Reinforced Plate at about 2
       a minute).
     - **Top bar (K10).** The layer label is the short name in capitals (SURFACE, SHALLOWS, FUNGAL,
       CRYSTAL, MAGMA, ALIEN), with the full name and depth in its hover, and the depot strip drops
       the well-stocked goods first, then goods below their request, what the plan lacks last,
       keeping the list's order. At 1280×720 the strip shows 5 goods on the Fungal Caverns and the
       Crystal Depths (it showed 2) and 6 on the Alien Strata (3). Below the Shallows the long name
       and the toggles had left room for 2–3 of 6–7 requested goods, a cost review 2's "drop items
       rather than overlap" never sized. One "Overlays" toggle would have saved about 10 px, and a
       second strip row would clash with the toasts.
     Amends #68 (the depot strip).
107. **A drag that starts on a line's straight run crosses it (review-3 K7).** A belt drag that
     starts on a working belt across its path, and goes on past it, lays a Crossing there when that
     belt is a straight run of its line: the cell behind it pushes into it (`pushesInto`). That is a
     belt or other piece handing on that way, or a machine, miner, collector, station or node whose
     output port is that cell; a byproduct port counts only when something comes out of it. A
     turning belt there, the drag's last cell, a belt on the drag's own axis and a one-tile drag keep
     the old rule and are left alone. The critic dragged a gear line east starting on the
     north-running brick belt: no Crossing was laid there, the gears side-loaded into the bricks,
     and about 70 s later the Assembler jammed on a Gear, a merge nobody drew. The critic's wider
     rule, any perpendicular belt at the start, would have broken #78 again: a drag starting on a
     line's turning belt would send that line straight on and starve its other leg. Amends #78
     ("Ends and turns first") and #54.
108. **What Mags and the panels say, and in what order (review-3 K8, K9, K13, Q10).**
     - **Act I hints (K8).** M3's reads "Everything you build is paid from the HQ: keep some plates
       flowing into it." M5 gets "Machines only take parts from belts, never from the HQ: give the
       Assembler its own plate line and turn the brick line into it." Act I teaches the player to
       sink everything into the HQ, the Surface has no Unloader, and at M5 the critic's HQ held 69
       plates and 48 bricks the Assembler couldn't use. The critic's wording, "split a plate line",
       halves the HQ's plate income, which is what slowed the critic down.
     - **Counts and names (K9).** When the depot holds some of a good but fewer than a ghost costs,
       Mags gives the count: "The HQ has 1 Gear; your planned Assembler needs 6 and none is coming
       in." (and "... needs 6. The elevator is full of other requests ..." underground), on every
       layer; with none in stock she still says "is out of". A machine's hover names the stuck good,
       "Jammed: Coal at its input (it makes Iron Plate)" or "Jammed: Iron Plate pushed into its
       front", and a front-jammed machine's status reads "Jammed: a belt feeds its front". A lower
       station shows "Arrived, waiting to come out: N" only when N is above 0: the count is real
       (what a full depot can't take yet), but read 0 the rest of the time. "Out of Gear" with 3 of
       4 in stock sent the critic looking for a missing line, and the hover named the recipe, not
       the good. The act bots read both wordings (`starveAdvice`). Amends #65's "the HQ keeps its
       out of Gear wording".
     - **Breakthrough order (K13).** Mags's introduction to the new layer comes first: the
       breakthrough lands the milestone that waited on the project at once (its toast and reward,
       then the next milestone's intro), then her drill-lines line, then the Board's memo. The
       layer's own hint (the dark, spores, interference, heat, conduits) waits while the
       breakthrough card is up, while the radio holds messages, and for 30 ticks after
       (`App.hintHold`). Milestones are checked every 15 ticks, so the critic's log had the memo, the
       drill-lines line and "It's dark down here" before "We're through" half a second later. This
       reorders only when the open milestone is the project's: in the Act II bot run M10 was still
       open at D2, so the next intro came after the memo, as before. "E digs, F surveys" stays in the
       hint; M7's intro already has three sentences.
     - **"the" mid-sentence (Q10).** The Board's memo ("breakthrough to the Shallows noted"), the
       station's "Mk1 to the Shallows" and the lock text "reach the Shallows" lower the layer name's
       "The", as `depotName` and `stepLabel` already did.
     Amends #98 (the drill-lines line now comes before the Board's memo).
109. **Act I pays half, and the game is about 3–5 hours (review-3 K11, K12).**
     - **Money (K11).** Act I's milestones pay $725, half of $1,450: $50, $75, $75 with the Sorter
       license, $125, $150 and $250. The required 100 kW line ($600) stays affordable by M4 ($400 +
       $50 + $75 + $75, plus the Terminal); the 160 kW line ($1,000) now waits on income. Act II's
       rewards and the contracts are unchanged, and contracts stay on the Surface's board: PLAN §8
       calls them the catch-up valve, and they matter more now. Money never bound in Act I: $1,450
       plus the $400 start, against $600 of required spending and $1,000 optional, so routing every
       product into the Drill at $0 a minute cost nothing (the critic bought both upgrades by 10
       minutes and still had $1,019 at D1; the efficient bot sat on $789–$990 from 5:00 to 7:59 with
       nothing to buy). On seed 20261030 the efficient bot now reaches D1 at 14:07 (was 12:45): M5 at
       10:47, the 160 kW line at 12:05 instead of 8:14, so the Surface runs at 0.63 of its power for
       about 3.5 minutes, and $383 at D1 with M6's reward. Starter line only: 17:22 (16:17).
       Careless: 16:00 (15:13), with the same $60 gear rush. Act II starts from Act I's real end with
       $383 instead of $1,105 and reaches D2 at 12:15 (12:19). No new stall or deadlock; Acts III–VI
       are unchanged. Act II's money stays for human playtests, as #100 has it. Amends #36 and #100.
     - **Length (K12).** PLAN gives the game as about 3–5 hours to the ending, what its own act
       bands add up to (3:05 to 4:40), instead of 4–6 hours, which overlapped them only between 4:00
       and 4:40. The bots take about 2 h 09 min in all, with no reading or placing time and Acts
       III–VI on stand-in supply. Projects don't grow to meet a headline: the bands stay until people
       play (#100), and the headline follows them.
110. **The crew's rig starts fuelled (review-3 Q2).** A new layer's rig generator comes with 4 coal,
     all it holds (`GEN_FUEL_CAP`), so the rig burns from the first second: 4 coal last 160 s at the
     Miner's 8 kW, and the Miner refills it within seconds once it has power. That Miner used to run
     only on power cabled down from the layer above, so a layer opened while the one above was at or
     over its supply sat at "8/0 kW" in coral: with the 100 kW line and six fed Presses drawing
     124 kW the rig stayed dead for 164 s, and longer if the player belted the old drill lines into
     the top station, as Mags says to. Five coal, as proposed, would break the generator's cap
     (`insert`, `fullGenerator` and `waitsOnGenerator` all test 4 or more). The rig also sends its
     spare power up the cable at once, covering a layer above that draws too much. The act-bot start
     states and the shallows, fungal, magma and alien scenarios get fuelled generators, and the
     rig's Idle test still holds. **Kept:** the Crystal Depths still has no rig (#39), so with
     nothing spare above, its Assay Lab can open unpowered. Amends #39: "opens on a running rig" now
     holds with no power to spare above.
111. **The automatic UI scale fits the width too (review-3 Q3, Q5).** The automatic scale is the one
     nearest 330 UI px tall, never under 640 UI px wide: max(1, min(4, round(H / 330),
     floor(W / 640))) (`App.autoScale`). 1600×900 and 1440×900 run at 2× (800×450 and 720×450),
     1920×1200 at 3× (640×400), 1680×1050 at 2×, and windows 960–1279 px wide at 1×; 1280×720,
     1366×768, 1920×1080 and 2560×1440 are unchanged. A scale chosen in Settings is capped at the
     automatic one; Settings greys out larger ones ("Too large for this window") and marks the one in
     use, and the auto button's tip names it. By height alone 1600×900 got a 533×300 UI and
     1920×1200 a 480×300 one: the power readout ran under the overlay toggles on every layer from
     the Fungal Caverns down (the top bar needs about 609 UI px in a late game), the build bar
     wrapped and windows covered it, and a chosen 3× or 4× at 1280×720 put the Field Manual's Next
     off the screen. QA's cap, floor(min(W / 640, H / 330)), contradicted the automatic rule (1× at
     1366×657, where it picks 2×). A short UI that is 640 wide (1920×912) still needs #112.
112. **Windows own the mouse, and the HUD waits for them (review-3 Q1, Q4, Q6–Q9).**
     - **Paged windows fit (Q1).** In a game the Field Manual and What's new are 250 UI px tall at
       most and 150 at least, fitted between the top bar and the build bar's room (`pagedHeight`,
       used for the drawn window and for `overlayRects`), and nothing in the HUD or the inspector
       under an open window hovers or clicks (`UI.occluders`: the app sets it to its covers around
       the HUD and the inspector and clears it before the windows; `begin` and `end` clear it too).
       The bar is drawn before the windows and a button takes a press when it is the first hovered
       one, so where a window had to overlap the bar, its Next picked Select instead (1920×1200,
       1600×900, 1440×900, and the 1920×912 of a 1080p laptop at 125%), or the Charger on a two-row
       bar at 1366×657. On the title they stay 250 tall.
     - **Company rows (Q4).** The pay is right-aligned at left+186 and the name, with short item
       names ("225 Aggregate"), fits the room the pay leaves; the multiplier stays at left+190, and
       the hover has the full name and pay. "225 Heat-Resistant Aggre$5,990" and "$40,000(2.5x)"
       overprinted.
     - **No world hover under a blocking window (Q6).** While the menu, Settings or the save-failure
       dialog is open, the world shows no ghost and no tooltip, and a right-drag that was running
       when the menu opened stops. A Press ghost and its tooltip followed the mouse under Settings,
       though a click placed nothing.
     - **One-shot feedback waits (Q7).** The breakthrough card ages only while it is drawn and
       nothing covers it, so it waits under a window as Mags's radio does (#88), and toasts don't age
       while the ending plays (#103), so the milestones the ending lands (#96) toast beside the
       thank-you card. The card ran out behind the Field Manual, and "Milestone: The Governor"
       expired unseen. QA proposed closing the player's window at a breakthrough instead; waiting
       keeps #88's rule.
     - **Small fits (Q8, Q9).** The radio's next button is as wide as its label needs (at least
       31 px, its right edge kept): "2 more" to "5 more" started on its frame. On the title an open
       window hides the save slots and the Settings / What's new row, and Settings is 210×88: the
       window cut slot 2's label in half, and a click inside What's new, over the hidden Settings
       button, switched windows. Going from Settings to What's new now takes a close first.
     Amends #88 and #81 (panels take the mouse).
113. **Decor: weights, wood crates, outlines off the darkness tint (review-3 A1, A13).**
     - **Weights (A1).** Each layer weighs its decor names (`LayerDef.decorWeights`, in `decor`'s
       order): the Surface 3, 3, 3, 1, 2 (bush, grass, pebbles, crate stack, survey flag: one crate
       stack in 12 props), the Shallows 1, 7, 7, 1 (support, stalagmite, rubble, minecart: tall props
       1 in 8), the Fungal Caverns 3, 1, 3, 3, the Crystal Depths 3, 1, 3, and the Magma Shelf and
       the Alien Strata 1, 3, 3; the 32 px prop is always the lightest. Where props stand is
       unchanged (one hash per cell); a second hash ranks those cells, so every name gets its
       weight's share to within one on any map (independent weighted picks were too noisy: the
       Shallows drew 11 tall props of 52). A 32 px prop with another 32 px prop within 2 tiles,
       among the cells already placed, becomes one of the layer's 16 px props by the same rank. The
       32 px names are data (`TALL_DECOR`), because the sim can't read sprite sizes. On seed 20261030
       the Surface has 144 props with 11 crate stacks (was 33), and the Shallows 52 plus 21 amber,
       6 of them tall (it had 34 tall props of 73, 18 within 2 tiles of another: rows of minecarts
       under the lamps). Decor is saved, so only new games change, and maps stay deterministic.
     - **Crates (A1).** The crate stack's planks are wood `#ad7757` (1.39:1 on the floor, like the
       bush and grass), not brass `#884b2b` (2.50:1): bigger and warmer than the starter buildings,
       the stacks read as the player's storage.
     - **Outlines (A13).** The eleven PixelLab props that still carried `#090a14` now use their
       layer's darkest wall colour, #83's rule: `#341c27` on the Shallows (stalagmite, support),
       `#241527` on the Fungal Caverns (spore pod, tall mushroom), `#10141f` on the Crystal Depths and
       the Magma Shelf (both crystals, the geode, hex pillar, vent, ember rock) and `#151d28` on the
       Alien Strata (stone gear). Off-ramp colours went too. The tall mushroom's steel-grey stem,
       which read as a metal post, is a shaded plum stalk (`#a23e8c` lit left, `#402751` right,
       `#7a367b` between): all `#a23e8c` read as glowcap pink, and all `#402751` vanished into the
       floor. The geode's pale rim is `#577277` / `#394a50` round a `#172038` hollow (it read as a
       hole). The survey flag's pennant, in the UI's "bad" red, is wood `#ad7757`; four glow pixels
       on the bush are `#d7b594` / `#468232`; the vent's Heat-brick `#752438` and `#602c2c` are
       `#411d31` and `#241527`. The skeptic moved two of the art director's picks: brass for the
       flag (the colour A1 removes) and `#75a743` for the bush (outside the Surface's accent).
     Amends #83 and #86.
114. **The title fits the window (review-3 A2).** The title art is drawn whole, at the largest
     whole-number scale in screen pixels that fits, centred: 4× at 1280×720, 1366×768 and 1440×900,
     5× at 1600×900, 6× at 1920×1080. The margins carry it on: `#172038` above, `#151d28` (its bottom
     row's commonest colour) below, and each side's edge column stretched sideways; the 25% veil is
     laid in screen pixels. The logo and the subtitle follow the art (its rows 14 and 25), which
     keeps them at UI y 14 and 50 at 720p and 1080p, as before and as without art. The old rule, the
     smallest scale that covers, was worked out in UI units, which at UI scale 2 only allow even
     pixel scales: any canvas just over 1280×720 jumped to 6× and lost about 30% of the art, so the
     logo sat on the Drill's derrick and the peak and the Heart were cropped (1366×768, 1366×657,
     1440×900, 1536×864). Stretching the art's top row into the margin, as proposed, would have
     drawn its one star pixel as a streak. `scripts/art/title_mock.ts` follows the same rule (its
     320×180 art still lands at 2× on the 640×360 frame).
115. **Floor variants where they help, with a share per set (review-3 A3).** New variant sheets,
     each its set's sheet with only the plain tile changed, inside pixels 2–13 so the edges still
     seam: the Surface ground (`t_l0_ground_rock_v1`–`_v3`: the gravel's dashes shifted 2 px and
     thinned, two or three pebbles), the Shallows floor (`t_l1_floor_rock_v1`–`_v3`, made from the
     sheet after #117's lip fix: a 5–6 px `#4d2b32` crack and `#ad7757` specks), the Crystal floor
     (`t_l3_floor_rock_v1`–`_v3`: a `#172038` crack and `#3c5e8b` specks) and the magma
     (`t_l4_hot_magma_v1`–`_v3`: tile 15's swirls taken from the pure-magma centres of three other
     tiles, each with one white-hot pixel in its own place; the base tile's white-hot pixel became
     `#da863e`). Each set records its share of plain tiles drawn from its variants (`variantShare`
     in its terrain recipe, written to atlas.json): 0.75 for the Surface ground and the magma,
     which repeat like wallpaper, 0.25 for the rest. `t_l4_hot_magma` tile 0 still equals
     `t_l4_floor_hot` tile 15, as the chained sets need. The Surface's rock tops, the Magma Shelf's
     floor and hot ground and the Alien floor got none: the dither or the slab grid is their texture.
     64 of 112 sampled Surface floor patches were byte-identical (a "3E3E" wallpaper across the first
     screen), the Shallows and Crystal floors were one flat colour (the reason #86 gave the Fungal
     floor variants), and every magma pool showed a 16 px grid of white sparks. The renderer reads
     each set's share from atlas.json (`terrainVariantShare`); `VARIANT_SHARE` in `terrain.ts`, one
     in four, is the default for a set without one. Amends #86.
116. **Recipe anchors reach the renderer; the cab sits in the art's pit (review-3 A4).** `art:build`
     writes each sprite's anchors into atlas.json "anchors", from the recipe that wins for the name,
     as it does light spots: `pit`, `bore` and `core` rectangles (every pixel drawn, or the build
     fails) and `chute` edges (for each side, the first drawn pixel in from it along the tile centres
     8, 24 and 40 of a 48 px building; a value off the canvas fails, one off the art's edge warns).
     Today those are the elevator station's pit [13, 21, 21, 15] and chute, the Engine Node's chute,
     and the Heart's core [47, 46, 17, 18], its gem; the Drill's bore is still a note. The renderer
     reads the pit (`spriteAnchor`): over the art station it draws no black fill and puts the cab
     1 px inside the pit, 19×13 at [14, 22], with bars at x 19, 23 and 27, cargo pips in 2 rows of 4
     at a 3 px pitch and the cable at x 23–24 from y 21 to 35. The code-drawn station keeps
     [16, 14, 16, 18] and its black fill. Before, the cab was drawn at that fixed rect over the art
     too: a black slot cut 7 px up through the station's top frame and the dwelling cab hung over
     it, at both stations of every shaft. The 3×3 chutes start from the chute anchors
     (`spriteChuteEdges`): where the art stands back from its footprint, a `#202e37` spout 6 px wide
     runs from the art's edge pixel at the port tile's centre to the chute, so the station's east
     and west chutes (7–8 px of margin) and its north one (10 px) meet the body. Amends #47 and
     STYLE's recipe format, where every anchor waited behind a "_" key.
117. **Terrain colours that sit back (review-3 A5, A8, A11, A15).**
     - **Surface hard rock (A5).** It is dithered in `#ad7757` (2.62:1 on the `#e7d5b3` sandstone),
       not `#341c27` (10.86:1): the mountain face behind the Drill, where the first milestone sends
       the player, read as a screen-door mesh, the loudest texture on the layer. It stays darker than
       rock you can dig, and the dig cursor turns red over it. The code-drawn Surface rock is darker
       than `#ad7757`, so if the sheet never loads only lip pixels show the dither. The Shallows keeps
       `#341c27`. Amends #82.
     - **Spores on floor only (A8).** The spore overlay draws on revealed open floor, glowcap patches
       included. It covered rock and water too (77 of the fungal scenario's 408 overlay tiles): a
       pink fog with blocky rectangles over the walls at zoom 1. The art director would have left
       the glowcaps out as well; the skeptic kept them, because a Spore Collector, or any machine
       that isn't immune, can stand on a patch, where the spores are thickest.
     - **The Shallows lip (A11).** It is `#c09473` tops over `#ad7757` (2.73:1 and 1.96:1 on the
       `#7a4841` floor) instead of cream and gold `#e7d5b3` / `#e8c170` at 5.15:1: as bright as the
       lamp bulbs, and in the money and selection colour. The sheet is snapped through
       `terrain-fix.ts` first (the raw one had 46 colours off the palette).
     - **Alien joints (A15).** The slab joints are the layer's dark green `#25562e` (1.67:1 on the
       slab; `#394a50` was 1.80:1) on both the rock and the conduit sheet, so the joints keep one
       colour along every conduit. A 3 px margin keeps the floor's 2 px next to a lip as contact
       shadow (a plain rule left a green fringe at wall bases). The deepest floor read grey-blue.
118. **Deposits: beds and decals (review-3 A7, A14).**
     - **The Alien ore bed (A7).** On the PixelLab slab floor the Alien Strata's ore bed is
       `#394a50` (1.80:1). Its `#202e37`, tuned for the code floor, sat at 2.71:1 on the `#577277`
       slabs, so every deposit was a near-black pit (the other layers' beds sit at 1.22–1.66:1). The
       code floor keeps `#202e37`, because `#394a50` is that floor's own colour. The 1-in-4 `#202e37`
       dither offered for the dark band wasn't needed.
     - **Decals (A14).** A deposit tile's decal steps to the next variant, at most twice, while it
       matches the first pick of the same ore's west or north neighbour, and its seeded offset is
       ±3 px, never toward a side whose neighbour isn't ore, so it stays on its bed. It depends only
       on the tile, so nothing moves as the camera pans. Every decal sits inside x 1–14 and four
       have nothing in the outer 2 px, so at ±2 px the patches read as grids (four-pebble iron and
       coal, copper "coffee beans" in rows, emberite buttons). Amends #47's ±2 px.
119. **The Heart, re-rolled (review-3 A12).** One paid job, as the owner approved:
     `create_1_direction_object` at size 100 (10 generations, 4 candidates; the account went from
     3,900.10 used to 3,910.10, the $2.00 credit untouched), placed centred on the 112 canvas so the
     art can't reach its edge. Frame 0 is a whole 16-tooth grey-green stone gear, 87×88 at [12, 12]
     with 12 px clear on every side, a dark green glass channel round it and a faceted navy gem.
     Frames 1–3 were rejected: a low 3/4 oval, a ball core that read as an eye, and a gem shaped like
     a heart, a health icon. The awake Heart is a free 590 px recolour: the gem white-hot and aqua,
     the glass channel lit, and its light spot ([55, 55, `#a4dddb`, 8]) on the gem. The first Heart's
     gear ring was cut flat at the top and right edges (77 opaque px in row 0, 85 in the last column)
     and its four diagonal conduit stubs ended on bare floor. The prompt dropped "enormous", "filling
     the frame" and any pipes, and all four candidates came back inside the frame. The off-centre
     conduit under the Heart (CONDUITS at x 54) stays, because moving it changes the node rings,
     maps.test and the Act VI bot; it now shows in the margin beside the ring. The recipe is
     `h2_heart.json`: recipes run in localeCompare order, which puts `h_heart_2` before `h_heart`, and
     the later one wins. The art run has now spent 167 of the 500 generations (333 left). Amends #85
     and #86.
120. **Screenshots that show what they are for (review-3 Q11).** The `alien_governor` shot clears the
     radio, sets zoom 1 below 1000 px of height and 2 above, and centres on (46, 33). At 1280×720 its
     fixed zoom 2 put the Heart's beacon under the build bar's corner, one node's under the Stack and
     one under the top bar, and QA's width test would have left 1600×900 broken; every beacon is now
     clear of the HUD at 1280×720, 1600×900, 1920×1080 and 2560×1440. A new shot, `surface_jams`,
     shows the top station jammed by plates pushed into its front and a head-on belt pair with both
     badges, the mouse on one of the pair (26 shots; 27 with #103's `ending_climb`).
121. **The player builds the first line (owner, session 2).** A new game opens with the HQ, the
     Terminal and the Drill only; the old line's cost went into the HQ crate (140 plates, 41 gears).
     Act I gains milestone 2, "Plates for the HQ" (later milestones move up one; saves migrate at
     version 4). Each step has its own hint (currentHint) and map marker (guideMarks). The owner never
     found the Dig tool, so a small ridge in Act I is dug through as a step, and the Shallows'
     arrival has dig and survey steps. Scenarios and bot start states lay the old line themselves.
122. **Right-click never removes (owner, session 2).** Right-click-to-remove cost buildings by
     accident. A click cancels the tool, else the selection; holding the right button on a building
     for 0.5 s removes it (a coral sweep shows the hold); Ctrl+Z puts the last removal back with its
     facing, recipe, filter and pause, paid again or planned. The Remove tool (X) is unchanged.
123. **Ghosts show direction (owner, session 2).** A belt ghost is the real animated tile with its
     drag's turns and a chevron arrow, its colour on the rails, instead of a 50% dither that erased
     the rungs. Building ghosts keep their sprite with a tinted outline and an output arrow.
124. **Seamless belts (owner, session 2).** Rails are drawn only on sides no lane crosses, so turns,
     side joins and splitters, crossings and sorters (no more corner blocks) read as one conveyor,
     and lanes run into machines' intakes.
125. **A new font and UI kit (owner, session 2).** A condensed, squared face with tabular figures
     (same metrics), bevelled panels and buttons, and one rate style ("30/min", unit dim) for every
     rate; the top bar shows INCOME, and machine panels show the real rate against full speed.
