// The golden scene: one fixed scene, built only from engine parts, that every skill version renders, so a change in how
// the films LOOK shows up as a number and a contact sheet (scripts/golden.mjs), not only in a user's eyes.
// A vacuum flask cut open at real size (30 cm), three camera stations (wide, medium with a flow arrow, macro with depth
// of field), a caption, pinned labels and a dimension line. Fixed text, no narration, no physics.
//
// Generic on purpose: the flask is an engine example (engine/three/examples/flask.js), nothing here is a film topic.
// Fixed on purpose: changing this file moves every baseline. Bump CONFIG.revision and say so in the PR and the
// CHANGELOG; scripts/golden.mjs then reads the older folders as not comparable (a WARN, no FLAG).
//
// DOM-free: no document, no window, no canvas, so Node imports it (tests/golden-scene.mjs). The renderer side is
// index.html. In a project this file lives at src/scene.js and the engine at assets/engine/.
import { THREE } from "../assets/engine/three-vendor.js";
import { makeKit, M } from "../assets/engine/kit.js";
import { makeFlask } from "../assets/engine/examples/flask.js";
import { stations as makeStations, frame, route, place } from "../assets/engine/camera.js";
import { flowArrow } from "../assets/engine/quantity.js";
import { scaleAudit } from "../assets/engine/audit.js";

export const CONFIG = {
  revision: 1,
  width: 1280, height: 720, fps: 30, duration: 6,
  format: "landscape",
  frameTimes: { wide: 1.0, medium: 3.0, macro: 5.2 }, // inside each camera hold (legs: 1.5-2.5 and 3.5-4.5 s)
};

export const LABELS = { wall: "Steel wall", arrow: "Heat flow", gap: "Vacuum gap" };
export const CAPTIONS = [{ text: "Heat stays in the gap", start: 0, end: CONFIG.duration }];
export const DIM = { from: [-0.075, 0, 0.04], to: [-0.075, 0.3, 0.04], text: "30 cm" }; // metres, relative to the flask

const MPU = 2;           // metres per scene unit: the scene is not at 1:1 on purpose, every tolerance is in metres
const FRUSTUM = 0.4;     // half-size (units) of the ONE shadow frustum that covers the whole set
const SHADOW_MAP = 4096;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function buildScene({ aspect = CONFIG.width / CONFIG.height } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e4dc);
  const kit = makeKit(scene, { mpu: MPU });
  const u = (m) => m / M;                           // metres to scene units
  const v = (x, y, z) => new THREE.Vector3(u(x), u(y), u(z));

  // The floor: a matte slab whose top is y = 0, receiving the shadow.
  const floor = kit.box(u(1.4), u(0.04), u(1.0), kit.mat(0xd9d2c6, 0.9), 0, -u(0.02), 0);
  floor.name = "floor";

  // The flask, 30 cm, on the floor, its section facing the camera.
  const flask = makeFlask(kit, { at: new THREE.Vector3(0, 0, 0), height: 0.3 });
  flask.group.userData.real = { h: 0.3 };
  const misses = []; // no settle(): the flask is modelled with its base at y = 0 and the floor's top is y = 0
  const audit = scaleAudit(scene);
  if (misses.length) throw new Error("golden scene: could not place " + misses.join(", "));
  if (audit.bad?.length || audit.off?.length) throw new Error("golden scene: scale audit: " + JSON.stringify(audit));

  // Light: one key with ONE fixed shadow frustum (so texelMm below is honest), a soft fill without shadow.
  const key = new THREE.DirectionalLight(0xfff1de, 2.6);
  key.position.copy(v(0.55, 1.1, 0.85));
  key.target.position.copy(v(0, 0.12, 0));
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  Object.assign(key.shadow.camera, { left: -FRUSTUM, right: FRUSTUM, top: FRUSTUM, bottom: -FRUSTUM, near: 0.05, far: 6 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  const fill = new THREE.HemisphereLight(0xdfe8f2, 0xc9bfae, 0.7);
  scene.add(key, key.target, fill);

  // The heat flow: an arrow from outside the wall toward the vacuum gap, on one fixed scale.
  const flow = flowArrow({ from: v(0.13, 0.15, 0.03), to: v(0.047, 0.15, 0.03), value: 8, scale: 0.004 });
  scene.add(flow.group);

  // Three stations and the route between them.
  const gapBox = new THREE.Box3(v(0.02, 0.135, -0.015), v(0.052, 0.165, 0.015));
  const world = new THREE.Box3(v(-0.12, 0, -0.06), v(0.14, 0.3, 0.06));
  const st = makeStations({
    home: frame(world, { fov: 18, aspect, azimuth: 20, elevation: 25 }),
    medium: frame(new THREE.Box3(v(-0.1, 0.08, -0.05), v(0.14, 0.3, 0.05)), { fov: 28, aspect, azimuth: 20, elevation: 25 }),
    macro: frame(gapBox, { fov: 35, aspect, azimuth: 20, elevation: 25, margin: 1.05 }),
  });
  const path = route(st, [{ to: "medium", start: 1.5, dur: 1.0 }, { to: "macro", start: 3.5, dur: 1.0 }]);

  const gapPoint = gapBox.getCenter(new THREE.Vector3());
  const wallPoint = v(-0.0375, 0.18, 0.001);
  const dim = { from: v(...DIM.from), to: v(...DIM.to), text: DIM.text };
  const arrowU = (t) => (t < 3.5 ? clamp01((t - 2.5) / 0.5) : clamp01(1 - (t - 3.5) / 0.5)); // draws in on the medium hold, retracts as the camera leaves

  // The camera and everything that depends on t: a pure function of t (renders arrive out of order).
  function at(t, camera) {
    flask.cut.at(t);
    flow.reveal(arrowU(t));
    scene.updateMatrixWorld(true);
    const pose = path.at(t);
    place(camera, pose);
    return pose;
  }
  // The labels on screen at t: [{ at, text }] (a Vector3 or an Object3D in the scene).
  function labelsAt(t) {
    const out = [];
    if (t >= 0.3 && t < 2.4) out.push({ at: wallPoint, text: LABELS.wall });
    if (t >= 2.8 && t < 3.5) out.push({ at: flow.anchor, text: LABELS.arrow });
    if (t >= 4.6) out.push({ at: gapPoint, text: LABELS.gap });
    return out;
  }
  const dimVisible = (t) => t >= 0.3 && t < 1.5; // the wide hold only

  // Shadow texel size in mm at a station. One fixed frustum: the same everywhere today, which is what a per-station
  // shadow rig would improve. This is the one place that changes when the lighting rig does.
  function texelMm(name) {
    if (!Object.hasOwn(st, name)) throw new Error('texelMm: no station "' + name + '" (' + Object.keys(st).join(", ") + ")");
    return (2 * FRUSTUM * M * 1000) / key.shadow.mapSize.x;
  }
  // Depth of field: a faint blur at wide and medium, strong at the macro, focused on the gap.
  function dof(t) {
    const k = clamp01((t - 3.5) / 1.0);
    return { focusPoint: gapPoint.clone(), bokehScale: 0.4 + 5.6 * k, focusRange: 3 - 2.9 * k };
  }

  return { scene, kit, world: flask.group, flask, key, fill, stations: st, route: path, flow, dim, at, labelsAt, dimVisible, texelMm, dof, mpu: M, shadowMapSize: SHADOW_MAP };
}
