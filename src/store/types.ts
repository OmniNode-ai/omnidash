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
  activeDashboard: DashboardDefinition | null;
  setActiveDashboard: (dashboard: DashboardDefinition | null) => void;
  addComponentToLayout: (componentName: string, componentVersion: string, defaultSize: GridSize) => void;
  removeComponentFromLayout: (itemId: string) => void;
  updateLayout: (layout: DashboardLayoutItem[]) => void;
  updateComponentConfig: (itemId: string, config: Record<string, unknown>) => void;
}

import type { ConversationSlice } from './conversationSlice';
export type { ConversationSlice };

export type FrameStore = EditModeSlice & FiltersSlice & DashboardSlice & ConversationSlice;
