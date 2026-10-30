// measure.js — numbers a frame can be checked by, read from its pixels (objectStudio.js measure(), layout_lint.mjs).
//
// heroContrast(frame, mask, w, h, { ring, flipMask }): the difference in CIE L* (0–100) between the mean of the hero's
// pixels and the mean of the ground in a ring of `ring` px around them. frame: RGBA of the finished frame at w x h;
// mask: RGBA of a hero-only render at the same size (red > 127 = hero), its rows bottom-up as WebGL reads them unless
// flipMask is false. null when the frame shows no hero pixel or no ground around it. One decimal.
// ponytail: means over the whole silhouette; a hero half dark, half pale reads as its average. A per-part check if that misleads.
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lstar = (r, g, b) => { const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (Y * 24389) / 27; };

export function heroContrast(frame, mask, w, h, { ring = 4, flipMask = true } = {}) {
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) on[y * w + x] = mask[4 * ((flipMask ? h - 1 - y : y) * w + x)] > 127 ? 1 : 0;
  let hs = 0, hn = 0, gs = 0, gn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 4 * (y * w + x), L = lstar(frame[i], frame[i + 1], frame[i + 2]);
    if (on[y * w + x]) { hs += L; hn++; continue; }
    // ponytail: a square search per pixel, O(w·h·ring²); fine at the 270 px wide mask objectStudio.js renders
    let near = false;
    for (let dy = -ring; dy <= ring && !near; dy++) for (let dx = -ring; dx <= ring && !near; dx++) {
      const yy = y + dy, xx = x + dx;
      near = yy >= 0 && yy < h && xx >= 0 && xx < w && on[yy * w + xx] === 1;
    }
    if (near) { gs += L; gn++; }
  }
  return hn && gn ? Math.round(Math.abs(hs / hn - gs / gn) * 10) / 10 : null;
}
