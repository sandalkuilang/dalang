// assets/world.js — the film's one world, shared by every group (written by scaffold.mjs; filled ONCE, by the first
// group's builder, from SPEC.md OBJECTS). Every group imports it and never redraws or edits it, so the same object is
// the same in every shot and seams match by construction. Data only: build() specs from each object's reference, real
// sizes in metres, z up (iso-API.md "The world"); no drawing code. A number may name a key of VALUES ("h": "level"):
// VALUES holds its resting value, and a group's values(t) overrides only the keys it animates.

// SPEC palette: one base colour per material; tri(base) gives its three tones where a primitive needs them
export const COLORS = { ground: "#B8C2C6", subject: "#009B7D", accent: "#B57300", ink: "#22333B" };

export const WORLD = [
  { at: [0, 0, 0], parts: [{ name: "slab", form: "box", at: [0, 0, -0.3], w: 8, d: 8, h: 0.3, color: COLORS.ground }] },
  // { at: [0, 0, 0], focus: "tank", parts: [{ name: "tank", form: "cyl", at: [0, 0, 0], r: 1, h: "level", color: COLORS.subject }] },
];

// resting values of every key WORLD names, e.g. { level: 0.2 }
export const VALUES = {};
