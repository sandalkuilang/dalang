# Camera and motion: film grammar, physical timing, compositing

Read in Step 5 (§1–4, §8 and §10 for the storyboard and `SPEC.md`, §9 when generating stills) and in Step 6's polish pass (§5–7). It adds to `visual-direction.md` §4–9, never repeats it. Numbers are starting points: **[D]** derived from physics or maths, **[O]** practitioner defaults to tune by eye.

## 1. Angle is a sourcing decision, movement is a timeline decision

Over a still, a HyperFrames camera can only change a layer's **size, position, focus and time** — never a cinematic move; real moves come from footage, 3D or a generated clip (§10). Angle and perspective are baked into the asset: a low-angle shot is a low-angle photo, clip or generation, never a CSS `rotateX` on a flat plate (it reads as a tilted card). So the storyboard decides size, angle and lens **before** sourcing, and every footage query and `mflux` prompt carries them.

| Size | Job | Sourcing rule |
|---|---|---|
| Extreme wide | establish the world; isolation; aftermath | the place is the hero (the one exception to the 45 % rule, at most one per section); its own asset |
| Wide | geography: where the hero, the goal and the exit are; space for action | needed before any fast sequence |
| Medium | behaviour, explanation, relation between two things | the narration workhorse |
| Close-up | emotion, realisation, the decision | crop only if the source has the output's pixels in the crop |
| Macro insert | the detail that matters: evidence, mechanism, the anchor object | **its own macro asset** — a scaled-up wide photo has the wrong resolution and depth of field |

Tighten toward the beat that matters (wide → medium → close → macro → impact), release to wide for the aftermath. A size change coincides with a change of the shot's job, never "for variety". For each physical hero, source three sizes of the same subject in the same light (wide, medium, insert) before building: the edit can then cut on story, not on what exists.

| Angle | Reads as | Use for |
|---|---|---|
| Eye level | parity, neutral | establishing, explanation |
| Low | power, awe, threat; product heroism | the power or impact beat |
| High | smallness, vulnerability, consequence | aftermath |
| Top-down | pattern, process, overview | how-it-works steps, hands at a table |
| Dutch | instability | once per film, on the one instability beat |
| POV / over-the-shoulder | discovery, "what they see" | reveals, a person looking at the thing explained |
| Profile, silhouette, back-lit | distance, anonymity | people without lip-sync (§4 "Faceless") |

Lens feel sets the parallax: 24 mm = big differential (bg 0.2×, fg 1.3×), deep focus, a near object at the frame edge; 35–50 mm = the default 0.3 / 0.6 / 1.0; 85–100 mm = small differential (bg 0.7–0.85× of the hero), strong background blur; telephoto = background nearly locked to the hero, heavy blur. Never board a whole film on one lens.

Choose stills that carry **implied motion** (a pose that resolves forward, blur on one moving part, a sharp subject on a blurred field). A neutral at-rest still plus a push-in looks dead.

## 2. Camera moves: every perceptible move answers "what changed?"

- **Drift vs move.** Drift is sub-perceptual (scale ≤ 1.04 over a shot) and always allowed, but drift — of any speed — is never the shot's motion: the subject acts (`visual-direction.md` §3 "Minimum motion"). A **move** (scale ≥ 1.06, a translate, a focus change) needs a reason written in the storyboard: a decision, new information, rising pressure, a look the camera follows. No reason → locked camera, motion from the subject or the light.
- **One camera move per beat:** push *or* pan *or* tilt *or* rack focus. Push + pan + rotate together reads as chaos.
- **Push-in (dolly):** starts on the trigger word, stops on the reaction. Scale **per layer** so the parallax changes (fg 1.00→1.10, hero 1.00→1.06, bg 1.00→1.03), `transform-origin` on the focal point (the eyes, the detail), not the frame centre, `power2.inOut`; an optional background blur ramp 0 → 3 px sells the depth. A **zoom** scales all layers equally — flatter, observational; use it knowingly.
- **Pull-back:** consequence, isolation, scale revealed; needs overscanned plates; lands on the aftermath.
- **Pan / tilt:** translate the layers at their parallax ratios, in the scene's axis direction (§3), with lead room ahead of the subject; the subject sits about a third from the trailing edge.
- **Crash zoom:** scale 1.0 → 1.2–1.3 in 4–6 frames, `expo.out`, motion blur on; punchy energy only, once per film.
- **Dolly-zoom:** one realisation beat only. Hero layer constant, background scales 1.00 → 1.15 over 0.6–1.2 s (in 3D: `fov = 2·atan(tan(fov0/2)·d0/d)`).
- **Rack focus with breathing:** while focus moves, scale the frame 1.00 → 1.01–1.02 (stills lenses breathe; skip it for a "cine lens" look). A focus puller eases `power2.inOut` and lands slightly early. Pre-render 3–4 blur levels with `media-treatment` and crossfade along the ease.
- **Handheld (anxiety, pressure, phone feel; never calm or premium) [O]:** a sum of sines on the camera wrapper — drift 0.5–1 Hz (60 % of the amplitude), body 3–5 Hz (30 %), tremor 8–12 Hz (10 %), incommensurate frequencies, fixed phases, driven by timeline time (never `Math.random()`). Calm: translate 0.15–0.4 % of the frame width, roll 0.1–0.3°; walking: 0.6–1.2 % plus a 1.7–2 Hz bob. Overscan ≈ 1.02. Never under text meant to be read.
- **Whip pan:** a transition, not a shot: large translate plus directional blur across the seam. A rolling-shutter skew (`skewX(atan(v·readout/H))`, readout 9–28 ms) sells "phone or mirrorless"; leave it off for "cinema camera".
- Orbit, crane, aerial, tracking, fly-through: a real camera only (§10), never faked on a still.

## 3. Axis, eyelines, cuts, rhythm

- **One axis per scene**, written in the storyboard header ("hero moves L→R, exit frame right"). All shots keep that side; cross only through a neutral head-on shot, a visible camera move or an insert. Flip an asset with `scaleX(-1)` only when it has no text, logo or handed asymmetry (watch hand, driving side, a known face), then re-run the Reality check.
- **Eyeline match:** the subject looks off-frame right → the next shot shows what they see, placed where the eye continues. Labels go on the side the subject faces.
- **Where to cut (Murch's order):** emotion > story > rhythm > eye-trace > screen plane > 3D space. Cut on the word that carries the emotional or story change, not every N seconds. For a smooth cut the incoming focal point sits within ~20 % of frame width of the outgoing one; far away only for a jolt on the impact.
- **Cut on action:** a move starts in shot A and finishes in B at the same direction and speed — A ends on `power2.in`, B starts on `power2.out`. **Match cut:** incoming shape within ~5 % of frame on position and 10–20 % on size, same motion direction, cut on the frame of most overlap; colour match = hue ± 10°, OKLCH lightness ± 0.1. **Occlusion wipe:** a blurred foreground cut-out at 1.4× parallax crosses the lens and hides the seam. **Smash cut:** calm ↔ violent or loud ↔ silent with no transition, impact only. No white flash (glow family): hard cut, smash cut or black.
- **J/L cuts on ambience and SFX** (the narration is continuous): the next scene's room tone or SFX leads its picture by 4–12 frames (`data-start="{{beat - 0.3}}"`); the outgoing bed tails 12–24 frames under the new picture.
- **Rhythm staircase:** shot lengths shorten toward the key beat, then **a pause**, then the impact; one long hold after it. Uniform shot lengths read flat. Never two bursts back to back. Average shot length follows the energy (`visual-direction.md` §3); changes come at uneven intervals around it — a metronome reads as boredom.

## 4. Story shape, the loaded frame, faceless staging

- **Arc and beat map** are set at Gate 1 (`script-voice.md` §3). The storyboard turns them into shots: Acceleration = shots shorten, Impact = the payoff frame, Aftermath = held still.
- **Three jobs:** every shot changes emotion, advances information, or raises pressure. "A beautiful establishing shot" is not a job; delete shots without one.
- **Five anchors** in `SPEC.md`: one main emotion, one visual motif (the reused metaphor), one anchor object, one break, one final image (= the payoff frame).
- **The loaded frame:** one focal point, three depth layers **each with a job** (foreground frames or puts us inside; middle = the subject and the act; background = stakes or context), no dead objects. An object carries feeling only when it changes state: show the moment after a threshold (needle in the red, liquid mid-pour), never a parked product.
- **Carry something across every cut:** the same object crosses, or a push into a detail that becomes the next scene. Props, light and time of day persist.
- **Faceless staging** (people without real footage, `visual-direction.md` §1 "People"): a face does four jobs — feeling, gaze, cost, decision. Without it: the decision → hands mid-action on a verb (grip, press, release; tendons, creases, one hard side light); the inner state → an object crossing a threshold; gaze and rivalry → space and composition; anyone whose face can't be real → silhouette or contre-jour with a rim. A deliberate style, not a compromise.

## 5. Physical timing

- **Curves.** An After Effects influence pair (out `a` %, in `b` %) is `cubic-bezier(a/100, 0, 1−b/100, 1)` **[D]**. Arrivals have incoming influence ≥ 75 % and reach peak speed in the first 20–35 % of the move: `(0.33,0,0.2,1)`, `(0.2,0,0.2,1)`. Register once with `CustomEase` (free since GSAP 3.13): emphasized-decelerate `(0.05,0.7,0.1,1)` for arrivals that land with authority, emphasized-accelerate `(0.3,0,0.8,0.15)` for exits, quart-inOut `(0.76,0,0.24,1)` for a motion-control camera. The symmetric 33/33 `(0.33,0,0.67,1)` is the generated look.
- **Springs [D]:** overshoot = `e^(−ζπ/√(1−ζ²))`, so the ≤ 4 % cap means damping ratio **ζ ≥ 0.72** (0.8 → 1.5 %, 0.9 → 0.15 %); settle ≈ `4/(ζω)`. Use the closed form as an ease so every frame renders on its own: `x(t) = 1 − e^(−ζωt)(cos ωd t + (ζω/ωd) sin ωd t)`, `ωd = ω√(1−ζ²)`. Opacity and colour: ζ = 1, always.
- **Duration grows with distance, by square root [O]:** `dur ≈ base·√(dist/base_dist)` (0.3 s at 200 px → 0.6 s at 800 px). **Mass:** heavy things start slower, overshoot less (ζ ≥ 0.85) and make the surface react (a 0.3–0.6 % camera bump for 3–5 frames, a shadow or dust pulse); light things snap (ζ 0.6–0.75) and flutter.
- **1/3 rule:** nothing travels more than a third of the frame in one unbroken tween without an intermediate key or a scale change. **No velocity cliffs:** a multi-point path is **one** tween (`keyframes: {x: [...], y: [...], easeEach: "none"}, ease: "power2.inOut"`, or MotionPath `curviness: 1–1.5`), never chained `to()`s that stop at every key.
- **Gravity [D]:** fall time `√(2h/g)` — 1 m = 0.45 s (13.5 frames at 30 fps), 0.5 m = 0.32 s, 2 m = 0.64 s; set px-per-metre from a known size in the frame. `power2.in` **is** free fall (`power2.out` for the rise). A bounce with restitution e: height × e², airtime × e (ball ≈ 0.75–0.85, wood ≈ 0.5, putty 0); `CustomBounce` with strength ≈ 1−e. Velocity changes within one frame on impact — never ease into a collision. Paper and leaves: ease in for ~0.2 s, then linear with sway.
- **Data never overshoots:** numbers, bars and serious content ease to their value and hold ≥ 0.5 s.
- **Group timing:** a group's total stagger `(n−1)·offset + dur` stays ≤ ~0.8 s; beyond that shrink the offset or stagger outward from the focal point. Items that belong together share **identical** ease, duration and direction (common fate); unrelated items differ in at least one. The contact shadow settles with its object; labels follow 40–60 ms later.
- **Motion blur [D]:** blur length per frame = displacement per frame × shutter / 360. Turn `data-motion-blur="on"` on above ~8 px/frame at 1080p; 45–90° shutter for staccato impact, 270–360° for a dreamy smear.
- **On twos** (hold each pose 2 frames, `tq = Math.floor(t*12)/12`): stylised looks only, never the camera, no motion blur on stepped layers.
- **Snap every cut and key** to `Math.round(t*fps)/fps`. A hold registers from ~4 frames; an accent pose holds 6–12.

## 6. Compositing: a cut-out must look shot, not pasted

Adds to `visual-direction.md` §1 "Compositing" and §9:
1. **Levels per channel [O]:** the cut-out's blacks never go below the plate's darkest shadow (lift them to match, per channel, which also matches the cast); then whites, then midtones. The subject is never more saturated than the plate.
2. **Edges:** choke the matte 1 px, soften 0.5–1.5 px at 1080p; match the plate's sharpness at that depth — a crisp edge on a soft plate is the first tell.
3. **Light wrap:** a heavily blurred copy of the background (2–5 % of frame width) over the cut-out's inner edge band (5–20 px), 30–60 %, `screen`; strongest on back-lit edges, none on the shadow side. Pre-render it with `media-treatment`.
4. **Spill:** tint the shadow side 5–15 % toward the plate's average colour; match the key's colour temperature.
5. **Shadows beyond the contact shadow:** cast shadow along the key light, sharp at the touch point and softer with distance; a dark occlusion band (1–3 % of object height) where it meets the ground; foreground objects of the plate go **over** the subject (occlusion beats every other depth cue).
6. **Atmospheric perspective per layer:** farther = lower contrast (60–75 % of near), blacks lifted 8–15 % toward the haze colour, less saturated, cooler. Depth then reads even in a still frame.
7. **Grain, vignette (−0.3 to −0.7 stop at the corners) and lens softness once, over the finished comp**, never per layer. Grain 3–5 % also kills gradient banding.
8. **2.5D from one photo:** a depth map from **Depth Anything V2 Small** (Apache-2.0; Base and Large are non-commercial) → slice into 3–5 layers by depth → inpaint the revealed background (LaMa, Apache-2.0; OpenCV Telea for small holes) → move the camera within translate ≤ 3–5 % of frame width, orbit ≤ 2–3°, dolly ≤ 8%. Dilate the foreground edge 2–4 px; mask hair with the cut-out's alpha. This turns a flat Ken Burns into real parallax — still a camera-only plate, so the subject must also act in it. Install only with permission (free, local).

## 7. Design in time

- **Hierarchy over time:** arrival order = reading order. The most important element arrives alone, holds longest, keeps the strongest contrast; secondary information arrives as a group 150–300 ms later. One hierarchy level changes per beat.
- **One grid for the whole film** (e.g. 12 columns, 8 px baseline at 1080 wide): motion endpoints snap to it, and elements that persist across a cut keep their grid position.
- **Colour in OKLCH:** sRGB tweens pass through grey (blue → yellow) or mud (blue → red). Gradients `linear-gradient(in oklch, …)`; colour tweens through a registered `@property` colour or `color-mix(in oklch, A p%, B)` on a 0–1 proxy. Keep lightness within ± 0.1 across a colour flood so the cut doesn't flash. Neutrals tinted toward the primary hue (chroma 0.005–0.02); on dark grounds the accent at L 0.70–0.85, C 0.12–0.18. Grade order, the same on every shot: exposure and white balance → contrast → saturation → split-tone (< 0.15) → unify.
- **Infographics and diagrams:** design the **final static frame first**; animation only decides when each placed element appears. Reveal by hierarchy (title → icon → number → label → connector; a connector draws in the gap after its source, before its target, 0.4–0.6 s). Focus + context: the active element full, the rest at ~0.35 opacity within 0.3 s. A chart holds 1–1.5 s before moving so the axes can be read; axes stay still; data states cross-dissolve, never wipe.
- **One number moves at a time;** its label fades in **after** the count lands.
- **Kinetic type:** a line mask reveal (`SplitText` with `mask: "lines"`, `yPercent: 100 → 0`, 0.6–0.9 s, emphasized-decelerate, 0.08–0.12 s between lines) is the robust default; split after fonts load. Display tracking −1 to −3 %. A variable font animates one axis per beat (weight on the stressed word), never size and weight at once. ≤ 3–4 words/s on screen.
- **Modern now:** real footage or photoreal subjects with restrained graphic overlays; physically simulated materials and cameras that move like real rigs; bold flat colour with physical timing; one ground (light or dark) kept for the whole film. **Dated:** see `visual-direction.md` §5 "Banned".

## 8. The motion-language line in `SPEC.md`

Lock the vocabulary before animating, next to the LOOK line: **CAMERA** = frame rate and shutter, the lens set in mm, the rigs the film uses (§10), the A/B pattern and the one wow shot; **MOTION** = one arrival ease and one exit ease (a third needs a reason), a base unit (e.g. 0.4 s; every duration is a multiple: 0.2 / 0.4 / 0.8 / 1.2), one stagger offset for every group, an intensity budget (max travel, max scale, overshoot), holds ≥ 0.3 s after each beat. **ANCHORS** = the five anchors (§4). Review checks consistency against it (rubric "Consistency").

## 9. Generating stills with the angle in them (`mflux`)

- **Capture medium as a fact, not adjectives:** "a mirrorless still, natural window light, no flash, no retouch" · "a video frame grab, slight motion smear" · "a 35 mm negative scan, soft blacks" · "a phone photo, shadow noise".
- **Never write boosters:** 4K, 8K, ultra-detailed, hyper-realistic, photorealistic, masterpiece, sharp focus, cinematic, epic, stunning, beautiful lighting — **and never "hyperreal"**, which pulls straight into AI-art territory.
- **Skeleton, weight at the start:** capture medium + shot size + angle + lens *with its visible result* ("85 mm, compressed background dissolved into soft shapes" — some models ignore bare numbers) → the subject and its state at a threshold, 3–4 concrete physical details → foreground / middle / background, one job each → implied-motion cue → ONE motivated light source with direction and quality ("overcast window light from frame left") → concrete colours → materials with wear ("brushed steel, fingerprint smudges") → **3 located imperfections** ("two flyaways above the crown, a scuffed baseboard, the near hand slightly soft") → a closing line of positive constraints ("bare earlobes, plain unlettered wall, natural grade, no added sharpening"). Positive framing beats "no X", especially on turbo models with weak negatives.
- **Models beautify by default** (symmetric faces, poreless skin, model poses, tidy saturated sets, invented earrings and signs): check each against the real reference and state every deviation twice — once as a measurable description, once in the closing line.
- **People (non-real people only):** age, skin tone and texture, 3–4 facial details, gaze, hair, clothing and fabric, an ordinary person rather than an idol look; emotion as 2–4 observable cues. No real person's likeness.
- **Consistency across shots:** a fixed template; the identity block and the lighting block repeated **verbatim** in every prompt; same seed where possible; every shot still changes size, angle, action or the foreground/background relation.
- **A miss is an under-specified variable, not a bad roll:** split the failing description into finer facts, change one thing, re-run the same seed. Explore at low resolution, render the final at full size.
- Artist and director names stay out of prompts: translate a reference into light, palette and framing.

## 10. A-roll, B-roll and real camera moves

The difference between a slideshow and a film is a real camera. A faceless explainer cuts two lines together:

- **A-roll — the explanation.** The subject the narration names, acting, on screen while the claim is spoken: the mechanism in 3D, footage of the real thing working, a generated clip. It carries the claim.
- **B-roll — the cinema.** Short shots (0.8–2 s) of the topic's world filmed with a real move: a slow-motion macro of the material on a slider, a gimbal tracking a person or vehicle at golden hour, a drone over the place, hands working under a lamp, a rack focus across the workspace. It sets mood and rhythm, bridges sections and lands on the music; it never carries a claim alone. **[O]** About one B in three shots at Punchy, one in four at Calm; a B before each new section and right after the impact; never two Bs from the same source in a row.

**Where each move comes from:**

| Move | Real source |
|---|---|
| Push / dolly, slider, tracking, gimbal follow, orbit, crane, drone, FPV fly-through | footage shot that way (put the move and the speed in the query: "slow motion macro <subject>", "tracking shot <subject> sunset", "drone <place> aerial"); or the 3D camera below; or a generated clip whose prompt names the move |
| Over a still | drift, push ≤ 1.06, rack focus, 2.5D parallax (§6.8) — accents inside a shot, never its move |

**3D camera that moves like a rig (three.js):** `camera.filmGauge = 36; camera.setFocalLength(<storyboard mm>)`; the path is one `CatmullRomCurve3` through 3–5 points, sampled with one ease over the whole shot (no stops at points); the look-at target trails the subject by 80–150 ms (critically damped), so the frame is operated, not glued; §2's handheld sines at 10–20 % of their amplitude on top; depth of field (`BokehPass`) focused on the subject, the focus pull on the beat word; motion blur by averaging 4–8 sub-frame renders across a 180° shutter (each sub-frame is `render(t + k·(0.5/fps)/n)`, so it stays deterministic). One dive into the mechanism per film beats any orbit.

**Frame rate and speed:** 24 fps with a 180° shutter (motion blur on every layer above ~8 px/frame, §5) reads as film; 30 fps reads as video — set `BRIEF.md` fps 24 for a cinematic film unless the platform needs 30. Slow motion needs a high-frame-rate source (≥ 50 fps; footage APIs list each file's fps): `data-playback-rate` 0.4–0.5, or a speed ramp — a `rate` lane in `data-automation` (1× → 0.3× on the impact frame → 1×; `/hyperframes` `motion.md`, registry `beat-freeze-cut`). Never slow a 25–30 fps clip below 0.8×: it stutters.

**One wow shot per film**, on the impact beat, built first and shown in the style frames: a fly-through into the mechanism, a macro slow-motion action with a ramp, a dolly-zoom on the realisation, a drone pull-back reveal.

**A and B must cut as one film:** the same grade, grain and white balance through `media-treatment` on every clip; matched motion direction across the cut (§3); reject footage with a watermark, compression blocks, judder from a mismatched frame rate, or a look the grade can't pull together.

---
Sources (paraphrased, not copied): Serge Shima, [smixs/visual-skills](https://github.com/smixs/visual-skills) (CC BY 4.0) — shot functions, angle and move motivation, Murch's order, rhythm and density ladders, arcs, five anchors, faceless staging, de-slop prompting (parts of which credit [agentara/skills](https://github.com/agentara/skills), MIT); [iart-ai motion skills](https://github.com/iart-ai/motion-skills) (MIT, © 2026 iart.ai) — √distance timing, 1/3 rule, motion-language spec, one wow, infographic and chart pacing, OKLCH colour, J/L offsets; Material 3 motion tokens, Apple spring docs, RED shutter guide, Nuke LightWrap, Depth Anything V2, Niklaus et al. 2019 (3D Ken Burns).
