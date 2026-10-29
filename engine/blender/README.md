# engine/blender — hero assets, modelled once by script

A hero machine seen close is modelled once in [Blender](https://www.blender.org) (GPL; a tool on the machine, never
shipped) by a Python script (MIT), exported as glTF and reused by every film. How: `references/hero-asset.md`.

- `parts.py`: generic parts in real units, each returning named objects: `finned_coil`, `axial_fan`, `motor`,
  `fan_motor_bracket`, `rotary_compressor` (`cut=True` exports a `.quarter` of each cuttable part), `accumulator`,
  `clamp_band`, `pipe`, `insulation`, `flare_nut`, `service_valve`, `expansion_valve`, `strainer`, `sheet_casing`,
  `divider`, `pcb_box`, `wall_bracket`, `wires`, fasteners. Nothing in it knows a topic; a missing part is added here,
  generic.
- `templates/hero.clip.tpl.html`: the HyperFrames clip of one hero GLB in the engine/three iso look (x-ray shell,
  sweeping section, rotor blur, coded flow, numbered pins, iso pan/zoom between stations). A film copies it and fills
  only the `HERO` block at the top: GLB path, node patterns per role, rotors, stations, beats, pins.

Assemblies are the owner's, not the skill's: each lives in `<videos folder>/library/hero/<name>/` (its `<name>.py`,
GLB and filled clip). An assembly puts the installed skill's `engine/blender` on `sys.path`, imports `parts`, and builds with:

```bash
Blender -b -P <videos folder>/library/hero/<name>/<name>.py -- <out dir>   # writes <name>.glb there
```

`node tests/blender-parts.mjs` checks `parts.py` and the template and, with Blender installed, builds
`tests/fixtures/blender_demo.py` (a fan on its motor in a sheet casing, a sectioned pump, one pipe).
