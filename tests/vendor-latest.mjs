#!/usr/bin/env node
// scripts/vendor_latest.mjs against a fake npm: current, behind, capped by a peer range, npm unreachable, --update.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vendor-latest-"));
fs.mkdirSync(path.join(tmp, "scripts")); fs.mkdirSync(path.join(tmp, "engine/three/vendor"), { recursive: true }); fs.mkdirSync(path.join(tmp, "bin"));
fs.copyFileSync(path.join(root, "scripts/vendor_latest.mjs"), path.join(tmp, "scripts/vendor_latest.mjs"));
const pkgFile = path.join(tmp, "engine/three/vendor/package.json");
const PINNED = { dependencies: { three: "0.186.1", postprocessing: "6.39.5", n8ao: "2.0.1" }, devDependencies: { esbuild: "0.28.2" } };
// the fake `npm`: view <name[@v]> [field] --json from $FAKE (a JSON file), install is recorded
fs.writeFileSync(path.join(tmp, "bin/npm"), `#!/usr/bin/env node
const fs = require("fs"), F = JSON.parse(fs.readFileSync(process.env.FAKE, "utf8")), a = process.argv.slice(2).filter((x) => x !== "--json");
if (F.fail) process.exit(1);
if (a[0] === "install") { fs.appendFileSync(process.env.FAKE + ".log", "install\\n"); process.exit(0); }
const [name, field] = [a[1], a[2]], bare = name.split("@")[0] || name;
const out = field === "version" ? F.versions[name] : field === "versions" ? F.all[name] : field === "peerDependencies" ? (F.peers[name] ?? {}) : null;
if (out === undefined || out === null) process.exit(1);
console.log(JSON.stringify(out));
`, { mode: 0o755 });

const run = (fake, ...args) => {
  const f = path.join(tmp, "fake.json"); fs.writeFileSync(f, JSON.stringify(fake)); fs.rmSync(f + ".log", { force: true });
  fs.writeFileSync(pkgFile, JSON.stringify(PINNED, null, 2));
  const r = spawnSync(process.execPath, [path.join(tmp, "scripts/vendor_latest.mjs"), ...args], { encoding: "utf8", env: { ...process.env, PATH: `${path.join(tmp, "bin")}:${process.env.PATH}`, FAKE: f } });
  return { code: r.status, out: r.stdout, pkg: JSON.parse(fs.readFileSync(pkgFile, "utf8")), installed: fs.existsSync(f + ".log") };
};
const base = { versions: { three: "0.186.1", postprocessing: "6.39.5", n8ao: "2.0.1", esbuild: "0.28.2" }, peers: { "postprocessing@6.39.5": { three: ">= 0.168.0 < 0.190.0" }, "n8ao@2.0.1": { three: ">=0.137" } }, all: { three: ["0.185.0", "0.186.1", "0.187.0"] } };

let r = run(base);
assert.equal(r.code, 0); assert.match(r.out, /^ok three 0\.186\.1$/m); assert.doesNotMatch(r.out, /behind|capped|unknown/, "everything current: ok lines only");

r = run({ ...base, versions: { ...base.versions, three: "0.187.0" } });
assert.match(r.out, /^behind three 0\.186\.1 → 0\.187\.0$/m, "a newer release the add-ons accept is behind"); assert.equal(r.pkg.dependencies.three, "0.186.1", "a check changes nothing");

r = run({ ...base, versions: { ...base.versions, three: "0.188.0" }, peers: { ...base.peers, "postprocessing@6.39.5": { three: ">=0.168.0 <0.187.0" } } });
assert.match(r.out, /^capped three 0\.186\.1: newest is 0\.188\.0, but postprocessing@6\.39\.5 supports three >=0\.168\.0 <0\.187\.0; wait for postprocessing$/m, "the add-on's peer range caps three");
assert.match(r.out, /^ok three 0\.186\.1$/m, "the newest release inside the range is the target");

r = run({ ...base, fail: true });
assert.equal(r.code, 0); assert.match(r.out, /^unknown three 0\.186\.1: could not read npm, rerun$/m, "npm unreachable is unknown, never behind"); assert.doesNotMatch(r.out, /behind/);

r = run({ ...base, versions: { ...base.versions, three: "0.187.0" } }, "--update");
assert.equal(r.pkg.dependencies.three, "0.187.0", "--update writes the new pin"); assert.ok(r.installed, "and installs it"); assert.match(r.out, /updated three/);
r = run(base, "--update");
assert.ok(!r.installed && /nothing to update/.test(r.out), "nothing behind: no install");
console.log("vendor-latest: ok");
