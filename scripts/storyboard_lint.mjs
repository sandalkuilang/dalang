#!/usr/bin/env node
// Storyboard lint (before Gate 3): a slideshow is caught in the storyboard, where a fix costs a line, not in the
// draft render. Reads the shot table of storyboard.md (the table with a "Subject action" column; other tables are
// ignored) and flags, each with `storyboard.md:LINE row N`: an empty "Subject action" or "Camera" cell; 3 or more
// consecutive rows with the same size and angle; the share of rows whose focal point is text only, over the
// energy's limit; an average shot length over the energy's limit; a hard cut that keeps the view (two shots cut together
// at the same angle, or under 60° apart: a jump cut that shows nothing new). Limits = references/visual-direction.md §3.
// The text-only check is a heuristic on the "What we see" focal clause and the Subject action's source words.
// Energy: --energy calm|balanced|punchy, else the Energy line of BRIEF.md, else balanced (INFO).
// Usage: node storyboard_lint.mjs [project] [--energy calm|balanced|punchy]   (default: .)
// Exit 1 on a problem, 2 when the storyboard cannot be read or a check cannot run (rerun / fix), 0 when clean.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const ei = args.indexOf('--energy');
const energyArg = ei >= 0 ? args.splice(ei, 2)[1] : null;
const dir = path.resolve(args.find(a => !a.startsWith('--')) ?? '.');
const problems = [], warns = [], infos = [];
const LIMITS = { calm: { avg: 5, text: 0.10 }, balanced: { avg: 3, text: 0.15 }, punchy: { avg: 1.8, text: 0.25 } };
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
if (energyArg && !LIMITS[energyArg]) warns.push(`--energy ${energyArg}: use calm, balanced or punchy`);
else if (energyArg) energy = energyArg;
else {
  const brief = read('BRIEF.md');
  const l = (brief ?? '').split('\n').find(x => /energy/i.test(x) && /calm|modern|balanced|punchy/i.test(x));
  const m = l && l.match(/calm|punchy|modern|balanced/i);
  if (m) energy = /calm/i.test(m[0]) ? 'calm' : /punchy/i.test(m[0]) ? 'punchy' : 'balanced';
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
done();
