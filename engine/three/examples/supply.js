import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { wire, flow, lamp, arc, failure } from "../circuit.js";

// A supply chain from the plug to a motor, laid along +x on a surface at y = 0: plug, mains cord, a glass fuse, a
// rectifier block on a small board, a dc trace to a motor, and a lamp on the same mains. Every value comes from the film's
// numbers model, never typed here (script-voice.md, the model's `state(t)`); the parts are real sizes (`userData.real`,
// for `scaleAudit`). It is an example of how to build a circuit with `circuit.js`: a film copies its own board, cord and
// parts' real sizes from its sources and keeps the pattern.
//
//   state(t) → { Vac, Iac, Vdc, Idc, rpm, V }   volts and amperes at the mains cord (rms) and at the dc trace, the shaft
//                                                speed in rpm and the lamp's supply voltage, all finite numbers
//   events: { fuseBlown }                        film time (s) when the fuse blows (omit: it never does); state(t) must
//                                                show the current gone from then on, this only draws the cause
//   arc: { dur, energy, efficacy }               the flash at the fuse, from the model with a source (required with the event)
//   lamp: { lm }                                 the lamp's rated flux at the mains voltage, from its datasheet
//
//   const chain = supplyChain(kit, { at, state, events: { fuseBlown: N.blowAt }, arc: N.flash, lamp: { lm: N.lampLm } });
//   scene.add(chain.group);                       // each frame: const s = chain.at(t); put chain.labels on screen
//
// One time scale for the whole film (camera-motion.md §5): `timeScale` slows the mains frequency AND the shaft (a 50 Hz
// wave and a 3000 rpm shaft both alias at 30 fps), `labels` say so, and a shown rate under 4 frames per turn or period is
// refused (/alias/). `speed` is the pulses' visualisation speed in m/s, not the drift velocity. Returns
// { group, flows: { ac: [cord, cord], dc }, lamp (with `light`), fuse: { normal, failed, at }, arc | null, shaft, labels,
// at(t) → state(t) }.
export function supplyChain(k, { at = new THREE.Vector3(), mains = { V: 230, freq: 50 }, state, events = {}, arc: arcSpec, lamp: lampSpec, timeScale = 0.1, speed = 0.5, fps = 30, full } = {}) {
  if (typeof state !== "function") throw new Error("supplyChain: state(t) is the film's model function → { Vac, Iac, Vdc, Idc, rpm, V }");
  if (!(Number.isFinite(lampSpec?.lm) && lampSpec.lm > 0)) throw new Error("supplyChain: lamp = { lm } (the rated flux, from its datasheet) is required");
  if (!(Number.isFinite(mains?.V) && mains.V > 0 && Number.isFinite(mains?.freq) && mains.freq > 0)) throw new Error("supplyChain: mains = { V, freq } finite numbers > 0");
  const blowAt = events.fuseBlown;
  if (blowAt !== undefined && !Number.isFinite(blowAt)) throw new Error(`supplyChain: events.fuseBlown must be a film time in s, got ${blowAt}`);
  if (blowAt !== undefined && !arcSpec) throw new Error("supplyChain: the blown fuse flashes: arc = { dur, energy, efficacy } from the model is required");
  const U = 1 / M, p = (x, y, z) => new THREE.Vector3(x * U, y * U, z * U);
  const group = new THREE.Group();
  group.name = "supply chain"; group.position.copy(at);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
  const along = (geo) => geo.rotateZ(Math.PI / 2); // a cylinder lying along x
  const put = (geo, mat, x, y, z, name, real) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * U, y * U, z * U); m.name = name;
    if (real) m.userData.real = real;
    group.add(m);
    return m;
  };
  const B = 0.0016; // the board's thickness, m

  // plug: a body 50 x 30 x 40 mm and two pins (not part of its declared size)
  put(new THREE.BoxGeometry(0.05 * U, 0.03 * U, 0.04 * U), std(0xe8e4da, { roughness: 0.6 }), 0, 0.015, 0, "plug", { w: 0.05, h: 0.03, d: 0.04 });
  for (const z of [-0.011, 0.011]) put(along(new THREE.CylinderGeometry(0.002 * U, 0.002 * U, 0.019 * U, 12)), std(0xc9c9c9, { metalness: 1, roughness: 0.3 }), -0.0345, 0.015, z, "pin");

  // cord: insulated core from the plug to the fuse and from the fuse to the rectifier
  const r = 0.0015;
  const cordA = wire([p(0.025, r, 0), p(0.07, r, 0.04), p(0.11, r, 0.04), p(0.154, r, 0)], { kind: "wire" });
  const cordB = wire([p(0.186, r, 0), p(0.23, r, -0.03), p(0.27, r, -0.03), p(0.3, B + 0.005, 0)], { kind: "wire" });
  group.add(cordA.group, cordB.group);

  // fuse: a 32 mm glass tube (6.3 mm across), metal caps and the fuse wire inside, which is the part that blows
  put(along(new THREE.CylinderGeometry(0.00315 * U, 0.00315 * U, 0.032 * U, 24)), std(0xbfd8e0, { transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.1 }), 0.17, 0.0032, 0, "fuse glass", { w: 0.032, h: 0.0063, d: 0.0063 });
  for (const s of [-1, 1]) put(along(new THREE.CylinderGeometry(0.0033 * U, 0.0033 * U, 0.006 * U, 24)), std(0xc9c9c9, { metalness: 1, roughness: 0.3 }), 0.17 + s * 0.013, 0.0032, 0, "fuse cap");
  const element = put(along(new THREE.CylinderGeometry(0.00015 * U, 0.00015 * U, 0.026 * U, 8)), std(0xd6d6d6, { metalness: 1, roughness: 0.3 }), 0.17, 0.0032, 0, "fuse wire");
  const fuse = blowAt === undefined ? { normal: element, failed: null, at() {} } : failure(element, { kind: "blown", at: blowAt, soot: 0.0028 * U });

  // board with the rectifier block (40 x 10 x 25 mm) and the dc trace to the motor
  put(new THREE.BoxGeometry(0.165 * U, B * U, 0.06 * U), std(0x1f5a3a, { roughness: 0.6 }), 0.3775, B / 2, 0, "board", { w: 0.165, h: B, d: 0.06 });
  put(new THREE.BoxGeometry(0.04 * U, 0.01 * U, 0.025 * U), std(0x23262b, { roughness: 0.7 }), 0.32, B + 0.005, 0, "rectifier", { w: 0.04, h: 0.01, d: 0.025 });
  const tr = B + 0.0004;
  const trace = wire([p(0.34, tr, 0), p(0.4, tr, 0.015), p(0.43, tr, 0.015), p(0.46, tr, 0)], { kind: "trace" });
  group.add(trace.group);

  // motor: a 35 mm cylinder 50 mm long and a shaft with a flag, so that its turning can be seen
  put(along(new THREE.CylinderGeometry(0.0175 * U, 0.0175 * U, 0.05 * U, 32)), std(0x8d949c, { metalness: 0.9, roughness: 0.4 }), 0.485, 0.0175, 0, "motor", { w: 0.05, h: 0.035, d: 0.035 });
  const shaft = new THREE.Group();
  shaft.name = "shaft"; shaft.position.set(0.51 * U, 0.0175 * U, 0);
  const rod = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0015 * U, 0.0015 * U, 0.02 * U, 12)), std(0xd0d0d0, { metalness: 1, roughness: 0.3 }));
  rod.position.x = 0.01 * U;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.006 * U, 0.012 * U, 0.002 * U), std(0xe0563b));
  flag.position.set(0.016 * U, 0.0065 * U, 0);
  shaft.add(rod, flag); group.add(shaft);

  // lamp: a 60 mm bulb on a stand beside the cord, on the same mains
  put(new THREE.CylinderGeometry(0.03 * U, 0.03 * U, 0.006 * U, 32), std(0x2b2b2b), 0.17, 0.003, -0.06, "lamp base");
  put(new THREE.CylinderGeometry(0.004 * U, 0.004 * U, 0.09 * U, 12), std(0x2b2b2b), 0.17, 0.051, -0.06, "lamp stand");
  const bulb = put(new THREE.SphereGeometry(0.03 * U, 32, 16), std(0xfff4d8, { emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.2 }), 0.17, 0.12, -0.06, "bulb", { w: 0.06, h: 0.06, d: 0.06 });
  const light = new THREE.PointLight(0xffd9a0, 0);
  light.position.copy(bulb.position); group.add(light);
  const bulbLamp = lamp(light, { rated: { V: mains.V, lm: lampSpec.lm }, voltage: (t) => state(t).V });

  // the flows: ac in the cord, dc in the trace, every current from state(t)
  const fl = { speed, timeScale, fps, full };
  const ac = [cordA, cordB].map((w) => flow(w, { ...fl, current: (t) => state(t).Iac, waveform: "ac", freq: mains.freq }));
  const dc = flow(trace, { ...fl, current: (t) => state(t).Idc, waveform: "dc", width: 0.001 });
  group.add(...ac.map((f) => f.group), dc.group);

  // the arc at the fuse: between the two ends of the blown wire
  const gap = 0.3 * 0.026;
  const flash = blowAt === undefined ? null : arc(k, { ground: 0, ...arcSpec, from: p(0.17 - gap / 2, 0.0032, 0), to: p(0.17 + gap / 2, 0.0032, 0), t0: blowAt, timeScale, fps });
  if (flash) group.add(flash.group);

  // the shaft: its angle is the integral of the speed over film time (trapezoids at 240 Hz, kept: a seek gives the same angle)
  const DT = 1 / 240, cum = [0];
  const omega = (t) => {
    const rpm = state(t).rpm;
    if (!Number.isFinite(rpm)) throw new Error(`supplyChain: state(${t}).rpm must be a finite number, got ${rpm}`);
    return rpm * Math.PI / 30 * timeScale;
  };
  const angle = (t) => {
    if (!(t > 0)) return 0;
    const n = Math.floor(t / DT);
    while (cum.length <= n) { const i = cum.length - 1; cum.push(cum[i] + 0.5 * (omega(i * DT) + omega((i + 1) * DT)) * DT); }
    return cum[n] + 0.5 * (omega(n * DT) + omega(t)) * (t - n * DT);
  };
  const fraction = Math.abs(1 / timeScale - Math.round(1 / timeScale)) < 1e-6 && timeScale < 1 ? `1/${Math.round(1 / timeScale)}` : `${+timeScale.toPrecision(3)}x`;
  const labels = { ac: ac[0].label, dc: dc.label, scale: `everything shown at ${fraction} speed: the mains frequency and the shaft` };

  const read = (t) => {
    const s = state(t);
    for (const key of ["Vac", "Iac", "Vdc", "Idc", "rpm", "V"]) if (!Number.isFinite(s?.[key])) throw new Error(`supplyChain: state(${t}).${key} must be a finite number, got ${s?.[key]}`);
    if (Math.abs(s.rpm) / 60 * timeScale > fps / 4) throw new Error(`supplyChain: ${s.rpm} rpm x time scale ${timeScale} = ${Math.abs(s.rpm) / 60 * timeScale} turns per s shown would alias at ${fps} fps (fewer than 4 frames a turn): lower timeScale`);
    return s;
  };
  const step = (t) => {
    const s = read(t);
    for (const f of ac) f.at(t);
    dc.at(t); fuse.at(t); flash?.at(t);
    const out = bulbLamp.at(t);
    bulb.material.emissiveIntensity = Math.min(2, 2 * out.lm / lampSpec.lm);
    bulb.material.emissive.copy(light.color);
    shaft.rotation.x = angle(t);
    return s;
  };
  return { group, flows: { ac, dc }, lamp: { ...bulbLamp, light }, fuse, arc: flash, shaft, labels, at: step };
}
