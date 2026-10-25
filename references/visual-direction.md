# Visual direction

Work like the art director of a top studio — a feature-animation house, a premium product-film team, or the best educational channels — not like a slide designer. Left alone, code-made video lands on the same look every time: flat shapes on a cream or dark ground, pill chips, everything popping in, a small object in an empty frame. `/hyperframes` bans that look by name (`references/spec.md` "BANNED by default"). This file turns "modern, top-notch, not overdone, (hyper)realistic" into decisions and numbers.

Read it before the storyboard (Step 5) and again for the review (Step 7). Where it and `/hyperframes` overlap, `/hyperframes` wins on mechanics (`motion.md`, `look.md`, `spec.md`); this file decides the look and the craft bar.

## 0. How a studio works (and the order we copy)

| Studio stage | What it settles | Our step |
|---|---|---|
| Script + voice | the story, the timing | Steps 3–4 |
| Look development | the medium, light, palette, type, as numbers | `SPEC.md` LOOK line (Step 5) |
| Storyboard + colour script | one picture per beat; the colour mood per section | `storyboard.md` (Step 5) |
| Style frames | three frames at final quality prove the look | Gate 3 (§10) |
| Animatic / blocking | every scene at final timing with rough motion | Step 6 blocking pass |
| Animation polish | eases, overlap, secondary action | Step 6 polish pass |
| Lighting, comp, grade | one light direction, depth, grain, grade | Step 6, `media-treatment` |
| Sound | music, effects on beats, mix | Step 6 |
| Dailies | review against the rubric | Step 7 (§11) |

Never jump from storyboard straight to polished scenes. The cheap stages exist so the expensive ones are not redone.

## 1. The hero is real (the realism ladder)

A physical subject (a vehicle, a product, food, a place, a body, an animal, a machine, a building) is **hyperreal in every look**: never built from `div`s, SVG or vector shapes. It must read as the real thing without a label, true to reality: right anatomy and proportions, real materials, believable scale, and behaviour that matches how the real thing moves or works. Take the first rung that exists:

| Rung | Source | Notes |
|---|---|---|
| 1 | The user's own photos or footage, or an official press kit | Ask in Step 1. Keep the brand's rules. |
| 2 | Licensed real photos and footage: Wikimedia Commons API with a licence filter (CC0 / CC BY / public domain, stills and video; more reliable than Openverse, which often times out), public-domain archives (NASA, NOAA, national libraries), Pexels / Pixabay (their free licence; check it per file; no model releases, so identifiable people are editorial use only) | Credit every CC BY file in `CREDITS.md`. No identifiable people without a release. Prefer high resolution: the hero crop must stay sharp at the output size. |
| 3 | Generated photoreal stills: local `mflux` (free, private; on 16 GB: Z-Image Turbo 4-bit or FLUX.2 klein 4B — Apache-2.0; never klein 9B, non-commercial). Paid, only if the user asks: `codex` `image_gen` (ChatGPT plan) | Prompt like a photographer, never with boosters (`camera-motion.md` §9): capture medium, size · angle · lens with its visible result, one motivated light, materials, 3 located imperfections. Never generate a real brand's logo or a real person. |
| 4 | Generated photoreal video, 2–5 s, from an approved rung 1–3 still. Free: a local image-to-video model only if it is installed and passes the Reality check on this machine (Wan 2.2 TI2V-5B is borderline on 16 GB, unverified; local LTX only as a low-resolution test). Paid, only if the user asks: HeyGen image-to-video (`heygen video create`; `/media-use` `references/operations.md`) — not `resolve --type video`, which makes a talking-presenter avatar | For the shots where reality must move (an animal acting, pouring, driving). No free generator → real footage or restage (row notes below), never a drawn or puppeted subject. Use at most one clip per section; it must match the grade and pass the Reality check. |
| 5 | 3D: a GLB with PBR materials (CC0 from Poly Haven, CC from Sketchfab) lit in three.js | Follow `/hyperframes` `references/types/3d.md`. Required for looks B and C. |
| 6 | Vector / CSS shapes | Only for what has no real appearance: diagrams, charts, maps, UI, icons, type, abstract ideas — and drawn over or beside the real subject, never instead of it. |

- **Sourcing rung 2, fast.** Commons search: 1–2-word English queries (long ones return nothing), at most one query per 2 s (429s follow bursts). Look before you download: request posters/thumbnails (`prop=imageinfo&iiprop=url|size|mime&iiurlwidth=480`, also for videos) and check them on one contact sheet — a licence filter does not catch cartoons, logos or watermarks. For video prefer the 1080p transcode (`…/transcoded/<file>/<file>.1080p.vp9.webm`) over a huge original.
- **"Sharp at output size", measured.** Stills: the hero crop has at least as many pixels as it fills on screen. Video: check the source's resolution and bitrate (`ffprobe … format=bit_rate`, before any re-encode); compare candidate clips with `ffmpeg -nostats -t 4 -i <clip> -vf blurdetect -f null - 2>&1 | grep "blur mean"` (lower = sharper) and take the sharpest that tells the beat. A clip clearly softer than its neighbours is a Realism fail; use it smaller (wide, not a 1:1 crop) or find another. (ponytail: no absolute blur threshold yet; calibrate once enough films are measured.)
- **Moving subjects.** A subject that acts (an animal moving, hands working, a machine running, liquid pouring) moves as footage (rungs 1, 2, 4) or a rigged 3D model (rung 5). A still photo only takes camera moves — push, parallax, light sweep, rack focus; puppeting a photo cutout with transforms reads as a paper doll. No footage of the exact action → rung 4 generated video, or restage the beat around real stills (a sequence of real frames, a slow push on the key moment).
- **People are the hardest subject** — viewers spot stiff human motion instantly. A person who moves or speaks on screen is real footage (rung 1–2; a release for identifiable people) or generated video (rung 4), never a photo cutout moved with transforms, a 2D/3D puppet rig, a stock 3D human, or a still face with only a moving mouth. Real motion has signs of life: weight shifting between the feet, breathing, small idle sway, blinks and eye movement, hands and fingers in natural relaxed poses, hair and clothes following with a delay, joints only within their real range, gait with heel strike and arm swing. A talking person needs real speech footage or a lip-sync model whose mouth shapes match the narration (closed lips on p/b/m). No such source → restage the beat with faceless staging (`camera-motion.md` §4): hands mid-action, an object crossing a threshold, a silhouette, or a cut to what they talk about. Generated people get the strictest Reality check (hands, teeth, eyes, symmetry, limbs that don't bend or melt mid-motion), sampled across the whole clip, not one frame.
- **Reality check before use.** For every generated or 3D asset, find one real reference photo or clip of the subject first and compare: anatomy (limb and digit count, joints, eyes), proportions, materials, colour pattern, scale against nearby objects, physics (shadows, contact, motion direction). Reject warped anatomy, melted detail, garbled text or logos, extra or missing parts. Generate again or go one rung up. A process the narration explains (a reflex, a mechanism, a reaction) follows real footage or a cited diagram, frame for frame where it matters.
- Cut photos out with `npx hyperframes remove-background`, then put them on a lit set with a contact shadow. A cutout floating on a flat colour is clip-art.
- Step 0 (`preflight.mjs`) finds which generators exist; rung 2 is always reachable. If a beat needs an asset no rung can supply, say so **before** writing the storyboard and offer the free options: send photos or footage, or install `mflux` (free, Apple Silicon, ~6 GB for Z-Image Turbo 4-bit) — or rewrite that beat around what real material exists. Never fall back to drawing the subject.
- **Compositing must not betray it:** clean cutout edges (no halo or fringe), the hero's light direction, colour temperature, grain and sharpness matched to the plate, a contact shadow, correct perspective and scale, motion blur on fast moves. One grade over everything (`media-treatment`).
- **Hyperreal means believable, not shiny.** Real things have imperfections: micro-scratches, dust, uneven reflections, a slightly soft focus edge. Perfect plastic reads as CGI.

## 2. Looks

The eight looks, how they mix, and how to offer them in Step 1: `looks.md`. Step 5 needs only the chosen look's row.

## 3. Energy (the Step 1 "Energy" option)

| Energy | Average shot | Moves | Springs | Music | Fits |
|---|---|---|---|---|---|
| **Calm cinematic** | 3–5 s | slow dollies, rack focus, long holds | 1.0 (no bounce) | 70–95 BPM | documentary, premium, serious topics |
| **Modern balanced** (default) | 1.8–3 s | motivated transitions, 0.3–0.6 s moves | 0.8 | 95–115 BPM | most explainers |
| **Punchy social** | 0.8–1.8 s | whips, punch-ins, kinetic type on every line | 0.7 | 115–130 BPM | 9:16 hooks, lists, entertainment |

Energy changes rhythm, never restraint: §5 still holds at every energy. Even punchy films hold 0.3–0.75 s before the payoff.

**Minimum motion (every energy, measured by `stillness.mjs`):** calm means slow, not still. In one run a 1.00 → 1.06 dolly plus a 15 px/s drift measured 24 % still; it passed (≈ 4 %) once each shot had a subject acting continuously (a tail, a swing, a turning part) or a background drift ≥ 30 px/s at 1080 wide, and the payoff pushed ≥ 1.08. Plan that motion in the storyboard's "Continuous motion" column, not after the QC fails.

## 4. Animation principles, in code numbers

The classic principles of animation, translated into what a timeline can do:

- **Timing & spacing** — ease by role (`/hyperframes` `motion.md`): arrivals on a long tail (`expo.out`), camera both ways (`power2.inOut`), exits accelerate (`power3.in`). The same 0.5 s `power2.out` on everything is the generated look.
- **Anticipation** — before a big move, a counter-move of 3–6 % of the distance for 80–120 ms.
- **Follow-through & overlap** — parts of one object settle 60–120 ms after the main body; the next element starts when the previous is 30–50 % done.
- **Arcs** — organic things (hands, thrown objects, characters, cameras) travel on curves, never straight diagonals. Machines and UI may move straight.
- **Squash & stretch** — stylised characters only, ≤ 8 % (C, G). Never on a real subject, products, text, or UI: real things deform only as they really do.
- **Secondary action** — one, at 50–70 % of the main move's distance, starting 100–200 ms later.
- **Staging** — one idea per shot; the eye knows where to look within 0.3 s (contrast, size, motion, and the accent all point at the same thing).
- **Exaggeration** — restrained: overshoot ≤ 4 % on arrivals (spring damping ζ ≥ 0.72), none on text, numbers or data. Physical timing (gravity, mass, √distance durations, springs): `camera-motion.md` §5.
- **Appeal / solid drawing** — readable silhouettes at thumbnail size; one consistent light direction; consistent proportions across shots.

## 5. Restraint: top-notch, not overdone

- **One hero move per shot.** Everything else holds still or moves as secondary action.
- At most **two** things move at once, not counting the background or camera.
- The accent colour appears on **one** element per shot.
- One text block per frame besides the caption, at most 6 words. The caption never repeats the on-screen label word for word.
- 3–5 kinds of transition in a film, each caused by something on screen (`/hyperframes` `references/motion.md`). Never the same entrance two beats in a row.
- Allowed finish: grain, vignette, depth of field, motion blur on fast moves (`data-motion-blur="on"`), a subtle lens imperfection on photoreal looks (chromatic aberration ≤ 1 px at the edges).
- Banned: glow, bloom, particles as decoration, lens flares, glass cards, pill chips, neon, mesh gradients, corner labels, HUD decoration, three cards in a row, emoji as icons, stock "tech" circuit patterns; also the dated 2026 tells: text scramble or decode, RGB split or glitch, chromatic aberration as a style (the ≤ 1 px edge imperfection above is fine), liquid blobs and morphing gradients, isometric 3D, Corporate-Memphis characters, elastic bounce, a whoosh on every cut, Ken Burns on a still without parallax (`camera-motion.md` §6.8), the "imperfection kit" (tape, torn paper, VHS), white-flash transitions, pulsing or looping UI, over-smooth AI-gloss renders.
- One "wow" moment per film; a second cancels the first.
- Continuous motion comes from the **camera** (a dolly of 1.00 → 1.04–1.06 over a shot, a 3–5° per second orbit in 3D, a slow parallax across a collage), the **light** (a slow sweep across the hero), or the **subject acting** (wheels turning, liquid pouring, a needle moving). Never from breathing or pulsing text and UI.

## 6. Cinematography

Shot sizes, angles and moves chosen by their job, the axis, cutting and rhythm: `camera-motion.md` §1–3.


- **Shot sizes vary like a film:** establishing wide → medium → close-up → macro detail (insert). Never more than two shots in a row at the same size.
- **Lens feel:** product and portrait shots as if at 85–100 mm (little perspective, shallow focus); environments at 24–35 mm (depth, leading lines). In 2D, fake it with background blur and parallax ratio.
- **Depth:** three layers — background plate (blurred, moving at 0.3× the camera), hero (sharp, 0.6×), foreground of text and overlays (1.0×). An occasional out-of-focus foreground element (5–10 % of the frame, heavily blurred) sells depth.
- **Rack focus** is a transition: the blur moves from one layer to the other in 0.4–0.6 s.
- **Screen direction:** what is on the left stays on the left; progress moves left → right (right → left for right-to-left languages). Keep a comparison's sides fixed for the whole film.
- **Motivated light:** every highlight has a source you could point at. One key direction per scene.
- **Colour script:** each section gets a colour mood that shifts with the story (for example cool and neutral for the problem, warm for the answer), written per section in `storyboard.md`.

## 7. Composition (read the format from `BRIEF.md`)

- The hero fills at least **45 % of the frame height or 70 % of its width** (stricter than `/hyperframes`' 40 %; this one wins). A small object in an empty frame is never a shot: push in, crop, or give it a world.
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

Before building every scene, build **three style frames** at final quality: the hook frame, one data or explanation beat, and the payoff. Build them as a small composition in `style-frames/src/` (one ~3 s clip per frame, the real assets and rig, the `/hyperframes` contract and format guide only), render stills with `npx hyperframes snapshot --at <mid1>,<mid2>,<mid3> --describe false`, and check them on the contact sheet. This is a look test, not building scenes; Step 6 reuses its parts. Show them with the LOOK line of `SPEC.md` and the energy from `BRIEF.md`. The user approves the look here (part of Gate 3). Changing a look costs three frames now, or every scene later.

## 11. Review rubric (Step 7, on every beat frame)

| Test | Pass when |
|---|---|
| Stranger | One sentence describes the frame, and the hero reads as the real thing without its label. |
| Realism (every look) | The subject is a real or photoreal source, sharp at output size; contact shadows present, light direction and grade consistent across objects, clean cutout edges, believable scale, surfaces with some imperfection, nothing that looks like clip-art or a puppeted cutout. |
| Reality | Checked against a real reference: anatomy, proportions, materials and colours correct; no generation artefacts (extra or warped parts, melted detail, garbled text); a process shown moves the way the real one does. People: natural weight and balance, relaxed hands, blinks, no frozen limbs, lips in sync — judged in motion (scrub the clip), not on a still. |
| Restraint | At most two moving things, the accent used once, nothing from the banned list. |
| Craft | Eases vary by role, arrivals overlap, organic paths arc, no identical entrance two beats in a row; falls, landings and bounces obey gravity and mass; no velocity cliffs on multi-point paths. |
| Consistency | Comparable moves use the same eases and durations on the MOTION line's base unit and stagger; groups move together. |
| Camera | Every perceptible move has its reason from the storyboard and one move per beat; angle and lens came from the asset, not a CSS rotation; the scene's axis and eyelines hold; cuts land on the emotional or story word. |
| Cinematography | Shot sizes change with the shot's job and tighten toward the key beat, screen direction is kept, the colour script shifts by section. |
| Composition | The hero meets the 45 % / 70 % size, text sits in the safe band, no side-by-side columns on 9:16. |
| Clarity | The claim is visualised (not just written), and the eye lands on the right thing within 0.3 s. |
| Phone | Every line meant to be read is readable at 360 px wide (`npx hyperframes snapshot --review`). |

Fix every failure before Gate 4; a Realism or Reality fail is never "kept as weakest shot". Add each default the render fell into to the BANNED line of `SPEC.md`. Judge realism on full-resolution `snapshot` stills (rendered from the composition at final quality; zoom on the subject with `--zoom`), never on frames of the 10 fps draft or the contact sheet alone.
