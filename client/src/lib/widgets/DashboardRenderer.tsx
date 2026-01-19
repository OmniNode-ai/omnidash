/**
 * DashboardRenderer
 *
 * Renders a complete dashboard from a validated DashboardConfig.
 * Handles grid layout and widget positioning.
 */

import { useEffect, useMemo } from 'react';
import type { DashboardConfig, DashboardData } from '@/lib/dashboard-schema';
import { validateDashboardConfig } from '@/lib/dashboard-schema';
import { WidgetRenderer } from './WidgetRenderer';
import { cn } from '@/lib/utils';

interface DashboardRendererProps {
  config: DashboardConfig;
  data: DashboardData;
  isLoading?: boolean;
  className?: string;
}

export function DashboardRenderer({ config, data, isLoading, className }: DashboardRendererProps) {
  // Validate config at runtime (crash fast if invalid)
  useEffect(() => {
    try {
      validateDashboardConfig(config);
    } catch (error) {
      console.error('Invalid dashboard config:', error);
      throw error;
    }
  }, [config]);

  const { layout, widgets } = config;

  const gridStyle = useMemo(
    () => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
      gridAutoRows: `${layout.row_height}px`,
      gap: `${layout.gap}px`,
    }),
    [layout]
  );

  return (
    <div className={cn('dashboard-grid', className)} style={gridStyle}>
      {widgets.map((widget) => {
        const widgetStyle = {
          gridColumn: `${widget.col + 1} / span ${widget.width}`,
          gridRow: `${widget.row + 1} / span ${widget.height}`,
        };

        return (
          <div key={widget.widget_id} style={widgetStyle}>
            <WidgetRenderer widget={widget} data={data} isLoading={isLoading} />
          </div>
        );
      })}
    </div>
  );
}
