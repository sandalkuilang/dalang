#!/usr/bin/env node
// The fix loop's stop rule (review.md step 4, qc.md Step 7): reads this round's review/fixes-<group>.md, records it in
// review/fix-ledger.json under its review round (the review/round-<n> folders studio.mjs qc puts aside, + 1; or
// --round), and says what comes next:
//   STOP    clean: no blocking finding open (a P0, or a Set / Reality / Clarity P1)
//   STOP    the round cap, or the blocking findings did not fall since the last round: each printed OPEN, for the hand-off
//   REROUTE a finding open two rounds running (same group and test, within 1 s): another route, never another tweak
//   ROUND   a fix round
// Any other P1 and every P2 never start a round: they ship listed. A review that keeps finding new taste items is what
// made rounds run on; only what blocks a ship counts.
// Usage: node fix_ledger.mjs [dir] [--max-rounds 3] [--round <n>]
// Exit 0 clean, 1 a round to run, 3 stopped with findings open, 2 usage or an unreadable ledger (rerun; never clean).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { blocking, parseFindings } from './findings.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
const max = +opt('--max-rounds', 3), roundArg = opt('--round', null);
const dir = path.resolve(args[0] ?? '.'), rv = path.join(dir, 'review'), lf = path.join(rv, 'fix-ledger.json');
if (!(max >= 1) || (roundArg !== null && !(+roundArg >= 1))) { console.error('Usage: node fix_ledger.mjs [dir] [--max-rounds n] [--round n]'); process.exit(2); }

const ls = existsSync(rv) ? readdirSync(rv) : [];
const round = +(roundArg ?? ls.filter(d => /^round-\d+$/.test(d)).length + 1);
// a fixes file that says something but yields no finding was not read: never a clean round
const warn = why => { console.log(`WARN   ${why}: rerun, no round was decided`); process.exit(2); };
const open = ls.filter(f => /^fixes-.+\.md$/.test(f)).sort().flatMap(f => {
  const group = f.replace(/^fixes-|\.md$/g, ''), text = readFileSync(path.join(rv, f), 'utf8'), { findings, stray } = parseFindings(text);
  if (stray.length) warn(`review/${f}: ${stray.length} line(s) name a severity but do not start with it (\`${stray[0].slice(0, 60)}\`)`);
  if (!findings.length && text.trim()) warn(`review/${f} has text but no \`P0|P1|P2 | t=<time> | <test> | <change>\` line`);
  return findings.map(x => ({ group, ...x }));
});

let ledger = { rounds: {} };
if (existsSync(lf)) {
  try { ledger = JSON.parse(readFileSync(lf, 'utf8')); ledger.rounds ??= {}; }
  catch (e) { warn(`review/fix-ledger.json cannot be read (${e.message})`); }
  if (typeof ledger.rounds !== 'object' || Object.values(ledger.rounds).some(r => !Array.isArray(r))) warn('review/fix-ledger.json is not { rounds: { <n>: [findings] } }');
}
ledger.rounds[round] = open;
writeFileSync(lf, JSON.stringify(ledger, null, 1) + '\n');

// a round with no blocking finding is no baseline: a new P0 after it gets its round
const now = open.filter(blocking), was = ledger.rounds[round - 1]?.filter(blocking) ?? [], prev = was.length ? was : null;
const name = f => `${f.group} t=${f.t} ${f.sev} ${f.test}: ${f.change}`.slice(0, 200);
const same = (a, b) => a.group === b.group && a.test.toLowerCase() === b.test.toLowerCase() && a.t !== null && b.t !== null && Math.abs(a.t - b.t) <= 1;
if (open.length > now.length) console.log(`NOTE   ${open.length - now.length} finding(s) never start a round (a P2, or a P1 outside Set / Reality / Clarity): they ship listed`);
if (!now.length) { console.log('STOP   clean: no P0 and no Set / Reality / Clarity P1 open'); process.exit(0); }
const stop = why => { console.log(`STOP   ${why}: name each open finding in the hand-off`); now.forEach(f => console.log(`OPEN   ${name(f)}`)); process.exit(3); };
if (round > max) stop(`round cap: review round ${round} of ${max} fix round(s)`);
if (prev && now.length >= prev.length) stop(`not converging: ${prev.length} → ${now.length} blocking finding(s) since round ${round - 1}`);
for (const f of now) if (prev?.some(p => same(p, f))) console.log(`REROUTE ${name(f)}: open two rounds running, give it another route (another form, a simpler part, a changed shot), never another tweak`);
console.log(`ROUND  ${round}: ${now.length} blocking finding(s) in ${new Set(now.map(f => f.group)).size} group(s)`);
process.exit(1);
