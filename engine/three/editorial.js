// editorial.js — the object-studio look's editorial layer: DOM/SVG over the 3D canvas, shared by every group of a
// parallel build and the host's captions. No three.js import: a 3D anchor is projected by the caller's
// `project(anchor) -> { x, y, ok }` (objectStudio.js makeSet gives one). Named editorial.js, not overlay.js, so it never
// overwrites a project's own assets/overlay.js when build.mjs installs the engine.
//
// Every element is a pure function of t (seek-safe): ov.update(tLocal, project) once per frame sets opacity, transform
// and leader lines. Times are ABSOLUTE narration seconds (from the cue helpers below); `G0` is the group's host start,
// so ov.update takes the group's local t and adds G0 itself. All words on screen come from the caller in the narration's
// language.
//
//   import { makeOverlay, captions, w, b } from "./editorial.js";
//   const ov = makeOverlay(rootEl, { prefix: "intro", G0, accent: "#FFD400" });
//   ov.headline({ kicker: "THE QUESTION", text: "Which one is [safer?]", from: b("hook"), to: w("because") });
//   ov.card({ label: "MELTING POINT", rows: [{ k: "A", v: "24 °C" }, { k: "B", v: "33 °C", hi: true }], source: "Source: …", from, to });
//   ov.tags([{ title: "A", value: "1×", sub: "…", x: 300 }, { title: "B", value: "2×", sub: "…", x: 780 }], { from, to });
//   ov.pill({ text: "VALVE", at: () => part, offset: [-220, -120], from, to });
//   ov.big({ text: "2×", at: () => part, offset: [0, -120], from, to });
//   each frame: ov.update(tLocal, project)
//
// "[word]" in any text marks the one accent word (a chip in the accent colour); "<br>" breaks a line.
// Captions (host): captions(rootEl, window.CAPTIONS, { prefix }) -> { update(tAbs) }: karaoke, white bold on a dark
// pill bottom-centre, the spoken word on an accent chip.

import { FAMILY, WEIGHT as W_ } from "./font.js";
export const W = 1080, H = 1920;

// ---------- cues: words by text (case and punctuation ignored), beats by name; a missing one throws ----------
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
// cues({ words, beats }): the helpers over explicit WORDS / BEATS (default: the page's globals, read at call time)
export function cues({ words, beats } = {}) {
  const W_ = () => { const x = words ?? globalThis.WORDS; if (!Array.isArray(x)) throw new Error("cues: WORDS is missing (load audio/beats.js first)"); return x; };
  function wordIndex(text, n = 0) {
    const ws = W_(), want = norm(text);
    let c = 0;
    for (let i = 0; i < ws.length; i++) if (norm(ws[i].text) === want) { if (c === n) return i; c++; }
    throw new Error(`cue: no word "${text}" #${n} in WORDS (found ${c})`);
  }
  const b = (name) => {
    const by = beats ?? globalThis.BEATS, x = Array.isArray(by) ? by.find((e) => e.name === name) : by?.[name];
    if (!x || !Number.isFinite(x.start)) throw new Error(`cue: no beat "${name}" in BEATS (${Array.isArray(by) ? by.map((e) => e.name).join(", ") : Object.keys(by || {}).join(", ")})`);
    return x.start;
  };
  return {
    wordIndex, b,
    w: (text, n = 0) => W_()[wordIndex(text, n)].start, // seconds, absolute
    we: (text, n = 0) => W_()[wordIndex(text, n)].end,
    wc: (text, n = 0) => "w" + wordIndex(text, n), // a shots.js cue ("w12"); wc(...) + ".end" for its end
  };
}
const G = cues();
export const { wordIndex, w, we, wc, b } = G;

// ---------- pure parts (no DOM) ----------
const clamp = (x, a = 0, z = 1) => Math.min(z, Math.max(a, x));
// bezier(x1, y1, x2, y2): a CSS cubic-bezier as a pure function of progress 0-1 (Newton, then bisection)
export function bezier(x1, y1, x2, y2) {
  const f = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3, d = (a, b, s) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) { const g = f(x1, x2, s) - x, k = d(x1, x2, s); if (Math.abs(g) < 1e-7) break; if (Math.abs(k) < 1e-6) { s = NaN; break; } s -= g / k; }
    if (!(s >= 0 && s <= 1)) { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { s = (lo + hi) / 2; if (f(x1, x2, s) < x) lo = s; else hi = s; } }
    return f(y1, y2, s);
  };
}
// One ease table for the overlays: a reveal lands with a strong ease-out, an exit accelerates away.
export const EASE = Object.freeze({ in: bezier(0.23, 1, 0.32, 1), out: bezier(0.3, 0, 0.8, 0.15) });
// Entrance by size (s): a pill is quick, a card longer, a headline longest (all under 0.8 s); an exit takes
// 0.7 of its entrance and leaves the way it came (scale back toward 0.96), so nothing appears from or vanishes into nothing.
export const IN_DUR = Object.freeze({ pill: 0.25, big: 0.3, card: 0.3, hl: 0.4, tag: 0.3 });
export const OUT_SHARE = 0.7;
// envelope(t, from, to, { inDur, outDur }): fade + scale 0.96 -> 1 over inDur on EASE.in, back out over outDur on
// EASE.out, ending at `to`
export function envelope(t, from, to, { inDur = 0.2, outDur = inDur * OUT_SHARE } = {}) {
  if (!(t >= from && t < to)) return { a: 0, s: 0.96, u: 0 };
  const e = EASE.in(clamp((t - from) / inDur));
  const o = to === Infinity ? 1 : 1 - EASE.out(1 - clamp((to - t) / outDur));
  return { a: e * o, s: 0.96 + 0.04 * e * o, u: e };
}
// accentHtml(s): escaped text, "[word]" on the accent chip, "<br>" kept as a line break
export const accentHtml = (s, cls = "ov-acc") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/&lt;br\s*\/?>/g, "<br>").replace(/\[(.+?)\]/g, `<span class="${cls}">$1</span>`);
// tagSwing(k, seed): a hanging tag k s after it is let go: it falls on its string (0.42 s, accelerating), the string
// catches it (a short damped bob), and it swings as a damped pendulum to rest. { y px, deg }
export function tagSwing(k, seed = 0, { fall = 0.42, drop = 560, swing = 7, period = 1.3 } = {}) {
  if (k < 0) return { y: -drop, deg: 0 };
  if (k < fall) return { y: -drop * (1 - (k / fall) ** 2), deg: 0 };
  const s = k - fall;
  return { y: 10 * Math.exp(-6 * s) * Math.sin(2 * Math.PI * s * 2.2), deg: (seed % 2 ? -1 : 1) * swing * Math.exp(-1.1 * s) * Math.cos((2 * Math.PI * s) / period) };
}
// captionAt(CAPS, t): { phrase, word } indices (-1 when none) — the karaoke state at t
export function captionAt(CAPS, t) {
  const phrase = CAPS.findIndex((c) => t >= c.start && t < c.end);
  let word = -1;
  if (phrase >= 0) CAPS[phrase].words.forEach((wd, i) => { if (t >= wd.start) word = i; });
  return { phrase, word };
}

const css = `
.ov{position:absolute;left:0;top:0;pointer-events:none;overflow:hidden;z-index:5;font-family:${FAMILY}}
.ov *{box-sizing:border-box}
.ov-el{position:absolute;opacity:0;will-change:transform,opacity}
.ov-hl{left:60px;top:110px;width:900px;transform-origin:0 0}
.ov-k{font-weight:${W_.sub};font-size:24px;letter-spacing:.12em;color:#6B6B6B;text-transform:uppercase;margin:0 0 12px 2px}
.ov-h{font-weight:${W_.title};font-size:68px;line-height:1.06;letter-spacing:-.02em;color:#111}
.ov-acc{background:var(--ov-acc);color:var(--ov-ink);padding:0 .14em;border-radius:10px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.ov-card{left:60px;width:600px;background:rgba(255,255,255,.88);border-radius:14px;box-shadow:0 10px 34px rgba(0,0,0,.14),0 2px 6px rgba(0,0,0,.08);padding:22px 28px 18px;transform-origin:0 0}
.ov-cl{font-weight:${W_.sub};font-size:22px;letter-spacing:.1em;color:#6B6B6B;text-transform:uppercase}
.ov-cv{font-weight:${W_.title};font-size:52px;line-height:1.08;color:#111;letter-spacing:-.01em;margin-top:6px}
.ov-cs{font-weight:${W_.sub};font-size:28px;line-height:1.25;color:#333;margin-top:6px}
.ov-row{display:flex;align-items:baseline;gap:18px;margin-top:10px}
.ov-rk{font-weight:${W_.sub};font-size:24px;color:#6B6B6B;min-width:150px;letter-spacing:.04em}
.ov-rv{font-weight:${W_.heading};font-size:44px;color:#111;letter-spacing:-.01em;white-space:nowrap}
.ov-rv.hi{background:var(--ov-acc);padding:0 .14em;border-radius:8px}
.ov-bar{position:relative;height:12px;border-radius:6px;background:#E6E6E3;margin-top:6px;overflow:hidden}
.ov-bar i{position:absolute;top:0;bottom:0;border-radius:6px;background:var(--ov-ink)}
.ov-bar i.hi{background:var(--ov-acc);box-shadow:inset 0 0 0 2px var(--ov-ink)}
.ov-src{font-weight:${W_.body};font-size:17px;color:#7A7A7A;margin-top:14px;padding-top:10px;border-top:1px solid rgba(0,0,0,.1)}
.ov-tag{transform-origin:0 0}
.ov-str{position:absolute;left:-1px;top:0;width:2px;background:#2A2A2A}
.ov-tb{position:absolute;width:200px;left:-100px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.94);box-shadow:0 12px 30px rgba(0,0,0,.18)}
.ov-tb:before{content:"";position:absolute;left:50%;top:10px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#D8D8D6;box-shadow:inset 0 0 0 3px #2A2A2A;z-index:2}
.ov-th{background:var(--ov-ink);color:var(--ov-acc);font-weight:${W_.sub};font-size:22px;letter-spacing:.12em;padding:32px 12px 10px;text-align:center}
.ov-tv{font-weight:${W_.title};font-size:72px;line-height:1;color:#111;text-align:center;padding:14px 10px 2px}
.ov-ts{font-weight:${W_.sub};font-size:24px;color:#555;text-align:center;padding:2px 10px 16px}
.ov-pill{left:0;top:0;white-space:nowrap}
.ov-pi{display:inline-block;background:var(--ov-acc);color:var(--ov-ink);font-weight:${W_.heading};font-size:26px;letter-spacing:.04em;text-transform:uppercase;padding:10px 18px 9px;border-radius:999px;box-shadow:0 0 0 2.5px var(--ov-ink),0 8px 18px rgba(0,0,0,.18);transform-origin:50% 50%}
.ov-big{left:0;top:0}
.ov-bi{display:inline-block;background:var(--ov-acc);color:var(--ov-ink);font-weight:${W_.title};font-size:120px;line-height:1;letter-spacing:-.03em;padding:8px 26px 10px;border-radius:22px;box-shadow:0 0 0 4px var(--ov-ink),0 16px 34px rgba(0,0,0,.22);transform-origin:50% 50%}
.ov-lead{position:absolute;left:0;top:0;overflow:visible}
`;

const docOf = (root) => root.ownerDocument || globalThis.document;
function el(doc, tag, cls, parent, html) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
function style(doc, id, text) {
  if (doc.getElementById?.(id)) return;
  const s = el(doc, "style", null, doc.head); s.id = id; s.textContent = text;
}

// makeOverlay(root, { prefix, G0, accent, ink, W, H, safe }): prefix (the group id) keeps element ids
// unique; safe = { x, top, bottom } px, the box a pinned pill stays in (bottom: above the caption band).
// Type: one family (font.js), weight by role: headline and big values Bold, pills and captions Semibold, kickers and labels
// Medium, source lines Regular.
export function makeOverlay(root, { prefix, G0 = 0, accent = "#FFD400", ink = "#0B0B0B", W: fw = W, H: fh = H, safe = { x: 54, top: 96, bottom: 1180 } } = {}) {
  if (!root) throw new Error("makeOverlay(root): pass the composition root element");
  if (!prefix) throw new Error("makeOverlay: pass { prefix } (the group id, for unique element ids)");
  const doc = docOf(root);
  style(doc, "ov-style", css);
  const layer = el(doc, "div", "ov", root); layer.id = prefix + "-ov";
  layer.style.width = fw + "px"; layer.style.height = fh + "px";
  layer.style.setProperty?.("--ov-acc", accent); layer.style.setProperty?.("--ov-ink", ink);
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(svgNS, "svg"); svg.setAttribute("class", "ov-lead"); svg.setAttribute("viewBox", `0 0 ${fw} ${fh}`); svg.setAttribute("width", fw); svg.setAttribute("height", fh); layer.appendChild(svg);
  const items = [];
  let n = 0;
  const id = (k) => `${prefix}-${k}${n++}`;
  const check = (o, what) => { if (!(Number.isFinite(o.from) && Number.isFinite(o.to) && o.to > o.from)) throw new Error(`${what}: from/to must be absolute seconds with to > from (got ${o.from}, ${o.to})`); };
  const A = (s) => accentHtml(s);

  const api = {
    layer, items,
    // headline block top-left: mono kicker + bold headline (<= 2 lines), one [accent] word on a chip
    headline({ kicker = "", text, from, to, top = 110, size = 68 }) {
      check({ from, to }, "headline");
      if (!text) throw new Error("headline: pass its text");
      const e = el(doc, "div", "ov-el ov-hl", layer, (kicker ? `<div class="ov-k">${A(kicker)}</div>` : "") + `<div class="ov-h" style="font-size:${size}px">${A(text)}</div>`);
      e.id = id("hl"); e.style.top = top + "px";
      items.push({ e, from, to, kind: "hl" });
      return e;
    },
    // data card: label, value / rows (bars on a `scale` optional) and the source line at the bottom (required: the
    // caller writes it whole, in the narration's language)
    card({ label, value, sub, rows, source, from, to, top = 360, left = 60, width = 600, scale }) {
      check({ from, to }, "card");
      if (!source) throw new Error("card: every card carries its source line");
      let h = `<div class="ov-cl">${A(label ?? "")}</div>`;
      if (value) h += `<div class="ov-cv">${A(value)}</div>`;
      if (sub) h += `<div class="ov-cs">${A(sub)}</div>`;
      for (const r of rows || []) {
        h += `<div class="ov-row"><span class="ov-rk">${A(r.k)}</span><span class="ov-rv${r.hi ? " hi" : ""}">${A(r.v)}</span></div>`;
        if (r.bar && scale) { const [a, z] = r.bar, L = ((a - scale[0]) / (scale[1] - scale[0])) * 100, R = ((z - scale[0]) / (scale[1] - scale[0])) * 100; h += `<div class="ov-bar"><i class="${r.hi ? "hi" : ""}" style="left:${L}%;width:${Math.max(2, R - L)}%"></i></div>`; }
      }
      h += `<div class="ov-src">${A(source)}</div>`;
      const e = el(doc, "div", "ov-el ov-card", layer, h);
      e.id = id("card"); e.style.top = top + "px"; e.style.left = left + "px"; e.style.width = width + "px";
      items.push({ e, from, to, kind: "card" });
      return e;
    },
    // hanging tags (A vs B): each hangs by a string from the top edge at x, drops in on `from` (staggered) and swings to rest
    tags(list, { from, to, len = 360, stagger = 0.12 }) {
      check({ from, to }, "tags");
      return list.map((g, i) => {
        const e = el(doc, "div", "ov-el ov-tag", layer, `<div class="ov-str" style="height:${(g.len ?? len) + 10}px"></div><div class="ov-tb" style="top:${g.len ?? len}px"><div class="ov-th">${A(g.title)}</div><div class="ov-tv">${A(g.value)}</div><div class="ov-ts">${A(g.sub || "")}</div></div>`);
        e.id = id("tag"); e.style.left = g.x + "px"; e.style.top = "0px";
        items.push({ e, from: from + i * stagger, to, kind: "tag", seed: i, scale: g.scale });
        return e;
      });
    },
    // pill label with a thin dark leader + ringed dot on the part. at: () => Object3D | Vector3 (projected by update's
    // `project`); offset: [dx, dy] px from the anchor to the pill's centre.
    pill({ text, at, offset = [-200, -140], from, to }) {
      check({ from, to }, "pill");
      if (typeof at !== "function") throw new Error("pill: at is a function returning the 3D anchor (Object3D or Vector3)");
      const e = el(doc, "div", "ov-el ov-pill", layer, `<span class="ov-pi">${A(text)}</span>`);
      e.id = id("pill");
      const line = doc.createElementNS(svgNS, "line"); line.setAttribute("stroke", ink); line.setAttribute("stroke-width", "2.5"); line.setAttribute("stroke-linecap", "round"); svg.appendChild(line);
      const dot = doc.createElementNS(svgNS, "circle"); dot.setAttribute("r", "7"); dot.setAttribute("fill", accent); dot.setAttribute("stroke", ink); dot.setAttribute("stroke-width", "3"); svg.appendChild(dot);
      items.push({ e, from, to, kind: "pill", at, offset, line, dot, inner: e.firstChild });
      return e;
    },
    // a big number pinned near a 3D point (no leader)
    big({ text, at, offset = [0, -120], from, to, size }) {
      check({ from, to }, "big");
      if (typeof at !== "function") throw new Error("big: at is a function returning the 3D anchor (Object3D or Vector3)");
      const e = el(doc, "div", "ov-el ov-big", layer, `<span class="ov-bi"${size ? ` style="font-size:${size}px"` : ""}>${A(text)}</span>`);
      e.id = id("big");
      items.push({ e, from, to, kind: "big", at, offset, inner: e.firstChild });
      return e;
    },
    // update(tLocal, project): everything at t. project(anchor) -> { x, y, ok } in px.
    update(tl, project) {
      const t = tl + G0;
      for (const it of items) {
        const v = envelope(t, it.from, it.to, { inDur: IN_DUR[it.kind] ?? 0.25 });
        const on = v.a > 0.001;
        it.e.style.opacity = on ? v.a.toFixed(3) : "0";
        if (it.line) it.line.style.opacity = it.dot.style.opacity = on ? v.a.toFixed(3) : "0";
        if (!on) continue;
        if (it.kind === "hl" || it.kind === "card") { it.e.style.transform = `scale(${v.s.toFixed(4)})`; continue; }
        if (it.kind === "tag") {
          const p = tagSwing(t - it.from, it.seed);
          it.e.style.transform = `translateY(${p.y.toFixed(1)}px) rotate(${p.deg.toFixed(3)}deg) scale(${it.scale || 1})`;
          it.e.style.opacity = (t < it.to - 0.2 ? 1 : v.a).toFixed(3);
          continue;
        }
        const p = project ? project(it.at()) : null;
        if (!p || !p.ok) { it.e.style.opacity = "0"; if (it.line) it.line.style.opacity = it.dot.style.opacity = "0"; continue; }
        // keep the pill inside the safe box (half its size in from the edge), never into the caption band
        const hw = (it.inner.offsetWidth || 200) / 2 + 8, hh = (it.inner.offsetHeight || 50) / 2 + 8;
        const x = Math.min(fw - safe.x - hw, Math.max(safe.x + hw, p.x + it.offset[0])), y = Math.min(safe.bottom - hh, Math.max(safe.top + hh, p.y + it.offset[1]));
        it.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        it.inner.style.transform = `translate(-50%, -50%) scale(${v.s.toFixed(4)})`;
        if (it.line) {
          // the leader leaves the pill's edge toward the part (the pill approximated as an ellipse) and draws itself in
          const bw = it.inner.offsetWidth / 2 || 120, bh = it.inner.offsetHeight / 2 || 26, dx = p.x - x, dy = p.y - y, L = Math.hypot(dx, dy) || 1;
          const kx = Math.min(bw / Math.abs(dx / L || 1e-6), bh / Math.abs(dy / L || 1e-6));
          const sx = x + (dx / L) * Math.min(kx, L), sy = y + (dy / L) * Math.min(kx, L);
          const ex = sx + (p.x - sx) * v.u, ey = sy + (p.y - sy) * v.u;
          it.line.setAttribute("x1", sx.toFixed(1)); it.line.setAttribute("y1", sy.toFixed(1)); it.line.setAttribute("x2", ex.toFixed(1)); it.line.setAttribute("y2", ey.toFixed(1));
          it.dot.setAttribute("cx", p.x.toFixed(1)); it.dot.setAttribute("cy", p.y.toFixed(1));
          it.dot.style.opacity = (v.a * (v.u > 0.95 ? 1 : 0)).toFixed(3);
        }
      }
    },
  };
  return api;
}

// ---------- karaoke captions (host) ----------
const capCss = `
.cap-box{position:absolute;left:0;top:0;pointer-events:none;z-index:40;font-family:${FAMILY}}
.cap-p{position:absolute;left:90px;right:90px;display:none;justify-content:center}
.cap-p.on{display:flex}
.cap-pill{display:inline-block;max-width:900px;text-align:center;background:rgba(11,11,11,.70);border-radius:24px;padding:12px 26px 14px;font-weight:${W_.heading};font-size:46px;line-height:1.28;color:#fff;letter-spacing:-.005em}
.cap-w{display:inline;padding:0 .1em;border-radius:9px}
.cap-w.on{background:var(--ov-acc);color:var(--ov-ink)}
`;
// captions(root, CAPS, { prefix, accent, ink, bottom, W, H }): CAPS is audio/captions.js's window.CAPTIONS
// ([{ start, end, words: [{ text, start }] }]); bottom: px from the frame's bottom edge to the pill's bottom.
export function captions(root, CAPS, { prefix = "cap", accent = "#FFD400", ink = "#0B0B0B", bottom = 570, W: fw = W, H: fh = H } = {}) {
  if (!root) throw new Error("captions(root, CAPS): pass the composition root element");
  if (!Array.isArray(CAPS) || !CAPS.length) throw new Error("captions(): pass window.CAPTIONS (audio/captions.js)");
  const doc = docOf(root);
  style(doc, "cap-style", capCss);
  const box = el(doc, "div", "cap-box", root); box.id = prefix + "-box";
  box.style.width = fw + "px"; box.style.height = fh + "px";
  box.style.setProperty?.("--ov-acc", accent); box.style.setProperty?.("--ov-ink", ink);
  const phrases = CAPS.map((c, i) => {
    const p = el(doc, "div", "cap-p", box); p.id = `${prefix}-${i}`; p.style.bottom = bottom + "px";
    const pill = el(doc, "span", "cap-pill", p);
    const ws = c.words.map((wd, j) => { const s = el(doc, "span", "cap-w", pill); s.textContent = wd.text; if (j < c.words.length - 1) pill.appendChild(doc.createTextNode(" ")); return s; });
    return { c, p, ws };
  });
  let cur = -1, curW = -1;
  return {
    box,
    update(t) {
      const { phrase: k, word: j } = captionAt(CAPS, t);
      if (k !== cur) { if (cur >= 0) { phrases[cur].p.classList.remove("on"); phrases[cur].ws.forEach((s) => s.classList.remove("on")); } if (k >= 0) phrases[k].p.classList.add("on"); cur = k; curW = -1; }
      if (k < 0) return;
      if (j !== curW) { phrases[k].ws.forEach((s, i) => s.classList.toggle("on", i === j)); curW = j; }
    },
  };
}
