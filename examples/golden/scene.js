// The golden scene: one fixed scene, built only from engine parts, that every skill version renders, so a change in how
// the films LOOK shows up as a number and a contact sheet (scripts/golden.mjs), not only in a user's eyes.
// A vacuum flask cut open at real size (30 cm) on an isometric-world slab, in the one look every film uses (true iso,
// three tones per face, no lights), three iso stations (wide, medium with a flow arrow, close on the gap), a caption,
// pinned labels and a dimension line. Fixed text, no narration, no physics.
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
import { stations as makeStations, isoFrame, route, place } from "../assets/engine/camera.js";
import { isoLook } from "../assets/engine/studio.js";
import { flowArrow } from "../assets/engine/quantity.js";
import { scaleAudit } from "../assets/engine/audit.js";

export const CONFIG = {
  revision: 2, // 2: the isometric-world look (was a perspective studio diorama)
  width: 1280, height: 720, fps: 30, duration: 6,
  format: "landscape",
  frameTimes: { wide: 1.0, medium: 3.0, macro: 5.2 }, // inside each camera hold (legs: 1.5-2.5 and 3.5-4.5 s)
};

export const LABELS = { wall: "Steel wall", arrow: "Heat flow", gap: "Vacuum gap" };
export const CAPTIONS = [{ text: "Heat stays in the gap", start: 0, end: CONFIG.duration }];
export const DIM = { from: [-0.075, 0, 0.04], to: [-0.075, 0.3, 0.04], text: "30 cm" }; // metres, relative to the flask

const MPU = 2;           // metres per scene unit: the scene is not at 1:1 on purpose, every tolerance is in metres
export const SKY = "#E8EDEF", SLAB = "#CFD8DB"; // isometric-world.md: the sky and the slab top
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function buildScene({ W = CONFIG.width, H = CONFIG.height } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  const kit = makeKit(scene, { mpu: MPU });
  const u = (m) => m / M;                           // metres to scene units
  const v = (x, y, z) => new THREE.Vector3(u(x), u(y), u(z));

  // The slab: a floating board whose top is y = 0, its cut edge showing.
  const floor = kit.box(u(0.5), u(0.04), u(0.3), kit.mat(SLAB, 0.9), 0, -u(0.02), 0);
  floor.name = "floor";

  // The flask, 30 cm, on the slab, its section facing the camera (+z is the iso view's left face).
  const flask = makeFlask(kit, { at: new THREE.Vector3(0, 0, 0), height: 0.3, cut: { flat: true, hatch: 0.01 } });
  flask.group.userData.real = { h: 0.3 };
  const misses = []; // no settle(): the flask is modelled with its base at y = 0 and the floor's top is y = 0
  const audit = scaleAudit(scene);
  if (misses.length) throw new Error("golden scene: could not place " + misses.join(", "));
  if (audit.bad?.length || audit.off?.length) throw new Error("golden scene: scale audit: " + JSON.stringify(audit));

  // The heat flow: an arrow from outside the wall toward the vacuum gap, on one fixed scale.
  const flow = flowArrow({ from: v(0.13, 0.15, 0.03), to: v(0.047, 0.15, 0.03), value: 8, scale: 0.004 });
  scene.add(flow.group);
  isoLook(scene); // after every part is built, before the cut is first posed

  // Three stations and the route between them.
  const gapBox = new THREE.Box3(v(0.02, 0.135, -0.015), v(0.052, 0.165, 0.015));
  const world = new THREE.Box3(v(-0.12, 0, -0.06), v(0.14, 0.3, 0.06));
  const st = makeStations({
    home: isoFrame(world, { W, H, margin: 1.3 }),
    medium: isoFrame(new THREE.Box3(v(-0.1, 0.08, -0.05), v(0.14, 0.3, 0.05)), { W, H }),
    macro: isoFrame(gapBox, { W, H, margin: 1.05 }),
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

  // The finest detail at a station, in mm: the iso look has no shadow map, so it is one pixel (mm per px at the
  // station's zoom). scripts/golden.mjs records it per station.
  function texelMm(name) {
    if (!Object.hasOwn(st, name)) throw new Error('texelMm: no station "' + name + '" (' + Object.keys(st).join(", ") + ")");
    return (1000 * M) / st[name].k;
  }

  return { scene, kit, world: flask.group, flask, stations: st, route: path, flow, dim, at, labelsAt, dimVisible, texelMm, mpu: M };
}
