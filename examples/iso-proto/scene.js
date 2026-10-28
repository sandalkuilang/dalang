// The iso prototype's one generic scene, written twice: THREE_WORLD for engine/three/isoWorld.js (ready CC0 models,
// placed and posed) and ISO_WORLD for engine/iso build() (primitives, the way an Express builder writes a set today).
// Same layout, same palette, same shots. Metres, z up, the viewer at +x +y; a small room (two back walls) and a yard
// on one floating slab, two people, a pump set with its pipe run, 11 props against the walls.

export const W = 1080, H = 1920;
export const COLORS = {
  bg: "#E8EDEF", ground: "#CFD8DB", ground2: "#B8C2C6", ink: "#22333B",
  wall: "#E9E2D6", floor: "#C9A27A", wood: "#B98557", woodDark: "#8A5E3B", white: "#F4F1EA",
  coral: "#D9503F", teal: "#009B7D", indigo: "#4A55C8", amber: "#B57300",
  metal: "#9AA6AB", metalDark: "#5D6E75", glass: "#BFD9E0", lamp: "#F3DFA0",
  plant: "#3F9A5B", leaf: "#5DAA5F", grass: "#9CC27A", bark: "#8A5E3B",
  skin1: "#E9B996", skin2: "#B97A55", skin3: "#7A4E35", hair: "#2E2522",
};
export const PALETTE = Object.values(COLORS).filter((c) => c !== COLORS.bg);
// Kenney materials are named by what they are: one role colour per name, the same in every pack
export const ROLES = { wood: COLORS.wood, woodDark: COLORS.woodDark, metal: COLORS.metal, metalDark: COLORS.metalDark, metalLight: COLORS.white,
  glass: COLORS.glass, lamp: COLORS.lamp, plant: COLORS.plant, leafsGreen: COLORS.leaf, grass: COLORS.grass, woodBark: COLORS.bark };

const F = "models/furniture/", N = "models/nature/", P = "models/people/";
export const MODELS = {
  bookcase: F + "bookcaseOpen.glb", desk: F + "desk.glb", deskChair: F + "chairDesk.glb", screen: F + "computerScreen.glb",
  floorLamp: F + "lampRoundFloor.glb", pottedPlant: F + "pottedPlant.glb", sofa: F + "loungeSofa.glb", sideTable: F + "sideTable.glb",
  tableLamp: F + "lampRoundTable.glb", rug: F + "rugRectangle.glb", coffeeTable: F + "tableCoffee.glb",
  fence: N + "fence_simple.glb", tree: N + "tree_default.glb", bush: N + "plant_bush.glb", flower: N + "flower_redA.glb",
  guide: P + "character-female-a.glb", visitor: P + "character-male-b.glb",
};

const C = COLORS, FLOOR = 0.05, PUMP = [7.25, 3.4];
// the shell and the machine: a mechanism and the set's planes, the only things drawn from primitives
const SHELL = [
  { name: "slab", form: "box", at: [4.4, 2.5, -0.5], w: 9.8, d: 5.8, h: 0.5, color: C.ground2 },
  { name: "floor", form: "box", at: [2.5, 2, 0], w: 5, d: 4, h: FLOOR, color: C.floor },
  { name: "yard", form: "box", at: [7.25, 2.5, 0], w: 3.9, d: 5, h: 0.03, color: C.grass },
  { name: "wallBack", form: "box", at: [2.44, -0.06, 0], w: 5.12, d: 0.12, h: 2.6, color: C.wall },
  { name: "wallLeft", form: "box", at: [-0.06, 2, 0], w: 0.12, d: 4, h: 2.6, color: C.wall },
  { name: "window", form: "box", at: [3.9, 0.01, 0.95], w: 1.2, d: 0.02, h: 1.0, color: C.glass },
];
const MACHINE = [
  { name: "skid", form: "box", at: [7.4, 3.4, 0.03], w: 1.9, d: 0.8, h: 0.1, color: C.metalDark },
  { name: "motor", form: "cyl", axis: "x", at: [6.75, 3.4, 0.13], r: 0.2, h: 0.6, color: C.teal },
  { name: "pump", form: "cyl", axis: "x", at: PUMP.concat(0.13), r: 0.26, h: 0.22, color: C.teal },
  { name: "tank", form: "lathe", at: [8.05, 3.4, 0.13], color: C.coral, profile: [[0, 0], [0.32, 0], [0.34, 0.05], [0.34, 1.05], [0.28, 1.2], [0.12, 1.28], [0, 1.29]] },
  { name: "suction", form: "sweep", r: 0.05, color: C.metal, path: [[7.71, 3.4, 0.4], [7.36, 3.4, 0.4]] },
  { name: "riser", form: "sweep", r: 0.05, color: C.metal, path: [[7.25, 3.4, 0.65], [7.25, 3.4, 1.05], [7.25, 0.16, 1.05], [4.6, 0.16, 1.05], [4.6, 0.16, 0.05]] },
  { name: "postA", form: "box", at: [6.3, 0.16, 0.03], w: 0.06, d: 0.06, h: 0.97, color: C.metalDark },
  { name: "postB", form: "box", at: [5.4, 0.16, 0.03], w: 0.06, d: 0.06, h: 0.97, color: C.metalDark },
  { name: "postC", form: "box", at: [7.25, 1.8, 0.03], w: 0.06, d: 0.06, h: 0.97, color: C.metalDark },
];

// the ready models: one line each, the real height in metres, where its front looks
export const THREE_WORLD = [
  ...SHELL, ...MACHINE,
  { name: "bookcase", model: "bookcase", at: [0.75, 0.2, FLOOR], h: 1.9, face: "+y" },
  { name: "desk", model: "desk", at: [2.25, 0.42, FLOOR], h: 0.75, face: "+y" },
  { name: "screen", model: "screen", at: [2.25, 0.3, FLOOR + 0.75], h: 0.42, face: "+y" },
  { name: "deskChair", model: "deskChair", at: [2.25, 1.15, FLOOR], h: 0.95, face: "-y" },
  { name: "floorLamp", model: "floorLamp", at: [3.15, 0.25, FLOOR], h: 1.6, face: "+y" },
  { name: "pottedPlant", model: "pottedPlant", at: [4.65, 0.75, FLOOR], h: 1.0, face: "+y" },
  { name: "rug", model: "rug", at: [1.75, 2.45, FLOOR], h: 0.015, face: "+x", roles: { carpet: C.indigo }, shadow: false },
  { name: "sofa", model: "sofa", at: [0.48, 2.45, FLOOR], h: 0.8, face: "+x", color: C.indigo },
  { name: "coffeeTable", model: "coffeeTable", at: [1.65, 2.45, FLOOR], h: 0.42, face: "+x" },
  { name: "sideTable", model: "sideTable", at: [0.32, 3.75, FLOOR], h: 0.55, face: "+x" },
  { name: "tableLamp", model: "tableLamp", at: [0.32, 3.75, FLOOR + 0.55], h: 0.45, face: "+x" },
  { name: "fenceA", model: "fence", at: [6.3, -0.25, 0], h: 0.7, face: "+y" },
  { name: "fenceB", model: "fence", at: [8.3, -0.25, 0], h: 0.7, face: "+y" },
  { name: "fenceC", model: "fence", at: [9.1, 1.0, 0], h: 0.7, face: "-x" },
  { name: "fenceD", model: "fence", at: [9.1, 3.0, 0], h: 0.7, face: "-x" },
  { name: "tree", model: "tree", at: [8.6, 0.7, 0], h: 3.2 },
  { name: "bush", model: "bush", at: [5.7, 4.55, 0], h: 0.5 },
  { name: "flower", model: "flower", at: [6.3, 4.7, 0], h: 0.35 },
  { name: "guide", figure: "guide", at: [8.0, 2.05, 0.03], h: 1.68, pose: "point", look: PUMP },
  { name: "visitor", figure: "visitor", at: [5.8, 2.7, 0.03], h: 1.78, look: PUMP },
];

// the same set as an Express builder writes it today: every prop sculpted from primitives in build() parts
const box = (name, at, w, d, h, color) => ({ name, form: "box", at, w, d, h, color });
export const ISO_WORLD = [
  ...[...SHELL, ...MACHINE].map((e) => ({ parts: [e] })),
  { at: [0.75, 0.2, FLOOR], parts: [box("frame", [0, 0, 0], 0.86, 0.3, 1.9, C.wood), box("shelves", [0, 0.16, 0.05], 0.78, 0.02, 0.02, C.woodDark), box("books", [-0.1, 0.05, 0.45], 0.5, 0.22, 0.28, C.coral)] },
  { at: [2.25, 0.42, FLOOR], parts: [box("top", [0, 0, 0.71], 1.4, 0.7, 0.04, C.wood), { name: "leg", form: "box", at: [-0.65, -0.3, 0], w: 0.05, d: 0.05, h: 0.71, color: C.woodDark, array: { count: 2, step: [1.3, 0, 0] } }, { name: "legB", form: "box", at: [-0.65, 0.3, 0], w: 0.05, d: 0.05, h: 0.71, color: C.woodDark, array: { count: 2, step: [1.3, 0, 0] } }] },
  { at: [2.25, 0.3, FLOOR + 0.75], parts: [box("stand", [0, 0, 0], 0.2, 0.15, 0.1, C.metalDark), box("panel", [0, 0, 0.1], 0.7, 0.04, 0.32, C.ink)] },
  { at: [2.25, 1.15, FLOOR], parts: [{ name: "stem", form: "cyl", r: 0.03, h: 0.45, color: C.metalDark }, box("seat", [0, 0, 0.45], 0.48, 0.46, 0.08, C.ink), box("back", [0, 0.2, 0.53], 0.46, 0.06, 0.45, C.ink)] },
  { at: [3.15, 0.25, FLOOR], parts: [{ name: "pole", form: "cyl", r: 0.02, h: 1.35, color: C.metal }, { name: "shade", form: "cone", at: [0, 0, 1.3], r: 0.2, h: 0.3, color: C.lamp }, { name: "foot", form: "cyl", r: 0.15, h: 0.03, color: C.metal }] },
  { at: [4.65, 0.75, FLOOR], parts: [{ name: "pot", form: "cyl", r: 0.18, h: 0.35, color: C.wood }, { name: "leaves", form: "sphere", at: [0, 0, 0.3], r: 0.33, color: C.plant }] },
  { at: [1.75, 2.45, FLOOR], parts: [box("rug", [0, 0, 0], 1.8, 3.0, 0.015, C.indigo)] },
  { at: [0.48, 2.45, FLOOR], parts: [box("base", [0, 0, 0.1], 0.85, 1.9, 0.32, C.indigo), box("back", [-0.32, 0, 0.42], 0.2, 1.9, 0.38, C.indigo), box("armL", [0, -0.88, 0.42], 0.85, 0.14, 0.2, C.indigo), box("armR", [0, 0.88, 0.42], 0.85, 0.14, 0.2, C.indigo)] },
  { at: [1.65, 2.45, FLOOR], parts: [box("top", [0, 0, 0.36], 0.65, 1.1, 0.06, C.wood), box("base", [0, 0, 0], 0.55, 1.0, 0.36, C.woodDark)] },
  { at: [0.32, 3.75, FLOOR], parts: [box("body", [0, 0, 0], 0.5, 0.55, 0.55, C.wood)] },
  { at: [0.32, 3.75, FLOOR + 0.55], parts: [{ name: "base", form: "cyl", r: 0.07, h: 0.2, color: C.metal }, { name: "shade", form: "cone", at: [0, 0, 0.18], r: 0.16, h: 0.27, color: C.lamp }] },
  { at: [5.3, -0.25, 0], parts: [{ name: "posts", form: "box", w: 0.08, d: 0.08, h: 0.7, color: C.wood, array: { count: 5, step: [1.0, 0, 0] } }, box("rail", [2, 0, 0.5], 4, 0.04, 0.08, C.wood), box("rail2", [2, 0, 0.2], 4, 0.04, 0.08, C.wood)] },
  { at: [9.1, 0, 0], parts: [{ name: "posts", form: "box", w: 0.08, d: 0.08, h: 0.7, color: C.wood, array: { count: 5, step: [0, 1.0, 0] } }, box("rail", [0, 2, 0.5], 0.04, 4, 0.08, C.wood), box("rail2", [0, 2, 0.2], 0.04, 4, 0.08, C.wood)] },
  { at: [8.6, 0.7, 0], parts: [{ name: "trunk", form: "cyl", r: 0.12, h: 1.4, color: C.bark }, { name: "crown", form: "cone", at: [0, 0, 1.1], r: 0.9, h: 2.1, color: C.leaf }] },
  { at: [5.7, 4.55, 0], parts: [{ name: "bush", form: "sphere", r: 0.35, color: C.plant }] },
  { at: [6.3, 4.7, 0], parts: [{ name: "stem", form: "cyl", r: 0.01, h: 0.3, color: C.plant }, { name: "bloom", form: "sphere", at: [0, 0, 0.27], r: 0.05, color: C.coral }] },
  { at: [8.0, 2.05, 0.03], parts: [{ name: "guide", form: "figure", h: 1.68, pose: "point", color: C.amber }] },
  { at: [5.8, 2.7, 0.03], parts: [{ name: "visitor", form: "figure", h: 1.78, pose: "stand", color: C.indigo }] },
];

// the ground (slab, floor, yard) is the first GROUND entries of both worlds
export const GROUND = 3;

// engine/iso cams: the world point at the frame's centre and px per metre
export const SHOTS = {
  wide: { x: 4.4, y: 2.5, z: 0.9, k: 66 },
  medium: { x: 7.2, y: 2.6, z: 0.8, k: 190 },
  close: { x: 7.95, y: 2.75, z: 0.95, k: 400 },
};
