#!/usr/bin/env node
// node tests/benchmark.mjs — the Gate 3 benchmark (references/review.md "Benchmark review"): `state.mjs approve 3`
// against stub verdicts (review/benchmark.md) next to a fixture pair (board + style frames), and the reference board
// that measure_reference.sh writes. Covers: no verdict, a row more than 1 point behind, an absent row, an unreadable
// score, a duplicated row and a verdict older than the style frames are all refused (also for --by user); a verdict
// with every row within 1 point is accepted and its scores recorded; an edited verdict makes the approval stale; an
// approval from before the benchmark existed stays fresh; the board is one sheet wider than tall (where ffmpeg runs).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const state = path.join(root, "scripts", "state.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-benchmark-"));
const run = (...args) => { const r = spawnSync(process.execPath, [state, ...args], { encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const put = (proj, rel, text = "x\n") => { const p = path.join(proj, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };
const later = (p, secs) => { const t = Date.now() / 1000 + secs; fs.utimesSync(p, t, t); };

const GOOD = `# Benchmark
Board: measure/reference-board.jpg
| Row | Reference | Style frames | Note |
|---|---|---|---|
| Detail density | 4 | 4 | |
| Material truth | 4 | 3 | one point behind: allowed |
| Light and shadow | 4 | 4 | |
| Text system | 3 | 4 | |
| Overlays caused by motion | 3 | 3 | |
| Framing | 4 | 4 | |
| **Macro quality** | 4 | 3 | |
`;
const swap = (from, to) => { assert.ok(GOOD.includes(from), `fixture line ${from} not in GOOD`); return GOOD.replace(from, to); };

// Files Gates 1 and 2 pass their own checks on (approve runs the lints and pad_voice): a lintable script, a padded take.
const gate12 = (p) => {
  put(p, "script.md", "Promise: one thing.\nTakeaway: the thing.\n"); put(p, "narration.txt", "Some words.\n");
  put(p, "audio/beats.json", JSON.stringify({ duration: 2, beats: [], pad: { lead: 1.45, tail: 1.35, take: "narration.wav" } })); put(p, "audio/words.json", "[]\n");
};
let n = 0;
// A project with gates 1-2 approved and the Gate 3 files in place (the fixture pair: stub board + stub style frame).
const project = () => {
  const p = path.join(tmp, `p${n++}`);
  gate12(p);
  for (const g of ["1", "2"]) assert.equal(run("approve", g, p).code, 0);
  put(p, "SPEC.md"); put(p, "storyboard.md"); put(p, "style-frames/a.png"); put(p, "measure/reference-board.jpg");
  return p;
};
const stateOf = (p) => JSON.parse(fs.readFileSync(path.join(p, "state.json"), "utf8"));
const refused = (p, re, why, ...extra) => {
  const r = run("approve", "3", p, ...extra);
  assert.equal(r.code, 1, `${why}: ${r.out}${r.err}`);
  assert.match(r.err, re, why);
  assert.equal(stateOf(p).approvals[3], undefined, `${why}: nothing recorded`);
};

try {
  // A0 Express: Gate 3 needs neither a benchmark nor style frames (Express makes none); Studio still needs them
  {
    const e = path.join(tmp, "express");
    put(e, "BRIEF.md", "- mode: express\n"); gate12(e);
    for (const g of ["1", "2"]) assert.equal(run("approve", g, e).code, 0);
    put(e, "SPEC.md"); put(e, "storyboard.md");
    const r = run("approve", "3", e, "--by", "agent");
    assert.equal(r.code, 0, `express gate 3 without style frames: ${r.out}${r.err}`);
    const s = path.join(tmp, "studio-nosf");
    gate12(s);
    for (const g of ["1", "2"]) assert.equal(run("approve", g, s).code, 0);
    put(s, "SPEC.md"); put(s, "storyboard.md");
    assert.match(run("approve", "3", s).err, /missing files: style-frames/, "studio still needs style frames");
  }

  // A1 no verdict
  let p = project();
  refused(p, /benchmark/i, "no verdict");

  // A2 a row 2 points behind, named with both scores
  p = project(); put(p, "review/benchmark.md", swap("| Light and shadow | 4 | 4 |", "| Light and shadow | 5 | 3 |"));
  refused(p, /light and shadow 3 vs 5/, "row behind");

  // A9 the user cannot skip it either
  refused(p, /light and shadow/, "user cannot skip", "--by", "user");
  refused(p, /light and shadow/, "agent cannot skip", "--by", "agent");

  // A3 a row absent
  p = project(); put(p, "review/benchmark.md", swap("| Framing | 4 | 4 | |\n", ""));
  refused(p, /no score for framing/, "row absent");

  // A4 unreadable scores are never read as passing
  for (const bad of ["6", "4?", "", "n/a", "0"]) {
    p = project(); put(p, "review/benchmark.md", swap("| Framing | 4 | 4 | |", `| Framing | 4 | ${bad} | |`));
    refused(p, /cannot read/, `unreadable score "${bad}"`);
  }

  // A5 the same row twice (a good copy hiding a bad one)
  p = project(); put(p, "review/benchmark.md", GOOD + "| Light and shadow | 5 | 2 | |\n");
  refused(p, /twice/, "duplicate row");

  // A6 a style frame newer than the verdict
  p = project(); const v = put(p, "review/benchmark.md", GOOD);
  later(path.join(p, "style-frames", "a.png"), 60);
  refused(p, /score them again/, "stale verdict");
  later(v, 120); // scored again after the change: accepted
  assert.equal(run("approve", "3", p).code, 0, "verdict newer than the style frames");

  // A7 every row within 1 point: accepted, recorded, printed
  p = project(); put(p, "review/benchmark.md", GOOD);
  const ok = run("approve", "3", p);
  assert.equal(ok.code, 0, `${ok.err}${ok.out}`);
  assert.match(ok.out, /Benchmark: /);
  assert.match(stateOf(p).approvals[3].benchmark, /material truth 3\/4/);
  assert.equal(run("check", "3", p).code, 0);

  // A8 the verdict edited after the approval: STALE
  put(p, "review/benchmark.md", GOOD + "edited\n");
  assert.equal(run("check", "3", p).code, 3, "edited verdict");

  // A8b the verdict deleted after the approval: STALE too
  p = project(); put(p, "review/benchmark.md", GOOD); assert.equal(run("approve", "3", p).code, 0);
  fs.rmSync(path.join(p, "review", "benchmark.md"));
  assert.equal(run("check", "3", p).code, 3, "deleted verdict");

  // A10 an approval made before the benchmark existed stays fresh (hash = SPEC + storyboard + style frames only)
  p = project();
  const h = createHash("sha1");
  for (const f of ["SPEC.md", "storyboard.md", "style-frames/a.png"]) h.update(fs.readFileSync(path.join(p, f)));
  const s = stateOf(p); s.approvals[3] = { at: "2026-01-01 00:00", by: "user", hash: h.digest("hex").slice(0, 12) };
  fs.writeFileSync(path.join(p, "state.json"), JSON.stringify(s, null, 2));
  assert.equal(run("check", "3", p).code, 0, "old approval stays fresh");

  // The reference board from measure_reference.sh (needs ffmpeg).
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (ff.status !== 0) console.log("board case skipped: ffmpeg did not run");
  else {
    const dim = (f) => spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", f], { encoding: "utf8" }).stdout.trim().split("x").map(Number);
    for (const [secs, name] of [[12, "long"], [3, "short"]]) {
      const inp = path.join(tmp, `${name}.mp4`), out = path.join(tmp, `out-${name}`);
      const g = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=d=${secs}:s=320x180:r=10`, "-pix_fmt", "yuv420p", inp], { encoding: "utf8" });
      assert.equal(g.status, 0, g.stderr);
      const r = spawnSync("bash", [path.join(root, "scripts", "measure_reference.sh"), inp, out], { encoding: "utf8" });
      assert.equal(r.status, 0, `measure_reference.sh (${name}): ${r.stderr}`);
      const board = path.join(out, "reference-board.jpg");
      assert.ok(fs.existsSync(board), `${name}: reference-board.jpg written`);
      const [w, hh] = dim(board);
      assert.ok(w > hh, `${name}: the board is wider than tall (${w}x${hh})`);
      assert.match(fs.readFileSync(path.join(out, "summary.txt"), "utf8"), /Reference board/, `${name}: the summary names the board`);
    }

    // Stale output: a second run into the same folder is about the second film only. A long film first (3 contact
    // sheets, 50 frames), then a short one: the frames, the contact sheets, the index and the board are the short
    // film's, byte for byte what a fresh folder gives; nothing of the first film is left over.
    const mk = (name, src, secs) => {
      const f = path.join(tmp, `${name}.mp4`);
      const g = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `${src}${src.includes("=") ? ":" : "="}s=320x180:r=10:d=${secs}`, "-pix_fmt", "yuv420p", f], { encoding: "utf8" });
      assert.equal(g.status, 0, g.stderr);
      return f;
    };
    const measure = (video, out) => { const r = spawnSync("bash", [path.join(root, "scripts", "measure_reference.sh"), video, out], { encoding: "utf8" }); assert.equal(r.status, 0, `measure_reference.sh: ${r.stderr}`); };
    const first = mk("first", "testsrc", 50), second = mk("second", "color=c=red", 5);
    const fresh = path.join(tmp, "fresh"), reused = path.join(tmp, "reused");
    measure(second, fresh);
    measure(first, reused); measure(second, reused);
    const count = (d, re) => fs.readdirSync(d).filter((x) => re.test(x)).length;
    assert.equal(count(path.join(reused, "frames"), /\.jpg$/), count(path.join(fresh, "frames"), /\.jpg$/), "reused folder: only the second film's frames");
    assert.equal(count(path.join(reused, "contact"), /^sheet_.*\.jpg$/), 1, "reused folder: only the second film's contact sheets");
    assert.equal(fs.readFileSync(path.join(reused, "contact", "index.txt"), "utf8").trim().split("\n").length, 1, "reused folder: the index lists one sheet");
    assert.ok(fs.readFileSync(path.join(reused, "reference-board.jpg")).equals(fs.readFileSync(path.join(fresh, "reference-board.jpg"))), "reused folder: the board is the second film's alone");
    assert.match(fs.readFileSync(path.join(reused, "summary.txt"), "utf8"), /Frames\s+: 5 files/, "reused folder: the summary counts the second film");

    // The other side of the rule: a rerun of the same film into its own folder gives the same result, and a folder per reference keeps both boards.
    measure(second, reused);
    assert.ok(fs.readFileSync(path.join(reused, "reference-board.jpg")).equals(fs.readFileSync(path.join(fresh, "reference-board.jpg"))), "a rerun of the same film is unchanged");
    const A = path.join(tmp, "measure", "a"), B = path.join(tmp, "measure", "b");
    measure(first, A); measure(second, B);
    assert.ok(!fs.readFileSync(path.join(A, "reference-board.jpg")).equals(fs.readFileSync(path.join(B, "reference-board.jpg"))), "one folder per reference: both boards stay, each its own film");
  }
  console.log("benchmark: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
