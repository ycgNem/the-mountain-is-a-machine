# Act bots (Acts II-VI): owner decisions

Source: `actbots_result.json` (result.core and result.acts[0..4]: blockers with repro, where and fix;
friction; workarounds). All five acts finish on the real map (seed 20261030). Bot act times from the act
start: II 12:27 (from the real end of Act I), III 23:02, IV 30:54, V 25:02, VI 23:17 to the ending. Every
act lands 20-40% under its PLAN §8 floor; the bots spend no time reading, placing or fixing, so the bands
stay as they are until people play it (record that in PLAN §8 and DECISIONS).

## Game fixes (accepted)
- G1 Digging (DIG-DIAG, Act III B1): digCell marks diagonal neighbours revealed without flooding their
  cavern, so a cavern first touched at a corner stays dark and a later dig never floods it. Do not mark an
  unrevealed floor/water/magma neighbour revealed unless its component is revealed; orthogonal neighbours
  flood with revealComponent as now. Test: a tunnel that touches a cavern diagonally, then orthogonally.
- G2 Drill surplus (Acts III B2, IV B1, V drill-surplus): the Drill and the Heart accept a project good
  whose need is already met and stack it in their layer's depot (hot goods cool, unstable ones are lost,
  the depot cap applies; at the cap, refuse and mark the belt jammed), with a one-time toast "The Drill has
  all its <Item>; the crew stacks extras by the depot". The drill inspector shows each need as
  delivered/needed. noteJam also covers drill and heart for goods they can never take.
- G3 Unloaders and ghosts (Act IV B2, Act V starve-silent): a depot Unloader only takes a good while the
  depot holds more of it than the layer's queued ghosts hold (the running sum requestMissing uses), so
  planned buildings are paid first. checkStarved also warns when a ghost has waited STARVE_WAIT and the
  stock never reached its cost although some came in ("<depot> gets <Item>, but Unloaders take it as it
  comes in...").
- G4 Mags's advice for goods only made here or deeper (Act III B3, Act IV B4, Act V mags-shield-advice):
  when no depot above holds any and the item's home layer is this layer or deeper, drop the request and
  stock-up advice and say "Make it down here (<machine>: <inputs>), or Rush the plan."
- G5 Unloader filter change (Act IV B3): setFilter returns a held item that no longer matches the filter
  to the depot (through the refund path) and clears it.
- G6 The Heart and the Engine Nodes are never shown (Act VI HEART-HIDDEN): while the Governor project is
  open, draw the bore-site style beacon on the Heart, and a dimmer marker on each Engine Node until it
  wakes (render). Mags at M30 and M31 says where they are (compass direction and distance from the
  arrival). Do not give L5 a boreSite (placeFixed would put a drill there).
- G7 M31 never lands in msDone (Act VI): completeProject's ending branch completes the open milestone
  whose step is that project (msDone, reward, 'milestone' event) before setting s.ended.
- G8 Crystal Depths default requests add insulation (the Stabilizer costs 4, each Resonant Core takes 1).
  L5 default plate request 30 -> 60 (long lanes).
- G9 Hints: M28's hint adds "belt the Heartstones away from its front: it holds only four"; the Keep It
  Hot hint (M25) adds that a hot line that backs up needs an overflow into a depot; at each breakthrough,
  when belts that fed the Drill now end on empty floor, Mags says the top station is where goods go down
  ("Your drill lines end where the Drill stood: belt them into the top station to send goods down, or
  into the depot").

## Not changed (recorded)
- Produce steps count from the milestone's start (msBase); goods made earlier don't count. Kept: it is
  how every milestone reads ("now make N").
- Money is never short for the bots in Acts II, IV and VI. Kept for now: bots never misplace, survey or
  dig extra; revisit with human playtests (ROADMAP open item).
- Wash vs separate rarely bites because depots absorb resin up to 999. Kept; noted as a known softness.
- Act VI is mostly waiting on imports at the start state's stand-in rates; a real player scales the
  upstream lines. Kept.

## Test harness (tests/bot.ts, tests/play/*): fix and remove the WORKAROUNDs the game fixes make obsolete
- EVENTS-CAP: Bot.readEvents by identity, not index (Game.emit keeps the last 400).
- LAY-ORDER / bot-lay-crossing: Bot.lay swaps Crossings in before plain belts, like Game.placeDrag, and
  defers a lane until its crossings are paid.
- bot-canuse-drill: canUse for drill/heart is false once the need is met (moot after G2: surplus goes to
  the depot; then canUse is true for any project good).
- R1 route.ts pushCells marks side ports only for buildings that have a side output.
- C1 chained runs: after D2 the Act II script keeps its drill-bit line feeding the Shallows depot.
- Remove WORKAROUND blocks for G1, G2, G3, G5 once those land; keep the tests passing with the real rules.
