#!/usr/bin/env node
// node selfcheck.mjs <project>/assets/engine — after build.mjs: each check fails loudly if a known trap is back.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const dir = pathToFileURL(resolve(process.argv[2] || ".") + "/").href, use = (f) => import(dir + f);
const { THREE } = await use("three-vendor.js");
const K = await use("kit.js"); // a namespace: M and G are live bindings, set by makeKit
const { makeSim, RAPIER } = await use("physics.js");
const { bakeCurtain } = await use("cloth.js");
const { sweep } = await use("fur.js");
const { get } = await use("surfaces.js");
const { loose } = await use("bodies.js");
const { cushion } = await use("examples/interior.js");
const { makeWind, breeze, bakeBend } = await use("wind.js");
const { jet } = await use("air.js");
const { tree, grass } = await use("plants.js");
const { particles } = await use("particles.js");
const { water, dispersion, seaState } = await use("water.js");

const scene = new THREE.Scene();
const kit = K.makeKit(scene, { mpu: 2 });
const M = K.M;
assert.equal(M, 2, "makeKit sets the scale every module reads");
const finite = (a) => Array.from(a).every(Number.isFinite);

// Surfaces: tileable maps with no NaN.
for (const k of ["fabric", "pile", "wood", "bamboo", "micro"]) { const s = get(k); assert.ok(finite(s.a.image.data) && finite(s.b.image.data), k + " map has NaN"); }

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
  const meshes = [["push", o.px ?? 0, o.py ?? 0.075, 0, 0], ["a", o.ax ?? 0.8, o.ay ?? 0.5, 0, 0.35], [o.bName ?? "b", -0.8, 0.4, 0, -0.2], ...(o.kin ? [["arm", 0, 0.3, -1.5, 0]] : [])].map(([name, x, y, z, tilt]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshStandardMaterial()); m.position.set(x, y, z); m.rotation.z = tilt; m.name = name; sc.add(m); return m;
  });
  sc.updateMatrixWorld(true);
  const s = await makeSim(THREE); s.staticScene(sc, meshes);
  const [push, a, b] = meshes.slice(0, 3).map((m) => s.roundBox(m, 0.15, 0.15, 0.15, 0.001, { density: 600 * M ** 3 }));
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
const mainHit = await isles({ px: 0.8, py: 1.2, ay: 0.075, still: true });
await refused(mainHit, mainHit.s.bakeCached(1.5, mainHit.step, 0.2, withIslands(mainHit)), /main island and island 1 meet/, "a main-island body landing on a declared one fails loudly");
// The pre-roll is part of the proof. "push" is already running when the pre-roll starts and, in the single world, hits
// "a" there; in an island bake "a" is not in the main world, so "push" runs through its place and is far away by t = 0:
// only the pre-roll poses show that they met.
const preHit = await isles({ px: 0.2, pv: { x: 6, y: 0, z: 0 }, ay: 0.075 });
await refused(preHit, preHit.s.bakeCached(1.5, preHit.step, 0.2, withIslands(preHit)), /island 1 meet.*pre-roll/, "a meeting in the pre-roll fails loudly, though the bodies are far apart at t = 0");
const preFree = await isles({ pv: { x: 0, y: 0, z: 6 }, ay: 0.075 }), preFreeSingle = await isles({ pv: { x: 0, y: 0, z: 6 }, ay: 0.075 });
const [pf, pfs] = [await preFree.s.bakeCached(1.5, preFree.step, 0.2, withIslands(preFree)), await preFreeSingle.s.bakeCached(1.5, preFreeSingle.step, 0.2, preFreeSingle.opts)];
for (const t of times) assert.deepEqual(ipose(pf, t), ipose(pfs, t), `a pre-roll run that never meets another island matches the single world at ${t} s`);
// A joint across islands, a name shared across islands: refused. Inside one island: baked.
const jd = (I, dx) => RAPIER.JointData.spherical({ x: dx, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
const tie = await isles(); tie.s.world.createImpulseJoint(jd(tie, -0.8), tie.a.body, tie.push.body, true);
await refused(tie, tie.s.bakeCached(1, null, 0.2, withIslands(tie)), /a joint ties bodies of two islands/, "a joint across islands is refused");
const tied = await isles(); tied.s.world.createImpulseJoint(jd(tied, -1.6), tied.a.body, tied.b.body, true);
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
console.log("selfcheck ok: surfaces, physics in real units, bake cache, holds, sparse poses, island bakes, loose hull, cloth, fur normals, wind, jet, bending, plants, rain, steam, water (M = " + M + "), any scale and gravity");
