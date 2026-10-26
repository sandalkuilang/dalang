# Steps 3–4: script, voice, per-word timing

## Step 3 — Script → GATE 1

Write in the narration language from `BRIEF.md`:

- `script.md`: title, sections with target durations, visual notes per section (numbers as digits — what appears on screen), and sources.
- `narration.txt`: **only the spoken words**, plus markers:
  - `{text|name}` — a beat: words that trigger a change on screen. **Always name it** (letters, digits, underscore; English names so code reads the same everywhere). Unnamed beats get `b1, b2, …`, which shift when a beat is inserted.
  - `# Section` lines — not spoken; their time is recorded.
  - `[tag]` — a delivery hint, sparingly (ElevenLabs reads it; for VoiceStudio a tag at the start of a dialogue line becomes that line's style).
  - **Dialogue** (characters, no narrator): every spoken line is `name: text`, and a line `(1.5)` is 1.5 s of silence. The output then also has `window.LINES` — who speaks when — for cuts, close-ups, and mouths.

Rules:
- **Length** — starting pace, calibrated in Step 4: English 2.4–2.7 words/s; Indonesian/Malay 2.2–2.5; Spanish/Portuguese/Italian 2.5–2.9; French 2.4–2.8; German/Dutch 2.0–2.4; Japanese 6–8 characters/s; Mandarin 4–5 characters/s. Other languages: write the opening section, audition it in Step 4, measure, then write the rest. Count words; never guess.
- **Arc and beat map** — name the arc in `script.md`: causal chain, turn without conflict ("it turns out…"), one peak, conflict, or hook + open end; most explainers are the first two, never invent an antagonist. Beats follow Hook → Context → Pressure → **Crack** (the surprising fact) → Acceleration → **Impact** (the answer) → Aftermath, each *caused* by the one before ("A, so B", not "A, then B"). Name them as `{text|name}` beats (`hook`, `crack`, `impact`, …); Crack and Impact are never skipped (checked again at Gate 3).
- **Hook** — a question, surprise, or confession; landing in 1–2 s on 9:16, 5 s on 16:9.
- **Numbers spoken as words** in `narration.txt`, in the narration language.
- **One beat every 2–4 s**, each with a visual partner later. A beat is not a cut: at Calm energy several beats share one camera shot.
- **Facts must be right.** Verify against original sources; list them. Never invent numbers. Different measuring methods or a tiny gap → "about the same", never a "winner".
- **Write for the ear, not the page.** TTS reads a textbook sentence like a textbook. Use the spoken register of the narration language for this audience (how a good presenter talks to one person, not an essay): short clauses, everyday words over technical nouns, "you/we", a question now and then, contrast and rhythm (short – short – long). Punctuation is breath and emphasis: a comma where a speaker pauses, a full stop to land a point, `…` or a dash for a beat of suspense. Read each line aloud in your head; a line you would not say to a friend gets rewritten. Avoid long chains of spelled-out numbers: round them when the exact value doesn't matter ("in the late nineties", "almost ten times"), and keep at most one exact number per sentence.

Show the script and **wait for approval**.

## Step 4 — Voice + per-word timing → GATE 2

Details: `voice.md` "Use".

```bash
node <skill-dir>/scripts/tts_timestamps.mjs --list-voices
node <skill-dir>/scripts/tts_timestamps.mjs --input narration.txt --out audio --voice "<voice>" --language <lang> --sample [--instructions "<gender, age, pitch, style>"]
node <skill-dir>/scripts/tts_timestamps.mjs --input narration.txt --out audio --voice "<pick>" --language <lang> [--instructions "<same>"] [--speed 1.0]
```

The engine defaults to VoiceStudio (free); add `--engine elevenlabs` only when `BRIEF.md` says so (it bills).

- **One model, stated.** The script prints `Model : <name> — <licence>`. It speaks with VoiceStudio's active TTS model unless `--model <name>` is passed; when `BRIEF.md` names a model, pass it. A non-commercial model (OmniVoice, the ElevenLabs free tier) is said with the narration at Gate 2, whatever the user said about questions. Anything that forces a different model (a feature one model lacks) is printed in one line with the model and its licence, and recorded.

- **Ask before auditioning:** a voice named in the Brief or chosen in its Call 3 is sampled directly, no question; `design: <description>` → audition 2–3 designed voices from that description. Otherwise show the saved profiles from `--list-voices` (the user's own clones first) and ask which to try; audition designed voices only when none fits.
- Audition 2–3 voices that suit the narration language with `--sample` (each sample gets its own file name; the script prints the pace). More than 10 % off the target → adjust the script; less → `--speed`.
- **VoiceStudio with no saved profile** for this language: audition designed voices with `--voice default --instructions "…"`. The fixed `--seed` (default 42) keeps the approved timbre in the full take — pass the same instructions and seed. For a voice reused across videos, save it: `--save-profile "<name>" --ref audio/<approved sample>.wav --language <lang>` (`voice.md` "Clone"); it takes the audition as it is: over the engine's 20 s, it cuts at the last word end ≤ 15 s using the sample's `.words.json` and saves those words as the ref text (pass no `--ref-text`). Without that file it stops and asks for a 3–10 s clip.
- **"Use the voice from this clip"** (a recording, a voice note): only with the speaker's permission; `voice.md` "Clone".
- **Dialogue:** one voice per character with `--voices name=<voice>,name=<voice>`.
- **The user's own recording** (any audio or video file, narration or dialogue): `--from-audio <file> --language <lang> --own-recording` keeps it as the voice track and gets the timing by transcribing it (needs VoiceStudio's speech-to-text). No audition, no generation, no cost. `--own-recording` states that the file is a human recording the user may use (their voice, or a speaker who gave permission), never TTS output; it is what makes the narration commercial-OK for `check_assets.mjs`. A generated take cut and retimed with `--from-audio` goes without it and keeps the licence of the take it was cut from (an OmniVoice take stays CC-BY-NC); an origin the script cannot trace is a `WARN`.
- Outputs: the narration audio; `words.json` (`{ i, text, start, end, est?, score? }`); `narration.srt`; `beats.json` and `beats.js` (`window.BEATS.<name>.start`, `BEATS_LIST`, `SECTIONS`, `WORDS`, `NARRATION_DURATION`); `narration.response.json` (keep it for `--from-response`).
- Act on every warning (a low alignment score, words heard ≠ words written, estimated words — listed by the script, beats on an estimated word, unnamed beats) before the storyboard. Log characters billed (0 for VoiceStudio).

Play the narration to the user and **wait for approval**. Mispronounced word → respell it in `narration.txt` and regenerate.
