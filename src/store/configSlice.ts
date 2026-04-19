import type { StateCreator } from 'zustand';
import type { FrameStore } from './types';

export interface PlacementDraft {
  /** In-memory draft config (may differ from persisted config). */
  draftConfig: Record<string, unknown>;
  /** True when @rjsf reports validation errors for this placement. */
  hasValidationErrors: boolean;
}

export interface ConfigSlice {
  /** Selected placement id in edit mode. */
  selectedPlacementId: string | null;
  /** Per-placement in-memory drafts, keyed by placement id. */
  placementDrafts: Record<string, PlacementDraft>;

  setSelectedPlacementId: (id: string | null) => void;
  setDraftConfig: (placementId: string, config: Record<string, unknown>, hasErrors: boolean) => void;
  discardDraft: (placementId: string) => void;
  clearAllDrafts: () => void;
  /** True if any placement has validation errors (used to gate Save). */
  anyPlacementHasValidationErrors: () => boolean;
}

export const createConfigSlice: StateCreator<FrameStore, [], [], ConfigSlice> = (set, get) => ({
  selectedPlacementId: null,
  placementDrafts: {},

  setSelectedPlacementId: (id) => set({ selectedPlacementId: id }),

  setDraftConfig: (placementId, config, hasErrors) =>
    set((state) => ({
      placementDrafts: {
        ...state.placementDrafts,
        [placementId]: { draftConfig: config, hasValidationErrors: hasErrors },
      },
    })),

  discardDraft: (placementId) =>
    set((state) => {
      const next = { ...state.placementDrafts };
      delete next[placementId];
      return { placementDrafts: next };
    }),

  clearAllDrafts: () => set({ placementDrafts: {}, selectedPlacementId: null }),

  anyPlacementHasValidationErrors: () => {
    const { placementDrafts } = get();
    return Object.values(placementDrafts).some((d) => d.hasValidationErrors);
  },
});
