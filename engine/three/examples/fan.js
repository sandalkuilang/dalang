import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { jet } from "../air.js";

// A pedestal fan that is on: a round base, a telescopic pole, the motor and a wire guard on a head that oscillates
// (±40°, one sweep in 10 s, like a real one), three blades at 1300 rpm. The camera sees spinning blades as a faint
// blur, so they are drawn as one: a disc of the blades smeared over the shutter. Its air is air.js's jet from the
// blades along the head's axis. Modelled in metres (a 16-inch fan: 40 cm blades, head 0.9 m up), scaled by 1/M.
export function makeFan(k, { at, aim, height = 0.9, u0 = 2.5 }) {
  const { scene, mat } = k, fan = new THREE.Group(), white = mat(0xeeeae2, 0.45), grey = mat(0x9aa0a0, 0.35), dark = mat(0x3c4245, 0.5);
  fan.name = "fan";
  fan.position.copy(at);
  fan.scale.setScalar(1 / M);
  scene.add(fan);
  const lathe = (pts, m) => { const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 64), m); o.castShadow = o.receiveShadow = true; return o; };
  fan.add(lathe([[0, 0], [0.15, 0], [0.165, 0.01], [0.162, 0.026], [0.14, 0.036], [0.035, 0.042], [0, 0.044]], white)); // weighted base
  const pole = lathe([[0, 0.04], [0.016, 0.04], [0.016, height * 0.55], [0.012, height * 0.56], [0.012, height - 0.06], [0, height - 0.06]], grey);
  fan.add(pole);
  const yaw = new THREE.Group(); // turns on the pole
  yaw.position.y = height - 0.06;
  fan.add(yaw);
  yaw.add(lathe([[0, -0.01], [0.016, -0.01], [0.018, 0.02], [0, 0.03]], white));
  const head = new THREE.Group();
  head.position.y = 0.06;
  yaw.add(head);
  const motor = lathe([[0, -0.13], [0.045, -0.125], [0.07, -0.08], [0.076, -0.03], [0.064, 0], [0, 0.006]], white);
  motor.rotation.x = Math.PI / 2; // its axis along +z (the way it blows)
  head.add(motor);
  // The guard: rings front and back and radial wires, all round tubes.
  const R = 0.215, wire = (pts) => { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0012, 5), grey); o.castShadow = true; head.add(o); };
  [[0.065, R], [0.015, R * 1.02], [0.11, 0.065]].forEach(([z, r]) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0018, 6, 96), grey); o.position.z = z; head.add(o); });
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    wire([new THREE.Vector3(c * 0.065, s * 0.065, 0.11), new THREE.Vector3(c * 0.155, s * 0.155, 0.097), new THREE.Vector3(c * R, s * R, 0.065)]); // front, domed
    wire([new THREE.Vector3(c * R * 1.02, s * R * 1.02, 0.015), new THREE.Vector3(c * 0.14, s * 0.14, -0.013), new THREE.Vector3(c * 0.078, s * 0.078, -0.026)]); // back
  }
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 48), white);
  badge.rotation.x = Math.PI / 2; badge.position.z = 0.114;
  head.add(badge);
  // Blades as the camera records them: each pixel of the disc is covered by a blade for part of the exposure, so it
  // shows the blade colour at that fraction; three 0.6-rad blades of 2π, softer toward the tip.
  const blur = k.canvasTex(256, 256, (c) => {
    for (let r = 20; r < 128; r += 1) {
      const cover = 3 * (0.6 + 0.25 * (r / 128)) / (Math.PI * 2);
      c.strokeStyle = `rgba(150, 168, 176, ${(cover * 0.9).toFixed(3)})`; c.lineWidth = 1.2;
      c.beginPath(); c.arc(128, 128, r, 0, Math.PI * 2); c.stroke();
    }
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 64), new THREE.MeshStandardMaterial({ map: blur, transparent: true, depthWrite: false, roughness: 0.4, side: THREE.DoubleSide }));
  disc.position.z = 0.04;
  head.add(disc);
  const hub = lathe([[0, 0], [0.036, 0], [0.034, 0.02], [0, 0.028]], dark);
  hub.rotation.x = Math.PI / 2; hub.position.z = 0.026;
  head.add(hub);
  k.rest(fan, "fan");

  const base = Math.atan2(aim.x - at.x, aim.z - at.z), swing = (t) => base + 0.7 * Math.sin((2 * Math.PI * t) / 10 + 2.2);
  const air = jet({ D: 0.4, u0, frame(t, outlet, axis) { const a = swing(t); axis.set(Math.sin(a), 0, Math.cos(a)); outlet.set(at.x, at.y + height / M, at.z).addScaledVector(axis, 0.065 / M); } });
  return {
    group: fan, wind: air.wind, block: air.block,
    animate(t) { yaw.rotation.y = swing(t); disc.rotation.z = t * 136; }, // 1300 rpm ≈ 136 rad/s
  };
}
