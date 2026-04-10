import { useMemo, type LazyExoticComponent, type ComponentType } from 'react';
import { ReactGridLayout, verticalCompactor, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ComponentCell } from './ComponentCell';
import type { DashboardLayoutItem } from '@shared/types/dashboard';
import * as s from './DashboardGrid.css';

// In react-grid-layout v2, Layout = readonly LayoutItem[]
type RGLLayout = readonly LayoutItem[];

// react-grid-layout v2 requires an explicit width prop
const CONTAINER_WIDTH = 1200;

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

  const handleLayoutChange = (newLayout: RGLLayout) => {
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
        width={CONTAINER_WIDTH}
        layout={rglLayout}
        gridConfig={{ cols: 12, rowHeight: 80, margin: [12, 12] }}
        dragConfig={{ enabled: editMode, bounded: false, threshold: 3 }}
        resizeConfig={{ enabled: editMode, handles: ['se'] }}
        onLayoutChange={handleLayoutChange}
        compactor={verticalCompactor}
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
