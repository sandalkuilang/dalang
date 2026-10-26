#!/usr/bin/env node
// Audio QC (scripts/audio_qc.mjs): the music bed's level under the narration at the gain the composition gives it,
// clicks and digital dropouts with their time, and voice drift per sentence. Fixture audio is generated here (sine
// "voices", no binary files). The pure functions always run; the CLI cases run where ffmpeg runs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "scripts", "audio_qc.mjs");
const q = await import(script);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-audioqc-"));

const tone = (freq, secs, amp, rate) => {
  const x = new Float32Array(Math.round(secs * rate));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return x;
};
const silence = (secs, rate) => new Float32Array(Math.round(secs * rate));
const concat = (...parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const wav = (x, rate) => {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return b;
};
const db = (d) => 10 ** (d / 20);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} ± ${tol}`);

const hasFfmpeg = (() => {
  const r = spawnSync("ffmpeg", ["-version"]);
  return !(r.error && r.error.code === "ENOENT") && r.status === 0;
})();

try {
  // 1. Bed level: a bed 30 dB under the voice is inaudible, 15 dB is fine, 4 dB masks the words.
  {
    const rate = 16000, narr = tone(220, 4, 0.3, rate);
    const speech = [[0.2, 3.8]];
    for (const [under, verdict] of [[30, "inaudible"], [15, "ok"], [4, "masks"]]) {
      const g = q.bedGap({ narr, bed: tone(880, 4, 0.3 * db(-under), rate), rate, speech });
      assert.equal(g.verdict, verdict, `bed ${under} dB under`);
      near(g.gapDb, under, 0.5, `gap at ${under} dB`);
    }
    const noSpans = q.bedGap({ narr, bed: tone(880, 4, 0.3 * db(-30), rate), rate });
    assert.equal(noSpans.verdict, "inaudible", "no word spans: speech = narration frames above -45 dBFS");
    console.log("ok  bedGap: 30 dB under = inaudible, 15 = ok, 4 = masks (with and without word spans)");
  }

  // 2. The gain the composition gives the bed: data-volume x the volume lane, clip-local, held at both ends.
  {
    const lane = [{ t: 0, v: 1 }, { t: 2, v: 0.2 }];
    near(q.gainAt(0.5, lane, 1), 0.3, 1e-9, "gainAt midpoint");
    near(q.gainAt(0.5, lane, -3), 0.5, 1e-9, "gainAt before the first point");
    near(q.gainAt(0.5, lane, 9), 0.1, 1e-9, "gainAt after the last point");
    near(q.gainAt(0.7, null, 1), 0.7, 1e-9, "gainAt with no lane");
    const rate = 16000, narr = tone(220, 4, 0.3, rate);
    const bed = q.applyGain(tone(880, 4, 0.3 * db(-10), rate), rate, 0, db(-5), null, narr.length);
    const g = q.bedGap({ narr, bed, rate, speech: [[0.2, 3.8]] });
    near(g.gapDb, 15, 0.5, "a bed at -10 dB with data-volume -5 dB sits 15 dB under");
    const late = q.applyGain(tone(880, 1, 0.5, rate), rate, 2, 1, null, 4 * rate);
    assert.equal(late.length, 4 * rate);
    assert.equal(late[rate], 0, "zeros before the clip's data-start");
    assert.ok(Math.abs(late[Math.round(2.25 * rate)]) > 0 || Math.abs(late[Math.round(2.25 * rate) + 7]) > 0);
    console.log("ok  gainAt / applyGain: volume x lane, held at both ends, clip placed at data-start");
  }

  // 3. A single-sample spike is one click at its time; a clean tone has none.
  {
    const rate = 48000, x = tone(220, 3, 0.3, rate);
    assert.deepEqual(q.findClicks(x, rate), []);
    x[Math.round(1.234 * rate)] = 0.95;
    const c = q.findClicks(x, rate);
    assert.equal(c.length, 1, "one event for the spike up and back");
    near(c[0].t, 1.234, 0.005, "click time");
    console.log("ok  findClicks: one spike -> one event at 1.234 s, a clean tone -> none");
  }

  // 4. Dropouts: 20 ms of digital zero inside a tone; a 1 s pause is not one; with word spans only a hole inside a word.
  {
    const rate = 48000, x = tone(220, 3, 0.3, rate);
    x.fill(0, Math.round(1.5 * rate), Math.round(1.52 * rate));
    const d = q.findDropouts(x, rate);
    assert.equal(d.length, 1);
    near(d[0].t, 1.5, 0.005, "dropout time");
    near(d[0].dur, 0.02, 0.003, "dropout length");
    const gap = concat(tone(220, 1, 0.3, rate), silence(1, rate), tone(220, 1, 0.3, rate));
    assert.deepEqual(q.findDropouts(gap, rate), [], "a 1 s pause is not a dropout");
    const pause = concat(tone(220, 1, 0.3, rate), silence(0.1, rate), tone(220, 1, 0.3, rate));
    assert.equal(q.findDropouts(pause, rate).length, 1, "without word spans a short hole between sounds is a dropout");
    assert.deepEqual(q.findDropouts(pause, rate, [[0, 1], [1.1, 2.1]]), [], "with word spans a hole between words is a pause");
    console.log("ok  findDropouts: a 20 ms hole is found, pauses are not (word spans decide when given)");
  }

  // 5. Pitch by autocorrelation.
  {
    near(q.f0Of(tone(150, 1, 0.3, 16000), 16000), 150, 2, "150 Hz");
    near(q.f0Of(tone(200, 1, 0.3, 16000), 16000), 200, 2, "200 Hz");
    assert.equal(q.f0Of(silence(1, 16000), 16000), null, "silence has no pitch");
    console.log("ok  f0Of: 150 Hz and 200 Hz tones, silence is unvoiced");
  }

  // 6. Voice drift: four one-second sentences, the third pitched up 5 semitones -> only that one is flagged.
  {
    const rate = 16000, up = 150 * 2 ** (5 / 12);
    const sentences = [150, 150, up, 150].map((f, k) => {
      const x = tone(f, 1, 0.3, rate);
      return { n: k + 1, start: k, end: k + 1, text: `Sentence ${k + 1}.`, f0: q.f0Of(x, rate), centroid: q.centroidOf(x, rate) };
    });
    const v = q.voiceFlags(sentences);
    assert.equal(v.flags.length, 1);
    assert.equal(v.flags[0].n, 3);
    near(v.flags[0].semitones, 5, 0.3, "semitones");
    const steady = q.voiceFlags(sentences.filter((s) => s.n !== 3));
    assert.deepEqual(steady.flags, []);
    console.log("ok  voiceFlags: sentence 3 up 5 semitones is flagged alone, a steady take is not");
  }

  // 7. Sentences from narration.txt match the words.json order; a mismatch is null; phrases split at a pause.
  {
    const words = ["One", "two", "Three", "four", "five", "Six"].map((t, i) => ({ i, text: t, start: i, end: i + 0.5 }));
    const s = q.sentencesFrom("One two. Three {four five|b}!\n[soft] Six.", words);
    assert.equal(s.length, 3);
    assert.deepEqual(s.map((x) => [x.n, x.start, x.end]), [[1, 0, 1.5], [2, 2, 4.5], [3, 5, 5.5]]);
    assert.equal(q.sentencesFrom("One two. Three four five!", words), null);
    const timed = [0, 0.3, 1.0, 1.3].map((t, i) => ({ i, text: "w", start: t, end: t + 0.2 }));
    const p = q.phrasesFrom(timed, 0.3);
    assert.deepEqual(p.map((x) => [x.n, x.start]), [[1, 0], [2, 1.0]]);
    console.log("ok  sentencesFrom / phrasesFrom: same split as the retake, mismatch is null, phrases split at a pause");
  }

  // 8. <audio> tags: the automation lane in single quotes and HTML-escaped in double quotes.
  {
    const lane = '{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":1},{"t":2.5,"v":0.35}]}]}';
    const html = `<audio id="music" src="assets/a.wav" data-start="2" data-volume="0.5" data-automation='${lane}'></audio>
      <audio id='narration' src='audio/n.wav'></audio>
      <audio id="bgm" src="b.wav" data-automation="${lane.replace(/"/g, "&quot;")}"></audio>`;
    const tags = q.audioTags(html);
    assert.equal(tags.length, 3);
    assert.deepEqual([tags[0].id, tags[0].src, tags[0].start, tags[0].volume], ["music", "assets/a.wav", 2, 0.5]);
    assert.deepEqual(q.laneOf(tags[0].automation), [{ t: 0, v: 1 }, { t: 2.5, v: 0.35 }]);
    assert.deepEqual([tags[1].id, tags[1].start, tags[1].volume, tags[1].automation], ["narration", 0, 1, null]);
    assert.deepEqual(q.laneOf(tags[2].automation), [{ t: 0, v: 1 }, { t: 2.5, v: 0.35 }]);
    assert.throws(() => q.laneOf("{not json"));
    console.log("ok  audioTags / laneOf: both quote styles, the escaped lane, defaults");
  }

  // 8b. <source src> children, data-duration / data-media-start / data-playback-rate are read.
  {
    const html = `<audio id="music"><source src="assets/m.ogg" type="audio/ogg"><source src="assets/m.mp3"></audio>
      <audio id="sfx" src="s.wav" data-start="1" data-duration="0.3" data-media-start="0.5" data-playback-rate="2"></audio>
      <audio id="bgm-2" src="b.wav" />`;
    const tags = q.audioTags(html);
    assert.equal(tags.length, 3);
    assert.equal(tags[0].src, "assets/m.ogg", "the first <source> child gives the src when the tag has none");
    assert.deepEqual([tags[1].duration, tags[1].mediaStart, tags[1].rate], [0.3, 0.5, 2]);
    assert.deepEqual([tags[2].src, tags[2].duration, tags[2].mediaStart, tags[2].rate], ["b.wav", null, 0, 1], "a self-closed tag does not borrow the next tag's <source>");
    console.log("ok  audioTags: <source> children, data-duration, data-media-start, data-playback-rate");
  }

  // 8c. Which <audio> tags are the music bed: an anchored name, every cue, never an SFX that merely contains 'bed'/'music'.
  {
    const t = (id, src) => ({ id, src });
    const names = (tags) => q.musicTags(tags).map((x) => x.id || x.src);
    assert.deepEqual(names([t("sfx-embed", "assets/embedded-hit.wav"), t("bedroom", "assets/bedroom-amb.wav"), t("creak", "assets/bed-creak.wav"), t("box", "assets/music-box.wav"), t("narration", "audio/narration.wav")]), [], "SFX that contain bed/music inside a longer word or phrase are not the bed");
    assert.deepEqual(names([t("music", "assets/x.wav"), t("music-a", "a.wav"), t("music2", "b.wav"), t("bgm_b", "c.wav"), t("", "assets/background-music.mp3"), t("", "assets/bed.wav")]), ["music", "music-a", "music2", "bgm_b", "assets/background-music.mp3", "assets/bed.wav"], "every music cue counts");
    assert.deepEqual(names([t("sfx-embed", "assets/embedded-hit.wav"), t("music", "assets/music.wav")]), ["music"], "the real bed after an SFX is found");
    console.log("ok  musicTags: anchored names, all cues, SFX with 'bed' or 'music' inside a longer name are left out");
  }

  // 8d. applyGain: data-duration cuts the clip, data-media-start skips into the file.
  {
    const rate = 1000, x = Float32Array.from({ length: 4000 }, (_, i) => (i < 1000 ? 0.1 : 0.5));
    const cut = q.applyGain(x, rate, 0, 1, null, 4000, { dur: 1.5 });
    near(cut[1400], 0.5, 1e-6, "inside data-duration"); assert.equal(cut[1600], 0, "nothing after data-duration");
    const skip = q.applyGain(x, rate, 0, 1, null, 4000, { mediaStart: 1 });
    near(skip[0], 0.5, 1e-6, "the file is entered at data-media-start");
    near(q.applyGain(x, rate, 0, 1, null, 4000)[0], 0.1, 1e-6, "default: from the file start");
    console.log("ok  applyGain: data-duration cuts, data-media-start skips in");
  }

  // 8e. voiceFlags says when it could not judge (under 3 voiced units).
  {
    const mk = (n, f0) => ({ n, start: n, end: n + 1, text: "t", f0, centroid: 500 });
    assert.equal(q.voiceFlags([mk(1, 150), mk(2, 150 * 2 ** (5 / 12))]).judged, false, "two voiced sentences judge nothing");
    assert.equal(q.voiceFlags([mk(1, 150), mk(2, 150), mk(3, null), mk(4, null)]).judged, false, "unvoiced sentences do not count");
    assert.equal(q.voiceFlags([mk(1, 150), mk(2, 150), mk(3, 150)]).judged, true);
    console.log("ok  voiceFlags: judged is false under 3 voiced sentences, true from 3");
  }

  // 8f. The class 'unknown reported as OK': the Result is made in one place, and OK needs an outcome for every check.
  {
    const v = (o) => q.verdict({ flags: [], notChecked: [], done: [], absent: [], ...o });
    let r = v({ done: ["bed", "clicks"] });
    assert.equal(r.exit, 2, "a check with no recorded outcome (here the voice) is NOT CHECKED, never OK");
    assert.match(r.text, /NOT CHECKED: voice/);
    r = v({ done: ["clicks", "voice"] });
    assert.equal(r.exit, 2, "a bed that was neither measured nor found absent is NOT CHECKED");
    assert.doesNotMatch(r.text, /OK|no bed/);
    r = v({ done: ["bed", "clicks", "voice"] });
    assert.equal(r.exit, 0); assert.match(r.text, /^OK — bed audible/);
    r = v({ done: ["clicks", "voice"], absent: ["bed"] });
    assert.equal(r.exit, 0); assert.match(r.text, /^OK — no bed in the film/);
    r = v({ done: ["bed", "clicks", "voice"], notChecked: ["mix"] });
    assert.equal(r.exit, 2); assert.match(r.text, /NOT CHECKED: mix/);
    r = v({ done: ["bed"], flags: ["x"] });
    assert.equal(r.exit, 3); assert.match(r.text, /1 flag/); assert.match(r.text, /NOT CHECKED: clicks, voice/);
    console.log("ok  verdict: OK only when bed, clicks and voice each have an outcome; a missing one is NOT CHECKED");
  }

  // 8g. tagRoles: every <audio> is narration, a bed, an SFX (at most THRESHOLDS.sfxMaxS long) or unknown; never dropped.
  {
    const t = (id, src, o = {}) => ({ id, src, start: 0, volume: 1, duration: null, mediaStart: 0, rate: 1, automation: null, bad: [], ...o });
    const lens = { "assets/lofi-calm.wav": 60, "track.wav": 45, "assets/bed-creak.wav": 0.3, "assets/whoosh.wav": 30, "assets/x.wav": 60 };
    const lengthOf = (tag) => (tag.src in lens ? lens[tag.src] : { why: "not found" });
    const narr = t("narration", "audio/narration.wav");
    const tags = [narr, t("music-bed", "assets/lofi-calm.wav"), t("bgm-chill", "track.wav"), t("hit", "assets/hit.wav", { duration: 0.3 }),
      t("creak", "assets/bed-creak.wav"), t("whoosh", "assets/whoosh.wav", { duration: 2 }), t("gone", "assets/gone.wav"),
      t("tmpl", "assets/x.wav", { bad: ["data-duration"] }), t("music", "assets/x.wav"), t("", "")];
    const roles = Object.fromEntries(q.tagRoles(tags, narr, lengthOf).map((r) => [r.tag.id || "(none)", r.role]));
    assert.deepEqual(roles, { narration: "narration", "music-bed": "unknown", "bgm-chill": "unknown", hit: "sfx", creak: "sfx", whoosh: "sfx", gone: "unknown", tmpl: "unknown", music: "bed", "(none)": "unknown" });
    assert.equal(q.tagRoles([narr, t("long", "assets/x.wav", { duration: q.THRESHOLDS.sfxMaxS + 1 })], narr, lengthOf)[1].role, "unknown", "a clip longer than an SFX is never assumed to be one");
    console.log("ok  tagRoles: a long or unreadable <audio> that is not named as music is unknown, never 'no bed'; short clips are SFX");
  }

  // 8h. A bare boolean attribute reaches the tag: `loop` (no value, empty, or quoted), also next to unquoted values.
  {
    const tags = q.audioTags(`<audio id="a" src="a.wav" loop></audio><audio id="b" src="b.wav" data-start=2 loop="" data-duration=3></audio>
      <audio id='c' src='c.wav' LOOP data-volume="0.5" /><audio id="d" src="d.wav"></audio>`);
    assert.deepEqual(tags.map((x) => x.loop), [true, true, true, false], "loop is read as a bare boolean, in any case");
    assert.deepEqual([tags[1].start, tags[1].duration], [2, 3], "unquoted values are read");
    assert.equal(tags[2].volume, 0.5);
    console.log("ok  audioTags: a bare loop attribute is read (bare, empty, upper case), unquoted values too");
  }

  // 8i. loop in tagRoles and applyGain: a loop tag without a short data-duration is never an SFX; a bed wraps across the film.
  {
    const t = (id, src, o = {}) => ({ id, src, start: 0, volume: 1, duration: null, mediaStart: 0, rate: 1, automation: null, bad: [], loop: false, ...o });
    const lengthOf = () => 6;
    const narr = t("narration", "audio/narration.wav");
    const role = (tag) => q.tagRoles([narr, tag], narr, lengthOf)[1].role;
    assert.equal(role(t("amb", "assets/amb.wav")), "sfx", "a 6 s clip that does not loop is an SFX");
    assert.equal(role(t("amb", "assets/amb.wav", { loop: true })), "unknown", "the same clip with loop plays to the end of the film: unknown, never an SFX");
    assert.equal(role(t("amb", "assets/amb.wav", { loop: true, duration: q.THRESHOLDS.sfxMaxS + 1 })), "unknown");
    assert.equal(role(t("amb", "assets/amb.wav", { loop: true, duration: 2 })), "sfx", "loop cut by a short data-duration is an SFX");
    assert.equal(role(t("music", "assets/amb.wav", { loop: true })), "bed", "a loop clip with a music name is the bed");
    const one = new Float32Array([1, 2, 3, 4]);
    assert.deepEqual(Array.from(q.applyGain(one, 1, 1, 1, null, 12, { loop: true })), [0, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3], "a looped clip repeats to the end of the film");
    assert.deepEqual(Array.from(q.applyGain(one, 1, 1, 1, null, 12, { loop: true, dur: 6 })), [0, 1, 2, 3, 4, 1, 2, 0, 0, 0, 0, 0], "data-duration cuts the loop");
    assert.deepEqual(Array.from(q.applyGain(one, 1, 1, 1, null, 8)), [0, 1, 2, 3, 4, 0, 0, 0], "without loop the clip plays once");
    // --music values are bed cues, whatever the name; the rest is still classified
    const lens = { "a.wav": 60, "b.wav": 60, "c.wav": 60 };
    const L = (tag) => lens[tag.src];
    const ts = [narr, t("lofi-a", "a.wav"), t("lofi-b", "b.wav"), t("lofi-c", "c.wav")];
    const by = (music) => Object.fromEntries(q.tagRoles(ts, narr, L, music).map((r) => [r.tag.id, r.role]));
    assert.deepEqual(by(["lofi-a"]), { narration: "narration", "lofi-a": "bed", "lofi-b": "unknown", "lofi-c": "unknown" }, "a bed not named stays unknown");
    assert.deepEqual(by(["lofi-a", "b.wav", "lofi-c"]), { narration: "narration", "lofi-a": "bed", "lofi-b": "bed", "lofi-c": "bed" }, "every value counts, by id or src");
    console.log("ok  tagRoles / applyGain: loop is never an SFX and a looped bed wraps; every --music value is a bed, the rest stays unknown");
  }

  // 8j. The render inputs HyperFrames applies to a tag: an audible <video>, the group bus, data-end, fades, fx chain, hidden.
  {
    const html = `<div id="root" data-composition-id="main" data-fx-chain='{"nodes":[]}'>
      <hf-audio-group id="bus" data-volume="0.25" data-hidden></hf-audio-group><hf-audio-group id="b2" data-volume="x" data-fx-chain='{"a":1}'/>
      <audio id="m" src="m.wav" data-audio-group="bus" data-end="3" data-start="1" data-duration="9" data-fade-in="0.5" data-fade-out="-1" data-fx-chain='{"x":1}'></audio>
      <video id="v1" src="a.mp4" data-has-audio="true"><source src="ignored.mp4"></video><video id="v2" src="b.mp4" data-has-audio="true" muted></video>
      <video id="v3" src="c.mp4" data-has-audio="false"></video><video src="d.mp4" data-has-audio="true"></video><video id="v4" src="e.mp4"></video>
      <video id="v5" data-has-audio="true"><source src="s.mp4"></video><audio id="after" src="after.wav"></audio></div>`;
    const tags = q.audioTags(html), by = Object.fromEntries(tags.map((x) => [x.id, x]));
    assert.deepEqual(tags.map((x) => x.id), ["m", "v1", "", "v4", "v5", "after"], "every <video> that is neither muted nor data-has-audio other than true is a source of sound (HyperFrames compiles in its id and data-has-audio)");
    assert.deepEqual([by.m.kind, by.v1.kind, by.m.end, by.m.duration, by.m.group, by.m.fadeIn, by.m.fadeOut, by.m.hidden], ["audio", "video", 3, 9, "bus", 0.5, 0, false]);
    assert.equal(by.v5.src, "s.mp4", "a <video> takes the src of its <source> child");
    assert.equal(by.after.src, "after.wav", "the tag after a video with a <source> child is read on its own");
    assert.equal(q.clipLength(by.m), 2, "data-end wins over data-duration, minus data-start");
    assert.equal(q.clipLength(by.after), null);
    const groups = q.groupsOf(html);
    assert.deepEqual([groups.get("bus").volume, groups.get("bus").hidden, groups.get("b2").volume, groups.get("b2").fx], [0.25, true, 1, '{"a":1}']);
    assert.equal(q.masterFxChain(html), '{"nodes":[]}');
    assert.equal(q.masterFxChain('<div data-composition-id="x"><audio id="a" data-fx-chain="{}"></audio></div>'), null, "an fx chain on a tag is not the master's");
    assert.match(q.notRendered(by.m, groups), /group "bus" is data-hidden/);
    assert.equal(q.notRendered(by.after, groups), null);
    assert.ok(q.notRendered({ ...by.after, end: 0, start: 0, bad: [] }), "an end at the start is not rendered");
    assert.ok(q.renderProblem(by.m, new Map()), "a data-fx-chain is not modelled");
    assert.equal(q.renderProblem(by.after, groups), null, "a plain tag has no problem");
    assert.match(q.renderProblem({ ...by.after, fadeOut: 1 }, groups), /data-fade-out/, "a fade-out without a clip end");
    assert.equal(q.renderProblem({ ...by.after, fadeOut: 1, duration: 5 }, groups), null, "a fade-out with a clip end is modelled");
    assert.ok(q.renderProblem({ ...by.after, mediaStart: 1 }, groups, { narration: true }), "a narration with a media start");
    assert.equal(q.renderProblem({ ...by.after, mediaStart: 1 }, groups), null, "a bed's media start is modelled");
    assert.equal(q.busGain(by.m, groups), 0.25); assert.equal(q.busGain(by.after, groups), 1);
    // fades are linear and clip-local; the pair is scaled down when longer than the clip; a fade-out needs the clip's end
    const ones = new Float32Array(10).fill(1);
    const f = Array.from(q.applyGain(ones, 1, 0, 1, null, 10, { dur: 10, fadeIn: 4, fadeOut: 4 }));
    near(f[0], 0, 1e-9, "fade-in starts at 0"); near(f[2], 0.5, 1e-9, "fade-in halfway"); near(f[4], 1, 1e-9, "full between the fades");
    near(f[8], 0.5, 1e-9, "fade-out halfway"); near(f[9], 0.25, 1e-9, "fade-out near the end");
    const clamp = Array.from(q.applyGain(ones, 1, 0, 1, null, 10, { dur: 4, fadeIn: 4, fadeOut: 4 }));
    near(clamp[1], 0.5, 1e-9, "fades longer than the clip are scaled to fit (2 s + 2 s)");
    assert.deepEqual(Array.from(q.applyGain(ones, 1, 0, 1, null, 10, { fadeOut: 4 })), Array.from(ones), "without a clip end there is no fade-out to place");
    const roles = q.tagRoles(tags, null, () => 1, [], groups).map((r) => [r.tag.id, r.role]);
    assert.deepEqual(roles, [["m", "skipped"], ["v1", "unknown"], ["", "unknown"], ["v4", "unknown"], ["v5", "unknown"], ["after", "sfx"]], "a video with sound is unknown, a tag on a hidden bus is skipped");
    assert.equal(q.tagRoles(tags, null, () => 1, ["v1"], groups)[1].role, "bed", "--music names a video as the bed");
    console.log("ok  audioTags / groupsOf / masterFxChain / notRendered / renderProblem / applyGain: video sound, bus, data-end, fades, fx chain, hidden");
  }

  // 8k. The class rule: every input of HyperFrames' mix is modelled, known not to change the mix, or makes the tag's level
  // unknown. An attribute outside the inventory, an ancestor the check cannot see, a lane it does not model, all fail closed.
  {
    const base = { kind: "audio", id: "music", src: "m.wav", start: 0, end: null, volume: 1, duration: null, mediaStart: 0, rate: 1, automation: null, bad: [], loop: false, group: null, fx: null, fadeIn: 0, fadeOut: 0, hidden: false, unmodelled: [], context: null };
    const tagOf = (attrs) => q.audioTags(`<audio id="music" src="m.wav" ${attrs}></audio>`)[0];
    for (const attrs of ['data-whatever="1"', 'data-playback-start="2"', 'data-hf-group-render-id="g"', "data-mute", 'data-volume="8"', 'data-volume="-1"']) {
      assert.ok(q.renderProblem(tagOf(attrs)), `${attrs} is an input this check does not model`);
      assert.equal(q.tagRoles([tagOf(attrs)].map((t) => ({ ...t, id: "lofi" })), null, () => 60)[0].role, "unknown", `${attrs}: a long clip with it is unknown, never an SFX or 'no bed'`);
    }
    for (const attrs of ['class="a"', 'style="x"', 'data-hf-id="h1"', 'data-track-index="2"', 'data-layer="1"', 'preload="auto"', 'crossorigin="anonymous"', 'aria-label="m"', 'data-volume="3.9"']) {
      assert.equal(q.renderProblem(tagOf(attrs)), null, `${attrs} does not change the mix`);
    }
    assert.equal(q.tagRoles([{ ...tagOf('data-whatever="1"'), id: "hit", duration: 1 }], null, () => 60)[0].role, "sfx", "a clip of at most sfxMaxS is never the bed, whatever it carries");
    // ancestors: a data-hidden one or a <template> is a state the check cannot see without a DOM; a closed one is not an ancestor
    const ctx = (html) => q.audioTags(html).map((t) => [t.id, t.context]);
    assert.deepEqual(ctx(`<div data-hidden><p><audio id="a" src="a.wav"></audio></p></div><audio id="b" src="b.wav"></audio>`).map(([id, c]) => [id, !!c]), [["a", true], ["b", false]]);
    assert.ok(ctx(`<template><audio id="a" src="a.wav"></audio></template>`)[0][1], "inside a <template>");
    assert.deepEqual(ctx(`<div data-hidden/><audio id="a" src="a.wav"></audio>`).map(([, c]) => !!c), [true], "a self-closed <div/> stays open in HTML");
    assert.ok(q.renderProblem({ ...base, context: "is inside <div data-hidden>" }), "a hidden ancestor: NOT CHECKED, never measured");
    assert.deepEqual(q.audioTags(`<!-- <audio id="music" src="m.wav"></audio> --><script>const s = '<audio id="x" src="x.wav">';</script><audio id="b" src="b.wav"></audio>`).map((t) => t.id), ["b"], "a comment or a script string is not a tag");
    assert.equal(q.masterFxChain(`<!-- <div data-composition-id="old" data-fx-chain="{}"> --><div data-composition-id="main"></div>`), null, "a commented-out root is not the master");
    // the bus has the same inventory
    const g = q.groupsOf(`<hf-audio-group id="bus" data-volume="1" data-mystery="x"></hf-audio-group><hf-audio-group id="ok" data-label="Music" class="b"></hf-audio-group>`);
    assert.ok(q.renderProblem({ ...base, group: "bus" }, g), "a bus with an attribute outside the inventory");
    assert.equal(q.renderProblem({ ...base, group: "ok" }, g), null, "a bus with inert attributes");
    // lanes: only a volume lane of straight segments in HyperFrames' format is modelled
    const lane = (lanes, version = 1) => JSON.stringify({ version, lanes });
    for (const [what, a] of [["a rate lane", lane([{ target: "rate", points: [{ t: 0, v: 2 }] }])], ["an fx lane", lane([{ target: "fx.carve.gain", points: [{ t: 0, v: -20 }] }])],
      ["a curve point", lane([{ target: "volume", points: [{ t: 0, v: 1, curve: 0.5 }, { t: 2, v: 0.2 }] }])], ["a via point", lane([{ target: "volume", points: [{ t: 0, v: 1, viaX: 0.2, viaY: 0.8 }, { t: 2, v: 0.2 }] }])],
      ["a point that is not numbers", lane([{ target: "volume", points: [{ t: 0, v: "1" }] }])], ["another version", lane([{ target: "volume", points: [{ t: 0, v: 1 }] }], 2)], ["a gain over HyperFrames' maximum", lane([{ target: "volume", points: [{ t: 0, v: 9 }] }])]]) {
      assert.throws(() => q.laneOf(a), undefined, what);
    }
    assert.deepEqual(q.laneOf(lane([{ target: "volume", points: [{ t: 2, v: 0.5 }, { t: 0, v: 1, curve: 0 }] }])), [{ t: 0, v: 1, curve: 0 }, { t: 2, v: 0.5 }], "a straight lane is modelled, sorted");
    assert.equal(q.laneOf(lane([])), null);
    // duplicated attributes: the first value is read, like the DOM, and the tag is not modelled (media and bus alike)
    const dupTag = q.audioTags('<audio id="music" src="m.wav" data-volume="0.5" data-volume="1" DATA-VOLUME="2"></audio>')[0];
    assert.equal(dupTag.volume, 0.5, "the first value of a duplicated attribute is read");
    assert.ok(q.renderProblem(dupTag), "a duplicated attribute: not modelled");
    assert.ok(q.renderProblem(tagOf('class="a" class="b"')), "a duplicated inert attribute is not modelled either");
    assert.equal(q.renderProblem(tagOf('class="a" data-volume="1"')), null, "distinct attributes still pass");
    assert.ok(q.renderProblem({ ...base, group: "d" }, q.groupsOf('<hf-audio-group id="d" data-volume="1" data-volume="0.01"></hf-audio-group>')), "a bus with a duplicated attribute");
    // scripts: one token rule, no parsing of JS forms. Any script whose text has volume, muted, playbackRate, gain or fx may change the mix
    const none = () => ({ why: "x" }), scriptOf = (text, attrs = {}) => q.scriptProblem([{ attrs, text }], ".", none);
    for (const code of ['tl.to("#music", { volume: 0.1 }, 2)', "el.volume = 0.2", "const { volume } = opts; duck(volume);", "a.muted = true", "a.playbackRate = 2", "node.gain.value = 0", "ctx.fx.carve()", "// the volume: set in the lane"]) assert.match(scriptOf(code) || "", /script may change the mix; check the bed by ear on the draft/, code);
    for (const code of ['tl.to("#title", { opacity: 1 }, 0)', "const volumes = 1; const mutedColor = 2; gains(); fxx();", 'fetch("https://x.test/a")']) assert.equal(scriptOf(code), null, code);
    assert.equal(q.scriptProblem([{ attrs: { type: "application/json" }, text: '{"volume": 1}' }], ".", none), null, "a JSON block is data, not a script");
    assert.match(q.scriptProblem([{ attrs: { src: "js/a.js" }, text: "" }], "/p", () => ({ text: "export const f = () => { gain(0); };" })) || "", /may change the mix/, "a local script file is read");
    console.log("ok  the class rule: an attribute outside the inventory, a hidden or <template> ancestor, a lane or a script volume the check does not model = not modelled; inert ones pass");
  }

  // 9. No interpreter anywhere in the script.
  {
    const src = fs.readFileSync(script, "utf8");
    assert.ok(!/python|numpy|\.py\b/i.test(src), "the script uses Node and ffmpeg only");
    console.log("ok  the script names no Python, numpy or .py file");
  }

  // ── CLI cases ─────────────────────────────────────────────────────────────
  if (!hasFfmpeg) {
    console.log("skip CLI cases: no ffmpeg");
  } else {
    const RATE = 48000;
    const TEXT = "One two three. Four five six. Seven eight nine. Ten eleven twelve.";
    // Four sentences of three words; word w is 0.3 s of tone at w * 0.35 s, with 0.05 s of digital silence after it.
    const wordSpans = [];
    for (let w = 0; w < 12; w++) wordSpans.push([w * 0.35, w * 0.35 + 0.3]);
    const voice = (freqs, mutate) => {
      const parts = [];
      for (let s = 0; s < 4; s++) for (let k = 0; k < 3; k++) parts.push(tone(freqs[s], 0.3, 0.3, RATE), silence(0.05, RATE));
      const x = concat(...parts);
      return mutate ? mutate(x) : x;
    };
    const project = (name, { narr, bedDb, html, text, nWords }) => {
      const dir = path.join(tmp, name);
      fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
      fs.mkdirSync(path.join(dir, "assets"));
      fs.writeFileSync(path.join(dir, "audio", "narration.wav"), wav(narr, RATE));
      fs.writeFileSync(path.join(dir, "audio", "words.json"), JSON.stringify(wordSpans.slice(0, nWords ?? 12).map(([start, end], i) => ({ i, text: "w", start, end }))));
      fs.writeFileSync(path.join(dir, "narration.txt"), (text ?? TEXT) + "\n");
      if (bedDb != null) fs.writeFileSync(path.join(dir, "assets", "music.wav"), wav(tone(880, 4.5, 0.3 * db(-bedDb), RATE), RATE));
      fs.writeFileSync(path.join(dir, "index.html"), html ?? `<div id="root">
  <audio id="narration" src="audio/narration.wav" data-start="0" data-volume="1"></audio>
  ${bedDb != null ? '<audio id="music" src="assets/music.wav" data-start="0" data-volume="1"></audio>' : ""}
</div>`);
      return dir;
    };
    const run = (dir, args = [], env = process.env) => spawnSync(process.execPath, [script, dir, ...args], { encoding: "utf8", env });
    const steady = [150, 150, 150, 150];

    // 10. The bed 30 dB under the voice is flagged; 15 dB under is fine.
    {
      let r = run(project("bed30", { narr: voice(steady), bedDb: 30 }));
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stdout, /FLAG \(P1\)\s*:.*bed inaudible/);
      r = run(project("bed15", { narr: voice(steady), bedDb: 15 }));
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /Result\s*: OK/);
      console.log("ok  CLI: bed 30 dB under -> exit 3 'bed inaudible'; 15 dB under, clean voice -> exit 0 OK");
    }

    // 11. A single-sample spike at 1.234 s and a 20 ms hole inside a word are reported at their times.
    {
      const spike = voice(steady, (x) => { x[Math.round(1.234 * RATE)] = 0.95; return x; });
      let r = run(project("click", { narr: spike, bedDb: 15 }));
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stdout, /click at 0:01\.2/);
      const hole = voice(steady, (x) => { x.fill(0, Math.round(1.1 * RATE), Math.round(1.12 * RATE)); return x; });
      r = run(project("hole", { narr: hole, bedDb: 15 }));
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stdout, /dropout at 0:01\.1/);
      console.log("ok  CLI: a spike -> 'click at 0:01.2', a hole inside a word -> 'dropout at 0:01.1', both exit 3");
    }

    // 11b. --mix scans the mix file too: a clean mix adds no flag, a spike in the mix alone is reported against the mix.
    {
      const dir = project("mix", { narr: voice(steady), bedDb: 15 });
      const bed = tone(880, 4.2, 0.3 * db(-15), RATE), mixed = voice(steady).map((v, i) => v + bed[i]);
      fs.writeFileSync(path.join(dir, "mix.wav"), wav(mixed, RATE));
      let r = run(dir, ["--mix", "mix.wav"]);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /Clicks\s*:.*mix\.wav none/);
      mixed[Math.round(2.2 * RATE)] += 0.6;
      fs.writeFileSync(path.join(dir, "mix.wav"), wav(mixed, RATE));
      r = run(dir, ["--mix", "mix.wav"]);
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stdout, /click at 0:02\.2 in mix\.wav/);
      assert.match(r.stdout, /audio\/narration\.wav none/);
      r = run(dir, ["--mix", "missing.mp4"]);
      assert.equal(r.status, 2, "a mix that cannot be read is NOT CHECKED, never OK: " + r.stdout);
      assert.match(r.stdout, /NOT CHECKED: mix/);
      console.log("ok  CLI: --mix scans the mix (clean = no flag, a spike = a click in mix.wav), an unreadable mix = exit 2 NOT CHECKED");
    }

    // 12. A sentence pitched up 5 semitones is flagged with its number.
    {
      const r = run(project("drift", { narr: voice([150, 150, 150 * 2 ** (5 / 12), 150]), bedDb: 15 }));
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stdout, /sentence 3 /);
      assert.doesNotMatch(r.stdout, /sentence [124] at/);
      assert.match(r.stdout, /--retake 3/);
      console.log("ok  CLI: sentence 3 up 5 semitones -> flagged with its number and --retake 3");
    }

    // 13. A film with no music <audio> is a valid choice: an INFO line, not a flag. No Python on PATH either.
    {
      const bin = path.join(tmp, "bin-only-ffmpeg");
      fs.mkdirSync(bin);
      for (const t of ["ffmpeg", "ffprobe"]) {
        const w = spawnSync("sh", ["-c", `command -v ${t}`], { encoding: "utf8" }).stdout.trim();
        if (w.startsWith("/")) fs.symlinkSync(w, path.join(bin, t));
      }
      let r = run(project("nobed", { narr: voice(steady), bedDb: null }), [], { ...process.env, PATH: bin });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /INFO\s*:\s*bed: no music/);
      r = run(project("bed15b", { narr: voice(steady), bedDb: 15 }), [], { ...process.env, PATH: bin });
      assert.equal(r.status, 0, "with only ffmpeg and ffprobe on PATH: " + r.stdout + r.stderr);
      console.log("ok  CLI: no music <audio> is an INFO; a PATH holding only ffmpeg and ffprobe still passes (no Python)");
    }

    // 13b. A bed the script cannot read is NOT CHECKED (exit 2), never 'no bed in the film'.
    {
      const bedHtml = (audio) => `<div id="root"><audio id="narration" src="audio/narration.wav" data-start="0"></audio>${audio}</div>`;
      // index.html unreadable (a directory: EISDIR, also for root) with a bed 40 dB under
      let dir = project("htmlerr", { narr: voice(steady), bedDb: 40 });
      fs.rmSync(path.join(dir, "index.html")); fs.mkdirSync(path.join(dir, "index.html"));
      let r = run(dir);
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stdout, /NOT CHECKED: [^\n]*bed/);
      assert.doesNotMatch(r.stdout, /no bed in the film|no index\.html|bed: no music/, "an unreadable index.html is never 'no bed'");
      r = run(dir, ["--mix", "mix.wav"]);
      assert.match(r.stdout, /mix not checked: index\.html could not be read/, "the mix is lined up with the words by the narration's data-start: unknown when index.html is unreadable");
      // no index.html at all: the bed is unknown unless --music names it
      dir = project("nohtml", { narr: voice(steady), bedDb: 15 });
      fs.rmSync(path.join(dir, "index.html"));
      r = run(dir);
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stdout, /NOT CHECKED: [^\n]*bed/);
      r = run(dir, ["--music", "assets/music.wav"]);
      assert.equal(r.status, 0, "--music names the bed: " + r.stdout + r.stderr);
      // the src on a <source> child
      dir = project("source40", { narr: voice(steady), bedDb: 40, html: bedHtml('<audio id="music"><source src="assets/music.wav" type="audio/wav"></audio>') });
      r = run(dir);
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stdout, /bed inaudible/);
      dir = project("source15", { narr: voice(steady), bedDb: 15, html: bedHtml('<audio id="music"><source src="assets/music.wav"></audio>') });
      r = run(dir);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /bed audible/);
      // a music tag whose src is not in the HTML at all
      dir = project("nosrc", { narr: voice(steady), bedDb: 15, html: bedHtml('<audio id="music" data-start="0"></audio>') });
      r = run(dir);
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stdout, /NOT CHECKED: [^\n]*bed/);
      // a gain the script cannot compute: a template expression, a lane that is not JSON, a playback rate
      for (const [name, attrs] of [["tmplvol", 'data-volume="{{vol}}"'], ["badlane", "data-automation='{not json'"], ["rate2", 'data-playback-rate="2"']]) {
        dir = project(name, { narr: voice(steady), bedDb: 15, html: bedHtml(`<audio id="music" src="assets/music.wav" ${attrs}></audio>`) });
        r = run(dir);
        assert.equal(r.status, 2, name + ": " + r.stdout + r.stderr);
        assert.match(r.stdout, /NOT CHECKED: [^\n]*bed/, name);
      }
      console.log("ok  CLI: an unreadable index.html, a <source> bed with no readable src, an unreadable gain = exit 2 NOT CHECKED; a <source> bed is measured (40 dB flagged, 15 dB OK)");
    }

    // 13c. The bed is chosen by an anchored name and every cue counts.
    {
      const html = (tags) => `<div id="root"><audio id="narration" src="audio/narration.wav" data-start="0"></audio>${tags}</div>`;
      const withFiles = (name, tags, files) => {
        const dir = project(name, { narr: voice(steady), bedDb: null, html: html(tags) });
        for (const [f, x] of Object.entries(files)) fs.writeFileSync(path.join(dir, "assets", f), wav(x, RATE));
        return dir;
      };
      const bedTone = (secs, under) => tone(880, secs, 0.3 * db(-under), RATE);
      // an SFX whose id/src contains 'bed' or 'music' before the real bed: neither is the bed
      let r = run(withFiles("sfxbed", `<audio id="sfx-embed" src="assets/embedded-hit.wav" data-start="1" data-duration="0.3"></audio>
        <audio id="bedroom-amb" src="assets/bed-creak.wav" data-start="2"></audio>
        <audio id="music" src="assets/music.wav"></audio>`, { "embedded-hit.wav": tone(300, 0.3, 0.001, RATE), "bed-creak.wav": tone(300, 0.3, 0.001, RATE), "music.wav": bedTone(4.5, 15) }));
      assert.equal(r.status, 0, "SFX named like a bed are not measured as the bed: " + r.stdout + r.stderr);
      assert.match(r.stdout, /music\.wav/);
      assert.doesNotMatch(r.stdout, /embedded-hit|bed-creak/);
      // two cues, each 15 dB under: the whole film is covered, not only the first cue
      const cues = `<audio id="music-a" src="assets/music-a.wav" data-start="0"></audio><audio id="music-b" src="assets/music-b.wav" data-start="1"></audio>`;
      r = run(withFiles("cues15", cues, { "music-a.wav": bedTone(1, 15), "music-b.wav": bedTone(3.5, 15) }));
      assert.equal(r.status, 0, "two cues 15 dB under: " + r.stdout + r.stderr);
      assert.match(r.stdout, /music-a\.wav/); assert.match(r.stdout, /music-b\.wav/);
      // two cues, both 40 dB under: still flagged
      r = run(withFiles("cues40", cues, { "music-a.wav": bedTone(1, 40), "music-b.wav": bedTone(3.5, 40) }));
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stdout, /bed inaudible/);
      // data-duration cuts the cue: a file cut after 0.5 s leaves the rest of the film without a bed
      r = run(withFiles("dur", `<audio id="music" src="assets/music.wav" data-duration="0.5"></audio>`, { "music.wav": bedTone(4.5, 15) }));
      assert.equal(r.status, 3, "data-duration is honoured: " + r.stdout + r.stderr);
      console.log("ok  CLI: SFX named like a bed are not the bed; two cues are both measured; data-duration is honoured");
    }

    // 13e. A bed whose name the script does not know is NOT CHECKED (name it with --music), never 'no bed in the film'.
    {
      const html = (tags) => `<div id="root"><audio id="narration" src="audio/narration.wav" data-start="0"></audio>${tags}</div>`;
      const withFiles = (name, tags, files) => {
        const dir = project(name, { narr: voice(steady), bedDb: null, html: html(tags) });
        for (const [f, x] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), wav(x, RATE));
        return dir;
      };
      const bedTone = (secs, under) => tone(880, secs, 0.3 * db(-under), RATE);
      let dir = withFiles("musicbed40", `<audio id="music-bed" src="assets/lofi-calm.wav" data-volume="1"></audio>`, { "assets/lofi-calm.wav": bedTone(12, 40) });
      let r = run(dir);
      assert.equal(r.status, 2, "an unknown name is never OK: " + r.stdout + r.stderr);
      assert.match(r.stdout, /NOT CHECKED: [^\n]*bed/);
      assert.match(r.stdout, /--music/);
      assert.doesNotMatch(r.stdout, /no bed in the film/);
      r = run(dir, ["--music", "music-bed"]);
      assert.equal(r.status, 3, "named with --music, the same bed is measured: " + r.stdout + r.stderr);
      assert.match(r.stdout, /bed inaudible/);
      r = run(withFiles("bgmchill", `<audio id="bgm-chill" src="track.wav"></audio>`, { "track.wav": bedTone(12, 40) }));
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.doesNotMatch(r.stdout, /no bed in the film/);
      // an unknown long clip next to a named cue: the bed's sum is incomplete, so NOT CHECKED too
      r = run(withFiles("cueplus", `<audio id="music" src="assets/music.wav"></audio><audio id="lofi" src="assets/lofi.wav"></audio>`, { "assets/music.wav": bedTone(4.5, 15), "assets/lofi.wav": bedTone(12, 15) }));
      assert.equal(r.status, 2, r.stdout + r.stderr);
      // the legitimate side: narration and short SFX only is a film without a bed (OK), measured or by data-duration
      dir = withFiles("sfxonly", `<audio id="hit" src="assets/hit.wav" data-start="1" data-duration="0.3"></audio><audio id="whoosh" src="assets/whoosh.wav" data-start="2"></audio>`,
        { "assets/hit.wav": tone(300, 0.3, 0.1, RATE), "assets/whoosh.wav": tone(300, 1.5, 0.1, RATE) });
      r = run(dir);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /no bed in the film/);
      r = run(withFiles("bed15named", `<audio id="music-bed" src="assets/lofi-calm.wav"></audio>`, { "assets/lofi-calm.wav": bedTone(12, 15) }), ["--music", "music-bed"]);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      console.log("ok  CLI: an unknown bed name (music-bed, bgm-chill) = exit 2 NOT CHECKED, measured once --music names it; SFX only = OK no bed");
    }

    // 13f. loop and a repeated --music: unknown is NOT CHECKED (exit 2), never OK, whatever the other tags say.
    {
      const html = (tags) => `<div id="root"><audio id="narration" src="audio/narration.wav" data-start="0"></audio>${tags}</div>`;
      const withFiles = (name, tags, files) => {
        const dir = project(name, { narr: voice(steady), bedDb: null, html: html(tags) });
        for (const [f, x] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), wav(x, RATE));
        return dir;
      };
      const bedTone = (secs, under) => tone(880, secs, 0.3 * db(-under), RATE);
      // a loop clip of 6 s, 40 dB under, unknown name: not an SFX, so the bed is NOT CHECKED
      let r = run(withFiles("loop40", `<audio id="amb" src="assets/amb.wav" loop></audio>`, { "assets/amb.wav": bedTone(6, 40) }));
      assert.equal(r.status, 2, "a loop clip with an unknown name is never OK: " + r.stdout + r.stderr);
      assert.match(r.stdout, /NOT CHECKED: [^\n]*bed/);
      assert.doesNotMatch(r.stdout, /no bed in the film/);
      r = run(withFiles("loopempty", `<audio id="amb" src="assets/amb.wav" loop=""></audio>`, { "assets/amb.wav": bedTone(6, 40) }));
      assert.equal(r.status, 2, r.stdout + r.stderr);
      // the legitimate side: the same clip without loop is an SFX (OK, no bed); loop cut by a short data-duration too
      r = run(withFiles("noloop40", `<audio id="amb" src="assets/amb.wav"></audio>`, { "assets/amb.wav": bedTone(6, 40) }));
      assert.equal(r.status, 0, r.stdout + r.stderr);
      r = run(withFiles("loopdur", `<audio id="amb" src="assets/amb.wav" loop data-duration="2"></audio>`, { "assets/amb.wav": bedTone(1, 40) }));
      assert.equal(r.status, 0, r.stdout + r.stderr);
      // a whitelisted bed that loops is measured across the film: 1 s of file, 15 dB under, is not silence after its first pass
      r = run(withFiles("loop15", `<audio id="music" src="assets/music.wav" loop></audio>`, { "assets/music.wav": bedTone(1, 15) }));
      assert.equal(r.status, 0, "a looped 15 dB bed fills the film: " + r.stdout + r.stderr);
      r = run(withFiles("loop40m", `<audio id="music" src="assets/music.wav" loop></audio>`, { "assets/music.wav": bedTone(1, 40) }));
      assert.equal(r.status, 3, "a looped 40 dB bed is still flagged: " + r.stdout + r.stderr);
      // two unknown beds with --music naming one: the other stays unknown
      const two = `<audio id="lofi-a" src="assets/a.wav"></audio><audio id="lofi-b" src="assets/b.wav"></audio>`;
      const files = (under) => ({ "assets/a.wav": bedTone(12, under), "assets/b.wav": bedTone(12, under) });
      r = run(withFiles("two40", two, files(40)), ["--music", "lofi-a"]);
      assert.equal(r.status, 2, "one bed named, one not: " + r.stdout + r.stderr);
      assert.match(r.stdout, /NOT CHECKED: [^\n]*bed/);
      assert.match(r.stdout, /lofi-b/);
      assert.match(r.stdout, /--music <id> \(repeatable\)/);
      r = run(withFiles("two15", two, files(15)), ["--music", "lofi-a"]);
      assert.equal(r.status, 2, "a bed at an audible level is not a reason to skip the other: " + r.stdout + r.stderr);
      // --music is repeatable: every bed named is measured
      r = run(withFiles("two40b", two, files(40)), ["--music", "lofi-a", "--music", "assets/b.wav"]);
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stdout, /bed inaudible/);
      r = run(withFiles("two15b", two, files(15)), ["--music", "lofi-a", "--music", "lofi-b"]);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /a\.wav/); assert.match(r.stdout, /b\.wav/);
      // a long tag neither named nor whitelisted next to a whitelisted bed and --music: still unknown
      r = run(withFiles("namedplus", `<audio id="music" src="assets/music.wav"></audio><audio id="lofi-a" src="assets/a.wav"></audio><audio id="lofi-b" src="assets/b.wav"></audio>`,
        { "assets/music.wav": bedTone(4.5, 15), "assets/a.wav": bedTone(12, 15), "assets/b.wav": bedTone(12, 15) }), ["--music", "lofi-a"]);
      assert.equal(r.status, 2, r.stdout + r.stderr);
      // a whitelisted bed is still measured next to a --music one
      r = run(withFiles("namedboth", `<audio id="music" src="assets/music.wav"></audio><audio id="lofi-a" src="assets/a.wav"></audio>`,
        { "assets/music.wav": bedTone(4.5, 15), "assets/a.wav": bedTone(12, 15) }), ["--music", "lofi-a"]);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /music\.wav/); assert.match(r.stdout, /a\.wav/);
      console.log("ok  CLI: an unknown loop clip = exit 2; a looped bed wraps across the film; --music repeats and an unnamed unknown bed stays NOT CHECKED");
    }

    // 13g. Render inputs the model leaves out must never read as OK: an audio group bus, an audible <video>, data-end, an fx
    // chain (also the master one), fades. Each is modelled or NOT CHECKED (exit 2); the legitimate neighbour still passes.
    {
      const html = (tags, root = "") => `<div id="root"${root}><audio id="narration" src="audio/narration.wav" data-start="0"></audio>${tags}</div>`;
      const bedTone = (secs, under) => tone(880, secs, 0.3 * db(-under), RATE);
      const make = (name, tags, files = {}, root = "") => {
        const dir = project(name, { narr: voice(steady), bedDb: null, html: html(tags, root) });
        for (const [f, x] of Object.entries({ "assets/music.wav": bedTone(4.5, 15), ...files })) fs.writeFileSync(path.join(dir, f), wav(x, RATE));
        return dir;
      };
      const music = (attrs = "") => `<audio id="music-a" src="assets/music.wav" ${attrs}></audio>`;
      const bus = (attrs = "") => `<hf-audio-group id="musicbus" ${attrs}></hf-audio-group>`;
      const fx = `data-fx-chain='{"version":1,"nodes":[{"type":"gain","db":-40}]}'`;
      const notChecked = (r, what) => { assert.equal(r.status, 2, what + ": " + r.stdout + r.stderr); assert.match(r.stdout, /NOT CHECKED: [^\n]*bed/, what); assert.doesNotMatch(r.stdout, /OK —|no bed in the film/, what); };
      // (1) the group bus: its data-volume multiplies the member's
      let r = run(make("grp-quiet", bus('data-volume="0.01"') + music('data-audio-group="musicbus"')));
      assert.equal(r.status, 3, "a bus at 0.01 puts a 15 dB bed 55 dB under: " + r.stdout + r.stderr);
      assert.match(r.stdout, /bed inaudible/);
      r = run(make("grp-unity", bus('data-volume="1"') + music('data-audio-group="musicbus"')));
      assert.equal(r.status, 0, "a bus at 1 changes nothing: " + r.stdout + r.stderr);
      r = run(make("grp-half", bus('data-volume="0.5"') + music('data-audio-group="musicbus"'), { "assets/music.wav": bedTone(4.5, 12) }));
      assert.equal(r.status, 0, "a bus at 0.5 puts a 12 dB bed 18 dB under: " + r.stdout + r.stderr);
      assert.match(r.stdout, /sits 1[78]\.\d dB under/);
      r = run(make("grp-other", bus('data-volume="0.01"') + music('data-audio-group="elsewhere"')));
      assert.equal(r.status, 0, "a bus that does not hold the bed is not applied to it: " + r.stdout + r.stderr);
      notChecked(run(make("grp-lane", bus(`data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0.01}]}]}'`) + music('data-audio-group="musicbus"'))), "a bus lane");
      notChecked(run(make("grp-fx", bus(fx) + music('data-audio-group="musicbus"'))), "a bus fx chain");
      r = run(make("grp-hidden", bus("data-hidden") + music('data-audio-group="musicbus"')));
      assert.equal(r.status, 0, "a hidden bus is not rendered, so there is no bed: " + r.stdout + r.stderr);
      assert.match(r.stdout, /not rendered/);
      r = run(project("grp-narr", { narr: voice(steady), bedDb: 15, html: `<div id="root"><hf-audio-group id="voicebus" data-volume="0.01"></hf-audio-group><audio id="narration" data-audio-group="voicebus" src="audio/narration.wav"></audio><audio id="music" src="assets/music.wav"></audio></div>` }));
      assert.equal(r.status, 3, "the narration's bus counts too (the bed now masks the voice): " + r.stdout + r.stderr);
      assert.match(r.stdout, /bed masks words/);
      // (2) an audible <video>: its sound is mixed, so it is unknown until --music names it
      const vid = (attrs) => `<video id="clip" src="assets/clip.wav" data-start="0" data-duration="4" ${attrs}></video>`;
      const clip = { "assets/clip.wav": bedTone(4.5, 40) };
      notChecked(run(make("vid-audible", vid('data-has-audio="true"'), clip)), "an audible video");
      // HyperFrames' compile step gives every <video> an id and data-has-audio="true" unless it is muted, so these mix too
      notChecked(run(make("vid-none", vid(""), clip)), "a video with no data-has-audio (compiled to true)");
      notChecked(run(make("vid-noid", `<video src="assets/clip.wav" data-start="0" data-duration="4" data-has-audio="true"></video>`, clip)), "an audible video with no id (compiled in)");
      for (const [name, attrs] of [["vid-false", 'data-has-audio="false"'], ["vid-muted", 'data-has-audio="true" muted'], ["vid-muted-only", "muted"]]) {
        r = run(make(name, vid(attrs), { ...clip, "assets/music.wav": bedTone(4.5, 15) }));
        assert.equal(r.status, 0, `${name}: a silent video is not a source of sound: ` + r.stdout + r.stderr);
      }
      r = run(make("vid-named40", vid('data-has-audio="true"'), clip), ["--music", "clip"]);
      assert.equal(r.status, 3, "named with --music, the video's sound is measured: " + r.stdout + r.stderr);
      assert.match(r.stdout, /bed inaudible/);
      r = run(make("vid-named15", vid('data-has-audio="true"'), { "assets/clip.wav": bedTone(4.5, 15) }), ["--music", "clip"]);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      // (3) data-end cuts the clip (data-end wins over data-duration); an end at or before the start is not rendered
      r = run(make("end03", music('data-start="0" data-end="0.3"')));
      assert.equal(r.status, 3, "a bed that stops after 0.3 s leaves the speech without one: " + r.stdout + r.stderr);
      assert.match(r.stdout, /bed inaudible/);
      r = run(make("end45", music('data-start="0" data-end="4.5"')));
      assert.equal(r.status, 0, r.stdout + r.stderr);
      r = run(make("end-over-dur", music('data-start="0" data-end="4.5" data-duration="0.3"')));
      assert.equal(r.status, 0, "data-end wins over data-duration: " + r.stdout + r.stderr);
      r = run(make("end-before", music('data-start="1" data-end="0.5"')));
      assert.equal(r.status, 0, "an end before the start is not rendered: " + r.stdout + r.stderr);
      assert.match(r.stdout, /not rendered/);
      r = run(make("dur0", music('data-duration="0"')));
      assert.equal(r.status, 0, "a data-duration of 0 is not rendered: " + r.stdout + r.stderr);
      assert.match(r.stdout, /not rendered/);
      notChecked(run(make("end-bad", music('data-end="{{end}}"'))), "a data-end that is not a number");
      // (4) an fx chain (a gain, a carve) is not modelled: the bed, the narration or the master bus
      notChecked(run(make("fx-bed", music(fx))), "a bed with a data-fx-chain");
      notChecked(run(project("fx-narr", { narr: voice(steady), bedDb: 15, html: `<div id="root"><audio id="narration" src="audio/narration.wav" ${fx}></audio><audio id="music" src="assets/music.wav"></audio></div>` })), "a narration with a data-fx-chain");
      notChecked(run(make("fx-master", music(), {}, ` data-composition-id="main" ${fx}`)), "a master data-fx-chain");
      r = run(make("fx-empty", music('data-fx-chain=""'), {}, ' data-composition-id="main" data-fx-chain=""'));
      assert.equal(r.status, 0, "an empty chain is no chain: " + r.stdout + r.stderr);
      // (5) fades: linear, clip-local; a fade-out needs the clip's end
      r = run(make("fade-in-long", music('data-duration="4.5" data-fade-in="4.5"'), { "assets/music.wav": bedTone(4.5, 21) }));
      assert.equal(r.status, 3, "a fade-in over the whole bed lowers the speech-time level: " + r.stdout + r.stderr);
      assert.match(r.stdout, /bed inaudible/);
      r = run(make("nofade", music('data-duration="4.5"'), { "assets/music.wav": bedTone(4.5, 21) }));
      assert.equal(r.status, 0, "the same bed without a fade: " + r.stdout + r.stderr);
      r = run(make("fade-short", music('data-duration="4.5" data-fade-in="0.2" data-fade-out="0.5"')));
      assert.equal(r.status, 0, r.stdout + r.stderr);
      notChecked(run(make("fade-out-open", music('data-fade-out="2"'))), "a fade-out with no data-end or data-duration");
      // (6) a sub-composition's own <audio> tags are not read: unknown, never 'no bed'
      notChecked(run(make("subcomp", `<div data-composition-src="scenes/a.html" data-start="0"></div>`)), "a sub-composition");
      r = run(make("nosubcomp", `<div data-start="0"></div>`));
      assert.equal(r.status, 0, "the neighbour without a sub-composition: " + r.stdout + r.stderr);
      console.log("ok  CLI: a group bus is applied, an audible video / fx chain / a fade-out without an end = exit 2, data-end and fades are applied, nothing unknown reads OK");
    }

    // 13h. The class: whatever HyperFrames' mix reads that this check does not model is NOT CHECKED (exit 2), never OK, on
    // the real CLI; the legitimate neighbour on the other side of each rule still passes.
    {
      const html = (tags) => `<div id="root" data-composition-id="main"><audio id="narration" src="audio/narration.wav" data-start="0"></audio>${tags}</div>`;
      const bedTone = (secs, under) => tone(880, secs, 0.3 * db(-under), RATE);
      const make = (name, tags, files = {}) => {
        const dir = project(name, { narr: voice(steady), bedDb: null, html: html(tags) });
        for (const [f, x] of Object.entries({ "assets/music.wav": bedTone(4.5, 15), "assets/whoosh.wav": bedTone(1, 10), ...files })) {
          fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
          fs.writeFileSync(path.join(dir, f), typeof x === "string" ? x : wav(x, RATE));
        }
        return dir;
      };
      const music = (attrs = "") => `<audio id="music-a" src="assets/music.wav" ${attrs}></audio>`;
      const notChecked = (r, what) => { assert.equal(r.status, 2, what + ": " + r.stdout + r.stderr); assert.match(r.stdout, /NOT CHECKED: [^\n]*bed/, what); assert.doesNotMatch(r.stdout, /OK —|no bed in the film|bed audible/, what); };
      const ok = (r, what, re = /OK — bed audible/) => { assert.equal(r.status, 0, what + ": " + r.stdout + r.stderr); assert.match(r.stdout, re, what); };
      const lane = (lanes) => `data-automation='${JSON.stringify({ version: 1, lanes })}'`;
      for (const [name, tags, files, what] of [
        ["c-hidden-anc", `<div data-hidden>${music()}</div>`, {}, "a bed under a data-hidden ancestor"],
        ["c-template", `<template>${music()}</template>`, {}, "a bed inside a <template>"],
        ["c-unknown-attr", music('data-whatever="1"'), {}, "an attribute outside the inventory"],
        ["c-playback-start", music('data-playback-start="2"'), {}, "data-playback-start (read before data-media-start)"],
        ["c-rate-lane", music(lane([{ target: "rate", points: [{ t: 0, v: 2 }] }])), {}, "a rate lane"],
        ["c-curve", music(lane([{ target: "volume", points: [{ t: 0, v: 1, curve: 0.8 }, { t: 4, v: 0.1 }] }])), {}, "a curved volume lane"],
        ["c-over-max", music('data-volume="8"'), {}, "a gain over HyperFrames' maximum"],
        ["c-bus-attr", `<hf-audio-group id="mb" data-volume="1" data-mystery="x"></hf-audio-group>${music('data-audio-group="mb"')}`, {}, "a bus attribute outside the inventory"],
        ["c-tween", `${music()}<script>tl.to("#music-a", { volume: 0.02 }, 1);</script>`, {}, "an inline script tweens the volume"],
        ["c-script-file", `${music()}<script src="js/duck.js"></script>`, { "js/duck.js": 'document.getElementById("music-a").volume = 0.02;\n' }, "a local script sets the volume"],
        ["c-import", `${music()}<script type="module">import "./js/a.js";</script>`, { "js/a.js": 'import { duck } from "./b.js";\nduck();\n', "js/b.js": "export const duck = () => gsap.to('#music-a', { volume: 0 });\n" }, "an imported module tweens the volume"],
        ["c-dup-volume", music('data-volume="0.01" data-volume="1"'), {}, "a duplicated data-volume (the first is read, but a duplicate is not modelled)"],
        ["c-dup-bus", `<hf-audio-group id="mb" data-volume="1" data-volume="0.01"></hf-audio-group>${music('data-audio-group="mb"')}`, {}, "a bus with a duplicated attribute"],
        ["c-shorthand", `${music()}<script>const { volume } = cfg; duck(volume);</script>`, {}, "a script that passes volume on as a shorthand"],
        ["c-muted", `${music()}<script>document.getElementById("music-a").muted = true;</script>`, {}, "a script that mutes the bed"],
        ["c-script-missing", `${music()}<script src="js/gone.js"></script>`, {}, "a local script that cannot be read"],
      ]) notChecked(run(make(name, tags, files)), what);
      notChecked(run(project("c-narr-hidden", { narr: voice(steady), bedDb: 15, html: `<div id="root"><section data-hidden><audio id="narration" src="audio/narration.wav"></audio></section><audio id="music" src="assets/music.wav"></audio></div>` })), "the narration under a hidden ancestor");
      // the other side of each rule
      ok(run(make("k-hidden-sibling", `<div data-hidden></div>${music()}`)), "a closed data-hidden sibling is not an ancestor");
      ok(run(make("k-hidden-sfx", `<div data-hidden><audio id="whoosh" src="assets/whoosh.wav" data-duration="1"></audio></div>${music()}`)), "an SFX under a hidden ancestor is never the bed");
      ok(run(make("k-inert", music('class="a" data-hf-id="h1" data-track-index="2" data-layer="1" preload="auto"'))), "inert attributes");
      ok(run(make("k-bus-inert", `<hf-audio-group id="mb" data-volume="1" data-label="Music"></hf-audio-group>${music('data-audio-group="mb"')}`)), "a bus with a label");
      ok(run(make("k-script", `${music()}<script>// the lane carries the ducking\ntl.to("#title", { opacity: 1 }, 0);</script><script type="application/json">{"volume": 1}</script><script src="https://cdn.example.test/gsap.min.js"></script>`)), "a script without a mix token (volume, muted, playbackRate, gain, fx), a JSON block, a remote library");
      ok(run(make("k-import", `${music()}<script type="module">import "./js/a.js";</script>`, { "js/a.js": 'import { t } from "./b.js";\nt();\n', "js/b.js": "export const t = () => gsap.to('#title', { y: 10 });\n" })), "modules with no volume write");
      ok(run(make("k-comment", `<!-- ${music()} -->`)), "a commented-out bed is not in the film", /OK — no bed in the film/);
      ok(run(make("k-lane", music(lane([{ target: "volume", points: [{ t: 0, v: 1 }, { t: 4, v: 1, curve: 0 }] }])))), "a straight volume lane");
      console.log("ok  CLI: the class rule: a hidden or <template> ancestor, an attribute or lane outside the inventory, a script volume = exit 2 NOT CHECKED; each neighbour passes");
    }

    // 13d. A voice check that judged nothing is NOT CHECKED, never 'voice steady'.
    {
      const two = (f2) => concat(...[150, f2].flatMap((f) => [0, 1, 2].flatMap(() => [tone(f, 0.3, 0.3, RATE), silence(0.05, RATE)])));
      const dir = project("twosent", { narr: two(200), bedDb: 15, text: "One two three. Four five six.", nWords: 6 });
      const r = run(dir);
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stdout, /NOT CHECKED: [^\n]*voice/);
      assert.doesNotMatch(r.stdout, /voice steady/);
      console.log("ok  CLI: two sentences (one +5 st) -> the voice check is NOT CHECKED, exit 2, never 'voice steady'");
    }

    // 14. No ffmpeg: ENOENT is the one 'not found' (exit 1); an unreadable input is never 'not found'.
    {
      const empty = path.join(tmp, "bin-empty");
      fs.mkdirSync(empty);
      const r = run(project("noffmpeg", { narr: voice(steady), bedDb: 15 }), [], { ...process.env, PATH: empty });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /FAILED: ffmpeg not found/);
      console.log("ok  CLI: no ffmpeg on PATH -> exit 1 'FAILED: ffmpeg not found'");
    }
  }
  console.log("OK");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
