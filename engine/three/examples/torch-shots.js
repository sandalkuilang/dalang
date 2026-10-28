// The torch example's three style frames as data for shots.js: what a film's builder writes instead of per-shot code.
// The beat names are the film's (beats.json); the texts come from its storyboard's Overlay column; the numbers on the
// dimension lines from the set's measured dims, never typed.
//
//   const t = openTorch(kit, { state, speed, full });
//   const run = shots(TORCH_SHOTS, { beats: BEATS, words: WORDS, end: NARRATION_DURATION, fps, W, H, set: torchSet(t, { W, H }), pill: LOOK.accents.label });

export const TORCH_SHOTS = [
  { name: "wide", beat: "hook", action: "flow", transition: "cut", camera: [{ station: "wide" }],
    band: { kicker: "How it works", headline: "The cell drives the LED through the driver", tag: "Illustration" },
    labels: [{ part: "cell", text: "cell" }, { part: "driver", text: "driver" }], dims: [{ dim: "cell" }] },
  { name: "medium", beat: "inside", action: "flow", transition: "cut", camera: [{ station: "medium" }],
    band: { kicker: "How it works", headline: "The cell drives the LED through the driver", tag: "Illustration" },
    labels: [{ part: "driver", text: "driver" }, { part: "star", text: "star board" }], dims: [{ dim: "gap" }] },
  { name: "macro", beat: "detail", action: "flow", transition: "cut", camera: [{ station: "macro" }],
    band: { kicker: "How it works", headline: "The cell drives the LED through the driver", tag: "Illustration" },
    labels: [{ part: "led", text: "LED" }, { part: "reflector", text: "reflector" }], dims: [{ dim: "reflector" }] },
];

// The opened torch as a shots.js set: its stations, parts, dims and cut, the model posed at t (at), its placement.
export const torchSet = (t, { W, H }) => ({
  stations: t.frames({ W, H }), parts: t.parts, dims: t.dims, cut: t.cut, group: t.group, keep: [t.mat, t.ground],
  actions: ["flow"], at: t.at, place: t.place,
});
