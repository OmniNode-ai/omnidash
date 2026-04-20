// SOURCE: Claude Design prototype
//   React:   src/app.jsx:452-537 (DashboardView component)
//   Styling: OmniDash.html:327-439 (.dash-body, .dash-header, .grid, .widget)
// Deviations from source:
//   - Uses v2 data model (DashboardDefinition + DashboardLayoutItem) instead of prototype's
//     widget-array shape.
//   - Tailwind utility classes replace vanilla CSS.
//   - ComponentCell/ComponentPalette used for rendering/adding widgets (OMN-44 will replace).
//   - Edit/Save/Discard flow preserved from OMN-41 (layoutPersistence.write on Save).
//   - Drag-and-drop deferred to OMN-44; strict 2-column grid is non-draggable for now.
//   - `react-grid-layout` removed; DashboardGrid.tsx no longer imported here.

import { useCallback, useEffect, useRef } from 'react';
import { useFrameStore } from '@/store/store';
import { useRegistry } from '@/registry/RegistryProvider';
import { ComponentPalette } from '@/components/dashboard/ComponentPalette';
import { ComponentConfigPanel } from '@/config/ComponentConfigPanel';
import { ComponentCell } from '@/components/dashboard/ComponentCell';
import type { DashboardLayoutItem } from '@shared/types/dashboard';
import { layoutPersistence } from '@/layout/layout-persistence';

export function DashboardView() {
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

  // Hydrate the last active dashboard layout from disk on mount.
  useEffect(() => {
    layoutPersistence.read('default').then((persisted) => {
      if (!persisted || !Array.isArray(persisted.layout)) return;
      const currentDashboard = useFrameStore.getState().activeDashboard;
      if (!currentDashboard) {
        setActiveDashboard(persisted);
      }
    }).catch((err: unknown) => {
      console.warn('[DashboardView] failed to load persisted layout:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = useCallback(() => {
    if (activeDashboard) {
      snapshotRef.current = [...activeDashboard.layout];
    }
    setEditMode(true);
  }, [activeDashboard, setEditMode]);

  const handleSave = useCallback(() => {
    if (activeDashboard) {
      for (const [placementId, draft] of Object.entries(placementDrafts)) {
        updateComponentConfig(placementId, draft.draftConfig);
      }
    }
    clearAllDrafts();

    const dashboardToPersist = useFrameStore.getState().activeDashboard;
    if (dashboardToPersist) {
      layoutPersistence
        .write(dashboardToPersist.name, dashboardToPersist)
        .catch((err: unknown) => {
          console.warn('[DashboardView] layout persistence write failed:', err);
        });
    }

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
    [registry, addComponentToLayout],
  );

  const resolveComponent = useCallback(
    (name: string) => {
      const entry = registry.getComponent(name);
      return entry?.component;
    },
    [registry],
  );

  const handleSelectPlacement = useCallback(
    (placementId: string) => {
      setSelectedPlacementId(placementId);
    },
    [setSelectedPlacementId],
  );

  if (!activeDashboard) {
    return (
      <div className="flex items-center justify-center h-full text-ink-2 text-sm">
        No dashboard selected — create one in the sidebar
      </div>
    );
  }

  // Suppress unused warning — removeComponentFromLayout retained in interface but no delete UI yet
  void removeComponentFromLayout;

  const saveBlocked = editMode && anyPlacementHasValidationErrors();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Dashboard toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-panel flex-shrink-0">
        <span className="text-[17px] font-semibold text-ink">{activeDashboard.name}</span>
        <div className="flex gap-2">
          {editMode ? (
            <>
              <button
                className="px-3 py-1.5 rounded border border-line text-[13px] bg-[var(--accent)] text-white font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                onClick={handleSave}
                aria-label="Save"
                disabled={saveBlocked}
              >
                Save
              </button>
              <button
                className="px-3 py-1.5 rounded border border-line text-[13px] bg-panel-2 text-ink transition-colors hover:bg-line"
                onClick={handleDiscard}
                aria-label="Discard"
              >
                Discard
              </button>
            </>
          ) : (
            <button
              className="px-3 py-1.5 rounded border border-line text-[13px] bg-panel-2 text-ink transition-colors hover:bg-line"
              onClick={handleEdit}
              aria-label="Edit"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Widget grid — strict 2-column */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeDashboard.layout.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ink-2 text-sm">
              {editMode
                ? 'Add components from the palette'
                : 'Empty dashboard — click Edit to add components'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-[var(--row-gap)]">
              {activeDashboard.layout.map((item) => (
                <div
                  key={item.i}
                  data-testid="grid-item"
                  className={`bg-panel rounded-lg border border-line shadow-sm overflow-hidden${
                    editMode ? ' cursor-pointer ring-2 ring-transparent hover:ring-[var(--accent)] transition-all' : ''
                  }`}
                  onClick={
                    editMode && handleSelectPlacement
                      ? () => handleSelectPlacement(item.i)
                      : undefined
                  }
                >
                  <div className="p-4">
                    <ComponentCell
                      componentName={item.componentName}
                      config={item.config}
                      component={resolveComponent(item.componentName)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit-mode palette / config */}
        {editMode && (
          <div className="w-[280px] flex-shrink-0 border-l border-line overflow-y-auto">
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
