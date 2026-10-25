
// Seeded hash: same pixel, same frame, same value on every worker.
const hash = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Lens finishing shared by both renderers: the GL frame, a vignette and seeded film grain.
export function makeFinisher(out, { grain = 0, edge = "#8a8a8a", fps = 24 } = {}) { // out: the 2D canvas the frame is drawn on
  const W = out.width, H = out.height, FPS = fps;
  const ctx = out.getContext("2d");
  const tile = document.createElement("canvas");
  tile.width = tile.height = 256;
  const tc = tile.getContext("2d");
  const tiles = [0, 1, 2, 3].map((s) => {
    const img = tc.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const n = (hash(i, 1, s) + hash(i, 2, s) + hash(i, 3, s) - 1.5) * 52;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 128 + n;
      img.data[i * 4 + 3] = 255;
    }
    tc.putImageData(img, 0, 0);
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    c.getContext("2d").drawImage(tile, 0, 0);
    return ctx.createPattern(c, "repeat");
  });
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  vig.addColorStop(0, "#ffffff");
  vig.addColorStop(1, edge);
  // layer(gl, i): sub-frame i of a motion-blurred frame, kept as a running mean (i = 0 replaces the frame).
  function layer(gl, i) {
    ctx.globalCompositeOperation = i ? "source-over" : "copy";
    ctx.globalAlpha = 1 / (i + 1);
    ctx.drawImage(gl, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  // grade(t): vignette and grain, once per finished frame.
  function grade(t) {
    const f = Math.round(t * FPS);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = grain;
    const ox = Math.floor(hash(f, 9, 3) * 256), oy = Math.floor(hash(f, 8, 5) * 256);
    ctx.translate(ox, oy);
    ctx.fillStyle = tiles[f % 4];
    ctx.fillRect(-ox, -oy, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  const finish = (gl, t) => { layer(gl, 0); grade(t); };
  return Object.assign(finish, { layer, grade });
}
