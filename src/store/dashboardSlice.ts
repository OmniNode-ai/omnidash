import type { StateCreator } from 'zustand';
import type { FrameStore, DashboardSlice } from './types';
import type { GridSize } from '@shared/types/component-manifest';

let itemCounter = 0;

export const createDashboardSlice: StateCreator<FrameStore, [], [], DashboardSlice> = (set) => ({
  activeDashboard: null,
  setActiveDashboard: (dashboard) => set({ activeDashboard: dashboard }),
  addComponentToLayout: (componentName, componentVersion, defaultSize: GridSize) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      itemCounter++;
      const newItem = {
        i: `component-${Date.now()}-${itemCounter}`,
        componentName,
        componentVersion,
        x: 0,
        y: Infinity, // react-grid-layout places at bottom
        w: defaultSize.w,
        h: defaultSize.h,
        config: {},
      };
      return {
        activeDashboard: {
          ...state.activeDashboard,
          layout: [...state.activeDashboard.layout, newItem],
          updatedAt: new Date().toISOString(),
        },
      };
    }),
  removeComponentFromLayout: (itemId) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      return {
        activeDashboard: {
          ...state.activeDashboard,
          layout: state.activeDashboard.layout.filter((l) => l.i !== itemId),
          updatedAt: new Date().toISOString(),
        },
      };
    }),
  updateLayout: (layout) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      return {
        activeDashboard: {
          ...state.activeDashboard,
          layout,
          updatedAt: new Date().toISOString(),
        },
      };
    }),
  updateComponentConfig: (itemId, config) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      return {
        activeDashboard: {
          ...state.activeDashboard,
          layout: state.activeDashboard.layout.map((l) =>
            l.i === itemId ? { ...l, config } : l
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    }),
});
