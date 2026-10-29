// plate.js — the user's own thing, traced from their photo (scripts/trace.mjs), standing in the isometric world at its
// real size (DALANG, MIT). The trace is a flat inked drawing in the photo's own view; the plate stands it upright at a
// world point, its lowest edge on the ground, and turns its moving layers (a wheel) about their ellipses by a value.
//
//   const plates = await loadPlates(WORLD);   // before the timeline: assets/plates/<plate>/ for every plate part
//   build(iso, WORLD, { values: v, plates });
//   part: { name: "bike", form: "plate", plate: "scooter", w: 1.92, spin: { front: "roll", rear: "roll" } }
// w is the thing's real length across the photo (the traced bbox width), in metres; d its depth for the paint order.
const each = (list, f) => { for (const p of list || []) { f(p); if (p.parts) each(p.parts, f); } };

export async function loadPlates(world, base = "./assets/plates") {
  const keys = new Set(); for (const s of [].concat(world)) each(s.parts, (p) => p.form === "plate" && keys.add(p.plate));
  const out = {};
  for (const k of keys) {
    const t = await (await fetch(`${base}/${k}/trace.json`)).json(), img = {};
    for (const n of t.layers) { const im = new Image(); im.src = `${base}/${k}/${n}.svg`; await im.decode?.(); img[n] = im; }
    out[k] = { ...t, img };
  }
  return out;
}

// draws in the plate's frame, scaled to metres (the caller is iso.bill, which scales by the camera): moving layers
// first, each turned by its angle in its ellipse's own frame, then the body over them (its holes show them)
export function drawPlate(g, t, w, angle = () => 0) {
  const [x0, y0, x1, y1] = t.bbox, s = w / (x1 - x0);
  g.save(); g.scale(s, s); g.translate(-(x0 + x1) / 2, -y1);
  for (const n of t.layers) {
    if (n === "body") continue;
    const e = t.parts[n], a = angle(n), r = (e.deg * Math.PI) / 180;
    g.save(); g.translate(e.cx, e.cy); g.rotate(r); g.scale(1, e.ry / e.rx); g.rotate(a); g.scale(1, e.rx / e.ry); g.rotate(-r); g.translate(-e.cx, -e.cy);
    g.drawImage(t.img[n], 0, 0, t.w, t.h); g.restore();
  }
  g.drawImage(t.img.body, 0, 0, t.w, t.h);
  g.restore();
  return { s, height: (y1 - y0) * s };
}
