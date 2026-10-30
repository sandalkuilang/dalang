#!/usr/bin/env node
// The barrier after a fan-out. Every subagent's reply wakes the main agent for a turn that re-reads the whole session;
// N jobs started together are N such turns. Sent in the same message as the N Agent calls (after them), this one
// foreground call returns when the N newest subagents of this session have finished, and their replies arrive inside
// this turn: one turn instead of N, and one message to the user for the round instead of one per job.
//
// Reads Claude Code's own transcripts (as tokens.mjs): the newest session of the nearest folder at or above the project,
// its subagents/agent-*.meta.json (`finished: true` once done) and each transcript's first timestamp (its start).
// Only subagents started in the last 10 minutes count, newest first, so a long job started earlier is never waited for.
//
// Usage: node wait.mjs [project] --expect <n> [--timeout 570] [--claude-dir <dir>]   (run with timeout: 600000)
// Exit 0: all n finished. 3: still running at the timeout (named): run it again, never start the jobs again.
// 2: NOT CHECKED (no transcripts, or fewer than n subagents ever appeared): the replies wake you as usual.
import { existsSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const expect = Number(flag('--expect', NaN)), timeout = Number(flag('--timeout', 570));
const claudeDir = flag('--claude-dir', process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'));
const POLL = Number(process.env.DALANG_WAIT_POLL_S ?? 3), RECENT = 600e3;
if (!(expect >= 1) || !(timeout > 0)) { console.error('Usage: node wait.mjs [project] --expect <n> [--timeout 570] [--claude-dir <dir>]'); process.exit(2); }
const notChecked = why => { console.log(`NOT CHECKED: ${why} — the replies wake you as usual\nResult: not checked`); process.exit(2); };

let base = null;
for (let d = path.resolve(args[0] ?? '.'); ; d = path.dirname(d)) {
  const p = path.join(claudeDir, 'projects', d.replace(/[^A-Za-z0-9]/g, '-'));
  if (existsSync(p) && readdirSync(p).some(f => f.endsWith('.jsonl'))) { base = p; break; }
  if (path.dirname(d) === d) break;
}
if (!base) notChecked('no transcripts for this folder or one above it');
const session = readdirSync(base).filter(f => f.endsWith('.jsonl')).sort((a, b) => statSync(path.join(base, b)).mtimeMs - statSync(path.join(base, a)).mtimeMs)[0];
const subDir = path.join(base, session.replace(/\.jsonl$/, ''), 'subagents');

const startOf = file => { // the transcript's first timestamp, from its first few KB
  try { const fd = openSync(file, 'r'), buf = Buffer.alloc(8192), n = readSync(fd, buf, 0, buf.length, 0); closeSync(fd); const m = buf.toString('utf8', 0, n).match(/"timestamp":"([^"]+)"/); return m ? Date.parse(m[1]) : null; } catch { return null; }
};
const agents = () => (existsSync(subDir) ? readdirSync(subDir) : []).filter(f => f.endsWith('.meta.json')).flatMap(f => {
  let meta; try { meta = JSON.parse(readFileSync(path.join(subDir, f), 'utf8')); } catch { return []; } // being written: next poll
  const start = startOf(path.join(subDir, f.replace(/\.meta\.json$/, '.jsonl'))) ?? statSync(path.join(subDir, f)).mtimeMs;
  return Date.now() - start <= RECENT ? [{ desc: meta.description ?? f, done: meta.finished === true, start }] : [];
}).sort((a, b) => b.start - a.start).slice(0, expect);

const t0 = Date.now();
for (;;) {
  const set = agents();
  if (set.length === expect && set.every(a => a.done)) { console.log(`Result: ${expect} subagent(s) finished (${set.map(a => a.desc).join('; ')}): their replies are in this turn`); process.exit(0); }
  if (Date.now() - t0 >= timeout * 1000) {
    if (set.length < expect) notChecked(`only ${set.length} of ${expect} subagents started in the last 10 minutes`);
    console.log(`WARN: still running at ${timeout} s: ${set.filter(a => !a.done).map(a => a.desc).join('; ')} — run wait.mjs again (never start them again)\nResult: still running`);
    process.exit(3);
  }
  await new Promise(r => setTimeout(r, POLL * 1000));
}
