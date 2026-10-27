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
for (const [f, s] of [["script.md", "# s\n"], ["narration.txt", "words\n"]]) put(path.join(other, f), s);
const a = spawnSync(process.execPath, [state, "approve", "1", other, "--by", "agent"], { encoding: "utf8", env });
assert.equal(a.status, 0, a.stdout + a.stderr);
assert.match(a.stdout, /^Tokens: main \d/m);
const st = JSON.parse(fs.readFileSync(path.join(other, "state.json"), "utf8"));
assert.match(st.approvals[1].tokens, /^main /);
for (const [f, s] of [["script.md", "# s\n"], ["narration.txt", "words\n"]]) put(path.join(lone, f), s);
const c = spawnSync(process.execPath, [state, "approve", "1", lone, "--by", "agent"], { encoding: "utf8", env: { ...env, CLAUDE_CONFIG_DIR: path.join(tmp, "nowhere") } });
assert.equal(c.status, 0, c.stdout + c.stderr);
assert.match(c.stdout, /^Tokens: not checked/m);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("tokens: OK");
