#!/usr/bin/env node
// node tests/reading.mjs — scripts/state.mjs `next` and `reading` (the per-step reading list and its budget) against
// the repo's references, fixture video projects and fixture skill copies. Covers: the reading table's headings all
// exist and every section is within the 8 KB budget; `next` finds the step from a project's files and prints that
// step's commands only (the same strings as `reading --json`); every printed command runs from any folder; the gate
// approvals are unchanged (a gate cannot be approved out of order, a stale approval is not approved); and the check
// fails on a section over budget, a heading that is gone, a bad lesson tag, a Studio path over 60 KB, an Express path
// over 45 KB and a SKILL.md over 9.5 KB (or missing).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const state = path.join(root, "scripts", "state.mjs");
const SECTION_MAX = 8192, TOTAL_MAX = 61440, EXPRESS_MAX = 46080, SKILL_MAX = 9728;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-reading-"));
// Step 1's sometimes-rows print unless `next` knows they do not apply: no preflight record (a choice is assumed) and a
// series root holding one kit, so every row shows by default; section 5 covers the filters.
const kits = path.join(tmp, "kits"); fs.mkdirSync(path.join(kits, "chan"), { recursive: true }); fs.writeFileSync(path.join(kits, "chan", "SERIES.md"), "# kit\n");
const ENV = { ...process.env, DALANG_PREFLIGHT_STATE: path.join(tmp, "no-preflight.json"), DALANG_SERIES_DIR: kits };
const run = (...args) => { const env = typeof args.at(-1) === "object" ? { ...ENV, ...args.pop() } : ENV; const r = spawnSync(process.execPath, [state, ...args], { encoding: "utf8", env }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const mk = (name) => { const p = path.join(tmp, name); fs.mkdirSync(p, { recursive: true }); return p; };
const put = (proj, rel, text = "x\n") => { const p = path.join(proj, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
// a fixture skill: the repo's references and a small SKILL.md, so a fixture fails only on what it changes
const skillCopy = (name) => { const p = mk(name); fs.cpSync(path.join(root, "references"), path.join(p, "references"), { recursive: true }); fs.writeFileSync(path.join(p, "SKILL.md"), "---\nname: dalang\n---\nfixture\n"); return p; };
const edit = (skill, file, fn) => { const p = path.join(skill, "references", file); fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"))); };
// A Gate 3 benchmark verdict (every row within 1 point of the board): approve 3 needs one.
const BENCH = ["Detail density", "Material truth", "Light and shadow", "Text system", "Overlays caused by motion", "Framing", "Macro quality"]
  .map((r) => `| ${r} | 4 | 4 | |`).join("\n") + "\n";
// Files the gates' own checks pass on: Gate 1's lints (Promise, Takeaway, a clean sentence), Gate 2's pad (already padded).
const SCRIPT = "Promise: you learn one thing.\nTakeaway: the thing.\n", NARR = "{Hello there|hook}. This is a short film.\n";
const BEATS = JSON.stringify({ duration: 2, beats: [], pad: { lead: 1.45, tail: 1.35, take: "narration.wav" } }) + "\n";
const gate12 = (proj) => { put(proj, "script.md", SCRIPT); put(proj, "narration.txt", NARR); put(proj, "audio/beats.json", BEATS); put(proj, "audio/words.json", "[]\n"); };
const filler = (bytes) => Array.from({ length: Math.ceil(bytes / 50) }, (_, i) => `Filler line ${String(i).padStart(4, "0")} for the section budget check...`).join("\n") + "\n";
const after = (heading, text) => (src) => { const i = src.indexOf(heading + "\n"); assert.ok(i >= 0, `fixture heading ${heading} not in the source`); const j = i + heading.length + 1; return src.slice(0, j) + text + src.slice(j); };

try {
  // 1. The repo itself: the table resolves, every section fits, the total fits.
  const real = run("reading", "--json");
  assert.equal(real.code, 0, `reading --json on the repo: ${real.err}`);
  const json = JSON.parse(real.out);
  assert.deepEqual(json.errors, [], "no errors on the repo");
  assert.ok(json.total <= TOTAL_MAX, `Studio path reads ${json.total} B, over the budget`);
  assert.ok(json.express <= EXPRESS_MAX, `Express path reads ${json.express} B, over the budget`);
  assert.equal(json.skillMd, fs.statSync(path.join(root, "SKILL.md")).size, "SKILL.md measured");
  assert.ok(json.skillMd <= SKILL_MAX, `SKILL.md is ${json.skillMd} B, over the budget`);
  for (let n = 0; n <= 8; n++) {
    const s = json.steps[n];
    assert.ok(s, `step ${n} present`);
    assert.ok(s.read.length > 0 && s.commands.read.length > 0, `step ${n} has something to read`);
    for (const e of [...s.read, ...s.refs, ...s.sub]) assert.ok(e.bytes <= SECTION_MAX, `step ${n}: ${e.file} "${e.heading}" is ${e.bytes} B`);
    assert.ok(s.lessonsBytes <= SECTION_MAX, `step ${n}: lessons ${s.lessonsBytes} B`);
  }
  const plain = run("reading");
  assert.equal(plain.code, 0);
  assert.match(plain.out, /^SKILL\.md: [\d.]+ KB of 9\.5 KB$/m);
  assert.match(plain.out, /^Studio path \(Steps 0–8, Step 2 not counted\): [\d.]+ KB of 60 KB$/m);
  assert.match(plain.out, /^Express path \(express\.md for Steps 5–7\): [\d.]+ KB of 45 KB$/m);
  assert.match(plain.out, /^Optional Step 2 \(a reference video\), not counted: [\d.]+ KB$/m);
  const counted = Object.entries(json.steps).filter(([n]) => n !== "2").reduce((a, [, s]) => a + s.read.reduce((b, e) => b + e.bytes, 0) + s.lessonsBytes + s.jobsBytes, 0);
  assert.equal(json.total, counted, "the total counts every step but the optional Step 2");
  // the Express path: Steps 3 and 4 one reading (Step 4 counted once), Steps 5–7 swapped for express.md (what `next`
  // prints there), Step 2 not counted; each step's lesson and subagent lines counted with its sections
  {
    const p = mk("ex-path"); fs.writeFileSync(path.join(p, "BRIEF.md"), "mode: express\n");
    const kbOf = (out) => Number(out.match(/^Read now \(([\d.]+) KB\)/m)[1]);
    const block = (out, head) => { const ls = out.split("\n"); const i = ls.findIndex((l) => l.startsWith(head)); if (i < 0) return 0; let b = head.startsWith("Subagents") ? Buffer.byteLength(ls[i] + "\n") : 0; for (const l of ls.slice(i + 1)) { if (!l.startsWith("  ")) break; b += Buffer.byteLength(l + "\n"); } return b; };
    let sumKb = 0;
    for (const st of ["0", "1", "3", "5", "6", "7", "8"]) {
      const out = run("next", p, "--step", st).out;
      sumKb += kbOf(out) * 1024 + block(out, "Lessons (") + block(out, "Subagents (");
    }
    assert.ok(Math.abs(sumKb - json.express) < 600, `the Express path (${json.express} B) is what express \`next\` prints at Steps 0–8 (${Math.round(sumKb)} B)`);
    const s3 = run("next", p, "--step", "3").out, s4 = run("next", p, "--step", "4").out;
    const main = (s) => s.split("\n").slice(1).filter((l) => !l.startsWith("For the subagent")).join("\n").replace(/^Optional Step 2.*\n/m, "");
    assert.equal(main(s4), main(s3), "Express Step 4 (a resume) prints Step 3's reading: one reading for both");
    // Steps 3–4 are jobs: the main agent reads its part only; the writer and the voice job read the step with --sub
    const p3 = run("next", p, "--step", "3", "--print").out;
    assert.ok(p3.includes("\n## Express Steps 3–4 — Script and voice\n"), "Express Step 3 prints the main agent's part");
    for (const h of ["## Step 3 — Script → GATE 1", "## Step 4 — Voice + per-word timing → GATE 2"]) assert.ok(!p3.includes(`\n${h}\n`), `the main agent never reads ${h}`);
    assert.match(s3, /^For the subagent .*--step 3 --sub$/m); assert.match(s4, /^For the subagent .*--step 4 --sub$/m);
    const w = run("next", p, "--step", "3", "--sub").out, v = run("next", p, "--step", "4", "--sub").out;
    assert.ok(w.includes("\n## Step 3 — Script → GATE 1\n") && !w.includes("\n## Step 4 — Voice"), "the writer reads Step 3 only");
    assert.ok(v.includes("\n## Step 4 — Voice + per-word timing → GATE 2\n") && v.includes("\n## Use (Step 4)\n") && !v.includes("\n## Step 3 —"), "the voice job reads Step 4 only");
    assert.equal(run("next", p, "--step", "0", "--sub").code, 1, "a step without a subagent reading fails, never prints nothing");
  }
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
  put(proj, "script.md", SCRIPT); put(proj, "narration.txt", NARR);
  assert.doesNotMatch(at(proj, 3), /Optional Step 2/);
  ok(proj, "approve", "1");
  at(proj, 4);
  put(proj, "audio/beats.json", BEATS); put(proj, "audio/words.json", "[]\n");
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
  // --print: the same sections as text in one call, each headed by its file and first line, no sed commands
  {
    const p = run("next", proj, "--step", "6", "--print");
    assert.equal(p.code, 0, p.err);
    assert.doesNotMatch(p.out.split(/\nLessons \(|\nLook up when needed/)[0], /^sed -n /m, "the Read now block is text, not commands");
    const heads = [...p.out.matchAll(/^===== (\S+):(\d+)$/gm)].map((m) => `${m[1]}:${m[2]}`);
    assert.deepEqual(heads, json.steps[6].read.map((e) => `${e.file}:${e.from}`), "--print prints every section of the step");
    for (const e of json.steps[6].read) if (e.heading) assert.ok(p.out.includes(`\n${e.heading}\n`), `${e.heading} text printed`);
  }
  const bad = run("next", proj, "--step", "9");
  assert.equal(bad.code, 1, "--step 9 is refused");
  assert.match(bad.err, /--step must be 0–8/);
  assert.equal(run("next", proj, "--step", "x").code, 1);
  put(proj, "script.md", SCRIPT + "edited after the approval\n"); // gate 1 goes STALE: the script is back in work
  assert.match(run(proj).out, /Gate 1 .*STALE/);
  at(proj, 3);
  // the plain status points to the reading list
  assert.match(run(proj).out, /Reading list: node '.*state\.mjs' next /);

  // Gate approvals are unchanged: out of order refused, a gate is "approved" only while fresh.
  const g = mk("gates");
  gate12(g);
  const early = run("approve", "2", g);
  assert.equal(early.code, 1);
  assert.match(early.err, /approve it first/);
  assert.equal(run("check", "1", g).code, 3, "check 1 before approval");
  ok(g, "approve", "1");
  assert.equal(run("check", "1", g).code, 0, "check 1 after approval");
  ok(g, "approve", "2");
  put(g, "narration.txt", "Changed.\n");
  assert.equal(run("check", "1", g).code, 3, "check 1 after a change");
  assert.equal(run("approve", "3", g).code, 1, "gate 3 with missing files");

  // Step 6 (build) is logged only from an existing storyboard.md and a fresh Gate 3; approve 3 records the storyboard lint.
  const bl = mk("buildlog");
  const prod = () => (fs.existsSync(path.join(bl, "PRODUCTION.md")) ? fs.readFileSync(path.join(bl, "PRODUCTION.md"), "utf8") : "");
  const refused = (line, re, why) => { const before = prod(); const r = run("log", line, bl); assert.equal(r.code, 1, `${why}: ${r.out}`); assert.match(r.err, re, why); assert.equal(prod(), before, `${why}: PRODUCTION.md unchanged`); };
  gate12(bl);
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
  const sbrow = (i, size) => `| ${i} | ${i * 2 - 2}.00–${i * 2}.00 | b | A | ${size} | the hero mid-action | push 1.00→1.04 | the hero acts (3D) | cut | s | k |\n`;
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

  // 3b. The refs tier is a look-up index, not reading: one line per section ("<file> <from>,<to> <heading> (KB)", the
  // header naming the one sed shape and the references folder once), no body printed, outside the 60 KB total.
  for (let n = 0; n <= 8; n++) {
    const s = json.steps[n];
    const out = run("next", mk(`p-index-${n}`), "--step", String(n)).out;
    const lines = out.split("\n"); const i = lines.findIndex((l) => l.startsWith("Look up when needed"));
    if (!s.refs.length) { assert.equal(i, -1, `step ${n}: no refs, no index`); continue; }
    assert.ok(i >= 0, `step ${n}: an index block "Look up when needed" in:\n${out}`);
    assert.ok(lines[i].includes(path.join(root, "references")), `step ${n}: the index header names the references folder`);
    const idx = []; for (const l of lines.slice(i + 1)) { if (!/^[\w.-]+\.md \d+,\d+ /.test(l)) break; idx.push(l); }
    assert.equal(idx.length, s.refs.length, `step ${n}: one index line per section, none merged into a range`);
    assert.ok(!idx.some((l) => l.includes(root)), `step ${n}: no index line repeats the absolute path`);
    s.refs.forEach((e, k) => {
      assert.ok(idx[k].startsWith(`${e.file} ${e.from},${e.to} `), `step ${n}: line ${k} names the file and its exact lines`);
      assert.ok(idx[k].includes((e.heading ?? "").replace(/^#+ /, "")), `step ${n}: line ${k} names the heading "${e.heading}"`);
      const first = fs.readFileSync(path.join(root, "references", e.file), "utf8").split("\n")[e.from - 1];
      assert.ok(e.heading === null || first === e.heading, `step ${n}: line ${k}'s range starts at its heading`);
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
  // Studio-only sections first (Steps 5–7: Express reads express.md there), so the fixture tests the Studio budget; the
  // shared steps only when those have no room left. Step 2 is not in the total. Each section once, most headroom first.
  const sectionsOf = (pick) => Object.entries(json.steps).filter(([n]) => pick(n)).flatMap(([, s]) => s.read).filter((e) => e.heading && !seen.has(e.file + e.heading) && seen.add(e.file + e.heading)).sort((x, y) => x.bytes - y.bytes);
  const roomy = [...sectionsOf((n) => ["5", "6", "7"].includes(n)), ...sectionsOf((n) => !["2", "5", "6", "7"].includes(n))];
  for (const e of roomy) {
    if (need <= 0) break;
    const add = Math.min(Math.max(need, 100), SECTION_MAX - e.bytes - 200);
    if (add < 100) continue;
    const text = filler(add); // filler(n) is close to n bytes, not exact: count what was added
    edit(d, e.file, after(e.heading, text));
    need -= Buffer.byteLength(text);
  }
  assert.ok(need <= 0, "the fixture could add enough text without breaking a section budget");
  const rdd = rd(d);
  assert.equal(rdd.code, 1, "a total over 60 KB fails");
  assert.match(rdd.err, /Studio path.*60 KB/);
  assert.doesNotMatch(rdd.err, /section budget/, "no single section is over its own budget");

  // SKILL.md is loaded every session: over 9.5 KB fails, missing fails (never read as small).
  const sk1 = skillCopy("s-skill-over");
  fs.writeFileSync(path.join(sk1, "SKILL.md"), filler(11000));
  const rs1 = rd(sk1);
  assert.equal(rs1.code, 1, "a SKILL.md over 9.5 KB fails");
  assert.match(rs1.err, /SKILL\.md is [\d.]+ KB, over the 9\.5 KB budget/);
  const sk2 = skillCopy("s-skill-gone");
  fs.rmSync(path.join(sk2, "SKILL.md"));
  const rs2 = rd(sk2);
  assert.equal(rs2.code, 1, "a skill copy without SKILL.md fails");
  assert.match(rs2.err, /SKILL\.md not found/);
  // The Express path: express.md grows past 45 KB with every section within 8 KB: Express fails, Studio does not.
  const ex = skillCopy("s-express");
  {
    let need = EXPRESS_MAX - json.express + 300;
    for (const h of ["## Express Step 5 — Look in one frame", "## Express Step 6 — Build", "## Express Step 7 — Render → GATE 4", "## Express Steps 3–4 — Script and voice", "# Express mode (the default)"]) {
      if (need <= 0) break;
      const cur = fs.readFileSync(path.join(ex, "references", "express.md"), "utf8");
      const i = cur.indexOf(h + "\n"); const rest = cur.slice(i + h.length + 1); const j = rest.search(/^#{1,6} /m);
      const size = Buffer.byteLength(h + "\n" + (j < 0 ? rest : rest.slice(0, j)));
      const add = Math.min(Math.max(need, 100), SECTION_MAX - size - 200);
      if (add < 100) continue;
      const text = filler(add);
      edit(ex, "express.md", after(h, text));
      need -= Buffer.byteLength(text);
    }
    assert.ok(need <= 0, "the fixture could grow express.md without breaking a section budget");
  }
  const rex = rd(ex);
  assert.equal(rex.code, 1, "an Express path over 45 KB fails");
  assert.match(rex.err, /Express path.*45 KB/);
  assert.doesNotMatch(rex.err, /Studio path|section budget/, "the Studio path and each section stay within budget");

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
      const coversNum = (file, num) => have.some((e) => e.file === file && (e.heading === null || numOf(e.heading) === num || (e.sub && num.startsWith(`${numOf(e.heading)}.`)))); // a subtree entry covers its subsections
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
    const ex3 = run("next", p, "--step", "3").out;
    assert.match(ex3, /express\.md/, "express Step 3 reads express.md's part"); assert.match(ex3, /--step 3 --sub$/m, "and hands script-voice.md to the writer");
    for (const f of ["SPEC.md", "storyboard.md"]) fs.writeFileSync(path.join(p, f), "x\n");
    gate12(p);
    fs.mkdirSync(path.join(p, "style-frames"), { recursive: true }); fs.writeFileSync(path.join(p, "style-frames", "a.png"), "x");
    // a first approval prints the next reading: nothing new after Gate 1 (Step 4 was read with Step 3), Steps 5 and 6
    // after Gate 2, Step 7 after Gate 3; the express sections as text, no Studio section
    const e1 = run("approve", "1", p, "--by", "agent");
    assert.equal(e1.code, 0, e1.err);
    assert.match(e1.out, /^Next: Step 4 Voice \(express\) — read with Step 3, nothing new\.$/m);
    assert.doesNotMatch(e1.out, /Read now/);
    const e2 = run("approve", "2", p, "--by", "agent");
    assert.equal(e2.code, 0, e2.err);
    assert.deepEqual([...e2.out.matchAll(/^Step (\d) \S+ \(express\) — next after gate 2$/gm)].map((m) => m[1]), ["5", "6"], "Gate 2 prints Express Steps 5 and 6");
    assert.ok(e2.out.includes("\n## Express Step 5 — Look in one frame\n") && e2.out.includes("\n## Express Step 6 — Build\n"), "as text");
    assert.match(e2.out, /^  builder per group, and its one fix round: mid · medium$/m, "each subagent job with its model and effort");
    const g3 = run("approve", "3", p, "--by", "agent");
    assert.equal(g3.code, 0, g3.err);
    assert.match(g3.out, /Benchmark: none \(express\)/);
    assert.match(g3.out, /^Step 7 QC \(express\) — next after gate 3$/m);
    assert.doesNotMatch(g3.out, /look-build\.md|qc\.md:/);
    fs.writeFileSync(path.join(p, "BRIEF.md"), "topic: any\n");
    assert.match(run("next", p, "--step", "5").out, /look-build\.md/, "without mode: express, Step 5 is Studio");
  }

  // 5. The fast path: gates run their own checks; a first approval prints the next step; Step 0 brings Step 1; lessons
  // follow the mode; Step 1 drops look-ups that cannot apply.
  {
    const f = mk("fast");
    put(f, "script.md", "Title only\n"); put(f, "narration.txt", "{One; two|hook}.\n"); put(f, "narration.de.txt", "Eins.\n");
    const r1 = run("approve", "1", f);
    assert.equal(r1.code, 1, "lint problems refuse gate 1");
    assert.match(r1.err, /refused by numbers_lint \(exit \d\)|refused by narration_lint/, r1.err);
    assert.match(r1.err, /^  narration_lint: PROBLEM narration\.txt:1 ";"/m, "one line per problem, named by its lint");
    assert.match(r1.err, /^  narration_lint: PROBLEM script\.md has no "Promise:" line/m);
    assert.match(r1.err, /^  beats_lint narration\.de\.txt: PROBLEM narration\.txt:1 beat hook is missing/m, "a second narration is beat-linted");
    assert.ok(!fs.existsSync(path.join(f, "state.json")), "a refused gate records nothing");
    put(f, "script.md", SCRIPT); put(f, "narration.txt", NARR); put(f, "narration.de.txt", "{Hallo|hook}. Das ist ein kurzer Film.\n");
    const r1b = run("approve", "1", f, "--by", "agent");
    assert.equal(r1b.code, 0, r1b.err);
    assert.match(r1b.out, /^Step 4 Voice — next after gate 1$/m, "a first approval prints the next step");
    assert.ok(r1b.out.includes("\n### Step 4, the main agent's part: one voice job\n"), "as text, as next --print: the main agent's part");
    assert.ok(!r1b.out.includes("\n## Step 4 — Voice + per-word timing → GATE 2\n"), "the voice job's sections stay with the voice job");
    const again = run("approve", "1", f, "--by", "agent");
    assert.equal(again.code, 0); assert.doesNotMatch(again.out, /Read now/, "a re-approval prints no reading: it was read");
    put(f, "audio/beats.json", JSON.stringify({ duration: 2, beats: [] }));
    const r2 = run("approve", "2", f);
    assert.equal(r2.code, 1, "an unpaddable take refuses gate 2");
    assert.match(r2.err, /refused by pad_voice \(exit 1\)[\s\S]*pad_voice: .*words\.json/, r2.err);
    put(f, "audio/beats.json", BEATS); put(f, "audio/words.json", "[]\n");
    const r2b = run("approve", "2", f);
    assert.equal(r2b.code, 0, r2b.err);
    assert.match(r2b.out, /^Step 5 Look — next after gate 2$/m);
    assert.match(r2b.out, /^Subagents \(model · effort; top = omit `model`, mid = "sonnet", light = "haiku"[^\n]*\n  planner: SPEC\.md \+ storyboard\.md \+ review\/hero-shots\.json: top · high\n  hero builder [^\n]*: top · high\n  hero check [^\n]*: top · high$/m, "Studio Step 5 names its subagents' model and effort");
    // Step 0 prints Step 1 with it (the Brief follows preflight); --step 0 alone does not
    const z = run("next", mk("fresh"));
    assert.deepEqual([...z.out.matchAll(/^Step (\d) /gm)].map((m) => m[1]), ["0", "1"]);
    assert.deepEqual([...run("next", mk("fresh2"), "--step", "0").out.matchAll(/^Step (\d) /gm)].map((m) => m[1]), ["0"]);
    // lessons by mode: a "|studio" line prints on Studio only, a "|express" line on Express only
    const ls = skillCopy("s-modes");
    edit(ls, "lessons.md", (t) => t.trimEnd() + "\n- [3|studio] **Studio-only fixture lesson** x.\n- [3|express] **Express-only fixture lesson** x.\n");
    assert.equal(run("reading", "--skill", ls).code, 0, "mode tags are valid");
    edit(ls, "lessons.md", (t) => t.trimEnd() + "\n- [3|both] **Bad mode** x.\n");
    assert.match(run("reading", "--skill", ls).err, /lessons\.md:\d+ is not a readable lesson/, "an unknown mode fails");
    edit(ls, "lessons.md", (t) => t.replace(/\n- \[3\|both\].*\n/, "\n"));
    const modeOut = (mode) => { const p = mk(`lm-${mode}`); put(p, "BRIEF.md", `mode: ${mode}\n`); return run("next", p, "--step", "3", "--skill", ls).out; };
    assert.match(modeOut("studio"), /Studio-only fixture lesson/); assert.doesNotMatch(modeOut("studio"), /Express-only fixture lesson/);
    assert.match(modeOut("express"), /Express-only fixture lesson/); assert.doesNotMatch(modeOut("express"), /Studio-only fixture lesson/);
    // Step 1: Call 0 look-ups only when preflight left a choice (a clean record under 12 h), the series row only with kits
    const callHead = "### Call 0 (only when preflight left a choice; skip it otherwise)";
    const clean = path.join(tmp, "clean.json"); fs.writeFileSync(clean, JSON.stringify({ at: new Date().toISOString(), choice: false }));
    const stale = path.join(tmp, "stale.json"); fs.writeFileSync(stale, JSON.stringify({ at: new Date(Date.now() - 13 * 3600e3).toISOString(), choice: false }));
    const one = mk("s1"); put(one, "PRODUCTION.md", "# P\n");
    const s1 = (env) => run("next", one, "--print", env).out;
    assert.ok(s1({}).includes(`\n${callHead}\n`) && /^brief\.md \d+,\d+ Lean workspace/m.test(s1({})) && /^brief\.md \d+,\d+ Series kit/m.test(s1({})), "unknown preflight and a kit: every row");
    const c = s1({ DALANG_PREFLIGHT_STATE: clean });
    assert.ok(!c.includes(callHead) && !/^(voice\.md \d+,\d+ Setup — VoiceStudio|brief\.md \d+,\d+ Lean workspace)/m.test(c), "a clean preflight: no Call 0 rows");
    assert.ok(s1({ DALANG_PREFLIGHT_STATE: stale }).includes(callHead), "a record over 12 h old is unknown: Call 0 printed");
    assert.doesNotMatch(s1({ DALANG_SERIES_DIR: mk("no-kits") }), /^brief\.md \d+,\d+ Series kit/m, "no kit: no series row");
    assert.match(s1({ DALANG_SERIES_DIR: path.join(tmp, "absent") }), /^Step 1 /m);
    // a subtree entry (tree()) is one index line holding its subsections: ends at the next heading of its level or higher
    const cm = fs.readFileSync(path.join(root, "references", "camera-motion.md"), "utf8").split("\n");
    const t5 = json.steps[6].refs.find((e) => e.heading === "## 5. Physical timing");
    assert.ok(t5?.sub, "Step 6 lists camera-motion §5 as one subtree line");
    assert.ok(cm.slice(t5.from - 1, t5.to).some((l) => l.startsWith("### 5.4 ")) && !cm.slice(t5.from - 1, t5.to).some((l) => l.startsWith("## 6. ")), "§5 holds 5.1–5.4, never §6");
    assert.ok(!json.steps[6].refs.some((e) => /^### 5\.\d/.test(e.heading ?? "")), "no subsection listed beside its subtree");
    // models: the whole table
    const m = run("models");
    assert.equal(m.code, 0); assert.match(m.out, /^express Step 6 Build  builder per group, and its one fix round: mid · medium$/m);
  }

  console.log("reading: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
