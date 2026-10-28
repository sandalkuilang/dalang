#!/usr/bin/env node
// The film's frame, written by code instead of a model: the engine into assets/, the host (src/index.tpl.html) with one
// line per group, each group's template (src/compositions/<group>.tpl.html) from the look's group template, its beat
// names filled in, the isometric look's one shared world (assets/world.js, filled once by the first group's builder) and
// each builder's whole brief (review/builder-<group>.md: what to read, the exact checks). Builders then only fill data
// with Edit: no builder writes boilerplate or a copy of the world, none guesses a command, and every group meets its
// neighbours on the host's times.
// Runs before the voice is done: beat names come from narration.txt's {text|name} markers.
//
// Usage: node scaffold.mjs <project> --look isometric-world|cutaway|blueprint|object-studio --groups a:beat1,b:beat5,…
//                          [--title "…"] [--illustration "label in the narration language"] [--music calm|bright|tense|none]
//   --music   the bundled music bed (engine/music, public domain / CC0, free for any use), default calm: copied as
//             assets/music.mp3 with its ASSETS.json row, under the voice at a low level with fades. No search, no listening.
//   --groups  each group's name and first beat, in narration order; a group ends where the next starts, the last at the
//             narration's end, and the first starts at 0 so the opening frame is never blank.
// A file that exists is kept, never overwritten (so a rerun is safe); exit 1 on a bad group list, nothing written.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const music = opt('--music') ?? 'calm', look = opt('--look'), groupArg = opt('--groups'), title = opt('--title') ?? 'DALANG film', label = opt('--illustration') ?? 'ILLUSTRATION';
const dir = path.resolve(args[0] ?? '.');
const die = m => { console.error(`FAILED: ${m}`); process.exit(1); };
const ISO = ['isometric-world', 'cutaway', 'blueprint'];
if (!ISO.includes(look) && look !== 'object-studio') die(`--look must be one of ${[...ISO, 'object-studio'].join(', ')}`);
if (!groupArg) die('--groups a:firstBeat,b:firstBeat,… is required');
const MUSIC = { calm: 'J. S. Bach, Goldberg Variations, Aria (Kimiko Ishizaka, Musopen)', bright: 'E. Grieg, Morning Mood (Musopen Symphony Orchestra)', tense: 'E. Grieg, In the Hall of the Mountain King (Musopen Symphony Orchestra)' };
if (music !== 'none' && !MUSIC[music]) die(`--music must be one of ${Object.keys(MUSIC).join(', ')} or none`);

const narr = path.join(dir, 'narration.txt');
if (!existsSync(narr)) die(`${narr} not found: the beat names come from its {text|name} markers`);
const beats = [...readFileSync(narr, 'utf8').matchAll(/\{[^|}]*\|([^}]+)\}/g)].map(m => m[1].trim());
const groups = groupArg.split(',').map(s => { const [name, from] = s.split(':').map(x => x?.trim()); return { name, from }; });
for (const g of groups) {
  if (!/^[a-z][a-z0-9-]*$/.test(g.name ?? '')) die(`group name "${g.name}": lower case letters, digits and - only (it is an id prefix)`);
  if (!beats.includes(g.from)) die(`group ${g.name}: no beat "${g.from}" in narration.txt (beats: ${beats.join(', ')})`);
}
if (new Set(groups.map(g => g.name)).size !== groups.length) die('a group name is used twice');
const order = groups.map(g => beats.indexOf(g.from));
if (order.some((x, i) => i && x <= order[i - 1])) die('groups must follow narration order, each starting on a later beat');

const iso = ISO.includes(look);
const tplDir = path.join(SKILL, 'engine', iso ? 'iso' : 'three', 'templates');
const put = (rel, text) => {
  const p = path.join(dir, rel);
  if (existsSync(p)) return console.log(`kept    ${rel} (exists)`);
  mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, text); console.log(`wrote   ${rel}`);
};

// the engine, once
const assets = path.join(dir, 'assets');
mkdirSync(assets, { recursive: true });
if (iso) {
  const src = [...readdirSync(path.join(SKILL, 'engine', 'iso')).filter(f => f.endsWith('.js')).map(f => path.join(SKILL, 'engine', 'iso', f)), path.join(SKILL, 'engine', 'three', 'editorial.js')];
  const fresh = src.filter(f => !existsSync(path.join(assets, path.basename(f))));
  fresh.forEach(f => cpSync(f, path.join(assets, path.basename(f))));
  console.log(`engine  ${fresh.length} file(s) copied to assets/ (${src.length - fresh.length} kept)`);
  // their origin and licence for check_assets.mjs, as engine/three/build.mjs writes for its own files
  const man = path.join(assets, '.engine.json');
  let eng = []; try { eng = JSON.parse(readFileSync(man, 'utf8')); } catch { /* none yet */ }
  if (!Array.isArray(eng)) eng = [];
  const REPO = 'https://github.com/sandalkuilang/dalang';
  for (const f of src) {
    const file = path.basename(f), from = path.relative(SKILL, f).split(path.sep).join('/');
    eng = eng.filter(r => r.file !== file);
    eng.push({ file, source: file === 'iso.js' ? `lemo-opuscar iso-infographic engine, vendored in DALANG (${REPO}, ${from})` : `DALANG engine, ${REPO} (${from})`, licence: 'MIT' });
  }
  // the film's own world (below), written from the skill's template and filled by its builder
  eng = eng.filter(r => r.file !== 'world.js');
  eng.push({ file: 'world.js', source: `this film, from DALANG ${REPO} (engine/iso/templates/iso-world.tpl.js)`, licence: 'own' });
  writeFileSync(man, JSON.stringify(eng, null, 2) + '\n');
} else if (!existsSync(path.join(assets, 'objectStudio.js'))) {
  const r = spawnSync(process.execPath, [path.join(SKILL, 'engine', 'three', 'build.mjs'), assets], { encoding: 'utf8' });
  if (r.status !== 0) die(`engine/three/build.mjs: ${(r.stderr || r.stdout).trim().split('\n').pop()}`);
  console.log('engine  engine/three installed in assets/');
} else console.log('engine  assets/objectStudio.js exists: kept');

// the host: one line per group on the narration's times
const span = (g, i) => {
  const next = groups[i + 1]?.from;
  return { start: i ? `{{${g.from}}}` : '0', dur: i ? `{{${next ?? 'END'} - ${g.from}}}` : `{{${next ?? 'END'}}}` };
};
let host = readFileSync(path.join(SKILL, 'engine', 'three', 'templates', 'host.tpl.html'), 'utf8').replace('__TITLE__', title);
host = host.replace(/^ *<!-- one line per group:.*-->$/m, groups.map((g, i) => {
  const s = span(g, i);
  return `  <div id="${g.name}" data-composition-id="${g.name}" data-composition-src="compositions/${g.name}.html" data-start="${s.start}" data-duration="${s.dur}" data-track-index="1"></div>`;
}).join('\n'));
if (iso) host = host
  .replace('<style>', '<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito+Sans:wght@400;600;800&display=swap" rel="stylesheet">\n<style>')
  .replace('{ prefix: "cap" }', '{ prefix: "cap", fonts: { body: "\'Nunito Sans\', sans-serif" } }');
if (music !== 'none') host = host.replace('  <!-- music -->', '  <audio id="music" class="clip" src="assets/music.mp3" data-start="0" data-duration="{{END}}" data-volume="0.14" data-fade-in="1.2" data-fade-out="2" data-track-index="3"></audio>');
put('src/index.tpl.html', host);

// the music bed: a bundled public-domain / CC0 track and its licence row, so check_assets.mjs passes
if (music !== 'none' && !existsSync(path.join(assets, 'music.mp3'))) {
  cpSync(path.join(SKILL, 'engine', 'music', `${music}.mp3`), path.join(assets, 'music.mp3'));
  const credits = readFileSync(path.join(SKILL, 'engine', 'music', 'CREDITS.md'), 'utf8').split('\n').find(l => l.startsWith(`| ${music}.mp3 `)).split('|').map(s => s.trim());
  const mf = path.join(dir, 'ASSETS.json');
  let rows = []; try { rows = JSON.parse(readFileSync(mf, 'utf8')); } catch { /* none yet */ }
  if (!Array.isArray(rows)) die(`${mf} is not a JSON list`);
  rows = rows.filter(r => r.file !== 'assets/music.mp3');
  rows.push({ file: 'assets/music.mp3', source: credits[6], licence: credits[5], author: credits[4], title: MUSIC[music] });
  writeFileSync(mf, JSON.stringify(rows, null, 2) + '\n');
  console.log(`music   assets/music.mp3: ${MUSIC[music]} (${credits[5]}), at 0.14 under the voice`);
}

// each group from the look's template; the first opens at 0, the last closes at the narration's end
const gtpl = readFileSync(path.join(tplDir, iso ? 'iso-group.tpl.html' : 'object-studio-group.tpl.html'), 'utf8');
groups.forEach((g, i) => {
  const next = groups[i + 1]?.from;
  let t = gtpl.replace(/\{\{__TO__ - __FROM__\}\}/g, span(g, i).dur)
    .replace(/b\("__TO__"\)/g, next ? `b("${next}")` : 'window.NARRATION_DURATION')
    .replace(/b\("__FROM__"\)/g, i ? `b("${g.from}")` : '0')
    .replace(/__GROUP__/g, g.name).replace(/__FROM__/g, g.from).replace(/__ILLUSTRATION__/g, label);
  t = t.replace(/__TO__/g, next ?? 'END').replace(/^<!--[\s\S]*?-->\n/, `<!-- group ${g.name}: ${g.from} → ${next ?? 'END'}, written by scaffold.mjs; fill its data from SPEC.md with Edit -->\n`);
  put(`src/compositions/${g.name}.tpl.html`, t);
});
mkdirSync(path.join(dir, 'compositions'), { recursive: true });
// the isometric look's one world, imported by every group: written once, never one copy per group
if (iso) put('assets/world.js', readFileSync(path.join(tplDir, 'iso-world.tpl.js'), 'utf8'));

// each builder's whole brief, so the main agent sends one line and no builder guesses a command or reads a source
const q = x => `'${String(x).replace(/'/g, `'\\''`)}'`, sk = q(SKILL), card = `${sk}/engine/${iso ? 'iso' : 'three'}/templates/${iso ? 'iso' : 'object-studio'}-API.md`;
groups.forEach((g, i) => {
  const next = groups[i + 1]?.from, own = beats.slice(beats.indexOf(g.from), next ? beats.indexOf(next) : beats.length);
  const others = groups.filter(o => o !== g).map(o => o.name).join(', ') || 'none';
  const world = !iso ? `The set is the engine's object-studio kit, imported unchanged (API card).`
    : i === 0 ? `**First, before anything else:** fill \`assets/world.js\` once from SPEC.md OBJECTS: every object any group shows, as build() specs (the card's forms, real sizes, true parts), COLORS from the SPEC palette, VALUES at rest. Data only, no drawing code. The other groups (${others}) import it and wait for it, so write it in your first Write; that Write replaces the stub whole, its \`STUB\` line included.\n**Dense and true, the film's quality lives here:** each place is furnished, never a bare slab: 6 or more set props around the subject (furniture, fixtures, plants, tools, signs, cables), ground and walls in distinct materials; each made object is built from the parts that make it known at a glance (a pump: body, impeller housing, flanges, bolts; a laptop: lid, hinge, keys, ports; a boat: hull, deck, mast, rigging), never one plain box; every person the narration names or implies is a \`figure\` at real height, in clothes that stand off its ground.\nMark the hero spec \`hero: true\` (15+ parts, grouped base, structure, mechanism, controls, the subject) and list in \`PINS\` every part an overlay labels, each name unique.\n**Then prove it, before any snapshot:** \`node ${sk}/scripts/iso_audit.mjs . --ground <your slab or plot part>\` (and \`--cut 1\` when a beat cuts the hero open). Exit 3 names each part that floats, sinks into another object, or a pipe that passes through a solid or ends in mid-air: fix the geometry (a foot, a bracket, a run that lands on a port), never by hiding or nudging the part, and rerun until it exits 0. Exit 2 is a WARN: rerun, never read it as clean.`
    : `\`assets/world.js\` (COLORS, WORLD, VALUES, PINS) is written by the \`${groups[0].name}\` builder: import it, never copy, redraw or edit it; an object it lacks goes in your report. Your work is CAMERA (SPEC poses), values(t) for the keys you animate, the layers and the overlays. It is a stub until that builder's first Write: write your template first, then wait for it before your snapshot, never snapshot a stub: \`for i in $(seq 27); do grep -q '^export const STUB' assets/world.js || break; sleep 20; done; grep -q '^export const STUB' assets/world.js && echo STILL A STUB || echo world ready\` (Bash timeout 600000; still a stub after two waits: report it and stop).`;
  put(`review/builder-${g.name}.md`, [
    `# Builder brief: group \`${g.name}\` (beats ${own.join(', ')})`,
    '',
    `Film: ${dir}. Skill: ${SKILL}. Other groups at the same time: ${others}.`,
    `Edit only \`src/compositions/${g.name}.tpl.html\`${iso && i === 0 ? ' and `assets/world.js` (one Write: it is a stub)' : ''}, with Edit (never a whole-file rewrite, never \`sed -i\` or a script).`,
    '',
    `**Read, once each, nothing else:** \`SPEC.md\`; your rows of \`storyboard.md\` (\`grep -n -E '${own.join('|')}' storyboard.md\`); ${card}; your template; \`assets/examples.js\` (finished specs: copy their density, part count and detail per object). No other engine source in \`assets/\` (every signature is on the card), no README, no \`references/\`, no \`/hyperframes\` skill (the template meets the render contract), no \`words.json\`, no other group's file, no other film.`,
    `**Cues** (once \`audio/beats.json\` exists): \`node ${sk}/scripts/cues.mjs . --beats ${own.join(',')}\`: each word as its \`w("word", n)\` call. Every time is a cue; never a number of seconds.`,
    '',
    world,
    '',
    `**Check, one Bash per round:** \`node ${sk}/scripts/fill_times.mjs src/compositions/${g.name}.tpl.html compositions/${g.name}.html && node ${sk}/scripts/fill_times.mjs src/index.tpl.html index.html >/dev/null && node ${sk}/scripts/lint_scene.mjs . 2>&1 | tail -8\``,
    `**Look, at most 3 rounds:** \`npx hyperframes snapshot --at <every storyboard row of yours: its start + 0.5, comma-separated> --no-end --describe false -o style-frames/${g.name}/ 2>&1 | tail -3\` (seconds from the cue table), then open its contact sheet (\`style-frames/${g.name}/contact-sheet*.jpg\`) once: recompose on text on a plain ground, low contrast, text outside the safe zone, a shape untrue to its reference, the beat's subject under a third of the frame height, bare ground over half the frame, a person the narration names missing, a moving thing (dots, flow, parts) that does not stand off its ground, a shot not the size and move its storyboard row names, overlay text under its SPEC size (labels 40 px, headlines 64 px on the 1080 px canvas) or faint, a frame greyed whole (focus greys the context, never the subject). All of a round's fixes in one message.`,
    '',
    'Budget: about 25 turns, 30 at most, your context under 150K (everything you read is paid again on every later turn). Report in at most 12 lines: files; each check as PASS (its command and the result line it printed), FAIL (what failed) or UNVERIFIED (not run, or its output unreadable), never "done", and a PASS from before your last edit of that file does not count; open issues (a SPEC number you needed changed: report it, never edit SPEC.md). The same defect twice means a different route (another form, a simpler part, a changed shot), never a third try of the same fix. Stop once every check passes.',
    '',
  ].join('\n'));
});
console.log(`groups  ${groups.map((g, i) => `${g.name} ${g.from}→${groups[i + 1]?.from ?? 'END'}`).join(' · ')}`);
console.log(`next    one dalang-builder per group, all in one message, each prompt only: Read review/builder-<group>.md in ${dir} and follow it.`);
