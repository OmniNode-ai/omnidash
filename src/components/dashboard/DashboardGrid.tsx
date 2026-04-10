import { useMemo, type LazyExoticComponent, type ComponentType } from 'react';
import { ReactGridLayout, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ComponentCell } from './ComponentCell';
import type { DashboardLayoutItem } from '@shared/types/dashboard';
import * as s from './DashboardGrid.css';

interface DashboardGridProps {
  layout: DashboardLayoutItem[];
  editMode: boolean;
  onLayoutChange: (layout: DashboardLayoutItem[]) => void;
  resolveComponent: (name: string) => LazyExoticComponent<ComponentType<any>> | undefined;
}

export function DashboardGrid({ layout, editMode, onLayoutChange, resolveComponent }: DashboardGridProps) {
  const rglLayout = useMemo(
    () => layout.map((item) => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })),
    [layout]
  );

  const handleLayoutChange = (newLayout: Layout[]) => {
    const updated = layout.map((item) => {
      const match = newLayout.find((l) => l.i === item.i);
      if (match) {
        return { ...item, x: match.x, y: match.y, w: match.w, h: match.h };
      }
      return item;
    });
    onLayoutChange(updated);
  };

  return (
    <div className={s.gridContainer}>
      <ReactGridLayout
        layout={rglLayout}
        cols={12}
        rowHeight={80}
        isDraggable={editMode}
        isResizable={editMode}
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
        margin={[12, 12]}
      >
        {layout.map((item) => (
          <div key={item.i} className={`${s.gridItem} ${editMode ? s.gridItemEdit : ''}`} data-testid="grid-item">
            <ComponentCell
              componentName={item.componentName}
              config={item.config}
              component={resolveComponent(item.componentName)}
            />
          </div>
        ))}
      </ReactGridLayout>
    </div>
  );
}
