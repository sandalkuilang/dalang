#!/usr/bin/env node
// node tests/numbers-lint.mjs — scripts/numbers_lint.mjs against fixture projects. A project's model.mjs writes
// numbers.json (every [calc] result by name, its value and its spoken words); the lint checks that each narration beat
// named after a model number holds a mention of it in a declared form (the model's `say`, or a figure that rounds to
// the value, alone or in the say's place), that each [calc: name] in script.md is in numbers.json, and that
// numbers.json is not older than model.mjs.
// An unreadable numbers.json is WARN (rerun), never "not found".
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

  // 10. A hyphen between letters is punctuation like any other: "twenty-one" and "twenty one" are the same words
  // (and the same audio), either way round; a word inside a hyphenated word is still not the word on its own.
  const hy = path.join(tmp, "hy");
  put(hy, "script.md", ["Cost [calc: cost]."]);
  put(hy, "numbers.json", [JSON.stringify({ cost: { value: 21, say: "twenty-one dollars" } })]);
  for (const [beat, want] of [["twenty-one dollars", 0], ["Twenty one dollars", 0], ["twenty-two dollars", 1], ["twenty dollars", 1]]) {
    put(hy, "narration.txt", [`It costs {${beat}|cost}.`]);
    const r = run(hy);
    assert.equal(r.code, want, `say hyphenated, beat "${beat}": ${r.out}${r.err}`);
  }
  put(hy, "numbers.json", [JSON.stringify({ cost: { value: 21, say: "twenty one dollars" }, parts: { value: 1, say: "one" } })]);
  put(hy, "script.md", ["Cost [calc: cost], parts [calc: parts]."]);
  for (const [beat, want] of [["twenty-one dollars", 0], ["Twenty one dollars", 0], ["twenty-two dollars", 1]]) {
    put(hy, "narration.txt", [`It costs {${beat}|cost}.`, "{Twenty-one|parts} parts."]);
    const r = run(hy);
    assert.equal(r.code, 1, `say spaced, beat "${beat}": ${r.out}${r.err}`); // parts: 'one' inside 'twenty-one' is never 'one'
    assert.deepEqual(found(r.out), want ? ["narration.txt:1", "narration.txt:2"] : ["narration.txt:2"], r.out);
  }
  console.log("ok  a hyphen and a space are the same words, either way round; 'one' is still not inside 'twenty-one'");

  // 11. A model beat passes when it holds a mention of its number in a declared form, whatever else it holds: the
  // `say`, or a figure that rounds to the value standing on its own in the beat or beside the say's words in their
  // place ("40 dollars", "about 40"). A figure among words that are not the say is not a mention: wrong words are not
  // rescued by a stray figure, however many of their words differ from the say.
  const mix = path.join(tmp, "mix");
  put(mix, "script.md", ["Cost [calc: cost]."]);
  put(mix, "numbers.json", [JSON.stringify({ cost: { value: 40, say: "about forty dollars" } })]);
  const mixed = { "about forty dollars for 8 hours": 0, "about forty dollars, 12 of them": 0, "40 dollars": 0, "40 dollars for 8 hours": 0,
    "about 40 dollars": 0, "about 40": 0, "$40": 0, "40": 0, "40 dollars for about forty minutes": 0,
    "about twelve dollars for 8 hours": 1, "about twelve dollars, 40": 1, "about twelve dollars, 41": 1, "8 hours": 1,
    "twelve dollars, 40": 1, "roughly twelve dollars, 40": 1, "about twelve bucks, 40": 1, "40 minutes": 1, "about forty minutes": 1 };
  for (const [beat, want] of Object.entries(mixed)) {
    put(mix, "narration.txt", [`It costs {${beat}|cost}.`]);
    const r = run(mix);
    assert.equal(r.code, want, `${beat}: ${r.out}${r.err}`);
    if (want) assert.deepEqual(found(r.out), ["narration.txt:1"], r.out);
    if (want) assert.ok(msg(r.out, "narration.txt:1").includes(`"${beat}"`) && msg(r.out, "narration.txt:1").includes("about forty dollars"), r.out);
  }
  console.log("ok  a model beat passes on a mention in a declared form (say, or a figure alone or in the say's place); wrong words are not rescued by a stray figure");

  // 12. A model number spoken more than once: the second mention is a beat named <name>__<suffix> and is checked the
  // same way; two beats with one name never pass. A beat of another name, or of none, claims no model number: never judged.
  const rep = path.join(tmp, "rep");
  put(rep, "script.md", ["Cost [calc: cost], small [calc: cost_small], big [calc: cost_large]."]);
  put(rep, "numbers.json", [JSON.stringify({ cost: { value: 40, say: "about forty dollars" }, cost_small: { value: 16, say: "about sixteen dollars" }, cost_large: { value: 18, say: "about eighteen dollars" } })]);
  const two = (a, b) => ["{about forty dollars|cost}.", `Recap: it costs {${a}|${b}}.`];
  const cases = [
    [two("about forty dollars", "cost__recap"), 0, null], [two("about ninety dollars", "cost__recap"), 1, "narration.txt:2"],
    [two("40 dollars", "cost__recap"), 0, null], [two("41 dollars", "cost__recap"), 1, "narration.txt:2"],
    [two("about forty dollars", "cost"), 1, "narration.txt:2"], // one name twice: the voice step renames the later timing
    [two("about ninety dollars", "cost_recap"), 0, null], // not a model name: not a mention of cost, never judged
    [two("about forty dollars", "cost_recap"), 0, null], [two("a quiet house", "house"), 0, null],
    [two("about eighteen dollars", "cost_small_intro"), 0, null], // another model number's exact words
    [two("about eighteen dollars", "cost_small__again"), 1, "narration.txt:2"], // named for cost_small: eighteen is not sixteen
  ];
  for (const [nar, want, at] of cases) {
    put(rep, "narration.txt", nar);
    const r = run(rep);
    assert.equal(r.code, want, `${nar[1]}: ${r.out}${r.err}`);
    if (want === 1) assert.deepEqual(found(r.out), [at], r.out);
    if (want === 2) assert.match(msg(r.out, at), /WARN.*about ninety dollars.*cost__/, r.out);
    if (!want) assert.match(r.out, /Result\s+: OK/);
  }
  put(rep, "narration.txt", two("about forty dollars", "cost__recap"));
  assert.match(run(rep).out, /2 spoken beats/);
  // the voice step trims a beat name, and a beat with no name is a beat too
  put(rep, "narration.txt", two("about ninety dollars", " cost__recap "));
  assert.deepEqual(found(run(rep).out), ["narration.txt:2"]);
  put(rep, "narration.txt", ["{about forty dollars|cost}.", "Recap: it costs {about ninety dollars}."]);
  const unnamed = run(rep);
  assert.equal(unnamed.code, 0, unnamed.out); // a beat with no name claims no model number
  put(rep, "narration.txt", ["{about forty dollars|cost}.", "Recap: it costs {about forty dollars}."]);
  assert.equal(run(rep).code, 0);
  // object property names are not model numbers
  put(rep, "narration.txt", two("a quiet house", "constructor"));
  assert.equal(run(rep).code, 0);
  put(rep, "script.md", ["Cost [calc: cost], odd [calc: toString]."]);
  assert.deepEqual(found(run(rep).out), ["script.md:1"]);
  console.log("ok  a repeated model number is a beat <name>__<suffix> and is checked; a repeated name fails; another name is not judged");

  // 13. Gate 1 approves the model too: an input changed in model.mjs, or a new numbers.json, makes the approval stale,
  // even when the rounded words stay the same; a project with no model keeps its old hash.
  const st = (cwd, ...args) => node(cwd, fileURLToPath(new URL("../scripts/state.mjs", import.meta.url)), ...args);
  const gp = path.join(tmp, "gate1");
  put(gp, "script.md", ["Promise: what it costs.", "Takeaway: about sixteen dollars.", ...SCRIPT]); // approve 1 runs narration_lint too
  put(gp, "narration.txt", NARRATION("{about sixteen dollars|cost_small}"));
  put(gp, "model.mjs", MODEL);
  assert.equal(node(gp, "model.mjs").code, 0);
  assert.equal(st(gp, "approve", "1", ".").code, 0);
  assert.equal(st(gp, "check", "1", ".").code, 0);
  fs.writeFileSync(path.join(gp, "model.mjs"), MODEL.join("\n").replace("pricePerKwh: 0.13", "pricePerKwh: 0.131") + "\n"); // same words, new value
  const stale1 = st(gp, "check", "1", ".");
  assert.equal(stale1.code, 3, stale1.out + stale1.err);
  assert.match(stale1.out, /STALE/);
  const behind = st(gp, "approve", "1", ".");
  assert.equal(behind.code, 1, "approve 1 runs numbers_lint: a model newer than numbers.json is refused");
  assert.match(behind.err, /numbers_lint: PROBLEM .*numbers\.json/);
  assert.equal(node(gp, "model.mjs").code, 0); // the rerun writes the new numbers.json
  assert.equal(st(gp, "approve", "1", ".").code, 0);
  const gnj = path.join(gp, "numbers.json"), approvedNumbers = fs.readFileSync(gnj, "utf8");
  fs.writeFileSync(gnj, approvedNumbers.replace(/\d/, (d) => String((Number(d) + 1) % 10)));
  assert.equal(st(gp, "check", "1", ".").code, 3, "a new numbers.json is stale");
  fs.writeFileSync(gnj, approvedNumbers);
  assert.equal(st(gp, "check", "1", ".").code, 0);
  assert.equal(node(gp, "model.mjs").code, 0);
  assert.equal(st(gp, "check", "1", ".").code, 0, "a rerun with the same inputs keeps the approval");
  const nomodel = path.join(tmp, "nomodel");
  put(nomodel, "script.md", ["Promise: hello.", "Takeaway: hello."]);
  put(nomodel, "narration.txt", ["Hello."]);
  assert.equal(st(nomodel, "approve", "1", ".").code, 0);
  assert.equal(st(nomodel, "check", "1", ".").code, 0);
  const sj = JSON.parse(fs.readFileSync(path.join(nomodel, "state.json"), "utf8"));
  const oldHash = createHash("sha1").update(fs.readFileSync(path.join(nomodel, "script.md"))).update(fs.readFileSync(path.join(nomodel, "narration.txt"))).digest("hex").slice(0, 12);
  assert.equal(sj.approvals[1].hash, oldHash, "no model: the hash is what it was before");
  console.log("ok  Gate 1 goes stale when model.mjs or numbers.json changes; a project with no model is unchanged");

  // 14. A true number in a beat of another name is never flagged, even when its words share all but one with a
  // model number's `say` (the unit, or the number): only a beat named after a model number is judged, and that beat
  // still fails when it says another unit or another number.
  const other = path.join(tmp, "other");
  put(other, "script.md", ["Cost [calc: cost]."]);
  for (const [say, nar, want] of [
    ["about forty dollars", ["It costs {about forty dollars|cost}.", "The drive takes {about forty minutes|drive}."], 0],
    ["forty dollars", ["It costs {forty dollars|cost}.", "Less than {forty percent|share} of homes."], 0],
    ["forty dollars", ["It costs {forty dollars|cost}.", "Less than {forty percent} of homes."], 0],
    ["about forty dollars", ["It costs {about forty dollars|cost}.", "The drive takes {about forty minutes|cost__drive}."], 1],
    ["forty dollars", ["It costs {forty dollars|cost}.", "Less than {forty percent|cost__share} of homes."], 1],
  ]) {
    put(other, "numbers.json", [JSON.stringify({ cost: { value: 40, say } })]);
    put(other, "narration.txt", nar);
    const r = run(other);
    assert.equal(r.code, want, `${nar[1]}: ${r.out}${r.err}`);
    if (want) assert.deepEqual(found(r.out), ["narration.txt:2"], r.out);
    else assert.match(r.out, /Result\s+: OK/);
  }
  console.log("ok  a true number in a beat of another name is never flagged; named after the model number, another unit fails");

  // 15. The class: a model number spoken in any declared form is never flagged, whatever surrounds it in its beat,
  // and nothing in a beat of another name, or of none, is ever flagged. Every model shape: a say with a hedge and a
  // unit, a say with no unit, a decimal say, a say in an unspaced script, no say.
  const cls = path.join(tmp, "class");
  put(cls, "script.md", ["Cost [calc: cost], parts [calc: parts], share [calc: share], kwh [calc: kwh], yen [calc: yen], rent [calc: rent]."]);
  put(cls, "numbers.json", [JSON.stringify({ cost: { value: 40, say: "about forty dollars" }, parts: { value: 21, say: "twenty-one" },
    share: { value: 12.5, say: "twelve and a half percent" }, kwh: { value: 141 }, yen: { value: 40, say: "四十円" },
    rent: { value: 40, say: "about forty dollars a month" } })]);
  const forms = { // [form, may it stand among other words]
    cost: [["about forty dollars", 1], ["About Forty-Dollars", 1], ["about 40 dollars", 1], ["40 dollars", 1], ["about 40", 1], ["$40", 0], ["40", 0]],
    rent: [["about forty dollars a month", 1], ["about 40 dollars a month", 1], ["40 dollars a month", 1], ["about 40 dollars", 1], ["40 dollars", 1], ["40 a month", 1]],
    parts: [["twenty-one", 1], ["Twenty one", 1], ["21", 0]],
    share: [["twelve and a half percent", 1], ["12.5 percent", 1], ["12.5", 0]],
    kwh: [["141", 1], ["140", 1], ["about 140 kilowatt hours", 1], ["100", 1]],
    yen: [["四十円", 1], ["約四十円", 1], ["40", 0]],
  };
  const noise = ["for 8 hours", "about forty minutes", "less than forty percent", "about twelve dollars", "or 12 of them", "twenty-two parts", "十二時間"];
  const beats = []; // one beat a line, each model beat a further mention of its own (<name>__k<i>), so one run checks all
  let k = 0;
  for (const [name, list] of Object.entries(forms)) for (const [f, among] of list) {
    beats.push(`{${f}|${name}__k${k++}}`);
    if (among) for (const z of noise) beats.push(`{${z}, ${f}|${name}__k${k++}}`, `{${f}, ${z}|${name}__k${k++}}`, `{${z} ${f} ${z}|${name}__k${k++}}`);
  }
  for (const z of noise) for (const name of ["drive", "share_note", "cost_recap", ""]) beats.push(name ? `{${z}|${name}}` : `{${z}}`);
  put(cls, "narration.txt", beats.map((b) => `It is ${b}.`));
  const all = run(cls);
  const flagged = all.out.split("\n").filter((l) => /PROBLEM|WARN/.test(l));
  assert.deepEqual(flagged, [], `${flagged.length} of ${beats.length} correct beats flagged:\n${flagged.join("\n")}`);
  assert.equal(all.code, 0, all.out);
  assert.match(all.out, new RegExp(`${k} spoken beats`), all.out);
  for (const [name, list] of Object.entries(forms)) for (const [f] of list) { // and each form as the first mention
    put(cls, "narration.txt", [`It is {${f}|${name}}.`]);
    assert.equal(run(cls).code, 0, `{${f}|${name}}`);
  }
  console.log(`ok  the class: ${beats.length} correct beats (every declared form, among other words, other names) are never flagged`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
