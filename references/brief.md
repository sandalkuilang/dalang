# Steps 0–2: setup, brief, reference

## Step 0 — Setup (once)

```bash
node <skill-dir>/scripts/preflight.mjs
```

One call, ~3 s: Node, ffmpeg, HyperFrames, VoiceStudio (backend, TTS model, speech-to-text model, watermark), ElevenLabs (tier and quota, never the key; paid, optional), a stock-video key. `<skill-dir>` is this skill's folder. Fix only what it reports:

- **Voice MISSING** → `voice.md` "Setup" (VoiceStudio install, models, the outside-the-backend download, activating speech-to-text; ElevenLabs key rules). Ask before installing anything; state sizes and licences.
- **HyperFrames MISSING / out of date** → ask, then `npx hyperframes skills update`. New skills load after Claude restarts.
- **Stock video WARN** → ask once for a free `PEXELS_API_KEY` or `PIXABAY_API_KEY`. Without one the hero still comes from the user's photos and footage or Commons (`visual-direction.md` §1 rungs 1–2), and a subject that must act on camera with no footage is built in three.js. Image and music generators are not offered: stills, footage and music come from real licensed sources and three.js; a generated still (`mflux`) or generated music (ACE-Step) only when the user asks. HeyGen (stock photos, image-to-video) uses metered credits: mention it only as optional and paid.
- **Licences to mention once:** VoiceStudio's default OmniVoice weights are non-commercial (CC-BY-NC); so is the ElevenLabs free tier. For a monetised video, the user needs a commercial-OK voice (`voice.md` "Licence").

Create `video/<topic-slug>/` and log the preflight result with `state.mjs log` (it creates `PRODUCTION.md`).

## Step 1 — Brief (always via AskUserQuestion)

**Topic first.** If the user named none, ask in plain text. Never guess a topic.

**The user may bring material** — a finished script, a voice recording, photos, a reference video. Use what they bring and skip the questions it already answers: a script replaces Step 3's writing (still convert it to `narration.txt` and show it at Gate 1); a recording replaces the voice question and Step 4's generation (`--from-audio`). Before using someone's recorded voice, confirm the speaker gave permission. A video from someone else's channel is only a reference to measure (Step 2), never material to reuse. When the subject is a machine they may own (a car, a bicycle, an appliance, a tool), ask for 3–5 phone photos of it (the part the video is about, close and wide): generators get machine anatomy wrong.

Then two AskUserQuestion calls (4 questions each at most). Ask about the platform **even if the user named one** ("YouTube" can be Shorts or landscape); put what they said first, marked "(Recommended)". Nothing named, or an answer of "no preference" → recommend / use the Autonomous-mode default for that question. Context the user should read goes in plain text before the call (the tool has no intro field): no reference video unless they have one (then Step 2); the voice itself is picked by audition in Step 4; the engine, when only one is ready.

**Call 1**
1. **Platform** — YouTube Shorts (9:16, 1080×1920, ≤ 3 min, hook in 1–2 s) · Instagram Reels (9:16, ≤ 3 min, taller bottom overlay) · YouTube landscape (16:9, 1920×1080) · Instagram feed (4:5, 1080×1350, ≤ 60 s, often muted). TikTok and 1:1 via "Other".
2. **Language** — the user's language "(Recommended)", English, and one other likely language for this topic or audience; the rest via "Other". Store the ISO 639-1 code.
3. **Angle** — **built from the topic**, 3 options, e.g. "Question answered with data", "Myth vs fact", "Story with a character", "Dialogue scene between characters (no narrator)", "Step by step", "A vs B", "Recommendation per type of person". Angles with people acting or speaking on screen need real or generated footage of people (`visual-direction.md` §1 "People"); without a source, say so in the option.
4. **Realism** — the one choice that decides the whole visual pipeline, so explain it. Two options, each with a `preview` sketching one frame of *this* topic in that realism:
   - **Hyperreal — looks like real footage.** Real photos and footage, generated photoreal stills and clips, PBR 3D lit like a product film. Most convincing when the viewer judges the real thing (products, places, food, people, "which one to buy"). Slower: sourcing, reality checks, heavier renders. Looks A, B, E, F, plus D and H.
   - **Stylized — a premium animated film.** Real shapes and real materials in a designed palette and framing: a studio diorama (a designed miniature on a seamless grey sweep, muted palette with one accent, like the best-loved three.js scenes) or toon with ink lines: very easy to watch, the idea reads at a glance, built in three.js, renders in seconds. Still true to how the thing works. Best for mechanisms, science, things too small, large or hidden to film, kids, stories. Looks C, G, I, plus D and H.
   Put "(Recommended)" on Hyperreal when the real look is the point, on Stylized when the idea is the point. Type (D) and data (H) carry either realism: for an idea with no physical subject (an economic force, a law, a feeling) say so in the question and recommend them. Save as `realism` in `BRIEF.md`.
   For a 3D set, record from the topic (ask only when it is unclear): **`condition`** for any made thing in it (a room, a machine, a street, a battery) — `lived-in` by default, `new`, or `worn` (peeling paint, scuffs, grime, corrosion: only when the topic is about age, neglect, hardship or history); and, only when the set has rooms or furniture, **`interior`** — `american-japandi` by default (honey bamboo and light oak, warm white walls, a white or navy panel door, oatmeal linen, a ceramic or two, American home motifs: Shaker panels, buffalo check, ticking stripe, a braided rug), another when the topic names a place or style.

**Call 2** (its options follow the platform)
5. **Duration** — 9:16 → 30–45 s, 60 s, 90–120 s, 2.5–3 min; 16:9 → 60–90 s, 2–3 min, 5 min; 4:5 → 15–30 s, 45–60 s. Narrative pacing is strongest at 30–90 s; above 3 min, one composition per section.
6. **Visual style** — read `looks.md` and `visual-direction.md` §5. Offer the **looks of the chosen realism that best fit this topic** (up to 4), recommended first; name the others in the question text so "Other" reaches them. Every option gets a `preview`: a short sketch of one frame of *this* topic in that look (the real subject and its source, set, light, type, motion), never a banned default (`looks.md`, `visual-direction.md` §5).
7. **Energy** — "Modern balanced", "Calm cinematic", "Punchy social" (`visual-direction.md` §3); "(Recommended)" goes on Punchy for 9:16 under 60 s, else on Modern balanced.
8. **Audience** — General public, one main idea "(Recommended)"; Students; Professionals/enthusiasts.
9. **Voice** (only when the user has an ElevenLabs key; a third call if Call 2 is full) — "VoiceStudio — free, runs locally (Recommended)"; "ElevenLabs — paid cloud" (never recommended; free tier is non-commercial and small).

Save everything in `BRIEF.md`: topic, platform, ratio & resolution, fps (24 — reads as film, `camera-motion.md` §10 — unless the platform or user needs 30), duration, narration language (ISO code), angle, realism, look, energy, audience, voice engine. Every later step reads format and language from it, not from memory; a mid-way change updates `BRIEF.md` first.

Step 2 (optional, measuring a reference's craft): `measure-reference.md`.
