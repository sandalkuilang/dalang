#!/usr/bin/env node
// node tests/hero-shots.mjs — scripts/hero_shots.mjs: review/hero-shots.json against storyboard.md (each row a storyboard
// shot, its side word the storyboard's, every key's az inside that side, lens and distance real, move with two states);
// no file is a rerun note (exit 2), never "missing".
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/hero_shots.mjs", import.meta.url));
const film = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-heroshots-"));
fs.mkdirSync(path.join(film, "review"));
fs.writeFileSync(path.join(film, "storyboard.md"), [
  "| # | Time | Beat | Size · angle · lens | What we see | Camera | Subject action | Transition out |",
  "|---|---|---|---|---|---|---|---|",
  "| 1 | 0–2 | `hook` | WS · front-left · 35 mm | the pump | arrive and orbit | the impeller spins | cut |",
  "| 2 | 2–4 | `crack` | CU · left · 50 mm f2.8 | the valve in section | push 1.00→1.10 + orbit 10° | the valve lifts | cut |",
].join("\n") + "\n");
const run = () => spawnSync(process.execPath, [script, film], { encoding: "utf8" });
const write = (o) => fs.writeFileSync(path.join(film, "review/hero-shots.json"), JSON.stringify(o));
const row = (o = {}) => ({ shot: 2, side: "left", target: "pump.valve", focal: ["pump.valve"], states: ["shut", "open"], cut: true,
  keys: [{ az: 90, el: 10, mm: 50, dist: 0.4 }], need: { instances: 1, minPx: 40, move: 30 }, ...o });
const spec = (rows) => ({ asset: "pump", frame: [1080, 1920], front: [0, -1, 0], rows });

let r = run();
assert.equal(r.status, 2, r.stdout); assert.match(r.stdout, /not written yet/); assert.doesNotMatch(r.stdout, /missing/i);
write(spec([row(), row({ shot: 1, side: "front-left", cut: false, keys: [{ az: 45, mm: 35, dist: 1.6 }], states: [], need: {} })]));
r = run(); assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /Result\s*: OK/);
write(spec([row({ shot: 9 })]));
r = run(); assert.equal(r.status, 1); assert.match(r.stdout, /row 1: shot 9 is not in storyboard\.md/);
write(spec([row({ side: "right", keys: [{ az: 270, mm: 50, dist: 0.4 }] })]));
r = run(); assert.equal(r.status, 1); assert.match(r.stdout, /shot 2 is "right" here but "left" in storyboard\.md/);
write(spec([row({ keys: [{ az: 140, mm: 50, dist: 0.4 }] })]));
r = run(); assert.equal(r.status, 1); assert.match(r.stdout, /key 1 az 140 is not "left" \(90 ± 22\.5\)/);
write(spec([row({ soft: "pump.case" })]));
r = run(); assert.equal(r.status, 1); assert.match(r.stdout, /soft names the defocused foreground/);
write(spec([row({ states: ["shut"] })]));
r = run(); assert.equal(r.status, 1); assert.match(r.stdout, /need\.move needs two states/);
write(spec([row({ keys: [{ az: 90, mm: 0, dist: 0.4 }], focal: [] })]));
r = run(); assert.equal(r.status, 1); assert.match(r.stdout, /mm/); assert.match(r.stdout, /focal/);
fs.writeFileSync(path.join(film, "review/hero-shots.json"), "{ nope");
r = run(); assert.equal(r.status, 1); assert.match(r.stdout, /not valid JSON/);
console.log("hero-shots: OK");
