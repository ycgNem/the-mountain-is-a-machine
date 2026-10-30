// Mouse and keyboard state in device pixels, with per-frame pressed/released edges.

export class Input {
  /** Mouse position in device pixels. */
  mx = 0;
  my = 0;
  inside = false;
  down = [false, false, false];
  pressed = [false, false, false];
  released = [false, false, false];
  wheel = 0;
  keys = new Set<string>();
  keyPressed = new Set<string>();
  /** Set when the UI handled the mouse this frame; the world ignores it. */
  uiCapture = false;
  /** The UI keeps the mouse while a drag that started on it is held. */
  dragOnUi = false;
  dpr = 1;
  private canvas: HTMLCanvasElement;
  onFirstGesture: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousemove', (e) => this.move(e));
    canvas.addEventListener('mouseenter', () => (this.inside = true));
    canvas.addEventListener('mouseleave', () => (this.inside = false));
    canvas.addEventListener('mousedown', (e) => {
      this.move(e);
      if (e.button <= 2) {
        this.down[e.button] = true;
        this.pressed[e.button] = true;
      }
      if (e.button === 1) e.preventDefault();
      this.gesture();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button <= 2) {
        this.down[e.button] = false;
        this.released[e.button] = true;
      }
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      const k = normKey(e);
      if (['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'Backspace'].includes(e.key)) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'z')) e.preventDefault();
      if (!this.keys.has(k)) {
        this.keyPressed.add(k);
        // Shortcuts carry their modifier with the press ('Mod+z' for Ctrl+Z or Cmd+Z), so one
        // typed faster than a frame still counts after Ctrl is let go.
        if (e.ctrlKey || e.metaKey) this.keyPressed.add(`Mod+${k}`);
      }
      this.keys.add(k);
      this.gesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(normKey(e)));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.down = [false, false, false];
    });
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  private move(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mx = (e.clientX - r.left) * this.dpr;
    this.my = (e.clientY - r.top) * this.dpr;
    this.inside = true;
  }

  key(k: string): boolean {
    return this.keys.has(k);
  }

  hit(k: string): boolean {
    return this.keyPressed.has(k);
  }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.pressed = [false, false, false];
    this.released = [false, false, false];
    this.wheel = 0;
    this.keyPressed.clear();
    this.uiCapture = false;
    if (!this.down[0] && !this.down[2]) this.dragOnUi = false;
  }
}

function normKey(e: KeyboardEvent): string {
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key;
}
