import { THREE } from "./three-vendor.js";
import { M, tone } from "./kit.js";

// Open water whose waves come from its wind: a fetch-limited sea state (JONSWAP: significant height
// Hs = 0.0016·U·√(F/g), peak frequency fp = 3.5·(g/U)·(gF/U²)^-0.33 for wind U m/s blowing over F m of water), drawn
// as a sum of Gerstner waves from half to ~11× the peak wavenumber, spread round the wind, each moving at the
// capillary-gravity speed (ω² = g·k + (σ/ρ)·k³, so the shortest ripples run faster than gravity alone gives); and
// ring ripples where drops land (impacts from particles.js rain: a 1.2 cm ring spreading at ~0.23 m/s, fading in
// ~0.6 s). A 10 m pond in 5 m/s of wind: ~8 mm waves, ~12 cm long — not a sea. Normals per pixel, so ripples are
// crisp without a dense mesh. Area x0..x1, z0..z1 at height y (units).
const G0 = 9.81, ST = 7.4e-5; // m/s², surface tension over density (m³/s²)
export const dispersion = (k) => Math.sqrt(G0 * k + ST * k ** 3); // ω (rad/s) for k (rad/m)
export function seaState(U, F) {
  const u = Math.max(U, 0.5), hs = 0.0016 * u * Math.sqrt(F / G0), fp = 3.5 * (G0 / u) * Math.pow((G0 * F) / (u * u), -0.33);
  return { hs, fp, kp: (2 * Math.PI * fp) ** 2 / G0 };
}

export function water(k, { x0, x1, z0, z1, y, wind = { speed: 3, dir: [1, 0, 0] }, fetch, color = 0x2f5560, opacity = 0.88, n = 12, seed = 11 } = {}) {
  const F = fetch ?? Math.hypot(x1 - x0, z1 - z0) * M, { hs, kp } = seaState(wind.speed, F), wd = Math.atan2(wind.dir[2], wind.dir[0]);
  const W = [], A = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { // wavenumbers from 0.5 kp up in half-octaves; directions spread wider for shorter waves
    const kk = kp * 2 ** ((i - 2) / 2), om = dispersion(kk), spread = (0.35 + 0.05 * i) * (tone(i, seed) * 2 - 1), d = wd + spread;
    const wp = dispersion(kp), amp = om ** -2.5 * Math.exp(-0.625 * (wp / om) ** 4) * Math.sqrt(om * 0.35);
    W.push([Math.cos(d), Math.sin(d), kk, om, tone(i, seed + 1) * 6.283]); A.push(amp); sum += amp * amp;
  }
  const scale = hs / 4 / Math.sqrt(sum / 2); // Hs = 4·σ, σ² = Σa²/2
  const waves = W.map((w, i) => { const a = A[i] * scale; return { dx: w[0], dz: w[1], k: w[2] * M, om: w[3], ph: w[4], a: a / M, q: 0 }; });
  const steep = waves.reduce((s, w) => s + w.k * w.a, 0);
  waves.forEach((w) => { w.q = steep > 0 ? Math.min(1, 0.7 / steep) : 0; }); // Σ Q·k·a < 1: no crest folds over itself
  const ND = 48, uniforms = {
    uT: { value: 0 }, uWa: { value: waves.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.om)) }, uWb: { value: waves.map((w) => new THREE.Vector3(w.a, w.q, w.ph)) },
    uDrop: { value: Array.from({ length: ND }, () => new THREE.Vector4(0, 0, -99, 0)) }, uRk: { value: (2 * Math.PI) / (0.012 / M) }, uRc: { value: 0.23 / M },
  };
  const glsl = `
    uniform float uT, uRk, uRc; uniform vec4 uWa[${n}]; uniform vec3 uWb[${n}]; uniform vec4 uDrop[${ND}];
    vec3 waveDisp(vec2 p) { vec3 d = vec3(0.0); for (int i = 0; i < ${n}; i++) { float th = uWa[i].z * dot(uWa[i].xy, p) - uWa[i].w * uT + uWb[i].z; d.xz += uWb[i].y * uWb[i].x * uWa[i].xy * cos(th); d.y += uWb[i].x * sin(th); } return d; }
    float ripple(vec2 p) { float h = 0.0; for (int i = 0; i < ${ND}; i++) { float age = uT - uDrop[i].z; if (age < 0.0 || age > 1.5) continue; float r = distance(p, uDrop[i].xy), front = uRc * age, w = 0.012 * ${(1 / M).toFixed(5)} + 0.4 * front; h += uDrop[i].w * exp(-age / 0.6) * cos(uRk * (r - front)) * exp(-pow((r - front) / w, 2.0)); } return h; }
    // px: the pattern's size on screen (fwidth of p): a wave shorter than ~3 px is faded out rather than drawn as
    // aliased glints (sun sparkles on single pixels read as stars, not water).
    vec3 waveNormal(vec2 p, float px) { vec3 n = vec3(0.0, 1.0, 0.0); for (int i = 0; i < ${n}; i++) { float th = uWa[i].z * dot(uWa[i].xy, p) - uWa[i].w * uT + uWb[i].z, ka = uWa[i].z * uWb[i].x * (1.0 - smoothstep(0.7, 2.0, uWa[i].z * px)); n.xz -= uWa[i].xy * ka * cos(th); n.y -= uWb[i].y * ka * sin(th); }
      float e = 0.0015 * ${(1 / M).toFixed(5)}, fade = 1.0 - smoothstep(0.7, 2.0, uRk * px); n.x -= fade * (ripple(p + vec2(e, 0.0)) - ripple(p - vec2(e, 0.0))) / (2.0 * e); n.z -= fade * (ripple(p + vec2(0.0, e)) - ripple(p - vec2(0.0, e))) / (2.0 * e); return normalize(n); }`;
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 160, 160).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0, ior: 1.33, transparent: true, opacity });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + glsl + "\nvarying vec2 vXZ;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvXZ = position.xz; transformed += waveDisp(position.xz);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + glsl + "\nvarying vec2 vXZ;").replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(waveNormal(vXZ, length(fwidth(vXZ))), 0.0)).xyz);");
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  mesh.name = "water";
  k.scene.add(mesh);
  let drops = [];
  return {
    mesh, waves, hs, kp, steepness: steep * waves[0].q,
    rain(impacts) { drops = impacts.filter((d) => d.x > x0 && d.x < x1 && d.z > z0 && d.z < z1).map((d) => ({ ...d, a: (0.0006 * (d.d / 2) ** 1.5) / M })); return drops.length; }, // a 2 mm drop: ~0.6 mm ring
    height(x, z, t) { // the surface height at (x, z), units: the same sum, for floating things and checks
      let h = 0; waves.forEach((w) => { h += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) - w.om * t + w.ph); }); return y + h;
    },
    apply(t) {
      uniforms.uT.value = t;
      const live = drops.filter((d) => d.t <= t && t - d.t < 1.5).slice(-ND);
      uniforms.uDrop.value.forEach((v, i) => { const d = live[i]; if (d) v.set(d.x, d.z, d.t, d.a); else v.set(0, 0, -99, 0); });
    },
  };
}
