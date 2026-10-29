# Blueprint — the technical drawing

A cyanotype engineering sheet: near-white linework on blueprint blue, dimension arrows, monospace annotations. Big
Object or Specimen sheet: the line drawing carries the layout; panels are rare.

## Palette

```css
:root {
  --bg:#123A66; --bg-2:#0D3054;                          /* blueprint blue / title block, darker zones */
  --line:#D8E8F8; --line-soft:rgb(216 232 248 / 0.45);   /* the DRAWING only: outlines, dimensions, grid, never data */
  --ink:#EAF2FB; --ink-muted:#9FB8D4; --de-emphasis:#2A537F;
  --chart-1:#3E9BD6; --chart-2:#B8860B; --chart-3:#C75B9B; --chart-4:#6F9436;   /* chart-3 2.96:1: always labelled */
  --font-display:'Saira Condensed',sans-serif; --font-body:'IBM Plex Mono',monospace;
  --hatch-1:repeating-linear-gradient(45deg, #3E9BD6 0 1.5px, transparent 1.5px 7px);
}
```

Data marks use the four slots (CVD-separable on `--bg`); `--line` never carries a series.

## Type

`https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap`.
Saira Condensed 700 uppercase +0.04em for titles (56–72 px), stamps and hero numbers (90–140 px); IBM Plex Mono
400/500/600 for everything else (annotation 14 px, caption 12 px). Dimension labels 13 px mono on the line in a `--bg`
knockout.

## Geometry

- Radii 0, no shadows or gradients (a faint vignette allowed); no white fills or bright panels; rotate only stamps (±2°).
- Subject outlines 2.5 px `--line`, detail 1.25 px; grid 1 px `--line-soft` at 40 px cells under everything, faint.
- Dimension lines 1 px with arrowheads and knockout labels carrying real values; leaders end in a 4 px dot. Dashed only
  a real hidden edge, dash-dot an axis; a detail larger than scale is tagged "NTS".
- Double-rule frame 12 px in from the edge (2 px + 1 px).

## Data

Bars ≤ 24 px with a 2 px `--line` outline, filled with a slot at 85 % or its hatch, square ends, values in mono; no extra
grid. Prefer engineering forms: dimensioned bars, section fills, calibrated meters, donuts as gauge dials.

## Signature devices

1. Title block, bottom-right (double border, `--bg-2`: TITLE / DWG NO / SCALE / DATE / SOURCE); 16:9 only (`looks.md`).
2. Hatch fills for zones and one bar series (a free CVD secondary encoding).
3. Dimension arrows measuring real values: data as annotation.
4. Registration crosses at three corners, 1 px `--line-soft`.
5. A revision cloud round ONE highlighted fact, tagged "REV A".
