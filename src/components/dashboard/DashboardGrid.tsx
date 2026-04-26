// Rewritten for OMN-43: react-grid-layout removed; replaced with a simple 2-column CSS grid.
// DashboardView.tsx renders the grid inline (the live builder); this file is kept as a
// thin standalone component so it can be reused or imported in tests without booting
// the full DashboardView tree.
import type { LazyExoticComponent, ComponentType } from 'react';
import { ComponentCell } from './ComponentCell';
import type { DashboardLayoutItem } from '@shared/types/dashboard';

interface DashboardGridProps {
  layout: DashboardLayoutItem[];
  editMode: boolean;
  resolveComponent: (name: string) => LazyExoticComponent<ComponentType<unknown>> | undefined;
  /** Called in edit mode when the user clicks a placed component to select it for config editing. */
  onPlacementClick?: (placementId: string) => void;
}

export function DashboardGrid({
  layout,
  editMode,
  resolveComponent,
  onPlacementClick,
}: DashboardGridProps) {
  return (
    <div className="grid grid-cols-2 gap-[var(--row-gap)]">
      {layout.map((item) => (
        <div
          key={item.i}
          className={`bg-panel rounded-lg border border-line shadow-sm overflow-hidden${
            editMode
              ? ' cursor-pointer ring-2 ring-transparent hover:ring-[var(--accent)] transition-all'
              : ''
          }`}
          onClick={
            editMode && onPlacementClick ? () => onPlacementClick(item.i) : undefined
          }
        >
          <div className="p-4">
            {/* ComponentCell provides data-testid="grid-item" on both success (via ComponentWrapper) and fallback paths. */}
            <ComponentCell
              componentName={item.componentName}
              config={item.config}
              component={resolveComponent(item.componentName)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
