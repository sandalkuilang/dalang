#!/usr/bin/env node
// node tests/score-run.mjs — scripts/score_run.mjs reading review/quiz-result.md (the sound-off quiz): the verdict of each
// numbered row counted into quiz_* keys. An unreadable verdict or an empty table is "error", never a perfect or a zero score.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/score_run.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-score-"));
let n = 0;
const proj = (result) => {
  const p = path.join(tmp, `p${n++}`); fs.mkdirSync(path.join(p, "review"), { recursive: true });
  if (result !== null) fs.writeFileSync(path.join(p, "review", "quiz-result.md"), result);
  return p;
};
const head = "# Quiz result\n\nRound 1\n\n| # | Beat | Question | Answer given | Key | Verdict |\n|---|---|---|---|---|---|\n";
const rows = (...v) => head + v.map((x, i) => `| ${i + 1} | b${i} | q? | a | k | ${x} |`).join("\n") + "\n";
const score = (p, ...extra) => { const r = spawnSync(process.execPath, [script, p, ...extra], { encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const json = (p) => JSON.parse(score(p, "--json").out);

try {
  let j = json(proj(rows("correct", "correct", "correct", "partly correct", "wrong")));
  assert.deepEqual([j.quiz_questions, j.quiz_correct, j.quiz_partly, j.quiz_wrong, j.quiz_score, j.quiz_pct], [5, 3, 1, 1, 3.5, 70]);
  console.log("ok  3 correct + 1 partly + 1 wrong = 3.5 / 5, 70%");

  j = json(proj("Notes first.\n" + rows("**Correct**", "Partly", "WRONG", "`correct`") + "\nclosing prose\n"));
  assert.deepEqual([j.quiz_questions, j.quiz_correct, j.quiz_partly, j.quiz_wrong], [4, 2, 1, 1]);
  console.log("ok  bold, case and short forms counted; prose, header and separator ignored");

  j = json(proj(rows("correct", "correct", "correct", "correct", "correct")));
  assert.deepEqual([j.quiz_score, j.quiz_pct], [5, 100]);
  j = json(proj(rows("wrong", "wrong", "wrong", "wrong", "wrong")));
  assert.deepEqual([j.quiz_score, j.quiz_pct], [0, 0]);
  console.log("ok  all correct = 100, all wrong = a real 0");

  for (const bad of [rows("correct", "maybe"), head]) {
    const r = score(proj(bad), "--json");
    assert.equal(r.code, 0);
    assert.equal(JSON.parse(r.out).quiz_score, "error");
    assert.match(r.err, /WARN: review\/quiz-result\.md/);
  }
  console.log("ok  unknown verdict or no rows = error + WARN, never 0");

  j = json(proj(null));
  assert.deepEqual(Object.keys(j).filter((k) => k.startsWith("quiz_")), []);
  console.log("ok  no quiz-result.md = no quiz_ keys");

  assert.match(score(proj(rows("correct", "wrong"))).out, /^quiz_score\s+1$/m);
  console.log("ok  plain output has a quiz_score line");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
