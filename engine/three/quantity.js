import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";

// Quantities shown in the world (visual-direction.md §13): the number a film compares is a thing on the set before it
// is said, and the card only records it. Sizes in metres, positions in scene units (as everywhere: 1/M per metre).
// Neither helper adds itself to the scene: add `group` where it belongs. Values come from the numbers model, never typed.
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
