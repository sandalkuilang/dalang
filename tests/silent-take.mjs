#!/usr/bin/env node
// node tests/silent-take.mjs — Brief `voice: none`: scripts/silent_take.mjs times the script by reading time and writes the
// take's files (beats.json, words.json, beats.js, a silent narration.wav); `express.mjs after-voice` runs it, pads, writes the
// captions and passes Gates 1–2 with no voice and no take log; narration_lint skips its ear rules; scaffold works on the result.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const S = (f) => fileURLToPath(new URL(`../scripts/${f}`, import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-silent-"));
const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.011, `${m}: ${a} vs ${b}`);
const BRIEF = "mode: express\nplatform: YouTube Shorts\nlook: isometric-world\nduration: 30 s\nvoice: none\n";
const NARR = "{A pump moves water.|hook} {Blades push it round.|middle} {Pressure carries it up.|close}\n";
const SCRIPT = "Promise: how a pump lifts water\nTakeaway: spinning blades add pressure\n";
const mk = (name, brief = BRIEF, narr = NARR, script = SCRIPT) => {
  const d = path.join(tmp, name); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, "BRIEF.md"), brief); fs.writeFileSync(path.join(d, "narration.txt"), narr); fs.writeFileSync(path.join(d, "script.md"), script);
  return d;
};
const run = (d, ...a) => spawnSync(process.execPath, a, { cwd: d, encoding: "utf8" });
const json = (d, f) => JSON.parse(fs.readFileSync(path.join(d, "audio", f), "utf8"));
try {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) { console.log("silent-take: skipped (no ffmpeg)"); process.exit(0); }

  // 1–2. the silent take: reading time
  const a = mk("a");
  let r = run(a, S("silent_take.mjs"), ".");
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const B = json(a, "beats.json");
  assert.deepEqual(B.beats.map((b) => b.name), ["hook", "middle", "close"]);
  assert.deepEqual(B.beats.map((b) => b.start), [0, 2.4, 4.4]);
  near(B.duration, 6.8, "duration");
  const W = json(a, "words.json");
  assert.equal(W.length, 11);
  assert.ok(W.every((w) => Math.abs(w.end - w.start - 0.3) < 1e-6 && !/[.,]$/.test(w.text)), "0.3 s a word, no punctuation");
  const win = {}; vm.runInNewContext(fs.readFileSync(path.join(a, "audio/beats.js"), "utf8"), { window: win });
  assert.equal(win.NARRATION_DURATION, B.duration); assert.equal(win.BEATS.middle.start, 2.4);
  near(dur(path.join(a, "audio/narration.wav")), 6.8, "silent track");

  // 3. after-voice with no take and no log
  const b = mk("b");
  r = run(b, S("express.mjs"), "after-voice", ".");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const re of [/OK {5}take: voice none/, /OK {5}pad_voice/, /OK {5}captions/, /OK {5}gate 1/, /OK {5}gate 2/]) assert.match(r.stdout, re);
  assert.doesNotMatch(r.stdout, /WARNING|no take yet/);
  assert.ok(json(b, "beats.json").pad, "pad record");
  near(dur(path.join(b, "audio/voice.wav")), 6.8 + 2.8, "voice.wav");
  assert.ok(fs.existsSync(path.join(b, "audio/captions.js")), "captions written");
  for (const n of [1, 2]) assert.equal(run(b, S("state.mjs"), "check", String(n), b).status, 0, `gate ${n} fresh`);

  // 4. ear rules skipped, both ways; script.md still checked
  const c = mk("c", BRIEF, NARR + "One long line; with a semicolon, many, commas, and a very long sentence that keeps going on and on and on for far more than twenty two words in total here.\n");
  assert.equal(run(c, S("narration_lint.mjs"), ".").status, 0, "voice none: no ear rules");
  fs.writeFileSync(path.join(c, "BRIEF.md"), BRIEF.replace("voice: none\n", ""));
  assert.equal(run(c, S("narration_lint.mjs"), ".").status, 1, "voiced: ear rules apply");
  const c2 = mk("c2", BRIEF, NARR, "Promise: how a pump lifts water\n");
  assert.equal(run(c2, S("narration_lint.mjs"), ".").status, 1, "script.md Takeaway still required");

  // 5. scaffold and fill_times on the result
  r = run(b, S("scaffold.mjs"), ".", "--look", "isometric-world", "--groups", "a:hook,b:middle,c:close", "--music", "none");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(path.join(b, "src/index.tpl.html"), "utf8"), /audio\/voice\.wav/);
  r = run(b, S("fill_times.mjs"), "src/index.tpl.html", "index.html");
  assert.equal(r.status, 0, r.stdout + r.stderr);

  // 6. an edit and a rerun
  const before = json(b, "beats.json").duration;
  fs.writeFileSync(path.join(b, "narration.txt"), NARR.replace("moves water", "moves clean water"));
  r = run(b, S("express.mjs"), "after-voice", ".");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.notEqual(json(b, "beats.json").duration, before, "duration follows the edit");
  assert.match(r.stdout, /OK {5}gate 2/);

  // 7. a voiced project with no take still refuses
  const v = mk("v", BRIEF.replace("voice: none\n", ""));
  r = run(v, S("express.mjs"), "after-voice", ".");
  assert.equal(r.status, 1); assert.match(r.stdout, /no take yet/);
  console.log("silent-take: ok");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
