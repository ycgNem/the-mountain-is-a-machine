// Small code-drawn icons: machine status markers and UI glyphs (colorblind safe: shape + color).

import { C } from '../data/palette';

const cache = new Map<string, HTMLCanvasElement>();

function make(key: string, w: number, h: number, rows: string[], colors: Record<string, string>): HTMLCanvasElement {
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (colors[ch]) {
        ctx.fillStyle = colors[ch];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  cache.set(key, c);
  return c;
}

/**
 * 7x7 status badges drawn over machines, after the darkness (STYLE code-drawn table, art review
 * issue 14). Shape and colour on a dark badge, so they read colour-blind and on any sprite:
 * ○ no input #819796, ✕ blocked #cf573c, ⚡ no power #73bed3, ~ slowed #df84a5,
 * ! missing placement condition #e8c170, ▲ warning (no recipe) #de9e41, ‖ paused #c7cfcc,
 * ≠ jammed (a belt holds an item the machine never takes, or pushes into its front) #da863e.
 */
export function statusIcon(status: string): HTMLCanvasElement | null {
  const o = C.ink;
  const k = C.panel;
  switch (status) {
    case 'no_input':
      return make('st7_noinput', 7, 7, [
        '.ooooo.',
        'okcccko',
        'ockkkco',
        'ockkkco',
        'ockkkco',
        'okcccko',
        '.ooooo.',
      ], { o, k, c: C.steel2 });
    case 'blocked':
      return make('st7_blocked', 7, 7, [
        '.ooooo.',
        'ockkkco',
        'okckcko',
        'okkckko',
        'okckcko',
        'ockkkco',
        '.ooooo.',
      ], { o, k, c: C.coral });
    case 'no_power':
      return make('st7_power', 7, 7, [
        '.ooooo.',
        'okkccko',
        'okcckko',
        'occccco',
        'okkccko',
        'okcckko',
        '.ooooo.',
      ], { o, k, c: C.cyan });
    case 'slowed':
      return make('st7_slow', 7, 7, [
        '.ooooo.',
        'okcckko',
        'ockkcco',
        'okkkkko',
        'okcckko',
        'ockkcco',
        '.ooooo.',
      ], { o, k, c: C.rose });
    case 'misplaced':
      return make('st7_misplaced', 7, 7, [
        '.ooooo.',
        'okkckko',
        'okkckko',
        'okkckko',
        'okkkkko',
        'okkckko',
        '.ooooo.',
      ], { o, k, c: C.pale });
    case 'no_recipe':
      return make('st7_recipe', 7, 7, [
        '.ooooo.',
        'okkckko',
        'okkckko',
        'okcccko',
        'okcccko',
        'occccco',
        '.ooooo.',
      ], { o, k, c: C.gold });
    case 'paused':
      return make('st7_paused', 7, 7, [
        '.ooooo.',
        'okckcko',
        'okckcko',
        'okckcko',
        'okckcko',
        'okckcko',
        '.ooooo.',
      ], { o, k, c: C.silver });
    case 'jammed':
      return make('st7_jammed', 7, 7, [
        '.ooooo.',
        'okkkcko',
        'occccco',
        'okkckko',
        'occccco',
        'okckkko',
        '.ooooo.',
      ], { o, k, c: C.orange });
  }
  return null;
}

export function iconCanvas(name: 'money' | 'power' | 'gear' | 'pause' | 'play' | 'fast' | 'menu' | 'pick' | 'eye' | 'lock' | 'check' | 'arrow' | 'flask' | 'contract' | 'warn'): HTMLCanvasElement {
  const o = C.ink;
  switch (name) {
    case 'money':
      return make('ic_money', 7, 7, ['.ooooo.', 'oyyyyyo', 'oyyoyyo', 'oyoooyo', 'oyyoyyo', 'oyyyyyo', '.ooooo.'], { o, y: C.pale });
    case 'power':
      return make('ic_power', 7, 7, ['...cc..', '..cc...', '.cc....', 'cccccc.', '...cc..', '..cc...', '.cc....'], { c: C.cyan });
    case 'gear':
      return make('ic_gear', 7, 7, ['.s.s.s.', 'sssssss', '.ss.ss.', 'ss...ss', '.ss.ss.', 'sssssss', '.s.s.s.'], { s: C.steel3 });
    case 'pause':
      return make('ic_pause', 7, 7, ['.......', '.ww.ww.', '.ww.ww.', '.ww.ww.', '.ww.ww.', '.ww.ww.', '.......'], { w: C.white });
    case 'play':
      return make('ic_play', 7, 7, ['.w.....', '.ww....', '.www...', '.wwww..', '.www...', '.ww....', '.w.....'], { w: C.white });
    case 'fast':
      return make('ic_fast', 7, 7, ['.......', 'w..w...', 'ww.ww..', 'wwwwww.', 'ww.ww..', 'w..w...', '.......'], { w: C.white });
    case 'menu':
      return make('ic_menu', 7, 7, ['.......', 'wwwwwww', '.......', 'wwwwwww', '.......', 'wwwwwww', '.......'], { w: C.white });
    case 'pick':
      return make('ic_pick', 7, 7, ['.ssss..', 's....s.', '...b..s', '..b....', '.b.....', 'b......', '.......'], { s: C.silver, b: C.earth2 });
    case 'eye':
      return make('ic_eye', 7, 7, ['.......', '..www..', '.wcccw.', 'wcckccw', '.wcccw.', '..www..', '.......'], { w: C.white, c: C.cyan, k: C.ink });
    case 'lock':
      return make('ic_lock', 7, 7, ['..sss..', '.s...s.', '.s...s.', 'yyyyyyy', 'yyyoyyy', 'yyyoyyy', 'yyyyyyy'], { s: C.steel2, y: C.gold, o });
    case 'check':
      return make('ic_check', 7, 7, ['.......', '......g', '.....gg', 'g...gg.', 'gg.gg..', '.ggg...', '..g....'], { g: C.lime });
    case 'arrow':
      return make('ic_arrow', 7, 7, ['...w...', '...ww..', 'wwwwww.', 'wwwwwww', 'wwwwww.', '...ww..', '...w...'], { w: C.white });
    case 'flask':
      return make('ic_flask', 7, 7, ['..sss..', '...s...', '...s...', '..sgs..', '.sgggs.', 'sgggggs', 'sssssss'], { s: C.silver, g: C.lime });
    case 'contract':
      return make('ic_contract', 7, 7, ['ccccc..', 'cwwwcc.', 'cwkwwc.', 'cwwwwc.', 'cwkkwc.', 'cwwwwc.', 'cccccc.'], { c: C.sand, w: C.cream, k: C.earth1 });
    case 'warn':
      return make('ic_warn', 7, 7, ['...a...', '..aka..', '..aka..', '.aakaa.', '.aaaaa.', 'aaakaaa', 'aaaaaaa'], { a: C.gold, k: C.ink });
  }
}
