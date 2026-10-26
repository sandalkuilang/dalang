#!/usr/bin/env node
// Release gate for assets: every file in assets/ is in ASSETS.json with a source and a licence
// that allows the use, and generated files record their model and prompt. Writes CREDITS.md.
//
// ASSETS.json: [{ "file": "assets/bee.jpg", "source": "<URL, or 'generated', or 'user'>",
//   "licence": "CC-BY-4.0", "author": "Name", "model": "<model> (<its licence>)",
//   "prompt": "...", "seed": 42, "beat": "hook" }]
// The narration's row is also checked against the model that spoke it: audio/<name>.response.json _meta, read through
// scripts/voice_licences.mjs. A non-commercial voice listed under a commercial licence is a problem; a voice that
// table cannot identify is a WARN (check its model card / plan), never read as commercial-OK.
// Usage: node check_assets.mjs [project dir] [--commercial]
//   --commercial  also fail non-commercial licences (NC, research-only). ND (no derivatives) always fails: a video edit is a derivative.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { voiceModel, unknownVoice } from './voice_licences.mjs';

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--')) ?? '.';
const commercial = args.includes('--commercial');
const manifest = path.join(dir, 'ASSETS.json');
if (!existsSync(manifest)) { console.error(`FAILED: ${manifest} not found — list every asset there (references/look-build.md §5).`); process.exit(1); }
const list = JSON.parse(readFileSync(manifest, 'utf8'));

const walk = d => existsSync(d) ? readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }) : [];
const onDisk = walk(path.join(dir, 'assets')).map(p => path.relative(dir, p)).filter(p => !path.basename(p).startsWith('.'));
const listed = new Set(list.filter(a => a.file).map(a => path.normalize(a.file)));

// Allowed for any use; NC/research licences only for non-commercial films; ND never (\b so "Licence" isn't "NC").
const OK = /^(CC0|PD|public[- ]domain|CC-BY(-SA)?(-[\d.]+)?|Pexels|Pixabay|Apache-2\.0|MIT|own|user|bundled)\b/i;
const NC = /\bNC\b|non-?commercial|research/i;
const ND = /\bND\b|no[- ]?deriv/i;

const problems = [];
for (const f of onDisk) if (!listed.has(path.normalize(f))) problems.push(`${f}: not in ASSETS.json`);
for (const a of list) {
  const tag = a.file || '(no file)';
  if (!a.file || !existsSync(path.join(dir, a.file))) problems.push(`${tag}: file missing`);
  if (!a.source) problems.push(`${tag}: no source`);
  if (!a.licence) problems.push(`${tag}: no licence`);
  else if (ND.test(a.licence)) problems.push(`${tag}: licence "${a.licence}" forbids derivatives — a video edit is one`);
  else if (NC.test(a.licence) ? commercial : !OK.test(a.licence)) problems.push(`${tag}: licence "${a.licence}" ${NC.test(a.licence) ? 'is non-commercial' : 'is not on the allowed list — check it'}`);
  if (/^CC-BY/i.test(a.licence || '') && !a.author) problems.push(`${tag}: CC BY needs an author for the credit`);
  if (a.source === 'generated' && (!a.model || !a.prompt)) problems.push(`${tag}: generated asset needs model (with its licence) and prompt`);
}

// The voice's licence comes from the model that spoke (its take's response file), not from the row's own text.
// Auditions (sample-*) are not shipped. A response file that cannot be read fails closed.
// A voice the table cannot identify (unknown model, unreadable plan, a take from before the tier was recorded) is a
// WARN, never silence and never commercial-OK; so is a non-commercial take whose narration has no row to check.
const audioDir = path.join(dir, 'audio');
const takes = existsSync(audioDir) ? readdirSync(audioDir).filter(f => f.endsWith('.response.json') && !f.startsWith('sample-')) : [];
const warnings = [];
for (const f of takes) {
  let meta;
  try { meta = JSON.parse(readFileSync(path.join(audioDir, f), 'utf8'))._meta; }
  catch { problems.push(`audio/${f}: unreadable — cannot tell which model spoke; regenerate the take or fix the file`); continue; }
  const v = voiceModel(meta);
  if (!v) { warnings.push(`audio/${f}: the voice's output licence is unknown — ${unknownVoice(meta)}`); continue; }
  if (!v.nc) continue;
  const stem = f.slice(0, -'.response.json'.length);
  const rows = list.filter(r => r.file && r.licence && path.parse(r.file).name === stem);
  if (!rows.length) warnings.push(`audio/${f}: spoken by ${v.name} (${v.licence}) but no ASSETS.json row is named "${stem}.*" — no row to check; list the narration under that licence`);
  for (const a of rows)
    if (!NC.test(a.licence)) problems.push(`${a.file}: spoken by ${v.name} (audio/${f}), whose output is ${v.licence} — listed as "${a.licence}"; list that licence`);
}

const credits = list.filter(a => a.file).filter(a => /^CC-BY/i.test(a.licence || '') || a.author).map(a => `- ${path.basename(a.file)} — ${a.author ?? 'unknown'}, ${a.licence}, ${a.source}`);
if (credits.length) writeFileSync(path.join(dir, 'CREDITS.md'), `# Credits\n\n${credits.join('\n')}\n`);

console.log(`Assets: ${list.length} listed, ${onDisk.length} in assets/, ${credits.length} credit line(s) → CREDITS.md`);
for (const w of warnings) console.log(`  WARN    : ${w}`);
for (const p of problems) console.log(`  PROBLEM : ${p}`);
console.log(`  Result  : ${problems.length ? `${problems.length} problem(s) — not ready for the final render.` : 'OK'}`);
process.exit(problems.length ? 3 : 0);
