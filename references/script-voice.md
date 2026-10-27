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
- **Arc and beat map** — name the arc in `script.md`: causal chain, turn without conflict ("it turns out…"), one peak, conflict, **two beliefs, tested**, **failure explainer**, **choice explainer** (all three templated in `script-voice.md` "Arc templates": read it when you pick one), or hook + open end; most explainers are the first two, never invent an antagonist. Beats follow Hook → Context → Pressure → **Crack** (the surprising fact) → Acceleration → **Impact** (the answer) → Aftermath, each *caused* by the one before ("A, so B", not "A, then B"). Name them as `{text|name}` beats (`hook`, `crack`, `impact`, …); Crack and Impact are never skipped (checked again at Gate 3).
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
- **Write for the ear, not the page.** TTS reads a textbook sentence like a textbook. Use the spoken register of the narration language for this audience (how a good presenter talks to one person, not an essay): short clauses, everyday words over technical nouns, "you/we", a question now and then, contrast and rhythm (short – short – long). Punctuation is breath and emphasis: a comma where a speaker pauses, a full stop to land a point, `…` or a dash for a beat of suspense. Read each line aloud in your head; a line you would not say to a friend gets rewritten.
- **Spoken numbers.** Round in speech, exact on screen (said "about forty", headline "$39.90"). One number per clause, each with its comparison ("not double"; Gate 1 checks it; hook answers and reframes only in arcs that have them). The viewer's case comes before the rule. A `[calc]` number is spoken in its model's `say`.

- **Quiz.** Write `review/quiz.md` (5 rows, `review.md` §Sound-off quiz), each answerable from a headline or card; show it with the script.

Show the script with its numbers table and an empty **Untagged numbers** list, and **wait for approval**.

### Numbers model (model.mjs → numbers.json)

When the script has a `[calc]` number, write `model.mjs` in the project at Step 3: plain JavaScript, the one source of every number the film computes, so the narration, the cards and the world can never disagree.

- **Inputs, named**: each a `[src]` or `[assume]` value of `script.md` (`showersPerMonth`, `chainringTeeth`, `batteryWh`). A changed assumption at Gate 1 is one edit here, then `node model.mjs`, then the lint; never a hunt through the cards. Gate 1's approval covers `model.mjs` and `numbers.json` as well as the script: an edit or a rerun that changes them makes it stale, so the user approves the numbers the cards will show.
- **`numbers`**: every `[calc]` result by name, `{ value, say }`. `value` is unrounded (the narration and the cards round it), in the unit the film states; `say` is the narration's words for it, computed from `value` by a small `words()` in the narration language with the narration's rounding ("about forty dollars"), never typed, so it moves with the value. A counterfactual ("if it ran non-stop") is the same model with one input changed, never a second copy.
- **`state(t)`**, when the film shows a process over time: counters, on/off states and levels at model time `t`; the scene maps film time to model time (a sped-up month in 20 s) and reads it every frame, so a counter ticks and a status flips exactly when the model says.
- **A pure ES module**: no top-level `node:` imports, so the scene can `import { numbers, state } from '../model.mjs'`; run as main, `node model.mjs` prints the calculation card's lines and writes `numbers.json`.
- **Narration**: numbers stay words (the voice reads what is written, and digits are read differently per engine and language). A spoken model number is a beat named after it: `{about forty dollars|cost_month}`; each further mention (a recap, the closing table) is a beat named `<name>__<suffix>`: `{about forty dollars|cost_month__recap}`. Never one name twice (the voice step renames the later beat), and a model number spoken in a beat of any other name, or in no beat, is not checked. A beat named after a model number passes when it holds a mention of that number in one of these forms, and anything else in the beat is not read: the `say` (whole words; case, punctuation and hyphens ignored, so "twenty-one" = "twenty one"), or a figure that equals the value after its rounding ("40" = one significant figure, "12.5" = one decimal) standing alone in the beat (`{$40|cost}`) or in the place of the say's number, the say's own words right beside it (`about 40`, `40 dollars` for "about forty dollars"). With no `say`, any figure that rounds to the value. A figure among words that are not the `say` (`{twelve dollars, 40|cost}`, `{40 minutes|cost}`) is not a mention: close the beat around the number, or speak the `say`.
- **Gate 1**: `node <skill-dir>/scripts/numbers_lint.mjs` in the project. Exit 1 names `file:line`, what is spoken and the model value: a beat named after a model number with no mention of it in those forms, a beat name used twice, a `[calc: name]` missing from `numbers.json`, a `numbers.json` older than `model.mjs` (rerun the model). Exit 2: a file it could not read, a beat in words whose number has no `say` (rerun, or add `say`); never read as missing. A beat of another name, or of none, claims no model number and is never flagged. Hand arithmetic `[calc: a × b = c]` is listed, not checked: give it a name in the model.
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

### Arc templates

Read when the arc is one of these. Each beat is a named `{text|name}` beat and maps onto Hook → Context → Pressure → Crack → Acceleration → Impact → Aftermath above; the numbers follow the provenance rules above.

- **Two beliefs, tested** — the arc for topics where two popular beliefs contradict each other ("A says do X", "B says never do Y"): hook = the contradiction; context = "let's calculate" and what each belief claims; pressure = each belief tested with a tagged number (`[src]` or `[calc]`); **crack** = the first number that surprises; then the honest `[unknown]` if there is one, and what is certain; **impact** = where the real cost is (somewhere neither belief looked); aftermath = a recap list, then the authoritative recommendation, and the last frame returns to the first. Examples: stretching before a run, charging a phone to 100 %, rinsing rice, leaving a laptop plugged in. Never invent an antagonist: the beliefs are the two sides, the numbers decide.
- **Failure explainer** — the arc for "why does X break, wear out or fail": a small part or a quiet cause stops a thing that matters. Seven beats, in order:
  1. `coldopen` (about 5 s on a 60 s film) = Hook: a relatable moment of failure, then the verdict a person would actually say, quoted in the caption without showing the person ("the mechanic shakes her head: 'the battery has to be replaced'"). The hook question follows ("how can something this small stop the whole thing?"), then the series sign-off if the Brief has one (`signoff` in `BRIEF.md`, said as written).
  2. `path` (about a quarter of the film) = Context: follow one thing through the system, one stage per sentence (energy, water, data, food, load, light). The camera travels the same path, and each stage's value is its headline.
  3. `thesis` = Pressure: the pivot, "everything passes through here, and it has N enemies" (N is what the topic has, usually 3; never padded to fit).
  4. `enemy_1` … `enemy_N` = Pressure, then Crack and Acceleration: every enemy is built the same way, so the viewer can predict it: **name → mechanism → one tagged number → the visible cause in the world**, plus one onomatopoeia on the failure. The number is `[src]` or `[calc]`; if none exists, the enemy gets an `[unknown]` beat, never an invented figure. The enemy with the most surprising number is the Crack; the ones after it are the Acceleration. Enemies are mechanisms, never villains.
  5. `cost` = Impact: the cost asymmetry, what the weak part costs to replace against its life or warranty, set against the main part's, both numbers tagged.
  6. `checklist` = Aftermath: three imperatives the viewer can do before buying, installing or using.
  7. `bookend`: back to the opening scene, now working; the last frame rhymes with the first (`camera-motion.md` §12 Structure).
  Speech habits: say source *types* lightly ("a manufacturer's patent and one study recorded…"), full citations in the description. Mood by section: the story parts (`coldopen`, `bookend`) are graded as night, the explanation in bright neutral light (`camera-motion.md` §11.1 "Story vs explanation").
  Examples: why phone batteries swell, why a bike chain snaps, why a houseplant's leaves yellow, why a car battery dies in the cold.
  Gate 1 checks for this arc, shown in the numbers table as enemy → number → tag → visible cause: every enemy has its tagged number and its visible cause; every enemy follows the same template; N matches the `thesis` line; the verdict in the cold open is quoted speech, not a figure; the `bookend` names the opening setting and shows it working.
- **Choice explainer** — the arc for "which size, plan, model or option should I pick": a viewer faces a choice a shop or a listing puts in front of them, and the number everyone compares by is the wrong one. Eight beats, in order:
  1. `hook` (about 3 s) = Hook: a concrete everyday setting, the choice on offer, the popular belief, then an open loop ("Family of four. The shop offers 80 or 120 litres. Bigger is safer, right? Let's take it apart."), then the series sign-off if the Brief has one (`signoff` in `BRIEF.md`, said as written, never invented).
  2. `misread` = Context: the unit everyone compares by is, historically, a measure of something else. Name it, then name the real measure of what you get.
  3. `ladder` = Context: one example product and one conversion per sentence, each number the headline as it is spoken: what goes in → what it actually delivers (with its ratio) → the unit on the spec sheet. Every step `[src]` or `[calc]`.
  4. `rule` = Pressure: a rule of thumb applied to the viewer's own case first ("<measure of your case> × <rule> ≈ <need>, so the middle size is the right one"), then one adjustment per condition ("a cold garage: add 10 %"). The rule is `[src]`, the viewer's case an `[assume]` input of a `[calc]`.
  5. `toosmall`, `toobig` = Crack and Acceleration: both failure modes, each by its physical cause, never "it is inefficient". Too small: it never rests and never reaches the target. Too big: it reaches the target fast, switches off, and a named side effect follows (a precise mechanism). Each has its tagged number or an `[unknown]` beat, and its visible cause in the world.
  6. `payoff` = Impact: answers the hook's open loop with the model's number and its comparison ("not double: the real gap is the purchase price").
  7. `decide` = Aftermath: the decision rule as conditions: "condition X and Y → A is enough; condition Z → B is right".
  8. `reframe`: "what you are buying is not <the misread unit> but <the real quantity>"; the last frame returns to the first.
  Examples: which water-heater tank size for a family of four, which bike gear for a city commute, which phone-charger wattage for an overnight charge.
  Gate 1 checks for this arc, in the numbers table: the hook's loop is answered by `payoff`; `reframe` names the `misread` unit and the real quantity; every number in `ladder`, `rule` and `payoff` has its comparison and its tag; both failure modes name a physical cause; `decide` is conditions, not a verdict.

## Step 4 — Voice + per-word timing → GATE 2

Details: `voice.md` "Use".

```bash
node <skill-dir>/scripts/tts_timestamps.mjs --list-voices
node <skill-dir>/scripts/tts_timestamps.mjs --input narration.txt --out audio --voice "<voice>" --language <lang> --sample [--instructions "<gender, age, pitch, style>"]
node <skill-dir>/scripts/tts_timestamps.mjs --input narration.txt --out audio --voice "<pick>" --language <lang> [--instructions "<same>"] [--speed 1.0] [--retake auto]
node <skill-dir>/scripts/tts_timestamps.mjs --engine kokoro --input narration.txt --out audio --language en|en-gb [--voice <kokoro voice>] [--speed 1.0]
```

Default engine VoiceStudio (free); `--engine elevenlabs` (bills) or `kokoro` only as `BRIEF.md` says.

- **One model, stated.** The script prints `Model : <name> — <licence>`. It speaks with VoiceStudio's active TTS model unless `--model <name>` is passed; if `BRIEF.md` names a model, pass it. A non-commercial model (OmniVoice, the ElevenLabs free tier) is said with the narration at Gate 2, whatever the user said about questions. A feature that forces a different model is printed in one line with the model and its licence, and recorded.

- **Ask before auditioning:** a voice named in the Brief or chosen in its Call 3 is sampled directly, no question; `design: <description>` → audition 2–3 designed voices from it. Otherwise show the saved profiles from `--list-voices` (own clones first) and ask which to try; design only when none fits.
- Audition 2–3 voices that suit the narration language with `--sample` (own file names; it prints the pace). More than 10 % off the target → adjust the script; less → `--speed` or `--tempo` (`voice.md`).
- **VoiceStudio with no saved profile** for this language: audition designed voices with `--voice default --instructions "…"`. The fixed `--seed` (default 42) keeps the approved timbre: pass the same instructions and seed. For a voice reused across videos, save it: `--save-profile "<name>" --ref audio/<approved sample>.wav --language <lang>` (`voice.md` "Clone"); a sample over 20 s is cut at the last word end ≤ 15 s using its `.words.json` (pass no `--ref-text`); without that file it stops and asks for a 3–10 s clip.
- **"Use the voice from this clip"** (a recording, a voice note): only with the speaker's permission; `voice.md` "Clone".
- **Dialogue:** one voice per character with `--voices name=<voice>,name=<voice>`.
- **The user's own recording** (any audio or video file, narration or dialogue): `--from-audio <file> --language <lang> --own-recording` keeps it as the voice track and gets the timing by transcribing it (needs VoiceStudio's speech-to-text). No audition, generation or cost. `--own-recording` states the file is a human recording the user may use (their voice, or a speaker who gave permission), never TTS output; it makes the narration commercial-OK for `check_assets.mjs`. A generated take retimed with `--from-audio` goes without it and keeps its original licence (an OmniVoice take stays CC-BY-NC); an untraceable origin is a `WARN`.
- Outputs: the narration audio; `words.json` (`{ i, text, start, end, est?, score? }`); `narration.srt`; `beats.json` and `beats.js` (`window.BEATS.<name>.start`, `BEATS_LIST`, `SECTIONS`, `WORDS`, `NARRATION_DURATION`); `narration.response.json` (keep it for `--from-response`).
- Act on every warning (low alignment score, words heard ≠ written, estimated words or beats on one, unnamed beats) before the storyboard. You cannot listen, so a flagged sentence is fixed with `--retake auto` (add `--from-response audio/narration.response.json` on a take you already made): it re-speaks only that sentence, splices it in and retimes the file, and none is left open. A sentence still flagged after its two tries is respelled in `narration.txt`, then `--retake changed`. A `503` or a dropped request ending in `WARN … rerun`: VoiceStudio is still finishing a job; wait and rerun the same command, never restart it or switch engines. The rerun resumes from the chunks on disk (`audio/.tts-parts/`): never write your own chunked or resumable generation script. A new full take moves the previous one to `audio/takes/<n>/` first. Log characters billed (0 unless ElevenLabs).

Play the narration; **wait for approval**. Mispronounced word → respell it in `narration.txt`, run `--retake changed` (only the edited sentences are re-spoken; `voice.md` "Use").

### Second-language cut (offered once at the hand-off; Steps 3b and 4)

The same film in another narration language, re-timed from the same storyboard: every animation time is a named beat (`BEATS.<name>`, `{{name}}` through `fill_times.mjs`), so a narration with the same beat names in the same order re-times every scene with no scene code change. No new look, storyboard or style frames, no re-review of the look.

- **`BRIEF.md` field `second_language: <ISO code>`**, optional. Written when the user names one in Step 1 or accepts the hand-off offer. The hand-off offers it once: one question, the most likely second language first (English when the narration is not English); a "no" is final for this video. User away (autonomous mode): never offered, never made unless `BRIEF.md` already names it; then it is made after the first final and both are reported.
- **Step 3b, translate for the ear** into `narration.<lang>.txt`: the spoken register of that language for this audience (Step 3 "Write for the ear"), never a literal translation, at the starting pace of that language (Step 3 "Length"). Keep every `{…|name}` beat with the same name in the same order, wrapping the words that carry the same moment; keep the `# Section` lines; numbers as words in that language. A number whose unit or format changes (miles to km, another currency, a decimal comma) is re-tagged in `script.md` (a conversion is a `[calc]` in `model.mjs`); `numbers_lint.mjs` reads the first narration only, so a `[calc]` beat speaks the same rounded value in that language's words. Examples: a coffee-roasting explainer into Spanish, a bike-gear explainer into Japanese, a houseplant-care explainer into Indonesian.
- **Lint before any voice:** `node <skill-dir>/scripts/beats_lint.mjs narration.txt narration.<lang>.txt`. Exit 1 names `file:line` (a beat missing, renamed, extra, out of order, unnamed, a name used twice, an unbalanced brace): fix the second narration, never the first (it is approved at Gate 1). Exit 2: a file it could not read; rerun.
- **Step 4 again** into its own folder: `tts_timestamps.mjs --input narration.<lang>.txt --out audio/<lang> --language <lang> …` (audition 2–3 voices of that language with `--sample`, the same engine and model rules as Step 4; act on every warning; `--retake auto` for flagged sentences). The first take in `audio/` stays as it is (Gate 2 hashes `audio/beats.json`). Play it and wait for the user's OK, like Gate 2 (`state.mjs` does not record it; user away: every Step 4 warning resolved). Then build: `look-build.md` "Second-language cut".
- Log each step: `state.mjs log "3b | narration.<lang>.txt | …"`, `"4b | audio/<lang> | …"`.
