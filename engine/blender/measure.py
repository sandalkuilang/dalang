# measure.py — does each film shot that uses the hero read? (DALANG, MIT)
#
# The planner's review/hero-shots.json names, per storyboard shot, the film's camera (az/el around the asset's front,
# lens in mm on a 24 mm vertical sensor as three.js fovFromMm, distance), the focal parts (node-name prefixes; each
# object under one is an instance, a trailing .quarter/.cap folded in), the asset states and what must read (`need`).
# For every row x hold key x state it renders a flat object-ID pass in Workbench (no light, no AA, no dither, Raw
# view: each object's colour comes back exact) at a quarter of the frame and measures, in full-frame px:
#   instances  instances whose visible pixel box has its smaller side >= minPx
#   visible    focal pixels in the scene / focal pixels with only the focal shown (occlusion)
#   cap        pixels of a material named cap or *_cap inside the focal / focal pixels (a section must face the camera)
#   move       largest instance-centroid shift from the first to the last state
#   contrast   L* between the focal's base colour and its largest neighbour's, its own kind (roller.1 for roller.2)
#              not counted (a part that must stand apart from what holds it)
# Objects under a row's `soft` prefixes are the defocused foreground the storyboard names: a real lens sees past them,
# so they count half as occluders and never hide an instance. A focal prefix that matches no object is a fail (`missing`).
# phi = the sum over checks of max(0, (need - got) / need): 0 when every row reads. Each run appends phi to the
# report's history; two runs in a row that do not lower it print MEASURE STALL (stop and report, never loop on).
# A failing hold key is explored: small legal variants (az +-15, el +-10), the section plane turned in 15 deg steps
# (when the asset gives set_cut) and the other side views. A legal camera or cut that passes is the builder's fix; only another side passing is a camera decision for the main agent; none is the model.
#
#   import measure; measure.measure_from_env(set_state, set_cut)   # last in the asset script, after export and stills
#   set_state(name) poses a state; set_cut(deg) turns the section plane deg about the focal's axis (0 = as built).
#   DALANG_MEASURE=<film>/review/hero-shots.json Blender -b -P <asset>.py -- <out>   -> <film>/review/hero-measure.md/.json
# `refs` (the user's pictures, BRIEF.md fidelity exact): each is rendered as the hero's white mask from that picture's
# camera (`ortho: true` for a blueprint view) into review/silhouette/<name>.png and compared by
# scripts/silhouette_iou.mjs (one uniform scale, IoU, worst region, overlay); a view under its threshold adds
# (min - iou) / min to phi, an unreadable picture is recorded as WARN and adds nothing.
import json, math, os, re, shutil, subprocess, tempfile
import bpy
import numpy as np
from mathutils import Vector

SIDES = {'front': 0, 'front-left': 45, 'left': 90, 'back-left': 135, 'back': 180, 'back-right': 225, 'right': 270,
         'front-right': 315}
DEFAULT = {'instances': 1, 'minPx': 24, 'visible': 0.6, 'cap': 0.2, 'contrast': 15}
SCALE = 4  # the ID pass renders at 1/SCALE of the frame
KINDS = {'MESH', 'CURVE', 'SURFACE', 'META', 'FONT'}


def _objects():
    return [o for o in bpy.context.scene.objects if o.type in KINDS and not o.hide_render]


def _instance(name, prefixes):
    for p in prefixes:
        if name == p or name.startswith(p + '.'):
            base = name
            for tail in ('.quarter', '.cap'):
                if base.endswith(tail) and base != p:
                    base = base[: -len(tail)]
            return base
    return None


def _lstar(o):
    """CIE L* of an object's base colour (Principled Base Color, else the viewport colour; no material: 0.8 grey)."""
    m = o.active_material
    c = (0.8, 0.8, 0.8)
    if m:
        node = m.node_tree and next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        c = tuple(node.inputs['Base Color'].default_value)[:3] if node else tuple(m.diffuse_color)[:3]
    y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    return 116 * (y ** (1 / 3) if y > 0.008856 else 7.787 * y + 16 / 116) - 16


def _camera(spec, row, key):
    sc = bpy.context.scene
    t = row['target']
    if isinstance(t, str):
        objs = [o for o in _objects() if o.name == t or o.name.startswith(t + '.')]
        if not objs:
            raise ValueError(f'hero-shots row {row["shot"]}: no object named {t}')
        pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
        t = [(min(p[i] for p in pts) + max(p[i] for p in pts)) / 2 for i in range(3)]
    f = Vector(spec.get('front', [0, -1, 0])).normalized()
    az, el = math.radians(key['az']), math.radians(key.get('el', 0))
    h = Vector((f.x * math.cos(az) - f.y * math.sin(az), f.x * math.sin(az) + f.y * math.cos(az), 0)).normalized()
    d = (h * math.cos(el) + Vector((0, 0, 1)) * math.sin(el)) * key.get('dist', 10)
    cam = bpy.data.objects.get('_measure_cam') or bpy.data.objects.new('_measure_cam', bpy.data.cameras.new('_measure_cam'))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO' if key.get('ortho') else 'PERSP'
    if key.get('ortho'):
        cam.data.ortho_scale = key['orthoScale']
    else:
        cam.data.sensor_fit, cam.data.sensor_height, cam.data.lens = 'VERTICAL', 24, key['mm']
    cam.data.clip_start, cam.data.clip_end = 0.001, 100
    cam.location = Vector(t) + d
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam


def _render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(path)
    px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[..., :3]
    bpy.data.images.remove(im)
    return np.rint(px * 255).astype(np.int32)


def _ids(img):
    q = np.rint(img / 16.0).astype(np.int32)
    return q[..., 0] * 256 + q[..., 1] * 16 + q[..., 2]


def _passes(row, tmp):
    """Scene IDs, focal-alone IDs and the cap mask for the current camera and state."""
    objs, focal = _objects(), row['focal']
    for i, o in enumerate(objs, 1):
        o.color = ((i // 256 % 16) * 16 / 255, (i // 16 % 16) * 16 / 255, (i % 16) * 16 / 255, 1)
    names = {i: o.name for i, o in enumerate(objs, 1)}
    sh = bpy.context.scene.display.shading
    sh.color_type = 'OBJECT'
    scene = _ids(_render(os.path.join(tmp, 'id.png')))
    clear = scene
    soft = [o for o in objs if row.get('soft') and _instance(o.name, row['soft'])]
    if soft:
        for o in soft:
            o.hide_render = True
        clear = _ids(_render(os.path.join(tmp, 'clear.png')))
        for o in soft:
            o.hide_render = False
    hidden = [o for o in objs if _instance(o.name, focal) is None]
    for o in hidden:
        o.hide_render = True
    alone = _ids(_render(os.path.join(tmp, 'alone.png')))
    for o in hidden:
        o.hide_render = False
    cap = None
    if row.get('cut'):
        mats = {m: tuple(m.diffuse_color) for m in bpy.data.materials}
        for m in mats:
            m.diffuse_color = (1, 1, 1, 1) if m.name == 'cap' or m.name.endswith('_cap') else (0, 0, 0, 1)
        sh.color_type = 'MATERIAL'
        cap = _render(os.path.join(tmp, 'cap.png')).min(axis=2) >= 250
        sh.color_type = 'OBJECT'
        for m, c in mats.items():
            m.diffuse_color = c
    return scene, clear, alone, cap, {i: o for i, o in enumerate(objs, 1)}


def _metrics(row, scene, clear, alone, cap, objs):
    focal = row['focal']
    inst = {i: _instance(o.name, focal) for i, o in objs.items()}
    fid = [i for i, b in inst.items() if b]
    fmask, cmask = np.isin(scene, fid), np.isin(clear, fid)
    seen = int(fmask.sum()) + 0.5 * int((cmask & ~fmask).sum())  # a soft occluder hides half
    alone_px = int(np.isin(alone, fid).sum())
    need = {**DEFAULT, **row.get('need', {})}
    boxes, cents = {}, {}
    for b in sorted({b for b in inst.values() if b}):
        ys, xs = np.nonzero(np.isin(clear, [i for i in fid if inst[i] == b]))
        if len(xs):
            boxes[b] = min(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1) * SCALE
            cents[b] = (xs.mean() * SCALE, ys.mean() * SCALE)
    got = {'instances': sum(1 for s in boxes.values() if s >= need['minPx']),
           'minPx': int(min(boxes.values())) if boxes else 0,
           'visible': round(float(seen / alone_px), 3) if alone_px else 0.0}
    if row.get('cut'):
        got['cap'] = round(float((cap & fmask).sum()) / fmask.sum(), 3) if fmask.sum() else 0.0
    missing = [p for p in focal if not any(_instance(o.name, [p]) for o in objs.values())]
    if missing:
        got['missing'] = missing
    edge = np.zeros_like(cmask)  # non-focal object pixels touching the focal (4-neighbours)
    for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
        edge |= np.roll(cmask, sh, axis=ax)
    ring = clear[edge & ~cmask]
    family = {re.sub(r'\.\d+$', '', p) for p in focal}  # roller.2's siblings roller.1, .3 are alike by design
    kin = [i for i, o in objs.items() if any(o.name.startswith(f + '.') for f in family)]
    ring = ring[(ring > 0) & ~np.isin(ring, fid + kin)]
    if len(ring) and cmask.any():
        ids, n = np.unique(clear[cmask], return_counts=True)
        lf = sum(_lstar(objs[i]) * k for i, k in zip(ids, n) if i in objs) / n.sum()
        got['contrast'] = round(float(abs(lf - _lstar(objs[int(np.bincount(ring).argmax())]))), 1)
    return got, cents, need


def _phi(got, need, row):
    keys = ['instances', 'visible'] + (['cap'] if row.get('cut') else []) + [k for k in ('move', 'contrast') if k in got]
    return len(got.get('missing', [])) + sum(max(0.0, (need[k] - got.get(k, 0)) / need[k]) for k in keys if need.get(k))


def _measure_row(spec, row, key, set_state, tmp):
    """[(state, got, phi)] for one key over the row's states; move is set on the last state."""
    states = row.get('states') or [None]
    out, first = [], None
    for st in states:
        if st is not None and set_state:
            set_state(st)
        _camera(spec, row, key)
        got, cents, need = _metrics(row, *_passes(row, tmp))
        if first is None:
            first = cents
        if 'move' in need and st is states[-1] and len(states) > 1:
            both = [b for b in cents if b in first]
            got['move'] = int(max((math.dist(first[b], cents[b]) for b in both), default=0))
        out.append((st, got, need))
    if not key.get('hold') and len(row['keys']) > 1:  # a passing key only has to show the focal
        return [(st, g, {'visible': n['visible']}) for st, g, n in out]
    return out


def _explore(spec, row, key, set_state, set_cut, tmp):
    legal = [(da, de) for da in (-15, -7.5, 7.5, 15) for de in (-10, 0, 10)]
    passed, base = [], SIDES.get(row.get('side'), key['az'])
    for da, de in legal:
        k = {**key, 'az': key['az'] + da, 'el': key.get('el', 0) + de}
        if all(_phi(g, n, row) == 0 for _, g, n in _measure_row(spec, row, k, set_state, tmp)):
            passed.append({'az': k['az'], 'el': k['el']})
    if passed:
        return {'class': 'legal', 'pass': passed}
    if row.get('cut') and set_cut:
        try:
            for deg in range(15, 180, 15):
                set_cut(deg)
                if all(_phi(g, n, row) == 0 for _, g, n in _measure_row(spec, row, key, set_state, tmp)):
                    passed.append({'cut': deg})
        finally:
            set_cut(0)
        if passed:
            return {'class': 'legal', 'pass': passed}
    for side, az in SIDES.items():
        if abs((az - base + 180) % 360 - 180) < 22.5:
            continue
        k = {**key, 'az': az}
        if all(_phi(g, n, row) == 0 for _, g, n in _measure_row(spec, row, k, set_state, tmp)):
            passed.append({'side': side, 'az': az})
    return {'class': 'decision', 'pass': passed} if passed else {'class': 'model', 'pass': []}


def _refs(spec, spec_path, out_dir):
    """Each reference picture's view: the hero's mask from its camera, then silhouette_iou.mjs on all of them."""
    sc = bpy.context.scene
    base = os.path.dirname(os.path.abspath(spec_path))
    film = os.path.dirname(base) if os.path.basename(base) == 'review' else base
    sil = os.path.join(out_dir, 'silhouette')
    os.makedirs(sil, exist_ok=True)
    objs = _objects()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    centre, extent = [(a + b) / 2 for a, b in zip(lo, hi)], max(b - a for a, b in zip(lo, hi))
    for o in objs:
        o.color = (1, 1, 1, 1)
    sc.display.shading.color_type = 'OBJECT'
    views, warns = [], []
    for ref in spec['refs']:
        image = os.path.join(film, ref['image'])
        try:
            im = bpy.data.images.load(image)
            w, h = im.size
            bpy.data.images.remove(im)
        except RuntimeError:
            warns.append({'name': ref['name'], 'status': 'WARN', 'why': f'cannot read {ref["image"]} — rerun'})
            continue
        k = 1080 / max(w, h) if max(w, h) > 1080 else 1
        sc.render.resolution_x, sc.render.resolution_y = int(w * k), int(h * k)
        _camera(spec, {'shot': ref['name'], 'target': ref.get('target', centre)}, {**ref, 'orthoScale': ref.get('orthoScale', extent * 1.15)})
        sc.render.filepath = os.path.join(sil, f"{ref['name']}.png")
        bpy.ops.render.render(write_still=True)
        views.append({'name': ref['name'], 'ref': image, 'render': f"{ref['name']}.png", 'ortho': bool(ref.get('ortho')),
                      'overlay': f"{ref['name']}-overlay.png"})
    if not views:
        return warns
    json.dump(views, open(os.path.join(sil, 'views.json'), 'w'), indent=1)
    node = shutil.which('node')
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts', 'silhouette_iou.mjs')
    if not node:
        return warns + [{'name': v['name'], 'status': 'WARN', 'why': 'node not found — rerun where node is on PATH'} for v in views]
    r = subprocess.run([node, script, '--list', os.path.join(sil, 'views.json'), '--json'], capture_output=True, text=True)
    try:
        out = json.loads(r.stdout)['views']
    except (ValueError, KeyError):
        out = [{'name': v['name'], 'status': 'WARN', 'why': f'silhouette_iou.mjs gave no result (exit {r.returncode}) — rerun'} for v in views]
    for v in out:
        v['phi'] = round(max(0.0, (v['min'] - v['iou']) / v['min']), 3) if v.get('status') in ('PASS', 'FAIL') else 0.0
    return warns + out


def run(spec_path, out_dir, set_state=None, set_cut=None):
    spec = json.load(open(spec_path))
    sc = bpy.context.scene
    W, H = spec.get('frame', [1080, 1920])
    keep = (sc.render.engine, sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage,
            sc.render.filepath, sc.render.dither_intensity, sc.view_settings.view_transform, sc.view_settings.look,
            sc.camera)
    sh = sc.display.shading
    keep_sh = (sh.light, sh.color_type, sh.show_object_outline, sh.show_cavity, sh.show_shadows,
               sh.show_specular_highlight, sh.show_xray, sh.background_type, tuple(sh.background_color), sc.display.render_aa)
    colours = {o: tuple(o.color) for o in _objects()}
    rows, explore, refs, tmp = [], {}, [], tempfile.mkdtemp(prefix='dalang-measure-')
    try:
        sc.render.engine = 'BLENDER_WORKBENCH'
        sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W // SCALE, H // SCALE, 100
        sc.render.image_settings.file_format, sc.render.image_settings.color_depth = 'PNG', '8'
        sc.render.dither_intensity, sc.display.render_aa = 0, 'OFF'
        sc.view_settings.view_transform, sc.view_settings.look = 'Raw', 'None'
        sh.light, sh.show_object_outline, sh.show_cavity, sh.show_shadows = 'FLAT', False, False, False
        sh.show_specular_highlight, sh.show_xray = False, False
        sh.background_type, sh.background_color = 'VIEWPORT', (0, 0, 0)
        for row in spec['rows']:
            for ki, key in enumerate(row['keys']):
                fail = False
                for st, got, need in _measure_row(spec, row, key, set_state, tmp):
                    phi = _phi(got, need, row)
                    fail |= phi > 0
                    rows.append({'shot': row['shot'], 'key': ki, 'state': st, 'got': got,
                                 'need': {k: need[k] for k in got if k in need}, 'phi': round(float(phi), 3), 'pass': bool(phi == 0)})
                if fail and (key.get('hold') or len(row['keys']) == 1):
                    explore[str(row['shot'])] = _explore(spec, row, key, set_state, set_cut, tmp)
        if spec.get('refs'):
            refs = _refs(spec, spec_path, out_dir)
    finally:
        (sc.render.engine, sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage,
         sc.render.filepath, sc.render.dither_intensity, sc.view_settings.view_transform, sc.view_settings.look,
         sc.camera) = keep
        (sh.light, sh.color_type, sh.show_object_outline, sh.show_cavity, sh.show_shadows, sh.show_specular_highlight,
         sh.show_xray, sh.background_type, sh.background_color, sc.display.render_aa) = keep_sh
        for o, c in colours.items():
            o.color = c
        cam = bpy.data.objects.get('_measure_cam')
        if cam:
            bpy.data.objects.remove(cam)
    phi = round(sum(r['phi'] for r in rows) + sum(v.get('phi', 0) for v in refs), 3)
    jpath = os.path.join(out_dir, 'hero-measure.json')
    try:
        history = json.load(open(jpath)).get('history', []) + [phi]
    except (FileNotFoundError, ValueError):
        history = [phi]
    res = {'phi': phi, 'history': history, 'rows': rows, 'explore': explore, 'refs': refs}
    json.dump(res, open(jpath, 'w'), indent=1)
    md = ['# Hero measure', '', f'phi {phi} (history {history})', '',
          '| shot | key | state | instances | min px | visible | cap | move | contrast | phi | |', '|---|---|---|---|---|---|---|---|---|---|---|']
    for r in rows:
        g, n = r['got'], r['need']
        cell = lambda k: f"{g[k]} / {n[k]}" if k in n and k in g else str(g.get(k, '-'))
        md.append(f"| {r['shot']} | {r['key']} | {r['state'] or '-'} | {cell('instances')} | {g['minPx']} | {cell('visible')}"
                  f" | {cell('cap')} | {cell('move')} | {cell('contrast')} | {r['phi']} | {'PASS' if r['pass'] else 'FAIL'}"
                  + (f" no object for {', '.join(g['missing'])} |" if g.get('missing') else ' |'))
    for shot, e in explore.items():
        md.append(f"\nShot {shot}: {e['class']} — " + ({'legal': 'a legal camera or cut passes: use it',
                  'decision': 'only another side passes: the main agent decides the storyboard camera',
                  'model': 'no camera passes: fix the model or the cut'}[e['class']]) + (f" {e['pass'][:4]}" if e['pass'] else ''))
    for v in refs:
        md.append(f"\nRef {v['name']}: " + (f"WARN {v['why']}" if v['status'] == 'WARN' else
                  f"{v['status']} IoU {v['iou']} / {v['min']}, aspect {v['aspect']:+.0%}, worst: {v['worst']}, overlay silhouette/{v['name']}-overlay.png"))
    open(os.path.join(out_dir, 'hero-measure.md'), 'w').write('\n'.join(md) + '\n')
    for line in md[4:]:
        print(line)
    stall = len(history) >= 3 and phi > 0 and history[-1] >= history[-2] >= history[-3]
    print('MEASURE STALL: phi not lowered twice in a row — stop, report the open rows and their explore class' if stall
          else 'MEASURE PASS' if phi == 0 else f'MEASURE FAIL phi {phi}: fix the failing rows, then measure again')
    return res


def measure_from_env(set_state=None, set_cut=None):
    spec = os.environ.get('DALANG_MEASURE')
    if not spec:
        return None
    return run(spec, os.environ.get('DALANG_MEASURE_OUT') or os.path.dirname(os.path.abspath(spec)), set_state, set_cut)
