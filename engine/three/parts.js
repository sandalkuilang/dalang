import { THREE } from "./three-vendor.js";

// Code-first hero parts: the machine built from its real numbers in metres, no modelling tool (the method of
// elvarofficial/teardown, MIT). Each function returns a closed BufferGeometry (the cutaway's stencil counts its faces;
// a spring's tube is open at its ends: mark its mesh userData.cut = { shell: wire }) and keeps the numbers that size
// it in geometry.userData, so the film's MODEL check reads the same numbers the picture was built from.
//
//   import { gear, bevelGear, bevelAngles, spring, lathe, rod } from "./parts.js";
//   const pinion = new THREE.Mesh(gear(32, 0.004, 0.02, { bore: 0.01 }), mat.steel());   // pitch r 64 mm
//   const [d1, d2] = bevelAngles(20, 40);   // a right-angle pair: tan d1 = 20/40 (radians)
//   const crown = new THREE.Mesh(bevelGear({ teeth: 40, module: 0.003, pitchAngle: d2, face: 0.015 }), mat.steel());
//   const coil = new THREE.Mesh(spring({ r: 0.01, wire: 0.001, turns: 8, len: 0.04 }), mat.steel());
//   const piston = new THREE.Mesh(lathe([[0, 0], [0.05, 0], [0.05, 0.06], [0, 0.06]]), mat.steel());
//   const link = new THREE.Mesh(rod([0, 0, 0], [0.1, 0.2, 0], 0.006), mat.gloss());

const finite = (v) => typeof v === "number" && Number.isFinite(v);

// gear(teeth, module, width, { helix, bore, seg }): a spur gear on +z, centred on its width. Pitch radius
// module·teeth/2, tip = pitch + module, root = pitch − 1.25·module (ISO 53 proportions). helix: the twist across the
// width in radians (a helical gear). bore: the shaft hole's radius.
export function gear(teeth, module, width, { helix = 0, bore = 0, seg = 4 } = {}) {
  if (!Number.isInteger(teeth) || teeth < 6) throw new Error(`gear: teeth must be an integer >= 6, got ${teeth}`);
  if (!(finite(module) && module > 0) || !(finite(width) && width > 0)) throw new Error("gear: module and width are lengths > 0 in metres");
  if (!finite(helix)) throw new Error(`gear: helix must be a finite angle in radians, got ${helix}`);
  const rp = (module * teeth) / 2, ro = rp + module, rr = rp - 1.25 * module;
  if (!(finite(bore) && bore >= 0 && bore < rr)) throw new Error(`gear: bore must be 0 or under the root radius ${rr} m, got ${bore}`);
  const sh = new THREE.Shape(), da = (2 * Math.PI) / teeth;
  for (let i = 0; i < teeth; i++)
    [[rr, 0], [rr, 0.2], [ro, 0.35], [ro, 0.6], [rr, 0.75]].forEach(([r, f], k) => {
      const a = (i + f) * da, x = r * Math.cos(a), y = r * Math.sin(a);
      if (i === 0 && k === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
    });
  sh.closePath();
  if (bore) { const h = new THREE.Path(); h.absarc(0, 0, bore, 0, 2 * Math.PI, true); sh.holes.push(h); }
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

// bevelAngles(z1, z2, shaft): the pitch angles [d1, d2] in radians of two bevel gears whose axes meet at `shaft`
// (default a right angle): tan d1 = sin S / (z2 / z1 + cos S), d2 = S - d1.
export function bevelAngles(z1, z2, shaft = Math.PI / 2) {
  if (![z1, z2].every((z) => Number.isInteger(z) && z >= 6)) throw new Error(`bevelAngles: teeth must be integers >= 6, got ${z1}, ${z2}`);
  if (!(finite(shaft) && shaft > 0 && shaft < Math.PI)) throw new Error(`bevelAngles: shaft must be an angle in (0, pi) radians, got ${shaft}`);
  const d1 = Math.atan2(Math.sin(shaft), z2 / z1 + Math.cos(shaft));
  return [d1, shaft - d1];
}

// bevelGear({ teeth, module, pitchAngle, face, bore, seg }): a straight bevel gear on +z with its cone apex at the
// origin and its teeth facing it (the gear lies at z < 0). module is at the heel (outer end): heel pitch radius
// rp = module·teeth/2, cone distance R = rp / sin(pitchAngle); addendum module and dedendum 1.25·module measured square
// to the pitch cone, every tooth line running to the apex. face: the tooth length along the cone, at most R/3 (the
// usual design limit; longer teeth go thin at the toe). pitchAngle in radians (bevelAngles). Two gears mesh when they
// share the origin and the second is turned so its +z is the other shaft. A hypoid (axes offset, not meeting) is
// drawn as a bevel pair with the pinion moved by the offset: true ratio and placement, straight (not curved) teeth, a
// documented approximation; audit it as a plain mesh (ratio only).
export function bevelGear({ teeth, module, pitchAngle, face, bore = 0, seg = 4 } = {}) {
  if (!Number.isInteger(teeth) || teeth < 6) throw new Error(`bevelGear: teeth must be an integer >= 6, got ${teeth}`);
  if (!(finite(module) && module > 0) || !(finite(face) && face > 0)) throw new Error("bevelGear: module and face are lengths > 0 in metres");
  if (!(finite(pitchAngle) && pitchAngle > 0 && pitchAngle < Math.PI / 2)) throw new Error(`bevelGear: pitchAngle must be in (0, pi/2) radians, got ${pitchAngle}`);
  const rp = (module * teeth) / 2, R = rp / Math.sin(pitchAngle), c = Math.cos(pitchAngle), s = Math.sin(pitchAngle);
  if (face > R / 3 + 1e-12) throw new Error(`bevelGear: face ${face} m is over a third of the cone distance ${R} m`);
  const ro = rp + module * c, rr = rp - 1.25 * module * c, rrToe = ((R - face) / R) * rr;
  if (!(finite(bore) && bore >= 0 && bore < rrToe)) throw new Error(`bevelGear: bore must be 0 or under the toe's root radius ${rrToe} m, got ${bore}`);
  // the heel outline drawn flat (as gear() draws it), then laid on the cone: a point h0 off the pitch circle, a
  // fraction k = rho / R of the way to the apex, goes to radius rho·sin + h·cos and height −rho·cos + h·sin (h = h0·k)
  const r2o = rp + module, r2r = rp - 1.25 * module, sh = new THREE.Shape(), da = (2 * Math.PI) / teeth;
  for (let i = 0; i < teeth; i++)
    [[r2r, 0], [r2r, 0.2], [r2o, 0.35], [r2o, 0.6], [r2r, 0.75]].forEach(([r, f], k) => {
      const a = (i + f) * da, x = r * Math.cos(a), y = r * Math.sin(a);
      if (i === 0 && k === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
    });
  sh.closePath();
  if (bore) { const h = new THREE.Path(); h.absarc(0, 0, r2r / 2, 0, 2 * Math.PI, true); sh.holes.push(h); } // placeholder, mapped to the bore below
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: seg, steps: 1 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), r2 = Math.hypot(x, y), a = Math.atan2(y, x), rho = R - face * p.getZ(i), k = rho / R;
    const hole = bore > 0 && r2 < 0.75 * r2r, h = (hole ? -1.25 * module : r2 - rp) * k, r = hole ? bore : rho * s + h * c;
    p.setXYZ(i, r * Math.cos(a), r * Math.sin(a), -rho * c + h * s);
  }
  g.computeVertexNormals();
  g.userData.bevel = { teeth, module, pitchAngle, face, bore, rp, ro, rr, R, apex: [0, 0, 0] };
  return g;
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
