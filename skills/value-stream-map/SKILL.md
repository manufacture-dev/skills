---
name: value-stream-map
description: Use when a value stream map of a delivery flow (from the request to production) must be created from scratch, continued, completed, corrected or validated, or turned into a page in any design system (or redesigned in another one): when someone wants to map how their work flows, describes or writes who does what, how long work waits, what comes back, where AI helps, pastes notes or answers from a workshop, or wants to keep working on a map from a page they have.
license: MIT
---

# Value stream map

A value stream map shows how one real piece of work travels from the request to production: the stages, the steps inside them, how long each step works and waits, what is sent back (rework), and where AI is used. The JSON file is the single source of truth. The page is written by you, from that file, in the design system you are given or one you choose; the CLI keeps the data valid and computes the figures, so every page shows the same numbers.

CLI (Node 18+, no dependencies). Run it from the project, with the path to this skill's `scripts/vsm.mjs` (for example `node .claude/skills/value-stream-map/scripts/vsm.mjs outline map.json`); below, `scripts/vsm.mjs` stands for that path:

```bash
node scripts/vsm.mjs new      <map.json> --title <text> --stages "<Stage 1>,<Stage 2>,…"
node scripts/vsm.mjs validate <map.json>
node scripts/vsm.mjs outline  <map.json>                      # compact view: ids and what each box holds
node scripts/vsm.mjs patch    <map.json> --ops '<json array>' # apply changes, validate, write only if valid
node scripts/vsm.mjs detail   <map.json> --stage <id> --steps '<json array>' [--to <sub-step id>]
node scripts/vsm.mjs summary  <map.json> [--text]             # the figures a page shows (JSON by default)
node scripts/vsm.mjs embed    <map.json> --page <page.html>   # put the map and its figures into the page
node scripts/vsm.mjs import   <page.html> --output <map.json> # take the map back out of a page
```

## Starting point

- **From a page.** A map page carries its data: save the page as HTML and run `import`. A page with a "Continue this map" panel also lets you download or copy the data (paste it into a `.json` file, or into the conversation and ask the agent to save it).
- **From scratch.** `node scripts/vsm.mjs new <map.json> --title "<the case>" --stages "Story,Refinement,Build,Review,QA,Release"` creates an empty map with your stages, in order.
- To share it, write the page (below) and publish it, for example as a Claude artifact. It is your own page; the one you started from stays as it was.

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

## The page

You write the page; there is no template. Use the design system you are told to use (its tokens, type, components), or choose a sober one that suits a working document. To redesign an existing map, write a new page from the same JSON in the new design system. When you update a map that already has a page, start from that page and keep its design unless asked to change it.

How the page gets its data: write the page so its script reads two JSON tags, `<script id="vsm-data" type="application/json">` (the map) and `<script id="vsm-summary" type="application/json">` (the figures), then run `embed`: it fills both, places them before the page's first script, and replaces them in place on the next run. Never type the data or the figures into the page by hand.

### Layout (required, whatever the design system)

The design system decides colours, type, spacing and components. It never changes the layout below: a value stream map is read left to right, and people compare pages of different maps.

1. **Order of the page:** header (case, trigger → end, team) · totals strip · the map with its view switch · rework list · per-stage table · what is still to complete · hypotheses and parking · legend (collapsible) · latest changes · **Continue this map**.
2. **Two views of the same map, switched by a control above it, in this order: Macro, then Detailed.** Macro is shown first (the overview), Detailed one click away. Both keep the same horizontal flow and the same stage order; switching changes only the level of detail.
3. **Horizontal, left to right, on one line.** Stages follow each other from left to right as frames; in Detailed, each stage holds its sub-steps as boxes, also left to right. The flow never wraps onto a second line and never stacks vertically, on any screen: when it is wider than the screen, the flow scrolls sideways inside its own container (the page itself never scrolls sideways).
4. **Between two boxes:** a queue showing the wait of the box that follows (a ▽-like symbol with the duration, "?" when unknown), or a plain arrow when there is no wait to show. The wait sits *between* the boxes, before the box that waits, never inside a box.
5. **Parallel sub-steps** are stacked one above the other in the same column, so they read as happening at the same time; the totals count the longest.
6. **A box (Detailed)** shows, in this order: name · who · tools · work time · %C&A (red under 70, amber under 90) · batch. AI uses sit just above the box, each with its level; markers sit just below it; ↩ / ↻ counts on the box when it sends work back or iterates. Items marked `confirm` are dashed and say "to confirm".
7. **A stage in Macro** is one box per stage, on the same line, all from `summary.stages`: name · `actors` · `tools` · `wait`, `work`, `lead` · `rolledCA` · `reworkOut` ↩ / `iterations` ↻ · `batches` · `aiUses` and `markers`.
8. **A timeline under the flow**: under each stage, a bar of its wait then its work, all stages on one shared scale (days to width), so the longest stage has the longest bar; wait and work in two distinct colours used everywhere on the page (wait warm, work cool).
9. **Rework arrows** run in lanes below all the boxes (stacked parallel boxes included), never across a box, from the box that sends work back to the box that redoes it, with the loop's count as a short caption; they appear when a box or a line of the rework list is selected (all at once is unreadable), in both views (in Macro, between stage boxes).
10. **Totals strip:** lead time, work, wait, flow efficiency, rolled %C&A, each as a large figure with its label, and `totals.note` under it.
11. **Continue this map** (always, last section): how to carry on with this map. Three short steps: install the value-stream-map skill (link: https://github.com/manufacture-dev/value-stream-map), get this map's data, ask Claude to continue it. Then two buttons on the exact `vsm-data` content:
    - **Copy the data**: `navigator.clipboard.writeText(json)` inside the click; if it fails, show the JSON in a read-only, selected text area so it can be copied by hand.
    - **Download (JSON)**: shown only when the page runs as a Claude artifact that allows downloads: `const dl = window.claude && await window.claude.use('downloads')`; when `dl` is not null, `dl.save({filename: '<case>.json', data: json})`. When publishing the page as an artifact, declare the `downloads` capability. Without it, show only Copy.
    A short status line says "Copied." or "Saved." after the action.

What every page must show, from `vsm-data` and `vsm-summary` (never recompute a total, a share or an efficiency yourself; looking up which boxes are missing a time or which loops touch a box is fine):

- **Header:** the case title, client, trigger → end, the team.
- **Totals:** lead time = wait + work, work, wait, flow efficiency (work ÷ lead time), rolled %C&A (or "not measured"), and `totals.note` when present. Times are working days; show under 1 day in hours (1 day = 8 h).
- **The flow:** laid out as above. Estimates (`approx`), felt figures (`felt`) and unknown values (`null`, shown as "?") are told apart, and everything marked `confirm` looks provisional.
- **Rework list:** every loop with its ends (box → box), label, count, cost and source; selecting a line draws its arrow.
- **Per stage:** the `summary.stages` table (wait, work, lead time, share of lead time, efficiency, rework, AI uses, boxes without durations), with the longest stage highlighted.
- **What is still to complete:** `missing.work` and `missing.wait` (boxes without a work or wait time), `toConfirm` (items, loops), stages still `assumed`.
- **Hypotheses** with their status, **parking** ideas, and the latest `log` entries.
- **Numbers:** days with one decimal (67.7 d); under 1 day in hours (1 day = 8 h); a range as min–max, prefixed "~" when approximate; `max` alone as "≤"; `null` as "?". A stage whose `noDurations` is true shows "?" for its times, never 0.
- **A legend:** AI levels (assistant, tooled, prepares, chains), marker kinds, the symbols you use.
- **Language:** the map's language; when the map has `i18n.fr`, offer a FR/EN switch using it.

Rules for the page:

- It is one self-contained HTML page (it may load fonts or a library from a public CDN), in light and dark. On a phone the layout stays the same: the flow scrolls sideways in its container.
- Run `embed` after writing the page and again after every change to the map; `import` reads the map back from it.
- Check the page against `summary` before sharing: same totals, every stage and loop present.
- Show nothing the map does not hold: no invented figure, no extra comment on people.
