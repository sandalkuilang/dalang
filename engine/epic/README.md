# engine/epic — the design languages

Vendored from [OrRon/EpicInfographics](https://github.com/OrRon/EpicInfographics) @ bf97e58
(`skills/epic-infographics/references/`, MIT, see `LICENSE`), unchanged except that only three of its design languages
are kept, for Express and Studio alike: `isometric-world` (the main one), `cutaway` (its close relative, the inside of
one thing) and `blueprint` (very detailed data), with `composition.md` and `charts.md` (the upstream's other references
are not kept). A mention of another language inside `composition.md` is upstream text and does not apply, as is its
pointer to the upstream's `illustration-and-texture.md`. Their own paths map here:
`references/design-languages/` → `languages/`, other `references/*.md` → this folder. Their scripts (`check.mjs`,
`render.mjs`, `animate.mjs`), `skeleton.html` and CSS keyframe recipes are not used: HyperFrames renders, and motion is
a pure function of t, drawn by `engine/iso` (Express, `references/express.md` Step 6) or the three.js set (Studio).

| File | Read |
|---|---|
| `languages/<one>.md` | exactly one, the film's language: palette, fonts, geometry, signature devices, do/don't |
| `composition.md` | when a beat's last frame picks its named pattern (`references/express.md`): the canvas is a place, tension rules |
| `charts.md` | before drawing any chart: SVG recipes and the maths |

`isometric-world` is the main language of every film, flat drawing made to read as 3D (2.5D) through layers and colour: three tones per face, layers moved by depth, haze and focus. `cutaway` joins it on the beats that open a thing up (the same object, its skin sliced away, numbered callouts); `blueprint` only on the beats that need engineering-grade detail (exact dimensions, tolerances, specs: an inset sheet, or a dissolve into linework of the same object). `SPEC.md` LOOK names the main language and the beats that use the other two, picked from the script without a question; the look never changes once the build starts. A request for a look outside the Brief's two (photoreal, footage, a generated image, a channel's own style) is answered in one line, and only its palette, type and overlay system are taken. The examples inside these files are the upstream's, never a list of allowed topics. Every language
runs in both formats, wide (16:9, 1920×1080) and story (9:16, 1080×1920); its scale is for a 1080 px short side.
