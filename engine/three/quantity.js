import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";
import { safeArea, recordBox } from "./type.js";

// Quantities shown in the world (visual-direction.md §13): the number a film compares is a thing on the set before it
// is said, and the card only records it. Sizes in metres, positions in scene units (as everywhere: 1/M per metre).
// Neither helper adds itself to the scene: add `group` where it belongs. Values come from the numbers model, never typed.
// dimension() (below) is drawn on the frame's 2D canvas, not in the scene: a drafting-style dimension line.
//
//   const pull = flowArrow({ from: a, to: b, value: N.effort, scale: 0.004 });   // one scale for the whole film
//   set.add(pull.group); pinLabel(ctx, { at: pull.anchor, camera, text: `${N.effort} N` }, { format });
//   const tiles = tileFill({ at: corner, w: 3, d: 4, cell: 0.5 }); set.add(tiles.group); tiles.show(n(t));

const positive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

// A flat arrow from `from` to `to` whose shaft is value × scale metres wide: two arrows on one scale show their ratio.
// It lies in the plane facing `normal`; `reveal(u)` draws the first u of its length at the same width.
export function flowArrow({ from, to, value, scale, normal = new THREE.Vector3(0, 0, 1), color = 0x2f2f2f, head = 1.8 } = {}) {
  if (!positive(value)) throw new Error(`flowArrow: value must be a finite number > 0, got ${value}`);
  if (!positive(scale)) throw new Error(`flowArrow: scale (metres of width per unit of value) must be a finite number > 0, got ${scale}`);
  if (!from?.isVector3 || !to?.isVector3) throw new Error("flowArrow: from and to are THREE.Vector3 in scene units");
  const dir = to.clone().sub(from), len = dir.length();
  if (!(len > 0)) throw new Error("flowArrow: from and to are the same point");
  dir.divideScalar(len);
  const side = new THREE.Vector3().crossVectors(normal, dir);
  if (!(side.lengthSq() > 1e-12)) throw new Error("flowArrow: normal is parallel to the arrow");
  side.normalize();
  const n = new THREE.Vector3().crossVectors(dir, side), width = (value * scale) / M, hw = head * width;
  const group = new THREE.Group();
  group.name = "flow arrow";
  group.position.copy(from);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, side, n)); // local x along, y across
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide }));
  const anchor = new THREE.Object3D();
  group.add(mesh, anchor);
  const reveal = (u) => {
    const L = len * Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0)), hl = Math.min(1.2 * hw, 0.4 * L);
    mesh.visible = L > 0;
    anchor.position.set(L / 2, hw / 2 + 0.02 / M, 0); // beside the shaft, 2 cm clear of the head's width
    if (!(L > 0)) return 0;
    const s = new THREE.Shape();
    s.moveTo(0, -width / 2); s.lineTo(L - hl, -width / 2); s.lineTo(L - hl, -hw / 2); s.lineTo(L, 0);
    s.lineTo(L - hl, hw / 2); s.lineTo(L - hl, width / 2); s.lineTo(0, width / 2); s.closePath();
    mesh.geometry.dispose();
    mesh.geometry = new THREE.ShapeGeometry(s);
    return L;
  };
  reveal(1);
  return { group, mesh, anchor, value, width: value * scale, length: len, reveal };
}

// A w × d m area on the floor from the corner `at`, in cells of `cell` m (the last row and column cut to fit), filled
// one cell at a time: `show(n)` the first n (row by row along +x, then +z), `area(n)` their m², `edges` anchors for the
// dimension tags. Lifted `lift` m with a polygonOffset so it never fights the floor.
export function tileFill({ at = new THREE.Vector3(), w, d, cell, color = 0xd8cfc0, gap = 0.004, lift = 0.002 } = {}) {
  for (const [name, v] of [["w", w], ["d", d], ["cell", cell]]) if (!positive(v)) throw new Error(`tileFill: ${name} must be metres > 0, got ${v}`);
  const cols = Math.ceil(w / cell - 1e-9), rows = Math.ceil(d / cell - 1e-9), count = cols * rows;
  const group = new THREE.Group();
  group.name = "tile fill";
  group.position.copy(at);
  group.scale.setScalar(1 / M);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, count);
  mesh.receiveShadow = true;
  const areas = [], o = new THREE.Object3D();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tw = Math.min(cell, w - c * cell), td = Math.min(cell, d - r * cell);
    o.position.set(c * cell + tw / 2, lift, r * cell + td / 2);
    o.scale.set(Math.max(tw - gap, 1e-4), 1, Math.max(td - gap, 1e-4));
    o.updateMatrix();
    mesh.setMatrixAt(r * cols + c, o.matrix);
    areas.push(tw * td);
  }
  mesh.instanceMatrix.needsUpdate = true;
  const edges = { w: new THREE.Object3D(), d: new THREE.Object3D() };
  edges.w.position.set(w / 2, lift, 0);
  edges.d.position.set(0, lift, d / 2);
  group.add(mesh, edges.w, edges.d);
  let shown = count;
  const clampN = (n) => Math.max(0, Math.min(count, Math.floor(Number.isNaN(n) || typeof n !== "number" ? 0 : n)));
  const show = (n) => { shown = clampN(n); mesh.count = shown; return shown; };
  const area = (n = shown) => areas.slice(0, clampN(n)).reduce((a, b) => a + b, 0);
  return { group, mesh, cols, rows, count, edges, show, area };
}

// A dimension line in drafting style, drawn on the frame (the 2D canvas, after the finisher): extension lines from the
// two ends of the measured edge `a`, `b` (world points, scene units), a dimension line between them with an arrowhead at
// each end, and the value in monospace, rotated with the line and never upside down. The value comes from the numbers
// model, never typed (`${N.cellLen} mm`). The whole drawing stays inside the format's label zone: if it would leave it,
// it stands off on the other side, then closer; if that does not fit either, NOTHING is drawn and `why` says what to do
// (frame closer, reframe, or dimension a part nearer the centre): a dimension never runs off the frame.
//
//   const d = dimension(ctx, a, b, { camera, text: `${N.cellLen} mm`, dir: new THREE.Vector3(0, 1, 0), top: band.box.y1 });
//
// opts: camera (required, matrices current), text (required), dir (world: the side the line stands off to, made
// perpendicular to the edge; default +Y; parallel to the edge throws), gap = 0.001 m (part to extension line), off = 0.006 m
// (edge to dimension line), over = 0.0015 m (extension past the line), format "shorts", size (px, default and least 36 at
// 1080), font (an unquoted mono stack), ink, halo, line (px), top (a y in px: stay below it, type.js textBand `box.y1`).
// -> null (a point behind the camera) | { drawn: false, why } | { drawn: true, flipped, off, box, text, ends: [{ x, y }, { x, y }], size }
// `text` is the value's box (what layoutFrame records, kind "label"); `box` is everything drawn.
const MONO = 'ui-monospace, Menlo, "DejaVu Sans Mono", monospace';
export function dimension(ctx, a, b, opts = {}) {
  const { camera, text, dir = new THREE.Vector3(0, 1, 0), gap = 0.001, off = 0.006, over = 0.0015, format = "shorts", font = MONO, ink = "#111111", halo = "rgba(255,255,255,0.85)" } = opts;
  if (!a?.isVector3 || !b?.isVector3) throw new Error("dimension: a and b are THREE.Vector3 in scene units (the two ends of the edge)");
  if (!camera?.isCamera) throw new Error("dimension: camera is required");
  if (typeof text !== "string" || !text.trim()) throw new Error('dimension: text is the value from the numbers model, a non-empty string such as "16 mm"');
  if (a.equals(b)) throw new Error("dimension: a and b are the same point");
  const u = b.clone().sub(a).normalize(), n0 = dir.clone().addScaledVector(u, -dir.dot(u));
  if (!(n0.length() > 1e-6)) throw new Error("dimension: dir is parallel to the edge, so the line cannot stand off it: pass a direction across the edge");
  n0.normalize();
  const W = ctx.canvas.width, H = ctx.canvas.height, s = Math.min(W, H) / 1080, size = Math.max(36 * s, opts.size ?? 36 * s), lw = opts.line ?? 2.5 * s;
  const full = safeArea(format, W, H).labels, zone = Number.isFinite(opts.top) ? { ...full, y0: Math.min(full.y1, Math.max(full.y0, opts.top)) } : full;
  camera.updateMatrixWorld();
  ctx.save(); ctx.font = `700 ${size}px ${font}`;
  const tw = ctx.measureText(text).width + 0.4 * size, th = 1.3 * size, ah = 0.45 * size;
  ctx.restore();
  let behind = false, tooShort = false;
  const px = (v) => { // a world point in px; flags a point behind the camera, and z outside the depth range as off the frame
    if (v.clone().applyMatrix4(camera.matrixWorldInverse).z > -camera.near) behind = true;
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H, bad: !(p.z >= -1 && p.z <= 1) };
  };
  const attempt = (sign, offM) => {
    const n = n0.clone().multiplyScalar(sign), at = (p, d) => p.clone().addScaledVector(n, d / M);
    const ea = [px(at(a, gap)), px(at(a, offM + over))], eb = [px(at(b, gap)), px(at(b, offM + over))], A = px(at(a, offM)), B = px(at(b, offM)), pa = px(a);
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    if (len < 2 * ah + 0.5 * size) tooShort = true;
    let ang = Math.atan2(B.y - A.y, B.x - A.x);
    const ux = (B.x - A.x) / (len || 1), uy = (B.y - A.y) / (len || 1);
    let sx = A.x - pa.x, sy = A.y - pa.y; const sl = Math.hypot(sx, sy);
    if (sl > 1e-6) { sx /= sl; sy /= sl; } else { sx = uy; sy = -ux; }
    if (Math.abs(ang) > Math.PI / 2) ang += Math.PI; // the value never reads upside down
    const c = { x: (A.x + B.x) / 2 + sx * 0.7 * size, y: (A.y + B.y) / 2 + sy * 0.7 * size };
    const hx = Math.abs(Math.cos(ang)) * tw / 2 + Math.abs(Math.sin(ang)) * th / 2, hy = Math.abs(Math.sin(ang)) * tw / 2 + Math.abs(Math.cos(ang)) * th / 2;
    const tb = { x0: c.x - hx, y0: c.y - hy, x1: c.x + hx, y1: c.y + hy };
    const pts = [...ea, ...eb, A, B], bad = pts.some((p) => p.bad) || pa.bad;
    const bb = { x0: Math.min(tb.x0, ...pts.map((p) => p.x - ah)), y0: Math.min(tb.y0, ...pts.map((p) => p.y - ah)), x1: Math.max(tb.x1, ...pts.map((p) => p.x + ah)), y1: Math.max(tb.y1, ...pts.map((p) => p.y + ah)) };
    const out = Math.max(0, zone.x0 - bb.x0) + Math.max(0, bb.x1 - zone.x1) + Math.max(0, zone.y0 - bb.y0) + Math.max(0, bb.y1 - zone.y1);
    return { sign, offM, ea, eb, A, B, ux, uy, ang, c, tb, bb, out: bad ? Math.max(out, 1) : out, ok: out <= 1e-6 && !bad };
  };
  const first = attempt(1, off), second = attempt(-1, off);
  if (behind) return null;
  if (tooShort) return { drawn: false, why: "too short at this framing: frame closer or measure a longer edge" };
  const better = second.out < first.out ? second : first;
  const pick = [first, second].find((r) => r.ok) ?? (() => { const r = attempt(better.sign, Math.max(2 * gap, off / 2)); return r.ok ? r : null; })();
  if (!pick) return { drawn: false, why: `outside the safe area at this framing (${Math.round(better.out)} px over): reframe, or dimension a part nearer the centre` };
  const { ea, eb, A, B, ux, uy, ang, c, tb, bb } = pick, hw = 0.18 * size;
  ctx.save();
  ctx.lineCap = "butt"; ctx.lineJoin = "round";
  const arrow = (P, d) => { ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(P.x + d * ux * ah - uy * hw, P.y + d * uy * ah + ux * hw); ctx.lineTo(P.x + d * ux * ah + uy * hw, P.y + d * uy * ah - ux * hw); ctx.closePath(); };
  for (const [col, wid] of [[halo, lw + 3 * s], [ink, lw]]) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = wid;
    ctx.beginPath(); for (const [p0, p1] of [[ea[0], ea[1]], [eb[0], eb[1]], [A, B]]) { ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); } ctx.stroke();
    arrow(A, 1); ctx.fill(); if (col === halo) ctx.stroke();
    arrow(B, -1); ctx.fill(); if (col === halo) ctx.stroke();
  }
  ctx.translate(c.x, c.y); ctx.rotate(ang);
  ctx.font = `700 ${size}px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.strokeStyle = halo; ctx.lineWidth = 0.18 * size; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = ink; ctx.fillText(text, 0, 0);
  ctx.restore();
  recordBox("label", text, tb, size);
  return { drawn: true, flipped: pick.sign < 0, off: pick.offM, box: bb, text: tb, ends: [{ x: A.x, y: A.y }, { x: B.x, y: B.y }], size };
}
