// Apollo 46 by AdamCYounis. Every pixel the game draws comes from here (STYLE.md). The rows below
// are ramps, dark to light: src/ui/ui.ts tone() steps along them.

export const APOLLO = [
  // blues
  '#172038', '#253a5e', '#3c5e8b', '#4f8fba', '#73bed3', '#a4dddb',
  // greens
  '#19332d', '#25562e', '#468232', '#75a743', '#a8ca58', '#d0da91',
  // browns
  '#4d2b32', '#7a4841', '#ad7757', '#c09473', '#d7b594', '#e7d5b3',
  // oranges
  '#341c27', '#602c2c', '#884b2b', '#be772b', '#de9e41', '#e8c170',
  // reds
  '#241527', '#411d31', '#752438', '#a53030', '#cf573c', '#da863e',
  // purples
  '#1e1d39', '#402751', '#7a367b', '#a23e8c', '#c65197', '#df84a5',
  // greys
  '#090a14', '#10141f', '#151d28', '#202e37', '#394a50', '#577277', '#819796', '#a8b5b2', '#c7cfcc', '#ebede9',
] as const;

/** Named colors used by code-drawn art, UI and effects. */
export const C = {
  ink: '#090a14',
  night: '#10141f',
  panel: '#151d28',
  panel2: '#202e37',
  slate: '#394a50',
  steel: '#577277',
  steel2: '#819796',
  steel3: '#a8b5b2',
  silver: '#c7cfcc',
  white: '#ebede9',

  navy: '#172038',
  blue1: '#253a5e',
  blue2: '#3c5e8b',
  blue3: '#4f8fba',
  cyan: '#73bed3',
  ice: '#a4dddb',

  pine: '#19332d',
  green1: '#25562e',
  green2: '#468232',
  green3: '#75a743',
  lime: '#a8ca58',
  sage: '#d0da91',

  earth0: '#4d2b32',
  earth1: '#7a4841',
  earth2: '#ad7757',
  earth3: '#c09473',
  sand: '#d7b594',
  cream: '#e7d5b3',

  plum: '#341c27',
  rust0: '#602c2c',
  rust1: '#884b2b',
  amber: '#be772b',
  gold: '#de9e41',
  pale: '#e8c170',

  wine0: '#241527',
  wine1: '#411d31',
  crimson: '#752438',
  red: '#a53030',
  coral: '#cf573c',
  orange: '#da863e',

  indigo: '#1e1d39',
  violet: '#402751',
  purple: '#7a367b',
  magenta: '#a23e8c',
  pink: '#c65197',
  rose: '#df84a5',
} as const;

/**
 * The UI's named colours (src/ui/ui.ts, STYLE.md "UI"), every one from the set above. The HUD, the
 * inspector and the windows use these names, so money, a rate or a warning reads the same everywhere.
 */
export const UIC = {
  /** Body text. */
  text: C.white,
  /** Secondary text: tooltip bodies, descriptions. */
  soft: C.steel3,
  /** Labels, hints and units: the "/min" after a rate. */
  dim: C.steel2,
  /** Disabled text. */
  off: C.steel,
  /** Panel titles (on the title plate). */
  title: C.pale,
  /** Section headers. */
  head: C.gold,
  money: C.pale,
  power: C.cyan,
  good: C.lime,
  warn: C.gold,
  bad: C.coral,
  link: C.cyan,
  /** Frames and plates, lit from the top left: the outline, the lit edge, the body, the shaded edge. */
  outline: C.ink,
  lit: C.steel,
  frame: C.slate,
  shade: C.panel2,
  /** A panel's content well and its shadowed inner wall. */
  well: C.panel,
  wellShadow: C.night,
  /** A button's face, and its hovered face. */
  face: C.panel2,
  faceHover: C.slate,
  /** An active (latched) button or tab. */
  active: C.amber,
  activeHover: C.gold,
  danger: C.crimson,
} as const;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
