# Steps 0–2: setup, brief, reference

## Step 0 — Setup (once)

```bash
node <skill-dir>/scripts/preflight.mjs
```

One call, ~3 s: Node, ffmpeg, HyperFrames, VoiceStudio (backend, TTS model, speech-to-text model, watermark), ElevenLabs (tier and quota, never the key; paid, optional), image and music sources. `<skill-dir>` is this skill's folder. Fix only what it reports:

- **Voice MISSING** → `voice.md` "Setup" (VoiceStudio install, models, the outside-the-backend download, activating speech-to-text; ElevenLabs key rules). Ask before installing anything; state sizes and licences.
- **HyperFrames MISSING / out of date** → ask, then `npx hyperframes skills update` (the plugin route has failed with "repository not found"). New skills load after Claude restarts.
- **Images WARN** → the hero can still be real (the user's photos and footage, licensed photos and video, `visual-direction.md` §1 rungs 1–2), but a subject that must act on camera may need a generator. Before Step 1, offer once the free option: local `mflux` (photoreal stills). HeyGen (stock photos, image-to-video) uses metered credits: mention it only as optional and paid.
- **Music WARN** → offer once the free local option: ACE-Step 1.5 (MIT, runs on Apple Silicon). Never MusicGen (its weights are non-commercial). Without music, deliver narration + SFX.
- **Licences to mention once:** VoiceStudio's default OmniVoice weights are non-commercial (CC-BY-NC); so is the ElevenLabs free tier. For a monetised video, the user needs a commercial-OK voice (`voice.md` "Licence").

Create `video/<topic-slug>/` and `PRODUCTION.md`, and log the preflight result in one line.

## Step 1 — Brief (always via AskUserQuestion)

**Topic first.** If the user named none, ask in plain text. Never guess a topic.

**The user may bring material** — a finished script, a voice recording, photos, a reference video. Use what they bring and skip the questions it already answers: a script replaces Step 3's writing (still convert it to `narration.txt` and show it at Gate 1); a recording replaces the voice question and Step 4's generation (`--from-audio`). Before using someone's recorded voice, confirm the speaker gave permission. A video from someone else's channel is only a reference to measure (Step 2), never material to reuse.

Then two AskUserQuestion calls (4 questions each at most). Ask about the platform **even if the user named one** ("YouTube" can be Shorts or landscape); put what they said first, marked "(Recommended)". Nothing named, or an answer of "no preference" → recommend / use the Autonomous-mode default for that question. Context the user should read goes in plain text before the call (the tool has no intro field): no reference video unless they have one (then Step 2); the voice itself is picked by audition in Step 4; the engine, when only one is ready.

**Call 1**
1. **Platform** — YouTube Shorts (9:16, 1080×1920, ≤ 3 min, hook in 1–2 s) · Instagram Reels (9:16, ≤ 3 min, taller bottom overlay) · YouTube landscape (16:9, 1920×1080) · Instagram feed (4:5, 1080×1350, ≤ 60 s, often muted). TikTok and 1:1 via "Other".
2. **Language** — the user's language "(Recommended)", English, and one other likely language for this topic or audience; the rest via "Other". Store the ISO 639-1 code.
3. **Angle** — **built from the topic**, 3 options, e.g. "Question answered with data", "Myth vs fact", "Story with a character", "Dialogue scene between characters (no narrator)", "Step by step", "A vs B", "Recommendation per type of person". Angles with people acting or speaking on screen need real or generated footage of people (`visual-direction.md` §1 "People"); without a source, say so in the option.
4. **Audience** — General public, one main idea "(Recommended)"; Students; Professionals/enthusiasts.

**Call 2** (its options follow the platform)
5. **Duration** — 9:16 → 30–45 s, 60 s, 90–120 s, 2.5–3 min; 16:9 → 60–90 s, 2–3 min, 5 min; 4:5 → 15–30 s, 45–60 s. Narrative pacing is strongest at 30–90 s; above 3 min, one composition per section.
6. **Visual style** — read `looks.md` and `visual-direction.md` §5. Offer the **4 looks that best fit this topic**, recommended first, all with a hyperreal subject (stylised looks only if the user asked for a cartoon); name the others in the question text so "Other" reaches them. Every option gets a `preview`: a short sketch of one frame of *this* topic in that look (the real subject and its source, set, light, type, motion), never a banned default (§5 "Banned"; also no dark void, blue gradient or starfield).
7. **Energy** — "Modern balanced (Recommended)", "Calm cinematic", "Punchy social" (`visual-direction.md` §3; recommend Punchy first for 9:16 under 60 s).
8. **Voice** (only when the user has an ElevenLabs key) — "VoiceStudio — free, runs locally (Recommended)"; "ElevenLabs — paid cloud" (never recommended; free tier is non-commercial and small).

Save everything in `BRIEF.md`: topic, platform, ratio & resolution, duration, narration language (ISO code), angle, look, energy, audience, voice engine. Every later step reads format and language from it, not from memory; a mid-way change updates `BRIEF.md` first.

## Step 2 — (Optional) Measure a reference: borrow the craft, not the work

Copying a film's images or its script is theft. Measuring how it is built (section lengths, cuts, camera moves, beats, motion) and using the numbers for your own story is allowed. Follow `measure-reference.md`; `scripts/measure_reference.sh` does the mechanical part. `reference-measurements.md` holds numbers only.
