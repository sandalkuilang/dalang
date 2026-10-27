#!/usr/bin/env node
// node tests/strips.mjs — scripts/strips.mjs against fixture projects: the shot table (or the beat list) read into
// frame times, the index of frame → sheet, row, column → time → shot, and the tiling of stills captured elsewhere.
// The capture path (`hyperframes snapshot`) needs a composition and Chrome, so it is not run here: --dry-run and
// --frames cover everything but the call itself. The tiling case runs only where ffmpeg does.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const strips = fileURLToPath(new URL("../scripts/strips.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-strips-"));
const run = (args) => new Promise((resolve) => execFile(process.execPath, [strips, ...args], (e, out, err) => resolve({ code: e ? e.code : 0, out, err })));
const has = (cmd, ...a) => !spawnSync(cmd, a, { stdio: "ignore" }).error;
const mk = (name) => { const p = path.join(tmp, name); fs.mkdirSync(p, { recursive: true }); return p; };
const index = (proj) => fs.readFileSync(path.join(proj, "review", "strips", "index.md"), "utf8").split("\n")
  .filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
  .map(([frame, sheet, row, col, time, shot, beat, note, change, diff]) => ({ frame: +frame, sheet, row: +row, col: +col, time: +time, shot, beat, note, change, diff }));
const sheets = (proj) => fs.readdirSync(path.join(proj, "review", "strips")).filter((f) => /^strip-\d+\.jpg$/.test(f)).sort();

const storyboard = `# Storyboard

The arc: hook, cause, payoff.

| Section | Axis |
|---|---|
| open | left to right |

| # | Time | Beat | Job · emotion | What we see |
|---|---|---|---|---|
| 1 | 0.00–1.60 | \`hook\` | A · establish | the hero |
| 2 | 1.60-4.00 | \`why\` | B · explain | the cause |
| 3 | 4.00 – 6.00 | \`end\` | A · payoff | the result |
`;

try {
  // 1. Storyboard, dry run: nine frames, three per shot, two shots to a sheet of six.
  const sb = mk("storyboard");
  fs.writeFileSync(path.join(sb, "storyboard.md"), storyboard);
  let r = await run([sb, "--dry-run", "--per-sheet", "6"]);
  assert.equal(r.code, 0, r.err);
  let rows = index(sb);
  assert.equal(rows.length, 9);
  const want = [0.16, 0.8, 1.44, 1.84, 2.8, 3.76, 4.2, 5, 5.8];
  rows.forEach((x, i) => assert.ok(Math.abs(x.time - want[i]) < 1e-9, `frame ${i + 1} at ${x.time}, wanted ${want[i]}`));
  assert.deepEqual(rows.map((x) => x.shot), ["1", "1", "1", "2", "2", "2", "3", "3", "3"]);
  assert.deepEqual([...new Set(rows.map((x) => x.beat))], ["hook", "why", "end"], "beat names carry no backticks");
  assert.deepEqual(rows.map((x) => x.sheet), [...Array(6).fill("strip-01.jpg"), ...Array(3).fill("strip-02.jpg")]);
  assert.equal(`${rows[4].row}/${rows[4].col}`, "2/2", "frame 5 is shot 2's middle still: row 2, column 2");
  console.log("ok  storyboard table → nine frames, times, rows and columns");

  // 2. Beats fallback: an untimed beat is no shot; the last timed beat runs to the duration.
  const bt = mk("beats");
  fs.mkdirSync(path.join(bt, "audio"));
  fs.writeFileSync(path.join(bt, "audio", "beats.json"), JSON.stringify({ duration: 5, beats: [{ name: "a", start: 0 }, { name: "b", start: null }, { name: "c", start: 2 }] }));
  r = await run([bt, "--per-shot", "1", "--dry-run"]);
  assert.equal(r.code, 0, r.err);
  rows = index(bt);
  assert.deepEqual(rows.map((x) => x.time), [1, 3.5]);
  assert.deepEqual(rows.map((x) => x.beat), ["a", "c"]);
  console.log("ok  beats.json fallback → two frames");

  // 3. Nothing to read.
  r = await run([mk("empty"), "--dry-run"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Usage/);
  console.log("ok  no storyboard, no beats → exit 1 with usage");

  // 3b. Stills that match no shot time (captured before the times moved): exit 2 with a message, no crash, no sheets.
  const stale = mk("stale");
  fs.writeFileSync(path.join(stale, "frame-01-at-9s.png"), "x");
  fs.writeFileSync(path.join(stale, "contact-sheet.jpg"), "x");
  r = await run([sb, "--frames", stale]);
  assert.equal(r.code, 2, `no still within 10 ms of any shot time exits 2: ${r.err}`);
  assert.match(r.err, /no still .*within 10 ms/i);
  assert.doesNotMatch(r.err, /TypeError|at .*strips\.mjs/);
  r = await run([sb, "--frames", mk("none")]);
  assert.equal(r.code, 2, r.err);
  assert.match(r.err, /No stills named/);
  console.log("ok  stills that match no shot time → exit 2 with a message, not a crash");

  // 3c. A beats.json that is valid JSON but not an object is no shot list: exit 1 with usage, not a TypeError.
  const nb = mk("nullbeats");
  fs.mkdirSync(path.join(nb, "audio"));
  fs.writeFileSync(path.join(nb, "audio", "beats.json"), "null");
  r = await run([nb, "--dry-run"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Usage/);
  console.log("ok  beats.json of null → exit 1 with usage");

  // 4. Tiling stills captured elsewhere (--frames).
  if (!has("ffmpeg", "-version")) console.log("tiling case skipped: ffmpeg not found");
  else {
    const fr = mk("frames");
    want.forEach((t, i) => {
      if (t === 2.8) return; // the still that is missing
      const f = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=64x36", "-frames:v", "1", path.join(fr, `frame-0${i + 1}-at-${t}s.png`)]);
      assert.equal(f.status, 0, String(f.stderr));
    });
    fs.copyFileSync(path.join(fr, "frame-01-at-0.16s.png"), path.join(fr, "contact-sheet.jpg")); // snapshot's own sheet is no frame
    r = await run([sb, "--frames", fr, "--per-sheet", "6"]);
    assert.equal(r.code, 3, `a missing still exits 3: ${r.err}`);
    assert.match(r.out, /WARN.*2\.8/);
    assert.deepEqual(sheets(sb), ["strip-01.jpg", "strip-02.jpg"]);
    rows = index(sb);
    assert.match(rows.find((x) => x.time === 2.8).note, /missing/);
    assert.equal(rows.filter((x) => /missing/.test(x.note)).length, 1);
    if (has("ffprobe", "-version")) {
      const dim = (f) => spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(sb, "review", "strips", f)]).stdout.toString().trim();
      assert.equal(dim("strip-01.jpg"), "1440,540", "three 480 px stills across, two 16:9 rows");
      assert.equal(dim("strip-02.jpg"), "1440,270");
    }
    r = await run([sb, "--frames", fr, "--per-sheet", "12"]);
    assert.equal(r.code, 3, r.err);
    assert.deepEqual(sheets(sb), ["strip-01.jpg"], "a smaller rerun leaves no stale sheet");
    // The other side: stamps rounded by the snapshot (within 10 ms) still match, so nothing is missing.
    const near = mk("near");
    want.forEach((t, i) => fs.copyFileSync(path.join(fr, "frame-01-at-0.16s.png"), path.join(near, `frame-0${i + 1}-at-${(t + 0.004).toFixed(3)}s.png`)));
    r = await run([sb, "--frames", near]);
    assert.equal(r.code, 0, `stamps 4 ms off still match: ${r.err}${r.out}`);
    assert.equal(index(sb).filter((x) => /missing/.test(x.note)).length, 0);
    console.log("ok  tiling: stamps within 10 ms match");
    console.log("ok  tiling: a missing still is a black cell and a WARN, sheets are numbered, stale sheets go");

    // 4b. --crops: one zoomed subject crop per shot, from the still nearest the middle of the shot.
    const cropDir = path.join(sb, "review", "strips");
    const crops = () => fs.readdirSync(cropDir).filter((f) => /^crop-\d+\.jpg$/.test(f)).sort();
    const idx = () => fs.readFileSync(path.join(cropDir, "index.md"), "utf8");
    r = await run([sb, "--frames", near, "--crops"]);
    assert.equal(r.code, 0, r.err + r.out);
    assert.deepEqual(crops(), ["crop-01.jpg", "crop-02.jpg", "crop-03.jpg"]);
    assert.match(r.out, /3 subject crops/);
    assert.match(idx(), /## Subject crops/);
    assert.equal(idx().split("\n").filter((l) => /^crop-\d+\.jpg:/.test(l)).length, 3);
    assert.match(idx(), /full-res still/);
    if (has("ffprobe", "-version")) {
      const cdim = (f) => spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(cropDir, f)]).stdout.toString().trim();
      assert.equal(cdim("crop-01.jpg"), "640,360", "centre half of a 16:9 still, 640 wide");
      r = await run([sb, "--frames", near, "--crops", "--crop", "0,0,0.5,1"]);
      assert.equal(r.code, 0, r.err + r.out);
      assert.equal(cdim("crop-02.jpg"), "640,720", "the aspect follows the box");
    }
    r = await run([sb, "--frames", near]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(crops(), [], "a rerun without --crops leaves no stale crop");
    assert.doesNotMatch(idx(), /Subject crops/);
    r = await run([sb, "--frames", fr, "--crops"]);
    assert.equal(r.code, 3, r.err + r.out);
    assert.match(r.out, /WARN: no crop for shot 2/);
    assert.deepEqual(crops(), ["crop-01.jpg", "crop-03.jpg"], "no crop for the shot whose middle still is missing");
    r = await run([sb, "--frames", near]); // clean again
    for (const bad of ["0.8,0,0.5,1", "a,b", "0,0,0,1", "-0.1,0,0.5,0.5"]) {
      r = await run([sb, "--frames", near, "--crops", "--crop", bad]);
      assert.equal(r.code, 1, `--crop ${bad}: ${r.err}`);
      assert.match(r.err, /Usage|--crop/);
    }
    r = await run([sb, "--crops", "--dry-run"]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(crops(), [], "--dry-run writes no crop");
    console.log("ok  --crops: one crop per shot, box validated, stale crops go, a missing still is a WARN");

    // 5. --against: each frame labelled against the previous round (unchanged / changed (targeted) / changed (not targeted)).
    const png = (file, lavfi) => { const f = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", lavfi, "-frames:v", "1", file]); assert.equal(f.status, 0, String(f.stderr)); };
    const grey = "color=c=0x808080:s=64x36";
    const prev = mk("prev");
    fs.mkdirSync(path.join(prev, "frames"));
    want.forEach((t, i) => png(path.join(prev, "frames", `frame-0${i + 1}-at-${t}s.png`), grey));
    const cur = mk("cur");
    want.forEach((t, i) => png(path.join(cur, `frame-0${i + 1}-at-${t}s.png`),
      t === 2.8 ? "color=c=white:s=64x36" : t === 5 ? `${grey},drawbox=x=10:y=10:w=6:h=6:color=white:t=fill` : t === 0.8 ? "color=c=0x818181:s=64x36" : grey));
    const expect = (what, t5, t8) => {
      const l = index(sb).map((q) => q.change);
      assert.equal(l[4], t5, `${what}: frame 5`);
      assert.equal(l[7], t8, `${what}: frame 8`);
      l.forEach((c, i) => { if (i !== 4 && i !== 7) assert.equal(c, "unchanged", `${what}: frame ${i + 1}`); });
    };
    r = await run([sb, "--frames", cur, "--against", prev, "--targets", "2"]);
    assert.equal(r.code, 0, r.err + r.out);
    expect("shot number", "changed (targeted)", "changed (not targeted)");
    assert.match(fs.readFileSync(path.join(sb, "review", "strips", "index.md"), "utf8"), /Possible regressions[^\n]*frame 8/);
    assert.match(r.out, /FLAG: frame 8/);
    r = await run([sb, "--frames", cur, "--against", prev, "--targets", "why"]);
    assert.equal(r.code, 0, r.err);
    expect("beat name", "changed (targeted)", "changed (not targeted)");
    r = await run([sb, "--frames", cur, "--against", prev, "--targets", "3"]);
    assert.equal(r.code, 0, r.err);
    expect("other shot", "changed (not targeted)", "changed (targeted)");
    r = await run([sb, "--frames", cur, "--against", prev, "--targets", "1"]);
    assert.equal(r.code, 0, r.err);
    expect("quiet shot", "changed (not targeted)", "changed (not targeted)");
    assert.match(r.out, /WARN: targeted shot 1 shows no change/);
    r = await run([sb, "--frames", cur, "--against", path.join(prev, "frames"), "--targets", "2"]);
    assert.equal(r.code, 0, r.err);
    expect("no frames/ subfolder", "changed (targeted)", "changed (not targeted)");
    for (const [name, args] of [
      ["--against without --targets", ["--against", prev]],
      ["--targets without --against", ["--targets", "2"]],
      ["a target that matches nothing", ["--against", prev, "--targets", "nosuch"]],
      ["its own out dir", ["--against", path.join(sb, "review", "strips"), "--targets", "2"]],
      ["--dry-run", ["--against", prev, "--targets", "2", "--dry-run"]],
    ]) {
      r = await run([sb, "--frames", cur, ...args]);
      assert.equal(r.code, 1, `${name}: ${r.err}`);
      assert.match(r.err, /Usage|--targets|--against/, name);
    }
    // Round 3 after a repeated `mv` onto an existing folder: the last round sits inside it, so it is refused.
    const old = mk("old");
    fs.cpSync(cur, path.join(old, "frames"), { recursive: true }); // round 1: differs from every later round
    fs.cpSync(path.join(prev, "frames"), path.join(old, "strips", "frames"), { recursive: true }); // round 2, moved in by the repeated mv
    r = await run([sb, "--frames", cur, "--against", old, "--targets", "2"]);
    assert.equal(r.code, 1, r.err + r.out);
    assert.match(r.err, /older round/);
    // The legitimate side: the nested round itself is a fine baseline.
    r = await run([sb, "--frames", cur, "--against", path.join(old, "strips"), "--targets", "2"]);
    assert.equal(r.code, 0, r.err);
    expect("round 3 against round 2", "changed (targeted)", "changed (not targeted)");
    const cur2 = mk("cur2");
    fs.readdirSync(cur).filter((f) => !/at-2\.8s/.test(f)).forEach((f) => fs.copyFileSync(path.join(cur, f), path.join(cur2, f)));
    r = await run([sb, "--frames", cur2, "--against", prev, "--targets", "2"]);
    assert.equal(r.code, 3, r.err + r.out);
    assert.equal(index(sb)[4].change, "-");
    console.log("ok  --against: three labels, beat or shot targets, usage errors, a missing still is not compared");
  }
  console.log("OK");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
