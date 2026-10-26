#!/usr/bin/env node
// node bake.mjs <project> [--at <seconds>]
// Bakes every physics.bakeCached() the composition runs, once, into <project>/assets/bake/<hash>.bin. A page cannot
// write files, so this serves a receiver on 127.0.0.1:47613 and loads the composition headless through
// `hyperframes snapshot`: each bake that misses the cache is computed there and posted here. Later snapshots, the
// preview and every render worker read the files. Run it after a change to the set, before snapshots and renders;
// assets/bake/ can be deleted at any time (the next load bakes again).
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const argv = process.argv.slice(2).flatMap((a) => (a.startsWith("--at=") ? ["--at", a.slice(5)] : [a]));
const project = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--at"), at = argv.includes("--at") ? argv[argv.indexOf("--at") + 1] : "0";
if (!project || !fs.existsSync(path.join(project, "assets"))) { console.error("usage: node bake.mjs <project> [--at <seconds>]  (the project holds assets/ with the engine)"); process.exit(2); }
const out = path.join(project, "assets", "bake"), cors = { "access-control-allow-origin": "*", "access-control-allow-private-network": "true" }, got = [];
fs.mkdirSync(out, { recursive: true });
// A whole bake file for this hash: magic, a header naming the hash, and exactly the bytes its counts announce.
const whole = (b, hash) => {
  try {
    if (b.length < 8 || b.subarray(0, 4).toString() !== "DLB1") return false;
    const len = b.readUInt32LE(4), h = JSON.parse(b.subarray(8, 8 + len).toString());
    return h.hash === hash && 8 + len + ((4 - (len % 4)) % 4) + h.counts.reduce((a, c) => a + c * 32, 0) + h.series.length * h.n * 4 === b.length;
  } catch { return false; }
};

const srv = http.createServer((req, res) => {
  const m = req.method === "POST" && req.url.match(/^\/bake\/([0-9a-f]{16})$/);
  if (!m) { res.writeHead(req.method === "OPTIONS" ? 204 : 404, cors); return res.end(); }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const buf = Buffer.concat(chunks);
    if (!whole(buf, m[1])) { res.writeHead(400, cors); return res.end(); }
    const file = path.join(out, `${m[1]}.bin`); // written beside, then renamed: a reader never sees half a file
    fs.writeFileSync(`${file}.part`, buf); fs.renameSync(`${file}.part`, file);
    got.push(`${m[1]}.bin ${(buf.length / 1e6).toFixed(1)} MB`);
    res.writeHead(204, cors); res.end();
  });
});
srv.on("error", (e) => { console.error(e.code === "EADDRINUSE" ? "port 47613 is busy: another bake.mjs is running (wait for it)" : e.message); process.exit(1); });
srv.listen(47613, "127.0.0.1", () => {
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-bake-")), t0 = Date.now();
  // A long bake keeps the page from being render-ready for minutes: the snapshot waits up to 15.
  const snap = spawn("npx", ["--yes", "hyperframes", "snapshot", "--at", at, "--no-end", "--describe", "false", "--timeout", "900000", "--output", shots], { cwd: project, stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  snap.stderr.on("data", (d) => { err = (err + d).slice(-4000); });
  snap.on("close", (code) => {
    srv.close(); fs.rmSync(shots, { recursive: true, force: true });
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    if (code !== 0) { console.error(`snapshot failed (${code === null ? "killed" : `exit ${code}`}) after ${s} s:\n${err.trim().split("\n").slice(-12).join("\n")}`); process.exit(code ?? 1); }
    console.log(got.length ? `baked in ${s} s → ${path.relative(process.cwd(), out)}/\n  ${got.join("\n  ")}` : `nothing to bake (${s} s): every bake is cached already, or the composition calls no bakeCached()`);
  });
});
