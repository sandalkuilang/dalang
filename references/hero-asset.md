# Hero asset: from 2D pictures to a 3D model, once

The user brings pictures (photos, a cutaway diagram, a manual page, a sketch), never a 3D model. The hero (the thing the
film is about, seen close and opened up: a pump, a hub, a lock, a valve) is modelled once as a Blender Python script in
`engine/blender/`, rendered stylized, and kept in the library for later films. Supporting objects take the cheaper
routes (`visual-direction.md` §1.1).

Blender (GPL) is a tool on the machine, never shipped. Missing (preflight's Blender row): `brief.md` Call 0 asks (size,
licence), never installed on its own; declined, the hero falls back to a CC0 model or a three.js build, logged.

## 1. Read the pictures

- 3–5 pictures (the user's first, then `find_media.mjs --type image`): the outside from two sides, the inside (cutaway,
  exploded view, teardown), a part list when one exists.
- Write `review/hero-<name>.md`: every part and its count, what is inside or touches what, materials and colours, real
  sizes. Sizes come from a stated dimension, a part standard or a cited spec, tagged like script numbers (`[src]`,
  `[calc]`, `[assume]`); a side no picture shows is built as such things are built, marked `[assume]`.
- Shape only: no pixel of a picture is ever projected, traced or baked onto the model.

## 2. Model it by script

- Library first: `engine/blender/parts.py` (pipes with bends, fans, motors, coils, compressors, valves, sheet casings,
  fasteners, wires, in real units). A missing part is added there, generic, named by what it is.
- The assembly is `engine/blender/assemblies/<name>.py`: dotted node names (`pump.impeller`, `hub.pawl`), a moving
  part's origin on its axis, a `.quarter` of each part the section cuts. Real counts (fins, teeth, blades, screws),
  rounded sheet edges, true wall thickness on the cut.
- Build: `Blender -b -P engine/blender/assemblies/<name>.py -- <out dir>` writes `<name>.glb`; `node
  tests/blender-parts.mjs` checks the scripts (and builds them where Blender is installed).

## 3. Check the still against the pictures

Snapshot the clip page (§4) at each planned shot size (`npx hyperframes snapshot --at <t>`) beside the pictures on one
contact sheet: parts and counts, proportions, what sits where. Fix a wrong or missing part in the script before
anything moves.

## 4. The motion recipe

The clip page (`<name>.clip.html`, e.g. `engine/blender/assemblies/condensing_unit.clip.html`) is a HyperFrames
composition on a paused timeline, every value a pure function of t:

- **Look:** the iso look (`isoLook`, `inkLines`) with a graded 3-tone matcap and thin ambient occlusion. Colour only as
  code (hot/cold, flow/return, the explained part); context in calm greys, never transparency.
- **Camera:** iso pan and zoom between a wide, a medium and a close station (`isoFrame`), never a tilt; the subject
  turns slowly one way. The close keeps repeated detail (fins, threads) above a few pixels per element.
- **Opening it:** the shell as blue x-ray glass fading on the way in; the section opened by one clip plane sweeping in
  from the camera side across the front parts and `.quarter` pieces, never by fading opacity.
- **Mechanism:** each moving part from its cause (a rotor from its rpm, a piston from its stroke rate). A fast rotor is
  one radial-gradient blur disc over faint blades. A fluid's path is coded along the whole loop, pulses at the
  driving rate.
- **Pins:** numbered on leader lines, short generic labels, entering on their beat, inside the frame.
- **Trap:** `EffectComposer` turns `renderer.autoClear` off: clear by hand before `composer.render()`, or the last
  frame shows through.
- **Check cheaply:** `npx hyperframes snapshot --at <times>` before any render.
