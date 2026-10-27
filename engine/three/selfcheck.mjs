#!/usr/bin/env node
// node selfcheck.mjs <project>/assets/engine — after build.mjs: each check fails loudly if a known trap is back.
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { realpathSync, mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const dir = pathToFileURL(resolve(process.argv[2] || ".") + "/").href, use = (f) => import(dir + f);
const { THREE } = await use("three-vendor.js");
const K = await use("kit.js"); // a namespace: M and G are live bindings, set by makeKit
const { makeSim, RAPIER, slow, replay } = await use("physics.js");
const { slide, hinge, spring, latch, gear, belt, chain, cam } = await use("mechanism.js");
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
const { makeDrivetrain } = await use("examples/drivetrain.js");
const { phrases, drawCaption, pinLabel, rangeBar, repeats, safeArea, inkFor, readTime, layoutFrame, textBand, recordBox } = await use("type.js");
const { stations, frame, travel, route, loopEnd, place: placeCamera, heroBox, attend, snap, shotAt, overlayWindow, windowProblems } = await use("camera.js");
const { scaleAudit, zFight } = await use("audit.js");
const { oner } = await use("examples/oner.js");
const { studio, aoFor, fitShadow, LOOKS, PRESETS } = await use("studio.js");
const { flowArrow, tileFill, dimension } = await use("quantity.js");
const { twinSets } = await use("examples/twin.js");
const { wire, flow, glow, lamp, arc, failure, blackbody, DRAPER, LAMPS } = await use("circuit.js");
const { scope, meter, gauge, bar: barMeter } = await use("instruments.js");
const { supplyChain } = await use("examples/supply.js");
const { openTorch, LOOK, lensFov } = await use("examples/torch.js");
const { shots, cueTime } = await use("shots.js");
const { TORCH_SHOTS, torchSet } = await use("examples/torch-shots.js");
const parts = await use("parts.js");
const { gait, rig, path: creaturePath, restingBreath } = await use("creature.js");
const { makeLizard, wallClimb } = await use("examples/lizard.js");
const { markings, glyphPx, legible, READ_PX, STYLES } = await use("markings.js");
const { PARTS, board, bands, BAND_HEX, cable, CONDUCTOR, polarityClashes } = await use("electronics.js");
const { openPsu } = await use("examples/psu.js");
const FLD = await use("fields.js");
const { makeMagnetDemo } = await use("examples/magnet.js");
const O = await use("optics.js");
const { makeStrawGlass } = await use("examples/straw.js");

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
// Couplings: gears, belts, chains and cams tie one part's motion to another's at the real ratio, in the bake (never a second
// rotation animated from the first). A 12:36 pair turns the second wheel at exactly 1/3 the speed the other way, the driver
// feels the load scaled by the ratio, a latched wheel holds the whole train, a chain shifts to another cog, a cam lifts its
// follower along its profile, and every input is in the cache key. Wrong inputs are refused.
{
  const DT = 1 / 480, TAU = 2 * Math.PI, Y = 0.3, Z = { x: 0, y: 0, z: 1 };
  // specs: [{ name, r, x, w, axis, group, slide, box, kg }] in metres: discs on an axle along z (a free hinge by default),
  // or a box on a slide. Same collision group (meshing parts never collide); `tau` is the drive on the first wheel (N·m),
  // registered before any coupling so the coupling solves what the drive pushed in the same step.
  async function wheels(specs, o = {}) {
    const sc = new THREE.Scene(), meshes = specs.map((w) => {
      const m = w.box ? new THREE.Mesh(new THREE.BoxGeometry(0.02 / M, 0.02 / M, 0.02 / M), new THREE.MeshStandardMaterial()) : new THREE.Mesh(new THREE.CylinderGeometry(w.r / M, w.r / M, (w.w ?? 0.01) / M, 48), new THREE.MeshStandardMaterial());
      if (!w.box) m.rotation.x = Math.PI / 2;
      m.position.set(w.x / M, Y, 0); m.name = w.name; sc.add(m); return m;
    });
    sc.updateMatrixWorld(true);
    const s = await makeSim(THREE); s.staticScene(sc, meshes);
    const parts = specs.map((w, i) => s.dynamicHull(meshes[i], { angularDamping: 0, linearDamping: 0, group: w.group ?? 1, mass: w.kg ?? 7850 * Math.PI * w.r ** 2 * (w.w ?? 0.01), name: w.name }));
    const js = specs.map((w, i) => (w.slide ? slide(s, parts[i], w.slide) : hinge(s, parts[i], { at: { x: w.x / M, y: Y, z: 0 }, axis: w.axis ?? Z, min: w.stops?.[0] ?? -Infinity, max: w.stops?.[1] ?? Infinity })));
    if (o.tau !== undefined) s.part({ bodies: [parts[0].body], key: `drive ${o.tau}`, step(t, h) { if (t >= 0) parts[0].body.applyTorqueImpulse({ x: 0, y: 0, z: (o.tau / (M * M)) * h }, true); } });
    const mem = o.mem || new Map();
    return { s, parts, js, mem, opts: { load: async (k) => (mem.has(k) ? mem.get(k).slice().buffer : null), save: async (k, v) => mem.set(k, v) } };
  }
  // The unwrapped angle (rad) of body i about z at k·DT, from the replayed poses alone.
  const turned = (bk, i, T) => {
    const q0 = bk.pose(i, 0).q, n = Math.round(T / DT), out = new Float64Array(n + 1); let th = 0, prev = 0;
    for (let k = 1; k <= n; k++) { const qr = bk.pose(i, k * DT).q.clone().multiply(q0.clone().invert()), now = 2 * Math.atan2(qr.z, qr.w); th += now - prev - TAU * Math.round((now - prev) / TAU); prev = now; out[k] = th; }
    return out;
  };
  const axle = (p) => { const pi = p.body.principalInertia(); return Math.max(pi.x, pi.y, pi.z) * M * M; }; // kg·m² of a thin disc
  const pair = [{ name: "gA", r: 0.012, x: 0 }, { name: "gB", r: 0.036, x: 0.048 }]; // module 2 mm: 12 and 36 teeth
  const TQ = 0.002;
  // 12:36: the second wheel turns at exactly 1/3 the speed, the other way, at every sample of the bake.
  const G = await wheels(pair, { tau: TQ }), g = gear(G.s, G.js[0], G.js[1], { teeth: [12, 36] });
  const gb = await G.s.bakeCached(1.0, null, 0.1, G.opts), ta = turned(gb, 0, 1.0), tb = turned(gb, 1, 1.0);
  assert.ok(ta[480] > 20, "the driven pair turns many times in a second: " + ta[480]);
  for (let k = 0; k <= 480; k++) assert.ok(Math.abs(tb[k] + ta[k] / 3) < 1e-4, "θB = −θA/3 at t = " + (k * DT).toFixed(3) + ": " + (tb[k] + ta[k] / 3));
  for (const k of [240, 480]) assert.ok(Math.abs((tb[k] - tb[k - 1]) / (ta[k] - ta[k - 1]) + 1 / 3) < 1e-3, "ωB/ωA = −1/3 at t = " + (k * DT).toFixed(2));
  assert.ok(Math.abs(g.ratio() + 1 / 3) < 1e-12 && g.kind === "gear", "the gear reports its signed ratio");
  // The driver feels the load scaled by the inverse ratio: a driven inertia counts s²·I, and the torque the pair passes on is
  // 3× the torque the driver gives up.
  const IA = axle(G.parts[0]), IB = axle(G.parts[1]), want = (0.5 * TQ) / (IA + IB / 9);
  assert.ok(Math.abs(ta[480] - want) / want < 0.005, "θA(1 s) = ½τ/(IA + IB/9): " + ta[480] + " vs " + want);
  const tq = g.torque();
  assert.ok(Math.abs(Math.abs(tq.driven) / Math.abs(tq.driver) - 3) < 1e-3 && tq.driver * tq.driven > 0, "driven = 3× the driver's torque: " + JSON.stringify(tq));
  assert.ok(Math.abs(Math.abs(tq.driver) - (TQ * (IB / 9)) / (IA + IB / 9)) / TQ < 0.01, "the driver gives up τ·(IB/9)/(IA + IB/9): " + tq.driver);
  // The same inputs bake to the same result twice (no cache) and hit the cache; other teeth miss it.
  const D = await wheels(pair, { tau: TQ }); gear(D.s, D.js[0], D.js[1], { teeth: [12, 36] });
  const db = D.s.bake(1.0, null, 0.1);
  for (const t of [0.1, 0.5, 1.0]) for (const i of [0, 1]) assert.deepEqual(poseAt(db, i, t), poseAt(gb, i, t), `a re-bake of the gear pair is identical at ${t} s, body ${i}`);
  const G2 = await wheels(pair, { tau: TQ, mem: G.mem }); gear(G2.s, G2.js[0], G2.js[1], { teeth: [12, 36] });
  const g2 = await G2.s.bakeCached(1.0, null, 0.1, G2.opts);
  assert.ok(g2.cached && g2.hash === gb.hash, "the same gear pair replays from the cache");
  for (const [name, c] of [["other teeth", (s, j) => gear(s, j[0], j[1], { teeth: [12, 30] })], ["an internal gear", (s, j) => gear(s, j[0], j[1], { teeth: [12, 36], internal: true })], ["a ratio instead of teeth", (s, j) => gear(s, j[0], j[1], { ratio: 1 / 3 })]]) {
    const X = await wheels(pair, { tau: TQ, mem: G.mem }); c(X.s, X.js);
    const xb = await X.s.bakeCached(0.3, null, 0.1, X.opts);
    assert.ok(!xb.cached && xb.hash !== gb.hash, name + " misses the cache");
  }
  // An internal gear turns the same way; a ratio instead of teeth is ωB/ωA.
  const Gi = await wheels(pair); assert.ok(Math.abs(gear(Gi.s, Gi.js[0], Gi.js[1], { teeth: [12, 36], internal: true }).ratio() - 1 / 3) < 1e-12, "an internal pair turns the same way");
  const Gr = await wheels(pair); assert.ok(Math.abs(gear(Gr.s, Gr.js[0], Gr.js[1], { ratio: 0.25 }).ratio() + 0.25) < 1e-12, "a ratio is ωB/ωA");
  // A latched driver holds the whole train until its cue; then the train turns at the ratio.
  const L = await wheels(pair, { tau: TQ }); gear(L.s, L.js[0], L.js[1], { teeth: [12, 36] }); latch(L.s, L.parts[0], 0.3);
  const lb = await L.s.bakeCached(0.8, null, 0.1, L.opts), la = turned(lb, 0, 0.8), lc = turned(lb, 1, 0.8);
  for (const k of [10, 100, 140]) assert.ok(Math.abs(la[k]) < 1e-6 && Math.abs(lc[k]) < 1e-6, "a latched train is still at t = " + (k * DT).toFixed(2) + ": " + la[k] + ", " + lc[k]);
  assert.ok(la[384] > 0.5 && Math.abs(lc[384] + la[384] / 3) < 1e-4, "released, the train turns at the ratio: " + la[384] + ", " + lc[384]);
  // A belt: links move at ω·r, so the wheel ratio is the radius ratio (same way); slip lets it creep; a wheel on the back of
  // the belt turns the other way.
  const Bp = [{ name: "pA", r: 0.03, x: 0 }, { name: "pB", r: 0.09, x: 0.12 }, { name: "pC", r: 0.02, x: 0.06, w: 0.008 }], BT = 0.02;
  for (const [slip, want] of [[0, 1 / 3], [0.05, 0.95 / 3]]) {
    const W = await wheels(Bp.slice(0, 2), { tau: BT }), b = belt(W.s, [{ joint: W.js[0], r: 0.03 }, { joint: W.js[1], r: 0.09 }], { slip });
    const bb = await W.s.bakeCached(0.6, null, 0.1, W.opts), a = turned(bb, 0, 0.6), c = turned(bb, 1, 0.6);
    assert.ok(a[288] > 1 && Math.abs(c[288] - want * a[288]) < 1e-4, `belt slip ${slip}: θB/θA = ${c[288] / a[288]} vs ${want}`);
    assert.ok(Math.abs(b.ratio() - want) < 1e-12 && b.kind === "belt", "the belt reports its ratio");
  }
  const Wi = await wheels(Bp, { tau: BT }); belt(Wi.s, [{ joint: Wi.js[0], r: 0.03 }, { joint: Wi.js[1], r: 0.09 }, { joint: Wi.js[2], r: 0.02, inside: true }], {});
  const ib = await Wi.s.bakeCached(0.6, null, 0.1, Wi.opts), ia = turned(ib, 0, 0.6), ic = turned(ib, 2, 0.6);
  assert.ok(Math.abs(ic[288] / ia[288] + 1.5) < 1e-3, "a wheel on the back of the belt turns the other way at r0/r2: " + ic[288] / ia[288]);
  const Wt = await wheels(Bp.slice(0, 2), { tau: BT }), tbl = belt(Wt.s, [{ joint: Wt.js[0], teeth: 20 }, { joint: Wt.js[1], teeth: 60 }], { pitch: 0.005 });
  assert.ok(Math.abs(tbl.ratio() - 1 / 3) < 1e-12, "a toothed belt's ratio is the tooth ratio");
  // A chain with a shift: the speed ratio is the tooth ratio, 42:14 = 3 then 42:21 = 2 from 0.5 s, and the cog's angle does not jump.
  const Cp = [{ name: "ring", r: 0.0849, x: 0 }, { name: "cog", r: 0.0283, x: 0.42 }];
  const C = await wheels(Cp, { tau: 0.05 }), ch = chain(C.s, [{ joint: C.js[0], teeth: 42 }, { joint: C.js[1], teeth: 14 }], { pitch: 0.0127, shifts: [{ at: 0.5, index: 1, teeth: 21 }] });
  const cb = await C.s.bakeCached(1.0, null, 0.1, C.opts), cr = turned(cb, 0, 1.0), cc = turned(cb, 1, 1.0);
  assert.ok(Math.abs((cc[192] - cc[144]) / (cr[192] - cr[144]) - 3) < 3e-3, "42:14 turns the cog 3× the ring: " + (cc[192] - cc[144]) / (cr[192] - cr[144]));
  assert.ok(Math.abs((cc[432] - cc[384]) / (cr[432] - cr[384]) - 2) < 2e-3, "after the shift 42:21 turns it 2×: " + (cc[432] - cc[384]) / (cr[432] - cr[384]));
  for (let k = 232; k <= 248; k++) assert.ok(cc[k + 1] - cc[k] < 2 * (cc[k] - cc[k - 1]) && cc[k + 1] - cc[k] > 0, "the cog's angle has no jump at the shift, step " + k);
  assert.ok(Math.abs(ch.ratio() - 2) < 1e-12 && ch.kind === "chain", "the chain reports the ratio it has now");
  // A cam: the follower's lift is the profile at the cam's angle, contact kept (the follower weighs on it, gravity pulls it down).
  const lift = (th) => 0.004 * (1 - Math.cos(th)), camSpecs = [{ name: "cam", r: 0.03, x: 0 }, { name: "follower", box: true, kg: 0.01, x: 0.1, slide: { axis: { x: 0, y: 1, z: 0 }, min: 0, max: 0.01 } }];
  const Cm = await wheels(camSpecs, { tau: 0.005 }), cm = cam(Cm.s, Cm.js[0], Cm.js[1], lift);
  const mb = await Cm.s.bakeCached(0.8, null, 0.1, Cm.opts), mt = turned(mb, 0, 0.8);
  let worst = 0, top = 0, wk = 0;
  for (let k = 0; k <= 384; k++) { const x = (mb.pose(1, k * DT).p.y - Y) * M; if (Math.abs(x - lift(mt[k])) > worst) { worst = Math.abs(x - lift(mt[k])); wk = k; } top = Math.max(top, x); }
  assert.ok(mt[384] > 2 * TAU, "the cam turns several times: " + mt[384]);
  assert.ok(top > 0.0075 && worst < 5e-5, "the follower's lift follows the profile within 0.05 mm (worst " + (worst * 1000).toFixed(4) + " mm at step " + wk + " (ω = " + ((mt[wk + 1] - mt[wk]) / DT).toFixed(1) + " rad/s), top " + (top * 1000).toFixed(2) + " mm)");
  assert.ok(cm.kind === "cam" && Math.abs(cm.angle() - mt[384]) < 1e-3, "the cam reports its unwrapped angle");
  // Every input of a chain and a cam is in the key.
  for (const [name, c] of [["a later shift", (s, j) => chain(s, [{ joint: j[0], teeth: 42 }, { joint: j[1], teeth: 14 }], { pitch: 0.0127, shifts: [{ at: 0.6, index: 1, teeth: 21 }] })], ["another pitch", (s, j) => chain(s, [{ joint: j[0], teeth: 42 }, { joint: j[1], teeth: 14 }], { pitch: 0.01, shifts: [{ at: 0.5, index: 1, teeth: 21 }] })]]) {
    const X = await wheels(Cp, { tau: 0.05, mem: C.mem }); c(X.s, X.js);
    const xb = await X.s.bakeCached(1.0, null, 0.1, X.opts);
    assert.ok(!xb.cached && xb.hash !== cb.hash, name + " misses the cache");
  }
  const Cm2 = await wheels(camSpecs, { tau: 0.005, mem: Cm.mem }); cam(Cm2.s, Cm2.js[0], Cm2.js[1], (th) => 0.003 * (1 - Math.cos(th)));
  const mb2 = await Cm2.s.bakeCached(0.8, null, 0.1, Cm2.opts);
  assert.ok(!mb2.cached && mb2.hash !== mb.hash, "another cam profile misses the cache");
  // A report reads the same on a cold bake and on a cache hit: ratio, torque and angle are what the bake ended on, stored with it.
  {
    const Cx = await wheels(Cp, { tau: 0.05, mem: C.mem }), chx = chain(Cx.s, [{ joint: Cx.js[0], teeth: 42 }, { joint: Cx.js[1], teeth: 14 }], { pitch: 0.0127, shifts: [{ at: 0.5, index: 1, teeth: 21 }] });
    assert.ok(Math.abs(chx.ratio() - 3) < 1e-12 && chx.angle() === 0 && chx.torque().driven === 0, "before the bake a report is the start: the first ratio, angle 0, no torque");
    const cbx = await Cx.s.bakeCached(1.0, null, 0.1, Cx.opts);
    assert.ok(cbx.cached, "the same chain replays from the cache");
    assert.deepEqual([chx.ratio(), chx.angle(), chx.torque()], [ch.ratio(), ch.angle(), ch.torque()], "a chain reports the same after a cache hit as after the live bake");
    assert.ok(Math.abs(chx.ratio() - 2) < 1e-12 && chx.angle() > 3 && chx.torque().driven !== 0, "and it is what the bake ended on: ratio 2, the angle turned, the torque passed: " + JSON.stringify([chx.angle(), chx.torque()]));
    const Gx = await wheels(pair, { tau: TQ, mem: G.mem }), gx = gear(Gx.s, Gx.js[0], Gx.js[1], { teeth: [12, 36] });
    assert.ok((await Gx.s.bakeCached(1.0, null, 0.1, Gx.opts)).cached);
    assert.deepEqual([gx.ratio(), gx.angle(), gx.torque()], [g.ratio(), g.angle(), g.torque()], "a gear reports the same after a cache hit");
    const Mx = await wheels(camSpecs, { tau: 0.005, mem: Cm.mem }), cmx = cam(Mx.s, Mx.js[0], Mx.js[1], lift);
    assert.ok((await Mx.s.bakeCached(0.8, null, 0.1, Mx.opts)).cached);
    assert.deepEqual([cmx.angle(), cmx.torque()], [cm.angle(), cm.torque()], "a cam reports the same after a cache hit");
    assert.ok(cmx.angle() > 2 * TAU, "a replayed cam reports the angle it ended on: " + cmx.angle());
  }
  // A cam profile that closes over a value: the values are in the key, not only the source text.
  {
    const mk = (L) => (th) => L * (1 - Math.cos(th)), camAt = async (L) => { const X = await wheels(camSpecs, { tau: 0.005, mem: Cm.mem }); cam(X.s, X.js[0], X.js[1], mk(L)); return X.s.bakeCached(0.3, null, 0.1, X.opts); };
    assert.equal(String(mk(0.004)), String(mk(0.003)), "the two profiles have the same source text");
    const k4 = await camAt(0.004), k3 = await camAt(0.003), k4b = await camAt(0.004);
    assert.ok(!k3.cached && k3.hash !== k4.hash, "a profile with another captured lift misses the cache");
    assert.ok(k4b.cached && k4b.hash === k4.hash, "the same captured lift replays from the cache");
  }
  // A spring reads the hinge angle within ±π: a free axle, or stops past a half turn, are refused; stops inside it are not.
  {
    const H = await wheels(pair);
    assert.throws(() => spring(H.s, H.js[0], { stiffness: 0.05, rest: 0 }), /free|half turn/, "a spring about a free axle");
    const Hs = await wheels([{ name: "hA", r: 0.012, x: 0, stops: [-0.5, 4] }]);
    assert.throws(() => spring(Hs.s, Hs.js[0], { stiffness: 0.0005, rest: 0 }), /half turn/, "stops past a half turn");
    const Hf = await wheels([{ name: "hB", r: 0.012, x: 0, stops: [-Math.PI, Math.PI] }]);
    assert.doesNotThrow(() => spring(Hf.s, Hf.js[0], { stiffness: 0.0005, rest: 0 }), "a spring about a hinge with stops inside a half turn");
  }
  // Wrong inputs are refused (nothing baked).
  const R = await wheels([...pair, { name: "gX", r: 0.01, x: 0.1, axis: { x: 1, y: 0, z: 0 } }, { name: "gS", box: true, kg: 0.01, x: 0.15, slide: { axis: { x: 0, y: 1, z: 0 }, min: 0, max: 0.01 } }, { name: "gG", r: 0.012, x: 0.2, group: 2 }]);
  const [a, b, x, sl, other] = R.js;
  assert.throws(() => gear(R.s, a, b, { teeth: [5, 36] }), /teeth/, "fewer than 6 teeth");
  assert.throws(() => gear(R.s, a, b, { teeth: [12.5, 36] }), /teeth/, "a fractional tooth count");
  assert.throws(() => gear(R.s, a, b, { teeth: [12, 36], ratio: 3 }), /teeth|ratio/, "teeth and ratio together");
  assert.throws(() => gear(R.s, a, b, {}), /teeth|ratio/, "neither teeth nor ratio");
  assert.throws(() => gear(R.s, a, b, { ratio: -2 }), /ratio/, "a negative ratio");
  assert.throws(() => gear(R.s, a, sl, { ratio: 2 }), /hinge/, "a slide where a hinge is needed");
  assert.throws(() => gear(R.s, a, x, { ratio: 2 }), /parallel/, "axes at a right angle");
  assert.throws(() => gear(R.s, a, a, { ratio: 2 }), /different/, "a gear meshing with itself");
  assert.throws(() => gear(R.s, a, other, { teeth: [12, 12] }), /collision group/, "meshing gears share a collision group");
  assert.throws(() => belt(R.s, [{ joint: a, r: 0.03 }, { joint: b, r: 0.09 }], { slip: 1 }), /slip/, "slip 1");
  assert.throws(() => belt(R.s, [{ joint: a, r: 0.03 }, { joint: b, r: 0.09 }], { slip: -0.1 }), /slip/, "negative slip");
  assert.throws(() => belt(R.s, [{ joint: a, teeth: 20 }, { joint: b, teeth: 60 }], { pitch: 0.005, slip: 0.1 }), /slip/, "slip on a toothed belt");
  assert.throws(() => belt(R.s, [{ joint: a, teeth: 20 }, { joint: b, teeth: 60 }], {}), /pitch/, "teeth without a pitch");
  assert.throws(() => belt(R.s, [{ joint: a, r: 0.03 }], {}), /pulleys/, "one pulley");
  assert.throws(() => chain(R.s, [{ joint: a, teeth: 42 }, { joint: b, teeth: 14 }], {}), /pitch/, "a chain without a pitch");
  assert.throws(() => chain(R.s, [{ joint: a, teeth: 42 }, { joint: b, teeth: 14 }], { pitch: 0.0127, shifts: [{ at: 0.5, index: 0, teeth: 21 }] }), /index/, "a shift of the driver");
  assert.throws(() => chain(R.s, [{ joint: a, teeth: 42 }, { joint: b, teeth: 14 }], { pitch: 0.0127, shifts: [{ at: -1, index: 1, teeth: 21 }] }), /shift/, "a shift before the start");
  assert.throws(() => cam(R.s, a, sl, (th) => 0.001 + 0.004 * (1 - Math.cos(th))), /start/, "a profile that is not 0 at the start");
  assert.throws(() => cam(R.s, a, sl, (th) => th * 0.001), /repeat/, "a profile that does not repeat each turn");
  assert.throws(() => cam(R.s, a, sl, (th) => 0.02 * (1 - Math.cos(th))), /stop/, "a lift beyond the follower's stop");
  assert.throws(() => cam(R.s, sl, a, lift), /hinge|slide/, "a cam on a slide");
  assert.throws(() => cam(R.s, a, sl, "x"), /profile/, "a profile that is not a function");
  // A coupled pair is a mechanism part: it is not an island body.
  const Q = await wheels(pair, { tau: TQ }); gear(Q.s, Q.js[0], Q.js[1], { teeth: [12, 36] });
  await assert.rejects(Q.s.bakeCached(0.3, null, 0.1, { ...Q.opts, islands: [[Q.parts[0]]] }), /mechanism/, "a gear pair cannot be baked in an island");
  // Transmissions: the geometry of what the couplings tie together. Involute spur gears at a real module and tooth count mesh at the
  // centre distance without touching over a whole turn (and the test can see a clash: half a tooth off, teeth go into teeth);
  // an interfering pair is refused; a belt or chain loop has the length of the closed form, links sit along it at the pitch, and
  // a replayed frame knows where they are from the driver's pose alone, moving at ω·r.
  {
    const T = await use("transmission.js"), m = 0.002;
    const place = (g, cx, rot) => { const c = Math.cos(rot), s = Math.sin(rot); return g.outline.map(([x, y]) => [cx + x * c - y * s, y * c + x * s]); };
    const within = (P, [px, py]) => { let k = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) k = !k; } return k; };
    const apart = (P, [px, py]) => { let best = Infinity; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [ax, ay] = P[j], [bx, by] = P[i], dx = bx - ax, dy = by - ay, u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); best = Math.min(best, Math.hypot(ax + u * dx - px, ay + u * dy - py)); } return best; };
    // Over one turn of the first gear in 720 steps: vertices of either gear strictly inside the other, and the least gap between a vertex and the other outline.
    const turnOf = (g1, g2, ms, off = 0, stopAt = Infinity) => {
      let hits = 0, gap = Infinity; const lo = ms.centre - g2.ra - m, hi = g1.ra + m, win = (P) => P.filter((p) => p[0] >= lo && p[0] <= hi);
      for (let k = 0; k < 720 && hits < stopAt; k++) {
        const phi = (k / 720) * TAU, A = place(g1, 0, phi), B = place(g2, ms.centre, ms.phase2 + off - (phi * g1.z) / g2.z);
        for (const p of win(B)) within(A, p) ? hits++ : (gap = Math.min(gap, apart(A, p)));
        for (const p of win(A)) within(B, p) ? hits++ : (gap = Math.min(gap, apart(B, p)));
      }
      return { hits, gap };
    };
    const g1 = T.involute({ module: m, teeth: 12, pressure: 25 }), g2 = T.involute({ module: m, teeth: 36, pressure: 25 }), ms = T.meshing(g1, g2);
    const near = (a, b) => Math.abs(a - b) < 1e-12;
    assert.ok(near(g1.rp, 0.012) && near(g1.ra, 0.014) && near(g1.rf, 0.012 - 1.25 * m) && near(g1.rb, 0.012 * Math.cos((25 * Math.PI) / 180)), "radii: pitch m·z/2, tip +m, root −1.25m, base rp·cos α");
    assert.ok(near(ms.centre, 0.048) && near(ms.ratio, 1 / 3) && near(ms.phase2, Math.PI - Math.PI / 36) && ms.contact > 1.3 && ms.contact < 1.5, "the centre distance is m(z1+z2)/2, the contact ratio about 1.4: " + JSON.stringify(ms));
    assert.ok(g1.outline.some(([x, y]) => Math.abs(x - g1.ra) < 1e-12 && Math.abs(y) < 1e-12) && g1.outline.every(([x, y]) => Math.hypot(x, y) <= g1.ra + 1e-12 && Math.hypot(x, y) >= g1.rf - 1e-12), "tooth 0 is centred on +x, every point is between the root and the tip circle");
    const ok = turnOf(g1, g2, ms), bad = turnOf(g1, g2, ms, Math.PI / g2.z, 1);
    assert.equal(ok.hits, 0, "two meshing involute gears never interpenetrate over a turn");
    assert.ok(ok.gap > 0 && ok.gap < 0.1 * m, "they really mesh: the least gap is " + (ok.gap / m).toFixed(3) + " m");
    assert.ok(bad.hits > 0, "half a tooth off, teeth are inside teeth (the check can see a clash)");
    const h1 = T.involute({ module: m, teeth: 20 }), h2 = T.involute({ module: m, teeth: 40 }), hs = T.meshing(h1, h2);
    assert.equal(turnOf(h1, h2, hs).hits, 0, "a 20:40 pair at 20 degrees meshes too");
    // Refusals: a fixable pair is told how.
    assert.throws(() => T.meshing(T.involute({ module: m, teeth: 12 }), T.involute({ module: m, teeth: 36 })), /interference.*25/, "12:36 at 20 degrees interferes");
    assert.throws(() => T.meshing(g1, T.involute({ module: 0.003, teeth: 36, pressure: 25 })), /module/, "gears of another module do not mesh");
    assert.throws(() => T.meshing(g1, T.involute({ module: m, teeth: 36, pressure: 20 })), /pressure/, "gears of another pressure angle do not mesh");
    assert.throws(() => T.involute({ module: m, teeth: 5 }), /teeth/, "fewer than 6 teeth");
    assert.throws(() => T.involute({ module: m, teeth: 12.5 }), /teeth/, "a fractional tooth count");
    assert.throws(() => T.involute({ module: 0, teeth: 12 }), /module/, "no module");
    assert.throws(() => T.involute({ module: m, teeth: 6, pressure: 40 }), /pointed/, "a pointed tooth");
    // The solid: an extrusion in metres, centred on the axle's plane, with a bore when asked.
    const geo = T.gearGeometry(g1, { width: 0.01 }), bored = T.gearGeometry(g1, { width: 0.01, bore: 0.003 });
    geo.computeBoundingBox(); bored.computeBoundingBox();
    assert.ok(Math.abs(geo.boundingBox.max.z - 0.005) < 1e-9 && Math.abs(geo.boundingBox.min.z + 0.005) < 1e-9 && Math.abs(geo.boundingBox.max.x - g1.ra) < 1e-9, "a gear solid is width deep, centred, tip radius wide");
    const rMin = (G) => { const p = G.attributes.position; let r = Infinity; for (let i = 0; i < p.count; i++) r = Math.min(r, Math.hypot(p.getX(i), p.getY(i))); return r; };
    assert.ok(rMin(geo) > g1.rf - 1e-9 && Math.abs(rMin(bored) - 0.003) < 1e-9, "the bore leaves a hole of its radius");
    // A belt or chain loop: its length is the closed form, it is continuous, an idler on the back adds its detour.
    const R1 = 0.0849, R2 = 0.0283, CD = 0.42, L = 2 * Math.sqrt(CD * CD - (R1 - R2) ** 2) + Math.PI * (R1 + R2) + 2 * (R1 - R2) * Math.asin((R1 - R2) / CD);
    assert.ok(Math.abs(T.openLength(R1, R2, CD) - L) < 1e-12, "openLength is the closed form");
    const lp = T.loopPath([{ x: 0, y: 0, r: R1 }, { x: CD, y: 0, r: R2 }]);
    assert.ok(Math.abs(lp.length - L) < 1e-9, "two wheels: the loop is as long as the closed form: " + (lp.length - L));
    const EPS = 1e-7, wrapA = (a) => a - TAU * Math.round(a / TAU), joints = (P) => { for (const sg of P.segments) for (const s0 of [sg.s0, 0, P.length]) {
      const a = P.at(s0 - EPS), b = P.at(s0 + EPS);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 3 * EPS && Math.abs(wrapA(a.angle - b.angle)) < 1e-5, "the path is continuous at s = " + s0);
    } };
    joints(lp);
    assert.ok(Math.abs(lp.segments.reduce((n, sg) => n + sg.length, 0) - lp.length) < 1e-12, "the segments add up to the length");
    const lo = lp.at(0.1), lw = lp.at(0.1 + lp.length);
    assert.ok(Math.abs(lo.x - lw.x) < 1e-9 && Math.abs(lo.y - lw.y) < 1e-9, "s wraps round the loop");
    assert.ok(Math.abs(lo.angle) < 0.2 && lo.y < 0, "the loop runs counter-clockwise: the lower run goes +x");
    const idler = T.loopPath([{ x: 0, y: 0, r: R2 }, { x: CD / 2, y: -0.07, r: 0.02, inside: true }, { x: CD, y: 0, r: R1 }]);
    assert.ok(idler.length > T.loopPath([{ x: 0, y: 0, r: R2 }, { x: CD, y: 0, r: R1 }]).length, "an idler on the back of the belt adds a detour");
    joints(idler);
    assert.throws(() => T.loopPath([{ x: 0, y: 0, r: 0.05 }, { x: 0.06, y: 0, r: 0.02, inside: true }]), /tangent/, "wheels that overlap have no belt between them");
    assert.throws(() => T.loopPath([{ x: 0, y: 0, r: 0.05 }]), /wheels/, "one wheel");
    // The centre for a whole number of links.
    for (const links of [110, 120]) { const c = T.centreFor({ links, pitch: 0.0127, r1: R1, r2: R2 }); assert.ok(Math.abs(T.openLength(R1, R2, c) - links * 0.0127) < 1e-9, links + " links round-trip through centreFor"); }
    assert.throws(() => T.centreFor({ links: 8, pitch: 0.0127, r1: R1, r2: R2 }), /centre|links/, "a chain too short to go round");
    const cc = T.centreFor({ links: 110, pitch: 0.0127, r1: R1, r2: R2 }), cl = T.loopPath([{ x: 0, y: 0, r: R1 }, { x: cc, y: 0, r: R2 }]), lk = T.linkPoses(cl, { pitch: 0.0127, phase: 0 });
    assert.equal(lk.length, 110, "110 links on a loop of 110 pitches");
    assert.ok(Math.abs(lk[0].x - cl.at(0).x) < 1e-12 && lk[0].y < 0, "the first link is where the loop starts");
    const first = T.linkPoses(cl, { pitch: 0.0127, phase: 0.003 });
    assert.ok(Math.hypot(first[0].x - lk[0].x, first[0].y - lk[0].y) > 0.0029, "the phase slides the links along the loop");
    assert.throws(() => T.linkPoses({ length: 110.4 * 0.005, at: () => ({ x: 0, y: 0, angle: 0 }) }, { pitch: 0.005, phase: 0 }), /whole number of links/, "a loop of 110.4 pitches");
    // Phase from the pose: any rotation of any size gives the same phase mod the pitch, in any frame order.
    const qz = (a) => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }), q0 = qz(0.7), PR = T.pitchRadius(20, 0.005);
    assert.ok(Math.abs(PR - (20 * 0.005) / TAU) < 1e-15, "pitch radius = teeth·pitch/2π");
    assert.ok(Math.abs(T.angleOf(qz(0.7 + 2), q0, Z) - 2) < 1e-12 && Math.abs(T.angleOf(qz(0.7 + 7), q0, Z) - (7 - TAU)) < 1e-12, "angleOf is the turn about the axis, wrapped");
    assert.ok(Math.abs(T.angleOf(qz(0.7 + 2), q0, { x: 0, y: 0, z: -1 }) + 2) < 1e-12, "and its sign follows the axis");
    const PR1 = PR - 0.005 * Math.floor(PR / 0.005); // one radian of the 20-tooth wheel moves the chain PR, folded into one pitch
    assert.ok(Math.abs(T.phaseOf(qz(0.7 + 1), q0, Z, 20, 0.005) - PR1) < 1e-12 && Math.abs(T.phaseOf(qz(0.7 + 1 + TAU * 3), q0, Z, 20, 0.005) - PR1) < 1e-9,"the phase is a distance along the chain and repeats every tooth");
    // Links move at ω·r: a toothed belt's phase at both pulleys advances by the same distance, ω·r, whatever their sizes.
    const Wl = await wheels(Bp.slice(0, 2), { tau: BT }); belt(Wl.s, [{ joint: Wl.js[0], teeth: 20 }, { joint: Wl.js[1], teeth: 60 }], { pitch: 0.005 });
    const lb = await Wl.s.bakeCached(0.6, null, 0.1, Wl.opts), lA = turned(lb, 0, 0.6), lB = turned(lb, 1, 0.6), PB = T.pitchRadius(60, 0.005);
    const ph = (i, n, t) => T.phaseOf(lb.pose(i, t).q, lb.pose(i, 0).q, Z, n, 0.005), fold = (d) => d - 0.005 * Math.round(d / 0.005);
    for (const t of [0.3, 0.5]) {
      const k = Math.round(t / DT), vA = fold(ph(0, 20, (k + 1) * DT) - ph(0, 20, k * DT)), vB = fold(ph(1, 60, (k + 1) * DT) - ph(1, 60, k * DT)), want = (lA[k + 1] - lA[k]) * PR;
      assert.ok(want > 1e-4 && want < 0.0025, "the belt moves a measurable part of a pitch per step: " + want);
      assert.ok(Math.abs(vA / want - 1) < 1e-3 && Math.abs(vB / want - 1) < 1e-3 && Math.abs(((lB[k + 1] - lB[k]) * PB) / want - 1) < 1e-3, `at ${t} s both pulleys move the belt by ω·r per step: ${vA}, ${vB} vs ${want}`);
    }
  }
  // A bicycle drivetrain changing gear (examples/drivetrain.js): the pedals' torque is the only cause; the wheel turns at ring/cog,
  // 3 on the 14-tooth cog and 2 after the shift to the 21-tooth one at 1.0 s; the same whole, even number of chain links goes round
  // both cogs (the tensioner takes up the difference); the links move as far as the ring's teeth do; two bakes are identical.
  {
    const mk = async (o = {}, mem) => {
      const s = await makeSim(THREE), d = makeDrivetrain({ ...kit, scene: new THREE.Scene() }, s, { at: new THREE.Vector3(0, 0.5, 0), shiftAt: 1.0, ...o });
      return { s, d, opts: { load: async (k) => (mem?.has(k) ? mem.get(k).slice().buffer : null), save: async (k, v) => mem?.set(k, v) } };
    };
    const mem = new Map(), X = await mk({}, mem), bk = await X.s.bakeCached(2.0, null, 0.1, X.opts), ta = turned(bk, 0, 2.0), tb = turned(bk, 1, 2.0);
    const rate = (th, t) => { const k = Math.round(t / DT); return (th[k] - th[k - 24]) / (24 * DT); };
    assert.ok(X.d.links % 2 === 0 && X.d.links > 80, "a whole, even number of links: " + X.d.links);
    for (const L of X.d.loops) assert.ok(Math.abs(L.length - X.d.links * 0.0127) < 1e-6, "the loop round each cog is links·pitch long: " + (L.length - X.d.links * 0.0127));
    assert.ok(Math.abs(X.d.tensioner.angles[0] - X.d.tensioner.angles[1]) > 5, "the tensioner swings to take up the other cog's wrap");
    assert.ok(rate(ta, 0.8) * 60 / TAU > 40 && rate(ta, 0.8) * 60 / TAU < 100, "the legs turn the cranks at a cadence: " + (rate(ta, 0.8) * 60 / TAU).toFixed(0) + " rpm");
    assert.ok(Math.abs(rate(tb, 0.8) / rate(ta, 0.8) - 3) < 1e-3, "14 teeth: the wheel turns 42/14 = 3 times as fast as the cranks: " + rate(tb, 0.8) / rate(ta, 0.8));
    assert.ok(Math.abs(rate(tb, 1.8) / rate(ta, 1.8) - 2) < 1e-3, "21 teeth after the shift: 42/21 = 2: " + rate(tb, 1.8) / rate(ta, 1.8));
    assert.ok(rate(ta, 1.8) > 1.3 * rate(ta, 0.8), "the wheel's momentum comes back to the pedals: the cadence rises in the easier gear");
    assert.ok(X.d.chain.kind === "chain", "the chain reports as a chain");
    // The chain at three times: every link matrix finite, neighbours a pitch apart (a chord on a cog), the links moved as far as the teeth.
    const pins = () => { const v = new THREE.Vector3(), m = new THREE.Matrix4(); return Array.from({ length: X.d.links }, (_, i) => { X.d.rollers.getMatrixAt(i, m); return v.setFromMatrixPosition(m).clone(); }); };
    for (const t of [0.5, 1.1, 1.9]) {
      bk.apply(t); X.d.update(t);
      const P = pins();
      assert.ok(P.every((p) => Number.isFinite(p.x + p.y + p.z)), "every link is placed at t = " + t);
      P.forEach((p, i) => { const n = P[(i + 1) % P.length], c = Math.hypot(p.x - n.x, p.y - n.y); assert.ok(c <= 0.0127 * (1 + 1e-5) && c > 0.0127 * 0.8, `link ${i} is a pitch from the next at t = ${t}: ${c}`); });
    }
    const phase = (t) => { bk.apply(t); X.d.update(t); return X.d.state.phase; };
    for (const t of [0.4, 0.7]) {
      const k = Math.round(t / DT), moved = (ta[k + 1] - ta[k]) * ((42 * 0.0127) / TAU), fold = (d) => d - 0.0127 * Math.round(d / 0.0127), got = fold(phase((k + 1) * DT) - phase(k * DT));
      assert.ok(moved > 1e-4 && Math.abs(got / moved - 1) < 2e-3, `at ${t} s the links move as far as the ring's teeth: ${got} vs ${moved}`);
    }
    // Two bakes are the same; a cached replay too; another shift time misses the cache.
    const Y = await mk({}), yb = Y.s.bake(2.0, null, 0.1);
    for (const t of [0.5, 1.1, 1.9]) for (const i of [0, 1]) assert.deepEqual(poseAt(yb, i, t), poseAt(bk, i, t), `a re-bake of the drivetrain is identical at ${t} s, body ${i}`);
    const Zr = await mk({}, mem), zb = await Zr.s.bakeCached(2.0, null, 0.1, Zr.opts);
    assert.ok(zb.cached && zb.hash === bk.hash, "the same drivetrain replays from the cache");
    const W = await mk({ shiftAt: 1.2 }, mem), wb = await W.s.bakeCached(0.3, null, 0.1, W.opts);
    assert.ok(!wb.cached && wb.hash !== bk.hash, "another shift time misses the cache");
    // No shift: the ratio stays at the first cog. Refusals say what to change.
    const N = await mk({ shiftAt: null }), nb = N.s.bake(1.6, null, 0.1), na = turned(nb, 0, 1.6), nc = turned(nb, 1, 1.6);
    assert.ok(Math.abs(rate(nc, 1.5) / rate(na, 1.5) - 3) < 1e-3, "without a shift the ratio stays 3");
    await assert.rejects(mk({ ring: 11 }), /ring/, "a ring under 12 teeth");
    await assert.rejects(mk({ cogs: [14] }), /cogs/, "one cog");
    await assert.rejects(mk({ cogs: [14, 14] }), /cogs/, "two cogs of the same size");
    await assert.rejects(mk({ cogs: [14, 40] }), /links/, "a ring and cassette the tensioner cannot span");
    await assert.rejects(mk({ at: undefined }), /bottom bracket/, "no position");
  }
}
// Creatures: a gait's stride scales with size by dynamic similarity, a planted foot stays where it landed while loaded, and a
// creature crossing from floor to wall keeps its feet on the colliders. The feet are placed once (the bake), at(t) only reads them.
{
  const M = K.M, g = K.G * K.M;
  // Refusals: creature.js and examples/lizard.js refuse only through creature.js refuse(id, message), one literal id per site. A case
  // names the id it expects (R), and the audit at the end of this block reads both sources: no other throw, no id built at run time, no
  // id on two sites (one regex would then pass for both), and every id hit by a case here. A refusal without its case fails the gate.
  const hits = new Set(), R = (id, re) => (e) => {
    assert.equal(e?.refusal, id, `refused as ${id}, not as ${e?.refusal}: ${e?.message}`);
    if (re) assert.match(e.message, re);
    hits.add(id);
    return true;
  };
  const audit = (sources, hit) => {
    const bad = [], seen = new Map();
    for (const [file, src] of Object.entries(sources)) {
      const code = src.replace(/\/\/.*$/gm, ""), defs = (code.match(/\bfunction refuse\(/g) || []).length;
      const throws = (code.match(/\bthrow\b/g) || []).length;
      if (throws > defs) bad.push(`${file}: ${throws - defs} throw outside refuse()`);
      if ((code.match(/(?<!function )\brefuse\((?!"[^"]*",)/g) || []).length) bad.push(`${file}: a refuse() id that is not a literal`);
      for (const [, id] of code.matchAll(/\brefuse\("([^"]*)",/g)) {
        if (seen.has(id)) bad.push(`${file}: id ${id} on two sites (also in ${seen.get(id)})`);
        seen.set(id, file);
        if (!hit.has(id)) bad.push(`${file}: refusal ${id} has no case`);
      }
    }
    return bad;
  };
  { // the audit itself: a sound source passes; a raw throw, a built id, a shared id and an untested id are each caught
    const def = 'export function refuse(id, msg) { throw Object.assign(new Error(msg), { refusal: id }); }\n', one = new Set(["a.one"]);
    assert.deepEqual(audit({ "a.js": def + 'if (x) refuse("a.one", "m"); // a comment that says throw' }, one), [], "a sound source passes");
    assert.deepEqual(audit({ "a.js": def + 'if (x) refuse("a.one", "m");\nif (y) throw new Error("raw");' }, one), ["a.js: 1 throw outside refuse()"], "a raw throw");
    assert.deepEqual(audit({ "a.js": def + 'if (x) refuse("a." + k, "m");' }, one), ["a.js: a refuse() id that is not a literal"], "an id built at run time");
    assert.deepEqual(audit({ "a.js": def + 'if (x) refuse("a.one", "m");', "b.js": 'if (y) refuse("a.one", "n");' }, one), ["b.js: id a.one on two sites (also in a.js)"], "one id on two sites");
    assert.deepEqual(audit({ "a.js": def + 'if (x) refuse("a.one", "m");\nif (y) refuse("a.two", "n");' }, one), ["a.js: refusal a.two has no case"], "a refusal without its case");
  }
  // Scaling: the same Froude number at 4x the leg length is half the stride frequency, f = Fr^0.2·sqrt(g/h)/2.3.
  for (const [name, h, v] of [["walk", 0.25, 0.4], ["tripod", 0.02, 0.05], ["sprawl", 0.02, 0.05]]) {
    const a = gait(name, { h, v }), b = gait(name, { h: h * 4, v: v * 2 }), Fr = (v * v) / (g * h);
    assert.ok(Math.abs(b.f / a.f - 0.5) < 1e-9, `${name}: 4x the leg at the same Fr halves the stride frequency: ${b.f / a.f}`);
    assert.ok(Math.abs(a.f / ((Fr ** 0.2 * Math.sqrt(g / h)) / 2.3) - 1) < 0.01, `${name}: f = Fr^0.2·sqrt(g/h)/2.3: ${a.f}`);
    assert.ok(Math.abs(a.f * a.stride - v) < 1e-9 && Math.abs(a.Fr - Fr) < 1e-9, `${name}: f·stride = v`);
  }
  assert.throws(() => gait("walk", { h: 0.25, v: 3 }), R("gait.froude", /trot/), "faster than a walk");
  assert.throws(() => gait("gallop", { h: 0.25, v: 1 }), R("gait.name", /walk|trot|sprawl|tripod/), "an unknown gait names the four");
  assert.throws(() => gait("trot", { h: 0.25, v: 0 }), R("gait.v", /speed|v/), "no speed");
  for (const h of [0, -0.25, NaN, Infinity, "0.25", undefined]) assert.throws(() => gait("walk", { h, v: 0.4 }), R("gait.h", /h is the leg length/), "a leg length of " + h);
  assert.ok(gait("walk", { h: 0.25, v: 0.4 }).f > 0, "a leg length of 0.25 m is taken");
  assert.throws(() => gait("trot", { h: 0.25, v: 1, duty: 0.95 }), R("gait.duty", /duty/), "duty out of range");
  { // no gravity, no Froude number
    K.makeKit(new THREE.Scene(), { mpu: 2, gravity: 0 });
    try { assert.throws(() => gait("walk", { h: 0.25, v: 0.4 }), R("gait.gravity", /gravity/), "no gravity"); } finally { K.makeKit(new THREE.Scene(), { mpu: 2 }); }
  }

  // A set: a floor and a wall (axis aligned, the wall's face at x = 0.3 m) in scene units, and a path across the corner.
  const s = new THREE.Scene(), solid = (w, h, d, x, y, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), new THREE.MeshStandardMaterial());
    m.position.set(x / M, y / M, 0); m.name = name; s.add(m); return m;
  };
  solid(0.6, 0.02, 0.3, 0, -0.01, "floor"); solid(0.02, 0.3, 0.3, 0.31, 0.15, "wall"); s.updateMatrixWorld(true);
  const V = (x, y) => new THREE.Vector3(x / M, y / M, 0), line = (a, b) => new THREE.LineCurve3(V(...a), V(...b));
  const route = (r, top) => {
    const c = new THREE.CurvePath();
    c.add(line([0.02, 0], [0.3 - r, 0])); c.add(new THREE.QuadraticBezierCurve3(V(0.3 - r, 0), V(0.3, 0), V(0.3, r))); c.add(line([0.3, r], [0.3, top]));
    return c;
  };
  const leg = (name, x, z) => ({ name, hip: [x, 0.008, z], foot: [x, 2.75 * z], segments: [0.013, 0.013], bend: "out" });
  const gecko = (over = {}) => rig(null, { legs: [leg("LF", 0.022, -0.008), leg("RF", 0.022, 0.008), leg("LH", -0.022, -0.008), leg("RH", -0.022, 0.008)], spine: { length: 0.07, sway: 12 }, cling: true, ...over });
  const walk = creaturePath(gecko(), route(0.07, 0.2), { scene: s, speed: 0.05, gait: "sprawl" });
  assert.ok(walk.duration > 8 && walk.gait.name === "sprawl", "about 0.5 m at 5 cm/s");

  // A planted foot stays within 1 mm of where it landed while loaded; no segment stretches.
  let drift = 0, stretch = 0, planted = 0;
  const seg = [0.013, 0.013];
  for (let t = 0; t <= walk.duration; t += 1 / 240) {
    const st = walk.at(t);
    for (const l of st.legs) {
      assert.ok(l.joints.flat().every(Number.isFinite), "joints are finite at " + t);
      for (let j = 0; j < l.joints.length - 1; j++) stretch = Math.max(stretch, Math.abs(Math.hypot(...l.joints[j].map((c, i) => c - l.joints[j + 1][i])) - seg[j]));
      if (!l.planted) continue;
      planted++;
      const hold = walk.footholds[l.name].find((h) => h.k === l.k), foot = l.joints[l.joints.length - 1];
      drift = Math.max(drift, Math.hypot(...foot.map((c, i) => c - hold.p[i])));
    }
  }
  assert.ok(planted > 1000 && drift < 0.001, `a planted foot drifts ${(drift * 1000).toFixed(3)} mm (limit 1 mm) over ${planted} samples`);
  assert.ok(stretch < 1e-4, `no segment stretches: ${stretch} m`);

  // Floor to wall: every foothold is on a collider, stances on both, the body ends up along the wall's normal.
  const rc = new THREE.Raycaster(), onSet = [], names = new Set();
  s.traverse((o) => o.isMesh && onSet.push(o));
  for (const [name, list] of Object.entries(walk.footholds)) for (const h of list) {
    names.add(h.on);
    assert.ok(h.on === "floor" || h.on === "wall", `${name} stance ${h.k} is on ${h.on}`);
    const n = new THREE.Vector3(...h.n), o = new THREE.Vector3(...h.p).addScaledVector(n, 0.005);
    rc.set(o.divideScalar(M), n.clone().negate()); rc.far = 0.02 / M;
    const hit = rc.intersectObjects(onSet, false)[0];
    assert.ok(hit && Math.abs(hit.distance * M - 0.005) < 0.001, `${name} stance ${h.k} sits on the collider (${hit && (hit.distance * M * 1000).toFixed(2)} mm off 5 mm)`);
  }
  assert.ok(names.has("floor") && names.has("wall"), "stances on both the floor and the wall");
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...walk.at(walk.duration).body.q));
  assert.ok(up.dot(new THREE.Vector3(-1, 0, 0)) > 0.95, "the body ends up along the wall's normal: " + up.toArray());
  const tog = walk.together("floor", "wall");
  assert.ok(Number.isFinite(tog) && tog > 0 && tog < walk.duration, "feet on the floor and the wall together at " + tog);
  assert.deepEqual(walk.touching(0), ["floor"], "standing on the floor at the start");
  assert.deepEqual(walk.touching(walk.duration), ["wall"], "standing on the wall at the end");
  assert.ok(walk.steps.length > 40 && walk.steps.every((e, i, a) => (i === 0 || a[i - 1].t <= e.t) && (e.on === "floor" || e.on === "wall") && e.at.length === 3), "touchdowns, sorted, on the set");
  assert.ok(walk.together("floor", "nowhere") === null, "never on a thing that is not there");
  // The footholds' times are finite (a JSON export keeps them), inside the walk.
  for (const [name, list] of Object.entries(walk.footholds)) for (const h of list) assert.ok(Number.isFinite(h.t0) && Number.isFinite(h.t1) && h.t0 <= h.t1 && h.t0 >= 0 && h.t1 <= walk.duration, `${name} stance ${h.k} has a finite time inside the walk: ${h.t0}..${h.t1}`);

  // Together from the first step: a walk that starts with the left feet on one solid and the right feet on another touches both at the
  // start of the walk (a finite time, never -Infinity), and not before `start`. Mid-walk (above) and never (null) are the other two answers.
  {
    const s2 = new THREE.Scene(), slab = (z0, z1, name) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6 / M, 0.02 / M, (z1 - z0) / M), new THREE.MeshStandardMaterial()); m.position.set(0, -0.01 / M, (z0 + z1) / 2 / M); m.name = name; s2.add(m); };
    slab(-0.15, 0.001, "A"); slab(-0.001, 0.15, "B"); s2.updateMatrixWorld(true);
    const run = new THREE.CurvePath(); run.add(line([-0.2, 0], [0.2, 0]));
    for (const start of [0, 2.5]) {
      const w = creaturePath(gecko(), run, { scene: s2, speed: 0.05, gait: "sprawl", start }), both = w.together("A", "B");
      assert.ok(Number.isFinite(both), `left feet on A and right feet on B, start ${start}: together is a time: ${both}`);
      assert.ok(both >= start && both <= start + 0.5 && w.together("B", "A") === both, `together is the start of the walk, ${start}: ${both}`);
      assert.deepEqual(w.touching(start + 1), ["A", "B"], "both are touched while walking");
      for (const [name, list] of Object.entries(w.footholds)) for (const h of list) assert.ok(Number.isFinite(h.t0) && Number.isFinite(h.t1), `${name} stance ${h.k}: finite times`);
      assert.ok(w.together("A", "nowhere") === null, "never on a thing that is not there");
    }
  }

  // An insect: six legs of three segments in alternating tripods, on the floor alone (no cling needed).
  {
    const sg = [0.005, 0.005, 0.004], six = [["L1", 0.006, -1], ["L2", 0, -1], ["L3", -0.006, -1], ["R1", 0.006, 1], ["R2", 0, 1], ["R3", -0.006, 1]]
      .map(([name, x, side]) => ({ name, hip: [x, 0.004, side * 0.003], foot: [x, side * 0.009], segments: sg, bend: "up" }));
    const straight = new THREE.CurvePath(); straight.add(line([0.02, 0], [0.2, 0]));
    const bug = rig(null, { legs: six, spine: { length: 0.02 } }), w = creaturePath(bug, straight, { scene: s, speed: 0.02, gait: "tripod" });
    let dr = 0, st = 0, lifted = 0;
    for (let t = 0; t <= w.duration; t += 1 / 240) {
      const at = w.at(t);
      for (const l of at.legs) {
        for (let j = 0; j < 3; j++) st = Math.max(st, Math.abs(Math.hypot(...l.joints[j].map((c, i) => c - l.joints[j + 1][i])) - sg[j]));
        if (l.planted) dr = Math.max(dr, Math.hypot(...l.joints[3].map((c, i) => c - w.footholds[l.name].find((h) => h.k === l.k).p[i])));
      }
      if (t > 1 && t < w.duration - 1 && at.legs.filter((l) => l.planted).length < 3) lifted++;
    }
    assert.ok(dr < 0.001 && st < 1e-4 && lifted === 0, `a tripod gait keeps three feet down and no foot drifts: ${dr} m, stretch ${st} m, ${lifted} frames with fewer than three planted`);
  }

  // Drawn (examples/lizard.js): a lizard on a swept body with swept limbs. Its drawn foot is on the foothold while planted, the chest
  // breathes and the tail does not, the trunk sways, the head turns toward a stimulus when told to and only then.
  {
    const rate = 1.5, depth = 0.04, L = makeLizard({ breath: { rate, depth } }), w = wallClimb({ scene: s }, L, { scene: s, wall: { x: 0.3 / M }, from: V(0.02, 0), height: 0.2 / M, speed: 0.05 });
    s.add(L.creature.group);
    try {
      let off = 0, planted = 0, sway = 0;
      const tail = L.body.geometry.attributes.position, restTail = tail.array.slice(), vt = tail.count - 5;
      for (let t = 0; t <= w.duration; t += 1 / 120) {
        w.apply(t); s.updateMatrixWorld(true);
        for (const l of w.at(t).legs) {
          const segs = L.creature.limbs[l.name], last = segs[segs.length - 1];
          const tip = last.localToWorld(new THREE.Vector3(last.userData.length, 0, 0)).multiplyScalar(M);
          assert.ok(Number.isFinite(tip.x + tip.y + tip.z), "the drawn foot is finite at " + t);
          if (!l.planted) continue;
          planted++;
          off = Math.max(off, tip.distanceTo(new THREE.Vector3(...w.footholds[l.name].find((h) => h.k === l.k).p)));
        }
        sway = Math.max(sway, Math.abs(tail.getZ(vt) - restTail[vt * 3 + 2]));
      }
      assert.ok(planted > 1000 && off < 0.001, `the drawn foot is ${(off * 1000).toFixed(3)} mm off its foothold (limit 1 mm) over ${planted} samples`);
      assert.ok(tail.array.every(Number.isFinite), "the body's vertices are finite");
      assert.ok(sway > 0.001, `the trunk sways: the tail moves ${(sway * 1000).toFixed(2)} mm sideways`);
      assert.ok(L.body.frustumCulled === false, "a body whose vertices move every frame is not culled");
      // Breathing: before the walk starts the trunk does not sway, so the chest girth alone changes, by the depth, and the tail not at all.
      const { pts, seg } = L.body.geometry.userData.sweep, centre = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      const rad = L.body.geometry.userData.sweep.rad, ring = (i) => centre.getPointAt(i / seg);
      let mid = 0; for (let i = 0; i <= seg; i++) if (Math.abs(ring(i).x) < Math.abs(ring(mid).x)) mid = i;
      const girth = (i) => { const p = L.body.geometry.attributes.position, v = i * (rad + 1); return new THREE.Vector3(p.getX(v), p.getY(v), p.getZ(v)).distanceTo(ring(i)); };
      const tailVert = () => Array.from(tail.array.slice((seg - 3) * (rad + 1) * 3, (seg - 3) * (rad + 1) * 3 + 3));
      w.apply(-1); const g0 = girth(mid), t0 = tailVert();
      w.apply(-1 + 1 / (4 * rate)); const g1 = girth(mid), t1 = tailVert();
      assert.ok(Math.abs(Math.abs(g1 / g0 - 1) - depth) < 1e-3, `the chest girth changes by the depth: ${g1 / g0}`);
      assert.deepEqual(t1, t0, "the tail does not breathe");
      // The head turns toward a stimulus on a call, eased over dur, clamped, and never before.
      const aim = new THREE.Vector3(0.05 / M, 0, -0.3 / M), lim = 70 * Math.PI / 180;
      assert.equal(w.at(0.6).head, 0, "no call, no turn");
      w.look(aim, 0.5, { dur: 0.25 });
      assert.equal(w.at(0.5).head, 0, "still at the call");
      const mid2 = w.at(0.625).head;
      assert.ok(mid2 > 0.2 * lim && mid2 < 0.8 * lim, "turning half way at half the time: " + mid2);
      for (const t of [0.75, 2, 6]) assert.ok(Math.abs(w.at(t).head - lim) < 1e-9, `the head is at the clamp at ${t} s: ${w.at(t).head}`);
      w.apply(2);
      assert.ok(Math.abs(L.head.rotation.y - lim) < 1e-9, "apply turns the head");
    } finally { s.remove(L.creature.group); }
    assert.throws(() => rig(new THREE.Mesh(new THREE.BoxGeometry()), { legs: [leg("LF", 0.02, -0.008)], spine: { length: 0.07 } }), R("rig.body", /sweep/), "a body that is not a sweep");
    assert.ok(Math.abs(restingBreath(4) - (53.5 * 4 ** -0.26) / 60) < 1e-12 && restingBreath(40) < restingBreath(4), "a bigger animal breathes slower");
  }

  // Cling: a wall holds only an animal that grips.
  assert.throws(() => creaturePath(gecko({ cling: false }), route(0.07, 0.2), { scene: s, speed: 0.05, gait: "sprawl" }), R("path.cling", /cling/), "no cling, no wall");
  // The bake is deterministic.
  const again = creaturePath(gecko(), route(0.07, 0.2), { scene: s, speed: 0.05, gait: "sprawl" });
  assert.equal(JSON.stringify(again.footholds), JSON.stringify(walk.footholds), "two builds place the same feet");
  // Wrong inputs are refused, with the fix named.
  assert.throws(() => creaturePath(gecko(), route(0.07, 0.2), { scene: s, speed: 0.05, gait: "tripod" }), R("path.legs", /L1/), "a tripod needs six legs");
  assert.throws(() => creaturePath(gecko(), { getLength: () => 1 }, { scene: s, speed: 0.05, gait: "sprawl" }), R("path.curve", /curve/), "a curve needs getPointAt");
  assert.throws(() => rig(null, { legs: [{ ...leg("LF", 0.02, -0.008), segments: [0.013] }], spine: { length: 0.07 } }), R("rig.leg.segments", /segments/), "one segment");
  assert.throws(() => rig(null, { legs: [], spine: { length: 0.07 } }), R("rig.legs", /legs/), "no legs");
  for (const name of ["", undefined, 3]) assert.throws(() => rig(null, { legs: [{ ...leg("LF", 0.02, -0.008), name }], spine: { length: 0.07 } }), R("rig.leg.name", /every leg has a name/), "a leg named " + JSON.stringify(name));
  assert.equal(rig(null, { legs: [leg("LF", 0.02, -0.008)], spine: { length: 0.07 } }).legs[0].name, "LF", "a named leg is taken");
  assert.throws(() => rig(null, { legs: [leg("LF", 0.02, -0.008), leg("LF", 0.02, 0.008)], spine: { length: 0.07 } }), R("rig.leg.twice", /LF/), "a duplicate leg");
  assert.throws(() => rig(null, { legs: [{ ...leg("LF", 0.02, -0.008), foot: [0.02, -0.2] }], spine: { length: 0.07 } }), R("rig.leg.reach", /reach/), "a rest foot out of reach");
  const off = new THREE.CurvePath(); off.add(line([0.02, 0], [1.0, 0]));
  assert.throws(() => creaturePath(gecko(), off, { scene: s, speed: 0.05, gait: "sprawl" }), R("path.body.surface", /no surface within the legs' reach of the curve/), "a path that leaves the set");
  // A foot that finds no surface where the body does: a curve along the top of a 4 mm rail, the body frame on the rail at every sample,
  // the feet out past its sides. The same curve along a plank the feet reach walks.
  {
    const rail = (w) => {
      const r = new THREE.Scene(), m = new THREE.Mesh(new THREE.BoxGeometry(0.3 / M, 0.01 / M, w / M), new THREE.MeshStandardMaterial());
      m.position.set(0, -0.005 / M, 0); m.name = "rail"; r.add(m); r.updateMatrixWorld(true); return r;
    };
    const along = new THREE.CurvePath(); along.add(line([-0.1, 0], [0.1, 0]));
    assert.throws(() => creaturePath(gecko(), along, { scene: rail(0.004), speed: 0.05, gait: "sprawl" }), R("path.foot.surface", /leg [LR][FH] finds no surface/), "feet past the sides of a narrow rail");
    assert.ok(creaturePath(gecko(), along, { scene: rail(0.08), speed: 0.05, gait: "sprawl" }).duration > 1, "the same curve along a plank the feet reach");
  }

  // A leg that cannot reach its foothold during the walk is refused, not stretched. A corner wider than the legs reach lifts the body off
  // both surfaces (examples/lizard.js wallClimb); the same legs on a narrow corner (above) reach at every sample.
  assert.throws(() => creaturePath(gecko(), route(0.15, 0.28), { scene: s, speed: 0.05, gait: "sprawl" }), R("path.reach", /cannot reach its foothold/), "a corner wider than the legs reach");
  assert.throws(() => creaturePath(gecko(), route(0.07, 0.25), { scene: s, speed: 0.4, gait: "sprawl" }), R("path.reach", /cannot reach its foothold/), "a stride longer than the legs reach");
  assert.throws(() => wallClimb({ scene: s }, makeLizard(), { scene: s, wall: { x: 0.3 / M }, from: V(0.02, 0), height: 0.25 / M, radius: 0.14 }), R("path.reach", /cannot reach its foothold/), "wallClimb with a corner wider than the legs reach");
  assert.ok(creaturePath(gecko(), route(0.07, 0.25), { scene: s, speed: 0.2, gait: "sprawl" }).duration > 2, "half that speed still reaches");
  // The path's own refusals, each with its legitimate case on the other side.
  {
    const ch = new THREE.Scene(), box = (y, name) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6 / M, 0.02 / M, 0.3 / M), new THREE.MeshStandardMaterial()); m.position.set(0, y / M, 0); m.name = name; ch.add(m); };
    box(-0.01, "floor"); box(0.03, "ceiling"); ch.updateMatrixWorld(true); // a 20 mm channel, floor at y 0, ceiling at 20 mm
    const pl = (...pts) => { const c = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) c.add(line(pts[i - 1], pts[i])); return c; };
    // Normals that cancel: a curve near the floor, then near the ceiling, under a body longer than the whole run (the smoothing window
    // sums as many floor normals as ceiling normals). A straight run along the floor under the same body is fine.
    const long = () => gecko({ spine: { length: 0.3, sway: 12 } });
    assert.throws(() => creaturePath(long(), pl([-0.04, 0.004], [0, 0.004], [0, 0.016], [0.04, 0.016]), { scene: ch, speed: 0.05, gait: "sprawl" }), R("path.normals", /normals cancel/), "floor then ceiling under a long body");
    assert.ok(creaturePath(long(), pl([-0.04, 0.004], [0.04, 0.004]), { scene: ch, speed: 0.05, gait: "sprawl" }).duration > 1, "the same long body along the floor alone");
    // A curve that runs straight into the surface has no direction along it. Along the surface it has.
    assert.throws(() => creaturePath(gecko(), pl([0, 0.03], [0, 0.0005]), { scene: s, speed: 0.05, gait: "sprawl" }), R("path.dive", /straight into the surface/), "a curve that dives into the floor");
    assert.ok(creaturePath(gecko(), pl([0, 0.0005], [0.1, 0.0005]), { scene: s, speed: 0.05, gait: "sprawl" }).duration > 1, "a curve along the floor");
    // More than 5000 strides is refused; the same curve at a walking speed is not.
    const lo = pl([0.02, 0], [0.2, 0]);
    assert.throws(() => creaturePath(gecko(), lo, { scene: s, speed: 1e-6, gait: "sprawl" }), R("path.strides", /5000 strides/), "a walk of more than 5000 strides");
    assert.ok(creaturePath(gecko(), lo, { scene: s, speed: 0.05, gait: "sprawl" }).duration > 1, "the same curve at a walking speed");
  }
  // wallClimb lays only a route that fits the lizard; each refusal names its fix, and the route it accepts walks.
  {
    const L = makeLizard(), W = { x: 0.3 / M }, ok = { scene: s, wall: W, from: V(0.02, 0), height: 0.2 / M };
    assert.throws(() => wallClimb({ scene: null }, L, { ...ok, scene: undefined }), R("wallClimb.scene", /scene/), "no scene");
    assert.throws(() => wallClimb({ scene: s }, L, { ...ok, wall: undefined }), R("wallClimb.wall", /wall is \{ x \}/), "no wall");
    assert.throws(() => wallClimb({ scene: s }, L, { ...ok, wall: { x: NaN } }), R("wallClimb.wall", /wall is \{ x \}/), "a wall at NaN");
    assert.throws(() => wallClimb({ scene: s }, L, { ...ok, from: [0.02, 0, 0] }), R("wallClimb.from", /from is a THREE.Vector3/), "from is not a vector");
    assert.throws(() => wallClimb({ scene: s }, L, { ...ok, from: V(0.25, 0) }), R("wallClimb.run", /short of the corner/), "a floor run shorter than the corner");
    assert.throws(() => wallClimb({ scene: s }, L, { ...ok, height: 0.05 / M }), R("wallClimb.height", /height/), "a climb shorter than the corner");
    assert.ok(wallClimb({ scene: s }, L, ok).duration > 5, "the same call with a run and a climb that fit");
  }
  // Inputs: a bad one is refused with the quantity named; the good one beside it is taken.
  {
    const sound = leg("LF", 0.02, -0.008), mk = (over, spine = { length: 0.07 }) => () => rig(null, { legs: [{ ...sound, ...over }], spine });
    for (const [what, bad, re] of [["hip", { hip: [0.02, 0, -0.008] }, /hip/], ["hip", { hip: [0.02, NaN, -0.008] }, /hip/], ["foot", { foot: [0.02] }, /foot/], ["bend", { bend: "sideways" }, /bend/],
      ["ankle", { ankle: 2 }, /ankle/], ["radius", { radius: [0.001] }, /radius/], ["radius", { radius: -1 }, /radius/], ["segments", { segments: [0.013, 0] }, /segments/]]) assert.throws(mk(bad), R("rig.leg." + what, re), "a bad " + what);
    assert.throws(mk({}, { length: 0 }), R("rig.length", /spine\.length/), "a body of no length");
    assert.throws(mk({}, { length: 0.07, sway: NaN }), R("rig.sway", /sway/), "a sway of NaN");
    assert.throws(() => rig(null, { legs: [sound], spine: { length: 0.07 }, breath: { rate: 0 } }), R("rig.breath", /breath/), "no breath rate");
    assert.throws(() => rig(null, { legs: [sound], spine: { length: 0.07 }, breath: { rate: 1, depth: 0.5 } }), R("rig.breath", /breath/), "a breath too deep");
    assert.ok(mk({ bend: "forward", ankle: 0.5, radius: [0.002, 0.001] })().legs.length === 1, "the good ones beside them");
    for (const bad of [0, -3, NaN, Infinity, "4", undefined]) assert.throws(() => restingBreath(bad), R("breath.mass", /restingBreath/), "a body mass of " + bad);
    const cv = new THREE.CurvePath(); cv.add(line([0.02, 0], [0.2, 0]));
    const w = creaturePath(gecko(), cv, { scene: s, speed: 0.05, gait: "sprawl" }), tgt = new THREE.Vector3(0.1 / M, 0, 0.1 / M);
    for (const [what, args, id] of [["a target of NaN", [[NaN, 0, 0], 1], "target"], ["no target", [undefined, 1], "target"], ["a string for a target", ["there", 1], "target"], ["a time of NaN", [tgt, NaN], "t0"], ["no time", [tgt, undefined], "t0"],
      ["a turn of no time", [tgt, 1, { dur: 0 }], "dur"], ["a turn of NaN", [tgt, 1, { dur: NaN }], "dur"]]) assert.throws(() => w.look(...args), R("look." + id, /look\(\)/), what);
    assert.equal(w.look(tgt, 1, { dur: 0.3 }), w, "a good call is taken and chains");
    assert.throws(() => creaturePath(gecko(), cv, { speed: 0.05, gait: "sprawl" }), R("path.scene", /scene/), "no scene");
    assert.throws(() => creaturePath(gecko(), cv, { scene: s, start: NaN, speed: 0.05, gait: "sprawl" }), R("path.start", /start/), "a start of NaN");
    assert.throws(() => creaturePath({}, cv, { scene: s, speed: 0.05, gait: "sprawl" }), R("path.rig", /rig\(\)/), "not a rig");
    assert.throws(() => creaturePath(gecko(), new THREE.CurvePath(), { scene: s, speed: 0.05, gait: "sprawl" }), R("path.length", /no length/), "a curve of no length");
  }
  // Every refusal of the module and the example has its case above, on its own site.
  const src = (f) => readFileSync(join(fileURLToPath(dir), f), "utf8");
  assert.deepEqual(audit({ "creature.js": src("creature.js"), "examples/lizard.js": src("examples/lizard.js") }, hits), [], "every creature refusal has a case");
  assert.ok(hits.size >= 40, `the audit read the refusals: ${hits.size} ids`);
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
// The studio rig: on a room-scale set, where one shadow frustum over the whole set is coarser than 1 mm, the key's
// frustum is refitted to what each pose sees; the AO radius comes from the scale and the view, never typed.
{
  const part = (w, h, d, name, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), new THREE.MeshStandardMaterial()); o.name = name; o.position.set(x / M, y / M, z / M); return o; };
  const root = new THREE.Scene(), world = new THREE.Group(), A = new THREE.Group();
  const floor = part(6, 0.02, 4, "floor", 0, -0.01, 0), cabinet = part(1, 1, 0.5, "cabinet", -2, 0.5, -1);
  const shell = part(0.12, 0.12, 0.12, "shell", 1.5, 0.06, 0.5), core = part(0.03, 0.03, 0.03, "core", 1.5, 0.06, 0.5);
  A.add(shell, core); world.add(floor, cabinet, A); root.add(world); root.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(30, 9 / 16, 0.001, 200);
  const o = oner({ world, subject: A, inside: core, keep: [floor], end: 12, aspect: 9 / 16, studio: { renderer: null, scene: root, camera, height: 1920 } });
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
  // Toon: no AO, its own map; unknown names refused; a dry rig does not render.
  const toon = studio(null, new THREE.Scene(), camera, { look: "toon", set: world });
  assert.equal(toon.state(at.dive.p).ao, null, "toon has no AO");
  assert.equal(toon.key.shadow.mapSize.x, LOOKS.toon.shadow.map, "toon's shadow map");
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
const msim = await makeSim(THREE);
msim.staticScene(moon, [hover, sunk]);
const gap = msim.audit([hover])[0];
assert.ok(gap && Math.abs(gap.gap_mm - 5) < 0.5, "audit in real mm at any scale: " + JSON.stringify(gap));
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
  // direction or reveal; a tile fill counts and sums what it covers; twin sets sit `gap` apart. At any scale (K.M).
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

  const tw = twinSets({ scene: new THREE.Scene() }, (g, v) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4 / Mq, 0.3 / Mq, 0.3 / Mq), new THREE.MeshStandardMaterial());
    box.position.y = 0.15 / Mq;
    const a = flowArrow({ from: V(-0.15 / Mq, 0.5 / Mq, 0), to: V(0.15 / Mq, 0.5 / Mq, 0), value: v, scale: 0.01 });
    g.userData.arrow = a; g.add(box, a.group);
  }, { values: [1, 3], gap: 0.3 });
  tw.a.updateMatrixWorld(true); tw.b.updateMatrixWorld(true);
  const ba = new THREE.Box3().setFromObject(tw.a), bb = new THREE.Box3().setFromObject(tw.b);
  assert.ok(Math.abs((bb.min.x - ba.max.x) * Mq - 0.3) < 1e-9 && Math.abs(ba.min.x + bb.max.x) < 1e-9, "twin sets 0.3 m apart, centred");
  assert.ok(Math.abs(tail(tw.b.userData.arrow) / tail(tw.a.userData.arrow) - 3) < 1e-9, "the twins differ only in the value, arrows in ratio");
  assert.throws(() => twinSets({ scene: new THREE.Scene() }, () => {}, { values: [1] }), /values/);
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
{ // Failure states, instrument widgets and the supply chain (circuit.js, instruments.js, examples/supply.js): a part fails
  // at the model's event time and only then (the original is hidden, never rewritten); a widget draws the number its
  // model signal gives, with units and a label, and prints "--" for a value it cannot read, never 0; the chain is one
  // film's parts, every value from state(t).
  const Mq = K.M, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, box = (o) => new THREE.Box3().setFromObject(o);
  const part = (geo, color = 0x8899aa) => { const g = new THREE.Group(), m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.8 })); g.add(m); return { g, m }; };
  const geos = {
    bulge: () => new THREE.CylinderGeometry(0.01, 0.01, 0.03, 24, 4), blown: () => new THREE.BoxGeometry(0.03, 0.001, 0.001, 8, 1, 1),
    char: () => new THREE.BoxGeometry(0.01, 0.003, 0.003), melt: () => new THREE.BoxGeometry(0.02, 0.01, 0.02, 4, 6, 4),
  };
  for (const kind of Object.keys(geos)) {
    const { g, m } = part(geos[kind]()), hex = m.material.color.getHex(), f = failure(m, { kind, at: 5 });
    f.at(4.9);
    assert.ok(m.visible && !f.failed.visible, kind + ": the part shows before the event");
    f.at(5);
    assert.ok(!m.visible && f.failed.visible, kind + ": the failed variant shows from the event");
    f.at(4.9);
    assert.ok(m.visible && !f.failed.visible, kind + ": pure of t, a seek back shows the part again");
    assert.ok(f.failed.parent === g && f.normal === m, kind + ": the variant sits beside the part");
    assert.ok(m.material.color.getHex() === hex && m.material.roughness === 0.3 && m.material.metalness === 0.8, kind + ": the part's own material is never written");
    assert.ok(f.failed !== m && (f.failed.material ? f.failed.material !== m.material : true), kind + ": the variant has its own material");
    assert.throws(() => failure(m, { kind, at: NaN }), /failure/, "the event time must be a number");
    assert.throws(() => failure(m, { kind }), /failure/);
  }
  assert.throws(() => failure(part(geos.char()).m, { kind: "rust", at: 1 }), /failure/, "an unknown kind is refused");
  assert.throws(() => failure(new THREE.Group(), { kind: "char", at: 1 }), /failure/, "a part is a Mesh");
  { const { m } = part(geos.char()), c = failure(m, { kind: "char", at: 1 }).failed.material;
    assert.ok(lum(c.color) < lum(m.material.color) * 0.5 && c.roughness === 1 && c.metalness === 0, "a charred part is darker, dull and not metallic"); }
  { const { m } = part(geos.bulge()), f = failure(m, { kind: "bulge", at: 1 });
    assert.ok(box(f.failed).max.y > box(m).max.y + 0.0005 && box(f.failed).min.y === box(m).min.y, "a bulged capacitor domes at the top only");
    const v = failure(part(geos.bulge()).m, { kind: "bulge", at: 1, vent: true }).failed;
    assert.ok(v.children.length === 2 && f.failed.children.length === 0, "a vented top has a dark cross"); }
  { const { m } = part(geos.blown()), f = failure(m, { kind: "blown", at: 1, amount: 1 }), p = f.failed.userData.pieces;
    const a = box(p[0]), b = box(p[1]), L = 0.03;
    assert.ok(p.length === 2 && a.max.x < b.min.x - 1e-9, "a blown fuse wire is two pieces with a gap");
    assert.ok(Math.abs(b.min.x - a.max.x - 0.3 * L) < 1e-9 && Math.abs(a.min.x + L / 2) < 1e-9 && Math.abs(b.max.x - L / 2) < 1e-9, "the gap is 30 % of the length and the ends stay: " + (b.min.x - a.max.x));
    const s = f.failed.userData.soot;
    assert.ok(s && s.material.opacity === 0.6 && s.material.color.getHex() === 0x1b1a18 && Math.abs(s.position.x) < 1e-9, "a soot mark at the gap");
    const half = failure(part(geos.blown()).m, { kind: "blown", at: 1, amount: 0.5 }).failed.userData.pieces.map(box);
    assert.ok(Math.abs(half[1].min.x - half[0].max.x - 0.15 * L) < 1e-9, "a smaller amount is a smaller gap"); }
  { const { m } = part(geos.melt()), f = failure(m, { kind: "melt", at: 1 });
    assert.ok(box(f.failed).max.y < box(m).max.y - 0.001 && box(f.failed).min.y > box(m).min.y - 1e-9, "a melted connector sags at the top");
    assert.ok(lum(f.failed.material.color) < lum(m.material.color), "and darkens");
    assert.ok(Array.from(f.failed.geometry.attributes.position.array).every(Number.isFinite) && Array.from(f.failed.geometry.attributes.normal.array).every(Number.isFinite), "no NaN in the melted shape"); }
  { const m = new THREE.Mesh(geos.char(), new THREE.MeshStandardMaterial()), f = failure(m, { kind: "char", at: 1 });
    assert.ok(f.failed.parent === null, "a part with no parent: the caller adds the variant"); }

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

  // The supply chain: plug, cord, fuse, rectifier, dc trace, motor and lamp, every value from the model's state(t).
  { const FUSE = 3, st = (t) => ({ Vac: 230, Iac: t < FUSE ? 0.8 : 0, Vdc: 12, Idc: t < FUSE ? 2 : 0, rpm: Math.min(3000, 1500 * t), V: t < FUSE ? 230 : 0 });
    const O = { state: st, events: { fuseBlown: FUSE }, arc: { dur: 0.005, energy: 50, efficacy: 20 }, lamp: { lm: 800 }, timeScale: 0.1, speed: 0.5 };
    const c = supplyChain(null, O);
    assert.ok(c.group.isGroup && c.flows.ac.length >= 1 && c.flows.ac.every((f) => f.waveform === "ac") && c.flows.dc.waveform === "dc", "ac upstream, dc downstream");
    assert.ok(c.flows.ac[0].shownFreq === 5 && /50 Hz/.test(c.labels.ac) && /visuali[sz]ation/.test(c.labels.ac), "the mains frequency is slowed and said: " + c.labels.ac);
    const r1 = c.at(1);
    assert.ok(r1.Vdc === 12 && r1.rpm === 1500 && c.fuse.normal.visible && !c.fuse.failed.visible, "before the event: the fuse is whole and at(t) gives the model's numbers");
    assert.ok(c.arc.light.intensity === 0 && c.arc.channel.visible === false, "no arc before the blow");
    c.at(FUSE + 0.02);
    assert.ok(!c.fuse.normal.visible && c.fuse.failed.visible, "the fuse is blown from the event");
    assert.ok(c.arc.light.intensity > 0 && c.arc.channel.visible, "the arc lights the board at the event");
    c.at(FUSE + 0.2);
    assert.ok(c.arc.light.intensity === 0, "and only for its frames");
    assert.ok(!c.flows.ac[0].ribbons[0].mesh.visible && !c.flows.dc.ribbons[0].mesh.visible, "no current, no flow drawn");
    c.at(0.5); const lit = c.lamp.light.intensity;
    c.at(FUSE + 1);
    assert.ok(lit > 0 && c.lamp.light.intensity === 0, "the lamp follows state(t).V");
    // the shaft: its angle is the integral of the speed, the same for any order of frames
    const ang = (cc, t) => { cc.at(t); return cc.shaft.rotation.x; };
    const c2 = supplyChain(null, { ...O, events: {}, arc: undefined, state: () => ({ ...st(0), rpm: 600 }) });
    assert.ok(Math.abs(ang(c2, 2) - 600 / 60 * 2 * Math.PI * 0.1 * 2) < 1e-6, "angle = integral of rpm x time scale: " + ang(c2, 2));
    const fwd = [0.5, 1, 1.5].map((t) => ang(c, t)), back = [1.5, 1, 0.5].map((t) => ang(supplyChain(null, O), t)).reverse();
    assert.ok(fwd.every((v, i) => Math.abs(v - back[i]) < 1e-9), "pure of t: seeking gives the same shaft angle");
    assert.throws(() => supplyChain(null, { ...O, state: () => ({ ...st(0), rpm: 6000 }) }).at(1), /alias/, "a shaft turning too fast for the frame rate is refused");
    assert.throws(() => supplyChain(null, { ...O, state: () => ({ ...st(0), Vdc: NaN }) }).at(1), /Vdc/, "a bad model value is named");
    assert.throws(() => supplyChain(null, { ...O, state: undefined }), /state/);
    assert.throws(() => supplyChain(null, { ...O, arc: undefined }), /arc/, "an arc needs its energy and efficacy from the model");
    assert.throws(() => supplyChain(null, { ...O, lamp: undefined }), /lamp/);
    const na = supplyChain(null, { ...O, events: {}, arc: undefined }); na.at(10);
    assert.ok(na.arc === null && na.fuse.normal.visible, "no event, no arc and a whole fuse");
    const aud = scaleAudit(c.group);
    assert.ok(aud.ok && aud.off.length === 0 && aud.checked >= 8, "every part is its real size at this scale: " + aud.problems.join("; ") + " checked " + aud.checked);
    const big = supplyChain(null, { ...O, at: V(1 / Mq, 0, 0) });
    assert.ok(Math.abs(big.group.position.x * Mq - 1) < 1e-9, "placed at `at`"); }
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

  { // Refusals and the demo.
    assert.throws(() => FLD.field([]), /field/);
    assert.throws(() => FLD.field([FLD.charge(1e-9, V(0, 0, 0)), FLD.straightWire(1, V(0, 0, 0), V(1, 0, 0))]), /kind/, "E and B sources are not mixed");
    assert.throws(() => FLD.barMagnet({ at: V(0, 0, 0), axis: V(1, 0, 0), length: 0.02, width: 0.01, depth: 0.005 }), /Br/, "Br comes from the film's model");
    assert.throws(() => FLD.fieldLines(FLD.field([FLD.charge(1e-9, V(0, 0, 0))]), { count: 4, mode: "x" }), /mode/);
    assert.throws(() => FLD.charge(NaN, V(0, 0, 0)), /q/);
    assert.throws(() => FLD.loop(1, { at: V(0, 0, 0), normal: V(0, 0, 1), R: -1 }), /R/);
    assert.throws(() => makeMagnetDemo(kit, {}), /Br/);

    const demo = makeMagnetDemo(kit, { Br: 1.3, filings: { count: 300, w: 0.12, d: 0.1 }, compass: [m(0.08, 0, 0.03)], lines: { count: 8 }, motion: (t) => m(0.01 * t, 0, 0) });
    const aud = scaleAudit(demo.group);
    assert.ok(aud.ok && aud.off.length === 0 && aud.checked >= 3, "the magnet is its real size: " + aud.problems.join("; ") + " checked " + aud.checked);
    const x0 = demo.magnet.mesh.position.x;
    const d0 = demo.filings.dirs.map((d) => d.clone());
    demo.at(2);
    assert.ok(Math.abs((demo.magnet.mesh.position.x - x0) * Mq - 0.02) < 1e-9, "the magnet slid 2 cm by the film's motion");
    assert.ok(demo.filings.dirs.some((d, i) => d.angleTo(d0[i]) > 0.05 && Math.PI - d.angleTo(d0[i]) > 0.05), "the filings re-aligned to the moved magnet");
    assert.ok(demo.compasses.length === 1 && Number.isFinite(demo.compasses[0].at(2).angle));
  }
}
{ // Optics (optics.js): rays are traced by Snell's law and the Fresnel split through the set's surfaces, with the index of a
  // cited material; a lens's focus is traced and compared with the lensmaker's formula, a prism spreads colours, a mesh from the
  // set refracts by its own normals, and the straw example draws the apparent bend from the same law.
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

  { // The straw: a glass of water bends a straw by the same law; the example draws the apparent position for the camera.
    const eye = m(0.01, 0.4, 0.0), camera = new THREE.PerspectiveCamera(); camera.position.copy(eye); camera.updateMatrixWorld(true);
    const demo = makeStrawGlass(kit, { at: m(0, 0, 0), eye, rays: true });
    const aud = scaleAudit(demo.group);
    assert.ok(aud.ok && aud.checked >= 2, "glass and straw are their real size: " + aud.problems.join("; ") + " checked " + aud.checked);
    demo.at(0, camera);
    const want = O.apparent(demo.real.foot, eye, demo.surface).image;
    assert.ok(demo.drawn.tip.distanceTo(want) < 1e-6, "the submerged tip is drawn at its apparent position");
    assert.ok(demo.drawn.tip.y > demo.real.foot.y + 1e-5 / Mq, "which is shallower than the real one");
    assert.ok(demo.drawn.end.distanceTo(demo.real.end) < 1e-12, "the end above the water is unchanged");
    assert.ok(demo.rays && demo.rays.group.children.length > 0, "teaching rays are drawn from straw points to the eye");
    assert.throws(() => makeStrawGlass(kit, { at: m(0, 0, 0), eye: m(0, 0.05, 0) }), /below the rim/, "an eye below the glass's rim is refused");
    assert.throws(() => makeStrawGlass(kit, { at: m(0, 0, 0), eye: m(0.5, 0.12, 0) }), /side wall/, "an eye above the rim but so far off that the sight line crosses the side wall is refused");
    // The sample on the water line may round a hair above the surface: every fill, glass and eye the docs allow draws.
    for (const fill of [0.1, 0.3, 0.5, 0.59, 0.6, 0.7, 0.8, 0.9]) for (const gl of [{}, { h: 0.12, r: 0.04 }, { h: 0.09, r: 0.03 }]) {
      assert.doesNotThrow(() => makeStrawGlass(kit, { at: m(0, 0, 0), eye: m(0.01, 0.4, 0), fill, glass: gl }), "fill " + fill + " glass " + JSON.stringify(gl));
    }
  }
}
// Look J (engineering cutaway): the torch example at real size, the look's lens set and framing (subject low), and the
// drafting-style text on the frame: a dimension line, pill labels and a text band, all inside the safe area.
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

  // The lens set: a 36 mm gauge on the long side.
  assert.ok(Math.abs(lensFov(70, 9 / 16) - 28.84) < 0.01 && Math.abs(lensFov(100, 9 / 16) - 20.41) < 0.01 && Math.abs(lensFov(135, 9 / 16) - 15.19) < 0.01, "70, 100 and 135 mm on a 36 mm gauge, portrait");
  assert.ok(Math.abs(lensFov(100, 16 / 9) - 2 * Math.atan(36 / (16 / 9) / 200) * 180 / Math.PI) < 1e-9, "landscape: the gauge is the width");
  for (const bad of [0, -50, NaN, Infinity]) assert.throws(() => lensFov(bad, 9 / 16), /mm/, "a focal length must be finite and > 0");
  assert.ok(LOOK.accents.label === "#ffd400" && LOOK.lens.macro === 135 && LOOK.ground === "#e8e9e6", "the look's defaults are data");

  // The torch: real sizes, a dc flow caused by the model, refused inputs, cut open.
  const O = { state: () => ({ I: 1.5 }), speed: 0.05, full: 2 };
  const tc = openTorch(null, O);
  const aud = scaleAudit(tc.group);
  assert.ok(aud.ok && aud.off.length === 0 && aud.checked >= 7, "every part is its real size: " + aud.problems.join("; ") + " checked " + aud.checked);
  assert.deepEqual(tc.at(1), { I: 1.5 }, "at(t) returns the model's state");
  assert.ok(tc.flows.length >= 1 && tc.flows.every((f) => f.waveform === "dc" && f.ribbons[0].mesh.visible), "current flows as dc");
  { const off = openTorch(null, { ...O, state: () => ({ I: 0 }) }); off.at(0); assert.ok(off.flows.every((f) => !f.ribbons[0].mesh.visible), "no current, no flow drawn"); }
  assert.throws(() => openTorch(null, { ...O, state: () => ({ I: NaN }) }).at(1), /I/, "a bad model value is named");
  assert.throws(() => openTorch(null, { ...O, state: undefined }), /state/);
  assert.throws(() => openTorch(null, { ...O, speed: 0 }), /speed/);
  assert.ok(tc.cut.parts.length >= 3 && tc.cut.plane, "the torch is cut open");

  // The three style frames: lens, elevation 20-60 degrees, macro DOF only, the subject low in frame.
  const fr = tc.frames({ W, H });
  assert.ok(fr.wide && fr.medium && fr.macro, "three stations");
  for (const [k, mm] of [["wide", 70], ["medium", 100], ["macro", 135]]) {
    const st = fr[k], el = Math.asin(st.position.clone().sub(st.target).normalize().y) * 180 / Math.PI;
    assert.ok(Math.abs(st.fov - lensFov(mm, W / H)) < 1e-9, k + " is a " + mm + " mm lens");
    assert.ok(el >= 20 && el <= 60, k + " elevation " + el.toFixed(1) + " is within 20-60 degrees");
  }
  assert.ok(fr.macro.dof.bokehScale === 6 && Math.abs(fr.macro.dof.worldFocusRange - 0.6 * fr.macro.radius) < 1e-9 && fr.wide.dof === null && fr.medium.dof === null, "DOF on the macro only: bokeh 6, focus range 0.6 x the framed radius");

  // Every text of the frame (band, labels, dimension, caption) is inside the safe area in all three style frames.
  const caption = [{ text: "the cell feeds the driver", start: 0, end: 5, words: ["the", "cell", "feeds", "the", "driver"].map((w, i) => ({ text: w, start: i * 0.3, end: i * 0.3 + 0.25, gap: true })) }];
  const zone = safeArea("shorts", W, H);
  for (const k of ["wide", "medium", "macro"]) {
    const st = fr[k], cam = new THREE.PerspectiveCamera(st.fov, W / H, 1e-4, 100);
    tc.place(cam, st, W, H);
    const centre = st.target.clone().project(cam); // what the station frames: a view offset of -4.5 % of the height is -0.09 in NDC
    assert.ok(centre.y < -0.05 && centre.y > -0.13, k + ": the subject sits low in frame (NDC y " + centre.y.toFixed(3) + ")");
    const ctx = mockCtx(bright);
    const band = textBand(ctx, { kicker: "How it works", headline: "The cell pushes 1.5 A through the driver", tag: "Illustration" }, { format: "shorts" });
    const [pa, pb] = { wide: [tc.parts.cell, tc.parts.driver], medium: [tc.parts.driver, tc.parts.star], macro: [tc.parts.led, tc.parts.reflector] }[k];
    const l1 = pinLabel(ctx, { at: pa, camera: cam, text: "cell" }, { pill: LOOK.accents.label, top: band.box.y1 });
    const l2 = pinLabel(ctx, { at: pb, camera: cam, text: "driver" }, { pill: LOOK.accents.label, top: band.box.y1 });
    const d = { wide: tc.dims.cell, medium: tc.dims.gap, macro: tc.dims.reflector }[k];
    const dm = dimension(ctx, d.a, d.b, { camera: cam, text: Math.round(d.m * 1000) + " mm", dir: up, top: band.box.y1 });
    drawCaption(ctx, 0.5, caption, { format: "shorts", pill: true, accent: LOOK.accents.label });
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

  // shots.js: the same three style frames from data. The camera and every drawn call match the hand-written frame above;
  // a shot list with a missing beat, an overshooting key, a label off the frame or a shot with no action is refused.
  { const BEATS = { hook: { start: 0.2, end: 1.4 }, inside: { start: 3.1, end: 4.0 }, detail: { start: 6.0, end: 7.1 } };
    const WORDS = Array.from({ length: 30 }, (_, i) => ({ start: i * 0.3, end: i * 0.3 + 0.25 }));
    assert.ok(cueTime("inside", { beats: BEATS }) === 3.1 && cueTime("inside.end", { beats: BEATS }) === 4.0 && cueTime("w3.end", { words: WORDS }) === 1.15, "cues: a beat's start or end, a word's start or end");
    assert.ok(cueTime("hook", { beats: [{ name: "hook", start: 0.2, end: 1.4 }] }) === 0.2, "beats.json's array works as well as BEATS");
    const T = { beats: BEATS, words: WORDS, end: 9.5, fps: 30, W, H, set: torchSet(tc, { W, H }), pill: LOOK.accents.label };
    const run = shots(TORCH_SHOTS, T);
    assert.deepEqual(run.shots.map((s) => [s.start, s.end]), [[0.2, 3.1], [3.1, 6], [6, 9.5]], "each shot runs from its beat to the next one's");
    const hand = { wide: [["cell", "cell"], ["driver", "driver"], "cell"], medium: [["driver", "driver"], ["star", "star board"], "gap"], macro: [["led", "LED"], ["reflector", "reflector"], "reflector"] };
    const near = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 1e-9);
    for (const [i, k] of ["wide", "medium", "macro"].entries()) {
      const s = run.shots[i], t = (s.start + s.end) / 2, st = fr[k];
      const a = new THREE.PerspectiveCamera(30, W / H, 1e-4, 100), b = new THREE.PerspectiveCamera(st.fov, W / H, 1e-4, 100);
      run.at(t, a); tc.place(b, st, W, H);
      assert.ok(near(a.matrixWorld.elements, b.matrixWorld.elements) && near(a.projectionMatrix.elements, b.projectionMatrix.elements), k + ": the runner's camera is the hand-placed station");
      const ca = mockCtx(bright); run.draw(ca, t, a); const ra = layoutFrame(ca, t, { send: () => {} });
      const cb = mockCtx(bright), band = textBand(cb, { kicker: "How it works", headline: "The cell drives the LED through the driver", tag: "Illustration" }, { format: "shorts" });
      for (const [part, text] of hand[k].slice(0, 2)) pinLabel(cb, { at: tc.parts[part], camera: b, text }, { format: "shorts", pill: LOOK.accents.label, top: band.box.y1 });
      const d = tc.dims[hand[k][2]];
      dimension(cb, d.a, d.b, { camera: b, text: Math.round(d.m * 1000) + " mm", dir: up, top: band.box.y1 });
      const rb = layoutFrame(cb, t, { send: () => {} });
      assert.ok(ra.boxes.length === 6, k + ": band (3), two labels and the dimension are drawn: " + ra.boxes.length);
      assert.deepEqual(ra.boxes, rb.boxes, k + ": the same boxes as the hand-written frame");
      assert.deepEqual(ca.log, cb.log, k + ": the same draw calls as the hand-written frame");
    }
    // travel: the camera leaves the previous pose on the shot's beat and arrives on the station at the end of its beat, never past it
    const moved = structuredClone(TORCH_SHOTS); moved[1].transition = "travel";
    const tr = shots(moved, T), wide = fr.wide, med = fr.medium, dist = (t) => tr.pose(t).position.distanceTo(med.position);
    assert.ok(tr.pose(3.0).position.equals(wide.position) && tr.pose(4.0).position.equals(med.position) && tr.pose(5).position.equals(med.position), "travel: wide until the beat, medium from its end");
    for (let t = 3.1, prev = Infinity; t <= 4.0; t += 1 / 30) { const x = dist(t); assert.ok(x <= prev + 1e-9, "travel: the camera only closes on the station (no overshoot) at " + t.toFixed(3)); prev = x; }
    const bad = (edit, rx, why) => { const l = structuredClone(TORCH_SHOTS); edit(l); assert.throws(() => shots(l, T), rx, why); };
    bad((l) => { l[1].beat = "nowhere"; }, /no beat "nowhere"/, "a shot on a beat that is not in beats.json");
    bad((l) => { l[0].camera.push({ station: "medium", at: "hook", ease: (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2 }); }, /overshoots/, "a key whose ease goes past its station");
    bad((l) => { l[2].labels.push({ part: "cell", text: "cell" }); }, /label "cell" on "cell" is off the frame/, "a label on a part the macro does not frame");
    bad((l) => { l[0].action = null; }, /no action/, "a 2.9 s shot where the subject does nothing");
    bad((l) => { l[0].action = "spin"; }, /not one of set.actions/, "an action the set does not have");
    bad((l) => { l[0].camera.push({ station: "medium", at: "w2" }); }, /arrive cue/, "a move that leaves on a word needs its arrival cue");
    bad((l) => { l[0].labels.push({ part: "cell", text: "cell", at: "w9" }); }, /read time/, "a label cued 0.4 s before its shot ends");
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

  // textBand: kicker in tracked monospace caps, a headline, a tag, on a scrim, inside the label zone.
  { const lab = safeArea("shorts", W, H).labels, c = mockCtx(bright);
    layoutFrame(mockCtx(bright), 0, { send: () => {} }); // empties the list of boxes drawn so far
    const b = textBand(c, { kicker: "How it works", headline: "Six words that state the claim", tag: "Sped up" }, { format: "shorts" });
    const k = c.log.find((l) => l.s === "HOW IT WORKS"), h = c.log.filter((l) => l.s && /claim|Six/.test(l.s)), tg = c.log.find((l) => l.s === "SPED UP");
    assert.ok(k && k.px === 36 && /monospace|Menlo/.test(k.font), "the kicker is upper-cased monospace at 36 px: " + JSON.stringify(k));
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
{ // markings and electronics (K.M is 0.01 here: 1 unit = 1 cm, so every size below is metres / K.M)
  const Mk = K.M, V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
  const grey = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const flat = () => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), grey); m.scale.set(0.02 / Mk, 0.004 / Mk, 0.06 / Mk); return m; }; // 20 x 4 x 60 mm under a non-uniform scale
  const topAt = V(0, 0.002 / Mk, 0);
  const worldBox = (o) => { o.updateWorldMatrix(true, false); return new THREE.Box3().setFromObject(o, true); };

  // 1. real size under a non-uniform parent scale: the print is never flattened with the mesh scale
  { const box = flat(), r = markings(box, [{ text: "16V", h: 0.002, at: topAt, normal: UP, style: "pad" }]), it = r.items[0];
    const size = worldBox(it.mesh).getSize(V(0, 0, 0)).multiplyScalar(Mk);
    assert.ok(Math.abs(size.x / it.w - 1) < 0.01 && Math.abs(size.z / it.hh - 1) < 0.01, "marking measures " + size.x.toFixed(5) + " x " + size.z.toFixed(5) + " m, declared " + it.w.toFixed(5) + " x " + it.hh.toFixed(5));
    assert.ok(it.w > 0.003 && it.w < 0.009 && it.hh > 0.003 && it.hh < 0.006, "3 characters 2 mm high are a few mm wide");
    assert.equal(it.mesh.parent, box, "the print is a child of the target: it moves with the part");
    // 2. lifted on its normal by the style's lift, the sticker's corner curled but never above 1.5 mm
    const pos = it.mesh.geometry.attributes.position, wv = V(0, 0, 0); let worst = 0;
    for (let i = 0; i < pos.count; i++) { wv.fromBufferAttribute(pos, i).applyMatrix4(it.mesh.matrixWorld); worst = Math.max(worst, Math.abs(wv.y * Mk - 0.002 - STYLES.pad.lift)); }
    assert.ok(worst < STYLES.pad.lift * 0.2, "every vertex sits one pad-print lift above the face (off by " + worst + " m)");
    const st = markings(box, [{ text: "HI", h: 0.002, at: topAt, normal: UP, style: "sticker" }]).items[0], sp = st.mesh.geometry.attributes.position;
    let hi = 0, lo = 1; for (let i = 0; i < sp.count; i++) { wv.fromBufferAttribute(sp, i).applyMatrix4(st.mesh.matrixWorld); const l = wv.y * Mk - 0.002; hi = Math.max(hi, l); lo = Math.min(lo, l); }
    assert.ok(Math.abs(lo - STYLES.sticker.lift) < 1e-5 && hi > STYLES.sticker.lift + 0.0003 && hi <= 0.0016, "a sticker is paper thick with one corner curled up to " + hi + " m, never above 1.5 mm");
    assert.deepEqual(Object.keys(STYLES).sort(), ["laser", "pad", "silkscreen", "sticker"], "four print styles");
    assert.ok(box.children.filter((c) => c.userData.marking).length === 2 && it.mesh.userData.marking.h === 0.002 && it.mesh.userData.marking.style === "pad" && it.mesh.userData.marking.wear === 0, "each print declares its height, style and wear for the detail check");
  }
  // 3. a curved surface: the print follows a cylinder; too wide or off the surface is refused
  { const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.005 / Mk, 0.005 / Mk, 0.02 / Mk, 48), grey);
    const it = markings(cyl, [{ text: "A", h: 0.002, at: V(0, 0, 0.005 / Mk), normal: V(0, 0, 1), style: "pad" }]).items[0], p = it.mesh.geometry.attributes.position, wv = V(0, 0, 0);
    let worst = 0; for (let i = 0; i < p.count; i++) { wv.fromBufferAttribute(p, i).applyMatrix4(it.mesh.matrixWorld); worst = Math.max(worst, Math.abs(Math.hypot(wv.x, wv.z) * Mk / (0.005 + STYLES.pad.lift) - 1)); }
    assert.ok(worst < 0.02, "the print wraps the cylinder within 2 % of its radius (off by " + worst + ")");
    assert.throws(() => markings(cyl, [{ text: "A", h: 0.002, w: 0.02, at: V(0, 0, 0.005 / Mk), normal: V(0, 0, 1), style: "pad" }]), /wrap|overhang/, "a print wider than the cylinder is refused");
    assert.throws(() => markings(cyl, [{ text: "A", h: 0.002, at: V(0, 5, 0.005 / Mk), normal: V(0, 0, 1), style: "pad" }]), /overhang/, "a print off the surface is refused");
    assert.throws(() => markings(flat(), [{ text: "A", h: 0.002, at: V(0.0095 / Mk, 0.002 / Mk, 0), normal: UP, style: "pad" }]), /wrap|overhang/, "a print over the edge of a face is refused");
  }
  // 4. refusals name the field
  { const box = flat(), ok = { text: "A", h: 0.002, at: topAt, normal: UP, style: "pad" };
    assert.throws(() => markings(box, [{ ...ok, h: 0 }]), /cap height/);
    assert.throws(() => markings(box, [{ ...ok, style: "neon" }]), /style/);
    assert.throws(() => markings(box, [ok], { wear: 1.5 }), /wear/);
    assert.throws(() => markings(box, [{ ...ok, wear: -0.1 }]), /wear/);
    assert.throws(() => markings(box, [{ ...ok, text: undefined }]), /text/);
    assert.throws(() => markings(box, [{ ...ok, normal: undefined }]), /normal/);
    assert.throws(() => markings(box, [{ ...ok, at: [0, 0, 0] }]), /at must be/);
    assert.throws(() => markings(box, []), /items/);
    assert.throws(() => markings({}, [ok]), /target/);
    assert.throws(() => markings(box, [{ ...ok, icon: "skull" }]), /icon/);
    const worn = markings(box, [{ ...ok, wear: 0.4 }]).items[0]; assert.equal(worn.mesh.userData.marking.wear, 0.4, "wear is kept on the print");
  }
  // 4b. every icon and wear draw through a canvas (a recording stand-in: the drawing code runs, nothing is shown)
  { const calls = [], ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); return k === "measureText" ? { width: 6 * String(a[0]).length } : undefined; }), set: (t, k, v) => { t[k] = v; return true; } });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
    try {
      const box = flat(), at = (x) => V(x / Mk, 0.002 / Mk, 0);
      markings(box, [{ icon: "W012", text: ["HIGH", "VOLTAGE"], h: 0.0015, at: at(0), normal: UP, style: "sticker", wear: 0.5 }, { icon: "earth", h: 0.002, at: at(-0.006), normal: UP, style: "pad" },
        { icon: "class2", h: 0.002, at: at(0.006), normal: UP, style: "laser" }, { text: ["ab"], h: 0.001, at: V(0, 0.002 / Mk, 0.02 / Mk), normal: UP, style: "silkscreen", wear: 1 }]);
      assert.ok(calls.includes("fillText") && calls.includes("fill") && calls.includes("stroke"), "text, shapes and strokes are drawn");
      assert.ok(calls.includes("arc"), "the wear specks are cut out of the ink");
    } finally { delete globalThis.document; }
  }
  // 5. legible at the macro station (the acceptance): a 2 mm print is at least READ_PX tall at 1080 px; far away it is not
  { const p = openPsu(null), c2 = p.parts.C2, m = c2.marks.find((x) => x.h === 0.002), cam = new THREE.PerspectiveCamera(15.19, 16 / 9, 1e-4 / Mk, 100 / Mk);
    assert.ok(m, "C2 carries a 2 mm rating print");
    placeCamera(cam, frame(c2.body, { fov: 15.19, aspect: 16 / 9, azimuth: 0, elevation: 20 }));
    const px = glyphPx(m, cam, 1080);
    assert.ok(px >= READ_PX && legible(m, cam, 1080), "a 2 mm print is " + px.toFixed(1) + " px tall at the macro station (floor " + READ_PX + " px)");
    const far = new THREE.PerspectiveCamera(30, 16 / 9, 1e-4 / Mk, 100 / Mk); far.position.copy(m.centre).add(V(0, 0, 2 / Mk)); far.lookAt(m.centre); far.updateProjectionMatrix(); far.updateMatrixWorld();
    assert.ok(glyphPx(m, far, 1080) < READ_PX && !legible(m, far, 1080), "the same print 2 m away is " + glyphPx(m, far, 1080).toFixed(1) + " px: not legible");
    const behind = new THREE.PerspectiveCamera(15.19, 16 / 9, 1e-4 / Mk, 100 / Mk); placeCamera(behind, frame(c2.body, { fov: 15.19, aspect: 16 / 9, azimuth: 180, elevation: 20 }));
    assert.equal(glyphPx(m, behind, 1080), 0, "a print facing away from the camera cannot be read");
  }
  // 5b. legibility follows the print and the frame: a print is read where its mesh is now, and only when it is in the frame
  { const mkCam = (fov = 15.19) => new THREE.PerspectiveCamera(fov, 16 / 9, 1e-4 / Mk, 100 / Mk), macro = (cam, part, az = 0) => placeCamera(cam, frame(part.body, { fov: 15.19, aspect: 16 / 9, azimuth: az, elevation: 20 })), mark2 = (p) => p.parts.C2.marks.find((x) => x.h === 0.002);
    // a board flipped to show its solder side, and lifted: the rating print now faces down
    { const p = openPsu(null), m = mark2(p), cam = mkCam(); macro(cam, p.parts.C2);
      assert.ok(glyphPx(m, cam, 1080) >= READ_PX, "before the flip the rating reads");
      p.group.rotation.x = Math.PI; p.group.position.y += 0.1 / Mk; p.group.updateMatrixWorld(true);
      assert.equal(glyphPx(m, cam, 1080), 0, "a print on a flipped board faces away: it is read where it is now, not where it was printed"); assert.ok(!legible(m, cam, 1080));
    }
    // the same board inside a housing that turns, the camera turning with it: the print reads as before
    { const p = openPsu(null), housing = new THREE.Group(); housing.add(p.group);
      const m = mark2(p), cam = mkCam(); macro(cam, p.parts.C2); const px0 = glyphPx(m, cam, 1080);
      housing.rotation.y = Math.PI / 2; housing.updateMatrixWorld(true);
      const q = housing.quaternion; cam.position.applyQuaternion(q); cam.quaternion.premultiply(q); cam.updateMatrixWorld(true);
      const px1 = glyphPx(m, cam, 1080);
      assert.ok(px0 >= READ_PX && Math.abs(px1 / px0 - 1) < 0.01, "a turned housing and a camera turned with it: " + px0.toFixed(1) + " px before, " + px1.toFixed(1) + " px after");
    }
    // a print moved into view reads (it was out of the frame when it was printed)
    { const q = openPsu(null), p = openPsu(null, { at: V(0.5 / Mk, 0, 0) }), m = mark2(p), cam = mkCam(); macro(cam, q.parts.C2);
      assert.equal(glyphPx(m, cam, 1080), 0, "a board half a metre to the side is out of the frame");
      p.group.position.x -= 0.5 / Mk; p.group.updateMatrixWorld(true);
      assert.ok(glyphPx(m, cam, 1080) >= READ_PX && legible(m, cam, 1080), "moved into the frame, its print reads (" + glyphPx(m, cam, 1080).toFixed(1) + " px)");
    }
    // a print outside the frame is not read: the macro station on the film capacitor C1 does not show C2's rating, 28 mm to the side
    { const p = openPsu(null), m = mark2(p), cam = mkCam(); macro(cam, p.parts.C1);
      assert.equal(glyphPx(m, cam, 1080), 0, "C2's print is outside the frame framed on C1"); assert.ok(!legible(m, cam, 1080));
      placeCamera(cam, frame(p.parts.C3.body, { fov: 15.19 })); assert.ok(!legible(m, cam, 1080), "nor does the default three-quarter station on C3");
      macro(cam, p.parts.C2); assert.ok(legible(m, cam, 1080), "framed on C2 it reads");
    }
    // a print half out of the frame is not readable, the whole of it in the frame is
    { const p = openPsu(null), m = mark2(p), cam = mkCam(); macro(cam, p.parts.C2);
      const dist = cam.position.distanceTo(m.centre) * Mk, aim = (at, halfW) => { cam.fov = (2 * Math.atan(halfW / (16 / 9) / dist) * 180) / Math.PI; cam.lookAt(at); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); };
      aim(m.centre.clone().addScaledVector(m.right, m.w / 2 / Mk), m.w / 4);
      assert.equal(glyphPx(m, cam, 1080), 0, "the edge of the print is in the frame, the rest of it is not");
      aim(m.centre, m.w);
      assert.ok(legible(m, cam, 1080), "the whole print inside the frame reads (" + glyphPx(m, cam, 1080).toFixed(1) + " px)");
    }
  }
  // 6. the catalogue: every part body is within 1 % of its declared size, upright and turned a quarter
  { let declared = 0;
    for (const [type, spec] of Object.entries(PARTS)) {
      assert.ok(spec.source && spec.sizes && Object.keys(spec.sizes).length, type + " names its source and sizes");
      for (const size of Object.keys(spec.sizes)) for (const rot of [0, 90]) {
        const b = board({ w: 0.12, d: 0.12 });
        b.place("X1", type, { size, rot, value: type === "resistor" ? 4700 : "1", heatsink: type === "ic.to220", poles: 3 });
        const a = scaleAudit(b.group, { tol: 0.01 });
        assert.ok(a.ok && a.off.length === 0 && a.bad.length === 0, type + " " + size + " rot " + rot + ": " + a.problems.join("; "));
        assert.ok(a.checked >= 3 * 2, type + " " + size + ": body and board both declare a size (" + a.checked + ")");
        if (rot === 0) declared++;
      }
    }
    assert.ok(declared >= 14, declared + " catalogue sizes were built and measured");
    const p = openPsu(null), a = scaleAudit(p.group, { tol: 0.01 });
    assert.ok(a.ok && a.checked >= 13 * 3, "the opened power supply: " + a.checked + " sizes checked, " + a.problems.join("; "));
  }
  // 7. resistor colour code (IEC 60062)
  { assert.deepEqual(bands(4700), ["yellow", "violet", "red", "gold"]);
    assert.deepEqual(bands(220), ["red", "red", "brown", "gold"]);
    assert.deepEqual(bands(1), ["brown", "black", "gold", "gold"]);
    assert.deepEqual(bands(0.47), ["yellow", "violet", "silver", "gold"]);
    assert.deepEqual(bands(1e6), ["brown", "black", "green", "gold"]);
    assert.deepEqual(bands(4750, { count: 5, tol: 1 }), ["yellow", "violet", "green", "brown", "brown"]);
    assert.throws(() => bands(4750), /significant/, "4750 ohm needs 3 digits: not on a 4-band");
    assert.throws(() => bands(-1), /ohms/);
    assert.throws(() => bands(100, { tol: 7 }), /tol/);
    const r1 = openPsu(null).parts.R1, want = bands(4700).map((n) => new THREE.Color(BAND_HEX[n]).getHex());
    assert.deepEqual(r1.rings.map((m) => m.material.color.getHex()), want, "R1's rings are its value's colours");
    assert.ok(r1.rings.every((m, i) => i === 0 || m.position.x > r1.rings[i - 1].position.x), "in order along +x");
  }
  // 8. placement by reference designator, pins and traces
  { const b = board({ w: 0.06, d: 0.04 });
    b.place("C2", "cap.electrolytic", { size: "10x16", at: [-10, 0], print: ["22µF", "400V"] });
    b.place("Q1", "ic.to220", { at: [15, 5] });
    assert.throws(() => b.place("C2", "resistor", { size: "0.25W", value: 100, at: [0, 10] }), /ref/, "a reference designator is used once");
    assert.throws(() => b.place("R9", "resistor", { size: "9W", value: 100 }), /catalogue/);
    assert.throws(() => b.place("R9", "flux.capacitor"), /catalogue/);
    assert.throws(() => b.place("R9", "resistor", { size: "0.25W", value: 100, at: [100, 0] }), /off the board/);
    assert.throws(() => b.place("R9", "resistor", { size: "0.25W", value: 100, rot: 45 }), /rot/);
    assert.throws(() => b.place("R9", "resistor", { size: "0.25W" }), /value/);
    assert.throws(() => b.place("R9", "cap.electrolytic", { at: [0, 10] }), /size/, "a size is named when the type has several");
    assert.throws(() => b.place("R9", "resistor", { size: "0.25W", value: 100, at: [-10, 0] }), /overlap/, "two parts cannot share a place");
    const p1 = b.pin("C2", 1), p2 = b.pin("C2", 2);
    assert.ok(Math.abs(p1.y * Mk - 0.0016) < 1e-9 && Math.abs(p2.y * Mk - 0.0016) < 1e-9, "pins lie on the board's top");
    assert.ok(Math.abs(p1.distanceTo(p2) * Mk / PARTS["cap.electrolytic"].sizes["10x16"].pitch - 1) < 0.01, "the two pins are one lead pitch apart");
    assert.throws(() => b.pin("C2", 3), /pin/); assert.throws(() => b.pin("Z9", 1), /pin/);
    const t = b.trace(["C2:1", "Q1:2"]), q = b.pin("Q1", 2);
    assert.ok(t.length > 0 && t.kind === "trace" && b.traces.includes(t), "a trace follows the layout");
    for (const [e, pn] of [[t.pointAt(0), p1], [t.pointAt(t.length), q]]) assert.ok(Math.hypot(e.x - pn.x, e.z - pn.z) * Mk < 1e-6, "its ends are the pins");
    assert.throws(() => b.trace(["C2:1", "Z9:1"]), /pin/);
    assert.ok(b.trace(["C2:2", [0, -15], [10, -15]]).length > 0, "free points are in mm from the board centre");
    assert.throws(() => board({ w: 0 }), /w|d/);
    const core = cable([V(0, 0.01 / Mk, 0), V(0.02 / Mk, 0.02 / Mk, 0)], { conductor: "N" });
    assert.equal(core.meshes[0].material.color.getHex(), new THREE.Color(CONDUCTOR.N).getHex(), "a neutral core is blue");
    assert.throws(() => cable([V(0, 0, 0), V(1, 0, 0)], { conductor: "X" }), /conductor/);
    assert.equal(cable([V(0, 0, 0), V(1, 0, 0)], { conductor: "X", color: 0x123456 }).meshes[0].material.color.getHex(), new THREE.Color(0x123456).getHex(), "a film in another region passes its own colour");
  }
  // 9. the opened power supply
  { const p = openPsu(null), refs = Object.keys(p.parts);
    assert.ok(refs.length === 13 && ["J1", "F1", "RV1", "C1", "U1", "Q1", "C2", "K1", "C3", "R1", "R2", "R3", "J2"].every((r) => refs.includes(r)), "thirteen parts by reference: " + refs.join(" "));
    const onBoard = p.board.mesh.children.filter((c) => c.userData.marking).map((c) => [].concat(c.userData.marking.text ?? []));
    for (const r of refs) assert.ok(onBoard.some((t) => t.includes(r)), r + " has its silkscreen reference");
    assert.ok(p.marks.some((m) => m.icon === "W012" && m.style === "sticker") && p.marks.every((m) => m.h > 0 && Number.isFinite(m.w) && m.mesh.userData.marking), "the warning sticker and every print are listed");
    assert.deepEqual(p.cables.map((c) => c.conductor).sort(), ["+", "-", "L", "N"], "mains in and dc out");
    assert.ok(p.cables.every((c) => c.meshes[0].material.color.getHex() === new THREE.Color(CONDUCTOR[c.conductor]).getHex()), "cores in their conductor colours");
    let lowest = Infinity; for (const c of p.cables) for (let s = 0; s <= c.length; s += c.length / 40) lowest = Math.min(lowest, c.pointAt(s).y * Mk);
    assert.ok(lowest > 0.0016, "a cable never goes through the board (lowest " + lowest + " m)");
    assert.equal(openPsu(null, { prints: { C2: ["47µF", "450V"] } }).parts.C2.marks.some((m) => [].concat(m.text).includes("450V")), true, "a film can print its own values");
    assert.ok(p.traces.length >= 3 && p.traces.every((t) => t.length > 0), "traces between pins");
  }
  // 10. polarity: the minus stripe of an electrolytic is on the side of its minus lead, and a trace never joins it to the other pole
  { const p = openPsu(null);
    for (const rot of [0, 90, 180]) {
      const b = board({ w: 0.04, d: 0.04 }); b.place("C9", "cap.electrolytic", { size: "10x16", rot, print: ["1µF", "50V"] });
      const stripe = b.parts.C9.marks.find((m) => [].concat(m.text).includes("−")), plus = b.pin("C9", 1), minus = b.pin("C9", 2);
      assert.deepEqual([b.polarity("C9", 1), b.polarity("C9", 2)], ["+", "-"], "pin 1 is the plus lead, pin 2 the minus lead");
      assert.ok(stripe.centre.distanceTo(minus) < stripe.centre.distanceTo(plus), "rot " + rot + ": the minus stripe is on the side of the minus lead");
    }
    assert.equal(p.board.polarity("R1", 1), null, "a resistor has no polarity");
    assert.deepEqual(polarityClashes(p.board, p.cables), [], "the example joins plus to plus and minus to minus: " + polarityClashes(p.board, p.cables).join("; "));
    const dc = p.cables.filter((c) => c.conductor === "+" || c.conductor === "-"); assert.ok(dc.length === 2 && dc.every((c) => /^J2:\d$/.test(c.pin)), "the dc cables say which pin they leave from");
    const c3 = p.traces.find((t) => t.pins.includes("C3:1")), j2 = c3.pins.find((x) => x.startsWith("J2:")), cab = dc.find((c) => c.pin === j2);
    assert.equal(cab.conductor, "+", "the output capacitor's plus lead runs to the dc plus cable");
    // the attack: the plus lead traced to the dc minus cable
    const bad = board({ w: 0.04, d: 0.04 }); bad.place("C9", "cap.electrolytic", { size: "10x16", at: [-8, 0] }); bad.place("J9", "terminal.5.08", { at: [10, 0], poles: 2 });
    bad.trace(["C9:1", [-10.5, 8], [7.46, 8], "J9:1"]); // round the other pads: a trace over a pad joins it (nets())
    assert.equal(polarityClashes(bad, [{ pin: "J9:1", conductor: "-" }]).length, 1, "plus traced to a minus cable is a clash");
    assert.deepEqual(polarityClashes(bad, [{ pin: "J9:1", conductor: "+" }]), [], "plus traced to a plus cable is not");
    assert.deepEqual(polarityClashes(bad, [{ pin: "J9:1", conductor: "L" }]), [], "a mains core has no polarity to clash with");
    bad.trace(["C9:2", [-5.5, -8], [12.54, -8], "J9:2"]); assert.equal(polarityClashes(bad, [{ pin: "J9:1", conductor: "+" }, { pin: "J9:2", conductor: "+" }]).length, 1, "minus traced to a plus cable is a clash");
    // a net is the copper that touches, across traces, and a pin no trace reaches is a net too: each attack, and its
    // legitimate twin on the other side of the same rule
    const mk = () => { const g = board({ w: 0.04, d: 0.04 }); g.place("C9", "cap.electrolytic", { size: "10x16", at: [-8, 0] }); g.place("R9", "resistor", { value: 1000, size: "0.25W", at: [0, 12] }); g.place("J9", "terminal.5.08", { at: [10, 0], poles: 2 }); return g; };
    const minus = [{ pin: "J9:2", conductor: "-" }], plus = [{ pin: "J9:2", conductor: "+" }];
    const both = (build, clash, why) => { const g = mk(); build(g); assert.equal(polarityClashes(g, minus).length, clash ? 1 : 0, why + (clash ? ": plus to the minus cable is a clash" : ": not joined, no clash")); assert.deepEqual(polarityClashes(g, plus), [], why + ": plus to the plus cable is not"); };
    both((g) => { g.trace(["C9:1", "R9:1"]); g.trace(["R9:1", "J9:2"]); }, true, "two traces through a shared pin are one net");
    both((g) => { g.trace(["C9:1", [0, -10]]); g.trace([[0, -10], "J9:2"]); }, true, "two traces meeting at a free point are one net");
    both((g) => { g.trace(["C9:1", [0, -10]]); g.trace([[0, -14], "J9:2"]); }, false, "traces that never touch");
    both((g) => { g.trace(["C9:1", [-10.5, -10], [5, -10]]); g.trace(["J9:2", [12.5, -6], [0, -6], [0, -14]]); }, true, "two traces that cross are one net");
    both((g) => { g.trace(["C9:1", [-10.5, -10], [5, -10]]); g.trace(["J9:2", [12.5, -6], [0, -6], [0, -8]]); }, false, "a trace that stops short of another");
    both((g) => { g.trace(["J9:2", [12.5, 8], [-10.5, 8], [-10.5, -8]]); }, true, "a trace run over a pad it does not name joins it");
    both((g) => { g.trace(["J9:2", [12.5, 8], [-14.5, 8], [-14.5, -8]]); }, false, "a trace run clear of the pad");
    { const g = mk();
      assert.equal(polarityClashes(g, [{ pin: "C9:1", conductor: "-" }]).length, 1, "a minus cable soldered straight to the plus lead, no trace on it, is a clash");
      assert.deepEqual(polarityClashes(g, [{ pin: "C9:1", conductor: "+" }]), [], "a plus cable soldered straight to the plus lead is not");
      assert.equal(polarityClashes(p.board, [...p.cables, { pin: "C3:2", conductor: "+" }]).length, 1, "on the example: a plus cable on C3's untraced minus lead"); }
    // the class: connectivity has one source, board.nets(). Every pin is in exactly one net, a trace's named pins share a
    // net, the nets do not depend on the order traces are drawn in, and a clash is reported for exactly the nets that see both signs.
    { const route = [["C9:1", "R9:1"], ["R9:1", [0, 4]], [[0, 4], [3, -2]], ["C9:2", [-5.5, -12], [8, -12]], ["J9:1", [7.46, -8]], ["J9:2", [15, 8]]];
      const fwd = mk(), rev = mk(); for (const r of route) fwd.trace(r); for (const r of [...route].reverse()) rev.trace(r);
      const norm = (g) => g.nets().map((n) => [...n].sort().join(",")).sort();
      const all = Object.values(fwd.parts).flatMap((pt) => pt.pins.map((_, i) => `${pt.ref}:${i + 1}`)).sort();
      assert.deepEqual(fwd.nets().flat().sort(), all, "every pin is in exactly one net");
      for (const t of fwd.traces) assert.ok(fwd.nets().some((n) => t.pins.every((x) => n.includes(x))), "a trace's pins share a net");
      assert.deepEqual(norm(fwd), norm(rev), "the nets do not depend on the order of the traces");
      for (const cabs of [[{ pin: "J9:1", conductor: "-" }], [{ pin: "J9:1", conductor: "+" }], [{ pin: "J9:2", conductor: "+" }], [{ pin: "J9:2", conductor: "-" }, { pin: "R9:2", conductor: "+" }]]) {
        const sign = (x) => [fwd.polarity(...((s) => [s[0], Number(s[1])])(x.split(":"))), ...cabs.filter((c) => c.pin === x).map((c) => c.conductor)].filter(Boolean);
        const want = fwd.nets().filter((n) => new Set(n.flatMap(sign)).size > 1).length;
        assert.equal(polarityClashes(fwd, cabs).length, want, "one clash per net that sees both signs: " + JSON.stringify(cabs));
      } }
  }
}

{ // Parts (parts.js): standard parts at their table sizes in metres at any scale; a nut clears its bolt; a bearing's
  // balls sit in both grooves with a real clearance and never overlap, and roll at the cage speed; a spring compresses
  // evenly between solid and free (never past either) and keeps its coils; the x-ray shell never touches a shared
  // material; unknown sizes are refused with the table, never guessed.
  for (const mpu of [2, 0.01]) {
    K.makeKit(new THREE.Scene(), { mpu });
    const Mq = K.M, size = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o, true).getSize(new THREE.Vector3()).multiplyScalar(Mq); }, near = (a, b, t = 1e-6) => Math.abs(a - b) < t;
    const b = parts.bolt({ size: "M6", length: 0.03 }), sb = size(b);
    assert.ok(near(sb.y, 0.034) && near(sb.x, 0.01) && near(sb.z, 0.01 / Math.cos(Math.PI / 6)), "an M6 x 30 bolt: 30 mm shank + 4 mm head, 10 mm across flats (ISO 4017), at mpu " + mpu);
    assert.ok(near(size(parts.nut({ size: "M6" })).y, 0.0052) && near(size(parts.washer({ size: "M6" })).x, 0.012), "ISO 4032 nut height, ISO 7089 washer diameter");
    const nb = parts.nut({ size: "M8" }), p = nb.children[0].geometry.attributes.position;
    let bore = Infinity; for (let i = 0; i < p.count; i++) bore = Math.min(bore, Math.hypot(p.getX(i), p.getZ(i)));
    const bb = parts.bolt({ size: "M8", length: 0.02 }), q = bb.children[0].geometry.attributes.position;
    let crest = 0; for (let i = 0; i < q.count; i++) crest = Math.max(crest, Math.hypot(q.getX(i), q.getZ(i)));
    assert.ok(bore >= crest - 1e-9 && near(crest, 0.004), "the nut's bore clears the bolt's thread crest (no interference)");
    assert.throws(() => parts.bolt({ size: "M7" }), /not in the table \(M3, M4/, "an unlisted size is refused, never guessed");
    assert.throws(() => parts.bearing({ code: 6305 }), /not in the table/);
    const br = parts.bearing({ code: 6202 }), info = br.userData.bearing, balls = br.children.find((c) => c.isGroup).children;
    assert.ok(balls.length === 8 && near(size(br).x, 0.035) && near(size(br).y, 0.011), "6202: 15 x 35 x 11 mm, 8 balls");
    const clear = info.groove - info.Dw / 2;
    assert.ok(clear > 0 && clear < 0.05 * info.Dw, "each ball sits in both grooves with a small radial clearance");
    const gap = 2 * (info.Dpw / 2) * Math.sin(Math.PI / info.Z);
    assert.ok(gap >= info.Dw, "neighbouring balls do not overlap on the pitch circle");
    br.spin(1);
    assert.ok(near(balls[0].parent.rotation.y, (1 - info.Dw / info.Dpw) / 2), "the balls roll at the cage's speed, (1 - Dw/Dpw)/2 of the inner ring");
    const sp = parts.spring({ wire: 0.001, mean: 0.008, coils: 8, free: 0.03 }), s0 = sp.userData.spring;
    assert.ok(near(size(sp).y, 0.03, 5e-5) && near(s0.solid, 0.009) && near(s0.rate, (79.3e9 * 1e-12) / (8 * 0.008 ** 3 * 6), 1e-6), "a spring at its free length; solid (coils + 1) x wire; rate from G d^4 / (8 D^3 n)");
    sp.setLength(0.02);
    assert.ok(near(size(sp).y, 0.02, 5e-5) && near(sp.force(), s0.rate * 0.01), "compressed to 20 mm it measures 20 mm and pushes rate x travel");
    sp.setLength(s0.solid);
    assert.ok(near(size(sp).y, s0.solid, 5e-5), "at solid the coils touch, wire on wire");
    assert.throws(() => sp.setLength(s0.solid * 0.9), /between solid/, "never compressed through itself");
    assert.throws(() => sp.setLength(0.031), /between solid/, "a compression spring is never stretched past free");
    const shared = new THREE.MeshStandardMaterial(), solid = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared), shell = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
    parts.xray(shell);
    assert.ok(solid.material === shared && !shared.transparent, "x-ray never changes a material another part shares");
    assert.ok(shell.material.transparent && !shell.material.depthWrite && shell.renderOrder > solid.renderOrder && !shell.castShadow && shell.userData.attend === false && shell.children.some((c) => c.isLineSegments), "the shell: see-through, drawn after the parts, no shadow, its edges, left alone by attention");
    assert.throws(() => parts.xray(shell, { opacity: 1 }), /opacity/);
    const hs = parts.housing({ w: 0.1, h: 0.07, d: 0.06, r: 0.006 }).children[0].children.find((c) => c.isLineSegments);
    assert.ok(hs.geometry.attributes.position.count >= 24 * 2, "a rounded housing keeps its outline in x-ray (its edge steps over the threshold)");
    assert.throws(() => parts.xray(new THREE.Group()), /no mesh/);
    const all = new THREE.Group();
    all.add(b, nb, bb, br, sp, parts.washer(), parts.shaft({ d: 0.008, length: 0.1 }), parts.knob(), parts.housing({ w: 0.08, h: 0.05, d: 0.06 }));
    const audit = scaleAudit(all);
    assert.ok(audit.ok && audit.unchecked.length === 0, "every part declares its real size and matches it: " + JSON.stringify([audit.problems, audit.unchecked]));
  }
  K.makeKit(new THREE.Scene(), { mpu: 2 });
}

console.log("selfcheck ok:surfaces, physics in real units, bake cache, holds, sparse poses, island bakes, loose hull, cloth, fur normals, wind, jet, bending, plants, rain, steam, steam contrast, room draught, water (M = " + M + "), cutaway, grains, mechanisms (slide, hinge, spring, latch, gear, belt, chain, cam), transmissions (involute gears without interference, belt and chain paths, links at ω·r), a bicycle drivetrain changing gear, time remap, type (phrases in four languages, adaptive ink, active word, pinned labels in the safe area, no repeat, layout boxes), camera stations and travel (hero box), attention by ghosting, loop end, studio rig (shadow refit per pose, AO from M), cue and shot lookup on one frame grid (snap, shotAt, overlayWindow, window check, read time), scale audit and z-fight probe, found model palette (own look, kinds, stated size, Draco decoder), showing a quantity (arrow width = value ratio, tile fill count and area, range bar, twin sets), circuit (ac period in the pulse shape, alias refused, lamp curve, arc only in its frames, black-body glow, failure variants, instruments, supply chain), fields (dipole line density by flux, loop and wire on-axis, bar magnet far field, filings along B, a compass settling along B, a moving source re-traced, lines revealed on cue), optics (Snell 30° into water, Fresnel at normal incidence, total internal reflection, thin and thick lens focus, mirror focus, prism dispersion, a mesh from the set, apparent depth, rays grown on cue, shafts and caustics, the straw), look J torch (lens set, real sizes, subject low, dimension lines, pill labels, text band in the safe area), shots from data (the torch frames match by hand, missing beat, overshoot, off-frame label, no action refused), creatures (gait scaling, planted feet, floor to wall), markings (a 2 mm print legible at the macro station and not from far away, real size under any parent scale, lifted on its normal with a curled sticker corner, wrapped on a cylinder, refusals by field, icons and wear drawn), electronics (catalogue sizes within 1 %, IEC 60062 colour bands, parts by reference designator, pins and traces, an opened power supply), parts (ISO sizes at any scale, a nut clears its bolt, bearing balls in their grooves at the cage speed, a spring between solid and free, the x-ray shell on its own material), any scale and gravity");
