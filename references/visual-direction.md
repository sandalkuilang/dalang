# Visual direction

Turns "modern, top-notch, not overdone, true to life" into numbers. Read the § a step names; where it overlaps `/hyperframes`, `/hyperframes` wins on mechanics, this file on the look and the craft bar. Never jump from storyboard to polished scenes.

## 1. The hero is true (real reference, drawn or built)

Every film is **stylized** (one designed look, never footage or a photoreal render) and true to reality: right anatomy, parts, proportions, scale and behaviour, in a world dressed with what is really there. DALANG installs no image or video model and films nothing.

The hero is **drawn** as true shapes (Express), **modelled once** from 2D pictures as a Blender script and rendered in three.js (Studio: `hero-asset.md`), or **built** in three.js from its own law and real measures. Supporting objects may be a **CC0 / public-domain 3D model** re-dressed into the style (§1.1). Vector or CSS shapes stand in only for what has no real appearance (diagrams, charts, maps, UI, icons, type) and sit beside the subject, never instead of it.

### 1.1 Per subject: machines, models, people, checks

- **Machines start from a real reference:** 3–5 photos of the real thing (`find_media.mjs --type image`, make and model as the query, or the user's own); read the layout from them before drawing or modelling a part.
- **A supporting made object with internal anatomy: try a CC0 model before modelling by hand** (`find_media.mjs --type model --query "<1-2 English words>" --out review/models`; it prints licence, size, triangles, stated size and a contact sheet; then `--take ... --as assets/models/<name>.glb`). Dress it with `kit.model(path, { palette, kinds, real })` (`real` = the stated size, checked by `scaleAudit`). Model by hand when no model fits, or when its version of the film's part is wrong.
- **Sourcing, fast:** Commons queries of 1–2 English words, at most one per 2 s. Check thumbnails on one contact sheet before downloading (licence filters miss cartoons, logos, watermarks). Credit every CC BY file in `CREDITS.md`.
- **Moving subjects move by their own law:** posed from their cause (`camera-motion.md` §5), in Express eased with gravity and contact squash; never a cutout on bare transforms.
- **People are the hardest subject:** a stylized figure under the mitten rule (`craft-rules.md` §4), squash ≤ 8 %, or staged faceless (`camera-motion.md` §4). Never a stock 3D human or a still face with only a moving mouth.
- **Reality check before use:** for every drawn, built or found asset, download one real reference photo (`review/ref-<object>.jpg`, never published) and compare side by side on one contact sheet: parts and count, proportions, materials, colour pattern, scale, physics (shadows, contact, motion direction), and **where the action happens** (a key goes into the lock, a part sits in its machine). Simplify shapes; never invent, drop or move a part. A process the narration explains follows a cited diagram or measurement.
- An asset no source can supply: say so **before** the storyboard and decide without asking: build it from its reference, else rewrite the beat around what exists; log the choice.

## 2. Looks

The three languages and how beats pick them: `looks.md`.

## 3. Energy (the Step 1 "Energy" option)

| Energy | Average shot | Text-only rows | Moves | Springs (ζ) | Music | Fits |
|---|---|---|---|---|---|---|
| **Calm cinematic** | 3–5 s | ≤ 10 % | slow dollies, rack focus, long holds | 1.0 | 70–95 BPM | documentary, serious topics |
| **Modern balanced** (default) | 1.8–3 s | ≤ 15 % | motivated transitions, 0.3–0.6 s moves | 0.8 | 95–115 BPM | most explainers |
| **Punchy social** | 0.8–1.8 s | ≤ 25 % | whips, punch-ins, kinetic type every line | 0.72 | 115–130 BPM | 9:16 hooks, lists |

Calm's 24 fps variant (YouTube landscape only): `brief.md` Call 2 item 6. Energy changes rhythm, never restraint (§5); every energy holds 0.3–0.75 s before the payoff. `storyboard_lint.mjs` checks the average shot and text-only share against this table.

**Minimum motion (every energy): the subject acts, the camera alone doesn't count.** Every shot shows something physically happening (liquid flowing, a part turning, an object entering, falling, filling, a cutaway opening). A camera-only plate (drift, push, light sweep) is a breath: ≤ 1.5 s, ≤ 15 % of the runtime, whatever `stillness.mjs` scores. Calm = slow action, not no action. Plan each shot's action in the storyboard's "Subject action" column (`look-build.md` §5).

## 4. Animation principles, in code numbers

- **Timing:** ease by role (`/hyperframes` `motion.md`): arrivals `expo.out`, camera `power2.inOut`, exits `power3.in`; never the same 0.5 s `power2.out` on everything.
- **Anticipation:** a counter-move of 3–6 % of the distance for 80–120 ms before a big move.
- **Follow-through:** parts settle 60–120 ms after the body; the next element starts when the previous is 30–50 % done.
- **Arcs:** organic things and cameras travel on curves; machines and UI may move straight.
- **Squash & stretch:** stylised characters only, ≤ 8 %; real things get only their contact squash (`camera-motion.md` §5.2); never text or UI.
- **Secondary action:** one, at 50–70 % of the main move's distance, 100–200 ms later.
- **Staging:** one idea per shot; contrast, size, motion and accent point at the same thing within 0.3 s.
- **Exaggeration:** overshoot ≤ 4 % on arrivals (ζ ≥ 0.72), none on text, numbers or data (`camera-motion.md` §5).
- **Appeal:** silhouettes read at thumbnail size; one light direction; proportions consistent across shots.

## 5. Restraint: top-notch, not overdone

- **One hero move per shot;** at most **two** things move at once (background and camera not counted).
- The accent colour appears on **one** element per shot. Colour is a legend for the film (one hue per material or role); by default the shot's accent is the caption's key-word box.
- Text besides the caption follows §12: one claim headline (≤ 8 words), at most 3 cards at once; the caption never repeats them word for word (`repeats(CAPTIONS, LABELS)` in `type.js` warns).
- 3–5 transition kinds per film, each caused by something on screen; never the same entrance two beats in a row.
- Allowed finish: grain, vignette, depth of field, motion blur on fast moves.
- **Banned:** decorative glow, bloom or particles (a glow caused by current or heat, `circuit.js`, or a light shaft traced by `optics.js`, is the subject), lens flares, glass cards, pill chips (a caption's line backing and a leader-line label pill are not chips), neon, mesh gradients, corner labels, HUD decoration, three cards in a row, emoji icons, stock circuit patterns, text scramble, RGB split or glitch, chromatic aberration as a style, liquid blobs, morphing gradients, Corporate-Memphis characters, elastic bounce, a whoosh on every cut, Ken Burns on a still without parallax, tape / torn paper / VHS, white-flash transitions, pulsing or looping UI, AI-gloss renders.
- One "wow" moment per film.
- Continuous motion comes from the **subject acting** (§3), supported by the camera (`camera-motion.md` §8–9) and the light; never from breathing or pulsing text and UI.

## 6. Cinematography

Shot sizes, angles, moves, axis, cutting, rhythm: `camera-motion.md` §1–3. Here only:

- **Shot sizes vary:** wide → medium → close-up → insert; never more than two shots in a row at one size.
- **Lens feel** (`object-studio`): product shots as at 85–100 mm, environments at 24–35 mm; isometric looks use zoom and layer blur (`camera-motion.md` §1).
- **Depth:** three layers (`express.md` "Look rules" holds the ratios); text and captions fixed to the frame; an occasional blurred foreground element (5–10 % of the frame).
- **Rack focus** as a transition: 0.4–0.6 s.
- **Screen direction:** left stays left; progress moves left → right (right → left for RTL languages); a comparison's sides fixed for the film.
- **Motivated light:** every highlight has a source; one key direction per scene.
- **Colour script:** a mood per section that shifts with the story (cool for the problem, warm for the answer; story-vs-explanation grading: `camera-motion.md` §9.1), written per section in `storyboard.md`.

## 7. Composition (read the format from `BRIEF.md`)

- The hero fills ≥ **45 % of the frame height or 70 % of its width** (this wins over `/hyperframes`' 40 %): push in, crop, or give it a world.
- Thirds or a strong centre on purpose; lead room where something faces or moves.
- Text safe zones per format: `craft-rules.md` §5.
- Comparisons on 9:16: sequential, stacked, one object in two states, or two subjects each with a card beside it (≤ 30 % of the width, §12); never side-by-side columns of prose.
- A number that is the point is the biggest thing on screen (220–320 px at 1080 wide), tabular figures, counting up over 1.2–1.6 s, then holding.
- **A number's tag decides its form** (`script-voice.md` §3): `[src]` → evidence card, `[calc]` → calculation card (`[assume]` inputs on a line labelled "assumption"), `[illus]` → illustration tag under the headline, `[unknown]` → the shown admission. Cards follow §12.

## 8. What the best educational videos do

- **The first frame is already the story:** no logo, title card or "in this video"; the hook's visual lands on the hook's first word.
- **Motion is the explanation:** the thing happens on screen. Show the mechanism behind every "why" (a cutaway into the machine, the camera flying into the part, particles behaving; built procedurally when simple and exact: a piston and crank, gears, a valve). Data moves physically: things fall, stack, fill, pour, with weight.
- **Visualise the claim, not the words:** "twice as much" = two things at true scale, not "2×".
- **Something new every 2–4 s** (a beat, a move, a reveal).
- **One visual metaphor per idea**, introduced once and reused.
- **Progressive disclosure:** build a diagram piece by piece, on the words that name each piece.
- **Real numbers as physical comparisons** (a stack of coins, a fill level, an everyday object at true scale) beat bar charts; a running tally (§12) keeps the thread.
- **Payoff frame:** the cleanest, biggest frame of the film, held ≥ 2 s.

## 9. Type, light, colour

- One display face and one body face. Bundled: Archivo Black, Outfit 700–800, Montserrat 800, Oswald for condensed numerals. Inter, Poppins, Space Grotesk, Geist and Instrument Serif only if the brand uses them. The face covers every glyph of the narration language (`craft-rules.md` §5).
- Sizes at 1080 wide: hero numbers 220–320 px, titles 96–140, labels ≥ 36, captions 54–64. `drawCaption` and `pinLabel` (`type.js`) enforce them, pick ink from the ground and keep labels above the caption; a caption phrase too long for two lines at 54 px reports `shrunk`: cut it. The active word's accent is the shot's one accent (unless an impact numeral holds it, §12).
- Titles enter in varied ways (`/hyperframes` `motion.md`); landed text is dead still until it leaves.
- The ground is a **set**, never a flat void: a radial light falloff (linear gradients band under H.264), a desk or paper plane, or `object-studio`'s sweep with a soft ground shadow.
- An object on a surface has a contact shadow (ellipse, ~30 px blur, 0.4 opacity) plus one soft drop shadow (y 24 px, 48 px blur, 0.18), in the scene's light direction.
- Colour: one ground, one ink, one accent, plus the subject's own colours. Atmosphere at 15–25 % opacity (5 % vanishes in compression). Ground light by default; the hero separates by value (≥ ~0.2 OKLCH L), never by a dark or saturated backdrop unless the user or a reference asks.

## 10. Style frames: approve the look before building

Studio: `look-build.md` §5.

## 11. Review rubric (Step 7, on every beat frame)

| Test | Pass when |
|---|---|
| Action | Muted and scrubbed, every shot has the subject doing something besides the camera (no drifting still over 1.5 s); every "why" beat shows its mechanism. A slideshow is a P0. |
| Stranger | One sentence describes the frame; the hero reads as the real thing without its label. |
| Set | The world is the one true to the subject at its real density (`looks.md` Set dressing); a bare place where the real one is full reads as a toy. A type-only or chart shot is judged on its design language. One style in every shot, silhouettes read at thumbnail size, contact shadows, consistent light and palette, believable scale, nothing clip-art or puppeted. |
| Reality | Checked against a real reference: anatomy, proportions, materials, colours; no modelling artefacts (extra or warped parts, garbled text); a process moves the way the real one does. People: natural weight, relaxed hands, no frozen limbs, judged in motion. |
| Restraint | At most two moving things, the accent used once, nothing from the banned list. |
| Craft | Eases vary by role, arrivals overlap, organic paths arc, no identical entrance two beats in a row; falls and bounces obey gravity and mass; no velocity cliffs. 3D: contacts posed from their cause, parts touch and never overlap at contact, the placement audit is empty, resting objects touch their surface, cables end in sockets, ambient motion is the real amount (`camera-motion.md` §5). |
| Consistency | Comparable moves share eases and durations on the MOTION line's base unit and stagger. |
| Strobing | At 24 fps, camera moves and fast bodies smear across a 180° shutter; sharp doubles or judder on a pan = P1 (at 30: only if it shows). |
| Camera | The SPEC technique palette, each technique doing a story job; every perceptible move from a real rig (2.5D layers or three.js; CSS only drifts) with its storyboard reason, one per beat; A and B shots cut as one film (`camera-motion.md` §8); the wow shot on the impact; angle from the asset, never a CSS rotation; axis and eyelines hold; cuts on the story word. |
| Cinematography | Sizes change with the job and tighten toward the key beat; screen direction kept; the colour script shifts by section; each shot fits its named emotion (`camera-motion.md` §10) and the SPEC rulebook; ratio, grain and halation constant except at a logged break; the final image rhymes with the opening. |
| Composition | The hero meets 45 % / 70 %, text in the safe band, no side-by-side prose on 9:16, the caption at its target position (`craft-rules.md` §5): a 9:16 caption block whose top is above ~70 % of the height (Reels, TikTok) or whose bottom is above ~65 % (Shorts) is a P1. |
| Figure-ground | At 360 px wide, squinted, the hero separates from the ground behind it by ≥ ~0.2 OKLCH L (`palette.mjs --compare` on snapshot colours). Weak = P1; merged = P0. |
| Clarity | The claim is visualised, not just written; the eye lands on the right thing within 0.3 s. |
| Quantity | Every compared quantity is shown by a §13 device before or as it is said; carried by text alone = P1. |
| Sound off | Muted, headlines and cards only: each section's claim can be stated. Otherwise P1. |
| No repeat | One fact, one layer (caption, headline, card, label). A repeat is a P1. |
| Phone | Every line meant to be read is readable at 360 px wide (`npx hyperframes snapshot --review`); captions clear the hero and the platform overlay. |

Fix every failure before Gate 4; a Set, Reality or merged Figure-ground fail (P0) is never kept; a P1 follows `qc.md` Step 7. Log each default the render fell into in `PRODUCTION.md` (never `SPEC.md`: editing it makes Gate 3 stale). Judge on full-resolution `snapshot` stills (`--zoom` on the subject), never on draft frames or the contact sheet alone.

## 12. Information layers: headline, cards, labels, captions

**One fact appears in one layer only** (the caption speaks it, the headline states its takeaway, a card holds its number, a label names its part). Sizes are px at the 1080 px short side; every line meant to be read is ≥ 36 px, in the narration language.

| Layer | Job | Size | Where and when |
|---|---|---|---|
| Claim headline | the current claim as a takeaway, its key term italic + underline in ink; a kicker over it (section or source, monospace caps, tracked +8–12 %); an optional status tag under it: ILLUSTRATION (`[illus]`), SPED UP, OUR MODEL (`[calc]`), one colour per tag for the film | headline 64–96 px bold, ≤ 8 words, ≤ 2 lines; kicker and tag 36 px | top of the text band; changes each claim beat (every 3–5 s); read alone, the headlines tell the argument; `textBand()` adds a scrim on a busy ground |
| Data card | one option's value, counting in sync with the world | ≤ 30 % of the width; value 72–110 px tabular, label 36 px | beside its subject: A left, B right, one hue per option for the film |
| World label | names a part ("PART · size") with a leader | ≥ 36 px (`pinLabel`) | on its part, above the caption, the language's pin style, never over the subject, ≤ 3 per frame |
| Caption | the spoken words | 54–64 px (`drawCaption`) | its target position (`craft-rules.md` §5) |

Card types (each counts as one of the 3 cards):
- **Evidence card** (`[src]`): a quote of ≤ ~12 words (44–52 px), then the source and "translation ours" when translated, 36 px monospace.
- **Calculation card** (`[calc]`): kicker "our calculation", one line per step, ≤ 4 lines at 44–56 px, `[assume]` inputs on a line labelled "assumption".
- **Running tally:** persists across sections and gains rows, ≤ 4 rows, labels 36–44 px, same place all film, beside (never instead of) the physical comparison of §8.
- **Time-compressed paired run** (`[calc]` numbers with a `state(t)`, `script-voice.md` "Numbers model"): two identical sets differing in one variable run side by side on `state(t)`; the A and B cards tick live, each status (RUNNING / OFF, a level) changes when the model says; the tag reads SPED UP and a 36 px footnote names the inputs ("sped up: one month · our model"). Every value from `numbers` and `state(t)`, never typed.
- **Impact numeral**: a large number ("≈ 4×"), 220–320 px (§7), landing on its beat word beside its subject; while on screen it takes the accent (accent budget below).
- **Recap checklist:** in the conclusion, one icon row per spoken item, ≤ 5 rows at 44–56 px.

Positions inside the text band (`craft-rules.md` §5, `safeArea` in `type.js`), as fractions of the height:

| Format | Headline (kicker, tag) | Cards | Caption |
|---|---|---|---|
| 9:16 Reels, TikTok | 13–28 %, x 6–88 % | 30–68 %, nothing right of 88 % | 72–82 % |
| 9:16 Shorts | 9–25 % (from 168 px) | 27–58 %, nothing right of x 950 px | ends at 69 % |
| 4:5 feed | 8–22 % | 25–72 %, inside 8 % margins | 76–92 % |
| 16:9 landscape | 5–20 %, left-aligned, ≤ 50 % width | 22–80 % | 85–95 % |

- **Accent budget** (§5): every layer uses ink except the impact numeral. With a numeral on screen it holds the shot's one accent and the caption's active word stays in ink (no box) until it leaves; otherwise the accent stays with the active word (§9). The A/B card hues are the options' identity colours, not the accent.
- At most **3 cards** besides the caption (headline and labels are not cards), never three in a row; the hero still meets §7.
- A/B sides and hues are fixed for the film; a card stays beside its subject.
- A layer **enters on its beat word**, is **dead still while read**, and **transforms, not vanishes**, when the claim changes (words change in place, a value counts on, the tally gains a row); it leaves only with its subject or section.
- Text is decided in the storyboard's Overlay column (`look-build.md` Step 5); Step 6 draws it from there and adds headline and card texts to `repeats()`.
- A compared quantity is shown in the world first (§13); the card only records it.

## 13. Showing a quantity: twin sets, flow arrows, the formula on the set, tags, sound words, gauges

Each device is one of the shot's moving things (§5), enters on its beat word, is still while read, and follows §12. Values come from `numbers` and `state(t)` (`script-voice.md` "Numbers model"), never typed: an arrow, a tile fill and a range card show the same number.

| Device | Use it when | Size and rules | Example |
|---|---|---|---|
| Twin sets | two options differ in one variable | one set built twice (`twinSets`, `examples/twin.js`), side by side or stacked on 9:16 (A left or top); only the variable differs, the same event plays in both; over time it becomes §12's paired run | two kettles of different power boiling the same litre |
| Flow arrows | an input and an output whose ratio is the claim | width = value on one scale for the film (`flowArrow`, `quantity.js`), thinnest ≥ 12 px; each labelled (`pinLabel` on its `anchor`, ≥ 36 px) | a gearbox: speed in, torque out |
| Formula on the set | a product or sum is the claim | each factor a tag on what it measures (edge tags on `tileFill`'s `edges`); the result fills one unit at a time (`tileFill(...).show(n)`); then a range card (`rangeBar`, `type.js`) fills to the need with a tick per option's capacity, the fitting option highlighted | paint for a wall: area in tiles, then litres against tin sizes |
| Condition tags | a decision rule with conditions | each named condition a visible labelled thing on the set (`pinLabel`), entering on its word; ≤ 3 at once | choosing a tent: wind, rain, a second sleeper |
| Sound word | a discrete physical event (click, snap, pop) | one or two words, 120–200 px, on the part at the event frame, in sync with its SFX, 0.5–0.8 s; once or twice per film, never on a claim | a seatbelt latching |
| Dimension line | a size the narration names on a real part | drafting style, monospace value from the numbers model (`dimension`, `quantity.js`), drawn on the frame over the parts so no part hides it; measure an edge nothing stands in front of; inside the label safe area (flips or shortens, else draws nothing and says why); value ≥ 36 px | a pipe's bore "22 mm" |
| Macro insert | the quantity is real but invisible (a gap, a pressure) | a push-in (`camera-motion.md` §9.6) to a real instrument in the world (a gauge with target and reading), or a leader label on the evidence | a tyre gauge at 1.8 bar against its 2.4 bar mark |

- The highlight (the fitting option, a gap tag) is the shot's one accent while on screen, never in a shot with an impact numeral.
- An arrow's label carries its value: no card repeats it; the caption may say the ratio.
- 9:16: stacked twin sets keep each set ≥ 40 % of the height; arrows and tags stay inside `safeArea`; a sound word sits on its part.
