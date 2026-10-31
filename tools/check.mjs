// Checks the whole library before a commit (and in CI): shared code in sync, built-in themes valid, the example
// map valid, its page built in every design without error, and a changelog entry for any change to the skills since
// the last release. node tools/check.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => { process.stdout.write(execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' })); };
const VSM = 'plugins/mf-value-stream-map/skills/mf-value-stream-map/scripts/vsm.mjs';
run(['tools/sync.mjs', '--check']);
run(['plugins/mf-themes/skills/mf-themes/scripts/themes.mjs', 'check']);
run([VSM, 'validate', 'examples/lumen-report-export.json']);
const out = mkdtempSync(join(tmpdir(), 'mf-skills-'));
run([VSM, 'designs', 'examples/lumen-report-export.json', '--output', out]);
run(['plugins/mf-themes/skills/mf-themes/scripts/themes.mjs', 'page', join(out, 'neutral.html')]);
run(['plugins/mf-i18n/skills/mf-i18n/scripts/i18n.mjs', 'check', 'examples/lumen-report-export.json']);
// A change to what users install (plugins/, lib/) since the last release tag needs a line under "## Unreleased".
const git = (args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return null; } };
const tag = git(['describe', '--tags', '--abbrev=0', '--match', 'v*']);
if (tag) {
  const changed = [git(['diff', '--name-only', tag, '--', 'plugins', 'lib']), git(['diff', '--name-only', 'HEAD', '--', 'plugins', 'lib'])].join('\n').trim();
  // Between tools/release.mjs and the new tag, the version is already ahead of the tag: its own section counts.
  const version = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')).metadata.version;
  const heading = version === tag.slice(1) ? 'Unreleased' : `${version.replace(/\./g, '\\.')} \\(`;
  const section = (readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8').match(new RegExp(`^## ${heading}.*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')) || [])[1] || '';
  if (changed && !/^- /m.test(section)) { console.error(`CHANGELOG.md: the skills changed since ${tag}; add a line under "## ${version === tag.slice(1) ? 'Unreleased' : version}"`); process.exit(1); }
  console.log(`OK changelog (since ${tag})`);
} else console.log('OK changelog (no release tag yet)');
console.log('CHECK OK');
