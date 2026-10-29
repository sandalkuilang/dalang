#!/usr/bin/env node
// Installs the engine into a video project: node build.mjs <project>/assets (scaffold.mjs does, for object-studio).
// Copies the modules, with engine/iso's cinema.js and parallax.js (the film camera and finish the Studio iso rig uses),
// and builds three-vendor.js (three + add-ons, ~1 MB) from pinned versions. The npm install is cached in
// vendor/node_modules, so later projects only copy and bundle.
// Also writes .engine.json beside them: every file it wrote with its real origin and licence (the repo's MIT for the
// engine's own files; each pinned npm package and its licence for a bundle). scripts/check_assets.mjs reads it, so the
// engine's files are never listed in ASSETS.json by hand.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), vendor = join(here, "vendor"), out = resolve(process.argv[2] || "");
if (!process.argv[2]) { console.error("usage: node build.mjs <project>/assets"); process.exit(1); }
mkdirSync(out, { recursive: true });
if (!existsSync(join(vendor, "node_modules", "three"))) execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: vendor, stdio: "inherit" });
const esbuild = join(vendor, "node_modules", ".bin", "esbuild");
const bundles = [["entry.js", "three-vendor.js"]];
for (const [entry, file] of bundles)
  execFileSync(esbuild, [join(vendor, entry), "--bundle", "--format=esm", "--minify", "--legal-comments=none", "--outfile=" + join(out, file)], { stdio: "inherit" });
for (const f of readdirSync(here)) if (f.endsWith(".js")) cpSync(join(here, f), join(out, f));
// engine/iso's film camera and finish (no imports): isoStudio's `finish` is cinema.js makeFinish().apply, depth is parallax.js.
const iso = join(here, "..", "iso"), isoFiles = ["cinema.js", "parallax.js"];
for (const f of isoFiles) cpSync(join(iso, f), join(out, f));

// The Draco decoder (wasm build) that three's DRACOLoader fetches next to the engine, so a Draco-compressed glTF loads.
const dracoSrc = join(vendor, "node_modules", "three", "examples", "jsm", "libs", "draco", "gltf"), dracoFiles = ["draco_decoder.wasm", "draco_wasm_wrapper.js"];
mkdirSync(join(out, "draco"), { recursive: true });
for (const f of dracoFiles) cpSync(join(dracoSrc, f), join(out, "draco", f));

// The manifest. `file` is relative to the manifest's folder, with "/" separators.
const REPO = "https://github.com/sandalkuilang/dalang";
const own = readdirSync(here).filter((f) => f.endsWith(".js"));
const rows = [...own.map((file) => ({ file, source: `DALANG engine, ${REPO} (engine/three/${file})`, licence: "MIT" })),
  ...isoFiles.map((file) => ({ file, source: `DALANG engine, ${REPO} (engine/iso/${file})`, licence: "MIT" }))];
const packages = (entry) => [...new Set([...readFileSync(join(vendor, entry), "utf8").matchAll(/from\s+["']([^"']+)["']/g)]
  .map((m) => m[1]).filter((s) => !s.startsWith(".")).map((s) => s.split("/").slice(0, s.startsWith("@") ? 2 : 1).join("/")))];
for (const [entry, file] of bundles) {
  const components = packages(entry).map((name) => {
    const pkg = JSON.parse(readFileSync(join(vendor, "node_modules", name, "package.json"), "utf8"));
    return { name, version: pkg.version, licence: typeof pkg.license === "string" && pkg.license ? pkg.license : "unknown" }; // never guessed
  });
  rows.push({ file, source: `bundle of ${components.map((c) => `${c.name}@${c.version}`).join(", ")} (npm, pinned in engine/three/vendor/package.json)`,
    licence: [...new Set(components.map((c) => c.licence))].join(" AND "), components });
}
const threeVersion = JSON.parse(readFileSync(join(vendor, "node_modules", "three", "package.json"), "utf8")).version;
for (const f of dracoFiles)
  rows.push({ file: "draco/" + f, source: `Google Draco glTF decoder, shipped in three@${threeVersion} (examples/jsm/libs/draco/gltf, https://github.com/google/draco)`, licence: "Apache-2.0" });
writeFileSync(join(out, ".engine.json"), JSON.stringify(rows, null, 2) + "\n");
console.log("engine installed in " + out);
