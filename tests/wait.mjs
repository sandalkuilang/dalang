#!/usr/bin/env node
// node tests/wait.mjs — scripts/wait.mjs: the barrier returns once the n newest subagents have finished, names the ones
// still running at its timeout (exit 3), never waits for a job started long before, and is NOT CHECKED (exit 2) without
// transcripts or when fewer than n subagents ever appeared.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/wait.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-wait-"));
const claude = path.join(tmp, "claude"), film = path.join(tmp, "videos", "how-a-valve-shuts");
fs.mkdirSync(film, { recursive: true });
const run = (...a) => spawnSync(process.execPath, [script, film, "--claude-dir", claude, ...a], { encoding: "utf8", env: { ...process.env, DALANG_WAIT_POLL_S: "0.2" } });

let r = run("--expect", "1", "--timeout", "1");
assert.equal(r.status, 2, r.stdout); assert.match(r.stdout, /NOT CHECKED: no transcripts/);
assert.equal(run("--timeout", "1").status, 2, "--expect is required");

const proj = path.join(claude, "projects", film.replace(/[^A-Za-z0-9]/g, "-")), sub = path.join(proj, "s1", "subagents");
fs.mkdirSync(sub, { recursive: true });
fs.writeFileSync(path.join(proj, "s1.jsonl"), "{}\n");
const agent = (id, desc, finished, startedMsAgo = 1000) => {
  fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), JSON.stringify({ timestamp: new Date(Date.now() - startedMsAgo).toISOString() }) + "\n");
  fs.writeFileSync(path.join(sub, `agent-${id}.meta.json`), JSON.stringify({ description: desc, ...(finished && { finished: true }) }));
};
agent("old", "Long hero model", false, 3600e3); // started an hour ago, still running: never waited for
agent("a", "Fix group intro", true);
agent("b", "Fix group chain", false);
r = run("--expect", "2", "--timeout", "1");
assert.equal(r.status, 3, r.stdout); assert.match(r.stdout, /still running at 1 s: Fix group chain — run wait\.mjs again/);
assert.doesNotMatch(r.stdout, /Long hero/, "an old job is not part of the barrier");
agent("b", "Fix group chain", true);
r = run("--expect", "2", "--timeout", "1");
assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /Result: 2 subagent\(s\) finished/);
r = run("--expect", "3", "--timeout", "1");
assert.equal(r.status, 2, r.stdout); assert.match(r.stdout, /only 2 of 3 subagents started/);
// a job that finishes while the barrier waits releases it
agent("c", "Review round 2", false);
setTimeout(() => agent("c", "Review round 2", true), 600);
const t0 = Date.now();
const late = await new Promise((res) => {
  import("node:child_process").then(({ spawn }) => {
    const p = spawn(process.execPath, [script, film, "--claude-dir", claude, "--expect", "1", "--timeout", "5"], { env: { ...process.env, DALANG_WAIT_POLL_S: "0.2" } });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.on("close", (code) => res({ code, out }));
  });
});
assert.equal(late.code, 0, late.out); assert.ok(Date.now() - t0 < 4000, "released when the job finished, not at the timeout");
console.log("wait: OK");
