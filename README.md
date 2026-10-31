# Manufacture skills

Open skills for coding agents (Claude Code, Codex and any agent that reads skills: a folder with a `SKILL.md`). Each skill works on its own; together they compose.

Made by [Manufacture](https://manufacture.dev).

| Skill | What it does |
| --- | --- |
| [`mf-value-stream-map`](plugins/mf-value-stream-map/skills/mf-value-stream-map/SKILL.md) | Build a value stream map of a delivery flow with an agent: it interviews you (the stream first, the detail after), records what is said, computes the figures and shows the map on a local site or a single page, in any design and language. |
| [`mf-themes`](plugins/mf-themes/skills/mf-themes/SKILL.md) | Design systems for a page made by an agent: built-in themes (workshop wall, engineering drawing, editorial report), three radically different new directions made on the real page, a board to compare them, or your organisation's colours. |
| [`mf-i18n`](plugins/mf-i18n/skills/mf-i18n/SKILL.md) | Languages for a page and its data: written in the language you speak, any number of others, whole-text translations kept with the data, translated labels, a switch or a list. |

## Install

**Claude Code** (all of them, or only those you want):

```
/plugin marketplace add manufacture-dev/skills
/plugin install mf-value-stream-map@manufacture-skills
/plugin install mf-themes@manufacture-skills
/plugin install mf-i18n@manufacture-skills
```

**Codex:** copy `plugins/<plugin>/skills/<skill>` into `.agents/skills/` of a repository or `~/.agents/skills/` (all your projects), then restart Codex; or ask Codex's `$skill-installer` to install it from this repository.

**Any other agent that reads skills:** copy `plugins/<plugin>/skills/<skill>` where it looks for them.

Requires Node.js 18 or later (https://nodejs.org); nothing to install with npm. The agent checks it before the first command.

## Use

- *"Let's map our last feature that went to production, interview me."* The agent frames the case in the language you speak, builds the whole stream with you, then goes over what is missing theme by theme, and shows the map as it grows on a local site.
- *"Show me other designs for the map"*, *"use our colours"*, *"make us three new styles"* (mf-themes).
- *"Add English and German to the page"* (mf-i18n).

To try without your own data: [`examples/lumen-report-export.json`](examples/lumen-report-export.json), a fictional company's map (Lumen Insights): *"Make the page for examples/lumen-report-export.json"*.

## How the library is built

- `plugins/<plugin>/skills/<skill>/`: each skill, self-contained (its `SKILL.md`, `scripts/`, `assets/`), so it can be copied alone.
- `lib/`: the code shared by several skills (`themes.mjs`, `i18n.mjs`). `node tools/sync.mjs` copies it into each skill's `scripts/lib/`, and the built-in themes of mf-themes into the skills that ship them; edit the source, never a copy.
- `node tools/check.mjs` before committing (also run in CI): copies and versions in sync, themes valid, the example map valid and its page built in every design, a changelog line for any change since the last release.

## Versions

One version for the whole library ([CHANGELOG.md](CHANGELOG.md)), in semver, written in each skill (`metadata.version` in `SKILL.md`) and plugin. While it is 0.x, a minor version may change the map format or a command; the changelog says what to do. Maps carry their own format version (`schemaVersion`).

- **Claude Code:** `/plugin marketplace update manufacture-skills`, then update the plugins in `/plugin` (or turn on auto-update for the marketplace there).
- **Copied skills (Codex, other agents):** copy the folder again; `metadata.version` in its `SKILL.md` says which version you have. A release is a tag `vX.Y.Z` with its notes on GitHub.

To release (maintainers): every change to `plugins/` or `lib/` adds a line under **Unreleased** in the changelog (`tools/check.mjs` refuses otherwise), then `node tools/release.mjs <x.y.z>` sets the version everywhere and prints the commit, tag and release commands.

## Licence

MIT, see [LICENSE](LICENSE). Fonts in the themes are under their own free licences (OFL-1.1), next to each font.
