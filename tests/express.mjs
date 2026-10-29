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
// tts_timestamps.mjs read the take itself and found it clean: after-voice does not read a log again
fs.writeFileSync(path.join(tmp, "voice-retake.log"), "WARNING: an older line the take already re-spoke\n");
r = run("after-voice", tmp, "--take-clean");
assert.match(r.out, /OK     take: no WARNING \(read by tts_timestamps\.mjs\)/, "--take-clean: the caller read the WARNING lines");
fs.writeFileSync(path.join(tmp, "voice-retake.log"), "Audio 2 s\n");
// scaffold: the planner's last call, from SPEC.md's one SCAFFOLD line, only once the storyboard lints clean
const sp = path.join(tmp, "sp");
fs.mkdirSync(path.join(sp, "audio"), { recursive: true });
fs.writeFileSync(path.join(sp, "audio/beats.json"), JSON.stringify({ duration: 6, beats: [] }));
fs.writeFileSync(path.join(sp, "narration.txt"), "{Open here.|hook} {Then this.|middle} {And last.|close}\n");
r = run("scaffold", sp);
assert.equal(r.code, 1); assert.match(r.out, /FAILED SPEC\.md not found/);
fs.writeFileSync(path.join(sp, "SPEC.md"), "# SPEC\n- LOOK: isometric-world\n");
const rows = ["close · zoom k 3", "wide · zoom k 1", "medium · zoom k 2"].map((size, i) => `| ${i + 1} | ${i * 2}.00–${i * 2 + 2}.00 | ${["hook", "middle", "close"][i]} | A · curiosity | ${size} | the pump body (focal) | orbit25 one way | the impeller turns (iso build values) | cut on the word | - | label 40 px |`);
fs.writeFileSync(path.join(sp, "storyboard.md"), ["| # | Time | Beat | Job · emotion | Size · angle · lens | What we see | Camera | Subject action | Transition out | SFX | Overlay |", "|---|---|---|---|---|---|---|---|---|---|---|", ...rows, ""].join("\n"));
r = run("scaffold", sp);
assert.equal(r.code, 1); assert.match(r.out, /needs exactly one `SCAFFOLD:/, "no SCAFFOLD line: named, nothing written");
assert.ok(!fs.existsSync(path.join(sp, "src")));
fs.appendFileSync(path.join(sp, "SPEC.md"), "SCAFFOLD: `--look isometric-world --groups a:hook,b:middle --music none`\n");
r = run("scaffold", sp);
assert.equal(r.code, 0, r.out);
assert.match(r.out, /OK     storyboard_lint/); assert.match(r.out, /OK     scaffold/);
assert.match(r.out, /next: one dalang-builder per group \(a hook→middle, b middle→END\)/, "the builders' prompt line is printed for the main agent");
assert.doesNotMatch(fs.readFileSync(path.join(sp, "src/compositions/b.tpl.html"), "utf8"), /illustration/, "no illustration label in a group");
fs.writeFileSync(path.join(sp, "storyboard.md"), "| # | Time | Size | Camera | Subject action |\n|---|---|---|---|---|\n| 1 | 0–6 | wide |  |  |\n");
r = run("scaffold", sp);
assert.equal(r.code, 1); assert.match(r.out, /FAILED storyboard_lint/, "a storyboard that fails its lint is never scaffolded");
assert.doesNotMatch(r.out, /scaffold:/);
fs.mkdirSync(path.join(tmp, "assets"));
fs.writeFileSync(path.join(tmp, "assets/world.js"), "export const STUB = true;\n");
r = run("assemble", tmp);
assert.match(r.out, /FAILED assets\/world\.js is still the stub/, "a world never filled fails assemble");
assert.match(r.out, /^(WARN   tokens not read|SKIP   fix round|OK     tokens)/m, "assemble says whether a fix round fits the budget");
r = run("final", tmp);
assert.match(r.out, /FAILED hyperframes check/, "a film that fails check fails final");
// assemble records the world and every group by sha256; final lists what the fix round changed
const lock = JSON.parse(fs.readFileSync(path.join(tmp, "review/assembled.json"), "utf8"));
assert.ok(lock["assets/world.js"], "assemble records the world");
assert.match(r.out, /OK     nothing changed since assemble/, "nothing touched: nothing listed");
fs.appendFileSync(path.join(tmp, "assets/world.js"), "// a fixer's edit\n");
r = run("final", tmp);
assert.match(r.out, /CHANGED since assemble: assets\/world\.js \(the world: its owner only\)/, "a changed world is named");
fs.rmSync(path.join(tmp, "review/assembled.json"));
r = run("final", tmp);
assert.match(r.out, /WARN   no review\/assembled\.json/, "no record: a WARN, never 'nothing changed'");
assert.doesNotMatch(r.out, /render \(/, "no render after a failed check: check reads the composition, not the mp4");
console.log("express: OK");
