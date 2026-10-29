# Motion and style rules

Starting numbers, measured from hand-made explainers; a reference video's measurements override them.

## 1. Push-in: camera, not scissors

- Few hard cuts (a good reference: ~4 in 9 minutes). Change the view by pushing in or pulling out, and bring objects in **in place** (drawn on, grown from small, crossed out).
- Scale numbers, eases and the reason a push needs: `camera-motion.md` §2. Move the world or the hero, never creep the scale of a landed title. Move the visual wrapper, never the clip element carrying `data-start` (`/hyperframes` `references/motion.md`).

## 2. Beats: everything lands on a word

- Nearly every change on screen happens on a spoken word, **readable on the word**. Per element: **lead** — structure the eye can prepare (axes, a card, a set) arrives ~0.2 s early; **sync** — a new fact lands by the word: start = `BEATS.<name>.start` minus its entrance time (a 1.4 s count-up is `{{name - 1.4}}`; a quick entrance starts 0.03–0.08 s early); **wait** — a punchline, negation or withheld answer is gated to the revealing word. Never late.
- An object no word triggers is probably unnecessary, or the script lacks a word.

## 3. Motion budget: no dead seconds

- "Still" ≤ 10 % of the duration (`scripts/stillness.mjs`; a good reference is ~5 %). Measure the final file too: a cleaner encode can raise it.
- Every shot has at least one **continuous** motion from the subject acting (wheels turning, a needle moving, a fill rising); camera or light only support it (`visual-direction.md` §3 "Minimum motion"). Breathing or pulsing text and UI, or a moving mouth alone, do not count.
- `stillness.mjs` measures the whole frame: small motions on a mostly empty ground still read "still".

## 4. The mitten rule (stylised characters only)

- For a stylized figure in the iso world (a person for scale, a character the user asked for); real people: `visual-direction.md` §1 "People are the hardest subject".
- No fingers, no elbows, no part bending at more than one point. Base shapes: round head, bean body, mitten hands, short legs; expression through eyes, brows and mouth.

## 5. On-screen text

- Captions are fixed to the screen, never moved with the camera.
- On-screen text is in the narration language from `BRIEF.md`; the font has every glyph it needs; right-to-left languages need `dir="rtl"`.
- Safe zones (format from `BRIEF.md`):
  - **9:16 Shorts:** text only in the 168–1330 px band (`/hyperframes` `references/types/vertical.md`); nothing readable right of x 950.
  - **9:16 Reels and TikTok:** keep text out of the bottom 25 % (captions excepted), top 12 %, right 12 %.
  - **4:5 feed:** 8 % on every side.
  - **16:9 landscape:** 5 % on every side; the bottom 15 % for captions.
- **Caption position (a target):** the block (one or two centred lines, the hero composed above it), as fractions of the height:
  - **9:16 Reels and TikTok:** top 72–76 %, bottom ≤ ~82 %.
  - **9:16 Shorts:** bottom at the band's end (1330 px, 69 %).
  - **4:5 feed:** bottom at 92 %, top ~76–80 %.
  - **16:9 landscape:** inside 85–95 %.
  - The lowest lines may brush the platform overlay: check the phone sheet (`npx hyperframes snapshot --review`), never lift captions toward the middle. Review P1: on Reels and TikTok a block top above ~70 %; on Shorts a block bottom above ~65 %.
- ≤ ~7 words per caption line (~16 characters for CJK), broken at the speech pauses: `type.js` `phrases()` does it (`node scripts/captions.mjs audio/narration.txt audio/words.json` writes `audio/captions.js`); `drawCaption` shrinks a phrase that won't fit two lines at 54 px, so keep phrases short.
- `type.js` holds the zones (`safeArea`), the drawing (`drawCaption`, `pinLabel`) and the layout record: call `layoutFrame(ctx, t, { format, hero: heroBox(camera, heroObject, W, H) })` LAST in the frame function, after every caption, label and card (the `shots.js` runner does it); it hands text and hero boxes to `strips.mjs` for the reviewer. Never per-film caption code. World labels stay above the caption.

## 6. Sound

- The narration is always clear; music ducks under it, never to silence.
- A sound with a physical cause lands on its computed contact time and may be dense; other SFX sparingly on key beats only.
- Final: about −14 LUFS, true peak ≤ −1 dBTP (`scripts/loudness.mjs`).
