#!/usr/bin/env node
// node tests/tokens.mjs — scripts/tokens.mjs against fixture Claude Code transcripts. A message split over several lines
// counts once; a builder over the turn or context budget is a WARN row and exit 3; a session run in a parent folder
// counts only the subagents that name this project; no transcript or an unreadable one is NOT CHECKED (exit 2), never
// "no tokens"; state.mjs approve records the report's Result line.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/tokens.mjs", import.meta.url));
const state = fileURLToPath(new URL("../scripts/state.mjs", import.meta.url));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dalang-tokens-")));
const claude = path.join(tmp, "claude");
const env = { ...process.env, CLAUDE_CONFIG_DIR: claude };
const run = (...args) => { const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const enc = (d) => path.join(claude, "projects", d.replace(/[^A-Za-z0-9]/g, "-"));
// One assistant turn of `ctx` context tokens, written twice (a message split over two lines) to check the dedupe.
const turn = (id, ctx, text = "") => {
  const line = JSON.stringify({ type: "assistant", message: { id, model: "m", usage: { input_tokens: 0, cache_creation_input_tokens: 1000, cache_read_input_tokens: ctx - 1000, output_tokens: 100 }, content: [{ type: "text", text }] } });
  return `${line}\n${line}\n`;
};
const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const agent = (sessDir, id, desc, turns, ctx, text = "") => {
  put(path.join(sessDir, "subagents", `agent-${id}.jsonl`), Array.from({ length: turns }, (_, k) => turn(`${id}-${k}`, ctx, text)).join(""));
  put(path.join(sessDir, "subagents", `agent-${id}.meta.json`), JSON.stringify({ description: desc }));
};

// A session run in the project folder itself: a lean builder, a bloated one, a reviewer with a big context (not a builder).
const proj = path.join(tmp, "videos", "how-a-kettle-boils");
fs.mkdirSync(proj, { recursive: true });
put(path.join(enc(proj), "s1.jsonl"), turn("m1", 50000) + turn("m2", 60000));
agent(path.join(enc(proj), "s1"), "a", "Build group intro", 20, 80000);
agent(path.join(enc(proj), "s1"), "b", "Pilot build: hook group", 200, 400000);
agent(path.join(enc(proj), "s1"), "c", "Fresh-eyes review", 10, 300000);
let r = run(proj);
assert.equal(r.code, 3, r.out + r.err);
assert.match(r.out, /^WARN Pilot build: hook group\s+200 turns/m);
assert.match(r.out, /^\s{5}Build group intro\s+20 turns/m);
assert.match(r.out, /^\s{5}Fresh-eyes review/m, "a reviewer is never a WARN row");
assert.equal(JSON.parse(fs.readFileSync(path.join(proj, "review", "tokens.json"), "utf8")).main.total, 110200, "a message on two lines counts once: 50K + 60K context + 2 × 100 output");
assert.match(r.out, /Result: .*1 builder\(s\) over budget/);
const report = JSON.parse(fs.readFileSync(path.join(proj, "review", "tokens.json"), "utf8"));
assert.equal(report.subagents.length, 3);
assert.equal(report.subagents[0].desc, "Pilot build: hook group");

// Within budget once the bar is raised: exit 0.
r = run(proj, "--max-turns", "500", "--max-ctx", "500000");
assert.equal(r.code, 0, r.out + r.err);
assert.match(r.out, /Result: .*builders within budget/);

// A session run in the parent folder: only subagents that name this project count.
const other = path.join(tmp, "videos", "why-bread-goes-stale");
fs.mkdirSync(other, { recursive: true });
const parent = path.join(tmp, "videos");
put(path.join(enc(parent), "s2.jsonl"), turn("p1", 40000));
agent(path.join(enc(parent), "s2"), "x", "Build group intro", 5, 50000, "work in how-a-kettle-boils/src");
agent(path.join(enc(parent), "s2"), "y", "Build group intro", 5, 50000, "work in why-bread-goes-stale/src");
fs.rmSync(enc(proj), { recursive: true });
r = run(proj);
assert.equal(r.code, 0, r.out + r.err);
assert.match(r.out, /1 subagent\(s\) of other projects skipped/);
assert.match(r.out, /whole session, shared/);
// Two sessions in the shared parent: the newest is another film's. The report reads the newest one that names this project.
put(path.join(enc(parent), "s3.jsonl"), turn("q1", 30000, "only why-bread-goes-stale here"));
const s2 = path.join(enc(parent), "s2.jsonl"), s3 = path.join(enc(parent), "s3.jsonl");
fs.appendFileSync(s2, JSON.stringify({ type: "user", message: { content: "film how-a-kettle-boils" } }) + "\n");
fs.utimesSync(s2, new Date(1000e3), new Date(1000e3)); fs.utimesSync(s3, new Date(2000e3), new Date(2000e3));
r = run(proj);
assert.equal(JSON.parse(fs.readFileSync(path.join(proj, "review", "tokens.json"), "utf8")).session, "s2", "the newest session that names the project, not the newest of the folder");
// a prefix is not a name: a film whose folder starts with this one's name does not count as naming it
const short = path.join(tmp, "videos", "how-a-kettle");
fs.mkdirSync(short, { recursive: true });
r = run(short);
assert.equal(JSON.parse(fs.readFileSync(path.join(short, "review", "tokens.json"), "utf8")).session, "s3", "no session names it: the folder's newest, as before");
// a longer name that ends with this one is not a name either
const tail = path.join(tmp, "videos", "boils");
fs.mkdirSync(tail, { recursive: true });
r = run(tail);
assert.equal(JSON.parse(fs.readFileSync(path.join(tail, "review", "tokens.json"), "utf8")).session, "s3", "how-a-kettle-boils does not name boils");

// No transcripts anywhere above: NOT CHECKED, exit 2, nothing claimed.
const lone = path.join(tmp, "elsewhere", "a-film");
fs.mkdirSync(lone, { recursive: true });
r = run(lone);
assert.equal(r.code, 2);
assert.match(r.err, /NOT CHECKED/);
assert.match(r.out, /Result: not checked/);
assert.doesNotMatch(r.out + r.err, /\b0 tokens|no tokens used\b(?!")/);

// A session file with no JSON lines: NOT CHECKED, never an empty report.
put(path.join(enc(lone), "s3.jsonl"), "garbage\n");
r = run(lone);
assert.equal(r.code, 2);
assert.match(r.err, /cannot be read/);

// state.mjs approve records the Result line, and a missing transcript is "not checked", never a block.
for (const [f, s] of [["script.md", "Promise: one thing.\nTakeaway: the thing.\n"], ["narration.txt", "Some words.\n"]]) put(path.join(other, f), s);
const a = spawnSync(process.execPath, [state, "approve", "1", other, "--by", "agent"], { encoding: "utf8", env });
assert.equal(a.status, 0, a.stdout + a.stderr);
assert.match(a.stdout, / · Tokens: main \d/);
const st = JSON.parse(fs.readFileSync(path.join(other, "state.json"), "utf8"));
assert.match(st.approvals[1].tokens, /^main /);
for (const [f, s] of [["script.md", "Promise: one thing.\nTakeaway: the thing.\n"], ["narration.txt", "Some words.\n"]]) put(path.join(lone, f), s);
const c = spawnSync(process.execPath, [state, "approve", "1", lone, "--by", "agent"], { encoding: "utf8", env: { ...env, CLAUDE_CONFIG_DIR: path.join(tmp, "nowhere") } });
assert.equal(c.status, 0, c.stdout + c.stderr);
assert.match(c.stdout, / · Tokens: not checked/);

// Express budget: BRIEF.md mode: express flags a builder over 30 turns or 150K context, and a film over 10M tokens.
{
  const ep = path.join(tmp, "videos3", "how-a-lock-opens");
  fs.mkdirSync(ep, { recursive: true }); put(path.join(ep, "BRIEF.md"), "- mode: express\n");
  put(path.join(enc(ep), "s6.jsonl"), turn("e1", 30000));
  agent(path.join(enc(ep), "s6"), "e", "Builder A", 45, 260000);
  const x = run(ep);
  assert.equal(x.code, 3, x.out + x.err); assert.match(x.out, /^WARN Builder A\s+45 turns/m, "45 turns is over the Express budget");
  assert.doesNotMatch(x.out, /the main agent took/, "a main agent within its turns is no WARN");
  assert.match(x.out, /WARN: this film used [\d.]+M tokens \(Express budget 10\.0M\)/, "an Express film over 10M tokens is named");
  const mp2 = path.join(tmp, "videos4", "how-a-fan-cools");
  fs.mkdirSync(mp2, { recursive: true }); put(path.join(mp2, "BRIEF.md"), "- mode: express\n");
  put(path.join(enc(mp2), "s7.jsonl"), Array.from({ length: 45 }, (_, k) => turn(`m${k}`, 60000)).join(""));
  assert.match(run(mp2).out, /WARN: the main agent took 45 turns/, "an Express main agent over 30 turns is named");
  // Studio: the main agent's turns are in the Result line, and over 100 they are named
  const sp = path.join(tmp, "videos5", "how-a-pump-lifts");
  fs.mkdirSync(sp, { recursive: true });
  put(path.join(enc(sp), "s8.jsonl"), Array.from({ length: 101 }, (_, k) => turn(`s${k}`, 60000)).join(""));
  const st = run(sp);
  assert.match(st.out, /Result: main [\d.]+M in 101 turns/, "the Result line names the main agent's turns");
  assert.match(st.out, /WARN: the main agent took 101 turns \(Studio: 100 at most\)/, "a Studio main agent over 100 turns is named");
}

// state.mjs metrics: start, end, total and per-step minutes from PRODUCTION.md; per subagent the model and the effort it
// was asked for (the Agent call its meta names), its tokens and its clock times. No step lines: NOT CHECKED, exit 2.
{
  const mp = path.join(tmp, "videos2", "how-a-hinge-wears");
  fs.mkdirSync(mp, { recursive: true });
  const ask = JSON.stringify({ type: "assistant", timestamp: "2026-01-02T09:00:00Z", message: { id: "q0", content: [{ type: "tool_use", id: "toolu_1", name: "Agent", input: { description: "Builder A", model: "sonnet", effort: "high" } }] } });
  put(path.join(enc(mp), "s5.jsonl"), ask + "\n" + turn("q1", 30000));
  const sd = path.join(enc(mp), "s5");
  put(path.join(sd, "subagents", "agent-z.jsonl"), [JSON.stringify({ type: "user", timestamp: "2026-01-02T09:01:00Z", message: { content: "go" } }), turn("z1", 40000).trim()].join("\n") + "\n");
  put(path.join(sd, "subagents", "agent-z.meta.json"), JSON.stringify({ description: "Builder A", toolUseId: "toolu_1" }));
  const m = (dir) => spawnSync(process.execPath, [state, "metrics", dir], { encoding: "utf8", env });
  let x = m(mp);
  assert.equal(x.status, 2, x.stdout + x.stderr); assert.match(x.stderr, /NOT CHECKED/);
  put(path.join(mp, "PRODUCTION.md"), "# PRODUCTION\n\n## 2026-01-02\n09:00–09:05 | 1 Brief | BRIEF.md | -\n09:05–09:21 | 6 Build | index.html | -\n09:21–09:24 | 8 Final | final.mp4 | -\n");
  x = m(mp);
  assert.equal(x.status, 0, x.stdout + x.stderr);
  assert.match(x.stdout, /Start 09:00 · End 09:24 · Total 24 min/);
  assert.match(x.stdout, /\| 6 Build \| 09:05 \| 09:21 \| 16 \|/);
  assert.match(x.stdout, /\| Builder A \| m \| high \| 1 \|/, "the effort the agent was asked for");
  assert.ok(fs.existsSync(path.join(mp, "review", "metrics.md")), "metrics.md written");
  assert.match(x.stdout, /Output folder: .*how-a-hinge-wears \(no final file yet\)/, "the output folder is named");
  assert.doesNotMatch(x.stdout, /not counted/, "subagent transcripts found: counted");
  // Start and End are the earliest and latest line by time, not the first and last in the file
  put(path.join(mp, "PRODUCTION.md"), "# PRODUCTION\n\n## 2026-01-02\n09:00–09:05 | 1 Brief | BRIEF.md | -\n09:21–09:24 | 8 Final | final.mp4 | -\n09:03–09:10 | 7 QC | x | -\n");
  x = m(mp); assert.match(x.stdout, /Start 09:00 · End 09:24 · Total 24 min/, "the latest end wins, not the last line's");
  put(path.join(mp, "PRODUCTION.md"), "# PRODUCTION\n\n## 2026-01-02\n23:50–23:58 | 6 Build | x | -\n\n## 2026-01-03\n00:02–00:30 | 8 Final | y | -\n");
  x = m(mp); assert.match(x.stdout, /Start 23:50 · End 00:30 · Total 40 min/, "a run over midnight");
  put(path.join(mp, "final.mp4"), "x"); assert.match(m(mp).stdout, /Output folder: .*\(final\.mp4\)/, "and its final files");
}

// Agent calls whose subagent transcripts are missing: "not counted", never 0; a film with no Agent call keeps a true 0.
{
  const vp = path.join(tmp, "videos2", "how-a-valve-seats");
  fs.mkdirSync(vp, { recursive: true });
  const ask = JSON.stringify({ type: "assistant", message: { id: "v0", content: [{ type: "tool_use", id: "toolu_9", name: "Agent", input: { description: "Builder B" } }] } });
  put(path.join(enc(vp), "s11.jsonl"), ask + "\n" + turn("v1", 30000));
  put(path.join(vp, "PRODUCTION.md"), "# PRODUCTION\n\n## 2026-01-02\n09:00–09:05 | 1 Brief | BRIEF.md | -\n09:05–09:21 | 6 Build | index.html | -\n");
  const x = spawnSync(process.execPath, [state, "metrics", vp], { encoding: "utf8", env });
  assert.equal(x.status, 0, x.stdout + x.stderr);
  assert.match(x.stdout, /Subagents: not counted/); assert.match(x.stdout, /Total tokens: at least/);
  assert.doesNotMatch(x.stdout, /0 subagents|subagents 0K/);
  const t = run(vp);
  assert.equal(t.code, 0, t.out + t.err); assert.match(t.out, /Result: .*subagents not counted/);
  assert.match(t.out, /WARN: 1 Agent call/);
  assert.match(run(path.join(tmp, "videos5", "how-a-pump-lifts")).out, /subagents 0K \(0\)/, "no Agent call: a true zero");
}

// The main session's carry: an Agent prompt with pasted content and a long subagent reply are counted and WARNed.
{
  const lp = path.join(tmp, "videos", "how-a-lock-turns");
  fs.mkdirSync(lp, { recursive: true });
  const call = { type: "assistant", message: { id: "lp1", model: "m", usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 10 }, content: [{ type: "tool_use", id: "t1", name: "Agent", input: { prompt: "x".repeat(4000) } }] } };
  const back = { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "y".repeat(4000) }] } };
  const short = { type: "assistant", message: { id: "lp2", model: "m", usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 10 }, content: [{ type: "tool_use", id: "t2", name: "Agent", input: { prompt: "do review/fixes-a.md" } }] } };
  put(path.join(enc(lp), "s9.jsonl"), [call, back, short].map((o) => JSON.stringify(o)).join("\n") + "\n");
  const x = run(lp);
  assert.match(x.out, /WARN: the main session carries 1 Agent prompt\(s\) and 1 subagent reply\(ies\) over 2500/);
  const t = JSON.parse(fs.readFileSync(path.join(lp, "review", "tokens.json"), "utf8")).main;
  assert.equal(t.longPrompts, 1); assert.equal(t.longBacks, 1);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("tokens: OK");
