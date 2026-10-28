# engine/epic — the design language

Vendored from [OrRon/EpicInfographics](https://github.com/OrRon/EpicInfographics) @ bf97e58
(`skills/epic-infographics/references/`, MIT, see `LICENSE`), unchanged except that only one of its design languages
is kept: `isometric-world`, the look of every film, Express and Studio alike. A mention of another language inside
`composition.md`, `illustration-and-texture.md` or `data-vocabulary.md` is upstream text and does not apply. A
section ("how it works", what is inside) is not another language: it is a cutaway inside the isometric world (Express:
`engine/iso` `skin`; Studio: `engine/three/cutaway.js`). Their own paths map here: `references/design-languages/` →
`languages/`, other `references/*.md` → this folder. Their scripts (`check.mjs`, `render.mjs`, `animate.mjs`),
`skeleton.html` and CSS keyframe recipes are not used: HyperFrames renders, and motion is the GSAP timeline
(`references/express.md` Step 6) or the three.js set's pure function of t (Studio).

| File | Read |
|---|---|
| `languages/isometric-world.md` | always: palette, fonts, geometry, signature devices, do/don't |
| `composition.md` | always: the canvas is a place, one named pattern, tension rules |
| `illustration-and-texture.md` | always: the object that carries the data, texture |
| `data-vocabulary.md` | always: varied data forms, one hero |
| `charts.md` | before drawing any chart: SVG recipes and the maths |

Every topic gets `isometric-world`, whatever its subject (a machine, a body, money, sport, history, an idea): the
subject becomes a small world on a floating slab; its examples are the upstream's, never a list of allowed topics. It
runs in both formats: wide (16:9, 1920×1080, the `Iso` default and `isoCamera(1920, 1080)`) and story (9:16, 1080×1920,
pass `W, H`); the language's scale is for a 1080 px short side.
