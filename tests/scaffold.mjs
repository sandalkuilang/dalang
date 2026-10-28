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
  // one shared world, imported by every group (never one copy per group), and each builder's whole brief
  assert.match(read(d, "assets/world.js"), /export const WORLD/, "the isometric look's one world is written");
  for (const g of ["intro", "body", "end"]) {
    assert.match(read(d, `src/compositions/${g}.tpl.html`), /import \{ COLORS, WORLD, VALUES \} from "\.\/assets\/world\.js"/, `${g} imports the shared world`);
    assert.doesNotMatch(read(d, `src/compositions/${g}.tpl.html`), /const WORLD =/, `${g} holds no copy of the world`);
  }
  const bIntro = read(d, "review/builder-intro.md"), bBody = read(d, "review/builder-body.md");
  assert.match(bIntro, /beats hook\)/, "a brief names its own beats");
  assert.match(bIntro, /fill `assets\/world\.js` once/, "the first group's builder writes the world");
  assert.match(bIntro, /scripts\/iso_audit\.mjs \. --ground/, "the first builder proves the world before any snapshot");
  assert.doesNotMatch(bBody, /iso_audit/, "only the world's owner runs the audit");
  assert.match(bBody, /PASS \(its command and the result line it printed\), FAIL .* or UNVERIFIED/, "a builder reports evidence per check, never 'done'");
  assert.match(bBody, /The same defect twice means a different route/, "a recurring defect changes the approach");
  assert.match(read(d, "assets/world.js"), /^export const STUB/m, "the world starts as a stub the other groups can wait on");
  assert.ok(JSON.parse(read(d, "assets/.engine.json")).some(r => r.file === "world.js" && r.licence === "own"), "the film's world is in the engine manifest, so check_assets passes it");
  assert.match(bIntro, /6 or more set props/, "the world's builder gets the density bar");
  assert.match(bBody, /grep -q '\^export const STUB'/, "another group waits for the world before its snapshot");
  assert.match(bBody, /under a third of the frame height/, "the look check names the subject's size");
  assert.match(bBody, /written by the `intro` builder: import it, never copy/, "every other builder imports it");
  assert.match(bBody, /cues\.mjs \. --beats middle/, "a brief names its cue table");
  assert.match(bBody, /`assets\/examples\.js` \(finished specs/, "a brief opens the finished example specs, for their density");
  assert.match(bBody, /No other engine source in `assets\/`/, "a brief forbids reading the other engine sources");
  assert.match(bBody, /snapshot --at <every storyboard row of yours/, "a builder looks at every one of its shots");
  // the engine's origin for check_assets, the padded voice, and a music bed by default with its licence row
  assert.ok(JSON.parse(read(d, "assets/.engine.json")).some((r) => r.file === "iso.js" && r.licence === "MIT"), "engine files listed with their licence");
  assert.match(host, /src="audio\/voice\.wav"/, "the host plays the padded voice");
  assert.match(host, /id="music" [^>]*src="assets\/music\.mp3"[^>]*data-volume="0\.14"[^>]*data-fade-out/, "a music bed under the voice, with fades");
  assert.ok(fs.existsSync(path.join(d, "assets/music.mp3")));
  const row = JSON.parse(read(d, "ASSETS.json")).find((r) => r.file === "assets/music.mp3");
  assert.equal(row.licence, "CC0"); assert.match(row.source, /^https:\/\/commons\.wikimedia\.org\//, "calm by default, its licence row written");
  const quiet = proj("quiet");
  assert.equal(run(quiet, "--look", "isometric-world", "--groups", "a:hook", "--music", "none").code, 0);
  assert.doesNotMatch(read(quiet, "src/index.tpl.html"), /id="music"/, "--music none: no bed");
  assert.match(run(proj("loud"), "--look", "isometric-world", "--groups", "a:hook", "--music", "metal").out, /--music must be one of/);

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
