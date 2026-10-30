# Review 3: visual QA and performance

Round 3, on the finished first version. The reviewer adopted `.claude/agents/qa-screens.md` and played
the build headless; a skeptic then tried to reproduce and refute every finding. The owner decisions
are in `decisions.md`; DECISIONS.md cites these as "review-3 Q<n>".

**Verdict:** Ship once a few fixes are in. At the three target sizes (1280x720, 1920x1080, 2560x1440) all 25 sweep states draw the same layout: every one is 640x360 UI px. Shots differ by at most 0.4% between sizes, and only from animation. Every pixel block is a single colour, so scaling is whole-number throughout. The only code-drawn art is the documented i_filter and i_resonant_core, and nothing changed against round5-verify. A per-frame layout audit (each panel, text, paragraph, button and tooltip measured) is clean there, apart from Q8. Console errors and warnings were zero across every run: six extra viewport sizes and about 30 scripted interaction runs. Those runs covered every window and page, the inspector for all 35 placeable kinds plus the fixed buildings and jam states, the build-bar, Stack and top-bar tooltips, ghosts at the four screen edges, the ending through free play, and the title slots (start, save and quit, continue, erase, a broken save). Performance is fine, measured at 1920x1080 in headless Chrome on the RTX 5070 with GPU canvas, where frames ran uncapped at about 240 Hz. The alien scenario costs 0.63 ms of JS per frame (p99 1.1, worst 1.8) and the sim 0.1 ms per tick. I built a stress layer of 650 buildings: 496 belts carrying 248 items, 64 working Presses selling through Chutes, 10 generators and 8 lamps. It costs 1.59 ms per frame at zoom 3 (p99 2.6, worst 3.6) and 2.78 ms at zoom 1 (p99 3.8, worst 6.4). At 2x speed it costs 3.02 ms (worst 7.0); ticks average 0.2 ms (worst 1.9). Nothing goes over 8 ms. A CPU profile anyway shows canvas drawImage at 50% of samples, with no game function above 2%. The first visit to each underground layer costs one 19–24 ms frame. Fix these first: Q1 (window buttons above the build bar don't take clicks), Q3 (auto UI scale ignores width), Q2 (the crew rig never starts) and Q4 (Company offers overprint). The rest is polish. My Vite server on 5213 is stopped.

## Q1 (major, UI input: windows over the build bar)

**Problem.** When an open window has to overlap the build bar, the bar's buttons underneath still take the click. The bar is drawn before the windows and ui.button gives each press to the first hovered button (ui.ts:363). So the Field Manual's Next (and What's new's) does nothing, or picks a build tool instead.

**Evidence.** [seen] At 1920x1200 the UI is 480x300. Next sits at UI 352,253 (40x11), over the bar's Select (345,248, 43x21) and Remove (390,248). Clicking it leaves 'Page 1 of 2' and shows Select's tooltip 'Select and inspect (Esc)': <session scratchpad>\review3\qa-screens\steal-1920x1200\help_after_click.png. 1600x900 behaves the same (Next at 378,253 over Select at 371,248). At 1366x657, the Chrome viewport of a 1366x768 laptop, auto scale gives 2 (683x328 UI). With the Production tab on two rows, Next sits over the Charger button: the click selects the Charger build tool and the page stays 1 of 2: <session scratchpad>\review3\qa-screens\steal2-1366x657\help_after_click.png. 1280x650 does the same; 1280x680 and 1280x720 work. The window also cuts the bar's labels ('1 Loc', 'emove'): <session scratchpad>\review3\qa-screens\extra-1920x1200\help.png. Source: WIN.help and WIN.news are a fixed 250 px tall (windows.ts:196-197); windowPos clamps y to 18 when the window can't fit above barRoomTop (windows.ts:228-239); buildBar (hud.ts:543) always takes input.

**Proposed fix.** (1) Fit the paged windows to the room: help and news get h = Math.min(250, barRoomTop(app) - 4 - 18) in windowSize() and in help()/news(). paginate() already uses the window's own top and bottom, so pages just get shorter. (2) Guard: set ui.occluders = app.covers before drawHud. Make UI.inside() return false for points inside an occluder. Clear ui.occluders just before drawOverlayWindows(this) (app.ts:405), so HUD widgets under a window never hover or click and the window's own buttons always do.

**Check: real.** Reproduced with my own instrumented runs (my own server on 5223, HMR off). Scripts: <session scratchpad>\review3\qa-skeptic\q1.ts and q1b.ts in the same folder; results are in q1\results.json and q1b\results.json there.

**Confirmed sizes.** Surface scenario, Logistics tab:
- 1920x1200 (480x300 at 4x): Next is at 352,253; Select at 345,248 and Remove at 390,248.
- 1600x900 (533x300 at 3x): Next at 378,253; Select at 371,248.
- 1440x900 (480x300 at 3x): same as 1920x1200.

Clicking the overlap sends the click to 'Select'. The Field Manual stays on 'Page 1 of 2' and What's new on 'Page 1 of 7'. Screenshot: <session scratchpad>\review3\qa-skeptic\q1\1920x1200_help_after.png.

**Two-row bar.** In the alien scenario's Production tab at 1366x657 and 1280x650, the click turns the tool into {build: charger} and the page stays 1 of 2. Screenshot: <session scratchpad>\review3\qa-skeptic\q1b\alien_production_1366x657.png.

**New evidence: a common laptop setup.** A 1920x912 canvas is a 1080p laptop at 125% Windows scaling in a windowed browser. It gives a 640x304 UI at 3x and fails the same way:
- every Surface tab sends the click to Select (<session scratchpad>\review3\qa-skeptic\q1b\surface_production_1920x912.png);
- alien Production picks the Charger.

**Working sizes:** 1280x680, 1280x720, 1366x768, 1920x1080 and 2560x1440.

**Cause.** drawHud, and with it buildBar, runs before drawOverlayWindows (app.ts:402-405). ui.button gives the press to the first hovered button (ui.ts:358-363).

This does not contradict #88, which keeps windows clear of the bar only 'whenever it fits'.

**Notes on the fix.** Both parts are right, with these corrections.

**(1) Height.**
- Use one shared height function for windowSize() and help()/news(), so the covers and the drawn window always match.
- Apply it only in a game (app.screen === 'game' && app.game). news() is also drawn on the title, where app.game can be null, and barLayout() dereferences app.game!, so it would throw there.
- Give the height a floor (for example Math.max(150, barRoomTop(app) - 22)). paginate() gives a block taller than the page a page of its own, and on a very short UI that block would run over the Page/Next row.
- The height now follows app.category (rows), so keys 1-4 re-paginate. helpSub/newsPage already clamp.

**(2) Occluders.**
- Reset ui.occluders in UI.begin(), and clear it right before drawOverlayWindows.
- UI.end() computes `over` through inside(). If occluders were still set there, the world would take clicks through a window.
- The inspector is drawn between the HUD and the windows, but it steps aside when covered (inspector.ts:86), so it is unaffected.
- The top bar (y 0-15) is never under a window (windows start at y >= 18).

**Q3 does not fix this.** 1920x900 and 1920x912 canvases stay 640x300/304 under Q3's formula, and I reproduced Next -> Select at 1920x912.

**The title screen has the same click-through** (see Q9). It doesn't use covers, so it needs its own fix.

## Q2 (major, New layer power (crew rig))

**Problem.** The crew's coal rig on a newly opened layer starts with an empty Combustion Generator. Its Miner can only run on power cabled down from the layer above. If that layer has no spare power at the breakthrough, the rig never starts and the new layer sits at '8/0 kW' in coral.

**Evidence.** [seen] I loaded the 'surface' scenario, where the Surface draws 68–76 kW on its 60 kW line, and completed D1 with the debug panel's button. For 25 s after the breakthrough the Shallows showed demand 8 kW, sat 0, genCap 0. The coal Miner's status was no_power and the generator's inBuf {} with status no_input. The top bar showed '8/0 kW' in coral: <session scratchpad>\review3\qa-screens\rig-1280x720\console.json, <session scratchpad>\review3\qa-screens\rig-1280x720\rig_after.png. In the 'shallows' scenario, where the Surface has spare power, the same rig runs (21/80 kW). Source: progress.ts:434 places the generator with no fuel. This is not the known 'Output blocked when the generator is full' badge.

**Proposed fix.** In placeFixed (progress.ts:434), keep the generator and give it a starting load: `const gen = g.forcePlace('generator', n, d.x + 1, d.y - 1, 1); gen.inBuf.coal = 5;`. Coal burns 4 s at 80 kW, so 5 coal runs the Miner's 8 kW for about 200 s, and the Miner refills it within seconds. Add a test that opens the Shallows with the Surface over its line and expects the rig's generator to burn.

**Check: real.** The mechanism is real, but the finding overstates it.

**Code.** placeFixed puts down the rig's generator with an empty inBuf (progress.ts:434). generatorCapacity() is 0 with no fuel (production.ts:221-226). The 8 kW Miner therefore runs only on imported power: sat 0 makes powerFactor 0 (power.ts, production.ts:68-73).

**QA's own state** (<session scratchpad>\review3\qa-skeptic\q2.ts, vite-node): the 'surface' scenario with a 60 kW line, D1 completed.
- The Shallows shows 8 kW, sat 0, genCap 0 and the Miner reads no_power.
- But the rig starts by itself at t+160 s, when the Surface's drill lines back up and its demand falls from 76 to 48 kW.
- So 'never starts' is wrong.

**That state can't be reached in normal play.**
- D1 needs 30 Reinforced Plate, so it needs an Assembler.
- The Assembler unlocks at milestone 4 (buildings.ts:89), which requires 'Upgrade the Company Line' (progression.ts:89), so the line is at least 100 kW.
- At 100 kW the same scenario's rig starts at t+3 s.

**A reachable case still shows it** (q2b.ts in the same folder): a 100 kW line, with six fed presses holding the Surface at 124 kW.
- The rig stays dead for 164 s, until the drill lines back up.
- If the player belts the old drill lines into the top station, as Mags's breakthrough line tells them, the Surface stays over its line and the rig stays dead.
- This breaks DECISIONS #39 and PLAN ('opens on a running rig').

**With 4 coal pre-filled** the rig is burning at t+1 s, and it also covers the Surface's deficit (Surface sat goes from 0.81 to 1.00).

Severity: minor. It only happens while every layer above is at or over its supply.

**Notes on the fix.** **Use GEN_FUEL_CAP (4), not 5.** It is exported from logistics.ts:27, and progress.ts already imports from './logistics'.
- insert() refuses fuel at >= GEN_FUEL_CAP, and fullGenerator/waitsOnGenerator test >=. Five coal breaks that cap for no gain.
- Four coal at the rig's 8 kW (load 0.1) lasts 160 s. The Miner refills it in about 2 s once it has power.
- Code: `const gen = g.forcePlace('generator', n, d.x + 1, d.y - 1, 1); gen.inBuf.coal = GEN_FUEL_CAP;`

**Side effects (all acceptable):**
- The rig exports its spare power up the cable at once, so an over-drawn Surface is covered as the Shallows opens. That is today's behaviour once the rig runs.
- Act-bot start states (tests/play/start.ts calls placeFixed) and the shallows, fungal, magma and alien scenarios get fuelled generators. The act tests assert bands only.
- 'spare power crosses the shafts' clears inBuf itself.
- The rig Idle test (layers.test.ts:502) still holds: the generator is at its cap, so the Miner goes Idle.
- Removing the generator refunds its inBuf: 4 free coal, harmless.
- No save change.

**Test.** Game.create(20261030), lineLevel 0, enough active presses on the Surface to exceed 60 kW, then completeProject for D1 and run 2 s. Expect the Shallows generator's burn > 0 and the coal Miner's status not 'no_power'.

**Out of scope:** the Crystal Depths has no rig (#39), so its Assay Lab can still open without power. Log this in DECISIONS and keep the severity at minor.

## Q3 (major, UI scale (automatic))

**Problem.** The automatic UI scale looks only at height: round(H/330), app.ts:198. So 1600x900 and 1440x900 get 3x (533x300 and 480x300 UI px) and 1920x1200 gets 4x (480x300). The top bar then runs out of room: on every layer from the Fungal Caverns down, the power readout is drawn under the overlay toggles. The build bar wraps to two rows, and windows overlap the bar (Q1).

**Evidence.** [seen] The layout audit of all 25 sweep states flags these. At 1920x1200, '11/80 kW' (UI x292, w40) sits under 'Arcs' (x294) and 'Company' (x325) on the magma and alien states, '21/80 kW' under 'Spores' on fungal, and '41/41 kW' under 'Arcs' on crystal. Audit results: <session scratchpad>\review3\qa-screens\sweepaudit-1920x1200\console.json, with the same results at 1600x900 under 'Heat', 'Spores' and 'Arcs'. On screen, <session scratchpad>\review3\qa-screens\extra-1600x900\magma_heat.png reads '11/8' and then the Heat button. <session scratchpad>\review3\qa-screens\extra-1920x1200\crystal_overlay.png shows no kW figure at all, a two-row bar, and Mags, the objectives and the bar covering most of the world. The audit is clean at 1366x768 (683x384), 1680x1050 (560x350) and the three target sizes.

**Proposed fix.** Change app.ts:198 to `return Math.max(1, Math.min(4, Math.round(this.canvas.height / 330), Math.floor(this.canvas.width / 640)));`. That gives 2x at 1600x900 and 1440x900 (800x450 and 720x450) and 3x at 1920x1200 (640x400), and leaves 720p, 768p, 1080p and 1440p unchanged.

**Check: real.** Measured the top bar's texts against its buttons. Script: <session scratchpad>\review3\qa-skeptic\q3.ts; results in q3\results.json in the same folder.

**1920x1200 and 1440x900 (480x300):**
- fungal: '21/80 kW' (x308, w42) under Spores@284 and Company@325;
- crystal: '41/41 kW' under Arcs@294 and Company@325;
- magma: '11/80 kW' (x292) under Arcs and Company;
- alien: '0/80 kW' under Arcs and Company.

**1600x900 (533x300):**
- fungal under Spores@337;
- crystal under Arcs@347;
- magma under Heat@316.

<session scratchpad>\review3\qa-skeptic\q3\1920x1200_magma.png shows the power bar and the kW figure under Heat, Arcs and Company.

**The proposed scales are clean on every layer:** 3x at 1920x1200 (640x400), and 2x at 1600x900 and 1440x900 (800x450 and 720x450). 1280x720, 1920x1080 and 1920x912 (all 640 wide) are also clean.

**How much width the top bar needs.** From hud.ts topBar's arithmetic (q3b.ts, same folder), the left side clears the buttons at:
- ui.w >= 554 on magma with the scenarios' numbers;
- 582 on the Fungal Caverns once Arcs shows (deepest >= 3);
- 609 in a late game ($412k, +$2,345/min).

So the 640 floor is the right one; 560 isn't enough. No decision records the auto rule.

**Notes on the fix.** The formula is correct as proposed. Keep Math.max(1, ...), since floor(W/640) is 0 below 640 px.

**Changes the QA didn't list:**
- 1680x1050 goes from 3x (560x350) to 2x (840x525). This is needed: at 560 the Fungal top bar overlaps once Arcs shows in a late game, even though the scenario audit was clean.
- Windows 960-1279 px wide and at least 495 tall go from 2x to 1x. At 2x they were 480-639 UI px wide, which overlaps on deep layers.

**It doesn't fix short UIs that are 640 wide.** 1920x900 and 1920x912 canvases stay at 640x300/304, so Q1's fix is still needed.

**Shared use and docs.**
- Put the rule in one function (for example autoScale()), and use it as Q5's cap.
- Document it in PLAN §9 Settings ('auto: the scale nearest 330 UI px tall, never under 640 UI px wide') and in a DECISIONS entry.
- The title art's scale and defaultZoom are independent of this change.

## Q4 (major, Company window)

**Problem.** Contract offer rows use fixed columns: the name at left+18, the pay at left+150 and the multiplier at left+190. A long item name runs into the pay, and a five-figure pay touches the multiplier.

**Evidence.** [seen] In the alien scenario at 1280x720, '225 Heat-Resistant Aggregate' (153 px) prints over '$5,990', so the row reads '225 Heat-Resistant Aggre$5,990'. The Heartstone offer reads '$40,000(2.5x)' with no gap. Screens: <session scratchpad>\review3\qa-screens\windows-alien-1280x720\01_company.png and <session scratchpad>\review3\qa-screens\windows-alien-1280x720\02_company_contract.png. The audit flags text over text at UI 204,149 (w153) against 336,149 (w32). Source: windows.ts:310-313. Aggregate and Heartstone offers are common in Acts V–VI.

**Proposed fix.** In windows.ts:310-313: draw the name with `fitText(`${o.count} ${itemShort(o.item)}`, 128)` (giving '225 Aggregate'). Draw the pay right-aligned with `ui.textRight(money(o.pay), left + 186, cy, C.pale)`. Keep the multiplier at left + 190.

**Check: real.** windows.ts:310-313 draws the name at left+18, the pay at left+150 and the multiplier at left+190.

I computed every possible offer row (<session scratchpad>\review3\qa-skeptic\q4.ts, every CONTRACTS template at deepest 0-5, with fillContracts' count and pay formula):
- Only Aggregate overflows its 132 px name room: '150 Heat-Resistant Aggregate' is 151 px at L4, '225 Heat-Resistant Aggregate' 153 px at L5.
- The only pay that crowds the multiplier is '$40,000' (38 px). It runs from 150 to 188, 2 px before '(2.5x)' at 190; a space in this font is 4 px.

The QA's 01_company.png shows '225 Heat-Resistant Aggre$5,990'.

**Notes on the fix.** The proposed fix works:
- With itemShort, the widest name is '225 Aggregate' at 73 px.
- Right-aligned at left+186, '$40,000' starts at 148.

A more robust version fits each name to the room its own pay leaves:

`const pay = money(o.pay); ui.textRight(pay, left + 186, cy, C.pale); ui.text(fitText(`${o.count} ${itemShort(o.item)}`, 186 - measureText(pay) - 6 - 18), left + 18, cy, C.white);`

- Import fitText and itemShort in windows.ts.
- textRight draws nothing in the measure pass and the rows are a fixed 13 px, so companyHeight doesn't change.
- Optionally, add a hover tip with the full item name.
- The running contract's line can keep the full name: it fits (about 205 of 270 px).

## Q5 (minor, Settings: manual UI scale)

**Problem.** Settings offers 1x to 4x whatever the window size. At 1280x720, 3x makes a 426x240 UI and 4x a 320x180 one. The HUD then overlaps itself, the Field Manual runs off the bottom with its page count and Next off-screen, and at 4x the build bar runs off both edges.

**Evidence.** [seen] <session scratchpad>\review3\qa-screens\scales-1280x720\3x_help.png shows the Field Manual at 53,18 (320x250) on a 426x240 screen, with Next at y253, off-screen. <session scratchpad>\review3\qa-screens\scales-1280x720\3x_hud.png shows '920 m' under Heat and 'Company' cut off. <session scratchpad>\review3\qa-screens\scales-1280x720\4x_company.png shows the build bar from x -35 to 355. Settings itself stays reachable to switch back. Source: windows.ts:679-685 and app.ts:197.

**Proposed fix.** Compute fit = Math.max(1, Math.floor(Math.min(canvas.width / 640, canvas.height / 330))). In uiScale(), when a scale is set, return Math.min(this.settings.uiScale, fit). In settings(), pass `disabled: i > fit` with the tip 'Too large for this window' to the 1x–4x buttons.

**Check: real.** Reproduced at 1280x720 (<session scratchpad>\review3\qa-skeptic\q5.ts).

**3x (426x240 UI):** the Field Manual's Next is at y253 and 'Page 1 of 2' at y255, both below the 240 px screen. Screenshot: <session scratchpad>\review3\qa-skeptic\q5\1280x720_3x_help.png.

**4x (320x180 UI):** the build bar's buttons span x -32 to 353, and Next is at y253. Screenshot: 1280x720_4x_help.png in the same q5 folder.

Settings stays reachable at both scales (its scale buttons sit at y73 and y36). No decision rules on this; PLAN §9 only says 'auto or 1-4x'.

**Notes on the fix.** **The proposed fit formula contradicts the auto rule** on common sizes. fit = floor(min(W/640, H/330)) gives:
- 1 at 1366x657 and 1280x650 (657/330 = 1.99), where auto picks 2;
- 2 for windowed 1080p canvases (1920x900-1000), where auto picks 3.

With uiScale() returning min(setting, fit), a player who picks 2x on a 1366x768 laptop would get 1x. And the scale auto is actually using would show as disabled with 'Too large for this window'.

**Cap with the auto value instead**, using Q3's formula in one shared function:
- uiScale() = settings.uiScale > 0 ? Math.min(settings.uiScale, autoScale()) : autoScale()
- Disable the buttons with i > autoScale(), with that tip.
- Mark the button active by the effective scale, or say 'using Nx', so a stored 4x capped to 2x doesn't show as both active and disabled.
- Update PLAN §9 ('1-4x, up to what fits the window').

## Q6 (minor, World hover under modal windows)

**Problem.** While a blocking window is open (the menu, Settings, the save-failure dialog), the world takes no input and the sim is paused. Yet world tooltips and build ghosts still follow the mouse outside the window, and the tooltip is drawn on top of the window.

**Evidence.** [seen] <session scratchpad>\review3\qa-screens\windows-alien-1280x720\04_menu.png: the 'Dormant conduit: ...' tooltip is drawn over the Paused menu's top-right corner and hides its close button. <session scratchpad>\review3\qa-screens\blockhover-1280x720\settings_build_ghost.png: with Settings open, a Press ghost and its 'Press' tooltip track the mouse, and a click there places nothing. Source: updateHover's early-out (app.ts:638) ignores the window. hoverInfo and computeGhosts both read hoverCell.

**Proposed fix.** In updateHover (app.ts:638), also clear hoverCell and hovered when BLOCKING.includes(this.win). Ghosts and world tooltips then stay off until the window closes.

**Check: real.** **Code.** updateHover (app.ts:635-646) never checks BLOCKING (app.ts:66: menu, settings, savefail). handleWorldInput (app.ts:764) and handleKeys (app.ts:870) both return early while a blocking window is open.

**Reproduced** at 1280x720 with the Press tool (<session scratchpad>\review3\qa-skeptic\q6.ts):
- With Settings or the menu open and the mouse over the world, __app.hoverCell is {7,20}.
- The Press ghost and its 'Press' tooltip are drawn (<session scratchpad>\review3\qa-skeptic\q6\settings_hover.png).
- A click places nothing: 62 buildings before and after.

**One correction.** The world tooltip covers the menu's corner only while the mouse is outside the window. Once the mouse moves onto the window, overPrev drops the world tooltip, so the close button is never actually blocked.

**Notes on the fix.** The fix is safe: computeGhosts, dragRect and hoverInfo all return early on a null hoverCell.

Put the blocking check ahead of the dragStart exception, so it clears hover whatever else is going on:

`if (BLOCKING.includes(this.win) || !this.input.inside || (this.ui.overPrev && !this.dragStart)) { this.hoverCell = null; this.hovered = null; return; }`

Otherwise a right-drag that was running when Esc opened the menu keeps its remove rectangle under the menu.

Don't extend this to the non-blocking windows (Company, Field Manual, What's new, debug): the world outside them still takes clicks.

## Q7 (minor, One-shot feedback that expires unseen)

**Problem.** Two one-shot messages can time out before the player sees them. (a) drawHud draws the breakthrough card under any open window, and the card's 5 s keeps running anyway. (b) Milestone toasts fired as the ending starts expire unseen: no toasts are drawn during the ending's 14 s of text, and a toast lasts 4.5 s.

**Evidence.** [seen] (a) With the Field Manual open when D1 lands, the card is entirely behind the window at card.t 1.0 s and 2.8 s: <session scratchpad>\review3\qa-screens\card-1280x720\card_help_800.png. Without a window it shows: <session scratchpad>\review3\qa-screens\card-1280x720\card_nowin_800.png. (b) 'Milestone: The Governor' is in app.toasts from endTime 0.1 s to 4.1 s and is gone long before the HUD returns at 14 s: <session scratchpad>\review3\qa-screens\toast-1280x720\console.json. No toast is drawn in <session scratchpad>\review3\qa-screens\ending-1280x720\end_3.png. Source: app.ts:483-492 (breakthrough) and app.ts:573-578 (toast and card ageing).

**Proposed fix.** In the 'breakthrough' case, close non-blocking windows as the 'ending' case does: `if (!BLOCKING.includes(this.win)) this.win = null;`. Wrap the toast ageing at app.ts:573 in `if (!endingTextShowing(this))`, so the Governor's toast shows when the HUD returns with the thank-you card.

**Check: real.** **(a) Breakthrough card.**
- The card is drawn inside drawHud (hud.ts:79, 725-743), before drawOverlayWindows (app.ts:402-405), and it isn't one of the panels that check covered().
- app.ts:575-578 ages it for 5 s whatever covers it.
- The QA's card_help_800.png shows it entirely behind the Field Manual.
- This goes against #88's rule that a HUD panel under a window waits for it.

**(b) Toasts during the ending.**
- app.ts:573-574 ages toasts while drawHud(full=false) draws none during the 14 s of ending text (endingTextShowing).
- From the alien scenario, completing the Governor emits five 'milestone' events at endTime 0, M27 to M31, as #96 lands them (<session scratchpad>\review3\qa-skeptic\q7.ts).
- All of them expire at 4.5 s without being drawn, although #96 says M31's toast plays.

**Notes on the fix.** **(b) is fine as proposed.**
- endingTextShowing is already imported in app.ts.
- Queued toasts then show at 14 s alongside the thank-you card. They stack from y19 and the card is centred, so nothing overlaps at 360 UI px tall.
- When the ending lands several milestones, up to 5 toasts show at once; the toast list is capped at 5.

**(a) Closing the player's Company window or Field Manual is a design call.** The alternative that matches #88 (Mags's radio keeps its unread time under a window):
- Age the card where it is drawn, and skip it while covered: in hud.ts breakthroughCard, build its rect (w 220, h 46 at ui.h*0.28), then `if (covered(app, rect)) return; c.t += app.dt;`.
- Remove the ageing from app.ts:575-578; keep or move the `> 5 → null` there.

A breakthrough can't happen under the menu or Settings, because the sim doesn't tick while a blocking window is open.

## Q8 (minor, Mags's radio panel)

**Problem.** The radio's next-message button is a fixed 31 px wide. The labels '2 more' to '5 more' are 32 px, so they start on the button's left frame.

**Evidence.** [seen] In <session scratchpad>\review3\qa-screens\crop_radio_2more.png (cut from <session scratchpad>\review3\qa-screens\inspect-1280x720\insp_depot1.png), the '2' touches the frame. The audit reports a 32 px label in a 31 px button, and the same label appears after every breakthrough. Source: hud.ts:690-691.

**Proposed fix.** Size the button to its label: `const bw = Math.max(31, measureText(more) + 8);`. Draw it at `ui.button(x + w - 3 - bw, y + h - 13, bw, 10, more, ...)`.

**Check: real.** The radio's next-message button is a fixed 31 px wide (hud.ts:690-691). measureText gives (<session scratchpad>\review3\qa-skeptic\q8.ts):
- 'OK' 11 px.
- '1 more' 30 px: it starts flush against the left edge.
- '2 more' to '5 more' 32 px: the centred start is floor((31-32)/2) = -1, on the ink frame.

The radio keeps at most 6 messages, so '5 more' is the most it shows. The QA's crop_radio_2more.png shows the '2' touching the frame.

**Notes on the fix.** Fine as proposed.
- Keep the button's right edge where it is: x + w - 3 - bw. Today's x + w - 34 is that formula with bw = 31.
- At 40 px the button stays in the 16 px row the panel keeps under its text (h = 14 + lines*10 + 16), so it never overlaps the message.
- measureText is already imported in hud.ts.

## Q9 (minor, Title screen)

**Problem.** On the title, the Settings window is drawn over the slot list and its bottom edge cuts the second slot's label in half. The window is also about 30 px taller than its content. The slots take no input while a window is open, but they are still drawn.

**Evidence.** [seen] <session scratchpad>\review3\qa-screens\title-1280x720\12_title_settings.png: only the top half of 'Operation 2: The Crystal Depths, 12h 34m' shows under the window, and the window is empty below 'Screen shake'. Source: windows.ts:47-57 and 69-70; WIN.settings h is 110 (windows.ts:199) while its content ends 77 px down.

**Proposed fix.** In drawTitle, skip the slot buttons and the Settings / What's new row while app.win is set (they are inert then). Set WIN.settings to { w: 210, h: 88 }.

**Check: real.** **Visual problem confirmed** on the 1280x720 title (<session scratchpad>\review3\qa-skeptic\q9.ts):
- The slots sit at y201, 219 and 237 (14 px tall).
- Settings (210x110) sits at y115-225. Operation 1 is hidden and Operation 2's label (glyph rows 222-228) is cut at 225.
- The window is empty below 'Screen shake'; its content ends at y+77.
- Screenshot: <session scratchpad>\review3\qa-skeptic\q9\title_settings.png.

**The QA's 'they are inert' is wrong for the button row.**
- Only the slot loop sets ui.used (windows.ts:46-56). The Settings / What's new row at y259 is live, and it is drawn before the window.
- With What's new open (window x160-480, y45-295), clicking inside its text where the hidden Settings button lies switched app.win from 'news' to 'settings'.
- Screenshot: <session scratchpad>\review3\qa-skeptic\q9\title_news_after_click.png.

This click-through is a real bug the finding missed.

**Notes on the fix.** Keep both parts of the fix.

**Hiding the slots and the row while app.win is set** fixes the cut label and also the click-through through What's new. The cost: the row can no longer toggle windows. Players close with x or Esc, and going from Settings to What's new takes a close first.

**h = 88** leaves 11 px under the shake button. Content ends at y+18 + 3x16 + 11 = y+77.

**Neither part works alone.** With h 88 alone, the window at 360 UI px tall sits at y126-214 and still cuts slot 1.

If Q5 adds a line to Settings, recompute the height.

## Q10 (minor, Text)

**Problem.** Layer names begin with 'The', and three strings use them mid-sentence without lowering the capital: 'breakthrough to The Shallows noted', 'Mk1 to The Magma Shelf' and 'Locked: reach The Shallows'.

**Evidence.** [seen] The Board's memo in <session scratchpad>\review3\qa-screens\misc-1280x720\breakthrough_600.png. The elevator inspector in <session scratchpad>\review3\qa-screens\inspect-1280x720\insp_elevator_bottom5.png. [code] The lock tooltip comes from hud.ts:631. Sources: progress.ts:388, inspector.ts:594, hud.ts:631.

**Proposed fix.** In those three strings use LAYERS[x].name.replace(/^The /, 'the '), as depotName() already does (hud.ts:41-43).

**Check: real.** Confirmed three mid-sentence uses with a capital 'The':
- progress.ts:388, the Board's memo ('breakthrough to The Shallows noted');
- inspector.ts:594 ('Mk1 to The ...');
- hud.ts:631 unlockText ('reach The Shallows'), which feeds buildTip's 'Locked: ...' and the recipe tips at inspector.ts:347.

The project lowers 'The' mid-sentence everywhere else: depotName (hud.ts:42) and stepLabel (progress.ts:509).

The other uses are sentence-start and correct as they are: game.ts:1065, 1079 and 1097, the Stack tooltip, and the title slots after a colon.

**Notes on the fix.** **Update the test with the memo change.** tests/act1.test.ts:71 asserts `m.text.includes('breakthrough to The Shallows')`; change it to 'breakthrough to the Shallows'.

**Where the helper lives.** progress.ts is in the sim and can't import depotName from ui/hud.ts.
- Either inline `.replace(/^The /, 'the ')`, as progress.ts:509 already does,
- or add a small helper in data/layers.ts and use it in all five places.

## Q11 (minor, e2e sweep: alien_governor framing)

**Problem.** The alien_governor shot (zoom=2, camera at 40,35) only frames its beacons at 1920 and 2560. At 1280x720 the view is 40x22 tiles: the Heart's beacon at (52,42) sits under the build bar's top-right edge, the (58,30) node's marker under the Stack, and the (36,24) node's under the top bar. This is separate from the known early-pulse timing.

**Evidence.** [seen] In C:\Users\jacks\OneDrive\Documents\The Mountain Is a Machine\e2e\out\review3-qa-1280\alien_governor.png the Heart's ring is cut at pixels 1020–1060, 580–605, and a marker fragment shows at 528,30. All four beacons show in C:\Users\jacks\OneDrive\Documents\The Mountain Is a Machine\e2e\out\review3-qa-1920\alien_governor.png. Source: e2e/shots.ts:66.

**Proposed fix.** In that shot's setup, set the zoom from the viewport and centre between the nodes and the Heart: `__app.zoom = __app.canvas.width < 1600 ? 1 : 2; __app.cams[5] = {x: 46*16, y: 33*16};`.

**Check: real.** Ran e2e/shots.ts alien_governor against my server at 1280x720, 1920x1080 and 2560x1440, with OUT in my scratch folder.

**At 1280x720** (zoom 2, a view of 40x22.5 tiles), screenshot <session scratchpad>\review3\qa-skeptic\q11\1280x720\alien_governor.png:
- the Heart's ring is cut by the bar's top-right corner at about 1040,600;
- a fragment of the (36,24) node's marker shows at about 528,30, under the top bar;
- the (58,30) node is under the Stack (screen x about 1232).

**At 1920x1080** all three beacons show.

HANDOFF's 'What's next' asks for sweeps at 1280x720 as well. This is separate from the known pulse-timing issue.

**Notes on the fix.** **The proposed width test leaves 1600x900 broken.** With the QA's setup at 1600x900 (zoom 2, 3x UI), the Heart's beacon lands at y754, under the build bar (top at 735); only a sliver shows. Screenshot: <session scratchpad>\review3\qa-skeptic\q11b\1600x900_qa.png.

**Key the zoom on height instead:**

`__app.radio.length=0; __app.zoom = __app.canvas.height >= 1000 ? 2 : 1; __app.cams[5] = {x: 46*16, y: 33*16};`

Checked (q11b.ts and q11b\results.json in my scratch folder):
- At zoom 1 (1280x720 and 1600x900) all four beacons sit clear of the HUD. At 1280x720: Heart 744,512; nodes 488,224 and 840,320; Waking Node 360,480.
- At zoom 2 (1920x1080 and 2560x1440) the positions match the QA's centre: Heart 1168,844 and 1488,1024, both above the bar.

Also update the shot's comment, and HANDOFF's description of the shot if it mentions the zoom.
