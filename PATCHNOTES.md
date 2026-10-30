# Patch notes

The in-game "What's new" window reads this file. Newest version first; write for players.

## v0.1 - First build

The whole game, start to finish: six layers, thirty-one milestones, six drill projects and an ending.

### The mountain
- Six layers joined by freight elevators: the Surface, the Shallows, the Fungal Caverns, the Crystal
  Depths, the Magma Shelf and the Alien Strata. Each has its own map, depot, power and one strange
  material that changes how you build.
- Dig through rock to reach deposits, survey for hidden ones, and bore the Drill deeper with goods.
  A hidden cavern opens the moment your tunnel meets it edge to edge.
- Belt everything a drill project needs down one line if you like: once the Drill (or the Heart) has
  all of a good, the crew stacks the extras by the depot. If the depot is full of it, or the good is
  one the project never uses, the Drill shows Jammed, with a badge over it, and says why. Its panel
  shows each good as delivered/needed, and a finished good's tip says to switch off a depot Unloader
  still sending it (its extras only go round).
- The drill's time estimate follows its slowest good, and says "No supply" (with that good's count
  in red) when a good it needs has nothing coming in.
- Assay each strange material in an Assay Lab to learn its rules and unlock what it makes.
- The starter line on the Surface is already running when you arrive: the first sale lands in seconds.
- Every layer with coal by its shaft (all but the Crystal Depths) opens on a running coal rig, its
  generator already stocked, so it has power from the first second even when the layer above has
  none to spare.
- A tidier look: fewer crate stacks and no rows of minecarts, floors that vary on the Surface, in
  the Shallows, the Crystal Depths and the magma, softer rock on the mountain face, and a redrawn
  Heart.
- The ending is a proper finale: the camera finds the Heart as it wakes, then climbs through
  every layer to the Surface at dawn while the hum resolves into its chord. Esc or a click skips
  to the thank-you card, and "Keep building (free play)" puts you back where you left off.

### Logistics
- Every layer has its own depot, and each opens with requests for what it needs most (the Crystal
  Depths ask for Insulation, the Alien Strata keep plenty of plates for long belt lanes). Request
  anything you have made (except hot or unstable goods) and the elevator hauls it down from the depot
  above by itself, taking the requests in turn.
- Requested goods load first, up to half of each cab (rounded down); the cargo you belt in fills the
  rest, and any room left over goes to more requests.
- The HQ's requests are what it keeps for the Surface: the elevator never takes it below them.
- A depot's request rows show what it holds against what it wants, and say when the depot above has
  none to spare. Shift-click moves a row by 50, the mouse wheel over it by 10. Underground, a planned
  building can request the goods it lacks in one click.
- Elevators carry 45, 90 or 180 items a minute as you upgrade them. An upgrade takes its goods from
  the depot below first, then from the depot above; its button lists what each depot holds.
- Each elevator station shows the last minute's traffic each way against what the cab can carry
  (amber when it runs full), and so does the Stack beside the map.
- A shaft's lower station hands its cargo straight to the depot, so it can't be turned. The top
  station tells you when the depot below is full of something (a depot holds 999 of each good) and
  when the depot above has none to spare.
- A station's front is its exit. Belt cargo into any other side: a belt pushed into the front shows
  the station Jammed and says to feed a side, or to turn the top station with R.
- An Unloader beside a depot leaves what your planned buildings are waiting for, so plans get built
  first. Pick another item for it and it hands back the one it holds.
- Can't afford something? Place it anyway: it becomes a plan and builds when the goods arrive,
  oldest first. "Build next" moves a plan to the front; Rush buys what's missing at 3x the price.
- Machines push out of one chute (front-right on a 2x2, front-centre on a 3x3); byproducts leave
  from the left face. A belt pushing the wrong item into a machine shows it as Jammed, and hovering
  the machine names the item.
- Chute arrows are bigger, and hovering or selecting a building marks its ports, as the placement
  ghost does. Conveyor rungs point the way the belt runs, even when it stands still, and two belts
  pushing into each other are both marked Jammed.
- Drag belts over a working line and the drag lays crossings instead of cutting it. Start a drag on
  a line that runs straight across it and it crosses that line too, instead of merging into it.

### Hazards
- Spores in the Fungal Caverns, interference in the Crystal Depths (Shield Walls block it), graded
  heat on the Magma Shelf (hot and warm ground; some machines love it), and the Alien Strata's
  dormant conduits.
- Chorus Crystal is scarce: the Crystal Depths' vents are poor. Cutting and charging it gets twice
  the powder from each crystal; crushing it straight to grit saves machines once you have plenty.
- Each Heartstone an Engine Node makes wakes its conduit a ring further out, five rings in all.
  Every running node adds 60 kW to a pool shared by everything on the conduit; an Attuner draws 30.
  Awake conduit lights up the cave around it, so a line built along it is easy to read, and where
  it still runs through rock it glows as a faint vein, so you can watch the Engine wake. A sleeping
  Engine Node looks dark until its first Heartstone.
- In the Alien Strata, the Heart's beacon and markers on the sleeping Engine Nodes show through the
  dark, and Mags tells you where they are.
- An Engine Node takes its goods in sequence and pushes anything else out of its side chute. Its
  inspector says when its output or its side chute is full.

### Money
- Sell at the Shipping Terminal, or for 60% on the spot through a Company Chute below, which takes
  goods from any side. Contracts, licenses and Company Line upgrades from the Company window.
- Contract goods count at either: each pays its full share of the contract at the Terminal, or 60%
  of that share at a Chute.
- The Surface's milestones pay half what they did, so what you sell at the Terminal (and the
  contracts) pays for the second power line upgrade.

### Quality of life
- The build bar has a fifth tab, Strange (key 5), for the machines each layer's own material
  brings. It shows nothing from layers you haven't reached, fits one row, and its buttons stay put
  when you switch tabs or layers.
- The top bar shows the current layer's depot at a glance, with a "+N" when goods come in; what a
  waiting plan lacks shows in coral. The layer's name is short there (hover it for the full name
  and depth), so more of the depot fits, and the best-stocked goods are the first to make room.
- Three save slots, autosave every minute, export and import of save files. A save that can't be
  loaded is never written over (the title offers to export it), and if saving fails the game says so
  instead of quitting.
- Pause any machine (P), game speed 1x/2x, a Field Manual (H) with controls and knowledge cards.
- The inspector grows to fit what it shows and scrolls when it runs long; the build tooltip sits
  beside the building you are placing, not over it. A Sequencer's panel says which side it takes
  next.
- Windows open clear of the objectives and the build bar, and the short notices at the top show
  over them. The Field Manual and What's new fit above the build bar, and nothing under an open
  window takes your clicks. The breakthrough card waits while a window covers it.
- The interface scale fits wide and narrow windows alike, and Settings only offers the scales that
  fit yours. The title screen shows its whole picture at any window size.
- Company offers no longer run their names into their pay.
- Mags, the site engineer, talks you through the first steps and warns when a depot runs dry: she
  says how many it has when it holds a few but not enough, when Unloaders are taking the goods a
  plan waits for, how to make a good down here when no layer above has any, and, after a
  breakthrough, where your old drill lines end and how to send their goods down. Her introduction to
  a new layer comes first, before the Board's memo and the layer's tips.
- Milestone hints cover the trickier spots, like giving the Assembler its own plate line (machines
  only take parts from belts, never from the HQ), giving a hot line an overflow and clearing an
  Engine Node's output. The Governor counts as a milestone when the Heart is fed, before the ending
  plays, and so does any milestone still open before it; their notices show with the thank-you
  card.
- The crew's coal rig on a new layer no longer looks broken: a Miner or machine feeding a full
  Combustion Generator waits as Idle (a generator burns only what its layer needs), and its panel
  says so.
