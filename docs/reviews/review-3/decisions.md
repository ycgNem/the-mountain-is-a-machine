# Review 3: owner decisions

Sources: `critic.md` (K1-K13), `art.md` (A1-A15) and `qa.md` (Q1-Q11). A skeptic reproduced every one
of the 39 findings; all 39 are accepted. Where the skeptic's "Notes on the fix" correct or narrow the
reviewer's fix, the notes win. The calls below are the ones that needed a decision.

## Critic
- **K1 Surface top station.** Accept (1) with the skeptic's wording: Mags says to belt the old drill
  lines into a side of the top station (its front is the exit) or turn it with R, or into the HQ (update
  the exact-text tests, PLAN and DECISIONS quotes). Accept (2), done properly: a belt pushing into a
  station's front is noted as a jam (jamWhy 'front') without sending side refusals through the recipe
  lookup; the station shows the ≠ badge, and its hover and inspector say "A belt is pushing into the exit:
  feed a side face, or turn the station with R." Decline (3): the whole front stays the exit (one rule
  for every station; R fixes it).
- **K2 Readability.** Accept with the skeptic's notes: port brackets on the hovered and the selected
  built building; a 2 px chute arrow (STYLE updated); plain conveyors get a stronger forward bow in their
  rungs, not the express chevron (that stays the express belt's identity); belts whose heads push into
  each other are marked ≠ with the hover "These belts face each other".
- **K3 The ending.** Accept: build PLAN §2's sequence, driven by real time (app.dt, not s.endTime): pan to
  the awake Heart (A6), then climb layer by layer to the Surface with each layer's conduits and lamps lit
  and its name shown briefly, then the Surface at dawn (a warm dither), then the text and the stats card.
  Audio: the ending chord must not be overridden by per-layer hum changes. The HUD stays hidden for the
  whole sequence; Esc or a click skips to the card.
- **K4 Build bar.** Accept: buttons whose unlock belongs to a layer deeper than s.deepest are hidden
  (this drops a deliberate teaser; record it), and each layer's own machines move to a fifth tab,
  "Strange", on key 5, so every tab fits one row at 640 UI px. Update the Category type, the key map, PLAN
  §9, the controls table and the Field Manual.
- **K5 Waking under the rock.** Accept: awake conduit in unrevealed cells and rock draws as a dim 1-2 px
  glass vein above the darkness (beacon beat), skipping occupied cells; particles above the darkness are
  optional. STYLE: unrevealed is solid #090a14 except beacons and awake veins.
- **K6 Drill ETA.** Accept: the ETA is the slowest good's; a needed good with no supply reads "no
  supply", and nothing prints a bogus short time.
- **K7 Drags starting on a working belt.** Accept with the skeptic's narrower condition: lay a Crossing
  at the drag's first cell only when the drag continues past it and that belt is a straight run (the cell
  behind it pushes into it); turning belts and the drag's last cell keep the leave-alone rule.
- **K8 The HQ only pays for buildings.** Accept with the skeptic's wording: "Machines only take parts
  from belts, never from the HQ: give the Assembler its own plate line and turn the brick line into it."
  Also M3's hint as proposed.
- **K11 Money.** Accept, limited to Act I: halve Act I's milestone cash; contracts stay visible (they are
  the catch-up valve). Re-run the Act I and II bots; nothing may stall. Act II stays for human playtests.
- **K12 Hours.** Accept: PLAN's length claim matches its own act bands (about 3-5 hours), not 4-6.
- **K9, K10, K13.** Accept as proposed (message texts and counts; the depot strip's room underground;
  Mags's introduction comes before the generic darkness hint and the first breakthrough doesn't stack
  four messages).

## Art director
- **A12 The Heart.** Approve one paid PixelLab job (10 generations; 343 left under the cap): generate at
  96-100 px and place it on the 112 canvas centred, or accept only a candidate with at least 4 px clear on
  every side; get_balance before and after; keep the free stopgap if no candidate is better. Redo the
  awake recolour and light spot for free. The off-centre conduit channel stays (moving CONDUITS changes
  the node rings and tests).
- **A3 Floor variety.** Accept, free, as the art run did for the Fungal floor: variant sheets for the
  Surface, the Shallows (after A11's lip fix, from the snapped sheet), the Crystal Depths and the others
  where they help, with a per-set share; t_l4_hot_magma tile 0 stays as it is.
- **A4 Elevator pit.** Accept with the skeptic's notes: recipe anchors (pit, chute) go into atlas.json
  like lights; the code-drawn station keeps its own rect and black fill.
- **A10 Dormant Engine Node.** Accept with the skeptic's notes (a cached dormant recolour of the atlas
  sprite until the node wakes).
- **A1, A2, A5, A6 (part of K3), A7, A8, A9, A11, A13, A14, A15.** Accept as proposed, all free.

## QA
- **Q2 Crew rig.** Accept with GEN_FUEL_CAP (4) coal in the crew's generator, not 5.
- **Q3 UI scale.** Accept the formula max(1, min(4, round(H/330), floor(W/640))).
- **Q1, Q4-Q11.** Accept as proposed with the skeptic's notes.
