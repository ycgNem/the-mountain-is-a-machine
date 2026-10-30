# The Mountain Is a Machine — Style bible

The rules every sprite, tile, effect and UI element follows. The `art-director` agent owns this
file: change it on purpose, never by drift. `PLAN.md` §6 has each layer's mood, `DECISIONS.md` the
reasons (the art plan and the style rules from review 1 are #46 and #47; the canonical sprite names,
the renderer fixes, dull decor and front chutes from its verify pass are #56 and #59–#61; review 2,
the art run, the art director's redo and the renderer and fallback passes after it follow #63;
review 3's art and renderer fixes are #102, #105 and #113–#119).
"Sprite status" near the end says which sprites are PixelLab art and which are code-drawn, and why;
`PROGRESS.md` has the spend.

## The look in one paragraph

Industrial pixel art in a high top-down 3/4 view: warm machine light pushing back a cold, dark
mountain. Each layer has its own mood palette; machines carry one consistent family language. Readability
beats detail: every machine has a distinct silhouette and an obvious *working* state, every item reads
on a belt at 1×, and you can follow a rock down a line and watch it become valuable. The deeper you go,
the stranger the light: ochre daylight, lantern amber, fungal magenta and lime, crystal cyan, magma
orange, conduit teal.

References (direction, never copied): Deep Rock Galactic (mood, darkness and lamp light),
Mindustry and Factorio (readable machines at small sizes), Dome Keeper (underground palette),
SteamWorld Dig (rock and ore chunkiness), Miner's Haven (items visibly upgrading on the line).

## Palette: Apollo (46 colors)

By AdamCYounis. The game palette is `src/data/palette.ts`. Every pixel of every sprite is one of these
colors, except the darkness overlay and code effects using alpha. Additions only with a written reason here.

```
blues    #172038 #253a5e #3c5e8b #4f8fba #73bed3 #a4dddb
greens   #19332d #25562e #468232 #75a743 #a8ca58 #d0da91
browns   #4d2b32 #7a4841 #ad7757 #c09473 #d7b594 #e7d5b3
oranges  #341c27 #602c2c #884b2b #be772b #de9e41 #e8c170
reds     #241527 #411d31 #752438 #a53030 #cf573c #da863e
purples  #1e1d39 #402751 #7a367b #a23e8c #c65197 #df84a5
greys    #090a14 #10141f #151d28 #202e37 #394a50 #577277 #819796 #a8b5b2 #c7cfcc #ebede9
```

### Material ramps (shadow → light)

Ramps that would collide at 12 px are kept apart on purpose: cobalt never reaches crystal's light
end, crystal never reaches cobalt's dark end, iron and steel sit at opposite ends of the grey ramp,
and coal carries glossy facets so it never sinks into a dark floor.

| Material | Ramp | Use |
|---|---|---|
| Outline | `#090a14` (deep) / `#151d28` (soft) | The only "black". Selective on machines and buildings; items get a closed outline (see "Items"). |
| Machine steel | `#202e37 #394a50 #577277 #819796 #a8b5b2 #c7cfcc` | Machine bodies and frames. Never a whole machine in grey: always trim. |
| Iron (items) | `#394a50 #577277 #819796` + a `#7a4841` rust fleck | Iron ore, ingots, plates, gears. |
| Steel (items) | `#819796 #a8b5b2 #c7cfcc #ebede9` + a `#4f8fba` sheen | Steel ingots, beams, drill bits. |
| Brass / hazard | `#602c2c #884b2b #be772b #de9e41 #e8c170` | Extraction stripes (with `#151d28`), lamps, coins, rivets. |
| Copper | `#4d2b32 #7a4841 #ad7757 #da863e #e8c170` | Wire, copper ingots, pipes. |
| Rust / heat | `#411d31 #752438 #a53030 #cf573c #da863e #e8c170` | Heat-family brick, forges, magma, glowing metal. |
| Earth / rock | `#341c27 #4d2b32 #7a4841 #ad7757 #c09473 #d7b594 #e7d5b3` | Surface ground, Shallows rock, stone, bricks, decor crates. |
| Coal | `#090a14 #10141f #202e37 #394a50` + glossy `#819796` facets | Coal lumps (the facets give 4.51:1 on the `#202e37` basalt floor, 3.00:1 on `#394a50`). |
| Slag | the coal ramp + `#752438` bubbles | Slag. |
| Cooled ember ingot | the coal ramp + `#752438` cracks | A Molten ingot that cooled. |
| Foliage | `#19332d #25562e #468232 #75a743 #a8ca58 #d0da91` | Scrub, moss, glowcap stems. |
| Fungal glow | `#402751 #7a367b #a23e8c #c65197 #df84a5` + lime `#a8ca58 #d0da91` | Glowcaps, spores, resin highlights. |
| Resin / amber | `#884b2b #be772b #de9e41 #e8c170` | Sapstone coating, resin, insulation. |
| Cobalt | `#172038 #253a5e #3c5e8b` + a `#4f8fba` highlight | Cobalt ore, ingots, drill-head teeth. Nothing lighter than `#4f8fba`, except 1–2 px of `#a8b5b2` shine at the upper left of a cobalt item (see "Items"). |
| Crystal | `#4f8fba #73bed3 #a4dddb #ebede9` | Chorus crystals, charge glow. Nothing darker than `#3c5e8b` except the outline. |
| Alien machine | `#19332d #202e37 #394a50 #577277` + `#a4dddb` light | Alien Strata stone, conduits, the Attuner, nodes, the Heart. |
| Water | `#172038 #253a5e #3c5e8b #4f8fba` + `#a4dddb` glints | Fungal pools. |
| Magma | `#411d31 #a53030 #cf573c #da863e #e8c170` + `#ebede9` hottest | Magma channels, hot ingots. |

### Layer moods

Each layer owns a floor hue and an accent no other layer uses. Revealed rock must never look like
unrevealed void, so:

- The **floor base** reaches at least 1.4:1 against the darkness tint `#090a14`. The second floor
  colour is for 1 px cracks only.
- Every rock cell that borders floor gets a **lit lip**: 1–2 px along its top edge in the lip colour.
  Wall interiors may fade toward the tint.
- One **darkness tint**, `#090a14`, on every layer, and never used as a terrain fill.
- Heat machines show a `#e8c170` / `#ebede9` white-hot core so they outshine the magma.

| Layer | Floor base (contrast on `#090a14`) | Cracks / joints (1 px) | Rock lip (contrast on its floor) | Wall interior | Accent (this layer only) |
|---|---|---|---|---|---|
| 0 Surface | ochre gravel `#c09473` with `#ad7757 #d7b594` | — | sandstone tops lit from the upper left | cliff `#7a4841 #4d2b32` | warm daylight, no darkness |
| 1 Shallows | umber `#7a4841` (2.66) speckled `#ad7757` | `#4d2b32` | `#ad7757` (1.96) | `#4d2b32 #341c27` | lantern lamps `#de9e41` |
| 2 Fungal | violet `#402751` (1.53), dark green moss `#25562e` | `#1e1d39` | plum `#7a367b` (1.62) | `#241527 #1e1d39` | magenta `#c65197`, lime `#a8ca58` |
| 3 Crystal | navy `#253a5e` (1.73) | `#172038` | `#4f8fba` with `#73bed3` veins (3.24) | `#172038 #10141f` | cyan `#73bed3` with `#ebede9` glints |
| 4 Magma | basalt `#202e37` (1.42) | `#151d28` | `#577277` (2.71) | `#151d28 #10141f` | magma `#cf573c #da863e` |
| 5 Alien | green-grey slabs `#394a50` (2.13) | `#19332d` / `#25562e` joints | `#819796` (3.00) | `#202e37 #151d28` | an `#a4dddb` core inside `#25562e` glass |

The table is what the code-drawn terrain uses (`TERRAIN_PAL` in `src/render/terrain.ts`). The
PixelLab sheets the game draws now (after their free recolours, see "Terrain") come out like this;
three rows differ from the table, on purpose:

| Layer | Floor (tile 0) | Wall (tile 15) | Lip | Differs |
|---|---|---|---|---|
| 0 Surface | `#c09473` with `#d7b594` (7.25:1); variant sheets shift and thin the `#d7b594` dashes and add pebbles | pale sand tops `#e7d5b3`, `#7a4841 #4d2b32` faces | `#e7d5b3` | — |
| 1 Shallows | flat `#7a4841` (2.66); variant sheets add a `#4d2b32` crack and `#ad7757` specks | maroon cobble `#602c2c #4d2b32 #411d31` | `#c09473` tops over `#ad7757` (2.73 and 1.96 on the floor) | — |
| 2 Fungal | `#402751` (1.53), flat; variant sheets add `#1e1d39` cracks and `#25562e` moss | `#241527` | `#7a367b #a23e8c` | — |
| 3 Crystal | `#253a5e` (1.73), flat; variant sheets add a `#172038` crack and `#3c5e8b` specks | `#172038 #10141f` | `#a4dddb` over `#3c5e8b #4f8fba` | The lip is pale aqua, brighter than the table's `#4f8fba`; it can compete with chorus deposits. |
| 4 Magma | `#202e37` with `#151d28` (1.42) | slate column tops `#577277 #394a50` over `#10141f` | — | Hot ground and its magma edge use `#602c2c #4d2b32` so scorched ground stays apart from Heat brick. The magma's base tile has no white-hot pixel; each of its variants carries one, each in its own place. |
| 5 Alien | `#577277` slabs (3.83) with `#25562e` joints | `#394a50 #202e37` | `#819796 #c7cfcc` | One step lighter than the table: the floor is the belt's rung colour and the wall its lane colour, hence the belt contrast fix (see "Code-drawn art, as built"). The joints are the layer's dark green (1.67:1 on the slab), on the conduit sheet too. |

### Machine families

Each family's accent is a colour **and** a pattern, and no two families share one, so a player can
read a factory from its colours at 1×: a Miner never reads as a Company building, a Generator never
as a Smelter. The diagonal hazard stripes belong to Extraction alone: Company sprites and the Engine
Node never use them.

| Family | Machines | Accent: colour + pattern |
|---|---|---|
| Extraction | Miner, Fungus Harvester, Spore Collector | diagonal `#de9e41` / `#151d28` hazard stripes on the rim only |
| Company | HQ, Depot, Shipping Terminal, Freight Elevator, Assay Lab, Company Chute | flat `#de9e41` roof panels with `#ebede9` stencils |
| Fabrication | Press, Assembler, Precision Assembler | `#577277` / `#819796` steel with `#be772b` rivet dots |
| Chemistry | Washer, Separator, Spore Filter, Stabilizer | glass tanks of amber, lime or blue fluid behind dark blue panes (`#172038`–`#4f8fba`) with an `#a4dddb` glint; no `#73bed3` glass but the Stabilizer's glow (below) |
| Heat | Smelter, Foundry, Pressure Forge, Cooling Bath, Thermal Extractor | `#752438` / `#a53030` brick with a `#e8c170` mouth on the top face |
| Power | Combustion Generator | `#202e37` iron drum, `#da863e` copper pipes, a smokestack |
| Crystal | Crystal Cutter, Crusher, Charger, Overcharger, Resonance Tap | `#202e37` steel with `#73bed3` coils; never `#a4dddb`, the Alien light |
| Alien | Attuner, Engine Node, the Heart | `#394a50` / `#19332d` stone with `#a4dddb` light |

- **Crystal and Alien** both glow blue-green, so they are told apart three ways: colour (cyan
  `#73bed3` coils against aqua `#a4dddb` light), material (dark steel against green-grey stone) and
  pattern (coils against rings). The art director's redo moved every PixelLab Crystal machine's
  `#a4dddb` to `#73bed3`.
- **Chemistry** machines share a family, not a silhouette: the Washer is a round tub of blue water,
  the Spore Filter glass towers of lime fluid, the Separator a tank pair (amber resin left, deep blue
  right) and the Stabilizer a square glass chamber. The PixelLab Stabilizer's chamber glows
  `#73bed3` / `#4f8fba` round an `#ebede9` core, the pale cyan it damps (it read as a Heat machine in
  amber and white); its frame stays Chemistry.
- **No family:** logistics pieces and utilities. The Sequencer is drawn as an alien switch box (stone
  with two pale aqua side lamps), because it only works on the Alien Strata. The Shield Wall's cyan
  band and the Sorter's status pixels are utility marks. The copper windings on the Charger,
  Overcharger and Resonance Tap are copper wire, a material, in the coil pattern, not the Power
  family's pipes.
- The Drill is in no family: company-yellow housings with hazard stripes on the rim, as the art plan
  drew it.

## Grid and sizes

| Thing | Size (px) | Notes |
|---|---|---|
| Tile | 16 × 16 | Everything snaps to it. |
| 1×1 building | 16 × 16 | Lamp, Storage Crate, Shield Wall, Foundation, Unloader, Sequencer, Company Chute. Belts, splitters, crossings and sorters are code-drawn (see "Code-drawn art, as built"). |
| 2×2 machine | 32 × 32 | Body 28–32 px with a 0–2 px transparent margin so neighbours read apart; no overhang. One sprite for all facings: a plain, symmetric south face, every light spot on the top face, and a top-view shape in the central ~20 px that no other machine shares (drum, twin rollers, coil, stack, tank pair). |
| 3×3 building | 48 × 48 | HQ, Depot, Terminal, Elevator station, Assay Lab, Engine Node. The elevator station leaves a dark square pit of at least 14 × 14 px for the cab. The PixelLab bodies are 35–42 px wide, bottom-centred, so their pit and chutes come from recipe anchors in `atlas.json` (see "Pipeline"): the renderer reads the station's pit; the chutes don't start from their anchors yet, so the art station's east chute floats about 4 px off its body (open). |
| The Drill | 80 × 80 | 5×5. Two states: working, and broken (a hand edit of the working sprite, so it is the same machine). A round bore of at least 24 px for a code-drawn bit (the PixelLab Drill's is 27 px, its recipe's `_bore`; the bit isn't drawn yet). |
| The Heart | 112 × 112 | 7×7. Two states: dormant, and awake (the dormant sprite recoloured by hand). The art is 87 × 88, centred with 12 px clear on every side; its recipe's `core` [47, 46, 17, 18] is the gem. |
| Item icon | 16 × 16 | Opaque art inside the central **12 × 12** (14 on one axis for steel_beam, drill_bit, cobalt_drill_head and copper_wire), so the belt shows around it. Shown 1:1 on belts and in UI (UI may draw 2×). |
| Deposit decal | 16 × 16 | Half-buried ore chunks spread to the tile edges; 3 variants per ore. |
| Decor prop | 16 × 16 or 32 × 32 | Non-blocking dressing (bushes, supports, crystal clusters), always dull. The manifest says which names are 32 × 32, and so does the data (`TALL_DECOR` in `src/data/layers.ts`). Each layer weighs its names (`LAYERS[].decorWeights`, the 32 px prop always the lightest: 1 crate stack in 12 props on the Surface, tall props 1 in 8 on the Shallows); map generation gives each name its weight's share of the layer's props to within one, ranking the prop cells by a second hash, and no two 32 px props stand within 2 tiles of each other (the second becomes a 16 px prop). On seed 20261030 the Surface has 144 props with 11 crate stacks, and the Shallows 52 plus 21 amber, 6 of them tall. Drawn standing bottom-centred on its tile, so a 32 × 32 prop overhangs 8 px each side and a tile upward, and stands in the back-to-front pass with the buildings. A 32 × 32 prop stands 24–28 px tall (code-drawn; the PixelLab ones are 22–30). It is left out wherever its visible pixels (`spriteBox`) would reach another tile that holds a building or a planned ghost or isn't open floor: unrevealed, rock, water or magma, a Foundation or a conduit channel (ore counts as open floor). So a prop never covers what the player builds and never hangs over the dark. A 16 px prop stays inside its own tile, so the check doesn't apply to it; like all decor it isn't drawn under a building, a Foundation or a conduit. |
| Portrait | 48 × 48 | Mags on the radio. |
| Title art | 320 × 180 | `title_art`, packed into the atlas like any other sprite; `loadArt` cuts it out as an image of its own for the title screen, so nothing requests a separate title file. The title screen draws it whole, centred, at the largest whole-number scale in screen pixels that fits the window (4× at 1280 × 720, 1366 × 768 and 1440 × 900, 5× at 1600 × 900, 6× at 1080p, 8× at 1440p, 12× at 4K), with its edges extended into the margins: `#172038` above, `#151d28` below, each side's edge column stretched sideways. A 25% `#090a14` veil covers it all. The logo and subtitle follow the art (its rows 14 and 25), so they sit on the dark sky band at every size. |
| Favicon | 32 × 32 | `public/favicon.png`, linked from `index.html` (the build rewrites it to `./favicon.png`). Apollo only, no `#090a14`, alpha 0 or 255: the mountain in cutaway, a sunlit sandstone peak with a brass headframe, the strata going down (umber, violet, navy, machine stone), a 1 px shaft with a brass cab and the Heart at the bottom (`#ebede9` centre, `#a4dddb` core in `#25562e` glass). Its generator stayed outside the repo, so change it by hand (pixelart_workbench). |
| Terrain | 16 px Wang sets | See "Terrain" below. |

Whole pixels only: no fractional positions, no rotation of pixel art, scaling only by whole factors.
Machine facing is shown by a code-drawn chute at the output port (the side port alone on the
Thermal Extractor), never by rotating the sprite. The Combustion Generator outputs nothing, so it
has no chute and no facing that matters.

## Perspective, light and outline

- High top-down 3/4 view: you see the top of a machine and a sliver of its front (south) face. Every
  object prompt says "high top-down 3/4 view, flat top and thin south face", and every re-roll is
  anchored on approved sprites, so the angle never drifts from job to job (the 48–112 px jobs ran
  unanchored: 32 px anchors would have shrunk them).
- The south face shows for every facing, so it is plain plating: no door, intake or furnace mouth.
  Those go on the top face.
- Light comes from the **upper left**. Top faces lightest, south faces mid, east/shadow faces darkest.
- Shadows on the ground are drawn by the renderer (the sprite's silhouette in `#090a14` at 35%,
  offset 2 px right and down), never baked into sprites. `art:build` doesn't strip baked shadows:
  none of the PixelLab sprites came back with one (M1 checked all 64 candidates), so stripping stays
  an open pipeline item.
- Outline: selective on machines and buildings, using the darkest color of the object's own ramp;
  `#090a14` only where the silhouette meets the darkest background. Items get a closed outline
  instead (below). No pure black anywhere.
- Every machine has a "light source" spot (furnace mouth, indicator lamp, glowing coil) on its top
  face that the renderer lights up while the machine works ("Light-spot glow" in "Code-drawn art, as
  built"). Code-drawn sprites carry their spots (`fallbackLights` in `src/render/fallback.ts`). Atlas
  art carries the spots its recipe's `light` key puts on the lit lamp or window pixel, which
  `art:build` writes into `atlas.json` "lights": 29 of the 39 building sprites have them. The Press
  has none (its work is the die, with no lamp), and neither do the Depot, the Elevator station, the
  1×1 pieces without a lamp (Chute, Crate, Foundation, Shield Wall, Unloader) or the dead states
  (`b_drill_broken`, `b_heart_dormant`). Art without a spot gets no glow rather than a misplaced one.

## Items: follow the rock

| Stage | Look |
|---|---|
| Raw ore | rough, irregular lump; dull; ore color in flecks on rock color |
| Washed / cleaned | same lump, rounder, no rock, ore color pure, one highlight |
| Smelted ingot | trapezoid bar, strong top highlight |
| Pressed part | crisp geometry (square plate, gear with 6 teeth, coil, I-beam) |
| Assembled part | two or more materials, a bright detail (rivets, a copper winding, a lens) |
| Exotic | glows (cyan charge, orange heat, teal alien) or wears a casing |

- **Outline:** a closed 1 px `#090a14` outline all the way round (2.13:1 on the belt), plus a
  highlight at 3:1 or better against the belt (`#819796` is 3.00:1), so dark items never vanish on a
  dark belt.
- **Envelope:** opaque art within 12 × 12 (14 on one axis for the four long items). PixelLab ignores
  size hints, so `art:build` checks it and fails anything bigger.
- **Contrast:** every item has at least 3 px at 3:1 against the belt; every deposit has at least
  3 px at 3:1 against each floor it appears on and against the ore bed under it. Ratios are taken to
  two decimals: `#819796` on the `#394a50` belt is 2.996:1 and counts as 3.00.
- **Cobalt** can't reach 3:1 on its own ramp (`#4f8fba` is 2.63:1 on the belt), so a cobalt item
  may carry 1–2 px of `#a8b5b2` shine (4.37:1) at the upper left, and needs 2 px at 3:1 instead of 3.
  Crystal items never use grey, so the two stay apart.
- **Look-alikes** are told apart by material: the Heat Shield's tile faces are aggregate browns
  (`#7a4841 #ad7757`, the Aggregate it is made from), the Reinforced Plate stays steel. Slag and the
  cooled ember ingot sit in the coal ramp with `#752438` bubbles or cracks, so neither reads as iron.

Code effects layered on items: charged items pulse cyan, hot items shimmer (1 px orange flicker and
rising sparks) while they are Molten, unstable items flicker. These are drawn by the renderer, not in
the sprite.

## Deposits and decor

- Only resources glow or use an ore's bright colours. Decor stays dull: its layer's terrain ramp
  only, no glow, no ore or hazard colours, and at most one muted non-ore accent per layer. So no
  glowing mushrooms that aren't glowcaps, no bright crystals that aren't chorus, no hot rocks that
  aren't emberite, no aqua glass that isn't engine glass. The one exception is on purpose:
  `x_l1_amber`, rock sealed in Sapstone's amber, appears only around the Shallows bore site as the
  first sign of the strange material seeping up from below.
- Deposits are half-buried chunks spread to the tile edges, never one centred lump (a 4×4 patch of
  centred lumps reads as a grid of loose items). The renderer draws a darker ore-bed tint under the
  patch (on the Alien Strata's PixelLab slabs it is `#394a50`, 1.80:1; `#202e37` there read as a
  pit, and stays only on the code-drawn floor). Each tile's decal steps to the next variant, at most
  twice, while it matches the first pick of the same ore's west or north neighbour, so a patch
  never repeats one decal along a row, and shifts by a seeded ±3 px, never toward a side whose
  neighbour isn't ore, so it stays on its bed. Single-lump variants are always mixed with two spread
  ones.
- **Deposits on the Shallows floor** (`#7a4841`, where `#819796` is only 2.40:1) take `#a8b5b2`
  glints (iron, coal) or `#e8c170` glints (copper, the top of its own ramp): at least 3 px at 3:1 on
  the umber floor. Every Thrumstone variant carries `#a4dddb` ring grooves, so no patch reads as plain
  grey pebbles.
- **Decor accents**, one muted colour per layer at most, never an ore's:

  | Layer | Accent | Where |
  |---|---|---|
  | 0 Surface | dry scrub green `#25562e #468232` | the bush and grass only; crates and the survey flag are wood |
  | 1 Shallows | rusted iron `#602c2c #884b2b` | the minecart and the support straps |
  | 2 Fungal | moss `#19332d #25562e #468232` | moss |
  | 3 Crystal | blue-grey rock `#202e37 #394a50 #577277` | the crystal props, in rock colours, never the chorus ramp |
  | 4 Magma | dull maroon `#241527 #411d31` | cracks; no orange anywhere |
  | 5 Alien | none | |

- **Decor never uses `#090a14`**, the darkness tint, on any layer, so a prop never reads as a hole
  into unrevealed rock. Its edges are the layer's darkest wall colour: `#341c27` on the Shallows,
  `#241527` on the Fungal Caverns, `#10141f` on the Crystal Depths and the Magma Shelf, `#151d28` on
  the Alien Strata; the amber-sealed rock's closed outline is `#4d2b32` / `#341c27`. No glow colours
  either: no `#e8c170` lamp gold, no `#a4dddb` / `#ebede9` engine-glass pixels. Every prop keeps the
  rule, code-drawn and PixelLab alike (the last eleven PixelLab outlines moved in review 3).
- Decor stays in its layer's ramp: the tall mushroom's stalk is shaded plum (`#a23e8c` lit left,
  `#402751` right, `#7a367b` between), not steel grey, and the geode is a dull rock (`#577277` /
  `#394a50` rim) round a `#172038` hollow, not a pale ring round a hole.
- Decor crates are wood (`#7a4841` / `#ad7757`, the crate stack's planks `#ad7757`) with a soft
  `#4d2b32` outline and `#c09473` tops, and the survey flag's pennant is wood too; `b_crate` is
  steel with one flat company-yellow band.

## Light and darkness

Underground layers draw a darkness overlay over the world; the Surface (ambient 1) has none. A
tile's light is the brightest source that reaches it (sources don't add up), never below the layer's
ambient: 0.32 / 0.28 / 0.26 / 0.36 / 0.30 from the Shallows down. A source of radius r and strength
s gives s × (1 − (d / r)^1.6) at distance d. Ore, magma and awake conduit light come from every
other revealed tile (a checkerboard). Awake conduit is bright enough that a belt laid along it sits
in the 0.35 band, where its rungs and direction read (DECISIONS #99); dormant conduit gives no
light. The sim recomputes light every 20 ticks. As built (`src/sim/env.ts`):

| Source | Radius (tiles) | Strength |
|---|---|---|
| Lamp | 6 | 1 |
| Working machine (2×2 or larger, worked in the last second) | 4 | 0.85 |
| Idle machine (2×2 or larger) | 2.6 | 0.6 |
| Any other 1×1 building (belts and pieces included) | 1.6 | 0.5 |
| Fixed building (HQ, Depot, Terminal, Elevator station, Drill, Engine Node, Heart) | its size + 2.5 (5.5 for a 3×3) | 0.95 |
| Glowcap patch | 3 | 0.7 |
| Chorus Crystal | 2.5 | 0.6 |
| Emberite | 2.5 | 0.6 |
| Thrumstone | 2 | 0.5 |
| Magma | 3.5 | 0.85 |
| Awake conduit (`CONDUIT_LIGHT_R`, `CONDUIT_LIGHT`) | 2.5 | 0.7 |
| Dormant conduit | none | — |

- Light is taken at tile **corners** (the mean of the four tiles around each corner; unrevealed
  tiles count as 0) and banded: **≥ 0.7 → tint alpha 0, ≥ 0.45 → 0.35, ≥ 0.2 → 0.65, below → 0.85**
  of `#090a14`. Inside a tile the corner bands are interpolated per pixel and quantized with a
  4 × 4 Bayer matrix anchored to **world** coordinates, so the pattern never crawls when the camera
  pans. Never a smooth gradient: pixel-art lantern light. A layer's ambient light falls in the 0.65
  band, so an unlit revealed cave shows through at 35%.
- Unrevealed tiles are the tint at **1.0**, solid `#090a14`, except beacons and awake conduit veins
  (below). One tint on every layer: `#090a14`.
- The 4^4 = 256 corner-band combinations (plus a solid one) are pre-rendered once as 16 × 16 stamps,
  and a layer-sized tint canvas is patched only where a tile's stamp changes (the terrain's
  dual-grid trick again).
- Drawn after the darkness, in order: the emissive pass (awake conduit glass, then the veins of
  awake conduit still in the rock, then lit buildings' light spots), the hazard overlays, then
  survey markers, beacons (the bore site's; the Heart's and the sleeping Engine Nodes' while the
  Governor is open: "Code-drawn art, as built"), status icons, the selection and the placement
  ghosts. Awake glass is never drawn under anything that stands on its tile, and stays 1 px back
  from every edge that touches a standing building, built or planned, so a chute tip shows. Items
  hanging into the tile from a belt are cut out on a 16 px scratch tile with `destination-out`, so
  two overlapping cut-outs stay cut (an even-odd clip cancelled them). With the PixelLab conduit
  sheet the glass is drawn above the darkness from a layer-sized glass canvas cached with the
  terrain (`conduitGlass`: the sheet's `#a4dddb`, `#73bed3` and `#ebede9` pixels of revealed, awake
  floor conduit), then its running 2 × 2 pulse, so the awake glass reads lit. Survey markers show
  through as small pulsing icons, and beacons through rock as well as darkness.
- **Veins.** Awake conduit in unrevealed cells or under rock is drawn above the darkness as a dim
  vein: 2 px of `#73bed3` (alpha about 0.30–0.55) with a 1 px `#a4dddb` core (0.25–0.55), breathing
  on the beacons' 1.67 s beat, from each cell's centre to every awake neighbour and 8 px on into a
  lit channel cell, so it meets the glass where the cave opens (it runs where the channel's glass
  does: 3 px into the cell with the sheet, down the middle of the code-drawn channel). Never over a
  cell anything stands in. So a node's rings visibly run on through the mountain, toward the far
  nodes and the Heart.

## Effects (code-drawn, palette colors)

As built (`src/render/world.ts` emitParticles, the event bursts in `src/app/app.ts`):

| Effect | Look |
|---|---|
| Sparks | `#e8c170 #da863e` 1 px, thrown up and falling, from working Smelters, Foundries and Pressure Forges |
| Smoke | `#394a50 #577277` 2 px puffs from the heat machines; `#394a50 #202e37` from the generator's stack |
| Steam | `#c7cfcc #a8b5b2` 1 px from Washers and Cooling Baths; `#a8b5b2` from presses and assemblers |
| Heat | `#da863e #cf573c` rising from the Thermal Extractor; `#cf573c` motes off hot ground; `#da863e #e8c170` embers off magma |
| Spores | `#c65197 #a8ca58` 1 px motes drifting where spores are thick; `#c65197` around Spore Collectors |
| Glints | `#ebede9` single pixels on Crystal Depths ore; `#a4dddb` on water; `#a4dddb` flickers on chargers, overchargers and taps |
| Dust | the Surface's wind-blown `#e7d5b3` motes; miners and harvesters kick up their layer's fleck colour |
| Placing | a burst of `#d7b594 #a8b5b2` motes (4 + 2 × the footprint's side) with the place sound |
| Digging | chunks in the layer's wall and floor colours, 2 px |
| Survey | three rings of `#73bed3 #a4dddb` motes |
| Shatter | `#a4dddb #ebede9 #73bed3` when Overcharged Crystal breaks on a belt |
| Ring waking | 2–4 one-pixel `#73bed3 #a4dddb #ebede9` motes rise off each newly lit conduit tile (fewer when a ring lights many), a 2 px white or cyan mote on every third tile, and the pulse sound |
| Sales | `+$N` floats in `#e8c170` over the Terminal or Chute, one per second per seller |

Conduit pulses run along awake conduits (`#a4dddb` / `#ebede9`). The interference arcs, ring and
shield rectangles are in the overlay rows of "Code-drawn art, as built". Screen shake (1.6 at a
breakthrough, 2.5 at the ending) can be turned off in the settings.

### The ending

The ending sequence (PLAN §5.14, DECISIONS #103) is all code-drawn in palette colours, at the
window's default zoom and on whole world pixels, so the grid never shears as the camera rises.
As built (`src/app/ending.ts`, the ending passes in `src/render/world.ts`, `drawLayerCard` in
`src/ui/hud.ts`):

| Element | As built |
|---|---|
| Flash | `#ebede9` over the screen at 0.5 as the Heart wakes, gone after 2.5 s |
| The Heart waking | two rings swelling out of its glass core (the `core` anchor) from 12 to 120 px on the beacons' 1.67 s beat, half a beat apart, fading as they go: a 1 px ring, `#ebede9` for the first quarter of its run and then `#a4dddb`, with a 1 px `#73bed3` ring 2 px inside it, each pixel drawn once. Above the darkness |
| Light from the shaft | as the camera reaches a layer, revealed tiles within 26 tiles of the station the shaft comes into (the Heart on the Alien Strata) are lit to at least 0.5 over 1.8 s, so the cave shows in the 0.35 band; unrevealed tiles stay solid `#090a14` |
| Rock between layers | a 96 px band: the rock of the layer above at the top and of the layer left behind at the bottom, each in its own two top tones, thinning in the world-anchored Bayer order into `#090a14` across the middle, with wavy edges, two broken seams in each rock's face colour and a few flecks (none in the dark, where they would read as stars); drawn once per pair of layers. Up the middle the shaft's light: 3 px of `#73bed3` with a 1 px `#a4dddb` core and a 12 px `#ebede9` pulse running up it |
| Layer card | the breakthrough card: a `#de9e41` header (the depth; "DAWN" on the Surface), the name in `#ebede9` and the layer's line in `#a8b5b2`, between 1 px `#de9e41` rules on `#090a14` at 0.85 |
| Night | `#172038` over the Surface at up to 0.55 as the camera comes up into it, lifting as the dawn comes |
| Dawn sky | over the map's width, above its north edge (the horizon): solid bands from `#e7d5b3` at the edge through `#e8c170`, `#de9e41`, `#da863e`, `#cf573c`, `#a23e8c`, `#7a367b`, `#402751` and `#1e1d39` to `#090a14`, each dithered into the next across the middle of its step in the world-anchored 4×4 Bayer order, reaching 96 px up at full dawn. The camera shows about 56 px of it |
| Sun | a disc of radius 9, `#ebede9` inside a 1 px `#e8c170` rim, in a dithered `#e8c170` halo 3 px wide (6 in 16), rising from under the horizon until three quarters of it show, 8 tiles east of the old Drill site |
| Dawn on the ground | `#e8c170` pixels in the world-anchored 4×4 Bayer order, 3 in 16 at the north edge thinning to 1 in 16 by 320 px south, over the terrain and what lies on it, under everything that stands |
| Closing text | `#ebede9` lines, the last in `#e8c170`, on a `#090a14` band at 0.75 across the screen at 30% of its height |
| Thank-you card | a titled panel, "The Mountain Is Awake", 260 px wide; its last line in `#e8c170`, then "Keep building (free play)" as an active button |

## UI

- Drawn on the canvas with the bitmap font (`src/ui/font.ts`, 5×7 glyphs, proportional) at a
  whole-number UI scale.
- Panels (as built, `src/ui/ui.ts`): a 1 px `#090a14` frame round a `#151d28` fill, a 1 px `#394a50`
  highlight along the top and left and a 1 px `#10141f` shadow along the bottom and right. A titled
  panel has an 11 px `#202e37` header with a `#394a50` underline, two `#577277` rivets and its title
  in `#e8c170` over an `#090a14` shadow.
- Buttons: `#202e37` in an `#090a14` frame, a `#577277` top edge and a `#10141f` bottom edge, label
  `#ebede9`; hovered `#394a50`, pressed `#10141f`, disabled `#151d28` with a `#577277` label (a
  disabled button still shows its tip, which says why). Danger buttons are `#752438`.
- Tooltips: `#202e37` in an `#090a14` frame with a `#577277` top line; the first line `#ebede9`, the
  rest `#a8b5b2`. A tip about something in the world sits above-right of it, flips left at the
  screen edge and stays below the top bar.
- Text `#ebede9`, secondary `#819796`, disabled `#577277`.
- Accents: money `#e8c170`, power `#73bed3`, good `#a8ca58`, warning `#de9e41`, bad `#cf573c`. So the
  top bar's depot-strip `+N` is `#a8ca58`; a shaft running at 90% of its rate or more turns
  `#de9e41`; shortfalls (none spare above, what a plan lacks, node jams, station stalls) are
  `#cf573c`.
- Selection in the world is a blinking 1 px `#ebede9` / `#e8c170` outline, never an amber fill:
  amber already means the Company, the Shallows' lamps and money. The ban is for world selection
  only: an active UI button or tab is filled `#be772b` with an `#e8c170` top edge and an `#090a14`
  label (hovered `#de9e41`).
- Status icons over machines use shape *and* color (colorblind safe): see "Code-drawn art, as
  built".

## Code-drawn art, as built

Drawn by the renderer (`src/render/`), none of it from PixelLab; pixel-art-studio can hand-draw any
of it for free. This table records the code as built: change the two together.

| Thing | Look |
|---|---|
| Conveyor | A 12 px `#394a50` lane between steel rails, each a 1 px `#151d28` outer edge and a 1 px `#819796` lit top: the dark edge reads on light floors and the lit top on dark ones, so a belt never sinks into its floor (the lane's `#394a50` is the Alien Strata's wall and close to the Magma, Crystal and Fungal floors). Items keep their 12 × 12 art inside the lane. `#577277` rungs every 8 px, each bowed forward into a blunt `>`, 1 px over the middle 6 px of the lane and 2 px over the middle 4, always on, so a still belt shows its direction at zoom 2. The express chevron stays the Express Belt's own. Curves bend the lane round the inner corner. |
| Express Belt | The conveyor with `#3c5e8b` rungs and a `#73bed3` `>` chevron, 3 px deep over the middle 6 px. |
| Insulated Belt | The conveyor with padded rails: `#884b2b` outside, then `#be772b` quilting with a `#884b2b` stitch every 4 px, around a 12 px lane. |
| Belt motion | An 8 px pattern period drawn as eight 1 px frames. The frame is the whole number of pixels the belt has run (24 px/s on conveyors and insulated belts, 48 on express belts), and items are placed from the same count, so rungs and items move in lockstep. |
| Splitter, Crossing, Sorter | The conveyor lane under an `#819796` housing (corner blocks lit `#a8b5b2` top-left and shaded `#577277` bottom-right, a solid wall on a closed side) with `#e8c170` arrows at the exits. A crossing's lane stands still; a sorter shows the middle 12 × 12 of its filter item. |
| Output chute | 6 × 4 px, `#202e37` with an `#e8c170` arrowhead in 2 px strokes, centred on the output port tile (front-right of a 2×2, front-centre of a 3×3), overlapping the body 3 px and standing 1 px proud. Rows from the tip, D the chute and A the arrow: `DDAADD`, `DAAAAD`, `AAAAAA`, `AADDAA` (a 2 px tip proud of the body, 4 and 6 px rows, two 2 px barbs either side of a 2 px notch). Only buildings with a front output get one: machines (not the Thermal Extractor), miners, collectors, elevator stations and Engine Nodes. Not the Combustion Generator. |
| Side chute | The same shape with an `#a8b5b2` arrow, on the left face's front-most tile: the Separator (Resin), the Thermal Extractor (Slag) and the Engine Nodes (wrong items). |
| Status icons | 7 × 7, shape and colour on a dark `#151d28` badge with an `#090a14` outline, centred on the top edge of a 2×2-or-larger building and drawn after the darkness: ○ no input `#819796`, ✕ blocked (output full) `#cf573c`, ⚡ no power `#73bed3`, ≈ slowed `#df84a5`, ! can't work here `#e8c170`, ▲ no recipe `#de9e41`, ‖ paused `#c7cfcc`, ≠ jammed `#da863e` (a belt holds an item the machine never takes, or feeds its front). Working and idle machines show none; a miner or machine waiting on a generator that holds all the fuel it can is idle. Of the fixed buildings only a jammed Drill, Heart or elevator station (a belt pushing into its front) wears one, the `≠`. Each belt of a head-on pair wears the `≠` in the middle of its tile (offset 4, 4), between the stuck item and the one behind it, covering at most 2 px of either. |
| Ghosts | The sprite or belt tile with every other pixel (a checkerboard on the tile grid) replaced by `#a8ca58` (valid), `#cf573c` (blocked) or `#4f8fba` (planned); a building ghost also gets a 1 px dashed outline in the same colour and shows its chutes. |
| Selection | A blinking 1 px `#ebede9` / `#e8c170` outline just outside the footprint, no fill. The hovered and the selected built building also get the placement ghost's port brackets on their port cells, `#e8c170` on the output and `#a8b5b2` on the side output (`drawPortMarks`; the chutes aren't redrawn above the darkness). |
| Beacons | Above the darkness and through unrevealed rock (`WorldRenderer.beacon`). The open project's bore site, and the Heart while the Governor is open, until its centre tile is revealed: a ring of 48 `#de9e41` dots that swells from 6 to 36 px out and fades, round a 5 × 5 `#de9e41` pip with a 3 × 3 `#e8c170` core. A sleeping Engine Node, until its first Heartstone: a ring of 32 `#be772b` dots from 4 to 22 px, starting at 60%, round a 3 × 3 `#be772b` pip with a `#de9e41` centre; a node already in sight keeps only that ring (a pip would sit on its sprite), centred on its glass core's light spot and starting just outside it. One 1.67 s beat for all, so the Heart and its nodes pulse together. |
| Darkness | See "Light and darkness": corner light banded to `#090a14` at 0 / 0.35 / 0.65 / 0.85 (1.0 unrevealed) through a world-anchored 4 × 4 Bayer dither. |
| Conduits | Dormant glass is dark and gives no light (with the PixelLab sheet, a dark recolour of its glass). Awake glass carries a running `#ebede9` / `#a4dddb` pulse and is drawn a second time above the darkness so it glows, never under anything standing on its tile and 1 px back from every edge a standing building touches (see "Light and darkness"). With the sheet the glass's own pixels come from the cached glass canvas (`conduitGlass`), then the 2 × 2 pulse. Awake conduit still in unrevealed cells or rock shows as a dim `#73bed3` vein with an `#a4dddb` core on the beacons' beat ("Veins" in "Light and darkness"). Awake conduit lights every other tile (radius 2.5, strength 0.7), so the glass and a belt along it sit mostly in the 0.35 band. |
| Sleeping Engine Node | Drawn as a dormant recolour of its sprite, with the dormant conduit's colour map (`#ebede9` to `#3c5e8b`, `#a4dddb` to `#253a5e`, `#73bed3` and `#4f8fba` to `#172038`, `#a8ca58` and `#d0da91` to `#25562e`; `dormantCopy`, cached per image and rectangle), until its first Heartstone or the ending. While it is fed before then its light spot still glows on the dark core. |
| Light-spot glow | A lit building's light spots glow above the darkness: a core pixel in the next brighter colour on the spot's own ramp (`#da863e` → `#e8c170`, `#73bed3` → `#a4dddb`, `#a4dddb` / `#e8c170` / `#df84a5` / `#d0da91` → `#ebede9`, and so on) at alpha 0.4–0.9, inside a 1 px plus in the spot's colour at 0.2–0.5; spots of radius 5 or more also get a ring 2 px out at 0.1–0.3. It breathes on a 2.4 s sine, phase-shifted per building, and follows the 1 px work shudder. Lit: machines that worked in the last 0.3 s, lamps always, Resonance Taps with links, Spore Filters while they run, Engine Nodes while active, the Heart after the ending; never paused or planned buildings. The spots are `fallbackLights` for code-drawn sprites and `atlas.json` "lights" for atlas art (see "Perspective, light and outline"). |
| Elevator cab | Drawn into the station's pit: a `#de9e41` cage with up to 8 cargo pips while it dwells, a running `#394a50` cable while it is away. On the PixelLab station the pit is its `pit` anchor (`[13, 21, 21, 15]`, from `atlas.json` "anchors"): no black fill (the art's pit is dark already), the cab 1 px inside it (19 × 13 at `[14, 22]`), bars at x 19, 23 and 27, the pips in 2 rows of 4 at a 3 px pitch (x 18, 21, 24, 27; y 26, 29), and the cable 2 px wide at x 23–24 from y 21 to 35. The code-drawn station, or art without the anchor, keeps the fixed rect `[16, 14, 16, 18]` with its black fill. |
| Water and magma shores | Organic: the liquid mask is interpolated between cell centres and cut at a noise-wobbled threshold, so pools and channels come out round, never square. Water gets a 1 px wet bank in the floor's crack colour, magma a `#411d31` cooled crust and a `#752438` rim. (Code-drawn where the layer has no water or magma sheet.) |
| Hot ground | Its own terrain set, `t_l4_floor_hot`. Without it, code draws 2–3 cracks of 5–10 px a tile in `#cf573c`, with `#da863e` and `#a53030` pixels and `#752438` drips below. |
| Warm ground | No terrain set: floor with one faint 3–6 px `#752438` crack a tile (one pixel `#a53030`), drawn over floor art too. Kept on purpose: warm ground matters for placement (×0.75 for most machines, ×1.5 for the heat family). |
| Hard rock | The rock art under a 1-in-4 dither (every pixel at even x and even y) of a darker colour from the layer's own rock ramp, laid only where it darkens: `#ad7757` on the Surface (2.62:1 on the `#e7d5b3` sandstone tops, a texture rather than the screen-door mesh `#341c27` made), `#341c27` on the Shallows, `#241527` on the Fungal Caverns, `#10141f` on the Crystal Depths and the Magma Shelf, `#151d28` on the Alien Strata; never the darkness tint. The code-drawn Surface rock is darker than `#ad7757`, so without the sheet only its lip pixels take the dither. The dig cursor turns red (`#cf573c`) over hard rock. |
| Spore overlay | `#c65197` dots, a thin pattern below density 0.5 and a dense one above, on revealed open floor only (glowcap patches included), never over rock or water. |
| Heat overlay | Hot ground `#cf573c` dashes, warm ground sparse `#da863e` dots; both grey (`#577277`) on Foundations. |
| Interference overlay | Live arcs: jagged 1 px `#a4dddb` lines, re-jittered 12 times a second, one per interfering pair (drawn from the lower id to the higher). A Resonance Tap's arcs run from each machine feeding it and carry one `#ebede9` pixel travelling toward the tap, 0.8 of the arc a second, phase-shifted per pair. A dotted `#a8b5b2` rectangle, the one spanned by both footprints, where a Shield Wall blocks a pair. The ring: a dotted `#df84a5` square `INTERFERENCE_GAP` (2) tiles out from the footprint, enclosing every tile in reach, round a hovered, selected or placing sensitive machine, Resonance Tap (the ring is what it collects from) or machine that interferes while it works, shown whatever the overlay toggle says, but only once the player has reached the Crystal Depths (the first layer whose hazard is interference), so Acts I and II never show pink squares. Dotted lines are 1 px on, 1 px off, anchored to the world. |

The hazard overlays (spores, heat, interference) draw after the darkness, so they read in an unlit
cave.

## Animation

- Belts: code-drawn with an **8 px pattern period**, drawn as eight 1 px frames. The belt offset and
  every item position come from `floor(distance_px)`, so belt and items move in lockstep (24 px/s on
  conveyors and insulated belts, 48 px/s on express belts) and items never slide against the belt.
- Machines: one still sprite plus code animation while working (a 1 px shudder upward now and then
  on 2×2 machines, light spot pulse, particles from vents). Optional extra PixelLab frames only if
  budget remains.
- Elevator cab: code, drawn into the station's pit (see the code-drawn table). The Drill's bit and the
  Heart's pulse are not animated yet: the Drill and the Heart show a 3 px `#de9e41` progress bar over
  their top edge while their project runs, and the awake Heart is a recolour, not an animation
  (its white-hot gem has a light spot, so it breathes like a lamp once the Heart is awake).
  Recipes record the pit, bore and core rectangles and the chute anchor points; `art:build` writes
  the pit, the core and the chutes into `atlas.json` "anchors" (the Drill's bore is still a note),
  and the renderer reads the pit (see "Pipeline").
- `b_drill_broken` and the awake `b_heart` are hand edits of the chosen `b_drill` and
  `b_heart_dormant` (pixelart_workbench and `recolor.ts`, free, replayed as `recolor.ts` specs in
  `art/edit/d/` and `art/edit/h2/`), so each pair is the same machine. The broken Drill (101 px
  changed: dead lamps, a crack down the left housing, rust, a snapped drill string, tooth shards, the
  crown corner broken off) stands upright: pixel art can't lean. The Heart (review 3's re-roll) is
  a whole 16-tooth grey-green stone gear with a dark green glass channel round it and a faceted navy
  gem; awake (590 px changed) the gem turns white-hot and aqua (`#ebede9`, `#a4dddb`, `#73bed3`,
  `#4f8fba`) and the glass channel lights `#a4dddb` / `#73bed3`, with its light spot on the gem
  (`[55, 55, "#a4dddb", 8]`).

## Terrain: the dual grid

Each layer has one Wang tileset per terrain pair (16 tiles of 16 px). The map stores one terrain per
cell; terrain tiles are drawn on a grid offset by half a tile, each drawn tile picking its art from the
four cells around its center. The normalized sheet is `public/art/terrain/<name>.png`, 64 × 64, a
4 × 4 grid where tile index `i = NW*8 + NE*4 + SW*2 + SE*1` (1 = upper terrain) sits at column
`i % 4`, row `floor(i / 4)`.

| Set | Lower | Upper | As kept |
|---|---|---|---|
| `t_l0_ground_rock` | ochre gravel ground | sandstone cliff and boulders, lit sand tops | roll 1, recoloured: the pale gold `#e8c170` (the money and selection colour) became ochre ground and pale sand tops |
| `t_l1_floor_rock` | umber cave floor | brown rock wall with a lit tan lip | the pilot's std2, snapped and recoloured (review 3): the cream and gold lip (`#e7d5b3 #e8c170`, with `#de9e41 #d7b594` and one `#090a14`) became `#c09473` tops over `#ad7757`, the stray dark pixel `#341c27` |
| `t_l2_floor_rock` | violet cave floor with dark green moss | dark violet rock wall with a plum lip | the retry ("violet stone cave floor", "rough dark purple rock wall … shadowed crevices"); wall shadows recoloured |
| `t_l2_floor_water` | violet cave floor | still dark underground water | the retry ("still blue underground pool water with darker navy depths"), moved onto `#253a5e #3c5e8b #4f8fba` |
| `t_l3_floor_rock` | deep blue stone floor | crystal-veined blue rock wall with a mid-blue lip | roll 1; snapping had merged wall and floor, so the wall went to `#172038 #10141f` |
| `t_l4_floor_rock` | black basalt floor | basalt column wall with slate grey tops | roll 1; blue specks and violet cracks made neutral basalt |
| `t_l4_floor_hot` | black basalt floor | cracked hot ground with glowing heat cracks | the retry ("hot ground of dark maroon cracked basalt, a web of thin glowing red-orange heat cracks across the whole surface"); roll 1 only glowed at its border |
| `t_l4_hot_magma` | cracked hot ground | magma | the retry ("pool of bright orange molten lava, glowing liquid with yellow swirls and a few white-hot spots"), base `#cf573c` with `#da863e` swirls so heat machines' cores outshine it; the base tile 15's one white-hot pixel became `#da863e` (a guarded pixel patch), so pools don't show a 16 px grid of sparks |
| `t_l5_floor_rock` | grey-green machine-stone floor | machine-stone wall with a pale grey lip | roll 1; floor and wall were the same slabs, so the wall went two steps darker (`#394a50 #202e37`), and the floor's `#394a50` joints became the layer's green `#25562e`, except within 3 px of a lip, kept as contact shadow |
| `t_l5_floor_conduit` | grey-green machine-stone floor | glass conduit channel | generated with square shapes, amplitude 0; 28.7% of its pixels move far on import, kept because what remains is the L5 ramp. Its floor joints are `#25562e` too (behind a barrier, since the floor's joints and the channel's stone share colours), so the joints keep one colour along every conduit |

- **Map rule:** every 2 × 2 window of cells holds at most two terrains, and that pair has a set. So
  rock never touches water, hot ground or conduit directly, and magma only touches hot ground. Hot
  ground (2 tiles wide in play) is drawn as its own terrain. Warm ground has no set: it is drawn as
  floor with faint red cracks on top (code, see "Code-drawn art, as built"), kept because warm ground
  matters for placement, and the heat overlay marks it too.
- **Chaining:** generate each layer's floor/rock set first, read its lower base tile id and pass it
  as `lower_base_tile_id` to the layer's other sets, with identical floor wording.
  `t_l4_hot_magma` takes `t_l4_floor_hot`'s upper base id instead.
- **Transitions:** `transition_size` 0 or 0.25 only (larger values return 25 tiles instead of 16).
  Rock sets ask for the lit lip in the prompt (`transition_size` 0.25, the lip as
  `transition_description`).
- **Import** (`scripts/art/tileset.ts <tileset id> <set>`): PixelLab doesn't guarantee the tile
  order. The importer fetches the tileset image and its metadata, crops each tile's bounding box,
  requires every corner to be lower or upper (a 25-tile set with transition corners fails the whole
  import), computes `i = NW*8 + NE*4 + SW*2 + SE` (upper = 1), pastes the tile at
  `(i % 4 × 16, floor(i / 4) × 16)` and requires 16 unique indices (`--twin` fills a missing one on
  purpose). It keeps the PixelLab PNG and metadata byte for byte, writes the re-packed sheet
  unquantized to `art/raw/terrain/<set>.png` plus the recipe, prints off-palette and far-moved shares
  and the floor's contrast against `#090a14`, and renders mock previews including a random-map seam
  test. All ten sets came back with 16 combinations and no twins.
- **Free recolours** (`scripts/art/terrain-fix.ts`): a sheet is snapped to Apollo exactly as
  `art:build` snaps it, then recoloured by snapped colour, raw value and terrain region (a per-tile
  flood fill from the corners, bounded by the lip or outline colours; it fails on any leak). The
  result goes to `art/edits/terrain/`, the raw sheet stays untouched, and the recipe keeps the rules
  in `_fix` (`terrain-fix.ts --recipe <recipe>` replays it byte for byte). A rule can keep a margin
  from the other terrain (`lower+3:from=to` changes only floor pixels at least 3 px, diagonals
  counting 1, from every wall pixel of their tile, so the 2 px beside a lip stay), and guarded pixel
  patches run after the rules (`_fix.pixels`, or `--pixel x,y,#expected,#new`; a failed guard
  writes nothing). Chained sets share
  pixel-identical tiles: L2 rock and water tile 0, L4 rock and hot tile 0, hot tile 15 and magma
  tile 0 (the conduit set differs from L5 rock in 5 joint pixels).
- **Hard rock** (the map edge) is rock art under a dither of a dark colour from its own rock ramp,
  with a red dig cursor (code; see "Code-drawn art, as built").
- **Floor variety:** variant sheets named `t_<set>_v<n>` (up to `TERRAIN_VARIANTS`, 3, in
  `src/render/atlas.ts`) are copies of the set's sheet with only the plain tile edited (tile 0, or
  tile 15 for magma), touching pixels 2–13 only. A share of the plain tiles comes from the
  variants, the vertex and the variant both picked by a hash of the vertex; edge tiles always come
  from the base sheet, which is what they seam with. So one tile never paves a whole floor. Flipped
  copies are not used (they seam). The game loads only the variants the build made. Each set's share
  is its recipe's `variantShare`, written to `atlas.json`: 0.75 where the plain tile repeats like
  wallpaper, 0.25 elsewhere (open: `terrain.ts` still draws every set at 0.25 until it reads them).

  | Variants | Share | Tile | What changes |
  |---|---|---|---|
  | `t_l0_ground_rock_v1`–`_v3` | 0.75 | 0 | the `#d7b594` gravel dashes shifted 2 px and thinned, two or three `#d7b594` / `#ad7757` pebbles and a speck: the base tile repeated as a "3E3E" wallpaper |
  | `t_l1_floor_rock_v1`–`_v3` | 0.25 | 0 | a 5–6 px `#4d2b32` crack and three or four `#ad7757` specks on the flat `#7a4841` (made from the fixed sheet) |
  | `t_l2_floor_rock_v1`–`_v3` | 0.25 | 0 | a `#1e1d39` crack and `#25562e` / `#19332d` moss flecks on the flat `#402751` |
  | `t_l3_floor_rock_v1`–`_v3` | 0.25 | 0 | a 5–6 px `#172038` crack and three `#3c5e8b` specks on the flat `#253a5e` |
  | `t_l4_hot_magma_v1`–`_v3` | 0.75 | 15 | swirls from the pure-magma centres of tiles 11, 7 and 14, each with one white-hot `#ebede9` pixel in its own place (the base tile has none); tile 0 stays equal to `t_l4_floor_hot` tile 15 |

  No variants, on purpose: the Surface's rock tops (the hard-rock dither dominates), the Magma
  Shelf's floor and hot ground, the Alien floor (its slab grid is the texture) and the water set,
  whose tile 0 is the same flat floor (all-floor tiles come from the rock sheet).

## PixelLab settings

As run in session 1 (the art run). Pass the Apollo palette to every tool that takes one and quantize
again on import either way: standard tilesets refuse a palette ("palette, palette_name and
max_colors work with mode=pro only"), while `create_1_direction_object` with the palette came back
exactly on Apollo. Call `get_balance` before every batch, log each batch in `PROGRESS.md`, and run
at most 8 jobs at once. Charges post when a job completes, so with jobs in flight keep your own
count.

| Asset | Tool | Settings as run | Cost (generations) |
|---|---|---|---|
| Terrain | `create_topdown_tileset`, **standard** mode | `tile_size` 16, `view` high top-down, `shape_style` round, `enhance` false, "medium detail", "basic shading", `boundary_amplitude` 0.15 (seed 2); `transition_size` 0.25 on rock sets with the lip as `transition_description`, 0 on chained sets; no palette (snapped on import); chained per layer through `lower_base_tile_id` | 1 per set |
| Item icons | `create_1_direction_object` | `size` 16, `view` top-down, Apollo palette. I1 with the plan's descriptions came back about 14 × 14 (3 of 64 inside the envelope), so its picks were fitted with `itemfit.ts`. I2 was anchored on 8 fitted 12 × 12 icons as `style_images` (no `size`) and asked for a "black outline": 59 of 64 inside | 10 per job (64 candidates) |
| Deposits, small decor, 1×1 buildings | `create_1_direction_object` | `size` 16, `view` top-down; G1, then G2 anchored on 8 G1 picks. Art comes back at most 14 × 14 (a 1 px margin), so an edge-to-edge sprite (the Foundation) needs a free extension | 10 per job (64 candidates) |
| 2×2 machines, 32 px decor | `create_1_direction_object` | the M1 pilot at `size` 32, "high top-down 3/4 view, flat top and thin south face"; M2 and M3 anchored on 8 approved machines (Miner, Foundry, Press, Spore Filter, Cutter, Attuner, Spore Collector, Overcharger) with no `size`; prompts describe the top surface ("seen from above: two round tank lids side by side") | 10 per job (64 candidates) |
| 3×3 buildings | `create_1_direction_object` | `size` 48, 16 candidates, Apollo palette, no anchors (32 px anchors would shrink the output); bodies come out 35–42 px wide | 10 per job |
| The Drill | `create_1_direction_object` | `size` 80, 16 candidates in 4 prompt variants (rig, deck, derrick, borer); the broken state is a hand edit | 15 per job |
| The Heart | `create_1_direction_object` | H: `size` 112, 4 candidates; asked for a margin and still clipped about 7 px (all four overflowed when told to fill the frame). H2 (review 3): `size` 100, placed centred on the 112 canvas (`fit` center: the build pads, never shrinks), 16 Apollo colours of the Alien stone ramp, no style images; no "enormous", no "filling the frame" and no pipes or conduits in the prompt, and all four came back inside with 5–7 px clear. The awake state is a free recolour | 10 per job |
| Portrait | `create_image_pro` | 48 × 48, Apollo palette, `no_background`: 25 candidates, then a free touch-up | 10 |
| Title art | `create_image_pixflux` | 320 × 180, the Apollo swatch strip as `color_image`, a hand-blocked `init_image` (`title_layout.ts`, uploaded with `get_upload_url`); seeds 31101–31106 at init strength 150–350, "highly detailed" or "medium detail". Kept: seed 31106, layout v2, strength 350, medium detail, with a free cleanup (`title_finish.ts`). The top band is a dark navy dawn sky, not a pale one, so the `#e8c170` logo reads (about 9.5:1) | 1 per seed |

Lessons from the run:

- `create_map_object` in style-matching mode does not draw a building into a slot: three tries on
  the HQ (a 144 px scene with belts, a 112 px yard of approved machines, the same yard with the
  code-drawn HQ under the mask) each continued the background inside the mask. PixelLab's help
  confirmed that `background_image` is style context only. So the 3×3 buildings, the Drill and the
  Heart used `create_1_direction_object`.
- Upright subjects (jars, barrels, boilers, press frames, washing drums) come back as front
  elevations with their glow on the south face: describe the top surface instead.
- Repeated identical descriptions in one job come back as near-copies a few pixels apart (M2 lost
  about 30 slots that way), so give every slot its own wording. A prompt close to an anchor's subject
  copies that anchor, so never anchor on the sprite being re-rolled.
- Name colours the palette has: "dark navy" outlines snap to `#1e1d39`, so say "black outline";
  mushroom caps came back umber until the prompt said deep violet `#402751` and plum `#7a367b`.
- Never prompt "vein from corner to corner": it draws a % sign.
- Standard terrain varies a lot from roll to roll (identical prompts gave slate, umber and dark
  floors), so budget 2–3 rolls for an unchained set and judge each in a designed mock scene. When the
  two terrains share colour words, standard gives both one fill: give the upper terrain different
  colour words from the lower. A chained `lower_base_tile_id` fixes the lower look whatever the
  description says.
- Pro tilesets lost the L1 pilot at 15 generations a set: inverted values (a `#341c27` floor at
  1.26:1, under the 1.4:1 rule), no lit lip, and a texture that repeats every 16 px.

Other real costs: `create_portrait_character` 10, but it only converts an existing image, so it can't
draw Mags from text; `create_object_state` 10–25; `edit_image` 10 for up to 16 frames of 64 px or
less; Pro Flash objects 5 at 80 × 80 and 6 at 112 × 112; `pixelart_workbench`, `select_object_frames`,
`get_upload_url` and passing a palette are free. A `create_1_direction_object` job costs the same
however many item descriptions it carries, and its unselected frames stay in the review object, so a
near miss can still be promoted for free.

### Batches, as run

| Batch | What | Tool | Plan | Spent |
|---|---|---|---|---|
| T | the L1 pilot (1 pro, 3 standard), then 9 sets (9 first rolls, 6 retries) | `create_topdown_tileset` | 36 (standard) | 33 |
| I | 45 item icons: I1, I2 (43 kept) | `create_1_direction_object` | 20 | 20 |
| G | deposits, small decor, 1×1 buildings: G1, G2 (50 kept) | `create_1_direction_object` | 20 | 20 |
| M | 2×2 machines and 32 px decor: the M1 pilot, M2, M3 (the Separator) | `create_1_direction_object` | 30 | 30 |
| C | 3×3 buildings: 3 failed `create_map_object` tries, one size-48 job | both | 18 | 13 |
| D | the Drill: one size-80 job | `create_1_direction_object` | 10 | 15 |
| H | the Heart: one size-112 job | `create_1_direction_object` | 6 | 10 |
| P | Mags portrait | `create_image_pro` | 10 | 10 |
| TA | title art, six seeds | `create_image_pixflux` | 6 | 6 |
| H2 | the Heart re-rolled (review 3): one size-100 job, frame 0 kept | `create_1_direction_object` | 10 | 10 |
| | **Total** | | **166** | **167** |

Order as run: free prep (the swatch strip and per-layer palettes, the tileset importer, the mock
compositor) → the T pilot and M1 side by side → the rest of T, I1 and I2, G1 and G2, M2, P and TA in
parallel → C, D and H → `art:build` and a shot sweep → the art director's review → M3 and the free
redo → `art:build` again → review 3: H2 and the free fixes (decor outlines, floor variants, the
Shallows lip, the Alien joints) → `art:build` again.

## Asset manifest

Sprite names the renderer asks the atlas for (`src/render/atlas.ts`). Anything missing falls back to
code-drawn placeholder art. `npm run art:coverage` lists what is still missing.

- **Buildings** `b_<id>`: miner, smelter, press, assembler, foundry, generator, washer, separator,
  harvester, spore_collector, spore_filter, cutter, crusher, charger, overcharger, stabilizer,
  resonance_tap, cooling_bath, thermal_extractor, pressure_forge, precision_assembler, attuner,
  lamp, crate, shield_wall, foundation, unloader, sequencer, chute, hq, depot, terminal, elevator,
  assay_lab, engine_node, drill_broken, drill, heart_dormant, heart. `b_chute` is the Company Chute: a
  Company-family 1×1 (company-yellow hopper with an `#ebede9` stencil). There is no `b_merger`: the
  Merger is cut (DECISIONS #42). Belts, splitters, crossings and sorters have no sprite name: they
  are always drawn from code.
- **Items** `i_<id>`: every id in `PLAN.md` §7.1.
- **Deposits** `d_<ore id>_<1-3>`, with the item ids in `ORE_LIST` (`src/sim/mapgen.ts`; the same
  list as `DEPOSIT_ORES` in `scripts/art/lib.ts`): iron_ore, copper_ore, stone, coal, sapstone,
  glowcap, chorus_crystal, emberite, thrumstone. So `d_iron_ore_1`, `d_chorus_crystal_3`.
- **Decor** `x_l<layer>_<name>`. The layer data is the source of truth: each layer's `decor` list in
  `src/data/layers.ts`, where map decor value v draws `LAYERS[layer].decor[v - 1]`. Today: l0 bush,
  grass, pebbles, crate_stack, survey_flag; l1 support, stalagmite, rubble, minecart; l2
  mushroom_small, mushroom_tall, spore_pod, moss_clump; l3 crystal_small, crystal_large, geode; l4
  hex_pillar, vent, ember_rock; l5 stone_gear, glass_shard, relic. Seven are 32 × 32
  (`x_l0_crate_stack`, `x_l1_support`, `x_l1_minecart`, `x_l2_mushroom_tall`, `x_l3_crystal_large`,
  `x_l4_hex_pillar`, `x_l5_stone_gear`; `TALL_DECOR` in the same file lists them for map
  generation, with each list's `decorWeights`), the rest 16 × 16. Plus `x_l1_amber` (16 × 16), the
  amber-sealed rock at the Shallows bore site: decor value 99 (`AMBER_DECOR` in
  `src/sim/mapgen.ts`), drawn as `AMBER_SPRITE` (`src/data/layers.ts`).
- **Terrain** `t_<set>`: the ten sets in the table above, plus floor variant sheets `t_<set>_v<n>`
  (see "Floor variety").
- **Portrait** `p_mags`. **Title** `title_art` (320 × 180): a recipe sprite like any other, packed
  into the atlas; there is no separate title file. The favicon is not in the atlas
  (`public/favicon.png`).

## Sprite status, as built

What the game draws today: `public/art/atlas.json` holds 159 entries (39 buildings, 43 items, 27
deposits, 23 decor, 25 terrain sheets, the portrait and the title), 144 of the 146 names the game
asks for. A name the atlas lacks is drawn by `src/render/fallback.ts`, which has a sprite for every
name and follows these rules too.

| Group | PixelLab art | Code-drawn, and why |
|---|---|---|
| Items (45) | 43: I1 picks fitted with `itemfit.ts`, I2 anchored picks. `i_cut_crystal` is I2's hexagon (I1's round one read as charged crystal). Cobalt shine, the Heat Shield's aggregate faces and the coal-ramp slag and cooled ingot are free recolours | `i_filter` and `i_resonant_core`: both rolls failed (the filter read as a cabbage, then a citrus slice; the core as a multicolour mosaic). The code-drawn square brass filter reads better. Their selective outline looks a little softer than the closed PixelLab outlines |
| Deposits (27) | all, from G1 and G2, with free fixes: the Shallows glints on copper, iron and coal, lifted coal facets, a darker stone outline, Thrumstone ring grooves | — |
| Decor (23) | all, `x_l1_amber` included: 16 px from G1 and G2, 32 px from M1 and M2. The crate stack (soft `#4d2b32` outline, `#c09473` tops, wood `#ad7757` planks) and the minecart (rusted, in L1's ramp) were recoloured to sit back; the support and the glass shard lost their glow colours; review 3 moved the last eleven `#090a14` outlines onto each layer's darkest wall colour, gave the tall mushroom a plum stalk, the geode a dull rim and a `#172038` hollow, the survey flag a wood pennant and the bush dull greens | — |
| 1×1 buildings (7) | lamp, crate, shield wall, foundation (rim extended to the tile edge), unloader, sequencer, chute (the only 1×1 with a big flat company-yellow face) | — |
| 2×2 machines (22) | all: 14 from M1, recoloured to their family accents (Extraction stripes, Heat brick, Fabrication steel and rivets); 8 from M2 (the generator's south face and fire port hand-edited); the Separator from M3 (a tank pair). The five Crystal machines moved from `#a4dddb` to `#73bed3` and the Stabilizer's chamber to pale cyan; the Precision Assembler's cyan glass dome became polished steel and its cyan screen a pale-gold indicator lamp like the Assembler's | — |
| 3×3 buildings (6) | HQ, Depot, Terminal (gantry recoloured company yellow, a `T` stencil on the deck), Elevator station, Assay Lab (its cyan glass dome now a warm company-yellow skylight), Engine Node (south face deepened with `stretch.ts`) | — |
| The Drill, the Heart | `b_drill`; `b_heart_dormant` from H2 (frame 0 of the review-3 re-roll, `art/recipes/h2_heart.json`, which overrides H's pick) | `b_drill_broken` and `b_heart` are free hand edits of those, not code |
| Portrait, title | `p_mags` (candidate 3 of 25: direct gaze, hard hat with headlamp, headset), `title_art` (seed 31106, cleaned up) | — |
| Terrain | all ten sets, each now with free recolours (the last two, the Shallows sheet's lip and the conduit sheet's joints, came in review 3), and fifteen floor variant sheets (the Surface ground, the Shallows, Fungal and Crystal floors and the magma, three each) | — |
| Belts and pieces | — | conveyor, express and insulated belts, splitter, crossing, sorter: always code, because their rungs move in lockstep with the items on them. The renderer never asks the atlas for them |
| Everything in "Code-drawn art, as built" | — | chutes, status icons, ghosts, selection, darkness, conduit glass and pulse, shores where a layer has no sheet, warm ground, the hard-rock dither, overlays, effects, the elevator cab, the light-spot glow, the UI and its font |
| Favicon | — | `public/favicon.png`, from a script that stayed outside the repo |

Review 3's art director judged the set in the running game ("Ship with fixes"); the decor outlines,
the Shallows lip and the Heart it listed are fixed (DECISIONS #113, #117, #119). Still open
(`ROADMAP.md` Phase 3):

- The Drill's rim stripes are `#e8c170` / `#341c27`, not the Extraction `#de9e41` / `#151d28`.
- The 3×3 chutes don't start from the art's chute anchors yet: the art station's east chute floats
  about 4 px off its body, and the lower station's chute stops about 2 px short of the depot.
- `src/render/terrain.ts` draws every set's floor variants at 0.25 until it reads `atlas.json`
  "variantShare" (the Surface ground and the magma are meant to be 0.75).
- Watch at 1×: the Terminal's trolley rail, now a yellow and dark dashed line, sits close to a
  hazard-stripe read; the broken and working Drill differ by 101 px (they never share a screen).

## Pipeline

1. **Generate** into `art/raw/<batch>/`: raw PixelLab downloads, never edited, with every candidate
   frame in `art/raw/<batch>/candidates/` and each promoted pick byte-identical to its frame. A
   recipe `art/recipes/<batch>.json` maps each pick to a sprite name and keeps the job ids, the
   prompts (`_slots`), the rejects and why (`_rejected`) and the anchors.
2. **Fix for free, in a separate file.** A free fix writes a new file that the recipe points at and
   records how to replay it (the recipe's `_fix`, or its edits file):
   - `scripts/art/recolor.ts <edits.json>`: guarded colour maps, pixel patches and copy or flip ops
     (`art/edit/m2/`, `art/edit/c/`, `art/edit/d/`, `art/edit/h/`, `art/edit/h2/`, and
     `art/edits/redo/` for the art director's redo and review 3). A map op can be limited to one
     4-connected shape (`"flood": [x, y]` with `"stop": ["#hex", ...]`). pixelart_workbench edits
     are recorded in this form too.
   - `scripts/art/touchup.ts <edits.json>`: pixel edits with a reason each (the portrait,
     `art/edits/p_mags.json`).
   - `scripts/art/itemfit.ts`: brings an item inside the 12 × 12 envelope by removing whole redundant
     rows and columns (never resampling) and closes its outline (`art/edits/i1/`, `art/edits/i2/`,
     replay lists in `fits.tsv`).
   - `scripts/art/stretch.ts`: repeats whole rows to deepen a south face.
   - `scripts/art/terrain-fix.ts`: terrain recolours (see "Terrain").
   - `scripts/art/title_finish.ts`: the title's cleanup.
3. **`npm run art:build`** reads every recipe in natural filename order and builds the atlas:
   - `trim` (default true) cuts transparent margins; `fit` places the art on its `size` canvas,
     bottom-centred by default for canvases of 32 × 32 and up, centred below. Art is never shrunk.
   - It **fails with a report** and writes nothing when art is bigger than its canvas, when an item
     is over 12 × 12 (14 × 12 or 12 × 14 for the four long items), or when a sprite is fully
     transparent.
   - It maps colours to Apollo in OKLab with a 50% alpha cut-off, counts the pixels that moved far
     (OKLab dE > 0.05) per batch (per sprite with `--verbose`) and warns, without failing, above 3%.
   - It packs `public/art/atlas.png` + `atlas.json` (shelf-packed, at most 1024 wide, 1 px padding)
     and writes each terrain sheet to `public/art/terrain/`; `title_art` lands in the atlas like any
     other sprite.
   - `-- --check` validates without writing; `-- --check --recipes <dir>` validates another recipe
     folder (refused without `--check`).
   - It writes each sprite's `light` spots into `atlas.json` "lights" (see "Recipe format"), and
     fails when a spot sits on a transparent pixel or isn't an Apollo colour.
   - It writes the anchors (`pit`, `bore`, `core`, `chute`) into `atlas.json` "anchors", from the
     recipe that wins for each name, and each terrain set's `variantShare` into "variantShare"
     (see "Recipe format").
   - Not built yet (`ROADMAP.md` Phase 3): stripping baked shadows.
4. **`npm run art:sheet`** writes `art/out/contact.png` (every sprite at 2×, grouped by prefix) and
   `art/out/contact-1x.png` (1× on mid-grey and on the darkness tint).
5. **`npm run art:coverage`** lists the names the game asks for that the atlas lacks, decor included;
   belts and belt pieces are code-drawn by design, so they are never counted missing, and floor
   variants are listed as optional. Today: 144 of 146, the two code-drawn items missing. It doesn't
   check closed item outlines or the 3:1 rule yet (open).
6. **Check in the running game** (`npm run shots`), next to neighbours from the same layer.

Tools for picking and judging (free, no PixelLab calls; strict TypeScript that Node runs directly):

- `ref.ts` writes `art/ref/`: the Apollo swatch strip (pixflux `color_image`) and
  `layer_palettes.json` (from `palettes.ts`).
- `tileset.ts` imports a tileset (see "Terrain").
- `mock.ts`, with `scene.ts`, composes terrain, belts and sprites into a scene at 1× and 3×, under
  the darkness bands and lamp light, and writes `create_map_object` backgrounds and masks.
- `candidates.ts` lays candidate frames out on labelled contact sheets with measurements; `items.ts`
  checks item candidates against "Items" on the belt they will ride.
- `anchors.ts` renders approved sprites exactly as `art:build` places them and writes a
  `style_images` list for anchored re-rolls (`art/ref/anchors_*/`).
- `mapobj.ts` reviews a `create_map_object` result against its mask and scene.
- `title_layout.ts` blocks the title's `init_image`; `title_mock.ts` renders the title screen as
  `src/ui/windows.ts` drew it before review 3 (it still copies the old cover rule, not the fit
  rule: open).

### Recipe format

`art/recipes/<batch>.json` (full reference: the header of `scripts/art/build.ts`):

```json
{
  "batch": "items_1",
  "sprites": [
    { "name": "i_iron_ore", "src": "art/raw/items_1/iron_ore.png", "rect": [0, 0, 32, 32],
      "size": [16, 16], "fit": "center", "trim": true, "scale": 1 }
  ],
  "terrain": [
    { "name": "t_l1_floor_rock", "src": "art/raw/terrain/l1.png", "tile": 16,
      "tiles": [ { "rect": [0, 0, 16, 16], "corners": [0, 0, 0, 1] } ] }
  ]
}
```

- **Sprites:** `rect` (default: the whole image) is cut from `src` (path from the project root),
  `trim` (default true) drops transparent margins, `scale` is a whole-number upscale, then the art
  goes on a transparent `size` canvas, centered or bottom-centered (`fit`; default bottom for 32 × 32
  and up). Art bigger than `size` is an error, never shrunk. Then everything is quantized: alpha
  < 128 → transparent, the rest → the nearest Apollo color (OKLab distance), opaque.
- **Light spots:** `light` is `[x, y, "#rrggbb"]`, `[x, y, "#rrggbb", r]` or a list of them: the lit
  lamp or window pixel in finished sprite pixels (after trim and fit; check it at 4× in
  `art:sheet`), the light's Apollo colour and a glow radius (default 3; 5 and up get the 2 px ring).
  The renderer draws the next brighter colour of that ramp on the pixel and a halo of this one round
  it. A spot must sit on a drawn pixel. A sprite without `light` gets no glow.
- **Anchors:** in finished sprite pixels (after trim and fit). `pit` (the elevator station's cab
  pit), `bore` (the Drill's bore) and `core` (the Heart's gem) are `[x, y, w, h]`, and every pixel of
  one must be drawn, or the build fails. `chute` (48 × 48 sprites only: the elevator station and the
  Engine Node) is `{ "N": [a, b, c], "E": ..., "S": ..., "W": ... }`: for each side, the first drawn
  pixel in from it along the tile centres 8, 24 and 40 (N and S give a y, E and W an x); a value off
  the canvas fails, one off the art's edge warns. The build copies them into `atlas.json` "anchors",
  as it does lights. Today: `b_elevator` pit `[13, 21, 21, 15]` and its chutes, `b_engine_node`'s
  chutes, `b_heart` and `b_heart_dormant` core `[47, 46, 17, 18]`; the renderer reads the pit. With a
  leading `_` (`_bore` on the Drill, `_work` for a machine's working part such as the Press's die,
  `_light` for the rectangles the `light` spots were picked from) they stay notes.
- **Variant share:** a terrain set's own entry may carry `variantShare` (0 < share ≤ 1), the share of
  its plain tiles drawn from its `_v<n>` sheets, written to `atlas.json` "variantShare"; the build
  warns when a set has variants but no share (the renderer's default is 0.25).
- **Terrain:** one entry per corner combination, `corners` = `[nw, ne, sw, se]`, 1 = upper terrain;
  `rect` may be `[x, y]`. All 16 must be listed: if the source art lacks one, list it with
  `"twin": [nw, ne, sw, se]` to duplicate another tile on purpose. The sheet goes to
  `public/art/terrain/<name>.png` (e.g. `t_l1_floor_rock.png`) and into the atlas as `<name>`.
  PixelLab tilesets are re-packed by their metadata corners first (see "Terrain").
- Recipes run in natural filename order; a later sprite or terrain with the same name overrides the
  earlier one (with a warning): `m2_machines.json` overrides M1 picks, `m3_machines.json` the
  Separator and `redo.json` the art director's redo, so each earlier pick stays on record. `"note"`
  keys and keys starting with `_` are ignored at every level: use them for prompts, job ids and fixes.
- The build warns, without failing, about names the game doesn't ask for, unknown keys and sizes
  that differ from "Grid and sizes"; it fails on art over its size limit and on a bad `light`.
  `-- --verbose` lists every sprite.

## Budget

PixelLab: **500 generations** for the first run (the account was at 3,743.1 used when it started:
stop at 4,243.1). The art run spent **157**, ending at 3,900.1 used. The plan was 156 with standard
tilesets, plus a 150 reserve: terrain and the 3×3 buildings came in 3 and 5 under, the Drill and the
Heart 5 and 4 over at their 1-direction prices, so one generation came out of the reserve. Review 3
spent 10 more on the Heart's re-roll (H2, 3,900.1 to 3,910.1). In all **167** are spent and **333
are left**, and the $2.00 credit was never touched. Log every batch in `PROGRESS.md` with its cost.
