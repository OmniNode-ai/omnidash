// @vitest-environment node
// OMN-23330 AC22 (the operator's 2026-11-09 code review: "a 1.43 MB main bundle (427 KB gzipped)"): the main entry bundle
// is at most 250 KB gzipped, and echarts and three.js load only with the pages that use them.
// Measured on the lab 2026-11-10 at 047854e1: the entry was 1,429,420 bytes (428,167 gzipped) because the local pages and
// Settings were imported statically, and echarts sat in the local pages' chunk, so a page with no echarts chart (Overview,
// Settings) downloaded it.
// The test builds the app itself (vite build into node_modules/.cache, never /tmp), so it measures the current source.
// Failure modes:
//   B1  the entry grows past 250 KB gzipped;
//   B2  echarts or three.js is reachable from the entry through static imports (it would load on every page);
//   B3  echarts is reachable from the local pages' chunk through static imports (it would load on a page with no chart);
//   B4  the check is blind: no chunk holds echarts or three.js at all (a renamed marker would pass B2 and B3 vacuously).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'node_modules/.cache/omn23330-bundle-budget');
const ASSETS = path.join(OUT, 'assets');
const read = (name: string) => readFileSync(path.join(ASSETS, name), 'utf8');
const isEcharts = (code: string) => /zrender/.test(code) && /echarts/i.test(code);
const isThree = (code: string) => /WebGLRenderer/.test(code);

/** The chunks a chunk imports statically ("import ... from './x.js'"), not the ones it loads with import(). */
function staticImports(name: string): string[] {
  const code = read(name);
  return [...code.matchAll(/(?:^|[;}\s])import\s*(?:[\w${}*,\s]+from\s*)?["']\.\/([\w.-]+\.js)["']/g)].map((match) => match[1]!);
}
function closure(start: string): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) for (const next of staticImports(queue.pop()!)) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  return seen;
}

let entry = '';
beforeAll(async () => {
  // Vitest sets NODE_ENV=test, which Vite respects and which would build React's development bundle; the budget is for
  // the production build, so the build runs as production and the setting is put back after it.
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await build({ root: ROOT, mode: 'production', logLevel: 'silent', build: { outDir: OUT, emptyOutDir: true } });
  } finally {
    process.env.NODE_ENV = previous;
  }
  entry = /<script[^>]+src="\/assets\/([\w.-]+\.js)"/.exec(readFileSync(path.join(OUT, 'index.html'), 'utf8'))![1]!;
}, 600_000);

describe('OMN-23330 AC22: the entry bundle and where the chart libraries load', () => {
  it('B1: the entry is at most 250 KB gzipped', () => {
    const gzipped = gzipSync(readFileSync(path.join(ASSETS, entry))).length;
    expect({ entry, gzipped, under: gzipped <= 250 * 1024 }).toMatchObject({ under: true });
  });

  it('B4: some chunk holds echarts and some holds three.js (the markers still find them)', () => {
    const chunks = readdirSync(ASSETS).filter((name) => name.endsWith('.js'));
    expect(chunks.filter((name) => isEcharts(read(name))).length).toBeGreaterThan(0);
    expect(chunks.filter((name) => isThree(read(name))).length).toBeGreaterThan(0);
  });

  it('B2: neither echarts nor three.js is reachable from the entry by static imports', () => {
    const reached = [...closure(entry)];
    expect(reached.filter((name) => isEcharts(read(name)) || isThree(read(name)))).toEqual([]);
  });

  it('B3: the local pages load echarts only with a chart that draws with it', () => {
    const page = readdirSync(ASSETS).find((name) => /^LocalDashboardPage-[\w-]+\.js$/.test(name));
    expect(page).toBeDefined();
    expect(existsSync(path.join(ASSETS, page!))).toBe(true);
    expect([...closure(page!)].filter((name) => isEcharts(read(name)))).toEqual([]);
  });
});
