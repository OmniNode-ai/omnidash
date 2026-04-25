import type { StateCreator } from 'zustand';
import type { FrameStore, FiltersSlice } from './types';

// OMN-126: default the dashboard-level auto-refresh to 30s. The
// existing `AutoRefreshSelector` placeholder displayed "30s" as a
// hardcoded label, so this preserves the visual contract while
// finally wiring real behaviour. Users can still pick "Off" from
// the menu, which writes `null`.
const DEFAULT_AUTO_REFRESH_MS = 30_000;

export const createFiltersSlice: StateCreator<FrameStore, [], [], FiltersSlice> = (set) => ({
  globalFilters: { autoRefreshInterval: DEFAULT_AUTO_REFRESH_MS },
  setTimeRange: (range) =>
    set((state) => {
      const { timeRange: _, ...rest } = state.globalFilters;
      return { globalFilters: range === undefined ? rest : { ...rest, timeRange: range } };
    }),
  setFilter: (key, value) =>
    set((state) => {
      if (value === undefined) {
        const { [key]: _, ...rest } = state.globalFilters;
        return { globalFilters: rest };
      }
      return { globalFilters: { ...state.globalFilters, [key]: value } };
    }),
  setAutoRefreshInterval: (interval) =>
    set((state) => ({
      globalFilters: { ...state.globalFilters, autoRefreshInterval: interval },
    })),
  clearFilters: () => set({ globalFilters: { autoRefreshInterval: DEFAULT_AUTO_REFRESH_MS } }),
});
