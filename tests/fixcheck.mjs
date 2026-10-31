#!/usr/bin/env node
// node tests/fixcheck.mjs — scripts/fixcheck.mjs: the group is built fresh before any still (a still of the old build
// proved nothing), the stills folder starts empty, stills are taken at the findings' times, each finding gets a LOOK
// line, and a snapshot with no sheet fails.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/fixcheck.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-fixcheck-"));
const bin = path.join(tmp, "bin"), film = path.join(tmp, "film"), calls = path.join(tmp, "calls.log");
// a stand-in npx: `hyperframes snapshot … -o <dir>/` writes a contact sheet unless NO_SHEET is set, and records what it saw
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, "npx"), `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path"), a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, a.join(" ") + " | built=" + fs.readFileSync("compositions/g.html", "utf8").trim() + "\\n");
if (a[1] !== "snapshot") process.exit(1);
const o = a[a.indexOf("-o") + 1]; fs.mkdirSync(o, { recursive: true });
if (!process.env.NO_SHEET) fs.writeFileSync(path.join(o, "contact-sheet.jpg"), "x");
`, { mode: 0o755 });
for (const d of ["audio", "src/compositions", "compositions", "review/fixcheck/g"]) fs.mkdirSync(path.join(film, d), { recursive: true });
fs.writeFileSync(path.join(film, "audio/beats.json"), JSON.stringify({ duration: 6, beats: [{ name: "hook", start: 0, end: 6 }] }));
fs.writeFileSync(path.join(film, "audio/words.json"), "[]");
fs.writeFileSync(path.join(film, "src/index.tpl.html"), "<html></html>\n");
fs.writeFileSync(path.join(film, "src/compositions/g.tpl.html"), "new {{hook}}\n");
fs.writeFileSync(path.join(film, "compositions/g.html"), "old\n");
fs.writeFileSync(path.join(film, "review/fixcheck/g/contact-sheet-old.jpg"), "stale");
fs.writeFileSync(path.join(film, "review/fixes-g.md"), "P0 | t=2.5 | Reality | the fan has 9 blades\nP1 | t=1 | Clarity | label the coil\n");
const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
const run = (a, e = {}) => { const r = spawnSync(process.execPath, [script, ...a], { cwd: film, encoding: "utf8", env: { ...env, ...e } }); return { code: r.status, out: r.stdout + r.stderr }; };

assert.equal(run([]).code, 2, "no group: usage");
assert.equal(run(["nope", "."]).code, 2, "a group with no template: usage");

let r = run(["g", "."]);
assert.equal(r.code, 0, r.out);
const seen = fs.readFileSync(calls, "utf8");
assert.match(seen, /snapshot --at 1\.00,2\.50 /, "stills at the findings' times, sorted");
assert.match(seen, /built=new 0/, "the snapshot saw the fresh build, not the old one");
assert.ok(!fs.existsSync(path.join(film, "review/fixcheck/g/contact-sheet-old.jpg")), "the stills folder starts empty");
assert.match(r.out, /^SHEET  review\/fixcheck\/g\/contact-sheet\.jpg/m);
assert.match(r.out, /^LOOK   t=2\.5 P0 Reality: the fan has 9 blades/m);
assert.match(r.out, /PASS .* or FAIL/);

r = run(["g", ".", "--at", "4"]);
assert.match(fs.readFileSync(calls, "utf8").trim().split("\n").pop(), /--at 4\.00 /, "--at overrides the findings' times");

r = run(["g", "."], { NO_SHEET: "1" });
assert.equal(r.code, 1, r.out); assert.match(r.out, /FAILED no contact sheet/);
assert.doesNotMatch(r.out, /^LOOK/m, "no LOOK lines without a sheet");
// review fixes: m:ss times, a finding with no time named, and a failed build leaves no old sheet
fs.writeFileSync(path.join(film, "review/fixes-g.md"), "P0 | t=1:05 | Reality | x\nP1 | shot 3 | Clarity | no time here\n");
r = run(["g", "."]);
assert.equal(r.code, 0, r.out);
assert.match(fs.readFileSync(calls, "utf8").trim().split("\n").pop(), /--at 65\.00 /, "t=1:05 is 65 s, not 1");
assert.match(r.out, /^LOOK   no time \(pass --at\): P1 Clarity/m);
fs.renameSync(path.join(film, "audio/words.json"), path.join(film, "audio/words.off"));
r = run(["g", "."]);
assert.equal(r.code, 1, r.out); assert.match(r.out, /FAILED fill_times/);
assert.deepEqual(fs.readdirSync(path.join(film, "review/fixcheck/g")), [], "a failed build leaves no old sheet to judge");
fs.renameSync(path.join(film, "audio/words.off"), path.join(film, "audio/words.json"));
console.log("fixcheck: ok");
