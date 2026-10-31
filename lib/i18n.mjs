// Languages for a page and its data: `languages` (the data's own language first), `i18n.<code>` (each text, whole,
// translated into the other languages), `ui.<code>` (the page's labels for a language the page does not ship).
// Shared by the mf-i18n skill and the skills that use it (mf-value-stream-map); the source is lib/i18n.mjs at the
// root of the skills repository, copied into each skill by tools/sync.mjs. No dependencies, Node 18+.
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// Errors in the language fields of `data`, as "path: message".
export function checkLanguages(data) {
  const errs = [], err = (p, m) => errs.push(`${p}: ${m}`);
  if (data.languages !== undefined) {
    if (!Array.isArray(data.languages) || !data.languages.length || data.languages.some((l) => typeof l !== 'string' || !LANG_RE.test(l))) err('languages', 'list of language codes (en, fr, de, pt-BR…), the data\'s own language first');
    else {
      if (new Set(data.languages).size !== data.languages.length) err('languages', 'duplicate code');
      for (const l of Object.keys(data.i18n || {})) if (!data.languages.includes(l) || l === data.languages[0]) err(`i18n.${l}`, `"${l}" is not one of the other languages (${data.languages.slice(1).join(', ') || 'none'})`);
    }
  }
  for (const [l, d] of Object.entries(data.i18n || {})) if (!d || typeof d !== 'object' || Array.isArray(d) || Object.values(d).some((v) => typeof v !== 'string')) err(`i18n.${l}`, 'an object: text in the data\'s language → its translation');
  if (data.ui !== undefined && (typeof data.ui !== 'object' || Array.isArray(data.ui))) err('ui', 'an object: language code → page labels');
  return errs;
}

// Every text of the data a page may show: each string value except under the keys in `skip` (ids, references,
// codes) and the language fields themselves; pure numbers and ranges are not texts.
export const BASE_SKIP = ['id', 'i18n', 'ui', 'languages'];
export function textsOf(data, skip = []) {
  const no = new Set([...BASE_SKIP, ...skip]), out = new Set();
  const walk = (v, key) => {
    if (no.has(key)) return;
    if (typeof v === 'string') { if (v.trim() && !/^[\d\s.,:%~–-]+$/.test(v)) out.add(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key)); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(data, '');
  return [...out];
}

// The texts still without a translation in `lang`.
export function missingTexts(data, lang, skip = []) {
  const have = (data.i18n || {})[lang] || {};
  return textsOf(data, skip).filter((t) => !(t in have));
}

// {"lang", "texts": {"<text>": "<translation>"}}: merged into data.i18n.<lang> (texts may hold dots: no path).
export function addTranslations(data, op) {
  const { lang, texts } = op || {};
  if (!lang || !texts || typeof texts !== 'object') throw new Error('translate: {"lang", "texts": {…}}');
  data.i18n = data.i18n || {};
  data.i18n[lang] = { ...(data.i18n[lang] || {}), ...texts };
  return data;
}

// The labels a page ships, from its <script type="application/json" data-i18n-labels> block: {en: {...}, fr: {...}}.
export function pageLabels(html) {
  const m = html.match(/<script[^>]*data-i18n-labels[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

// The labels to translate for `lang`: the English ones, or with `missing` only the keys neither the page nor
// data.ui.<lang> has. Keep the keys, the {placeholders} and the one/other forms.
export function labelsToTranslate(html, lang, { data, missing } = {}) {
  const ui = pageLabels(html) || {};
  const have = { ...(ui[lang] || {}), ...(((data || {}).ui || {})[lang] || {}) };
  return missing ? Object.fromEntries(Object.entries(ui.en || {}).filter(([k]) => !(k in have))) : (ui.en || {});
}
