import type { StateCreator } from 'zustand';
import type { FrameStore, EditModeSlice } from './types';

export const createEditModeSlice: StateCreator<FrameStore, [], [], EditModeSlice> = (set) => ({
  editMode: false,
  setEditMode: (value) => set({ editMode: value }),
});
