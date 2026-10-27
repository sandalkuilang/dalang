#!/usr/bin/env node
// node tests/workspace.mjs — scripts/workspace.mjs against fixture user and project settings (HOME points at a temp
// folder, so the owner's real config is never read). Pins: without --yes nothing is written; with --yes only the
// project's .claude/settings.json is written (user files stay byte for byte), unknown keys survive, exactly the
// non-video plugins and MCP servers go off; undo restores the file byte for byte (or removes it when there was none);
// an unreadable settings file is an error, never "nothing enabled"; no server env value is ever printed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/workspace.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-workspace-"));
let n = 0, cases = 0;
const ok = (msg) => { cases++; console.log(`ok  ${msg}`); };
const w = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

// One fixture per case: a fake HOME with user settings, installed plugins and MCP servers, and an empty videos folder.
function fixture({ userSettings = JSON.stringify({ enabledPlugins: { "hyperframes@hf": true, "deploy-tools@cloud": true, "code-index@tools": true } }) } = {}) {
  const home = path.join(tmp, `h${n}`), dir = path.join(tmp, `v${n}`);
  n++;
  w(path.join(home, ".claude", "settings.json"), userSettings);
  w(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "media-use@hf": [{}], "deploy-tools@cloud": [{}] } }));
  w(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { graft: { env: { TOKEN: "s3cret-value" } }, "chrome-devtools": {} }, projects: {} }));
  w(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { notes: { headers: { Authorization: "Bearer s3cret-header" } } } }));
  const userFiles = [path.join(home, ".claude", "settings.json"), path.join(home, ".claude.json"), path.join(home, ".claude", "plugins", "installed_plugins.json")];
  return { home, dir, proj: path.join(dir, ".claude", "settings.json"), bak: path.join(dir, ".claude", "settings.json.bak"), local: path.join(dir, ".claude", "settings.local.json"), userFiles, userBytes: () => userFiles.map((f) => fs.readFileSync(f)) };
}
const ws = (f, ...args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, HOME: f.home, CLAUDE_CONFIG_DIR: "" } });
  return { code: r.status, out: r.stdout, err: r.stderr, all: r.stdout + r.stderr };
};
const tree = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).sort().join("\n") : "");
const denied = (p) => JSON.parse(fs.readFileSync(p, "utf8")).deniedMcpServers.map((x) => x.serverName).sort();

try {
  // 1. Without --yes: the proposal is printed, nothing is written, no secret is printed.
  {
    const f = fixture(), before = tree(f.dir), user = f.userBytes();
    const r = ws(f, "init", f.dir);
    assert.equal(r.code, 0, r.all);
    for (const name of ["deploy-tools@cloud", "code-index@tools", "graft", "notes"]) assert.match(r.out, new RegExp(name.replace(/[@-]/g, "\\$&")), `the proposal names ${name}`);
    assert.doesNotMatch(r.all, /s3cret/, "no MCP env or header value is ever printed");
    assert.equal(fs.existsSync(path.join(f.dir, ".claude")), false, "init without --yes creates no .claude folder");
    assert.equal(tree(f.dir), before, "the folder listing is unchanged");
    assert.deepEqual(f.userBytes(), user);
    assert.match(r.out, /Nothing written/);
    assert.match(r.out, /init .* --yes/, "the apply command is printed");
    ok("init without --yes writes nothing and prints no secret");
  }

  // 2. --yes with no project file: exactly the non-video items go off; the user files are untouched; undo removes the file.
  {
    const f = fixture(), user = f.userBytes();
    const r = ws(f, "init", f.dir, "--yes");
    assert.equal(r.code, 0, r.all);
    const cur = JSON.parse(fs.readFileSync(f.proj, "utf8"));
    assert.deepEqual(cur.enabledPlugins, { "deploy-tools@cloud": false, "code-index@tools": false }, "exactly the non-video plugins are off");
    assert.deepEqual(denied(f.proj), ["graft", "notes"], "exactly the non-video MCP servers are denied (the browser one stays)");
    assert.equal(fs.statSync(f.bak).size, 0, "an empty .bak means there was no file");
    assert.deepEqual(f.userBytes(), user, "user-level files are byte for byte the same");
    assert.doesNotMatch(r.all, /s3cret/);
    const u = ws(f, "undo", f.dir);
    assert.equal(u.code, 0, u.all);
    assert.equal(fs.existsSync(f.proj), false, "undo of a folder that had no settings.json leaves none");
    assert.equal(fs.existsSync(f.bak), false, "undo removes the .bak");
    assert.deepEqual(f.userBytes(), user, "user-level files are still the same after undo");
    ok("init --yes disables exactly the non-video items, only in the project file; undo removes it");
  }

  // 3. Unknown keys are kept; undo restores an odd-formatted original byte for byte; a second init keeps the first .bak.
  {
    const f = fixture();
    const original = Buffer.from('{\n\t"model": "x",\n\t"permissions": {"deny": ["Read(./.env)"]},\n\t"enabledPlugins": {"keep@m": true}\n}');
    w(f.proj, original);
    const r = ws(f, "init", f.dir, "--yes");
    assert.equal(r.code, 0, r.all);
    const cur = JSON.parse(fs.readFileSync(f.proj, "utf8"));
    assert.equal(cur.model, "x");
    assert.deepEqual(cur.permissions, { deny: ["Read(./.env)"] });
    assert.equal(cur.enabledPlugins["keep@m"], true, "a plugin not proposed off is left alone");
    assert.equal(cur.enabledPlugins["deploy-tools@cloud"], false);
    assert.ok(fs.readFileSync(f.bak).equals(original), "the .bak holds the original bytes");
    const again = ws(f, "init", f.dir, "--yes");
    assert.equal(again.code, 0, again.all);
    assert.ok(fs.readFileSync(f.bak).equals(original), "a second init does not overwrite the first .bak");
    assert.deepEqual(denied(f.proj), ["graft", "notes"], "a second init adds no duplicate entry");
    const u = ws(f, "undo", f.dir);
    assert.equal(u.code, 0, u.all);
    assert.ok(fs.readFileSync(f.proj).equals(original), "undo restores byte for byte");
    assert.equal(fs.existsSync(f.bak), false);
    ok("unknown keys kept, first .bak kept, undo byte for byte");
  }

  // 4. --keep keeps an MCP server (and a plugin) on.
  {
    const f = fixture();
    const r = ws(f, "init", f.dir, "--yes", "--keep", "notes,code-index@tools");
    assert.equal(r.code, 0, r.all);
    assert.deepEqual(denied(f.proj), ["graft"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.proj, "utf8")).enabledPlugins, { "deploy-tools@cloud": false });
    ok("--keep keeps named items on");
  }

  // 5. status --json: not lean before, lean after init.
  {
    const f = fixture();
    const before = JSON.parse(ws(f, "status", f.dir, "--json").out);
    assert.equal(before.lean, false);
    assert.ok(before.items.some((i) => i.name === "media-use@hf" && i.video && i.on), "a video plugin is listed on and kept");
    assert.ok(before.items.some((i) => i.name === "chrome-devtools" && i.video), "the browser server is kept");
    assert.equal(ws(f, "init", f.dir, "--yes").code, 0);
    const after = JSON.parse(ws(f, "status", f.dir, "--json").out);
    assert.equal(after.lean, true);
    const text = ws(f, "status", f.dir);
    assert.equal(text.code, 0);
    assert.match(text.out, /Lean: yes/);
    ok("status reports lean before and after init");
  }

  // 6. Unreadable is not "none": a user settings file that is not JSON.
  {
    const f = fixture({ userSettings: "{" });
    const s = ws(f, "status", f.dir, "--json");
    assert.equal(s.code, 1);
    assert.ok(JSON.parse(s.out).error, "status --json carries an error");
    const t = ws(f, "status", f.dir);
    assert.equal(t.code, 1);
    assert.match(t.all, /could not read.*rerun/);
    const i = ws(f, "init", f.dir, "--yes");
    assert.equal(i.code, 1, i.all);
    assert.equal(fs.existsSync(path.join(f.dir, ".claude")), false, "nothing is written");
    ok("an unreadable user settings file is an error, init writes nothing");
  }

  // 7. A project settings file that is not JSON (or not an object): init refuses, file unchanged, no .bak.
  for (const bad of ["{ nope", "[1,2]"]) {
    const f = fixture();
    w(f.proj, bad);
    const r = ws(f, "init", f.dir, "--yes");
    assert.equal(r.code, 1, r.all);
    assert.equal(fs.readFileSync(f.proj, "utf8"), bad, "the file is unchanged");
    assert.equal(fs.existsSync(f.bak), false, "no .bak");
  }
  ok("an unreadable project settings file is refused, nothing written");

  // 8. settings.local.json that turns a plugin back on wins: init says so and never edits that file.
  {
    const f = fixture(), localText = '{"enabledPlugins":{"code-index@tools":true}}';
    w(f.local, localText);
    const r = ws(f, "init", f.dir, "--yes");
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /still on: .*code-index@tools/);
    assert.equal(fs.readFileSync(f.local, "utf8"), localText, "the local file is not touched");
    ok("a settings.local.json override is reported, never edited");
  }

  // 9. undo with no .bak.
  {
    const f = fixture();
    const r = ws(f, "undo", f.dir);
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /nothing to undo/);
    ok("undo with no backup says so");
  }

  // 10. Usage errors exit 2.
  {
    const f = fixture();
    assert.equal(ws(f).code, 2);
    assert.equal(ws(f, "frobnicate").code, 2);
    ok("no or unknown subcommand exits 2");
  }

  console.log(`workspace ok: ${cases} cases`);
} catch (e) {
  console.error(e.stack || e.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
