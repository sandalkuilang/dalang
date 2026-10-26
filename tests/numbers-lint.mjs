#!/usr/bin/env node
// node tests/numbers-lint.mjs — scripts/numbers_lint.mjs against fixture projects. A project's model.mjs writes
// numbers.json (every [calc] result by name, its value and its spoken words); the lint checks that each narration beat
// named after a model number says that number (in words: the model's `say`; in digits: the value after the spoken
// rounding), that each [calc: name] in script.md is in numbers.json, and that numbers.json is not older than model.mjs.
// An unreadable numbers.json is WARN (rerun), never "not found".
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const lint = fileURLToPath(new URL("../scripts/numbers_lint.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-numbers-lint-"));
const node = (cwd, ...args) => { const r = spawnSync(process.execPath, args, { cwd, encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const run = (cwd, ...args) => node(cwd, lint, ...args);
const put = (proj, rel, lines) => { const f = path.join(proj, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join("\n") + "\n"); };
const found = (out) => [...out.matchAll(/PROBLEM\s*:\s*(\S+:\d+)/g)].map((m) => m[1]).sort();
const msg = (out, loc) => out.split("\n").find((l) => l.includes(loc)) ?? "";
const older = (proj, rel) => { const t = new Date(Date.now() - 60_000); fs.utimesSync(path.join(proj, rel), t, t); };

// A generic model: two water-heater tank sizes over a month of showers. Pure ES module (the scene can import it);
// run as main it prints the calculation lines and writes numbers.json. `say` is computed from the value, never typed.
const MODEL = [
  "export const inputs = { showersPerMonth: 60, kwhPerShower: 1.6, pricePerKwh: 0.13, days: 30, standbySmall: 0.9, standbyLarge: 1.5, litresPerShower: 40 };",
  "const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];",
  "const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];",
  "const words = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));",
  "const i = inputs, kwh = (standby) => i.showersPerMonth * i.kwhPerShower + standby * i.days;",
  "const dollars = (v) => ({ value: v, say: `about ${words(Math.round(v))} dollars` }); // value unrounded: the narration rounds",
  "export const numbers = {",
  "  cost_small: dollars(kwh(i.standbySmall) * i.pricePerKwh),",
  "  cost_large: dollars(kwh(i.standbyLarge) * i.pricePerKwh),",
  "  kwh_large: { value: kwh(i.standbyLarge) },",
  "  litres_year: { value: i.showersPerMonth * 12 * i.litresPerShower },",
  "};",
  "export const state = (t) => ({ cost_small: numbers.cost_small.value * Math.min(1, t), running_large: t < 1 });",
  "if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {",
  "  const { writeFileSync } = await import('node:fs');",
  "  console.log(`${i.showersPerMonth} × ${i.kwhPerShower} kWh + ${i.days} × ${i.standbySmall} kWh = ${kwh(i.standbySmall)} kWh`);",
  "  writeFileSync(new URL('./numbers.json', import.meta.url), JSON.stringify(numbers, null, 2) + '\\n');",
  "}",
];
const SCRIPT = [
  "# Two tank sizes",
  "## Context (0–5 s)",
  "The small tank costs $16 a month [calc: cost_small], the large one $18.3 [calc: cost_large].",
  "It heats 141 kWh [calc: kwh_large] and 28,800 litres a year [calc: litres_year].",
];
const NARRATION = (beat) => ["# Context", "Two tanks, one family.", `The small one costs ${beat} a month.`, "{The large one|cost_large_intro} costs more."];

try {
  // 1. model.mjs writes numbers.json and prints the calculation lines.
  const p = path.join(tmp, "proj");
  put(p, "model.mjs", MODEL);
  put(p, "script.md", SCRIPT);
  const m = node(p, "model.mjs");
  assert.equal(m.code, 0, m.out + m.err);
  assert.match(m.out, /60 × 1\.6 kWh/);
  const nums = JSON.parse(fs.readFileSync(path.join(p, "numbers.json"), "utf8"));
  assert.deepEqual(Object.keys(nums).sort(), ["cost_large", "cost_small", "kwh_large", "litres_year"]);
  assert.equal(nums.cost_small.say, "about sixteen dollars");
  console.log("ok  node model.mjs prints the calculation and writes numbers.json with value and say");

  // 2. A model number said wrongly fails, naming the line, the spoken text and the model value; fixed, it passes.
  put(p, "narration.txt", NARRATION("{about twelve dollars|cost_small}"));
  const bad = run(p);
  assert.equal(bad.code, 1, bad.out + bad.err);
  assert.deepEqual(found(bad.out), ["narration.txt:3"]);
  const line = msg(bad.out, "narration.txt:3");
  assert.ok(line.includes("about twelve dollars") && line.includes("model 15.99 ") && line.includes("about sixteen dollars"), line);
  put(p, "narration.txt", NARRATION("{about sixteen dollars|cost_small}"));
  const good = run(p);
  assert.equal(good.code, 0, good.out + good.err);
  assert.match(good.out, /Result\s+: OK/);
  assert.equal(run(tmp, p).code, 0, "a project path as argument");
  // punctuation, case and hyphens do not matter; the words must still be whole words
  put(p, "narration.txt", NARRATION("{About Sixteen, dollars|cost_small}"));
  assert.equal(run(p).code, 0, "case and punctuation are ignored");
  console.log("ok  wrong spoken words fail with line, spoken text and model value; the fixed line passes");

  // 3. Digits: compared after the rounding the narration uses.
  const digits = { "{18 dollars|cost_large}": 0, "{18.3 dollars|cost_large}": 0, "{about 20 dollars|cost_large}": 0,
    "{19 dollars|cost_large}": 1, "{18.4 dollars|cost_large}": 1, "{10 dollars|cost_large}": 1,
    "{141 kilowatt hours|kwh_large}": 0, "{140|kwh_large}": 0, "{100|kwh_large}": 0, "{150|kwh_large}": 1, "{1,41|kwh_large}": 1,
    "{28,800 litres|litres_year}": 0, "{28.800 litres|litres_year}": 0, "{29,000|litres_year}": 0, "{28,000|litres_year}": 1 };
  for (const [beat, want] of Object.entries(digits)) {
    put(p, "narration.txt", NARRATION(beat));
    const r = run(p);
    assert.equal(r.code, want, `${beat}: ${r.out}${r.err}`);
    if (want) assert.ok(msg(r.out, "narration.txt:3").includes(beat.slice(1, beat.indexOf("|"))), r.out);
  }
  console.log("ok  digits compared after the spoken rounding (decimals, significant figures, thousands separators)");

  // 4. A [calc: name] that is not in numbers.json is named by its script.md line.
  put(p, "narration.txt", NARRATION("{about sixteen dollars|cost_small}"));
  put(p, "script.md", [...SCRIPT, "A shower uses 40 litres [calc: litres_shower]."]);
  const miss = run(p);
  assert.equal(miss.code, 1, miss.out + miss.err);
  assert.deepEqual(found(miss.out), ["script.md:5"]);
  assert.match(msg(miss.out, "script.md:5"), /litres_shower/);
  put(p, "script.md", SCRIPT);
  console.log("ok  a [calc: name] missing from numbers.json fails with its script.md line");

  // 5. numbers.json older than model.mjs (an input changed, the model not rerun) fails; rerun, it passes.
  older(p, "numbers.json");
  const stale = run(p);
  assert.equal(stale.code, 1, stale.out + stale.err);
  assert.match(stale.out, /older than model\.mjs.*node model\.mjs/);
  assert.equal(node(p, "model.mjs").code, 0);
  assert.equal(run(p).code, 0);
  console.log("ok  a numbers.json older than model.mjs fails until node model.mjs runs again");

  // 6. Model numbers in script.md and no numbers.json: it is not there (exit 1, run the model).
  const nojson = path.join(tmp, "nojson");
  put(nojson, "script.md", SCRIPT);
  put(nojson, "narration.txt", NARRATION("{about sixteen dollars|cost_small}"));
  const nj = run(nojson);
  assert.equal(nj.code, 1, nj.out + nj.err);
  assert.match(nj.out, /numbers\.json not found.*node model\.mjs/);
  console.log("ok  [calc: name] without numbers.json fails and says to run node model.mjs");

  // 7. A numbers.json that cannot be read is WARN and rerun (exit 2), never "not found" and never OK.
  put(nojson, "numbers.json", ['{ "cost_small": { "value": 16,']);
  const broken = run(nojson);
  assert.equal(broken.code, 2, broken.out + broken.err);
  assert.match(broken.out, /WARN.*numbers\.json.*rerun/);
  assert.ok(!/not found/.test(broken.out) && !/Result\s+: OK/.test(broken.out), broken.out);
  fs.rmSync(path.join(nojson, "numbers.json"));
  fs.mkdirSync(path.join(nojson, "numbers.json"));
  const dir = run(nojson);
  assert.equal(dir.code, 2, dir.out + dir.err);
  assert.ok(!/not found/.test(dir.out), dir.out);
  console.log("ok  an unparseable or unreadable numbers.json exits 2 with rerun, never not found");

  // 8. A value that is not a number, a beat spoken in words with no `say`, a word inside a longer word.
  const odd = path.join(tmp, "odd");
  put(odd, "script.md", ["Price [calc: price], count [calc: count], parts [calc: parts]."]);
  put(odd, "numbers.json", [JSON.stringify({ price: { value: "cheap" }, count: { value: 7 }, parts: { value: 1, say: "one" } })]);
  put(odd, "narration.txt", ["It costs {a little|price}.", "{Twenty-one|parts} parts."]);
  const o = run(odd);
  assert.equal(o.code, 1, o.out + o.err);
  assert.match(o.out, /PROBLEM.*price.*not a number/);
  assert.deepEqual(found(o.out), ["narration.txt:2"], "'one' inside 'twenty-one' is not the word 'one'");
  put(odd, "numbers.json", [JSON.stringify({ price: 3, count: { value: 7 }, parts: { value: 1, say: "one" } })]);
  put(odd, "narration.txt", ["It costs {three|price}.", "{One|parts} part."]);
  const w = run(odd);
  assert.equal(w.code, 2, w.out + w.err);
  assert.match(msg(w.out, "narration.txt:1"), /WARN.*say/);
  console.log("ok  a non-number value fails, words with no say are WARN, a word is matched whole");

  // 9. No model: only hand arithmetic and no numbers.json is OK (INFO); nothing to lint is not OK.
  const hand = path.join(tmp, "hand");
  put(hand, "script.md", ["Three rooms of four chairs: 12 chairs [calc: 3 × 4 = 12]."]);
  put(hand, "narration.txt", ["Twelve chairs."]);
  const h = run(hand);
  assert.equal(h.code, 0, h.out + h.err);
  assert.match(h.out, /INFO.*script\.md:1.*not checked/);
  const empty = path.join(tmp, "empty");
  fs.mkdirSync(empty);
  const e = run(empty);
  assert.equal(e.code, 2, e.out + e.err);
  assert.ok(!/Result\s+: OK/.test(e.out));
  console.log("ok  hand arithmetic without a model passes with INFO; a folder with no script is exit 2, never OK");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
