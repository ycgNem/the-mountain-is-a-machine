# The Mountain Is a Machine

A pixel-art factory game about industrializing a mountain that hums.

You run a company dig site at the foot of Old Thrum. Build belts and machines, repair a giant broken
drill, and bore down through six layers (the Surface, the Shallows, the Fungal Caverns, the Crystal
Depths, the Magma Shelf and the Alien Strata). Each layer is its own factory floor, linked to the
others by freight elevators, with one strange material and one hazard that you learn to turn into a
tool. At the bottom is whatever is making that noise.

## Play

Play in the browser: https://ycgnem.github.io/the-mountain-is-a-machine/ (every push to `main`
rebuilds it through GitHub Pages). To run it locally:

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5190/. The title screen holds three save slots, and its "What's new"
button shows the patch notes (`PATCHNOTES.md`).

## Controls

| Input | Action |
|---|---|
| Left click / drag | place, select; drag belts along a path |
| Right click / drag | cancel a tool, remove (refunds everything but rushed goods) |
| WASD, arrows, middle drag | pan (hold Shift to pan faster) |
| Wheel | zoom; over a depot request row, change it by 10 |
| R | rotate the building under the cursor (over the inspector, the one it shows), or what you are placing; a lower elevator station always faces its depot |
| Q | copy the building under the cursor |
| X (or Delete) / E / F | remove / excavate / survey tools (no surveys on the Surface) |
| P | pause or resume the selected machine, miner or collector |
| Shift-click | a request's + or −: change it by 50 |
| [ and ] (or Page Up / Page Down) | layer up / down (or click the Stack) |
| 1–5 | build-bar tabs: Logistics, Production, Power, Utility, Strange (each layer's own machines) |
| Space | pause the game |
| Tab | game speed 1x / 2x |
| C | Company (contracts, licenses, the power line) |
| H or F1 | Field Manual: basics, knowledge cards, controls |
| Ctrl+S | save (it also autosaves every minute) |
| Esc | cancel, close, menu; during the ending, skip to the thank-you card (so does a click) |

## Develop

| Command | What it does |
|---|---|
| `npm run dev` | dev server on port 5190 |
| `npm test` | simulation, data and UI-label tests and the act pacing bots (Vitest) |
| `npm run typecheck` | TypeScript, strict (the game, the tests and the scripts) |
| `npm run build` | typecheck, then the production build into `dist/` |
| `npm run preview` | serve the built `dist/` on port 5190 |
| `npm run release` | build, then zip `dist/` for itch.io into `release/` |
| `npm run shots` | screenshot sweep of every scenario (Playwright, installed Chrome; needs `npm run dev`) into `e2e/out/shots/` |
| `npm run art:build` | import PixelLab art (`art/recipes/`) into the atlas |
| `npm run art:sheet` | contact sheets of the atlas |
| `npm run art:coverage` | sprite names still using placeholder art |

## Docs

- `PLAN.md`: the full game design.
- `ROADMAP.md`: build order and what's done.
- `STYLE.md`: the art bible and asset manifest.
- `DECISIONS.md`: design decisions and why.
- `HANDOFF.md`: current status, code map, environment notes, what's next.
- `PROGRESS.md`: build log and PixelLab spend.
- `PATCHNOTES.md`: player-facing patch notes (the in-game "What's new" window reads it).
- `docs/reviews/`: the review reports the design decisions cite.
