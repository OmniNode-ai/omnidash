// OMN-23330 AC21 (the operator's 2026-11-09 code review: "polling from 5 s to 120 s"): every page and widget refreshes
// from one declared setting, src/lib/refresh.ts, and none polls faster than 30 s unless that file declares why.
// Measured 2026-11-10 before the change: about 40 refetchInterval values and named constants across src, from 2 s to
// 60 s (six delegation widgets at 5 s, three at 10 s, the Evidence page's reads at 15 s), each chosen where it was used.
// Failure modes:
//   P1  a widget or page sets its own interval (a number, or a constant of its own) instead of reading the setting;
//   P2  something polls faster than 30 s with no declared reason;
//   P3  a page declares a refresh other than the setting, or a page's declared refresh can go under the floor;
//   P4  the scan is blind: it misses a planted literal or a planted constant.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FASTER_REFRESH, REFRESH_INTERVAL_MS, VIEWER_REFRESH_CHOICES, VIEWER_REFRESH_WHY, pageRefreshMs, refreshInterval } from '@/lib/refresh';

const ROOT = path.resolve(__dirname, '../..');
const SKIP = /(\.test\.|\.stories\.|__tests__|src\/lib\/refresh\.ts$|src\/storybook\/)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.(ts|tsx)$/.test(name) ? [file] : [];
  });
}

/** Places that choose their own interval: a refetchInterval or setInterval delay that is a number, or a local constant. */
function ownIntervals(code: string): string[] {
  const found: string[] = [];
  for (const match of code.matchAll(/refetchInterval\s*:\s*([A-Za-z0-9_.]+)/g)) {
    const value = match[1]!;
    if (/^\d/.test(value) || /^[A-Z][A-Z0-9_]*$/.test(value)) found.push(match[0]);
  }
  for (const match of code.matchAll(/\bconst\s+([A-Z0-9_]*(?:POLL|REFRESH|INTERVAL)[A-Z0-9_]*)\s*=\s*[\d_]+/g)) found.push(match[0]);
  // The callback may hold statements of its own, so the delay is found within the call's first 160 characters.
  // A timer that reads data (its callback loads, fetches or refetches); a display tick such as a countdown is not a read.
  for (const match of code.matchAll(/setInterval\(([\s\S]{0,160}?),\s*([\d_]+|\(?[a-z][\w.?]*\s*\?\?\s*\d+\)?\s*\*\s*1000)\s*\)/g)) {
    if (/load|fetch|refresh|poll/i.test(match[1]!)) found.push(match[0]);
  }
  return found;
}

describe('OMN-23330 AC21: one refresh setting', () => {
  it('P1: no page or widget chooses its own interval', () => {
    const offenders = sources(path.join(ROOT, 'src')).filter((file) => !SKIP.test(file.split(path.sep).join('/')))
      .flatMap((file) => ownIntervals(readFileSync(file, 'utf8')).map((hit) => `${path.relative(ROOT, file)}: ${hit}`));
    expect(offenders).toEqual([]);
  });

  it('P2: the setting is 30 s, and every faster refresh is declared with its reason', () => {
    expect(REFRESH_INTERVAL_MS).toBe(30_000);
    expect(refreshInterval()).toBe(REFRESH_INTERVAL_MS);
    for (const [name, entry] of Object.entries(FASTER_REFRESH)) {
      expect({ name, ok: entry.ms >= 1_000 && entry.ms < REFRESH_INTERVAL_MS }).toEqual({ name, ok: true });
      expect({ name, why: entry.why.trim().length > 20 }).toEqual({ name, why: true });
      expect(refreshInterval(name as keyof typeof FASTER_REFRESH)).toBe(entry.ms);
    }
    // The viewer's faster choices are an opt-in with their declared requirement; the setting is among the choices.
    expect(VIEWER_REFRESH_CHOICES.map(choice => choice.ms)).toContain(REFRESH_INTERVAL_MS);
    if (VIEWER_REFRESH_CHOICES.some(choice => choice.ms < REFRESH_INTERVAL_MS)) expect(VIEWER_REFRESH_WHY.trim().length).toBeGreaterThan(20);
  });

  it('P3: every page declares the setting, and a page refresh never goes under it', () => {
    const pages = readdirSync(path.join(ROOT, 'src/pages/local')).filter((name) => name.endsWith('.page.yaml'));
    expect(pages.length).toBeGreaterThan(5);
    for (const name of pages) {
      const declared = /"refresh_interval_seconds":\s*(\d+)/.exec(readFileSync(path.join(ROOT, 'src/pages/local', name), 'utf8'))?.[1];
      expect({ name, declared: Number(declared) }).toEqual({ name, declared: REFRESH_INTERVAL_MS / 1000 });
    }
    expect(pageRefreshMs(30)).toBe(30_000);
    expect(pageRefreshMs(5)).toBe(REFRESH_INTERVAL_MS);
    expect(pageRefreshMs(null)).toBe(REFRESH_INTERVAL_MS);
    expect(pageRefreshMs(120)).toBe(120_000);
  });

  it('P4 control: the scan finds a planted literal, a planted constant and a planted page timer', () => {
    expect(ownIntervals('useQuery({ queryKey: [], refetchInterval: 5_000 })')).toHaveLength(1);
    expect(ownIntervals('const POLL_MS = 15_000;')).toHaveLength(1);
    expect(ownIntervals('useQuery({ refetchInterval: POLL_MS })')).toHaveLength(1);
    expect(ownIntervals('setInterval(() => load(), (doc.refresh ?? 30) * 1000)')).toHaveLength(1);
    expect(ownIntervals('const timer = setInterval(() => { void load(); }, (doc.dashboard.refresh_interval_seconds ?? 30) * 1000);')).toHaveLength(1);
    expect(ownIntervals('useQuery({ refetchInterval: refreshInterval() })')).toHaveLength(0);
    expect(ownIntervals('setInterval(() => { setSeconds((prev) => prev - 1); }, 1000)')).toHaveLength(0);
  });
});
