#!/usr/bin/env node
// node selfcheck.mjs <project>/assets — after build.mjs: each check fails loudly if a known trap is back.
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { realpathSync, mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const dir = pathToFileURL(resolve(process.argv[2] || ".") + "/").href, use = (f) => import(dir + f);
const { THREE } = await use("three-vendor.js");
const K = await use("kit.js"); // a namespace: M and G are live bindings, set by makeKit
const { jet } = await use("air.js");
const { cutaway } = await use("cutaway.js");
const { grains, presets } = await use("grains.js");
const { phrases, drawCaption, pinLabel, rangeBar, repeats, safeArea, inkFor, readTime, layoutFrame, textBand, recordBox } = await use("type.js");
const { stations, frame, travel, route, loopEnd, fovFromMm, dofFor, orbit, crane, dollyZoom, drone, place: placeCamera, heroBox, ISO, isoCamera, isoFrame, attend, snap, shotAt, overlayWindow, windowProblems } = await use("camera.js");
const { scaleAudit, zFight } = await use("audit.js");
const { studio, aoFor, fitShadow, LOOKS, PRESETS, ISO_TONES, isoMatcap, isoTone, isoLook, isoStudio, blueprintLook, inkLines } = await use("studio.js");
const { flowArrow, tileFill, dimension } = await use("quantity.js");
const { wire, flow, glow, lamp, arc, blackbody, DRAPER, LAMPS } = await use("circuit.js");
const { scope, meter, gauge, bar: barMeter } = await use("instruments.js");
const { shots, cueTime } = await use("shots.js");
const FLD = await use("fields.js");
const O = await use("optics.js");
const OS = await use("objectStudio.js");
const ED = await use("editorial.js");

const scene = new THREE.Scene();
const kit = K.makeKit(scene, { mpu: 2 });
const M = K.M;
// A one-take fixture composed from camera.js and studio.js: home (the whole set, long lens) -> the subject -> the part
// inside it -> loopEnd home, attention on each beat, released before the end (look.dur over the 2.5 s tail throws).
const oneTake = ({ world, subject, inside, keep = [], aspect = 9 / 16, end = 12, azimuth = 40, look = {}, beats = {}, studio: rig } = {}) => {
  const dive = beats.dive ?? 1.5, push = beats.inside ?? 4.5, tail = 2.5, back = end - tail;
  if ((look.dur ?? 0.5) > tail) throw new Error("oneTake: look.dur " + look.dur + " s is longer than the " + tail + " s tail");
  const st = stations({ home: frame(world, { fov: 18, aspect, azimuth, elevation: 35 }), dive: frame(subject, { fov: 24, aspect, azimuth, elevation: 25 }), inside: frame(inside, { fov: 45, aspect, azimuth, elevation: 12, margin: 1.05 }) });
  const r = route(st, [{ to: "dive", start: dive, dur: 2, over: world }, { to: "inside", start: push, dur: 1.6, lift: 0 }, loopEnd(st, { end, dur: tail, over: world })]);
  const a = attend(world, { keep, ...look }).focus(subject, dive).focus(inside, push).release(back);
  const lit = rig ? studio(rig.renderer ?? null, rig.scene, rig.camera, { set: world, ...rig, route: r }) : null;
  const api = {
    stations: st, route: r, look: a, end, studio: lit,
    at(t, camera) { const p = r.at(t); if (camera) placeCamera(camera, p); a.at(t); return p; },
    render(t, camera) {
      if (!lit) throw new Error("oneTake().render(): build with { studio: { renderer, scene, camera } }");
      if (camera && camera !== lit.camera) throw new Error("oneTake().render(t, camera): the studio renders its own camera");
      const p = api.at(t, lit.camera); lit.render(t, p); return p;
    },
  };
  return api;
};
assert.equal(M, 2, "makeKit sets the scale every module reads");
const finite = (a) => Array.from(a).every(Number.isFinite);

// Air from an outlet: a round jet whose core speed falls as 1/x past ~2 diameters, and only ~15 % gets behind a thing.
const J = jet({ D: 0.4, u0: 2.5, frame: (t, o, ax) => { o.set(0, 1 / M, 0); ax.set(1, 0, 0); } }), jv = new THREE.Vector3();
const jm = (x) => { let u = 0; for (let i = 0; i < 2000; i++) u += J.wind(new THREE.Vector3(x / M, 1 / M, 0), i * 0.0137, jv).x; return (u / 2000) * M; };
assert.ok(Math.abs(jm(0.5) - 2.5) < 0.1 && Math.abs(jm(1.6) / jm(3.2) - 2) < 0.1, "jet core and 1/x decay: " + jm(0.5).toFixed(2) + ", " + (jm(1.6) / jm(3.2)).toFixed(2));
const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1 / M, 1 / M, 1 / M)); wall.position.set(1 / M, 1 / M, 0); wall.updateMatrixWorld(true);
const free = J.wind(new THREE.Vector3(2 / M, 1 / M, 0), 0.3, jv).x; J.block([wall]);
assert.ok(Math.abs(J.wind(new THREE.Vector3(2 / M, 1 / M, 0), 0.3, jv).x / free - 0.15) < 1e-6, "air does not pass through things");
// Cutaway: one plane cuts every part under the root, parts added later too, on cloned materials (a material shared
// with something outside stays whole); every cap shares one transform and is pulled forward, so none fights a face
// on the plane; a shell part's cap is its wall ring, a solid part's a disc; off and on move the plane and never swap
// the planes (a swap recompiles shaders mid-shot); a slide eases between its keys.
const cs = new THREE.Scene(), sharedMat = new THREE.MeshStandardMaterial({ color: 0x808080 });
const outside = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), sharedMat); cs.add(outside);
// The fixture: two lathed shells a and b (single surfaces flagged as shells, 0.6 mm and 0.5 mm walls, a gap between
// them), a solid ring and a solid part, in metres, scaled by 1/M; one more shell part added AFTER the cut.
const FL = (() => {
  const group = new THREE.Group(), m = kit.mat(0xc9ccce, 0.3);
  group.position.set(1, 0, 0); group.scale.setScalar(1 / M); cs.add(group);
  const lathe = (pts, shell) => { const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 64), m); if (shell) o.userData.cut = { shell }; return o; };
  const a = lathe([[0, 0], [0.036, 0], [0.038, 0.004], [0.038, 0.21], [0.03, 0.235], [0.0225, 0.245]], 0.0006);
  const b = lathe([[0, 0.012], [0.031, 0.012], [0.033, 0.016], [0.033, 0.205], [0.026, 0.228], [0.02, 0.242]], 0.0005);
  const ring = lathe([[0.02, 0.242], [0.0228, 0.242], [0.0228, 0.25], [0.02, 0.25], [0.02, 0.242]]);
  const part = lathe([[0, 0.222], [0.0185, 0.222], [0.0195, 0.252], [0.024, 0.254], [0.024, 0.266], [0, 0.266]]);
  group.add(a, b, ring, part);
  const c = cutaway(group, { normal: new THREE.Vector3(0, 0, 1), offset: 0 });
  c.add(lathe([[0.0395, 0.215], [0.041, 0.217], [0.041, 0.296], [0.039, 0.3], [0, 0.3]]), { shell: 0.0015 });
  return { group, cut: c, parts: { a, b, ring, part } };
})(), cut = FL.cut;
const late = new THREE.Group(); late.add(new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 8), sharedMat)); FL.group.add(late);
late.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), sharedMat)); // into a part that was itself added late
const cutMeshes = []; FL.group.traverse((o) => o.isMesh && !o.userData.cutaway && cutMeshes.push(o));
assert.ok(cutMeshes.length >= 7, "the fixture's parts, its late part and two late meshes: " + cutMeshes.length);
for (const o of cutMeshes) for (const m of [].concat(o.material)) assert.ok(m.clippingPlanes?.includes(cut.plane) && m.clipShadows, "every part under the root is cut: " + (o.name || o.type));
assert.ok(!sharedMat.clippingPlanes && outside.material === sharedMat, "a material shared outside the root stays whole");
cut.at(0.5);
const caps = cut.parts.map((p) => p.cap);
assert.equal(caps.length, cutMeshes.length, "every solid or shell part has a cap");
for (const p of cut.parts) {
  const c = p.cap.material;
  assert.ok(c.polygonOffset && c.polygonOffsetFactor < 0 && c.polygonOffsetUnits < 0, "a cap is pulled ahead of faces on the plane");
  assert.ok(c.stencilFunc === THREE.NotEqualStencilFunc && c.depthFunc === THREE.LessEqualDepth && p.cap.geometry === caps[0].geometry, "caps share one plane, stencil-bound");
  assert.ok(p.cap.matrixWorld.equals(caps[0].matrixWorld) && p.cap.visible, "every cap on one transform: equal depths, no fight");
  assert.ok(p.cap.renderOrder > p.back.renderOrder && !p.back.material.colorWrite && !p.front.material.depthWrite, "stencil before its cap, writing no colour or depth");
}
// A shell is a ring, a solid is a disc: from the axis, a ray crosses shell a's wall twice, 0.6 mm apart (in metres),
// and leaves the solid part once.
const crossings = (part, y) => {
  const probe = new THREE.Mesh(part.stencil, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  probe.matrixWorld.copy(part.mesh.matrixWorld);
  const hits = new THREE.Raycaster(new THREE.Vector3(1, y / M, 0), new THREE.Vector3(Math.cos(0.05), 0, Math.sin(0.05))).intersectObject(probe);
  return hits.map((h) => h.distance * M).filter((d, i, a) => i === 0 || d - a[i - 1] > 1e-7);
};
const partOf = (mesh) => cut.parts.find((p) => p.mesh === mesh);
const wallX = crossings(partOf(FL.parts.a), 0.1), plug = crossings(partOf(FL.parts.part), 0.24);
assert.ok(wallX.length === 2 && Math.abs(wallX[1] - wallX[0] - 0.0006) < 0.0001, "a shell's cap is its wall ring: " + wallX);
assert.equal(plug.length, 1, "a solid part's cap is a disc: " + plug);
assert.ok(new THREE.Raycaster(new THREE.Vector3(1, 0.1 / M, -1), new THREE.Vector3(0, 0, 1)).intersectObjects(cs.children, true).every((h) => !h.object.userData.cutaway), "caps and stencils are never hit by a ray (settle, audit)");
// Slide and switch by time; seekable.
const planes = cutMeshes[0].material.clippingPlanes;
cut.set(0.03, 2); cut.at(1);
assert.ok(Math.abs(cut.plane.constant - 0.015 / M) < 1e-9, "the cut eases between keys: " + cut.plane.constant);
cut.off(3); cut.at(3.5);
assert.ok(cut.plane.constant > 1e6 && caps.every((c) => !c.visible), "off: nothing cut, no caps");
assert.ok(cutMeshes[0].material.clippingPlanes === planes && planes.length === 1, "off never swaps the planes");
cut.at(1);
assert.ok(cut.plane.constant < 1 && caps.every((c) => c.visible), "seeking back turns it on");
// Without a stencil buffer the caps vanish silently, so ready() refuses the renderer loudly.
const gl = (stencil) => ({ localClippingEnabled: false, getContext: () => ({ getContextAttributes: () => ({ stencil }) }) });
assert.throws(() => cut.ready(gl(false)), /no stencil buffer/, "a renderer without a stencil buffer is refused");
const okGl = gl(true); cut.ready(okGl);
assert.ok(okGl.localClippingEnabled, "ready turns local clipping on");
// A part flagged to stay whole is listed, not cut; a hatch puts its texture on the caps.
const whole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), sharedMat); whole.userData.cut = false;
const hatchRoot = new THREE.Group(); hatchRoot.add(whole, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), sharedMat));
const hatched = cutaway(hatchRoot, { hatch: 0.01 }); hatchRoot.updateMatrixWorld(true); hatched.at(0);
assert.ok(hatched.uncut.includes(whole) && whole.material === sharedMat && hatched.parts.length === 1 && hatched.parts[0].cap.material.map, "cut: false stays whole; a hatch maps the caps");
// The render draws a clone of each material, so a set's later edits to its own reference (a glowing element, a fade,
// a colour change, a map swap, a shader's uniforms) are carried to the clone by at(); an edit made on mesh.material
// (the clone) is kept while the original is unchanged.
{
  const coil = new THREE.MeshStandardMaterial({ color: 0x552200 }), shader = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 1 } } }), probeMap = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const lr = new THREE.Group(), el = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), coil), pts = new THREE.Points(new THREE.BufferGeometry(), shader), fixed = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshStandardMaterial({ color: 0x00ff00 }));
  lr.add(el, pts, fixed);
  const lc = cutaway(lr); lr.updateMatrixWorld(true); lc.at(0);
  assert.ok(el.material !== coil && el.material.clippingPlanes.includes(lc.plane), "the render draws a clone that carries the plane");
  coil.emissive.setHex(0xff4400); coil.emissiveIntensity = 2.5; coil.opacity = 0.4; coil.transparent = true; coil.map = probeMap; coil.needsUpdate = true; coil.color.setHex(0x112233);
  shader.uniforms.uScale.value = 7;
  lc.at(1);
  const live = el.material;
  assert.ok(live.emissiveIntensity === 2.5 && live.emissive.getHex() === 0xff4400 && live.opacity === 0.4 && live.transparent && live.color.getHex() === 0x112233, "later edits to the set's own material reach the part (glow, fade, colour)");
  assert.ok(live.map === probeMap, "a map swap reaches the part");
  assert.equal(lc.parts.find((p) => p.mesh === el).cap.material.color.getHex(), new THREE.Color(0x112233).multiplyScalar(0.8).getHex(), "the cap follows the part's colour");
  assert.ok(pts.material.uniforms.uScale.value === 7, "a shader's uniforms are shared: an update on the original reaches the part");
  assert.ok(live.clippingPlanes.includes(lc.plane) && live.clipShadows, "the carried clone is still cut");
  live.emissiveIntensity = 9; lc.at(2);
  assert.equal(el.material.emissiveIntensity, 9, "an edit made on mesh.material is kept when the original did not change");
  coil.emissiveIntensity = 0.5; lc.at(3);
  assert.equal(el.material.emissiveIntensity, 0.5, "the original changing again wins again");
  assert.equal(fixed.material.color.getHex(), 0x00ff00, "an untouched material keeps its own colour");
}
// A texture swap on the set's material points the clone at the new texture: the clone shares the old texture with the
// original and with every material outside the root, so the old one is never written into (a copy would overwrite its
// source in place); a swap back restores it; value properties (colour, vector) are still copied into the clone's own.
{
  const px = (v) => new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1);
  const texOff = px(0), texOn = px(255), texEm = px(10), texEmOn = px(200);
  const screen = new THREE.MeshStandardMaterial({ map: texOff, emissiveMap: texEm }), outside = new THREE.MeshStandardMaterial({ map: texOff, emissiveMap: texEm });
  const sr = new THREE.Group(), sm = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), screen); sr.add(sm);
  const sc = cutaway(sr); sr.updateMatrixWorld(true); sc.at(0);
  screen.map = texOn; screen.emissiveMap = texEmOn; screen.normalScale.set(3, 4); sc.at(1);
  assert.ok(sm.material.map === texOn && sm.material.emissiveMap === texEmOn, "a texture swap points the clone at the new texture");
  assert.ok(texOff.image.data[0] === 0 && texEm.image.data[0] === 10 && outside.map === texOff && outside.map.image.data[0] === 0, "the old texture, shared with materials outside the root, is never written into");
  assert.ok(sm.material.normalScale.x === 3 && sm.material.normalScale.y === 4 && sm.material.normalScale !== screen.normalScale, "a vector property is copied into the clone's own object");
  screen.map = texOff; screen.emissiveMap = texEm; sc.at(2);
  assert.ok(sm.material.map === texOff && sm.material.emissiveMap === texEm && texOn.image.data[0] === 255 && texEmOn.image.data[0] === 200, "a swap back restores the old texture and leaves the other one whole");
  screen.map = null; sc.at(3);
  assert.ok(sm.material.map === null, "a map removed on the original is removed on the clone");
}
// A custom key on the set's material (a preset colour an onBeforeCompile hook reads) is not one three's clone copies:
// the clone gets its own copy from the start, and a preset swapped in later is never written into when it is swapped
// out again; an in-place edit of the current preset still reaches the part.
{
  const presetA = new THREE.Color(0xff0000), presetB = new THREE.Color(0x0000ff), presetC = new THREE.Color(0x00ff00);
  const glow = new THREE.MeshStandardMaterial(); glow.glowTint = presetA; glow.glowAt = new THREE.Vector2(1, 2);
  const gr = new THREE.Group(), gm = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), glow); gr.add(gm);
  const gc = cutaway(gr); gr.updateMatrixWorld(true); gc.at(0);
  assert.ok(gm.material.glowTint?.getHex() === 0xff0000 && gm.material.glowTint !== presetA && gm.material.glowAt?.x === 1 && gm.material.glowAt !== glow.glowAt, "a custom key set before the cut is on the clone, as its own copy");
  glow.glowTint = presetB; gc.at(1);
  assert.ok(gm.material.glowTint.getHex() === 0x0000ff && gm.material.glowTint !== presetB && presetA.getHex() === 0xff0000, "a preset swapped in reaches the part as the clone's own copy");
  glow.glowTint = presetC; gc.at(2);
  assert.ok(presetB.getHex() === 0x0000ff && presetA.getHex() === 0xff0000 && gm.material.glowTint.getHex() === 0x00ff00, "a preset swapped out is never written into");
  presetC.setHex(0x123456); gc.at(3);
  assert.equal(gm.material.glowTint.getHex(), 0x123456, "an in-place edit of the current preset reaches the part");
}
// The class rule: sync never writes into an object the clone holds, it only points the clone's key at a value (a value
// object as its own fresh copy, anything else by reference). Shared colours, vectors and textures are swapped between
// keys and materials over many frames; none of them ever changes, and the part always shows the original's values.
{
  const pool = [new THREE.Color(0x101010), new THREE.Color(0x808080), new THREE.Color(0xf0f0f0)], vecs = [new THREE.Vector2(1, 1), new THREE.Vector2(2, 3)], texs = [0, 90, 200].map((v) => new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1));
  const state = () => [...pool.map((c) => c.getHex()), ...vecs.map((v) => v.toArray().join()), ...texs.map((t) => t.image.data[0])].join("|"), before = state();
  const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  a.tint = pool[0]; b.tint = pool[1]; a.at2 = vecs[0];
  const cr = new THREE.Group(), ma = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), a), mb = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), b); cr.add(ma, mb);
  const cc = cutaway(cr); cr.updateMatrixWorld(true); cc.at(0);
  for (let f = 1; f <= 12; f++) {
    const m = f % 2 ? a : b, c = pool[f % 3], v = vecs[f % 2], t = texs[f % 3];
    m.tint = c; m.at2 = v; m.map = t; m.emissiveMap = texs[(f + 1) % 3];
    cc.at(f);
    assert.equal(state(), before, `frame ${f}: no shared colour, vector or texture is written into`);
    const live = (m === a ? ma : mb).material;
    assert.ok(live.tint.getHex() === c.getHex() && live.at2.equals(v) && live.map === t && live.emissiveMap === m.emissiveMap, `frame ${f}: the part shows the original's values`);
    for (const k of ["tint", "at2", "color", "emissive", "normalScale"]) assert.ok(!(pool.includes(live[k]) || vecs.includes(live[k]) || live[k] === m[k]), `frame ${f}: the clone's ${k} is its own object`);
  }
}
// The cap group is never under the root, also when at() runs before the root is in the scene (a pose or preview):
// it joins the scene once the root has one, follows the root to another scene, and the assembly's size stays its own.
{
  const pr = new THREE.Group(); pr.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial()));
  const pc = cutaway(pr); pr.updateMatrixWorld(true);
  const isUnder = (o, a) => { for (let x = o; x; x = x.parent) if (x === a) return true; return false; };
  pc.at(0);
  assert.ok(!isUnder(pc.group, pr), "before the root is in a scene the cap group is not put under it");
  const size = new THREE.Box3().setFromObject(pr).getSize(new THREE.Vector3());
  const ps = new THREE.Scene(); ps.add(pr); pc.at(1);
  assert.ok(pc.group.parent === ps && !isUnder(pc.group, pr), "once the root is in a scene the group joins the scene");
  assert.ok(new THREE.Box3().setFromObject(pr).getSize(new THREE.Vector3()).equals(size), "the assembly's size is not the caps'");
  const ps2 = new THREE.Scene(); ps2.add(pr); pc.at(2);
  assert.ok(pc.group.parent === ps2, "the group follows the root to another scene");
  const whole2 = new THREE.Scene(); whole2.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial()));
  const wc = cutaway(whole2); whole2.updateMatrixWorld(true); wc.at(0);
  assert.ok(wc.group.parent === whole2 && wc.parts[0].cap.visible, "a root that is the scene itself keeps its caps in it");
}
// Grains: a bulk of small things shows separate grains at real size, in layers, on its top and at its cut; none on
// the removed side, none stacked into one blob, the same twice; a canister's fill stays whole under its cutaway.
const gcut = { normal: new THREE.Vector3(0, 0, 1), offset: 0 };
const gr0 = grains(kit, { preset: "lentil", at: new THREE.Vector3(), radius: 0.05, height: 0.08, cut: gcut });
const L0 = presets.lentil, s0 = 0.92 * Math.sqrt(L0.l * L0.w), want = (2 * Math.PI * 0.05 ** 2 / 2) / s0 ** 2;
assert.ok(Math.abs(gr0.counts.top - want) / want < 0.35, "two layers over the half disc: " + gr0.counts.top + " of ~" + want.toFixed(0));
assert.ok(gr0.counts.face > 50, "the cut face shows whole grains: " + gr0.counts.face);
assert.equal(gr0.mesh.count, gr0.counts.top + gr0.counts.face, "one instance per grain");
gr0.mesh.geometry.computeBoundingBox();
{
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), top = [], bb = gr0.mesh.geometry.boundingBox;
  for (let i = 0; i < gr0.mesh.count; i++) {
    gr0.mesh.getMatrixAt(i, m4); m4.decompose(p, q, sc);
    assert.ok(finite(p.toArray()) && finite(sc.toArray()) && finite(q.toArray()), "grain " + i + " has NaN");
    assert.ok(p.z <= 0.3 * L0.t + 1e-6, "no grain on the removed side: z = " + (p.z * 1000).toFixed(2) + " mm");
    assert.ok(Math.hypot(p.x, p.z) <= 0.05 && p.y <= 0.08 + 1e-6 && p.y >= 0, "grain inside the container: " + p.toArray());
    const len = (bb.max.x - bb.min.x) * sc.x;
    assert.ok(Math.abs(len / L0.l - 1) < 0.15, "a lentil grain is 5 mm long: " + (len * 1000).toFixed(2) + " mm");
    if (i < gr0.counts.top) top.push(p.clone());
  }
  let near = Infinity; // grains of one layer never stack into one blob
  for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) if (Math.abs(top[a].y - top[b].y) < 1e-9) near = Math.min(near, Math.hypot(top[a].x - top[b].x, top[a].z - top[b].z));
  assert.ok(near >= 0.25 * s0, "grains of a layer stay apart: closest " + (near * 1000).toFixed(2) + " mm");
  assert.equal(new Set(top.map((v) => v.y.toFixed(9))).size, 2, "two jittered layers");
}
const gr1 = grains(kit, { preset: "lentil", at: new THREE.Vector3(), radius: 0.05, height: 0.08, cut: gcut });
assert.deepEqual(Array.from(gr1.mesh.instanceMatrix.array), Array.from(gr0.mesh.instanceMatrix.array), "grains are the same every build");
assert.ok(gr0.body.userData.cut === false && gr0.mesh.userData.cut === false, "a fill built already cut is not clipped again");
assert.ok(grains(kit, { preset: "coffee", at: new THREE.Vector3(), width: 0.1, depth: 0.08, height: 0.05 }).counts.face === 0, "no cut, no cut face");
const sugar = grains(kit, { preset: "sugar", at: new THREE.Vector3(), radius: 0.05, height: 0.05, instances: false });
assert.ok(!sugar.mesh && sugar.body && sugar.counts.top === 0, "grains too small to see are the body alone");
// A fixture container: an open lathed wall (a thin shell) and a base in metres, a grains() fill nested in it, and one
// cutaway() driving wall and fill (the pattern grains.js documents for nesting a fill in a group modelled in metres).
const makeCanister = (k, { at, height = 0.16, radius = 0.055, fill = "coffee", level = 0.75, cut } = {}) => {
  const group = new THREE.Group(), m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  group.position.copy(at); group.scale.setScalar(1 / K.M); k.scene.add(group);
  const lathe = (pts, shell) => { const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 64), m); if (shell) o.userData.cut = { shell }; return o; };
  group.add(lathe([[radius, 0.004], [radius, height]], 0.0015), lathe([[0, 0], [radius, 0], [radius, 0.004], [0, 0.004]]));
  const f = grains(k, { preset: fill, at: new THREE.Vector3(), radius: radius - 0.0018, height: level * height, cut: cut && { normal: cut.normal ?? new THREE.Vector3(0, 0, 1), offset: cut.offset ?? 0 } });
  f.group.scale.setScalar(1); f.group.position.set(0, 0.004, 0); group.add(f.group);
  return { group, fill: f, cut: cut ? cutaway(group, { normal: new THREE.Vector3(0, 0, 1), offset: 0, ...cut }) : null };
};
const CN = makeCanister({ ...kit, scene: new THREE.Scene(), rest: (o) => o }, { at: new THREE.Vector3(), cut: {} });
CN.group.updateMatrixWorld(true); CN.cut.at(0);
assert.ok(CN.cut.uncut.includes(CN.fill.mesh) && CN.cut.parts.some((p) => p.mesh.userData.cut?.shell), "the canister's wall is cut and its grains stay whole");
{
  // The fill's cut is the cutaway's: read in WORLD space, all three components, on every frame of the timeline.
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3();
  const pts = (g, i0 = 0, i1 = g.mesh ? g.mesh.count : 0) => { g.group.updateWorldMatrix(true, false); const o = []; for (let i = i0; i < i1; i++) { g.mesh.getMatrixAt(i, m4); o.push(v3.setFromMatrixPosition(m4).applyMatrix4(g.group.matrixWorld).clone()); } return o; };
  const verts = (g) => { g.group.updateWorldMatrix(true, false); const a = g.body.geometry.attributes.position, o = []; for (let i = 0; i < a.count; i++) o.push(v3.fromBufferAttribute(a, i).applyMatrix4(g.group.matrixWorld).clone()); return o; };
  const lens = presets.lentil, cof = presets.coffee, nrm = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  // (a) a horizontal cut: the fill is levelled at the plane, its face spread over the disc, not piled on the axis.
  const gh = grains(kit, { preset: "lentil", radius: 0.05, height: 0.08, cut: { normal: new THREE.Vector3(0, 1, 0), offset: 0.03 } });
  assert.ok(gh.body && gh.mesh && gh.counts.top === 0 && gh.counts.face > 100, "a horizontal cut levels the fill at the plane, its top layers gone: " + JSON.stringify(gh.counts));
  const ph = pts(gh), fh = pts(gh, gh.counts.top);
  assert.ok(ph.every((p) => p.y * M <= 0.03 + 1e-6) && verts(gh).every((p) => p.y * M <= 0.03 + 1e-6), "nothing past a horizontal cut");
  assert.ok(Math.max(...fh.map((p) => p.x)) - Math.min(...fh.map((p) => p.x)) > 0.07 / M && Math.max(...fh.map((p) => p.z)) - Math.min(...fh.map((p) => p.z)) > 0.07 / M, "a horizontal cut face spreads over the disc, not one column");
  assert.equal(grains(kit, { preset: "lentil", radius: 0.05, height: 0.08, cut: { normal: new THREE.Vector3(0, 1, 0), offset: 0.2 } }).counts.top, grains(kit, { preset: "lentil", radius: 0.05, height: 0.08 }).counts.top, "a cut above the fill removes nothing");
  // (b) a tilted cut: the fill's cut is the wall's plane, not a vertical one.
  const tn = nrm(0, 0.5, 1), gt = grains(kit, { preset: "lentil", radius: 0.05, height: 0.08, cut: { normal: tn, offset: 0.01 } });
  assert.ok(gt.counts.top > 50 && gt.counts.face > 50, "a tilted cut keeps both: " + JSON.stringify(gt.counts));
  assert.ok(pts(gt).every((p) => tn.dot(p) * M <= 0.01 + 0.3 * lens.w + 1e-6) && verts(gt).every((p) => tn.dot(p) * M <= 0.01 + 1e-6), "nothing past a tilted cut");
  assert.ok(verts(gt).some((p) => tn.dot(p) * M > 0.01 - 0.5 * lens.t), "the body is cut at the tilted plane, not shorter");
  // (c) a rotated container: the cutaway's world plane cuts the fill too.
  const cr = makeCanister({ ...kit, scene: new THREE.Scene(), rest: (o) => o }, { at: new THREE.Vector3(), cut: {} });
  cr.group.rotation.y = Math.PI / 2; cr.group.updateMatrixWorld(true); cr.cut.at(0);
  const rn = cr.cut.plane.normal.clone().negate(), rc = cr.cut.plane.constant;
  assert.ok(cr.fill.counts.top > 50 && cr.fill.counts.face > 50, "the rotated canister keeps a cut fill: " + JSON.stringify(cr.fill.counts));
  assert.ok(pts(cr.fill).every((p) => rn.dot(p) <= rc + 0.3 * cof.w / M + 1e-6) && verts(cr.fill).every((p) => rn.dot(p) <= rc + 1e-6), "the fill is cut at the world plane of a rotated canister");
  // The timeline: off is the whole fill, on again is cut, and a slid cut moves the fill with the wall.
  const whole = grains(kit, { preset: "coffee", radius: 0.055 - 0.0018, height: 0.75 * 0.16 });
  CN.cut.off(1); CN.cut.at(1);
  assert.ok(CN.fill.counts.face === 0 && CN.fill.counts.top === whole.counts.top && pts(CN.fill).some((p) => p.z * M > 0.02), "off: the fill is whole again with the wall");
  CN.cut.on(2).set(-0.02, 3); CN.cut.at(3);
  const sn = CN.cut.plane.normal.clone().negate();
  assert.ok(CN.fill.counts.face > 20 && pts(CN.fill).every((p) => sn.dot(p) <= CN.cut.plane.constant + 0.3 * cof.w / M + 1e-6) && verts(CN.fill).every((p) => sn.dot(p) <= CN.cut.plane.constant + 1e-6), "a slid cut moves the fill with the wall");
  { const g0 = CN.fill.body.geometry, a0 = CN.fill.mesh.instanceMatrix; CN.cut.at(3); assert.ok(CN.fill.body.geometry === g0 && CN.fill.mesh.instanceMatrix === a0, "an unchanged plane does not rebuild the fill"); }
  for (const bad of [{ radius: -0.05 }, { radius: 0.05, height: -1 }, { radius: 0.05, layers: 0 }, { radius: 0.05, cut: { normal: new THREE.Vector3() } }, { radius: Infinity }]) assert.throws(() => grains(kit, { preset: "lentil", ...bad }), /grains:/, "bad input is refused: " + JSON.stringify(bad));
  assert.ok(grains(kit, { preset: "lentil", radius: 0.05, height: 0 }).body === null, "a fill of no height is empty, not an error");
  assert.ok(CN.cut.uncut.filter((o) => o === CN.fill.mesh || o === CN.fill.body).length === 2, "a rebuilt fill is the same two parts, listed once");
  // A shallow fill never sinks through the floor: every grain's lowest point is at or above y = 0.
  const low = (g, P) => { const bb = g.mesh.geometry.boundingBox || (g.mesh.geometry.computeBoundingBox(), g.mesh.geometry.boundingBox), h = [Math.max(bb.max.x, -bb.min.x), Math.max(bb.max.y, -bb.min.y), Math.max(bb.max.z, -bb.min.z)]; let lo = Infinity; for (let i = 0; i < g.mesh.count; i++) { g.mesh.getMatrixAt(i, m4); const e = m4.elements; lo = Math.min(lo, e[13] - Math.hypot(e[1] * h[0], e[5] * h[1], e[9] * h[2])); } return lo; };
  for (const [name, args] of [["coffee", { preset: "coffee", radius: 0.05, height: 0.005 }], ["shallow with a cut", { preset: "coffee", radius: 0.05, height: 0.005, cut: { normal: new THREE.Vector3(0, 0, 1), offset: 0 } }], ["a tapered bowl", { preset: "lentil", radius: 0.05, bottom: 0.03, height: 0.002 }]]) {
    const gs = grains(kit, args);
    assert.ok(gs.mesh && gs.counts.top > 0, name + ": a shallow fill still has grains");
    assert.ok(low(gs) >= -1e-9, name + ": no grain below the floor: " + (low(gs) * 1000).toFixed(2) + " mm");
  }
  const cg = makeCanister({ ...kit, scene: new THREE.Scene(), rest: (o) => o }, { at: new THREE.Vector3(), fill: "gravel", level: 0.05 });
  assert.ok(low(cg.fill) >= -1e-9, "a shallow gravel fill stays out of the base: " + (low(cg.fill) * 1000).toFixed(2) + " mm");
  assert.ok(grains(kit, { preset: "coffee", radius: 0.05, height: 0.08 }).counts.top > 100, "a deep fill is unchanged by the shallow floor");
  // The cap: past `max` the rest are dropped with a warning, and the counts follow what is built.
  const warns = [], warn0 = console.warn;
  console.warn = (m) => warns.push(String(m));
  const capA = grains(kit, { preset: "lentil", radius: 0.05, height: 0.08, cut: gcut, max: 100 });
  const capB = grains(kit, { preset: "lentil", radius: 0.05, height: 0.08, cut: gcut, max: gr0.counts.top + 10 });
  const nocap = grains(kit, { preset: "lentil", radius: 0.05, height: 0.08, cut: gcut });
  console.warn = warn0;
  assert.ok(capA.capped && capA.mesh.count === 100 && capA.counts.top === 100 && capA.counts.face === 0, "past max inside the top: only the top is kept " + JSON.stringify(capA.counts));
  assert.ok(capB.capped && capB.counts.top === gr0.counts.top && capB.counts.face === 10 && capB.mesh.count === gr0.counts.top + 10, "past max inside the face: the face is cut short " + JSON.stringify(capB.counts));
  assert.ok(warns.length === 2 && warns.every((w) => /past the cap of/.test(w)), "the cap warns once per capped build: " + warns.length);
  assert.ok(!nocap.capped && nocap.counts.face === gr0.counts.face, "under max nothing is dropped and nothing warns");
  // instances: false with a cut is the body alone, cut; with instances it still builds grains.
  const sc = grains(kit, { preset: "sugar", radius: 0.05, height: 0.05, instances: false, cut: gcut });
  assert.ok(!sc.mesh && sc.counts.top === 0 && sc.counts.face === 0 && verts(sc).every((p) => p.z * M <= 1e-6), "a cut fill without instances is a cut body");
  const sm = grains(kit, { preset: "sugar", radius: 0.005, height: 0.01 });
  assert.ok(sm.mesh && sm.counts.top > 50 && !sm.capped, "a small sugar patch builds its grains");
}
// Type: shared captions and pinned labels. phrases() splits like craft-rules §6 in several languages (CJK by
// characters) and holds each through the pause that follows; drawCaption picks its ink from the ground under its own
// box and switches the active word on its start; pinLabel keeps a label inside the safe area at every t; repeats()
// warns when a caption says what a visible label says.
{
  const strip = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const toWords = (plain, step = 0.3) => plain.split(/\s+/).filter((k) => /[\p{L}\p{N}]/u.test(k)).map((k, i) => ({ i, text: strip(k), start: +(step * i).toFixed(3), end: +(step * i + 0.25).toFixed(3) }));
  const texts = (c) => c.map((p) => p.text);
  const mockCtx = (W, H, paint, em = 0.55) => { // em: glyph advance in em (a heavy sans measures about 0.62)
    let px = 10; const log = [];
    const noop = () => {};
    const c = {
      canvas: { width: W, height: H }, log, fillStyle: "", strokeStyle: "", lineWidth: 1, lineJoin: "", textAlign: "", textBaseline: "",
      get font() { return this._f; }, set font(v) { this._f = v; px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(v)[1]); },
      measureText: (s) => ({ width: [...s].length * em * px }),
      getImageData(x, y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const [r, g, b] = paint(x + i, y + j), o = (j * w + i) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; }
        return { width: w, height: h, data };
      },
      fillText(s, x, y) { log.push({ s, x, y, fill: c.fillStyle, w: [...s].length * em * px, px }); },
      roundRect(...r) { log.push({ rect: r, fill: c.fillStyle }); }, rect(...r) { log.push({ rect: r, fill: c.fillStyle }); }, fillRect(...r) { log.push({ rect: r, fill: c.fillStyle }); },
    };
    for (const k of ["save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "stroke", "strokeText", "arc", "fill", "clip", "setLineDash"]) c[k] = noop;
    return c;
  };
  const gray = () => [128, 128, 128];

  // English: sentence ends, a comma after 4 words, a colon after 5, a run of 8 balanced 4 + 4 (no 7 + 1 orphan); markup is not text.
  const en = "Water boils at a lower temperature up high. The air is thinner, so the bubbles form sooner: about three minutes earlier in total.";
  const enWords = toWords(en), enNarr = "# Opening\nWater boils at a lower temperature up high. {The air is thinner|thin}, so the bubbles form sooner: about three minutes earlier in total.\n";
  const caps = phrases(enNarr, enWords);
  assert.deepEqual(texts(caps), ["Water boils at a", "lower temperature up high.", "The air is thinner,", "so the bubbles form sooner:", "about three minutes earlier in total."], "English splits");
  for (let i = 0; i + 1 < caps.length; i++) assert.equal(caps[i].end, caps[i + 1].start, "a phrase stays up through the pause that follows");
  assert.equal(caps[0].start, enWords[0].start, "the first phrase starts on its first word");
  assert.ok(Math.abs(caps[4].end - (enWords[enWords.length - 1].end + 0.5)) < 1e-9, "the last phrase is held 0.5 s past its last word");
  assert.equal(caps[0].words.length, 4, "a phrase carries its words");
  assert.ok(caps.every((p) => p.words.length <= 7), "at most 7 words");
  // Spanish: accents, a comma after 1 word is no break, a run of 8 balanced.
  const es = "Sí, claro. La presión baja y el agua hierve antes, más o menos a noventa grados.";
  assert.deepEqual(texts(phrases(es, toWords(es))), ["Sí, claro.", "La presión baja y", "el agua hierve antes,", "más o menos a noventa grados."], "Spanish splits");
  // A long run with no full pause splits at the speaker's longest breath (a clause edge), not at an even word count.
  const br = "Without air nothing touches the wall and nothing carries the heat out.";
  const brWords = toWords(br).map((w) => ({ ...w })); // then open a 0.2 s breath after "wall" (word 5)
  for (let i = 6; i < brWords.length; i++) { brWords[i].start += 0.2; brWords[i].end += 0.2; }
  assert.deepEqual(texts(phrases(br, brWords)), ["Without air nothing touches the wall", "and nothing carries the heat out."], "a breath, not a word count, decides the split");
  // Ellipsis and a token of punctuation only; dialogue lines lose their speaker.
  const dl = phrases("A: Wait ... then it boils.\nB: Yes.", toWords("Wait then it boils. Yes."));
  assert.deepEqual(texts(dl), ["Wait ...", "then it boils.", "Yes."], "ellipsis breaks, the speaker label is not caption text");
  // Japanese: one words.json word, split by characters, 16 at most; 25 characters balance to 13 + 12.
  const ja = "標高が高いと、水は低い温度で沸騰します。気圧が下がるからです。", jw = [{ i: 0, text: strip(ja), start: 0, end: 6 }];
  const jp = phrases(ja, jw);
  assert.deepEqual(texts(jp), ["標高が高いと、", "水は低い温度で沸騰します。", "気圧が下がるからです。"], "Japanese splits by characters");
  assert.ok(jp.every((p, k) => p.start >= 0 && p.start <= 6 && (k === 0 || p.start > jp[k - 1].start)), "Japanese times are interpolated inside the word and increase");
  const kana = "あいうえおかきくけこさしすせそたちつてとなにぬねの。", kp = phrases(kana, [{ i: 0, text: strip(kana), start: 0, end: 5 }]);
  assert.deepEqual(kp.map((p) => [...p.text.replace("。", "")].length), [13, 12], "25 characters balance to 13 + 12");
  // Speech pauses: a run longer than 7 words breaks at the pause of words.json (craft-rules §6), not by count; a pause
  // inside a short sentence, or one below 0.3 s, breaks nothing; with no pause the run is balanced as before.
  const eight = "one two three four five six seven eight", ew = toWords(eight).map((w, i) => (i >= 6 ? { ...w, start: +(w.start + 1).toFixed(3), end: +(w.end + 1).toFixed(3) } : w));
  assert.deepEqual(texts(phrases(eight, ew)), ["one two three four five six", "seven eight"], "a long run breaks at its pause: 6 + 2");
  assert.deepEqual(texts(phrases(eight, toWords(eight))), ["one two three four", "five six seven eight"], "no pause: balanced 4 + 4");
  assert.deepEqual(texts(phrases(eight, toWords(eight).map((w, i) => (i >= 6 ? { ...w, start: w.start + 0.2, end: w.end + 0.2 } : w)))), ["one two three four five six", "seven eight"], "a breath (0.12-0.3 s) decides the split when there is no full pause");
  assert.deepEqual(texts(phrases(eight, toWords(eight).map((w, i) => (i >= 6 ? { ...w, start: w.start + 0.05, end: w.end + 0.05 } : w)))), ["one two three four", "five six seven eight"], "a gap under a breath is not one: balanced");
  const six = "one two three four five six", sw = toWords(six).map((w, i) => (i >= 3 ? { ...w, start: w.start + 1, end: w.end + 1 } : w));
  assert.deepEqual(texts(phrases(six, sw)), [six], "a pause inside a short sentence breaks nothing");
  const ten = "one two three four five six seven eight nine ten", shift = (i) => (i >= 1 ? 0.6 : 0) + (i >= 5 ? 1.2 : 0), tw = toWords(ten).map((w, i) => ({ ...w, start: +(w.start + shift(i)).toFixed(3), end: +(w.end + shift(i)).toFixed(3) }));
  assert.deepEqual(texts(phrases(ten, tw)), ["one two three four five", "six seven eight nine ten"], "the longest pause wins; a one-word orphan is never cut off");
  // A line of the narration is a boundary: a line without final punctuation, and a speaker change, never run on.
  assert.deepEqual(texts(phrases("A: Hello there\nB: Yes indeed", toWords("Hello there Yes indeed"))), ["Hello there", "Yes indeed"], "a caption never carries two speakers");
  assert.deepEqual(texts(phrases("first line no stop\n\n# Next\nsecond line here", toWords("first line no stop second line here"))), ["first line no stop", "second line here"], "a line end is a phrase end in a plain narration too");
  assert.deepEqual(texts(phrases("one two\n(1.5)\nthree four five", toWords("one two three four five"))), ["one two", "three four five"], "a pause line is a boundary");
  assert.deepEqual(texts(phrases("A: Yes.\nB: No.", toWords("Yes. No."))), ["Yes.", "No."], "lines that end in a full stop split as before");
  assert.deepEqual(texts(phrases("日本語です\nもう一行", [{ i: 0, text: "日本語です", start: 0, end: 1 }, { i: 1, text: "もう一行", start: 1.2, end: 2 }])), ["日本語です", "もう一行"], "CJK lines are boundaries too");
  // A narration from another take is refused, never mis-timed.
  assert.throws(() => phrases(enNarr, enWords.map((w, i) => (i === 5 ? { ...w, text: "other" } : w))), /narration word 5/, "a different word is refused");
  assert.throws(() => phrases(enNarr, enWords.slice(1)), /narration word/, "a different word count is refused");

  // The CLI writes captions.json and captions.js from the same call; a narration of another take exits 1, no arguments 2.
  {
    const cli = fileURLToPath(new URL("../../scripts/captions.mjs", import.meta.url)), tmp = mkdtempSync(join(tmpdir(), "captions-"));
    try {
      writeFileSync(join(tmp, "narration.txt"), enNarr); writeFileSync(join(tmp, "words.json"), JSON.stringify(enWords));
      const ok = spawnSync(process.execPath, [cli, join(tmp, "narration.txt"), join(tmp, "words.json")], { encoding: "utf8" });
      assert.equal(ok.status, 0, "captions.mjs runs: " + ok.stderr);
      const js = readFileSync(join(tmp, "captions.js"), "utf8");
      assert.ok(js.startsWith("// Generated") && js.includes("window.CAPTIONS = "), "captions.js sets window.CAPTIONS");
      assert.deepEqual(texts(JSON.parse(readFileSync(join(tmp, "captions.json"), "utf8")).phrases), texts(caps), "the CLI writes what phrases() returns");
      writeFileSync(join(tmp, "other.txt"), "Another take entirely.");
      assert.equal(spawnSync(process.execPath, [cli, join(tmp, "other.txt"), join(tmp, "words.json")], { encoding: "utf8" }).status, 1, "another take's narration exits 1");
      assert.equal(spawnSync(process.execPath, [cli], { encoding: "utf8" }).status, 2, "no arguments exits 2");
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  // Ink follows the ground under the caption's own box.
  const W = 1080, H = 1920, area = safeArea("shorts", W, H), t0 = caps[4].start;
  assert.equal(inkFor(0), "light", "light ink on black"); assert.equal(inkFor(1), "dark", "dark ink on white");
  let c1 = mockCtx(W, H, () => [0, 0, 0]), r = drawCaption(c1, t0, caps);
  assert.equal(r.ink, "light", "dark box, light ink"); assert.ok(c1.log.filter((l) => l.s).every((l) => l.fill === "#ffffff"), "light ink is drawn");
  c1 = mockCtx(W, H, () => [255, 255, 255]); r = drawCaption(c1, t0, caps);
  assert.equal(r.ink, "dark", "light box, dark ink"); assert.ok(c1.log.filter((l) => l.s).every((l) => l.fill === "#111111"), "dark ink is drawn");
  const inCap = (x, y) => x >= area.caption.x0 && x < area.caption.x1 && y >= area.caption.y0 && y < area.caption.y1;
  assert.equal(drawCaption(mockCtx(W, H, (x, y) => (inCap(x, y) ? [0, 0, 0] : [255, 255, 255])), t0, caps).ink, "light", "dark only under the box: the ink reads the box, not the frame");
  assert.equal(drawCaption(mockCtx(W, H, (x, y) => (inCap(x, y) ? [255, 255, 255] : [0, 0, 0])), t0, caps).ink, "dark", "light only under the box: dark ink");
  // Safe zone and size.
  assert.ok(r.box.x0 >= 0.06 * W - 1e-6 && r.box.x1 <= 950 + 1e-6 && r.box.y1 <= 1330 + 1e-6 && r.box.y0 >= area.caption.y0 - 1e-6, "the caption stays inside its safe zone: " + JSON.stringify(r.box));
  assert.ok(r.size >= 54 && r.size <= 64, "caption size 54-64 px at 1080 wide: " + r.size);
  // Caption target position: the lower third on 9:16 Reels/TikTok, as low as the band allows on Shorts.
  const ra = safeArea("reels", W, H), sa = safeArea("shorts", W, H);
  assert.ok(ra.caption.y0 >= 0.72 * H - 1e-6 && ra.caption.y0 <= 0.76 * H && ra.caption.y1 <= 0.82 * H + 1e-6, "reels: the caption zone is the lower third: " + JSON.stringify(ra.caption));
  assert.ok(ra.labels.y1 <= ra.caption.y0 - 0.02 * H + 1e-6 && ra.labels.y1 > 0.5 * H, "reels: the labels stay above the caption");
  assert.ok(sa.caption.y1 <= (1330 / 1920) * H + 1e-6 && sa.caption.y1 > 0.68 * H, "shorts: the caption ends at its band end, as low as it may");
  const rd = drawCaption(mockCtx(W, H, () => [128, 128, 128]), caps[4].start, caps, { format: "reels" });
  assert.ok(rd.box.y1 <= 0.82 * H + 1e-6 && rd.box.y0 >= 0.72 * H - 1e-6, "reels: the drawn caption block sits in 72-82 %: " + JSON.stringify(rd.box));
  assert.equal(r.lines.length, 2, "a long phrase takes two lines");
  const lr = drawCaption(mockCtx(1920, 1080, gray), caps[0].start, caps, { format: "landscape" });
  assert.ok(lr.box.y0 >= 0.85 * 1080 - 1e-6 && lr.box.y1 <= 0.95 * 1080 + 1e-6, "landscape: the caption sits in the bottom 15 %: " + JSON.stringify(lr.box));
  assert.throws(() => safeArea("cinema", W, H), /shorts/, "an unknown format is refused");
  // Text outside the zone is never drawn, whatever the phrase: the drawn glyphs (not the returned box) stay in it. A real
  // 7-word Spanish phrase with 0.62 em glyphs does not fit two lines at 54 px: it shrinks to fit, and says so.
  const drawn = (c, a) => c.log.filter((l) => l.s).every((l) => l.x >= a.x0 - 1e-6 && l.x + l.w <= a.x1 + 1e-6 && l.y <= a.y1 + 1e-6 && l.y - 0.95 * l.px >= a.y0 - 1e-6);
  const spanish = "La temperatura disminuye considerablemente durante madrugadas invernales.", spCaps = phrases(spanish, toWords(spanish));
  assert.equal(spCaps.length, 1, "the Spanish phrase is one caption");
  for (const [fmt, w, h] of [["shorts", 1080, 1920], ["reels", 1080, 1920], ["feed", 1080, 1350], ["landscape", 1920, 1080]]) {
    for (const em of [0.55, 0.62, 0.75]) {
      const cs = mockCtx(w, h, gray, em), rr = drawCaption(cs, spCaps[0].start, spCaps, { format: fmt }), za = safeArea(fmt, w, h).caption;
      assert.ok(drawn(cs, za), `${fmt} em ${em}: every drawn line is inside the caption zone: ${JSON.stringify(cs.log.filter((l) => l.s).map((l) => [l.s, Math.round(l.x), Math.round(l.x + l.w)]))}`);
      assert.ok(rr.box.x0 >= za.x0 - 1e-6 && rr.box.x1 <= za.x1 + 1e-6 && rr.box.y0 >= za.y0 - 1e-6 && rr.box.y1 <= za.y1 + 1e-6, `${fmt} em ${em}: the box is the zone's`);
      assert.ok(Math.max(...cs.log.filter((l) => l.s).map((l) => l.x + l.w)) <= rr.box.x1 + 1e-6 && Math.min(...cs.log.filter((l) => l.s).map((l) => l.x)) >= rr.box.x0 - 1e-6, `${fmt} em ${em}: the returned box covers the drawn text`);
    }
  }
  const tight = mockCtx(W, H, gray, 0.62), tr = drawCaption(tight, spCaps[0].start, spCaps);
  assert.ok(tr.shrunk === true && tr.size < 54 && tr.size >= 30 && tr.lines.length === 2, "a phrase that cannot fit at 54 px shrinks, in two lines, and says so: " + tr.size);
  const lwText = "Pneumonoultramicroscopicsilicovolcanoconiosis" + "x".repeat(40), longWord = [{ text: lwText, start: 0, end: 2, words: [{ text: lwText, start: 0, end: 2, gap: true }] }];
  const lw = mockCtx(W, H, gray, 0.62); drawCaption(lw, 1, longWord);
  assert.ok(drawn(lw, area.caption), "one word wider than the zone is shrunk into it");
  const ok1 = drawCaption(mockCtx(W, H, gray, 0.55), caps[0].start, caps);
  assert.ok(ok1.shrunk === false && ok1.size >= 54, "a phrase that fits keeps its size, no shrink");
  const near = [{ text: "x", start: 0, end: 1, words: [{ text: "x", start: 0, end: 1, gap: true }] }], big = drawCaption(mockCtx(W, H, gray), 0.5, near, { size: 64 });
  assert.ok(big.size === 64 && big.box.y1 - big.box.y0 <= area.caption.y1 - area.caption.y0 + 1e-6, "an asked size of 64 px stays when it fits");
  // Active word: the accent box and dark ink move to each word on its start, within one frame.
  const hand = [{ text: "one two three", start: 1, end: 3, words: [{ text: "one", start: 1, end: 1.25 }, { text: "two", start: 1.3, end: 1.55 }, { text: "three", start: 1.6, end: 1.85 }] }];
  const dim = () => [20, 20, 20];
  const act = (t) => drawCaption(mockCtx(W, H, dim), t, hand, { accent: "#ffd400" }).active;
  assert.deepEqual([act(1), act(1.3 - 1 / 60), act(1.3), act(1.6)], [0, 0, 1, 2], "the active word switches on its start");
  const ac = mockCtx(W, H, dim); drawCaption(ac, 1.3, hand, { accent: "#ffd400" });
  assert.ok(ac.log.some((l) => l.rect && l.fill === "#ffd400"), "the active word has an accent box");
  assert.equal(ac.log.find((l) => l.s === "two").fill, "#111111", "the active word is dark on the accent");
  assert.equal(ac.log.find((l) => l.s === "one").fill, "#ffffff", "the others keep the phrase ink");
  assert.equal(drawCaption(mockCtx(W, H, gray), 0.5, hand), null, "no caption before the first phrase");
  assert.equal(drawCaption(mockCtx(W, H, gray), 3, hand), null, "no caption after the last phrase");
  // A label pinned anywhere in the frame stays inside the label safe area at every t, above the caption.
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
  const world = (nx, ny) => new THREE.Vector3(nx, ny, 0.5).unproject(cam), lab = safeArea("shorts", W, H).labels;
  assert.ok(lab.y1 <= area.caption.y0, "labels stay above the caption");
  const inside = (b, a) => b.x >= a.x0 - 1e-6 && b.x + b.w <= a.x1 + 1e-6 && b.y >= a.y0 - 1e-6 && b.y + b.h <= a.y1 + 1e-6;
  const pts = [[0.97, 0.97], [-0.97, -0.97], [0.97, -0.5], [-0.97, 0.5], [0, 0]];
  for (let t = 0; t <= 3; t += 1 / 30) pts.push([0.97 * (t / 3), 0.9 * Math.sin(t * 2)]);
  for (const [nx, ny] of pts) {
    const b = pinLabel(mockCtx(W, H, gray), { at: world(nx, ny), camera: cam, text: "valve" });
    assert.ok(b && inside(b, lab) && b.size >= 36, "label at NDC " + nx.toFixed(2) + "," + ny.toFixed(2) + " is inside the safe area: " + JSON.stringify(b));
  }
  // A long label wraps inside the label zone, at 36 px or more; one unbreakable string shrinks into it, and says so.
  const longLab = "Pressure relief valve on the boiler outlet pipe", jaLab = "圧力逃がし弁は蒸気配管の出口にあります。圧力逃がし弁は蒸気配管の出口にあります。";
  for (const [text, em] of [[longLab, 0.62], [longLab + " " + longLab, 0.62], [jaLab, 1], ["x".repeat(70), 0.62]]) for (const [nx, ny] of [[0.97, 0.9], [-0.97, 0], [0, 0]]) {
    const lc = mockCtx(W, H, gray, em), lb = pinLabel(lc, { at: world(nx, ny), camera: cam, text }), tl = lc.log.filter((l) => l.s);
    assert.ok(lb && inside(lb, lab), "a long label is inside the label zone: " + JSON.stringify(lb));
    assert.ok(tl.length === lb.lines.length && tl.every((l) => l.x >= lab.x0 - 1e-6 && l.x + l.w <= lab.x1 + 1e-6 && l.y <= lab.y1 + 1e-6 && l.y - l.px >= lab.y0 - 1e-6), "every drawn line of the label is inside the zone: " + JSON.stringify(tl.map((l) => [l.s, Math.round(l.x), Math.round(l.x + l.w)])));
  }
  const wrapped = pinLabel(mockCtx(W, H, gray, 0.62), { at: world(0, 0), camera: cam, text: longLab });
  assert.ok(wrapped.lines.length >= 2 && wrapped.size >= 36 && wrapped.shrunk === false && wrapped.lines.join(" ") === longLab, "a long label wraps at its spaces, keeps 36 px or more: " + JSON.stringify(wrapped.lines));
  const unbroken = pinLabel(mockCtx(W, H, gray, 0.62), { at: world(0, 0), camera: cam, text: "x".repeat(70) });
  assert.ok(unbroken.shrunk === true && unbroken.size < 36, "an unbreakable string shrinks below 36 px and says so: " + unbroken.size);
  const shortLab = pinLabel(mockCtx(W, H, gray, 0.62), { at: world(0, 0), camera: cam, text: "valve" });
  assert.ok(shortLab.lines.length === 1 && shortLab.lines[0] === "valve" && shortLab.shrunk === false && shortLab.size === 40, "a short label is one line at its size");
  assert.equal(pinLabel(mockCtx(W, H, gray), { at: world(0.97, 0), camera: cam, text: "valve" }).side, "left", "near the right edge the label flips left");
  assert.equal(pinLabel(mockCtx(W, H, gray), { at: world(-0.97, 0), camera: cam, text: "valve" }, { side: "left" }).side, "right", "near the left edge a left label flips right");
  assert.equal(pinLabel(mockCtx(W, H, gray), { at: world(0, 0), camera: cam, text: "valve" }).side, "right", "in the middle the asked side is kept");
  assert.equal(pinLabel(mockCtx(W, H, gray), { at: new THREE.Vector3(0, 0, 10), camera: cam, text: "valve" }), null, "a point behind the camera draws nothing");
  assert.equal(pinLabel(mockCtx(W, H, gray), { at: world(2, 0), camera: cam, text: "valve" }), null, "a point off the frame draws nothing");
  const o3 = new THREE.Object3D(); o3.position.copy(world(0.3, 0.2));
  assert.deepEqual(pinLabel(mockCtx(W, H, gray), { at: o3, camera: cam, text: "valve" }), pinLabel(mockCtx(W, H, gray), { at: world(0.3, 0.2), camera: cam, text: "valve" }), "an object pins like its world point");
  assert.equal(pinLabel(mockCtx(W, H, () => [0, 0, 0]), { at: world(0, 0), camera: cam, text: "valve" }).ink, "light", "a label over a dark ground gets light ink");
  assert.equal(pinLabel(mockCtx(W, H, () => [255, 255, 255]), { at: world(0, 0), camera: cam, text: "valve" }).ink, "dark", "a label over a light ground gets dark ink");
  // A range card fills to value / max, ticks each option's capacity, highlights the first that fits, stays in the zone.
  const RB = { max: 10, ticks: [{ at: 2.5, label: "S" }, { at: 5, label: "M" }, { at: 7, label: "L" }, { at: 10, label: "XL" }], label: "need" };
  const rb = (value, o) => rangeBar(mockCtx(W, H, gray), { ...RB, value }, o);
  const r6 = rb(6);
  assert.ok(r6.fits === 2 && Math.abs(r6.fill - 0.6 * r6.w) < 1e-9 && r6.size >= 36 && inside(r6, lab), "range card at 6 of 10: " + JSON.stringify(r6));
  assert.ok(Math.abs(r6.ticks[2].x - (r6.x + 0.7 * r6.w)) < 1e-9 && r6.ticks[2].fits, "a tick sits at its capacity");
  const r11 = rb(11), rneg = rb(-2);
  assert.ok(r11.fill === r11.w && r11.fits === -1, "over the max: full bar, no option fits");
  assert.ok(rneg.fill === 0 && rneg.fits === 0, "under zero: empty bar, the smallest fits");
  assert.ok(inside(rb(6, { x: W, y: H }), lab), "a card asked off the zone is kept inside it");
  assert.equal(rb(6, { highlight: 3 }).fits, 3, "an explicit highlight wins");
  const rc = mockCtx(W, H, gray), rr = rangeBar(rc, { ...RB, value: 6 });
  assert.ok(rc.log.some((l) => l.rect && Math.abs(l.rect[2] - rr.fill) < 1e-9), "the fill is drawn at its width");
  for (const bad of [0, -1, NaN, "10"]) assert.throws(() => rangeBar(mockCtx(W, H, gray), { ...RB, max: bad, value: 1 }), /max/);
  assert.throws(() => rangeBar(mockCtx(W, H, gray), { ...RB, value: NaN }), /value/);
  // A caption that says what a label says is a warning; a word of it, or a label shown at another time, is not.
  assert.equal(repeats(caps, [{ text: "The air is thinner" }]).length, 1, "an equal label repeats");
  assert.match(repeats(caps, [{ text: "The air is thinner" }])[0], /repeats the label/, "the warning says so");
  assert.equal(repeats(caps, [{ text: "air" }]).length, 0, "one word of a phrase is not a repeat");
  assert.equal(repeats(caps, [{ text: "air is", from: 0, to: 100 }]).length, 1, "a label inside a phrase repeats");
  assert.equal(repeats(caps, [{ text: "The air is thinner", from: 100, to: 110 }]).length, 0, "the same words at another time are not a repeat");
  // layoutFrame hands out the boxes drawn since its last call, for review/strips and scripts/layout_lint.mjs.
  layoutFrame(mockCtx(W, H, gray), 0, { send() {} }); // clears what the checks above drew
  {
    const lc = mockCtx(W, H, gray), tc = caps[0].start;
    const dc = drawCaption(lc, tc, caps), dl = pinLabel(lc, { at: world(0.3, 0.2), camera: cam, text: "valve" }), dr = rangeBar(lc, { ...RB, value: 6 });
    let sent = null;
    const rec = layoutFrame(lc, tc, { format: "shorts", hero: { x0: 1, y0: 2, x1: 3, y1: 4 }, send: (s) => { sent = s; } });
    assert.deepEqual(rec.boxes.map((b) => b.kind), ["caption", "label", "card"], "the boxes in drawing order, by kind");
    const near = (b, e, what) => { for (const k of ["x0", "y0", "x1", "y1"]) assert.ok(Math.abs(b[k] - e[k]) < 0.051, what + " " + k + ": " + b[k] + " vs " + e[k]); };
    near(rec.boxes[0], dc.box, "caption box"); near(rec.boxes[1], { x0: dl.x, y0: dl.y, x1: dl.x + dl.w, y1: dl.y + dl.h }, "label box"); near(rec.boxes[2], { x0: dr.x, y0: dr.y, x1: dr.x + dr.w, y1: dr.y + dr.h }, "card box");
    assert.deepEqual(rec.boxes.map((b) => b.text), [caps[0].text, "valve", "need"], "the text of each box");
    assert.ok(Math.abs(rec.boxes[0].size - dc.size) < 0.051 && Math.abs(rec.boxes[1].size - dl.size) < 0.051 && Math.abs(rec.boxes[2].size - dr.size) < 0.051, "the size of each box");
    assert.ok(rec.t === tc && rec.W === W && rec.H === H && rec.format === "shorts", "the record carries t, size and format");
    assert.deepEqual(rec.hero, { x0: 1, y0: 2, x1: 3, y1: 4 }, "the hero box is carried as given");
    assert.deepEqual(JSON.parse(sent), rec, "send gets the record as JSON");
    assert.equal(globalThis.__dalangLayout, rec, "the last record is on globalThis for a page reader");
    const next = layoutFrame(lc, tc + 1, { send() {} });
    assert.deepEqual(next.boxes, [], "each frame starts empty: the boxes are handed out once");
    assert.ok(!("hero" in next), "no hero given: no hero key (the lint says overlap is not checked)");
    assert.equal(layoutFrame(lc, tc, { hero: null, send() {} }).hero, null, "a hero off the frame is null, not absent");
  }
  // heroBox: the object's bounding box on screen, clamped to the frame; null when not on screen; clipped when part of it is behind the camera.
  {
    const hb = (x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); m.position.set(x, 0, z); m.updateMatrixWorld(true); return heroBox(cam, m, W, H); };
    const mid = hb(0, 0);
    assert.ok(mid && mid.x0 < W / 2 && mid.x1 > W / 2 && mid.y0 < H / 2 && mid.y1 > H / 2, "a box at the target contains the frame centre: " + JSON.stringify(mid));
    assert.ok(Math.abs((mid.x0 + mid.x1) / 2 - W / 2) < 1 && Math.abs((mid.y0 + mid.y1) / 2 - H / 2) < 1 && !("clipped" in mid), "centred, not clipped");
    assert.ok(Math.abs((mid.x1 - mid.x0) - (mid.y1 - mid.y0)) < 2 && mid.x1 - mid.x0 > 100 && mid.x1 - mid.x0 < W, "a cube is as wide as tall on a square-pixel frame, in px");
    assert.equal(hb(0, 10), null, "behind the camera: null");
    assert.equal(hb(50, 0), null, "off the frame: null");
    assert.equal(hb(0, 4.8).clipped, true, "a corner behind the camera: clipped (a lower bound)");
    assert.equal(heroBox(cam, new THREE.Group(), W, H), null, "an empty object: null");
  }
}
// Camera stations, attention by ghosting, loop end: one world, one camera, no cut. A small set in metres (a kept base,
// a group with a shell and a core, a second box sharing the shell's material), run at M = 2.
{
  const build = () => {
    const world = new THREE.Scene(), shared = new THREE.MeshStandardMaterial({ color: 0xc08040, roughness: 0.6 });
    const part = (w, h, d, m, name, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), m); o.name = name; o.position.set(x / M, y / M, z / M); return o; };
    const base = part(1, 0.02, 0.6, new THREE.MeshStandardMaterial({ color: 0x777777 }), "base", 0, -0.01, 0);
    const A = new THREE.Group(); A.name = "A";
    const shell = part(0.3, 0.3, 0.3, shared, "shell", 0, 0.15, 0), core = part(0.08, 0.08, 0.08, new THREE.MeshStandardMaterial({ color: 0xd04030 }), "core", 0, 0.15, 0);
    A.add(shell, core);
    const B = part(0.2, 0.2, 0.2, shared, "B", 0.5, 0.1, 0);
    world.add(base, A, B); world.updateMatrixWorld(true);
    return { world, base, A, shell, core, B, shared };
  };
  const { world, base, A, shell, core, B, shared } = build();
  const meshes = []; world.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const snap = meshes.map((m) => ({ m, mat: m.material, hex: m.material.color.getHex(), op: m.material.opacity, tr: m.material.transparent, dw: m.material.depthWrite }));
  const untouched = (what) => { for (const s of snap) assert.ok(s.mat.color.getHex() === s.hex && s.mat.opacity === s.op && s.mat.transparent === s.tr && s.mat.depthWrite === s.dw, what + ": " + s.m.name + "'s original material was written"); };
  const pose = (p) => [...p.position.toArray(), ...p.target.toArray(), p.fov];
  const near = (a, b, e, what) => { for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= e, what + " [" + i + "]: " + a[i] + " vs " + b[i]); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // Determinism: the same t gives the same pose, from anywhere.
  const sa = { position: V(-1, 0.05, 1), target: V(0, 0, 0), fov: 30 }, sb = { position: V(1, 0.05, 1), target: V(0, 0.2, 0), fov: 50 };
  near(pose(travel(1.3, sa, sb, { start: 1, dur: 2 })), pose(travel(1.3, sa, sb, { start: 1, dur: 2 })), 0, "travel is a function of t");

  // Lens and moves: focal length to fov, f-stop to depth of field, and the four moves as pure functions of t.
  assert.ok(Math.abs(fovFromMm(50) - 27.0) < 0.05 && fovFromMm(24) > fovFromMm(85), "fovFromMm: 50 mm is 27 deg, a wider lens sees more");
  assert.throws(() => fovFromMm(0), /focal length/, "fovFromMm refuses a non-positive mm");
  const wideOpen = dofFor({ mm: 85, fstop: 1.2, focusM: 3 }), stopped = dofFor({ mm: 85, fstop: 5.6, focusM: 3 }), longer = dofFor({ mm: 135, fstop: 1.2, focusM: 3 });
  assert.ok(wideOpen.bokehScale > stopped.bokehScale && wideOpen.focusRange < stopped.focusRange, "dofFor: f/1.2 blurs more and focuses shallower than f/5.6");
  assert.ok(longer.bokehScale > wideOpen.bokehScale && longer.focusRange < wideOpen.focusRange, "dofFor: a longer lens is shallower too");
  // the depth of field in metres, as a lens chart gives it: 50 mm f/1.8 at 3 m keeps ~0.39 m sharp, 100 mm f/2.8 at 0.5 m ~4 mm
  // (a range 1000 x too small blurred every close-up whole)
  assert.ok(Math.abs(dofFor({ mm: 50, fstop: 1.8, focusM: 3 }).focusRange - 0.389) < 0.01 && Math.abs(dofFor({ mm: 100, fstop: 2.8, focusM: 0.5 }).focusRange - 0.0042) < 0.0005, "dofFor: focusRange is the real depth of field in metres");
  assert.throws(() => dofFor({ mm: 50, fstop: 0, focusM: 3 }), /fstop/, "dofFor refuses f/0");
  {
    const C = V(1, 0.5, -2), ts = [0, 1, 2.2, 3.1, 4], el = (p, c) => Math.asin((p.y - c.y) / p.distanceTo(c)) / (Math.PI / 180);
    const sameAs = (a, b) => a.position.equals(b.position) && a.target.equals(b.target) && a.fov === b.fov;
    const o = (t) => orbit(t, { center: C, radius: 5, from: 0, to: 270, elevation: 25, start: 0, dur: 4 });
    for (const t of ts) {
      const p = o(t);
      assert.ok(Math.abs(p.position.distanceTo(C) - 5) < 1e-9 && p.target.distanceTo(C) === 0 && Math.abs(el(p.position, C) - 25) < 1e-9, "orbit: constant distance and elevation, aimed at the centre (t = " + t + ")");
      assert.ok(sameAs(p, o(t)), "orbit is a function of t");
    }
    const cr = (t) => crane(t, { target: C, from: 10, to: 60, distance: 6, azimuth: 30, start: 0, dur: 4 }), els = ts.map((t) => el(cr(t).position, C));
    assert.ok(ts.every((t) => Math.abs(cr(t).position.distanceTo(C) - 6) < 1e-9 && sameAs(cr(t), cr(t))) && els.every((e, i) => i === 0 || e > els[i - 1]) && Math.abs(els[0] - 10) < 1e-9 && Math.abs(els[4] - 60) < 1e-9, "crane: constant distance, elevation 10 -> 60 monotonic");
    const dz = (t) => dollyZoom(t, { target: C, subjectSize: 0.4, near: 4, far: 10, fov: 40, start: 0, dur: 4 }), size = (t) => { const p = dz(t), d = p.position.distanceTo(C); return (0.2 / Math.sqrt(d * d - 0.04)) / Math.tan((p.fov * Math.PI) / 360); };
    const dists = ts.map((t) => dz(t).position.distanceTo(C));
    assert.ok(Math.abs(dists[4] - dists[0]) > 5 && ts.every((t) => Math.abs(size(t) / size(0) - 1) < 0.01 && sameAs(dz(t), dz(t))) && dz(4).fov < dz(0).fov, "dollyZoom: the sphere's projected size holds within 1 % while the distance goes 4 -> 10 and the fov narrows");
    assert.throws(() => dollyZoom(0, { target: C, subjectSize: 9, near: 4, far: 10, fov: 40, dur: 4 }), /fit/, "dollyZoom refuses a subject wider than the frame");
    const dA = { position: V(8, 6, 8), target: V(0, 1, 0), fov: 45 }, dB = { position: V(1, 0.6, 1.5), target: V(0, 0.3, 0), fov: 28 };
    const dr = (t) => drone(t, { from: dA, to: dB, start: 1, dur: 3 }), d0 = dr(0), d1 = dr(4.5), dm = dr(2.5);
    assert.ok(d0.position.equals(dA.position) && d0.target.equals(dA.target) && d0.fov === 45 && d1.position.equals(dB.position) && d1.target.equals(dB.target) && d1.fov === 28, "drone: starts exactly on from and ends exactly on to");
    assert.ok(sameAs(dm, dr(2.5)) && Object.keys(dm).sort().join() === "fov,position,target" && dm.position.distanceTo(dA.position.clone().lerp(dB.position, 0.5)) > 0.1, "drone: a function of t, only a pose, and it bows off the straight line");
  }
  // Units: lift is metres, speed is m/s; an eased leg is at rest at both ends.
  {
    const a = { position: V(0, 1, 0), target: V(0, 0, 0), fov: 30 }, b = { position: V(1, 1, 0), target: V(0, 0, 0), fov: 30 };
    const top = travel(0.5, a, b, { start: 0, dur: 1, ease: "linear", lift: 0.5 });
    assert.ok(Math.abs(top.position.y - (1 + 0.25)) < 1e-9, "lift 0.5 m rises 0.25 units at M = 2: " + top.position.y);
    const flat = travel(0.5, a, b, { start: 0, dur: 1, ease: "linear", lift: 0 });
    assert.ok(Math.abs(flat.position.y - 1) < 1e-12 && Math.abs(flat.speed - 2) < 1e-3, "lift 0 is a straight push at 1 unit/s = 2 m/s: " + flat.speed);
    for (const t of [0, 1]) assert.ok(travel(t, a, b, { start: 0, dur: 1 }).speed < 1e-3, "an eased leg is at rest at t = " + t);
    assert.equal(travel(-1, a, b, { start: 0, dur: 1 }).speed, 0, "no speed before the leg");
    assert.equal(travel(2, a, b, { start: 0, dur: 1 }).speed, 0, "no speed after the leg");
    const end = travel(1, a, b, { start: 0, dur: 1 });
    near(pose(end), [...b.position.toArray(), ...b.target.toArray(), 30], 0, "u = 1 is the station itself");
  }
  // Arcs over the set instead of cutting through it.
  {
    const top = new THREE.Box3().setFromObject(world).max.y;
    const a = { position: V(-1, 0.05, 1), target: V(0, 0, 0), fov: 30 }, b = { position: V(1, 0.05, 1), target: V(0, 0, 0), fov: 30 };
    assert.ok(travel(0.5, a, b, { start: 0, dur: 1, ease: "linear", lift: 0 }).position.y < top, "a straight push at this height crosses the set");
    assert.ok(travel(0.5, a, b, { start: 0, dur: 1, ease: "linear", over: new THREE.Box3().setFromObject(world) }).position.y >= top + 0.1 / M - 1e-9, "over: the apex clears the set by 10 cm");
    assert.ok(travel(0.5, a, b, { start: 0, dur: 1, ease: "linear", over: new THREE.Box3().setFromObject(world), clear: 0.3 }).position.y >= top + 0.3 / M - 1e-9, "over takes a Box3 and a clearance");
  }
  // frame: the object's bounding sphere fits the smaller half-angle of the lens.
  for (const aspect of [16 / 9, 9 / 16]) {
    const r = new THREE.Box3().setFromObject(world).getBoundingSphere(new THREE.Sphere()).radius, f = frame(world, { fov: 18, aspect, azimuth: 40, elevation: 35 });
    const half = Math.min(18 / 2, (Math.atan(Math.tan(9 * Math.PI / 180) * aspect) * 180) / Math.PI) * Math.PI / 180, d = f.position.distanceTo(f.target);
    assert.ok(Math.asin(r / d) <= half + 1e-9, "the set fits the frame (aspect " + aspect.toFixed(2) + ")");
    assert.ok(Math.asin(r / d) > 0.8 * half, "and fills it, not a speck (aspect " + aspect.toFixed(2) + ")");
  }
  assert.throws(() => frame(new THREE.Group()), /empty|no size/i, "frame of nothing says so");
  // Refusals say how to fix the call.
  const okSt = { home: { position: V(0, 1, 2), target: V(0, 0, 0), fov: 30 }, away: { position: V(2, 1, 2), target: V(0, 0, 0), fov: 30 } };
  assert.throws(() => stations({}), /home/, "stations need a home");
  assert.throws(() => stations({ home: okSt.home, bad: { ...okSt.away, fov: 0 } }), /fov/, "a bad fov");
  assert.throws(() => stations({ home: { ...okSt.home, position: "up" } }), /position/, "a bad position");
  assert.throws(() => travel(0, okSt.home, okSt.away, { dur: 1, ease: "bounce" }), /ease/, "an unknown ease");
  assert.throws(() => travel(0, okSt.home, okSt.away, { dur: 0 }), /dur/, "a leg needs a duration");
  const st = stations(okSt);
  assert.throws(() => route(st, [{ to: "nowhere", start: 0, dur: 1 }]), /nowhere/, "a leg to an unknown station");
  assert.throws(() => route(st, [{ to: "away", start: 0, dur: 2 }, { to: "home", start: 1, dur: 2 }]), /start|overlap|before/, "a leg that starts before the previous ends is a cut");
  assert.throws(() => loopEnd(st, {}), /end/, "loopEnd needs the film's last time");
  assert.throws(() => loopEnd(st, { end: 1, dur: 2 }), /end|dur/, "loopEnd longer than the film");
  assert.throws(() => attend(world, { ghost: 2 }), /ghost/, "ghost is a fraction");
  assert.throws(() => attend(world).focus("A", 0), /Object3D/, "a subject is an object");
  assert.ok(Object.isFrozen(st), "stations are frozen");
  // The route holds home before it starts and each station after its leg; a loop end brings it home exactly.
  {
    const r = route(st, [{ to: "away", start: 1, dur: 2 }, loopEnd(st, { end: 8, dur: 2 })]);
    assert.equal(r.at(0).station, "home"); assert.equal(r.at(0).leg, -1);
    assert.equal(r.at(4).station, "away"); assert.equal(r.at(2).station, null); assert.equal(r.at(2).leg, 0);
    near(pose(r.at(8)), pose(r.at(0)), 1e-6, "the loop end meets the start");
    near(pose(r.at(20)), pose(r.at(0)), 1e-6, "and holds home after it");
  }

  // The one-take: home -> dive -> inside -> home. No hard cut, every leg lands on its station, the last frame is the first.
  const o = oneTake({ world, subject: A, inside: core, keep: [base], end: 12 }), fps = 30;
  {
    const o2 = oneTake({ world, subject: A, inside: core, keep: [base], end: 12 });
    for (let i = 0; i <= 50; i++) near(pose(o.route.at(i * 12 / 50)), pose(o2.route.at(i * 12 / 50)), 0, "two routes from the same legs agree at " + i);
    let prev = o.route.at(0), p0 = prev.position.clone();
    for (let i = 1; i <= 12 * fps; i++) {
      const t = i / fps, cur = o.route.at(t), mid = o.route.at(t - 0.5 / fps);
      const step = cur.position.distanceTo(p0), cap = (1.5 * Math.max(prev.speed, mid.speed, cur.speed)) / M / fps + 1e-9;
      assert.ok(step <= cap, "no jump at t = " + t.toFixed(3) + ": moved " + step.toFixed(5) + " units, the speeds allow " + cap.toFixed(5));
      prev = cur; p0 = cur.position.clone();
    }
    assert.ok(o.route.legs.length === 3, "home -> dive -> inside -> home is three legs");
    for (const leg of o.route.legs) {
      for (const x of [leg.start, leg.start + leg.dur]) {
        const a = o.route.at(x - 1e-4), b = o.route.at(x + 1e-4);
        assert.ok(a.position.distanceTo(b.position) < 1e-3 && a.target.distanceTo(b.target) < 1e-3 && Math.abs(a.fov - b.fov) < 1e-3, "continuous at the boundary t = " + x);
      }
      const e = o.route.at(leg.start + leg.dur);
      near(pose(e), [...o.stations[leg.to].position.toArray(), ...o.stations[leg.to].target.toArray(), o.stations[leg.to].fov], 1e-9, "leg to " + leg.to + " ends on its station");
    }
    near(pose(o.route.at(12)), pose(o.route.at(0)), 1e-6, "loop end: the last pose is the first");
    assert.ok(Math.abs(o.end - 12) < 1e-12, "the one-take reports its end");
  }
  // Attention: everything outside the beat's subject wears a ghost, then the exact original comes back.
  {
    const diveAt = o.route.legs[0].start, pushAt = o.route.legs[1].start;
    o.at(diveAt + 1, null);
    const gb = B.material;
    assert.ok(gb !== shared && gb.transparent && gb.opacity < 0.5 * shared.opacity && gb.userData.ghost, "B is a ghost mid-dive");
    assert.ok(shell.material === shared, "the subject keeps its own material"); assert.ok(base.material === snap[0].mat, "a kept mesh keeps its own");
    assert.ok(core.material === snap[2].mat, "so does the part inside the subject");
    assert.ok(gb.color.getHSL({}).s < shared.color.getHSL({}).s && gb.color.getHSL({}).l > shared.color.getHSL({}).l, "a ghost is paler and greyer");
    assert.equal(gb.depthWrite, false); assert.equal(gb.map, shared.map);
    untouched("the shared material is never written (mid-dive)");
    o.at(diveAt + 0.25, null);
    assert.ok(Math.abs(B.material.opacity - (1 - 0.75 * 0.5)) < 1e-9, "half-way through the fade: " + B.material.opacity);
    o.at(pushAt + 1, null);
    assert.ok(shell.material !== shared && shell.material.userData.ghost, "the shell is ghosted once the subject is inside it");
    assert.ok(core.material === snap[2].mat, "and the part inside is not");
    untouched("the shared material is never written (mid-inside)");
    o.at(12, null);
    for (const s of snap) assert.ok(s.m.material === s.mat, s.m.name + " wears its original at the end"); untouched("after the release");
    o.at(diveAt + 1, null); assert.ok(B.material.userData.ghost, "a seek back into the beat gives the same ghost");
    o.at(0, null);
    for (const s of snap) assert.ok(s.m.material === s.mat, s.m.name + " wears its original after a seek to 0"); untouched("after a seek");
  }
  // place: the camera ends up on the pose, looking at its target.
  {
    const cam = new THREE.PerspectiveCamera(50, 9 / 16), p = o.route.at(3);
    assert.equal(placeCamera(cam, p), cam);
    assert.equal(cam.fov, p.fov); near(cam.position.toArray(), p.position.toArray(), 1e-12, "place moves the camera");
    const want = p.target.clone().sub(p.position).normalize();
    assert.ok(cam.getWorldDirection(V(0, 0, 0)).dot(want) > 0.9999, "place aims at the target");
  }
  // Flags and special materials: a flagged mesh, the cutaway's own parts and a shader material stay as they are.
  {
    const w = build(), look = attend(w.world, { keep: [w.base] });
    w.core.userData.attend = false;
    const sm = new THREE.ShaderMaterial(), mine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), sm); w.world.add(mine);
    look.focus(w.B, 0).at(1);
    assert.ok(w.core.material.userData.ghost !== true && w.shell.material.userData.ghost, "userData.attend = false keeps a mesh's colour");
    assert.ok(mine.material === sm && look.skipped.length === 1, "a shader material is left alone and listed once: " + look.skipped);
    look.at(1.1); assert.equal(look.skipped.length, 1, "once, not every frame");
    assert.equal(look.weight(w.base, 1), 0, "a kept mesh weighs nothing"); assert.equal(look.weight(w.shell, 1), 1);
  }
  // With a cutaway: cut.at() then look.at(), the order of a frame. The cut never clones a ghost, the ghost keeps the
  // cut's own plane array, and the release hands back the cutaway's clone.
  {
    const w = build(), cut = cutaway(w.A); w.world.updateMatrixWorld(true); cut.at(0);
    const look = attend(w.world, { keep: [w.base] }).focus(w.B, 0).release(2);
    cut.at(1); const clone = w.shell.material;
    assert.ok(clone !== w.shared && clone.clippingPlanes.includes(cut.plane), "the cut clones the shell's material");
    const capMats = [...cut.group.children].map((c) => c.material);
    look.at(1);
    const g = w.shell.material;
    assert.ok(g.userData.ghost && g !== clone && g.clippingPlanes === clone.clippingPlanes && g.clippingPlanes.includes(cut.plane), "the ghost shares the cut clone's planes");
    cut.at(1);
    assert.ok(w.shell.material === g, "cut.at() does not clone a ghost");
    look.at(1);
    assert.ok(w.shell.material === g, "and the ghost stays");
    assert.deepEqual([...cut.group.children].map((c) => c.material), capMats, "the cut's caps keep their colour");
    look.at(3);
    assert.ok(w.shell.material === clone, "after the release the cutaway's clone is back");
  }
  // The edge: a ghost's fresnel rim, added only to a lit fragment shader, chained after the original's own hook.
  {
    const w = build(), hits = []; w.shared.onBeforeCompile = (s) => hits.push(s);
    const look = attend(w.world, { keep: [w.base], edge: 0.6 }).focus(w.A, 0); look.at(1);
    const g = w.B.material, lit = { fragmentShader: "varying vec3 vViewPosition;\nvoid main() {\n#include <opaque_fragment>\n}", uniforms: {} };
    g.onBeforeCompile(lit, null);
    assert.ok(/uniform float uGhostEdge/.test(lit.fragmentShader) && /uGhostEdge/.test(lit.fragmentShader.split("#include <opaque_fragment>")[0].split("void main")[1]), "the edge adds its uniform and its term before the output");
    assert.equal(lit.uniforms.uGhostEdge.value, 0.6, "the edge strength follows the weight"); assert.equal(hits.length, 1, "the original's hook is chained");
    const flat = { fragmentShader: "void main() {\n#include <opaque_fragment>\n}", uniforms: {} }, before = flat.fragmentShader;
    g.onBeforeCompile(flat, null); assert.equal(flat.fragmentShader, before, "an unlit shader is left alone");
    assert.ok(g.customProgramCacheKey().endsWith("|ghost-edge"), "the edge has its own program key");
  }
  // Two parts on ONE material at different weights (the kit shares materials by name): each wears its own ghost, so a
  // fade eases on the one that is leaving and holds on the one that stays.
  {
    const w = build(), look = attend(w.world, { keep: [w.base] }).focus(w.A, 1.5).focus(w.core, 4.5);
    look.at(4.75);
    assert.ok(Math.abs(look.weight(w.shell, 4.75) - 0.5) < 1e-9 && look.weight(w.B, 4.75) === 1, "the shell is half-way, B is all the way");
    const op = (o) => o.material.opacity;
    assert.ok(Math.abs(op(w.shell) - w.shared.opacity * (1 - 0.75 * 0.5)) < 1e-9, "the shell fades on its own weight: " + op(w.shell));
    assert.ok(Math.abs(op(w.B) - w.shared.opacity * 0.25) < 1e-9, "B holds at the full ghost: " + op(w.B));
    assert.ok(w.shell.material !== w.B.material, "two parts of one material never share a ghost");
    look.at(4.75); assert.ok(Math.abs(op(w.shell) - w.shared.opacity * 0.625) < 1e-9 && Math.abs(op(w.B) - 0.25) < 1e-9, "the same t gives the same frame");
    look.at(6); assert.ok(Math.abs(op(w.shell) - 0.25) < 1e-9 && Math.abs(op(w.B) - 0.25) < 1e-9, "both settle at the full ghost");
    assert.ok(w.shared.opacity === 1 && w.shared.color.getHex() === 0xc08040, "the shared original is never written");
    // The legitimate case: parts on one material at ONE weight still look alike, and an array holding it twice works.
    const w2 = build(), both = attend(w2.world, { keep: [w2.base] }).focus(w2.core, 0); both.at(2);
    assert.ok(op(w2.shell) === op(w2.B) && w2.shell.material.color.getHex() === w2.B.material.color.getHex(), "equal weights look equal");
    const dup = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), [w2.shared, w2.shared]); w2.world.add(dup);
    both.at(2); assert.ok(dup.material[0].userData.ghost && dup.material[1].userData.ghost, "a material array is ghosted slot by slot");
    both.release(3); both.at(6); assert.ok(dup.material[0] === w2.shared && w2.shell.material === w2.shared && w2.B.material === w2.shared, "and restored by reference");
  }
  // A camera path is a pure function of t: `over` is read when the route is built, so a part that rises later (a lid
  // opening, a ball bouncing) never moves the camera; a Box3 you pass is the envelope you chose.
  {
    const w = build(), lid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), w.shared), lo = { position: V(-1, 0.05, 1), target: V(0, 0, 0), fov: 30 }, hi = { position: V(1, 0.05, 1), target: V(0, 0, 0), fov: 30 };
    w.world.add(lid); lid.position.set(0.25, 0.1, 0); w.world.updateMatrixWorld(true);
    const s2 = stations({ home: lo, away: hi }), r = route(s2, [{ to: "away", start: 0, dur: 2, ease: "linear", over: w.world }]);
    const before = pose(r.at(1)), top = new THREE.Box3().setFromObject(w.world).max.y;
    assert.ok(before[1] >= top + 0.1 / M - 1e-9, "the arc clears the set as it stood when the route was built");
    lid.position.y += 2; w.world.updateMatrixWorld(true);
    near(pose(r.at(1)), before, 0, "a part that rises later does not move the camera");
    const o = oneTake({ world: w.world, subject: w.A, inside: w.core, keep: [w.base], end: 12 }), at = (t) => pose(o.route.at(t)), mid = o.route.legs[0].start + 1, back = o.route.legs[2].start + 1.25, was = [at(mid), at(back)];
    lid.position.y += 5; w.world.updateMatrixWorld(true);
    near(at(mid), was[0], 0, "the one-take's dive does not follow a prop"); near(at(back), was[1], 0, "nor does its loop leg");
    const seek = (ts) => ts.map((t) => at(t)); const fwd = seek([3, 11, 2.5]), rev = seek([2.5, 11, 3]).reverse();
    for (let i = 0; i < 3; i++) near(fwd[i], rev[i], 0, "seeking in a different order gives the same pose");
    // The legitimate case: a Box3 that covers the motion lifts the arc; travel() itself takes only a Box3 (an object's
    // box would be read live on every call).
    const env = new THREE.Box3().setFromObject(w.world), p = travel(1, lo, hi, { start: 0, dur: 2, ease: "linear", over: env });
    assert.ok(p.position.y >= env.max.y + 0.1 / M - 1e-9, "a Box3 envelope lifts the arc over a part's whole travel");
    assert.throws(() => travel(1, lo, hi, { start: 0, dur: 2, over: w.world }), /Box3/, "travel() refuses an object: its box would follow the world's pose");
  }
  // The last frame is the first: attention is released early enough, and an ease that does not end on 1 still lands home.
  {
    const w = build();
    assert.throws(() => oneTake({ world: w.world, subject: w.A, inside: w.core, end: 12, look: { dur: 3 } }), /dur/, "an attention that is still fading at the last frame is refused");
    for (const dur of [0.5, 2.5]) {
      const o = oneTake({ world: w.world, subject: w.A, inside: w.core, keep: [w.base], end: 12, look: { dur } }); o.at(12, null);
      for (const m of [w.shell, w.core, w.B, w.base]) assert.ok(o.look.weight(m, 12) === 0 && m.material.userData.ghost !== true, "the last frame is solid with a fade of " + dur + " s: " + m.name);
    }
    const a = { position: V(-1, 1, 1), target: V(0, 0, 0), fov: 30 }, b = { position: V(1, 1, 1), target: V(0, 0.2, 0), fov: 50 };
    near(pose(travel(2, a, b, { start: 0, dur: 2, ease: (u) => u * 0.999 })), [1, 1, 1, 0, 0.2, 0, 50], 0, "an ease that stops short of 1 still ends on the station");
    near(pose(travel(0, a, b, { start: 0, dur: 2, ease: (u) => u + 0.01 })), [-1, 1, 1, 0, 0, 0, 30], 0, "and starts on its own");
  }
}
// The studio rig: on a room-scale set, where one shadow frustum over the whole set is coarser than 1 mm, the key's
// frustum is refitted to what each pose sees; the AO radius comes from the scale and the view, never typed.
{
  const part = (w, h, d, name, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), new THREE.MeshStandardMaterial()); o.name = name; o.position.set(x / M, y / M, z / M); return o; };
  const root = new THREE.Scene(), world = new THREE.Group(), A = new THREE.Group();
  const floor = part(6, 0.02, 4, "floor", 0, -0.01, 0), cabinet = part(1, 1, 0.5, "cabinet", -2, 0.5, -1);
  const shell = part(0.12, 0.12, 0.12, "shell", 1.5, 0.06, 0.5), core = part(0.03, 0.03, 0.03, "core", 1.5, 0.06, 0.5);
  A.add(shell, core); world.add(floor, cabinet, A); root.add(world); root.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(30, 9 / 16, 0.001, 200);
  const o = oneTake({ world, subject: A, inside: core, keep: [floor], end: 12, aspect: 9 / 16, studio: { renderer: null, scene: root, camera, height: 1920 } });
  const rig = o.studio, key = rig.key, map = key.shadow.mapSize.x; // 4096: studio() sets it at build
  assert.equal(map, LOOKS.diorama.shadow.map, "the diorama's shadow map");
  const whole = (2 * rig.set.getBoundingSphere(new THREE.Sphere()).radius * M * 1000) / map;
  assert.ok(whole > 1, "the test set is big enough that one frustum over it is coarser than 1 mm (" + whole.toFixed(2) + " mm)");
  const measured = () => ((key.shadow.camera.right - key.shadow.camera.left) * M * 1000) / map;
  const ndc = (p) => p.clone().applyMatrix4(key.shadow.camera.matrixWorldInverse).applyMatrix4(key.shadow.camera.projectionMatrix);
  const corners = (b) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  const at = {};
  for (const [name, t] of [["home", 0], ["dive", 4], ["inside", 8]]) {
    const p = o.at(t, camera); assert.equal(p.station, name, "t = " + t + " holds " + name);
    const s = rig.state(p); at[name] = { p, s };
    assert.ok(Math.abs(measured() - s.texelMm) < 1e-9, name + ": the reported texel is the frustum's");
    // (a close-up covers everything it sees, so its texel is the visible region over the map: <= 1 mm below, not a frame pixel)
    if (name === "home") assert.ok(measured() <= s.pixelMm, name + ": the shadow texel (" + measured().toFixed(3) + " mm) is no coarser than a frame pixel on the target (" + s.pixelMm.toFixed(3) + " mm)");
    // The dive looks down at the floor, so it sees little of the set: <= 1 mm. The inside station looks level across the room
    // and sees all of it, which the shadow covers (a lit far wall is the failure), at no worse than one frustum over the set.
    if (name === "dive") assert.ok(measured() <= 1, name + ": a close-up's shadow texel is <= 1 mm, got " + measured().toFixed(3));
    assert.ok(measured() <= whole + 1e-9, name + ": never coarser than one frustum over the whole set");
    const subject = new THREE.Box3().setFromObject(name === "inside" ? core : A);
    for (const c of corners(subject)) { const q = ndc(c); assert.ok(Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && Math.abs(q.z) <= 1, name + ": the subject is inside the shadow frustum"); }
    for (const c of corners(rig.set)) assert.ok(Math.abs(ndc(c).z) <= 1, name + ": every caster of the set is inside the shadow's depth range");
    // What the pose SEES, not a disc round the target: a ray through each of 25 frame points enters and leaves the set's box;
    // both points are in the shadow camera's x/y (three.js lights a fragment outside it: the far floor would lose its shadows).
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const slab = (o, d, b) => { let t0 = 0, t1 = Infinity; for (const k of ["x", "y", "z"]) { const i0 = (b.min[k] - o[k]) / d[k], i1 = (b.max[k] - o[k]) / d[k]; t0 = Math.max(t0, Math.min(i0, i1)); t1 = Math.min(t1, Math.max(i0, i1)); } return t0 <= t1 ? [t0, t1] : null; };
    let seen = 0;
    for (const nx of [-1, -0.5, 0, 0.5, 1]) for (const ny of [-1, -0.5, 0, 0.5, 1]) {
      const dir = new THREE.Vector3(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize(), hit = slab(camera.position, dir, rig.set);
      if (!hit) continue;
      for (const tt of hit) { const q = ndc(camera.position.clone().addScaledVector(dir, tt)); seen++; assert.ok(Math.abs(q.x) <= 1 + 1e-6 && Math.abs(q.y) <= 1 + 1e-6, name + ": what the frame sees at (" + nx + ", " + ny + ") is inside the shadow frustum, got " + q.x.toFixed(2) + ", " + q.y.toFixed(2)); }
    }
    assert.ok(seen >= (name === "home" ? 2 : 20),name + ": the rays meet the set (" + seen + ")");
  }
  assert.ok(at.dive.s.texelMm < at.home.s.texelMm / 2, "the frustum is refitted, not fixed: dive " + at.dive.s.texelMm.toFixed(3) + " mm vs home " + at.home.s.texelMm.toFixed(3));
  const again = rig.state(at.dive.p); // renders arrive out of order
  assert.equal(again.texelMm, at.dive.s.texelMm, "state is a function of the pose, whatever was rendered before");
  // AO: from M and the view, never typed.
  for (const x of [0.3, 1.2, 4]) {
    const a1 = aoFor(x / 1, LOOKS.diorama.ao, 1), a2 = aoFor(x / 2, LOOKS.diorama.ao, 2);
    assert.ok(Math.abs(a1.aoRadius - 2 * a2.aoRadius) < 1e-12 && Math.abs(a1.metres - a2.metres) < 1e-12, "the AO radius in units scales with M (same metres at mpu 1 and 2)");
  }
  assert.ok(at.home.s.ao.metres > at.dive.s.ao.metres && at.inside.s.ao.metres >= LOOKS.diorama.ao.min, "the AO radius follows the view: wide " + at.home.s.ao.metres + " m, dive " + at.dive.s.ao.metres + " m");
  // Edges of the fit: a frame that sees none of the set gets the whole-set sphere (a lit set is never left unshadowed); a
  // camera straight above the floor fits finitely and covers what it sees.
  {
    const c = rig.set.getCenter(new THREE.Vector3()), R = rig.set.getBoundingSphere(new THREE.Sphere()).radius;
    const away = fitShadow(key, { position: c.clone().add(new THREE.Vector3(0, 0, 10 * R)), target: c.clone().add(new THREE.Vector3(0, 0, 20 * R)), fov: 30, aspect: 9 / 16 }, { set: rig.set });
    assert.ok(Math.abs(away.radius - R) < 1e-9, "a frame that sees none of the set gets the set's sphere");
    const down = fitShadow(key, { position: c.clone().add(new THREE.Vector3(0, 1 / M, 0)), target: new THREE.Vector3(c.x, -0.01 / M, c.z), fov: 30, aspect: 9 / 16 }, { set: rig.set });
    assert.ok(Number.isFinite(down.radius) && down.radius < R, "a camera looking straight down fits finitely, tighter than the whole set");
    for (const p of [new THREE.Vector3(c.x, -0.01 / M, c.z), new THREE.Vector3(c.x, -0.01 / M, c.z + 0.3 / M)]) { const q = ndc(p); assert.ok(Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1, "the floor under a camera looking straight down is in the frustum"); }
  }
  // Unknown names refused; a dry rig does not render.
  assert.throws(() => studio(null, new THREE.Scene(), camera, { look: "noir", set: world }), /unknown look/);
  assert.throws(() => studio(null, new THREE.Scene(), camera, { preset: "neon", set: world }), /preset/);
  assert.throws(() => o.render(0), /renderer/, "a dry rig refuses to render");
  // The rig renders the camera it was built with: another camera passed to render() is refused, not moved and left unrendered;
  // the same camera passes that check (and then meets the dry rig's refusal).
  assert.throws(() => o.render(0, new THREE.PerspectiveCamera(30, 9 / 16, 0.001, 200)), /camera/, "render(t, other camera) is refused");
  assert.throws(() => o.render(0, camera), /renderer/, "render(t, the rig's camera) passes the camera check");
  // frame(t, pose) places the camera at the pose, so the frame is the pose the shadow was fitted to (render calls it).
  {
    const cam2 = new THREE.PerspectiveCamera(60, 1, 0.001, 200); cam2.position.set(9, 9, 9); cam2.updateMatrixWorld();
    const r2 = studio(null, new THREE.Scene(), cam2, { set: world, route: o.route });
    const pose = o.route.at(4), fr = r2.frame(4, pose);
    assert.ok(cam2.position.distanceTo(pose.position) < 1e-9 && cam2.fov === pose.fov, "frame(t, pose) places the camera at the pose");
    assert.ok(Math.abs(fr.texelMm - r2.state(pose).texelMm) < 1e-12, "and fits the shadow to that pose with the camera's aspect");
    assert.ok(r2.frame(4).texelMm === fr.texelMm && cam2.position.distanceTo(pose.position) < 1e-9, "frame(t) without a pose takes the route's");
    assert.throws(() => studio(null, new THREE.Scene(), cam2, { set: world }).frame(4), /route/, "no pose and no route is refused");
  }
  // DOF range: typed in metres, handed to the effect in units (the effect reads world units), so the in-focus depth in metres is the same at any M.
  {
    const dofAt = (mpu, dof) => studio(null, new THREE.Scene(), camera, { set: world, dof, mpu }).state(at.dive.p).focusRange;
    for (const mpu of [0.01, 1, 2]) {
      assert.ok(Math.abs(dofAt(mpu, { focusRange: 0.05 }) * mpu - 0.05) < 1e-12, "a typed focusRange of 0.05 is 0.05 m at mpu " + mpu);
      assert.ok(Math.abs(dofAt(mpu, true) * mpu - 3) < 1e-12, "the default range is the same metres at mpu " + mpu);
    }
    assert.ok(dofAt(1, { focusRange: 0.2 }) === 4 * dofAt(1, { focusRange: 0.05 }), "a larger typed range is larger, in proportion");
    assert.equal(dofAt(1, false), null, "no DOF, no range");
    for (const bad of [0, -1, NaN, "3"]) assert.throws(() => dofAt(1, { focusRange: bad }), /focusRange/, "focusRange " + bad + " is refused");
  }
  assert.ok(Object.isFrozen(PRESETS.warm.key) && Object.isFrozen(LOOKS.diorama.ao), "the defaults are data, not shared mutable state");
}
// Cues and shots on one frame grid: a cue is snapped the way a cut is, so a raw cue never meets a snapped cut.
{
  const shots = [{ name: "intro", start: 0, end: 1.05 }, { name: "valve", start: 1.05, end: 3 }, { name: "outro", start: 3, end: 5 }];
  const fps = 30, nm = (r) => r.length === 1 ? r[0] : "[" + r.join(" | ") + "]";
  const raw = (t) => shots.findIndex((s) => Math.round(s.start * fps) / fps <= t && t < Math.round(s.end * fps) / fps);
  assert.equal(raw(1.056 + 0.01), 0, "the raw lookup lands in the previous shot");
  assert.equal(shotAt(1.056, shots, { fps }), 1, "a cue 10 ms before a frame-rounded cut finds the shot it belongs to");
  const w = overlayWindow(1.056, shots, { fps });
  assert.ok(w.index === 1 && w.name === "valve" && Math.abs(w.from - 32 / 30) < 1e-9 && Math.abs(w.to - 3) < 1e-9 && w.dur > 1.9, "overlayWindow: " + JSON.stringify(w));
  assert.equal(snap(1.05, 30), 32 / 30, "snap rounds to a frame");
  assert.equal(snap(0, 30), 0); assert.equal(snap(2.9999, 30), 3);
  assert.throws(() => snap(1, 0), /fps/); assert.throws(() => snap(NaN, 30), /snap/);
  assert.equal(shotAt(3, shots, { fps }), 2, "a cue on a cut is in the shot that starts there");
  assert.equal(shotAt(2.99, shots, { fps }), 2, "a cue within half a frame before a cut snaps onto it");
  assert.equal(shotAt(4.97, shots, { fps }), 2, "the last frame");
  assert.equal(shotAt(4.99, shots, { fps }), -1, "a cue that snaps onto the end is in no shot");
  assert.equal(shotAt(5, shots, { fps }), -1); assert.equal(shotAt(9, shots, { fps }), -1); assert.equal(shotAt(-1, shots, { fps }), -1);
  assert.throws(() => shotAt(1, [{ start: 2, end: 2 }], { fps }), /end/); assert.throws(() => shotAt(1, shots), /fps/);
  assert.throws(() => shotAt(1, "no", { fps }), /shots/);
  const none = overlayWindow(9, shots, { fps });
  assert.ok(none.index === -1 && none.dur === 0, "a cue in no shot gives an empty window");
  assert.equal(overlayWindow(2.99, shots, { fps }).name, "outro", "overlayWindow agrees with shotAt");
  let p = windowProblems([{ name: "key-number", cue: 4.99, end: 4.99 }], shots, { fps });
  assert.ok(p.length === 1 && /key-number.*zero or negative/.test(p[0]), "zero window: " + nm(p));
  p = windowProblems([{ name: "back", cue: 2, end: 1.5 }], shots, { fps });
  assert.ok(p.length === 1 && /back.*zero or negative/.test(p[0]), "negative window: " + nm(p));
  p = windowProblems([{ name: "lost", cue: 9 }], shots, { fps });
  assert.ok(p.length === 1 && /lost.*in no shot/.test(p[0]), "no shot: " + nm(p));
  assert.deepEqual(windowProblems([{ name: "tag", cue: 1.056, text: "x" }], shots, { fps }), [], "a long enough window is fine");
  p = windowProblems([{ name: "tail", cue: 2.9, text: "a long label of seven words in all" }], shots, { fps });
  assert.ok(p.length === 1 && /tail.*under its minimum read time/.test(p[0]), "short window: " + nm(p));
  assert.deepEqual(windowProblems([{ name: "tail", cue: 2.9, text: "a long label of seven words in all", min: 0.05 }], shots, { fps }), [], "an explicit min overrides the text");
  // The minimum is the item's min, else the option's min, else readTime(text): the option beats the text, both ways.
  assert.deepEqual(windowProblems([{ name: "t", cue: 2.9, text: "x" }], shots, { fps, min: 0.05 }), [], "an option min below the read time lets a short window pass");
  p = windowProblems([{ name: "t", cue: 2.9, text: "x", min: 0.05 }], shots, { fps, min: 2 });
  assert.deepEqual(p, [], "an item min beats the option min");
  p = windowProblems([{ name: "t", cue: 2.0, text: "x" }], shots, { fps, min: 1.5 });
  assert.ok(p.length === 1 && /t.*window 1 s is under its minimum read time 1.5 s/.test(p[0]), "a stricter option min applies over the text: " + nm(p));
  assert.deepEqual(windowProblems([{ name: "t", cue: 1.056, text: "x" }], shots, { fps, min: 1.5 }), [], "a window above the option min passes");
  assert.deepEqual(windowProblems([{ name: "ok", cue: 0.5 }], shots, { fps, min: 0.5 }), [], "an option min with a long enough window and no text");
  assert.ok(windowProblems([{ name: "ok", cue: 2.9 }], shots, { fps, min: 0.5 }).length === 1, "an option min applies to an item with no text");
  assert.throws(() => windowProblems([{ name: "t", cue: 1 }], shots, { fps, min: "2" }), /min/);
  p = windowProblems([{ name: "t", cue: 2.9, min: NaN }], shots, { fps });
  assert.ok(p.length === 1 && /t: min must be a number/.test(p[0]), "an item min that is not a number is a problem: " + nm(p));
  assert.deepEqual(windowProblems([{ name: "ok", cue: 0.5 }], shots, { fps }), [], "no text and no min: only an empty window fails");
  assert.equal(readTime("42"), 1); assert.equal(readTime("2 million years"), 1.4); assert.equal(readTime("a b c d e f g"), 2.6);
  assert.equal(readTime("十個漢字"), 1.1); assert.equal(readTime(""), 1); assert.equal(readTime("  "), 1);
  assert.equal(readTime("x", { floor: 2 }), 2);
}
// Any scale and any place: a set built in centimetres on the Moon. Gravity is the place's; tolerances are metres, so
// the audit still sees a 5 mm gap; settle lifts a prop typed 20 mm into the floor and reports one 50 mm in.
const moon = new THREE.Scene(), mk = K.makeKit(moon, { mpu: 0.01, gravity: 1.62 });
assert.ok(Math.abs(K.G - 162) < 1e-9, "gravity is the place's, in units/s²");
const ground = new THREE.Mesh(new THREE.BoxGeometry(400, 10, 400), new THREE.MeshStandardMaterial()); ground.position.y = -5; ground.name = "ground"; moon.add(ground);
const hover = new THREE.Mesh(new THREE.BoxGeometry(15, 15, 15), new THREE.MeshStandardMaterial()); hover.position.set(0, 7.5 + 0.5, 0); hover.name = "hover"; moon.add(hover);
const sunk = new THREE.Mesh(new THREE.BoxGeometry(15, 15, 15), new THREE.MeshStandardMaterial()); sunk.position.set(50, 7.5 - 2, 0); sunk.name = "sunk"; moon.add(sunk);
const deep = new THREE.Mesh(new THREE.BoxGeometry(15, 15, 15), new THREE.MeshStandardMaterial()); deep.position.set(-50, 7.5 - 5, 0); deep.name = "deep"; moon.add(deep);
moon.updateMatrixWorld(true);
mk.rest(sunk); mk.rest(deep);
const misses = mk.settle();
assert.ok(Math.abs(sunk.position.y - 7.5) < 0.01 && !misses.some((m) => /sunk/.test(m)), "settle lifts a prop typed a little low: " + sunk.position.y);
assert.ok(misses.some((m) => /deep \(placed 50 mm inside/.test(m)), "settle reports a prop placed deep inside: " + misses);
{ // scale audit and z-fight probe (K.M is 0.01 here: 1 unit = 1 cm)
  const s = new THREE.Scene(), mat = new THREE.MeshStandardMaterial();
  const mug = (name, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(h * 0.8 / K.M, h / K.M, h * 0.8 / K.M), mat); m.name = name; m.userData.real = { h: 0.1 }; s.add(m); return m; };
  mug("right", 0.1); mug("typo", 1.0); mug("edge", 0.114); mug("over", 0.116);
  const bare = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); bare.name = "bare"; s.add(bare);
  const a = scaleAudit(s);
  assert.deepEqual(a.off.map((p) => p.name).sort(), ["over", "typo"], "scale audit names the 10x prop and the one 16% off: " + JSON.stringify(a.off));
  assert.ok(!a.ok && a.problems.length === 2 && a.checked === 4, "scale audit reports, counts what it checked: " + JSON.stringify(a));
  assert.deepEqual(a.unchecked, ["bare"], "a prop with no declared size is unchecked, never passed");
  assert.deepEqual(scaleAudit(s, { tol: 0.2 }).off.map((p) => p.name), ["typo"], "tol option");
  assert.ok(scaleAudit(s, { mpu: 1 }).off.some((p) => p.name === "right"), "mpu option: units read as metres flag a correct prop");
  const good = new THREE.Scene(); const g1 = new THREE.Mesh(new THREE.BoxGeometry(8, 10, 8), mat); g1.userData.real = { h: 0.1, w: 0.08, d: 0.08 }; g1.name = "ok"; good.add(g1);
  assert.ok(scaleAudit(good).ok && scaleAudit(good).checked === 3 && scaleAudit(good).unchecked.length === 0, "a correct prop passes");
  g1.rotation.y = Math.PI / 2; g1.userData.real = { h: 0.1 };
  assert.ok(scaleAudit(good).ok, "a prop turned about Y still measures its height");
  for (const real of [{ h: -1 }, { h: "tall" }, {}, { x: 1 }, null]) {
    const t = new THREE.Scene(), m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.userData.real = real; t.add(m);
    assert.ok(!scaleAudit(t).ok && scaleAudit(t).bad.length === 1, "bad declaration reported: " + JSON.stringify(real));
  }
  { const t = new THREE.Scene(), e = new THREE.Group(); e.userData.real = { h: 0.1 }; t.add(e); assert.equal(scaleAudit(t).bad.length, 1, "a size declared on an empty group is bad"); }
  assert.throws(() => scaleAudit(s, { tol: 0 }), /tol/);

  const quad = (name, z = 0, material = new THREE.MeshStandardMaterial()) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material); q.name = name; q.position.z = z; return q; };
  const cam = (z, near, far, ry = 0) => { const c = new THREE.PerspectiveCamera(40, 1, near, far); c.position.z = z; c.rotation.y = ry; c.updateMatrixWorld(true); return c; };
  const near = cam(200, 10, 10000), far = cam(3000, 1, 100000);
  const set = (decal) => { const w = new THREE.Scene(); w.add(quad("floor"), decal); return w; };
  let r = zFight(set(quad("decal")), { cameras: near });
  assert.ok(r.pairs.length === 1 && r.pairs[0].gap_mm === 0 && /polygonOffset/.test(r.pairs[0].suggest) && [r.pairs[0].a, r.pairs[0].b].sort().join() === "decal,floor", "coplanar quads are flagged: " + JSON.stringify(r));
  assert.equal(zFight(set(quad("decal", 0.1)), { cameras: near }).pairs.length, 0, "a 1 mm offset passes at the near station");
  assert.equal(zFight(set(quad("decal", 0.1)), { cameras: far }).pairs.length, 1, "the same 1 mm offset fights from 30 m");
  assert.equal(zFight(set(quad("decal", 0.1)), { cameras: [near, far] }).pairs.length, 1, "several cameras take the worst");
  const off = new THREE.MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  r = zFight(set(quad("decal", 0, off)), { cameras: near });
  assert.ok(r.pairs.length === 0 && r.mitigated === 1, "an offset material is mitigated, not reported");
  const turned = quad("decal"); turned.rotation.y = Math.PI / 2;
  assert.equal(zFight(set(turned), { cameras: near }).pairs.length, 0, "a perpendicular quad is not flagged");
  const back = quad("decal"); back.rotation.y = Math.PI;
  assert.equal(zFight(set(back), { cameras: near }).pairs.length, 0, "back to back single-sided faces never fight");
  const both = quad("decal", 0, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })); both.rotation.y = Math.PI;
  assert.equal(zFight(set(both), { cameras: near }).pairs.length, 1, "a double-sided back face fights");
  r = zFight(set(quad("decal")), { cameras: cam(200, 10, 10000, Math.PI) });
  assert.ok(r.pairs.length === 0 && r.unseen === 1, "a camera looking away: unseen is reported, not passed");
  const hid = quad("decal"); hid.visible = false;
  assert.equal(zFight(set(hid), { cameras: near }).pairs.length, 0, "a hidden mesh is ignored");
  const mir = quad("decal"); mir.scale.x = -1;
  assert.equal(zFight(set(mir), { cameras: near }).pairs.length, 1, "a mirrored coplanar quad is still flagged");
  { // review round: unchecked props nested in groups, offsets that do nothing, edge-touching tiles
    const nest = new THREE.Scene(), grp = new THREE.Group(); grp.name = "set";
    const cup = new THREE.Mesh(new THREE.BoxGeometry(8, 10, 8), mat); cup.name = "cup"; cup.userData.real = { h: 0.1 };
    const jar = new THREE.Mesh(new THREE.BoxGeometry(8, 100, 8), mat); jar.name = "jar";
    grp.add(cup, jar); nest.add(grp);
    let n = scaleAudit(nest);
    assert.deepEqual([n.unchecked, n.checked], [["jar"], 1], "an undeclared prop in a group beside a declared one is unchecked: " + JSON.stringify(n));
    const whole = new THREE.Group(); whole.name = "lamp"; whole.userData.real = { h: 0.1 };
    const lampPart = new THREE.Mesh(new THREE.BoxGeometry(8, 10, 8), mat); lampPart.name = "shade"; whole.add(lampPart);
    const undeclared = new THREE.Group(); undeclared.name = "shelf"; undeclared.add(new THREE.Mesh(new THREE.BoxGeometry(8, 10, 8), mat), new THREE.Mesh(new THREE.BoxGeometry(8, 10, 8), mat));
    const two = new THREE.Scene(); two.add(whole, undeclared);
    n = scaleAudit(two);
    assert.deepEqual([n.unchecked, n.checked, n.ok], [["shelf"], 1, true], "a declared group covers its parts; an undeclared group is one unchecked unit: " + JSON.stringify(n));
    const holder = new THREE.Mesh(new THREE.BoxGeometry(8, 10, 8), mat); holder.name = "holder"; holder.add(cup.clone());
    holder.children[0].userData.real = { h: 0.1 };
    const hs = new THREE.Scene(); hs.add(holder);
    assert.deepEqual(scaleAudit(hs).unchecked, ["holder"], "a mesh whose child declares a size but not itself is unchecked");

    const cam1 = near, set2 = (...ms) => { const w = new THREE.Scene(); if (!ms.some((m) => m.name === "floor")) w.add(quad("floor")); w.add(...ms); return w; };
    const offMat = (factor, units) => new THREE.MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: units });
    r = zFight(set2(quad("decal", 0, offMat(0, 0))), { cameras: cam1 });
    assert.ok(r.pairs.length === 1 && r.mitigated === 0, "polygonOffset with factor 0 and units 0 changes no depth: " + JSON.stringify(r));
    r = zFight(set2(quad("decal", 0, offMat(-1, -1)), quad("floor", 0, offMat(-1, -1))), { cameras: cam1 });
    assert.ok(r.pairs.length === 1 && r.mitigated === 0, "the same offset on both cancels: " + JSON.stringify(r));
    r = zFight(set2(quad("decal", 0, offMat(-1, -1)), quad("floor", 0, offMat(1, 1))), { cameras: cam1 });
    assert.ok(r.pairs.length === 0 && r.mitigated === 1, "different offsets separate the faces");
    const box = (mats) => { const b = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mats); b.name = "decal"; b.position.z = -5; return b; };
    const six = (at) => [0, 1, 2, 3, 4, 5].map((i) => (i === at ? offMat(-1, -1) : new THREE.MeshStandardMaterial()));
    r = zFight(set2(box(six(0))), { cameras: cam1 });
    assert.ok(r.pairs.length === 1 && r.mitigated === 0, "an offset on a material of an unrelated face group hides nothing: " + JSON.stringify(r));
    r = zFight(set2(box(six(4))), { cameras: cam1 });
    assert.ok(r.pairs.length === 0 && r.mitigated === 1, "an offset on the material of the coplanar face group is mitigated: " + JSON.stringify(r));

    const tile = (name, x, y = 0) => { const q = quad(name); q.position.set(x, y, 0); return q; };
    const tiles = (b) => { const w = new THREE.Scene(); w.add(tile("tileA", 0), b); return w; };
    assert.equal(zFight(tiles(tile("tileB", 100)), { cameras: cam1 }).pairs.length, 0, "tiles that only share an edge do not overlap");
    assert.equal(zFight(tiles(tile("tileB", 100, 100)), { cameras: cam1 }).pairs.length, 0, "tiles that only share a corner do not overlap");
    assert.equal(zFight(tiles(tile("tileB", 90)), { cameras: cam1 }).pairs.length, 1, "tiles that overlap by 10 cm fight");

    // review round 2: an offset counts by the depth it shifts at the camera (factor x the face's window-depth slope + units
    // x one step), never by its settings. A face square to the view has slope 0, so a factor alone shifts nothing there.
    const wall = (m) => quad("floor", 0, m), oblique = (() => { const c = new THREE.PerspectiveCamera(40, 1, 10, 10000); c.position.set(150, 0, 100); c.lookAt(0, 0, 0); c.updateMatrixWorld(true); return c; })();
    r = zFight(set2(wall(), quad("decal", 0, offMat(-4, 0))), { cameras: near });
    assert.ok(r.pairs.length === 1 && r.mitigated === 0, "a factor-only offset on a face seen head-on shifts nothing: " + JSON.stringify(r));
    r = zFight(set2(wall(), quad("decal", 0, offMat(-4, 0))), { cameras: oblique });
    assert.ok(r.pairs.length === 0 && r.mitigated === 1, "the same factor-only offset seen at an angle separates the faces: " + JSON.stringify(r));
    const head30 = cam(30, 1, 10000);
    r = zFight(set2(wall(offMat(-1, -1)), quad("decal", 0, offMat(-2, -1))), { cameras: head30 });
    assert.ok(r.pairs.length === 1 && r.mitigated === 0, "offsets that differ only in factor cancel head-on: " + JSON.stringify(r));
    r = zFight(set2(wall(offMat(-1, -1)), quad("decal", 0, offMat(-2, -1))), { cameras: oblique });
    assert.ok(r.pairs.length === 0 && r.mitigated === 1, "offsets that differ only in factor separate at an angle: " + JSON.stringify(r));
    r = zFight(set2(wall(), quad("decal", 0, offMat(-4, 0))), { cameras: [oblique, near] });
    assert.ok(r.pairs.length === 1 && r.mitigated === 0, "mitigated only when the offset holds at every camera: " + JSON.stringify(r));
    const halves = (m0, m1) => { const g = new THREE.PlaneGeometry(100, 100, 2, 1); g.clearGroups(); g.addGroup(0, 6, 0); g.addGroup(6, 6, 1); const q = new THREE.Mesh(g, [m0, m1]); q.name = "decal"; return q; };
    r = zFight(set2(wall(offMat(-1, -1)), halves(offMat(-1, -1), new THREE.MeshStandardMaterial())), { cameras: near });
    assert.ok(r.pairs.length === 1 && r.mitigated === 0, "a face drawn with several materials: the half whose offset equals the other face's still fights: " + JSON.stringify(r));
    r = zFight(set2(wall(), halves(offMat(-2, -2), offMat(-3, -3))), { cameras: near });
    assert.ok(r.pairs.length === 0 && r.mitigated === 1, "a face whose every material shifts it apart from the other face is mitigated: " + JSON.stringify(r));
    // the class: across factor x units settings, head-on (slope 0) a pair is mitigated exactly when the units differ; at an
    // angle, exactly when the settings differ
    const vals = [[0, 0], [-1, 0], [-4, 0], [0, -1], [-1, -1], [-4, -1]];
    for (const [fa, ua] of vals) for (const [fb, ub] of vals) {
      const h = zFight(set2(wall(offMat(fa, ua)), quad("decal", 0, offMat(fb, ub))), { cameras: near });
      assert.equal(h.mitigated, ua !== ub ? 1 : 0, `head-on, A (${fa}, ${ua}) vs B (${fb}, ${ub}): mitigated ${h.mitigated}`);
      assert.equal(h.pairs.length, 1 - h.mitigated, "head-on: every pair is either reported or mitigated");
      const o = zFight(set2(wall(offMat(fa, ua)), quad("decal", 0, offMat(fb, ub))), { cameras: oblique });
      assert.equal(o.mitigated, fa !== fb || ua !== ub ? 1 : 0, `at an angle, A (${fa}, ${ua}) vs B (${fb}, ${ub}): mitigated ${o.mitigated}`);
    }
    assert.throws(() => zFight(set2(quad("decal")), { cameras: near, heightPx: 0 }), /heightPx/);
  }
  for (const bad of [NaN, 0, Infinity, -1, "1"]) {
    const c = cam(200, 10, 10000); c.aspect = bad;
    assert.throws(() => zFight(set(quad("decal")), { cameras: c }), /aspect/, "a camera whose aspect is " + bad + " is refused, not read as a pass");
  }
  { // looked at but edge-on: the depth cannot be computed, so the pair is unseen, never passed in no bucket
    const edge = cam(300, 10, 10000, Math.PI / 2); edge.position.set(300, 0, 0); edge.updateMatrixWorld(true);
    const e = zFight(set(quad("decal")), { cameras: edge });
    assert.deepEqual([e.pairs.length, e.unseen, e.mitigated], [0, 1, 0], "an edge-on view cannot decide the pair: unseen " + JSON.stringify(e));
  }
  assert.throws(() => zFight(set(quad("d")), {}), /cameras/);
  assert.throws(() => zFight(set(quad("d")), { cameras: {} }), /cameras/);
}
{ // Showing a quantity (visual-direction.md §13): an arrow's width is its value on the film's one scale, whatever its
  // direction or reveal; a tile fill counts and sums what it covers; two arrows on one scale keep their values' ratio. At any scale (K.M).
  const Mq = K.M, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const xs = (a) => { const p = a.mesh.geometry.attributes.position; return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i)]); };
  const tail = (a) => { const ys = xs(a).filter(([x]) => Math.abs(x) < 1e-9).map(([, y]) => y); return Math.max(...ys) - Math.min(...ys); };
  const a1 = flowArrow({ from: V(0, 0, 0), to: V(1, 0, 0), value: 1, scale: 0.02 });
  const a3 = flowArrow({ from: V(0, 1, 0), to: V(0.4, 1.3, 0), value: 3, scale: 0.02 });
  assert.ok(Math.abs(tail(a3) / tail(a1) - 3) < 1e-9, "arrow width ratio equals value ratio: " + tail(a3) / tail(a1));
  assert.ok(Math.abs(tail(a1) * Mq - 0.02) < 1e-9 && a1.width === 0.02, "width = value x scale, in metres");
  a3.group.updateMatrixWorld(true);
  assert.ok(a3.mesh.localToWorld(V(a3.length, 0, 0)).distanceTo(V(0.4, 1.3, 0)) < 1e-9, "the tip is on `to`");
  assert.ok(Math.abs(a3.reveal(0.5) - 0.5 * a3.length) < 1e-9 && Math.abs(Math.max(...xs(a3).map(([x]) => x)) - 0.5 * a3.length) < 1e-9, "reveal(0.5) draws half");
  assert.ok(Math.abs(tail(a3) / tail(a1) - 3) < 1e-9, "a growing arrow keeps its width");
  assert.ok(a3.reveal(0) === 0 && a3.mesh.visible === false, "reveal(0) draws nothing");
  for (const bad of [0, -1, NaN, Infinity, "1", undefined]) assert.throws(() => flowArrow({ from: V(0, 0, 0), to: V(1, 0, 0), value: bad, scale: 0.02 }), /value/, "value " + bad + " is refused");
  for (const bad of [0, -0.1, NaN, "0.02"]) assert.throws(() => flowArrow({ from: V(0, 0, 0), to: V(1, 0, 0), value: 1, scale: bad }), /scale/);
  assert.throws(() => flowArrow({ from: V(0, 0, 0), to: V(0, 0, 0), value: 1, scale: 0.02 }), /same point/);
  assert.throws(() => flowArrow({ from: V(0, 0, 0), to: V(0, 0, 1), value: 1, scale: 0.02 }), /parallel/);

  const tf = tileFill({ w: 3, d: 4, cell: 0.5 });
  assert.deepEqual([tf.cols, tf.rows, tf.count], [6, 8, 48], "3 x 4 m in 0.5 m cells");
  assert.ok(Math.abs(tf.area(tf.count) - 12) < 1e-9, "the full fill is the area");
  assert.ok(tf.show(10) === 10 && tf.mesh.count === 10 && Math.abs(tf.area() - 2.5) < 1e-9, "show(n) draws n cells, area() is theirs");
  assert.deepEqual([tf.show(-3), tf.show(999), tf.show(NaN)], [0, 48, 0], "show is clamped");
  const odd = tileFill({ w: 3, d: 4, cell: 0.7 });
  assert.ok(odd.count === 30 && Math.abs(odd.area(30) - 12) < 1e-9, "cut cells at the edges still sum to the area");
  assert.equal(tileFill({ w: 3, d: 3, cell: 0.1 }).cols, 30, "no sliver column from float error");
  const m0 = new THREE.Matrix4(); tf.mesh.getMatrixAt(0, m0);
  assert.ok(new THREE.Vector3().setFromMatrixPosition(m0).y >= 0.001 && tf.mesh.material.polygonOffset, "cells lift off the floor");
  assert.ok(tf.edges.w.position.x === 1.5 && tf.edges.d.position.z === 2, "dimension tag anchors at the edge middles");
  for (const bad of [{ w: 0, d: 1, cell: 1 }, { w: 1, d: 1, cell: -1 }, { w: 1, d: NaN, cell: 1 }]) assert.throws(() => tileFill(bad), /tileFill/);

  // Two arrows on one scale: widths in the ratio of their values (an A/B pair differs only in the value).
  const fa = flowArrow({ from: V(-0.15 / Mq, 0.5 / Mq, 0), to: V(0.15 / Mq, 0.5 / Mq, 0), value: 1, scale: 0.01 }), fb = flowArrow({ from: V(-0.15 / Mq, 0.5 / Mq, 0), to: V(0.15 / Mq, 0.5 / Mq, 0), value: 3, scale: 0.01 });
  assert.ok(Math.abs(tail(fb) / tail(fa) - 3) < 1e-9, "arrows on one scale, in the ratio of their values");
}
{ // Electricity (circuit.js): a flow's SHAPE is its waveform, drawn at a stated visualisation speed with the mains
  // frequency slowed on purpose (30 fps cannot show 50 Hz); a lamp's light falls with its voltage by its curve; an arc
  // lights the scene only for its frames; a hot part glows by black-body colour and never writes a shared material.
  const Mq = K.M, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const wire1 = () => wire([V(0, 0, 0), V(1 / Mq, 0, 0)]); // 1 m
  const ac = (o = {}) => flow(wire1(), { current: () => 2, waveform: "ac", freq: 50, speed: 0.5, timeScale: 0.1, ...o });
  const w1 = wire1();
  assert.ok(Math.abs(w1.length - 1) < 1e-9, "a wire's length is in metres at any scale: " + w1.length);
  const bent = wire([V(0, 0, 0), V(0.3 / Mq, 0, 0), V(0.3 / Mq, 0, 0.7 / Mq)]);
  assert.ok(Math.abs(bent.length - 1) < 1e-9 && bent.pointAt(0.3).distanceTo(V(0.3 / Mq, 0, 0)) < 1e-3 && bent.pointAt(99).distanceTo(V(0.3 / Mq, 0, 0.7 / Mq)) < 1e-9, "pointAt follows the corners and is clamped to the end");
  for (const bad of [[V(0, 0, 0)], [V(0, 0, 0), V(0, 0, 0)], []]) assert.throws(() => wire(bad), /wire/, "a wire needs two distinct points");
  assert.throws(() => wire([V(0, 0, 0), V(1, 0, 0)], { kind: "pipe" }), /wire/);

  // A period in the pulse shape: 50 Hz shown at 1/10 speed, travelling at 0.5 m/s, has a wavelength of 0.1 m.
  const f = ac();
  assert.ok(f.shownFreq === 5 && Math.abs(f.lambda - 0.1) < 1e-12, "shown frequency and wavelength: " + f.shownFreq + " Hz, " + f.lambda + " m");
  assert.ok(/50 Hz/.test(f.label) && /1\/10/.test(f.label) && /visuali[sz]ation/.test(f.label), "the on-screen label states frequency, time scale and speed: " + f.label);
  const row = f.sample(0.013, 401)[0], ds = 1 / 400, ups = [];
  for (let i = 1; i < row.length; i++) if (row[i - 1].y < 0 && row[i].y >= 0) ups.push(row[i - 1].s + ds * (-row[i - 1].y / (row[i].y - row[i - 1].y)));
  assert.ok(ups.length >= 9, "ten periods fit in 1 m: " + ups.length);
  for (let i = 1; i < ups.length; i++) assert.ok(Math.abs(ups[i] - ups[i - 1] - 0.1) < ds, "zero crossings are one wavelength apart: " + (ups[i] - ups[i - 1]));
  const y0 = row[100].y;
  assert.ok(Math.abs(f.sample(0.013 + 1 / 5, 401)[0][100].y - y0) < 1e-9, "the shape repeats after one shown period");
  assert.ok(Math.abs(f.sample(0.013 + 1 / 10, 401)[0][100].y + y0) < 1e-9, "and is mirrored after half of it");
  assert.ok(Math.abs(Math.max(...row.map((p) => p.y)) - 0.004) < 1e-4, "the wiggle's height is the amplitude, in metres");
  assert.throws(() => ac({ timeScale: 1 }), /alias/, "50 Hz at 30 fps is refused, not drawn as a standing wave");
  assert.doesNotThrow(() => ac({ timeScale: 1, fps: 400, speed: 5 }), "a frame rate that can show it is allowed");
  assert.throws(() => ac({ speed: undefined }), /speed/);
  assert.throws(() => ac({ freq: NaN }), /freq/);
  assert.throws(() => ac({ waveform: "x" }), /waveform/);
  assert.throws(() => ac({ current: 2 }), /current/);

  // The other shapes: dc is a straight line, pwm is chopped blocks, three phases lag 120 degrees.
  const dc = flow(wire1(), { current: () => 1, waveform: "dc", speed: 0.5 });
  assert.ok(dc.sample(0.3)[0].every((p) => p.y === 0 && p.on), "dc is a straight line");
  const pw = flow(wire1(), { current: () => 1, waveform: "pwm", freq: 50, speed: 0.5, timeScale: 0.1, duty: 0.3 }).sample(0.2, 401)[0];
  assert.ok(Math.abs(pw.filter((p) => p.on).length / pw.length - 0.3) < 0.02, "pwm blocks are on for the duty share: " + pw.filter((p) => p.on).length / pw.length);
  const p3 = flow(wire1(), { current: () => 3, waveform: "3phase", freq: 50, speed: 0.5, timeScale: 0.1 }).sample(0.02, 401);
  assert.equal(p3.length, 3, "three phases are three ribbons");
  for (const i of [40, 123, 300]) {
    const ph = p3.map((r, k) => (r[i].y - (k - 1) * 3 * 0.004) / 0.004), phi = 2 * Math.PI * 5 * (0.02 - p3[0][i].s / 0.5);
    assert.ok(Math.abs(ph[0] + ph[1] + ph[2]) < 1e-9, "three phases sum to zero");
    ph.forEach((v, k) => assert.ok(Math.abs(v - Math.sin(phi - 2 * Math.PI * k / 3)) < 1e-9, "phase " + k + " lags " + k * 120 + " degrees"));
  }

  // Width and brightness follow |current|; none, none drawn.
  const wd = flow(wire1(), { current: (t) => (t < 1 ? 2 : t < 2 ? 1 : 0), waveform: "dc", speed: 0.5, width: 0.002, perAmp: 0.001, full: 2 });
  const hw1 = wd.at(0.5).halfWidth, hw2 = wd.at(1.5).halfWidth, pos = wd.ribbons[0].mesh.geometry.attributes.position;
  assert.ok(Math.abs(hw1 - 0.002) < 1e-12 && Math.abs(hw2 - 0.0015) < 1e-12 && hw1 > hw2, "half width = (width + perAmp x |I|) / 2: " + hw1 + ", " + hw2);
  wd.at(0.5);
  assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(pos, 0).distanceTo(new THREE.Vector3().fromBufferAttribute(pos, 1)) * Mq - 2 * hw1) < 1e-6, "the drawn ribbon has that width in metres");
  assert.ok(wd.at(0.5).brightness === 1 && Math.abs(wd.at(1.5).brightness - 0.5) < 1e-12 && wd.ribbons[0].mesh.visible, "brightness = |I| / full, capped at 1");
  wd.at(2.5);
  assert.equal(wd.ribbons[0].mesh.visible, false, "no current draws no ribbon");

  // A lamp: light output falls with voltage by the lamp type's cited curve (incandescent flux goes as V^3.4).
  assert.ok(LAMPS.incandescent.exponent === 3.4 && /^https:/.test(LAMPS.incandescent.src), "the curve carries its source");
  const bulb = new THREE.PointLight(), lp = lamp(bulb, { rated: { V: 230, lm: 800 }, voltage: (t) => 230 - 23 * t });
  lp.at(0);
  const i0 = bulb.intensity;
  assert.ok(Math.abs(i0 - 800 / (4 * Math.PI)) < 1e-9, "rated voltage gives rated lumens, as candela: " + i0);
  lp.at(1);
  assert.ok(Math.abs(lp.output(207) - 800 * 0.9 ** 3.4) < 0.5 && Math.abs(lp.output(207) - 559.1) < 0.5 && bulb.intensity < i0, "10 % less voltage, 30 % less light: " + lp.output(207));
  let prev = Infinity;
  for (let t = 0; t <= 10; t += 0.5) { lp.at(t); assert.ok(bulb.intensity <= prev, "the lamp only dims as voltage falls"); prev = bulb.intensity; }
  lp.at(10);
  assert.equal(bulb.intensity, 0, "no voltage, no light");
  const led = lamp(new THREE.PointLight(), { curve: [[0, 0], [100, 400], [200, 1000]], voltage: () => 150 });
  assert.ok(Math.abs(led.output(150) - 700) < 1e-9 && led.output(300) === 1000 && led.output(-5) === 0, "a datasheet table is interpolated and held past its end");
  assert.throws(() => lamp(new THREE.PointLight(), { voltage: () => 1 }), /rated|curve/, "a lamp needs its rating or its curve");
  assert.throws(() => lamp(new THREE.PointLight(), { type: "led", rated: { V: 12, lm: 800 }, voltage: () => 1 }), /type|curve/, "a type with no cited curve is refused");
  assert.throws(() => lamp(new THREE.PointLight(), { rated: { V: 230, lm: 800 } }), /voltage/);

  // An arc: light only in its frames; shorter than a frame is refused; the same seed draws the same flash.
  const A = { from: V(0, 0.1, 0), to: V(0.03 / Mq, 0.1, 0), t0: 2, dur: 0.005, timeScale: 0.05, energy: 50, efficacy: 20 };
  const a = arc(null, A);
  a.at(1.99);
  assert.ok(a.light.intensity === 0 && a.channel.visible === false && !a.on(1.99), "no light before the flash");
  a.at(2.05);
  assert.ok(Math.abs(a.light.intensity - 20 * 50 / 0.005 / (4 * Math.PI)) < 1e-6 && a.channel.visible && a.on(2.05), "light = efficacy x energy / duration while it lasts: " + a.light.intensity);
  a.at(2.11);
  assert.ok(a.light.intensity === 0 && a.channel.visible === false && !a.on(2.11), "no light after the flash (shown 0.1 s)");
  assert.throws(() => arc(null, { ...A, timeScale: 1 }), /frame/, "a flash shorter than a frame is never seen: slow it");
  assert.throws(() => arc(null, { ...A, efficacy: undefined }), /efficacy/, "efficacy has no default");
  assert.throws(() => arc(null, { ...A, energy: 0 }), /energy/);
  const pa = (x) => Array.from(x.channel.geometry.attributes.position.array);
  assert.deepEqual(pa(arc(null, A)), pa(arc(null, A)), "the same seed gives the same channel");
  assert.notDeepEqual(pa(arc(null, A)), pa(arc(null, { ...A, seed: 7 })), "another seed gives another");
  assert.ok(pa(a).every(Number.isFinite) && a.channel.geometry.attributes.position.count >= 64, "the channel is a jagged path with branches");
  assert.ok(a.events[0].kind === "custom" && a.events[0].tag === "arc-flash" && a.events[0].t === 2, "an sfx event row at the flash");
  // sparks fly by gravity only: the second difference of height over equal time steps is -g dt^2 (real time)
  const spark = (t) => { a.at(t); return Array.from(a.sparks.points.geometry.attributes.position.array); };
  const [s1, s2, s3] = [2.2, 2.4, 2.6].map(spark), dtau = 0.01;
  for (let i = 1; i < s1.length; i += 3) assert.ok(Math.abs(s1[i] - 2 * s2[i] + s3[i] + K.G * dtau * dtau) < 1e-6, "a spark's height follows its ballistic path: " + (s1[i] - 2 * s2[i] + s3[i]));
  assert.ok(s2.every(Number.isFinite) && a.at(2.4).sparksLit > 0 && a.at(1.99).sparksLit === 0 && a.at(9).sparksLit === 0, "sparks appear at the flash and cool out of sight");

  // Heat glow: black-body colour, red before white; nothing visible under the Draper point; the material is the part's own.
  const c1 = blackbody(1000).color, c3 = blackbody(3000).color;
  assert.ok(c1.r / c1.b > c3.r / c3.b && c1.r === 1 && c3.b > c1.b, "a hotter part is bluer");
  assert.ok(blackbody(3000).Y > blackbody(1000).Y * 10, "and far brighter");
  assert.ok(DRAPER > 780 && DRAPER < 820, "the Draper point");
  const shared = new THREE.MeshStandardMaterial({ color: 0x777777 }), bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  const g = glow(bar, { power: (t) => [0, 10, 50, 150][t], area: 0.001 });
  const Ts = [0, 1, 2, 3].map((t) => g.at(t).T), ints = [0, 1, 2, 3].map((t) => g.at(t).intensity);
  assert.ok(Ts[0] === 293.15 && ints[0] === 0, "no power: ambient, no glow");
  assert.ok(Ts[1] > Ts[0] && Ts[2] > Ts[1] && Ts[3] > Ts[2], "more power, hotter: " + Ts);
  assert.ok(ints[1] === 0 && ints[3] > 0 && ints[3] < 4, "below the Draper point it does not glow, above it does: " + ints);
  assert.ok(bar.material !== shared && shared.emissiveIntensity === 1 && shared.emissive.getHex() === 0, "a shared material is never written");
  assert.throws(() => glow(bar, { power: () => 1 }), /area/);
  assert.throws(() => glow(bar, { area: 0.001 }), /power|temperature/);
  // A bad model value is refused with its field named, never read as zero power (the part drawn cold): power(t) that is
  // NaN, undefined, a string or Infinity (a misspelt state key), and an unvalidated h or emissivity (a NaN coefficient
  // would end the solve at ambient). Zero power, h = 0 and emissivity = 1 are legitimate and stay.
  for (const [name, bad] of [["NaN", NaN], ["undefined", undefined], ["a string", "150"], ["Infinity", Infinity]]) assert.throws(() => glow(bar, { power: () => bad, area: 0.001 }).at(0), /power/, "glow refuses power " + name);
  assert.throws(() => glow(bar, { power: () => ({ P: 150 }).Pw, area: 0.001 }).at(0), /power/, "a misspelt state key is refused, not drawn cold");
  { let calls = 0; const g2 = glow(bar, { power: () => (calls++ ? NaN : 150), area: 0.001 }); g2.at(0); assert.throws(() => g2.at(1), /power/, "a model that fails for one frame is refused on that frame"); }
  for (const bad of [NaN, Infinity, -1, "10", null]) assert.throws(() => glow(bar, { power: () => 150, area: 0.001, h: bad }), /\bh\b/, "glow refuses h " + bad);
  for (const bad of [NaN, 0, -0.1, 1.5, "0.9", null]) assert.throws(() => glow(bar, { power: () => 150, area: 0.001, emissivity: bad }), /emissivity/, "glow refuses emissivity " + bad);
  assert.ok(glow(bar, { power: () => 150, area: 0.001, h: 0 }).at(0).T > 1000 && glow(bar, { power: () => 150, area: 0.001, emissivity: 1 }).at(0).T > 600, "h = 0 (radiation only) and emissivity 1 are legitimate");
  assert.equal(glow(bar, { power: () => 0, area: 0.001 }).at(0).T, 293.15, "zero power is ambient, still");
  // A lamp's colour temperature is checked when the lamp is made, not when a voltage first lights it.
  for (const bad of [NaN, 0, -2700, "2700", null]) assert.throws(() => lamp(new THREE.PointLight(), { rated: { V: 230, lm: 800 }, voltage: () => 0, cct: bad }), /cct/, "lamp refuses cct " + bad);
}
{ // Instrument widgets (instruments.js): a widget draws the number its model signal gives, with units and a label, and
  // prints "--" for a value it cannot read, never 0.
  // Instruments: drawn on a 2D canvas, they return the numbers they drew.
  const rec = () => {
    const calls = [], st = {};
    const ctx = new Proxy(st, {
      get: (o, k) => (k === "measureText" ? (s) => ({ width: String(s).length * 20 }) : k in o ? o[k] : (...a) => { calls.push([k, ...a]); }),
      set: (o, k, v) => { o[k] = v; return true; },
    });
    return { ctx, calls, texts: () => calls.filter((c) => c[0] === "fillText").map((c) => c[1]) };
  };
  { const r = rec(), sine = (tau) => Math.sin(2 * Math.PI * 50 * tau);
    const s = scope(r.ctx, { signal: sine, t: 0.0013, window: 0.04, range: [-1.2, 1.2], units: "V", label: "mains", x: 100, y: 200, w: 800, h: 400 });
    const mid = 200 + 200;
    let ups = 0;
    for (let i = 1; i < s.points.length; i++) if (s.points[i - 1] && s.points[i] && s.points[i - 1][1] > mid && s.points[i][1] <= mid) ups++;
    assert.equal(ups, 2, "40 ms of 50 Hz shows two periods");
    assert.ok(s.points.every(([x, y]) => x >= 100 && x <= 900 && y >= 200 && y <= 600), "the trace stays in its box");
    assert.ok(Math.abs(s.perDiv - 0.004) < 1e-12, "4 ms per division");
    assert.ok(r.texts().some((x) => /mains/.test(x)) && r.texts().some((x) => /4 ms\/div/.test(x)) && r.texts().some((x) => /V/.test(x)), "label, range units and time base are written: " + r.texts());
    const slow = scope(rec().ctx, { signal: sine, t: 0.13, timeScale: 0.1, window: 0.04, range: [-1.2, 1.2], units: "V", label: "mains", x: 0, y: 0, w: 800, h: 400 });
    let up2 = 0;
    for (let i = 1; i < slow.points.length; i++) if (slow.points[i - 1][1] > 200 && slow.points[i][1] <= 200) up2++;
    assert.equal(up2, 2, "a film slowed by a time scale still shows the signal's real waveform (real seconds)");
    for (const bad of [{ units: undefined }, { units: "" }, { label: undefined }]) assert.throws(() => scope(rec().ctx, { signal: sine, t: 0, range: [-1, 1], units: "V", label: "x", x: 0, y: 0, w: 10, h: 10, ...bad }), /units|label/, "units and a label are required");
    assert.throws(() => scope(rec().ctx, { signal: sine, t: 0, range: [1, 1], units: "V", label: "x", x: 0, y: 0, w: 10, h: 10 }), /range/);
    const nan = scope(rec().ctx, { signal: (tau) => (tau > 0 ? NaN : 0), t: 0.01, range: [-1, 1], units: "V", label: "x", x: 0, y: 0, w: 100, h: 100 });
    assert.ok(nan.points.some((p) => p === null) && !nan.points.some((p) => p && !Number.isFinite(p[1])), "a sample the signal cannot give is a gap, never a point at 0"); }
  { const r = rec(), m = meter(r.ctx, { value: 12, units: "V", label: "dc rail", x: 50, y: 50 });
    assert.equal(m.text, "12.0 V", "a readout with its units");
    assert.ok(r.texts().includes("12.0 V") && r.texts().includes("dc rail"), "drawn: " + r.texts());
    assert.equal(meter(rec().ctx, { value: 230.456, units: "V", label: "x", digits: 0, x: 0, y: 0 }).text, "230 V");
    assert.equal(meter(rec().ctx, { value: NaN, units: "V", label: "x", x: 0, y: 0 }).text, "--", "an unreadable value prints --, never 0");
    assert.throws(() => meter(rec().ctx, { value: 1, label: "x", x: 0, y: 0 }), /units/);
    assert.throws(() => meter(rec().ctx, { value: 1, units: "V", x: 0, y: 0 }), /label/); }
  { const mk = (value) => gauge(rec().ctx, { value, min: 0, max: 100, units: "rpm", label: "motor", x: 300, y: 300, r: 150 });
    const lo = mk(0), mid = mk(50), hi = mk(100), over = mk(250), under = mk(-5);
    assert.ok(lo.angle < mid.angle && mid.angle < hi.angle && Math.abs(mid.angle - (lo.angle + hi.angle) / 2) < 1e-9, "the needle angle is linear in the value");
    assert.ok(over.clamped && over.angle === hi.angle && under.clamped && under.angle === lo.angle && !hi.clamped, "clamped to the dial, and said");
    assert.ok(Math.abs(hi.angle - lo.angle - 4.71) < 1e-9, "the sweep");
    assert.equal(mk(NaN).angle, null, "no needle for an unreadable value");
    assert.throws(() => gauge(rec().ctx, { value: 1, min: 0, max: 10, label: "x", x: 0, y: 0, r: 10 }), /units/);
    assert.throws(() => gauge(rec().ctx, { value: 1, min: 5, max: 5, units: "V", label: "x", x: 0, y: 0, r: 10 }), /min|max/); }
  { const mk = (value) => barMeter(rec().ctx, { value, max: 20, units: "A", label: "load", x: 0, y: 0, w: 400, h: 60 });
    assert.ok(mk(5).fill === 0.25 && mk(40).fill === 1 && mk(-1).fill === 0 && mk(NaN).fill === null, "fill = value / max, clamped, null when unreadable");
    assert.throws(() => barMeter(rec().ctx, { value: 1, max: 20, units: "A", x: 0, y: 0, w: 1, h: 1 }), /label/);
    assert.throws(() => barMeter(rec().ctx, { value: 1, max: 0, units: "A", label: "x", x: 0, y: 0, w: 1, h: 1 }), /max/); }
}
{ // Fields (fields.js): a field is drawn by its law in real units. Lines are traced by RK4 from seeds spaced by FLUX, so
  // how close lines lie means how strong the field is; filings lie along B, a compass needle settles along it, and a
  // moving source re-traces everything from t alone.
  const Mq = K.M, V = (x, y, z) => new THREE.Vector3(x, y, z), m = (x, y, z) => V(x / Mq, y / Mq, z / Mq); // metres → scene units
  const MU0 = 1.25663706212e-6, rel = (a, b) => Math.abs(a - b) / Math.abs(b);

  // Coulomb: 1 nC at 1 m gives 8.98755 V/m, at any scene scale.
  const E1 = FLD.field([FLD.charge(1e-9, V(0, 0, 0))]).at(m(1, 0, 0));
  assert.ok(rel(E1.x, 8.9875517923) < 1e-6 && Math.abs(E1.y) < 1e-12 && Math.abs(E1.z) < 1e-12, "Coulomb's law in V/m: " + E1.x);

  { // Line density = strength. Equal flux per line: the share of a dipole's lines that cross its equatorial plane beyond
    // a radius rho is h / sqrt(rho² + h²) (the plane's flux outside rho, divided by the whole), and the density of
    // crossings per area falls as the field does.
    const h = 0.005, count = 2000, dip = FLD.field([FLD.charge(1e-9, m(0, 0, h)), FLD.charge(-1e-9, m(0, 0, -h))]);
    const { points: seeds, dir } = FLD.seeds(dip, { count });
    assert.equal(seeds.length, count);
    assert.equal(dir, 1, "lines leave the positive charge");
    const rhos = [], ends = {};
    for (const s of seeds) {
      const tr = FLD.trace(dip, s, { dir, maxLength: 2, stop: (p) => p.z <= 0 });
      ends[tr.ended] = (ends[tr.ended] || 0) + 1;
      if (tr.ended === "stop") { const a = tr.points.at(-2), b = tr.points.at(-1), u = a.z / (a.z - b.z); rhos.push(Math.hypot(a.x + u * (b.x - a.x), a.y + u * (b.y - a.y))); }
    }
    assert.ok(!ends.singular, "no line ends on a singular point: " + JSON.stringify(ends));
    const beyond = (rho) => count - rhos.filter((r) => r <= rho).length; // lines that never reached the plane lie beyond too
    for (const k of [2, 5, 10, 20]) {
      const want = h / Math.sqrt((k * h) ** 2 + h * h), got = beyond(k * h) / count;
      assert.ok(Math.abs(got - want) < 0.1 * want + 2 / count, `line density = strength: ${got.toFixed(4)} of the lines cross beyond ${k}h, the flux law says ${want.toFixed(4)}`);
    }
    const per = (rho) => (rhos.filter((r) => r > rho && r <= 1.5 * rho).length) / (Math.PI * ((1.5 * rho) ** 2 - rho ** 2));
    const lawRatio = ((400 + 1) / (100 + 1)) ** 1.5, ratio = per(10 * h) / per(20 * h);
    assert.ok(Math.abs(ratio / lawRatio - 1) < 0.2, "crossings per area fall as 1/rho³ far away: ratio " + ratio.toFixed(2) + " vs " + lawRatio.toFixed(2));
  }

  { // Sources in real units.
    const R = 0.05, I = 2, lp = FLD.field([FLD.loop(I, { at: V(0, 0, 0), normal: V(0, 0, 1), R })]);
    for (const z of [0, 0.03, 0.1]) {
      const want = MU0 * I * R * R / (2 * (R * R + z * z) ** 1.5), got = lp.at(m(0, 0, z));
      assert.ok(rel(got.z, want) < 0.005 && Math.abs(got.x) < 1e-9 * want, `a current loop on its axis at ${z} m: ${got.z} T vs ${want} T`);
    }
    const w = FLD.field([FLD.straightWire(10, m(-1, 0, 0), m(1, 0, 0))]), bw = w.at(m(0, 0.01, 0));
    assert.ok(rel(bw.z, MU0 * 10 / (2 * Math.PI * 0.01)) < 0.005, "a long straight wire: mu0 I / 2 pi r, got " + bw.z);
    assert.ok(bw.z > 0 && Math.abs(bw.x) < 1e-12 && Math.abs(bw.y) < 1e-12, "right-hand rule: I along +x, a point at +y gets B along +z");
    assert.ok(w.at(m(0, -0.01, 0)).z < 0, "and the other side gets -z");
    const Br = 1.3, L = 0.02, bar = FLD.barMagnet({ at: V(0, 0, 0), axis: V(1, 0, 0), length: L, width: 0.01, depth: 0.005, Br }), bf = FLD.field([bar]);
    const mom = (Br / MU0) * (L * 0.01 * 0.005), far = bf.at(m(10 * L, 0, 0)).x, want = MU0 / (4 * Math.PI) * 2 * mom / (10 * L) ** 3;
    assert.ok(rel(far, want) < 0.05, `a bar magnet far on its axis is a dipole of moment (Br/mu0)·V: ${far} T vs ${want} T`);
    assert.ok(bf.at(m(0.15, 0, 0)).x > 0 && bf.at(m(-0.15, 0, 0)).x > 0, "outside the magnet B runs along +axis on both ends of the axis (N at +axis)");
    const { points: ns, dir } = FLD.seeds(bf, { count: 24 });
    const ends = ns.map((s) => FLD.trace(bf, s, { dir, maxLength: 1 }).ended);
    assert.ok(ends.filter((e) => e === "sink").length >= 0.75 * ends.length && !ends.includes("singular"), "lines from the N face end in the magnet at S: " + ends.join());
    assert.ok(bar.mesh.userData.real && scaleAudit(bar.mesh).ok, "the magnet's mesh is its real size");
  }

  { // Filings lie along B and a compass settles along it.
    const bar = FLD.barMagnet({ at: V(0, 0, 0), axis: V(1, 0, 0), length: 0.02, width: 0.01, depth: 0.005, Br: 1.3 }), bf = FLD.field([bar]);
    const fil = FLD.filings(bf, { at: m(0, 0.02, 0), w: 0.2, d: 0.2, count: 3000 });
    assert.equal(fil.dirs.length, 3000);
    const bh = (p) => { const b = bf.at(p); b.y = 0; return b; };
    let worst = 1, mid = 0;
    fil.points.forEach((p, i) => {
      const d = fil.dirs[i], b = bh(p).normalize();
      worst = Math.min(worst, Math.abs(d.dot(b)));
      if (Math.abs(p.x * Mq) < 0.001) { mid++; assert.ok(Math.abs(d.x) > 0.99, "on the magnet's equatorial line the filings lie parallel to its axis: " + d.toArray()); }
    });
    assert.ok(worst > 0.999, "every filing lies along the in-plane field: " + worst);
    assert.ok(mid >= 5, "enough filings on the equatorial line to check: " + mid);
    assert.equal(fil.mesh.count, 3000);

    const c1 = FLD.compass(bf, { at: m(0.11, 0, 0), angle0: Math.PI / 2 }), c2 = FLD.compass(bf, { at: m(0.11, 0, 0), angle0: Math.PI / 2 });
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), deg = 180 / Math.PI;
    assert.ok(Math.abs(c1.at(0).angle - Math.PI / 2) < 1e-9, "starts where it was put");
    assert.ok(Math.abs(wrap(c1.at(5).angle)) * deg < 2, "the compass N end settles along B (+x, away from the magnet's N pole): " + c1.at(5).angle * deg);
    const a3 = c2.at(3).angle, a1 = c2.at(1).angle, once = FLD.compass(bf, { at: m(0.11, 0, 0), angle0: Math.PI / 2 }).at(1).angle;
    assert.ok(a1 === once && a3 === c1.at(3).angle, "at(t) is pure of t: asking 3 before 1 changes nothing");
    assert.ok(Math.abs(wrap(c1.at(0.2).angle)) * deg > 2, "it takes time to settle (it is not snapped to the field)");
  }

  { // A moving source re-traces from t; lines grow on cue.
    const mv = FLD.field([FLD.charge(1e-9, (t) => m(t * 0.01, 0, 0))]), ln = FLD.fieldLines(mv, { count: 12, maxLength: 0.05 });
    const p0 = ln.lines[0].points[0].clone();
    ln.at(1);
    assert.ok(Math.abs(ln.lines[0].points[0].x - p0.x - 0.01) < 1e-9, "the lines follow a source that moved 1 cm");
    ln.at(0);
    assert.ok(ln.lines[0].points[0].distanceTo(p0) < 1e-12, "and come back at t = 0 (pure of t)");
    const dip = FLD.field([FLD.charge(1e-9, m(0, 0, 0.005)), FLD.charge(-1e-9, m(0, 0, -0.005))]), st = FLD.fieldLines(dip, { count: 10, maxLength: 0.2 });
    assert.equal(st.lines.length, 10);
    st.reveal(0.5);
    for (const tube of st.tubes) assert.ok(Math.abs(tube.geometry.drawRange.count - tube.geometry.index.count / 2) <= 6, "half revealed: " + tube.geometry.drawRange.count + " of " + tube.geometry.index.count);
    st.reveal(0);
    assert.ok(st.tubes.every((t) => t.geometry.drawRange.count === 0) && st.arrows.count === 0, "nothing shown at 0");
    st.reveal(7);
    assert.ok(st.tubes.every((t) => t.geometry.drawRange.count === t.geometry.index.count) && st.arrows.count >= 10, "clamped at 1, one arrowhead per line");
    assert.ok(st.tubes.every((t) => t.material.depthTest === false && t.renderOrder === 10), "teaching lines draw on top of the world");
    const w = FLD.fieldLines(dip, { count: 4, maxLength: 0.2, mode: "world" });
    assert.ok(w.tubes.every((t) => t.material.depthTest !== false), "in-world lines are depth tested");
  }

  { // Refusals.
    assert.throws(() => FLD.field([]), /field/);
    assert.throws(() => FLD.field([FLD.charge(1e-9, V(0, 0, 0)), FLD.straightWire(1, V(0, 0, 0), V(1, 0, 0))]), /kind/, "E and B sources are not mixed");
    assert.throws(() => FLD.barMagnet({ at: V(0, 0, 0), axis: V(1, 0, 0), length: 0.02, width: 0.01, depth: 0.005 }), /Br/, "Br comes from the film's model");
    assert.throws(() => FLD.fieldLines(FLD.field([FLD.charge(1e-9, V(0, 0, 0))]), { count: 4, mode: "x" }), /mode/);
    assert.throws(() => FLD.charge(NaN, V(0, 0, 0)), /q/);
    assert.throws(() => FLD.loop(1, { at: V(0, 0, 0), normal: V(0, 0, 1), R: -1 }), /R/);
  }
}
{ // Optics (optics.js): rays are traced by Snell's law and the Fresnel split through the set's surfaces, with the index of a
  // cited material; a lens's focus is traced and compared with the lensmaker's formula, a prism spreads colours, a mesh from the
  // set refracts by its own normals, and a point under water is seen at its apparent place by the same law.
  const Mq = K.M, V = (x, y, z) => new THREE.Vector3(x, y, z), m = (x, y, z) => V(x / Mq, y / Mq, z / Mq); // metres → scene units
  const D = Math.PI / 180, rel = (a, b) => Math.abs(a - b) / Math.abs(b);
  const nAir = O.MATERIALS.air.n(589.3), nWater = O.MATERIALS.water.n(589.3), nBk7 = O.MATERIALS.bk7.n(587.6);
  const main = (r) => r.rays.reduce((a, b) => (b.power > a.power ? b : a)); // the escaping ray carrying the most power
  const axisCross = (ray) => { const t = -ray.origin.y / ray.dir.y; return ray.origin.z + t * ray.dir.z; }; // z where a ray crosses y = 0

  { // Cited indices.
    assert.ok(Math.abs(nWater - 1.333) < 5e-4 && Math.abs(O.MATERIALS.water.n(450) - 1.337) < 1e-3, "water: 1.333 at 589 nm and about 1.337 at 450 nm: " + nWater);
    assert.ok(Math.abs(nBk7 - 1.5168) < 2e-4 && Math.abs(O.MATERIALS.fusedSilica.n(587.6) - 1.4585) < 3e-4 && Math.abs(nAir - 1.000293) < 1e-6, "BK7, fused silica and air at the sodium line");
    assert.ok(O.MATERIALS.bk7.n(450) > O.MATERIALS.bk7.n(650), "normal dispersion: blue bends more than red");
    for (const k of Object.keys(O.MATERIALS)) assert.ok(typeof O.MATERIALS[k].source === "string" && O.MATERIALS[k].source.length > 10, k + " cites its source");
    assert.throws(() => O.material({ n: 1.5 }), /source/, "an index is cited, never typed");
    assert.ok(O.material({ n: 1.5, source: "selfcheck fixture" }).n(550) === 1.5);
  }

  { // Snell: air into water at 30° refracts to asin(sin 30° / n), by the helper and through an interface element.
    const dir = V(Math.sin(30 * D), -Math.cos(30 * D), 0), up = V(0, 1, 0), t = O.snell(dir, up, nAir, nWater);
    const got = Math.acos(-t.y);
    assert.ok(Math.abs(got - Math.asin(nAir * Math.sin(30 * D) / nWater)) < 1e-9, "Snell, exact with the same index");
    assert.ok(Math.abs(got - Math.asin(Math.sin(30 * D) / 1.33)) / D < 0.1, "within 0.1° of asin(sin 30° / 1.33): " + (got / D).toFixed(3));
    const pool = O.interface({ at: m(0, 0, 0), normal: up, below: "water", above: "air", size: 1 });
    const r = O.traceRay([pool], { origin: V(-0.1 * Math.sin(30 * D), 0.1 * Math.cos(30 * D), 0), dir });
    const first = r.segments.filter((s) => s.depth === 1).sort((a, b) => b.power - a.power);
    const seg = first[0], v = seg.b.clone().sub(seg.a).normalize();
    assert.ok(Math.abs(Math.acos(-v.y) - got) < 1e-6 && v.y < 0, "the traced ray bends the same way: " + (Math.acos(-v.y) / D).toFixed(3));
    const refl = first[1], rv = refl.b.clone().sub(refl.a).normalize();
    assert.ok(Math.abs(rv.y - Math.cos(30 * D)) < 1e-9 && rv.x > 0, "and the reflected ray leaves at the angle of incidence");
    const R = O.fresnel(Math.cos(30 * D), nAir, nWater);
    assert.ok(Math.abs(refl.power - R) < 1e-9 && Math.abs(seg.power - (1 - R)) < 1e-9 && R > 0.015 && R < 0.03, "the split is the Fresnel one, about 2 % at 30°: " + R);
  }

  { // Fresnel at normal incidence and total internal reflection.
    const R = O.fresnel(1, nAir, nBk7), want = ((nBk7 - nAir) / (nBk7 + nAir)) ** 2;
    assert.ok(Math.abs(R - want) < 1e-6 && R > 0.04 && R < 0.045, "air to glass reflects (n-1)²/(n+1)² = " + want.toFixed(4));
    assert.equal(O.fresnel(Math.cos(60 * D), nWater, nAir), 1, "water to air at 60° is past the critical angle (48.6°)");
    assert.equal(O.snell(V(Math.sin(60 * D), Math.cos(60 * D), 0), V(0, -1, 0), nWater, nAir), null);
    const pool = O.interface({ at: m(0, 0, 0), normal: V(0, 1, 0), below: "water", above: "air", size: 1 }), d = V(Math.sin(60 * D), Math.cos(60 * D), 0);
    const r = O.traceRay([pool], { origin: d.clone().multiplyScalar(-0.1), dir: d });
    assert.ok(r.rays.length === 1 && Math.abs(r.rays[0].power - 1) < 1e-12 && r.rays[0].dir.y < 0, "total internal reflection: one ray, all the power, back down");
  }

  { // A thin lens: the traced focus is the lensmaker's, a thick one the thick-lens formula; blue focuses nearer than red.
    const lens = O.lens({ at: m(0, 0, 0), axis: V(0, 0, 1), R1: 0.1, R2: -0.1, thickness: 0.004, diameter: 0.03, material: "bk7" });
    const thin = 1 / ((nBk7 - 1) * (1 / 0.1 + 1 / 0.1)), one = (lam) => O.traceRay([lens], { origin: V(0, 0.001, -0.05), dir: V(0, 0, 1), λ: lam });
    const f = axisCross(main(one(587.6)));
    assert.ok(rel(f, thin) < 0.015, `thin-lens focus 1/f = (n-1)(1/R1 - 1/R2): traced ${f} m, formula ${thin} m`);
    assert.ok(rel(f - 0.002, lens.bfd(587.6)) < 0.002, `and the back focal distance of the thick lens: ${f - 0.002} vs ${lens.bfd(587.6)}`);
    assert.ok(rel(lens.focal(587.6), 0.09741) < 0.001 && rel(lens.thin(587.6), thin) < 1e-9, "focal(): thick-lens f 97.4 mm, thin(): the lensmaker's");
    assert.ok(axisCross(main(one(450))) < axisCross(main(one(650))), "crown glass: blue focuses nearer than red");
    const b = O.bundle([lens], { source: { at: m(0, 0, -0.05), dir: V(0, 0, 1), kind: "parallel", radius: 0.001, count: 20 }, wavelengths: [587.6] }), im = b.image();
    assert.ok(rel(im.focal, f) < 0.005 && im.spread < 1e-4, `the bundle reports the focus: ${im.focal} m, spread ${im.spread}`);
    assert.ok(im.point.distanceTo(m(0, 0, f)) < 0.0005 / Mq, "image point on the axis, in scene units");
    assert.throws(() => O.lens({ at: m(0, 0, 0), axis: V(0, 0, 1), R1: NaN, R2: -0.1, thickness: 0.004, diameter: 0.03, material: "bk7" }), /R1/);
    assert.throws(() => O.lens({ at: m(0, 0, 0), axis: V(0, 0, 1), R1: 0.1, R2: -0.1, thickness: 0.004, diameter: 0.3, material: "bk7" }), /diameter/, "a rim wider than the sphere is refused");
    // R = 0.1 m over a 30 mm rim: each face sags 1.131 mm at the rim, so the faces cross below 2.262 mm of centre thickness.
    const thick = (t) => () => O.lens({ at: m(0, 0, 0), axis: V(0, 0, 1), R1: 0.1, R2: -0.1, thickness: t, diameter: 0.03, material: "bk7" });
    assert.throws(thick(0.002), /faces cross/, "faces that cross at the rim leave no glass there: refused");
    assert.throws(thick(0.0022), /faces cross/, "and just under the crossing thickness too");
    assert.doesNotThrow(thick(0.0023), "a lens just thick enough to keep an edge is accepted");
    const aud = scaleAudit(lens.mesh);
    assert.ok(lens.mesh.userData.real && aud.ok && aud.checked === 3, "the lens mesh is its real size: " + aud.problems.join("; "));
  }

  { // A prism at minimum deviation spreads colours: 2 asin(n sin 30°) - 60°; blue deviates more than red.
    const prism = O.prism({ at: m(0, 0, 0), apex: 60 * D, height: 0.05, length: 0.04, material: "bk7" });
    const dev = (lam) => {
      const n = O.MATERIALS.bk7.n(lam), th = Math.asin(n * Math.sin(30 * D)), phi = th - 30 * D, d = V(Math.cos(phi), 0, Math.sin(phi));
      const r = O.traceRay([prism], { origin: d.clone().multiplyScalar(-0.1), dir: d, λ: lam });
      return { got: main(r).dir.angleTo(d) / D, want: (2 * th - 60 * D) / D };
    };
    const g = dev(589.3);
    assert.ok(Math.abs(g.got - g.want) < 0.05, `minimum deviation ${g.got.toFixed(3)}° vs ${g.want.toFixed(3)}°`);
    assert.ok(dev(450).got > dev(650).got, "blue deviates more than red");
  }

  { // A spherical mirror R = 0.2 m focuses at R / 2.
    const mir = O.mirror({ at: m(0, 0, 0), normal: V(0, 0, 1), R: 0.2, diameter: 0.05 });
    const r = O.traceRay([mir], { origin: V(0, 0.001, 0.3), dir: V(0, 0, -1) });
    assert.ok(rel(axisCross(main(r)), 0.1) < 0.005, "mirror focus at R/2: " + axisCross(main(r)));
    assert.ok(O.traceRay([mir], { origin: V(0, 0.001, -0.3), dir: V(0, 0, 1) }).rays.every((x) => Math.abs(x.dir.z - 1) < 1e-12), "its back is not a mirror: the ray passes");
  }

  { // A glass ball from the set, traced through its own mesh with the mesh moved and scaled, refracts as the analytic ball does.
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial());
    ball.scale.setScalar(0.02 / Mq); ball.position.copy(m(0.003, 0.002, 0)); ball.updateMatrixWorld(true);
    const glass = O.surfaceFromMesh(ball, { inside: { n: 1.5, source: "selfcheck fixture" }, outside: "air" });
    // The ball sits 2 mm up (across the ray) and 3 mm along it; the ray runs 6 mm up, so 4 mm from the ball's centre. A mesh whose
    // move were ignored would be hit 6 mm from the centre (11.8° of deviation, not 7.8°), well outside the 0.5° window.
    const h = 0.004, R = 0.02, ti = Math.asin(h / R), tt = Math.asin(Math.sin(ti) * nAir / 1.5);
    const r = O.traceRay([glass], { origin: V(-0.05, 0.006, 0), dir: V(1, 0, 0) });
    const ex = main(r).dir;
    assert.ok(Math.abs(ex.angleTo(V(1, 0, 0)) / D - 2 * (ti - tt) / D) < 0.5, `ball deviation ${(ex.angleTo(V(1, 0, 0)) / D).toFixed(2)}° vs ${(2 * (ti - tt) / D).toFixed(2)}°`);
    assert.throws(() => O.surfaceFromMesh(ball, { inside: "water" }), /outside/);
  }

  { // Apparent depth: a point 10 cm under water, seen from straight above, is 10 cm × n_air / n_water deep.
    const pool = O.interface({ at: m(0, 0, 0), normal: V(0, 1, 0), below: "water", above: "air", size: 1 });
    const a = O.apparent(m(0, -0.1, 0), m(0, 0.5, 0), pool), depth = -a.image.y * Mq;
    assert.ok(rel(depth, 0.1 * nAir / nWater) < 0.01, "apparent depth " + depth);
    const side = O.apparent(m(0.05, -0.1, 0), m(0, 0.5, 0), pool), x = side.through;
    assert.ok(x.x > 0 && x.x * Mq < 0.05 && Math.abs(x.y) < 1e-12, "the sight line crosses the surface between the eye and the point");
    assert.ok(Math.abs(side.image.x * Mq - 0.05) < 1e-12, "the image lies on the vertical line through the point");
    assert.ok(-side.image.y * Mq < 0.1 && -side.image.y * Mq > 0.05, "shallower than the real depth, off the normal too");
    // A point meant to sit on the surface may land a rounding error above it: that is on the surface, not an error.
    for (const dy of [0, 1e-17, 1e-15, 1e-12]) {
      const on = O.apparent(m(0.02, dy, 0), m(0, 0.5, 0), pool);
      assert.ok(on.image.distanceTo(m(0.02, dy, 0)) < 1e-12 && on.through.distanceTo(m(0.02, dy, 0)) < 1e-12, "a point " + dy + " m above the surface is on it");
    }
    assert.throws(() => O.apparent(m(0.02, 1e-3, 0), m(0, 0.5, 0), pool), /below the surface/, "a point a millimetre above the surface is still refused");
  }

  { // Drawing: a shaft needs dust to be visible, a ray grows on cue, a caustic follows the concentration.
    const lens = O.lens({ at: m(0, 0, 0), axis: V(0, 0, 1), R1: 0.1, R2: -0.1, thickness: 0.004, diameter: 0.03, material: "bk7" });
    const b = O.bundle([lens], { source: { at: m(0, 0, -0.05), dir: V(0, 0, 1), kind: "parallel", radius: 0.01, count: 12 } });
    assert.throws(() => O.drawRays(b, { mode: "world" }), /dust/, "no dust, no visible shaft");
    const teach = O.drawRays(b, { mode: "teach" });
    assert.equal(teach.reveal(0).visible, 0);
    const half = teach.reveal(0.02).visible, all = teach.reveal(1).visible; // the front at 2 % of the longest path is still before the lens
    assert.ok(half > 0 && half < all && all === b.segments.length, `rays grow on cue: ${half} of ${all}`);
    assert.ok(teach.rays.material.depthTest === false && teach.rays.renderOrder >= 10, "teaching rays draw on top of the world");
    const world = O.drawRays(b, { mode: "world", dust: 0.05 });
    assert.ok(world.rays.material.blending === THREE.AdditiveBlending && world.rays.material.depthTest !== false, "a shaft is light in the scene: additive and depth tested");
    const spot = O.caustic(b, { surface: { at: m(0, 0, 0.0974), normal: V(0, 0, -1) } }), wide = O.caustic(b, { surface: { at: m(0, 0, 0.2), normal: V(0, 0, -1) } });
    assert.ok(spot.userData.radius < wide.userData.radius && spot.userData.concentration > wide.userData.concentration, "the caustic is smallest and brightest at the focus: " + spot.userData.radius + " vs " + wide.userData.radius);
    assert.ok(spot.userData.radius >= 0.0005 - 1e-12 && spot.userData.brightness <= 1, "never smaller than half a millimetre, never brighter than 1");
    // The source power is a unit: a beam of power 2 (or 0.5) looks like the same beam at power 1.
    const src = { at: m(0, 0, -0.05), dir: V(0, 0, 1), kind: "parallel", radius: 0.01, count: 12 }, onWide = { surface: { at: m(0, 0, 0.2), normal: V(0, 0, -1) } };
    const b2 = O.bundle([lens], { source: src, power: 2 }), dim = O.bundle([lens], { source: src, power: 0.5 });
    assert.ok(Math.abs(O.caustic(b2, onWide).userData.brightness - wide.userData.brightness) < 1e-9, "caustic brightness does not scale with the source power");
    assert.ok(Math.abs(O.caustic(dim, onWide).userData.brightness - wide.userData.brightness) < 1e-9, "nor shrink with a weaker source");
    { // minPower is a share of the source power: the 2 % reflection off water is kept at a 1 % floor and dropped at 5 %, at any source power.
      const pool = O.interface({ at: m(0, 0, 0), normal: V(0, 1, 0), below: "water", above: "air", size: 1 }), cnt = (power, minPower) => O.traceRay([pool], { origin: V(0, 0.1, 0), dir: V(0, -1, 0), power, minPower }).segments.length;
      assert.deepEqual([cnt(1, 0.01), cnt(4, 0.01), cnt(0.25, 0.01)], [3, 3, 3], "the reflection stays at a 1 % floor whatever the source power");
      assert.deepEqual([cnt(1, 0.05), cnt(4, 0.05), cnt(0.25, 0.05)], [2, 2, 2], "and goes at a 5 % floor whatever the source power");
      assert.throws(() => O.traceRay([pool], { origin: V(0, 0.1, 0), dir: V(0, -1, 0), power: 0 }), /power/, "a source of no power is refused");
    }
    const same = (x, y) => x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1e-9);
    const t2 = O.drawRays(b2, { mode: "teach" }), w2 = O.drawRays(b2, { mode: "world", dust: 0.05 });
    assert.ok(same(t2.rays.instanceMatrix.array, teach.reveal(1).rays.instanceMatrix.array), "teaching tubes are as thin for the same branches whatever the source power");
    assert.ok(same(w2.rays.instanceColor.array, world.reveal(1).rays.instanceColor.array), "and a shaft is as bright");
  }
}
// The frame's text on a perspective set: a lens in mm, a fixture set with three stations, and the drafting-style text
// on the frame (a dimension line, pill labels, a text band, the caption) all inside the safe area; then shots.js plays
// the same frames from data.
{
  const W = 1080, H = 1920, em = 0.55;
  const mockCtx = (paint) => {
    let px = 10; const log = [], noop = () => {};
    const c = {
      canvas: { width: W, height: H }, log, fillStyle: "", strokeStyle: "", lineWidth: 1, lineJoin: "", lineCap: "", textAlign: "", textBaseline: "", letterSpacing: "0px",
      get font() { return this._f; }, set font(v) { this._f = v; px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(v)[1]); },
      measureText: (s) => ({ width: [...s].length * em * px }),
      getImageData(x, y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const [r, g, b] = paint(x + i, y + j), o = (j * w + i) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; }
        return { width: w, height: h, data };
      },
      fillText(s, x, y) { log.push({ s, x, y, fill: c.fillStyle, font: c._f, px }); },
      strokeText(s, x, y) { log.push({ stroke: s, x, y }); },
      roundRect(...r) { log.push({ rect: r, fill: c.fillStyle }); }, rect(...r) { log.push({ rect: r, fill: c.fillStyle }); }, fillRect(...r) { log.push({ rect: r, fill: c.fillStyle }); },
    };
    for (const k of ["save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "stroke", "arc", "fill", "clip", "setLineDash", "translate", "rotate", "setTransform"]) c[k] = noop;
    return c;
  };
  const bright = () => [232, 233, 230];
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const inZone = (b, z) => b.x0 >= z.x0 - 1e-6 && b.x1 <= z.x1 + 1e-6 && b.y0 >= z.y0 - 1e-6 && b.y1 <= z.y1 + 1e-6;
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const up = V3(0, 1, 0);
  layoutFrame(mockCtx(bright), 0, { send: () => {} }); // empties the list of boxes drawn by the checks above

  // A lens on a 36 mm gauge on the frame's long side (objectStudio.js lensFov).
  assert.ok(Math.abs(OS.lensFov(70, 9 / 16) - 28.84) < 0.01 && Math.abs(OS.lensFov(100, 9 / 16) - 20.41) < 0.01 && Math.abs(OS.lensFov(135, 9 / 16) - 15.19) < 0.01, "70, 100 and 135 mm on a 36 mm gauge, portrait");
  assert.ok(Math.abs(OS.lensFov(100, 16 / 9) - 2 * Math.atan(36 / (16 / 9) / 200) * 180 / Math.PI) < 1e-9, "landscape: the gauge is the width");
  for (const bad of [0, -50, NaN, Infinity]) assert.throws(() => OS.lensFov(bad, 9 / 16), /mm/, "a focal length must be finite and > 0");

  // A fixture set: five parts on one axis along x (metres, scaled by 1/M) in one cut group, three stations framed by
  // camera.js frame() through a 70, 100 and 135 mm lens, each placed with a view offset that sets the subject low.
  const U = 1 / K.M, sg = new THREE.Group(), smat = new THREE.MeshStandardMaterial(), PILL = "#ffd400";
  const box3 = (w, h, x) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, h * U), smat); o.position.set(x * U, 0.01 * U, 0); sg.add(o); return o; }; // on one axis 1 cm up
  const sp = { cell: box3(0.065, 0.018, 0.0405), driver: box3(0.004, 0.016, 0.077), star: box3(0.002, 0.016, 0.082), led: box3(0.003, 0.005, 0.0845), reflector: box3(0.012, 0.02, 0.092) };
  const at3 = (x, y) => V3(x * U, y * U, 0);
  const sdims = { cell: { a: at3(0.008, 0.021), b: at3(0.073, 0.021), m: 0.065 }, gap: { a: at3(0.079, 0.019), b: at3(0.086, 0.019), m: 0.007 }, reflector: { a: at3(0.086, 0.023), b: at3(0.098, 0.023), m: 0.012 } };
  const boxOf = (...os) => { const b = new THREE.Box3(); for (const o of os) b.union(new THREE.Box3().setFromObject(o)); return b; };
  sg.updateMatrixWorld(true);
  const scut = cutaway(sg, { normal: V3(0, 0, 1), offset: 0 });
  const station = (target, mm, azimuth, elevation, margin) => ({ ...frame(target, { fov: OS.lensFov(mm, W / H), aspect: W / H, azimuth, elevation, margin }), view: { offsetY: -0.045 } });
  const fr = { wide: station(sg, 70, 20, 35, 1.25), medium: station(boxOf(sp.driver, sp.star, sp.led), 100, 15, 40, 1.15), macro: station(boxOf(sp.led, sp.star, sp.reflector), 135, 10, 50, 1.4) };
  const placeSt = (camera, st, w, h) => { placeCamera(camera, st); camera.setViewOffset(w, h, 0, (st.view?.offsetY ?? -0.045) * h, w, h); camera.updateProjectionMatrix(); return camera; };

  // Every text of the frame (band, labels, dimension, caption) is inside the safe area in all three stations.
  const caption = [{ text: "the cell feeds the driver", start: 0, end: 5, words: ["the", "cell", "feeds", "the", "driver"].map((w, i) => ({ text: w, start: i * 0.3, end: i * 0.3 + 0.25, gap: true })) }];
  const zone = safeArea("shorts", W, H);
  for (const k of ["wide", "medium", "macro"]) {
    const st = fr[k], cam = new THREE.PerspectiveCamera(st.fov, W / H, 1e-4, 100);
    placeSt(cam, st, W, H);
    const ctx = mockCtx(bright);
    const band = textBand(ctx, { kicker: "How it works", headline: "The cell pushes 1.5 A through the driver", tag: "Illustration" }, { format: "shorts" });
    const [pa, pb] = { wide: [sp.cell, sp.driver], medium: [sp.driver, sp.star], macro: [sp.led, sp.reflector] }[k];
    const l1 = pinLabel(ctx, { at: pa, camera: cam, text: "cell" }, { pill: PILL, top: band.box.y1 });
    const l2 = pinLabel(ctx, { at: pb, camera: cam, text: "driver" }, { pill: PILL, top: band.box.y1 });
    const d = { wide: sdims.cell, medium: sdims.gap, macro: sdims.reflector }[k];
    const dm = dimension(ctx, d.a, d.b, { camera: cam, text: Math.round(d.m * 1000) + " mm", dir: up, top: band.box.y1 });
    drawCaption(ctx, 0.5, caption, { format: "shorts", pill: true, accent: PILL });
    const rec = layoutFrame(ctx, 0.5, { send: () => {} });
    assert.ok(l1 && l2, k + ": both labels are on the frame");
    assert.ok(dm && dm.drawn === true, k + ": the dimension line is drawn: " + JSON.stringify(dm));
    const cap = rec.boxes.find((b) => b.kind === "caption");
    assert.ok(cap && rec.boxes.length === 7, k + ": kicker, headline, tag, 2 labels, dimension and caption are recorded: " + rec.boxes.length);
    for (const b of rec.boxes) {
      assert.ok(inZone(b, b.kind === "caption" ? zone.caption : zone.text), k + ": " + b.kind + " \"" + b.text + "\" is inside the safe area: " + JSON.stringify(b));
      assert.ok(b.size >= 36 - 1e-6, k + ": " + b.text + " is at least 36 px: " + b.size);
      if (b.kind === "label") assert.ok(!overlap(b, cap), k + ": " + b.text + " does not touch the caption");
    }
    for (const b of [l1, l2]) assert.ok(b.y >= band.box.y1 - 1e-6, k + ": a pill label stays under the text band");
  }

  // shots.js: the same three frames from data. The camera and every drawn call match the hand-written frame; a shot
  // list with a missing beat, an overshooting key, a label off the frame or a shot with no action is refused.
  { const BEATS = { hook: { start: 0.2, end: 1.4 }, inside: { start: 3.1, end: 4.0 }, detail: { start: 6.0, end: 7.1 } };
    const WORDS = Array.from({ length: 30 }, (_, i) => ({ start: i * 0.3, end: i * 0.3 + 0.25 }));
    assert.ok(cueTime("inside", { beats: BEATS }) === 3.1 && cueTime("inside.end", { beats: BEATS }) === 4.0 && cueTime("w3.end", { words: WORDS }) === 1.15, "cues: a beat's start or end, a word's start or end");
    assert.ok(cueTime("hook", { beats: [{ name: "hook", start: 0.2, end: 1.4 }] }) === 0.2, "beats.json's array works as well as BEATS");
    const BAND = { kicker: "How it works", headline: "The cell drives the LED through the driver", tag: "Illustration" };
    const SHOTS = [
      { name: "wide", beat: "hook", action: "flow", transition: "cut", camera: [{ station: "wide" }], band: BAND, labels: [{ part: "cell", text: "cell" }, { part: "driver", text: "driver" }], dims: [{ dim: "cell" }] },
      { name: "medium", beat: "inside", action: "flow", transition: "cut", view: 90, camera: [{ station: "medium" }], band: BAND, labels: [{ part: "driver", text: "driver" }, { part: "star", text: "star board" }], dims: [{ dim: "gap" }] },
      { name: "macro", beat: "detail", action: "flow", transition: "cut", view: 180, camera: [{ station: "macro" }], band: BAND, labels: [{ part: "led", text: "LED" }, { part: "reflector", text: "reflector" }], dims: [{ dim: "reflector" }] },
    ];
    const set = { stations: fr, parts: sp, dims: sdims, cut: scut, group: sg, keep: [], actions: ["flow"], at: () => ({}), place: placeSt };
    const T = { beats: BEATS, words: WORDS, end: 9.5, fps: 30, W, H, set, pill: PILL };
    const run = shots(SHOTS, T);
    assert.deepEqual(run.shots.map((s) => [s.start, s.end]), [[0.2, 3.1], [3.1, 6], [6, 9.5]], "each shot runs from its beat to the next one's");
    const hand = { wide: [["cell", "cell"], ["driver", "driver"], "cell"], medium: [["driver", "driver"], ["star", "star board"], "gap"], macro: [["led", "LED"], ["reflector", "reflector"], "reflector"] };
    const near = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 1e-9);
    for (const [i, k] of ["wide", "medium", "macro"].entries()) {
      const s = run.shots[i], t = (s.start + s.end) / 2, st = fr[k];
      const a = new THREE.PerspectiveCamera(30, W / H, 1e-4, 100), b = new THREE.PerspectiveCamera(st.fov, W / H, 1e-4, 100);
      run.at(t, a); placeSt(b, st, W, H);
      assert.ok(near(a.matrixWorld.elements, b.matrixWorld.elements) && near(a.projectionMatrix.elements, b.projectionMatrix.elements), k + ": the runner's camera is the hand-placed station");
      const ca = mockCtx(bright); run.draw(ca, t, a); const ra = layoutFrame(ca, t, { send: () => {} });
      const cb = mockCtx(bright), band = textBand(cb, BAND, { format: "shorts" });
      for (const [part, text] of hand[k].slice(0, 2)) pinLabel(cb, { at: sp[part], camera: b, text }, { format: "shorts", pill: PILL, top: band.box.y1 });
      const d = sdims[hand[k][2]];
      dimension(cb, d.a, d.b, { camera: b, text: Math.round(d.m * 1000) + " mm", dir: up, top: band.box.y1 });
      const rb = layoutFrame(cb, t, { send: () => {} });
      assert.ok(ra.boxes.length === 6, k + ": band (3), two labels and the dimension are drawn: " + ra.boxes.length);
      assert.deepEqual(ra.boxes, rb.boxes, k + ": the same boxes as the hand-written frame");
      assert.deepEqual(ca.log, cb.log, k + ": the same draw calls as the hand-written frame");
    }
    // travel: the camera leaves the previous pose on the shot's beat and arrives on the station at the end of its beat, never past it
    const moved = structuredClone(SHOTS); moved[1].transition = "travel";
    const tr = shots(moved, T), wide = fr.wide, med = fr.medium, dist = (t) => tr.pose(t).position.distanceTo(med.position);
    assert.ok(tr.pose(3.0).position.equals(wide.position) && tr.pose(4.0).position.equals(med.position) && tr.pose(5).position.equals(med.position), "travel: wide until the beat, medium from its end");
    for (let t = 3.1, prev = Infinity; t <= 4.0; t += 1 / 30) { const x = dist(t); assert.ok(x <= prev + 1e-9, "travel: the camera only closes on the station (no overshoot) at " + t.toFixed(3)); prev = x; }
    const bad = (edit, rx, why) => { const l = structuredClone(SHOTS); edit(l); assert.throws(() => shots(l, T), rx, why); };
    bad((l) => { l[1].beat = "nowhere"; }, /no beat "nowhere"/, "a shot on a beat that is not in beats.json");
    bad((l) => { l[0].camera.push({ station: "medium", at: "hook", ease: (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2 }); }, /overshoots/, "a key whose ease goes past its station");
    bad((l) => { l[2].labels.push({ part: "cell", text: "cell" }); }, /label "cell" on "cell" is off the frame/, "a label on a part the macro does not frame");
    bad((l) => { l[0].action = null; }, /no action/, "a 2.9 s shot where the subject does nothing");
    bad((l) => { l[0].action = "spin"; }, /not one of set.actions/, "an action the set does not have");
    bad((l) => { l[0].camera.push({ station: "medium", at: "w2" }); }, /arrive cue/, "a move that leaves on a word needs its arrival cue");
    bad((l) => { l[0].labels.push({ part: "cell", text: "cell", at: "w9" }); }, /read time/, "a label cued 0.4 s before its shot ends");
    bad((l) => { l[1].view = 40; }, /cuts to the same view \(35° from the shot before\)/, "a cut that turns the view under 60° is a jump cut");
    bad((l) => { delete l[1].view; }, /cuts to the same view \(5° from the shot before\)/, "a cut at the same view at a new size");
    { const l = structuredClone(SHOTS); l[1].view = 0; l[1].newSubject = true; assert.doesNotThrow(() => shots(l, T), "a cut to another subject is exempt");
      const t = structuredClone(SHOTS); t[1].view = 0; t[1].transition = "travel"; assert.doesNotThrow(() => shots(t, T), "a travel is not a cut: the same view is fine");
      const w = structuredClone(SHOTS); w[1].view = 270; w[2].view = 360; assert.doesNotThrow(() => shots(w, T), "the view turns the short way round (270° → 360° is 90°, a side)"); }
  }

  // dimension(): drafting style, kept in the safe area, or nothing and the reason.
  { const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    const lab = safeArea("shorts", W, H).labels, atY = (y) => y * 5 * Math.tan(Math.PI / 12); // NDC y to world y on the plane z = 0, 5 units from the camera
    const top = dimension(mockCtx(bright), V3(-0.3, atY(0.78), 0), V3(0.3, atY(0.78), 0), { camera: cam, text: "16 mm", dir: up, off: 0.15 * K.M });
    assert.ok(top.drawn && top.flipped === true && inZone(top.box, lab), "an edge near the top with its line standing off upward flips below: " + JSON.stringify(top));
    const mid = dimension(mockCtx(bright), V3(-0.3, 0, 0), V3(0.3, 0, 0), { camera: cam, text: "16 mm", dir: up, off: 0.15 * K.M });
    assert.ok(mid.drawn && mid.flipped === false && inZone(mid.box, lab) && mid.ends.length === 2, "in the middle the asked side is kept");
    const wideCtx = mockCtx(bright), wide = dimension(wideCtx, V3(-5, 0, 0), V3(5, 0, 0), { camera: cam, text: "99 mm", dir: up });
    assert.ok(wide.drawn === false && /safe area/.test(wide.why) && !wideCtx.log.some((l) => l.s || l.stroke), "an edge wider than the frame draws nothing and says why: " + JSON.stringify(wide));
    const tiny = dimension(mockCtx(bright), V3(0, 0, 0), V3(0.002, 0, 0), { camera: cam, text: "1 mm", dir: up });
    assert.ok(tiny.drawn === false && /short/.test(tiny.why), "an edge too short for its arrowheads and value draws nothing: " + JSON.stringify(tiny));
    assert.throws(() => dimension(mockCtx(bright), V3(-0.3, 0, 0), V3(0.3, 0, 0), { camera: cam, text: "", dir: up }), /text/);
    assert.throws(() => dimension(mockCtx(bright), V3(-0.3, 0, 0), V3(0.3, 0, 0), { camera: cam, dir: up }), /text/);
    assert.throws(() => dimension(mockCtx(bright), V3(-0.3, 0, 0), V3(0.3, 0, 0), { camera: cam, text: "x", dir: V3(1, 0, 0) }), /dir/, "a direction along the edge cannot stand it off");
    assert.throws(() => dimension(mockCtx(bright), V3(0, 0, 0), V3(0, 0, 0), { camera: cam, text: "x", dir: up }), /same point/);
    assert.equal(dimension(mockCtx(bright), V3(-0.3, 0, 10), V3(0.3, 0, 0), { camera: cam, text: "x", dir: up }), null, "an end behind the camera draws nothing");
    layoutFrame(mockCtx(bright), 0, { send: () => {} }); // empties the list of boxes drawn so far
    const rc = mockCtx(bright), r = dimension(rc, V3(-0.3, 0, 0), V3(0.3, 0, 0), { camera: cam, text: "16 mm", dir: up, off: 0.15 * K.M });
    const rec = layoutFrame(rc, 0, { send: () => {} }), box = rec.boxes[0];
    assert.ok(rec.boxes.length === 1 && box.kind === "label" && box.text === "16 mm" && Math.abs(box.x0 - r.text.x0) < 0.06 && Math.abs(box.y1 - r.text.y1) < 0.06, "layoutFrame sees the value's box");
    assert.ok(rc.log.some((l) => l.s === "16 mm" && l.fill === "#111111"), "the value is drawn in dark ink");
    recordBox("label", "x", { x0: 1, y0: 2, x1: 3, y1: 4 }, 40);
    assert.equal(layoutFrame(mockCtx(bright), 0, { send: () => {} }).boxes[0].text, "x", "recordBox hands a box to layoutFrame"); }

  // pinLabel with a pill: dark text on a yellow pill, a dark leader ending in a ringed dot; no pill keeps the old path.
  { const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    const at = V3(0, 0, 0), c1 = mockCtx(() => [20, 20, 20]), p = pinLabel(c1, { at, camera: cam, text: "valve" }, { pill: "#ffd400" });
    assert.ok(c1.log.some((l) => l.rect && l.fill === "#ffd400"), "the pill is yellow");
    assert.equal(c1.log.find((l) => l.s === "valve").fill, "#111111", "the pill's text is dark, whatever the ground");
    assert.ok(p.ink === "dark" && p.pill === "#ffd400" && !c1.log.some((l) => l.stroke), "dark ink, no halo on a pill");
    const c2 = mockCtx(() => [20, 20, 20]), q = pinLabel(c2, { at, camera: cam, text: "valve" });
    assert.ok(q.ink === "light" && !c2.log.some((l) => l.rect && l.fill === "#ffd400") && q.pill === undefined, "no pill: the label keeps its adaptive ink"); }

  // textBand: kicker in tracked caps (Medium), a headline (Bold), a tag, on a scrim, inside the label zone.
  { const lab = safeArea("shorts", W, H).labels, c = mockCtx(bright);
    layoutFrame(mockCtx(bright), 0, { send: () => {} }); // empties the list of boxes drawn so far
    const b = textBand(c, { kicker: "How it works", headline: "Six words that state the claim", tag: "Sped up" }, { format: "shorts" });
    const k = c.log.find((l) => l.s === "HOW IT WORKS"), h = c.log.filter((l) => l.s && /claim|Six/.test(l.s)), tg = c.log.find((l) => l.s === "SPED UP");
    assert.ok(k && k.px === 36 && /^500 .*Kohinoor Bangla, Helvetica/.test(k.font.replace(/"/g, "")), "the kicker is upper-cased Medium in the one typeface at 36 px: " + JSON.stringify(k));
    assert.ok(h.every((l) => /^700 /.test(l.font)), "the headline is Bold");
    assert.ok(h.length >= 1 && h.every((l) => l.px >= 64 && l.px <= 96), "the headline is 64-96 px");
    assert.ok(tg && tg.px === 36 && tg.fill === "#ffffff", "the tag is light on dark");
    assert.ok(c.log.some((l) => l.rect && l.fill === "rgba(255,255,255,0.72)"), "a light scrim sits behind the text");
    assert.ok(inZone(b.box, lab) && inZone(b.kicker, lab) && inZone(b.headline.box, lab) && inZone(b.tag, lab), "every box is inside the label zone: " + JSON.stringify(b.box));
    assert.equal(layoutFrame(c, 0, { send: () => {} }).boxes.filter((x) => x.kind === "label").length, 3, "kicker, headline and tag are recorded");
    const longH = "word ".repeat(30).trim(), b2 = textBand(mockCtx(bright), { headline: longH }, { format: "shorts" });
    assert.ok((b2.headline.lines.length <= 2 || b2.headline.shrunk === true) && inZone(b2.box, lab), "a 30-word headline fits in two lines or says it shrank, and stays inside the zone");
    assert.ok(b2.kicker === null && b2.tag === null, "kicker and tag are optional");
    assert.throws(() => textBand(mockCtx(bright), { kicker: "x" }, {}), /headline/);
    assert.throws(() => textBand(mockCtx(bright), { headline: "" }, {}), /headline/);
    layoutFrame(c, 0, { send: () => {} }); }
}
// found model: kit.model dresses a glTF by its own palette and kinds, checks its stated size, and loads Draco
{
  globalThis.ProgressEvent ??= class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } }; // three's FileLoader reports progress with a browser event
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1]), idx = new Uint16Array([0, 1, 2, 0, 0, 0]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer, 0, 6), Buffer.alloc(2)]); // padded to 4
  const acc = (o, min, max) => ({ bufferView: 0, byteOffset: o, componentType: 5126, count: 3, type: "VEC3", min, max });
  const js = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0, name: "body" }, { mesh: 1, name: "trim" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 2, material: 0 }] }, { primitives: [{ attributes: { POSITION: 1 }, indices: 2, material: 1 }] }],
    materials: [{ name: "Body", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }, { name: "Trim" }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    accessors: [acc(0, [0, 0, 0], [1, 1, 0]), acc(36, [0, 0, 1], [1, 1, 1]), { bufferView: 0, byteOffset: 72, componentType: 5123, count: 3, type: "SCALAR" }] };
  let j = Buffer.from(JSON.stringify(js)); j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.write("glTF", 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + bin.length, 8);
  const ch = (b, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.write(t, 4); return Buffer.concat([h, b]); };
  const url = "data:model/gltf-binary;base64," + Buffer.concat([head, ch(j, "JSON"), ch(bin, "BIN\0")]).toString("base64");
  const part = (g, n) => { let m; g.traverse((o) => { if (o.isMesh && o.material.name === n) m = o; }); return m; };
  const metres = 1 * K.M; // the fixture is 1 unit tall; a unit is M metres
  const found = await kit.model(url, { palette: { Body: 0x336699, Trim: 0x888888 }, kinds: { metal: /Trim/ }, real: { h: metres }, rest: false });
  assert.equal(part(found, "Body").material.color.getHex(), 0x336699, "a found model takes its own palette");
  assert.ok(Math.abs(part(found, "Trim").material.metalness - 0.3) < 1e-9, "and its own surface kinds (metal)");
  const plain = await kit.model(url, { rest: false });
  assert.equal(part(plain, "Body").material.color.getHex(), 0xff0000, "a model without a look keeps its own colour; the first one's look did not leak into the kit");
  assert.deepEqual(found.userData.real, { h: metres }, "real is the stated size, on the model");
  const ok = scaleAudit(found);
  assert.ok(ok.ok && ok.checked >= 1 && ok.off.length === 0, "the stated size matches the box: " + ok.problems.join("; "));
  const wrong = await kit.model(url, { real: { h: metres * 10 }, rest: false });
  assert.ok(scaleAudit(wrong).off.length === 1, "a stated size 10x off is reported");
  const none = scaleAudit(plain);
  assert.ok(none.unchecked.length >= 1 && none.checked === 0, "a model with no stated size is listed unchecked");
  [found, plain, wrong].forEach((g) => scene.remove(g));
  const built = fileURLToPath(dir);
  assert.ok(existsSync(join(built, "draco", "draco_decoder.wasm")) && existsSync(join(built, "draco", "draco_wasm_wrapper.js")), "the Draco decoder is installed beside the engine");
  const row = JSON.parse(readFileSync(join(built, ".engine.json"), "utf8")).find((r) => r.file === "draco/draco_decoder.wasm");
  assert.ok(row && row.licence === "Apache-2.0" && /draco/i.test(row.source), "the decoder is listed with its origin and licence");
}

// The isometric-world look: true iso (looking along (1, 1, 1)), the camera only pans and zooms (zoom in log, the
// direction never changes along a route), k is px per unit, three tones by face (top > left > right), isoLook keeps
// colour and clipping so a cutaway still cuts it, and the dry rig refuses a perspective pose.
{
  assert.ok(Math.abs(ISO.elevation - 35.2644) < 1e-3 && ISO.azimuth === 45, "true iso: azimuth 45, elevation 35.264");
  const W = 1080, H = 1920, cam = isoCamera(W, H), box = new THREE.Box3(new THREE.Vector3(-1, 0, -0.5), new THREE.Vector3(1, 1.5, 0.5));
  const wide = isoFrame(box, { W, H, margin: 1.2 }), close = isoFrame(new THREE.Box3(new THREE.Vector3(0.2, 0.2, 0), new THREE.Vector3(0.4, 0.4, 0.2)), { W, H });
  placeCamera(cam, wide);
  const dir = new THREE.Vector3(), iso = new THREE.Vector3(-1, -1, -1).normalize();
  assert.ok(cam.getWorldDirection(dir).distanceTo(iso) < 1e-9, "the iso camera looks along -(1, 1, 1)");
  const hb = heroBox(cam, new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 1).translate(0, 0.75, 0)), W, H);
  assert.ok(hb && Math.abs((hb.x0 + hb.x1) / 2 - W / 2) < 1 && Math.abs((hb.y0 + hb.y1) / 2 - H / 2) < 1, "isoFrame centres the box: " + JSON.stringify(hb));
  assert.ok(Math.abs(Math.max((hb.x1 - hb.x0) / W, (hb.y1 - hb.y0) / H) - 1 / 1.2) < 0.01, "isoFrame fills the frame to its margin");
  const st = stations({ home: wide, close }), r = route(st, [{ to: "close", start: 1, dur: 2 }]);
  for (const t of [0, 1.5, 2, 2.7, 3, 4]) { placeCamera(cam, r.at(t)); assert.ok(cam.getWorldDirection(dir).distanceTo(iso) < 1e-9, "the view never tilts or turns at " + t + " s"); }
  const mid = travel(2, st.home, st.close, { start: 1, dur: 2, ease: "linear" });
  assert.ok(Math.abs(mid.k - Math.sqrt(wide.k * close.k)) < 1e-9 && mid.speed > 0, "zoom in log: halfway is the geometric mean");
  assert.ok(r.at(3).k === close.k && r.at(0).k === wide.k && r.at(0).position === undefined, "the holds are the stations' iso poses");
  assert.throws(() => travel(1, st.home, { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 }, { dur: 1 }), /iso/, "a leg is iso at both ends or neither");
  assert.throws(() => placeCamera(new THREE.PerspectiveCamera(), wide), /isoCamera/, "an iso pose needs the ortho camera");
  // Three tones: top > left (+z) > right (+x), a slanted face in between, the shared matcap agrees at its centre.
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  assert.ok(isoTone(V(0, 1, 0)) === ISO_TONES.top && isoTone(V(0, 0, 1)) === ISO_TONES.left && isoTone(V(1, 0, 0)) === ISO_TONES.right && ISO_TONES.top > ISO_TONES.left && ISO_TONES.left > ISO_TONES.right, "top lightest, left mid, right darkest");
  const tex = isoMatcap(64), c = tex.image.data[(32 * 64 + 32) * 4] / 255;
  assert.ok(Math.abs(c - isoTone(V(1, 1, 1))) < 0.03, "the matcap's centre is the tone of a face square to the view");
  assert.ok(isoTone(V(1, 1, 0)) < ISO_TONES.top && isoTone(V(1, 1, 0)) > ISO_TONES.right, "a slanted face blends");
  // isoLook: colour and clipping kept, one material per shared original, a glowing part left alone; a cutaway still cuts it.
  const shared = new THREE.MeshStandardMaterial({ color: 0xd9503f }), glowM = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff8800 });
  const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared), new THREE.Mesh(new THREE.SphereGeometry(0.2), glowM));
  isoLook(g);
  const [a, b, lamp] = g.children;
  assert.ok(a.material.isMeshMatcapMaterial && a.material === b.material && a.material.color.getHex() === 0xd9503f && lamp.material === glowM, "isoLook: matcap, colour kept, shared stays shared, glow kept");
  const cut = cutaway(g, { flat: true });
  assert.ok(a.material.clippingPlanes?.includes(cut.plane) && a.material.isMeshMatcapMaterial, "a cutaway cuts an iso material");
  assert.ok(cut.group.children.filter((o) => o.material.colorWrite !== false).every((o) => o.material.isMeshBasicMaterial), "flat caps are unlit (the iso look has no lights)");
  // Ink lines after the cut share its planes (the removed half loses its lines); blueprint faces are the ground colour.
  inkLines(g);
  const ln = a.children.find((o) => o.userData.inkLine);
  assert.ok(ln && ln.material.clippingPlanes?.includes(cut.plane) && ln.geometry.attributes.position.count === 24, "ink lines: a box's 12 edges, cut with its mesh");
  inkLines(g); assert.equal(a.children.filter((o) => o.userData.inkLine).length, 1, "inkLines twice never doubles the lines");
  const bp = new THREE.Group(); bp.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 })));
  const dataM = new THREE.MeshBasicMaterial({ color: 0x3e9bd6 }), bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dataM); bar.userData.data = true; bp.add(bar);
  blueprintLook(bp, { bg: "#123A66" });
  assert.ok(bp.children[0].material.isMeshBasicMaterial && bp.children[0].material.color.getHexString() === "123a66" && bar.material === dataM, "blueprint: faces in the ground colour, a data mark keeps its colour");
  const sc = new THREE.Scene(), rig = isoStudio(null, sc, cam, { ground: "#E8EDEF" });
  assert.ok(sc.background.getHexString() === "e8edef" && rig.frame(0, wide).k === wide.k, "the dry iso rig places the camera and sets the sky");
  assert.throws(() => rig.frame(0, { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 }), /iso/, "the iso rig refuses a perspective pose");
}

// The object-studio kit (objectStudio.js + editorial.js): groups import it unchanged, so its traps are pinned here.
{
  for (const k of ["makeSet", "cam", "mat", "halfLathe", "contact", "backdrop", "canvasTex", "makeSweep", "w", "we", "wc", "b"]) assert.ok(OS[k], "objectStudio exports " + k);
  for (const k of ["makeOverlay", "captions", "envelope", "accentHtml", "tagSwing", "captionAt", "cues"]) assert.ok(ED[k], "editorial exports " + k);
  assert.throws(() => OS.makeSet(), /canvas/, "makeSet refuses a missing canvas");
  { // shot-list camera moves: a move window overrides the station travel; outside it the base run is untouched
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const base = { pose: (t) => ({ position: V(0, 1, 5), target: V(0, 0, 0), fov: 30, speed: 0 }), at: (t) => ({ t }) };
    const mv = { from: 2, to: 4, pose: (t) => ({ position: V(t, 1, 5), target: V(0, 0, 0), fov: 30 }) };
    const r = OS.withMoves(base, [mv], 30);
    assert.equal(r.pose(1).position.x, 0, "outside a move: the station pose");
    assert.equal(r.pose(3).position.x, 3, "inside a move: the move's pose");
    assert.ok(Math.abs(r.pose(3).speed - 1) < 1e-6, "speed from the move itself (1 m/s)");
    const cam = new THREE.PerspectiveCamera(30, 9 / 16, 0.01, 100); r.at(3, cam);
    assert.ok(Math.abs(cam.position.x - 3) < 1e-9, "at(t, camera) places the camera on the move");
    assert.throws(() => OS.withMoves(base, [{ from: 2, to: 1, pose: mv.pose }]), /to > from/, "a move with to <= from is refused");
  }
  assert.throws(() => OS.makeSet({}), /canvas/, "makeSet refuses something that is not a canvas");
  // A liquid is plain alpha (a transmission pass renders it opaque); a clear shell adds reflections only (an alpha shell veils the liquid).
  const liq = OS.mat.liquid("#E0A020");
  assert.ok(liq.transmission === 0 && liq.transparent && liq.opacity < 1 && liq.blending === THREE.NormalBlending && !liq.depthWrite, "mat.liquid: alpha, no transmission");
  assert.throws(() => OS.mat.liquid(), /colour/, "mat.liquid needs its colour");
  for (const [n, m] of [["clearPlastic", OS.mat.clearPlastic()], ["glass", OS.mat.glass()]])
    assert.ok(m.blending === THREE.AdditiveBlending && m.depthWrite === false && m.transmission === 0 && m.color.getHex() === 0, "mat." + n + ": additive reflections only, no depth write");
  assert.ok(OS.mat.steel().metalness > 0.8 && OS.mat.haze(0.3).transparent && OS.mat.matte(0x888888).isMeshStandardMaterial && OS.mat.plastic(0x888888).isMeshPhysicalMaterial, "steel, haze, matte, plastic");
  // The lens: 36 mm on the long side; a wider lens sees more; dof from an f-stop goes through camera.js dofFor.
  const st = OS.cam([0, 0.3, 1], [0, 0.1, 0], 50), wide = OS.cam([0, 0.3, 1], [0, 0.1, 0], 24);
  assert.ok(Math.abs(st.fov - fovFromMm(50, 36)) < 1e-9 && wide.fov > st.fov && !st.dof, "cam(): portrait lens on the long side, sharp without dof");
  const macro = OS.cam([0, 0.1, 0.3], [0, 0.1, 0], 100, { dof: { fstop: 2.8 } }), r = dofFor({ mm: 100, fstop: 2.8, focusM: 0.3 });
  assert.ok(Math.abs(macro.dof.range - r.focusRange) < 1e-12 && Math.abs(macro.dof.bokeh - r.bokehScale) < 1e-12, "cam(): dof from fstop and the focus distance");
  assert.throws(() => OS.cam([0, 0, 1], [0, 0, 0], 50, { dof: {} }), /dof/, "cam(): a dof with neither range nor fstop is refused");
  // halfLathe: the back half only (z <= 0), closed at the cut.
  const hl = OS.halfLathe([[0, 0], [0.04, 0], [0.04, 0.1], [0, 0.1]]).attributes.position.array;
  let zmax = -Infinity; for (let i = 2; i < hl.length; i += 3) zmax = Math.max(zmax, hl[i]);
  assert.ok(finite(hl) && zmax <= 1e-6, "halfLathe: the back half, z <= 0");
  // Cues: a word by text (case and punctuation ignored, nth occurrence), a beat by name; a missing one throws.
  const CU = ED.cues({ words: [{ text: "First,", start: 0.5, end: 0.9 }, { text: "first", start: 2, end: 2.4 }], beats: { hook: { start: 0, end: 3 } } });
  assert.ok(CU.w("FIRST") === 0.5 && CU.we("first", 1) === 2.4 && CU.wc("first", 1) === "w1" && CU.b("hook") === 0, "cues: words and beats");
  assert.throws(() => CU.b("nope"), /no beat "nope"/, "a missing beat throws");
  assert.throws(() => CU.w("absent"), /no word "absent"/, "a missing word throws");
  assert.throws(() => ED.cues({ beats: [{ name: "a", start: 1 }] }).b("b"), /no beat/, "a missing beat throws (beats.json array)");
  // Pure parts: the envelope, the accent word, the tag's fall and swing, the karaoke state.
  assert.ok(ED.envelope(0.99, 1, 2).a === 0 && ED.envelope(1.5, 1, 2).a === 1 && ED.envelope(2, 1, 2).a === 0 && ED.envelope(1.05, 1, 2).s < 1, "envelope: in, hold, out");
  { // overlay motion: a strong ease-out in, an accelerating exit at 0.7 of the entrance, durations by size, nothing from nothing
    const lin = ED.bezier(0, 0, 1, 1), so = ED.bezier(0.23, 1, 0.32, 1);
    assert.ok(Math.abs(lin(0.37) - 0.37) < 1e-4 && so(0) === 0 && so(1) === 1 && so(0.3) > 1 - 0.7 ** 3, "bezier: linear is identity, the strong ease-out beats a cubic at 30 %");
    assert.ok(ED.EASE.out(0.5) < 0.5 && ED.EASE.in(0.5) > 0.5, "exits accelerate away, reveals decelerate in");
    const D = ED.IN_DUR;
    assert.ok(D.pill < D.card && D.card < D.hl && Object.values(D).every((x) => x > 0 && x <= 0.8), "entrance grows with size, never over 0.8 s");
    assert.ok(ED.envelope(1.85, 1, 2, { inDur: 0.2 }).a === 1 && ED.envelope(1.93, 1, 2, { inDur: 0.2 }).a > 0.5 && ED.envelope(1.999, 1, 2, { inDur: 0.2 }).a < 0.1 && [1.9, 1.93, 1.96, 1.99].every((t, i, T) => !i || ED.envelope(t, 1, 2, { inDur: 0.2 }).a < ED.envelope(T[i - 1], 1, 2, { inDur: 0.2 }).a), "the exit takes 0.14 s (0.7 of 0.2), falling faster as it goes");
    const late = ED.envelope(1.99, 1, 2, { inDur: 0.2 });
    assert.ok(late.s < 1 && late.s >= 0.96, "an exit shrinks back toward 0.96: it leaves the way it came");
  }
  assert.equal(ED.accentHtml("a <b> [word]<br>x"), 'a &lt;b> <span class="ov-acc">word</span><br>x', "accent word on a chip, markup escaped, line break kept");
  const sw0 = ED.tagSwing(0, 0), swF = ED.tagSwing(0.42, 0), sw9 = ED.tagSwing(9, 0);
  assert.ok(sw0.y === -560 && swF.y === 0 && Math.abs(sw9.deg) < 0.01 && Math.abs(sw9.y) < 0.01 && ED.tagSwing(1, 1).deg === -ED.tagSwing(1, 0).deg, "tag: falls, catches, swings to rest; neighbours mirror");
  const CAPS = [{ start: 0, end: 1, words: [{ text: "a", start: 0 }, { text: "b", start: 0.5 }] }];
  assert.deepEqual([ED.captionAt(CAPS, 0.6), ED.captionAt(CAPS, 1.2)], [{ phrase: 0, word: 1 }, { phrase: -1, word: -1 }], "karaoke: the spoken word");
  // makeOverlay into a minimal fake document: a card and a headline are built and shown in their windows only.
  const fake = () => { const e = { children: [], style: { setProperty(k, v) { this[k] = v; } }, attrs: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild(c) { this.children.push(c); if (!this.firstChild) this.firstChild = c; return c; }, setAttribute(k, v) { this.attrs[k] = v; } }; return e; };
  const doc = { head: fake(), getElementById: () => null, createElement: fake, createElementNS: fake, createTextNode: fake };
  const root = fake(); root.ownerDocument = doc;
  const ov = ED.makeOverlay(root, { prefix: "t", G0: 10, accent: "#00AAFF" });
  assert.equal(typeof ov.chip, "undefined", "no illustration chip: a picture is never labelled not-to-scale on screen");
  const hlE = ov.headline({ kicker: "kicker", text: "a [b]", from: 11, to: 13 }), cardE = ov.card({ label: "L", rows: [{ k: "x", v: "1", hi: true }], source: "S", from: 12, to: 14 });
  assert.ok(hlE.innerHTML.includes('class="ov-acc">b<') && cardE.innerHTML.includes('class="ov-src">S<') && ov.layer.style["--ov-acc"] === "#00AAFF", "overlay: headline accent, card source line, accent colour");
  assert.throws(() => ov.card({ label: "L", value: "1", from: 12, to: 14 }), /source/, "a card without a source line is refused");
  assert.throws(() => ov.headline({ text: "x", from: 2, to: 1 }), /to > from/, "a window that ends before it starts is refused");
  assert.throws(() => ED.makeOverlay(root, {}), /prefix/, "makeOverlay needs a prefix");
  ov.update(1.5, null); // t = 11.5: the headline is on, the card not yet
  assert.ok(+hlE.style.opacity === 1 && cardE.style.opacity === "0", "overlay: shown in its window only (local t + G0)");
  assert.ok(ov.layer.children[0] === ov.glass && ov.glass.className === "ov-glass" && ov.glass.style.height === "518px" && ov.glass.style.opacity === "1.000", "top glass: first in the layer (under every overlay), the top 27 % of the frame, shown with the headline");
  assert.ok(ov.layer.children[1] === ov.glassB && ov.glassB.className === "ov-glass b" && ov.glassB.style.height === "326px", "bottom glass: under every overlay, the bottom 17 % of the frame");
  ov.update(5, null); // t = 15: no headline
  assert.equal(ov.glass.style.opacity, "0.000", "top glass: gone with the headline");
}
console.log("selfcheck ok: depth of field in metres (dofFor), object-studio kit (liquid alpha, additive clear shells, lens in mm, cues throw, overlay windows, top and bottom glass), iso look (true iso, pan and zoom only, three tones, cutaway on it), jet, cutaway, grains, type (phrases in four languages, adaptive ink, active word, pinned labels in the safe area, no repeat, layout boxes), camera stations and travel (hero box), attention by ghosting, loop end, studio rig (shadow refit per pose, AO from M), cue and shot lookup on one frame grid (snap, shotAt, overlayWindow, window check, read time), scale audit and z-fight probe, found model palette (own look, kinds, stated size, Draco decoder), showing a quantity (arrow width = value ratio, tile fill count and area, range bar), circuit (ac period in the pulse shape, alias refused, lamp curve, arc only in its frames, black-body glow, instruments), fields (dipole line density by flux, loop and wire on-axis, bar magnet far field, filings along B, a compass settling along B, a moving source re-traced, lines revealed on cue), optics (Snell 30° into water, Fresnel at normal incidence, total internal reflection, thin and thick lens focus, mirror focus, prism dispersion, a mesh from the set, apparent depth, rays grown on cue, shafts and caustics), frame text (lens in mm, dimension lines, pill labels, text band in the safe area), shots from data (three frames match by hand, missing beat, overshoot, off-frame label, no action refused), any scale");
