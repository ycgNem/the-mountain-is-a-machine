# The Mountain Is a Machine — project notes for Claude

Start every session by reading `HANDOFF.md` (status, code map, environment, what's next).

- Design lives in `PLAN.md`, the build order in `ROADMAP.md`, art rules in `STYLE.md`, reasons in
  `DECISIONS.md`, the log and PixelLab spend in `PROGRESS.md`. Keep them current in the same change.
- TypeScript strict everywhere, including scripts (`scripts/`, `e2e/` run with Node's type stripping
  or `tsx`). No plain JavaScript source files.
- The simulation (`src/sim/`) is pure: no DOM, no `Math.random` (use the seeded RNG), fixed 60 Hz.
- Pixel rules: whole-pixel positions, whole-number scaling, palette colors only (`src/data/palette.ts`).
- Art is requested by sprite name; every name needs a code-drawn fallback.
- PixelLab: check `get_balance` before each batch; respect the cap in `PROGRESS.md`.
- Review agents: `.claude/agents/indie-critic.md` (design and fun), `art-director.md` (art),
  `qa-screens.md` (visual QA). If they don't register as agent types, run a general-purpose agent
  told to adopt the file. Implement accepted findings and log them in `DECISIONS.md`.
- Don't commit or push unless the owner asks.
