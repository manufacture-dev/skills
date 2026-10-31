# value-stream-map

A skill for coding agents (Claude Code, Codex and others) to create, or keep working on, a **value stream map**: how one real piece of work travels from the request to production, with its stages and steps, wait and work times, rework loops, %C&A and AI uses. The agent builds the map from what people say or write, step by step, checks it stays consistent, and shows it on a neutral default page, locally or published, or on a page in your own design system: an existing map can be redrawn in another design system at any time.

Made by [Manufacture](https://manufacture.dev).

## Install

**Claude Code, as a plugin**

```
/plugin marketplace add manufacture-dev/value-stream-map
/plugin install value-stream-map@manufacture-value-stream-map
```

**Claude Code, by hand:** copy `skills/value-stream-map` into `.claude/skills/` of a repository (one project) or `~/.claude/skills/` (all your projects).

**Codex:** copy `skills/value-stream-map` into `.agents/skills/` of a repository or `~/.agents/skills/` (all your projects), then restart Codex; or ask Codex's `$skill-installer` to install it from this repository.

**Any other agent that reads skills** (a folder with a `SKILL.md`): copy `skills/value-stream-map` where it looks for them.

Requires Node.js 18 or later (https://nodejs.org); no other dependency, nothing to install with npm. The agent checks it before the first command.

## Use

1. Start a map: an empty one with `node <skill folder>/scripts/vsm.mjs new map.json --title "<the case>" --stages "Story,Build,Review,QA,Release"` (or without `--stages`, from starter stages that you then rename, add, move or remove with the agent as you go), or an existing one: on a published map page, **Continue this map** downloads or copies its data (a `.json` file).
2. Let the agent interview you: *"Let's map our last feature that went to production, interview me"*. It frames the case first (the use case, what starts it, when it ends, who takes part, the stages), then builds the whole stream with you, as many steps as possible, before any detail; then it goes over what is missing theme by theme (waits, work times, AI uses, rework…), on the whole map or one stage, so nothing is forgotten. Everything stays open to change as you go, the stages and the frame included.
3. Or bring your own input, for example: *"Let's map how our last feature went to production, in map.json"*, or *"Continue the value stream map in map.json: QA says one story in two comes back because the acceptance criteria are not testable."*
4. See it: the agent starts a local site (`serve`) that reloads on every change, on a default page with built-in design systems to compare side by side (or three new directions made for you, or your organisation's own), in as many languages as you want; or it writes one HTML file (`page`) to open, send or host anywhere. On Claude, it can also publish it as an artifact.
5. Ask for another look, for example: *"Use our colours for the map's page"* or *"Redo the map's page in our design system"*. The page carries the map's data, so it can be picked up again later.

To try it without your own data, start from the fictional example [`examples/lumen-report-export.json`](examples/lumen-report-export.json) (Lumen Insights, a made-up company: eight stages (one not detailed yet), 21 boxes, an upstream step, parallel work, six rework loops, AI uses at every level, French translations): *"Make the page for examples/lumen-report-export.json"*.

What the agent follows (model, rules, commands) is in [`skills/value-stream-map/SKILL.md`](skills/value-stream-map/SKILL.md).

## Licence

MIT, see [LICENSE](LICENSE).
