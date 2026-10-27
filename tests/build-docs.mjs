#!/usr/bin/env node
// node tests/build-docs.mjs — the Step 5 / Step 6 text of references/look-build.md agrees with the parallel build
// ("Parallel build: pilot, then shot groups"). Group subagents are told to follow Step 6 items 3-6, so those items must not
// send them to the shared root template with absolute times, and Step 5 must not send the style-frame scenes only there.
// Legitimate side: a film under 3 groups still builds in `src/index.tpl.html`, and item 4 still names it.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(fileURLToPath(new URL("../references/look-build.md", import.meta.url)), "utf8");
const between = (from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i + 1); assert.ok(i >= 0 && j > i, `look-build.md: "${from}" .. "${to}"`); return src.slice(i, j); };
const step5 = between("## Step 5 —", "## Step 6 —");
const step6 = between("## Step 6 —", "### Parallel build");
const parallel = src.slice(src.indexOf("### Parallel build"));
const item = (text, n) => { const m = text.match(new RegExp(`^${n}\\. .*(?:\\n   .*)*`, "m")); assert.ok(m, `item ${n}`); return m[0]; };

// Step 5 seeds the first template, whichever it is (the pilot group's with 3+ groups), never only the root template.
assert.doesNotMatch(step5, /copies these scenes into `src\/index\.tpl\.html`/, "Step 5 still sends the style-frame scenes only to src/index.tpl.html");
assert.match(step5, /Step 6 [^.]*these scenes/, "Step 5 must still say Step 6 starts from the style-frame scenes");

// Item 4 (the one every group subagent follows) names the template as a variable and points to the group form.
const i4 = item(step6, 4);
assert.match(i4, /fill_times\.mjs <template> <output>/, "item 4 runs fill_times on 'the template', not on src/index.tpl.html index.html only");
assert.match(i4, /Parallel build/, "item 4 points to the group form of the template");
assert.match(i4, /src\/index\.tpl\.html/, "item 4 still names the root template for a film under 3 groups");
assert.doesNotMatch(i4, /fill_times\.mjs src\/index\.tpl\.html index\.html/, "item 4 still hard-codes the root template");

// The parallel section says what a group subagent edits and what it never touches, and covers the lint.
assert.match(parallel, /never (?:edits?|touch(?:es)?) `src\/index\.tpl\.html`/, "group subagents must be told not to touch the shared root template");
assert.match(parallel, /item 4[^.]*\{\{beat - first\}\}|\{\{beat - first\}\}[^.]*item 4/, "group subagents must be told how item 4 reads for a group (local times)");
assert.match(parallel, /timing_lint\.mjs/, "the parallel section must say Step 7's timing lint follows the hosts into the groups");
console.log("ok  Step 5 / Step 6 item 4 agree with the parallel build; group subagents are told to leave the root template");
