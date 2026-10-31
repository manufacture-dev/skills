# mf-i18n

Languages for a page made by an agent and for its data. The data is written in one language, the one you speak with the agent; any number of other languages are kept as whole-text translations next to it, and the page switches between them: a switch for two languages, a list for more. The page's own labels switch too, with plurals and numbers in each language's format (a decimal comma in French).

## Use

- *"Add English and German to the page."*
- *"Translate what is left."*
- *"The page should switch between French and English."*

The agent asks once whether other languages are needed, translates as the content changes, and lists what is still to translate.

## Install

See the [repository's README](https://github.com/manufacture-dev/skills#install). Requires Node.js 18 or later; nothing else.

## What it runs

`scripts/i18n.mjs`, plain JavaScript with no dependency: it checks the language fields of a JSON file you name, adds a language, lists the texts and labels still to translate and stores translations. `assets/i18n-runtime.js` is a small script to include in a page: labels, plurals, numbers and the language switch. No network request, no telemetry. The skill's instructions are in [`skills/mf-i18n/SKILL.md`](skills/mf-i18n/SKILL.md).

## Licence

MIT.
