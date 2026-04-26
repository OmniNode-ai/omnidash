// SOURCE: Claude Design prototype
//   React:   src/app.jsx:452-537 (DashboardView component)
//   Styling: OmniDash.html:265-439 (.dash-header, .dash-body, .grid, .widget, .widget-head, .widget-body, .empty-state)
// Deviations from source:
//   - Uses v2 data model (DashboardDefinition + DashboardLayoutItem) instead of prototype's widget-array shape.
//   - Edit/Save/Discard flow preserved from OMN-41; Save now delegates
//     to dashboardService.save() (T14 / OMN-155 — canonical write path).
//   - Drag-and-drop (#12): palette cards and existing widgets are both drag sources.
//     Drop onto any widget inserts before it; trailing append zone appears at the
//     grid tail while dragging. Drag is gated to edit mode. Prototype used a CSS
//     grid with inline DropIndicator between widgets; v2 uses a masonry columns
//     layout (#9), so insertion feedback lives on the target widget itself via
//     the `.drop-target` class (brand top-edge bar). The append zone is a
//     `.drop-slot` styled to span both columns.
//   - OMN-47: CSS ported verbatim to src/styles/dashboard.css + buttons.css; TSX rewritten to use prototype class names.

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Check, ChevronDown, Pencil, Plus, X } from 'lucide-react';
import { Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';
import { useRegistry } from '@/registry/RegistryProvider';
import { ComponentPalette } from '@/components/dashboard/ComponentPalette';
import { ComponentConfigPanel } from '@/config/ComponentConfigPanel';
import { ComponentCell } from '@/components/dashboard/ComponentCell';
import { DateRangeSelector } from '@/components/dashboard/DateRangeSelector';
import { TimezoneSelector } from '@/components/dashboard/TimezoneSelector';
import { AutoRefreshSelector } from '@/components/dashboard/AutoRefreshSelector';
import { EmptyState } from '@/components/dashboard/EmptyState';
import type { DashboardLayoutItem } from '@shared/types/dashboard';
import { dashboardService } from '@/services/dashboardService';

export function DashboardView() {
  const {
    activeDashboard,
    editMode,
    setEditMode,
    addComponentToLayout,
    insertComponentAt,
    moveLayoutItem,
    updateLayout,
    removeComponentFromLayout,
    duplicateLayoutItem,
    setActiveDashboard,
    renameDashboard,
    selectedPlacementId,
    setSelectedPlacementId,
    placementDrafts,
    updateComponentConfig,
    clearAllDrafts,
    anyPlacementHasValidationErrors,
  } = useFrameStore();
  const registry = useRegistry();
  const snapshotRef = useRef<DashboardLayoutItem[] | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);

  // Drag-and-drop state (#12). Exactly one of these is non-null at a time:
  //  - draggedWidgetId: an existing widget is being reordered
  //  - draggedPaletteName: a palette card is being inserted
  // dropTargetIndex is the insertion index: 0..layout.length (length = append).
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [draggedPaletteName, setDraggedPaletteName] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const isDragging = draggedWidgetId !== null || draggedPaletteName !== null;

  // Hydrate the last active dashboard layout from disk on mount.
  useEffect(() => {
    dashboardService.loadByName('default').then((persisted) => {
      if (!persisted || !Array.isArray(persisted.layout)) return;
      const currentDashboard = useFrameStore.getState().activeDashboard;
      if (!currentDashboard) {
        setActiveDashboard(persisted);
      }
    }).catch((err: unknown) => {
      console.warn('[DashboardView] failed to load persisted layout:', err);
    });
    // Intentional: this effect should run only once on mount — rerunning when
    // setActiveDashboard changes would re-hydrate and clobber live state.
    // (react-hooks/exhaustive-deps is not wired into this repo's ESLint yet.)
  }, []);

  // Close the widget library when the user switches dashboards. We compare to
  // the previous id (via ref) to skip the initial mount — otherwise a fresh
  // load would always force editMode off.
  const prevDashboardIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentId = activeDashboard?.id;
    if (prevDashboardIdRef.current !== undefined && prevDashboardIdRef.current !== currentId) {
      setEditMode(false);
    }
    prevDashboardIdRef.current = currentId;
  }, [activeDashboard?.id, setEditMode]);

  // Escape key closes the widget library when it's open.
  useEffect(() => {
    if (!editMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditMode(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editMode, setEditMode]);

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
      dashboardService.save(dashboardToPersist).catch((err: unknown) => {
        console.warn('[DashboardView] dashboardService.save failed:', err);
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

  // ---------- Drag-and-drop handlers (#12) ----------

  const resetDragState = useCallback(() => {
    setDraggedWidgetId(null);
    setDraggedPaletteName(null);
    setDropTargetIndex(null);
  }, []);

  const handleWidgetDragStart = useCallback((widgetId: string) => (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);
    setDraggedWidgetId(widgetId);
  }, []);

  const handleWidgetDragOver = useCallback((targetIndex: number) => (e: DragEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedPaletteName !== null ? 'copy' : 'move';
    setDropTargetIndex(targetIndex);
  }, [isDragging, draggedPaletteName]);

  const handleWidgetDragLeave = useCallback(() => {
    // Intentionally no-op: dragOver on the next target immediately resets
    // dropTargetIndex. Clearing here would cause flicker when the cursor
    // crosses between adjacent widgets.
  }, []);

  const commitDropAt = useCallback((index: number) => {
    if (draggedPaletteName !== null) {
      const component = registry.getComponent(draggedPaletteName);
      if (component) {
        insertComponentAt(
          draggedPaletteName,
          component.manifest.version,
          component.manifest.defaultSize,
          index,
        );
      }
    } else if (draggedWidgetId !== null) {
      moveLayoutItem(draggedWidgetId, index);
    }
    resetDragState();
  }, [draggedPaletteName, draggedWidgetId, registry, insertComponentAt, moveLayoutItem, resetDragState]);

  const handleWidgetDrop = useCallback((targetIndex: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    commitDropAt(targetIndex);
  }, [commitDropAt]);

  const handleAppendDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!isDragging || !activeDashboard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedPaletteName !== null ? 'copy' : 'move';
    setDropTargetIndex(activeDashboard.layout.length);
  }, [isDragging, draggedPaletteName, activeDashboard]);

  const handleAppendDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!activeDashboard) return;
    e.preventDefault();
    commitDropAt(activeDashboard.layout.length);
  }, [commitDropAt, activeDashboard]);

  const handlePaletteDragStart = useCallback((componentName: string) => {
    setDraggedPaletteName(componentName);
  }, []);

  const resolveComponent = useCallback(
    (name: string) => {
      const entry = registry.getComponent(name);
      return entry?.component;
    },
    [registry],
  );

  if (!activeDashboard) {
    return (
      <div className="dash-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text color="secondary">
          No dashboard selected — create one in the sidebar
        </Text>
      </div>
    );
  }

  const saveBlocked = editMode && anyPlacementHasValidationErrors();

  return (
    <>
      {/* Dashboard header */}
      <div className="dash-header">
        <div className="dash-title-wrap">
          {editingTitle ? (
            <input
              className="dash-title text-input-xl"
              autoFocus
              defaultValue={activeDashboard.name}
              onBlur={(e) => {
                const trimmed = e.target.value.trim();
                if (trimmed && trimmed !== activeDashboard.name) {
                  renameDashboard(activeDashboard.id, trimmed);
                }
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              style={{ background: 'transparent' }}
            />
          ) : (
            <div
              className="dash-title"
              onClick={() => setEditingTitle(true)}
              title="Click to rename"
            >
              {activeDashboard.name}
              <ChevronDown size={18} style={{ color: 'var(--text-tertiary)' }} />
            </div>
          )}
          {/* Filter row — timezone, auto-refresh, and time range as
              peer ghost buttons. Sits directly under the title so the
              header-actions cluster on the right is reserved for the
              mode-dependent primary controls (Add Widget / Save / Discard). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginLeft: -8,
              marginTop: 2,
            }}
          >
            <TimezoneSelector />
            <AutoRefreshSelector />
            <DateRangeSelector />
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
                <Check size={14} /> Save
              </button>
              <button
                className="btn ghost"
                onClick={handleDiscard}
                aria-label="Discard"
              >
                <X size={14} /> Discard
              </button>
            </>
          ) : (
            // H16 (review §4): the header used to expose only "Add Widget"
            // as a label for what was actually the edit-mode toggle.
            // Splitting it: "Edit Layout" is the honest label for entering
            // edit mode (rearrange / configure / remove), and "Add Widget"
            // remains for the common case of dropping in a new one. Both
            // call handleEdit() — the palette opens automatically in edit
            // mode either way — so the split is purely about affordance
            // honesty.
            <>
              <button
                className="btn ghost"
                onClick={handleEdit}
                aria-label="Edit Layout"
              >
                <Pencil size={14} /> Edit Layout
              </button>
              <button
                className="btn primary"
                onClick={handleEdit}
                aria-label="Add Widget"
              >
                <Plus size={14} /> Add Widget
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main content area. Reserve 360px on the right when editMode is active so
          the position:fixed widget library rail doesn't overlay the grid. */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          paddingRight: editMode ? 360 : 0,
        }}
      >
        {/* Widget grid */}
        <div className="dash-body">
          {activeDashboard.layout.length === 0 ? (
            editMode && isDragging ? (
              // While dragging a palette card into an empty dashboard, the
              // empty state hides so the append drop-slot below can accept
              // the drop. Without this, EmptyState's click-to-add hint sits
              // in the way.
              <div
                className={`drop-slot${dropTargetIndex === 0 ? ' active' : ''}`}
                style={{ margin: 'var(--row-gap)' }}
                onDragOver={handleAppendDragOver}
                onDrop={handleAppendDrop}
              >
                drop to add
              </div>
            ) : (
              <EmptyState onAdd={editMode ? () => {} : handleEdit} />
            )
          ) : (
            <div className="dash-grid">
              {activeDashboard.layout.map((item, index) => (
                // ComponentCell provides widget chrome via ComponentWrapper.
                // No outer .widget wrapper here — that created a redundant
                // double card (#8). Click-to-configure removed too (#14) —
                // Configure lives in the widget's kebab menu instead.
                // Drag props are forwarded into WidgetChromeContext and
                // applied to the `.widget` root by ComponentWrapper.
                <ComponentCell
                  key={item.i}
                  componentName={item.componentName}
                  config={item.config}
                  component={resolveComponent(item.componentName)}
                  // Only surface "Configure Widget" in the kebab when the
                  // widget actually has something to configure — otherwise
                  // the modal opens to an empty form. We treat absent
                  // `configSchema` and `configSchema.properties` being {}
                  // as "no config".
                  onConfigure={
                    Object.keys(
                      registry.getComponent(item.componentName)?.manifest.configSchema?.properties ?? {},
                    ).length > 0
                      ? () => setSelectedPlacementId(item.i)
                      : undefined
                  }
                  onDuplicate={() => duplicateLayoutItem(item.i)}
                  onDelete={() => removeComponentFromLayout(item.i)}
                  draggable={editMode}
                  isDragging={draggedWidgetId === item.i}
                  isDropTarget={isDragging && dropTargetIndex === index && draggedWidgetId !== item.i}
                  onDragStart={handleWidgetDragStart(item.i)}
                  onDragEnd={resetDragState}
                  onDragOver={handleWidgetDragOver(index)}
                  onDragLeave={handleWidgetDragLeave}
                  onDrop={handleWidgetDrop(index)}
                />
              ))}
              {isDragging && (
                <div
                  className={`drop-slot${dropTargetIndex === activeDashboard.layout.length ? ' active' : ''}`}
                  style={{ columnSpan: 'all', minHeight: 60 } as React.CSSProperties}
                  onDragOver={handleAppendDragOver}
                  onDrop={handleAppendDrop}
                >
                  drop to append
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Config panel as a floating modal — opens when a widget's kebab "Configure"
          is selected (sets selectedPlacementId). Rendered at top level so it overlays
          whatever is beneath instead of sharing the content-flex-row with the grid
          and widget library. */}
      <ComponentConfigPanel
        placementId={selectedPlacementId}
        onOpenChange={(open) => {
          if (!open) setSelectedPlacementId(null);
        }}
      />

      {/* Widget library rail — position:fixed via library.css. Always rendered so
          the open/close slide transition (transform 0.3s) runs in both directions;
          `isOpen` toggles the `.library.open` class that drives the transform.
          Close keeps changes (handleSave) rather than reverting, so widgets added
          while the rail is open don't vanish on dismissal. */}
      <ComponentPalette
        components={registry.getAvailableComponents()}
        onAddComponent={handleAddComponent}
        onClose={handleSave}
        isOpen={editMode}
        onPaletteDragStart={handlePaletteDragStart}
        onPaletteDragEnd={resetDragState}
      />
    </>
  );
}
