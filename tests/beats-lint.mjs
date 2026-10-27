#!/usr/bin/env node
// node tests/beats-lint.mjs — scripts/beats_lint.mjs against fixture narration pairs. A second-language cut re-times the
// film from the same storyboard because both narrations hold the same named beats in the same order; the lint fails a
// beat missing, renamed, extra, out of order, unnamed, invalid or used twice, and an unbalanced brace (`file:line`).
// A file that cannot be read for any reason but "does not exist" is WARN (rerun), never "not found".
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const lint = fileURLToPath(new URL("../scripts/beats_lint.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-beats-lint-"));
const run = (cwd, ...args) => { const r = spawnSync(process.execPath, [lint, ...args], { cwd, encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const put = (rel, lines) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join("\n") + "\n"); };
const found = (out) => [...out.matchAll(/PROBLEM\s*:\s*(\S+:\d+)/g)].map((m) => m[1]).sort();
const lint2 = (b) => { put("second.txt", b); return run(tmp, "narration.txt", "second.txt"); };

// A generic explainer: why bread goes stale. Four beats; `fix` is split by a line break; a beat inside a `#` line is ignored.
const FIRST = [
  "# Why bread goes stale {ignored|zz}",
  "Fresh bread {feels soft and warm|hook} for about a day.",
  "Then the {starch inside|starch} slowly recrystallises.",
  "The {fridge|fridge} makes it worse.",
  "# The fix",
  "So {freeze slices and",
  "toast them|fix} instead.",
];
put("narration.txt", FIRST);

try {
  { // 1. a matching pair: other words, other sections, a different line break
    const r = lint2([
      "# Por que el pan se pone duro {ignorado|zz}",
      "El pan fresco {se siente suave y tibio|hook} durante un día.",
      "Luego el {almidón|starch} se recristaliza poco a poco.",
      "La {nevera|fridge} lo empeora.",
      "# La solución",
      "Así que {congela las rebanadas y tuéstalas|fix}.",
    ]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Result\s*: OK/);
    assert.match(r.out, /narration\.txt 4 beats, second\.txt 4 beats/, r.out);
    console.log("ok  a matching pair (other words, sections and line breaks) passes");
  }
  { // 2. a beat missing from the second
    const r = lint2(["# x", "El pan {fresco|hook}.", "El {almidón|starch}.", "La {nevera|fridge}."]);
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(found(r.out), ["narration.txt:6"], r.out);
    assert.match(r.out, /beat fix is missing from second\.txt/);
    console.log("ok  a missing beat fails at the first narration's line");
  }
  { // 3. a beat renamed: both lines named
    const r = lint2(["El pan {fresco|hook}.", "El {almidón|starches}.", "La {nevera|fridge}.", "{congela|fix}."]);
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(found(r.out), ["narration.txt:3", "second.txt:2"], r.out);
    assert.match(r.out, /starches is not in narration\.txt/);
    console.log("ok  a renamed beat fails at both files' lines");
  }
  { // 4. same set, two swapped: one problem, in the second file
    const r = lint2(["El pan {fresco|hook}.", "La {nevera|fridge}.", "El {almidón|starch}.", "{congela|fix}."]);
    assert.equal(r.code, 1, r.out);
    assert.equal(found(r.out).length, 1, r.out);
    assert.match(found(r.out)[0], /^second\.txt:/);
    assert.match(r.out, /order/);
    console.log("ok  a swapped order fails once, in the second file");
  }
  { // 5. an extra beat only in the second
    const r = lint2(["El pan {fresco|hook}.", "El {almidón|starch}.", "La {nevera|fridge}.", "{congela|fix} y {sirve|serve}."]);
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(found(r.out), ["second.txt:4"], r.out);
    assert.match(r.out, /serve is not in narration\.txt/);
    console.log("ok  an extra beat fails");
  }
  { // 6. an unnamed beat, an invalid name, a name twice
    const base = ["El pan {fresco|hook}.", "El {almidón|starch}.", "La {nevera|fridge}.", "{congela|fix}."];
    let r = lint2([...base.slice(0, 3), "{congela}."]);
    assert.equal(r.code, 1, r.out); assert.match(r.out, /has no \|name/);
    r = lint2([...base.slice(0, 3), "{congela|2x}."]);
    assert.equal(r.code, 1, r.out); assert.match(r.out, /2x/);
    r = lint2([...base, "El pan {otra vez|hook}."]);
    assert.equal(r.code, 1, r.out); assert.deepEqual(found(r.out), ["second.txt:5"], r.out); assert.match(r.out, /first at second\.txt:1/);
    console.log("ok  an unnamed beat, an invalid name and a name used twice fail");
  }
  { // the same faults in the first narration
    put("bad-first.txt", ["{a}", "{b|hook}", "{c|hook}"]);
    put("any.txt", ["{b|hook}"]);
    const r = run(tmp, "bad-first.txt", "any.txt");
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(found(r.out), ["bad-first.txt:1", "bad-first.txt:3"], r.out);
    console.log("ok  the first narration is read as strictly as the second");
  }
  { // 7. an unclosed { and a stray }
    let r = lint2(["El pan {fresco|hook}.", "El {almidón|starch}.", "La {nevera|fridge}.", "{congela|fix}.", "Un {abierto|oops"]);
    assert.equal(r.code, 1, r.out); assert.deepEqual(found(r.out), ["second.txt:5"], r.out);
    r = lint2(["El pan {fresco|hook}.", "stray } here", "El {almidón|starch}.", "La {nevera|fridge}.", "{congela|fix}."]);
    assert.equal(r.code, 1, r.out); assert.deepEqual(found(r.out), ["second.txt:2"], r.out); assert.match(r.out, /without a matching \{/);
    r = lint2(["El pan {fresco|hook}.", "El {almidón|starch}.", "La {nevera|fridge}.", "{congela|fix}.", "Un {uno {dos|x}."]);
    assert.equal(r.code, 1, r.out); assert.ok(found(r.out).includes("second.txt:5"), r.out); assert.match(r.out, /inside/);
    console.log("ok  an unclosed {, a stray } and a nested { fail at their lines");
  }
  { // 8. the second file absent: not found (a problem); a directory: unreadable, WARN, never "not found"
    let r = run(tmp, "narration.txt", "nope.txt");
    assert.equal(r.code, 1, r.out); assert.match(r.out, /nope\.txt not found/);
    fs.mkdirSync(path.join(tmp, "adir"), { recursive: true });
    r = run(tmp, "narration.txt", "adir");
    assert.equal(r.code, 2, r.out); assert.match(r.out, /WARN/); assert.match(r.out, /rerun/);
    assert.doesNotMatch(r.out + r.err, /not found/i, r.out);
    console.log("ok  an absent file is not found; an unreadable one is WARN (rerun), never not found");
  }
  { // 9. usage
    let r = run(tmp);
    assert.equal(r.code, 2, r.out + r.err); assert.match(r.out + r.err, /Usage/);
    r = run(tmp, "narration.txt");
    assert.equal(r.code, 2, r.out + r.err);
    r = run(tmp, "--help");
    assert.equal(r.code, 0); assert.match(r.out + r.err, /Usage/);
    console.log("ok  no arguments, one argument: usage, exit 2; --help exit 0");
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
