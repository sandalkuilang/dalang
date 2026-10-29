# engine/blender — hero assets, modelled once by script

A hero machine seen close is modelled once in [Blender](https://www.blender.org) (GPL; a tool on the machine, never
shipped) by a Python script (MIT), exported as glTF and reused by every film. How: `references/hero-asset.md`.

- `parts.py`: generic geometry in real units: the `MB` mesh builder (lathe, sweep, extrude, plate with a hole), matrix
  and path helpers (`place`, `basis`, `fillet`, `path_at`), and parts any machine uses, each returning named objects:
  `axial_fan`, `motor`, `housing` (a capped cylindrical shell; `cut=True` also exports `<prefix>.quarter`, the piece
  a section hides, and any part made cuttable follows that split), `pipe` (bends, brazed ends), `wires`, and the
  fasteners `pan_screw`, `hex_nut`, `washer`, `hex_bolt`. Nothing in it knows a topic; a part a film needs and the
  library lacks is added here, generic and named by what it is.
- `templates/hero.clip.tpl.html`: the HyperFrames clip of one hero GLB in the engine/three iso look (x-ray shell,
  sweeping section, rotor blur, coded flow, numbered pins, iso pan/zoom between stations). A film copies it and fills
  only the `HERO` block at the top: GLB path, node patterns per role, rotors, stations, beats, pins.

Assemblies are the owner's, not the skill's: each lives in `<videos folder>/library/hero/<name>/` (its `<name>.py`,
GLB and filled clip). An assembly puts the installed skill's `engine/blender` on `sys.path`, imports `parts`, and builds with:

```bash
Blender -b -P <videos folder>/library/hero/<name>/<name>.py -- <out dir>   # writes <name>.glb there
```

`node tests/blender-parts.mjs` checks `parts.py` and the template and, with Blender installed, builds
`tests/fixtures/blender_demo.py` (a fan on its motor in a cut housing with its `.quarter`, one pipe, four bolts).
