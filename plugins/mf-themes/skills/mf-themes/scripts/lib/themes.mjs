// Copied from lib/themes.mjs by tools/sync.mjs: edit the source at the root of the skills repository, not this copy.
// Themes for a page built on a base: the base keeps its own CSS in `@layer page`; a theme is a folder (theme.json,
// theme.css, fonts/) whose CSS is injected unlayered after it, so it wins without heavier selectors. Shared by the
// mf-themes skill and the skills that use themes (mf-value-stream-map); the source is lib/themes.mjs at the root of
// the skills repository, copied into each skill by tools/sync.mjs. No dependencies, Node 18+.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// "neutral" is the base as it is; every folder of `dir` that holds a theme.css is a built-in theme.
export function listThemes(dir) {
  return ['neutral', ...(dir && existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, 'theme.css'))).sort() : [])];
}

// A theme by name (a folder of `dir`) or by path (absolute, or relative to `base`).
export function themeDir(theme, { dir, base } = {}) {
  if (!theme || theme === 'neutral') return null;
  if (dir && existsSync(join(dir, theme, 'theme.css'))) return join(dir, theme);
  return resolve(base || '.', theme);
}

export function themeMeta(folder) {
  try { return JSON.parse(readFileSync(join(folder, 'theme.json'), 'utf8')); } catch (e) { return {}; }
}

export function themeInfo(theme, opts = {}) {
  if (!theme || theme === 'neutral') return 'The base page: sober, system fonts, greys.';
  return themeMeta(themeDir(theme, opts)).description || '';
}

// The CSS to inject: the theme's fonts as data URIs (the page stays one file, works offline and where only inline
// resources load), its theme.css, then tokens {light, dark} (an organisation's colours or font) on top.
export function themeCss(theme, { dir, base, tokens } = {}) {
  let css = '';
  const folder = themeDir(theme, { dir, base });
  if (folder) {
    if (!existsSync(join(folder, 'theme.css'))) throw new Error(`theme "${theme}": no theme.css in ${folder} (built-in: ${listThemes(dir).join(', ')})`);
    for (const f of themeMeta(folder).fonts || []) {
      const b64 = readFileSync(join(folder, f.file)).toString('base64');
      css += `@font-face{font-family:"${f.family}";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${f.weight || '400'};font-style:${f.style || 'normal'};font-display:swap${f.unicodeRange ? `;unicode-range:${f.unicodeRange}` : ''}}\n`;
    }
    css += readFileSync(join(folder, 'theme.css'), 'utf8');
  }
  const decl = (o) => Object.entries(o || {}).filter(([k]) => /^--[\w-]+$/.test(k)).map(([k, v]) => `${k}:${String(v).replace(/[;{}<]/g, '')}`).join(';');
  if (tokens && (tokens.light || tokens.dark)) css += `\n:root{${decl(tokens.light)}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${decl(tokens.dark)}}}:root[data-theme="dark"]{${decl(tokens.dark)}}`;
  return css;
}

// Put the theme in the page: one <style id="mf-theme"> right after the page's first style block, replaced in place
// on the next run (an empty css removes it).
export function withTheme(html, css) {
  const RE = /\n?<style id="mf-theme">[\s\S]*?<\/style>/;
  html = html.replace(RE, '');
  if (!css) return html;
  const tag = `<style id="mf-theme">\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`;
  const i = html.indexOf('</style>');
  return i < 0 ? tag + html : html.slice(0, i + 8) + '\n' + tag + html.slice(i + 8);
}

// Checks a theme folder: theme.json fields, every font declared and present with a free licence, a licence file
// per family, no network in the CSS (no external url(), no @import, no @font-face of its own).
export function checkTheme(folder) {
  const errs = [], meta = themeMeta(folder);
  if (!existsSync(join(folder, 'theme.css'))) return ['no theme.css'];
  if (!meta.name) errs.push('theme.json: name');
  if (!meta.description) errs.push('theme.json: description (one sentence)');
  const FREE = /^(OFL-1\.1|Apache-2\.0|MIT|CC0-1\.0|CC-BY-4\.0|Ubuntu-1\.0)$/;
  for (const f of meta.fonts || []) {
    for (const k of ['family', 'file', 'license', 'author', 'source']) if (!f[k]) errs.push(`font ${f.family || f.file || '?'}: ${k}`);
    if (f.file && !existsSync(join(folder, f.file))) errs.push(`font file missing: ${f.file}`);
    if (f.license && !FREE.test(f.license)) errs.push(`font ${f.family}: licence ${f.license} is not a free licence`);
  }
  const fontsDir = join(folder, 'fonts');
  if (existsSync(fontsDir)) {
    const files = readdirSync(fontsDir), declared = new Set((meta.fonts || []).map((f) => f.file.replace(/^fonts\//, '')));
    for (const f of files) if (/\.(woff2?|ttf|otf)$/.test(f) && !declared.has(f)) errs.push(`font not declared in theme.json: fonts/${f}`);
    for (const fam of new Set((meta.fonts || []).map((f) => f.family))) if (!files.some((f) => /^LICEN[CS]E/i.test(f) && f.toLowerCase().replace(/[^a-z0-9]/g, '').includes(fam.toLowerCase().replace(/[^a-z0-9]/g, '')))) errs.push(`no licence file for ${fam} in fonts/ (LICENSE-<family>.txt)`);
  }
  const css = readFileSync(join(folder, 'theme.css'), 'utf8');
  if (/url\(\s*['"]?(https?:)?\/\//i.test(css)) errs.push('theme.css: external url() (only data: URIs)');
  if (/@import/i.test(css)) errs.push('theme.css: @import');
  if (/@font-face/i.test(css)) errs.push('theme.css: @font-face (declare fonts in theme.json; they are embedded for you)');
  if (/animation\s*:/i.test(css) && !/prefers-reduced-motion:\s*no-preference/i.test(css)) errs.push('theme.css: animation outside @media (prefers-reduced-motion: no-preference)');
  return errs;
}

// A page that shows each theme in a frame, with its name and description: to choose a design.
export function designsBoard(items, title = 'Designs') {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>:root{color-scheme:light dark}body{margin:0;font:14px/1.4 system-ui,sans-serif;background:Canvas;color:CanvasText;padding:16px}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;opacity:.75}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:16px}
figure{margin:0;border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-radius:8px;overflow:hidden}
figcaption{padding:8px 12px;font-weight:600;display:flex;justify-content:space-between;gap:12px}figcaption small{font-weight:400;opacity:.75}.frame{height:620px;overflow:hidden;position:relative}iframe{width:200%;height:1240px;border:0;display:block;transform:scale(.5);transform-origin:0 0}</style></head>
<body><h1>${esc(title)}</h1><p>The same page in each design. Say which one to keep.</p><div class="grid">
${items.map(([n, u, d]) => `<figure><figcaption><span>${esc(n)}${d ? `<small> · ${esc(d)}</small>` : ''}</span><a href="${esc(u)}" target="_blank" rel="noopener">open</a></figcaption><div class="frame"><iframe src="${esc(u)}" loading="lazy" title="${esc(n)}"></iframe></div></figure>`).join('\n')}
</div></body></html>`;
}
