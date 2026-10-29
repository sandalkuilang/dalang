# DALANG three.js engine

Studio's generic 3D systems, one line per export. Inputs are parameters in real units (metres, SI), presets are passed
in by the set, every motion is a pure function of t from its cause (no physics, no bake). The hero is a Blender asset
(`engine/blender`), a CC0 model or simple primitives. Rules behind the numbers: `references/looks.md`,
`references/camera-motion.md` §5.

## Install

```bash
node <skill-dir>/engine/three/build.mjs <project>/assets      # modules, iso's cinema.js + parallax.js, three-vendor.js
node <skill-dir>/engine/three/selfcheck.mjs <project>/assets  # fails loudly when a known trap is back
```

The build writes `assets/.engine.json` (origin and licence of every file; `check_assets.mjs` reads it, so never list
these in `ASSETS.json`). Import everything from `assets/` so all modules share one `THREE`. A subject the engine lacks
is built the same way (its law and cited numbers, real-unit parameters, its trap in `selfcheck.mjs`), then added here.

## Modules

**kit.js**
- `makeKit(scene, { mpu, palette, kinds, gravity })`: the scale and place; `M` metres per unit, `G` gravity in units/s² (9.81 m/s² default); tolerances are in metres, so any scale works.
- `model(path, { palette, kinds, real, crease })`: loads `.glb`/`.obj` (Draco OK), dresses materials by name (`kinds` RegExps: `cloth`, `wood`, `wall`, `metal`, `glass`, `glow`, `soft` subdivided; unmapped stay as they came); a found model's `palette`/`kinds` never leak into the kit; `real = { h, w, d }` m is checked by `scaleAudit`; `crease: false` keeps its normals.
- `box`, `cyl`, `tube` (cables kept off the floor), `mat`, `cloth`, `canvasTex`, `group`, `paint`, `screenOn(model, material, picture)`.
- `rest(o)` then `settle()`: drops props onto first contact; returns what could not be placed (nothing below, or > 3 cm inside something).

**font.js**: the one typeface of every film, `FAMILY` (Kohinoor Bangla if installed, else Helvetica), `WEIGHT` by role (title 700, heading 600, sub 500, body 400), `font(role, px)` for a canvas, `FACES` (the host's `@font-face`); no module or film names another family.

**type.js** (2D canvas, imports only font.js; call after the finisher, it reads the ground)
- `readTime(text)`: least on-screen time (0.5 s + 0.3 s/word + 0.15 s/CJK char, ≥ 1 s).
- `phrases(narrationTxt, words)` → caption phrases by `craft-rules.md` §5 (`scripts/captions.mjs` writes `audio/captions.js`).
- `drawCaption(ctx, t, caps, { format, accent, pill })`: in the format's caption zone, ink chosen per frame from the luminance under it, spoken word boxed; shrinks (`shrunk`) rather than leave the zone.
- `pinLabel(ctx, { at, camera, text }, { format, side, pill, top })`: label + leader, flipped/clamped into the label zone, ≥ 36 px; `null` when behind camera or off frame.
- `textBand(ctx, { kicker, headline, tag }, { format, size, scrim })`: kicker ≥ 36 px, headline 64–96 px (required) → `{ box, kicker, headline: { box, lines, size, shrunk }, tag }`.
- `rangeBar(ctx, { value, max, ticks, label }, { format, x, y, w, size, accent, highlight })`: range card (`visual-direction.md` §13) → `{ fill, fits (-1: none fits), ticks, … }`.
- `recordBox(kind, text, box, size)`, `repeats(caps, labels)` (caption repeats a label), `safeArea`, `luminance`, `inkFor`.
- `layoutFrame(ctx, t, { format, hero })`: call LAST in the frame; sets `globalThis.__dalangLayout` and posts the boxes to `strips.mjs` (127.0.0.1:47614) for `layout_lint.mjs`.

**quantity.js** (`visual-direction.md` §13; nothing adds itself to the scene)
- `flowArrow({ from, to, value, scale, normal, color, head })`: shaft `value × scale` m wide (one scale per film) → `{ group, mesh, anchor, reveal(u), … }`.
- `tileFill({ at, w, d, cell, color, gap, lift })`: floor area in cells → `show(n)`, `area(n)` m², `edges.w/d`.
- `dimension(ctx, a, b, { camera, text, dir, gap, off, over, size, top })`: drafting dimension on the frame; draws NOTHING and returns `{ drawn: false, why }` when it cannot stay in the label zone.

**circuit.js** (every `at(t)` from the numbers model; nothing adds itself to the scene)
- `wire(path, { kind: trace|wire|busbar, radius, color, normal })` → `length`, `pointAt(s)`, `frameAt(s)` (s in m).
- `flow(wire, { current, waveform: ac|dc|pwm|3phase, freq, speed, timeScale, fps, duty, full, width, perAmp, … })`: pulses at a visualisation `speed`; shown freq above `fps/4` is refused (`/alias/`): slow it with `timeScale` and show `label`.
- `glow(mesh, { power | temperature, area, emissivity, … })`: black-body colour (`blackbody(T)`, nothing under `DRAPER` 798 K); `power` gives steady state only, a part with mass needs `temperature(t)`.
- `lamp(light, { rated: { V, lm } | curve, voltage, type, cct })`: candela follows voltage by `LAMPS` curves; a type without a curve is refused.
- `arc(kit, { from, to, t0, dur, energy, efficacy, timeScale, fps, … })`: seeded discharge with sparks; `energy`/`efficacy` have no default; an arc under one frame is refused (`/frame/`).

**instruments.js** (2D canvas or a CanvasTexture; `units` and `label` required; unreadable values show `--`, never 0)
- `scope(ctx, { signal, t, window, range, units, label, x, y, w, h, divisions, timeScale })`, `meter(ctx, { value, units, label, digits, x, y, size })`, `gauge(ctx, { value, min, max, units, label, sweep, x, y, r })`, `bar(ctx, { value, max, units, label, x, y, w, h })`.

**fields.js** (SI units; a zero or non-finite strength is refused)
- Sources: `charge(q, at)`, `dipole(p, at, { d })`, `straightWire(I, a, b)`, `loop(I, { at, normal, R })`, `barMagnet({ at, axis, length, width, depth, Br })` (`Br` has no default: cite it).
- `field(sources)` (mixing E and B refused), `trace(F, seed, opts)` (RK4, metres), `seeds`, `fieldLines(F, { count, mode: teach|world, … })` (equal-flux seeding: line density is strength; hand-picked `seeds` show direction only) → `{ group, reveal(u), at(t) }`.
- `filings(F, { at, w, d, count })`, `compass(F, { at, r, … })` → `at(t).angle` (cached integration, pure in t).

**optics.js** (rays in METRES; materials need a `source`)
- `MATERIALS` (`air`, `water`, `bk7`, `fusedSilica`), `material({ n | sellmeier, source })`, `WAVELENGTHS`, `wavelengthColor`, `snell`, `fresnel`, `reflect`.
- Elements: `interface({ at, normal, below, above })`, `lens({ at, axis, R1, R2, thickness, diameter, material })` (`focal`, `bfd`, `thin`), `mirror`, `prism`, `surfaceFromMesh(mesh, { inside, outside })` (closed, outward-wound); elements must not overlap.
- `traceRay(elements, { origin, dir, λ, power, … })`, `bundle(elements, { source, wavelengths })` → `image(λ)` (focal length for `numbers.json`), `apparent(point, eye, surface)`.
- `drawRays(result, { mode: teach|world, dust })` (`world` needs `dust`), `caustic(bundle, { surface, base })`.

**air.js** — `jet({ frame, D, u0 })`: a turbulent round jet; `frame(t, outlet, axis)`, `wind(p, t, out)`, `block(objects)`.

**grains.js** — `grains(k, { preset, at, radius | width, depth, height, cut, instances })`: static bulk fill (`presets`), whole grains at the cutaway face; `instances: false` under ~3 px. Never a pour.

**finish.js** — `makeFinisher(canvas, { grain, edge, fps })`: `layer(gl, i)` motion-blur sub-frames, `grade(t)`.

**studio.js**
- Iso looks (`looks.md`): `isoLook(root)` one matcap per material (run before `cutaway()` and `attend()`), `isoMatcap`, `isoTone`, `ISO_TONES`; `blueprintLook(root, { bg })`; `inkLines(root, { color, angle, opacity })` (after `cutaway()`); `isoStudio(renderer, scene, camera, { route, ground, finish, stencil })` → `{ render(t, pose), frame(t, pose) }` (no lights, finish = `cinema.js` `makeFinish().apply`).
- `studio(renderer, scene, camera, { look, preset, route, set, dof, finish, mpu, stencil, … })` → `{ render, frame, state, … }`: the object-studio rig, never hand-written; `PRESETS` (`warm`, `window`, `overcast`), `LOOKS`; shadow refitted per pose (`fitShadow`: `set` must cover every part's travel), AO from scale (`aoFor`); throws without a stencil buffer unless `stencil: false`; `renderer: null` for Node.

**bokeh.js** — `detailFocus(scene, camera, { blur, range })` → `{ pass, focusOn(point), set({ blur, range }), blur }`: three.js's `BokehPass` as a pass of the pmndrs composer, the iso Studio lane's detail focus (a detail beat only; object-studio keeps `dofFor`, a physical lens). Put `pass` after the AO and before the last `EffectPass(SMAA)`; per frame `focusOn(the part's world centre)` and `set({ blur })` from the beat's ease. `blur` = the largest blur as a fraction of the frame width (≤ 0.015), 0 turns the pass off (the frame is byte-identical to none); `range` = world units from the focus plane at which it reaches `blur` (the detail's own depth; default 0.25 × the frame height, ortho, or × the focus distance). Traps: the stock pass assumes a perspective camera (set here from the camera: `PERSPECTIVE_CAMERA` 0 for iso) and draws depth with `overrideMaterial` (clipping planes ignored, ink lines and glass in the depth); this one keeps the section's planes and hides lines, sprites and meshes with opacity < 0.95 from the depth. Alpha stays the frame's own. Ink lines blur with the depth they sit on. One pull per beat.

**audit.js**
- `scaleAudit(root, { tol })`: against `userData.real` (world axes: a prop turned about Y swaps w/d); > 15 % off reported, undeclared props listed `unchecked`.
- `zFight(root, { cameras, bits, heightPx })`: coplanar faces closer than one depth step at any station camera, with the offset to apply.

**shots.js**
- `shots(list, { beats, words, end, fps, W, H, format, set, custom, attention, captions, accent, pill })`: one shot per storyboard row `{ name, beat, action, transition, view, newSubject, camera, cut, highlight, band, labels, dims, custom }` (a `"cut"` turns the view 60° or more, `view` in degrees, `newSubject` exempts a cut to another subject); every time is a cue (`cueTime`); bad cues, overshooting eases, overlapping moves, labels out of zone, windows under read time and shots without an action are refused before a frame is drawn. `run.at(t, camera)`, `run.draw(ctx, t, camera)`, `run.pose(t)`.

**cutaway.js**
- `cutaway(root, { normal, offset, color, hatch, flat })`: one clipping plane, stencil caps; `on(t)`, `off(t)`, `set(offset, t)`, `at(t)` per frame, `ready(renderer)` needs `stencil: true` on renderer and composer; `userData.cut = { shell } | false`; set flags before adding parts; exclude `cut.group` from `staticScene`; one cut per root. `thicken(geometry, d)`: a single surface made a closed wall for the stencil.

**camera.js**
- Iso: `isoCamera(W, H)`, `isoFrame(object, { W, H, margin })` → `{ target, k }`, `ISO`; the view pans and zooms (log), never tilts.
- `stations({ home, … })`, `frame(object, opts)`, `travel(t, from, to, { start, dur, ease, lift, over, clear })` (`over` is a Box3), `route(st, legs)` (overlapping legs throw: no hard cut), `loopEnd`, `place(camera, pose)`, `poseOf`, `heroBox(camera, object, W, H)`.
- `attend(root, { ghost, desat, dur, edge, keep })`: `focus(subjects, t)`, `release(t)`; `at(t)` after every other `at()`, before render.
- Cues: `snap`, `shotAt`, `overlayWindow`, `windowProblems`.

## Patterns (no ready pieces: each film builds its own objects from the systems above)

- One-take: `stations` (home, subject, the part inside) → `route` legs → `loopEnd` home, with `attend` focusing each beat and released ≥ 2.5 s before the end.
- A/B pair: build one set twice through one function of the variable, place the two a gap apart (Box3 to Box3), only the variable differs.

## Object-studio kit (`objectStudio.js`, `editorial.js`)

The `object-studio` look's shared set and overlay, imported unchanged by every group. Builders read
`templates/object-studio-API.md` (signatures and shot rows); extras not on the card: `makeSweep`, `lensFov`,
`canvasTex`, `clamp`, `smooth`, `withMoves`, `LIGHT`; editorial `cues`, `envelope`, `accentHtml`, `tagSwing`,
`captionAt`, `EASE`.

## Cinematic camera (object-studio only, `camera.js`)

Each returns `{ position, target, fov }` for `place()`/`studio().render()` and takes `start`, `dur`, `ease`.
`fovFromMm(mm, sensorH)`, `dofFor({ mm, fstop, focusM, mpu })` → `{ focusRange, bokehScale }`, `orbit(t, { center,
radius, from, to, elevation })`, `crane(t, { target, from, to, azimuth, distance })`, `dollyZoom(t, { target,
subjectSize, near, far })`, `drone(t, { from, to })`.

## A set's build

1. `makeKit` with the measured `mpu`; place, `rest()`, `settle()`; read what failed.
2. `userData.real` on hero props, then `scaleAudit(scene)` and `zFight(scene, { cameras })` before the first render.
3. Pose moving parts from their cause at t (tooth ratio, `G` with an eased landing and small squash, cue latches).
4. Render through the look's rig (`isoStudio` or `studio`); object-studio: 5 sub-frames through `finish.layer` when a move passes ~4 px a frame, then `grade(t)`.
