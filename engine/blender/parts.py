"""parts.py - generic mechanical part library for Blender (bpy/bmesh only, metres) (DALANG, MIT).

Every part function takes real-unit parameters and returns a dict {object_name: bpy object}
(plus optional '_info' with local port positions). Nothing here knows about a topic.
Conventions: Blender Z up; a part's local "front" is -Y unless stated. Objects are built in
local coordinates around their origin; the caller places them with .location / .rotation.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix

TAU = 2 * math.pi
I4 = Matrix.Identity(4)

# ---------------------------------------------------------------- materials (role-named, plain colours)
MATS = {
    'sheet_metal':   ((0.70, 0.72, 0.73), 0.45, 0.6),   # galvanised steel
    'copper':        ((0.72, 0.40, 0.24), 0.35, 1.0),
    'aluminium':     ((0.74, 0.75, 0.76), 0.35, 1.0),
    'black_steel':   ((0.035, 0.035, 0.04), 0.45, 0.3),
    'steel':         ((0.52, 0.53, 0.55), 0.35, 1.0),
    'zinc':          ((0.80, 0.80, 0.78), 0.30, 1.0),   # fasteners
    'brass':         ((0.78, 0.62, 0.32), 0.30, 1.0),
    'plastic_fan':   ((0.80, 0.77, 0.68), 0.50, 0.0),
    'plastic_black': ((0.06, 0.06, 0.06), 0.50, 0.0),
    'wire_red':      ((0.70, 0.08, 0.06), 0.50, 0.0),
    'wire_blue':     ((0.10, 0.20, 0.70), 0.50, 0.0),
    'wire_yellow':   ((0.85, 0.75, 0.10), 0.50, 0.0),
}


def mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    col, rough, metal = MATS[name]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*col, 1.0)
    m.roughness, m.metallic = rough, 0.0   # viewport/Workbench: plain base colour; PBR metal lives in the node
    try:
        if not m.use_nodes:
            m.use_nodes = True
    except Exception:
        pass
    if m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['Base Color'].default_value = (*col, 1.0)
                n.inputs['Roughness'].default_value = rough
                n.inputs['Metallic'].default_value = metal
    return m


# ---------------------------------------------------------------- matrices
def T(x, y, z):
    return Matrix.Translation((x, y, z))


def R(axis, deg):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def axis_to(v):
    v = Vector(v).normalized()
    return Vector((0, 0, 1)).rotation_difference(v).to_matrix().to_4x4()


def place(pos, normal=(0, 0, 1), spin=0.0):
    """Matrix putting local +Z along `normal` at `pos` (fastener heads, stubs)."""
    return T(*pos) @ axis_to(normal) @ R('Z', spin)


def basis(o, xa, ya, za):
    xa, ya, za, o = Vector(xa), Vector(ya), Vector(za), Vector(o)
    return Matrix(((xa.x, ya.x, za.x, o.x), (xa.y, ya.y, za.y, o.y),
                   (xa.z, ya.z, za.z, o.z), (0, 0, 0, 1)))


# ---------------------------------------------------------------- path helpers
def fillet(pts, rad, seg=6):
    """Polyline -> polyline with rounded corners (quadratic Bezier, close to a circular bend)."""
    P = [Vector(p) for p in pts]
    if len(P) < 3 or rad <= 0:
        return P
    out = [P[0]]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        d1, d2 = (b - a), (c - b)
        l1, l2 = d1.length, d2.length
        if l1 < 1e-9 or l2 < 1e-9:
            continue
        d1, d2 = d1 / l1, d2 / l2
        ang = d1.angle(d2) if d1.dot(d2) < 0.99999 else 0.0
        if ang < 1e-3:
            out.append(b)
            continue
        off = min(rad * math.tan(ang / 2), l1 * 0.49, l2 * 0.49)
        A, B = b - d1 * off, b + d2 * off
        n = max(2, int(seg * ang / (math.pi / 2)) + 1)
        for k in range(n + 1):
            t = k / n
            out.append((1 - t) ** 2 * A + 2 * (1 - t) * t * b + t * t * B)
    out.append(P[-1])
    return out


def path_len(P):
    return sum((P[i + 1] - P[i]).length for i in range(len(P) - 1))


def path_at(P, s):
    """Point and unit tangent at arc length s along polyline P."""
    acc = 0.0
    for i in range(len(P) - 1):
        seg = (P[i + 1] - P[i]).length
        if acc + seg >= s or i == len(P) - 2:
            t = 0 if seg < 1e-12 else (s - acc) / seg
            return P[i].lerp(P[i + 1], max(0, min(1, t))), (P[i + 1] - P[i]).normalized()
        acc += seg


def _ray_poly(c, ang, poly):
    dx, dy = math.cos(ang), math.sin(ang)
    best = 1e9
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        den = dx * ey - dy * ex
        if abs(den) < 1e-12:
            continue
        t = ((ax - c[0]) * ey - (ay - c[1]) * ex) / den
        u = ((ax - c[0]) * dy - (ay - c[1]) * dx) / den
        if t > 1e-9 and -1e-9 <= u <= 1 + 1e-9:
            best = min(best, t)
    return best


# ---------------------------------------------------------------- mesh builder
class MB:
    """bmesh builder with a current material; every primitive takes a placement matrix M."""

    def __init__(self, material='sheet_metal'):
        self.bm = bmesh.new()
        self.mats = []
        self.cur = self._mi(material)

    def _mi(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def use(self, name):
        self.cur = self._mi(name)
        return self

    def v(self, M, p):
        return self.bm.verts.new(M @ Vector(p))

    def f(self, vs):
        out = []
        for x in vs:
            if x not in out:
                out.append(x)
        if len(out) < 3:
            return None
        try:
            fc = self.bm.faces.new(out)
        except ValueError:
            return None
        fc.material_index = self.cur
        return fc

    # --- primitives
    def box(self, sx, sy, sz, c=(0, 0, 0), M=I4):
        cx, cy, cz = c
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        V = [self.v(M, (cx + a * hx, cy + b * hy, cz + d * hz))
             for d in (-1, 1) for b in (-1, 1) for a in (-1, 1)]
        for q in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
            self.f([V[i] for i in q])

    def boxr(self, x0, x1, y0, y1, z0, z1, M=I4):
        self.box(x1 - x0, y1 - y0, z1 - z0, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), M)

    def lathe(self, prof, segs=32, a0=0.0, a1=TAU, M=I4, closed=True, cap=True, warp=None):
        """Revolve (r, z) profile about local Z between angles a0..a1; partial sweeps get end caps."""
        full = abs((a1 - a0) - TAU) < 1e-6
        n = segs if full else segs + 1
        angs = [a0 + (a1 - a0) * j / segs for j in range(n)]
        rings = []
        for (r, z) in prof:
            if r < 1e-7:
                p = (0, 0, z) if not warp else warp(0, 0, z)
                vv = self.v(M, p)
                rings.append([vv] * n)
            else:
                ring = []
                for a in angs:
                    p = (r * math.cos(a), r * math.sin(a), z)
                    if warp:
                        p = warp(*p)
                    ring.append(self.v(M, p))
                rings.append(ring)
        np_ = len(prof)
        pairs = [(i, i + 1) for i in range(np_ - 1)] + ([(np_ - 1, 0)] if closed else [])
        for i, k in pairs:
            for j in range(segs):
                j2 = (j + 1) % n if full else j + 1
                self.f([rings[i][j], rings[i][j2], rings[k][j2], rings[k][j]])
        if not full and cap and closed:
            self.f([rings[i][0] for i in range(np_)])
            self.f([rings[i][n - 1] for i in range(np_)][::-1])

    def lathe_ranges(self, prof, segs, ranges, M=I4, **kw):
        for a0, a1 in ranges:
            s = max(2, int(round(segs * (a1 - a0) / TAU)))
            self.lathe(prof, s, a0, a1, M, **kw)

    def cyl(self, r, z0, z1, segs=16, M=I4):
        self.lathe([(0, z0), (r, z0), (r, z1), (0, z1)], segs, M=M)

    def ring(self, ro, ri, z0, z1, segs=24, M=I4):
        self.lathe([(ri, z0), (ro, z0), (ro, z1), (ri, z1)], segs, M=M)

    def extrude(self, poly, z0, z1, M=I4):
        B = [self.v(M, (x, y, z0)) for x, y in poly]
        Tt = [self.v(M, (x, y, z1)) for x, y in poly]
        self.f(B[::-1])
        self.f(Tt)
        n = len(poly)
        for i in range(n):
            j = (i + 1) % n
            self.f([B[i], B[j], Tt[j], Tt[i]])

    def plate_hole(self, outer, hole_c, hole_r=None, hole_poly=None, t=0.001, segs=96, M=I4):
        """Plate (local XY, thickness t along +Z) with one star-shaped hole: outer convex polygon."""
        angs = {round(TAU * k / segs, 6) for k in range(segs)}
        for (x, y) in outer + (hole_poly or []):
            angs.add(round(math.atan2(y - hole_c[1], x - hole_c[0]) % TAU, 6))
        angs = sorted(angs)
        O, Ih = [], []
        for a in angs:
            ro = _ray_poly(hole_c, a, outer)
            ri = hole_r if hole_poly is None else _ray_poly(hole_c, a, hole_poly)
            O.append((hole_c[0] + ro * math.cos(a), hole_c[1] + ro * math.sin(a)))
            Ih.append((hole_c[0] + ri * math.cos(a), hole_c[1] + ri * math.sin(a)))
        ob = [self.v(M, (x, y, 0)) for x, y in O]
        ot = [self.v(M, (x, y, t)) for x, y in O]
        ib = [self.v(M, (x, y, 0)) for x, y in Ih]
        it = [self.v(M, (x, y, t)) for x, y in Ih]
        n = len(angs)
        for i in range(n):
            j = (i + 1) % n
            self.f([ot[i], ot[j], it[j], it[i]])
            self.f([ob[i], ib[i], ib[j], ob[j]])
            self.f([ob[i], ob[j], ot[j], ot[i]])
            self.f([ib[i], it[i], it[j], ib[j]])

    def sweep(self, pts, r, sides=10, closed=False, cap=True, M=I4, r_in=None, rfun=None):
        """Circle (or ring if r_in) swept along a 3D polyline with parallel-transport frames."""
        P = [Vector(p) for p in pts]
        # drop duplicate points
        Q = [P[0]]
        for p in P[1:]:
            if (p - Q[-1]).length > 1e-7:
                Q.append(p)
        P = Q
        N = len(P)
        if N < 2:
            return
        Tg = []
        for i in range(N):
            if closed:
                t = P[(i + 1) % N] - P[i - 1]
            else:
                t = P[min(i + 1, N - 1)] - P[max(i - 1, 0)]
            Tg.append(t.normalized())
        a = Vector((0, 0, 1)) if abs(Tg[0].z) < 0.9 else Vector((1, 0, 0))
        nrm = Tg[0].cross(a).normalized()
        frames = []
        for i in range(N):
            if i > 0:
                nrm = nrm - Tg[i] * nrm.dot(Tg[i])
                if nrm.length < 1e-6:
                    nrm = frames[-1][0]
                nrm.normalize()
            frames.append((nrm.copy(), Tg[i].cross(nrm).normalized()))

        def rings_for(rad):
            RR = []
            for i in range(N):
                n_, b_ = frames[i]
                rr = rad * (rfun(i / (N - 1)) if rfun else 1.0)
                RR.append([self.v(M, P[i] + (n_ * math.cos(TAU * k / sides) + b_ * math.sin(TAU * k / sides)) * rr)
                           for k in range(sides)])
            return RR
        Ro = rings_for(r)
        Ri = rings_for(r_in) if r_in else None
        segs = N if closed else N - 1
        for i in range(segs):
            i2 = (i + 1) % N
            for k in range(sides):
                k2 = (k + 1) % sides
                self.f([Ro[i][k], Ro[i][k2], Ro[i2][k2], Ro[i2][k]])
                if Ri:
                    self.f([Ri[i][k], Ri[i2][k], Ri[i2][k2], Ri[i][k2]])
        if not closed and cap:
            if Ri:
                for k in range(sides):
                    k2 = (k + 1) % sides
                    self.f([Ro[0][k], Ri[0][k], Ri[0][k2], Ro[0][k2]])
                    self.f([Ro[-1][k], Ro[-1][k2], Ri[-1][k2], Ri[-1][k]])
            else:
                self.f(Ro[0][::-1])
                self.f(Ro[-1])

    def torus(self, R_, r, segs=24, sides=8, M=I4):
        pts = [(R_ * math.cos(TAU * k / segs), R_ * math.sin(TAU * k / segs), 0) for k in range(segs)]
        self.sweep(pts, r, sides, closed=True, M=M)

    def grid_solid(self, top, bot):
        """Two (nu x nv) point grids -> closed solid shell."""
        nu, nv = len(top), len(top[0])
        Tt = [[self.v(I4, p) for p in row] for row in top]
        Bb = [[self.v(I4, p) for p in row] for row in bot]
        for i in range(nu - 1):
            for j in range(nv - 1):
                self.f([Tt[i][j], Tt[i + 1][j], Tt[i + 1][j + 1], Tt[i][j + 1]])
                self.f([Bb[i][j], Bb[i][j + 1], Bb[i + 1][j + 1], Bb[i + 1][j]])
        rim = [(i, 0) for i in range(nu - 1)] + [(nu - 1, j) for j in range(nv - 1)] + \
              [(i, nv - 1) for i in range(nu - 1, 0, -1)] + [(0, j) for j in range(nv - 1, 0, -1)]
        for k in range(len(rim)):
            a, b = rim[k], rim[(k + 1) % len(rim)]
            self.f([Tt[a[0]][a[1]], Bb[a[0]][a[1]], Bb[b[0]][b[1]], Tt[b[0]][b[1]]])

    # --- finish
    def finish(self, name, smooth_deg=35.0, loc=(0, 0, 0)):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        th = math.radians(smooth_deg)
        for fc in bm.faces:
            fc.smooth = True
        for e in bm.edges:
            e.smooth = len(e.link_faces) == 2 and e.calc_face_angle(math.pi) < th
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(mat(m))
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = loc
        return ob


# ---------------------------------------------------------------- fasteners (write into a builder)
def pan_screw(mb, M, d=0.004):
    hr, hh = d * 0.95, d * 0.55
    mb.use('zinc').lathe([(0, 0), (hr, 0), (hr, hh * 0.45), (hr * 0.8, hh * 0.9), (hr * 0.4, hh), (0, hh)], 12, M=M)
    mb.use('black_steel')
    mb.box(hr * 1.1, d * 0.16, 0.0005, (0, 0, hh * 0.98), M)
    mb.box(d * 0.16, hr * 1.1, 0.0005, (0, 0, hh * 0.98), M)


def hex_nut(mb, M, d=0.008, h=None, material='zinc'):
    h = h or d * 0.8
    ro = 0.8 * d / math.cos(math.pi / 6)
    mb.use(material).lathe([(d * 0.5, 0), (ro * 0.88, 0), (ro, h * 0.12), (ro, h * 0.88), (ro * 0.88, h), (d * 0.5, h)],
                           6, a0=math.pi / 6, a1=math.pi / 6 + TAU, M=M)


def washer(mb, M, d=0.008, material='zinc'):
    mb.use(material).ring(d * 1.05, d * 0.55, 0, d * 0.2, 20, M)


def hex_bolt(mb, M, d=0.008, length=0.03, material='zinc'):
    """Head on +Z side of origin (bearing face at z=0), shank toward -Z."""
    h = d * 0.65
    ro = 0.8 * d / math.cos(math.pi / 6)
    mb.use(material).lathe([(0, 0), (ro * 0.9, 0), (ro, h * 0.15), (ro, h * 0.85), (ro * 0.85, h), (0, h)],
                           6, a0=math.pi / 6, a1=math.pi / 6 + TAU, M=M)
    mb.cyl(d / 2, -length, 0, 12, M)
    # thread lip: two grooves near the tip
    for k in range(3):
        z = -length + 0.0015 + k * d * 0.15
        mb.ring(d / 2 + 0.0002, d / 2 * 0.9, z, z + d * 0.06, 12, M)


# ---------------------------------------------------------------- axial fan
def axial_fan(radius=0.2, blades=3, pitch=0.26, hub_r=0.055, sweep_deg=28.0, thickness=0.003, name='fan.blade'):
    """Propeller fan, axle along local -Y (front), origin on the axle. Blades are helicoid
    (true pitch, so twist grows toward the root), forward-swept with a rounded scimitar tip and camber.
    Positive rotation about local -Y... i.e. counter-clockwise seen from the front moves the leading edge."""
    mb = MB('plastic_fan')
    r0 = hub_r * 0.92
    nu, nv = 26, 16
    for b in range(blades):
        base = TAU * b / blades
        top, bot = [], []
        for i in range(nu):
            uu = i / (nu - 1)
            rt, rb = [], []
            for j in range(nv):
                s = j / (nv - 1) - 0.5
                umax = 1 - 0.34 * max(0, 2 * s) ** 2 - 0.12 * max(0, -2 * s) ** 2
                u = uu * umax
                rr = r0 + u * (radius - r0)
                chord = 0.075 + 0.105 * math.sin(min(u, 1) * math.pi * 0.78)
                w = chord / rr
                thc = base + math.radians(sweep_deg) * u ** 1.6
                th = thc + s * w
                ax = s * w * pitch / TAU                       # helicoid
                ax += -0.18 * chord * (1 - (2 * s) ** 2) * 0.12  # camber
                ax += -0.012 * u                              # forward rake
                tk = thickness * (1 - 0.45 * u) * (0.3 + 0.7 * math.sqrt(max(0, 1 - (2 * s) ** 2))) + 0.0004
                x, z = rr * math.cos(th), rr * math.sin(th)
                rt.append(Vector((x, ax - tk / 2, z)))
                rb.append(Vector((x, ax + tk / 2, z)))
            top.append(rt)
            bot.append(rb)
        mb.grid_solid(top, bot)
    # hub (lathe about local Z, rotated so +Z points front = -Y)
    Mh = R('X', 90)
    mb.lathe([(0, -0.028), (hub_r * 0.8, -0.028), (hub_r, -0.022), (hub_r, 0.012), (hub_r * 0.93, 0.02),
              (hub_r * 0.6, 0.027), (0.016, 0.029), (0, 0.029)], 40, M=Mh)
    # hub stiffening ring and boss
    mb.ring(hub_r * 0.62, hub_r * 0.56, 0.027, 0.0295, 32, Mh)
    mb.cyl(0.011, 0.029, 0.034, 20, Mh)
    washer(mb, Mh @ T(0, 0, 0.034), 0.008)
    hex_nut(mb, Mh @ T(0, 0, 0.0356), 0.008)
    mb.use('steel').cyl(0.004, 0.042, 0.047, 12, Mh)
    # back ribs between hub and blades
    mb.use('plastic_fan')
    for k in range(6):
        a = TAU * k / 6
        mb.box(hub_r * 0.75, 0.002, 0.02, (0, 0, 0), Mh @ R('Z', math.degrees(a)) @ T(hub_r * 0.45, 0, -0.018))
    ob = mb.finish(name, 30)
    return {ob.name: ob}


# ---------------------------------------------------------------- motor
def motor(radius=0.06, length=0.075, shaft_len=0.06, shaft_d=0.008, name='motor'):
    """Electric motor with external through-bolts, rear mounting lugs and a cable gland.
    Axis local -Y (shaft points front); origin at the rear mounting face."""
    mb = MB('aluminium')
    M = R('X', 90)                    # local +Z -> world -Y (front)
    L = length
    mb.lathe([(0, 0.004), (radius * 0.7, 0.004), (radius * 0.92, 0.006), (radius, 0.014), (radius, L - 0.012),
              (radius * 0.94, L - 0.004), (radius * 0.45, L), (0.016, L + 0.006), (0, L + 0.006)], 40, M=M)
    mb.use('steel')
    for zz in (0.022, L * 0.5, L - 0.022):                 # stator band rings
        mb.ring(radius + 0.0012, radius - 0.001, zz, zz + 0.004, 40, M)
    for k in range(4):                                     # through bolts
        a = TAU * k / 4 + math.pi / 4
        x, y = (radius + 0.003) * math.cos(a), (radius + 0.003) * math.sin(a)
        mb.use('zinc').cyl(0.0022, 0.0, L - 0.004, 8, M @ T(x, y, 0))
        hex_nut(mb, M @ T(x, y, L - 0.004), 0.0045)
        mb.use('aluminium').box(0.012, 0.01, 0.006, (x * 0.97, y * 0.97, L - 0.008), M)
    # rear mounting plate with 4 lugs
    mb.use('steel')
    sq = radius * 1.05
    poly = []
    for k in range(4):
        a = math.pi / 4 + TAU * k / 4
        for da in (-0.32, 0.32):
            rr = sq * 1.25
            poly.append((rr * math.cos(a + da), rr * math.sin(a + da)))
    mb.extrude(poly, 0.0, 0.004, M)
    mb.use('black_steel').cyl(shaft_d / 2, L, L + shaft_len, 16, M)          # shaft
    mb.use('steel').ring(0.012, shaft_d / 2, L + 0.006, L + 0.010, 16, M)    # bearing seal
    # cable gland on the side
    mb.use('plastic_black').cyl(0.006, 0, 0.012, 12, M @ T(0, radius - 0.003, L * 0.4) @ R('X', -90))
    mb.cyl(0.0035, 0.012, 0.03, 10, M @ T(0, radius - 0.003, L * 0.4) @ R('X', -90))
    ob = mb.finish(name, 35)
    return {ob.name: ob}

# ---------------------------------------------------------------- housing (the cuttable part)
def housing(radius, height, wall, bore=0.0, cut=False, cut_from=270.0, cut_to=360.0, material='aluminium',
            prefix='housing'):
    """Cylindrical shell with end caps (a through-bore of radius `bore` if > 0), axis local +Z, origin at the
    bottom centre. cut=True leaves the angles cut_from..cut_to out of `<prefix>` and builds them as
    `<prefix>.quarter`, the piece a section view hides; any part made cuttable follows the same split."""
    r, h, w, b = radius, height, wall, bore
    prof = [(b, 0), (r, 0), (r, h), (b, h), (b, h - w), (r - w, h - w), (r - w, w), (b, w)]
    q = (math.radians(cut_from), math.radians(cut_to))
    out = {}
    for name, rg in ((prefix, [(q[1], q[0] + TAU)] if cut else [(0.0, TAU)]), (prefix + '.quarter', [q] if cut else [])):
        if rg:
            mb = MB(material)
            mb.lathe_ranges(prof, 64, rg)
            out[name] = mb.finish(name, 35)
    return out

# ---------------------------------------------------------------- pipes and wires
def pipe(name, path, radius, bend_r=None, material='copper', sides=12, braze=()):
    """Tube along a polyline with bends of radius bend_r (default 2.5 x OD). braze: indices of path
    points (0 / -1) that get a brazed socket ring."""
    bend_r = bend_r or radius * 5
    P = fillet(path, bend_r, 8)
    mb = MB(material)
    mb.sweep(P, radius, sides)
    for idx in braze:
        a = P[idx]
        b = P[1] if idx == 0 else P[-2]
        t = (b - a).normalized()
        mb.use('brass').sweep([a + t * 0.001, a + t * 0.004], radius * 1.25, sides)
        mb.use(material)
    ob = mb.finish(name, 40)
    return {ob.name: ob}


def wires(name, paths, material='wire_red', r=0.0012):
    mb = MB(material)
    for p in paths:
        mb.sweep(fillet(p, 0.02, 6), r, 6)
    ob = mb.finish(name, 50)
    return {ob.name: ob}
