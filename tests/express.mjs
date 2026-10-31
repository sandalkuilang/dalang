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
// a stand-in `npx` first on PATH: what `hyperframes check` / `lint` print (the real v0.8 formats, read from a real run:
// `✗ page_error: <message>` then `index.html [data-composition-id] t=0s`, never a group's file; a classic script that
// throws in a group is `✗ console_error: [HyperFrames] composition script error: <group> Error: <message>`), decided by
// what index.html and the compositions it loads contain. No browser: the test runs the same everywhere.
const bin = path.join(tmp, "bin"), probes = path.join(tmp, "probes"); fs.mkdirSync(bin); fs.mkdirSync(probes);
const calls = path.join(tmp, "npx-calls.log");
fs.writeFileSync(path.join(bin, "npx"), `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path");
const a = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)}, a.join(" ") + " @" + process.cwd() + "\\n");
const read = f => { try { return fs.readFileSync(path.join(process.cwd(), f), "utf8"); } catch { return null; } };
if (a[0] !== "hyperframes") process.exit(1);
if (a[1] === "lint") { console.log("0 errors, 0 warnings"); process.exit(0); }
if (a[1] !== "check") { console.error("unknown command"); process.exit(1); }
const host = read("index.html");
if (host === null) { console.error("No index.html in this project"); process.exit(1); }
const found = [];
const scan = (file, id) => { const t = read(file) ?? ""; for (const m of t.matchAll(/<script( type="module")?>\\s*throw new Error\\('([^']*)'\\)/g)) found.push({ id, module: !!m[1], msg: m[2] }); };
scan("index.html", null);
for (const m of host.matchAll(/data-composition-src="([^"]+)"/g)) scan(m[1], path.basename(m[1], ".html"));
const finds = found.map(f => f.id && !f.module ? { code: "console_error", message: "[HyperFrames] composition script error: " + f.id + " Error: " + f.msg } : { code: "page_error", message: f.msg });
if (a.includes("--json")) { console.log(JSON.stringify({ ok: !finds.length, runtime: { findings: finds.map(f => ({ ...f, severity: "error", sourceFile: "index.html" })) } })); process.exit(finds.length ? 1 : 0); }
console.log("Runtime");
for (const f of finds) console.log("  ✗ " + f.code + ": " + f.message + "\\n    index.html [data-composition-id] t=0s");
console.log(finds.length ? "  " + finds.length + " error(s), 0 warning(s), 0 info(s)\\n\\n◇  Check failed" : "  0 error(s), 0 warning(s), 0 info(s)\\n\\n◇  Check passed");
process.exit(finds.length ? 1 : 0);
`, { mode: 0o755 });
const run = (...a) => { const r = spawnSync(process.execPath, [script, ...a], { encoding: "utf8", env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, TMPDIR: probes } }); return { code: r.status, out: r.stdout + r.stderr }; };

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
// a hero with no researched inside: refused, named, nothing scaffolded on top
fs.appendFileSync(path.join(sp, "SPEC.md"), "- OBJECTS: the pump {\"hero\": true}\n");
r = run("scaffold", sp);
assert.equal(r.code, 1); assert.match(r.out, /^FAILED SPEC\.md has a `hero: true` object but research\/anatomy\.md has no parts table row/m, "a hero is built from its anatomy, never from memory");
fs.mkdirSync(path.join(sp, "research"), { recursive: true });
const head = "Thing: a pump\n| # | Part | Count | Inside or touches | Material | Size | Moves, and what moves it | Tag |\n|---|---|---|---|---|---|---|---|\n";
fs.writeFileSync(path.join(sp, "research/anatomy.md"), head);
r = run("scaffold", sp);
assert.equal(r.code, 1, "a header with no row is not an anatomy");
fs.writeFileSync(path.join(sp, "research/anatomy.md"), head + "| 1 | body | 1 | the slab | cast iron | 0.3 m | - | [assume] |\n");
r = run("scaffold", sp);
assert.equal(r.code, 0, r.out); assert.match(r.out, /OK     anatomy: research\/anatomy\.md/);
fs.writeFileSync(path.join(sp, "storyboard.md"), "| # | Time | Size | Camera | Subject action |\n|---|---|---|---|---|\n| 1 | 0–6 | wide |  |  |\n");
r = run("scaffold", sp);
assert.equal(r.code, 1); assert.match(r.out, /FAILED storyboard_lint/, "a storyboard that fails its lint is never scaffolded");
assert.doesNotMatch(r.out, /scaffold:/);
fs.mkdirSync(path.join(tmp, "assets"));
fs.writeFileSync(path.join(tmp, "assets/world.js"), "export const STUB = true;\n");
r = run("assemble", tmp);
assert.match(r.out, /FAILED assets\/world\.js is still the stub/, "a world never filled fails assemble");
assert.doesNotMatch(r.out, /machine_audit/, "no machine: no machine audit");
assert.match(r.out, /^(WARN   tokens not read|SKIP   fix round|OK     tokens)/m, "assemble says whether a fix round fits the budget");
assert.match(r.out, /^FAILED hyperframes check/m, "a project the check cannot load (no index.html) fails the check step; the page error cases follow below");
assert.match(r.out, /FAILED voice files/, "assemble fails when after-voice's files are missing");
assert.match(r.out, /audio\/beats\.js is missing/, "the missing beats.js is named");
assert.match(r.out, /audio\/captions\.js is missing/, "the missing captions.js is named");
assert.match(r.out, /FAILED hyperframes check/, "assemble runs hyperframes check before Gate 3");
assert.doesNotMatch(r.out, /gate 3/, "no Gate 3 over a failed assemble");
// a beats.js without NARRATION_DURATION and a captions.js without CAPTIONS: each global named
fs.writeFileSync(path.join(tmp, "audio/beats.js"), "window.BEATS = { a: { text: 'x', start: 0, end: 1 } };\nwindow.WORDS = [];\n");
fs.writeFileSync(path.join(tmp, "audio/captions.js"), "window.OTHER = [];\n");
r = run("assemble", tmp);
assert.match(r.out, /audio\/beats\.js sets no window\.NARRATION_DURATION/, "a missing NARRATION_DURATION is named");
assert.match(r.out, /audio\/captions\.js sets no window\.CAPTIONS/, "a missing CAPTIONS is named");
assert.doesNotMatch(r.out, /sets no window\.(BEATS|WORDS)/, "only the missing globals are named");
// complete files: the voice-files line is OK
fs.writeFileSync(path.join(tmp, "audio/beats.js"), "window.BEATS = { a: { text: 'x', start: 0, end: 1 } };\nwindow.WORDS = [];\nwindow.NARRATION_DURATION = 2;\n");
fs.writeFileSync(path.join(tmp, "audio/captions.js"), "window.CAPTIONS = [];\n");
r = run("assemble", tmp);
assert.match(r.out, /OK     voice files/, "complete files pass the voice-files check");
assert.doesNotMatch(r.out, /FAILED voice files/);
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
// object-studio: a machine still the stub fails assemble, and its audit says why
fs.writeFileSync(path.join(tmp, "assets/machine.js"), "export const STUB = true;\n");
r = run("assemble", tmp);
assert.match(r.out, /FAILED assets\/machine\.js is still the stub: the first group never built the machine/, "a machine never built fails assemble");
assert.match(r.out, /FAILED machine_audit\n\s+PROBLEM  : assets\/machine\.js is still the stub/, "the machine audit runs in assemble and names the stub");
assert.ok(JSON.parse(fs.readFileSync(path.join(tmp, "review/assembled.json"), "utf8"))["assets/machine.js"], "assemble records the machine");
// assemble's hyperframes check, both ways: a clean host passes; a host that throws, a group that throws (module script:
// page_error names no file) and a group whose classic script throws (the id is in the message) each fail it, and the
// failure is printed under the part that threw, so the fix round goes to that builder only
const film = (name, { host = "", groups = {} }) => {
  const d = path.join(tmp, name); fs.mkdirSync(path.join(d, "audio"), { recursive: true }); fs.mkdirSync(path.join(d, "src/compositions"), { recursive: true }); fs.mkdirSync(path.join(d, "compositions"));
  fs.writeFileSync(path.join(d, "audio/beats.json"), JSON.stringify({ duration: 4, beats: [{ name: "hook", start: 0 }] }));
  fs.writeFileSync(path.join(d, "audio/words.json"), "[]");
  const lines = Object.keys(groups).map((g, i) => `  <div id="${g}" data-composition-id="${g}" data-composition-src="compositions/${g}.html" data-start="${i}" data-duration="1" data-track-index="1"></div>`);
  fs.writeFileSync(path.join(d, "src/index.tpl.html"), `<div id="root" data-composition-id="main" data-start="0" data-duration="4">\n${lines.join("\n")}\n</div>\n<script>${host}</script>\n`);
  for (const [g, body] of Object.entries(groups)) fs.writeFileSync(path.join(d, `src/compositions/${g}.tpl.html`), `<template id="${g}-template"><div data-composition-id="${g}"></div>\n<script${body.module ? ' type="module"' : ""}>${body.code ?? ""}</script></template>\n`);
  return d;
};
const boom = (module) => ({ module, code: "throw new Error('boom')" });
const checks = () => fs.readFileSync(calls, "utf8").split("\n").filter(l => / check /.test(l));
fs.writeFileSync(calls, "");
let d = film("clean", { groups: { a: {}, b: { module: true } } });
r = run("assemble", d);
assert.match(r.out, /^OK     hyperframes check/m, "a clean host and groups pass the check at assemble");
assert.doesNotMatch(r.out, /→ (group|host)/, "a clean film names no one");
assert.equal(checks().length, 1, "a passing check is one browser run: no probe");
fs.writeFileSync(calls, "");
d = film("hostboom", { host: "throw new Error('boom')", groups: { a: {}, b: { module: true } } });
r = run("assemble", d);
assert.match(r.out, /^FAILED hyperframes check\n\s+✗ page_error: boom/m, "a host that throws fails assemble with the error");
assert.match(r.out, /→ host: 1 page error\(s\), for the host's builder/, "the host's error is printed under the host");
assert.doesNotMatch(r.out, /→ group/, "no group is blamed for the host's error");
fs.writeFileSync(calls, "");
d = film("groupboom", { groups: { a: {}, b: boom(true), c: {} } });
r = run("assemble", d);
assert.match(r.out, /^FAILED hyperframes check\n\s+✗ page_error: boom/m, "a group that throws on load fails assemble with the error");
assert.match(r.out, /→ group b: 1 page error\(s\), for its builder/, "the error is printed under the group that threw");
assert.doesNotMatch(r.out, /→ group [ac]:/, "the groups that did not throw are not blamed");
assert.doesNotMatch(r.out, /→ host/, "the host is not blamed for a group's error");
fs.writeFileSync(calls, "");
d = film("classicboom", { groups: { a: boom(false), b: {} } });
r = run("assemble", d);
assert.match(r.out, /^FAILED hyperframes check/m);
assert.match(r.out, /→ group a: 1 page error\(s\), for its builder/, "a classic script's error carries the group id: printed under it");
assert.doesNotMatch(r.out, /→ group b:/);
assert.equal(checks().length, 1, "an error that names its group needs no probe");
fs.writeFileSync(calls, "");
d = film("twoboom", { groups: { a: boom(true), b: boom(true), c: {} } });
r = run("assemble", d);
assert.match(r.out, /→ group a: 1 page error\(s\)/); assert.match(r.out, /→ group b: 1 page error\(s\)/, "two groups that throw are both named");
assert.doesNotMatch(r.out, /→ group c:/);
// the probe never leaves its copy behind
assert.deepEqual(fs.readdirSync(probes), [], "the probe's temp folder is removed");
console.log("express: OK");
