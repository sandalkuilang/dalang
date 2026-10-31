# object-studio kit: the whole API a builder needs

Every signature is here: never print the kit's sources. Times are absolute narration seconds from cues; lengths in
metres; the frame is 1080 × 1920.

## objectStudio.js
- `makeSet(canvas, { G0, G1 })` → `S`: `S.world.add(obj)` (subjects), `S.scene.add(obj)` (shadows, backdrop), `S.light()`
  after the subjects are in, `S.shots(SHOTS, set, { moves })`, `S.loop({ overlay, key, hero })` last (hero: the object measured for framing and contrast, default `S.world`), `S.project(anchor)` →
  `{ x, y, ok }` px, `S.audit(tag)`.
- `cam([x, y, z], [tx, ty, tz], mm, { dof: { fstop, focus } })` → a station. A wide: 35 mm f5.6; a zoom-in or macro:
  85 mm f1.2–2.8, focus = the camera-to-subject distance (m).
- `mat.liquid(color)`, `mat.clearPlastic()`, `mat.glass()`, `mat.chrome()`, `mat.steel()`, `mat.plastic(color)`,
  `mat.matte(color)`, `mat.haze(opacity)`.
- `mat.gloss(color = 0x141518)` dark parts (clearcoat, roughness ≥ 0.45); `mat.accent(color)` the working part, in the SPEC accent; `SWEEP` the pale studio.
- `contact([x, y, z], { w, d, opacity })` a contact shadow; `backdrop([x, y, z], { w, h, opacity })` a darker pool behind
  a pale hero; `halfLathe(profile)` the back half of a turned solid (cut-open vessels); `THREE`.
- Cues (also from editorial.js): `b("beat")`, `w("word", n)` the start of that word's occurrence n (0-based, so `w("the", 1)` is the second "the"), `we(...)` its end,
  `wc(...)` the shot-list cue `"w12"`. A missing beat or word throws.

## parts.js (code-first hero, metres)
- `gear(teeth, module, width, { helix, bore })` → geometry on +z; `userData.gear = { rp, ro, rr, … }` (pitch = module·teeth/2).
- `spring({ r, wire, turns, len })` on +y from 0; open tube: its mesh `userData.cut = { shell: wire }`.
- `lathe([[r, y], ...])` about +y; `rod([x, y, z], [x, y, z], r)` end to end.

## drive.js (one input)
- `const model = drive({ input: (t) => u, state: (u) => ({ ...poses, ...readouts }), checks: [{ name, u, got: (s) => n, want, tol }] })`; `set.at = (t) => { const s = model.at(t); ... }`; instruments read `model.input(t)` and `model.at(t)`. A failed check throws at load.

## machine.js (the film's, built once by the first group)
- exports `MODEL`, `AUDIT`, `build(mat)` → `{ root, parts }`, `pose(parts, state)`; groups: `S.world.add(root); set.at = (t) => pose(parts, MODEL.at(t))`. `drive.js` `audit(model, { u, rigid, mesh, gaps })`; `scripts/machine_audit.mjs .` proves it.

## instruments.js (live panels, drawn after the finisher)
- `instrumentTheme("light", { accent })` once; `chart(ctx, { curve, domain, range, u, units, uUnits, label, x, y, w, h })`, `gauge`, `meter`, `bar`, `scope`.

## A shot row (`S.shots(SHOTS, set, { moves })`)
`{ name, beat, action, transition, camera, cut?, highlight? }`
- `beat`: a cue string (`"intro"`, `wc("Then")`); the shot ends where the next starts.
- `action`: one of `set.actions` (the subject acts in every shot).
- `transition`: `"cut"` or `"travel"`.
- `camera`: `[{ station }, { station, at, arrive, ease, lift: 0 }]`, station names a key of `set.stations`; `ease`
  `"inOut" | "linear" | "in" | "out"`.
- `cut`: true / false opens / closes `set.cut`; `highlight`: [part names] ghosts the rest.
- `set`: `{ stations, parts, actions, at(t) }`: `at(t)` poses every part from t (pure, no state).
- `moves`: `[{ from, to, pose(t) }]` (seconds): inside the window the camera follows `pose(t)` → `{ position, target, fov }`,
  e.g. camera.js `dollyZoom`, `orbit`, `crane`, `drone`.

## editorial.js
`const ov = makeOverlay(hostEl, { prefix, G0 })`, then:
- `ov.headline({ kicker, text: "Sentence [accent]", from, to })` over the top glass (a frosted gradient band, the top 27 % of the frame fading downward, shown with the headline)
- `ov.card({ label, rows: [{ k, v, hi }], source, from, to, top, left, width })` (or `value` and `sub`; `source` required)
- `ov.tags([{ title, value, sub, x }], { from, to, len })` hanging A-vs-B tags
- `ov.pill({ text, at: () => anchorObject3D, offset: [dx, dy], from, to })` a label with a leader line
- `ov.big({ text, at, offset, from, to })` a number by a part
- Host captions: `captions(el, window.CAPTIONS, { prefix: "cap" })` → `{ update(tAbs) }`.

## The frame (9:16)
Subject and its action between y 345 and 1150; headline from y ~110; cards beside the subject; captions below 1180.
`express.mjs assemble` measures every shot and fails on these, under your group:
- the hero box under 60 % of the frame on its larger axis: move in or take a longer lens;
- the hero's pixels reaching a frame edge while it fills less than 65 % of both axes (a close-up fills 65 % of one): frame it whole;
- a caption covering more than 10 % of its own box with the hero's pixels, on a hero that is not a close-up (labels and cards pinned to a part sit on it by design): move the text;
- the hero under 12 ΔE* against the ground around it: a `backdrop()` behind a pale hero, or a darker material.

Express measures with the kit's own text sizes (captions 46 px, smallest label 22 px). The hero is the visible meshes under `S.world`, minus anything with `userData.attend = false` or `userData.subject = false` on it or a parent. Mark what the film shows but is not its subject (a mounting board, wall pieces, a floor) `subject = false`: it stays in the picture, ghosts and cuts like any part, but leaves the measured box and contrast. Or name the subject with `loop({ hero })`. When a line says the box is too large, `review/measure/layout.json` names the parts that drive it (`hero.parts`: parent chain and projected size), and the lint line names the largest.
