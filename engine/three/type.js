// Shared type for a film drawn on one canvas as a function of t: caption phrases, the caption, labels pinned to a part
// of the set, and the check that a caption never repeats a label. It imports nothing, so a composition, a render worker
// and the self-check all run the same code (phrases() also runs in Node, see scripts/captions.mjs). Sizes are at
// 1080 px on the short side (craft-rules.md §6, visual-direction.md §9); zones are the platform's safe zones.
//
//   import { drawCaption, pinLabel, repeats } from "./assets/engine/type.js";
//   // audio/captions.js (node scripts/captions.mjs audio/narration.txt audio/words.json, after every take) sets CAPTIONS
//   finisher.draw(t);                                                     // the GL frame on the 2D canvas first
//   pinLabel(ctx, { at: valveMesh, camera, text: "valve" }, { format: "shorts" });
//   drawCaption(ctx, t, CAPTIONS, { format: "shorts", accent: "#ffd400" }); // accent: the spoken word gets a box
//
// The ink (light or dark) is chosen every frame from the ground under the text's own box, so a render worker that draws
// frames alone gets the same result as a preview; a ground that crosses the threshold inside one phrase switches the
// ink at that frame, and the halo in the other ink keeps both legible. `pill: true` fixes the ink on a dark backing.
// Not covered: scripts without spaces that are not Han/Kana (Thai, Lao, Khmer): a long run is one word.

const S = (W, H) => Math.min(W, H) / 1080;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const ALNUM = /[\p{L}\p{N}]/u;
const strip = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); // as tts_timestamps.mjs does for words.json
const Q = "[\"'”’)\\]»]*$";
const END = new RegExp("[.!?…。！？]" + Q, "u"), ELLIPSIS = new RegExp("(…|\\.\\.\\.)" + Q, "u"), SOFT = new RegExp("[,:;，、：；]" + Q, "u");
// Mirrors tts_timestamps.mjs: a "Speaker: text" line, a "(1.5)" pause line.
const SPEAKER = /^([\p{L}][\p{L}\p{N} _.'-]{0,30}):\s+(.+)$/u, PAUSE = /^\(\s*(\d+(?:\.\d+)?)\s*s?\s*\)$/;
const ms = (x) => Math.round(x * 1000) / 1000;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

// The zones, in px: `text` (nothing readable outside it), `caption` (the bottom of the text band, under the subject)
// and `labels` (the text band above the caption). format: "shorts" (9:16 Shorts/TikTok), "reels", "feed" (4:5), "landscape".
export function safeArea(format, W, H) {
  const s = S(W, H), R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
  let text;
  if (format === "shorts") text = R(0.06 * W, (168 / 1920) * H, (950 / 1080) * W, (1330 / 1920) * H);
  else if (format === "reels") text = R(0.06 * W, 0.12 * H, 0.88 * W, 0.75 * H);
  else if (format === "feed") text = R(0.08 * W, 0.08 * H, 0.92 * W, 0.92 * H);
  else if (format === "landscape") text = R(0.05 * W, 0.05 * H, 0.95 * W, 0.85 * H);
  else throw new Error('safeArea: format is "shorts", "reels", "feed" or "landscape"');
  const caption = format === "landscape" ? R(text.x0, 0.85 * H, text.x1, 0.95 * H) : R(text.x0, text.y1 - 180 * s, text.x1, text.y1);
  const labels = format === "landscape" ? text : R(text.x0, text.y0, text.x1, caption.y0 - 0.02 * H);
  return { text, caption, labels };
}

const LIN = Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
// Mean relative luminance (0..1) of an ImageData-like { data, width, height }, every 4th pixel.
export function luminance(img) {
  const d = img.data, n = d.length / 4; let sum = 0, k = 0;
  for (let i = 0; i < n; i += 4) { sum += 0.2126 * LIN[d[4 * i]] + 0.7152 * LIN[d[4 * i + 1]] + 0.0722 * LIN[d[4 * i + 2]]; k++; }
  return k ? sum / k : 0.5;
}
// "light" ink (white) or "dark" ink (#111, luminance 0.0056), whichever contrasts more with a ground of luminance L.
export const inkFor = (L) => (1.05 / (L + 0.05) >= (L + 0.05) / 0.0556 ? "light" : "dark");

const groundAt = (ctx, b) => {
  const W = ctx.canvas.width, H = ctx.canvas.height, x = clamp(Math.floor(b.x0), 0, W - 1), y = clamp(Math.floor(b.y0), 0, H - 1);
  return luminance(ctx.getImageData(x, y, clamp(Math.ceil(b.x1) - x, 1, W - x), clamp(Math.ceil(b.y1) - y, 1, H - y)));
};
const rrect = (ctx, x, y, w, h, r, color) => { ctx.fillStyle = color; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill(); };

// Caption phrases from narration.txt (punctuation) and words.json (timing). The narration markup is read as
// tts_timestamps.mjs reads it: # lines, (pause) lines, "Speaker:" lines, {text|name} beats and [tags] are not text.
// Splits: at a sentence end or an ellipsis; at , : ; after at least 3 words (6 characters for CJK); a longer run into
// near-equal parts of at most 7 words (16 characters for CJK; a CJK word is split by characters, its time spread over
// them). A phrase stays up until the next one starts; the last one `hold` s past its last word.
// -> [{ text, start, end, words: [{ text, start, end, gap }] }]
export function phrases(narrationTxt, words, { max = 7, cjkMax = 16, minSoft = 3, hold = 0.5 } = {}) {
  const lines = String(narrationTxt).replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !PAUSE.test(l));
  const spoken = (lines.length >= 2 && lines.every((l) => SPEAKER.test(l)) ? lines.map((l) => l.match(SPEAKER)[2].trim()) : lines).join("\n")
    .replace(/\{([^{}|]*)(?:\|[^{}]*)?\}/g, "$1").replace(/\[[^\]]*\]/g, " ");
  const toks = []; // a token without a letter or digit ("—", "...") is not a word: it joins the one before it
  for (const t of spoken.match(/\S+/g) || []) { if (ALNUM.test(t)) toks.push({ core: t, text: t }); else if (toks.length) toks[toks.length - 1].text += " " + t; }
  if (toks.length !== words.length) throw new Error(`phrases: narration words (${toks.length}) and words.json words (${words.length}) differ: pass the narration.txt this take was made from (rerun captions after every take)`);
  const units = [];
  toks.forEach(({ core, text }, k) => {
    const w = words[k];
    if (strip(core) !== w.text) throw new Error(`phrases: narration word ${k} "${strip(core)}" is not words.json word ${k} "${w.text}": pass the narration.txt this take was made from (rerun captions after every take)`);
    if (!CJK.test(core)) { units.push({ text, start: w.start, end: w.end, gap: true, cjk: false }); return; }
    const chars = [...text], n = chars.filter((c) => ALNUM.test(c)).length; let i = 0, lead = "", first = true;
    for (const c of chars) {
      if (ALNUM.test(c)) { units.push({ text: lead + c, start: w.start + ((w.end - w.start) * i) / n, end: w.start + ((w.end - w.start) * (i + 1)) / n, gap: first, cjk: true }); first = false; lead = ""; i++; }
      else if (units.length && i > 0) units[units.length - 1].text += c;
      else lead += c;
    }
  });
  const segs = []; let cur = [];
  for (const u of units) {
    cur.push(u);
    const soft = (cur[0].cjk ? 2 : 1) * minSoft;
    if (END.test(u.text) || ELLIPSIS.test(u.text) || (SOFT.test(u.text) && cur.length >= soft)) { segs.push(cur); cur = []; }
  }
  if (cur.length) segs.push(cur);
  const chunks = [];
  for (const seg of segs) {
    const lim = seg[0].cjk ? cjkMax : max, k = Math.ceil(seg.length / lim), base = Math.floor(seg.length / k), extra = seg.length % k; let at = 0;
    for (let j = 0; j < k; j++) { const n = base + (j < extra ? 1 : 0); chunks.push(seg.slice(at, at + n)); at += n; }
  }
  return chunks.map((c, j) => ({
    text: c.map((u, i) => (i && u.gap ? " " : "") + u.text).join(""),
    start: ms(c[0].start), end: ms(j + 1 < chunks.length ? chunks[j + 1][0].start : c[c.length - 1].end + hold),
    words: c.map((u) => ({ text: u.text, start: ms(u.start), end: ms(u.end), gap: u.gap })),
  }));
}

// Draws the phrase of `caps` that is on at t (none: returns null) at the bottom of the format's caption zone, one or two
// lines, in the ink the ground under its box asks for, with a halo in the other ink. Call it after the frame is on the
// 2D canvas (getImageData reads the ground). opts: format "shorts", font "Montserrat", weight 800, size (default 60,
// kept in 54..64 at 1080), light "#ffffff", dark "#111111", accent (a colour: the word being spoken gets a box of it
// with dark ink, switching on that word's start), pill (a dark backing per line, light ink, no switching).
// -> { text, lines, box: { x0, y0, x1, y1 }, lum, ink, active, size }
export function drawCaption(ctx, t, caps, opts = {}) {
  const { format = "shorts", font = "Montserrat", weight = 800, light = "#ffffff", dark = "#111111", accent = null, pill = false } = opts;
  const cap = caps.find((p) => p.start <= t && t < p.end);
  if (!cap) return null;
  const W = ctx.canvas.width, H = ctx.canvas.height, s = S(W, H), area = safeArea(format, W, H).caption, cx = (area.x0 + area.x1) / 2;
  const us = cap.words && cap.words.length ? cap.words : [{ text: cap.text, start: cap.start, gap: true }];
  let px = clamp(opts.size ?? 60 * s, 54 * s, 64 * s), lines, wid, sp, avail = area.x1 - area.x0 - 0.5 * px;
  const layout = () => {
    ctx.font = `${weight} ${px}px "${font}"`;
    wid = us.map((u) => ctx.measureText(u.text).width); sp = ctx.measureText(" ").width; avail = area.x1 - area.x0 - 0.5 * px;
    const span = (a, b) => { let w = 0; for (let i = a; i < b; i++) w += wid[i] + (i > a && us[i].gap !== false ? sp : 0); return w; };
    let best = [[0, us.length]];
    if (span(0, us.length) > avail && us.length > 1) {
      let bw = Infinity;
      for (let b = 1; b < us.length; b++) { if (us[b].gap === false && !CJK.test(us[b].text)) continue; const m = Math.max(span(0, b), span(b, us.length)); if (m < bw) { bw = m; best = [[0, b], [b, us.length]]; } }
    }
    lines = best.map(([a, b]) => ({ a, b, w: span(a, b) }));
    return Math.max(...lines.map((l) => l.w)) <= avail;
  };
  if (!layout()) { px = 54 * s; layout(); }
  const lh = 1.2 * px, pad = 0.25 * px, last = area.y1 - pad - 0.25 * px;
  lines.forEach((l, i) => { l.base = last - (lines.length - 1 - i) * lh; l.x = cx - l.w / 2; });
  const box = {
    x0: Math.max(area.x0, Math.min(...lines.map((l) => l.x - pad))), x1: Math.min(area.x1, Math.max(...lines.map((l) => l.x + l.w + pad))),
    y0: Math.max(area.y0, lines[0].base - 0.95 * px - pad), y1: area.y1,
  };
  const L = groundAt(ctx, box), ink = pill ? "light" : inkFor(L), inkC = ink === "light" ? light : dark, haloC = ink === "light" ? dark : light;
  let active = -1; us.forEach((u, i) => { if (u.start <= t) active = i; });
  ctx.save();
  ctx.font = `${weight} ${px}px "${font}"`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round";
  for (const l of lines) {
    if (pill) rrect(ctx, l.x - pad, l.base - 0.95 * px, l.w + 2 * pad, lh, 0.35 * px, "rgba(17,17,17,0.78)");
    let x = l.x;
    for (let i = l.a; i < l.b; i++) {
      if (i > l.a && us[i].gap !== false) x += sp;
      const on = accent && i === active;
      if (on) rrect(ctx, x - 0.15 * px, l.base - 0.88 * px, wid[i] + 0.3 * px, 1.1 * px, 0.2 * px, accent);
      if (!pill && !on) { ctx.strokeStyle = haloC; ctx.lineWidth = 0.18 * px; ctx.strokeText(us[i].text, x, l.base); }
      ctx.fillStyle = on ? dark : inkC; ctx.fillText(us[i].text, x, l.base);
      x += wid[i];
    }
  }
  ctx.restore();
  return { text: cap.text, lines: lines.map((l) => us.slice(l.a, l.b).map((u, i) => (i && u.gap !== false ? " " : "") + u.text).join("")), box, lum: L, ink, active, size: px };
}

// Pins a label to a world point: `at` is an Object3D or a Vector3 (world), `camera` a camera with its matrices current.
// Draws the label box inside the format's label zone (flipping side, then clamping, when it would leave it), at least
// 36 px, in the ink the ground asks for with a halo, and a leader line with a dot to the point. A point behind the camera
// or outside the frame draws nothing and returns null. opts: format, font, weight 700, size (default 40, at least 36),
// side "right" | "left" (preferred), offset (leader length, default 0.05 of the width), light, dark.
// -> { x, y, w, h, side, size, anchor: { x, y }, ink }
export function pinLabel(ctx, { at, camera, text }, opts = {}) {
  const { format = "shorts", font = "Montserrat", weight = 700, side = "right", light = "#ffffff", dark = "#111111" } = opts;
  const W = ctx.canvas.width, H = ctx.canvas.height, s = S(W, H), area = safeArea(format, W, H).labels;
  camera.updateMatrixWorld();
  const p = typeof at.getWorldPosition === "function" ? at.getWorldPosition(at.position.clone()) : at.clone();
  p.project(camera);
  if (!(Math.abs(p.x) <= 1) || !(Math.abs(p.y) <= 1) || !(p.z >= -1 && p.z <= 1)) return null;
  const px = Math.max(36 * s, opts.size ?? 40 * s), pad = 0.3 * px, h = 1.4 * px, off = opts.offset ?? 0.05 * W;
  const ax = ((p.x + 1) / 2) * W, ay = ((1 - p.y) / 2) * H;
  ctx.save();
  ctx.font = `${weight} ${px}px "${font}"`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round"; ctx.lineCap = "round";
  const w = ctx.measureText(text).width + 2 * pad;
  const at0 = (sd) => (sd === "left" ? ax - off - w : ax + off), over = (x) => Math.max(0, area.x0 - x) + Math.max(0, x + w - area.x1);
  const other = side === "left" ? "right" : "left", sd = over(at0(other)) < over(at0(side)) ? other : side;
  const x = clamp(at0(sd), area.x0, Math.max(area.x0, area.x1 - w)), y = clamp(ay - h / 2, area.y0, Math.max(area.y0, area.y1 - h));
  const L = groundAt(ctx, { x0: x, y0: y, x1: x + w, y1: y + h }), ink = inkFor(L), inkC = ink === "light" ? light : dark, haloC = ink === "light" ? dark : light;
  const ex = Math.abs(ax - x) < Math.abs(ax - (x + w)) ? x : x + w, ey = y + h / 2;
  for (const [col, extra] of [[haloC, 0.12 * px], [inkC, 0]]) {
    ctx.strokeStyle = col; ctx.lineWidth = 0.08 * px + extra; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ax, ay, 0.12 * px + extra / 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = haloC; ctx.lineWidth = 0.18 * px; ctx.strokeText(text, x + pad, y + h / 2 + 0.35 * px);
  ctx.fillStyle = inkC; ctx.fillText(text, x + pad, y + h / 2 + 0.35 * px);
  ctx.restore();
  return { x, y, w, h, side: sd, size: px, anchor: { x: ax, y: ay }, ink };
}

const norm = (s) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Warnings for each caption phrase that says what a label visible at the same time says (visual-direction.md §5: the
// headline, the cards, the labels and the caption each carry their own fact). labels: [{ text, from = 0, to = Infinity }].
// A label repeats when it equals the phrase, or has at least 2 words (2 CJK characters) and sits inside it.
export function repeats(caps, labels) {
  const out = [];
  for (const c of caps) for (const l of labels) {
    if (!(c.start < (l.to ?? Infinity) && (l.from ?? 0) < c.end)) continue;
    const a = norm(c.text), b = norm(l.text);
    if (!b) continue;
    const cjk = CJK.test(b), long = cjk ? [...b.replace(/ /g, "")].length >= 2 : b.includes(" ");
    if (a === b || (long && (cjk ? a.replace(/ /g, "").includes(b.replace(/ /g, "")) : ` ${a} `.includes(` ${b} `)))) out.push(`caption "${c.text}" at ${c.start}s repeats the label "${l.text}" (visual-direction.md §5: each carries its own fact)`);
  }
  return out;
}
