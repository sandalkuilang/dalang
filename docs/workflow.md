# Workflow

Nine steps, four approval gates. Nothing renders at final quality before Gate 4.

## Pipeline

```mermaid
flowchart TD
    S0["Step 0 · Setup<br/>preflight.mjs"] --> S1["Step 1 · Brief<br/>platform, duration, language, angle, look, voice"]
    S1 --> S2{"Reference video?"}
    S2 -- yes --> M["Step 2 · Measure reference<br/>numbers only, never reuse"]
    S2 -- no --> S3
    M --> S3["Step 3 · Script<br/>script.md + narration.txt"]
    S3 --> G1{{"GATE 1<br/>approve script"}}
    G1 -- changes --> S3
    G1 -- ok --> S4["Step 4 · Voice + per-word timing<br/>tts_timestamps.mjs"]
    S4 --> G2{{"GATE 2<br/>approve narration audio"}}
    G2 -- respell / re-record --> S4
    G2 -- ok --> S5["Step 5 · Look, storyboard, 3 style frames<br/>SPEC.md + storyboard.md"]
    S5 --> G3{{"GATE 3<br/>approve the look"}}
    G3 -- changes --> S5
    G3 -- ok --> S6["Step 6 · Build with HyperFrames<br/>blocking pass, then polish pass"]
    S6 --> S7["Step 7 · Quality check<br/>check, stillness, loudness, rubric"]
    S7 --> G4{{"GATE 4<br/>approve draft preview"}}
    G4 -- changes --> S6
    G4 -- ok --> R["Final render<br/>--quality high"]
    R --> S8["Step 8 · Hand-off report"]
```

## What each step produces

| Step | Output | Gate |
|---|---|---|
| 0 Setup | one-line preflight result in `PRODUCTION.md` | — |
| 1 Brief | `BRIEF.md` | — |
| 2 Reference (optional) | `reference-measurements.md` (numbers only) | — |
| 3 Script | `script.md`, `narration.txt` with `{beat\|name}` markers | **1** |
| 4 Voice | `audio/narration.*`, `words.json`, `beats.json`, `beats.js` | **2** |
| 5 Look | `SPEC.md`, `storyboard.md`, `style-frames/` (3 stills) | **3** |
| 6 Build | HyperFrames composition; every time = `BEATS.<name>.start` | — |
| 7 QC | `draft.mp4`, stillness ≤ 10 %, ≈ −14 LUFS, review snapshots | **4** |
| 8 Hand-off | final file + honest numbers from `PRODUCTION.md` | — |

## Why timing drives everything

```mermaid
sequenceDiagram
    participant N as narration.txt
    participant T as tts_timestamps.mjs
    participant V as Voice engine
    participant B as beats.js
    participant H as HyperFrames scenes
    N->>T: spoken words + {beat|name} markers
    T->>V: synthesize
    V-->>T: audio (+ alignment, or transcribed back)
    T-->>B: words.json, beats.json, BEATS.name.start
    B-->>H: every animation time references BEATS.name.start
```

Never hard-code seconds in a scene: change the script, regenerate, and the visuals follow.

## Cheap before expensive

| Instead of | Do |
|---|---|
| Full voice generation | `--sample` first |
| Re-synthesising | `--from-response` when only `{}` markers moved |
| Re-recording for a small pace miss (< 10 %) | `--speed` |
| Full renders while iterating | snapshots at beat times, `--quality draft` until Gate 4 |

## Autonomous mode

Given only a topic, the skill uses defaults (16:9, 60–90 s, user's language, modern balanced energy), logs "defaults used" in `PRODUCTION.md`, passes the gates on its own judgement and stops at a draft that passes Step 7. The final render happens only if the user said "just finish it" up front.

## CI

`.github/workflows/ci.yml` runs a syntax check on every script and verifies `SKILL.md` front-matter on each push and PR.
