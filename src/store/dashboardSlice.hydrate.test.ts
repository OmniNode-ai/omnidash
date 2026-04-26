// @vitest-environment jsdom
//
// T2 acceptance: a localStorage value with one corrupted dashboard entry
// hydrates the rest and warns about the bad one.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const LS_LIST_KEY = 'omnidash.dashboards.list.v1';

describe('dashboardSlice.hydrateList — T2 corrupted-entry handling', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('drops corrupted entries and keeps valid ones', async () => {
    const valid = {
      id: 'dash-good',
      schemaVersion: '1.0',
      name: 'Good',
      layout: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      author: 'bret',
      shared: false,
    };
    const corrupted = { id: 'dash-bad', name: 'no schemaVersion' };
    localStorage.setItem(LS_LIST_KEY, JSON.stringify([valid, corrupted]));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Re-import the store after seeding localStorage so module-load hydration
    // runs against the seeded value.
    const { useFrameStore } = await import('./store');
    const dashboards = useFrameStore.getState().dashboards;

    expect(dashboards).toHaveLength(1);
    expect(dashboards[0].id).toBe('dash-good');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Dropping corrupted dashboard/));
    warn.mockRestore();
  });

  it('returns empty list on top-level parse error', async () => {
    localStorage.setItem(LS_LIST_KEY, '{not json');
    const { useFrameStore } = await import('./store');
    expect(useFrameStore.getState().dashboards).toEqual([]);
  });
});
