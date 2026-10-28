import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { wire, flow } from "../circuit.js";
import { cutaway } from "../cutaway.js";
import { frame, place as placePose } from "../camera.js";

// A perspective engineering-cutaway piece (from before every film became the iso look, references/looks.md): one small device OPENED, every part at
// its real size, labelled and dimensioned, its current shown. A torch (flashlight) lies on a working surface with a 10 mm
// grid, cut along its axis by a plane so that the cell, the spring, the driver board, the LED on its star board, the
// reflector and the lens show in section; a dc flow runs from the cell to the LED, caused by the film's numbers model.
// A film copies the pattern (an opened device, real sizes, the look's three style frames) with its own subject, never
// the torch's numbers: cell, driver and LED sizes come from the film's sources.
//
//   state(t) → { I }                         the LED current in amperes, finite (script-voice.md: the model, never typed)
//
//   const t = openTorch(kit, { state: (t) => ({ I: N.ledCurrent(t) }), speed: 0.05, full: N.ratedCurrent });
//   scene.add(t.group, t.mat, t.ground, ...t.lights(scene, t.frames({ W, H }).wide.radius));
//   const st = t.frames({ W, H }).medium;     // wide 70 mm, medium 100 mm, macro 135 mm; { position, target, fov, radius, view, dof }
//   t.place(camera, st, W, H);                // the pose and the view offset that puts the subject low in frame
//   // each frame: t.at(time); render; then on the 2D canvas, in this order:
//   const band = textBand(ctx, { kicker, headline, tag }, { format });
//   pinLabel(ctx, { at: t.parts.cell, camera, text }, { format, pill: LOOK.accents.label, top: band.box.y1 });
//   dimension(ctx, t.dims.cell.a, t.dims.cell.b, { camera, text: `${Math.round(t.dims.cell.m * 1000)} mm`, top: band.box.y1 });
//
// Not built here, left to the studio rig, the hard-surface kinds and the markings kit as they land: a light rig of
// three lights stands in for the studio rig, plain physical materials for the kinds, and no printed markings. AgX tone
// mapping, the ambient-occlusion radius (framed radius / 12), grain (LOOK.grain), bloom above LOOK.bloomAbove and the
// depth of field (station.dof, for the vendored DepthOfFieldEffect) are the set's renderer choices.
// Returns { group, mat, ground, parts, dims, flows, cut, frames, place, lights, at }.

// The piece's defaults as data.
export const LOOK = Object.freeze({
  ground: "#e8e9e6", mat: "#6f8497",
  accents: Object.freeze({ label: "#ffd400", ac: "#ffd400", dc: "#2f7de1", heat: "#f08a24", warn: "#e0352b" }), // fixed meanings for the whole film
  grain: 0.035, bloomAbove: 1.0,
  lens: Object.freeze({ gauge: 36, wide: 70, medium: 100, macro: 135 }),
  viewOffset: -0.045, // of the frame height: the subject sits a little low, so the text band stays on clean ground
  dof: Object.freeze({ bokehScale: 6, range: 0.6 }), // range: of the framed radius
});

// Vertical field of view in degrees of a lens of `mm` focal length on a `gauge` mm frame, the gauge on the long side:
// portrait (aspect < 1) the height, landscape the width.
export function lensFov(mm, aspect, gauge = 36) {
  if (!(Number.isFinite(mm) && mm > 0)) throw new Error(`lensFov: mm is the focal length in millimetres, a finite number > 0, got ${mm}`);
  if (!(Number.isFinite(aspect) && aspect > 0 && Number.isFinite(gauge) && gauge > 0)) throw new Error("lensFov: aspect (width / height) and gauge (mm) are finite numbers > 0");
  return (2 * Math.atan((aspect < 1 ? gauge : gauge / aspect) / (2 * mm)) * 180) / Math.PI;
}

export function openTorch(k, { at = new THREE.Vector3(), state, speed, timeScale = 1, fps = 30, full, cutOn = 0 } = {}) {
  if (typeof state !== "function") throw new Error("openTorch: state(t) is the film's model function → { I } (amperes)");
  if (!(Number.isFinite(speed) && speed > 0)) throw new Error(`openTorch: speed (m/s, the stated visualisation speed of the current) must be a finite number > 0, got ${speed}`);
  const U = 1 / M, R = 0.0125; // the body's radius: the axis lies R above the mat
  const group = new THREE.Group();
  group.name = "torch"; group.position.copy(at);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
  const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, ...o });
  const along = (geo) => geo.rotateZ(Math.PI / 2); // a cylinder lying along x
  const put = (geo, mat, x, y, z, name, real) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * U, y * U, z * U); m.name = name; m.castShadow = m.receiveShadow = true;
    if (real) m.userData.real = real;
    group.add(m);
    return m;
  };
  const anchor = (mesh, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x * U, y * U, z * U); mesh.add(o); return o; }; // a label's point, in metres from the part's centre
  const cyl = (r, len, seg = 48, open = false) => along(new THREE.CylinderGeometry(r * U, r * U, len * U, seg, 1, open));
  const metal = (color, rough) => std(color, { metalness: 1, roughness: rough });

  // body: an anodised aluminium tube, 25 mm across with a 1.75 mm wall, open at both ends; a single surface, so it is flagged for the cut
  const body = put(cyl(R, 0.12, 64, true), std(0x30343a, { metalness: 0.8, roughness: 0.45, side: THREE.DoubleSide }), 0.06, R, 0, "body", { w: 0.12, h: 0.025, d: 0.025 });
  body.userData.cut = { shell: 0.00175 };
  // cell: an 18650 (18.6 mm x 65 mm) with its positive nub, in a blue wrapper
  const cell = put(cyl(0.0093, 0.065, 32), phys(0x2a62b8, { roughness: 0.35, clearcoat: 0.6 }), 0.0405, R, 0, "cell", { w: 0.065, h: 0.0186, d: 0.0186 });
  put(cyl(0.003, 0.001, 16), metal(0xc9c9c9, 0.3), 0.0735, R, 0, "cell nub");
  // tail spring: 5 turns of 0.8 mm steel wire, 12 mm across, 8 mm long
  const helix = Array.from({ length: 5 * 12 + 1 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return new THREE.Vector3((0.0005 + 0.008 * (i / 60)) * U, (R + 0.006 * Math.cos(a)) * U, 0.006 * Math.sin(a) * U); });
  const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 180, 0.0004 * U, 8), metal(0xc0c4c8, 0.3));
  spring.name = "spring"; spring.castShadow = true; spring.userData.real = { h: 0.0128, d: 0.0128 };
  group.add(spring);
  // driver board (17 mm disc) with its parts: four 0603 (1.6 x 0.8 x 0.45 mm) and one SOT-23 (3 x 1.4 x 1.1 mm), on the LED side
  const driver = put(cyl(0.0085, 0.0016, 48), phys(0x1f5a3a, { roughness: 0.4, clearcoat: 0.5 }), 0.0765, R, 0, "driver", { w: 0.0016, h: 0.017, d: 0.017 });
  const face = 0.0765 + 0.0008;
  [[0.004, -0.003, 0x23262b], [-0.004, -0.004, 0xb89a6a], [0.002, 0.004, 0x23262b], [-0.003, 0.003, 0xb89a6a]].forEach(([y, z, c], i) => {
    put(new THREE.BoxGeometry(0.00045 * U, 0.0016 * U, 0.0008 * U), std(c, { roughness: 0.6 }), face + 0.000225, R + y, z, "0603 " + (i + 1), { w: 0.00045, h: 0.0016, d: 0.0008 });
  });
  put(new THREE.BoxGeometry(0.0011 * U, 0.003 * U, 0.0014 * U), std(0x23262b, { roughness: 0.55 }), face + 0.00055, R - 0.001, 0, "SOT-23", { w: 0.0011, h: 0.003, d: 0.0014 });
  // star board (an aluminium MCPCB, 16 mm) with the LED: a 3.5 x 3.5 x 1.5 mm emitter under a 2.8 mm phosphor dome, lit by the current
  const star = put(cyl(0.008, 0.0015, 48), metal(0xd8d8d8, 0.35), 0.083, R, 0, "star", { w: 0.0015, h: 0.016, d: 0.016 });
  const ledMat = std(0xf2d34a, { emissive: 0xf2d34a, emissiveIntensity: 0, roughness: 0.3 });
  const led = put(new THREE.BoxGeometry(0.0015 * U, 0.0035 * U, 0.0035 * U), ledMat, 0.08455, R, 0, "led", { w: 0.0015, h: 0.0035, d: 0.0035 });
  put(new THREE.SphereGeometry(0.0014 * U, 24, 12), ledMat, 0.0853, R, 0, "led dome");
  // reflector: a polished cone, 8 mm at the throat to 21 mm at the rim, 12 mm deep, a thin single surface (flagged for the cut)
  const cone = new THREE.LatheGeometry([new THREE.Vector2(0.004 * U, 0), new THREE.Vector2(0.0105 * U, 0.012 * U)], 48).rotateZ(-Math.PI / 2);
  const reflector = put(cone, metal(0xe0e0e0, 0.12), 0.086, R, 0, "reflector", { w: 0.012, h: 0.021, d: 0.021 });
  reflector.material.side = THREE.DoubleSide; reflector.userData.cut = { shell: 0.0005 };
  // lens: a 21 mm clear disc, 2 mm
  const lens = put(cyl(0.0105, 0.002, 48), std(0xdfe9ee, { transparent: true, opacity: 0.25, depthWrite: false, roughness: 0.1 }), 0.099, R, 0, "lens", { w: 0.002, h: 0.021, d: 0.021 });

  // the current: the cell's nub to the driver, the driver to the LED's star board, dc, from the model
  const w1 = wire([[0.0745, R + 0.0031, 0], [0.0749, R + 0.0075, 0], [0.0758, R + 0.0075, 0]].map(([x, y, z]) => new THREE.Vector3(x * U, y * U, z * U)), { kind: "wire", radius: 0.0005 });
  const w2 = wire([[0.0775, R - 0.007, 0], [0.08, R - 0.007, 0], [0.0822, R - 0.007, 0]].map(([x, y, z]) => new THREE.Vector3(x * U, y * U, z * U)), { kind: "wire", radius: 0.0005 });
  group.add(w1.group, w2.group);
  const flows = [w1, w2].map((w) => flow(w, { current: (t) => state(t).I, waveform: "dc", speed, timeScale, fps, full, width: 0.0008, color: new THREE.Color(LOOK.accents.dc) }));
  group.add(...flows.map((f) => f.group));

  // the working surface (a grey-blue mat, 240 x 140 mm, with a 10 mm grid that gives the scale) and the ground, outside the cut
  const mat = new THREE.Group();
  mat.name = "mat"; mat.position.copy(at);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.24 * U, 0.14 * U).rotateX(-Math.PI / 2), std(new THREE.Color(LOOK.mat), { roughness: 0.85 }));
  top.position.x = 0.06 * U; top.receiveShadow = true; top.name = "mat top"; top.userData.real = { w: 0.24, d: 0.14 };
  const g = [];
  for (let x = -0.06; x <= 0.1801; x += 0.01) g.push(x * U, 0.0004 * U, -0.07 * U, x * U, 0.0004 * U, 0.07 * U);
  for (let z = -0.07; z <= 0.0701; z += 0.01) g.push(-0.06 * U, 0.0004 * U, z * U, 0.18 * U, 0.0004 * U, z * U);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(g, 3)), new THREE.LineBasicMaterial({ color: 0x8fa2b3 }));
  grid.name = "mat grid";
  mat.add(top, grid);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4 * U, 4 * U).rotateX(-Math.PI / 2), std(new THREE.Color(LOOK.ground), { roughness: 0.95 }));
  ground.name = "ground"; ground.position.copy(at); ground.position.y -= 0.0002 * U; ground.receiveShadow = true;

  // cut along the axis, on the camera's side (+z removed); the exterior shot is the same set: cutOn > 0 shows it whole until then
  const cut = cutaway(group, { normal: new THREE.Vector3(0, 0, 1), offset: 0 });
  if (cutOn > 0) cut.off(0).on(cutOn);
  group.updateMatrixWorld(true);

  // anchors for labels and the two edges that are measured, in world points (scene units)
  const at3 = (x, y, z) => new THREE.Vector3(x * U, y * U, z * U).add(at);
  const parts = { body, cell, spring, driver, star: anchor(star, 0, 0.0072, -0.0003), led, reflector, lens };
  const dims = {
    cell: { a: at3(0.008, R + 0.0093, 0), b: at3(0.073, R + 0.0093, 0), m: 0.065 }, // the cell's length along its top
    gap: { a: at3(0.0773, R + 0.0085, 0), b: at3(0.0822, R + 0.0085, 0), m: 0.0049 }, // the driver's LED face to the star board's back, along the axis
    reflector: { a: at3(0.086, R + 0.0105, 0), b: at3(0.098, R + 0.0105, 0), m: 0.012 }, // throat plane to rim plane
  };
  group.updateMatrixWorld(true);

  // the look's three style frames: a 70 mm wide, a 100 mm medium on the driver, a 135 mm macro on the LED, each at a
  // 3/4 high angle (20..60 degrees); the subject low in frame (view offset); the macro with depth of field on its subject
  const frames = ({ W, H }) => {
    const aspect = W / H, boxOf = (...os) => { const b = new THREE.Box3(); for (const o of os) b.union(new THREE.Box3().setFromObject(o)); return b; };
    const make = (target, mm, azimuth, elevation, margin) => {
      const st = frame(target, { fov: lensFov(mm, aspect), aspect, azimuth, elevation, margin });
      const box = target.isBox3 ? target : new THREE.Box3().setFromObject(target);
      return { ...st, radius: box.getBoundingSphere(new THREE.Sphere()).radius * margin, view: { offsetY: LOOK.viewOffset }, dof: null };
    };
    group.updateMatrixWorld(true);
    const wide = make(group, LOOK.lens.wide, 20, 35, 1.25);
    const medium = make(boxOf(driver, star, w1.group, w2.group), LOOK.lens.medium, 15, 40, 1.15);
    const macro = make(boxOf(led, star, reflector), LOOK.lens.macro, 10, 50, 1.4);
    macro.dof = { worldFocusDistance: macro.position.distanceTo(macro.target), worldFocusRange: LOOK.dof.range * macro.radius, bokehScale: LOOK.dof.bokehScale };
    return { wide, medium, macro };
  };
  // the camera onto a station: its pose, then the view offset that puts the subject low (a negative offset moves the window up)
  const place = (camera, station, W, H) => {
    placePose(camera, station);
    camera.setViewOffset(W, H, 0, station.view.offsetY * H, W, H);
    camera.updateProjectionMatrix();
    return camera;
  };
  // a minimal light rig until the studio rig lands: a soft key high front-left that casts the shadow, a cool fill, a warm rim
  const lights = (scene, radius) => {
    if (!(radius > 0)) throw new Error("openTorch.lights: radius (scene units, a station's radius) must be > 0");
    const c = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3()), r = radius;
    const dl = (color, intensity, x, y, z) => { const l = new THREE.DirectionalLight(color, intensity); l.position.set(c.x + x * r, c.y + y * r, c.z + z * r); l.target.position.copy(c); scene.add(l.target); return l; };
    const key = dl(0xfff4e6, 2.2, -2, 3, 2.5), fill = dl(0xdfe8ff, 0.6, 2.5, 1.5, 2), rim = dl(0xffd2a0, 1.0, 0.5, 2, -3);
    key.castShadow = true;
    Object.assign(key.shadow, { mapSize: new THREE.Vector2(2048, 2048), radius: 4 });
    Object.assign(key.shadow.camera, { left: -1.2 * r, right: 1.2 * r, top: 1.2 * r, bottom: -1.2 * r, near: 0.1 * r, far: 12 * r });
    key.shadow.camera.updateProjectionMatrix();
    return [key, fill, rim];
  };

  const read = (t) => {
    const s = state(t);
    if (!Number.isFinite(s?.I)) throw new Error(`openTorch: state(${t}).I must be a finite number of amperes, got ${s?.I}`);
    return s;
  };
  const step = (t) => {
    const s = read(t);
    for (const f of flows) f.at(t);
    ledMat.emissiveIntensity = full ? Math.min(2, (2 * Math.abs(s.I)) / full) : s.I > 0 ? 1 : 0;
    cut.at(t);
    return s;
  };
  return { group, mat, ground, parts, dims, flows, cut, frames, place, lights, at: step };
}
