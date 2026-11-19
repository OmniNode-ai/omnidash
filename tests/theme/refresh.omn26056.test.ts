// OMN-26056: src/theme/refresh.ts takes its one interval from the declared config (the generated contract defaults),
// so a lab overlay slows every page down without a code edit. The default stays 30 s.
// Failure modes:
//   P1  the generated setting being ignored: REFRESH_INTERVAL_MS stays 30 s whatever the contract says;
//   P2  a page's own declared refresh going under the configured setting;
//   P3  the viewer's control offering a 30 s choice that is really the configured interval, under a wrong label.
import { afterEach, describe, expect, it, vi } from 'vitest';

async function refreshWith(seconds: number | null) {
  vi.resetModules();
  if (seconds !== null) {
    vi.doMock('@/config/generated/data-source-defaults', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/config/generated/data-source-defaults')>()),
      REFRESH_INTERVAL_SECONDS_DEFAULT: seconds,
    }));
  }
  return import('@/theme/refresh');
}

afterEach(() => { vi.doUnmock('@/config/generated/data-source-defaults'); vi.resetModules(); });

describe('OMN-26056 configured refresh interval', () => {
  it('the generated default is 30 s and nothing else moves', async () => {
    const refresh = await refreshWith(null);
    expect(refresh.REFRESH_INTERVAL_MS).toBe(30_000);
    expect(refresh.refreshInterval()).toBe(30_000);
    expect(refresh.pageRefreshMs(30)).toBe(30_000);
  });

  it('P1: a 120 s setting is every read and every page', async () => {
    const refresh = await refreshWith(120);
    expect(refresh.REFRESH_INTERVAL_MS).toBe(120_000);
    expect(refresh.refreshInterval()).toBe(120_000);
  });

  it('P2: a page declaring 30 s refreshes at the 120 s setting, and one declaring 300 s keeps its own', async () => {
    const refresh = await refreshWith(120);
    expect(refresh.pageRefreshMs(30)).toBe(120_000);
    expect(refresh.pageRefreshMs(300)).toBe(300_000);
  });

  it('P3: the setting appears among the viewer choices exactly once, labelled as what it is', async () => {
    const refresh = await refreshWith(120);
    const atSetting = refresh.VIEWER_REFRESH_CHOICES.filter((choice) => choice.ms === 120_000);
    expect(atSetting).toHaveLength(1);
    expect(atSetting[0]!.label).toBe('2m');
    expect(refresh.VIEWER_REFRESH_CHOICES.map((choice) => choice.label)).not.toContain('30s');
  });
});
