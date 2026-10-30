# Indie critic review

## Verdict

Not fun end to end yet, on paper. The premise, the opening on a running line and Act I's power squeeze are right, but at the plan's own numbers most headline decisions have one answer: Mk1 moves 48/min while no drill project ever needs more than about 24/min across a shaft, the Separator's 1:1 resin nearly matches demand, and a Forge can feed a Precision Assembler directly, so hot ingots never touch a belt. Biggest problem: Pillar 4 is hollow, so depth adds per-layer plumbing instead of choices. Close second: six bespoke rule systems in one session, so build Acts I–III as a gated vertical slice before anything deeper.

LOOP AS PLANNED
- 10 s: place, rotate, drag, follow a rock. This holds.
- 10 min: a goal needs N, so you trace the bottleneck. This holds through Act II. From Act III on, the advertised bottleneck (the elevator) never binds, and the material choices are already solved by their knowledge cards.
- A layer (30–60 min): arrive, dig and light, assay, small line, scale, break through. It breaks at 'arrive', because every layer starts by rebuilding the Act I plate/gear/wire line from a starter crate. It also breaks at 'scale': unscaled drill ETAs of about 9 min at 1× are 3 min at 3×, so waiting beats building.
- The game: each layer feeds the next. This breaks in Act II, a second Surface with no strange material until 45–70 min in. It breaks again in Act VI, where free conduit power and a one-building Sequencer make the finale the easiest layer.



## 1. [Critical] Logistics: elevators and per-layer depots (Pillar 4, DECISIONS 3/6/7)

**Problem:** [math] The elevator never binds. Mk1 moves 48/min each way (PLAN 5.5). At the PLAN 8 target of a scaled line finishing in 5–10 min, the cross-shaft drill demand is low. D4 imports 60 Cobalt Ingot + 20 Insulation (8–16/min). D5 imports 120 Circuits (60 + 2 per Ember Core × 30), which is 12–24/min. The Governor imports 40 Battery + 60 Resonant Core + 20 Ember Core (12–24/min). The only planned flow above 48/min is coal as fuel (15/min per 80 kW generator). So Mk2/Mk3 matter only as power cables, 'where should this chain live?' has no cost answer, and DECISIONS 3 ('elevators are the real bottleneck') is false. What's left is plumbing [doc PLAN 6]. Stone exists only on L0–L1, yet every Smelter needs 8 Brick. There is no copper on L2, L4 or L5, and L5 has only Thrumstone + Coal. Each arrival therefore means rebuilding the Act I plate/gear/wire line from a starter crate, plus a hand-run chain for every hop: Unloader, then 25–40 belt tiles, then station, then depot (PLAN 5.6–5.7). [taste] This is the Techtonica failure mode: strata that play as separate rooms you haul between. Satisfactory's floors cost nothing to cross, and its 1.0 Dimensional Depot made construction stock global on purpose.

**Why:** 'Depth changes logistics' is the game's stated identity, and at these numbers it becomes a repeated setup chore with no trade-off.

**Fix:** Make capacity scarce and hauling automatic.
(1) Mk1 cab 8 → 4 (24/min), Mk2 cab 16 → 10 (75/min), cut Mk3. D5's 12–24/min of circuits plus construction stock then saturates Mk1, and the Mk2 upgrade ($2,000 + goods) becomes a real call: pay, wait twice as long, or relocate the chain.
(2) Give each depot standing supply requests ('keep 40 Iron Plate, 20 Gear, 10 Brick'). They pull from the depot above, relay depot to depot, and use the same cab slots, like Factorio Space Age's landing-pad requests under a rocket-capacity cap. Hand-built belts then carry only production cargo, and the per-layer decision becomes how to spend 24 items/min: construction stock, fuel or product.


## 2. [Critical] Pillar 1: Sapstone, wash vs separate

**Problem:** [math] The Separator yields 1 Cobalt Ore : 1 Resin (PLAN 7.2). D3 needs 120 Cobalt Ore (30 Drill Heads × 2 ingots × 2 ore) and 100 Resin (40 Insulation × 2 + 20 Filter × 1), a 1.2:1 ratio. Whole-game demand (D3, ~70 Batteries, ~85 Resonant Cores' Insulation, insulated belts) is about 480 : 360, or 1.3:1. Separate-only overproduces resin by 20–30%, which is too little to back up during Act III, so the Washer is just a cobalt top-up. The knowledge card's 'split the stream' (PLAN 6 L2) is not true at these numbers. PLAN's '~160 Cobalt Ore' also doesn't match the recipes, which give 120.

**Why:** Sapstone is the pitch's first promise of a material that changes your factory, and its only choice has one right answer.

**Fix:** Make resin a byproduct you have to manage, as in Factorio's oil processing: fixed-ratio outputs back up and stall the line unless you balance them.
- Change Insulation from 2 Resin + 2 Mycelium to 1 Resin + 2 Mycelium. D3 becomes 120 cobalt : 60 resin (2:1), and the whole game is about 2:1.
- Separate-only now fills the side output and stalls the Separators (PLAN 5.3), so roughly half the Sapstone has to go to Washers, which must touch water (a placement cost).
- Add one resin sink so the stall is a choice, not a wall: the Combustion Generator burns Resin at 60 kW per 4 s.


## 3. [Critical] Pillar 1/5: Emberite routes and hot items (DECISIONS 14)

**Problem:** [doc] PLAN 5.2 allows direct machine-to-machine insertion everywhere, and PLAN 5.10 says machine buffers keep heat. A 2×2 Pressure Forge fits the 2-tile hot band (PLAN 6 L4). Place a Precision Assembler against its output face, just off the band, and it takes ingots straight in: no belt, no heat loss, no Insulated Belt, no resin. That deletes DECISIONS 14, the Insulated Belt, and the layer-2 to layer-4 link the whole-game loop promises (PLAN 4). [math] The three routes don't compete either. If Emberite deposits follow the Surface's 3×3–4×4 sizes, each holds 1–4 miners at 30/min, or 90–360/min in total. D5 needs only 180 Emberite (60 for 30 ingots + 120 for 40 Heat Shields) over a 40–60 min act. You cool, burn and forge without giving anything up.

**Why:** Layer 4's material and its signature logistics problem collapse into a recipe checklist with an unused belt type.

**Fix:** (1) The Precision Assembler needs 'steady ground', at least 8 tiles from any hot ground. An Ember Core needs ingot heat of at least 50.
(2) Plain-belt cooling goes from 8 to 12 heat/s. Plain-belt range is then (100−50)/12 × 1.5 ≈ 6 tiles, so an 8-tile run arrives at 36 heat and fails, while an Insulated Belt (1.3/s) reaches about 57 tiles. Resin now solves layer 4 for real; Factorio's heat pipes work the same way (distance costs heat, so layout matters).
(3) Emberite comes from 3 single-miner 2×2 vents, a hard cap of 90/min. A scaled D5 build wants 2 Forges (40/min) + 1 Thermal Extractor (20) + 2 Cooling Baths (40) = 100/min, so power vs. cores vs. shields becomes a live trade.


## 4. [Critical] Scope: all six layers in one session (ROADMAP Phases 1–5)

**Problem:** [doc] On top of the engine, the roadmap needs about 20 systems:
- belts and 7 logistics blocks, per-layer power with shaft cables, an elevator simulation and depots
- dithered darkness and light, excavation, hidden caverns and surveys
- assays with knowledge cards, contracts, licenses, requisitions and elevator upgrades
- 6 bespoke rule modules: spore field, line-of-sight interference with shields and taps, overcharge shatter, item heat, hot ground with foundations, and conduits with ordered nodes and the Sequencer
- 45 items, ~38 buildings, 34 milestones, the Stack UI and audio
- a pacing bot that has to build factories by itself
- ~130 sprite names on a 500-generation budget (STYLE manifest)
[taste] Every tuning problem in this review surfaces only in play. Building all six layers before anyone plays Act III typically produces a polished Act I and five thin, untuned layers.

**Why:** A 'complete' six-layer game with untested layers is less fun than a tuned shorter one, and the hardest design problems sit in Acts III–VI.

**Fix:** - Gate the build: Phases 1–2, then Acts II–III (first strange material and first hazard) as a vertical slice. indie-critic must play to D3 and sign off before any Act IV code.
- Make the pacing bot place authored per-milestone layouts (scenario blueprints) by script, not plan factories on its own.
- Take the cut list, which removes about 8 systems.
- Decide a contingency now: if the D3 sign-off lands after ~60% of the session, merge the Magma Shelf and Alien Strata into one final layer. Magma becomes the Engine's heat with conduits alongside, the layer has Emberite + Thrumstone, and the Governor needs Ember Cores + Heartstones + Batteries. That saves one terrain set, one map, one hazard module and 4 milestones.


## 5. [Major] Six-layer arc: time to the first strange material (Act II)

**Problem:** [math] Act I takes 15–25 min and Act II 30–45 min (PLAN 8), so Sapstone arrives 45–70 min in. Act II has no signature material and no decision. The Shallows holds the Surface's ores at ×1.5–2 plus coal (PLAN 6 L1). Its 7 milestones before D2 include pure chores (#9 'place 3 Lamps; excavate 20 tiles', #12 'send 80 items', #14 'dig to the bore site'). [taste] A browser player sold on materials that stop behaving like materials (PLAN 0) gets about an hour of iron, and once the Shallows out-produces it, the Surface turns into a bank.

**Why:** Web players decide early whether the hook is real, and this hook arrives after most of them would have left.

**Fix:** Bring the Act II target from 30–45 down to 20–30 min by cutting setup, not the project:
- Start pocket 16×12 → 22×14, with iron and coal inside.
- Fold milestone 9 into 8, 12 into 13 and 14 into 15 (7 milestones → 4).
- Put a sealed Sapstone outcrop and a Mags line in the bore-site cavern (it can't be mined yet), so the first strange thing is seen at about 30 min.
SteamWorld Dig and Dome Keeper show their first oddity within 10–15 minutes.


## 6. [Major] Pillar 5: hazards are zones you can avoid (PLAN 3 'build anything anywhere')

**Problem:** [doc] Hazards are written as layer rules (PLAN 5.10), and PLAN 3 says you can build anything anywhere.
- Spores: no rule puts Sapstone inside a spore field (PLAN 6 L2 lists deposits only). If the deposits sit more than 8 tiles from glowcaps, the Spore Filter is just a milestone checkbox.
- Heat: the hot band is only 2 tiles wide, so you simply don't build there, and Foundations are optional.
- Relocation: you can ship Chorus Crystal to L1/L2, or to L5 conduits with free power. If interference is a Crystal Depths rule, the crystal line then has no hazard at all. The doc never says whether conduit-powered machines count as 'powered'.

**Why:** A hazard you can step around is a tax on careless players, not an engineering problem that turns into a tool.

**Fix:** Write hazards as physics, not zones: interference applies wherever crystal machines run, conduit-powered machines included, and spores exist wherever glowcaps grow.
- Place 2 of the 3 Sapstone deposits 3–5 tiles from a glowcap patch (density 0.4–0.7, so 20–35% slower).
- Put every Emberite vent inside the 2-tile band, so miners run at 50% until 2 Foundations go down.
- Heat falloff: 50% speed within 2 tiles, 75% at 3–4 tiles.
This creates the bootstrap: slow first miner → Cooling Bath → Aggregate → Foundations → full speed. Oxygen Not Included treats heat and germs as physics everywhere, which is why its fixes become tools.


## 7. [Major] Act VI: the Engine and Thrumstone (Pillar 5, PLAN 5.10, PLAN 12)

**Problem:** [doc] Conduits give free power with no downside (PLAN 5.4), so the Engine never slows you down at first, as Pillar 5 requires. PLAN 12 itself calls the Sequencer 'a one-building solution' to the Engine Node rule. Thrumstone's decision is just 'put the Attuner on a conduit', which is a placement rule. How much of a 2×2 footprint must sit on a conduit is also unspecified. [taste] The final act becomes the easiest layer in the game, followed by a delivery list.

**Why:** The last 30–45 minutes should test everything the player learned, not be a victory lap.

**Fix:** - Conduits start dormant and dark. Running an Engine Node wakes the conduits within 15 tiles: they light up (Pillar 7), give free power and open Attuner sites.
- Node 1 takes Battery and Resonant Core in A/B order, both shipped down from L3, which tests the shaft chain.
- Nodes 2–3 want a 3-step pattern (Engine Glass, Engine Glass, Resonant Core) via a Sequencer pattern setting. The puzzle becomes feeding a 2:1 ratio from two layers.
- Each live conduit segment carries 150 kW; overloading it slows its machines like a grid, so conduit tiles are contested.
- At least 2 footprint tiles must be on the conduit.


## 8. [Major] Crystal Depths: interference, Resonance Tap, overcharge pair (DECISIONS 13)

**Problem:** [math] The Resonance Tap pays 20 kW per interfering 'powered machine' (PLAN 5.4/5.10). Sorters and Unloaders draw 1 kW (PLAN 7.3), so a Tap ringed by 6 Unloaders nets about +114 kW from scrap. That is the best power plant in the game, and it flattens L3's otherwise excellent power decision. [math] Overcharged crystals must go directly from the Overcharger into an adjacent Stabilizer (PLAN 5.10). Two edge-adjacent 2×2 machines have centers 2 tiles apart and no free tile between them for a Shield Wall, and the Stabilizer is powered (15 kW). The Overcharger therefore always loses at least 25%. The advertised 'small puzzle of placement and shielding' (DECISIONS 13) has no solution, only a fixed tax.

**Why:** The layer whose identity is a layout puzzle ships with one exploit and one unsolvable puzzle.

**Fix:** - The Tap gives +20 kW per working interferer that draws at least 8 kW, up to 6. A real ring of 6 Presses draws 48 kW for +72 kW net; 6 Assemblers draw 90 kW for +30 kW net. The price of the power is a noisy production block.
- New rule: machines joined by direct insertion don't interfere with each other. The puzzle becomes shielding that pair from everything else within 4 tiles, solvable with 2–4 Shield Walls.
- Show the predicted speed on the placement ghost, the way Factorio's beacon ghost highlights what it will affect.


## 9. [Major] Pillar 1: Chorus Crystal 'order matters'

**Problem:** [doc PLAN 6 L3] Each product has exactly one valid order: Cut→Charge gives Charged Crystal, Crush→Charge gives Conductive Powder, and Overcharge→Stabilize gives a Resonant Core. The remaining order, Charge→Crush, is a pure trap that turns an $18 Charged Crystal into 2 Grit worth $3 each. It is a recipe tree with a gotcha: the player reads the card and builds what it says. [math] Supply isn't scarce either. D4 needs about 170 crystals from multi-miner deposits, so the products never compete for crystals.

**Why:** 'Order matters' becomes a decision only when two orders reach the same goal at different costs.

**Fix:** Turn the trap into a high-yield route: 'Crush charged' becomes 1 Charged Crystal → 2 Conductive Powder in 8 s.
- Cheap route (Crush → Charge grit): 1 powder per crystal, one sensitive machine.
- Rich route (Cut → Charge → Crush): 2 powder per crystal, but two sensitive machines to shield and about 1.2× the machine-time.
Make Chorus 3 single-miner vents (90/min cap). By Act V, the circuit load (~40 powder/min for a 6-min D5) plus Battery and Core crystals pushes players toward the rich route and makes them decide which line gets the Chargers. This is how Satisfactory's alternate recipes work: same output, different input and footprint.


## 10. [Major] Economy: money vs goods (Pillar 3, PLAN 5.6/5.8)

**Problem:** [math] Milestone rewards rise 80× ($100 → $8,000, $40,700 in total) while digging costs rise only 7.5× ($4 → $30 per tile). Act VI pays $18,000, against about $9,000 to dig 300 tiles at $30. Late money then has one large sink: Requisition at 3× value. Nothing stops requisitioned goods being unloaded into a drill, and the Governor's 40 Batteries ($5,400) plus 20 Ember Cores ($9,600) cost $15,000, so money buys out the finale's cross-layer logistics. [math] Act I is flush too: $400 + $45/min of starter income + $700 in rewards, against about $600 of spending the player actually needs (the 60 → 100 kW line upgrade).

**Why:** Pillar 3's 'rich and still stuck' breaks exactly where it matters most, at the finale.

**Fix:** - Requisitioned goods are 'Company stock': construction only. They can't be unloaded or delivered to a drill, node or contract.
- Each repeat order of the same item on a layer costs +50%, resetting at the next breakthrough.
- Flatten late rewards: Act V to about $6,000 in total, Act VI to about $7,000.
- Give money option-sinks: Mk2 shafts ($2,000 + goods), contract re-roll ($200), and a Company Line extension down one shaft ($1,500 for +60 kW).


## 11. [Major] Onboarding: the first 5 minutes (PLAN 5.13 milestones 1–3, PLAN 6 L0)

**Problem:** [doc] The opening line is Miner → Smelter → Terminal, so the rule everything rests on (buildings are paid from the depot) isn't on screen until milestone 3. By then milestone 2 has spent about 27 of the HQ's 60 Iron Plate: Miner 8, Smelter 4 and ~15 belts at 1 plate each (PLAN 7.3). An eager belt drag leaves blue planned ghosts with no visible cause. [math] Milestone 1 ('watch') asks nothing of the player. Milestone 2 needs about 9 inputs (tab, Miner, place, Smelter, place, Belt, 2 drags, a rotate) plus finding the copper deposit. That's roughly 60–90 s for a new player, right at the 60 s target.

**Why:** The first minute should teach the loop the game depends on (factory → depot → construction), and right now it teaches 'machines make money'.

**Fix:** - Starter line: Miner → Smelter → Splitter, feeding both the Terminal and a Press → HQ. The HQ's plate count ticks up in frame 1, and build-bar costs read like 'HQ 63/8'. Mindustry's first lesson does the same: drill → conveyor → core, and the core pays for everything.
- Milestone 1: 'click the sparking Drill' (1 click, ~5 s) opens the D1 list, so the long goal is visible.
- Milestone 2 pre-places a blue copper-Miner ghost, making the first build 1 click + 1 belt drag (30 s or less).
- HQ starting Iron Plate 60 → 100.


## 12. [Minor] Pacing: scaling vs waiting (Pillar 2, PLAN 8)

**Problem:** [math] PLAN 8 wants unscaled drill ETAs over 30 min. D1 needs 130 Iron Ingots (40 plate + 30 gear + 60 for the Reinforced Plate); the starter line makes 15/min, so about 9 min at 1× and about 3 min at 3×. D2's 260 ingots from one rich miner and two smelters (30/min) is about 9 min of iron. With a 3× toggle, any 1× ETA under ~30 min is cheaper to wait out than to scale, which undercuts 'making 40 a minute is the game'.

**Why:** If waiting beats building, players learn to wait.

**Fix:** - Size D2–D5 to about 8 min of a deliberately scaled line and at least 40 min of the starter-crate line (scaled ≈ 5× starter). The pacing bot asserts both ETAs for each project.
- Game speed 1×/2×/3× → 1×/2×.
- D1 can stay short as the tutorial.
Factorio and Satisfactory ship no fast-forward, because waiting is the problem you solve by building.


## 13. [Minor] Economy: selling from deep layers (PLAN 5.8, DECISIONS 7)

**Problem:** [doc] The Shipping Terminal is Surface-only, and bore sites sit 25–40 tiles from each arrival shaft (PLAN 5.7). Selling from L4–L5 means 4–5 elevator hops and a ~30-tile belt across every layer in between. [taste] Players will stop selling deep goods, and the sell-vs-use tension dies below L2.

**Why:** The money side of Pillar 3 works only if selling is a live option on every layer.

**Fix:** - Add a 1×1 Company Chute at every depot that sells at 60% of value instantly. Full value and contracts stay at the Surface Terminal, so 'ship it up for +67%?' becomes the decision. Satisfactory lets you build its AWESOME Sink anywhere for the same reason.
- Shorten the bore-site distance from 25–40 to 12–20 tiles.


## 14. [Minor] Doc consistency: rules the build will trip on

**Problem:** [doc] Open questions and contradictions:
- Engine Node: 'alternating EG, RC, EG, RC' (5.10) vs 'Engine Glass, Resonant Core ×2' (7.2). How many of each per Heartstone?
- The conduit footprint rule is unstated.
- Do elevator bays and cabs keep heat?
- On hot ground, 'ordinary machines overheat' but 'smelters run 50% faster'. Which machines are exempt?
- For interference, does 'powered machine' mean working, and do conduit machines count?
- Does the arrival station feed the depot directly? If so, sorters never matter.
- Are contract deliveries counted only at the Terminal?
- D3 is stated as '~160 Cobalt Ore', but the recipes give 120.
- The pitch (PLAN 0) promises 'insulated Ember Cores through three layers', but Ember Cores aren't hot and no rule moves hot items across a shaft.

**Why:** Each ambiguity gets settled ad hoc in code, and that is how a simulation drifts from its design.

**Fix:** Add a one-line-per-rule glossary to PLAN §5:
- A Heartstone is 2 Engine Glass + 2 Resonant Cores in A/B order.
- At least 2 footprint tiles must be on a conduit.
- Bays and cabs cool items at the plain-belt rate.
- Heat-loving machines are the Smelter, Foundry and Pressure Forge.
- An interferer is working and draws at least 8 kW, conduit machines included.
- Request cargo lands in the depot; all other cargo exits the station's output face.
Fix the D3 number and rewrite the pitch line to something the rules deliver.


## Number changes

- **Elevator Mk1**: cab 8, 10 s round trip = 48/min → cab 4 = 24/min — Peak drill-project imports are 12–24/min, so 48/min never binds and Pillar 4 is hollow.
- **Elevator Mk2**: cab 16, 8 s = 120/min → cab 10, 8 s = 75/min (cost unchanged) — Still a real relief step, and it stays under one belt (90/min).
- **Elevator Mk3**: cab 32 = 274/min, $8,000 + goods → cut — No planned flow needs it.
- **Insulation recipe**: 2 Resin + 2 Mycelium → 1 Resin + 2 Mycelium — D3 cobalt:resin goes from 1.2:1 to 2:1, so separate-only stalls on resin and the Washer earns its place.
- **Combustion Generator fuels**: Coal 80 kW / Biofuel 120 kW → also Resin, 60 kW per 4 s — Gives surplus resin a sink, so the stall is a choice rather than a wall.
- **Plain-belt cooling and hot-ingot threshold**: 8 heat/s, any heat > 0 counts as hot → 12 heat/s; an Ember Core needs ingot heat of at least 50 — Plain-belt range drops to about 6 tiles, so insulation is needed for real layouts.
- **Precision Assembler placement**: anywhere (direct insertion from the Forge allowed) → at least 8 tiles from any hot ground — Closes the direct-insertion bypass of the whole hot-item mechanic.
- **Emberite deposits**: 3 deposits, likely 3×3–4×4 (1–4 miners each, 90–360/min) → 3 single-miner 2×2 vents (90/min cap) — A scaled D5 build wants about 100/min, so cool, burn and forge compete.
- **Chorus Crystal deposits**: 3 multi-miner deposits → 3 single-miner vents (90/min cap) — Makes the high-yield route worth its extra machines by Act V.
- **Crush charged recipe**: 1 Charged Crystal → 2 Crystal Grit, 3 s → 1 Charged Crystal → 2 Conductive Powder, 8 s — The trap becomes a real alternative route to the same product.
- **Resonance Tap output**: +20 kW per powered interferer, max 6 → +20 kW per working interferer drawing at least 8 kW, max 6 — Stops the 1 kW Unloader ring (+114 kW net from scrap).
- **Overcharge pair interference**: adjacent Stabilizer always interferes (always at least 25% loss) → machines joined by direct insertion don't interfere with each other — Makes DECISIONS 13's puzzle solvable.
- **Heat field**: 2-tile hot band, 50% speed → 50% speed within 2 tiles, 75% at 3–4 tiles; Emberite vents inside the band — Heat has to bite before Foundations become the tool.
- **Sapstone placement**: unspecified → 2 of 3 deposits 3–5 tiles from a glowcap patch (density 0.4–0.7) — Spores slow the core line by 20–35% until it is filtered.
- **Conduit power**: unlimited, always on → dormant until a nearby Engine Node runs, then 150 kW per live segment — Gives the Engine a problem phase and makes conduit tiles contested.
- **Requisition**: 3× value, any good, any use → 3× value, +50% per repeat order of an item per layer (resets at breakthrough), construction only, cannot be unloaded — Stops $15,000 from buying the Governor's Batteries and Ember Cores.
- **Milestone rewards, Acts V–VI**: $9,500 + $18,000 → about $6,000 + $7,000 — Rewards rose 80× while digging costs rose 7.5×, so late money is flush.
- **Bore-site distance from the arrival shaft**: 25–40 tiles → 12–20 tiles — Fewer pass-through belts per hop.
- **Act II time target**: 30–45 min → 20–30 min — The first strange material should arrive within about 45 min, not 45–70.
- **Shallows start pocket**: ~16×12 → ~22×14 with iron and coal inside — Less paid digging before the first build.
- **HQ starting Iron Plate**: 60 → 100 (plus a starter Press feeding the HQ) — Milestone 2 spends about 27 plates; the depot should be taught before blue ghosts appear.
- **Game speed**: 1× / 2× / 3× → 1× / 2× — Waiting must not beat scaling.
- **Drill project sizing rule**: unscaled ETA over 30 min → at least 40 min at the starter-crate rate and about 8 min scaled, asserted by the pacing bot — D1 and D2 currently finish in about 9 min unscaled.

## reverse_decisions

- DECISIONS 3 (one item per tile is fine 'because elevators are the real bottleneck'): the reason is false at plan numbers. Mk1 moves 48/min, and peak drill-project imports are at most 24/min. Keep the belt rule and make the reason true: Mk1 at 24/min.
- DECISIONS 6 (per-layer depots, supplied by hand): keep separate stockpiles, but add depot-to-depot supply requests that ride the shafts and use cab capacity. The hand-plumbed version creates per-layer chores, not decisions.
- DECISIONS 7 (bore sites far apart, so cargo changes elevators): keep the offset, but shrink it from 25–40 to 12–20 tiles and add per-layer Company Chutes. Hand-belting goods through 4–5 hops just to sell them is pure tax.
- DECISIONS 8 (infinite deposits at fixed rates): keep this for base ores, but make the four exotic deposits single-miner vents with fixed caps. Otherwise no strange-material route ever competes for input.
- DECISIONS 13 (overcharge vs interference puzzle): as written it can't be solved, because the directly-inserting pair always interferes. Amend it so direct-insertion partners don't interfere.
- DECISIONS 14 (hot items cool on belts): direct insertion bypasses it. Amend with the Precision Assembler steady-ground rule (at least 8 tiles from hot ground) and 12 heat/s on plain belts.
- DECISIONS 12 (one hazard per layer, each with a turn): the Engine has no problem phase. Amend with dormant conduits that running Engine Nodes wake, at 150 kW per segment.
- PLAN 3 'Layers are suggestions, not rules': hazards have to be physics that travel with the machines. Otherwise relocating a line dodges every hazard.

## cut_list

- Merger: belt side-loading with alternating back priority already merges two lines (PLAN 5.2).
- Express Belt and its $3,000 license: no planned flow needs more than 90/min on one belt, especially with Mk1 at 24/min and Mk2 at 75/min.
- Elevator Mk3.
- Storage Crate license: depots buffer 999 per item and Unloaders pull from them. If the crate stays, make it free.
- Survey (F, $150 × layer): let deposits glint through up to 6 tiles of rock near any light instead. That's one fewer paid action and key.
- Assays for Glowcap, Resin, Charged Crystal and Engine Glass: unlock these on first production. Keep the four signature-material assays, which preserves the point of DECISIONS 11.
- Milestones 9 (Lamps and 20 tiles of digging), 12 (Freight 80) and 14 (Bore Site): fold them into their neighbors.
- Three save slots: ship v1 with one autosave slot plus export/import.
- Distance-mixed machine loops for each family: v1 gets the hum and jsfxr SFX only.
- Endless contracts and the post-ending stats screen: defer them. The ending plus 'keep playing' is enough for v1.
- Contingency, decided now: if the D3 vertical slice isn't signed off by about 60% of the session, merge the Magma Shelf and Alien Strata into one final layer.

## working

- [math] Act I's power squeeze is well tuned. The starter line draws 20 kW, and by milestones 5–6 the Surface needs about 76–91 kW against the 60 kW Company Line, so the first money decision ($600 for 100 kW) lands naturally inside the tutorial.
- [math] Crystal Depths power is a genuine three-way decision. You can ship coal (4 generators need 60 coal/min, more than even the current Mk1 carries), pull shaft power (60 kW on Mk1, 150 kW on Mk2 for $2,000 + goods), or build Resonance Taps beside a noisy block. Keep it once the Tap exploit is fixed.
- [taste] Pillars 8–10 (never destroy the player's work, every rule visible, open on a running line) plus planned ghosts are the right foundation for browser players. A Governor that pulls from layers 3, 4 and 5 is a proper 'one machine' climax.