#!/usr/bin/env node
// Where a video stands, from its files plus the approvals recorded in state.json.
// A gate can only be approved after the one before it, and an approval goes stale when
// the files it approved change afterwards.
//
// Usage: node state.mjs [dir]                     -> status (resume from here)
//        node state.mjs approve <1-4> [dir] [--by "user"|"agent"] [--note "..."]
//                                                 -> approve 3 also runs storyboard_lint.mjs and records its result;
//                                                    it refuses without review/benchmark.md, with a row there more
//                                                    than 1 point behind the reference board, or with a verdict older
//                                                    than the style frames; every approval also records the
//                                                    token report (tokens.mjs → review/tokens.json)
//        node state.mjs check <1-4> [dir]         -> exit 0 only if that gate is approved and fresh
//        node state.mjs log "<step> | <output> | <problems or ->" [dir]
//                                                 -> appends "HH:MM–HH:MM | …" to PRODUCTION.md; the step
//                                                    starts where the day's last logged line ended; refuses a
//                                                    Step 6 line until storyboard.md exists and gate 3 is approved
//        node state.mjs next [dir] [--step 0-8] [--print]
//                                                 -> where the video stands, and the reading list of that step:
//                                                    the exact sections to read, as ready commands (--print: their text)
//        node state.mjs metrics [dir]           -> the run in numbers for the hand-off (review/metrics.md): start, end, output folder,
//                                                 total, minutes per step, each subagent's model, effort and tokens
//        node state.mjs reading [--skill <dir>] [--json]
//                                                 -> checks the reading table: every heading exists, each section
//                                                    is ≤ 8 KB, SKILL.md (loaded every session) ≤ 10 KB, the
//                                                    main-context reading of Steps 0–8 ≤ 60 KB on the Studio path and
//                                                    ≤ 45 KB on the Express path (express.md for Steps 5–7); optional
//                                                    Step 2 shown on its own line, in neither total

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
const sub = ['approve', 'check', 'log', 'metrics', 'next', 'reading'].includes(args[0]) ? args[0] : null;
const [cmd, gateArg, dirArg] = sub === 'next' || sub === 'metrics' ? [sub, null, args[1]] : sub === 'reading' ? ['reading', null, null] : sub ? args : [null, null, args[0]];
const dir = dirArg ?? '.';
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
// review/benchmark.md as `| Row | Reference | Style frames | … |`, scores 1–5. A row more than 1 point behind the board
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
  if (!existsSync(p)) return { error: `has no benchmark verdict: ${BENCH} (review.md "Benchmark review": the style frames scored against the reference board)` };
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
  if (behind.length) return { error: `is held by the benchmark: ${behind.map(r => `${r} ${scores[r][1]} vs ${scores[r][0]}`).join(', ')} — more than 1 point behind the reference board; fix the style frames and score them again` };
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
const KB = 1024, SECTION_MAX = 8 * KB, TOTAL_MAX = 60 * KB, EXPRESS_MAX = 45 * KB, SKILL_MAX = 10 * KB, OPTIONAL_STEP = '2';
const of = (file, ...headings) => headings.map(h => [file, h]);
const LOOKS = of('looks.md', '# The looks: isometric-world first, cutaway, blueprint (Step 5 reads this)');
const VD_ENERGY = of('visual-direction.md', '## 3. Energy (the Step 1 "Energy" option)');
const VD_RESTRAINT = of('visual-direction.md', '## 5. Restraint: top-notch, not overdone');
const VD_CINEMA = of('visual-direction.md', '## 6. Cinematography');
const THREEJS = of('looks.md', '### Install the engine into the project', '### The iso look in three.js', '### Set dressing, real scale, interior style, condition', '### True shapes and true surfaces');
const VD_HERO = of('visual-direction.md', '## 1. The hero is true (real reference, drawn or built)', '### 1.1 Per subject: machines, models, people, checks');
const VD_LAYERS = of('visual-direction.md', '## 12. Information layers: headline, cards, labels, captions');
const VD_QUANTITY = of('visual-direction.md', '## 13. Showing a quantity: twin sets, flow arrows, the formula on the set, tags, sound words, gauges');
const NUMBERS_MODEL = of('script-voice.md', '### Numbers model (model.mjs → numbers.json)');
const SECOND_CUT = [...of('script-voice.md', '### Second-language cut (asked once in the Brief; Steps 3b and 4)'), ...of('look-build.md', '### Second-language cut: build (Step 6 again, same storyboard)'), ...of('qc.md', '### Second-language cut: QC and delivery')];
const ASSET_PASS =of('review.md', '## Asset pass (before Gate 3, and again before the Step 6 blocking pass)');
const SFX_MUSIC = of('look-build.md', '### Sound effects and music (Step 6, item 7)');
const LEAN_WORKSPACE = of('brief.md', '### Lean workspace (workspace.mjs)');
const READING = {
  0: { name: 'Setup', read: of('brief.md', '## Step 0 — Setup (once)'), refs: [...of('voice.md', '## Setup — VoiceStudio', '## Setup — ElevenLabs (paid, optional)'), ...VD_HERO, ...LEAN_WORKSPACE], sub: [] },
  1: {
    name: 'Brief', sub: [],
    refs: [...of('express.md', '# Express mode (the default)'), ...LOOKS, ...of('looks.md', '### Set dressing, real scale, interior style, condition'), ...of('hero-asset.md', '# Hero asset: from 2D pictures to a 3D model, once'), ...VD_HERO, ...VD_ENERGY, ...VD_RESTRAINT, ...of('camera-motion.md', '## 8. A-roll, B-roll and real camera moves'), ...of('voice.md', '## Setup — VoiceStudio', '### Clone (VoiceStudio, free, local)'), ...of('measure-reference.md', null), ...of('brief.md', '### Series kit (save once, start each video of a channel from it)'), ...LEAN_WORKSPACE, SECOND_CUT[0]],
    read: of('brief.md', '## Step 1 — Brief (always via AskUserQuestion)', '### Call 0 (only when preflight left a choice; skip it otherwise)', '### Call 1', '### Call 2 (its options follow the platform)', '### Call 3 — Voice', '### Call 4 — Extras (the last call; only the questions that apply)', '### Save the brief'),
  },
  2: { name: 'Reference', read: of('measure-reference.md', null), refs: [], sub: [] }, // whole file: its template has fenced "#" lines
  3: { name: 'Script', read: of('script-voice.md', '## Step 3 — Script → GATE 1'), refs: [...of('script-voice.md', '### Narration craft: one idea, followed on one hearing'), ...NUMBERS_MODEL, ...of('script-voice.md', '### Arc templates'), ...of('review.md', '## Sound-off quiz (Step 7, a second fresh subagent beside the reviewer)')], sub: [] },
  4: { name: 'Voice', read: [...of('script-voice.md', '## Step 4 — Voice + per-word timing → GATE 2'), ...of('voice.md', '## Use (Step 4)')], refs: [...of('script-voice.md', '### Voice sources and outputs (Step 4, look up when needed)'), ...of('voice.md', '### Clone (VoiceStudio, free, local)', '### Timing, warnings and retakes (Step 4, look up when needed)'), ...SFX_MUSIC], sub: [] },
  5: {
    name: 'Look', read: of('look-build.md', '## Step 5 — Look, storyboard, style frames → GATE 3'), sub: of('review.md', '## Benchmark review (Gate 3: the style frames against a reference board)'),
    refs: [
      ...LOOKS, ...THREEJS,
      ...VD_HERO, ...of('hero-asset.md', null),
      ...VD_ENERGY, ...VD_RESTRAINT, ...VD_CINEMA,
      ...of('visual-direction.md', '## 7. Composition (read the format from `BRIEF.md`)', '## 8. What the best educational videos do'), ...VD_LAYERS, ...VD_QUANTITY,
      ...of('craft-rules.md', '## 1. Push-in: camera, not scissors', '## 2. Beats: everything lands on a word', '## 3. Motion budget: no dead seconds', '## 4. The mitten rule (stylised characters only)', '## 5. On-screen text'),
      ...of('camera-motion.md',
        '## 1. Angle is a sourcing decision, movement is a timeline decision', '## 2. Camera moves: every perceptible move answers "what changed?"', '## 3. Axis, eyelines, cuts, rhythm', '## 4. Story shape, the loaded frame, faceless staging',
        '## 7. The motion-language line in `SPEC.md`', '## 8. A-roll, B-roll and real camera moves',
        "## 9. The cinematographer's toolbox", '### 9.1 Light — mood and where to look', '### 9.2 Lens — how the world feels', '### 9.3 Movement — beyond §2', '### 9.4 Time', '### 9.5 Editing — beyond §3', '### 9.6 Educational signatures — the scale and the inside',
        '## 10. Emotion drives every parameter: the rulebook', '### 10.1 Light', '### 10.2 Composition', '### 10.3 Frame ratio inside the canvas', '### 10.4 Finishing order, identical on every shot', '### 10.5 Approach presets'),
      ...ASSET_PASS],
  },
  6: {
    name: 'Build', read: of('look-build.md', '## Step 6 — Build (hand off to /hyperframes)'), sub: [],
    refs: [
      ...of('look-build.md', '### Parallel build: pilot, then shot groups (Step 6, item 2)'), ...SFX_MUSIC, SECOND_CUT[1], ...THREEJS, ...ASSET_PASS, ...NUMBERS_MODEL, ...VD_ENERGY, ...of('visual-direction.md', '## 4. Animation principles, in code numbers'), ...VD_CINEMA, ...of('visual-direction.md', '## 9. Type, light, colour'), ...VD_LAYERS, ...VD_QUANTITY, ...of('craft-rules.md', '## 5. On-screen text'),
      ...of('camera-motion.md', '## 5. Physical timing', '### 5.1 Curves, springs, distance, gravity', '### 5.2 Contact is caused: units, mass, mechanisms', '### 5.3 Hits, sound, blur', "### 5.4 Air, any subject's own law, rest, groups, frames",
        '## 6. Design in time')],
  },
  7: { name: 'QC', read: of('qc.md', '## Step 7 — Quality check → GATE 4'), refs: of('script-voice.md', '## Step 3 — Script → GATE 1'), sub: [...of('review.md', '# Fresh-eyes review (Step 7)', '## How', '## Sound-off quiz (Step 7, a second fresh subagent beside the reviewer)', '## Model per job', '## Autonomous mode'),...of('visual-direction.md', '## 11. Review rubric (Step 7, on every beat frame)'), ...VD_LAYERS, ...VD_QUANTITY] },
  8: { name: 'Final', read: of('qc.md', '## Step 8 — Final render', '## Step 8 — Hand-off'), refs: [...of('qc.md', '### Post description (POST.md)'), ...SECOND_CUT,...of('look-build.md', '## Step 6 — Build (hand off to /hyperframes)')], sub: [] },
};
const EXPRESS = {
  3: of('express.md', '# Express mode (the default)', '## Express Steps 3–4 — Script and voice'),   // read with Step 3's own sections
  5: of('express.md', '## Express Step 5 — Look in one frame'),
  6: of('express.md', '## Express Step 6 — Build'),
  7: of('express.md', '## Express Step 7 — Render → GATE 4'),
};
const isFence = l => /^\s*```/.test(l);
const kb = b => (b / KB).toFixed(1);
const shq = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
const label = h => h ? h.replace(/^#+ /, '') : 'whole file';
const indexLine = e => `${e.file} ${e.from},${e.to} ${label(e.heading)} (${kb(e.bytes)} KB)`;
// [file, heading] -> { file, heading, path, lines, from, to, bytes } (1-based, inclusive), or { file, heading, error }.
const locate = (skill, [file, heading]) => {
  const p = path.join(skill, 'references', file);
  if (!existsSync(p)) return { file, heading, error: `references/${file} not found in ${skill}` };
  const lines = readFileSync(p, 'utf8').split('\n'); if (lines.at(-1) === '') lines.pop();
  let from = 1, to = lines.length;
  if (heading) {
    const hits = []; let fence = false;
    lines.forEach((l, i) => { if (isFence(l)) fence = !fence; else if (!fence && l.trimEnd() === heading) hits.push(i); });
    if (hits.length !== 1) return { file, heading, error: hits.length ? `"${heading}" appears ${hits.length} times in ${file}` : `heading "${heading}" not found in ${file}` };
    from = hits[0] + 1; fence = false;
    for (let i = hits[0] + 1; i < lines.length; i++) {
      if (isFence(lines[i])) fence = !fence; else if (!fence && /^#{1,6} /.test(lines[i])) { to = i; break; }
    }
    while (to > from && !lines[to - 1].trim()) to--;
  }
  return { file, heading, path: p, lines, from, to, bytes: Buffer.byteLength(lines.slice(from - 1, to).join('\n') + '\n') };
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
// Every step's lists from a skill copy: the sections, the lesson headlines tagged for the step, the commands, the errors.
const buildReading = skill => {
  const errors = [], steps = {};
  const lessons = Object.fromEntries(Object.keys(READING).map(n => [n, []]));
  const lp = path.join(skill, 'references', 'lessons.md');
  if (!existsSync(lp)) errors.push(`FAILED: references/lessons.md not found in ${skill}`);
  else readFileSync(lp, 'utf8').split('\n').forEach((l, i) => {
    if (!/^\s*[-*+] /.test(l)) return; // prose, headings and blank lines are not lessons
    // "- [5,6] **headline** …" holds at those steps. A line with no step tag (or an odd one) is an error: it would
    // otherwise be printed nowhere, or guessed to hold everywhere.
    const m = l.match(/^- \[([^\]]*)\] (\*\*.+?\*\*)/);
    const tags = m ? m[1].split(',') : [];
    if (!m || !tags.every(t => /^[0-8]$/.test(t))) return errors.push(`FAILED: lessons.md:${i + 1} is not a readable lesson: it needs a step tag, "- [5,6] **headline** …", with steps 0–8`);
    new Set(tags).forEach(t => lessons[t].push(m[2]));
  });
  let total = 0;
  for (const [n, def] of Object.entries(READING)) {
    const s = { name: def.name, read: [], refs: [], sub: [], lessons: lessons[n], lessonsBytes: lessons[n].reduce((a, h) => a + Buffer.byteLength(`  ${h}\n`), 0), commands: {} };
    const found = {};
    for (const tier of ['read', 'refs', 'sub']) {
      found[tier] = [];
      for (const entry of def[tier]) {
        const e = locate(skill, entry);
        if (e.error) { errors.push(`FAILED: ${e.error}`); continue; }
        found[tier].push(e);
        s[tier].push({ file: e.file, heading: e.heading, from: e.from, to: e.to, bytes: e.bytes });
        if (e.bytes > SECTION_MAX) errors.push(`FAILED: ${e.file} "${label(e.heading)}" is ${kb(e.bytes)} KB, over the 8 KB section budget: split it with a ### heading or trim it`);
      }
      s.commands[tier] = commandsOf(found[tier], tier !== 'refs'); // an index line is one section, never a range of several
    }
    if (s.lessonsBytes > SECTION_MAX) errors.push(`FAILED: Step ${n} lessons are ${kb(s.lessonsBytes)} KB, over the 8 KB budget: move a tag or trim a headline`);
    s.bytes = s.read.reduce((a, e) => a + e.bytes, 0) + s.lessonsBytes;
    if (n !== OPTIONAL_STEP) total += s.bytes; // Step 2 runs only with a reference video: shown, never in the total
    steps[n] = s;
  }
  // Express path: express.md replaces Steps 5–7 (no lessons there, as `next` prints them) and joins Step 3's own reading.
  const exBytes = {};
  for (const [n, entries] of Object.entries(EXPRESS)) {
    exBytes[n] = 0;
    for (const entry of entries) { const e = locate(skill, entry); if (e.error) errors.push(`FAILED: ${e.error}`); else { exBytes[n] += e.bytes; if (e.bytes > SECTION_MAX) errors.push(`FAILED: express.md "${label(e.heading)}" is over the 8 KB section budget`); } }
  }
  const express = Object.entries(steps).filter(([n]) => n !== OPTIONAL_STEP).reduce((a, [n, s]) => a + (['5', '6', '7'].includes(n) ? 0 : s.bytes) + (exBytes[n] ?? 0), 0);
  const sp = path.join(skill, 'SKILL.md'), skillMd = existsSync(sp) ? statSync(sp).size : null;
  if (skillMd === null) errors.push(`FAILED: SKILL.md not found in ${skill}`);
  else if (skillMd > SKILL_MAX) errors.push(`FAILED: SKILL.md is ${kb(skillMd)} KB, over the 10 KB budget (loaded every session)`);
  if (total > TOTAL_MAX) errors.push(`FAILED: Studio path (Steps 0–8, Step 2 not counted) reads ${kb(total)} KB, over the 60 KB budget`);
  if (express > EXPRESS_MAX) errors.push(`FAILED: Express path (express.md for Steps 5–7) reads ${kb(express)} KB, over the 45 KB budget`);
  return { steps, total, express, skillMd, errors };
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
  const built = /^\d\d:\d\d[–-]\d\d:\d\d \| *(step *)?(6\b|build)/im.test(log) || has('QC-REVIEW.md');
  return has('index.html') && built ? [7, `build logged, gate 4 ${gateWord(4)}`] : [6, 'gate 3 approved, no finished build logged'];
};

if (cmd === 'approve') {
  const g = Number(gateArg);
  if (!GATES[g]) { console.error('FAILED: gate must be 1–4'); process.exit(1); }
  if (!ready(g)) { console.error(`FAILED: gate ${g} (${GATES[g].name}) has missing files: ${GATES[g].files.filter(f => !existsSync(path.join(dir, f))).join(', ')}`); process.exit(1); }
  const prev = [1, 2, 3].filter(k => k < g).find(k => !status(k).startsWith('approved'));
  if (prev) { console.error(`FAILED: gate ${prev} is ${status(prev)} — approve it first.`); process.exit(1); }
  // 'sv' formats local time as YYYY-MM-DD HH:MM
  // Gate 3 records the storyboard lint's verdict; it never blocks (a heuristic must not lock a gate) and an
  // unreadable result is "not checked", never OK.
  let lint, bench;
  if (g === 3) {
    bench = express ? { summary: 'none (express)' } : benchmarkOf();
    if (bench.error) { console.error(`FAILED: gate 3 (look) ${bench.error}`); process.exit(1); }
    const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts', 'storyboard_lint.mjs'), dir], { encoding: 'utf8' });
    lint = (r.stdout || '').match(/^\s*Result\s*:\s*(.+)$/m)?.[1].trim() || 'not checked';
  }
  // Every gate records the token report (tokens.mjs, review/tokens.json); like the lint it never blocks, and an
  // unreadable transcript is "not checked".
  const t = spawnSync(process.execPath, [path.join(SKILL, 'scripts', 'tokens.mjs'), dir], { encoding: 'utf8' });
  const tokens = (t.stdout || '').match(/^Result: (.+)$/m)?.[1].trim() || 'not checked';
  state.approvals[g] = { at: new Date().toLocaleString('sv').slice(0, 16), by, hash: hashOf(g), ...(lint && { lint }), ...(bench && { benchmark: bench.summary }), tokens, ...(note && { note }) };
  writeFileSync(file, JSON.stringify(state, null, 2));
  console.log([`DONE gate ${g} (${GATES[g].name}) approved by ${by}`, `Tokens: ${tokens}${t.status === 3 ? ' (WARN rows: tokens.mjs)' : ''}`, lint && `Storyboard lint: ${lint}`, bench && `Benchmark: ${bench.summary}`].filter(Boolean).join(' · '));
} else if (cmd === 'log') {
  if (!gateArg?.includes('|')) { console.error('FAILED: log needs "<step> | <output> | <problems or ->"'); process.exit(1); }
  // the build starts from an approved storyboard: Step 6 cannot be logged without it
  if (/^(step *)?(6\b|build)/i.test(gateArg.split('|')[0].trim())) {
    if (!existsSync(path.join(dir, 'storyboard.md'))) { console.error('FAILED: Step 6 (build) cannot be logged: storyboard.md is missing — write it before the build (Step 5)'); process.exit(1); }
    if (!approved(3)) { console.error(`FAILED: Step 6 (build) cannot be logged: gate 3 is ${status(3)} — approve it first`); process.exit(1); }
  }
  const p = path.join(dir, 'PRODUCTION.md');
  const [day, now] = new Date().toLocaleString('sv').slice(0, 16).split(' ');
  let text = existsSync(p) ? readFileSync(p, 'utf8') : '# PRODUCTION\n';
  if (!text.includes(`## ${day}`)) text = text.trimEnd() + `\n\n## ${day}\n`;
  // Writing "$(date)–$(date)" at the end of a step logged zero minutes; the previous line's end is this step's start.
  const ends = text.slice(text.indexOf(`## ${day}`)).match(/^\d\d:\d\d[–-]\d\d:\d\d/gm) || [];
  const row = `${ends.length ? ends.at(-1).slice(-5) : now}–${now} | ${gateArg}`;
  writeFileSync(p, text.trimEnd() + '\n' + row + '\n');
  console.log(row);
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
  const t0 = at(steps[0].day, steps[0].from), t1 = at(steps.at(-1).day, steps.at(-1).to);
  const total = steps[0].day && steps.at(-1).day ? Math.round((t1 - t0) / 60000) : mins(t0, t1);
  const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts', 'tokens.mjs'), dir, '--json'], { encoding: 'utf8' });
  let tk = null; try { tk = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1)); } catch { /* not checked */ }
  const M = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`, hm = iso => iso ? new Date(iso).toLocaleString('sv').slice(11, 16) : '?';
  const made = readdirSync(dir).filter(f => /^final.*\.mp4$|^POST\.md$|^CREDITS\.md$/.test(f)).sort();
  const out = ['## Run metrics', '', `Start ${steps[0].from} · End ${steps.at(-1).to} · Total ${total} min`, '', `Output folder: ${path.resolve(dir)}${made.length ? ` (${made.join(', ')})` : ' (no final file yet)'}`, '', '| Step | Start | End | Min |', '|---|---|---|---|',
    ...steps.map(s => `| ${s.step} | ${s.from} | ${s.to} | ${mins(at(s.day, s.from), at(s.day, s.to))} |`), ''];
  if (!tk) out.push('Tokens: not checked (tokens.mjs could not read the transcripts: rerun)');
  else {
    out.push('| Agent (job) | Model | Effort | Turns | Tokens | Start | End |', '|---|---|---|---|---|---|---|',
      `| main${tk.main.shared ? ' (whole session, shared)' : ''} | ${tk.main.model ?? '?'} | session | ${tk.main.turns} | ${M(tk.main.total)} | ${hm(tk.main.start)} | ${hm(tk.main.end)} |`,
      ...[...tk.subagents].sort((a, b) => String(a.start).localeCompare(String(b.start))).map(a => `| ${a.desc} | ${a.model ?? '?'} | ${a.effort} | ${a.turns} | ${M(a.total)} | ${hm(a.start)} | ${hm(a.end)} |`),
      '', `Subagents: ${M(tk.subagentTotal)} tokens in ${tk.subagents.length} agents`);
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
  const r = buildReading(skillArg ? path.resolve(skillArg) : SKILL);
  if (json) console.log(JSON.stringify({ steps: r.steps, total: r.total, express: r.express, skillMd: r.skillMd, errors: r.errors }, null, 2));
  else {
    for (const [n, s] of Object.entries(r.steps)) console.log(`Step ${n} ${s.name}: read ${kb(sum(s.read))} + lessons ${kb(s.lessonsBytes)} · refs ${kb(sum(s.refs))} · subagent ${kb(sum(s.sub))} KB`);
    console.log(`SKILL.md: ${r.skillMd === null ? 'not found' : kb(r.skillMd)} KB of ${SKILL_MAX / KB} KB`);
    console.log(`Studio path (Steps 0–8, Step 2 not counted): ${kb(r.total)} KB of ${TOTAL_MAX / KB} KB`);
    console.log(`Express path (express.md for Steps 5–7): ${kb(r.express)} KB of ${EXPRESS_MAX / KB} KB`);
    console.log(`Optional Step 2 (a reference video), not counted: ${kb(r.steps[OPTIONAL_STEP].bytes)} KB`);
  }
  r.errors.forEach(e => console.error(e));
  process.exit(r.errors.length ? 1 : 0);
} else if (cmd === 'next') {
  const picked = stepArg ?? null;
  if (stepGiven && !/^[0-8]$/.test(picked ?? '')) { console.error('FAILED: --step must be 0–8'); process.exit(1); }
  const [now, why] = picked === null ? standing() : [Number(picked), 'chosen with --step'];
  const r = buildReading(SKILL), s = r.steps[now];
  if (express && EXPRESS[now]) {   // Express: express.md replaces Steps 5–7 (no Studio look-ups) and joins Step 3's own sections
    const found = [...(now === 3 ? s.read.map(e => locate(SKILL, [e.file, e.heading])) : []), ...EXPRESS[now].map(e => locate(SKILL, e))].filter(e => !e.error);
    Object.assign(s, { read: found, lessons: now === 3 ? s.lessons : [], refs: now === 3 ? s.refs : [], sub: [] }, { commands: { read: commandsOf(found), refs: now === 3 ? s.commands.refs : [], sub: [] } });
  }
  console.log(`Step ${now} ${s.name}${express ? ' (express)' : ''} — ${why}`);
  if (now === 3 && !existsSync(path.join(dir, 'script.md'))) console.log('Optional Step 2 (a reference video): add --step 2');
  // an entry that cannot be found means this skill copy is out of date: say so, print the rest
  r.errors.filter(e => /not found|appears \d+ times|not a readable lesson/.test(e)).forEach(e => console.log(`WARN (skill copy out of date): ${e.replace(/^FAILED: /, '')}`));
  console.log(`Read now (${kb(sum(s.read))} KB):`);
  // --print: the sections' text itself, so a step's reading is one call instead of one per section
  if (print) s.read.map(e => e.lines ? e : locate(SKILL, [e.file, e.heading])).filter(e => !e.error)
    .forEach(e => console.log(`\n===== ${e.file}:${e.from}\n${e.lines.slice(e.from - 1, e.to).join('\n')}`));
  else s.commands.read.forEach(c => console.log(c));
  if (s.lessons.length) {
    console.log(`Lessons (one in full: grep -n -i '<word>' ${shq(path.join(SKILL, 'references', 'lessons.md'))}):`);
    s.lessons.forEach(h => console.log(`  ${h}`));
  }
  // the index: file, line range, heading; one command shape for all, so no absolute path is repeated per line
  if (s.refs.length) { console.log(`Look up when needed (only the line the text points to): sed -n '<from>,<to>p' ${shq(path.join(SKILL, 'references'))}/<file>`); s.refs.forEach(e => console.log(indexLine(e))); }
  if (s.commands.sub.length) { console.log('For the subagent (paste into its prompt; do not run here):'); s.commands.sub.forEach(c => console.log(c)); }
} else {
  for (const g of [1, 2, 3, 4]) console.log(`Gate ${g} ${GATES[g].name.padEnd(7)} ${status(g)}`);
  const next = [1, 2, 3, 4].find(g => !status(g).startsWith('approved'));
  console.log(`${next ? `Next: gate ${next} (${GATES[next].name})` : 'Next: final render (Step 8)'}. Reading list: node ${shq(path.join(SKILL, 'scripts', 'state.mjs'))} next${dir === '.' ? '' : ' ' + shq(dir)}`);
}
