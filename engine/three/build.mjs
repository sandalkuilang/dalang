#!/usr/bin/env node
// Installs the engine into a video project: node build.mjs <project>/assets/engine
// Copies the modules and builds three-vendor.js (three + add-ons, ~1 MB) and rapier.js (~2 MB) from pinned
// versions. The npm install is cached in vendor/node_modules, so later projects only copy and bundle.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), vendor = join(here, "vendor"), out = resolve(process.argv[2] || "");
if (!process.argv[2]) { console.error("usage: node build.mjs <project>/assets/engine"); process.exit(1); }
mkdirSync(out, { recursive: true });
if (!existsSync(join(vendor, "node_modules", "three"))) execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: vendor, stdio: "inherit" });
const esbuild = join(vendor, "node_modules", ".bin", "esbuild");
for (const [entry, file] of [["entry.js", "three-vendor.js"], ["rapier-entry.js", "rapier.js"]])
  execFileSync(esbuild, [join(vendor, entry), "--bundle", "--format=esm", "--minify", "--legal-comments=none", "--outfile=" + join(out, file)], { stdio: "inherit" });
for (const f of readdirSync(here)) if (f.endsWith(".js")) cpSync(join(here, f), join(out, f));
cpSync(join(here, "examples"), join(out, "examples"), { recursive: true }); // ready pieces built on the systems: import from "./examples/…"
console.log("engine installed in " + out);
