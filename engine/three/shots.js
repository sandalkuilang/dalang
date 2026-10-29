import { THREE } from "./three-vendor.js";
import { travel, place as placePose, poseOf, isoCamera, attend, snap, windowProblems } from "./camera.js";
import { textBand, pinLabel, drawCaption, safeArea } from "./type.js";
import { dimension } from "./quantity.js";

// A film's shots as data, played by one tested runner: the builder writes the set (its parts, dims, stations, its own
// at(t) that poses the parts) and a shot list, never per-shot camera, cut, attention or overlay code.
//
//   const run = shots(SHOTS, { beats: BEATS, words: WORDS, end: NARRATION_DURATION, fps, W, H, format, set });
//   // each frame: run.at(t, camera); render; then on the 2D canvas: run.draw(ctx, t, camera); layoutFrame(ctx, t)
//
// A shot: { name, beat, action, transition, view, newSubject, camera, cut, highlight, band, labels, dims, custom }
//   beat        the cue the shot starts on; it ends where the next one starts (the last at `end`)
//   action      what the subject does in it, one of set.actions (visual-direction.md §3: the subject acts in every
//               shot). null only for a breath of at most 1.5 s (a camera-only plate)
//   transition  "cut" (the camera is on the first key at the shot's start) or "travel" (it leaves the previous shot's
//               last pose at the start and arrives on the first key)
//   view        degrees: the subject's yaw (the set turns it) added to the first station's own azimuth; an isometric station has
//               none, so a cut between isometric shots needs it. A "cut" must turn the view by 60° or more from where the shot
//               before ended (a jump cut at the same view shows nothing new: travel instead); newSubject: true exempts a cut to another subject
//   camera      [{ station, at?, arrive?, ease?, lift? }]: station names a key of set.stations. The first key holds from
//               the start (or is arrived at on "travel"); each later key is a move that leaves on `at` and arrives on
//               `arrive` (default: the end of the beat `at` names). ease: "inOut" (default), "linear", "in", "out" or a
//               function u -> u that stays in [0, 1] and never goes back (no overshoot: camera-motion.md §5)
//   cut         true / false: the set's cutaway opens / closes on the shot's start; left out, unchanged
//   highlight   [part names]: everything else ghosts (camera.js attend) from the start; left out or []: released
//   band        { kicker?, headline, tag? }: type.js textBand for the whole shot
//   labels      [{ part, text, at? }]: a pinLabel on set.parts[part] from `at` (default: the start) to the shot's end
//   dims        [{ dim, text?, at?, dir? }]: a dimension line on set.dims[dim] ({ a, b, m }); text defaults to m in mm;
//               dir [x, y, z], the side the line stands off to (default +y)
//   custom      the escape hatch: a key of opts.custom, { at?(t, shot), draw?(ctx, t, camera, shot) }, run after the
//               runner's own work; code only for what data cannot say
// Cues: "beat" (its start), "beat.end", "w12" (WORDS[12].start), "w12.end". Every time comes from the narration, snapped to
// the frame grid; there is no field for seconds, so a change always lands on a word.
// Motion stays the set's: the runner never moves a part. set.at(t) (the set's model, posed at t) runs first each
// frame; the runner keys only the cut, the attention and the camera.
// Every problem (a missing beat, a key that overshoots, a label or dimension end off the frame, a window shorter than
// its read time, a shot without action) is collected and thrown in one error, before anything is drawn.

const EASE = { linear: (u) => u, inOut: (u) => u * u * u * (u * (6 * u - 15) + 10), in: (u) => u * u * u, out: (u) => 1 - (1 - u) ** 3 };

// cueTime(cue, { beats, words }): seconds. beats: beats.js BEATS ({ name: { start, end } }) or beats.json's beats array.
export function cueTime(cue, { beats, words = [] }) {
  const by = Array.isArray(beats) ? Object.fromEntries(beats.map((b) => [b.name, b])) : beats || {};
  const m = typeof cue === "string" && /^(.+?)(\.end)?$/.exec(cue);
  if (!m) throw new Error(`cue ${JSON.stringify(cue)} is not a beat name or "w<i>" (add ".end" for its end)`);
  const w = /^w(\d+)$/.exec(m[1]), src = w ? words[+w[1]] : by[m[1]], t = src && (m[2] ? src.end : src.start);
  if (!Number.isFinite(t)) throw new Error(w ? `cue "${cue}": no word ${w[1]} in WORDS (${words.length} words)` : `cue "${cue}": no beat "${m[1]}" in beats.json (${Object.keys(by).join(", ")})`);
  return t;
}

export function shots(list, { beats, words = [], end, fps, W, H, format = "shorts", set, custom = {}, attention = {}, captions, accent, pill } = {}) {
  if (!Array.isArray(list) || !list.length) throw new Error("shots(): list is an array of shots, one per storyboard row");
  if (!(Number.isFinite(fps) && fps > 0 && W > 0 && H > 0 && Number.isFinite(end))) throw new Error("shots(): pass fps, W, H and end (NARRATION_DURATION, seconds)");
  if (!set?.stations || !set.parts) throw new Error("shots(): set is { stations, parts, dims?, cut?, group?, keep?, actions?, at?(t), place?(camera, station, W, H) }");
  const problems = [], say = (s, msg) => problems.push(`shot "${s.name}": ${msg}`);
  const cue = (s, c) => { try { return snap(cueTime(c, { beats, words }), fps); } catch (e) { say(s, e.message); return NaN; } };
  const az = (p) => (p.position ? Math.atan2(p.position.x - p.target.x, p.position.z - p.target.z) * 180 / Math.PI : 0);
  const turned = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const station = (s, k) => set.stations[k.station] ?? (say(s, `station "${k.station}" is not one of ${Object.keys(set.stations).join(", ")}`), null);

  // times, then the camera's segments: holds and moves, each a pure function of t
  const out = list.map((s) => ({ ...s, start: cue(s, s.beat) }));
  out.forEach((s, i) => { s.end = i + 1 < out.length ? out[i + 1].start : snap(end, fps); });
  const segs = [];
  let last = null, lastView = 0;
  for (const [i, s] of out.entries()) {
    if (!(s.end > s.start)) say(s, `starts at ${s.start} s, not before the next shot (${s.end} s): list shots in narration order`);
    if (s.action == null ? s.end - s.start > 1.5 : set.actions && !set.actions.includes(s.action))
      say(s, s.action == null ? "has no action: the subject acts in every shot (a camera-only breath is at most 1.5 s)" : `action "${s.action}" is not one of set.actions (${set.actions.join(", ")})`);
    if (!["cut", "travel"].includes(s.transition)) say(s, `transition is "cut" or "travel", got ${JSON.stringify(s.transition)}`);
    if (s.transition === "travel" && !i) say(s, "the first shot cannot travel: there is no shot before it");
    const keys = s.camera ?? [];
    if (!keys.length) { say(s, "camera needs at least one key"); continue; }
    let from = s.transition === "travel" ? last : null, t0 = s.start;
    keys.forEach((k, j) => {
      const to = station(s, k);
      if (!to) return;
      if (j === 0) {
        const v = az(to) + (s.view ?? 0);
        if (s.transition === "cut" && i && !s.newSubject && turned(v, lastView) < 60)
          say(s, `cuts to the same view (${Math.round(turned(v, lastView))}° from the shot before): a cut turns the view 60° or more (a side, the back: set \`view\`, or another station), else "travel"; newSubject: true for another subject`);
        lastView = v;
      }
      const move = j > 0 || s.transition === "travel";
      if (!move) { segs.push({ s, from: to, to, start: s.start, dur: 0 }); from = to; return; }
      const at = j === 0 ? s.start : cue(s, k.at), name = typeof k.at === "string" ? k.at.replace(/\.end$/, "") : s.beat;
      const arrive = cue(s, k.arrive ?? (/^w\d+$/.test(name) ? undefined : name + ".end"));
      if (k.arrive == null && /^w\d+$/.test(name)) say(s, `key "${k.station}" leaves on a word: give it an arrive cue`);
      const ease = typeof k.ease === "function" ? k.ease : EASE[k.ease ?? "inOut"];
      if (!ease) say(s, `key "${k.station}": unknown ease "${k.ease}"`);
      else for (let n = 1, prev = 0; n <= 64; n++) { const u = ease(n / 64); if (!(u >= prev - 1e-9 && u <= 1 + 1e-9)) { say(s, `key "${k.station}" overshoots: its ease leaves [0, 1] or goes back (camera-motion.md §5: arrivals never overshoot)`); break; } prev = u; }
      if (at < t0 - 1e-9) say(s, `key "${k.station}" leaves at ${at} s, before the move before it arrives (${t0} s)`);
      if (arrive > s.end + 1e-9) say(s, `key "${k.station}" arrives at ${arrive} s, after the shot ends (${s.end} s)`);
      if (!(arrive > at)) say(s, `key "${k.station}" arrives at ${arrive} s, not after it leaves (${at} s)`);
      if (from && ease && arrive > at) segs.push({ s, from, to, start: at, dur: arrive - at, ease, lift: k.lift });
      from = to; t0 = arrive;
    });
    last = from; if (from) lastView = az(from) + (s.view ?? 0);
  }

  const fail = () => { if (problems.length) throw new Error("shots(): " + problems.length + " problem(s)\n  " + problems.join("\n  ")); };
  fail(); // the times first: framing and read times need them

  // the camera pose at t: the last segment begun (a hold, or a move: travel holds `to` after it ends)
  const pose = (t) => {
    let g = segs[0];
    for (const x of segs) if (x.start <= t + 1e-9) g = x;
    if (!g) return null;
    const p = g.dur ? travel(t, g.from, g.to, { start: g.start, dur: g.dur, ease: g.ease, lift: g.lift }) : { ...poseOf(g.to), speed: 0 };
    return { ...g.to, ...p, view: g.to.view };
  };
  const placeAt = (camera, t) => {
    const p = pose(t);
    if (set.place) set.place(camera, p, W, H); else placePose(camera, p);
    return camera;
  };

  // overlays: windows from their cues, read times from type.js, anchors on the frame at the window's start, middle, end
  const itemsOf = (s) => [
    ...(s.labels ?? []).map((l) => ({ kind: "label", l, at: l.at ? cue(s, l.at) : s.start, anchor: () => set.parts[l.part], text: l.text, ok: !!set.parts[l.part], what: `label "${l.text}" on "${l.part}"` })),
    ...(s.dims ?? []).map((d) => { const D = set.dims?.[d.dim]; return { kind: "dim", d, D, at: d.at ? cue(s, d.at) : s.start, text: d.text ?? (D ? `${Math.round(D.m * 1000)} mm` : ""), ok: !!D, what: `dimension "${d.dim}"` }; }),
  ];
  const zone = safeArea(format, W, H).labels, cam = Object.values(set.stations)[0]?.k !== undefined ? isoCamera(W, H) : new THREE.PerspectiveCamera(30, W / H, 1e-4, 1e3), v = new THREE.Vector3();
  const onFrame = (p) => { v.copy(p).project(cam); const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H; return v.z >= -1 && v.z <= 1 && x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1; };
  const windows = [];
  for (const s of out) {
    if (s.band && !(typeof s.band.headline === "string" && s.band.headline.trim())) say(s, "band needs a headline (the claim or the number)");
    if (s.band?.headline) windows.push({ name: `shot "${s.name}" headline`, cue: s.start, end: s.end, text: s.band.headline });
    for (const h of s.highlight ?? []) if (!set.parts[h]) say(s, `highlight "${h}" is not one of set.parts`);
    if (s.cut !== undefined && !set.cut) say(s, "cut is set but the set has no cutaway");
    if (s.custom && !custom[s.custom]) say(s, `custom "${s.custom}" is not a key of opts.custom`);
    s.items = itemsOf(s);
    for (const it of s.items) {
      if (!it.ok) { say(s, `${it.what}: no such ${it.kind === "label" ? "part" : "dim"} in the set`); continue; }
      windows.push({ name: `shot "${s.name}" ${it.what}`, cue: it.at, end: s.end, text: it.text });
      for (const t of [it.at, (it.at + s.end) / 2, s.end - 1 / fps]) {
        if (!pose(t)) continue;
        placeAt(cam, t);
        const pts = it.kind === "label" ? [it.anchor().getWorldPosition(new THREE.Vector3())] : [it.D.a, it.D.b];
        if (!pts.every(onFrame)) { say(s, `${it.what} is off the frame at ${t.toFixed(2)} s: reframe the station or move the cue`); break; }
      }
    }
  }
  problems.push(...windowProblems(windows, out.map((s) => ({ name: s.name, start: s.start, end: s.end })), { fps }));
  fail();

  // keyed once: the cut and the attention, on each shot's start
  const ghost = out.some((s) => s.highlight?.length) ? attend(set.group, { keep: set.keep ?? [], ...attention }) : null;
  for (const s of out) {
    if (s.cut === true) set.cut.on(s.start); else if (s.cut === false) set.cut.off(s.start);
    if (ghost) s.highlight?.length ? ghost.focus(s.highlight.map((h) => set.parts[h]), s.start) : ghost.release(s.start);
  }
  const shotOf = (t) => { let s = out[0]; for (const x of out) if (x.start <= t + 1e-9) s = x; return s; };

  return {
    shots: out, pose, place: placeAt,
    // at(t, camera): the set (posed at t), the cut, the attention, the camera, the shot's custom code
    at(t, camera) {
      const s = shotOf(t);
      set.at?.(t);
      set.cut?.at(t);
      ghost?.at(t);
      if (camera) placeAt(camera, t);
      custom[s.custom]?.at?.(t, s);
      return s;
    },
    // draw(ctx, t, camera): the band, then labels and dims under it, then the caption; layoutFrame stays the caller's, last
    draw(ctx, t, camera) {
      const s = shotOf(t), top = s.band ? textBand(ctx, s.band, { format }).box.y1 : undefined;
      for (const it of s.items) {
        if (t + 1e-9 < it.at) continue;
        if (it.kind === "label") pinLabel(ctx, { at: it.anchor(), camera, text: it.text }, { format, top, ...(pill ? { pill } : {}) });
        else dimension(ctx, it.D.a, it.D.b, { camera, text: it.text, top, format, ...(it.d.dir ? { dir: new THREE.Vector3(...it.d.dir) } : {}) });
      }
      if (captions) drawCaption(ctx, t, captions, { format, accent, pill: !!pill });
      custom[s.custom]?.draw?.(ctx, t, camera, s);
      return s;
    },
  };
}
