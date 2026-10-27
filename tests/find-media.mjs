#!/usr/bin/env node
// node tests/find-media.mjs — scripts/find_media.mjs against a mock Openverse / Wikimedia Commons (no real network).
// Music, SFX and image searches print licensed results and download their previews; an NC or ND result, and a CC BY
// result with no creator to credit, are dropped; --take copies one into the project and appends an ASSETS.json row that
// passes check_assets.mjs; a 429 is retried after its Retry-After; a source that fails is a WARN + "rerun" (exit 3),
// never "nothing matched"; music is told from SFX by duration, not by category; the bundled /media-use SFX library takes its licence from its own CREDITS.md.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const find = fileURLToPath(new URL("../scripts/find_media.mjs", import.meta.url));
const check = fileURLToPath(new URL("../scripts/check_assets.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-find-media-"));

// A mock API: `routes(url, hits)` answers a search request with [status, body, headers]; /files/* answers with bytes.
function mock(routes) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.startsWith("/files/")) { res.writeHead(200, { "content-type": "application/octet-stream" }); return res.end("FAKE-BYTES-" + u.pathname); }
    seen.push(req.url);
    const [code, body, headers = {}] = routes(u, seen.filter((s) => s.startsWith(u.pathname)).length, `http://127.0.0.1:${srv.address().port}`);
    res.writeHead(code, { "content-type": "application/json", ...headers });
    res.end(Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body));
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, seen, base: `http://127.0.0.1:${srv.address().port}` })));
}
const withMock = async (routes, fn) => {
  const m = await mock(routes);
  try { return await fn(m); } finally { m.srv.close(); m.srv.closeAllConnections(); }
};
const run = (args, env = {}, cwd) => new Promise((ok) => execFile(process.execPath, [find, ...args], { cwd, timeout: 60000, env: { ...process.env, FIND_MEDIA_BACKOFF_MS: "0", ...env } }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));
const runCheck = (dir) => new Promise((ok) => execFile(process.execPath, [check, dir], { timeout: 60000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));
const env = (m) => ({ OPENVERSE_API: `${m.base}/v1`, COMMONS_API: `${m.base}/w/api.php` });
const dir = (name) => { const d = path.join(tmp, name + "-" + Math.random().toString(36).slice(2, 8)); fs.mkdirSync(d, { recursive: true }); return d; };

const failures = [];
let count = 0;
const test = async (name, fn) => { count++; try { await fn(); } catch (e) { failures.push(`✗ ${name}: ${e.stack?.split("\n").slice(0, 3).join(" | ") ?? e.message}`); } };

// Openverse result shapes (public API: id, title, url, foreign_landing_url, creator, license, license_version,
// duration in ms for audio, filetype, provider).
const ov = (base, over) => ({ id: "i" + Math.random(), title: "A track", url: `${base}/files/a.mp3`, foreign_landing_url: "https://example.org/a", creator: "Ann", license: "by", license_version: "4.0", duration: 90000, filetype: "mp3", provider: "jamendo", ...over });
const audioRoutes = (u, _n, base) => {
  if (u.pathname === "/v1/audio/") return [200, { result_count: 4, results: [
    ov(base, { id: "good", title: "Calm Morning", url: `${base}/files/good.mp3`, foreign_landing_url: "https://example.org/good" }),
    ov(base, { id: "nc", title: "Paid Work", license: "by-nc", url: `${base}/files/nc.mp3` }),
    ov(base, { id: "nocreator", title: "Nobody", creator: null, url: `${base}/files/nocreator.mp3` }),
    ov(base, { id: "long", title: "Long One", license: "cc0", license_version: "1.0", creator: null, duration: 60000, url: `${base}/files/long.mp3` }),
    ov(base, { id: "short", title: "Short One", license: "cc0", license_version: "1.0", creator: null, duration: 1500, url: `${base}/files/short.mp3` }),
  ] }];
  return [404, {}];
};

await test("1. music: licensed results with previews and results.json, no category filter, a clip under 20 s is not music; NC and a CC BY without creator are dropped", async () => withMock(audioRoutes, async (m) => {
  const out = dir("music");
  const r = await run(["--type", "music", "--query", "calm morning", "--out", out], env(m));
  assert.equal(r.code, 0, r.out);
  assert.ok(m.seen.every((s) => !/category=/.test(s)), m.seen.join(" "));
  assert.ok(m.seen.some((s) => /license=cc0/.test(decodeURIComponent(s))), "licence filter not sent");
  assert.match(r.out, /Calm Morning/); assert.match(r.out, /CC-BY-4\.0/); assert.match(r.out, /Ann/);
  assert.doesNotMatch(r.out, /Paid Work|Nobody/);
  assert.match(r.out, /--take/);
  const res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  assert.deepEqual(res.map((x) => x.title).sort(), ["Calm Morning", "Long One"]);
  for (const x of res) assert.ok(fs.existsSync(path.join(out, x.file)), x.file);
  const good = res.find((x) => x.title === "Calm Morning");
  assert.equal(good.licence, "CC-BY-4.0"); assert.equal(good.author, "Ann"); assert.equal(good.duration, 90);
}));

await test("2. sfx: category sound_effect; --max-duration drops a longer result", async () => withMock(audioRoutes, async (m) => {
  const out = dir("sfx");
  const r = await run(["--type", "sfx", "--query", "door slam", "--max-duration", "2", "--licence", "cc0", "--out", out], env(m));
  assert.ok(m.seen.some((s) => /category=sound_effect/.test(s)), m.seen.join(" "));
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  assert.deepEqual(res.map((x) => x.title), ["Short One"]);
  assert.equal(res[0].licence, "CC0");
  const out2 = dir("sfx2");
  const r2 = await run(["--type", "sfx", "--query", "door slam", "--max-duration", "1", "--out", out2], env(m));
  assert.equal(r2.code, 1, r2.out); assert.match(r2.out, /nothing matched/);
}));

await test("3. --take copies the file, appends a row that passes check_assets, and a second take replaces it", async () => withMock(audioRoutes, async (m) => {
  const out = dir("take"), proj = dir("proj");
  fs.writeFileSync(path.join(proj, "ASSETS.json"), "[]");
  await run(["--type", "music", "--query", "calm", "--out", out], env(m));
  const res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  const good = res.find((x) => x.title === "Calm Morning");
  const t = await run(["--take", path.join(out, good.file), "--as", "assets/music.mp3", "--project", proj]);
  assert.equal(t.code, 0, t.out);
  assert.ok(fs.existsSync(path.join(proj, "assets/music.mp3")));
  const rows = JSON.parse(fs.readFileSync(path.join(proj, "ASSETS.json"), "utf8"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].file, "assets/music.mp3"); assert.equal(rows[0].source, "https://example.org/good");
  assert.equal(rows[0].licence, "CC-BY-4.0"); assert.equal(rows[0].author, "Ann");
  const c = await runCheck(proj);
  assert.equal(c.code, 0, c.out);
  const long = res.find((x) => x.title === "Long One");
  const t2 = await run(["--take", path.join(out, long.file), "--as", "assets/music.mp3", "--project", proj]);
  assert.equal(t2.code, 0, t2.out);
  const rows2 = JSON.parse(fs.readFileSync(path.join(proj, "ASSETS.json"), "utf8"));
  assert.equal(rows2.length, 1); assert.equal(rows2[0].licence, "CC0"); assert.equal(rows2[0].author, undefined);
  assert.equal((await runCheck(proj)).code, 0);
}));

await test("4. a 429 with Retry-After is waited out and the search then succeeds", async () => {
  await withMock((u, n, base) => (n === 1 ? [429, {}, { "retry-after": "0" }] : audioRoutes(u, n, base)), async (m) => {
    const r = await run(["--type", "music", "--query", "calm", "--out", dir("retry")], env(m));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /backing off/);
    assert.match(r.out, /Calm Morning/);
  });
});

await test("5. a source that always fails is a WARN with rerun (exit 3), never 'nothing matched'", async () => withMock(() => [500, "boom"], async (m) => {
  const r = await run(["--type", "music", "--query", "calm", "--out", dir("fail")], env(m));
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /WARN.*rerun/);
  assert.doesNotMatch(r.out, /nothing matched/);
}));

await test("6. every source answered with nothing usable: exit 1 'nothing matched'", async () => withMock(() => [200, { result_count: 0, results: [] }], async (m) => {
  const r = await run(["--type", "music", "--query", "zzzz", "--out", dir("empty")], env(m));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /nothing matched/);
  assert.doesNotMatch(r.out, /WARN/);
}));

await test("7. image from Commons: CC BY-SA 4.0 becomes CC-BY-SA-4.0 and the artist's HTML is stripped; NC and ND are dropped", async () => {
  let base = "";
  const page = (title, lic, artist) => ({ title: `File:${title}.jpg`, imageinfo: [{ thumburl: `${base}/files/${title}.jpg`, url: `${base}/files/full-${title}.jpg`, descriptionurl: `https://commons.example/wiki/File:${title}.jpg`, mime: "image/jpeg", extmetadata: { LicenseShortName: { value: lic }, Artist: { value: artist } } }] });
  await withMock((u) => {
    if (u.pathname === "/w/api.php") return [200, { query: { pages: {
      1: page("Old bridge", "CC BY-SA 4.0", '<a href="//commons.example/User:Bo">Bo Park</a>'),
      2: page("Nope nc", "CC BY-NC 4.0", "X"),
      3: page("Nope nd", "CC BY-ND 2.0", "X"),
      4: page("Open sky", "CC0", ""),
    } } }];
    return [404, {}];
  }, async (m) => {
    base = `http://127.0.0.1:${m.srv.address().port}`;
    const out = dir("image");
    const r = await run(["--type", "image", "--query", "bridge", "--source", "commons", "--licence", "cc0,by,by-sa", "--out", out], env(m));
    assert.equal(r.code, 0, r.out);
    assert.ok(m.seen.some((s) => /generator=search/.test(s) && /gsrnamespace=6/.test(s)), m.seen.join(" "));
    const res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
    assert.deepEqual(res.map((x) => x.licence).sort(), ["CC-BY-SA-4.0", "CC0"]);
    const sa = res.find((x) => x.licence === "CC-BY-SA-4.0");
    assert.equal(sa.author, "Bo Park"); assert.equal(sa.landing, "https://commons.example/wiki/File:Old bridge.jpg");
    assert.match(sa.file, /\.jpg$/);
    // the default licence set leaves share-alike out
    const out2 = dir("image2");
    await run(["--type", "image", "--query", "bridge", "--source", "commons", "--out", out2], env(m));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out2, "results.json"), "utf8")).map((x) => x.licence), ["CC0"]);
  });
});

// The bundled /media-use SFX library: licence from its own CREDITS.md, durations and descriptions from manifest.json.
const bundle = (credits) => {
  const d = dir("bundle");
  fs.writeFileSync(path.join(d, "whoosh.mp3"), "W"); fs.writeFileSync(path.join(d, "click.mp3"), "C");
  if (credits) fs.writeFileSync(path.join(d, "CREDITS.md"), credits);
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ whoosh: { file: "whoosh.mp3", duration: 1.2, description: "Fast air pass, a transition" }, click: { file: "click.mp3", duration: 0.4, description: "Crisp UI click" } }));
  return d;
};
await test("8. --bundled: licence and source from CREDITS.md, --query filters, --take row passes check_assets", async () => {
  const lib = bundle("All sound effects are used under the [Pixabay Content License](https://pixabay.com/service/license-summary/).\n");
  const out = dir("bundled"), proj = dir("proj");
  fs.writeFileSync(path.join(proj, "ASSETS.json"), "[]");
  const r = await run(["--type", "sfx", "--bundled", "--media-use", lib, "--query", "transition", "--out", out]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /whoosh/); assert.doesNotMatch(r.out, /click/);
  const res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  assert.equal(res.length, 1); assert.equal(res[0].licence, "Pixabay Content License"); assert.equal(res[0].duration, 1.2);
  assert.equal(res[0].landing, "https://pixabay.com/service/license-summary/");
  const t = await run(["--take", path.join(out, res[0].file), "--as", "assets/sfx/whoosh.mp3", "--project", proj]);
  assert.equal(t.code, 0, t.out);
  assert.equal((await runCheck(proj)).code, 0);
  // no query lists them all; --max-duration applies
  const all = await run(["--type", "sfx", "--bundled", "--media-use", lib, "--max-duration", "0.5", "--out", dir("bundled2")]);
  assert.equal(all.code, 0, all.out); assert.match(all.out, /click/); assert.doesNotMatch(all.out, /whoosh/);
});
await test("8b. --bundled with no readable CREDITS.md is a WARN with rerun (exit 3), never a guessed licence", async () => {
  const r = await run(["--type", "sfx", "--bundled", "--media-use", bundle(null), "--out", dir("nocredits")]);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /WARN.*rerun/); assert.match(r.out, /--media-use/);
  assert.doesNotMatch(r.out, /nothing matched|install/i);
  const r2 = await run(["--type", "sfx", "--bundled", "--media-use", path.join(tmp, "no-such-dir"), "--out", dir("nodir")]);
  assert.equal(r2.code, 3, r2.out); assert.match(r2.out, /WARN.*rerun/);
});

await test("9. --take refuses a destination outside assets/ or outside the project, and a file that is no find_media result", async () => withMock(audioRoutes, async (m) => {
  const out = dir("refuse"), proj = dir("proj");
  await run(["--type", "music", "--query", "calm", "--out", out], env(m));
  const file = path.join(out, JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"))[0].file);
  for (const as of ["../x", "assets/../../x", "x.mp3", "/tmp/x.mp3"]) {
    const r = await run(["--take", file, "--as", as, "--project", proj]);
    assert.equal(r.code, 2, `${as}: ${r.out}`);
  }
  assert.ok(!fs.existsSync(path.join(proj, "ASSETS.json")), "a refused take must not write ASSETS.json");
  const stray = path.join(proj, "stray.mp3"); fs.writeFileSync(stray, "x");
  const r = await run(["--take", stray, "--as", "assets/s.mp3", "--project", proj]);
  assert.equal(r.code, 2, r.out); assert.match(r.out, /no results\.json row/);
  fs.writeFileSync(path.join(proj, "ASSETS.json"), '{"not":"a list"}');
  const r2 = await run(["--take", file, "--as", "assets/s.mp3", "--project", proj]);
  assert.equal(r2.code, 2, r2.out);
}));

await test("10. usage errors exit 2", async () => {
  assert.equal((await run(["--type", "music"])).code, 2);
  assert.equal((await run(["--type", "video", "--query", "x", "--out", dir("u")])).code, 2);
  assert.equal((await run(["--query", "x", "--out", dir("u")])).code, 2);
});

await test("11. an empty Commons answer ({\"batchcomplete\":\"\"}) is an answer: exit 1 'nothing matched', no WARN; garbage is still a WARN", async () => {
  for (const [name, body] of [["old", '{"batchcomplete":""}'], ["v2", '{"batchcomplete":true}']]) {
    await withMock((u) => (u.pathname === "/w/api.php" ? [200, body] : [200, { result_count: 0, results: [] }]), async (m) => {
      const r = await run(["--type", "image", "--query", "zzqxqvwvkqzz", "--source", "commons", "--out", dir("cempty-" + name)], env(m));
      assert.equal(r.code, 1, `${name}: ${r.out}`);
      assert.match(r.out, /nothing matched/); assert.doesNotMatch(r.out, /WARN|did not answer/);
      const both = await run(["--type", "image", "--query", "zzqxqvwvkqzz", "--out", dir("cempty2-" + name)], env(m));
      assert.equal(both.code, 1, `${name} both: ${both.out}`); assert.doesNotMatch(both.out, /WARN/);
    });
  }
  // the other side: an answer that is not a MediaWiki reply is still an outage, never "no results"
  for (const [name, body] of [["error", '{"error":{"code":"internal_api_error","info":"x"}}'], ["empty-object", "{}"], ["array", "[]"], ["null", "null"]]) {
    await withMock((u) => (u.pathname === "/w/api.php" ? [200, body] : [200, { result_count: 0, results: [] }]), async (m) => {
      const r = await run(["--type", "image", "--query", "bridge", "--source", "commons", "--out", dir("cbad-" + name)], env(m));
      assert.equal(r.code, 3, `${name}: ${r.out}`); assert.match(r.out, /WARN.*rerun/); assert.doesNotMatch(r.out, /nothing matched/);
    });
  }
});

await test("12. --bundled applies the search path's filters: NC/ND dropped, CC BY (no creator named) dropped, outside --licence dropped; a custom licence and a matching CC0 still list", async () => {
  const lib = (lic) => bundle(`All sound effects are used under the [${lic}](https://example.org/l).\n`);
  for (const lic of ["CC BY-NC-ND 4.0", "CC BY-NC 4.0", "CC BY-ND 4.0", "CC BY-NC-SA 4.0", "Non-Commercial Use Only", "CC BY 4.0", "CC BY-SA 4.0", "Creative Commons Attribution 4.0"]) {
    const out = dir("bnc");
    const r = await run(["--type", "sfx", "--bundled", "--media-use", lib(lic), "--out", out]);
    assert.equal(r.code, 1, `${lic}: ${r.out}`);
    assert.doesNotMatch(r.out, /whoosh/, lic); assert.ok(r.out.includes(lic), `the refusal names the licence "${lic}": ${r.out}`);
    assert.ok(!fs.existsSync(path.join(out, "whoosh.mp3")), `${lic}: a refused file must not be copied`);
    assert.ok(!fs.existsSync(path.join(out, "results.json")), lic);
  }
  // CC BY-SA asked for by name still needs a creator the library does not name: refused
  assert.equal((await run(["--type", "sfx", "--bundled", "--media-use", lib("CC BY-SA 4.0"), "--licence", "by-sa", "--out", dir("bsa")])).code, 1);
  // legitimate: CC0 and public domain list, a custom licence (no CC family) lists, CC0 is out when --licence asks for by-sa only
  for (const lic of ["CC0 1.0", "Public Domain", "Pixabay Content License"]) {
    const r = await run(["--type", "sfx", "--bundled", "--media-use", lib(lic), "--out", dir("bok")]);
    assert.equal(r.code, 0, `${lic}: ${r.out}`); assert.match(r.out, /whoosh/);
  }
  const r = await run(["--type", "sfx", "--bundled", "--media-use", lib("CC0 1.0"), "--licence", "by-sa", "--out", dir("bout")]);
  assert.equal(r.code, 1, r.out);
});

await test("13. the documented music flow passes the licence gate: take, fit over the taken path, check_assets exit 0; a fitted file under another name has no row", async () => withMock(audioRoutes, async (m) => {
  const out = dir("flow"), proj = dir("proj");
  fs.writeFileSync(path.join(proj, "ASSETS.json"), "[]");
  await run(["--type", "music", "--query", "calm", "--out", out], env(m));
  const good = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8")).find((x) => x.title === "Calm Morning");
  assert.equal((await run(["--take", path.join(out, good.file), "--as", "assets/music.mp3", "--project", proj])).code, 0);
  // the old flow: the fit is a second file named music.m4a, the row lists music.mp3 only
  fs.writeFileSync(path.join(proj, "assets/music.m4a"), "FIT");
  const bad = await runCheck(proj);
  assert.equal(bad.code, 3, bad.out); assert.match(bad.out, /music\.m4a: not in ASSETS\.json/);
  fs.rmSync(path.join(proj, "assets/music.m4a"));
  // §7 as written: pull the take's --as and the ffmpeg destination from look-build.md and follow them
  const doc = fs.readFileSync(fileURLToPath(new URL("../references/look-build.md", import.meta.url)), "utf8").split("\n").find((l) => l.includes("--type music"));
  const as = doc.match(/--take review\/music\/<file> --as (assets\/[\w.\-]+)/)?.[1];
  assert.ok(as, "§7 names the take's --as");
  assert.doesNotMatch(doc, /assets\/music\.m4a/, "the fit must not write a file the row does not list");
  const mv = doc.match(/&& mv (assets\/[\w.\-]+) (assets\/[\w.\-]+)/);
  assert.ok(mv, "§7 moves the fitted file over the taken path"); assert.equal(mv[2], as);
  assert.ok(doc.includes(`-i ${as}`) && doc.includes(` ${mv[1]} &&`), "the fit reads the taken file and writes the temp name");
  fs.writeFileSync(path.join(proj, mv[1]), "FIT"); fs.renameSync(path.join(proj, mv[1]), path.join(proj, mv[2]));
  assert.equal((await runCheck(proj)).code, 0);
  assert.deepEqual(fs.readdirSync(path.join(proj, "assets")), ["music.mp3"], "nothing else is left in assets/");
}));

// A local file error (mkdir, copy, write) says nothing about whether media exist: it is a WARN + "rerun" (exit 3), or a
// usage error (exit 2) when the destination cannot be a file. Never exit 1, which means "every source answered and nothing matched".
const notEmpty = (r, label) => { assert.doesNotMatch(r.out, /nothing matched|refused:/, `${label}: ${r.out}`); assert.doesNotMatch(r.out, /\n\s+at /, `${label}: no stack trace: ${r.out}`); };
await test("14. a local write failure is a WARN with rerun (exit 3), never exit 1 'nothing matched'", async () => withMock(audioRoutes, async (m) => {
  const lib = bundle("All sound effects are used under the [CC0 1.0](https://example.org/l).\n");
  const blocker = path.join(dir("blk"), "afile"); fs.writeFileSync(blocker, "x");
  // --out is an existing regular file: bundled (a match exists), and the search (the sources answered)
  const b = await run(["--type", "sfx", "--bundled", "--media-use", lib, "--out", blocker]);
  assert.equal(b.code, 3, b.out); assert.match(b.out, /WARN.*rerun/); notEmpty(b, "bundled out=file");
  const s = await run(["--type", "music", "--query", "calm", "--out", blocker], env(m));
  assert.equal(s.code, 3, s.out); assert.match(s.out, /WARN.*rerun/); notEmpty(s, "search out=file");
  // results.json cannot be written (it is a folder)
  const rj = dir("rjdir"); fs.mkdirSync(path.join(rj, "results.json"));
  const r1 = await run(["--type", "music", "--query", "calm", "--out", rj], env(m));
  assert.equal(r1.code, 3, r1.out); assert.match(r1.out, /WARN.*rerun/); notEmpty(r1, "results.json is a folder");
  const r2 = await run(["--type", "sfx", "--bundled", "--media-use", lib, "--out", rj]);
  assert.equal(r2.code, 3, r2.out); assert.match(r2.out, /WARN.*rerun/); notEmpty(r2, "bundled results.json is a folder");
  // a library file that cannot be copied (dangling link)
  const lib2 = bundle("All sound effects are used under the [CC0 1.0](https://example.org/l).\n");
  fs.rmSync(path.join(lib2, "whoosh.mp3")); fs.symlinkSync(path.join(lib2, "gone.mp3"), path.join(lib2, "whoosh.mp3"));
  const r3 = await run(["--type", "sfx", "--bundled", "--media-use", lib2, "--query", "transition", "--out", dir("dang")]);
  assert.equal(r3.code, 3, r3.out); assert.match(r3.out, /WARN.*rerun/); notEmpty(r3, "dangling library file");
  // the other side: a fresh nested --out and an existing folder both still work
  const ok1 = await run(["--type", "sfx", "--bundled", "--media-use", lib, "--out", path.join(dir("nest"), "a", "b")]);
  assert.equal(ok1.code, 0, ok1.out);
  const ok2 = await run(["--type", "music", "--query", "calm", "--out", dir("okdir")], env(m));
  assert.equal(ok2.code, 0, ok2.out);
}));
await test("15. --take: a folder-like --as is a usage error (exit 2); a destination or manifest that cannot be written is a WARN with rerun (exit 3); a file path still works", async () => withMock(audioRoutes, async (m) => {
  const out = dir("tk"), proj = dir("proj");
  await run(["--type", "music", "--query", "calm", "--out", out], env(m));
  const file = path.join(out, JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"))[0].file);
  for (const as of ["assets/sfx/", "assets/", "assets/sfx//", "assets/."]) {
    const r = await run(["--take", file, "--as", as, "--project", proj]);
    assert.equal(r.code, 2, `${as}: ${r.out}`); notEmpty(r, as);
  }
  assert.ok(!fs.existsSync(path.join(proj, "ASSETS.json")), "a refused take must not write ASSETS.json");
  // --as names an existing folder
  fs.mkdirSync(path.join(proj, "assets/taken"), { recursive: true });
  const d = await run(["--take", file, "--as", "assets/taken", "--project", proj]);
  assert.equal(d.code, 3, d.out); assert.match(d.out, /WARN.*rerun/); notEmpty(d, "as=existing folder");
  // a parent of the destination is a file
  fs.writeFileSync(path.join(proj, "assets/blocker"), "x");
  const p = await run(["--take", file, "--as", "assets/blocker/x.mp3", "--project", proj]);
  assert.equal(p.code, 3, p.out); assert.match(p.out, /WARN.*rerun/); notEmpty(p, "parent is a file");
  // the manifest cannot be written (read-only file; skipped as root, which ignores the mode)
  if (process.getuid?.() !== 0) {
    const proj2 = dir("proj2"); fs.writeFileSync(path.join(proj2, "ASSETS.json"), "[]"); fs.chmodSync(path.join(proj2, "ASSETS.json"), 0o444);
    const w = await run(["--take", file, "--as", "assets/m.mp3", "--project", proj2]);
    assert.equal(w.code, 3, w.out); assert.match(w.out, /WARN.*rerun/); notEmpty(w, "read-only ASSETS.json");
  }
  // the other side: a file path under assets/ (new subfolder) still works
  const good = await run(["--take", file, "--as", "assets/sfx/new/m.mp3", "--project", proj]);
  assert.equal(good.code, 0, good.out); assert.ok(fs.existsSync(path.join(proj, "assets/sfx/new/m.mp3")));
  assert.equal(JSON.parse(fs.readFileSync(path.join(proj, "ASSETS.json"), "utf8")).length, 1);
}));

// Freesound-like CC0 music: Openverse gives it category null, so category=music matches none of it.
const freesoundRoutes = (u, _n, base) => {
  if (u.pathname !== "/v1/audio/") return [404, {}];
  if (u.searchParams.get("category") === "music") return [200, { result_count: 0, results: [] }];
  return [200, { result_count: 3, results: [
    ov(base, { id: "fs-long", title: "Piano Remix", license: "cc0", license_version: "1.0", creator: "fs", category: null, provider: "freesound", duration: 60000, url: `${base}/files/fs-long.mp3` }),
    ov(base, { id: "fs-short", title: "Door Click", license: "cc0", license_version: "1.0", creator: "fs", category: null, provider: "freesound", duration: 2000, url: `${base}/files/fs-short.mp3` }),
    ov(base, { id: "fs-null", title: "No Length", license: "cc0", license_version: "1.0", creator: "fs", category: null, provider: "freesound", duration: null, url: `${base}/files/fs-null.mp3` }),
  ] }];
};
const titles = (d) => JSON.parse(fs.readFileSync(path.join(d, "results.json"), "utf8")).map((x) => x.title).sort();

await test("16. music is kept apart from SFX by length, not by category: a CC0 track with category null is listed, a 2 s clip is not, --min-duration moves the line", async () => withMock(freesoundRoutes, async (m) => {
  const out = dir("fs");
  const r = await run(["--type", "music", "--query", "piano", "--licence", "cc0", "--out", out], env(m));
  assert.equal(r.code, 0, r.out);
  assert.ok(m.seen.every((s) => !/category=/.test(s)), m.seen.join(" "));
  assert.deepEqual(titles(out), ["No Length", "Piano Remix"]);
  assert.doesNotMatch(r.out, /Door Click/);
  const out2 = dir("fs2");
  const r2 = await run(["--type", "music", "--query", "piano", "--licence", "cc0", "--min-duration", "1", "--out", out2], env(m));
  assert.equal(r2.code, 0, r2.out);
  assert.deepEqual(titles(out2), ["Door Click", "No Length", "Piano Remix"]);
  const out3 = dir("fs3");
  const r3 = await run(["--type", "sfx", "--query", "click", "--licence", "cc0", "--out", out3], env(m));
  assert.equal(r3.code, 0, r3.out);
  assert.ok(m.seen.some((s) => /category=sound_effect/.test(s)), m.seen.join(" "));
  assert.ok(titles(out3).includes("Door Click"), "sfx has no default minimum");
  await withMock((u, _n, base) => [200, { result_count: 1, results: [ov(base, { id: "only", title: "Door Click", license: "cc0", license_version: "1.0", category: null, duration: 2000, url: `${base}/files/only.mp3` })] }], async (m2) => {
    const r4 = await run(["--type", "music", "--query", "piano", "--licence", "cc0", "--out", dir("fs4")], env(m2));
    assert.equal(r4.code, 1, r4.out); assert.match(r4.out, /nothing matched/); assert.match(r4.out, /--min-duration/);
  });
}));

await test("17. a provider filetype 'mp32' is saved as .mp3; wav stays wav", async () => withMock((u, _n, base) => [200, { result_count: 2, results: [
  ov(base, { id: "p1", title: "Piano Hiphop", filetype: "mp32", url: `${base}/files/p.mp32`, duration: 90000 }),
  ov(base, { id: "p2", title: "Wave One", filetype: "wav", url: `${base}/files/w.wav`, duration: 90000 }),
] }], async (m) => {
  const out = dir("ext");
  const r = await run(["--type", "music", "--query", "piano", "--out", out], env(m));
  assert.equal(r.code, 0, r.out);
  const files = fs.readdirSync(out).sort();
  assert.ok(files.includes("01-piano-hiphop.mp3"), files.join(" "));
  assert.ok(files.includes("02-wave-one.wav"), files.join(" "));
  assert.ok(!files.some((f) => /\.mp32$/.test(f)), files.join(" "));
}));

await test("18. a music search reads a second page when page one is all short clips; --min-duration is validated", async () => withMock((u, _n, base) => {
  if (u.searchParams.get("page") === "2") return [200, { results: [ov(base, { id: "p2", title: "Page Two Track", license: "cc0", license_version: "1.0", creator: null, duration: 60000, url: `${base}/files/p2.mp3` })] }];
  return [200, { results: Array.from({ length: 20 }, (_, i) => ov(base, { id: "s" + i, title: "Click " + i, license: "cc0", license_version: "1.0", creator: null, duration: 2000, url: `${base}/files/s${i}.mp3` })) }];
}, async (m) => {
  const out = dir("paging");
  const r = await run(["--type", "music", "--query", "piano", "--licence", "cc0", "--out", out], env(m));
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(titles(out), ["Page Two Track"]);
  assert.equal((await run(["--type", "music", "--query", "x", "--min-duration", "abc", "--out", dir("u1")], env(m))).code, 2);
  assert.equal((await run(["--type", "music", "--query", "x", "--min-duration", "30", "--max-duration", "10", "--out", dir("u2")], env(m))).code, 2);
}));

await test("19. the implicit music --min-duration never rejects a smaller --max-duration; an explicit clash is still a usage error", async () => withMock((u, _n, base) => [200, { results: [
  ov(base, { id: "j1", title: "Short Jingle", license: "cc0", license_version: "1.0", creator: null, duration: 5000, url: `${base}/files/j1.mp3` }),
  ov(base, { id: "j2", title: "Long Bed", license: "cc0", license_version: "1.0", creator: null, duration: 60000, url: `${base}/files/j2.mp3` })] }], async (m) => {
  const out = dir("implicit");
  const r = await run(["--type", "music", "--query", "jingle", "--licence", "cc0", "--max-duration", "10", "--out", out], env(m));
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(titles(out), ["Short Jingle"]);
  const out2 = dir("implicit2");
  const r2 = await run(["--type", "music", "--query", "jingle", "--licence", "cc0", "--max-duration", "90", "--out", out2], env(m));
  assert.equal(r2.code, 0, r2.out);
  assert.deepEqual(titles(out2), ["Long Bed"]);
  const r3 = await run(["--type", "music", "--query", "jingle", "--min-duration", "30", "--max-duration", "10", "--out", dir("implicit3")], env(m));
  assert.equal(r3.code, 2); assert.match(r3.out, /--min-duration is longer than --max-duration/);
}));

// ── 3D models (--type model): Poly Haven (CC0), Smithsonian Open Access 3D (CC0 items only) ───────────────────────────────
// Two triangles, materials "Body" and "Trim"; one triangle per primitive; 1 unit tall.
function glb() {
  const pos = new Float32Array([0,0,0, 1,0,0, 0,1,0,  0,0,1, 1,0,1, 0,1,1]), idx = new Uint16Array([0,1,2, 0,0,0]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer, 0, 6), Buffer.alloc(2)]);
  const acc = (o, c, min, max) => ({ bufferView: 0, byteOffset: o, componentType: 5126, count: c, type: "VEC3", min, max });
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0, name: "body" }, { mesh: 1, name: "trim" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 2, material: 0 }] },
             { primitives: [{ attributes: { POSITION: 1 }, indices: 2, material: 1 }] }],
    materials: [{ name: "Body", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }, { name: "Trim" }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    accessors: [acc(0, 3, [0,0,0], [1,1,0]), acc(36, 3, [0,0,1], [1,1,1]),
                { bufferView: 0, byteOffset: 72, componentType: 5123, count: 3, type: "SCALAR" }] };
  let j = Buffer.from(JSON.stringify(json)); j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.write("glTF", 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + bin.length, 8);
  const ch = (b, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.write(t, 4); return Buffer.concat([h, b]); };
  return Buffer.concat([head, ch(j, "JSON"), ch(bin, "BIN\0")]);
}
const GLTF_JSON = JSON.stringify({ asset: { version: "2.0" }, meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [{ componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }, { componentType: 5123, count: 3, type: "SCALAR" }] });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const ffmpegOk = await new Promise((ok) => execFile("ffmpeg", ["-version"], (e) => ok(!e)));
// Poly Haven: /ph/assets, /ph/files/<id>, /ph/license; the model files /m/*; Smithsonian 3D: /si3d/..., Open Access: /sioa/search.
const modelRoutes = (o = {}) => (u, _n, base) => {
  const p = u.pathname;
  if (p === "/ph/license") return [200, o.license ?? "<html><body>All assets are CC0 (public domain)</body></html>", { "content-type": "text/html" }];
  if (p === "/ph/assets") return [200, {
    coffee_table: { name: "Coffee Table", tags: ["table", "wood"], categories: ["furniture"], authors: { "Jane Doe": "All" }, polycount: 1000, dimensions: [1540, 973, 523], thumbnail_url: `${base}/thumbs/t1.png` },
    rubber_duck: { name: "Rubber Duck", tags: ["toy"], categories: ["props"], authors: { Joe: "All" }, polycount: 500, dimensions: [100, 100, 100], thumbnail_url: `${base}/thumbs/t2.png` } }];
  if (p === "/ph/files/coffee_table") return [200, { gltf: { "1k": { gltf: { url: `${base}/m/a.gltf`, include: { [o.rel ?? "textures/a_diff_1k.jpg"]: { url: `${base}/files/a_diff.jpg` } } } } } }];
  if (p === "/m/a.gltf") return [200, Buffer.from(GLTF_JSON), { "content-type": "model/gltf+json" }];
  if (p === "/m/b.glb") return [200, glb(), { "content-type": "model/gltf-binary" }];
  if (p.startsWith("/thumbs/")) return [200, PNG, { "content-type": "image/png" }];
  if (p === "/si3d/content/file/search") {
    const row = (title, file, quality, url, drc = false) => ({ title, content: { uri: `${base}${url}`, quality, file_type: "glb", draco_compressed: drc, model_url: `https://3d.si.edu/object/3d/${file}` } });
    if (o.si3dRows) return [200, { rows: o.si3dRows(row) }];
    return [200, { rows: [
      row("Steam Engine Model", "steam-engine", "High", "/m/b-high.glb", true), row("Steam Engine Model", "steam-engine", "Medium", "/m/b.glb", true), row("Steam Engine Model", "steam-engine", "Thumb", "/m/b-thumb.glb"),
      row("Steam Pump", "steam-pump", "Medium", "/m/b.glb"), row("Steam Gauge", "steam-gauge", "Medium", "/m/b.glb")] }];
  }
  if (p === "/sioa/search") {
    if (o.oa500) return [500, {}];
    const q = (u.searchParams.get("q") ?? "").replace(/"/g, "");
    const oa = (title, access, rec = "steam-engine:nmah_1") => ({ title, content: { descriptiveNonRepeating: { title: { content: title }, metadata_usage: { access }, record_link: `https://www.si.edu/object/${rec}`, online_media: { media: [{ thumbnail: `${base}/thumbs/t1.png` }] } }, freetext: { dataSource: [{ label: "Data Source", content: "National Museum of American History" }] } } });
    // the real API states its full match count (rowCount); a route gives "rowCount" to override it (undefined = the field is left out)
    const answer = (rows) => [200, { response: { rows, rowCount: "rowCount" in o ? o.rowCount : rows.length } }];
    if (o.oaRows) return answer(o.oaRows(oa, q));
    return answer(q === "Steam Engine Model" ? [oa("Steam Engine Model", "CC0")] : q === "Steam Pump" ? [oa("Steam Pump", "Usage conditions apply")] : q === "Steam Gauge" ? [oa("Steam Gauge Large", "CC0")] : []);
  }
  return [404, {}];
};
const menv = (m) => ({ ...env(m), POLYHAVEN_API: `${m.base}/ph`, POLYHAVEN_LICENSE_URL: `${m.base}/ph/license`, SI_3D_API: `${m.base}/si3d`, SI_OA_API: `${m.base}/sioa` });
const readRes = (d) => JSON.parse(fs.readFileSync(path.join(d, "results.json"), "utf8"));

await test("20. --type model, Poly Haven: the licence is read from its page; line shows CC0, author, triangles, stated size; the gltf's texture is downloaded; contact sheet", async () => withMock(modelRoutes(), async (m) => {
  const out = dir("ph");
  const r = await run(["--type", "model", "--query", "coffee table", "--source", "polyhaven", "--out", out], menv(m));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /01-coffee-table\.gltf · Coffee Table · CC0 · Jane Doe · /);
  assert.match(r.out, /1 tris/); assert.match(r.out, /size 1\.54×0\.523×0\.973 m \(stated\)/);
  assert.doesNotMatch(r.out, /Rubber Duck/);
  const res = readRes(out);
  assert.equal(res.length, 1); assert.equal(res[0].kind, "model"); assert.deepEqual(res[0].includes, ["textures/a_diff_1k.jpg"]);
  assert.deepEqual(res[0].size, { w: 1.54, d: 0.973, h: 0.523 });
  assert.ok(fs.existsSync(path.join(out, "textures", "a_diff_1k.jpg")));
  assert.ok(m.seen.some((s) => /\/ph\/license/.test(s)), "licence page not read");
  if (ffmpegOk) { assert.ok(fs.existsSync(path.join(out, "contact.jpg")), r.out); assert.match(r.out, /contact sheet: .*contact\.jpg/); }
}));

await test("21. --type model, Smithsonian: only an item whose Open Access record says CC0 is listed (Draco noted); a 'Usage conditions' item and one with no exact record are dropped and counted; the Medium file is the one fetched", async () => withMock(modelRoutes(), async (m) => {
  const out = dir("si");
  const r = await run(["--type", "model", "--query", "steam", "--source", "smithsonian", "--out", out], menv(m));
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(titles(out), ["Steam Engine Model"]);
  assert.match(r.out, /Steam Engine Model · CC0 · National Museum of American History · .* · 2 tris · size unchecked \(no stated size\)/);
  assert.match(r.out, /Draco/); assert.match(r.out, /2 Smithsonian item\(s\) dropped: licence not CC0 or not readable/);
  assert.doesNotMatch(r.out, /Steam Pump|Steam Gauge/);
  assert.ok(m.seen.every((s) => !/b-high|b-thumb/.test(s)), m.seen.join(" "));
  const res = readRes(out);
  assert.equal(res[0].file, "01-steam-engine-model.glb"); assert.equal(res[0].landing, "https://www.si.edu/object/steam-engine:nmah_1");
  assert.deepEqual(res[0].includes, []);
}));

await test("21b. Smithsonian: the licence is joined to a scan only through ONE record of that title; two records (or two scans) with one title, or a result window too short to prove it, drop the item and never list the other object's CC0 record", async () => {
  const bowl = (row) => [row("Bowl", "scanned-bowl", "Medium", "/m/b.glb")];
  const run1 = async (routes, label) => withMock(routes, async (m) => {
    const out = dir("si-" + label);
    return { out, r: await run(["--type", "model", "--query", "bowl", "--source", "smithsonian", "--out", out], menv(m)) };
  });
  // two Open Access rows titled "Bowl": a CC0 one of ANOTHER object first, the scan's own record (usage conditions) second
  let x = await run1(modelRoutes({ si3dRows: bowl, oaRows: (oa) => [oa("Bowl", "CC0", "OTHER-bowl"), oa("Bowl", "Usage conditions apply", "SCANNED-bowl")] }), "dup");
  assert.equal(x.r.code, 1, x.r.out); assert.doesNotMatch(x.r.out, /OTHER-bowl|01-bowl|· CC0 ·/);
  assert.match(x.r.out, /1 Smithsonian item\(s\) dropped: .*share a title/); assert.ok(!fs.existsSync(path.join(x.out, "results.json")));
  // the same two records the other way round must drop it as well (order never decides a licence)
  x = await run1(modelRoutes({ si3dRows: bowl, oaRows: (oa) => [oa("Bowl", "Usage conditions apply", "SCANNED-bowl"), oa("Bowl", "CC0", "OTHER-bowl")] }), "dup2");
  assert.equal(x.r.code, 1, x.r.out); assert.doesNotMatch(x.r.out, /OTHER-bowl|· CC0 ·/);
  // two scans with one title against ONE CC0 record: neither is proven to be that record's object
  x = await run1(modelRoutes({ si3dRows: (row) => [row("Bowl", "bowl-a", "Medium", "/m/b.glb"), row("Bowl", "bowl-b", "Medium", "/m/b.glb")], oaRows: (oa) => [oa("Bowl", "CC0", "bowl-rec")] }), "twoscans");
  assert.equal(x.r.code, 1, x.r.out); assert.doesNotMatch(x.r.out, /· CC0 ·/);
  // a result window shorter than the match count cannot prove the title is unique
  x = await run1(modelRoutes({ si3dRows: bowl, rowCount: 400, oaRows: (oa) => [oa("Bowl", "CC0", "SCANNED-bowl")] }), "window");
  assert.equal(x.r.code, 1, x.r.out); assert.doesNotMatch(x.r.out, /· CC0 ·/);
  // legitimate: one exact-title record among other, longer titles (a phrase match) is the item's record and is listed with its own link
  x = await run1(modelRoutes({ si3dRows: bowl, rowCount: 2, oaRows: (oa) => [oa("Bowl, Sugar", "CC0", "sugar-bowl"), oa("Bowl", "CC0", "SCANNED-bowl")] }), "ok");
  assert.equal(x.r.code, 0, x.r.out);
  assert.match(x.r.out, /01-bowl\.glb · Bowl · CC0 · .* · https:\/\/www\.si\.edu\/object\/SCANNED-bowl/); assert.doesNotMatch(x.r.out, /sugar-bowl|dropped/);
  // a FULL window (the 100 rows asked for) with no stated count: the scan's own record could be row 101, so the CC0 row of
  // another object at row 0 proves nothing - unknown completeness is a WARN + rerun, never a listed CC0
  const full = (oa) => [oa("Bowl", "CC0", "OTHER-bowl"), ...Array.from({ length: 99 }, (_, i) => oa(`Bowl, ${i + 1}`, "CC0", `bowl-${i + 1}`))];
  x = await run1(modelRoutes({ si3dRows: bowl, rowCount: undefined, oaRows: full }), "nocount");
  assert.equal(x.r.code, 3, x.r.out); assert.doesNotMatch(x.r.out, /OTHER-bowl|01-bowl|· CC0 ·|nothing matched/);
  assert.match(x.r.out, /WARN: Smithsonian Open Access stated no full result count .*rerun/i); assert.ok(!fs.existsSync(path.join(x.out, "results.json")));
  // legitimate on the other side: the same full window with its count stated (100 = all of it) proves the one "Bowl" row unique
  x = await run1(modelRoutes({ si3dRows: bowl, rowCount: 100, oaRows: full }), "fullcount");
  assert.equal(x.r.code, 0, x.r.out); assert.match(x.r.out, /01-bowl\.glb · Bowl · CC0 · .* · https:\/\/www\.si\.edu\/object\/OTHER-bowl/);
});

await test("21c. Smithsonian, the class: a licence joins by title only through ONE check, and only a whole-number count equal to the rows sent proves the window - a missing, text, fractional, negative or too-small count never lists a CC0", async () => {
  const bowl = (row) => [row("Bowl", "scanned-bowl", "Medium", "/m/b.glb")];
  const one = (oa) => [oa("Bowl", "CC0", "OTHER-bowl")];
  for (const [label, rowCount] of [["missing", undefined], ["null", null], ["text", "1"], ["frac", 1.5], ["neg", -1], ["zero", 0], ["nan", "NaN"], ["obj", { n: 1 }]]) {
    await withMock(modelRoutes({ si3dRows: bowl, rowCount, oaRows: one }), async (m) => {
      const out = dir("si-cls-" + label);
      const r = await run(["--type", "model", "--query", "bowl", "--source", "smithsonian", "--out", out], menv(m));
      assert.equal(r.code, 3, `${label}: ${r.out}`); assert.doesNotMatch(r.out, /OTHER-bowl|· CC0 ·|nothing matched/, label);
      assert.match(r.out, /WARN: Smithsonian Open Access stated no full result count/, label);
    });
  }
  // legitimate: the count stated as the number of rows sent lists the one record, with its own link
  await withMock(modelRoutes({ si3dRows: bowl, rowCount: 1, oaRows: one }), async (m) => {
    const out = dir("si-cls-ok");
    const r = await run(["--type", "model", "--query", "bowl", "--source", "smithsonian", "--out", out], menv(m));
    assert.equal(r.code, 0, r.out); assert.match(r.out, /01-bowl\.glb · Bowl · CC0 · .* · https:\/\/www\.si\.edu\/object\/OTHER-bowl/);
  });
  // the one choke point: the licence join is written once, and every Smithsonian listing passes through it
  const src = fs.readFileSync(find, "utf8");
  assert.equal((src.match(/function joinOneToOne\(/g) ?? []).length, 1, "joinOneToOne must be defined once");
  assert.equal((src.match(/rowCount/g) ?? []).length, 1, "rowCount must be read in one place only (inside joinOneToOne)");
  assert.doesNotMatch(src, /rows\.find\(/, "a licence row is never picked by find(): first match wins");
});

await test("22. a licence that cannot be read is a WARN + rerun (exit 3), never 'nothing matched' and never a guessed CC0", async () => {
  await withMock(modelRoutes({ license: "<html>Licences vary</html>" }), async (m) => {
    const out = dir("ph-nolic");
    const r = await run(["--type", "model", "--query", "coffee table", "--source", "polyhaven", "--out", out], menv(m));
    assert.equal(r.code, 3, r.out); assert.match(r.out, /WARN: polyhaven did not answer .*rerun/); assert.doesNotMatch(r.out, /nothing matched/);
    assert.ok(!fs.existsSync(path.join(out, "results.json")));
  });
  await withMock(modelRoutes({ oa500: true }), async (m) => {
    const out = dir("si-500");
    const r = await run(["--type", "model", "--query", "steam", "--source", "smithsonian", "--out", out], menv(m));
    assert.equal(r.code, 3, r.out); assert.match(r.out, /WARN: smithsonian did not answer .*rerun/); assert.doesNotMatch(r.out, /nothing matched|CC0/);
    assert.ok(!fs.existsSync(path.join(out, "results.json")));
  });
});

await test("23. an included file with an unsafe path (.., absolute, backslash) skips that model with a WARN and writes nothing outside --out", async () => {
  for (const rel of ["../evil.jpg", "/abs-evil.jpg", "a\\b.jpg", "textures/../../evil.jpg"]) {
    await withMock(modelRoutes({ rel }), async (m) => {
      const out = dir("unsafe");
      const r = await run(["--type", "model", "--query", "coffee table", "--source", "polyhaven", "--out", out], menv(m));
      assert.equal(r.code, 3, `${rel}: ${r.out}`); assert.match(r.out, /WARN: "Coffee Table": an included file has an unsafe path/);
      assert.ok(!fs.existsSync(path.join(out, "..", "evil.jpg")), rel); assert.ok(!fs.existsSync("/abs-evil.jpg"));
      assert.deepEqual(fs.readdirSync(out), [], `${rel}: ${fs.readdirSync(out)}`);
    });
  }
});

await test("24. --take of a model: a .gltf brings its textures, one ASSETS.json row each, check_assets passes; the kit.model hint carries the stated size; no size says to declare real; a missing texture is exit 2 with no row", async () => withMock(modelRoutes(), async (m) => {
  const out = dir("take-ph"), proj = dir("proj");
  assert.equal((await run(["--type", "model", "--query", "coffee table", "--source", "polyhaven", "--out", out], menv(m))).code, 0);
  const t = await run(["--take", path.join(out, "01-coffee-table.gltf"), "--as", "assets/models/a.gltf", "--project", proj]);
  assert.equal(t.code, 0, t.out);
  const rows = JSON.parse(fs.readFileSync(path.join(proj, "ASSETS.json"), "utf8"));
  assert.deepEqual(rows.map((x) => x.file).sort(), ["assets/models/a.gltf", "assets/models/textures/a_diff_1k.jpg"]);
  for (const x of rows) { assert.equal(x.licence, "CC0"); assert.equal(x.source, "https://polyhaven.com/a/coffee_table"); }
  assert.ok(fs.existsSync(path.join(proj, "assets/models/textures/a_diff_1k.jpg")));
  assert.match(t.out, /kit\.model\("assets\/models\/a\.gltf", \{ palette, kinds, real: \{ h: 0\.523, w: 1\.54, d: 0\.973 \} \}\)/);
  const c = await runCheck(proj); assert.equal(c.code, 0, c.out);
  // Smithsonian: no stated size
  const out2 = dir("take-si"), proj2 = dir("proj2");
  assert.equal((await run(["--type", "model", "--query", "steam", "--source", "smithsonian", "--out", out2], menv(m))).code, 0);
  const t2 = await run(["--take", path.join(out2, "01-steam-engine-model.glb"), "--as", "assets/models/engine.glb", "--project", proj2]);
  assert.equal(t2.code, 0, t2.out); assert.match(t2.out, /kit\.model\("assets\/models\/engine\.glb", \{ palette, kinds \}\)/); assert.match(t2.out, /no stated size/);
  assert.equal((await runCheck(proj2)).code, 0);
  // a texture deleted from the review folder: refuse before any copy
  fs.rmSync(path.join(out, "textures", "a_diff_1k.jpg"));
  const proj3 = dir("proj3");
  const t3 = await run(["--take", path.join(out, "01-coffee-table.gltf"), "--as", "assets/models/a.gltf", "--project", proj3]);
  assert.equal(t3.code, 2, t3.out); assert.match(t3.out, /re-download/);
  assert.ok(!fs.existsSync(path.join(proj3, "ASSETS.json")) && !fs.existsSync(path.join(proj3, "assets/models/a.gltf")));
  // an included file that is not texture data, or that would replace a different file already there: refused, nothing written
  const rj = path.join(out, "results.json"), rows0 = JSON.parse(fs.readFileSync(rj, "utf8"));
  fs.writeFileSync(path.join(out, "textures", "a_diff_1k.jpg"), "tex");
  const t5dir = dir("proj5"); fs.mkdirSync(path.join(t5dir, "assets/models/textures"), { recursive: true });
  fs.writeFileSync(path.join(t5dir, "assets/models/textures/a_diff_1k.jpg"), "someone else's texture");
  const t5 = await run(["--take", path.join(out, "01-coffee-table.gltf"), "--as", "assets/models/a.gltf", "--project", t5dir]);
  assert.equal(t5.code, 2, t5.out); assert.match(t5.out, /would replace a different file/);
  assert.ok(!fs.existsSync(path.join(t5dir, "ASSETS.json")) && !fs.existsSync(path.join(t5dir, "assets/models/a.gltf")));
  fs.writeFileSync(path.join(out, "kit.js"), "export {}");
  for (const r of rows0) if (r.kind === "model") r.includes = [...r.includes, "kit.js"];
  fs.writeFileSync(rj, JSON.stringify(rows0));
  const t6 = await run(["--take", path.join(out, "01-coffee-table.gltf"), "--as", "assets/models/a.gltf", "--project", dir("proj6")]);
  assert.equal(t6.code, 2, t6.out); assert.match(t6.out, /not texture data/);
  assert.ok(!fs.existsSync(path.join(dir("proj6"), "assets")), "nothing copied");
  // the same file already there (a second take) still passes
  fs.writeFileSync(rj, JSON.stringify(rows0.map((r) => r.kind === "model" ? { ...r, includes: r.includes.filter((i) => i !== "kit.js") } : r)));
  const t7dir = dir("proj7"); fs.mkdirSync(path.join(t7dir, "assets/models/textures"), { recursive: true });
  fs.writeFileSync(path.join(t7dir, "assets/models/textures/a_diff_1k.jpg"), "tex");
  assert.equal((await run(["--take", path.join(out, "01-coffee-table.gltf"), "--as", "assets/models/a.gltf", "--project", t7dir])).code, 0);
  // a different extension than the file's is refused
  const t4 = await run(["--take", path.join(out2, "01-steam-engine-model.glb"), "--as", "assets/models/engine.gltf", "--project", dir("proj4")]);
  assert.equal(t4.code, 2, t4.out); assert.match(t4.out, /extension/);
}));

await test("25. usage: a model source is refused for other types and the other way round", async () => withMock(modelRoutes(), async (m) => {
  assert.equal((await run(["--type", "model", "--query", "x", "--source", "openverse", "--out", dir("u3")], menv(m))).code, 2);
  assert.equal((await run(["--type", "image", "--query", "x", "--source", "polyhaven", "--out", dir("u4")], menv(m))).code, 2);
  assert.equal((await run(["--type", "model", "--query", "x", "--source", "nope", "--out", dir("u5")], menv(m))).code, 2);
}));

// ── NASA 3D Resources (public domain by the repo README) and Kenney (CC0 by the pack page; zip read by entry name) ───────────
const crc32 = (b) => { let c, crc = 0xffffffff; for (let i = 0; i < b.length; i++) { c = (crc ^ b[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
// A stored (uncompressed) zip: [{ name, data }] -> Buffer.
function zip(entries) {
  const loc = [], cen = []; let off = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name), crc = crc32(data);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt32LE(crc, 14); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    loc.push(l, n, data); cen.push(c, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, e]);
}
const unzipOk = !spawnSync("unzip", ["-v"]).error;
const nasaRoutes = (o = {}) => (u) => {
  const p = decodeURIComponent(u.pathname);
  if (p === "/nasa/README.md") return [200, o.readme ?? "# NASA 3D Resources\nThese assets are free and without copyright.", { "content-type": "text/plain" }];
  if (p === "/nasa-tree") {
    const b = (x) => ({ path: x, type: "blob", size: 100 });
    return [200, { truncated: !!o.truncated, tree: [{ path: "3D Models", type: "tree" }, b("3D Models/Pump Station/pump.glb"), b("3D Models/Pump Station/pump.obj"), b("3D Models/Pump Station/pump.png"),
      b("3D Models/Rocket/rocket.stl"), b("3D Models/Saturn V/saturn.glb"), b("docs/pump.glb"), b("3D Models/../pump-evil/pump.glb")] }];
  }
  if (p === "/nasa/3D Models/Pump Station/pump.glb") return [200, glb(), { "content-type": "model/gltf-binary" }];
  if (p === "/nasa/3D Models/Pump Station/pump.png") return [200, PNG, { "content-type": "image/png" }];
  return [404, {}];
};
const nenv = (m) => ({ ...env(m), NASA_RAW: `${m.base}/nasa`, NASA_TREE_API: `${m.base}/nasa-tree` });

await test("26. --type model, NASA: the licence is the repo README's statement (PD, author NASA, the .glb and its folder thumbnail); other folders and files outside '3D Models/' are not hits; a README without the statement is a WARN + rerun, never a guessed licence; --take row passes check_assets; the endorsement note prints", async () => {
  await withMock(nasaRoutes(), async (m) => {
    const out = dir("nasa");
    const r = await run(["--type", "model", "--query", "pump", "--source", "nasa", "--out", out], nenv(m));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /01-pump-station\.glb · Pump Station · PD · NASA · .* · 2 tris · size unchecked/);
    assert.match(r.out, /NASA: no NASA logo or insignia may imply endorsement/);
    assert.doesNotMatch(r.out, /Saturn|Rocket|evil/);   // "3D Models/../pump-evil/..." starts with '3D Models/' and matches the query: only the unsafe-path filter drops it
    const res = readRes(out);
    assert.equal(res.length, 1); assert.equal(res[0].licence, "PD"); assert.equal(res[0].landing, "https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Pump%20Station");
    if (ffmpegOk) assert.ok(fs.existsSync(path.join(out, "contact.jpg")), r.out);
    const proj = dir("proj-nasa");
    const t = await run(["--take", path.join(out, "01-pump-station.glb"), "--as", "assets/models/pump.glb", "--project", proj]);
    assert.equal(t.code, 0, t.out);
    const rows = JSON.parse(fs.readFileSync(path.join(proj, "ASSETS.json"), "utf8"));
    assert.equal(rows.length, 1); assert.equal(rows[0].licence, "PD"); assert.equal(rows[0].author, "NASA");
    assert.equal((await runCheck(proj)).code, 0);
  });
  await withMock(nasaRoutes({ readme: "# NASA 3D Resources\nSee the licence file." }), async (m) => {
    const out = dir("nasa-nolic");
    const r = await run(["--type", "model", "--query", "pump", "--source", "nasa", "--out", out], nenv(m));
    assert.equal(r.code, 3, r.out); assert.match(r.out, /WARN: nasa did not answer .*rerun/); assert.doesNotMatch(r.out, /nothing matched|NASA: no NASA logo/);
    assert.ok(!fs.existsSync(path.join(out, "results.json")));
  });
  await withMock(nasaRoutes({ truncated: true }), async (m) => {
    const r = await run(["--type", "model", "--query", "pump", "--source", "nasa", "--out", dir("nasa-trunc")], nenv(m));
    assert.equal(r.code, 0, r.out); assert.match(r.out, /WARN: NASA list truncated/);
  });
  await withMock(() => [403, {}], async (m) => {
    const r = await run(["--type", "model", "--query", "pump", "--source", "nasa", "--out", dir("nasa-403")], nenv(m));
    assert.equal(r.code, 3, r.out); assert.doesNotMatch(r.out, /nothing matched/);
  });
});

const kenneyRoutes = (o = {}) => (u, _n, base) => {
  const p = u.pathname;
  const asset = (slug, title) => `<div class='asset'><a href='${base}/k/assets/${slug}'><div class='cover'></div></a><h2><a href='${base}/k/assets/${slug}'>${title}</a></h2></div>`;
  if (p === "/k/assets/category:3D") return [200, o.listing ?? `<html><a href='${base}/k/assets/category:3D/page:2'>2</a>${asset("pump-kit", "Pump Kit")}${asset("tree-kit", "Tree Kit")}</html>`, { "content-type": "text/html" }];
  if (p === "/k/assets/category:3D/page:2") return [200, `<html>${asset("pump-parts", "Pump Parts")}</html>`, { "content-type": "text/html" }];
  if (p === "/k/assets/pump-kit") return [200, `<html><meta property='og:image'\tcontent='${base}/thumbs/k.png' /><table><tr><td>License:</td><td><a href='https://creativecommons.org/publicdomain/zero/1.0/'>Creative Commons CC0</a></td></tr></table><a href='${base}/k/media/pages/assets/pump-kit/abc/kenney_pump-kit.zip'>Download</a></html>`, { "content-type": "text/html" }];
  if (p === "/k/assets/tree-kit") return [200, `<html>License: <a href='https://creativecommons.org/licenses/by-nc/4.0/'>CC BY-NC</a></html>`, { "content-type": "text/html" }];
  if (p === "/k/assets/pump-parts") return [200, `<html>License: <a href='https://creativecommons.org/licenses/by-nc/4.0/'>CC BY-NC</a><a href='${base}/k/media/pages/assets/pump-parts/abc/kenney_pump-parts.zip'>Download</a></html>`, { "content-type": "text/html" }];
  if (p === "/k/media/pages/assets/pump-kit/abc/kenney_pump-kit.zip") return [200, zip([{ name: "Models/GLB format/pump.glb", data: glb() }, { name: "Models/GLB format/valve.glb", data: glb() }, { name: "../evil.glb", data: glb() }, { name: "../pump-evil.glb", data: glb() }, { name: "License.txt", data: Buffer.from("CC0") }]), { "content-type": "application/zip" }];
  if (p === "/thumbs/k.png") return [200, PNG, { "content-type": "image/png" }];
  return [404, {}];
};
const kenv = (m) => ({ ...env(m), KENNEY_SITE: `${m.base}/k` });

await test("27. --type model, Kenney: a pack is a hit by name, its CC0 licence is read from the pack page (a pack without the CC0 link is counted, never downloaded or listed); the .glb entry is picked by name from the zip and read to stdout, an entry with '..' is never read; --take row passes check_assets", async () => {
  if (!unzipOk) { console.log("27. skipped: unzip is not on PATH"); return; }
  await withMock(kenneyRoutes(), async (m) => {
    const out = dir("kenney");
    const r = await run(["--type", "model", "--query", "pump", "--source", "kenney", "--out", out], kenv(m));
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(titles(out), ["Pump Kit: pump"]);
    assert.match(r.out, /01-pump-kit-pump\.glb · Pump Kit: pump · CC0 · Kenney \(kenney\.nl\) · .* · 2 tris · size unchecked/);
    assert.match(r.out, /1 Kenney pack\(s\) dropped: licence not CC0 or not readable/);
    assert.doesNotMatch(r.out, /valve|evil|Tree/);   // "../pump-evil.glb" matches the query by name: only the unsafe-path filter keeps it out
    assert.deepEqual(fs.readdirSync(out).filter((f) => !["thumbs", "contact.jpg"].includes(f)).sort(), ["01-pump-kit-pump.glb", "results.json"]);
    assert.ok(!fs.existsSync(path.join(out, "..", "evil.glb"))); assert.ok(!fs.existsSync(path.join(out, "..", "pump-evil.glb")));
    assert.ok(!m.seen.some((s) => /pump-parts\/abc/.test(s)), "the non-CC0 pack's zip was downloaded");
    const proj = dir("proj-kenney");
    const t = await run(["--take", path.join(out, "01-pump-kit-pump.glb"), "--as", "assets/models/pump.glb", "--project", proj]);
    assert.equal(t.code, 0, t.out);
    const rows = JSON.parse(fs.readFileSync(path.join(proj, "ASSETS.json"), "utf8"));
    assert.equal(rows[0].licence, "CC0"); assert.equal(rows[0].author, "Kenney (kenney.nl)"); assert.equal(rows[0].source, `${m.base}/k/assets/pump-kit`);
    assert.equal((await runCheck(proj)).code, 0);
  });
  // no entry name matches the query (the pack matched by its title): the first entries are read, and an unsafe one is never among them
  await withMock(kenneyRoutes(), async (m) => {
    const out = dir("kenney-first");
    const r = await run(["--type", "model", "--query", "kit", "--source", "kenney", "--out", out], kenv(m));
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(titles(out), ["Pump Kit: pump", "Pump Kit: valve"]);
    assert.doesNotMatch(r.out, /evil/); assert.ok(!fs.existsSync(path.join(out, "..", "evil.glb")));
  });
  // a listing that cannot be read, or that names no pack, is a WARN + rerun, never "nothing matched"
  await withMock(() => [500, "boom"], async (m) => {
    const r = await run(["--type", "model", "--query", "pump", "--source", "kenney", "--out", dir("kenney-500")], kenv(m));
    assert.equal(r.code, 3, r.out); assert.match(r.out, /WARN: kenney did not answer .*rerun/); assert.doesNotMatch(r.out, /nothing matched/);
  });
  await withMock(kenneyRoutes({ listing: "<html>no packs here</html>" }), async (m) => {
    const r = await run(["--type", "model", "--query", "pump", "--source", "kenney", "--out", dir("kenney-layout")], kenv(m));
    assert.equal(r.code, 3, r.out); assert.match(r.out, /WARN: kenney did not answer/);
  });
});

await test("28. --type model, Kenney, unzip not on PATH: said as a missing local tool (WARN, exit 3), never 'did not answer' or 'rerun'; the agent is told to ask the user before any install", async () => {
  const bare = dir("nopath");   // an empty PATH folder: node runs by its absolute path, unzip is nowhere
  await withMock(kenneyRoutes(), async (m) => {
    const out = dir("kenney-nounzip");
    const r = await run(["--type", "model", "--query", "pump", "--source", "kenney", "--out", out], { ...kenv(m), PATH: bare });
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /WARN: .*unzip.* not on PATH/i);
    assert.match(r.out, /rerunning will not help/i); assert.match(r.out, /ask the user before installing/i);
    assert.doesNotMatch(r.out, /did not answer|Rerun in a minute|nothing matched|, then rerun|— rerun\b/);
    assert.doesNotMatch(r.out, /install unzip/i);
    assert.ok(!fs.existsSync(path.join(out, "results.json")));
  });
  // a source that did not answer is still the rerun case beside it
  await withMock(() => [500, "boom"], async (m) => {
    const r = await run(["--type", "model", "--query", "pump", "--source", "kenney", "--out", dir("kenney-500b")], { ...kenv(m), PATH: bare });
    assert.equal(r.code, 3, r.out); assert.match(r.out, /WARN: kenney did not answer .*rerun/); assert.match(r.out, /Rerun in a minute/);
  });
});

await test("M1. --query \"a|b\" runs both searches at once, each into its own folder, one block per query", async () => withMock(audioRoutes, async (m) => {
  const out = dir("multi");
  const r = await run(["--type", "music", "--query", "calm|soft piano", "--out", out], env(m));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /── "calm" \(exit 0\)/); assert.match(r.out, /── "soft piano" \(exit 0\)/);
  for (const d of ["calm", "soft-piano"]) assert.ok(fs.existsSync(path.join(out, d, "results.json")), d);
}));

await test("M2. a source that never answers is cut at FIND_MEDIA_SOURCE_S: a WARN + rerun (exit 3), not a stalled search", async () => {
  const srv = http.createServer(() => {});   // accepts, never answers
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  try {
    const t0 = Date.now();
    const r = await run(["--type", "music", "--query", "calm", "--out", dir("hang")], { OPENVERSE_API: `http://127.0.0.1:${srv.address().port}/v1`, FIND_MEDIA_SOURCE_S: "1" });
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /no answer in 1 s.*rerun/);
    assert.ok(Date.now() - t0 < 10000, `took ${Date.now() - t0} ms`);
  } finally { srv.closeAllConnections(); srv.close(); }
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`find_media ok: ${count} cases`);
