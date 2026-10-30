#!/usr/bin/env node
// node tests/next-version.mjs — scripts/next_version.mjs: the size of the change sets the bump (Redesign MAJOR, only with
// --major; Rework MINOR; fixes, improvements and new features PATCH), a release within a week of the last is refused,
// and --urgent is a PATCH only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/next_version.mjs", import.meta.url));
const now = Math.floor(Date.now() / 1000), weekAgo = String(now - 8 * 86400), today = String(now - 3600);
const log = (body) => `# Changelog\n\n## [Unreleased]\n${body}\n## [4.5.2] - 2026-10-30\n\n### Added\n- old\n`;
const run = (body, ...a) => { const r = spawnSync(process.execPath, [script, ...a], { input: log(body), encoding: "utf8" }); return { code: r.status, out: r.stdout.trim(), err: r.stderr }; };

assert.deepEqual(run("\n### Fixed\n- a fix\n### Changed\n- a rule\n", "v4.5.2", weekAgo), { code: 0, out: "4.5.3", err: "" }, "fixes and improvements are a PATCH");
assert.equal(run("\n### Added\n- a new look\n### Fixed\n- x\n", "v4.5.2", weekAgo).out, "4.5.3", "a new feature is a PATCH");
assert.equal(run("\n### Rework\n- the planner rebuilt\n### Added\n- y\n", "v4.5.2", weekAgo).out, "4.6.0", "a medium-to-large overhaul is a MINOR");
let r = run("\n### Redesign\n- a new engine\n", "v4.5.2", weekAgo);
assert.equal(r.code, 1, "Redesign alone never makes a MAJOR"); assert.match(r.err, /--major/);
assert.equal(run("\n### Redesign\n- a new engine\n### Rework\n- y\n", "v4.5.2", weekAgo, "--major").out, "5.0.0", "Redesign with --major is a MAJOR");
assert.equal(run("\n### Rework\n\n### Fixed\n- x\n", "v4.5.2", weekAgo).out, "4.5.3", "an empty Rework heading is no MINOR");
r = run("\n", "v4.5.2", weekAgo);
assert.equal(r.code, 1); assert.match(r.err, /Unreleased is empty/);
r = run("\n### Fixed\n- x\n", "v4.5.2", today);
assert.equal(r.code, 1); assert.match(r.err, /0 day\(s\) old: releases batch weekly, the next from \d{4}-\d\d-\d\d/);
assert.equal(run("\n### Added\n- x\n", "v4.5.2", today, "--urgent").out, "4.5.3", "an urgent fix or feature may come sooner");
r = run("\n### Rework\n- y\n", "v4.5.2", today, "--urgent");
assert.equal(r.code, 1); assert.match(r.err, /--urgent is a PATCH only/);
console.log("next-version: OK");
