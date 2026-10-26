import { stations, frame, route, loopEnd, attend, place } from "../camera.js";

// A one-take explainer on any set: one persistent world, one camera, no cut. The camera opens on a home shot (a high
// three-quarter view through a long lens, wide of the whole set, where a comparison between two things lives), dives to
// the subject, pushes through into the part inside it at its own scale, and travels back home so that the last frame is
// the first (a Short replays seamlessly). On each beat everything outside the subject fades to a ghost (attend), and
// the floor or sweep stays whole (`keep`).
//   world: the Object3D holding the whole set; subject: the thing the film is about (a kitchen appliance, a bicycle's
//   rear wheel, a beehive, a server rack); inside: the part within it that the push-through enters (the heating
//   element, the freewheel, one brood frame, one fan); keep: objects that never ghost (the floor); aspect: the frame's
//   width over height (9/16 for a Short); end: the film's last frame time, (frames - 1) / fps; azimuth: degrees around
//   the set; look: options for attend() (ghost, desat, light, dur, edge; dur at most 2.5 s, the time before the end the attention is released in, or oner throws); beats: { dive, inside } start times, seconds.
// Returns { stations, route, look, end, at(t, camera) }. at(t, camera): once per frame, after every other at()
// (a cutaway's included): it places the camera when one is given, applies the attention and returns the pose
// (position, target, fov, speed in m/s for motion blur, leg, station).
export function oner({ world, subject, inside, keep = [], aspect = 9 / 16, end = 12, azimuth = 40, look = {}, beats = {} } = {}) {
  if (!world || !subject || !inside) throw new Error("oner() needs { world, subject, inside }: the set, the thing it is about, and the part within it");
  const dive = beats.dive ?? 1.5, push = beats.inside ?? 4.5, tail = 2.5, back = end - tail; // tail: the closing leg, and the time the attention has to be fully released
  if ((look.dur ?? 0.5) > tail) throw new Error("oner(): look.dur is " + look.dur + " s, longer than the " + tail + " s before the end where the attention is released; the last frame would still be ghosted and a Short would cut from a ghosted world to a solid one. Use look.dur of " + tail + " s or less");
  const st = stations({
    home: frame(world, { fov: 18, aspect, azimuth, elevation: 35 }), // a long lens, high: little perspective, the whole set
    dive: frame(subject, { fov: 24, aspect, azimuth, elevation: 25 }),
    inside: frame(inside, { fov: 45, aspect, azimuth, elevation: 12, margin: 1.05 }), // a wide lens, low: inside the part
  });
  const r = route(st, [
    { to: "dive", start: dive, dur: 2, over: world },
    { to: "inside", start: push, dur: 1.6, lift: 0 }, // the push-through: straight in
    loopEnd(st, { end, dur: tail, over: world }),
  ]);
  const a = attend(world, { keep, ...look }).focus(subject, dive).focus(inside, push).release(back);
  return { stations: st, route: r, look: a, end, at(t, camera) { const p = r.at(t); if (camera) place(camera, p); a.at(t); return p; } };
}
