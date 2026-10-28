// objectStudio.js — the object-studio look's shared rig: real objects as clean 3D on a light grey studio sweep, seen
// through a PERSPECTIVE camera with a real lens. Every group of a parallel build imports it unchanged, so the sweep, the
// light, the lens and the finish match across seams and no pilot builder has to write a set first.
//
//   import { makeSet, cam, mat, halfLathe, contact, backdrop, wc, b } from "./objectStudio.js";
//   const S = makeSet(canvas, { G0 });                    // G0: the group's host start (absolute s)
//   S.world.add(...subjects);                             // everything that casts; S.scene holds the sweep
//   S.light();                                            // once, after the subjects are in (studio() measures them)
//   const run = S.shots(SHOTS, { stations, parts, actions, at, cut });   // shots.js rows; cues "w12" or beat names
//   S.loop({ overlay, post(ctx, tAbs) {} });              // hf-seek -> pose, render, finish, overlay; buildReady
//
// Stations: cam([x, y, z], [tx, ty, tz], mm, { dof }) — a lens in mm on a 36 mm gauge on the frame's long side;
// dof: { range (m, the in-focus depth), bokeh } or { fstop, focus (m) } (camera.js dofFor). A station without dof is
// sharp (a wide). Units: metres (mpu 1). Built on studio.js (light, AO, shadows, DOF), shots.js (the runner),
// camera.js (the lens), finish.js (motion blur sub-frames, vignette, grain) and audit.js (real sizes).
//
// Two material traps found on real renders, fixed here once:
//  - a liquid with `transmission` goes through the composer's transmission pass and renders opaque and dull: mat.liquid
//    is plain alpha (transparent, opacity < 1, no transmission), lit and lightly self-lit so it keeps its colour;
//  - an alpha-blended clear shell (plastic, glass) around a coloured liquid veils it toward the background colour:
//    mat.clearPlastic and mat.glass add reflections only (additive blending, black base, no depth write).

import { THREE, DepthOfFieldEffect } from "./three-vendor.js";
import { makeKit } from "./kit.js";
import { studio } from "./studio.js";
import { shots as runShots } from "./shots.js";
import { fovFromMm, dofFor, place as placeCamera } from "./camera.js";
import { makeFinisher } from "./finish.js";
import { scaleAudit } from "./audit.js";
export { THREE };
export { w, we, wc, b, wordIndex, cues } from "./editorial.js";

export const W = 1080, H = 1920, FPS = 30;

// withMoves(run, moves, fps): a shots.js run whose camera follows moves [{ from, to, pose(t) }] inside their windows
// (orbit, crane, dollyZoom, drone from camera.js), the station travel elsewhere; speed (m/s) from the pose itself.
export function withMoves(base, moves = [], fps = FPS) {
  for (const m of moves) if (!(m && m.to > m.from && typeof m.pose === "function")) throw new Error("shots(): a move is { from, to, pose(t) } with to > from");
  const moveAt = (t) => moves.find((m) => t >= m.from && t < m.to);
  const pose = (t) => {
    const m = moveAt(t);
    if (!m) return base.pose(t);
    const p = m.pose(t), q = m.pose(Math.min(t + 1 / fps, m.to - 1e-6));
    return { ...p, speed: p.position.distanceTo(q.position) * fps };
  };
  return { ...base, pose, at(t, cam) { const s = base.at(t, cam); if (moveAt(t) && cam) placeCamera(cam, pose(t)); return s; } };
}
// the sweep: floor curving up into the wall, the wall a touch lighter
export const SWEEP = Object.freeze({ floor: "#D9D9D6", top: "#ECECEA" });
// the light (studio() preset form [colour, intensity, azimuth, elevation]): a soft key upper left (front-left, high),
// a cool fill right, a rim from behind that lights a translucent subject from the back
export const LIGHT = Object.freeze({ key: [0xfffaf2, 2.2, -38, 52], fill: [0xe8eef8, 0.55, 65, 18], rim: [0xffffff, 1.6, 168, 30] });

const num = Number.isFinite;
// the vertical fov (deg) of a lens of `mm` on a 36 mm gauge on the frame's LONG side (portrait: the height)
export function lensFov(mm, aspect = W / H, gauge = 36) {
  if (!(num(aspect) && aspect > 0)) throw new Error("lensFov(): aspect is width / height, > 0 (got " + aspect + ")");
  return fovFromMm(mm, aspect < 1 ? gauge : gauge / aspect);
}
const V = (a) => (a?.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
// a station: position, target, lens; extra: { dof, aspect, ...anything shots.js should carry }
export function cam(pos, target, mm, { dof, aspect = W / H, ...extra } = {}) {
  const position = V(pos), tgt = V(target);
  let d = null;
  if (dof) {
    if (num(dof.fstop)) { const r = dofFor({ mm, fstop: dof.fstop, focusM: dof.focus ?? position.distanceTo(tgt) }); d = { range: r.focusRange, bokeh: r.bokehScale }; }
    else if (num(dof.range) && dof.range > 0) d = { range: dof.range, bokeh: dof.bokeh ?? 3 };
    else throw new Error("cam(): dof is { range (m), bokeh } or { fstop, focus (m) }");
  }
  return { position, target: tgt, fov: lensFov(mm, aspect), mm, ...(d ? { dof: d } : {}), ...extra };
}

// ---------- materials (one look for the whole film) ----------
function clearShell(k) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1, envMapIntensity: 1.4 * k, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  m.userData.clear = true;
  return m;
}
export const mat = {
  // a liquid seen through its container or in section: plain alpha, glossy, lightly self-lit in its own colour so the
  // sum stays near `color` without clipping; double-sided (a lathe's winding may face in; the back layer deepens it like
  // a real volume). NO transmission (see the header).
  liquid: (color, { opacity = 0.85, glow = 0.3, rough = 0.06 } = {}) => {
    if (color === undefined) throw new Error("mat.liquid(color): pass the liquid's colour");
    return new THREE.MeshPhysicalMaterial({
      color, transparent: true, opacity, roughness: rough, clearcoat: 0.5, clearcoatRoughness: 0.04, specularIntensity: 0.6, envMapIntensity: 0.4,
      emissive: new THREE.Color(color), emissiveIntensity: glow, transmission: 0, depthWrite: false, side: THREE.DoubleSide,
    });
  },
  // clear plastic film or a moulded clear bottle / glass: reflections only, added on top; `strength` scales them, the rims
  // and highlights carry the shape
  clearPlastic: ({ strength = 0.07 } = {}) => clearShell(Math.min(1, 0.55 + strength * 3)),
  glass: ({ strength = 0.12 } = {}) => clearShell(Math.min(1, 0.6 + strength * 3)),
  // chrome: a mirror. It shows only what it reflects: against a uniform sweep it reads flat grey, so put contrast in
  // its view (a dark card or the backdrop, a light strip) — the reflected edge is what reads as polish.
  chrome: ({ color = 0xffffff, rough = 0.04 } = {}) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough, envMapIntensity: 2.5 }),
  steel: ({ color = 0xc6cacf, rough = 0.32 } = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0.92, roughness: rough, envMapIntensity: 1.1 }),
  plastic: (color, rough = 0.38) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.4, clearcoatRoughness: 0.25 }),
  matte: (color, rough = 0.7) => new THREE.MeshStandardMaterial({ color, roughness: rough }),
  // a haze, mist or fog volume: opacity from its cause at t (0 = none)
  haze: (opacity = 0, color = 0xf6f2e6) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true, opacity, depthWrite: false }),
};

// ---------- geometry helpers ----------
// halfLathe(profile, { seg }): the BACK half (z <= 0) of a solid of revolution about +y, closed at the cut plane z = 0
// by two flat faces: the inside of a cut-open vessel (a liquid, a settled layer, a gap). Mark its mesh userData.cut = false.
// profile: [[r, y], ...] a closed polygon in the r >= 0 half-plane, counter-clockwise.
export function halfLathe(profile, { seg = 48 } = {}) {
  if (!Array.isArray(profile) || profile.length < 3) throw new Error("halfLathe(profile): [[r, y], ...], at least 3 points");
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const side = new THREE.LatheGeometry([...pts, pts[0]], seg, Math.PI / 2, Math.PI);
  const shape = new THREE.Shape(pts);
  const a = new THREE.ShapeGeometry(shape); // in x-y, normal +z: the right face (x >= 0) at z = 0
  const bGeo = new THREE.ShapeGeometry(shape); bGeo.scale(-1, 1, 1); // mirrored: the left face; flip its winding back to +z
  const idx = bGeo.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const merged = mergeGeos([side.toNonIndexed(), a.toNonIndexed(), bGeo.toNonIndexed()]);
  merged.computeVertexNormals();
  return merged;
}
// mergeGeos(list): non-indexed geometries into one (position + uv)
export function mergeGeos(list) {
  const pos = [], uv = [];
  for (const g of list) {
    const p = g.attributes.position.array, u = g.attributes.uv?.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < p.length / 3; i++) uv.push(u ? u[i * 2] : 0, u ? u[i * 2 + 1] : 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// canvasTex(w, h, draw(ctx, w, h)): a CanvasTexture in sRGB (a printed label, a dial face)
export function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
let radialTex = null;
const radial = () => radialTex || (radialTex = canvasTex(256, 256, (g) => {
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, "rgba(0,0,0,1)"); r.addColorStop(0.45, "rgba(0,0,0,0.55)"); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
}));
// contact(at, { w, d, opacity }): a soft contact shadow on the floor under an object (with the AO and the shadow map)
export function contact(at, { w = 0.2, d = w, opacity = 0.45, y = 0.0006 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radial(), color: 0x000000, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.position.set(at.x ?? at[0], y, at.z ?? at[2]); m.name = "contact"; m.userData.cut = false; m.renderOrder = 1;
  return m;
}
// backdrop(at, { w, h, opacity, color, face }): a soft darker pool of grey standing behind a hero, for figure-ground (a
// pale or bright subject must separate from the light sweep). A vertical card facing +z with a radial falloff.
export function backdrop(at, { w = 1, h = w, opacity = 0.22, color = 0x4a4a48, face = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: radial(), color, transparent: true, opacity, depthWrite: false }));
  m.position.copy(V(at)); m.rotation.y = face; m.name = "backdrop"; m.userData.cut = false; m.userData.attend = false;
  return m;
}
// seeded random (mulberry32) and the easings the overlays and poses share
export function rng(seed = 1) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const clamp = (x, a = 0, z = 1) => Math.min(z, Math.max(a, x));
export const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
export const ease3 = (u) => 1 - (1 - clamp(u)) ** 3;

// ---------- the sweep: floor curving up into a back wall (a cyclorama), metres ----------
export function makeSweep({ width = 80, front = 16, R = 5, wall = 14, x = 0, z = -6, floor = SWEEP.floor, top = SWEEP.top } = {}) {
  const prof = []; // (depth s, height): floor from z = front to the cove, a quarter circle of radius R, then the wall
  for (let i = 0; i <= 12; i++) prof.push([front - (front * i) / 12, 0]);
  for (let i = 1; i <= 24; i++) { const a = (i / 24) * (Math.PI / 2); prof.push([-R * Math.sin(a), R * (1 - Math.cos(a))]); }
  for (let i = 1; i <= 10; i++) prof.push([-R, R + ((wall - R) * i) / 10]);
  const nx = 40, pos = [], col = [], idx = [];
  const cF = new THREE.Color(floor), cT = new THREE.Color(top), c = new THREE.Color();
  for (const [s, y] of prof) {
    c.copy(cF).lerp(cT, Math.pow(clamp(y / (R + 3)), 0.8));
    for (let i = 0; i <= nx; i++) { pos.push(x - width / 2 + (width * i) / nx, y, z + s); col.push(c.r, c.g, c.b); }
  }
  for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, a2 = a + nx + 1; idx.push(a, a2, a + 1, a + 1, a2, a2 + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, envMapIntensity: 0.5 }));
  m.name = "sweep"; m.receiveShadow = true; m.userData.attend = false; m.userData.cut = false;
  return m;
}

// ---------- the set ----------
// makeSet(canvas, { G0, G1, W, H, fps, format, sweep: { floor, top, ... }, env, tone, grain, edge, exposure, lights,
//   beats, words, end }): canvas is the composition's output 2D <canvas>; beats / words / end default to the page's
//   BEATS / WORDS / NARRATION_DURATION. Returns { scene, world, sweep, kit, camera, renderer, gl, out, light, shots,
//   render, loop, project, audit, rig, run }.
export function makeSet(out, { G0 = 0, G1 = Infinity, W: fw = W, H: fh = H, fps = FPS, format = "reels", sweep = {}, env = 0.85, tone = "neutral", grain = 0.03, edge = "#cfcfcc", exposure = 1, lights = LIGHT, beats, words, end } = {}) {
  if (!out?.getContext) throw new Error(`makeSet(canvas): pass the composition's output <canvas> (${fw} x ${fh})`);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sweep.top ?? SWEEP.top);
  const kit = makeKit(scene, { mpu: 1 });
  const camera = new THREE.PerspectiveCamera(40, fw / fh, 0.005, 300);
  const gl = document.createElement("canvas"); gl.width = fw; gl.height = fh;
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: false, stencil: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1); renderer.setSize(fw, fh, false);
  renderer.localClippingEnabled = true;
  renderer.toneMappingExposure = exposure;
  const world = new THREE.Group(); world.name = "world"; scene.add(world);
  const sw = makeSweep(sweep); scene.add(sw);
  const finish = makeFinisher(out, { grain, edge, fps });
  const octx = out.getContext("2d");
  let rig = null, dof = null, dofNow = null, run = null;

  function light() {
    world.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(world).expandByScalar(0.2);
    rig = studio(renderer, scene, camera, { look: "diorama", preset: lights, set: box, env, tone, ao: { intensity: 2.2, falloff: 1 }, shadow: { map: 4096, radius: 10 }, dof: { focusRange: 3, bokehScale: 3 }, height: fh });
    rig.lights.key.shadow.bias = -0.0003;
    for (const p of rig.composer.passes) for (const e of p.effects || []) if (e instanceof DepthOfFieldEffect) dof = e;
    if (dof) {
      const orig = rig.composer.render.bind(rig.composer);
      rig.composer.render = (...a) => { // the station's own depth of field (rack focus, macro), none on a wide
        dof.cocMaterial.focusRange = dofNow ? dofNow.range : 1000;
        dof.bokehScale = dofNow ? dofNow.bokeh ?? 3 : 0;
        return orig(...a);
      };
    }
    return rig;
  }

  // project(anchor) -> { x, y, ok } px on the frame (for overlay pills)
  const v = new THREE.Vector3();
  function project(a) {
    if (!a) return null;
    if (a.isObject3D) a.getWorldPosition(v); else v.copy(a);
    v.project(camera);
    return { x: ((v.x + 1) / 2) * fw, y: ((1 - v.y) / 2) * fh, ok: v.z > -1 && v.z < 1 };
  }

  // shots(list, set, { moves }): engine shots.js with the film's beats, words, frame and format; overlays are DOM
  // (editorial.js). moves: [{ from, to, pose(tAbs) }] — inside [from, to) the camera follows pose(t) instead of the
  // station travel, for camera.js's orbit / crane / dollyZoom / drone (e.g. pose: (t) => dollyZoom(t, {...})); the
  // speed for motion blur is measured from the pose itself.
  function shots(list, set, { moves = [] } = {}) {
    const base = runShots(list, { beats: beats ?? globalThis.BEATS, words: words ?? globalThis.WORDS, end: end ?? globalThis.NARRATION_DURATION, fps, W: fw, H: fh, format, set: { group: world, keep: [sw], ...set } });
    run = withMoves(base, moves, fps);
    return run;
  }

  // render(tAbs): pose at t; motion blur when the camera moves > 4 px a frame (5 sub-frames over a 180 deg shutter)
  function render(tAbs, { post } = {}) {
    if (!rig) throw new Error("set.render(): call set.light() after the subjects are in");
    if (!run) throw new Error("set.render(): build the shot list first (set.shots(...))");
    const p = run.pose(tAbs);
    const d = p.position.distanceTo(p.target), pxPerM = fh / (2 * d * Math.tan((p.fov * Math.PI) / 360));
    const n = (p.speed * pxPerM) / fps > 4 ? 5 : 1;
    for (let i = 0; i < n; i++) {
      const tt = n > 1 ? tAbs + (i / (n - 1) - 0.5) * (0.5 / fps) : tAbs;
      run.at(tt, camera);
      const pose = run.pose(tt);
      dofNow = pose.dof || null;
      rig.render(tt, pose);
      finish.layer(gl, i);
    }
    run.at(tAbs, camera); // leave the set and camera at t (overlays project from here)
    finish.grade(tAbs);
    if (post) post(octx, tAbs);
  }

  // loop({ overlay, post, key, fonts }): hf-seek drives the frame (local t = global - G0 inside [G0, G1)); buildReady
  function loop({ overlay, post, key, fonts = ['900 68px "Inter"', '700 46px "Inter"', '600 24px "IBM Plex Mono"'] } = {}) {
    const draw = (tg) => {
      if (tg < G0 - 1e-6 || tg >= G1 + 1e-6) return; // not this group's window: its host is hidden
      const t = Math.max(G0, Math.min(tg, G1 - 1 / fps));
      render(t, { post });
      overlay?.update(t - G0, project);
    };
    const ready = Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => 0))).then(() => draw(G0));
    window.__hf = window.__hf || {};
    window.__hf.buildReady = window.__hf.buildReady || {};
    window.__hf.buildReady[key || "set"] = ready;
    window.addEventListener("hf-seek", (e) => {
      const tg = e.detail.time;
      if (e.detail.waitUntil) e.detail.waitUntil(ready.then(() => draw(tg))); else ready.then(() => draw(tg));
    });
    return { draw, ready };
  }

  // audit(tag): real sizes (userData.real) of every prop under world, logged once
  function audit(tag = "set") {
    const r = scaleAudit(world, { tol: 0.15 });
    const bad = (r.off || r.problems || []).length || (r.bad || []).length;
    (bad ? console.warn : console.log)(`[${tag}] scaleAudit`, JSON.stringify(r).slice(0, 2000));
    globalThis.__scaleAudit = globalThis.__scaleAudit || {}; globalThis.__scaleAudit[tag] = r;
    return r;
  }

  return { scene, world, sweep: sw, kit, camera, renderer, gl, out, light, shots, render, loop, project, audit, get rig() { return rig; }, get run() { return run; } };
}
