# Steps 3–4: script, voice, per-word timing

## Step 3 — Script → GATE 1

Write in the narration language from `BRIEF.md`:

- `script.md`: `Promise:` and `Takeaway:` lines first, then title, sections with target durations, visual notes per section (numbers as digits), and every number's provenance tag (below).
- `narration.txt`: **only the spoken words**, plus markers:
  - `{text|name}` — a beat: words that trigger a change on screen. **Always name it** (letters, digits, underscore, English). Unnamed beats get `b1, b2, …`, which shift when a beat is inserted.
  - `# Section` lines — not spoken; their time is recorded.
  - `[tag]` — a delivery hint, sparingly (ElevenLabs reads it; VoiceStudio uses one only at the start of a dialogue line, as its style).
  - **Dialogue** (no narrator): every line is `name: text`; a line `(1.5)` is 1.5 s of silence. The output adds `window.LINES` (who speaks when).

Rules:
- **Length** — starting pace, calibrated in Step 4: English 2.4–2.7 words/s; Indonesian/Malay 2.2–2.5; Spanish/Portuguese/Italian 2.5–2.9; French 2.4–2.8; German/Dutch 2.0–2.4; Japanese 6–8 characters/s; Mandarin 4–5 characters/s. Other languages: write the opening section, audition it in Step 4, measure, then write the rest. Count words; never guess.
- **Arc and beat map** — name the arc in `script.md`: causal chain, turn without conflict ("it turns out…"), one peak, conflict, **two beliefs, tested**, **failure explainer**, **choice explainer** (the last three: "Arc templates" below), or hook + open end. Never invent an antagonist. Beats follow Hook → Context → Pressure → **Crack** (the surprising fact) → Acceleration → **Impact** (the answer) → Aftermath, each caused by the one before ("A, so B", not "A, then B"), named as beats (`hook`, `crack`, `impact`, …). Crack and Impact are never skipped.
- **Hook** — a question, surprise or confession, landing in 1–2 s on 9:16, 5 s on 16:9. It says the promise in its first beat. Before the first Pressure beat, one sentence names the parts in order. `impact` says the takeaway; the last beat repeats it.
- **One beat every 2–4 s**, each with a visual partner later. A beat is not a cut: at Calm energy several beats share one shot.
- **Facts must be right.** Verify against original sources and list them. Different methods or a tiny gap → "about the same", never a "winner".
- **Every number carries one provenance tag in `script.md`**, never in `narration.txt` (TTS would read it). A number is any figure the film states or shows as a fact. Not numbers: ordinals and structure words ("first", "two beliefs"), a number inside a name, section durations and timecodes in headings, a source's year or page inside its own tag, production specs in visual notes. The tag follows the number and sets its on-screen form:
  - `[src: <publisher or standard, title, year, page or table>]` — checked in a source. **Evidence card**: the number, a quote of ≤ 12 words, the source name, "translation ours" when translated.
  - `[calc: name]` — a `model.mjs` result ("Numbers model" below; inputs `[src]` or `[assume]`, never `[unknown]`). **Calculation card**: the steps `node model.mjs` prints, kicker "our calculation".
  - `[assume: <what, and why this value>]` — a chosen value, only as a `[calc]` input, never a fact about the world. A labelled "assumption" line on the calculation card.
  - `[illus]` — the picture is not to scale or not measured. An **illustration tag** under the headline ("ILLUSTRATION · position and size approximate") while it is up.
  - `[unknown]` — not found or does not exist. The admission spoken and shown ("not found yet: <what>"), a beat of its own. A `[src]` you could not open is `[unknown]`.
  Card words are in the narration language.
- **Uncertainty is a beat**, never a flat claim or an invented number: say what is not known (`[unknown]`), then what is certain. Two sources disagree: show both or the range, each tagged. An unsourceable claim is dropped, or becomes an `[unknown]` beat when it is the point.
- **Write for the ear.** The spoken register of a good presenter talking to one person: everyday words, "you/we", a question now and then, rhythm short – short – long. One idea per sentence, ≤ 22 words. Tone comes only from punctuation: a full stop lands a point, a comma is a breath, `…` or a dash a beat of suspense; never `;` `:` `( )` `/` (write two sentences). A `{beat}` wraps a whole clause. A section's first sentence says what it answers. A pronoun never reaches back past one sentence. Numbers spoken as words. Read "Narration craft" below first.
- **Spoken numbers.** Round in speech, exact on screen (said "about forty", headline "$39.90"). One number per clause, each with its comparison ("not double"). The viewer's case before the rule. A `[calc]` number is spoken as its model's `say`.
- **Read-through.** A NEW subagent gets only `narration.txt` and returns the topic in one sentence, what the viewer learns, the order of the parts, each term it could not explain, each sentence it could not follow and why. Topic and learning must match Promise and Takeaway; else rewrite and read through once more.
- **Quiz.** Write `review/quiz.md` (5 rows, `review.md` §Sound-off quiz), each answerable from a headline or card.

Gate 1 shows: Promise and Takeaway, the read-through's answer, a table number → tag → source, arithmetic or assumption, and an empty **Untagged numbers** list (grep `script.md` for every digit and number word; tag, rewrite or cut each). Then `numbers_lint.mjs` exits 0 and `node <skill-dir>/scripts/narration_lint.mjs` is clean: `state.mjs approve 1 --by agent`.

### Narration craft: one idea, followed on one hearing

Read with Step 3, before the first line. The viewer hears it once and cannot rewind.

- **One film, one idea.** The `Takeaway:` is one sentence with no "and"; if it needs two, cut to the one the promise asks and offer the other as a second film. Up to 60 s: one mechanism in 2–3 causal steps; 60–90 s: up to 4 steps, or two parts. Cut every fact that does not lead to the takeaway.
- **Word budget with air.** Spoken words ≈ length × pace × 0.85; the other 15 % is silence after `crack`, after `impact`, before the last line (60 s at 2.4 words/s ≈ 120 words). Over budget: cut a fact, never speed the voice.
- **Shape**, as shares of the length:

  | Share | Part | Beats | Its job |
  |---|---|---|---|
  | 0–8 % | Hook | `hook` | the question, surprise or paradox; never a greeting |
  | 8–25 % | Context | Context, Pressure | why it matters, or what most people believe |
  | 25–75 % | Mechanism | Crack, Acceleration | the cause, step by step, each "so" the next |
  | 75–92 % | Payoff | `impact` | the hook answered |
  | last 8 % | Takeaway | Aftermath | one line short enough to repeat |
- **The picture shows what, the voice says why.** Never narrate what the frame shows; say its cause or consequence. Write the visual note first, then the line that adds to it.
- **One new term per minute**, explained in everyday words at once, then always called by that one word.
- **Concrete before abstract**: something the viewer has held, seen or felt first, the rule after.
- **Active verbs with a doer**: "the water pushes the blade".
- **A yardstick on the viewer's scale**: a hair's width, a bus, a day of rain.
- **A chain, not a list**: join with "so", "because", "but"; rewrite "also", "in addition", "another".
- **One breath per sentence**: 8–15 words in a short film.
- **The cut test**: a sentence whose loss costs the viewer nothing is cut.

### Numbers model (model.mjs → numbers.json)

A script with a `[calc]` number gets `model.mjs` in the project at Step 3: plain JavaScript, the one source of every computed number.

- **Inputs, named**: each a `[src]` or `[assume]` value of `script.md`. A changed assumption is one edit here, then `node model.mjs`, then the lint. Gate 1 covers `model.mjs` and `numbers.json`: a change to either makes it stale.
- **`numbers`**: every `[calc]` result by name, `{ value, say }`. `value` is unrounded, in the unit the film states; `say` is computed from `value` by a small `words()` in the narration language with the narration's rounding ("about forty dollars"), never typed. A counterfactual is the same model with one input changed.
- **`state(t)`**, for a process over time: counters, on/off states and levels at model time `t`; the scene maps film time to model time and reads it every frame.
- **A pure ES module**: no top-level `node:` imports, so the scene can `import { numbers, state } from '../model.mjs'`; run as main, it prints the calculation card's lines and writes `numbers.json`.
- **Narration**: numbers stay words. A spoken model number is a beat named after it: `{about forty dollars|cost_month}`; a further mention is `<name>__<suffix>` (`cost_month__recap`). Never one name twice. The beat passes when it holds the `say` (whole words; case, punctuation, hyphens ignored) or a figure equal to the value after rounding, alone in the beat (`{$40|cost}`) or in place of the say's number beside its words (`about 40`, `40 dollars`). No `say`: any figure that rounds to the value. A figure among other words (`{40 minutes|cost}`) is not a mention: close the beat around the number.
- **Gate 1**: `node <skill-dir>/scripts/numbers_lint.mjs` in the project. Exit 1 names `file:line`: a model beat without its number, a beat name used twice, a `[calc: name]` missing from `numbers.json`, `numbers.json` older than `model.mjs`. Exit 2: a file it could not read, or a worded number with no `say` (rerun or add `say`); never "missing". Hand arithmetic `[calc: a × b = c]` is listed, not checked: name it in the model.
- **Build (Step 6)**: cards, counters, gauges, tables and world states read `numbers` and `state(t)`; no number is typed into the composition.

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

### Arc templates

Each beat is a named `{text|name}` beat on the Hook → … → Aftermath map; numbers follow the provenance rules.

- **Two beliefs, tested** — two popular beliefs contradict each other. hook = the contradiction; context = "let's calculate" and what each belief claims; pressure = each belief tested with a `[src]` or `[calc]` number; **crack** = the first surprising number, then any honest `[unknown]` and what is certain; **impact** = where the real cost is (somewhere neither belief looked); aftermath = a recap list, the authoritative recommendation, the last frame returning to the first. The numbers decide, never an antagonist.
- **Failure explainer** — "why does X break, wear out or fail". Seven beats:
  1. `coldopen` (~5 s of 60 s) = Hook: a relatable failure, then the verdict a person would say, quoted in the caption without showing the person; the hook question; the `signoff` if `BRIEF.md` has one.
  2. `path` (~a quarter) = Context: follow one thing through the system, one stage per sentence; the camera travels the same path, each stage's value its headline.
  3. `thesis` = Pressure: "everything passes through here, and it has N enemies" (N as the topic has, never padded).
  4. `enemy_1` … `enemy_N`: each built the same way: **name → mechanism → one tagged number (or an `[unknown]` beat) → the visible cause in the world**, plus one onomatopoeia on the failure. The most surprising is the Crack; those after it the Acceleration. Enemies are mechanisms, never villains.
  5. `cost` = Impact: what the weak part costs against its life or warranty, set against the main part's, both tagged.
  6. `checklist` = Aftermath: three things the viewer can do before buying, installing or using.
  7. `bookend`: back to the opening scene, now working; the last frame rhymes with the first (`camera-motion.md` §10).
  Say source types lightly ("a manufacturer's patent and one study recorded…"); full citations go in the description. `coldopen` and `bookend` are graded as night, the explanation in bright neutral light (`camera-motion.md` §9.1).
  Gate 1 adds a table enemy → number → tag → visible cause, and checks: every enemy on the same template with its number and cause; N matches `thesis`; the cold-open verdict is quoted speech; `bookend` shows the opening setting working.
- **Choice explainer** — "which size, plan, model or option should I pick", where the number everyone compares by is the wrong one. Eight beats:
  1. `hook` (~3 s): an everyday setting, the choice on offer, the popular belief, an open loop; then the `signoff` if any.
  2. `misread` = Context: the unit everyone compares by measures something else; name it, then the real measure.
  3. `ladder` = Context: one example product, one conversion per sentence, each number the headline as spoken: what goes in → what it delivers (with its ratio) → the unit on the spec sheet; each `[src]` or `[calc]`.
  4. `rule` = Pressure: a rule of thumb (`[src]`) applied to the viewer's case (an `[assume]` input of a `[calc]`) first, then one adjustment per condition.
  5. `toosmall`, `toobig` = Crack and Acceleration: each failure mode by its physical cause, never "it is inefficient", with its tagged number or `[unknown]` beat and its visible cause.
  6. `payoff` = Impact: answers the open loop with the model's number and its comparison.
  7. `decide` = Aftermath: the rule as conditions ("X and Y → A is enough; Z → B").
  8. `reframe`: "what you are buying is not <misread unit> but <real quantity>"; the last frame returns to the first.
  Gate 1 checks: `payoff` answers the loop; `reframe` names both units; every number in `ladder`, `rule`, `payoff` has its comparison and tag; both failure modes name a physical cause; `decide` is conditions, not a verdict.

## Step 4 — Voice + per-word timing → GATE 2

```bash
node <skill-dir>/scripts/tts_timestamps.mjs --list-voices
node <skill-dir>/scripts/tts_timestamps.mjs --input narration.txt --out audio --voice "<voice>" --language <lang> --sample [--instructions "<gender, age, pitch, style>"]
node <skill-dir>/scripts/tts_timestamps.mjs --input narration.txt --out audio --voice "<pick>" --language <lang> [--instructions "<same>"] [--speed 1.0] [--retake auto]
node <skill-dir>/scripts/tts_timestamps.mjs --engine kokoro --input narration.txt --out audio --language en|en-gb [--voice <kokoro voice>] [--speed 1.0]
```

Engine VoiceStudio (free) unless `BRIEF.md` says `elevenlabs` (bills) or `kokoro`. Flags: `voice.md` "Use".

- **One model, stated.** The script prints `Model : <name> — <licence>`: VoiceStudio's active TTS model, or `--model <name>` when `BRIEF.md` names one. A non-commercial model (OmniVoice, the ElevenLabs free tier) is stated with the narration at Gate 2, whatever the user said about questions. A feature that forces another model is printed with its licence and logged.
- **Never ask while auditioning.** A voice named in the Brief or chosen in Call 3 is sampled directly; `design: <description>` → audition 2–3 designed voices from it. Otherwise sample the saved profiles (own clones only if the Brief says the user's voice); design only when none fits. You cannot hear: pick by pace and zero timing warnings, and report "timbre not judged by ear".
- Audition 2–3 voices of the narration language with `--sample` (own file names; it prints the pace). More than 10 % off the target → adjust the script; less → `--speed` or `--tempo`.
- Act on every warning before the storyboard: a flagged sentence gets `--retake auto` (plus `--from-response audio/narration.response.json` on an existing take); still flagged after its two tries → respell it in `narration.txt`, then `--retake changed`. A mispronounced word: the same respell and `--retake changed`. A `503` or drop ending in `WARN … rerun`: rerun later (it resumes), never restart VoiceStudio or switch engines. Log characters billed (0 unless ElevenLabs).

No warning left → `node <skill-dir>/scripts/pad_voice.mjs` (again after any retake), then `state.mjs approve 2 --by agent`.

### Voice sources and outputs (Step 4, look up when needed)

- **No saved profile** for the language: audition designed voices with `--voice default --instructions "…"`; the same instructions and `--seed` (default 42) keep the approved timbre. To reuse it across videos: `--save-profile "<name>" --ref audio/<approved sample>.wav --language <lang>` (`voice.md` "Clone").
- **"Use the voice from this clip"**: only with the speaker's permission; `voice.md` "Clone".
- **Dialogue:** one voice per character, `--voices name=<voice>,name=<voice>`.
- **The user's own recording**: `--from-audio <file> --language <lang> --own-recording` keeps it as the voice track and times it by transcription (needs VoiceStudio's speech-to-text); no audition, generation or cost. `--own-recording` declares a human recording the user may use, never TTS output, and makes the narration commercial-OK for `check_assets.mjs`. A generated take retimed with `--from-audio` goes without it and keeps its licence; an unknown origin is a `WARN`.
- Outputs: the narration audio; `words.json` (`{ i, text, start, end, est?, score? }`); `narration.srt`; `beats.json` and `beats.js` (`window.BEATS.<name>.start`, `BEATS_LIST`, `SECTIONS`, `WORDS`, `NARRATION_DURATION`); `narration.response.json` (keep it for `--from-response`).

### Second-language cut (asked once in the Brief; Steps 3b and 4)

The same film in another narration language, re-timed from the same storyboard: every animation time is a named beat, so a narration with the same beat names in the same order re-times every scene with no scene code change. No new look, storyboard, style frames or look review. Made only when `BRIEF.md` has `second_language: <ISO code>`, after the first final; both are reported.

- **Step 3b, translate for the ear** into `narration.<lang>.txt`: that language's spoken register (Step 3 "Write for the ear") at its starting pace, never literal. Keep every `{…|name}` beat, same name, same order, on the words that carry the same moment; keep the `# Section` lines; numbers as words. A number whose unit or format changes is re-tagged in `script.md` (a conversion is a `[calc]` in `model.mjs`); `numbers_lint.mjs` reads the first narration only.
- **Lint before any voice:** `node <skill-dir>/scripts/beats_lint.mjs narration.txt narration.<lang>.txt`. Exit 1 names `file:line`: fix the second narration, never the first. Exit 2: unreadable file; rerun.
- **Step 4 again** into its own folder: `tts_timestamps.mjs --input narration.<lang>.txt --out audio/<lang> --language <lang> …`, with Step 4's audition, model and warning rules. `audio/` stays as it is (Gate 2 hashes `audio/beats.json`); `state.mjs` does not record this take. Then build: `look-build.md` "Second-language cut".
- Log: `state.mjs log "3b | narration.<lang>.txt | …"`, `"4b | audio/<lang> | …"`.
