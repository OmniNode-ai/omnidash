import { useCallback, useRef } from 'react';
import { useFrameStore } from '@/store/store';
import { useRegistry } from '@/registry/RegistryProvider';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { ComponentPalette } from '@/components/dashboard/ComponentPalette';
import type { DashboardLayoutItem } from '@shared/types/dashboard';
import * as s from './DashboardBuilder.css';

export function DashboardBuilder() {
  const { activeDashboard, editMode, setEditMode, addComponentToLayout, updateLayout, removeComponentFromLayout } = useFrameStore();
  const registry = useRegistry();
  const snapshotRef = useRef<DashboardLayoutItem[] | null>(null);

  const handleEdit = useCallback(() => {
    if (activeDashboard) {
      snapshotRef.current = [...activeDashboard.layout];
    }
    setEditMode(true);
  }, [activeDashboard, setEditMode]);

  const handleSave = useCallback(() => {
    snapshotRef.current = null;
    setEditMode(false);
  }, [setEditMode]);

  const handleDiscard = useCallback(() => {
    if (snapshotRef.current && activeDashboard) {
      updateLayout(snapshotRef.current);
    }
    snapshotRef.current = null;
    setEditMode(false);
  }, [activeDashboard, updateLayout, setEditMode]);

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

  if (!activeDashboard) {
    return <div className={s.emptyState}>No dashboard selected</div>;
  }

  // Suppress unused variable warning — removeComponentFromLayout is part of the store
  // interface but not yet wired to UI in this phase (no per-item delete button yet).
  void removeComponentFromLayout;

  return (
    <div>
      <div className={s.toolbar}>
        <span className={s.dashboardName}>{activeDashboard.name}</span>
        <div className={s.toolbarActions}>
          {editMode ? (
            <>
              <button className={`${s.button} ${s.buttonPrimary}`} onClick={handleSave} aria-label="Save">Save</button>
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
            />
          )}
        </div>
        {editMode && (
          <div className={s.paletteArea}>
            <ComponentPalette
              components={registry.getAvailableComponents()}
              onAddComponent={handleAddComponent}
            />
          </div>
        )}
      </div>
    </div>
  );
}
