// sfx.js — the bake's impacts place and level their own sound effects. Pure data in, rows out: no DOM, no imports, so it runs in
// Node (sfx.mjs, tests) and in the page. An impact is { t, name, dv } (dv = velocity change in m/s: the bake records the moving
// body, not its partner), so the partner material comes from impact.with or from opts.against. Nothing is guessed: an unknown
// material is `unplaced`, a tag with no sample is `missing`, a sample without an ASSETS.json row (source + licence) is a `problem`.
export const SOFT = ["cloth", "paper", "foam", "soil"], BRITTLE = ["glass", "ceramic"];
const MATERIALS = ["wood", "metal", "stone", "glass", "ceramic", "plastic", "rubber", "water", ...SOFT];
const D = { base: 0.5, ref: 1.2, cap: 1, floor: 0.15, merge: 0.04, light: 0.6, heavy: 1.8, breakAt: 3, maxDur: 3, latchGain: 0.4, eventGain: 0.5, offset: 0 };
const pos = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
const r3 = (v) => Math.round(v * 1000) / 1000;

// The licence verdict of scripts/check_assets.mjs for one row (same patterns; tests/sfx.mjs holds the two to the same answer on a table of
// licences). null = the gate passes the row, else the reason it refuses. A row the gate refuses never becomes an <audio> row.
const OK = /^(CC0|PD|public[- ]domain|CC-BY(-SA)?(-[\d.]+)?|Pexels|Pixabay|Apache-2\.0|MIT|Zlib|ISC|BSD-[23]-Clause|own|user|bundled)(-[\d.]+)?(\s+(v?\d[\d.]*|universal|international|unported|license|licence|content|mark|dedication|only))*$/i;
const NOTE = /^(with\s+)?(attribution|credit)(\s+(required|needed))?$/i;
const NC = /\bNC\b|non-?commercial|research/i, ND = /\bND\b|no[- ]?deriv/i;
const licParts = (l) => String(l ?? "").split(/\s+(?:AND|OR|WITH|PLUS)\s+|[()+\/,;&|]/i).map((x) => x.trim()).filter((x) => x && !NOTE.test(x));
export function licenceProblem(row, commercial = false) {
  if (!row || !row.source || !row.licence) return "no source or licence";
  const parts = licParts(row.licence), bad = parts.length ? parts.find((p) => !NC.test(p) && !OK.test(p)) : String(row.licence);
  if (parts.some((p) => ND.test(p))) return `licence "${row.licence}" forbids derivatives`;
  if (commercial && parts.some((p) => NC.test(p))) return `licence "${row.licence}" is non-commercial`;
  if (bad) return `licence "${row.licence}": "${bad}" is not on the allowed list`;
  if (parts.some((p) => /^CC-BY/i.test(p)) && !row.author) return "CC BY needs an author for the credit";
  if (row.source === "generated" && (!row.model || !row.prompt)) return "generated asset needs model and prompt";
  return null;
}

// tagFor(a, b, dv, o) -> "wood-on-wood light" | "cloth-soft" | "glass-shatter" | "water-splash" | null (a material is unknown)
export function tagFor(a, b, dv, o = {}) {
  const { light, heavy, breakAt } = { ...D, ...o };
  if (!MATERIALS.includes(a) || !MATERIALS.includes(b)) return null;
  const soft = [a, b].filter((m) => SOFT.includes(m)).sort()[0];
  if (soft) return soft + "-soft";
  const brittle = [a, b].find((m) => BRITTLE.includes(m));
  if (brittle && dv >= breakAt) return brittle + "-shatter";
  if (a === "water" || b === "water") return "water-splash";
  const [m1, m2] = [a, b].sort();
  return `${m1}-on-${m2} ${dv < light ? "light" : dv < heavy ? "medium" : "heavy"}`;
}

export function impactSounds(impacts, opts = {}) {
  const o = { ...D, ...opts, latches: opts.latches || [], events: opts.events || [], materials: opts.materials || {}, library: opts.library || [], assets: opts.assets || [] };
  if (!Array.isArray(impacts)) throw new Error("impacts must be an array (the bake's impacts)");
  for (const k of ["latches", "events", "library", "assets"]) if (!Array.isArray(o[k])) throw new Error(`${k} must be an array`);
  for (const k of ["base", "ref", "cap", "floor", "merge", "light", "heavy", "breakAt", "maxDur"]) if (!pos(o[k])) throw new Error(`${k} must be a finite number > 0`);
  if (!Number.isFinite(o.offset)) throw new Error("offset must be a finite number");
  const src = o.src || ((f) => f);
  const num = (v, what, i) => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${what} ${i}: t must be a finite number`); };
  const out = { rows: [], missing: [], unplaced: [], dropped: [], problems: [] };
  const cands = [];
  impacts.forEach((e, i) => {
    num(e && e.t, "impact", i);
    if (!pos(e.dv)) throw new Error(`impact ${i}: dv must be a finite number > 0`);
    if (e.dv < o.floor) return out.dropped.push({ t: e.t, name: e.name, why: "below floor" });
    if (e.t < 0) return out.dropped.push({ t: e.t, name: e.name, why: "pre-roll" });
    cands.push({ kind: "impact", t: e.t, dv: e.dv, name: e.name, src: e, i });
  });
  o.latches.forEach((e, i) => { num(e && e.t, "latch", i); if (e.t >= 0) cands.push({ kind: "latch", t: e.t, name: e.name, tag: "latch-click", i: 1e6 + i }); });
  o.events.forEach((e, i) => {
    num(e && e.t, "event", i);
    if (e.dv !== undefined && !pos(e.dv)) throw new Error(`event ${i}: dv must be a finite number > 0`);
    if (e.t < 0) return;
    const tag = e.kind === "fracture" ? (MATERIALS.includes(e.material) ? e.material + "-shatter" : null) : e.kind === "splash" ? "water-splash" : e.kind === "custom" ? (typeof e.tag === "string" && e.tag ? e.tag : null) : null;
    if (!tag) return out.unplaced.push({ name: e.kind, t: e.t, why: "unknown event kind or no material/tag" });
    cands.push({ kind: "event", t: e.t, dv: e.dv, name: e.kind, tag, i: 2e6 + i });
  });
  cands.sort((a, b) => a.t - b.t || a.i - b.i);
  // merge: a cluster starts at its first member and takes every one within the window; the hardest survives
  const kept = [];
  for (let k = 0; k < cands.length;) {
    let j = k + 1;
    while (j < cands.length && cands[j].t - cands[k].t < o.merge) j++;
    let best = cands[k];
    for (let m = k + 1; m < j; m++) if ((cands[m].dv || 0) > (best.dv || 0)) best = cands[m];
    for (let m = k; m < j; m++) if (cands[m] !== best) out.dropped.push({ t: cands[m].t, name: cands[m].name, why: "merged" });
    kept.push({ ...best, merged: j - k - 1 });
    k = j;
  }
  const used = {}, bad = new Set();
  for (const c of kept) {
    let tag = c.tag;
    if (c.kind === "impact") {
      const a = o.materials[c.name], w = c.src.with;
      const b = w !== undefined ? o.materials[w] : typeof o.against === "function" ? o.against(c.src) : o.against;
      tag = tagFor(a, b, c.dv, o);
      if (!tag) { out.unplaced.push({ name: c.name, t: c.t, why: `material unknown (${c.name}: ${a || "?"}, partner: ${w !== undefined ? w : "against"}: ${b || "?"})` }); continue; }
    }
    const pool = o.library.filter((l) => l && Array.isArray(l.tags) && l.tags.includes(tag));
    if (!pool.length) { if (!out.missing.includes(tag)) out.missing.push(tag); continue; }
    const s = pool[(used[tag] = (used[tag] ?? -1) + 1) % pool.length];
    const row = o.assets.find((a) => a && a.file === s.file);
    if (!row || !row.source || !row.licence) { if (!bad.has(s.file)) { bad.add(s.file); out.problems.push(`${s.file}: not in ASSETS.json with a source and licence (run find_media --take ... --as ...)`); } continue; }
    const lp = licenceProblem(row, o.commercial === true);
    if (lp) { if (!bad.has(s.file)) { bad.add(s.file); out.problems.push(`${s.file}: check_assets would refuse this row (${lp}); pick another sample or fix its row`); } continue; }
    if (!pos(s.duration)) { if (!bad.has(s.file)) { bad.add(s.file); out.problems.push(`${s.file}: library entry has no positive duration (an <audio> without data-duration plays to the end)`); } continue; }
    const vol = c.dv === undefined ? (c.kind === "latch" ? o.latchGain : o.eventGain) : Math.min(o.cap, o.base * (c.dv / o.ref) ** 0.6);
    out.rows.push({ id: "sfx-" + (out.rows.length + 1), tag, file: src(s.file), start: r3(o.offset + c.t), duration: Math.min(s.duration, o.maxDur), volume: r3(Math.min(o.cap, vol)), name: c.name, t: c.t, dv: c.dv, merged: c.merged, kind: c.kind });
  }
  return out;
}

// the <audio> lines; the bake value rides in a comment (camera-motion.md §5.3)
export function audioTags(rows, o = {}) {
  return rows.map((r) => `<audio id="${r.id}" src="${r.file}" data-start="${r.start.toFixed(3)}" data-duration="${r.duration}" data-volume="${r.volume.toFixed(3)}"${o.track !== undefined ? ` data-track-index="${o.track}"` : ""}></audio> <!-- bake t=${r.t.toFixed(3)}${r.dv === undefined ? "" : " dv=" + r.dv.toFixed(2)} ${r.name} ${r.tag} -->`).join("\n");
}

// the list the agent approves, for PRODUCTION.md
export function productionTable(res) {
  const L = ["| t (s) | tag | file | volume | cause |", "|---|---|---|---|---|"];
  for (const r of res.rows) L.push(`| ${r.start.toFixed(3)} | ${r.tag} | ${r.file} | ${r.volume.toFixed(3)} | ${r.kind}: ${r.name}${r.dv === undefined ? "" : " dv " + r.dv.toFixed(2)}${r.merged ? ` (+${r.merged} merged)` : ""} |`);
  if (res.missing.length) L.push("", "Missing samples: " + res.missing.join(", ") + " (find_media, then rerun)");
  if (res.unplaced.length) L.push("", "Unplaced: " + res.unplaced.map((u) => `${u.name}@${u.t} ${u.why}`).join("; "));
  if (res.problems.length) L.push("", "Problems: " + res.problems.join("; "));
  return L.join("\n");
}
