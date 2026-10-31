#!/usr/bin/env node
// Storyboard lint (before Gate 3): a slideshow is caught in the storyboard, where a fix costs a line, not in the
// draft render. Reads the shot table of storyboard.md (the table with a "Subject action" column; other tables are
// ignored) and flags, each with `storyboard.md:LINE row N`: an empty "Subject action" or "Camera" cell; 3 or more
// consecutive rows with the same size and angle; the share of rows whose focal point is text only, over the
// energy's limit; an average shot length over the energy's limit; a hard cut that keeps the view (two shots cut together
// at the same angle, or under 60° apart: a jump cut that shows nothing new). Limits = references/visual-direction.md §3.
// The text-only check is a heuristic on the "What we see" focal clause and the Subject action's source words.
// Energy: --energy calm|balanced|punchy|hype, else the Energy line of BRIEF.md, else balanced (INFO).
// object-studio (BRIEF look): a row after the hook under 2 s, and SPEC.md's ## MODEL section with Input: and Check: lines.
// Usage: node storyboard_lint.mjs [project] [--energy calm|balanced|punchy|hype]   (default: .)
// Exit 1 on a problem, 2 when the storyboard cannot be read or a check cannot run (rerun / fix), 0 when clean.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const ei = args.indexOf('--energy');
const energyArg = ei >= 0 ? args.splice(ei, 2)[1] : null;
const dir = path.resolve(args.find(a => !a.startsWith('--')) ?? '.');
const problems = [], warns = [], infos = [];
const LIMITS = { calm: { avg: 5, text: 0.10 }, balanced: { avg: 3, text: 0.15 }, punchy: { avg: 1.8, text: 0.25 }, hype: { avg: 1.0, text: 0.25 } };
const read = rel => { // text, null when absent, undefined when it could not be read (never "absent")
  try { return readFileSync(path.join(dir, rel), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return null; warns.push(`${rel}: cannot read (${e.code}) — rerun`); return undefined; }
};
const done = () => {
  console.log(`Storyboard lint (${energy}): ${rows.length} rows`);
  for (const p of problems) console.log(`  PROBLEM  : ${p}`);
  for (const w of warns) console.log(`  WARN     : ${w}`);
  for (const n of infos) console.log(`  INFO     : ${n}`);
  console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : warns.length ? `  Result   : ${warns.length} warning(s) — rerun or fix, then lint again` : '  Result   : OK');
  process.exit(problems.length ? 1 : warns.length ? 2 : 0);
};

let energy = 'balanced';
const rows = [];
if (energyArg && !LIMITS[energyArg]) warns.push(`--energy ${energyArg}: use calm, balanced, punchy or hype`);
else if (energyArg) energy = energyArg;
else {
  const brief = read('BRIEF.md');
  const l = (brief ?? '').split('\n').find(x => /energy/i.test(x) && /calm|modern|balanced|punchy|hype/i.test(x));
  const m = l && l.match(/calm|punchy|hype|modern|balanced/i);
  if (m) energy = /calm|punchy|hype/i.test(m[0]) ? m[0].toLowerCase() : 'balanced';
  else if (brief !== undefined) infos.push('energy not found in BRIEF.md, assuming Modern balanced');
}
const lim = LIMITS[energy];

const sb = read('storyboard.md');
if (sb === null) warns.push('storyboard.md not found: write it before Gate 3');
if (sb == null) done();

const cells = l => l.trim().split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim());
const L = sb.replace(/\r/g, '').split('\n');
const hi = L.findIndex(l => l.trim().startsWith('|') && /subject action/i.test(l));
if (hi < 0) { warns.push("no shot table (a header with 'Subject action')"); done(); }
const head = cells(L[hi]);
const col = re => head.findIndex(h => re.test(h));
const C = { size: col(/size/i), see: col(/what we see|focal/i), cam: col(/^camera/i), act: col(/subject action/i), time: col(/^time/i), out: col(/^transition/i) };
for (let i = hi + 2; i < L.length && L[i].trim().startsWith('|'); i++) {
  const c = cells(L[i]);
  rows.push({ line: i + 1, n: /^\d+$/.test(c[0] ?? '') ? c[0] : String(rows.length + 1), c });
}
const at = r => `storyboard.md:${r.line} row ${r.n}`;
const EMPTY = /^(?:[-–—]+|n\/a|none|tbd|todo|\?+)?$/i;
const empty = s => EMPTY.test((s ?? '').replace(/`/g, '').trim());
const need = (k, name, what) => { if (C[k] < 0) { warns.push(`no ${name} column: ${what} skipped`); return false; } return true; };

// (a) empty cells
for (const [k, name, hint] of [['act', 'Subject action', 'name the real action and its source'], ['cam', 'Camera', 'name the move and what changed']])
  if (need(k, name, 'empty-cell check')) for (const r of rows) if (empty(r.c[C[k]])) problems.push(`${at(r)}: "${name}" is empty — ${hint}`);

// (b) 3+ rows in a row at the same size and angle
if (need('size', 'Size', 'repeated-shot check')) {
  const key = r => { const s = (r.c[C.size] ?? '').toLowerCase().replace(/\s+/g, ' ').trim(); return s.includes('·') ? s.split('·').slice(0, 2).map(x => x.trim()).join(' · ') : s.replace(/\s*\d+ ?mm$/, ''); };
  for (let i = 0; i < rows.length;) {
    const k = key(rows[i]); let j = i + 1;
    while (k && j < rows.length && key(rows[j]) === k) j++;
    if (k && j - i >= 3) problems.push(`storyboard.md:${rows[i].line} rows ${rows[i].n}–${rows[j - 1].n}: ${j - i} shots in a row at "${k}" — change the size or the angle`);
    i = Math.max(j, i + 1);
  }
}

// (e) a hard cut changes the view: the Size · angle · lens cell's angle is the subject's view (front … back, 45° steps)
const VIEWS = [[/back.?right|rear.?right/, 135], [/back.?left|rear.?left/, 225], [/front.?right|3\/4 right|three.?quarter right/, 45], [/front.?left|3\/4 left|three.?quarter left/, 315],
  [/\bback\b|\brear\b|opposite/, 180], [/\bfront\b/, 0], [/\bright\b/, 90], [/\bleft\b/, 270], [/\bside\b/, 90]];
const angleOf = r => (r.c[C.size] ?? '').toLowerCase().split('·')[1]?.replace(/`/g, '').trim() ?? '';
const deg = a => VIEWS.find(([re]) => re.test(a))?.[1];
if (C.size >= 0 && C.out >= 0) for (let i = 0; i + 1 < rows.length; i++) {
  const t = rows[i].c[C.out] ?? '';
  if (!/\bcut\b/i.test(t) || /\bmatch cut\b|\bnew (subject|set|scene|object)\b/i.test(t)) continue; // a match cut or a cut to another subject is not a jump
  const a = angleOf(rows[i]), b = angleOf(rows[i + 1]), da = deg(a), db = deg(b);
  const turn = da !== undefined && db !== undefined ? Math.min(Math.abs(da - db), 360 - Math.abs(da - db)) : null;
  if (!a || !b) continue;
  if (a === b || (turn !== null && turn < 60)) problems.push(`${at(rows[i])} → ${rows[i + 1].n}: a hard cut keeps the view (${a} → ${b}${turn !== null ? `, ${turn}°` : ''}): cut to a new view (front, a side, the back: 60° or more) or drop the cut and continue the move; a cut to another subject says "new subject"`);
}

// (f) closer = orbit-in: a camera cell that closes in on the subject names the orbit (a straight push is the dead zoom)
if (C.cam >= 0) for (const r of rows) {
  const t = (r.c[C.cam] ?? '').toLowerCase().replace(/`/g, '');
  if (!/\b(push|zoom|dive|dolly in|punch in|move in|close in|closer|tighten)/.test(t) || /zoom out|pull|dolly ?zoom|crash/.test(t)) continue;
  if (/orbit|arc\b|spiral|sweep|swing|circl|turn|rotat|whip/.test(t)) continue;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:→|->|to)\s*(\d+(?:\.\d+)?)/);
  if (m && +m[1] > 0 && +m[2] / +m[1] < 1.2) continue;   // an accent push, under 1.2×
  problems.push(`${at(r)}: the camera closes in with no orbit ("${(r.c[C.cam] ?? '').trim().slice(0, 50)}"): turn the view while it tightens ("push + orbit", camera-motion.md "Closer = orbit-in"), or keep a push under 1.2×`);
}

// (c) share of rows whose focal point is text only (heuristic)
if (need('see', 'What we see', 'text-only check') && need('act', 'Subject action', 'text-only check')) {
  const TEXT = /\b(text|title|headline|kicker|typograph\w*|caption|quote|lettering|kinetic type|words?)\b/i;
  const REAL = /\b(3d|three\.?js|iso(?:metric)?|registry)\b|\bbuild\(\)/i; // text made a real visual: a 3D or isometric build
  const t = rows.filter(r => TEXT.test((r.c[C.see] ?? '').split(/;|\(| — /)[0]) && !REAL.test(r.c[C.act] ?? ''));
  const share = rows.length ? t.length / rows.length : 0;
  if (share > lim.text) problems.push(`storyboard.md:${hi + 1} ${t.length} of ${rows.length} rows (${Math.round(share * 100)} %) show text only, over ${Math.round(lim.text * 100)} % for ${energy} (rows ${t.map(r => r.n).join(', ')}): give them a subject or a real visual`);
}

// (d) average shot length
if (need('time', 'Time', 'average-shot check')) {
  const TIME = /(\d+(?:\.\d+)?)\s*s?\s*[–—-]\s*(\d+(?:\.\d+)?)/;
  const ts = rows.map(r => (r.c[C.time] ?? '').match(TIME)).filter(Boolean).map(m => [Number(m[1]), Number(m[2])]);
  if (!ts.length) warns.push('no parsable Time cell (a–b seconds): average-shot check skipped');
  else {
    const dur = Math.max(...ts.map(x => x[1])) - Math.min(...ts.map(x => x[0])), avg = dur / ts.length;
    if (avg > lim.avg + 1e-9) problems.push(`average shot ${+avg.toFixed(1)} s over ${lim.avg} s for ${energy} (duration ${+dur.toFixed(1)} s needs >= ${Math.ceil(dur / lim.avg - 1e-9)} shots, has ${ts.length})`);
  }
}
// (g) object-studio, the visual thesis (looks.md): one hero held long enough to read, posed by one input
const look = (read('BRIEF.md') ?? '').match(/^\W*look\W*:\W*([\w-]+)/im)?.[1];
if (look === 'object-studio') {
  const TIME = /(\d+(?:\.\d+)?)\s*s?\s*[–—-]\s*(\d+(?:\.\d+)?)/;
  const short = rows.slice(1).filter(r => { const m = (r.c[C.time] ?? '').match(TIME); return m && Number(m[2]) - Number(m[1]) < 2 - 1e-9; });
  if (short.length) problems.push(`storyboard.md:${hi + 1} object-studio rows ${short.map(r => r.n).join(', ')} under 2 s: a shot is held (looks.md object-studio, the thesis); merge them or give the time to fewer shots`);
  const spec = read('SPEC.md');
  if (spec === null) problems.push('SPEC.md missing: object-studio needs its ## MODEL section (Input: and Check: lines) before the storyboard');
  else if (spec !== undefined) {
    const sec = spec.split(/^## /m).find(s => /^MODEL\b/.test(s));
    if (!sec) problems.push('SPEC.md has no ## MODEL section: name the one input and one hand check (express-planner.md)');
    else for (const k of ['Input:', 'Check:']) if (!sec.includes(k)) problems.push(`SPEC.md ## MODEL has no ${k} line (express-planner.md)`);
  }
}
done();
