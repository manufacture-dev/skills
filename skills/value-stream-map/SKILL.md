---
name: value-stream-map
description: Use when a value stream map of a delivery flow (from the request to production) must be created from scratch, continued, completed, corrected, validated, previewed or exported as a page: when someone wants to map how their work flows, describes or writes who does what, how long work waits, what comes back, where AI helps, pastes notes or answers from a workshop, or wants their own copy of a published map to keep working on.
license: MIT
---

# Value stream map

A value stream map shows how one real piece of work travels from the request to production: the stages, the steps inside them, how long each step works and waits, what is sent back (rework), and where AI is used. The JSON file is the single source of truth; a page is generated from it.

CLI (Node 18+, no dependencies). Run it from the project, with the path to this skill's `scripts/vsm.mjs` (for example `node .claude/skills/value-stream-map/scripts/vsm.mjs outline map.json`); below, `scripts/vsm.mjs` stands for that path:

```bash
node scripts/vsm.mjs new      <map.json> --title <text> --stages "<Stage 1>,<Stage 2>,…"
node scripts/vsm.mjs validate <map.json>
node scripts/vsm.mjs outline  <map.json>                      # compact view: ids and what each box holds
node scripts/vsm.mjs patch    <map.json> --ops '<json array>' # apply changes, validate, write only if valid
node scripts/vsm.mjs detail   <map.json> --stage <id> --steps '<json array>' [--to <sub-step id>]
node scripts/vsm.mjs preview  <map.json>                      # local page, redraws at every save
node scripts/vsm.mjs export   <map.json> --output <page.html> # standalone page with the map embedded
node scripts/vsm.mjs import   <page.html> --output <map.json> # take the map back out of an exported page
```

## Starting point

- **From a published map.** Open the map page and use "Continue this map": "Download (JSON)" saves the map data, "Copy the data" copies it (paste it into a `.json` file, or straight into the conversation and ask the agent to save it). A page saved as HTML works too: `import` takes the map out of it.
- **From scratch.** `node scripts/vsm.mjs new <map.json> --title "<the case>" --stages "Story,Refinement,Build,Review,QA,Release"` creates an empty map with your stages, in order.
- To share your version, `export` it and publish the page (for example as a Claude artifact). It is your own page; the one you started from stays as it was.

## Building a map from scratch

Map one real, recent piece of work (a feature that reached production), not the process in general.

1. The case: what it is, what starts the work (`case.trigger`), when value is delivered (`case.end`), who takes part (`case.team`).
2. The stages, as the team names them, in order: `new` with `--stages`. They stay fixed from then on.
3. Stage by stage, in flow order: the steps inside it and who does each (`detail`), then for each step its work time, how long the work waited before it, and what it uses (tools, AI).
4. Rework: what comes back, from which step to which, how often and at what cost (`loops`), and for each step that receives work, how much of it can be used as is (`ca`).
5. Read the map back with the people who described it: confirm each stage, fill the durations still missing, note ideas for later in `parking`.

Ask one question at a time and record only what was said; unknown stays `null`. Then go on as below.

## Continuing the map

Whether the map is new or existing, inputs are what people say or write: workshop notes, a pasted answer, a person describing their part of the flow, a correction.

1. Run `outline` to see the current boxes and their ids.
2. Decide what the input changes: a sub-step, who does it, a tool, a wait or work time, an AI use, a marker, a rework loop, a %C&A, an idea for later, a hypothesis status.
3. Make the smallest change with one `patch` call holding every change, plus one `{"log": "…"}` op saying what changed and from whom. Keep existing ids and order.
4. `patch` validates: if it refuses, nothing was written; fix the ops and send again.
5. Say in one or two lines what changed, then what is still missing on the boxes you touched (a wait time, a work time, a %C&A) as a question to ask.

When an input is ambiguous, make no edit and ask one short question. When an input contradicts the map, correct it and say so in the log. When you choose between two boxes (a wait that could sit on either), say which one and why, in the log and in your reply.

A frequency ("one release in five", "every feature") goes in the loop's `count`, in the words used with who said it; a new figure on an existing loop is added next to the old one, not over it, unless it corrects it. When the map has `i18n.fr`, add the French for each new text you write.

`patch` ops: `{"set": "<path>", "value": …}`, `{"push": "<path>", "value": …}`, `{"insert": "<path>", "at": 0, "value": …}`, `{"del": "<path>"}`, `{"log": "text"}`, `{"detail": {"stage": "<id>", "steps": [...], "to": "<sub-step id>"}}`. A path is dot-separated; in a list a segment picks the item by `id` (or `name`, or an AI use's `label`, or an index): `stages.build.steps.claude-writes-code.work`, `stages.qa.steps.smoke-tests.ai`, `loops.refinement-meetings.count`, `hypotheses.H1.status`.

## Model

- `case`: `client`, `title`, `trigger` (what starts the work), `end` (when value is delivered), `team`, `stages` (the stage ids, in order).
- `stages[]`: the stages of the delivery cycle as the team names them, **fixed**: never add, remove, merge or reorder a stage (the validator checks them against `case.stages`). Any other activity (test design, a security check, a demo) is a sub-step of the stage where it happens. A stage skipped on the case stays, with a `not-done` marker. Fields: `id`, `name`, `status` (`assumed` until people confirm it on the real case, then `confirmed`), `actors`, `tools`, and, while the stage has no sub-steps, `work`, `wait`, `ai[]`, `markers[]`, `ca`, `batch`.
- `steps[]` inside a stage: `{id, name, who, tools, work, wait, status, parallel, ai[], markers[], ca, caApprox, caSource, batch}`. `id` is required, lowercase-dashes, unique in the stage and stable (loops point at it).
- **Attach every item to the most precise box.** Once a stage has sub-steps, nothing stays on the stage: no duration, AI use or marker. To split a stage, use `detail` (or a `detail` op): it moves the stage's items to a sub-step and logs what it moved; then adjust what it guessed.
- `work` / `wait`: `null` when unknown, else `{"days": n}` in working days (1 day = 8 hours, so 2 hours = 0.25). `"approx": true` for an estimate, `"text"` for the words used (`"up to 1 month"`), `"min"`/`"max"` for a range (midpoint in `days`), `"felt": true` when it is a feeling rather than a measure, `"source"` for who said it. `wait` is the time the work waits *before* that box starts; the page draws it as a queue between boxes.
- `parallel: true` on a sub-step: it runs at the same time as the one before; the totals count a parallel group once, for its longest.
- `ai[]`: `{label, level, who}`, levels `assistant` (on-demand assistant), `tooled` (AI built into the step), `prepares` (agent prepares, human approves), `chains` (agent chains steps, human supervises).
- `markers[]`: `{kind, text, source}`, kinds `accelerates`, `slows`, `bottleneck`, `new-bottleneck` (created or worsened by AI), `pain`, `new-pain`, `duplicate` (work done twice), `not-done`.
- `ca`: percent complete and accurate (0–100), the share of what a box receives that it can use without going back to the box before. `caApprox: true` when felt, `caSource` for who said it. Ask it on every box that receives work: "Of what you get from <previous box>, how much can you use as is?"
- `batch`: the batch size when work moves in batches ("2-week sprint", "monthly release train").
- `loops[]`: rework `{id, from, fromStep, to, toStep, label, count, cost, source, confirm}`. `from`/`fromStep` is the box that sends work back, `to`/`toStep` the box that redoes it; a box looping on itself (`from` = `to`, same step) is an iteration ("two or three rounds with Claude"). A loop end on a stage with sub-steps must name the sub-step. `count` in the words used, `cost` as a duration. Give each loop an `id`.
- `confirm: true` on an AI use, a marker or a loop you inferred rather than heard: the page shows it dashed, "to confirm".
- `parking[]`: `{text, who}` ideas for the future flow. Record them; they never go into the stages.
- `hypotheses[]`: `{id, text, status}`, status `open`, `confirmed`, `refuted` or `partial`. The status changes only when the people concerned say so.
- `log[]`: `{at, text}`, one entry per meaningful change, shown under the map as the latest changes.
- `i18n.fr` (optional): French text for each English text of the map, used by the page's FR/EN switch. A text without a translation shows in English in both.

## Rules

- Write the real case, not the theoretical process. Mark a stage `confirmed` only when people describe it on the real piece of work.
- Never invent a duration, a figure, a quote or a marker. Unknown stays `null`; the page counts the boxes still missing durations.
- Separate felt from measured (`felt`, `caApprox`, "felt, not measured" in `source`).
- A correction that does not name its box: apply it to the most likely one, mark it `confirm: true` or say so in the log, and name the alternative.
- Keep two possibly duplicate sub-steps rather than merging them silently; mark one `confirm: true`.
- Names may be cited in sources. Do not record anything personal, or that could harm someone.
- Keep the map text in one language and validate before sharing.

## Preview and publish

- `preview` serves the page on `http://127.0.0.1:4173/` (next free port if taken) and redraws at every valid save; keep it running while you edit.
- `export` writes a standalone page (data embedded) ready to publish or send. The page has a macro view (stages) and a detailed view (sub-steps), a FR/EN switch, the rework list (click a box or a line to see its arrow), the totals (lead time, work, wait, flow efficiency, rolled %C&A) and what is still to complete.
