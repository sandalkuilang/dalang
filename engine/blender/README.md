# engine/blender — detailed assets, modelled once by script

The isometric and studio engines draw a set from primitives, which is right for a world and wrong for a hero
machine seen close: a compressor, a fan, a finned coil or a valve built from boxes reads as a toy. Here a hero
asset is modelled once in [Blender](https://www.blender.org) (GPL; a tool on the machine, never shipped) by a Python
script, exported as glTF and reused by every film that needs it. The scripts are DALANG's (MIT).

- `parts.py`: generic part functions in real units, each returning named objects: `finned_coil` (real fins at a fin
  pitch, staggered tubes, hairpins and return bends, L or straight), `axial_fan` (twisted, swept, cambered blades on a
  hub), `motor`, `fan_motor_bracket`, `rotary_compressor` (welded shell, feet, terminal box; inside stator and windings,
  rotor, crankshaft, rolling piston and vane, bearings; `cut` exports a `.quarter` of each cuttable part for the
  section), `accumulator`, `clamp_band`, `pipe` (filleted bends, brazed joints), `insulation`, `flare_nut`,
  `service_valve` (2-way, 3-way with Schrader port), `expansion_valve`, `strainer`, `sheet_casing` (panels with
  flanges, bell mouth, grille, louvres, screws), `divider`, `pcb_box`, `wall_bracket`, `wires`, fasteners.
- `assemblies/condensing_unit.py`: a refrigeration condensing unit on its wall bracket, built from those parts: 63
  named nodes, about 127k triangles, 2 s to build. `Blender -b -P assemblies/condensing_unit.py -- <out dir>` writes
  `condensing_unit.glb` and `.blend` there.
- `assemblies/condensing_unit.shot.html`: its cutaway still in the engine/three iso look (`isoLook`, `inkLines`): the
  casing as x-ray glass (wide), opened (medium), the compressor sectioned by hiding its quarters (close), refrigerant
  as colour code, the fan turned from its motor speed, numbered pins.

A new asset: a script in `assemblies/` from `parts.py` (a missing part goes into `parts.py`, generic), measured from
references (shape only: no reference pixel is ever projected or baked), dotted node names a film addresses, a moving
part's origin on its axis. `node tests/blender-parts.mjs` checks the scripts compile and, where Blender is installed,
builds the assembly and reads its nodes.
