#!/usr/bin/env node
// node tests/express.mjs — scripts/express.mjs: a bad command is a usage error, a film with no take fails in one named
// line, and a take with a WARNING never passes Gate 2.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/express.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-express-"));
const run = (...a) => { const r = spawnSync(process.execPath, [script, ...a], { encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };

assert.equal(run("nope", tmp).code, 2, "an unknown command is a usage error");
let r = run("assemble", tmp);
assert.equal(r.code, 1); assert.match(r.out, /^FAILED no take yet/m, "no take: one named line, no stack traces");
fs.mkdirSync(path.join(tmp, "audio"));
fs.writeFileSync(path.join(tmp, "audio/beats.json"), JSON.stringify({ duration: 2, beats: [] }));
fs.writeFileSync(path.join(tmp, "voice-take.log"), "Audio 2 s\nWARNING: sentence 1 heard as other words\n");
r = run("after-voice", tmp);
assert.equal(r.code, 1); assert.match(r.out, /FAILED the take has 1 WARNING/);
assert.doesNotMatch(r.out, /gate 2/, "a take with a WARNING never reaches Gate 2");
fs.writeFileSync(path.join(tmp, "voice-retake.log"), "Audio 2 s\n");
fs.utimesSync(path.join(tmp, "voice-take.log"), new Date(0), new Date(0));
r = run("after-voice", tmp);
assert.match(r.out, /OK     take: no WARNING \(voice-retake\.log\)/, "the newest take log is the film's, not the first take's");
fs.mkdirSync(path.join(tmp, "assets"));
fs.writeFileSync(path.join(tmp, "assets/world.js"), "export const STUB = true;\n");
r = run("assemble", tmp);
assert.match(r.out, /FAILED assets\/world\.js is still the stub/, "a world never filled fails assemble");
assert.match(r.out, /^(WARN   tokens not read|SKIP   fix round|OK     tokens)/m, "assemble says whether a fix round fits the budget");
r = run("final", tmp);
assert.match(r.out, /FAILED hyperframes check/, "a film that fails check fails final");
assert.doesNotMatch(r.out, /render \(/, "no render after a failed check: check reads the composition, not the mp4");
console.log("express: OK");
