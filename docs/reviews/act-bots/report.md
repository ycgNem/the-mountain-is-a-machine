# Act bots: Acts II-VI played on the real map

Scripted competent players (tests/bot.ts, tests/play/*) played each act on seed 20261030 with only
player actions. Acts III-VI start from tests/play/start.ts startAct(n); Act II starts from the real end
of the Act I bot. The owner decisions on these findings are in `decisions.md`; DECISIONS.md cites them
as "bots <act> <id>".

## The bot core

**Act I after the refactor.** act1.test.ts passes 3 of 3 in about 2.9 s, and tsc --noEmit is clean for both tsconfigs.

Current times on today's src:

| Run | M1 | M2 | M3 | M4 | M5 | D1 (M6) |
|---|---|---|---|---|---|---|
| Efficient | 0:06 | 1:01 | 3:02 | 4:19 | 9:51 | 12:40 |
| Starter-only | | | | | | 16:17 |
| Careless | | | | | | 15:07 |

Earlier in the session the D1 times were 12:58, 16:43 and 15:25. The shift comes from the main session's src changes, not from the refactor: the starter line now sells at 0:01, so First Light lands at 0:06 instead of 0:17.

To prove it, I kept the original pre-refactor bot and Act I script in the scratchpad and ran them on today's src. Their output matches the refactored playActI field for field on all three styles: milestone and project times, money by minute, snapshots, rushes, jams, refusals, stalls, deadlocks, power and the final map.

The only difference is two log lines the old bot wrote wrongly in the careless run ("built BS/SM after waiting 1 s as a ghost"; those were paid on the spot, and the old bot misread a floating-point time).

The real end of Act I is unchanged: $1,237 in the bank and $87/min of income.

- REQ-ANY: the request rules have been fixed in the sim but not yet in the UI. A player can't request things the bot can.
  
  What landed in the sim:
  - src/sim/elevator.ts:58 isRequestable and :69 requestableItems (anything not hot or unstable that has been seen)
  - :102 spareAbove
  - :144 requestMissing
  - HQ floor rows from LAYERS[0].requests (src/sim/game.ts:188, src/sim/progress.ts:286)
  
  What the inspector still does:
  - src/ui/inspector.ts:23-28 requestable() only offers BUILD_GOODS (:43), the goods some building costs.
  - :412 'if (b.layer === 0) return cy;' and :35 draw no HQ 'Keep for the Surface' rows.
  - No ghost inspector calls requestMissing.
  
  Until it changes, a player can't add rows for Reinforced Plate (part of the Mk2 upgrade cost), Drill Bits (D2 and D3), Ember Cores (the Governor needs 60; they're not on L5's default rows), Resonant Cores, Coal, Steel Ingots, and so on.
  
  Fix: requestable = (app, b) => requestableItems(app.game!, b.layer); draw the rows for layer 0 headed 'Keep for the Surface'; add a 'Request the missing goods' button on underground ghosts that calls requestMissing(g, b.id).
  
  The bot already follows the sim's rule (bot.request checks requestableItems, and bot.requestMissing wraps the sim function), so nothing in tests changes when the UI lands. The old WORKAROUND REQ-ANY branch is gone.

## Act II, the Shallows (layer 1), from the real end of Act I (startFromActI, seed 20261030)

**Completed:** yes

### Times

The act starts at 12:40 of game time with $1,237. Times are from the act start:

| Milestone | Done at | Took |
|---|---|---|
| M7 Down the Shaft | 0:01 | 0:01 |
| M8 Steel | 2:56 | 2:54 |
| M9 Motors | 5:34 | 2:37 |
| M10 The Bore Site | 11:49 | 6:14 |
| M11 / D2 | 12:27 | 0:37 |

- **Total act time:** 12:27 (game clock 25:08).
- **Machines at the end:** Shallows 12 (10 built, plus the crew's coal rig); Surface 18 (Act I's 17, plus one motor Assembler).
- **Clean run:** no rushes, deadlocks, stalls, jams or refused swaps.
- **Power:** Shallows peak 109 kW of 160, average satisfaction 1.00. The Surface peaks at 182 kW against its 160 kW line; the Shallows' surplus covers it up the shaft cable.
- **Elevators:** 265 items moved.
- **Money:** about $4,000 at the end. The tunnel ($240) was the only spending.
- **Test:** about 3.2 s real time.
- **Copper variant:** with `allCopperToWire`, M9 lands at 4:10, M10 at 7:12, and D2 is unchanged at 12:25.

### Pacing

**Band:** too fast. PLAN §8 gives Act II 20-30 min; the bot lands 7:33 under the floor. Act I's bot is 2:20 under its floor (12:40 against 15:00). The test asserts the 30-minute ceiling plus 60 s, as act1.test.ts does, and logs the floor miss.

**What took the time:** one Foundry. D2 needs 150 steel (100 beams plus 50 drill bits) at 15 a minute, which is 10:00 of the 12:27. On top of that, the beam Press waited about 1:00 for gears, and the last beams took about 1:30 to reach the Drill down the 41-tile trunk. Motors, reinforced plates and wire are never on the critical path, because Act I's factory makes them on the Surface and ships them down the shaft.

**What the band would need:** I resized D2 in memory in a scratch script (`sizes.ts`; not in the test) and replayed the same bot. Act time comes out at about 2.5 min plus steel/15 min:

| D2 size (beams/motors/bits) | Steel | Act time |
|---|---|---|
| Today, 100/30/50 | 150 | 12:27 |
| PLAN §5.7's 160/60/80 | 240 | 18:29 |
| 175/52/87 | 262 | 19:57 |
| 200/60/100 | 300 | 22:30 |

- About 260 steel reaches the 20-minute floor; about 340 lands mid-band.
- A player who builds a second Foundry would roughly halve the steel time and finish around 8 min. That is an estimate; I didn't measure it, because the start pocket has no clean spot for a second steel line.

**Machine-minutes rule:** pacing.test.ts's model gives D2 a first chain of 20.7 min (one smelter making 310 iron ingots), a 10-minute line of 19 machines, and 113 machine-minutes against D1's 40.
- It passes the code's tutorial rule (first chain at most 22) and the "more work than the act before" rule.
- It fails PLAN §8's text (25-35 min, 24-45 machines).
- PLAN §5.7 still lists D2 as 160/60/80, but progression.ts has 100/30/50.
- Real play beats the model by 8 min: the Shallows iron is rich (60 a minute), and Act I's 17 machines do the plates, gears, wire and reinforced plates in parallel.

**Other observations:**
- **M10 was slow:** its 80 elevator items took 6:14 at about 13 a minute once construction was paid (Mk1 carries 45). It gated nothing here, but it would for a faster player.
- **Money is never short:** PLAN §8 wants money "slightly short" in a layer's first 20 minutes.

### Problems found

**DIG-DIAG (major)** `src/sim/game.ts:847`

A cavern first touched diagonally by a tunnel never floods. digCell marks every tile in the 3x3 around a dug tile as revealed, including diagonal floor tiles, but it only floods a cavern from a straight-on floor neighbour that is not yet revealed. When the next dig touches that floor tile straight on, it is already marked revealed, so the cavern is never flooded and stays dark. tickDig then drops every queued tile beyond it, because none of them touches revealed floor. On the real map, a 1-wide tunnel from the pocket's south-east corner toward the Shallows beacon stops at the hidden copper cavern: 3 lit floor tiles, darkness beyond, 8 of 18 tiles dug, and the bore site is never reached.

Repro: const { g } = startAct(2); const L = g.layer(1); g.queueDig(1, [[44,18],[45,18],[46,18],[47,18],[48,18],[48,19],[49,19],[50,19],[54,27]].map(([x,y]) => ({x,y}))); for (let i = 0; i < 120; i++) g.tick(); Result: (49,20), a cavern floor tile, has revealed 1; (50,22) in the same cavern has revealed 0; digQueue is empty; 8 dug. Then g.queueDig(1, [{x:48,y:20}]): one straight-on dig floods the cavern. Script: <session scratchpad>\bots\act2\digbug.ts

Fix: In digCell, flood a straight-on floor, water or magma neighbour even when it is already marked revealed: drop the `!L.revealed[j]` check at :847. revealComponent is idempotent and cheap. The alternative is to stop :850 from marking diagonal floor tiles revealed. I checked the first fix by patching digCell in memory (digfix.ts in the same folder): the 1-wide tunnel then digs all 18 tiles and reaches the bore site.

**EVENTS-CAP (major)** `tests/bot.ts:904`

Bug in the bot core (tests/bot.ts), not the game. Bot.readEvents reads g.events by index, but Game.emit keeps only the last 400 events by splicing the oldest. Once the buffer is full its length stays at 400, the bot's eventIdx (400) never moves again, and bot.messages records nothing more. This starts at 07:48 of Act I. The Act I bot misses M6's intro, the D1 Board memo and M7's intro, and every act bot misses Mags's empty-depot warnings, which the act briefs say to react to.

Repro: const bot = playActI(); The last entry in bot.messages is at 07:48 of 12:40 game time, and three messages still in g.events were never read (M6's intro, the D1 memo, M7's intro). Script: <session scratchpad>\bots\act2\eventsbug.ts

Fix: Track events by identity: keep lastEvent, start reading at ev.lastIndexOf(lastEvent) + 1 (or 0 if it fell off the buffer), then set lastEvent to the array's last element. Or drain g.events after reading, the way the app does (src/app/app.ts:243); in that case act1.test.ts:88 has to look in bot.messages instead of g.events.

### Friction

- The Drill silently refuses a good it already has all of (src/sim/logistics.ts:376), and a belt stopped against it is never marked Jammed: noteJam only covers machines (logistics.ts:516). A single mixed trunk into the Drill stops for good behind the first finished good, and nothing says why. The bot plans around it with two Sorters into Company Chutes just before the Drill. Fix: mark a belt held by the Drill or Heart as Jammed, with a reason like 'the Drill has all the Steel Beams it needs'.
- 'Produce' steps count only from the moment their milestone starts (progress.ts:399, msBase). The 14 motors the Surface Assembler made while Steel (M8) was running did not count toward Motors (M9), which then needed another 2:37. M9 isn't even listed until M8 is done. Build steps already count what stands (DECISIONS #50). Fix: count production from the act's start, or show the next milestone in the objectives panel.
- M10's '80 items by elevator' counts only from M9 on. Once the Shallows makes its own gears and plates the depot rows are met, the cab runs at about 13 items a minute, and the step took 6:14. Mags's 'keep that elevator busy' gives no lever for it. Fix: count from the act's start, lower the number, or have the hint say how (belt cargo into the top station, or raise a request).
- Gears: Act I ends with 0 gears in the HQ, and the HQ keeps 10 for the Surface on a floor row the inspector doesn't show (REQ-ANY). The Shallows' default 20-gear row therefore never brings any, while the crate's 24 gears don't cover the steel line plus a gear source. The bot builds a Press on the Shallows on gears first. Mags only says 'The HQ has none to spare' after a ghost has waited a minute. Fix: show the HQ rows, have Mags's M7 intro mention gears, or put more gears in the Shallows crate.
- At D1 the top station replaces the Drill. Act I's three best lines (WP's wire, PD's gears, AS's reinforced plates) then push into empty floor and stop, and nothing says they could feed the shaft. The bot turns them into the top station: reinforced plates go down as belt cargo, and a new motor Assembler ships motors. Fix: a Mags line at D1 such as 'those drill lines point at nothing now: belt them into the shaft and they land in the Shallows depot'.
- Reinforced Plates and Drill Bits can't be requested from the UI (REQ-ANY: the inspector only offers goods some building costs), so belt cargo is the only way to get the 50 reinforced plates down. The bot was designed around it, and REQ-ANY didn't block this act.
- Money is never short (PLAN §8 says it should be): $1,237 at the start, $240 spent on the tunnel, about $4,000 at the end. Nothing else in Act II needs money, and the hidden rich copper the tunnel breaks into is never needed. Fix (design): either accept that, or give Act II a real money sink, such as a survey or dig the act needs.

### Workarounds in the tests

- EVENTS-CAP, in tests/play/act2.ts drainEvents(): a watcher that first copies any messages the bot missed into bot.messages (at the act start, everything since the D1 breakthrough event; after that, whatever was emitted after the bot's read that second), then empties g.events the way the app does and resets the bot's read index to 0. It does nothing if the bot no longer has a numeric eventIdx, so it can't double-record once readEvents is fixed. Marked // WORKAROUND EVENTS-CAP.
- DIG-DIAG, in tests/play/act2.ts, the 'dig toward the bore site beacon' phase: digs a 2-wide tunnel (30 tiles, $240) instead of a 1-wide one (18 tiles, $144). On this map the 2-wide tunnel enters the copper cavern straight on, so the cavern floods and the tunnel reaches the bore site. Marked // WORKAROUND DIG-DIAG. Once digCell is fixed, width 1 also works.

## III (The Fungal Caverns, L2), seed 20261030, from startAct(3)

**Completed:** yes

### Times

Act times, measured from the act start:
- M12 Something Growing: 00:53
- M13 Wash or Separate: 02:09
- M14 Clean Air: 05:05
- M15 Cobalt: 08:08
- M16 Spore Power: 10:07
- M17 / D3 Bore to the Crystal Depths: 23:02. This opens the Crystal Depths; the test asserts that layer 3 is open.

Time each milestone took: M12 0:53, M13 1:15, M14 2:55, M15 3:03, M16 1:58, M17 12:54.

When each D3 good was full: Filter 60/60 at 12:50, Insulation 200/200 at 19:17, Cobalt Drill Head 100/100 at 23:02. The first good reached the Drill at 09:54. The last ghost was built at 09:50. The filter assembler switched to insulation at 11:57.

Total act time: 23:02 of game time, 3.7 s real time; the vitest file runs in 4.7 s.

At the end the Fungal Caverns hold 18 machines: 16 the bot built plus the crew's coal miner and generator. The bot placed 180 buildings in all: 151 belts, 4 crossings, 3 splitters, 4 unloaders, 2 miners, 2 harvesters, 2 separators, 1 smelter, 2 presses, 4 assemblers, 2 spore filters, 1 spore collector, 2 generators.

Watchers recorded no stalls, deadlocks, rushes, jams or refused swaps. Peak L2 power was 190 kW at 08:37, with average satisfaction 1.00. Power fell short for 57 s, lowest 0.77, before the second coal rig was built.

### Pacing

23:02 against the PLAN §8 Act III band of 40–60 min is too fast by about 17 min. The bot spends no time reading, placing or fixing, and the Act I and II bots also land under their floors. The test asserts only the ceiling, with 5 minutes of slack, plus a 90-minute cap.

**Two stretches made up the time.**
- **Build, 00:00 to 09:50.** It was bound by the Mk1 Shallows-to-Caverns elevator. The elevator ran full for 637 s between 01:46 and 12:22, mostly carrying iron plates; ghosts waited up to 241 s. SF1 waited for filters from the new filter assembler, which put M14 at 05:05.
- **Deliveries, 09:54 to 23:02.** These were bound by Cobalt Drill Heads at 5.0 per minute. Two Separators give 20 cobalt ore a minute, which makes 9.9 ingots and so 5 heads a minute. That exactly matches the 5 per minute Drill Bit stand-in.
- Insulation ran at 10 a minute until the filter assembler switched over at 11:57, then 20 a minute, and was full at 19:17.
- Even a perfect cobalt line could not beat roughly 18–19 min: there are 10 bits at the start plus 5 a minute.

**Machine-minutes rule.** I computed this with the method from `tests/pacing.test.ts`. D3's first chain is 26 min (`separate_sapstone`), its 10-minute line is 31 machines, and it needs 225.7 machine-minutes against D2's 113. So the rule holds: D3 asks for more work than D2.
- The bot's D3 chain on L2 is 10 machines; the first chain has 9, with a Washer where the bot has a second Separator and one Press fewer. Head production ran about 18 min.
- So D3 is not undersized. The act is short against the band because the bot has no human overhead.

**Caveat on the stand-ins.** I chained a run from the real end of Act II (`playAct2` then `playAct3`).
- The bot hit three gear deadlocks, which were rushed for $636.
- No Drill Bit ever arrived, so heads stayed at 0/100 until the 90-minute cap.
- The 23:02 therefore depends on what `startAct(3)` supplies: 5 bits and 15 gears a minute.

### Problems found

**B1 (major)** `src/sim/game.ts:847`

A dig can leave a cavern dark and silently drop the rest of the tunnel.
- `Game.digCell` sets `L.revealed[j] = 1` on all 8 neighbours, but calls `revealComponent` only for orthogonal ones.
- So a tunnel that touches a cavern at a corner marks that one tile revealed and leaves the cavern dark.
- When a later dig meets the same tile edge-on, the tile already reads as revealed, so `revealComponent` never runs.
- `tickDig` digs only cells that touch revealed open floor. The tunnel cells past the cavern never qualify, so the whole queue is dropped ('Nothing left that touches open floor', game.ts:816).
- In Act III, surveying first and then digging to the bore site stopped after 9 cells at 35,29, and the Drill was never reached.

Repro: `startAct(3)`; then `g.digCell(2,35,30)` and `g.digCell(2,35,29)`.
- Result: (34,29) has revealed=1, but (33,29) and (23,19), which are floor in the same cavern, stay revealed=0.
- Control: `g.digCell(2,35,29)` on a fresh game reveals both.
- In play: `bot.focus(2)`; `bot.survey(30,28)`; `bot.digPath(F.boreSite(g,2))`. Digging stops at 35,29.
- Script: <session scratchpad>\bots\act3\digrepro.ts

Fix: In `digCell`'s neighbour loop, do not mark an unrevealed floor, water or magma neighbour revealed unless its component is revealed:
`const open = t === T_FLOOR || t === T_WATER || t === T_MAGMA; if (open && !L.revealed[j]) { if (dx === 0 || dy === 0) revealed += revealComponent(L, nx, ny); continue; } L.revealed[j] = 1;`
Alternatively, drop the orthogonal condition so corner contact reveals the cavern too.

**B2 (major)** `src/sim/logistics.ts:376`

The Drill silently refuses a project good it already has enough of, and nothing marks the stopped belt.
- `noteJam` is called only for machines (logistics.ts:516).
- The belt into the Drill keeps the spare item at its front with status 'idle'. The Drill also shows 'idle', and Mags says nothing.
- Every good behind it waits. D3's natural layout is one Unloader feeding three goods down one trunk, so one spare Filter stops all the Insulation and Drill Heads behind it.
- `tests/bot.ts:798` (`canUse`) treats a met need as usable, so the bot core's jam watcher never clears it.
- The Act II script reports the same trap for D2.

Repro: `startAct(3)`; `bot.focus(2)`; `bot.digPath(F.boreSite(g,2),{layer:2})`; `bot.waitDig(600,2)`.
- Put a belt at 10,11 facing S into the Drill, and another at 10,10 facing S.
- Set `g.s.project.delivered.filter = 60`.
- Put a Filter on the front belt and an Insulation on the back belt, both with prog 1.
- Wait 10 s. Delivered stays `{filter:60}`; both belts keep their items with status 'idle'; the Drill is 'idle'; there is no message.
- Script: <session scratchpad>\bots\act3\drillrepro.ts

Fix: Preferred: the Drill (and the Heart) takes a project good whose need is met and adds it to its layer's depot stock, with a toast such as 'The crew stacks the spare Filter by the depot', so a shared trunk never stops.
Failing that:
- call `noteJam` for kinds drill and heart at logistics.ts:516, so the belt shows Jammed with 'The Drill has all the Filter it needs';
- add an 'on the way' count to the Drill panel.
In either case, update `tests/bot.ts:798` `canUse` to treat a met need as unusable.

**B3 (minor)** `src/sim/game.ts:990`

Mags's starved-ghost line for Filters points up the shaft, but Filters are made only on the Fungal Caverns.
- When the Spore Filter ghost waits for Filters, Mags says either 'Request it so the elevator brings it, make it down here, or Rush the plan', or, once 'Request the missing goods' has added the row, 'The Shallows depot has none to spare: stock it up there, make it down here, or Rush the plan'.
- No layer above makes filters, so only 'make it down here' can work.

Repro: Run `playAct3()` to 02:07. The Spore Filter ghost at 49,35 has waited 60 s for 4 Filters, and the message reads '...The Shallows depot has none to spare: stock it up there, make it down here, or Rush the plan.' Without the filter row, game.ts:990 gives the 'Request it so the elevator brings it' line instead.

Fix: In `starveMessage` (game.ts:990 and 994): when the item's home layer is this layer or deeper (`ITEMS[item].layer >= li`) and no depot above holds any, return '<lead> Make it down here, or Rush the plan.' and skip the request and stock-up advice.

**C1 (major)** `tests/play/act2.ts:306`

This affects chained runs only and is a test-script gap, not a game bug: chained from the real end of Act II, Act III can never finish D3.
- After D2, the Act II script pauses its drill-bit Assembler ADB, whose output feeds the Shallows' Drill trunk. So no Drill Bit reaches the Shallows depot or comes down to the Fungal Caverns, and Drill Heads stay at 0/100.
- The Shallows also send no gears, which caused three deadlocks and $636 of rushes.
- `startAct(3)` hides both by supplying 5 bits and 15 gears a minute.

Repro: `const bot = playAct2({maxSeconds: 2700}); playAct3(bot);`
- Result: M12–M16 complete. D3 reaches 260/360 (Insulation and Filter full, Cobalt Drill Head 0/100) and stalls from 20:45 to the 90:00 cap. The report shows 'Drill Bits come from the Shallows' stand-in at none'.
- Script: <session scratchpad>\bots\act3\chain.ts

Fix: After D2, unpause ADB and route its bits into the Shallows depot, and keep a gear source running into the depots. Either the Act II script does this, or `playAct3` does it when handed an Act II bot. Until then, treat the chained Act III time as unmeasured.

### Friction

- One trunk carrying D3's three goods requires counting what is already riding the trunk. A player has to switch the trunk Unloader's filter before the Drill's count is full, which means counting the goods already on the 73-tile trunk, and the Drill panel shows only delivered/needed. The bot does this (WORKAROUND B2, recorded through `bot.noteFriction`). A real player who switches at '60/60' strands the trunk behind a spare Filter. Fix: B2's depot-stacking fix, or an 'on the way' count in the Drill panel.
- The wash-or-separate decision never bites. PLAN's Layer 2 section says that separating everything backs up the resin and stalls the Separators. With the side output belted into the depot (cap 999) they were blocked 0 s, so the bot separated all 425 sapstone, built no Washer and burned no resin. Filters and insulation used the resin, and the spare insulation went to the depot (294 made, 200 needed). Fix: cap how much resin a depot takes (for example 100), so a separate-everything line backs up as PLAN says. Otherwise reword PLAN's 'The decision' paragraph.
- Mags's Filter warning advises requesting filters or stocking them in the Shallows (B3); only 'make it down here' works for a Fungal Caverns good.
- Unloaders ignore ghost holds. A trunk Unloader set to Filter would drain the 4/4/2 filters that planned Spore Filters and the Collector are waiting for. The bot holds them back itself. This did not bind in this run, because every filter building was up before the trunk. Fix: an Unloader takes only stock above what queued ghosts hold.
- The Mk1 Shallows elevator ran full for 637 s (01:46–12:22) on iron plates for the build, and ghosts waited up to 241 s. Mags's 'upgrade the shaft' needs 20 Reinforced Plate for Mk2. The act-start stand-ins never supply it; a real player would bring it from the Surface. Fix: have Mags name the upgrade's goods, or expect players to wait it out (it does not bind the act end).
- Power on the Fungal Caverns dips when the biofuel generator runs dry. The solve burns local generators before the Shallows cable, so the biofuel generator is loaded alongside the coal one and runs dry. Its assembler sits in the thick spores the Collector needs, so it runs at 62% and makes about 4.6 biofuel a minute. Satisfaction fell to 0.77 at about 05:53 (the meter turns amber), and the bot added a second coal rig at 63,46/65,46, built at 07:42. Fix (optional): draw cable imports before burning fuel, or let Mags point out that the biofuel assembler sits in spores.
- The first Spore Filter (49,35) covers the Separators but not the cobalt smelter at 49,42, which still runs at 89%. Until SF1 stood, the line ran at miner 76%, separators 90% and 79%, and smelter 89%, which matches PLAN's '20–35% slow'. The spore field is not shown on placement unless the player reads the inspector's speed. This is fine as designed, but a filter-radius preview on placement would help.
- Chained runs: the act-start time depends on stand-ins that the real end of Act II does not provide, namely Drill Bits and gears (C1). A player arriving from Act II must first re-route their Shallows drill-bit line into the depot. Nothing tells them this until the drill-head assembler shows 'no input'.

### Workarounds in the tests

- WORKAROUND B1 (`tests/play/act3.ts`, the M12 phase comment): the bot digs the tunnel straight toward the bore site's beacon, with no survey of the way first. The beacon route meets the cavern edge-on from the south, so the cavern is revealed and the dig queue survives.
- WORKAROUND B2 (`tests/play/act3.ts`, the 'trunk feed' watcher): one depot Unloader feeds all three D3 goods down one trunk, and the bot switches its filter by counting the goods already on the trunk, so no spare ever reaches the Drill. A 'surplus at the drill' watcher would pick up a stuck spare and send it back to the depot; it never fired.

## Act IV, the Crystal Depths (L3): M18 to M22 and D4 (Bore to the Magma Shelf)

**Completed:** yes

### Times

All times are act times from startAct(4) (seed 20261030).

**Milestones**
- M18 The Singing Rock: 01:20
- M19 Order Matters: 02:50
- M20 Quiet Please: 02:51
- M21 Overcharge: 05:01
- M22 and D4 Bore to the Magma Shelf: 30:54

Time each milestone took: M18 01:20, M19 01:29, M20 00:01, M21 02:10, M22 25:53.

**Key builds**
- First tap T1: 02:55
- Overcharger: 03:28
- Stabilizer: 03:49
- Drill line along y=10: 03:49 (tunnel already dug)
- Taps T2 05:26 and T3 06:59
- Drill unloaders: 06:09 and 06:25
- Second circuit line: 23:39

**When each D4 good was all in**
- 60 Resonant Core: 20:05
- 100 Battery: 23:39
- 200 Circuit: 30:54

**Totals**
- Total act time: 30:54 (4.0 s real time; the vitest file takes about 5 s).
- Machines on L3 at the end: 12 (1 Miner, 1 Cutter, 1 Charger, 2 Crushers, 2 Assemblers, 1 Overcharger, 1 Stabilizer, 3 Resonance Taps), plus 3 Shield Walls and 6 Unloaders.
- L3 peak power: 156 kW at 10:31, average satisfaction 0.96.
- No stalls, deadlocks, rushes or jams.

**Chained from the real end of the Act III bot** (`playAct4({ from: bot })`)
- M18 01:20, M19 02:49, M20 02:50, M21 05:00, D4 35:39.
- 12 machines on L3, also clean.

### Pacing

**Against the band:** D4 at 30:54 is 9:05 under the PLAN §8 floor of 40:00 (band 40:00–60:00), about 23% under. Act I's efficient bot is 16% under its own floor. Chained from the Act III bot, D4 lands at 35:39.

The test asserts the ceiling (60:00 plus 3 minutes of slack) and a 90-minute cap. It only logs the floor verdict, as the Act I, II and VI tests do. I did not tune the bot to slow down.

**Machine-minutes rule:** it holds for D4. From the recipe data:
- first chain 26.7 min (inside 25–35)
- 10-minute line 38 machines (inside 24–45)
- 287.7 machine-minutes, above D3 (225.7) and below D5 (293.3)

The bot effectively ran the first chain: one machine per recipe on L3, 12 machines at the end. A second crusher and assembler pair ran only for the last 7 minutes. Its time is about 4 minutes of setup (assay 1:20, charger 2:50, overcharger, stabilizer and taps paid by 3:49–6:59) plus the 26.7-minute first chain.

That gives a structural result: setup plus a 25–35 minute first chain comes to about 30–40 minutes. So the 40-minute floor is only reached with roughly 10 minutes of human overhead (reading, placing about 70 pieces by hand).

**What dominated the time**
1. From 06:00 to 20:00, the single chorus vent. Every vent is purity 0, so it gives 15/min, not the 30 that PLAN says. It was shared by:
   - cores, limited to 3/min by insulation
   - batteries, about 4/min, limited by cobalt
   - the circuit crusher, 7.5/min
2. Then the single circuit line at 7.5/min, until the batteries were all in at 23:39.
3. Then copper wire. With two circuit lines the depot's stock of about 100 wire drained. Wire arrives at about 31/min, which is what is left of the full 45/min Mk1 L2>L3 shaft after cobalt, insulation and plates.

**Power** never bound the act: a 60 kW cable plus three taps.

**Money** was never short:
- $3.4k at the start
- $7.3k by 03:00 after the M18–M20 rewards
- about $14k unspent at the end; only the $600 survey and $224 of digging were spent

PLAN §8 wants money slightly short for a layer's first 20 minutes; here it is not. Nothing money can buy speeds the act. Elevator Mk2 needs 20 reinforced plate, and no depot holds any in this start state. Even with Mk2, the 35/min wire stand-ins would save about 3 minutes at most.

**What the band would need** (not tuned toward):
- Option 1: accept a zero-overhead bot landing about 23% under the floor.
- Option 2: give D4 about 30% more work on its binding chain so a first-chain player reaches 40:00. For example, circuit 200→270 pushes the first chain to about 36 min, which breaks the 25–35 first-chain rule.

The two PLAN §8 rules are only consistent if each act carries about 10 minutes of human overhead. The start state's wire rate also moves the result by about 5 minutes: 35/min standalone gives 30:54, while the real Act I–III factories give 35:39.

### Problems found

**B1 (major)** `src/sim/logistics.ts:376`

The Drill refuses any good its project no longer needs. On a single shared drill line (the natural layout: one belt carrying circuits, batteries and cores into the Drill), the first spare good waits at the Drill's door and stops everything behind it, permanently. The Drill shows Idle rather than Jammed, Mags says nothing, and no inspector shows how many goods are already on the line or still inside the overcharger and stabilizer. A player cannot know when to stop sending each good. The Act III bot hit the same problem on its trunk.

Repro: From the project root, with Node on PATH, run `npx vite-node --root . <session scratchpad>\bots\act4\repro.ts drill`. It runs startAct(4) and actFour without the watcher 'stop sending finished drill goods', then plays 50 min. The 61st Resonant Core reaches the belt at (53,10), and D4 stalls from 20:26 to the 50:00 cap at 217/360 (cores 60, circuits 70, batteries 87). The Drill's status is 'idle' and its jam is undefined.

Fix: In insert(), case 'drill'/'heart' (logistics.ts:369-380), accept a good the project no longer needs and send it to the layer's depot through the refund path (game.ts:1061: hot goods cool, unstable ones are lost). Show a one-time toast: 'The Drill has all its <item>; extras go to the depot'. At minimum, extend the noteJam call at logistics.ts:516 to drills and hearts so the Drill shows 'Jammed: has all its <item>', and have the Drill inspector show the goods on their way.

**B2 (major)** `src/sim/logistics.ts:598`

A depot Unloader takes every unit of a good as it arrives, even while a planned ghost on that depot is waiting for it. Mags's starved-ghost warning never fires, because the good keeps arriving. Example: a Resonance Tap ghost (4 Circuit, 10 Copper Wire) sits beside the drill line's circuit unloader and never gets built.

Repro: Run `npx vite-node --root . <session scratchpad>\bots\act4\repro.ts unloaders`. It runs the script without the watcher 'depot unloaders give way to ghosts'. The third tap's ghost at (20,17) waits 323 s for 4 Circuit (05:33 to 10:55) while unloader UCIR moves every circuit onto the drill line. Mags sends no message between 05:01 and the end. The bot core records a deadlock from 07:53 to 10:55 and rushes the ghost for $360.

Fix: In pullUnloader's depot branch, pull only while L.stock[f] is above what the layer's queued ghosts hold of f (the same running sum requestMissing builds at elevator.ts:149-152), so planned buildings are paid first. Also, in checkStarved (game.ts:965), warn when a ghost has waited STARVE_WAIT with the stock below its need even though the good keeps arriving, and name the unloader that takes it.

**B3 (minor)** `src/sim/game.ts:609`

Changing an Unloader's filter keeps the item it already holds and pushes that item on. Re-using an unloader in front of a machine therefore jams the machine on the old good, and the player has to pick the unloader up to clear it.

Repro: Run `npx vite-node --root . <session scratchpad>\bots\act4\repro.ts filter`. It runs startAct(4) and debugUnlockAll, places an unloader at (17,14) facing E with filter Cobalt Ingot (it holds one), puts a circuit Assembler at (18,14) facing E, then sets the filter to Copper Wire. 60 s later the unloader still holds cobalt_ingot, the assembler is 'jammed' (jam cobalt_ingot, reason 'wrong'), and it never gets wire.

Fix: In setFilter (game.ts:607-610), when the building holds an item that does not match the new filter, return that item to the layer's depot through the removal refund path and clear item and prog.

**B4 (minor)** `src/sim/game.ts:990`

When a ghost starves for a good that no layer above holds or makes (Battery and Circuit exist only on the Crystal Depths), Mags's warning still begins 'Request it so the elevator brings it'. That row could never fill.

Repro: Run `npx vite-node --root . <session scratchpad>\bots\act4\repro_starve.ts`. It runs startAct(4) and debugUnlockAll and plans an Overcharger ghost on L3. After 150 s, spareAbove(g,3,'battery') is 0 and there is no battery row, and at 01:02 Mags says: 'The Crystal Depths depot is out of Battery and none is coming in. Your planned Overcharger is waiting on it. Request it so the elevator brings it, make it down here, or Rush the plan.' (and the same for Circuit).

Fix: In starveMessage's `!need[item]` branch (game.ts:987-990), check spareAbove(this, li, item) <= 0 first, and when nothing above has any, say 'Nothing up the shaft has any: make it down here, or Rush the plan.'

**B5 (minor)** `PLAN.md:652`

Doc drift: PLAN §6 says each chorus vent gives 30/min (90/min across all three). The data gives every vent purity 0, so each gives 15/min (45 in all), which tests/pacing.test.ts also assumes. On one vent this is what binds the Act IV line for its first 20 minutes.

Repro: The deposits at src/data/layers.ts:174, 176 and 178 have purity 0. game.minerInfo returns 0.25 items/s (15/min) for a Miner on the vent at (21,19). PLAN.md:652 says 30/min.

Fix: Update PLAN §6 Layer 3 (and §7.2, if it is quoted there) to '15/min, 45/min in all'. If 30/min was intended, set the vents' purity to 1 at layers.ts:174-178 and re-run pacing.test.ts; the chorus first chain for D4 drops from 24 to 12 min, and the circuit chain still binds at 26.7.

### Friction

- Depot unloaders take what a planned ghost waits for (B2). A player who puts unloaders on the circuit and wire lines watches a Resonance Tap ghost wait for minutes, with no word from Mags and no hint that their own unloaders are the cause. Fix: B2 (ghost reservation in pullUnloader, or a starved warning that names the unloader).
- A shared drill line stops for good on the first spare good (B1). Nothing shows how many circuits, batteries or cores are already on the 42-tile line or inside the overcharger and stabilizer, so a player cannot stop sending in time. When the line does stop, the Drill says Idle, not Jammed. The bot counts the goods on the belts and in the machine buffers itself. Fix: B1 (send extras to the depot, or a Jammed status), plus an 'on its way' count in the Drill inspector.
- Re-using an unloader by changing its filter jams the machine in front on the item it still holds (B3). Fix: return the held item to the depot when the filter changes.
- Mags tells the player to request Battery and Circuit, which only this layer makes (B4). Fix: say 'make it down here' when nothing above has any.
- The Crystal Depths depot's default request rows (src/data/layers.ts:183) have no Insulation, yet the Stabilizer costs 4 and every Resonant Core takes 1. A player waits a minute for Mags to mention it. Fix: add insulation: 20 to L3's requests.
- An Unloader on the lower station only takes from the cab's arrivals (about one item per cab), and those stop as soon as the depot's request row is met. An insulation feed built that way starved the stabilizer once supply above was plentiful (the chained run stalled at 41 cores until the feed moved to a depot face). Fix: say 'takes only what arrives' in the unloader's inspector, or let a station unloader also draw from the depot when the arrivals lack its item.
- After D3, the Act III drill-head assembler on the Fungal Caverns keeps eating that layer's cobalt (202 spare drill heads by act minute 40 in a chained run). The only clue is Mags's 'none to spare' message about the layer above. Fix: when a drill project completes, have Mags point at machines still making only its parts (or offer to pause them).
- Money is never short in Act IV ($7k+ from minute 3, about $14k unspent at the end), and nothing it can buy speeds the act: elevator Mk2 needs reinforced plate, which no depot holds at this point. Fix (pacing): a money sink tied to the act, such as an L3 survey or dig cost, or a cheaper Mk2 path.

### Workarounds in the tests

- WORKAROUND B1 (tests/play/act4.ts watchDrill): counts the drill goods on the y=10 line, on its two feeder belts and inside the overcharger and stabilizer buffers. Once delivered plus on-the-way meets a need, it stops that good: circuit or battery unloader filter off, or the overcharger or battery assembler paused. If a spare good still reaches the Drill's door it takes that belt up by hand (never needed in the final run).
- WORKAROUND B2 (watchUnloaders): while the layer's queued ghosts want more of a good than the depot holds, it switches the depot unloaders taking that good off in the inspector. An unloader feeding the machine that makes another good the ghosts lack stays on. It switches them back on once the depot holds what the ghosts want plus 5.
- WORKAROUND B3 (the second-circuit-line phase): the cobalt unloader is picked up and put down again with the Copper Wire filter instead of being re-filtered.
- WORKAROUND B4 (watchStarved): ignores Mags's 'request it' advice for goods made on this layer (circuit, battery, charged crystal, powder, cores) and presses 'Request the missing goods' only for goods from above.
- WORKAROUND R1 (bot core, not the game; tests/play/route.ts:84): pushCells marks every machine's side (byproduct) port as an output cell, so route/connect found no path for the drill line past the stabilizer, overcharger and charger. The y=10 line is laid by hand with run and swap('crossing'). Suggested fix for the bot core's owner: return sidePort only when the machine's recipe has more than one output or its sideBuf is non-empty.
- WORKAROUND C1 (pauseSpentLines, for chained runs): pauses machines making only goods that no recipe, building, fuel, assay, elevator upgrade, open project, milestone or contract uses. In the chain from the Act III bot that was the cobalt drill-head assembler at (64,39) on L2. It does nothing from startAct(4).
- Also: a chained bot carries Act III's names (UI, UB, LAB on L2), so the script resolves every name only to buildings on L3 (own()).

## Act V, the Magma Shelf (L4): M23 Hot Rock, M24 Three Routes, M25 Keep It Hot, M26 = D5 Bore to the Alien Strata. Played on seed 20261030 from startAct(5) by playAct5(); the test passes in 6.2 s (5.2 s of play) and tsc --noEmit exits 0.

**Completed:** yes

### Times

All times are from the act start. The act opened with $5,600, shafts Mk1/Mk1/Mk2/Mk1 and 13 stand-in supply lines.

Milestones:
- M23 Hot Rock: 01:20
- M24 Three Routes: 04:47
- M25 Keep It Hot: 07:34
- M26 = D5 Bore to the Alien Strata: 25:02

Total act time: 25:02 (1,502 game seconds).

When each D5 need was filled:
- Molten ingots: 20/20 at 12:42
- Ember Cores: 60/60 at 22:35
- Heat Shields: 160/160 at 24:18
- Circuits: 40/40 at 25:02. The act's 168th circuit came down the shaft at 24:10 and needed about 52 s on the trunk.

Machine count at the end: 16 machines, miners and generators on L4. The bot built 14: 4 miners (both vents, coal, rich iron), 2 Cooling Baths, a Thermal Extractor, 2 Heat Shield Assemblers, 2 Pressure Forges (one reheats ingots at the drill), a Smelter, a Foundry and a Precision Assembler. The crew rig adds 2.

Checks: no rushes, no jams cleared by hand, no refused swaps and no deadlocks. There was one stall, 07:34 to 10:41 (no milestone, drill at 0/280), while the 73-belt trunk waited for plates and then carried its first goods. L4 power peaked at 249 kW at 12:01 with satisfaction 1.00. Money went from $5,373 to $16,910 and never limited the bot.

### Pacing

**Against the band.** PLAN §8 puts Act V at 40:00–60:00. The bot finished at 25:02, about 15 minutes under the floor. The test asserts only the ceiling plus 5 minutes of slack, and the 90-minute cap. The bot spends no time reading or placing, so a person will be slower. But building speed doesn't set the floor; supply does.

**1. Circuits set the length of the act.** L4 needs 168 circuits:
- 120 for the 60 Ember Cores
- 40 for D5
- 6 for the Precision Assembler's cost
- 2 for the Thermal Extractor's cost

About 24 are in reach at the start (12 in the crate and 12 spare at L3), and the stand-in supply adds 6/min at L3. So the 168th arrives at 24:10 whatever the factory does, and D5 completes about 52 s later.

**2. Heat Shields almost tie.** The 160th shield went in at 24:18. Shields are limited by aggregate: the depot's aggregate sat at 0 from about 07:00, with two baths on the two vents in reach. That matches pacing.test's D5 bottleneck (the Emberite Miner). Faster circuits alone would save under a minute.

**3. Plates limited the first 10 minutes.** The L3>L4 Mk1 shaft was full the whole time and serves each requested item one at a time per trip. L4 had 84 ghosts at 06:00 and 0 at 09:59. The trunk opened at 09:42, which explains the stall.

**What the band would need.** I did not tune the bot to the band. To land in it with this factory, circuits would have to arrive at about 3.7/min (for 40 minutes) down to about 2.4/min (for 60 minutes) instead of 6/min. The other option is for D5 to ask more of the Magma Shelf itself, either more shields or more cores; those are limited by the vents' aggregate and by the forge.

**Machine-minutes.** The Magma Shelf's machines worked 157 machine-minutes in total:

| Machine | Machine-minutes |
|---|---|
| Miners | 59.7 (38%) |
| Cooling Baths | 25.9 |
| Thermal Extractor | 22.4 |
| Assemblers | 21.9 |
| Pressure Forges | 9.3 |
| Precision Assembler | 8.0 |
| Smelter | 4.9 |
| Foundry | 4.6 |

pacing.test's D5 reference is 293 (D4's is 288). The bot's count covers L4 only and leaves out the circuits, plates and beams made upstream. So it can't confirm or break the rule that every project asks more machine-minutes than the one before. It does show that the Magma Shelf's own share is about half the reference.

**Waste.** The forge runs ×2 on hot ground and makes more ingots than the act uses: 150 were counted as made against 80 needed, and 47 cold ingots stayed in the depot. The bot pauses the forge and the Precision Assembler at 21:28.

### Problems found

**drill-surplus (major)** `src/sim/logistics.ts:376`

The drill refuses any good whose need is already met, and the belt into it then stops for good. Nothing tells the player: belt refusals are recorded as jams only for machines (src/sim/logistics.ts:516), so the drill never shows 'jammed', and its inspector still says 'Belt these in from any side.' (src/ui/inspector.ts:694). D5 takes four goods, and one shared trunk is the obvious way to deliver them. That trunk deadlocks the moment the first good fills; here shields fill at 24:18 while circuits are still coming.

Repro: Seed 20261030, startAct(5). Run one belt into the drill that carries Heat Shields and Circuits, and let a 161st Heat Shield arrive before the 40th Circuit. The shield stops at the drill's face (logistics.ts:376 returns false), every circuit behind it stops, D5 never completes, and the HUD, the inspector and Mags all stay silent. An earlier run of this script hit it when the bot's trunk count overshot by one; taking up the drill's last belt (18,37) and putting it back freed the line.

Fix: Preferred: in the drill/heart case, when a need is already met, accept the good and stack it in that layer's depot instead of refusing it. For example: if (delivered >= need) { if (dry) return true; const c = cooled(item); L.stock[c.id] = (L.stock[c.id] ?? 0) + 1; return true; }. A shared trunk then can't deadlock. If refusing is intended: call noteJam for drills too (a new jamWhy 'full'), give the drill a 'jammed' status, and have its inspector say '<Item>: the drill has all it needs. Take it off this belt.'

**starve-silent (minor)** `src/sim/game.ts:979`

An Unloader takes goods a waiting ghost needs, because ghosts reserve goods only against other ghosts. Mags's starve warning also never fires while any of that good is still coming in (the now - lastIn < STARVE_WAIT test). So a ghost can starve for many minutes in silence. The depot strip shows the good as short, in coral, but nothing links the shortage to the Unloader.

Repro: Seed 20261030, startAct(5): the bot's layout with the shield assembler's aggregate Unloader left on from the start (scratch exp.ts noGate). The Thermal Extractor ghost (cost: 4 aggregate) waits 660 s and is built at 12:20 instead of 02:21. M24 slips from 04:47 to 12:24. V1's fourth foundation (44,20) is never affordable in 16 minutes, so the vent miner keeps running at -50% on hot ground. Mags never mentions aggregate.

Fix: In checkStarved, track the most the depot held of the item since `since` (or how many Unloaders took out, per layer and item). If a ghost has waited STARVE_WAIT and the stock never reached its cost even though some came in, warn anyway, e.g. '<depot> gets <Item>, but an Unloader takes it as it comes in. Your planned <ghost> is waiting on it: turn that Unloader off until it is paid.' Alternatively, let ghosts reserve goods against Unloaders too.

**mags-shield-advice (minor)** `src/sim/game.ts:1004`

When a ghost waits for Heat Shields, Mags's first advice is to request them from above. Only the Magma Shelf can make them (ITEMS layer 4, made from aggregate), and no depot above can ever hold one, so that advice is a dead end.

Repro: Seed 20261030, startAct(5): place a Pressure Forge (cost includes 2 Heat Shields) before any shield assembler runs. At 02:23 Mags says: 'The Magma Shelf depot is out of Heat Shield and none is coming in. Your planned Pressure Forge is waiting on it. Request it so the elevator brings it, make it down here, or Rush the plan.'

Fix: In starveMessage, when (ITEMS[item]?.layer ?? 0) >= li (nothing above can make it), drop the request advice and name the recipe instead: '... Make it down here (an Assembler: Aggregate and Steel Beams), or Rush the plan.'

**bot-lay-crossing (minor)** `tests/bot.ts:498`

In the test harness's bot core, not the game. Bot.lay places a route's pieces in order and swaps each Crossing in as it reaches it. When the depot can't pay for a swap yet, the swap waits as a 'refused swap'. The belts on both sides of that cell are already down, though, and feed straight into the working belt there, so the new line's goods leak into the old line until the crossing lands.

Repro: An earlier, abandoned Act V layout: a coal line from the rig's field crossing the belt from V1 to the Assay Lab, laid with bot.connect at 00:01 while L4 was short of plates. The crossing swap was refused, coal rode into the Assay Lab's line and stopped it.

Fix: In lay(), check that every crossing swap can be paid and placed before putting any piece, and defer the whole route otherwise. Alternatively, put the two pieces next to an unswapped crossing cell only after its swap has landed.

**bot-canuse-drill (minor)** `tests/bot.ts:798`

In the test harness's bot core, not the game. canUse treats any good a drill project needs as usable even after that need is met. So foreignItem never reports a surplus stuck at the drill: the drill-surplus deadlock appears only as a stall or deadlock, never in bot.jams, and the act tests' 'no jams' assertions can't catch it.

Repro: Any act: a surplus good at the drill's face (for example a 161st Heat Shield in Act V) never shows up in bot.jams or under 'Jams cleared by hand'.

Fix: if (kind === 'drill' || kind === 'heart') return !p || (p.delivered[id] ?? 0) < (PROJECTS[p.id].needs[id] ?? 0);

### Friction

- **The drill refuses surplus silently.** When the drill already has enough of a good, the belt into it stops for good, with no jam status, no message and no hint; its inspector still says 'Belt these in from any side'. A player's single trunk for D5's four goods deadlocks as soon as the first good fills. The bot avoids this only by counting every item on 73 belts, in the reheating forge and in the assemblers, and switching the head unloader every second; no player will do that. Fix: drill-surplus (stack the surplus in the depot), or at least a jam status and a line in the drill's inspector.
- **The hot line needs an overflow, and nothing says so.** Mags's only hint, at 04:47, is 'Insulate the line'. But the forge runs ×2 on hot ground and outpaces the Precision Assembler. A full line holds each ingot long enough to cool below half heat even when insulated, and the first cold ingot jams the assembler for good. The jam text, 'stuck at its input: it does not use it', doesn't say why. Without the bot's splitter back into the depot: 0 Ember Cores and 15 cooling events in 16 minutes, and no M25 (scratch exp.ts noSplit). Fix: have Mags, or the assembler's jam line, explain that the line backed up and cooled and suggest a splitter back to the depot. Or let the Precision Assembler push a cold ingot out of its side, the way the Heart's engine node already does.
- **An Unloader can starve a ghost without any warning.** The shield assembler's aggregate unloader takes every piece as it arrives, so the Thermal Extractor ghost and the vent foundations wait, and Mags says nothing because aggregate keeps coming in. With the unloader left on, the Thermal Extractor was built at 12:20 instead of 02:21 and M24 came at 12:24 instead of 04:47. Fix: starve-silent (warn and name the Unloader), or let ghosts reserve goods against Unloaders.
- **The Precision Assembler keeps using circuits after the drill's 60 cores are made.** Circuits are the act's scarcest good, and nothing on screen compares cores made with cores needed. In an earlier run the assembler was left on: it took every circuit and the drill sat at 24/40 circuits from 24:50 to 40:00. The bot pauses it and its circuit unloader at 60. Fix: show the project's remaining need next to a machine that makes a project good, or let the player set a stop count.
- **The elevator's one-at-a-time rotation is invisible.** Each requested item takes its turn on every trip. Raising the beam (150) and gear (40) rows at the start cut plates to about 11/min, while more than 119 L4 ghosts waited on plates and plates piled up above (L1 170, L3 143). Just leaving those rows at their defaults until the plate-hungry building was done moved M24 from 06:32 to 04:47 and M25 from 09:20 to 07:34. Fix: show each item's share of the trips in the depot inspector (for example 'Iron Plate: 1 trip in 3'), or serve requests in proportion to what the ghosts lack.
- **Mags gives a dead-end tip for Heat Shields.** For a ghost waiting on Heat Shields, Mags leads with requesting them from above, where there never are any. Fix: mags-shield-advice.
- **The forge has no throttle except pause.** On hot ground it makes about twice what one Precision Assembler uses, and 47 cold ingots were left in the depot. Fix: a stop-when-stocked option on machines. Alternatively, have the hint say that surplus ingots cool into the depot and can be reheated (pressure forge recipe reheat_ember).

### Workarounds in the tests

- WORKAROUND drill-surplus, in the trunk watcher of tests/play/act5.ts: one trunk carries all four D5 goods. Every second, the head unloader (UTR) is switched to whichever good has the most still to send, counting what is delivered, on the trunk, in the reheating forge and inside or leaving the shield assemblers. Up to 4 circuits are held back while cores remain to be made. The shield assemblers pause once 160 shields are on their way.
- WORKAROUND drill-surplus, the surplus clearer: if a surplus good ever stops at the drill's last belt (18,37), the bot takes that belt up and puts it back, which returns the item to the depot. It did not fire in the final run.
- WORKAROUND starve-silent: the shield assemblers' aggregate unloaders (UA0, UA1) are switched off while foundations or a ghost still need aggregate, unless the depot holds that amount plus 4.
- WORKAROUND bot-lay-crossing: the trunk is routed with cross: false and placed belt by belt with bot.put rather than Bot.lay. The act's own crossings are placed in the same tick as the lines they cross, so no swap is ever needed.
- Not a bug fix but required: a splitter at (60,15) at the end of the insulated hot line sends the ingots the Precision Assembler can't take into the depot, where they cool. At the drill, a Sorter feeds cold ingots into a second Pressure Forge set to reheat_ember, which sends them into the drill hot.
- Player choices the game doesn't hint at: pause the Precision Assembler and turn off its circuit unloader once 60 cores are made; pause the forge once the drill's ingots are covered.
- Requests: beams and gears stay at their default rows until the ghosts are short 10 plates or fewer, then go up to 150 beams and 40 gears for the shields. Every 10 s the bot presses 'Request the missing goods' on the first 3 ghosts that lack something other than plates, shields or aggregate.

## VI: the Alien Strata (L5) and the ending

**Completed:** yes

### Times

Act times from the start state (startAct(6), seed 20261030). This run takes 5.6 s of real time.

Milestones:
- M27 The Walls Are Machines: 0:41
- M28 Wake the Engine: 1:24
- M29 Engine Glass: 2:37
- M30 In Sequence: 2:48
- Governor delivered and ending reached (s.ended): 23:17. M31 itself never lands in msDone (minor bug below).

Build-out:
- Last ghost built at 5:53.
- After that the bot only waits.

When each Governor need was full:
- Engine Glass 120: 7:33
- Battery 40: 16:01
- Ember Core 60: 18:27
- Heartstone 60: 23:17

Heartstones made:
- Waking Node: 5 (M28)
- Node 1: 1 (left in its buffer)
- Node 2: 55
- 0 wrong items pushed out.

Machines at the end:
- 6 machines built by the bot: 2 thrumstone Miners and 4 Attuners. The crew's coal rig was already there.
- 205 buildings in all: 190 belts, 5 Unloaders, 3 Splitters, 1 Sequencer.

Power and money:
- L5 grid peak 31 kW.
- Conduit pool peak 120 kW wanted against 120 kW available.
- Money never dropped below $6,007; $18,109 at the end.
- No stalls, deadlocks, rushes, jams or refused swaps.

### Pacing

PLAN §8 band for Act VI plus the ending is 30–45 min. The bot ends at 23:17, which is 6:43 too fast.

The test follows Act I's precedent:
- It asserts only the ceiling (45 min plus 5 min slack) and a 75-minute cap.
- It logs the floor verdict.
- This is not a thinking-time artifact: the time is set by the imports.

What dominated the time: imports from the start state's stand-in supply.
- Each Heartstone needs 2 Resonant Cores at any node. 60 Heartstones need 122 Resonant Cores (counting node 1's).
- ACT_SUPPLY[6] brings 5 Resonant Cores a minute from L3. That alone sets about 23 minutes.
- Batteries (3/min) finish at 16:01. Ember Cores (3/min) finish at 18:27.
- Building is done by 5:53. The last 17 minutes are waiting.

The ending barely depends on how fast the player builds (measured):
- Idle 5 or 10 minutes before building anything: still ends at 23:17.
- Idle 15 minutes: ends at 26:27.
- Reason: node 2 can take 15 Resonant Cores a minute, three times the import rate, so it catches up on cores that pile up in the depots.

Import-rate variants (same bot, 4 Attuners):

| Resonant Cores | Other change | Ending | What binds |
|---|---|---|---|
| 5/min (default) | none | 23:17 | Resonant Cores |
| 4/min | none | 29:24 | Resonant Cores |
| 3.7/min | none | 31:52 | Resonant Cores |
| 3/min | none | 39:38 | Resonant Cores |
| 8/min | none | 18:29 | Ember Cores |
| 8/min | Ember Cores 5/min | 15:54 | Batteries |

To reach the band's floor:
- Resonant Cores at about 3.8/min or less, or about 78 Heartstones at 5/min.
- Either way the extra time is waiting, not building. More work on L5 would serve the band better.

Machine-minutes rule:
- DECISIONS #52 and pacing.test.ts put the Governor at 296 machine-minutes: first chain 32.0 min (Attuner-bound), 10-minute line 43 machines.
- In this start state most of that work happens in the upstream stand-ins (cores, batteries, Ember Cores).
- On L5 the necessary work is about 46 machine-minutes: 464 Thrumstone at 2 s per Miner, 232 Engine Glass at 8 s per Attuner. Three machines could do it.
- The bot runs 6 machines so the woken nodes' 180 kW gets used. They overproduce: 639 glass made, 371 left in the depot.

Money is never short (PLAN wants it slightly short for the first 20 minutes):
- Digging cost about $2,250 (75 tiles), with no surveys.
- M27's $3,000 reward alone pays for all the digging.
- Starting with $2,000 and no income still ends at 23:17, with $8,284 left.

### Problems found

**HEART-HIDDEN (major)** `src/render/world.ts:1408`

The Heart and the two Engine Nodes besides the Waking Node are never shown to the player.
- The Alien Strata has no boreSite, so the bore-site beacon never draws.
- Surveyed cells show only ore markers.
- Unrevealed cells stay solid dark, and the fixed Heart and nodes sit in hidden caverns.
- No message gives their location.
The bot dug straight to them from map knowledge (logged as friction). A player must dig blind or follow the dormant conduit lines, which costs $30 a tile.

Repro: startAct(6); bot.focus(5).
- F.known(g, 5, 52, 42) is false.
- survey(5, 45, 40) costs $1,000. The Heart's cells become surveyed, but the renderer draws nothing for them: markers only where L.ore is set (world.ts:1397), and DARK_SOLID wherever revealed is false (world.ts:1377).
- The beacon branch at world.ts:1408 requires LAYERS[5].boreSite, which is undefined (src/data/layers.ts:220ff).

Fix: While s.project is 'governor', draw the beacon at HEART on layer 5, plus a dimmer marker on each Engine Node until it wakes. Use the same pulse as world.ts:1408, keyed on HEART and ENGINE_NODES instead of def.boreSite. Do not add a boreSite to L5: placeFixed would then put a drill there. Alternatively, let a survey reveal the footprints of fixed buildings within its radius.

**M31-MSDONE (minor)** `src/sim/progress.ts:453 (the guard), with s.ended set at src/sim/progress.ts:250`

Milestone 31 (The Governor) never lands in msDone.
- completeProject sets s.ended in its ending branch.
- checkMilestones then returns early because s.ended is set, so M31 gets no 'milestone' event, toast or sound.
- s.milestone stays on M31, so a save shows it unfinished.
The HUD's ending panel hides this.

Repro: const bot = playAct6().
- bot.g.s.ended is true.
- bot.g.s.msDone includes 27–30 but not 31.
- bot.msTimes[31] is undefined, and actSummary prints 'M31 --:--'.

Fix: In completeProject's ending branch, before setting s.ended, find the open milestone whose step is { kind: 'project', project: p.id }. Push its n into msDone, grant its reward and emit { t: 'milestone' }. Or run checkMilestones once before the s.ended guard applies.

**LAY-ORDER (minor)** `tests/bot.ts:494 (compare src/sim/game.ts:669)`

In the shared bot core (not my file), Bot.lay places plain belts first and swaps Crossings in last. Game.placeDrag does the opposite: Crossings first.

With a short depot this goes wrong:
- The belts use up the plates and the Crossing swap is refused.
- The new lane's belts are laid on both sides of the old belt it should cross.
- Its items side-load into the crossed lane.

In my first layout:
- Node 2's glass and core feed crossed the Heart's Heartstone lane at (48,42) with 30 plates in the depot. The swap was refused for 189 s.
- Resonant Cores poured into the Heart lane and jammed the Heart twice.
- The jam clearing broke the glass and core alternation. Four wrong items filled a node's side chute, and that node stopped for good (M30 never came).

The final layout has no Crossings and raises the plate request first, so it is not affected.

Repro: Exploration script try4.ts in the scratchpad (path in files). In one second, with 30 plates in the L5 depot, lay ~110 belt tiles whose routes need 5 Crossings. Bot.lay refuses all five Crossings ('Not enough goods to swap this in', with missing {}). The (48,42) feed lane side-loads into the Heart lane, and the jam watcher fires at 3:06 and 4:29.

Fix: Make Bot.lay swap the route's Crossings before it places plain belts, the way placeDrag orders them. Optionally hold the whole lane until its Crossings are paid.

### Friction

- **Hidden Heart and nodes.** A player has no way to find the Heart or the two other Engine Nodes; M30 and M31 name them but never say where they are. Fix: the HEART-HIDDEN beacon, plus a Mags line at M30 or M31 pointing along the conduit lines.
- **Act VI is mostly waiting.** Building is finished by about 5:53; then the player waits about 17 minutes for imported Resonant Cores, Batteries and Ember Cores. Idling the first 10 minutes doesn't change the ending. Fix (design): give L5 its own bottleneck work (more Engine Glass in the Governor, or glass nodes that need more items per Heartstone), rather than stretching the act with a slower stand-in supply.
- **Money is never short** ($6,007 at the lowest, $18,109 at the end, no surveys needed). Fix: lower ACT_MONEY[6] or M27's $3,000 reward, so the first 20 minutes feel tight as PLAN §8 asks.
- **Batteries are contested.** The Waking Node, the Attuners (2 each) and the Governor (40) all draw on the same 3-a-minute Batteries. The bot stops the Waking Node after M28. It also builds the Attuners before placing the Heart's Battery Unloader, because Unloaders ignore ghost holds and would starve the Attuner ghosts. Nothing tells the player either thing. Fix: a Mags line at M29 to save Batteries for the Attuners and the Heart, and Unloaders that respect older ghosts' holds.
- **Node feeds lose their alternation when disturbed.** Removing or re-routing a belt that carries a node's Glass/Core stream breaks the order. Each wrong item goes to the side chute, and four stop the node. The node inspector now says 'Side chute full: belt the wrong items away' (the main session's change), but nothing warns on the first wrong item. The bot always rebuilds its Sequencer fresh when it moves a feed. Fix: a toast or Mags line on a node's first wrong item, naming the side face.
- **M28's fifth Heartstone needs the node's front belted away**, since the node holds only four. The node inspector now says 'Output full: belt the Heartstones away', but the M28 hint doesn't mention it. Fix: add one clause to the M28 hint.
- **Long lanes eat plates.** The lanes total about 200 belt tiles, and the default plate request of 30 leaves them waiting as ghosts for minutes. Raising it to 150 kept the Mk1 L4>L5 shaft full for about 5 minutes. That was harmless here, because the act is import-bound. Fix: none needed; a Mags tip about raising the plate request before long belts would help.

### Workarounds in the tests

- None left in the code; no WORKAROUND markers remain.
- I had briefly marked the Ember Core request row as WORKAROUND REQ-ANY, because the depot inspector could not add it. The main session's change landed during my run: inspector.ts:506 now uses requestableItems. I removed the marker. The row is now an ordinary player action.
- The bot relies on knowing where the Heart and nodes are (HEART-HIDDEN). That is logged with bot.noteFriction rather than worked around in code.
- The design avoids the LAY-ORDER trap in two ways: the routes it lays have no Crossings, and it raises the plate request at the start of the act.
