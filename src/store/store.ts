import { create } from 'zustand';
import type { FrameStore } from './types';
import { createEditModeSlice } from './editModeSlice';
import { createFiltersSlice } from './filtersSlice';

export const useFrameStore = create<FrameStore>()((...a) => ({
  ...createEditModeSlice(...a),
  ...createFiltersSlice(...a),
}));
