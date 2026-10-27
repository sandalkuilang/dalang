#!/usr/bin/env node
// node tests/reading.mjs — scripts/state.mjs `next` and `reading` (the per-step reading list and its budget) against
// the repo's references, fixture video projects and fixture skill copies. Covers: the reading table's headings all
// exist and every section is within the 8 KB budget; `next` finds the step from a project's files and prints that
// step's commands only (the same strings as `reading --json`); every printed command runs from any folder; the gate
// approvals are unchanged (a gate cannot be approved out of order, a stale approval is not approved); and the check
// fails on a section over budget, a heading that is gone, a bad lesson tag and a total over 60 KB.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const state = path.join(root, "scripts", "state.mjs");
const SECTION_MAX = 8192, TOTAL_MAX = 61440;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-reading-"));
const run = (...args) => { const r = spawnSync(process.execPath, [state, ...args], { encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const mk = (name) => { const p = path.join(tmp, name); fs.mkdirSync(p, { recursive: true }); return p; };
const put = (proj, rel, text = "x\n") => { const p = path.join(proj, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const skillCopy = (name) => { const p = mk(name); fs.cpSync(path.join(root, "references"), path.join(p, "references"), { recursive: true }); return p; };
const edit = (skill, file, fn) => { const p = path.join(skill, "references", file); fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"))); };
// A Gate 3 benchmark verdict (every row within 1 point of the board): approve 3 needs one.
const BENCH = ["Detail density", "Material truth", "Light and shadow", "Text system", "Overlays caused by physics", "Framing", "Macro quality"]
  .map((r) => `| ${r} | 4 | 4 | |`).join("\n") + "\n";
const filler = (bytes) => Array.from({ length: Math.ceil(bytes / 50) }, (_, i) => `Filler line ${String(i).padStart(4, "0")} for the section budget check...`).join("\n") + "\n";
const after = (heading, text) => (src) => { const i = src.indexOf(heading + "\n"); assert.ok(i >= 0, `fixture heading ${heading} not in the source`); const j = i + heading.length + 1; return src.slice(0, j) + text + src.slice(j); };

try {
  // 1. The repo itself: the table resolves, every section fits, the total fits.
  const real = run("reading", "--json");
  assert.equal(real.code, 0, `reading --json on the repo: ${real.err}`);
  const json = JSON.parse(real.out);
  assert.deepEqual(json.errors, [], "no errors on the repo");
  assert.ok(json.total <= TOTAL_MAX, `Steps 0–8 read ${json.total} B, over the budget`);
  for (let n = 0; n <= 8; n++) {
    const s = json.steps[n];
    assert.ok(s, `step ${n} present`);
    assert.ok(s.read.length > 0 && s.commands.read.length > 0, `step ${n} has something to read`);
    for (const e of [...s.read, ...s.refs, ...s.sub]) assert.ok(e.bytes <= SECTION_MAX, `step ${n}: ${e.file} "${e.heading}" is ${e.bytes} B`);
    assert.ok(s.lessonsBytes <= SECTION_MAX, `step ${n}: lessons ${s.lessonsBytes} B`);
  }
  const plain = run("reading");
  assert.equal(plain.code, 0);
  assert.match(plain.out, /Total read, Steps 0–8: [\d.]+ KB of 60 KB/);
  assert.equal(run("reading", "--json", "--skill", mk("no-skill")).code, 1, "a skill copy without references fails, never passes");

  // 2. `next` walks a fixture project: the step from the files, only that step's commands, approvals unchanged.
  const printed = (out) => { // the lines of the "Read now" block, nothing else
    const lines = out.split("\n"); const i = lines.findIndex((l) => l.startsWith("Read now"));
    assert.ok(i >= 0, `no "Read now" block in:\n${out}`);
    const cmds = []; for (const l of lines.slice(i + 1)) { if (!l.startsWith("sed -n ")) break; cmds.push(l); }
    return cmds;
  };
  const at = (proj, n, extra = []) => {
    const r = run("next", proj, ...extra);
    assert.equal(r.code, 0, `next at step ${n}: ${r.err}`);
    assert.ok(r.out.startsWith(`Step ${n} `), `expected Step ${n}, got: ${r.out.split("\n")[0]}`);
    assert.deepEqual(printed(r.out), json.steps[n].commands.read, `step ${n} prints exactly its own reading list`);
    return r.out;
  };
  const ok = (proj, ...a) => { const r = run(...a, proj); assert.equal(r.code, 0, `${a.join(" ")}: ${r.err}${r.out}`); return r; };
  const proj = mk("video");
  at(proj, 0);
  put(proj, "PRODUCTION.md", "# PRODUCTION\n");
  at(proj, 1);
  put(proj, "BRIEF.md");
  assert.match(at(proj, 3), /Optional Step 2/, "no script yet: the optional reference step is named");
  put(proj, "script.md"); put(proj, "narration.txt");
  assert.doesNotMatch(at(proj, 3), /Optional Step 2/);
  ok(proj, "approve", "1");
  at(proj, 4);
  put(proj, "audio/beats.json", "[]\n");
  ok(proj, "approve", "2");
  at(proj, 5);
  put(proj, "SPEC.md"); put(proj, "storyboard.md"); put(proj, "style-frames/a.png");
  put(proj, "review/benchmark.md", BENCH);
  ok(proj, "approve", "3");
  at(proj, 6);
  put(proj, "index.html", "<html></html>\n");
  at(proj, 6); // a draft file alone is not a finished build
  ok(proj, "log", "6 Build | index.html | -");
  at(proj, 7);
  ok(proj, "approve", "4");
  at(proj, 8);
  at(proj, 2, ["--step", "2"]);
  const bad = run("next", proj, "--step", "9");
  assert.equal(bad.code, 1, "--step 9 is refused");
  assert.match(bad.err, /--step must be 0–8/);
  assert.equal(run("next", proj, "--step", "x").code, 1);
  put(proj, "script.md", "edited after the approval\n"); // gate 1 goes STALE: the script is back in work
  assert.match(run(proj).out, /Gate 1 .*STALE/);
  at(proj, 3);
  // the plain status points to the reading list
  assert.match(run(proj).out, /Reading list: node '.*state\.mjs' next /);

  // Gate approvals are unchanged: out of order refused, a gate is "approved" only while fresh.
  const g = mk("gates");
  put(g, "script.md"); put(g, "narration.txt"); put(g, "audio/beats.json", "[]\n");
  const early = run("approve", "2", g);
  assert.equal(early.code, 1);
  assert.match(early.err, /approve it first/);
  assert.equal(run("check", "1", g).code, 3, "check 1 before approval");
  ok(g, "approve", "1");
  assert.equal(run("check", "1", g).code, 0, "check 1 after approval");
  ok(g, "approve", "2");
  put(g, "narration.txt", "changed\n");
  assert.equal(run("check", "1", g).code, 3, "check 1 after a change");
  assert.equal(run("approve", "3", g).code, 1, "gate 3 with missing files");

  // Step 6 (build) is logged only from an existing storyboard.md and a fresh Gate 3; approve 3 records the storyboard lint.
  const bl = mk("buildlog");
  const prod = () => (fs.existsSync(path.join(bl, "PRODUCTION.md")) ? fs.readFileSync(path.join(bl, "PRODUCTION.md"), "utf8") : "");
  const refused = (line, re, why) => { const before = prod(); const r = run("log", line, bl); assert.equal(r.code, 1, `${why}: ${r.out}`); assert.match(r.err, re, why); assert.equal(prod(), before, `${why}: PRODUCTION.md unchanged`); };
  put(bl, "script.md"); put(bl, "narration.txt"); put(bl, "audio/beats.json", "[]\n");
  ok(bl, "approve", "1"); ok(bl, "approve", "2");
  refused("6 Build | index.html | -", /storyboard\.md is missing/, "no storyboard");
  ok(bl, "log", "5 Look | x | -"); // other steps are never refused
  ok(bl, "log", "Step 7 | x | -");
  put(bl, "SPEC.md"); put(bl, "storyboard.md"); put(bl, "style-frames/a.png");
  put(bl, "review/benchmark.md", BENCH);
  refused("6 Build | index.html | -", /gate 3 is waiting for approval/, "gate 3 unapproved");
  refused("Build | index.html | -", /gate 3/, "a line that starts with Build counts as Step 6");
  const ap = ok(bl, "approve", "3"); // the storyboard is "x": unlintable, the approval still goes through
  const lintOf = () => JSON.parse(fs.readFileSync(path.join(bl, "state.json"), "utf8")).approvals[3].lint;
  assert.equal(typeof lintOf(), "string");
  assert.notEqual(lintOf(), "OK", "an unlintable storyboard is never recorded as OK");
  assert.match(ap.out, /Storyboard lint: /);
  ok(bl, "log", "6 Build | index.html | -");
  put(bl, "storyboard.md", "edited after the approval\n"); // gate 3 STALE
  refused("Step 6 | index.html | -", /gate 3 is STALE/, "gate 3 stale");
  const sbhead = "| # | Time | Beat | Job | Size · angle · lens | What we see | Camera | Subject action | Transition | SFX | Overlay |\n|---|---|---|---|---|---|---|---|---|---|---|\n";
  const sbrow = (i, size) => `| ${i} | ${i * 2 - 2}.00–${i * 2}.00 | b | A | ${size} | the hero mid-action | push 1.00→1.04 | the hero acts (stock clip) | cut | s | k |\n`;
  put(bl, "storyboard.md", sbhead + sbrow(1, "wide · high · 24 mm") + sbrow(2, "medium · eye-level · 50 mm") + sbrow(3, "close-up · low · 85 mm"));
  ok(bl, "approve", "3");
  assert.equal(lintOf(), "OK", "a clean storyboard is recorded as OK");

  // 3. Every printed command is ready: runs from any folder, prints its section.
  const firstLine = (file) => fs.readFileSync(path.join(root, "references", file), "utf8").split("\n")[0];
  for (let n = 0; n <= 8; n++) {
    const s = json.steps[n];
    for (const tier of ["read", "refs", "sub"]) {
      assert.equal(s.commands[tier].length > 0, s[tier].length > 0, `step ${n} ${tier}: commands for entries`);
      s.commands[tier].forEach((cmd) => {
        assert.ok(cmd.includes(root), "absolute path");
        const r = spawnSync("sh", ["-c", cmd], { cwd: os.tmpdir(), encoding: "utf8" });
        assert.equal(r.status, 0, `step ${n} ${tier}: ${cmd}\n${r.stderr}`);
        assert.ok(r.stdout.trim(), `step ${n} ${tier}: empty output for ${cmd}`);
        const first = r.stdout.split("\n")[0];
        assert.ok(s[tier].some((e) => e.heading === first || (e.heading === null && firstLine(e.file) === first)), `step ${n} ${tier}: first line "${first}" is no entry's heading`);
      });
    }
  }

  // 3b. The refs tier is a look-up index, not reading: one line per section (its heading and the exact sed command),
  // no body printed, outside the 60 KB total (which counts what "Read now" and the lesson headlines print).
  for (let n = 0; n <= 8; n++) {
    const s = json.steps[n];
    const out = run("next", mk(`p-index-${n}`), "--step", String(n)).out;
    const lines = out.split("\n"); const i = lines.findIndex((l) => l.startsWith("Look up when needed"));
    if (!s.refs.length) { assert.equal(i, -1, `step ${n}: no refs, no index`); continue; }
    assert.ok(i >= 0, `step ${n}: an index block "Look up when needed" in:\n${out}`);
    const idx = []; for (const l of lines.slice(i + 1)) { if (!l.startsWith("sed -n ")) break; idx.push(l); }
    assert.equal(idx.length, s.refs.length, `step ${n}: one index line per section, none merged into a range`);
    s.refs.forEach((e, k) => {
      assert.ok(idx[k].startsWith(s.commands.refs[k]), `step ${n}: line ${k} starts with the exact command`);
      assert.ok(idx[k].includes((e.heading ?? "").replace(/^#+ /, "")), `step ${n}: line ${k} names the heading "${e.heading}"`);
    });
    const body = spawnSync("sh", ["-c", s.commands.refs[0]], { encoding: "utf8" }).stdout.split("\n").filter((l) => l.trim() && !l.startsWith("#"))[0];
    if (body) assert.ok(!out.slice(out.indexOf("Look up when needed")).includes(body), `step ${n}: the index prints no section body`);
  }

  // 4. Fixture skills: the check fails where it must.
  const rd = (skill) => run("reading", "--skill", skill);
  const step0 = "## Step 0 — Setup (once)";
  const a = skillCopy("s-over");
  edit(a, "brief.md", after(step0, filler(9000)));
  const ra = rd(a);
  assert.equal(ra.code, 1, "a section over 8 KB fails");
  assert.ok(ra.err.includes("brief.md") && ra.err.includes("Step 0 — Setup") && ra.err.includes("8 KB"), `names file, heading and budget:\n${ra.err}`);

  const b = skillCopy("s-heading");
  edit(b, "look-build.md", (s) => s.replace("## Step 6 — Build (hand off to /hyperframes)", "## Step 6 — Building"));
  const rb = rd(b);
  assert.equal(rb.code, 1, "a heading the table names that is gone fails");
  assert.match(rb.err, /not found/);

  const c = skillCopy("s-tag");
  edit(c, "lessons.md", (s) => s.replace(/^- \[\d(,\d)*\] /m, "- [9] "));
  const rc = rd(c);
  assert.equal(rc.code, 1, "a lesson tag outside 0–8 fails");
  assert.match(rc.err, /lessons\.md:\d+/);

  // Every lesson line carries a step tag: an untagged "- **" line fails (it used to be guessed to hold everywhere),
  // naming the line; a tagged one stays at its own steps; the repo has none untagged.
  const rd2 = (skill) => run("reading", "--json", "--skill", skill);
  const u = skillCopy("s-untagged");
  edit(u, "lessons.md", (s) => s.trimEnd() + "\n- **Untagged fixture lesson** has no step tag.\n");
  const ru = rd2(u);
  assert.equal(ru.code, 1, "an untagged lesson line fails the check");
  assert.match(ru.err, /lessons\.md:\d+.*step tag/, `names the line and asks for a step tag:\n${ru.err}`);
  const t = skillCopy("s-tagged");
  edit(t, "lessons.md", (s) => s.trimEnd() + "\n- [4] **Tagged fixture lesson** holds at Step 4 only.\n");
  const rt = rd2(t);
  assert.equal(rt.code, 0, `a tagged lesson is valid: ${rt.err}`);
  const st = JSON.parse(rt.out).steps;
  for (let n = 0; n <= 8; n++) assert.equal(st[n].lessons.includes("**Tagged fixture lesson**"), n === 4, `step ${n}: a tagged lesson stays at its own step`);
  const untaggedInRepo = fs.readFileSync(path.join(root, "references", "lessons.md"), "utf8").split("\n").filter((l) => /^\s*[-*+] (?!\[)/.test(l));
  assert.deepEqual(untaggedInRepo, [], "every lesson line in the repo has a step tag");
  const um = skillCopy("s-malformed");
  edit(um, "lessons.md", (s) => s.trimEnd() + "\n- A bullet with neither a tag nor a bold headline.\n");
  const rum = rd(um);
  assert.equal(rum.code, 1, "a lesson bullet the reader cannot parse fails, never skipped");
  assert.match(rum.err, /lessons\.md:\d+/);

  const d = skillCopy("s-total"); // every section stays under 8 KB; only the sum is over 60 KB
  let need = TOTAL_MAX - json.total + 300;
  const seen = new Set();
  const roomy = Object.values(json.steps).flatMap((s) => s.read).filter((e) => e.heading && !seen.has(e.file + e.heading) && seen.add(e.file + e.heading));
  for (const e of roomy.sort((x, y) => x.bytes - y.bytes)) { // most headroom first
    if (need <= 0) break;
    const add = Math.min(need, SECTION_MAX - e.bytes - 200);
    if (add < 100) continue;
    edit(d, e.file, after(e.heading, filler(add)));
    need -= add;
  }
  assert.ok(need <= 0, "the fixture could add enough text without breaking a section budget");
  const rdd = rd(d);
  assert.equal(rdd.code, 1, "a total over 60 KB fails");
  assert.match(rdd.err, /60 KB/);
  assert.doesNotMatch(rdd.err, /section budget/, "no single section is over its own budget");

  // The look-up index keeps the section checks (budget, heading) but is outside the Read-now total.
  const refHeading = "## Setup — VoiceStudio"; // Step 0's index entry in voice.md
  const e1 = skillCopy("s-index-over");
  edit(e1, "voice.md", after(refHeading, filler(9000)));
  const re1 = rd(e1);
  assert.equal(re1.code, 1, "an indexed section over 8 KB fails");
  assert.ok(re1.err.includes("voice.md") && re1.err.includes("8 KB"), `names the file and the budget:\n${re1.err}`);
  const e2 = skillCopy("s-index-gone");
  edit(e2, "voice.md", (s) => s.replace(refHeading, "## Setup — VoiceStudio, moved"));
  const re2 = rd(e2);
  assert.equal(re2.code, 1, "an indexed heading that is gone fails");
  assert.match(re2.err, /not found/);
  const e3 = skillCopy("s-index-room");
  edit(e3, "voice.md", after(refHeading, filler(1500)));
  const re3 = run("reading", "--json", "--skill", e3);
  assert.equal(re3.code, 0, `a bigger indexed section within 8 KB passes: ${re3.err}`);
  assert.equal(JSON.parse(re3.out).total, json.total, "indexed sections are outside the Read-now total");

  // 5. The table reaches every section it must. (a) No section of any reference (lessons.md aside: it is read by
  // headline and grep, never whole) is over the 8 KB budget, listed in the table or not: a section the table does
  // not list is a section the gate cannot see. (b) Every pointer in a step's "Read now" text to another reference
  // section has a line in that step's look-up index (or is read, or is for the subagent): the agent has a ready command.
  const refDir = path.join(root, "references");
  const refFiles = fs.readdirSync(refDir).filter((f) => f.endsWith(".md"));
  const linesOf = (f) => fs.readFileSync(path.join(refDir, f), "utf8").split("\n");
  const sections = (f) => { // [{ heading, from, to, bytes }] for every heading of any level, outside ``` fences
    const ls = linesOf(f); const hs = []; let fence = false;
    ls.forEach((l, i) => { if (/^\s*```/.test(l)) fence = !fence; else if (!fence && /^#{1,6} /.test(l)) hs.push(i); });
    return hs.map((h, k) => { const to = k + 1 < hs.length ? hs[k + 1] : ls.length; return { heading: ls[h], from: h + 1, to, bytes: Buffer.byteLength(ls.slice(h, to).join("\n").trimEnd() + "\n") }; });
  };
  for (const f of refFiles.filter((x) => x !== "lessons.md")) {
    for (const s of sections(f)) assert.ok(s.bytes <= SECTION_MAX, `${f} "${s.heading}" is ${s.bytes} B, over the 8 KB budget: split it with a ### heading and list its parts in state.mjs`);
  }
  // The one command that installs the three.js engine is in the index of the steps that build with it (5 and 6).
  for (const n of [5, 6]) {
    const cmds = json.steps[n].commands.refs;
    const hit = cmds.find((c) => { const r = spawnSync("sh", ["-c", c], { cwd: os.tmpdir(), encoding: "utf8" }); return /build\.mjs assets/.test(r.stdout) && /selfcheck\.mjs assets/.test(r.stdout); });
    assert.ok(hit, `step ${n}: the look-up index has a line whose section prints the engine install (build.mjs assets, selfcheck.mjs assets)`);
  }
  // A heading's number: "## 6. On-screen text" -> "6", "### 5.2 Contact" -> "5.2", "## Step 3 — Script" -> "3".
  const numOf = (h) => (h ?? "").match(/^#{1,6} (?:Step )?(\d+(?:\.\d+)?)(?=[.\s—:)]|$)/)?.[1] ?? null;
  const pointersOf = (line) => { // [{ file, nums? , quote?, any? }] found in one line of a step's Read-now text
    const out = []; const seenFiles = []; let last = null, lastEnd = 0;
    const re = /`([\w\/.-]+\.md)`|§\s?(\d+(?:\.\d+)?)(?:\s?[–-]\s?(\d+))?|"([^"]+)"|\bStep (\d+)\b/g;
    for (let m; (m = re.exec(line)); ) {
      const glued = /^\s*$/.test(line.slice(lastEnd, m.index)); // directly after the file mention
      if (m[1]) {
        last = refFiles.includes(m[1]) ? m[1] : null; lastEnd = re.lastIndex;
        if (last) { seenFiles.push(last); out.push({ file: last }); }
      } else if (m[2]) {
        const lo = Number(m[2]), hi = m[3] ? Number(m[3]) : lo;
        const nums = m[3] ? Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i)) : [m[2]];
        if (glued && last) { out.pop(); out.push({ file: last, nums }); lastEnd = re.lastIndex; }
        else if (seenFiles.length) out.push({ any: [...seenFiles], nums });
      } else if (m[4] && glued && last) { const p = out.at(-1); if (p?.file === last && !p.nums) { p.quote = m[4]; lastEnd = re.lastIndex; } }
      else if (m[5] && glued && last) { const p = out.at(-1); if (p?.file === last && !p.nums) { p.nums = [m[5]]; lastEnd = re.lastIndex; } }
    }
    return out;
  };
  const textOf = (e) => linesOf(e.file).slice(e.from - 1, e.to).join("\n").toLowerCase();
  const pointerProblems = (steps, readLinesOf) => {
    const bad = [];
    for (const [n, s] of Object.entries(steps)) {
      const have = [...s.read, ...s.refs, ...s.sub];
      const coversNum = (file, num) => have.some((e) => e.file === file && (e.heading === null || numOf(e.heading) === num));
      const exists = (file, num) => sections(file).some((x) => numOf(x.heading) === num);
      for (const [where, line] of readLinesOf(s)) for (const p of pointersOf(line)) {
        if (p.any) { // a bare § after several files: covered when some file in the line has it
          for (const num of p.nums) if (p.any.some((f) => exists(f, num)) && !p.any.some((f) => coversNum(f, num))) bad.push(`step ${n} ${where}: §${num} (${[...new Set(p.any)].join(", ")}) has no index line`);
        } else if (p.nums) {
          for (const num of p.nums) {
            if (!exists(p.file, num)) bad.push(`step ${n} ${where}: ${p.file} has no section ${num}`);
            else if (!coversNum(p.file, num)) bad.push(`step ${n} ${where}: ${p.file} §${num} has no index line`);
          }
        } else if (p.quote) {
          if (!have.some((e) => e.file === p.file && (e.heading === null || textOf(e).includes(p.quote.toLowerCase())))) bad.push(`step ${n} ${where}: ${p.file} "${p.quote}" has no index line`);
        } else if (!have.some((e) => e.file === p.file)) bad.push(`step ${n} ${where}: ${p.file} has no index line`);
      }
    }
    return bad;
  };
  const readLines = (s) => s.read.flatMap((e) => linesOf(e.file).slice(e.from - 1, e.to).map((l, i) => [`${e.file}:${e.from + i}`, l]).filter(([, l]) => !/^\s*```/.test(l)));
  // the pointer reader itself, on lines of every form the references use
  assert.deepEqual(pointersOf("see `craft-rules.md` §6 (lower third)"), [{ file: "craft-rules.md", nums: ["6"] }]);
  assert.deepEqual(pointersOf('`voice.md` "Clone")'), [{ file: "voice.md", quote: "Clone" }]);
  assert.deepEqual(pointersOf("`camera-motion.md` §1–3, §8"), [{ file: "camera-motion.md", nums: ["1", "2", "3"] }, { any: ["camera-motion.md"], nums: ["8"] }]);
  assert.deepEqual(pointersOf("`look-build.md` Step 6, item 7"), [{ file: "look-build.md", nums: ["6"] }]);
  assert.deepEqual(pointersOf("in `references/format.md` §6"), [], "a /hyperframes file is not a pointer into the skill");
  const loose = pointerProblems(json.steps, readLines);
  assert.deepEqual(loose, [], `a pointer in a step's text with no line in that step's look-up index:\n${loose.join("\n")}`);
  // the legitimate side: a pointer the step does read, or indexes, passes (a fixture step that points at its own and an indexed section)
  const fixSteps = { 9: { read: [{ file: "craft-rules.md", heading: "## 6. On-screen text", from: 39, to: 56 }], refs: [{ file: "voice.md", heading: "### Clone (VoiceStudio, free, local)", from: 46, to: 61 }], sub: [] } };
  const fixLines = () => [["fix:1", "captions per `craft-rules.md` §6 and `voice.md` \"Clone\""]];
  assert.deepEqual(pointerProblems(fixSteps, fixLines), [], "pointers covered by a read or an index entry pass");
  assert.equal(pointerProblems({ 9: { ...fixSteps[9], refs: [] } }, fixLines).length, 1, "the same text without the index entry is one problem");
  assert.equal(pointerProblems(fixSteps, () => [["fix:1", "`script-voice.md` §3"]]).length, 1, "a pointer into a section the step does not list is a problem");

  // 6. The accent budget agrees across the file: §5 and the §11 Restraint row allow the accent colour on ONE element
  // per shot, so no §12 layer may take it unconditionally (a headline over an impact numeral would break §5).
  const vd = fs.readFileSync(path.join(root, "references", "visual-direction.md"), "utf8");
  const sec = (re) => { const m = re.exec(vd); assert.ok(m, `section ${re} not found`); const rest = vd.slice(m.index + m[0].length); const n = rest.search(/\n## /); return n < 0 ? rest : rest.slice(0, n); };
  const s5 = sec(/\n## 5\. Restraint[^\n]*\n/), s11 = sec(/\n## 11\. Review rubric[^\n]*\n/), s12 = sec(/\n## 12\. Information layers[^\n]*\n/);
  const row = (s, name) => s.split("\n").find((l) => l.startsWith(`| ${name} |`)) || "";
  const bullet = (s, name) => s.split("\n").find((l) => l.startsWith(`- **${name}**`)) || "";
  // the attack: the headline's key term and the impact numeral both take the accent colour, so a shot with both has two
  assert.ok(row(s12, "Claim headline"), "headline row present");
  assert.doesNotMatch(row(s12, "Claim headline"), /accent/i, "the headline's key term is styled without the accent colour");
  assert.doesNotMatch(bullet(s12, "Impact numeral"), /shot's one accent/, "the numeral is not unconditionally the shot's one accent");
  assert.match(s12, /accent budget/i, "§12 states the accent budget");
  assert.match(s12, /active word[^\n]*\bink\b/i, "§12 says what the caption's active word does when the numeral holds the accent");
  // the legitimate side: the headline key term is still styled (italic + underline), the numeral is still an accent
  // holder when it is on screen, and §5 and the Restraint row still allow exactly one accent element per shot
  assert.match(row(s12, "Claim headline"), /italic/);
  assert.match(row(s12, "Claim headline"), /underline/);
  assert.match(bullet(s12, "Impact numeral"), /accent/);
  assert.match(s5, /accent colour appears on \*\*one\*\* element per shot/);
  assert.match(row(s11, "Restraint"), /accent used once/);

  // a trim must not join two list items on one line ("... 0.25–4.- **Calmer or faster ...": the second item loses its bullet)
  const joined = (text) => text.split("\n").filter((l) => /\S- \*\*[^*\n]+\*\*/.test(l));
  assert.equal(joined("- **Audition:** `--speed` 0.25–4.- **Calmer or faster approved take:** `--tempo`").length, 1, "two bullets on one line are caught");
  assert.equal(joined("- **Audition:** `--speed` 0.25–4.\n- **Calmer or faster approved take:** `--tempo`\n  - **Nested:** item\n| a | **b** |").length, 0, "separate and nested bullets pass");
  for (const f of fs.readdirSync(path.join(root, "references")).filter((f) => f.endsWith(".md"))) {
    assert.deepEqual(joined(fs.readFileSync(path.join(root, "references", f), "utf8")), [], `${f}: a list item joined to the previous one on a single line`);
  }

  // Express (BRIEF.md "mode: express"): Steps 5–7 read express.md only, Step 3 adds it, and Gate 3 needs no benchmark.
  {
    const p = mk("express");
    fs.writeFileSync(path.join(p, "PRODUCTION.md"), "# P\n");
    fs.writeFileSync(path.join(p, "BRIEF.md"), "topic: any\nmode: express\n");
    for (const st of ["5", "6", "7"]) {
      const r = run("next", p, "--step", st);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /\(express\)/);
      assert.match(r.out, /express\.md/);
      assert.doesNotMatch(r.out, /look-build\.md|qc\.md|Look up when needed/, `express Step ${st} lists no Studio section`);
    }
    assert.match(run("next", p, "--step", "3").out, /script-voice\.md[\s\S]*express\.md/, "express Step 3 keeps its own sections and adds express.md");
    for (const f of ["script.md", "narration.txt", "SPEC.md", "storyboard.md"]) fs.writeFileSync(path.join(p, f), "x\n");
    fs.mkdirSync(path.join(p, "audio"), { recursive: true }); fs.writeFileSync(path.join(p, "audio", "beats.json"), "{}");
    fs.mkdirSync(path.join(p, "style-frames"), { recursive: true }); fs.writeFileSync(path.join(p, "style-frames", "a.png"), "x");
    for (const g of ["1", "2"]) assert.equal(run("approve", g, p, "--by", "agent").code, 0);
    const g3 = run("approve", "3", p, "--by", "agent");
    assert.equal(g3.code, 0, g3.err);
    assert.match(g3.out, /Benchmark: none \(express\)/);
    fs.writeFileSync(path.join(p, "BRIEF.md"), "topic: any\n");
    assert.match(run("next", p, "--step", "5").out, /look-build\.md/, "without mode: express, Step 5 is Studio");
  }

  console.log("reading: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
