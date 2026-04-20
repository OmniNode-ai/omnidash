// Rewritten for OMN-43: react-grid-layout removed; replaced with a simple 2-column CSS grid.
// DashboardGrid is kept as a thin component so DashboardBuilder.tsx (legacy shim) still
// compiles. DashboardView.tsx renders the grid inline; this file exists for test compatibility.
import type { LazyExoticComponent, ComponentType } from 'react';
import { ComponentCell } from './ComponentCell';
import type { DashboardLayoutItem } from '@shared/types/dashboard';

interface DashboardGridProps {
  layout: DashboardLayoutItem[];
  editMode: boolean;
  onLayoutChange: (layout: DashboardLayoutItem[]) => void;
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
          data-testid="grid-item"
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
