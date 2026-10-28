// palette.js — three readable tones from one base colour (DALANG, MIT; the OKLab ramp idea from Teddarific/skills
// anatomy-asset, MIT). iso.js's tri() mixes toward a warm white and a dark ink by a fixed share, so a dark base (ink,
// navy, soot) loses its right face and a pale one its top. triad() steps lightness in OKLab instead, a fixed step at
// any base, hue and chroma kept, the top pulled down from white and the right up from black, so every material keeps
// three faces. Use it where a part takes a colour: { form: "box", color: triad(COLORS.subject) } (a [top, left, right]
// triad, which iso.js draws as given). Pure: any base gives the same triad on every machine.
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function toOklab(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`palette: "${hex}" is not a #rrggbb colour`);
  const n = parseInt(m[1], 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s];
}
export function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return "#" + rgb.map((v) => Math.round(clamp(gam(clamp(v, 0, 1)), 0, 1) * 255).toString(16).padStart(2, "0")).join("");
}

// STEP: OKLab lightness between faces (top above the base, right below it); the base is the left face, as in tri()
export const STEP = Object.freeze({ top: 0.09, right: 0.11 });
export function triad(hex) {
  const [L, a, b] = toOklab(hex), mid = clamp(L, 0.12 + STEP.right, 0.97 - STEP.top);
  const keep = mid === L ? 1 : 0.85; // a base moved off black or white keeps a little less chroma, so it does not glow
  return [fromOklab([mid + STEP.top, a * 0.92 * keep, b * 0.92 * keep]), fromOklab([mid, a * keep, b * keep]), fromOklab([mid - STEP.right, a * keep, b * keep])];
}
