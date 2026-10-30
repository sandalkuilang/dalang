#!/usr/bin/env node
// node tests/studio.mjs — scripts/studio.mjs: usage, one fixer line per review/fixes-<group>.md, and a QC round that puts
// the last round's verdicts aside before it runs (dry run: nothing is rendered).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/studio.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-studio-"));
const run = (...a) => { const r = spawnSync(process.execPath, [script, ...a], { encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };

assert.equal(run("nope", tmp).code, 2, "an unknown command is a usage error");
assert.equal(run("frames", tmp).code, 2, "frames needs --at");
let r = run("fixes", tmp);
assert.equal(r.code, 0); assert.match(r.out, /no P0\/P1 open/);
fs.mkdirSync(path.join(tmp, "review"));
fs.writeFileSync(path.join(tmp, "review/fixes-open.md"), "P0 | t=1.2 | Reality | x\nP1 | t=2 | Clarity | y\nP1 | t=3 | Action | z\n");
fs.writeFileSync(path.join(tmp, "review/fixes-close.md"), "P1 | t=9 | Clarity | w\n");
r = run("fixes", tmp);
assert.match(r.out, /fixer close: 0 P0, 1 P1/); assert.match(r.out, /fixer open: 1 P0, 2 P1/);
assert.match(r.out, /review\/reports\/fix-open\.md/, "the fixer reports to a file");
assert.match(r.out, /wait\.mjs \. --expect 2 \(timeout 600000\)/, "the round ends with the barrier: one turn for both replies");
fs.writeFileSync(path.join(tmp, "QC-REVIEW.md"), "# round 1\n");
r = run("qc", tmp, "--dry-run");
assert.match(r.out, /FAILED no assets\/music\.mp3/, "a film without a bed fails QC");
fs.mkdirSync(path.join(tmp, "assets")); fs.writeFileSync(path.join(tmp, "assets/music.mp3"), "x");
r = run("qc", tmp, "--dry-run");
assert.match(r.out, /round 1 put aside in review\/round-1\/ \(3 item/, "QC-REVIEW.md and both fix lists are put aside");
assert.match(r.out, /strips --crops: .*--against .*round-1/);
assert.ok(fs.existsSync(path.join(tmp, "QC-REVIEW.md")), "a dry run moves nothing");
const { newestStills } = await import(new URL("../scripts/snapshots.mjs", import.meta.url));
const snaps = path.join(tmp, "snaps");
for (const [d, ago] of [["ffff-old", 60], ["0000-new", 0]]) {
  fs.mkdirSync(path.join(snaps, d), { recursive: true });
  for (const f of ["frame-1.png", "frame-2.png", "frame-10.png", "frame-11.png"]) fs.writeFileSync(path.join(snaps, d, f), "x");
  const t = new Date(Date.now() - ago * 1000); fs.utimesSync(path.join(snaps, d), t, t);
}
const got = newestStills(snaps, 3);
assert.equal(path.basename(got.dir), "0000-new", "the newest dir by mtime, not by name");
assert.deepEqual(got.pngs, ["frame-1.png", "frame-2.png", "frame-10.png"], "numeric order, the extra tail frame dropped");
assert.equal(newestStills(path.join(tmp, "none"), 2).dir, null);
console.log("studio: OK");
