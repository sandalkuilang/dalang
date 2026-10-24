# Visual direction

Work like the art director of a top studio — a feature-animation house, a premium product-film team, or the best educational channels — not like a slide designer. Left alone, code-made video lands on the same look every time: flat shapes on a cream or dark ground, pill chips, everything popping in, a small object in an empty frame. `/hyperframes` bans that look by name (`references/spec.md` "BANNED by default"). This file turns "modern, top-notch, not overdone, (hyper)realistic" into decisions and numbers.

Read it before the storyboard (Step 5) and again for the review (Step 7). Where it and `/hyperframes` overlap, `/hyperframes` wins on mechanics (`motion.md`, `look.md`, `spec.md`); this file decides the look and the craft bar.

## 0. How a studio works (and the order we copy)

| Studio stage | What it settles | Our step |
|---|---|---|
| Script + voice | the story, the timing | Steps 3–4 |
| Look development | the medium, light, palette, type, as numbers | `SPEC.md` LOOK line (Step 5) |
| Storyboard + colour script | one picture per beat; the colour mood per section | `storyboard.md` (Step 5) |
| Style frames | three frames at final quality prove the look | Gate 3 (§9) |
| Animatic / blocking | every scene at final timing with rough motion | Step 6 blocking pass |
| Animation polish | eases, overlap, secondary action | Step 6 polish pass |
| Lighting, comp, grade | one light direction, depth, grain, grade | Step 6, `media-treatment` |
| Sound | music, effects on beats, mix | Step 6 |
| Dailies | review against the rubric | Step 7 (§10) |

Never jump from storyboard straight to polished scenes. The cheap stages exist so the expensive ones are not redone.

## 1. The hero is real (the realism ladder)

A physical subject (a vehicle, a product, food, a place, a body, an animal, a machine, a building) is never built from `div`s or SVG circles. It must read as the real thing without a label. Take the first rung that exists:

| Rung | Source | Notes |
|---|---|---|
| 1 | The user's own photos or footage, or an official press kit | Ask in Step 1. Keep the brand's rules. |
| 2 | Licensed real photos (CC0 / CC BY): Wikimedia Commons API with a licence filter (more reliable than Openverse, which often times out) | Credit every CC BY file in `CREDITS.md`. No identifiable people without a release. |
| 3 | Generated photoreal stills: `npx hyperframes media-use resolve --type image` (HeyGen), or local FLUX (`mflux`) | Prompt like a photographer: lens, light, material, set ("85 mm, softbox key upper left, rim light right, matte black plastic, seamless grey sweep, shallow depth of field"). Never generate a real brand's logo or a real person. |
| 4 | Generated photoreal video, 2–5 s B-roll: `media-use resolve --type video` (HeyGen, or local LTX if installed) | For the shots where reality must move (pouring, driving, weather). Confirm cost first. Use at most one clip per section; it must match the grade. |
| 5 | 3D: a GLB with PBR materials (CC0 from Poly Haven, CC from Sketchfab) lit in three.js | Follow `/hyperframes` `references/types/3d.md`. Required for looks B and C. |
| 6 | Vector / CSS shapes | Only for diagrams, charts, maps, UI, icons, type, and the illustrated looks (F, G). |

- Cut photos out with `npx hyperframes remove-background`, then put them on a lit set with a contact shadow. A cutout floating on a flat colour is clip-art.
- Step 0 finds which rungs exist (`npx hyperframes media-use resolve --doctor`). If only rung 6 exists and the user picked a realistic look, say so **before** writing the storyboard and offer: send photos, sign in to HeyGen (`heygen auth login --oauth`, free allowance), or install `mflux` (free, Apple Silicon, several GB).
- **Hyperreal means believable, not shiny.** Real things have imperfections: micro-scratches, dust, uneven reflections, a slightly soft focus edge. Perfect plastic reads as CGI.

## 2. Looks (the Step 1 "Visual style" options)

Each look is a medium with numbers, not an adjective. Write the chosen one as the LOOK line of `SPEC.md`. "Feels like" names a genre so the user can picture it; it is never a licence to copy anyone's characters, frames, or brand.

| Look | Feels like | Use for | The medium in numbers |
|---|---|---|---|
| **A. Cinematic photoreal** (default for realism) | premium product film, high-end documentary B-roll | products, vehicles, places, food, comparisons | Real hero (rung 1–5) on a lit set. Key light upper left, rim light opposite, contact shadow 0.35–0.55 opacity with 24–40 px blur, background plate blurred 8–16 px. Grain 3–5 %, vignette 6–10 %, one grade through `media-treatment`. Palette: two colours sampled from the hero plus one accent. Data as thin overlays on the object. |
| **B. Premium 3D studio** | product launch keynote, tech reveal | one object as the payoff, mechanisms, cutaways | One object on a seamless sweep, physically based materials, roughness ≥ 0.45. Turn the environment or light, not the object. One camera dive per section. |
| **C. Stylised 3D animation** | feature-animation short, soft toy world | stories with characters, kids, gentle science | Rounded forms, no hard edges (bevel ≥ 4 % of size), soft subsurface "clay" materials, warm bounce light and sky fill, saturated but not neon. Characters follow the mitten rule (`craft-rules.md` §5) and act with squash ≤ 8 %. Needs rung 5 or generated stylised stills. |
| **D. Editorial kinetic type** | modern essay channel, campaign film | opinion, myths, lists, quotes, muted viewing | Type carries the film. Display face at 10–14 % of frame height on 9:16, tracking −2 % to −4 %, one accent word per line. Photos appear as cutouts. Cuts on the beat. |
| **E. Documentary collage** | investigative explainer, history channel | history, news, geography, "how did we get here" | Real archive photos and maps as paper cutouts with torn edges and 2–4 px offset shadows, halftone on photos, tape and marker accents, camera moving across a desk-like plane. Every photo is credited. |
| **F. Modern 2D motion design** | science explainer channel, infographic film | abstract ideas, systems, biology, space | Vector shapes **with light**: one shade and one highlight tone per colour, soft gradients inside shapes (radial), grain 2–4 %, depth from 3 parallax layers. Characters are simple and consistent. Never flat unlit shapes on a void. |
| **G. Ink + watercolour** | hand-made storybook | stories, history, gentle topics | `references/craft-rules.md` (boil, palette). |
| **H. Dimensional data** | data journalism, finance explainer | number-heavy topics | Charts built in reading order (`/hyperframes` `references/types/data.md`) with light and depth: soft shadows, one key light. Numbers as physical comparisons where possible (a stack, a distance, a scale). Never clip-art bars. |

**Mixing:** A may combine with D or H (a real hero with kinetic type or data overlays). E may combine with D and H. Never mix a photoreal look (A, B) with an illustrated one (C, F, G) in the same frame.

**Offering them in Step 1:** pick the 4 looks that fit the topic and the available asset rungs, recommended first; name the rest in the question text so "Other" can reach them. Give each option a `preview`: a 6–8 line text sketch of one frame of *this* topic in that look (what is in frame, light, type, motion), so the user chooses with the topic in mind.

## 3. Energy (the Step 1 "Motion feel" option)

| Energy | Average shot | Moves | Springs | Music | Fits |
|---|---|---|---|---|---|
| **Calm cinematic** | 3–5 s | slow dollies, rack focus, long holds | 1.0 (no bounce) | 70–95 BPM | documentary, premium, serious topics |
| **Modern balanced** (default) | 1.8–3 s | motivated transitions, 0.3–0.6 s moves | 0.8 | 95–115 BPM | most explainers |
| **Punchy social** | 0.8–1.8 s | whips, punch-ins, kinetic type on every line | 0.7 | 115–130 BPM | 9:16 hooks, lists, entertainment |

Energy changes rhythm, never restraint: §5 still holds at every energy. Even punchy films hold 0.3–0.75 s before the payoff.

## 4. Animation principles, in code numbers

The classic principles of animation, translated into what a timeline can do:

- **Timing & spacing** — ease by role (`/hyperframes` `motion.md`): arrivals on a long tail (`expo.out`), camera both ways (`power2.inOut`), exits accelerate (`power3.in`). The same 0.5 s `power2.out` on everything is the generated look.
- **Anticipation** — before a big move, a counter-move of 3–6 % of the distance for 80–120 ms.
- **Follow-through & overlap** — parts of one object settle 60–120 ms after the main body; the next element starts when the previous is 30–50 % done.
- **Arcs** — organic things (hands, thrown objects, characters, cameras) travel on curves, never straight diagonals. Machines and UI may move straight.
- **Squash & stretch** — characters and soft objects only, ≤ 8 % (C, F, G). Never on products, text, or UI.
- **Secondary action** — one, at 50–70 % of the main move's distance, starting 100–200 ms later.
- **Staging** — one idea per shot; the eye knows where to look within 0.3 s (contrast, size, motion, and the accent all point at the same thing).
- **Exaggeration** — restrained: overshoot ≤ 4 % on arrivals, none on text.
- **Appeal / solid drawing** — readable silhouettes at thumbnail size; one consistent light direction; consistent proportions across shots.

## 5. Restraint: top-notch, not overdone

- **One hero move per shot.** Everything else holds still or moves as secondary action.
- At most **two** things move at once, not counting the background or camera.
- The accent colour appears on **one** element per shot.
- One text block per frame besides the caption, at most 6 words. The caption never repeats the on-screen label word for word.
- 3–5 kinds of transition in a film, each caused by something on screen (`/hyperframes` `references/motion.md`). Never the same entrance two beats in a row.
- Allowed finish: grain, vignette, depth of field, motion blur on fast moves (`data-motion-blur="on"`), a subtle lens imperfection on photoreal looks (chromatic aberration ≤ 1 px at the edges).
- Banned: glow, bloom, particles as decoration, lens flares, glass cards, pill chips, neon, mesh gradients, corner labels, HUD decoration, three cards in a row, emoji as icons, stock "tech" circuit patterns.
- Continuous motion comes from the **camera** (a dolly of 1.00 → 1.04–1.06 over a shot, a 3–5° per second orbit in 3D, a slow parallax across a collage), the **light** (a slow sweep across the hero), or the **subject acting** (wheels turning, liquid pouring, a needle moving). Never from breathing or pulsing text and UI.

## 6. Cinematography

- **Shot sizes vary like a film:** establishing wide → medium → close-up → macro detail (insert). Never more than two shots in a row at the same size.
- **Lens feel:** product and portrait shots as if at 85–100 mm (little perspective, shallow focus); environments at 24–35 mm (depth, leading lines). In 2D, fake it with background blur and parallax ratio.
- **Depth:** three layers — background plate (blurred, moving at 0.3× the camera), hero (sharp, 0.6×), foreground of text and overlays (1.0×). An occasional out-of-focus foreground element (5–10 % of the frame, heavily blurred) sells depth.
- **Rack focus** is a transition: the blur moves from one layer to the other in 0.4–0.6 s.
- **Screen direction:** what is on the left stays on the left; progress moves left → right (right → left for right-to-left languages). Keep a comparison's sides fixed for the whole film.
- **Motivated light:** every highlight has a source you could point at. One key direction per scene.
- **Colour script:** each section gets a colour mood that shifts with the story (for example cool and neutral for the problem, warm for the answer), written per section in `storyboard.md`.

## 7. Composition (read the format from `BRIEF.md`)

- The hero fills at least **45 % of the frame height or 70 % of its width**. A small object in an empty frame is never a shot: push in, crop, or give it a world.
- Use thirds or a strong centre on purpose, never by default; leave lead room in the direction something faces or moves.
- On 9:16, text stays in the 168–1330 px band (`/hyperframes` `references/types/vertical.md`) and out of the right-hand rail (x > 950). Captions sit at the bottom of that band.
- Comparisons on 9:16 are sequential, stacked, or one object in two states, never two side-by-side columns.
- When a number is the point, it is the biggest thing on screen (220–320 px at 1080 wide), in tabular figures, counting up over 1.2–1.6 s and then holding.

## 8. What the best educational videos do

- **The first frame is already the story** — no logo, no title card, no "in this video". The hook's visual lands with the hook's first word.
- **Visualise the claim, don't illustrate the words.** If the narration says "twice as much", show two things at true scale, not the word "2×".
- **Something new every 2–4 s** (a beat, a camera move, a reveal) — the retention curve punishes static stretches more than fast ones.
- **One visual metaphor per idea**, introduced once and reused (callbacks), so the viewer learns the film's language.
- **Progressive disclosure:** build a diagram piece by piece in reading order, on the words that name each piece.
- **Real numbers as physical comparisons** (a stack of coins, a distance on a map, a fill level) beat bar charts.
- **Payoff frame:** the last idea is the cleanest, biggest frame of the film, held at least 2 s.

## 9. Type, light, colour

- One display face with character and one body face. From the bundled set: Archivo Black, Outfit 700–800, Montserrat 800, or Oswald for condensed numerals. Inter, Poppins, Space Grotesk, Geist and Instrument Serif are generated-look defaults; use them only if the brand does. Check the face covers every glyph of the narration language (`craft-rules.md` §6).
- Sizes at 1080 wide: hero numbers 220–320 px, titles 96–140 px, labels at least 36 px, captions 54–64 px.
- Titles enter in one of the varied ways in `/hyperframes` `motion.md`; once landed, text is dead still until it leaves.
- The ground is a **set**, never a flat void: a radial light falloff (linear gradients band under H.264), a photo plate, a desk or paper plane, or a 3D sweep.
- Every object that sits on something has a contact shadow (an ellipse with ~30 px blur at 0.4 opacity) plus one soft drop shadow (y 24 px, 48 px blur, 0.18 opacity), in the scene's light direction.
- Grade, grain and blur on photos or footage go through `npx hyperframes media-treatment`, never CSS filters (the `/hyperframes` contract).
- Colour: one ground, one ink, one accent, plus the subject's own colours. Atmosphere at 15–25 % opacity; anything at 5 % vanishes in compression.

## 10. Style frames: approve the look before building

Before building every scene, build **three style frames** at final quality: the hook frame, one data or explanation beat, and the payoff. Render them as stills (`npx hyperframes snapshot --at <t1>,<t2>,<t3>`) and show them with the LOOK line of `SPEC.md` and the energy from `BRIEF.md`. The user approves the look here (part of Gate 3). Changing a look costs three frames now, or every scene later.

## 11. Review rubric (Step 7, on every beat frame)

| Test | Pass when |
|---|---|
| Stranger | One sentence describes the frame, and the hero reads as the real thing without its label. |
| Realism (A, B, C, E) | Contact shadows present, light direction consistent across objects, believable scale, surfaces with some imperfection, nothing that looks like clip-art. |
| Restraint | At most two moving things, the accent used once, nothing from the banned list. |
| Craft | Eases vary by role, arrivals overlap, organic paths arc, no identical entrance two beats in a row. |
| Cinematography | Shot sizes vary, screen direction is kept, the colour script shifts by section. |
| Composition | The hero meets the 45 % / 70 % size, text sits in the safe band, no side-by-side columns on 9:16. |
| Clarity | The claim is visualised (not just written), and the eye lands on the right thing within 0.3 s. |
| Phone | Every line meant to be read is readable at 360 px wide (`npx hyperframes snapshot --review`). |

Fix every failure before Gate 4. Add each default the render fell into to the BANNED line of `SPEC.md`.
