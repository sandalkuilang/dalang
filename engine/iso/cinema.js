// cinema.js — a film camera and a film finish for a Canvas 2D frame (DALANG, MIT), so an Express film is shot, not
// slid: a camera that moves between keyed poses like an operated rig, handheld life, speed ramps, whip pans with
// motion blur, and the finish a cinematographer grades with (contrast, warmth, bloom, a light sweep, vignette, grain,
// letterbox bars). Every function is a pure function of t (grain and shake are seeded), so a seek renders the same
// frame. Use them on purpose: each technique does a story job (camera-motion.md §11–12), 4–6 per film.
//
//   const cam = handheld(camAt(tau, keys), tau, { amp: 0.03 });          // the operated camera at the remapped time
//   drawLayers(iso, cam, rest, layers, { focus, aperture: 6, haze });   // parallax.js: depth, rack focus, haze
//   finish.apply(canvas, t, { grade: { contrast: 1.08, warmth: 0.06 }, bloom: 0.25, vignette: 0.35, grain: 0.05 });

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Eases a real operator uses: a move starts and lands gently (inOut), a reveal decelerates (out), a whip is expo.
export const EASE = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  expo: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
};

// The camera at t from keys [{ t, x, y, z, k, ease }] (sorted by t; a key's ease shapes the move that arrives at it).
// Pan in a straight line, zoom in log space (equal steps feel equal), before the first key and after the last: held.
export function camAt(t, keys) {
  if (!keys.length) throw new Error("camAt: no keys");
  for (let i = 1; i < keys.length; i++) if (keys[i].t < keys[i - 1].t) throw new Error("camAt: keys must be sorted by t");
  if (t <= keys[0].t) return pose(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const e = (EASE[b.ease || "inOut"] || EASE.inOut)(clamp((t - a.t) / (b.t - a.t || 1)));
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e, k: a.k * (b.k / a.k) ** e };
    }
  }
  return pose(keys.at(-1));
}
const pose = ({ x, y, z, k }) => ({ x, y, z, k });

// Handheld life on a camera: three incommensurate sines per axis with seeded phases, amp in world units (a few cm on a
// set of metres reads as a person holding the camera; 0 is a locked tripod). Tension raises it, calm lowers it.
export function handheld(cam, t, { amp = 0.02, freq = 0.6, seed = 1 } = {}) {
  const n = (axis) => [1, 2.13, 3.71].reduce((s, f, i) => s + Math.sin(TAU * freq * f * t + hash(seed * 31 + axis * 7 + i) * TAU) / (i + 1), 0) / 1.83;
  return { ...cam, x: cam.x + amp * n(1), y: cam.y + amp * n(2), z: cam.z + amp * 0.5 * n(3) };
}
const TAU = Math.PI * 2;

// Speed ramp: keys [{ t, speed }] (1 normal, 0.25 slow motion, 0 a freeze), linear between keys, held outside. Returns
// the story time τ at film time t, the integral of the speed, so a ramp into the impact slows without a jump.
export function ramp(t, keys) {
  if (!keys.length) return t;
  let tau = 0, prevT = 0, prevS = keys[0].speed;
  for (const k of keys) {
    if (t <= k.t) { const s = prevS + (k.speed - prevS) * ((t - prevT) / (k.t - prevT || 1)); return tau + ((prevS + s) / 2) * (t - prevT); }
    tau += ((prevS + k.speed) / 2) * (k.t - prevT); prevT = k.t; prevS = k.speed;
  }
  return tau + prevS * (t - prevT);
}

// A whip pan from camera a to b over [t0, t0 + dur]: expo ease, so it blurs through the middle. Returns the camera and
// the blur this frame needs (0–1 of the move's peak speed), for motionBlur's samples or a directional smear.
export function whip(t, t0, dur, a, b) {
  const p = clamp((t - t0) / dur), e = EASE.expo(p), h = 1e-3, v = (EASE.expo(clamp(p + h)) - EASE.expo(clamp(p - h))) / (2 * h);
  return { cam: { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e, k: a.k * (b.k / a.k) ** e }, blur: clamp(v / (10 * Math.LN2)) }; // expo's peak speed is 10·ln 2 at the middle
}

// Motion blur across a shutter: draw(ctx, t) renders one instant; the frame is the running mean of `samples` instants
// spread over the shutter angle (180° = half a frame). Costs `samples` renders: use it on fast moves only, with about
// one sample per 4 px the fastest layer travels in the frame (a whip needs 16–24; fewer show as separate copies).
export function motionBlur(target, buffer, draw, t, { fps = 30, shutter = 180, samples = 6 } = {}) {
  const span = (shutter / 360) / fps, g = target.getContext("2d"), b = buffer.getContext("2d");
  g.clearRect(0, 0, target.width, target.height);
  for (let i = 0; i < samples; i++) {
    b.clearRect(0, 0, buffer.width, buffer.height);
    draw(b, t + (samples === 1 ? 0 : (i / (samples - 1) - 0.5) * span));
    g.save(); g.globalAlpha = 1 / (i + 1); g.drawImage(buffer, 0, 0); g.restore();
  }
}

// The film finish, in the order a grade is done: grade → bloom → light sweep → vignette → grain → aspect bars, last.
// Buffers are made once (canvas(W, H) makes one: document or OffscreenCanvas).
export function makeFinish(W, H, { canvas = defaultCanvas, seed = 7 } = {}) {
  const copy = canvas(W, H), noise = canvas(256, 256), ng = noise.getContext("2d"), img = ng.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = Math.round(hash(seed + i * 0.618) * 255); img.data.set([v, v, v, 255], i * 4); }
  ng.putImageData(img, 0, 0);
  return {
    apply(target, t, o = {}) {
      const g = target.getContext("2d"), c = copy.getContext("2d");
      const snap = (filter) => { c.clearRect(0, 0, W, H); c.filter = filter || "none"; c.drawImage(target, 0, 0); c.filter = "none"; };
      if (o.grade) { // contrast and saturation in the browser's filters; warmth as a soft-light tint (+ warm, − cool)
        const { contrast = 1, saturate = 1, warmth = 0 } = o.grade;
        snap(`contrast(${contrast}) saturate(${saturate})`); g.clearRect(0, 0, W, H); g.drawImage(copy, 0, 0);
        if (warmth) { g.save(); g.globalCompositeOperation = "soft-light"; g.globalAlpha = Math.abs(warmth); g.fillStyle = warmth > 0 ? "#FF9A3C" : "#3C8CFF"; g.fillRect(0, 0, W, H); g.restore(); }
      }
      if (o.bloom) { // highlights bleed: a bright, blurred copy screened over the frame
        snap(`brightness(1.15) contrast(1.6) blur(${Math.round(Math.min(W, H) * 0.012)}px)`);
        g.save(); g.globalCompositeOperation = "screen"; g.globalAlpha = o.bloom; g.drawImage(copy, 0, 0); g.restore();
      }
      if (o.sweep) { // a band of light crossing the frame (a window's sun, a reveal): at 0..1 across, angle in radians
        const { at, width = 0.18, angle = -0.5, alpha = 0.25, color = "#FFF4DC" } = o.sweep, d = Math.hypot(W, H);
        const cx = W / 2 + Math.cos(angle) * d * (at - 0.5), cy = H / 2 + Math.sin(angle) * d * (at - 0.5), wx = Math.cos(angle) * d * width / 2, wy = Math.sin(angle) * d * width / 2;
        const gr = g.createLinearGradient(cx - wx, cy - wy, cx + wx, cy + wy);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, color); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.save(); g.globalCompositeOperation = "screen"; g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
      }
      if (o.vignette) { // the corners fall off about 0.3–0.7 stop
        const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(20,12,8,${o.vignette})`);
        g.save(); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
      }
      if (o.grain) { // seeded film grain, a new offset each frame, overlay so it lives in the mid-tones
        const f = Math.floor(t * (o.fps || 30)), ox = Math.floor(hash(f + seed) * 256), oy = Math.floor(hash(f * 1.7 + seed) * 256);
        g.save(); g.globalCompositeOperation = "overlay"; g.globalAlpha = o.grain; g.translate(-ox, -oy);
        g.fillStyle = g.createPattern(noise, "repeat"); g.fillRect(ox, oy, W, H); g.restore();
      }
      if (o.bars) { // letterbox to an aspect (2.39 for scope); bars: { aspect, amount 0..1 } eased in and out on a cue
        const { aspect = 2.39, amount = 1, color = "#0B0806" } = o.bars, h = W / aspect, bar = Math.max(0, (H - h) / 2) * clamp(amount);
        if (bar > 0) { g.save(); g.fillStyle = color; g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar); g.restore(); }
      }
    },
  };
}
const defaultCanvas = (w, h) => (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }));
