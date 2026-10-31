#!/usr/bin/env node
// Value stream map: create, validate, outline, edit, compute its figures, embed it in a page, import it from one.
// The page itself is written by the agent, in whatever design system it is given (see SKILL.md). No dependencies, Node 18+.
//   node vsm.mjs new      <map.json> --title <text> --stages "<Stage 1>,<Stage 2>,…" [--client <name>]
//   node vsm.mjs validate <map.json>
//   node vsm.mjs outline  <map.json>                       (compact view for an agent: ids and what each box holds)
//   node vsm.mjs patch    <map.json> --ops '<json array>'  (apply changes, validate, write only if valid)
//   node vsm.mjs detail   <map.json> --stage <id> --steps '<json>' [--to <sub-step id>]
//   node vsm.mjs summary  <map.json> [--text]              (the figures a page shows: totals, per stage, gaps; JSON by default)
//   node vsm.mjs embed    <map.json> --page <page.html>    (put the map's data into the page, replacing any previous copy)
//   node vsm.mjs import   <page.html> --output <map.json> [--force]   (take the map back out of a page)
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

export const MARKER_KINDS = ['accelerates', 'slows', 'bottleneck', 'new-bottleneck', 'pain', 'new-pain', 'duplicate', 'not-done'];
export const AI_LEVELS = ['assistant', 'tooled', 'prepares', 'chains'];
export const STAGE_STATUS = ['assumed', 'confirmed'];
export const HYPOTHESIS_STATUS = ['open', 'confirmed', 'refuted', 'partial'];
// Write through a temporary file then rename: the preview never reads a half-written map.
function writeAtomic(file, data) { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n'); renameSync(tmp, file); }


function isDuration(v) {
  return v === null || v === undefined || (typeof v === 'object' && typeof v.days === 'number' && v.days >= 0);
}

export function validate(data) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  if (!data || typeof data !== 'object') return ['root: not an object'];
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
    if (s.parallel) err(`${p}.parallel`, 'stages are the fixed SDLC stages, never parallel: put the activity as a parallel sub-step');
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
  // case.stages: the SDLC stages given by the client, fixed for the workshop. The map keeps exactly
  // these, in this order: the work is detailed in their sub-steps, never in new stages.
  if (data.case && Array.isArray(data.case.stages)) {
    const got = data.stages.map((x) => x.id).join(', '), want = data.case.stages.join(', ');
    if (got !== want) err('stages', `must be exactly the SDLC stages, in order: ${want} (got: ${got}); detail the work as sub-steps`);
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
  return errors;
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
  const toConfirm = [];
  stages.forEach((s) => [s, ...(s.steps || [])].forEach((x) => {
    const where = x === s ? s.name : `${s.name} › ${x.name}`;
    (x.ai || []).forEach((a) => a.confirm && toConfirm.push(`${where}: AI use "${a.label}"`));
    (x.markers || []).forEach((m) => m.confirm && toConfirm.push(`${where}: ${m.kind} "${m.text}"`));
  }));
  loops.forEach((l) => l.confirm && toConfirm.push(`loop ${l.id || ''} ${l.from}${l.fromStep ? '/' + l.fromStep : ''} → ${l.to}${l.toStep ? '/' + l.toStep : ''}`));
  return {
    totals: { lead: r1(lead), work: r1(work), wait: r1(wait), flowEfficiency: pct(work, lead), rolledCA: rolled, caMeasuredBoxes: cas.length, note: (data.case || {}).leadNote || null },
    upstream: un ? { boxes: un, work: r1(uw), wait: r1(uq), lead: r1(uw + uq) } : null,
    stages: perStage, longestStage: longest ? longest.id : null,
    counts: {
      stages: stages.length, confirmed: stages.filter((s) => s.status === 'confirmed').length,
      boxes: perStage.reduce((m, r) => m + r.boxes, 0), boxesWithoutWork: perStage.reduce((m, r) => m + r.withoutWork, 0), boxesWithoutWait: perStage.reduce((m, r) => m + r.withoutWait, 0),
      loops: loops.length, aiByLevel: ai, markersByKind: markers, parking: (data.parking || []).length,
      hypotheses: (data.hypotheses || []).reduce((m, h) => { m[h.status || 'open'] = (m[h.status || 'open'] || 0) + 1; return m; }, {}),
    },
    toConfirm,
  };
}

const DATA_TAG = /<script id="vsm-data" type="application\/json">[\s\S]*?<\/script>/;
const dataTag = (data) => `<script id="vsm-data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

const [cmd, fileArg] = process.argv.slice(2);
if (!cmd || !fileArg) {
  console.error('usage: vsm.mjs <new|validate|outline|patch|detail|summary|embed|import> <file> [--ops <json>] [--stage <id> --steps <json> [--to <id>]] [--page <page.html>] [--output <file>] [--force] [--text]');
  process.exit(2);
}
const file = resolve(fileArg);
if (cmd === 'new') {
  // An empty map: the case and its stages, in order (fixed from then on), nothing else.
  if (existsSync(file) && !process.argv.includes('--force')) { console.error(`exists: ${file} (use --force)`); process.exit(1); }
  const names = String(arg('--stages') || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!arg('--title') || !names.length) { console.error('new needs --title and --stages "<Stage 1>,<Stage 2>,…"'); process.exit(2); }
  const slug = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stages = names.map((n) => ({ id: slug(n), name: n, status: 'assumed', work: null, wait: null, ai: [], markers: [] }));
  const data = { case: { client: arg('--client') || '', title: arg('--title'), trigger: '', end: '', team: [], stages: stages.map((x) => x.id) }, stages, loops: [], parking: [], hypotheses: [], log: [] };
  const errs = validate(data);
  if (errs.length) { console.error(`INVALID:\n- ${errs.join('\n- ')}`); process.exit(1); }
  writeAtomic(file, data);
  console.log(`CREATED ${file} (${stages.map((x) => x.id).join(', ')})`);
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
} else if (cmd === 'summary') {
  const { data, errors } = load(file);
  if (errors.length) { console.error(`INVALID ${file}\n- ${errors.join('\n- ')}`); process.exit(1); }
  const sm = summarize(data);
  if (!process.argv.includes('--text')) { console.log(JSON.stringify(sm, null, 2)); process.exit(0); }
  const t = sm.totals;
  console.log(`lead ${t.lead} d = work ${t.work} + wait ${t.wait} · flow efficiency ${t.flowEfficiency ?? '—'} % · rolled C&A ${t.rolledCA ?? 'not measured'}${t.rolledCA !== null ? ' %' : ''} (${t.caMeasuredBoxes} boxes)`);
  for (const r of sm.stages) console.log(`${r.n}. ${r.name} [${r.status}] wait ${r.wait} · work ${r.work} · lead ${r.lead} (${r.shareOfLead ?? 0} %) · ↩ ${r.reworkOut} ↻ ${r.iterations} · AI ${r.aiUses} · without work ${r.withoutWork}/${r.boxes}`);
  if (sm.upstream) console.log(`upstream (outside the lead time): ${sm.upstream.boxes} boxes, ${sm.upstream.lead} d`);
  console.log(`to confirm: ${sm.toConfirm.length}`);
} else if (cmd === 'embed') {
  // The page carries the map's data in one fixed tag, so `import` can take it back whatever the page looks like.
  const pg = arg('--page');
  if (!pg || !existsSync(pg)) { console.error('--page <existing page.html> required'); process.exit(2); }
  const { data, errors } = load(file);
  if (errors.length) { console.error(`INVALID ${file}\n- ${errors.join('\n- ')}`); process.exit(1); }
  let html = readFileSync(pg, 'utf8');
  const tag = dataTag(data);
  if (DATA_TAG.test(html)) html = html.replace(DATA_TAG, () => tag);
  else if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, () => `${tag}\n</body>`);
  else html += `\n${tag}\n`;
  writeFileSync(pg, html);
  console.log(`EMBEDDED ${resolve(pg)}`);
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
