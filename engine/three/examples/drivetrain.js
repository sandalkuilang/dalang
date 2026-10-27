import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { hinge, chain } from "../mechanism.js";
import { involute, gearGeometry, pitchRadius, loopPath, linkPoses, phaseOf } from "../transmission.js";

// A bicycle drivetrain changing gear: a chainring with its cranks and pedals, a chain of real links over a two-cog cassette on
// a rear wheel, and a sprung tensioner that takes up the slack. Every part is a rigid body on a free axle (mechanism.js `hinge`)
// and the chain is `chain()` with a shift: the rider's pedal torque is the only cause; the cassette turns at ring/cog and the
// wheel's inertia comes back to the pedals as s²·I, so the shift changes the cadence a leg settles at, not a hand-set number.
// Modelled in metres (a 42-tooth ring, 14 and 21-tooth cogs, a half-inch chain, a 42 cm chainstay, a 700c wheel), scaled by 1/M.
// The side of the bike faces +z (chain plane x, y; the axles along z); `at` is the bottom bracket in scene units; x runs forward.
//
//   const d = makeDrivetrain(kit, sim, { at: new THREE.Vector3(0, 0.3 / M, 0), shiftAt: 1.0 }); // before bakeCached
//   const baked = await sim.bakeCached(3, null, 0.5, opts);
//   baked.apply(t); d.update(t);                                                                 // each frame, the same t
//
// The two wheels share a collision group (they never collide with each other): keep other bodies clear of the drivetrain.
// A single sprung tensioner stands in for a derailleur cage; it moves on the baked time, not on a body (nothing pushes on the
// chain through it). The rider is a pedal torque that falls with cadence (a leg is weaker the faster it moves), 0 before t = 0.
export function makeDrivetrain(k, sim, { at, ring = 42, cogs = [14, 21], pitch = 0.0127, stay = 0.42, shiftAt = null, pedal = 25, drag = 0.16, name = "drivetrain" } = {}) {
  const { scene, mat } = k;
  if (!at || !Number.isFinite(at.x + at.y + at.z)) throw new Error("makeDrivetrain(): `at` is the bottom bracket, a position in scene units");
  const whole = (z) => Number.isInteger(z) && z >= 12;
  if (!whole(ring) || !Array.isArray(cogs) || cogs.length !== 2 || !cogs.every(whole) || cogs[0] === cogs[1]) throw new Error("makeDrivetrain(): ring is a whole number of teeth (12 or more), cogs two different ones [first, shifted to]");
  if (shiftAt !== null && !(Number.isFinite(shiftAt) && shiftAt >= 0)) throw new Error("makeDrivetrain(): shiftAt is a time in s, or null for no shift");
  const group = new THREE.Group();
  group.name = name; group.position.copy(at); // not scaled: the bodies' roots hold scene units, the metres sit in a scaled child
  scene.add(group);
  const metric = (parent) => { const g = new THREE.Group(); g.scale.setScalar(1 / M); parent.add(g); return g; };
  const fixed = metric(group); // what the bake does not move: the chain and the tensioner, in metres
  const steel = mat(0x8a8f93, 0.35), alloy = mat(0xb9bec2, 0.3), dark = mat(0x2a2c2f, 0.5), rubber = mat(0x1b1b1d, 0.85), link = mat(0x7a7c7e, 0.4);
  const put = (o, parent, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const box = (parent, w, h, d, m, x, y, z) => put(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), parent, x, y, z);
  const cyl = (parent, r, len, m, x, y, z) => { const o = put(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), m), parent, x, y, z); o.rotation.x = Math.PI / 2; return o; }; // axis along z
  const rod = (parent, a, b, r, m) => { const d = new THREE.Vector3().subVectors(b, a), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 5), m); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); o.castShadow = true; parent.add(o); return o; };
  const sprocket = (teeth, width, bore, m, parent, z, x = 0, y = 0) => { // module = pitch / π puts the pitch circle at the chain's
    const g = involute({ module: pitch / Math.PI, teeth, pressure: 20 }), o = new THREE.Mesh(gearGeometry(g, { width, bore: Math.min(bore, g.rf - 0.003) }), m); // a bore inside the root circle
    return put(o, parent, x, y, z);
  };
  const Z = { x: 0, y: 0, z: 1 }, ZR = 0.045, ZC = [0.0415, 0.0372]; // z of the ring and of each cog (4.3 mm apart, the larger one nearer the wheel)
  const rr = pitchRadius(ring, pitch), rc = cogs.map((c) => pitchRadius(c, pitch)), TEN = 11, rt = pitchRadius(TEN, pitch);

  // The crankset: ring, five spider arms, spindle, two cranks and pedals (point-symmetric about the axle, as a real one is).
  const crank = new THREE.Group(); crank.name = name + " crankset"; group.add(crank);
  const cr = metric(crank);
  sprocket(ring, 0.0017, 0.058, steel, cr, ZR);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 2 * Math.PI, arm = box(cr, 0.046, 0.012, 0.0045, steel, Math.cos(a) * 0.043, Math.sin(a) * 0.043, ZR); arm.rotation.z = a; }
  cyl(cr, 0.0085, 0.13, dark, 0, 0, 0);
  for (const s of [1, -1]) {
    box(cr, 0.17, 0.022, 0.008, alloy, 0.085 * s, 0, s * 0.057);
    cyl(cr, 0.0045, 0.11, dark, 0.165 * s, 0, s * 0.105);
    box(cr, 0.1, 0.018, 0.085, rubber, 0.165 * s, 0, s * 0.108);
  }
  // The rear wheel with its cassette: a rim and tyre, 32 laced spokes, a hub and the two cogs.
  const wheel = new THREE.Group(); wheel.name = name + " rear wheel"; wheel.position.set(-stay / M, 0, 0); group.add(wheel);
  const wm = metric(wheel);
  put(new THREE.Mesh(new THREE.TorusGeometry(0.304, 0.009, 10, 96), alloy), wm);
  put(new THREE.Mesh(new THREE.TorusGeometry(0.319, 0.0145, 12, 96), rubber), wm);
  for (let i = 0; i < 32; i++) { // radial lacing crossed three times: every spoke leaves its flange tangent to the hub and reaches the rim 0.43 rad on
    const side = i % 2 ? 1 : -1, a = (i / 32) * 2 * Math.PI, b = a + 0.43 * (side > 0 ? 1 : -1);
    rod(wm, new THREE.Vector3(Math.cos(a) * 0.028, Math.sin(a) * 0.028, 0.03 * side), new THREE.Vector3(Math.cos(b) * 0.3, Math.sin(b) * 0.3, 0), 0.0007, steel);
  }
  cyl(wm, 0.0085, 0.13, dark, 0, 0, 0);
  cyl(wm, 0.019, 0.06, alloy, 0, 0, 0);
  cyl(wm, 0.0165, 0.032, dark, 0, 0, 0.034);
  cogs.forEach((c, i) => sprocket(c, 0.0017, 0.017, steel, wm, ZC[i]));

  // The two bodies, on free axles; the same collision group, so the hulls that overlap never collide. The cranks and the
  // wheel are the masses of a real set: ~0.9 kg for the crankset; ~2.2 kg for the wheel with its tyre, as a hull (a disc of the
  // same moment, 0.1 kg·m², what a 700c wheel measures).
  group.updateMatrixWorld(true);
  const world = (x) => new THREE.Vector3(at.x + x / M, at.y, at.z);
  const ringPart = sim.dynamicHull(crank, { angularDamping: 0, linearDamping: 0, group: 1, mass: 0.9, name: name + " crankset" });
  const wheelPart = sim.dynamicHull(wheel, { angularDamping: 0, linearDamping: 0, group: 1, mass: 2.2, name: name + " rear wheel" });
  const ringJ = hinge(sim, ringPart, { at: world(0), axis: Z, min: -Infinity, max: Infinity });
  const cassJ = hinge(sim, wheelPart, { at: world(-stay), axis: Z, min: -Infinity, max: Infinity });

  // The causes, registered before the coupling so it solves what they pushed in the same step: the rider's legs on the cranks
  // (two legs: half a push at the dead centres, whole between; weaker the faster the cranks turn, nothing past 200 rpm) and the
  // road and air on the wheel (a drag N·m per rad/s, ~0.16 for a stand with the wheel in the air).
  const WMAX = (200 * 2 * Math.PI) / 60, rb = ringPart.body, wb = wheelPart.body;
  sim.part({ bodies: [rb], key: `legs ${name} ${pedal} ${WMAX}`, step(t, h) {
    if (t < 0) return;
    const q = rb.rotation(), th = 2 * Math.atan2(q.z, q.w), w = rb.angvel().z;
    rb.applyTorqueImpulse({ x: 0, y: 0, z: ((pedal * (0.5 + 0.5 * Math.abs(Math.cos(th))) * Math.max(0, 1 - w / WMAX)) / (M * M)) * h }, true);
  } });
  sim.part({ bodies: [wb], key: `drag ${name} ${drag}`, step(t, h) { wb.applyTorqueImpulse({ x: 0, y: 0, z: ((-drag * wb.angvel().z) / (M * M)) * h }, true); } });
  const shifts = shiftAt === null ? [] : [{ at: shiftAt, index: 1, teeth: cogs[1] }];
  const coupling = chain(sim, [{ joint: ringJ, teeth: ring }, { joint: cassJ, teeth: cogs[0] }], { pitch, shifts });

  // The tensioner: a jockey wheel on an arm that pivots behind and below the cassette and swings the wheel forward (up
  // into the lower run, then toward the ring). The chain has a whole, even number of links; each cog needs the arm at the angle
  // where the loop is exactly that long: solved, for the fewest links that both cogs can have.
  const PIV = { x: -stay - 0.02, y: -0.12 }, ARM = 0.08, SWING = 80, STEPS = 40, MARGIN = 0.5;
  const loop = (c, deg) => { const a = (deg * Math.PI) / 180; return loopPath([{ x: 0, y: 0, r: rr }, { x: -stay, y: 0, r: rc[c] }, { x: PIV.x + ARM * Math.sin(a), y: PIV.y - ARM * Math.cos(a), r: rt, inside: true }]); };
  const lengths = rc.map((_, c) => { const out = []; try { for (let i = 0; i <= STEPS; i++) out.push(loop(c, (SWING * i) / STEPS).length / pitch); } catch { return null; } return out; });
  const strictlyFalling = (L) => L && L.every((v, i) => i === 0 || v < L[i - 1]);
  let links = 0;
  if (lengths.every(strictlyFalling)) for (let n = 20; n < 400 && !links; n += 2) if (lengths.every((L) => n < L[0] - MARGIN && n > L[L.length - 1] + MARGIN)) links = n;
  if (!links) throw new Error(`makeDrivetrain(): no whole, even number of links fits a ${ring}-tooth ring, ${cogs.join(" and ")}-tooth cogs and a ${stay} m chainstay with the tensioner's swing: change the ring, the cogs or the stay`);
  const angles = rc.map((_, c) => { // bisection: the loop is shorter the further the arm swings forward
    let lo = 0, hi = SWING;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (loop(c, mid).length > links * pitch) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  });
  const loops = angles.map((a, c) => loop(c, a));

  // The tensioner's cage, the jockey wheel and its arm; moved in update(t).
  const cage = new THREE.Group(); cage.name = name + " tensioner"; fixed.add(cage);
  const arm = new THREE.Group(); arm.position.set(PIV.x, PIV.y, 0); cage.add(arm);
  cyl(arm, 0.011, 0.05, dark, 0, 0, 0);
  for (const s of [1, -1]) box(arm, 0.012, ARM, 0.003, dark, 0, -ARM / 2, s * 0.0065);
  const jockey = sprocket(TEN, 0.0032, 0.003, alloy, cage);
  cyl(jockey, 0.0035, 0.018, dark, 0, 0, 0);

  // The chain: plates (inner and outer alternate) and rollers, placed on the loop by linkPoses at the phase the cranks'
  // replayed pose gives (a chain moves exactly as far as the ring's teeth do). Blended between the two loops while the cage shifts.
  const R = 0.0042, h = pitch / 2, plate = new THREE.Shape();
  plate.absarc(h, 0, R, -Math.PI / 2, Math.PI / 2, false); plate.absarc(-h, 0, R, Math.PI / 2, (3 * Math.PI) / 2, false);
  const plateGeo = new THREE.ExtrudeGeometry(plate, { depth: 0.0009, bevelEnabled: false, curveSegments: 10 }); plateGeo.translate(0, 0, -0.00045);
  const rollerGeo = new THREE.CylinderGeometry(0.00355, 0.00355, 0.0053, 14); rollerGeo.rotateX(Math.PI / 2);
  const plates = new THREE.InstancedMesh(plateGeo, link, links * 2), rollers = new THREE.InstancedMesh(rollerGeo, alloy, links);
  [plates, rollers].forEach((o) => { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; fixed.add(o); });
  const eul = new THREE.Object3D(), ease = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); }, SHIFT = 0.25, wrapPi = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  const IDENT = { x: 0, y: 0, z: 0, w: 1 };
  const state = { w: 0, phase: 0, arm: angles[0] };
  function place(w, phase) {
    const A = linkPoses(loops[0], { pitch, phase }), B = linkPoses(loops[1], { pitch, phase });
    const zc = ZC[0] + (ZC[1] - ZC[0]) * w, zAt = (x) => ZR + (zc - ZR) * Math.min(1, Math.max(0, -x / stay));
    const pose = (i) => { const a = A[i], b = B[i]; return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, angle: a.angle + wrapPi(b.angle - a.angle) * w }; };
    for (let i = 0; i < links; i++) {
      const p = pose(i), q = pose((i + 1) % links), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, ang = Math.atan2(q.y - p.y, q.x - p.x), zz = zAt(p.x);
      eul.position.set(p.x, p.y, zz); eul.rotation.set(0, 0, p.angle); eul.updateMatrix(); rollers.setMatrixAt(i, eul.matrix);
      const outer = i % 2 === 0, zo = outer ? 0.0039 : 0.003;
      for (const s of [1, -1]) { eul.position.set(mx, my, zAt(mx) + s * zo); eul.rotation.set(0, 0, ang); eul.updateMatrix(); plates.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), eul.matrix); }
    }
    plates.instanceMatrix.needsUpdate = rollers.instanceMatrix.needsUpdate = true;
    return zc;
  }
  place(0, 0);

  // Call after baked.apply(t) with the same t: the chain from the cranks' pose, the cage to the cog the chain is on.
  function update(t) {
    const w = shiftAt === null ? 0 : ease((t - shiftAt) / SHIFT), phase = phaseOf(crank.quaternion, IDENT, Z, ring, pitch), zc = place(w, phase);
    const ang = ((angles[0] + (angles[1] - angles[0]) * w) * Math.PI) / 180;
    cage.position.z = zc; arm.rotation.z = ang; // the arm hangs down at 0 and swings its wheel toward +x
    jockey.position.set(PIV.x + ARM * Math.sin(ang), PIV.y - ARM * Math.cos(ang), 0);
    jockey.rotation.z = -phase / rt; // the wheel runs on the back of the chain: it turns the other way, a pitch of chain per pitch of teeth
    state.w = w; state.phase = phase; state.arm = ang;
  }
  update(0);
  return { group, ring: ringPart, cassette: wheelPart, chain: coupling, links, loops, rollers, tensioner: { angles, pivot: PIV, arm: ARM }, update, get state() { return { ...state }; } };
}
