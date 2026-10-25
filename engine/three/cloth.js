import { THREE } from "./three-vendor.js";
import { M, G } from "./kit.js";

// A curtain as real cloth, simulated before the first frame and replayed (the same every render): a grid of
// particles hung from the rod by its top row, held together by stretch, shear and bend constraints (the bend rest
// shape keeps its pleats), pulled by gravity, pushed by the air through drag on each patch of cloth (½ρ·Cd·A·v²
// across the cloth, a little skin friction along it, and still air damps it), and kept off the wall behind.
// Light cotton, 120 g/m², in real units (mpu: metres per scene unit). Position-based dynamics at 240 Hz, a 2 s pre-roll so it has settled into the airflow.
export function bakeCurtain({ cx, width, top, length, z, wall, wind, duration, mpu = M, preroll = 2, cols = 14, rows = 32, pleat = 0.012, gsm = 0.12 }) {
  const n = cols * rows, P = new Float64Array(n * 3), Q = new Float64Array(n * 3), N = new Float64Array(n * 3), C = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = cx - width / 2 + (i * width) / (cols - 1), k = (j * cols + i) * 3;
    P[k] = Q[k] = x; P[k + 1] = Q[k + 1] = top - (j * length) / (rows - 1); P[k + 2] = Q[k + 2] = z + pleat * Math.sin((x - cx) * 95);
  }
  const id = (i, j) => j * cols + i, dist = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  const link = (a, b, s) => C.push([a, b, dist(a, b), s]);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (i + 1 < cols) link(id(i, j), id(i + 1, j), 1);
    if (j + 1 < rows) link(id(i, j), id(i, j + 1), 1);
    if (i + 1 < cols && j + 1 < rows) { link(id(i, j), id(i + 1, j + 1), 0.8); link(id(i + 1, j), id(i, j + 1), 0.8); }
    if (i + 2 < cols) link(id(i, j), id(i + 2, j), 0.25);
    if (j + 2 < rows) link(id(i, j), id(i, j + 2), 0.25);
  }
  const CA = Int32Array.from(C, (c) => c[0]), CB = Int32Array.from(C, (c) => c[1]), CR = Float64Array.from(C, (c) => c[2]), CS = Float64Array.from(C, (c) => c[3]);
  let fabric = 0;
  for (let i = 0; i + 1 < cols; i++) fabric += dist(id(i, 0), id(i + 1, 0));
  const area = (fabric * length * mpu * mpu) / n, m = gsm * area, grav = (G * M) / mpu, // the kit's gravity (m/s²) in these units // area and mass real (m², kg); positions in units
    dt = 1 / 240, keep = 2, frames = [], u = new THREE.Vector3(), p = new THREE.Vector3();
  const steps = Math.round((preroll + duration) / dt);
  for (let s = 0; s <= steps; s++) {
    const t = s * dt - preroll;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { // normals from the neighbours
      const a = id(Math.max(0, i - 1), j) * 3, b = id(Math.min(cols - 1, i + 1), j) * 3, c = id(i, Math.max(0, j - 1)) * 3, d = id(i, Math.min(rows - 1, j + 1)) * 3, k = id(i, j) * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[c], vy = P[d + 1] - P[c + 1], vz = P[d + 2] - P[c + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      N[k] = nx / l; N[k + 1] = ny / l; N[k + 2] = nz / l;
    }
    for (let q = cols; q < n; q++) { // the top row hangs on the rod
      const k = q * 3, vx = (P[k] - Q[k]) / dt, vy = (P[k + 1] - Q[k + 1]) / dt, vz = (P[k + 2] - Q[k + 2]) / dt;
      wind(p.set(P[k], P[k + 1], P[k + 2]), Math.max(t, -preroll), u);
      const rx = (u.x - vx) * mpu, ry = (u.y - vy) * mpu, rz = (u.z - vz) * mpu, vn = rx * N[k] + ry * N[k + 1] + rz * N[k + 2]; // relative air, m/s
      const fn = 0.5 * 1.2 * 1.2 * area * vn * Math.abs(vn), tx = rx - vn * N[k], ty = ry - vn * N[k + 1], tz = rz - vn * N[k + 2], ft = 0.5 * 1.2 * 0.05 * area * Math.hypot(tx, ty, tz);
      const ax = (fn * N[k] + ft * tx) / m / mpu, ay = (fn * N[k + 1] + ft * ty) / m / mpu - grav, az = (fn * N[k + 2] + ft * tz) / m / mpu; // back to units/s²
      const x0 = P[k], y0 = P[k + 1], z0 = P[k + 2];
      P[k] += (x0 - Q[k]) * 0.999 + ax * dt * dt; P[k + 1] += (y0 - Q[k + 1]) * 0.999 + ay * dt * dt; P[k + 2] += (z0 - Q[k + 2]) * 0.999 + az * dt * dt;
      Q[k] = x0; Q[k + 1] = y0; Q[k + 2] = z0;
    }
    for (let it = 0; it < 8; it++) {
      for (let c = 0; c < CA.length; c++) {
        const a = CA[c], b = CB[c], r = CR[c], st = CS[c], ka = a * 3, kb = b * 3, dx = P[kb] - P[ka], dy = P[kb + 1] - P[ka + 1], dz = P[kb + 2] - P[ka + 2], l = Math.hypot(dx, dy, dz) || 1e-9;
        const wa = a < cols ? 0 : 1, wb = b < cols ? 0 : 1, w = wa + wb;
        if (!w) continue;
        const f = (st * (l - r)) / (l * w);
        P[ka] += dx * f * wa; P[ka + 1] += dy * f * wa; P[ka + 2] += dz * f * wa;
        P[kb] -= dx * f * wb; P[kb + 1] -= dy * f * wb; P[kb + 2] -= dz * f * wb;
      }
      for (let q = cols; q < n; q++) if (P[q * 3 + 2] < wall + 0.004) P[q * 3 + 2] = wall + 0.004; // the wall behind
    }
    if (t >= 0 && s % keep === 0) frames.push(Float32Array.from(P));
  }
  // Drawn 3× finer than simulated: a Catmull-Rom spline through the particles both ways, so folds are smooth
  // curves, not the simulation grid's facets.
  const R = 3, gc = (cols - 1) * R + 1, gr = (rows - 1) * R + 1, g = new THREE.PlaneGeometry(width, length, gc - 1, gr - 1), pos = g.attributes.position, fps = 1 / (dt * keep);
  const cur = new Float32Array(n * 3), row = new Float64Array(gc * rows * 3);
  const cr = (p0, p1, p2, p3, u) => 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
  function draw() {
    for (let j = 0; j < rows; j++) for (let x = 0; x < gc; x++) { // along each row
      const f = x / R, i = Math.min(cols - 2, Math.floor(f)), u = f - i, c = (k) => Math.min(cols - 1, Math.max(0, k));
      for (let d = 0; d < 3; d++) row[(j * gc + x) * 3 + d] = cr(cur[(j * cols + c(i - 1)) * 3 + d], cur[(j * cols + i) * 3 + d], cur[(j * cols + c(i + 1)) * 3 + d], cur[(j * cols + c(i + 2)) * 3 + d], u);
    }
    for (let y = 0; y < gr; y++) for (let x = 0; x < gc; x++) { // then down each column
      const f = y / R, j = Math.min(rows - 2, Math.floor(f)), v = f - j, c = (k) => Math.min(rows - 1, Math.max(0, k));
      for (let d = 0; d < 3; d++) pos.array[(y * gc + x) * 3 + d] = cr(row[(c(j - 1) * gc + x) * 3 + d], row[(j * gc + x) * 3 + d], row[(c(j + 1) * gc + x) * 3 + d], row[(c(j + 2) * gc + x) * 3 + d], v);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
  cur.set(frames[0]);
  draw();
  return {
    geometry: g,
    apply(t) { // between the two stored states around t
      const x = Math.min(frames.length - 1.001, Math.max(0, t * fps)), i = Math.floor(x), f = x - i, A = frames[i], B = frames[i + 1];
      for (let k = 0; k < A.length; k++) cur[k] = A[k] + (B[k] - A[k]) * f;
      draw();
    },
    travel: (t) => { const a = frames[Math.max(0, Math.floor(t * fps))], b = frames[Math.min(frames.length - 1, Math.floor(t * fps) + Math.round(fps / 24))]; let d = 0; for (let k = 0; k < a.length; k += 3) d = Math.max(d, Math.hypot(b[k] - a[k], b[k + 1] - a[k + 1], b[k + 2] - a[k + 2])); return d; },
  };
}
