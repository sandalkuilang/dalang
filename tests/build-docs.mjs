#!/usr/bin/env node
// node tests/build-docs.mjs — the Step 5 / Step 6 text of references/look-build.md agrees with the parallel build
// ("Parallel build: pilot, then shot groups"). Group subagents are told to follow Step 6 items 3-6, so those items must not
// send them to the shared root template with absolute times, and Step 5 must not send the style-frame scenes only there.
// Legitimate side: a film under 3 groups still builds in `src/index.tpl.html`, and item 4 still names it.
// Also: scene code is only written by builder subagents (the pilot, a short film whole, the groups, the assembly, each QC
// fix round); look-build "Parallel build", review.md How item 3, qc.md Step 7, SKILL.md and evals.md say so.
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

// Scene code stays in builder subagents (pilot, a short film whole, groups, assembly, each QC fix round).
const read = f => fs.readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), "utf8");
assert.doesNotMatch(parallel, /in the main context/, "Parallel build still builds the pilot, a short film or the assembly in the main context");
assert.match(parallel, /never writes, patches or reads scene code/, "Parallel build must say the main agent never touches scene code");
assert.match(parallel, /under 3 groups[^.]*whole film|whole film[^.]*under 3 groups/i, "a film under 3 groups is built whole by one builder subagent");
assert.match(parallel, /Each QC fix round/, "the table must give each QC fix round to a builder subagent");
assert.match(parallel, /fixed \/ not fixed/, "a fix round returns fixed / not fixed per finding");
const review = read("references/review.md");
const how = review.slice(review.indexOf("## How"), review.indexOf("## Sound-off"));
const r3 = how.match(/^3\. .*$/m)?.[0] ?? "";
assert.doesNotMatch(r3, /builder session/, "review.md item 3 still fixes in the builder session");
assert.match(r3, /builder subagent/, "review.md item 3 must fix in a builder subagent");
assert.match(review, /never a fork or a follow-up of the builder/, "the reviewer must stay a fresh agent, never the builder");
const qc7 = read("references/qc.md").split("## Step 8")[0];
assert.match(qc7, /builder subagent[^.]*fixes every P0 and P1/, "qc.md Step 7 must send the fixes to a builder subagent");
const skill = read("SKILL.md");
assert.match(skill, /\*\*Scene code stays in builder subagents\.\*\*/, "SKILL.md Work fast must state the builder rule");
assert.match(skill, /\| Builder: [^|]*QC fix round/, "SKILL.md model table must list the builder jobs");
assert.match(read("references/evals.md"), /no `Write` or `Edit` to `src\/` or `assets\/\*\.js`/, "evals.md must check the main transcript for scene-code writes");
console.log("ok  Step 5 / Step 6 item 4 agree with the parallel build; scene code is only written by builder subagents");
