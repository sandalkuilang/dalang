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
// A move goes one way: a camera that travels right and then left (or the reverse) with no hold between reads as a
// wobble, not a move, so camAt refuses it. Hold ≥ 0.5 s (a key repeated) or cut before the camera turns back; going
// round a subject is orbit25, in one direction.
const checked = new WeakSet();
export function camAt(t, keys) {
  if (!keys.length) throw new Error("camAt: no keys");
  if (!checked.has(keys)) { oneWay(keys); checked.add(keys); }
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
// Sideways screen travel of each move (px; the iso screen x follows x − y), and a turn back with no hold between.
const TURN_PX = 40, HOLD_S = 0.5;
function oneWay(keys) {
  let dir = 0;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (b.t < a.t) throw new Error("camAt: keys must be sorted by t");
    const px = ((b.x - b.y) - (a.x - a.y)) * 0.866 * Math.sqrt(a.k * b.k);
    if (Math.abs(px) < TURN_PX) { if (b.t - a.t >= HOLD_S) dir = 0; continue; }
    const d = Math.sign(px);
    if (dir && d !== dir) throw new Error(`camAt: the camera turns back ${d > 0 ? "left → right" : "right → left"} at t=${a.t} (keys ${i - 1}→${i}) with no hold: a move goes one way. Hold ≥ ${HOLD_S} s or cut first; circling a subject is orbit25, one direction.`);
    dir = d;
  }
}

// Handheld life on a camera: three incommensurate sines per axis with seeded phases. amp is world units at k = 100 px
// per metre (a few cm reads as a person holding the camera; 0 is a locked tripod), and the shake is held to the same
// size ON SCREEN at every zoom: a hand shakes the lens by an angle, so a close-up must not swing more than the wide
// shot (world-unit shake times a zoom of 5x is a left-right wobble). Tension raises it, calm lowers it.
export function handheld(cam, t, { amp = 0.02, freq = 0.6, seed = 1 } = {}) {
  const n = (axis) => [1, 2.13, 3.71].reduce((s, f, i) => s + Math.sin(TAU * freq * f * t + hash(seed * 31 + axis * 7 + i) * TAU) / (i + 1), 0) / 1.83;
  const a = amp * (cam.k > 0 ? 100 / cam.k : 1);
  return { ...cam, x: cam.x + a * n(1), y: cam.y + a * n(2), z: cam.z + a * 0.5 * n(3) };
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

// ---- 2.5D camera moves --------------------------------------------------------------------------------------------
// Express draws on the vendored fixed isometric projection, so these are honest 2.5D approximations built from layer
// depth (parallax.js), never a tilted card: orbit, crane, dolly zoom and drone read as the real move because layers at
// different depths move against each other the way they would in front of a lens. Studio has the real ones
// (engine/three/camera.js). Options for every move: start (s), dur (s), ease (EASE name). Pan units are iso world units;
// a sideways move d (x + d, y − d) shifts the screen √3·k·d px; `width`/`height` are the frame in px.
//
//   const o = orbit25(t, { rest, dur: 4 });          drawLayers(iso, o, o.rest, layers);
//   const c = crane25(t, { rest, rise: 3 });         drawLayers(iso, c, rest, layers);
//   const d = dollyZoom25(t, { rest, dur: 1.5 });    drawLayers(iso, d.cam, rest, layers, { dolly: d.dolly });
//   const r = drone25(t, { rest, dur: 3 });          drawLayers(iso, r, rest, layers, { haze });
const move = (t, { start = 0, dur = 3, ease = "inOut" } = {}) => (EASE[ease] || EASE.inOut)(clamp((t - start) / (dur || 1)));
const SQ3 = Math.sqrt(3);

// The subject stays centred and the world slides round it: layers farther than the subject (depth < 1) slide one way,
// nearer ones (depth > 1) the other, depth 1 not at all. `sweep` is the depth-0 travel as a fraction of the frame width.
// Returns the rest camera plus `.rest`, the shifted reference to hand to drawLayers. `from`/`to` are the start and end of
// the slide in `sweep` units (default −0.5 → 0.5, centred on the rest); an orbit that starts the instant a zoom lands
// is `from: 0, to: 1` (or `to: −1` for the other side), so it leaves the arrival pose without a jump.
export function orbit25(t, { rest, sweep = 0.12, width = 1920, from = -0.5, to = 0.5, ...o } = {}) {
  const d = (sweep * width) / (SQ3 * rest.k) * (from + (to - from) * move(t, o));
  return { ...rest, rest: { ...rest, x: rest.x + d, y: rest.y - d } };
}

// A vertical boom: the camera rises (rise > 0, world units) or lowers, far layers moving less than near ones, and the
// view widens a little as it rises so the world is revealed.
export function crane25(t, { rest, rise = 2, ...o } = {}) {
  const e = move(t, o);
  return { x: rest.x, y: rest.y, z: rest.z + rise * e, k: rest.k * (rise >= 0 ? 0.92 : 1 / 0.92) ** e };
}

// The subject holds its size while the world stretches behind it: pass `cam` and `rest` to drawLayers with `{ dolly }`.
// strength is the extra scale the farthest layer (depth 0) has gained at the end of the move.
export function dollyZoom25(t, { rest, strength = 0.3, ...o } = {}) {
  return { cam: { ...rest }, dolly: (1 + strength) ** move(t, o) };
}

// A descending reveal: from a wider, offset, higher view (`from` times farther out) onto `rest`, landing exactly on it.
// Pair it with drawLayers' haze so the far world pales as it comes into view.
export function drone25(t, { rest, from = 2.2, drift = 0.12, lift = 0.12, width = 1920, height = 1080, ease = "out", ...o } = {}) {
  const u = 1 - move(t, { ...o, ease }), d = (drift * width) / (SQ3 * rest.k) * u;
  return { x: rest.x + d, y: rest.y - d, z: rest.z + (lift * height) / rest.k * u, k: rest.k / from ** u };
}

// A lens aperture as drawLayers' depth of field: { focus, aperture } for fstop (f1.2 melts off-focus layers, f5.6 keeps
// them nearly sharp). aperture is px of blur per unit of depth from the focus layer: 18 at f1.2 and 50 mm, inversely
// with the f-number, in proportion to the focal length (85 mm blurs 1.7×, 24 mm 0.48×).
export function bokeh(fstop, { focus = 1, mm = 50 } = {}) {
  if (!(fstop > 0) || !(mm > 0)) throw new Error(`bokeh: fstop ${fstop} and mm ${mm} must be above 0`);
  return { focus, aperture: 18 * (1.2 / fstop) * (mm / 50) };
}

// Out-of-focus lights: a soft disc with a brighter rim (the look of a real lens's bokeh) at each { x, y, a = 1 } screen
// px point, added to the frame. color is a #rrggbb hex. Deterministic.
export function discs(g, points, { radius = 40, color = "#ffffff", alpha = 0.5 } = {}) {
  const [r, gr, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  g.save(); g.globalCompositeOperation = "lighter";
  for (const p of points) {
    const a = alpha * (p.a ?? 1), gd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    gd.addColorStop(0, `rgba(${r},${gr},${b},${a * 0.55})`); gd.addColorStop(0.85, `rgba(${r},${gr},${b},${a})`); gd.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    g.fillStyle = gd; g.beginPath(); g.arc(p.x, p.y, radius, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// How much of an effect is on at t: 0 before t0, eased up to 1 at t1, held to t2, eased down to 0 at t3 (t0 = t1 or
// t2 = t3 makes that side a step). One window for a peripheral blur: up with the zoom, held through the orbit.
export function hold(t, t0, t1, t2, t3) {
  return t < t1 ? (t1 > t0 ? EASE.inOut(clamp((t - t0) / (t1 - t0))) : t >= t0 ? 1 : 0) : t <= t2 ? 1 : t3 > t2 ? 1 - EASE.inOut(clamp((t - t2) / (t3 - t2))) : 0;
}

// The lens looks at one spot: blur everything around (cx, cy) and keep a clear round centre, the way a wide-open lens
// isolates what it is focused on. Run it on the finished frame (after drawLayers, before finish.apply); `buffer` is a
// canvas of the same size. fstop sets the blur (bokeh's scale: f1.2 ≈ 14 px, f2.8 ≈ 6 px, f5.6 ≈ 3 px at 1080p and 50 mm),
// `clear` the radius of the sharp disc and `feather` the width of the soft edge, both in frame heights; `amount` 0–1
// (`hold`) fades it in and out. Deterministic.
export function focusRing(target, buffer, { cx, cy, fstop = 2.8, mm = 50, clear = 0.25, feather = 0.3, amount = 1 } = {}) {
  const px = bokeh(fstop, { mm }).aperture * 0.8 * clamp(amount);
  if (px < 0.3) return;
  const { width: W, height: H } = target, b = buffer.getContext("2d");
  b.clearRect(0, 0, W, H); b.filter = `blur(${px}px)`; b.drawImage(target, -px, -px, W + 2 * px, H + 2 * px); b.filter = "none"; // bled past the edges, so the border stays soft
  const gr = b.createRadialGradient(cx, cy, clear * H, cx, cy, (clear + feather) * H);
  gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  b.globalCompositeOperation = "destination-out"; b.fillStyle = gr; b.fillRect(0, 0, W, H); b.globalCompositeOperation = "source-over"; // the centre erased: the sharp frame shows through
  target.getContext("2d").drawImage(buffer, 0, 0);
}
