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
| Overlays caused by physics | 3 | 3 | |
| Framing | 4 | 4 | |
| **Macro quality** | 4 | 3 | |
`;
const swap = (from, to) => { assert.ok(GOOD.includes(from), `fixture line ${from} not in GOOD`); return GOOD.replace(from, to); };

let n = 0;
// A project with gates 1-2 approved and the Gate 3 files in place (the fixture pair: stub board + stub style frame).
const project = () => {
  const p = path.join(tmp, `p${n++}`);
  put(p, "script.md"); put(p, "narration.txt"); put(p, "audio/beats.json", "[]\n");
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
  }
  console.log("benchmark: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
