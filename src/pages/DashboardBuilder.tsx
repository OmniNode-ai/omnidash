import { useCallback, useEffect, useRef } from 'react';
import { useFrameStore } from '@/store/store';
import { useRegistry } from '@/registry/RegistryProvider';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { ComponentPalette } from '@/components/dashboard/ComponentPalette';
import { ComponentConfigPanel } from '@/config/ComponentConfigPanel';
import type { DashboardLayoutItem } from '@shared/types/dashboard';
import { layoutPersistence } from '@/layout/layout-persistence';
import * as s from './DashboardBuilder.css';

export function DashboardBuilder() {
  const {
    activeDashboard,
    editMode,
    setEditMode,
    addComponentToLayout,
    updateLayout,
    removeComponentFromLayout,
    setActiveDashboard,
    selectedPlacementId,
    setSelectedPlacementId,
    placementDrafts,
    updateComponentConfig,
    clearAllDrafts,
    anyPlacementHasValidationErrors,
  } = useFrameStore();
  const registry = useRegistry();
  const snapshotRef = useRef<DashboardLayoutItem[] | null>(null);

  // Load the persisted "default" layout on mount.
  // If absent (404) or invalid (no layout array) we keep the current empty-state behavior.
  useEffect(() => {
    layoutPersistence.read('default').then((persisted) => {
      // Guard: persisted must be a valid DashboardDefinition (has a layout array).
      if (!persisted || !Array.isArray(persisted.layout)) return;
      // Read live state from the store (not the stale closure) to avoid clobbering
      // a dashboard that was loaded between mount and the async read resolving.
      const currentDashboard = useFrameStore.getState().activeDashboard;
      if (!currentDashboard) {
        setActiveDashboard(persisted);
      }
      // If a dashboard is already active, do not overwrite it — the persisted
      // layout is for the cold-start case only.
    }).catch((err: unknown) => {
      console.warn('[DashboardBuilder] failed to load persisted layout:', err);
    });
    // Intentionally empty: runs once on mount. setActiveDashboard is stable (Zustand).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = useCallback(() => {
    if (activeDashboard) {
      snapshotRef.current = [...activeDashboard.layout];
    }
    setEditMode(true);
  }, [activeDashboard, setEditMode]);

  const handleSave = useCallback(() => {
    // Flush all drafts into the persisted layout before clearing.
    if (activeDashboard) {
      for (const [placementId, draft] of Object.entries(placementDrafts)) {
        updateComponentConfig(placementId, draft.draftConfig);
      }
    }
    clearAllDrafts();
    snapshotRef.current = null;
    setEditMode(false);
  }, [activeDashboard, placementDrafts, updateComponentConfig, clearAllDrafts, setEditMode]);

  const handleDiscard = useCallback(() => {
    if (snapshotRef.current && activeDashboard) {
      updateLayout(snapshotRef.current);
    }
    clearAllDrafts();
    snapshotRef.current = null;
    setEditMode(false);
  }, [activeDashboard, updateLayout, clearAllDrafts, setEditMode]);

  const handleAddComponent = useCallback(
    (name: string) => {
      const component = registry.getComponent(name);
      if (component) {
        addComponentToLayout(name, component.manifest.version, component.manifest.defaultSize);
      }
    },
    [registry, addComponentToLayout]
  );

  const resolveComponent = useCallback(
    (name: string) => {
      const entry = registry.getComponent(name);
      return entry?.component;
    },
    [registry]
  );

  const handleSelectPlacement = useCallback(
    (placementId: string) => {
      setSelectedPlacementId(placementId);
    },
    [setSelectedPlacementId]
  );

  if (!activeDashboard) {
    return <div className={s.emptyState}>No dashboard selected</div>;
  }

  // Suppress unused variable warning — removeComponentFromLayout is part of the store
  // interface but not yet wired to UI in this phase (no per-item delete button yet).
  void removeComponentFromLayout;

  const saveBlocked = editMode && anyPlacementHasValidationErrors();

  return (
    <div>
      <div className={s.toolbar}>
        <span className={s.dashboardName}>{activeDashboard.name}</span>
        <div className={s.toolbarActions}>
          {editMode ? (
            <>
              <button
                className={`${s.button} ${s.buttonPrimary}`}
                onClick={handleSave}
                aria-label="Save"
                disabled={saveBlocked}
              >
                Save
              </button>
              <button className={s.button} onClick={handleDiscard} aria-label="Discard">Discard</button>
            </>
          ) : (
            <button className={s.button} onClick={handleEdit} aria-label="Edit">Edit</button>
          )}
        </div>
      </div>
      <div className={s.container}>
        <div className={s.gridArea}>
          {activeDashboard.layout.length === 0 ? (
            <div className={s.emptyState}>
              {editMode ? 'Add components from the palette' : 'Empty dashboard — click Edit to add components'}
            </div>
          ) : (
            <DashboardGrid
              layout={activeDashboard.layout}
              editMode={editMode}
              onLayoutChange={updateLayout}
              resolveComponent={resolveComponent}
              onPlacementClick={handleSelectPlacement}
            />
          )}
        </div>
        {editMode && (
          <div className={s.paletteArea}>
            <ComponentPalette
              components={registry.getAvailableComponents()}
              onAddComponent={handleAddComponent}
            />
            {selectedPlacementId && (
              <ComponentConfigPanel placementId={selectedPlacementId} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
