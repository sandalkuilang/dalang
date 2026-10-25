import { THREE } from "./three-vendor.js";
import { M, tone } from "./kit.js";
import { surface } from "./surfaces.js";
import { bakeBend } from "./wind.js";

// Plants that move in the set's air (wind.js). Modelled in metres, scaled by 1/M. Every flexible part is a damped
// oscillator driven by the drag of the air (bakeBend), baked once: the same motion in every render.

// A leaf blade: outline from its shape, cupped along the midrib (fold) and arching along its length (curl); the
// petiole at the origin, the blade along +z, its face up (+y). uv: x across, y along.
const outlines = { ovate: (s) => Math.sin(Math.PI * Math.pow(s, 0.75)), lanceolate: (s) => Math.pow(Math.sin(Math.PI * s), 1.4) * 0.7, elliptic: (s) => Math.sin(Math.PI * s), heart: (s) => Math.sin(Math.PI * Math.pow(s, 0.55)) * (1 + 0.25 * Math.exp(-(((s - 0.12) / 0.1) ** 2))) };
export function leafGeometry({ length = 0.08, width = 0.045, shape = "ovate", fold = 0.25, curl = 0.15, petiole = 0.012 } = {}) {
  const ns = 10, nw = 6, pos = [], uv = [], idx = [], o = outlines[shape];
  for (let i = 0; i <= ns; i++) for (let j = 0; j <= nw; j++) {
    const s = i / ns, u = j / nw * 2 - 1, half = (width / 2) * o(Math.max(0.001, s)), x = u * half;
    pos.push(x / M, (fold * Math.abs(x) - curl * length * s * s) / M, (petiole + s * length) / M);
    uv.push(j / nw, s);
  }
  for (let i = 0; i < ns; i++) for (let j = 0; j < nw; j++) { const a = i * (nw + 1) + j, b = a + nw + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A leaf's face: a midrib, paired lateral veins running to the margin, lighter toward the vein lines, a little mottling.
export function leafTexture(k, color = 0x5f8a45) {
  const c = new THREE.Color(color), hsl = {};
  c.getHSL(hsl);
  const css = (dl, ds = 0) => `hsl(${(hsl.h * 360).toFixed(0)},${((hsl.s + ds) * 100).toFixed(0)}%,${((hsl.l + dl) * 100).toFixed(0)}%)`;
  return k.canvasTex(128, 256, (g) => {
    g.fillStyle = css(0); g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 140; i++) { g.fillStyle = css(0.04 * (tone(i, 1) - 0.5), 0.05 * (tone(i, 2) - 0.5)); g.globalAlpha = 0.35; g.beginPath(); g.arc(tone(i, 3) * 128, tone(i, 4) * 256, 4 + 10 * tone(i, 5), 0, 7); g.fill(); }
    g.globalAlpha = 1; g.strokeStyle = css(0.12, -0.1); g.lineWidth = 3; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.stroke();
    g.lineWidth = 1.2;
    for (let y = 20; y < 240; y += 22) [-1, 1].forEach((d) => { g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + d * 30, y + 14, 64 + d * 62, y + 40); g.stroke(); });
  });
}

// Foliage material: double-sided, and translucent the way leaves are: light from the sun behind a leaf comes
// through it, tinted by it (sun: the scene's sun DirectionalLight).
export function leafMaterial({ map, color = 0xffffff, translucency = 0.6, sun, roughness = 0.55 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, color, roughness, side: THREE.DoubleSide }), u = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(0, 0, 0) }, uTrans: { value: translucency } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uSun, uSunColor; uniform float uTrans;")
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uTrans * max(0.0, dot(-normal, normalize(uSun)));");
  };
  m.userData.sync = (camera) => { // call once per frame: the sun's direction in view space
    if (!sun) return;
    u.uSun.value.copy(sun.position).sub(sun.target.position).normalize().transformDirection(camera.matrixWorldInverse);
    u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
  };
  return m;
}

// A tree, grown by rules: a trunk, then levels of branches (each child set round its parent by the golden angle,
// leaving at 40-70°, shorter toward the tip, the first level turning up, the thinnest drooping), tapering bark
// tubes, and leaves on the outer twigs. Each branch is an oscillator (trunk ~0.8 Hz, twigs ~4.5 Hz); a point on a
// branch moves with its own bend and every ancestor's. Leaves flutter faster as the air quickens.
export function tree(k, { at, height = 4, trunk = 0.12, levels = 3, children = [6, 4, 3], leaves = 1500, leaf = {}, bark = 0x6b5444, leafColor = 0x5f8a45, sun, seed = 3 } = {}) {
  const rnd = ((i) => () => tone(i++, seed))(1), V = (x, y, z) => new THREE.Vector3(x, y, z), branches = [];
  const up = V(0, 1, 0);
  function grow(parent, s, dir, len, r0, level) {
    const start = parent ? point(parent, s) : V(0, 0, 0), pts = [start.clone()], bendUp = level === 1 ? 0.25 : level >= 3 ? -0.15 : 0.05;
    for (let k2 = 1; k2 <= 4; k2++) { const f = k2 / 4; pts.push(start.clone().addScaledVector(dir, len * f).addScaledVector(up, bendUp * len * f * f).add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.04 * len))); }
    const b = { pts, curve: new THREE.CatmullRomCurve3(pts), r0, r1: r0 * (level ? 0.35 : 0.45), level, parent, s, len, index: branches.length };
    branches.push(b);
    if (level < levels) {
      const n = children[level];
      for (let i = 0; i < n; i++) {
        const cs = level ? 0.3 + 0.65 * (i + rnd()) / n : 0.45 + 0.55 * (i + rnd()) / n, az = i * 2.39996 + rnd() * 0.5, el = (40 + 30 * rnd()) * Math.PI / 180;
        const t = b.curve.getTangentAt(cs), side = V(Math.cos(az), 0, Math.sin(az)).projectOnPlane(t).normalize();
        const cd = t.clone().multiplyScalar(Math.cos(el)).addScaledVector(side, Math.sin(el)).normalize();
        grow(b, cs, cd, len * [0.62, 0.55, 0.5, 0.45][level] * (1.15 - 0.5 * cs), radius(b, cs) * 0.68, level + 1);
      }
    }
    return b;
  }
  const point = (b, s) => b.curve.getPointAt(s), radius = (b, s) => b.r0 + (b.r1 - b.r0) * s;
  grow(null, 0, V(0.06 * (rnd() - 0.5), 1, 0.06 * (rnd() - 0.5)).normalize(), height * 0.5, trunk, 0);

  // Bark: one tapered tube per branch, all in one geometry; each vertex remembers its branch and where along it.
  const pos = [], nrm = [], uv = [], idx = [], owner = [], along = [], rad = 8;
  branches.forEach((b) => {
    const seg = Math.max(3, Math.round(b.len / 0.08)), frames = b.curve.computeFrenetFrames(seg, false), base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const s = i / seg, c = b.curve.getPointAt(s), r = radius(b, s);
      for (let j = 0; j <= rad; j++) {
        const a = (j / rad) * Math.PI * 2, n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
        const p = c.clone().addScaledVector(n, r);
        pos.push(p.x / M, p.y / M, p.z / M); nrm.push(n.x, n.y, n.z); uv.push(j / rad, s * b.len / 0.5); owner.push(b.index); along.push(s);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = base + i * (rad + 1) + j, d = a + rad + 1; idx.push(a, d, a + 1, d, d + 1, a + 1); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const rest = Float32Array.from(pos), group = new THREE.Group(), wood = surface(new THREE.MeshStandardMaterial({ color: bark, roughness: 0.9 }), "bark");
  const trunkMesh = new THREE.Mesh(g, wood);
  trunkMesh.castShadow = trunkMesh.receiveShadow = true;
  group.add(trunkMesh);
  group.position.copy(at);
  group.name = "tree";
  k.scene.add(group);

  // Leaves on the outer two levels, by length share, petiole on the twig, the blade facing out and up.
  const twigs = branches.filter((b) => b.level >= levels - 1), total = twigs.reduce((a, b) => a + b.len, 0), spots = [];
  twigs.forEach((b) => { const n = Math.round((leaves * b.len) / total); for (let i = 0; i < n; i++) spots.push({ b, s: 0.3 + 0.7 * rnd(), az: rnd() * 6.283, tilt: 0.3 + 0.5 * rnd(), f: 4 + 4 * rnd(), ph: rnd() * 6.283, size: 0.8 + 0.4 * rnd() }); });
  const lmat = leafMaterial({ map: leafTexture(k, leafColor), sun }), lgeo = leafGeometry(leaf), foliage = new THREE.InstancedMesh(lgeo, lmat, spots.length);
  foliage.castShadow = foliage.receiveShadow = true;
  foliage.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  foliage.frustumCulled = false;
  group.add(foliage);
  spots.forEach((l) => { // the blade points out from its twig (round it by az, forward along it, up by tilt), its face turned up
    l.p = point(l.b, l.s);
    const t = l.b.curve.getTangentAt(l.s), n1 = Math.abs(t.y) < 0.9 ? up.clone().cross(t).normalize() : V(1, 0, 0), n2 = t.clone().cross(n1);
    const z = n1.multiplyScalar(Math.cos(l.az)).addScaledVector(n2, Math.sin(l.az)).addScaledVector(t, 0.4).addScaledVector(up, l.tilt).normalize();
    const x = Math.abs(z.y) < 0.99 ? up.clone().cross(z).normalize() : V(1, 0, 0), y2 = z.clone().cross(x);
    l.q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y2, z));
  });

  // Motion: one oscillator per branch, the air sampled at its middle.
  const mid = branches.map((b) => point(b, 0.5).clone().divideScalar(M).add(at));
  const chain = branches.map((b) => { const c = []; for (let a = b; a.parent; a = a.parent) c.push([a.parent.index, a.s]); return c; });
  let baked = null;
  const disp = new Float32Array(branches.length * 2), mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), air = new THREE.Vector3(), pp = new THREE.Vector3();
  const base = (bend, i) => { let x = 0, z = 0; for (const [a, s] of chain[i]) { const L = branches[a].len / M; x += bend[a * 2] * L * s * s; z += bend[a * 2 + 1] * L * s * s; } disp[i * 2] = x; disp[i * 2 + 1] = z; };
  return {
    group, foliage, branches: branches.length, leaves: spots.length,
    bake(field, duration) {
      baked = bakeBend({ count: branches.length, at: (i, p) => p.copy(mid[i]), field, duration, f: (i) => [0.8, 1.8, 3, 4.5][branches[i].level] * (0.85 + 0.3 * tone(i, seed + 9)), zeta: 0.12, lean: (i) => [0.03, 0.12, 0.2, 0.3][branches[i].level] });
      this.field = field;
      return baked;
    },
    apply(t, camera) {
      const bend = baked ? baked.bend(t) : new Float32Array(branches.length * 2), p = g.attributes.position.array;
      branches.forEach((b, i) => base(bend, i));
      for (let v = 0; v < owner.length; v++) { const i = owner[v], L = branches[i].len / M, s2 = along[v] * along[v]; p[v * 3] = rest[v * 3] + disp[i * 2] + bend[i * 2] * L * s2; p[v * 3 + 2] = rest[v * 3 + 2] + disp[i * 2 + 1] + bend[i * 2 + 1] * L * s2; }
      g.attributes.position.needsUpdate = true;
      g.computeBoundingSphere();
      spots.forEach((l, n) => {
        const i = l.b.index, L = l.b.len / M, s2 = l.s * l.s;
        if (this.field) this.field.at(pp.copy(l.p).divideScalar(M).add(at), t, air);
        const v = Math.hypot(air.x, air.z) * M, flap = Math.min(0.7, 0.02 * Math.pow(v, 1.5)) * Math.sin(2 * Math.PI * l.f * t + l.ph);
        q.copy(l.q).multiply(new THREE.Quaternion().setFromEuler(e.set(flap, 0, 0.5 * flap)));
        pp.copy(l.p).divideScalar(M);
        pp.x += disp[i * 2] + bend[i * 2] * L * s2; pp.z += disp[i * 2 + 1] + bend[i * 2 + 1] * L * s2;
        foliage.setMatrixAt(n, mat4.compose(pp, q, sc.setScalar(l.size)));
      });
      foliage.instanceMatrix.needsUpdate = true;
      if (camera) lmat.userData.sync(camera);
    },
  };
}

// Grass: blades instanced over an area (x0..x1, z0..z1 in units, on ground y), each tapered and slightly curved,
// its own height, lean and green; each blade an oscillator (1.5-3 Hz, well damped) driven by the air at its tip,
// so gusts run across the lawn as waves. density: blades per m² (a dense lawn is ~2000 for the camera; real
// counts are ten times that, below a pixel).
export function grass(k, { x0, x1, z0, z1, y = 0, inside = () => true, density = 2000, height = [0.06, 0.14], width = 0.005, colors = [0x5f8a45, 0x7aa055, 0x8fae5e, 0x4f7a3c], seed = 5 } = {}) {
  const area = (x1 - x0) * (z1 - z0) * M * M, want = Math.round(area * density), seg = 5, pos = [], col = [], idx = [];
  for (let i = 0; i <= seg; i++) { const s = i / seg, w = (width / 2) * (1 - s) ** 0.8 / M, lean = 0.12 * s * s / M; pos.push(-w, s / M, lean, w, s / M, lean); const k2 = 0.55 + 0.45 * s; col.push(k2, k2, k2, k2, k2, k2); }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); // 1 unit tall: scaled per blade
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const blades = [];
  for (let i = 0; blades.length < want && i < want * 3; i++) {
    const x = x0 + (x1 - x0) * tone(i, seed), z = z0 + (z1 - z0) * tone(i, seed + 1);
    if (inside(x, z)) blades.push({ x, z, h: (height[0] + (height[1] - height[0]) * tone(i, seed + 2)) * M, yaw: tone(i, seed + 3) * 6.283 });
  }
  const bend = new THREE.InstancedBufferAttribute(new Float32Array(blades.length * 2), 2);
  bend.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("aBend", bend);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  const patch = (sh) => { sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aBend;").replace("#include <begin_vertex>", "#include <begin_vertex>\n{ float s = position.y; float H = length(instanceMatrix[1].xyz); transformed.xz += aBend * s * s * H; transformed.y -= 0.5 * dot(aBend, aBend) * s * s * s; } // aBend: radians; the blade is 1 tall, scaled by H"); };
  m.onBeforeCompile = patch;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = patch;
  const mesh = new THREE.InstancedMesh(g, m, blades.length);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = "grass";
  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  blades.forEach((b, i) => { mesh.setMatrixAt(i, mat4.compose(new THREE.Vector3(b.x, y, b.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw), new THREE.Vector3(1, b.h / M, 1))); mesh.setColorAt(i, c.set(colors[i % colors.length]).offsetHSL(0, 0, 0.06 * (tone(i, seed + 4) - 0.5))); });
  k.scene.add(mesh);
  let baked = null;
  return {
    mesh, blades: blades.length,
    bake(field, duration) { baked = bakeBend({ count: blades.length, at: (i, p) => p.set(blades[i].x, y + blades[i].h / M, blades[i].z), field, duration, f: (i) => 1.5 + 1.5 * tone(i, seed + 6), zeta: 0.3, lean: 0.6, sample: 4 }); return baked; },
    apply(t) { // world bend → each blade's own frame (it is turned by its yaw)
      if (!baked) return;
      const th = baked.bend(t), a = bend.array;
      blades.forEach((b, i) => { const cy = Math.cos(b.yaw), sy = Math.sin(b.yaw), x = th[i * 2], z = th[i * 2 + 1]; a[i * 2] = cy * x - sy * z; a[i * 2 + 1] = sy * x + cy * z; });
      bend.needsUpdate = true;
    },
  };
}

// A rigid kit plant (one mesh, no bones) in moving air: each leaf's tip moves with the drag on it (∝ v², ~reach m at
// 2.5 m/s for stiff leaves) along the air's way, more toward the tips, and flutters at ~5 Hz as eddies shed off it.
// Returns update(t): call it every frame.
export function sway(obj, field, { reach = 0.015 } = {}) {
  const b = new THREE.Box3().setFromObject(obj, true), y0 = b.min.y, h = b.max.y - b.min.y, at = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y - h * 0.25, (b.min.z + b.max.z) / 2);
  const u = { value: new THREE.Vector3() }, air = new THREE.Vector3(), c = reach / M / (2.5 / M) ** 2;
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const mats = [].concat(m.material).map((mt) => {
      const n = mt.clone(), prev = mt.onBeforeCompile;
      n.onBeforeCompile = (sh, r) => {
        if (prev) prev(sh, r);
        sh.uniforms.swayU = u;
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform vec3 swayU;").replace("#include <begin_vertex>", `#include <begin_vertex>
          { vec4 wp = modelMatrix * vec4(transformed, 1.0); float hh = clamp((wp.y - ${y0.toFixed(4)}) / ${h.toFixed(4)}, 0.0, 1.0); wp.xyz += swayU * hh * hh; transformed = (inverse(modelMatrix) * wp).xyz; }`);
      };
      n.customProgramCacheKey = () => (mt.customProgramCacheKey ? mt.customProgramCacheKey() : "") + "sway";
      return n;
    });
    m.material = mats.length === 1 ? mats[0] : mats;
  });
  return (t) => { field.at(at, t, air); const v = Math.hypot(air.x, air.z); u.value.set(air.x, 0, air.z).multiplyScalar(v ? c * v * (1 + 0.3 * Math.sin(t * 2 * Math.PI * 5.3)) : 0); };
}
