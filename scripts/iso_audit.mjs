#!/usr/bin/env node
// Proves an Express film's world on its true shapes before a frame is drawn (engine/anatomy/world.mjs, on Anatomy's
// vendored geometry audit): nothing floats, no object is sunk into another, no pipe passes through a solid, every pipe
// end lands on a part.
//   node iso_audit.mjs [project] [--ground name,name] [--floor z] [--cut 1]
// project: the film folder (default .), read: assets/world.js (WORLD, VALUES). --ground names the parts or specs that
// are the ground (a slab, a plot; a board part and a part with ground: true always are); --floor z adds a plane at z.
// PINS (world.js, the part names the overlays label) are checked too: one part each, seen by the camera; --cut 1 checks
// them with the skins off (a cutaway beat). A spec with hero: true needs its real parts (engine/anatomy/world.mjs).
// Exit 0: clean. Exit 3: problems, one per line, each named by spec and part: fix the geometry (a foot, a bracket, a
// shorter run), never by hiding the part. Exit 2: the world could not be read or checked: WARN, rerun; never "clean".
import path from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const ground = (opt("--ground") || "").split(",").filter(Boolean), floorArg = opt("--floor"), cut = Number(opt("--cut") || 0);
const project = path.resolve(args[0] || "."), file = path.join(project, "assets", "world.js");
const here = path.dirname(fileURLToPath(import.meta.url));
try {
  if (!existsSync(file)) throw new Error(`no ${path.relative(process.cwd(), file) || file}`);
  const W = await import(pathToFileURL(file).href);
  if (W.STUB) throw new Error("assets/world.js is still the stub: the first builder has not written the world yet");
  if (!Array.isArray(W.WORLD)) throw new Error("assets/world.js exports no WORLD array");
  const { auditWorld } = await import(pathToFileURL(path.join(here, "..", "engine", "anatomy", "world.mjs")).href);
  if (W.PINS !== undefined && !Array.isArray(W.PINS)) throw new Error("assets/world.js PINS is a list of part names");
  const r = auditWorld(W.WORLD, { values: W.VALUES || {}, ground, cut, pins: W.PINS || [], floor: floorArg === undefined ? undefined : Number(floorArg) });
  console.log(r.text);
  process.exit(r.ok ? 0 : 3);
} catch (e) {
  console.log(`WARN iso audit could not check the world: ${e.message}. Rerun after fixing; this is not a clean result.`);
  process.exit(2);
}
