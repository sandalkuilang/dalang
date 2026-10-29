# engine/blender — hero assets, modelled once by script

A hero machine seen close is modelled once in [Blender](https://www.blender.org) (GPL; a tool on the machine, never
shipped) by a Python script (DALANG's, MIT), exported as glTF and reused by every film. How: `references/hero-asset.md`.

- `parts.py`: generic parts in real units, each returning named objects: `finned_coil`, `axial_fan`, `motor`,
  `fan_motor_bracket`, `rotary_compressor` (`cut` exports a `.quarter` of each cuttable part), `accumulator`,
  `clamp_band`, `pipe`, `insulation`, `flare_nut`, `service_valve`, `expansion_valve`, `strainer`, `sheet_casing`,
  `divider`, `pcb_box`, `wall_bracket`, `wires`, fasteners. A missing part is added here, generic.
- `assemblies/condensing_unit.py`: the sample assembly (63 named nodes, ~240k triangles):
  `Blender -b -P assemblies/condensing_unit.py -- <out dir>` writes `condensing_unit.glb` and `.blend`.
- `assemblies/condensing_unit.clip.html`: a 7 s HyperFrames clip of it, the motion recipe of `hero-asset.md` §4.

`node tests/blender-parts.mjs` checks the scripts compile and, with Blender installed, builds the assembly.
