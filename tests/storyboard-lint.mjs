#!/usr/bin/env node
// node tests/storyboard-lint.mjs — scripts/storyboard_lint.mjs against fixture storyboards. The lint reads the shot
// table of storyboard.md (the one with a "Subject action" column) and flags, each at its row: an empty Subject
// action or Camera cell; 3+ consecutive rows with the same size and angle; the share of rows whose focal point is
// text only, over the energy's limit; an average shot over the energy's limit (limits: visual-direction.md §3).
// Other tables are ignored. A storyboard it cannot read or parse is WARN (exit 2), never OK.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const lint = fileURLToPath(new URL("../scripts/storyboard_lint.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-storyboard-lint-"));
const run = (proj, ...args) => { const r = spawnSync(process.execPath, [lint, proj, ...args], { encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
let n = 0;
const mk = () => { const p = path.join(tmp, `p${++n}`); fs.mkdirSync(p); return p; };
const put = (proj, rel, text) => fs.writeFileSync(path.join(proj, rel), text);
const found = (out) => [...out.matchAll(/PROBLEM\s*:\s*storyboard\.md:(\d+)/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
const msg = (out, line) => out.split("\n").find((l) => l.includes(`storyboard.md:${line}`)) ?? "";

const SIZES = ["wide · high", "medium · eye-level", "close-up · low", "extreme close-up · eye-level", "wide · low", "medium close-up · high"];
const OTHER = ["| Section | Axis |", "|---|---|", "| intro | time |", "", "Shots:", ""];
// rows: [{time, size, see, cam, act}] with defaults; returns the text and the 1-based line of row k.
// nocam: the table has no Camera column.
const build = (rows, { nocam = false, step = 2.5 } = {}) => {
  const cols = ["#", "Time", "Beat", "Job · emotion", "Size · angle · lens", "What we see (focal point; fg / mid / bg job)", ...(nocam ? [] : ["Camera (+ what changed)"]), "Subject action (+ source)", "Transition out", "SFX", "Overlay"];
  const lines = [...OTHER, `| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`];
  const at = {};
  rows.forEach((r, i) => {
    const k = i + 1;
    const d = { time: `${i * step}–${(i + 1) * step}`, size: SIZES[i % SIZES.length], see: "a valve opening in the pipe; water in the mid", cam: "slow push-in, the valve fills the frame", act: "water flows out of the valve (3D, physics)", ...r };
    at[k] = lines.length + 1;
    const cells = [k, d.time, "b", "j", d.size, d.see, ...(nocam ? [] : [d.cam]), d.act, "cut", "-", "-"];
    lines.push(`| ${cells.join(" | ")} |`);
  });
  return { text: lines.join("\n") + "\n", at };
};
const clean = (k = 6, over = {}) => Array.from({ length: k }, (_, i) => over[i + 1] ?? {});
const check = (rows, args = [], opts, brief) => {
  const proj = mk(); const b = build(rows, opts); put(proj, "storyboard.md", b.text);
  if (brief) put(proj, "BRIEF.md", brief);
  return { ...run(proj, ...args), at: b.at };
};

// 1. clean
{
  const r = check(clean());
  assert.equal(r.code, 0, r.out); assert.match(r.out, /Result {3}: OK/);
}
// 2. empty cells
{
  const r = check(clean(6, { 3: { act: "" }, 5: { cam: "—" } }));
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(found(r.out), [r.at[3], r.at[5]], r.out);
  assert.match(msg(r.out, r.at[3]), /Subject action/); assert.match(msg(r.out, r.at[5]), /Camera/);
}
// 3. repeated size + angle
{
  const same = { size: "medium · eye-level" };
  let r = check(clean(6, { 2: same, 3: same, 4: same }));
  assert.equal(r.code, 1, r.out); assert.deepEqual(found(r.out), [r.at[2]], r.out); assert.match(r.out, /rows 2–4/);
  r = check(clean(6, { 2: same, 3: same })); assert.equal(r.code, 0, r.out);
  r = check(clean(6, { 2: same, 3: same, 4: { size: "medium · low" } })); assert.equal(r.code, 0, r.out);
  r = check(clean(6, { 2: same, 3: { size: "wide · eye-level" }, 4: same })); assert.equal(r.code, 0, r.out);
}
// 4. text-only share (limits: calm 10 %, balanced 15 %, punchy 25 %)
{
  const text = { see: "a headline that fills the frame; blank mid", act: "type animates in" };
  const three = { 2: text, 5: text, 8: text };
  let r = check(clean(12, three), [], { step: 2 });
  assert.equal(r.code, 1, r.out); assert.match(r.out, /3 of 12 rows/); assert.equal(found(r.out).length, 1, r.out);
  r = check(clean(12, { 2: text }), [], { step: 2 }); assert.equal(r.code, 0, r.out);
  r = check(clean(12, { 2: { ...text, act: "headline built as a three.js mesh, physical drop" }, 5: text }), [], { step: 2 });
  assert.equal(r.code, 0, r.out);
  r = check(clean(12, three), ["--energy", "punchy"], { step: 1 });
  assert.equal(r.code, 0, r.out); // 3 of 12 = 25 %, at the punchy limit
}
// 5. average shot
{
  let r = check(clean(3), [], { step: 3.3 });
  assert.equal(r.code, 1, r.out); assert.match(r.out, /average shot 3\.3 s over 3 s/);
  r = check(clean(3), ["--energy", "calm"], { step: 3.3 }); assert.equal(r.code, 0, r.out);
  r = check(clean(5), [], { step: 2.4 }, "Energy: Modern balanced\n"); assert.equal(r.code, 0, r.out);
  r = check(clean(5), [], { step: 2.4 }, "- Energy: Punchy social\n");
  assert.equal(r.code, 1, r.out); assert.match(r.out, /over 1\.8 s for punchy/);
  r = check(clean(5), [], { step: 2.4 }); assert.equal(r.code, 0, r.out); assert.match(r.out, /INFO\s*: energy not found/);
}
// 6. cannot check
{
  let proj = mk();
  let r = run(proj); assert.equal(r.code, 2, r.out); assert.match(r.out, /not found/); assert.doesNotMatch(r.out, /Result {3}: OK/);
  put(proj, "storyboard.md", "x\n"); r = run(proj); assert.equal(r.code, 2, r.out); assert.match(r.out, /no shot table/);
  r = check(clean(), [], { nocam: true }); assert.equal(r.code, 2, r.out); assert.match(r.out, /WARN\s*: no Camera column/);
  r = check(clean(6, { 3: { act: "" } }), [], { nocam: true }); assert.equal(r.code, 1, r.out);
  proj = mk(); fs.mkdirSync(path.join(proj, "storyboard.md"));
  r = run(proj); assert.equal(r.code, 2, r.out); assert.match(r.out, /cannot read/); assert.doesNotMatch(r.out, /Result {3}: OK/);
}
// 7. every fault at once
{
  const same = { size: "medium · eye-level" };
  const text = { see: "a title card; blank mid", act: "type fades in" };
  const r = check(clean(8, { 2: same, 3: same, 4: same, 5: { act: "" }, 6: { cam: "" }, 7: text, 8: text }), [], { step: 4 });
  assert.equal(r.code, 1, r.out);
  const f = found(r.out);
  for (const k of [2, 5, 6]) assert.ok(f.includes(r.at[k]), `row ${k}: ${r.out}`);
  assert.match(r.out, /text only/); assert.match(r.out, /average shot/);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log("storyboard-lint: ok");
