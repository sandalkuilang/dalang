#!/usr/bin/env node
// node tests/next-version.mjs — scripts/next_version.mjs: the bump comes from Unreleased (Breaking MAJOR, Added MINOR,
// else PATCH), a release within a week of the last is refused, and --urgent is a PATCH only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/next_version.mjs", import.meta.url));
const now = Math.floor(Date.now() / 1000), weekAgo = String(now - 8 * 86400), today = String(now - 3600);
const log = (body) => `# Changelog\n\n## [Unreleased]\n${body}\n## [4.5.0] - 2026-10-30\n\n### Added\n- old\n`;
const run = (body, ...a) => { const r = spawnSync(process.execPath, [script, ...a], { input: log(body), encoding: "utf8" }); return { code: r.status, out: r.stdout.trim(), err: r.stderr }; };

assert.deepEqual(run("\n### Fixed\n- a fix\n### Changed\n- a rule\n", "v4.5.0", weekAgo), { code: 0, out: "4.5.1", err: "" }, "fixes and changes are a PATCH");
assert.equal(run("\n### Added\n- a new look\n### Fixed\n- x\n", "v4.5.0", weekAgo).out, "4.6.0", "a new capability is a MINOR");
assert.equal(run("\n### Breaking\n- old projects need x\n### Added\n- y\n", "v4.5.0", weekAgo).out, "5.0.0", "only Breaking is a MAJOR");
assert.equal(run("\n### Added\n\n### Fixed\n- x\n", "v4.5.0", weekAgo).out, "4.5.1", "an empty Added heading is no MINOR");
let r = run("\n", "v4.5.0", weekAgo);
assert.equal(r.code, 1); assert.match(r.err, /Unreleased is empty/);
r = run("\n### Fixed\n- x\n", "v4.5.0", today);
assert.equal(r.code, 1); assert.match(r.err, /0 day\(s\) old: releases batch weekly, the next from \d{4}-\d\d-\d\d/);
assert.equal(run("\n### Fixed\n- x\n", "v4.5.0", today, "--urgent").out, "4.5.1", "an urgent fix may come sooner");
r = run("\n### Added\n- y\n", "v4.5.0", today, "--urgent");
assert.equal(r.code, 1); assert.match(r.err, /--urgent is a PATCH only/);
console.log("next-version: OK");
