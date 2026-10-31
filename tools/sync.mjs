// Copies the shared code into the skills that use it, so each skill works on its own once installed:
//   lib/<module>.mjs                    → plugins/<plugin>/skills/<skill>/scripts/lib/<module>.mjs
//   mf-themes' built-in themes          → mf-value-stream-map/assets/themes/
//   the library's version (metadata.version in .claude-plugin/marketplace.json, set by tools/release.mjs)
//                                       → each plugin.json and each SKILL.md (metadata.version)
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
// One version for the whole library: the marketplace holds it, the manifests and skills carry a copy (a skill copied
// alone still says which version it is). The marketplace entries carry none: plugin.json wins over them anyway.
const MARKET = join(ROOT, '.claude-plugin', 'marketplace.json');
const market = JSON.parse(readFileSync(MARKET, 'utf8'));
const VERSION = market.metadata && market.metadata.version;
if (!/^\d+\.\d+\.\d+$/.test(VERSION || '')) { console.error('metadata.version in .claude-plugin/marketplace.json: x.y.z required'); process.exit(1); }
const json = (o) => JSON.stringify(o, null, 2) + '\n';
const put = (file, want) => {
  if (readFileSync(file, 'utf8') === want) return;
  diffs.push(relative(ROOT, file));
  if (!check) writeFileSync(file, want);
};
for (const e of market.plugins) delete e.version;
put(MARKET, json(market));
for (const e of market.plugins) {
  const dir = join(ROOT, e.source);
  const pj = join(dir, '.claude-plugin', 'plugin.json');
  put(pj, json({ ...JSON.parse(readFileSync(pj, 'utf8')), version: VERSION }));
  for (const s of readdirSync(join(dir, 'skills'))) {
    const md = join(dir, 'skills', s, 'SKILL.md');
    if (!existsSync(md)) continue;
    const text = readFileSync(md, 'utf8');
    const m = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!m) { console.error(`no frontmatter: ${relative(ROOT, md)}`); process.exit(1); }
    const front = m[1].replace(/\nmetadata:\n(?:  .*\n?)*/, '\n').replace(/\n+$/, '');
    put(md, `---\n${front}\nmetadata:\n  version: "${VERSION}"\n---\n` + text.slice(m[0].length));
  }
}
if (check && diffs.length) { console.error(`OUT OF SYNC (run node tools/sync.mjs):\n- ${diffs.join('\n- ')}`); process.exit(1); }
console.log(diffs.length ? `SYNCED\n- ${diffs.join('\n- ')}` : 'IN SYNC');
