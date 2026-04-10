import type { StateCreator } from 'zustand';
import type { FrameStore, FiltersSlice } from './types';

export const createFiltersSlice: StateCreator<FrameStore, [], [], FiltersSlice> = (set) => ({
  globalFilters: {},
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
  clearFilters: () => set({ globalFilters: {} }),
});
