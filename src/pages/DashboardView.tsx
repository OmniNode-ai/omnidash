// SOURCE: Claude Design prototype
//   React:   src/app.jsx:452-537 (DashboardView component)
//   Styling: OmniDash.html:265-439 (.dash-header, .dash-body, .grid, .widget, .widget-head, .widget-body, .empty-state)
// Deviations from source:
//   - Uses v2 data model (DashboardDefinition + DashboardLayoutItem) instead of prototype's widget-array shape.
//   - ComponentCell/ComponentPalette used for rendering/adding widgets (OMN-44 will replace).
//   - Edit/Save/Discard flow preserved from OMN-41 (layoutPersistence.write on Save).
//   - Drag-and-drop deferred to OMN-44; strict 2-column grid is non-draggable for now.
//   - OMN-47: CSS ported verbatim to src/styles/dashboard.css + buttons.css; TSX rewritten to use prototype class names.

import { useCallback, useEffect, useRef } from 'react';
import { useFrameStore } from '@/store/store';
import { useRegistry } from '@/registry/RegistryProvider';
import { ComponentPalette } from '@/components/dashboard/ComponentPalette';
import { ComponentConfigPanel } from '@/config/ComponentConfigPanel';
import { ComponentCell } from '@/components/dashboard/ComponentCell';
import { EmptyState } from '@/components/dashboard/EmptyState';
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
      <div className="dash-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--ink-2)', fontSize: '14px' }}>
          No dashboard selected — create one in the sidebar
        </span>
      </div>
    );
  }

  // Suppress unused warning — removeComponentFromLayout retained in interface but no delete UI yet
  void removeComponentFromLayout;

  const saveBlocked = editMode && anyPlacementHasValidationErrors();

  return (
    <>
      {/* Dashboard header */}
      <div className="dash-header">
        <div className="dash-title-wrap">
          <div className="dash-title">
            {activeDashboard.name}
          </div>
          <div className="dash-meta">
            <span>{activeDashboard.layout.length} widget{activeDashboard.layout.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="header-actions">
          {editMode ? (
            <>
              <button
                className="btn primary"
                onClick={handleSave}
                aria-label="Save"
                disabled={saveBlocked}
              >
                Save
              </button>
              <button
                className="btn ghost"
                onClick={handleDiscard}
                aria-label="Discard"
              >
                Discard
              </button>
            </>
          ) : (
            <button
              className="btn ghost"
              onClick={handleEdit}
              aria-label="Edit"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Widget grid */}
        <div className="dash-body">
          {activeDashboard.layout.length === 0 ? (
            <EmptyState onAdd={editMode ? () => {} : handleEdit} />
          ) : (
            <div className="grid">
              {activeDashboard.layout.map((item) => (
                <div
                  key={item.i}
                  data-testid="grid-item"
                  className="widget"
                  onClick={
                    editMode && handleSelectPlacement
                      ? () => handleSelectPlacement(item.i)
                      : undefined
                  }
                  style={editMode ? { cursor: 'pointer' } : undefined}
                >
                  <div className="widget-head">
                    <div className="widget-head-left">
                      <span className="widget-title">{item.componentName}</span>
                    </div>
                  </div>
                  <div className="widget-body">
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
          <div style={{ width: '280px', flexShrink: 0, borderLeft: '1px solid var(--line)', overflowY: 'auto' }}>
            <ComponentPalette
              components={registry.getAvailableComponents()}
              onAddComponent={handleAddComponent}
              onClose={handleDiscard}
            />
            {selectedPlacementId && (
              <ComponentConfigPanel placementId={selectedPlacementId} />
            )}
          </div>
        )}
      </div>
    </>
  );
}
