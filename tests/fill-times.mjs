#!/usr/bin/env node
// node tests/fill-times.mjs — scripts/fill_times.mjs, plain and with --lang. Plain: the times only (index.html is what
// Gate 4 hashes, so it must come back byte for byte). --lang <code>: times from audio/<code>/, and every local
// src/href switched to its language variant (audio/x -> audio/<code>/x, a missing one is FAILED; dir/name.ext ->
// dir/name.<code>.ext when it exists, else FAILED for narration.* / strings.*; any other language-free asset and a CDN
// URL are kept).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fill = fileURLToPath(new URL("../scripts/fill_times.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-fill-times-"));
const run = (...args) => { const r = spawnSync(process.execPath, [fill, "src/index.tpl.html", "index.html", ...args], { cwd: tmp, encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const put = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const read = () => fs.readFileSync(path.join(tmp, "index.html"));
const takes = (dir, duration, start) => {
  put(`${dir}/beats.json`, JSON.stringify({ duration, beats: [{ name: "hook", start }] }));
  put(`${dir}/words.json`, JSON.stringify([{ i: 0, text: "a", start, end: start + 0.2 }]));
  put(`${dir}/beats.js`, "window.BEATS = {};");
  put(`${dir}/captions.js`, "window.CAPTIONS = [];");
};

// A generic project: a template whose attributes follow the voice and whose files name their paths.
takes("audio", 10, 1);
takes("audio/de", 12, 2);
for (const f of ["assets/narration.m4a", "assets/narration.de.m4a", "strings.js", "strings.de.js", "assets/tex.png"]) put(f, "x");
const TPL = [
  '<div data-start="{{hook}}" data-duration="{{END}}"></div>',
  '<script src="audio/beats.js"></script>',
  '<script src="audio/captions.js"></script>',
  '<script src="strings.js"></script>',
  '<audio src="assets/narration.m4a"></audio>',
  '<img src="assets/tex.png">',
  '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>',
].join("\n") + "\n";
put("src/index.tpl.html", TPL);

try {
  let plain;
  { // 1. a plain run: times only
    const r = run();
    assert.equal(r.code, 0, r.out + r.err);
    const html = read().toString();
    assert.match(html, /data-start="1" data-duration="10"/);
    for (const p of ["audio/beats.js", "audio/captions.js", "strings.js", "assets/narration.m4a", "assets/tex.png"]) assert.ok(html.includes(`"${p}"`), p);
    assert.doesNotMatch(r.out, /--lang/);
    plain = read();
    console.log("ok  a plain run fills the times and leaves every path as the template has it");
  }
  { // 2. --lang de
    const r = run("--lang", "de");
    assert.equal(r.code, 0, r.out + r.err);
    const html = read().toString();
    assert.match(html, /data-start="2" data-duration="12"/);
    for (const p of ["audio/de/beats.js", "audio/de/captions.js", "strings.de.js", "assets/narration.de.m4a", "assets/tex.png", "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"]) assert.ok(html.includes(`"${p}"`), p);
    assert.doesNotMatch(html, /"audio\/beats\.js"|"strings\.js"|"assets\/narration\.m4a"/);
    assert.match(r.out, /--lang de: 4 path\(s\) switched/);
    assert.match(r.out, /strings\.js → strings\.de\.js/);
    console.log("ok  --lang de: times from audio/de, language variants switched, a language-free asset and a CDN URL kept");
  }
  { // 3. a plain run again: Gate 4's index.html comes back byte for byte
    const r = run();
    assert.equal(r.code, 0, r.out + r.err);
    assert.ok(read().equals(plain), "index.html differs from the first plain run");
    console.log("ok  a plain run after a --lang run gives the first run's bytes");
  }
  { // 3b. the language-bound files outside audio/ (the narration the film plays, the on-screen words) and a ./audio path
    put("audio/narration.wav", "x");
    put("audio/de/narration.wav", "x");
    put("src/index.tpl.html", TPL + '<audio src="./audio/narration.wav"></audio>\n');
    let r = run("--lang", "de");
    assert.equal(r.code, 0, r.out + r.err);
    assert.ok(read().toString().includes('"audio/de/narration.wav"'), "./audio/ was not switched");
    assert.doesNotMatch(read().toString(), /"\.\/audio\//);
    for (const [gone, word] of [["assets/narration.de.m4a", /assets\/narration\.m4a/], ["strings.de.js", /strings\.js/], ["audio/de/narration.wav", /audio\/narration\.wav/]]) {
      const keep = fs.readFileSync(path.join(tmp, gone));
      fs.rmSync(path.join(tmp, gone));
      put("index.html", "SENTINEL");
      r = run("--lang", "de");
      assert.equal(r.code, 1, `${gone}: ${r.out}${r.err}`);
      assert.match(r.err, word, gone);
      assert.equal(read().toString(), "SENTINEL", `${gone}: the out file was rewritten`);
      put(gone, keep);
    }
    // a template naming a language folder that holds no such file is refused too
    put("src/index.tpl.html", '<script src="audio/de/nope.js"></script>\n');
    r = run("--lang", "de");
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.err, /audio\/de\/nope\.js/);
    // the other side: a template with no language-bound file, and an image with no variant, still pass
    put("src/index.tpl.html", '<img src="assets/tex.png"><script src="mine.js"></script>\n');
    r = run("--lang", "de");
    assert.equal(r.code, 0, r.out + r.err);
    put("src/index.tpl.html", TPL);
    console.log("ok  a missing narration / strings / ./audio variant is FAILED, the output untouched; a language-free asset still passes");
  }
  { // 4. a variant missing under audio/: FAILED, nothing written
    fs.rmSync(path.join(tmp, "audio/de/captions.js"));
    put("index.html", "SENTINEL");
    const r = run("--lang", "de");
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.err, /audio\/captions\.js/);
    assert.equal(read().toString(), "SENTINEL", "the out file was rewritten");
    console.log("ok  an audio/ path with no language variant is FAILED, the output untouched");
  }
  { // 5. flags: --lang with --audio, a path-like code, a missing value, an unknown flag, a missing take
    for (const args of [["--lang", "de", "--audio", "audio"], ["--audio", "audio", "--lang", "de"], ["--lang", "../x"], ["--lang"], ["--lang", "de", "--bogus"]]) {
      const r = run(...args);
      assert.equal(r.code, 1, `${args.join(" ")}: ${r.out}${r.err}`);
      assert.match(r.err, /Usage/, args.join(" "));
    }
    const r = run("--lang", "fr");
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.err, /FAILED: no audio\/fr\/beats\.json/);
    const a = run("--audio", "audio/de");
    assert.equal(a.code, 0, a.out + a.err);
    assert.match(read().toString(), /data-start="2"/);
    console.log("ok  --lang with --audio, a code like ../x, a missing value, an unknown flag, a missing take: refused; --audio alone still works");
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
