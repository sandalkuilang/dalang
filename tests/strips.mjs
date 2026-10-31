#!/usr/bin/env node
// node tests/strips.mjs — scripts/strips.mjs against fixture projects: the shot table (or the beat list) read into
// frame times, the index of frame → sheet, row, column → time → shot, and the tiling of stills captured elsewhere.
// The capture path (`hyperframes snapshot`) needs a composition and Chrome, so it is not run here: --dry-run and
// --frames cover everything but the call itself, and a stand-in `npx` covers the layout receiver (records posted
// during the capture). The tiling and capture cases run only where ffmpeg does.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { flagOff, flagOn, isOn, ownsPort } from "../scripts/layout_flag.mjs";

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

  // 1b. Layout numbers (canvas text): the records of layoutFrame, read from layout.json, indexed and linted per frame.
  // The page → receiver path needs Chrome, so it is not run here; the index, the lint and --layout are.
  const stripsDir = path.join(sb, "review", "strips");
  const text = () => fs.readFileSync(path.join(stripsDir, "index.md"), "utf8");
  const clean = { t: 0.16, W: 1080, H: 1920, format: "shorts", hero: { x0: 100, y0: 400, x1: 550, y1: 1100 },
    boxes: [{ kind: "caption", text: "the hero", x0: 200, y0: 1180, x1: 880, y1: 1330, size: 60 }, { kind: "label", text: "valve", x0: 600, y0: 300, x1: 800, y1: 356, size: 40 }] };
  const covered = { ...clean, t: 2.8, hero: { x0: 100, y0: 400, x1: 700, y1: 1300, clipped: true } };
  assert.match(text(), /No layout recorded/,"no layout.json: say so, never 'no faults'");
  assert.doesNotMatch(text(), /no faults|Lint \(layout_lint\.mjs\): OK/i);
  fs.writeFileSync(path.join(stripsDir, "layout.json"), JSON.stringify({ frames: [clean, covered, { ...clean, t: 9 }] }));
  r = await run([sb, "--dry-run", "--per-sheet", "6"]);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(text(), /## Layout/);
  assert.match(text(), /^- frame 1 · 0\.16 s · caption "the hero" · 200,1180–880,1330 · 60 px$/m);
  assert.match(text(), /^- frame 1 · 0\.16 s · hero · 100,400–550,1100$/m);
  assert.match(text(), /^- frame 5 · 2\.8 s · hero · 100,400–700,1300 \(clipped\)$/m);
  assert.match(text(), /^- FLAG frame 5 · .*covers/m);
  assert.equal(text().split("\n").filter((l) => /^- FLAG frame/.test(l)).length, 1, "only the covered frame is flagged");
  assert.doesNotMatch(text(), /Lint \(layout_lint\.mjs\): OK/);
  assert.match(text(), /Not recorded: frames 2, 3, 4, 6, 7, 8, 9/);
  assert.match(r.out, /FLAG: frame 5 \(shot 2, 2\.8 s\): .*covers/);
  // A clean set: OK, and a record that matches no frame (t 9) is not an error.
  fs.writeFileSync(path.join(stripsDir, "layout.json"), JSON.stringify({ frames: [clean] }));
  r = await run([sb, "--dry-run", "--per-sheet", "6"]);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(text(), /Lint \(layout_lint\.mjs\): OK/);
  assert.doesNotMatch(text(), /- FLAG/);
  assert.doesNotMatch(r.out, /FLAG/);
  // --layout <file>: another file; bad JSON is a WARN and not recorded, never "no faults".
  const bad = path.join(tmp, "bad-layout.json");
  fs.writeFileSync(bad, "{not json");
  r = await run([sb, "--dry-run", "--per-sheet", "6", "--layout", bad]);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /WARN: layout .*bad-layout\.json/);
  assert.match(text(), /No layout recorded/);
  assert.doesNotMatch(text(), /Lint \(layout_lint\.mjs\): OK/);
  const other = path.join(tmp, "other-layout.json");
  fs.writeFileSync(other, JSON.stringify({ frames: [covered] }));
  r = await run([sb, "--dry-run", "--per-sheet", "6", "--layout", other]);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(text(), /^- FLAG frame 5 · /m);
  // --layout with no file is a usage error (exit 1), not a silent fall back to the receiver; with a file it ran above.
  for (const args of [[sb, "--dry-run", "--layout"], [sb, "--dry-run", "--layout", "--per-sheet", "6"]]) {
    r = await run(args);
    assert.equal(r.code, 1, r.err + r.out);
    assert.match(r.err, /--layout needs a file/);
  }
  fs.rmSync(path.join(stripsDir, "layout.json")); // later cases reuse sb
  console.log("ok  layout: records indexed per frame, lint FLAG with its frame, clean = OK, nothing recorded is said, --layout");

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

    // 6. The capture path with a stand-in `npx` that writes the stills and posts layout records to the receiver, as the
    // page's layoutFrame does under `hyperframes snapshot`: records land in layout.json, a stale one goes, a busy port is a WARN.
    const bin = mk("bin");
    fs.writeFileSync(path.join(bin, "npx"), `#!/usr/bin/env node
const { spawnSync } = require("node:child_process"), fs = require("node:fs"), path = require("node:path");
const a = process.argv.slice(2), at = a[a.indexOf("--at") + 1].split(",").map(Number), out = a[a.indexOf("--output") + 1];
fs.mkdirSync(out, { recursive: true });
for (const t of at) spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=64x36", "-frames:v", "1", path.join(out, "frame-at-" + t + "s.png")]);
const rec = (t, hero) => ({ t, W: 1080, H: 1920, format: "shorts", hero, boxes: [{ kind: "caption", text: "the hero", x0: 200, y0: 1180, x1: 880, y1: 1330, size: 60 }] });
if (process.env.NPX_LOG) fs.appendFileSync(process.env.NPX_LOG, "x");
(async () => {
  if (process.env.NPX_FAIL_FIRST && !fs.existsSync(process.env.NPX_FAIL_FIRST)) { fs.writeFileSync(process.env.NPX_FAIL_FIRST, "1"); return; } // the first capture posts nothing
  if (process.env.NPX_SILENT) return; // the page posts nothing (no layoutFrame call, or its first post failed)
  // the page's own switch and receiver, read by the real engine/three/type.js from assets/layout_on.js
  const { layoutLive, layoutReceiver } = await import(require("node:url").pathToFileURL(path.resolve("assets/type.js")).href);
  if (!layoutLive()) return; // as type.js: only while strips turns it on
  const to = layoutReceiver + "/layout";
  if (process.env.NPX_OFFTIME) { for (const t of at) await fetch(to, { method: "POST", mode: "no-cors", body: JSON.stringify(rec(t + 0.5)) }); return; } // posts arrive, at times no shot has
  for (const t of [...at, 0.5]) await fetch(to, { method: "POST", mode: "no-cors", body: JSON.stringify(rec(t, t === 2.8 ? { x0: 100, y0: 400, x1: 700, y1: 1300 } : { x0: 100, y0: 400, x1: 550, y1: 1100 })) });
  await fetch(to, { method: "POST", body: "{not json" });
})().catch((e) => { console.error(String(e)); process.exit(1); });
`, { mode: 0o755 });
    const runWith = (args, extra = {}) => new Promise((resolve) => execFile(process.execPath, [strips, ...args], { env: { ...process.env, ...extra, PATH: `${bin}${path.delimiter}${process.env.PATH}` } }, (e, out, err) => resolve({ code: e ? e.code : 0, out, err })));
    const lay = path.join(sb, "review", "strips", "layout.json");
    fs.writeFileSync(lay, JSON.stringify({ frames: [{ ...clean, t: 5 }] })); // a stale layout of an earlier round
    const flag = path.join(sb, "assets", "layout_on.js");
    fs.mkdirSync(path.dirname(flag), { recursive: true });
    for (const f of ["layout_on.js", "type.js", "font.js"]) fs.copyFileSync(fileURLToPath(new URL(`../engine/three/${f}`, import.meta.url)), path.join(sb, "assets", f));
    r = await runWith([sb, "--per-sheet", "6"]);
    if (/port 47614 is busy/.test(r.out)) console.log("receiver case skipped: port 47614 is in use");
    else {
      assert.equal(r.code, 0, r.err + r.out);
      assert.match(fs.readFileSync(flag, "utf8"), /export default false;/, "layout_on.js is off again after the capture");
      const saved = JSON.parse(fs.readFileSync(lay, "utf8")).frames;
      assert.deepEqual(saved.map((x) => x.t), want, "one record per frame, in frame order; the stray t=0.5 and the bad body are dropped");
      assert.match(text(), /^- FLAG frame 5 · .*covers/m);
      assert.match(r.out, /FLAG: frame 5/);
      assert.doesNotMatch(text(), /Not recorded/);
      assert.equal(index(sb).length, 9);
      console.log("ok  capture: the receiver gets the records, writes layout.json, drops the stale one");
    }
    // A capture that gets no records must not index an earlier round's layout.json as this round's.
    fs.writeFileSync(lay, JSON.stringify({ frames: [clean, covered] }));
    r = await runWith([sb, "--per-sheet", "6"], { NPX_SILENT: "1" });
    if (/port 47614 is busy/.test(r.out)) console.log("silent-capture case skipped: port 47614 is in use");
    else {
      assert.equal(r.code, 0, r.err + r.out);
      assert.match(text(), /No layout recorded/, "no records this round: say so");
      assert.doesNotMatch(text(), /Lint \(layout_lint\.mjs\): OK|- FLAG frame|caption "the hero"/, "round 1's boxes and lint are not round 2's");
      assert.doesNotMatch(r.out, /FLAG/);
      assert.equal(fs.existsSync(lay), false, "the stale layout.json is removed before the capture");
      console.log("ok  capture: no records this round, an earlier round's layout.json is not indexed");
    }
    // --expect-layout: a capture with no records is retried once; without the flag, one pass.
    const logN = (p) => fs.existsSync(p) ? fs.readFileSync(p, "utf8").length : 0;
    fs.writeFileSync(lay, JSON.stringify({ frames: [clean] }));
    const log1 = path.join(tmp, "npx1.log"), log2 = path.join(tmp, "npx2.log"), log3 = path.join(tmp, "npx3.log");
    r = await runWith([sb, "--per-sheet", "6", "--expect-layout"], { NPX_FAIL_FIRST: path.join(tmp, "first.flag"), NPX_LOG: log1 });
    if (/port 47614 is busy/.test(r.out)) console.log("retry cases skipped: port 47614 is in use");
    else {
      assert.equal(r.code, 0, r.err + r.out);
      assert.match(r.out, /captured once more/);
      assert.doesNotMatch(r.out, /layout not recorded/);
      assert.equal(logN(log1), 2, "two snapshot calls");
      assert.deepEqual(JSON.parse(fs.readFileSync(lay, "utf8")).frames.map((x) => x.t), want, "the retry's records are written");
      r = await runWith([sb, "--per-sheet", "6", "--expect-layout"], { NPX_SILENT: "1", NPX_LOG: log2 });
      assert.equal(r.code, 0, r.err + r.out);
      assert.match(r.out, /WARN: layout not recorded after a retry/);
      assert.match(r.out, /receiver saw 0 post\(s\) in 2 capture\(s\)/, "the WARN says what the receiver saw: nothing posted");
      assert.equal(logN(log2), 2);
      assert.equal(fs.existsSync(lay), false);
      r = await runWith([sb, "--per-sheet", "6", "--expect-layout"], { NPX_OFFTIME: "1" });
      assert.equal(r.code, 0, r.err + r.out);
      assert.match(r.out, /receiver saw 18 post\(s\) in 2 capture\(s\), 18 valid, none within 10 ms of a shot time/, "posts arrived but at other times: said so");
      r = await runWith([sb, "--per-sheet", "6", "--expect-layout"], { NPX_LOG: path.join(tmp, "npx4.log") });
      assert.doesNotMatch(r.out, /receiver saw/, "a capture that recorded is not annotated");
      r = await runWith([sb, "--per-sheet", "6"], { NPX_SILENT: "1", NPX_LOG: log3 });
      assert.equal(r.code, 0, r.err + r.out);
      assert.equal(logN(log3), 1, "without the flag an ordinary round pays no second snapshot");
      assert.doesNotMatch(r.out, /captured once more/);
      console.log("ok  --expect-layout: a capture with no records is retried once, only with the flag");
    }
    // --layout <file> given: the receiver is not opened and the capture's own layout.json is left as it was.
    fs.writeFileSync(lay, JSON.stringify({ frames: [clean] }));
    r = await runWith([sb, "--per-sheet", "6", "--layout", other], { NPX_SILENT: "1" });
    assert.equal(r.code, 0, r.err + r.out);
    assert.match(text(), /^- FLAG frame 5 · /m, "--layout names the records to index");
    assert.equal(JSON.parse(fs.readFileSync(lay, "utf8")).frames.length, 1, "layout.json is left as it was");
    fs.rmSync(lay, { force: true });
    // The cause of "not measured" at one run, OK at the next (lessons.md): 127.0.0.1:47614 was one port for every capture
    // on the machine. Another process on it (a second capture, the gate's own tests/strips.mjs, an older film's page
    // posting on every load) left this capture with no records, or posted its own into it. Each capture now owns a port.
    const engineFlag = fs.readFileSync(flag, "utf8");
    // the switch is read and written in one place (scripts/layout_flag.mjs), for strips.mjs and express.mjs alike
    const on = flagOn(engineFlag, "http://127.0.0.1:50123");
    assert.ok(ownsPort(engineFlag) && /export default "http:\/\/127\.0\.0\.1:50123";/.test(on) && isOn(on), "the engine's copy gets the capture's own URL");
    assert.equal(flagOff(on), engineFlag, "a capture killed mid-way is switched off again (express.mjs final)");
    const older = "export default false;\n";
    assert.ok(!ownsPort(older) && flagOn(older, "http://127.0.0.1:50123") === "export default true;\n" && flagOff("export default true;\n") === older, "an older copy gets true, and off again");
    let foreign = 0;
    const hold = await new Promise((resolve) => { const s = http.createServer((q, p) => { foreign++; p.writeHead(204); p.end(); }); s.on("error", () => resolve(null)); s.listen(47614, "127.0.0.1", () => resolve(s)); });
    try {
      // a foreign page posts on 47614 during the capture: it must not land in this capture's records
      if (hold) { const f = http.request({ host: "127.0.0.1", port: 47614, path: "/layout", method: "POST" }); f.end(JSON.stringify({ ...clean, t: 0.8 })); }
      r = await runWith([sb, "--per-sheet", "6", "--expect-layout"]);
      assert.equal(r.code, 0, r.err + r.out);
      assert.doesNotMatch(r.out, /busy|layout not recorded|captured once more/, "47614 held by another process: this capture still records, first time");
      assert.deepEqual(JSON.parse(fs.readFileSync(lay, "utf8")).frames.map((x) => x.t), want, "its own records, one per frame");
      assert.equal(fs.readFileSync(flag, "utf8"), engineFlag, "layout_on.js is put back as it was");
      assert.equal(foreign, hold ? 1 : 0, "the page posted to its own receiver, never to 47614");
      console.log("ok  capture: its own receiver port; a process on 47614 neither blocks it nor posts into it");
      // an older engine copy in a film (layout_on.js without the receiver line) keeps the fixed port: busy is a WARN
      const legacy = "// Whether type.js layoutFrame() posts its records: strips.mjs writes `true` here for its capture only and puts `false`\n// back after, so a check or a render (no receiver) sends no request that fails (hyperframes check: request_failed).\nexport default false;\n";
      fs.writeFileSync(flag, legacy);
      if (!hold) console.log("busy-port case skipped: port 47614 is in use");
      else {
        r = await runWith([sb, "--per-sheet", "6"]);
        assert.equal(r.code, 0, `a busy port does not fail the capture: ${r.err}${r.out}`);
        assert.match(r.out, /WARN: layout not recorded: port 47614 is busy/);
        assert.match(text(), /No layout recorded/);
        assert.equal(fs.existsSync(lay), false);
        assert.equal(index(sb).length, 9);
        hold.close(); await new Promise((res) => setTimeout(res, 200));
        r = await runWith([sb, "--per-sheet", "6"]);
        assert.equal(r.code, 0, r.err + r.out);
        assert.deepEqual(JSON.parse(fs.readFileSync(lay, "utf8")).frames.map((x) => x.t), want, "an older engine copy still records on 47614 when it is free");
        assert.equal(fs.readFileSync(flag, "utf8"), legacy);
        console.log("ok  capture: an older engine copy keeps 47614; busy there is a WARN, the stills and the index still come");
      }
    } finally { hold?.close(); fs.writeFileSync(flag, engineFlag); }
  }
  console.log("OK");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
