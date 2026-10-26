# Motion and style rules

These are the numbers that make code-made animation feel alive. They come from measuring an "ink + watercolour" cartoon made with Claude + HyperFrames. Use them as a starting point, then adjust to a reference video's measurements if there is one.

## 1. Boil: lines that "shiver"

- **What:** ink lines are redrawn with slight variation at a fixed rate while the paper behind stays still. This is what makes a drawing feel hand-made and alive instead of printed.
- **Numbers:** at 30 fps, redraw the lines **every 6 frames** — 5× per second. Objects that *move position* still move smoothly at the full 30 fps. Only the line shape steps.
- **How:** search the catalog first (`npx hyperframes catalog --query "hand-drawn line boil wobble"`), since the registry's hand-drawn family already has boil helpers. If you must build it, use SVG `feTurbulence` + `feDisplacementMap` with a `seed` that changes every 6 frames.
- **Important:** HyperFrames renders by seeking to every frame, not by playing the video from the start. So the `seed` **must be derived from timeline time**, e.g. `Math.floor(time * 30 / 6)`. Never use `setInterval`, `Date.now()`, or unseeded `Math.random()`. Anything that depends on wall-clock time breaks or flickers in the render.

## 2. Push-in: camera, not scissors

- The reference film, almost 9 minutes long, has only about **4 hard cuts**.
- Everything else uses a camera pushing in or pulling out, plus objects that **appear in place** (drawn on, growing from small, or "crossed out").
- Scale numbers, eases and when a push needs a reason: `camera-motion.md` §2 (up to 1.15 only for the illustrated looks). Move the world or the hero, never creep the scale of a landed title late in a scene — `/hyperframes` lists that as a generated-video tell. Move the visual wrapper, not the clip element that carries `data-start`. Technical details are in `references/motion.md` of the `/hyperframes` skill.

## 3. Beats: everything lands on a word

- Nearly every change on screen happens exactly on a spoken word.
- Sync means the thing is **readable on the word**, not that its tween starts there. Per element, choose: **lead** — structure the eye can prepare (axes, a card, a set) arrives ~0.2 s early; **sync** — a new fact or object lands by the word: start = `BEATS.<name>.start` minus its entrance time (a 1.4 s count-up is `{{name - 1.4}}`, so the value is settled when it is said; a quick entrance starts 0.03–0.08 s early); **wait** — a punchline, negation or withheld answer is gated to the revealing word. Never late: it feels late.
- Quick test: if an object appears without a word triggering it, the object is probably unnecessary, or the script is missing a word.

## 4. Motion budget: no dead seconds

- Target: "still" ≤ 10% of the total duration. A good reference film is only about 5%.
- Every shot needs at least one **continuous** motion: boil, the subject acting (wheels turning, a needle moving), drifting clouds or a drifting background plate, a light sweeping across the hero, or a camera that keeps pushing in. Breathing or pulsing text and UI is not continuous motion; `/hyperframes` lists it as a tell of generated video.
- `stillness.mjs` measures change across the whole frame, so small motions on a mostly empty ground still count as "still". Flat and minimal looks need a moving background plate or camera. Measure the final file too: a cleaner high-quality encode can raise the still share.
- A moving mouth alone **does not count** as motion. It is the number-one reason films feel dead.
- Measure with `scripts/stillness.mjs`.

## 5. The mitten rule (stylised characters only)

- Only for a cartoon the user asked for (looks C, G). Real people follow `visual-direction.md` §1 "People are the hardest subject".
- No fingers, no elbows, no body part bending at more than one point.
- Why: fewer joints, fewer bugs. Five-fingered hands holding objects are the most common source of errors in code-made animation.
- Suggested base shapes: round/oval head, bean-shaped body, mitten hands, short legs. Expression through eyes, brows, and mouth is enough.

## 6. On-screen text

- Captions stay in a fixed position on screen; they do not move with the camera.
- On-screen text is in the narration language from `BRIEF.md`. Check that the chosen font has every glyph that language needs (accents, CJK, Arabic, Devanagari, ...); right-to-left languages need `dir="rtl"`.
- The format comes from `BRIEF.md`. Safe zones per format (keep important text out of these areas):
  - **9:16 Shorts:** text only in the 168–1330 px band (`/hyperframes` `references/types/vertical.md`); below 1330 only decoration; nothing readable under the right-hand rail (x > 950).
  - **9:16 Reels and TikTok:** bottom 25% (the platform's caption + handle overlay; the caption is the one deliberate exception, see below), top 12%, right 12%.
  - **4:5 feed:** 8% on every side. Text must read without sound.
  - **16:9 landscape:** 5% on every side. Reserve the bottom 15% for captions/subtitles.
- **Caption position (a target, not only a keep-out).** The caption block (its one or two lines, centred, the hero composed above it) sits in the lower third, as fractions of the frame height:
  - **9:16 Reels and TikTok:** block top 72–76 %, block bottom at most about 82 %.
  - **9:16 Shorts:** block bottom at the end of the band (1330 px, 69 %): as low as the band allows, never higher.
  - **4:5 feed:** block bottom at the safe edge (92 %), top about 76–80 %.
  - **16:9 landscape:** block inside the bottom 15 % (85–95 %).
  - The lowest lines may brush the platform's caption/handle overlay. Check it on the phone sheet (`npx hyperframes snapshot --review`) instead of lifting the captions toward the middle: captions near the middle compete with the hero, which the subject framing already puts in the upper middle. On Reels and TikTok a 9:16 caption block whose top edge is above ~70 % of the height is a P1 in review; on Shorts, one whose bottom edge is above ~65 % (the 70 % line never applies there: the band ends at 69 %).
- At most about 7 words per caption line (about 16 characters for CJK). Break long sentences at the speech pauses in `words.json`. The engine's `type.js` does this (`phrases()`: a narration line end, a sentence end, `,` `:` after 3 words, a run over 7 words at its longest pause of at least 0.3 s with 2 words on each side and, with no pause, in near-equal parts, a phrase held through the pause that follows; `drawCaption` never draws outside the caption zone: a phrase that does not fit in two lines at 54 px is shrunk, so keep phrases short; `node scripts/captions.mjs audio/narration.txt audio/words.json` writes `audio/captions.js`).
- The same module holds the zones above (`safeArea`) and the drawing (`drawCaption`, `pinLabel`): use it, never per-film caption code. The caption sits at the target position above, under the subject; world labels stay above it.

## 7. Sound

- The narration is always clear. Background music ducks under the narration and never disappears completely.
- A sound with a physical cause (an impact, a latch, a break) is placed from the bake and may be dense; use the other sound effects sparingly and only on key beats: a "pop" when an object appears, a "whoosh" on a fast camera move, a pen scratch while drawing.
- Final target: about −14 LUFS, true peak ≤ −1 dBTP (works for YouTube, Instagram, and TikTok). Check with `scripts/loudness.mjs`.

## 8. "Ink + watercolour" palette (look G in `looks.md`)

| Role | Colour |
|---|---|
| Paper | `#F2E8D5` with a fine fibre texture, slight vignette |
| Ink | `#2A2522` (near-black, warm) |
| Watercolour 1 | `#7FA7C9` (faded blue) |
| Watercolour 2 | `#E3A66B` (earthy orange) |
| Watercolour 3 | `#9DBF8E` (sage green) |
| Guide line | `#A9C8E8` ("non-photo" blue, for sketches that get erased later) |

Let the watercolour spill slightly outside the ink lines. That imperfection is what makes it feel hand-made.
