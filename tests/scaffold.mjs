#!/usr/bin/env node
// node tests/scaffold.mjs — scripts/scaffold.mjs: the engine, the host and every group template written by code from
// narration.txt's beat names. The first group opens at 0 and the last closes at END; every placeholder is filled; a
// rerun keeps what exists; a group list out of order, on a beat that does not exist, or with a bad name writes nothing.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/scaffold.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-scaffold-"));
const run = (dir, ...a) => { const r = spawnSync(process.execPath, [script, dir, ...a], { encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };
const proj = (n) => { const d = path.join(tmp, n); fs.mkdirSync(d); fs.writeFileSync(path.join(d, "narration.txt"), "{Open here.|hook} {Then this.|middle} {And last.|close}\n"); return d; };
const read = (d, f) => fs.readFileSync(path.join(d, f), "utf8");

try {
  const d = proj("iso");
  let r = run(d, "--look", "isometric-world", "--groups", "intro:hook,body:middle,end:close", "--illustration", "DRAWING");
  assert.equal(r.code, 0, r.out);
  const host = read(d, "src/index.tpl.html");
  assert.match(host, /id="intro" [^>]*data-start="0" data-duration="\{\{middle\}\}"/, "the first group opens at 0");
  assert.match(host, /id="body" [^>]*data-start="\{\{middle\}\}" data-duration="\{\{close - middle\}\}"/);
  assert.match(host, /id="end" [^>]*data-start="\{\{close\}\}" data-duration="\{\{END - close\}\}"/, "the last group closes at END");
  assert.match(host, /fonts\.googleapis\.com\/css2\?family=Fredoka/, "the isometric host loads the language's fonts");
  for (const g of ["intro", "body", "end"]) assert.doesNotMatch(read(d, `src/compositions/${g}.tpl.html`), /__[A-Z]+__/, `${g}: every placeholder filled`);
  assert.match(read(d, "src/compositions/intro.tpl.html"), /const G0 = 0, G1 = b\("middle"\)/);
  assert.match(read(d, "src/compositions/end.tpl.html"), /G1 = window\.NARRATION_DURATION/);
  assert.match(read(d, "src/compositions/end.tpl.html"), /illustration: "DRAWING"/);
  for (const f of ["iso.js", "build.js", "parallax.js", "cinema.js", "editorial.js"]) assert.ok(fs.existsSync(path.join(d, "assets", f)), `assets/${f} copied`);

  // a rerun keeps every file, edits included
  fs.appendFileSync(path.join(d, "src/compositions/body.tpl.html"), "<!-- edited -->\n");
  r = run(d, "--look", "isometric-world", "--groups", "intro:hook,body:middle,end:close");
  assert.equal(r.code, 0, r.out);
  assert.match(read(d, "src/compositions/body.tpl.html"), /<!-- edited -->/, "a rerun never overwrites");
  assert.match(r.out, /kept {4}src\/index\.tpl\.html/);

  // refusals write nothing
  for (const [groups, why] of [["a:middle,b:hook", /narration order/], ["a:hook,b:nowhere", /no beat "nowhere"/], ["A b:hook", /group name/], ["a:hook,a:middle", /twice/]]) {
    const e = proj(`bad${groups.length}${why.source.length}`);
    r = run(e, "--look", "isometric-world", "--groups", groups);
    assert.equal(r.code, 1, `${groups}: ${r.out}`); assert.match(r.out, why);
    assert.ok(!fs.existsSync(path.join(e, "src")) && !fs.existsSync(path.join(e, "assets")), `${groups}: nothing written`);
  }
  assert.match(run(proj("look"), "--look", "watercolour", "--groups", "a:hook").out, /--look must be one of/);
  console.log("scaffold: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
