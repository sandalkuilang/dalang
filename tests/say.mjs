#!/usr/bin/env node
// node tests/say.mjs — scripts/say.mjs and its users: say.txt pairs (written = spoken), the written form in captions and
// the SRT text, a transcript's written form heard as the spoken words, and narration_lint refusing an undecided letter
// code (a respelling must never reach the screen).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSay, written, writtenPhrases, heardAs, codesIn } from "../scripts/say.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-say-"));
assert.deepEqual(loadSay(tmp), [], "no say.txt: no pairs");
fs.writeFileSync(path.join(tmp, "say.txt"), "# how the voice says it\nDNA = de en a\nUSB = yu es bi  # letters\nTV = TV\nbroken line\n");
const say = loadSay(tmp);
assert.deepEqual(say, [["DNA", "de en a"], ["USB", "yu es bi"], ["TV", "TV"]], "pairs, comments and bad lines dropped");

assert.equal(written("Kenapa de en a unik? De en a kita beda, TV juga.", say), "Kenapa DNA unik? DNA kita beda, TV juga.");
assert.equal(written("kode dan de", [["D", "de"]]), "kode dan D", "only whole words");
assert.equal(written("Wooster.", [["worcester", "wooster"]]), "Worcester.", "a sentence-initial capital stays");

const caps = writtenPhrases([{ text: "Kenapa de en a unik,", start: 1, end: 3, words: [
  { text: "Kenapa", start: 1, end: 1.4 }, { text: "de", start: 1.5, end: 1.6 }, { text: "en", start: 1.6, end: 1.7 }, { text: "a", start: 1.7, end: 1.8 }, { text: "unik,", start: 1.9, end: 2.5 }] }], say);
assert.equal(caps[0].text, "Kenapa DNA unik,");
assert.deepEqual(caps[0].words.map((w) => [w.text, w.start, w.end]), [["Kenapa", 1, 1.4], ["DNA", 1.5, 1.8], ["unik,", 1.9, 2.5]], "one written word over the spoken words' times");

assert.deepEqual(heardAs(say).get("dna"), ["de", "en", "a"], "a transcript's DNA stands for the spoken de en a");
assert.equal(heardAs(say).has("tv"), false, "a pair kept as written needs no alias");
assert.deepEqual(codesIn("Kenapa DNA dan USB-C, layar 3D, gas CO2, Ini oke.").map((c) => c.token), ["DNA", "USB-C", "3D", "CO2"]);

// narration_lint: an undecided letter code is a problem with its line; a say.txt pair decides it
const lint = fileURLToPath(new URL("../scripts/narration_lint.mjs", import.meta.url));
const film = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-say-film-"));
fs.writeFileSync(path.join(film, "script.md"), "Promise: x\nTakeaway: y\n");
fs.writeFileSync(path.join(film, "narration.txt"), "# Hook\n{Kenapa DNA unik?|hook}\nKarena urutannya beda.\n");
let r = spawnSync(process.execPath, [lint, film], { encoding: "utf8" });
assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /narration\.txt:2 "DNA" is a letter code .*"DNA = <said>" to say\.txt/);
fs.writeFileSync(path.join(film, "say.txt"), "DNA = DNA\n");
r = spawnSync(process.execPath, [lint, film], { encoding: "utf8" });
assert.equal(r.status, 0, r.stdout);
fs.writeFileSync(path.join(film, "narration.txt"), "# Hook\n{Kenapa de en a unik?|hook}\n");
fs.writeFileSync(path.join(film, "say.txt"), "DNA = de en a\n");
assert.equal(spawnSync(process.execPath, [lint, film], { encoding: "utf8" }).status, 0, "the spoken form in narration.txt is no code");
console.log("say: OK");
