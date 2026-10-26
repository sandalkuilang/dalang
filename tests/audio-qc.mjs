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
    const project = (name, { narr, bedDb, html }) => {
      const dir = path.join(tmp, name);
      fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
      fs.mkdirSync(path.join(dir, "assets"));
      fs.writeFileSync(path.join(dir, "audio", "narration.wav"), wav(narr, RATE));
      fs.writeFileSync(path.join(dir, "audio", "words.json"), JSON.stringify(wordSpans.map(([start, end], i) => ({ i, text: "w", start, end }))));
      fs.writeFileSync(path.join(dir, "narration.txt"), TEXT + "\n");
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
