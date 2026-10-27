import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { MATERIALS, interfaceAt, apparent, traceRay, drawRays } from "../optics.js";

// A glass of water with a straw in it, bent where it enters the water: why a straw looks broken at the surface. The bend is
// not drawn by hand: each point of the submerged straw is moved to where the eye sees it through the flat water surface,
// `apparent()` of optics.js (Snell's law with the cited indices of water and air), and with `rays: true` the teaching rays from
// three straw points to the eye are traced through the same surface. The picture depends on where the eye is, so `at(t, camera)`
// must be called with the render camera every frame.
//
// This piece frames the straw THROUGH THE TOP SURFACE: the eye is above the glass's rim and every sight line to the straw crosses
// the water surface inside the glass. A view through the side wall (a round glass is a lens of its own, magnifying the straw
// sideways) is a different picture and is refused: `/eye/`. Local frame: the glass stands on y = 0, its axis is the y axis,
// the whole piece sits at `at` (scene units). Sizes below are a typical tumbler (7 cm across, 10 cm tall, 2 mm walls, 5 mm
// base) and a drinking straw (3 mm radius, 20 cm); override them from the real objects.
//
//   glass: { r, h, wall, base }       metres (outer radius, height, wall and base thickness)
//   fill                              the water's depth as a fraction of the inner height (default 0.7)
//   straw: { r, length, tilt }        metres, radians from vertical (default: from the floor corner to the far rim)
//   eye                               the viewer, scene units in the world (the camera's position); required
//   rays                              true: teaching rays from three straw points to the eye (default false)
//   mode, dust                        how the rays are drawn ("teach" default; "world" needs `dust`, see drawRays)
//
//   const demo = makeStrawGlass(kit, { at, eye: camera.position, rays: true });
//   scene.add(demo.group);              // each frame: demo.at(t, camera); demo.rays.reveal(u) grows the rays on cue
//
// The glass is glass (BK7's index, the nearest in the table to a soda-lime tumbler); its screen-space transmission does not bend
// the straw behind it, which is why the straw is drawn at its traced position. Returns { group, glass, water, straw, surface,
// real: { foot, cross, end } (the straw's true points, scene units local), drawn: { tip, end } (what the eye is shown), rays |
// null, at(t, camera) }.
export function makeStrawGlass(k, { at = new THREE.Vector3(), glass: gs = {}, fill = 0.7, straw: ss = {}, eye, rays: withRays = false, mode = "teach", dust } = {}) {
  const { r = 0.035, h = 0.1, wall = 0.002, base = 0.005 } = gs, { r: sr = 0.003, length = 0.2 } = ss;
  for (const [n, v] of [["glass.r", r], ["glass.h", h], ["glass.wall", wall], ["glass.base", base], ["straw.r", sr], ["straw.length", length]]) if (!(Number.isFinite(v) && v > 0)) throw new Error(`makeStrawGlass: ${n} must be metres > 0, got ${v}`);
  if (!(fill > 0 && fill < 1)) throw new Error(`makeStrawGlass: fill is the water's share of the inner height, in (0, 1), got ${fill}`);
  if (!eye?.isVector3) throw new Error("makeStrawGlass: eye (the camera's position, a THREE.Vector3 in scene units) is required: the bend depends on where the eye is");
  const inner = r - wall, reach = inner - sr, w = base + fill * (h - base), U = 1 / M;
  if (!(reach > 0)) throw new Error("makeStrawGlass: the straw is wider than the glass");
  const tilt = ss.tilt ?? Math.atan2(2 * reach, h - base);
  if (!(Number.isFinite(tilt) && tilt >= 0 && tilt < Math.PI / 2)) throw new Error(`makeStrawGlass: straw.tilt (rad from vertical) must be in [0, pi/2), got ${tilt}`);
  const group = new THREE.Group(); group.name = "straw glass"; group.position.copy(at);

  const glassMesh = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [r, 0], [r, h], [inner, h], [inner, base], [0, base]].map(([x, y]) => new THREE.Vector2(x * U, y * U)), 64),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, ior: MATERIALS.bk7.n(589.3), thickness: wall * U, roughness: 0.03, side: THREE.DoubleSide }));
  glassMesh.name = "glass"; glassMesh.userData.real = { h, w: 2 * r, d: 2 * r };
  const water = new THREE.Mesh(new THREE.CylinderGeometry((inner - 0.0002) * U, (inner - 0.0002) * U, (w - base) * U, 64), new THREE.MeshPhysicalMaterial({ color: 0xcfe8f0, transmission: 1, ior: MATERIALS.water.n(589.3), thickness: (w - base) * U, roughness: 0.02 }));
  water.position.y = (base + w) / 2 * U; water.name = "water";
  const surface = interfaceAt({ at: new THREE.Vector3(0, w * U, 0), normal: new THREE.Vector3(0, 1, 0), below: "water", above: "air", size: 2 * inner });

  // The straw: foot on the floor against the near wall, leaning to the far rim; the part above the water is where it really is.
  const dir = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0), foot = new THREE.Vector3(-reach, base, 0).multiplyScalar(U);
  const sW = (w - base) / Math.cos(tilt), pointAt = (s) => foot.clone().addScaledVector(dir, s * U);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9463a, roughness: 0.45 });
  const above = new THREE.Mesh(new THREE.CylinderGeometry(sr * U, sr * U, (length - sW) * U, 16), mat);
  above.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); above.position.copy(pointAt((sW + length) / 2)); above.name = "straw above the water";
  above.userData.real = { d: 2 * sr };
  const below = new THREE.Mesh(new THREE.BufferGeometry(), mat); below.name = "straw below the water (as seen)";
  group.add(glassMesh, water, above, below);
  above.updateMatrix();
  const real = { foot, cross: pointAt(sW), end: pointAt(length) };
  const drawn = { tip: foot.clone(), end: new THREE.Vector3(0, (length - sW) * U / 2, 0).applyMatrix4(above.matrix) };

  const local = (p) => { group.updateWorldMatrix(true, false); return group.worldToLocal(p.clone()); };
  const samples = Array.from({ length: 15 }, (_, i) => pointAt(sW * i / 14));
  const api = { group, glass: glassMesh, water, straw: { above, below }, surface, real, drawn, rays: null, at(t, camera) {
    const e = local(camera ? camera.getWorldPosition(new THREE.Vector3()) : eye);
    if (!(e.y * M > h)) throw new Error(`makeStrawGlass: eye at height ${(e.y * M).toFixed(3)} m is level with or below the rim (${h} m): this piece frames the straw through the top surface, not the side wall`);
    const images = samples.map((p) => {
      const a = apparent(p, e, surface);
      if (Math.hypot(a.through.x, a.through.z) * M > inner) throw new Error(`makeStrawGlass: eye at (${(e.x * M).toFixed(3)}, ${(e.y * M).toFixed(3)}, ${(e.z * M).toFixed(3)}) m sees the straw through the glass's side wall, not the water surface: raise the eye or bring it nearer the glass's axis`);
      return a.image;
    });
    below.geometry.dispose();
    below.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(images), 28, sr * U, 10, false);
    drawn.tip.copy(images[0]);
    if (withRays) {
      if (api.rays) { group.remove(api.rays.group); api.rays.group.traverse((o) => { o.geometry?.dispose(); }); }
      const parts = [0.25, 0.55, 0.9].map((f) => {
        const P = pointAt(sW * f), a = apparent(P, e, surface), Pm = P.clone().multiplyScalar(M), X = a.through.clone().multiplyScalar(M), E = e.clone().multiplyScalar(M);
        return traceRay([surface], { origin: Pm, dir: X.clone().sub(Pm), escape: E.distanceTo(X), minPower: 0.05 });
      });
      api.rays = drawRays({ segments: parts.flatMap((p) => p.segments), length: Math.max(...parts.map((p) => p.length)) }, { mode, dust, width: 0.0004 });
      group.add(api.rays.group);
    }
    return api;
  } };
  api.at(0);
  return api;
}
