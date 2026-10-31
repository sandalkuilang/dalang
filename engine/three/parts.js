import { THREE } from "./three-vendor.js";

// Code-first hero parts: the machine built from its real numbers in metres, no modelling tool (the method of
// elvarofficial/teardown, MIT). Each function returns a closed BufferGeometry (the cutaway's stencil counts its faces;
// a spring's tube is open at its ends: mark its mesh userData.cut = { shell: wire }) and keeps the numbers that size
// it in geometry.userData, so the film's MODEL check reads the same numbers the picture was built from.
//
//   import { gear, bevel, bevelPair, spring, lathe, rod } from "./parts.js";
//   const pinion = new THREE.Mesh(gear(32, 0.004, 0.02, { bore: 0.01 }), mat.steel());   // pitch r 64 mm
//   const coil = new THREE.Mesh(spring({ r: 0.01, wire: 0.001, turns: 8, len: 0.04 }), mat.steel());
//   const piston = new THREE.Mesh(lathe([[0, 0], [0.05, 0], [0.05, 0.06], [0, 0.06]]), mat.steel());
//   const link = new THREE.Mesh(rod([0, 0, 0], [0.1, 0.2, 0], 0.006), mat.gloss());

const finite = (v) => typeof v === "number" && Number.isFinite(v);

// The tooth outline both gears share: ISO 53 proportions on a module, a bore hole inside the root.
function outline(who, teeth, module, width, bore) {
  if (!Number.isInteger(teeth) || teeth < 6) throw new Error(`${who}: teeth must be an integer >= 6, got ${teeth}`);
  if (!(finite(module) && module > 0) || !(finite(width) && width > 0)) throw new Error(`${who}: module and width are lengths > 0 in metres`);
  const rp = (module * teeth) / 2, ro = rp + module, rr = rp - 1.25 * module;
  const sh = new THREE.Shape(), da = (2 * Math.PI) / teeth;
  for (let i = 0; i < teeth; i++)
    [[rr, 0], [rr, 0.2], [ro, 0.35], [ro, 0.6], [rr, 0.75]].forEach(([r, f], k) => {
      const a = (i + f) * da, x = r * Math.cos(a), y = r * Math.sin(a);
      if (i === 0 && k === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
    });
  sh.closePath();
  const hole = (max) => {
    if (!(finite(bore) && bore >= 0 && bore < max)) throw new Error(`${who}: bore must be 0 or under the root radius ${max} m, got ${bore}`);
    if (bore) { const h = new THREE.Path(); h.absarc(0, 0, bore, 0, 2 * Math.PI, true); sh.holes.push(h); }
  };
  return { sh, rp, ro, rr, hole };
}

// gear(teeth, module, width, { helix, bore, seg }): a spur gear on +z, centred on its width. Pitch radius
// module·teeth/2, tip = pitch + module, root = pitch − 1.25·module (ISO 53 proportions). helix: the twist across the
// width in radians (a helical gear). bore: the shaft hole's radius.
export function gear(teeth, module, width, { helix = 0, bore = 0, seg = 4 } = {}) {
  const { sh, rp, ro, rr, hole } = outline("gear", teeth, module, width, bore);
  if (!finite(helix)) throw new Error(`gear: helix must be a finite angle in radians, got ${helix}`);
  hole(rr);
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false, curveSegments: seg, steps: helix ? 8 : 1 });
  g.translate(0, 0, -width / 2);
  if (helix) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = (p.getZ(i) / width) * helix, x = p.getX(i), y = p.getY(i);
      p.setXY(i, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
    }
  }
  g.computeVertexNormals();
  g.userData.gear = { teeth, module, width, helix, bore, rp, ro, rr };
  return g;
}

// bevel(teeth, module, width, { pitchAngle, bore, seg }): a straight bevel gear on +z. The back face lies at z = 0 and
// carries gear()'s outline (pitch radius rp = module·teeth/2, tip ro, root rr); the teeth run toward the pitch cone's
// apex on the axis at z = apex = rp / tan(pitchAngle), the pitch angle δ being the pitch cone's half angle. Every
// radius scales toward that apex by k(z) = 1 − z / apex, so along the axis the pitch radius shrinks by tan(δ) per
// metre (rp − z·tan δ) and the tip by ro/rp·tan(δ); width is the axial face width and must stop short of the apex.
// The back face is flat (square to the axis), a study model's stand-in for the back cone; the bore stays straight
// and must clear the front root radius rr·k(width). Mesh a pair from bevelPair(z1, z2) with the apices on one point.
// Pose it so its +z points at the shared apex; audit() checks a pair from mesh { a: { cone: g.userData.bevel, axis, at } }.
// A hypoid (the pinion's axis offset from the wheel's, as in a rear axle) is a documented approximation: draw it as this
// bevel pair with the pinion moved along the common normal by the offset; its spiral teeth and longer pinion are not
// modelled, its ratio is still the teeth ratio, and audit() checks the offset (mesh offset).
export function bevel(teeth, module, width, { pitchAngle, bore = 0, seg = 4 } = {}) {
  const { sh, rp, ro, rr, hole } = outline("bevel", teeth, module, width, bore);
  if (!(finite(pitchAngle) && pitchAngle > 0 && pitchAngle < Math.PI / 2)) throw new Error(`bevel: pitchAngle is the pitch cone's half angle in radians, over 0 and under π/2 (from bevelPair), got ${pitchAngle}`);
  const apex = rp / Math.tan(pitchAngle), kf = 1 - width / apex;
  if (!(kf > 0)) throw new Error(`bevel: width ${width} m reaches the cone apex ${apex} m from the back face; keep it shorter`);
  hole(rr * kf);
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false, curveSegments: seg, steps: 1 });
  const p = g.attributes.position, cut = (bore + rr * kf) / 2; // the bore's vertices sit inside cut: they stay put
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    if (Math.hypot(x, y) < cut) continue;
    const k = 1 - p.getZ(i) / apex;
    p.setXY(i, x * k, y * k);
  }
  g.computeVertexNormals();
  g.userData.bevel = { teeth, module, width, pitchAngle, bore, rp, ro, rr, apex };
  return g;
}

// bevelPair(z1, z2): the pitch angles of two bevel gears meshing at a right angle: tan δ1 = z1 / z2, δ1 + δ2 = 90°.
export function bevelPair(z1, z2) {
  if (![z1, z2].every((z) => Number.isInteger(z) && z > 0)) throw new Error(`bevelPair: teeth are whole counts > 0, got ${z1}, ${z2}`);
  const pitchAngle1 = Math.atan2(z1, z2);
  return { pitchAngle1, pitchAngle2: Math.PI / 2 - pitchAngle1 };
}

// spring({ r, wire, turns, len, seg }): a coil spring standing on y = 0 along +y; r is the coil radius to the wire's
// centre. Coils closer than one wire diameter would pass through each other: refused (a solid spring is len = turns·2·wire).
export function spring({ r, wire, turns, len, seg = 24 } = {}) {
  for (const [k, v] of Object.entries({ r, wire, turns, len })) if (!(finite(v) && v > 0)) throw new Error(`spring: ${k} must be a number > 0, got ${v}`);
  if (len / turns < 2 * wire) throw new Error(`spring: coils pass through each other (pitch ${len / turns} m under the wire diameter ${2 * wire} m)`);
  const n = Math.max(32, Math.ceil(turns * seg)), pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n, a = u * turns * 2 * Math.PI; pts.push(new THREE.Vector3(r * Math.cos(a), wire + u * (len - 2 * wire), r * Math.sin(a))); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 8, false);
  g.userData.spring = { r, wire, turns, len };
  return g;
}

// lathe(profile, { seg }): a turned part about +y; profile [[r, y], ...] in metres, r >= 0, at least 3 points. It is a
// closed solid only when the profile starts and ends on r = 0 and runs bottom to top (else it is inside out: a last y
// below the first is refused).
export function lathe(profile, { seg = 64 } = {}) {
  if (!Array.isArray(profile) || profile.length < 3 || !profile.every((p) => finite(p?.[0]) && finite(p?.[1]) && p[0] >= 0))
    throw new Error("lathe: profile is [[r, y], ...] with r >= 0, at least 3 points");
  if (profile.at(-1)[1] < profile[0][1]) throw new Error("lathe: profile must run bottom to top (its last y is below its first y, so it would be inside out)");
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.userData.lathe = { profile };
  return g;
}

// rod(a, b, r, { seg }): a round bar from point a to point b (a link, a shaft, a pin), capped at both ends.
export function rod(a, b, r, { seg = 24 } = {}) {
  if (![a, b].every((p) => Array.isArray(p) && p.length === 3 && p.every(finite))) throw new Error("rod: a and b are each [x, y, z], three finite numbers in metres");
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  if (!(len > 0)) throw new Error("rod: a and b must differ (length > 0)");
  if (!(finite(r) && r > 0)) throw new Error(`rod: r must be a number > 0, got ${r}`);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate(A.x, A.y, A.z);
  g.userData.rod = { a, b, r, len };
  return g;
}
