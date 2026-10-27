import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { barMagnet, field, fieldLines, filings, compass } from "../fields.js";

// A bar magnet under a sheet of tracing paper, with iron filings on the paper, compasses beside it and teaching field
// lines: why a magnet attracts, drawn by its field and not by hand. The magnet's remanence `Br` comes from the film's numbers
// model with a source (sintered NdFeB ~1.3 T, alnico ~1.2 T, ferrite ~0.4 T) and has no default; the sizes below are a
// typical 50 × 20 × 10 mm block to override from the real part. Local frame: the table is y = 0, the magnet's centre is at
// the origin in x and z, the paper rests on its top; the whole piece sits at `at` (scene units).
//
//   state: Br (tesla)                       the magnet's remanence, from the model, required
//   size: { length, width, depth }          metres, N pole at +x (the long axis), the block lying flat
//   filings: { count, w, d } | false        iron filings over the paper (default 3000 on 0.16 × 0.1 m)
//   compass: [Vector3, …]                   pivot positions on the paper, scene units local to the piece (default none)
//   lines: { count, maxLength } | false     teaching lines (default 9 across the N face, cut at the paper's edge)
//   motion: (t) => Vector3                  slides the magnet by this offset (scene units) at film time t: a cause the film
//                                           gives (a hand, a track); the filings, compasses and lines follow from t alone
//
//   const demo = makeMagnetDemo(kit, { at, Br: N.Br, compass: [new THREE.Vector3(0.12, 0.0101, 0.04)] });
//   scene.add(demo.group);                   // each frame: demo.at(t); demo.lines.reveal(u) grows the lines on cue
//
// The teaching lines lie in the magnet's mid-plane, where the field has no component across the plane, and start evenly along
// the N face: that spacing shows DIRECTION and where lines go, not strength (a planar cut through 3D lines is not spaced by
// flux). `fieldLines` with no `seeds` is the 3D set whose density means strength. Returns { group, magnet, field, lines
// | null, filings | null, compasses, paper, at(t) }.
export function makeMagnetDemo(k, { at = new THREE.Vector3(), Br, size = { length: 0.05, width: 0.02, depth: 0.01 }, filings: fspec = {}, compass: cpos = [], lines: lspec = {}, mode = "teach", motion } = {}) {
  if (!(Number.isFinite(Br) && Br > 0)) throw new Error(`makeMagnetDemo: Br (T), the magnet's remanence from the film's model with a source, is required; got ${Br}`);
  const { length, width, depth } = size ?? {};
  if (motion !== undefined && typeof motion !== "function") throw new Error("makeMagnetDemo: motion is (t) => THREE.Vector3 (scene units), the film's cause for the magnet's slide");
  if (!Array.isArray(cpos) || !cpos.every((p) => p?.isVector3)) throw new Error("makeMagnetDemo: compass is an array of THREE.Vector3 pivot positions (scene units, local to the piece)");
  const U = 1 / M, paperT = 0.0001, group = new THREE.Group();
  group.name = "magnet demo"; group.position.copy(at);
  const base = new THREE.Vector3(0, depth / 2 * U, 0), where = motion ? (t) => base.clone().add(motion(t)) : base;
  const magnet = barMagnet({ at: where, axis: new THREE.Vector3(1, 0, 0), length, width, depth, Br });
  const F = field([magnet]);
  group.add(magnet.mesh);

  // Tracing paper (0.1 mm): translucent, so the block shows through it.
  const sheet = fspec ? { w: 0.16, d: 0.1, ...fspec } : { w: 0.16, d: 0.1 };
  const paper = new THREE.Mesh(new THREE.BoxGeometry(sheet.w * U, paperT * U, sheet.d * U), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9, transparent: true, opacity: 0.55, depthWrite: false }));
  paper.position.set(0, (depth + paperT / 2) * U, 0); paper.name = "tracing paper";
  group.add(paper);
  const top = (depth + paperT) * U;

  const dust = fspec === false ? null : filings(F, { at: new THREE.Vector3(0, top, 0), w: sheet.w, d: sheet.d, count: fspec.count ?? 3000 });
  if (dust) group.add(dust.mesh);
  const compasses = cpos.map((p) => { const c = compass(F, { at: p }); group.add(c.group); return c; });

  let lines = null;
  if (lspec !== false) {
    const n = lspec.count ?? 9;
    // Seeds along the N face in the mid-plane, one pole spacing out, following the magnet.
    const seedsAt = (t) => {
      const c = motion ? where(t) : base, off = Math.max(width, depth) / 6;
      return Array.from({ length: n }, (_, i) => new THREE.Vector3(c.x + (length / 2 + off) * U, c.y, c.z + ((i + 0.5) / n - 0.5) * 0.9 * width * U));
    };
    const onPaper = (p) => Math.abs(p.x) <= sheet.w / 2 && Math.abs(p.z) <= sheet.d / 2; // lines are cut at the paper's edge, as the filings are
    lines = fieldLines(F, { seeds: motion ? seedsAt : seedsAt(0), mode, maxLength: lspec.maxLength ?? 1, step: 0.005, stop: (p) => !onPaper(p) });
    group.add(lines.group);
  }

  const api = { group, magnet, field: F, lines, filings: dust, compasses, paper, at(t) {
    magnet.place(t);
    lines?.at(t); dust?.at(t);
    for (const c of compasses) c.at(t);
    return api;
  } };
  return api;
}
