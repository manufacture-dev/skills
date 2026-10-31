// Checks the whole library before a commit (and in CI): shared code in sync, built-in themes valid, the example
// map valid, its page built in every design without error. node tools/check.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
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
console.log('CHECK OK');
