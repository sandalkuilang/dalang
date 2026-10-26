// The bake's step loop, free of three.js and the DOM (no imports): physics.js runs it on the set's own world, and a
// worker (bake-worker.js) or the main thread runs it again on a restored copy for each declared island. Plain data in,
// plain data out, so a worker's result is the same bytes as an in-thread one.

// world: a Rapier world. items: the bodies this bake records, in tracked order: { body, name, impacts, soft, until }
// (until: the time a held body is released, else -Infinity). o: { duration, preroll, mpu, onStep, kin: [{ body, pose }],
// track: [[name, fn]], keep, names } where names maps a collider handle to the name of the object it was built from.
// Returns the data baked() reads, plus ord (for each report list, the item index of each entry: islands merge by it).
export function runBake(world, items, o) {
  const { duration, preroll, mpu, onStep, kin, track, keep, names } = o;
  const dt = world.timestep, n = Math.ceil(duration / dt) + 1, impacts = [], from = [], hist = [], win = Math.round(0.0125 / dt);
  const every = Math.max(1, Math.round(0.01 / dt)); // a resting body's contacts are audited every 10 ms, a moving one's every step
  const series = Object.fromEntries(track.map(([k]) => [k, new Float32Array(n)]));
  let deepest = { depth: 0 };
  const on = items.map(() => true);
  const gate = (t) => items.forEach((b, i) => { const v = t >= b.until; if (v !== on[i]) { on[i] = v; b.body.setEnabled(v); } });
  // Sparse poses: a body's pose is stored when it moved ≥ 0.01 mm or turned ≥ ~1e-5 rad since the last stored one,
  // as float32 so a live bake and its cached replay give the same numbers. The rest pose right before a body
  // moves again is stored too, so a gap between two stored steps always means "at rest".
  const eps = 1e-5 / mpu, S = items.map(() => ({ s: [], p: [] })), last = items.map(() => null), prev = items.map(() => null), f = new Float32Array(7);
  const record = (s) => items.forEach((b, i) => {
    const p = b.body.translation(), q = b.body.rotation();
    f[0] = p.x; f[1] = p.y; f[2] = p.z; f[3] = q.x; f[4] = q.y; f[5] = q.z; f[6] = q.w;
    const cur = Array.from(f), L = last[i];
    if (!L || s === n - 1 || Math.hypot(cur[0] - L[0], cur[1] - L[1], cur[2] - L[2]) >= eps || Math.max(...[3, 4, 5, 6].map((k) => Math.abs(cur[k] - L[k]))) >= 5e-6) {
      const st = S[i];
      if (st.s.length && st.s[st.s.length - 1] < s - 1) { st.s.push(s - 1); st.p.push(...prev[i]); }
      st.s.push(s); st.p.push(...cur); last[i] = cur;
    }
    prev[i] = cur;
  });
  const sample = (s) => track.forEach(([k, fn]) => { series[k][s] = fn(); });
  const aim = (t) => kin.forEach((k) => { const { p, q } = k.pose(t); k.body.setNextKinematicTranslation(p); if (q) k.body.setNextKinematicRotation(q); });
  items.forEach((b) => { b.com0 = { ...b.body.worldCom() }; b.q0 = { ...b.body.rotation() }; }); // pre-roll drift is measured at the centre of mass
  for (let s = Math.round(preroll / dt); s > 0; s--) {
    const t = -s * dt;
    gate(t);
    if (onStep) onStep(t);
    aim(t);
    world.step();
  }
  const up = (q) => [2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x)]; // where a body's own +y points
  const settled = [], ord = { settled: [], floating: [], moving: [], impacts: from };
  items.forEach((b, i) => {
    const c = b.body.worldCom(), d = ['x', 'y', 'z'].map((k) => +((c[k] - b.com0[k]) * 1000 * mpu).toFixed(1)), q = b.body.rotation(), q0 = b.q0;
    const u0 = up(q0), u1 = up(q), cos = (u0[0] * u1[0] + u0[1] * u1[1] + u0[2] * u1[2]) / Math.sqrt((u0[0] ** 2 + u0[1] ** 2 + u0[2] ** 2) * (u1[0] ** 2 + u1[1] ** 2 + u1[2] ** 2));
    const tilt = Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI, dot = q0.x * q.x + q0.y * q.y + q0.z * q.z + q0.w * q.w, turn = (2 * Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI;
    const e = { name: b.name, mm: +Math.hypot(...d).toFixed(1), xyz: d, deg: +turn.toFixed(2), tilt: +tilt.toFixed(2) };
    if (e.mm > 1 || e.deg > 0.2) { settled.push(e); ord.settled.push(i); }
  });
  gate(0); record(0); sample(0);
  for (let s = 1; s < n; s++) {
    const t = s * dt;
    gate(t);
    if (onStep) onStep(t);
    aim(t);
    world.step();
    record(s); sample(s);
    hist.push(items.map((b) => b.body.linvel()));
    if (hist.length > win + 1) hist.shift();
    items.forEach((b, i) => {
      if (!b.impacts || hist.length < win + 1) return;
      const v = hist[win][i], v0 = hist[0][i], dv = Math.hypot(v.x - v0.x, v.y - v0.y, v.z - v0.z) * mpu; // m/s, over 12.5 ms: stiff contacts spread a hit across steps
      const last = impacts.findLast((e) => e.name === b.name);
      if (dv >= 0.15 && !(last && t - last.t < 0.12)) { impacts.push({ t: t - (win - 1) * dt, name: b.name, dv }); from.push(i); } // ≥ 0.15 m/s is audible: a soft landing still gets its (quieter) sound
    });
    // Deepest penetration between any tracked body and anything else: every step for a moving body (a knock
    // peaks within a few steps), every 10 ms for a resting one (a slow sink), and all of them at the last step.
    const vel = hist[hist.length - 1], all = s % every === 0 || s === n - 1, turning = all ? null : items.map((b) => { const w = b.body.angvel(); return Math.hypot(w.x, w.y, w.z) >= 0.2; });
    items.forEach((b, i) => {
      if (b.soft || !on[i]) return; // a soft thing gives where it lands: its overlap is compression, not an error
      if (!all && Math.hypot(vel[i].x, vel[i].y, vel[i].z) * mpu < 0.02 && !turning[i]) return; // resting: neither sliding (2 cm/s) nor turning (0.2 rad/s)
      for (let c = 0; c < b.body.numColliders(); c++) {
        const col = b.body.collider(c);
        world.contactPairsWith(col, (other) => world.contactPair(col, other, (m) => {
          for (let i = 0; i < m.numContacts(); i++) {
            const d = -m.contactDist(i) * mpu;
            if (d > deepest.depth) deepest = { depth: d, t, a: b.name, b: names[other.handle] || "?" };
          }
        }));
      }
    });
  }
  // End state: resting bodies must touch something; anything still moving is reported. A body still held is neither.
  const floating = [], moving = [], jointed = new Set(); // a body on a joint hangs from it, it does not float
  world.impulseJoints.forEach((j) => { jointed.add(j.body1().handle); jointed.add(j.body2().handle); });
  items.forEach((b, i) => {
    if (!on[i]) return;
    const v = b.body.linvel(), speed = Math.hypot(v.x, v.y, v.z) * mpu;
    let touching = false;
    for (let c = 0; c < b.body.numColliders(); c++) {
      const col = b.body.collider(c);
      world.contactPairsWith(col, (other) => world.contactPair(col, other, (m) => { for (let i = 0; i < m.numContacts(); i++) if (m.contactDist(i) * mpu <= 0.002) touching = true; }));
    }
    if (speed > 0.01) { moving.push({ name: b.name, speed: +speed.toFixed(3) }); ord.moving.push(i); }
    else if (!touching && b.body.isDynamic() && !jointed.has(b.body.handle)) { floating.push(b.name); ord.floating.push(i); }
  });
  return {
    n, dt, series, impacts,
    poses: S.map((st) => ({ s: Uint32Array.from(st.s), p: Float32Array.from(st.p) })),
    kept: keep ? JSON.parse(JSON.stringify(keep())) : undefined, // what onStep built that the set reads later (a stop time)
    report: { penetration_mm: +(deepest.depth * 1000).toFixed(2), deepest, floating, moving, settled }, // settled: how far a body moved in the pre-roll (a big number = it was placed wrong)
    ord,
  };
}

// One declared island on a restored copy of the whole world: every dynamic or kinematic body that is not the island's
// is switched off before the first step, so only the island is stepped, recorded and audited. job: { snap,
// handles, items: [{ h, name, impacts, soft, until }], duration, preroll, mpu, names }. Same function in a worker and in
// the main thread (the fallback), so both give the same numbers.
export function islandBake(RAPIER, job) {
  const w = RAPIER.World.restoreSnapshot(job.snap); // the snapshot carries the timestep, gravity and every solver setting makeSim chose
  const mine = new Set(job.handles);
  w.forEachRigidBody((b) => { if (!mine.has(b.handle) && !b.isFixed()) b.setEnabled(false); });
  const items = job.items.map((it) => ({ ...it, body: w.getRigidBody(it.h) }));
  try { return runBake(w, items, { duration: job.duration, preroll: job.preroll, mpu: job.mpu, onStep: null, kin: [], track: [], keep: null, names: job.names }); }
  finally { w.free(); }
}
