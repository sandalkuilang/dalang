# isometric-world kit: the whole API a builder needs

Read this, `SPEC.md` and the templates. Never print the engine's sources: every signature is here. Times are absolute
narration seconds from cues; lengths in metres, z up; the frame is 1080 × 1920 (16:9: 1920 × 1080, pass W, H). Every
value is a pure function of t on the template's GSAP timeline: never CSS keyframes, `requestAnimationFrame` or a timer.

**Already written by `scaffold.mjs`:** the engine in `assets/`, the host `src/index.tpl.html` (fonts and captions
included), each group's `src/compositions/<group>.tpl.html` and the shared `assets/world.js`. Never copy, rewrite or
search the disk for them.

## The world (`assets/world.js`, `build.js`)
One world for the whole film: `assets/world.js` exports `COLORS` (the SPEC palette, one base per material), `WORLD` (the
`build()` specs of every object any group shows) and `VALUES` (the resting value of every key a spec names). The first
group's builder fills it once from `SPEC.md` OBJECTS, first of all its work (one Write over the stub, its `STUB` line
gone: the other groups wait on that line before a snapshot), furnished and true: 6+ set props per place, each object
by the parts that make it known, each person a `figure`; every group imports it and never copies,
redraws or edits it (a missing object goes in the report). A group's `values(t)` returns `{ ...VALUES, key: … }` for
the keys it animates.
**Prove the world** once it is written: `node <skill>/scripts/iso_audit.mjs . --ground <slab>` (0 clean; 3 names a part
that floats, two objects drawing through each other, a pipe through a solid or ending in mid-air; 2 WARN, rerun). Every
part rests on another part down to the ground (feet, brackets, a base, never a gap); objects touch, never sink into each
other; a pipe or cable ends on a port and runs beside structure, held by brackets; fix the geometry, never nudge it by eye.
`PINS` (world.js) lists the part names overlays label: each unique, each seen by the camera (`--cut 1` for a cutaway
beat). Overlays anchor to `PIN.<part>` (the template fills `PIN` from `build()` every frame), never to typed numbers
(`lint_scene.mjs` flags them). The hero spec carries `hero: true` and needs 15+ parts. `triad(hex)` (`palette.js`) gives a
part three readable faces at any base: `color: triad(COLORS.subject)`.
`build(iso, spec, { values, cut, focus, models })` → `{ at: { part: [x, y, z] } }` (pin points).
- `spec = { at: [x, y, z], rot (quarter turns), scale, color, focus, cut, parts: [part, …] }`
- `part = { name, form, at: [x, y, z] (base centre), color, turn (rad about z), skin: [dx, dy, dz] | true (slides off with
  cut), group (focus key), array: { count, step: [dx, dy, dz] }, …the form's fields }`
- forms: `box { w, d, h }` · `cyl { r, h, axis }` · `cone { r, h }` · `sphere { r }` · `roof { w, d, h, ridge }` ·
  `lathe { profile: [[r, z], …] }` (anything turned) · `extrude { outline: [[u, v], …], h, plane }` · `sweep { path, r }`
  (pipes, roads) · `gear { teeth, module, width, mesh: { with, phase } }` · `wheel { r, width, axis }` ·
  `board { w, d, layers: [{ h, color }] }` · `figure { h, pose: stand|walk|point|carry, phase, face }` ·
  `model { model, size, max }` · `flat { outline }` · `line { path, width, dash }` · `group { parts }`
- Any number may name a key of `values` (`h: "level"`): `values(t)` returns them, pure in t. `focus` greys all but that
  group; `cut` 0–1 slides every `skin` off (cutaway).
- A ready CC0 model: `const m = await loadModel(url)` (`model.js`, before the timeline), `build(iso, spec, { models: { name: m } })`
  and a part `{ form: "model", model: "name", size }`.

## Camera and depth
- The template's `OPEN` and `CLOSE` poses are `SPEC.md` CAMERA's numbers for this group (OPEN = the previous group's
  CLOSE), so seams match. `camAt(t, [{ t, x, y, z, k, ease }])` keyed poses (k = px per metre; ease `inOut | out | in | linear | expo`);
  **a move goes one way**: keys that travel right then left (or back) with no hold ≥ 0.5 s between throw, so turn back
  only after a held key or a cut. **No handheld, ever:** the camera's life is the template's slow orbit, one direction
  for the whole film (`ORBIT = filmOrbit(1)` right or `filmOrbit(-1)` left, from SPEC CAMERA, the same in every group).
  `filmOrbit` locks it: an `orbit25` against it (a shot's arrive-and-orbit included) throws, so `to: -1` is only for a
  film that orbits left.
- 2.5D moves (`cinema.js`, `{ rest, start, dur, ease }`; on 9:16 pass `width: 1080, height: 1920`): `orbit25(t, { rest,
  sweep })` → hand `o.rest` to drawLayers; `crane25(t, { rest, rise })`; `dollyZoom25(t, { rest, strength })` → `{ cam,
  dolly }`; `drone25(t, { rest, from })`. A zoom that lands on a subject hands over to a slow orbit: `orbit25(t, { rest: landing,
  start: landingTime, dur, from: 0, to: 1 })` (`to: ORBIT`, the film's direction; `crane25` for up or down). An orbit is one
  direction for its whole run, `from` → `to`: never two orbits back and forth, never a sine on the rest pose.
  `whip(t, t0, dur, a, b)` → `{ cam, blur }` with `motionBlur(cv, bf, draw, t, { samples: 16 })`.
- `drawLayers(iso, cam, rest, [{ depth, draw(iso), blur? }], { focus, aperture, dolly, haze: { color, amount } })`:
  depth 1 the subject, 0.2–0.5 far, 1.3–1.6 near; `aperture` × |depth − focus| px of blur (rack focus: animate focus);
  `...bokeh(fstop, { focus, mm })` gives `{ focus, aperture }`: a wide f5.6, a zoom-in f1.2–2.8.
  `focusRing(cv, bf, { cx, cy, fstop, clear, amount })` on the finished frame (before `fin.apply`) blurs everything around a spot and keeps the
  centre clear: the edges of an arriving zoom, or the one part the narration names. `amount: hold(t, t0, t1, t2, t3)` fades it in and out.
- Finish (`fin = makeFinish(W, H)`, in the template): `fin.apply(canvas, tAbs, { grade: { contrast, saturate, warmth }, bloom, sweep, vignette, grain, bars, fps })`.

## Drawing beside build()
The template makes `iso = new Iso(ctx, W, H)` (`iso.cam = { x, y, z, k }`). `iso.P(x, y, z)` → `[px, py]`; `tri(hex)` → three tones; `iso.box/cyl/cone/sphere/roof(x, y, z, …, tri(c))`,
`iso.flat(pts, z, c)`, `iso.line3(pts, c, lw)`, `iso.text3(str, x, y, z)`, then `iso.flush()` (drawLayers flushes each layer). Eases: `ss`, `eo`, `eio`, `back`;
`seg(t, a, b)` 0–1 between two times; `clamp`, `lerp`.

## Overlays (`editorial.js`)
`makeOverlay(root, { prefix, G0, accent, ink, fonts: { display, body, mono }, illustration })`, then per frame
`ov.update(tLocal, project)`; anchors are world points (`at: () => [x, y, z]`, the template's `project`).
`ov.headline({ kicker, text: "Sentence [accent]", from, to })` · `ov.card({ label, rows: [{ k, v, hi }], source, from, to,
top, left, width })` · `ov.tags([{ title, value, sub, x }], { from, to })` · `ov.pill({ text, at, offset: [dx, dy], from,
to })` · `ov.big({ text, at, offset, from, to })` · `ov.chip({ from, to })`. Cues: `b("beat")`, `w("word", n)` (0-based
occurrence), `we(...)` its end. A chart the overlay set lacks: inline SVG in the group, driven in the same `onUpdate`.

## The frame (9:16)
The subject and its action between y 345 and 1150 at its key moments, ≥ 1/3 of the height; headline from y ~110; captions
below 1180.
