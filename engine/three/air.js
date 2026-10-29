import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";

// Air blown from an outlet (a fan, a blower, a vent, an exhaust, a hair dryer): a round turbulent jet along the
// outlet's axis (core speed u0 out to ~2 diameters, then falling as 1/x, spreading ~0.11 per metre), with gusts of
// ±25 % at a few Hz, as measured jets do; still air elsewhere. Air does not pass through things: behind an obstacle
// (any object of the set between the outlet and the point) only the spill and entrained air arrive, ~15 %.
// frame(t, outlet, axis) sets where the outlet is and where it points at time t (units; axis of length 1), so an
// oscillating head or a moving nozzle is a frame function; D: the outlet's diameter (m); u0: core speed (m/s).
// wind(p, t, out) is the air velocity at p (units/s): use it to move what the air carries. block(objects) gives
// the obstacles, once every prop is placed.
export function jet({ frame, D: dm = 0.4, u0 = 2.5 }) {
  const outlet = new THREE.Vector3(), axis = new THREE.Vector3(), d = new THREE.Vector3(), gust = (p, t) => 1 + 0.25 * (0.5 * Math.sin(t * 8.2 + p.y * 9) + 0.3 * Math.sin(t * 18.4 + p.x * 13) + 0.2 * Math.sin(t * 29.3 + p.z * 17));
  const D = dm / M, U = u0 / M, ray = new THREE.Ray(), hit = new THREE.Vector3();
  let blockers = [];
  const shadowed = (p) => { ray.origin.copy(outlet); ray.direction.copy(p).sub(outlet); const l = ray.direction.length(); ray.direction.divideScalar(l); return blockers.some((b) => ray.intersectBox(b, hit) && hit.distanceTo(outlet) < l - 0.01); };
  return {
    wind(p, t, out) { // air velocity at p (units/s), time t
      frame(t, outlet, axis);
      d.copy(p).sub(outlet);
      const x = d.dot(axis);
      if (x <= 0) return out.set(0, 0, 0);
      const r = Math.sqrt(Math.max(0, d.lengthSq() - x * x)), b = D / 2 + 0.11 * x, uc = U * Math.min(1, (2 * D) / x);
      return out.copy(axis).multiplyScalar(uc * Math.exp(-((r / b) ** 2)) * gust(p, t) * (shadowed(p) ? 0.15 : 1));
    },
    block(objects) { // boxes of the things near the jet's sweep (within 3 m, at its height)
      frame(0, outlet, axis);
      blockers = objects.map((o) => new THREE.Box3().setFromObject(o)).filter((b) => !b.isEmpty() && !b.containsPoint(outlet) && b.distanceToPoint(outlet) < 3 / M && b.max.y > outlet.y - 0.7 / M && b.min.y < outlet.y + 0.7 / M);
      return blockers.length;
    },
  };
}
