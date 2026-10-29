// examples.js — finished build() specs (DALANG, MIT) and the tests' fixtures, in metres. Builders copy their density
// and detail per object, never the objects: a film's spec comes from its own reference.

// An office tower on a plot cut to show the ground: footprint extruded, windows as nested arrays, roof plant on top.
export const tower = {
  color: "#CFCABF",
  parts: [
    { name: "plot", form: "board", w: 30, d: 30, top: "#7BA75F", layers: [{ h: 0.6, color: "#5E8C4A" }, { h: 2, color: "#A77850" }, { h: 1.5, color: "#948E83" }] },
    { name: "lobby", form: "box", w: 14, d: 14, h: 5, color: "#D9C8A9" },
    { name: "shaft", form: "extrude", at: [0, 0, 5], outline: [[-6, -6], [6, -6], [6, 2], [2, 2], [2, 6], [-6, 6]], h: 36 },
    { name: "windows", form: "group", at: [6, 0.5, 0], array: { count: 3, step: [0, -3, 0] }, parts: [
      { name: "pane", form: "box", at: [0, 0, 6.5], w: 0.12, d: 1.6, h: 1.8, color: "#5A9BCB", array: { count: 11, step: [0, 0, 3.2] } },
    ] },
    { name: "roof", form: "box", at: [-2, -2, 41], w: 6, d: 6, h: 2, color: "#948E83" },
    { name: "mast", form: "cyl", at: [-2, -2, 43], r: 0.2, h: 6, color: "#8C2620" },
  ],
};

// A water tower: a turned tank on four legs, its wall a skin the cutaway slides off to show the water level
// (values.level, metres of water), and the outlet pipe swept down to the ground.
export const waterTower = {
  color: "#B8B2A6",
  parts: [
    { name: "pad", form: "box", w: 9, d: 9, h: 0.3, color: "#CFCABF" },
    { name: "legA", form: "cyl", at: [-2.4, -2.4, 0.3], r: 0.18, h: 11.7, array: { count: 2, step: [4.8, 0, 0] } },
    { name: "legB", form: "cyl", at: [-2.4, 2.4, 0.3], r: 0.18, h: 11.7, array: { count: 2, step: [4.8, 0, 0] } },
    { name: "water", form: "cyl", at: [0, 0, 12.2], r: 3.05, h: "level", color: "#5A9BCB" },
    { name: "tank", form: "lathe", at: [0, 0, 0], skin: true, color: "#D9C8A9", profile: [[0, 12], [3.2, 12], [3.2, 17.2], [2.4, 18.2], [0.4, 18.8], [0, 18.8]] },
    { name: "outlet", form: "sweep", r: 0.15, color: "#948E83", path: [[0, 0, 12], [0, 0, 1.2], [0, 3.5, 1.2], [0, 3.5, 0.3]] },
  ],
};

// A gearbox, its housing a skin: a 12-tooth pinion on the motor drives a 36-tooth gear at m(z1 + z2)/2 = 0.24 m;
// values.drive is the pinion's angle and build() turns the gear at −12/36 of it.
export const gearbox = {
  color: "#B8B2A6",
  parts: [
    { name: "base", form: "box", at: [0.12, 0, 0], w: 0.7, d: 0.45, h: 0.04, color: "#948E83" },
    { name: "pinion", form: "gear", at: [0, 0, 0.12], teeth: 12, module: 0.01, width: 0.03, turn: "drive", color: "#CF5140" },
    { name: "gear", form: "gear", at: [0.24, 0, 0.12], teeth: 36, module: 0.01, width: 0.03, mesh: { with: "pinion" }, color: "#E9BE5C" },
    { name: "shaftA", form: "cyl", at: [0, 0, 0.04], r: 0.012, h: 0.3 },
    { name: "shaftB", form: "cyl", at: [0.24, 0, 0.04], r: 0.016, h: 0.2 },
    { name: "motor", form: "cyl", at: [0, 0, 0.34], r: 0.06, h: 0.12, color: "#3C7FB1" },
    { name: "housing", form: "box", at: [0.12, 0, 0.04], w: 0.62, d: 0.4, h: 0.3, skin: true, color: "#D9C8A9" },
  ],
};

// A box truck and the person beside it: boxes for chassis, cab and body, wheels in pairs, a figure pointing.
export const truck = {
  color: "#CFCABF",
  parts: [
    { name: "chassis", form: "box", at: [0.4, 0, 0.55], w: 7, d: 2, h: 0.3, color: "#4A3A36" },
    { name: "body", form: "box", at: [-1, 0, 0.85], w: 5, d: 2.4, h: 2.6, color: "#FBF4E6" },
    { name: "cab", form: "box", at: [2.6, 0, 0.85], w: 1.8, d: 2.3, h: 2.1, color: "#CF5140" },
    { name: "windscreen", form: "box", at: [3.48, 0, 2.0], w: 0.06, d: 2.0, h: 0.8, color: "#5A9BCB" },
    { name: "wheelL", form: "wheel", at: [2.4, 1.05, 0], r: 0.5, width: 0.35, array: { count: 2, step: [-3.6, 0, 0] } },
    { name: "wheelR", form: "wheel", at: [2.4, -1.05, 0], r: 0.5, width: 0.35, array: { count: 2, step: [-3.6, 0, 0] } },
    { name: "driver", form: "figure", at: [4.6, 2.2, 0], h: 1.75, pose: "point", color: "#3C7FB1" },
  ],
};
