// The stills of the last `hyperframes snapshot`: its newest artifacts dir by mtime (the dirs are uuids, so their names
// say nothing about order) and its first n PNGs in numeric order (HyperFrames adds a tail frame after the --at times).
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function newestStills(root, n) {
  const dirs = existsSync(root) ? readdirSync(root).map(d => path.join(root, d)).filter(d => statSync(d).isDirectory()) : [];
  const dir = dirs.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs).pop() ?? null;
  const pngs = dir ? readdirSync(dir).filter(f => f.endsWith('.png')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).slice(0, n) : [];
  return { dir, pngs };
}
