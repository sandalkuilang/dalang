#!/usr/bin/env node
// The film's music bed from the tracks DALANG ships (engine/music: public domain / CC0, free for any use): no search,
// no network, so a film never ships without one because a media site was down. Copies <mood>.mp3 as assets/music.mp3
// and writes its ASSETS.json row (check_assets.mjs passes). A film's own assets/music.mp3 (the user's, or a searched
// track the user asked for) is kept. Express calls it from scaffold.mjs; Studio runs it at Gate 2.
//
// Usage: node music.mjs [project] [calm|bright|tense]   (default calm)
// Exit 0 written or kept, 1 a bad mood or an unreadable ASSETS.json.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MOODS = ['calm', 'bright', 'tense'];

// returns the line to print; throws on a bad mood or a broken ASSETS.json
export function musicBed(dir, mood = 'calm') {
  if (!MOODS.includes(mood)) throw new Error(`mood must be one of ${MOODS.join(', ')}`);
  const to = path.join(dir, 'assets', 'music.mp3');
  if (existsSync(to)) return 'kept assets/music.mp3 (the film already has a bed)';
  // | File | Mood | Work | Performer | Licence | Source |
  const c = readFileSync(path.join(SKILL, 'engine', 'music', 'CREDITS.md'), 'utf8').split('\n').find(l => l.startsWith(`| ${mood}.mp3 `)).split('|').map(s => s.trim());
  const mf = path.join(dir, 'ASSETS.json');
  let rows = [];
  if (existsSync(mf)) { rows = JSON.parse(readFileSync(mf, 'utf8')); if (!Array.isArray(rows)) throw new Error(`${mf} is not a JSON list`); }
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(path.join(SKILL, 'engine', 'music', `${mood}.mp3`), to);
  rows = rows.filter(r => r.file !== 'assets/music.mp3');
  rows.push({ file: 'assets/music.mp3', source: c[6], licence: c[5], author: c[4], title: c[3] });
  writeFileSync(mf, JSON.stringify(rows, null, 2) + '\n');
  return `assets/music.mp3 (${mood}, ${c[5]})`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dirArg, mood] = process.argv.slice(2);
  try { console.log(`OK     ${musicBed(path.resolve(dirArg ?? '.'), mood ?? 'calm')}`); }
  catch (e) { console.error(`FAILED ${e.message}`); process.exit(1); }
}
