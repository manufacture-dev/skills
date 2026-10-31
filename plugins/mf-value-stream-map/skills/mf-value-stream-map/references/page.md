# The page: designs, layout and what every page shows

Read this before making a new design, writing a page of your own or changing the default page. For choosing among the built-in designs or applying an organisation's colours, the summary in `SKILL.md` is enough.

This skill carries the code and the built-in designs of **mf-themes**; when mf-themes is installed too, follow it to make new design systems (it holds the full method and its checks). The page has two layers. **The base** (`assets/default-page.html`, its CSS in `@layer page`) holds everything the layout rules below require: what is shown, the flow, the figures, the behaviour; a design never removes or changes any of it. **A theme** dresses it: typography, surfaces, component shapes, header, ornaments, spacing, colours. Changing colours alone is not a design: a theme is a design system of its own.

- **Built-in themes:** `themes` lists them, each with what it is. `neutral` (the base as it is, sober, system fonts) is the default; the others are complete design systems, very different from each other (for example the workshop wall with sticky notes, the engineering drawing with its title block, the editorial report). Choose with the person: `designs <map.json> --output <dir>` (or `/designs` on `serve`) shows the real map in each of them side by side; then `{"set": "theme", "value": "<name>"}`.
- **The organisation's colours on a theme:** `themeTokens` in the map (`{"light": {"--work": "#0055aa", "--font": "Inter, sans-serif"}, "dark": {…}}`, the custom properties at the top of the base page), for "keep this design, with our colours and font". Set both light and dark.
- **A new design system** (theirs, or one made for them), the way a studio would, in three steps:
  1. **One question:** what they like, their organisation's design system or site (a link, tokens, a style guide), what they do not want.
  2. **Three directions, radically different:** not three colour variants, but three design systems, each with its own typography, component shapes, header, surfaces, ornaments and density, each drawn from a concrete world that suits the team (a workshop wall, a technical drawing, a report, a control room, a field notebook…; avoid the obvious cliché). Each is a theme folder in a scratch directory, outside the repository: `theme.json` (`name`, `description`, `fonts` with `family`, `file`, `weight`, `style`, `license`, `author`, `source`), `theme.css` (unlayered rules over the base, tokens in light and dark), `fonts/` (woff2 under a free licence, e.g. OFL from Fontsource, with the licence file; no font or image fetched at run time, images only as data URIs you draw). With an organisation's design system, one direction follows it closely and the other two interpret it.
  3. **Show and choose:** `designs <map.json> --output <dir> --themes <dir1>,<dir2>,<dir3>` builds the real map in each, side by side; check each at desktop and phone width, light and dark, before showing it. The person picks (one adjustment at a time if they want). Then keep the chosen folder next to the map and set `"theme": "<relative path>"`; the others are deleted.
- **A page entirely of your own** (when the organisation's components must be used as they are): write it from the layout rules below and take the base page as the reference for what to show and how it behaves.

Writing a theme: it is unlayered, so any property it sets beats the base's variant rules (`.assumed`, `.confirm`, `.tag.tc`, marker colours…) whatever their specificity; restate the variants you restyle. Hooks: `data-part` on each section, `.title-block`, `.trigger`, `.end-text`, `.lbl`, `.tot.lead|work|wait|fe|rca`, `.longest-tag`, `.miss-head`, `.hyp`, `.hyp-id`, `.detail-title`, `.ai-total`. The built-in themes are worked examples. A theme never changes the layout contract below, never hides information, keeps 4.5:1 contrast for text, works in light and dark, and leaves the page without sideways scrolling at phone width. Animations only under `prefers-reduced-motion: no-preference`.

When you update a map that already has a page, keep its design unless asked to change it. To redesign, write or restyle a page from the same JSON; the map does not change.

How the page gets its data: a page reads two JSON tags, `<script id="vsm-data" type="application/json">` (the map) and `<script id="vsm-summary" type="application/json">` (the figures), then run `embed`: it fills both, places them before the page's first script, and replaces them in place on the next run. Never type the data or the figures into the page by hand.

## Layout (required, whatever the design system)

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
    - With a language switch or list, the page's own labels switch too, not only the map's texts.
12. **Continue this map** (always, last section): how to carry on with this map. Three short steps: install the value-stream-map skill (link: https://github.com/manufacture-dev/skills), get this map's data, ask an agent to continue it. Then two buttons on the exact `vsm-data` content:
    - **Copy the data**: `navigator.clipboard.writeText(json)` inside the click; if it fails, show the JSON in a read-only, selected text area so it can be copied by hand.
    - **Download (JSON)**, as `<slug of case.title>.json`: in a Claude artifact (where `window.claude` exists), through `await window.claude.use('downloads')` and `dl.save({filename, data: json})`, shown only when that returns non-null (declare the `downloads` capability when publishing); anywhere else (a local file, `serve`, any web host), a plain download link on a Blob. The default page does both.
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
- **Language:** the map's own language first; with other `languages`, a switch (two languages) or a list (more), translating the map's texts through `i18n.<code>` (whole texts; a text missing there shows as written) and the page's own labels too.

Rules for the page:

- It is one self-contained HTML page (it may load fonts or a library from a public CDN, but the default page needs none, so it works offline), in light and dark. On a phone the layout stays the same: the flow scrolls sideways in its container.
- Run `embed` after writing the page and again after every change to the map; `import` reads the map back from it.
- Check the page against `summary` before sharing: same totals, every stage and loop present.
- Show nothing the map does not hold: no invented figure, no extra comment on people.
