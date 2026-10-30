#!/usr/bin/env node
// node tests/plugin-manifest.mjs — the plugin manifests: both parse, the one plugin is `dalang`, its skill path holds
// SKILL.md, and plugin.json's version is the newest released section of CHANGELOG.md (release.sh writes both).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const json = (f) => JSON.parse(readFileSync(path.join(root, ".claude-plugin", f), "utf8"));
const plugin = json("plugin.json"), market = json("marketplace.json");

assert.equal(plugin.name, "dalang", "plugin.json name");
assert.ok(Array.isArray(plugin.skills) && plugin.skills.length === 1, "plugin.json lists one skill path");
assert.ok(existsSync(path.join(root, plugin.skills[0], "SKILL.md")), "the skill path holds SKILL.md");
assert.equal(market.name, "dalang", "marketplace name");
assert.deepEqual(market.plugins.map((p) => [p.name, p.source]), [["dalang", "./"]], "one plugin, at the root");

const newest = /^## \[(\d+\.\d+\.\d+)\]/m.exec(readFileSync(path.join(root, "CHANGELOG.md"), "utf8"))?.[1];
assert.equal(plugin.version, newest, "plugin.json version = the newest ## [x.y.z] in CHANGELOG.md");
console.log("plugin-manifest: OK");
