# engine/epic — Express design languages

Vendored unchanged from [OrRon/EpicInfographics](https://github.com/OrRon/EpicInfographics) @ bf97e58
(`skills/epic-infographics/references/`, MIT, see `LICENSE`). Express's builder reads these to design each beat as a
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

Pick by subject: how it works / inside a machine → `cutaway`; systems, places, flows → `isometric-world`
(draw it with `engine/iso/iso.js`); technical, engineering → `blueprint`; journeys, places, vistas → `park-poster`;
nature, anatomy, science → `naturalist-plate`; warm, craft, food → `retro-print`; friendly how-to → `hand-drawn`;
dramatic tech → `dark-glass`; literary, history → `editorial`. Any other topic (money, sport, health, people,
society…) → the language whose mood fits closest, and `editorial` when none does: every topic gets a language. The
examples inside these files are the upstream's, never a list of allowed topics. `swiss`, `corporate-clean` and `neo-brutalist` are
flat by construction: only when the user asks for that look.
