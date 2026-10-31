# Changelog

One version for the whole library, in [semver](https://semver.org). While it is 0.x, a minor version may change the map format or a command; the entry says what to do. Each change goes under **Unreleased** in the same commit, in one sentence on what changes for the person using the skill; `node tools/release.mjs <version>` turns it into a release.

## Unreleased

- **Versions.** One version for the library, written in each skill (`metadata.version` in `SKILL.md`) and plugin; this changelog; `tools/release.mjs`. Maps now carry `schemaVersion` (1): a map from a newer skill is refused with a message instead of being misread; a map without it is read as 1.
- **mf-value-stream-map:** `serve` no longer hangs new tabs when several pages are open (`/designs` held four live connections, and browsers allow about six per site); open pages now check for changes every second.

## 0.2.0 (2026-10-31)

- The repository becomes a library of skills (`manufacture-dev/skills`, marketplace `manufacture-skills`), with names prefixed `mf-` so they never clash with other skills.
- **mf-value-stream-map:** the interview in two passes (the whole stream first, then the detail theme by theme), `questions`, `summary`, stage operations that keep the map consistent, a local site (`serve`) and a page in any design and language.
- **mf-themes:** design systems for any page made by an agent: three built-in themes (atelier, plan, rapport), a board to compare them, an organisation's colours, three new directions made on the real page.
- **mf-i18n:** languages for any page and its data: whole-text translations kept with the data, translated labels, a switch or a list.

## 0.1.0 (2026-10-30)

- `value-stream-map`: continue and complete a value stream map with an agent (new, validate, outline, patch, detail, preview, export, import), packaged as a Claude Code plugin.
