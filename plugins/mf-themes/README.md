# mf-themes

Design systems for a page made by an agent: a map, a report, a dashboard, a readout. Not a colour swap: each theme has its own typography, surfaces, component shapes, header, ornaments and density, drawn from a concrete world, and it never removes or changes what the page shows.

- **Built-in themes:** atelier (a workshop wall: kraft paper, sticky notes, marker handwriting), plan (an engineering drawing: title block, grid paper, a blueprint in dark mode), rapport (an editorial annual report: serif headlines, numbered kickers, financial-style tables).
- **Your organisation's colours and font** on any theme, in light and dark.
- **New design systems made for you**, the way a studio would: three radically different directions on the real page, checked (contrast, phone width, light and dark), shown side by side on a board; you keep one.

![The same page in the four built-in designs, side by side](https://raw.githubusercontent.com/manufacture-dev/skills/main/docs/designs.png)

## Use

- *"Show me other designs for this page."*
- *"Use our colours: here is our site."*
- *"Make us three new styles."*

It works with any page that keeps its own CSS in `@layer page` and marks its sections with `data-part`; `themes.mjs page <page.html>` says whether a page is ready.

## Install

See the [repository's README](https://github.com/manufacture-dev/skills#install). Requires Node.js 18 or later; nothing else.

## What it runs

`scripts/themes.mjs`, plain JavaScript with no dependency: it checks theme folders (fonts and licences), applies a theme to a page you name and builds a board. A themed page is one file: fonts are embedded, nothing is fetched when it opens. To make a new theme, the agent downloads free fonts (OFL) from Fontsource into the theme folder; nothing else uses the network. The skill's instructions are in [`skills/mf-themes/SKILL.md`](skills/mf-themes/SKILL.md).

## Licence

MIT. Fonts in the built-in themes are under the SIL Open Font License 1.1, next to each font.
