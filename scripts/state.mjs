#!/usr/bin/env node
// Where a video stands, from its files plus the approvals recorded in state.json.
// A gate can only be approved after the one before it, and an approval goes stale when
// the files it approved change afterwards.
//
// Usage: node state.mjs [dir]                     -> status (resume from here)
//        node state.mjs approve <1-4> [dir] [--by "user"|"agent"] [--note "..."]
//                                                 -> runs the gate's own checks first and refuses on any, one line per
//                                                    problem: gate 1 numbers_lint, narration_lint and beats_lint (each
//                                                    narration.<lang>.txt); gate 2 pad_voice (idempotent) before hashing.
//                                                    A first approval then prints the next step's reading (as
//                                                    `next --print`), so no turn goes to `next`.
//                                                    approve 3 also runs storyboard_lint.mjs and records its result;
//                                                    it refuses without review/benchmark.md, with a row there more
//                                                    than 1 point behind the reference (board or look rules), or with a verdict older
//                                                    than the style frames; every approval also records the
//                                                    token report (tokens.mjs → review/tokens.json)
//        node state.mjs check <1-4> [dir]         -> exit 0 only if that gate is approved and fresh
//        node state.mjs log "<step> | <output> | <problems or ->" [dir]
//                                                 -> appends "HH:MM–HH:MM | …" to PRODUCTION.md; the step
//                                                    starts where the day's last logged line ended; never
//                                                    refuses: a Step 6 line written before storyboard.md exists or gate 3
//                                                    is approved is recorded with "| WARN …" appended, and a WARN is printed
//        node state.mjs next [dir] [--step 0-8] [--print] [--sub]
//                                                 -> where the video stands, and the reading list of that step:
//                                                    the exact sections to read, as ready commands (--print: their text),
//                                                    the lesson headlines of the film's mode, each subagent job with its
//                                                    model and effort; Step 0 prints Step 1 with it, Express Step 5 Step 6
//                                                    --sub: only the step's subagent sections, as text: the subagent's
//                                                    own call, so the main agent never carries them
//                                                    (FAILED when the step has none)
//        node state.mjs models                  -> every subagent job, its model and effort, per step and mode
//        node state.mjs metrics [dir]           -> the run in numbers for the hand-off (review/metrics.md): start, end, output folder,
//                                                 total, minutes per step, each subagent's model, effort and tokens;
//                                                 Start and End are the first and last log line by time; subagent tokens come from the
//                                                 session transcripts, else "not counted" (never 0)
//        node state.mjs reading [--skill <dir>] [--json]
//                                                 -> checks the reading table: every heading exists, each section
//                                                    is ≤ 8 KB, SKILL.md (loaded every session) ≤ 9.5 KB, the
//                                                    main-context reading of Steps 0–8 ≤ 60 KB on the Studio path and
//                                                    ≤ 45 KB on the Express path (express.md for Steps 5–7); optional
//                                                    Step 2 shown on its own line, in neither total

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GATES = {
  // `optional`: hashed when present, not required. The model is what the approved numbers come from: an input edited
  // in model.mjs, or a rerun that writes another numbers.json, makes the approval stale even when the words stay.
  1: { name: 'script', files: ['script.md', 'narration.txt'], optional: ['model.mjs', 'numbers.json'] },
  2: { name: 'voice', files: ['audio/beats.json'] },
  3: { name: 'look', files: ['SPEC.md', 'storyboard.md', 'style-frames'], optional: ['review/benchmark.md'] }, // approve 3 requires the verdict; an approval from before it stays fresh
  4: { name: 'draft', files: ['index.html'] },
};

const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const by = flag('--by') ?? 'user', note = flag('--note');
const stepGiven = args.includes('--step'), stepArg = flag('--step'), skillArg = flag('--skill');
const json = args.includes('--json'); if (json) args.splice(args.indexOf('--json'), 1);
const print = args.includes('--print'); if (print) args.splice(args.indexOf('--print'), 1);
const forSub = args.includes('--sub'); if (forSub) args.splice(args.indexOf('--sub'), 1);
const sub = ['approve', 'check', 'log', 'metrics', 'next', 'reading', 'models'].includes(args[0]) ? args[0] : null;
const [cmd, gateArg, dirArg] = sub === 'next' || sub === 'metrics' ? [sub, null, args[1]] : sub === 'reading' || sub === 'models' ? [sub, null, null] : sub ? args : [null, null, args[0]];
const dir = dirArg ?? '.';
const readSkill = skillArg ? path.resolve(skillArg) : SKILL; // --skill: read another skill copy's references (tests)
const file = path.join(dir, 'state.json');
const state = existsSync(file) && cmd !== 'reading' ? JSON.parse(readFileSync(file, 'utf8')) : { approvals: {} };

// One hash over a gate's files (folders: every file inside), so any edit shows up.
const hashOf = g => {
  const h = createHash('sha1');
  const add = p => { if (!existsSync(p)) return h.update(`missing:${p}`); if (statSync(p).isDirectory()) readdirSync(p).sort().forEach(f => add(path.join(p, f))); else h.update(readFileSync(p)); };
  GATES[g].files.forEach(f => add(path.join(dir, f)));
  (GATES[g].optional ?? []).filter(f => existsSync(path.join(dir, f))).forEach(f => add(path.join(dir, f)));
  return h.digest('hex').slice(0, 12);
};
const ready = g => GATES[g].files.every(f => existsSync(path.join(dir, f)));
// Gate 3's benchmark (review.md "Benchmark review"): the fresh reviewer's table, written by the main agent to
// review/benchmark.md as `| Row | Reference | Style frames | … |`, scores 1–5. A row more than 1 point behind the reference
// blocks the gate; so does a verdict that is missing, unreadable or older than the style frames (never read as passed).
// Express (BRIEF.md "mode: express", references/express.md): Steps 5–7 read express.md and Gate 3 needs no benchmark
// and no style frames (Express makes none).
const express = cmd !== 'reading' && existsSync(path.join(dir, 'BRIEF.md')) && /^\W*mode\W*:\W*express\b/im.test(readFileSync(path.join(dir, 'BRIEF.md'), 'utf8'));
if (express) GATES[3].files = GATES[3].files.filter(f => f !== 'style-frames');
const BENCH = 'review/benchmark.md';
const BENCH_ROWS = ['detail density', 'material truth', 'light and shadow', 'text system', 'overlays caused by motion', 'framing', 'macro quality'];
const newest = p => statSync(p).isDirectory() ? Math.max(0, ...readdirSync(p).map(f => newest(path.join(p, f)))) : statSync(p).mtimeMs;
const benchmarkOf = () => {
  const p = path.join(dir, BENCH);
  if (!existsSync(p)) return { error: `has no benchmark verdict: ${BENCH} (review.md "Benchmark review": the style frames scored against the reference board, or the look's rules with no reference video)` };
  if (statSync(p).mtimeMs < newest(path.join(dir, 'style-frames'))) return { error: `has a benchmark older than the style frames: score them again into ${BENCH}` };
  const scores = {};
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const c = l.split('|').map(s => s.trim());
    if (c.length < 5) continue;
    const row = c[1].replace(/\*/g, '').trim().toLowerCase();
    if (!BENCH_ROWS.includes(row)) continue; // header, separator, notes
    if (row in scores) return { error: `cannot read ${BENCH}: row "${c[1]}" appears twice` };
    const [ref, own] = [c[2], c[3]].map(s => (/^[1-5]$/.test(s) ? Number(s) : NaN));
    if (Number.isNaN(ref) || Number.isNaN(own)) return { error: `cannot read ${BENCH}: row "${c[1]}" needs two scores 1–5 (reference, style frames)` };
    scores[row] = [ref, own];
  }
  const absent = BENCH_ROWS.filter(r => !(r in scores));
  if (absent.length) return { error: `cannot read ${BENCH}: no score for ${absent.join(', ')}` };
  const behind = BENCH_ROWS.filter(r => scores[r][0] - scores[r][1] > 1);
  if (behind.length) return { error: `is held by the benchmark: ${behind.map(r => `${r} ${scores[r][1]} vs ${scores[r][0]}`).join(', ')} — more than 1 point behind the reference; fix the style frames and score them again` };
  return { summary: BENCH_ROWS.map(r => `${r} ${scores[r][1]}/${scores[r][0]}`).join(', ') };
};
const status = g => { const a = state.approvals[g]; return !a ? (ready(g) ? 'waiting for approval' : 'not started') : a.hash === hashOf(g) ? `approved ${a.at} by ${a.by}` : `STALE — files changed after approval (${a.at})`; };
// The reading list: one table that mirrors SKILL.md's step table (edit both together; `state.mjs reading`, run by
// scripts/gate.sh, checks it). An entry is [file in references/, heading line], the heading EXACTLY as the file has
// it (null = the whole file). Tiers: `read` is what the main context reads at the step (counted, with the lesson
// headlines, in the 60 KB budget); `refs` is a look-up index of the sections the step's text points to (one line each:
// the heading and its exact sed command, no body printed; each section still within the section budget and its
// heading checked, outside the 60 KB); `sub` is what a subagent reads (printed for its prompt, same section checks,
// outside the 60 KB: it is not the main context).
// A section is the heading line through the line before the next heading of ANY level, ignoring lines inside ```
// fences, trailing blank lines dropped; a heading must match exactly one line outside fences.
const KB = 1024, SECTION_MAX = 8 * KB, TOTAL_MAX = 60 * KB, EXPRESS_MAX = 45 * KB, SKILL_MAX = 9.5 * KB, OPTIONAL_STEP = '2';
const of = (file, ...headings) => headings.map(h => [file, h]);
// tree(): the section with its subsections (it ends at the next heading of the same or a higher level), one index line.
const tree = (file, ...headings) => headings.map(h => [file, h, true]);
const LOOKS = of('looks.md', '# The looks: isometric-world first, cutaway, blueprint (Step 5 reads this)');
const VD_ENERGY = of('visual-direction.md', '## 3. Energy (the Step 1 "Energy" option)');
const VD_RESTRAINT = of('visual-direction.md', '## 5. Restraint: top-notch, not overdone');
const VD_CINEMA = of('visual-direction.md', '## 6. Cinematography');
const THREEJS = of('looks.md', '### Install the engine into the project', '### The iso look in three.js', '### Set dressing, real scale, interior style, condition', '### True shapes and true surfaces');
const VD_HERO = tree('visual-direction.md', '## 1. The hero is true (real reference, drawn or built)');
const VD_LAYERS = of('visual-direction.md', '## 12. Information layers: headline, cards, labels, captions');
const VD_QUANTITY = of('visual-direction.md', '## 13. Showing a quantity: twin sets, flow arrows, the formula on the set, tags, sound words, gauges');
const NUMBERS_MODEL = of('script-voice.md', '### Numbers model (model.mjs → numbers.json)');
const SECOND_CUT = [...of('script-voice.md', '### Second-language cut (asked once in the Brief; Steps 3b and 4)'), ...of('look-build.md', '### Second-language cut: build (Step 6 again, same storyboard)'), ...of('qc.md', '### Second-language cut: QC and delivery')];
const ASSET_PASS =of('review.md', '## Asset pass (before Gate 3, and again before the Step 6 blocking pass)');
const SFX_MUSIC = of('look-build.md', '### Sound effects and music (Step 6, item 7)');
const LEAN_WORKSPACE = of('brief.md', '### Lean workspace (workspace.mjs)');
const SCRIPT_SUB = of('script-voice.md', '## Step 3 — Script → GATE 1', '### Narration craft: one idea, followed on one hearing');
const VOICE_SUB = [...of('script-voice.md', '## Step 4 — Voice + per-word timing → GATE 2'), ...of('voice.md', '## Use (Step 4)', '### Timing, warnings and retakes (Step 4, look up when needed)')];
const READING = {
  0: { name: 'Setup', read: of('brief.md', '## Step 0 — Setup (once)'), refs: [...of('voice.md', '## Setup — VoiceStudio', '## Setup — ElevenLabs (paid, optional)'), ...VD_HERO, ...LEAN_WORKSPACE], sub: [] },
  1: {
    name: 'Brief', sub: [],
    refs: [...of('express.md', '# Express mode (the default)'), ...LOOKS, ...of('looks.md', '### Set dressing, real scale, interior style, condition'), ...of('hero-asset.md', '# Hero asset: from 2D pictures to a 3D model, once'), ...VD_HERO, ...VD_ENERGY, ...VD_RESTRAINT, ...of('camera-motion.md', '## 8. A-roll, B-roll and real camera moves'), ...of('voice.md', '## Setup — VoiceStudio', '### Clone (VoiceStudio, free, local)'), ...of('measure-reference.md', null), ...of('brief.md', '### Series kit (save once, start each video of a channel from it)'), ...LEAN_WORKSPACE, SECOND_CUT[0]],
    read: of('brief.md', '## Step 1 — Brief (always via AskUserQuestion)', '### Call 0 (only when preflight left a choice; skip it otherwise)', '### Call 1', '### Call 2 (its options follow the platform)', '### Call 3 — Voice', '### Call 4 — Extras (the last call; only the questions that apply)', '### Save the brief'),
  },
  2: { name: 'Reference', read: of('measure-reference.md', null), refs: [], sub: [] }, // whole file: its template has fenced "#" lines
  // Steps 3–4 are jobs: the main agent reads only its part (the jobs and their prompts); the writer and the voice job
  // read the step itself with their own `next --step <n> --sub` call (SCRIPT_SUB, VOICE_SUB).
  3: { name: 'Script', read: of('script-voice.md', "### Step 3, the main agent's part: three jobs"), refs: [], sub: [...SCRIPT_SUB, ...of('review.md', '## Sound-off quiz (Step 7, a second fresh subagent beside the reviewer)')] },
  4: { name: 'Voice', read: of('script-voice.md', "### Step 4, the main agent's part: one voice job"), refs: SFX_MUSIC, sub: VOICE_SUB },
  5: {
    name: 'Look', read: of('look-build.md', '## Step 5 — Look, storyboard, style frames → GATE 3'), sub: of('review.md', '## Benchmark review (Gate 3: the style frames against the reference)'),
    refs: [
      ...LOOKS, ...THREEJS,
      ...VD_HERO, ...of('hero-asset.md', '# Hero asset: from 2D pictures to a 3D model, once', '## 1. Read the pictures', '### The user supplies reference images', '## 2. Model it by script', '## 3. Shot-led acceptance: measured first, then judged', '### The hero check, fix rounds, escalation', '## 4. The motion recipe'),
      ...VD_ENERGY, ...VD_RESTRAINT, ...VD_CINEMA,
      ...of('visual-direction.md', '## 7. Composition (read the format from `BRIEF.md`)', '## 8. What the best educational videos do'), ...VD_LAYERS, ...VD_QUANTITY,
      ...of('craft-rules.md', '## 1. Push-in: camera, not scissors', '## 2. Beats: everything lands on a word', '## 3. Motion budget: no dead seconds', '## 4. The mitten rule (stylised characters only)', '## 5. On-screen text'),
      ...of('camera-motion.md',
        '## 1. Angle is a sourcing decision, movement is a timeline decision', '## 2. Camera moves: every perceptible move answers "what changed?"', '## 3. Axis, eyelines, cuts, rhythm', '## 4. Story shape, the loaded frame, faceless staging',
        '## 7. The motion-language line in `SPEC.md`', '## 8. A-roll, B-roll and real camera moves',
        "## 9. The cinematographer's toolbox", '### 9.1 Light — mood and where to look', '### 9.2 Lens — how the world feels', '### 9.3 Movement — beyond §2', '### 9.4 Time', '### 9.5 Editing — beyond §3', '### 9.6 Educational signatures — the scale and the inside'), // §9 whole is over 8 KB
      ...tree('camera-motion.md', '## 10. Emotion drives every parameter: the rulebook'),
      ...ASSET_PASS],
  },
  6: {
    name: 'Build', read: of('look-build.md', '## Step 6 — Build (hand off to /hyperframes)'), sub: [],
    refs: [
      ...of('look-build.md', '### Parallel build: pilot, then shot groups (Step 6, item 2)'), ...SFX_MUSIC, SECOND_CUT[1], ...THREEJS, ...ASSET_PASS, ...NUMBERS_MODEL, ...VD_ENERGY, ...of('visual-direction.md', '## 4. Animation principles, in code numbers'), ...VD_CINEMA, ...of('visual-direction.md', '## 9. Type, light, colour'), ...VD_LAYERS, ...VD_QUANTITY, ...of('craft-rules.md', '## 5. On-screen text'),
      ...tree('camera-motion.md', '## 5. Physical timing'), ...of('camera-motion.md', '## 6. Design in time')],
  },
  7: { name: 'QC', read: of('qc.md', '## Step 7 — Quality check → GATE 4'), refs: of('script-voice.md', '## Step 3 — Script → GATE 1'), sub: [...of('review.md', '# Fresh-eyes review (Step 7)', '## How', '## Sound-off quiz (Step 7, a second fresh subagent beside the reviewer)', '## Model per job', '## Autonomous mode'),...of('visual-direction.md', '## 11. Review rubric (Step 7, on every beat frame)'), ...VD_LAYERS, ...VD_QUANTITY] },
  8: { name: 'Final', read: of('qc.md', '## Step 8 — Final render', '## Step 8 — Hand-off'), refs: [...of('qc.md', '### Post description (POST.md)'), ...SECOND_CUT,...of('look-build.md', '## Step 6 — Build (hand off to /hyperframes)')], sub: [] },
};
// Express (BRIEF.md "mode: express"): Steps 3 and 4 are one reading (Step 3's sections, express.md's, Step 4's) printed
// at Step 3, and Step 4 prints the same on a resume; express.md replaces Steps 5–7, with no Studio look-ups and no
// lessons there (the builders read their own briefs). `lessons`: the steps whose headlines print.
const EXPRESS = {
  3: { read: of('express.md', '# Express mode (the default)', '## Express Steps 3–4 — Script and voice'), refs: [], sub: SCRIPT_SUB, lessons: ['3', '4'] },
  5: { read: of('express.md', '## Express Step 5 — Look in one frame'), refs: [], lessons: [] },
  6: { read: of('express.md', '## Express Step 6 — Build'), refs: [], lessons: [] },
  7: { read: of('express.md', '## Express Step 7 — Render → GATE 4'), refs: [], lessons: [] },
};
EXPRESS[4] = { ...EXPRESS[3], sub: VOICE_SUB }; // one main reading for both; the voice job's own sections
// Model and effort per subagent job, printed by `next` at its step (SKILL.md keeps one line pointing here). top = omit
// `model`, mid = "sonnet", light = "haiku". A job that fails its check escalates one notch (SKILL.md "Escalate").
const TOP = 'top', MID = 'mid', LIGHT = 'light';
const JOBS = {
  studio: {
    3: [['fact research: one job for every strand (≤ 8 searches, 15 fetches)', MID, 'medium'], ['script writer (dalang-builder)', TOP, 'high'], ['Gate 1 read-through', MID, 'medium']],
    4: [['voice job (dalang-builder): sample, take, retakes, respells', TOP, 'medium']],
    5: [['planner: SPEC.md + storyboard.md + review/hero-shots.json', TOP, 'high'], ['hero builder (dalang-builder): model, measure loop on phi (hero-asset.md §3)', TOP, 'high'], ['hero check (dalang-checker): Reality only, hero-measure.md first', TOP, 'high'], ['style-frame check, benchmark, Set / Reality check', TOP, 'high'], ['media screening (find_media candidates, reference boards)', LIGHT, 'low'], ['asset pair check', MID, 'low']],
    6: [['builder: the pilot', TOP, 'high'], ['builder: other groups, assembly', TOP, 'medium'], ['media screening', LIGHT, 'low'], ['asset pair check', MID, 'low']],
    7: [['fresh-eyes review, Set / Reality check', TOP, 'high'], ['sound-off quiz', TOP, 'medium'], ['scopes verdict', TOP, 'medium'], ['builder: each QC fix round', TOP, 'medium'], ['fix check, contact-sheet triage', MID, 'low']],
  },
  express: {
    3: [['fact research: one job, ≤ 2 strands (≤ 6 searches, 8 fetches), + the anatomy strand for the object it explains (≤ 3 searches, 4 fetches)', MID, 'medium'], ['script writer (dalang-builder)', TOP, 'high'], ['Gate 1 read-through', MID, 'medium'], ['voice job (dalang-builder)', TOP, 'medium']],
    5: [['planner (subagent_type dalang-builder)', TOP, 'high']],
    6: [['builder per group, and its one fix round', MID, 'medium'], ['anatomy check vs refs (dalang-checker), beside assemble', MID, 'low']],
  },
};
const JOBS_HEAD = 'Subagents (model · effort; top = omit `model`, mid = "sonnet", light = "haiku"; a failed job escalates one notch):';
const jobLine = ([job, model, effort]) => `${job}: ${model} · ${effort}`;
// Step 1 look-ups that hold only sometimes, left out of `next` when it knows they do not apply (unknown: printed).
const CALL0 = ['### Call 0 (only when preflight left a choice; skip it otherwise)', '## Setup — VoiceStudio', '### Lean workspace (workspace.mjs)'];
const SERIES_KIT = '### Series kit (save once, start each video of a channel from it)';
// preflight.mjs writes whether it left a Call 0 choice; false only from a readable record under 12 hours old.
const preflightChoice = () => {
  try {
    const j = JSON.parse(readFileSync(process.env.DALANG_PREFLIGHT_STATE || path.join(homedir(), '.cache', 'dalang', 'preflight.json'), 'utf8'));
    return Date.now() - Date.parse(j.at) < 12 * 3600e3 && j.choice === false ? false : true;
  } catch { return true; }
};
const seriesKits = () => {
  const root = process.env.DALANG_SERIES_DIR || path.join(homedir(), '.config', 'dalang', 'series');
  try { return readdirSync(root).some(d => existsSync(path.join(root, d, 'SERIES.md'))); } catch (e) { return e.code !== 'ENOENT'; }
};
const applies = (n, e) => n !== 1 ? true : CALL0.includes(e.heading) ? preflightChoice() : e.heading === SERIES_KIT ? seriesKits() : true;
const isFence = l => /^\s*```/.test(l);
const kb = b => (b / KB).toFixed(1);
const shq = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
const label = h => h ? h.replace(/^#+ /, '') : 'whole file';
const indexLine = e => `${e.file} ${e.from},${e.to} ${label(e.heading)} (${kb(e.bytes)} KB)`;
// [file, heading] -> { file, heading, path, lines, from, to, bytes } (1-based, inclusive), or { file, heading, error }.
const locate = (skill, [file, heading, sub]) => {
  const p = path.join(skill, 'references', file);
  if (!existsSync(p)) return { file, heading, error: `references/${file} not found in ${skill}` };
  const lines = readFileSync(p, 'utf8').split('\n'); if (lines.at(-1) === '') lines.pop();
  let from = 1, to = lines.length;
  if (heading) {
    const hits = []; let fence = false;
    lines.forEach((l, i) => { if (isFence(l)) fence = !fence; else if (!fence && l.trimEnd() === heading) hits.push(i); });
    if (hits.length !== 1) return { file, heading, error: hits.length ? `"${heading}" appears ${hits.length} times in ${file}` : `heading "${heading}" not found in ${file}` };
    from = hits[0] + 1; fence = false;
    const end = new RegExp(`^#{1,${sub ? heading.match(/^#+/)[0].length : 6}} `);
    for (let i = hits[0] + 1; i < lines.length; i++) {
      if (isFence(lines[i])) fence = !fence; else if (!fence && end.test(lines[i])) { to = i; break; }
    }
    while (to > from && !lines[to - 1].trim()) to--;
  }
  return { file, heading, ...(sub && { sub: true }), path: p, lines, from, to, bytes: Buffer.byteLength(lines.slice(from - 1, to).join('\n') + '\n') };
};
// Consecutive entries of one file with only blank lines between them are one sed range.
const commandsOf = (found, merge = true) => {
  const groups = [];
  for (const e of found) {
    const g = groups.at(-1);
    if (merge && g && g.path === e.path && e.from > g.to && g.lines.slice(g.to, e.from - 1).every(l => !l.trim())) { g.to = e.to; g.bytes += e.bytes; g.more++; }
    else groups.push({ path: e.path, lines: e.lines, file: e.file, heading: e.heading, from: e.from, to: e.to, bytes: e.bytes, more: 0 });
  }
  return groups.map(g => `sed -n ${shq(`${g.from},${g.to}p`)} ${shq(g.path)}   # ${label(g.heading)}${g.more ? ` (+${g.more})` : ''} (${kb(g.bytes)} KB)`);
};
// Every step's lists from a skill copy: the sections, the lesson headlines tagged for the step and mode, the subagent
// jobs, the commands, the errors. `view(n, mode)` is one step as `next` prints it on that path ('studio' or 'express').
const buildReading = skill => {
  const errors = [], cache = new Map(), lessons = [];
  const find = entry => {
    const k = `${entry[0]}\0${entry[1]}\0${entry[2] ?? ''}`;
    if (!cache.has(k)) {
      const e = locate(skill, entry); cache.set(k, e);
      if (e.error) errors.push(`FAILED: ${e.error}`);
      else if (e.bytes > SECTION_MAX) errors.push(`FAILED: ${e.file} "${label(e.heading)}" is ${kb(e.bytes)} KB, over the 8 KB section budget: split it with a ### heading or trim it`);
    }
    return cache.get(k);
  };
  const lp = path.join(skill, 'references', 'lessons.md');
  if (!existsSync(lp)) errors.push(`FAILED: references/lessons.md not found in ${skill}`);
  else readFileSync(lp, 'utf8').split('\n').forEach((l, i) => {
    if (!/^\s*[-*+] /.test(l)) return; // prose, headings and blank lines are not lessons
    // "- [5,6] **headline** …" holds at those steps in both modes; "- [5,6|studio]" or "|express" in that mode only. A
    // line with no step tag (or an odd one) is an error: it would otherwise be printed nowhere, or guessed to hold everywhere.
    const m = l.match(/^- \[([^\]|]*)(?:\|([^\]]*))?\] (\*\*.+?\*\*)/);
    const tags = m ? m[1].split(',') : [];
    if (!m || !tags.every(t => /^[0-8]$/.test(t)) || (m[2] !== undefined && !['studio', 'express'].includes(m[2]))) return errors.push(`FAILED: lessons.md:${i + 1} is not a readable lesson: it needs a step tag, "- [5,6] **headline** …" (steps 0–8, optionally "|studio" or "|express")`);
    lessons.push({ steps: new Set(tags), mode: m[2] ?? null, h: m[3] });
  });
  const view = (n, mode) => {
    n = String(n);
    const def = READING[n], ex = mode === 'express' ? EXPRESS[n] : null;
    const tiers = ex ? { read: ex.read, refs: ex.refs, sub: ex.sub ?? [] } : def;
    const at = ex ? ex.lessons : [n];
    const ls = lessons.filter(l => at.some(t => l.steps.has(t)) && (!l.mode || l.mode === mode)).map(l => l.h);
    const jobs = (JOBS[mode][ex && n === '4' ? '3' : n] ?? []).map(jobLine);
    const s = { name: def.name, read: [], refs: [], sub: [], lessons: ls, lessonsBytes: ls.reduce((a, h) => a + Buffer.byteLength(`  ${h}\n`), 0), jobs, jobsBytes: jobs.length ? Buffer.byteLength(`${JOBS_HEAD}\n`) + jobs.reduce((a, j) => a + Buffer.byteLength(`  ${j}\n`), 0) : 0, commands: {} };
    const found = {};
    for (const tier of ['read', 'refs', 'sub']) {
      found[tier] = tiers[tier].map(find).filter(e => !e.error);
      s[tier] = found[tier].map(({ file, heading, sub, from, to, bytes }) => ({ file, heading, ...(sub && { sub }), from, to, bytes }));
      s.commands[tier] = commandsOf(found[tier], tier !== 'refs'); // an index line is one section, never a range of several
    }
    Object.defineProperty(s, 'found', { value: found }); // the sections' lines, for printing; never in --json
    s.bytes = sum(s.read) + s.lessonsBytes + s.jobsBytes;
    return s;
  };
  const steps = {}, budget = mode => Object.keys(READING).filter(n => n !== OPTIONAL_STEP && !(mode === 'express' && n === '4')).reduce((a, n) => {
    const s = view(n, mode);
    if (s.lessonsBytes > SECTION_MAX) errors.push(`FAILED: Step ${n} lessons (${mode}) are ${kb(s.lessonsBytes)} KB, over the 8 KB budget: move a tag or trim a headline`);
    return a + s.bytes;
  }, 0);
  for (const n of Object.keys(READING)) steps[n] = view(n, 'studio');
  // Step 2 runs only with a reference video: shown, never in a total. Express reads Step 4 with Step 3: counted once.
  const total = budget('studio'), express = budget('express');
  for (const def of [...Object.values(READING), ...Object.values(EXPRESS)]) (def.sub ?? []).forEach(find); // every subagent section checked, whatever the path
  const sp = path.join(skill, 'SKILL.md'), skillMd = existsSync(sp) ? statSync(sp).size : null;
  if (skillMd === null) errors.push(`FAILED: SKILL.md not found in ${skill}`);
  else if (skillMd > SKILL_MAX) errors.push(`FAILED: SKILL.md is ${kb(skillMd)} KB, over the ${SKILL_MAX / KB} KB budget (loaded every session)`);
  if (total > TOTAL_MAX) errors.push(`FAILED: Studio path (Steps 0–8, Step 2 not counted) reads ${kb(total)} KB, over the ${TOTAL_MAX / KB} KB budget`);
  if (express > EXPRESS_MAX) errors.push(`FAILED: Express path (express.md for Steps 5–7) reads ${kb(express)} KB, over the ${EXPRESS_MAX / KB} KB budget`);
  return { skill, steps, total, express, skillMd, errors, view };
};
const sum = list => list.reduce((a, e) => a + e.bytes, 0);
// Where the video stands, from its files and approvals. A build is "finished" once Step 6 is logged (or QC-REVIEW.md
// exists); a run that logs it differently stays at 6 until `--step 7` says otherwise.
const approved = g => status(g).startsWith('approved');
const gateWord = g => approved(g) ? 'approved' : status(g).startsWith('STALE') ? 'STALE (edited after approval)' : status(g);
const standing = () => {
  const has = f => existsSync(path.join(dir, f));
  if (!has('PRODUCTION.md')) return [0, 'no PRODUCTION.md yet'];
  if (!has('BRIEF.md')) return [1, 'no BRIEF.md yet'];
  if (!approved(1)) return [3, `gate 1 ${gateWord(1)}`];
  if (!approved(2)) return [4, `gate 1 approved, gate 2 ${gateWord(2)}`];
  if (!approved(3)) return [5, `gate 2 approved, gate 3 ${gateWord(3)}`];
  if (approved(4)) return [8, 'gate 4 approved'];
  const log = readFileSync(path.join(dir, 'PRODUCTION.md'), 'utf8');
  // a Step 6 row that `log` wrote with a WARN field (gate 3 not approved then) is not a build from the approved storyboard
  const built = log.split('\n').some(l => /^\d\d:\d\d[–-]\d\d:\d\d \| *(step *)?(6\b|build)/i.test(l) && !/\| WARN [^|]*$/.test(l)) || has('QC-REVIEW.md');
  return has('index.html') && built ? [7, `build logged, gate 4 ${gateWord(4)}`] : [6, 'gate 3 approved, no finished build logged'];
};
// One step as the main agent reads it: the sections (commands, or their text with --print), the mode's lesson
// headlines, the look-up index, each subagent job with its model and effort, the subagent's own sections.
// the copy that runs, on the first step header `next` prints: the agent names it in its first reply (SKILL.md)
let version = cmd !== 'next' ? null : (() => { try { return `DALANG v${JSON.parse(readFileSync(path.join(SKILL, '.claude-plugin', 'plugin.json'), 'utf8')).version}`; } catch { return 'DALANG version unknown (no plugin.json)'; } })();
const show = (r, n, why, asText) => {
  const s = r.view(n, express ? 'express' : 'studio');
  const read = s.found.read.filter(e => applies(n, e)), refs = s.found.refs.filter(e => applies(n, e));
  const out = [`Step ${n} ${s.name}${express ? ' (express)' : ''} — ${why}${version ? ` · ${version}` : ''}`];
  version = null;
  if (n === 3 && !existsSync(path.join(dir, 'script.md'))) out.push('Optional Step 2 (a reference video): add --step 2');
  out.push(`Read now (${kb(sum(read))} KB):`);
  // --print: the sections' text itself, so a step's reading is one call instead of one per section
  if (asText) read.forEach(e => out.push(`\n===== ${e.file}:${e.from}\n${e.lines.slice(e.from - 1, e.to).join('\n')}`));
  else out.push(...commandsOf(read));
  if (s.lessons.length) out.push(`Lessons (one in full: grep -n -i '<word>' ${shq(path.join(r.skill, 'references', 'lessons.md'))}):`, ...s.lessons.map(h => `  ${h}`));
  // the index: file, line range, heading; one command shape for all, so no absolute path is repeated per line
  if (refs.length) out.push(`Look up when needed (only the line the text points to): sed -n '<from>,<to>p' ${shq(path.join(r.skill, 'references'))}/<file>`, ...refs.map(indexLine));
  if (s.jobs.length) out.push(JOBS_HEAD, ...s.jobs.map(j => `  ${j}`));
  // the subagent reads its sections with its own call: the main agent pastes one command, never their text or ranges
  if (s.found.sub.length) out.push(`For the subagent (its prompt runs it; never here, ${kb(sum(s.found.sub))} KB): node ${shq(path.join(r.skill, 'scripts', 'state.mjs'))} next ${shq(path.resolve(dir))} --step ${n} --sub`);
  console.log(out.join('\n'));
};
// --sub: the subagent's own reading of a step, as text (with each file's path, for a look-up of a section it points to).
const showSub = (r, n) => {
  const s = r.view(n, express ? 'express' : 'studio');
  if (!s.found.sub.length) { console.error(`FAILED: Step ${n} has no subagent reading`); process.exit(1); }
  console.log([`Step ${n} ${s.name} — the subagent's reading (${kb(sum(s.found.sub))} KB)`, ...s.found.sub.map(e => `\n===== ${e.path}:${e.from}\n${e.lines.slice(e.from - 1, e.to).join('\n')}`)].join('\n'));
};
const outOfDate = r => r.errors.filter(e => /not found|appears \d+ times|not a readable lesson/.test(e)).forEach(e => console.log(`WARN (skill copy out of date): ${e.replace(/^FAILED: /, '')}`));
// The reading a first approval prints, so the next step costs no `next` turn: Studio the step after the gate; Express
// prints Steps 5 and 6 together after Gate 2 (the planner and the builders start back to back), and nothing after
// Gate 1 (Step 4 was read with Step 3).
const AFTER = { studio: { 1: [4], 2: [5], 3: [6], 4: [8] }, express: { 1: [], 2: [5, 6], 3: [7], 4: [8] } };
// Each gate's deterministic checks, run by `approve` so they cannot be skipped: [label, script, ...args].
// Run from the project folder, so their lines name files as the project does.
const checksOf = g => g === 1 ? [['numbers_lint', 'numbers_lint.mjs', '.'], ['narration_lint', 'narration_lint.mjs', '.'],
  ...readdirSync(dir).filter(f => /^narration\.[a-z]{2,3}(-[A-Za-z]{2,4})?\.txt$/.test(f)).sort().map(f => [`beats_lint ${f}`, 'beats_lint.mjs', 'narration.txt', f])]
  : g === 2 ? [['pad_voice', 'pad_voice.mjs', '.']] : [];

if (cmd === 'approve') {
  const g = Number(gateArg);
  if (!GATES[g]) { console.error('FAILED: gate must be 1–4'); process.exit(1); }
  if (!ready(g)) { console.error(`FAILED: gate ${g} (${GATES[g].name}) has missing files: ${GATES[g].files.filter(f => !existsSync(path.join(dir, f))).join(', ')}`); process.exit(1); }
  const prev = [1, 2, 3].filter(k => k < g).find(k => !status(k).startsWith('approved'));
  if (prev) { console.error(`FAILED: gate ${prev} is ${status(prev)} — approve it first.`); process.exit(1); }
  // The gate's own checks, all of them, so one round shows every problem; a check that cannot read a file (exit 2)
  // refuses too: not checked is never passed.
  const failed = [];
  for (const [name, script, ...a] of checksOf(g)) {
    const c = spawnSync(process.execPath, [path.join(SKILL, 'scripts', script), ...a], { encoding: 'utf8', cwd: dir });
    if (c.status === 0) continue;
    const text = `${c.stdout ?? ''}${c.stderr ?? ''}`.split('\n').map(l => l.trim()).filter(Boolean);
    const lines = text.filter(l => /^(PROBLEM|WARN|FAILED)\b/.test(l)).map(l => l.replace(/^(PROBLEM|WARN)\s*:\s*/, '$1 ').replace(/^FAILED:\s*/, ''));
    failed.push({ name, code: c.status, lines: lines.length ? lines : [text.at(-1) ?? `no output (${c.error?.code ?? `exit ${c.status}`})`] });
  }
  if (failed.length) {
    console.error(`FAILED: gate ${g} (${GATES[g].name}) refused by ${failed.map(f => `${f.name} (exit ${f.code})`).join(', ')}; fix, then approve again:`);
    failed.flatMap(f => f.lines.slice(0, 6).map(l => `  ${f.name}: ${l.slice(0, 220)}`)).slice(0, 12).forEach(l => console.error(l));
    process.exit(1);
  }
  const first = !state.approvals[g];
  // 'sv' formats local time as YYYY-MM-DD HH:MM
  // Gate 3 records the storyboard lint's verdict; it never blocks (a heuristic must not lock a gate) and an
  // unreadable result is "not checked", never OK.
  let lint, bench, sil;
  if (g === 3) {
    bench = express ? { summary: 'none (express)' } : benchmarkOf();
    if (bench.error) { console.error(`FAILED: gate 3 (look) ${bench.error}`); process.exit(1); }
    const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts', 'storyboard_lint.mjs'), dir], { encoding: 'utf8' });
    lint = (r.stdout || '').match(/^\s*Result\s*:\s*(.+)$/m)?.[1].trim() || 'not checked';
    // fidelity exact (the user's pictures): the hero's silhouette IoU per view from hero-measure.json; WARN, never a block
    if (/^\W*fidelity\W*:\W*exact/im.test(existsSync(path.join(dir, 'BRIEF.md')) ? readFileSync(path.join(dir, 'BRIEF.md'), 'utf8') : '')) {
      let refs = [];
      try { refs = JSON.parse(readFileSync(path.join(dir, 'review', 'hero-measure.json'), 'utf8')).refs ?? []; } catch { /* not measured */ }
      const low = refs.filter(v => v.status === 'FAIL');
      sil = !refs.length || refs.some(v => v.status === 'WARN') ? 'not checked'
        : low.length ? `below: ${low.map(v => `${v.name} ${v.iou}`).join(', ')}` : `pass (${refs.length} views)`;
    }
  }
  // Every gate records the token report (tokens.mjs, review/tokens.json); like the lint it never blocks, and an
  // unreadable transcript is "not checked".
  const t = spawnSync(process.execPath, [path.join(SKILL, 'scripts', 'tokens.mjs'), dir], { encoding: 'utf8' });
  const tokens = (t.stdout || '').match(/^Result: (.+)$/m)?.[1].trim() || 'not checked';
  state.approvals[g] = { at: new Date().toLocaleString('sv').slice(0, 16), by, hash: hashOf(g), ...(lint && { lint }), ...(bench && { benchmark: bench.summary }), ...(sil && { silhouette: sil }), tokens, ...(note && { note }) };
  writeFileSync(file, JSON.stringify(state, null, 2));
  console.log([`DONE gate ${g} (${GATES[g].name}) approved by ${by}`, `Tokens: ${tokens}${t.status === 3 ? ' (WARN rows: tokens.mjs)' : ''}`, lint && `Storyboard lint: ${lint}`, bench && `Benchmark: ${bench.summary}`].filter(Boolean).join(' · '));
  if (sil) console.log(sil.startsWith('pass') ? `Silhouette: ${sil}` : `WARN Silhouette: ${sil} (hero-asset.md "The user supplies reference images"): send the user the overlays before style frames`);
  // A first approval moves the film on: print what the next step reads (a re-approval does not: it was read).
  if (first) {
    const nexts = AFTER[express ? 'express' : 'studio'][g];
    if (!nexts.length) console.log(`Next: Step ${g + 3} ${READING[g + 3].name} (express) — read with Step 3, nothing new.`);
    else { const r = buildReading(readSkill); outOfDate(r); nexts.forEach(n => { console.log(''); show(r, n, `next after gate ${g}`, true); }); }
  }
} else if (cmd === 'log') {
  if (!gateArg?.includes('|')) { console.error('FAILED: log needs "<step> | <output> | <problems or ->"'); process.exit(1); }
  // the build starts from an approved storyboard; a log that refused stopped the step clock, so Step 6 is recorded with the gate state
  let warn = '';
  if (/^(step *)?(6\b|build)/i.test(gateArg.split('|')[0].trim())) {
    const why = [];
    if (!existsSync(path.join(dir, 'storyboard.md'))) why.push('storyboard.md is missing');
    if (!approved(3)) why.push(`gate 3 is ${status(3)}`);
    if (why.length) warn = `WARN ${why.join('; ')}`;
  }
  const p = path.join(dir, 'PRODUCTION.md');
  const [day, now] = new Date().toLocaleString('sv').slice(0, 16).split(' ');
  let text = existsSync(p) ? readFileSync(p, 'utf8') : '# PRODUCTION\n';
  if (!text.includes(`## ${day}`)) text = text.trimEnd() + `\n\n## ${day}\n`;
  // Writing "$(date)–$(date)" at the end of a step logged zero minutes; the previous line's end is this step's start.
  const ends = text.slice(text.indexOf(`## ${day}`)).match(/^\d\d:\d\d[–-]\d\d:\d\d/gm) || [];
  const row = `${ends.length ? ends.at(-1).slice(-5) : now}–${now} | ${gateArg}${warn ? ` | ${warn}` : ''}`;
  writeFileSync(p, text.trimEnd() + '\n' + row + '\n');
  console.log(row);
  if (warn) console.error(`WARN: Step 6 logged while ${warn.slice(5)} — write and approve it (Gate 3) before the build continues`);
} else if (cmd === 'metrics') {
  // The run in numbers, for the hand-off: start, end and total from PRODUCTION.md's "HH:MM–HH:MM | step | …" lines (one
  // row per step), the output folder and its final files, and every subagent's job, model, effort, turns and tokens
  // from tokens.mjs. Writes review/metrics.md.
  // No step lines: NOT CHECKED (exit 2), never "0 minutes"; a transcript it cannot read: tokens "not checked".
  const p = path.join(dir, 'PRODUCTION.md'), steps = [];
  let day = null;
  for (const l of (existsSync(p) ? readFileSync(p, 'utf8') : '').split('\n')) {
    const d = l.match(/^## (\d{4}-\d\d-\d\d)/); if (d) day = d[1];
    const m = l.match(/^(\d\d:\d\d)\s*[–-]\s*(\d\d:\d\d)\s*\|\s*([^|]+?)\s*\|/); if (m) steps.push({ day, from: m[1], to: m[2], step: m[3] });
  }
  if (!steps.length) { console.error('NOT CHECKED: no "HH:MM–HH:MM | step | …" lines in PRODUCTION.md (state.mjs log writes them): rerun after logging'); process.exit(2); }
  const at = (d, hm) => new Date(`${d ?? '1970-01-01'}T${hm}:00`).getTime();
  const mins = (a, b) => Math.round(((b - a) / 60000 + 1440 * 2) % 1440);
  // Start and End span the first and last log line by time, not by position in the file
  const first = steps.reduce((a, x) => at(x.day, x.from) < at(a.day, a.from) ? x : a), last = steps.reduce((a, x) => at(x.day, x.to) > at(a.day, a.to) ? x : a);
  const t0 = at(first.day, first.from), t1 = at(last.day, last.to);
  const total = first.day && last.day ? Math.round((t1 - t0) / 60000) : mins(t0, t1);
  const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts', 'tokens.mjs'), dir, '--json'], { encoding: 'utf8' });
  let tk = null; try { tk = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1)); } catch { /* not checked */ }
  const M = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`, hm = iso => iso ? new Date(iso).toLocaleString('sv').slice(11, 16) : '?';
  const made = readdirSync(dir).filter(f => /^final.*\.mp4$|^POST\.md$|^CREDITS\.md$/.test(f)).sort();
  const out = ['## Run metrics', '', `Start ${first.from} · End ${last.to} · Total ${total} min`, '', `Output folder: ${path.resolve(dir)}${made.length ? ` (${made.join(', ')})` : ' (no final file yet)'}`, '', '| Step | Start | End | Min |', '|---|---|---|---|',
    ...steps.map(s => `| ${s.step} | ${s.from} | ${s.to} | ${mins(at(s.day, s.from), at(s.day, s.to))} |`), ''];
  if (!tk) out.push('Tokens: not checked (tokens.mjs could not read the transcripts: rerun)');
  else {
    out.push('| Agent (job) | Model | Effort | Turns | Tokens | Start | End |', '|---|---|---|---|---|---|---|',
      `| main${tk.main.shared ? ' (whole session, shared)' : ''} | ${tk.main.model ?? '?'} | the session's | ${tk.main.turns} | ${M(tk.main.total)} | ${hm(tk.main.start)} | ${hm(tk.main.end)} |`,
      ...[...tk.subagents].sort((a, b) => String(a.start).localeCompare(String(b.start))).map(a => `| ${a.desc} | ${a.model ?? '?'} | ${a.effort} | ${a.turns} | ${M(a.total)} | ${hm(a.start)} | ${hm(a.end)} |`),
      ...(tk.uncounted ? ['', tk.subagents.length ? `Subagents: ${tk.uncounted} more Agent call(s) have no subagent transcript here: not counted` : `Subagents: not counted (${tk.uncounted} Agent call(s) in the main transcript, no subagent transcript found: rerun after the session writes them, or pass --session to tokens.mjs)`] : []),
      '', `**Total tokens: ${tk.uncounted ? 'at least ' : ''}${M(tk.main.total + tk.subagentTotal)}** (main ${M(tk.main.total)}${tk.main.shared ? ', the whole session' : ''} + ${tk.subagents.length ? `${tk.subagents.length} subagents ${M(tk.subagentTotal)}${tk.uncounted ? `, ${tk.uncounted} more not counted` : ''}` : tk.uncounted ? 'subagents not counted' : '0 subagents 0K'}) · main model ${tk.main.model ?? '?'} · effort "inherited" = the session's own`);
  }
  const md = out.join('\n') + '\n';
  try { mkdirSync(path.join(dir, 'review'), { recursive: true }); writeFileSync(path.join(dir, 'review', 'metrics.md'), md); } catch (e) { console.error(`WARN: review/metrics.md not written (${e.code || e.message})`); }
  process.stdout.write(md);
} else if (cmd === 'check') {
  if (!GATES[Number(gateArg)]) { console.error('FAILED: check needs a gate 1–4'); process.exit(1); }
  const s = status(Number(gateArg));
  console.log(`Gate ${gateArg}: ${s}`);
  process.exit(s.startsWith('approved') ? 0 : 3);
} else if (cmd === 'reading') {
  const r = buildReading(readSkill);
  if (json) console.log(JSON.stringify({ steps: r.steps, total: r.total, express: r.express, skillMd: r.skillMd, errors: r.errors }, null, 2));
  else {
    for (const [n, s] of Object.entries(r.steps)) console.log(`Step ${n} ${s.name}: read ${kb(sum(s.read))} + lessons ${kb(s.lessonsBytes)} + jobs ${kb(s.jobsBytes)} · refs ${kb(sum(s.refs))} · subagent ${kb(sum(s.sub))} KB`);
    console.log(`SKILL.md: ${r.skillMd === null ? 'not found' : kb(r.skillMd)} KB of ${SKILL_MAX / KB} KB`);
    console.log(`Studio path (Steps 0–8, Step 2 not counted): ${kb(r.total)} KB of ${TOTAL_MAX / KB} KB`);
    console.log(`Express path (express.md for Steps 5–7): ${kb(r.express)} KB of ${EXPRESS_MAX / KB} KB`);
    console.log(`Optional Step 2 (a reference video), not counted: ${kb(r.steps[OPTIONAL_STEP].bytes)} KB`);
  }
  r.errors.forEach(e => console.error(e));
  process.exit(r.errors.length ? 1 : 0);
} else if (cmd === 'models') {
  for (const [mode, steps] of Object.entries(JOBS)) for (const [n, jobs] of Object.entries(steps)) jobs.forEach(j => console.log(`${mode.padEnd(7)} Step ${n} ${READING[n].name.padEnd(6)} ${jobLine(j)}`));
  console.log('top = omit `model`, mid = "sonnet", light = "haiku"; a job that fails its check goes to a new agent one notch up (SKILL.md).');
} else if (cmd === 'next') {
  const picked = stepArg ?? null;
  if (stepGiven && !/^[0-8]$/.test(picked ?? '')) { console.error('FAILED: --step must be 0–8'); process.exit(1); }
  const [now, why] = picked === null ? standing() : [Number(picked), 'chosen with --step'];
  const r = buildReading(readSkill);
  // an entry that cannot be found means this skill copy is out of date: say so, print the rest
  outOfDate(r);
  if (forSub) showSub(r, now);
  else {
    show(r, now, why, print);
    // a new film: the Brief follows preflight in the next message, so Step 1 comes with Step 0; Express Step 5 brings
    // Step 6 (the planner and the builders start back to back; the voice job's approval printed them in its own context)
    if (picked === null && now === 0) { console.log(''); show(r, 1, 'read with Step 0: the Brief follows preflight', print); }
    if (picked === null && now === 5 && express) { console.log(''); show(r, 6, 'read with Step 5 (express)', print); }
  }
} else {
  for (const g of [1, 2, 3, 4]) console.log(`Gate ${g} ${GATES[g].name.padEnd(7)} ${status(g)}`);
  const next = [1, 2, 3, 4].find(g => !status(g).startsWith('approved'));
  console.log(`${next ? `Next: gate ${next} (${GATES[next].name})` : 'Next: final render (Step 8)'}. Reading list: node ${shq(path.join(SKILL, 'scripts', 'state.mjs'))} next${dir === '.' ? '' : ' ' + shq(dir)}`);
}
