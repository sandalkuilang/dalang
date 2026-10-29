"""blender_demo.py - the smallest assembly built from engine/blender/parts.py (DALANG, MIT), for tests/blender-parts.mjs:
a fan on its motor inside a cut housing (its `.quarter` is the piece a section hides), one pipe and four bolts.
Run: Blender -b -P tests/fixtures/blender_demo.py -- <out dir>   (writes blender_demo.glb there)
"""
import bpy, sys, os
import math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv[:-1] else HERE
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, os.path.join(HERE, '..', '..', 'engine', 'blender'))
from parts import *

bpy.ops.wm.read_factory_settings(use_empty=True)
FAN = Vector((-0.12, -0.07, 0.27))


def add(d, loc=None):
    info = d.pop('_info', None)
    if loc is not None:
        for o in d.values():
            o.location = loc
    return info


add(axial_fan(radius=0.20), FAN)
MOTOR = Vector((FAN.x, 0.0488, FAN.z))
add(motor(radius=0.058, length=0.075, name='fan.motor'), MOTOR)
# the housing's axis (local +Z) turned to the front (-Y), its rear cap just behind the motor's mounting face
H0 = MOTOR + Vector((0, 0.004, 0))
for o in housing(0.09, 0.085, 0.003, bore=0.012, cut=True).values():
    o.location, o.rotation_euler = H0, (math.pi / 2, 0, 0)
mb = MB('zinc')
for k in range(4):
    a = math.pi / 4 + k * math.pi / 2
    hex_bolt(mb, place(H0 + Vector((0.072 * math.cos(a), 0, 0.072 * math.sin(a))), (0, 1, 0)), 0.006, 0.02)
mb.finish('bolts')
add(pipe('pipe.out', [H0 + Vector((0, 0.01, 0.06)), H0 + Vector((0, 0.08, 0.06)), H0 + Vector((0.25, 0.08, 0.06))], 0.004))

tri = 0
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tri += len(o.data.loop_triangles)
print(f'TRIANGLES {tri}')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'blender_demo.glb'), export_format='GLB',
                          export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
print('EXPORTED')
