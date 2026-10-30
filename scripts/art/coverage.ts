/**
 * art:coverage: which sprite names the game asks for are in public/art/atlas.json, and which are
 * still missing (those fall back to code-drawn art).
 *
 *   node scripts/art/coverage.ts [--json]
 *
 * The wanted names are derived from the data files, parsed as text (wantedSprites() in lib.ts):
 *   i_<id>                  every item id in src/data/items.ts
 *   b_<id>                  every building id in src/data/buildings.ts except the code-drawn belts
 *                           and belt pieces (belt, express_belt, insulated_belt, splitter, crossing,
 *                           sorter), plus b_drill_broken, b_heart_dormant
 *   d_<ore>_1..3            iron_ore copper_ore stone coal sapstone glowcap chorus_crystal emberite
 *                           thrumstone
 *   x_l<layer>_<name>       every name in each layer's decor list in src/data/layers.ts, plus
 *                           AMBER_SPRITE (16 x 16; the seven in DECOR_32 are 32 x 32)
 *   t_<set>                 the TERRAIN_SETS list the game loads in src/render/atlas.ts (if it can't
 *                           be read: the art plan's ten sets, TERRAIN_SETS in lib.ts)
 *   p_mags, title_art
 * Optional, never missing: t_<set>_v1..v<n>, the floor variants the game scatters among a set's
 * plain tiles when the atlas has them (TERRAIN_VARIANTS in src/render/atlas.ts); the report lists
 * the ones there.
 * Works before the first build (no atlas.json: everything is missing). Always exits 0 unless the
 * data files or atlas.json can't be read. --json prints the result as JSON instead.
 */
import { ATLAS_JSON, GROUP_LABELS, naturalCompare, percent, readAtlasJson, rel, wantedSprites, wrapWords } from './lib.ts';
import type { AtlasJson, WantedSprite } from './lib.ts';

const USAGE = 'usage: node scripts/art/coverage.ts [--json]';

interface GroupReport {
  group: string;
  label: string;
  prefix: string;
  total: number;
  covered: number;
  missing: string[];
}

function main(argv: string[]): number {
  const asJson = argv.includes('--json');
  const unknown = argv.filter((a) => a !== '--json');
  if (unknown.length > 0) {
    console.error(`art:coverage: unknown option ${unknown.join(' ')}\n${USAGE}`);
    return 2;
  }

  let all: WantedSprite[];
  let atlas: AtlasJson | null;
  try {
    all = wantedSprites();
    atlas = readAtlasJson();
  } catch (e) {
    console.error(`art:coverage: ${(e as Error).message}`);
    return 1;
  }

  const have = new Set(Object.keys(atlas?.sprites ?? {}));
  const wanted = all.filter((w) => !w.optional);
  const optional = all.filter((w) => w.optional && have.has(w.name)).map((w) => w.name);
  const wantedNames = new Set(all.map((w) => w.name));
  const groups: GroupReport[] = [];
  for (const w of wanted) {
    let g = groups.find((r) => r.group === w.group);
    if (!g) {
      g = {
        group: w.group,
        label: GROUP_LABELS[w.group] ?? w.group,
        prefix: w.group.length === 1 ? `${w.group}_` : '',
        total: 0,
        covered: 0,
        missing: [],
      };
      groups.push(g);
    }
    g.total++;
    if (have.has(w.name)) g.covered++;
    else g.missing.push(w.name);
  }
  const total = wanted.length;
  const covered = wanted.filter((w) => have.has(w.name)).length;
  const missing = groups.flatMap((g) => g.missing);
  const extra = [...have].filter((n) => !wantedNames.has(n)).sort(naturalCompare);

  if (asJson) {
    const result = {
      atlas: rel(ATLAS_JSON),
      exists: atlas !== null,
      built: atlas?.built ?? null,
      covered,
      total,
      groups: Object.fromEntries(
        groups.map((g) => [g.group, { label: g.label, covered: g.covered, total: g.total, missing: g.missing }]),
      ),
      missing,
      optional,
      extra,
    };
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(
    `art:coverage: ${covered}/${total} sprite names the game asks for are in ${rel(ATLAS_JSON)} (${percent(covered, total)})`,
  );
  if (!atlas) console.log(`  ${rel(ATLAS_JSON)} doesn't exist yet, so everything is missing (npm run art:build makes it)`);
  else if (atlas.built) console.log(`  atlas built ${atlas.built}`);
  console.log('');
  for (const g of groups) {
    const bar = g.total ? '#'.repeat(Math.round((g.covered / g.total) * 20)).padEnd(20, '.') : '';
    console.log(`  ${g.label.padEnd(10)} ${g.prefix.padEnd(6)} ${`${g.covered}/${g.total}`.padStart(7)}  ${bar}`);
  }

  if (missing.length > 0) {
    console.log(`\nMissing (${missing.length}), drawn by code until art arrives:`);
    for (const g of groups) {
      if (g.missing.length === 0) continue;
      console.log(`  ${[g.prefix, g.label].filter((s) => s !== '').join(' ')} (${g.missing.length}):`);
      console.log(wrapWords(g.missing, 100, '    '));
    }
  } else {
    console.log('\nNothing missing.');
  }
  if (optional.length > 0) {
    console.log(`\nFloor variants in the atlas (${optional.length}; optional, scattered among their set's plain tiles):`);
    console.log(wrapWords(optional, 100, '    '));
  }
  if (extra.length > 0) {
    console.log(`\nIn the atlas but not asked for by the game data (${extra.length}; typos or leftovers?):`);
    console.log(wrapWords(extra, 100, '    '));
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
