# Measuring a reference video ethically

## Ground rules: three ways to imitate

1. **Copying the images** — downloading and re-uploading, or tracing frame by frame. This is theft.
2. **Copying the script** and just changing the character names. Also theft, only slower.
3. **Copying the craft**: measuring how the film is built, then using those measurements for your own story. **Only this one is used.**

What you may take is the measurements: section lengths, number of cuts, camera movement, boil rate, stillness %, which words are beats, loudness, and the palette as measured values (dominant colours and their share, ink and caption treatment). What you may not take: script lines, character designs, images, music, and logos. Colours are measured to steer your own palette; a channel's signature colour scheme is never copied.

One sentence covers it: **measure theirs, make yours.**

About the file: use a video the user is allowed to access, or one the user provides. It is for measuring only. Don't redistribute it, and delete the raw file afterwards if the user no longer needs it. Still credit the original creator as inspiration in the video description.

## How to measure

### 1. Full transcript (read to the end)

- Auto-captions often have gaps, and the gaps are often exactly the sentences with the important numbers. When in doubt, transcribe again from the audio (Whisper, or the transcription path in `/media-use`).
- **Read the whole transcript**, not fragments. A transcript with gaps produces mistakes that sound very convincing.
- Accuracy note: if the transcript only has per-sentence timing, word timing derived from it is only accurate to about 1/6 s.
- The reference may be in a different language from your narration. Measure rhythm in seconds (beats per second, section lengths), not in word counts, so the numbers carry over between languages.

### 2. The mechanical part (use the script)

```bash
bash <skill-dir>/scripts/measure_reference.sh reference.mp4 measure/
```

One folder per reference (`measure/<name>/` for two); a run clears its folder. It produces:

- `measure/info.txt`: duration, resolution, fps, and audio channels.
- `measure/frames/`: one still per second.
- `measure/contact/`: contact sheets, 16 stills per sheet (4×4). `measure/contact/index.txt` lists each sheet's seconds.
- `measure/reference-board.jpg`: 8 stills, the Gate 3 benchmark board.
- `measure/cuts.txt`: estimated time of every hard cut.
- `measure/boil.txt`: estimated unique frames per second at a few points. About 5 means the lines are redrawn 5× per second.
- `measure/stillness.txt` and `measure/loudness.txt`: stillness % and loudness (needs Node).
- `measure/palette.txt`: the dominant colours of a frame every second (quantised, % of frame, OKLCH lightness L) and an overall top list (`scripts/palette.mjs`, needs Node; `node <skill-dir>/scripts/palette.mjs --compare <#hex> <#hex>` gives the lightness gap of two colours).
- `measure/summary.txt`: all of the above.

Note: "still" depends heavily on the sensitivity threshold. Use the **same** one for the reference and your own draft, then compare.

### 3. Reading the contact sheets

- With subagents, read the contact sheets in 4 parallel parts.
- For each shot, note: start–end time, what is visible (described in general terms, never copied), camera movement, and the beat word that triggers the change (from the transcript).
- **Colour and type.** With `palette.txt`, name what each dominant colour is (ground and walls, floor, hero, its dark parts, accents and the job each accent has, such as heat, current or cold), and read the type: ink colour, kicker and headline treatment, any tag or label style, the caption box and the highlight of the spoken word. Note how the hero separates from the ground: value (dark parts, shadow) or a coloured backdrop.
- **Limitation:** an assistant reading images cannot hear. Sound effects written from images are guesses; mark them `(guess)`.

### 4. Write `reference-measurements.md`

```markdown
# Reference measurements: <title> by <creator> (inspiration, not source material)

- Total duration: ...
- Structure: <n> sections; length of each: ...
- Shots: ... | hard cuts: ...
- Dominant camera move: push-in / pull-out / static
- Boil rate: ... redraws per second
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

The "quietly does" items (boil rate, captions fixed while the ground scrolls) are what watching misses; measure them.
