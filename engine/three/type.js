// Shared type for a film drawn on one canvas as a function of t: caption phrases, the caption, labels pinned to a part
// of the set, and the check that a caption never repeats a label. It imports only font.js (the one typeface), so a
// composition, a render worker and the self-check all run the same code (phrases() also runs in Node, see scripts/captions.mjs). Sizes are at
// 1080 px on the short side (craft-rules.md §5, visual-direction.md §9); zones are the platform's safe zones.
//
//   import { drawCaption, pinLabel, repeats, layoutFrame } from "./assets/type.js";
//   // audio/captions.js (node scripts/captions.mjs audio/narration.txt audio/words.json, after every take) sets CAPTIONS
//   finisher.draw(t);                                                     // the GL frame on the 2D canvas first
//   pinLabel(ctx, { at: valveMesh, camera, text: "valve" }, { format: "shorts" });
//   rangeBar(ctx, { value: need, max, ticks: [{ at: 5, label: "5 L" }] }, { format: "shorts", accent });
//   drawCaption(ctx, t, CAPTIONS, { format: "shorts", accent: "#ffd400" }); // accent: the spoken word gets a box
//   layoutFrame(ctx, t, { format: "shorts", hero: heroBox(camera, heroObj, W, H) }); // last in the frame: the boxes drawn, for review/strips
//
// The ink (light or dark) is chosen every frame from the ground under the text's own box, so a render worker that draws
// frames alone gets the same result as a preview; a ground that crosses the threshold inside one phrase switches the
// ink at that frame, and the halo in the other ink keeps both legible. `pill: true` fixes the ink on a dark backing.
// Not covered: scripts without spaces that are not Han/Kana (Thai, Lao, Khmer): a long run is one word.

import { FAMILY, WEIGHT } from "./font.js";

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
const r1 = (v) => Math.round(v * 10) / 10;
let drawn = []; // the boxes drawn since the last layoutFrame()
const note = (kind, text, b, size) => { drawn.push({ kind, text: String(text ?? ""), x0: r1(b.x0), y0: r1(b.y0), x1: r1(b.x1), y1: r1(b.y1), size: r1(size) }); };

// For modules that draw text on the frame outside this file (quantity.js `dimension`): the box they drew, so layoutFrame sees it.
export const recordBox = (kind, text, box, size) => note(kind, text, box, size);

// The zones, in px: `text` (nothing readable outside it), `caption` (the caption's target band: the bottom of
// the text band, under the subject; for reels, ending at 82 % of the height) and `labels` (the text band above the caption).
// format: "shorts" (9:16 Shorts), "reels" (9:16 Reels and TikTok), "feed" (4:5), "landscape".
export function safeArea(format, W, H) {
  const s = S(W, H), R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
  let text;
  if (format === "shorts") text = R(0.06 * W, (168 / 1920) * H, (950 / 1080) * W, (1330 / 1920) * H);
  else if (format === "reels") text = R(0.06 * W, 0.12 * H, 0.88 * W, 0.75 * H);
  else if (format === "feed") text = R(0.08 * W, 0.08 * H, 0.92 * W, 0.92 * H);
  else if (format === "landscape") text = R(0.05 * W, 0.05 * H, 0.95 * W, 0.85 * H);
  else throw new Error('safeArea: format is "shorts", "reels", "feed" or "landscape"');
  const band = format === "landscape" ? R(text.x0, 0.85 * H, text.x1, 0.95 * H) : R(text.x0, text.y1 - 180 * s, text.x1, text.y1);
  // Reels/TikTok: the caption is the one thing allowed into the platform's bottom 25 %: its block ends at 82 % of the height.
  const caption = format === "reels" ? R(text.x0, 0.82 * H - 180 * s, text.x1, 0.82 * H) : band;
  const labels = format === "landscape" ? text : R(text.x0, text.y0, text.x1, band.y0 - 0.02 * H);
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
// Splits: at the end of a narration line (a speaker change, a paragraph, a (pause) line); at a sentence end or an
// ellipsis; at , : ; after at least 3 words (6 characters for CJK); a longer run (over 7 words, 16 characters for CJK)
// at its longest speech pause (a gap of at least `pause` s between two words of words.json, leaving at least 2 words,
// 4 characters for CJK, on each side), and a part with no pause into near-equal parts of at most that many (a CJK word
// is split by characters, its time spread over them). A phrase stays up until the next one starts; the last one `hold`
// s past its last word.
// -> [{ text, start, end, words: [{ text, start, end, gap }] }]
export function phrases(narrationTxt, words, { max = 7, cjkMax = 16, minSoft = 3, hold = 0.5, pause = 0.3, breath = 0.12 } = {}) {
  const lines = String(narrationTxt).replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !PAUSE.test(l));
  const spoken = (lines.length >= 2 && lines.every((l) => SPEAKER.test(l)) ? lines.map((l) => l.match(SPEAKER)[2].trim()) : lines)
    .map((l) => l.replace(/\{([^{}|]*)(?:\|[^{}]*)?\}/g, "$1").replace(/\[[^\]]*\]/g, " "));
  const toks = []; // a token without a letter or digit ("—", "...") is not a word: it joins the one before it, on its line
  spoken.forEach((line, ln) => { for (const t of line.match(/\S+/g) || []) { if (ALNUM.test(t)) toks.push({ core: t, text: t, ln }); else if (toks.length && toks[toks.length - 1].ln === ln) toks[toks.length - 1].text += " " + t; } });
  if (toks.length !== words.length) throw new Error(`phrases: narration words (${toks.length}) and words.json words (${words.length}) differ: pass the narration.txt this take was made from (rerun captions after every take)`);
  const units = [];
  toks.forEach(({ core, text, ln }, k) => {
    const w = words[k];
    if (strip(core) !== w.text) throw new Error(`phrases: narration word ${k} "${strip(core)}" is not words.json word ${k} "${w.text}": pass the narration.txt this take was made from (rerun captions after every take)`);
    if (!CJK.test(core)) { units.push({ text, start: w.start, end: w.end, gap: true, cjk: false, ln }); return; }
    const chars = [...text], n = chars.filter((c) => ALNUM.test(c)).length; let i = 0, lead = "", first = true;
    for (const c of chars) {
      if (ALNUM.test(c)) { units.push({ text: lead + c, start: w.start + ((w.end - w.start) * i) / n, end: w.start + ((w.end - w.start) * (i + 1)) / n, gap: first, cjk: true, ln }); first = false; lead = ""; i++; }
      else if (units.length && i > 0) units[units.length - 1].text += c;
      else lead += c;
    }
  });
  const segs = []; let cur = [];
  units.forEach((u, i) => {
    cur.push(u);
    const soft = (cur[0].cjk ? 2 : 1) * minSoft, lineEnd = i + 1 < units.length && units[i + 1].ln !== u.ln;
    if (END.test(u.text) || ELLIPSIS.test(u.text) || (SOFT.test(u.text) && cur.length >= soft) || lineEnd) { segs.push(cur); cur = []; }
  });
  if (cur.length) segs.push(cur);
  const balanced = (seg, lim) => {
    const k = Math.ceil(seg.length / lim), base = Math.floor(seg.length / k), extra = seg.length % k, out = []; let at = 0;
    for (let j = 0; j < k; j++) { const n = base + (j < extra ? 1 : 0); out.push(seg.slice(at, at + n)); at += n; }
    return out;
  };
  const split = (seg, lim, minPart) => { // a run over lim: at its longest pause with minPart units each side, then each side again;
    // a pause of `pause` s or more first, else the longest breath of `breath` s or more (a speaker's micro-pause marks a
    // clause edge, so the split never lands mid-clause on an even word count); no breath at all: balanced
    if (seg.length <= lim) return [seg];
    let cutAt = -1, gap = -Infinity;
    for (const floor of [pause, breath]) {
      for (let i = minPart; i <= seg.length - minPart; i++) {
        const g = seg[i].start - seg[i - 1].end;
        if (g >= floor && (g > gap + 1e-9 || (Math.abs(g - gap) <= 1e-9 && Math.abs(i - seg.length / 2) < Math.abs(cutAt - seg.length / 2)))) { cutAt = i; gap = g; }
      }
      if (cutAt >= 0) break;
    }
    return cutAt < 0 ? balanced(seg, lim) : [...split(seg.slice(0, cutAt), lim, minPart), ...split(seg.slice(cutAt), lim, minPart)];
  };
  const chunks = segs.flatMap((seg) => split(seg, seg[0].cjk ? cjkMax : max, seg[0].cjk ? 4 : 2));
  return chunks.map((c, j) => ({
    text: c.map((u, i) => (i && u.gap ? " " : "") + u.text).join(""),
    start: ms(c[0].start), end: ms(j + 1 < chunks.length ? chunks[j + 1][0].start : c[c.length - 1].end + hold),
    words: c.map((u) => ({ text: u.text, start: ms(u.start), end: ms(u.end), gap: u.gap })),
  }));
}

// Draws the phrase of `caps` that is on at t (none: returns null) at the bottom of the format's caption zone, one or two
// lines (nothing outside the zone, see below), in the ink the ground under its box asks for, with a halo in the other ink. Call it after the frame is on the
// 2D canvas (getImageData reads the ground). opts: format "shorts", weight 600 (heading), size (default 60,
// kept in 54..64 at 1080), light "#ffffff", dark "#111111", accent (a colour: the word being spoken gets a box of it
// with dark ink, switching on that word's start), pill (a dark backing per line, light ink, no switching).
// Nothing is drawn outside the zone: a phrase that does not fit in two lines at 54 px is shrunk below 54 px until it
// does (`shrunk: true`; split the narration into shorter phrases to keep the size). `box` is the drawn text's box.
// -> { text, lines, box: { x0, y0, x1, y1 }, lum, ink, active, size, shrunk }
export function drawCaption(ctx, t, caps, opts = {}) {
  const { format = "shorts", weight = WEIGHT.heading, light = "#ffffff", dark = "#111111", accent = null, pill = false } = opts;
  const cap = caps.find((p) => p.start <= t && t < p.end);
  if (!cap) return null;
  const W = ctx.canvas.width, H = ctx.canvas.height, s = S(W, H), area = safeArea(format, W, H).caption, cx = (area.x0 + area.x1) / 2;
  const us = cap.words && cap.words.length ? cap.words : [{ text: cap.text, start: cap.start, gap: true }];
  let px = clamp(opts.size ?? 60 * s, 54 * s, 64 * s), lines, wid, sp, avail = area.x1 - area.x0 - 0.5 * px;
  const layout = () => { // true when the lines fit the zone in width and in height
    ctx.font = `${weight} ${px}px ${FAMILY}`;
    wid = us.map((u) => ctx.measureText(u.text).width); sp = ctx.measureText(" ").width; avail = area.x1 - area.x0 - 0.5 * px;
    const span = (a, b) => { let w = 0; for (let i = a; i < b; i++) w += wid[i] + (i > a && us[i].gap !== false ? sp : 0); return w; };
    let best = [[0, us.length]];
    if (span(0, us.length) > avail && us.length > 1) {
      let bw = Infinity;
      for (let b = 1; b < us.length; b++) { if (us[b].gap === false && !CJK.test(us[b].text)) continue; const m = Math.max(span(0, b), span(b, us.length)); if (m < bw) { bw = m; best = [[0, b], [b, us.length]]; } }
    }
    lines = best.map(([a, b]) => ({ a, b, w: span(a, b) }));
    maxw = Math.max(...lines.map((l) => l.w));
    return maxw <= avail && (1.7 + 1.2 * (lines.length - 1)) * px <= area.y1 - area.y0;
  };
  // One line at the asked size, else two at 54 px; text that still does not fit shrinks, below 54 px, until it does:
  // nothing is ever drawn outside the zone (`shrunk` in the result says it; shorter phrases keep the size).
  let maxw = 0;
  if (!layout()) { px = 54 * s; for (let i = 0; i < 80 && !layout(); i++) px = Math.min(px * 0.98, (px * avail * 0.999) / maxw); }
  const lh = 1.2 * px, pad = 0.25 * px, last = area.y1 - pad - 0.25 * px;
  lines.forEach((l, i) => { l.base = last - (lines.length - 1 - i) * lh; l.x = cx - l.w / 2; });
  const box = { x0: Math.min(...lines.map((l) => l.x - pad)), x1: Math.max(...lines.map((l) => l.x + l.w + pad)), y0: lines[0].base - 0.95 * px - pad, y1: area.y1 };
  const L = groundAt(ctx, box), ink = pill ? "light" : inkFor(L), inkC = ink === "light" ? light : dark, haloC = ink === "light" ? dark : light;
  let active = -1; us.forEach((u, i) => { if (u.start <= t) active = i; });
  ctx.save();
  ctx.font = `${weight} ${px}px ${FAMILY}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round";
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
  note("caption", cap.text, box, px);
  return { text: cap.text, lines: lines.map((l) => us.slice(l.a, l.b).map((u, i) => (i && u.gap !== false ? " " : "") + u.text).join("")), box, lum: L, ink, active, size: px, shrunk: px < 54 * s - 1e-9 };
}

// Pins a label to a world point: `at` is an Object3D or a Vector3 (world), `camera` a camera with its matrices current.
// Draws the label box inside the format's label zone (flipping side, then clamping, when it would leave it), at least
// 36 px, in the ink the ground asks for with a halo, and a leader line with a dot to the point. A point behind the camera
// or outside the frame draws nothing and returns null. opts: format, weight 600 (heading), size (default 40, at least 36),
// side "right" | "left" (preferred), offset (leader length, default 0.05 of the width), light, dark, top (a y in px: the
// label stays below it, e.g. the text band's box.y1), pill (a colour: the label is dark text on a pill of it, with a dark
// leader ending in a ringed dot on the part, no halo; the look-J label, visual-direction.md §9).
// A label wider than the zone wraps at its spaces (CJK between characters), keeping its size; only one word wider than
// the zone shrinks, below 36 px (`shrunk: true`: shorten the word).
// -> { x, y, w, h, side, size, anchor: { x, y }, ink, lines, shrunk, pill? }
export function pinLabel(ctx, { at, camera, text }, opts = {}) {
  const { format = "shorts", weight = WEIGHT.heading, side = "right", light = "#ffffff", dark = "#111111", pill = null } = opts;
  const W = ctx.canvas.width, H = ctx.canvas.height, s = S(W, H), full = safeArea(format, W, H).labels;
  const area = Number.isFinite(opts.top) ? { ...full, y0: Math.min(full.y1, Math.max(full.y0, opts.top)) } : full;
  camera.updateMatrixWorld();
  const p = typeof at.getWorldPosition === "function" ? at.getWorldPosition(at.position.clone()) : at.clone();
  p.project(camera);
  if (!(Math.abs(p.x) <= 1) || !(Math.abs(p.y) <= 1) || !(p.z >= -1 && p.z <= 1)) return null;
  let px = Math.max(36 * s, opts.size ?? 40 * s), pad, h, w, lines;
  const off = opts.offset ?? 0.05 * W, ax = ((p.x + 1) / 2) * W, ay = ((1 - p.y) / 2) * H;
  ctx.save();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round"; ctx.lineCap = "round";
  const fit = () => { // true when the label (wrapped at its spaces, CJK between characters) fits the zone in width and height
    ctx.font = `${weight} ${px}px ${FAMILY}`; pad = (pill ? 0.5 : 0.3) * px; // a pill's rounded ends need more room
    lines = wrapText(ctx, text, area.x1 - area.x0 - 2 * pad);
    w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 2 * pad; h = 1.4 * px + (lines.length - 1) * 1.2 * px;
    return w <= area.x1 - area.x0 + 1e-6 && h <= area.y1 - area.y0 + 1e-6;
  };
  for (let i = 0; i < 80 && !fit(); i++) px *= 0.95; // only a word wider than the zone, or a label taller than it, shrinks (below 36 px: `shrunk`)
  const at0 = (sd) => (sd === "left" ? ax - off - w : ax + off), over = (x) => Math.max(0, area.x0 - x) + Math.max(0, x + w - area.x1);
  const other = side === "left" ? "right" : "left", sd = over(at0(other)) < over(at0(side)) ? other : side;
  const x = clamp(at0(sd), area.x0, Math.max(area.x0, area.x1 - w)), y = clamp(ay - h / 2, area.y0, Math.max(area.y0, area.y1 - h));
  const L = pill ? null : groundAt(ctx, { x0: x, y0: y, x1: x + w, y1: y + h }), ink = pill ? "dark" : inkFor(L), inkC = ink === "light" ? light : dark, haloC = ink === "light" ? dark : light;
  const ex = Math.abs(ax - x) < Math.abs(ax - (x + w)) ? x : x + w, ey = y + h / 2;
  if (pill) { // a dark leader ending in a ringed dot on the part, then the pill with dark text: no halo
    ctx.strokeStyle = dark; ctx.lineWidth = 0.07 * px; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(ax, ay, 0.11 * px, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 0.05 * px; ctx.beginPath(); ctx.arc(ax, ay, 0.24 * px, 0, Math.PI * 2); ctx.stroke();
    rrect(ctx, x, y, w, h, h / 2, pill);
  } else for (const [col, extra] of [[haloC, 0.12 * px], [inkC, 0]]) {
    ctx.strokeStyle = col; ctx.lineWidth = 0.08 * px + extra; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ax, ay, 0.12 * px + extra / 2, 0, Math.PI * 2); ctx.fill();
  }
  lines.forEach((l, i) => {
    const by = y + 0.7 * px + 0.35 * px + i * 1.2 * px;
    if (!pill) { ctx.strokeStyle = haloC; ctx.lineWidth = 0.18 * px; ctx.strokeText(l, x + pad, by); }
    ctx.fillStyle = inkC; ctx.fillText(l, x + pad, by);
  });
  ctx.restore();
  note("label", text, { x0: x, y0: y, x1: x + w, y1: y + h }, px);
  return { x, y, w, h, side: sd, size: px, anchor: { x: ax, y: ay }, ink, lines, shrunk: px < 36 * s - 1e-9, ...(pill ? { pill } : {}) };
}

// The text band (visual-direction.md §9): at the top of the label zone, on a light scrim, a kicker in
// tracked monospace capitals, a bold headline that states the claim or the number, and an optional dark status tag
// (SPED UP, OUR MODEL). Left-aligned, drawn only inside the label zone: the kicker and the tag are 36 px or
// more, the headline 64..96 px at 1080 (a headline that does not fit in two lines at 64 px shrinks, `shrunk: true`).
// Pass the result's `box.y1` as `top` to pinLabel and dimension so that they stay clear of it.
// text: { kicker?, headline (required: the claim or the number, from the numbers model), tag? }.
// opts: format "shorts", headline Bold and kicker Medium of the one family, size (headline, default 76 at 1080),
// kickerSize (never under 36), scrim ("rgba(255,255,255,0.72)", null: none), ink, tagFill, tagInk, track (the kicker's
// letter spacing in em, 0.1).
// -> { box (the scrim's), kicker: box | null, headline: { box, lines, size, shrunk }, tag: box | null }
export function textBand(ctx, { kicker, headline, tag } = {}, opts = {}) {
  const { format = "shorts", scrim = "rgba(255,255,255,0.72)", ink = "#111111", tagFill = "#111111", tagInk = "#ffffff", track = 0.1 } = opts;
  if (typeof headline !== "string" || !headline.trim()) throw new Error("textBand: headline is the claim or the number, a non-empty string (the kicker names the topic, the tag the status)");
  const W = ctx.canvas.width, H = ctx.canvas.height, s = S(W, H), area = safeArea(format, W, H).labels;
  const kpx = Math.max(36 * s, opts.kickerSize ?? 36 * s), pad = 0.5 * kpx, cx = area.x0 + pad, availW = area.x1 - area.x0 - 2 * pad;
  const kText = kicker ? String(kicker).toLocaleUpperCase() : "", tText = tag ? String(tag).toLocaleUpperCase() : "";
  const kFont = `${WEIGHT.sub} ${kpx}px ${FAMILY}`, spaced = "letterSpacing" in ctx;
  ctx.save();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round";
  let kw = 0, tw = 0;
  if (kText) {
    ctx.font = kFont; if (spaced) ctx.letterSpacing = "0px";
    kw = ctx.measureText(kText).width + track * kpx * ([...kText].length - 1);
    if (kw > availW) { ctx.restore(); throw new Error(`textBand: the kicker "${kText}" is wider than the label zone: shorten it`); }
  }
  if (tText) { ctx.font = kFont; tw = ctx.measureText(tText).width + 0.8 * kpx; if (tw > availW) { ctx.restore(); throw new Error(`textBand: the tag "${tText}" is wider than the label zone: shorten it`); } }
  const kh = kText ? 1.4 * kpx : 0, gapK = kText ? 0.25 * kpx : 0, gapT = tText ? 0.3 * kpx : 0, th = tText ? 1.4 * kpx : 0;
  let px = clamp(opts.size ?? 76 * s, 64 * s, 96 * s), lines, hw;
  const fit = () => { // true when the headline fits in two lines, in width, and the whole stack fits the zone in height
    ctx.font = `${WEIGHT.title} ${px}px ${FAMILY}`;
    lines = wrapText(ctx, headline.trim(), availW); hw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    return lines.length <= 2 && hw <= availW + 1e-6 && 2 * pad + kh + gapK + lines.length * 1.15 * px + gapT + th <= area.y1 - area.y0 + 1e-6;
  };
  for (let i = 0; i < 80 && !fit(); i++) px *= 0.95; // below 64 px (`shrunk`) only when it cannot fit otherwise
  const top = area.y0 + pad, hTop = top + kh + gapK, tTop = hTop + lines.length * 1.15 * px + gapT;
  const right = cx + Math.max(kw, hw, tw), bottom = (tText ? tTop + th : hTop + lines.length * 1.15 * px) + pad;
  const sb = { x0: area.x0, y0: area.y0, x1: Math.min(area.x1, right + pad), y1: Math.min(area.y1, bottom) };
  if (scrim) rrect(ctx, sb.x0, sb.y0, sb.x1 - sb.x0, sb.y1 - sb.y0, 0.4 * kpx, scrim);
  ctx.fillStyle = ink;
  let kBox = null, tBox = null;
  if (kText) {
    ctx.font = kFont; if (spaced) ctx.letterSpacing = track * kpx + "px";
    ctx.fillText(kText, cx, top + 0.8 * kpx);
    if (spaced) ctx.letterSpacing = "0px";
    kBox = { x0: cx, y0: top, x1: cx + kw, y1: top + kh };
  }
  ctx.font = `${WEIGHT.title} ${px}px ${FAMILY}`; ctx.fillStyle = ink;
  lines.forEach((l, i) => ctx.fillText(l, cx, hTop + i * 1.15 * px + 0.9 * px));
  const hBox = { x0: cx, y0: hTop, x1: cx + hw, y1: hTop + lines.length * 1.15 * px };
  if (tText) {
    rrect(ctx, cx, tTop, tw, th, 0.25 * kpx, tagFill);
    ctx.font = kFont; ctx.fillStyle = tagInk; ctx.fillText(tText, cx + 0.4 * kpx, tTop + 1.05 * kpx);
    tBox = { x0: cx, y0: tTop, x1: cx + tw, y1: tTop + th };
  }
  ctx.restore();
  if (kBox) note("label", kText, kBox, kpx);
  note("label", headline.trim(), hBox, px);
  if (tBox) note("label", tText, tBox, kpx);
  return { box: sb, kicker: kBox, headline: { box: hBox, lines, size: px, shrunk: px < 64 * s - 1e-9 }, tag: tBox };
}

// A range card (visual-direction.md §13 "Formula on the set"): a bar that fills to value / max (clamped), a tick at each
// option's capacity with its label under it, and the option that fits (the first tick at or above the value, or
// `highlight`) in `accent`. Inside the label zone at ≥ 36 px; the ink reads the ground under its own box, as a label's.
export function rangeBar(ctx, { value, max, ticks = [], label } = {}, opts = {}) {
  const { format = "shorts", weight = WEIGHT.heading, accent = "#ffd400", light = "#ffffff", dark = "#111111" } = opts;
  if (!(typeof max === "number" && Number.isFinite(max) && max > 0)) throw new Error(`rangeBar: max must be a finite number > 0, got ${max}`);
  if (!(typeof value === "number" && Number.isFinite(value))) throw new Error(`rangeBar: value must be a finite number, got ${value}`);
  const W = ctx.canvas.width, H = ctx.canvas.height, s = S(W, H), area = safeArea(format, W, H).labels;
  const px = Math.max(36 * s, opts.size ?? 40 * s), bh = 0.6 * px, zw = area.x1 - area.x0;
  const w = clamp(opts.w ?? 0.6 * zw, Math.min(4 * px, zw), zw), h = (label ? 1.4 * px : 0) + 0.4 * px + bh + 1.4 * px;
  const x = clamp(opts.x ?? area.x0, area.x0, area.x1 - w), y = clamp(opts.y ?? area.y0, area.y0, Math.max(area.y0, area.y1 - h));
  const f = clamp(value / max, 0, 1), fits = opts.highlight ?? ticks.findIndex((t) => t.at >= value);
  const ink = inkFor(groundAt(ctx, { x0: x, y0: y, x1: x + w, y1: y + h })), inkC = ink === "light" ? light : dark, haloC = ink === "light" ? dark : light;
  ctx.save();
  ctx.font = `${weight} ${px}px ${FAMILY}`; ctx.textBaseline = "alphabetic";
  let by = y + 0.2 * px;
  if (label) { ctx.textAlign = "left"; ctx.fillStyle = inkC; ctx.fillText(label, x, y + 1.05 * px); by += 1.4 * px; }
  rrect(ctx, x, by, w, bh, bh / 2, haloC); // the track, in the other ink
  rrect(ctx, x, by, w * f, bh, bh / 2, inkC); // the fill
  ctx.textAlign = "center";
  const out = ticks.map((t, i) => {
    const tx = x + w * clamp(t.at / max, 0, 1), text = String(t.label ?? t.at), lw = ctx.measureText(text).width;
    ctx.fillStyle = i === fits ? accent : inkC;
    ctx.fillRect(tx - 0.05 * px, by - 0.2 * px, 0.1 * px, bh + 0.4 * px);
    ctx.fillText(text, clamp(tx, x + lw / 2, Math.max(x + lw / 2, x + w - lw / 2)), by + bh + 0.2 * px + 1.05 * px);
    return { x: tx, at: t.at, label: text, fits: i === fits };
  });
  ctx.restore();
  note("card", label ?? "", { x0: x, y0: y, x1: x + w, y1: y + h }, px);
  return { x, y, w, h, size: px, fill: w * f, fits, ticks: out, ink };
}

// The layout of the frame just drawn, for review (scripts/strips.mjs, scripts/layout_lint.mjs): every caption, label
// and range card drawn since the last call, in px at the canvas size, and the hero's box (camera.js heroBox) when
// given. Call it last in the frame function; it empties the list. It sets globalThis.__dalangLayout and posts the
// record to strips.mjs's receiver while one answers (the first failed post stops the posting for this page).
// opts: format, hero ({ x0, y0, x1, y1 } | null), contrast (ΔE*, measure.js | null), boxes (text drawn outside this file,
// DOM overlays: added after the drawn ones), receiver, send (a function given the JSON instead of the post).
// -> { t, W, H, format, hero?, contrast?, boxes: [{ kind: "caption" | "label" | "card", text, x0, y0, x1, y1, size }] }
// layoutLive(): false once a post failed (no receiver: a final render), so a page can skip work only the review reads.
let live = true;
export const layoutLive = () => live;
export function layoutFrame(ctx, t, { format = "shorts", hero, contrast, boxes = [], receiver = "http://127.0.0.1:47614", send } = {}) {
  const rec = { t: ms(t), W: ctx.canvas.width, H: ctx.canvas.height, format, ...(hero === undefined ? {} : { hero }), ...(contrast === undefined ? {} : { contrast }), boxes: [...drawn, ...boxes] };
  drawn = [];
  globalThis.__dalangLayout = rec;
  const body = JSON.stringify(rec);
  if (send) send(body);
  else if (live && typeof fetch === "function") fetch(`${receiver}/layout`, { method: "POST", mode: "no-cors", body }).catch(() => { live = false; });
  return rec;
}

// Greedy wrap of `text` into lines of at most maxW px (ctx.font set): at spaces, and between CJK characters. A word wider
// than maxW stays whole on its own line (the caller shrinks the font). Text that fits is returned as it is.
function wrapText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return [text];
  const units = []; let gap = false;
  for (const t of text.match(/\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) || []) { if (/^\s+$/.test(t)) gap = true; else { units.push({ t, gap }); gap = false; } }
  const out = []; let cur = "";
  for (const u of units) {
    const next = cur + (cur && u.gap ? " " : "") + u.t;
    if (cur && ctx.measureText(next).width > maxW) { out.push(cur); cur = u.t; } else cur = next;
  }
  if (cur) out.push(cur);
  return out.length ? out : [text];
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

// The least time a label or overlay needs on screen: half a second to notice it, about three words a second, 0.15 s
// per CJK character, never under `floor` (1 s: a shorter clip reads as a flicker). Seconds, rounded to a millisecond.
export function readTime(text, { floor = 1 } = {}) {
  const s = String(text ?? "");
  let cjk = 0, rest = "";
  for (const ch of s) { if (CJK.test(ch)) { cjk++; rest += " "; } else rest += ch; }
  const words = rest.split(/\s+/).filter((w) => ALNUM.test(w)).length;
  if (!words && !cjk) return floor;
  return Math.max(floor, ms(0.5 + 0.3 * words + 0.15 * cjk));
}
