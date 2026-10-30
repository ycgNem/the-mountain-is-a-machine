# Plan review 1: decisions (2026-10-30)

Source reviews: `critic.md` (indie critic), `systems.md` (systems/numbers), `art.md` (art director), all in
this folder. Below is what the owner-side (main session) decided. "Accepted" items are being implemented;
everything here must be reflected in PLAN.md, STYLE.md and DECISIONS.md (entries 21+), with the reason.

## A. Logistics: make the elevator bind, haul construction stock automatically

1. **Elevator tiers** (systems #7): Mk1 cab 6, travel 3 s (8 s round trip incl. two 1 s dwells) = 45/min;
   Mk2 cab 9, travel 2 s, 6 s round trip = 90/min; Mk3 cab 15, travel 1.5 s, 5 s round trip = 180/min.
   Half a conveyor / one conveyor / one express belt. Upgrade costs unchanged (Mk2: 20 Motor, 30 Steel
   Beam, 20 Reinforced Plate, $2,000; Mk3: 10 Battery, 30 Circuit, 40 Steel Beam, $8,000), paid from the
   upper station's depot. Cables 60/150/400 kW unchanged. The cab still waits for a fuller load (DECISIONS 19).
2. **Depot supply requests** (critic #1): every underground depot keeps a request list (item → target).
   When a cab loads at a shaft's top, it carries requested items from the upper depot (never taking the
   upper depot below its own request for that item) up to half the cab first, then belt cargo from the
   top bay, then more requests if room is left. Requests relay depot to depot down the stack (L3 asking
   for Iron Plate pulls from L2, whose own request pulls from L1, ...). Everything sent down lands in the
   lower depot (the lower station faces it). New layers open with default requests: Iron Plate 40, Gear
   20, Copper Wire 20, Brick 20. Belts to the top station are now for production cargo and volume;
   the per-layer decision is how to spend 45 items/min of cab.
3. **Remove the Crystal Depths copper deposit** (systems #7) so circuit copper rides the elevators.
4. **Bore-site distances stay** (critic #13, systems): rejected. Requests and Company Chutes remove the
   pass-through belts that made distance a tax; moving every bore site would re-lay all five maps.

## B. Materials: every major resource makes a decision

5. **Sapstone** (critic #2, systems #8): Insulation = 1 Resin + 1 Mycelium, 6 s; Separator 6 s
   (10/min); Combustion Generator also burns Resin (60 kW, 4 s each) so surplus resin is a choice, not a
   wall. D3 = 100 Cobalt Drill Head, 200 Insulation, 60 Filter → 400 ore vs 260 resin: separate ~260,
   wash ~140. Sapstone deposits: 2 of 3 sit 3–5 tiles from a glowcap patch (spores slow the core line
   20–35% until filtered).
6. **Emberite and hot items** (critic #3, systems #9): plain belts cool 10 heat/s, insulated 1 heat/s
   ("10× slower"). An ember ingot below 50 heat becomes a Cooled Ember Ingot (plain range ≈ 7.5 tiles,
   insulated ≈ 75). Hot items entering anything that is not a machine or a belt-type slot (depot, crate,
   elevator, terminal, chute, drill except the D5 hot delivery) become Cooled. Molten value $0
   (unsellable). The **Precision Assembler needs steady ground: at least 8 tiles from any hot ground**
   (closes the forge-next-to-assembler bypass). Emberite comes from **3 single-miner vents** (2×2,
   90/min cap), each inside the hot band, so its miners run at 50% until Foundations go down
   (Foundations may sit on deposit tiles). D5 = 60 Ember Core, 160 Heat Shield, 40 Circuit, **20 Molten
   Ember Ingot delivered hot** (the drill accepts a molten ingot only while it is hot).
7. **Heat field** (critic #6, systems #12): hot = within 2 tiles of magma, warm = 3–4 tiles. Ordinary
   machines ×0.5 hot / ×0.75 warm. Heat family (Smelter, Foundry, Pressure Forge) ×2 hot / ×1.5 warm.
   Cooling Bath and Thermal Extractor unaffected. A Foundation removes penalty and bonus. Pressure Forge
   needs hot (not warm) ground. `LayerState.hot` holds 0/1/2.
8. **Chorus Crystal** (critic #9): 3 single-miner vents (90/min cap). "Crush charged" becomes 1 Charged
   Crystal → 2 Conductive Powder, 8 s: the rich route (cut → charge → crush) yields 2 powder per crystal
   against 1 for the cheap route (crush → charge grit). Overcharger 8 s to match its Stabilizer.
9. **Interference** (systems #10, critic #8): two working machines interfere when the gap between their
   footprints is 2 tiles or less (integer, Chebyshev); a Shield Wall anywhere inside the rectangle
   spanned by both footprints blocks it. Interferers: working 2×2+ production machines (machine, miner,
   collector) drawing ≥ 8 kW, grid or conduit; Stabilizers are dampers and emit nothing; taps,
   generators and extractors emit nothing. Sensitive machines lose 25% per interferer (min 25%). Taps:
   +20 kW per interferer (max 6), counted from the last hazard refresh. The placement ghost shows the
   predicted speed of a sensitive machine (and the tap's output).
10. **Slag** (systems #4): Cooling Bath second recipe Quench Slag: 2 Slag → 1 Aggregate, 4 s. Thermal
    Extractor 4 s per Emberite (15/min, 220 kW).
11. **The Engine** (critic #7, systems #11): conduits start **dormant**. All nodes take 2 s per accepted
    item, 4 items per Heartstone (8 s, 7.5/min). The node nearest the arrival (the Waking Node) takes
    **Battery and Resonant Core** alternating; the other two take Engine Glass and Resonant Core
    alternating. A wrong item is pushed out of the node's side and progress is kept. A node's first
    Heartstone **wakes every conduit tile within 15 tiles of it, permanently**. Machines with at least
    2 footprint tiles on awake conduit draw from the conduit pool instead of the grid: **150 kW per awake
    node**; over the pool, conduit machines slow (supply/demand). The Attuner draws 20 kW from the pool
    and needs ≥ 2 footprint tiles on awake conduit. Governor = 60 Heartstone, 120 Engine Glass, 40
    Battery, 40 Ember Core.

## C. Numbers: clean ratios and bigger projects (systems #1, #5)

12. Adopt the systems clean-ratio set (every machine at 7.5 / 15 / 30 per minute): Press plate 4 s,
    wire 4 s, mycelium 4 s; Cobalt Ingot 4 s; Reinforced Plate 8 s; Motor = 2 Gear + 4 Copper Wire 8 s;
    Separator 6 s; Biofuel 8 s, burns 8 s for 120 kW; Cobalt Drill Head 8 s; Crusher 4 s; Charge cut 4 s;
    Overcharger 8 s; Circuit = 2 Conductive Powder + 4 Copper Wire 8 s; Heat Shield = 4 Aggregate + 1
    Steel Beam 8 s; Quench 2 s; Forge 8 s; Ember Core 8 s; Attuner 8 s.
13. Projects: D1 unchanged (tutorial); D2 160 Steel Beam, 60 Motor, 80 Drill Bit; D3 100 Cobalt Drill
    Head, 200 Insulation, 60 Filter; D4 200 Circuit, 100 Battery, 60 Resonant Core; D5 60 Ember Core,
    160 Heat Shield, 40 Circuit, 20 Molten Ember Ingot (hot); Governor 60 Heartstone, 120 Engine Glass,
    40 Battery, 40 Ember Core. §8 rule: first chain (one machine per recipe) 25–35 min; the 10-minute
    line 24–45 machines; machine-minutes rise every act; D1 exempt.
14. Values: Heat Shield $80, Battery $60, Heartstone $400, Insulation $14, Molten $0.
15. Game speed 1× / 2× (3× removed: waiting must not beat building).

## D. Money (critic #10, systems #6, #14)

16. **Requisition becomes Rush**: a planned ghost can be rushed for 3× the value of its missing goods;
    it builds at once; on removal a rushed building refunds only the goods that came from the depot.
    Requisition into depots is removed (money can no longer buy drill goods).
17. Contracts: size = 5 minutes of one machine's output of that item; multiplier 1.5–2.5× (never above
    2.5×, free play included). Re-roll the board for $200.
18. Rewards: Act V total ≈ $6,000, Act VI ≈ $8,000 (flattened).
19. Sorter license purchase removed (milestone 4 grants it). Storage Crate unlocks free with the
    Shallows (no license). Express Belt license stays ($2,500, Crystal Depths).
20. **Company Chute** (critic #13): a 1×1 building on any underground layer that sells what is belted
    into it at 60% of value, instantly. Full value and contracts stay at the Surface Terminal.
21. No surveys on the Surface (it is never dark).

## E. Onboarding and Act II (critic #5, #11, systems #3)

22. Starter line: Miner → Smelter → **Splitter**, feeding both the Terminal and a **Press → HQ**, so the
    HQ's plate count ticks up from the first minute. HQ starts with 100 Iron Plate.
23. Milestone 1 "First Light": watch the line make a sale + **click the Drill** to see what it needs.
    Milestone 2 pre-places a planned copper Miner ghost on the copper deposit.
24. Milestone 5 (Brickwork) adds a step: **upgrade the Company Line**.
25. **Every underground layer with coal opens with a running rig**: a pre-built coal Miner feeding a
    Combustion Generator in the start pocket (L1, L2, L4, L5). L3 runs on the L2 cable and taps. Starter
    crates carry the goods for the layer's first-milestone building (Assay Lab on L2–L4, Attuner goods on
    L5) plus 4 Motors and 20 Copper Wire on L1.
26. **Act II shrinks from 8 milestones to 5**: Down the Shaft (visit + 3 Lamps), Steel, Motors, The Bore
    Site (dig to it + 80 items by elevator), Bore to the Fungal Caverns. Act II target 20–30 min. The
    Shallows start pocket grows to ~22×14 with iron and coal inside. The L1 bore-site cavern shows
    amber-sealed rock and Mags remarks on it (the first strange thing, ~30 min in).
27. **Assays**: keep the four signature assays (Sapstone, Chorus Crystal, Emberite, Thrumstone).
    Glowcap, Resin, Charged Crystal and Engine Glass unlock on first production instead (critic cut list).
    Milestones that asked for those assays ask for production instead.

## F. Rules and cuts

28. Machines have one output port: 2×2 front-right tile (relative to facing), 3×3 front-centre; the side
    output is the left face's front-most tile. Drawn as a chute (STYLE). Belts keep fair alternation of
    side inputs, so the **Merger is cut** (critic cut list).
29. Power: a working machine draws its full rating even when a hazard slows it; surplus crosses shafts
    nearest-first within cable caps (as built).
30. Glossary of one-line rules added to PLAN §5 (critic #14).
31. **Scope gating rejected** (critic #4): all six layers are already built and each layer's rules are
    covered by tests; instead every act gets a scenario playtest by the critic, and the pacing bot
    asserts the reference lines.

## G. Art (art.md)

32. Adopt the art director's plan: 10 terrain sets (adds t_l4_floor_hot, renames the magma set
    t_l4_hot_magma, adds t_l5_floor_conduit), L1 pilot picks pro or standard; items/ground at 16 px with
    anchored re-rolls; machines at 32 px with a view-angle pilot; 3×3 buildings, the Drill and the Heart
    via create_map_object in mock scenes; portrait via create_image_pro 48×48; title 320×180 pixflux.
    Budget 273 + 150 reserve ≤ 500. New sprite: `b_chute`. Cut sprite: `b_merger`.
33. Style issues 1–14 adopted: terrain contrast (lit lips on rock edges, one darkness tint #090a14),
    darkness computed at tile corners and dithered per world pixel (world-anchored Bayer, 4 bands at
    0 / 0.35 / 0.65 / 0.85, unrevealed 1.0), belt colours and an 8 px pattern period moving in lockstep
    with items, closed 1 px item outlines and the 12×12 item envelope, ramp separation (cobalt vs
    crystal, iron vs steel, glossy coal), family accents that never repeat, layer accents that never
    repeat, deposits as half-buried chunks with a seeded ±2 px offset and an ore-bed tint, decor dull,
    sprite openings for animations (elevator pit, drill bore), pad-and-fail importer rules, code-drawn
    table (belts, splitter, crossing, sorter, status icons, ghosts).

## H. From the Act I pacing bot (tests/act1.test.ts, tests/bot.ts)

The bot (an efficient scripted player on the real map) reached D1 at 13:09 game time; a careless
variant deadlocked three times and only escaped by requisitioning.

34. **Unpaid replacements are refused** ("Not enough goods to swap this in"): a planned ghost dropped
    on a working belt used to remove the belt at once and could never be paid for (line deadlock).
35. **Smelter cost loses its brick** (10 Iron Plate + 2 Gear): bricks came only from smelters, so three
    smelters before a brick line locked the player out.
36. **"Build" milestone steps count what already stands** (non-ghost buildings matching the step), not
    only what was built since the milestone began.
37. **Replacing a belt never loses its item**: if the new piece can't carry it, it goes to the depot.
38. **Company Line 160 kW costs $1,000** (was $1,800): Act I earns ~$30–45/min, so it arrived at D1.
39. **Planned ghosts build fairly**: oldest first, and a newer ghost may not take an item an older
    waiting ghost still needs (cheap belts no longer starve machines).
40. **Machines can be paused** from the inspector (no new crafts, no power draw).
