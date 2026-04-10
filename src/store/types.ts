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

export type FrameStore = EditModeSlice & FiltersSlice;
