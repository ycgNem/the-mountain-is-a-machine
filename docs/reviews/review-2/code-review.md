# Review 2: code review of the review-1 changes

A correctness review of the simulation, UI and save code written for plan review 1 and the Act I
bot fixes. Each finding was checked by a skeptic who tried to reproduce it. DECISIONS.md cites
findings as "code-2 <id>".

30 findings confirmed, 3 rejected.

## lower-station-rotate (elevator, high)

`src/sim/game.ts:536`

**Summary.** Game.rotate only refuses fixed buildings that are not elevators, so the R key (app.ts:765-768) and the inspector's Rotate button (inspector.ts:175-178) can turn the LOWER station away from its depot. That breaks #18/#22 ('lower station faces the depot', 'everything sent down lands in the lower depot'). Requested goods then either freeze the shaft for good or stream past the depot forever, and the request never fills.

**Scenario.** Reproduced with <session scratchpad>\review2\t2_rotate.ts and t7_rotate_r.ts. Setup: Game.create(3), D1 completed, HQ gear 500, Shallows requests {gear:60} (it has 24). (A) One R press over the lower station (g.rotate(id)) turns it to face south; its port (32,13) is empty. After 60 s the Shallows still has 24 gears and the HQ has lost 18. arr[1]=12 and the cab holds 6 at the bottom with loading=false for good. 2 coal put in the lower bay never go up. With the Shallows at 0/20 gears, after 5 min it is still 0. (B) Same rotation with a belt and a Company Chute at the new port: after 120 s the HQ is down 90 gears (500 to 410), the Shallows still has 24, and 89 gears were sold through the chute at 60%. requestNeed(1) is still {gear:36}, so the HQ keeps draining to 0. arr[1] items count as 'coming' (elevator.ts:43), but once they leave onto a belt nothing counts them, so the need never drops.

**Proposed fix.** In Game.rotate, return early for an elevator station with bld.end === 1 (only the top station may turn), and hide the Rotate button for it in inspector.ts:175. Alternatively, have pickRequested haul nothing when the lower station's outputPort is not on the depot.

**Check: real.** Confirmed with <session scratchpad>\review2\vf\f1_rotate.ts. The guard is now at src/sim/game.ts:537: a concurrent edit at 04:02 moved it down one line, and the code is unchanged. It lets either elevator station turn. app.ts:765-770 rotates the hovered building on R in every tool except build, and inspector.ts:175-178 shows Rotate on both stations. Before the press, the lower station has dir 1 and its port (34,11) is the depot. One g.rotate(id) with no dir argument, which is what the R key calls, makes it dir 2 with port (32,13) and nothing there. Setup: the Shallows requests 60 gears and holds 24. The unrotated baseline reaches 60 in 60 s. Rotated, the Shallows stays at 24 and the HQ goes from 500 to 482. arr[1] holds 12 and the cab holds 6 at the bottom with loading=false. Two coal put in bay[1] are still there 120 s later. Three more presses restore the facing and the jam clears. With a belt and a Company Chute at the new port: after 120 s the HQ has gone from 500 to 410 gears and 89 were sold. requestNeed stays at {gear:36}, and the HQ is at 0 after 12 minutes. This breaks the glossary line 'Down: everything sent down a shaft lands in the lower layer's depot' and #18/#22. requestNeed (elevator.ts:43) also assumes everything in arr[1] lands in the depot.

**Notes on the fix.** The guard (bld.end === 1 in Game.rotate, which also covers the explicit-dir rotate(id, dir) the bot uses) is right. So is showing Rotate only for end 0 at inspector.ts:175. The fix also has to repair saves: save.ts serializes buildings as they are, dir included, so a lower station turned in an existing save stays broken. On load, set every end===1 station back to dir 1 (the facing createShaft gives it, toward the depot at arrival.x+2), ideally with a SAVE_VERSION bump. Don't use the alternative (pickRequested hauls nothing when the port isn't on the depot). Belt cargo sent down would still miss the depot and either jam the shaft or flow off to wherever the port points.

## arrivals-head-of-line-freeze (elevator, medium)

`src/sim/logistics.ts:616`

**Summary.** Station arrivals only ever try the head item: pushFrom inserts buf[0] and nothing else. If that item can't leave, everything behind it stays stuck, including requested goods the depot would accept. This happens when the lower depot already holds 999 of that item, or when nothing stands at the top station's port. The cab then can't finish unloading: elevator.ts:87-95 keeps loading=false, so the departure check at line 104 never runs. Both directions and every request through that shaft stop for good, and requestNeed counts the frozen goods as 'coming'.

**Scenario.** <session scratchpad>\review2\t5_cap.ts. Setup: D1 done, HQ gear 500, Shallows depot holding 999 coal, Shallows requests gear 60 (has 24), 2 coal belted into the top station. After 90 s arr[1] = coal,coal,gear x10 and the cab sits at the bottom with 3 more gears (loading=false). It never leaves. The Shallows received 3 of the 36 gears, 16 more have left the HQ and are frozen in the shaft, and requestNeed(1)={gear:20} because the 13 stuck gears count as coming. Top-end variant (t7_rotate_r.ts): 20 coal belted into the lower station to go up, with nothing at the top station's port (32,13). arr[0] fills to 12, the cab stays at the top holding 6 coal, and the Shallows' gear request stops for good at 18 of 20.

**Proposed fix.** For elevator stations, have pushFrom try each queued arrival in order and send the first one the target accepts, not just buf[0], so a capped item can't block requested goods. Also exclude arrivals that can't be delivered from 'coming' in requestNeed and flag the stall, or let a cab that can't unload leave so the other direction keeps moving.

**Check: real.** The lower-station case is confirmed with <session scratchpad>\review2\vf\f2_arrivals.ts. logistics.ts:616 only tries buf[0]. The depot refuses an item at STOCK_CAP (logistics.ts:325). elevator.ts:87-95 never sets loading, so the departure check at line 104 never runs. Setup: the Shallows holds 999 coal, 2 coal are belted into the top station, and it requests 60 gears (has 24). After 90 s arr[1] = coal,coal,gear x10 and the cab holds 3 gears at the bottom with loading=false. The Shallows received 3 gears, the HQ lost 16, and need is {gear:20}. Nothing changes after another 600 s. Taking one coal out of the depot lets one coal in, and the next one blocks again. So gears the depot would accept never land, which breaks 'Down: everything sent down a shaft lands in the lower layer's depot'. The only sign is a coral arrivals count, with no reason given. The top-end variant is not a defect. Nothing at the top port, together with the rule 'Up: … in arrival order', is the same backpressure as a machine with no output belt. I reproduced it (arr[0]=12, cab holding 6 coal, gears stuck at 18 of 20), and the station inspector tells the player that arrivals come out of the front.

**Notes on the fix.** Reorder only at the lower station, whose target is the depot. At the top, sending something other than the head breaks 'in arrival order' whenever the port feeds a selective building. Even at the bottom, reordering only helps when a few capped items are mixed in. When the capped item keeps arriving, which is the usual way a depot reaches 999, arr[1] fills with it alone and the freeze comes back. Reproduced: a 30/min iron plate belt into a depot at 960 plates left arr[1] with 12 plates, the cab with 3, and bay[0] full (12) within 300 s. Even after the player removes that belt, the plates already in the bay and cab (up to 18 at Mk1) can be more than the 12 arrival slots hold. So also stop it upstream: when loading belt cargo at the top, leave in the bay any item whose lower-depot stock plus in-flight count has reached STOCK_CAP, so only that belt backs up. Name the stall on the station, e.g. 'Depot full: Coal'. Keep stuck arrivals counted as 'coming' in requestNeed: excluding them makes the HQ ship more goods that can't land either. Don't let a cab that can't unload leave.

## half-cab-ceil (elevator, low)

`src/sim/elevator.ts:99`

**Summary.** The requests-first share is capped at Math.ceil(cab / 2), so requests take 5 of 9 slots at Mk2 and 8 of 15 at Mk3 before belt cargo loads. The rules say 'up to half the cab' (DECISIONS #22, PLAN 5.15), and the reqN comment in types.ts:142 says 'at most half the cab'.

**Scenario.** <session scratchpad>\review2\t5_cap.ts. A saturated coal belt feeds the top bay, the Shallows requests 400 gear and the HQ has 999. Mk1 delivers 45 gear and 45 coal (50%). Mk2 delivers 100 gear and 80 coal (55.6% requests). Mk3 delivers 192 gear and 168 coal (53.3%). So belt cargo gets 40/min instead of 45 at Mk2, and 84 instead of 90 at Mk3.

**Proposed fix.** Use Math.floor(cab / 2), which gives 3, 4 and 7. Requests still fill any room left after the dwell.

**Check: real.** Confirmed with <session scratchpad>\review2\vf\f3_half.ts, with a saturated top bay and 400 gears requested. Every trip loads 3 gears + 3 coal at Mk1, 5 + 4 at Mk2 and 8 + 7 at Mk3, so requests take 50.0%, 55.6% and 53.3%. elevator.ts:99 caps the requests-first share at Math.ceil(cab/2). That is 5 of 9 and 8 of 15, more than 'up to half the cab' (glossary, PLAN 5.5, DECISIONS #22) and more than the 'at most half' comment at types.ts:142. It is off by one at Mk2 and Mk3: when requests are pending, belt cargo gets 40/min at Mk2 instead of the 50/min that floor allows. Low severity.

**Notes on the fix.** Math.floor(cab/2) gives 3, 4 and 7. Mk1 is unchanged, so neither request test in tests/sim.test.ts (both run at Mk1, and both pass now) needs editing. Requests still fill leftover room after the dwell (line 106). The finding's 'instead of 45/90' is off: with floor, belt cargo gets 5/9 and 8/15 of the cab, which is 50/min at Mk2 and 96/min at Mk3. If rounding up is intended, change the glossary, PLAN 5.5, #22 and types.ts:142 to say 'half, rounded up' instead.

## tooltip-half-cab (elevator, low)

`src/ui/inspector.ts:417`

**Summary.** The depot's 'Requests from above' tooltip says 'Requested goods take up to half of each cab'. The sim fills any room belt cargo leaves with more requests after the dwell (elevator.ts:106), so with no belt cargo, requests use the whole cab. The UI states a cap the sim doesn't have.

**Scenario.** The Shallows requests 400 gear, the HQ has 999, and nothing is belted into the top station. The cab carries 6 gears every trip: 44.4/min measured in review2\t6b_rate.ts, and tests/sim.test.ts 'requests alone keep the Mk1 cab full' expects 80-92 in 120 s. The tooltip tells the player requests are limited to 3 per Mk1 trip (22.5/min), which could lead them to build an Unloader-and-belt feed for throughput they already have.

**Proposed fix.** Reword it to match the rule, e.g. 'Requested goods load first (up to half of each cab), then belt cargo; any room left goes to more requests.'

**Check: real.** inspector.ts:417 ends with 'Requested goods take up to half of each cab.' With requests and no belt cargo, every trip in f3_half.ts carried a full cab of requested goods: 6, 9 and 15 per trip, or 84, 171 and 345 over 120 s at Mk1, Mk2 and Mk3. tests/sim.test.ts 'requests alone keep the Mk1 cab full: 45 items a minute' passes, so this is intended. The tooltip states a cap the sim doesn't have, against pillar 9 (rules made clear in tooltips). It is the only UI text that describes how the cab is split (the help window and Mags's lines don't mention it). Low severity.

**Notes on the fix.** The rewording is right, but it depends on what happens with half-cab-ceil. While elevator.ts:99 uses ceil, 'up to half' is still wrong at Mk2 and Mk3 (5 of 9, 8 of 15), so fix both together or word the tooltip to match whichever rounding is kept. Say 'first' explicitly so it reads as a priority, not a cap, e.g. 'Requested goods load first (up to half of each cab), then belt cargo; any room left goes to more requests.' Keep the 'never below its own requests' clause.

## crossing-never-planned (placement, high)

`src/sim/game.ts:346`

**Summary.** A Crossing can never be planned. canPlace refuses any unpaid swap (`short && replace.length`), even when the piece it would replace is only a ghost. Separately, a drag that empties the depot before it reaches its crossing drops that crossing without any message. Either way the dragged line gets built side-loading into the line it was meant to cross, so the two lines merge instead of crossing (#54, #15).

**Scenario.** Ghost case: Surface sandbox with an empty depot. Drag belts north along x=20 from y=45 to y=31 (all ghosts), then drag east along y=38 from x=12 to x=28. planDrag returns {type:'crossing'} at (20,38), but canPlace answers 'Not enough goods to swap this in' because the replaced piece is a ghost, so (20,38) stays a north-facing ghost belt. Then give the depot plates: everything builds, and gears fed into the east line all turn north (14 reached the north sink, 0 the east end). Working-line case: the HQ has 2 Iron Plates and the player drags 5 belts east across a working north belt at (20,38). The preview (App.computeGhosts, app.ts:636, checks every piece against the untouched stock) shows 'belt ok, belt ok, crossing ok, belt ok, belt ok'. The release (app.ts:732-743) does 'built, built, crossing REFUSED, planned, planned', so the new line side-loads into the working one. Reproduced with <session scratchpad>\review2\h2_drag.ts (part D) and <session scratchpad>\review2\h4_more.ts.

**Proposed fix.** Refuse an unpaid swap only when a replaced piece is working: `if (short && replace.some((id) => !this.s.buildings.get(id)!.planned))`. That lets a crossing be planned over a ghost. In the drag release, place the crossing pieces before the plain belts (or reserve their goods). Have computeGhosts subtract each piece's cost from a running copy of the stock, so the preview matches what the release will do.

**Check: real.** Confirmed both halves. (a) canPlace skips planned pieces in the refund loop (game.ts:333), then `short && replace.length` (game.ts:346) refuses any short swap, including one over a ghost. That goes against its own comment ('a ghost can't take a WORKING piece's place') and against #15 and #54. Re-ran part D of h2_drag.ts: the crossing is refused, (20,38) stays a north ghost belt, and once goods arrive the east line's gears all go north (14 north, 0 east). (b) computeGhosts (app.ts:636) checks every piece against the stock as it stands, and the release refuses the crossing silently, because only single-piece refusals toast (app.ts:747). h4_more.ts shows a preview of 'belt ok, belt ok, crossing ok, ...' and a release of 'built, built, crossing REFUSED, planned, planned'. I monkeypatched the proposed canPlace rule (<session scratchpad>\review2\v_fixes.ts). With it, the crossing is planned, gets built, and the lines cross (0 north, 13 east). The title overstates it: a single placement on an empty tile can be planned. It is drag-laid crossings that never can.

**Notes on the fix.** The canPlace change is correct (the monkeypatch confirms it) and keeps the #48 test passing. Placing crossings first only helps when the depot can pay for the crossing at release time. When it can't and the crossed line is working, #48 still refuses the crossing (as it should), and the dragged belts still end at the line and side-load into it. So the release must also report the refusal (a multi-piece refusal is currently silent, app.ts:747) or stop the drag short of that line. A running-stock preview needs a stock override on canPlace. It must mirror the same placement order and credit refunds only for working, non-rushed replaced pieces (see swap-over-rushed-negative-stock).

## drag-turn-cuts-line (placement, medium)

`src/sim/game.ts:601`

**Summary.** planDrag checks 'same axis, so re-lay it' (line 601) before the start/end/turn rule (lines 602-603). A drag that starts or turns on a line's turning belt that faces the other way therefore re-lays that belt in reverse and cuts the working line. #54 says it should leave that belt alone.

**Scenario.** A working line flows west along y=30 from x=26 to x=21, turns north at (20,30) (a belt facing north, fed from the east) and runs north to a crate at (20,25). The player drags from (14,30) to (20,34): east along y=30, turning south at (20,30). planDrag returns {type:'belt', dir:2, skip:false} for the corner tile, so the turning belt is re-laid facing south. The crate, which had a steady flow before, gets 0 gears in the 10-20 s after the drag. Drags that start on (20,30) and go south, such as (20,30)->(20,31), do the same. A brute force of 4,278 straight and L drags that touch this line on exactly one tile found that these start/corner drags are the only ones that cut it. Crossings in straight runs are fine. Reproduced with <session scratchpad>\review2\h2_drag.ts (part A) and <session scratchpad>\review2\h5_drag_fuzz.ts.

**Proposed fix.** Apply the start/end/corner check before the same-axis re-lay. At i === 0, at i === pieces.length - 1 and at a corner, skip an existing belt whose dir differs from p.dir unless the drag really runs along that line (the neighbouring drag tile is also a belt of it on the same axis). This keeps the existing 'along the line re-lays' test passing.

**Check: real.** planDrag returns a re-lay for any belt on the same axis (game.ts:601) before it reaches the start/end/corner rule (602-603). That contradicts #54 and the method's own doc comment ('where the drag starts, ends or turns on a belt it leaves that belt alone'). Re-ran scenario A: the corner piece comes back as belt dir2 and the crate gets 0 gears afterwards. Re-ran the h5_drag_fuzz.ts brute force: of 4,278 drags, the only cuts are corner on (20,30) (5 drags) and start on (20,30) (8 drags). I monkeypatched the proposed order (v_fixes.ts): both cases become skip, the sim.test.ts:181 assertions still pass, and dragging end to end along a line still re-lays all 9 tiles.

**Notes on the fix.** Pick the neighbour carefully. At the start and at a corner, check pieces[i+1]: the corner piece is the first tile of the second leg, and pieces[i-1] is perpendicular to it. At the end, check pieces[i-1]. Done that way, the unit test and end-to-end reversal both pass (checked). Also add a unit test for the corner and start cases. Update #54 and the planDrag comment to state the 'running along a line re-lays it' exception, which today exists only in the test.

## foundation-fake-planned (placement, medium)

`src/sim/game.ts:386`

**Summary.** canPlace reports a Foundation the depot can't pay for as ok and planned, but place() returns null without building or planning anything. The drag preview, the hover tooltip and the release toast all tell the player it is planned, and it never gets built.

**Scenario.** Depot has 0 Aggregate. canPlace('foundation', 0, 10, 30, 0) returns {ok:true, planned:true, missing:{aggregate:2}}. place() returns null, and ghostQueue(0) is empty. After 50 Aggregate arrive and 2 s pass, L.foundation at that cell is still 0. Meanwhile computeGhosts draws the tiles in the planned colour, hud.ts:516 shows 'Planned: depot needs 2 more Aggregate', and app.ts:742/748 toasts 'N planned: built when the depot has the goods'. A machine the player then puts on those tiles stands on bare hot ground at x0.5. Reproduced with <session scratchpad>\review2\h3_misc.ts (H3).

**Proposed fix.** In canPlace, when a foundation is short, return {ok:false, reason:'Needs 2 Aggregate in the depot'}, since foundations can't be ghosts. Otherwise, implement planned foundations properly.

**Check: real.** canPlace has no foundation-specific cost path, so a short foundation returns {ok:true, planned:true} (game.ts:347). place() then returns null at game.ts:386 and records nothing. Re-ran h3_misc.ts (H3): no ghost exists, and the foundation is still 0 after 50 Aggregate arrive. The UI says otherwise. The hover tooltip reads 'Planned: depot needs 2 more Aggregate' (hud.ts:516), the drag preview draws the tile as planned, and the release counts it and toasts 'N planned: built when the depot has the goods' (app.ts:742, 748).

**Notes on the fix.** Returning ok:false is right. A rect drag, though, only toasts a refusal when pieces.length === 1 (app.ts:747), so a partly affordable foundation drag would silently lay only some tiles. Toast the reason whenever any piece is refused. Build the message from BUILDINGS.foundation.cost and the current stock, not a hard-coded '2 Aggregate'. Keep the place() guard.

## swap-over-rushed-negative-stock (placement, medium)

`src/sim/game.ts:334`

**Summary.** The swap check counts the replaced piece's full cost as a refund, but removeBuilding never refunds that piece's rushed goods (line 506). A swap onto a rushed 1x1 piece therefore passes on credit, pay() at line 422 drives the depot negative, and the 'swaps must be paid' rule (#48) is bypassed.

**Scenario.** HQ stock {}. Place a splitter (it becomes a ghost) and rush it, which sets rushed {iron_plate:2, gear:1}. Drop a belt on it: canPlace returns {ok:true, planned:false}, place succeeds, and HQ iron_plate is now -1. A rushed belt re-laid facing another direction does the same (stock -1). The negative stock shows in the depot and inflates every later Rush quote, because rushQuote charges v - stock. Reproduced with <session scratchpad>\review2\h1_swap_rushed.ts.

**Proposed fix.** In canPlace's refund loop, add `v - (o.rushed?.[k] ?? 0)` instead of v, matching removeBuilding, so the swap is refused with 'Not enough goods to swap this in'.

**Check: real.** canPlace's refund loop (game.ts:334) credits the replaced piece's full cost, but removeBuilding (game.ts:506) refunds the cost minus rushed goods. Re-ran h1_swap_rushed.ts: a rushed splitter swapped for a belt leaves iron_plate at -1, and a rushed belt re-laid in another direction does the same. The swap goes through without the goods on hand, which breaks the Paying and Swaps rules (#48). One correction: the depot list hides non-positive stock (inspector.ts:394), so the -1 shows in the build-bar cost tooltip (hud.ts:384) and in a ghost's needs list (inspector.ts:81), not in the depot. The next delivery repays the debt and no goods are created, so the impact is low but real.

**Notes on the fix.** The proposed `v - (o.rushed?.[k] ?? 0)` is correct and sufficient. Use the same refund rule in any running-stock drag preview. After the fix, re-laying a rushed belt with an empty depot is refused, which is correct (R still rotates it for free).

## pause-non-machines (placement, low)

`src/sim/game.ts:623`

**Summary.** setPaused (reached through the P key on any selection, app.ts:787) pauses any building, but only machines, miners and collectors honour it. A paused Combustion Generator, Spore Filter, Assay Lab or Resonance Tap keeps running and keeps drawing or supplying power, while the world shows the Paused badge and stops its work animation.

**Scenario.** A generator holding 4 coal, under load: select it, press P (setPaused(gen, true)). Two seconds later it has burned coal (4 -> 3), its status is 'ok' and genUsed is 48 kW. Yet world.ts:1046 draws the 'paused' badge (b.paused ? 'paused' : b.status) and world.ts:440/768 stop its shudder and smoke. A paused Spore Filter stays active, and the power solve still counts its 10 kW (power.ts:69-71). Reproduced with <session scratchpad>\review2\h3_misc.ts (H8).

**Proposed fix.** Make setPaused return without doing anything unless the building's kind is machine, miner or collector (the same set the inspector's Pause button uses). Alternatively, honour paused in tickGenerator, the spore filter, lab and tap code, and the power solve.

**Check: real.** setPaused (game.ts:623) accepts any building, and the P key (app.ts:789) calls it for whatever is selected. Only tickMachine and tickMiner honour the flag. tickGenerator, the spore-filter and lab cases, and power.ts (generator capacity, spore_filter/lab demand at 69-71, tap supply at 43-44) all ignore it. Re-ran h3_misc.ts (H8): a paused generator burned coal 4 -> 3 with genUsed 48 kW, and a paused filter still draws 10 kW. Meanwhile world.ts:1046 draws the Paused badge and world.ts:440/768 stop the shudder and smoke. The UI shows it paused while it keeps running.

**Notes on the fix.** If setPaused simply returns for other kinds, a generator, filter or tap already flagged paused (in an existing save, or by P before the fix) can never be resumed, and its badge keeps lying. Refuse only pause=true for those kinds and always allow unpausing. Also make world.ts:1046 show 'paused' only for machines, miners and collectors, or clear the stray flag on load.

## survey-off-map (placement, low)

`src/sim/game.ts:794`

**Summary.** survey() charges the layer's survey cost before checking that the click is on the map. A survey click in the empty space beside the map costs $300-$1,000 and surveys nothing.

**Scenario.** Shallows open, $1,000 in hand: survey(1, -40, -40) returns true, money drops to 700, and 0 cells are surveyed. updateCamera clamps only the camera centre (app.ts:551), so up to half a screen of off-map cells is clickable, and app.ts:671 passes the raw cell to survey(). At default zoom, cells beyond 12 tiles off the edge survey nothing at all. Reproduced with <session scratchpad>\review2\h3_misc.ts (H6).

**Proposed fix.** Return false without charging unless 0 <= x < L.w and 0 <= y < L.h. Better still, charge only if at least one in-range cell is not yet surveyed.

**Check: real.** survey() charges at game.ts:794, before the cell loop (797-800), which silently skips cells off the map. The click passes the raw cursor cell (app.ts:671), and the camera clamps only its centre (app.ts:550-551). At default zoom 3 that leaves about 20 off-map tiles clickable beside the map, and 60 at zoom 1. The canvas background is C.ink #090a14, the same tint as unrevealed darkness, so underground the map edge can't be seen. Re-ran h3_misc.ts (H6): survey(1,-40,-40) returns true, money goes 1000 -> 700, 0 cells are surveyed, and the app toasts 'Survey: $300' as if it worked.

**Notes on the fix.** A strict in-bounds check would also refuse clicks just off the edge that still survey part of the map within the radius of 12. Charge only when at least one on-map, not-yet-surveyed cell is in the circle. When survey() returns false, app.ts:672 toasts 'Survey costs $X', which gives the wrong reason. Return a reason, or check before calling, so the toast says there is nothing new to survey.

## remove-mid-craft-loses-inputs (placement, low)

`src/sim/game.ts:509`

**Summary.** Removing a machine in the middle of a craft destroys the inputs it consumed when the craft started (production.ts:101). This contradicts the in-game help (windows.ts:252: 'Nothing you build is ever destroyed. Remove refunds everything except rushed goods.').

**Scenario.** A Smelter set to iron_ingot with 2 Iron Ore buffered starts a craft. Remove it at 0.5 of its 4 s: the depot gets the building's cost back but 0 ore and 0 ingot, so 2 ore disappear. A Precision Assembler in the middle of an Ember Core loses a Molten Ember Ingot and 2 Circuits the same way. Reproduced with <session scratchpad>\review2\h3_misc.ts (H4).

**Proposed fix.** In removeBuilding (and in setRecipe), when bld.active and bld.recipe are set and the craft isn't finished, refund RECIPES[bld.recipe].inputs, leaving out unstable items.

**Check: real.** Inputs are consumed when a craft starts (production.ts:101). removeBuilding (game.ts:509-519) refunds only inBuf, outBuf and sideBuf. Re-ran h3_misc.ts (H4): a smelter removed mid-craft gives back 0 ore and 0 ingot, so 2 ore are lost. setRecipe (game.ts:543-560) loses them the same way. The UI promises otherwise: windows.ts:252 'Remove refunds everything except rushed goods', hud.ts:427 'Everything is refunded to the depot', inspector 'Remove (full refund)'. Low impact (one craft's inputs), but it is a broken promise.

**Notes on the fix.** A craft only starts when there is output room, and the output buffers can only drain during a craft. So `active` already means an unfinished craft, and the condition is just bld.active && bld.recipe. Refund hot inputs (the Ember Core recipe's hot_ember_ingot) as cold_ember_ingot and drop unstable items. Decide whether powerOut recipes (Thermal Extractor) should refund Emberite after part of a burn. Apply the same refund in setRecipe.

## remove-refunds-hot-ingot (placement, low)

`src/sim/game.ts:512`

**Summary.** removeBuilding refunds contents under their raw item id. A Molten Ember Ingot on a removed belt, or in a forge or assembler buffer, enters the depot still hot, although every container cools items at once (#25, glossary 'Containers cool', and the item's own blurb). The replace path (line 411) does cool it.

**Scenario.** A belt carrying {hot_ember_ingot, heat 90} is removed: the depot gets stock.hot_ember_ingot = 1, a $0 'Molten Ember Ingot'. The same belt replaced by a crossing gives stock.cold_ember_ingot = 1 instead. Reproduced with <session scratchpad>\review2\h3_misc.ts (H5).

**Proposed fix.** In removeBuilding's add() (and in setRecipe's refund), map any item with ITEMS[id].hot to 'cold_ember_ingot', the same way place() already does at line 411.

**Check: real.** removeBuilding's add() (game.ts:511-517) and setRecipe (549-551) refund raw item ids, so a Molten Ember Ingot enters stock as hot_ember_ingot. Re-ran h3_misc.ts (H5): removing the belt gives stock.hot 1, while the replace path (game.ts:411) cools the same item. That breaks the glossary's 'Containers cool' rule, which covers any hot item entering a depot. The impact is small. An Unloader emits it at heat 0 and it turns Cooled on its first belt tick (checked in v_fixes.ts), so nothing can be exploited. The visible effect is a $0 'Molten Ember Ingot' in the depot list. Low priority.

**Notes on the fix.** The mapping is right. Put it in one helper used by removeBuilding, setRecipe and place() (line 411), so the three refund paths can't drift apart again. The mid-craft refund in remove-mid-craft-loses-inputs needs it too.

## F1 (logistics, high)

`src/sim/logistics.ts:177`

**Summary.** feederWaiting counts any machine, miner, elevator station or Engine Node as a waiting feeder for every belt tile in front of it, even when that tile is not its output port. fairTurn then refuses the belt's real inputs whenever the building holds output, so a line that leaves the port along the building's own front face deadlocks permanently. A line that only passes in front of a blocked machine stops too.

**Scenario.** (a) A Press facing N at (10,30) has its port at (11,29). A belt leaves the port going west (11,29)->(10,29)->... With Copper Wire (2 per craft), the first wire reaches prog 1 on (11,29), but (10,29) refuses it because the press is 'waiting' with the second wire. That wire can only leave through the stuck port belt. Result: produced=6, status 'blocked', the belt ahead stays empty forever. The same layout running east: the belt fills normally. (b) Iron Plate in the west layout: after a downstream backup clears, 0 plates move in the next 60 s (east control: 14). (c) The top elevator station faces S, port (32,13). With the up-line turning east along the station face, 11 of 12 arrivals are stuck forever; a line going straight south delivers all 12. (d) A gear line passes in front of a press at (10,29), not at its port, while the press's port belt is a dead end: 7 gears in 120 s vs 164 when the press output flows. Repro scripts: <session scratchpad>\review2\phantom.ts, phantom2.ts, elevphantom.ts and passing.ts (same folder).

**Proposed fix.** For non-slot feeders, return true only when t is the cell the building actually pushes into: cand === f.dir, (t.x,t.y) equals outputPort(f), and outBuf (or sh.arr[f.end] for elevators) is non-empty. Add the side-port case from F2.

**Check: real.** Reproduced exactly. phantom.ts: with the belt running west along the press face, Copper Wire makes 6 and then blocks, and the next belt stays empty. phantom2.ts: after a backup clears, 0 plates move in 60 s (14 in the east control). elevphantom.ts: 11 of 12 arrivals stay stuck along the station face; going straight south delivers 12 of 12. passing.ts: 7 gears vs 164. Cause: feederWaiting (logistics.ts:164-183) looks up the feeder with g.at, which returns a multi-tile building for any of its footprint tiles. It then checks only f.dir === cand and a non-empty outBuf/arr. But pushOutputs (logistics.ts:597-607) only ever pushes into outputPort(b). So every belt tile on the front face whose input list includes f.dir reserves a turn for an item that can never arrive. The port belt then waits on that turn forever (rr only changes on an accepted insert). This breaks PLAN 5.15's one output port and 5.2's fair merges, and deadlocks the most natural output layout: running the belt along the machine or top-station face. High severity is justified.

**Notes on the fix.** The proposed check is right. I applied it, together with F2's side branch, to a scratch copy of src. All four repros recover (14 wires, 14 plates after the backup, 12/12 arrivals, 164 gears), and the full suite (79 tests) passes. When implementing: the early `if (f.dir !== cand) return false` (line 177) has to go, or F2's side branch (cand = leftOf(f.dir)) can never run. Do the outputPort(f) position check inside the cand === f.dir branch for elevators as well as machines. Add regression tests for: a 2-output recipe with the belt run along the press face, the top station's output turning along its face, and a line passing a backed-up machine's front.

## F2 (logistics, medium)

`src/sim/logistics.ts:182`

**Summary.** feederWaiting never counts a machine's side output (sideBuf leaving sidePort with travel leftOf(dir)). A byproduct side-loaded onto a busy belt never gets its fair turn, so the side buffer fills and outputRoom stops the whole machine.

**Scenario.** A Separator facing N at (10,30) has its side port at (9,30), which side-loads resin onto a north-running belt carrying a steady gear stream (sink emptied every tick). Result: 5 crafts, then status 'blocked' with sideBuf=4 for the rest of 120 s. With an empty belt it makes 19. A Press whose main port side-loads onto the same busy belt gets fair turns (29 plates either way). This affects Separator resin, Thermal Extractor slag (its only output, so it stops making power) and Engine Node rejects. Repro: <session scratchpad>\review2\sidestarve.ts

**Proposed fix.** In feederWaiting, also return true when cand === leftOf(f.dir), (t.x,t.y) equals sidePort(f) and f.sideBuf.length > 0. Combine this with the port-position check from F1.

**Check: real.** Reproduced with sidestarve.ts. Separator resin side-loaded onto a packed gear belt: 5 crafts, then 'blocked' with sideBuf=4 (19 crafts onto an empty belt). A press whose main port side-loads onto the same belt makes 29 plates either way. Cause: feederWaiting returns false whenever f.dir !== cand (logistics.ts:177), so a side output (travel leftOf(f.dir), pushed via sidePort at logistics.ts:607) never claims a turn. tickLogistics moves slots before movers push, so on a packed belt the tile is always refilled from behind first. This breaks the fair-merge rule (PLAN 5.2, 5.15 'the back and side inputs take turns'). outputRoom then stops the whole machine. For the Thermal Extractor (recipes.ts:78: slag is its only output) that also means no power.

**Notes on the fix.** Correct, and verified on the scratch copy: resin reaches 19 on the busy belt, the press is unchanged, and all tests pass. The side check must come before the existing early `f.dir !== cand` return, or replace it; otherwise it is dead code. Elevators have no side output, so no elevator branch is needed. Engine Node rejects (sideBuf) are covered automatically.

## F3 (logistics, medium)

`src/sim/env.ts:152`

**Summary.** shieldBetween counts a planned, unbuilt and unpaid Shield Wall ghost. The ghost blocks interference, and its shield_blocking event completes milestone 20 'Quiet Please' ($1,500) without a wall ever being built.

**Scenario.** A Cutter at (6,30) sits next to an active Press at (10,30): cutter links=1, envMul=0.75. With 0 Steel Beam in the depot, place a Shield Wall at (9,30); it becomes a planned ghost (planned=true). After refreshEnv: cutter links=0, envMul=1, stats.events.shield_blocking=1. The ghost keeps shielding for as long as the depot can't pay for it. Repro: <session scratchpad>\review2\ghostwall.ts

**Proposed fix.** Change the check to `if (o && !o.planned && o.type === 'shield_wall') return true;`.

**Check: real.** Reproduced with ghostwall.ts. A planned=true Shield Wall drops the cutter's links from 1 to 0 and envMul from 0.75 to 1, and sets stats.events.shield_blocking=1. Milestone 20's only step is that event (progression.ts:121, $1,500). place() writes planned ghosts into occ (game.ts:415), and shieldBetween (env.ts:151-152) never checks o.planned. So an unpaid ghost shields for free, and predictPlacement's speed prediction counts it too. Against PLAN 5.1 and 5.15 a ghost is not built (build steps explicitly exclude ghosts). The Crystal Depths starter crate does hold 16 Cobalt Ingot and 30 Steel Beam, so the first walls are usually paid. But any wall laid with the depot short becomes a working ghost, for example a dragged line of walls (shield_wall is a LINE_TYPE, app.ts:61) beyond that stock.

**Notes on the fix.** The one-line fix is right and sufficient. shieldBetween is the only Shield Wall check, and both predictPlacement and the overlay's shielded rectangles go through interferersFor. Verified on the scratch copy: the ghost no longer blocks (links=1, envMul 0.75, no event), and all 79 tests pass. No save migration is needed.

## F4 (logistics, medium)

`src/sim/logistics.ts:380`

**Summary.** An Engine Node refuses any item outside its own pair instead of pushing it out of its side, and noteJam (line 489) runs only for 'machine' targets, so nothing reports the stall. The glossary ('Wrong item: pushed out of the node's side'), §5.12, the Engine Glass card and the node inspector ('A wrong item comes out of the left side') all promise ejection.

**Scenario.** A belt carries Engine Glass into the Waking Node (recipe 'waking'). After 30 s the glass sits at prog 1.00 on the last belt: sideBuf=0, node_reject=0, node.status='idle', jam none. The feed line is stopped for good with no message. The same happens with a Battery fed to either of the other two nodes, or any stray item on a mixed belt. tests/layers.test.ts:183-185 codifies the refusal, so the code contradicts the in-game text and the glossary. Repro: <session scratchpad>\review2\node.ts

**Proposed fix.** Treat every item that is not seq[seqPos] as a wrong item: push it into sideBuf when there is room and keep seqPos. If refusal is the intent instead, record a jam on the node, show it, and correct the inspector text, the card and the glossary.

**Check: real.** Reproduced with node.ts. Engine Glass belted into the Waking Node sits at prog 1.00 for 30 s with sideBuf=0, node_reject=0, status 'idle' and no jam. logistics.ts:380 refuses anything outside the pair. moveSlot calls noteJam only for 'machine' targets (logistics.ts:489), and tickProduction's engine_node branch (production.ts:37-41) never sets a status. So the stall is silent. Several texts promise ejection and none excludes foreign items: the glossary ('Wrong item: pushed out of the node's side'), PLAN 5.12 ('pushed out, not eaten'), the Engine Glass card (progression.ts:41) and the node inspector (inspector.ts:566, 'A wrong item comes out of the left side'). By 5.15's own rule, a disagreement between code and glossary is a bug. Either way the UI lies, and the line stops with no Jammed message, which is what DECISIONS 54 set out to prevent. Engine Glass at the Waking Node is a natural mistake, because the other two nodes take it. tests/layers.test.ts:183-185 and :198 do codify the refusal.

**Notes on the fix.** Option 1 (eject everything) must also update tests/layers.test.ts:183-185 and :198. Line 382 refuses every item once sideBuf holds 4, including correct ones, so a node with no belt on its side port recreates the same silent stall after 4 strays. That case still needs a node status or jam. Also decide whether a Molten ingot ejected through sideBuf keeps its heat. Option 2 (refuse): noteJam has to cover kind 'engine_node' (logistics.ts:489), and the engine_node branch in tickProduction has to set status 'jammed' (it never sets one today), or the HUD has nothing to show. The inspector text, the card, the glossary and 5.12 also need changing.

## F5 (logistics, low)

`src/sim/logistics.ts:340`

**Summary.** The Company Chute refuses items that enter through its 'front' face. The chute has no facing cue: it uses one sprite, is not in world.ts CHUTE_KINDS, and its placement ghost gets no facing mark. No jam is reported either, so a chute placed facing the incoming belt silently stops the line. The rule says it sells whatever is belted into it.

**Scenario.** On the Shallows, a belt runs east into a chute at (33,14). With the chute facing N, E or S, the gear sells (+$2.4). With it facing W, the gear stays on the last belt forever and sold=0. Repro: <session scratchpad>\review2\chute.ts

**Proposed fix.** Drop `travel === opp(t.dir)` for the chute, since a pure sink has no output face. Otherwise, draw its facing and report the refusal.

**Check: real.** Reproduced with chute.ts. With the chute facing W and the belt running east into it, nothing sells and the gear stays on the last belt; facing N, E or S each sells $2.4. logistics.ts:340 refuses travel === opp(t.dir), but nothing shows the facing. The chute is not in CHUTE_KINDS (world.ts:59) and is not a slot kind, so it gets neither drawSlotMarks (world.ts:446) nor a ghost facing mark (world.ts:1136-1153), and it uses one sprite. Rotating it from the inspector changes nothing visible, and no jam is recorded. The blurb and inspector (buildings.ts:83, inspector.ts:151) say it sells anything belted in. Mitigation: after a belt drag, app.dir becomes the drag's last facing (app.ts:746), so a chute placed right after dragging its feed belt faces correctly. The failure happens when the chute is placed or Q-copied first and then fed from the side it faces. Low severity, but real.

**Notes on the fix.** Dropping `travel === opp(t.dir)` for the chute is enough, because nothing else in the sim depends on its facing (it has no output). Verified on the scratch copy: all four facings sell and all 79 tests pass, including sim.test.ts:245-248. The chute's Rotate button then does nothing and could be hidden.

## F7 (logistics, low)

`src/sim/production.ts:82`

**Summary.** When a needsHot or needsConduit machine turns 'misplaced' mid-craft, tickMachine sets active=false and drops the craft without refunding the inputs it consumed at craft start, so those items vanish. canPlace allows Foundations under a standing building (game.ts:303), and remove() on such a tile removes the building, not the Foundation (game.ts:483). setRecipe and removal mid-craft lose the consumed inputs the same way.

**Scenario.** A Pressure Forge on hot ground gets 2 Emberite + 1 Steel Ingot; after 1 s it is active with inBuf empty. Lay 4 Foundations under it. At the next refresh: status 'misplaced', active=false, inBuf {}, outBuf []. The 3 items are gone, and removing a Foundation removes the forge instead. Repro: <session scratchpad>\review2\forgefound.ts

**Proposed fix.** While misplaced, keep the craft and simply don't advance it (as with no power), or add rec.inputs back to inBuf when abandoning it. Refund in-progress inputs the same way in setRecipe and removeBuilding.

**Check: real.** Reproduced. forgefound.ts: the forge runs mid-craft with inBuf {0,0}. After four Foundations it is 'misplaced' with active=false and inBuf/outBuf empty, so the 2 Emberite + 1 Steel Ingot are gone. production.ts:81-86 clears active, and the next craft restarts at craft=0 with fresh inputs. The no-power path keeps the craft. My script review2\mine\f7f8.ts: setRecipe on an Assembler mid-craft refunds 0 of the 3 consumed items, and removing a Press mid-craft refunds 0 of 1. removeBuilding and setRecipe (game.ts:510-519, 548-553) refund inBuf, outBuf and sideBuf but never the running craft. That contradicts PLAN 5.12 (problems show up as stopped machines, not vanished goods) and the code's own 'Contents go back to the depot'. Impact is low: at most one craft's inputs per event. remove() hitting the building before the Foundation is ordinary layering, not a separate bug.

**Notes on the fix.** Option 1 (keep the craft while misplaced) is not 'like no power'. The craft only survives while active=true, but power.ts:56 charges demand for any active machine and env.ts:37 counts it as an interferer. A misplaced 40 kW forge would draw power and slow nearby crystal machines while doing nothing, so those paths must skip envMul<=0 machines. Simpler: when b.active, add rec.inputs back (to inBuf on misplacement, to the depot in setRecipe/removeBuilding). Those refunds must turn hot_ember_ingot into cold_ember_ingot (the Precision Assembler's input, see F8) and drop overcharged_crystal (the Stabilizer's input), as the existing refunds do.

## F8 (logistics, low)

`src/sim/game.ts:512`

**Summary.** Refunds put Molten Ember Ingots into a depot as 'hot_ember_ingot'. removeBuilding adds raw ids for a belt's item, inBuf and outBuf (512-515), and setRecipe does the same for outBuf (550), even though the rule says a hot item entering a depot cools at once. The replace path in place() already converts to cold_ember_ingot.

**Scenario.** Remove an Insulated Belt carrying a Molten ingot, and switch a forge holding 2 finished Molten ingots to Reheat. The HQ then lists hot_ember_ingot=3 and cold_ember_ingot=0: $0 'Molten' stock that requests can even ship down the shaft. Repro: <session scratchpad>\review2\refund.ts

**Proposed fix.** Map hot ids to 'cold_ember_ingot' (as place() does) in the removeBuilding and setRecipe refunds.

**Check: real.** Reproduced with refund.ts: removing an Insulated Belt carrying a Molten ingot, then switching a forge holding 2 to Reheat, leaves hot_ember_ingot=3 and cold_ember_ingot=0 in the HQ. My f7f8.ts shows a crossing's item2 also lands hot. game.ts:512-516 and 549-551 add raw ids, while place()'s replace path (game.ts:411) and insert()'s cooled() convert. This breaks the glossary's 'Containers cool' and the item's own text ('cools at once in any container'). The depot then lists $0 Molten stock instead of $10 Cooled, and an Unloader set to Cooled Ember Ingot can't find it. The 'requests can ship it down the shaft' part is overstated: requestable() only offers BUILD_GOODS (inspector.ts:27,43), which contains no ember ingots. An Unloader on the Molten filter does recover the ingots, which cool on the first tick. Low impact, but a real rule violation and a depot display that lies.

**Notes on the fix.** Also convert item2 (crossings, game.ts:513), which is refunded raw even in place()'s replace path via removeBuilding(o, true). Convert inBuf too: the Precision Assembler holds Molten ingots as input. Apply the same to any in-progress-craft refund added for F7. Simplest: send every depot refund through one helper with the same mapping as cooled() (logistics.ts:33) that also drops unstable items.

## F9 (logistics, low)

`src/ui/inspector.ts:362`

**Summary.** The Miner inspector reads the deposit purity from the miner's top-left tile only, but the sim's rate (minerInfo) uses the best purity among its ore tiles. A miner whose top-left tile is off the ore is labelled 'poor' while it mines at normal purity.

**Scenario.** A Miner at (18,23) on the normal Surface iron deposit has 3 of 4 tiles on ore. The inspector says 'Deposit: poor, 3/4 tiles on ore', but it runs at 23/min = 30 (normal) x 0.75 coverage. Repro: <session scratchpad>\review2\refund.ts

**Proposed fix.** Show the purity minerInfo actually used, for example by returning it from minerInfo or taking the max purity over the footprint's ore tiles.

**Check: real.** Reproduced with refund.ts: a Miner at (18,23) with 3/4 tiles on the normal iron deposit shows 'Deposit: poor, 3/4 tiles on ore' but runs at 23/min = 30 x 0.75 (normal purity). inspector.ts:362 reads L.purity at the top-left tile. Off-ore tiles hold 0, which is PURITY_NAME[0]='poor' (layers.ts:269), so the '?? normal' fallback never fires. minerInfo uses the best purity of the chosen ore's tiles (game.ts:254-266). Any partly covered miner whose top-left tile is off the ore is mislabelled 'poor'. The 'Full speed' line beside it is correct, so only the label lies. Low severity, but a real UI lie.

**Notes on the fix.** Return the purity minerInfo actually used (bp, tracked per ore) and show that. Don't take the max over every ore tile in the footprint: a footprint straddling two deposits would then show the other ore's purity.

## F1-import-cancel-scenario-saves (ui-saves, high)

`src/ui/windows.ts:326`

**Summary.** In a ?scenario= session, cancelling the import's "Replace operation N?" prompt still clears app.scenario. The scenario then saves over the player's last-played operation, which breaks DECISIONS #53 (test sessions never write to a slot).

**Scenario.** Setup: all 3 slots full, last played operation 2 (mountain-slot=1). Open ?scenario=magma, so scenario=true and canSave() is false. Steps: Menu > Import save file, pick a valid save, press Cancel on "All 3 operations are in use. Replace operation 2 with the imported one?". importSave sets app.scenario = false at line 326, then returns on cancel at line 330. canSave() is now true and the magma scenario keeps running. The next autosave (app.ts:361-364), tab hide, unload, or "Save and quit to title" writes the scenario into slot 1. Result: slot 2 goes from {money 2000, time 7200, deepest 0} to {money 30506, time 30, deepest 4}, and the title lists the scenario as Operation 2. Reproduced against the real App and windows.ts with stubbed localStorage, confirm and file input: <session scratchpad>\review2\import_scenario.ts

**Proposed fix.** Clear app.scenario only once the import is committed: move `app.scenario = false` to just before `app.useSlot(slot)`, after the confirm. Or restore the previous flag on the cancel path.

**Check: real.** Confirmed. windows.ts:326 sets app.scenario = false before the confirm at :329-330, and the cancel path returns without restoring it. app.slot in a scenario session comes from readSlot(), so it is the last-played slot. saveTimer keeps counting while canSave() is false (app.ts:360-364), so once the scenario has run past 60 s the very next frame autosaves; nobody has to quit. I checked this by driving the real App.frame() loop (review2/v/v_f1_frame.ts): 70 s of the magma scenario, then Import and Cancel. One frame later slot index 1 went from {money 2222, time 7200, deepest 0} to {money 30533, time 100, deepest 4}. This breaks DECISIONS #53.

**Notes on the fix.** The proposed fix is right. Move `app.scenario = false` to after the confirm, just before useSlot(), or restore the old value on cancel. Because saveTimer is already over 60, any early clear of the flag saves on the next frame. Clearing the flag only on commit is the whole fix; resetting saveTimer is not needed.

## F2-failed-load-overwrites-slot (ui-saves, high)

`src/app/app.ts:212`

**Summary.** When a slot's save fails to load, continueGame silently starts a new game in that slot. The next autosave, quit or unload then overwrites the unloadable save. loadFromStorage (save.ts:113-121) swallows the error and returns null, so a failed load looks the same as an empty slot.

**Scenario.** Setup: slot 1 holds a 5-hour Magma Shelf save that deserialize rejects. Two cases: a save from a newer build (version = SAVE_VERSION+1, which throws 'Unsupported save'), or a save whose layer arrays no longer match the code (RangeError in L[k].set after a layer size change). The title still shows "Operation 1: The Magma Shelf, 5h 0m" because the -meta key is fine. Clicking it calls continueGame(0): loadFromStorage returns null, so newGame(0) runs with no message. The player gets a fresh Dig Site at $400 with Mags's opening line. quitToTitle (or the 60 s autosave, or beforeunload) then writes it into slot 0. The slot's meta goes from time 18000 / deepest 4 to time 0 / deepest 0 in both cases, and the old save is unrecoverable. Reproduced: <session scratchpad>\review2\continue_bad.ts

**Proposed fix.** Tell 'no save' apart from 'save failed to load', for example by having loadFromStorage throw or return a status when the key exists. On failure, stay on the title and show an error, keep the raw JSON (offer to export it), and never call newGame over an existing key. Call newGame only when no save key exists.

**Check: real.** Confirmed for the newer-version case. deserialize throws 'Unsupported save' when version > SAVE_VERSION. loadFromStorage swallows the error and returns null, and continueGame (app.ts:212) then calls newGame(slot). The title still shows the -meta label, and no message appears. I ran it against the real App and title (review2/v/v_f2_frame.ts): clicking 'Operation 1: The Magma Shelf, 5h 0m' starts deepest 0 / time 0 with no toasts, and after 61 s of real frames the autosave has replaced the 5-hour save with a version-2 save at time 60. The second variant is mis-described. deserialize sizes every array from the save's own w×h, so a code-side layer size change cannot cause the RangeError. Only a corrupted or hand-edited save does that.

**Notes on the fix.** Drop the layer-size-change trigger; the real triggers are a save from a newer build or a corrupted save. In the fix, continueGame must not call useSlot or newGame for a slot whose key exists but fails to load. Toasts are not drawn on the title screen, so it needs its own error line or dialog. Keep the -meta so the slot stays listed with its x-erase, and offer to export the raw JSON.

## F3-hover-through-ui-panels (ui-saves, medium)

`src/app/app.ts:562`

**Summary.** Hover state ignores UI panels. Input.endFrame clears uiCapture, and updateCamera, computeGhosts and hoverInfo read it before ui.end() sets it again; updateHover does not check it at all. So R and Q act on the world building hidden under a panel, and world tooltips replace panel tooltips.

**Scenario.** Setup: select the starter Smelter at (22,24); the inspector opens at ui (425,19,172,182). Steps: put the cursor on the inspector's "Rotate (R)" button while belt (19,25) lies under that spot in the world, and press R. Result: updateHover (562-573) sets hovered to the belt, and handleKeys (765-771) turns that belt from east to south. This cuts the miner-to-smelter feed, and the selected smelter does not rotate (rkey.ts). Q copies the hidden building the same way. Other effects of the same never-set check: hovering the build bar's Smelter button shows "Smelter / Waiting for input - Iron Ingot" (the starter smelter beneath) instead of the button's cost tooltip, and with the Press tool it shows "Press / Smelter in the way" (hud.ts:508, tips.ts). The mouse wheel over a panel zooms the map (app.ts:537), and placement ghosts are computed under panels (app.ts:622). Scripts: <session scratchpad>\review2\rkey.ts and <session scratchpad>\review2\tips.ts

**Proposed fix.** Keep the previous frame's 'mouse over UI' result in a flag set by ui.end() that endFrame does not clear. Use it in updateHover (set hovered and hoverCell to null), computeGhosts, hoverInfo and the wheel zoom. For R, Q and P with the cursor over the inspector, act on app.selected.

**Check: real.** Confirmed. uiCapture is set only in ui.end() and in button clicks, and endFrame clears it. updateCamera (wheel, :537), updateHover (:562, no check at all), computeGhosts (:622) and hud hoverInfo (:504) all run before ui.end(), so they always see false. handleKeys R and Q act on this.hovered. rkey.ts: with the cursor on the inspector's 'Rotate (R)' button, R turned the hidden belt from 1 to 2 and left the selected smelter alone. tips.ts: build-bar tooltips are replaced by the world building's tooltip. In build mode hoverInfo always replaces them with the placement tooltip, because hoverCell is always set, so building costs can never be read from the bar while placing.

**Notes on the fix.** A flag from the previous frame is needed for the pre-UI readers (updateHover, computeGhosts, hoverInfo, wheel). handleKeys runs after ui.end() and can check uiCapture directly. One extra case: while a belt or foundation drag is in progress (dragStart set), keep tracking the cell over panels. Release still places to cellAt() under a panel (handleWorldInput does not check overUi on release), so nulling hoverCell there would hide the preview of what is about to be built.

## F4-inspector-height-cuts-content (ui-saves, medium)

`src/ui/inspector.ts:200`

**Summary.** The inspector's panel height comes from fixed guesses per building kind (contentHeight), and several paragraphs advance cy by fixed amounts. Content ends up under the Rotate/Copy/Remove row or outside the panel. On a late-game Sorter, clicking the visible Remove button sets a filter instead.

**Scenario.** Five cases. (a) Sorter or Unloader once about 40 items have been seen (Alien Strata): contentHeight returns 120 (line 228) but the item picker needs 6 rows. Item buttons sit under the action row and below the panel. They are registered before the action row, so clicking the visible "Remove" sets the filter to Slag and the sorter stays (sorter_click.ts, real UI class). (b) Company Chute: its paragraph is 4 lines (40 px) but the code adds 32 (line 152) and contentHeight is 48, so "Surface Terminal." is drawn under Rotate/Copy/Remove. (c) Elevator: a 3-line paragraph with cy += 22 (line 492), so "front, mixed." overlaps the "Upgrade to Mk2" button or the "Requests below" line. (d) A jammed Assembler on a short grid: 2 rows of recipe buttons plus 3 breakdown lines push "Power 15 kW" and the progress bar under the action row and below the 182 px panel. The jam lines (lines 241-242) are 211-256 px wide in a 162 px column and run 47 px past the panel to the screen edge, over the Stack. (e) A depot with 24 item kinds and 8 requests: the panel is clamped to ui.h-79 (line 57), which is 281 px at 1080p and 221 at 900p, but the content needs 312. Request rows and the Add row are drawn over the world. Reproduced with the real drawInspector against a recording UI: <session scratchpad>\review2\insp2.ts, <session scratchpad>\review2\insp1.ts and <session scratchpad>\review2\sorter_click.ts

**Proposed fix.** Measure what is actually drawn: track a running cy and size the panel from it (last frame's value, or a measure-only pass). Use paraHeight for every paragraph (chute, elevator, engine node) and wrap the breakdown lines with para. Place the action row below the measured content. Clip, scroll or page the item pickers and the depot when the clamp on line 57 applies.

**Check: real.** Confirmed with the real drawInspector and UI. contentHeight is a fixed guess per building kind: sorter 120, chute 48, elevator 165, machine 164. The paragraph advances are hard-coded (chute +32 for 4 lines, elevator +22 for 3). sorter_click.ts: with every item seen, clicking the visible Remove at (510,143) sets the filter to slag and the sorter stays. Item buttons are registered before the action row, so they win the click. Late games see enough items for this: there are 45 items, row 5 starts at item 33 (Rotate), and items 37-38 overlap Remove. insp1/insp2 show the elevator's 'front, mixed.' covered by the Upgrade button, the chute's last line clipped by the action row, the jam explanation running 47 px past the panel, 'Power 15 kW' below the panel, and depot request rows drawn below the clamped panel.

**Notes on the fix.** The direction is right. Because the first-registered button takes the click, overlap must be removed geometrically, not just hidden by drawing order. Lay out the action row after the measured content, and clip or scroll the picker and depot whenever the line-57 clamp applies. The machine case (fixed 164) also needs measuring, since its rows grow with the recipe count, inputs, the side output and breakdown lines. Wrap the jam and breakdown lines with para.

## F5-knowledge-cards-cut-off (ui-saves, medium)

`src/ui/windows.ts:269`

**Summary.** The Field Manual's Knowledge page has no paging, so it shows at most the first 3-4 cards. From the 5th assay on, the card the game opens the manual for is never visible. The Basics page also runs past the window bottom.

**Scenario.** Setup: magma scenario, assaysDone = sapstone, resin, glowcap, chorus_crystal, charged_crystal, emberite. Finishing Emberite fires 'assay', and app.ts:467-471 opens help page 1 focused on emberite. Result: help() draws SAPSTONE at 34, RESIN at 103, GLOWCAP at 152 and CHORUS CRYSTAL at 211 (its text runs to 273 in a 250 px window), then stops at line 269. Charged Crystal, Emberite (the focused card), Thrumstone and Engine Glass are never drawn: 8 cards need about 512 px and the window has 218. Basics: the 8 paragraphs need 262 px against 218, so the last two are drawn at 236-290, below the 250 px window. Reproduced: <session scratchpad>\review2\manual.ts

**Proposed fix.** Page or scroll the Knowledge list, as the new news() window already pages, and open it on the page that holds knowledgeFocus (or list newest first). Split Basics into pages or make the window taller.

**Check: real.** Confirmed (manual.ts). With the magma scenario's 6 cards, only SAPSTONE, RESIN, GLOWCAP and CHORUS CRYSTAL are drawn. Chorus's text ends at 273 in a 250 px window, because the break at windows.ts:269 is checked after a card is drawn. The 'assay' event (app.ts:467-471) opens page 1 focused on emberite, the 6th card, which is never drawn. On Basics the last two paragraphs are drawn at 236-290, below the window bottom. The lab inspector tooltip still shows card text, but the manual the game opens for the player hides the card it is pointing to.

**Notes on the fix.** Paging or scrolling is right. Measure each card with paraHeight before drawing it, not after, so no card runs past the window. Open the Knowledge page on the page that holds knowledgeFocus. Basics needs pages or a taller window too, because its overflow lands over the build bar.

## F6-eta-history-survives-slot-switch (ui-saves, medium)

`src/ui/hud.ts:205`

**Summary.** The drill ETA history (etaHist, line 192) lives at module level and is never reset. After switching to an operation with an earlier s.time, or after New Game, the objectives panel says "Not being fed yet" while the drill is being fed. This lasts as long as the previous game's clock was ahead.

**Scenario.** Setup: play operation 1 at s.time 3600 with the Repair the Drill milestone open; etaHist samples run up to 3660, and at 0.5 plates/s it shows "At this rate: 4 min 20 s". Steps: quit and continue operation 2 at s.time 1200, feeding the same 0.5 plates/s. Result: t - last.t is negative, so line 205 never pushes a sample. `first` is an old sample with t < first.t, so the rate is 0 and the panel shows "Not being fed yet" at +0, +30, +60, +90 and +120 s. It stays wrong until s.time passes 3662, about 41 more minutes. Reproduced: <session scratchpad>\review2\eta.ts

**Proposed fix.** Keep the history per game, for example on App or keyed by the Game object and project id. Clear it when the game or the project changes, or when t goes backwards.

**Check: real.** Confirmed. etaHist (hud.ts:192) is module-level, and nothing resets it in enterGame, newGame or continueGame. When the new game's s.time is earlier, the check at :205 never pushes a sample. `first` falls back to etaHist[0], whose t is later than now, so rate is 0. eta.ts: operation 2 at s.time 1200, fed 0.5 plates/s, shows 'Not being fed yet' at +0..+120 s, while operation 1 showed 'At this rate: 4 min 20 s'. Within one page session this lasts until s.time passes the old samples, which also covers New Game (t = 0) after a long session.

**Notes on the fix.** Keying the history by Game and project id, or resetting on t going backwards, is right. Also clear it when the project changes inside one game (D1 to D2): delivered drops to 0, the old samples give a negative rate, and the panel shows 'Not being fed yet' for up to 60 s.

## F7-silent-save-failure-on-quit (ui-saves, low)

`src/app/app.ts:250`

**Summary.** Save failures are reported only by the menu's "Save now". Autosave (lines 361-364), tab hide and unload (lines 132 and 135), and "Save and quit to title" ignore saveToStorage's false result. Save and quit still leaves the game, so a full or blocked localStorage loses the session without a word.

**Scenario.** Setup: two slots hold large factories, so the origin's localStorage quota is nearly used. A save is about 0.33M characters plus about 420 per building, so 0.75-2M characters with 1000-4000 buildings; the repro uses a scaled-down quota. Steps: play operation 3 for 90 minutes. Every autosave throws QuotaExceededError, which is caught, returned as false and ignored. Then press "Save and quit to title". Result: quitToTitle returns to the title with no warning, and the title still shows operation 3 at time 0. The 90 minutes are lost on the next slot pick or reload. Reproduced: <session scratchpad>\review2\quota_fail.ts

**Proposed fix.** Check the return value. If "Save and quit" fails, stay in the game and show a blocking notice with the export option. On autosave failure, toast "Could not save" once per run of failures.

**Check: real.** Confirmed. quitToTitle (app.ts:250), autosave (:361-364), visibilitychange (:132) and beforeunload (:135) all ignore saveToStorage's false. Ctrl+S (:798-801) also shows nothing on failure; only the menu's 'Save now' reports it. quota_fail.ts: with a scaled quota, 'Save and quit to title' returns to the title with no toast, and the meta still says time 0. Picking the slot then reloads the old save. Late saves are about 0.33M characters plus about 420 per building (about 2M at 4000 buildings), so three big slots, or a browser that blocks storage, really can hit this. Severity is low but it loses progress silently.

**Notes on the fix.** Check the result on quit and stay in the game with an Export option. beforeunload and visibilitychange cannot show UI, so the visible warning has to come from an in-play autosave failure, shown once per run of failures. Ctrl+S should also show a failure toast.

## F8-power-meter-double-counts (ui-saves, low)

`src/ui/hud.ts:91`

**Summary.** The top-bar power readout counts supply twice when a layer's demand is 0. avail = p.supply + p.net, and net already includes supply, so the Surface's 60 kW Company Line reads "0/120 kW".

**Scenario.** Setup: new game; pause the starter Miner, Smelter and Press (P key or the inspector) and wait 10 s. L.power is {supply 60, net 60, demand 0}. Result: the top bar reads "0/120 kW", while it read "20/60 kW" when the line was running. An idle Shallows generator with fuel (80 kW) reads "0/160 kW". Reproduced with the real drawHud: <session scratchpad>\review2\power.ts

**Proposed fix.** Use one formula, avail = p.demand * p.sat + Math.max(0, p.net), which equals supply plus imports when demand is 0. Remove the separate demand == 0 branch.

**Check: real.** Confirmed. solvePower sets net = supply + imported - demand. When demand is 0, hud.ts:91 computes avail = supply + net, which is 2× supply. power.ts: the Surface reads '20/60 kW' while running and '0/120 kW' with the starter line paused (supply 60, net 60). It also happens whenever every machine on a layer is idle, for example a fresh underground rig whose generator is full and whose coal miner is blocked. The bar fraction is unaffected (0); only the number is wrong.

**Notes on the fix.** The single formula, avail = p.demand * p.sat + Math.max(0, p.net), is correct, because sat is 1 when demand is 0, which gives supply plus imports. Remove the ternary; the unused `supply` local on line 89 can go too.

## F9-ghost-prediction-ignores-spores (ui-saves, low)

`src/sim/env.ts:216`

**Summary.** predictPlacement, which feeds the build ghost's "Would run at X%" line (hud.ts:521-527), leaves out spores. On the Fungal Caverns the ghost promises full rate for machines that refreshEnv slows by up to 50%.

**Scenario.** Setup: fungal scenario; hold the Miner tool over the sapstone deposits at (46,36) and (30,26), which sit near glowcap as PLAN §5.10 intends. Result: the tooltip reads "Miner / Sapstone: 23/min" with no "Would run at" line, because mul is 1. Once built, refreshEnv gives envMul 0.59, so the miner makes 13.3/min. Heat and interference do get a "Would run at" line. Reproduced with the real drawHud and refreshEnv: <session scratchpad>\review2\spores.ts

**Proposed fix.** Apply refreshEnv's spore term in predictPlacement: for machines and miners that are not sporeImmune, multiply by (1 - 0.5 x the mean L.spore over the footprint). Return it separately so the tooltip can say "(spores)".

**Check: real.** Confirmed. predictPlacement (env.ts:216-233) applies heat and interference but not the spore term that refreshEnv applies (env.ts:106-114). spores.ts: Miner ghosts on sapstone at (44,37) and (28,24) show 'Miner / Sapstone: 23/min' with no 'Would run at' line, while the built miners get envMul 0.59 (13.3/min). The heat and interference cases do get the line, so on the spore layer the build tooltip misleads. Low severity.

**Notes on the fix.** Copy refreshEnv's condition exactly: only kind machine or miner, not sporeImmune (collectors are not slowed). Read the current L.spore, which already includes powered Spore Filters, and multiply it into mul with heat and interference. Also add a 'spores' reason to the `why` list in hud.ts:524-525, or the line will say 'Would run at 59%' with no cause.

## F10-rule-texts-contradict-sim (ui-saves, low)

`src/ui/hud.ts:552`

**Summary.** Four UI texts state rules or numbers that the sim does not follow: the warm-ground forge rate, the request share of each elevator cab, the Sorter's unlock milestone, and the Miner's deposit purity.

**Scenario.** (1) hud.ts:552: the warm-ground hover says "Smelters, Foundries and Forges at 150%", but the Pressure Forge (needsHot) runs at x0 on warm ground (env.ts; glossary: "warm is not enough"). (2) inspector.ts:417: the depot requests tooltip says "Requested goods take up to half of each cab", but after the dwell elevator.ts fills the rest of the cab with requests. With no belt cargo, every trip down carried 6 of 6 requested items (cab.ts). (3) hud.ts:412: the locked Sorter says "finish milestone 4 (Wire and Gears)", but Wire and Gears is milestone 3 and grants the license; milestone 4 is Brickwork (sorter.ts). (4) inspector.ts:362: the Miner panel shows the purity of the top-left tile. A Miner at (23,10) on the Shallows' rich iron (3 of 4 tiles on ore, 45/min) reads "Deposit: poor, 3/4 tiles on ore" (miner2.ts). Scripts: <session scratchpad>\review2\cab.ts, <session scratchpad>\review2\sorter.ts and <session scratchpad>\review2\miner2.ts

**Proposed fix.** (1) Change it to "Smelters and Foundries at 150%; the Pressure Forge needs hot ground". (2) Say "first take up to half of each cab, then any room belt cargo leaves". (3) Look the milestone up with MILESTONES.find(m => m.reward.license === val) instead of hard-coding 4. (4) Return the purity minerInfo chose (bp) and print that instead of L.purity at the top-left tile.

**Check: real.** All four confirmed. (1) hud.ts:552 says Forges run at 150% on warm ground, but env.ts:118 gives needsHot a ×0 on warm ground, which matches the glossary rule 'Pressure Forge: works only on hot ground'. (2) inspector.ts:417 says requests take 'up to half of each cab', but elevator.ts:105-106 fills the rest of the cab with requests after the dwell; cab.ts loaded 6 of 6 on every trip. (3) Wire and Gears is milestone n:3 and grants license:sorter (progression.ts:78), but hud.ts:412 says milestone 4, which is Brickwork. (4) inspector.ts:362 reads the top-left tile's purity, while minerInfo uses the highest purity among the ore tiles; miner2.ts shows 'Deposit: poor, 3/4 tiles on ore' next to 'Full speed: 45/min' (rich).

**Notes on the fix.** The text fixes for (1) to (3) are fine; the MILESTONES lookup for (3) is the robust choice. For (4), minerInfo returns only {ore, rate, coverage} today, so it must also return the chosen purity (bp) for the inspector to print.

## plain-crossing-on-express-insulated (placement, medium): rejected

`src/sim/game.ts:604`

**Summary.** planDrag always lays a plain Crossing where the drag crosses a line. The Crossing runs at 1.5 tiles/s and cools items like a plain belt (logistics.ts:439 and cool(..., false) at 538/550). Dragging across an Express line halves its throughput, and dragging across an Insulated line removes the insulation on that tile, which can silently break a hot-ingot delivery.

**Scenario.** Express: a north-flowing express line (x=20, y=45 to 31) into a crate, fed every tick, delivers 44 gears in 20 s. After a plain belt drag from (15,38) to (25,38) lays a crossing at (20,38), it delivers 22 in the same 20 s. Insulated: a Molten Ember Ingot at heat 100 on a 60-tile insulated run arrives at heat 60. With one dragged crossing on the run it arrives at 54 (the crossing tile costs 6.67 heat instead of 0.67). A 70-tile run from forge to Precision Assembler arrives at 53.3 without a crossing and 47.3 with one. At 47.3 the ingot becomes a Cooled Ember Ingot, so the Ember Core recipe (which needs hot_ember_ingot) jams and the D5 Drill refuses it. Reproduced with <session scratchpad>\review2\h2_drag.ts (parts B and C).

**Proposed fix.** Give a Crossing the speed and insulation of the belt it replaces: store them on the building at placement and use them in moveCrossing and cool. Alternatively, have planDrag skip express and insulated tiles and toast why, instead of laying a plain crossing.

**Check: not real.** The numbers reproduce (express 44 -> 22 gears; insulated arrival heat 60 -> 54), but this is what the stated rules produce. #54 says the drag lays a Crossing. The Crossing is defined at conveyor speed (buildings.ts:76), as are the Splitter and Sorter. The glossary says every belt-type tile except an Insulated Belt loses 10 heat/s. A hand-placed crossing behaves the same way. The release toasts that a crossing was laid, and §5.12 counts cooled ingots and stopped lines as normal, readable failures. No rule promises that a crossing keeps the speed or insulation of the line it crosses. This is a design gap (there is no express or insulated crossing), not a defect.

**Notes on the fix.** If the owner wants to change it, this is a design change. It must also cover hand-placed crossings. Per-building speed or insulation must be saved (save version bump) and shown in the inspector, which reads def.speed (inspector.ts:157). It also needs separate values per axis, or the dragged conveyor axis gets faster or insulated too. Making planDrag skip express and insulated tiles instead brings back the #54 problem: the dragged line would end at that belt and side-load into it.

## gift-buildings-refund (placement, low): rejected

`src/sim/game.ts:506`

**Summary.** Pre-placed buildings refund their full cost when removed even though nothing was paid for them, so removing them creates goods. This covers the Surface starter line from setupSurface (lines 178-200, via forcePlace) and each new layer's coal Miner and Combustion Generator rig (progress.ts:251-255). The glossary says removal refunds what the building took from the depot.

**Scenario.** Game.create(): remove the 18 starter pieces and the HQ goes from 100 Iron Plate / 30 Gear to 140 Iron Plate / 41 Gear. Removing each underground rig gives +16 Iron Plate, +4 Gear, +10 Brick and +2 Motor, and Motors are exactly what the Shallows is short of (#39). Reproduced with <session scratchpad>\review2\h4_more.ts.

**Proposed fix.** Mark non-fixed buildings placed with forcePlace as pre-paid, for example by setting `rushed = { ...cost }` or a gift flag, so removeBuilding refunds nothing for their cost. If the refund is intended, record that decision.

**Check: not real.** The numbers reproduce (h4_more.ts: the starter line refunds +40 Iron Plate and +11 Gear; each rig refunds its cost). But the rule never covered pre-placed gifts. The glossary's Paying line describes buildings paid from the depot. Every UI text promises a full refund: inspector.ts:187 'Remove (full refund)', hud.ts:353 and 427, windows.ts:252. The refund is a one-time conversion of a gift into goods of the same construction value. There is no loop and no money-to-goods path (the concern in #35), and a running line is worth more than its refund. Whether gifts refund is a design decision, not a defect.

**Notes on the fix.** If the owner wants gifts not to refund, `rushed = {...cost}` is the wrong tool. The inspector would then label the starter line 'rushed goods are lost' (inspector.ts:187). It needs its own saved flag and new UI text, and it makes moving the starter line or a rig a net loss. Simpler: record the decision in DECISIONS and amend the glossary's Paying line to cover pre-placed buildings.

## F6 (logistics, low): rejected

`src/sim/logistics.ts:390`

**Summary.** The Heartstone is pushed into outBuf, and onNodeHeartstone wakes the conduits, the instant the 4th item is accepted, before that item's 2 s. The first Heartstone (and the Waking Node's wake) arrives 6 s after the first item instead of 4 x 2 s = 8 s.

**Scenario.** Feed the Waking Node battery, core, battery, core as fast as it accepts them. The first item is accepted at tick 0; stockCount becomes 1 and the conduits wake at tick 364 (6.07 s). Repro: <session scratchpad>\review2\node.ts

**Proposed fix.** On accepting the 4th item, set a pending flag. Emit the Heartstone and call onNodeHeartstone when that item's craft timer reaches 0 in tickProduction's engine_node branch.

**Check: not real.** The mechanics are as described: the Heartstone is emitted on the 4th accept (node.ts: 6.07 s after the first item). But the rule's '8 s' is the per-Heartstone cycle: DECISIONS 30 and PLAN 5.10 say '4 items per Heartstone (8 s, 7.5 a minute)'. The 2 s lock after each accepted item still runs (production.ts:39), so a continuously fed node takes items at 0, 2, 4, 6, 8, ... and emits a Heartstone every 8 s, exactly 7.5 a minute. The only difference is a one-off 2 s phase on the first Heartstone and its wake. That changes no rate, cost, power total or milestone outcome, and no player can perceive it.

**Notes on the fix.** The proposed fix adds new saved state (a pending Heartstone that a mid-item save must serialize) and an outBuf room check at emission time, all to delay the first wake by 2 s. Not worth doing. If the wording matters, say 'every 8 s' instead.
