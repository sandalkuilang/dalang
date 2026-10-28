#!/usr/bin/env node
// node tests/pad-voice.mjs — scripts/pad_voice.mjs: audio/voice.wav is the take with 1.45 s before and 1.35 s after; every
// time in words.json, beats.json, beats.js, narration.srt and the captions moves by the lead; the take is untouched; a
// second run changes nothing; fill_times refuses a template that still plays the unpadded take.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const S = (f) => fileURLToPath(new URL(`../scripts/${f}`, import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-pad-")), A = path.join(tmp, "audio");
const node = (...a) => spawnSync(process.execPath, a, { cwd: tmp, encoding: "utf8" });
const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);
try {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) { console.log("pad-voice: skipped (no ffmpeg)"); process.exit(0); }
  fs.mkdirSync(A);
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=d=2", path.join(A, "narration.wav")]);
  const raw = fs.readFileSync(path.join(A, "narration.wav"));
  const words = [{ text: "Hello", start: 0.1, end: 0.6 }, { text: "world.", start: 0.7, end: 1.9 }];
  fs.writeFileSync(path.join(A, "words.json"), JSON.stringify(words));
  fs.writeFileSync(path.join(A, "beats.json"), JSON.stringify({ duration: 2, audio_file: "narration.wav", beats: [{ name: "hook", text: "Hello world.", start: 0.1, end: 1.9 }], sections: [] }));
  fs.writeFileSync(path.join(A, "beats.js"), `window.BEATS = {"hook":{"text":"Hello world.","start":0.1,"end":1.9}};\nwindow.BEATS_LIST = [];\nwindow.SECTIONS = [];\nwindow.WORDS = ${JSON.stringify(words)};\nwindow.NARRATION_DURATION = 2;\n`);
  fs.writeFileSync(path.join(A, "narration.srt"), "1\n00:00:00,100 --> 00:00:01,900\nHello world.\n");
  fs.writeFileSync(path.join(A, "captions.js"), `window.CAPTIONS = [{"start":0.1,"end":1.9,"words":[{"text":"Hello","start":0.1}]}];\n`);

  let r = node(S("pad_voice.mjs"), ".");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Math.abs(dur(path.join(A, "voice.wav")) - 4.8) < 0.05, "voice.wav = 1.45 + 2 + 1.35 s");
  assert.ok(fs.readFileSync(path.join(A, "narration.wav")).equals(raw), "the take is untouched (a retake still works on it)");
  const B = JSON.parse(fs.readFileSync(path.join(A, "beats.json"), "utf8"));
  assert.deepEqual([B.beats[0].start, B.duration, B.audio_file, B.pad.lead, B.pad.tail], [1.55, 4.8, "voice.wav", 1.45, 1.35]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(A, "words.json"), "utf8"))[1].start, 2.15);
  const win = {}; vm.runInNewContext(fs.readFileSync(path.join(A, "beats.js"), "utf8"), { window: win });
  assert.deepEqual([win.BEATS.hook.start, win.WORDS[0].start, win.NARRATION_DURATION], [1.55, 1.55, 4.8], "beats.js moved and lengthened");
  const cap = {}; vm.runInNewContext(fs.readFileSync(path.join(A, "captions.js"), "utf8"), { window: cap });
  assert.equal(cap.CAPTIONS[0].words[0].start, 1.55, "captions moved");
  assert.match(fs.readFileSync(path.join(A, "narration.srt"), "utf8"), /00:00:01,550 --> 00:00:03,350/, "subtitles moved");

  r = node(S("pad_voice.mjs"), ".");
  assert.match(r.stdout, /already padded/); assert.equal(JSON.parse(fs.readFileSync(path.join(A, "beats.json"), "utf8")).beats[0].start, 1.55, "never padded twice");

  fs.writeFileSync(path.join(tmp, "a.tpl.html"), '<audio src="audio/narration.wav" data-start="{{hook}}"></audio>\n');
  r = node(S("fill_times.mjs"), "a.tpl.html", "a.html");
  assert.equal(r.status, 1); assert.match(r.stderr, /play audio\/voice\.wav/, "the unpadded take with padded times is refused");
  fs.writeFileSync(path.join(tmp, "b.tpl.html"), '<audio src="audio/voice.wav" data-start="{{hook}}"></audio>\n');
  r = node(S("fill_times.mjs"), "b.tpl.html", "b.html");
  assert.equal(r.status, 0, r.stderr); assert.match(fs.readFileSync(path.join(tmp, "b.html"), "utf8"), /data-start="1\.55"/);
  console.log("pad-voice: ok");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
