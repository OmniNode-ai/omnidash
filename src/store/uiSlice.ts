// Lightweight UI-state slice. Covers `sidebarCollapsed` and `activePage`.
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
  // OMN-12833 (WS5): collapse the sidebar by default on mobile so the icon
  // rail shows but the content column gets full width. Desktop sessions start
  // expanded (false). window check guards SSR / test environments.
  sidebarCollapsed: typeof window !== 'undefined' && window.innerWidth <= 1024,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebarCollapsed: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  activePage: 'dashboard',
  setActivePage: (page) => set({ activePage: page }),
  traceFilter: null,
  setTraceFilter: (correlationId) => set({ traceFilter: correlationId }),
});
