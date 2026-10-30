#!/usr/bin/env node
// The next release's version, from CHANGELOG.md's Unreleased section (stdin), never chosen by hand. The size of the change
// sets it, not its kind: a `### Redesign` entry (a very large overhaul of the design or the algorithms) is a MAJOR, and
// only with --major, the owner's call; a `### Rework` entry (a medium-to-large overhaul) is a MINOR; everything else
// (bug fixes, improvements, new features: Added, Changed, Fixed, Removed) is a PATCH.
//
// Usage: git show origin/main:CHANGELOG.md | node next_version.mjs <last tag> [--major]
// Prints the version (x.y.z). Exit 1 with the reason on stderr when there is nothing to release or a
// Redesign lacks --major.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2), major = args.includes('--major');
const [prev] = args.filter(a => !a.startsWith('--'));
const fail = m => { console.error(m); process.exit(1); };
const v = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(prev ?? '');
if (!v) fail('usage: node next_version.mjs <last tag> [--major] < CHANGELOG.md');

const body = readFileSync(0, 'utf8').split('## [Unreleased]\n')[1]?.split(/\n## \[/)[0] ?? '';
const has = h => new RegExp(`^### ${h}\\s*\\n(?:\\s*\\n)*- `, 'm').test(body);
if (!/^- /m.test(body)) fail('CHANGELOG.md: Unreleased is empty, nothing to release');
if (has('Redesign') && !major) fail('Unreleased has ### Redesign: a MAJOR is the owner\'s call, rerun with --major (or file the entry under Rework)');
const bump = has('Redesign') ? 'major' : has('Rework') ? 'minor' : 'patch';

const [M, m, p] = v.slice(1).map(Number);
console.log(bump === 'major' ? `${M + 1}.0.0` : bump === 'minor' ? `${M}.${m + 1}.0` : `${M}.${m}.${p + 1}`);
