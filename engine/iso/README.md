# engine/iso — the Express look

`iso.js` is lemo-opuscar's isometric infographic engine (`styles/iso-infographic/demo/engine.js`, MIT, LICENSE beside it),
vendored unchanged; its first line names the source commit. Canvas 2D, no dependency, no three.js.

- `new Iso(ctx, W, H)`; `iso.cam = { x, y, z, k }` (k = px per unit); queue primitives, then `iso.flush()` paints them back
  to front (depth x + y + z): `box`, `prism`, `cyl`, `cone`, `roof`, `sphere`, `flat`, `line3`, `bill`, `text3`, `push`/`pop`
  local frames; `iso.desat` + `iso.keep` grey out all but the subject.
- `tri(colour)` → three tones (top, left, right). Helpers: `pin`, `inset`, `ring`, `cutLine`, `hatch`, `ICON.*` +
  `iconGrid` (Isotype), `person`, `shape()` (a 2D outline → a shaded solid), easing `ss`, `eo`, `eio`, `back`.
- In a HyperFrames scene: a paused GSAP timeline holds the values and redraws the canvas in `onUpdate`
  (`references/express.md` Step 6). `node tests/iso.mjs` checks it still loads and paints back to front.
