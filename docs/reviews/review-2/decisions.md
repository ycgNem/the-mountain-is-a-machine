# Review 2: owner decisions on the indie critic's findings

Source: `critic2_findings.json` (13 findings, C1-C13, each checked against the code by a verifier;
all 13 were confirmed real). Every finding is accepted; where the verifier corrected the proposed
fix, the correction wins. Line numbers are approximate; re-find them.

## C1 (blocker) Requests: any stable, cool item you have made
- A depot can request any item that is neither unstable (overcharged_crystal) nor hot
  (hot_ember_ingot) and that this save has seen (stats.produced, any depot's stock, or
  stats.delivered). Put the rule in the sim (one exported function, e.g. `requestableItems(g, layer)`)
  so the UI and tests share it; inspector.ts uses it instead of BUILD_GOODS.
- Add row: sorted by the item's home layer, deepest first; at most 2 rows of 7 with a "more" toggle;
  depotHeight() must match exactly.
- This amends DECISIONS #22 (and #6/#7): requests pull any good from the depot above; belts into a top
  station push cargo down without going through a depot. The cab's capacity is still the shared limit.
  Milestone 28's hint ("Ask the depot to keep them in stock") becomes true.

## C2 Round-robin requests, honest starvation warning
- The cab serves requests in turn, not biggest shortfall first. Deterministic order: candidates sorted
  by the ITEMS table order; the shaft remembers the last item served (`reqLast?: string`, saved; old
  saves default to none) and the next pick is the first candidate after it (wrapping) with need > 0
  and spare goods above.
- checkStarved: when the item is already requested and none arrived in the last minute while the cab
  ran full of other goods, say "The elevator is full of other requests (N <Item> queued): lower that
  request, upgrade the shaft, or Rush the plan." Fix the doubled article (`${LAYERS[li].name} depot`;
  layer names already start with "The"). Keep the HQ wording "out of <Item>" (tests assert it).

## C3 Show the cab
- Per-shaft rolling 60 s counters: down by requests, down by belt cargo, up (deterministic, in the
  sim; not saved, reset on load is fine).
- Elevator inspector: "Down 44/45 a min (requests 30, belts 14) · Up 3/45", amber at >= 90%. Height
  from ui.paraHeight (contentHeight() is a fixed 165 for elevators today). "Requested below" only on
  the top station; rename the other line "Arrived, waiting to come out: N". The Stack badge shows the
  live down rate.
- Depot request rows: "stock/target", and in coral "none spare above" when the depot above has no spare
  of it. A row may take a second line (depotHeight() updated). Shift-click changes by 50; the wheel over
  a row by 10.
- Underground planned ghosts get a "Request the missing goods" button that adds or raises those rows.
- No print-only pacing test.

## C4 Chorus Crystal: a real choice
- charge_grit 4 s -> 2 s (recipes.ts). The three Crystal Depths vents become poor (purity 0: 15 a
  minute each, 45 in all). pacing.test.ts uses 15/min for chorus_crystal.
- Per the verifier the arc is: the rich route is the opener (crystal is scarce), the cheap route saves
  machines later when crystal is slack (D5, Governor). Write it that way.
- Docs: PLAN §6 (Crystal Depths, "30/min, 90/min in all" -> 15 and 45), §7.2 (charge grit 2 s),
  DECISIONS #27 amendment, new entry.

## C5 The first minute
- No tick prewarm (it would add 1,800 ticks to every Game.create and shift every test). Instead
  setupSurface pre-fills the starter line: ore on the belts before the smelter, ingots on every other
  belt after it, ingots in the smelter's buffer, so the first sale lands within about 3 s. Re-record the
  Act I bot's times.
- A depot strip in the top bar for the current layer: up to 6 item icons with counts (HQ: plate, gear,
  wire, brick; underground: the layer's requested goods), plus anything the oldest planned ghost lacks
  in coral; a "+N" flash when a count rises. Fit it in the free room (about 240 UI px at 1280x720, less
  underground); drop items rather than overlap.
- Camera starts at (22, 19.25) tiles so both the Drill and the Terminal show at 1280x720.
- First step label "Click the Drill".

## C6 D2 is the second tutorial
- D2 needs { steel_beam: 100, motor: 30, drill_bit: 50 }. D2 is exempt from the 24-45 machine band like
  D1 (move it out of the whole it.each); add "D2 first chain at most 22 min"; machine-minutes still rise
  (113 < D3).
- Docs: progression.ts comment, pacing.test.ts header, PLAN §5.7 table and §8, DECISIONS #32 and #52
  amendments, new entry.

## C7 Elevator upgrades paid from both ends
- For each upgrade good: take it from the lower depot first, the rest from the upper depot. The button
  lists each good as "need (below + above)", greys out when the two together can't pay, and the tooltip
  says which depot pays what. Fix "the The Dig Site depot".
- Amends DECISIONS #18 (goods made deeper still go up by cab: that return trip stays a puzzle).

## C8 The Engine wakes ring by ring
- Each Heartstone a node makes wakes conduit out to its next ring. Ring 1 = the node's nearest conduit
  distance + 1 tile (so the first Heartstone always lights something); each later ring +3 tiles;
  5 rings in all, the last at least the old full radius. Remove the early return in onNodeHeartstone. A
  node counts as awake (pool, labels, all_nodes_awake) from its first ring. Each ring: the 'pulse' sound
  and a burst along the newly lit tiles (app side); Mags's line on the first ring only.
- Node inspector: in coral, "Output full: belt the Heartstones away" when 4 wait, and "Side chute
  full: belt the wrong items away (<compass> face)" when the side buffer is full.
- Milestone 28: a produce step, 5 Heartstones (counts from msBase), label short enough for the HUD
  (C13), e.g. "Wake the node: 5 Heartstones".
- Docs: PLAN §5.10, the glossary's "Dormant conduits", DECISIONS #30.

## C9 Lower stations can't rotate
- game.rotate refuses an elevator with end === 1 (covers the button and the R key); the inspector hides
  the actions row on lower stations. On load, lower stations are reset to face their depot (as
  createShaft places them).
- Top station inspector: warn in coral when up-cargo can't come out ("Up-cargo blocked: nothing takes
  it at the <compass> face").

## C10 The conduit pool is contested
- CONDUIT_KW_PER_NODE 150 -> 60; Attuner 20 kW -> 30 kW (each awake node runs exactly 2 Attuners).
  Check Mags's "kW of the mountain's own power" line still reads as a reward.
- Docs: PLAN §5.4, §5.10, glossary, §7.3 Attuner row, DECISIONS #30.

## C11 Per-layer default requests and a Surface floor
- Default requests move into layers.ts, one list per layer: Shallows plate 40, gear 20, wire 20,
  brick 20. Fungal plate 40, gear 20, wire 20, brick 30, steel beam 20, motor 10. Crystal wire 80,
  steel beam 30, cobalt ingot 20, plate 30, gear 20, motor 10. Magma circuit 20, steel beam 30,
  insulation 20, plate 30, motor 10, gear 20. Alien battery 10, resonant core 10, circuit 20, steel
  beam 30, plate 30, gear 20, heat shield 10.
- The HQ gets "Keep for the Surface" rows that only act as a floor the elevator won't take below:
  default plate 20, gear 10, wire 10 (smaller than proposed so early Act II isn't starved; the Act I bot
  ends with almost no gears). Set them in setupSurface. The HQ inspector needs a layer-0 case (no layer
  above: requestable(), the header tooltip and depotHeight() all index layer -1 today). Old saves keep
  no floor.

## C12 Contracts at the Company Chute
- A contract can be delivered at any Company Chute too. Track Chute deliveries on the contract
  (`chute` count, deserialize default 0) and pay round(pay * (terminal + 0.6 * chute) / count) on
  completion. Contract items don't also get the 60% per-item Chute sale; emit the contract event and
  toast like onSale.
- Text: buildings.ts Chute and Terminal blurbs, inspector chute text, windows.ts "Delivered to the
  Shipping Terminal" and the help line, PLAN §5.8 and the glossary, PATCHNOTES. New DECISIONS entry
  (reverses part of #37).

## C13 Text
- Lock text from MILESTONES.find(m => m.reward.license === val) (fallback: the Company-window text).
- "Express Belt: 180/min, twice a conveyor."
- Planned status "Planned: waiting for goods".
- Step labels: a test that measures every step label (generated ones included) with the UI font
  against the HUD's real room (export the room calculation from hud.ts); shorten generated labels and
  long ones until they fit (e.g. "Block interference with a Shield Wall" is 181 px).
- Income: s.income counts Terminal and Chute sales and contract pay, not milestone rewards.
- The placement tooltip is anchored above-right of the ghost's footprint (a positioned tooltip with the
  world-to-UI conversion), clamped below the top bar.
