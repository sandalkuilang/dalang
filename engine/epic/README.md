# engine/epic — Express design languages

Vendored from [OrRon/EpicInfographics](https://github.com/OrRon/EpicInfographics) @ bf97e58
(`skills/epic-infographics/references/`, MIT, see `LICENSE`), unchanged except that only three of its design languages
are kept: `cutaway`, `isometric-world` and `blueprint`. A mention of another language inside `composition.md`,
`illustration-and-texture.md` or `data-vocabulary.md` is upstream text and does not apply. Express's builder reads these to design each beat as a
finished infographic. Their own paths map here: `references/design-languages/` → `languages/`, other
`references/*.md` → this folder. Their scripts (`check.mjs`, `render.mjs`, `animate.mjs`), `skeleton.html` and CSS
keyframe recipes are not used: HyperFrames renders, and motion is the GSAP timeline (`references/express.md` Step 6).

| File | Read |
|---|---|
| `languages/<one>.md` | exactly one, the film's design language: palette, fonts, geometry, signature devices, do/don't |
| `composition.md` | always: the canvas is a place, one named pattern, tension rules |
| `illustration-and-texture.md` | always: the object that carries the data, texture |
| `data-vocabulary.md` | always: varied data forms, one hero |
| `charts.md` | before drawing any chart: SVG recipes and the maths |

Pick by subject: how it works / inside a machine, a product, a body → `cutaway`; systems, places, flows, a process
over time → `isometric-world` (draw it with `engine/iso/iso.js`); technical, engineering, measured or number-led →
`blueprint`. Any other topic (money, sport, health, people, society…) → the one whose mood fits closest, and
`isometric-world` when none does: every topic gets a language. The examples inside these files are the upstream's,
never a list of allowed topics. `isometric-world` runs in both formats: wide (16:9, 1920×1080, the `Iso` default) and
story (9:16, 1080×1920, pass `W, H` to the constructor); the language's scale is for a 1080 px canvas.
