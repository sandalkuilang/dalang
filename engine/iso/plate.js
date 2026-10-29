// plate.js — the user's own thing, traced from their photo (scripts/trace.mjs, vtracer), standing in the isometric
// world at its real size (DALANG, MIT). The trace is the photo's own view as vector layers; the plate stands it upright
// at a world point, its lowest edge on the ground, and moves its layers by values: a part turns about its ellipse (a fan,
// a wheel), a colour selection is tinted (copper pipes running hot, then cold), a flow runs along a path drawn on the
// photo (refrigerant, air, current), and marks give overlays their pins on the photo's own parts.
//
//   const plates = await loadPlates(WORLD);   // before the timeline: assets/plates/<plate>/ for every plate part
//   build(iso, WORLD, { values: v, plates });
//   { name: "unit", form: "plate", plate: "ac", w: 0.85,
//     spin: { fan: "fanAngle" }, spread: { fan: "fanBlur" }, tint: { pipes: { color: "#E0523A", amount: "hot" } },
//     flows: [{ path: [[0.62, 0.55], [0.7, 0.4]], color: "#E0523A", width: 6, at: "flow" }],
//     marks: { compressor: [0.72, 0.68] } }
// Paths and marks are fractions of the photo (x of its width, y of its height), read off the photo.
const each = (list, f) => { for (const p of list || []) { f(p); if (p.parts) each(p.parts, f); } };

export async function loadPlates(world, base = "./assets/plates") {
  const keys = new Set(); for (const s of [].concat(world)) each(s.parts, (p) => p.form === "plate" && keys.add(p.plate));
  const out = {};
  for (const k of keys) {
    const t = await (await fetch(`${base}/${k}/trace.json`)).json(), img = {};
    for (const l of t.layers) { const im = new Image(); im.src = `${base}/${k}/${l.name}.svg`; await im.decode?.(); img[l.name] = im; }
    out[k] = { ...t, img };
  }
  return out;
}

// a tinted copy of a layer: drawn once into its own canvas, the colour laid over its opaque pixels only
const tinted = new WeakMap();
function tint(img, t, color, amount) {
  if (!(amount > 0) || typeof document === "undefined") return null;
  let c = tinted.get(img); if (!c) { c = document.createElement("canvas"); c.width = t.w; c.height = t.h; tinted.set(img, c); }
  const g = c.getContext("2d"); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.clearRect(0, 0, t.w, t.h); g.drawImage(img, 0, 0, t.w, t.h);
  g.globalCompositeOperation = "source-atop"; g.globalAlpha = Math.min(1, amount) * 0.55; g.fillStyle = color; g.fillRect(0, 0, t.w, t.h);
  return c;
}

// draws in the plate's frame scaled to metres (the caller is iso.bill): parts behind, the body, tinted selections,
// parts in front (each turned in its own ellipse's frame), then the flows
export function drawPlate(g, t, w, o = {}) {
  const [x0, , x1, y1] = t.bbox, s = w / (x1 - x0), V = o.value || (() => 0);
  g.save(); g.scale(s, s); g.translate(-(x0 + x1) / 2, -y1);
  // a part turns in its ellipse's frame; spread (rad, the angle it sweeps while the shutter is open) draws it as a
  // motion-blurred disc, as a camera sees a fast fan or wheel
  const part = (l) => { const a = V(o.spin?.[l.name]), sp = V(o.spread?.[l.name]), r = (l.deg * Math.PI) / 180, n = sp > 0.05 ? 12 : 1;
    for (let k = 0; k < n; k++) {
      g.save(); g.globalAlpha = n > 1 ? Math.min(1, 2.6 / n) : 1;
      g.translate(l.cx, l.cy); g.rotate(r); g.scale(1, l.ry / l.rx); g.rotate(a - (n > 1 ? (sp * k) / (n - 1) : 0)); g.scale(1, l.rx / l.ry); g.rotate(-r); g.translate(-l.cx, -l.cy);
      g.drawImage(t.img[l.name], 0, 0, t.w, t.h); g.restore();
    } };
  for (const l of t.layers) if (l.kind === "part" && l.back) part(l);
  g.drawImage(t.img.body, 0, 0, t.w, t.h);
  for (const l of t.layers) if (l.kind === "select") { const k = o.tint?.[l.name], c = k && tint(t.img[l.name], t, k.color, V(k.amount)); if (c) g.drawImage(c, 0, 0); }
  for (const l of t.layers) if (l.kind === "part" && !l.back) part(l);
  for (const f of o.flows || []) {
    const pts = f.path.map(([fx, fy]) => [fx * t.w, fy * t.h]), wd = (f.width || 6) * (t.w / 1600), on = V(f.on ?? 1);
    if (!(on > 0)) continue;
    g.save(); g.globalAlpha = Math.min(1, on); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = f.color || "#E0523A"; g.lineWidth = wd;
    g.setLineDash([wd * 2.2, wd * 2.2]); g.lineDashOffset = -V(f.at) * wd * 4.4; // at: the flow's travel, in dash periods
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
  }
  g.restore();
  return { s };
}

// a point on the photo (fractions) → the world point that projects there, for the plate standing at its frame's origin
export function plateMarks(t, w, marks = {}) {
  const [x0, , x1, y1] = t.bbox, s = w / (x1 - x0), C = 2 * Math.cos(Math.PI / 6), out = {};
  const at = (px, py) => { const u = (px - (x0 + x1) / 2) * s, v = (y1 - py) * s; return [u / C, -u / C, v]; };
  for (const l of t.layers) if (l.kind === "part") out[l.name] = at(l.cx, l.cy);
  for (const [n, [fx, fy]] of Object.entries(marks)) out[n] = at(fx * t.w, fy * t.h);
  return out;
}
