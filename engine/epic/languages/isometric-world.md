# Isometric World — the miniature diorama

A tiny model world on a floating slab where the data IS the architecture. Big Object (one diorama) or a story path (a
road or rail through stations); the empty sky around the slab is the breathing zone.

## Projection and light

True isometric only (`engine/iso` and `isoCamera` project for you; inline SVG uses `X = X0 + (x − y) × 0.866`,
`Y = Y0 + (x + y) × 0.5 − z`, x south-east, y south-west, z up). Top lightest, left face the base colour, right face
darkest, as `tri()`/`triad()` draw them; one light everywhere. Only signs and labels stand upright (billboards).

## Palette

```css
:root {
  --bg:#E8EDEF;                       /* sky: cool paper, a huge soft radial glow behind the slab */
  --ground:#CFD8DB; --ground-2:#B8C2C6; /* slab top / slab sides */
  --ink:#22333B; --ink-muted:#5D6E75; --de-emphasis:#AEB9BD;
  --chart-1:#D9503F; --chart-1-top:#E58272; --chart-1-dark:#A93A2D;   /* coral */
  --chart-2:#009B7D; --chart-2-top:#4DB49D; --chart-2-dark:#007259;   /* teal: 2.97:1 on sky, always direct-labelled */
  --chart-3:#4A55C8; --chart-3-top:#7A82D8; --chart-3-dark:#363F9B;   /* indigo */
  --chart-4:#B57300; --chart-4-top:#CC9440; --chart-4-dark:#8A5700;   /* amber */
}
```

Each slot is a face triad (top / side = chart colour / dark), CVD-safe in this order. Props reuse the triads and greys;
nothing outside this set; ≤ 4 data colours.

## Type

The one typeface (`engine/three/font.js`); the weight is the role. Title 700, 56–72 px, hero numbers 700, 100–150 px · section
20 px 600 uppercase +0.06em · body 16 px 400 · caption 13 px 500. Values on signposts, flags or billboard tags with a 2 px ink stem.

## Geometry

- Every diorama sits on a 20–28 px slab (diamond top, two sides) with a flat ellipse shadow: the world floats.
- Prop outlines 1.5–2 px ink; buildings may go outline-free. Radii 0 (tags 6 px).
- 6–12 small props (trees, ducts, cones, plants), never more than 2 per data element.

## Data as architecture

Bars are buildings (equal footprints, height ∝ value, value on a rooftop flag); shares are districts of truly
proportional area; a timeline is the road (distance ∝ time when intervals matter); meters are tanks or silos with a fill
level. Every value direct-labelled; no floating panels, no gridlines, never a flat chart dropped into the world.

## Signature devices

1. The floating slab with one chipped or stepped corner.
2. Signpost values planted beside what they measure.
3. The connecting road: dashed centre line, small vehicles or a walking figure.
4. Sky props, sparingly in the empty zone: 2–3 flat iso clouds, one balloon or bird.
5. Cutaway wedge: one building sliced open for a key detail.

## Don't

Gradients on faces (flat triads only), blurred shadows (flat ellipses only), a crowded sky, eyeballed parallelograms.
