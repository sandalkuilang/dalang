#!/usr/bin/env node
// node tests/cues.mjs — scripts/cues.mjs: one line per beat, each word as the engine counts it (n film-wide,
// case and punctuation ignored), --beats filters, an unknown beat or a missing take is FAILED.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cues = fileURLToPath(new URL("../scripts/cues.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-cues-"));
const run = (...a) => { const r = spawnSync(process.execPath, [cues, tmp, ...a], { encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };

assert.equal(run().code, 1, "no take yet is FAILED");
fs.mkdirSync(path.join(tmp, "audio"));
const words = ["The", "pump", "runs.", "The", "Pump", "stops"].map((text, i) => ({ i, text, start: i, end: i + 0.5 }));
fs.writeFileSync(path.join(tmp, "audio/words.json"), JSON.stringify(words));
fs.writeFileSync(path.join(tmp, "audio/beats.json"), JSON.stringify({ duration: 7, beats: [
  { name: "run", start: 0, word_index: 0 }, { name: "stop", start: 3, word_index: 3 }] }));

const all = run();
assert.equal(all.code, 0, all.err);
assert.match(all.out, /^run 0\.00–3\.00 \| the 0\.00 · pump 1\.00 · runs 2\.00$/m);
assert.match(all.out, /^stop 3\.00–7\.00 \| the#1 3\.00 · pump#1 4\.00 · stops 5\.00$/m);
const one = run("--beats", "stop");
assert.ok(!/^run /m.test(one.out) && /^stop /m.test(one.out), "--beats prints only those beats");
assert.equal(run("--beats", "nope").code, 1, "an unknown beat is FAILED");
console.log("cues: OK");
