# isometric-world kit: the whole API a builder needs

Every signature is here: never print the engine's sources. Times are absolute narration seconds from cues; lengths in
metres, z up; the frame is 1080 × 1920 (16:9: 1920 × 1080, pass W, H). Every value is a pure function of t on the
template's GSAP timeline: never CSS keyframes, `requestAnimationFrame` or a timer. `scaffold.mjs` already wrote the
engine in `assets/`, the host, each group's template and `assets/world.js`: never copy, rewrite or search for them.

## The world (`assets/world.js`, `build.js`)
- `world.js` exports `COLORS` (SPEC palette, one base per material), `WORLD` (every object's `build()` spec), `VALUES`
  (resting value of every key a spec names) and `PINS` (part names overlays label, each unique and seen by the camera).
- The first group's builder fills it once from SPEC OBJECTS, first of all (one Write over the stub; the `STUB` line
  gone releases the other groups): 6+ props per place, each object by its telling parts, people as `figure`, the hero
  `hero: true` with 15+ parts. Other groups import it and never copy or edit it (a missing object goes in the report).
- Prove it: `node <skill>/scripts/iso_audit.mjs . --ground <slab>` (0 clean; 3 names a floating part, objects
  through each other, a pipe through a solid or ending in air; 2 WARN, rerun; `--cut 1` for a cutaway beat). Fix the
  geometry, never nudge by eye.
- Overlays anchor to `PIN.<part>` (the template fills `PIN` from `build()` every frame), never typed numbers.
- `build(iso, spec, { values, cut, focus, models, plates })` → `{ at: { part: [x, y, z] } }`. The template builds the whole
  `WORLD` in one call (true paint order).
- `spec = { at, rot (quarter turns), scale, color, focus, cut, shadow (false for floor/wall), hero, parts }`
- `part = { name, form, at (base centre), color, turn (rad about z), skin: [dx, dy, dz] | true, group (focus key),
  array: { count, step }, …form fields }`. `color: triad(COLORS.x)` (`palette.js`) keeps three faces at any base.
- forms: `box { w, d, h, bevel }` · `cyl { r, h, axis }` · `cone { r, h }` · `sphere { r }` · `roof { w, d, h, ridge }` ·
  `lathe { profile: [[r, z], …] }` · `extrude { outline: [[u, v], …], h, plane }` · `sweep { path, r }` ·
  `gear { teeth, module, width, mesh: { with, phase } }` · `wheel { r, width, axis }` · `board { w, d, layers: [{ h, color }] }` ·
  `model { model, size, max }` · `flat { outline }` · `line { path, width, dash }` · `group { parts }` · `kit { kit, … }`
- `figure { h, pose: stand|walk|point|carry|reach|sit|crouch|kneel|wave, phase, reach: [x, y, z], reachL, seat, lean,
  look, joints, color, legs, skinTone, hair, hairStyle: short|long|bald|cap, hat: "cap", sleeves: "long", coat }`: faces +x, feet on the ground.
- **Kits first** (`kit.js`): made things from components, never bare boxes; parts named under the kit part (`front.rim`);
  face components stand in xz facing +y (`face: "x"` faces +x). `bolt { r }` `rivets { count, step }` · `panel { w, h,
  seams, screws }` `vent { w, h, slots }` `grille { w, h }` `screen { w, h, glow }` `button { r }` `knob { r }` `led`
  `handle { w }` `label { w, h }` `hinge { h }` · `pipe { path, r, flanges }` `hose { path, r }` `cable { path }` ·
  `tyre { r, width, axis, spokes, tread, spin }` `spring { r, h, turns }` `fins { w, d, h, count, round }` · `bottle`
  `drum` `pan { fill, level }` `can` `crate` `carton` · `window` `door` `table` `chair` `shelf` `plant` `lamp` ·
  `wrench` `screwdriver` `funnel` `cone`. Sizes and colours are fields.
- **Templates** (`form: "kit"`, facing +x, one rigid assembly: place, never rebuild): `car { style: sedan|hatch|van, color,
  spin, lit }` · `room { w, d, h, window, door }` (`shadow: false`) · `appliance { kind: fridge|washer|server }` ·
  `tree { h, kind: round|pine }`. Anything else is assembled from kits and forms, part by part.
- **The user's own thing** (`plate.js`, loaded by the template's `loadPlates(WORLD)`): `plate { plate: "<name>", w, d,
  spin: { part: "<value>" }, spread: { part: "<value>" } (blurred disc), tint: { select: { color, amount } }, flows:
  [{ path: [[fx, fy], …], color, width, at, on }], marks: { name: [fx, fy] } }`; paths are photo fractions; pins
  `<part>.<layer>`, `<part>.<mark>`.
- Any number may name a `values` key (`h: "level"`); `values(t)` returns `{ ...VALUES, key: … }`. `focus` greys all but
  that group; `cut` 0–1 slides every `skin` off.
- CC0 model: `const m = await loadModel(url)` (`model.js`, before the timeline), `build(…, { models: { name: m } })`,
  part `{ form: "model", model: "name", size }`.

## Camera and depth
- `OPEN`/`CLOSE` are SPEC CAMERA's poses for this group (OPEN = previous group's CLOSE). `camAt(t, [{ t, x, y, z, k,
  ease }])`, k px per metre, ease `inOut | out | in | linear | expo`. A move goes one way: travel back with no ≥ 0.5 s
  hold between throws.
- No handheld: the template's slow orbit, one direction for the film (`ORBIT = filmOrbit(1)` or `filmOrbit(-1)`, from
  SPEC CAMERA); an `orbit25` against it throws.
- `cinema.js` moves (`{ rest, start, dur, ease }`; 9:16 pass `width: 1080, height: 1920`): `orbit25(t, { rest, sweep,
  from, to })` → `.rest` to drawLayers; `crane25(t, { rest, rise })`; `dollyZoom25(t, { rest, strength })` → `{ cam,
  dolly }`; `drone25(t, { rest, from })`. A zoom landing hands over to `orbit25(t, { rest: landing, start, dur, from: 0,
  to: ORBIT })`. Never orbits back and forth, never a sine on the rest pose.
- `whip(t, t0, dur, a, b)` → `{ cam, blur }` with `motionBlur(cv, bf, draw, t, { samples: 16 })`.
- `drawLayers(iso, cam, rest, [{ depth, draw(iso), blur? }], { focus, aperture, dolly, haze: { color, amount } })`:
  depth 1 subject, 0.2–0.5 far, 1.3–1.6 near; blur = `aperture` × |depth − focus|; `...bokeh(fstop, { focus, mm })`
  (wide f5.6, zoom-in f1.2–2.8). `focusRing(cv, bf, { cx, cy, fstop, clear, amount: hold(t, t0, t1, t2, t3) })` before
  `fin.apply`.
- `fin = makeFinish(W, H)`; `fin.apply(canvas, tAbs, { grade: { contrast, saturate, warmth }, bloom, sweep, vignette, grain, bars, fps })`.

## Drawing beside build()
`iso = new Iso(ctx, W, H)`, `iso.P(x, y, z)` → `[px, py]`; `tri(hex)` three tones; `iso.box/cyl/cone/sphere/roof(x, y,
z, …, tri(c))`, `iso.flat(pts, z, c)`, `iso.line3(pts, c, lw)`, `iso.text3(str, x, y, z)`, `iso.flush()` (drawLayers
flushes each layer). Eases `ss`, `eo`, `eio`, `back`; `seg(t, a, b)` 0–1 between two times; `clamp`, `lerp`. Every
solid is inked for you: detail comes from parts, never extra outlines.

## Overlays (`editorial.js`)
`makeOverlay(root, { prefix, G0, accent, ink })`, per frame
`ov.update(tLocal, project)`. `ov.headline({ kicker, text: "Sentence [accent]", from, to })` (over the top glass: a frosted band, the top 27 %, fading down; a bottom one, 17 %, fading up, is always on) · `ov.card({ label,
rows: [{ k, v, hi }], source, from, to, top, left, width })` · `ov.tags([{ title, value, sub, x }], { from, to })` ·
`ov.pill({ text, at, offset: [dx, dy], from, to })` · `ov.big({ text, at, offset, from, to })`.
Cues: `b("beat")`, `w("word", n)` (0-based occurrence), `we(...)` its end. A chart the overlays lack: inline SVG in the
group, driven in the same `onUpdate`.

## The frame (9:16)
Subject and action between y 345 and 1150, ≥ 1/3 of the height at key moments; headline from y ~110; captions below 1180.
