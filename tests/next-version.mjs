#!/usr/bin/env node
// node tests/next-version.mjs — scripts/next_version.mjs: the size of the change sets the bump (Redesign MAJOR, only with
// --major; Rework MINOR; fixes, improvements and new features PATCH); a release is never refused for coming soon.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/next_version.mjs", import.meta.url));
const log = (body) => `# Changelog\n\n## [Unreleased]\n${body}\n## [4.5.2] - 2026-10-30\n\n### Added\n- old\n`;
const run = (body, ...a) => { const r = spawnSync(process.execPath, [script, ...a], { input: log(body), encoding: "utf8" }); return { code: r.status, out: r.stdout.trim(), err: r.stderr }; };

assert.deepEqual(run("\n### Fixed\n- a fix\n### Changed\n- a rule\n", "v4.5.2"), { code: 0, out: "4.5.3", err: "" }, "fixes and improvements are a PATCH");
assert.equal(run("\n### Added\n- a new look\n### Fixed\n- x\n", "v4.5.2").out, "4.5.3", "a new feature is a PATCH");
assert.equal(run("\n### Rework\n- the planner rebuilt\n### Added\n- y\n", "v4.5.2").out, "4.6.0", "a medium-to-large overhaul is a MINOR");
let r = run("\n### Redesign\n- a new engine\n", "v4.5.2");
assert.equal(r.code, 1, "Redesign alone never makes a MAJOR"); assert.match(r.err, /--major/);
assert.equal(run("\n### Redesign\n- a new engine\n### Rework\n- y\n", "v4.5.2", "--major").out, "5.0.0", "Redesign with --major is a MAJOR");
assert.equal(run("\n### Rework\n\n### Fixed\n- x\n", "v4.5.2").out, "4.5.3", "an empty Rework heading is no MINOR");
r = run("\n", "v4.5.2");
assert.equal(r.code, 1); assert.match(r.err, /Unreleased is empty/);
assert.equal(run("\n### Fixed\n- x\n", "v4.5.2").out, "4.5.3", "a release the day after the last is fine: no weekly limit");
console.log("next-version: OK");
