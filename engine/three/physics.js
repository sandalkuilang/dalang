import { RAPIER } from "./rapier.js";
import { G, M } from "./kit.js";
export { RAPIER };

// Rigid-body physics (Rapier, deterministic), baked once before the first frame: the shot is simulated at 480 Hz
// and every body's pose is stored per step, so any time — including motion-blur sub-frames — can be seeked and
// every render worker gets the same result.
//
// Accuracy rules this module enforces:
// - the whole static set collides (a triangle mesh per scene mesh), not a hand-picked few boxes;
// - colliders match what is drawn (a rounded box gets a round cuboid with the same radius, a model its convex hull);
// - after the bake it reports the deepest penetration, bodies left floating and bodies still moving.
export async function makeSim(THREE, g = G, mpu = M) { // g in units/s², mpu metres per unit (the kit's by default); reports in real mm and m/s
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -g, z: 0 }); // g in the scene's units per s²
  world.timestep = 1 / 480; // 480 Hz: a hard knock between books stays under 2 mm of overlap
  // Stiff, exact contacts: Rapier's defaults (4 iterations, 1 mm allowed error, 30 Hz contacts) let a stack of seven
  // books sink ~3.5 mm into each other and a 12 kg chair leg dig 6 mm into a book.
  world.numSolverIterations = 16;
  world.integrationParameters.numInternalPgsIterations = 2;
  world.integrationParameters.normalizedAllowedLinearError = 0.0002;
  world.integrationParameters.contact_natural_frequency = 60;
  world.integrationParameters.maxCcdSubsteps = 4;
  const tracked = [], kin = [], steps = [], owner = new Map(); // owner: collider handle → the object it was built from
  // o.group (1–15): parts of one object (a chair's seat and base) share a collision group and never collide with each other.
  const surface = (c, o) => { c.setFriction(o.friction ?? 0.55).setRestitution(o.restitution ?? 0.15).setDensity(o.density ?? 600); if (o.group) c.setCollisionGroups(((1 << o.group) << 16) | (0xffff & ~(1 << o.group))); return c; };
  const tmp = new THREE.Vector3();

  function localPoints(root, filter, cell = 0.001 / mpu) { // vertices of every mesh under root, in root's own frame; filter(v, mesh)
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), pts = [];
    root.traverse((m) => {
      if (!m.isMesh) return;
      const p = m.geometry.attributes.position, mat = inv.clone().multiply(m.matrixWorld);
      for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i).applyMatrix4(mat); if (!filter || filter(tmp, m)) pts.push(tmp.x, tmp.y, tmp.z); }
    });
    // One point per cell (0.5 mm by default): meshes repeat a vertex on every face that meets there, and Rapier's
    // hull builder aborts (wasm "unreachable") on such coincident or crowded, nearly coplanar points.
    const seen = new Set(), out = [];
    for (let i = 0; i < pts.length; i += 3) { const key = Math.round(pts[i] / cell) + "," + Math.round(pts[i + 1] / cell) + "," + Math.round(pts[i + 2] / cell); if (!seen.has(key)) { seen.add(key); out.push(pts[i], pts[i + 1], pts[i + 2]); } }
    return new Float32Array(out);
  }
  // Rapier aborts (wasm "unreachable") on a flat or degenerate point set instead of returning null: build a hull only
  // from points that enclose a real volume (a tetrahedron ≥ 1 mm in every direction).
  function solid(pts) {
    const P = (i) => new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]), n = pts.length / 3;
    if (n < 4) return false;
    const a = P(0); let b = a, c = a, best = 0;
    for (let i = 1; i < n; i++) { const d = P(i).distanceTo(a); if (d > best) { best = d; b = P(i); } }
    if (best < 0.002 / mpu) return false;
    const ab = b.clone().sub(a).normalize(); best = 0;
    for (let i = 0; i < n; i++) { const v = P(i).sub(a), d = v.sub(ab.clone().multiplyScalar(v.dot(ab))).length(); if (d > best) { best = d; c = P(i); } }
    if (best < 0.002 / mpu) return false;
    const nrm = b.clone().sub(a).cross(c.clone().sub(a)).normalize(); best = 0;
    for (let i = 0; i < n; i++) best = Math.max(best, Math.abs(P(i).sub(a).dot(nrm)));
    return best >= 0.002 / mpu;
  }
  function bodyAt(desc, root) {
    root.updateMatrixWorld(true);
    const p = root.getWorldPosition(new THREE.Vector3()), q = root.getWorldQuaternion(new THREE.Quaternion());
    return world.createRigidBody(desc.setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  }
  function track(root, body, o) { const t = { root, body, start: { ...body.translation() }, q0: { ...body.rotation() }, impacts: o.impacts !== false, soft: !!o.soft, name: o.name || root.name || "body" }; tracked.push(t); return t; }

  return {
    world,
    points: localPoints,
    // Every mesh in the scene except the excluded subtrees becomes a fixed triangle mesh, in world space.
    staticScene(scene, exclude) {
      scene.updateMatrixWorld(true);
      const skip = new Set();
      exclude.forEach((r) => r.traverse((o) => skip.add(o)));
      let tris = 0;
      scene.traverse((m) => {
        if (!m.isMesh || skip.has(m) || !m.visible || m.userData.fur || m.material.isShadowMaterial || m.material.transparent) return; // glass, steam, shadow catchers, a coat of fur
        const g = m.geometry, p = g.attributes.position, v = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); v[i * 3] = tmp.x; v[i * 3 + 1] = tmp.y; v[i * 3 + 2] = tmp.z; }
        const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: p.count }, (_, i) => i);
        const c = world.createCollider(RAPIER.ColliderDesc.trimesh(v, idx).setFriction(0.55).setRestitution(0.15));
        let r = m; while (r.parent && r.parent !== scene) r = r.parent;
        owner.set(c.handle, r);
        tris += idx.length / 3;
      });
      return tris;
    },
    // A dynamic rounded box: the collider has the drawn geometry's corner radius, so edges touch where they are drawn.
    roundBox(mesh, w, h, d, r, o = {}) {
      const body = bodyAt(RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.05).setAngularDamping(0.1).setCanSleep(false).setCcdEnabled(true), mesh);
      owner.set(world.createCollider(surface(RAPIER.ColliderDesc.roundCuboid(w / 2 - r, h / 2 - r, d / 2 - r, r), o), body).handle, mesh);
      return track(mesh, body, o);
    },
    // A dynamic body shaped by the convex hull of an object's own vertices (optionally a filtered part of them),
    // plus extra colliders [{ desc, ...surface }] in the same frame.
    // o.mass (kg): densities are scaled so the colliders weigh that much, keeping a real inertia (it can tilt).
    dynamicHull(root, o = {}) {
      const desc = RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true).setAngularDamping(o.angularDamping ?? 0.2).setLinearDamping(o.linearDamping ?? 0);
      if (o.lockRotations) desc.lockRotations();
      const body = bodyAt(desc, root), dens = o.mass ? { density: 1 } : {}, pts = localPoints(root, o.filter, o.spokes ? 0.001 / mpu : 0.006 / mpu); // a single hull from points ~6 mm apart (tolerances in metres / mpu)
      // o.spokes = { x, z, core, bins }: a radial object (a star base) is split into a core hull around the axis and
      // one hull per angular bin, so the gaps between legs stay empty instead of filled by one big hull.
      const groups = [];
      if (o.spokes) {
        const { x: cx, z: cz, core, bins } = o.spokes, sets = Array.from({ length: bins + 1 }, () => []);
        for (let i = 0; i < pts.length; i += 3) {
          const dx = pts[i] - cx, dz = pts[i + 2] - cz;
          sets[Math.hypot(dx, dz) < core ? bins : Math.min(bins - 1, Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * bins))].push(pts[i], pts[i + 1], pts[i + 2]);
        }
        sets.forEach((s) => { if (solid(s)) groups.push(new Float32Array(s)); });
      } else if (solid(pts)) groups.push(pts);
      groups.forEach((g) => { const hull = RAPIER.ColliderDesc.convexHull(g); if (hull) owner.set(world.createCollider(surface(hull, { ...o, ...dens }), body).handle, root); });
      (o.extra || []).forEach((e) => owner.set(world.createCollider(surface(e.desc, { ...e, ...dens }), body).handle, root));
      if (o.mass) {
        body.recomputeMassPropertiesFromColliders();
        const k = o.mass / body.mass();
        for (let c = 0; c < body.numColliders(); c++) body.collider(c).setDensity(k);
        body.recomputeMassPropertiesFromColliders();
      }
      return track(root, body, o);
    },
    // A kinematic body shaped by an object's hull, moved each step by pose(t) → { p: {x,y,z}, q: {x,y,z,w} }.
    kinematicHull(root, pose, o = {}) {
      const body = bodyAt(RAPIER.RigidBodyDesc.kinematicPositionBased(), root);
      owner.set(world.createCollider(surface(RAPIER.ColliderDesc.convexHull(localPoints(root)), o), body).handle, root);
      kin.push({ body, pose });
      return track(root, body, { ...o, impacts: false });
    },
    // Simulate [0, duration] after a pre-roll that lets everything settle onto its real support (a rug's thickness,
    // a soft seat), so frame 0 shows bodies already at rest. onStep(t) runs before each step (pushes, resistance).
    bake(duration, onStep, preroll = 0.5) {
      const n = Math.ceil(duration / world.timestep) + 1, impacts = [], hist = [], win = Math.round(0.0125 / world.timestep);
      let deepest = { depth: 0 };
      const record = () => steps.push(tracked.map((b) => { const p = b.body.translation(), q = b.body.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w]; }));
      tracked.forEach((b) => { b.com0 = { ...b.body.worldCom() }; b.q0 = { ...b.body.rotation() }; }); // pre-roll drift is measured at the centre of mass
      for (let s = Math.round(preroll / world.timestep); s > 0; s--) {
        const t = -s * world.timestep;
        if (onStep) onStep(t);
        kin.forEach((k) => { const { p, q } = k.pose(t); k.body.setNextKinematicTranslation(p); if (q) k.body.setNextKinematicRotation(q); });
        world.step();
      }
      const settled = tracked.map((b) => {
        const c = b.body.worldCom(), d = ['x', 'y', 'z'].map((k) => +((c[k] - b.com0[k]) * 1000 * mpu).toFixed(1)), q = b.body.rotation();
        const q0 = new THREE.Quaternion(b.q0.x, b.q0.y, b.q0.z, b.q0.w), q1 = new THREE.Quaternion(q.x, q.y, q.z, q.w), up = new THREE.Vector3(0, 1, 0);
        const tilt = new THREE.Vector3(0, 1, 0).applyQuaternion(q1).angleTo(up.clone().applyQuaternion(q0)) * 180 / Math.PI, turn = (2 * Math.acos(Math.min(1, Math.abs(q0.dot(q1)))) * 180) / Math.PI;
        return { name: b.name, mm: +Math.hypot(...d).toFixed(1), xyz: d, deg: +turn.toFixed(2), tilt: +tilt.toFixed(2) };
      }).filter((e) => e.mm > 1 || e.deg > 0.2);
      record();
      for (let s = 1; s < n; s++) {
        const t = s * world.timestep;
        if (onStep) onStep(t);
        kin.forEach((k) => { const { p, q } = k.pose(t); k.body.setNextKinematicTranslation(p); if (q) k.body.setNextKinematicRotation(q); });
        world.step();
        record();
        hist.push(tracked.map((b) => b.body.linvel()));
        if (hist.length > win + 1) hist.shift();
        tracked.forEach((b, i) => {
          if (!b.impacts || hist.length < win + 1) return;
          const v = hist[win][i], v0 = hist[0][i], dv = Math.hypot(v.x - v0.x, v.y - v0.y, v.z - v0.z) * mpu; // m/s, over 12.5 ms: stiff contacts spread a hit across steps
          const last = impacts.findLast((e) => e.name === b.name);
          if (dv >= 0.15 && !(last && t - last.t < 0.12)) impacts.push({ t: t - (win - 1) * world.timestep, name: b.name, dv }); // ≥ 0.15 m/s is audible: a soft landing still gets its (quieter) sound
        });
        // Deepest penetration this step between any tracked body and anything else.
        tracked.forEach((b) => {
          if (b.soft) return; // a soft thing gives where it lands: its overlap is compression, not an error
          for (let c = 0; c < b.body.numColliders(); c++) {
            const col = b.body.collider(c);
            world.contactPairsWith(col, (other) => world.contactPair(col, other, (m) => {
              for (let i = 0; i < m.numContacts(); i++) {
                const d = -m.contactDist(i) * mpu;
                if (d > deepest.depth) deepest = { depth: d, t, a: b.name, b: (owner.get(other.handle) || {}).name || "?" };
              }
            }));
          }
        });
      }
      // End state: resting bodies must touch something; anything still moving is reported.
      const floating = [], moving = [], jointed = new Set(); // a body on a joint hangs from it, it does not float
      world.impulseJoints.forEach((j) => { jointed.add(j.body1().handle); jointed.add(j.body2().handle); });
      tracked.forEach((b) => {
        const v = b.body.linvel(), speed = Math.hypot(v.x, v.y, v.z) * mpu;
        let touching = false;
        for (let c = 0; c < b.body.numColliders(); c++) {
          const col = b.body.collider(c);
          world.contactPairsWith(col, (other) => world.contactPair(col, other, (m) => { for (let i = 0; i < m.numContacts(); i++) if (m.contactDist(i) * mpu <= 0.002) touching = true; }));
        }
        if (speed > 0.01) moving.push({ name: b.name, speed: +speed.toFixed(3) });
        else if (!touching && b.body.isDynamic() && !jointed.has(b.body.handle)) floating.push(b.name);
      });
      const pose = (i, t) => { // interpolated pose of tracked body i at time t
        const u = Math.min(n - 1, Math.max(0, t / world.timestep)), s0 = Math.floor(u), s1 = Math.min(n - 1, s0 + 1), f = u - s0;
        const a = steps[s0][i], b = steps[s1][i];
        const qa = new THREE.Quaternion(a[3], a[4], a[5], a[6]), qb = new THREE.Quaternion(b[3], b[4], b[5], b[6]);
        return { p: new THREE.Vector3(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f), q: qa.slerp(qb, f) };
      };
      return {
        impacts,
        report: { penetration_mm: +(deepest.depth * 1000).toFixed(2), deepest, floating, moving, settled }, // settled: how far a body moved in the pre-roll (a big number = it was placed wrong)
        pose,
        // Fastest tracked point speed around t (m per video frame): decides whether the frame needs motion blur.
        travel(t, fps) {
          let m = 0;
          tracked.forEach((b, i) => { m = Math.max(m, pose(i, t + 0.5 / fps).p.distanceTo(pose(i, t - 0.5 / fps).p)); });
          return m;
        },
        apply(t) {
          tracked.forEach((b, i) => {
            if (b.root.userData.noApply) return;
            const { p, q } = pose(i, t), par = b.root.parent;
            if (par && !par.isScene) { // a part of a moving object: convert to its parent's frame
              par.updateMatrixWorld(true);
              b.root.position.copy(par.worldToLocal(p));
              b.root.quaternion.copy(par.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
            } else {
              b.root.position.copy(p);
              b.root.quaternion.copy(q);
            }
          });
        },
      };
    },
    // Contact audit for props placed by hand: the gap (+) or overlap (−) between each object's lowest point and the
    // surface under its centre, in mm. A near miss (0.5–30 mm either way) is a placement error.
    audit(objects) {
      world.updateSceneQueries?.();
      const out = [], v = new THREE.Vector3(), bottoms = new Map();
      objects.forEach((o) => {
        const b = new THREE.Box3().setFromObject(o, true); // from the vertices: a rotated mesh's own box overstates it
        if (b.isEmpty()) return;
        const own = new Set(); o.traverse((x) => own.add(x));
        // Ignore itself and anything resting on top of it: only what is below can be its support.
        const below = (col) => { const r = owner.get(col.handle); if (!r || own.has(r)) return false; if (!bottoms.has(r)) bottoms.set(r, new THREE.Box3().setFromObject(r, true).min.y); return bottoms.get(r) < b.min.y - 0.001 / mpu; };
        // The gap under each of its lowest points (one per cell of a 6 × 6 grid over its footprint); the smallest is
        // where it rests: it should be ~0 (touching), not a few mm of air or a few mm into its support.
        const low = new Map(), cell = (a, lo, hi) => Math.min(5, Math.max(0, Math.floor(((a - lo) / (hi - lo || 1)) * 6)));
        o.traverse((m) => { if (!m.isMesh || !m.visible || m.userData.fur) return; const p = m.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 6000)); for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); const k = cell(v.x, b.min.x, b.max.x) * 6 + cell(v.z, b.min.z, b.max.z); if (!low.has(k) || v.y < low.get(k).y) low.set(k, v.clone()); } });
        let best = null;
        for (const q of low.values()) {
          const hit = world.castRay(new RAPIER.Ray({ x: q.x, y: q.y + 0.1 / mpu, z: q.z }, { x: 0, y: -1, z: 0 }), 0.4 / mpu, true, undefined, undefined, undefined, undefined, below);
          if (hit && (!best || hit.timeOfImpact < best.hit.timeOfImpact)) best = { hit, q };
        }
        if (!best) return;
        const gap = (best.hit.timeOfImpact - 0.1 / mpu) * 1000 * mpu;
        if (Math.abs(gap) >= 0.5 && Math.abs(gap) <= 30) out.push({ name: o.name || o.type, at: best.q.toArray().map((x) => +x.toFixed(3)), gap_mm: +gap.toFixed(1), on: (owner.get(best.hit.collider.handle) || {}).name || "?" });
      });
      return out;
    },
  };
}
