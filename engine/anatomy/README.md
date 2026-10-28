# engine/anatomy — proving an Express world

The geometry audit of [Anatomy](https://github.com/wheresryan22/anatomy) (a Claude skill for isometric figures, MIT,
`LICENSE` beside it). Vendored **unchanged** from commit `1482e8469b0a9e0d8cc18ea2740a01423d29ae80` (2026-10-18):
`audit.mjs`, plus the three files it imports: `iso-kit.mjs`, `lathe.mjs` and `tube.mjs`. Node built-ins only, nothing
to install.

`world.mjs` is DALANG's own (MIT). `auditWorld(WORLD, { values, ground, floor })` reads engine/iso `build()` specs as
true shapes:

| `build()` form | Audit shape |
|---|---|
| `box`, `figure`, `board` | oriented boxes |
| `cyl`, `wheel`, `gear` | discs on their axis |
| `cone`, `lathe` | turned bodies |
| `extrude` | prisms |
| `sphere` | balls |
| `sweep` | tubes |

It then runs the audit's `supports`, `clearances` and `terminals` checks, which name:

- a part that floats (no chain of contacts down to the ground);
- two objects sunk into each other (parts of one spec may nest);
- a pipe that passes through a solid;
- a pipe end that lands on nothing.

Lengths are scaled so the set's longest side is about 100 audit units. `flat`, `line` and `model` parts are listed as
unchecked, never passed.

It also checks the labels: each name in `PINS` must be one part, seen from the iso camera (a ray toward +x +y +z meets
no other part), and `cut: 1` takes the skins off for a cutaway beat. A spec marked `hero: true` must have 15 or more
parts.

`scripts/iso_audit.mjs <film>` is the builder's command. It exits 0 when the world is clean, 3 when it names
problems, and 2 for a WARN (rerun). `node tests/iso-audit.mjs` checks it.

Not taken from Anatomy:

- **The SVG kit as the renderer.** Its look is technical line art with outlines, not `isometric-world`'s flat three
  tones, and its SVG is heavy to redraw every frame.
- **The 3D runtime and WebGL layer.** Both are beta and stateful, so they cannot be seeked frame by frame.
- **The line-end check.** It reads SVG DOM and cannot see a canvas.
- **The examples.** Their motion runs on rAF springs, not as a pure function of t.

Its paint-order solver (`settle`) could replace `build.js`'s box-based order later. That is a renderer change, left
for its own PR.
