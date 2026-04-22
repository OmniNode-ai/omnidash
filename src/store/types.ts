export interface TimeRange {
  start: string;
  end: string;
}

export interface GlobalFilters {
  timeRange?: TimeRange;
  repo?: string;
  author?: string;
}

export interface EditModeSlice {
  editMode: boolean;
  setEditMode: (value: boolean) => void;
}

export type ScalarFilterKey = Exclude<keyof GlobalFilters, 'timeRange'>;

export interface FiltersSlice {
  globalFilters: GlobalFilters;
  setTimeRange: (range: TimeRange | undefined) => void;
  setFilter: (key: ScalarFilterKey, value: string | undefined) => void;
  clearFilters: () => void;
}

import type { DashboardDefinition, DashboardLayoutItem } from '@shared/types/dashboard';
import type { GridSize } from '@shared/types/component-manifest';

export interface DashboardSlice {
  // Multi-dashboard list (OMN-43)
  dashboards: DashboardDefinition[];
  activeDashboardId: string | null;
  // Derived accessor — reads dashboards.find(d => d.id === activeDashboardId)
  activeDashboard: DashboardDefinition | null;

  // List-level actions
  createDashboard: (name: string) => DashboardDefinition;
  renameDashboard: (id: string, newName: string) => void;
  deleteDashboard: (id: string) => void;
  /** Clone a dashboard (all layout items copied, fresh id, "(copy)" name suffix). Returns the copy or null if source is missing. */
  duplicateDashboard: (id: string) => DashboardDefinition | null;
  setActiveDashboardById: (id: string) => void;

  // Legacy setter — kept for backward compat with OMN-38/41 tests
  setActiveDashboard: (dashboard: DashboardDefinition | null) => void;

  // Layout-level actions
  addComponentToLayout: (componentName: string, componentVersion: string, defaultSize: GridSize) => void;
  removeComponentFromLayout: (itemId: string) => void;
  /** Clone a placement (same component + config, new id). New copy appended to layout. */
  duplicateLayoutItem: (itemId: string) => void;
  updateLayout: (layout: DashboardLayoutItem[]) => void;
  updateComponentConfig: (itemId: string, config: Record<string, unknown>) => void;
}

import type { ConversationSlice } from './conversationSlice';
export type { ConversationSlice };

import type { ConfigSlice } from './configSlice';
export type { ConfigSlice };

export type FrameStore = EditModeSlice & FiltersSlice & DashboardSlice & ConversationSlice & ConfigSlice;
