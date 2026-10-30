import { Game } from '../src/sim/game';
import { TICK } from '../src/sim/types';

export function run(g: Game, seconds: number): void {
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n; i++) g.tick();
}

/** A fresh Surface with every cell open floor, no fixed buildings in the way of tests. */
export function sandbox(extra: Record<string, number> = {}): Game {
  const g = Game.create(1);
  const L = g.layer(0);
  for (const b of [...g.s.buildings.values()]) {
    if (!g.def(b).fixed) g.remove(0, b.x, b.y);
  }
  for (let i = 0; i < L.w * L.h; i++) {
    if (L.terrain[i] === 1) L.terrain[i] = 0;
  }
  L.stock = { iron_plate: 999, gear: 999, copper_wire: 999, brick: 999, steel_beam: 999, motor: 999, ...extra };
  g.s.money = 100000;
  g.debugUnlockAll();
  return g;
}

/** Mark a building's footprint (or any rect) in one of a layer's cell maps. */
export function paint(arr: Uint8Array, w: number, x: number, y: number, size: number, v = 1): void {
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) arr[(y + dy) * w + x + dx] = v;
}
