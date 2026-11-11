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
// OMN-23330 AC23: each page loads only its own stylesheet chunk, and no CSS file is over 150 KB. Measured on the lab
// 2026-11-10: the entry's CSS held all four page stylesheets (500 KB in one file); now the entry holds the app frame
// (94 KB) and the page stylesheets are four chunks of their own (sheet-*, largest 145 KB) that load with the pages.
//   S1  a CSS file exceeds the 150 KB limit;
//   S2  the entry loads a page stylesheet, or page-scoped rules (.local-dashboard-page--<page>, .ev-root) reach its CSS;
//   S3  the page stylesheet chunks are not built, or no page chunk loads them, so the check is blind.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

  it('S1: no CSS file is over 150 KB', () => {
    const sheets = readdirSync(ASSETS).filter((name) => name.endsWith('.css'));
    expect(sheets.length).toBeGreaterThan(3);
    expect(sheets.map((name) => ({ name, bytes: statSync(path.join(ASSETS, name)).size })).filter((sheet) => sheet.bytes > 150 * 1024)).toEqual([]);
  });

  it('S2: the entry loads no page stylesheet and no page-scoped rule', () => {
    const html = readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const linked = [...html.matchAll(/href="\/assets\/([\w.-]+\.css)"/g)].map((match) => match[1]!);
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.filter((name) => name.startsWith('sheet-'))).toEqual([]);
    // A frame rule may ask which page is open (.app:has(.ev-root) restyles the shell); a page's own rule names the page
    // class outside :has().
    const pageRule = (css: string) => /\.local-dashboard-page--[a-z]|\.ev-root\b/.test(css.replace(/:has\((?:[^()]|\([^()]*\))*\)/g, ''));
    expect(pageRule('.app:has(.ev-root[data-destination=x]) { color: red }')).toBe(false);
    expect(pageRule('.ev-root .row-main { display: grid }')).toBe(true);
    for (const name of linked) expect({ name, page: pageRule(read(name)) }).toEqual({ name, page: false });
  });

  it('S3: the four page stylesheets are their own chunks, and the page chunks load them', () => {
    const sheets = readdirSync(ASSETS).filter((name) => /^sheet-[\w-]+\.css$/.test(name));
    expect(sheets).toHaveLength(4);
    const code = readdirSync(ASSETS).filter((name) => name.endsWith('.js')).map(read).join('\n');
    for (const sheet of sheets) expect({ sheet, loaded: code.includes(sheet) }).toEqual({ sheet, loaded: true });
  });
});
