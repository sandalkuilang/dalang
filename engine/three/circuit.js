import { THREE } from "./three-vendor.js";
import { M, G, tone } from "./kit.js";

// Electricity made visible, caused by the film's numbers model and never keyframed: every `at(t)` is a pure function of
// t, so the render can seek any frame. Sizes in metres, positions in scene units (1/M per metre), lights in candela,
// temperatures in kelvin. Nothing here adds itself to the scene: add `group` where it belongs. Current, voltage,
// power and energy are read from the model with their sources; this file holds only the physics of how they are shown.
//
//   const { state } = await import("../model.mjs");                                  // state(t) → { Iac, Idc, V, P, ... }
//   const w = wire([a, b, c], { kind: "trace" });                                    // a PCB trace along 3 points
//   const f = flow(w, { current: (t) => state(t).Iac, waveform: "ac", freq: 50, speed: 0.5, timeScale: 0.1 });
//   lamp(bulbLight, { rated: { V: 230, lm: 800 }, voltage: (t) => state(t).V }); set.add(w.group, f.group);
//   // each frame: f.at(t); put f.label on screen — the pulse speed and the slowed frequency are said, not hidden.

const SIGMA = 5.670374419e-8; // Stefan-Boltzmann constant, W/(m² K⁴)
const C2 = 1.4388e-2; // second radiation constant hc/k, m·K
export const DRAPER = 798; // K: the faintest visible glow of a hot body (Draper point)
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const positive = (v) => finite(v) && v > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const linear = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

// Black-body colour: Planck's law weighted by the CIE 1931 colour-matching functions (the multi-lobe fit of Wyman,
// Sloan and Shirley, JCGT 2(2) 2013), then XYZ to linear sRGB (IEC 61966-2-1). `color` is the hue with its largest
// channel at 1 (linear); `Y` is the relative luminance, to compare two temperatures by their ratio only.
const lobe = (x, m, s1, s2) => { const t = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
const cmf = (l) => [
  1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
  0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
  1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8)];
export function blackbody(T) {
  if (!positive(T)) throw new Error(`blackbody: T must be a finite temperature in K > 0, got ${T}`);
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const lm = l * 1e-9, B = 1 / (lm ** 5 * (Math.exp(C2 / (lm * T)) - 1)); // Planck, up to a constant
    const [x, y, z] = cmf(l); X += B * x; Y += B * y; Z += B * z;
  }
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  const mx = Math.max(r, g, b);
  if (!(mx > 0)) return { color: linear(0, 0, 0), Y: 0 };
  return { color: linear(Math.max(0, r) / mx, Math.max(0, g) / mx, Math.max(0, b) / mx), Y };
}

// ---- wire -------------------------------------------------------------------------------------------------------

// Typical radii in metres (a ~0.8 mm PCB trace, a ~3 mm insulated mains core, a 8 mm busbar): override `radius` from the
// real part.
const WIRE = {
  trace: { radius: 0.0004, color: 0xb87333, metalness: 1, roughness: 0.35 },
  wire: { radius: 0.0015, color: 0x2b2b2b, metalness: 0, roughness: 0.6 },
  busbar: { radius: 0.004, color: 0xb87333, metalness: 1, roughness: 0.35 },
};

// A trace, wire or busbar along `path`: an array of ≥ 2 points (scene units, straight legs with corners, as traces
// have) or a THREE.Curve. `normal` is the surface it lies on (default +Y): flow ribbons lie in that surface.
// Returns { group, meshes, curve, kind, radius, length (m), normal, pointAt(s), frameAt(s) }; s in metres from the start.
export function wire(path, { kind = "trace", radius, color, normal = new THREE.Vector3(0, 1, 0) } = {}) {
  if (!WIRE[kind]) throw new Error(`wire: kind must be one of ${Object.keys(WIRE).join(", ")}, got ${kind}`);
  const spec = WIRE[kind], r = radius ?? spec.radius;
  if (!positive(r)) throw new Error(`wire: radius (m) must be a finite number > 0, got ${radius}`);
  let curve;
  if (Array.isArray(path)) {
    if (path.length < 2 || !path.every((p) => p?.isVector3)) throw new Error("wire: path needs at least 2 THREE.Vector3 points in scene units");
    curve = new THREE.CurvePath();
    for (let i = 1; i < path.length; i++) if (path[i].distanceTo(path[i - 1]) > 0) curve.add(new THREE.LineCurve3(path[i - 1].clone(), path[i].clone()));
  } else if (path?.isCurve) curve = path;
  else throw new Error("wire: path is an array of THREE.Vector3 or a THREE.Curve");
  const lengthUnits = curve.curves?.length === 0 ? 0 : curve.getLength(), length = lengthUnits * M;
  if (!(length > 1e-9)) throw new Error("wire: the path has zero length");
  const n = normal.clone().normalize(), group = new THREE.Group(), meshes = [];
  group.name = kind;
  const material = new THREE.MeshStandardMaterial({ color: color ?? spec.color, metalness: spec.metalness, roughness: spec.roughness });
  const legs = curve.isCurvePath ? curve.curves : [curve];
  for (const leg of legs) {
    const straight = leg.isLineCurve3, segs = straight ? 1 : clamp(Math.ceil(leg.getLength() * M * 400), 24, 400);
    const m = new THREE.Mesh(new THREE.TubeGeometry(leg, segs, r / M, 8), material);
    meshes.push(m); group.add(m);
  }
  if (curve.isCurvePath) for (let i = 1; i < legs.length; i++) { // a round joint at each corner, so the corner is not an open end
    const j = new THREE.Mesh(new THREE.SphereGeometry(r / M, 8, 6), material);
    j.position.copy(legs[i].getPoint(0)); meshes.push(j); group.add(j);
  }
  const pointAt = (s) => curve.getPointAt(clamp(s / length, 0, 1));
  const frameAt = (s) => {
    const e = length * 1e-4, point = pointAt(s);
    const tangent = pointAt(s + e).sub(pointAt(s - e)).normalize();
    let side = new THREE.Vector3().crossVectors(n, tangent);
    if (!(side.lengthSq() > 1e-12)) side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), tangent);
    return { point, tangent, side: side.normalize() };
  };
  return { group, meshes, curve, kind, radius: r, length, normal: n, pointAt, frameAt };
}

// ---- flow -------------------------------------------------------------------------------------------------------

const WAVEFORMS = ["ac", "dc", "pwm", "3phase"];
const COLORS = { ac: [0xffb347], dc: [0x58c4ff], pwm: [0x9dff6a], "3phase": [0xe0563b, 0xf2c94c, 0x4f8ef7] };
const NAMES = { ac: "AC", dc: "DC", pwm: "PWM", "3phase": "3-phase" };
const frac = (x) => x - Math.floor(x);

// Pulses travelling along a wire. The SHAPE is the waveform: ac a sine wiggle across the wire (wavelength = speed /
// shown frequency), dc a straight line, pwm chopped blocks (on for `duty` of each period), 3phase three ribbons a
// third of a period apart. Width and brightness follow |current(t)|: `current` is the dc value or the ac RMS envelope
// in amperes (the waveform supplies the oscillation); `perAmp` m of width per ampere on top of `width`; `full` is the
// current that reaches full brightness, the film's one scale (two flows in one film share it; without it brightness
// stays at 1). No current draws no ribbon.
// `speed` is the visualisation speed in m/s that the pulses travel at — said on screen, because it is not the drift
// velocity of the charge. Mains frequency cannot be seen at 30 fps: `timeScale` slows it on purpose (shown frequency =
// freq × timeScale) and the flow refuses (/alias/) a shown frequency above fps / 4, fewer than 4 frames a period.
// `amplitude` m is the height of the wiggle. `lift` m is the height above the wire's surface (default its radius + 0.5 mm).
// Returns { group, ribbons: [{ mesh }], sample(t, n), at(t), lambda, shownFreq, waveform, label }. Put `label` on screen.
export function flow(w, { current, waveform = "dc", freq, speed, timeScale = 1, fps = 30, amplitude = 0.004, duty = 0.5, full, width = 0.002, perAmp = 0, color, samples = 240, lift } = {}) {
  if (!w?.curve || !w.pointAt) throw new Error("flow: first argument is a wire()");
  if (!WAVEFORMS.includes(waveform)) throw new Error(`flow: waveform must be one of ${WAVEFORMS.join(", ")}, got ${waveform}`);
  if (typeof current !== "function") throw new Error("flow: current(t) is a function returning amperes (from the numbers model)");
  if (!positive(speed)) throw new Error(`flow: speed (m/s, the stated visualisation speed) must be a finite number > 0, got ${speed}`);
  for (const [k, v] of Object.entries({ timeScale, fps, amplitude, width })) if (!positive(v)) throw new Error(`flow: ${k} must be a finite number > 0, got ${v}`);
  if (!finite(perAmp) || perAmp < 0) throw new Error(`flow: perAmp must be a finite number >= 0, got ${perAmp}`);
  if (full !== undefined && !positive(full)) throw new Error(`flow: full (the current at full brightness) must be a finite number > 0, got ${full}`);
  if (!(duty > 0 && duty < 1)) throw new Error(`flow: duty must be between 0 and 1, got ${duty}`);
  if (!Number.isInteger(samples) || samples < 8) throw new Error(`flow: samples must be an integer >= 8, got ${samples}`);
  const oscillates = waveform !== "dc";
  if (oscillates && !positive(freq)) throw new Error(`flow: freq (Hz) must be a finite number > 0 for ${waveform}, got ${freq}`);
  const shownFreq = oscillates ? freq * timeScale : 0, lambda = oscillates ? speed / shownFreq : Infinity;
  if (oscillates && shownFreq > fps / 4) throw new Error(`flow: ${freq} Hz x timeScale ${timeScale} = ${shownFreq} Hz shown would alias at ${fps} fps (fewer than 4 frames a period): slow it with a smaller timeScale and say so on screen`);
  if (oscillates && lambda < 6 * w.length / (samples - 1)) throw new Error(`flow: a wavelength of ${lambda} m alias on ${samples} samples along ${w.length} m: raise samples or slow the speed`);
  const lifted = (lift ?? w.radius + 0.0005);
  const phases = waveform === "3phase" ? 3 : 1, colors = color === undefined ? COLORS[waveform] : [].concat(color);
  const phase = (t, s) => 2 * Math.PI * shownFreq * (t - s / speed);
  const shape = (k, s, t) => {
    if (waveform === "ac") return { y: amplitude * Math.sin(phase(t, s)), on: true };
    if (waveform === "3phase") return { y: (k - 1) * 3 * amplitude + amplitude * Math.sin(phase(t, s) - 2 * Math.PI * k / 3), on: true };
    if (waveform === "pwm") return { y: 0, on: frac(phase(t, s) / (2 * Math.PI)) < duty };
    return { y: 0, on: true };
  };
  const sample = (t, n = samples) => {
    if (!finite(t)) throw new Error(`flow: t must be finite, got ${t}`);
    return Array.from({ length: phases }, (_, k) => Array.from({ length: n }, (_, i) => { const s = w.length * i / (n - 1); return { s, ...shape(k, s, t) }; }));
  };
  // Geometry: one strip per ribbon; the grid along the wire is fixed, so its frames are computed once.
  const frames = Array.from({ length: samples }, (_, i) => w.frameAt(w.length * i / (samples - 1)));
  const group = new THREE.Group(), ribbons = [];
  group.name = "flow";
  for (let k = 0; k < phases; k++) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(samples * 2 * 3), nor = new Float32Array(samples * 2 * 3), idx = new Uint32Array((samples - 1) * 6);
    for (let v = 0; v < samples * 2; v++) nor.set([w.normal.x, w.normal.y, w.normal.z], v * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const c = colors[k % colors.length], mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.name = `${waveform} ${k}`;
    group.add(mesh); ribbons.push({ mesh, pos, idx });
  }
  const label = [
    oscillates ? `${NAMES[waveform]} ${freq} Hz${timeScale === 1 ? "" : ` shown at ${Math.abs(1 / timeScale - Math.round(1 / timeScale)) < 1e-6 && timeScale < 1 ? `1/${Math.round(1 / timeScale)}` : `${+timeScale.toPrecision(3)}x`} speed`}` : NAMES[waveform],
    `pulses at ${speed} m/s for visualisation, not drift velocity`].join("; ");
  const at = (t) => {
    const i = current(t);
    if (!finite(i)) throw new Error(`flow: current(${t}) must be a finite number of amperes, got ${i}`);
    const a = Math.abs(i), halfWidth = (width + perAmp * a) / 2, brightness = full ? Math.min(1, a / full) : 1;
    const rows = sample(t);
    ribbons.forEach(({ mesh, pos, idx }, k) => {
      mesh.visible = a > 0;
      if (!(a > 0)) return;
      mesh.material.emissiveIntensity = brightness; mesh.material.opacity = 0.25 + 0.75 * brightness;
      for (let n = 0; n < samples; n++) {
        const { point, side } = frames[n], p = rows[k][n], hw = (p.on ? halfWidth : 0) / M, y = p.y / M, up = lifted / M;
        for (const [j, sgn] of [[0, -1], [1, 1]]) {
          const o = (n * 2 + j) * 3;
          pos[o] = point.x + side.x * (y + sgn * hw) + w.normal.x * up;
          pos[o + 1] = point.y + side.y * (y + sgn * hw) + w.normal.y * up;
          pos[o + 2] = point.z + side.z * (y + sgn * hw) + w.normal.z * up;
        }
      }
      for (let n = 0, o = 0; n < samples - 1; n++, o += 6) { // a quad exists only between two samples that are on
        const q = rows[k][n].on && rows[k][n + 1].on, a0 = n * 2;
        idx.set(q ? [a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2] : [0, 0, 0, 0, 0, 0], o);
      }
      mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.index.needsUpdate = true;
    });
    return { current: i, halfWidth, brightness };
  };
  return { group, ribbons, sample, at, lambda, shownFreq, waveform, label };
}

// ---- glow -------------------------------------------------------------------------------------------------------

// The eye and a display cannot show Planck's growth (a million times brighter from 1000 K to 3000 K): the emissive
// intensity follows the log of the luminance, from 0 at the Draper point to 2 (about the lit-shade glow of the kit)
// at 2000 K, and at most 3.
const Yd = blackbody(DRAPER).Y, Yr = blackbody(2000).Y;
const glowLevel = (T) => (T < DRAPER ? 0 : clamp(Math.log(blackbody(T).Y / Yd) / Math.log(Yr / Yd), 0, 1.5) * 2);

// A hot part glows by black-body colour. Give `power(t)` W (the part's heat output, from the model) and `area` m² (its
// radiating surface): the temperature is the STEADY state of P = h A (T − T0) + ε σ A (T⁴ − T0⁴) — a part with thermal
// mass lags behind this, so when a heat model (heat.js) provides T over time give `temperature(t)` K instead.
// h = 10 W/m²K natural convection in still air and ε = 0.9 are typical (5–25 for h): override from the part.
// A power(t) that is not a finite number (NaN, undefined: a misspelt state key) is refused with the field named, never
// drawn as a cold part; zero or negative power is no heat output (ambient). h must be >= 0 and emissivity in (0, 1].
// The mesh's material is cloned once, so a shared material is never written. `at(t)` → { T, intensity }.
export function glow(mesh, { power, temperature, area, emissivity = 0.9, h = 10, ambient = 293.15, exposure = 1 } = {}) {
  if (!mesh?.material?.emissive) throw new Error("glow: first argument is a Mesh whose material has an emissive colour");
  if (typeof power !== "function" && typeof temperature !== "function") throw new Error("glow: power(t) in W (or temperature(t) in K) is required, from the numbers model");
  if (typeof temperature !== "function" && !positive(area)) throw new Error(`glow: area (m², the radiating surface) must be a finite number > 0, got ${area}`);
  if (!positive(ambient) || !positive(exposure)) throw new Error("glow: ambient (K) and exposure must be finite numbers > 0");
  if (typeof power === "function" && typeof temperature !== "function") {
    if (!finite(h) || h < 0) throw new Error(`glow: h (W/m²K, convection) must be a finite number >= 0, got ${h}`);
    if (!(finite(emissivity) && emissivity > 0 && emissivity <= 1)) throw new Error(`glow: emissivity must be a finite number in (0, 1], got ${emissivity}`);
  }
  mesh.material = mesh.material.clone();
  const lost = (T) => h * area * (T - ambient) + emissivity * SIGMA * area * (T ** 4 - ambient ** 4);
  const solve = (P) => {
    if (P <= 0) return ambient; // no heat output (P is finite: T() refused anything else)
    if (P >= lost(5000)) return 5000;
    let lo = ambient, hi = 5000;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (lost(mid) < P) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  const T = (t) => {
    let v;
    if (typeof temperature === "function") v = temperature(t);
    else {
      const P = power(t);
      if (!finite(P)) throw new Error(`glow: power(${t}) must be a finite number of watts, got ${P}; the model returned a bad value (a misspelt state key?)`);
      v = solve(P);
    }
    if (!finite(v)) throw new Error(`glow: the temperature at t=${t} is not a finite number (${v}); the power or temperature model returned a bad value`);
    return Math.max(ambient, v);
  };
  const at = (t) => {
    const K = T(t), intensity = exposure * glowLevel(K);
    if (K >= DRAPER) mesh.material.emissive.copy(blackbody(K).color); else mesh.material.emissive.setRGB(0, 0, 0);
    mesh.material.emissiveIntensity = intensity;
    return { T: K, intensity };
  };
  return { at, temperature: T };
}

// ---- lamp -------------------------------------------------------------------------------------------------------

// Light output against voltage, per lamp type, with its source. An incandescent filament: flux ∝ V^3.4 and colour
// temperature ∝ V^0.42. Any other lamp (a LED driver, a CFL, a halogen) gives the datasheet's table as `curve`.
export const LAMPS = {
  incandescent: {
    exponent: 3.4, cct: 0.42,
    src: "https://en.wikipedia.org/wiki/Incandescent_light_bulb (Light output and lifetime: flux ∝ V^3.4, colour temperature ∝ V^0.42), accessed 2026-10-27",
  },
};

// A light whose output follows the supply voltage: `voltage(t)` in V (from the model). `rated = { V, lm }` fixes an
// incandescent type's curve; `curve = [[V, lm], ...]` sorted by V (linear between points, held past the last, zero at or
// below 0 V, linear to 0 V below the first point) takes any other lamp. `cct` K is the colour temperature at the rated
// voltage (incandescent colour then cools with the voltage). A lamp radiating evenly: intensity (cd) = lumens / 4π.
// The light is kept in the scene: it is switched by intensity 0, never removed. `at(t)` → { V, lm, intensity }.
export function lamp(light, { type, curve, rated, voltage, cct = 2700 } = {}) {
  if (!light?.isLight) throw new Error("lamp: first argument is a THREE light (PointLight or SpotLight)");
  if (typeof voltage !== "function") throw new Error("lamp: voltage(t) in V is a function from the numbers model");
  if (!positive(cct)) throw new Error(`lamp: cct (K, the colour temperature at the rated voltage) must be a finite number > 0, got ${cct}`);
  let output, kind;
  if (curve !== undefined) {
    if (!Array.isArray(curve) || curve.length < 2 || !curve.every((p, i) => Array.isArray(p) && finite(p[0]) && finite(p[1]) && p[1] >= 0 && (i === 0 || p[0] > curve[i - 1][0]))) throw new Error("lamp: curve is [[V, lm], ...] with at least 2 points, V ascending");
    output = (V) => {
      if (!(V > 0)) return 0;
      if (V <= curve[0][0]) return curve[0][1] * V / curve[0][0];
      for (let i = 1; i < curve.length; i++) if (V <= curve[i][0]) { const [v0, l0] = curve[i - 1], [v1, l1] = curve[i]; return l0 + (l1 - l0) * (V - v0) / (v1 - v0); }
      return curve[curve.length - 1][1];
    };
  } else {
    kind = type ?? "incandescent";
    if (!LAMPS[kind]) throw new Error(`lamp: no cited curve for type "${kind}" (known: ${Object.keys(LAMPS).join(", ")}): give its datasheet table as curve`);
    if (!positive(rated?.V) || !positive(rated?.lm)) throw new Error("lamp: rated = { V, lm } (finite, > 0) is required, or a curve");
    output = (V) => rated.lm * Math.max(0, V / rated.V) ** LAMPS[kind].exponent;
  }
  const at = (t) => {
    const V = voltage(t);
    if (!finite(V)) throw new Error(`lamp: voltage(${t}) must be a finite number of volts, got ${V}`);
    const lm = output(V);
    light.intensity = lm / (4 * Math.PI);
    if (kind && V > 0) light.color.copy(blackbody(cct * (V / rated.V) ** LAMPS[kind].cct).color);
    return { V, lm, intensity: light.intensity };
  };
  return { at, output, src: kind ? LAMPS[kind].src : "the lamp's own datasheet curve" };
}

// ---- arc --------------------------------------------------------------------------------------------------------

// Seeded midpoint displacement from p to q: each level inserts every segment's midpoint pushed sideways by up to 0.25 of
// that segment's length. Returns the polyline's points.
function jag(p, q, levels, seed) {
  let pts = [p.clone(), q.clone()];
  for (let l = 0; l < levels; l++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = b.clone().sub(a), len = d.length(), dir = d.clone().normalize();
      const e1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const e2 = new THREE.Vector3().crossVectors(dir, e1), ang = 2 * Math.PI * tone(i + l * 64, seed), push = 0.25 * len * (2 * tone(i + l * 64 + 0.5, seed + 3) - 1);
      next.push(a.clone().add(b).multiplyScalar(0.5).addScaledVector(e1, push * Math.cos(ang)).addScaledVector(e2, push * Math.sin(ang)), b);
    }
    pts = next;
  }
  return pts;
}

// A brief branching discharge from `from` to `to` (scene units) at film time `t0`, lasting `dur` real seconds and
// shown for dur / timeScale. It lights the scene only inside that window: one PointLight (kept, intensity 0 outside)
// of efficacy (lm/W) × energy (J) / dur lumens, radiating evenly. `energy` and `efficacy` have NO default: they come
// from the numbers model with a source. An arc shown for less than one frame is never seen: refused (/frame/), slow it
// with `timeScale` and say so on screen. The channel is seeded (same seed, same flash) with `branches` side branches.
// Sparks are ballistic points flung from the middle in real time (closed form, gravity G, no drag), born at t0 at
// 1–4 m/s over the upper hemisphere, cooling from `sparkTemp` K with time constant `cool` s; they show by black-body
// colour until they cool below the Draper point; `ground` (scene units, height) stops them. These speeds and the
// 2000 K are typical, not cited: override from the event. `events` is the sfx.js event row of the flash.
// `k` (the kit) is accepted for symmetry with the other builders and not needed. Returns
// { group, light, channel, sparks: { points }, at(t), on(t), events, label }; `at` → { on, intensity, sparksLit }.
export function arc(k, { from, to, t0, dur, energy, efficacy, timeScale = 1, fps = 30, seed = 1, branches = 3, sparks = 40, sparkSpeed = [1, 4], sparkTemp = 2000, cool = 0.25, ground } = {}) {
  if (!from?.isVector3 || !to?.isVector3) throw new Error("arc: from and to are THREE.Vector3 in scene units");
  if (!(from.distanceTo(to) > 0)) throw new Error("arc: from and to are the same point");
  if (!finite(t0)) throw new Error(`arc: t0 (film time, s) must be finite, got ${t0}`);
  if (!positive(dur) || !positive(timeScale) || !positive(fps)) throw new Error("arc: dur (real s), timeScale and fps must be finite numbers > 0");
  if (!positive(energy)) throw new Error(`arc: energy (J) must be a finite number > 0, got ${energy}; it comes from the numbers model with a source, there is no default`);
  if (!positive(efficacy)) throw new Error(`arc: efficacy (lm/W) must be a finite number > 0, got ${efficacy}; it comes from the numbers model with a source, there is no default`);
  const shown = dur / timeScale;
  if (shown < 1 / fps) throw new Error(`arc: shown for ${shown} s it lasts less than one frame (1/${fps} s) and would never be seen: slow it with timeScale and show the change on screen`);
  if (!finite(seed) || !Number.isInteger(branches) || branches < 0 || !Number.isInteger(sparks) || sparks < 0) throw new Error("arc: seed must be finite, branches and sparks integers >= 0");
  if (!Array.isArray(sparkSpeed) || !(sparkSpeed[0] > 0 && sparkSpeed[1] >= sparkSpeed[0]) || !positive(sparkTemp) || !positive(cool)) throw new Error("arc: sparkSpeed [min, max] m/s, sparkTemp K and cool s must be positive");
  const group = new THREE.Group(), mid = from.clone().add(to).multiplyScalar(0.5), span = from.distanceTo(to);
  group.name = "arc";
  // channel: the main path and its side branches, as line segments
  const main = jag(from, to, 5, seed), lines = [main];
  for (let b = 0; b < branches; b++) {
    const i = 1 + Math.floor(tone(b * 5 + 1, seed + 11) * (main.length - 2)), a = main[i], dir = to.clone().sub(from).normalize();
    const e1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const e2 = new THREE.Vector3().crossVectors(dir, e1), ang = 2 * Math.PI * tone(b * 3 + 2, seed + 5);
    const out = dir.clone().multiplyScalar(0.6).addScaledVector(e1, 0.8 * Math.cos(ang)).addScaledVector(e2, 0.8 * Math.sin(ang)).normalize();
    lines.push(jag(a, a.clone().addScaledVector(out, span * (0.2 + 0.2 * tone(b * 7 + 3, seed + 9))), 3, seed + b + 1));
  }
  const verts = [];
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) verts.push(l[i].x, l[i].y, l[i].z, l[i + 1].x, l[i + 1].y, l[i + 1].z);
  const cg = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const channel = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xdfe8ff, toneMapped: false }));
  channel.visible = false; channel.frustumCulled = false;
  const light = new THREE.PointLight(0xdfe8ff, 0);
  light.position.copy(mid);
  // sparks: velocity per spark (scene units per real s), upper hemisphere
  const vel = Array.from({ length: sparks }, (_, i) => {
    const cosT = tone(i * 3 + 1, seed + 21), sinT = Math.sqrt(1 - cosT * cosT), phi = 2 * Math.PI * tone(i * 3 + 2, seed + 22);
    const sp = (sparkSpeed[0] + (sparkSpeed[1] - sparkSpeed[0]) * tone(i * 3 + 3, seed + 23)) / M;
    return [sp * sinT * Math.cos(phi), sp * cosT, sp * sinT * Math.sin(phi)];
  });
  const pg = new THREE.BufferGeometry(), ppos = new Float32Array(sparks * 3), pcol = new Float32Array(sparks * 3);
  pg.setAttribute("position", new THREE.BufferAttribute(ppos, 3)); pg.setAttribute("color", new THREE.BufferAttribute(pcol, 3));
  const points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  points.frustumCulled = false; points.visible = false;
  group.add(channel, light, points);
  const on = (t) => t >= t0 && t < t0 + shown;
  const peak = (efficacy * energy) / dur / (4 * Math.PI);
  const at = (t) => {
    if (!finite(t)) throw new Error(`arc: t must be finite, got ${t}`);
    const lit = on(t);
    light.intensity = lit ? peak : 0; channel.visible = lit;
    const tau = (t - t0) * timeScale, born = t >= t0, T = born ? sparkTemp * Math.exp(-tau / cool) : 0;
    const bright = born && T >= DRAPER ? clamp((T - DRAPER) / (sparkTemp - DRAPER), 0, 1) : 0, col = bright > 0 ? blackbody(T).color : null;
    for (let i = 0; i < sparks; i++) {
      const tt = born ? tau : 0, v = vel[i];
      ppos[i * 3] = mid.x + v[0] * tt;
      ppos[i * 3 + 1] = mid.y + v[1] * tt - 0.5 * G * tt * tt;
      ppos[i * 3 + 2] = mid.z + v[2] * tt;
      if (ground !== undefined && ppos[i * 3 + 1] < ground) ppos[i * 3 + 1] = ground;
      pcol[i * 3] = col ? col.r * bright : 0; pcol[i * 3 + 1] = col ? col.g * bright : 0; pcol[i * 3 + 2] = col ? col.b * bright : 0;
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
    const sparksLit = bright > 0 ? sparks : 0;
    points.visible = sparksLit > 0;
    return { on: lit, intensity: light.intensity, sparksLit };
  };
  const label = timeScale === 1 ? "" : `arc of ${dur * 1000} ms shown at ${+timeScale.toPrecision(3)}x speed`;
  return { group, light, channel, sparks: { points }, at, on, events: [{ kind: "custom", tag: "arc-flash", t: t0, dv: 1 }], label };
}

// ---- failure ----------------------------------------------------------------------------------------------------

const FAILURES = ["bulge", "blown", "char", "melt"];
const SOOT = 0x1b1a18, CHAR = 0x15110e;

// A part that fails at the model's event time: `at` (s, film time) comes from the numbers model's event, never typed in
// the scene. The variant is built ONCE (geometry and material cloned, so the part's own are never written) beside the
// part, hidden; `at(t)` shows the part before the event and the variant from it, a pure function of t (a seek back shows
// the part again). `part` is a Mesh with one material; with no parent the caller adds `failed` where the part is.
// `amount` in (0, 1] is how far it went. Typical proportions, not cited: override from the part's own failure.
//   "bulge": a capacitor (a cylinder along local +Y): the top 15 % domes up by amount × 0.08 × radius and swells 3 %
//            sideways; `vent: true` adds the dark cross of a scored, vented top.
//   "blown": a fuse wire (along local +X): two pieces with the middle amount × 30 % of the length gone, and a soot mark
//            (radius `soot` in scene units, default half the gap) at the gap.
//   "char":  a resistor or varistor: the colour burnt toward black by amount × 85 %, dull and not metallic.
//   "melt":  a connector (along local +Y): the top sags by up to amount × 25 % of its height, the base spreads, 30 % darker.
// Returns { normal: part, failed, kind, when, at(t) }; `failed` is a Mesh (a Group with `userData.pieces` and
// `userData.soot` for "blown").
export function failure(part, { kind, at, amount = 1, vent = false, soot } = {}) {
  if (!part?.isMesh || !part.geometry?.attributes?.position || !part.material?.color) throw new Error("failure: first argument is a Mesh with one coloured material");
  if (!FAILURES.includes(kind)) throw new Error(`failure: kind must be one of ${FAILURES.join(", ")}, got ${kind}`);
  if (!finite(at)) throw new Error(`failure: at (the event time from the numbers model, s) must be a finite number, got ${at}`);
  if (!finite(amount) || amount <= 0 || amount > 1) throw new Error(`failure: amount must be in (0, 1], got ${amount}`);
  if (soot !== undefined && !positive(soot)) throw new Error(`failure: soot (radius, scene units) must be a finite number > 0, got ${soot}`);
  const geo = part.geometry.clone(), mat = part.material.clone();
  geo.computeBoundingBox();
  const b = geo.boundingBox.clone(), pos = geo.attributes.position;
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2, H = b.max.y - b.min.y;
  const place = (o) => { o.position.copy(part.position); o.quaternion.copy(part.quaternion); o.scale.copy(part.scale); o.name = `${part.name || "part"} ${kind}`; o.visible = false; return o; };
  const reshape = (f) => {
    for (let i = 0; i < pos.count; i++) { const v = [pos.getX(i), pos.getY(i), pos.getZ(i)]; f(v); pos.setXYZ(i, v[0], v[1], v[2]); }
    pos.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  };
  let radius = 0;
  for (let i = 0; i < pos.count; i++) radius = Math.max(radius, Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz));
  let failed;
  if (kind === "bulge") {
    const floor = b.max.y - 0.15 * H;
    reshape((v) => {
      if (v[1] < floor) return;
      const dx = v[0] - cx, dz = v[2] - cz, r = Math.hypot(dx, dz);
      v[1] += amount * 0.08 * radius * Math.max(0, 1 - (r / radius) ** 2);
      v[0] = cx + dx * (1 + 0.03 * amount); v[2] = cz + dz * (1 + 0.03 * amount);
    });
    failed = place(new THREE.Mesh(geo, mat));
    if (vent) {
      const dark = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.8 });
      for (const turn of [0, Math.PI / 2]) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(1.4 * radius, 0.04 * radius, 0.14 * radius), dark);
        slot.position.set(cx, geo.boundingBox.max.y + 0.01 * radius, cz); slot.rotation.y = turn;
        failed.add(slot);
      }
    }
  } else if (kind === "blown") {
    const L = b.max.x - b.min.x, gap = 0.3 * amount * L, gapA = cx - gap / 2, gapB = cx + gap / 2;
    const piece = (lo, hi) => { // one end, squeezed along x between lo and hi so its cross-section stays true
      const g = geo.clone(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, lo + (p.getX(i) - b.min.x) / L * (hi - lo));
      p.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere();
      return new THREE.Mesh(g, mat.clone());
    };
    failed = place(new THREE.Group());
    const pieces = [piece(b.min.x, gapA), piece(gapB, b.max.x)];
    const mark = new THREE.Mesh(new THREE.CircleGeometry(soot ?? gap / 2, 24), new THREE.MeshBasicMaterial({ color: SOOT, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide }));
    mark.position.set(cx, cy, cz);
    failed.add(...pieces, mark);
    failed.userData.pieces = pieces; failed.userData.soot = mark;
  } else if (kind === "char") {
    mat.color.lerp(new THREE.Color(CHAR), 0.85 * amount); mat.roughness = 1; mat.metalness = 0;
    failed = place(new THREE.Mesh(geo, mat));
  } else { // melt
    reshape((v) => {
      const u = v[1] - b.min.y, spread = 1 + amount * 0.05 * (1 - u / H) ** 2;
      v[1] -= amount * 0.25 * u * u / H;
      v[0] = cx + (v[0] - cx) * spread; v[2] = cz + (v[2] - cz) * spread;
    });
    mat.color.multiplyScalar(0.7);
    failed = place(new THREE.Mesh(geo, mat));
  }
  part.parent?.add(failed);
  const show = (t) => {
    if (!finite(t)) throw new Error(`failure: t must be finite, got ${t}`);
    const gone = t >= at;
    part.visible = !gone; failed.visible = gone;
    return gone;
  };
  return { normal: part, failed, kind, when: at, at: show };
}
