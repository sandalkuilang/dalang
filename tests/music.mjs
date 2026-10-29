#!/usr/bin/env node
// node tests/music.mjs — scripts/music.mjs: the bundled bed is copied with its licence row, a film's own bed is kept, a
// bad mood fails; offline by design (no search), so a down media site never leaves a film without music.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/music.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-music-"));
const run = (...a) => { const r = spawnSync(process.execPath, [script, ...a], { encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };

assert.equal(run(tmp, "loud").code, 1, "a bad mood fails");
let r = run(tmp, "tense");
assert.equal(r.code, 0, r.out); assert.match(r.out, /assets\/music\.mp3 \(tense, Public domain\)/);
const rows = JSON.parse(fs.readFileSync(path.join(tmp, "ASSETS.json"), "utf8"));
assert.equal(rows.length, 1); assert.equal(rows[0].file, "assets/music.mp3"); assert.match(rows[0].source, /^https:\/\/commons\.wikimedia\.org\//);
assert.ok(fs.statSync(path.join(tmp, "assets/music.mp3")).size > 10000);
r = run(tmp, "calm");
assert.match(r.out, /kept assets\/music\.mp3/, "a film's own bed is never replaced");
console.log("music: OK");
