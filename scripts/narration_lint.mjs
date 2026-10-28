#!/usr/bin/env node
// Gate 1: is the narration easy to follow by ear? TTS has no eyes: a semicolon, colon, bracket or slash becomes a pause of
// unpredictable length, and a long sentence becomes one breath too many; the viewer loses the thread. Reads narration.txt the
// way tts_timestamps.mjs does (# lines are sections, [tags] are hints, (1.5) is silence, {words|name} is words) and checks
// script.md for the two lines that say where the film goes.
// Fails (file:line): a ; : ( ) or / in spoken text, a sentence over 22 words (languages written without spaces: not
// counted), script.md without a `Promise:` line and a `Takeaway:` line. Dialogue files (most lines `name: text`) keep the colon.
//
// Usage: node narration_lint.mjs [project]   (default: .)
// Exit 0 = clean; 1 = problems; 2 = a file could not be read: rerun, then lint again.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? '.';
if (dir === '--help' || dir === '-h') { console.log('Usage: node narration_lint.mjs [project]'); process.exit(0); }
const MAX_WORDS = 22;
const problems = [], warns = [];

const read = file => {
  try { return readFileSync(join(dir, file), 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') problems.push(`${file} not found`);
    else warns.push(`${file}: cannot read (${e.code ?? e.message}) — rerun`);
    return null;
  }
};

const narration = read('narration.txt');
if (narration !== null) {
  const lines = narration.replace(/\r/g, '').split('\n');
  const speech = l => !l.trim().startsWith('#') && !/^\s*\(\d+(\.\d+)?\)\s*$/.test(l);
  const talk = lines.filter(l => l.trim() && speech(l));
  const dialogue = talk.length > 0 && talk.filter(l => /^\s*[\p{L}\p{N}_-]{1,24}:\s/u.test(l)).length * 2 >= talk.length;
  let prose = '', at = []; // the spoken text, and the file line of each character
  lines.forEach((l, i) => {
    if (!speech(l)) { prose += '\n'; at.push(i + 1); return; }
    const s = l.replace(/\[[^\]]*\]/g, '').replace(/\{([^{}|]*)(\|[^{}]*)?\}/g, '$1').replace(dialogue ? /^\s*[\p{L}\p{N}_-]{1,24}:\s/u : /^$/, '');
    prose += s + '\n'; at.push(...Array(s.length + 1).fill(i + 1));
  });
  for (const m of prose.matchAll(/[;:()/]/g)) {
    if (dialogue && m[0] === ':') continue;
    problems.push(`narration.txt:${at[m.index]} "${m[0]}" is read as a pause of unknown length — split the sentence, or use a full stop or a comma`);
  }
  for (const m of prose.matchAll(/[^.!?…\n]+(?:[.!?…]+|\n|$)/g)) {
    const words = m[0].trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w));
    if (words.length > MAX_WORDS) problems.push(`narration.txt:${at[m.index + m[0].search(/\S/)]} a sentence of ${words.length} words ("${words.slice(0, 6).join(' ')} …"): over ${MAX_WORDS}, split it, one idea each`);
  }
}

const script = read('script.md');
if (script !== null) {
  for (const key of ['Promise', 'Takeaway']) {
    if (!new RegExp(`^\\s*[*_>-]*\\s*${key}\\s*[*_]*\\s*:`, 'mi').test(script)) problems.push(`script.md has no "${key}:" line — the film must say what it asks and what it answers (script-voice.md "Promise")`);
  }
}

console.log(`Narration lint: ${dir}`);
for (const p of problems) console.log(`  PROBLEM  : ${p}`);
for (const w of warns) console.log(`  WARN     : ${w}`);
console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : warns.length ? `  Result   : ${warns.length} warning(s) — rerun, then lint again` : '  Result   : OK');
process.exit(problems.length ? 1 : warns.length ? 2 : 0);
