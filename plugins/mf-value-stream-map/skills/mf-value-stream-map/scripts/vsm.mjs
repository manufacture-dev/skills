#!/usr/bin/env node
// Value stream map: create, validate, outline, edit, compute its figures, embed it in a page, import it from one.
// The page itself is written by the agent, in whatever design system it is given (see SKILL.md). No dependencies, Node 18+.
//   node vsm.mjs new      <map.json> --title <text> [--stages "<Stage 1>,<Stage 2>,…"] [--client <name>] [--trigger <text>] [--end <text>] [--team "<A>,<B>"] [--languages "en,fr"]
//                                                          (default stages: the starter stages)
//   node vsm.mjs validate <map.json>
//   node vsm.mjs outline  <map.json>                       (compact view for an agent: ids and what each box holds)
//   node vsm.mjs patch    <map.json> --ops '<json array>'  (apply changes, validate, write only if valid)
//   node vsm.mjs detail   <map.json> --stage <id> --steps '<json>' [--to <sub-step id>]
//   node vsm.mjs summary  <map.json> [--text]              (the figures a page shows: totals, per stage, gaps; JSON by default)
//   node vsm.mjs questions <map.json> [--text] [--limit n] [--near <stage>[/<step>]]
//                                                          (what is still to ask, in interview order, or nearest the box just discussed first)
//   node vsm.mjs embed    <map.json> --page <page.html>    (put the map and its figures into the page, replacing any previous copy)
//   node vsm.mjs import   <page.html> --output <map.json> [--force]   (take the map back out of a page)
//   node vsm.mjs page     <map.json> --output <page.html> [--theme <name or folder>] [--force]   (the default page, with the map in it: a standalone file)
//   node vsm.mjs serve    <map.json> [--page <page.html>] [--port 4173]   (local site that reloads on every change; /designs compares the themes)
//   node vsm.mjs texts    <map.json> [--lang <code>] [--missing]          (the map's texts to translate, as JSON)
//   node vsm.mjs labels   [<map.json>] --lang <code> [--missing]          (the default page's labels, in English, to translate into map.ui.<code>)
//   node vsm.mjs designs  <map.json> --output <dir> [--themes a,b,c]      (one page per theme, and index.html to compare them)
//   node vsm.mjs themes                                                   (the built-in themes and what each is)
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync, renameSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { watch } from 'node:fs';

if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error(`Node 18 or later is needed (this is ${process.version}): https://nodejs.org (or brew install node, winget install OpenJS.NodeJS.LTS).`);
  process.exit(2);
}
const DEFAULT_PAGE = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'default-page.html');
// Themes and languages come from the shared modules (mf-themes, mf-i18n), copied into scripts/lib/ by the repository.
import { listThemes, themeCss as themeCssOf, themeInfo as themeInfoOf, withTheme, designsBoard } from './lib/themes.mjs';
import { checkLanguages, textsOf as textsOfData, addTranslations, labelsToTranslate } from './lib/i18n.mjs';

export const MARKER_KINDS = ['accelerates', 'slows', 'bottleneck', 'new-bottleneck', 'pain', 'new-pain', 'duplicate', 'not-done'];
export const AI_LEVELS = ['assistant', 'tooled', 'prepares', 'chains'];
export const STAGE_STATUS = ['assumed', 'confirmed'];
export const HYPOTHESIS_STATUS = ['open', 'confirmed', 'refuted', 'partial'];
// The stages a new map starts from when none are given; the team changes them as the discussion goes (stage ops).
// Themes: "neutral" is the default page as it is; each folder of assets/themes/ is a built-in design system
// (the mf-themes library, copied here). A map may also name its own theme folder, by a path relative to the map.
const THEMES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'themes');
export const THEMES = listThemes(THEMES_DIR);
const themeCss = (theme, base, tokens) => themeCssOf(theme, { dir: THEMES_DIR, base, tokens });
const themeInfo = (t) => themeInfoOf(t, { dir: THEMES_DIR });
const designsIndex = (items) => designsBoard(items, 'Map designs');
// The map's texts to translate: every string except ids, references and codes (and the stage ids of case.stages).
const NOT_TEXT = ['from', 'to', 'fromStep', 'toStep', 'level', 'kind', 'status', 'phase', 'at', 'stage', 'step', 'loop', 'theme', 'themeTokens', 'asked', 'now', 'roster', 'questions', 'notes', 'unmapped', 'pending'];
const textsOf = (data) => textsOfData({ ...data, case: { ...(data.case || {}), stages: undefined } }, NOT_TEXT);
export const STARTER_STAGES = ['Request', 'Refinement', 'Build', 'Review', 'QA', 'Release'];
const slug = (x) => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Write through a temporary file then rename: the preview never reads a half-written map.
function writeAtomic(file, data) { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n'); renameSync(tmp, file); }


function isDuration(v) {
  return v === null || v === undefined || (typeof v === 'object' && typeof v.days === 'number' && v.days >= 0);
}

// Version of the map format. A map without it is read as 1; raise it when a map written before the change would be
// misread, and say in CHANGELOG.md how to bring an older map up to date.
export const SCHEMA_VERSION = 1;

export function validate(data) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  if (!data || typeof data !== 'object') return ['root: not an object'];
  if (data.schemaVersion !== undefined && !(Number.isInteger(data.schemaVersion) && data.schemaVersion >= 1)) err('schemaVersion', 'integer from 1');
  else if (data.schemaVersion > SCHEMA_VERSION) return [`schemaVersion: this map is format ${data.schemaVersion}, this skill reads up to ${SCHEMA_VERSION}: update the skill`];
  if (!data.case || typeof data.case.title !== 'string') err('case.title', 'required string');
  if (!Array.isArray(data.stages)) { err('stages', 'required array'); return errors; }
  const ids = new Set();
  data.stages.forEach((s, i) => {
    const p = `stages[${i}]`;
    if (typeof s.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) err(`${p}.id`, 'lowercase id with dashes');
    else if (ids.has(s.id)) err(`${p}.id`, `duplicate "${s.id}"`);
    else ids.add(s.id);
    if (typeof s.name !== 'string' || !s.name) err(`${p}.name`, 'required string');
    if (s.status && !STAGE_STATUS.includes(s.status)) err(`${p}.status`, `one of ${STAGE_STATUS.join(', ')}`);
    if (!isDuration(s.work)) err(`${p}.work`, 'null or {"days": number, "approx"?: bool, "text"?: string}');
    if (!isDuration(s.wait)) err(`${p}.wait`, 'null or {"days": number, "approx"?: bool, "text"?: string}');
    if (s.parallel) err(`${p}.parallel`, 'stages follow each other, never parallel: put the activity as a parallel sub-step');
    const caOk = (v) => v === undefined || (typeof v === 'number' && v >= 0 && v <= 100);
    if (!caOk(s.ca)) err(`${p}.ca`, 'percent complete and accurate, 0–100');
    (s.steps || []).forEach((x, j) => { if (x && !caOk(x.ca)) err(`${p}.steps[${j}].ca`, 'percent complete and accurate, 0–100'); if (x && x.batch !== undefined && typeof x.batch !== 'string') err(`${p}.steps[${j}].batch`, 'string'); });
    if ((s.steps || []).length) for (const k of ['ca', 'caApprox', 'caSource', 'batch']) if (s[k] !== undefined) err(`${p}.${k}`, 'the stage has sub-steps: put it on the sub-step concerned');
    if (s.batch !== undefined && typeof s.batch !== 'string') err(`${p}.batch`, 'string');
    // Sub-step ids: required, lowercase-dashes, unique in the stage (loops point at them).
    const sids = new Set();
    (s.steps || []).forEach((x, j) => {
      if (!x || typeof x.id !== 'string' || !/^[a-z0-9-]+$/.test(x.id)) err(`${p}.steps[${j}].id`, 'required, lowercase id with dashes');
      else if (sids.has(x.id)) err(`${p}.steps[${j}].id`, `duplicate "${x.id}"`);
      else sids.add(x.id);
    });
    if (s.checked !== undefined && (typeof s.checked !== 'object' || s.checked === null)) err(`${p}.checked`, 'object {steps, loops, parallel}');
    if (s.steps !== undefined && !Array.isArray(s.steps)) err(`${p}.steps`, 'array');
    // Once a stage has sub-steps, everything lives on them: the stage is only a frame.
    if ((s.steps || []).length) {
      for (const k of ['ai', 'markers']) if ((s[k] || []).length) err(`${p}.${k}`, 'the stage has sub-steps: move these to the sub-step where they happen');
      for (const k of ['work', 'wait']) if (s[k]) err(`${p}.${k}`, 'the stage has sub-steps: put this duration on the sub-step it belongs to (a wait before the stage goes on its first sub-step)');
    }
    (s.steps || []).forEach((x, j) => {
      if (!x || typeof x.name !== 'string' || !x.name) err(`${p}.steps[${j}].name`, 'required string');
      else {
        if (!isDuration(x.work)) err(`${p}.steps[${j}].work`, 'null or {"days": number, …}');
        if (!isDuration(x.wait)) err(`${p}.steps[${j}].wait`, 'null or {"days": number, …}');
        if (x.status && !STAGE_STATUS.includes(x.status)) err(`${p}.steps[${j}].status`, `one of ${STAGE_STATUS.join(', ')}`);
        (x.ai || []).forEach((a, k) => {
          if (typeof a.label !== 'string') err(`${p}.steps[${j}].ai[${k}].label`, 'required string');
          if (!AI_LEVELS.includes(a.level)) err(`${p}.steps[${j}].ai[${k}].level`, `one of ${AI_LEVELS.join(', ')}`);
        });
        (x.markers || []).forEach((m, k) => {
          if (!MARKER_KINDS.includes(m.kind)) err(`${p}.steps[${j}].markers[${k}].kind`, `one of ${MARKER_KINDS.join(', ')}`);
          if (typeof m.text !== 'string' || !m.text) err(`${p}.steps[${j}].markers[${k}].text`, 'required string');
        });
      }
    });
    (s.ai || []).forEach((a, j) => {
      if (typeof a.label !== 'string') err(`${p}.ai[${j}].label`, 'required string');
      if (!AI_LEVELS.includes(a.level)) err(`${p}.ai[${j}].level`, `one of ${AI_LEVELS.join(', ')}`);
    });
    (s.markers || []).forEach((m, j) => {
      if (!MARKER_KINDS.includes(m.kind)) err(`${p}.markers[${j}].kind`, `one of ${MARKER_KINDS.join(', ')}`);
      if (typeof m.text !== 'string' || !m.text) err(`${p}.markers[${j}].text`, 'required string');
    });
  });
  // case.stages: the stage ids in order, kept in step with stages[] by the stage ops (add, rename, move, remove).
  // A mismatch means stages were edited by hand: change them with a {"stage": …} op instead.
  if (data.case && Array.isArray(data.case.stages)) {
    const got = data.stages.map((x) => x.id).join(', '), want = data.case.stages.join(', ');
    if (got !== want) err('stages', `case.stages (${want}) and stages (${got}) differ: change stages with a {"stage": …} op`);
  }
  (data.loops || []).forEach((l, i) => {
    if (!ids.has(l.from)) err(`loops[${i}].from`, `unknown stage "${l.from}"`);
    if (!ids.has(l.to)) err(`loops[${i}].to`, `unknown stage "${l.to}"`);
    if (!isDuration(l.cost)) err(`loops[${i}].cost`, 'null or {"days": number, …}');
    // fromStep / toStep: a sub-step of the from / to stage, by id or name.
    const hasStep = (sid, ref) => ((data.stages.find((x) => x.id === sid) || {}).steps || []).some((x) => x.id === ref);
    // A detailed stage has no box of its own: a loop end on it names the sub-step.
    const detailed = (sid) => ((data.stages.find((x) => x.id === sid) || {}).steps || []).length > 0;
    if (!l.fromStep && detailed(l.from)) err(`loops[${i}].fromStep`, `"${l.from}" has sub-steps: say which one sends the work back`);
    if (!l.toStep && detailed(l.to)) err(`loops[${i}].toStep`, `"${l.to}" has sub-steps: say which one redoes the work`);
    if (l.fromStep && !hasStep(l.from, l.fromStep)) err(`loops[${i}].fromStep`, `no sub-step "${l.fromStep}" in "${l.from}"`);
    if (l.toStep && !hasStep(l.to, l.toStep)) err(`loops[${i}].toStep`, `no sub-step "${l.toStep}" in "${l.to}"`);
  });
  (data.hypotheses || []).forEach((h, i) => {
    if (h.status && !HYPOTHESIS_STATUS.includes(h.status)) err(`hypotheses[${i}].status`, `one of ${HYPOTHESIS_STATUS.join(', ')}`);
  });
  (data.notes || []).forEach((x, i) => { if (!x || typeof x.text !== 'string' || !x.text) err(`notes[${i}].text`, 'required string'); });
  if (data.asked !== undefined && (!Array.isArray(data.asked) || data.asked.some((k) => typeof k !== 'string'))) err('asked', 'list of question keys');
  for (const e of checkLanguages(data)) errors.push(e);
  if (data.theme !== undefined && (typeof data.theme !== 'string' || !data.theme)) err('theme', `a built-in theme (${THEMES.join(', ')}) or the path of a theme folder, relative to the map`);
  if (data.themeTokens !== undefined) {
    const tt = data.themeTokens, ok = (o) => o === undefined || (o && typeof o === 'object' && Object.keys(o).every((k) => /^--[\w-]+$/.test(k)));
    if (!tt || typeof tt !== 'object' || !ok(tt.light) || !ok(tt.dark)) err('themeTokens', '{"light": {"--token": "value"}, "dark": {…}} (CSS custom properties of the page)');
  }
  return errors;
}

// Put the map (vsm-data) and its figures (vsm-summary) into a page: existing tags are replaced in place; new ones
// go before the page's first script, so a script that reads them at load finds them.
function embedIn(html, data) {
  for (const [id, v] of [['vsm-data', data], ['vsm-summary', summarize(data)]]) {
    const tag = jsonTag(id, v);
    if (TAG(id).test(html)) html = html.replace(TAG(id), () => tag);
    else if (/<script[\s>]/i.test(html)) html = html.replace(/<script[\s>]/i, (m) => `${tag}\n${m}`);
    else if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, () => `${tag}\n</body>`);
    else html += `\n${tag}\n`;
  }
  return html;
}

function load(file) {
  const raw = readFileSync(file, 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (e) { return { errors: [`JSON: ${e.message}`] }; }
  // A malformed map (a null item, a missing case) must not crash the preview mid-workshop.
  try { return { data, errors: validate(data) }; } catch (e) { return { data, errors: [`validator: ${e.message}`] }; }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}


// Each change takes a lock, re-reads the latest map, applies its ops and writes, so two agents never overwrite
// each other. A lock older than 10 s is stale.
function withLock(file, fn) {
  const lk = file + '.lock', t0 = Date.now();
  for (;;) {
    try { mkdirSync(lk); break; } catch {
      try { if (Date.now() - statSync(lk).mtimeMs > 10000) { rmSync(lk, { recursive: true, force: true }); continue; } } catch { continue; }
      if (Date.now() - t0 > 5000) throw new Error('map locked for 5 s');
      const until = Date.now() + 40; while (Date.now() < until) { /* short wait */ }
    }
  }
  try { return fn(); } finally { rmSync(lk, { recursive: true, force: true }); }
}

// Split a stage into sub-steps: everything that sat on the stage moves down (nothing may stay on a detailed
// stage). AI uses and markers go to `to` (default: the first sub-step); an AI use taken from a presentation (confirm:true, "deck")
// is dropped when the target already has a real one; the wait before the stage, its %C&A and its batch go to
// the first sub-step (the one that waits and receives the work); a whole-stage work time goes to the log;
// loop ends on the stage point at the first sub-step, marked to confirm. Returns a summary, or throws.
function detailStage(data, stageId, steps, toId, at) {
  const st = (data.stages || []).find((x) => x.id === stageId);
  if (!st) throw new Error(`unknown stage "${stageId}"`);
  if (!Array.isArray(steps) || !steps.length) throw new Error('steps: a non-empty array of sub-steps');
  st.steps = (st.steps || []).concat(steps);
  const first = st.steps[0], to = st.steps.find((x) => x.id === toId) || first;
  const moved = [];
  const isDeck = (a) => a && a.confirm && /deck/i.test(a.who || '');
  if ((st.ai || []).length) {
    const real = (to.ai || []).some((a) => !isDeck(a));
    const keep = real ? st.ai.filter((a) => !isDeck(a)) : st.ai;
    if (keep.length < st.ai.length) moved.push(`${st.ai.length - keep.length} deck AI use(s) replaced by the one described`);
    if (keep.length) { to.ai = (to.ai || []).concat(keep); moved.push(`${keep.length} ai → ${to.name}`); }
    delete st.ai;
  }
  if ((st.markers || []).length) { to.markers = (to.markers || []).concat(st.markers); moved.push(`${st.markers.length} markers → ${to.name}`); delete st.markers; }
  if (st.wait) { if (!first.wait) first.wait = st.wait; moved.push(`wait → ${first.name}`); }
  for (const k of ['ca', 'caApprox', 'caSource', 'batch']) if (st[k] !== undefined) { if (first[k] === undefined) first[k] = st[k]; delete st[k]; if (k === 'ca' || k === 'batch') moved.push(`${k} → ${first.name}`); }
  const whole = st.work;
  st.wait = null; st.work = null;
  for (const l of data.loops || []) {
    if (l.from === st.id && !l.fromStep) { l.fromStep = first.id; l.confirm = true; moved.push('loop end → ' + first.name + ' (to confirm)'); }
    if (l.to === st.id && !l.toStep) { l.toStep = first.id; l.confirm = true; moved.push('loop end → ' + first.name + ' (to confirm)'); }
  }
  (data.log = data.log || []).push({ at, text: `${st.name} detailed in ${st.steps.length} sub-steps` + (moved.length ? `; moved: ${moved.join(', ')}` : '') + (whole ? `; whole-stage figure "${whole.text || whole.days + ' d'}" to spread over the sub-steps` : '') + '.' });
  return `${st.id}: ${st.steps.map((x) => x.id).join(', ')}${moved.length ? ' · ' + moved.join(', ') : ''}${whole ? ' · whole-stage work in the log' : ''}`;
}

// Change the stages themselves, as the team corrects them during the discussion. One op, one change:
//   {"add": {"name", "id"?, "fr"?}, "after"|"before": "<id>"}   new stage, assumed, empty (default: at the end)
//   {"rename": "<id>", "name": "…", "fr"?: "…"}                 the id stays, so loops and references hold
//   {"move": "<id>", "after"|"before": "<id>"}
//   {"remove": "<id>", "into"?: "<id>"}   an empty stage goes; one holding anything needs "into", the stage it merges
//                                         into: its sub-steps (or the stage itself, as one sub-step) move there,
//                                         after the target's own, and its loop ends follow.
// Each op writes its own log line; add a {"log"} op saying who asked for it.
function stageOp(data, op, at) {
  const stages = data.stages, ids = () => stages.map((x) => x.id);
  const find = (id) => { const s = stages.find((x) => x.id === id); if (!s) throw new Error(`unknown stage "${id}"`); return s; };
  const place = (st) => {
    const ref = op.after || op.before;
    if (!ref) { stages.push(st); return; }
    find(ref); stages.splice(ids().indexOf(ref) + (op.after ? 1 : 0), 0, st);
  };
  const fr = (en, txt) => { if (txt) { data.i18n = data.i18n || {}; (data.i18n.fr = data.i18n.fr || {})[en] = txt; } };
  const holds = (s) => (s.steps || []).length || s.work || s.wait || (s.ai || []).length || (s.markers || []).length
    || s.ca !== undefined || s.batch || list(s.actors).length || list(s.tools).length;
  const log = (text) => (data.log = data.log || []).push({ at, text });
  // actors and tools are written as "A, B" (a list is read too).
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
  const join = (...vs) => [...new Set(vs.flatMap(list))].join(', ') || undefined;
  let text;
  if (op.add) {
    const name = op.add.name; if (!name) throw new Error('stage add: a name');
    const id = op.add.id || slug(name);
    if (ids().includes(id)) throw new Error(`stage "${id}" exists`);
    place({ id, name, status: 'assumed', work: null, wait: null, ai: [], markers: [] }); fr(name, op.add.fr);
    text = `Stage "${name}" added${op.after ? ' after ' + find(op.after).name : op.before ? ' before ' + find(op.before).name : ' at the end'}.`;
  } else if (op.rename) {
    const st = find(op.rename); if (!op.name) throw new Error('stage rename: a name');
    const old = st.name; st.name = op.name; fr(op.name, op.fr);
    text = `Stage "${old}" renamed "${op.name}".`;
  } else if (op.move) {
    const st = find(op.move); if (!op.after && !op.before) throw new Error('stage move: "after" or "before"');
    if ((op.after || op.before) === st.id) throw new Error('stage move: next to another stage');
    stages.splice(ids().indexOf(st.id), 1); place(st);
    text = `Stage "${st.name}" moved ${op.after ? 'after ' + find(op.after).name : 'before ' + find(op.before).name}.`;
  } else if (op.remove) {
    const st = find(op.remove);
    if (!op.into) {
      const used = (data.loops || []).some((l) => l.from === st.id || l.to === st.id);
      if (holds(st) || used) throw new Error(`stage "${st.id}" holds work or loops: give "into", the stage it merges into`);
      stages.splice(ids().indexOf(st.id), 1);
      text = `Stage "${st.name}" removed.`;
    } else {
      const to = find(op.into); if (to.id === st.id) throw new Error('stage remove: "into" another stage');
      const asStep = (s) => { const x = { id: s.id, name: s.name, who: join(s.actors), tools: join(s.tools), status: s.status };
        for (const k of ['work', 'wait', 'ai', 'markers', 'ca', 'caApprox', 'caSource', 'batch']) if (s[k] !== undefined) x[k] = s[k];
        return JSON.parse(JSON.stringify(x)); };
      // The target keeps its own box as a sub-step when it had none, so nothing that sat on it is lost.
      if (!(to.steps || []).length && holds(to)) {
        const own = asStep(to); to.steps = [own];
        for (const k of ['work', 'wait', 'ai', 'markers', 'ca', 'caApprox', 'caSource', 'batch']) delete to[k];
        to.work = null; to.wait = null;
        for (const l of data.loops || []) { if (l.from === to.id && !l.fromStep) l.fromStep = own.id; if (l.to === to.id && !l.toStep) l.toStep = own.id; }
      }
      const moved = (st.steps || []).length ? st.steps : (holds(st) ? [asStep(st)] : []);
      const taken = new Set((to.steps || []).map((x) => x.id)), rename = {};
      for (const x of moved) { let id = x.id; while (taken.has(id)) id = `${st.id}-${id}`; rename[x.id] = id; x.id = id; taken.add(id); }
      to.steps = (to.steps || []).concat(moved);
      if (!to.steps.length) delete to.steps;
      for (const k of ['actors', 'tools']) { const v = join(to[k], st[k]); if (v) to[k] = v; }
      for (const l of data.loops || []) {
        if (l.from === st.id) { l.from = to.id; l.fromStep = l.fromStep ? rename[l.fromStep] : (moved[0] || {}).id; if (!l.fromStep) delete l.fromStep; }
        if (l.to === st.id) { l.to = to.id; l.toStep = l.toStep ? rename[l.toStep] : (moved[0] || {}).id; if (!l.toStep) delete l.toStep; }
      }
      stages.splice(ids().indexOf(st.id), 1);
      text = `Stage "${st.name}" merged into "${to.name}"` + (moved.length ? `: ${moved.map((x) => x.name).join(', ')} now sub-step(s) of ${to.name}` : '') + '.';
    }
  } else throw new Error(`unknown stage op ${JSON.stringify(op)}`);
  if (data.case) data.case.stages = ids();
  log(text);
  return text;
}

// What is still to ask, in two passes. Pass "flow" builds the stream first: the frame (use case, trigger, end,
// team, stages) and the steps of every stage; nothing else is asked, so the stream gets as many steps as possible
// before any detail. Pass "enrich" comes once the flow is there: one question per theme and stage, covering every
// box still missing it (waits, work times, AI uses, rework, %C&A, who, tools, then what is still to confirm), for
// the whole map or one stage. Each box keeps its own key; a key in data.asked was asked and got no answer
// ("we don't know", "no AI there"), so it is not asked again.
export const Q_THEMES = ['wait', 'work', 'ai', 'rework', 'ca', 'who', 'tools', 'check'];
function questionsFor(data) {
  const asked = new Set(data.asked || []);
  const c = data.case || {}, stages = data.stages || [], loops = data.loops || [];
  const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
  const flow = [], enrich = [];
  const one = (key, theme, question, at = {}) => { if (!asked.has(key)) flow.push({ pass: 'flow', theme, key, ...at, question }); };
  if (empty(c.title)) one('case:title', 'frame', 'Which real piece of work do we follow, from the request to production (a recent one that reached production)?');
  if (empty(c.trigger)) one('case:trigger', 'frame', 'What starts the work on it: the request, the event or the decision?');
  if (empty(c.end)) one('case:end', 'frame', 'When is the value delivered: what tells you it is done?');
  if (empty(c.team)) one('case:team', 'frame', 'Who takes part, from the request to production (roles)?');
  const started = stages.some((s) => s.status === 'confirmed' || (s.steps || []).length || s.work || s.wait);
  if (!started) one('case:stages', 'frame', `Between that start and that end, are these the stages, in this order: ${stages.map((s) => s.name).join(' → ')}? Any to add, rename, merge or remove?`);
  // checked {steps, loops}: set by a live tool once the question was asked for that stage (answered or not).
  stages.forEach((s) => { if (!(s.steps || []).length && !(s.checked || {}).steps) one(`${s.id}:steps`, 'steps', `What happens in ${s.name}, step by step, and who does each step?`, { stage: s.id }); });
  // Enrich: per stage and theme, the boxes still missing it. A parallel box shares the queue of the one it runs
  // alongside (no wait asked); the very first box of the stream receives nothing (no %C&A asked).
  const group = (theme, stage, boxes, question) => { const b = boxes.filter((x) => !asked.has(x.key)); if (b.length) enrich.push({ pass: 'enrich', theme, stage: stage.id, boxes: b, question: question(b) }); };
  const names = (b) => b.map((x) => x.name).join('; ');
  stages.forEach((s, si) => {
    const inner = (s.steps || []).filter((x) => x.phase !== 'upstream');
    const boxes = (inner.length ? inner : [s]).map((x, bi) => ({ x, first: si === 0 && bi === 0, k: x === s ? s.id : `${s.id}/${x.id}`, step: x === s ? null : x.id, name: x.name }));
    const pick = (theme, test) => boxes.filter(test).map((b) => ({ step: b.step, key: `${b.k}:${theme}`, name: b.name }));
    group('wait', s, pick('wait', (b) => !b.x.wait && !b.x.parallel), (b) => `In ${s.name}, how long does the work wait before it starts on: ${names(b)}?`);
    group('work', s, pick('work', (b) => !b.x.work), (b) => `In ${s.name}, how long does each take when someone works on it (working time, not elapsed): ${names(b)}?`);
    group('ai', s, pick('ai', (b) => empty(b.x.ai)), (b) => `In ${s.name}, is AI used for: ${names(b)}? For what, and who checks what it produces?`);
    const marks = [s, ...(s.steps || [])].some((x) => (x.markers || []).length);
    const back = loops.some((l) => l.from === s.id || l.to === s.id) || (s.checked || {}).loops;
    group('rework', s, [...(back ? [] : [{ step: null, key: `${s.id}:loops`, name: 'what comes back' }]), ...(marks ? [] : [{ step: null, key: `${s.id}:markers`, name: 'what slows or hurts' }])],
      () => `In ${s.name}, what comes back for rework (from where, how often, at what cost), and what slows the work down or hurts?`);
    group('ca', s, pick('ca', (b) => !b.first && b.x.ca === undefined), (b) => `In ${s.name}, of what each receives, how much can be used as is, without going back (%): ${names(b)}?`);
    group('who', s, pick('who', (b) => empty(b.x === s ? s.actors : b.x.who)), (b) => `In ${s.name}, who does: ${names(b)}?`);
    group('tools', s, pick('tools', (b) => empty(b.x.tools)), (b) => `In ${s.name}, which tools are used for: ${names(b)}?`);
  });
  loops.forEach((l) => {
    const b = [...(empty(l.count) ? [{ key: `loop:${l.id}:count`, name: 'how often' }] : []), ...(!l.cost ? [{ key: `loop:${l.id}:cost`, name: 'cost of one round' }] : [])];
    const st = stages.find((x) => x.id === l.from) || { id: l.from };
    group('rework', st, b.map((x) => ({ ...x, loop: l.id })), (bb) => `"${l.label || l.id}": ${bb.map((x) => x.name).join(' and ')}?`);
  });
  stages.forEach((s) => {
    const b = [];
    if (s.status !== 'confirmed') b.push({ step: null, key: `${s.id}:confirm`, name: s.name });
    [s, ...(s.steps || [])].forEach((x) => {
      const k = x === s ? s.id : `${s.id}/${x.id}`, step = x === s ? null : x.id;
      if (x !== s && x.status === 'assumed') b.push({ step, key: `${k}:confirm`, name: x.name });
      (x.ai || []).forEach((u) => u.confirm && b.push({ step, key: `${k}:ai:${u.label}`, name: `AI: ${u.label}` }));
      (x.markers || []).forEach((m) => m.confirm && b.push({ step, key: `${k}:marker:${m.text}`, name: `${m.kind}: ${m.text}` }));
    });
    loops.forEach((l) => l.confirm && l.from === s.id && b.push({ loop: l.id, key: `loop:${l.id}:confirm`, name: `rework: ${l.label || l.id}` }));
    group('check', s, b, (bb) => `In ${s.name}, is this what really happened on this case: ${names(bb)}?`);
  });
  const hyp = (data.hypotheses || []).filter((h) => (h.status || 'open') === 'open' && !asked.has(`hypothesis:${h.id}`));
  if (hyp.length) enrich.push({ pass: 'enrich', theme: 'check', stage: null, boxes: hyp.map((h) => ({ key: `hypothesis:${h.id}`, name: h.text })), question: `Does what was said confirm or refute: ${hyp.map((h) => `"${h.text}"`).join('; ')}?` });
  if (!(data.parking || []).length && !asked.has('case:parking')) enrich.push({ pass: 'enrich', theme: 'check', stage: null, boxes: [{ key: 'case:parking', name: 'ideas for later' }], question: 'Any idea for doing it differently, to note for later?' });
  enrich.sort((a, b) => Q_THEMES.indexOf(a.theme) - Q_THEMES.indexOf(b.theme));
  // While the stream is built, a few detail questions are worth asking at once, on the boxes where they matter
  // most: the wait before a box that hands over or waits by nature (a review, a validation, a meeting, a release
  // train), and the AI use on a box that writes, codes or tests. Optional: never a prerequisite to go on.
  const WAITS = /review|revue|valid|approv|sign.?off|accept|meeting|réunion|refinement|planning|sprint|train|release|deploy|déploi|mise en prod|triage|handover|hand.?off|wait|attente|queue|slot/i;
  const AI = /writ|rédig|draft|code|coding|develop|dévelop|implement|test|spec|stor|criteria|critère|doc|mock|maquette|design|brief|note/i;
  const hints = [];
  stages.forEach((s) => (s.steps || []).filter((x) => x.phase !== 'upstream').forEach((x) => {
    const k = `${s.id}/${x.id}`, at = { stage: s.id, step: x.id };
    if (!x.wait && !x.parallel && WAITS.test(x.name) && !asked.has(`${k}:wait`)) hints.push({ pass: 'flow', theme: 'wait', key: `${k}:wait`, ...at, optional: true, question: `How long does the work usually wait before "${x.name}"?` });
    if (empty(x.ai) && AI.test(x.name) && !asked.has(`${k}:ai`)) hints.push({ pass: 'flow', theme: 'ai', key: `${k}:ai`, ...at, optional: true, question: `Is AI used for "${x.name}"? For what?` });
  }));
  return { flow, enrich, hints };
}

// The figures a page shows, computed once here so every page (whatever its design) shows the same numbers.
// Times are in working days. A stage's times are its own when it has no sub-steps, else its sub-steps':
// a group of parallel sub-steps (a sub-step marked parallel runs alongside the one before) counts once,
// for its longest. Sub-steps with phase "upstream" are kept out of the totals and summed apart.
function summarize(data) {
  const stages = data.stages || [], loops = data.loops || [];
  const groups = (list) => { const g = []; list.forEach((x) => { if (x.parallel && g.length) g[g.length - 1].push(x); else g.push([x]); }); return g; };
  const maxOf = (g, k) => Math.max(0, ...g.map((x) => (x[k] ? x[k].days : 0)));
  const inFlow = (x) => x.phase !== 'upstream';
  const r1 = (v) => Math.round(v * 100) / 100;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
  const times = (s) => {
    const st = (s.steps || []).filter(inFlow);
    if (!st.length) return { work: s.work ? s.work.days : 0, wait: s.wait ? s.wait.days : 0 };
    let w = 0, q = 0;
    groups(st).forEach((g) => { w += maxOf(g, 'work'); q += maxOf(g, 'wait'); });
    return { work: w, wait: q };
  };
  let work = 0, wait = 0;
  const perStage = stages.map((s, i) => {
    const t = times(s), st = (s.steps || []).filter(inFlow), lt = t.work + t.wait;
    work += t.work; wait += t.wait;
    const boxes = st.length ? st : [s];
    return {
      n: i + 1, id: s.id, name: s.name, status: s.status || 'assumed',
      wait: r1(t.wait), work: r1(t.work), lead: r1(lt), efficiency: pct(t.work, lt),
      boxes: boxes.length, withoutWork: boxes.filter((x) => !x.work).length, withoutWait: boxes.filter((x) => !x.wait).length,
      reworkOut: loops.filter((l) => l.from === s.id && !(l.to === s.id && (l.toStep || '') === (l.fromStep || ''))).length,
      iterations: loops.filter((l) => l.from === s.id && l.to === s.id && (l.toStep || '') === (l.fromStep || '')).length,
      aiUses: (s.ai || []).length + st.reduce((m, x) => m + (x.ai || []).length, 0),
      noDurations: boxes.every((x) => !x.work && !x.wait),
      detailed: st.length > 0,
      aiTopLevel: (() => { const order = AI_LEVELS; let top = -1; [s, ...st].forEach((x) => (x.ai || []).forEach((a) => { top = Math.max(top, order.indexOf(a.level)); })); return top >= 0 ? order[top] : null; })(),
      markersByKind: [s, ...st].reduce((m, x) => { (x.markers || []).forEach((k) => { m[k.kind] = (m[k.kind] || 0) + 1; }); return m; }, {}),
      rolledCA: (() => { const v = boxes.filter((x) => typeof x.ca === 'number').map((x) => x.ca); return v.length ? Math.round(v.reduce((m, c) => (m * c) / 100, 1) * 100) : null; })(),
      markers: boxes.reduce((m, x) => m + (x.markers || []).length, 0) + (st.length ? (s.markers || []).length : 0),
      actors: s.actors || [...new Set(st.map((x) => x.who).filter(Boolean).flatMap((w) => String(w).split(/\s*,\s*/)))].join(', ') || null,
      tools: s.tools || [...new Set(st.map((x) => x.tools).filter(Boolean).flatMap((w) => String(w).split(/\s*,\s*/)))].join(', ') || null,
      batches: boxes.filter((x) => x.batch).map((x) => x.batch),
    };
  });
  const lead = work + wait;
  perStage.forEach((r) => { r.shareOfLead = pct(r.lead, lead); });
  const longest = perStage.reduce((m, r) => (r.lead > (m ? m.lead : 0) ? r : m), null);
  let uw = 0, uq = 0, un = 0;
  stages.forEach((s) => groups((s.steps || []).filter((x) => !inFlow(x))).forEach((g) => { un += g.length; uw += maxOf(g, 'work'); uq += maxOf(g, 'wait'); }));
  const cas = [];
  stages.forEach((s) => ((s.steps || []).length ? s.steps : [s]).forEach((x) => { if (typeof x.ca === 'number') cas.push(x.ca); }));
  const rolled = cas.length ? Math.round(cas.reduce((m, v) => (m * v) / 100, 1) * 100) : null;
  const ai = {}; stages.forEach((s) => [s, ...(s.steps || [])].forEach((x) => (x.ai || []).forEach((a) => { ai[a.level] = (ai[a.level] || 0) + 1; })));
  const markers = {}; stages.forEach((s) => [s, ...(s.steps || [])].forEach((x) => (x.markers || []).forEach((m) => { markers[m.kind] = (markers[m.kind] || 0) + 1; })));
  // Items to confirm, as data (the page writes them in its own words and language).
  const toConfirm = [];
  stages.forEach((s) => (s.steps || []).forEach((x) => x.status === 'assumed' && toConfirm.push({ stage: s.id, step: x.id, type: 'step', text: x.name })));
  stages.forEach((s) => [s, ...(s.steps || [])].forEach((x) => {
    const at = { stage: s.id, step: x === s ? null : x.id };
    (x.ai || []).forEach((a) => a.confirm && toConfirm.push({ ...at, type: 'ai', text: a.label }));
    (x.markers || []).forEach((m) => m.confirm && toConfirm.push({ ...at, type: 'marker', kind: m.kind, text: m.text }));
  }));
  loops.forEach((l) => l.confirm && toConfirm.push({ type: 'loop', id: l.id || null, from: l.from, fromStep: l.fromStep || null, to: l.to, toStep: l.toStep || null, text: l.label || '' }));
  // Boxes still missing a time, by id, so the page can point at them.
  const missing = { work: [], wait: [] };
  stages.forEach((s) => ((s.steps || []).filter(inFlow).length ? s.steps.filter(inFlow) : [s]).forEach((x) => {
    const ref = x === s ? { stage: s.id, step: null } : { stage: s.id, step: x.id };
    if (!x.work) missing.work.push(ref); if (!x.wait) missing.wait.push(ref);
  }));
  return {
    totals: { lead: r1(lead), work: r1(work), wait: r1(wait), flowEfficiency: pct(work, lead), rolledCA: rolled, caMeasuredBoxes: cas.length, note: (data.case || {}).leadNote || null,
      incompleteStages: perStage.filter((r) => r.withoutWork > 0).length, stagesWithoutDurations: perStage.filter((r) => r.noDurations).length },
    upstream: un ? { boxes: un, work: r1(uw), wait: r1(uq), lead: r1(uw + uq) } : null,
    stages: perStage, longestStage: longest ? longest.id : null,
    counts: {
      stages: stages.length, confirmed: stages.filter((s) => s.status === 'confirmed').length,
      boxes: perStage.reduce((m, r) => m + r.boxes, 0), boxesWithoutWork: perStage.reduce((m, r) => m + r.withoutWork, 0), boxesWithoutWait: perStage.reduce((m, r) => m + r.withoutWait, 0),
      loops: loops.length, reworkOut: perStage.reduce((m, r) => m + r.reworkOut, 0), iterations: perStage.reduce((m, r) => m + r.iterations, 0), aiUses: perStage.reduce((m, r) => m + r.aiUses, 0), aiByLevel: ai, markersByKind: markers, parking: (data.parking || []).length,
      hypotheses: (data.hypotheses || []).reduce((m, h) => { m[h.status || 'open'] = (m[h.status || 'open'] || 0) + 1; return m; }, {}),
    },
    toConfirm, missing,
  };
}

const TAG = (id) => new RegExp(`<script id="${id}" type="application/json">[\\s\\S]*?</script>`);
const jsonTag = (id, v) => `<script id="${id}" type="application/json">${JSON.stringify(v).replace(/</g, '\\u003c')}</script>`;

const [cmd, fileArg] = process.argv.slice(2);
if (cmd === 'themes') {
  for (const t of THEMES) console.log(`${t} · ${themeInfo(t)}`);
  process.exit(0);
}
if (cmd === 'labels') {
  // The default page's labels in English (or the keys still missing for a map's language): translate the values,
  // keep the keys, the {n}/{m}/{b}/{l} placeholders and the one/other forms, then set them in map.ui.<lang>.
  const l = arg('--lang'); if (!l) { console.error('labels needs --lang <code>'); process.exit(2); }
  const mapFile = fileArg && !fileArg.startsWith('--') ? fileArg : null;
  const html = readFileSync(DEFAULT_PAGE, 'utf8');
  console.log(JSON.stringify(labelsToTranslate(html, l, { data: mapFile && existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : null, missing: process.argv.includes('--missing') }), null, 2));
  process.exit(0);
}
if (!cmd || !fileArg) {
  console.error('usage: vsm.mjs <new|validate|outline|patch|detail|summary|questions|embed|import|page|serve|texts|labels|designs|themes> <file> [--ops <json>] [--stage <id> --steps <json> [--to <id>]] [--page <page.html>] [--output <file>] [--force] [--text]');
  process.exit(2);
}
const file = resolve(fileArg);
if (cmd === 'new') {
  // An empty map: the case and its stages, in order (the starter stages when none are given), nothing else.
  if (existsSync(file) && !process.argv.includes('--force')) { console.error(`exists: ${file} (use --force)`); process.exit(1); }
  const given = String(arg('--stages') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const names = given.length ? given : STARTER_STAGES;
  if (!arg('--title')) { console.error('new needs --title [--stages "<Stage 1>,<Stage 2>,…"]'); process.exit(2); }
  const stages = names.map((n) => ({ id: slug(n), name: n, status: 'assumed', work: null, wait: null, ai: [], markers: [] }));
  const team = String(arg('--team') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const languages = String(arg('--languages') || 'en').split(',').map((x) => x.trim()).filter(Boolean);
  const data = { schemaVersion: SCHEMA_VERSION, languages, case: { client: arg('--client') || '', title: arg('--title'), trigger: arg('--trigger') || '', end: arg('--end') || '', team, stages: stages.map((x) => x.id) }, stages, loops: [], parking: [], hypotheses: [], log: [] };
  const errs = validate(data);
  if (errs.length) { console.error(`INVALID:\n- ${errs.join('\n- ')}`); process.exit(1); }
  writeAtomic(file, data);
  console.log(`CREATED ${file} (${stages.map((x) => x.id).join(', ')}${given.length ? '' : ', the starter stages'})`);
  process.exit(0);
}
if (!existsSync(file)) { console.error(`not found: ${file}`); process.exit(2); }
const now = () => new Date().toTimeString().slice(0, 5);

if (cmd === 'validate') {
  const { errors } = load(file);
  if (errors.length) { console.error(`INVALID ${file}\n- ${errors.join('\n- ')}`); process.exit(1); }
  console.log(`VALID ${file}`);
} else if (cmd === 'outline') {
  // A compact view of the map for an agent: stage and sub-step ids with what they already hold, loops by id.
  const { data } = load(file);
  if (!data) process.exit(1);
  const d = (x) => (x ? (x.text || x.days + 'd') : '?');
  for (const st of data.stages || []) {
    const own = (st.steps || []).length ? '' : ` wait=${d(st.wait)} work=${d(st.work)}${st.ca !== undefined ? ' ca=' + st.ca : ''}${st.batch ? ' batch=' + st.batch : ''} ai=${(st.ai || []).length} mk=${(st.markers || []).map((m) => m.kind).join('+') || 0}`;
    console.log(`${st.id} [${st.status || 'assumed'}]${own}`);
    for (const x of st.steps || []) console.log(`  ${x.id}${x.parallel ? ' ‖' : ''} "${x.name}" who=${x.who || '?'} wait=${d(x.wait)} work=${d(x.work)}${x.ca !== undefined ? ' ca=' + x.ca : ''}${x.batch ? ' batch=' + x.batch : ''} ai=${(x.ai || []).map((a) => a.label).join(' | ') || 0} mk=${(x.markers || []).map((m) => m.kind).join('+') || 0}`);
  }
  for (const l of data.loops || []) console.log(`loop ${l.id || '(no id)'}: ${l.from}${l.fromStep ? '/' + l.fromStep : ''} → ${l.to}${l.toStep ? '/' + l.toStep : ''} ${l.count || ''}`);
  for (const h of data.hypotheses || []) console.log(`hypothesis ${h.id}: ${h.status || 'open'}`);
  console.log(`case: trigger=${data.case.trigger || '?'} | end=${data.case.end || '?'}`);
} else if (cmd === 'patch') {
  // Apply a list of changes, validate, and write only if the result is valid. --ops '<json array>' or --ops-file <file>. Each op:
  //   {"set": "<path>", "value": …}  {"push": "<path>", "value": …}  {"insert": "<path>", "at": 0, "value": …}  {"del": "<path>"}  {"log": "text"}
  //   {"detail": {"stage": "<id>", "steps": [...], "to": "<sub-step id>"}}   (split a stage, then go on with other ops)
  //   {"stage": {"add"|"rename"|"move"|"remove": …}}   (change the stages themselves: see stageOp)
  //   {"translate": {"lang": "<code>", "texts": {"<text>": "<translation>"}}}   (add translations; see texts)
  // A path is dot-separated; inside a list a segment picks the item whose id (or name, or AI label) matches, or an index:
  //   "stages.build.steps.code.work", "stages.qa.steps.smoke-tests.ai", "loops.qa-to-build.count", "hypotheses.h1.status".
  let code = 0;
  try { code = withLock(file, () => {
    const { data, errors } = load(file);
    if (!data) { console.error(errors[0]); return 1; }
    let ops;
    try { ops = JSON.parse(arg('--ops-file') ? readFileSync(arg('--ops-file'), 'utf8') : (arg('--ops') || '[]')); } catch (e) { console.error(`ops: ${e.message}`); return 2; }
    const step = (cur, seg, make) => {
      if (Array.isArray(cur)) {
        const i = /^\d+$/.test(seg) ? Number(seg) : cur.findIndex((x) => x && (x.id === seg || x.name === seg || x.label === seg));
        if (i < 0 || i >= cur.length) throw new Error(`no item "${seg}"`);
        return { parent: cur, key: i };
      }
      if (cur[seg] === undefined || cur[seg] === null) { if (!make) throw new Error(`no "${seg}"`); cur[seg] = make; }
      return { parent: cur, key: seg };
    };
    const walk = (path, lastMake) => {
      const segs = path.split('.'); let cur = data;
      for (let i = 0; i < segs.length - 1; i++) { const r = step(cur, segs[i], {}); cur = r.parent[r.key]; }
      const last = segs[segs.length - 1];
      if (Array.isArray(cur) && lastMake === undefined) return step(cur, last);
      return { parent: cur, key: Array.isArray(cur) ? step(cur, last).key : last, ensure: () => { if (cur[last] == null) cur[last] = lastMake; } };
    };
    const at = arg('--at') || now();
    try {
      for (const op of Array.isArray(ops) ? ops : [ops]) {
        if (op.detail !== undefined) detailStage(data, op.detail.stage, op.detail.steps, op.detail.to, at);
        else if (op.stage !== undefined) stageOp(data, op.stage, at);
        else if (op.translate !== undefined) {
          // {"translate": {"lang": "de", "texts": {"<text in the map's language>": "<translation>", …}}}: texts hold dots, so no path.
          addTranslations(data, op.translate);
        }
        else if (op.log !== undefined) (data.log = data.log || []).push({ at, text: op.log });
        else if (op.set !== undefined) { const r = walk(op.set, null); r.parent[r.key] = op.value; }
        else if (op.insert !== undefined) { const r = walk(op.insert, []); if (r.ensure) r.ensure(); const l = r.parent[r.key]; if (!Array.isArray(l)) throw new Error(`"${op.insert}" is not a list`); l.splice(Math.max(0, Math.min(Number(op.at) || 0, l.length)), 0, op.value); }
        else if (op.push !== undefined) { const r = walk(op.push, []); if (r.ensure) r.ensure(); if (!Array.isArray(r.parent[r.key])) throw new Error(`"${op.push}" is not a list`); r.parent[r.key].push(op.value); }
        else if (op.del !== undefined) { const r = walk(op.del); if (Array.isArray(r.parent)) r.parent.splice(r.key, 1); else delete r.parent[r.key]; }
        else throw new Error(`unknown op ${JSON.stringify(op)}`);
      }
    } catch (e) { console.error(`PATCH FAILED, nothing written: ${e.message}`); return 1; }
    const errs = validate(data);
    if (errs.length) { console.error(`INVALID, nothing written:\n- ${errs.join('\n- ')}`); return 1; }
    writeAtomic(file, data);
    console.log(`PATCHED ${(Array.isArray(ops) ? ops : [ops]).length} op(s)`);
    return 0;
  }); } catch (e) { console.error(`PATCH FAILED: ${e.message}`); code = 1; }
  if (code) process.exit(code);
} else if (cmd === 'detail') {
  // Split a stage (see detailStage). patch can do the same with a {"detail": …} op, in the same call as other changes.
  let steps; try { steps = JSON.parse(arg('--steps') || '[]'); } catch (e) { console.error(`--steps: ${e.message}`); process.exit(2); }
  let code = 0;
  try { code = withLock(file, () => {
    const { data, errors } = load(file);
    if (!data) { console.error(errors[0]); return 1; }
    let msg;
    try { msg = detailStage(data, arg('--stage'), steps, arg('--to'), arg('--at') || now()); } catch (e) { console.error(e.message); return 2; }
    const errs = validate(data);
    if (errs.length) { console.error(`INVALID after detail, nothing written:\n- ${errs.join('\n- ')}`); return 1; }
    writeAtomic(file, data);
    console.log(`DETAILED ${msg}`);
    return 0;
  }); } catch (e) { console.error(`DETAIL FAILED: ${e.message}`); code = 1; }
  if (code) process.exit(code);
} else if (cmd === 'questions') {
  // --pass flow|enrich (default: flow while the stream is not built, then enrich) · --theme <theme> · --stage <id>
  // (one stage) · --near <id> (that stage first, then its neighbours) · --limit n · --text.
  const { data } = load(file);
  if (!data) process.exit(1);
  const { flow, enrich, hints } = questionsFor(data);
  // Asking for a theme or a stage (enrich it now) is allowed before the whole stream is built.
  const flowHere = arg('--stage') ? flow.filter((x) => x.stage === arg('--stage')) : flow;
  const pass = arg('--pass') || (arg('--theme') || !flowHere.length ? 'enrich' : 'flow');
  let list = pass === 'flow' ? flow : enrich;
  // In pass flow, the optional detail questions worth asking now follow, nearest the box just discussed.
  if (pass === 'flow') list = list.concat(hints);
  if (arg('--theme')) list = list.filter((x) => x.theme === arg('--theme'));
  if (arg('--stage')) list = list.filter((x) => x.stage === arg('--stage'));
  if (arg('--near')) {
    const order = (data.stages || []).map((x) => x.id), ni = order.indexOf(arg('--near').split('/')[0]);
    const d = (x) => (x.stage && ni >= 0 ? Math.abs(order.indexOf(x.stage) - ni) : 99);
    list = list.map((x, i) => ({ x, i })).sort((a, b) => d(a.x) - d(b.x) || a.i - b.i).map((y) => y.x);
  }
  const count = (l) => Q_THEMES.map((t) => [t, l.filter((x) => x.theme === t).reduce((m, x) => m + x.boxes.length, 0)]).filter((x) => x[1]);
  const left = { flow: flow.length, enrich: Object.fromEntries(count(enrich)) };
  const n = Number(arg('--limit')) || (process.argv.includes('--text') ? 3 : list.length);
  if (process.argv.includes('--text')) {
    const toEnrich = count(enrich).map(([t, v]) => `${t} ${v}`).join(', ') || 'nothing';
    console.log(flow.length ? `stream not built yet: ${flow.length} question(s) (frame, steps) · to enrich later: ${toEnrich} (boxes)` : `stream built · to enrich: ${toEnrich} (boxes)`);
    // Optional hints, then, only when the stream questions are fewer than the limit, or with --near.
    const shown = arg('--near') ? list.slice(0, n) : [...list.filter((x) => !x.optional).slice(0, n), ...list.filter((x) => x.optional).slice(0, 1)];
    shown.forEach((x) => console.log(`[${x.theme}${x.optional ? ', optional' : ''}]${x.stage ? ' ' + x.stage : ''}${x.boxes ? ` (${x.boxes.length})` : ''} · ${x.question}`));
    if (list.length > shown.length) console.log(`… ${list.length - shown.length} more`);
  } else console.log(JSON.stringify({ pass, left, questions: list.slice(0, n) }, null, 2));
} else if (cmd === 'summary') {
  const { data, errors } = load(file);
  if (errors.length) { console.error(`INVALID ${file}\n- ${errors.join('\n- ')}`); process.exit(1); }
  const sm = summarize(data);
  if (!process.argv.includes('--text')) { console.log(JSON.stringify(sm, null, 2)); process.exit(0); }
  const t = sm.totals;
  console.log(`lead ${t.lead} d = work ${t.work} + wait ${t.wait} · flow efficiency ${t.flowEfficiency ?? '—'} % · rolled C&A ${t.rolledCA ?? 'not measured'}${t.rolledCA !== null ? ' %' : ''} (${t.caMeasuredBoxes} boxes)`);
  for (const r of sm.stages) console.log(`${r.n}. ${r.name} [${r.status}] wait ${r.wait} · work ${r.work} · lead ${r.lead} (${r.shareOfLead ?? 0} %) · ↩ ${r.reworkOut} ↻ ${r.iterations} · AI ${r.aiUses} · without work ${r.withoutWork}/${r.boxes}`);
  if (sm.upstream) console.log(`upstream (outside the lead time): ${sm.upstream.boxes} boxes, ${sm.upstream.lead} d`);
  console.log(`to confirm: ${sm.toConfirm.length} · without work ${sm.missing.work.length} · without wait ${sm.missing.wait.length}`);
} else if (cmd === 'texts') {
  // The texts of the map to translate: all of them, or with --lang <code> --missing the ones without a translation.
  const { data } = load(file);
  if (!data) process.exit(1);
  const l = arg('--lang'), all = textsOf(data), have = ((data.i18n || {})[l]) || {};
  const list = l && process.argv.includes('--missing') ? all.filter((t) => !(t in have)) : all;
  console.log(JSON.stringify(Object.fromEntries(list.map((t) => [t, l ? have[t] || '' : ''])), null, 2));
  if (l) console.error(`${list.length} text(s)${process.argv.includes('--missing') ? ' without a translation' : ''} for "${l}" (of ${all.length})`);
} else if (cmd === 'designs') {
  // One page per built-in theme, and an index to compare them side by side: the person picks, then {"set": "theme"}.
  const out = arg('--output'); if (!out) { console.error('--output <dir> required'); process.exit(2); }
  const { data, errors } = load(file);
  if (errors.length) { console.error(`INVALID ${file}\n- ${errors.join('\n- ')}`); process.exit(1); }
  mkdirSync(out, { recursive: true });
  // --themes a,b,c (built-in names or folders, e.g. three new directions) instead of the built-in ones.
  const list = arg('--themes') ? arg('--themes').split(',').map((x) => x.trim()).filter(Boolean) : THEMES;
  const items = [];
  for (const t of list) {
    const name = t.replace(/\/+$/, '').split('/').pop();
    let css; try { css = themeCss(t, process.cwd(), data.themeTokens); } catch (e) { console.error(e.message); process.exit(1); }
    writeFileSync(join(out, `${name}.html`), withTheme(embedIn(readFileSync(DEFAULT_PAGE, 'utf8'), data), css));
    items.push([name, `${name}.html`, themeInfo(t)]);
  }
  writeFileSync(join(out, 'index.html'), designsIndex(items));
  console.log(`DESIGNS ${resolve(out)} (${items.map((x) => x[0]).join(', ')}; open index.html)`);
} else if (cmd === 'page') {
  // The skill's default page (neutral design, every layout rule), with the map in it: one file to open or host anywhere.
  const out = arg('--output');
  if (!out) { console.error('--output <page.html> required'); process.exit(2); }
  if (existsSync(out) && !process.argv.includes('--force')) { console.error(`exists: ${out} (use --force)`); process.exit(1); }
  const { data, errors } = load(file);
  if (errors.length) { console.error(`INVALID ${file}\n- ${errors.join('\n- ')}`); process.exit(1); }
  let css; try { css = themeCss(arg('--theme') || data.theme, dirname(file), data.themeTokens); } catch (e) { console.error(e.message); process.exit(1); }
  writeFileSync(out, withTheme(embedIn(readFileSync(DEFAULT_PAGE, 'utf8'), data), css));
  console.log(`PAGE ${resolve(out)}${(arg('--theme') || data.theme) ? ` (theme ${arg('--theme') || data.theme})` : ''}`);
} else if (cmd === 'serve') {
  // A local site for working sessions: serves the page (yours, or the default one) with the current map and its
  // figures, and reloads open browsers on every change of the map or the page. An invalid map keeps the last valid
  // one on screen. Nothing is written; publish (or `page` / `embed`) when you choose.
  const pg = arg('--page') ? resolve(arg('--page')) : DEFAULT_PAGE;
  if (!existsSync(pg)) { console.error(`not found: ${pg}`); process.exit(2); }
  const port = Number(arg('--port') || 4173);
  let current = load(file), valid = current.errors.length ? null : current.data;
  // Open pages ask for /version every second and reload when it changes. Polling, not a held connection: browsers
  // allow about six open connections per site, and /designs alone is four pages, so held connections hang new tabs.
  let version = Date.now();
  const RELOAD = '<script>(()=>{let v=null;setInterval(async()=>{try{const r=await fetch("/version",{cache:"no-store"});const t=await r.text();if(v!==null&&t!==v)location.reload();v=t}catch(e){}},1000)})()</script>';
  let timer;
  const changed = () => { clearTimeout(timer); timer = setTimeout(() => {
    current = load(file); if (!current.errors.length) valid = current.data;
    console.log(`${new Date().toLocaleTimeString()} ${current.errors.length ? 'INVALID (last valid map kept): ' + current.errors[0] : 'reloaded'}`);
    version = Date.now();
  }, 120); };
  for (const f of new Set([file, pg])) watch(dirname(f), (_, name) => { if (!name || join(dirname(f), name) === f) changed(); });
  const server = createServer((req, res) => {
    if (req.url === '/version') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end(String(version)); return; }
    if (req.url === '/designs') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(designsIndex(THEMES.map((t) => [t, `/?theme=${encodeURIComponent(t)}`, themeInfo(t)]))); return; }
    if (req.url === '/map.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(valid)); return; }
    if (req.url === '/' || req.url.startsWith('/?')) {
      // ?theme=<name> previews a built-in theme (the page reads it); the map is unchanged.
      if (!valid) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(`INVALID ${file}\n- ${current.errors.join('\n- ')}`); return; }
      let theme = valid.theme; try { const q = new URL(req.url, 'http://x').searchParams.get('theme'); if (q) theme = q; } catch (e) {}
      let html = embedIn(readFileSync(pg, 'utf8'), valid);
      if (pg === DEFAULT_PAGE) { try { html = withTheme(html, themeCss(theme, dirname(file), valid.themeTokens)); } catch (e) { console.error(e.message); } }
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => `${RELOAD}\n</body>`) : html + RELOAD;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return;
    }
    res.writeHead(404); res.end();
  });
  let tryPort = port;
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && tryPort < port + 10) { tryPort += 1; server.listen(tryPort, '127.0.0.1'); }
    else { console.error(`SERVE FAILED: ${e.message}`); process.exit(1); }
  });
  server.on('listening', () => console.log(`READY http://127.0.0.1:${tryPort}/  (map: ${file}, page: ${pg === DEFAULT_PAGE ? 'default' : pg}; themes side by side: /designs)`));
  server.listen(tryPort, '127.0.0.1');
} else if (cmd === 'embed') {
  // The page carries the map (vsm-data) and its figures (vsm-summary) in two fixed tags: the page reads them,
  // and `import` takes the map back whatever the page looks like. Existing tags are replaced in place; new ones go
  // before the page's first script, so a script that reads them at load finds them.
  const pg = arg('--page');
  if (!pg || !existsSync(pg)) { console.error('--page <existing page.html> required'); process.exit(2); }
  const { data, errors } = load(file);
  if (errors.length) { console.error(`INVALID ${file}\n- ${errors.join('\n- ')}`); process.exit(1); }
  writeFileSync(pg, embedIn(readFileSync(pg, 'utf8'), data));
  console.log(`EMBEDDED ${resolve(pg)} (vsm-data, vsm-summary)`);
} else if (cmd === 'import') {
  // An exported page (or a copy of the published one) carries its map in <script id="vsm-data">: write it back as JSON.
  const out = arg('--output');
  if (!out) { console.error('--output required'); process.exit(2); }
  if (existsSync(out) && !process.argv.includes('--force')) { console.error(`exists: ${out} (use --force)`); process.exit(1); }
  const m = readFileSync(file, 'utf8').match(/<script id="vsm-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) { console.error('no map in this page (no <script id="vsm-data">)'); process.exit(1); }
  let data; try { data = JSON.parse(m[1]); } catch (e) { console.error(`map JSON: ${e.message}`); process.exit(1); }
  const errs = validate(data);
  writeAtomic(resolve(out), data);
  console.log(`IMPORTED ${resolve(out)}${errs.length ? ` (INVALID, fix before editing:\n- ${errs.join('\n- ')})` : ''}`);
} else {
  console.error(`unknown command: ${cmd}`); process.exit(2);
}
