#!/usr/bin/env node
// node selfcheck.mjs <project>/assets/engine — after build.mjs: each check fails loudly if a known trap is back.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
    const j = slide(s, part, { axis: { x: 1, y: 0, z: 0 }, min: 0, max: 0.05 });
    if (!o.bare) { spring(s, j, { stiffness: o.k ?? 50, preload: 5 }); latch(s, part, 0.25); }
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
  assert.ok(Math.abs(lo - (tr + tStar)) <= DT, "reaches its stop at the analytic time (" + (lo - tr).toFixed(4) + " s vs " + tStar.toFixed(4) + " s)");
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
  for (const dx of [-0.05, 0, 0.1]) assert.deepEqual(poseAt(b, 0, replayAt(2 + dx)), poseAt(b, 0, 0.25 + dx), "a replay shows the event again from its time " + dx);
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
console.log("selfcheck ok: surfaces, physics in real units, bake cache, holds, sparse poses, island bakes, loose hull, cloth, fur normals, wind, jet, bending, plants, rain, steam, steam contrast, room draught, water (M = " + M + "), cutaway, grains, mechanisms (slide, hinge, spring, latch), time remap, any scale and gravity");
