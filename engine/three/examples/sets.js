import { THREE } from "../three-vendor.js";
import { M, tone } from "../kit.js";

// Ready sets per subject class, so a film assembles its world from proven parts instead of modelling a desk, a bench
// or a kitchen in code every time: desk, workbench, counter, plinth, room. Each is modelled in metres at its real
// size (cited standard heights), carries true surfaces (wood grain, stone, plaster, painted cabinets) and dressing at
// a real density (what is really there, showing use), and leaves a clear area for the hero.
//   import * as sets from "../assets/engine/examples/sets.js";
//   const desk = sets.desk(kit, { at: V(0, 0, 0) });        // at: the floor point under the set's footprint centre (units)
//   await kit.model("assets/models/hero.glb", { real });       // a CC0 / CC BY hero (find_media.mjs --type model)
//   desk.place(hero, { u: 0.5, v: 0.6 });                      // by footprint, on the top, inside the clear area
//   kit.settle();                                              // contact made exact (every part is rested)
//   studio(renderer, scene, camera, { preset: desk.preset, set: desk.bounds() });
// Returns { name, body, props, top, area, preset, spot(u, v), place(obj, opts), bounds() }: top is the work surface's
// height (units), area the Box3 kept clear of dressing (units, flat at top), preset the studio() light that suits it.
// dress: false leaves the top bare; a set too small for its dressing throws rather than crowding the hero.
// Every part is its own piece at the scene root with its real size declared (scaleAudit passes, nothing unchecked)
// and rested, so settle() lands it on what is under it. Seeded: the same options build the same set (a bake hashes it).
// ponytail: no rotation (turn the camera, not the set); add `ry` when a film needs two sets facing each other.

const wood = (k, hex, r = 0.5) => k.surface(new THREE.MeshStandardMaterial({ color: hex, roughness: r }), "wood");
const steel = (k, hex = 0xb9bec2, r = 0.35) => k.surface(new THREE.MeshStandardMaterial({ color: hex, metalness: 1, roughness: r }), "micro");
const stone = (k, hex) => k.surface(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.38 }), "stone");
// Solid wood with its grain drawn along the board (long streaks, a few darker growth lines), over the surface's detail.
const grained = (k, hex, r = 0.45) => { const m = wood(k, hex, r); m.map = k.canvasTex(512, 512, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 512, 512); for (let y = 0; y < 512; y += 2) { const t = tone(y, 5); c.fillStyle = `rgba(70,40,15,${0.04 + 0.1 * t * t})`; c.fillRect(0, y + Math.sin(y * 0.05) * 3, 512, 1 + (t > 0.9 ? 2 : 0)); } }); return m; };
const glaze = (hex) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 });

// A piece: one prop at the scene root, modelled in metres (its group is scaled 1/M), standing at (x, z) metres from the
// set's origin on height y metres. real: its size in metres, checked by scaleAudit.
function piece(k, s, name, real, x, y, z, { rest = true, ry = 0 } = {}) {
  const g = new THREE.Group();
  g.name = s.name + " " + name;
  g.scale.setScalar(1 / M);
  g.position.set(s.at.x + x / M, s.at.y + y / M, s.at.z + z / M);
  g.rotation.y = ry;
  g.userData.real = real;
  k.scene.add(g);
  if (rest) k.rest(g);
  return g;
}
const put = (o, x, y, z, g) => { o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
const cyl = (r, h, m, x, y, z, g, r2 = r, seg = 48) => put(new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), m), x, y, z, g); // r: bottom, r2: top
const lathe = (pts, m, g, seg = 64) => put(new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m), 0, 0, 0, g);

// The set's frame: what every set returns. area: [x0, x1, z0, z1] metres from the origin, on the top at `top` metres.
function frame(k, s, body, props, top, area, preset) {
  const [x0, x1, z0, z1] = area;
  if (!(x1 - x0 > 0.05 && z1 - z0 > 0.05)) throw new Error(`sets.${s.name}: no room left for the hero (${((x1 - x0) * 100).toFixed(0)} x ${((z1 - z0) * 100).toFixed(0)} cm clear); make it larger or pass dress: false`);
  const y = s.at.y + top / M;
  const box = new THREE.Box3(new THREE.Vector3(s.at.x + x0 / M, y, s.at.z + z0 / M), new THREE.Vector3(s.at.x + x1 / M, y, s.at.z + z1 / M));
  const spot = (u = 0.5, v = 0.5) => new THREE.Vector3(box.min.x + u * (box.max.x - box.min.x), y, box.min.z + v * (box.max.z - box.min.z));
  // place(obj): the hero by its footprint centre at spot(u, v), its lowest point on the top, rested; refused when its
  // footprint leaves the clear area (it would stand in the dressing or hang off the edge).
  function place(obj, { u = 0.5, v = 0.5 } = {}) {
    if (!obj.parent) k.scene.add(obj);
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj, true), c = b.getCenter(new THREE.Vector3()), p = spot(u, v);
    obj.position.x += p.x - c.x; obj.position.y += y - b.min.y; obj.position.z += p.z - c.z;
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z, eps = 0.0005 / M;
    if (p.x - w / 2 < box.min.x - eps || p.x + w / 2 > box.max.x + eps || p.z - d / 2 < box.min.z - eps || p.z + d / 2 > box.max.z + eps)
      throw new Error(`sets.${s.name}.place(${obj.name || obj.type}): ${(w * M * 100).toFixed(0)} x ${(d * M * 100).toFixed(0)} cm does not fit the clear area ${((box.max.x - box.min.x) * M * 100).toFixed(0)} x ${((box.max.z - box.min.z) * M * 100).toFixed(0)} cm at u ${u}, v ${v}`);
    k.rest(obj);
    return obj;
  }
  const bounds = () => { const b = new THREE.Box3(); [body, ...props].forEach((o) => b.expandByObject(o, true)); return b; };
  return { name: s.name, body, props, top: y, area: box, preset, spot, place, bounds };
}
const start = (name, at) => { if (!at?.isVector3) throw new Error(`sets.${name}: at is a THREE.Vector3, the floor point under the set (units)`); return { name, at }; };

// A desk (EN 527: work surface 0.72-0.76 m high; 1.2 x 0.6 m top): a 25 mm solid-wood top with its grain, tapered
// legs, aprons and a drawer with a brass knob; dressed as a desk in use: a lamp that is on (its shade lit, its bulb a
// light that pools on the top) with its cable down to the floor, an open laptop with a page on its screen, an open
// notebook written in with a pen across it, a stack of books, a pot of pencils, papers with a phone on them, a mug of
// coffee on a cork coaster.
export function desk(k, { at, w = 1.2, d = 0.6, h = 0.75, top = 0xb07f4f, dress = true } = {}) {
  const s = start("desk", at), T = 0.025, A = 0.075;
  const body = piece(k, s, "frame", { h, w, d }, 0, 0, 0), oak = grained(k, top), ink = "rgba(25,40,95,0.85)";
  k.box(w, T, d, oak, 0, h - T / 2, 0, body);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.016, h - T, oak, sx * (w / 2 - 0.05), (h - T) / 2, sz * (d / 2 - 0.05), body, 0.024, 24); // tapered legs
  for (const sz of [-1, 1]) k.box(w - 0.12, A, 0.02, oak, 0, h - T - A / 2, sz * (d / 2 - 0.05), body); // the aprons
  for (const sx of [-1, 1]) k.box(0.02, A, d - 0.12, oak, sx * (w / 2 - 0.05), h - T - A / 2, 0, body);
  k.box(0.5, A - 0.016, 0.008, grained(k, top, 0.5), w / 4 - 0.1, h - T - A / 2, d / 2 - 0.036, body); // the drawer front
  put(new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), steel(k, 0xc8a45a, 0.3)), w / 4 - 0.1, h - T - A / 2, d / 2 - 0.026, body);
  if (!dress) return frame(k, s, body, [], h, [-w / 2 + 0.02, w / 2 - 0.02, -d / 2 + 0.02, d / 2 - 0.02], "warm");
  const props = [];
  // The lamp: a weighted base, a stem, a shade whose inside glows (a lit lamp, never a dead one).
  const lx = -w / 2 + 0.16, lz = -d / 2 + 0.14, lamp = piece(k, s, "lamp", { h: 0.47 }, lx, h, lz), dark = steel(k, 0x2e3236, 0.45);
  cyl(0.075, 0.018, dark, 0, 0.009, 0, lamp);
  cyl(0.007, 0.36, dark, 0, 0.018 + 0.18, 0, lamp);
  const shade = lathe([[0.012, 0.47], [0.05, 0.465], [0.085, 0.38], [0.082, 0.375], [0.047, 0.458], [0.01, 0.462]], k.mat(0x34506e, 0.6), lamp);
  shade.material.side = THREE.DoubleSide;
  put(new THREE.Mesh(new THREE.CircleGeometry(0.03, 32), k.glow), 0, 0.452, 0, lamp).rotation.x = Math.PI / 2; // the bulb's face, seen from below
  // The bulb's light, 2700 K. Its range and intensity are in metres: in units the range is 2.5 / M and the intensity
  // 3 / M^2 (inverse square over unit distances), so the pool on the top is as bright at any scale.
  const bulb = new THREE.PointLight(0xffc98a, 3 / (M * M), 2.5 / M, 2);
  bulb.position.set(0, 0.43, 0); bulb.name = "desk lamp bulb"; lamp.add(bulb);
  props.push(lamp);
  // Its cable: from the base, off the back edge, down to the floor (lies flat where it reaches it).
  const C = (x, y, z) => new THREE.Vector3(s.at.x + x / M, s.at.y + y / M, s.at.z + z / M);
  const cable = k.tube([C(lx, h + 0.004, lz - 0.07), C(lx + 0.02, h + 0.004, -d / 2 + 0.01), C(lx + 0.03, h - 0.03, -d / 2 - 0.02), C(lx + 0.05, 0.3, -d / 2 - 0.03), C(lx + 0.12, 0.004, -d / 2 - 0.05), C(lx + 0.4, 0.004, -d / 2 - 0.08)], 0.004 / M, k.mat(0x222426, 0.6), s.at.y + 0.004 / M);
  cable.name = "desk lamp cable"; cable.userData.real = { h: h + 0.008 };
  props.push(cable);
  // An open 13-inch laptop (30 x 21 cm, 15 mm), its lid at 108 degrees, a page of text lit on the screen.
  const lap = piece(k, s, "laptop", { h: 0.22 }, -w / 2 + 0.5, h, -d / 2 + 0.2, { ry: 0.12 }), al = steel(k, 0xa9acb0, 0.32), LW = 0.304, LD = 0.212;
  k.box(LW, 0.015, LD, al, 0, 0.0075, 0, lap);
  const keys = k.canvasTex(512, 360, (c) => { c.fillStyle = "#9fa3a8"; c.fillRect(0, 0, 512, 360); c.fillStyle = "#2a2c30"; for (let r = 0; r < 6; r++) for (let q = 0; q < 14; q++) c.fillRect(35 + q * 32, 24 + r * 31, 28, r ? 27 : 15); c.fillStyle = "#94989d"; c.fillRect(165, 230, 182, 115); });
  put(new THREE.Mesh(new THREE.PlaneGeometry(LW - 0.01, LD - 0.01), new THREE.MeshStandardMaterial({ map: keys, roughness: 0.55, metalness: 0.3 })), 0, 0.0154, 0, lap).rotation.x = -Math.PI / 2;
  const lid = new THREE.Group(); lid.position.set(0, 0.015, -LD / 2); lid.rotation.x = -108 * Math.PI / 180; lap.add(lid);
  k.box(LW, 0.006, LD, al, 0, 0.003, LD / 2, lid);
  const page = k.canvasTex(512, 340, (c) => { c.fillStyle = "#14161b"; c.fillRect(0, 0, 512, 340); c.fillStyle = "#f6f4ef"; c.fillRect(15, 13, 482, 314); c.fillStyle = "#2f2f2f"; for (let i = 0; i < 14; i++) c.fillRect(70, 52 + i * 19, i % 6 === 5 ? 120 : 280 + 150 * tone(i, 11), 8); c.fillStyle = "#222"; c.fillRect(85, 32, 150, 7); });
  put(new THREE.Mesh(new THREE.PlaneGeometry(LW - 0.018, LD - 0.022), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: page, emissiveIntensity: 0.9, roughness: 0.2 })), 0, -0.0004, LD / 2, lid).rotation.x = Math.PI / 2;
  props.push(lap);
  // An open A5 notebook (two 148 x 210 mm pages), written in, a pen across it.
  const ruled = k.canvasTex(1024, 720, (c) => {
    c.fillStyle = "#f5f1e6"; c.fillRect(0, 0, 1024, 720); c.strokeStyle = "rgba(90,120,170,0.45)"; c.lineWidth = 2;
    for (let y = 70; y < 700; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(1024, y); c.stroke(); }
    c.fillStyle = "rgba(60,40,20,0.25)"; c.fillRect(500, 0, 24, 720); c.strokeStyle = ink; c.lineWidth = 4; // the gutter, then the handwriting
    for (let li = 0; li < 32; li++) { const pg = li < 20 ? 0 : 1, row = pg ? li - 20 : li, x0 = pg ? 560 : 40, y = 64 + row * 26, len = row % 7 === 6 ? 180 : 380 + 50 * tone(li, 2); c.beginPath(); c.moveTo(x0, y); for (let x = 0; x < len; x += 3) c.lineTo(x0 + x, y - 6 + Math.sin(x * 0.55 + li) * 5 * (0.6 + tone(Math.floor(x / 14), li))); c.stroke(); }
  });
  const book = piece(k, s, "notebook", { h: 0.008 }, -w / 2 + 0.27, h, d / 2 - 0.14, { ry: 0.08 });
  k.box(0.31, 0.003, 0.218, k.cloth(0x8f6b4a, "fabric", 0.8), 0, 0.0015, 0, book);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.296, 0.005, 0.21), [k.mat(0xf3eee4, 0.8), k.mat(0xf3eee4, 0.8), new THREE.MeshStandardMaterial({ map: ruled, roughness: 0.85 }), k.mat(0xf3eee4, 0.8), k.mat(0xf3eee4, 0.8), k.mat(0xf3eee4, 0.8)]), 0, 0.0055, 0, book);
  props.push(book);
  const pen = piece(k, s, "pen", { h: 0.01 }, -w / 2 + 0.3, h + 0.008, d / 2 - 0.13, { ry: 0.5 });
  cyl(0.005, 0.14, steel(k, 0x1f2a44, 0.3), 0, 0.005, 0, pen).rotation.z = Math.PI / 2;
  props.push(pen);
  // A mug (82 mm across, 95 mm tall) of coffee on a cork coaster.
  const mx = w / 2 - 0.13, mz = d / 2 - 0.07, coaster = piece(k, s, "coaster", { h: 0.005 }, mx, h, mz);
  cyl(0.05, 0.005, k.surface(new THREE.MeshStandardMaterial({ color: 0xb48a5c, roughness: 0.9 }), "grains", { size: 0.002 }), 0, 0.0025, 0, coaster);
  props.push(coaster);
  const mug = piece(k, s, "mug", { h: 0.095 }, mx, h + 0.005, mz), ceramic = glaze(0x34506e);
  lathe([[0, 0], [0.039, 0], [0.041, 0.004], [0.041, 0.095], [0.037, 0.095], [0.036, 0.008], [0, 0.008]], ceramic, mug);
  put(new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 12, 32, Math.PI), ceramic), 0.041, 0.05, 0, mug).rotation.z = -Math.PI / 2;
  cyl(0.0365, 0.002, new THREE.MeshPhysicalMaterial({ color: 0x2b1a10, roughness: 0.08, clearcoat: 1 }), 0, 0.078, 0, mug);
  props.push(mug);
  // A few A4 sheets, each a little askew, a phone face up on them.
  const papers = piece(k, s, "papers", { h: 0.005 }, w / 2 - 0.16, h, -d / 2 + 0.34, { ry: Math.PI / 2 + 0.06 }), sheet = k.mat(0xf3eee4, 0.8);
  for (let i = 0; i < 5; i++) k.box(0.21, 0.001, 0.297, sheet, (tone(i, 1) - 0.5) * 0.01, 0.0005 + i * 0.001, (tone(i, 2) - 0.5) * 0.01, papers).rotation.y = (tone(i, 3) - 0.5) * 0.12;
  props.push(papers);
  const phone = piece(k, s, "phone", { h: 0.008 }, w / 2 - 0.15, h + 0.005, -d / 2 + 0.35, { ry: 0.3 });
  k.box(0.071, 0.008, 0.147, k.mat(0x1d1f22, 0.3), 0, 0.004, 0, phone);
  put(new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.138), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.08 })), 0, 0.0081, 0, phone).rotation.x = -Math.PI / 2; // the dark glass
  props.push(phone);
  // Three hardbacks lying stacked, none quite square on the one under it.
  const books = piece(k, s, "books", { h: 0.075 }, w / 2 - 0.38, h, -d / 2 + 0.11);
  [[0.24, 0.028, 0.17, 0x8f3b2e], [0.23, 0.024, 0.16, 0x34506e], [0.21, 0.023, 0.15, 0x6f7f6a]].reduce((y, [bw, bt, bd, c], i) => {
    const ry = (tone(i, 6) - 0.5) * 0.2;
    k.box(bw, bt, bd, k.cloth(c, "fabric", 0.7), 0, y + bt / 2, 0, books).rotation.y = ry;
    k.box(bw - 0.012, bt - 0.006, bd - 0.004, sheet, 0.006, y + bt / 2, 0, books).rotation.y = ry; // the pages, inside the boards on the fore-edge side
    return y + bt;
  }, 0);
  props.push(books);
  // A glazed pot of pencils and pens, leaning on its rim.
  const pot = piece(k, s, "pencil pot", { h: 0.17 }, w / 2 - 0.1, h, -d / 2 + 0.1);
  lathe([[0, 0], [0.036, 0], [0.037, 0.004], [0.037, 0.105], [0.034, 0.105], [0.033, 0.006], [0, 0.006]], glaze(0x6f7f6a), pot);
  [[0xe2b33c, 0.012, 0.01, 0.12], [0x1f2a44, -0.01, 0.008, -0.1], [0xb5674a, 0.004, -0.012, 0.06], [0xe2b33c, -0.012, -0.006, -0.14]].forEach(([c, dx, dz, tilt]) => {
    cyl(0.0035, 0.16, k.mat(c, 0.5), dx, 0.088, dz, pot).rotation.z = tilt;
  });
  props.push(pot);
  return frame(k, s, body, props, h, [-w / 2 + 0.47, w / 2 - 0.35, -d / 2 + 0.34, d / 2 - 0.03], "warm");
}

// A workbench (0.86-0.91 m, a woodworker's height at the wrist): a 45 mm laminated hardwood top on square legs with
// stretchers and a lower shelf; dressed with a pegboard of hung tools at the back, a vise on the front-left corner,
// offcuts and a tape measure.
export function workbench(k, { at, w = 1.8, d = 0.75, h = 0.9, top = 0xc9a274, frameColor = 0x8f6b4a, dress = true } = {}) {
  const s = start("workbench", at), T = 0.045;
  const body = piece(k, s, "frame", { h, w, d }, 0, 0, 0), legW = wood(k, frameColor, 0.6);
  k.box(w, T, d, wood(k, top, 0.55), 0, h - T / 2, 0, body);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.07, h - T, 0.07, legW, sx * (w / 2 - 0.08), (h - T) / 2, sz * (d / 2 - 0.08), body);
  for (const sz of [-1, 1]) k.box(w - 0.16, 0.07, 0.04, legW, 0, 0.2, sz * (d / 2 - 0.08), body); // the stretchers
  k.box(w - 0.2, 0.018, d - 0.2, wood(k, frameColor, 0.6), 0, 0.244, 0, body); // the lower shelf, on them
  if (!dress) return frame(k, s, body, [], h, [-w / 2 + 0.02, w / 2 - 0.02, -d / 2 + 0.02, d / 2 - 0.02], "warm");
  const props = [];
  // The pegboard: 6 mm hardboard, 25 mm hole pitch, standing on the back edge in two cleats; a hammer, a square,
  // a screwdriver and pliers hung on it.
  const pw = Math.min(1.2, w - 0.3), board = piece(k, s, "pegboard", { h: 0.6 }, 0, h, -d / 2 + 0.03), pegMat = k.mat(0xb48a5c, 0.85);
  pegMat.map = k.canvasTex(512, 256, (c) => { c.fillStyle = "#b48a5c"; c.fillRect(0, 0, 512, 256); c.fillStyle = "#3a2a1c"; for (let x = 512 / pw * 0.0125; x < 512; x += 512 / pw * 0.025) for (let y = 256 / 0.6 * 0.0125; y < 256; y += 256 / 0.6 * 0.025) { c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); } });
  k.box(pw, 0.6, 0.006, pegMat, 0, 0.3, 0, board);
  for (const sx of [-1, 1]) k.box(0.04, 0.05, 0.03, legW, sx * (pw / 2 - 0.05), 0.025, 0.018, board);
  const handle = wood(k, 0xb07a45, 0.5), iron = steel(k, 0x5b5f63, 0.45);
  k.box(0.025, 0.3, 0.02, handle, -pw / 2 + 0.15, 0.3, 0.013, board); k.box(0.1, 0.03, 0.025, iron, -pw / 2 + 0.15, 0.46, 0.0155, board); // the hammer, head up
  k.box(0.3, 0.025, 0.004, steel(k), -pw / 2 + 0.42, 0.45, 0.005, board); k.box(0.025, 0.2, 0.012, iron, -pw / 2 + 0.28, 0.36, 0.009, board); // the square
  cyl(0.012, 0.1, k.mat(0xb5674a, 0.4), pw / 2 - 0.25, 0.42, 0.015, board); cyl(0.003, 0.12, steel(k), pw / 2 - 0.25, 0.31, 0.015, board); // a screwdriver
  for (const sx of [-1, 1]) k.box(0.012, 0.16, 0.008, k.mat(0x2e3236, 0.6), pw / 2 - 0.12 + sx * 0.012, 0.32, 0.007, board).rotation.z = sx * 0.08; // pliers
  props.push(board);
  // A woodworker's vise on the front-left corner: a fixed jaw, a moving jaw, the screw and its tommy bar.
  const vise = piece(k, s, "vise", { h: 0.11 }, -w / 2 + 0.2, h, d / 2 - 0.09), cast = steel(k, 0x34506e, 0.55);
  k.box(0.18, 0.02, 0.12, cast, 0, 0.01, 0, vise); k.box(0.18, 0.09, 0.03, cast, 0, 0.065, -0.03, vise); k.box(0.18, 0.09, 0.03, cast, 0, 0.065, 0.045, vise);
  cyl(0.009, 0.13, steel(k), 0, 0.05, 0.09, vise).rotation.x = Math.PI / 2; cyl(0.005, 0.2, steel(k), 0, 0.05, 0.155, vise).rotation.z = Math.PI / 2;
  props.push(vise);
  // Offcuts and a tape measure on the right.
  [[0.3, 0.02, 0.07, 0.05], [0.18, 0.045, 0.045, -0.4], [0.22, 0.019, 0.09, 0.3]].forEach(([l, t, b, ry], i) => {
    const o = piece(k, s, "offcut " + (i + 1), { h: t }, w / 2 - 0.28 + (tone(i, 4) - 0.5) * 0.08, h, -0.02 + i * 0.12, { ry });
    k.box(l, t, b, wood(k, [0xd9b783, 0xc9a274, 0xb8925f][i], 0.6), 0, t / 2, 0, o);
    props.push(o);
  });
  const tape = piece(k, s, "tape measure", { h: 0.04 }, w / 2 - 0.08, h, d / 2 - 0.1);
  k.box(0.065, 0.04, 0.065, k.mat(0xe2b33c, 0.45), 0, 0.02, 0, tape); k.box(0.02, 0.012, 0.02, steel(k), 0.04, 0.008, 0, tape);
  props.push(tape);
  return frame(k, s, body, props, h, [-w / 2 + 0.34, w / 2 - 0.5, -d / 2 + 0.1, d / 2 - 0.05], "warm");
}

// A kitchen counter (0.91 m to the worktop, 0.6 m cabinets, 30 mm stone worktop with a 25 mm overhang): painted base
// cabinets with recessed-panel doors and bar handles over a toe kick, a tiled backsplash; dressed with a utensil crock
// with wooden spoons, a bottle of oil, a bowl and a cutting board.
export function counter(k, { at, w = 1.8, d = 0.64, h = 0.91, worktop = 0xe8e4dc, doors = 0x8fa384, dress = true } = {}) {
  const s = start("counter", at), T = 0.03, cab = d - 0.04, ch = h - T;
  const body = piece(k, s, "cabinets", { h: 0.6 + h, w, d }, 0, 0, 0), paint = k.mat(doors, 0.45), dark = k.mat(0x2e3236, 0.8);
  k.box(w, 0.1, cab - 0.075, dark, 0, 0.05, -0.0375 - 0.02, body); // the toe kick, set back
  k.box(w, ch - 0.1, cab, k.mat(0xf2efe8, 0.6), 0, 0.1 + (ch - 0.1) / 2, -0.02, body); // the carcasses
  const n = Math.max(1, Math.round(w / 0.6)), dw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    k.box(dw - 0.004, ch - 0.104, 0.019, paint, x, 0.1 + (ch - 0.1) / 2, cab / 2 - 0.02 + 0.0095, body); // the door
    k.box(dw - 0.14, ch - 0.25, 0.008, paint, x, 0.1 + (ch - 0.1) / 2, cab / 2 - 0.02 + 0.022, body); // its raised centre, inside a 7 cm frame
    const hx = x + (i % 2 ? -1 : 1) * (dw / 2 - 0.045), brass = steel(k, 0xc8a45a, 0.3), face = cab / 2 - 0.02 + 0.019;
    cyl(0.006, 0.16, brass, hx, ch - 0.15, face + 0.025, body); // the bar handle, by the opening edge, on two posts
    for (const dy of [-0.065, 0.065]) cyl(0.004, 0.025, brass, hx, ch - 0.15 + dy, face + 0.0125, body).rotation.x = Math.PI / 2;
  }
  k.box(w, T, d, stone(k, worktop), 0, h - T / 2, 0, body);
  const tile = glaze(0xf4f1ea);
  tile.map = k.canvasTex(512, 256, (c) => { c.fillStyle = "#f4f1ea"; c.fillRect(0, 0, 512, 256); c.fillStyle = "#cfc8bb"; for (let x = 0; x < 512; x += 512 / (w / 0.15)) c.fillRect(x, 0, 2, 256); for (let y = 0; y < 256; y += 256 / 8) c.fillRect(0, y, 512, 2); });
  k.box(w, 0.6, 0.012, tile, 0, h + 0.3, -d / 2 + 0.006, body); // a 60 cm backsplash of 15 x 7.5 cm tiles
  if (!dress) return frame(k, s, body, [], h, [-w / 2 + 0.02, w / 2 - 0.02, -d / 2 + 0.03, d / 2 - 0.02], "window");
  const props = [];
  const crock = piece(k, s, "utensil crock", { h: 0.3 }, -w / 2 + 0.16, h, -d / 2 + 0.12), clay = glaze(0xe9e1d2);
  lathe([[0, 0], [0.058, 0], [0.062, 0.01], [0.06, 0.15], [0.055, 0.15], [0.054, 0.012], [0, 0.012]], clay, crock);
  [[-0.02, 0.1], [0.018, -0.12], [0.004, 0.05]].forEach(([dx, tilt], i) => { const sp = cyl(0.006, 0.28, wood(k, 0xc9a274, 0.6), dx, 0.155, (i - 1) * 0.015, crock); sp.rotation.z = tilt; }); // spoons, leaning
  props.push(crock);
  const bottle = piece(k, s, "oil bottle", { h: 0.26 }, -w / 2 + 0.3, h, -d / 2 + 0.1);
  lathe([[0, 0], [0.032, 0], [0.034, 0.01], [0.034, 0.17], [0.012, 0.22], [0.011, 0.25], [0, 0.25]], new THREE.MeshPhysicalMaterial({ color: 0x9a7a2a, roughness: 0.08, transmission: 0.6, thickness: 0.02 }), bottle);
  cyl(0.012, 0.012, k.mat(0x2e3236, 0.5), 0, 0.254, 0, bottle);
  props.push(bottle);
  const bowl = piece(k, s, "bowl", { h: 0.08 }, w / 2 - 0.2, h, -d / 2 + 0.16);
  lathe([[0, 0], [0.045, 0], [0.11, 0.07], [0.12, 0.08], [0.114, 0.08], [0.104, 0.07], [0.04, 0.008], [0, 0.008]], glaze(0xb5674a), bowl);
  props.push(bowl);
  const board = piece(k, s, "cutting board", { h: 0.02 }, w / 2 - 0.26, h, d / 2 - 0.16, { ry: -0.1 });
  k.box(0.4, 0.02, 0.26, wood(k, 0xd9b783, 0.6), 0, 0.01, 0, board);
  props.push(board);
  return frame(k, s, body, props, h, [-w / 2 + 0.42, w / 2 - 0.5, -d / 2 + 0.05, d / 2 - 0.04], "window");
}

// A plinth for a machine or an object on show (gallery plinths 0.8-1.0 m): a box of painted MDF with a recessed foot
// and a small brass label plate on its face. Plain on purpose: the hero is the dressing.
export function plinth(k, { at, w = 0.5, d = 0.5, h = 0.9, color = 0xf2efe8 } = {}) {
  const s = start("plinth", at), body = piece(k, s, "body", { h, w, d }, 0, 0, 0), paint = k.mat(color, 0.85);
  k.box(w - 0.03, 0.04, d - 0.03, k.mat(0x2e3236, 0.8), 0, 0.02, 0, body); // the recessed foot (a shadow gap)
  k.box(w, h - 0.04, d, paint, 0, 0.04 + (h - 0.04) / 2, 0, body);
  k.box(0.12, 0.03, 0.003, steel(k, 0xc8a45a, 0.3), 0, h - 0.12, d / 2 + 0.0015, body);
  return frame(k, s, body, [], h, [-w / 2 + 0.03, w / 2 - 0.03, -d / 2 + 0.03, d / 2 - 0.03], "warm");
}

// A room corner (2.4-2.7 m ceilings): an oak plank floor, a back and a left wall of plaster (wear: the brief's
// condition), painted skirting, a socket at 0.3 m and a light switch at 1.2 m; its top is the floor, its area the floor
// clear of the walls. Other sets stand in it at room.spot(u, v).
export function room(k, { at, w = 4, d = 3.5, H = 2.6, wall = 0xf2efe8, floor = 0xc9a274, wear = 0 } = {}) {
  const s = start("room", at), body = piece(k, s, "shell", { h: H + 0.02, w: w + 0.1, d: d + 0.1 }, 0, 0, 0, { rest: false });
  const planks = wood(k, floor, 0.55);
  planks.map = k.canvasTex(1024, 1024, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 1024, 1024); c.fillStyle = "rgba(60,40,20,0.35)"; const n = Math.round(d / 0.18); for (let i = 0; i < n; i++) { const y = (i * 1024) / n; c.fillRect(0, y, 1024, 1.5); const off = tone(i, 7) * 1024; for (let x = off % 300; x < 1024; x += 300 + tone(i, 8) * 300) c.fillRect(x, y, 1.5, 1024 / n); } }); // 18 cm planks, staggered joints
  k.box(w, 0.02, d, planks, 0, -0.01, 0, body);
  const plaster = k.surface(new THREE.MeshStandardMaterial({ color: wall, roughness: 0.85 }), "plaster", { world: true, wear, floor: s.at.y });
  k.box(w + 0.1, H, 0.1, plaster, -0.05, H / 2, -d / 2 - 0.05, body);
  k.box(0.1, H, d, plaster, -w / 2 - 0.05, H / 2, 0, body);
  const trim = k.mat(0xf4f1ea, 0.5);
  k.box(w, 0.1, 0.015, trim, 0, 0.05, -d / 2 + 0.0075, body); k.box(0.015, 0.1, d, trim, -w / 2 + 0.0075, 0.05, 0, body); // skirting
  k.box(0.086, 0.086, 0.008, trim, -w / 2 + 0.6, 0.3, -d / 2 + 0.004, body); // a socket plate (86 mm)
  k.box(0.086, 0.086, 0.008, trim, -w / 2 + 0.004, 1.2, d / 2 - 0.3, body).rotation.y = Math.PI / 2; // a switch plate, by the open side
  return frame(k, s, body, [], 0, [-w / 2 + 0.3, w / 2 - 0.1, -d / 2 + 0.3, d / 2 - 0.1], "window");
}
