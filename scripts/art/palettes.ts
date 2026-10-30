/**
 * Per-layer terrain palettes from the art plan (review art.md, batch T; DECISIONS G32-33): the
 * Apollo colours each layer's tilesets may use. Pass a layer's list as `palette` (with palette_name
 * 'Apollo') to create_topdown_tileset. scripts/art/ref.ts writes them to art/ref/layer_palettes.json,
 * and scripts/art/tileset.ts reports imported pixels that fall outside their layer's list.
 */
import { APOLLO } from './lib.ts';

export const LAYER_PALETTES: Readonly<Record<string, readonly string[]>> = {
  // Surface: ochre gravel, sandstone, dry scrub.
  l0: ['#341c27', '#4d2b32', '#7a4841', '#ad7757', '#c09473', '#d7b594', '#e7d5b3', '#884b2b', '#be772b', '#25562e', '#468232', '#75a743'],
  // Shallows: umber floor, brown rock with a lit tan lip.
  l1: ['#090a14', '#241527', '#341c27', '#4d2b32', '#7a4841', '#ad7757', '#c09473', '#602c2c', '#884b2b'],
  // Fungal: violet stone, plum lip, dark moss, navy water.
  l2: ['#090a14', '#1e1d39', '#241527', '#402751', '#7a367b', '#a23e8c', '#19332d', '#25562e', '#468232', '#172038', '#253a5e', '#3c5e8b', '#4f8fba', '#a4dddb'],
  // Crystal: navy stone, mid-blue lip, cyan veins.
  l3: ['#090a14', '#10141f', '#172038', '#253a5e', '#3c5e8b', '#4f8fba', '#73bed3', '#a4dddb', '#ebede9'],
  // Magma: neutral basalt, heat cracks, magma.
  l4: ['#090a14', '#10141f', '#151d28', '#202e37', '#394a50', '#577277', '#411d31', '#752438', '#a53030', '#cf573c', '#da863e', '#e8c170', '#ebede9'],
  // Alien: green-grey machine stone, aqua conduits.
  l5: ['#090a14', '#151d28', '#19332d', '#202e37', '#25562e', '#394a50', '#577277', '#819796', '#73bed3', '#a4dddb', '#ebede9'],
};

/** The ten terrain sets of the art plan and the layer palette each one uses. */
export const TERRAIN_SET_LAYERS: Readonly<Record<string, string>> = {
  t_l0_ground_rock: 'l0',
  t_l1_floor_rock: 'l1',
  t_l2_floor_rock: 'l2',
  t_l2_floor_water: 'l2',
  t_l3_floor_rock: 'l3',
  t_l4_floor_rock: 'l4',
  t_l4_floor_hot: 'l4',
  t_l4_hot_magma: 'l4',
  t_l5_floor_rock: 'l5',
  t_l5_floor_conduit: 'l5',
};

/** The layer key ('l0'..'l5') of a terrain set name such as t_l1_floor_rock, or null. */
export function layerOfSet(set: string): string | null {
  const known = TERRAIN_SET_LAYERS[set];
  if (known) return known;
  const m = /^t_(l\d)_/.exec(set);
  return m && m[1] in LAYER_PALETTES ? m[1] : null;
}

/** Throws if a layer palette lists a colour that isn't Apollo (or lists one twice). */
export function checkLayerPalettes(): void {
  const apollo = new Set(APOLLO);
  for (const [layer, list] of Object.entries(LAYER_PALETTES)) {
    const off = list.filter((h) => !apollo.has(h));
    if (off.length > 0) throw new Error(`layer palette ${layer} has non-Apollo colours: ${off.join(' ')}`);
    if (new Set(list).size !== list.length) throw new Error(`layer palette ${layer} lists a colour twice`);
  }
}
