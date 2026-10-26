#!/usr/bin/env node
// node tests/find-media.mjs — scripts/find_media.mjs against a mock Openverse / Wikimedia Commons (no real network).
// Music, SFX and image searches print licensed results and download their previews; an NC or ND result, and a CC BY
// result with no creator to credit, are dropped; --take copies one into the project and appends an ASSETS.json row that
// passes check_assets.mjs; a 429 is retried after its Retry-After; a source that fails is a WARN + "rerun" (exit 3),
// never "nothing matched"; the bundled /media-use SFX library takes its licence from its own CREDITS.md.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
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
    res.end(typeof body === "string" ? body : JSON.stringify(body));
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
    ov(base, { id: "long", title: "Long One", license: "cc0", license_version: "1.0", creator: null, duration: 5000, url: `${base}/files/long.mp3` }),
    ov(base, { id: "short", title: "Short One", license: "cc0", license_version: "1.0", creator: null, duration: 1500, url: `${base}/files/short.mp3` }),
  ] }];
  return [404, {}];
};

await test("1. music: licensed results with previews and results.json; NC and a CC BY without creator are dropped", async () => withMock(audioRoutes, async (m) => {
  const out = dir("music");
  const r = await run(["--type", "music", "--query", "calm morning", "--out", out], env(m));
  assert.equal(r.code, 0, r.out);
  assert.ok(m.seen.some((s) => /category=music/.test(s)), m.seen.join(" "));
  assert.ok(m.seen.some((s) => /license=cc0/.test(decodeURIComponent(s))), "licence filter not sent");
  assert.match(r.out, /Calm Morning/); assert.match(r.out, /CC-BY-4\.0/); assert.match(r.out, /Ann/);
  assert.doesNotMatch(r.out, /Paid Work|Nobody/);
  assert.match(r.out, /--take/);
  const res = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  assert.deepEqual(res.map((x) => x.title).sort(), ["Calm Morning", "Long One", "Short One"]);
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

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`find_media ok: ${count} cases`);
