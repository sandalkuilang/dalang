#!/usr/bin/env node
// Numbers lint (Gate 1): every number the film computes comes from one model. The project's model.mjs writes
// numbers.json ({ "<name>": { "value": <number>, "say": "<the spoken words>" } }, or "<name>": <number>), script.md
// tags a model number `[calc: <name>]`, and narration.txt speaks it in a beat named after it: `{about forty dollars|<name>}`.
// Checks: every [calc: name] is in numbers.json; numbers.json is not older than model.mjs (an input changed, the model
// not rerun); every beat named after a model number says it — in words: contains its `say` (whole words, case and
// punctuation ignored); in digits: one figure equals the value after the narration's rounding (decimals as spoken,
// "40" = one significant figure, "1,200" / "1.200" thousands). `[calc: a × b = c]` hand arithmetic is listed, not checked.
// Usage: node numbers_lint.mjs [project]   (default: .)
// Exit 1 on a problem (file:line, what is spoken, the model value), 2 when a file cannot be read or a beat cannot be
// checked (rerun / add say), 0 when clean.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '.');
const problems = [], warns = [], infos = [];
const read = rel => { // text, null when absent, undefined when it could not be read (never "absent")
  try { return readFileSync(path.join(dir, rel), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return null; warns.push(`${rel}: cannot read (${e.code}) — rerun`); return undefined; }
};
const lines = t => t.replace(/\r/g, '').split('\n');
const NAME = /^[A-Za-z_]\w*$/;

const script = read('script.md'), narration = read('narration.txt'), json = read('numbers.json');
if (script === null && narration === null) warns.push(`nothing to lint: no script.md or narration.txt in ${dir} — run it in the video project`);
else for (const [rel, t] of [['script.md', script], ['narration.txt', narration]]) if (t === null) problems.push(`${rel} not found in ${dir}`);

// [calc: …] tags in script.md: a name points into numbers.json; anything else is hand arithmetic.
const calcs = [];
lines(script ?? '').forEach((l, i) => {
  for (const m of l.matchAll(/\[calc:\s*([^\]]*?)\s*\]/g)) {
    if (NAME.test(m[1])) calcs.push({ name: m[1], at: `script.md:${i + 1}` });
    else infos.push(`script.md:${i + 1} [calc: ${m[1]}] is hand arithmetic, not checked — give it a name in model.mjs`);
  }
});

let model = null; // name -> { value, say? }
let modelTime = null;
try { modelTime = statSync(path.join(dir, 'model.mjs')).mtimeMs; } catch (e) { if (e.code !== 'ENOENT') warns.push(`model.mjs: cannot read (${e.code}) — rerun`); }
if (json === null) { if (calcs.length || modelTime !== null) problems.push(`numbers.json not found in ${dir} — run node model.mjs`); }
else if (json !== undefined) {
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object of named numbers');
    model = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = typeof v === 'number' ? { value: v } : v && typeof v === 'object' ? v : { value: v };
      if (typeof n.value !== 'number' || !Number.isFinite(n.value)) problems.push(`numbers.json ${k}: value ${JSON.stringify(n.value)} is not a number — fix model.mjs`);
      else if (n.say !== undefined && typeof n.say !== 'string') problems.push(`numbers.json ${k}: say ${JSON.stringify(n.say)} is not text — fix model.mjs`);
      else model[k] = n;
    }
    // invalid entries stay known names, so their [calc] tags are not also reported as missing
    for (const k of Object.keys(raw)) model[k] ??= null;
    if (modelTime !== null && statSync(path.join(dir, 'numbers.json')).mtimeMs < modelTime) problems.push('numbers.json is older than model.mjs (an input changed) — run node model.mjs');
  } catch (e) { warns.push(`numbers.json: cannot parse (${e.message}) — rerun node model.mjs, then this lint`); model = null; }
}
if (model) for (const c of calcs) if (!(c.name in model)) problems.push(`${c.at} [calc: ${c.name}] is not in numbers.json — add it to model.mjs and rerun it`);

// Spoken words: lower case, punctuation as space, a dash between letters kept as "-" (so "one" is not in "twenty-one").
const norm = s => s.normalize('NFKC').toLowerCase().replace(/(?<=[\p{L}\p{N}])\p{Pd}(?=[\p{L}\p{N}])/gu, '\u0000')
  .replace(/[\p{P}\p{S}\s]+/gu, ' ').replace(/\u0000/g, '-').trim();
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const edge = c => c === undefined || c === ' ' || UNSPACED.test(c) || !/[\p{L}\p{N}\p{M}-]/u.test(c);
const says = (text, say) => {
  const t = norm(text), s = norm(say);
  if (!s) return false;
  for (let i = t.indexOf(s); i >= 0; i = t.indexOf(s, i + 1)) if ((edge(t[i - 1]) || UNSPACED.test(s[0])) && (edge(t[i + s.length]) || UNSPACED.test(s.at(-1)))) return true;
  return false;
};
// A figure as spoken -> every value it can mean, each with its rounding: [{ n, round: v => rounded }].
const readings = tok => {
  const out = [], seps = tok.match(/[.,]/g) ?? [];
  const asInt = digits => { // "18" rounds to the unit; "40", "29000" to their significant figures (4, 29)
    const n = Number(digits), z = n ? digits.match(/0*$/)[0].length : 0, sig = String(n).length - z;
    return { n, round: v => (z && v ? Number(v.toPrecision(sig)) : Math.round(v)) }; };
  if (/^\d{1,3}([.,]\d{3})+$/.test(tok) && new Set(seps).size === 1) out.push(asInt(tok.replace(/[.,]/g, ''))); // 1,200 / 28.800
  if (!seps.length) out.push(asInt(tok));
  else { const k = Math.max(tok.lastIndexOf('.'), tok.lastIndexOf(',')), d = tok.length - k - 1;
    out.push({ n: Number(tok.slice(0, k).replace(/[.,]/g, '') + '.' + tok.slice(k + 1)), round: v => Math.round(v * 10 ** d) / 10 ** d }); }
  return out;
};
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));

let beats = 0;
if (model) lines(narration ?? '').forEach((l, i) => {
  for (const m of l.matchAll(/\{([^{}|]*)\|([A-Za-z_]\w*)\}/g)) {
    const [, text, name] = m, n = model[name], at = `narration.txt:${i + 1}`;
    if (!n) continue; // not a model number (or an invalid one, already reported)
    beats++;
    const toks = text.match(/\d+(?:[.,]\d+)*/g);
    if (toks) {
      const v = Math.abs(n.value);
      if (!toks.some(t => readings(t).some(r => close(r.round(v), r.n)))) problems.push(`${at} {${text}|${name}} says ${toks.join(', ')}, model ${n.value}`);
    } else if (typeof n.say === 'string') {
      if (!says(text, n.say)) problems.push(`${at} {${text}|${name}} says "${text.trim()}", model ${n.value} — expects "${n.say}"`);
    } else warns.push(`${at} {${text}|${name}} is spoken in words and numbers.json gives no say for ${name} — add say in model.mjs`);
  }
});

const count = model ? Object.values(model).filter(Boolean).length : 0;
console.log(`Numbers lint: ${count} model numbers, ${calcs.length} [calc: name] tags, ${beats} spoken beats`);
for (const p of problems) console.log(`  PROBLEM  : ${p}`);
for (const w of warns) console.log(`  WARN     : ${w}`);
for (const n of infos) console.log(`  INFO     : ${n}`);
console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : warns.length ? `  Result   : ${warns.length} warning(s) — rerun or fix, then lint again` : '  Result   : OK');
process.exit(problems.length ? 1 : warns.length ? 2 : 0);
