// OMN-23330 AC19: money, count, percent, date and duration are formatted by one module, src/theme/format, and every page
// reads them from there. AC9's two formatting fixes live in it: a duration never shows a fraction of a millisecond, and
// a nonzero share under 0.05% reads "<0.1%" rather than a rounded "0.0%" that hides it (seen live 2026-11-10 on Runs:
// a model with 1 of 2,893 calls read 0.0%).
// Failure modes:
//   F1  a share under 0.05% reads 0.0%, or a zero share reads <0.1%, or a missing share reads 0%;
//   F2  a duration or its exact hover title shows a fraction of a millisecond;
//   F3  a count, an amount of money or a day changes format between pages (one helper per kind, from one module);
//   F4  a page still imports a formatter from one of the old module paths, so two copies can drift.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exactMs, formatDashboardCount, formatDashboardUsd, formatDuration, formatFullCount, formatShare, formatShortDay } from '@/theme/format';

const ROOT = path.resolve(__dirname, '../..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.(ts|tsx)$/.test(name) ? [file] : [];
  });
}

describe('OMN-23330 AC19: one format module', () => {
  it('F1: a share reads to one decimal, a nonzero share under 0.05% reads <0.1%, zero and missing stay distinct', () => {
    expect(formatShare(0.937)).toBe('93.7%');
    expect(formatShare(1 / 2893)).toBe('<0.1%');
    expect(formatShare(0.0004999)).toBe('<0.1%');
    expect(formatShare(0.0005)).toBe('0.1%');
    expect(formatShare(0)).toBe('0.0%');
    expect(formatShare(null)).toBe('Not recorded');
    expect(formatShare('0.25')).toBe('25.0%');
    expect(formatShare(0.99996)).toBe('>99.9%');
    expect(formatShare(1)).toBe('100.0%');
  });

  it('F2: durations and their exact titles never show a fraction of a millisecond', () => {
    expect(formatDuration(812.6)).toBe('813 ms');
    expect(formatDuration(12181.4)).toBe('12.2 s');
    expect(exactMs(12181.4)).toBe('12,181 ms');
    expect(exactMs(999.5)).toBe('1,000 ms');
    expect(exactMs('not a number')).toBeUndefined();
  });

  it('F3: one helper per kind: counts, money and days', () => {
    expect(formatDashboardCount(2893)).toBe('2.89K');
    expect(formatFullCount(2893)).toBe('2,893');
    // The pages' money: two decimals from $1 up, cut, never rounded up (OMN-22168, Jonah 2026-11-06).
    expect(formatDashboardUsd(1.2184)).toBe('$1.21');
    expect(formatShortDay('2026-11-10')).toBe('Nov 10');
    expect(formatShortDay('2026-01-05')).toBe('Jan 5');
    expect(formatShortDay('day-1')).toBe('day-1');
    expect(formatShortDay('2026-13-45')).toBe('2026-13-45');
  });

  it('F4: no source imports a formatter from an old module path', () => {
    const old = /from ['"](@\/lib\/(dashboard-count|currency|dashboard-currency)|@\/components\/format\/(duration|readable-time))['"]/;
    const offenders = sources(path.join(ROOT, 'src')).filter((file) => old.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('control: the import scan finds a planted old import', () => {
    expect(/from ['"]@\/lib\/dashboard-count['"]/.test("import { formatDashboardCount } from '@/lib/dashboard-count';")).toBe(true);
  });
});
