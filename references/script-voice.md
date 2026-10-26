# Steps 3–4: script, voice, per-word timing

## Step 3 — Script → GATE 1

Write in the narration language from `BRIEF.md`:

- `script.md`: title, sections with target durations, visual notes per section (numbers as digits — what appears on screen), and **sources**: every number carries a provenance tag (rule below).
- `narration.txt`: **only the spoken words**, plus markers:
  - `{text|name}` — a beat: words that trigger a change on screen. **Always name it** (letters, digits, underscore; English names so code reads the same everywhere). Unnamed beats get `b1, b2, …`, which shift when a beat is inserted.
  - `# Section` lines — not spoken; their time is recorded.
  - `[tag]` — a delivery hint, sparingly (ElevenLabs reads it; for VoiceStudio a tag at the start of a dialogue line becomes that line's style).
  - **Dialogue** (characters, no narrator): every spoken line is `name: text`, and a line `(1.5)` is 1.5 s of silence. The output then also has `window.LINES` — who speaks when — for cuts, close-ups, and mouths.

Rules:
- **Length** — starting pace, calibrated in Step 4: English 2.4–2.7 words/s; Indonesian/Malay 2.2–2.5; Spanish/Portuguese/Italian 2.5–2.9; French 2.4–2.8; German/Dutch 2.0–2.4; Japanese 6–8 characters/s; Mandarin 4–5 characters/s. Other languages: write the opening section, audition it in Step 4, measure, then write the rest. Count words; never guess.
- **Arc and beat map** — name the arc in `script.md`: causal chain, turn without conflict ("it turns out…"), one peak, conflict, **two beliefs, tested** (below), or hook + open end; most explainers are the first two, never invent an antagonist. Beats follow Hook → Context → Pressure → **Crack** (the surprising fact) → Acceleration → **Impact** (the answer) → Aftermath, each *caused* by the one before ("A, so B", not "A, then B"). Name them as `{text|name}` beats (`hook`, `crack`, `impact`, …); Crack and Impact are never skipped (checked again at Gate 3).
- **Hook** — a question, surprise, or confession; landing in 1–2 s on 9:16, 5 s on 16:9.
- **Numbers spoken as words** in `narration.txt`, in the narration language.
- **One beat every 2–4 s**, each with a visual partner later. A beat is not a cut: at Calm energy several beats share one camera shot.
- **Facts must be right.** Verify against original sources; list them. Never invent numbers. Different measuring methods or a tiny gap → "about the same", never a "winner".
- **Every number carries one provenance tag (`[src]`, `[calc]`, `[assume]`, `[illus]` or `[unknown]`) in `script.md`** (never in `narration.txt`: TTS would read it, and `[tag]` there already means a delivery hint). A number is any figure the film states or shows as a fact: a measure, count, percentage, price, date used as data, a result. Not numbers (never tagged, never on the untagged list): ordinals and structure words ("first", "two beliefs"), a number inside a quoted name, the section target durations and timecodes in headings ("Hook (0–3 s)"), a source's year, page or table number inside its own `[src: …]` or `[calc: …]` tag, and production specs in visual notes (frame sizes, font sizes, positions: they direct the picture and are not stated as facts). The tag follows the number in the section text, and decides its on-screen form:
  - `[src: <source>]` — taken from a source you checked: publisher or standard, title, year, and the page or table when there is one. Form: an **evidence card** with the number, a short quote (about 12 words or less), the source name, and "translation ours" when the quote is translated.
  - `[calc: name]` — a `model.mjs` result by its `numbers.json` name, spoken in its named beat ("Numbers model" below; inputs `[src]` or `[assume]`, never `[unknown]`). Form: a **calculation card**: the steps `node model.mjs` prints, one per line, and a kicker "our calculation" (in the narration language).
  - `[assume: <what, and why this value>]` — a number you choose as a stated assumption, only as an input of a `[calc]` ("a 10-minute shower"), never as a fact about the world. Form: a labelled line ("assumption", in the narration language) on the calculation card, so the viewer sees it is chosen and can swap it. A fact you could not source is `[unknown]`, never `[assume]`.
  - `[illus]` — the picture or figure is not to scale or not measured. Form: an **illustration tag** under the headline ("ILLUSTRATION · position and size approximate", in the narration language) for as long as the picture is up.
  - `[unknown]` — the number does not exist or could not be found. Form: the admission **spoken and shown** (a card: "not found yet: <what>"), a beat of its own in `narration.txt`.
- **Gate 1 lists the untagged.** Before showing the script, grep `script.md` for every digit and every number word and list each one without a tag under "Untagged numbers"; tag it, rewrite the line without it, or cut it. The list shown at the gate is empty. Show a table at Gate 1: number → tag → source, arithmetic or assumption, so the user approves provenance with the script. A `[src]` you could not open is `[unknown]`, never `[src]`. Then `numbers_lint.mjs` exits 0.
- **Uncertainty is a beat, never a flat claim and never an invented number.** Missing, contested or unmeasured: say what is not known, tag it `[unknown]`, then move to what *is* certain. Two sources that disagree: show both, or the range, each tagged. A claim that cannot be sourced and is not the point is dropped; one that is the point becomes an `[unknown]` beat.
- **Two beliefs, tested** — the arc for topics where two popular beliefs contradict each other ("A says do X", "B says never do Y"): hook = the contradiction; context = "let's calculate" and what each belief claims; pressure = each belief tested with a tagged number (`[src]` or `[calc]`); **crack** = the first number that surprises; then the honest `[unknown]` if there is one, and what is certain; **impact** = where the real cost is (somewhere neither belief looked); aftermath = a recap list, then the authoritative recommendation, and the last frame returns to the first. Examples: stretching before a run, charging a phone to 100 %, rinsing rice, leaving a laptop plugged in. Never invent an antagonist: the beliefs are the two sides, the numbers decide.
- **Write for the ear, not the page.** TTS reads a textbook sentence like a textbook. Use the spoken register of the narration language for this audience (how a good presenter talks to one person, not an essay): short clauses, everyday words over technical nouns, "you/we", a question now and then, contrast and rhythm (short – short – long). Punctuation is breath and emphasis: a comma where a speaker pauses, a full stop to land a point, `…` or a dash for a beat of suspense. Read each line aloud in your head; a line you would not say to a friend gets rewritten. Avoid long chains of spelled-out numbers: round them when the exact value doesn't matter ("in the late nineties", "almost ten times"), and keep at most one exact number per sentence.

Show the script with its numbers table and an empty **Untagged numbers** list, and **wait for approval**.

### Numbers model (model.mjs → numbers.json)

When the script has a `[calc]` number, write `model.mjs` in the project at Step 3: plain JavaScript, the one source of every number the film computes, so the narration, the cards and the world can never disagree.

- **Inputs, named**: each a `[src]` or `[assume]` value of `script.md` (`showersPerMonth`, `chainringTeeth`, `batteryWh`). A changed assumption at Gate 1 is one edit here, then `node model.mjs`, then the lint; never a hunt through the cards.
- **`numbers`**: every `[calc]` result by name, `{ value, say }`. `value` is unrounded (the narration and the cards round it), in the unit the film states; `say` is the narration's words for it, computed from `value` by a small `words()` in the narration language with the narration's rounding ("about forty dollars"), never typed, so it moves with the value. A counterfactual ("if it ran non-stop") is the same model with one input changed, never a second copy.
- **`state(t)`**, when the film shows a process over time: counters, on/off states and levels at model time `t`; the scene maps film time to model time (a sped-up month in 20 s) and reads it every frame, so a counter ticks and a status flips exactly when the model says.
- **A pure ES module**: no top-level `node:` imports, so the scene can `import { numbers, state } from '../model.mjs'`; run as main, `node model.mjs` prints the calculation card's lines and writes `numbers.json`.
- **Narration**: numbers stay words (the voice reads what is written, and digits are read differently per engine and language). A spoken model number is a beat named after it: `{about forty dollars|cost_month}`. A figure written in digits is compared after its rounding ("40" = one significant figure, "12.5" = one decimal).
- **Gate 1**: `node <skill-dir>/scripts/numbers_lint.mjs` in the project. Exit 1 names `file:line`, what is spoken and the model value: a beat that says another number, a `[calc: name]` missing from `numbers.json`, a `numbers.json` older than `model.mjs` (rerun the model). Exit 2: a file it could not read, or a beat in words whose number has no `say` (rerun, or add `say`); never read as missing. Hand arithmetic `[calc: a × b = c]` is listed, not checked: give it a name in the model.
- **Build (Step 6)**: cards, counters, gauges, the closing table and world states read `numbers` and `state(t)`; no number is typed into the composition. The calculation card shows the lines `node model.mjs` prints.

Examples: two water-heater tank sizes over a month of showers (cost per month, litres heated); a bike's two gear ratios on the same climb (cadence, minutes to the top); two phone chargers filling the same battery (minutes to 80 %).

```js
export const inputs = { showersPerMonth: 60, kwhPerShower: 1.6, pricePerKwh: 0.13 }; // [assume], [assume], [src]
const words = (n) => /* the narration language's number words, 0–999 */ String(n);
const cost = inputs.showersPerMonth * inputs.kwhPerShower * inputs.pricePerKwh;
export const numbers = { cost_month: { value: cost, say: `about ${words(Math.round(cost))} dollars` } };
export const state = (day) => ({ spent: cost * Math.min(day, 30) / 30, heating: day % 1 > 0.75 }); // heats 6 h each night
if (typeof process !== 'undefined' && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  console.log(`${inputs.showersPerMonth} × ${inputs.kwhPerShower} kWh × ${inputs.pricePerKwh} = ${numbers.cost_month.value}`);
  (await import('node:fs')).writeFileSync(new URL('./numbers.json', import.meta.url), JSON.stringify(numbers, null, 2));
}
```

## Step 4 — Voice + per-word timing → GATE 2

Details: `voice.md` "Use".

```bash
node <skill-dir>/scripts/tts_timestamps.mjs --list-voices
node <skill-dir>/scripts/tts_timestamps.mjs --input narration.txt --out audio --voice "<voice>" --language <lang> --sample [--instructions "<gender, age, pitch, style>"]
node <skill-dir>/scripts/tts_timestamps.mjs --input narration.txt --out audio --voice "<pick>" --language <lang> [--instructions "<same>"] [--speed 1.0] [--retake auto]
```

The engine defaults to VoiceStudio (free); add `--engine elevenlabs` only when `BRIEF.md` says so (it bills).

- **One model, stated.** The script prints `Model : <name> — <licence>`. It speaks with VoiceStudio's active TTS model unless `--model <name>` is passed; if `BRIEF.md` names a model, pass it. A non-commercial model (OmniVoice, the ElevenLabs free tier) is said with the narration at Gate 2, whatever the user said about questions. Anything that forces a different model (a feature one model lacks) is printed in one line with the model and its licence, and recorded.

- **Ask before auditioning:** a voice named in the Brief or chosen in its Call 3 is sampled directly, no question; `design: <description>` → audition 2–3 designed voices from that description. Otherwise show the saved profiles from `--list-voices` (own clones first), ask which to try; design voices only when none fits.
- Audition 2–3 voices that suit the narration language with `--sample` (own file names; it prints the pace). More than 10 % off the target → adjust the script; less → `--speed` or `--tempo` (`voice.md`).
- **VoiceStudio with no saved profile** for this language: audition designed voices with `--voice default --instructions "…"`. The fixed `--seed` (default 42) keeps the approved timbre: pass the same instructions and seed. For a voice reused across videos, save it: `--save-profile "<name>" --ref audio/<approved sample>.wav --language <lang>` (`voice.md` "Clone"); it takes the audition as it is: over the engine's 20 s, it cuts at the last word end ≤ 15 s using the sample's `.words.json` and saves those words as the ref text (pass no `--ref-text`). Without that file it stops and asks for a 3–10 s clip.
- **"Use the voice from this clip"** (a recording, a voice note): only with the speaker's permission; `voice.md` "Clone".
- **Dialogue:** one voice per character with `--voices name=<voice>,name=<voice>`.
- **The user's own recording** (any audio or video file, narration or dialogue): `--from-audio <file> --language <lang> --own-recording` keeps it as the voice track and gets the timing by transcribing it (needs VoiceStudio's speech-to-text). No audition, generation or cost. `--own-recording` states that the file is a human recording the user may use (their voice, or a speaker who gave permission), never TTS output; it is what makes the narration commercial-OK for `check_assets.mjs`. A generated take cut and retimed with `--from-audio` goes without it and keeps the licence of the take it was cut from (an OmniVoice take stays CC-BY-NC); an origin the script cannot trace is a `WARN`.
- Outputs: the narration audio; `words.json` (`{ i, text, start, end, est?, score? }`); `narration.srt`; `beats.json` and `beats.js` (`window.BEATS.<name>.start`, `BEATS_LIST`, `SECTIONS`, `WORDS`, `NARRATION_DURATION`); `narration.response.json` (keep it for `--from-response`).
- Act on every warning (low alignment score, words heard ≠ written, estimated words or beats on one, unnamed beats) before the storyboard. You cannot listen, so a flagged sentence is fixed with `--retake auto` (`--retake auto --from-response audio/narration.response.json` on a take you already made): it re-speaks only that sentence, splices it in and retimes the file, and none is left open. A sentence still flagged after its two tries is respelled in `narration.txt`, then `--retake changed`. A `503` that ends in `WARN … rerun` is VoiceStudio still finishing a job: wait and rerun, never restart it. Log characters billed (0 for VoiceStudio).

Play the narration and **wait for approval**. Mispronounced word → respell it in `narration.txt`, run `--retake changed` (only the edited sentences are re-spoken; `voice.md` "Use").
