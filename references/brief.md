# Steps 0–2: setup, brief, reference

## Step 0 — Setup (once)

```bash
node <skill-dir>/scripts/preflight.mjs
```

Checks Node, ffmpeg, HyperFrames, this skill's clone, VoiceStudio, ElevenLabs (paid, optional) and the folder's workspace (seconds; ≤ ~80 s with `--start`). It prints only what needs action (WARN, MISSING, INFO, PAID, a VoiceStudio state), the DALANG row and one `OK: <n> items (…)` line (`--all`: every row). Read the whole output, never grep it. Fix only what it reports:

- **Voice MISSING** → `voice.md` "Setup". Every install is a Call 0 question, with size and licence.
- **VoiceStudio states** — act on preflight's note; never write your own polling loop, rerun preflight.
  - **STOPPED** → `node <skill-dir>/scripts/preflight.mjs --start` (waits ≤ 60 s). **Never launched**: the first launch downloads several GB, a Call 0 question (autonomous: an install offer, skip it).
  - **BUSY** → wait a minute and rerun; never restart, reinstall or switch engines. Still BUSY after ~3 reruns a few minutes apart → tell the user, do Steps 1–3, recheck before Step 4.
  - **DOWN** → Call 0 (install with consent, or the voice fallback). **UNREACHABLE** (remote `--vs-url`) → Call 0 fallback, Steps 1–3, recheck before Step 4; never have a remote backend restarted. **CONFLICT** (another program holds the port) → say so and use the fallback.
  - **WARN "refused the read"** → a remote backend wants a key; dalang sends none: tell the user. **WARN "could not read / list"** → rerun; it never means missing.
  - A remote backend: pass the same `--vs-url` to every preflight and `tts_timestamps.mjs` call.
- **HyperFrames MISSING or out of date** → Call 0.
- **The version, said first.** Your first line to the user names the DALANG row's version: "DALANG v4.5.0, the newest release" or "DALANG v4.4.0, newest release v4.5.0" (a `+n` is n commits after that release); a row with no `DALANG v…` names its commit.
- **DALANG skill WARN** (`N commits behind`, or `pinned at vX (detached), newest release is vY`) → Call 0. Autonomous: pull only when the note says `N commits behind` with no "uncommitted" or "diverged" (`git -C <skill-dir> pull --ff-only`, logged); a pinned clone is the user's choice: log the WARN, never pull or check out. A pinned clone moves with the note's own command, never a pull from `main`. After an update, re-read `SKILL.md` and this section, then rerun preflight. Dirty or diverged: report it; never stash, reset or pull. **"could not check"** → rerun; it never means up to date, behind or "not a clone" (only `INFO … not a git clone` means no `.git`). `--check-skill` rechecks this row alone.
- **Licence, stated once** before the first Brief call: when the model that will speak is non-commercial (preflight's `Voice:` line or TTS model note; OmniVoice is CC-BY-NC, so is the ElevenLabs free tier), say so in Call 0 and again at Gate 2, even when the user said not to ask: a statement, never a question.

Every setup choice (DALANG update, skills update, lean workspace, each install or first launch, the voice fallback) is a Call 0 question, never only a log line and never asked later. Autonomous: nobody to ask — log it.

Create `video/<topic-slug>/` and log a one-line preflight summary (statuses only) with `state.mjs log`, which creates `PRODUCTION.md`.

### Lean workspace (workspace.mjs)

Every model call re-reads every enabled plugin's skills and every MCP server's tools (~85k tokens on a heavy setup). `node <skill-dir>/scripts/workspace.mjs init <videos-folder>` lists what is on and proposes the video set (DALANG, `/hyperframes`, `/media-use`, a browser; the rest off) and an auto-compact window of 200K, so a long film session compacts itself instead of growing toward the model's whole window; `--keep a,b` keeps more. Only `--yes` writes: `<videos-folder>/.claude/settings.json` (other keys kept, old file backed up as `.claude/settings.json.bak`) and DALANG's three subagent types in `.claude/agents/`. User-level settings are never touched. `status` shows the state (including items `.claude/settings.local.json` turns back on), `undo` restores. `<videos-folder>` = the folder the session started in, holding `video/`.

The Call 0 question, in plain words (never "lean", "workspace", "plugins" or "MCP"): "Turn off the tools videos don't need, in this folder only?" (header "Speed up"). "Yes, turn them off (Recommended)": "Claude re-reads every installed add-on at every step; fewer add-ons, fewer tokens per step. Only this folder changes, and it can be undone. It loads in a new session: you will open one here and send your request again." "Not now": "Keep everything on; each step costs more tokens." Say the same in the user's language before the call.

A yes **ends this session before the Brief**: carry out the other Call 0 answers, run `init … --yes`, then ask the user, in their language, to open a new session here and send the same request. Autonomous: log the INFO, never write.

## Step 1 — Brief (always via AskUserQuestion)

**Topic first.** None named → ask in plain text. Never guess a topic.

**Material the user brings** skips the questions it answers: a script replaces Step 3's writing (still make `narration.txt`, show it at Gate 1); a recording replaces the voice question and Step 4's generation (`--from-audio`, plus `--own-recording` once Call 4 confirms permission). Another channel's video is only a reference to measure (Step 2). A machine the user may own (car, bicycle, appliance, tool) → Call 4 asks for 3–5 phone photos (the part, close and wide; one whole on a plain wall, for `trace.mjs`): the film shows their real machine.

**A voice named in the request** → match it against preflight's `Voices` line and save it as `voice`. VoiceStudio not OK yet: save the name as given, match it before Step 4. A match skips Step 4's voice question (it still samples for pace). Never search earlier videos for it. No match, or the line WARNs → rerun preflight; still none → offer the saved profiles, a designed voice, or a clone with the speaker's permission (`voice.md` "Clone").

**A series** — kits in `series.mjs list` → "Which series?" first ("Series kit" below). **Sign-off**: 2–3 words after the hook, from the kit, request or material, else none; never asked or invented. Saved as `signoff`, said once in Step 3.

**Ask everything now, once**, back to back, before any other work; after the last Brief call nothing waits for the user. A question that comes up later takes its default and is logged: "would have asked: <question> → <default used>".

Order: Call 0 only when setup left a choice, Calls 1 and 2 (≤ 4 questions each), Call 3 when it applies, Call 4 for the extras that apply. Ask the platform **even when the user named one** ("YouTube" can be Shorts or landscape), what they said first, marked "(Recommended)". Nothing named or "no preference" → the SKILL.md Autonomous-mode default. Context goes in plain text before the call.

### Call 0 (only when preflight left a choice; skip it otherwise)
- **DALANG update** (asked first: the pulled text may answer the rest) — "Update now (Recommended)": the note's command, then re-read `SKILL.md`; "Not now": say what a run may miss.
- **HyperFrames skills** — "Update now (Recommended)": `npx hyperframes skills update`, loaded at the next Claude restart, right after the Brief and before Step 5; resume with `state.mjs`. "Not now" (MISSING: no build until fixed).
- **Kokoro** (en/en-gb; monetised, or a non-commercial VoiceStudio model): offered next to VoxCPM2. MISSING → install only with the whole install size, licence, consent.
- **Blender** (Studio; Blender row MISSING) — "Install Blender (~1 GB download, GPL)" or "No, use a CC0 model for the hero" (`hero-asset.md`).
- **Lean workspace** (INFO) — the exact words and the stop after a yes: "Lean workspace" above.
- **Voice fallback** (VoiceStudio never launched, DOWN, UNREACHABLE, BUSY) — "Launch / install it (Recommended)" with size and licence; "Use Kokoro instead (English only, free)"; "Stop and tell me". Still not ready at Step 4: use the answer, never wait.
- **Voice engine** (ElevenLabs `PAID`: a valid key) — "VoiceStudio — free, runs locally (Recommended)"; "ElevenLabs — paid cloud".

### Call 1
0. **Mode** (first) — "Express — ready in ~20 minutes (Recommended)": no stop after the Brief, parallel builders, one `--quality looks` render (`express.md`); "Studio — the precision lane: a Blender hero, reference boards, style-frame check, benchmark and review (slower; also no stop after the Brief)". Save `mode: express` or `mode: studio`.
0b. **Look** (second; a series kit answers it) — "Isometric 2.5D (Recommended)": `isometric-world` as the main language, flat drawing that reads as 3D through layers and colour, with `cutaway` and `blueprint` on the beats that need them (`engine/iso`); "3D object studio": `object-studio`, the real object as clean 3D on a light grey studio sweep, x-ray, editorial cards, karaoke captions (`engine/three`, `looks.md` "object-studio"). Save `look: isometric-world` or `look: object-studio`. A link or file under "Other" is a Step 2 reference, never a third look. Mode and look are locked after the Brief; only the user changes either.
**Express** asks only Mode, Look, Platform, Language, Duration and Energy, skips Call 2's audience (general public) and Call 3 unless the voice is unclear, asks Call 4's extras that apply, then goes to Step 3.
1. **Platform** — YouTube Shorts (9:16, 1080×1920, ≤ 3 min, hook in 1–2 s) · Instagram Reels (9:16, ≤ 3 min, taller bottom overlay) · YouTube landscape (16:9, 1920×1080) · Instagram feed (4:5, 1080×1350, ≤ 60 s, often muted). TikTok and 1:1 via "Other".
2. **Language** — the user's language "(Recommended)", English, one other likely language; the rest via "Other". Store the ISO 639-1 code.
3. **Angle** — 3 options **built from the topic** (e.g. "Myth vs fact", "Step by step", "A vs B"). People acting or speaking are stylized or faceless figures (`visual-direction.md` §1 "People").
   Studio, 3D set, recorded from the topic (asked only when unclear): **`condition`** of made things — `lived-in` (default), `new`, or `worn` (only when the topic is about age, neglect, hardship or history); with rooms or furniture, **`interior`** — `american-japandi` (default, `looks.md` "Interior style") unless the topic names a place or style.

### Call 2 (its options follow the platform)
**fps** (not asked; saved): 30, or 24 only through item 6's film-look option (`camera-motion.md` §8).

4. **Duration** — 9:16 → 30–45 s, 60 s, 90–120 s, 2.5–3 min; 16:9 → 60–90 s, 2–3 min, 5 min; 4:5 → 15–30 s, 45–60 s. Above 3 min, one composition per section.
5. **Visual style** — answered by 0b. A look outside the two: say so in one line; only its palette, type and overlays carry over. The camera is never asked. A kit's older look letter reads as `isometric-world`.
6. **Energy** — "Modern balanced", "Calm cinematic", "Punchy social" (`visual-direction.md` §3); "(Recommended)" on Punchy for 9:16 under 60 s, else Modern balanced. 9:16 and 4:5 add "Hype edit — beat-cut: 0.4–1 s shots on the stressed words, speed ramps into a held pose, punch-ins, whip smears" (saved `energy: hype`). YouTube landscape adds "Calm cinematic, film look (24 fps)", the only option that saves fps 24.
7. **Audience** — General public, one main idea "(Recommended)"; Students; Professionals/enthusiasts.

### Call 3 — Voice

Ask when preflight's `Voices` line lists two or more profiles, or one the audience rules out (a clone of the user for a public or brand channel). Skip it when the request named a voice, the user brings a recording, or there is one profile and no audience reason (Step 4 picks by audition). A `Voices` WARN is not "no profiles": rerun preflight. Never fill `voice` from a saved profile on your own. Options (≤ 4): each saved profile, a clone of the user marked "(your voice)" when theirs, "Designed narrator — describe gender, age, style", more via "Other". "(Recommended)": a public or brand channel → the designed narrator or a profile licensed for it; a personal channel with the user as the face → their own voice, if saved. Name a non-commercial licence (`voice.md` "Setup — VoiceStudio", Licence). Save `voice` as the profile id, or `design: <description>`.

### Call 4 — Extras (the last call; only the questions that apply)

- **Second-language cut** (unless a kit answers it) — "None (Recommended)", the most likely second language (English when the narration is not), another via "Other". Save `second_language: <ISO code>` or nothing; never offered at the hand-off.
- **Pictures of the subject** (photos, a diagram, a sketch) — "No, use real references from the web (Recommended)"; "Yes, I'll attach them now": wait for them here. Pictures given (here or with the request): "Match the references exactly (silhouette traced, IoU-checked) (Recommended)" / "Inspired by (proportions only)"; save `fidelity: exact|inspired` (autonomous: exact).
- **Permission for a recording or cloned voice** (only when the user brings one) — "Yes, the speaker gave permission"; "No" (Step 4 generates the voice).
- **Series**: only the kit's own questions.

Autonomous mode: each call's recommended option or default, logged.

### Save the brief

`BRIEF.md`: mode, topic, platform, ratio & resolution, fps, duration, narration language (ISO), angle, look, energy, audience, fidelity (only with the user's pictures), voice engine, voice model (VoiceStudio: the active one unless picked), voice (profile id, `design: <description>` or `audition`), signoff (only when given). Every later step reads format and language from it; a mid-way change updates `BRIEF.md` first.

Step 2 (optional): `measure-reference.md`.

### Series kit (save once, start each video of a channel from it)

Opt-in, for a channel the user calls a series; never inferred from an earlier project. A kit is `~/.config/dalang/series/<name>/` with `SERIES.md` (Brief lines, files, Channel rules) and `files/`.

- **Which series?** Before Call 1, only when `node <skill-dir>/scripts/series.mjs list` shows kits: one option per kit (platform · look · voice) and "None — a new look". A `list` WARN means rerun, never "no kits". A kit: `node <skill-dir>/scripts/series.mjs apply <name>` from the project folder; skip every question its Brief lines answer, still ask topic, angle, duration and what is missing; follow its Channel rules like the brief.
- **Save** only when the user asks: `node <skill-dir>/scripts/series.mjs save <name> --from <project> --file <rel> ...` with reusable files only (overlay / HUD module, caption config, tag vocabulary, palette tokens), never scene code (save and apply refuse it). An existing name needs `--force`. Fill the Channel rules with the user: music licence policy, caption / label / card style, what the channel never does.
- **Channel feedback during a run**: `series.mjs note <name> "<rule>"`, and tell the user the line; a changed Brief value is edited in `SERIES.md` and `BRIEF.md`. A lesson for every video goes to the skill, not the kit.
- The kit fixes the look, not the film: script, storyboard, scene code and QC stay per video.
