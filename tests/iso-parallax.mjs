#!/usr/bin/env node
// node tests/iso-parallax.mjs — engine/iso/parallax.js: depth 0 stays at rest, 1 follows the camera, between moves by
// the fraction (zoom in log); layers draw far to near with their own camera and leave it as given; a 2D layer's
// transform pans and scales about the frame centre; applyLayers sets SVG attributes and HTML styles; a bad depth is refused.
import assert from "node:assert/strict";
import { Iso } from "../engine/iso/iso.js";
import { isoLayer, drawLayers, layerTransform, applyLayers } from "../engine/iso/parallax.js";

const rest = { x: 0, y: 0, z: 2, k: 10 }, cam = { x: 4, y: -2, z: 3, k: 40 };
assert.deepEqual(isoLayer(cam, rest, 0), rest, "depth 0 never moves");
assert.deepEqual(isoLayer(cam, rest, 1), cam, "depth 1 is the subject's camera");
const half = isoLayer(cam, rest, 0.5);
assert.deepEqual([half.x, half.y, half.z], [2, -1, 2.5], "depth 0.5 pans half as far");
assert.ok(Math.abs(half.k - 20) < 1e-9, "and zooms by the square root of the ratio (log space): " + half.k);
assert.ok(isoLayer(cam, rest, 1.5).x > cam.x, "a near layer moves further than the subject");
assert.throws(() => isoLayer(cam, rest, -1), /depth/); assert.throws(() => isoLayer(cam, rest, NaN), /depth/);

const seen = [], iso = new Iso(new Proxy({}, { get: () => () => {} }), 1080, 1920);
drawLayers(iso, cam, rest, [
  { depth: 1.5, draw: (i) => seen.push(["near", i.cam.x, i.items.length]) },
  { depth: 0.25, draw: (i) => { seen.push(["far", i.cam.x]); i.box(0, 0, 0, 1, 1, 1, "#888888", { cull: false }); } },
  { depth: 1, draw: (i) => seen.push(["subject", i.cam.x, i.items.length]) },
]);
assert.deepEqual(seen.map((s) => s[0]), ["far", "subject", "near"], "layers draw far to near");
assert.deepEqual(seen.map((s) => s[1]), [1, 4, 6], "each with its own camera");
assert.equal(seen[1][2], 0, "each layer is flushed before the next");
assert.deepEqual(iso.cam, cam, "the camera is left as given");

const W = 1080, H = 1920, vRest = { x: 0, y: 0, zoom: 1 }, view = { x: 100, y: 0, zoom: 2 };
const map = (t, [px, py]) => [t.tx + t.s * px, t.ty + t.s * py];
assert.deepEqual(map(layerTransform(view, vRest, 0, W, H), [10, 20]), [10, 20], "a still 2D layer is untouched");
const sub = layerTransform({ x: 0, y: 0, zoom: 2 }, vRest, 1, W, H);
assert.deepEqual(map(sub, [W / 2, H / 2]), [W / 2, H / 2], "a zoom scales about the frame centre");
const pan = (d) => map(layerTransform({ x: 100, y: 0, zoom: 1 }, vRest, d, W, H), [W / 2, H / 2])[0] - W / 2;
assert.deepEqual([pan(0.3), pan(1), pan(1.5)], [-30, -100, -150], "a pan moves each layer by depth × the move");
assert.equal(layerTransform(view, vRest, 0.5, W, H).svg, layerTransform(view, vRest, 0.5, W, H).svg, "the same view gives the same transform");
assert.match(layerTransform(view, vRest, 1, W, H).css, /^translate\(-?[\d.]+px, -?[\d.]+px\) scale\(2\)$/);

const svgEl = { namespaceURI: "http://www.w3.org/2000/svg", attrs: { "data-depth": "0.4" }, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; } };
const divEl = { namespaceURI: "http://www.w3.org/1999/xhtml", attrs: { "data-depth": "1.4" }, style: {}, getAttribute(k) { return this.attrs[k]; } };
assert.equal(applyLayers({ querySelectorAll: () => [svgEl, divEl] }, view, vRest, W, H), 2);
assert.match(svgEl.attrs.transform, /^translate\(.+\) scale\(.+\)$/, "an SVG layer takes the attribute");
assert.ok(divEl.style.transform.includes("px") && divEl.style.transformOrigin === "0 0", "an HTML layer takes the style, top-left origin");
console.log("iso-parallax ok");
