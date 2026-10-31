#!/usr/bin/env node
// node tests/storyboard-lint.mjs — scripts/storyboard_lint.mjs against fixture storyboards. The lint reads the shot
// table of storyboard.md (the one with a "Subject action" column) and flags, each at its row: an empty Subject
// action or Camera cell; 3+ consecutive rows with the same size and angle; the share of rows whose focal point is
// text only, over the energy's limit; an average shot over the energy's limit (limits: visual-direction.md §3); a hard cut
// that keeps the view (the angle cell) or turns it under 60°; a camera cell that closes in with no orbit. A film under
// 10 s (the Time column's span) with two rows is the hook plus one held shot: the average-shot check is skipped, the hook is not text.
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
    const d = { time: `${i * step}–${(i + 1) * step}`, size: SIZES[i % SIZES.length], see: "a valve opening in the pipe; water in the mid", cam: "slow orbit right, the valve fills the frame", act: "water flows out of the valve (3D, physics)", ...r };
    at[k] = lines.length + 1;
    const cells = [k, d.time, "b", "j", d.size, d.see, ...(nocam ? [] : [d.cam]), d.act, d.out ?? "dissolve", "-", "-"];
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
  r = check(clean(12, { 2: { ...text, act: "headline extruded as an isometric slab by build()" }, 5: text }), [], { step: 2 });
  assert.equal(r.code, 0, r.out); // Express's real visual exempts the row too
  r = check(clean(12, { 2: { ...text, act: "headline falls in a physics simulation" }, 5: text }), [], { step: 2 });
  assert.equal(r.code, 1, r.out); // the removed physics path exempts nothing: 2 of 12 over 15 %
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
  r = check(clean(6), ["--energy", "hype"], { step: 1.2 });
  assert.equal(r.code, 1, r.out); assert.match(r.out, /over 1 s for hype/);
  r = check(clean(6), ["--energy", "hype"], { step: 0.8 }); assert.equal(r.code, 0, r.out);
  r = check(clean(6), [], { step: 1.2 }, "energy: hype\n"); assert.match(r.out, /over 1 s for hype/, "BRIEF.md's hype line");
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
// 8. a hard cut changes the view (the angle cell: front, a side, the back; 60° or more)
{
  const cut = { out: "hard cut on the hook word" };
  // the same angle at a new zoom: a jump cut
  let r = check(clean(3, { 1: { size: "wide · iso", ...cut }, 2: { size: "close · iso" } }));
  assert.equal(r.code, 1, r.out); assert.deepEqual(found(r.out), [r.at[1]], r.out); assert.match(msg(r.out, r.at[1]), /hard cut keeps the view \(iso → iso\)/);
  // under 60° apart: front to front-right is 45°
  r = check(clean(3, { 1: { size: "wide · front", ...cut }, 2: { size: "close · front-right" } }));
  assert.equal(r.code, 1, r.out); assert.match(msg(r.out, r.at[1]), /45°/);
  // a new view: front to the right side (90°), front to the back (180°), a plain "cut" too
  for (const [a, b] of [["front", "right side"], ["front", "back"], ["left side", "right side"]]) {
    r = check(clean(3, { 1: { size: `wide · ${a}`, out: "cut on action" }, 2: { size: `close · ${b}` } }));
    assert.equal(r.code, 0, `${a} → ${b}: ${r.out}`);
  }
  // not a hard cut, or a cut that is allowed: a push, a dissolve, a match cut, a cut to a new subject
  for (const out of ["push through to the cutaway", "dissolve", "match cut: the grille becomes the dial", "hard cut to a new subject"]) {
    r = check(clean(3, { 1: { size: "wide · iso", out }, 2: { size: "close · iso" } }));
    assert.equal(r.code, 0, `${out}: ${r.out}`);
  }
  // the last row's transition goes nowhere
  r = check(clean(2, { 2: { size: "wide · iso", ...cut } }));
  assert.equal(r.code, 0, r.out);
}
// 9. closer = orbit-in: a camera cell that closes in names the orbit; a small accent push, a pull-back and the named crash/dolly zoom pass
{
  let r = check(clean(3, { 2: { cam: "push-in 1.00→1.60 on the dial" } }));
  assert.equal(r.code, 1, r.out); assert.deepEqual(found(r.out), [r.at[2]], r.out); assert.match(msg(r.out, r.at[2]), /closes in with no orbit/);
  r = check(clean(3, { 2: { cam: "dive into the unit" } }));
  assert.equal(r.code, 1, r.out);
  for (const cam of ["push-in + orbit right 1.00→1.60", "zoom to the dial, view turns 30°", "spiral in on the fins", "push 1.00→1.06 (accent)", "pull-back to the wide", "dolly zoom on the crack", "crash zoom on the hit", "pan along the pipe"]) {
    r = check(clean(3, { 2: { cam } }));
    assert.equal(r.code, 0, `${cam}: ${r.out}`);
  }
}
// 10. object-studio (the visual thesis): no shot under 2 s after the hook row, and SPEC.md holds a ## MODEL section with an
// Input: line and a Check: line (one input drives everything; one real number checked by hand).
{
  const OS = "- look: object-studio\n";
  const SPEC = "## MODEL\nInput: stroke 0..1 over the beat\nCheck: 32 teeth x module 4 mm = 128 mm pitch; half its circumference 201 mm = the rack's travel\n";
  const withSpec = (rows, opts, spec = SPEC) => { const p = mk(); put(p, "storyboard.md", build(rows, opts).text); put(p, "BRIEF.md", OS); if (spec !== null) put(p, "SPEC.md", spec); return run(p, "--energy", "calm"); };
  let r = withSpec(clean(3), { step: 3 }); assert.equal(r.code, 0, r.out);
  r = withSpec(clean(4), { step: 1.5 }); assert.equal(r.code, 1, r.out); assert.match(r.out, /held|under 2 s/, r.out);
  r = withSpec(clean(3), { step: 3 }, null); assert.equal(r.code, 1, r.out); assert.match(r.out, /MODEL/, r.out);
  r = withSpec(clean(3), { step: 3 }, "## MODEL\nInput: crank angle\n"); assert.equal(r.code, 1, r.out); assert.match(r.out, /Check:/, r.out);
  r = check(clean(4), ["--energy", "punchy"], { step: 1.5 }); assert.equal(r.code, 0, "the isometric looks keep their own pace: " + r.out);
}
// 11. a film under 10 s (the Time column's span): the hook plus one held shot passes at any energy, and the hook is not held
// against the text-only share; a film of 12 s is still checked, and so is a 3-row film under 10 s (case 5)
{
  let r = check(clean(2), ["--energy", "hype"], { step: 1.5 });
  assert.equal(r.code, 0, "a 2-shot 3 s film at hype: " + r.out); assert.match(r.out, /short film/);
  r = check(clean(2, { 1: { see: "title text: the hook's words", act: "type slams in" } }), ["--energy", "balanced"], { step: 1.5 });
  assert.equal(r.code, 0, "a text hook in a 3 s film: " + r.out);
  r = check(clean(2, { 2: { see: "title text: the hook's words", act: "type slams in" } }), ["--energy", "balanced"], { step: 1.5 });
  assert.equal(r.code, 1, "a text-only held shot is still caught: " + r.out); assert.match(r.out, /show text only/);
  r = check(clean(4), ["--energy", "hype"], { step: 3 });
  assert.equal(r.code, 1, r.out); assert.match(r.out, /average shot/);
  const p = mk(); put(p, "storyboard.md", build(clean(2), { step: 1 }).text.replace("| 1–2 |", "| 1–3 |")); put(p, "BRIEF.md", "- look: object-studio\n");
  put(p, "SPEC.md", "## MODEL\nInput: stroke 0..1 over the beat\nCheck: 32 teeth x module 4 mm = 128 mm pitch\n");
  r = run(p, "--energy", "calm"); assert.equal(r.code, 0, "an object-studio 3 s film (hook 0–1, shot 1–3): " + r.out);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log("storyboard-lint: ok");
