#!/usr/bin/env node
// node tests/fix-ledger.mjs — scripts/fix_ledger.mjs: only a P0 or a Set / Reality / Clarity P1 starts a fix round; a
// round with as many blocking findings as the last stops; a finding open two rounds running is REROUTE; the round cap
// stops; an unreadable ledger is a WARN (exit 2), never clean.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/fix_ledger.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-ledger-"));
const rv = path.join(tmp, "review"); fs.mkdirSync(rv);
const run = (...a) => { const r = spawnSync(process.execPath, [script, tmp, ...a], { encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };
const fixes = (g, s) => fs.writeFileSync(path.join(rv, `fixes-${g}.md`), s);
const nextRound = () => { const n = fs.readdirSync(rv).filter(d => /^round-\d+$/.test(d)).length + 1; fs.mkdirSync(path.join(rv, `round-${n}`)); for (const f of fs.readdirSync(rv).filter(f => /^fixes-/.test(f))) fs.renameSync(path.join(rv, f), path.join(rv, `round-${n}`, f)); };

assert.equal(run("--max-rounds", "0").code, 2, "a cap under 1 is a usage error");

// round 1: only taste findings: clean, they ship listed
fixes("a", "P1 | t=2 | Action | move the arm\nP2 | t=3 | Composition | tidy\n");
let r = run();
assert.equal(r.code, 0, r.out); assert.match(r.out, /STOP   clean/); assert.match(r.out, /2 finding\(s\) never start a round/);

// a blocking finding starts round 1
fixes("a", "P0 | t=2.0 | Reality | the fan has 9 blades\nP1 | t=5 | Clarity | label the coil\n");
r = run();
assert.equal(r.code, 1, r.out); assert.match(r.out, /ROUND  1: 2 blocking finding\(s\) in 1 group/);
assert.equal(run().code, 1, "rerun in the same round: the round is overwritten, not added");

// round 2: one fixed, the fan still open at t=2.4 (same group and test, within 1 s): REROUTE, and a round
nextRound();
fixes("a", "P0 | t=2.4 | Reality | the fan still has 7 blades\n");
r = run();
assert.equal(r.code, 1, r.out); assert.match(r.out, /^REROUTE a t=2\.4 P0 Reality/m); assert.match(r.out, /ROUND  2: 1 blocking/);

// round 3: no fewer blocking findings than round 2: not converging, stop with OPEN lines
nextRound();
fixes("a", "P0 | t=8 | Set | a new one\n");
r = run();
assert.equal(r.code, 3, r.out); assert.match(r.out, /STOP   not converging: 1 → 1/); assert.match(r.out, /^OPEN   a t=8 P0 Set/m);

// the cap: review round 3 with --max-rounds 2 stops even when converging
fs.writeFileSync(path.join(rv, "fix-ledger.json"), JSON.stringify({ rounds: { 1: [], 2: [{ group: "a", sev: "P0", t: 1, test: "Reality", change: "x" }, { group: "a", sev: "P0", t: 4, test: "Reality", change: "y" }] } }));
r = run("--max-rounds", "2");
assert.equal(r.code, 3, r.out); assert.match(r.out, /STOP   round cap: review round 3 of 2/);

fs.writeFileSync(path.join(rv, "fix-ledger.json"), "{ not json");
r = run();
assert.equal(r.code, 2, r.out); assert.match(r.out, /WARN .*cannot be read/); assert.doesNotMatch(r.out, /clean/);
// review fixes: a finding as a list item or a table row counts; a line that only mentions a severity, or a file with
// text and no finding, is a WARN (never clean); a round with no blocking finding is no baseline; a bad ledger shape is a WARN
fs.rmSync(rv, { recursive: true }); fs.mkdirSync(rv);
fixes("a", "- P0 | t=1:05 | Reality | x\n| **P1** | t=3 | Clarity | y |\n");
r = run();
assert.equal(r.code, 1, r.out); assert.match(r.out, /ROUND  1: 2 blocking/);
assert.equal(JSON.parse(fs.readFileSync(path.join(rv, "fix-ledger.json"), "utf8")).rounds[1][0].t, 65, "t=1:05 is 65 s");
fixes("a", "Found: one P0 at the hook\n");
r = run();
assert.equal(r.code, 2, r.out); assert.match(r.out, /WARN .*name a severity but do not start with it/); assert.doesNotMatch(r.out, /STOP/);
fixes("a", "the fan is wrong\n");
r = run();
assert.equal(r.code, 2, r.out); assert.match(r.out, /WARN .*has text but no/);
fs.writeFileSync(path.join(rv, "fix-ledger.json"), JSON.stringify({ rounds: { 1: [{ group: "a", sev: "P2", t: 1, test: "Composition", change: "x" }] } }));
nextRound(); fixes("a", "P0 | t=4 | Reality | new\n");
r = run();
assert.equal(r.code, 1, r.out); assert.match(r.out, /ROUND  2: 1 blocking/, "after a round with no blocking finding a new P0 gets its round");
fs.writeFileSync(path.join(rv, "fix-ledger.json"), JSON.stringify({ rounds: { 1: "x" } }));
assert.equal(run().code, 2, "a ledger of the wrong shape is a WARN");
console.log("fix-ledger: ok");
