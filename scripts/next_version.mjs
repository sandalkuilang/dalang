#!/usr/bin/env node
// The next release's version, from CHANGELOG.md's Unreleased section (stdin), never chosen by hand. The size of the change
// sets it, not its kind: a `### Redesign` entry (a very large overhaul of the design or the algorithms) is a MAJOR, and
// only with --major, the owner's call; a `### Rework` entry (a medium-to-large overhaul) is a MINOR; everything else
// (bug fixes, improvements, new features: Added, Changed, Fixed, Removed) is a PATCH.
// Releases batch weekly: one within 7 days of the last is refused, unless --urgent, which is a PATCH only.
//
// Usage: git show origin/main:CHANGELOG.md | node next_version.mjs <last tag> <last tag's unix time> [--urgent] [--major]
// Prints the version (x.y.z). Exit 1 with the reason on stderr when there is nothing to release, it is too soon, or a
// Redesign lacks --major.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2), urgent = args.includes('--urgent'), major = args.includes('--major');
const [prev, prevTime] = args.filter(a => !a.startsWith('--'));
const fail = m => { console.error(m); process.exit(1); };
const v = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(prev ?? '');
if (!v || !(Number(prevTime) > 0)) fail('usage: node next_version.mjs <last tag> <its unix time> [--urgent] [--major] < CHANGELOG.md');

const body = readFileSync(0, 'utf8').split('## [Unreleased]\n')[1]?.split(/\n## \[/)[0] ?? '';
const has = h => new RegExp(`^### ${h}\\s*\\n(?:\\s*\\n)*- `, 'm').test(body);
if (!/^- /m.test(body)) fail('CHANGELOG.md: Unreleased is empty, nothing to release');
if (has('Redesign') && !major) fail('Unreleased has ### Redesign: a MAJOR is the owner\'s call, rerun with --major (or file the entry under Rework)');
const bump = has('Redesign') ? 'major' : has('Rework') ? 'minor' : 'patch';

const DAY = 86400, age = Date.now() / 1000 - Number(prevTime), next = new Date((Number(prevTime) + 7 * DAY) * 1000).toISOString().slice(0, 10);
if (age < 7 * DAY && !urgent) fail(`the last release (${prev}) is ${Math.floor(age / DAY)} day(s) old: releases batch weekly, the next from ${next}. An urgent fix: --urgent (a PATCH only)`);
if (urgent && bump !== 'patch') fail(`--urgent is a PATCH only: Unreleased has ### ${bump === 'major' ? 'Redesign' : 'Rework'}, which waits for the weekly release (from ${next})`);

const [M, m, p] = v.slice(1).map(Number);
console.log(bump === 'major' ? `${M + 1}.0.0` : bump === 'minor' ? `${M}.${m + 1}.0` : `${M}.${m}.${p + 1}`);
