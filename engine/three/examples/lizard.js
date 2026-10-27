import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { sweep } from "../fur.js";
import { rig, path, refuse } from "../creature.js";

// A small lizard of the house-gecko kind, drawn from its anatomy and walking by a gait rig (creature.js): one swept body from neck to
// tail tip, a head on a pivot at the neck so it can turn toward a stimulus, four sprawled legs of three swept segments (upper limb,
// lower limb, foot) with the toe pads implied by the rounded end of the foot, a tail about as long as the rest. Scales, not fur: no
// coat(). It grips (cling), so it crosses a floor and climbs a wall by the same gait; wallClimb() lays that route.
// Proportions. Total length 12 cm, the snout-to-vent length about half of it (the tail the rest), as on an adult house gecko; the
// trunk is wide and flat (a height of 0.6 of the width), the legs sprawl outward with the elbows and knees out and the hind legs a
// little longer than the front. These are APPROXIMATE, measured off the animal's outline, not from a published table: I found no
// source giving the limb lengths. The only figure read off a source is the size scale: adult-and-juvenile house geckos on one island
// measured 22 to 48 mm snout-vent (Villegas-Retana et al. 2016, Cuadernos de investigación UNED, https://doaj.org/article/8225549bb21c4e9dbcbee79ce6cbbea9,
// read 2026-10-27), so a 60 mm snout-vent length is a large adult. For another lizard pass `length` and a `colour`; for another body
// plan, build the sweeps and call rig() directly.
// Limit: the body does not bend (only sways) over the floor-to-wall corner, so while it turns the tail dips below the floor and the
// snout touches the wall for a moment: frame the shot on the flat parts, or cut the corner out of it; a bending spine is a follow-up.

const sand = new THREE.Color(0xb7a587), dusk = new THREE.Color(0x6d6050), pale = new THREE.Color(0xe4d9c4);

// length: nose to tail tip, metres (0.12). colour: the skin's base THREE.Color. breath: { rate (Hz), depth } or null. A reptile's
// resting breath rate depends on species and temperature: pass the cited rate for the film's animal, or none (no invented default).
// Returns { creature, body, head, length }: add creature.group to the scene.
export function makeLizard({ length = 0.12, colour = sand, breath = null } = {}) {
  const k = length / 0.12, P = (x, y) => new THREE.Vector3(x * k, y * k, 0), sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const tone = (s, a, tail) => { // sand with a darker mottle along the back, pale underneath, dark bands on the tail
    const back = Math.max(0, Math.cos(a)), blot = 0.5 + 0.5 * Math.sin(s * 47 + 3 * Math.sin(a * 3)) * Math.cos(a * 2 + s * 13), band = tail ? 0.5 + 0.5 * Math.sin(s * 62) : 0;
    return colour.clone().lerp(dusk, Math.min(1, back * (0.55 * blot ** 2 + 0.4 * band))).lerp(pale, sm(-0.1, -0.7, Math.cos(a)) * 0.85);
  };
  // The body, neck to tail tip (s 0 at the neck, the vent at 0.43): a trunk 17 mm wide, a tail tapering to a point.
  const spine = [[0.020, 0.0060], [0.010, 0.0060], [-0.004, 0.0060], [-0.018, 0.0058], [-0.030, 0.0052], [-0.055, 0.0042], [-0.086, 0.0030]].map(([x, y]) => P(x, y));
  const girth = (s) => k * (s < 0.43 ? 0.0045 + 0.004 * sm(0, 0.3, s) - 0.0007 * sm(0.3, 0.43, s) : 0.0078 * Math.max(0, 1 - (s - 0.43) / 0.57) ** 0.9 + 0.0003);
  const body = new THREE.Mesh(sweep(spine, girth, { squash: 0.6, colour: (s, a) => tone(s, a, s > 0.43) }), skin);
  body.castShadow = body.receiveShadow = true; body.name = "lizard body";
  // The head on its pivot at the neck: a broad flat skull narrowing to the snout, two bulging eyes.
  const head = new THREE.Group(); head.position.copy(P(0.018, 0.006)); head.name = "lizard head";
  const skull = new THREE.Mesh(sweep([P(-0.004, 0), P(0.004, 0), P(0.012, -0.0003), P(0.0185, -0.0008)], (s) => k * (0.0048 + 0.002 * Math.sin(Math.PI * Math.min(1, 0.2 + s * 0.8)) - 0.0018 * sm(0.5, 1, s)), { squash: 0.62, rad: 24, seg: 24, colour: (s, a) => tone(0.05 + s * 0.1, a, false) }), skin);
  skull.castShadow = skull.receiveShadow = true;
  head.add(skull);
  const eye = new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 0.15 });
  [-1, 1].forEach((side) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0021 * k, 14, 10), eye); e.position.copy(P(0.0085, 0.0023)).setZ(side * 0.0046 * k); e.castShadow = true; head.add(e); });
  // Four sprawled legs: shoulders and pelvis 30 mm apart, hips 7 mm out from the midline, feet 20 mm out; elbows and knees out and up.
  const leg = (name, x, side, front) => ({
    name, hip: [x * k, 0.006 * k, side * 0.007 * k], foot: [(x + (front ? 0.005 : -0.005)) * k, side * 0.020 * k],
    segments: (front ? [0.0095, 0.0105, 0.0070] : [0.011, 0.012, 0.0080]).map((l) => l * k), bend: "out", radius: [0.0022 * k, 0.0011 * k],
  });
  const creature = rig(body, { legs: [leg("LF", 0.014, -1, true), leg("RF", 0.014, 1, true), leg("LH", -0.016, -1, false), leg("RH", -0.016, 1, false)], cling: true, head, breath });
  return { creature, body, head, length };
}

// The route of a lizard across a floor and up a wall, as a walk (creature.js path): a straight run on the floor from `from`, a corner
// two thirds as wide as the lizard is long (the rounded corner lifts the body about a quarter of its radius off the floor and the wall,
// and the legs reach 2 cm: a wider corner leaves them short; the body is one rigid frame, so a much tighter one sinks its ends into the
// wall), then straight up the wall. All positions are scene units: from (a Vector3 on the floor), wall.x (the plane of the wall's face), height (how far up the wall
// to go, measured from the floor). Only a wall at larger x than `from`, facing -X, is laid out here; the module takes any curve.
// k: the kit (its scene is used when none is given). speed: metres a second. radius: the corner's radius, metres (two thirds of the lizard's length).
export function wallClimb(k, lizard, { scene = k?.scene, wall, from, height, speed = 0.05, exclude = [], radius = (2 / 3) * lizard.length, start = 0 } = {}) {
  if (!scene) refuse("wallClimb.scene", "wallClimb(): scene is the THREE.Scene with the floor and the wall");
  if (!wall || !Number.isFinite(wall.x)) refuse("wallClimb.wall", "wallClimb(): wall is { x }, the plane of the wall's face, in scene units");
  if (!from?.isVector3) refuse("wallClimb.from", "wallClimb(): from is a THREE.Vector3 on the floor, in scene units");
  const r = radius / M;
  if (!(from.x < wall.x - r)) refuse("wallClimb.run", `wallClimb(): the floor run ends ${((wall.x - r - from.x) * M * 1000).toFixed(0)} mm short of the corner: start farther from the wall (the corner is ${(radius * 1000).toFixed(0)} mm wide) or pass a smaller radius`);
  if (!(height > r)) refuse("wallClimb.height", `wallClimb(): height is how far up the wall to climb, in scene units, more than the corner's radius (${(radius * 1000).toFixed(0)} mm)`);
  const V = (x, y) => new THREE.Vector3(x, y, from.z), y0 = from.y, curve = new THREE.CurvePath();
  curve.add(new THREE.LineCurve3(V(from.x, y0), V(wall.x - r, y0)));
  curve.add(new THREE.QuadraticBezierCurve3(V(wall.x - r, y0), V(wall.x, y0), V(wall.x, y0 + r)));
  curve.add(new THREE.LineCurve3(V(wall.x, y0 + r), V(wall.x, y0 + height)));
  return path(lizard.creature, curve, { scene, exclude, speed, gait: "sprawl", start });
}
