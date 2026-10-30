#!/usr/bin/env node
// node tests/layout-lint.mjs — scripts/layout_lint.mjs against fixture layout records (what engine/three/type.js
// layoutFrame() hands out per frame: the boxes drawn, in px, and the hero's box). The lint flags, each line with its
// time `t=…s`: a box outside the format's safe area; a text box covering more than 10 % of its own area of the hero
// box; a label/card under 36 px or a caption under 54 px (at 1080 on the short side, scaled); a caption box overlapping
// a label/card box. A file it cannot read or a frame it cannot check is WARN (exit 2), never OK.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const script = fileURLToPath(new URL("../scripts/layout_lint.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-layout-lint-"));
let n = 0;
const put = (frames, raw) => { const f = path.join(tmp, `l${++n}.json`); fs.writeFileSync(f, raw ?? JSON.stringify(frames)); return f; };
const run = (file, ...args) => { const r = spawnSync(process.execPath, [script, file, ...args], { encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const lines = (out, tag) => out.split("\n").filter((l) => l.startsWith(`  ${tag}`));

// Shorts 1080x1920: text area x 64.8-950, y 168-1330; caption band y 1150-1330.
const caption = { kind: "caption", text: "water finds the lowest path", x0: 200, y0: 1180, x1: 880, y1: 1330, size: 60 };
const label = { kind: "label", text: "valve", x0: 600, y0: 300, x1: 800, y1: 356, size: 40 };
const hero = { x0: 100, y0: 400, x1: 550, y1: 1100 };
const frame = (over = {}) => ({ t: 1.5, W: 1080, H: 1920, format: "shorts", boxes: [{ ...caption }, { ...label }], hero: { ...hero }, ...over });
try {
  // A clean set is OK.
  let r = run(put([frame()]));
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /Result {3}: OK/);
  assert.equal(lines(r.out, "PROBLEM").length, 0);

  // One fault alone: exactly one PROBLEM, with its time and its kind.
  const faults = [
    ["safe area", frame({ t: 2.5, boxes: [{ ...caption }, { ...label, x1: 1000 }] }), /label "valve".*safe area/],
    ["hero cover", frame({ t: 2.5, hero: { x0: 100, y0: 400, x1: 900, y1: 1300 } }), /caption .*covers \d+ % of the hero box/],
    ["minimum size", frame({ t: 2.5, boxes: [{ ...caption }, { ...label, size: 30 }] }), /label "valve".*30 px.*36 px minimum/],
    ["caption over label", frame({ t: 2.5, boxes: [{ ...caption }, { ...label }, { kind: "label", text: "pipe", x0: 300, y0: 1120, x1: 500, y1: 1200, size: 40 }] }), /caption .*overlaps label "pipe"/],
    ["small hero", frame({ t: 2.5, hero: { x0: 300, y0: 500, x1: 600, y1: 900 } }), /hero box .*fills 21 % of the frame height and 28 % of its width, under 33 %/],
    ["hero cut", frame({ t: 2.5, hero: { x0: 0, y0: 400, x1: 500, y1: 1100 } }), /hero box .*is cut by the frame's left edge/],
    ["pale hero", frame({ t: 2.5, contrast: 6.5 }), /hero reads at ΔL\* 6\.5 .*under 12/],
  ];
  for (const [name, fr, re] of faults) {
    r = run(put([fr]));
    assert.equal(r.code, 1, `${name}: ${r.out}${r.err}`);
    const p = lines(r.out, "PROBLEM");
    assert.equal(p.length, 1, `${name}: ${r.out}`);
    assert.match(p[0], /t=2\.5s/, name);
    assert.match(p[0], re, name);
  }
  // A caption under 54 px is flagged (the caption minimum is higher than the label's).
  r = run(put([frame({ t: 2.5, boxes: [{ ...caption, size: 50 }] })]));
  assert.equal(r.code, 1);
  assert.match(lines(r.out, "PROBLEM")[0], /caption .*50 px.*54 px minimum/);
  // Framing edges: a close-up that fills the frame on both axes is not "cut"; a clipped box (camera inside the
  // subject's box) is a lower bound and skips size and cut; contrast at or over the floor is OK; no contrast key, no check.
  r = run(put([frame({ boxes: [], hero: { x0: 0, y0: 0, x1: 1080, y1: 1920 } })]));
  assert.equal(r.code, 0, "a close-up filling the frame: " + r.out);
  r = run(put([frame({ hero: { x0: 0, y0: 400, x1: 300, y1: 600, clipped: true } })]));
  assert.equal(r.code, 0, "a clipped hero box is not judged for size or cut: " + r.out);
  r = run(put([frame({ contrast: 20 })]));
  assert.equal(r.code, 0, r.out);
  r = run(put([frame({ contrast: 6.5 })]), "--min-contrast", "5");
  assert.equal(r.code, 0, "--min-contrast lowers the floor: " + r.out);
  r = run(put([frame({ hero: { x0: 300, y0: 500, x1: 600, y1: 900 } })]), "--min-hero", "0.2");
  assert.equal(r.code, 0, "--min-hero lowers the share: " + r.out);
  // --no-safe-area: the label outside the safe area is not flagged; everything else still is.
  r = run(put([frame({ boxes: [{ ...caption }, { ...label, x1: 1000 }] })]), "--no-safe-area");
  assert.equal(r.code, 0, "--no-safe-area skips the safe area: " + r.out);
  r = run(put([frame({ contrast: 1 })]), "--min-contrast", "x");
  assert.equal(r.code, 2, "a bad knob is a usage WARN: " + r.out);
  // Text size minimums are knobs: the object-studio kit draws captions at 46 px and its kitSizedest label at 22 px.
  const kitSized = frame({ boxes: [{ ...caption, size: 46 }, { ...label, size: 22 }] });
  r = run(put([kitSized]));
  assert.equal(r.code, 1, "46 px caption and 22 px label fail the defaults: " + r.out);
  assert.match(lines(r.out, "PROBLEM").join("\n"), /caption.*under the 54 px minimum/);
  r = run(put([kitSized]), "--min-caption", "46", "--min-label", "22");
  assert.equal(r.code, 0, "the kit's own sizes pass with the knobs: " + r.out);
  r = run(put([frame({ boxes: [{ ...caption, size: 40 }, { ...label, size: 22 }] })]), "--min-caption", "46", "--min-label", "22");
  assert.equal(r.code, 1, "a shrunk caption is still caught: " + r.out);
  r = run(put([frame()]), "--min-caption", "x");
  assert.equal(r.code, 2, "a bad --min-caption is a usage WARN: " + r.out);
  r = run(put([frame()]), "--min-label", "0");
  assert.equal(r.code, 2, "a bad --min-label is a usage WARN: " + r.out);
  r = run(put([frame()]), "--min-label");
  assert.equal(r.code, 2, "--min-label with no value is a usage WARN: " + r.out);
  {
    const { lintLayout } = await import(pathToFileURL(script).href);
    assert.deepEqual(lintLayout([kitSized], { minCaption: 46, minLabel: 22 }).problems, [], "lintLayout knobs minCaption, minLabel");
    assert.ok(lintLayout([kitSized]).problems.length >= 2, "lintLayout defaults stay 54 and 36");
  }

  // A card is held to the label minimum and the label zone.
  r = run(put([frame({ boxes: [{ ...caption }, { ...label, kind: "card", size: 30 }] })]));
  assert.equal(r.code, 1);
  assert.match(lines(r.out, "PROBLEM")[0], /card "valve".*36 px minimum/);

  // Edges. Hero covering 5 % of the caption box: OK; --hero-overlap 0.01 flags it; 80 %: flagged (above).
  const five = frame({ hero: { x0: 100, y0: 400, x1: 900, y1: 1187.5 } }); // 7.5 px of the 150 px caption height = 5 %
  r = run(put([five]));
  assert.equal(r.code, 0, r.out);
  r = run(put([five]), "--hero-overlap", "0.01");
  assert.equal(r.code, 1);
  assert.match(lines(r.out, "PROBLEM")[0], /covers 5 %/);
  // A flag with no value, or a bad one, is a usage WARN (exit 2, a message), never a crash and never exit 1 (= a layout problem).
  for (const bad of [[], ["x"], ["2"], ["-0.1"], [""]]) {
    r = run(put([frame()]), "--hero-overlap", ...bad);
    assert.equal(r.code, 2, `--hero-overlap ${JSON.stringify(bad)}: ${r.out}${r.err}`);
    assert.doesNotMatch(r.err, /TypeError/);
    assert.match(lines(r.out, "WARN")[0], /--hero-overlap .*use a share between 0 and 1/);
    assert.doesNotMatch(r.out, /Result {3}: OK/);
  }
  // The legitimate values on the other side of the same rule: the bounds 0 and 1 are read.
  r = run(put([five]), "--hero-overlap", "1");
  assert.equal(r.code, 0, r.out);
  r = run(put([five]), "--hero-overlap", "0");
  assert.equal(r.code, 1, r.out);
  assert.match(lines(r.out, "PROBLEM")[0], /covers 5 %/);
  // The minimum scales with the short side: a 30 px label is fine at 720x1280 (24 px minimum), not at 1080x1920.
  const small = frame({ W: 720, H: 1280, boxes: [{ kind: "label", text: "valve", x0: 100, y0: 200, x1: 300, y1: 240, size: 30 }], hero: null });
  r = run(put([small]));
  assert.equal(r.code, 0, r.out);
  // A reels caption may end at 82 % of the height, below the reels text area (75 %); a label may not go there.
  const reels = frame({ format: "reels", boxes: [{ ...caption, y0: 1250, y1: 1574 }], hero: null });
  r = run(put([reels]));
  assert.equal(r.code, 0, r.out);
  assert.equal(run(put([frame({ format: "reels", boxes: [{ ...label, y0: 1400, y1: 1456 }], hero: null })])).code, 1);

  // Hero key absent: overlap not checked (INFO), exit 0. hero null (off the frame): nothing to overlap.
  const noHero = frame(); delete noHero.hero;
  r = run(put([noHero]));
  assert.equal(r.code, 0, r.out);
  assert.match(lines(r.out, "INFO").join("\n"), /t=1\.5s.*no hero box given: overlap not checked/);
  r = run(put([frame({ hero: null })]));
  assert.equal(r.code, 0, r.out);
  assert.equal(lines(r.out, "INFO").length, 0);
  // A clipped hero box is named as a lower bound.
  r = run(put([frame({ hero: { x0: 100, y0: 400, x1: 900, y1: 1300, clipped: true } })]));
  assert.match(lines(r.out, "PROBLEM")[0], /clipped/);

  // WARN, exit 2, never OK: not JSON; no frames; an unknown format; a box with a NaN (null in JSON); a missing file.
  const warns = [
    ["not json", put(null, "{not json")],
    ["no frames", put({ frames: [] })],
    ["not an array", put({ nothing: 1 })],
    ["unknown format", put([frame({ format: "square" })])],
    ["NaN box", put([frame({ boxes: [{ ...caption, x0: null }] })])],
    ["missing file", path.join(tmp, "absent.json")],
  ];
  for (const [name, f] of warns) {
    r = run(f);
    assert.equal(r.code, 2, `${name}: ${r.out}${r.err}`);
    assert.ok(lines(r.out, "WARN").length >= 1, name);
    assert.doesNotMatch(r.out, /Result {3}: OK/, name);
    assert.doesNotMatch(r.out, /\bnone\b/i, name);
  }
  assert.match(run(path.join(tmp, "absent.json")).out, /no layout\.json: run strips\.mjs/);
  // {frames: [...]} is read too, and a directory is its review/strips/layout.json.
  r = run(put({ frames: [frame()] }));
  assert.equal(r.code, 0, r.out);
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(path.join(proj, "review", "strips"), { recursive: true });
  fs.writeFileSync(path.join(proj, "review", "strips", "layout.json"), JSON.stringify([frame({ t: 2.5, hero: { x0: 100, y0: 400, x1: 900, y1: 1300 } })]));
  r = run(proj);
  assert.equal(r.code, 1);
  assert.match(r.out, /t=2\.5s/);

  // Imported: no CLI side effect, the shapes are arrays.
  const { lintLayout } = await import(pathToFileURL(script).href);
  assert.deepEqual(lintLayout([frame()]), { problems: [], warns: [], infos: [] });
  assert.equal(lintLayout([frame({ boxes: [{ ...caption }, { ...label, x1: 1000 }] })], { safe: false }).problems.length, 0, "safe: false skips the safe area");
  const bad = lintLayout([frame({ t: 2.5, boxes: [{ ...caption }, { ...label, size: 30 }] })]);
  assert.equal(bad.problems.length, 1);
  assert.deepEqual([bad.warns, bad.infos], [[], []]);
  assert.equal(lintLayout([]).warns.length, 1);
  assert.equal(lintLayout(null).warns.length, 1);
  console.log("layout lint: OK");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
