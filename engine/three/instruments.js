// Live instruments for a film drawn on one 2D canvas as a function of t: an oscilloscope trace, a multimeter readout, a
// needle gauge and a bar meter. Each reads a signal or value from the numbers model (volts, amperes, rpm, ...) and is
// drawn with its units and a label; a widget without either is refused, because a bare number says nothing. Each
// returns the numbers it drew (the self-check reads those, not pixels). A value it cannot read (NaN, a missing
// sample) is shown as "--" or a gap and returned as null: never drawn as 0. Like type.js it imports nothing, so a
// composition, a render worker and the self-check all run the same code. Draw it after the finisher, in the text band
// (type.js `safeArea`); text is never under 36 px at 1080 px on the short side (craft-rules.md §6).
//
//   import { scope, meter, gauge, bar } from "./assets/engine/instruments.js";
//   finisher.draw(t);                                                      // the GL frame on the 2D canvas first
//   scope(ctx, { signal: (tau) => state(tau).Vac, t, timeScale: 0.1, range: [-400, 400], units: "V", label: "Mains", x, y, w, h });
//   meter(ctx, { value: state(t).Vdc, units: "V", label: "DC rail", x, y });
//
// A device screen in the world (a multimeter's display, a phone, a monitor): draw the same widgets into the canvas of a
// THREE.CanvasTexture (`new THREE.CanvasTexture(canvas)`, `texture.needsUpdate = true` after each draw) on the screen
// mesh's material `map` and `emissiveMap`, in the screen's own pixel size.

const MIN_TEXT = 36;
const INK = "#e8f1ff", PANEL = "rgba(8, 12, 18, 0.72)", GRID = "rgba(232, 241, 255, 0.22)";
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const font = (px, weight = 600) => `${weight} ${px}px system-ui, sans-serif`;

function check(fn, o, geometry) {
  if (typeof o.units !== "string" || !o.units.trim()) throw new Error(`${fn}: units (a string such as "V") is required: a bare number says nothing`);
  if (typeof o.label !== "string" || !o.label.trim()) throw new Error(`${fn}: label (what is measured) is required`);
  for (const k of geometry) if (!finite(o[k])) throw new Error(`${fn}: ${k} must be a finite number, got ${o[k]}`);
  if (o.font !== undefined && !(finite(o.font) && o.font >= MIN_TEXT)) throw new Error(`${fn}: font must be a number of px >= ${MIN_TEXT}, got ${o.font}`);
}
const text = (ctx, s, x, y, { px = MIN_TEXT, align = "left", base = "alphabetic", color = INK, weight = 600 } = {}) => {
  ctx.font = font(px, weight); ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = color;
  ctx.fillText(s, x, y);
};
const num = (v, digits) => v.toFixed(digits);
const timeBase = (s) => (s >= 1 ? `${+s.toPrecision(3)} s/div` : s >= 1e-3 ? `${+(s * 1e3).toPrecision(3)} ms/div` : `${+(s * 1e6).toPrecision(3)} µs/div`);

// An oscilloscope: the last `window` seconds of `signal(τ)` up to film time `t`, in `divisions` columns. `signal` takes
// the SIGNAL's own seconds: when the film is slowed (`timeScale` < 1, shown seconds per real second) τ = t × timeScale,
// so the trace shows the real waveform (50 Hz is 50 Hz, whatever speed the film plays at), and the time base says so.
// `range = [lo, hi]` maps to the box's bottom and top. A sample the signal cannot give is a gap (null). Returns
// { points: [[px, py] | null, ...], values, perDiv (s), text } with `text` the time-base line.
export function scope(ctx, o = {}) {
  const { signal, t, window: win = 0.04, range, x, y, w, h, divisions = 10, timeScale = 1, samples = 400, color = "#58c4ff", units, label } = o;
  check("scope", o, ["t", "x", "y", "w", "h"]);
  if (typeof signal !== "function") throw new Error("scope: signal(τ) is a function returning the model's value at signal time τ (s)");
  if (!Array.isArray(range) || !finite(range[0]) || !finite(range[1]) || !(range[1] > range[0])) throw new Error("scope: range is [lo, hi] with lo < hi, in the signal's units");
  if (!(finite(win) && win > 0) || !(finite(timeScale) && timeScale > 0) || !(w > 0) || !(h > 0)) throw new Error("scope: window, timeScale, w and h must be finite numbers > 0");
  if (!Number.isInteger(divisions) || divisions < 1 || !Number.isInteger(samples) || samples < 2) throw new Error("scope: divisions >= 1 and samples >= 2 are integers");
  const [lo, hi] = range, end = t * timeScale, px = o.font ?? MIN_TEXT, perDiv = win / divisions;
  const values = [], points = [];
  for (let i = 0; i < samples; i++) {
    const v = signal(end - win + (win * i) / (samples - 1));
    if (finite(v)) { values.push(v); points.push([x + (w * i) / (samples - 1), y + h - clamp((v - lo) / (hi - lo), 0, 1) * h]); }
    else { values.push(null); points.push(null); }
  }
  ctx.save();
  ctx.fillStyle = PANEL; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = GRID; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= divisions; i++) { ctx.moveTo(x + (w * i) / divisions, y); ctx.lineTo(x + (w * i) / divisions, y + h); }
  for (let j = 0; j <= 8; j++) { ctx.moveTo(x, y + (h * j) / 8); ctx.lineTo(x + w, y + (h * j) / 8); }
  ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.beginPath();
  let pen = false;
  for (const p of points) { if (!p) { pen = false; continue; } if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); pen = true; }
  ctx.stroke();
  const base = timeBase(perDiv);
  text(ctx, label, x, y - 12, { px, base: "alphabetic" });
  text(ctx, `${+lo.toPrecision(4)} to ${+hi.toPrecision(4)} ${units}`, x, y + h + 12, { px, base: "top" });
  text(ctx, base, x + w, y + h + 12, { px, base: "top", align: "right" });
  ctx.restore();
  return { points, values, perDiv, text: base };
}

// A multimeter readout: `value` with `digits` decimals and its units, the label above. A value that is not a finite number
// prints "--" (never 0: an unreadable meter is not a zero). `size` px is the readout's height (>= 36). Returns { text }.
export function meter(ctx, o = {}) {
  const { value, units, label, digits = 1, x, y, size = 48 } = o;
  check("meter", o, ["x", "y"]);
  if (!Number.isInteger(digits) || digits < 0 || digits > 8) throw new Error(`meter: digits must be an integer 0-8, got ${digits}`);
  if (!(finite(size) && size >= MIN_TEXT)) throw new Error(`meter: size must be a number of px >= ${MIN_TEXT}, got ${size}`);
  const out = finite(value) ? `${num(value, digits)} ${units}` : "--";
  ctx.save();
  text(ctx, label, x, y, { px: o.font ?? MIN_TEXT, base: "bottom" });
  text(ctx, out, x, y + 6, { px: size, base: "top", weight: 700 });
  ctx.restore();
  return { text: out };
}

// A needle gauge: the needle sweeps `sweep` radians (default 270 degrees) across [min, max], linear in the value and held
// at the ends (`clamped` says the value was off the dial). `angle` is from straight up, clockwise, in radians: 0 at the
// middle of the range. A value that is not a finite number draws no needle: angle null. Returns { angle, clamped, frac, text }.
export function gauge(ctx, o = {}) {
  const { value, min, max, sweep = 4.71, x, y, r, units, label, digits = 1 } = o;
  check("gauge", o, ["min", "max", "x", "y", "r"]);
  if (!(max > min)) throw new Error(`gauge: min < max is required, got ${min} and ${max}`);
  if (!(r > 0) || !(finite(sweep) && sweep > 0 && sweep <= 2 * Math.PI)) throw new Error("gauge: r > 0 and sweep in (0, 2π] radians");
  const ok = finite(value), frac = ok ? clamp((value - min) / (max - min), 0, 1) : null;
  const angle = ok ? (frac - 0.5) * sweep : null, clamped = ok && (value < min || value > max);
  const px = o.font ?? MIN_TEXT, top = -Math.PI / 2, out = ok ? `${num(value, digits)} ${units}` : "--";
  ctx.save();
  ctx.fillStyle = PANEL; ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = GRID; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y, r, top - sweep / 2, top + sweep / 2); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath();
  for (let i = 0; i <= 10; i++) { const a = top + (i / 10 - 0.5) * sweep, c = Math.cos(a), s = Math.sin(a); ctx.moveTo(x + c * r * 0.88, y + s * r * 0.88); ctx.lineTo(x + c * r, y + s * r); }
  ctx.stroke();
  if (ok) {
    const a = top + angle;
    ctx.strokeStyle = clamped ? "#ff6b57" : "#ffb347"; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86); ctx.stroke();
  }
  text(ctx, `${+min.toPrecision(4)}`, x - Math.sin(sweep / 2) * r, y + Math.cos(sweep / 2) * r + 12, { px, align: "center", base: "top" });
  text(ctx, `${+max.toPrecision(4)}`, x + Math.sin(sweep / 2) * r, y + Math.cos(sweep / 2) * r + 12, { px, align: "center", base: "top" });
  text(ctx, out, x, y + r * 0.5, { px, align: "center", base: "middle", weight: 700 });
  text(ctx, label, x, y - r * 1.08 - 12, { px, align: "center", base: "bottom" });
  ctx.restore();
  return { angle, clamped, frac, text: out };
}

// A bar meter: `value` as a share of `max` (the full scale), held at the ends. The text says value, full scale and units.
// A value that is not a finite number fills nothing: fill null. Returns { fill, text }.
export function bar(ctx, o = {}) {
  const { value, max, x, y, w, h, units, label, digits = 1 } = o;
  check("bar", o, ["x", "y", "w", "h"]);
  if (!(finite(max) && max > 0) || !(w > 0) || !(h > 0)) throw new Error(`bar: max (the full scale) must be a finite number > 0 and w, h > 0, got max ${max}`);
  const ok = finite(value), fill = ok ? clamp(value / max, 0, 1) : null, px = o.font ?? MIN_TEXT;
  const out = ok ? `${num(value, digits)} / ${num(max, digits)} ${units}` : `-- / ${num(max, digits)} ${units}`;
  ctx.save();
  ctx.fillStyle = PANEL; ctx.fillRect(x, y, w, h);
  if (ok) { ctx.fillStyle = fill >= 1 ? "#ff6b57" : "#58c4ff"; ctx.fillRect(x, y, w * fill, h); }
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  text(ctx, label, x, y - 12, { px, base: "alphabetic" });
  text(ctx, out, x + w, y - 12, { px, align: "right", base: "alphabetic" });
  ctx.restore();
  return { fill, text: out };
}
