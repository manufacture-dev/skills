// Prepares a release of the library: node tools/release.mjs <x.y.z>
// Sets the version in .claude-plugin/marketplace.json, turns "## Unreleased" of CHANGELOG.md into "## x.y.z (date)",
// copies the version into every plugin and skill (tools/sync.mjs) and runs tools/check.mjs. It commits and tags
// nothing: it prints the commands to run once the diff is read.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const next = process.argv[2];
const parse = (v) => (/^\d+\.\d+\.\d+$/.test(v || '') ? v.split('.').map(Number) : null);
if (!parse(next)) { console.error('usage: node tools/release.mjs <x.y.z>'); process.exit(2); }

const MARKET = join(ROOT, '.claude-plugin', 'marketplace.json');
const market = JSON.parse(readFileSync(MARKET, 'utf8'));
const current = market.metadata.version;
const [a, b] = [parse(next), parse(current)];
if (!(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]))))) {
  console.error(`${next} must be greater than the current version ${current}`); process.exit(1);
}

const LOG = join(ROOT, 'CHANGELOG.md');
const log = readFileSync(LOG, 'utf8');
const m = log.match(/^## Unreleased\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
if (!m || !/^- /m.test(m[1])) { console.error('CHANGELOG.md: nothing under "## Unreleased" to release'); process.exit(1); }
const date = new Date().toISOString().slice(0, 10);
writeFileSync(LOG, log.replace(/^## Unreleased\n/m, `## Unreleased\n\n## ${next} (${date})\n`));
market.metadata.version = next;
writeFileSync(MARKET, JSON.stringify(market, null, 2) + '\n');

const run = (args) => process.stdout.write(execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' }));
run(['tools/sync.mjs']);
run(['tools/check.mjs']);
// The release notes are this version's changelog entry; the annotated tag carries them, and the GitHub release
// takes them from the tag.
const notes = readFileSync(LOG, 'utf8').match(new RegExp(`^## ${next.replace(/\./g, '\\.')} .*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))[1].trim();
const NOTES = join(ROOT, '.git', `RELEASE-${next}.md`);
writeFileSync(NOTES, `${next}\n\n${notes}\n`);
console.log(`
RELEASE ${current} → ${next} prepared. Read the diff, then:
  git commit -am "Release ${next}"
  git tag -a v${next} -F .git/RELEASE-${next}.md
  git push && git push origin v${next}
  gh release create v${next} --title ${next} --notes-from-tag`);
