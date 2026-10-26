#!/usr/bin/env node
// node selfcheck.mjs <project>/assets/engine — after build.mjs: each check fails loudly if a known trap is back.
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { realpathSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const dir = pathToFileURL(resolve(process.argv[2] || ".") + "/").href, use = (f) => import(dir + f);
const { THREE } = await use("three-vendor.js");
const K = await use("kit.js"); // a namespace: M and G are live bindings, set by makeKit
const { makeSim, RAPIER, slow, replay } = await use("physics.js");
const { slide, hinge, spring, latch } = await use("mechanism.js");
const { bakeCurtain } = await use("cloth.js");
const { sweep } = await use("fur.js");
const { get } = await use("surfaces.js");
const { loose } = await use("bodies.js");
const { cushion } = await use("examples/interior.js");
const { makeWind, breeze, bakeBend, draught } = await use("wind.js");
const { jet } = await use("air.js");
const { tree, grass } = await use("plants.js");
const { particles, contrast, READABLE } = await use("particles.js");
const { water, dispersion, seaState } = await use("water.js");
const { cutaway } = await use("cutaway.js");
const { makeFlask } = await use("examples/flask.js");
const { grains, presets } = await use("grains.js");
const { makeCanister } = await use("examples/canister.js");
const { phrases, drawCaption, pinLabel, repeats, safeArea, inkFor, readTime } = await use("type.js");
const { stations, frame, travel, route, loopEnd, place: placeCamera, attend, snap, shotAt, overlayWindow, windowProblems } = await use("camera.js");
const { oner } = await use("examples/oner.js");

const scene = new THREE.Scene();
const kit = K.makeKit(scene, { mpu: 2 });
const M = K.M;
assert.equal(M, 2, "makeKit sets the scale every module reads");
const finite = (a) => Array.from(a).every(Number.isFinite);

// Surfaces: tileable maps with no NaN.
for (const k of ["fabric", "pile", "wood", "bamboo", "micro", "grains"]) { const s = get(k); assert.ok(finite(s.a.image.data) && finite(s.b.image.data), k + " map has NaN"); }

// Physics in real units: a 30 cm box dropped 10 cm onto a floor lands, touching it, within 2 mm, and the report
// says nothing floats or moves; a stuffed cushion (thousands of crowded points) builds a hull without aborting.
const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 4), new THREE.MeshStandardMaterial());
floor.position.y = -0.05; scene.add(floor);
const cube = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshStandardMaterial());
cube.position.set(0, 0.075 + 0.05, 0); cube.name = "box"; scene.add(cube);
const pillow = cushion(kit); // the stuffed shape: crowded, nearly coplanar points at its seam
assert.ok(finite(pillow.geometry.attributes.position.array), "cushion has NaN vertices");
pillow.position.set(0.5, 0.2, 0); pillow.name = "cushion"; scene.add(pillow);
scene.updateMatrixWorld(true);
const sim = await makeSim(THREE);
assert.ok(Math.abs(sim.world.gravity.y + 9.81 / 2) < 1e-6, "gravity in scene units: 9.81 / M");
sim.staticScene(scene, [cube, pillow]);
sim.roundBox(cube, 0.15, 0.15, 0.15, 0.001, { density: 600 * M ** 3 });
loose(sim, [pillow]);
const baked = sim.bake(3, null, 0.5); // a cushion toppling from upright needs ~2 s
assert.deepEqual(baked.report.floating, [], "nothing floats");
assert.deepEqual(baked.report.moving, [], "everything is at rest");
assert.ok(baked.report.penetration_mm < 2, "penetration " + JSON.stringify(baked.report.deepest));
baked.apply(3);
assert.ok(Math.abs(cube.position.y - 0.075) * M * 1000 < 2, "the box rests on the floor, off by " + ((cube.position.y - 0.075) * M * 1000).toFixed(1) + " mm");

// Bake cache, holds and sparse poses: an unchanged scene replays its cached bake exactly (sub-frames, report,
// tracked series, what onStep kept), a changed scene or onStep misses and a damaged file is a miss, not a crash; the
// world is not used after a replay; a held box stays put until its release, then falls; a resting box stores almost
// no poses.
async function boxes(y, until) {
  const sc = new THREE.Scene(); sc.add(floor.clone());
  const drop = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshStandardMaterial()); drop.position.set(0, y, 0); drop.name = "drop"; sc.add(drop);
  const rest = drop.clone(); rest.position.set(0.6, 0.075, 0); rest.name = "rest"; sc.add(rest);
  sc.updateMatrixWorld(true);
  const s = await makeSim(THREE); s.staticScene(sc, [drop, rest]);
  const tb = s.roundBox(drop, 0.15, 0.15, 0.15, 0.001, { density: 600 * M ** 3 }); s.roundBox(rest, 0.15, 0.15, 0.15, 0.001, { density: 600 * M ** 3 });
  if (until != null) s.hold(tb, until);
  let touch = null;
  const step = (t) => { if (touch === null && tb.body.translation().y < 0.08) touch = t; };
  return { s, step, opts: { track: { y: () => tb.body.translation().y }, keep: () => ({ touch }), load: async (k) => (store.has(k) ? store.get(k).slice().buffer : null), save: async (k, v) => store.set(k, v) } };
}
const store = new Map(), poseAt = (b, i, t) => { const { p, q } = b.pose(i, t); return [...p.toArray(), ...q.toArray()]; }, times = [0, 0.3, 0.3 + 1 / 1440, 0.71, 1.5];
const A = await boxes(0.5), live = await A.s.bakeCached(1.5, A.step, 0.2, A.opts);
assert.ok(!live.cached && store.size === 1, "a first bake is computed and saved");
const B = await boxes(0.5), hit = await B.s.bakeCached(1.5, B.step, 0.2, B.opts);
assert.ok(hit.cached && hit.hash === live.hash, "an unchanged scene replays its cache");
for (const t of times) for (const i of [0, 1]) assert.deepEqual(poseAt(hit, i, t), poseAt(live, i, t), `cached pose ${i} at ${t} s`);
assert.deepEqual(hit.report, live.report, "cached report"); assert.equal(hit.at("y", 0.7), live.at("y", 0.7), "cached series");
assert.ok(live.kept.touch > 0 && hit.kept.touch === live.kept.touch, "what onStep kept survives a replay");
assert.throws(() => B.s.bake(1, null), /bakeCached/, "the world is not baked again after a replay");
const E = await boxes(0.5), other = await E.s.bakeCached(1.5, (t) => {}, 0.2, E.opts);
assert.ok(!other.cached, "a changed onStep misses the cache");
store.set(live.hash, store.get(live.hash).slice(0, 5000));
const F = await boxes(0.5), damaged = await F.s.bakeCached(1.5, F.step, 0.2, F.opts);
assert.ok(!damaged.cached && damaged.kept.touch === live.kept.touch, "a truncated cache file is baked again");
const D = await boxes(0.5), again = D.s.bake(1.5, D.step, 0.2, D.opts);
for (const t of times) assert.deepEqual(poseAt(again, 0, t), poseAt(live, 0, t), `a re-bake is deterministic at ${t} s`);
const C = await boxes(0.51), miss = await C.s.bakeCached(1.5, C.step, 0.2, C.opts);
assert.ok(!miss.cached && miss.hash !== live.hash, "a changed drop height misses the cache");
assert.ok(live.data.poses[1].s.length < live.data.n / 5, "a resting box stores " + live.data.poses[1].s.length + " of " + live.data.n + " poses"); // only its last micro-settling
const H = await boxes(0.5, 1), held = H.s.bake(2.5, null, 0.2);
assert.ok(Math.abs(held.pose(0, 0.95).p.y - 0.5) < 1e-6, "a held box stays where it was put");
assert.ok(held.pose(0, 1.2).p.y < 0.45 && Math.abs(held.pose(0, 2.5).p.y - 0.075) * M * 1000 < 2, "released, it falls and lands");
assert.deepEqual([held.report.floating, held.report.moving], [[], []], "after its release it is audited like any body");

// Islands: groups that never touch for the whole shot are baked as their own worlds, in parallel workers, and merge
// into the single-world result; the engine proves the groups stayed apart (a meeting throws), declared bodies take no
// scripted help (onStep, track and keep see only the main island), and the cache tells the two kinds of bake apart.
async function isles(o = {}) {
  const sc = new THREE.Scene(); sc.add(floor.clone());
  const meshes = [["push", o.px ?? 0, o.py ?? 0.075, o.pz ?? 0, 0], ["a", o.ax ?? 0.8, o.ay ?? 0.5, 0, o.ay == null ? 0.35 : 0], [o.bName ?? "b", -0.8, 0.4, 0, -0.2], ...(o.kin ? [["arm", 0, 0.3, -1.5, 0]] : [])].map(([name, x, y, z, tilt]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshStandardMaterial()); m.position.set(x, y, z); m.rotation.z = tilt; m.name = name; sc.add(m); return m;
  });
  sc.updateMatrixWorld(true);
  const s = await makeSim(THREE); s.staticScene(sc, meshes);
  const [push, a, b] = meshes.slice(0, 3).map((m, i) => (i === 0 && o.build ? o.build(s, m) : s.roundBox(m, 0.15, 0.15, 0.15, 0.001, { density: 600 * M ** 3 }))); // o.build: "push" made another way
  const arm = o.kin ? s.kinematicHull(meshes[3], (t) => ({ p: { x: 0, y: 0.3, z: -1.5 + 0.1 * t } })) : null;
  if (o.pv) push.body.setLinvel(o.pv, true); // the main island's piece already moving when the pre-roll starts
  if (o.holdA) s.hold(a, o.holdA);
  let shoved = false;
  const step = (t) => { if (!o.still && !shoved && t >= 0.3) { shoved = true; push.body.setLinvel({ x: 0, y: 0, z: 2 }, true); } }; // the main island's scripted push
  const mem = o.store || new Map();
  return { s, a, b, push, arm, step, mem, opts: { track: { pz: () => push.body.translation().z }, keep: () => ({ shoved }), load: async (k) => (mem.has(k) ? mem.get(k).slice().buffer : null), save: async (k, v) => mem.set(k, v), ...(o.workers === false ? { workers: false } : {}) } };
}
const withIslands = (I, opts = {}) => ({ ...I.opts, islands: [[I.a], [I.b]], ...opts });
// A refused island bake rejects and leaves nothing in its store: a saved refusal would replay as a valid bake on the next load.
const refused = async (I, run, rx, msg) => { await assert.rejects(run, rx, msg); assert.equal(I.mem.size, 0, `${msg}: nothing is saved`); };
const ipose = (r, t) => [0, 1, 2].map((i) => poseAt(r, i, t));
const one = await isles(), single = await one.s.bakeCached(1.5, one.step, 0.2, one.opts);
const warned = [], warn = console.warn; console.warn = (...m) => warned.push(m.join(" "));
const istore = new Map(), I1 = await isles({ store: istore }), par = await I1.s.bakeCached(1.5, I1.step, 0.2, withIslands(I1));
console.warn = warn;
assert.deepEqual(warned, [], "the islands really ran in workers (no fallback to this thread)");
const I2 = await isles({ store: new Map(), workers: false }), seq = await I2.s.bakeCached(1.5, I2.step, 0.2, withIslands(I2));
for (const t of times) assert.deepEqual(ipose(par, t), ipose(seq, t), `worker and in-thread island bakes agree at ${t} s`);
assert.deepEqual([par.report, par.impacts, par.kept], [seq.report, seq.impacts, seq.kept], "worker and in-thread island reports agree");
assert.ok(par.hash !== single.hash && par.hash === seq.hash, "declared islands are part of the cache key, the way they run is not");
for (const t of times) assert.deepEqual(ipose(par, t), ipose(single, t), `islands match the single world at ${t} s`);
assert.deepEqual(par.report, single.report, "island report matches the single world");
assert.deepEqual(par.impacts, single.impacts, "island impacts match the single world");
assert.ok(par.impacts.length > 0 && single.report.moving.length === 0 && par.kept.shoved && par.at("pz", 1.2) > 0.3, "the main island keeps its scripted push, series and kept values");
assert.ok(par.data.poses[1].s.length > 20 && par.data.poses[2].s.length > 20, "island bodies fell and were recorded");
const I3 = await isles({ store: istore }), again2 = await I3.s.bakeCached(1.5, I3.step, 0.2, withIslands(I3));
assert.ok(again2.cached && again2.hash === par.hash, "an unchanged island scene replays its cache");
for (const t of times) assert.deepEqual(ipose(again2, t), ipose(par, t), `cached island pose at ${t} s`);
const cross = await isles({ ax: -0.8, ay: 0.9 }); // "a" lands on "b": declared apart, they meet
await refused(cross, cross.s.bakeCached(1.5, cross.step, 0.2, withIslands(cross)), /island.*meet/, "a contact across islands fails loudly");
const spy = await isles();
await refused(spy, spy.s.bakeCached(1.5, (t) => { spy.a.body.translation(); }, 0.2, withIslands(spy)), /island/, "onStep cannot reach a declared body");
const ok = await isles();
await ok.s.bakeCached(1.2, (t) => { ok.push.body.translation(); }, 0.2, withIslands(ok));
const sync = await isles();
assert.throws(() => sync.s.bake(1, null, 0.2, { islands: [[sync.a]] }), /bakeCached/, "islands bake only through bakeCached");
const kin = await isles({ kin: true });
await refused(kin, kin.s.bakeCached(1, null, 0.2, { ...kin.opts, islands: [[kin.arm]] }), /kinematic/, "a kinematic body stays in the main island");
const twice = await isles();
await refused(twice, twice.s.bakeCached(1, null, 0.2, { ...twice.opts, islands: [[twice.a], [twice.a, twice.b]] }), /two islands/, "a body is in one island");
const stray = await isles();
await refused(stray, stray.s.bakeCached(1, null, 0.2, { ...stray.opts, islands: [[{}]] }), /roundBox/, "an island holds only bodies the sim made");
// The main island meeting a declared one (not two declared ones): "push" falls onto "a" after t = 0.
const mainHit = await isles({ px: 0.8, py: 0.6, ay: 0.075, still: true });
await refused(mainHit, mainHit.s.bakeCached(1.5, mainHit.step, 0.2, withIslands(mainHit)), /main island and island 1 meet/, "a main-island body landing on a declared one fails loudly");
// The pre-roll is part of the proof. "push" is already running when the pre-roll starts and, in the single world, hits
// "a" there; in an island bake "a" is not in the main world, so "push" runs through its place and is far away by t = 0:
// only the pre-roll poses show that they met.
const preHit = await isles({ px: 0.2, pv: { x: 2.2, y: 0, z: 0 }, ay: 0.075 });
await refused(preHit, preHit.s.bakeCached(1.5, preHit.step, 0.2, withIslands(preHit)), /island 1 meet.*pre-roll/, "a meeting in the pre-roll fails loudly, though the bodies are far apart at t = 0");
// Islands are for sets that settle slowly: inside a step CCD can stop a fast body, pass a hit on and bounce it back,
// which no traced pose shows. A body moving over 10 mm a step (here 1.25 m: it would pass "a" between two steps)
// refuses the island bake, wherever it is.
const fast = await isles({ px: 0.175, pv: { x: 600, y: 0, z: 0 }, ay: 0.075 });
await refused(fast, fast.s.bakeCached(1.5, fast.step, 0.2, withIslands(fast)), /"push" moves .* mm in one step.*one world/, "a body too fast for the island proof refuses the island bake");
// A slow step is judged as a capsule widened by the step's length (a thin collider's CCD can bounce a body inside it).
// "push" beside "a", 3.5 mm-equivalent beyond the margin (reach: the cube's half-diagonal each): at rest it bakes; sliding
// past at about 4 mm a step it is refused, though no stored pose comes within the margin.
const besideA = 0.15 * Math.sqrt(3) + 0.0035;
const restBy = await isles({ px: 0.8, pz: besideA, ay: 0.075, still: true });
await restBy.s.bakeCached(1, restBy.step, 0.2, withIslands(restBy));
const slideBy = await isles({ px: 0.5, pz: besideA, pv: { x: 2.2, y: 0, z: 0 }, ay: 0.075, still: true });
await refused(slideBy, slideBy.s.bakeCached(1, slideBy.step, 0.2, withIslands(slideBy)), /main island and island 1 meet: "push" and "a"/, "a slow body passing a declared one is judged on its widened step, not its poses");
// A script's teleport is not a path: a held piece put at its cue jumps over "a" and "b" without touching them, as in the
// single world, and the islands bake.
const tp = await isles({ px: -3.5, still: true }); tp.s.hold(tp.push, 0.5);
let put = false; const place = (t) => { if (!put && t >= 0.5) { put = true; tp.push.body.setTranslation({ x: 1.6, y: 0.075, z: 0 }, true); } };
await assert.doesNotReject(tp.s.bakeCached(1, place, 0.2, withIslands(tp)), "a piece a script puts in place is judged from there, not along the jump");
const preFree = await isles({ pv: { x: 0, y: 0, z: 2.2 }, ay: 0.075 }), preFreeSingle = await isles({ pv: { x: 0, y: 0, z: 2.2 }, ay: 0.075 });
const [pf, pfs] = [await preFree.s.bakeCached(1.5, preFree.step, 0.2, withIslands(preFree)), await preFreeSingle.s.bakeCached(1.5, preFreeSingle.step, 0.2, preFreeSingle.opts)];
for (const t of times) assert.deepEqual(ipose(pf, t), ipose(pfs, t), `a pre-roll run that never meets another island matches the single world at ${t} s`);
// A joint across islands, a name shared across islands: refused. Inside one island: baked.
const jd = (I, dx) => RAPIER.JointData.spherical({ x: dx, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
const tie = await isles(); tie.s.world.createImpulseJoint(jd(tie, -0.8), tie.a.body, tie.push.body, true);
await refused(tie, tie.s.bakeCached(1, null, 0.2, withIslands(tie)), /a joint ties bodies of two islands/, "a joint across islands is refused");
const tied = await isles(), ta = tied.a.body.translation(), tb = tied.b.body.translation(), qb = tied.b.body.rotation(); // anchored where they are: no snap
const at = new THREE.Vector3(ta.x - tb.x, ta.y - tb.y, ta.z - tb.z).applyQuaternion(new THREE.Quaternion(qb.x, qb.y, qb.z, qb.w).invert());
tied.s.world.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: at.x, y: at.y, z: at.z }), tied.a.body, tied.b.body, true);
await tied.s.bakeCached(1, null, 0.2, { ...tied.opts, islands: [[tied.a, tied.b]] });
const twin = await isles({ bName: "a" });
await refused(twin, twin.s.bakeCached(1, null, 0.2, withIslands(twin)), /names bodies in two islands/, "one name on two islands would mix their impacts");
const twin1 = await isles({ bName: "a" });
await twin1.s.bakeCached(1, null, 0.2, { ...twin1.opts, islands: [[twin1.a, twin1.b]] });
// A body held on a cue inside a declared island is released on time in its own world.
const hs = await isles({ holdA: 0.6 }), hsr = await hs.s.bakeCached(1.5, hs.step, 0.2, hs.opts);
const hi = await isles({ holdA: 0.6 }), hir = await hi.s.bakeCached(1.5, hi.step, 0.2, withIslands(hi));
assert.ok(Math.abs(poseAt(hir, 1, 0.5)[1] - 0.5) < 1e-6 && poseAt(hir, 1, 1.2)[1] < 0.4, "a held island body stays until its release, then falls");
for (const t of times) assert.deepEqual(ipose(hir, t), ipose(hsr, t), `a held island body matches the single world at ${t} s`);
// A worker that cannot start or load: that island is baked in this thread, with a warning and the same result.
for (const [what, workers] of [["throws at once", () => { throw new Error("no worker here"); }], ["fails to load", async () => new (await import("node:worker_threads")).Worker(new URL("file:///nonexistent/bake-worker.js"))]]) {
  const fb = await isles(), seen = []; console.warn = (...m) => seen.push(m.join(" "));
  const r = await fb.s.bakeCached(1.5, fb.step, 0.2, withIslands(fb, { workers })).finally(() => { console.warn = warn; });
  assert.equal(seen.length, 1, `a worker that ${what} warns once`); assert.match(seen[0], /island workers unavailable/);
  for (const t of times) assert.deepEqual(ipose(r, t), ipose(par, t), `a worker that ${what}: the in-thread island matches at ${t} s`);
  assert.deepEqual([r.report, r.impacts], [par.report, par.impacts], `a worker that ${what}: same report`);
}
// Scripts see only the main island. A world query could see a declared body (switched off in the main world, it answers
// nothing or stale numbers), so while islands are declared every query and listing of the world refuses, and so does a
// lookup of a declared body or collider; the main island's own bodies stay open to their own methods and to lookups.
const ray = () => new RAPIER.Ray({ x: 0.8, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }), ball = RAPIER.ColliderDesc.ball(0.1).shape;
const reach = {
  "castRay": (I) => () => I.s.world.castRay(ray(), 5, true),
  "contactPairsWith": (I) => () => I.s.world.contactPairsWith(I.push.body.collider(0), () => {}),
  "intersectionsWithShape": (I) => () => I.s.world.intersectionsWithShape({ x: 0.8, y: 0.1, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, ball, () => true),
  "forEachCollider": (I) => () => I.s.world.forEachCollider(() => {}),
  "forEachRigidBody": (I) => () => I.s.world.forEachRigidBody(() => {}),
  "bodies.getAll": (I) => () => I.s.world.bodies.getAll(),
  "narrowPhase.contactPair": (I) => () => I.s.world.narrowPhase.contactPair(I.push.body.collider(0).handle, I.push.body.collider(0).handle, () => {}),
  "getCollider of a declared body": (I) => { const h = I.a.body.collider(0).handle; return () => I.s.world.getCollider(h); },
  "getRigidBody of a declared body": (I) => { const h = I.a.body.handle; return () => I.s.world.getRigidBody(h); },
  "bodies.get of a declared body": (I) => { const h = I.a.body.handle; return () => I.s.world.bodies.get(h); },
  "a collider of a declared body kept from before": (I) => { const c = I.a.body.collider(0); return () => c.translation(); },
  "a declared collider handed to a main collider": (I) => { const c = I.a.body.collider(0), m = I.push.body.collider(0); return () => m.contactCollider(c, 1); },
};
for (const [what, make] of Object.entries(reach)) {
  for (const via of ["onStep", "track", "keep"]) {
    const R = await isles(), go = make(R), run = via === "onStep" ? { step: () => go(), opts: {} } : { step: null, opts: { [via]: via === "track" ? { x: () => (go(), 0) } : () => (go(), {}) } };
    await refused(R, R.s.bakeCached(0.3, run.step, 0.1, { ...R.opts, ...run.opts, islands: [[R.a], [R.b]] }), /island/, `${what}: ${via} cannot reach a declared body`);
  }
}
{
  const R = await isles(), seen = [];
  const peek = () => { const b = R.push.body; seen.push(b.translation().x, R.s.world.getRigidBody(b.handle).translation().y, R.s.world.getCollider(b.collider(0).handle).translation().z, b.collider(0).translation().x, R.s.world.bodies.get(b.handle).handle, R.s.world.bodies.len()); };
  await R.s.bakeCached(0.3, peek, 0.1, withIslands(R));
  assert.ok(seen.length > 10 && seen.every(Number.isFinite), "the main island's bodies stay open to their own methods and to lookups");
  const Q = await isles(); let hits = 0; // the same queries are fine in a bake with no islands
  await Q.s.bakeCached(0.3, () => { if (Q.s.world.castRay(ray(), 5, true)) hits++; Q.s.world.forEachCollider(() => {}); Q.s.world.getCollider(Q.a.body.collider(0).handle).translation(); }, 0.1, Q.opts);
  assert.ok(hits > 0, "world queries still work with no islands declared");
  assert.doesNotThrow(() => { const w = R.s.world; w.castRay(ray(), 5, true); w.getCollider(R.a.body.collider(0).handle).translation(); R.a.body.translation(); }, "every fence is lifted once the island bake is over");
}

// What the island worlds share with the main one is fixed when the bake starts: gravity, the solver, every fixed body
// and static collider, the joints. onStep, track and keep run on the main world alone, so a change to any of these would
// never reach an island: it is refused while they run (and a change that slips past the fence is caught after the bake),
// and nothing is saved. The main island's own bodies stay free, and with no islands nothing is fenced.
const statics = (I) => { const out = []; I.s.world.forEachCollider((c) => { if (!c.parent()) out.push(c); }); return out; };
const withFixed = async () => { // a fixed body with a collider, made before the bake, beside the static scene
  const I = await isles({ store: new Map() }), fx = I.s.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(3, 0.5, 0));
  I.s.world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 0.1, 0.1), fx); I.fx = fx; return I;
};
const shared = {
  "a static collider disabled": (I) => { const [f] = statics(I); return () => f.setEnabled(false); },
  "a static collider moved": (I) => { const [f] = statics(I); return () => f.setTranslation({ x: 0, y: -5, z: 0 }); },
  "a static collider's friction": (I) => { const [f] = statics(I); return () => f.setFriction(0); },
  "a static collider reached by getCollider": (I) => { const h = statics(I)[0].handle; return () => I.s.world.getCollider(h).setEnabled(false); },
  "a static collider removed": (I) => { const [f] = statics(I); return () => I.s.world.removeCollider(f, true); },
  "gravity replaced": (I) => () => { I.s.world.gravity = { x: 0, y: 0, z: 0 }; },
  "gravity edited in place": (I) => () => { I.s.world.gravity.y = 0; },
  "an extra step of the world": (I) => () => I.s.world.step(),
  "the timestep": (I) => () => { I.s.world.timestep = 1 / 240; },
  "the solver iterations": (I) => () => { I.s.world.numSolverIterations = 1; },
  "the integration parameters": (I) => () => { I.s.world.integrationParameters.normalizedAllowedLinearError = 0.1; },
  "a fixed body moved": (I) => () => I.fx.setTranslation({ x: 0.8, y: 0.2, z: 0 }, true),
  "a fixed body's collider": (I) => () => I.fx.collider(0).setEnabled(false),
  "a fixed body made dynamic": (I) => () => I.fx.setBodyType(RAPIER.RigidBodyType.Dynamic, true),
  "a collider created": (I) => () => { I.s.world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.05, 1).setTranslation(0.8, 0.2, 0)); },
  "a body created": (I) => () => { I.s.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()); },
  "a joint inside an island": (I) => () => I.s.world.impulseJoints.forEach((j) => j.setContactsEnabled(false)),
  "a change through the raw handle": (I) => { const h = statics(I)[0].handle; return () => I.s.world.colliders.raw.coSetEnabled(h, false); },
};
for (const [what, make] of Object.entries(shared)) {
  for (const via of ["onStep", "track", "keep"]) {
    const R = await withFixed(), st = new Map(), j = what === "a joint inside an island";
    if (j) R.s.world.createImpulseJoint(jd(R, -1.6), R.a.body, R.b.body, true);
    const go = make(R), run = via === "onStep" ? { step: () => go(), opts: {} } : { step: null, opts: { [via]: via === "track" ? { x: () => (go(), 0) } : () => (go(), {}) } };
    await assert.rejects(R.s.bakeCached(0.3, run.step, 0.1, { ...R.opts, ...run.opts, load: async () => null, save: async (k, v) => st.set(k, v), islands: j ? [[R.a, R.b]] : [[R.a], [R.b]] }), /opts\.islands/, `${what}: ${via} cannot change what the island worlds share`);
    assert.equal(st.size, 0, `${what}: ${via}: nothing is saved for a refused bake`);
  }
}
{
  // Legitimate: the main island's own bodies are free, and every shared thing may be read; the result is the single world's.
  const script = (I) => { let n = 0; const f = statics(I)[0]; return (t) => { n += I.s.world.gravity.y + f.translation().y + f.friction() + I.fx.translation().x + I.s.world.timestep + (f.isEnabled() ? 1 : 0) + I.fx.collider(0).halfExtents().x; I.push.body.addForce({ x: 0, y: 0, z: 0.01 }, true); I.push.body.applyImpulse({ x: 0, y: 0, z: 0.0001 }, true); if (t > 0.2) I.push.body.setLinvel({ x: 0, y: 0, z: 1 }, true); }; };
  const S = await withFixed(), sr = await S.s.bakeCached(1, script(S), 0.2, S.opts);
  const P = await withFixed(), pr = await P.s.bakeCached(1, script(P), 0.2, { ...P.opts, islands: [[P.a], [P.b]] });
  for (const t of times) assert.deepEqual(ipose(pr, t), ipose(sr, t), `reading the shared state and driving a main body matches the single world at ${t} s`);
  assert.deepEqual([pr.report, pr.impacts], [sr.report, sr.impacts], "same report with shared state read and a main body driven");
  // The fences are gone afterwards, and the world is as it was.
  assert.doesNotThrow(() => { const w = P.s.world, g = w.gravity.y; w.gravity = { x: 0, y: g, z: 0 }; w.timestep = w.timestep; w.integrationParameters.normalizedAllowedLinearError = 0.0002; statics(P)[0].setEnabled(true); P.fx.setTranslation({ x: 3, y: 0.5, z: 0 }, true); P.fx.collider(0).setEnabled(true); w.createRigidBody(RAPIER.RigidBodyDesc.fixed()); }, "every shared-state fence is lifted once the island bake is over");
  assert.ok(P.s.world.gravity.y < 0 && !Object.hasOwn(P.s.world, "timestep"), "the world's own gravity and settings are back");
  // With no islands, none of it is fenced: a scripted change is part of the single world, and that bake is cached as usual.
  for (const [what, make] of Object.entries(shared)) {
    if (what === "a joint inside an island" || what === "a static collider removed") continue; // (removing a collider is refused with islands only)
    const Q = await withFixed(), go = make(Q);
    await assert.doesNotReject(Q.s.bakeCached(0.2, () => go(), 0.1, Q.opts), `${what}: with no islands it is a scripted change of the single world`);
  }
  // A body the sim did not make is not in the island worlds (switched off there): refused. A fixed one is shared: fine.
  const U = await isles(); U.s.world.createCollider(RAPIER.ColliderDesc.ball(0.1), U.s.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0.8, 0.2, 0)));
  await refused(U, U.s.bakeCached(0.3, null, 0.1, withIslands(U)), /opts\.islands.*roundBox/, "a dynamic body made by hand would never meet the island bodies");
  const V = await withFixed(); await assert.doesNotReject(V.s.bakeCached(0.3, null, 0.1, withIslands(V)), "a hand-made fixed body is shared by every island world");
}

// Contacts come from the colliders, not from what is drawn. One rule closes every way a collider reaches past its drawn
// mesh to a declared body the drawn geometry never comes near: the proof judges each body's reach (every collider it
// has, with its offset and contact skin, and the drawn geometry), and while the islands bake no script can change a
// collider's reach (a change by a call the lock does not know is caught after the bake). "a" rests 225 mm from the
// drawn "push", and in every case below a collider of "push" reaches it: the drawn geometry alone would pass them all.
{
  const dens = { density: 600 * M ** 3 }, wide = (w) => (s, m) => s.roundBox(m, w, 0.15, 0.15, 0.001, dens);
  const late = (go) => (I) => (t) => { if (t >= 0.5) go(I.push.body.collider(0)); };
  const grow = (c) => c.setHalfExtents({ x: 0.74, y: 0.074, z: 0.074 });
  const met = /main island and island 1 meet: "push" and "a"/, locked = /opts\.islands: set\w+\(\) on a collider of "push" changes where it can touch/;
  const reach = {
    "a roundBox wider than its mesh": { build: wide(1.5), rx: met },
    "an extra collider beside the hull": { build: (s, m) => s.dynamicHull(m, { ...dens, extra: [{ desc: RAPIER.ColliderDesc.ball(0.05).setTranslation(0.7, 0, 0), ...dens }] }), rx: met },
    "a collider grown while the islands bake": { step: late(grow), vias: true, rx: locked },
    "a collider moved off its body while the islands bake": { step: late((c) => c.setTranslationWrtParent({ x: 0.7, y: 0, z: 0 })), rx: locked },
    "a collider's round radius grown while the islands bake": { step: late((c) => c.setRoundRadius(0.7)), rx: locked },
    "a contact skin while the islands bake": { step: late((c) => c.setContactSkin(0.7)), rx: locked },
    "a collider grown by a call the lock does not know": { step: late((c) => Object.getPrototypeOf(c).setHalfExtents.call(c, { x: 0.74, y: 0.074, z: 0.074 })), rx: /opts\.islands: a collider of "push" reaches further after the bake/ },
  };
  for (const [what, v] of Object.entries(reach)) for (const via of v.vias ? ["onStep", "track", "keep"] : ["onStep"]) {
    const R = await isles({ ay: 0.075, still: true, build: v.build, store: new Map() }), go = v.step ? v.step(R) : R.step;
    const run = via === "onStep" ? { step: go, opts: {} } : { step: R.step, opts: { [via]: via === "track" ? { x: () => (go(0.6), 0) } : () => (go(0.6), {}) } };
    await refused(R, R.s.bakeCached(1, run.step, 0.2, withIslands(R, run.opts)), v.rx, `${what} (${via}): a cross-island contact through a collider fails loudly`);
  }
  // Legitimate: a collider wider than its mesh but far from every other island bakes and matches the single world; a
  // main collider's friction and restitution may change while the islands bake; the lock is lifted after the bake; with
  // no islands a collider may grow, as part of the single world.
  const far = async (isl, step) => { const R = await isles({ build: wide(1.0) }); return R.s.bakeCached(1.5, step ? step(R) : R.step, 0.2, isl ? withIslands(R) : R.opts); };
  const [fi, fs] = [await far(true), await far(false)];
  for (const t of times) assert.deepEqual(ipose(fi, t), ipose(fs, t), `a wide collider far from the other islands matches the single world at ${t} s`);
  const mat = (I) => (t) => { I.step(t); if (t >= 0.5) { const c = I.push.body.collider(0); c.setFriction(0.2); c.setRestitution(0.3); } };
  const [mi, ms] = [await far(true, mat), await far(false, mat)];
  for (const t of times) assert.deepEqual(ipose(mi, t), ipose(ms, t), `a main collider's friction changed while the islands bake matches the single world at ${t} s`);
  const L = await isles(); await L.s.bakeCached(0.3, null, 0.1, withIslands(L));
  assert.doesNotThrow(() => grow(L.push.body.collider(0)), "the collider lock is lifted once the island bake is over");
  const N = await isles({ ay: 0.075, still: true });
  await assert.doesNotReject(N.s.bakeCached(1, late(grow)(N), 0.2, N.opts), "with no islands a collider may grow: it is part of the single world");
}

// The cache key is a pure function of the scene: the lazily loaded bake worker is in the page's resource timeline once
// an earlier bake spawned it, and never otherwise; it must not decide whether the next sim finds its cache.
{
  const real = { document: globalThis.document, fetch: globalThis.fetch, entries: performance.getEntriesByType }, texts = new Map();
  const hashWith = async (list) => {
    globalThis.document = {}; performance.getEntriesByType = () => list.map((name) => ({ name })); globalThis.fetch = async (u) => ({ text: async () => texts.get(u) ?? `// ${u}` });
    try { const I = await isles({ store: new Map() }); return (await I.s.bakeCached(0.2, null, 0.1, I.opts)).hash; } finally { Object.assign(globalThis, { document: real.document, fetch: real.fetch }); performance.getEntriesByType = real.entries; }
  };
  const root = pathToFileURL(realpathSync(resolve(process.argv[2] || ".")) + "/").href, at = (f) => root + f; // the URL physics.js was loaded from (links resolved)
  const base = [at("kit.js"), at("examples/interior.js"), at("bakecore.js")], noWorker = await hashWith(base);
  assert.equal(await hashWith([...base, at("bake-worker.js")]), noWorker, "a page that spawned a bake worker hashes like one that did not");
  assert.equal(await hashWith([...base, at("bake-worker.js?v=2"), at("bake/abc.bin")]), noWorker, "a worker script with a query, and the bake files themselves, are no input either");
  assert.notEqual(await hashWith([...base, at("set.js")]), noWorker, "a module the set loads is an input: a new one misses the cache");
  texts.set(at("kit.js"), "// edited");
  assert.notEqual(await hashWith(base), noWorker, "a changed module misses the cache");
}

// Cloth hangs and stays finite; a swept tube has no zero normals (a NaN in the shader blacks out the frame).
const c = bakeCurtain({ cx: 0, width: 0.2, top: 1, length: 0.5, z: 0, wall: -0.1, wind: (p, t, o) => o.set(0, 0, 0), duration: 1, mpu: M });
c.apply(0.9);
assert.ok(finite(c.geometry.attributes.position.array), "cloth has NaN");
assert.ok(c.travel(0.9) < 0.002, "still cloth settles");
const g = sweep([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0.02, 0), new THREE.Vector3(0.2, 0, 0.05)], () => 0.02, { colour: () => new THREE.Color(1, 1, 1) });
const n = g.attributes.normal;
for (let i = 0; i < n.count; i++) assert.ok(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) > 0.5, "zero normal at " + i);
// Wind: a breeze averages its speed at its reference height and is slower near the ground (log law); sources add.
const air = makeWind().add(breeze({ dir: [1, 0, 0], speed: 4, ref: 2, ground: 0 })), v = new THREE.Vector3();
let mean = 0, low = 0;
for (let i = 0; i < 400; i++) { mean += air.at(new THREE.Vector3(i * 0.37, 2 / M, i * 0.11), i * 0.05, v).x * M / 400; low += air.at(new THREE.Vector3(i * 0.37, 0.2 / M, i * 0.11), i * 0.05, v).x * M / 400; }
assert.ok(Math.abs(mean - 4) < 0.4, "breeze mean at 2 m: " + mean.toFixed(2) + " m/s");
assert.ok(low < 0.75 * mean && low > 0.3 * mean, "log profile near the ground: " + low.toFixed(2));
const two = makeWind().add(breeze({ speed: 4 })).add(breeze({ speed: 4 }));
assert.ok(Math.abs(two.at(new THREE.Vector3(1, 2 / M, 1), 0.3, v).x - 2 * air.at(new THREE.Vector3(1, 2 / M, 1), 0.3, new THREE.Vector3()).x) < 1e-9, "sources add");
// A flexible thing in steady 10 m/s air leans by its set amount (±15 %) and stays finite; in still air it stays.
const steady = makeWind().add((p, t, o) => o.set(10 / M, 0, 0)), calm = makeWind();
const lean = bakeBend({ count: 1, at: (i, p) => p.set(0, 1, 0), f: 2, zeta: 0.3, lean: 0.2, field: steady, duration: 1 }).bend(1)[0];
assert.ok(Math.abs(lean - 0.2) < 0.03, "steady lean " + lean.toFixed(3) + " rad");
assert.equal(bakeBend({ count: 1, at: (i, p) => p.set(0, 1, 0), f: 2, lean: 0.2, field: calm, duration: 1 }).bend(1)[0], 0, "still air, no bend");
// Plants: a tree grows its branches and about the leaves asked for; grass fills its area at its density.
const tr = tree(kit, { at: new THREE.Vector3(0, 0, 0), height: 3, leaves: 800 });
tr.bake(air, 1); tr.apply(0.5);
assert.ok(tr.branches > 20 && Math.abs(tr.leaves - 800) < 80, "tree " + tr.branches + " branches, " + tr.leaves + " leaves");
assert.ok(finite(tr.group.children[0].geometry.attributes.position.array), "tree has NaN");
const gr = grass(kit, { x0: 0, x1: 0.5, z0: 0, z1: 0.5, density: 1000 });
assert.ok(Math.abs(gr.blades - 1000 * (0.5 * M) ** 2) < 30, "grass blades " + gr.blades);
// Particles: rain falls at its terminal speed in still air and drifts with a crosswind; steam rises; the same twice.
const rainBox = { x0: 0, x1: 0.5, y0: 0, y1: 2 / M, z0: 0, z1: 0.5 };
const drop = particles(kit, { kind: "rain", box: rainBox, rate: 200, diameter: [2, 2], field: calm, seed: 3 }).bake(1);
const flux = drop.impacts.length / (0.5 * M) ** 2; // per m² over 1 s
assert.ok(Math.abs(flux - 200) < 40, "rain lands at its rate: " + flux.toFixed(0) + " /m²/s");
const vt = drop.impacts.length && (() => { const r = particles(kit, { kind: "rain", box: rainBox, rate: 200, diameter: [2, 2], field: calm, seed: 3 }); r.bake(1); return r; })();
const side = particles(kit, { kind: "rain", box: rainBox, rate: 200, diameter: [2, 2], field: makeWind().add((p, t, o) => o.set(3 / M, 0, 0)), seed: 3 }).bake(1);
const xs = side.impacts.map((d) => d.x), drift = (xs.reduce((a, b) => a + b, 0) / xs.length - 0.25) * M;
assert.ok(drift > 0.8 * 3 * (2 / 7.1) - 0.05 && drift < 1.2 * 3 * (2 / 7.1) + 0.1, "rain drifts with the wind: " + drift.toFixed(2) + " m over a 2 m fall");
const steam = particles(kit, { kind: "steam", at: new THREE.Vector3(0, 0, 0), field: calm, seed: 4 }), steam2 = particles(kit, { kind: "steam", at: new THREE.Vector3(0, 0, 0), field: calm, seed: 4 });
steam.bake(1); steam2.bake(1);
const last = steam.frames.at(-1); let rise = 0, alive = 0;
for (let i = 0; i < steam.count; i++) if (last[i * 8 + 7] > 0) { rise += last[i * 8 + 1] * M; alive++; }
assert.ok(alive > 10 && rise / alive > 0.05, "steam rises: mean " + (rise / alive * 100).toFixed(1) + " cm");
assert.deepEqual(steam.frames.at(-1), steam2.frames.at(-1), "particles are the same every bake");
// Steam is seen by contrast: over a light sweep it is lost, a darker backing makes it read, its shaded side helps;
// a room draught breaks the plume sideways where still air stands it up as a column.
const lightSweep = 0xe8e4dc, darkBack = 0x4a4640, bare = contrast("steam", lightSweep, { shade: 0 });
assert.ok(!bare.readable && bare.lit < READABLE, "unshaded steam on a light sweep is unreadable: " + bare.lit.toFixed(3));
assert.ok(contrast("steam", darkBack).lit > 3 * READABLE, "steam over a darker backing reads");
assert.ok(contrast("steam", lightSweep).shaded > 1.5 * bare.lit, "the shaded side lifts steam off a light ground");
assert.ok(steam.contrast(darkBack).readable && !steam.contrast(lightSweep, { shade: 0 }).readable, "a plume reports its own contrast");
const spread = (f) => { const p = particles(kit, { kind: "steam", at: new THREE.Vector3(0, 0, 0), field: f, seed: 4 }).bake(2), fr = p.frames.at(-1), xs = [];
  for (let i = 0; i < p.count; i++) if (fr[i * 8 + 7] > 0) xs.push(Math.hypot(fr[i * 8], fr[i * 8 + 2]) * M); return xs.reduce((s, x) => s + x, 0) / xs.length; };
const room = makeWind().add(draught({ speed: 0.1 })), rs = spread(room), cs0 = spread(calm);
assert.ok(rs > 2 * cs0, "a room draught carries the plume aside: " + (rs * 100).toFixed(1) + " cm vs " + (cs0 * 100).toFixed(1) + " cm in still air");
let dm = 0; const dv = new THREE.Vector3(); for (let i = 0; i < 2000; i++) dm += draught({ speed: 0.1 })(new THREE.Vector3(i * 0.013, 0.4, i * 0.007), i * 0.05, dv).length() * M;
assert.ok(dm / 2000 > 0.06 && dm / 2000 < 0.16, "room air ~0.1 m/s: " + (dm / 2000).toFixed(3));
assert.equal(vt.impacts.length, drop.impacts.length, "rain is the same twice");
// Water: capillary-gravity dispersion; a pond's sea state; no folding crests.
const k1 = 2 * Math.PI; assert.ok(Math.abs(dispersion(k1) / k1 - Math.sqrt(9.81 / k1 + 7.4e-5 * k1)) < 1e-9, "dispersion");
const ss = seaState(5, 10); assert.ok(ss.hs > 0.005 && ss.hs < 0.012, "pond Hs " + (ss.hs * 1000).toFixed(1) + " mm");
const pond = water(kit, { x0: 0, x1: 1, z0: 0, z1: 1, y: 0, wind: { speed: 5, dir: [1, 0, 0] }, fetch: 10 });
assert.ok(pond.waves.reduce((a, w) => a + w.q * w.k * w.a, 0) <= 0.71, "Gerstner crests do not fold");
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
const FL = makeFlask({ ...kit, scene: cs, rest: (o) => o }, { at: new THREE.Vector3(1, 0, 0) }), cut = FL.cut;
const late = new THREE.Group(); late.add(new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 8), sharedMat)); FL.group.add(late);
late.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), sharedMat)); // into a part that was itself added late
const cutMeshes = []; FL.group.traverse((o) => o.isMesh && !o.userData.cutaway && cutMeshes.push(o));
assert.ok(cutMeshes.length >= 7, "flask parts, its late cup and two late meshes: " + cutMeshes.length);
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
// A shell is a ring, a solid is a disc: from the axis, a ray crosses the outer shell's wall twice, 0.6 mm apart (in
// metres), and leaves the solid stopper once.
const crossings = (part, y) => {
  const probe = new THREE.Mesh(part.stencil, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  probe.matrixWorld.copy(part.mesh.matrixWorld);
  const hits = new THREE.Raycaster(new THREE.Vector3(1, y / M, 0), new THREE.Vector3(Math.cos(0.05), 0, Math.sin(0.05))).intersectObject(probe);
  return hits.map((h) => h.distance * M).filter((d, i, a) => i === 0 || d - a[i - 1] > 1e-7);
};
const partOf = (mesh) => cut.parts.find((p) => p.mesh === mesh);
const wallX = crossings(partOf(FL.parts.outer), 0.1), plug = crossings(partOf(FL.parts.stopper), 0.24);
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
assert.ok(!sugar.mesh && sugar.body && sugar.counts.top === 0, "grains too small to see are the body's texture alone");
assert.ok(finite(get("grains", { size: 0.005, long: 1.4 }).a.image.data), "grains map has NaN");
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
// Mechanisms: a part on a slide, latched, sprung toward its stop, released on cue: it reaches the stop at the analytic
// time (within one step), stays there, and a slowed or replayed shot reads the same bake (no second one).
{
  const DT = 1 / 480;
  async function plunger(o = {}) {
    const sc = new THREE.Scene(); sc.add(floor.clone());
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), new THREE.MeshStandardMaterial());
    m.position.set(0, 0.3, 0); m.name = "plunger"; sc.add(m);
    const other = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), new THREE.MeshStandardMaterial());
    other.position.set(1, 0.1, 0); other.name = "other"; if (o.other) sc.add(other);
    sc.updateMatrixWorld(true);
    const s = await makeSim(THREE); s.staticScene(sc, [m, other]);
    const part = s.roundBox(m, 0.04, 0.04, 0.04, 0.002, { density: 7850 * M ** 3, name: "plunger" });
    part.body.setLinearDamping(0); // the analytic time below has no drag
    const free = o.other ? s.roundBox(other, 0.04, 0.04, 0.04, 0.002, { name: "other" }) : null;
    const j = slide(s, part, { axis: o.axis ?? { x: 1, y: 0, z: 0 }, min: o.min ?? 0, max: o.max ?? 0.05 });
    if (!o.bare) { spring(s, j, { stiffness: o.k ?? 50, preload: o.preload ?? 5, damping: o.damping ?? 0 }); latch(s, part, o.cue ?? 0.25); }
    else if (o.cue !== undefined) latch(s, part, o.cue); // no spring: the set's own forces drive it
    const mem = o.mem || new Map();
    return { s, part, free, j, mem, opts: { load: async (k) => (mem.has(k) ? mem.get(k).slice().buffer : null), save: async (k, v) => mem.set(k, v) } };
  }
  const P = await plunger(), b = await P.s.bakeCached(1.0, null, 0.1, P.opts);
  const x = (t, bk = b) => bk.pose(0, t).p.x * M; // metres along the slide from the latched pose
  // Latched: exactly in place until the cue, and the release time is in the bake.
  for (const t of [0, 0.05, 0.1, 0.2]) assert.ok(Math.abs(x(t)) < 1e-6, "latched part stays in place at t = " + t + ": " + x(t));
  assert.equal(b.report.latches.length, 1, "the bake reports its latch");
  assert.equal(b.report.latches[0].name, "plunger");
  const tr = b.report.latches[0].t;
  assert.ok(Math.abs(tr - 0.25) <= DT / 2 + 1e-9, "released at its cue: " + tr);
  // Released on a preloaded spring: x(t) = r (1 − cos ωt) from rest until the stop; the time it reaches the stop is analytic.
  const kg = P.part.body.mass(), k = 50, r = 5 / k, stop = 0.05, w = Math.sqrt(k / kg), target = stop - 0.0001;
  const tStar = Math.acos(1 - target / r) / w;
  let lo = tr, hi = tr + 0.45;
  assert.ok(x(lo) < target && x(hi) >= target, "the part reaches its stop after release");
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (x(mid) < target) lo = mid; else hi = mid; }
  assert.ok(Math.abs(lo - (tr + tStar)) <= DT / 2, "reaches its stop at the analytic time, within half a step (" + (lo - tr).toFixed(4) + " s vs " + tStar.toFixed(4) + " s)");
  // After: at the stop, never back at the latched pose.
  const tStop = tr + tStar;
  for (let t = tStop + 0.05; t <= 1.0; t += 1 / 60) assert.ok(Math.abs(x(t) - stop) < 0.0005, "stays at its stop at t = " + t.toFixed(3) + ": " + x(t));
  // The cache: the same scene hits it with the same latches and poses; a stiffer spring is another bake.
  const P2 = await plunger({ mem: P.mem }), b2 = await P2.s.bakeCached(1.0, null, 0.1, P2.opts);
  assert.ok(b2.cached && b2.hash === b.hash, "the same sprung, latched part replays from the cache");
  assert.deepEqual(b2.report.latches, b.report.latches, "a replay carries the release time");
  for (const t of [0.1, 0.3, 0.5, 0.9]) assert.deepEqual(poseAt(b2, 0, t), poseAt(b, 0, t), "replayed pose at " + t);
  const P3 = await plunger({ k: 60 }), b3 = await P3.s.bakeCached(1.0, null, 0.1, P3.opts);
  assert.ok(b3.hash !== b.hash && !b3.cached, "a changed spring stiffness misses the cache");
  // Time remap reads this one bake.
  const tau = slow(0.24, 1 / 50, 0.4);
  assert.equal(tau(0.1), 0.1, "before t0 the shot is real time");
  assert.ok(Math.abs((tau(0.2401) - tau(0.24)) / 0.0001 - 1 / 50) < 1e-3, "slow motion starts at its rate");
  assert.ok(Math.abs((tau(0.7001) - tau(0.7)) / 0.0001 - 1) < 1e-6, "and ends in real time");
  assert.ok(Math.abs(tau(0.64 + 1e-9) - tau(0.64 - 1e-9)) < 1e-8 && Math.abs(tau(0.24 + 1e-9) - tau(0.24 - 1e-9)) < 1e-8, "the remap is continuous");
  for (let t = 0; t < 1.5; t += 0.001) assert.ok(tau(t + 0.001) > tau(t), "the remap only moves forward, at t = " + t.toFixed(3));
  const held = slow(0.24, 1 / 50, 0.4, 0.5);
  assert.ok(Math.abs(held(0.24 + 0.5) - (0.24 + 0.01)) < 1e-9 && Math.abs(held(2) - (0.24 + 0.01 + 0.204 + (2 - 1.14))) < 1e-9, "hold keeps the rate before the ramp");
  const replayAt = replay(0.25, 2);
  for (const dx of [-0.05, 0, 0.1]) assert.ok(poseAt(b, 0, replayAt(2 + dx)).every((v, i) => Math.abs(v - poseAt(b, 0, 0.25 + dx)[i]) < 1e-9), "a replay shows the event again from its time " + dx);
  assert.ok(Math.abs(x(replayAt(2 - 0.05))) < 1e-6, "the lead-in before the event shows the latched pose");
  assert.ok(x(replayAt(2 + 0.1)) > 0.001, "and after it the part has moved");
  const both = (t) => replay(0.25, 2)(slow(2, 1 / 50, 0.4)(t));
  let seenAfter = 0;
  for (let t = 2; t < 2.9; t += 0.005) { const bt = both(t); if (bt >= tStop) { seenAfter++; assert.ok(x(bt) > 0.001, "a slow-motion replay never shows the part back at its latched pose, shot time " + t.toFixed(3)); } }
  assert.ok(seenAfter > 20, "the slow replay reaches the stop");
  assert.ok(b.travel(0.3, 30, slow(0.25, 1 / 50, 0.4)) < b.travel(0.3, 30) && b.travel(0.3, 30) > 0, "motion blur follows the remap: a slowed frame travels less");
  assert.equal(P.mem.size, 1, "slow motion and replays made no second bake");
  // A mechanism part is not an island body, and the others still bake apart.
  const Q = await plunger({ other: true });
  await assert.rejects(Q.s.bakeCached(0.6, null, 0.1, { ...Q.opts, islands: [[Q.part]] }), /mechanism/, "a latched, sprung part cannot be baked in an island");
  assert.equal(Q.mem.size, 0, "nothing saved");
  const Q2 = await plunger({ other: true }), bi = await Q2.s.bakeCached(1.0, null, 0.1, { ...Q2.opts, islands: [[Q2.free]] });
  assert.deepEqual(bi.report.latches, b.report.latches, "with other bodies in islands the latch still releases at its cue");
  assert.ok(Math.abs(bi.pose(0, 0.9).p.x * M - stop) < 0.0005, "and the part reaches its stop");
  // Bad inputs.
  const B = await plunger({ bare: true });
  assert.throws(() => spring(B.s, B.j, { stiffness: 50, rest: 0.1, preload: 5 }), /rest|preload/, "rest and preload together");
  assert.throws(() => spring(B.s, B.j, { stiffness: 50 }), /rest|preload/, "neither rest nor preload");
  assert.throws(() => spring(B.s, B.j, { stiffness: 0, preload: 5 }), /stiffness/, "stiffness 0");
  assert.throws(() => spring(B.s, B.j, { stiffness: 1e6, preload: 5 }), /stiff/, "a spring too stiff for the step");
  assert.throws(() => latch(B.s, B.part, -1), /until/, "a negative cue");
  assert.throws(() => latch(B.s, B.part, "x"), /until/, "a text cue");
  assert.ok(B.part.body.isDynamic(), "a refused latch leaves the part dynamic");
  assert.throws(() => slide(B.s, B.part, { axis: { x: 1, y: 0, z: 0 }, min: 0.01, max: 0.05 }), /min/, "the start is inside its stops");
  assert.throws(() => slide(B.s, {}, { axis: { x: 1, y: 0, z: 0 }, min: 0, max: 0.05 }), /dynamic/, "a part not made by the sim");
  assert.throws(() => slide(B.s, B.part, { axis: { x: 0, y: 0, z: 0 }, min: 0, max: 0.05 }), /axis/, "a zero axis");
  assert.throws(() => slow(0, 0, 1), /rate/, "slow: rate 0");
  assert.throws(() => slow(0, 2, 1), /rate/, "slow: faster than real time");
  assert.throws(() => slow(0, 0.5, -1), /rampOut/, "slow: negative ramp");
  assert.throws(() => replay(NaN, 1), /replay/, "replay: not a time");
  // A latch released by a condition, read from t = 0: the part goes when the condition says so.
  {
    const C = await plunger({ bare: true });
    spring(C.s, C.j, { stiffness: 50, preload: 5 }); const cue = latch(C.s, C.part, (t) => t >= 0.1);
    const bc = await C.s.bakeCached(0.5, null, 0.1, C.opts);
    assert.ok(Math.abs(bc.report.latches[0].t - 0.1) <= DT / 2 + 1e-9 && Math.abs(bc.pose(0, 0.09).p.x) < 1e-6 && bc.pose(0, 0.4).p.x * M > 0.001, "a condition releases the latch: " + JSON.stringify(bc.report.latches));
    assert.ok(cue.released !== null, "a live bake exposes the release");
  }
  // Every input that changes the result changes the hash: a stop, an axis, a cue, a spring's rest or damping each miss the
  // cache, and the same inputs hit it. A gravity-driven part (a drawer on a slope, a drop gate): no spring at all, so only
  // the slide's and the latch's own keys carry the stop and the release time.
  {
    const down = { x: 0, y: -1, z: 0 }, base = { bare: true, axis: down, min: 0, max: 0.03, cue: 1.2 };
    const run = async (o, mem) => { const Z = await plunger({ ...base, ...o, mem }); return Z.s.bakeCached(0.3, null, 0.1, Z.opts); };
    const mem = new Map(), g0 = await run({}, mem);
    assert.equal(mem.size, 1, "the gravity-driven part baked once");
    const g1 = await run({}, mem);
    assert.ok(g1.cached && g1.hash === g0.hash && mem.size === 1, "the same stops and cue replay from the cache");
    for (const [name, o] of [["a longer slide stop (max)", { max: 0.05 }], ["a slide stop behind the start (min)", { min: -0.01 }], ["another slide axis", { axis: { x: 0, y: -1, z: 0.2 } }], ["another release time", { cue: 1.5 }], ["a cue that is a condition", { cue: (t) => t >= 1.2 }]]) {
      const n = mem.size, g = await run(o, mem);
      assert.ok(g.hash !== g0.hash && !g.cached && mem.size === n + 1, name + " misses the cache");
    }
    const c1 = await run({ cue: (t) => t >= 1.2 }, mem), c2 = await run({ cue: (t) => t >= 1.4 }, mem);
    assert.ok(c1.cached && c2.hash !== c1.hash && !c2.cached, "the same condition replays; another condition misses");
    // A spring's own rest (preload) and damping are in its key.
    const sm = new Map(), s0 = await run({ bare: false, cue: 0.25 }, sm);
    const s1 = await run({ bare: false, cue: 0.25 }, sm);
    assert.ok(s1.cached && s1.hash === s0.hash, "the same spring replays");
    for (const [name, o] of [["a changed preload", { preload: 6 }], ["a changed damping", { damping: 0.5 }], ["a changed slide stop under a spring", { max: 0.04 }]]) { const g = await run({ bare: false, cue: 0.25, ...o }, sm); assert.ok(g.hash !== s0.hash && !g.cached, name + " misses the cache"); }
    // A hinge: its stop, its axis, its pivot and its cue are in its key.
    const hrun = async (o, hmem) => {
      const sc = new THREE.Scene(); sc.add(floor.clone());
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.002), new THREE.MeshStandardMaterial());
      flap.position.set(0, 0.3, 0); flap.name = "flap"; sc.add(flap); sc.updateMatrixWorld(true);
      const s = await makeSim(THREE); s.staticScene(sc, [flap]);
      const part = s.roundBox(flap, 0.05, 0.01, 0.002, 0.0005, { density: 7850 * M ** 3, name: "flap" });
      hinge(s, part, { at: o.at ?? { x: -0.025, y: 0.3, z: 0 }, axis: o.axis ?? { x: 0, y: 0, z: 1 }, min: o.min ?? 0, max: o.max ?? Math.PI / 3 });
      latch(s, part, o.cue ?? 1.2);
      return s.bakeCached(0.3, null, 0.1, { load: async (k) => (hmem.has(k) ? hmem.get(k).slice().buffer : null), save: async (k, v) => hmem.set(k, v) });
    };
    const hm = new Map(), h0 = await hrun({}, hm), h1 = await hrun({}, hm);
    assert.ok(h1.cached && h1.hash === h0.hash, "the same hinge replays");
    for (const [name, o] of [["a wider hinge stop (max)", { max: Math.PI / 2 }], ["a hinge stop behind the start (min)", { min: -0.2 }], ["another hinge pivot", { at: { x: 0.025, y: 0.3, z: 0 } }], ["another hinge axis", { axis: { x: 0, y: 1, z: 0 } }], ["another hinge release time", { cue: 1.5 }]]) { const h = await hrun(o, hm); assert.ok(h.hash !== h0.hash && !h.cached, name + " misses the cache"); }
  }
  // A hinge from a rotated start: angle 0 at the start (the frame is the part's own start pose), a torsion spring
  // toward a rest past the stop, the flap swings to its stop and stays.
  {
    const th = Math.PI / 6, sc = new THREE.Scene(); sc.add(floor.clone());
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.002), new THREE.MeshStandardMaterial());
    flap.position.set(0, 0.3, 0); flap.rotation.y = th; flap.name = "flap"; sc.add(flap); sc.updateMatrixWorld(true);
    const s = await makeSim(THREE); s.staticScene(sc, [flap]);
    const part = s.roundBox(flap, 0.05, 0.01, 0.002, 0.0005, { density: 7850 * M ** 3, name: "flap" });
    const at = { x: -0.025 * Math.cos(th), y: 0.3, z: 0.025 * Math.sin(th) }, axis = { x: Math.sin(th), y: 0, z: Math.cos(th) };
    const j = hinge(s, part, { at, axis, min: 0, max: Math.PI / 3 });
    spring(s, j, { stiffness: 0.2, preload: 0.3, damping: 0.001 }); latch(s, part, 0.2);
    const mem = new Map(), hb = await s.bakeCached(0.8, null, 0.1, { load: async (k) => (mem.has(k) ? mem.get(k).slice().buffer : null), save: async (k, v) => mem.set(k, v) });
    assert.deepEqual(poseAt(hb, 0, 0.19), poseAt(hb, 0, 0), "the latched flap is exactly in place");
    const q0 = hb.pose(0, 0).q, ang = (t) => { const qr = hb.pose(0, t).q.clone().multiply(q0.clone().invert()); let a = 2 * Math.atan2(qr.x * axis.x + qr.y * axis.y + qr.z * axis.z, qr.w); if (a > Math.PI) a -= 2 * Math.PI; return (a * 180) / Math.PI; };
    assert.ok(Math.abs(ang(0.19)) < 1e-3, "angle 0 at the rotated start");
    assert.ok(Math.abs(ang(0.8) - 60) < 0.5, "the flap reaches its stop at 60°: " + ang(0.8));
    for (let t = 0.4; t <= 0.8; t += 1 / 60) assert.ok(ang(t) > 59, "the flap stays at its stop: " + ang(t).toFixed(2) + "° at " + t.toFixed(2));
  }
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
  assert.deepEqual(texts(phrases(eight, toWords(eight).map((w, i) => (i >= 6 ? { ...w, start: w.start + 0.2, end: w.end + 0.2 } : w)))), ["one two three four", "five six seven eight"], "a gap under 0.3 s is not a pause");
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
  // A caption that says what a label says is a warning; a word of it, or a label shown at another time, is not.
  assert.equal(repeats(caps, [{ text: "The air is thinner" }]).length, 1, "an equal label repeats");
  assert.match(repeats(caps, [{ text: "The air is thinner" }])[0], /repeats the label/, "the warning says so");
  assert.equal(repeats(caps, [{ text: "air" }]).length, 0, "one word of a phrase is not a repeat");
  assert.equal(repeats(caps, [{ text: "air is", from: 0, to: 100 }]).length, 1, "a label inside a phrase repeats");
  assert.equal(repeats(caps, [{ text: "The air is thinner", from: 100, to: 110 }]).length, 0, "the same words at another time are not a repeat");
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

  // The example: home -> dive -> inside -> home. No hard cut, every leg lands on its station, the last frame is the first.
  const o = oner({ world, subject: A, inside: core, keep: [base], end: 12 }), fps = 30;
  {
    const o2 = oner({ world, subject: A, inside: core, keep: [base], end: 12 });
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
    assert.ok(Math.abs(o.end - 12) < 1e-12, "oner reports its end");
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
    const o = oner({ world: w.world, subject: w.A, inside: w.core, keep: [w.base], end: 12 }), at = (t) => pose(o.route.at(t)), mid = o.route.legs[0].start + 1, back = o.route.legs[2].start + 1.25, was = [at(mid), at(back)];
    lid.position.y += 5; w.world.updateMatrixWorld(true);
    near(at(mid), was[0], 0, "oner's dive does not follow a prop"); near(at(back), was[1], 0, "nor does its loop leg");
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
    assert.throws(() => oner({ world: w.world, subject: w.A, inside: w.core, end: 12, look: { dur: 3 } }), /dur/, "an attention that is still fading at the last frame is refused");
    for (const dur of [0.5, 2.5]) {
      const o = oner({ world: w.world, subject: w.A, inside: w.core, keep: [w.base], end: 12, look: { dur } }); o.at(12, null);
      for (const m of [w.shell, w.core, w.B, w.base]) assert.ok(o.look.weight(m, 12) === 0 && m.material.userData.ghost !== true, "the last frame is solid with a fade of " + dur + " s: " + m.name);
    }
    const a = { position: V(-1, 1, 1), target: V(0, 0, 0), fov: 30 }, b = { position: V(1, 1, 1), target: V(0, 0.2, 0), fov: 50 };
    near(pose(travel(2, a, b, { start: 0, dur: 2, ease: (u) => u * 0.999 })), [1, 1, 1, 0, 0.2, 0, 50], 0, "an ease that stops short of 1 still ends on the station");
    near(pose(travel(0, a, b, { start: 0, dur: 2, ease: (u) => u + 0.01 })), [-1, 1, 1, 0, 0, 0, 30], 0, "and starts on its own");
  }
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
const msim = await makeSim(THREE);
msim.staticScene(moon, [hover, sunk]);
const gap = msim.audit([hover])[0];
assert.ok(gap && Math.abs(gap.gap_mm - 5) < 0.5, "audit in real mm at any scale: " + JSON.stringify(gap));
mk.rest(sunk); mk.rest(deep);
const misses = mk.settle();
assert.ok(Math.abs(sunk.position.y - 7.5) < 0.01 && !misses.some((m) => /sunk/.test(m)), "settle lifts a prop typed a little low: " + sunk.position.y);
assert.ok(misses.some((m) => /deep \(placed 50 mm inside/.test(m)), "settle reports a prop placed deep inside: " + misses);
console.log("selfcheck ok: surfaces, physics in real units, bake cache, holds, sparse poses, island bakes, loose hull, cloth, fur normals, wind, jet, bending, plants, rain, steam, steam contrast, room draught, water (M = " + M + "), cutaway, grains, mechanisms (slide, hinge, spring, latch), time remap, type (phrases in four languages, adaptive ink, active word, pinned labels in the safe area, no repeat), camera stations and travel, attention by ghosting, loop end, cue and shot lookup on one frame grid (snap, shotAt, overlayWindow, window check, read time), any scale and gravity");
