// mf-i18n page runtime (MIT): include once in a page, before the page's own script. Reads the data's language
// fields and the page's labels, and gives the page what it needs to render in any language.
//   const L = MfI18n.create(data, labels)   data: {languages, i18n, ui}; labels: the page's {en: {...}, fr: {...}}
//   L.lang, L.languages, L.set(code)        current language, all of them, switch (remembered in localStorage)
//   L.t(key, ...args)                        a page label; {n} {m} placeholders by position of `names`; {one, other}
//   L.tr(text)                               a text of the data, translated (or as written)
//   L.num(v, digits)                         a number in the language's format
//   L.picker(onChange)                       HTML for a switch (2 languages) or a list (3 and more); call L.bind(root, onChange)
(function (g) {
  const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a && a[k] && typeof a[k] === 'object' && !('one' in v) ? merge(a[k], v) : v; return o; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function create(data, labels, opts) {
    const langs = Array.isArray(data.languages) && data.languages.length ? data.languages : ['en', ...Object.keys(data.i18n || {})];
    const key = (opts && opts.storageKey) || 'mf-lang';
    let lang = langs[0]; try { const l = localStorage.getItem(key); if (langs.includes(l)) lang = l; } catch (e) {}
    const dict = (l) => merge(merge(labels.en || {}, labels[l] || {}), (data.ui || {})[l] || {});
    const name = (l) => { const d = dict(l); if (d.langName && (labels[l] || (data.ui || {})[l])) return d.langName; try { return new Intl.DisplayNames([l], { type: 'language' }).of(l); } catch (e) { return l.toUpperCase(); } };
    const L = {
      get lang() { return lang; }, languages: langs, source: langs[0], name,
      set(l) { if (langs.includes(l)) { lang = l; try { localStorage.setItem(key, l); } catch (e) {} } },
      t(k, ...args) { let v = dict(lang)[k]; if (v && typeof v === 'object' && 'one' in v) v = args[0] === 1 ? v.one : v.other; if (typeof v !== 'string') return v; let i = 0; return v.replace(/\{(\w+)\}/g, () => String(args[i++] ?? '')); },
      tr(s) { return s == null || lang === langs[0] ? s : ((data.i18n || {})[lang] || {})[s] || s; },
      num(v, d) { try { return new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }).format(v); } catch (e) { return v.toFixed(d); } },
      picker() {
        if (langs.length < 2) return '';
        if (langs.length === 2) return `<div class="mf-lang" role="group" aria-label="${esc(L.t('langLabel') || 'Language')}">${langs.map((l) => `<button type="button" data-mf-lang="${esc(l)}" aria-pressed="${l === lang}" title="${esc(name(l))}">${esc(l.toUpperCase())}</button>`).join('')}</div>`;
        return `<label class="mf-lang"><span>${esc(L.t('langLabel') || 'Language')}</span> <select data-mf-lang-select>${langs.map((l) => `<option value="${esc(l)}"${l === lang ? ' selected' : ''}>${esc(name(l))}</option>`).join('')}</select></label>`;
      },
      bind(root, onChange) {
        root.querySelectorAll('[data-mf-lang]').forEach((b) => b.addEventListener('click', () => { L.set(b.dataset.mfLang); onChange(lang); }));
        const s = root.querySelector('[data-mf-lang-select]'); if (s) s.addEventListener('change', () => { L.set(s.value); onChange(lang); });
        document.documentElement.lang = lang;
      },
    };
    return L;
  }
  g.MfI18n = { create };
})(typeof window !== 'undefined' ? window : globalThis);
