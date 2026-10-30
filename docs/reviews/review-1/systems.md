# Systems review

## Verdict

The structure is solid, but the numbers aren't ready to go into src/data. Three problems block the build. (1) Drill projects are 2 to 4 times too small for the PLAN §8 targets. With one machine per recipe they finish in 8 to 17 minutes against the >30 minutes §8 asks for, and D3 and D4 need less work than D2. (2) As written, the Resonance Tap rule gives unlimited free power. (3) A new layer cannot power its own starter crate: the Shallows needs Motors to build a generator, and needs a generator to make Motors. Below those come a set of Majors. Slag has no use and stalls the Thermal Extractors. Requisition lets money buy drill goods. The elevators never limit throughput. Washing vs separating is not a real choice at D3. A forge placed next to its assembler skips the hot-item rule. Interference, the Engine Node and hot items in containers all need exact rule wording. Most chains also produce fractional machine counts. The clean-ratio set below fixes that: one normal miner (30/min) feeds whole machines all the way down every chain. With it, the project sizes below meet the §8 bands and keep the game inside 4 to 6 hours.



## 1. [Critical] §5.7 drill projects + §8 pacing rule

**Problem:** [math] With the first working chain (one machine per recipe; 30/min miners, 60/min where §6 says rich) the projects finish in D1 8.7 min, D2 17.3, D3 8.3, D4 8.0, D5 16.0 and the Governor 12.0. The bottlenecks are iron smelting, separating, grit charging and attuning. §8 asks for more than 30 min. Total work in machine-minutes is D1 37, D2 79, D3 64, D4 75, D5 117 and Governor 129, so D3 and D4 need less work than D2 even though Acts III–IV get 40–60 min. Finishing any project in 8 min takes only 12–31 machines (1–2 per recipe). The biggest flow any project needs is 120 Steel Beam in 8 min = 15/min, so pillar 2's '40 a minute' never happens. [doc §8] 'Unscaled starter line' is never defined. The literal starter line (1 iron miner + 1 smelter) can't make D1 at all, so the pacing bot has nothing to check.

**Why:** [taste] The §4 'Minutes' loop (find the bottleneck, then expand) only exists if the first chain is visibly too slow. Today the player just waits about 10 min, or 3–6 min at 3× speed. The new sizes stay inside 4–6 h if each scaled line takes 20–30 min to build.

**Fix:** Define in §8: the first chain is one machine per recipe; the scaled line is whatever finishes in 10 min. Targets: first chain 25–35 min, scaled line 24–45 machines, machine-minutes rising every act. Exempt D1 as the tutorial (~9 min, inside Act I's 15–25 min). With the clean-ratio recipes, the new quantities in number_changes give first-chain ETAs of D2 34.7, D3 26.0, D4 26.7, D5 26.7 and Governor 32.0 min. Their 10-min lines need 24 / 30 / 37 / 38 / 45 machines, and the work is 171 / 216 / 269 / ~275 / 247 machine-minutes. Have tests/pacing.test.ts check both reference lines.


## 2. [Critical] §5.4 power + §5.10 Resonance Tap

**Problem:** [math] The doc says 'every powered machine creates interference' and that a Tap makes '20 kW for every machine interfering with it (up to 6)'. Read literally, several exploits follow. (a) Taps are powered machines themselves: a 3×3 block of nine Taps sees 3–8 neighbours each and makes 760–1,000 kW (depending on whether 'within 4' includes 4), for 36 Circuit + 90 Copper Wire, with no fuel and no work. (b) If idle machines count, 6 unfed Presses give 120 kW while drawing 0 kW. (c) If 1 kW Sorters count, 6 Sorters give 120 kW for 6 kW. Any one of these makes coal, biofuel, Thermal Extractors and shaft cables pointless from Act IV on. [doc §5.4] Three more things are unspecified: how surplus crosses several shafts with 60 kW caps when two layers are short; whether a slowed machine (spores or heat at 50%) still draws full power; and the loop where Tap output sets supply, supply decides which machines work, and working machines set Tap output.

**Why:** [math] With the rule fixed the numbers are good. A Tap ringed by 6 working Presses (48 kW drawn) nets +72 kW. D4 wants a 208 kW peak on the Crystal Depths today (433 kW at the proposed size) against a 60 kW Mk1 cable, so Taps plus shielding become the intended layout puzzle.

**Fix:** Rule text: 'Only 2×2-or-larger production machines that worked last tick cause interference. Taps, generators, extractors, sorters, unloaders, sequencers and Stabilizers cause none.' Taps count last tick's working machines, which removes the loop. Power solve each tick: compute each layer's own balance, then move surplus across each shaft (up to its cable cap) toward the nearest short layer, one pass top-down and one bottom-up. A layer still short runs at supply/demand. A working machine draws its full rating even when a hazard slows it.


## 3. [Critical] §5.6 starter crates, §6 layers 1–5, milestones 5, 8–13, 16, 22, 27, 31

**Problem:** [math] By M6 the Surface draws 91–99 kW (3 miners 24, 3 smelters 36, 2–3 presses 16–24, assembler 15) against 60 kW, so everything runs at 66%. After the $600 upgrade to 100 kW, only 1–9 kW is left to send down the Mk1 cable. The Shallows crate (2 Miners, 2 Smelters, 40 belts = 64 Iron Plate, 8 Gear, 16 Brick) holds no Motor and no Copper Wire. Yet the Combustion Generator (M10) and the Foundry (M11) need 2 Motors each, and M9's 3 Lamps need 3 Wire. Making Motors locally takes an Assembler, 2 Presses and copper + iron lines (~71 kW), which can't run before the Generator exists. Freight (M12) and Motors (M13) are taught after both are needed. Escapes exist (ship Motors down, or requisition 4 × $72), but nothing points to them. The deeper layers have the same problem. On L2–L5 the first milestone is an assay. The Assay Lab costs 10 Copper Wire + 10 Brick, and L2, L4 and L5 have no copper or stone (L3 has no stone). L4's power from above is whatever L3 has spare, and L3 has no coal. No milestone teaches the Company Line upgrade, although the Surface passes 60 kW at M5 (76–84 kW).

**Why:** [doc DECISIONS #6] Starter crates are the plan's stated answer to depot friction. Today the first minutes on a new layer can't run anything.

**Fix:** Open every underground layer with a running rig (pillar 10 applied to each layer): a pre-built coal Miner and Combustion Generator on the start-pocket coal. L1, L2, L4 and L5 have coal; L3 runs on the L2 cable. Each crate also carries the goods for its layer's first-milestone building (the Assay Lab on L2–L4, the Attuner on L5), plus 20 Copper Wire on L1. Reorder Act II: Down the Shaft, Lights, Motors, Coal Power, Steel, Freight, Bore Site. Add 'upgrade the Company Line' as a step of M5.


## 4. [Major] §7.1/§7.2 Slag, Thermal Extractor; §5.3 'a full output stops the machine'

**Problem:** [math] Slag ($1) has no recipe, no building cost and nowhere to go below the Surface, and a full side output stops the Extractor. One Extractor makes 20 Slag/min, enough to fill the Magma depot's 999 cap in 50 min (17 min with three Extractors). After that the layer's main power source stops. The only other outlet is hauling $1 trash up four shafts, and 20/min is 42% of a 48/min Mk1 elevator on every one of them.

**Why:** [doc §5.12] Never destroying items is a good rule, but it needs a use or sink for every byproduct.

**Fix:** Give the Cooling Bath a second recipe, 'Quench Slag: 2 Slag → 1 Aggregate, 4 s' (30 slag/min, one Bath per Emberite Miner's two Extractors). Burning Emberite then yields 220 kW plus ½ Aggregate, against 1 Aggregate for quenching it, so the 'three routes' stay a real trade.


## 5. [Major] §7.2 recipe times (ratio pain)

**Problem:** [math] From one normal Miner (30/min) almost every chain lands on fractions. Iron Plate and Copper Wire presses at 3 s take 20 ingots/min against a Smelter's 15, so 0.75 Press per Smelter. A Motor needs 22.5 wire/min. Reinforced Plate takes 20 Plate + 10 Brick/min. A Cobalt Ingot at 6 s takes 20 ore/min against a Washer's 30, so 1.5 Smelters per Washer. The Separator at 5 s makes 12/min, so 2.5 per Miner. Mycelium at 3 s needs 1.5 Presses per Harvester. Biofuel takes 48 dust/min (1.6 Collectors) and feeds 1.2 Generators. The Crusher at 3 s makes 40 grit/min against a grit Charger's 30. The Charger at 5 s (12/min) follows a 15/min Cutter. The Overcharger at 10/min is welded to a 7.5/min Stabilizer. A Circuit needs 20 powder/min, which is 1.33 Chargers. The Forge (10/min) against the Precision Assembler (6/min) is 3:5. The Cooling Bath, Extractor and Attuner each take 20/min, so 1.5 per Miner. A hot-ground Smelter at ×1.5 takes 45 ore/min. Odd-sized deposits (3×3) force partial miners at 7.5, 15 or 22.5/min.

**Why:** [taste] A ratio puzzle like 4 smelters : 3 presses is fun once. Here it shows up in nearly every chain, including the tutorial.

**Fix:** Adopt the clean-ratio set in number_changes. Every machine then runs at 7.5, 15 or 30/min, so one normal Miner feeds whole machines. Examples: Miner → Smelter → Press 1:1:1. 1 gear Press + 1 wire Press → 1 Motor Assembler. 1 Sapstone Miner → 3 Separators → 1 Cobalt Smelter + 3 Insulation Assemblers. 1 Chorus Miner → 2 Crushers → 2 grit Chargers → 2 Circuit Assemblers (with 2 wire Presses). 1 Charger → 2 Overcharger/Stabilizer pairs. 1 Forge → 1 Precision Assembler. 1 Thrumstone Miner → 2 Attuners → 1 Engine Node. Size deposits in even tiles so 2×2 miners tile them at full coverage.


## 6. [Major] §5.6 Requisition, §5.8 contracts, §5.14 free play

**Problem:** [math] Requisition puts goods into a depot, and an Unloader can pull any depot item onto a belt into the Drill or the Terminal. So drill projects can be bought. Today's D4 Circuits + Batteries cost 60 × $30 × 3 + 30 × $45 × 3 = $9,450. D5's Heat Shields + Circuits cost $11,400, and the Governor's 40 Batteries $5,400. Compare Act V–VI rewards of $9,500 and $18,000, plus shipping, where one shipped Resonant Core pair earns $675/min. That breaks pillar 3 and DECISIONS #10 from Act IV on. Limiting requisition to construction goods doesn't close the hole, because removing a building refunds 100% to the depot: rush an Overcharger, remove it, and 2 Battery + 4 Circuit + 4 Steel Beam are in stock. Free play's 'rising payouts' become an infinite money loop as soon as a contract pays more than 3× value: requisition, unload, deliver.

**Why:** [doc pillar 3] 'You can be rich and still stuck.'

**Fix:** Make requisition rush a planned ghost instead of stocking a depot: pay 3× the value of its missing goods and it builds immediately. A rushed building refunds only the goods that came from the depot. Cap every contract at 2.5× value, free play included.


## 7. [Major] §5.5 freight elevator; DECISIONS #3; §12 Risks

**Problem:** [math] The elevators never limit anything. Cross-layer goods per project: D3 30 Drill Bits (L2 has no stone for Brick), D4 60 Cobalt Ingot + 20 Insulation, D5 120 Circuit, Governor 60 Resonant Core + 40 Battery + 20 Ember Core. That is 0.6–2.5 min of a 48/min Mk1, at most 15/min (31% load) over an 8-min project. Construction imports add a few hundred items per layer. So Mk2 and Mk3 ($2,000 / $8,000 plus goods, per shaft, across 5 shafts) only matter for their power cable. The rates also don't fit the belts. If the output face feeds one belt (the doc doesn't say), Mk2's 120/min drains through a 90/min conveyor. Mk3 is 32 items per 7 s = 274.3/min, more than one express belt (180) or even three conveyors (270).

**Why:** [doc DECISIONS #3] If these changes are rejected, remove the 'elevators are the real cap' claim instead.

**Fix:** Set Mk1/Mk2/Mk3 to 45/90/180 per minute (cab 6/9/15, round trip 8/6/5 s): half a conveyor, one conveyor, one express belt, with the station's output face feeding one belt. Remove the Crystal Depths copper deposit so circuit wire comes down from the Shallows. The proposed D4 (200 Circuit = 800 wire = 400 Copper Ingot) then sends 400 Copper Ingot + 200 Cobalt Ingot + 60 Insulation = 660 items through the Fungal→Crystal shaft. That is 66/min over a 10-min run, so Mk1 (45/min) becomes the limit and Mk2 is a real Act IV choice. Shipping ingots instead of wire halves the cargo, which is the pillar-4 lesson.


## 8. [Major] §6 Layer 2 'the decision' (wash vs separate), D3

**Problem:** [math] D3 needs 120 Cobalt Ore (30 Cobalt Drill Head × 2 Ingot × 2 Ore), not 'about 160' as §6 says, and 100 Resin (40 Insulation × 2 + 20 Filter × 1). Separating 100 Sapstone already yields 100 ore + 100 resin, so a player who only separates is short just 20 ore. The Washer saves 20 separations, which is 100 s of one Separator. Splitting the stream isn't a real decision in Act III; washing only starts to matter at D4 (cobalt for Batteries). [taste] The three Emberite routes have the same weakness: deposits are infinite (DECISIONS #8), so all three can simply run in parallel.

**Fix:** Change Insulation to 1 Resin + 1 Mycelium (6 s) and D3 to 100 Cobalt Drill Head, 200 Insulation, 60 Filter. That needs 400 ore against 260 resin: separate 260 (26 min on one Separator at 6 s) and wash 140 (4.7 min on one Washer). Both machines earn their place, and the Separator is D3's bottleneck. For Emberite, the slag recipe in issue 4 turns burning vs quenching into a trade: 220 kW + ½ Aggregate against 1 Aggregate.


## 9. [Major] §5.10 hot items; DECISIONS #14; §7.1 Molten value

**Problem:** [math] (a) The Pressure Forge has to sit on the 2-tile hot band. A Precision Assembler placed against its output face takes the ingot by direct insertion (§5.2 allows it) with 0 tiles of travel, so cooling and the Insulated Belt never matter. (b) The doc says the ingot 'holds its heat' inside machine buffers. Is an elevator bay, crate, depot or the Terminal a machine? If yes, an Unloader next to the Magma depot can hand out hot ingots anywhere, and a Molten ingot ($30) can ride 4 shafts up to the Terminal. If no, its $30 value can never be reached. (c) '6× slower' means 1.33 heat/s, but §5.10 says 1.3/s (112 vs 115 tiles of range). Express belts also double plain-belt range to 37.5 tiles.

**Fix:** Hot items become Cooled the moment they enter anything that isn't a machine or a belt (depot, crate, elevator, Terminal), and Molten's value becomes '—'. Make insulation necessary through placement: put the D5 bore site at least 40 tiles from any hot ground, and have D5 ask for 20 Molten Ember Ingot delivered hot. Use clean cooling numbers: 10 heat/s on plain belts (10 s, 15 tiles, 30 on express) and 1/s on insulated belts (100 s, 150 tiles), '10× slower'.


## 10. [Major] §5.10 interference + instability (overcharge pair)

**Problem:** [math] The rule 'centers within 4 tiles, unless a Shield Wall stands on the straight line between them' doesn't work cleanly on a grid. A 2×2 machine's center sits on a tile corner, so the line between two side-by-side machines runs exactly along a grid line and touches two rows of tiles: is one wall enough, or are two needed? Diagonal lines pass through tile corners, where Bresenham and supercover give different answers. Euclidean vs square (Chebyshev) distance isn't stated, nor whether 4 itself counts. Separately, the Overcharger must touch its Stabilizer, adjacent machines leave no tile for a wall, and the Stabilizer is powered. So every Overcharger shows 'slowed by interference' forever. Its 10/min × 75% = 7.5/min happens to match the Stabilizer. That balance silently depends on the penalty and drops to 5/min if one more machine is in range.

**Fix:** Rule: 'Two working machines interfere if the gap between their footprints is 2 tiles or less. A Shield Wall anywhere inside the rectangle spanned by the two footprints blocks it.' It uses integer math, is O(1) per pair, and is easy to draw: hovering shows the 2-tile ring, and interfering pairs show their rectangle. Stabilizers act as dampers and emit nothing. Set the Overcharger to 8 s to match the Stabilizer (7.5/min), so the pair runs cleanly and the puzzle becomes shielding it from everything else.


## 11. [Major] §5.10 the Engine, §7.2 Engine Node, Sequencer

**Problem:** [doc §7.2 vs §5.10] The recipe 'Engine Glass, Resonant Core ×2' reads as 1 EG + 2 RC. §5.10's example (EG, RC, EG, RC) is 2 + 2. For 30 Heartstones that means 30 vs 60 Engine Glass. No node time is given ('per sequence'), so the Heartstone rate is undefined. 'For example' implies some nodes use other patterns (e.g. EG, RC, RC). A strict A/B Sequencer can't build those, which contradicts §12's claim of a 'one-building solution'. 'A wrong item resets the sequence' throws away the items already accepted, and §5.12 forbids destroying items.

**Fix:** All three nodes use EG, RC, EG, RC → 1 Heartstone, taking 2 s per accepted item: 8 s and 7.5/min per node, consuming 15 EG + 15 RC/min (2 Attuners + 2 overcharge pairs). A wrong item is pushed out of the node's side and progress is kept, so order is still enforced and nothing is destroyed. The Sequencer starts with its left input. Write the recipe as '2 Engine Glass + 2 Resonant Core, alternating'.


## 12. [Minor] §5.10 heat

**Problem:** [doc §5.10] 'Ordinary machines on hot ground: 50%', 'smelters run 50% faster' and 'the Pressure Forge only works on hot ground' leave the Foundry, Cooling Bath and Thermal Extractor (STYLE's heat family) unclassified. Emberite deposits are 'always near magma' and the hot band is 2 tiles wide, so many emberite tiles are hot ground. A Miner there runs at 50% (15/min) unless a Foundation (a 1×1 floor) can sit on a deposit tile and still let it mine, and the doc doesn't say whether it can. Nor does it say whether a Foundation under a Smelter removes the +50% bonus. [math] +50% means 22.5 ingots/min from 45 ore/min, which is 1.5 normal miners or 0.75 rich ones.

**Fix:** Put one table on the knowledge card. Heat family (Smelter, Foundry, Pressure Forge): ×2 speed on hot ground. Cooling Bath and Thermal Extractor: unaffected. Everything else: 50% unless on a Foundation. Foundations can go on deposit tiles without blocking mining, and a Foundation removes both the penalty and the bonus. At ×2, one rich Magma iron Miner (60/min) feeds exactly one hot Smelter (30/min), which feeds 2 Foundries.


## 13. [Minor] §5.2 belts, §5.3 machines, §5.5/§5.7/§5.9 spec gaps

**Problem:** [doc §5.2] 'The back input has priority every other item' is undefined with three inputs. Read as alternation, it behaves exactly like the Merger (2 Iron Plate + 1 Gear), which then has no job. 'Keep one tile of spacing' can be read as a 2-tile pitch (45/min) just as easily as a 1-tile pitch (90/min). A 2×2 machine's output face is 2 tiles wide: which tile pushes, and can one face feed two neighbours? Also unstated: which depot pays for an elevator upgrade, and what the Drill does with an item it doesn't need. The §5.9 unlock table is missing the Circuit, Cobalt Drill Head, Heat Shield and Ember Core recipes.

**Fix:** A belt tile takes from its back input first, and side inputs only fill gaps (a priority merge); the Merger is the fair round-robin. Item pitch = 1 tile (90/min). Each machine has one output port tile, marked by its chute (2×2: front-right; 3×3: front-center). The upper station's depot pays for elevator upgrades. The Drill refuses unlisted or surplus items, so the belt backs up. Unlocks: Circuit with the Chorus Crystal assay, Cobalt Drill Head with Sapstone, Heat Shield and Ember Core with Emberite.


## 14. [Minor] §7.1 values, §5.8 money, §5.13 rewards

**Problem:** [math] Several values and prices don't add up. Heat Shield sells for $50 but its inputs sell for $53 (3 × $14 + $11). A Battery adds $3 to $42 of inputs for an 8 s step, and a Heartstone adds $40 to $260. The Molten ingot's $30 can't be reached. Nobody pays the Sorter's $250 license, because M4 grants it. A Surface survey ($150) reveals nothing, since the Surface isn't dark. The $3,000 Express license (48% of Act IV's rewards) buys capacity no current line needs (the largest flow is about 65/min). Contract size N is never given. Rewards grow 26× from Act I ($700) to Act VI ($18,000), while digging cost per tile grows only 7.5× ($4 → $30). Assuming 150–350 dug tiles and 2–3 surveys per layer, rewards cover about 0.9× of Act II–III costs, 0.73× of Act IV (with the license), 1.38× of Act V and 1.85× of Act VI. M31–M33's $18,000 arrives after the Alien Strata is dug, with nothing left to buy. One shipped Resonant Core pair ($90 × 7.5/min = $675/min) pays for Act VI's digging in about 14 min, so 'money short at the start of each layer' only holds through Act IV.

**Fix:** Set Heat Shield to $80 (with 4 Aggregate), Battery $60, Heartstone $400, Insulation $14 (with the 1+1 recipe), and Molten to '—'. Delete the Sorter price and the Surface survey. Make contract size N equal to 5 minutes of one machine's output of that item (e.g. 40 Motors), paying 1.5–2.5×. Cut Act V rewards from $9,500 to $6,000 and Act VI from $18,000 to $8,000, which brings both to about 0.85× of their layer's costs, like Acts II–IV.


## Number changes

- **Press: Iron Plate time**: 3 s (20 ingots/min) → 4 s (15/min) — 1 iron Smelter : 1 Press instead of 4:3
- **Press: Copper Wire time**: 3 s (20 ingots → 40 wire/min) → 4 s (15 ingots → 30 wire/min) — 1 copper Smelter : 1 wire Press
- **Press: Mycelium Fiber time**: 3 s (20 Glowcap/min) → 4 s (15 Glowcap → 30 Fiber/min) — 1 Harvester (30/min) : exactly 2 Presses (was 1.5)
- **Smelter: Cobalt Ingot time**: 6 s (20 ore/min) → 4 s (30 ore/min) — 1 Washer or 3 Separators : 1 Smelter; same 4 s as every other smelting recipe
- **Assembler: Reinforced Plate time**: 6 s (20 Plate + 10 Brick/min) → 8 s (15 Plate + 7.5 Brick/min) — 1 plate Press : 1 Assembler; 1 brick Smelter : 2
- **Assembler: Motor recipe**: 2 Gear + 3 Copper Wire, 8 s (22.5 wire/min) → 2 Gear + 4 Copper Wire, 8 s (15 gear + 30 wire/min) — 1 gear Press + 1 wire Press : 1 Motor Assembler
- **Separator time**: 5 s (12/min, 2.5 per Sapstone Miner) → 6 s (10/min, 3 per Miner) — whole machines; 3 Separators = 30 ore + 30 resin/min = 1 Cobalt Smelter
- **Assembler: Insulation recipe**: 2 Resin + 2 Mycelium, 6 s → 1 Resin + 1 Mycelium, 6 s (10 + 10/min) — 1 Separator : 1 Insulation Assembler; lower resin demand makes washing matter
- **Assembler: Biofuel time**: 5 s (48 dust + 12 Glowcap/min) → 8 s (30 dust + 7.5 Glowcap → 7.5/min) — 1 Spore Collector at full density : 1 Biofuel Assembler
- **Combustion Generator: biofuel burn time**: 1 per 6 s (10/min) for 120 kW → 1 per 8 s (7.5/min) for 120 kW — 1 Biofuel Assembler : 1 Generator
- **Assembler: Cobalt Drill Head time**: 10 s (12 Cobalt Ingot + 6 Drill Bit/min) → 8 s (15 + 7.5/min) — 1 cobalt Smelter + 1 Drill Bit Assembler : 1
- **Crusher time (both recipes)**: 3 s (20 Chorus → 40 Grit/min) → 4 s (15 Chorus → 30 Grit/min) — 1 Crusher : 1 grit Charger; 2 per Chorus Miner
- **Charger: Charge cut time**: 5 s (12/min) → 4 s (15/min) — 1 Cutter : 1 Charger
- **Overcharger time**: 6 s (10/min) → 8 s (7.5/min) — matches its welded Stabilizer (8 s); 1 Charger feeds exactly 2 pairs
- **Assembler: Circuit recipe**: 2 Conductive Powder + 3 Copper Wire, 6 s → 2 Conductive Powder + 4 Copper Wire, 8 s (15 Powder + 30 Wire/min) — 1 grit Charger + 1 wire Press : 1 Circuit Assembler
- **Assembler: Heat Shield recipe**: 3 Aggregate + 1 Steel Beam, 8 s (22.5 Aggregate/min) → 4 Aggregate + 1 Steel Beam, 8 s (30 Aggregate/min) — 1 Cooling Bath : 1 Heat Shield Assembler
- **Cooling Bath: Quench time**: 3 s (20/min) → 2 s (30/min) — 1 Emberite Miner : 1 Bath
- **Cooling Bath: new recipe Quench Slag**: none (Slag has no use) → 2 Slag → 1 Aggregate, 4 s (30 Slag/min) — gives Slag a sink; 1 Bath per Emberite Miner's 2 Extractors
- **Thermal Extractor rate**: 1 Emberite per 3 s (20/min), 220 kW → 1 per 4 s (15/min), 220 kW — 2 Extractors per Emberite Miner
- **Pressure Forge: Forge time**: 6 s (20 Emberite + 10 Steel Ingot/min) → 8 s (15 + 7.5/min) — 2 Forges per Emberite Miner and per Foundry
- **Precision Assembler: Ember Core time**: 10 s (6/min) → 8 s (7.5/min) — 1 Forge : 1 Precision Assembler (was 3:5); 2 Circuit Assemblers : 1
- **Attuner time**: 6 s (20 Thrumstone/min) → 8 s (15 Thrumstone → 7.5 Engine Glass/min) — 2 Attuners per Thrumstone Miner and per Engine Node
- **Engine Node recipe and time**: 'Engine Glass, Resonant Core ×2', 'per sequence' (no time) → EG, RC, EG, RC → 1 Heartstone; 2 s per accepted item (8 s, 7.5/min) — unambiguous 2+2; a node consumes 15 EG + 15 RC/min = 2 Attuners + 2 overcharge pairs
- **Hot-ground speed for the heat family (Smelter, Foundry, Pressure Forge)**: Smelter ×1.5; others unstated → ×2 — 1 rich Magma iron Miner (60/min) : 1 hot Smelter (30/min) : 2 Foundries
- **Elevator Mk1**: cab 8, travel 4 s, round trip 10 s, 48/min → cab 6, travel 3 s, round trip 8 s, 45/min — half a conveyor
- **Elevator Mk2**: cab 16, round trip 8 s, 120/min → cab 9, travel 2 s, round trip 6 s, 90/min — one conveyor can empty it
- **Elevator Mk3**: cab 32, round trip 7 s, 274.3/min → cab 15, travel 1.5 s, round trip 5 s, 180/min — one express belt can empty it
- **Crystal Depths deposits**: Chorus ×3, Copper rich ×1, Iron ×1 → Chorus ×3, Iron ×1 (no copper) — circuit copper has to ride the elevators, so Mk1 becomes the limit in Act IV
- **Deposit sizes**: 3×3 to 4×4 on the Surface; unstated below → even sizes: 4×4 normal, 4×6 rich — 2×2 Miners tile at full coverage; no 7.5/15/22.5 partial miners
- **Hot item cooling on plain belts**: 8 heat/s (~19 tiles) → 10 heat/s (10 s, 15 tiles; 30 on express) — integer rate; sets up the D5 hot-delivery distance
- **Hot item cooling on insulated belts**: '6× slower', 1.3/s (~115 tiles) → '10× slower', 1/s (100 s, 150 tiles) — removes the 1.33 vs 1.3 mismatch
- **D5 bore site distance from hot ground**: unstated → at least 40 tiles — hot delivery (see the D5 change) needs insulation; plain and express belts can't reach it
- **D2**: 80 Steel Beam, 30 Motor, 40 Drill Bit → 160 Steel Beam, 60 Motor, 80 Drill Bit — first chain 34.7 min; 10-min line 24 machines, 271 kW; 171 machine-min
- **D3**: 30 Cobalt Drill Head, 40 Insulation, 20 Filter → 100 Cobalt Drill Head, 200 Insulation, 60 Filter — first chain 26.0 min; 10-min line 30 machines; 400 ore vs 260 resin = separate 260 + wash 140
- **D4**: 60 Circuit, 30 Battery, 20 Resonant Core → 200 Circuit, 100 Battery, 60 Resonant Core — first chain 26.7 min; 10-min line 37 machines, 433 kW peak on L3; 660 items through the Fungal→Crystal shaft
- **D5**: 30 Ember Core, 40 Heat Shield, 60 Circuit → 60 Ember Core, 160 Heat Shield, 40 Circuit, 20 Molten Ember Ingot (delivered hot) — first chain 26.7 min (800 Emberite on one Miner); hot delivery makes insulation necessary
- **Governor**: 30 Heartstone, 60 Engine Glass, 40 Battery, 20 Ember Core → 60 Heartstone, 120 Engine Glass, 40 Battery, 40 Ember Core — first chain 32.0 min (240 EG on one Attuner); 10-min line 45 machines across 4 layers; 247 machine-min
- **§8 drill-project ETA rule**: unscaled starter line > 30 min; scaled line 5–10 min → first chain (1 machine per recipe) 25–35 min; 10-min line 24–45 machines; D1 exempt (~9 min) — testable by tests/pacing.test.ts
- **Shallows starter crate**: 64 Iron Plate, 8 Gear, 16 Brick (2 Miners, 2 Smelters, 40 belts) → the same + a pre-built coal Miner and Combustion Generator + 4 Motor + 20 Copper Wire — breaks the Generator ↔ Motor loop; M9's Lamps need wire
- **Heat Shield value**: $50 → $80 — inputs are $53 now, $67 with 4 Aggregate
- **Battery value**: $45 → $60 — adds only $3 to $42 of inputs for an 8 s step
- **Heartstone value**: $300 → $400 — adds only $40 to $260 of inputs
- **Insulation value**: $22 → $14 — inputs drop to $8 with 1 Resin + 1 Mycelium
- **Molten Ember Ingot value**: $30 → — (unsellable; becomes Cooled in any container) — a hot ingot can't reach the Surface Terminal
- **Sorter license price**: $250 → removed — M4 grants the license, so nobody pays
- **Act V milestone rewards (M27–M29)**: $2,500 + $3,000 + $4,000 = $9,500 → $1,500 + $2,000 + $2,500 = $6,000 — 1.38× the layer's estimated digging + surveys; target ~0.85× like Acts II–IV
- **Act VI milestone rewards (M31–M33)**: $5,000 + $5,000 + $8,000 = $18,000 → $3,000 + $3,000 + $2,000 = $8,000 — 1.85× the layer's costs; M33's money arrives with nothing left to buy
- **Contract size and multiplier**: N unspecified; 1.5–2.5×; free play has 'rising payouts' → N = 5 min of one machine's output; 1.5–2.5×, never above 2.5×, free play included — defines payouts; requisition is 3×, so a higher contract multiplier would create an infinite money loop

## reverse_decisions

- DECISIONS #3 ('elevators are the real bottleneck'): false at the current numbers. The largest project import is 120 items, about 2.5 min of a 48/min Mk1. Either drop the claim, or keep it and adopt the 45/90/180 elevators and remove copper from the Crystal Depths.
- DECISIONS #14 ('insulation from layer 2 solves layer 4'): direct insertion from Forge to Precision Assembler bypasses it. Amend it: hot delivery to a D5 bore site at least 40 tiles from hot ground.
- DECISIONS #13 (overcharge adjacency as a shielding puzzle): adjacent machines can't be shielded, so the pair is always slowed. Amend it: Stabilizers emit no interference.
- DECISIONS #10 (drill projects cost goods only): only holds if requisitioned goods can't reach depots and Unloaders. Amend requisition to 'rush a ghost', with refunds limited to goods that came from the depot.
- DECISIONS #6 (depot friction softened by starter crates): the crates must include a running power rig and the goods for each layer's first-milestone building, or this decision's own fix fails on arrival.

## cut_list

- Requisition into depots. Replace it with 'rush a planned ghost'; as written it is the path for money to buy drill goods and free-play contract goods.
- The Crystal Depths copper deposit. Taking it away is what makes the elevators and 'ship ingots, not wire' matter.
- Molten Ember Ingot's $30 sale value: a hot ingot can never reach the Terminal.
- The Sorter license price ($250): M4 grants the license.
- Surveys on the Surface: $150 for a layer that has no darkness.
- 'For example' in the Engine Node rule: use one pattern (EG, RC, EG, RC) for all three nodes.
- The clause that a wrong item resets the Engine Node and loses the accepted items: push out the wrong item and keep progress.
- Optional [taste]: the player-built Assay Lab on every layer. A built-in assay bay at each depot would remove the copper + brick import before the first assay on L2–L5; keep the build step only for M16 on L2.

## working

- [math] Miner 30/min → Smelter (2 ore → 1 ingot in 4 s) is exactly 1:1, and so is the Gear press: a base the whole game can hang ratios off.
- [math] Coal power is clean: one normal coal Miner (30/min, 8 kW) feeds exactly 2 Generators at 15 coal/min each, 160 kW gross and 152 kW net.
- [math] Biofuel vs coal is a real choice of where to make power. Coal wins per machine (152 kW net per coal Miner vs ~98 kW net per biofuel Generator chain). Biofuel wins per elevator slot (12 kW per item/min vs 5.3), which is exactly what the coal-less Crystal Depths needs.
- [math] The deposits each layer lacks create real import chains: no copper or stone on L2, no coal on L3, no copper on L4–L5, and no iron on L5, where every belt tile is imported Iron Plate.
- [math] Crystal Depths power is tight in the right way. D4 wants a 208 kW peak today (433 kW at the proposed size) against a 60 kW Mk1 cable, so Taps plus shielding, or a Mk2 cable, is a genuine layout decision once the Tap rule is fixed.
- [math] The opening hits its target: even from empty belts, the first ingot reaches the Terminal in about 18 s (ore every 2 s, 4 s smelt, ~15 tiles at 1.5 tiles/s), under §8's 20 s.
- [math] Act I fits its 15–25 min band. D1 needs 130 Iron Ingot, 30 Copper Ingot and 30 Brick; one iron line (15/min) covers it in 8.7 min plus build time. The $600 Company Line upgrade becomes affordable ($400 start + $400 from M1–M3 + sales) right when the brick line pushes the Surface past 60 kW.
- [doc §5.12] Failures turn items into lesser forms that can be used again (cooled ingots reheat, shattered crystals become grit, wrong-order crushing gives grit), consistent with pillar 8.
- [taste] Each hazard turns into a tool with real numbers attached: spores (1 − 0.5 × density) feed a Collector making 30 dust/min at full density; heat (50%) becomes forge-only ground plus a smelter bonus; interference (25% per neighbour) feeds Taps at 20 kW per interferer.
- [math] The value ladder mostly climbs steadily ($1 ore up to the $300 Heartstone); Crush-charged is a deliberate value-losing overflow, not a bug.