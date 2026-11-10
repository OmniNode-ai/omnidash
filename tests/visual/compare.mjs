// OMN-23330 AC32: compare two visual captures (tests/e2e/visual-capture.omn23330.spec.ts) pixel by pixel.
// Usage: node tests/visual/compare.mjs <before dir> <after dir> [diff dir]. Prints one JSON line per image and a summary,
// and exits 1 when any image differs, is missing, or changes size. A pixel differs when any channel differs at all.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { PNG } from 'pngjs';

const [before, after, diffDir] = process.argv.slice(2);
if (!before || !after) { console.error('usage: compare.mjs <before> <after> [diff dir]'); process.exit(2); }
const names = [...new Set([...readdirSync(before), ...readdirSync(after)])].filter((name) => name.endsWith('.png')).sort();
let failed = 0;
for (const name of names) {
  const a = path.join(before, name); const b = path.join(after, name);
  if (!existsSync(a) || !existsSync(b)) { console.log(JSON.stringify({ name, missing: existsSync(a) ? 'after' : 'before' })); failed++; continue; }
  const x = PNG.sync.read(readFileSync(a)); const y = PNG.sync.read(readFileSync(b));
  if (x.width !== y.width || x.height !== y.height) { console.log(JSON.stringify({ name, size: [x.width, x.height, y.width, y.height] })); failed++; continue; }
  const diff = new PNG({ width: x.width, height: x.height });
  let changed = 0; let top = Infinity; let bottom = -1;
  for (let i = 0; i < x.data.length; i += 4) {
    const same = x.data[i] === y.data[i] && x.data[i + 1] === y.data[i + 1] && x.data[i + 2] === y.data[i + 2] && x.data[i + 3] === y.data[i + 3];
    diff.data[i] = same ? x.data[i] / 4 : 255; diff.data[i + 1] = same ? x.data[i + 1] / 4 : 0; diff.data[i + 2] = same ? x.data[i + 2] / 4 : 0; diff.data[i + 3] = 255;
    if (!same) { changed++; const row = Math.floor(i / 4 / x.width); top = Math.min(top, row); bottom = Math.max(bottom, row); }
  }
  if (changed > 0) {
    failed++;
    if (diffDir) { mkdirSync(diffDir, { recursive: true }); writeFileSync(path.join(diffDir, name), PNG.sync.write(diff)); }
  }
  console.log(JSON.stringify({ name, changed, rows: changed > 0 ? [top, bottom] : null }));
}
console.log(JSON.stringify({ images: names.length, differing: failed }));
process.exit(failed > 0 ? 1 : 0);
