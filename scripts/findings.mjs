// A reviewer's findings, one per line of review/fixes-<group>.md: `P0|P1|P2 | t=<time> | <test> | <exact change>`
// (review.md step 2), also when written as a list item, a table row or in bold. fix_ledger.mjs, fixcheck.mjs and
// studio.mjs read a file through this one parser, so a line one of them counts is never dropped by another.

// seconds from `t=12.3`, `t=1:05.5` or `t=.5` anywhere in the text; null when it names no time
export const timeOf = (s) => {
  const m = String(s ?? '').match(/\bt\s*=\s*(?:(\d+):)?(\d*\.?\d+)/);
  return m ? (m[1] ? +m[1] * 60 : 0) + +m[2] : null;
};

// a finding that blocks a ship (qc.md Step 7): a P0, or a Set / Reality / Clarity P1
export const blocking = (f) => f.sev === 'P0' || (f.sev === 'P1' && /^(set|reality|clarity)\b/i.test(f.test));

// { findings: [{ sev, t, test, change }], stray: lines that name a P0/P1/P2 but do not start with it }
export function parseFindings(text) {
  const findings = [], stray = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\W*(P[012])\b/);
    if (!m) { if (/\bP[012]\b/.test(line)) stray.push(line.trim()); continue; }
    const cells = line.slice(m.index + m[0].length).split('|').slice(1).map(s => s.replace(/\*+/g, '').trim());
    while (cells.length && !cells.at(-1)) cells.pop();
    findings.push({ sev: m[1], t: timeOf(cells[0]), test: cells[1] ?? '', change: cells.slice(2).join(' | ') });
  }
  return { findings, stray };
}
