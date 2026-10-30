# Art plan

## Style issues

- **1. [math] Terrain colours stop reading in the dark (STYLE Layer moods). WCAG contrast: L4 walls #10141f/#090a14 against the tint #090a14 = 1.07/1.00; L3 wall #172038 against #090a14 = 1.22; L2 wall #241527 against its tint #10141f = 1.06. L1, L2, L3 and L5 each share a colour between floor and wall (#4d2b32, #1e1d39, #172038, #202e37); the rest of L2 runs 1.26-1.34 and L4 1.08-1.32. The second floor colours #1e1d39, #172038 and #151d28 sit at 1.13-1.22 against their layer's tint. Revealed rock looks like unrevealed void, so from L2 down the player can't tell where to dig or build.** → Make the edges carry readability. (a) The first listed floor colour becomes the base and must reach 1.4:1 against #090a14: L1 #7a4841 2.66, L2 #402751 1.53, L3 #253a5e 1.73, L4 #202e37 1.42, L5 #394a50 2.13. The second colours become 1 px cracks only. (b) Every rock cell that borders floor gets a lit 1-2 px lip on its top edge: L1 #ad7757 (1.96 against the floor), L2 #7a367b (1.62), L3 #4f8fba with #73bed3 veins (3.24), L4 #577277 (2.71), L5 #819796 (3.00). Wall interiors may fade toward the tint. (c) Use one tint, #090a14, on every layer and never as a terrain fill. Ask for the lip in the tileset prompt (transition_size 0.25, with the lip as transition_description).
- **2. [math][doc] PixelLab tilesets don't drop straight into the dual-grid sheet (STYLE Terrain). PixelLab doesn't guarantee its tile order (PixelLab help). transition_size above 0.5 in standard mode, or 0.5 and up in pro, returns 25 tiles instead of 16. l2_floor_water and l4_floor_magma describe a different floor from their layer's rock set, so they either seam against it or lose the 'cracked, hot' look once chained. PLAN 5.1 lists hot ground, conduit and hard rock, and none has art. Hot ground is 2 tiles wide in play (PLAN 6, L4), but a floor-to-magma set can only draw half a tile of it. Each drawn tile reads a 2x2 block of cells, so rock touching water only diagonally still puts three terrains in one tile, and no tile exists for that. One index-0 tile paves a whole 72x52 floor, and flipped copies seam.** → Importer: fetch /mcp/tilesets/{id}/image?inline=true and /metadata, crop each bounding_box, require every corner to be lower or upper, compute i = NW*8+NE*4+SW*2+SE (upper=1), paste at (i%4*16, floor(i/4)*16), assert 16 unique indices, quantize, and render a random-map seam test on the contact sheet. Use transition_size 0 or 0.25 only. Ten sets: add t_l4_floor_hot (floor to hot ground), rename the magma set to t_l4_hot_magma (hot ground to magma), add t_l5_floor_conduit. Chain each layer's sets from its floor's base tile id, with identical floor wording. Map-gen rule: every 2x2 window of cells holds at most two terrains, and that pair has a set. Hard rock = rock art + a dithered darkness tint + a red dig cursor (code). Floor variety: 3 edits of tiles 0 and 15 that touch only pixels 2-13, picked per cell by seed (free).
- **3. [doc] Objects may not share the terrain's camera angle (STYLE Perspective, PixelLab settings). create_1_direction_object only offers view 'top-down' or 'sidescroller' (tool schema), and its angle is undocumented (PixelLab help). Tilesets and create_map_object draw 'high top-down' (about 35 degrees). Machines and decor can come back flat, straight from above, next to raised 3/4 terrain, and each job picks its own look.** → Every object prompt says 'high top-down 3/4 view, flat top and thin south face'. M1 is the view pilot. After it, every job passes 8 approved sprites as style_images. The largest style image sets the output size, so pad anchors to the target canvas. If M1 has no 3/4 candidates, make the 2x2 machines with create_map_object (view 'high top-down', 1 generation each, style-matched inside a mock scene of approved art). The 3x3 buildings, the Drill and the Heart go that way from the start.
- **4. [taste][math] One sprite for every facing (STYLE Grid; DECISIONS 5). In 3/4 view the south face is the only visible side, so a furnace mouth, door or intake drawn there reads as the machine's front. The output faces N, E or W three times in four. 'The sprite fills its footprint' makes every 2x2 silhouette the same 32x32 square, which contradicts 'every machine has a distinct silhouette'. The output chute, and the left side output of the Separator and Thermal Extractor (PLAN 5.3), have no spec.** → The south face is plain, symmetric plating, and every light spot sits on the top face. Each machine owns a distinct top-view shape in its central ~20 px (drum, twin rollers, coil, stack, tank pair). Body 28-32 px with a 0-2 px transparent margin so neighbours read apart. Chute: 6x4 px on the facing edge, overlapping the body 3 px, #202e37 with a #e8c170 arrow. Side output: same size with an #a8b5b2 arrow.
- **5. [math] Items on belts are under-specified (STYLE Grid 'Item icon', Perspective 'Outline', Animation). Belt colours are undefined, so item contrast can't be checked. Selective outlines leave dark items with no edge on a dark belt. PixelLab ignores scale hints, so a size-16 job won't hold a 12x12 envelope. An 8-frame scroll over 16 px moves the belt 2 px at a time, 12 times a second, while items move 0.4 px per tick (1 px steps), so items visibly slide against the belt.** → Belt: #394a50 surface, #577277 rungs, #151d28 1 px rails (14 px lane). Items: a closed 1 px #090a14 outline (2.13:1 on the belt) plus a highlight at 3:1 or better (#819796 = 3.00). art:build rejects any item whose opaque bounding box exceeds 12x12 (14 on one axis for steel_beam, drill_bit, cobalt_drill_head, copper_wire). Belt pattern period 8 px, drawn as eight 1 px frames. Belt offset and item positions both come from floor(distance_px), so they move in lockstep at 24 and 48 px/s.
- **6. [math] Ore and item ramps collide (STYLE Material ramps). Cobalt and Crystal share 4 of cobalt's 5 colours (#253a5e #3c5e8b #4f8fba #73bed3), so cobalt ore, ingot and drill head differ from chorus, cut and charged crystal only by shape at 12 px. Iron and steel share one grey ramp. Coal (#090a14-#394a50) matches the L4 floor #202e37 and the L5 floor #394a50/#202e37, and PLAN 6 puts coal deposits on both, so they disappear. Slag and the cooled ember ingot use the same darks.** → Cobalt = #172038 #253a5e #3c5e8b with a #4f8fba highlight. Crystal = #4f8fba #73bed3 #a4dddb #ebede9, nothing darker than #3c5e8b except the outline. Iron = #394a50 #577277 #819796 with a #7a4841 rust fleck. Steel = #819796 #a8b5b2 #c7cfcc #ebede9 with a #4f8fba sheen. Coal gets glossy #819796 facets (4.51 against #202e37, 3.00 against #394a50). Slag gets #752438 bubbles; the cooled ingot gets #752438 cracks. New art:coverage rule: every item and deposit has at least 3 px at 3:1 against every floor it appears on.
- **7. [math][taste] Machine families share accents (STYLE Machine families). Extraction's brass hazard stripes and Company's #de9e41 are the same colour. Heat (rust with a glowing mouth) and Power (rust boiler with a chimney) are the same material. Brass also trims Fabrication and Chemistry. At 1x a Miner reads as a Company building and a Generator as a Smelter, so you can't read a factory by its colours.** → Each family's accent is a colour plus a pattern, and no two families share one. Extraction: diagonal #de9e41/#151d28 stripes on the rim only. Company: flat #de9e41 roof panels with #ebede9 stencils. Fabrication: #577277/#819796 steel with #be772b rivet dots. Chemistry: glass tanks (#a4dddb glint) of amber or lime fluid. Heat: #752438/#a53030 brick with a #e8c170 mouth on top. Power: #202e37 iron drum, #da863e copper pipes, smokestack. Crystal: #202e37 steel with #73bed3 coils. Alien: #394a50/#19332d stone with #a4dddb light.
- **8. [math] The six layer moods collide inside Apollo (STYLE Layer moods, UI). L3 and L5 use the same accent pair (#73bed3 #a4dddb). The L4 and L5 floors share #202e37 and their bases are only 1.51:1 apart, so unlit they look alike. The two darkness tints, #10141f and #090a14, differ by 1.07:1, which is no visible difference. L1's lantern amber is also the Company colour, the Extraction stripes, and the UI's money, warning and selection colours. L4's magma is also the Heat accent and the UI's 'bad' colour.** → Give each layer its own floor hue plus an accent no other layer uses. L0: ochre in daylight. L1: umber with #de9e41 lamps. L2: violet with #c65197/#a8ca58. L3: navy with #73bed3 and #ebede9 glints. L4: neutral basalt #202e37 with #cf573c/#da863e. L5: green-grey (#394a50 slabs, #19332d/#25562e joints) with an #a4dddb core inside #25562e glass. Heat machines show a #e8c170/#ebede9 white-hot core so they outshine the magma. Selection is a blinking 1 px #ebede9/#e8c170 outline, never an amber fill.
- **9. [math] The darkness overlay as written looks blocky and crawls (STYLE Light and darkness). Light 'computed per tile' puts every band edge on a 16 px tile edge, so the 4x4 dither has no gradient to work across. Band opacities and what the dither pattern is anchored to are unspecified, and a pattern anchored to the screen crawls when the camera pans.** → Compute light at tile corners, interpolate it per world pixel, and quantize it with a 4x4 Bayer matrix anchored to world coordinates into four bands at tint alpha 0 / 0.35 / 0.65 / 0.85; unrevealed tiles get 1.0. Cheap version: pre-render the 4^4 = 256 corner-band combinations as 16x16 stamps once per layer and draw one per visible tile (the terrain's dual-grid trick again), redrawn only when the light changes. Status icons and survey markers draw after the overlay.
- **10. [taste] Decor and deposits can be mistaken for resources and items (STYLE Asset manifest, Grid). x_l3_crystal_small and x_l3_geode look like d_chorus; x_l4_ember_rock like d_emberite; the x_l2 mushrooms and spore_pod like d_glowcap; x_l5_glass_shard and x_l5_relic like i_engine_glass and i_heartstone; x_l0_crate_stack like b_crate. A 16 px object generator returns one centred lump, so a 4x4 ore patch reads as a polka-dot grid of loose items.** → Only resources glow or use an ore's bright colours; decor stays dull, in its layer's terrain colours. Deposits are half-buried chunks spread to the tile edges. The renderer adds a darker ore-bed tint under the patch and shifts each decal by a seeded +/-2 px. Decor crates are wood (#7a4841/#ad7757); b_crate is steel with a flat company-yellow band.
- **11. [doc] The sprites leave no room for their code animations (STYLE Animation, Perspective; PLAN 5.5, 5.7, 6). The elevator cab moves 'in the shaft', the drill bit spins, the Heart pulses, and the renderer lights each machine's light spot. Nothing reserves a pit, a bore, a glow region or coordinates for any of these. The broken Drill 'leans against' the mountain (PLAN 6), but pixel art can't be rotated. Generating drill and drill_broken separately won't give the same machine.** → Prompts ask for the openings: b_elevator gets a dark square pit of at least 14x14 px, b_drill a round bore of at least 24 px. Recipes record light:[x,y,w,h], the pit and bore rectangles, and the chute anchor points. b_drill_broken and b_heart (awake) are hand-edited from the chosen b_drill and b_heart_dormant in pixelart_workbench (free). Either drop 'leans' or hand-draw the lean into the broken state.
- **12. [doc][math] The art pipeline will crop sprites and let off-palette colours through (STYLE Pipeline step 2, Perspective). 'Trims to the target size' crops any sprite PixelLab draws too big. Generated objects often have drop shadows drawn in, which STYLE forbids. Matching each pixel to the nearest RGB colour speckles soft edges. Nothing measures how far colours drift.** → art:build pads and centres each sprite (2x2 and larger aligned to the bottom of the footprint). It fails with a report when the opaque bounding box exceeds the size limit (12 / 16 / 32 / 48 / 80 / 112). It strips shadow clusters below the outline and maps colours in OKLab with a 50% alpha cut-off. It logs moved pixels and fails if more than 3% move far. Coverage also checks closed item outlines and the 3:1 rule.
- **13. [doc][math] The PixelLab table names a wrong tool, an awkward size and no costs (STYLE PixelLab settings). create_portrait_character only converts an existing image; it can't draw Mags from text. 400x225 title art can't scale by a whole number to 1080p (it would need 4.8x). Real costs: create_1_direction_object 10 generations at 16, 32 and 48 px, 15 at 80, 10 at 112; tileset standard 1, pro 15; create_map_object 1; create_image_pixflux 1; create_image_pro at 48x48 10. The tool schema says standard tilesets take no palette; the help desk says they do.** → Portrait: create_image_pro 48x48 with the Apollo palette (one call, 16-25 candidates, 10 generations). Title: 320x180, which scales 4x, 6x, 8x and 12x to 720p, 1080p, 1440p and 4K, made with create_image_pixflux using an Apollo colour image and a hand-blocked starting image. Add a cost column to the table. Pass the palette to standard tilesets and quantize on import either way.
- **14. [doc] Code-drawn art has no spec (STYLE Animation, UI; PLAN 5.2, 5.3, 7.3). Conveyor, express and insulated belts, splitter, merger, crossing and sorter have no colours and aren't in the manifest. Status icons cover only 4 of PLAN 5.3's states: 'no input' and 'missing placement condition' have none. Survey markers, the bore-site beacon and the placement ghost colours are undefined.** → Add a code-drawn table to STYLE. Conveyor #394a50/#577277/#151d28; express #3c5e8b rungs with #73bed3 chevrons; insulated #884b2b/#be772b padded rails; splitter, merger, crossing and sorter = belt plus #e8c170 arrows on an #819796 housing. 7x7 status icons: ▲ #de9e41, ✕ #cf573c, ⚡ #73bed3, ~ #df84a5, ○ no input #819796, ! placement #e8c170. Ghosts: valid #a8ca58, invalid #cf573c, planned #4f8fba at 50% dither. Hand-draw these with pixel-art-studio (free).

## Batches (total 273, reserve 150)


### T terrain: 10 dual-grid Wang sets (an L1 pilot picks pro or standard for all of them) — create_topdown_tileset — est 153
Settings: tile_size 16, view 'high top-down', palette_name 'Apollo'. Each set gets its layer's palette: L0 #341c27 #4d2b32 #7a4841 #ad7757 #c09473 #d7b594 #e7d5b3 #884b2b #be772b #25562e #468232 #75a743 | L1 #090a14 #241527 #341c27 #4d2b32 #7a4841 #ad7757 #c09473 #602c2c #884b2b | L2 #090a14 #1e1d39 #241527 #402751 #7a367b #a23e8c #19332d #25562e #468232 #172038 #253a5e #3c5e8b #4f8fba #a4dddb | L3 #090a14 #10141f #172038 #253a5e #3c5e8b #4f8fba #73bed3 #a4dddb #ebede9 | L4 #090a14 #10141f #151d28 #202e37 #394a50 #577277 #411d31 #752438 #a53030 #cf573c #da863e #e8c170 #ebede9 | L5 #090a14 #151d28 #19332d #202e37 #25562e #394a50 #577277 #819796 #73bed3 #a4dddb #ebede9. Pilot (the decision point): t_l1_floor_rock once in mode 'pro' (raggedness 0.3, boundary_amplitude 0.15, step_slope 0.3) and 3 times in 'standard' (shape_style 'round', enhance false, detail 'medium detail', shading 'basic shading'). Re-pack and quantize each result, then judge it in a mock scene at 1x and 3x with the darkness bands on. Pick ONE mode for all 10 sets, for consistency. Then for each layer: generate the floor/rock set first, read its lower base tile id with get_topdown_tileset, and pass it as lower_base_tile_id to the layer's other sets (t_l4_hot_magma takes t_l4_floor_hot's upper base id). Never use a transition_size above 0.25. Import through the /metadata corner re-pack (issue 2). Free extras: hard rock as a code tint, and 3 floor variants per set edited only inside pixels 2-13. The estimate assumes pro wins the pilot (18 + 9 x 15); if standard wins it is 36 (18 + 9 x 2).

- `t_l0_ground_rock`: lower: dusty ochre gravel ground with small tan and sand pebbles and a few dry olive grass tufts | upper: weathered sandstone boulders and cliff rock, pale sand tops lit from upper left, umber and dark brown south faces | transition_size 0.25, transition_description: sandstone cliff lip
- `t_l1_floor_rock`: PILOT SET. lower: dark umber cave floor of packed earth with tan speckles | upper: rough brown rock wall with a lit tan ridge along its top edge and dark maroon-brown crevices | transition_size 0.25, transition_description: brown rock face with a lit tan lip
- `t_l2_floor_rock`: lower: deep violet cave stone floor with patches of dark green moss | upper: dark violet rock wall with a lit plum ridge along its top edge and near-black crevices | transition_size 0.25, transition_description: violet rock face with a plum lip
- `t_l2_floor_water`: lower_base_tile_id = the t_l2_floor_rock lower base. lower: deep violet cave stone floor with patches of dark green moss | upper: still dark navy underground water with a few pale aqua glints | transition_size 0, boundary_amplitude 0.1
- `t_l3_floor_rock`: lower: deep blue stone cave floor of smooth slabs with thin navy cracks | upper: blue rock wall veined with glowing pale cyan crystal, mid-blue lit ridge along its top edge | transition_size 0.25, transition_description: blue rock face with a mid-blue lip
- `t_l4_floor_rock`: lower: black basalt cave floor, dark slate with faint hexagonal cracks | upper: wall of basalt hexagonal columns, slate grey hexagon tops, black sides | transition_size 0.25, transition_description: basalt column face with slate grey tops
- `t_l4_floor_hot`: NEW SET. lower_base_tile_id = the t_l4_floor_rock lower base. lower: black basalt cave floor, dark slate with faint hexagonal cracks | upper: cracked basalt hot ground, dark slate split by thin glowing red-orange heat cracks | transition_size 0, boundary_amplitude 0.15
- `t_l4_hot_magma`: RENAMED from t_l4_floor_magma. lower_base_tile_id = the t_l4_floor_hot upper base. lower: cracked basalt hot ground with thin glowing red-orange cracks | upper: flowing magma, bright orange and red-orange with pale yellow and white-hot spots and dark crust flecks | transition_size 0, boundary_amplitude 0.15
- `t_l5_floor_rock`: lower: grey-green machined stone floor of fitted square slabs with dark green joints | upper: wall of ancient grey-green stone machinery with carved gear rims and pale grey lit edges | transition_size 0.25, transition_description: carved stone face with a pale grey lip
- `t_l5_floor_conduit`: NEW SET. lower_base_tile_id = the t_l5_floor_rock lower base. lower: grey-green machined stone floor of fitted square slabs with dark green joints | upper: glowing pale aqua glass conduit channel set in dark green stone, bright aqua core line | transition_size 0, roundness 0 (pro) or shape_style 'square' (standard), boundary_amplitude 0

### I items: 45 icons at 16 px (I1, then an I2 re-roll anchored on approved icons) — create_1_direction_object — est 20
Settings: I1: size 16 (64 candidates, 10 generations), view 'top-down', palette = APOLLO46 (the 46 hexes in STYLE.md Palette), palette_name 'Apollo', name 'i1_items', description 'tiny game item icon, centered with an empty transparent margin, closed 1px dark navy outline, lit from upper left, no shadow'. item_descriptions = the 45 below in PLAN 7.1 order, then 19 second slots repeating steel_ingot, cobalt_ingot, cold_ember_ingot, reinforced_plate, heat_shield, heartstone, copper_wire, motor, drill_bit, cobalt_drill_head, insulation, filter, cut_crystal, charged_crystal, conductive_powder, battery, circuit, resonant_core, ember_core. Keep (select_object_frames, free) only candidates with an opaque bounding box of 12x12 or less (14 on one axis for steel_beam, drill_bit, cobalt_drill_head, copper_wire), a closed outline, light from the upper left, and 3:1 contrast against a #394a50 belt mock. I2: no size; style_images = 8 approved I1 icons (ore, ingot, plate, gear, crystal, assembly, core, powder); item_descriptions = each rejected item 3 times; 10 generations.

- `i_iron_ore`: small item icon: rough irregular rock lump, dull slate-grey stone with rust-red iron flecks, dark navy outline, lit from upper left
- `i_copper_ore`: small item icon: rough irregular rock lump, dull umber-brown stone with bright copper-orange flecks, dark outline
- `i_stone`: small item icon: rough angular chunk of pale grey granite, light grey top, blue-grey sides, dark slate crevice
- `i_iron_ingot`: small item icon: trapezoid metal ingot bar, dark slate-grey iron, strong pale grey top highlight, tiny rust fleck
- `i_copper_ingot`: small item icon: trapezoid ingot bar, bright copper-orange, pale gold top highlight, dark brown outline
- `i_brick`: small item icon: one rectangular fired brick, rust-red sides, red-orange top face, pale sand mortar edge
- `i_iron_plate`: small item icon: square flat metal plate, light blue-grey steel, four dark corner rivets, crisp edges
- `i_gear`: small item icon: iron gear with six square teeth and a round center hole, blue-grey with pale highlights
- `i_copper_wire`: small item icon: compact coil of copper wire on a dark spool, bright copper-orange loops, pale gold glints
- `i_reinforced_plate`: small item icon: thick square steel plate with a diagonal cross brace and four brass rivets, blue-grey and gold
- `i_coal`: small item icon: rough black coal lump with glossy blue-grey facets and one pale grey glint
- `i_steel_ingot`: small item icon: trapezoid ingot bar, bright pale silver steel, blue sheen line, stamped notch on top
- `i_steel_beam`: small item icon: short horizontal steel I-beam, long and thin, pale silver flanges, dark slate web
- `i_motor`: small item icon: small electric motor, blue-grey steel cylinder with a bright copper winding band and a short shaft
- `i_drill_bit`: small item icon: conical steel drill bit with spiral flutes, pale silver, brass collar at the base
- `i_sapstone`: small item icon: rough deep-blue rock sealed in a glossy amber resin crust with honey drips
- `i_cobalt_ore`: small item icon: clean rounded nugget of deep cobalt blue, one bright mid-blue highlight, no rock
- `i_resin`: small item icon: glossy amber resin droplet, golden orange with a bright pale gold highlight
- `i_cobalt_ingot`: small item icon: trapezoid ingot bar, deep cobalt blue, mid-blue top highlight, dark navy outline
- `i_glowcap`: small item icon: one plucked glowing mushroom, magenta cap with a pink rim and pale lime spots, short pale stem
- `i_mycelium`: small item icon: small twisted bundle of pale lime and off-white fungal fibre strands tied at the middle
- `i_spore_dust`: small item icon: small heap of fine magenta and pink powder with pale lime specks
- `i_biofuel`: small item icon: small glass vial of glowing lime-green fuel with a brass cap
- `i_insulation`: small item icon: rolled pad of pale fungal fibre wrapped in glossy amber resin bands
- `i_filter`: small item icon: round filter cartridge, brass rim around a pale lime fibre mesh
- `i_cobalt_drill_head`: small item icon: conical drill head, pale steel body with deep cobalt-blue cutting teeth, brass collar
- `i_chorus_crystal`: small item icon: rough cluster of three pale cyan crystal shards on a dark blue rock base, one white glint
- `i_cut_crystal`: small item icon: hexagonal faceted cut gem, pale cyan and mid-blue facets, one white glint, no glow
- `i_crystal_grit`: small item icon: small heap of rough dark-blue and grey crystal chips with two cyan glints
- `i_charged_crystal`: small item icon: hexagonal faceted gem glowing bright cyan with a white core and tiny spark lines
- `i_conductive_powder`: small item icon: neat small heap of fine bright cyan powder with white sparkles
- `i_overcharged_crystal`: small item icon: cracked faceted gem bursting with white and pale cyan energy, jagged crackling edge
- `i_resonant_core`: small item icon: round crystal core in a brass cage, glowing pale cyan center, amber insulation bands
- `i_battery`: small item icon: small upright battery cell, dark steel casing, glowing cyan crystal window, brass terminal on top
- `i_circuit`: small item icon: small square circuit board, dark green board with copper traces and one glowing cyan chip
- `i_emberite`: small item icon: rough black basalt lump split by glowing red-orange heat veins
- `i_aggregate`: small item icon: compact square block of grey-brown stone aggregate with tan specks, rough, cooled, no glow
- `i_slag`: small item icon: dull dark-grey porous slag clinker lump with a few maroon bubbles
- `i_hot_ember_ingot`: small item icon: trapezoid ingot bar glowing white-hot, red-orange body, pale yellow and white top
- `i_cold_ember_ingot`: small item icon: trapezoid ingot bar of dull charcoal-grey metal with dark maroon cracks, no glow
- `i_ember_core`: small item icon: dark steel sphere casing with vents showing a glowing orange and white-hot core
- `i_heat_shield`: small item icon: curved shield plate of dark grey aggregate tiles on a steel frame, rust-orange rim
- `i_thrumstone`: small item icon: smooth grey-green stone with faint pale aqua ring grooves, like a machined pebble
- `i_engine_glass`: small item icon: pane of pale aqua glass in a grey-green stone frame, one glowing aqua line across it
- `i_heartstone`: small item icon: glowing pale aqua and white gem held in a carved grey-green stone ring

### G deposits, small decor and 1x1 buildings at 16 px (G1, then an anchored G2 re-roll) — create_1_direction_object — est 20
Settings: G1: size 16 (64 candidates, 10 generations), view 'top-down', palette APOLLO46, palette_name 'Apollo', name 'g1_ground', description 'small top-down game sprite seen from directly above, lit from upper left, no ground shadow'. item_descriptions = the 48 below, then 16 second slots for b_lamp, b_crate, b_shield_wall, b_unloader, b_sequencer, b_foundation, d_coal_1, d_chorus_1, d_glowcap_1, d_thrumstone_1, d_emberite_1, x_l0_bush, x_l1_stalagmite, x_l2_moss_clump, x_l3_geode, x_l5_relic. Deposits: keep candidates whose chunks reach the tile edges and that have at least 3 px at 3:1 against every floor the ore appears on (iron: L0-L4; copper: L0, L1, L3; stone: L0, L1; coal: L1, L2, L4, L5). Decor: reject anything that glows or uses an ore's bright colours. G2: style_images = 8 approved G1 sprites, each reject 3 times, 10 generations. If no candidate fills 16x16, hand-draw b_foundation (free).

- `d_iron_1`: ore deposit decal from directly above: three slate-grey rock chunks with rust-red iron flecks, half-buried in a diagonal vein across the whole square, no ground fill, no shadow
- `d_iron_2`: ore deposit decal from directly above: one large slate-grey rock with rust-red iron flecks, half-buried, small rust-red chips scattered to the edges, no ground fill
- `d_iron_3`: ore deposit decal from directly above: four small slate-grey rocks with rust-red flecks near the four corners, half-buried, no ground fill
- `d_copper_1`: ore deposit decal from directly above: three umber rock chunks with bright copper-orange veins, half-buried in a diagonal vein across the whole square, no ground fill
- `d_copper_2`: ore deposit decal from directly above: one large umber rock with a bright copper-orange vein, small copper chips scattered to the edges, no ground fill
- `d_copper_3`: ore deposit decal from directly above: four small umber rocks with copper-orange flecks near the four corners, half-buried, no ground fill
- `d_stone_1`: ore deposit decal from directly above: three pale grey granite boulders with dark slate crevices in a diagonal line across the square, no ground fill
- `d_stone_2`: ore deposit decal from directly above: one large pale grey granite boulder with dark slate crevices, small grey chips to the edges, no ground fill
- `d_stone_3`: ore deposit decal from directly above: four small pale grey granite stones near the corners, dark slate crevices, no ground fill
- `d_coal_1`: ore deposit decal from directly above: three black coal chunks with glossy blue-grey facets and pale grey glints in a diagonal seam across the square, no ground fill
- `d_coal_2`: ore deposit decal from directly above: one large black coal chunk with glossy blue-grey facets, small coal bits scattered to the edges, no ground fill
- `d_coal_3`: ore deposit decal from directly above: four small glossy black coal lumps with pale grey glints near the corners, no ground fill
- `d_sapstone_1`: ore deposit decal from directly above: three deep blue stones coated in glossy amber resin, half-buried in a diagonal vein across the square, no ground fill
- `d_sapstone_2`: ore deposit decal from directly above: one large deep blue stone with a glossy amber resin crust, small resin drops to the edges, no ground fill
- `d_sapstone_3`: ore deposit decal from directly above: four small amber-coated blue pebbles near the corners, no ground fill
- `d_glowcap_1`: glowcap patch from directly above: three small glowing mushrooms, magenta caps with pink rims and pale lime spots, spread across the square, no ground fill
- `d_glowcap_2`: glowcap patch from directly above: five tiny glowing magenta mushroom caps with pale lime dots scattered to the edges, no ground fill
- `d_glowcap_3`: glowcap patch from directly above: two large glowing magenta mushroom caps and one small one, pink rims, pale lime spots, no ground fill
- `d_chorus_1`: crystal deposit decal from directly above: three pale cyan crystal shards jutting from the ground in a diagonal line, white glints, no ground fill
- `d_chorus_2`: crystal deposit decal from directly above: one large pale cyan crystal cluster with small shards scattered to the edges, white tips, no ground fill
- `d_chorus_3`: crystal deposit decal from directly above: four small pale cyan crystal points near the corners, white tips, no ground fill
- `d_emberite_1`: ore deposit decal from directly above: three black basalt chunks with glowing red-orange veins, half-buried in a diagonal vein across the square, no ground fill
- `d_emberite_2`: ore deposit decal from directly above: one large black basalt rock with a glowing red-orange vein, small ember chips to the edges, no ground fill
- `d_emberite_3`: ore deposit decal from directly above: four small basalt lumps with glowing orange cracks near the corners, no ground fill
- `d_thrumstone_1`: ore deposit decal from directly above: three smooth grey-green stones with pale aqua ring grooves in a diagonal line across the square, no ground fill
- `d_thrumstone_2`: ore deposit decal from directly above: one large smooth grey-green stone with a pale aqua ring groove, small stones to the edges, no ground fill
- `d_thrumstone_3`: ore deposit decal from directly above: four small grey-green ringed pebbles near the corners, no ground fill
- `x_l0_bush`: small decor prop from above: dry desert scrub bush, olive and dark green leaves over tan twigs, no glow
- `x_l0_grass`: small decor prop from above: tuft of dry sand-coloured grass blades with a few olive blades
- `x_l0_pebbles`: small decor prop from above: scatter of four small tan and sand pebbles, flat
- `x_l0_survey_flag`: small decor prop from above: thin tan wooden survey stake with a small faded rust-red pennant
- `x_l1_stalagmite`: small decor prop from above: short umber-brown stalagmite cone with a lit tan tip
- `x_l1_rubble`: small decor prop from above: small pile of broken umber and tan rock rubble
- `x_l2_mushroom_small`: small decor prop from above: pair of small mushrooms with dull plum caps and pale violet stems, no glow
- `x_l2_spore_pod`: small decor prop from above: closed round fungal pod, deep violet and plum with a dark green base, no glow
- `x_l2_moss_clump`: small decor prop from above: clump of dark green moss with a few olive tips
- `x_l3_crystal_small`: small decor prop from above: stubby dull dark-blue crystal stub with blue-grey facets, no glow
- `x_l3_geode`: small decor prop from above: cracked round rock geode, grey shell around a dark blue crystal-lined hollow, no glow
- `x_l4_vent`: small decor prop from above: small cracked fumarole vent in black basalt with a dull maroon rim and grey soot
- `x_l4_ember_rock`: small decor prop from above: black basalt rock with dull dark maroon cracks, no glow
- `x_l5_glass_shard`: small decor prop from above: broken shard of dull grey-green glass stuck in stone, no glow
- `x_l5_relic`: small decor prop from above: small carved grey-green stone tablet with faint ring glyphs, no glow
- `b_lamp`: tiny building in high top-down view: company work lamp, dark steel base, brass cage around a bright pale-gold bulb, fills most of the square
- `b_crate`: tiny building in high top-down view: steel storage crate, blue-grey panels, one flat company-yellow band with a white stencil mark, corner bolts
- `b_shield_wall`: tiny building in high top-down view: thick square shield block, dark steel frame with cobalt-blue armour plates and a pale cyan damping strip
- `b_foundation`: flat square floor plate filling the whole square edge to edge, grey aggregate tiles with a rust-orange rim, no height
- `b_unloader`: tiny building in high top-down view: boxy unloader, blue-grey steel with brass rivet dots, brass hopper funnel on top, pale-gold indicator
- `b_sequencer`: tiny building in high top-down view: alien switch box, grey-green stone casing with two pale aqua indicator lights, one left and one right

### M 2x2 machines and 32 px decor (M1 also tests the view angle; M2 and M3 are anchored re-rolls) — create_1_direction_object — est 30
Settings: M1: size 32 (64 candidates, 10 generations), view 'top-down', palette APOLLO46, palette_name 'Apollo', name 'm1_machines', description 'factory machine sprite in high top-down 3/4 view, flat top and a thin south face, square base filling the frame, selective dark outline, lit from upper left, no ground shadow'. item_descriptions = each of the 22 machines twice, each of the 7 decor twice, plus third slots for overcharger, resonance_tap, stabilizer, precision_assembler, spore_filter and separator (64 in total). M1 is the view pilot: if no candidate shows a south face, make the 2x2 machines with create_map_object (view 'high top-down', 1 generation each, style-matched inside a 96x96 mock of approved terrain), paid from the reserve. Pick per machine: body 28-32 px, a top-view shape unlike every other machine, a plain south face, the light spot on top, the family accent from issue 7. M2: style_images = 8 approved machines (one per family), each reject 3 times, 10 generations. M3: a second anchored re-roll or single map_object fixes, 10 generations.

- `b_miner`: factory machine in high top-down 3/4 view: square mining rig on a steel base, diagonal yellow-and-black hazard stripes around the rim, round drill shaft opening in the center, small pale-gold lamp on top
- `b_smelter`: factory machine in high top-down 3/4 view: squat square furnace of rust-red brick with dark steel bands, glowing orange furnace opening on the top surface, plain south face
- `b_press`: factory machine in high top-down 3/4 view: square stamping press, blue-grey steel body with brass rivet dots, heavy square press head in the center
- `b_assembler`: factory machine in high top-down 3/4 view: square assembler, blue-grey steel with brass rivet dots, two small robot arms over a square work plate, pale-gold indicator
- `b_foundry`: factory machine in high top-down 3/4 view: square crucible foundry, rust-red brick with dark steel bands, large round glowing orange crucible in the center, two small vents
- `b_generator`: factory machine in high top-down 3/4 view: square combustion generator, dark iron boiler drum with copper pipes, round smokestack in one corner, glowing orange firebox slit on top
- `b_washer`: factory machine in high top-down 3/4 view: square washer, brass frame holding a round glass drum of swirling blue water, small amber tank
- `b_separator`: factory machine in high top-down 3/4 view: square centrifuge, brass frame with two round glass tanks, one amber resin and one deep blue, copper pipes between them
- `b_harvester`: factory machine in high top-down 3/4 view: square fungus harvester, steel base with a yellow-and-black hazard-striped rim, round comb of steel tines in the center, small lime light
- `b_spore_collector`: factory machine in high top-down 3/4 view: square spore collector, yellow-and-black hazard-striped rim, large round intake fan grille on top, faint magenta glow inside the fan
- `b_spore_filter`: factory machine in high top-down 3/4 view: square air filter, brass frame, large round lime-glowing filter mesh on top, small glass tank of lime fluid
- `b_cutter`: factory machine in high top-down 3/4 view: square crystal cutter, dark slate steel body, round saw blade in the center, glowing cyan coils at two corners
- `b_crusher`: factory machine in high top-down 3/4 view: square crusher, dark slate steel body, two toothed steel rollers side by side, small cyan coil accents
- `b_charger`: factory machine in high top-down 3/4 view: square charger, dark slate steel base, one round copper coil glowing cyan in the center
- `b_overcharger`: factory machine in high top-down 3/4 view: square overcharger, dark slate steel body, three glowing cyan coils around a crackling white core
- `b_stabilizer`: factory machine in high top-down 3/4 view: square stabilizer, brass-framed glass containment chamber wrapped in amber insulation bands, pale cyan glow inside
- `b_resonance_tap`: factory machine in high top-down 3/4 view: square resonance tap, dark slate steel base, tuning-fork antenna ringed by pale cyan rings, cyan coils
- `b_cooling_bath`: factory machine in high top-down 3/4 view: square quench tank in a rust-red brick frame, dark blue water basin with pale steam wisps, glowing orange inlet edge
- `b_thermal_extractor`: factory machine in high top-down 3/4 view: square heat exchanger, rust-red pipes coiled around a glowing orange core, dark steel turbine housing
- `b_pressure_forge`: factory machine in high top-down 3/4 view: heavy square forge, dark maroon and rust-red brick body, steel hydraulic press head over a white-hot glowing anvil
- `b_precision_assembler`: factory machine in high top-down 3/4 view: square precision assembler, polished blue-grey steel with brass rivet dots, small glass dome over a fine robot arm, cyan indicator
- `b_attuner`: alien machine in high top-down 3/4 view: square block of carved grey-green stone with dark green joints, pale aqua glowing glass rings on top
- `x_l0_crate_stack`: decor prop in high top-down 3/4 view: stack of three weathered wooden crates, tan planks with dark brown edges, unpainted
- `x_l1_support`: decor prop in high top-down 3/4 view: timber mine support frame, two thick tan wooden posts and a cross beam, dark knots
- `x_l1_minecart`: decor prop in high top-down 3/4 view: old rusted empty minecart on a short rail section, umber and rust-brown
- `x_l2_mushroom_tall`: decor prop in high top-down 3/4 view: tall fungus with a broad deep violet cap and plum gills, pale stem, no glow
- `x_l3_crystal_large`: decor prop in high top-down 3/4 view: cluster of dull dark-blue crystal columns with blue-grey facets, no glow
- `x_l4_hex_pillar`: decor prop in high top-down 3/4 view: hexagonal basalt column, slate grey top face, black sides with dark maroon cracks
- `x_l5_stone_gear`: decor prop in high top-down 3/4 view: half-buried giant stone gear, grey-green carved teeth, dark green joints, no glow

### C 3x3 buildings at 48 px, generated in context — create_map_object — est 18
Settings: Style-matching mode. background_image = a fully lit 144x144 mock scene built from approved art: HQ and terminal on Surface terrain with 2 approved machines and code-drawn belts; depot and elevator on L1; assay_lab on L2; engine_node on L5 beside the approved attuner. inpainting = a custom mask image (white 48x48 square at the building's slot, black elsewhere). view 'high top-down', outline 'selective outline', shading 'medium shading', detail 'medium detail'. 3 attempts per building at 1 generation each. Quantize to Apollo on import; pad to 48x48, aligned to the bottom of the footprint.

- `b_hq`: company building in high top-down 3/4 view: square headquarters office, flat roof of company-yellow panels with white stencil marks, steel walls, radio mast, small lit windows on the south face
- `b_depot`: company building in high top-down 3/4 view: square supply depot warehouse, steel frame, company-yellow roof panels, open loading bay with stacked crates
- `b_terminal`: company building in high top-down 3/4 view: square shipping terminal, steel loading platform with a company-yellow gantry crane over a cargo bay, small notice board
- `b_elevator`: company building in high top-down 3/4 view: square freight elevator station, steel headframe around a dark open square shaft pit in the center, company-yellow rim around the pit, winch drum
- `b_assay_lab`: company building in high top-down 3/4 view: square assay laboratory, steel walls with company-yellow roof trim, glass skylight, sample hopper, small cyan analyzer glow
- `b_engine_node`: alien machine in high top-down 3/4 view: square carved grey-green stone engine, pale aqua glass conduits, round socket in the center, stone gear rims

### D the Drill at 80 px, generated in context (broken state hand-edited) — create_map_object — est 10
Settings: Style-matching mode. background_image = a fully lit 160x160 Surface mock (approved t_l0 ground, mountain-face rock along the top, the approved HQ at one edge). inpainting = a custom mask with a white 80x80 square where the drill stands against the rock. view 'high top-down', detail 'high detail', shading 'medium shading', outline 'selective outline'. 8 attempts at 1 generation each. b_drill_broken is a hand edit of the chosen b_drill in pixelart_workbench (free): lamps to #577277, one cracked panel, snapped teeth, #7a4841 rust streaks. Fallback: 2 map_object attempts with the chosen drill composited into the mock and masked.

- `b_drill`: giant excavation drill rig in high top-down 3/4 view: heavy dark steel frame with company-yellow panels and yellow-and-black hazard stripes, massive round bore opening in the center, brass motor housings at the corners, pale-gold work lamps
- `b_drill_broken`: (hand-edited from b_drill; this text is for the fallback only) the same giant drill rig, broken and idle: work lamps dark grey, one cracked housing panel, snapped drill teeth, rust-brown streaks

### H the Heart at 112 px, generated in context (awake state recoloured by hand) — create_map_object — est 6
Settings: Style-matching mode. background_image = a fully lit 192x192 L5 mock (approved t_l5 floor with conduits converging on the centre, the approved engine node at one edge). inpainting = a custom mask with a centred white 112x112 square. view 'high top-down', detail 'high detail', shading 'medium shading'. 6 attempts at 1 generation each. b_heart (awake) = the chosen dormant sprite with its glass and core pixels recoloured #253a5e/#3c5e8b to #73bed3/#a4dddb and the core to #ebede9 (free). Fallback, paid from the reserve: create_1_direction_object at size 112 (10 generations, 4 candidates).

- `b_heart_dormant`: enormous ancient alien engine in high top-down 3/4 view: round machine of concentric carved grey-green stone gear rings, dark navy glass conduits radiating outward, dim blue core, dormant
- `b_heart`: (recoloured from b_heart_dormant) the same alien engine awake: glass conduits and core glowing bright pale aqua and white

### P Mags portrait at 48x48 — create_image_pro — est 10
Settings: width 48, height 48, palette APOLLO46, palette_name 'Apollo', no_background true (drawn over the #151d28 radio panel). One call returns 16-25 candidates for 10 generations. Pick for a face readable at 1x, a #de9e41 hard hat and light from the upper left; clean up by hand in pixelart_workbench.

- `p_mags`: pixel art portrait bust of Mags Okafor, a warm, practical site engineer in her forties, dark brown skin, short natural hair under a company-yellow hard hat, radio headset with a small mic, blue-grey work jacket, friendly half smile, three-quarter view, lit from upper left

### TA title art at 320x180 — create_image_pixflux — est 6
Settings: width 320, height 180 (scales 4x, 6x, 8x and 12x to 720p, 1080p, 1440p and 4K), no_background false, view 'side'. color_image = a 46-swatch Apollo strip (forces the palette). init_image = a hand-blocked layout made free in pixel-art-studio (mountain silhouette, six coloured layer bands, shafts, a drill block, an empty band for the logo) at init_image_strength 150. shading 'medium shading', detail 'highly detailed'. 6 seeds at 1 generation each; clean up the best by hand.

- `title_art`: pixel art cross-section of a lone mountain at dawn: ochre dig site on the surface with a giant drill rig at the foot of the cliff; below it five stacked cave layers getting stranger with depth: umber caves with lantern light, violet fungal caverns with magenta and lime glow, deep blue crystal caves with cyan crystals, black basalt with orange magma channels, grey-green alien machinery around a glowing pale aqua heart at the bottom; freight elevator shafts link the layers; empty pale sky band at the top for the logo

## Notes
Planning only: no files were edited and nothing was generated. get_balance on 2026-10-30 shows 3,743.10 generations used; the PROGRESS.md cap is 4,243.10, and the account has 1,062.90 left this cycle.

Real costs, checked in the tool schemas, search_help and get_pro_flash_capabilities:
- create_1_direction_object: 10 generations at 16, 32 and 48 px (64, 64 and 16 candidates), 15 at 80 px (16), 10 at 112 px (4). The price is per job, whatever the number of item_descriptions. Passing a palette costs nothing extra, and select_object_frames is free.
- create_topdown_tileset: standard 1, pro 15 at 16 px. Only transition_size 0.5 or less (standard), or 0 and 0.25 (pro), returns the 16-tile sheet.
- create_map_object: 1 generation at any size, including style-matching with a 192x192 background. It takes no palette and has a 'high top-down' view (~35 degrees).
- create_image_pixflux: 1 generation (320x180 and 48x48).
- create_image_pro at 48x48: 10 generations. The tool text says 25 candidates, the help desk says 16.
- create_portrait_character: 10 generations, but it needs an input image.
- create_object_state: 10-25.
- edit_image: 10 for up to 16 frames of 64 px or less.
- Pro Flash object: 80x80 = 5, 112x112 = 6.
- pixelart_workbench: free.

Not yet verified (the M1 and T pilots settle these): how much of the canvas a 1-direction object fills at sizes 16 and 32, and what angle its 'top-down' view draws.

Order of work:
1. Free prep: Apollo swatch strip and per-layer palettes; an importer that re-packs tiles by their /metadata corners; a mock-scene compositor; recipe fields for light, pit, bore and chute anchors.
2. T pilot on L1, which picks one tileset mode for all sets, then the remaining terrain.
3. M1, which also tests the view angle.
4. I1 and G1.
5. The anchored re-rolls I2, G2, M2 and M3.
6. C, D and H, generated in context.
7. P and TA.
8. npm run shots per layer, then revisions paid from the reserve.

Call get_balance before every batch, log each batch in PROGRESS.md, and run at most 8 jobs at once.

Budget: 273 planned (assuming pro tilesets; 156 if standard wins the pilot) plus a reserve of 150 makes 423. That leaves 77 under the 500 cap; at worst the account ends at 4,166.1 used. The reserve covers terrain retries (30), re-roll jobs after screenshots (30), single map_object fixes (25), 1-direction fallbacks for the Drill and Heart (25), a portrait retry (10), edit_image recolour batches (20) and other (10). If M1 fails the view test, about 44 generations for map_object machines come out of the reserve plus the 77 margin. The margin can also pay for the optional working-state frames in STYLE Animation.

Colour words in the prompts map to Apollo as follows:
- dark navy outline #090a14
- slate-grey #394a50/#577277
- blue-grey #577277/#819796
- pale silver #a8b5b2/#c7cfcc
- white #ebede9
- rust-red #a53030
- red-orange #cf573c
- copper-orange #da863e
- pale gold #e8c170
- company yellow #de9e41
- brass #be772b
- maroon #752438
- umber #7a4841
- tan #ad7757
- ochre #c09473
- sand #d7b594
- deep cobalt #253a5e/#3c5e8b
- mid-blue #4f8fba
- pale cyan #73bed3
- pale aqua #a4dddb
- magenta #c65197
- pink #df84a5
- plum #7a367b
- deep violet #402751
- lime #a8ca58
- pale lime #d0da91
- olive #75a743
- dark green #25562e

Doc changes these findings imply (for the caller to make):
- STYLE.md: the terrain table grows to 10 sets (t_l4_floor_magma becomes t_l4_hot_magma, plus new t_l4_floor_hot and t_l5_floor_conduit); new tables for layer moods, family accents and code-drawn art; item outline, size limit and belt colours; a cost column in the PixelLab table; the pipeline's pad-and-fail rules.
- PLAN.md 5.1: the map-generation rule that every 2x2 window of cells holds at most two terrains.

The contrast ratios were computed with C:\Users\jacks\AppData\Local\Temp\claude\C--Users-jacks-OneDrive-Documents-The-Mountain-Is-a-Machine\4cf71c5b-08b3-4e56-8e51-5e68e48ceb1d\scratchpad\contrast.py. Sources: C:\Users\jacks\OneDrive\Documents\The Mountain Is a Machine\STYLE.md, PLAN.md, DECISIONS.md and PROGRESS.md.