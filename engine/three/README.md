# DALANG three.js engine

Generic 3D systems proven on real renders: real scale and placement, true surfaces, simulated physics, cloth, air,
plants, particles, granular fills, water, fur, and the frame finish; plus a small catalogue of ready pieces built on them. Nothing
here knows a scene or a topic: every input is a parameter in real units, every preset (a kit's material names, a
palette, a particle kind) is passed in by the set. The rules behind every number
are in `references/looks.md` (true shapes and surfaces) and `references/camera-motion.md` §5 (physics, air, sound).

## Install into a video project

```bash
node <skill-dir>/engine/three/build.mjs <project>/assets
```

The build also writes `<project>/assets/.engine.json`: every file it copied, with its real origin and licence (the repo's MIT for the engine and examples; each vendored npm package, with version and licence, for the bundles). `scripts/check_assets.mjs` reads it, so these files are never listed in `ASSETS.json` by hand.

```bash
node <skill-dir>/engine/three/selfcheck.mjs <project>/assets
```

After each change to a set that bakes physics, and before any snapshot, preview or render:

```bash
node <skill-dir>/engine/three/bake.mjs <project>
```

It loads the composition once, headless, and stores every `bakeCached()` result in `assets/bake/<hash>.bin`; every
later page load (each snapshot, the preview, every render worker) replays it instead of simulating again. The hash
covers everything that decides the result, so a changed scene simply bakes again; `assets/bake/` can be deleted.

The build copies the modules and bundles `three-vendor.js` (three 0.186.1 and its add-ons, postprocessing, N8AO,
three-subdivide) and `rapier.js` (Rapier 0.14.0) from pinned versions; the first run installs them into
`vendor/node_modules`. The self-check fails loudly if a known trap is back (gravity not in scene units, a soft prop
that never comes to rest, a hull build abort, NaN in cloth or maps, zero normals, a tolerance that breaks at another scale or gravity, a cut cap coplanar with a face or a part the cut plane misses, a granular fill with grains on the removed side or stacked into one blob, a camera route that jumps (a hard cut), a ghost left on after its release). Import everything from
`assets/` so all modules share one `THREE`.

## What it covers, and how it grows

The engine holds behaviours (laws), never a list of objects. Rapier's rigid-body solver covers falling, rolling,
sliding, stacking, knocking and hinges for any shape: a phone, a bottle, a rock or a car is a model plus its
looked-up mass, friction and bounce (`dynamicHull(mesh, { mass, friction, restitution })`), no new code. The
systems: scale and placement, procedural surfaces, rigid physics with joints, hung cloth, swept organic forms with
fur, one shared air field (a breeze, jets from any outlet), plants that bend in it, particles in it, wind-driven
water, granular fills, section views, camera stations and attention, the finish. `examples/` holds ready pieces built on them, proof of how to use the systems, never required.

The engine is a toolbox, not the limit of what a film shows. Not here yet: sky and terrain, rigged characters,
ropes, glass and liquids, flames, fracture, and every subject away from human-scale sets (molecules and ions,
cells and organs, orbits, fields, crowds, data in space). A film that needs one builds it from three.js the same way:
the law that drives it and its real numbers from a cited source; parameters in real units, nothing that knows the
set; a scale changed on purpose and shown when reality is too small, large, fast or slow (`camera-motion.md` §5,
"Any subject moves by its own law"); its trap added to `selfcheck.mjs`; proved in the render; then brought back
here with a line in this table. Air is one shared field: every source adds into it and everything light reads it
(cloth, leaves, smoke, water ripples).

## Modules

| Module | What it gives |
|---|---|
| `kit.js` | `makeKit(scene, { mpu, floor, wear, palette, kinds, grain, gravity })`: sets the scale and the place (`M` metres per unit; `G` the place's gravity, 9.81 m/s² by default, in units/s²; live for every module; every tolerance is in metres, so any scale works); `model(path, opts)` loads a `.glb`/`.obj`, its materials dressed by name (`palette` colours, `kinds` surfaces: presets `kits.furniture`, `palettes.americanJapandi`; unmapped materials stay as they came), soft goods subdivided; `box`, `cyl`, `tube` (cables kept off the floor), `mat`, `cloth`, `canvasTex`, `group`, `paint`; `rest(o)` + `settle()` drop every prop onto its first contact by its own lowest points and return what could not be placed (nothing below, or more than 3 cm inside something; up to 3 cm it lifts out); `model(path, { crease: false })` keeps a detailed model's own normals; `screenOn(model, material, picture)` lays a display on the model's own screen face. |
| `surfaces.js` | `surface(material, kind, { world, wear, floor })`: procedural triplanar detail with no UVs — `fabric`, `pile`, `wood`, `bamboo`, `plaster` (wear 0..1), `micro`, `bark`, `stone`, `soil`, `grains` (packed grains, `{ size, long }`). |
| `physics.js` | `makeSim(THREE)`: Rapier in real units. `staticScene(scene, exclude)`, `roundBox`, `dynamicHull` (spokes, joints, soft), `kinematicHull`, `hold(body, t)` (out of the solver until its cue), `bake(duration, onStep, preroll, { track })` → `{ impacts, report, apply(t), travel(t, fps), pose, at(name, t) }`, `bakeCached(...)` (the same, stored in `assets/bake/` by `bake.mjs` and replayed; one per sim, after `audit`; `{ keep }` carries what onStep built, `{ key }` any value an inline script feeds the bake, `{ islands: [[a, b], [c]] }` bakes groups that never touch in parallel workers), `audit(objects)`. `slow(t0, rate, rampOut, hold)` and `replay(tEvent, tShot)` return `tau(t)`, a time remap for slow motion and replays of one baked event: `apply(tau(t))`, `pose(i, tau(t))`, `travel(t, fps, tau)`. Poses are stored only while a body moves. Report: penetration (rigid only), floating, moving, pre-roll drift at the centre of mass with tilt. |
| `bakecore.js`, `pool.js`, `bake-worker.js` | The bake's step loop without three.js or the DOM, the pool that runs declared islands in workers (one per spare core, in this thread when none starts), and the worker itself. Used by `physics.js`; a set never imports them. |
| `bodies.js` | `loose(sim, objects, { kg, friction })`: soft things that are not placed (cushions, bags, a dropped coat) settle by simulation in the pre-roll. |
| `mechanism.js` | `slide(sim, part, { axis, min, max })` and `hinge(sim, part, { at, axis, min, max })`: a part (what `roundBox` or `dynamicHull` returned) on a prismatic or revolute joint whose limits are its stops (m, or rad; the start is 0, inside them); `spring(sim, joint, { stiffness, rest \| preload, damping })` (N/m and N, or N·m/rad and N·m; refused when too stiff for the 480 Hz step); `latch(sim, part, until)` holds the part in place, still colliding, until a time in s or a condition `(t) => boolean`, then lets it go once. Baked with the set: hashed into the cache key, release times in `report.latches`, refused in `opts.islands`. The frame is the set; a part on a moving frame is not covered. |
| `sfx.js` | `impactSounds(impacts, { library, assets, materials, against, latches, events })`: a bake's impacts (and latches, breaks, splashes) become `<audio>` rows: material pair + weight pick a sample tag, dv sets the gain (0.5 × (dv/1.2)^0.6, capped), contacts under 40 ms merge, under 0.15 m/s drop; unknown material, missing sample and a sample with no `ASSETS.json` row are reported, never guessed. `audioTags`, `productionTable`; CLI `sfx.mjs` (not copied to the project) |
| `type.js` | Captions and labels on the film's 2D canvas, no imports (browser and Node). `readTime(text)`: the least time a label needs on screen (0.5 s + 0.3 s per word + 0.15 s per CJK character, at least 1 s). `phrases(narrationTxt, words)` → caption phrases (`craft-rules.md` §6: a narration line end, sentence ends, `,` `:` after 3 words, a run over 7 words at its longest speech pause in `words.json` (≥ 0.3 s) else balanced, CJK by character ≤ 16, held through the pause that follows; `scripts/captions.mjs` writes `audio/captions.js`); `drawCaption(ctx, t, caps, { format, accent, pill })` in the format's caption zone (the target band of `craft-rules.md` §6; Reels and TikTok: block top about 73 %, bottom 82 %), ink from the luminance under its own box (decided every frame, halo in the other ink), the spoken word boxed in `accent` from its start, never drawn outside the zone (a phrase that does not fit in two lines at 54 px shrinks: `shrunk`); `pinLabel(ctx, { at, camera, text }, { format, side })` a label with leader that flips and clamps inside the label zone above the caption, ≥ 36 px, wrapped at its spaces when wider than the zone, `null` for a point behind the camera or off the frame; `repeats(caps, labels)` warns when a caption repeats a visible label; `rangeBar(ctx, { value, max, ticks: [{ at, label }], label }, { format, x, y, w, size, accent, highlight })` a range card (`visual-direction.md` §13 "Formula on the set"): the bar fills to `value / max` (clamped), a tick at each option's capacity with its label under it, the first tick at or above the value (or `highlight`) in `accent`; kept inside the label zone, ≥ 36 px; returns `{ x, y, w, h, fill, fits, ticks, size, ink }` (`fits` -1: no option fits); `safeArea`, `luminance`, `inkFor`. Call after the finisher has drawn the frame (it reads the ground). `layoutFrame(ctx, t, { format, hero })`, called last in the frame function, hands out the boxes drawn since its last call as `{ t, W, H, format, hero?, boxes: [{ kind, text, x0, y0, x1, y1, size }] }` (`kind` caption / label / card, px at the canvas size; `hero` from camera.js `heroBox`, left out when not given, `null` when the hero is off the frame); it sets `globalThis.__dalangLayout` and posts the record to `strips.mjs`'s receiver on 127.0.0.1:47614 while one answers (the first failed post stops the posting for that page; `send` takes the JSON instead of the post), so `review/strips/index.md` carries the numbers for `scripts/layout_lint.mjs`. |
| `quantity.js` | Quantities shown in the world (`visual-direction.md` §13). `flowArrow({ from, to, value, scale, normal, color, head })`: a flat arrow from `from` to `to` (scene units) whose shaft is `value × scale` metres wide, so two arrows on one scale show their ratio (the film keeps one scale); it lies in the plane facing `normal` (+Z by default; parallel to the arrow throws), value and scale must be finite numbers > 0; `reveal(u)` draws the first `u` of its length at the same width; `anchor` is where its value label goes (`pinLabel({ at: arrow.anchor, ... })`); returns `{ group, mesh, anchor, value, width, length, reveal }`. `tileFill({ at, w, d, cell, color, gap, lift })`: a `w × d` m area on the floor from the corner `at`, in cells of `cell` m (the last row and column cut to fit), one InstancedMesh lifted 2 mm with a `polygonOffset`; `show(n)` shows the first n cells (row by row along +x, then +z), `area(n)` their m² (the card's value, so card and tiles agree), `edges.w` / `edges.d` anchors for the dimension tags. Neither adds itself to the scene; an arrow or tile fill is not a prop, so `scaleAudit` lists it `unchecked`. |
| `cloth.js` | `bakeCurtain({ cx, width, top, length, z, wall, wind, duration, mpu })`: any cloth hung from its top row (a curtain, a flag, a banner, laundry), PBD, drag in real units, drawn through a Catmull-Rom spline. |
| `air.js` | `jet({ frame, D, u0 })`: air blown from any outlet (a fan, a blower, a vent, an exhaust) as a turbulent round jet; `frame(t, outlet, axis)` moves or turns it; `wind(p, t, out)` — add it to the set's air field (`wind.js`); `block(objects)` makes obstacles shadow it. |
| `fur.js` | `sweep(points, radius, opts)` a tube with a skin laid out for fur; `coat(mesh, opts)` shell fur combed along the body: any animal, part by part from its anatomy. |
| `wind.js` | `makeWind()` the set's one air field (`add(source)`, `at(p, t)`, `source` for cloth); `breeze({ dir, speed, ground, z0, gust, size })` outdoor wind with the log-law profile and gusts carried downwind; `draught({ dir, speed, gust, size })` room air (0.05-0.2 m/s, slow eddies): every indoor set with steam or smoke adds one; `bakeBend({ count, at, f, zeta, lean, field, duration })` damped oscillators driven by drag, baked and replayed; `noise3`. |
| `plants.js` | `tree(k, { at, height, trunk, levels, leaves, leaf, sun })` grown by rules, every branch an oscillator, leaves fluttering; `grass(k, { x0, x1, z0, z1, y, density, height, inside })` instanced blades each an oscillator (gusts run across as waves); `leafGeometry`, `leafTexture`, `leafMaterial` (translucent to the sun behind); `sway(object, field)` for a rigid kit plant. `bake(field, duration)`, then `apply(t, camera)` per frame. |
| `particles.js` | `particles(k, { kind: "steam" \| "smoke" \| "dust" \| "rain", at \| box, field, rate, lit, ground, light })`: buoyant plumes that cool (`shade`: the self-shadow of a dense puff, steam 0.4, smoke 0.45, toward the side away from `light`, the direction toward the key; read after `camera.updateMatrixWorld()`), motes that follow the air and show only in light, rain at its terminal speed with the wind (and its `impacts`). `bake(duration)`, `object()`, `apply(t, camera)`. `contrast(kind, ground)` and `.contrast(ground)` give `{ lit, shaded, readable }` against `READABLE` (0.15): a plume needs a darker ground behind it or a side or back light, and moving air. |
| `grains.js` | `grains(k, { preset, at, radius \| width, depth, bottom, height, layers, jitter, cut, instances })`: a bulk of small things (presets `lentil`, `coffee`, `rice`, `oats`, `sugar`, `sand`, `gravel`, or your own `l`, `t`, `w`, `shape`, `colors`) as instanced grains at real size in jittered layers on the top and, with `cut` (the cutaway's `{ normal, offset }`, world space, any plane), whole grains at the cut face that follow the cutaway's `on`/`off`/`set` and a rotated container (the cutaway calls the fill's `userData.cutTo`; without one call `result.cutTo(plane)`), over a body wearing the matching `grains` surface; `instances: false` for grains under ~3 px (the body's texture alone). Static: a pour is a physics bake. Returns `{ group, body, mesh, counts, capped, cutTo }`. |
| `water.js` | `water(k, { x0, x1, z0, z1, y, wind, fetch })`: a fetch-limited sea state (JONSWAP) as Gerstner waves with capillary-gravity speeds, rain rings from `rain(impacts)`, per-pixel normals with sub-pixel waves faded out; `seaState`, `dispersion`, `height(x, z, t)`. |
| `finish.js` | `makeFinisher(canvas, { grain, edge, fps })`: `layer(gl, i)` for motion-blur sub-frames, `grade(t)` vignette and seeded grain. |
| `audit.js` | `scaleAudit(root, { tol })` against `userData.real = { h, w, d }` (metres, world axes: a prop turned about Y swaps `w` and `d`, so declare `h`): a declared axis off by more than 15 % is reported with the prop's name, a prop with no declared size, anywhere in the tree (inside a group too), is listed `unchecked` (never passed; a node that declares a size covers its parts), a bad declaration lands in `bad`. `zFight(root, { cameras, bits, heightPx })`: overlapping parallel faces of two meshes less than one depth step apart at a camera that sees them (z² (far − near) / (far · near · 2^bits), the worst over every station's camera), with the `polygonOffset` or lift to apply; cutaway caps are not reported, nor are faces kept a step apart by what their `polygonOffset` does at every camera (factor × the face's depth slope per pixel at `heightPx`, 1080 by default, + units × one step: a factor alone shifts nothing on a face seen head-on, equal offsets cancel, every material drawing the face counts), and faces that only share an edge or corner do not count as overlapping, a face no camera sees is counted in `unseen`. The step is a lower bound; the depth step assumes a standard (non-log, non-reversed) depth buffer. A camera whose aspect is not a finite number above 0 throws, and a pair seen at a camera where its depth cannot be computed (edge-on) is counted in `unseen`. Read-only. |
| `cutaway.js` | `cutaway(root, { normal, offset, color, hatch })`: a section view. One clipping plane on every material under `root` (cloned, so a material shared outside stays whole), parts added later included (`cut.add(part, { shell })`, or a plain `add` into any group under the root); a stencil cap on each solid part, all caps on one transform and pulled forward (`polygonOffset`), so none fights a face lying on the plane; `userData.cut = { shell: metres }` gives an open single-surface part its wall ring instead of a disc; `userData.cut = false` keeps a part whole (listed in `uncut`), and with a `userData.cutTo(plane | null)` function (a `grains()` fill has one) it is handed the cut plane each frame, null when off; set flags before the part is added. `on(t)`, `off(t)`, `set(offset, t)` switch or slide the cut by time (off moves the plane away, never swaps it, so no shader recompiles), `at(t)` once per frame, `ready(renderer)` needs a stencil buffer: `WebGLRenderer({ stencil: true })`, `EffectComposer(renderer, { stencilBuffer: true })`. The render draws a clone of each material: `at()` carries the set's later edits to its own material (glow, fade, colour, map swap, custom keys) to the clone without ever writing into the set's own colours or textures, a `ShaderMaterial`'s uniforms are shared with the original, and an edit made straight on `mesh.material` is kept until the original changes that property; keep editing the original and the part follows. Visual only: the caps live in `cut.group`, which `at()` puts beside the root under the scene's top ancestor (never under the root, and not at all while the root has no parent), so pass `cut.group` in the `exclude` of `staticScene`. One cut per root. |
| `camera.js` | One world, one camera, no cut. `stations({ home, ...named })` named poses (position, target, vertical fov; `home` required), `frame(object, { fov, aspect, azimuth, elevation, margin })` a station that fits an object (a long lens stands back; elevation stops short of straight down), `travel(t, from, to, { start, dur, ease, lift, over, clear })` the pose between two stations as a pure function of t (an arc that rises `lift` metres or clears the top of `over`, a Box3, by `clear`; a Box3 and not an object, so a part that moves never moves the camera; ease `inOut` by default; `{ u, position, target, fov, speed }`, speed in m/s for motion blur), `route(st, legs)` the film's whole path (`at(t)`; a leg that starts before the one before ends throws, so there is no hard cut; a leg's `over` may be an object, measured once when the route is built), `loopEnd(st, { end, dur })` the leg home that ends on `end = (frames - 1) / fps`, so the last pose is the first, `place(camera, pose)`, `heroBox(camera, object, W, H)` the object's screen box in px from the 8 corners of its bounding box, clamped to the frame (`null` when empty, behind the camera or off the frame; `clipped: true` when a corner is behind the camera, so the box is a lower bound), the `hero` of type.js `layoutFrame`. `attend(root, { ghost, desat, light, dur, edge, keep })` attention by ghosting, keyed by time like the cutaway: `focus(subjects, t)` fades everything outside the subjects to a light, desaturated, translucent ghost on cloned materials, one ghost per mesh (parts that share a material fade at their own weights; the set's shared materials are never written), `release(t)` brings it back, `weight(object, t)`, `skipped` (materials without a `.color`, left as they are); `keep` (the floor or sweep), `userData.attend = false` and the cutaway's own parts never ghost; `edge` adds a fresnel rim on lit ghosts. `at(t)` once per frame, after every other `at()` (`cut.at(t)` first) and before the render; the original material comes back by reference, so colour, opacity and transparency are exactly what they were. Make a cutaway before the first `at()`. Ghosted meshes still cast their shadow. Visual only. Cues and shots on one frame grid: `snap(t, fps)`, `shotAt(t, shots, {fps})` (index or -1), `overlayWindow(cue, shots, {fps})` → `{ index, name, from, to, dur }`, and `windowProblems(items, shots, {fps})` → strings naming every overlay or label window that is empty, in no shot or under its read time (the scene throws on a non-empty list); a cue is snapped as a cut is, never compared raw. |

## Examples (`examples/`, installed beside the modules; import from `./examples/…`)

| File | What it is |
|---|---|
| `examples/chair.js` | `casterChair(sim, chair, seat, opts)`: an office chair on casters (star base, swivel seat on a joint, rolling resistance on the whole chair; `push`, `step`, `stopped`). |
| `examples/fan.js` | `makeFan(k, { at, aim, height, u0 })`: a 16-inch pedestal fan modelled in metres, its head oscillating, its air an `air.js` jet. |
| `examples/flask.js` | `makeFlask(k, { at, height, cut })`: a vacuum flask in metres, two steel shells with the vacuum gap between them, a solid stopper, a cup added after the cut; its `cutaway`. |
| `examples/canister.js` | `makeCanister(k, { at, height, radius, fill, level, cut })`: an open canister of grains in metres, optionally cut (the fill is cut with the wall and follows `cut.off`/`cut.set`, the wall shows its ring). |
| `examples/cat.js` | `makeCat({ size })`: a curled sleeping cat swept from its anatomy, in shell fur. |
| `examples/interior.js` | American-Japandi pieces (`plaid`, `ticking`, `braidedRug`, `cushion`, `pouf`, `door`) and the presets for `makeKit`: `kits.furniture` (the CC0 furniture kits' material names) and `palettes.americanJapandi`. |
| `examples/oner.js` | `oner({ world, subject, inside, keep, aspect, end, azimuth, look, beats })`: a one-take on any set, home shot, dive, push-through into the part, back home so the last frame is the first, with attention by ghosting on each beat (`look.dur` of 2.5 s or less, or it throws: the last frame must be solid); `at(t, camera)` once per frame, after the cutaway's `at`. |
| `examples/twin.js` | `twinSets(k, build, { values: [a, b], at, gap, axis })`: one set built twice by `build(group, value, index)`, differing only in the value, placed `gap` m apart along `axis` with the gap centred on `at` (twin sets for an A/B comparison, `visual-direction.md` §13). |

## The shape of a set's build

1. `makeKit` with the measured `mpu` and the floor's height; place models and props, `rest()` what is set down.
2. `settle()` once everything is placed; read what it could not place. Declare the real size of each hero prop (`userData.real = { h: 0.18 }`) and read `scaleAudit(scene)`: a 10x typo is named here, not by a reviewer; `zFight(scene, { cameras })` with every station's camera before the bake.
3. Air (`block` with every obstacle in place), cloth bakes.
4. `makeSim`, `staticScene` (excluding what moves), dynamic bodies and rigs, mechanism parts (`mechanism.js`), `hold` for what enters on a cue,
   `audit`, then one `await bakeCached(...)` for the whole set with a pre-roll (≥ 1.2 s with loose props): a replay
   does not run onStep, so a per-step value it computes goes in `track`, anything else it builds in `keep`, and a
   value from an inline script in `key` (the set's `assets/` modules and `beats.js` are hashed already). Read
   `report` and the bodies' stillness at frame 0. Then `bake.mjs` once, before snapshots and renders.
   A bake is one world on one core, every step after the last. When groups of bodies never touch for the whole shot
   (a counter and a far shelf, two workbenches, the two pavements of a street), declare them:
   `bakeCached(duration, onStep, preroll, { islands: [[mug, bowl], [lamp]] })`. Each island is its own world, baked
   in a worker while this thread bakes the main island (every body not listed): the same `{ pose, impacts, report }`,
   the same cache file. Only the main island runs `onStep`, the kinematic paths, `track` and `keep`: a script that
   reaches a declared body throws (its methods, a lookup of its handle, and every world-wide query: `castRay`,
   `intersectionsWithShape`, `contactPairsWith`, `forEachCollider`… cannot tell a body baked in another world from an
   empty place, so they refuse; read a main-island body through its own methods), a kinematic body, one impact name on bodies of two islands or a joint across
   islands is refused, and a body of one island coming within 5 mm of another's (judged on what can touch: every
   collider of the body, with its offset and contact skin, and the drawn geometry, so a collider built wider than its
   mesh counts; on the path between two steps too (a fast body refuses the bake, see below; a slow one is judged as a capsule widened by how far the step's speed and spin let it stray), and from where a script put a body, never along its teleport; in the pre-roll as well as the shot: a piece that settles onto a declared body there would fall through
   it in its own world) throws with the pair and the time, so merge those islands. While the islands bake, a script may
   change a main-island collider's friction, restitution, mass or filters, never where it can touch (shape, size, offset,
   contact skin: those calls throw, and a collider that reaches further after the bake is caught). What every island world shares with the main one
   is fixed when the bake starts and the scripts may not change it: gravity, the solver settings, every fixed body
   and static collider (move, disable, remove, add), joints inside an island, a step of the world. Those calls throw
   while `onStep`, `track` or `keep` run (reading them stays open, as does driving a main-island body), and a change
   that slips past is caught after the bake: nothing is saved. A dynamic body the sim did not make is refused too.
   Set such a change up before the bake, or leave the bodies it touches out of `islands`. A worker that cannot start falls back
   to this thread (a warning, same result, no gain). Gain: the slowest island's time, not the sum. Islands are for sets
   that settle slowly (stacks, props, pieces dropped or nudged): a body moving over 10 mm in one step (about 4.8 m/s at
   480 Hz, spin included: a free fall of about 1.2 m, a throw, a piece dropped from above the frame) refuses the island bake, since inside a step Rapier's CCD can stop a fast body and pass a hit
   on in ways no recorded pose shows. Bake such a set as one world.
5. Render loop: pose everything at `t` (a slowed or replayed shot at `tau(t)`); when `travel(t, fps)` passes ~4 px of a frame, average 5 sub-frames across a
   180° shutter through `finish.layer`, then `finish.grade(t)`.
6. Sounds on `impacts`: `impactSounds(bake.impacts, { library, assets, materials, against, latches, events })` (`sfx.js`; or `node engine/three/sfx.mjs <project> --bake <file> --plan sfx.json`) returns the `<audio>` rows and the table to approve; rolling and sliding sounds follow the measured speeds (`camera-motion.md` §5.3).

### A mechanism on cue, and its slow-motion replay

A spring-loaded plunger held by a latch, released on its cue, then shown again 50 times slower from another camera. One
bake; both shots read it.

```js
import { slide, spring, latch } from "./mechanism.js";
import { slow, replay } from "./physics.js";
const part = sim.roundBox(plunger, 0.02, 0.02, 0.06, 0.002, { density: 7850 * M ** 3, name: "plunger" });
const j = slide(sim, part, { axis: { x: 0, y: 0, z: 1 }, min: 0, max: 0.03 }); // 3 cm of travel to its stop
spring(sim, j, { stiffness: 400, preload: 6 });            // N/m, and N at the held pose
latch(sim, part, beats.release);                           // or (t) => trigger.body.translation().y < y0
const baked = await sim.bakeCached(4, onStep, 0.5, opts);
const tRel = baked.report.latches[0].t;                    // when it let go, also from a cached replay
// shot 1 in real time; shot 2 (from shot2 s) replays the release, 1/50 slower for a moment, from another angle:
const again = replay(tRel - 0.05, shot2), ramp = slow(shot2 + 0.05, 1 / 50, 0.6);
const tau = (t) => (t < shot2 ? t : again(ramp(t)));
baked.apply(tau(t));
```

The released part never shows back in its held pose: every shot reads the same baked motion. A part that must go back
needs a visible cause (a drive, a press), built as a body or a joint, not a second time function.
