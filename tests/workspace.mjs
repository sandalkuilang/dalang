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
function fixture({ userSettings = JSON.stringify({ enabledPlugins: { "hyperframes@hf": true, "deploy-tools@cloud": true, "code-index@tools": true } }), git = false } = {}) {
  // git: the videos folder is <repo>/videos inside a git repository (a .git folder at <repo>).
  const home = path.join(tmp, `h${n}`), root = path.join(tmp, `v${n}`), dir = git ? path.join(root, "videos") : root;
  n++;
  if (git) fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  w(path.join(home, ".claude", "settings.json"), userSettings);
  w(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "media-use@hf": [{}], "deploy-tools@cloud": [{}] } }));
  w(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { graft: { env: { TOKEN: "s3cret-value" } }, "chrome-devtools": {} }, projects: {} }));
  w(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { notes: { headers: { Authorization: "Bearer s3cret-header" } } } }));
  const userFiles = [path.join(home, ".claude", "settings.json"), path.join(home, ".claude.json"), path.join(home, ".claude", "plugins", "installed_plugins.json")];
  return { home, dir, root, rootLocal: path.join(root, ".claude", "settings.local.json"), proj: path.join(dir, ".claude", "settings.json"), bak: path.join(dir, ".claude", "settings.json.bak"), local: path.join(dir, ".claude", "settings.local.json"), userFiles, userBytes: () => userFiles.map((f) => fs.readFileSync(f)) };
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
    const original = Buffer.from('{\n\t"model": "x",\n\t"permissions": {"deny": ["Read(./.env)"]},\n\t"enabledPlugins": {"browser-use@m": true}\n}');
    w(f.proj, original);
    const r = ws(f, "init", f.dir, "--yes");
    assert.equal(r.code, 0, r.all);
    const cur = JSON.parse(fs.readFileSync(f.proj, "utf8"));
    assert.equal(cur.model, "x");
    assert.deepEqual(cur.permissions, { deny: ["Read(./.env)"] });
    assert.equal(cur.enabledPlugins["browser-use@m"], true, "a plugin not proposed off is left alone");
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

  // 11. A session started in a subdirectory of a git repository also reads settings.local.json at the repository root
  //     (Claude Code v2.1.211+; the root's value wins). A plugin that file turns on is on, never read as off.
  {
    const f = fixture({ git: true }), rootText = '{"enabledPlugins":{"deploy-tools@cloud":true}}';
    w(f.rootLocal, rootText);
    const before = JSON.parse(ws(f, "status", f.dir, "--json").out);
    assert.ok(before.items.find((i) => i.name === "deploy-tools@cloud").on);
    const r = ws(f, "init", f.dir, "--yes");
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /still on: .*deploy-tools@cloud/, "init names a plugin the root local file keeps on");
    assert.match(r.out, /settings\.local\.json/, "and names the file kind");
    const s = JSON.parse(ws(f, "status", f.dir, "--json").out);
    assert.equal(s.lean, false, "status is not lean while the root local file keeps a plugin on");
    assert.match(ws(f, "status", f.dir).out, /Lean: no/);
    assert.equal(fs.readFileSync(f.rootLocal, "utf8"), rootText, "the root local file is never edited");
    // The root's value wins over the starting directory's own local file.
    w(path.join(f.dir, ".claude", "settings.local.json"), '{"enabledPlugins":{"deploy-tools@cloud":false}}');
    assert.equal(JSON.parse(ws(f, "status", f.dir, "--json").out).lean, false, "the root local value wins over the subfolder's");
    // The other side: a root local file that switches nothing on leaves the folder lean; no repository = no root read.
    const g = fixture({ git: true });
    w(g.rootLocal, '{"permissions":{"allow":["Bash(ls)"]},"enabledPlugins":{"deploy-tools@cloud":false}}');
    assert.equal(ws(g, "init", g.dir, "--yes").code, 0);
    assert.equal(JSON.parse(ws(g, "status", g.dir, "--json").out).lean, true, "a root local file with nothing turned on stays lean");
    const h = fixture();
    const parentLocal = path.join(tmp, ".claude", "settings.local.json"); // a parent folder that is not a repository root
    w(parentLocal, '{"enabledPlugins":{"deploy-tools@cloud":true}}');
    assert.equal(ws(h, "init", h.dir, "--yes").code, 0);
    assert.equal(JSON.parse(ws(h, "status", h.dir, "--json").out).lean, true, "outside a git repository only the folder's own file counts");
    fs.rmSync(path.dirname(parentLocal), { recursive: true });
    ok("a git root settings.local.json that turns a plugin on is seen (status, init), root wins, other cases stay lean");
  }

  // 12. The repository root is the user's home directory: the local file stays in the folder, the home one is not read.
  {
    const f = fixture({ git: true });
    fs.rmSync(f.root, { recursive: true, force: true });
    const dir = path.join(f.home, "videos");
    fs.mkdirSync(path.join(f.home, ".git"), { recursive: true });
    fs.mkdirSync(dir, { recursive: true });
    w(path.join(f.home, ".claude", "settings.local.json"), '{"enabledPlugins":{"deploy-tools@cloud":true}}');
    assert.equal(ws(f, "init", dir, "--yes").code, 0);
    assert.equal(JSON.parse(ws(f, "status", dir, "--json").out).lean, true, "a repository rooted at HOME is not read for its local file");
    ok("a repository root that is the home directory is not read");
  }

  // 13. Local-scope MCP servers in ~/.claude.json keyed by the repository root; a worktree resolves to the main checkout;
  //     a .git file that cannot be resolved is unknown (exit 1), never "no root".
  {
    const f = fixture({ git: true });
    const cj = JSON.parse(fs.readFileSync(path.join(f.home, ".claude.json"), "utf8"));
    cj.projects = { [f.root]: { mcpServers: { "root-only-tool": {} } } };
    w(path.join(f.home, ".claude.json"), JSON.stringify(cj));
    assert.ok(JSON.parse(ws(f, "status", f.dir, "--json").out).items.some((i) => i.kind === "mcp" && i.name === "root-only-tool" && i.on), "a server added at the repository root is listed");
    assert.equal(ws(f, "init", f.dir, "--yes").code, 0);
    assert.ok(denied(f.proj).includes("root-only-tool"));
    const wt = fixture(), main = path.join(tmp, `main${n}`);
    fs.mkdirSync(path.join(main, ".git", "worktrees", "wt1"), { recursive: true });
    w(path.join(wt.dir, ".git"), `gitdir: ${path.join(main, ".git", "worktrees", "wt1")}\n`);
    w(path.join(main, ".claude", "settings.local.json"), '{"enabledPlugins":{"deploy-tools@cloud":true}}');
    assert.equal(JSON.parse(ws(wt, "status", wt.dir, "--json").out).lean, false, "a worktree reads the main checkout's local file");
    const bad = fixture();
    w(path.join(bad.dir, ".git"), "garbage\n");
    const b = ws(bad, "status", bad.dir, "--json");
    assert.equal(b.code, 1, b.all);
    assert.ok(JSON.parse(b.out).error);
    ok("repository-root MCP servers, worktree to main checkout, unresolvable .git is an error");
  }

  // 14. A .bak that init did not write is never adopted: init refuses, undo refuses, nothing is changed or deleted.
  {
    const f = fixture(), settings = '{"model":"current","permissions":{"allow":["Bash(ls)"]}}', foreign = '{"model":"old-unrelated"}';
    w(f.proj, settings);
    w(f.bak, foreign);
    const user = f.userBytes();
    const r = ws(f, "init", f.dir, "--yes");
    assert.equal(r.code, 1, r.all);
    assert.match(r.all, /settings\.json\.bak/);
    assert.equal(fs.readFileSync(f.proj, "utf8"), settings, "the settings file is unchanged");
    assert.equal(fs.readFileSync(f.bak, "utf8"), foreign, "the foreign .bak is unchanged");
    const u = ws(f, "undo", f.dir);
    assert.equal(u.code, 1, u.all);
    assert.equal(fs.readFileSync(f.proj, "utf8"), settings, "undo does not copy a foreign .bak over the settings");
    assert.equal(fs.readFileSync(f.bak, "utf8"), foreign, "undo does not delete a foreign .bak");
    assert.deepEqual(f.userBytes(), user);
    // The foreign file is not a state init can use: moved away, init works and keeps its own backup.
    fs.renameSync(f.bak, path.join(f.dir, "mine.bak"));
    assert.equal(ws(f, "init", f.dir, "--yes").code, 0);
    assert.equal(fs.readFileSync(f.bak, "utf8"), settings, "init's own backup holds the state before init");
    assert.equal(ws(f, "undo", f.dir).code, 0);
    assert.equal(fs.readFileSync(f.proj, "utf8"), settings, "undo restores byte for byte");
    assert.equal(fs.existsSync(f.bak), false);
    // A .bak edited after init is no longer init's: undo refuses.
    assert.equal(ws(f, "init", f.dir, "--yes").code, 0);
    const initDone = fs.readFileSync(f.proj);
    fs.writeFileSync(f.bak, foreign);
    const t = ws(f, "undo", f.dir);
    assert.equal(t.code, 1, t.all);
    assert.ok(fs.readFileSync(f.proj).equals(initDone) && fs.readFileSync(f.bak, "utf8") === foreign, "nothing changed");
    // A foreign EMPTY .bak: undo must not remove a settings file it did not create.
    const e = fixture();
    w(e.proj, settings);
    w(e.bak, "");
    assert.equal(ws(e, "undo", e.dir).code, 1);
    assert.equal(fs.readFileSync(e.proj, "utf8"), settings, "an empty foreign .bak does not delete the settings file");
    ok("a foreign .bak is never adopted by init and never restored or deleted by undo; init's own flow still works");
  }

  // 15. measure: the first-call context from a session transcript or `claude -p --output-format json`; unknown is never 0.
  {
    const f = fixture();
    const usage = (a, b, c) => ({ input_tokens: a, cache_creation_input_tokens: b, cache_read_input_tokens: c, output_tokens: 5 });
    const jsonl = (name, rows) => { const p = path.join(tmp, name); fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); return p; };
    const big = jsonl("big.jsonl", [{ type: "user", message: {} }, { type: "assistant", message: { usage: usage(3, 80000, 5000) } }, { type: "assistant", message: { usage: usage(1, 10, 99999) } }]);
    const lean = jsonl("lean.jsonl", [{ type: "assistant", message: { usage: usage(3, 24000, 1000) } }]);
    const one = ws(f, "measure", big);
    assert.equal(one.code, 0, one.all);
    assert.match(one.out, /85003/, "the first model call: input + cache creation + cache read");
    const two = ws(f, "measure", big, lean, "--json");
    assert.equal(two.code, 0, two.all);
    const j = JSON.parse(two.out);
    assert.deepEqual([j.before, j.after], [85003, 25003]);
    const p = path.join(tmp, "p.json");
    fs.writeFileSync(p, JSON.stringify({ type: "result", num_turns: 1, is_error: false, usage: usage(2, 20000, 3000) }));
    assert.match(ws(f, "measure", p).out, /23002/, "a -p json result with one turn is the first call");
    for (const [name, body] of [["zero.json", { type: "result", num_turns: 1, is_error: true, usage: usage(0, 0, 0) }], ["multi.json", { type: "result", num_turns: 4, usage: usage(5, 9000, 90000) }], ["none.jsonl", null]]) {
      const q = path.join(tmp, name);
      fs.writeFileSync(q, body ? JSON.stringify(body) : '{"type":"user"}\n');
      const z = ws(f, "measure", q);
      assert.equal(z.code, 1, `${name}: ${z.all}`);
      assert.match(z.all, /rerun/, `${name} says to rerun`);
      assert.doesNotMatch(z.all, /first-call context: 0/, `${name} is never reported as 0`);
    }
    assert.equal(ws(f, "measure").code, 2, "measure with no file is a usage error");
    ok("measure reports the first-call context, compares two, and never reads unknown as 0");
  }

  console.log(`workspace ok: ${cases} cases`);
} catch (e) {
  console.error(e.stack || e.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
