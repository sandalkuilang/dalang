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
  let r = run(d, "--look", "isometric-world", "--groups", "intro:hook,body:middle,end:close");
  assert.equal(r.code, 0, r.out);
  const host = read(d, "src/index.tpl.html");
  assert.match(host, /id="intro" [^>]*data-start="0" data-duration="\{\{middle\}\}"/, "the first group opens at 0");
  assert.match(host, /id="body" [^>]*data-start="\{\{middle\}\}" data-duration="\{\{close - middle\}\}"/);
  assert.match(host, /id="end" [^>]*data-start="\{\{close\}\}" data-duration="\{\{END - close\}\}"/, "the last group closes at END");
  assert.doesNotMatch(read(d, "review/builder-intro.md"), /research\/anatomy\.md/, "no anatomy file: the world brief does not name one");
  const a = proj("anat");
  fs.mkdirSync(path.join(a, "research")); fs.writeFileSync(path.join(a, "research/anatomy.md"), "Thing: a pump\n");
  r = run(a, "--look", "isometric-world", "--groups", "intro:hook,body:middle,end:close");
  assert.equal(r.code, 0, r.out);
  assert.match(read(a, "review/builder-intro.md"), /research\/anatomy\.md/, "the world builder builds the hero from its anatomy");
  assert.doesNotMatch(read(a, "review/builder-body.md"), /research\/anatomy\.md/, "only the world's owner reads it");
  assert.match(host, /font-family: "Kohinoor Bangla", Helvetica/, "the host sets the one typeface");
  assert.match(host, /@font-face\{font-family:"Kohinoor Bangla";font-weight:600;src:local\("Kohinoor Bangla Semibold"\)/, "its weights are declared from the installed font");
  assert.doesNotMatch(host, /googleapis|Fredoka|Nunito|Inter"|__FAMILY__|__FONT_FACES__/, "no other family, no placeholder left");
  for (const g of ["intro", "body", "end"]) assert.doesNotMatch(read(d, `src/compositions/${g}.tpl.html`), /__[A-Z]+__/, `${g}: every placeholder filled`);
  assert.match(read(d, "src/compositions/intro.tpl.html"), /const G0 = 0, G1 = b\("middle"\)/);
  assert.match(read(d, "src/compositions/end.tpl.html"), /G1 = window\.NARRATION_DURATION/);
  assert.doesNotMatch(read(d, "src/compositions/end.tpl.html"), /illustration|__ILLUSTRATION__/, "no illustration label in a group");
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
  // each group's check round is one script: the world's owner checks at once, every other group waits for the world first
  const cIntro = read(d, "review/check-intro.sh"), cBody = read(d, "review/check-body.sh");
  assert.match(cBody, /grep -q '\^export const STUB'/, "another group waits for the world before its checks");
  assert.doesNotMatch(cIntro, /STUB/, "the world's owner does not wait for itself");
  for (const [g, c] of [["intro", cIntro], ["body", cBody]]) {
    assert.match(c, new RegExp(`fill_times\\.mjs" src/compositions/${g}\\.tpl\\.html compositions/${g}\\.html`), `${g}: fills its own group`);
    assert.match(c, /lint_scene\.mjs/); assert.match(c, new RegExp(`film_gate\\.mjs" \\. --group ${g}`), `${g}: film_gate on its own seams`);
    assert.match(c, /^exit \$f$/m, `${g}: the script's exit is the checks' verdict`);
    assert.equal(spawnSync("sh", ["-n", path.join(d, "review", `check-${g}.sh`)]).status, 0, `${g}: the check script parses`);
    assert.ok(fs.statSync(path.join(d, "review", `check-${g}.sh`)).mode & 0o100, `${g}: the check script is executable`);
    assert.match(read(d, `review/builder-${g}.md`), new RegExp(`sh review/check-${g}\\.sh`), `${g}: the brief runs its check script`);
  }
  assert.ok(read(d, "review/builder-body.md").length < 3500 && bIntro.length < 4500, "the briefs stay short (each byte is read by a builder)");
  assert.match(bBody, /under a third of the frame height/, "the look check names the subject's size");
  assert.match(bBody, /is the `intro` builder.s: import it, never copy/, "every other builder imports it");
  assert.match(bBody, /cues\.mjs \. --beats middle/, "a brief names its cue table");
  assert.match(bBody, /kit and template lists: build every object part by part/, "a brief builds every object from the card's kits and templates");
  assert.doesNotMatch(bBody, /examples/, "a brief names no example specs");
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
  assert.match(r.out, /^scaffold: wrote .*; kept .*src\/index\.tpl\.html/m);

  // refusals write nothing
  for (const [groups, why] of [["a:middle,b:hook", /narration order/], ["a:hook,b:nowhere", /no beat "nowhere"/], ["A b:hook", /group name/], ["a:hook,a:middle", /twice/]]) {
    const e = proj(`bad${groups.length}${why.source.length}`);
    r = run(e, "--look", "isometric-world", "--groups", groups);
    assert.equal(r.code, 1, `${groups}: ${r.out}`); assert.match(r.out, why);
    assert.ok(!fs.existsSync(path.join(e, "src")) && !fs.existsSync(path.join(e, "assets")), `${groups}: nothing written`);
  }
  assert.match(run(proj("look"), "--look", "watercolour", "--groups", "a:hook").out, /--look must be one of/);
  // object-studio installs engine/three: its brief reads its own card, never the iso look's kit lists or any examples
  const os3 = proj("studio");
  fs.mkdirSync(path.join(os3, "assets")); fs.writeFileSync(path.join(os3, "assets/objectStudio.js"), "// engine already installed\n");
  r = run(os3, "--look", "object-studio", "--groups", "a:hook,b:close", "--music", "none");
  assert.equal(r.code, 0, r.out);
  for (const g of ["a", "b"]) {
    const brief = read(os3, `review/builder-${g}.md`);
    assert.doesNotMatch(brief, /examples|kit and template lists/, `${g}: object-studio names no examples and no iso kit lists`);
    assert.match(brief, /object-studio-API\.md/, `${g}: object-studio reads its own card`);
  }
  console.log("scaffold: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
