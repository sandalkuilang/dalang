# engine/blender — detailed assets, modelled once by script

The isometric and studio engines draw a set from primitives, which is right for a world and wrong for a hero
machine seen close: a compressor, a fan, a finned coil or a valve built from boxes reads as a toy. Here a hero
asset is modelled once in [Blender](https://www.blender.org) (GPL; a tool on the machine, never shipped) by a Python
script, exported as glTF and reused by every film that needs it. The scripts are DALANG's (MIT).

- `parts.py`: generic part functions in real units, each returning named objects: `finned_coil` (real fins at a fin
  pitch, the seen end fins punched with a drawn collar round each tube, staggered tubes, hairpins and return bends,
  L or straight), `axial_fan` (twisted, swept, cambered blades on a
  hub), `motor`, `fan_motor_bracket`, `rotary_compressor` (welded shell, feet, terminal box; inside stator and windings,
  rotor, crankshaft, rolling piston and vane, bearings; `cut` exports a `.quarter` of each cuttable part for the
  section), `accumulator`, `clamp_band`, `pipe` (filleted bends, brazed joints), `insulation`, `flare_nut`,
  `service_valve` (2-way, 3-way with Schrader port), `expansion_valve`, `strainer`, `sheet_casing` (panels with
  flanges, bell mouth, grille, louvres, screws), `divider`, `pcb_box`, `wall_bracket`, `wires`, fasteners.
- `assemblies/condensing_unit.py`: a refrigeration condensing unit on its wall bracket, built from those parts: 63
  named nodes, sheet edges rounded by a bevel the export applies, about 240k triangles, a few seconds to build. `Blender -b -P assemblies/condensing_unit.py -- <out dir>` writes
  `condensing_unit.glb` and `.blend` there.
- `assemblies/condensing_unit.clip.html`: a 7 s HyperFrames clip of the same asset, its stills (`npx hyperframes snapshot --at <t>`) and the motion recipe in
  `references/hero-asset.md` §4 (iso pan and zoom, a slow one-way turn, a blur disc for the fan, the whole refrigerant
  loop coded and pulsing, a sweeping clip-plane section, labelled pins).

A new asset (from 2D pictures to a model, step by step: `references/hero-asset.md`): a script in `assemblies/` from `parts.py` (a missing part goes into `parts.py`, generic), measured from
references (shape only: no reference pixel is ever projected or baked), dotted node names a film addresses, a moving
part's origin on its axis. `node tests/blender-parts.mjs` checks the scripts compile and, where Blender is installed,
builds the assembly and reads its nodes.
