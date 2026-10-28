# Camera and motion: film grammar, physical timing, compositing

Read in Step 5 (§1–4, §8, §10–12 for the storyboard and `SPEC.md`; there is no §6 or §9: the numbers keep their old names) and in Step 6's polish pass (§5–7). It adds to `visual-direction.md` §4–9, never repeats it. Numbers are starting points: **[D]** derived from physics or maths, **[O]** practitioner defaults to tune by eye.

**Every film is true isometric** (`looks.md`, all three languages, Express and Studio alike): the view pans and zooms (zoom in log) and never tilts, turns or changes its projection. Below, a dolly, push, crane, drone, fly-through or tracking move is a pan or a zoom of the iso view; a focal length, a lens set, an orbit, a top shot and a dolly-zoom do not exist; a subject shows its other side by turning itself, with a visible cause (a turntable, a hand), never by the camera going round it. Perspective notes that remain below are for the engine's own checks and examples.

## 1. Angle is a sourcing decision, movement is a timeline decision

Over a still, a HyperFrames camera can only change a layer's **size, position, focus and time** — never a cinematic move; real moves come from three.js 3D (§10). Angle and perspective are baked into the asset: a low-angle shot is a low-angle drawing or render, never a CSS `rotateX` on a flat plate (it reads as a tilted card). So the storyboard decides size, angle and lens **before** drawing or modelling.

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
- **Faceless staging** (`visual-direction.md` §1 "People"): a face does four jobs — feeling, gaze, cost, decision. Without it: the decision → hands mid-action on a verb (grip, press, release; tendons, creases, one hard side light); the inner state → an object crossing a threshold; gaze and rivalry → space and composition; anyone whose face can't be real → silhouette or contre-jour with a rim. A deliberate style, not a compromise.

## 5. Physical timing

### 5.1 Curves, springs, distance, gravity

- **Curves.** An After Effects influence pair (out `a` %, in `b` %) is `cubic-bezier(a/100, 0, 1−b/100, 1)` **[D]**. Arrivals have incoming influence ≥ 75 % and reach peak speed in the first 20–35 % of the move: `(0.33,0,0.2,1)`, `(0.2,0,0.2,1)`. Register once with `CustomEase` (free since GSAP 3.13): emphasized-decelerate `(0.05,0.7,0.1,1)` for arrivals that land with authority, emphasized-accelerate `(0.3,0,0.8,0.15)` for exits, quart-inOut `(0.76,0,0.24,1)` for a motion-control camera. The symmetric 33/33 `(0.33,0,0.67,1)` is the generated look.
- **Springs [D]:** overshoot = `e^(−ζπ/√(1−ζ²))`, so the ≤ 4 % cap means damping ratio **ζ ≥ 0.72** (0.8 → 1.5 %, 0.9 → 0.15 %); settle ≈ `4/(ζω)`. Use the closed form as an ease so every frame renders on its own: `x(t) = 1 − e^(−ζωt)(cos ωd t + (ζω/ωd) sin ωd t)`, `ωd = ω√(1−ζ²)`. Opacity and colour: ζ = 1, always.
- **Duration grows with distance, by square root [O]:** `dur ≈ base·√(dist/base_dist)` (0.3 s at 200 px → 0.6 s at 800 px). **Mass:** heavy things start slower, overshoot less (ζ ≥ 0.85) and make the surface react (a 0.3–0.6 % camera bump for 3–5 frames, a shadow or dust pulse); light things snap (ζ 0.6–0.75) and flutter.
- **1/3 rule:** nothing travels more than a third of the frame in one unbroken tween without an intermediate key or a scale change. **No velocity cliffs:** a multi-point path is **one** tween (`keyframes: {x: [...], y: [...], easeEach: "none"}, ease: "power2.inOut"`, or MotionPath `curviness: 1–1.5`), never chained `to()`s that stop at every key.
- **Gravity [D]:** fall time `√(2h/g)` — 1 m = 0.45 s (13.5 frames at 30 fps), 0.5 m = 0.32 s, 2 m = 0.64 s; set px-per-metre from a known size in the frame. `power2.in` **is** free fall (`power2.out` for the rise). A bounce with restitution e: height × e², airtime × e (ball ≈ 0.75–0.85, wood ≈ 0.5, putty 0); `CustomBounce` with strength ≈ 1−e. Velocity changes within one frame on impact — never ease into a collision. Paper and leaves: ease in for ~0.2 s, then linear with sway.

### 5.2 Contact is caused: units, mass, mechanisms

- **3D objects that touch, fall or collide are posed from their cause, never floated or looped.** Every motion is a pure function of t from a cause the viewer can read (a push, a cue, a ratio, gravity), so any frame renders on its own and two renders match. There is no physics engine: a fall is `y = y0 − ½·g·t²` in real units until contact, then a landing eased over 2–4 frames with a contact squash ≤ 4 % (stiff things less) and a bounce by restitution (§5.1 Gravity); a pushed thing decelerates at μ·g (Coulomb: casters ~0.05, wood on wood ~0.3) and stops; a part reaching its stop rests exactly on it.
  - **Run it in real units** (`looks.md`, real scale): the place's gravity (`makeKit({ gravity })`: 9.81 m/s² on Earth, 1.62 on the Moon, 0 in orbit; negligible at molecular scale) divided by M metres per unit, pushes and resistances given in m/s and m/s² and converted; report in real mm and m/s.
  - **Mass decides the timing** (look it up: a desk chair ~12 kg, books ~700 kg/m³, wood ~600, steel 7,850): heavy things start slower and overshoot less (§5.1 Mass); the same push moves a light thing further.
  - **Mechanisms are posed from their driver, never animated part by part:** a part that slides or turns between stops is clamped to them; its return spring follows the closed-form damped spring (§5.1 Springs); what holds it until a cue is a latch on that beat; gears, belts and chains take the driver's angle times the tooth ratio (`transmission.js`), so the whole train turns as one.
  - **Nothing passes through anything:** at every contact frame the parts touch, never overlap; check one still at each contact beat.

### 5.3 Hits, sound, blur

- **Hits drive sound and reactions:** a contact's time comes from its cause (the fall time `√(2h/g)`, the push, the cue), never from the eye. A living thing reacts ~150 ms after the loudest hit (a book landing on the floor, not the first touch).
- **Sound on the contact, verified** (CC0 from Openverse, `look-build.md` "Sound effects and music"): each `<audio>` starts at its contact time and the cause's time (the push), written in the HTML with the computed time in a comment. Contacts within ~40 ms are one sound (the hardest keeps it).
- **Motion blur:** a frame where a part travels ≥ ~4 px is the mean of 5 sub-frame renders across a 180° shutter (each pose at `t + k·dt`, so it stays deterministic); still frames render once.

### 5.4 Air, any subject's own law, rest, groups, frames

- **Air is drawn by its law** (`air.js` `jet`). A fan that is on is a round turbulent jet along its head's axis: core speed u₀ (desk or floor fan ~1.5–3 m/s) out to ~2 blade diameters, then ∝ 1/x, Gaussian across with half-width D/2 + 0.11·x, ±25 % gusts at a few Hz; an oscillating head sweeps it (±40°, ~10 s a cycle). Air does not pass through things: behind any object of the set between the blades and a point only ~15 % arrives (test the segment against the objects' boxes, once every prop is placed). Light things in the air (a ribbon, a paper strip) lean by the air's speed, never wave on their own. Spinning blades are filmed as a blur: a disc whose opacity is the fraction of the exposure a blade covers it. A running fan is heard (a low steady whoosh under the hits).
- **Any subject moves by its own law, not only things that fall.** Orbits by gravity (a planet's period² ∝ its distance³; the Moon 27.3 days), ions and molecules by drift in their field plus diffusion (spread √(2Dt)), heat by conduction, a heart at its rhythm, a crowd or a population by its equation. Take the law and its constants from a cited source, model it in real units, and check the numbers it produces against that source. When the real scale can't be seen (a lithium ion is ~0.15 nm across, Neptune 30 AU out while Earth is 1/11,700 of an AU wide, a reaction over in picoseconds), change the fewest scales needed (size, distance, time: one each at most), keep the ratios within each, and show every change on screen (a clock running slow, a scale bar, "sizes not to scale"). Electricity moves by its circuit: current from the numbers model, pulses at a stated visualisation speed in the waveform's shape (ac sine, dc straight, pwm blocks, three phases), the mains frequency slowed by a shown time scale (50 Hz cannot be seen at 30 fps), heat glowing by black-body colour, a lamp dimming by its cited curve, an arc lit only for its frames (`engine/three/circuit.js`, `instruments.js`). Invisible fields and light are drawn by their law too: field lines traced from the sources in real units and spaced by flux (denser = stronger), filings and a compass needle aligned by the field, rays bent by Snell's law with the index of a cited material, a lens's focus and image traced rather than drawn, and the number said in the narration from the model (`engine/three/fields.js`, `optics.js`). A sine wave or a hand-timed tween standing in for a law is a Reality fail.
- **Every prop at rest touches its support, measured, not typed.** Typed heights leave props millimetres inside a surface or centimetres above it. Register each resting prop (`kit.js` `rest`) and `settle()` once all are placed: it drops as gravity would from any height, by the smallest gap under its lowest points (a 6 × 6 grid over its footprint, so legs and edges land, not its centre), lowest first so supports land before what they carry; only lower objects count as support; lift out of a surface up to 3 cm (a typed height a little low), deeper means it was placed inside something: report it; a `foot` part when the lowest point isn't what rests (a pot with hanging vines). Then audit every object against the physics set (gap or overlap 0.5–30 mm under its centre is an error). Thin layers have thickness (a rug ~5 mm, a sheet of paper 0.1 mm), so what stands on them stands on top; a tilted object needs something to lean on; a cable or a hose lies on what is under it and ends where it connects; a container is open and what is in it leans on its rim.
- **Ambient motion is the real amount** (e.g. indoors): still air (nothing stirs), LED strings are steady, a quartz second hand jumps in ~30 ms with a hair of overshoot, a desk chair swivels on its column (find the real pivot: kit models often have their origin on a corner). A perpetual sine loop on an object that would come to rest is a Craft fail.
- **Data never overshoots:** numbers, bars and serious content ease to their value and hold ≥ 0.5 s.
- **Group timing:** a group's total stagger `(n−1)·offset + dur` stays ≤ ~0.8 s; beyond that shrink the offset or stagger outward from the focal point. Items that belong together share **identical** ease, duration and direction (common fate); unrelated items differ in at least one. The contact shadow settles with its object; labels follow 40–60 ms later.
- **Motion blur [D]:** blur length per frame = displacement per frame × shutter / 360. Turn `data-motion-blur="on"` on above ~8 px/frame at 1080p; 45–90° shutter for staccato impact, 270–360° for a dreamy smear.
- **On twos** (hold each pose 2 frames, `tq = Math.floor(t*12)/12`): stylised looks only, never the camera, no motion blur on stepped layers.
- **Snap every cut and key** to `Math.round(t*fps)/fps`. A hold registers from ~4 frames; an accent pose holds 6–12.
- **Never compare a raw cue with a snapped cut:** a cue up to half a frame before a cut lands in the shot before it. Look a cue's shot up with `shotAt` / `overlayWindow` (`camera.js`: they snap the cue as the cut is snapped) and run `windowProblems` over every overlay and label: a window that is empty, or shorter than its `readTime`, is an error that names the cue.

## 7. Design in time

- **Hierarchy over time:** arrival order = reading order. The most important element arrives alone, holds longest, keeps the strongest contrast; secondary information arrives as a group 150–300 ms later. One hierarchy level changes per beat.
- **One grid for the whole film** (e.g. 12 columns, 8 px baseline at 1080 wide): motion endpoints snap to it, and elements that persist across a cut keep their grid position.
- **Colour in OKLCH:** sRGB tweens pass through grey (blue → yellow) or mud (blue → red). Gradients `linear-gradient(in oklch, …)`; colour tweens through a registered `@property` colour or `color-mix(in oklch, A p%, B)` on a 0–1 proxy. Keep lightness within ± 0.1 across a colour flood so the cut doesn't flash. Neutrals tinted toward the primary hue (chroma 0.005–0.02); on dark grounds the accent at L 0.70–0.85, C 0.12–0.18. Grade order, the same on every shot: exposure and white balance → contrast → saturation → split-tone (< 0.15) → unify.
- **Infographics and diagrams:** design the **final static frame first**; animation only decides when each placed element appears. Reveal by hierarchy (title → icon → number → label → connector; a connector draws in the gap after its source, before its target, 0.4–0.6 s). Focus + context: the active element full, the rest at ~0.35 opacity within 0.3 s. A chart holds 1–1.5 s before moving so the axes can be read; axes stay still; data states cross-dissolve, never wipe.
- **One number moves at a time;** its label fades in **after** the count lands.
- **Kinetic type:** a line mask reveal (`SplitText` with `mask: "lines"`, `yPercent: 100 → 0`, 0.6–0.9 s, emphasized-decelerate, 0.08–0.12 s between lines) is the robust default; split after fonts load. Display tracking −1 to −3 %. A variable font animates one axis per beat (weight on the stressed word), never size and weight at once. ≤ 3–4 words/s on screen.
- **Modern now:** a true-to-life stylized subject with restrained graphic overlays; motion caused by real physics and cameras that move like real rigs; bold flat colour with physical timing; one ground (light or dark) kept for the whole film. **Dated:** see `visual-direction.md` §5 "Banned".

## 8. The motion-language line in `SPEC.md`

Lock the vocabulary before animating, next to the LOOK line: **CAMERA** = the rulebook (§12: frame ratio, lens set, movement rule, light rule, palette and its arc, texture, never-shown, rule breaks with their reason), frame rate and shutter, the rigs the film uses (§10), the A/B pattern, the one wow shot and the film's technique palette (6–10, §11); **MOTION** = one arrival ease and one exit ease (a third needs a reason), a base unit (e.g. 0.4 s; every duration is a multiple: 0.2 / 0.4 / 0.8 / 1.2), one stagger offset for every group, an intensity budget (max travel, max scale, overshoot), holds ≥ 0.3 s after each beat. **ANCHORS** = the five anchors (§4). Review checks consistency against it (rubric "Consistency").

## 10. A-roll, B-roll and real camera moves

The difference between a slideshow and a film is a real camera. A faceless explainer cuts two lines together:

- **A-roll — the explanation.** The subject the narration names, acting, on screen while the claim is spoken: the mechanism in 3D or drawn. It carries the claim.
- **B-roll — the cinema.** Short shots (0.8–2 s) of the topic's world with a real camera move, built in the same style as the A-roll: a macro of the material on a slider move, a tracking shot past the machine, a push into the workspace, a rack focus across the bench. It sets mood and rhythm, bridges sections and lands on the music; it never carries a claim alone. **[O]** About one B in three shots at Punchy, one in four at Calm; a B before each new section and right after the impact; never two Bs of the same set in a row.

**Where each move comes from:**

| Move | Real source |
|---|---|
| Push / dolly, slider, tracking, gimbal follow, crane, fly-through | the iso camera below: a pan or a zoom |
| Over a still | drift, push ≤ 1.06, rack focus, layered parallax — accents inside a shot, never its move |

**The iso camera moves like a rig:** Studio: `isoCamera(W, H)`, stations from `isoFrame`, a `route` of legs (the target pans, zoom in log, one ease per leg, no stop mid-leg); Express: `engine/iso/cinema.js` `camAt`. The target trails a moving subject by 80–150 ms (critically damped), so the frame is operated, not glued; `handheld` life at 10–20 % of §2's amplitude, rising with tension; depth of field by layer (`cinema.js` `focus`), the focus pull on the beat word; motion blur on a fast leg (`pose.speed`).

**Frame rate and speed:** 30 fps is the default: the platforms play at 30, and a 24 fps upload repeats one frame in four and judders on pans and dollies. 24 fps with a 180° shutter (motion blur on every layer above ~8 px/frame, §5) reads as film: a look the user picks (`BRIEF.md` fps 24), never the default for rendered 3D. **24 fps with 3D motion needs blur:** a three.js frame is a sharp instant, so 24 sharp frames per second strobe on camera moves and fast bodies (a falling object, a spinning part). When the brief is 24 and the film has camera moves or fast bodies, average 4–8 sub-frames across a 180° shutter (`finish.layer`; §5.3 for bodies, a camera leg the same way); at 30 the same applies to any move that still strobes. **No 60:** rendering 60 for a 30 fps platform doubles the render time and is re-encoded to 30; a 60 fps source is for slow motion only. Slow motion in three.js runs at any speed: render the sub-frames you need, or a `rate` lane speed ramp (`/hyperframes` `motion.md`, registry `beat-freeze-cut`).

**One wow shot per film**, on the impact beat, built first and shown in the style frames: a zoom through a cutaway into the mechanism, a close slow-motion action with a ramp, a fast pull-out to the whole world on its slab.

**A and B must cut as one film:** the same palette, light and grain on every shot; matched motion direction across the cut (§3).

## 11. The cinematographer's toolbox

A director of photography doesn't use everything: they pick a **palette** for the film, each technique tied to a story job, and write it on the CAMERA line of `SPEC.md` (§8). Take **6–10** from below plus §1–3 and §10; a technique outside the palette needs a reason in the storyboard. Using all of them reads as a showreel, not a film. Source tags: **[3D]** three.js rig (§10), **[2.5D]** layered drawings with depth (Express), **[C]** compositing in HyperFrames.

### 11.1 Light — mood and where to look
- **Contrast ratio** key:fill, `(key + fill) : fill`, each stop doubling it **[D]**: 2:1 bright and neutral (a friendly explainer), 4:1 dramatic, 8:1 and up low-key (mystery, danger, the problem). Set it per section in the colour script; a ratio change is a mood change.
- **Colour-temperature contrast:** a warm key (~3200 K) against cool ambient (~5600–6500 K) separates the subject from its world; flip it on the beat where something goes wrong.
- **Practicals:** a lamp, screen or window inside the frame motivates the key and makes the set read as real.
- **Edge light and negative fill:** a rim separates a dark subject from a dark ground; one shadow side kept dark. Flat front light is the generated look.
- **Light as the event:** a shadow sweeps across, a door throws light in, a lamp switches on at the reveal, the sun moves (timelapse). It is real action without moving the camera **[3D]**.
- **Story vs explanation grading** (option for a film that wraps an explanation in a small story, e.g. a failure explainer's cold open and bookend): grade the story sections as night, blue-grey, low-key (8:1 and up), dim practical light only; grade the explanation in bright neutral light, 2:1. The change of grade at the pivot is the film's one rule break (§12 *rule breaks*, logged under the CAMERA line); the bookend returns to the night grade, the same set and framing as the opening, now working. Write both moods per section in the storyboard's colour-script line.
- **Silhouette / contre-jour** for awe, scale or anonymity (§4 "Faceless").

### 11.2 Lens — how the world feels
Every film is true isometric (`looks.md`): there is no focal length and no perspective; the view pans and zooms and never tilts or turns. What a lens did, the frame does:
- **Scale by zoom:** a wide hold shows the whole world on its slab; a close zoom (zoom interpolated in log) is the macro, the mechanism at its own scale. A circular inset shows a close-up while the wide stays.
- **Focus as narration:** depth of field by layer (`engine/iso/cinema.js` `drawLayers` `focus`): rack from cause to effect on the word, or pull a subject sharp out of the blur as its reveal. A sharp band over a soft world reads as tilt-shift, the "model of a system" overview.
- **Into the thing:** a cutaway (a skin slid off, `cutaway.js` in Studio) and a zoom through it replace the probe lens and the push-through.

### 11.3 Movement — beyond §2
- **Reveal:** move past a foreground occluder (a wall edge, a leaf, a machine part) to uncover the subject or its scale **[3D][2.5D]**.
- **Push-through:** the camera passes through a surface (a window, a mesh, a keyhole, the shell of an object) into the next space — a scene change with no cut **[3D]**.
- **Crane up / down:** in iso, a zoom out from the detail to the context (consequence, scale), or in from the context to the detail; never a tilt, never a top shot.
- **Tracking:** alongside a moving subject at its speed — it holds its place in frame while the world streams past **[3D]**.
- **Turn, not orbit:** the subject turns on a visible turntable or in a hand to show its other side; the iso view never goes round it.
- **Oner:** one unbroken move through a whole process, explaining step by step as the camera travels; cuts hidden in dark passes or whips **[3D]**. The engine's form is `engine/three/camera.js`: named `stations`, a `route` of legs between them (a leg that starts before the one before ends is refused: a leg cannot jump), `loopEnd` for a Short, and `examples/oner.js` (home, dive, inside, home on any set).
- **Home shot + dives:** one persistent world, one camera, no cut. The home shot is the iso wide of the whole world on its slab (`isoFrame`), and it is where the A/B comparison lives. Each dive pushes in to one subject and back out; a push-through enters the part at its own scale (a cross-section with the flow shown); every station is the same iso view at its own pan and zoom. The viewer never loses their place, because every detail sits visibly inside the home shot. Any subject: a kitchen appliance and its heating element, a bicycle drivetrain and its freewheel, a beehive and one brood frame, a server rack and one fan. `travel` arcs over the set (`over`, a Box3: the set's box, or the envelope of a moving part's travel; `route` measures an object once, when it is built, so a lid opening or a bouncing ball never moves the camera) instead of cutting through it, eases in and out, and reports `speed` (m/s) every frame **[3D]**.
- **Attention by ghosting:** on each beat everything outside the beat's subject fades to a light, desaturated, translucent ghost (about 25 % opacity), and the subject alone keeps its colour and the accent. Context comes back as the camera pulls out. The floor or sweep stays whole (`keep`), or the world shows the void under it. A fast travel carries motion blur (`pose.speed` and the frame rate give the pixels per frame: the ~4 px rule of §5), and a soft foreground object sells depth on a push. `engine/three/camera.js` `attend(root, { keep, ghost, desat, dur, edge })` does it on cloned materials and puts the original back by reference; `look.at(t)` runs once per frame, after every other `at()` **[3D]**.
- **Loop end (9:16 Shorts):** the last frame equals the first, so the Short replays seamlessly. `loopEnd(st, { end: (frames - 1) / fps })` brings the camera back to `home` exactly on the last frame; release the attention before it, and finish its fade before the last frame (`oner` refuses a `look.dur` longer than the time it has), and return the subject's own state too (a part that moved must be back where it started, or the loop jumps) **[3D]**.
- **Motion-control repeat:** the identical move over two states (before / after, option A / option B, new / worn), then cut or wipe between them. It's the strongest comparison shot there is **[3D]**.
- **Frozen moment:** time stops on the instant (an impact, a splash, a reaction) and the view zooms in on it, then lets time run again.
- **Drone / FPV dive:** from the sky into the subject. It's the wow shot or nothing (§10).

### 11.4 Time
- **Slow motion** for what the eye can't see — splashes, mechanisms, breaking (any speed in 3D, §10).
- **Timelapse** for slow processes (wear, growth, a day, a build); **hyperlapse** is a timelapse with a travelling camera **[3D]**.
- **Freeze-frame and annotate:** stop at the key instant, draw labels and leader lines on it, then release — an explainer staple **[C]**.
- **Reverse** to show the cause; **speed ramp** for emphasis (§10).

### 11.5 Editing — beyond §3
- **Cross-cutting:** alternate two lines (A vs B, two processes) in the same framing, so the comparison lives in the rhythm.
- **Collision montage:** two shots that together mean a third thing (waste next to a bin of money) — for an argument, not a fact.
- **Graphic or morph match:** a shape becomes a similar shape in the next shot (a circle → a wheel → a gauge) to jump scale or idea.
- **Invisible cut:** hidden behind a dark pass, a whip or an object crossing the lens (§3 "Occlusion wipe"); it keeps a oner unbroken.
- **Insert as evidence:** a macro detail cut into a wide beat to prove the claim being spoken.
- **Split screen** only on 16:9 for things happening at the same time; on 9:16, stacked top / bottom only if both read at 360 px (`visual-direction.md` §7).

### 11.6 Educational signatures — the scale and the inside
- **Scale journey ("powers of ten"):** one continuous zoom from human scale down to the microscopic (or out to the cosmic), with a scale bar counting **[3D]** (layered scale planes, real micrographs at the bottom).
- **X-ray / ghost shell:** the outer surface fades to 20–35 % with a bright fresnel edge so the inner mechanism works visibly inside it **[3D]** (`attend(...)` with `edge` for the rim, on a lit material).
- **Cutaway section:** a clean section plane through the object, the cut face solid or hatched, the mechanism running in the section **[3D]** (`engine/three/cutaway.js`: one plane on the whole assembly; the exterior shot and the section shot are the same set with `cut.off(t)` / `cut.on(t)`, and a slow `cut.set(offset, t)` slides the section through).
- **Exploded view:** parts separate along their assembly axes, get labelled, then reassemble (`/hyperframes` `types/3d.md`) **[3D]**.
- **World-space labels:** text pinned to the object in 3D (it moves and parallaxes with the camera), with a leader line to the part — never floating UI **[3D]**.
- **Map / terrain zoom:** from the globe down to the street for place-based topics; bake the camera move (`/hyperframes` `film.md`) **[C]**.
- **Hands-on macro B-roll:** hands doing the real thing, very close and shallow — the faceless presenter **[3D]**.

## 12. Emotion drives every parameter: the rulebook

A shot's lens, height, move, light, colour and frame ratio are chosen from the feeling it serves, never from a generic "cinematic" default. **Every storyboard row names one emotion and a motivation for each choice; a move, lens, light or colour without a motivation is removed.** Restraint is the default: static unless motivated, few lenses, few colours, few cuts. Restraint reads as authorship; a frame where every choice obeys one idea beats a run of impressive, unrelated shots.

| Emotion | Size | Angle | Lens (FF) | Focus | Movement | Light (ratio) | Colour | Shutter | Ratio |
|---|---|---|---|---|---|---|---|---|---|
| Intimacy, tenderness | MCU, CU | eye | 35–50 mm, close | shallow | static or very slow push | soft, 2:1, warm practicals | warm, low saturation | 180° | 1.37 / 1.66 |
| Isolation, loneliness | WS, EWS | eye or slightly high | 85–135 mm from far, or 24 mm static | deep, or shallow on a tiny subject | static; slow pull-out | one source, 6:1+ | cool, desaturated, one warm accent | 180° | 2.39 or 1.37 (headroom) |
| Dread, tension | MS → CU, tightening | eye, slightly low | 35–40 mm | medium | static long take or creeping push | short-side key, 8:1, top light | desaturated green-teal, crushed shadows | 180° | 1.85 / 2.39 |
| Panic, chaos | MCU, CU | shifting | 18–28 mm close | deep | handheld 2–3, whips | hard, mixed temperatures | dirty, clashing | 45–90° | 1.85 |
| Power, dominance | MS, FS | low | 24–35 mm | deep | static symmetry or slow crane up | hard top or edge | high contrast, rich blacks | 180° | 2.39 |
| Vulnerability | MS, CU with headroom | high | 85 mm+ | shallow | static | soft, low key | pale, cold | 180° | 1.37 |
| Memory, nostalgia | inserts, CU details | varied | 50 mm, soft | shallow | drifting handheld 0.5–1 | backlight, flare, halation | warm, faded blacks, more grain | 270–360° | 1.33 / 1.37 |
| Awe, freedom | EWS, WS | eye or ground | 24–35 mm, or 135 mm landscape compression | deep | slow lateral or crane | low-sun backlight | golden, natural | 180° | 2.39 |
| Unease, surreal | CU, centred WS | dead centre | 14–24 mm very close | deep | static or slow arc | hard, unmotivated colour | one unnatural hue | 180° | 1.19 / 1:1 |
| Joy, curiosity | FS, MS | child's-eye (~1 m) | 28–35 mm | medium | follow at walking pace | bright, soft, open shade | saturated pastels | 180° | 1.85 |
| Grief | WS, one CU late | eye; high at the collapse | 50 mm | medium | static, long holds | low key, overcast or window | desaturated, cool | 180° | 1.85 |
| Revelation | MS → CU | eye | 35–50 mm | rack focus to the discovery | slow push, or the one dolly-zoom | the light changes mid-shot | the palette shifts from this shot on | 180° | same, or opens wider |

**The rulebook** is the CAMERA line of `SPEC.md` (§8), 5–10 rules: the frame ratio, the zoom levels (2–3: the wide, the medium, the close, the closest reserved for the climax), the movement rule ("static unless the inner state changes, then a slow push"), the light rule (motivated sources only, short-side key, ratio), the palette (2–3 hues + 1 accent) and its arc across sections, the texture (grain, halation), the shutter, and what is never shown. **Rule breaks** are logged under it with their story reason, one per turning point at most: a change of rules *is* the turning point (the first handheld shot when control is lost, the first colour shift, the frame ratio opening wider at a release).

**Structure:** establish wide, tighten as the feeling rises, keep the tightest size and the longest lens for the climax; rhyme the final image with the opening composition so the change in meaning is felt; one idea per shot (two ideas = two shots); hold a beat after the line — the reaction is often the story; keep key action off screen when sound can carry it.

### 12.1 Light
- **Motivated:** every light seems to come from a source in the world (window, lamp, screen, sky).
- **Short-side key:** light the side of the subject away from camera. Camera-side (broad) light is flat and reads as TV.
- **Subtract to shape:** dark negative fill on one side beats adding lamps. Design colour in the set, wardrobe and practicals first; the grade only enhances.
- **Colour temperature as world-building:** leave mixed sources uncorrected when they define the place.
- **three.js light colours from Kelvin:**

  | Source | Kelvin | Hex |
  |---|---|---|
  | Candle | 1900 K | `#ff8400` |
  | Sodium street lamp | 2000 K | `#ff890e` |
  | Household bulb | 2700 K | `#ffa757` |
  | Film tungsten | 3200 K | `#ffb87b` |
  | Cool fluorescent (add a green tint) | 4000 K | `#ffcea6` |
  | Noon sun | 5600 K | `#ffefe1` |
  | Overcast | 6500 K | `#fffefa` |
  | Shade, blue hour | 8000 K | `#dde6ff` |

### 12.2 Composition
- **Thirds:** eyes on the upper third, look room ahead of the gaze. Centre and symmetry mean order, control, unease or authority.
- **Headroom:** tight is normal. A subject low under large headroom reads as small or oppressed.
- **Negative space:** 60–80 % of the frame left empty reads as isolation.
- **Frame in frame:** a doorway, window or mirror reads as entrapment or watching.
- **Foreground:** something in the foreground removes flatness (§4 "The loaded frame").
- **Dialogue:** in shot / reverse shot, eyelines match and lens and distance are the same on both sides.
- **3D camera height:** eye ~1.5–1.7 m, child ~1.0 m, low 0.3–0.6 m, all scaled to the set.

### 12.3 Frame ratio inside the canvas

**Frame ratio inside the canvas** (16:9 films only; 9:16 and 4:5 stay full-bleed, since platform UI covers the bars' space). The ratio is a story decision, constant unless a logged break changes it. At 1920×1080:

| Ratio | Image area | Bars |
|---|---|---|
| 2.39 | 1920×804 | 138 px top and bottom |
| 1.85 | 1920×1038 | 21 px top and bottom |
| 1.66 | 1792×1080 | 64 px each side |
| 1.37 | 1480×1080 | 220 px each side |
| 1.33 | 1440×1080 | 240 px each side |
| 1:1 | 1080×1080 | 420 px each side |

Build the mask as the top layer of the root composition (two black `div`s), so bars stay pure black with no grain on them. Captions and safe areas sit inside the image area.

### 12.4 Finishing order, identical on every shot
1. Grade or LUT.
2. Halation: a red-orange glow around highlights; subtle; film looks only.
3. Grain.
4. Vignette.
5. Aspect mask, last.

Apply them in the finisher pass.

### 12.5 Approach presets

**Approach presets.** Borrow a film's approach, never its shots. Start the rulebook from the nearest preset and adapt it:

| Preset | After | Ratio | Lens · move | Light · colour |
|---|---|---|---|---|
| intimate-realism | *The Florida Project*, *American Honey* | 1.37 / 1.85 | 28–35 mm close at child's-eye height, handheld 1, follow | open shade; saturated pastels, fine grain |
| austere-portrait | *Ida* | 1.37 | 35–50 mm, deep, static | soft, diffuse; subjects low under huge headroom |
| subjective-tunnel | *Son of Saul* | 1.37 | one 40 mm, very shallow, follows behind the head | available light; the background horror out of focus, carried by sound |
| lyrical-colour | *Moonlight* | 2.39 | close, slow arcs | glowing skin, saturated backlight; cyan and magenta, deep blacks |
| cold-observation | *The Zone of Interest* | 1.85 | wide, deep, static, several hidden angles | flat natural light; the horror kept off screen |
| dreamy-memory | *Aftersun* | 1.85 + 4:3 home-video inserts | 50 mm soft, drifting | backlight, reflections; warm, faded blacks, halation |
| landscape-awe | *Nomadland* | 2.39 | 24–35 mm, deep, slow lateral | low-sun backlight; figures small in vast space |
| period-texture | *Carol* | 1.85 | 50 mm through glass, restrained | soft window light; Super 16 grain, muted greens and pinks |

## Sources

Sources (paraphrased, not copied): Serge Shima, [smixs/visual-skills](https://github.com/smixs/visual-skills) (CC BY 4.0) — shot functions, angle and move motivation, Murch's order, rhythm and density ladders, arcs, five anchors, faceless staging, de-slop prompting (parts of which credit [agentara/skills](https://github.com/agentara/skills), MIT); [iart-ai motion skills](https://github.com/iart-ai/motion-skills) (MIT, © 2026 iart.ai) — √distance timing, 1/3 rule, motion-language spec, one wow, infographic and chart pacing, OKLCH colour, J/L offsets; Material 3 motion tokens, Apple spring docs, RED shutter guide, Nuke LightWrap, Depth Anything V2, Niklaus et al. 2019 (3D Ken Burns); lighting ratio (ASA definition), split diopter, crane and bullet-time references (Wikipedia, MasterClass); public breakdowns of explainer-channel editing (map zooms, match cuts, speed ramps, A/B plots); §12's emotion table, rulebook, Kelvin, ratio and finishing practice follow award-winning indie cinematography (DP approaches of the films named, paraphrased).
