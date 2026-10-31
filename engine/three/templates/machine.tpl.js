export const STUB = true; // the first group's builder replaces this whole file, this line included (scaffold.mjs brief)
// The film's machine (looks.md object-studio, the thesis): built once from SPEC.md MODEL and research/anatomy.md's parts
// table, imported unchanged by every group. Every moving part is posed only by pose(parts, MODEL.at(t)); no group
// animates a part itself. AUDIT proves it runs (scripts/machine_audit.mjs, in express.mjs assemble).
import { THREE } from "./three-vendor.js";
import { drive } from "./drive.js";
// import { gear, bevel, bevelPair, spring, lathe, rod } from "./parts.js";
export const MODEL = drive({ input: () => 0, state: () => ({}) });
export const AUDIT = { u: [0, 1], rigid: [], mesh: [], gaps: [] };
// build(mat) → { root, parts }: root holds every part; parts names each mesh or group pose() moves
export function build(mat) { return { root: new THREE.Group(), parts: {} }; }
// pose(parts, s): set every moving part's transform from state s; pure, no memory between frames
export function pose(parts, s) {}
