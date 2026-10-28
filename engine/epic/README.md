# engine/epic — the design languages

Vendored from [OrRon/EpicInfographics](https://github.com/OrRon/EpicInfographics) @ bf97e58
(`skills/epic-infographics/references/`, MIT, see `LICENSE`), unchanged except that only three of its design languages
are kept, for Express and Studio alike: `isometric-world` (the main one), `cutaway` (its close relative, the inside of
one thing) and `blueprint` (very detailed data). A mention of another language inside `composition.md`,
`illustration-and-texture.md` or `data-vocabulary.md` is upstream text and does not apply. Their own paths map here:
`references/design-languages/` → `languages/`, other `references/*.md` → this folder. Their scripts (`check.mjs`,
`render.mjs`, `animate.mjs`), `skeleton.html` and CSS keyframe recipes are not used: HyperFrames renders, and motion is
the GSAP timeline (`references/express.md` Step 6) or the three.js set's pure function of t (Studio).

| File | Read |
|---|---|
| `languages/<one>.md` | exactly one, the film's language: palette, fonts, geometry, signature devices, do/don't |
| `composition.md` | always: the canvas is a place, one named pattern, tension rules |
| `illustration-and-texture.md` | always: the object that carries the data, texture |
| `data-vocabulary.md` | always: varied data forms, one hero |
| `charts.md` | before drawing any chart: SVG recipes and the maths |

Pick: `isometric-world` by default, every topic; `cutaway` when the film is about the inside of one thing (how a machine, a body or a building works inside: same isometric view, paper palette, ink lines, numbered callouts); `blueprint` only when the film rests on very detailed data (many exact measures, dimensions, specs or tolerances the viewer must read). One language per film, picked from the subject without a question and named in `SPEC.md` LOOK; a language the user names wins. The examples inside these files are the upstream's, never a list of allowed topics. Every language
runs in both formats, wide (16:9, 1920×1080) and story (9:16, 1080×1920); its scale is for a 1080 px short side.
