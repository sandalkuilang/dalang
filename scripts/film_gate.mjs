#!/usr/bin/env node
// Measures an Express film (isometric looks) instead of looking at it. Each group's own module runs in Node on a stub
// page (no browser, nothing drawn): its camera (iso.cam, set once a frame), its world values (build()'s values) and its
// overlays (makeOverlay's calls) are read over time. Seams after HeyGen's seam gate (hyperframes motion-doctrine,
// Apache-2.0, which measures DOM wrappers; no code taken), the reading floor after latent-spaces/brag (MIT).
//   node film_gate.mjs [project] [--fps 30] [--group <name>]
// --group: only that group's lines (its seams on both sides, its motion, reading and still lines), for its builder
// before it reports and for its fixer; a neighbour still the scaffold stub holds the SPEC poses, so its seam is the SPEC's.
// project: the film folder (default .), read: index.html (the groups in order), compositions/<group>.html,
// audio/beats.js, assets/ (world.js included). Four checks:
//   seams    FAILED a jump at a cut (a group opening away from the last frame), a move that turns back or a zoom that
//            flips its sign at the cut; NOTE a dead stop or a start from rest at the cut, 2× speed, a turn over 45°
//   motion   FAILED a part that floats, sinks into another object or a pipe through a solid only while the world
//            moves (Anatomy's audit, engine/anatomy/world.mjs, at each new set of values against the world at rest)
//   reading  FAILED an overlay held settled under max(0.8 s, 0.3 s a word) between its entrance and its exit
//   still    NOTE 3 s or more with no camera move, no value change and no overlay in or out (a dead stretch)
// Exit 0: no FAILED. Exit 3: FAILED lines, each naming the group, the time and what to change. Exit 2: a group could not
// be run or read: WARN, rerun; never "clean".
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const only = opt("--group"), fps = Number(opt("--fps") || 30), dir = path.resolve(args[0] || "."), h = 1 / fps;
const JUMP = 4, MOVING = 0.5, STEP = 0.25, STILL = 3; // px at a cut; px/frame; s between samples; s of a dead stretch
const warn = (m) => { console.log(`WARN film gate could not measure the film: ${m}. Rerun after fixing; this is not a clean result.`); process.exit(2); };

// the stub page: any DOM or canvas call answers with the stub, a number with 0; the timeline keeps its onUpdate
const P = new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : P),
  apply: () => P, construct: () => P, set: () => true,
});
let now = 0, onUpdate = null;
const tl = new Proxy({}, { get: (_, k) => (k === "time" ? () => now : k === "eventCallback" ? (n, f) => { if (n === "onUpdate") onUpdate = f; return tl; } : () => tl) });
Object.assign(globalThis, { window: globalThis, document: P, gsap: new Proxy({}, { get: (_, k) => (k === "timeline" ? () => tl : P) }),
  requestAnimationFrame: () => 0, getComputedStyle: P, Image: P, OffscreenCanvas: P, HTMLElement: P, CSS: P, matchMedia: P });
globalThis.fetch = async (u) => { const b = readFileSync(path.resolve(dir, String(u).replace(/^\.\//, ""))); return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), json: async () => JSON.parse(b), text: async () => String(b) }; };

const tmp = mkdtempSync(path.join(os.tmpdir(), "dalang-film-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
const file = (f) => { const p = path.join(dir, f); if (!existsSync(p)) warn(`no ${f} (express.mjs assemble writes it)`); return readFileSync(p, "utf8"); };
vm.runInThisContext(file("audio/beats.js"));
const groups = [...file("index.html").matchAll(/<div\b[^>]*data-composition-src="([^"]+)"[^>]*>/g)].map(([tag, src]) => ({
  name: /\bid="([^"]+)"/.exec(tag)?.[1] ?? src, src, start: Number(/data-start="([^"]+)"/.exec(tag)?.[1]), dur: Number(/data-duration="([^"]+)"/.exec(tag)?.[1]) }));
if (!groups.length) warn("index.html names no group (data-composition-src)");
if (only && !groups.some((g) => g.name === only)) warn(`no group ${only} in index.html (${groups.map((g) => g.name).join(", ")})`);
for (const g of groups) if (!Number.isFinite(g.start) || !Number.isFinite(g.dur)) warn(`group ${g.name} has no number in data-start/data-duration (fill_times first)`);

// what a frame sets, recorded: the camera (iso.cam), the values build() draws with, the overlays makeOverlay is given
const assets = pathToFileURL(path.join(dir, "assets")).href;
const { Iso, C30, S30 } = await import(`${assets}/iso.js`);
const { IN_DUR, OUT_SHARE } = await import(`${assets}/editorial.js`);
let cam = null, vals = null, ovs = [];
Object.defineProperty(Iso.prototype, "cam", { configurable: true, get() { return this._cam; }, set(v) { this._cam = v; cam = v; } });
writeFileSync(path.join(tmp, "build.mjs"), `import { build as b } from "${assets}/build.js";\nexport * from "${assets}/build.js";\nexport function build(i, s, o = {}) { globalThis.__vals = o.values; return b(i, s, o); }\n`);
writeFileSync(path.join(tmp, "editorial.mjs"), `import { makeOverlay as m } from "${assets}/editorial.js";\nexport * from "${assets}/editorial.js";\nexport function makeOverlay(...a) { const o = m(...a); for (const k of ["headline", "card", "pill", "chip", "big", "tags"]) if (typeof o[k] === "function") { const f = o[k].bind(o); o[k] = (x = {}) => { globalThis.__ovs.push({ kind: k, ...x }); return f(x); }; } return o; }\n`);

for (const g of groups) {
  const js = /<script type="module">([\s\S]*?)<\/script>/.exec(file(g.src))?.[1];
  if (!js) warn(`${g.src} has no module script`);
  const f = path.join(tmp, `${g.name}.mjs`);
  writeFileSync(f, js.replace(/(from\s+["'])\.\/assets\/(build|editorial)\.js/g, `$1./$2.mjs`).replace(/(from\s+["'])\.\/assets\//g, `$1${assets}/`));
  onUpdate = null; globalThis.__ovs = [];
  try { await import(pathToFileURL(f).href); } catch (e) { warn(`group ${g.name} did not run: ${e.message}`); }
  if (!onUpdate) warn(`group ${g.name} registered no timeline onUpdate`);
  const run = onUpdate;
  g.ovs = globalThis.__ovs;
  g.at = (t) => { now = t; cam = null; globalThis.__vals = undefined; run(); vals = globalThis.__vals;
    if (!cam || ![cam.x, cam.y, cam.z, cam.k].every(Number.isFinite)) warn(`group ${g.name} set no camera at t=${t.toFixed(2)}`);
    return { cam: { ...cam }, vals: JSON.stringify(vals ?? {}) }; };
}

const out = [], f1 = (n) => n.toFixed(1), say = (l) => out.push(l);

// seams: a camera change as the frame sees it: [x, y] the shift of the frame centre, z the growth 540 px from it
const d = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, k = (a.k + b.k) / 2;
  return [-(dx - dy) * C30 * k, -(dx + dy) * S30 * k + dz * k, 540 * Math.log(b.k / a.k)]; };
const len = (v) => Math.hypot(...v), pose = (p) => `{ x: ${+p.x.toFixed(2)}, y: ${+p.y.toFixed(2)}, z: ${+p.z.toFixed(2)}, k: ${+p.k.toFixed(2)} }`;
for (let i = 1; i < groups.length; i++) {
  const A = groups[i - 1], B = groups[i], id = `seam ${A.name} → ${B.name} (${f1(B.start)} s)`, c = (G, t) => G.at(t).cam;
  const aEnd = c(A, A.dur), jump = d(aEnd, c(B, 0)), vA = d(c(A, A.dur - h), aEnd), vB = d(c(B, 0), c(B, h)), sA = len(vA), sB = len(vB), n = out.length;
  if (len(jump) > JUMP) say(`FAILED ${id}: jumps ${f1(len(jump))} px at the cut: ${A.name} ends on ${pose(aEnd)}, ${B.name} opens on ${pose(c(B, 0))}: ${B.name}'s first CAMERA key is \`{ t: 0, ...OPEN }\` with nothing overridden, OPEN the SPEC pose (no own zoom unit)`);
  if (sA > MOVING && sB > MOVING) {
    const cos = (vA[0] * vB[0] + vA[1] * vB[1] + vA[2] * vB[2]) / (sA * sB);
    if (cos < 0) say(`FAILED ${id}: the move turns back at the cut (a ping-pong): carry ${A.name}'s direction into ${B.name}'s first move, or hold before it`);
    else if (Math.abs(vA[2]) > MOVING && Math.abs(vB[2]) > MOVING && Math.sign(vA[2]) !== Math.sign(vB[2])) say(`FAILED ${id}: the zoom flips at the cut (a push answered by a pull): keep its sign, or hold`);
    else {
      if (cos < Math.SQRT1_2) say(`NOTE   ${id}: the move turns ${f1(Math.acos(cos) * 180 / Math.PI)}° at the cut`);
      if (Math.max(sA, sB) / Math.min(sA, sB) >= 2) say(`NOTE   ${id}: speed ${f1(sA)} → ${f1(sB)} px/frame at the cut`);
    }
  } else if (sA > MOVING) say(`NOTE   ${id}: ${A.name}'s move stops dead at the cut (${f1(sA)} px/frame)`);
  else if (sB > MOVING) say(`NOTE   ${id}: ${B.name}'s move starts from rest at the cut (${f1(sB)} px/frame)`);
  if (out.length === n) say(`OK     ${id}: ${sA > MOVING ? `one move carried through (${f1(sA)} → ${f1(sB)} px/frame)` : "held on both sides"}`);
}

// sample every group once: motion audit, dead stretches (ponytail: one audit per new set of values; a film that eases
// many values on every sample pays one per STEP, raise STEP if a big world gets slow)
let W = null;
try { W = await import(`${assets}/world.js`); } catch (e) { warn(`assets/world.js did not load: ${e.message}`); }
// the ground is the world's lowest face at rest (a floor plane there), so a part lifted off it reads as floating
const AN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "engine", "anatomy"), live = !W.STUB && Array.isArray(W.WORLD);
const { auditWorld, shapesOf } = await import(pathToFileURL(path.join(AN, "world.mjs")).href), { boundsOf } = await import(pathToFileURL(path.join(AN, "audit.mjs")).href);
const floor = live ? Math.min(...shapesOf(W.WORLD, { values: W.VALUES || {} }).solids.map((x) => boundsOf(x).min[2])) : 0;
const audit = live && ((v) => auditWorld(W.WORLD, { values: { ...(W.VALUES || {}), ...v }, floor }).problems);
const key = (p) => `${p.kind}|${p.part}|${p.other ?? ""}`, seen = new Map();
const rest = new Set(audit ? audit({}).map(key) : []);
for (const g of groups) {
  const marks = g.ovs.flatMap((o) => [o.from, o.to]).filter(Number.isFinite);
  let last = null, quiet = 0;
  for (let t = 0; t <= g.dur + 1e-9; t += STEP) {
    const s = g.at(t), abs = g.start + t, sig = JSON.stringify([s.cam, s.vals]);
    if (audit && !seen.has(s.vals)) {
      seen.set(s.vals, true);
      for (const p of audit(JSON.parse(s.vals)))
        if (!rest.has(key(p))) { rest.add(key(p)); say(`FAILED motion ${g.name} ${f1(abs)} s: ${p.text}, only while it moves: pose it from its cause (a support that moves with it, a stop before contact)`); }
    }
    const event = marks.some((m) => m > abs - STEP && m <= abs);
    quiet = sig === last && !event ? quiet + STEP : 0;
    if (quiet >= STILL && quiet < STILL + STEP) say(`NOTE   still ${g.name} ${f1(abs - quiet)}–${f1(abs)} s: nothing moves, changes or enters: a camera move, a value or a staged reveal on a word`);
    last = sig;
  }
}

// reading: the settled hold between the entrance and the exit, against the words it carries
const words = (o) => [o.kicker, o.text, o.label, o.value, o.sub, ...(o.rows ?? []).flatMap((r) => [r.k, r.v])].filter(Boolean).join(" ").replace(/[[\]]/g, "").split(/\s+/).filter(Boolean).length;
const kinds = { headline: "hl", card: "card", pill: "pill", chip: "chip", big: "big", tags: "tag" };
for (const g of groups) for (const o of g.ovs) {
  if (!Number.isFinite(o.from)) continue;
  const end = Number.isFinite(o.to) ? o.to : g.start + g.dur, inD = IN_DUR[kinds[o.kind]] ?? 0.25, hold = end - o.from - inD * (1 + OUT_SHARE), n = words(o), need = Math.max(0.8, 0.3 * n);
  if (hold + 1e-6 < need) say(`FAILED reading ${g.name} ${o.kind} "${String(o.text ?? o.label ?? "").slice(0, 40)}" at ${f1(o.from)} s: settled ${f1(Math.max(0, hold))} s, ${n} word(s) need ${f1(need)} s: end it on a later word, or cut words`);
}

// FAILED last, so a caller that keeps the tail (express.mjs assemble) never drops one under a list of NOTEs
const mine = only ? out.filter((l) => new RegExp(`(seam |→ |motion |reading |still )${only.replace(/\W/g, "\\$&")}\\b`).test(l)) : out;
mine.sort((a, b) => a.startsWith("FAILED") - b.startsWith("FAILED")).forEach((l) => console.log(l));
const bad = mine.filter((l) => l.startsWith("FAILED")).length;
console.log(bad ? `Result: ${bad} problem(s): each names its group and what to change` : `Result: ${groups.length - 1} seam(s), ${seen.size} world pose(s), ${groups.reduce((n, g) => n + g.ovs.length, 0)} overlay(s) measured: nothing jumps, floats, sinks or rushes`);
process.exit(bad ? 3 : 0);
