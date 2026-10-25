#!/usr/bin/env node
// Where a video stands, from its files plus the approvals recorded in state.json.
// A gate can only be approved after the one before it, and an approval goes stale when
// the files it approved change afterwards.
//
// Usage: node state.mjs [dir]                     -> status (resume from here)
//        node state.mjs approve <1-4> [dir] [--by "user"|"agent"] [--note "..."]
//        node state.mjs check <1-4> [dir]         -> exit 0 only if that gate is approved and fresh
//        node state.mjs log "<step> | <output> | <problems or ->" [dir]
//                                                 -> appends "HH:MM–HH:MM | …" to PRODUCTION.md; the step
//                                                    starts where the day's last logged line ended

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const GATES = {
  1: { name: 'script', files: ['script.md', 'narration.txt'] },
  2: { name: 'voice', files: ['audio/beats.json'] },
  3: { name: 'look', files: ['SPEC.md', 'storyboard.md', 'style-frames'] },
  4: { name: 'draft', files: ['index.html'] },
};

const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const by = flag('--by') ?? 'user', note = flag('--note');
const [cmd, gateArg, dirArg] = ['approve', 'check', 'log'].includes(args[0]) ? args : [null, null, args[0]];
const dir = dirArg ?? '.';
const file = path.join(dir, 'state.json');
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { approvals: {} };

// One hash over a gate's files (folders: every file inside), so any edit shows up.
const hashOf = g => {
  const h = createHash('sha1');
  const add = p => { if (!existsSync(p)) return h.update(`missing:${p}`); if (statSync(p).isDirectory()) readdirSync(p).sort().forEach(f => add(path.join(p, f))); else h.update(readFileSync(p)); };
  GATES[g].files.forEach(f => add(path.join(dir, f)));
  return h.digest('hex').slice(0, 12);
};
const ready = g => GATES[g].files.every(f => existsSync(path.join(dir, f)));
const status = g => { const a = state.approvals[g]; return !a ? (ready(g) ? 'waiting for approval' : 'not started') : a.hash === hashOf(g) ? `approved ${a.at} by ${a.by}` : `STALE — files changed after approval (${a.at})`; };

if (cmd === 'approve') {
  const g = Number(gateArg);
  if (!GATES[g]) { console.error('FAILED: gate must be 1–4'); process.exit(1); }
  if (!ready(g)) { console.error(`FAILED: gate ${g} (${GATES[g].name}) has missing files: ${GATES[g].files.filter(f => !existsSync(path.join(dir, f))).join(', ')}`); process.exit(1); }
  const prev = [1, 2, 3].filter(k => k < g).find(k => !status(k).startsWith('approved'));
  if (prev) { console.error(`FAILED: gate ${prev} is ${status(prev)} — approve it first.`); process.exit(1); }
  // 'sv' formats local time as YYYY-MM-DD HH:MM
  state.approvals[g] = { at: new Date().toLocaleString('sv').slice(0, 16), by, hash: hashOf(g), ...(note && { note }) };
  writeFileSync(file, JSON.stringify(state, null, 2));
  console.log(`DONE gate ${g} (${GATES[g].name}) approved by ${by}`);
} else if (cmd === 'log') {
  if (!gateArg?.includes('|')) { console.error('FAILED: log needs "<step> | <output> | <problems or ->"'); process.exit(1); }
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
} else {
  for (const g of [1, 2, 3, 4]) console.log(`Gate ${g} ${GATES[g].name.padEnd(7)} ${status(g)}`);
  const next = [1, 2, 3, 4].find(g => !status(g).startsWith('approved'));
  console.log(next ? `Next: work toward gate ${next} (${GATES[next].name}).` : 'Next: final render (Step 8).');
}
