#!/usr/bin/env node
// Where a video stands, from its files plus the approvals recorded in state.json.
// A gate can only be approved after the one before it, and an approval goes stale when
// the files it approved change afterwards.
//
// Usage: node state.mjs [dir]                     -> status (resume from here)
//        node state.mjs approve <1-4> [dir] [--by "user"|"agent"] [--note "..."]
//                                                 -> approve 3 also runs storyboard_lint.mjs and records its result
//        node state.mjs check <1-4> [dir]         -> exit 0 only if that gate is approved and fresh
//        node state.mjs log "<step> | <output> | <problems or ->" [dir]
//                                                 -> appends "HH:MM–HH:MM | …" to PRODUCTION.md; the step
//                                                    starts where the day's last logged line ended; refuses a
//                                                    Step 6 line until storyboard.md exists and gate 3 is approved
//        node state.mjs next [dir] [--step 0-8]   -> where the video stands, and the reading list of that step:
//                                                    the exact sections to read, as ready commands
//        node state.mjs reading [--skill <dir>] [--json]
//                                                 -> checks the reading table: every heading exists, each section
//                                                    is ≤ 8 KB, the main-context reading of Steps 0–8 ≤ 60 KB

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GATES = {
  // `optional`: hashed when present, not required. The model is what the approved numbers come from: an input edited
  // in model.mjs, or a rerun that writes another numbers.json, makes the approval stale even when the words stay.
  1: { name: 'script', files: ['script.md', 'narration.txt'], optional: ['model.mjs', 'numbers.json'] },
  2: { name: 'voice', files: ['audio/beats.json'] },
  3: { name: 'look', files: ['SPEC.md', 'storyboard.md', 'style-frames'] },
  4: { name: 'draft', files: ['index.html'] },
};

const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const by = flag('--by') ?? 'user', note = flag('--note');
const stepGiven = args.includes('--step'), stepArg = flag('--step'), skillArg = flag('--skill');
const json = args.includes('--json'); if (json) args.splice(args.indexOf('--json'), 1);
const sub = ['approve', 'check', 'log', 'next', 'reading'].includes(args[0]) ? args[0] : null;
const [cmd, gateArg, dirArg] = sub === 'next' ? ['next', null, args[1]] : sub === 'reading' ? ['reading', null, null] : sub ? args : [null, null, args[0]];
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
const KB = 1024, SECTION_MAX = 8 * KB, TOTAL_MAX = 60 * KB;
const of = (file, ...headings) => headings.map(h => [file, h]);
const LOOKS = of('looks.md', '# Looks (Step 1 options; Step 5 reads only the chosen row)');
const VD_ENERGY = of('visual-direction.md', '## 3. Energy (the Step 1 "Energy" option)');
const VD_RESTRAINT = of('visual-direction.md', '## 5. Restraint: top-notch, not overdone');
const VD_CINEMA = of('visual-direction.md', '## 6. Cinematography');
const THREEJS = of('looks.md', '### Install the engine into the project', '### Light and material per look', '### Set dressing, real scale, interior style, condition', '### True shapes and true surfaces');
const VD_HERO = of('visual-direction.md', '## 1. The hero is real (the realism ladder)', '### 1.1 Per subject and source: machines, sourcing, stills, people, checks');
const VD_LAYERS = of('visual-direction.md', '## 12. Information layers: headline, cards, labels, captions');
const NUMBERS_MODEL = of('script-voice.md', '### Numbers model (model.mjs → numbers.json)');
const ASSET_PASS =of('review.md', '## Asset pass (before Gate 3, and again before the Step 6 blocking pass)');
const READING = {
  0: { name: 'Setup', read: of('brief.md', '## Step 0 — Setup (once)'), refs: [...of('voice.md', '## Setup — VoiceStudio', '## Setup — ElevenLabs (paid, optional)'), ...VD_HERO], sub: [] },
  1: {
    name: 'Brief', sub: [],
    refs: [...LOOKS, ...VD_HERO, ...VD_ENERGY, ...VD_RESTRAINT, ...of('camera-motion.md', '## 10. A-roll, B-roll and real camera moves'), ...of('voice.md', '## Setup — VoiceStudio', '### Clone (VoiceStudio, free, local)'), ...of('measure-reference.md', null)],
    read: of('brief.md', '## Step 1 — Brief (always via AskUserQuestion)', '### Call 0 (only when preflight left a choice; skip it otherwise)', '### Call 1', '### Call 2 (its options follow the platform)', '### Call 3 — Voice', '### Save the brief'),
  },
  2: { name: 'Reference', read: of('measure-reference.md', null), refs: [], sub: [] }, // whole file: its template has fenced "#" lines
  3: { name: 'Script', read: of('script-voice.md', '## Step 3 — Script → GATE 1'), refs: [...NUMBERS_MODEL, ...of('script-voice.md', '### Arc templates'), ...of('review.md', '## Sound-off quiz (Step 7, a second fresh subagent beside the reviewer)')], sub: [] },
  4: { name: 'Voice', read: [...of('script-voice.md', '## Step 4 — Voice + per-word timing → GATE 2'), ...of('voice.md', '## Use (Step 4)')], refs: of('voice.md', '### Clone (VoiceStudio, free, local)'), sub: [] },
  5: {
    name: 'Look', read: of('look-build.md', '## Step 5 — Look, storyboard, style frames → GATE 3'), sub: [],
    refs: [
      ...LOOKS, ...THREEJS,
      ...VD_HERO,
      ...VD_ENERGY, ...VD_RESTRAINT, ...VD_CINEMA,
      ...of('visual-direction.md', '## 7. Composition (read the format from `BRIEF.md`)', '## 8. What the best educational videos do'), ...VD_LAYERS,
      ...of('craft-rules.md', '## 2. Push-in: camera, not scissors', '## 3. Beats: everything lands on a word', '## 4. Motion budget: no dead seconds', '## 5. The mitten rule (stylised characters only)', '## 6. On-screen text'),
      ...of('camera-motion.md',
        '## 1. Angle is a sourcing decision, movement is a timeline decision', '## 2. Camera moves: every perceptible move answers "what changed?"', '## 3. Axis, eyelines, cuts, rhythm', '## 4. Story shape, the loaded frame, faceless staging',
        '## 8. The motion-language line in `SPEC.md`', '## 10. A-roll, B-roll and real camera moves',
        "## 11. The cinematographer's toolbox", '### 11.1 Light — mood and where to look', '### 11.2 Lens — how the world feels', '### 11.3 Movement — beyond §2', '### 11.4 Time', '### 11.5 Editing — beyond §3', '### 11.6 Educational signatures — the scale and the inside',
        '## 12. Emotion drives every parameter: the rulebook', '### 12.1 Light', '### 12.2 Composition', '### 12.3 Frame ratio inside the canvas', '### 12.4 Finishing order, identical on every shot', '### 12.5 Approach presets'),
      ...ASSET_PASS],
  },
  6: {
    name: 'Build', read: of('look-build.md', '## Step 6 — Build (hand off to /hyperframes)'), sub: [],
    refs: [
      ...THREEJS, ...ASSET_PASS, ...NUMBERS_MODEL, ...VD_ENERGY, ...of('visual-direction.md', '## 4. Animation principles, in code numbers'), ...VD_CINEMA, ...of('visual-direction.md', '## 9. Type, light, colour'), ...VD_LAYERS,...of('craft-rules.md', '## 6. On-screen text'),
      ...of('camera-motion.md', '## 5. Physical timing', '### 5.1 Curves, springs, distance, gravity', '### 5.2 Contact is simulated: the set, colliders, units, mass, solver', '### 5.3 The bake: pre-roll, numbers, hits, sound, blur', "### 5.4 Air, any subject's own law, rest, groups, frames",
        '## 6. Compositing: a cut-out must look shot, not pasted', '## 7. Design in time')],
  },
  7: { name: 'QC', read: of('qc.md', '## Step 7 — Quality check → GATE 4'), refs: of('script-voice.md', '## Step 3 — Script → GATE 1'), sub: [...of('review.md', null), ...of('visual-direction.md', '## 11. Review rubric (Step 7, on every beat frame)'), ...VD_LAYERS] },
  8: { name: 'Final', read: of('qc.md', '## Step 8 — Final render', '## Step 8 — Hand-off'), refs: of('look-build.md', '## Step 6 — Build (hand off to /hyperframes)'), sub: [] },
};
const isFence = l => /^\s*```/.test(l);
const kb = b => (b / KB).toFixed(1);
const shq = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
const label = h => h ? h.replace(/^#+ /, '') : 'whole file';
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
  return groups.map(g => `sed -n ${shq(`${g.from},${g.to}p`)} ${shq(g.path)}   # ${g.file} ${label(g.heading)}${g.more ? ` (+${g.more} more sections)` : ''} (${kb(g.bytes)} KB)`);
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
    total += s.read.reduce((a, e) => a + e.bytes, 0) + s.lessonsBytes;
    steps[n] = s;
  }
  if (total > TOTAL_MAX) errors.push(`FAILED: Steps 0–8 read ${kb(total)} KB in the main context, over the 60 KB budget`);
  return { steps, total, errors };
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
  let lint;
  if (g === 3) {
    const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts', 'storyboard_lint.mjs'), dir], { encoding: 'utf8' });
    lint = (r.stdout || '').match(/^\s*Result\s*:\s*(.+)$/m)?.[1].trim() || 'not checked';
  }
  state.approvals[g] = { at: new Date().toLocaleString('sv').slice(0, 16), by, hash: hashOf(g), ...(lint && { lint }), ...(note && { note }) };
  writeFileSync(file, JSON.stringify(state, null, 2));
  console.log(`DONE gate ${g} (${GATES[g].name}) approved by ${by}`);
  if (lint) console.log(`Storyboard lint: ${lint}`);
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
} else if (cmd === 'check') {
  if (!GATES[Number(gateArg)]) { console.error('FAILED: check needs a gate 1–4'); process.exit(1); }
  const s = status(Number(gateArg));
  console.log(`Gate ${gateArg}: ${s}`);
  process.exit(s.startsWith('approved') ? 0 : 3);
} else if (cmd === 'reading') {
  const r = buildReading(skillArg ? path.resolve(skillArg) : SKILL);
  if (json) console.log(JSON.stringify({ steps: r.steps, total: r.total, errors: r.errors }, null, 2));
  else {
    for (const [n, s] of Object.entries(r.steps)) console.log(`Step ${n} ${s.name.padEnd(9)} read ${kb(sum(s.read))} KB + lessons ${kb(s.lessonsBytes)} KB · refs ${kb(sum(s.refs))} KB · subagent ${kb(sum(s.sub))} KB`);
    console.log(`Total read, Steps 0–8: ${kb(r.total)} KB of ${TOTAL_MAX / KB} KB`);
  }
  r.errors.forEach(e => console.error(e));
  process.exit(r.errors.length ? 1 : 0);
} else if (cmd === 'next') {
  const picked = stepArg ?? null;
  if (stepGiven && !/^[0-8]$/.test(picked ?? '')) { console.error('FAILED: --step must be 0–8'); process.exit(1); }
  const [now, why] = picked === null ? standing() : [Number(picked), 'chosen with --step'];
  const r = buildReading(SKILL), s = r.steps[now];
  console.log(`Step ${now} ${s.name} — ${why}`);
  if (now === 3 && !existsSync(path.join(dir, 'script.md'))) console.log(`Optional Step 2 (a reference video): node ${shq(path.join(SKILL, 'scripts', 'state.mjs'))} next ${shq(dir)} --step 2`);
  // an entry that cannot be found means this skill copy is out of date: say so, print the rest
  r.errors.filter(e => !/over the \d+ KB|budget/.test(e)).forEach(e => console.log(`WARN: ${e.replace(/^FAILED: /, '')} — the skill copy may be out of date; rerun scripts/gate.sh --fast in the skill repo`));
  console.log(`Read now (${kb(sum(s.read))} KB):`);
  s.commands.read.forEach(c => console.log(c));
  if (s.lessons.length) {
    console.log(`\nLessons for Step ${now} (one in full: grep -n -i '<word>' ${shq(path.join(SKILL, 'references', 'lessons.md'))}):`);
    s.lessons.forEach(h => console.log(`  ${h}`));
  }
  if (s.commands.refs.length) { console.log("\nLook up when needed (nothing here is read now; when the step's text points to one, run only that line, never the whole file):"); s.commands.refs.forEach(c => console.log(c)); }
  if (s.commands.sub.length) { console.log('\nFor the subagent (put these commands in its prompt; do not run them here):'); s.commands.sub.forEach(c => console.log(c)); }
} else {
  for (const g of [1, 2, 3, 4]) console.log(`Gate ${g} ${GATES[g].name.padEnd(7)} ${status(g)}`);
  const next = [1, 2, 3, 4].find(g => !status(g).startsWith('approved'));
  console.log(next ? `Next: work toward gate ${next} (${GATES[next].name}).` : 'Next: final render (Step 8).');
  console.log(`Reading list: node ${shq(path.join(SKILL, 'scripts', 'state.mjs'))} next${dir === '.' ? '' : ' ' + shq(dir)}`);
}
