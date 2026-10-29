// assets/world.js — the film's one world (iso-API.md "The world"): data only, filled once from SPEC.md OBJECTS by the
// first group's builder, imported unchanged by every group.

// the other groups wait while this line is here: the first builder's one Write removes it
export const STUB = true;

// SPEC palette: one base per material; a part takes color: triad(COLORS.x)
import { triad } from "./palette.js";
export const COLORS = { ground: "#B8C2C6", subject: "#009B7D", accent: "#B57300", ink: "#22333B" };

export const WORLD = [
  { at: [0, 0, 0], parts: [{ name: "slab", form: "box", at: [0, 0, -0.3], w: 8, d: 8, h: 0.3, color: COLORS.ground }] },
  // { at: [0, 0, 0], focus: "tank", parts: [{ name: "tank", form: "cyl", at: [0, 0, 0], r: 1, h: "level", color: COLORS.subject }] },
];

// resting values of every key WORLD names, e.g. { level: 0.2 }
export const VALUES = {};

// the part names the overlays label (each unique in WORLD)
export const PINS = [];
