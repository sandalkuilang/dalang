# Visual direction

Left alone, code-made video lands on one look: flat shapes on a cream or dark ground, pill chips, everything popping in, a small object in an empty frame (`/hyperframes` `references/spec.md` "BANNED by default"). This file turns "modern, top-notch, not overdone, hyperreal" into decisions and numbers. Read the § a step names; where it and `/hyperframes` overlap, `/hyperframes` wins on mechanics, this file on the look and the craft bar. Pipeline order (story → look → storyboard → style frames → blocking → polish → review) is SKILL.md's steps; never jump from storyboard to polished scenes.

## 1. The hero is real (the realism ladder)

**Realism is the user's choice** (Step 1, `BRIEF.md` `realism`). **Hyperreal:** a physical subject (a vehicle, a product, food, a place, a body, an animal, a machine, a building) is hyperreal in every look: never built from `div`s, SVG or vector shapes. It must read as the real thing without a label, true to reality: right anatomy and proportions, real materials, believable scale, and behaviour that matches how the real thing moves or works. Take the first rung that exists:

| Rung | Source | Notes |
|---|---|---|
| 1 | The user's own photos or footage, or an official press kit | Ask in Step 1. Keep the brand's rules. |
| 2 | Licensed real photos and footage: Wikimedia Commons API with a licence filter (CC0 / CC BY / public domain, stills and video; more reliable than Openverse, which often times out; stills: `scripts/find_media.mjs --type image`, which tries Commons first and backs off on a 429), public-domain archives (NASA, NOAA, national libraries), Pexels / Pixabay stills **and video** through their free APIs (`PEXELS_API_KEY`, `PIXABAY_API_KEY`: free sign-up, ask the user once; real motion footage of everyday subjects — pouring, riding, machines running — is their strength) (their free licence; check it per file; no model releases, so identifiable people are editorial use only) | Credit every CC BY file in `CREDITS.md`. No identifiable people without a release. Prefer high resolution: the hero crop must stay sharp at the output size. |
| 3 | Generated photoreal stills — **only when the user asks, and paid.** DALANG installs no image model (a multi-GB install that loads the laptop). On request: `codex` `image_gen` (ChatGPT plan). A generator doesn't know how a machine is built: real geometry does ("Machines" below) | Prompt like a photographer, never with boosters (`camera-motion.md` §9): capture medium, size · angle · lens with its visible result, one motivated light, materials, 3 located imperfections. Never generate a real brand's logo or a real person. Check below. |
| 4 | Generated video — **not in the default path.** Local video models are too heavy for a laptop (minutes per second of video, a stalled machine), so DALANG installs none. Paid, only if the user asks: HeyGen image-to-video (`heygen video create`; `/media-use` `references/operations.md`) — not `resolve --type video`, which makes a talking-presenter avatar — or a clip the user generates in their own account and hands over. | Motion where reality must move comes from footage (rungs 1–2) or three.js (rung 5): light, fast, deterministic. No footage and no 3D model → restage the beat (row notes below), never a drawn or puppeted hyperreal subject. |
| 5 | 3D: a GLB with PBR materials (CC0 from Poly Haven, CC from Sketchfab) lit in three.js | Follow `/hyperframes` `references/types/3d.md`. Required for look B; stylized 3D (C, I) is built in three.js too, outside this ladder. |
| 6 | Vector / CSS shapes | Only for what has no real appearance: diagrams, charts, maps, UI, icons, type, abstract ideas — and drawn over or beside the real subject, never instead of it. |

### 1.1 Per subject and source: machines, sourcing, stills, people, checks

- **Machines and mechanisms start at rung 1–2.** Generators don't know how a specific machine is put together (engines came out bolted outside a vehicle's body, parts fixed to the wrong component). For a vehicle, engine, appliance or a repair step: ask the user for 3–5 phone photos of their own (they often own one), then search Commons **stills** as well as video (`filetype:bitmap`, the make and model as the query). A generated still (rung 3, on request) only for what the photos lack, framed so the machine is only a blurred edge.
- **Sourcing rung 2, fast.** Commons search: 1–2-word English queries (long ones return nothing), at most one query per 2 s (429s follow bursts). Look before you download: request posters/thumbnails (`prop=imageinfo&iiprop=url|size|mime&iiurlwidth=480`, also for videos) and check them on one contact sheet — a licence filter does not catch cartoons, logos or watermarks. For video prefer the 1080p transcode (`…/transcoded/<file>/<file>.1080p.vp9.webm`) over a huge original.
- **Generated stills (rung 3, on request):** check hands (fused fingers), held tools, clothing you didn't ask for, and structures with a rule (a honeycomb came out round, not hexagonal) against the real reference; one 9:16 frame is generated at 1088×1920 and cropped to 1080.
- **"Sharp at output size", measured.** Stills: the hero crop has at least as many pixels as it fills on screen. Video: check the source's resolution and bitrate (`ffprobe … format=bit_rate`, before any re-encode); compare candidate clips with `ffmpeg -nostats -t 4 -i <clip> -vf blurdetect -f null - 2>&1 | grep "blur mean"` (lower = sharper) and take the sharpest that tells the beat. A clip clearly softer than its neighbours is a Realism fail; use it smaller (wide, not a 1:1 crop) or find another.
- **Moving subjects.** A subject that acts (an animal moving, hands working, a machine running, liquid pouring) moves as footage (rungs 1–2) or a 3D model animated in three.js (rung 5). A still photo only takes camera moves — push, parallax, light sweep, rack focus; puppeting a photo cutout with transforms reads as a paper doll. No footage of the exact action → build it in three.js, or restage the beat around real stills (a sequence of real frames, a slow push on the key moment).
- **People are the hardest subject** — viewers spot stiff human motion instantly. In a hyperreal film, a person who moves or speaks on screen is real footage (rung 1–2; a release for identifiable people; a generated clip only as the paid exception above), never a photo cutout moved with transforms, a 2D/3D puppet rig, a stock 3D human, or a still face with only a moving mouth. Real motion has signs of life: weight shifting between the feet, breathing, small idle sway, blinks and eye movement, hands and fingers in natural relaxed poses, hair and clothes following with a delay, joints only within their real range, gait with heel strike and arm swing. A talking person needs real speech footage or a lip-sync model whose mouth shapes match the narration (closed lips on p/b/m). No such source → restage the beat with faceless staging (`camera-motion.md` §4): hands mid-action, an object crossing a threshold, a silhouette, or a cut to what they talk about. Generated people get the strictest Reality check (hands, teeth, eyes, symmetry, limbs that don't bend or melt mid-motion), sampled across the whole clip, not one frame.
- **Reality check before use.** For every generated or 3D asset, download one real reference photo or clip of the subject (`review/ref-<object>.jpg`, any licence: it is never published) and compare them side by side on one contact sheet, never against memory: anatomy (limb and digit count, joints, eyes), proportions, materials, colour pattern, scale against nearby objects, physics (shadows, contact, motion direction), and **where the action happens**: a hand, tool or liquid acts on the part where it really does (a key goes into the lock, not beside it; a needle enters the vial's stopper; a part sits in its machine, not loose on a table). Name that part and its neighbours in the prompt; when the generator keeps misplacing it, frame tighter so the wrong context can't appear. Reject warped anatomy, melted detail, garbled text or logos, extra or missing parts. Generate again or go one rung up. A process the narration explains (a reflex, a mechanism, a reaction) follows real footage or a cited diagram, frame for frame where it matters.
- Cut photos out with `npx hyperframes remove-background`, then put them on a lit set with a contact shadow. A cutout floating on a flat colour is clip-art.
- Rung 2 is always reachable and rung 5 (three.js) always runs. If a beat needs an asset no rung can supply, say so **before** writing the storyboard and offer the options: send photos or footage, build it in three.js, or rewrite that beat around what real material exists; a generated still only if the user asks for one. Never fall back to drawing a hyperreal subject.
- **Compositing must not betray it:** clean cutout edges (no halo or fringe), the hero's light direction, colour temperature, grain and sharpness matched to the plate, a contact shadow, correct perspective and scale, motion blur on fast moves. One grade over everything (`media-treatment`).
- **Stylized** (looks C, G, I): the subject is drawn, diorama or toon 3D and the ladder does not apply, but the Reality check does — parts, proportions, placement and motion come from a downloaded real reference, exactly as for hyperreal. Simplify shapes; never invent, drop or move a part. One style for the whole film: never a stylised subject next to a photoreal one.
- **Hyperreal means believable, not shiny.** Real things have imperfections: micro-scratches, dust, uneven reflections, a slightly soft focus edge. Perfect plastic reads as CGI.

## 2. Looks

The nine looks, how they mix, and how to offer them in Step 1: `looks.md`. Step 5 needs only the chosen look's row.

## 3. Energy (the Step 1 "Energy" option)

| Energy | Average shot | Text-only rows | Moves | Springs | Music | Fits |
|---|---|---|---|---|---|---|
| **Calm cinematic** | 3–5 s | ≤ 10 % | slow dollies, rack focus, long holds | 1.0 (no bounce) | 70–95 BPM | documentary, premium, serious topics |
| **Modern balanced** (default) | 1.8–3 s | ≤ 15 % | motivated transitions, 0.3–0.6 s moves | 0.8 | 95–115 BPM | most explainers |
| **Punchy social** | 0.8–1.8 s | ≤ 25 % | whips, punch-ins, kinetic type on every line | 0.72 | 115–130 BPM | 9:16 hooks, lists, entertainment |

Calm cinematic's 24 fps film-look variant (YouTube landscape only) is its own Step 1 option, `brief.md` Call 2 item 7.

Energy changes rhythm, never restraint: §5 still holds at every energy. Even punchy films hold 0.3–0.75 s before the payoff.

**Minimum motion (every energy): the subject acts, the camera alone doesn't count.** A still plate with a drift, a push or a light sweep is a slideshow, however well `stillness.mjs` scores it (pixels change, nothing happens; a whole film of drifting stills measured 0.8 % "still" and read as PowerPoint). Every shot shows something physically happening: liquid flowing, a part turning or sliding, an object entering, falling, filling or wearing out, a cutaway opening, a molecule moving. A camera-only plate is a breath: ≤ 1.5 s, ≤ 15 % of the runtime. Calm means slow action, not no action. Plan each shot's action and its source in the storyboard's "Subject action" column (`look-build.md` §5).

`storyboard_lint.mjs` checks the table against this one: the longest average shot and the text-only share (focal point is type, no physical subject acting from a real source) per energy.

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
- Text besides the caption follows the layers of §12: one claim headline (at most 8 words) and at most 3 cards on screen at once; an evidence or calculation card is sized by its own rule. The caption never repeats any of them word for word (`repeats(CAPTIONS, LABELS)` in `type.js` warns when it does).
- 3–5 kinds of transition in a film, each caused by something on screen (`/hyperframes` `references/motion.md`). Never the same entrance two beats in a row.
- Allowed finish: grain, vignette, depth of field, motion blur on fast moves (`data-motion-blur="on"`), a subtle lens imperfection on photoreal looks (chromatic aberration ≤ 1 px at the edges).
- Banned: glow, bloom, particles as decoration, lens flares, glass cards, pill chips (a caption's own per-line backing, `drawCaption` `pill`, is not a chip), neon, mesh gradients, corner labels, HUD decoration, three cards in a row, emoji as icons, stock "tech" circuit patterns; also the dated 2026 tells: text scramble or decode, RGB split or glitch, chromatic aberration as a style (the ≤ 1 px edge imperfection above is fine), liquid blobs and morphing gradients, isometric 3D, Corporate-Memphis characters, elastic bounce, a whoosh on every cut, Ken Burns on a still without parallax (`camera-motion.md` §6.8), the "imperfection kit" (tape, torn paper, VHS), white-flash transitions, pulsing or looping UI, over-smooth AI-gloss renders.
- One "wow" moment per film; a second cancels the first.
- Continuous motion comes first from the **subject acting** (§3 "Minimum motion"), supported by the **camera** (a real move, `camera-motion.md` §10–11) and the **light** (a sweep, a shadow passing). Never from breathing or pulsing text and UI.

## 6. Cinematography

Shot sizes, angles and moves chosen by their job, the axis, cutting and rhythm: `camera-motion.md` §1–3.


- **Shot sizes vary like a film:** establishing wide → medium → close-up → macro detail (insert). Never more than two shots in a row at the same size.
- **Lens feel:** product and portrait shots as if at 85–100 mm (little perspective, shallow focus); environments at 24–35 mm (depth, leading lines). In 2D, fake it with background blur and parallax ratio.
- **Depth:** three layers — background plate (blurred, moving at 0.3× the camera), hero (sharp, 0.6×), foreground of text and overlays (1.0×). An occasional out-of-focus foreground element (5–10 % of the frame, heavily blurred) sells depth.
- **Rack focus** is a transition: the blur moves from one layer to the other in 0.4–0.6 s.
- **Screen direction:** what is on the left stays on the left; progress moves left → right (right → left for right-to-left languages). Keep a comparison's sides fixed for the whole film.
- **Motivated light:** every highlight has a source you could point at. One key direction per scene.
- **Colour script:** each section gets a colour mood that shifts with the story (for example cool and neutral for the problem, warm for the answer; a story wrapped around an explanation may grade the story as night and the explanation bright, `camera-motion.md` §11.1), written per section in `storyboard.md`.

## 7. Composition (read the format from `BRIEF.md`)

- The hero fills at least **45 % of the frame height or 70 % of its width** (stricter than `/hyperframes`' 40 %; this one wins). A small object in an empty frame is never a shot: push in, crop, or give it a world.
- Use thirds or a strong centre on purpose, never by default; leave lead room in the direction something faces or moves.
- Text safe zones per format: `craft-rules.md` §6.
- Comparisons on 9:16 are sequential, stacked, one object in two states, or two subjects each with a data card anchored beside it (each card ≤ 30 % of the frame width, §12), which reads well at phone size; never two side-by-side columns of prose.
- When a number is the point, it is the biggest thing on screen (220–320 px at 1080 wide), in tabular figures, counting up over 1.2–1.6 s and then holding.
- **A number's tag decides its form** (`script-voice.md` §3): `[src]` → evidence card, `[calc]` → calculation card (its `[assume]` inputs on a line labelled "assumption"), `[illus]` → illustration tag under the headline, `[unknown]` → the shown admission. A card counts toward the 3 cards of §12: its quote is at most about 12 words and a calculation card at most 4 lines, with labels of at least 36 px, and the caption never repeats it word for word.

## 8. What the best educational videos do

- **The first frame is already the story** — no logo, no title card, no "in this video". The hook's visual lands with the hook's first word.
- **Motion is the explanation.** Top educational shorts don't show a picture and talk over it: the thing happens on screen. Show the mechanism behind every "why" — a cutaway or x-ray into the machine, the camera flying into the part, a macro of the material changing, molecules or particles behaving (3D, §1 rung 5: three.js PBR, built procedurally when the mechanism is simple and must be exact — a piston and crank, gears, a valve opening, a fluid film between two moving surfaces). Data moves physically too: things fall, stack, fill, pour, wear, with weight.
- **Visualise the claim, don't illustrate the words.** If the narration says "twice as much", show two things at true scale, not the word "2×".
- **Something new every 2–4 s** (a beat, a camera move, a reveal) — the retention curve punishes static stretches more than fast ones.
- **One visual metaphor per idea**, introduced once and reused (callbacks), so the viewer learns the film's language.
- **Progressive disclosure:** build a diagram piece by piece in reading order, on the words that name each piece.
- **Real numbers as physical comparisons** (a stack of coins, a distance on a map, a fill level, the quantity shown as an everyday object at true scale) beat bar charts; a small running tally beside them (§12) keeps the thread across sections.
- **Payoff frame:** the last idea is the cleanest, biggest frame of the film, held at least 2 s.

## 9. Type, light, colour

- One display face with character and one body face. From the bundled set: Archivo Black, Outfit 700–800, Montserrat 800, or Oswald for condensed numerals. Inter, Poppins, Space Grotesk, Geist and Instrument Serif are generated-look defaults; use them only if the brand does. Check the face covers every glyph of the narration language (`craft-rules.md` §6).
- Sizes at 1080 wide: hero numbers 220–320 px, titles 96–140 px, labels at least 36 px, captions 54–64 px. `drawCaption` and `pinLabel` in the engine's `type.js` enforce these, pick light or dark ink from the ground under the text and keep labels in the safe area above the caption (a long label wraps; a caption phrase too long for two lines at 54 px shrinks and reports `shrunk`, so cut it shorter). The accent colour of the active word counts as the one accent element of the shot (unless an impact numeral holds it, §12 accent budget).
- Titles enter in one of the varied ways in `/hyperframes` `motion.md`; once landed, text is dead still until it leaves.
- The ground is a **set**, never a flat void: a radial light falloff (linear gradients band under H.264), a photo plate, a desk or paper plane, or a 3D sweep (look C's seamless sweep with a soft ground shadow is one).
- Every object that sits on something has a contact shadow (an ellipse with ~30 px blur at 0.4 opacity) plus one soft drop shadow (y 24 px, 48 px blur, 0.18 opacity), in the scene's light direction.
- Grade, grain and blur on photos or footage go through `npx hyperframes media-treatment`, never CSS filters (the `/hyperframes` contract).
- Colour: one ground, one ink, one accent, plus the subject's own colours. Atmosphere at 15–25 % opacity; anything at 5 % vanishes in compression. The ground is light by default and the hero separates by value (look C's light set, dark detail; ≥ ~0.2 OKLCH L), never by a dark or saturated backdrop unless the user or a reference asks.

## 10. Style frames: approve the look before building

Three style frames at final quality plus a moving hook sample, approved at Gate 3: how to build them is in `look-build.md` §5.

## 11. Review rubric (Step 7, on every beat frame)

| Test | Pass when |
|---|---|
| Action | Muted and scrubbed, every shot has the subject doing something besides the camera moving (no drifting still longer than 1.5 s); every "why" beat shows its mechanism. A slideshow is a P0. |
| Stranger | One sentence describes the frame, and the hero reads as the real thing without its label. |
| Realism | Both: the world around the subject is the one true to it, at its real density (`looks.md` Set dressing): a room's used surfaces, a lab bench's glassware, space's sparse stars, an electrolyte crowded with ions; a place left bare where the real one is full reads as a toy. A type (D) or data (H) shot is judged on its own look instead. Stylized: one style in every shot (same tone ramp, line weight, palette), silhouettes read at thumbnail size, nothing photoreal mixed in. Hyperreal: the subject is a real or photoreal source, sharp at output size; contact shadows present, light direction and grade consistent across objects, clean cutout edges, believable scale, surfaces with some imperfection, nothing that looks like clip-art or a puppeted cutout. |
| Reality | Checked against a real reference: anatomy, proportions, materials and colours correct; no generation artefacts (extra or warped parts, melted detail, garbled text); a process shown moves the way the real one does. People: natural weight and balance, relaxed hands, blinks, no frozen limbs, lips in sync — judged in motion (scrub the clip), not on a still. |
| Restraint | At most two moving things, the accent used once, nothing from the banned list. |
| Craft | Eases vary by role, arrivals overlap, organic paths arc, no identical entrance two beats in a row; falls, landings and bounces obey gravity and mass; no velocity cliffs on multi-point paths. 3D: contacts and collisions come from a baked simulation whose report is clean (penetration ≤ ~2 mm, nothing floating, no pre-roll drift beyond stacking gaps, placement audit empty), every motion has a visible cause, objects at rest touch their surface, cables end in sockets, ambient motion is the real amount (`camera-motion.md` §5). |
| Consistency | Comparable moves use the same eases and durations on the MOTION line's base unit and stagger; groups move together. |
| Strobing | At 24 fps, camera moves and fast bodies blur across a 180° shutter: adjacent frames smear. Sharp doubles or a judder on a pan = P1 "strobing on camera moves" (at 30: only if it shows). |
| Camera | The film uses its SPEC technique palette, each technique doing a story job; every perceptible move comes from a real camera (footage or three.js 3D; CSS only drifts) and has its reason from the storyboard, one move per beat; A-roll and B-roll alternate and cut as one film; the wow shot lands on the impact; angle and lens came from the asset, not a CSS rotation; the scene's axis and eyelines hold; cuts land on the emotional or story word. |
| Cinematography | Shot sizes change with the shot's job and tighten toward the key beat, screen direction is kept, the colour script shifts by section. Each shot's lens, move, light and colour fit its named emotion (`camera-motion.md` §12) and the SPEC rulebook; the frame ratio, grain and halation are constant except at a logged rule break; light is motivated with a short-side key; the final image rhymes with the opening. |
| Composition | The hero meets the 45 % / 70 % size, text sits in the safe band, no side-by-side columns of prose on 9:16 (anchored side cards, §12, are fine), and the caption sits at its target position (`craft-rules.md` §6): a 9:16 caption block whose top edge is above ~70 % of the height (Reels, TikTok) or whose bottom edge is above ~65 % (Shorts) is a P1, "captions too high, compete with the hero". |
| Figure-ground | At thumbnail size (360 px wide, squinted) the hero's silhouette separates from the ground behind it by value: its dark parts, AO and contact shadow give ≥ ~0.2 OKLCH L (`palette.mjs --compare`, colours picked from a snapshot). A weak separation is a P1; a hero that merges into its ground is a P0. |
| Clarity | The claim is visualised (not just written), and the eye lands on the right thing within 0.3 s. |
| Quantity | Every quantity the film compares is shown by a device in the world (§13: twin sets, flow arrows, the formula on the set, condition tags, a macro insert) before or as it is said, not only by a caption or a card. A comparison carried by text alone is a P1 (Clarity). |
| Sound off | Muted, headlines and cards only: a viewer can state the claim of each section. A section whose claim only the narration carries is a P1 (Clarity). |
| No repeat | One fact, one layer: no fact appears in two of caption, headline, card and label (a caption repeating a headline or card word for word, a headline restating a card's number). A repeat is a P1. |
| Phone | Every line meant to be read is readable at 360 px wide (`npx hyperframes snapshot --review`); the captions clear the hero and the platform overlay at that size. |

Fix every failure before Gate 4; a Realism or Reality fail (P0) is never "kept as weakest shot", and neither is a hero merged into its ground (Figure-ground, P0); a smaller detail (P1) follows `qc.md` Step 7. Log each default the render fell into in `PRODUCTION.md` (not in `SPEC.md`: editing it makes Gate 3 stale). Judge realism on full-resolution `snapshot` stills (rendered from the composition at final quality; zoom on the subject with `--zoom`), never on frames of the 10 fps draft or the contact sheet alone.

## 12. Information layers: headline, cards, labels, captions

With the sound off, on-screen text is how the viewer follows the argument. Up to four layers run at once, each with one job and its own style, never repeating each other: **one fact appears in one layer only** (the caption speaks it, the headline states its takeaway, a card holds its number, a label names its part). Sizes are px at the 1080 px short side (the `type.js` scale); every line meant to be read is at least 36 px and in the narration language.

| Layer | Job | Size | Where and when |
|---|---|---|---|
| Claim headline | the current claim as a takeaway, its key term styled (italic + underline, in ink); over it a kicker (section or source, monospace caps, tracked +8–12 %); under it an optional status tag that says what the picture is: ILLUSTRATION (`[illus]`, `script-voice.md` §3), SPED UP (time compressed), OUR MODEL (`[calc]`), in the narration language, one colour per tag kept for the film | headline 64–96 px bold, ≤ 8 words, ≤ 2 lines; kicker and tag 36 px | top of the text band; changes on each claim beat (about one every 3–5 s); read alone, the headlines tell the argument |
| Data card | one option's value, counting in sync with what happens in the world (a reading on the object, a gauge filling segment by segment) | ≤ 30 % of the frame width; value 72–110 px tabular figures, label 36 px | beside its subject: option A left, option B right, one hue per option for the whole film (§6 screen direction) |
| World label | names a part ("PART · size") with a leader line | ≥ 36 px (`pinLabel`) | on its part, above the caption |
| Caption | the spoken words | 54–64 px (`drawCaption`) | its target position (`craft-rules.md` §6) |

Card types that carry the argument (each counts as one of the 3 cards):
- **Evidence card** (`[src]`): a short quote (about 12 words or less, 44–52 px), then the source and "translation ours" when translated, in 36 px monospace.
- **Calculation card** (`[calc]`): the kicker "our calculation", the arithmetic one line per step, at most 4 lines at 44–56 px, `[assume]` inputs on a line labelled "assumption".
- **Running tally**: a card that persists across sections and accumulates rows and bars (row 1 fills; later row 2 joins and outgrows it), at most 4 rows, labels 36–44 px, in the same place all film: the argument's state and a callback device, next to (never instead of) the physical comparison of §8.
- **Time-compressed paired run** (`[calc]` numbers with a `state(t)`, `script-voice.md` "Numbers model"): two identical sets that differ in one variable (two tank sizes over a month of showers, two gear ratios on one climb, two chargers on one battery) run side by side on the model's `state(t)`. The A and B data cards tick live, and each subject's status (a dot reading RUNNING or OFF, a level) changes exactly when the model says. The headline's status tag reads SPED UP while time is compressed, and a 36 px footnote under the cards names the inputs ("sped up: one month, 6 h a night · our model"). Every value comes from `numbers` and `state(t)`, never typed; the A and B cards count toward the 3.
- **Impact numeral**: a large accent number ("≈ 4×", "+2 h"), 220–320 px (§7), that lands on its beat word next to its subject; while it is on screen it holds the shot's accent (see the accent budget below).
- **Recap checklist**: in the conclusion, one icon row added per spoken item, at most 5 rows at 44–56 px.

Positions inside the format's text band (`craft-rules.md` §6, `safeArea` in `type.js`), as fractions of the height:

| Format | Headline (kicker, tag) | Cards | Caption |
|---|---|---|---|
| 9:16 Reels, TikTok | 13–28 %, inside x 6–88 % | 30–68 %, beside the subject, nothing right of 88 % | 72–82 % |
| 9:16 Shorts | 9–25 % (from 168 px) | 27–58 %, nothing right of x 950 px | ends at 69 % |
| 4:5 feed | 8–22 % | 25–72 %, inside the 8 % margins | 76–92 % |
| 16:9 landscape | 5–20 %, left-aligned, ≤ 50 % of the width | 22–80 %, beside the subject | 85–95 % |

- **Accent budget** (§5: one accent element per shot): every layer above uses ink, except the impact numeral. The shot's single accent goes to the impact numeral when one is on screen; the caption's active word then stays in ink (no box) until the numeral leaves. In a shot without a numeral the accent stays with the caption's active word, as in §9. The A/B hues of the data cards are the options' own identity colours (§9 "the subject's own colours"), not the accent.
- At most **3 cards** on screen besides the caption (the headline and labels are not cards), never three in a row (§5 Banned); the hero still meets §7's size.
- A/B sides and hues are fixed for the film; a card stays beside its own subject.
- A layer **enters on its beat word** (`BEATS`/`WORDS`), is **dead still while read** (§9), and **transforms, not vanishes**, when the claim changes: the headline's words change in place, a card's value counts to the new value, the tally gains a row. A layer leaves only when its subject or section does.
- Text is decided in the storyboard's Overlay column (`look-build.md` Step 5), before the build, never per scene; Step 6 draws it from there and adds headline and card texts to `repeats()`.
- Examples: two training plans compared over weeks (a card per plan with the weekly load, a tally of total hours); two ways to store bread over days (a card per method counting days, an evidence card for the source); two routes across a city (minutes and cost per route, an impact numeral on the difference); a household device's monthly cost (a calculation card: power × hours × price, a recap checklist of the savings).
- A quantity the narration compares is shown in the world first, by a device of §13; the card only records it.

## 13. Showing a quantity: twin sets, flow arrows, the formula on the set, tags, sound words, gauges

A number the narration compares is seen in the world before it is said; the card (§12) only records it. Each device is one of the shot's moving things (§5), enters on its beat word, is dead still while read, and follows §12: sizes in px at the 1080 px short side, one fact in one layer, the accent budget. Values come from `numbers` and `state(t)` (`script-voice.md` "Numbers model"), never typed: an arrow's value, the cells a tile fill shows and the range card's value are the same number.

| Device | Use it when | Size and rules | Examples |
|---|---|---|---|
| Twin sets | two options differ in one variable | one set built twice (same room, props, light, camera; `twinSets`, `examples/twin.js`), side by side or stacked on 9:16 (A left or on top, §12 hues); only the variable differs and the same event plays in both at once, so the difference reads without a word. Over time it becomes §12's time-compressed paired run | two kettles of different power boiling the same litre; two tyre pressures on the same road; two insulation thicknesses on the same wall |
| Flow arrows | an input and an output, or two flows, whose ratio is the claim | flat arrows whose width is the value on one scale for the film (`flowArrow`, `quantity.js`), the thinnest at least 12 px wide at the shot's distance; each labelled with its value (`pinLabel` on its `anchor`, ≥ 36 px); a ratio of 3 reads as 3 times the width before it is said | a pulley: the pull in, the load lifted; a gearbox: speed in, torque out; a solar panel: sunlight in, electricity out |
| Formula on the set | a product or a sum is the claim ("area × rate", "people × litres") | each factor is a tag on the thing it measures (edge tags "3 m", "4 m" on `tileFill`'s `edges`); the result fills in the world one unit at a time as the count runs (`tileFill(...).show(n)`, cups, crates); then a range card (`rangeBar`, `type.js`) fills to the need with a tick at each option's capacity and the option that fits highlighted | paint for a wall: its area in tiles, then litres against tin sizes; water for a hike: litres per hour × hours against bottle sizes |
| Condition tags | a decision rule with conditions | each condition the narration names is a visible thing on the set with its label (`pinLabel`), entering on its word; at most 3 at once | choosing a tent: tags on the wind, the rain, a second sleeper; a shelf's load: tags on the books, the plant pot, the span |
| Sound word | a mechanism's discrete physical event (a click, a snap, a pop) | one or two words ("CLICK!"), 120–200 px, on the part at the frame of the event, in sync with its SFX (`sfx.js` impacts), 0.5–0.8 s; once or twice per film, only on a physical event, never on a claim | a light switch's contacts closing; a seatbelt latching; a toaster popping |
| Macro insert | the quantity is real but invisible (a gap, a pressure, a thin film) | a push-in (`camera-motion.md` §11.6) to a real instrument in the world: a gauge with its target and actual reading, the gap in a tag; or a leader label on the evidence itself | a tyre gauge at 1.8 bar against its 2.4 bar mark; condensation on a cold glass; a spirit level's bubble off centre |

- The highlight (the option that fits, a gap tag) is the shot's one accent while it is on screen (§12 accent budget), never in a shot with an impact numeral.
- One fact, one layer: an arrow's label carries its value, so no card repeats it; the caption may say the ratio, not read out the label.
- Size for 9:16 at phone size: twin sets stacked keep each set at least 40 % of the height; arrows, tags and sound words stay inside the format's text band (`safeArea` in `type.js`) except a sound word, which sits on its part.
