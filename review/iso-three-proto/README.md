# Express on the three.js engine: a one-scene prototype

**Question.** Can Express move from its own Canvas 2D isometric engine (`engine/iso/`) onto the three.js engine Studio
already uses (`engine/three/`), keep the `isometric-world` look, and look clearly tidier?

**Answer: yes. Migrate, in the steps below.** On the same scene, the same palette and the same three shots, the three.js
rig gets depth right, and so far the Canvas engine cannot. The prop specs drop from about 210 characters across 2–4
sculpted parts to one line of about 80 characters, and the frame still reads as one flat three-tone illustration. The
weak spot is the people: the Kenney figures are chibi toys, so the next step is a CC0 people pack with real proportions
(asked first).

## What was built

- `engine/three/isoWorld.js`: the set written as data in engine/iso's own coordinates (metres, z up), on the existing
  iso rig (`camera.js` `isoCamera`, `studio.js` isoMaterial: three tones by face, no lights, no outlines).
  - `model` entries are ready CC0 models at their real height (`h`), turned by `face`.
  - Colour comes from the material name (`roles`), then from `color`, then from the nearest palette colour. Textures
    are snapped texel by texel, so three Kenney packs read as one style.
  - A soft contact shadow sits under every model.
  - `figure` entries are rigged people, posed `stand` or `point` and turned to `look` at a point.
  - `form` entries (box, cyl, sweep, lathe, extrude) are kept for the machine, the pipe run and the shell.
  - `isoPose({ x, y, z, k })` takes engine/iso's `camAt` keys unchanged. `isoOrbit` and `placeIso` give the slow
    one-way orbit (`three-wide-orbit8.jpg`).
- `examples/iso-proto/scene.js`: one generic scene, written for both engines:
  - a room and a yard on one floating slab;
  - 11 props against the walls;
  - a pump set with a tank and a supported pipe run;
  - two people, one pointing and one standing.
- `examples/iso-proto/render.mjs`: renders 3 engines × 3 shots in about 10 s with HyperFrames' cached headless
  Chrome, plus `sheet.jpg`.
- Checks: a block in `engine/three/selfcheck.mjs` covers real height, axis mapping, recolour order, contact shadow,
  look, poses, the rule that a rigged model is placed once, form errors, pipe bends, `isoPose` and the one-way orbit.
  It passes, and a mutation that swaps the axes makes it fail.

Models: Kenney Furniture Kit, Nature Kit and Mini Characters (kenney.nl, CC0 1.0, 18 MB in total). They were
downloaded with consent and are not committed: `render.mjs` takes the unzipped folder as an argument.

## The stills

`sheet.jpg`: the rows are the engines, the columns are wide, medium and close at 1080 × 1920.

| Row | Engine | Objects from |
|---|---|---|
| `iso-*` | engine/iso `build()` | primitives, the way an Express builder writes a set today |
| `isomodel-*` | engine/iso `build()` | the same CC0 models (`drawModel`) |
| `three-*` | `isoWorld.js` | the CC0 models, recoloured |

`iso-wide-onepass.jpg` and `iso-medium-onepass.jpg` are the iso row drawn the way `iso-group.tpl.html` draws a film
today: one `build()` per WORLD spec, then one flush. The `iso-*` row adds a workaround a careful builder would need,
which is to flush the ground first.

## Verdict

| | engine/iso, primitives | engine/iso, CC0 models | three.js `isoWorld` |
|---|---|---|---|
| **Depth** | Template pass: the slab paints over the whole room, the floor, the people's legs and the pipe run (`*-onepass`). With the ground flushed first: the props survive, but the oak floor still loses to the slab. | Per-triangle painter's sort: the desk top breaks up, the screen floats as a black triangle, limbs cut through. | Z-buffer: nothing draws through anything in any shot. The pipe passes correctly in front of the person behind it. |
| **Tidiness** | Clean at the wide. At medium and close: hairline pipes, a floating lamp foot, sphere-on-cylinder plants. | Noisy at every size. | Clean at all three sizes. Bevels and real silhouettes hold up at k = 400 px/m. |
| **Figures** | Ball head, slab body, a stick arm. A billboard always faces the camera, so the pointer points to its fixed side, away from the pump. | The bind pose is a T: arms stick out and cannot be posed. | Turned to what they look at, arms posed from the rig. But Kenney Mini Characters are chibi: the head is about 1/3 of the height, so a point reads weakly at a distance. |
| **Style consistency** | Consistent, but a box world. | Each pack keeps its own colours. | Three packs read as one style after the palette snap. Side tones are a scalar of the top tone (not engine/iso's hue shift), which is slightly greyer but the same family. |
| **Builder cost** | 2–4 parts per prop, about 210 characters, sculpted from a reference. | 1 part, but the scale must be worked out by hand and the colours cannot be steered. | **1 line per prop (about 80 characters)**: a model, a real height and a facing. |
| **Frame cost** | Canvas 2D, cheap. | Over 4,000 triangles is refused; slow. | 9 stills plus the engine build took about 10 s on SwiftShader. |

Two lessons that hold whatever engine renders:

- In an iso view, a pointing arm aimed at the camera foreshortens to nothing. Stage the pointer so the target lies to
  their side on screen. That is a planner rule.
- A person who looks at something behind them, in the far half of the set, shows the camera their back. Put the
  subject of a look in the near half, or the person behind it.

## Recommendation: migrate Express to three.js, in this order

1. **People first.** Find a CC0 people pack with real proportions and a simple rig. A candidate is Quaternius
   "Ultimate Modular Men/Women" (CC0). Ask for consent with the licence and size stated before downloading. Map its
   bone names in `isoWorld.js` `POSES`. Also add a few more poses (`carry`, `walk` at a phase, `sit`), every one caused.
2. **Fix `find_media.mjs --type model --source kenney`.** kenney.nl no longer links the zip on the pack page. The page
   now hands out a signed link from `/download-link/<id>`. The current scraper throws "its page links no zip".
3. **Pre-approve a model shelf.** Pick a short list of CC0 kits (furniture, nature, city, tools, people) that the
   planner may name by key. Downloads stay with consent, once per machine.
4. **Migration touches:**
   - `scripts/scaffold.mjs`: Express writes the three engine (`build.mjs`) and an iso-three group template instead of
     copying `engine/iso`.
   - `engine/iso/templates/*`: `iso-world.tpl.js` keeps its shape. `COLORS` and `WORLD` become `isoWorld` entries,
     and `VALUES` stays. `iso-group.tpl.html` becomes a WebGL group: `isoStudio`, `placeIso(isoPose(camAt(t, keys)),
     isoOrbit(t))`, the overlay unchanged. `iso-API.md` is rewritten for `buildWorld`.
   - `references/express.md`: the "Objects are data" rule becomes "place models, sculpt only mechanisms", and the
     ≤ 4,000-triangle limit goes.
   - `references/express-planner.md`: the storyboard names model keys, real heights and facings. It also gets the two
     staging rules above.
   - `CLAUDE.md`: "Express ... is 2.5D illustration in HTML/SVG" becomes "the same three.js engine as Studio in the
     isometric-world look", and the `engine/iso/` layout line changes too.
   - `engine/iso/cinema.js` `camAt` and the `parallax.js` layer moves port as they are: the camera keys are already
     shared through `isoPose`. The 2.5D tricks (`orbit25`, `dollyZoom25`) become a real orbit and a zoom.
   - The cutaway and blueprint languages already run on the three iso rig (`cutaway.js`, `blueprintLook`).
5. **Keep engine/iso for one release** as a fallback, then remove it. Its tests (`tests/iso*.mjs`) go with it.

Not done here: the per-colour hue shift for side tones (`studio.js` ponytail note), world-normal shading for orbits
past about 15°, IK aiming for a moving point target, and any migration step.
