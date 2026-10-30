// Tiny pixel particles: sparks, smoke, steam, spores, dust, rock chips, coin floats.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
  layer: number;
  text?: string;
}

export class Particles {
  list: Particle[] = [];
  private seed = 1;

  rand(): number {
    // Visual-only randomness, deterministic enough and cheap.
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  add(p: Omit<Particle, 'max'> & { max?: number }): void {
    if (this.list.length > 1500) return;
    this.list.push({ ...p, max: p.max ?? p.life });
  }

  burst(layer: number, x: number, y: number, n: number, colors: string[], speed: number, life: number, grav = 0, size = 1): void {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const s = speed * (0.4 + this.rand() * 0.8);
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + this.rand() * 0.6),
        color: colors[Math.floor(this.rand() * colors.length)],
        size,
        grav,
        layer,
      });
    }
  }

  text(layer: number, x: number, y: number, text: string, color: string): void {
    this.add({ x, y, vx: 0, vy: -12, life: 1.4, color, size: 1, grav: 0, layer, text });
  }

  update(dt: number): void {
    const out: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      out.push(p);
    }
    this.list = out;
  }
}
