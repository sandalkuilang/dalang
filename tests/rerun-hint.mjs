#!/usr/bin/env node
// node tests/rerun-hint.mjs — the rerun hint names the command that was actually run: studio.mjs final for a Studio film,
// express.mjs final with its own --quality, plain express.mjs for the default.
import assert from "node:assert/strict";
import fs from "node:fs";
import { rerunHint } from "../scripts/rerun_hint.mjs";

assert.equal(rerunHint({ cmd: "final", studio: true, quality: "high" }), "node studio.mjs final .");
assert.equal(rerunHint({ cmd: "final", quality: "high" }), "node express.mjs final . --quality high");
assert.equal(rerunHint({ cmd: "final", quality: "looks" }), "node express.mjs final .", "the default quality adds no flag");
assert.equal(rerunHint({ cmd: "assemble" }), "node express.mjs assemble .");
// studio.mjs marks its express calls, and express.mjs uses the helper
const studio = fs.readFileSync(new URL("../scripts/studio.mjs", import.meta.url), "utf8");
const express = fs.readFileSync(new URL("../scripts/express.mjs", import.meta.url), "utf8");
assert.match(studio, /DALANG_RUNNER: 'studio'/, "studio.mjs tells express.mjs it is the runner");
assert.match(express, /rerunHint\(/, "express.mjs builds its rerun hint with rerunHint");
console.log("ok  rerun hint names the runner that was called");
