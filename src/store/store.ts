import { create } from 'zustand';
import type { FrameStore } from './types';
import { createEditModeSlice } from './editModeSlice';
import { createFiltersSlice } from './filtersSlice';
import { createDashboardSlice } from './dashboardSlice';
import { createConversationSlice } from './conversationSlice';
import { createConfigSlice } from './configSlice';
import { createUISlice } from './uiSlice';

export const useFrameStore = create<FrameStore>()((...a) => ({
  ...createEditModeSlice(...a),
  ...createFiltersSlice(...a),
  ...createDashboardSlice(...a),
  ...createConversationSlice(...a),
  ...createConfigSlice(...a),
  ...createUISlice(...a),
}));
