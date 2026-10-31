#!/usr/bin/env node
// Design systems for a page: list the built-in themes, check a theme folder, apply a theme to a page, build a board
// to compare several, start a new theme, check that a page can be themed. No dependencies, Node 18+.
//   node themes.mjs list                                              (built-in themes and what each is)
//   node themes.mjs check    <theme folder>…                          (theme.json, fonts and licences, no network)
//   node themes.mjs page     <page.html>                              (can this page be themed: @layer page, data-part hooks)
//   node themes.mjs apply    <page.html> --theme <name|folder> [--tokens '<json>'] [--output <file>]
//   node themes.mjs board    <page.html> --themes <a,b,c> --output <dir> [--title <text>]
//   node themes.mjs new      <folder> --name <name> --description <one sentence>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listThemes, themeCss, themeInfo, withTheme, checkTheme, designsBoard } from './lib/themes.mjs';

if (Number(process.versions.node.split('.')[0]) < 18) { console.error(`Node 18 or later is needed (this is ${process.version}): https://nodejs.org`); process.exit(2); }
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'themes');
const [cmd, ...rest] = process.argv.slice(2);
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const pos = rest.filter((x, i) => !x.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
const tokens = () => { const t = arg('--tokens'); if (!t) return undefined; return JSON.parse(existsSync(t) ? readFileSync(t, 'utf8') : t); };

if (cmd === 'list') {
  for (const t of listThemes(DIR)) console.log(`${t} · ${themeInfo(t, { dir: DIR })}`);
} else if (cmd === 'check') {
  let bad = 0;
  for (const f of pos.length ? pos : listThemes(DIR).slice(1).map((t) => join(DIR, t))) {
    const errs = checkTheme(resolve(f));
    console.log(errs.length ? `INVALID ${f}\n- ${errs.join('\n- ')}` : `VALID ${f}`); if (errs.length) bad = 1;
  }
  process.exit(bad);
} else if (cmd === 'page') {
  const html = readFileSync(pos[0], 'utf8');
  const layered = /@layer\s+page\s*\{/.test(html), parts = [...new Set([...html.matchAll(/data-part="([\w-]+)"/g)].map((m) => m[1]))];
  console.log(`${layered ? 'OK' : 'MISSING'} @layer page (the page's own CSS must be inside it, so a theme wins without heavier selectors)`);
  console.log(`${parts.length ? 'OK' : 'MISSING'} data-part hooks: ${parts.join(', ') || 'none'}`);
  process.exit(layered && parts.length ? 0 : 1);
} else if (cmd === 'apply') {
  const page = pos[0], out = arg('--output') || page;
  const html = withTheme(readFileSync(page, 'utf8'), themeCss(arg('--theme'), { dir: DIR, base: process.cwd(), tokens: tokens() }));
  writeFileSync(out, html); console.log(`THEMED ${resolve(out)} (${arg('--theme') || 'neutral'})`);
} else if (cmd === 'board') {
  const page = pos[0], out = arg('--output'); if (!out) { console.error('--output <dir>'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const base = readFileSync(page, 'utf8'), items = [];
  for (const t of (arg('--themes') || listThemes(DIR).join(',')).split(',').map((x) => x.trim()).filter(Boolean)) {
    const name = basename(t.replace(/\/+$/, ''));
    writeFileSync(join(out, `${name}.html`), withTheme(base, themeCss(t, { dir: DIR, base: process.cwd(), tokens: tokens() })));
    items.push([name, `${name}.html`, themeInfo(t, { dir: DIR, base: process.cwd() })]);
  }
  writeFileSync(join(out, 'index.html'), designsBoard(items, arg('--title') || 'Designs'));
  console.log(`BOARD ${resolve(out)}/index.html (${items.map((x) => x[0]).join(', ')})`);
} else if (cmd === 'new') {
  const f = pos[0]; if (!f || !arg('--name')) { console.error('new <folder> --name <name> --description <sentence>'); process.exit(2); }
  if (existsSync(join(f, 'theme.css'))) { console.error(`exists: ${f}`); process.exit(1); }
  mkdirSync(join(f, 'fonts'), { recursive: true });
  writeFileSync(join(f, 'theme.json'), JSON.stringify({ name: arg('--name'), description: arg('--description') || '', fonts: [] }, null, 2) + '\n');
  writeFileSync(join(f, 'theme.css'), `/* ${arg('--name')}: ${arg('--description') || ''}\n   Unlayered over the page's @layer page. Tokens first (light, then dark twice), then the components. */\n:root{}\n@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark}}\n:root[data-theme="dark"]{color-scheme:dark}\n`);
  console.log(`CREATED ${resolve(f)} (theme.json, theme.css, fonts/)`);
} else {
  console.error('usage: themes.mjs <list|check|page|apply|board|new> …'); process.exit(2);
}
