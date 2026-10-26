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

  console.log("reading: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
