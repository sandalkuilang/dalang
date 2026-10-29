#!/usr/bin/env node
// DALANG is generic purpose: no samples, worked example films or subject assets in the repo, and none of the owner's
// test-film words. The words live outside the repo (DALANG_TEST_TOPICS, default ~/.config/dalang/test-topics.txt,
// one per line) so they never enter it; without that file only the folder check runs.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split("\n");
const bad = [];
for (const f of files) if (/^docs\/assets\/samples\/|^engine\/[^/]+\/examples\/|^engine\/blender\/assemblies\/|^engine\/iso\/examples\.js$/.test(f)) bad.push(`${f}: samples, examples and subject assets do not live in the repo`);

const list = process.env.DALANG_TEST_TOPICS ?? path.join(os.homedir(), ".config/dalang/test-topics.txt");
const words = fs.existsSync(list) ? fs.readFileSync(list, "utf8").split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#")) : [];
for (const f of files) {
  if (f === "CHANGELOG.md" || /\.(jpg|png|mp3|glb|woff2?)$/.test(f)) continue; // released history stays as written
  const text = fs.readFileSync(path.join(root, f), "utf8").toLowerCase();
  for (const w of words) if (text.includes(w.toLowerCase())) bad.push(`${f}: names a test film ("${w}")`);
}
if (bad.length) { console.log(bad.join("\n")); console.log(`generic: ${bad.length} FAILED`); process.exit(1); }
console.log(`generic: ok (${words.length ? `${words.length} test-film words checked` : "no test-topics file: folders only"})`);
