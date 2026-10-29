# Charts — inline SVG with correct maths

Every chart is inline SVG with an explicit viewBox, every coordinate computed from named constants (`padL`, `plotW`,
`x(v) = padL + (v − min) / (max − min) × plotW`), never eyeballed. Colours are the language's `var(--chart-1…5)` in
fixed order. Prefer the language's own data furniture (buildings, compartments, dimensioned bars) to a plain chart.

## Hard rules

- **Truthful geometry:** length ∝ value, angle ∝ share, area ∝ value (radius ∝ √value); bars and columns zero-based.
- **No dual axis** (two charts, or index both to 100); small multiples share one scale; one chart, one job.
- **Text never wears the series colour:** labels in `--ink` / `--ink-muted`; text inside a fill picks white or ink by
  its luminance. Label selectively (endpoints, extremes, the hero series), directly, never in a floating legend.
- Thin marks, quiet chrome: bars ≤ 24–32 px with air, lines 2–3 px, hairline grid or none; few round ticks.
- A label goes inside a mark only if it fits with padding, else outside; never clip text.
- Numbers formatted for people (4.2M, 62 %); no emoji as icons.
- One story category: it gets the accent, the rest the de-emphasis grey.

## Recipes with traps

- **Donut** (≤ 5 segments, else waffle or stacked bar): circles with `stroke-dasharray`, rotated, never positioned by
  `stroke-dashoffset` (its sign is a classic trap). A stroke starts at 3 o'clock, clockwise. `C = 2πr`; segment i:
  dash `share_i × C − 3` (the gap), `rotate(−90 + Σ previous shares × 360, cx, cy)`. Key share in the hole.
- **Waffle:** 10×10 cells, filled = round(pct), one consistent fill order; write every cell, never approximate.
- **Pictogram ("7 in 10"):** one `<defs>` icon stamped with `<use>`; a partial value clips the last icon with a
  `<clipPath>` at its fraction.
- **Funnel:** width ∝ value, never equal steps; annotate the drop-offs.
- **Slope chart:** labels that collide (< ~18 px) are nudged with a leader; the data point never moves.
- **Timeline:** position ∝ time only when intervals matter (otherwise equal spacing, and say so); ≤ 7 events wide.
- **Line:** ≤ 3 series, each labelled at its end with a dot.
