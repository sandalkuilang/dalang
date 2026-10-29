#!/usr/bin/env node
// One typeface per film (engine/three/font.js): Kohinoor Bangla if installed, else Helvetica, the weight chosen by role.
// Fails when a module, template or design language names another family, loads a web font, or iso.js drifts from font.js.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FAMILY, WEIGHT, FACES, font } from "../engine/three/font.js";
import { FONT } from "../engine/iso/iso.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
assert.match(FAMILY, /^"Kohinoor Bangla", Helvetica/, "Kohinoor Bangla first, Helvetica next");
assert.deepEqual(WEIGHT, { title: 700, heading: 600, sub: 500, body: 400 }, "Bold, Semibold, Medium, Regular");
assert.equal(font("heading", 48), `600 48px ${FAMILY}`);
assert.equal(FONT, FAMILY, "engine/iso/iso.js FONT is font.js FAMILY");
for (const w of Object.values(WEIGHT)) assert.match(FACES, new RegExp(`font-weight:${w};src:local\\(`), `an @font-face for weight ${w}`);

const files = execFileSync("git", ["ls-files", "engine", "scripts", "references"], { cwd: root, encoding: "utf8" }).trim().split("\n")
  .filter((f) => /\.(m?js|html|md|css)$/.test(f) && !/^engine\/(anatomy|three\/vendor)\/|iso-kit/.test(f));
const bad = [], ok = /Kohinoor Bangla|Helvetica|Arial|sans-serif|ui-sans-serif|inherit|\$\{|__FAMILY__|var\(/;
for (const f of files) {
  const t = fs.readFileSync(path.join(root, f), "utf8");
  if (/fonts\.googleapis|fonts\.gstatic/.test(t)) bad.push(`${f}: loads a web font`);
  for (const m of t.matchAll(/font-family\s*:\s*([^;}\n]+)/g)) if (!ok.test(m[1])) bad.push(`${f}: font-family ${m[1].trim()}`);
}
assert.deepEqual(bad, [], `another family or a web font:\n${bad.join("\n")}`);
console.log("font: ok");
