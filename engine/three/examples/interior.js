import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";

// American-Japandi: Japanese calm (honey bamboo, warm white walls, oatmeal linen, a ceramic, few colours) with
// American home motifs (a Shaker panel door, buffalo check, ticking stripe, a braided rug). Woven patterns are
// drawn as yarn, not flat paint: each band is made of threads, so it reads as cloth up close.

const NAVY = "#34506e", CREAM = "#efe8db", OAT = "#d9ccb5", RUST = "#b5674a", SAGE = "#8fa384";

// Buffalo check: two-colour blocks where the dark warp and weft cross, half-tone where one does, over a twill hatch.
export function plaid(k, dark = NAVY, light = CREAM, n = 6) {
  return k.canvasTex(512, 512, (c) => {
    const s = 512 / n / 2;
    c.fillStyle = light; c.fillRect(0, 0, 512, 512);
    c.globalAlpha = 0.55; c.fillStyle = dark;
    for (let i = 0; i < n; i++) { c.fillRect(i * 2 * s, 0, s, 512); c.fillRect(0, i * 2 * s, 512, s); }
    c.globalAlpha = 0.08; c.strokeStyle = "#000"; c.lineWidth = 1;
    for (let d = -512; d < 512; d += 4) { c.beginPath(); c.moveTo(d, 0); c.lineTo(d + 512, 512); c.stroke(); } // twill
    c.globalAlpha = 1;
  });
}
// Ticking: narrow navy stripes in pairs on cream, the classic mattress-and-cushion cloth.
export function ticking(k) {
  return k.canvasTex(512, 512, (c) => {
    c.fillStyle = CREAM; c.fillRect(0, 0, 512, 512);
    c.fillStyle = NAVY;
    for (let x = 0; x < 512; x += 64) { c.fillRect(x + 10, 0, 7, 512); c.fillRect(x + 22, 0, 3, 512); }
    c.globalAlpha = 0.07; c.fillStyle = "#000";
    for (let y = 0; y < 512; y += 3) c.fillRect(0, y, 512, 1); // the weft
    c.globalAlpha = 1;
  });
}
// A braided rug: one long three-strand braid coiled outward from the centre and stitched, the strands' colours
// changing every few rounds; each braid shows as a row of slanted loops.
export function braidedRug(k) {
  return k.canvasTex(1024, 1024, (c) => {
    c.fillStyle = OAT; c.fillRect(0, 0, 1024, 1024);
    const cols = [OAT, CREAM, OAT, NAVY, OAT, RUST, CREAM, OAT, SAGE, OAT, NAVY, CREAM];
    for (let r = 8, ring = 0; r < 512; r += 15, ring++) {
      const n = Math.max(6, Math.round((2 * Math.PI * r) / 11)), base = cols[Math.floor(ring / 2) % cols.length];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, strand = i % 3, col = strand === 1 ? cols[(Math.floor(ring / 2) + 3) % cols.length] : base;
        c.save(); c.translate(512 + Math.cos(a) * r, 512 + Math.sin(a) * r); c.rotate(a + Math.PI / 2 + (i % 2 ? 0.7 : -0.7));
        c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 7.5, 4, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "rgba(60,45,30,0.25)"; c.lineWidth = 1; c.stroke();
        c.restore();
      }
    }
  });
}

// A cushion: a cover stuffed full, so it is fat in the middle and thin at the corners and the seam round its edge
// (a box finely divided on every face, its thickness scaled by how far each point is from the edge; a rounded box
// would not do: its flat faces are single quads that cannot bulge).
export function cushion(k, { w = 0.45, h = 0.45, d = 0.16, map, color = 0xffffff } = {}) {
  const g = new THREE.BoxGeometry(d / M, h / M, w / M, 2, 18, 18), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const Y = p.getY(i) / (h / M / 2), Z = p.getZ(i) / (w / M / 2), f = Math.max(0, (1 - Y * Y) * (1 - Z * Z)); // ≥ 0: float error at the edges would give NaN
    p.setX(i, p.getX(i) * (0.25 + 0.75 * Math.sqrt(f)));
    p.setY(i, p.getY(i) * (1 - 0.06 * f)); p.setZ(i, p.getZ(i) * (1 - 0.06 * f)); // the cover draws in as it fills
  }
  g.computeVertexNormals();
  const o = new THREE.Mesh(g, k.cloth(color, "fabric", 0.9, map));
  o.castShadow = o.receiveShadow = true;
  k.scene.add(o);
  return o;
}

// A Shaker door, closed, on the wall at x: 80 × 203 cm, stiles and rails standing proud of recessed flat panels,
// painted; a white casing round it; a brass knob and hinges. Modelled in metres.
export function door(k, { x, y = 0, wall, color = 0x34506e }) { // x, y: the bottom centre on the wall (units); wall: the wall face's z
  const { box, mat, scene } = k, g = new THREE.Group(), paint = mat(color, 0.45), white = mat(0xf4f1ea, 0.5), brass = new THREE.MeshStandardMaterial({ color: 0xc8a45a, metalness: 1, roughness: 0.32 });
  g.name = "door";
  g.position.set(x, y, wall);
  g.scale.setScalar(1 / M);
  scene.add(g);
  const W = 0.8, H = 2.03;
  box(W, H, 0.012, paint, 0, H / 2, 0.006, g); // the recessed panels' face
  [[0.12, H, -W / 2 + 0.06, H / 2], [0.12, H, W / 2 - 0.06, H / 2], [W, 0.12, 0, H - 0.06], [W, 0.16, 0, 1.0], [W, 0.22, 0, 0.11]].forEach(([w, h, cx, cy]) => box(w, h, 0.022, paint, cx, cy, 0.016, g)); // stiles and rails
  [[0.07, H + 0.07, -W / 2 - 0.035, (H + 0.07) / 2], [0.07, H + 0.07, W / 2 + 0.035, (H + 0.07) / 2], [W + 0.14, 0.09, 0, H + 0.045]].forEach(([w, h, cx, cy]) => box(w, h, 0.02, white, cx, cy, 0.012, g)); // casing
  const knob = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.032, 0], [0.032, 0.006], [0.012, 0.012], [0.012, 0.04], [0.027, 0.05], [0.028, 0.064], [0, 0.07]].map(([r, y]) => new THREE.Vector2(r, y)), 48), brass);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(W / 2 - 0.065, 0.95, 0.027);
  knob.castShadow = true;
  g.add(knob);
  [0.25, 1.0, 1.78].forEach((y) => box(0.012, 0.09, 0.03, brass, -W / 2 - 0.004, y, 0.02, g)); // hinge knuckles
  return g;
}

// A round pouf, as sewn: a drum of cloth slightly bellied at the sides, piping round the top seam, the top domed by
// its filling — and pressed down where something heavy lies on it (dent: metres, centred). Modelled in metres.
export function pouf(k, { r = 0.25, h = 0.25, dent = 0.014, color = 0xd9b77a } = {}) {
  const g = new THREE.Group(), cloth = k.cloth(color), top = h - 0.005, ri = r - 0.018;
  const prof = [[0, 0], [r - 0.012, 0], [r - 0.002, 0.02], [r, h * 0.5], [r - 0.003, h - 0.02], [ri + 0.004, top]];
  for (let i = 1; i <= 24; i++) { const x = ri * (1 - i / 24); prof.push([x, top + 0.008 * (1 - (x / ri) ** 2) - dent * Math.exp(-((x / 0.11) ** 2))]); }
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 96), cloth);
  const piping = new THREE.Mesh(new THREE.TorusGeometry(r - 0.006, 0.006, 10, 96), k.cloth(0xc9a66a));
  piping.rotation.x = Math.PI / 2;
  piping.position.y = h - 0.012;
  [body, piping].forEach((o) => { o.castShadow = o.receiveShadow = true; g.add(o); });
  g.scale.setScalar(1 / M);
  k.scene.add(g);
  return g;
}

// Presets for makeKit({ palette, kinds }): the CC0 furniture kits' material names (Kenney Furniture Kit, Quaternius)
// and the American-Japandi palette keyed by them.
export const kits = {
  furniture: { cloth: /^(carpet|Sofa)/, wood: /^(wood|Wood|DarkWood|DarkBrown)/i, wall: /^_defaultMat$/, soft: /^(carpet|Sofa|plant|Green|fur)/, glow: /^(lamp|Top)/, glass: /^glass$/, metal: /^metal/i },
};
// Palettes keyed by the furniture kits' material names. American-Japandi, the default interior (`BRIEF.md`
// `interior`): honey bamboo and caramel bamboo, warm white walls, oatmeal linen, charcoal, navy and a little rust.
export const palettes = {
  americanJapandi: {
    wood: 0xd9b783, Wood: 0xd9b783, woodDark: 0xb8925f, DarkWood: 0xb8925f, DarkBrown: 0x8f6b4a,
    _defaultMat: 0xf2efe8, metalDark: 0x3d4247, Metal: 0x3d4247, metal: 0xdcdfda, metalMedium: 0x7d8285,
    carpet: 0xe9e1d2, carpetDarker: 0xcfc4b0, carpetWhite: 0xf1ece2, plant: 0x7ea873, Green: 0x7ea873,
    Sofa: 0xd8ccb9, Cover2: 0x8fa384, Cover3: 0x34506e, Cover4: 0xe2c58f, Pages: 0xf3eee4,
    Vase: 0xe9e1d2, "Vase.001": 0x8fa3b0, fur: 0xb98a5e, carpetBlue: 0x34506e, "*": 0xcfc8bb,
  },
};
