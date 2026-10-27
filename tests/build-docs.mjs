#!/usr/bin/env node
// node tests/build-docs.mjs — the Step 5 / Step 6 text of references/look-build.md agrees with the parallel build
// ("Parallel build: pilot, then shot groups"). Group subagents are told to follow Step 6 items 3-6, so those items must not
// send them to the shared root template with absolute times, and Step 5 must not send the style-frame scenes only there.
// Legitimate side: a film under 3 groups still builds in `src/index.tpl.html`, and item 4 still names it.
// Also: scene code is only written by builder subagents (the pilot, a short film whole, the groups, the assembly, each QC
// fix round); look-build "Parallel build", review.md How item 3, qc.md Step 7, SKILL.md and evals.md say so.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
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
assert.match(parallel, /never writes, patches or reads the film's scene code/, "Parallel build must say the main agent never touches scene code");
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
assert.match(read("references/evals.md"), /no `Write` or `Edit` to the film's `src\/` or `assets\/\*\.js`/, "evals.md must check the main transcript for scene-code writes");
console.log("ok  Step 5 / Step 6 item 4 agree with the parallel build; scene code is only written by builder subagents");

// The evals.md transcript check runs the way an agent copies it: it flags a main-context write to the film's scene code and
// stays silent on what the skill allows the main agent to write (the Step 5 style frames in `style-frames/src/`).
{
  const evals = read("references/evals.md");
  // The command takes the film's folder (the one holding BRIEF.md) after the transcript: a path is judged only relative
  // to it, so a parent folder's name (`~/src/videos/...`) can never decide it.
  const cmd = evals.match(/^node -e '([^\n]*BRIEF\.md[^\n]*)' <session>\.jsonl <project>/m)?.[1];
  assert.ok(cmd, "evals.md must carry the scene-code transcript command, given the transcript and the film's folder <project>");
  const dir = fs.mkdtempSync(`${os.tmpdir()}/evals-scene-`);
  const run = (args, name, input, side = false) => {
    const f = `${dir}/s.jsonl`;
    fs.writeFileSync(f, JSON.stringify({ isSidechain: side, message: { content: [{ type: "tool_use", name, input }] } }) + "\n");
    return spawnSync("node", ["-e", cmd, f, ...args], { encoding: "utf8" });
  };
  // The check needs <project>/BRIEF.md, so a case's film root is made real under the temp dir with a BRIEF.md in it; the
  // case's paths stay plain strings (they need not exist) and are shown without the temp dir prefix.
  const film = (root) => { const abs = dir + root; fs.mkdirSync(abs, { recursive: true }); fs.writeFileSync(`${abs.replace(/\/$/, "")}/BRIEF.md`, "x"); return abs; };
  const check = (name, input, side = false, root = "/p/film") =>
    run([film(root)], name, { ...input, file_path: dir + input.file_path }, side).stdout.trim().replaceAll(dir, "");
  try {
    // Forbidden: the film's own scene code, from the main context.
    assert.equal(check("Write", { file_path: "/p/film/src/index.tpl.html" }), "/p/film/src/index.tpl.html", "a Write to src/ must be flagged");
    assert.equal(check("Edit", { file_path: "/p/film/src/compositions/g1.tpl.html" }), "/p/film/src/compositions/g1.tpl.html", "an Edit to a group template must be flagged");
    assert.equal(check("Write", { file_path: "/p/film/assets/set.js" }), "/p/film/assets/set.js", "a Write to assets/*.js must be flagged");
    // Legitimate: the Step 5 style frames (look-build.md §5), a subagent's own write, other tools and files.
    assert.equal(check("Write", { file_path: "/p/film/style-frames/src/hook.js" }), "", "a style-frame write (Step 5, main agent) must not be flagged");
    assert.equal(check("Edit", { file_path: "/p/film/style-frames/src/index.tpl.html" }), "", "a style-frame template edit must not be flagged");
    assert.equal(check("Write", { file_path: "/p/film/src/index.tpl.html" }, true), "", "a builder subagent's write is not the main context's");
    assert.equal(check("Read", { file_path: "/p/film/src/index.tpl.html" }), "", "the check is about Write and Edit");
    assert.equal(check("Write", { file_path: "/p/film/BRIEF.md" }), "", "BRIEF.md is the main agent's");
    // A film under a folder named `src` (the user's videos folder in `~/src/`): the main agent's files are never flagged,
    // the film's own scene code still is.
    for (const f of ["BRIEF.md", "storyboard.md", "SPEC.md", "PRODUCTION.md", "QC-REVIEW.md"])
      assert.equal(check("Write", { file_path: `/x/src/videos/film/${f}` }, false, "/x/src/videos/film"), "", `${f} of a film under /x/src/ must not be flagged`);
    assert.equal(check("Write", { file_path: "/x/src/videos/film/src/index.tpl.html" }, false, "/x/src/videos/film"), "/x/src/videos/film/src/index.tpl.html", "the film's src/ under /x/src/ must still be flagged");
    // The class: the path is judged ONLY relative to the film's folder. Whatever the parent folders are called (src,
    // assets, style-frames, a trailing slash on the argument), the main agent's files and style frames are never flagged
    // and the film's scene code always is; a path outside the film is not this film's scene code.
    for (const root of ["/p/film", "/x/src/videos/film", "/x/assets/film", "/x/style-frames/src/film", "/x/src/assets/src/film/"]) {
      const r = root.replace(/\/$/, "");
      for (const f of ["BRIEF.md", "storyboard.md", "SPEC.md", "PRODUCTION.md", "QC-REVIEW.md", "style-frames/src/hook.js", "style-frames/src/index.tpl.html", "assets/bake/set.json", "assets/data/curve.js", "review/sheet.jpg"])
        for (const tool of ["Write", "Edit"])
          assert.equal(check(tool, { file_path: `${r}/${f}` }, false, root), "", `${tool} ${f} under ${root} must not be flagged`);
      for (const f of ["src/index.tpl.html", "src/compositions/g1.tpl.html", "src/set.js", "assets/set.js", "assets/film.js"])
        for (const tool of ["Write", "Edit"])
          assert.equal(check(tool, { file_path: `${r}/${f}` }, false, root), `${r}/${f}`, `${tool} ${f} under ${root} must be flagged`);
      assert.equal(check("Write", { file_path: `${r}/../other/src/a.js` }, false, root), "", `another film's src/ next to ${root} is not this film's`);
    }
    // Without the film's folder the check cannot judge a path: it fails loudly, never prints nothing (a silent pass).
    const bare = run([], "Write", { file_path: "/p/film/src/index.tpl.html" });
    assert.notEqual(bare.status, 0, "the check run without <project> must exit non-zero");
    assert.match(bare.stderr, /<project>/, "the check run without <project> must say it needs the film's folder");
    // A <project> that is not the film's folder reads as "clean" when only its presence is checked: a parent folder, a typo'd
    // sibling, the film's own src/, a missing folder, or a file all exit 2 with the usage line, never print nothing.
    const real = film("/p2/film");
    fs.mkdirSync(`${real}/src`, { recursive: true });
    fs.writeFileSync(`${real}/not-a-folder`, "x");
    const scene = { file_path: `${real}/src/index.tpl.html` };
    for (const [what, arg] of [["a parent folder", dir + "/p2"], ["a typo'd sibling", dir + "/p2/flim"], ["the film's own src/", `${real}/src`], ["a folder that is gone", dir + "/gone"], ["a file", `${real}/not-a-folder`], ["an empty argument", ""]]) {
      const r = run([arg], "Write", scene);
      assert.equal(r.status, 2, `<project> = ${what} must exit 2`);
      assert.equal(r.stdout, "", `<project> = ${what} must print no path`);
      assert.match(r.stderr, /usage:.*<project>/, `<project> = ${what} must print the usage line`);
    }
    assert.equal(run([real], "Write", scene).stdout.trim(), scene.file_path, "the film's folder itself still flags its scene code");
    // The class: a path is the film's only when it is the same file on disk (device and inode of it or a folder above it). Another spelling of the
    // film's folder (a symlink such as /tmp for /private/tmp, other letter case on a case-insensitive disk) must not turn
    // its scene code into `../…` and print nothing; a transcript with no path inside the film at all (another session,
    // another film) is unknown, not clean: exit 2.
    {
      let seq = 0;
      const tr = (entries) => { const f = `${dir}/t${seq++}.jsonl`; fs.writeFileSync(f, entries.map(([name, file_path, side = false]) => JSON.stringify({ isSidechain: side, message: { content: [{ type: "tool_use", name, input: { file_path } }] } })).join("\n") + "\n"); return f; };
      const go = (entries, proj) => spawnSync("node", ["-e", cmd, tr(entries), proj], { encoding: "utf8" });
      // Several transcripts of one run (a resumed session, a builder's own subagent file): the first, <project>, then the rest.
      const goAll = ([first, ...rest], proj) => spawnSync("node", ["-e", cmd, tr(first), proj, ...rest.map(tr)], { encoding: "utf8" });
      const realRoot = fs.realpathSync.native(real);
      const link = `${dir}/film-link`;
      fs.symlinkSync(realRoot, link);
      const set = `${realRoot}/src/set.js`;
      for (const [what, entries, proj] of [
        ["<project> a symlink to the film, paths by the real folder", [["Write", set]], link],
        ["<project> the real folder, paths through the symlink", [["Write", `${link}/src/set.js`]], realRoot],
        ["<project> and paths both through the symlink", [["Write", `${link}/src/set.js`]], link],
        ["a new file in a folder that is not there yet, through the symlink", [["Write", `${link}/assets/new.js`]], realRoot],
      ]) {
        const r = go(entries, proj);
        assert.equal(r.status, 0, `${what}: exit 0`);
        assert.equal(r.stdout.trim(), entries[0][1], `${what}: the scene write must be flagged`);
      }
      const upper = realRoot.replace(/film$/, "FILM");
      if (fs.existsSync(upper)) {
        assert.equal(go([["Write", set]], upper).stdout.trim(), set, "<project> in other letter case on a case-insensitive disk must still flag the scene write");
        assert.equal(go([["Write", set.replace("/film/", "/FILM/")]], realRoot).stdout.trim(), set.replace("/film/", "/FILM/"), "paths in other letter case on a case-insensitive disk must still be flagged");
      }
      // Another session's transcript (another film) holds no path of this film: exit 2, never a silent pass.
      const other = go([["Write", "/elsewhere/film2/src/set.js"], ["Write", "/elsewhere/film2/BRIEF.md"]], real);
      assert.equal(other.status, 2, "a transcript with no path inside the film must exit 2");
      assert.equal(other.stdout, "", "...and print no path");
      assert.match(other.stderr, /no path of/, "...and say why");
      // The other side: a transcript of this film whose scene code a builder wrote and the main agent did not is clean (exit 0,
      // nothing printed), also by symlink. The builder's write is the evidence that the transcript holds the build at all.
      const built = ["Write", `${realRoot}/src/index.tpl.html`, true];
      for (const [what, entries, proj] of [
        ["main-agent files only", [["Write", `${realRoot}/BRIEF.md`], ["Edit", `${realRoot}/storyboard.md`], built], real],
        ["main-agent files only, through the symlink", [["Write", `${link}/BRIEF.md`], ["Write", `${link}/style-frames/src/hook.js`], ["Edit", `${link}/src/set.js`, true]], realRoot],
        ["a read of scene code is not a write", [["Read", set], ["Write", `${realRoot}/BRIEF.md`], built], link],
      ]) {
        const r = go(entries, proj);
        assert.equal(r.status, 0, `${what}: a clean film transcript must exit 0`);
        assert.equal(r.stdout, "", `${what}: nothing to flag`);
      }
      // Finding: a transcript counts as this film's as soon as any one path of the film is in it, so another film's session
      // that read this film's BRIEF.md, or a Steps 1-4 session whose build went on in a resumed session, read as clean.
      for (const [what, entries] of [
        ["another film's session that read this film's BRIEF.md", [["Read", `${realRoot}/BRIEF.md`], ["Write", "/elsewhere/film2/src/set.js"]]],
        ["a Steps 1-4 session of this film (the build is in the next session)", [["Write", `${realRoot}/BRIEF.md`], ["Write", `${realRoot}/storyboard.md`]]],
      ]) {
        const r = go(entries, real);
        assert.equal(r.status, 2, `${what}: no scene-code write of this film seen, so unknown: exit 2`);
        assert.equal(r.stdout, "", `${what}: no path printed`);
        assert.match(r.stderr, /usage:.*<project>/, `${what}: the usage line names what to pass`);
      }
      // The other side: the run's sessions given together are judged as one run, a main-thread scene write in any of them flagged.
      const steps14 = [["Write", `${realRoot}/BRIEF.md`], ["Write", `${realRoot}/storyboard.md`]];
      const both = goAll([steps14, [["Write", `${realRoot}/SPEC.md`]], [built]], real);
      assert.equal(both.status, 0, "every session of a run, the builder's file included: exit 0");
      assert.equal(both.stdout, "", "every session of a run, all scene code by builders: nothing to flag");
      const resumed = goAll([steps14, [["Edit", set], built]], real);
      assert.equal(resumed.stdout.trim(), set, "a main-thread scene write in the resumed session must be flagged");
      // Finding: a symlinked src/ inside the film (shared code kept elsewhere) is still the film's src/.
      {
        const ext = `${dir}/ext/src`, shared = film("/p3/film");
        fs.mkdirSync(ext, { recursive: true });
        fs.symlinkSync(ext, `${shared}/src`);
        const w = `${shared}/src/set.js`;
        const r = go([["Write", `${shared}/BRIEF.md`], ["Write", w]], shared);
        assert.equal(r.stdout.trim(), w, "a main-thread write to a symlinked src/ inside the film must be flagged");
        const byTarget = go([["Write", `${shared}/BRIEF.md`], ["Write", `${ext}/set.js`]], shared);
        assert.equal(byTarget.stdout.trim(), `${ext}/set.js`, "the same src/ spelled by its target is still the film's");
        const clean = go([["Write", `${shared}/BRIEF.md`], ["Write", w, true]], shared);
        assert.equal(clean.status, 0, "a builder's write through the symlinked src/: exit 0");
        assert.equal(clean.stdout, "", "a builder's write through the symlinked src/: nothing to flag");
        fs.mkdirSync(`${dir}/ext/lib`, { recursive: true });
        const beside = go([["Write", `${dir}/ext/lib/set.js`], ["Write", w, true]], shared);
        assert.equal(beside.stdout, "", "a folder beside the symlink's target is not the film's");
      }
      // The class, as one invariant: exit 0 with nothing printed is never the default. It needs evidence that the transcripts
      // hold this film's build (a builder's write to its scene code); every transcript set without one exits 2, whatever else
      // it holds, and the same set plus a builder's write is clean.
      const without = [
        [],
        [["Read", set]],
        [["Read", `${realRoot}/BRIEF.md`]],
        [["Write", `${realRoot}/BRIEF.md`], ["Edit", `${realRoot}/storyboard.md`], ["Write", `${realRoot}/SPEC.md`]],
        [["Write", `${realRoot}/style-frames/src/hook.js`], ["Write", `${realRoot}/assets/engine/physics.js`], ["Write", `${realRoot}/assets/data/curve.js`]],
        [["Write", "/elsewhere/film2/src/set.js"], ["Write", `${link}/../film2/src/set.js`]],
        [["Read", `${realRoot}/src/index.tpl.html`], ["Read", `${link}/assets/set.js`]],
      ];
      // Any tool given a path, Read aside, writes: a tool the check does not list (MultiEdit, a new one) is never skipped.
      for (const tool of ["MultiEdit", "NotebookEdit", "SomeNewWriteTool"])
        assert.equal(go([["Write", `${realRoot}/BRIEF.md`], [tool, set], built], real).stdout.trim(), set, `a main-thread ${tool} to scene code must be flagged`);
      for (const entries of without) {
        const label = JSON.stringify(entries.map(([n, p, sd]) => [n, p.replaceAll(dir, ""), !!sd]));
        const r = go([["Write", "/elsewhere/film2/BRIEF.md"], ...entries], real);
        assert.ok(r.status === 2 && r.stdout === "", `${label}: no build seen must exit 2 and print nothing (got ${r.status} "${r.stdout.trim()}")`);
        const ok = go([...entries, built], real);
        assert.ok(ok.status === 0 && ok.stdout === "", `${label} + a builder's write: clean (got ${ok.status} "${ok.stdout.trim()}" ${ok.stderr.trim()})`);
      }
    }
    // An empty or unreadable transcript is a loud failure too, never an empty pass.
    for (const [what, body] of [["empty", ""], ["blank", "\n  \n"]]) {
      fs.writeFileSync(`${dir}/e.jsonl`, body);
      const r = spawnSync("node", ["-e", cmd, `${dir}/e.jsonl`, real], { encoding: "utf8" });
      assert.equal(r.status, 2, `an ${what} transcript must exit 2`);
      assert.match(r.stderr, /transcript/, `an ${what} transcript must say so`);
    }
    const missing = spawnSync("node", ["-e", cmd, `${dir}/none.jsonl`, real], { encoding: "utf8" });
    assert.notEqual(missing.status, 0, "a missing transcript must exit non-zero");
    assert.equal(missing.stdout, "", "a missing transcript must print no path");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // The rule's text names the exception, so a reader does not hand the style frames to a builder either.
  for (const [f, text] of [["SKILL.md", skill], ["references/look-build.md", parallel], ["references/evals.md", evals]])
    assert.match(text, /style-frames\/src\//, `${f}: the scene-code rule must say the Step 5 style frames (style-frames/src/) stay with the main agent`);
  console.log("ok  the evals.md scene-code check flags src/ and assets/*.js, not the Step 5 style frames");
}

// Look J's row and visual-direction §13 agree with quantity.js: dimension() is drawn on the frame's 2D canvas, over everything,
// so no part hides it; current (circuit.js flow) is a scene object and the nearer part does hide it.
{
  const looks = read("references/looks.md"), vd = read("references/visual-direction.md"), qty = read("engine/three/quantity.js");
  assert.match(qty, /dimension\(\) \(below\) is drawn on the frame's 2D canvas, not in the scene/, "quantity.js no longer says dimension() is a canvas overlay: update the look J and §13 text with it");
  const rowJ = looks.split("\n").find((l) => l.startsWith("| **J. Engineering cutaway**")) ?? "";
  assert.ok(rowJ, "looks.md has no look J row");
  assert.match(rowJ, /36 mm gauge.*textBand.*pinLabel.*torch\.js/, "look J's row must carry its defaults (lens, text band, pill labels) and the reference piece");
  assert.match(read("references/brief.md"), /engineering cutaway/i, "brief.md Step 1 must offer look J");
  const dimClause = rowJ.split(";").find((c) => /dimension lines/i.test(c)) ?? "";
  assert.ok(dimClause, "look J's row must mention dimension lines");
  assert.doesNotMatch(dimClause, /in the world|occlud|hidden by|behind (?:a|the|another) part/i, "look J's row says dimension lines are drawn in the world / hidden by parts, but dimension() is a canvas overlay");
  assert.match(rowJ, /dimension lines.{0,120}(?:over|on top of).{0,40}(?:part|frame)/i, "look J's row must say a dimension line is drawn over the frame, on top of parts");
  assert.match(rowJ, /current.{0,120}part.{0,20}(?:occlud|hides)/i, "look J's row must still say the current is in the world, hidden by a nearer part");
  const dimRow = vd.split("\n").find((l) => l.startsWith("| Dimension line |")) ?? "";
  assert.match(dimRow, /(?:over|on top of) (?:the )?(?:parts|frame)|no part hides/i, "§13's dimension row must say the line is drawn over the parts");
  console.log("ok  look J's row and §13 agree with quantity.js: dimension lines are a canvas overlay, current is occluded");
}
