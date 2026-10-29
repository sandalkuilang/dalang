# Camera and motion: film grammar, physical timing, compositing

Step 5 reads §1–4 and §7–10 (storyboard, `SPEC.md`); Step 6's polish pass reads §5–6. Adds to `visual-direction.md` §4–9, never repeats it. **[D]** = derived from physics or maths, **[O]** = default to tune by eye.

## 1. Angle is a sourcing decision, movement is a timeline decision

Over a flat still a camera changes only a layer's **size, position, focus and time**; real moves come from the 2.5D layer rigs or three.js (§8). Angle is baked into the asset: a low angle is a low-angle drawing or render, never a CSS `rotateX` on a flat plate. Decide size, angle and lens in the storyboard **before** drawing or modelling. **Isometric looks** (Express, Studio iso): the view never tilts, so the Angle and lens rules apply to `object-studio` only; zoom stands in for lens, layer blur for aperture, the grade and palette for light.

| Size | Job | Sourcing rule |
|---|---|---|
| Extreme wide | establish; isolation; aftermath | the place is the hero (the one exception to the 45 % rule, at most one per section); its own asset |
| Wide | geography: hero, goal, exit | needed before any fast sequence |
| Medium | behaviour, explanation, relation | the narration workhorse |
| Close-up | emotion, realisation, decision | crop only if the source has the output's pixels in the crop |
| Macro insert | evidence, mechanism, anchor object | **its own macro asset**, never a scaled-up wide |

Tighten toward the key beat (wide → medium → close → macro → impact), release to wide for the aftermath. Change size only when the shot's job changes. Build each physical hero in three sizes in the same light (wide, medium, insert) before building shots.

**Angle (`object-studio`):** eye level = neutral (establish, explain); low = power, product heroism (the impact beat); high = smallness, consequence (aftermath); top-down = process (how-it-works steps); Dutch = instability, once per film; POV / over-the-shoulder = discovery; profile, silhouette, back-lit = people without lip-sync (§4 "Faceless").

**Parallax by lens feel:** default far 0.2–0.5 / subject 1 / near 1.3–1.6 (the `parallax.js` convention, `express.md` "Look rules"); wide-lens feel = bigger spread (bg 0.2×, fg 1.3×, deep focus); long-lens feel = bg 0.7–0.85× of the hero, strong blur. Never board a whole film on one lens feel.

Pick stills with **implied motion** (a pose resolving forward, blur on one moving part); an at-rest still plus a push-in looks dead.

## 2. Camera moves: every perceptible move answers "what changed?"

- **Drift vs move.** Drift (scale ≤ 1.04 over a shot) is always allowed but is never the shot's motion: the subject acts (`visual-direction.md` §3 "Minimum motion"). A **move** (scale ≥ 1.06, a translate, a focus change) needs a reason in the storyboard: a decision, new information, rising pressure, a look the camera follows. No reason → locked camera.
- **One camera move per beat:** push *or* pan *or* tilt *or* rack focus.
- **Push-in:** starts on the trigger word, stops on the reaction. Scale **per layer** (fg 1.00→1.10, hero 1.00→1.06, bg 1.00→1.03), `transform-origin` on the focal point, `power2.inOut`; optional bg blur 0 → 3 px. A **zoom** scales all layers equally (flatter, observational).
- **Pull-back:** consequence, isolation, scale; needs overscanned plates; lands on the aftermath.
- **Pan / tilt:** layers at their parallax ratios, in the scene's axis direction (§3), lead room ahead; subject a third from the trailing edge.
- **Crash zoom:** scale 1.0 → 1.2–1.3 in 4–6 frames, `expo.out`, motion blur on; once per film, punchy energy only.
- **Dolly zoom:** one realisation beat. Hero constant, bg 1.00 → 1.15 over 0.6–1.2 s (3D: `fov = 2·atan(tan(fov0/2)·d0/d)`).
- **Rack focus:** `power2.inOut`, landing slightly early; scale 1.00 → 1.01–1.02 while focus moves (lens breathing).
- **No handheld, ever:** no sine shake. A camera's life is a slow orbit in one direction (Express `orbit25`, the film's `ORBIT`; Studio iso: the subject turns slowly one way under a fixed view; `object-studio`: `orbit`, `from` → `to`). Tension = a faster orbit, shorter shots, whips.
- **Whip pan:** a transition, not a shot: large translate plus directional blur across the seam.
- Orbit, crane, aerial, tracking, fly-through: a real rig only (§8), never faked on a still.

## 3. Axis, eyelines, cuts, rhythm

- **One axis per scene**, written in the storyboard header ("hero moves L→R, exits right"). Cross only through a head-on shot, a visible camera move or an insert. Flip an asset with `scaleX(-1)` only when it has no text, logo or handed asymmetry (watch hand, driving side), then re-run the Reality check.
- **Eyeline match:** the subject looks off-frame right → the next shot shows what they see, where the eye continues. Labels go on the side the subject faces.
- **Where to cut:** emotion > story > rhythm > eye-trace > screen plane > 3D space. Cut on the word that carries the change, never every N seconds. Smooth cut: incoming focal point within ~20 % of frame width of the outgoing one; far only for a jolt on the impact.
- **Cut on action:** A ends on `power2.in`, B starts on `power2.out`, same direction and speed. **Match cut:** shape within ~5 % on position and 10–20 % on size, same direction, cut on the frame of most overlap; colour match = hue ± 10°, OKLCH L ± 0.1. **Occlusion wipe:** a blurred foreground cut-out at 1.4× parallax crosses the lens. **Smash cut:** calm ↔ violent, impact only. No white flash: hard cut, smash cut or black.
- **Seams carry motion through the cut:** the incoming move enters partway along its path, never from rest; a zoom keeps the sign of its scale change across the cut (a pull-back is answered by a shrink or a hold). One seam direction per film; up, push-through and pull-back keep their meaning (reveal, deeper, arriving); a reversal needs a visible force. Two or three seam types per film, repeated. A clip starts hidden at its cut time; a retake or a change to a scene's first or last second means re-checking that seam (Express: `film_gate.mjs`, run by `express.mjs assemble`).
- **J/L cuts on ambience and SFX:** the next scene's room tone or SFX leads its picture by 4–12 frames (`data-start="{{beat - 0.3}}"`); the outgoing bed tails 12–24 frames.
- **Rhythm staircase:** shots shorten toward the key beat, **a pause**, the impact, one long hold. Never two bursts back to back. Average shot length follows the energy (`visual-direction.md` §3), varied at uneven intervals.

## 4. Story shape, the loaded frame, faceless staging

- **Arc and beat map** come from Gate 1 (`script-voice.md` §3): Acceleration = shots shorten, Impact = the payoff frame, Aftermath = held still.
- **Every shot** changes emotion, advances information, or raises pressure; delete a shot with none.
- **Five anchors** in `SPEC.md`: one main emotion, one visual motif, one anchor object, one break, one final image (= the payoff frame).
- **The loaded frame:** one focal point, three depth layers each with a job (fg frames or puts us inside; middle = subject and act; bg = stakes or context), no dead objects. Show an object just past a threshold (needle in the red, liquid mid-pour), never parked.
- **Carry something across every cut:** an object crosses, or a push into a detail becomes the next scene. Props, light and time of day persist.
- **Faceless staging** (`visual-direction.md` §1 "People"): the decision → hands mid-action on a verb (grip, press, release); the inner state → an object crossing a threshold; gaze and rivalry → space and composition; anyone whose face can't be true → silhouette or contre-jour with a rim.

## 5. Physical timing

### 5.1 Curves, springs, distance, gravity

- **Curves [D]:** AE influence (out `a` %, in `b` %) = `cubic-bezier(a/100, 0, 1−b/100, 1)`. Arrivals: incoming influence ≥ 75 %, peak speed in the first 20–35 %: `(0.33,0,0.2,1)`, `(0.2,0,0.2,1)`. Register once with `CustomEase`: emphasized-decelerate `(0.05,0.7,0.1,1)` (arrivals), emphasized-accelerate `(0.3,0,0.8,0.15)` (exits), quart-inOut `(0.76,0,0.24,1)` (motion-control camera). Never the symmetric `(0.33,0,0.67,1)`.
- **Springs [D]:** overshoot = `e^(−ζπ/√(1−ζ²))`; the ≤ 4 % cap means **ζ ≥ 0.72**; settle ≈ `4/(ζω)`. Use the closed form as an ease: `x(t) = 1 − e^(−ζωt)(cos ωd t + (ζω/ωd) sin ωd t)`, `ωd = ω√(1−ζ²)`. Opacity and colour: ζ = 1.
- **Duration ∝ √distance [O]:** `dur ≈ base·√(dist/base_dist)` (0.3 s at 200 px → 0.6 s at 800 px). **Mass:** heavy = slower start, ζ ≥ 0.85, the surface reacts (0.3–0.6 % camera bump for 3–5 frames, a shadow or dust pulse); light = snaps (ζ 0.6–0.75).
- **1/3 rule:** nothing travels more than a third of the frame in one tween without an intermediate key or a scale change. A multi-point path is **one** tween (`keyframes: {x: [...], y: [...], easeEach: "none"}, ease: "power2.inOut"`, or MotionPath `curviness: 1–1.5`), never chained `to()`s.
- **Gravity [D]:** fall time `√(2h/g)`: 1 m = 0.45 s, 0.5 m = 0.32 s, 2 m = 0.64 s; px-per-metre from a known size in frame. `power2.in` is free fall (`power2.out` the rise). Bounce with restitution e: height × e², airtime × e (ball 0.75–0.85, wood 0.5, putty 0); `CustomBounce` strength ≈ 1−e. Velocity changes within one frame on impact. Paper and leaves: ease in ~0.2 s, then linear with sway.

### 5.2 Contact is caused: units, mass, mechanisms

- **Things that touch, fall or collide are posed from their cause as a pure function of t**, never floated or looped; any frame renders on its own. No physics engine: a fall is `y = y0 − ½·g·t²` in real units until contact, then a landing eased over 2–4 frames with contact squash ≤ 4 % (stiff things less) and a bounce by restitution (§5.1); a pushed thing decelerates at μ·g (casters ~0.05, wood on wood ~0.3) and stops; a part reaching its stop rests exactly on it.
  - **Real units** (`looks.md`, real scale): the place's gravity (`makeKit({ gravity })`: 9.81 Earth, 1.62 Moon, 0 in orbit) divided by M metres per unit; pushes in m/s and m/s²; report in mm and m/s.
  - **Mass decides the timing** (look it up: desk chair ~12 kg, books ~700 kg/m³, wood ~600, steel 7,850): the same push moves a light thing further.
  - **Mechanisms are posed from their driver:** a sliding or turning part is clamped to its stops; a return spring follows §5.1 Springs; a latch holds it until its cue; gears, belts and chains take the driver's angle × tooth ratio.
  - **Nothing passes through anything:** check one still at each contact beat.

### 5.3 Hits, sound, blur

- **A contact's time comes from its cause** (`√(2h/g)`, the push, the cue), never the eye. A living thing reacts ~150 ms after the loudest hit.
- **Sound on the contact** (`look-build.md` "Sound effects and music"): each `<audio>` starts at its contact time, with the computed time in an HTML comment. Contacts within ~40 ms are one sound (the hardest keeps it).
- **Motion blur:** a frame where a part moves ≥ ~4 px is the mean of 5 sub-frame renders across a 180° shutter (`t + k·dt`, deterministic); still frames render once.

### 5.4 Air, any subject's own law, rest, groups, frames

- **Air by its law** (`air.js` `jet`): a running fan is a round turbulent jet along its axis: core u₀ (desk fan ~1.5–3 m/s) to ~2 blade diameters, then ∝ 1/x, Gaussian across with half-width D/2 + 0.11·x, ±25 % gusts at a few Hz; an oscillating head sweeps ±40° over ~10 s. Behind any object only ~15 % arrives (test against the objects' boxes once all props are placed). Light things lean by the air's speed, never wave on their own. Spinning blades = a disc whose opacity is the fraction of exposure a blade covers. A running fan is heard (a low steady whoosh).
- **Any subject moves by its own law:** orbits by gravity (period² ∝ distance³), ions by drift plus diffusion (√(2Dt)), heat by conduction, a heart at its rhythm, a population by its equation. Take the law and constants from a cited source, model in real units, check the output against the source. When real scale can't be seen, change the fewest scales (size, distance, time: one each at most), keep ratios within each, and show each change on screen (a slowed clock, a scale bar, "sizes not to scale"). Electricity: current from the numbers model, pulses at a stated visualisation speed in the waveform's shape (ac sine, dc straight, pwm blocks, three phases), mains slowed by a shown time scale, heat by black-body colour, an arc lit only for its frames (`circuit.js`, `instruments.js`). Fields and light: field lines traced from the sources and spaced by flux, filings and needles aligned, rays bent by Snell's law with a cited index, focus and image traced (`fields.js`, `optics.js`). A sine or hand-timed tween standing in for a law is a Reality fail.
- **Every prop at rest touches its support, measured:** register each resting prop (`kit.js` `rest`) and `settle()` once all are placed: it drops by the smallest gap under its lowest points (6 × 6 grid over its footprint), lowest first; only lower objects support; it lifts out of a surface up to 3 cm, deeper is reported as placed inside something; a `foot` part when the lowest point isn't what rests. Then audit every object (gap or overlap 0.5–30 mm under its centre = error). Thin layers have thickness (rug ~5 mm, paper 0.1 mm); a tilted object leans on something; a cable lies on what is under it and ends where it connects; a container is open and its contents lean on its rim.
- **Ambient motion is the real amount:** indoors the air is still, LED strings steady, a quartz second hand jumps in ~30 ms with a hair of overshoot, a desk chair swivels on its real pivot. A perpetual sine loop on something that would rest is a Craft fail.
- **Data never overshoots:** numbers and bars ease to their value and hold ≥ 0.5 s.
- **Group timing:** total stagger `(n−1)·offset + dur` ≤ ~0.8 s, else shrink the offset or stagger out from the focal point. Items that belong together share **identical** ease, duration and direction; unrelated items differ in at least one. A contact shadow settles with its object; labels follow 40–60 ms later.
- **Motion blur [D]:** length per frame = displacement per frame × shutter / 360. `data-motion-blur="on"` above ~8 px/frame at 1080p; 45–90° for staccato impact, 270–360° for a smear.
- **On twos** (`tq = Math.floor(t*12)/12`): stylised layers only, never the camera, no motion blur on stepped layers.
- **Snap every cut and key** to `Math.round(t*fps)/fps`. A hold registers from ~4 frames; an accent pose holds 6–12.
- **Never compare a raw cue with a snapped cut:** find a cue's shot with `shotAt` / `overlayWindow` (`camera.js`) and run `windowProblems` over every overlay and label: an empty window, or one shorter than its `readTime`, is an error.

## 6. Design in time

- **Arrival order = reading order.** The most important element arrives alone, holds longest, keeps the strongest contrast; secondary information arrives as a group 150–300 ms later. One hierarchy level changes per beat.
- **One grid for the film** (e.g. 12 columns, 8 px baseline at 1080 wide): motion endpoints snap to it; elements that persist across a cut keep their position.
- **Colour in OKLCH:** gradients `linear-gradient(in oklch, …)`; colour tweens through a registered `@property` or `color-mix(in oklch, A p%, B)` on a 0–1 proxy. Lightness within ± 0.1 across a colour flood. Neutrals tinted toward the primary hue (chroma 0.005–0.02); on dark grounds the accent at L 0.70–0.85, C 0.12–0.18. Grade order on every shot: exposure and white balance → contrast → saturation → split-tone (< 0.15) → unify.
- **Infographics:** design the **final static frame first**; animation only decides when each element appears (title → icon → number → label → connector; a connector draws after its source, before its target, 0.4–0.6 s). Focus + context: active element full, the rest ~0.35 opacity within 0.3 s. A chart holds 1–1.5 s before moving; axes stay still; data states cross-dissolve, never wipe.
- **Overlays (`editorial.js` `envelope`, `IN_DUR`, `EASE`):** entrance by size (chip 0.2 s, pill 0.25, card 0.3, headline 0.4; never over 0.8) on a strong ease-out; exit 0.7 of that, accelerating away the way it came. An icon or chip starts at 0.9–0.96 scale from its anchor; only data marks grow from zero. Recurring furniture (headline card, chips, captions) gets the quietest entrance. A crossfade showing two states takes 2–5 px of blur at its middle.
- **One number moves at a time;** its label fades in **after** the count lands.
- **Kinetic type:** line mask reveal (`SplitText` `mask: "lines"`, `yPercent: 100 → 0`, 0.6–0.9 s, emphasized-decelerate, 0.08–0.12 s between lines), split after fonts load. Display tracking −1 to −3 %. A variable font animates one axis per beat, never size and weight at once. ≤ 3–4 words/s on screen.

## 7. The motion-language line in `SPEC.md`

Lock before animating, next to the LOOK line: **CAMERA** = the rulebook (§10), frame rate and shutter, the rigs (§8), the A/B pattern, the one wow shot, the technique palette (§9); **MOTION** = one arrival ease and one exit ease (a third needs a reason), a base unit (e.g. 0.4 s; every duration a multiple: 0.2 / 0.4 / 0.8 / 1.2), one stagger offset, an intensity budget (max travel, max scale, overshoot), holds ≥ 0.3 s after each beat; **ANCHORS** = the five anchors (§4). Review checks consistency against it.

## 8. A-roll, B-roll and real camera moves

Both are built in the film's look (no lane films footage):

- **A-roll:** the subject the narration names, acting, while the claim is spoken. It carries the claim.
- **B-roll:** 0.8–2 s shots of the topic's world on a real camera move (a macro of the material, a track past the machine, a push into the workspace). Mood, rhythm, section bridges; never a claim alone. **[O]** One B in three shots at Punchy, one in four at Calm; a B before each new section and right after the impact; never two Bs of the same set in a row.

**Moves:** push, slider, tracking, crane, orbit, drone, dolly zoom come from the 2.5D layer moves (§9) or a pan or zoom of the iso view. Over a still: drift, push ≤ 1.06, rack focus, parallax, as accents only.

**Every camera moves like a rig:** Studio: `isoFrame` stations and a `route` of legs (one ease per leg, no stop mid-leg); Express: `cinema.js` `camAt`. The target trails a moving subject by 80–150 ms (critically damped); depth of field by layer (`cinema.js` `focus`), the pull on the beat word; motion blur on a fast leg (`pose.speed`).

**Frame rate:** 30 fps by default. 24 fps only when `BRIEF.md` says fps 24; then camera moves and fast bodies average 4–8 sub-frames across a 180° shutter (`finish.layer`, §5.3), and at 30 the same for any move that still strobes. Never 60 (doubles the render, re-encoded to 30). Slow motion: render the sub-frames needed, or a `rate` lane speed ramp (`/hyperframes` `motion.md`, registry `beat-freeze-cut`).

**One wow shot per film**, on the impact beat, built first and shown in the style frames (a zoom through a cutaway into the mechanism, a slow-motion action with a ramp, a fast pull-out to the whole world on its slab).

**A and B cut as one film:** same palette, light and grain; matched motion direction (§3).

## 9. The cinematographer's toolbox

**The agent chooses the camera, never asks.** Step 5 writes the camera plan on the SPEC CAMERA line: a palette of 6–10 techniques from §1–3, §9 and §10 (Express: 4–6, its planner's card in `express-planner.md`), each tied to a beat's job; a technique outside it needs a reason in the storyboard. The art keeps its projection; moves are 2.5D, depth layers moved against each other (`engine/iso/cinema.js`: `orbit25`, `crane25`, `dollyZoom25`, `drone25`, `bokeh`, `discs`, with `parallax.js`); Studio's iso camera (`isoCamera`, `isoFrame`, `route`) pans and zooms with the same layer effects; `blueprint` beats hold a locked frame or a slow pan; `object-studio` plays the same table with a perspective camera (`camera.js`: `fovFromMm`, `dofFor`, `orbit`, `crane`, `dollyZoom`, `drone`), lens in mm and f-stop in place of layer effects. One move per beat; at most one dolly zoom and one drone per film. **Aperture follows size:** a wide at f5.6, a zoom-in or macro at f1.2–2.8. Tags: **[3D]** three.js, **[2.5D]** layered drawings (Express), **[C]** HyperFrames compositing.

| Beat job | Technique |
|---|---|
| Hook, establish | `drone25` onto the hero + haze, `bokeh(5.6)` |
| Context, path | `orbit25`, or a pan along the path |
| Mechanism | push-in with a rack focus cause → effect, `bokeh(2.8)`; a `cutaway` beat; a named close part: `focusRing` f1.2–2.8 on it |
| Arrival on a subject | arrive and orbit (§9.3) |
| Crack | the one `dollyZoom25` |
| Acceleration | shorter shots, `whip`, a faster one-way orbit |
| Impact | close zoom, `bokeh(1.4)` + `discs`, a speed ramp; a `blueprint` inset when the claim is a measure |
| Aftermath, bookend | `crane25` up to the wide, ending on the opening framing |

### 9.1 Light — mood and where to look
Isometric looks are unlit: mood comes from the grade and palette per section of the colour script. `object-studio` lights:
- **Contrast ratio [D]** key:fill = `(key + fill) : fill`: 2:1 friendly explainer, 4:1 dramatic, 8:1+ low-key (mystery, the problem). A ratio change is a mood change.
- **Colour temperature:** warm key (~3200 K) against cool ambient (5600–6500 K) separates the subject; flip it where something goes wrong.
- **Practicals** (a lamp, screen or window in frame) motivate the key. A rim separates a dark subject from a dark ground; keep one shadow side dark; never flat front light.
- **Light as the event** (any look): a shadow sweeps, a lamp switches on at the reveal, the sun moves.
- **Story vs explanation grading** (a film that wraps an explanation in a small story): story sections graded night, blue-grey, low-key (8:1+), dim practicals; the explanation bright and neutral, 2:1. The switch at the pivot is the film's one rule break (§10); the bookend returns to the night grade, same set and framing as the opening, now working. Write both moods per section in the colour-script line.

### 9.2 Lens — how the world feels
- **Lens as layers:** `bokeh(fstop, { focus, mm })` blurs layers by depth from the focus plane (f1.2–2 melts the bg on the key beat, f5.6–8 keeps the world sharp), `discs` paints out-of-focus lights, `haze` pales far layers.
- **Aperture points at the part.** When the narration names a part seen close (the valve, the hinge, one blade), open to **f1.2–2.8** with focus on it (f1.2 a macro or small part, f2.8 when neighbours must stay readable). Focus lands on the part's first word (racked from the previous part over 0.3–0.5 s, `power2.inOut`, slightly early) and stays to its last; a second part named is a rack focus, never a cut. **Express:** give the part its own depth layer when it has one; otherwise `focusRing(target, buffer, { cx, cy, fstop, clear, feather, amount })` (`clear` ≈ its size in frame heights), timed with `hold(t, t0, t1, t2, t3)`. **Studio:** `dofFor({ mm, fstop, focusM })`, `focusM` = distance to the part. Skip it when the whole object is the subject (a wide stays f5.6).
- **Scale by zoom:** a wide hold = the whole world, a close zoom = the macro; a circular inset shows a close-up while the wide stays.
- **Into the thing:** a cutaway (`cutaway.js` in Studio) and a zoom through it.

### 9.3 Movement — beyond §2
- **Reveal:** move past a foreground occluder to uncover the subject or its scale **[3D][2.5D]**.
- **Push-through:** the camera passes through a surface (window, mesh, shell) into the next space, a scene change with no cut **[3D]**.
- **Crane [2.5D]:** `crane25` rises from detail to context or lowers into it; the aim holds.
- **Drone [2.5D]:** `drone25` descends to the hero (hook) or climbs away (bookend). The wow shot or nothing.
- **Dolly zoom [2.5D]:** `dollyZoom25`, the Crack, once.
- **Tracking:** alongside a moving subject at its speed **[3D]**.
- **Arrive and orbit [2.5D][3D]:** every zoom that lands on a subject, in or out, hands over to a slow orbit with no stop. While the zoom travels the **edges blur and the centre stays clear** (`focusRing` on the subject, `fstop` 1.4–2.8, `hold(t, zoomStart, zoomStart + 0.25·zoomDur, orbitEnd − 0.3·orbitDur, orbitEnd)`). On landing the orbit starts from the arrival pose: 6–12° over the shot in `object-studio` (`orbit` with `from` = the push's end angle, same radius and elevation); `orbit25(t, { rest, start: landing, dur, from: 0, to: ±1, sweep: 0.08–0.14 })` in 2.5D; Studio iso: the subject turns, the view stays. Orbit toward the open side of the frame, or the side that reveals what the narration names next; alternate sides between consecutive arrivals; a vertical orbit (`crane25`, a few degrees of elevation) when height, top or underside is the point. A pull-back lands on the wide and orbits its surroundings. At most one per beat and three per film, never under text meant to be read. Express: `camAt` keys end at the landing, the orbit starts there, `focusRing` runs after `drawLayers`, before `finish.apply`.
- **Orbit [2.5D]:** `orbit25`, slow, on context beats. **One direction for the whole film** (Express locks it with `filmOrbit`; `camAt` refuses keys that turn back with no hold). A subject may turn itself on a visible turntable or in a hand.
- **Oner [3D]:** one unbroken move through a process; cuts hidden in dark passes or whips. `camera.js`: named `stations`, a `route` of legs (a leg starting before the previous one ends is refused), `loopEnd` for a Short; `engine/three/examples/oner.js` (home, dive, inside, home).
- **Home shot + dives [3D]:** one world, one camera, no cut. Home = the wide of the world on its slab (`isoFrame`), where the A/B comparison lives; each dive pushes in to one subject and back out; a push-through enters a part at its own scale. `travel` arcs over the set (`over`: a Box3 of the set or a moving part's envelope, measured once when built), eases in and out, reports `speed` (m/s) each frame.
- **Attention by ghosting [3D]:** on each beat everything but the subject fades to a light desaturated ghost (~25 % opacity); context returns as the camera pulls out. The floor stays whole (`keep`). `attend(root, { keep, ghost, desat, dur, edge })` on cloned materials; `look.at(t)` runs once per frame, after every other `at()`.
- **Loop end (9:16) [3D]:** last frame = first. `loopEnd(st, { end: (frames - 1) / fps })` returns the camera to `home` on the last frame; release attention and finish its fade before it (`oner` refuses a longer `look.dur`); moved parts return to their start.
- **Motion-control repeat [3D]:** the identical move over two states (before / after, A / B, new / worn), then cut or wipe between them. The strongest comparison shot.
- **Frozen moment:** time stops on the instant, the view zooms in, then time runs again.

### 9.4 Time
- **Slow motion** for what the eye can't see (§8). **Timelapse** for slow processes; **hyperlapse** = timelapse with a travelling camera **[3D]**.
- **Freeze-frame and annotate:** stop, draw labels and leaders, release **[C]**.
- **Reverse** to show the cause; **speed ramp** for emphasis (§8).

### 9.5 Editing — beyond §3
- **Cross-cutting:** alternate two lines (A vs B) in the same framing.
- **Collision montage:** two shots that together mean a third thing, for an argument, not a fact.
- **Graphic match:** a shape becomes a similar shape (circle → wheel → gauge) to jump scale or idea.
- **Invisible cut:** behind a dark pass, a whip or an object crossing the lens (§3 "Occlusion wipe").
- **Insert as evidence:** a macro cut into a wide beat to prove the spoken claim.
- **Split screen** on 16:9 only, for simultaneous things; on 9:16 stacked only if both read at 360 px (`visual-direction.md` §7).

### 9.6 Educational signatures — the scale and the inside
- **Scale journey:** one continuous zoom from human scale to the microscopic (or cosmic) with a scale bar counting **[3D]**.
- **X-ray / ghost shell:** the outer surface at 20–35 % with a bright fresnel edge, the mechanism working inside (`attend(...)` with `edge`) **[3D]**.
- **Cutaway section:** one section plane through the assembly (`cutaway.js`), cut face solid or hatched; exterior and section are the same set with `cut.off(t)` / `cut.on(t)`; `cut.set(offset, t)` slides it **[3D]**.
- **Exploded view:** parts separate along their assembly axes, labelled, then reassemble (`/hyperframes` `types/3d.md`) **[3D]**.
- **World-space labels:** pinned to the object with a leader line, moving with the camera **[3D]**.
- **Map / terrain zoom:** globe to street for place topics (`/hyperframes` `film.md`) **[C]**.
- **Hands-on macro:** hands doing the real thing, very close and shallow **[3D]**.

## 10. Emotion drives every parameter: the rulebook

Each storyboard row names one emotion and a motivation for each choice; a move, lens, light or colour without one is removed. Static unless motivated; few lenses, colours and cuts. Isometric looks use the Size, Focus, Movement, Colour and Ratio columns; Lens · angle and Light are `object-studio` only. Shutter is 180° except panic (45–90°) and memory (270–360°).

| Emotion | Size | Lens · angle | Focus | Movement | Light | Colour | Ratio |
|---|---|---|---|---|---|---|---|
| Intimacy | MCU, CU | 35–50 mm close, eye | shallow | static or very slow push | soft 2:1, warm practicals | warm, low sat | 1.37 / 1.66 |
| Isolation | WS, EWS | 85–135 mm far or 24 mm, slightly high | deep, or shallow on a tiny subject | static; slow pull-out | one source, 6:1+ | cool, desat, one warm accent | 2.39 / 1.37 |
| Dread | MS → CU | 35–40 mm, slightly low | medium | static long take or creeping push | short-side key 8:1, top light | desat green-teal | 1.85 / 2.39 |
| Panic | MCU, CU | 18–28 mm close, shifting | deep | fast one-way orbit, whips | hard, mixed temperatures | dirty, clashing | 1.85 |
| Power | MS, FS | 24–35 mm, low | deep | static symmetry or slow crane up | hard top or edge | high contrast | 2.39 |
| Vulnerability | MS, CU with headroom | 85 mm+, high | shallow | static | soft, low key | pale, cold | 1.37 |
| Memory | inserts, CU | 50 mm soft | shallow | slow one-way orbit | backlight, flare | warm, faded blacks, grain | 1.33 / 1.37 |
| Awe | EWS, WS | 24–35 mm, eye or ground | deep | slow lateral or crane | low-sun backlight | golden | 2.39 |
| Unease | CU, centred WS | 14–24 mm very close, dead centre | deep | static or slow arc | hard, unmotivated colour | one unnatural hue | 1.19 / 1:1 |
| Joy, curiosity | FS, MS | 28–35 mm, ~1 m height | medium | follow at walking pace | bright, soft | saturated pastels | 1.85 |
| Grief | WS, one CU late | 50 mm, eye; high at the collapse | medium | static, long holds | low key, overcast | desat, cool | 1.85 |
| Revelation | MS → CU | 35–50 mm, eye | rack to the discovery | slow push, or the one dolly zoom | changes mid-shot | palette shifts from here | same, or wider |

**The rulebook** is the CAMERA line of `SPEC.md`, 5–10 rules: frame ratio, zoom levels (2–3, the closest kept for the climax), movement rule ("static unless the inner state changes, then a slow push"), light rule (`object-studio`: motivated sources, short-side key, ratio), palette (2–3 hues + 1 accent) and its arc, texture, shutter, what is never shown. **Rule breaks** are logged under it with their story reason, at most one per turning point (the orbit turning faster when control is lost, the first colour shift, the ratio opening wider).

**Structure:** establish wide, tighten as the feeling rises, tightest size for the climax; the final image rhymes with the opening composition; one idea per shot; hold a beat after the line; keep key action off screen when sound carries it.

### 10.1 Light
`object-studio` only. Every light motivated by a source in the world; short-side key (light the side away from camera); shape with negative fill before adding lamps; leave mixed sources uncorrected when they define the place. three.js colours from Kelvin: candle 1900 K `#ff8400` · sodium 2000 K `#ff890e` · household bulb 2700 K `#ffa757` · tungsten 3200 K `#ffb87b` · cool fluorescent 4000 K `#ffcea6` (+ green tint) · noon sun 5600 K `#ffefe1` · overcast 6500 K `#fffefa` · shade 8000 K `#dde6ff`.

### 10.2 Composition
- **Thirds:** eyes on the upper third, look room ahead. Centre and symmetry = order, control, unease or authority.
- **Headroom** tight; a subject low under large headroom reads small. **Negative space** 60–80 % reads as isolation. **Frame in frame** (doorway, window) = entrapment or watching. A **foreground** object removes flatness (§4).
- **`object-studio` camera height:** eye ~1.5–1.7 m, child ~1.0 m, low 0.3–0.6 m, scaled to the set.

### 10.3 Frame ratio inside the canvas
16:9 films only (9:16 and 4:5 stay full-bleed). Constant unless a logged break changes it. At 1920×1080: 2.39 = 138 px bars top and bottom · 1.85 = 21 px top and bottom · 1.66 = 64 px each side · 1.37 = 220 px each side · 1.33 = 240 px each side · 1:1 = 420 px each side. The mask is the top layer of the root composition (two black `div`s, no grain); captions and safe areas sit inside the image area.

### 10.4 Finishing order, identical on every shot
In the finisher pass: 1. grade; 2. halation (subtle, only when the rulebook names it); 3. grain; 4. vignette; 5. aspect mask, last.

### 10.5 Approach presets
Start the rulebook from the nearest preset (borrow an approach, never shots): **intimate-realism** 1.37/1.85, 28–35 mm at child height, slow one-way orbit, pastels · **austere-portrait** 1.37, static deep, subjects low under huge headroom · **subjective-tunnel** 1.37, one 40 mm very shallow behind the subject, the background carried by sound · **lyrical-colour** 2.39, close slow arcs, saturated backlight, cyan and magenta · **cold-observation** 1.85, wide deep static, the horror off screen · **dreamy-memory** 1.85 + 4:3 inserts, 50 mm soft, warm faded blacks · **landscape-awe** 2.39, 24–35 mm slow lateral, figures small in vast space · **period-texture** 1.85, 50 mm through glass, soft window light, muted greens and pinks.

## Sources

Paraphrased from Serge Shima, [smixs/visual-skills](https://github.com/smixs/visual-skills) (CC BY 4.0; parts credit [agentara/skills](https://github.com/agentara/skills), MIT) and [iart-ai motion skills](https://github.com/iart-ai/motion-skills) (MIT, © 2026 iart.ai).
