# value-stream-map

A skill for Claude to keep working on a **value stream map**: how one real piece of work travels from the request to production, with its stages and steps, wait and work times, rework loops, %C&A and AI uses. Claude completes the map from what people say or write, checks it stays consistent, and turns it into a page you can publish.

Made by [Manufacture](https://manufacture.dev).

## Install

**Claude Code, as a plugin**

```
/plugin marketplace add manufacture-dev/value-stream-map
/plugin install value-stream-map@manufacture-value-stream-map
```

**Claude Code, by hand:** copy `skills/value-stream-map` into `.claude/skills/` of a repository (one project) or `~/.claude/skills/` (all your projects).

Requires Node 18 or later; no other dependency.

## Use

1. Get your map: on a published map page, use **Continue this map** to download or copy its data (a `.json` file); or start an empty one: `node scripts/vsm.mjs new map.json --title "<the case>" --stages "Story,Build,Review,QA,Release"`.
2. Ask Claude, for example: *"Continue the value stream map in map.json: QA says one story in two comes back because the acceptance criteria are not testable."*
3. Preview it while you work (`node scripts/vsm.mjs preview map.json`), then export it as a page to share (`node scripts/vsm.mjs export map.json --output map.html`).

What the agent follows (model, rules, commands) is in [`skills/value-stream-map/SKILL.md`](skills/value-stream-map/SKILL.md).

## Licence

See [LICENSE](LICENSE).
