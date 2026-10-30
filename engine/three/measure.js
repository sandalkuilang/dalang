// measure.js — numbers a frame can be checked by, read from its pixels (objectStudio.js measure(), layout_lint.mjs).
//
// heroContrast(frame, mask, w, h, { ring, flipMask }): the colour difference ΔE*ab (CIE76, 0–100+) between the mean of
// the hero's pixels and the mean of the ground in a ring of `ring` px around them. Lightness alone would flag a green
// board on brown wood (same L*, plainly two things); ΔE counts hue and chroma too. frame: RGBA of the finished frame at w x h;
// mask: RGBA of a hero-only render at the same size (red > 127 = hero), its rows bottom-up as WebGL reads them unless
// flipMask is false. null when the frame shows no hero pixel or no ground around it. One decimal.
// ponytail: means over the whole silhouette; a hero half dark, half pale reads as its average. A per-part check if that misleads.
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const lab = (r, g, b) => { // sRGB -> CIE Lab (D65)
  const R = lin(r), G = lin(g), B = lin(b);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

export function heroContrast(frame, mask, w, h, { ring = 4, flipMask = true } = {}) {
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) on[y * w + x] = mask[4 * ((flipMask ? h - 1 - y : y) * w + x)] > 127 ? 1 : 0;
  const hs = [0, 0, 0], gs = [0, 0, 0]; let hn = 0, gn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 4 * (y * w + x), c = lab(frame[i], frame[i + 1], frame[i + 2]);
    if (on[y * w + x]) { for (let k = 0; k < 3; k++) hs[k] += c[k]; hn++; continue; }
    // ponytail: a square search per pixel, O(w·h·ring²); fine at the 270 px wide mask objectStudio.js renders
    let near = false;
    for (let dy = -ring; dy <= ring && !near; dy++) for (let dx = -ring; dx <= ring && !near; dx++) {
      const yy = y + dy, xx = x + dx;
      near = yy >= 0 && yy < h && xx >= 0 && xx < w && on[yy * w + xx] === 1;
    }
    if (near) { for (let k = 0; k < 3; k++) gs[k] += c[k]; gn++; }
  }
  return hn && gn ? Math.round(Math.hypot(...hs.map((v, k) => v / hn - gs[k] / gn)) * 10) / 10 : null;
}

// maskShare(mask, w, h, box, W, H, { flipMask }): the share (0–1) of a box (px at the W x H frame) that the hero's
// pixels cover, from the same mask. null when the box lies outside the frame. Text over the hero's box but not over its
// pixels (a caption in the gap between parts) reads 0.
export function maskShare(mask, w, h, box, W, H, { flipMask = true } = {}) {
  const x0 = Math.max(0, Math.floor((box.x0 / W) * w)), x1 = Math.min(w, Math.ceil((box.x1 / W) * w));
  const y0 = Math.max(0, Math.floor((box.y0 / H) * h)), y1 = Math.min(h, Math.ceil((box.y1 / H) * h));
  let on = 0, all = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { all++; if (mask[4 * ((flipMask ? h - 1 - y : y) * w + x)] > 127) on++; }
  return all ? Math.round((on / all) * 100) / 100 : null;
}

// edgeShare(mask, w, h, { flipMask }): the share (0–1) of each frame edge's pixels that are the hero's: { left, top, right, bottom }.
// A hero is cut by the frame where its pixels reach the edge; a part of the box that is off the frame draws nothing there.
export function edgeShare(mask, w, h, { flipMask = true } = {}) {
  const on = (x, y) => mask[4 * ((flipMask ? h - 1 - y : y) * w + x)] > 127 ? 1 : 0;
  const share = (n, at) => { let c = 0; for (let i = 0; i < n; i++) c += at(i); return Math.round((c / n) * 100) / 100; };
  return { left: share(h, (y) => on(0, y)), right: share(h, (y) => on(w - 1, y)), top: share(w, (x) => on(x, 0)), bottom: share(w, (x) => on(x, h - 1)) };
}
