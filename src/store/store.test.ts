import { describe, it, expect, beforeEach } from 'vitest';
import { useFrameStore } from './store';

describe('Frame store', () => {
  beforeEach(() => {
    useFrameStore.setState({ editMode: false, globalFilters: {} });
  });

  it('defaults to view mode', () => {
    expect(useFrameStore.getState().editMode).toBe(false);
  });

  it('toggles edit mode', () => {
    useFrameStore.getState().setEditMode(true);
    expect(useFrameStore.getState().editMode).toBe(true);
  });

  it('has empty global filters by default', () => {
    expect(useFrameStore.getState().globalFilters).toEqual({});
  });

  it('sets a time range filter', () => {
    useFrameStore.getState().setTimeRange({ start: '2026-04-01', end: '2026-04-10' });
    expect(useFrameStore.getState().globalFilters.timeRange).toEqual({
      start: '2026-04-01',
      end: '2026-04-10',
    });
  });
});
