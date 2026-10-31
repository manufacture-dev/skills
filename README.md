# value-stream-map

A skill for Claude to create, or keep working on, a **value stream map**: how one real piece of work travels from the request to production, with its stages and steps, wait and work times, rework loops, %C&A and AI uses. Claude builds the map from what people say or write, step by step, checks it stays consistent, and writes the page itself, in the design system you give it (or one it chooses): no template, and an existing map can be redrawn in another design system at any time.

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

1. Start a map: an empty one with `node .claude/skills/value-stream-map/scripts/vsm.mjs new map.json --title "<the case>" --stages "Story,Build,Review,QA,Release"`, or an existing one: on a published map page, **Continue this map** downloads or copies its data (a `.json` file).
2. Ask Claude, for example: *"Let's map how our last feature went to production, in map.json"*, or *"Continue the value stream map in map.json: QA says one story in two comes back because the acceptance criteria are not testable."*
3. Ask for the page, for example: *"Make the page for map.json"* or *"Redo the map's page in our design system"*. The page carries the map's data, so it can be picked up again later.

To try it without your own data, start from the fictional example [`examples/lumen-report-export.json`](examples/lumen-report-export.json) (Lumen Insights, a made-up company: eight stages, 26 boxes, parallel work, six rework loops, AI uses at every level): *"Make the page for examples/lumen-report-export.json"*.

What the agent follows (model, rules, commands) is in [`skills/value-stream-map/SKILL.md`](skills/value-stream-map/SKILL.md).

## Licence

MIT, see [LICENSE](LICENSE).
