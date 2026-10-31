# mf-value-stream-map

Build a value stream map of a delivery flow with an agent: how one real piece of work travels from the request to production, the stages and the steps inside them, how long each one works and waits, what is sent back (rework), and where AI is used.

The agent leads the interview in two passes: first the whole stream, as fast as people can tell it, then the detail theme by theme (waits, rework, quality, AI). It records what is said in a JSON file, the single source of truth, and a script computes the figures (lead time, work, wait, flow efficiency, rolled %C&A), so every page shows the same numbers. While you talk, the map grows on a local site in your browser; when you choose, it becomes one self-contained page to open, send or host, in any of the built-in designs or your organisation's colours, and in several languages.

![A value stream map: totals, then the flow from left to right](https://raw.githubusercontent.com/manufacture-dev/skills/main/docs/map.png)

## Use

- *"Let's map our last feature that went to production, interview me."*
- *"Here are my notes from the workshop, build the map."*
- *"Continue the map from this page"* (a map page carries its data; its "Continue this map" panel lets you download it).
- *"Show me the map in other designs"*, *"add French"*.

Try it on the fictional example at the root of the repository: *"Show me the map in examples/lumen-report-export.json"*.

## Install

See the [repository's README](https://github.com/manufacture-dev/skills#install) (Claude Code, Codex, the skills CLI, or by hand). Requires Node.js 18 or later; nothing else.

## What it runs

`scripts/vsm.mjs`, plain JavaScript with no dependency: it validates and changes the map file you name, computes the figures, and writes the pages you ask for. `serve` starts a local site on `127.0.0.1` only. No network request, no telemetry. The skill's instructions are in [`skills/mf-value-stream-map/SKILL.md`](skills/mf-value-stream-map/SKILL.md).

It carries the code and built-in designs of [mf-themes](https://github.com/manufacture-dev/skills/tree/main/plugins/mf-themes) and the language code of [mf-i18n](https://github.com/manufacture-dev/skills/tree/main/plugins/mf-i18n), so it works alone; install them too to make new designs or work on other pages.

## Licence

MIT. Fonts in the built-in designs are under the SIL Open Font License 1.1, next to each font.
