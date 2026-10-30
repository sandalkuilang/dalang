# Fixture for tests/blender-measure.mjs: a generic ring of 6 rollers (axis along world X) around a dark hub, a dark cover box
# in front of the lower three as seen from +X, and a section cap on roller 2's +X end that set_cut turns about Z.
# Two states move the rollers out 30 -> 50 mm. DALANG_FIXTURE_FLAT=1 paints the hub like the rollers (no contrast).
# Run: Blender -b -P blender_measure.py -- <out dir> <hero-shots.json>
import bpy, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'engine', 'blender'))
import measure

out, spec = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, v):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (v, v, v, 1)
    bsdf = m.node_tree and m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (v, v, v, 1)
    return m

steel, dark, cap = material('steel', 0.6), material('dark', 0.03), material('roller_cap', 0.6)
flat = os.environ.get('DALANG_FIXTURE_FLAT') == '1'
ANGLES = [30 + 60 * k for k in range(6)]
rollers = []
for k, a in enumerate(ANGLES, 1):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.009, depth=0.015, rotation=(0, math.pi / 2, 0))
    o = bpy.context.object
    o.name = f'part.roller.{k}'
    o.data.materials.append(steel)
    rollers.append((o, a))
bpy.ops.mesh.primitive_cylinder_add(radius=0.0085, depth=0.0006, rotation=(0, math.pi / 2, 0), location=(0.0078, 0, 0))
c = bpy.context.object
c.name = 'part.roller.2.cap'
c.data.materials.append(cap)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0.03, 0, -0.04))
cover = bpy.context.object
cover.name = 'part.cover'
cover.scale = (0.004, 0.16, 0.07)
cover.data.materials.append(dark)
bpy.ops.mesh.primitive_cylinder_add(radius=0.024, depth=0.004, rotation=(0, math.pi / 2, 0), location=(-0.012, 0, 0))
hub = bpy.context.object
hub.name = 'part.hub'
hub.data.materials.append(steel if flat else dark)
CUT, R = [0], [0.030]

def place_cap():  # the section face on roller 2 (90 deg), its normal +X turned -deg about Z
    d = math.radians(-CUT[0])
    c.location = (0.0095 * math.cos(d), 0.0095 * math.sin(d), R[0])  # just outside the roller, end or side
    c.rotation_euler = (0, math.pi / 2, d)
    bpy.context.view_layer.update()

def set_state(name):
    R[0] = r = {'low': 0.030, 'high': 0.050}[name]
    for o, a in rollers:
        o.location = (0, r * math.cos(math.radians(a)), r * math.sin(math.radians(a)))
    place_cap()

def set_cut(deg):
    CUT[0] = deg
    place_cap()

set_state('low')
res = measure.run(spec, out, set_state=set_state, set_cut=set_cut)
print('PHI', res['phi'])
