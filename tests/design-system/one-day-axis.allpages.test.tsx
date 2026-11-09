// OMN-23330 AC31: one day-axis component in src/theme/design-system/charts draws the day labels of every daily chart
// (Overview Runs per day, Tokens per day and Daily trend, the pass-rate line, and the Usage day charts), so the AC5
// end-label rule lives in one place. Measured 2026-11-09: 5 separate day-axis implementations and 10 .gdb-day-label rules.
// Failure mode F19: a daily chart draws its own day labels and its end labels drift from the shared rule.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const KIT = 'src/theme/design-system';

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full, pattern);
    return pattern.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [full] : [];
  });
}
const rel = (file: string) => path.relative(ROOT, file);

/** The old per-chart day-label markers: each one was a day axis of its own. */
const LEGACY = /\b(gdb-day-label|local-trend-ticks|usage-trend-date|usage-trend-axis|ins-axis|daily-metering-day)\b/;

/** The charts that draw a day axis, each of which must draw it with DayAxis. */
const DAILY_CHARTS = [
  'src/theme/design-system/charts/DayColumns.tsx',
  'src/pages/LocalDashboardPage.tsx',
  'src/pages/local/insight-charts.tsx',
  'src/pages/local/usage-analysis.tsx',
  'src/components/dashboard/usage/DailyMeteringTokens.tsx',
];

describe('OMN-23330 AC31: one day axis draws every daily chart', () => {
  it('no source file or stylesheet keeps an old per-chart day-label class', () => {
    const offenders = files(path.join(ROOT, 'src'), /\.(tsx|ts|css)$/)
      .flatMap((file) => readFileSync(file, 'utf8').split('\n').map((line, index) => [file, line, index + 1] as const))
      .filter(([, line]) => LEGACY.test(line))
      .map(([file, line, number]) => `${rel(file)}:${number}: ${line.trim().slice(0, 100)}`);
    expect(offenders).toEqual([]);
  });

  it.each(DAILY_CHARTS)('%s draws its day labels with DayAxis', (file) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    expect(source).toMatch(/<DayAxis\b/);
  });

  it('DayAxis lives in the chart kit and is exported from it', () => {
    expect(readFileSync(path.join(ROOT, `${KIT}/charts/index.ts`), 'utf8')).toMatch(/\bDayAxis\b/);
    expect(readFileSync(path.join(ROOT, `${KIT}/charts/DayAxis.tsx`), 'utf8')).toMatch(/export function DayAxis\b/);
  });

  it('positive control: the legacy scan finds the old markers in the base source it was written against', () => {
    expect(LEGACY.test('<span className="gdb-day-label" aria-hidden="true">')).toBe(true);
    expect(LEGACY.test('.local-trend-ticks > span:first-child { transform: none; }')).toBe(true);
    expect(LEGACY.test('<span className="ds-day-axis-label">')).toBe(false);
  });
});
