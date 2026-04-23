// NO PROTOTYPE SOURCE — v2-specific store slice; actions mirror prototype app.jsx:128-163
import type { StateCreator } from 'zustand';
import type { FrameStore, DashboardSlice } from './types';
import type { DashboardDefinition, DashboardLayoutItem } from '@shared/types/dashboard';
import type { GridSize } from '@shared/types/component-manifest';
import { createEmptyDashboard } from '@shared/types/dashboard';

const LS_LIST_KEY = 'omnidash.dashboards.list.v1';
const LS_ACTIVE_KEY = 'omnidash.lastActiveId.v1';

function persistList(dashboards: DashboardDefinition[]): void {
  try {
    localStorage.setItem(LS_LIST_KEY, JSON.stringify(dashboards));
  } catch {
    // storage unavailable — non-fatal
  }
}

function persistActiveId(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(LS_ACTIVE_KEY);
    } else {
      localStorage.setItem(LS_ACTIVE_KEY, id);
    }
  } catch {
    // storage unavailable — non-fatal
  }
}

function hydrateList(): DashboardDefinition[] {
  try {
    const raw = localStorage.getItem(LS_LIST_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as DashboardDefinition[];
    }
  } catch {
    // parse error — start fresh
  }
  return [];
}

function hydrateActiveId(): string | null {
  try {
    return localStorage.getItem(LS_ACTIVE_KEY) ?? null;
  } catch {
    return null;
  }
}

let itemCounter = 0;

function deriveActive(
  dashboards: DashboardDefinition[],
  activeDashboardId: string | null,
): DashboardDefinition | null {
  if (!activeDashboardId) return null;
  return dashboards.find((d) => d.id === activeDashboardId) ?? null;
}

// Hydrate on module load so the creator can use the values as initial state.
const _initialList = hydrateList();
const _initialActiveId = hydrateActiveId();
const _initialActive = deriveActive(_initialList, _initialActiveId);

export const createDashboardSlice: StateCreator<FrameStore, [], [], DashboardSlice> = (set, _get) => ({
  dashboards: _initialList,
  activeDashboardId: _initialActiveId,
  activeDashboard: _initialActive,

  // --- List-level actions ---

  createDashboard: (name: string) => {
    const nd = createEmptyDashboard(name, 'omnidash');
    set((state) => {
      const dashboards = [...state.dashboards, nd];
      persistList(dashboards);
      persistActiveId(nd.id);
      return {
        dashboards,
        activeDashboardId: nd.id,
        activeDashboard: nd,
      };
    });
    return nd;
  },

  renameDashboard: (id: string, newName: string) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) =>
        d.id === id
          ? { ...d, name: newName || 'Untitled', updatedAt: new Date().toISOString() }
          : d,
      );
      persistList(dashboards);
      const activeDashboard = deriveActive(dashboards, state.activeDashboardId);
      return { dashboards, activeDashboard };
    });
  },

  deleteDashboard: (id: string) => {
    set((state) => {
      const dashboards = state.dashboards.filter((d) => d.id !== id);
      persistList(dashboards);
      let activeDashboardId = state.activeDashboardId;
      if (activeDashboardId === id) {
        activeDashboardId = dashboards[0]?.id ?? null;
      }
      persistActiveId(activeDashboardId);
      const activeDashboard = deriveActive(dashboards, activeDashboardId);
      return { dashboards, activeDashboardId, activeDashboard };
    });
  },

  duplicateDashboard: (id: string) => {
    let duplicated: DashboardDefinition | null = null;
    set((state) => {
      const source = state.dashboards.find((d) => d.id === id);
      if (!source) return state;
      const copy: DashboardDefinition = {
        ...source,
        id: `dash-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: `${source.name} (copy)`,
        // Deep-copy layout so edits to the duplicate don't mutate the original.
        layout: JSON.parse(JSON.stringify(source.layout)),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      duplicated = copy;
      const dashboards = [...state.dashboards, copy];
      persistList(dashboards);
      persistActiveId(copy.id);
      return {
        dashboards,
        activeDashboardId: copy.id,
        activeDashboard: copy,
      };
    });
    return duplicated;
  },

  setActiveDashboardById: (id: string) => {
    set((state) => {
      persistActiveId(id);
      const activeDashboard = deriveActive(state.dashboards, id);
      return { activeDashboardId: id, activeDashboard };
    });
  },

  // --- Legacy setter (OMN-38/41 compat) ---

  setActiveDashboard: (dashboard: DashboardDefinition | null) => {
    set((state) => {
      if (dashboard === null) {
        persistActiveId(null);
        return { activeDashboard: null, activeDashboardId: null };
      }
      // Upsert into the list if not already present
      const exists = state.dashboards.some((d) => d.id === dashboard.id);
      const dashboards = exists
        ? state.dashboards.map((d) => (d.id === dashboard.id ? dashboard : d))
        : [...state.dashboards, dashboard];
      persistList(dashboards);
      persistActiveId(dashboard.id);
      return {
        dashboards,
        activeDashboardId: dashboard.id,
        activeDashboard: dashboard,
      };
    });
  },

  // --- Layout-level actions ---

  addComponentToLayout: (componentName: string, componentVersion: string, defaultSize: GridSize) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      itemCounter++;
      const newItem = {
        i: `component-${Date.now()}-${itemCounter}`,
        componentName,
        componentVersion,
        x: 0,
        y: Infinity,
        w: defaultSize.w,
        h: defaultSize.h,
        config: {},
      };
      const activeDashboard: DashboardDefinition = {
        ...state.activeDashboard,
        layout: [...state.activeDashboard.layout, newItem],
        updatedAt: new Date().toISOString(),
      };
      const dashboards = state.dashboards.map((d) =>
        d.id === activeDashboard.id ? activeDashboard : d,
      );
      return { activeDashboard, dashboards };
    }),

  insertComponentAt: (componentName, componentVersion, defaultSize, atIndex) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      itemCounter++;
      const newItem: DashboardLayoutItem = {
        i: `component-${Date.now()}-${itemCounter}`,
        componentName,
        componentVersion,
        x: 0,
        y: Infinity,
        w: defaultSize.w,
        h: defaultSize.h,
        config: {},
      };
      const layout = [...state.activeDashboard.layout];
      const safeIndex = Math.max(0, Math.min(atIndex, layout.length));
      layout.splice(safeIndex, 0, newItem);
      const activeDashboard: DashboardDefinition = {
        ...state.activeDashboard,
        layout,
        updatedAt: new Date().toISOString(),
      };
      const dashboards = state.dashboards.map((d) =>
        d.id === activeDashboard.id ? activeDashboard : d,
      );
      return { activeDashboard, dashboards };
    }),

  moveLayoutItem: (itemId, toIndex) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      const layout = [...state.activeDashboard.layout];
      const fromIndex = layout.findIndex((l) => l.i === itemId);
      if (fromIndex < 0) return state;
      // Removing the source shifts indices down by one when fromIndex < toIndex,
      // so adjust the target to preserve the user's intent ("drop before widget at toIndex").
      const adjusted = fromIndex < toIndex ? toIndex - 1 : toIndex;
      const [item] = layout.splice(fromIndex, 1);
      const safeIndex = Math.max(0, Math.min(adjusted, layout.length));
      if (safeIndex === fromIndex) return state; // no-op
      layout.splice(safeIndex, 0, item);
      const activeDashboard: DashboardDefinition = {
        ...state.activeDashboard,
        layout,
        updatedAt: new Date().toISOString(),
      };
      const dashboards = state.dashboards.map((d) =>
        d.id === activeDashboard.id ? activeDashboard : d,
      );
      return { activeDashboard, dashboards };
    }),

  removeComponentFromLayout: (itemId: string) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      const activeDashboard: DashboardDefinition = {
        ...state.activeDashboard,
        layout: state.activeDashboard.layout.filter((l) => l.i !== itemId),
        updatedAt: new Date().toISOString(),
      };
      const dashboards = state.dashboards.map((d) =>
        d.id === activeDashboard.id ? activeDashboard : d,
      );
      return { activeDashboard, dashboards };
    }),

  duplicateLayoutItem: (itemId: string) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      const source = state.activeDashboard.layout.find((l) => l.i === itemId);
      if (!source) return state;
      itemCounter++;
      const copy: DashboardLayoutItem = {
        ...source,
        i: `component-${Date.now()}-${itemCounter}`,
        // Deep-copy config so edits to the duplicate don't mutate the original.
        config: JSON.parse(JSON.stringify(source.config)),
      };
      const activeDashboard: DashboardDefinition = {
        ...state.activeDashboard,
        layout: [...state.activeDashboard.layout, copy],
        updatedAt: new Date().toISOString(),
      };
      const dashboards = state.dashboards.map((d) =>
        d.id === activeDashboard.id ? activeDashboard : d,
      );
      return { activeDashboard, dashboards };
    }),

  updateLayout: (layout: DashboardLayoutItem[]) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      const activeDashboard: DashboardDefinition = {
        ...state.activeDashboard,
        layout,
        updatedAt: new Date().toISOString(),
      };
      const dashboards = state.dashboards.map((d) =>
        d.id === activeDashboard.id ? activeDashboard : d,
      );
      return { activeDashboard, dashboards };
    }),

  updateComponentConfig: (itemId: string, config: Record<string, unknown>) =>
    set((state) => {
      if (!state.activeDashboard) return state;
      const activeDashboard: DashboardDefinition = {
        ...state.activeDashboard,
        layout: state.activeDashboard.layout.map((l) =>
          l.i === itemId ? { ...l, config } : l,
        ),
        updatedAt: new Date().toISOString(),
      };
      const dashboards = state.dashboards.map((d) =>
        d.id === activeDashboard.id ? activeDashboard : d,
      );
      return { activeDashboard, dashboards };
    }),

});

