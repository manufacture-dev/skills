---
name: value-stream-map
description: Use when a value stream map of a delivery flow (from the request to production) must be created from scratch, continued, completed, corrected or validated, or turned into a page in any design system (or redesigned in another one): when someone wants to map how their work flows, describes or writes who does what, how long work waits, what comes back, where AI helps, pastes notes or answers from a workshop, or wants to keep working on a map from a page they have.
license: MIT
---

# Value stream map

A value stream map shows how one real piece of work travels from the request to production: the stages, the steps inside them, how long each step works and waits, what is sent back (rework), and where AI is used. The JSON file is the single source of truth. The page is written by you, from that file, in the design system you are given or one you choose; the CLI keeps the data valid and computes the figures, so every page shows the same numbers.

CLI (Node 18+, no dependencies). Run it from the project, with the path to this skill's `scripts/vsm.mjs` (for example `node .claude/skills/value-stream-map/scripts/vsm.mjs outline map.json`); below, `scripts/vsm.mjs` stands for that path:

```bash
node scripts/vsm.mjs new      <map.json> --title <text> [--stages "<Stage 1>,<Stage 2>,…"] [--trigger <text>] [--end <text>] [--team "<A>,<B>"]
node scripts/vsm.mjs questions <map.json> [--text] [--limit n] # what is still to ask, in interview order
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
- **From scratch.** `node scripts/vsm.mjs new <map.json> --title "<the case>" --stages "Story,Refinement,Build,Review,QA,Release"` creates an empty map with your stages, in order. Without `--stages`, it starts from the starter stages (Request, Refinement, Build, Review, QA, Release), which the discussion then changes (see **Changing the stages**).
- To share it, write the page (below) and publish it, for example as a Claude artifact. It is your own page; the one you started from stays as it was.

## Interviewing: you lead the session

You can run the session yourself, as the facilitator would: you ask, you record, you ask the next question, and `questions` keeps the list of what is still to ask, so nothing is forgotten. Do this when a map is started from scratch, and whenever someone wants to continue a map without bringing their own notes.

1. **Frame the case first**, one question at a time: the use case (one real, recent piece of work that reached production, not the process in general), what starts the work (trigger), when value is delivered (end), who takes part, then the stages: propose the ones given, or the starter stages, and ask what to rename, add, merge, remove or reorder. Then create the map already framed: `new <map.json> --title "<the case>" --trigger "…" --end "…" --team "…" --stages "…"`.
2. **Then go round, staying with the discussion:** after each answer, run `questions --text --limit 3 --near <stage>[/<step>]` on the box just talked about: it puts first what is still missing on that box, then on its stage, its rework loops and the neighbouring stages. Pick the question that follows most naturally from what was just said (usually the first), and ask it in the person's language and in your own words, linked to their answer ("you said the review waits for a senior: how long, usually?"); never read the template. Move on to another part of the map only when nothing is left nearby or the person changes subject. Without `--near` the order is frame → flow, stage by stage (steps and who, work and wait times, then %C&A, AI, tools, what slows) → rework → read-back (what is still to confirm, hypotheses, ideas for later).
3. **Record each answer** with one `patch` (smallest change, as below), then say in one line what you recorded and ask the next question. Record everything the answer brings, not only what you asked: it removes questions further down. When there is no answer ("we don't know", "no AI there", "nothing comes back"), add the question's key to `asked` (`{"push": "asked", "value": "<key>"}`) so it is not asked again; an unknown value stays `null`.
4. **Everything can move along the way:** the use case, its start and end, the team and the stages. When an answer changes the frame ("actually it starts with the support ticket"), change it (`set` on `case.*`, `stage` ops), say so, and log who said it.
5. **Follow the person** when they jump ahead or come back to an earlier box: record it where it belongs, then return to the first open question.
6. Every few answers, or when asked, give the progress in one line: questions left by phase (`questions --text` prints them) and the lead time so far (`summary --text`).
7. **Close** when `questions` has nothing left or the people stop: read the map back (`summary --text`): the stages and where work waits most, the rework, the AI uses, and what is still open. Then offer the page.

Ask one question at a time and record only what was said; never answer for the person. In a group workshop it works the same: the facilitator relays, or you ask the room.

## Live: listening to a call

When the map is filled from a live transcript (a workshop recorded with Wispr Flow or another tool, driven by a live skill), the people talk to each other, not to you: never ask them anything yourself. The same mechanics serve the facilitator instead:

- Each batch of transcript is an input like any other (below): record what was said, on the box it concerns.
- Then run `questions --near <stage or box being discussed>` and turn the first one or two into **suggestions for the facilitator**, phrased from what was just said, through whatever the live tool shows them (a coach page, a reply line). Never more than three at a time, and none while the group is in the middle of answering.
- A question counts as answered only when the transcript answers it; add its key to `asked` only when the group says they do not know or that it does not apply.
- Frame and stages change live the same way (`set` on `case.*`, `stage` ops), when the group says so out loud.
- Extra fields a live tool keeps in the map (a roster, its own question list, a `now` state, private notes, `stages[].checked`) are kept as they are: `validate`, `patch` and `summary` ignore them, and `questions` treats `checked.steps` / `checked.loops` as already asked. Never show them on the page.

## Continuing the map

Whether the map is new or existing, inputs are what people say or write: workshop notes, a pasted answer, a person describing their part of the flow, a correction.

1. Run `outline` to see the current boxes and their ids.
2. Decide what the input changes: a stage (added, renamed, moved, merged), a sub-step, who does it, a tool, a wait or work time, an AI use, a marker, a rework loop, a %C&A, an idea for later, a hypothesis status.
3. Make the smallest change with one `patch` call holding every change, plus one `{"log": "…"}` op saying what changed and from whom. Keep existing ids and order.
4. `patch` validates: if it refuses, nothing was written; fix the ops and send again.
5. Say in one or two lines what changed, then suggest how to complete it: run `questions --text --limit 3 --near <box you touched>` and offer one or two of them as questions, linked to the input ("the notes give QA's bugs but not how long they wait for a fix: do you know?"). Do not list every gap: keep to what follows from what was just said.

When an input is ambiguous, make no edit and ask one short question. When an input contradicts the map, correct it and say so in the log. When you choose between two boxes (a wait that could sit on either), say which one and why, in the log and in your reply.

A frequency ("one release in five", "every feature") goes in the loop's `count`, in the words used with who said it; a new figure on an existing loop is added next to the old one, not over it, unless it corrects it. When the map has `i18n.fr`, add the French for each new text you write.

`patch` ops: `{"set": "<path>", "value": …}`, `{"push": "<path>", "value": …}`, `{"insert": "<path>", "at": 0, "value": …}`, `{"del": "<path>"}`, `{"log": "text"}`, `{"detail": {"stage": "<id>", "steps": [...], "to": "<sub-step id>"}}`, `{"stage": {…}}` (see **Changing the stages**). A path is dot-separated; in a list a segment picks the item by `id` (or `name`, or an AI use's `label`, or an index): `stages.build.steps.claude-writes-code.work`, `stages.qa.steps.smoke-tests.ai`, `loops.refinement-meetings.count`, `hypotheses.H1.status`.

## Changing the stages

The stages are the team's, not the skill's: start from those given (or the starter ones) and change them whenever the people say their flow is cut differently, with a `stage` op in `patch`. The id of a stage never changes, so loops and references hold.

- `{"stage": {"add": {"name": "Design", "fr": "Conception"}, "after": "refinement"}}` (or `"before"`; at the end when neither): a new, empty stage, `assumed`.
- `{"stage": {"rename": "qa", "name": "Testing", "fr": "Tests"}}`.
- `{"stage": {"move": "review", "after": "qa"}}` (or `"before"`).
- `{"stage": {"remove": "planning"}}` for an empty stage; one that holds anything (sub-steps, durations, AI uses, markers, loops) needs `"into": "<stage id>"`, the stage it merges into: its sub-steps (or the stage itself, as one sub-step) move there after the target's own, and its loop ends follow. Nothing is lost and the totals stay the same.

Each op writes its own log line; add a `{"log"}` op saying who asked for it. Change a stage only when the people say so ("for us review is part of build", "we have a design stage before refinement"); an activity inside a stage (test design, a security check, a demo) stays a sub-step, not a new stage. Before removing or merging a stage that holds work, say what will move where and ask. A stage skipped on this case stays, with a `not-done` marker. Never edit `stages` or `case.stages` with `set`/`push`/`del`: the validator refuses a map where they differ.

## Model

- `case`: `client`, `title`, `trigger` (what starts the work), `end` (when value is delivered), `team`, `stages` (the stage ids, in order).
- `stages[]`: the stages of the delivery cycle as the team names them, in order, changed only with `stage` ops (above), which keep `case.stages` (their ids, in order) in step. Fields: `id`, `name`, `status` (`assumed` until people confirm it on the real case, then `confirmed`), `actors`, `tools`, and, while the stage has no sub-steps, `work`, `wait`, `ai[]`, `markers[]`, `ca`, `batch`.
- `steps[]` inside a stage: `{id, name, who, tools, work, wait, status, parallel, ai[], markers[], ca, caApprox, caSource, batch}`. `id` is required, lowercase-dashes, unique in the stage and stable (loops point at it).
- **Attach every item to the most precise box.** Once a stage has sub-steps, nothing stays on the stage: no duration, AI use or marker. To split a stage, use `detail` (or a `detail` op): it moves the stage's items to a sub-step and logs what it moved; then adjust what it guessed.
- `work` / `wait`: `null` when unknown, else `{"days": n}` in working days (1 day = 8 hours, so 2 hours = 0.25). `"approx": true` for an estimate, `"text"` for the words used (`"up to 1 month"`), `"min"`/`"max"` for a range (midpoint in `days`), `"felt": true` when it is a feeling rather than a measure, `"source"` for who said it. `wait` is the time the work waits *before* that box starts; the page draws it as a queue between boxes.
- `phase: "upstream"` on a sub-step: work that happens before the case starts (discovery before the request is accepted). It is drawn (dotted, labelled "upstream") but kept out of the stage times and the totals; `summary.upstream` gives its own figures.
- `parallel: true` on a sub-step: it runs at the same time as the one before; the totals count a parallel group once, for its longest.
- `ai[]`: `{label, level, who}`, levels `assistant` (on-demand assistant), `tooled` (AI built into the step), `prepares` (agent prepares, human approves), `chains` (agent chains steps, human supervises).
- `markers[]`: `{kind, text, source}`, kinds `accelerates`, `slows`, `bottleneck`, `new-bottleneck` (created or worsened by AI), `pain`, `new-pain`, `duplicate` (work done twice), `not-done`.
- `ca`: percent complete and accurate (0–100), the share of what a box receives that it can use without going back to the box before. `caApprox: true` when felt, `caSource` for who said it. Ask it on every box that receives work: "Of what you get from <previous box>, how much can you use as is?"
- `batch`: the batch size when work moves in batches ("2-week sprint", "monthly release train").
- `loops[]`: rework `{id, from, fromStep, to, toStep, label, count, cost, source, confirm}`. `from`/`fromStep` is the box that sends work back, `to`/`toStep` the box that redoes it; a box looping on itself (`from` = `to`, same step) is an iteration ("two or three rounds with Claude"). A loop end on a stage with sub-steps must name the sub-step. `count` in the words used, `cost` as a duration. Give each loop an `id`.
- `confirm: true` on an AI use, a marker or a loop you inferred rather than heard: the page shows it dashed, "to confirm".
- `parking[]`: `{text, who}` ideas for the future flow. Record them; they never go into the stages.
- `hypotheses[]`: `{id, text, status}`, status `open`, `confirmed`, `refuted` or `partial`. The status changes only when the people concerned say so.
- `asked[]` (optional): keys of questions from `questions` that were asked and got no answer, so they are not asked again.
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
4. **Between two boxes:** a queue (a ▽-like symbol) showing the wait of the box that follows: its duration, or "?" when the wait is unknown (`null`); a plain arrow only when the wait is 0. The wait sits *between* the boxes, before the box that waits, never inside a box. The first box of a stage gets its queue inside the stage frame, before the box; stage frames are joined by plain arrows. In Macro, each stage box gets the stage's wait as its queue, and the box also repeats wait, work and lead as figures.
5. **Parallel sub-steps** are stacked one above the other in the same column, so they read as happening at the same time; the totals count the longest.
6. **A box (Detailed)** shows, in this order: name · who · tools · work time (with the words used, `text`, when present) · %C&A (red under 70, amber under 90) · batch. AI uses sit just above the box, each with its level; markers sit just below it; ↩ / ↻ counts on the box when it sends work back or iterates. Items marked `confirm` are dashed and say "to confirm".
7. **A stage in Macro** is one box per stage, on the same line, all from `summary.stages`: name · `actors` · `tools` · `wait`, `work`, `lead` · `rolledCA` · `reworkOut` ↩ / `iterations` ↻ · `batches` · AI: `aiUses` and the highest level reached, `aiTopLevel` · markers: `markersByKind` (each kind with its count, e.g. "slows ×2").
8. **A timeline under the flow**: under each stage, a bar of its wait then its work, all stages on one shared scale (days to width), so the longest stage has the longest bar; wait and work in two distinct colours used everywhere on the page (wait warm, work cool).
9. **Rework arrows** run in lanes below all the boxes (stacked parallel boxes included), never across a box, from the box that sends work back to the box that redoes it, with the loop's count as a short caption; they appear when a box or a line of the rework list is selected (all at once is unreadable), in both views (in Macro, between stage boxes). To reach a box inside a stack of parallel boxes, the arrow runs up a gutter beside the stack and points at that exact box.
10. **Totals strip:** lead time, work, wait, flow efficiency, rolled %C&A, each as a large figure with its label, and `totals.note` under it.
    Under the lead time, when `totals.incompleteStages` > 0: "N incomplete stage(s) (a box without work time), M with no duration at all" (`stagesWithoutDurations`), so nobody reads a partial lead time as complete.
11. **Details that must not be lost:**
    - A stage without sub-steps (`detailed: false`) is drawn as one box carrying its own items, labelled "not detailed yet".
    - Upstream sub-steps (`phase: "upstream"`) are dotted and labelled, outside the totals, with their own row in the per-stage table.
    - A stage still `assumed` has a dashed frame and says "to confirm"; so does a sub-step with `status: "assumed"`.
    - Sources stay reachable: every duration, %C&A, marker and loop shows its `source` (visible, or in a tooltip or an expandable detail on the box).
    - The AI level is readable without colour: a graded mark (1 to 4 notches, or the level's name) next to each AI use.
    - The per-stage table has a wait/work bar per stage (same colours and scale as the timeline), a "whole stream" total row (from `totals` and `counts`: `reworkOut`, `iterations`, `aiUses`, `boxesWithoutWork`), and the note "Recorded durations only: a box without duration counts as 0; the figures move as missing times come in."
    - The legend explains every symbol used: the queue ▽, work time, %C&A and rolled %C&A, ↩ and ↻, batch, stacked boxes, dashed = to confirm, ~ estimate, felt, ? unknown, the timeline, lead time and flow efficiency, and that a stage's times are the sum of its boxes (Σ).
    - Latest changes: the last 8 `log` entries, newest first.
    - With a FR/EN switch, the page's own labels switch too, not only the map's texts.
12. **Continue this map** (always, last section): how to carry on with this map. Three short steps: install the value-stream-map skill (link: https://github.com/manufacture-dev/value-stream-map), get this map's data, ask Claude to continue it. Then two buttons on the exact `vsm-data` content:
    - **Copy the data**: `navigator.clipboard.writeText(json)` inside the click; if it fails, show the JSON in a read-only, selected text area so it can be copied by hand.
    - **Download (JSON)**: shown only when the page runs as a Claude artifact that allows downloads: `const dl = window.claude && await window.claude.use('downloads')`; when `dl` is not null, `dl.save({filename: '<slug of case.title>.json', data: json})`. When publishing the page as an artifact, declare the `downloads` capability. Without it, show only Copy.
    A short status line says "Copied." or "Saved." after the action.

What every page must show, from `vsm-data` and `vsm-summary` (never recompute a total, a share or an efficiency yourself; looking up which boxes are missing a time or which loops touch a box is fine):

- **Header:** the case title, client, trigger → end, the team.
- **Totals:** lead time = wait + work, work, wait, flow efficiency (work ÷ lead time), rolled %C&A (or "not measured"), and `totals.note` when present. Times are working days; show under 1 day in hours (1 day = 8 h).
- **The flow:** laid out as above. Estimates (`approx`), felt figures (`felt`) and unknown values (`null`, shown as "?") are told apart, and everything marked `confirm` looks provisional.
- **Rework list:** every loop with its ends (box → box), label, count, cost and source; selecting a line draws its arrow.
- **Per stage:** the `summary.stages` table (wait, work, lead time, share of lead time, efficiency, rework, AI uses, boxes without durations), with the longest stage highlighted.
- **What is still to complete:** `missing.work` and `missing.wait` (boxes without a work or wait time), `toConfirm` (AI uses, markers, loops and sub-steps still assumed), stages still `assumed`.
- **Hypotheses** with their status, **parking** ideas, and the latest `log` entries.
- **Numbers:** days with one decimal (67.7 d); under 1 day in hours (1 day = 8 h); a range as min–max, prefixed "~" when approximate; `max` alone as "≤"; `null` as "?". A stage whose `noDurations` is true shows "?" for its times, never 0.
- **A legend:** AI levels (assistant, tooled, prepares, chains), marker kinds, the symbols you use.
- **Language:** the map's language; when the map has `i18n.fr`, offer a FR/EN switch using it. `i18n.fr` maps whole texts; translate a text only when it is a key there (a stage named "QA" and the role "QA" are the same text, so give such words no entry).

Rules for the page:

- It is one self-contained HTML page (it may load fonts or a library from a public CDN), in light and dark. On a phone the layout stays the same: the flow scrolls sideways in its container.
- Run `embed` after writing the page and again after every change to the map; `import` reads the map back from it.
- Check the page against `summary` before sharing: same totals, every stage and loop present.
- Show nothing the map does not hold: no invented figure, no extra comment on people.
