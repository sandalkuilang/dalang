import { THREE } from "./three-vendor.js";
import { M, tone } from "./kit.js";

// Printed markings on any mesh, at their real size: text, warning and standard symbols, stickers. A marking is a decal
// built by projection: a grid of points laid in the plane of the print is cast onto the target along its normal, and each
// hit is lifted off the surface by the print's thickness. It therefore follows a cylinder, never floats over a bevel and,
// because its vertices are converted into the target's own space, is never flattened by the target's (non-uniform) scale:
// its size in the world is the size it was asked for. Sizes in metres, positions in scene units (metres / M), directions
// are world directions. A marking is added as a child of `target` (it moves with the part) and nothing else is added to
// the scene.
//
//   const { items } = markings(capBody, [{ text: ["22µF", "400V"], h: 0.002, at: onTheSleeve, normal: outward, style: "pad" }]);
//   glyphPx(items[0], camera, 1080) >= READ_PX;      // is the 2 mm cap height tall enough to read at this station?
//
// Item: { text (a string or an array of lines) and / or icon, h (cap height, metres), at (the print's centre, a Vector3 on
// the surface), normal (outward), style, up (the direction of the text's top, default world +Y; the text reads from +z when
// the face is horizontal), wear 0..1, size (icon side, default 3 h), w, hh (override the print's size), ink, ground (a
// sticker's paper), seed }. The self-check reads every print from `mesh.userData.marking` ({ text, icon, h, w, hh, style,
// wear }); the film's detail check can do the same.

export const READ_PX = 12; // the cap height in px under which printed text does not read in a frame (about a 17 px sans font): a decision, no standard gives one
const CAP = 0.7;           // cap height as a fraction of the em of a sans font
const ADVANCE = 0.6;       // the widest average advance of a sans caps and digits line, in em
const LINE = 1.25;         // line pitch in em
const NUDGE = [[0, 0], [1, 0.7], [-1, 0.7], [0.7, -1], [-0.7, -1]];
const WHITE =new THREE.Color(1, 1, 1);

// Print styles: ink (hex; null = the target's own colour, lightened), roughness, lift (the ink's or paper's thickness, m),
// pad (margin round the text, in cap heights). Silkscreen is white epoxy ink in capitals; laser is etched into the
// surface and so only a paler shade of it; a sticker is a paper ground (0.1 mm) with ink on it, one corner curled.
export const STYLES = {
  pad: { ink: 0xf2f2ee, roughness: 0.5, lift: 0.00005, pad: 0.1 },
  silkscreen: { ink: 0xf4f4f0, roughness: 0.8, lift: 0.00004, pad: 0.1, upper: true },
  laser: { ink: null, roughness: 0.9, lift: 0.00002, pad: 0.1 },
  sticker: { ink: 0x1b1b1b, ground: 0xf3efe2, roughness: 0.7, lift: 0.0001, pad: 0.35 },
};
export const ICONS = ["W012", "earth", "class2", "dot", "vent", "screw"]; // ISO 7010 W012 electricity warning, IEC 60417-5019 earth, -5172 class II, a dot, a vent cross, a screw head

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const linesOf = (text) => (text === undefined ? [] : [].concat(text).map(String));
const hexStyle = (c) => "#" + (c.isColor ? c : new THREE.Color(c)).getHexString();

// The size a text of `lines` lines at cap height h takes, with its margin: { w, hh } in metres. Linear in h, so a caller
// that must fit a face scales h by the ratio (electronics.js does).
export function textSize(lines, h, pad = STYLES.pad.pad) {
  const ls = linesOf(lines), em = h / CAP, n = Math.max(0, ...ls.map((l) => [...l].length));
  return { w: n * ADVANCE * em + 2 * pad * h, hh: ls.length * LINE * em + 2 * pad * h };
}

function tex(wpx, hpx, draw) {
  if (typeof document === "undefined") return new THREE.Texture(); // headless (node checks): no canvas
  const cv = document.createElement("canvas");
  cv.width = wpx; cv.height = hpx;
  draw(cv.getContext("2d"));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Icons in a box (x, y, s x s) of the canvas. Fixed standard colours where the standard has them; `ink` for the rest.
const ICON = {
  W012(c, x, y, s) { // yellow triangle, black border, black bolt
    c.beginPath(); c.moveTo(x + s * 0.5, y + s * 0.06); c.lineTo(x + s * 0.97, y + s * 0.92); c.lineTo(x + s * 0.03, y + s * 0.92); c.closePath();
    c.fillStyle = "#f9c80e"; c.fill(); c.lineWidth = s * 0.07; c.lineJoin = "round"; c.strokeStyle = "#111"; c.stroke();
    c.beginPath(); [[0.56, 0.36], [0.4, 0.64], [0.5, 0.64], [0.43, 0.84], [0.62, 0.55], [0.52, 0.55], [0.6, 0.36]].forEach(([a, b], i) => (i ? c.lineTo(x + a * s, y + b * s) : c.moveTo(x + a * s, y + b * s)));
    c.closePath(); c.fillStyle = "#111"; c.fill();
  },
  earth(c, x, y, s, ink) { // a stem and three bars shortening downwards
    c.strokeStyle = ink; c.lineWidth = s * 0.09; c.lineCap = "butt";
    c.beginPath(); c.moveTo(x + s * 0.5, y + s * 0.08); c.lineTo(x + s * 0.5, y + s * 0.5);
    [[0.5, 0.15, 0.85], [0.66, 0.28, 0.72], [0.82, 0.4, 0.6]].forEach(([b, a, z]) => { c.moveTo(x + a * s, y + b * s); c.lineTo(x + z * s, y + b * s); }); c.stroke();
  },
  class2(c, x, y, s, ink) { // a square within a square
    c.strokeStyle = ink; c.lineWidth = s * 0.08; c.strokeRect(x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84); c.strokeRect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4);
  },
  dot(c, x, y, s, ink) { c.fillStyle = ink; c.beginPath(); c.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); c.fill(); },
  vent(c, x, y, s, ink) { c.fillStyle = ink; c.fillRect(x, y + s * 0.42, s, s * 0.16); c.fillRect(x + s * 0.42, y, s * 0.16, s); },
  screw(c, x, y, s, ink) { // a slotted head: the metal disc and its dark slot
    c.fillStyle = ink; c.beginPath(); c.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#2a2a28"; c.fillRect(x + s * 0.12, y + s * 0.42, s * 0.76, s * 0.16);
  },
};

// markings(target, items, { wear, seed }): see the header. Returns { group: target, items: [{ mesh, text, icon, style, h, w,
// hh, wear, centre (world, on the surface), up, right, normal }] }.
export function markings(target, items, { wear = 0, seed = 1 } = {}) {
  let meshes = [];
  if (target?.isObject3D) target.traverse((o) => { if (o.isMesh && !o.userData.marking) meshes.push(o); });
  if (!meshes.length) throw new Error("markings: target must be a THREE.Object3D with at least one mesh to print on");
  if (!Array.isArray(items) || !items.length) throw new Error("markings: items must be a non-empty array of { text | icon, h, at, normal, style }");
  if (!(finite(wear) && wear >= 0 && wear <= 1)) throw new Error(`markings: wear must be a number between 0 and 1, got ${wear}`);
  target.updateWorldMatrix(true, true);
  const inv = target.matrixWorld.clone().invert(), out = [], rc = new THREE.Raycaster(), nm = new THREE.Matrix3();
  items.forEach((item, at0) => {
    const tag = `markings: item ${at0} `;
    if (!(finite(item?.h) && item.h > 0)) throw new Error(tag + `h (cap height in metres) must be a finite number > 0, got ${item?.h}`);
    if (!item.at?.isVector3) throw new Error(tag + "at must be a THREE.Vector3 (the print's centre on the surface, scene units)");
    if (!item.normal?.isVector3 || !(item.normal.lengthSq() > 0)) throw new Error(tag + "normal must be a non-zero THREE.Vector3 (the surface's outward direction, world)");
    const style = STYLES[item.style];
    if (!style) throw new Error(tag + `style must be one of ${Object.keys(STYLES).join(", ")}, got ${item.style}`);
    if (item.icon !== undefined && !ICONS.includes(item.icon)) throw new Error(tag + `icon must be one of ${ICONS.join(", ")}, got ${item.icon}`);
    const lines = linesOf(item.text).map((l) => (style.upper ? l.toUpperCase() : l));
    if (!lines.length && item.icon === undefined) throw new Error(tag + "needs text (a string or an array of lines) or an icon");
    const wr = item.wear ?? wear;
    if (!(finite(wr) && wr >= 0 && wr <= 1)) throw new Error(tag + `wear must be a number between 0 and 1, got ${wr}`);

    // The print's frame: right x up = normal, so the face looks at the viewer.
    const n = item.normal.clone().normalize();
    let up = (item.up ? item.up.clone() : new THREE.Vector3(0, 1, 0)).projectOnPlane(n);
    if (!(up.lengthSq() > 1e-6) || (!item.up && Math.abs(n.y) > 0.99)) up = new THREE.Vector3(0, 0, -1).projectOnPlane(n);
    up.normalize();
    const right = new THREE.Vector3().crossVectors(up, n).normalize();

    // Its size in metres.
    const h = item.h, em = h / CAP, padM = style.pad * h, iconM = item.icon ? item.size ?? 3 * h : 0;
    const tw = Math.max(0, ...lines.map((l) => [...l].length)) * ADVANCE * em, th = lines.length * LINE * em;
    const w = item.w ?? iconM + (iconM && tw ? h : 0) + tw + 2 * padM, hh = item.hh ?? Math.max(th, iconM) + 2 * padM;
    if (!(finite(w) && w > 0 && finite(hh) && hh > 0)) throw new Error(tag + "w and hh must be finite numbers > 0 (metres)");

    // The grid projected onto the target.
    const sticker = item.style === "sticker", cell = 0.0005;
    const nu = clamp(Math.ceil(w / cell) + 1, sticker ? 8 : 2, 32), nv = clamp(Math.ceil(hh / cell) + 1, sticker ? 8 : 2, 32);
    const probe = Math.max(w, hh, 0.005) / M, curl = Math.min(0.0015, 0.15 * Math.min(w, hh));
    const pos = new Float32Array(nu * nv * 3), uv = new Float32Array(nu * nv * 2), idx = [];
    const p = new THREE.Vector3(), o = new THREE.Vector3(), hn = new THREE.Vector3(), back = n.clone().negate();
    let ground = null;
    rc.near = 0; rc.far = probe + Math.max(w, hh) / M;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const u = i / (nu - 1), v = j / (nv - 1);
      p.copy(item.at).addScaledVector(right, ((u - 0.5) * w) / M).addScaledVector(up, ((v - 0.5) * hh) / M);
      let hit;
      for (const [a, b] of NUDGE) { // a ray that runs exactly along a mesh edge can slip between its two triangles: nudge it 10 µm
        o.copy(p).addScaledVector(n, probe).addScaledVector(right, (a * 1e-5) / M).addScaledVector(up, (b * 1e-5) / M);
        rc.set(o, back);
        hit = rc.intersectObjects(meshes, false)[0];
        if (hit) break;
      }
      if (!hit) throw new Error(tag + "the marking overhangs the surface: make w and h smaller or move at");
      hn.copy(hit.face.normal).applyNormalMatrix(nm.getNormalMatrix(hit.object.matrixWorld)).normalize();
      if (hn.dot(n) < 0.5) throw new Error(tag + "the marking wraps too far round a curve (or over an edge): make it narrower or move at");
      if (!ground) { const mt = [].concat(hit.object.material)[hit.face.materialIndex ?? 0] ?? [].concat(hit.object.material)[0]; ground = mt?.color?.clone?.() ?? new THREE.Color(0x808080); }
      const s = sticker ? Math.max(0, (u + v - 1.7) / 0.3) : 0, lift = style.lift + curl * s * s; // a paper corner lifting
      p.copy(hit.point).addScaledVector(hn, lift / M).applyMatrix4(inv);
      const k = j * nu + i; pos.set([p.x, p.y, p.z], k * 3); uv.set([u, v], k * 2);
    }
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = j * nu + i, b = a + 1, c = b + nu, d = a + nu; idx.push(a, b, c, a, c, d); } // wound so the face normal is +n
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeVertexNormals();

    // Its texture: 48 px of cap height where the canvas allows (each side at most 2048 px).
    const ppm = Math.min(48 / h, 2048 / Math.max(w, hh)), wpx = Math.max(2, Math.ceil(w * ppm)), hpx = Math.max(2, Math.ceil(hh * ppm));
    const inkColor = style.ink === null ? ground.clone().lerp(WHITE, 0.35) : new THREE.Color(item.ink ?? style.ink);
    const paper = new THREE.Color(item.ground ?? style.ground ?? 0xffffff), ink = hexStyle(inkColor), sd = (item.seed ?? seed) + at0 * 0.37;
    const map = tex(wpx, hpx, (c) => {
      if (sticker) { c.fillStyle = hexStyle(paper); c.fillRect(0, 0, wpx, hpx); }
      const emPx = em * ppm, pad = padM * ppm, ip = iconM * ppm;
      if (item.icon) ICON[item.icon](c, pad, (hpx - ip) / 2, ip, item.icon === "screw" ? hexStyle(item.ink ?? 0xa5a5a0) : ink);
      if (lines.length) {
        const x0 = pad + (ip ? ip + h * ppm : 0), zw = wpx - pad - x0;
        c.font = `600 ${emPx}px Helvetica, Arial, sans-serif`; c.fillStyle = ink; c.textAlign = "center"; c.textBaseline = "alphabetic";
        const top = (hpx - lines.length * LINE * emPx) / 2;
        lines.forEach((l, i) => c.fillText(l, x0 + zw / 2, top + (i * LINE + (LINE + CAP) / 2) * emPx, zw));
      }
      if (wr > 0) { // rubbed and chipped: specks and a worn band along the bottom edge are cut out of the ink
        c.globalCompositeOperation = "destination-out"; c.fillStyle = "#000";
        for (let i = 0; i < Math.round(wr * 300); i++) { c.beginPath(); c.arc(tone(i * 2, sd) * wpx, tone(i * 2 + 1, sd) * hpx, 0.5 + tone(i * 3 + 7, sd) * 2, 0, Math.PI * 2); c.fill(); }
        c.globalAlpha = 0.6 * wr; c.fillRect(0, hpx * 0.85, wpx, hpx * 0.15); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
      }
    });
    const headless = typeof document === "undefined";
    const mat = new THREE.MeshStandardMaterial({ map, color: headless ? (sticker ? paper : inkColor) : 0xffffff, transparent: true, alphaTest: 0.02, depthWrite: false, roughness: style.roughness, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.name = "marking " + (lines.length ? lines.join(" ") : item.icon);
    mesh.userData.marking = { text: item.text, icon: item.icon, h, w, hh, style: item.style, wear: wr };
    target.add(mesh); mesh.updateWorldMatrix(true, false);
    out.push({ mesh, text: item.text, icon: item.icon, style: item.style, h, w, hh, wear: wr, centre: item.at.clone(), up, right, normal: n });
  });
  return { group: target, items: out };
}

// glyphPx(item, camera, H): the cap height of a marking on screen, in px of a frame H px tall (W = H x the camera's
// aspect). 0 when the print is behind the camera, outside its depth range or faces away from it. Call after the camera is
// placed (camera.js place()); the projection is the caller's.
export function glyphPx(item, camera, H) {
  camera.updateMatrixWorld();
  const cp = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  if (item.normal.dot(cp.sub(item.centre)) <= 0) return 0;
  const half = item.up.clone().multiplyScalar(item.h / 2 / M), a = item.centre.clone().add(half).project(camera), b = item.centre.clone().sub(half).project(camera);
  if (Math.abs(a.z) > 1 || Math.abs(b.z) > 1) return 0;
  const W = H * camera.aspect;
  return Math.hypot(((a.x - b.x) * W) / 2, ((a.y - b.y) * H) / 2);
}

export const legible = (item, camera, H, floor = READ_PX) => glyphPx(item, camera, H) >= floor;
