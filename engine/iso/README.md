# engine/iso — the Express look

Canvas 2D, no dependency. Builders read `templates/iso-API.md`, not this file. Each module's check: `node tests/<name>.mjs`.

- `iso.js`: lemo-opuscar's isometric infographic engine (MIT, `LICENSE`), with DALANG's one change named in its header:
  every solid is one inked mesh (`iso.ink = null` is the vendor's flat look), boxes take a `bevel`.
  `new Iso(ctx, W, H)`, `iso.cam = { x, y, z, k }` (k px per unit); queue `box`, `prism`, `cyl`, `cone`, `roof`,
  `sphere`, `flat`, `line3`, `bill`, `text3`, `push`/`pop`, then `iso.flush()` (back to front); `iso.desat` +
  `iso.keep`. `tri(c)` three tones; `pin`, `inset`, `ring`, `cutLine`, `hatch`, `ICON` + `iconGrid` (Isotype),
  `person`, `shape()`; eases `ss`, `eo`, `eio`, `back`; `seg`, `clamp`, `lerp`; `FONT` for canvas text. (`iso.mjs`)
- `forms.js`: shape families in metres, z up: `lathe(profile)`, `extrude(outline, { h, plane })`,
  `sweep(path, { r | section })`, `gearOutline(teeth, module)`; `solid(iso, faces, colour)`.
- `build.js`: `build(iso, spec | WORLD, { values, cut, focus, models, plates })` → `{ at }` (pin points): objects as
  data (forms, kits, templates, `figure`, `model`, `plate`), `array`, `skin`, `focus`, gears by tooth ratio, numbers
  named as `values` keys; paint order from part boxes, contact shadow unless `shadow: false`. (`iso-build.mjs`)
- `kit.js`: `KIT`, `expandKit`: components (fasteners, faces, pipes, tyres, containers, furniture, tools) as plain parts.
- `templates.js`: `TEMPLATES` (`motorbike`, `car`, `engine`, `room`, `appliance`, `tree`), used as `form: "kit"`.
- `figure.js`: `figureSolids`: a jointed person, presets or joint angles, two-bone IK reach, feet on the ground.
- `plate.js`: `loadPlates(WORLD)`, `drawPlate`, `plateMarks`: the user's photo traced by `scripts/trace.mjs`, stood upright at real size.
- `model.js`: `loadModel(url)` (`.glb`/`.gltf`; Draco and meshopt refused), `parseModel`, `drawModel(iso, m, { size,
  palette, color, texels, max })`: flat three-tone triangles; > 4000 triangles refused unless `max`.
- `palette.js`: `triad(hex)` → `[top, left, right]` by fixed OKLab steps (`STEP`), so dark and pale bases keep three
  faces; `toOklab`, `fromOklab`.
- `parallax.js`: `drawLayers(iso, cam, rest, layers, { focus, aperture, dolly, haze })`, `isoLayer` (depth 1 subject,
  < 1 far, > 1 near; zoom in log; never a tilt); `layerTransform`, `applyLayers(root, view, rest, W, H)` for SVG/HTML
  layers marked `data-depth`. (`iso-parallax.mjs`)
- `cinema.js`: `camAt(t, keys)` (one-way moves), `filmOrbit(dir)`, `orbit25`, `crane25`, `dollyZoom25`, `drone25`,
  `ramp`, `whip`, `motionBlur`, `bokeh`, `discs`, `focusRing`, `hold`, `EASE`, `makeFinish(W, H).apply(canvas, t,
  { grade, bloom, sweep, vignette, grain, bars })`; all pure in t or seeded. (`iso-cinema.mjs`)
- `examples.js`: `tower`, `waterTower`, `gearbox`, `truck`: specs proving the forms, the tests' fixtures.
