#!/usr/bin/env node
// Measures every seam of an Express film (isometric looks) instead of looking at it: each group's own module runs in
// Node on a stub page (no browser, no drawing seen), and its camera (iso.cam, set once per frame by the template) is
// read on both sides of each cut. Idea after HeyGen's seam gate (hyperframes motion-doctrine, Apache-2.0), which
// measures DOM wrappers; an Express camera lives inside a canvas, so this reads the camera itself.
//   node seam_gate.mjs [project] [--fps 30]
// project: the film folder (default .), read: index.html (the groups in order), compositions/<group>.html,
// audio/beats.js, assets/. Per seam, in screen pixels per frame (a pan as the shift of the frame centre, a zoom as the
// growth at 540 px from it):
//   FAILED  the next group opens away from the last frame (a jump: its OPEN is not the previous CLOSE);
//           the move turns back at the cut, or a zoom flips its sign (a push answered by a pull);
//   NOTE    a move that stops dead at the cut or starts from rest after it, a speed that changes 2× or more, a turn
//           of more than 45°: allowed, but the cut reads as two shots;
//   OK      held on both sides, or one move carried through the cut.
// Exit 0: no FAILED. Exit 3: FAILED lines, each naming the seam and the SPEC CAMERA pose to change. Exit 2: a group
// could not be run or read: WARN, rerun; never "clean".
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const fps = Number(opt("--fps") || 30), dir = path.resolve(args[0] || "."), h = 1 / fps;
const JUMP = 4, MOVING = 0.5; // px: a jump the eye sees at a cut; px/frame: still below it
const warn = (m) => { console.log(`WARN seam gate could not measure the seams: ${m}. Rerun after fixing; this is not a clean result.`); process.exit(2); };

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

const tmp = mkdtempSync(path.join(os.tmpdir(), "dalang-seam-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
{
  const file = (f) => { const p = path.join(dir, f); if (!existsSync(p)) warn(`no ${f} (express.mjs assemble writes it)`); return readFileSync(p, "utf8"); };
  vm.runInThisContext(file("audio/beats.js"));
  const groups = [...file("index.html").matchAll(/<div\b[^>]*data-composition-src="([^"]+)"[^>]*>/g)].map(([tag, src]) => ({
    name: /\bid="([^"]+)"/.exec(tag)?.[1] ?? src, src, start: Number(/data-start="([^"]+)"/.exec(tag)?.[1]), dur: Number(/data-duration="([^"]+)"/.exec(tag)?.[1]) }));
  if (groups.length < 2) { console.log(`OK     ${groups.length} group, no seam`); process.exit(0); }
  for (const g of groups) if (!Number.isFinite(g.start) || !Number.isFinite(g.dur)) warn(`group ${g.name} has no number in data-start/data-duration (fill_times first)`);

  // the template sets iso.cam = { ...camera(t) } once a frame: the last value set is this frame's camera
  const assets = pathToFileURL(path.join(dir, "assets")).href;
  const { Iso, C30, S30 } = await import(`${assets}/iso.js`);
  let cam = null;
  Object.defineProperty(Iso.prototype, "cam", { configurable: true, get() { return this._cam; }, set(v) { this._cam = v; cam = v; } });

  for (const g of groups) {
    const js = /<script type="module">([\s\S]*?)<\/script>/.exec(file(g.src))?.[1];
    if (!js) warn(`${g.src} has no module script`);
    const f = path.join(tmp, `${g.name}.mjs`);
    writeFileSync(f, js.replace(/(from\s+["'])\.\/assets\//g, `$1${assets}/`));
    onUpdate = null;
    try { await import(pathToFileURL(f).href); } catch (e) { warn(`group ${g.name} did not run: ${e.message}`); }
    if (!onUpdate) warn(`group ${g.name} registered no timeline onUpdate`);
    const run = onUpdate;
    g.at = (t) => { now = t; cam = null; run(); if (!cam || ![cam.x, cam.y, cam.z, cam.k].every(Number.isFinite)) warn(`group ${g.name} set no camera at t=${t.toFixed(2)}`); return { ...cam }; };
  }

  // a camera change as the frame sees it: [x, y] the shift of the frame centre, z the growth 540 px from it
  const d = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, k = (a.k + b.k) / 2;
    return [-(dx - dy) * C30 * k, -(dx + dy) * S30 * k + dz * k, 540 * Math.log(b.k / a.k)]; };
  const len = (v) => Math.hypot(...v), f1 = (n) => n.toFixed(1);
  let bad = 0;
  for (let i = 1; i < groups.length; i++) {
    const A = groups[i - 1], B = groups[i], id = `${A.name} → ${B.name} (${f1(B.start)} s)`;
    const aEnd = A.at(A.dur), jump = d(aEnd, B.at(0)), vA = d(A.at(A.dur - h), aEnd), vB = d(B.at(0), B.at(h));
    const sA = len(vA), sB = len(vB), out = [];
    if (len(jump) > JUMP) out.push(`FAILED ${id}: jumps ${f1(len(jump))} px at the cut: ${B.name}'s OPEN is not ${A.name}'s CLOSE (SPEC CAMERA: make them one pose)`);
    if (sA > MOVING && sB > MOVING) {
      const cos = (vA[0] * vB[0] + vA[1] * vB[1] + vA[2] * vB[2]) / (sA * sB);
      if (cos < 0) out.push(`FAILED ${id}: the move turns back at the cut (a ping-pong): carry ${A.name}'s direction into ${B.name}'s first move, or hold before it`);
      else if (Math.abs(vA[2]) > MOVING && Math.abs(vB[2]) > MOVING && Math.sign(vA[2]) !== Math.sign(vB[2])) out.push(`FAILED ${id}: the zoom flips at the cut (a push answered by a pull): keep its sign, or hold`);
      else {
        if (cos < Math.SQRT1_2) out.push(`NOTE   ${id}: the move turns ${f1(Math.acos(cos) * 180 / Math.PI)}° at the cut`);
        if (Math.max(sA, sB) / Math.min(sA, sB) >= 2) out.push(`NOTE   ${id}: speed ${f1(sA)} → ${f1(sB)} px/frame at the cut`);
      }
    } else if (sA > MOVING) out.push(`NOTE   ${id}: ${A.name}'s move stops dead at the cut (${f1(sA)} px/frame)`);
    else if (sB > MOVING) out.push(`NOTE   ${id}: ${B.name}'s move starts from rest at the cut (${f1(sB)} px/frame)`);
    if (!out.length) out.push(`OK     ${id}: ${sA > MOVING ? `one move carried through (${f1(sA)} → ${f1(sB)} px/frame)` : "held on both sides"}`);
    bad += out.filter((l) => l.startsWith("FAILED")).length;
    out.forEach((l) => console.log(l));
  }
  console.log(bad ? `Result: ${bad} seam problem(s): fix the poses in SPEC CAMERA and the groups' CAMERA keys, then rerun` : `Result: ${groups.length - 1} seam(s) measured, none jumps or turns back`);
  process.exit(bad ? 3 : 0);
}
