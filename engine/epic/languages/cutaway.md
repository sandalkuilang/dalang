# Cutaway — the annotated cross-section

An encyclopedia cross-section plate: the subject sliced open on bright paper, its inside in hand-tinted colour with fine
ink linework, numbered callouts and tiny people for scale. Big Object always: the sectioned subject fills 55–75 % of the
canvas and the cut face carries the data.

## Palette

```css
:root {
  --bg:#FAF6EC; --surface:#F1EADA; --surface-2:#E4DBC4;   /* paper / placards, lenses / quiet fills */
  --ink:#2B2A26; --ink-muted:#6E695D; --de-emphasis:#CFC7B2;
  --chart-1:#B5432F;  /* brick: machinery */   --chart-2:#3E6DA6;  /* steel blue: water, metal */
  --chart-3:#B57F1B;  /* amber: wood, energy */ --chart-4:#0E8E76;  /* teal: organic, coolant */
  --chart-5:#7B5397;  /* plum: rare fifth */
  --font-display:'Bitter',serif; --font-body:'Source Sans 3',sans-serif;
}
```

CVD-safe in this order. Compartments are a slot at 30–55 % opacity over the paper with 1–1.5 px ink on top; full
strength only for data marks, callout numbers and small parts. The cut face is one tint step stronger than the outside
of the same part. Nothing pure white.

## Type

`https://fonts.googleapis.com/css2?family=Bitter:wght@500;600;700;800&family=Source+Sans+3:wght@400;600;700&display=swap`.
Bitter 700/800 for titles (56–76 px) and hero numbers (96–150 px); Source Sans 3 for callouts: a bold lead-in
("**Lead-in** — the one fact, with its number") 15 px, text 14 px, captions ≥ 12.5 px. Callout numbers: a 22–26 px circle
in a full slot colour, figure in paper white, 700. All text horizontal.

## Geometry

- Radii 0, no shadows, no blur, no gradients: depth is tint steps and hatching.
- Lines: 1–1.5 px drawing, 3 px the cut edge (section line), 1 px leaders. One meaning each: dashed only a real hidden
  edge, dash-dot an axis.
- Wall thickness at every cut: a 6–14 px band of 45° hatching (1 px lines, 4 px apart).

## Data

Compartments ARE the chart (areas proportional to values, levels as ranks, a tank's fill height); flows are ducts
whose width scales with the value; conventional charts only inside a detail lens or on the placard (thin bars,
watercolour fill, 1 px ink outline, no grid). Everything labelled through the callouts.

## Signature devices

1. The section cut: one clean plane, 3 px section line, hatched walls, stronger interior tint.
2. Numbered callouts pinned to visible parts, 1 px leaders (one elbow, 4 px open-circle end), captions in margin
   columns with bold lead-ins, numbered clockwise from top-left. No label without a leader.
3. The detail lens: a 2 px ringed circle magnifying one area, tethered by two tangents; one or two per plate.
4. Tiny people (24–44 px ink figures at true scale, doing something): at least one.
5. The exploded part: one component pulled out along a dashed axis with a dimension line.
6. The museum placard: a `--surface` block, 2 px ink border, with title, standfirst and hero stat.

## Do

Draw rooms with contents (walls, floors, machinery), at least 8 small details. Cut the object you showed whole: the
inside is its own parts under its skin, never an invented interior; an inner part no source shows is drawn plain.
