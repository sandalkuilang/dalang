#!/usr/bin/env node
// node tests/pad-voice.mjs — scripts/pad_voice.mjs: audio/voice.wav is the take with 1.45 s before and 1.35 s after; every
// time in words.json, beats.json, beats.js, narration.srt and the captions moves by the lead; the take is untouched; a
// second run changes nothing; fill_times refuses a template that still plays the unpadded take. A film under 10 s
// (BRIEF.md duration) gets 0.2 s each side; minutes, 10 s or more and no duration line keep the normal pads.
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
  // a film under 10 s (BRIEF.md duration) gets 0.2 s each side, not 1.45 / 1.35; minutes and longer seconds keep the normal pads
  const mk = (name, brief) => {
    const d = path.join(tmp, name), a = path.join(d, "audio"); fs.mkdirSync(a, { recursive: true });
    fs.copyFileSync(path.join(A, "narration.wav"), path.join(a, "narration.wav"));
    fs.writeFileSync(path.join(a, "words.json"), JSON.stringify(words));
    fs.writeFileSync(path.join(a, "beats.json"), JSON.stringify({ duration: 2, audio_file: "narration.wav", beats: [{ name: "hook", text: "Hello world.", start: 0.1, end: 1.9 }], sections: [] }));
    if (brief !== null) fs.writeFileSync(path.join(d, "BRIEF.md"), brief);
    const p = spawnSync(process.execPath, [S("pad_voice.mjs"), d], { encoding: "utf8" });
    assert.equal(p.status, 0, p.stderr);
    return { p, B: JSON.parse(fs.readFileSync(path.join(a, "beats.json"), "utf8")), W: JSON.parse(fs.readFileSync(path.join(a, "words.json"), "utf8")), wav: path.join(a, "voice.wav") };
  };
  let s = mk("short", "# Brief\n- duration: 3–8 s\n");
  assert.deepEqual([s.B.pad.lead, s.B.pad.tail, s.B.duration, s.B.beats[0].start, s.W[1].start], [0.2, 0.2, 2.4, 0.3, 0.9], "under 10 s: 0.2 s pads");
  assert.ok(Math.abs(dur(s.wav) - 2.4) < 0.05, "voice.wav = 0.2 + 2 + 0.2 s");
  assert.match(s.p.stdout, /short pads/);
  assert.equal(mk("mins", "- duration: 2.5–3 min\n").B.pad.lead, 1.45, "minutes are not seconds");
  assert.equal(mk("sixty", "- duration: 60 s\n").B.pad.lead, 1.45, "60 s is a normal film");
  assert.equal(mk("nodur", "- look: iso\n").B.pad.lead, 1.45, "no duration line: normal pads");
  assert.equal(mk("nobrief", null).B.pad.tail, 1.35, "no BRIEF.md: normal pads");
  // a note on the duration line is not a duration: only the value with its unit counts (parentheses are notes)
  for (const [name, line] of [["noteother", "8 s (Other, under the 30 s floor)"], ["notemin", "6 s (minimal teaser)"], ["noteratio", "5 s, 9:16"], ["noteunder", "5 s (under 1 min)"], ["notebold", "**Duration:** 3 to 8 seconds"]])
    assert.equal(mk(name, `- duration: ${line}\n`).B.pad.lead, 0.2, `a short film keeps its 0.2 s pads: ${line}`);
  for (const [name, line] of [["longother", "45 s (under 1 min)"], ["longratio", "60 s, 9:16"], ["longmin", "2 min (a short 9:16 cut)"], ["longsecs", "10 s (under 30 s floor)"]])
    assert.equal(mk(name, `- duration: ${line}\n`).B.pad.lead, 1.45, `a long film keeps the normal pads: ${line}`);
  // a duration line that cannot be read (no value with a unit) is a WARN and the normal pads, never silence
  for (const [name, line] of [["unreadable", "tbd"], ["clock", "1:30"]]) {
    s = mk(name, `- duration: ${line}\n`);
    assert.equal(s.B.pad.lead, 1.45, `unreadable duration: normal pads (${line})`);
    assert.match(s.p.stdout, /WARN: .*duration/, `unreadable duration warns (${line})`);
  }
  // BRIEF.md exists but cannot be read (here a directory): WARN, normal pads, exit 0
  { const d = path.join(tmp, "briefdir"), a = path.join(d, "audio"); fs.mkdirSync(path.join(d, "BRIEF.md"), { recursive: true }); fs.mkdirSync(a, { recursive: true });
    fs.copyFileSync(path.join(A, "narration.wav"), path.join(a, "narration.wav")); fs.writeFileSync(path.join(a, "words.json"), JSON.stringify(words));
    fs.writeFileSync(path.join(a, "beats.json"), JSON.stringify({ duration: 2, audio_file: "narration.wav", beats: [], sections: [] }));
    const p = spawnSync(process.execPath, [S("pad_voice.mjs"), d], { encoding: "utf8" });
    assert.equal(p.status, 0, p.stderr); assert.match(p.stdout, /WARN: BRIEF\.md cannot be read \(EISDIR\)/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(a, "beats.json"), "utf8")).pad.lead, 1.45, "unreadable BRIEF.md: normal pads, never the short ones"); }
  console.log("pad-voice: ok");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
