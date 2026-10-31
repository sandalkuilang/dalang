# Hero asset: from 2D pictures to a 3D model, once

The user brings pictures (photos, a cutaway diagram, a manual page, a sketch), never a 3D model. The hero (the thing the film is about, seen close and opened up: a pump, a hub, a lock, a valve) is built **code-first** by default: `engine/three/parts.js` (gear, spring, lathe, rod) and three.js primitives in real units, posed by the film's `drive.js` model, from 2–3 pictures (outside from two sides, the inside). **Blender** (a Python script from `engine/blender/parts.py`, kept in the owner's library `<videos folder>/library/hero/<name>/`, outside the skill) only when the hero's look depends on curved or organic surfaces three.js primitives cannot carry (a moulded casing with fillets, a boolean-cut shell, a soft body); the Brief logs which, in one line. For a Blender hero, look in the library first: an asset that exists is reused (its `.py`, its clip page), never
modelled again; a missing part of it (a second unit, an inside) is added to it from new pictures. Supporting objects
take the cheaper routes (`visual-direction.md` §1.1).

Blender (GPL) is a tool on the machine, never shipped. Missing (preflight's Blender row): `brief.md` Call 0 asks (size,
licence), never installed on its own; declined, the hero falls back to a CC0 model or a three.js build, logged.

## 1. Read the pictures

- 3–5 pictures (the user's first, then `find_media.mjs --type image`): the outside from two sides, the inside (cutaway,
  exploded view, teardown), a part list when one exists.
- Too few pictures of the outside or the inside: the same one-time ask as Express (`express.md` Anatomy strand: the prompt,
  `refs/anatomy-gen-*.png`, the user runs it in their own tool). A generated picture is `fidelity: inspired` at most: never
  traced as an outline (`silhouette_iou.mjs`), never the source of a part, never in the film.
- Write `review/hero-<name>.md`: every part and its count, what is inside or touches what, materials and colours, real
  sizes. Sizes come from a stated dimension, a part standard or a cited spec, tagged like script numbers (`[src]`,
  `[calc]`, `[assume]`); a side no picture shows is built as such things are built, marked `[assume]`.
- Shape from the pictures, never their pixels: no picture, logo, decal or text is projected, baked or textured onto
  the model; the outline of a picture the user gave is traced as measurement data (next section).

### The user supplies reference images

The user's pictures are the shape to match, not inspiration. `BRIEF.md` says `fidelity: exact` (the Brief's default
when pictures are given) or `inspired` (proportions only, no IoU).
- **Views:** an orthographic or blueprint view first, else the photo closest to side, front or top; each is a `refs` row
  of `review/hero-shots.json` (`name`, `image` under the film folder, `az`, `el`, and `ortho: true` or the photo's
  estimated `mm` and `dist`, tagged `[assume]` in the parts sheet).
- **Outline and scale:** the picture's subject mask (`scripts/silhouette_iou.mjs`: what differs from the border colour,
  or the alpha) is the outline to build to, scaled from one real dimension. A busy background gives no mask: ask the
  user for a picture on a plain background, never guess the outline.
- **Surfaces:** curved surfaces as curves plus subdivision (or an equally smooth method), never flat panels standing in
  for a curve.
- **Measured:** `measure.py` renders the hero's mask from each ref's camera and compares it (one uniform scale, so a
  wrong proportion shows): IoU, aspect difference, the worst ninth of the outline; a view under its threshold (starting
  values 0.85 photo, 0.92 ortho, `--photo` / `--ortho-min`) adds to phi. Overlays: `review/silhouette/<name>-overlay.png`
  (picture red, render blue).
- **Shown early:** the overlays go to the user before style frames start (`SendUserFile` where the host has it, else
  their paths in one line), so the shape is confirmed before anything is styled.
- **Method, not polish:** a view still under its threshold after two rounds questions the method (base mesh, curves
  vs panels, which picture is the side view) in the next brief; no material, light or focus round comes first.

## 2. Model it by script

- Library first: `engine/blender/parts.py` (the `MB` mesh builder and path helpers; axial fans, motors, a cuttable
  `housing` whose `cut=True` exports a `.quarter`, pipes with bends, wires and fasteners, in real units). A part the
  film needs and the library lacks is added there, generic, named by what it is.
- The assembly is `<videos folder>/library/hero/<name>/<name>.py` (the owner's library, outside the skill; it imports `parts.py`
  from `<skill-dir>/engine/blender`, `DALANG_BLENDER` overrides): dotted node names (`pump.impeller`, `hub.pawl`), a moving
  part's origin on its axis, a `.quarter` of each part the section cuts. Real counts (fins, teeth, blades, screws),
  rounded sheet edges, true wall thickness on the cut.
- Build: `Blender -b -P <videos folder>/library/hero/<name>/<name>.py -- <out dir>` writes `<name>.glb`; `node
  tests/blender-parts.mjs` checks the scripts (and builds them where Blender is installed).

## 3. Shot-led acceptance: measured first, then judged

The hero is built for the film's shots, so it starts from them. Its §1 (pictures, parts, sizes) runs beside the
planner; modelling waits for the planner's `review/hero-shots.json`: one row per storyboard shot that shows the hero,
with the film's camera (`side` = the storyboard's view word, `keys` [{ `az`, `el`, `mm`, `dist`, `hold` }]; az 0 = the
asset's `front`, 90 its left; lens on a 24 mm vertical sensor as three.js `fovFromMm`), the `focal` parts (node-name
prefixes; each object under one is an instance), `soft` (the defocused foreground the storyboard names: a real lens
sees past it, so it counts half as an occluder), the `states` and `need` (`instances`, `minPx` at full frame,
`visible`, `cap` for a `cut` row, `move` in px across the states, `contrast` in L* against the part holding it). `node <skill-dir>/scripts/hero_shots.mjs .` checks
it against `storyboard.md` (exit 1 names the row).

- **Measure in the build:** the asset script ends with `measure.measure_from_env(set_state)` (`engine/blender/measure.py`)
  and is run with `DALANG_MEASURE=<film>/review/hero-shots.json`: a flat object-ID pass per row, key and state (seconds,
  no image read) writes `review/hero-measure.md` and `.json`: per row the readable instances, min px, visible share,
  section-cap share, move and base-colour contrast, a phi per row and in total (0 = every shot reads); a focal name that
  matches no object fails by name. The asset script's hooks: `set_state(name)` poses a state, `set_cut(deg)` turns the
  section plane about the focal's axis (0 = as built; lets explore try cuts), section faces use a material named `cap`
  or `*_cap`, instances are dotted names (`part.roller.1`). A library asset without the hooks gets them on its first
  reuse, before its shots are measured.
- **The builder loops on phi inside its job:** build, measure, fix the failing rows, measure again, while phi falls.
  `MEASURE STALL` (two runs that did not lower it) or the turn budget ends the loop: report the open rows. What may
  change to pass: framing inside the shot's size class, the cut (where and which plane: a section shows only when its
  face turns toward the camera), colour from the SPEC palette or the one highlight. Never a `[src]` size or a count:
  their asserts stay, and a pass that breaks one is a fail.
- **A failing row is classified by its explore line**, never by opinion: `legal` (a camera within az ± 15°, el ± 10°,
  or a turned cut, passes: use it), `decision` (only another side passes: the builder stops on that row and reports it; the main agent
  decides the storyboard camera and the planner edits it and `hero-shots.json`), `model` (no camera passes: the part or
  the cut is wrong).
### The hero check, fix rounds, escalation

- **Then one contact sheet** of the hold keys only (`strips.mjs --frames`), read once, for what numbers cannot see.
- **The hero check** (a fresh `dalang-checker`, after a measure PASS) reads `hero-measure.md` first and never re-judges a
  measured line. With `fidelity: exact` it reports each ref view's IoU first; a side-by-side alone never passes, and a
  view under its threshold is P0 "shape", fixed before any material, light or focus item. Its rubric: shape, parts, counts and placement against the pictures and `review/hero-<name>.md`;
  surface only as the SPEC look shows it (the film renders the GLB in three.js: Blender material tricks and beauty
  renders are not judged; stylized, never hyperreal). Each finding names the still, the shot row and the picture or
  hero line it contradicts; one that names none is P2 at most. From round 2 it re-judges only the open items and the
  rows the fix touched; a new P0 only for a regression or a wrong part, never a new P2 that reopens a round.
- **Fix rounds:** one builder per round with every finding of that round, never split by area; all rows measured every
  build (cheap), stills re-rendered only for the rows the fix touched.
- **Escalation stops at top · high.** A P0 that survives a round at top · high is classified (its explore line, or
  "taste" when no number covers it): `decision` goes to the main agent, `model` gets one more round with the explore
  line in its brief, "taste" is logged and left (as material effects, `looks.md`). Never xhigh or max on its own.

## 4. The motion recipe

The clip page (`<name>.clip.html` beside the assembly, copied from `engine/blender/templates/hero.clip.tpl.html` and filled in its data block) is a HyperFrames
composition on a paused timeline, every value a pure function of t:

- **Look:** the iso look (`isoLook`, `inkLines`) with a graded 3-tone matcap and thin ambient occlusion. Colour only as
  code (hot/cold, flow/return, the explained part); context in calm greys, never transparency.
- **Camera:** iso pan and zoom between a wide, a medium and a close station (`isoFrame`), never a tilt; the subject
  turns slowly one way. The close keeps repeated detail (fins, threads) above a few pixels per element.
- **Opening it:** the shell as blue x-ray glass fading on the way in; the section opened by one clip plane sweeping in
  from the camera side across the front parts and `.quarter` pieces, never by fading opacity.
- **Mechanism:** each moving part from its cause (a rotor from its rpm, a piston from its stroke rate). A fast rotor is
  one radial-gradient blur disc over faint blades. A fluid's path is coded along the whole loop, pulses at the
  driving rate.
- **Detail focus (the agent decides):** depth of field on a detail beat only: the close station or a macro insert on one
  part (a rotor, a fastener, a section face) that the wide would lose; never on the wide. One window per beat: ease in
  about 0.35 s, hold on the spoken word, ease out; `bokeh` 1–3; focus on the node being
  explained, `range` the depth kept sharp around it, at least the detail's own depth (world units). Data block: `detail:
  [{ from, to, node, bokeh, range }]` (postprocessing's `DepthOfFieldEffect` on the composer, as `studio()`). The pins
  stay sharp (2D, after the composer).
- **Pins:** numbered on leader lines, short generic labels, entering on their beat, inside the frame.
- **Trap:** `EffectComposer` turns `renderer.autoClear` off: clear by hand before `composer.render()`, or the last
  frame shows through.
- **Check cheaply:** `npx hyperframes snapshot --at <times>` before any render.
