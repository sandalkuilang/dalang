#!/usr/bin/env node
// Second-language cut: do two narrations hold the same named beats, in the same order? Every animation time is a named
// beat ({words|name} -> BEATS.name, {{name}} in the template), so a second narration with the same names re-times the
// whole film from the same storyboard. Read the way tts_timestamps.mjs reads them: a line starting with # is a section
// marker (not spoken), a beat may span a line break, an unnamed or invalid-named beat gets a b<n> name that shifts, a
// second beat of one name is renamed.
// Fails (file:line): a beat missing from the second narration, renamed or extra in it, out of the first's order,
// unnamed, with an invalid or repeated name, an unbalanced brace. Words, sections and line breaks may differ.
//
// Usage: node beats_lint.mjs <narration.txt> <narration.<lang>.txt>
// Exit 0 = same beats in the same order; 1 = problems; 2 = a file could not be read, or usage: rerun, then lint again.

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const USAGE = 'Usage: node beats_lint.mjs <narration.txt> <narration.<lang>.txt>';
if (args.includes('--help') || args.includes('-h')) { console.log(USAGE); process.exit(0); }
if (args.length !== 2) { console.error(USAGE); process.exit(2); }

const problems = [], warns = [];
const [fileA, fileB] = args;

// -> text, or null (reported: an absent file is a problem, any other failure is a warning to rerun, never "not found")
const read = file => {
  try { return readFileSync(file, 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') problems.push(`${file} not found`);
    else warns.push(`${file}: cannot read (${e.code ?? e.message}) — rerun`);
    return null;
  }
};

// -> the named beats in order, [{ name, line }]; the file's own faults go to problems
const beatsOf = (file, text) => {
  const spoken = text.replace(/\r/g, '').split('\n').map(l => l.trim().startsWith('#') ? ' '.repeat(l.length) : l).join('\n');
  const seq = [], seen = new Map();
  let line = 1, open = null;
  const add = (name, at, body) => {
    if (!name) { problems.push(`${file}:${at} {${body.trim()}} has no |name: the voice step names it b<n>, which shifts — name every beat`); return; }
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) { problems.push(`${file}:${at} {${body.trim()}|${name}} — "${name}" is not a name (letters, digits, _ and $, not starting with a digit): the voice step replaces it with b<n>`); return; }
    if (seen.has(name)) { problems.push(`${file}:${at} second beat named ${name} (first at ${file}:${seen.get(name)})`); return; }
    seen.set(name, at);
    seq.push({ name, line: at });
  };
  for (let i = 0; i < spoken.length; i++) {
    const ch = spoken[i];
    if (ch === '\n') { line++; continue; }
    if (ch === '{') {
      if (open) problems.push(`${file}:${line} found { inside { } — braces cannot be nested`);
      else open = { line, from: i + 1, name: '' };
      continue;
    }
    if (ch === '}') {
      if (!open) { problems.push(`${file}:${line} } without a matching {`); continue; }
      add(open.name, open.line, spoken.slice(open.from, open.nameAt ?? i));
      open = null; continue;
    }
    if (ch === '|' && open && open.nameAt === undefined) {
      const close = spoken.indexOf('}', i);
      if (close === -1) break; // unclosed: reported below
      open.nameAt = i;
      open.name = spoken.slice(i + 1, close).trim();
      line += (spoken.slice(i + 1, close).match(/\n/g) ?? []).length;
      i = close - 1;
    }
  }
  if (open) problems.push(`${file}:${open.line} { without a closing }`);
  return seq;
};

const textA = read(fileA), textB = read(fileB);
const A = textA === null ? null : beatsOf(fileA, textA);
const B = textB === null ? null : beatsOf(fileB, textB);

if (A && B) {
  const inA = new Map(A.map(b => [b.name, b.line])), inB = new Map(B.map(b => [b.name, b.line]));
  for (const b of A) if (!inB.has(b.name)) problems.push(`${fileA}:${b.line} beat ${b.name} is missing from ${fileB}`);
  for (const b of B) if (!inA.has(b.name)) problems.push(`${fileB}:${b.line} beat ${b.name} is not in ${fileA} (renamed?)`);
  const a = A.filter(b => inB.has(b.name)), b = B.filter(x => inA.has(x.name));
  const at = a.findIndex((x, i) => x.name !== b[i].name);
  if (at !== -1) problems.push(`${fileB}:${b[at].line} beat ${b[at].name} comes where ${fileA}:${a[at].line} has ${a[at].name} — keep the first narration's order`);
}

console.log(`Beats lint: ${A ? A.length : '?'} vs ${B ? B.length : '?'} beats`);
for (const p of problems) console.log(`  PROBLEM  : ${p}`);
for (const w of warns) console.log(`  WARN     : ${w}`);
console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : warns.length ? `  Result   : ${warns.length} warning(s) — rerun, then lint again` : '  Result   : OK');
process.exit(problems.length ? 1 : warns.length ? 2 : 0);
