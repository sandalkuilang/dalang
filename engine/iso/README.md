# engine/iso — the Express look

`iso.js` is lemo-opuscar's isometric infographic engine (`styles/iso-infographic/demo/engine.js`, MIT, LICENSE beside it),
vendored with one change of DALANG's, named in its header: every solid is one mesh (`meshNow`) whose feature edges are
inked (silhouette and creases dark, a lit top rim light; `iso.ink = null` is the vendor's flat look), boxes take a
`bevel`, spheres an outline. Canvas 2D, no dependency, no three.js.

- `new Iso(ctx, W, H)`; `iso.cam = { x, y, z, k }` (k = px per unit); queue primitives, then `iso.flush()` paints them back
  to front (depth x + y + z): `box`, `prism`, `cyl`, `cone`, `roof`, `sphere`, `flat`, `line3`, `bill`, `text3`, `push`/`pop`
  local frames; `iso.desat` + `iso.keep` grey out all but the subject.
- `tri(colour)` → three tones (top, left, right). Helpers: `pin`, `inset`, `ring`, `cutLine`, `hatch`, `ICON.*` +
  `iconGrid` (Isotype), `person`, `shape()` (a 2D outline → a shaded solid), easing `ss`, `eo`, `eio`, `back`.
- In a HyperFrames scene: a paused GSAP timeline holds the values and redraws the canvas in `onUpdate`
  (`references/express.md` Step 6). `node tests/iso.mjs` checks it still loads and paints back to front.

## Objects without drawing code (DALANG's own, MIT)

No catalogue of objects: any object is a few shape families, written as data, or a ready CC0 model.

- `forms.js`: the families, in metres, z up. `lathe(profile)` (a profile turned about z: a bottle, a tank, a lamp, a
  pillar), `extrude(outline, { h, plane })` (a footprint, a bracket, a letter), `sweep(path, { r | section })` (a pipe,
  a cable, a road), `gearOutline(teeth, module)` (spur teeth at a real module); `solid(iso, faces, colour)` queues any
  of them in three tones.
- `build.js`: `build(iso, spec | WORLD, { values, cut, focus, models })` draws (a `WORLD` array is ordered as one, each
  object with a soft contact shadow unless `shadow: false`) an object written as data from its real
  reference: parts of forms `box`, `cyl`, `cone`, `sphere`, `roof`, `lathe`, `extrude`, `sweep`, `gear`, `wheel`,
  `board`, `figure`, `model`, `flat`, `line`, `group`, each at its real size, with `array` copies, a `skin` the cutaway
  slides off, `focus` greying the rest, gears turned by their tooth ratio (`mesh: { with }`), and any number named as a
  key of `values` so the timeline drives it. It returns `{ at }`, each part's pin point. Parts paint in an order taken
  from their boxes (below, behind, inside go first), so a plate never covers what stands on it.
- `templates.js`: the made things films need most, assembled from kits and parametric (a scooter or underbone
  two-wheeler, a sedan, hatch or van, a single-cylinder engine whose piston and rod ride the crank under a cutaway
  housing, a room, a fridge, washer, wall AC or server rack, a broadleaf or pine tree); `{ form: "kit", kit: "car" }`.
- `figure.js`: a person as a jointed 3D body in real proportions (head, hair, eyes, neck, torso, elbows, hands, knees,
  shoes), posed by preset or joint angles, a hand reaching a point by two-bone IK, feet always set on the ground or the
  pelvis on a seat; build()'s `figure` form draws it. The vendor's flat `person()` billboard is no longer used.
- `kit.js`: components every made thing is assembled from (fasteners, faces and controls, pipes, hoses, cables, tyres,
  springs, fins, containers, windows, doors, furniture, plants, lamps, tools), each a function of its sizes returning
  ordinary parts; `{ form: "kit", kit: "tyre", r, width }` in a spec. Anatomy's audit expands them the same way.
- `model.js`: `await loadModel(url)` reads a `.glb` or `.gltf` (with its `.bin` and textures; Draco and meshopt are
  refused) from `find_media.mjs --type model` (Poly Haven, Kenney, Smithsonian, NASA); `drawModel(iso, m, { size,
  palette, color, texels, max })` paints every triangle flat in three tones of its material's colour (a texture's mean
  colour, or each face's texel with `texels`), sorted with the rest of the set. Over 4000 triangles is refused unless
  `max` says otherwise (about 40 ms per 5,000 triangles a frame in Chrome).
- `parallax.js`: depth for every Express language. `isoLayer(cam, rest, depth)` and `drawLayers(iso, cam, rest, layers)`
  give each isometric layer its own pan and zoom (depth 0 still, 1 the subject, under 1 farther, over 1 nearer; zoom in
  log space; never a tilt); `layerTransform` and `applyLayers(root, view, rest, W, H)` move SVG and HTML layers marked
  `data-depth`. `node tests/iso-parallax.mjs` checks it.
- `cinema.js`: the film camera and finish. `camAt(t, keys)` (keyed poses, eased, zoom in log, each move one
  way; no handheld shake: the camera's life is a slow one-way `orbit25`), `ramp(t, keys)` (speed ramps as story time), `whip(t, t0, dur, a, b)` and `motionBlur(target,
  buffer, draw, t, { samples })`, `makeFinish(W, H).apply(canvas, t, { grade, bloom, sweep, vignette, grain, bars })`
  in grade order; `drawLayers`' `focus`/`aperture` (rack focus) and `haze` (atmospheric perspective) in `parallax.js`.
  All seeded or pure in t. `node tests/iso-cinema.mjs` checks them.
  2.5D cinematography (honest approximations from layer depth, the projection stays fixed): `orbit25` (world slides
  round a centred subject; hand `o.rest` to `drawLayers`), `crane25` (a boom), `dollyZoom25` (`{ cam, dolly }`; pass
  `{ dolly }` to `drawLayers`: the subject holds, far layers swell), `drone25` (a descending reveal, pair with `haze`),
  `bokeh(fstop, { focus, mm })` (f1.2 melts, f5.6 sharp) and `discs(g, points, { radius, color })` for out-of-focus lights.
  `orbit25` takes `from`/`to` (in `sweep` units) so an orbit can leave the pose a zoom landed on (`from: 0, to: ±1`);
  `focusRing(target, buffer, { cx, cy, fstop, mm, clear, feather, amount })` blurs the frame around a clear centre (a lens
  isolating one spot, run after `drawLayers`, before `finish.apply`) and `hold(t, t0, t1, t2, t3)` is its 0–1 window.
- `examples.js`: four specs (an office tower on a cut plot, a water tower with its level, a gearbox in a housing, a box
  truck with a person), proof of the forms and the test's fixtures.

`node tests/iso-build.mjs` checks the forms, every example, the gear ratio, the cutaway, values, focus, the paint order
and the glTF reader (axes, colours, textures, culling, refusals).
