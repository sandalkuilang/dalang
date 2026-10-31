#!/usr/bin/env node
// tests/glass-band-render.mjs needs a headless Chromium. Where it is optional (a developer machine) its absence is a WARN
// and exit 0; where the merge gate requires it (DALANG_REQUIRE_CHROME=1, set in .github/workflows/ci.yml) a missing or
// broken browser must FAIL, else the gate goes green without ever looking at the band. Also: the CI workflow really sets it,
// and an explicit DALANG_CHROME that does not exist is not silently replaced by another browser.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "glass-band-render.mjs");
const run = (env) => {
  const e = { ...process.env }; delete e.DALANG_CHROME; delete e.DALANG_REQUIRE_CHROME;
  return spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 60000, env: { ...e, ...env } });
};

// optional: no browser at the given path is a WARN, exit 0 (the legitimate case: a machine without Chromium)
let r = run({ DALANG_CHROME: "/nonexistent/chrome" });
assert.equal(r.status, 0, "optional: exit 0 without a browser: " + r.stderr);
assert.match(r.stdout, /WARN: no headless Chromium found/, "optional: says it was not run");
assert.doesNotMatch(r.stdout, /no line on/, "optional: never claims a pass it did not make");

// required: the same absence fails
r = run({ DALANG_CHROME: "/nonexistent/chrome", DALANG_REQUIRE_CHROME: "1" });
assert.notEqual(r.status, 0, "required: a missing browser fails the check");
assert.match(r.stderr, /FAIL: no headless Chromium found/, "required: names the failure");

// required: a browser that starts but renders nothing fails too (not run is not passed)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-glass-policy-"));
try {
  const dud = path.join(tmp, "chrome"); fs.writeFileSync(dud, "#!/bin/sh\nexit 1\n"); fs.chmodSync(dud, 0o755);
  r = run({ DALANG_CHROME: dud, DALANG_REQUIRE_CHROME: "1" });
  assert.notEqual(r.status, 0, "required: a browser that renders nothing fails the check");
  assert.match(r.stderr, /FAIL: the browser did not render/, "required: names the failure");
  r = run({ DALANG_CHROME: dud });
  assert.equal(r.status, 0, "optional: a browser that renders nothing is a WARN: " + r.stderr);
  assert.match(r.stdout, /WARN: the browser did not render/);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// the CI merge gate requires it, and gets a browser
const ci = fs.readFileSync(path.join(here, "..", ".github", "workflows", "ci.yml"), "utf8");
assert.match(ci, /DALANG_REQUIRE_CHROME/, "ci.yml sets DALANG_REQUIRE_CHROME so the rendered check cannot be skipped");
assert.match(ci, /DALANG_CHROME/, "ci.yml gives the gate a headless Chromium (DALANG_CHROME)");
const gate = fs.readFileSync(path.join(here, "..", "scripts", "gate.sh"), "utf8");
assert.match(gate, /glass-band-render\.mjs/, "gate.sh runs the rendered glass-band check");

console.log("glass band policy: optional is a WARN, required fails when no browser renders, CI requires it");
