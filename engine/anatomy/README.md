# engine/anatomy — proving an Express world

The geometry audit of [Anatomy](https://github.com/wheresryan22/anatomy) (MIT, `LICENSE`), vendored unchanged from
`1482e8469b0a9e0d8cc18ea2740a01423d29ae80`: `audit.mjs` and its imports `iso-kit.mjs`, `lathe.mjs`, `tube.mjs`. Node
built-ins only. Its SVG renderer, 3D runtime, line-end check and examples are not used.

`world.mjs` (DALANG, MIT): `auditWorld(WORLD, { values, ground, floor, cut, pins })` reads engine/iso `build()` specs as
shapes (`box`/`figure`/`board` boxes, `cyl`/`wheel`/`gear` discs, `cone`/`lathe` turned bodies, `extrude` prisms,
`sphere` balls, `sweep` tubes; `flat`, `line`, `model` listed unchecked) and names a floating part, two objects sunk
into each other, a pipe through a solid, a pipe end on nothing, a `PINS` name that is not one part seen from the iso
camera (`cut: 1` takes skins off), and a `hero: true` spec under 15 parts.

`scripts/iso_audit.mjs <film>` runs it: 0 clean, 3 problems named, 2 WARN (rerun). `node tests/iso-audit.mjs` checks it.
