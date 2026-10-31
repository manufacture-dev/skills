#!/usr/bin/env node
// Languages for a page and its JSON data: check the language fields, list the texts still to translate, add
// translations, add a language, list a page's labels to translate. No dependencies, Node 18+.
//   node i18n.mjs check     <data.json>
//   node i18n.mjs texts     <data.json> --lang <code> [--missing] [--skip key1,key2]   (texts → translations, JSON)
//   node i18n.mjs translate <data.json> --lang <code> --texts '<json>' | --file <texts.json>
//   node i18n.mjs add       <data.json> --lang <code>                                 (adds the language to `languages`)
//   node i18n.mjs labels    <page.html> --lang <code> [--data <data.json>] [--missing]  (the page's labels, English)
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { LANG_RE, checkLanguages, textsOf, missingTexts, addTranslations, labelsToTranslate } from './lib/i18n.mjs';

if (Number(process.versions.node.split('.')[0]) < 18) { console.error(`Node 18 or later is needed (this is ${process.version}): https://nodejs.org`); process.exit(2); }
const [cmd, file] = process.argv.slice(2);
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const has = (n) => process.argv.includes(n);
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const write = (f, d) => { const t = `${f}.${process.pid}.tmp`; writeFileSync(t, JSON.stringify(d, null, 2) + '\n'); renameSync(t, f); };
if (!cmd || !file || !existsSync(file)) { console.error('usage: i18n.mjs <check|texts|translate|add|labels> <file> …'); process.exit(2); }
const lang = arg('--lang');
const need = () => { if (!lang || !LANG_RE.test(lang)) { console.error('--lang <code> (en, fr, de, pt-BR…)'); process.exit(2); } };
const skip = (arg('--skip') || '').split(',').map((x) => x.trim()).filter(Boolean);

if (cmd === 'check') {
  const errs = checkLanguages(read(file));
  console.log(errs.length ? `INVALID ${file}\n- ${errs.join('\n- ')}` : `VALID ${file}`); process.exit(errs.length ? 1 : 0);
} else if (cmd === 'texts') {
  need(); const d = read(file), have = (d.i18n || {})[lang] || {};
  const list = has('--missing') ? missingTexts(d, lang, skip) : textsOf(d, skip);
  console.log(JSON.stringify(Object.fromEntries(list.map((t) => [t, have[t] || ''])), null, 2));
  console.error(`${list.length} text(s)${has('--missing') ? ' without a translation' : ''} for "${lang}"`);
} else if (cmd === 'translate') {
  need(); const d = read(file);
  const texts = JSON.parse(arg('--file') ? readFileSync(arg('--file'), 'utf8') : (arg('--texts') || '{}'));
  addTranslations(d, { lang, texts });
  const errs = checkLanguages(d); if (errs.length) { console.error(`INVALID, nothing written:\n- ${errs.join('\n- ')}`); process.exit(1); }
  write(file, d); console.log(`TRANSLATED ${Object.keys(texts).length} text(s) into ${lang}; ${missingTexts(d, lang, skip).length} left`);
} else if (cmd === 'add') {
  need(); const d = read(file); d.languages = d.languages || ['en'];
  if (!d.languages.includes(lang)) d.languages.push(lang);
  write(file, d); console.log(`LANGUAGES ${d.languages.join(', ')}`);
} else if (cmd === 'labels') {
  need(); const html = readFileSync(file, 'utf8');
  console.log(JSON.stringify(labelsToTranslate(html, lang, { data: arg('--data') ? read(arg('--data')) : null, missing: has('--missing') }), null, 2));
} else { console.error(`unknown command ${cmd}`); process.exit(2); }
