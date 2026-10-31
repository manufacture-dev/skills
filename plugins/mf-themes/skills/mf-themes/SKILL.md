---
name: mf-themes
description: Use when a page produced by an agent (a map, a report, a dashboard, a readout) must get a design, change design, take an organisation's colours or design system, or when someone wants several designs to choose from ("change the design", "make it look like our site", "propose other styles", "use our charter"). Design systems, not colour swaps: built-in themes, three radically different new directions on the real page, a board to compare them, one kept. Works with any page that keeps its CSS in @layer page.
license: MIT
metadata:
  version: "0.2.0"
---

# Themes: design systems for a page

A page has two layers. **The base** holds what the page must show and how it behaves; its CSS sits in `@layer page { … }`, and its sections carry `data-part="<name>"` hooks. **A theme** dresses it: typography, surfaces, component shapes, header, ornaments, density and colours. Changing colours alone is not a design; a theme is a design system of its own. A theme never removes or changes what the base shows.

CLI (Node 18+, no dependencies), with the path to this skill's `scripts/themes.mjs`:

```bash
node scripts/themes.mjs list                                   # built-in themes and what each is
node scripts/themes.mjs page   <page.html>                     # can this page be themed (@layer page, data-part hooks)
node scripts/themes.mjs apply  <page.html> --theme <name|folder> [--tokens '<json>'] [--output <file>]
node scripts/themes.mjs board  <page.html> --themes <a,b,c> --output <dir>   # the page in each design, side by side
node scripts/themes.mjs check  <theme folder>…                 # theme.json, fonts and licences, no network
node scripts/themes.mjs new    <folder> --name <name> --description "<one sentence>"
```

Requirements: Node.js 18 or later (`node --version`; else https://nodejs.org, `brew install node`, `winget install OpenJS.NodeJS.LTS`). A skill that builds its own pages (mf-value-stream-map) carries the same theme code and the built-in themes, and has its own commands for them (`designs`, `page --theme`); use them there.

## A theme folder

- `theme.json`: `name`, `description` (one sentence: the world it comes from), `fonts`: `[{family, file, weight, style, unicodeRange, license, author, source}]`.
- `theme.css`: unlayered rules over the base. Tokens first, in three blocks (light on `:root`; dark under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and again under `:root[data-theme="dark"]`), then the components through the base's classes and `data-part` hooks.
- `fonts/`: woff2 files under a free licence (OFL from Fontsource: `https://cdn.jsdelivr.net/npm/@fontsource/<name>/files/<name>-latin-400-normal.woff2`, latin and latin-ext with their unicode ranges), and a `LICENSE-<family>.txt` per family.

`apply` embeds the fonts as data URIs and injects the CSS in one `<style id="mf-theme">` after the page's styles, replaced on the next run: the page stays one file, works offline, and works where only inline resources load (a Claude artifact). `--tokens '{"light": {"--accent": "#0055aa", "--font": "Inter, sans-serif"}, "dark": {…}}'` puts an organisation's colours or font on top of any theme.

## Choosing a design, with the person

Offer it at a natural pause (the content is there, before a first publication) or when asked, never before the content: one question, four answers:

1. **Keep** the current design.
2. **Another built-in design**: `board` shows the real page in each, side by side; the person picks.
3. **Their colours and font** on the chosen design (`--tokens`), from their site or style guide. Set light and dark.
4. **A new design system**, made for them, as a studio would:
   1. **One question:** what they like, their organisation's design system or site (a link, tokens, a style guide), what they do not want.
   2. **Three directions, radically different:** not three colour variants of one layout, but three design systems, each with its own typography, component shapes, header, surfaces, ornaments and density, each drawn from a concrete world that suits the people and the subject (a workshop wall, a technical drawing, a report, a control room, a field notebook, a museum label…); avoid the obvious cliché. With an organisation's design system, one direction follows it closely and the other two interpret it. Each is a theme folder in a scratch directory, outside the repository (`new` starts one).
   3. **Check each before showing it:** `check`, then screenshots at desktop and phone width (about 400 px), light and dark: no page error, no sideways scrolling of the page, text contrast 4.5:1, every piece of information still there and readable (provisional items still look provisional, levels still readable without colour).
   4. **Show and choose:** `board <page> --themes <dir1>,<dir2>,<dir3> --output <dir>`, plus one line per direction on what it has for it. The person picks, one adjustment at a time if they want. Keep the chosen folder with the page's data (the skill that owns the page says where); delete the others.
5. Whatever is chosen can change again later; the data never changes.

## Writing a theme

- Read the base page first: its CSS (the classes and the tokens), its `data-part` hooks and the HTML its script writes. Build the page without a theme to see what you change.
- The theme is unlayered, so any property it sets beats the base's variant rules (a dashed "to confirm", a coloured status) whatever their specificity: restate the variants you restyle.
- Keep the base's contract: what it shows, its layout rules (the owning skill lists them), its interactions; never `display: none` on content, never change texts.
- Light and dark both designed; 16 px side gutter at least; at phone width the page itself never scrolls sideways (wide content scrolls in its own container).
- No network at run time: no external `url()`, no `@import`, no `@font-face` in `theme.css` (declare fonts in `theme.json`); images only as data URIs you draw yourself (ornaments, textures, rules), no illustration of content.
- Animations only under `@media (prefers-reduced-motion: no-preference)`.
- Keep fonts under about 250 KB per theme; prefer two families.

## Built-in themes

`list` gives them; they are worked examples to read before writing one: **atelier** (the workshop wall: kraft paper, sticky notes, marker handwriting, index cards), **plan** (an engineering drawing: title block, grid paper, dimension lines; a blueprint in dark mode), **rapport** (an editorial annual report: serif headlines and key figures, numbered kickers, financial-style tables). `neutral` is the base as it is.

To add one to the library: a folder in `themes/`, `check` passes, screenshots reviewed, then `node tools/sync.mjs` at the root of the skills repository copies it into the skills that ship the themes.
