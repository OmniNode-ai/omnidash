// Lightweight UI-state slice. Covers `sidebarCollapsed` and `activePage`.
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
  activePage: 'dashboard',
  pageParams: {},
  // Setting a page clears any prior params unless new ones are supplied, so a
  // plain `setActivePage('tasks')` always lands on the unfiltered view.
  setActivePage: (page, params = {}) => set({ activePage: page, pageParams: params }),
  howCalcOpen: false,
  openHowCalc: () => set({ howCalcOpen: true }),
  closeHowCalc: () => set({ howCalcOpen: false }),
});
