# Measuring a reference video ethically

**Measure theirs, make yours.** Take only measurements: section lengths, cuts, camera moves, stillness %, which words are beats, loudness, and the palette as values (dominant colours and their share, ink and caption treatment). Never take script lines, character designs, images, music, logos or a channel's signature colour scheme. Use a video the user may access or provides, for measuring only; never redistribute it, delete the raw file when the user no longer needs it, and credit the creator as inspiration in the description.

A link that will not download: a subagent watches it to the end in Claude's built-in browser and writes `reference-measurements.md` (cut rhythm, palette, type, overlays, captions, camera; craft only, what it could not measure is `[unknown]`). With a file:

1. **Transcript, read to the end.** Auto-captions drop sentences, often the ones with the numbers: when in doubt, transcribe the audio again (Whisper, or `/media-use`). Per-sentence timing gives word timing to about 1/6 s. Measure rhythm in seconds, not words, so it carries across languages.
2. **Mechanics:** `bash <skill-dir>/scripts/measure_reference.sh reference.mp4 measure/` (one folder per reference; a run clears it) writes `info.txt`, `frames/` (one still per second), `contact/` (4×4 sheets, `index.txt` lists their seconds), `reference-board.jpg` (the Gate 3 benchmark board), `cuts.txt`, `stillness.txt`, `loudness.txt`, `palette.txt` (dominant colours per second with share and OKLCH L; `node <skill-dir>/scripts/palette.mjs --compare <#hex> <#hex>` gives a lightness gap) and `summary.txt`. Use the same stillness threshold for the reference and your draft.
3. **Contact sheets**, in 4 parallel subagent parts. Per shot: start–end, what is visible (in general terms), camera move, the beat word that triggers it. From `palette.txt`, name each dominant colour's job (ground, floor, hero, its dark parts, each accent's job) and read the type: ink, kicker, headline, tags, caption box, active-word highlight; note how the hero separates from the ground (value or a coloured backdrop). Sound effects read from images are marked `(guess)`. Measure what watching misses (captions fixed while the ground scrolls).
4. **Write `reference-measurements.md`:**

```markdown
# Reference measurements: <title> by <creator> (inspiration, not source material)

- Total duration: ...
- Structure: <n> sections; length of each: ...
- Shots: ... | hard cuts: ...
- Dominant camera move: push-in / pull-out / static
- Stillness: ...% (threshold: ...)
- Beats: on average 1 every ... s
- Loudness: ... LUFS
- Captions: position ..., size ..., fixed to screen / moves with camera
- Things viewers feel but don't notice: ...

## Palette (from palette.txt; values measured, never a brand copied)
- Ground and walls: #… (…% of frame), L …
- Floor: #… (…%), L …
- Hero: … ; its dark parts: … (ΔL to the ground: …)
- Accents: #… for … (its job), …
- Type: ink …, kicker …, headline …, tag …
- Captions: box …, text …, active-word highlight …

## What we use for our film
- Structure and rhythm: ...
- Palette: our ground / hero / ink / accents, steered by the measured values above
- Deliberately different: story, characters, brand marks, ...
```
