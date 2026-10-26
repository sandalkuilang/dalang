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
  .map(([frame, sheet, row, col, time, shot, beat, note]) => ({ frame: +frame, sheet, row: +row, col: +col, time: +time, shot, beat, note }));
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
    console.log("ok  tiling: a missing still is a black cell and a WARN, sheets are numbered, stale sheets go");
  }
  console.log("OK");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
