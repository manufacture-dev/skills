// Copies the shared code into the skills that use it, so each skill works on its own once installed:
//   lib/<module>.mjs                    → plugins/<plugin>/skills/<skill>/scripts/lib/<module>.mjs
//   mf-themes' built-in themes          → mf-value-stream-map/assets/themes/
// node tools/sync.mjs           write the copies
// node tools/sync.mjs --check   exit 1 if a copy differs from its source (run before committing, and in CI)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, cpSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const skill = (p, s) => join(ROOT, 'plugins', p, 'skills', s);
// Which shared modules each skill carries.
const USES = {
  [skill('mf-value-stream-map', 'mf-value-stream-map')]: ['themes', 'i18n'],
  [skill('mf-themes', 'mf-themes')]: ['themes'],
  [skill('mf-i18n', 'mf-i18n')]: ['i18n'],
};
const THEMES_SRC = join(skill('mf-themes', 'mf-themes'), 'themes');
const THEME_COPIES = [join(skill('mf-value-stream-map', 'mf-value-stream-map'), 'assets', 'themes')];

const check = process.argv.includes('--check');
const diffs = [];
const header = (m) => `// Copied from lib/${m}.mjs by tools/sync.mjs: edit the source at the root of the skills repository, not this copy.\n`;
for (const [dir, mods] of Object.entries(USES)) for (const m of mods) {
  const want = header(m) + readFileSync(join(ROOT, 'lib', `${m}.mjs`), 'utf8');
  const out = join(dir, 'scripts', 'lib', `${m}.mjs`);
  const have = existsSync(out) ? readFileSync(out, 'utf8') : null;
  if (have === want) continue;
  diffs.push(relative(ROOT, out));
  if (!check) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, want); }
}
const files = (d) => (existsSync(d) ? readdirSync(d, { recursive: true }).filter((f) => statSync(join(d, f)).isFile()).sort() : []);
for (const dest of THEME_COPIES) {
  const a = files(THEMES_SRC), b = files(dest);
  const same = a.length === b.length && a.every((f, i) => f === b[i] && readFileSync(join(THEMES_SRC, f)).equals(readFileSync(join(dest, f))));
  if (same) continue;
  diffs.push(relative(ROOT, dest) + '/');
  if (!check) { rmSync(dest, { recursive: true, force: true }); cpSync(THEMES_SRC, dest, { recursive: true }); }
}
if (check && diffs.length) { console.error(`OUT OF SYNC (run node tools/sync.mjs):\n- ${diffs.join('\n- ')}`); process.exit(1); }
console.log(diffs.length ? `SYNCED\n- ${diffs.join('\n- ')}` : 'IN SYNC');
