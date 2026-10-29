# Hero asset: from 2D pictures to a 3D model, once

The user brings pictures, never a 3D model: photos, a cutaway diagram, a manual page, a screenshot, a sketch. Turning
them into the 3D subject is DALANG's job. The hero subject (the thing the film is about, seen close and opened up: a
pump, a bicycle hub, a lock, a microscope, a heart valve, a gearbox) is modelled once as a Blender Python script in
`engine/blender/`, rendered stylized, and kept in the library for every later film. Supporting objects keep the
cheaper routes (`visual-direction.md` §1.1: a CC0 model, an iso object, a drawn object).

Blender (GPL) is a tool on the machine, never shipped. Missing: a Call 0 question with its size and licence, never
installed on its own; declined, the hero falls back to a CC0 model or a three.js build, logged.

## 1. Read the pictures

- Gather 3-5 pictures (the user's first, then `find_media.mjs --type image`): the outside from two sides, the inside
  (a cutaway, an exploded view, a teardown photo), a part list when one exists.
- Write the subject's sheet in `review/hero-<name>.md`: every part and its count, how they sit (what is inside what,
  what touches what), materials and colours, and real sizes. A picture gives proportions; the sizes come from a
  stated dimension, a part standard or a cited spec, each tagged like a script number (`[src]`, `[calc]`, `[assume]`).
  A side no picture shows is filled from how such things are built, and marked `[assume]` on the sheet.
- Shape only: no pixel of a picture is ever projected, traced or baked onto the model.

## 2. Model it by script

- Library first: `engine/blender/parts.py` already has generic parts in real units (pipes with bends, fans, motors,
  coils, compressors, valves, sheet casings, fasteners, wires). A part it lacks is added there, generic and named by
  what it is, never by the film.
- The assembly is `engine/blender/assemblies/<name>.py`: dotted node names a film addresses (`pump.impeller`,
  `hub.pawl`), a moving part's origin on its axis, a `.quarter` of each part the section cuts. Detail where the eye
  goes: real counts (fins, teeth, blades, screws), rounded sheet edges, true wall thickness on the cut.
- Build: `Blender -b -P engine/blender/assemblies/<name>.py -- <out dir>` writes `<name>.glb`. `node
  tests/blender-parts.mjs` checks the scripts compile and, where Blender is installed, builds and reads the nodes.

## 3. Check the still against the pictures

Render one still per planned shot size (a `<name>.shot.html` beside the assembly, like
`condensing_unit.shot.html`) and put it next to the pictures on one contact sheet: parts and counts, proportions,
what sits where. A wrong or missing part is fixed in the script before anything moves.

## 4. The motion recipe

The clip page (`<name>.clip.html`, like `condensing_unit.clip.html`) is a HyperFrames composition on a paused
timeline, every value a pure function of t:

- **Look:** the engine/three iso look (`isoLook`, `inkLines`) with a graded 3-tone matcap and a thin ambient
  occlusion. Colour only as code (hot/cold, flow/return, the part being explained); context in calm greys, never
  transparency.
- **Camera:** iso pan and zoom between a wide, a medium and a close station (`isoFrame`), never a tilt; the subject
  turns slowly one way. The close keeps fine repeated detail (fins, threads, mesh) above a few pixels per element:
  any closer, it turns to noise and breaks the flat look.
- **Opening it:** the shell as blue x-ray glass that fades on the way in; the section opened by one clip plane that
  sweeps in from the camera side across the parts in front and the `.quarter` pieces, never by fading opacity.
- **Mechanism:** each moving part turns from its cause (a fan or rotor from its rpm, a piston from its stroke rate). A
  fast rotor reads as one radial-gradient blur disc over faint blades, never trailing copies. A fluid's path is coded
  along the whole loop, with pulses moving at the driving rate.
- **Pins:** numbered on leader lines, each with a short generic label, entering on its beat and kept inside the frame.
- **Trap:** `EffectComposer` turns `renderer.autoClear` off. Clear by hand before `composer.render()`, or the previous
  frame shows through as a shifted second copy.
- **Check cheaply:** `npx hyperframes snapshot --at <times>` before any render. Render only when the snapshots hold.
