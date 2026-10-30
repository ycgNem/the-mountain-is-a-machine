# The Mountain Is a Machine — Game Plan

The full design of the game: every layer, system and content table. `ROADMAP.md` says what gets built
in which order and what is done; `STYLE.md` is the art bible; `DECISIONS.md` records why. Numbers here
state the intent. The source of truth for numbers is `src/data/`. When tuning moves a number, update
the table here in the same change.

---

## 0. Pitch

You run a company dig site at the foot of a lonely mountain the locals call **Old Thrum**, because on
still nights it hums. You build belts and machines, repair a giant broken drill and bore down through
six layers of rock. Each layer is its own buildable factory floor, linked to the others by freight
elevators. The deeper you go, the less the materials behave like normal materials, and the louder
the hum gets.

You are not unlocking "iron, but blue, and worth more." Each strange material forces you to rethink
part of your factory, and each layer's hazard starts as a problem and ends as a tool.

> From "I figured out how to smelt iron" to "my magma forge sends molten ingots down a resin-lined
> belt before they cool, my crystal plant ships cores down two shafts to an engine that only runs in
> order, and now I can drill into whatever is making that noise below us."

**Genre:** 2D pixel-art factory/automation game, top-down 3/4 view, mouse-driven (no avatar).
**Platform:** browser first (desktop), built with TypeScript + Vite + Canvas 2D. Desktop wrapper later.
**Length:** about 3–5 hours to the ending (what the act bands in §8 add up to), then free play.

---

## 1. Design pillars

Every feature is checked against these. If a feature breaks one, it changes or goes.

1. **Every major resource creates a new factory decision.** Processing order, where to build, what to
   export, how to transport. Never just another ingredient on the shopping list.
2. **Discovery becomes industry.** Find a deposit → take samples → learn its behavior → build a small
   line → scale it → use it to reach deeper. Learning a recipe is easy; making 40 a minute is the game.
3. **Money widens your options; goods move you forward.** Money buys digging, surveys, licenses,
   upgrades and a rush on a building you're short of goods for. Buildings, elevators and drill
   projects cost manufactured goods, and no amount of money buys drill goods. You can be rich and
   still stuck.
4. **Depth changes logistics, not just recipes.** Every layer has its own construction stockpile,
   restocked through elevators with limited throughput (a Mk1 cab moves 45 items a minute each way).
   Where a chain lives is a real decision.
5. **Hazards are engineering problems.** Spores, interference, heat and the sleeping Engine: each one
   slows you down at first and turns into a tool you use on purpose later. Hazards are physics, not
   zones: they follow their cause onto any layer.
6. **Follow the rock.** You can watch any item travel down a line and see it become more valuable:
   cleaner, shinier, glowing, cased.
7. **Light is progress.** The mountain is dark. Your machines and lamps light it up. A thriving layer
   *looks* thriving.
8. **Never destroy the player's work.** Failures cost output or time (slowdown, scrap, a stalled
   line), never buildings. Removing a building refunds every good it took from the depot.
9. **Rules are clear and visible.** No hidden combinations. Every special rule has an overlay, a
   tooltip and a knowledge card, and one line in the glossary (§5.15). If a player needs a wiki, we
   failed.
10. **Machines move in the first frame.** The game opens on a running line, already full and selling
    within a second, and every underground layer but the Crystal Depths opens on a running power
    rig. The first goal is visible without reading.

---

## 2. Setting and story

**Old Thrum.** A lone mountain above a dry valley. Survey crews came back with readings that made no
sense, two earlier dig crews quit, and the company bought the rights cheap. The big excavation drill
the last crew left behind stands broken at the foot of the mountain face.

**Halloran Deep Mining Co.** ("the Company"). Owns the site. Talks to you through dry memos from the
Board and through contracts posted at the Shipping Terminal. It wants ore, metal and profit, and it
doesn't ask about the hum.

**Mags Okafor**, the site engineer, is the voice on the radio. She is warm, practical and a little
funny. She gives objectives, explains each new rule in one line, and slowly stops pretending the
mountain is normal. Short lines only: never more than two sentences in one message.

**You** are the new foreman. You have no name or face; you are the cursor.

**The reveal, layer by layer:**

| Layer | What the player notices |
|---|---|
| Surface | The hum at night. The drill broke "on its own". |
| Shallows | Old tool marks in the rock, too regular to be the last crew's. Amber-sealed rock at the bore site. |
| Fungal Caverns | The fungus grows along straight lines, like it's following wires. |
| Crystal Depths | The crystals ring in chords when power runs near them. |
| Magma Shelf | Basalt pillars in perfect hexagons; the magma flows in channels. |
| Alien Strata | The walls are machinery: stone gears, dark glass conduits, a heartbeat. |

**The ending.** At the bottom is the Heart, the mountain's half-asleep engine. The final project,
the **Governor**, ties your factory into it. When it is delivered, the Heart wakes, the hum turns into a
chord, and every conduit in the Alien Strata lights up. The mountain is a machine, and now it is your
machine too. A short ending sequence plays, about half a minute (§5.14): the camera goes to the Heart
as it wakes, climbs layer by layer to the Surface with light spreading out from the shaft on each,
and the Surface comes up at dawn under the closing text. Then a thank-you card, and free play
continues with endless contracts.

---

## 3. Structure: the stack

| # | Layer | Depth | Role | Signature material and behavior | Hazard, and how it turns | New logistics | Drill project to go deeper |
|---|---|---|---|---|---|---|---|
| 0 | **The Dig Site** (Surface) | 0 m | HQ, shipping, basic manufacturing | Iron, copper, stone: plain on purpose | none (tutorial) | belt, splitter, crossing, sorter | **D1 Repair the Drill** |
| 1 | **The Shallows** | 120 m | Bulk metals, power, steel | Coal; rich metal veins | Darkness and solid rock: dig, survey, light it up | freight elevator, depot requests, unloader, storage crate, Company Chute | **D2 Bore to the Fungal Caverns** |
| 2 | **The Fungal Caverns** | 340 m | Organic chemicals, fuel, filtration | **Sapstone**: cobalt sealed in resin. Wash it (fast, resin lost) or separate it (slow, keeps resin you must use or burn) | **Spores** slow machines → filters → spore collectors make **biofuel** | — | **D3 Bore to the Crystal Depths** |
| 3 | **The Crystal Depths** | 610 m | Precision parts, energy | **Chorus Crystal**: processing *order* matters (cut/charge/crush/overcharge) | **Interference** between working machines → shield walls → **Resonance Taps** turn it into power | express belt | **D4 Bore to the Magma Shelf** |
| 4 | **The Magma Shelf** | 920 m | Advanced metallurgy, heavy power | **Emberite**: stores heat. Cool it, burn it, or forge it hot and keep it hot | **Heat** slows machines near magma → foundations → heat-loving forges | insulated belt | **D5 Bore to the Alien Strata** |
| 5 | **The Alien Strata** | 1,300 m | Exotic manufacturing | **Thrumstone**: only the mountain's own conduits can work it | **The Engine**: conduits sleep until an Engine Node is fed in order; awake, they power what stands on them | sequencer | **The Governor** (ending) |

Layers are suggestions, not rules: you can build anything anywhere it fits. Hazards are physics, not
zones: interference follows working machines onto any layer, spores fill the air wherever glowcaps
grow, and heat rises wherever magma runs. Hazards, deposits and the cost of freight make certain
layouts smart.

---

## 4. The core loop

**Seconds.** Place, rotate, connect. Watch an item travel. Spot the jam, fix the jam.

**Minutes.** A goal (objective, contract or drill project) needs N of something. You trace the chain
back, find the bottleneck (input, power, belt, elevator, space, hazard), and expand.

**A layer (20–60 min).**
1. Arrive in the dark on a running power rig (in the Crystal Depths, on the cable from above),
   with a starter crate in the new depot and its supply requests already pulling stock down the
   shaft.
2. Light the cave, dig out from the shaft, survey for deposits.
3. Find the strange material. Assay it in the lab (Phase A: figure it out).
4. Build a small experimental line. Learn the hazard.
5. Scale it up to feed the next drill project (Phase B: make it work at scale), while deciding how to
   spend the elevator's cab (construction stock, fuel or product), what to sell here at the Company
   Chute and what to ship up for full value.
6. Break through. The new layer's needs feed back into the layers above.

**The whole game.** Each layer's output is needed below, and each layer's discovery solves a problem
further down. Resin from the Fungal Caverns insulates the Magma Shelf's molten ingots; Batteries and
Resonant Cores from the Crystal Depths wake the Engine in the Alien Strata. By the end, all six layers
form one machine.

---

## 5. Systems

### 5.1 Grid and building

- Each layer is a grid of 16 px tiles. Tile kinds: floor, rock (diggable), hard rock (map edge),
  water, magma, hot ground (the 2 tiles nearest magma), conduit (dormant until woken), deposit (a
  floor tile with an ore underneath). Map generation keeps every 2×2 window of cells to at most two
  terrains, and only pairs that have a terrain set (STYLE.md "Terrain").
- Buildings have a footprint (1×1, 2×2, 3×3, 5×5, 7×7) and a facing (N/E/S/W). Rotate with **R**.
- Placing a building shows a ghost, with its tooltip beside the footprint (above and to the right,
  never over it): green if it can be built now, red with a reason if not ("Must touch water", "Solid
  rock: excavate first (E)"), blue if the depot is short ("Planned: depot needs 3 more Iron Plate").
  A machine's ghost also shows the speed it would run at there (spores, heat, interference), a
  Miner's its deposit's purity and rate, and a Resonance Tap's its predicted output.
- Belts are placed by dragging; the path bends once (an L) and every tile faces along the drag.
  Where the drag crosses a working belt it lays a **Crossing**. So it does where it starts on a
  straight run of a working line across its path (the cell behind that belt pushes into it) and
  goes on past it, so the new line crosses that line instead of merging into it. Where it starts on
  a line's turning belt, ends on a belt or turns on one, it leaves that belt alone (so a new line
  ending at a belt side-loads into it, and a line turning there keeps its corner), unless the drag
  runs along that belt's line, which re-lays it. It never replaces a splitter, sorter, crossing or
  other logistics piece. Crossings are laid first, the preview shows exactly what the release will
  lay, and every piece it can't lay is reported.
- Costs come from the **layer's depot**. Removing a building refunds every good it took from that
  depot, plus its contents and the inputs of a craft in progress (a hot item comes back Cooled, an
  unstable one is lost). Pre-placed buildings (the starter line, each layer's rig) refund their full
  cost too.
- **Q** copies the building under the cursor (type and facing). **X** is the Remove tool; holding the right button on a building for half a second removes it; a right-click only cancels; Ctrl+Z undoes a removal (DECISIONS #122).
- If you can't afford a building, you can still place it as a **planned** ghost (blue). Planned
  ghosts build automatically as the depot gets the goods: oldest first, and a newer ghost never
  takes an item an older waiting ghost still needs, so a run of cheap belts can't starve a machine;
  nor does a depot Unloader take what waiting ghosts hold. A planned ghost can be moved to the front
  of its depot's queue (**Build next**), **rushed** for money, and underground it can **request the
  missing goods** (§5.6). This keeps the logistics real without blocking you.
- **Foundations** are paid on the spot or not at all: they can't wait as planned ghosts.
- Placing a building over a working one (a splitter onto a belt) swaps it only if the depot can pay
  for the new piece now, counting the old piece's refund (less any goods a Rush paid for). Otherwise
  the swap is refused ("Not enough goods to swap this in"), so a working line is never torn out for a
  ghost nobody can pay for. Over a planned ghost the new piece just waits as a ghost. A replaced belt
  never loses its item: it moves to the new piece, or into the depot if the new piece can't carry it.

### 5.2 Belts and logistics

- A belt tile holds **one item**, so a packed line carries one item per tile. Items move continuously
  and are drawn centered on their tile, so every item on a line is visible and can be followed.
- Speeds: **Conveyor 90/min** (1.5 tiles/s). **Express Belt 180/min** (Crystal Depths, license).
  **Insulated Belt 90/min**: hot items cool 10× slower (Magma Shelf).
- Belts accept items from behind and from either side (side-loading) and take turns between the
  inputs that have an item waiting, so merging lines share fairly. That is the merge: there is no
  Merger building. A machine, station or Engine Node beside a belt counts as one of its inputs only
  at the tile it pushes into (its output or side port), so a line running past a machine's face
  never waits for it.
- A conveyor's rungs bow forward into a blunt `>`, so a still belt shows which way it runs. Two
  belts whose heads push into each other are both marked **Jammed** (≠), and their hover says
  "These belts face each other: turn one with R." A line merely backed up is not jammed.
- **Splitter** (1 in → front/left/right, round-robin, skips blocked outputs).
- **Crossing** (two lines pass through each other).
- **Sorter** (items of the chosen type go left, everything else straight on).
- **Unloader** (pulls the chosen item out of an adjacent depot, crate or elevator station; from a
  depot it leaves what planned ghosts hold, and from a lower station it takes arrivals before they
  reach the depot). Picking another item, or none, sends the item it holds back to the depot.
- **Storage Crate** (buffers 100 items of one type, passes them on in order).
- **Company Chute** (underground layers: sells whatever is belted into it, from any side, §5.8).
- **Sequencer** (Alien Strata: takes items alternately from its left and right inputs, strictly
  A, B, A, B, starting with the left; waits if the next one isn't there).
- A machine pushes each output out of its output port (§5.3) into whatever touches that tile from
  outside: a belt that faces away, or another machine. Direct machine-to-machine insertion is allowed
  and sometimes required (overcharged crystals).

### 5.3 Machines and recipes

- Every machine has one **output port**: a single tile on its front face, drawn as a chute. On a 2×2
  machine it is the front-right tile (relative to the machine's facing); on a 3×3 it is the
  front-centre tile. Machines with a byproduct (Separator, Thermal Extractor) also have a **side
  output**: the front-most tile of the left face. One port feeds one neighbour. Hovering or
  selecting a built building marks its port cells with the placement ghost's brackets.
- Inputs: any other edge tile. Each machine buffers 2 crafts' worth of each input (at least 4 items)
  and 4 finished items. A full output stops the machine; it never deletes items.
- Machines with several recipes have a recipe picker in the inspector. Only one recipe runs at a time.
- Machines, miners and collectors can be **paused** from the inspector or with **P**: a paused
  machine finishes the craft it is on, then starts no new one and draws no power. Nothing else
  pauses (a generator, filter, lab or tap would keep running under the badge).
- Status shows in the inspector and, on every 2×2-or-larger machine that isn't working or idle, as a
  7×7 icon over it (shape and colour, STYLE "Code-drawn art, as built"): ○ no input, ✕ blocked
  (output full), ⚡ no power, ≈ slowed (spores, interference, heat), ! can't work here (a missing
  placement condition: hot ground, awake conduit), ▲ no recipe, ‖ paused, ≠ jammed (a belt holds an
  item the machine never takes, or feeds its front). Working and idle show no icon. A jammed
  machine's hover names the stuck good ("Jammed: Coal at its input (it makes Iron Plate)"). A
  machine or miner whose only refused output goes straight into a generator already holding all of
  that fuel it can (4) is idle, not blocked: the generator burns only what its layer needs, and the
  inspector says so. Of the fixed buildings, only a jammed Drill, Heart or elevator station shows
  an icon (≠); so does each belt of a head-on pair (§5.2).
- Rates are shown per minute everywhere (inputs, outputs, belt capacity).

### 5.4 Power

- Each layer has its own grid: no wires. **Supply** = generators on the layer + power arriving
  through shafts. **Demand** = working machines. A working machine draws its full rating even when a
  hazard slows it; an idle or paused machine draws nothing.
- If demand exceeds supply, every machine on that layer runs at `supply / demand` speed.
  The HUD meter turns amber, then red.
- **Shaft cables**: each elevator shaft carries up to its cable capacity (60 / 150 / 400 kW by
  elevator tier) in either direction. Surplus flows automatically to layers that are short, nearest
  layers first.
- Sources:
  - **Company Line** (Surface only): 60 kW, upgradeable with money ($600 → 100 kW, $1,000 → 160 kW).
  - **Combustion Generator** (from the Shallows): coal → 80 kW (4 s each), biofuel → 120 kW (8 s
    each), resin → 60 kW (4 s each). It burns only what the grid needs.
  - **Resonance Tap** (Crystal Depths): 20 kW per interferer near it, up to 6 (§5.10).
  - **Thermal Extractor** (Magma Shelf): 1 Emberite every 4 s → 220 kW; Slag leaves its side output.
  - **Conduits** (Alien Strata): dormant until an Engine Node wakes them, ring by ring; then machines
    standing on them draw from the conduit pool (60 kW per awake node) instead of the grid (§5.10).

### 5.5 Layers, shafts and the freight elevator

- Each drill project bores a **shaft** from its bore site down to the next layer. The shaft holds a
  **freight elevator** with a station at each end (3×3).
- Each layer's bore site is in a different place, so cargo between non-adjacent layers changes
  elevators on the way. Cross-layer logistics is a chain, on purpose. Depot requests (§5.6) relay
  through the depots in between, so only cargo you belt yourself has to cross a layer by hand.
- A station accepts items on any face except its front (output) face. Accepted items wait in the
  station's outbound bay (capacity 2 cabs). The whole front is the exit, its corners included: a
  belt pushing into it shows the station **Jammed** (≠), and its hover and inspector say "A belt is
  pushing into the exit: feed a side face, or turn the station with R." (a lower station, which
  can't turn, stops at "feed a side face"). A side face that is only full for now (the bay, a
  depot below with 999 of the item) is no jam.
- **Down:** everything sent down lands in the lower layer's depot. The **lower station faces its
  layer's depot**, which sits right next to it, so goods arrive in stock with no belts. It can't be
  turned (a turned one would stop the shaft both ways), and loading a save turns any that were back.
  It hands the depot the first arrival the depot will take, so one item the depot is full of can't
  hold up the rest. A depot holds 999 of an item at most, and the shaft counts toward that what is
  already on its way down and that item's belt cargo waiting in the top bay. Once those reach 999
  the top station takes no more of the item, so that belt backs up, and requests for it wait too:
  near the cap, cargo already in the bay goes down before any request for the same item. Bay cargo
  the depot below has no room for stays in the bay, still taking room, and the top station names it
  ("12 Iron Plate held: the Shallows depot is full of it (999 with what's on its way)"), along with
  the requests it holds back ("The Shallows depot is full of Iron Plate: the cab holds that request
  back."), told apart from requests with nothing spare above.
- **Up:** belt goods into the lower station. They come out of the upper station's output port (one
  tile, the centre of its front face) onto one belt, in arrival order. Cargo sent up comes out mixed,
  so sorters matter. The top station can be turned to pick that face, and its inspector warns when
  nothing there takes the up-cargo.
- The cab shuttles between stations: unload, load, travel, repeat. At the top it first loads
  requested goods from the upper depot, up to half the cab rounded down (3 of 6, 4 of 9, 7 of 15),
  taking the requested items in turn; then belt cargo from the top bay; once its 1 s dwell is over,
  any room left goes to more requests. It leaves when it is full, when cargo is waiting at the other
  end, or after waiting 2.5 s with a part load, so a thin trickle still moves but a busy line ships
  full cabs. The cab is drawn moving in the shaft on both layers.
- **Traffic.** Each shaft counts what its cab loaded over the last minute. A station's inspector
  shows it against the tier's rate, "Down 44/45 a min (requests 30, belts 14)" and "Up 3/45 a min",
  turning amber at 90% or more, along with its bay, its arrivals and any stall; the Stack shows each
  shaft's tier and live rate down.
- **Upgrades** cost money plus goods, and each good is taken from the lower depot first and the rest
  from the upper depot. The upgrade button lists every good as below + above, greys out when the two
  depots together can't pay, and its tooltip says which depot pays what. Goods made deeper than both
  depots still have to ride up by cab.

| Elevator | Cab | Travel | Round trip | Throughput each way | About | Shaft cable | Upgrade cost |
|---|---|---|---|---|---|---|---|
| Mk1 | 6 | 3 s | 8 s | 45/min | half a conveyor | 60 kW | installed when the shaft opens |
| Mk2 | 9 | 2 s | 6 s | 90/min | one conveyor | 150 kW | 20 Motor, 30 Steel Beam, 20 Reinforced Plate, $2,000 |
| Mk3 | 15 | 1.5 s | 5 s | 180/min | one express belt | 400 kW | 10 Battery, 30 Circuit, 40 Steel Beam, $8,000 |

Round trips include a 1 s dwell at each end. Each shaft is upgraded separately, from either station.
The cab is the bottleneck on purpose: requests, fuel and product all share it, and the traffic line
shows when it binds.

### 5.6 Depots and construction supply

- Every layer has one **depot** (the Surface's is the **HQ**). Buildings on a layer are paid from that
  layer's depot. Items belted into a depot are stored (up to 999 of each kind).
- **Supply requests.** Every depot keeps a request list: an item and a target to keep in stock
  ("keep 40 Iron Plate"). A depot can request any item this save has made, delivered to a depot or
  holds in any depot, except a hot or unstable one (the Molten Ember Ingot, the Overcharged
  Crystal). Requested goods ride the shaft from the depot above, sharing the cab with belt cargo
  (§5.5); the cab serves the requested items in turn, never takes the upper depot below its own
  request for the same item, and holds a request back while the depot below has no room for it (999,
  counting what is on its way and that item's cargo in the top bay, which goes first). Requests
  relay down the stack: a layer asks the one above for its own requests plus whatever the layers
  below need through it, so the Crystal Depths asking for Iron Plate pulls from the Fungal Caverns,
  which pulls from the Shallows. Belts into a top station push cargo down without going through a
  depot: volume, and anything you would rather not stock. The per-layer decision is how to spend 45
  items a minute of cab on construction stock, fuel and product.
- **Keep for the Surface.** The HQ has no depot above it, so its request rows only act as a floor:
  the elevator never takes the HQ below them (Iron Plate 20, Gear 10, Copper Wire 10 to start).
  Buildings on the Surface can still spend that stock. Saves from before the floor keep none.
- **Request rows** in a depot's inspector show stock/target, and "none spare above" in coral when
  the depot above has none to give. **+** and **−** move a row by 10 (Shift: 50), the wheel over a
  row by 10, and **×** drops it. The Add row offers every requestable good not on the list, deepest
  layer first, at 20 (two rows of seven, the rest behind a toggle). A planned ghost underground has
  **Request the missing goods**, which adds or raises its depot's rows to cover what it lacks (up to
  400). When a ghost has waited a minute for an item that nothing has brought in for a minute, Mags
  says why and what to do: request it, raise the request, stock the depot above, or, when the cab
  ran full of other requests, lower one of them, upgrade the shaft or Rush. When the depot holds
  some but too few she gives the count ("The HQ has 1 Gear; your planned Assembler needs 6 and none
  is coming in."), and "is out of" when it holds none. For a good whose home
  layer is this one or deeper and that no depot above holds, she says how to make it down here
  instead ("Make it down here (an Assembler: Aggregate and Steel Beam), or Rush the plan."), or that
  only a deeper layer makes it. When some came in but Unloaders took it as it arrived, so the stock
  never reached the ghost's cost, she names the Unloaders ("turn them off until it is paid, or Rush
  the plan").
- **Opening a layer.** The drill crew leaves a **running rig**, a **starter crate** and the depot's
  first **request list**. On every layer with coal in its start pocket (Shallows, Fungal Caverns,
  Magma Shelf, Alien Strata) a coal Miner already feeds a Combustion Generator, which starts with 4
  coal, all it holds, so the rig runs from the first second even when the layer above has no power
  to spare for its Miner. The Crystal Depths has no coal near the shaft and runs on the Fungal
  Caverns' cable and its own Resonance Taps. The
  crate holds a first small line. Below the Shallows it also holds an Assay Lab's goods, because each
  of those layers opens with an assay milestone, and the Alien Strata's crate adds an Attuner's goods
  (2 Heat Shield, 6 Circuit, 2 Battery). The Shallows' crate carries 4 Motors and 30 Copper Wire, so
  the first Foundry and lamps don't wait on a motor line. Each request list matches what that layer
  imports:

| Depot | Starter crate | Requests when it opens |
|---|---|---|
| HQ (Surface) | 100 Iron Plate, 30 Gear, 20 Copper Wire, 30 Brick | keeps Iron Plate 20, Gear 10, Copper Wire 10 |
| The Shallows | 60 Iron Plate, 24 Gear, 30 Copper Wire, 20 Brick, 4 Motor | Iron Plate 40, Gear 20, Copper Wire 20, Brick 20 |
| The Fungal Caverns | 62 Iron Plate, 24 Gear, 40 Copper Wire, 40 Brick, 12 Steel Beam, 6 Motor | Iron Plate 40, Gear 20, Copper Wire 20, Brick 30, Steel Beam 20, Motor 10 |
| The Crystal Depths | 72 Iron Plate, 30 Gear, 50 Copper Wire, 30 Steel Beam, 10 Motor, 16 Cobalt Ingot, 30 Brick | Copper Wire 80, Steel Beam 30, Cobalt Ingot 20, Insulation 20, Iron Plate 30, Gear 20, Motor 10 |
| The Magma Shelf | 72 Iron Plate, 30 Gear, 50 Copper Wire, 40 Steel Beam, 12 Motor, 12 Insulation, 12 Circuit, 30 Brick | Circuit 20, Steel Beam 30, Insulation 20, Iron Plate 30, Motor 10, Gear 20 |
| The Alien Strata | 80 Iron Plate, 40 Gear, 50 Copper Wire, 50 Steel Beam, 16 Motor, 24 Circuit, 6 Battery, 6 Heat Shield, 20 Brick | Battery 10, Resonant Core 10, Circuit 20, Steel Beam 30, Iron Plate 60, Gear 20, Heat Shield 10 |

- The Crystal Depths ask for Insulation because the Stabilizer costs 4 and every Resonant Core takes
  1; the Alien Strata keep 60 Iron Plate because the lanes to the nodes and the Heart run to about
  200 belt tiles.
- An **Unloader** next to any depot pulls a chosen item out onto a belt, but leaves the depot what
  the layer's planned ghosts hold (each waiting ghost's whole cost), so planned buildings are paid
  first.
- **Rush** (money): any planned ghost can be rushed. The depot's goods go in as usual and the Company
  ships the rest straight to the site for 3× their value; the building appears at once. Removing it
  later refunds only the goods that came from the depot. Money never goes into a depot, so it can't
  buy drill goods. It's the emergency valve; at scale it's ruinous.

### 5.7 The Drill

- The Drill (5×5) is the game's protagonist machine. On the Surface it starts broken (sparking,
  idle). Each drill project is a list of goods; belt them into the drill. Progress is a bar, with
  per-item counts and an ETA: the slowest good's time to finish at its own delivery rate over the
  last 2 minutes, or "No supply" while a needed good has nothing arriving (§5.13). Click it to see
  the list.
- When a project completes: a **breakthrough** plays (screen shake, dust, the drill sinks, the
  layer's title card), the shaft opens and its elevator is installed. If belts fed the Drill, Mags
  says where they now end, after her introduction to the new layer and before the Board's memo:
  "Up on the Surface your drill lines end where the Drill stood: belt them into a side of the top
  station (its front is the exit) or turn it with R, or belt them into the HQ." (below the Surface,
  "Up in the Shallows ..." and "the depot"). On the Surface those lines arrive from the south,
  where the new station's front is (§5.5).
- In the new layer the rig is reassembled at that layer's **bore site**, which sits in a hidden
  cavern 25–40 tiles from the shaft. You dig toward its beacon to reach it. The Alien Strata has no
  bore site: while the Governor is open the Heart wears the same beacon until it is found, and each
  Engine Node a dimmer marker until it wakes (§6).
- Drill projects cost goods only (pillar 3). Rush builds buildings, never drill goods.
- **Extras.** A good the project already has all of is still taken: the crew stacks it in the
  layer's depot (a Molten ingot arrives Cooled), and a toast says so the first time for each good
  ("The Drill has all its Gear; the crew stacks extras by the HQ"). So one belt can carry every good
  of a project. If the depot already holds 999 of it, the Drill refuses it and says **Jammed** (a ≠
  over it in the world; its inspector and hover tip say why), as it does for a good the project
  never takes. The Heart does the same for the Governor. The inspector lists each need as
  delivered/needed with its extras. A depot Unloader still sending a finished good only loops it
  through the depot; that need's tooltip says to switch it off.
- D5 wants 20 Molten Ember Ingots delivered hot: the drill takes a Molten ingot only while it is
  still hot (§5.10).

| Project | Where | Needs |
|---|---|---|
| D1 Repair the Drill | Surface | 40 Iron Plate, 30 Gear, 60 Copper Wire, 30 Reinforced Plate |
| D2 Bore to the Fungal Caverns | Shallows | 100 Steel Beam, 30 Motor, 50 Drill Bit |
| D3 Bore to the Crystal Depths | Fungal Caverns | 100 Cobalt Drill Head, 200 Insulation, 60 Filter |
| D4 Bore to the Magma Shelf | Crystal Depths | 200 Circuit, 100 Battery, 60 Resonant Core |
| D5 Bore to the Alien Strata | Magma Shelf | 60 Ember Core, 160 Heat Shield, 40 Circuit, 20 Molten Ember Ingot (delivered hot) |
| The Governor | the Heart, Alien Strata | 60 Heartstone, 120 Engine Glass, 40 Battery, 60 Ember Core |

Project sizes follow the pacing rule in §8: D1 and D2 are the two tutorials, D3 onward are sized to
the bands.

### 5.8 Money

- **Shipping Terminal** (Surface, 3×3): sells anything belted into it at its value. Running
  income shows as $/min in the top bar: Terminal and Chute sales and contract pay over the last
  minute. Milestone rewards add to your money but not to that rate.
- **Company Chute** (1×1, any underground layer): sells whatever is belted into it, from any side, at
  60% of its value, instantly. Ship it up for full value (+67%) or sell it here: that's the decision.
- **Contracts**: the board (Company window) shows 3 offers. Each asks for N of an item, where N is
  about 5 minutes of one machine's output of it (half as much again for every layer you have gone
  below the one where that offer first appears), and pays 1.7–2.5× its value (never more than 2.5×, free play included, so rushing goods
  can never feed a contract at a profit). Accept one at a time. Goods delivered at the Terminal or at
  any Company Chute count toward it first, and it pays on completion: each item its full share of the
  pay at the Terminal, 60% of that share at a Chute, so pay = round(pay × (terminal + 0.6 × chute) /
  count). Contract goods at a Chute don't also earn the 60% sale. Some contracts compete with drill
  projects for the same goods. One offer rotates out every 5 minutes; re-rolling the whole board
  costs $200.
- **Spending:**
  - Excavation per rock tile: $4 / $8 / $12 / $16 / $20 / $30 by layer.
  - Survey (underground only; reveals deposits and caverns in a 12-tile radius through the dark):
    $300 / $450 / $600 / $800 / $1,000 from the Shallows down. The Surface is never dark, so it has
    no surveys.
  - Licenses: Express Belt $2,500 (Crystal Depths). The Sorter license comes with milestone 3 and
    the Storage Crate is free from the Shallows.
  - Company Line upgrades: $600 (→100 kW), $1,000 (→160 kW).
  - Elevator upgrades (with goods from the lower station's depot first, the rest from the upper).
  - Rush: 3× the value of a planned ghost's missing goods.
  - Contract re-roll: $200.
- Start: $400.

### 5.9 Discovery

- Underground layers start dark and mostly solid. You see only the cavern around the shaft.
- **Excavate** by dragging over rock: the rock crumbles tile by tile. Breaking into a hidden cavern
  reveals the whole cavern at once, a small discovery moment. A tunnel breaks in where it meets the
  cavern edge to edge; a dug tile that touches it only at a corner leaves it dark, and the next tile
  that meets it straight on opens it.
- **Survey** (underground only) pings a 12-tile radius: deposits and caverns inside show as faint
  markers in the dark. It charges only when its circle reaches a cell not surveyed yet, so a click
  beside the map or over surveyed ground costs nothing.
- The **Assay Lab** (3×3) studies the four strange ores: Sapstone, Chorus Crystal, Emberite and
  Thrumstone. Belt in N samples to complete an assay. Each assay unlocks machines and recipes and
  gives a **knowledge card**: a one-line rule with an item diagram ("Sapstone: cobalt ore sealed in
  resin. Washing strips the resin. Separating keeps it, slowly.").
- Four more materials teach themselves: the first Glowcap, Resin or Charged Crystal you produce
  unlocks what uses it and shows its card, and the first Engine Glass shows the Engine Nodes' card.

| Assay | Samples | Unlocks |
|---|---|---|
| Sapstone | 20 | Washer, Separator, Cobalt Ingot, Cobalt Drill Head |
| Chorus Crystal | 20 | Crystal Cutter, Crusher, Charger, Shield Wall, Circuit |
| Emberite | 20 | Cooling Bath, Thermal Extractor, Pressure Forge, Precision Assembler, Foundation, Insulated Belt, Heat Shield |
| Thrumstone | 20 | Attuner, Sequencer (in time to feed the Waking Node) |

| First made | Unlocks |
|---|---|
| Glowcap | Mycelium Fiber, Spore Collector, Biofuel |
| Resin | Insulation, Filter, Spore Filter |
| Charged Crystal | Overcharger, Stabilizer, Battery, Resonance Tap |
| Engine Glass | nothing new: its card explains the Engine Nodes |

### 5.10 Hazards

Hazards are physics, not zones: each rule applies wherever its cause is, on any layer. The exact
numbers are in the glossary (§5.15).

**Spores (Fungal Caverns).** Glowcap patches fill the air around them with spores (a density field,
strongest at the patch, fading over ~8 tiles). A machine in spores works at `1 − 0.5 × density`
(at worst 50%). Fungal machines (Harvester, Spore Collector) are immune. A **Spore Filter** clears
a 6-tile radius. Two of the three Sapstone deposits sit 3–5 tiles from a glowcap patch, so the first
cobalt line runs 20–35% slow until it is filtered. The turn: a **Spore Collector** in thick spores
produces **Spore Dust** (more the thicker the air), which makes **Biofuel** that burns hotter than
coal.

**Interference (Crystal Depths, and anywhere crystal machines run).** Two working machines
**interfere** when the gap between their footprints is 2 tiles or less (counted in whole tiles,
diagonals included). A **Shield Wall** anywhere inside the rectangle spanned by both footprints
blocks it once it is built (a planned wall blocks nothing). Interferers are working production
machines of 2×2 or larger (machines, miners, collectors) that draw at least 8 kW, from the grid or
from a conduit. Stabilizers are dampers and emit nothing; Resonance Taps, generators and extractors
emit nothing either. Crystal machines (Cutter, Charger, Overcharger) are *sensitive*: each
interferer costs 25% speed (at worst 25%). Once the Crystal Depths are open, hovering, selecting or
placing a sensitive machine, a tap or a noisy machine shows its 2-tile ring; interfering pairs show
crackling arcs (a tap's arcs carry a spark toward it), and a blocked pair shows the rectangle its
wall stands in. The placement ghost shows a sensitive machine's predicted speed. The turn: a
**Resonance Tap** makes 20 kW for every interferer around it (up to 6, counted at the last hazard
refresh), so a deliberately noisy production block next to a shielded crystal line becomes a power
plant.

**Heat (Magma Shelf).** Ground within 2 tiles of magma is **hot**; 3–4 tiles away it is **warm**.
Ordinary machines and miners slow down near magma: ×0.5 on hot ground, ×0.75 on warm. The heat
family (Smelter, Foundry, Pressure Forge) loves it: ×2 on hot, ×1.5 on warm. The Cooling Bath and
Thermal Extractor don't care. A machine takes the grade of the hottest tile under it that has no
**Foundation** (a 1×1 floor made from Heat-Resistant Aggregate); a Foundation removes both the
penalty and the bonus, and it can go on deposit tiles without stopping a miner. The Pressure Forge
only works on hot ground (warm is not enough). The Emberite vents sit inside the hot band, so their
miners run at half speed until Foundations go down. The turn: late game, you build against the magma
on purpose. At ×2, one rich iron Miner (60/min) feeds exactly one hot Smelter.

**Hot items.** A Molten Ember Ingot leaves the Pressure Forge at 100 heat. On a belt-type tile it
loses 10 heat a second; on an Insulated Belt, 1 a second (10× slower). Below 50 heat it becomes a
Cooled Ember Ingot: about 7.5 tiles of plain conveyor (15 on express), or about 75 tiles of insulated
belt. Inside a machine's buffers it holds its heat. Anything that isn't a machine or a belt-type tile
cools it at once: a depot, crate, elevator, terminal, chute, or the Drill (except D5's hot
delivery). Only a Pressure Forge can reheat a Cooled ingot. The Precision Assembler needs a hot
ingot, and it needs **steady ground**: at least 8 tiles from any hot ground. So every Ember Core line
has a real run between the forge and the assembler, and insulation from the Fungal Caverns' resin is
what makes it work. D5 also wants 20 Molten ingots delivered hot, so one hot line runs all the way
to the Drill.

**Instability (Crystal Depths).** An Overcharged Crystal shatters into Crystal Grit the moment it
touches a belt. It must go directly from an Overcharger into an adjacent Stabilizer. Both take 8 s, so
a pair runs clean, and the Stabilizer emits no interference, so the pair never slows itself. The
puzzle is shielding the pair from everything else within 2 tiles.

**The Engine (Alien Strata).** Glass **conduits** run through the floor, dormant and dark when you
arrive. Three **Engine Nodes**, fixed alien machines, make Heartstones: each takes 2 s per accepted
item and 4 items per Heartstone (a Heartstone every 8 s, 7.5 a minute). The node nearest the
arrival, the **Waking Node**, takes Battery and Resonant Core, alternating; the other two take Engine
Glass and Resonant Core, alternating. Anything else, or the right item out of turn, is pushed out of
the node's side (a Molten ingot comes out Cooled; an Overcharged Crystal is refused) and the
sequence keeps its place. Heartstones leave by its front. With 4 Heartstones waiting there, or 4
wrong items in its side chute, the node takes nothing, and its inspector says which ("Output full:
belt the Heartstones away"; "Side chute full", naming the chute's compass face).

Each Heartstone a node makes **wakes** its conduit out to the next ring, permanently, and the newly
lit tiles flash with a pulse. Ring 1 reaches 1 tile past the nearest conduit outside the node, so
the first Heartstone always lights something; each later ring reaches 3 tiles further, 5 rings in
all, the last at least 15 tiles out (the Waking Node's rings are 5, 8, 11, 14 and 17 tiles). A full
wake is 5 Heartstones: 10 Batteries and 10 Resonant Cores at the Waking Node. A node counts as awake
from its first ring. A ring that lights nothing new (another node's rings got there first) plays no
pulse and raises no toast; Mags still marks a node's first ring, since the node itself has woken.
The Governor wakes every conduit left at the ending, and after it no Heartstone plays or says
anything. Awake conduit gives light, enough that a line built along it reads in the dark; dormant
conduit gives none. Awake conduit still hidden in the rock shows through the dark as a dim glass
vein, so each ring visibly runs on toward the other nodes and the Heart, and a sleeping node looks
dormant until its first Heartstone. A machine with at least 2 footprint tiles on awake conduit
draws from the **conduit pool** instead of the grid: 60 kW per awake node, and when conduit
machines want more than that, they slow down (supply / demand), like a grid. The **Attuner**, which
turns Thrumstone into Engine Glass, works only with at least 2 footprint tiles on awake conduit and
draws 30 kW from the pool, so one awake node runs exactly two Attuners, and waking the other nodes
is how Engine Glass scales. The **Sequencer** builds a clean A/B stream from two belts; it comes
with the Thrumstone assay, so two Unloaders at the depot and a Sequencer can feed the Waking Node.
So the Engine starts as a problem (nothing runs on the conduits until the Waking Node is fed
Batteries and Resonant Cores from the Crystal Depths, which its depot can request) and becomes a
tool that has to be shared.

### 5.11 Follow the rock: item visual language

Each processing step visibly changes the item: raw ore is a rough, dull lump; smelted metal is a bar
with a highlight; pressed parts are crisp geometric shapes; assembled parts have several materials and
a bright detail; exotic goods glow or wear a protective casing. Charged items glow cyan, hot items
shimmer orange (a code effect while an ingot is Molten), unstable items flicker. You can follow one
rock down a line and see it climb in value.

### 5.12 Failure philosophy

Nothing the player built is ever destroyed. Problems show up as: slower machines, stopped lines,
backed-up belts, items turned into a lesser form (cooled ingots, shattered grit) that can still be
used or reworked. A wrong item at an Engine Node is pushed out, not eaten, and a belt you replace
hands its item on. No random disasters.

### 5.13 Objectives and narrative delivery

- An objective tracker (top left) shows the current milestone and its steps with live counts. Every
  step label fits the panel beside its count (a test measures them with the UI font), so generated
  labels are short ("Make Steel Ingot", "Feed the Drill"). During a drill project the tracker lists
  the project's goods and an ETA: each good's rate over the last 2 minutes of game time, and the
  slowest good's time to finish ("1 min 23 s"). A needed good with nothing arriving in that window
  shows its count in coral, and the line reads "No supply: Gear" instead of a time.
- Mags's radio messages pop up in a small portrait box at the bottom left, one or two sentences,
  queued, dismissible, never blocking input. When In Sequence and The Governor start she says where
  the sleeping nodes and the Heart are, by compass and distance from the shaft ("The Heart lies 36
  tiles east of the shaft.").
- A milestone's hint, under its steps, says what its rules alone don't: Wire and Gears' that
  everything built is paid from the HQ, so keep some plates flowing into it; Reinforcement's that
  machines only take parts from belts, never from the HQ, so the Assembler needs its own plate line
  (the Surface has no Unloader); Keep It Hot's that a hot line which backs up still cools, so it
  needs an overflow into the depot; Wake the Engine's that the node holds only four Heartstones, so
  belt them away from its front.
- Board memos arrive with contracts and at breakthroughs (dry, corporate, one paragraph max).
- Each act ends with a breakthrough and a title card for the next layer. When the project's
  milestone is the open one, it lands at once and Mags's introduction to the new layer comes first,
  then her line about the old drill lines (§5.7), then the Board's memo; the layer's own hint (the
  dark, spores, interference, heat, conduits) waits until the card is gone and the radio has
  nothing left to show.

**The milestone path** (31 milestones, one authored order, the same for every player):

| # | Act | Milestone | Steps (counts are deliveries anywhere unless stated; a "build" step counts finished buildings that already stand) | Reward |
|---|---|---|---|---|
| 1 | I Surface | First Light | Build a Miner on iron and a Smelter, belt ore into it, ship iron ingots (the player builds the first line; DECISIONS #121) | see progression.ts |
| 2 | | Copper Line | Build a Miner on copper (Mags pre-places its planned ghost, which builds itself from HQ stock); ship 10 Copper Ingot | $75 |
| 3 | | Wire and Gears | Produce 30 Copper Wire and 15 Gear | $75, Sorter license |
| 4 | | Brickwork | Produce 20 Brick; upgrade the Company Line | $125, Assembler unlocked |
| 5 | | Reinforcement | Build an Assembler; produce 10 Reinforced Plate | $150 |
| 6 | | Repair the Drill | Complete D1 | $250, breakthrough |
| 7 | II Shallows | Down the Shaft | Ride down to the Shallows; build 3 Lamps there | $200 |
| 8 | | Steel | Produce 30 Steel Ingot | $300 |
| 9 | | Motors | Produce 10 Motor | $400 |
| 10 | | The Bore Site | Dig through to the bore site; send 80 items between layers by elevator | $500 |
| 11 | | Bore to the Fungal Caverns | Complete D2 | $800, breakthrough |
| 12 | III Fungal | Something Growing | Build an Assay Lab; assay Sapstone | $600 |
| 13 | | Wash or Separate | Produce 20 Cobalt Ore and 10 Resin | $600 |
| 14 | | Clean Air | Build a Spore Filter | $800 |
| 15 | | Cobalt | Produce 30 Cobalt Ingot | $800 |
| 16 | | Spore Power | Produce 10 Biofuel | $1,000 |
| 17 | | Bore to the Crystal Depths | Complete D3 | $1,500, breakthrough |
| 18 | IV Crystal | The Singing Rock | Assay Chorus Crystal | $1,200 |
| 19 | | Order Matters | Produce 10 Charged Crystal and 10 Conductive Powder | $1,500 |
| 20 | | Quiet Please | Block interference between two machines with a Shield Wall | $1,500 |
| 21 | | Overcharge | Produce 5 Resonant Core | $2,000 |
| 22 | | Bore to the Magma Shelf | Complete D4 | $2,500, breakthrough |
| 23 | V Magma | Hot Rock | Assay Emberite | $1,500 |
| 24 | | Three Routes | Produce 20 Aggregate; run a Thermal Extractor; forge 5 Molten Ember Ingot | $2,000 |
| 25 | | Keep It Hot | Produce 10 Ember Core | $2,500 |
| 26 | | Bore to the Alien Strata | Complete D5 | $3,000, breakthrough |
| 27 | VI Alien | The Walls Are Machines | Assay Thrumstone | $3,000 |
| 28 | | Wake the Engine | Make 5 Heartstones at the Waking Node (Batteries and Resonant Cores, alternating; each Heartstone wakes its conduit a ring further out) | $2,500 |
| 29 | | Engine Glass | Build an Attuner; produce 20 Engine Glass (Attuners run only on awake conduit) | $1,500 |
| 30 | | In Sequence | Wake all three Engine Nodes | $1,000 |
| 31 | | The Governor | Complete the Governor at the Heart | the ending |

Act I's milestones pay $725 in all, so the Surface's second Company Line upgrade ($1,000) waits on
what the Terminal earns. Act V's milestones pay $6,000 before the breakthrough and Act VI's $8,000:
late money is flattened so it never buys out the finale. The Governor's milestone lands, with its
toast and sound, the moment the Heart has everything; then the ending plays. Any milestone still
open before it (In Sequence, if a node still sleeps) lands first, in order, with its reward.

### 5.14 The ending and after

- **The ending sequence** (`src/app/ending.ts`, DECISIONS #103) runs on real seconds, so 2x and the
  pause leave it alone, and the game keeps running under it. About 33 s with all six layers:
  - the camera pans from the player's view to the Heart (3 s) as a white flash fades, and holds on
    it (2.8 s) under its layer card while rings swell out of its core and light spreads over its
    cave;
  - for each layer above, it rises through the rock (1.2 s) and holds on the station the shaft
    comes into (2 s): light spreads out from the shaft, the layer card gives its depth, name and
    line, and a bell rings a step higher each time;
  - the Surface (its top station, at the old Drill site) comes up in the last of the night instead,
    and the dawn lifts it (2.6 s): a sky over the north edge, the sun, a warm dither on the ground;
  - five closing lines, one every 2 s, the last held 2.8 s, then the thank-you card.
  The HUD (all but the paused label) and the inspector stay hidden until the card; Esc or a click
  skips to it; Space and Tab still pause and speed the sim. Nothing changes the hum's layer while it
  plays (§10). "Keep building (free play)" closes the card and puts the player's view back, unless
  they moved it. A game loaded within 40 s of game time of the ending plays it from the start.
- **Free play**: endless contracts that grow with your factory but never pay more than 2.5× value.
  The thank-you card gives the operation's time, money earned, items made, tiles dug and contracts
  done; the Company window keeps the time, money earned and tiles dug.
- **Later updates** (planned, see ROADMAP "Beyond 1.0"): machine-family mastery (a bulk miner,
  a precision miner, a compact miner: different tools, not a ladder), challenge sites (limited power,
  cramped maps, one-ore economies, no imports), and new operations (a fresh mountain with a different
  starting loadout, keeping your old factory intact). Optional depleting deposits as a challenge
  rule.

### 5.15 Rules glossary

One line per rule. The sections above explain; this list settles. When the code and this list
disagree, one of them is a bug.

**Building**
- **Paying:** a building is paid from its own layer's depot; removing it refunds every good it took
  from that depot. Pre-placed buildings (the starter line, each layer's rig) refund their full cost.
- **Refunds:** removal and a recipe change also return the building's contents and the inputs of an
  unfinished craft (not a Thermal Extractor's burning Emberite); a hot item comes back Cooled, an
  unstable one is lost.
- **Planned ghosts:** build oldest first; a newer ghost never takes an item an older waiting ghost
  still needs.
- **Rush:** a planned ghost builds at once for 3× the value of the goods its depot lacks; those
  bought goods are never refunded.
- **Swaps:** placing over a working building needs the new piece's goods on the spot (the old piece's
  refund counts, less any rushed goods), or it is refused ("Not enough goods to swap this in"); over
  a planned ghost the new piece waits as a ghost.
- **Foundations:** paid on the spot or refused; they are never planned.
- **Belt drags:** across a working belt a drag lays a Crossing, and at its start too when it goes on
  past a belt that is a straight run of a line across it (the cell behind pushes into it); on a
  turning belt at its start, and at its end or turn, it leaves a belt alone unless the drag runs
  along that belt's line; it never replaces other logistics pieces; crossings are laid first, and
  every piece it can't lay is reported.
- **Replaced belts:** the item on a replaced belt moves to the new piece, or into the depot if the new
  piece can't carry it.
- **Pause:** only machines, miners and collectors pause; a paused one finishes its craft, then starts
  no new one and draws no power.

**Belts and machines**
- **Belts:** one item per tile (90/min on a conveyor); the back and side inputs take turns, so merges
  are fair.
- **Feeding a belt:** a machine, station or node counts as a belt's input only at the tile it pushes
  into (its output or side port).
- **Output port:** one tile: front-right on a 2×2 (relative to its facing), front-centre on a 3×3.
- **Side output:** the front-most tile of the machine's left face.
- **Inputs:** any other edge tile of the machine; it buffers 2 crafts' worth of each input (at least
  4) and 4 finished items.
- **Splitter:** deals front, left, right in turn, skipping a blocked output.
- **Sequencer:** takes left, right, left, right, strictly, starting with the left; it waits for the
  input whose turn it is.
- **Jammed:** a belt stuck against a machine that never takes its item or against its front, against
  an elevator station's front, or head-on against a belt facing it, shows Jammed (≠) while it
  pushes and half a second after; a line that is only backed up is not jammed.
- **Unloaders and ghosts:** a depot Unloader leaves the depot what the layer's waiting ghosts hold
  (their whole cost); one on a lower station takes from the arrivals before they reach the depot.
- **Unloader item:** picking another item, or none, sends the item it holds back to the depot.

**Elevators and depots**
- **Station faces:** a station takes items on every face but its front, the exit, corners included;
  a belt pushing into the front shows the station Jammed.
- **Down:** everything sent down a shaft lands in the lower layer's depot.
- **Lower station:** faces its depot and never turns; it hands the depot the first arrival the depot
  takes.
- **Up:** everything sent up comes out of the upper station's output port, mixed, in arrival order.
- **Cab loading at the top:** requested goods first (up to half the cab, rounded down), the requested
  items in turn; then belt cargo from the bay; after the dwell, more requests if room is left. Near
  a full depot below, an item's bay cargo goes before its requests (Full depot below).
- **Requests:** any item the save has made, except hot or unstable goods; never take the upper depot
  below its own request for that item; a layer asks for its own requests plus what the layers below
  need through it.
- **The HQ's requests:** "Keep for the Surface", a floor the elevator never takes the HQ below.
- **Full depot below:** the lower depot holds 999 of an item at most, counting what is on its way
  down and that item's cargo in the top bay; at 999 the top station takes no more of it and
  requests for it wait, so near the cap the bay's cargo goes down first. Bay cargo with no room
  below stays in the bay; the top station names what it holds and the requests it holds back.
- **Cab departure:** when full, when cargo waits at the other end, or after 2.5 s with a part load.
- **Elevator upgrades:** each good from the lower depot first, the rest from the upper depot, plus the
  money.

**Power**
- **Draw:** a working machine draws its full rating even when slowed; idle and paused machines draw
  nothing.
- **Shortfall:** a short layer runs every machine at supply / demand.
- **Cables:** surplus crosses shafts to short layers nearest-first, within each cable's capacity.
- **Crew rigs:** a new layer's rig generator starts with 4 coal, all it holds, so the rig runs
  before any power comes down the cable.

**Hazards**
- **Spores:** speed × (1 − 0.5 × density); the Fungus Harvester and Spore Collector are immune; a
  Spore Filter clears 6 tiles.
- **Interference range:** two working machines interfere when the gap between their footprints is
  2 tiles or less (whole tiles, Chebyshev).
- **Shielding:** a built Shield Wall anywhere inside the rectangle spanned by both footprints blocks
  the pair; a planned one doesn't.
- **Interferers:** working 2×2-or-larger production machines (machines, miners, collectors) drawing
  at least 8 kW, on the grid or a conduit; never Stabilizers, taps, generators or extractors.
- **Sensitive machines:** the Crystal Cutter, Charger and Overcharger lose 25% per interferer, down
  to 25%.
- **Resonance Tap:** +20 kW per interferer, up to 6, counted at the last hazard refresh.
- **Heat grades:** hot ground is within 2 tiles of magma; warm ground 3–4 tiles.
- **Heat effects:** ordinary machines and miners ×0.5 hot, ×0.75 warm; Smelter, Foundry and Pressure
  Forge ×2 hot, ×1.5 warm; Cooling Bath and Thermal Extractor unaffected.
- **A machine's grade:** the hottest tile under its footprint that has no Foundation.
- **Foundations:** remove both penalty and bonus; they can sit on deposit tiles and the miner still
  mines.
- **Pressure Forge:** works only on hot ground (warm is not enough).
- **Steady ground:** a Precision Assembler must stand at least 8 tiles from any hot ground.
- **Item heat:** a Molten Ember Ingot leaves the forge at 100 heat; belt-type tiles take 10 a second,
  an Insulated Belt 1; machine buffers keep it.
- **Cooling point:** below 50 heat it becomes a Cooled Ember Ingot; a Pressure Forge can reheat it.
- **Containers cool:** a hot item entering a depot, crate, elevator, terminal, chute or the Drill
  becomes Cooled at once (except D5's hot delivery).
- **Hot delivery:** the D5 Drill accepts a Molten Ember Ingot only while it is hot.
- **Instability:** an Overcharged Crystal touching a belt shatters into Crystal Grit; it must go
  straight from an Overcharger into an adjacent Stabilizer.

**The Engine**
- **Dormant conduits:** conduits start dormant; each Heartstone a node makes wakes its conduit out to
  the next ring, permanently: ring 1 reaches 1 tile past the nearest conduit outside the node, each
  later ring 3 tiles further, 5 rings (the last at least 15 tiles out); completing the Governor wakes
  every conduit left. A ring that lights nothing new gives no pulse or toast (Mags still marks a
  node's first ring), and after the ending no Heartstone gives a pulse, toast or Mags line.
- **Conduit light:** awake conduit lights every other tile along it (radius 2.5, strength 0.7), so
  a belt laid on it reads; dormant conduit gives none. Awake conduit still in unrevealed rock shows
  as a dim vein through the dark (it gives no light there).
- **Awake node:** a node is awake from its first ring: its share joins the conduit pool and it counts
  toward In Sequence (all three awake).
- **On a conduit:** a machine with at least 2 footprint tiles on awake conduit draws from the conduit
  pool instead of the grid.
- **Conduit pool:** 60 kW per awake node; when conduit machines want more, they run at supply /
  demand.
- **Attuner:** works only with at least 2 footprint tiles on awake conduit; draws 30 kW from the pool
  (one awake node runs exactly two).
- **Engine Nodes:** 2 s per accepted item, 4 items per Heartstone (one every 8 s).
- **Node patterns:** the Waking Node (nearest the arrival) takes Battery, Resonant Core, alternating;
  the other two take Engine Glass, Resonant Core, alternating.
- **Wrong item:** anything else, or the right item out of turn, is pushed out of the node's side
  (cooled if hot; an Overcharged Crystal is refused); the sequence keeps its place.
- **Node full:** with 4 Heartstones at its front or 4 items in its side chute, a node takes nothing.

**Progress and money**
- **Build steps:** count finished buildings that already stand, not ghosts, and not only ones built
  since the milestone began.
- **First-production unlocks:** the first Glowcap, Resin or Charged Crystal made unlocks what uses
  it; the first Engine Glass only shows its card. The Sequencer unlocks with the Thrumstone assay.
- **Contracts:** delivered at the Shipping Terminal or any Company Chute; pay = round(pay × (terminal
  + 0.6 × chute) / count); about 5 minutes of one machine's output; 1.7–2.5× value.
- **Company Chute:** sells at 60% of value, instantly, from any side; a contract item counts toward
  the contract instead, at 60% of its share.
- **Income:** the $/min rate counts Terminal and Chute sales and contract pay, not milestone rewards.
- **Survey:** charges only when its 12-tile circle reaches a cell not surveyed yet.
- **Digging:** a dug tile opens a hidden cavern it meets edge to edge, all at once; touching one only
  at a corner opens nothing.
- **Drill goods:** only goods belted into the Drill count; money can't buy them.
- **Extras:** a Drill or the Heart takes a good its project already has all of and stacks it in the
  layer's depot (a Molten ingot cools); with 999 there it refuses it and shows Jammed, as for a
  good the project never takes.
- **Game speed:** 1× or 2×.

---

## 6. Layer by layer

Map sizes are in tiles. "Start pocket" is what is visible on arrival. The hidden deposits of older
layers' ores below the Shallows (copper, iron, coal, Sapstone) are deliberate: a survey and some
digging buy a local supply instead of cab capacity on the elevators (DECISIONS #55). The ores that
belong to one layer (Glowcap, Chorus Crystal, Emberite, Thrumstone) appear nowhere else.

### Layer 0: The Dig Site (Surface)

- **Mood:** dusty ochre gravel, dry scrub, morning light. The mountain face (impassable rock)
  fills the top of the map; the broken Drill stands silent at its foot.
- **Map:** 64×48, open ground with boulder clusters (clear for $4 a tile) and a dry creek bed.
- **Deposits:** 2 Iron (normal), 2 Copper (normal), 1 Stone (normal), each about 5×5 (20–25 ore
  tiles: a radius-2 patch with a ragged edge). Deposits on every layer are this size, except the
  Shallows' small stone patch (about 3×3) and the vents, which are exactly one Miner (2×2).
- **Fixed:** HQ (3×3), Shipping Terminal (3×3), the Drill (5×5).
- **Opening state:** a Miner on iron → belt → Smelter → **Splitter** is already running, and full:
  ore on the belts into the Smelter, ingots in its buffer and on every other belt after it, so the
  first sale lands at about 1 s. The splitter feeds both the Shipping Terminal and a Press that pushes
  Iron Plate into the HQ, so money and the HQ's plate count (in the top bar's depot strip) both tick
  up within seconds. HQ holds 100 Iron Plate, 30 Gear, 20 Copper Wire, 30 Brick, and keeps 20 Iron
  Plate, 10 Gear and 10 Copper Wire for the Surface. The camera opens on (22, 19.25), so the Drill and
  the Terminal both show at 1280×720.
- **Teaches:** camera, placing, rotating, belts, splitting, ratios, the depot, shipping, the drill,
  power (the Company Line upgrade).

### Layer 1: The Shallows

- **Mood:** umber rock, timber supports, lantern light, dripping water.
- **Map:** 72×52, mostly rock. Start pocket ~22×14 around the shaft. 4–6 hidden caverns.
- **Deposits:** Iron (rich ×2), Copper (rich ×1, normal ×1), Coal (normal ×2), Stone (normal ×2).
  A rich iron deposit and a coal deposit sit inside the start pocket; the running rig stands on the
  coal.
- **Ambient light:** low. Lamps (radius 6) and working machines (radius 4) light it; idle machines
  and belts glow a little (STYLE "Light and darkness" has every source).
- **New:** freight elevator, depot requests, Lamp, Unloader, Storage Crate (free), Company Chute,
  Foundry, Combustion Generator, Motor, Drill Bit, excavation, survey.
- **Bore site:** a hidden cavern across the map from the shaft (about 39 tiles away), shown by a
  beacon pulse through the dark. Its walls show amber-sealed rock that can't be mined yet, and Mags
  remarks on it: the first strange thing, about 30 minutes in.

### Layer 2: The Fungal Caverns

- **Mood:** deep violet stone, teal moss, magenta and lime glowcaps, drifting spore motes.
- **Map:** 72×52. Caverns are bigger and wetter: underground pools (water tiles, impassable).
- **Deposits:** Sapstone ×3 (one rich), Glowcap patches ×3, Iron (normal ×1), Coal (normal ×2, one
  in the start pocket under the running rig), Copper (normal ×1, hidden). Two of the three Sapstone
  deposits sit 3–5 tiles from a glowcap patch.
- **Hazard:** spores around glowcap patches.
- **New:** Assay Lab, Washer (must touch water), Separator, Fungus Harvester, Spore Collector,
  Spore Filter; items Sapstone, Cobalt Ore, Resin, Cobalt Ingot, Glowcap, Mycelium Fiber,
  Spore Dust, Biofuel, Insulation, Filter, Cobalt Drill Head.
- **The decision:** washing (2 s, resin lost, must touch water) vs separating (6 s, resin kept on the
  side output, more power). D3 needs 400 Cobalt Ore (100 Cobalt Drill Heads × 2 ingots × 2 ore) but
  only 260 Resin (200 Insulation + 60 Filter). Separate everything and the resin backs up and stalls
  the Separators; wash everything and there is no resin. Separate about 260 and wash about 140, or
  burn the surplus resin in a generator (60 kW each).

### Layer 3: The Crystal Depths

- **Mood:** deep blue stone, chorus crystals ringing pale cyan, faint chords when machines run.
- **Map:** 72×52. Narrow crystal-lined fissures between caverns.
- **Deposits:** Chorus Crystal vents ×3, all poor (each fits exactly one Miner: 15/min, 45/min in
  all; one in the start pocket, two hidden), Iron (normal ×1; rich ×1, hidden), Sapstone (normal ×1,
  hidden), Coal (normal ×1, hidden, far from the shaft). No copper: circuit wire comes down the
  elevators (the depot opens requesting 80 Copper Wire).
- **Hazard:** interference.
- **Power:** no coal near the shaft. The layer runs on the Fungal Caverns' cable (60 kW on Mk1,
  150 kW on Mk2), Resonance Taps beside a noisy block, or fuel requested or shipped down.
- **New:** Crystal Cutter, Crusher, Charger, Overcharger, Stabilizer, Shield Wall, Resonance Tap,
  Express Belt (license); items Chorus Crystal, Cut Crystal, Crystal Grit, Charged Crystal,
  Conductive Powder, Overcharged Crystal, Resonant Core, Battery, Circuit.
- **Order matters:**
  - Cut → Charge = **Charged Crystal** → Battery.
  - Cut → Charge → Crush = **Conductive Powder**, 2 per crystal. The rich route: for 60 powder a
    minute, 30 crystal a minute and 8 machines (2 Cutters, 2 Chargers, 4 Crushers; 4 of them
    sensitive).
  - Crush → Charge grit = **Conductive Powder**, 1 per crystal → Circuit. The cheap route: for 60
    powder a minute, 60 crystal a minute but only 6 machines (4 Crushers, 2 Chargers; 2 sensitive).
  - Cut → Charge → Overcharge → Stabilize = **Resonant Core** (exotic).
  - Crystal is scarce at first: the start-pocket vent alone (15/min) covers D4's first chain on the
    rich route (360 crystal) but not on the cheap one (560), so the rich route is the opener. Once
    all three vents run and crystal is slack (D5, the Governor), the cheap route saves machines. With
    45 a minute in all, circuits, batteries and cores compete for crystal by Act V.

### Layer 4: The Magma Shelf

- **Mood:** black basalt, red-orange magma channels, heat shimmer, hexagonal pillars.
- **Map:** 72×52. Magma channels (impassable) with a band of hot ground 2 tiles wide around them,
  and warm ground 2 tiles beyond that.
- **Deposits:** Emberite vents ×3 (each fits exactly one Miner: 30/min, 90/min in all), each inside
  the hot band; Iron (rich ×1); Coal (normal ×1, in the start pocket under the running rig); Copper
  (rich ×1, hidden). No Chorus Crystal: its three poor vents on the Crystal Depths cap it at 45/min.
- **Hazard:** heat.
- **New:** Cooling Bath, Thermal Extractor, Pressure Forge, Precision Assembler, Foundation,
  Insulated Belt; items Emberite, Heat-Resistant Aggregate, Slag, Molten Ember Ingot, Cooled Ember
  Ingot, Ember Core, Heat Shield.
- **Three routes for one rock:** cool it into Aggregate (foundations, heat shields), burn it in a
  Thermal Extractor (220 kW, and its Slag quenches into more Aggregate), or forge it hot and send it
  down an insulated belt to a Precision Assembler on steady ground for Ember Cores (the drill's next
  head). Three vents cap Emberite at 90 a minute, so the routes compete.

### Layer 5: The Alien Strata

- **Mood:** grey-green machine stone, dark glass conduits that light up teal and pulse in time with
  the hum once the Engine wakes, gears the size of houses in the walls.
- **Map:** 72×52. Dormant conduit lines cross the map; three fixed Engine Nodes, the nearest to the
  shaft being the Waking Node; the Heart (7×7) at the bottom.
- **Deposits:** Thrumstone ×3 (one rich), Coal (normal ×1, under the running rig), Iron (rich ×1,
  hidden), Copper (rich ×1, hidden).
- **Hazard / rule:** the Engine (dormant conduits that wake ring by ring, nodes that want their items
  in order, a conduit pool of 60 kW per awake node that the Attuners share).
- **New:** Attuner, Sequencer; items Thrumstone, Engine Glass, Heartstone.
- **Finding the Engine:** the Heart and the two far nodes sit in hidden caverns, and the layer has
  no bore site. While the Governor is open (all of Act VI) the Heart shows the bore-site beacon
  through the dark until it is found, and each Engine Node a dimmer amber marker until it wakes
  (just the ring, round its glass core, once it is in sight, as the Waking Node is from the start).
  Mags gives their bearings from the shaft when In Sequence and The Governor start: the sleeping
  nodes 26 tiles north-east and 43 tiles east, the Heart 36 tiles east.
- **Finale:** the Governor at the Heart pulls from every layer: Batteries (3), Ember Cores (4),
  Heartstones (5, from Resonant Cores (3) and Engine Glass (5)), on a factory standing on steel from
  the Shallows and resin from the Fungal Caverns.

---

## 7. Content tables

Item values are what the Shipping Terminal pays (a Company Chute pays 60%). Rates assume one machine
at full speed.

### 7.1 Items

| Id | Name | Layer | Value | Made by |
|---|---|---|---|---|
| iron_ore | Iron Ore | 0 | $1 | Miner |
| copper_ore | Copper Ore | 0 | $1 | Miner |
| stone | Stone | 0 | $1 | Miner |
| iron_ingot | Iron Ingot | 0 | $3 | Smelter |
| copper_ingot | Copper Ingot | 0 | $3 | Smelter |
| brick | Brick | 0 | $3 | Smelter |
| iron_plate | Iron Plate | 0 | $4 | Press |
| gear | Gear | 0 | $4 | Press |
| copper_wire | Copper Wire | 0 | $2 | Press |
| reinforced_plate | Reinforced Plate | 0 | $14 | Assembler |
| coal | Coal | 1 | $2 | Miner |
| steel_ingot | Steel Ingot | 1 | $9 | Foundry |
| steel_beam | Steel Beam | 1 | $11 | Press |
| motor | Motor | 1 | $24 | Assembler |
| drill_bit | Drill Bit | 1 | $40 | Assembler |
| sapstone | Sapstone | 2 | $3 | Miner |
| cobalt_ore | Cobalt Ore | 2 | $4 | Washer, Separator |
| resin | Resin | 2 | $6 | Separator |
| cobalt_ingot | Cobalt Ingot | 2 | $12 | Smelter |
| glowcap | Glowcap | 2 | $2 | Fungus Harvester |
| mycelium | Mycelium Fiber | 2 | $2 | Press |
| spore_dust | Spore Dust | 2 | $1 | Spore Collector |
| biofuel | Biofuel | 2 | $8 | Assembler |
| insulation | Insulation | 2 | $14 | Assembler |
| filter | Filter | 2 | $16 | Assembler |
| cobalt_drill_head | Cobalt Drill Head | 2 | $120 | Assembler |
| chorus_crystal | Chorus Crystal | 3 | $6 | Miner |
| cut_crystal | Cut Crystal | 3 | $10 | Crystal Cutter |
| crystal_grit | Crystal Grit | 3 | $3 | Crusher |
| charged_crystal | Charged Crystal | 3 | $18 | Charger |
| conductive_powder | Conductive Powder | 3 | $8 | Charger, Crusher |
| overcharged_crystal | Overcharged Crystal | 3 | — (shatters) | Overcharger |
| resonant_core | Resonant Core | 3 | $90 | Stabilizer |
| battery | Battery | 3 | $60 | Assembler, Precision Assembler |
| circuit | Circuit | 3 | $30 | Assembler, Precision Assembler |
| emberite | Emberite | 4 | $8 | Miner |
| aggregate | Heat-Resistant Aggregate | 4 | $14 | Cooling Bath |
| slag | Slag | 4 | $1 | Thermal Extractor |
| hot_ember_ingot | Molten Ember Ingot | 4 | $0 (unsellable: cools on entry) | Pressure Forge |
| cold_ember_ingot | Cooled Ember Ingot | 4 | $10 | (a Molten one that cooled) |
| ember_core | Ember Core | 4 | $160 | Precision Assembler |
| heat_shield | Heat Shield | 4 | $80 | Assembler |
| thrumstone | Thrumstone | 5 | $15 | Miner |
| engine_glass | Engine Glass | 5 | $40 | Attuner |
| heartstone | Heartstone | 5 | $400 | Engine Node |

### 7.2 Recipes

| Machine | Recipe | In | Out | Time |
|---|---|---|---|---|
| Smelter | Iron Ingot | 2 Iron Ore | 1 Iron Ingot | 4 s |
| Smelter | Copper Ingot | 2 Copper Ore | 1 Copper Ingot | 4 s |
| Smelter | Brick | 2 Stone | 1 Brick | 4 s |
| Smelter | Cobalt Ingot | 2 Cobalt Ore | 1 Cobalt Ingot | 4 s |
| Press | Iron Plate | 1 Iron Ingot | 1 Iron Plate | 4 s |
| Press | Gear | 1 Iron Ingot | 1 Gear | 4 s |
| Press | Copper Wire | 1 Copper Ingot | 2 Copper Wire | 4 s |
| Press | Steel Beam | 1 Steel Ingot | 1 Steel Beam | 4 s |
| Press | Mycelium Fiber | 1 Glowcap | 2 Mycelium Fiber | 4 s |
| Foundry | Steel Ingot | 1 Iron Ingot + 1 Coal | 1 Steel Ingot | 4 s |
| Assembler | Reinforced Plate | 2 Iron Plate + 1 Brick | 1 | 8 s |
| Assembler | Motor | 2 Gear + 4 Copper Wire | 1 | 8 s |
| Assembler | Drill Bit | 1 Steel Beam + 1 Reinforced Plate | 1 | 8 s |
| Assembler | Insulation | 1 Resin + 1 Mycelium Fiber | 1 | 6 s |
| Assembler | Filter | 1 Resin + 3 Mycelium Fiber | 1 | 6 s |
| Assembler | Biofuel | 4 Spore Dust + 1 Glowcap | 1 | 8 s |
| Assembler | Cobalt Drill Head | 2 Cobalt Ingot + 1 Drill Bit | 1 | 8 s |
| Assembler | Battery | 1 Charged Crystal + 2 Cobalt Ingot | 1 | 8 s |
| Assembler | Circuit | 2 Conductive Powder + 4 Copper Wire | 1 | 8 s |
| Assembler | Heat Shield | 4 Aggregate + 1 Steel Beam | 1 | 8 s |
| Washer | Wash Sapstone | 1 Sapstone | 1 Cobalt Ore | 2 s |
| Separator | Separate Sapstone | 1 Sapstone | 1 Cobalt Ore + 1 Resin (side) | 6 s |
| Crystal Cutter | Cut | 1 Chorus Crystal | 1 Cut Crystal | 4 s |
| Crusher | Crush crystal | 1 Chorus Crystal | 2 Crystal Grit | 4 s |
| Crusher | Crush charged | 1 Charged Crystal | 2 Conductive Powder | 8 s |
| Charger | Charge cut | 1 Cut Crystal | 1 Charged Crystal | 4 s |
| Charger | Charge grit | 2 Crystal Grit | 1 Conductive Powder | 2 s |
| Overcharger | Overcharge | 1 Charged Crystal | 1 Overcharged Crystal | 8 s |
| Stabilizer | Stabilize | 1 Overcharged Crystal + 1 Insulation | 1 Resonant Core | 8 s |
| Cooling Bath | Quench | 1 Emberite | 1 Aggregate | 2 s |
| Cooling Bath | Quench Slag | 2 Slag | 1 Aggregate | 4 s |
| Thermal Extractor | Extract | 1 Emberite | 1 Slag (side) + 220 kW | 4 s |
| Pressure Forge | Forge | 2 Emberite + 1 Steel Ingot | 1 Molten Ember Ingot | 8 s |
| Pressure Forge | Reheat | 1 Cooled Ember Ingot | 1 Molten Ember Ingot | 4 s |
| Precision Assembler | Ember Core | 1 Molten Ember Ingot + 2 Circuit | 1 Ember Core | 8 s |
| Precision Assembler | Battery | 1 Charged Crystal + 2 Cobalt Ingot | 1 Battery | 4 s |
| Precision Assembler | Circuit | 2 Conductive Powder + 4 Copper Wire | 1 Circuit | 4 s |
| Attuner | Attune | 2 Thrumstone | 1 Engine Glass | 8 s |
| Engine Node | Heartstone (the Waking Node) | Battery, Resonant Core, Battery, Resonant Core, in that order | 1 Heartstone | 8 s (2 s per item) |
| Engine Node | Heartstone (the other two) | Engine Glass, Resonant Core, Engine Glass, Resonant Core, in that order | 1 Heartstone | 8 s (2 s per item) |
| Spore Collector | Collect | (spores in the air) | 1 Spore Dust | 2 s at full density |
| Fungus Harvester | Harvest | (on a glowcap patch) | 1 Glowcap | 2 s |
| Miner | Mine | (on a deposit) | 1 ore | 2 s on normal, full coverage |
| Combustion Generator | Burn | 1 Coal / 1 Biofuel / 1 Resin | 80 / 120 / 60 kW | 4 s / 8 s / 4 s per item |

The times are a clean-ratio set: one normal Miner (30/min) feeds whole machines down every chain
(Miner : Smelter : Press 1 : 1 : 1; a gear Press and a wire Press : one Motor Assembler; one Sapstone
Miner : 3 Separators : 1 Cobalt Smelter; one poor Chorus vent (15/min) : a Cutter : a Charger :
2 Crushers, 30 powder a minute on the rich route; one Forge : one Precision Assembler; one Thrumstone
Miner : 2 Attuners (one awake node's pool) : one Engine Node).

Miner rate: 30/min on a **normal** deposit with all four footprint tiles on ore; rich ×2, poor ×0.5,
scaled by how many of the four tiles are ore. Emberite and Chorus Crystal come from **vents** that
fit exactly one Miner: the Emberite vents are normal (30/min), the Chorus vents poor (15/min).
Hazards multiply all of these (§5.10).

### 7.3 Buildings

| Id | Name | Size | Power | Cost | Unlocked |
|---|---|---|---|---|---|
| belt | Conveyor | 1×1 | 0 | 1 Iron Plate | start |
| splitter | Splitter | 1×1 | 0 | 2 Iron Plate, 1 Gear | start |
| crossing | Crossing | 1×1 | 0 | 2 Iron Plate | start |
| sorter | Sorter | 1×1 | 1 kW | 2 Iron Plate, 1 Gear, 2 Copper Wire | milestone 3 (Sorter license) |
| unloader | Unloader | 1×1 | 1 kW | 3 Iron Plate, 2 Gear | Shallows |
| crate | Storage Crate | 1×1 | 0 | 6 Iron Plate | Shallows (free) |
| chute | Company Chute | 1×1 | 0 | 4 Iron Plate, 2 Gear | Shallows (underground only) |
| express_belt | Express Belt | 1×1 | 0 | 1 Steel Beam, 1 Conductive Powder | license $2,500 (Crystal) |
| insulated_belt | Insulated Belt | 1×1 | 0 | 1 Iron Plate, 1 Insulation | Emberite assay |
| sequencer | Sequencer | 1×1 | 2 kW | 2 Circuit, 2 Steel Beam | Thrumstone assay |
| lamp | Lamp | 1×1 | 0 | 1 Iron Plate, 1 Copper Wire | Shallows |
| shield_wall | Shield Wall | 1×1 | 0 | 1 Steel Beam, 1 Cobalt Ingot | Chorus assay |
| foundation | Foundation | 1×1 floor | 0 | 2 Aggregate | Emberite assay |
| miner | Miner | 2×2 | 8 kW | 8 Iron Plate, 4 Gear | start |
| smelter | Smelter | 2×2 | 12 kW | 10 Iron Plate, 2 Gear | start |
| press | Press | 2×2 | 8 kW | 6 Iron Plate, 4 Gear | start |
| assembler | Assembler | 2×2 | 15 kW | 10 Iron Plate, 6 Gear, 8 Copper Wire | milestone 4 |
| foundry | Foundry | 2×2 | 18 kW | 12 Brick, 6 Iron Plate, 2 Motor | Shallows |
| generator | Combustion Generator | 2×2 | +80 / +120 / +60 kW | 10 Brick, 8 Iron Plate, 2 Motor | Shallows |
| washer | Washer | 2×2 | 10 kW | 8 Iron Plate, 6 Copper Wire, 2 Motor | Sapstone assay (must touch water) |
| separator | Separator | 2×2 | 20 kW | 6 Steel Beam, 3 Motor | Sapstone assay |
| harvester | Fungus Harvester | 2×2 | 4 kW | 6 Iron Plate, 4 Gear | Fungal Caverns |
| spore_collector | Spore Collector | 2×2 | 6 kW | 6 Iron Plate, 2 Filter | first Glowcap |
| spore_filter | Spore Filter | 2×2 | 10 kW | 4 Filter, 6 Iron Plate, 1 Motor | first Resin |
| cutter | Crystal Cutter | 2×2 | 10 kW | 4 Steel Beam, 2 Motor, 4 Cobalt Ingot | Chorus assay |
| crusher | Crusher | 2×2 | 12 kW | 6 Steel Beam, 6 Gear | Chorus assay |
| charger | Charger | 2×2 | 30 kW | 12 Copper Wire, 4 Cobalt Ingot, 4 Steel Beam | Chorus assay |
| overcharger | Overcharger | 2×2 | 45 kW | 2 Battery, 4 Circuit, 4 Steel Beam | first Charged Crystal |
| stabilizer | Stabilizer | 2×2 | 15 kW | 4 Insulation, 2 Circuit, 4 Steel Beam | first Charged Crystal |
| resonance_tap | Resonance Tap | 2×2 | +20 kW per interferer (up to 6) | 4 Circuit, 10 Copper Wire | first Charged Crystal |
| cooling_bath | Cooling Bath | 2×2 | 10 kW | 6 Steel Beam, 2 Insulation | Emberite assay |
| thermal_extractor | Thermal Extractor | 2×2 | +220 kW | 8 Steel Beam, 4 Aggregate, 2 Circuit | Emberite assay |
| pressure_forge | Pressure Forge | 2×2 | 40 kW | 2 Heat Shield, 8 Steel Beam, 4 Motor | Emberite assay (hot ground only) |
| precision_assembler | Precision Assembler | 2×2 | 50 kW | 6 Circuit, 2 Battery, 8 Steel Beam | Emberite assay (steady ground) |
| attuner | Attuner | 2×2 | 30 kW from the conduit pool | 2 Heat Shield, 6 Circuit, 2 Battery | Thrumstone assay (awake conduit) |
| assay_lab | Assay Lab | 3×3 | 10 kW | 12 Iron Plate, 10 Copper Wire, 10 Brick | Fungal Caverns |
| hq | HQ | 3×3 | — | fixed | Surface |
| depot | Depot | 3×3 | — | fixed | each new layer |
| terminal | Shipping Terminal | 3×3 | — | fixed | Surface |
| elevator | Freight Elevator station | 3×3 | — | fixed (upgrades) | each shaft |
| drill | The Drill | 5×5 | — | fixed | each bore site |
| engine_node | Engine Node | 3×3 | — | fixed | Alien Strata |
| heart | The Heart | 7×7 | — | fixed | Alien Strata |

---

## 8. Economy and pacing targets

| Moment | Target |
|---|---|
| Page load → machines moving on screen | under 3 s |
| First sale | under 3 s (the starter line opens full; the first sale lands at about 1 s) |
| First thing the player builds | under 60 s |
| Act I (Surface, D1 done) | 15–25 min |
| Act II | 20–30 min |
| Act III | 40–60 min |
| Act IV | 40–60 min |
| Act V | 40–60 min |
| Act VI + ending | 30–45 min |
| Whole game | about 3–5 hours (the act bands add up to 3:05–4:40) |

- A game-speed toggle (1×, 2×) lets players skip a little waiting; pacing targets are at 1×. There is
  no 3×: waiting must not beat building.
- Money should always feel slightly short in the first 20 minutes of each layer (digging and surveys)
  and comfortable by the end of it. Contracts are the catch-up valve. The Surface has no digging or
  surveys, so Act I's milestones pay only $725 in all: the required 100 kW line ($600) stays in
  reach by milestone 4, and the 160 kW line ($1,000) waits on what the Terminal earns. Late rewards
  are flattened (Act V's milestones pay about $6,000 before the breakthrough, Act VI's about
  $8,000), so money never buys out the finale.
- **Drill project sizing.** The **first chain** is one machine per recipe, fed by Miners at 30/min
  (15/min on the Crystal Depths' poor Chorus vents); its time is the busiest machine's. The
  **10-minute line** is whatever finishes the project in 10 minutes. From D3 on, every project takes
  the first chain 25–35 minutes and needs a 10-minute line of 24–45 machines. D1 and D2 are the two
  tutorials and are exempt from those bands: D1's first chain is about 9 minutes, D2's at most 22.
  From D2 on, every project asks for more machine-minutes of work than the one before.

| Project | First chain | Its bottleneck | 10-minute line | Machine-minutes |
|---|---|---|---|---|
| D1 | 8.7 min | Iron Ingot (Smelter and iron Miner) | 10 | 40 |
| D2 | 20.7 min | Iron Ingot (Smelter and iron Miner) | 19 | 113 |
| D3 | 26.0 min | Separator | 31 | 226 |
| D4 | 26.7 min | the circuit chain (Assembler, Crusher and the copper line) | 38 | 288 |
| D5 | 26.7 min | Emberite Miner | 42 | 293 |
| The Governor | 32.0 min | Attuner | 44 | 305 |

- `tests/pacing.test.ts` computes both reference lines for every project from the recipe data (the
  table above), and tuning changes must keep them inside these bands. Headless act bots
  (`tests/bot.ts` and the act scripts in `tests/play/`, run by `tests/act1.test.ts` to
  `act6.test.ts`) play the whole milestone path on the real map, with player actions only at real
  cost, and record times: Act I from a new game, Act II from Act I's real end, Acts III–VI from
  start states with stand-in supply for the acts before. Each act also gets a scenario playtest by
  the indie critic.
- **The bots against the bands** (seed 20261030, act time):

| Act | Band | Bot | Against the floor | What sets the bot's time |
|---|---|---|---|---|
| I | 15–25 min | 14:07 (starter line only 17:22, careless 16:00) | 6% under | the build order, with no reading or placing time; with Act I's $725 the 160 kW line waits until 12:05, so the Surface runs at 0.63 of its power for about 3.5 minutes |
| II | 20–30 min | 12:15 | 39% under | one Foundry: D2's 150 steel at 15 a minute is 10 minutes of it |
| III | 40–60 min | 23:03 | 42% under | Cobalt Drill Heads at 5 a minute (two Separators' cobalt, the stand-in's 5 Drill Bits a minute) |
| IV | 40–60 min | 30:50 | 23% under | about 4 minutes of setup, then D4's 26.7-minute first chain: one chorus vent, one circuit line, then wire |
| V | 40–60 min | 25:02 | 37% under | circuits: the act uses 168, and at the stand-in's 6 a minute the last arrives at 24:10 |
| VI + ending | 30–45 min | 23:17 | 22% under | Resonant Cores imported at 5 a minute; the building is done by 5:53 |

- **The bands stay until people play** (DECISIONS #100). A bot spends no time reading, placing by
  hand, misplacing or fixing; a player does, and Acts III–VI also run on stand-in supply that sets
  much of their length (Act IV chained from the Act III bot takes 35:38, against 30:50 from its
  start state). Act IV shows the gap: setup plus a 25–35-minute first chain reaches the 40-minute
  floor only with about 10 minutes of human overhead. Human playtests decide whether the bands or
  the project sizes move. The bots' six acts add up to about 2 h 09 min; the game's length (§0)
  follows the bands, not the bots, and the projects don't grow to meet a headline (DECISIONS #109).

---

## 9. UX and controls

**Screen layout:**
- **Top bar:** money and $/min (Terminal and Chute sales and contract pay; milestone rewards don't
  count), the current layer's short name in capitals (SURFACE, SHALLOWS, FUNGAL, CRYSTAL, MAGMA,
  ALIEN; its hover gives the full name and depth), its power meter (demand against what is
  available, with a tooltip), the **depot strip**, the overlay toggles, Company, Help, pause, game
  speed (1×/2×) and the menu.
- **Depot strip:** the current layer's depot at a glance: up to 6 goods with counts (the HQ's Iron
  Plate, Gear, Copper Wire and Brick; underground, the layer's requested goods), plus whatever the
  oldest planned ghost there lacks, in coral. A lime "+N" floats up when a count rises (where a panel
  sits under the bar, the count flashes instead). Goods that don't fit the room are dropped, never
  overlapped: well-stocked goods first, then goods below their request, what the plan lacks last.
- **Top left:** objective tracker (current milestone, steps with live counts, the drill project's
  goods and ETA, the hint).
- **Right edge: the Stack.** A narrow cross-section of the mountain: one band per layer, the
  current one highlighted, elevator cabs moving in their shafts, a warning light on any layer with a
  power deficit. Click a band to go to that layer. Under it, a badge for each shaft touching the
  current layer shows its tier and live rate down ("Mk1", "44/m", amber when the cab runs full). It
  is the game's map, minimap and status board.
- **Bottom: build bar.** Five tabs, Logistics, Production, Power, Utility and Strange (the machines
  each layer's own material brings, from the Washer to the Attuner), with one row of building
  buttons, at most 13 to a tab. Hover shows cost, power and a one-line description. Locked items say
  how to unlock them (the milestone, layer, assay or first product, or the Company window for a
  license); a building that comes with a layer not reached yet stays off the bar until then, and an
  empty tab says "Nothing here yet: deeper layers bring more." The bar's size comes from its widest
  tab, so switching tabs or layers moves no button. A line above the bar explains the current tool;
  Mags's radio and the inspector stop above it.
- **Inspector** (click a building): status, recipe picker, buffers, rates per minute, power,
  hazard effects, and actions (rotate, copy, remove, pause). A planned ghost shows what it waits
  for, Build next, Rush, and underground Request the missing goods. The panel sizes itself to its
  content and scrolls (wheel) when it would run past the build bar. A depot's inspector shows its
  stock four to a row and edits its requests (§5.6; the HQ's are "Keep for the Surface"). An elevator
  station shows the shaft's live traffic, its bay and arrivals (on a lower station only when some
  are waiting), any stall or held cargo in coral, requests held back because the depot below is full
  told apart from those with none spare above, and the upgrade with what each depot pays; a lower
  station has no actions. A station a belt pushes into at its front leads with that in coral (§5.5),
  and a belt of a head-on pair with "These belts face each other: turn one with R." A jammed
  machine names the stuck good. The Drill's and the Heart's show each need as delivered/needed with
  the extras sent to the depot, and why a belt is jammed; the Terminal's and a Chute's the running
  contract; an Engine Node's its sequence, ring and jams; a Sequencer's which side it takes next, by
  compass face. Pause appears only on machines, miners and collectors, and the Company Chute has no
  Rotate.
- **Mags's radio** (bottom left) and toasts (top center, over any window; each lasts 4.5 s and fades
  out over its last half second).
- **Windows:** Company (contracts, licenses, the Company Line); the **Field Manual** (Basics,
  Knowledge and Controls tabs; long tabs turn pages with Back and Next, and an assay opens Knowledge
  on its card's page); the menu (Resume, Save now, Settings, Field Manual, What's new, export and
  import a save file, Save and quit to title); Settings; What's new (`PATCHNOTES.md`). The title
  screen lists the three operations (save slots), Settings and What's new; while a window is open
  there, the slots and that row are hidden. Panels and windows take the mouse: nothing under them,
  the HUD and the build bar included, is hovered, clicked or zoomed, and while the menu, Settings or
  the save-failure dialog is open the world shows no ghosts or tooltips. In a game a window opens
  clear of the objectives column and the build bar when it fits; the Field Manual and What's new
  shrink to fit that room (to 150 UI px at least), so Back and Next never sit over the bar. A HUD
  panel still under a window steps aside until it closes, and the breakthrough card waits there
  too; the HUD and the inspector step aside while the ending plays, and toasts wait for it.

**Controls:**

| Input | Action |
|---|---|
| Left click | place / select / press |
| Left drag | place belts along an L path; drag a box to remove or excavate in those modes |
| Right click / right drag | cancel; remove buildings |
| Middle drag, WASD, arrows | pan (Shift: faster) |
| Wheel | zoom (whole steps: 1×–6×); over a request row: ±10; over a long inspector: scroll |
| R | rotate what you are placing, or the building under the cursor (over the inspector: the one it shows); a lower elevator station never turns |
| Q | copy the building under the cursor (type and facing) |
| X / Delete | remove mode |
| E | excavate mode |
| F | survey mode (underground) |
| P | pause or resume the selected machine |
| Shift-click a request's + or − | change it by 50 |
| [ / ] or PageUp / PageDown | layer up / down |
| 1–5 | build-bar tabs (5: Strange) |
| Space | pause |
| Tab | switch game speed (1×, 2×) |
| C | Company window |
| F1 or H | Field Manual |
| Ctrl+S | save now |
| Esc | cancel / close / menu; during the ending, skip to the card (so does a click) |

**Overlays:** Spores, Arcs (interference) and Heat, each on by default, with a top-bar toggle where it
matters: Spores on the Fungal Caverns or any layer with spores, Arcs once the Crystal Depths are
open, Heat on the Magma Shelf. Spores show as a pink dither by density; heat as hatching on hot
ground and dots on warm ground (grey under a Foundation); interference as arcs between interfering
machines, arcs into a Resonance Tap carrying a spark toward it, and the dotted rectangle of a pair a
Shield Wall blocks. The 2-tile ring of a hovered, selected or placed machine shows from the Crystal
Depths on. All of them draw above the darkness. The rest is in hover text and the inspector: power
is the top bar's meter, a conduit tile says whether it is dormant or awake, and a machine standing on
conduit says how much of its power the pool covers.

Belt direction needs no overlay: a conveyor's rungs bow into a blunt `>` (STYLE "Conveyor"), and
two belts facing each other show ≠. Hovering or selecting a building marks its port cells, and its
chute carries a 2 px arrow.

Later: a conduit overlay with the pool's load and power demand per machine (ROADMAP "Beyond 1.0",
"More overlays"), and a default-zoom setting.

**Saves:** autosave every 60 s, when the tab is hidden and when the page closes, to `localStorage`,
in three slots (operations), plus export and import as a file. Saves are versioned (version 3) and
migrated on load. Scenario sessions (`?scenario=`) never save, and cancelling an import keeps it
that way. A save that can't be loaded (a newer build's, or damaged) is never written over: the
title says why and offers to export it, and the slot's × erases it. When saving fails (storage full
or blocked) the game says so once per run of failures, and Save and quit asks first: Export save
file, Keep playing, or Quit without saving.

**Settings:** UI scale, effects volume, hum and music volume, screen shake on/off. The UI scale is
auto, the scale nearest 330 UI px tall but never under 640 UI px wide (max(1, min(4, round(H / 330),
floor(W / 640))): 2× at 1280×720 and 1600×900, 3× at 1920×1080 and 1920×1200, 4× at 2560×1440), or
1–4× up to what fits the window: a larger choice is capped at the auto scale, and Settings greys out
the scales that don't fit. The starting zoom follows the screen width. Status icons always differ in
shape as well as colour (STYLE "Code-drawn art, as built"), so they need no colorblind setting.

---

## 10. Audio

- **The hum:** a low procedural drone (Web Audio) that is quiet on the Surface and grows a little
  richer each layer, to a slow suspended chord at the Heart. At the ending it stays on the Heart's
  layer for the whole sequence, builds through the climb, and the suspension resolves into a full,
  warm A major chord as the Surface comes up.
- **Machines:** short synthesized loops per family, mixed by distance from the camera center (in the
  ending, what its camera shows), capped so a big factory doesn't turn into noise.
- **SFX** (a small sfxr-style synth of layered voices, each effect rendered once; no audio files):
  place, remove, rotate, sale, contract done, objective done, dig, survey ping, elevator bell, drill
  progress tick, breakthrough rumble, spore puff, interference crackle, crystal chime, magma hiss,
  conduit waking, and a conduit pulse with every ring a node wakes.
- Audio starts on the first click (browser rule) and pauses when the tab is hidden.

---

## 11. Technology

- **Stack:** TypeScript (`strict`), Vite, a single Canvas 2D, no engine. Vitest for the simulation,
  Playwright (installed Chrome) for screenshot sweeps, Web Audio for every sound (§10).
- **Rendering:** the world is drawn 1:1 into an offscreen canvas at game resolution, then scaled to the
  screen by a whole number (zoom). The camera is snapped to whole pixels. The UI is drawn by an
  immediate-mode canvas UI with a bitmap font at its own whole-number scale.
- **Simulation:** pure and deterministic (`src/sim/`, no DOM), fixed 60 ticks per second, all
  layers simulated every tick. Rendering reads the state and never changes it.
- **Data-driven:** items, recipes, buildings, layers, milestones, assays and contracts live in
  `src/data/`.
- **Art:** sprites are requested by name from an atlas (`public/art/atlas.png` + `.json`), the title
  art included; any name without art falls back to a code-drawn placeholder, so the game always runs.
- **Debug:** a backtick panel (money, unlock everything, fill the layer's depot, complete the drill
  project, reveal the layer, sim speed ×10) and `?scenario=<name>` start states for testing and
  screenshots.
- **Budgets:** 60 fps at 1920×1080 with 3,000 items on belts across all layers; save under 1 MB;
  first load under 3 MB.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Per-layer depots feel like a chore | supply requests for anything you have made that ride the elevators, served in turn, with a request list per layer and the missing goods requested from a ghost in one click; a starter crate on every layer and a running rig wherever coal sits by the shaft; planned ghosts that build when goods arrive; Rush; the Unloader; the depot strip in the top bar |
| The elevator binds and nobody can tell | each station shows its live traffic against the cab's rate, the Stack shows the rate down, and Mags names a cab running full of other requests |
| Too many systems for a browser player | one new rule per layer, each with an overlay, a knowledge card and a glossary line; the first act has none |
| Six layers is a lot of content | layers share one engine; each adds data plus one hazard module; every layer's rules are covered by tests, and each act gets a scenario playtest by the critic |
| Dark caves are hard to read | high ambient floor near built-up areas, lamps cheap, lit lips on rock edges, overlays always available |
| Belts with one item per tile cap throughput | express belts later; a Mk1 elevator (45/min) is half a conveyor, so the shaft binds first |
| Hot items skip the heat rule | containers cool them at once; the Precision Assembler needs steady ground 8 tiles from hot ground; D5 wants a hot delivery |
| Money buys its way past goods | Rush builds buildings only and refunds only depot goods; contracts never pay above 2.5× (1.5× through a Chute); late rewards are flattened |
| The Engine Node order rule confuses players | the Sequencer makes a clean A/B stream, a fair belt merge alternates too, a wrong item is pushed out without losing progress, the node's inspector says when its output or side chute is full, and the knowledge card shows both patterns |
