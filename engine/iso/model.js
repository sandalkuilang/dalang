// model.js — a CC0 low-poly model (glTF / GLB: Kenney, Quaternius, Poly Haven, via find_media.mjs --type model) drawn in
// the Express isometric look (DALANG, MIT). Every triangle becomes a flat face in three tones from its own colour (the
// material's base colour, or its texture sampled at the triangle's centre), so thousands of ready models need no
// drawing. No dependency: the glTF is read here. Node (tests) and the browser (the film) both run it.
//
//   const m = await loadModel("assets/models/crate.glb");          // browser: fetch + texture decode
//   drawModel(iso, m, { size: 0.8, palette: { wood: "#B88A5A" } });  // inside a build() part, or with iso.push()
import { tri } from "./iso.js";

const GLB = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942, MAX_TRIS = 4000;
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READ = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function local(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}

// bytes: a GLB or a .gltf (JSON) as Uint8Array / ArrayBuffer. opts.fetchBuffer(uri) → bytes for an external .bin or
// image; opts.decodeImage(bytes, mime) → { width, height, data } (RGBA) for a texture, else textured faces take the
// material's factor. Returns { tris (Float32Array, 9 per triangle, metres, z up), col (hex per triangle), mat (material
// index per triangle), materials: [{ name, color }], box: { min, max } }.
export async function parseModel(bytes, opts = {}) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let json, bin = null;
  if (u8.byteLength >= 12 && dv.getUint32(0, true) === GLB) {
    for (let off = 12; off + 8 <= u8.byteLength;) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), data = u8.subarray(off + 8, off + 8 + len);
      if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(data)); else if (type === BIN_CHUNK) bin = data;
      off += 8 + len;
    }
  } else json = JSON.parse(new TextDecoder().decode(u8));
  if (!json) throw new Error("model: not a glTF or GLB file");
  const ext = [...(json.extensionsRequired || []), ...(json.extensionsUsed || [])];
  if (ext.some((e) => /draco|meshopt/i.test(e))) throw new Error(`model: compressed mesh (${ext.join(", ")}): pick an uncompressed GLB (Kenney and Quaternius kits are)`);
  const b64 = (s) => (typeof atob === "function" ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, "base64")));
  const fetchUri = async (uri) => {
    const m = /^data:[^;]*;base64,(.*)$/.exec(uri);
    if (m) return b64(m[1]);
    if (!opts.fetchBuffer) throw new Error(`model: external file ${uri}: pass fetchBuffer, or use a GLB`);
    const r = await opts.fetchBuffer(uri); return r instanceof Uint8Array ? r : new Uint8Array(r);
  };
  const buffers = await Promise.all((json.buffers || []).map((b, i) => (b.uri ? fetchUri(b.uri) : i === 0 && bin ? bin : Promise.reject(new Error("model: buffer without data")))));
  const view = (i) => { const v = json.bufferViews[i], b = buffers[v.buffer]; return { u8: b.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), stride: v.byteStride || 0 }; };
  const read = (i) => {
    const a = json.accessors[i], k = SIZE[a.type], { u8: b, stride } = view(a.bufferView), d = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const st = stride || k * BYTES[a.componentType], fn = READ[a.componentType], base = a.byteOffset || 0, out = new Float64Array(a.count * k);
    for (let e = 0; e < a.count; e++) for (let c = 0; c < k; c++) {
      let v = d[fn](base + e * st + c * BYTES[a.componentType], true);
      if (a.normalized && NORM[a.componentType]) v = Math.max(v / NORM[a.componentType], -1);
      out[e * k + c] = v;
    }
    return out;
  };
  const images = await Promise.all((json.images || []).map(async (im) => {
    if (!opts.decodeImage) return null;
    const bytes = im.bufferView !== undefined ? view(im.bufferView).u8 : await fetchUri(im.uri);
    return opts.decodeImage(bytes, im.mimeType || (/\.jpe?g$/i.test(im.uri || "") ? "image/jpeg" : "image/png"));
  }));
  const materials = (json.materials || []).map((m, i) => {
    const pbr = m.pbrMetallicRoughness || {}, f = pbr.baseColorFactor || [1, 1, 1, 1], tex = pbr.baseColorTexture;
    const img = tex ? images[json.textures?.[tex.index]?.source] : null;
    return { name: m.name || `material${i}`, color: toHex(srgb(f[0]) * 255, srgb(f[1]) * 255, srgb(f[2]) * 255), factor: f, img, uvSet: tex?.texCoord || 0 };
  });
  if (!materials.length) materials.push({ name: "default", color: "#cccccc", factor: [1, 1, 1, 1], img: null, uvSet: 0 });
  const tris = [], col = [], mat = [];
  const visit = (ni, parent) => {
    const n = json.nodes[ni], M = mul(parent, local(n));
    if (n.mesh !== undefined) for (const p of json.meshes[n.mesh].primitives) {
      if ((p.mode ?? 4) !== 4) continue; // triangles only
      const P = read(p.attributes.POSITION), mi = p.material ?? 0, m = materials[Math.min(mi, materials.length - 1)];
      const UV = m.img && p.attributes[`TEXCOORD_${m.uvSet}`] !== undefined ? read(p.attributes[`TEXCOORD_${m.uvSet}`]) : null;
      const I = p.indices !== undefined ? read(p.indices) : Float64Array.from({ length: P.length / 3 }, (_, i) => i);
      for (let t = 0; t + 2 < I.length; t += 3) {
        let su = 0, sv = 0;
        for (let c = 0; c < 3; c++) {
          const v = I[t + c], x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
          const X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Z = M[2] * x + M[6] * y + M[10] * z + M[14];
          tris.push(X, 0 - Z, Y); // glTF is y up, z toward the viewer → iso z up (a rotation, not a mirror)
          if (UV) { su += UV[v * 2] / 3; sv += UV[v * 2 + 1] / 3; }
        }
        if (UV) {
          const { width: w, height: h, data } = m.img, px = ((Math.floor((su - Math.floor(su)) * w) % w) + w) % w, py = ((Math.floor((sv - Math.floor(sv)) * h) % h) + h) % h, o = (py * w + px) * 4;
          col.push(toHex(data[o] * m.factor[0], data[o + 1] * m.factor[1], data[o + 2] * m.factor[2]));
        } else col.push(m.color);
        mat.push(Math.min(mi, materials.length - 1));
      }
    }
    for (const c of n.children || []) visit(c, M);
  };
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], scene = json.scenes?.[json.scene ?? 0];
  const roots = scene ? scene.nodes : (json.nodes || []).map((_, i) => i).filter((i) => !(json.nodes || []).some((n) => (n.children || []).includes(i)));
  for (const r of roots) visit(r, I4);
  if (!tris.length) throw new Error("model: no triangles");
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i++) { const a = i % 3; if (tris[i] < min[a]) min[a] = tris[i]; if (tris[i] > max[a]) max[a] = tris[i]; }
  // A textured material's colour is the mean of its faces' texels: one flat colour per material reads as an illustration
  // (a scanned texture sampled per face reads as noise); drawModel's texels: true keeps each face's own.
  const sum = materials.map(() => [0, 0, 0, 0]);
  col.forEach((h, i) => { if (!materials[mat[i]].img) return; const s = sum[mat[i]]; s[0] += parseInt(h.slice(1, 3), 16); s[1] += parseInt(h.slice(3, 5), 16); s[2] += parseInt(h.slice(5, 7), 16); s[3]++; });
  const mats = materials.map(({ name, color }, i) => ({ name, color: sum[i][3] ? toHex(sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]) : color }));
  return { tris: Float32Array.from(tris), col, mat: Uint16Array.from(mat), materials: mats, box: { min, max } };
}

// Browser: fetch a .glb / .gltf (and the files it names) and decode its textures. Await it before the timeline is built.
export async function loadModel(url) {
  const base = url.slice(0, url.lastIndexOf("/") + 1), get = async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer());
  const decodeImage = async (bytes, mime) => {
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime })), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d");
    g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, bmp.width, bmp.height);
  };
  return parseModel(await get(url), { fetchBuffer: (u) => get(base + u), decodeImage });
}

// Draw a parsed model at the current iso frame: footprint centred on the origin, resting on z = 0. size: its tallest
// side in metres (else scale, default 1: Kenney and Quaternius kits are in metres). palette: { materialName: hex };
// color: one hex for all; texels: true paints each face its own texel instead of its material's mean. Each triangle is its own painter's item, so the model sorts with the rest of the set.
export function drawModel(iso, m, o = {}) {
  const n = m.tris.length / 9, max = o.max ?? MAX_TRIS;
  if (n > max) throw new Error(`model: ${n} triangles, over ${max}: the Canvas 2D look slows down; pick a lower-poly model or pass max`);
  const { min, max: hi } = m.box, ext = Math.max(hi[0] - min[0], hi[1] - min[1], hi[2] - min[2]) || 1;
  const s = o.size ? o.size / ext : o.scale ?? 1, cx = (min[0] + hi[0]) / 2, cy = (min[1] + hi[1]) / 2, T = m.tris, tones = new Map();
  const tone = (c) => { if (!tones.has(c)) tones.set(c, tri(c)); return tones.get(c); };
  for (let i = 0; i < n; i++) {
    const k = i * 9, f = [0, 3, 6].map((j) => [(T[k + j] - cx) * s, (T[k + j + 1] - cy) * s, (T[k + j + 2] - min[2]) * s]);
    const mt = m.materials[m.mat[i]], c = o.color || o.palette?.[mt.name] || (o.texels ? m.col[i] : mt.color), w = iso.w((f[0][0] + f[1][0] + f[2][0]) / 3, (f[0][1] + f[1][1] + f[2][1]) / 3, (f[0][2] + f[1][2] + f[2][2]) / 3);
    iso.add(w[0] + w[1] + w[2] + (o.bias || 0), () => iso.face3(f, tone(c)), o.layer ?? 1);
  }
  return { h: (hi[2] - min[2]) * s, w: (hi[0] - min[0]) * s, d: (hi[1] - min[1]) * s };
}
