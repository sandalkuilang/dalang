"""blender_demo.py - the smallest assembly built from engine/blender/parts.py (DALANG, MIT), for tests/blender-parts.mjs:
a fan on its motor inside a sheet casing, a sectioned pump (one `.quarter` per cuttable part) and one pipe.
Run: Blender -b -P tests/fixtures/blender_demo.py -- <out dir>   (writes blender_demo.glb there)
"""
import bpy, sys, os
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


add(sheet_casing(0.78, 0.54, 0.27, z0=0.021, fan_c=(FAN.x, FAN.z), fan_open_r=0.212))
add(axial_fan(radius=0.20), FAN)
add(motor(radius=0.058, length=0.075), Vector((FAN.x, 0.0488, FAN.z)))
add(rotary_compressor(cut=True, prefix='pump'), Vector((0.29, -0.005, 0.032)))
add(pipe('pipe.out', [Vector((0.29, -0.005, 0.30)), Vector((0.29, -0.005, 0.40)), Vector((0.10, -0.005, 0.40))], 0.004))

tri = 0
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tri += len(o.data.loop_triangles)
print(f'TRIANGLES {tri}')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'blender_demo.glb'), export_format='GLB',
                          export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
print('EXPORTED')
