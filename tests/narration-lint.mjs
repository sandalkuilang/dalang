#!/usr/bin/env node
// node tests/narration-lint.mjs — scripts/narration_lint.mjs against fixture projects. A narration is followed by ear, so the
// lint fails what TTS turns into a pause of unknown length (; : ( ) /), a sentence over 22 words, and a script.md that does
// not say what the film asks (`Promise:`) and answers (`Takeaway:`). Sections, [tags], silences and beat names are not speech.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const lint = fileURLToPath(new URL("../scripts/narration_lint.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-narration-lint-"));
const run = (narration, script = ["Promise: why bread goes stale", "Takeaway: starch, not drying"]) => {
  fs.writeFileSync(path.join(tmp, "narration.txt"), narration.join("\n") + "\n");
  if (script) fs.writeFileSync(path.join(tmp, "script.md"), script.join("\n") + "\n"); else fs.rmSync(path.join(tmp, "script.md"), { force: true });
  const r = spawnSync(process.execPath, [lint, tmp], { encoding: "utf8" });
  return { code: r.status, out: r.stdout };
};
const found = (out) => [...out.matchAll(/PROBLEM\s*:\s*(\S+:\d+)/g)].map((m) => m[1]);

try {
  { // 1. plain spoken prose passes: sections, tags, silences and beat names are not speech
    const r = run(["# Why: bread (hook)", "[calm]", "Fresh bread {feels soft|hook} for a day.", "(1.5)", "Then it goes stale. Why? {Starch|starch}, mostly."]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Result\s*: OK/);
    console.log("ok  spoken prose passes; # lines, [tags], (1.5) and |names are not read");
  }
  { // 2. each unspeakable mark fails at its own line
    const r = run(["Bread goes stale; the starch changes.", "Two things matter: water and time.", "The fridge (not the counter) is worse.", "Heat and/or cold."]);
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(found(r.out), ["narration.txt:1", "narration.txt:2", "narration.txt:3", "narration.txt:3", "narration.txt:4"], r.out);
    console.log("ok  ; : ( ) / fail at their lines");
  }
  { // 3. a long sentence fails once, at its first word; two short ones pass
    const long = "When the loaf cools the starch inside it slowly turns back into tight little crystals and that is why the crumb feels dry even though no water has left it.";
    const r = run(["Short one.", long]);
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(found(r.out), ["narration.txt:2"], r.out);
    assert.match(r.out, /sentence of 3\d words/);
    assert.equal(run(["When the loaf cools the starch turns back into crystals.", "That is why the crumb feels dry."]).code, 0);
    console.log("ok  a sentence over 22 words fails at its line; shorter ones pass");
  }
  { // 4. dialogue keeps its colon
    const r = run(["ana: Is it stale?", "(0.5)", "ben: Yes, the starch changed."]);
    assert.equal(r.code, 0, r.out);
    console.log("ok  dialogue lines keep name: text");
  }
  { // 5. script.md must say what the film asks and answers
    const r = run(["Fresh bread feels soft."], ["# Bread", "Promise: why bread goes stale"]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /no "Takeaway:" line/);
    assert.doesNotMatch(r.out, /no "Promise:" line/);
    assert.equal(run(["Fresh bread feels soft."], ["**Promise:** why", "**Takeaway:** starch"]).code, 0);
    console.log("ok  script.md without Takeaway: fails; bold labels pass");
  }
  { // 6. no script.md: a problem, never silent
    const r = run(["Fresh bread feels soft."], null);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /script\.md not found/);
    console.log("ok  a missing script.md fails");
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log("narration-lint: all checks passed");
