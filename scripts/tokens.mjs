#!/usr/bin/env node
// Token report of a video's session: the main agent and every subagent, read from Claude Code's own transcripts.
// Every turn re-reads the agent's whole context, so the cost of an agent is turns × context; a builder kept alive for
// hundreds of turns is what burns a film's tokens (look-build.md "Builder budget"). This makes that visible at each gate.
//
// Transcripts: <claude dir>/projects/<path with every non-alphanumeric as "-">/<session>.jsonl, and the session's
// subagents in <session>/subagents/agent-*.jsonl (+ .meta.json: the task's description). The nearest folder at or above
// the project that has transcripts is used, and its newest session that names the project (its newest when none does) unless --session names one. When that session ran in
// a parent folder (several videos in one session), only subagents whose transcript names the project folder count.
//
// Usage: node tokens.mjs [project] [--session <id>] [--claude-dir <dir>] [--max-turns 120] [--max-ctx 250000] [--json]
//   (defaults 30 turns and 150K context when BRIEF.md says mode: express; there the whole film, main and subagents,
//   is held to 10M tokens)
//   writes <project>/review/tokens.json (the full table) and prints one row per agent and a "Result:" line.
// Exit 0: every builder within budget. 3: a builder over budget (WARN rows). 2: NOT CHECKED (no transcript found or
// none readable) — rerun, or pass --claude-dir / --session; this is never "no tokens used".

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const json = args.includes('--json'); if (json) args.splice(args.indexOf('--json'), 1);
const claudeDir = flag('--claude-dir', process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'));
const sessionArg = flag('--session', null), turnsArg = flag('--max-turns', null), ctxArg = flag('--max-ctx', null);
const project = path.resolve(args[0] ?? '.');
// Express builders work from a finished SPEC, the kit's templates and a written brief: a tighter budget (30 turns, 150K context) than
// Studio's (120, 250K). Every turn re-reads the whole context, so a builder that reads engine sources or keeps many
// screenshots pays for them on every later turn.
let express = false; try { express = /^\W*mode\W*:\W*express\b/im.test(readFileSync(path.join(project, 'BRIEF.md'), 'utf8')); } catch { /* Studio budget */ }
const maxTurns = +(turnsArg ?? (express ? 30 : 120)), maxCtx = +(ctxArg ?? (express ? 150000 : 250000)), FILM_MAX = 10e6;
const LONG = 2500;   // characters: about 15 lines of prompt or reply
const STUDIO_MAIN_TURNS = 100; // a whole Studio film's main agent; a QC phase of 80+ turns at 400K+ context was 40 % of one
const notChecked = why => { console.error(`NOT CHECKED: ${why}. Rerun, or pass --claude-dir / --session. This is not "no tokens used".`); console.log('Result: not checked'); process.exit(2); };
if (!(maxTurns > 0 && maxCtx > 0)) notChecked('--max-turns and --max-ctx must be > 0');

// The nearest folder at or above the project with transcripts.
let base = null, sessionCwd = null;
for (let d = project; ; d = path.dirname(d)) {
  const p = path.join(claudeDir, 'projects', d.replace(/[^A-Za-z0-9]/g, '-'));
  if (existsSync(p) && readdirSync(p).some(f => f.endsWith('.jsonl'))) { base = p; sessionCwd = d; break; }
  if (path.dirname(d) === d) break;
}
if (!base) notChecked(`no transcripts for ${project} or a folder above it in ${path.join(claudeDir, 'projects')}`);
const sessions = readdirSync(base).filter(f => f.endsWith('.jsonl')).sort((a, b) => statSync(path.join(base, b)).mtimeMs - statSync(path.join(base, a)).mtimeMs);
// a shared parent holds every film's sessions: the newest that names this project (its path, or its folder under the
// parent, never as part of a longer name), else the folder's newest
const relName = path.relative(sessionCwd, project);
const namesIt = new RegExp(`(?<![\\w-])(${[project, relName].filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`);
const naming = sessionCwd === project ? null : sessions.find(f => { try { return namesIt.test(readFileSync(path.join(base, f), 'utf8')); } catch { return false; } });
const session = sessionArg ? `${sessionArg.replace(/\.jsonl$/, '')}.jsonl` : naming ?? sessions[0];
if (!existsSync(path.join(base, session))) notChecked(`session ${session} not found in ${base}`);

// One agent's transcript: a message is split over several lines with the same id and usage, so count each id once.
const read = file => {
  let text; try { text = readFileSync(file, 'utf8'); } catch (e) { return { error: e.code || e.message }; }
  const seen = new Set(), r = { turns: 0, total: 0, maxCtx: 0, lastCtx: 0, model: null, text, parsed: 0, start: null, end: null, asks: {}, agentCalls: 0, longPrompts: 0, longBacks: 0 };
  for (const line of text.split('\n')) {
    if (!line) continue;
    let j; try { j = JSON.parse(line); r.parsed++; } catch { continue; }
    if (j.timestamp) { r.start ??= j.timestamp; r.end = j.timestamp; }
    // the model and effort each subagent was asked for, by the tool call that started it (its meta names the call)
    // and what the main session pays for on every later turn: an Agent prompt with pasted content, a subagent's long reply
    const content = j.message?.content;
    for (const c of Array.isArray(content) ? content : []) {
      if (c?.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task')) { r.agentCalls++; r.asks[c.id] = { model: c.input?.model ?? null, effort: c.input?.effort ?? null }; if (String(c.input?.prompt ?? '').length > LONG) r.longPrompts++; }
      if (c?.type === 'tool_result' && r.asks[c.tool_use_id] && JSON.stringify(c.content ?? '').length > LONG) r.longBacks++;
    }
    if (typeof content === 'string' && /<agent-message|<task-notification>/.test(content) && content.length > LONG) r.longBacks++;
    const u = j.message?.usage;
    if (j.type !== 'assistant' || !u || seen.has(j.message.id)) continue;
    seen.add(j.message.id);
    const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    r.turns++; r.total += ctx + (u.output_tokens || 0); r.lastCtx = ctx; r.maxCtx = Math.max(r.maxCtx, ctx); r.model ??= j.message.model;
  }
  return r;
};

const main = read(path.join(base, session));
if (main.error || !main.parsed) notChecked(`${session} cannot be read (${main.error || 'no JSON lines'})`);
const subDir = path.join(base, session.replace(/\.jsonl$/, ''), 'subagents');
const shared = sessionCwd !== project, rel = path.relative(sessionCwd, project);
let skipped = 0, unreadable = 0;
const agents = [];
for (const f of existsSync(subDir) ? readdirSync(subDir).filter(f => f.endsWith('.jsonl')) : []) {
  const r = read(path.join(subDir, f));
  if (r.error || !r.parsed) { unreadable++; continue; }
  if (shared && !r.text.includes(project) && !r.text.includes(rel)) { skipped++; continue; }
  let desc = f.replace(/\.jsonl$/, ''), ask = {};
  try { const meta = JSON.parse(readFileSync(path.join(subDir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')); desc = meta.description || desc; ask = main.asks[meta.toolUseId] ?? {}; } catch { /* the file name stands in */ }
  const builder = /build|pilot|group|assembl|fix|style.?frame/i.test(desc);
  const over = builder && (r.turns > maxTurns || r.maxCtx > maxCtx);
  agents.push({ agent: f.replace(/\.jsonl$/, ''), desc, builder, over, turns: r.turns, total: r.total, maxCtx: r.maxCtx, model: r.model, effort: ask.effort ?? 'inherited', start: r.start, end: r.end });
}
agents.sort((a, b) => b.total - a.total);
// Agent calls without a transcript here (not found, unreadable): their tokens are unknown, shown as "not counted", never 0
const uncounted = Math.max(0, main.agentCalls - agents.length - skipped);

const M = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`;
const sum = agents.reduce((s, a) => s + a.total, 0), over = agents.filter(a => a.over);
const report = {
  at: new Date().toISOString(), session: session.replace(/\.jsonl$/, ''), sessionCwd, budget: { maxTurns, maxCtx },
  main: { agentCalls: main.agentCalls, turns: main.turns, total: main.total, maxCtx: main.maxCtx, lastCtx: main.lastCtx, model: main.model, shared, start: main.start, end: main.end, longPrompts: main.longPrompts, longBacks: main.longBacks },
  subagents: agents, subagentTotal: sum, uncounted, skippedOtherProjects: skipped, unreadable,
};
try { mkdirSync(path.join(project, 'review'), { recursive: true }); writeFileSync(path.join(project, 'review', 'tokens.json'), JSON.stringify(report, null, 2)); }
catch (e) { console.error(`WARN: review/tokens.json not written (${e.code || e.message})`); }

// the main agent's cost is its turns × its context: both in the summary, so a gate shows which one grew
const summary = `main ${M(main.total)} in ${main.turns} turns${shared ? ' (whole session, shared)' : ''}, subagents ${uncounted && !agents.length ? 'not counted' : `${M(sum)} (${agents.length})${uncounted ? `, ${uncounted} more not counted` : ''}`}, ` +
  `main context ${M(main.lastCtx)}; ${over.length ? `${over.length} builder(s) over budget` : 'builders within budget'}`;
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Session ${report.session}${shared ? ` (ran in ${sessionCwd}; ${skipped} subagent(s) of other projects skipped)` : ''}`);
  console.log(`${'main'.padEnd(44)} ${String(main.turns).padStart(4)} turns  ${M(main.total).padStart(7)}  ctx max ${M(main.maxCtx)}`);
  for (const a of agents) console.log(`${a.over ? 'WARN' : '    '} ${a.desc.slice(0, 39).padEnd(39)} ${String(a.turns).padStart(4)} turns  ${M(a.total).padStart(7)}  ctx max ${M(a.maxCtx)}${a.model ? `  ${a.model}` : ''}  effort ${a.effort}`);
  if (uncounted) console.log(`WARN: ${uncounted} Agent call(s) in the main transcript have no subagent transcript here (subagents not counted): rerun after the session writes them, or pass --session / --claude-dir`);
  if (unreadable) console.log(`WARN: ${unreadable} subagent transcript(s) could not be read: rerun`);
  if (express && !shared && main.turns > 30) console.log(`WARN: the main agent took ${main.turns} turns (Express: about 25, 30 at most): send calls that do not need each other in one message (express.md "The main agent's turns")`);
  if (!express && !shared && main.turns > STUDIO_MAIN_TURNS) console.log(`WARN: the main agent took ${main.turns} turns (Studio: ${STUDIO_MAIN_TURNS} at most): every turn and every subagent reply re-reads the whole session; a loop belongs in one job, a short runner in the foreground (SKILL.md "The main agent orchestrates")`);
  const film = (shared ? 0 : main.total) + agents.reduce((x, a) => x + a.total, 0);
  if (express && film > FILM_MAX) console.log(`WARN: this film used ${M(film)} tokens (Express budget ${M(FILM_MAX)}): express.md "Token budget" names where each part goes`);
  if (main.longPrompts || main.longBacks) console.log(`WARN: the main session carries ${main.longPrompts} Agent prompt(s) and ${main.longBacks} subagent reply(ies) over ${LONG} characters: prompts are the job and file paths, verdicts and reports go in files (SKILL.md "The main agent orchestrates")`);
  if (main.lastCtx > maxCtx) console.log(`WARN: the main context is ${M(main.lastCtx)}: without an auto-compact window run workspace.mjs init; tell the user /compact is safe at this gate (SKILL.md "Compact")`);
  if (over.length) console.log(`WARN: over budget (> ${maxTurns} turns or > ${M(maxCtx)} context): give the rest of that job to a new builder (look-build.md "Builder budget")`);
}
console.log(`Result: ${summary}`);
process.exit(over.length ? 3 : 0);
