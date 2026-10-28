// parallax.js — a camera that moves layers at their depth (DALANG, MIT), for every Express language. One camera pose per
// frame, from the timeline; each layer follows it by its depth factor: 1 is the subject's plane, under 1 is farther
// (a sky, a far city, the paper behind: 0.2–0.5), over 1 is nearer (a leaf, a machine edge passing the lens: 1.3–1.6),
// 0 never moves. A pan moves a layer by depth × the camera's move; a zoom by (zoom ratio)^depth, so far layers grow
// slower. The isometric projection never tilts or rotates: a layer only gets its own pan and zoom. Pure functions of
// the pose, so a seek renders the same frame.
//
//   iso canvas:  drawLayers(iso, cam, rest, [{ depth: 0.3, draw: sky }, { depth: 1, draw: set }, { depth: 1.5, draw: leaves }]);
//   SVG / HTML:  applyLayers(root, view, restView, W, H)  — every element with data-depth gets its transform

const check = (d) => { if (!Number.isFinite(d) || d < 0) throw new Error(`parallax: depth ${d} (0 still, under 1 farther, 1 the subject, over 1 nearer)`); return d; };

const checkDolly = (s) => { if (!(Number.isFinite(s) && s > 0)) throw new Error(`parallax: dolly ${s} (a ratio above 0; 1 is none)`); return s; };

// The iso camera { x, y, z, k } a layer at `depth` sees when the subject's camera is `cam` and the shot started at `rest`.
// `dolly` (default 1) is a 2.5D dolly zoom: every layer is also scaled by dolly ^ (1 − depth), so the subject's plane
// (depth 1) never changes while farther layers swell (dolly > 1) and nearer ones shrink, the background stretching
// behind a subject that holds its size (cinema.js dollyZoom25). Pan is not affected.
export function isoLayer(cam, rest, depth, dolly = 1) {
  const f = check(depth), d = checkDolly(dolly) ** (1 - f);
  return { x: rest.x + (cam.x - rest.x) * f, y: rest.y + (cam.y - rest.y) * f, z: rest.z + (cam.z - rest.z) * f, k: rest.k * (cam.k / rest.k) ** f * d };
}

// Draw layers far to near on one canvas, each with its own camera, each flushed before the next (a nearer layer is
// always painted over a farther one). Leaves iso.cam as `cam`. Options, both lens effects of a real camera:
//   focus, aperture: depth of field. A layer is blurred aperture × |depth − focus| px (a layer's own blur overrides);
//     animate focus from one depth to another for a rack focus.
//   dolly: a ratio, the 2.5D dolly zoom (isoLayer).
//   haze: { color, amount }: atmospheric perspective. After each layer farther than the subject, the frame so far is
//     veiled by amount × (1 − depth): far things go paler and cooler, so depth reads even in a still frame.
export function drawLayers(iso, cam, rest, layers, o = {}) {
  const g = iso.g;
  for (const L of [...layers].sort((a, b) => check(a.depth) - check(b.depth))) {
    iso.cam = isoLayer(cam, rest, L.depth, o.dolly ?? 1); L.draw(iso);
    const blur = L.blur ?? (o.aperture || 0) * Math.abs(L.depth - (o.focus ?? 1));
    if (blur > 0.3) { g.save(); g.filter = `blur(${Math.round(blur * 10) / 10}px)`; iso.flush(); g.restore(); } else iso.flush();
    if (o.haze && L.depth < 1) { g.save(); g.globalAlpha = o.haze.amount * (1 - L.depth); g.fillStyle = o.haze.color; g.fillRect(0, 0, iso.W, iso.H); g.restore(); }
  }
  iso.cam = { ...cam };
}

// A 2D view { x, y, zoom } (px, the frame centre's offset from rest, and a scale) → the transform of a layer at
// `depth`, scaled about the frame centre. `svg` is for a transform attribute, `css` for style.transform. `dolly` as in isoLayer.
export function layerTransform(view, rest, depth, W, H, dolly = 1) {
  const f = check(depth), s = (view.zoom / rest.zoom) ** f * checkDolly(dolly) ** (1 - f), tx = -(view.x - rest.x) * f, ty = -(view.y - rest.y) * f;
  const cx = W / 2, cy = H / 2, ox = cx - s * cx + tx * s, oy = cy - s * cy + ty * s, r = (v) => Math.round(v * 1000) / 1000;
  return { s, tx: r(ox), ty: r(oy), svg: `translate(${r(ox)} ${r(oy)}) scale(${r(s)})`, css: `translate(${r(ox)}px, ${r(oy)}px) scale(${r(s)})` };
}

// Set the transform of every element under root with a data-depth, from one view. SVG elements take the attribute,
// HTML elements style.transform with a top-left origin.
export function applyLayers(root, view, rest, W, H, dolly = 1) {
  const els = root.querySelectorAll("[data-depth]");
  for (const el of els) {
    const t = layerTransform(view, rest, Number(el.getAttribute("data-depth")), W, H, dolly);
    if (el.namespaceURI === "http://www.w3.org/2000/svg") el.setAttribute("transform", t.svg);
    else { el.style.transformOrigin = "0 0"; el.style.transform = t.css; }
  }
  return els.length;
}
