"""condensing_unit.py - a refrigeration condensing unit on a wall bracket, assembled from ../parts.py
(DALANG, MIT). One proof that the parts make a whole machine; a film asset is built the same way.

Blender frame: Z up, unit front faces -Y (exports as glTF Y-up, front +Z). Origin at the centre of
the base on the bracket (bottom of the base-pan foot rails). Metres.
Run: Blender -b -P condensing_unit.py -- <out dir>   (writes condensing_unit.glb and .blend there; default: here)
Nodes keep dotted names a film addresses (casing.front, fan.blade on its axle, compressor.stator, a .quarter per
cuttable compressor part for the section, pipe.discharge, valve.gas, ...).
"""
import bpy, sys, os, math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv[:-1] else HERE
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, os.path.dirname(HERE))
import importlib, parts
importlib.reload(parts)
from parts import *

bpy.ops.wm.read_factory_settings(use_empty=True)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)

W, H, D = 0.78, 0.54, 0.27
Z0 = 0.021                      # base-pan floor (top of the foot rails)
SPLIT = 0.13                    # divider x
FAN = Vector((-0.12, -0.07, 0.27))
objs = {}


def add(d, loc=None):
    info = d.pop('_info', None)
    for k, o in d.items():
        if loc is not None:
            o.location = loc
        objs[k] = o
    return info


# ---- casing + grille
add(sheet_casing(W, H, D, z0=Z0, fan_c=(FAN.x, FAN.z), fan_open_r=0.212, split_x=SPLIT, coil_end_x=0.33,
                 valve_win=(-0.128, -0.045, 0.045, 0.178), foot_x=0.28))

# ---- condenser coil (L-shaped, back + left)
coil_loc = Vector((-0.016, 0.111, 0.028))
ci = add(finned_coil(width=0.70, height=0.47, depth=0.0364, rows=2, fin_pitch=0.0014, bend='L', side_len=0.20,
                     bend_r=0.035, tube_d=0.007, tube_pitch=0.021), coil_loc)
coil_in, coil_out = coil_loc + ci['in'], coil_loc + ci['out']

# ---- fan, motor, bracket
add(axial_fan(radius=0.20, blades=3, pitch=0.26, hub_r=0.055), FAN)
add(motor(radius=0.058, length=0.075), Vector((FAN.x, 0.0488, FAN.z)))
add(fan_motor_bracket(height=0.50, width=0.14, motor_z=FAN.z - Z0, plate_h=0.15), Vector((FAN.x, 0.05, Z0)))

# ---- divider + electrical box
add(divider(SPLIT, -0.133, 0.092, Z0, 0.466))
pcb_loc = Vector((0.003, -0.03, 0.467))
pi_ = add(pcb_box(w=0.38, d=0.19, h=0.045, hs=(0.04, 0.12, -0.04, 0.04), hs_depth=0.055), pcb_loc)

# ---- compressor + accumulator
C = Vector((0.29, -0.005, 0.032))
ACC = Vector((0.195, -0.035, 0.13))
suction_deg = math.degrees(math.atan2(ACC.y - C.y, ACC.x - C.x)) % 360
cpi = add(rotary_compressor(radius=0.055, height=0.24, cut=True, cut_from=270, cut_to=360,
                            terminal_deg=240, suction_deg=suction_deg), C)
ai = add(accumulator(radius=0.035, height=0.16), ACC)
add(clamp_band([((C.x, C.y, 0), 0.055), ((ACC.x, ACC.y, 0), 0.035)], 0.215))

# ---- service valves + flare nuts
VL = Vector((0.4068, -0.11, 0.075))     # liquid, 1/4"
VG = Vector((0.411, -0.065, 0.14))      # gas, 1/2"
vli = add(service_valve(0.00635, '2way', 'valve.liquid'), VL)
vgi = add(service_valve(0.0127, '3way', 'valve.gas'), VG)
fl_loc = VL + Vector((vli['size'] / 2 + 0.007, 0, 0))
fg_loc = VG + Vector((vgi['size'] / 2 + 0.007, 0, 0))
fli = add(flare_nut(0.00635, 'flare.liquid'), fl_loc)
fgi = add(flare_nut(0.0127, 'flare.gas'), fg_loc)
add(expansion_valve('valve.expansion'), Vector((0.362, 0.06, 0.12)))
add(strainer(0.05, 0.009, 0.0032, 'pipe.strainer'), Vector((0.362, -0.035, 0.075)))

# ---- refrigerant piping
cs = C + cpi['suction']
cd = C + cpi['discharge']
add(pipe('pipe.discharge', [cd, (cd.x, cd.y, 0.33), (cd.x, 0.065, 0.33), (cd.x, 0.065, 0.44), (0.372, 0.065, 0.44),
                            (0.372, coil_in.y, 0.44), (0.372, coil_in.y, coil_in.z), coil_in],
         0.0048, 0.02, braze=(0, -1)))
lstub = VL + vli['stub']
add(pipe('pipe.liquid', [coil_out, (0.362, coil_out.y, coil_out.z), (0.362, 0.06, coil_out.z), (0.362, 0.06, 0.108)],
         0.0032, 0.014, braze=(0, -1)))
add(pipe('pipe.liquid_valve', [(0.362, 0.034, 0.1358), (0.362, 0.015, 0.1358), (0.362, 0.015, 0.075),
                               (0.362, lstub.y, 0.075), lstub], 0.0032, 0.014, braze=(0, -1)))
gstub = VG + vgi['stub']
acc_in = ACC + ai['in']
add(pipe('pipe.suction', [gstub, (0.345, gstub.y, gstub.z), (0.345, gstub.y, 0.35), (acc_in.x, acc_in.y, 0.35), acc_in],
         0.0064, 0.03, braze=(0, -1)))
acc_out = ACC + ai['out']
add(pipe('pipe.suction_accumulator', [acc_out, (acc_out.x, acc_out.y, cs.z), cs], 0.0048, 0.018, braze=(0, -1)))
# (no foam on the in-unit suction line: bare copper as on real units; field lines are insulated below)

# field lines leaving the flare nuts toward the wall (y = 0.25), insulated
fL = fl_loc + fli['tube_end']
fG = fg_loc + fgi['tube_end']
WALL_Y = 0.25
add(pipe('pipe.field_liquid', [fL, (0.475, fL.y, fL.z), (0.475, WALL_Y, fL.z)], 0.003175, 0.03))
add(pipe('pipe.field_gas', [fG, (0.515, fG.y, fG.z), (0.515, WALL_Y, fG.z)], 0.00635, 0.045))
add(insulation('insulation.field_liquid', [(fL.x + 0.004, fL.y, fL.z), (0.475, fL.y, fL.z), (0.475, WALL_Y, fL.z)],
               0.011, 0.0034, 0.03))
add(insulation('insulation.field_gas', [(fG.x + 0.004, fG.y, fG.z), (0.515, fG.y, fG.z), (0.515, WALL_Y, fG.z)],
               0.016, 0.0066, 0.045))

# ---- wiring: compressor terminal -> terminal block, fan motor -> board
ct = C + cpi['terminal']
tb = [pcb_loc + p for p in pi_['terminal']]
for k, m in enumerate(('wire_red', 'wire_blue', 'wire_yellow')):
    o = Vector((0.0, (k - 1) * 0.004, 0.0))
    t = tb[k]
    add(wires(f'wire.compressor_{m[5:]}', [[ct + o, ct + o + Vector((0, 0, 0.06)), Vector((0.378, t.y, 0.40)),
                                             Vector((0.378, t.y, t.z)), Vector((t.x - 0.003, t.y, t.z))]], m))
mg = Vector((FAN.x, 0.0488 - 0.075 * 0.4, FAN.z + 0.058))
add(wires('wire.fan_motor', [[mg + Vector((dx, 0, 0.03)), mg + Vector((dx, 0, 0.13)), Vector((-0.02, -0.03 + dx, 0.44)),
                              Vector((0.05, -0.08 + dx, 0.475)), Vector((0.28, -0.08 + dx, 0.48)),
                              Vector((0.30, tb[3].y + dx, 0.48)), Vector((tb[3].x - 0.003, tb[3].y + dx, tb[3].z))]
                             for dx in (-0.003, 0.0, 0.003)], 'wire_blue', 0.0011))

# ---- wall bracket
add(wall_bracket(span=0.56, arm=0.45, drop=0.40, wall_y=WALL_Y, top_z=-0.008))

# ---- tidy: parent-free flat hierarchy, one collection, custom metadata
for name, o in objs.items():
    o['part'] = name
bpy.context.scene.unit_settings.system = 'METRIC'

tri = 0
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tri += len(o.data.loop_triangles)
print(f'OBJECTS {len(objs)} TRIANGLES {tri} FINS {ci["fins"]} TUBES {ci["tubes"]}')

# sheet metal is bent, not cut: its edges get a small round (a bevel the export applies), the casing and the divider
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and (o.name.startswith('casing.') or o.name == 'divider') and o.name != 'casing.screws':
        b = o.modifiers.new('bend', 'BEVEL'); b.width = 0.0025; b.segments = 3; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40); b.use_clamp_overlap = True; b.harden_normals = False

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'condensing_unit.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'condensing_unit.glb'), export_format='GLB',
                          export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
print('EXPORTED')
dg = bpy.context.evaluated_depsgraph_get()
print('EXPORTED_TRIANGLES', sum(len(o.evaluated_get(dg).to_mesh().loop_triangles) if o.type == 'MESH' and not o.evaluated_get(dg).data.calc_loop_triangles() else 0 for o in bpy.context.scene.objects))
