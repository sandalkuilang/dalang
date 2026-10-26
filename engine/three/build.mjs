#!/usr/bin/env node
// Installs the engine into a video project: node build.mjs <project>/assets/engine
// Copies the modules and builds three-vendor.js (three + add-ons, ~1 MB) and rapier.js (~2 MB) from pinned
// versions. The npm install is cached in vendor/node_modules, so later projects only copy and bundle.
// Also writes .engine.json beside them: every file it wrote with its real origin and licence (the repo's MIT for the
// engine's own files; each pinned npm package and its licence for a bundle). scripts/check_assets.mjs reads it, so the
// engine's files are never listed in ASSETS.json by hand.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), vendor = join(here, "vendor"), out = resolve(process.argv[2] || "");
if (!process.argv[2]) { console.error("usage: node build.mjs <project>/assets/engine"); process.exit(1); }
mkdirSync(out, { recursive: true });
if (!existsSync(join(vendor, "node_modules", "three"))) execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: vendor, stdio: "inherit" });
const esbuild = join(vendor, "node_modules", ".bin", "esbuild");
const bundles = [["entry.js", "three-vendor.js"], ["rapier-entry.js", "rapier.js"]];
for (const [entry, file] of bundles)
  execFileSync(esbuild, [join(vendor, entry), "--bundle", "--format=esm", "--minify", "--legal-comments=none", "--outfile=" + join(out, file)], { stdio: "inherit" });
for (const f of readdirSync(here)) if (f.endsWith(".js")) cpSync(join(here, f), join(out, f));
cpSync(join(here, "examples"), join(out, "examples"), { recursive: true }); // ready pieces built on the systems: import from "./examples/…"

// The manifest. `file` is relative to the manifest's folder, with "/" separators.
const REPO = "https://github.com/sandalkuilang/dalang";
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const own = [...readdirSync(here).filter((f) => f.endsWith(".js")), ...walk(join(here, "examples")).map((p) => p.slice(here.length + 1).split(/[\\/]/).join("/"))];
const rows = own.map((file) => ({ file, source: `DALANG engine, ${REPO} (engine/three/${file})`, licence: "MIT" }));
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
writeFileSync(join(out, ".engine.json"), JSON.stringify(rows, null, 2) + "\n");
console.log("engine installed in " + out);
