#!/usr/bin/env node
// node <skill-dir>/engine/three/sfx.mjs <project> --bake assets/bake/<hash>.bin --plan sfx.json [--at <s>] [--commercial]
// Reads a bake's impacts and latches and prints the <audio> rows plus the approval table for PRODUCTION.md.
// sfx.json = { materials, against, library, events?, base?, cap?, ... } (the options of impactSounds); ASSETS.json is read from the project.
// Exit 0: rows, nothing open. 1: a missing sample, an unplaced impact or a problem (fix, rerun). 2: usage or unreadable file.
// It never installs and never downloads: a missing sample is for find_media.
import fs from "node:fs";
import path from "node:path";
import { impactSounds, audioTags, productionTable } from "./sfx.js";

const a = process.argv.slice(2), dir = a[0] && !a[0].startsWith("--") ? a[0] : null;
const arg = (k) => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
const die = (m) => { console.error("sfx: " + m); process.exit(2); };
if (!dir || !arg("--bake") || !arg("--plan")) die("usage: sfx.mjs <project> --bake <file.bin> --plan <sfx.json> [--at <s>] [--commercial]");
const read = (f) => { try { return fs.readFileSync(path.resolve(dir, f)); } catch (e) { return die(`cannot read ${f}: ${e.code || e.message}`); } };
const json = (f, buf) => { try { return JSON.parse(buf.toString()); } catch { return die(`${f} is not valid JSON`); } };

const buf = read(arg("--bake"));
if (buf.length < 8 || buf.toString("latin1", 0, 4) !== "DLB1") die("not a bake file (no DLB1 header)");
const len = buf.readUInt32LE(4);
if (buf.length < 8 + len) die("bake file truncated");
const head = json("bake header", buf.subarray(8, 8 + len));
const plan = json(arg("--plan"), read(arg("--plan")));
let assets = [];
if (fs.existsSync(path.join(dir, "ASSETS.json"))) assets = json("ASSETS.json", read("ASSETS.json"));
const at = arg("--at") === null ? 0 : Number(arg("--at"));
if (!Number.isFinite(at)) die("--at must be a number of seconds");

let res;
try {
  res = impactSounds(head.impacts || [], { ...plan, assets, offset: at, commercial: plan.commercial === true || a.includes("--commercial"), latches: [...((head.report && head.report.latches) || []), ...(plan.latches || [])] });
} catch (e) { die(e.message); }
console.log(audioTags(res.rows, { track: plan.track }));
console.log("\n" + productionTable(res));
process.exit(res.problems.length || res.missing.length || res.unplaced.length || !res.rows.length ? 1 : 0);
