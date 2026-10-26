#!/usr/bin/env node
// Palette measurement (scripts/palette.mjs): OKLCH lightness, dominant colours of a buffer and of a clip, and the
// figure-ground comparison (>= 0.2 OKLCH L separates). The video case runs only where ffmpeg runs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "scripts", "palette.mjs");
const { oklchL, dominant } = await import(script);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-palette-"));
const cli = (args) => spawnSync("node", [script, ...args], { encoding: "utf8" });

try {
  // 1. Lightness: white 1, black 0, mid grey ~0.6 (OKLab L is perceptual, not linear).
  assert.ok(Math.abs(oklchL([255, 255, 255]) - 1) < 0.002);
  assert.ok(Math.abs(oklchL([0, 0, 0])) < 0.002);
  assert.ok(Math.abs(oklchL([128, 128, 128]) - 0.5999) < 0.002);
  console.log("ok  oklchL: white 1, black 0, mid grey 0.60");

  // 2. Dominant colours of a synthetic 64x64 rgb24 frame: 75 % light warm, 25 % dark; one colour stays one entry.
  const px = 64 * 64, frame = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    const c = i < px * 0.75 ? [230, 220, 210] : [40, 40, 40];
    frame.set(c, i * 3);
  }
  const d = dominant(frame);
  assert.equal(d.length, 2);
  assert.deepEqual(d.map((c) => c.hex), ["#e8d8d8", "#282828"]);
  assert.deepEqual(d.map((c) => c.pct), [75, 25]);
  const one = dominant(Buffer.alloc(px * 3, 200));
  assert.equal(one.length, 1);
  assert.equal(one[0].pct, 100);
  console.log("ok  dominant: two colours 75/25 with their bin-centre hexes, one colour at 100 %");

  // 3. --compare: a light and a dark colour separate (exit 0); two lights merge (exit 3); bad input is exit 1.
  let r = cli(["--compare", "#f4f4f4", "#303030"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /separates/);
  r = cli(["--compare", "#f0f0f0", "#e0dcd4"]);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stdout, /merges/);
  r = cli(["--compare", "nothex", "#fff000"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAILED/);
  console.log("ok  --compare: light vs dark separates (0), light vs light merges (3), bad colour exits 1");

  // 4. A missing file is a failure, never an empty palette.
  r = cli([path.join(tmp, "nope.mp4")]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAILED/);
  console.log("ok  missing file: exit 1 with FAILED");

  // 5. A real clip: half light warm, half dark.
  const has = spawnSync("ffmpeg", ["-version"]);
  if (has.error || has.status !== 0) console.log("video case skipped: ffmpeg not found");
  else {
    const clip = path.join(tmp, "two.mkv");
    const f = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "color=c=0xf0e4dc:s=128x128:d=2,drawbox=x=0:y=0:w=64:h=128:color=0x202020:t=fill", "-c:v", "ffv1", clip], { encoding: "utf8" });
    assert.equal(f.status, 0, f.stderr);
    r = cli([clip]);
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.split("\n");
    const rows = lines.slice(lines.findIndex((l) => l.startsWith("Overall")) + 1)
      .map((l) => /^\s+(#[0-9a-f]{6})\s+([\d.]+) %\s+L ([\d.]+)$/.exec(l)).filter(Boolean)
      .map((m) => ({ hex: m[1], pct: Number(m[2]), L: Number(m[3]) }));
    assert.ok(rows.length >= 2, r.stdout);
    assert.ok(rows[0].pct + rows[1].pct >= 90, r.stdout);
    for (const c of rows.slice(0, 2)) assert.ok(c.pct >= 42 && c.pct <= 58, r.stdout);
    const [light, dark] = rows.slice(0, 2).sort((a, b) => b.L - a.L);
    assert.ok(light.L > 0.85 && dark.L < 0.35, r.stdout);
    console.log("ok  clip: two colours about half each, the light one L > 0.85, the dark one L < 0.35");
  }
  console.log("OK");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
