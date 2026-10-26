#!/usr/bin/env node
// node tests/series.mjs — scripts/series.mjs against a fixture project and a throwaway kit root (DALANG_SERIES_DIR).
// save keeps the channel-level Brief lines and the named reusable files, and refuses a scene module, a per-video
// file, an env file, a path outside the project, a symlink and a bad name. apply copies the kit's files into a new
// project and pre-fills its BRIEF.md, and never writes a scene module, even from a hand-edited kit. list that cannot
// read the root is WARN (exit 2), never "no series".
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/series.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-series-"));
const root = path.join(tmp, "kits");
const run = (args, { cwd = tmp, dir = root } = {}) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", cwd, env: { ...process.env, DALANG_SERIES_DIR: dir } });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};
let n = 0;
const mkdir = (name) => { const p = path.join(tmp, `${name}${++n}`); fs.mkdirSync(p, { recursive: true }); return p; };
const put = (base, rel, text) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const read = (base, rel) => fs.readFileSync(path.join(base, rel), "utf8");
const has = (base, rel) => fs.existsSync(path.join(base, rel));

const BRIEF = [
  "# Brief", "", "- Topic: how a siphon works", "- Platform: YouTube Shorts", "- Ratio & resolution: 9:16, 1080×1920", "- fps: 30",
  "- Narration language: en", "- Angle: Step by step", "- Realism: stylized", "- Look: G. Stylised 3D diorama", "- Energy: Punchy social",
  "- Audience: General public", "- Voice engine: VoiceStudio", "- Voice model: omnivoice", "- Voice: narrator-a", "- Duration: 60 s",
  "- Signoff: see you next time", "",
].join("\n");
const OVERLAYS = 'import { drawCaption } from "../assets/engine/type.js"; export const hud = 1;\n';
const PALETTE = '{"ground":"#f3ede4"}\n';
const FILM = 'import * as THREE from "../assets/engine/three-vendor.js"; const s = new THREE.Scene();\n';
const SET = 'import { bakeCached } from "../assets/engine/physics.js"; bakeCached();\n';

const fixture = () => {
  const p = mkdir("src");
  put(p, "BRIEF.md", BRIEF);
  put(p, "src/overlays.js", OVERLAYS);
  put(p, "src/palette.json", PALETTE);
  put(p, "src/film.js", FILM);
  put(p, "src/set.js", SET);
  put(p, "src/index.tpl.html", "<html></html>\n");
  put(p, ".env", "KEY=x\n");
  put(p, "assets/engine/type.js", "export {};\n");
  put(p, "audio/words.json", "[]\n");
  put(p, "script.md", "# script\n");
  fs.symlinkSync(path.join(p, "src/overlays.js"), path.join(p, "src/link.js"));
  put(path.dirname(p), "x.js", "export {};\n");
  return p;
};
const src = fixture();
const GOOD = ["--file", "src/overlays.js", "--file", "src/palette.json"];
let k = 0;
const fresh = () => `kit${++k}`;

// 1. save ok: channel lines verbatim, no per-video lines, files byte-identical, no scene file.
{
  const r = run(["save", "chan", "--from", src, ...GOOD]);
  assert.equal(r.code, 0, r.out);
  const md = read(root, "chan/SERIES.md");
  for (const l of ["- Platform: YouTube Shorts", "- fps: 30", "- Voice: narrator-a", "- Signoff: see you next time", "- Look: G. Stylised 3D diorama"]) assert.ok(md.includes(l), `SERIES.md lacks ${l}`);
  for (const w of ["Topic", "Angle", "Duration", "siphon"]) assert.ok(!md.includes(w), `SERIES.md carries ${w}`);
  assert.equal(read(root, "chan/files/src/overlays.js"), OVERLAYS);
  assert.equal(read(root, "chan/files/src/palette.json"), PALETTE);
  assert.ok(!has(root, "chan/files/src/film.js"));
}

// 2. save refuses scene code, env, per-video files, escapes and symlinks; nothing is written (also in a mixed list).
{
  const bad = ["src/film.js", "src/set.js", ".env", "../x.js", path.join(src, "src/overlays.js"), "assets/engine/type.js", "audio/words.json", "script.md", "src/index.tpl.html", "src/link.js", "BRIEF.md", "src/missing.js"];
  for (const f of bad) {
    const name = fresh();
    const r = run(["save", name, "--from", src, "--file", f]);
    assert.equal(r.code, 1, `${f}: ${r.out}`);
    assert.ok(!has(root, name), `${f}: kit written`);
    const mixed = fresh();
    const m = run(["save", mixed, "--from", src, "--file", "src/overlays.js", "--file", f]);
    assert.equal(m.code, 1, `mixed ${f}: ${m.out}`);
    assert.ok(!has(root, mixed), `mixed ${f}: kit written`);
  }
  // a project with no channel-level line is a kit without a brief: refused
  const lone = mkdir("lone");
  put(lone, "BRIEF.md", "# Brief\n\n- Topic: x\n");
  const name = fresh();
  assert.equal(run(["save", name, "--from", lone]).code, 1);
  assert.ok(!has(root, name));
  // no BRIEF.md at all
  assert.equal(run(["save", fresh(), "--from", mkdir("empty")]).code, 1);
}

// 3. bad names.
{
  for (const bad of ["../evil", "a b", "", ".hidden"]) {
    const r = run(["save", bad, "--from", src, ...GOOD]);
    assert.equal(r.code, 1, `name "${bad}": ${r.out}`);
  }
  assert.ok(!fs.existsSync(path.join(tmp, "evil")));
  assert.equal(fs.readdirSync(root).join(","), "chan");
}

// 4. an existing name needs --force; note adds a rule; --force keeps the rules.
{
  assert.equal(run(["save", "chan", "--from", src, ...GOOD]).code, 1);
  assert.equal(run(["note", "chan", ""]).code, 1);
  const n1 = run(["note", "chan", "CC0 music only"]);
  assert.equal(n1.code, 0, n1.out);
  assert.ok(read(root, "chan/SERIES.md").includes("- CC0 music only"));
  assert.equal(run(["note", "nokit", "x"]).code, 1);
  const f = run(["save", "chan", "--from", src, ...GOOD, "--force"]);
  assert.equal(f.code, 0, f.out);
  assert.ok(read(root, "chan/SERIES.md").includes("- CC0 music only"));
}

// 5. list: the kit; empty or missing root = 0; unreadable root = 2 + WARN, never "no series".
{
  const l = run(["list"]);
  assert.equal(l.code, 0, l.out);
  assert.match(l.out, /chan.*YouTube Shorts/);
  const emptyRoot = mkdir("emptyroot");
  const e = run(["list"], { dir: emptyRoot });
  assert.equal(e.code, 0);
  assert.match(e.out, /No series kits yet/);
  const m = run(["list"], { dir: path.join(tmp, "does-not-exist") });
  assert.equal(m.code, 0);
  assert.match(m.out, /No series kits yet/);
  const file = path.join(tmp, "rootfile");
  fs.writeFileSync(file, "x");
  const u = run(["list"], { dir: file });
  assert.equal(u.code, 2, u.out);
  assert.match(u.out, /WARN/);
  assert.doesNotMatch(u.out, /no series/i);
  const noMd = mkdir("nomd");
  fs.mkdirSync(path.join(noMd, "broken"));
  const w = run(["list"], { dir: noMd });
  assert.equal(w.code, 2, w.out);
  assert.match(w.out, /WARN.*broken/);
}

// 6. apply to a fresh project: files land, BRIEF.md pre-filled, rules printed.
{
  const dst = mkdir("dst");
  const r = run(["apply", "chan", dst]);
  assert.equal(r.code, 0, r.out);
  assert.equal(read(dst, "src/overlays.js"), OVERLAYS);
  assert.equal(read(dst, "src/palette.json"), PALETTE);
  const b = read(dst, "BRIEF.md");
  for (const l of ["- series: chan", "- Platform: YouTube Shorts", "- Signoff: see you next time"]) assert.ok(b.includes(l), `BRIEF.md lacks ${l}`);
  assert.ok(!/topic/i.test(b), "BRIEF.md carries a topic");
  assert.match(r.out, /CC0 music only/);
  for (const f of ["src/film.js", "src/set.js", "src/index.tpl.html", ".env"]) assert.ok(!has(dst, f), `${f} copied`);
}

// 7. apply onto a BRIEF.md that has its own Platform: kept once, other lines added, INFO names it.
{
  const dst = mkdir("dst");
  put(dst, "BRIEF.md", "# Brief\n\n- Topic: another subject\n- Platform: YouTube landscape\n");
  const r = run(["apply", "chan", dst]);
  assert.equal(r.code, 0, r.out);
  const b = read(dst, "BRIEF.md");
  assert.equal((b.match(/Platform:/g) ?? []).length, 1);
  assert.ok(b.includes("- Platform: YouTube landscape") && b.includes("- Topic: another subject"));
  assert.ok(b.includes("- Voice: narrator-a") && b.includes("- series: chan"));
  assert.match(r.out, /INFO.*platform/i);
}

// 8. a tampered kit with a scene module: apply refuses and writes nothing.
{
  put(root, "chan/files/src/set.js", SET);
  const dst = mkdir("dst");
  const r = run(["apply", "chan", dst]);
  assert.equal(r.code, 1, r.out);
  assert.ok(!has(dst, "src/overlays.js") && !has(dst, "BRIEF.md") && !has(dst, "src/set.js"));
  fs.rmSync(path.join(root, "chan/files/src/set.js"));
  put(root, "chan/files/.env", "KEY=x\n");
  const r2 = run(["apply", "chan", mkdir("dst")]);
  assert.equal(r2.code, 1, r2.out);
  fs.rmSync(path.join(root, "chan/files/.env"));
  assert.equal(run(["apply", "chan", mkdir("dst")]).code, 0);
}

// 9. a destination that differs: refused without --force, overwritten with it; identical bytes are fine.
{
  const dst = mkdir("dst");
  put(dst, "src/overlays.js", "export const mine = 1;\n");
  const r = run(["apply", "chan", dst]);
  assert.equal(r.code, 1, r.out);
  assert.equal(read(dst, "src/overlays.js"), "export const mine = 1;\n");
  assert.ok(!has(dst, "BRIEF.md") && !has(dst, "src/palette.json"));
  const f = run(["apply", "chan", dst, "--force"]);
  assert.equal(f.code, 0, f.out);
  assert.equal(read(dst, "src/overlays.js"), OVERLAYS);
  assert.equal(run(["apply", "chan", dst]).code, 0);
}

// 10. an unknown kit, an unreadable kit root.
{
  const r = run(["apply", "nokit", mkdir("dst")]);
  assert.equal(r.code, 1, r.out);
  const file = path.join(tmp, "rootfile");
  const u = run(["apply", "chan", mkdir("dst")], { dir: file });
  assert.equal(u.code, 2, u.out);
  assert.match(u.out, /WARN/);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("series: all cases pass");
