import { create } from 'zustand';
import type { FrameStore } from './types';
import { createFiltersSlice } from './filtersSlice';
import { createUISlice } from './uiSlice';

// OMN-13602: the builder slices (editMode / dashboards / config / conversation)
// were removed with the widget builder. The store is now just the global filters
// and lightweight UI state (sidebar + active page).
export const useFrameStore = create<FrameStore>()((...a) => ({
  ...createFiltersSlice(...a),
  ...createUISlice(...a),
}));
