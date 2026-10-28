#!/usr/bin/env node
// Renders the iso prototype's stills: node examples/iso-proto/render.mjs <kenney dir> <out dir> [--orbit deg] [--query "&k=v"]
// <kenney dir> holds the unzipped CC0 packs furniture-kit/, nature-kit/, mini-characters/ (kenney.nl, CC0 1.0).
// Builds a temp site (engine/three built, engine/iso copied, the models used), serves it, and screenshots each engine x
// shot with HyperFrames' cached chrome-headless-shell (or $CHROME), then a side-by-side sheet with ffmpeg.
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "../..");
const [kenney, out] = process.argv.slice(2).map((p) => p && path.resolve(p));
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const orbit = arg("--orbit", "0"), extra = arg("--query", ""); // --query "&onepass=1": the iso template's own single pass
if (!kenney || !out) { console.error("usage: render.mjs <kenney dir> <out dir> [--orbit deg] [--query \"&k=v\"]"); process.exit(1); }
const chrome = process.env.CHROME || (() => {
  const base = path.join(os.homedir(), ".cache/hyperframes/chrome/chrome-headless-shell");
  const v = existsSync(base) && readdirSync(base).sort().pop();
  return v && path.join(base, v, readdirSync(path.join(base, v))[0], "chrome-headless-shell");
})();
if (!chrome || !existsSync(chrome)) { console.error("no chrome-headless-shell: set $CHROME"); process.exit(1); }

const site = mkdtempSync(path.join(os.tmpdir(), "iso-proto-"));
execFileSync("node", [path.join(root, "engine/three/build.mjs"), path.join(site, "assets/engine")], { stdio: "ignore" });
cpSync(path.join(root, "engine/iso"), path.join(site, "iso"), { recursive: true });
for (const f of ["index.html", "scene.js"]) cpSync(path.join(here, f), path.join(site, f));
const { MODELS } = await import(path.join(here, "scene.js"));
const PACK = { furniture: "furniture-kit/Models/GLTF format", nature: "nature-kit/Models/GLTF format", people: "mini-characters/Models/GLB format" };
for (const rel of Object.values(MODELS)) { const [, pack, file] = rel.split("/"); mkdirSync(path.join(site, "models", pack), { recursive: true }); cpSync(path.join(kenney, PACK[pack], file), path.join(site, rel)); }
cpSync(path.join(kenney, PACK.people, "Textures"), path.join(site, "models/people/Textures"), { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary", ".png": "image/png", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  const f = path.join(site, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!f.startsWith(site) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const port = server.address().port;
mkdirSync(out, { recursive: true });
const ENGINES = ["iso", "isomodel", "three"], SHOTS = ["wide", "medium", "close"];
try {
  for (const e of ENGINES) for (const s of SHOTS) {
    const file = path.join(out, `${e}-${s}.png`), url = `http://127.0.0.1:${port}/index.html?engine=${e}&shot=${s}&orbit=${orbit}${extra}`;
    // async: a sync spawn would block this process's own server
    const r = await promisify(execFile)(chrome, ["--headless", "--no-sandbox", "--hide-scrollbars", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1080,1920",
      "--virtual-time-budget=30000", `--screenshot=${file}`, url], { timeout: 120000 }).catch((err) => err);
    console.log(existsSync(file) ? `ok ${e}-${s}` : `FAILED ${e}-${s}: ${String(r.stderr ?? r).slice(-400)}`);
  }
} finally { server.close(); rmSync(site, { recursive: true, force: true }); }

// the sheet: rows are engines, columns are shots, each still at a third
const inputs = ENGINES.flatMap((e) => SHOTS.map((s) => ["-i", path.join(out, `${e}-${s}.png`)])).flat();
const n = ENGINES.length * SHOTS.length, rows = ENGINES.map((_, r) => SHOTS.map((_, c) => `[s${r * 3 + c}]`).join("") + `hstack=3[r${r}]`).join(";");
const scale = Array.from({ length: n }, (_, i) => `[${i}:v]scale=360:640[s${i}]`).join(";");
spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${scale};${rows};${ENGINES.map((_, r) => `[r${r}]`).join("")}vstack=${ENGINES.length}`, "-q:v", "3", path.join(out, "sheet.jpg")], { stdio: "inherit" });
console.log("sheet " + path.join(out, "sheet.jpg"));
