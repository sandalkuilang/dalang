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
    'sheet_metal':   ((0.70, 0.72, 0.73), 0.45, 0.6),   # galvanised steel inside
    'casing_paint':  ((0.86, 0.86, 0.83), 0.50, 0.0),   # painted outer casing
    'copper':        ((0.72, 0.40, 0.24), 0.35, 1.0),
    'aluminium_fin': ((0.17, 0.18, 0.19), 0.55, 0.6),   # coated fins read dark
    'aluminium':     ((0.74, 0.75, 0.76), 0.35, 1.0),
    'black_steel':   ((0.035, 0.035, 0.04), 0.45, 0.3),
    'steel':         ((0.52, 0.53, 0.55), 0.35, 1.0),
    'zinc':          ((0.80, 0.80, 0.78), 0.30, 1.0),   # fasteners
    'brass':         ((0.78, 0.62, 0.32), 0.30, 1.0),
    'plastic_fan':   ((0.80, 0.77, 0.68), 0.50, 0.0),
    'plastic_black': ((0.06, 0.06, 0.06), 0.50, 0.0),
    'plastic_white': ((0.90, 0.90, 0.88), 0.50, 0.0),
    'rubber':        ((0.03, 0.03, 0.03), 0.85, 0.0),
    'foam':          ((0.20, 0.20, 0.21), 0.90, 0.0),
    'pcb_green':     ((0.06, 0.33, 0.16), 0.50, 0.0),
    'capacitor':     ((0.08, 0.12, 0.38), 0.40, 0.0),
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


# ---------------------------------------------------------------- finned coil
def finned_coil(width, height, depth, rows=2, fin_pitch=0.0014, bend='L', side_len=0.2, bend_r=0.035,
                tube_d=0.007, tube_pitch=0.021, fin_t=0.00015, ext=0.012, prefix='coil'):
    """Finned-tube heat exchanger. Local frame: back leg centre line along +X at y=0, coil from z=0 up.
    bend='L' adds a leg along -Y at x=-width/2 (hairpin end at its front tip); 'straight' is one slab.
    Tubes run as one serpentine circuit staggered across rows: hairpins at the path start, brazed
    return bends at the path end; ports 'in' (top) and 'out' (bottom) at the return-bend end."""
    if bend == 'L':
        x0 = -width / 2
        P = fillet([(x0, -side_len, 0), (x0, 0, 0), (width / 2, 0, 0)], bend_r, 14)
    else:
        P = [Vector((-width / 2, 0, 0)), Vector((width / 2, 0, 0))]
    L = path_len(P)
    row_pitch = depth / rows

    def frame(s):
        p, t = path_at(P, s)
        n = Vector((-t.y, t.x, 0))
        return p, t, n

    # tubes (sequence staggered across rows); the fins are punched for them
    step = tube_pitch / rows
    N = int((height - tube_pitch) / step) + 1
    if N % 2:
        N -= 1
    z_first = (height - (N - 1) * step) / 2
    r = tube_d / 2

    # fins: the outer `open_fins` at each end (the faces a camera sees) are punched plates with a drawn collar round
    # every tube; the fins between them are plain plates (no face of them is ever seen, and 600 punched fins would
    # cost ~1M triangles)
    mf = MB('aluminium_fin')
    ep = 0.004
    starts = []
    s = ep + 0.003
    while s < L - ep - 0.003:
        starts.append(s)
        s += fin_pitch
    nfins = len(starts)
    open_fins = 3
    cell_h = tube_pitch                                  # one column of a row: its tubes are tube_pitch apart
    for i, s_ in enumerate(starts):
        p, t, n = frame(s_)
        if open_fins <= i < nfins - open_fins:
            mf.box(fin_t, depth + 0.004, height, (0, 0, height / 2), basis(p, t, n, (0, 0, 1)))
            continue
        Mp = basis(p, n, Vector((0, 0, 1)), t)          # plate local x across the depth, y up, z through the fin
        for k in range(N):
            o = ((k % rows) - (rows - 1) / 2) * row_pitch
            zc = z_first + k * step
            x0, x1 = o - row_pitch / 2, o + row_pitch / 2
            y0, y1 = max(0.0, zc - cell_h / 2), min(height, zc + cell_h / 2)
            mf.plate_hole([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], (o, zc), hole_r=r * 1.04, t=fin_t, segs=20, M=Mp @ T(0, 0, -fin_t / 2))
            mf.ring(r * 1.3, r * 1.04, -0.0007, 0.0007, 16, Mp @ T(o, zc, 0))   # the drawn collar
        for c in range(rows):                                                  # top and bottom margins of each column
            o = (c - (rows - 1) / 2) * row_pitch
            ks = [k for k in range(N) if k % rows == c]
            lo, hi = z_first + ks[0] * step - cell_h / 2, z_first + ks[-1] * step + cell_h / 2
            if lo > 1e-5:
                mf.box(row_pitch, lo, fin_t, (o, lo / 2, 0), Mp)
            if hi < height - 1e-5:
                mf.box(row_pitch, height - hi, fin_t, (o, (height + hi) / 2, 0), Mp)
    fins = mf.finish(f'{prefix}.fins', 20)
    p0, t0, _ = frame(0.0)
    p1, t1, _ = frame(L)
    # offset polyline per row
    def tube_line(k):
        row = k % rows
        o = (row - (rows - 1) / 2) * row_pitch
        z = z_first + k * step
        pts = []
        for i, q in enumerate(P):
            if i == 0:
                tt = (P[1] - P[0]).normalized()
            elif i == len(P) - 1:
                tt = (P[-1] - P[-2]).normalized()
            else:
                tt = (P[i + 1] - P[i - 1]).normalized()
            n = Vector((-tt.y, tt.x, 0))
            pts.append(Vector((q.x, q.y, z)) + n * o)
        start = pts[0] - t0 * ext
        end = pts[-1] + t1 * ext
        return [start] + pts + [end]
    lines = [tube_line(k) for k in range(N)]
    mt = MB('copper')
    for ln in lines:
        mt.sweep(ln, r, 10)

    def u_bend(mb, a, b, out, sides=10, n=10):
        c = (a + b) / 2
        u = a - c
        pts = [c + u * math.cos(math.pi * k / n) + out * u.length * math.sin(math.pi * k / n) for k in range(n + 1)]
        mb.sweep(pts, r, sides, cap=False)
    for k in range(0, N - 1, 2):                      # hairpins at the start
        u_bend(mt, lines[k][0], lines[k + 1][0], -t0)
    tubes = mt.finish(f'{prefix}.tubes', 40)

    mr = MB('copper')
    for k in range(1, N - 1, 2):                      # brazed return bends at the end
        a, b = lines[k][-1], lines[k + 1][-1]
        u_bend(mr, a, b, t1)
        for q in (a, b):
            M = basis(q, Vector((0, 0, 1)).cross(t1), Vector((0, 0, 1)), t1)
            mr.use('copper').ring(r * 1.22, r * 0.9, -0.006, 0.0, 12, M)      # socket
            mr.use('brass').torus(r * 1.25, r * 0.28, 12, 6, T(0, 0, -0.006) if False else M @ T(0, 0, -0.006))
            mr.use('copper')
    bends = mr.finish(f'{prefix}.bends', 40)

    # tube sheets (end plates) with a mounting flange
    me_ = MB('sheet_metal')
    for s_, sgn in ((ep, -1), (L - ep, 1)):
        p, t, n = frame(s_)
        M = basis(p, t, n, (0, 0, 1))
        me_.box(0.001, depth + 0.016, height + 0.012, (0, 0, height / 2), M)
        me_.box(0.022, 0.001, height + 0.012, (sgn * 0.011, (depth + 0.016) / 2, height / 2), M)
        me_.box(0.022, 0.001, height + 0.012, (sgn * 0.011, -(depth + 0.016) / 2, height / 2), M)
        for zz in (0.03, height / 2, height - 0.03):
            pan_screw(me_, M @ T(sgn * 0.012, (depth + 0.016) / 2 + 0.0005, zz) @ R('X', -90), 0.004)
            me_.use('sheet_metal')
    # top/bottom fin guards along the path (thin channels)
    for zz in (-0.003, height + 0.003):
        pts = [Vector((q.x, q.y, zz)) for q in P]
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            t = (b - a)
            if t.length < 1e-6:
                continue
            tn = t.normalized()
            M = basis((a + b) / 2, tn, Vector((-tn.y, tn.x, 0)), (0, 0, 1))
            me_.box(t.length + 0.0005, depth + 0.006, 0.002, (0, 0, 0), M)
    plates = me_.finish(f'{prefix}.endplates', 30)

    info = {'in': lines[N - 1][-1], 'out': lines[0][-1], 'dir_end': t1, 'fins': nfins, 'tubes': N}
    return {fins.name: fins, tubes.name: tubes, bends.name: bends, plates.name: plates, '_info': info}


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


# ---------------------------------------------------------------- motor + bracket
def motor(radius=0.06, length=0.075, shaft_len=0.06, shaft_d=0.008, name='fan.motor'):
    """Fan motor with external through-bolts, rear mounting lugs and a cable gland.
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


def fan_motor_bracket(height, width=0.14, motor_z=0.25, plate_h=0.15, flange=0.02, foot=0.06, name='fan.bracket'):
    """Pressed-steel motor post: two flanged rails, a motor plate and two windows, bent feet and a top tab.
    Local: front face at y=0 (motor side), flanges toward +Y, base at z=0, centred on x=0."""
    mb = MB('sheet_metal')
    t = 0.0012
    hw = width / 2
    rail = 0.022
    for sx in (-1, 1):
        xo = sx * (hw - rail / 2)
        mb.boxr(xo - rail / 2, xo + rail / 2, 0, t, 0.0, height)                      # rail face
        xe = sx * hw
        mb.boxr(xe - t / 2, xe + t / 2, 0, flange, 0.0, height)                      # side flange
        mb.boxr(xe - t / 2 - sx * 0.008, xe + t / 2 - sx * 0.008, flange - t, flange, 0.0, height)  # return lip
        # stiffening bead
        mb.boxr(xo - 0.003, xo + 0.003, -0.0015, 0.0, 0.03, height - 0.03)
    # cross members
    for z0, z1 in ((0.0, 0.035), (motor_z - plate_h / 2, motor_z + plate_h / 2), (height - 0.03, height)):
        mb.boxr(-hw + rail, hw - rail, 0, t, z0, z1)
    # window edge flanges (show the pressing)
    for zz in (0.035, motor_z - plate_h / 2, motor_z + plate_h / 2, height - 0.03):
        mb.boxr(-hw + rail, hw - rail, 0, 0.008, zz - t / 2, zz + t / 2)
    # feet (bent forward) and top tab (bent back)
    for sx in (-1, 1):
        xe = sx * (hw - rail / 2)
        mb.boxr(xe - 0.02, xe + 0.02, -foot, 0, 0, t)
        mb.boxr(xe - 0.02, xe + 0.02, -foot, -foot + t, 0, 0.012)
        pan_screw(mb, T(xe, -foot * 0.55, t), 0.005)
        mb.use('sheet_metal')
    mb.boxr(-hw * 0.6, hw * 0.6, 0, 0.03, height - t, height)
    for sx in (-1, 1):
        pan_screw(mb, T(sx * hw * 0.35, 0.02, height), 0.004)
        mb.use('sheet_metal')
    ob = mb.finish(name, 30)
    return {ob.name: ob}


# ---------------------------------------------------------------- rotary compressor
def _sub_ranges(ranges, cut):
    out = []
    for a0, a1 in ranges:
        c0, c1 = cut
        if c1 <= a0 or c0 >= a1:
            out.append((a0, a1))
            continue
        if c0 > a0:
            out.append((a0, c0))
        if c1 < a1:
            out.append((c1, a1))
    return out


def rotary_compressor(radius=0.055, height=0.24, cut=False, cut_from=270.0, cut_to=360.0,
                      terminal_deg=240.0, suction_deg=196.0, prefix='compressor'):
    """Hermetic rolling-piston rotary compressor, origin at the centre of the shell bottom (dome).
    Shell (3 mm, welded domes, beads), foot plate with three rubber-mounted feet, terminal box and
    stubs; inside a stator (slots, flats, copper in slots, end turns), rotor with end rings and
    balance weights, crankshaft with eccentric, rolling piston + vane + spring, cylinder block,
    main/sub bearings and discharge muffler. cut=True splits each cuttable part into the main part
    and a '<name>.quarter' object (angles cut_from..cut_to) that can be hidden for a section view."""
    Rr, H = radius, height
    tw = 0.003
    dd = 0.034                               # dome depth
    out = {}
    q = (math.radians(cut_from), math.radians(cut_to))
    full = [(q[1], q[0] + TAU)] if cut else [(0.0, TAU)]
    qtr = [q] if cut else []

    def both(name, build, smooth=35):
        mb = MB()
        build(mb, full)
        ob = mb.finish(name, smooth)
        out[name] = ob
        if cut:
            mb2 = MB()
            build(mb2, qtr)
            ob2 = mb2.finish(name + '.quarter', smooth)
            out[ob2.name] = ob2

    def ell(r0, z0, depth, up, n=8):
        pts = []
        for k in range(n + 1):
            a = (math.pi / 2) * k / n
            pts.append((r0 * math.cos(a), z0 + (depth * math.sin(a) if up else -depth * math.sin(a))))
        return pts

    # shell profile: outer up, inner down (closed)
    outer = ell(Rr, dd, dd, False)[::-1] + ell(Rr, H - dd, dd, True)
    inner = [(rr * (Rr - tw) / Rr, zz + (-tw if zz > H / 2 else tw)) for rr, zz in outer]
    shell_prof = outer + inner[::-1]

    def b_shell(mb, rg):
        mb.use('black_steel')
        mb.lathe_ranges(shell_prof, 48, rg)
        for zz in (dd, H - dd):              # weld beads
            mb.lathe_ranges([(Rr - 0.0005, zz - 0.0025), (Rr + 0.0018, zz - 0.0012), (Rr + 0.0018, zz + 0.0012),
                             (Rr - 0.0005, zz + 0.0025)], 48, rg)
    both(f'{prefix}.shell', b_shell)

    # foot plate, grommets, studs, nuts (not cut)
    mb = MB('black_steel')
    zf = 0.010
    poly = []
    for k in range(3):
        a = math.radians(90 + 120 * k)
        for da in (-0.55, -0.2, 0.2, 0.55):
            rr = Rr * (0.95 if abs(da) > 0.4 else 1.45)
            poly.append((rr * math.cos(a + da), rr * math.sin(a + da)))
    mb.extrude(poly, zf, zf + 0.003)
    feet_pts = []
    for k in range(3):
        a = math.radians(90 + 120 * k)
        x, y = Rr * 1.32 * math.cos(a), Rr * 1.32 * math.sin(a)
        feet_pts.append((x, y))
        mb.use('rubber').lathe([(0.004, zf - 0.018), (0.011, zf - 0.018), (0.011, zf - 0.004), (0.008, zf - 0.002),
                                (0.008, zf + 0.004), (0.010, zf + 0.006), (0.010, zf + 0.011), (0.004, zf + 0.011)],
                               20, M=T(x, y, 0))
        mb.use('zinc').cyl(0.003, zf - 0.02, zf + 0.022, 10, T(x, y, 0))
        washer(mb, T(x, y, zf + 0.011), 0.008)
        hex_nut(mb, T(x, y, zf + 0.0126), 0.006)
    ob = mb.finish(f'{prefix}.feet', 35)
    out[ob.name] = ob

    # terminal box on the top dome + stubs (not cut)
    mb = MB('black_steel')
    ta = math.radians(terminal_deg)
    tr = Rr * 0.6
    zt = H - dd + dd * math.sqrt(max(0, 1 - (tr / Rr) ** 2))
    Mt = T(tr * math.cos(ta), tr * math.sin(ta), zt - 0.004) @ R('Z', terminal_deg)
    mb.use('steel').lathe([(0, 0), (0.012, 0), (0.012, 0.004), (0, 0.004)], 20, M=Mt)       # hermetic header
    for k in range(3):
        a = TAU * k / 3
        mb.use('plastic_white').cyl(0.0025, 0.004, 0.007, 8, Mt @ T(0.006 * math.cos(a), 0.006 * math.sin(a), 0))
        mb.use('steel').cyl(0.0011, 0.007, 0.013, 6, Mt @ T(0.006 * math.cos(a), 0.006 * math.sin(a), 0))
    mb.use('plastic_black')
    mb.boxr(-0.022, 0.022, -0.017, 0.017, 0.003, 0.004, Mt)                               # cover base
    mb.boxr(-0.020, 0.020, -0.015, 0.015, 0.004, 0.024, Mt)                               # cover
    mb.boxr(-0.016, 0.016, -0.011, 0.011, 0.024, 0.026, Mt)
    mb.cyl(0.005, 0, 0.008, 12, Mt @ T(0.020, 0, 0.012) @ R('Y', 90))                     # gland
    hex_nut(mb, Mt @ T(0, 0, 0.026), 0.004, material='zinc')
    ob = mb.finish(f'{prefix}.terminal', 35)
    out[ob.name] = ob

    # ---- internals (local z from shell bottom)
    zb0, zb1 = 0.040, 0.068                  # cylinder block
    rb_bore = 0.026
    ecc = 0.005
    rp_o, rp_i = rb_bore - ecc, 0.0135
    vane_deg = 90.0
    crank_deg = vane_deg + 180.0             # piston touching bore opposite the vane: shows the vane gap
    va = math.radians(vane_deg)

    def b_pump(mb, rg):
        mb.use('steel')
        slot = (va - 0.035, va + 0.035)
        rgs = []
        for a0, a1 in rg:
            for off in (0, TAU, -TAU):
                pass
            r2 = _sub_ranges([(a0, a1)], slot)
            r2 = _sub_ranges(r2, (slot[0] + TAU, slot[1] + TAU))
            rgs += r2
        mb.lathe_ranges([(rb_bore, zb0), (Rr - tw, zb0), (Rr - tw, zb1), (rb_bore, zb1)], 64, rgs)
        mb.use('aluminium')                  # sub bearing
        mb.lathe_ranges([(0.0095, 0.022), (0.016, 0.022), (0.016, 0.034), (0.038, 0.034), (0.038, zb0), (0.0095, zb0)],
                        48, rg)
        mb.use('steel')                      # main bearing flange + hub
        mb.lathe_ranges([(0.0095, zb1), (0.042, zb1), (0.042, zb1 + 0.008), (0.019, zb1 + 0.012), (0.017, 0.098),
                         (0.0095, 0.098)], 48, rg)
        mb.use('sheet_metal')                # discharge muffler cup
        mb.lathe_ranges([(0.019, zb1 + 0.006), (0.036, zb1 + 0.007), (0.040, zb1 + 0.012), (0.040, zb1 + 0.020),
                         (0.022, zb1 + 0.026), (0.020, zb1 + 0.026), (0.020, zb1 + 0.025), (0.0385, zb1 + 0.0195),
                         (0.0385, zb1 + 0.0125), (0.035, zb1 + 0.0085), (0.019, zb1 + 0.0075)], 48, rg)
        mb.use('zinc')
        for k in range(5):                   # bearing bolts
            a = math.radians(30 + 72 * k)
            if any(a0 <= a <= a1 or a0 <= a + TAU <= a1 for a0, a1 in rg):
                mb.cyl(0.0035, zb1 + 0.012, zb1 + 0.018, 6, T(0.034 * math.cos(a), 0.034 * math.sin(a), 0))
    both(f'{prefix}.pump', b_pump)

    # stator: slotted laminated core with flats
    zs0, zs1 = 0.112, 0.190
    rs_b, rs_s, nslot = 0.0285, 0.040, 24

    def r_in(a):
        f = (a / TAU * nslot) % 1.0
        return rs_b if (f < 0.28 or f > 0.72) else rs_s

    def r_out(a):
        ro = Rr - tw
        for k in range(4):
            fa = TAU * k / 4 + math.pi / 4
            d = math.cos(a - fa)
            if d > 0.1:
                ro = min(ro, (Rr - tw - 0.004) / d)
        return ro

    def b_stator(mb, rg):
        mb.use('steel')
        for a0, a1 in rg:
            n = int(nslot * 12 * (a1 - a0) / TAU) + 1
            angs = [a0 + (a1 - a0) * k / n for k in range(n + 1)]
            ring = [(a, r_in(a), r_out(a)) for a in angs]
            V = []
            for a, ri, ro in ring:
                c, s = math.cos(a), math.sin(a)
                V.append([mb.v(I4, (ri * c, ri * s, zs0)), mb.v(I4, (ro * c, ro * s, zs0)),
                          mb.v(I4, (ro * c, ro * s, zs1)), mb.v(I4, (ri * c, ri * s, zs1))])
            fullc = abs((a1 - a0) - TAU) < 1e-6
            m = len(V) - (1 if fullc else 1)
            for i in range(m):
                A, B = V[i], V[i + 1]
                for k in range(4):
                    k2 = (k + 1) % 4
                    mb.f([A[k], A[k2], B[k2], B[k]])
            if not fullc:
                mb.f(V[0])
                mb.f(V[-1][::-1])
            # lamination stack grooves (every 8 mm) on the outside
            for zz in [zs0 + 0.008 * k for k in range(1, 10)]:
                mb.lathe_ranges([(Rr - tw - 0.0045, zz - 0.0004), (Rr - tw - 0.0035, zz - 0.0004),
                                 (Rr - tw - 0.0035, zz + 0.0004), (Rr - tw - 0.0045, zz + 0.0004)], 48, [(a0, a1)])
    both(f'{prefix}.stator', b_stator)

    def b_wind(mb, rg):
        mb.use('copper')
        warp = lambda x, y, z: (x * (1 + 0.06 * math.cos(6 * math.atan2(y, x))),
                                y * (1 + 0.06 * math.cos(6 * math.atan2(y, x))), z)
        for z0, z1 in ((zs0 - 0.017, zs0), (zs1, zs1 + 0.018)):
            mid = (z0 + z1) / 2
            prof = [(0.031, z0 + 0.003), (0.035, z0), (0.043, z0), (0.047, z0 + 0.004), (0.047, z1 - 0.004),
                    (0.043, z1), (0.035, z1), (0.031, z1 - 0.003)]
            if z0 > zs0:
                prof = [(r_, zs1 + (zs1 + 0.018 - zz) - 0.0) for r_, zz in prof][::-1]
                prof = [(r_, zz - 0.018 + 0.0) for r_, zz in prof]
                prof = [(r_, zz) for r_, zz in [(0.031, z0 + 0.003), (0.035, z0), (0.043, z0), (0.047, z0 + 0.004),
                                                (0.047, z1 - 0.004), (0.043, z1), (0.035, z1), (0.031, z1 - 0.003)]]
            mb.lathe_ranges(prof, 72, rg, warp=warp)
        # copper filling the slots (shows on the section face)
        for k in range(nslot):
            a = (k + 0.5) / nslot * TAU
            if any(a0 <= a <= a1 or a0 <= a + TAU <= a1 for a0, a1 in rg):
                M = R('Z', math.degrees(a))
                mb.boxr(rs_b + 0.002, rs_s - 0.0005, -0.0028, 0.0028, zs0 - 0.001, zs1 + 0.001, M)
        mb.use('plastic_white')              # binding cord / phase insulation ring
        mb.lathe_ranges([(0.0465, zs1 + 0.008), (0.0475, zs1 + 0.008), (0.0475, zs1 + 0.011), (0.0465, zs1 + 0.011)],
                        72, rg)
    both(f'{prefix}.windings', b_wind)

    # rotor (not cut): core, aluminium end rings, balance weights, rivets
    mb = MB('steel')
    zr0, zr1 = zs0 - 0.002, zs1 + 0.002
    mb.ring(rs_b - 0.0007, 0.0095, zr0, zr1, 48)
    mb.use('aluminium')
    mb.ring(rs_b - 0.001, 0.016, zr0 - 0.005, zr0, 48)
    mb.ring(rs_b - 0.001, 0.016, zr1, zr1 + 0.005, 48)
    mb.use('brass')
    mb.lathe([(0.012, zr1 + 0.005), (0.026, zr1 + 0.005), (0.026, zr1 + 0.011), (0.012, zr1 + 0.011)], 16,
             math.radians(crank_deg + 180 - 70), math.radians(crank_deg + 180 + 70))
    mb.lathe([(0.012, zr0 - 0.011), (0.026, zr0 - 0.011), (0.026, zr0 - 0.005), (0.012, zr0 - 0.005)], 16,
             math.radians(crank_deg - 70), math.radians(crank_deg + 70))
    mb.use('zinc')
    for k in range(4):
        a = TAU * k / 4 + 0.4
        mb.cyl(0.002, zr0 - 0.012, zr1 + 0.012, 8, T(0.019 * math.cos(a), 0.019 * math.sin(a), 0))
    ob = mb.finish(f'{prefix}.rotor', 35)
    out[ob.name] = ob

    # crankshaft with eccentric and oil pick-up
    mb = MB('steel')
    ca = math.radians(crank_deg)
    mb.cyl(0.0095, 0.020, zr1 + 0.016, 24)
    mb.cyl(rp_i - 0.0002, zb0 + 0.0005, zb1 - 0.0005, 32, T(ecc * math.cos(ca), ecc * math.sin(ca), 0))
    mb.use('black_steel').lathe([(0, 0.008), (0.005, 0.008), (0.006, 0.014), (0.006, 0.021), (0, 0.021)], 12)
    mb.use('black_steel').ring(0.0097, 0.004, zr1 + 0.016, zr1 + 0.017, 16)
    ob = mb.finish(f'{prefix}.shaft', 35)
    out[ob.name] = ob

    # rolling piston + vane + spring
    mb = MB('steel')
    mb.ring(rp_o, rp_i, zb0 + 0.0003, zb1 - 0.0003, 40, T(ecc * math.cos(ca), ecc * math.sin(ca), 0))
    # vane from piston contact to the slot
    contact = ecc * math.cos(ca - va) + math.sqrt(rp_o ** 2 - (ecc * math.sin(ca - va)) ** 2)
    v_in, v_out = contact, Rr - tw - 0.006
    Mv = R('Z', vane_deg)
    mb.use('black_steel').boxr(v_in, v_out, -0.0018, 0.0018, zb0 + 0.0005, zb1 - 0.0005, Mv)
    pts = [(v_out + (Rr - tw - 0.0005 - v_out) * k / 40, 0.0028 * math.cos(k * 1.2), (zb0 + zb1) / 2 +
            0.0028 * math.sin(k * 1.2)) for k in range(41)]
    mb.use('zinc').sweep(pts, 0.0005, 5, M=Mv)
    ob = mb.finish(f'{prefix}.piston', 35)
    out[ob.name] = ob

    # stubs welded into the shell: suction (side, at the cylinder) and discharge (top)
    mb = MB('copper')
    sa = math.radians(suction_deg)
    mb.ring(0.0065, 0.0050, 0, 0.018, 16, T((Rr - 0.004) * math.cos(sa), (Rr - 0.004) * math.sin(sa), (zb0 + zb1) / 2)
            @ R('Z', suction_deg) @ R('Y', 90))
    mb.use('steel').ring(0.0085, 0.0062, 0, 0.004, 16,
                         T((Rr - 0.001) * math.cos(sa), (Rr - 0.001) * math.sin(sa), (zb0 + zb1) / 2)
                         @ R('Z', suction_deg) @ R('Y', 90))
    mb.use('copper').ring(0.0048, 0.0036, H - 0.006, H + 0.016, 16)
    mb.use('steel').ring(0.0068, 0.0046, H - 0.002, H + 0.003, 16)
    ob = mb.finish(f'{prefix}.stubs', 35)
    out[ob.name] = ob

    out['_info'] = {
        'suction': Vector(((Rr + 0.014) * math.cos(sa), (Rr + 0.014) * math.sin(sa), (zb0 + zb1) / 2)),
        'suction_dir': Vector((math.cos(sa), math.sin(sa), 0)),
        'discharge': Vector((0, 0, H + 0.016)),
        'terminal': Vector(Mt.translation) + Vector((0, 0, 0.026)),
        'feet': feet_pts,
    }
    return out


def accumulator(radius=0.035, height=0.16, name='compressor.accumulator'):
    """Suction accumulator: capsule with welded domes, inlet stub on top, outlet stub below.
    Origin at the bottom of the lower dome."""
    mb = MB('black_steel')
    d = radius * 0.55
    prof = [(0, 0)]
    for k in range(1, 9):
        a = (math.pi / 2) * k / 8
        prof.append((radius * math.sin(a), d - d * math.cos(a)))
    for k in range(0, 9):
        a = (math.pi / 2) * k / 8
        prof.append((radius * math.cos(a), height - d + d * math.sin(a)))
    prof.append((0, height))
    mb.lathe(prof, 40)
    for zz in (d, height - d, height * 0.5):
        mb.ring(radius + 0.0012, radius - 0.001, zz - 0.0015, zz + 0.0015, 40)
    mb.use('copper').ring(0.0055, 0.0042, height - 0.004, height + 0.018, 16)
    mb.use('copper').ring(0.0055, 0.0042, -0.018, 0.004, 16)
    mb.use('steel').ring(0.0075, 0.0052, height - 0.002, height + 0.002, 16)
    mb.use('steel').ring(0.0075, 0.0052, -0.002, 0.002, 16)
    ob = mb.finish(name, 35)
    return {ob.name: ob, '_info': {'in': Vector((0, 0, height + 0.018)), 'out': Vector((0, 0, -0.018))}}


def clamp_band(centers_radii, z, width=0.016, name='compressor.clamp'):
    """Sheet strap wrapped round two cylinders (figure-free loop round both) with a bolt tab."""
    mb = MB('zinc')
    (c1, r1), (c2, r2) = centers_radii
    c1, c2 = Vector(c1), Vector(c2)
    pts = []
    d = (c2 - c1).normalized()
    nrm = Vector((-d.y, d.x, 0))
    for k in range(25):     # around cylinder 2 (far side)
        a = math.atan2(nrm.y, nrm.x) - math.pi * k / 24
        pts.append(c2 + Vector((math.cos(a), math.sin(a), 0)) * (r2 + 0.0015))
    for k in range(25):
        a = math.atan2(-nrm.y, -nrm.x) - math.pi * k / 24
        pts.append(c1 + Vector((math.cos(a), math.sin(a), 0)) * (r1 + 0.0015))
    V = []
    for p in pts:
        V.append((mb.v(I4, (p.x, p.y, z - width / 2)), mb.v(I4, (p.x, p.y, z + width / 2))))
    n = len(V)
    for i in range(n):
        j = (i + 1) % n
        mb.f([V[i][0], V[j][0], V[j][1], V[i][1]])
    # thickness by second loop
    V2 = []
    for p in pts:
        c = c2 if (p - c2).length < (p - c1).length else c1
        q = c + (p - c).normalized() * ((p - c).length + 0.0008)
        V2.append((mb.v(I4, (q.x, q.y, z - width / 2)), mb.v(I4, (q.x, q.y, z + width / 2))))
    for i in range(n):
        j = (i + 1) % n
        mb.f([V2[i][0], V2[i][1], V2[j][1], V2[j][0]])
        mb.f([V[i][0], V2[i][0], V2[j][0], V[j][0]])
        mb.f([V[i][1], V[j][1], V2[j][1], V2[i][1]])
    mid = (c1 + c2) / 2 + nrm * (max(r1, r2) * 0.75)
    hex_bolt(mb, place(mid + nrm * 0.006, nrm), 0.005, 0.012)
    ob = mb.finish(name, 40)
    return {ob.name: ob}


# ---------------------------------------------------------------- pipes, insulation, valves
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


def insulation(name, path, r_out, r_in, bend_r=None, sides=14):
    P = fillet(path, bend_r or r_out * 2.5, 8)
    mb = MB('foam')
    mb.sweep(P, r_out, sides, r_in=r_in)
    ob = mb.finish(name, 50)
    return {ob.name: ob}


def flare_nut(size=0.00635, name='flare'):
    """Flare nut for a tube of OD `size`: hex flats with chamfers, round collar, internal thread
    lip and the flared tube cone. Axis local +X, origin at the seat (face toward -X)."""
    mb = MB('brass')
    M = R('Y', 90)                       # local +Z -> +X
    af = size * 2.6 + 0.006              # across flats
    ro = af / 2 / math.cos(math.pi / 6)
    Lh = size * 1.6 + 0.006
    thr = size * 1.45 + 0.002            # thread radius
    mb.lathe([(thr, 0), (ro * 0.9, 0), (ro, 0.0015), (ro, Lh - 0.0015), (ro * 0.9, Lh), (size / 2 + 0.0004, Lh),
              (size / 2 + 0.0004, Lh - 0.003), (thr * 0.8, Lh * 0.45), (thr * 0.8, 0.002)], 6,
             a0=math.pi / 6, a1=math.pi / 6 + TAU, M=M)
    mb.lathe([(size / 2 + 0.0004, Lh), (size * 0.9 + 0.002, Lh), (size * 0.8 + 0.002, Lh + 0.006),
              (size / 2 + 0.0004, Lh + 0.006)], 20, M=M)
    # thread lip visible at the open end
    for k in range(3):
        z = 0.0004 + k * 0.0012
        mb.ring(thr + 0.0002, thr - 0.0004, z, z + 0.0006, 20, M)
    mb.use('copper').lathe([(size / 2, 0.002), (size / 2 + 0.0012, 0.0045), (size / 2, Lh + 0.012), (size / 2 - 0.0008, Lh + 0.012),
                            (size / 2 - 0.0008, 0.0045), (size / 2 - 0.0008, 0.002)], 16, M=M)
    ob = mb.finish(name, 35)
    return {ob.name: ob, '_info': {'tube_end': Vector((Lh + 0.012, 0, 0))}}


def service_valve(size=0.00635, kind='2way', name='valve', stub_len=0.022):
    """Packed service valve. Local: flare port +X (male thread + flare cone), copper stub -X,
    stem + hex cap toward -Y, 3-way adds a Schrader service port with cap on +Z; mounting plate
    with two bolts at +Y. Origin at body centre."""
    mb = MB('brass')
    s = 0.020 + size * 1.2
    mb.box(s, s, s * 1.15, (0, 0, 0))
    Mx = R('Y', 90)
    # flare port: hex shoulder, male thread with grooves, flare cone
    hx = s * 0.42
    mb.lathe([(0, s / 2), (hx, s / 2), (hx, s / 2 + 0.006), (0, s / 2 + 0.006)], 6, M=Mx)
    tr = size * 1.45 + 0.002
    mb.cyl(tr, s / 2 + 0.006, s / 2 + 0.02, 20, Mx)
    for k in range(6):
        z = s / 2 + 0.0075 + k * 0.0021
        mb.ring(tr + 0.0007, tr - 0.0001, z, z + 0.001, 20, Mx)
    mb.lathe([(0, s / 2 + 0.02), (tr * 0.85, s / 2 + 0.02), (size / 2 + 0.001, s / 2 + 0.024), (0, s / 2 + 0.024)], 20, M=Mx)
    # stub to the unit
    mb.use('copper').ring(size / 2 + 0.0015, size / 2, -s / 2 - stub_len, -s / 2 + 0.002, 16, Mx)
    mb.use('brass').ring(size / 2 + 0.003, size / 2 + 0.001, -s / 2 - 0.004, -s / 2 + 0.001, 16, Mx)
    # stem bonnet + cap (toward -Y)
    My = R('X', 90)
    mb.cyl(s * 0.36, s / 2, s / 2 + 0.008, 24, My)
    for k in range(4):
        z = s / 2 + 0.0085 + k * 0.0018
        mb.ring(s * 0.36 + 0.0006, s * 0.33, z, z + 0.0009, 24, My)
    capr = s * 0.42 / math.cos(math.pi / 6)
    mb.lathe([(0, s / 2 + 0.008), (capr * 0.92, s / 2 + 0.008), (capr, s / 2 + 0.010), (capr, s / 2 + 0.022),
              (capr * 0.85, s / 2 + 0.025), (0, s / 2 + 0.025)], 6, a0=math.pi / 6, a1=math.pi / 6 + TAU, M=My)
    if kind == '3way':
        mb.cyl(0.0055, s * 0.575, s * 0.575 + 0.012, 16)
        for k in range(4):
            z = s * 0.575 + 0.003 + k * 0.0018
            mb.ring(0.0062, 0.0054, z, z + 0.0009, 16)
        mb.use('plastic_black').lathe([(0, s * 0.575 + 0.008), (0.0075, s * 0.575 + 0.008), (0.0075, s * 0.575 + 0.022),
                                       (0.006, s * 0.575 + 0.024), (0, s * 0.575 + 0.024)], 6,
                                      a0=0, a1=TAU, M=I4)
    # mounting plate + bolts (toward +Y)
    mb.use('sheet_metal').box(s * 1.6, 0.002, s * 2.0, (0, s / 2 + 0.001, 0))
    for sz in (-1, 1):
        hex_bolt(mb, place((0, s / 2 + 0.002, sz * s * 0.7), (0, 1, 0)), 0.005, 0.01)
    ob = mb.finish(name, 35)
    return {ob.name: ob, '_info': {'flare': Vector((s / 2 + 0.024, 0, 0)), 'stub': Vector((-s / 2 - stub_len, 0, 0)),
                                   'size': s}}


def expansion_valve(name='valve.expansion', body_h=0.035, coil_h=0.05):
    """Electronic expansion valve: brass body with bottom inlet, side outlet, stepper coil on top."""
    mb = MB('brass')
    mb.cyl(0.011, 0, body_h, 24)
    mb.ring(0.012, 0.0105, body_h * 0.3, body_h * 0.35, 24)
    mb.use('copper').ring(0.0042, 0.003, -0.012, 0.002, 12)
    mb.use('copper').ring(0.0042, 0.003, 0, 0.016, 12, T(0, -0.01, body_h * 0.45) @ R('X', 90))
    mb.use('steel').cyl(0.007, body_h, body_h + coil_h + 0.006, 16)
    mb.use('plastic_black').lathe([(0.008, body_h + 0.004), (0.019, body_h + 0.004), (0.02, body_h + 0.008),
                                   (0.02, body_h + coil_h - 0.004), (0.019, body_h + coil_h), (0.008, body_h + coil_h)], 32)
    mb.boxr(0.016, 0.026, -0.007, 0.007, body_h + coil_h * 0.4, body_h + coil_h * 0.8)
    mb.use('zinc').box(0.003, 0.03, 0.006, (0.0, 0, body_h + 0.002))
    ob = mb.finish(name, 35)
    return {ob.name: ob, '_info': {'in': Vector((0, 0, -0.012)), 'out': Vector((0, -0.026, body_h * 0.45))}}


def strainer(length=0.06, radius=0.009, tube_r=0.0032, name='pipe.strainer'):
    """Copper strainer/filter-drier along local +Y, origin at centre."""
    mb = MB('copper')
    L = length
    prof = [(0, -L / 2 - 0.012), (tube_r, -L / 2 - 0.012), (tube_r, -L / 2), (radius, -L / 2 + 0.012),
            (radius, L / 2 - 0.012), (tube_r, L / 2), (tube_r, L / 2 + 0.012), (0, L / 2 + 0.012)]
    mb.lathe(prof, 24, M=R('X', -90))
    ob = mb.finish(name, 35)
    return {ob.name: ob}


# ---------------------------------------------------------------- sheet casing
def _wire_grid(mb, origin, u, v, nu_len, nv_len, pitch, r=0.0012, frame_r=0.002):
    """Welded wire guard in the plane spanned by unit vectors u, v starting at origin."""
    origin, u, v = Vector(origin), Vector(u), Vector(v)
    w = u.cross(v)
    nu = int(nu_len / pitch)
    nv = int(nv_len / pitch)
    for i in range(nu + 1):
        a = origin + u * (i * nu_len / nu)
        mb.sweep([a + w * r, a + v * nv_len + w * r], r, 6)
    for j in range(nv + 1):
        a = origin + v * (j * nv_len / nv)
        mb.sweep([a - w * r, a + u * nu_len - w * r], r, 6)
    c = [origin, origin + u * nu_len, origin + u * nu_len + v * nv_len, origin + v * nv_len]
    mb.sweep(c + [c[0]], frame_r, 8, closed=True)


def sheet_casing(w=0.78, h=0.54, d=0.27, z0=0.02, fan_c=(-0.12, 0.27), fan_open_r=0.215,
                 split_x=0.13, coil_end_x=0.33, valve_win=(-0.125, -0.045, 0.045, 0.175), foot_x=0.28,
                 prefix='casing'):
    """Outer casing of a box unit as separate panels. Local: front -Y at y=-d/2, base at z=0
    (foot rails 0..z0, pan floor at z0), x centred. Returns panels, front grille and screws."""
    out = {}
    t = 0.0008
    hw, hd = w / 2, d / 2
    screws = MB('zinc')
    sc = lambda pos, nrm: (pan_screw(screws, place(pos, nrm), 0.0045), screws.use('zinc'))

    # base pan
    mb = MB('sheet_metal')
    mb.boxr(-hw, hw, -hd, hd, z0, z0 + 0.001)
    for sx in (-1, 1):
        mb.boxr(sx * hw - t, sx * hw + t, -hd, hd, z0, z0 + 0.02)
    for sy in (-1, 1):
        mb.boxr(-hw, hw, sy * hd - t, sy * hd + t, z0, z0 + 0.02)
    for sx in (-1, 1):                     # hat-section foot rails with bolt slots
        xc = sx * foot_x
        for dx in (-0.02, 0.02):
            mb.boxr(xc + dx - 0.0006, xc + dx + 0.0006, -hd, hd, 0, z0)
            mb.boxr(xc + dx + (0.0006 if dx > 0 else -0.0126), xc + dx + (0.0126 if dx > 0 else -0.0006), -hd, hd, 0, 0.0012)
        mb.boxr(xc - 0.02, xc + 0.02, -hd, hd, z0 - 0.0012, z0)
        mb.use('black_steel')
        for yy in (-0.09, 0.09):
            for dx in (-0.0266, 0.0266):
                mb.boxr(xc + dx - 0.004, xc + dx + 0.004, yy - 0.012, yy + 0.012, 0.0012, 0.0014)
        mb.use('sheet_metal')
    for xx in (-0.30, -0.12, 0.05):        # pressed stiffening beads
        mb.lathe([(0, -hd + 0.03), (0.004, -hd + 0.03), (0.004, hd - 0.03), (0, hd - 0.03)], 12, 0, math.pi,
                 M=T(xx, 0, z0 + 0.001) @ R('X', -90))
    for (xx, yy) in ((-0.2, -0.07), (0.0, 0.06), (0.2, -0.1)):   # drain bosses
        mb.ring(0.012, 0.007, z0 + 0.001, z0 + 0.004, 20, T(xx, yy, 0))
        mb.use('black_steel').cyl(0.007, z0 + 0.0012, z0 + 0.0013, 16, T(xx, yy, 0))
        mb.use('sheet_metal')
    out[f'{prefix}.base_pan'] = mb.finish(f'{prefix}.base_pan', 30)

    # front panel with fan opening, bell mouth, flanges, emboss
    mb = MB('casing_paint')
    Mf = basis((0, -hd, 0), (1, 0, 0), (0, 0, 1), (0, 1, 0))     # plate local z -> +Y (inward)
    outer = [(-hw, z0), (hw, z0), (hw, h), (-hw, h)]
    mb.plate_hole(outer, fan_c, fan_open_r, t=t, segs=128, M=Mf)
    Mb = T(fan_c[0], -hd, fan_c[1]) @ R('X', -90)                 # lathe +Z -> +Y
    bm_prof = []
    for k in range(9):
        a = (math.pi / 2) * k / 8
        bm_prof.append((fan_open_r + 0.012 - 0.012 * math.sin(a), 0.012 - 0.012 * math.cos(a)))
    bm_prof += [(fan_open_r - 0.001, 0.032)]
    inner = [(rr - 0.0012, zz) for rr, zz in bm_prof[::-1]]
    mb.lathe(bm_prof + inner, 96, M=Mb)
    mb.boxr(-hw, hw, -hd, -hd + 0.025, h - t, h)                  # top return
    mb.boxr(-hw, -hw + t, -hd, -hd + 0.03, z0, h)                 # left return
    mb.boxr(hw - t, hw, -hd, -hd + 0.02, z0, h)
    mb.boxr(-hw, hw, -hd, -hd + 0.02, z0, z0 + t)
    ex0 = split_x + 0.03                                         # embossed panel on the machine side
    for (a, b, c, e) in ((ex0, hw - 0.03, 0.08, 0.0815), (ex0, hw - 0.03, h - 0.0815, h - 0.08),
                         (ex0, ex0 + 0.0015, 0.08, h - 0.08), (hw - 0.0315, hw - 0.03, 0.08, h - 0.08)):
        mb.boxr(a, b, -hd - 0.0012, -hd, c, e)
    mb.use('plastic_white').boxr(ex0 + 0.03, ex0 + 0.11, -hd - 0.0015, -hd, h - 0.13, h - 0.11)  # badge plate
    for (x, z) in ((-hw + 0.015, z0 + 0.02), (-hw + 0.015, h - 0.03), (hw - 0.015, z0 + 0.02), (hw - 0.015, h - 0.03),
                   (split_x, h - 0.03), (split_x, z0 + 0.02)):
        sc((x, -hd - 0.0002, z), (0, -1, 0))
    out[f'{prefix}.front'] = mb.finish(f'{prefix}.front', 30)

    # front grille: concentric rings + spokes, with 4 mounting feet
    mb = MB('casing_paint')
    Mg = T(fan_c[0], -hd - 0.008, fan_c[1]) @ R('X', 90)          # local z -> -Y
    rr = 0.035
    while rr < fan_open_r + 0.01:
        mb.torus(rr, 0.0016, max(24, int(rr * 400)), 6, Mg)
        rr += 0.022
    rr_end = rr - 0.022
    for k in range(12):
        a = TAU * k / 12 + 0.13
        mb.sweep([(0.03 * math.cos(a), 0.03 * math.sin(a), -0.0022), (rr_end * math.cos(a), rr_end * math.sin(a), -0.0022)],
                 0.0018, 6, M=Mg)
    mb.cyl(0.035, -0.0012, 0.0012, 32, Mg)
    for k in range(4):
        a = TAU * k / 4 + math.pi / 4
        x, y = (rr_end + 0.012) * math.cos(a), (rr_end + 0.012) * math.sin(a)
        mb.sweep([(rr_end * math.cos(a), rr_end * math.sin(a), 0), (x, y, 0), (x, y, -0.007)], 0.002, 6, M=Mg)
        mb.box(0.014, 0.014, 0.0015, (x, y, -0.008), Mg)
        pan_screw(mb, Mg @ T(x, y, 0.0008) @ R('X', 180) @ T(0, 0, 0) if False else
                  T(fan_c[0] + x, -hd - 0.0085 - 0.0002 - 0.0016, fan_c[1] + y) @ R('X', 90), 0.004)
        mb.use('casing_paint')
    out['grille.front'] = mb.finish('grille.front', 40)

    # top panel
    mb = MB('casing_paint')
    mb.boxr(-hw - 0.002, hw + 0.002, -hd - 0.002, hd + 0.002, h, h + t)
    for sx in (-1, 1):
        mb.boxr(sx * (hw + 0.002) - t / 2, sx * (hw + 0.002) + t / 2, -hd - 0.002, hd + 0.002, h - 0.02, h)
    for sy in (-1, 1):
        mb.boxr(-hw - 0.002, hw + 0.002, sy * (hd + 0.002) - t / 2, sy * (hd + 0.002) + t / 2, h - 0.02, h)
    for xx in (-0.2, 0.0, 0.2):            # stiffening ribs
        mb.lathe([(0, -hd + 0.04), (0.005, -hd + 0.04), (0.005, hd - 0.04), (0, hd - 0.04)], 10, 0, math.pi,
                 M=T(xx, 0, h + t) @ R('X', -90))
    for (x, y) in ((-hw + 0.02, -hd - 0.0022), (hw - 0.02, -hd - 0.0022), (split_x, -hd - 0.0022)):
        sc((x, y, h - 0.01), (0, -1, 0))
    for (x, y) in ((-hw + 0.02, hd + 0.0022), (hw - 0.02, hd + 0.0022)):
        sc((x, y, h - 0.01), (0, 1, 0))
    for y in (-0.08, 0.08):
        sc((hw + 0.0022, y, h - 0.01), (1, 0, 0))
    out[f'{prefix}.top'] = mb.finish(f'{prefix}.top', 30)

    # right side panel with valve window, handle, louvres
    mb = MB('casing_paint')
    y0w, y1w, z0w, z1w = valve_win
    X0, X1 = hw - t, hw
    mb.boxr(X0, X1, -hd, hd, z0, z0w)
    mb.boxr(X0, X1, -hd, hd, z1w, h)
    mb.boxr(X0, X1, -hd, y0w, z0w, z1w)
    mb.boxr(X0, X1, y1w, hd, z0w, z1w)
    mb.boxr(hw - 0.012, hw, hd - t, hd, z0, h)                     # back flange
    for (a, b, c, e) in ((y0w, y1w, z0w - 0.006, z0w), (y0w, y1w, z1w, z1w + 0.006)):   # window lips
        mb.boxr(hw - 0.006, hw, a, b, c, e)
    # handle: pressed pocket (frame) + grip lip
    hy0, hy1, hz0, hz1 = -0.02, 0.09, 0.40, 0.44
    mb.boxr(hw, hw + 0.0015, hy0, hy1, hz1, hz1 + 0.004)
    mb.boxr(hw, hw + 0.0015, hy0, hy1, hz0 - 0.004, hz0)
    mb.boxr(hw, hw + 0.0015, hy0 - 0.004, hy0, hz0 - 0.004, hz1 + 0.004)
    mb.boxr(hw, hw + 0.0015, hy1, hy1 + 0.004, hz0 - 0.004, hz1 + 0.004)
    mb.use('black_steel').boxr(hw - 0.0002, hw + 0.0001, hy0, hy1, hz0, hz1)
    mb.use('casing_paint').boxr(hw, hw + 0.012, hy0, hy1, hz1 - 0.002, hz1)
    for k in range(6):                     # louvres
        zz = 0.22 + k * 0.022
        mb.use('black_steel').boxr(hw - 0.0002, hw + 0.0001, 0.04, 0.115, zz - 0.006, zz + 0.006)
        mb.use('casing_paint').box(0.0008, 0.075, 0.014, (hw + 0.004, 0.0775, zz + 0.002), T(0, 0, 0) @ R('Y', 0)
                                   if False else T(hw + 0.004, 0.0775, zz + 0.002) @ R('Y', 35) @ T(-hw - 0.004, -0.0775, -zz - 0.002))
    for (y, z) in ((hd - 0.02, z0 + 0.03), (hd - 0.02, h - 0.04), (-hd + 0.02, h - 0.04)):
        sc((hw + 0.0002, y, z), (1, 0, 0))
    out[f'{prefix}.side_right'] = mb.finish(f'{prefix}.side_right', 30)

    # valve cover (bent sheet over the service valves)
    mb = MB('casing_paint')
    cx0, cx1 = hw, hw + 0.075
    ya, yb, za, zb = y0w - 0.012, y1w + 0.012, z0w - 0.02, z1w + 0.03
    mb.boxr(cx1 - t, cx1, ya, yb, za, zb)
    mb.boxr(cx0, cx1, ya, ya + t, za, zb)
    mb.boxr(cx0, cx1, yb - t, yb, za, zb)
    mb.boxr(cx0, cx1, ya, yb, zb - t, zb)
    mb.boxr(cx0, cx0 + t + 0.0005, ya - 0.012, yb + 0.012, zb - 0.002, zb + 0.012)
    mb.use('black_steel').boxr(cx1 - t - 0.0003, cx1 + 0.0002, ya + 0.02, yb - 0.02, za - 0.0005, za + 0.02)
    sc((cx0 + 0.001, (ya + yb) / 2, zb + 0.006), (1, 0, 0))
    out[f'{prefix}.valve_cover'] = mb.finish(f'{prefix}.valve_cover', 30)

    # left side guard and back guard (wire mesh over the coil), back plate behind the machine side
    mb = MB('casing_paint')
    _wire_grid(mb, (-hw - 0.004, -hd + 0.03, z0 + 0.03), (0, 1, 0), (0, 0, 1), d - 0.04, h - z0 - 0.06, 0.03)
    out[f'{prefix}.side_left'] = mb.finish(f'{prefix}.side_left', 40)
    mb = MB('casing_paint')
    _wire_grid(mb, (-hw + 0.01, hd + 0.004, z0 + 0.03), (1, 0, 0), (0, 0, 1), coil_end_x + hw - 0.02, h - z0 - 0.06, 0.03)
    out[f'{prefix}.back_guard'] = mb.finish(f'{prefix}.back_guard', 40)
    mb = MB('casing_paint')
    mb.boxr(coil_end_x, hw, hd - t, hd, z0, h)
    mb.boxr(coil_end_x - 0.012, coil_end_x + t, hd - 0.015, hd, z0, h)
    for z in (z0 + 0.05, h - 0.05):
        sc(((coil_end_x + hw) / 2, hd + 0.0002, z), (0, 1, 0))
    out[f'{prefix}.back_right'] = mb.finish(f'{prefix}.back_right', 30)

    out[f'{prefix}.screws'] = screws.finish(f'{prefix}.screws', 40)
    return out


def divider(x, y0, y1, z0, z1, flange=0.015, foam=0.006, name='divider'):
    """Partition plate in the YZ plane at x with a front flange, a pressed bead, feet tabs and a foam
    sound pad on +X side. Returns divider + insulation.<name>."""
    mb = MB('sheet_metal')
    t = 0.001
    mb.boxr(x - t / 2, x + t / 2, y0, y1, z0, z1)
    mb.boxr(x, x + flange, y0, y0 + t, z0, z1)                 # front flange (to the front panel)
    mb.boxr(x - flange, x, y1 - t, y1, z0, z1)                 # back flange
    mb.boxr(x - 0.0025, x + 0.0005, (y0 + y1) / 2 - 0.004, (y0 + y1) / 2 + 0.004, z0 + 0.03, z1 - 0.03)   # bead
    mb.boxr(x - 0.0025, x + 0.0005, y0 + 0.03, y0 + 0.038, z0 + 0.03, z1 - 0.03)
    for yy in (y0 + 0.05, y1 - 0.05):
        mb.boxr(x - 0.03, x, yy - 0.015, yy + 0.015, z0, z0 + t)
        pan_screw(mb, T(x - 0.015, yy, z0 + t), 0.0045)
        mb.use('sheet_metal')
    for zz in (z0 + 0.06, z1 - 0.04):
        pan_screw(mb, T(x + flange * 0.5, y0 - 0.0002, zz) @ R('X', 90), 0.0045)
        mb.use('sheet_metal')
    ob = mb.finish(name, 30)
    mf = MB('foam')
    mf.boxr(x + t / 2, x + t / 2 + foam, y0 + 0.01, y1 - 0.01, z0 + 0.04, z1 - 0.03)
    of = mf.finish(f'insulation.{name}', 30)
    return {ob.name: ob, of.name: of}


# ---------------------------------------------------------------- PCB box
def pcb_box(w=0.36, d=0.18, h=0.045, hs=(0.04, 0.12, -0.04, 0.04), hs_depth=0.055, prefix='pcb'):
    """Electrical box: pressed tray, green board on standoffs with electrolytic caps, toroid choke,
    relay, film caps, chips, power module, terminal block; aluminium heat sink below the tray.
    Local: tray bottom at z=0, x from 0..w, y centred."""
    out = {}
    hd = d / 2
    mb = MB('sheet_metal')
    t = 0.001
    mb.boxr(0, w, -hd, hd, 0, t)
    for sy in (-1, 1):
        mb.boxr(0, w, sy * hd - t / 2, sy * hd + t / 2, 0, h)
        mb.boxr(0, w, sy * (hd - 0.008) - t / 2, sy * (hd - 0.008) + t / 2, h - t, h) if False else None
        mb.boxr(0, w, sy * hd - (0.008 if sy > 0 else 0), sy * hd + (0 if sy > 0 else 0.008), h - t, h)
    for xx in (0, w):
        mb.boxr(xx - t / 2, xx + t / 2, -hd, hd, 0, h)
    for (x, y) in ((0.01, -hd + 0.01), (w - 0.01, -hd + 0.01), (0.01, hd - 0.01), (w - 0.01, hd - 0.01)):
        pan_screw(mb, T(x, y, t), 0.004)
        mb.use('sheet_metal')
    out[f'{prefix}.box'] = mb.finish(f'{prefix}.box', 30)

    # board
    bx0, bx1, by0, by1, bz = 0.012, w - 0.012, -hd + 0.012, hd - 0.012, 0.010
    mb = MB('pcb_green')
    mb.boxr(bx0, bx1, by0, by1, bz, bz + 0.0016)
    mb.use('plastic_white')
    for (x, y) in ((bx0 + 0.006, by0 + 0.006), (bx1 - 0.006, by0 + 0.006), (bx0 + 0.006, by1 - 0.006), (bx1 - 0.006, by1 - 0.006)):
        mb.cyl(0.003, t, bz, 8, T(x, y, 0))
    mb.use('zinc')                       # solder-pad rows / traces as fine relief
    for k in range(14):
        mb.boxr(bx0 + 0.02 + k * 0.022, bx0 + 0.021 + k * 0.022, by0 + 0.01, by1 - 0.01, bz + 0.0016, bz + 0.0018)
    out[prefix] = mb.finish(prefix, 30)

    # components
    zb = bz + 0.0016
    mb = MB('capacitor')
    for k in range(4):                   # electrolytic capacitors with vent cross
        x, y = 0.05 + k * 0.024, by0 + 0.03
        mb.use('capacitor').lathe([(0, 0), (0.0105, 0), (0.0105, 0.035), (0.0098, 0.036), (0, 0.036)], 24, M=T(x, y, zb))
        mb.use('aluminium').cyl(0.0094, 0.036, 0.0362, 16, T(x, y, zb))
        mb.use('black_steel').box(0.012, 0.0008, 0.0003, (x, y, zb + 0.0364))
        mb.box(0.0008, 0.012, 0.0003, (x, y, zb + 0.0364))
        mb.use('plastic_white').box(0.002, 0.0006, 0.03, (x + 0.0102, y, zb + 0.017))
    mb.use('black_steel').torus(0.014, 0.0075, 32, 10, T(0.20, by0 + 0.035, zb + 0.008))   # toroid core
    mb.use('copper')
    for k in range(36):                  # winding turns over the toroid
        a = TAU * k / 36
        Mw = T(0.20, by0 + 0.035, zb + 0.008) @ R('Z', math.degrees(a)) @ T(0.014, 0, 0) @ R('X', 90)
        mb.torus(0.0083, 0.0007, 12, 4, Mw)
    mb.use('plastic_black').boxr(0.235, 0.265, by0 + 0.015, by0 + 0.04, zb, zb + 0.022)        # relay
    mb.use('plastic_white').boxr(0.236, 0.264, by0 + 0.02, by0 + 0.035, zb + 0.022, zb + 0.0222)
    mb.use('wire_yellow')
    for k in range(3):                   # film capacitors
        mb.boxr(0.05 + k * 0.03, 0.07 + k * 0.03, by0 + 0.07, by0 + 0.08, zb, zb + 0.022)
    mb.use('black_steel')
    for (x, y, sx, sy) in ((0.17, by0 + 0.09, 0.016, 0.016), (0.21, by0 + 0.1, 0.01, 0.022), (0.27, by0 + 0.1, 0.012, 0.008)):
        mb.box(sx, sy, 0.002, (x, y, zb + 0.001))
        for k in range(int(sx / 0.0015)):          # pins
            mb.use('zinc').box(0.0004, sy + 0.003, 0.0006, (x - sx / 2 + 0.001 + k * 0.0015, y, zb + 0.0003))
        mb.use('black_steel')
    mb.use('black_steel').boxr(hs[0] + 0.005, hs[1] - 0.005, -0.015, 0.015, zb - 0.004 - 0.0016 - 0.008, zb - 0.0016 - 0.008) if False else None
    # terminal block with screws and wire entries
    tx0 = w - 0.06
    mb.use('plastic_black').boxr(tx0, w - 0.015, -0.03, 0.04, zb, zb + 0.018)
    for k in range(5):
        y = -0.024 + k * 0.014
        mb.use('plastic_black').boxr(tx0 - 0.002, w - 0.013, y + 0.0055, y + 0.0075, zb, zb + 0.022)
        pan_screw(mb, T(tx0 + 0.02, y, zb + 0.018), 0.0045)
        mb.use('black_steel').boxr(w - 0.0155, w - 0.0145, y - 0.003, y + 0.003, zb + 0.004, zb + 0.012)
    mb.use('plastic_white')
    for k in range(3):                   # connectors
        mb.boxr(0.29 + k * 0.016, 0.302 + k * 0.016, by1 - 0.02, by1 - 0.006, zb, zb + 0.01)
    mb.use('plastic_white').boxr(0.13, 0.15, by1 - 0.03, by1 - 0.02, zb, zb + 0.008)          # fuse holder
    mb.use('zinc').cyl(0.0025, 0, 0.018, 10, T(0.131, by1 - 0.025, zb + 0.008) @ R('Y', 90))
    out[f'{prefix}.parts'] = mb.finish(f'{prefix}.parts', 35)

    # heat sink below the tray, power module between
    mb = MB('aluminium')
    x0, x1, y0, y1 = hs
    mb.boxr(x0, x1, y0, y1, -0.006, 0)
    nf = int((x1 - x0) / 0.006)
    for k in range(nf + 1):
        xx = x0 + k * (x1 - x0) / nf
        mb.boxr(xx - 0.0007, xx + 0.0007, y0, y1, -hs_depth, -0.006)
    mb.use('black_steel').boxr(x0 + 0.01, x1 - 0.01, y0 + 0.012, y1 - 0.012, 0, 0.004)
    for sx in (x0 + 0.004, x1 - 0.004):
        for sy in (y0 + 0.006, y1 - 0.006):
            pan_screw(mb, T(sx, sy, t), 0.004)
    out[f'{prefix}.heatsink'] = mb.finish(f'{prefix}.heatsink', 30)
    out['_info'] = {'terminal': [Vector((w - 0.015, -0.024 + k * 0.014, zb + 0.008)) for k in range(5)]}
    return out


# ---------------------------------------------------------------- wall bracket
def wall_bracket(span=0.56, arm=0.45, drop=0.40, wall_y=0.25, top_z=-0.008, prefix='bracket'):
    """Pair of welded angle-steel L-brackets for a wall: horizontal arm (x = +-span/2) from the wall
    (y=wall_y) toward -Y, wall leg down, diagonal strut, wall anchors, rubber pads and unit bolts."""
    out = {}
    a, tt = 0.04, 0.004
    for side, sx in (('left', -1), ('right', 1)):
        mb = MB('black_steel')
        xc = sx * span / 2
        y0 = wall_y - arm
        # arm: horizontal flange on top, vertical flange on the outer side
        mb.boxr(xc - a / 2, xc + a / 2, y0, wall_y, top_z - tt, top_z)
        xo = xc + sx * a / 2
        mb.boxr(xo - tt / 2, xo + tt / 2, y0, wall_y - tt, top_z - a, top_z)
        # slotted holes in the arm
        mb.use('rubber')
        for k in range(4):
            yy = y0 + 0.05 + k * 0.09
            mb.boxr(xc - 0.004, xc + 0.004, yy - 0.02, yy + 0.02, top_z - 0.0002, top_z + 0.0001)
        mb.use('black_steel')
        # wall leg (flat against the wall + web)
        mb.boxr(xc - a / 2, xc + a / 2, wall_y - tt, wall_y, top_z - drop, top_z)
        mb.boxr(xo - tt / 2, xo + tt / 2, wall_y - a, wall_y, top_z - drop, top_z - a)
        # diagonal strut (angle) welded
        p0 = Vector((xc, y0 + 0.08, top_z - tt))
        p1 = Vector((xc, wall_y - tt, top_z - drop + 0.04))
        dvec = (p1 - p0)
        L = dvec.length
        dn = dvec.normalized()
        M = basis((p0 + p1) / 2, (1, 0, 0), dn.cross(Vector((1, 0, 0))), dn)
        mb.box(a * 0.8, tt, L, (0, 0, 0), M)
        mb.box(tt, a * 0.8, L, (sx * a * 0.4, a * 0.4 - tt, 0), M)
        # gussets
        mb.extrude([(0, 0), (0.06, 0), (0, -0.06)], -tt / 2, tt / 2,
                   basis((xc, wall_y - tt, top_z - tt), (0, -1, 0), (0, 0, 1), (1, 0, 0)))
        # weld beads at joints
        mb.use('steel')
        for p in (p0, p1):
            mb.box(a * 0.9, 0.006, 0.006, (p.x, p.y, p.z))
        # end cap
        mb.use('rubber').boxr(xc - a / 2 - 0.001, xc + a / 2 + 0.001, y0 - 0.008, y0, top_z - a - 0.001, top_z + 0.001)
        out[f'{prefix}.{side}'] = mb.finish(f'{prefix}.{side}', 30)
    # anchors
    mb = MB('zinc')
    for sx in (-1, 1):
        for zz in (top_z - 0.06, top_z - drop + 0.05):
            p = (sx * span / 2, wall_y - tt, zz)
            washer(mb, place(p, (0, -1, 0)), 0.01)
            hex_bolt(mb, place((p[0], p[1] - 0.002, p[2]), (0, -1, 0)), 0.01, 0.07)
    out[f'{prefix}.anchors'] = mb.finish(f'{prefix}.anchors', 35)
    # pads + unit bolts
    mp = MB('rubber')
    mbo = MB('zinc')
    for sx in (-1, 1):
        for yy in (-0.09, 0.09):
            x = sx * span / 2
            mp.boxr(x - 0.03, x + 0.03, yy - 0.035, yy + 0.035, top_z, 0.0)
            mp.boxr(x - 0.03, x + 0.03, yy - 0.003, yy + 0.003, top_z - 0.0004, 0.0004)
            for dx in (-0.0266, 0.0266):
                washer(mbo, T(x + dx, yy, 0.0012), 0.008)
                hex_nut(mbo, T(x + dx, yy, 0.0028), 0.008)
                mbo.use('zinc').cyl(0.004, top_z - 0.045, 0.012, 10, T(x + dx, yy, 0))
                hex_nut(mbo, T(x + dx, yy, top_z - tt - 0.0064), 0.008)
                washer(mbo, T(x + dx, yy, top_z - tt - 0.0016), 0.008)
    out[f'{prefix}.pads'] = mp.finish(f'{prefix}.pads', 30)
    out[f'{prefix}.bolts'] = mbo.finish(f'{prefix}.bolts', 35)
    return out


def wires(name, paths, material='wire_red', r=0.0012):
    mb = MB(material)
    for p in paths:
        mb.sweep(fillet(p, 0.02, 6), r, 6)
    ob = mb.finish(name, 50)
    return {ob.name: ob}
