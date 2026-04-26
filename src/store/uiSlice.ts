// Lightweight UI-state slice. Currently only `sidebarCollapsed`.
// Lives separately from `configSlice` (which handles per-placement
// configuration drafts) and `editModeSlice` (which handles the
// edit/view mode toggle) so each slice has a single, clear concern.
//
// State here is in-memory only — no localStorage persistence — so
// each browser session starts with the sidebar expanded. Easy to add
// persistence later if users complain.
import type { StateCreator } from 'zustand';
import type { FrameStore, UISlice } from './types';

export const createUISlice: StateCreator<FrameStore, [], [], UISlice> = (set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebarCollapsed: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
});
