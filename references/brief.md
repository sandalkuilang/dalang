# Steps 0–2: setup, brief, reference

## Step 0 — Setup (once)

```bash
node <skill-dir>/scripts/preflight.mjs
```

One call, a few seconds (longer on a cold `npx` cache; ≤ ~80 s with `--start`): Node, ffmpeg, HyperFrames, this skill's own clone (behind `origin/main`?), VoiceStudio (backend, TTS model, speech-to-text model, watermark), ElevenLabs (tier and quota, never the key; paid, optional), the folder's workspace. `<skill-dir>` is this skill's folder. Fix only what it reports:

- **Voice MISSING** → `voice.md` "Setup" (VoiceStudio install, models, speech-to-text; Kokoro; ElevenLabs key rules). Installing anything is a Call 0 question (sizes and licences stated there).
- **VoiceStudio states** — act on the note preflight prints, never on a guess. Never write your own polling loop: rerun preflight.
  - **STOPPED** (macOS app installed, not running) → `node <skill-dir>/scripts/preflight.mjs --start` opens it and waits ≤ 60 s, inside a default tool timeout. If the note says **never launched**, the first launch downloads several GB: a Call 0 question (autonomous: that is an install offer — skip it).
  - **BUSY** (running but not answering: an inline download, another session's job, a backend restart) → wait a minute and rerun; never restart it, reinstall or switch engines. Still BUSY after ~3 reruns a few minutes apart → tell the user, carry on with Steps 1–3 and recheck before Step 4.
  - **DOWN** (Linux/Windows, or another local port) → Call 0 asks what to do (install with consent, or the fallback below); never wait for the answer to a start-it-yourself request. **UNREACHABLE** (a remote `--vs-url`) → "nothing listens" or "not answering": Call 0 asks the fallback below, carry on with Steps 1–3 and recheck before Step 4; never have a backend restarted that may be running a job. **CONFLICT** → something else holds the port: say so in plain text and use the fallback.
  - A **WARN "refused the read"** (a remote backend behind an API key or loopback-only): dalang sends no key — tell the user (`voice.md` "Setup").
  - A **WARN "could not read / list"** → rerun; it never means missing.
  - A remote backend: pass the same `--vs-url` to every preflight rerun and to `tts_timestamps.mjs`.
  - `--start` checks VoiceStudio only; the rest of the first run still stands.
- **HyperFrames MISSING or out of date** → asked in Brief Call 0. New skills load after Claude restarts.
- **DALANG skill WARN (behind `origin/main`, or `pinned at vX (detached), newest release is vY`)** → asked in Brief Call 0 (autonomous: pull it yourself only when the note says `N commits behind` and has no "uncommitted" or "diverged": `git -C <skill-dir> pull --ff-only`, log it in `PRODUCTION.md`; a **pinned** clone is the user's choice, so log the WARN and continue, never pull or check out on your own). A pinned clone is detached (`pull --ff-only` fails): run the note's own command (fetch tags, check out the newest release), never a pull from `main`. After an update, re-read `SKILL.md` (the loaded copy is stale) and this section, then rerun preflight. Dirty or diverged: report it; never stash, reset or pull. **"could not check"** (offline, timeout, `git` missing or refusing the folder, any failed git read) → rerun; it never means up to date, behind or "not a clone", and never a reason to clone again; `INFO … not a git clone` is only a folder without a `.git`. `--check-skill` rechecks this row alone.
- **Licences to mention once:** VoiceStudio's default OmniVoice weights are non-commercial (CC-BY-NC); so is the ElevenLabs free tier. For a monetised video, the user needs a commercial-OK voice (`voice.md` "Licence"). Preflight's `Voice:` line carries this caveat (with `--json`, the TTS model note); read the whole output, never grep it. Tell it in the plain text before the first Brief call. It is about the model that will speak (preflight's TTS model note, or the model the Brief picks): when that voice is non-commercial, say so in Call 0 and again at Gate 2, **even when the user said not to ask or to run unattended** — a statement, never a question, so it does not break that instruction.

Every setup choice the user must make (DALANG update, skills update, Workspace INFO: "Lean workspace" below, every install or first launch that needs consent, the voice fallback) is a question in Brief Call 0, never only a line in `PRODUCTION.md` and never asked later (autonomous: nobody to ask — log it, per SKILL.md).

Create `video/<topic-slug>/` and log a one-line preflight summary with `state.mjs log` (it creates `PRODUCTION.md`): statuses, not the voice list.

### Lean workspace (workspace.mjs)

Each model call re-reads every enabled plugin's skills and hooks and every MCP server's tools: on the heavy setups where this was measured ~85k tokens before the film adds any, ~a fifth of one long run. What a lean folder saves is not yet measured: `workspace.mjs measure <before> <after>` compares the first call of two sessions (a transcript or a one-turn `claude -p --output-format json` result). `node <skill-dir>/scripts/workspace.mjs init <videos-folder>` lists what is on (with a guessed job) and proposes the video set: DALANG, `/hyperframes`, `/media-use`, a browser; the rest off. It writes nothing without `--yes`. With `--yes` it writes only `<videos-folder>/.claude/settings.json` (`enabledPlugins` false, `deniedMcpServers`) and DALANG's three subagent types in `<videos-folder>/.claude/agents/dalang-*.md` (a subagent with only its job's tools starts each turn at ~15K tokens instead of ~50K; `undo` removes them), keeps every other key, and backs up the old file as `.claude/settings.json.bak` (with a `.bak.dalang` hash file; a `.bak` it did not write is refused, never adopted or restored). In a git repository it also reads `.claude/settings.local.json` at the repository root, which can turn items back on: `status` shows them, `init` prints `still on`. User-level settings are never touched. Ask first and show the list (`--keep a,b` keeps more). It takes effect in the next session started in that folder: one restart with the skills update, resumed with `state.mjs next`. `status` shows the state, `undo` restores the old file. Autonomous: log the INFO, never write. (`<videos-folder>` = the folder the session starts in, the one holding `video/`.)

## Step 1 — Brief (always via AskUserQuestion)

**Topic first.** If the user named none, ask in plain text. Never guess a topic.

**The user may bring material** (script, voice recording, photos, reference video). Use what they bring and skip the questions it answers: a script replaces Step 3's writing (still make `narration.txt`, show it at Gate 1); a recording replaces the voice question and Step 4's generation (`--from-audio`). Permission is asked in Call 4; then pass `--own-recording` (a human recording the user may use, never TTS output). A video from someone else's channel is only a reference to measure (Step 2), never material to reuse. When the subject is a machine they may own (car, bicycle, appliance, tool), Call 4 asks for 3–5 phone photos of it (the part the video is about, close and wide): the film must show their real machine, part for part.

**A voice named in the request** ("narrated by <name>") → match it against preflight's `Voices` line and save it as `voice` in `BRIEF.md`. While VoiceStudio is not OK (no such line), save the name as given and match it once preflight reads OK, before Step 4; the Brief goes on. A match needs no "which voice?" question in Step 4, which still samples it for pace; the Call 0 engine question stays. Never search earlier videos' files for it. No match, or the line WARNs → rerun preflight; still none → say so and offer the saved profiles, a designed voice, or a clone only with the speaker's permission (`voice.md` "Clone").

**A series** — kits in `series.mjs list`: ask "Which series?" first (`brief.md` "Series kit"). **Sign-off**: 2–3 words after the hook, from the kit, request or material, else none; never asked or invented. Saved as `signoff`; Step 3 says it once.

**Ask everything now, once.** Every question of the whole run is asked here, back to back, before any other work, so the user answers once and can leave: after the last Brief call the agent never asks again (nothing in later steps waits for the user). Something that comes up later takes the stated default and is logged in `PRODUCTION.md` as "would have asked: <question> → <default used>". **Every AskUserQuestion is written in English** (question, header, option labels, descriptions, previews), whatever language the user chats in; options that name a language say it in English ("Indonesian (Recommended)"). Plain-text context before a call stays in the user's language.

Then AskUserQuestion: Call 0 only when setup left a choice, then Calls 1 and 2 (4 questions each at most), Call 3 when it applies, and Call 4 for the extras that apply. Ask about the platform **even if the user named one** ("YouTube" can be Shorts or landscape); put what they said first, marked "(Recommended)". Nothing named, or "no preference" → recommend / use the Autonomous-mode default for that question. Context for the user goes in plain text before the call (no intro field): no reference video unless they have one (then Step 2); the voice is asked in Call 3 when there is more than one sensible choice, else picked by audition in Step 4 (unless named, above); the engine, when only one is ready.

### Call 0 (only when preflight left a choice; skip it otherwise)
- **HyperFrames skills** (MISSING or out of date) — "Update now (Recommended)": `npx hyperframes skills update`, loaded at the next Claude restart: right after the Brief, before Step 5 (style frames load `/hyperframes`); resume with `state.mjs`; "Not now" (MISSING: no build until it is fixed).
- **DALANG update** (DALANG skill WARN, behind, or pinned to an older release) — "Update now (Recommended)": the command in the note (`git -C <skill-dir> pull --ff-only` for a clone on `main`, clean and fast-forwardable only; for a pinned clone the fetch-tags and check-out-the-newest-release command, never a pull), then re-read `SKILL.md` and go on; "Not now": say what a run may miss. Ask it first: the pulled text may answer the other setup choices.
- **Kokoro** (en/en-gb; monetised, or non-commercial VoiceStudio model): offer next to VoxCPM2. MISSING → install only with the whole install size, licence, consent.
- **Lean workspace** (INFO) — "Make it lean (Recommended)": `init … --yes` (Step 0 "Lean workspace"); "Not now".
- **Voice fallback** (only when VoiceStudio is not OK: STOPPED never launched, DOWN, UNREACHABLE, BUSY) — "Launch / install it (Recommended)" with size and licence; "Use Kokoro instead (English only, free)"; "Stop and tell me". If it is still not ready at Step 4, use the answer; never wait.
- **Voice engine** (only when preflight shows ElevenLabs as `PAID`: a valid key) — "VoiceStudio — free, runs locally (Recommended)"; "ElevenLabs — paid cloud" (never recommended; free tier is non-commercial and small).

### Call 1
0. **Mode** (always first) — the workflow only: "Express — ready in ~20 minutes (Recommended)": no stop after the Brief, parallel builders, one `--quality looks` render (`express.md`); "Studio — reference boards, style-frame check, benchmark and review (slower; also no stop after the Brief)". Save `mode: express` or `mode: studio`.
0b. **Look** (always second, either mode; a series kit answers it) — "Isometric 2.5D (Recommended)": `isometric-world` as the main language, flat drawing that reads as 3D through layers and colour, with `cutaway` and `blueprint` on the beats that need them (`engine/iso`); "3D object studio": `object-studio`, the real object as clean 3D on a light grey studio sweep, x-ray, editorial cards, karaoke captions (`engine/three`, `looks.md` "object-studio"). A link or file given under "Other" is a reference for Step 2, never a third look. Save `look: isometric-world` or `look: object-studio`. Mode and look are locked after the Brief: a 3D look never moves the film to Studio; only the user changes either.
**Express** asks only Mode, Look, Platform, Language and Duration (item 4's options) in this call, skips Call 2's energy and audience (Modern balanced, general public) and Call 3 unless the voice is unclear, still asks Call 4's extras that apply, then goes straight to Step 3.
1. **Platform** — YouTube Shorts (9:16, 1080×1920, ≤ 3 min, hook in 1–2 s) · Instagram Reels (9:16, ≤ 3 min, taller bottom overlay) · YouTube landscape (16:9, 1920×1080) · Instagram feed (4:5, 1080×1350, ≤ 60 s, often muted). TikTok and 1:1 via "Other".
2. **Language** — the user's language "(Recommended)", English, and one other likely language for this topic or audience; the rest via "Other". Store the ISO 639-1 code.
3. **Angle** — **built from the topic**, 3 options, e.g. "Question answered with data", "Myth vs fact", "Story with a character", "Dialogue scene between characters (no narrator)", "Step by step", "A vs B", "Recommendation per type of person". Angles with people acting or speaking on screen show them as stylized figures or faceless (`visual-direction.md` §1 "People").
   Studio only, for a 3D set: record from the topic (ask only when it is unclear): **`condition`** for any made thing in it (a room, a machine, a street, a battery) — `lived-in` by default, `new`, or `worn` (peeling paint, scuffs, grime, corrosion: only when the topic is about age, neglect, hardship or history); and, only when the set has rooms or furniture, **`interior`** — `american-japandi` by default (honey bamboo and light oak, warm white walls, a white or navy panel door, oatmeal linen, a ceramic or two, American home motifs: Shaker panels, buffalo check, ticking stripe, a braided rug), another when the topic names a place or style.

### Call 2 (its options follow the platform)
**fps follows the platform** (plain text before the call, no question; save it in `BRIEF.md`):

| Platform | fps |
|---|---|
| Shorts, Reels, TikTok, Instagram feed, anything else | 30 fps |
| YouTube landscape | 30 fps; 24 only as item 6's film-look option (blur: `camera-motion.md` §10) |

Platforms play at 30 (Reels caps there): 24 judders on pans; 60 doubles the render, re-encoded to 30.

4. **Duration** — 9:16 → 30–45 s, 60 s, 90–120 s, 2.5–3 min; 16:9 → 60–90 s, 2–3 min, 5 min; 4:5 → 15–30 s, 45–60 s. Narrative pacing is strongest at 30–90 s; above 3 min, one composition per section.
5. **Visual style** — answered by item 0b. The isometric look picks its beats from the script: `isometric-world` throughout, `cutaway` on the beats that open a thing up, `blueprint` only on beats that need engineering-grade detail. `object-studio` is one look for the whole film. A request for a look outside the two (photoreal, footage, a generated image, a channel's own style): say so in one line and take only its palette, type and overlay system into the chosen look. The camera is no question: the agent plans it (`camera-motion.md`). A reference the user liked steers the palette within the language's slots: use its `## Palette` in `reference-measurements.md` when Step 2 measured one. A series kit's older look line (a letter) is read as `isometric-world`.
6. **Energy** — "Modern balanced", "Calm cinematic", "Punchy social" (`visual-direction.md` §3); "(Recommended)" goes on Punchy for 9:16 under 60 s, else on Modern balanced. YouTube landscape adds "Calm cinematic, film look (24 fps)" (energy Calm cinematic); only it saves fps 24.
7. **Audience** — General public, one main idea "(Recommended)"; Students; Professionals/enthusiasts.

### Call 3 — Voice

After Call 2: its recommendation follows the Audience answer. Never fill `voice` from a saved profile on your own (the user would meet it first in the Gate 1 summary). Ask it when preflight's `Voices` line lists two or more saved profiles, or one whose use the audience rules out (a clone of the user for a public or brand channel). Skip it when a voice was named in the request, the user brings a recording, or there is one profile and no audience reason (Step 4 then picks by audition, no question). A `Voices` line that WARNs is not "no profiles": rerun preflight first. Options (4 at most): each saved profile by name, a clone of the user marked "(your voice)" (when the user said so, or the name is theirs); "Designed narrator — describe gender, age, style"; further profiles via "Other". "(Recommended)" follows the audience: a public or brand channel → the designed narrator, or a saved profile licensed for that use; a personal channel where the user is the face → their own voice, if saved. Name the voice's licence when it is non-commercial (`voice.md` "Licence"). Save `voice` as the profile id, or `design: <description>` (Step 4 auditions 2–3 designed voices from it). Autonomous mode: the recommended option, logged.

### Call 4 — Extras (the last call; only the questions that apply)

Everything a later step used to ask, asked now with a default so nothing waits later:

- **Second-language cut** (always, unless a kit answers it) — "None (Recommended)", the most likely second language for this topic (English when the narration is not English), another via "Other". Save `second_language: <ISO code>` or nothing; it is never offered at the hand-off.
- **Photos of their own machine** (only when the subject is one the user may own) — "No, use real references from the web (Recommended)"; "Yes, I'll attach them now": wait for them here, in the Brief, then go on.
- **Permission for a recording or a cloned voice** (only when the user brings one) — "Yes, the speaker gave permission"; "No" (then the recording is not used; Step 4 generates the voice).
- **Series** (only the kit's own questions, `Series kit` below).

Autonomous mode: the defaults, logged.

### Save the brief

Save everything in `BRIEF.md`: mode, topic, platform, ratio & resolution, fps (from the platform, table in Call 2), duration, narration language (ISO code), angle, look, energy, audience, voice engine, voice model (VoiceStudio: the active one unless the user picks another), voice (a named profile id, `design: <description>`, or `audition`), signoff (only when the user gave one, the words as given). Every later step reads format and language from it, not from memory; a mid-way change updates `BRIEF.md` first.

Step 2 (optional, measuring a reference's craft): `measure-reference.md`.

### Series kit (save once, start each video of a channel from it)

Opt-in, for videos of one channel the user calls a series. Never inferred from an earlier project: without a kit a new video carries nothing over (SKILL.md "General purpose"). A kit is a folder `~/.config/dalang/series/<name>/` with `SERIES.md` (the channel's Brief lines, its files, its Channel rules) and `files/`.

- **Which series?** Step 1, the first AskUserQuestion (before Call 1), only when `node <skill-dir>/scripts/series.mjs list` shows kits: one option per kit (platform · look · voice in its description) and "None — a new look". A `list` WARN means rerun; it never means "no kits". A kit: from the project folder run `node <skill-dir>/scripts/series.mjs apply <name>`. Its files land, and `BRIEF.md` gets `series` and the kit's Brief lines. Skip every question those lines answer (platform, language, look, energy, audience, voice, fps, signoff); still ask the topic, angle, duration and whatever is missing. Follow the printed Channel rules like the brief. "None": the usual Brief.
- **Save** only when the user asks to keep a video's look for a series (at hand-off, or later): `node <skill-dir>/scripts/series.mjs save <name> --from <project> --file <rel> ...` with the reusable files only: the overlay / HUD module, caption config, tag vocabulary, palette tokens. Never scene code (the set, the film, `src/index.tpl.html`): save and apply refuse a module that builds a scene or imports the engine's 3D or physics, per-video files and env files. A name that exists needs `--force` (it keeps the Channel rules). Show the user `SERIES.md` and fill its Channel rules with them: music licence policy, caption / label / card style, what the channel never does.
- **Channel-level feedback during a run** ("30 fps from now on", "no credit lines in captions"): `series.mjs note <name> "<rule>"`, and tell the user the line. A changed Brief value is edited in `SERIES.md` and `BRIEF.md` both. Never into the user's private memory. A lesson that holds for every video goes to the skill, not the kit.
- Quality is unchanged: scene code, script, storyboard and QC are still per video. The kit fixes the look, not the film.
