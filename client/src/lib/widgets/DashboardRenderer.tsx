/**
 * DashboardRenderer
 *
 * Renders a complete dashboard from a validated DashboardConfig.
 * Handles grid layout and widget positioning.
 * Each widget is wrapped in an error boundary to isolate failures.
 *
 * @module lib/widgets/DashboardRenderer
 */

import { useMemo, useCallback } from 'react';
import type { DashboardConfig, DashboardData } from '@/lib/dashboard-schema';
import { validateDashboardConfig } from '@/lib/dashboard-schema';
import { WidgetRenderer } from './WidgetRenderer';
import { WidgetErrorBoundary } from '@/components/WidgetErrorBoundary';
import { cn } from '@/lib/utils';

/**
 * Callback type for widget row click interactions.
 *
 * @param widgetId - The unique identifier of the widget that was clicked
 * @param row - The data object for the clicked row
 */
export type OnWidgetRowClick = (widgetId: string, row: Record<string, unknown>) => void;

/**
 * Props for the DashboardRenderer component.
 *
 * @interface DashboardRendererProps
 */
interface DashboardRendererProps {
  /**
   * The dashboard configuration defining layout and widgets.
   * Must be a valid DashboardConfig - validated at runtime.
   *
   * @see {@link DashboardConfig}
   */
  config: DashboardConfig;

  /**
   * The data object containing all metric values and data arrays
   * referenced by widgets in the dashboard config.
   *
   * @see {@link DashboardData}
   */
  data: DashboardData;

  /**
   * When true, widgets display loading skeletons instead of actual data.
   * Useful during initial data fetch or refresh operations.
   *
   * @default false
   */
  isLoading?: boolean;

  /**
   * Optional additional CSS classes to apply to the dashboard grid container.
   */
  className?: string;

  /**
   * Callback invoked when a widget encounters a rendering error.
   * The error is caught by the widget's error boundary, preventing
   * it from crashing the entire dashboard.
   *
   * @param error - The error thrown by the widget
   * @param widgetId - The unique identifier of the failing widget
   */
  onWidgetError?: (error: Error, widgetId: string) => void;

  /**
   * Callback invoked when a row is clicked in a table widget.
   * Enables parent components to handle row selection for detail views.
   *
   * @param widgetId - The unique identifier of the table widget
   * @param row - The data object for the clicked row
   */
  onWidgetRowClick?: OnWidgetRowClick;
}

/**
 * Renders a complete dashboard based on a contract-driven configuration.
 *
 * The DashboardRenderer is the main entry point for displaying dashboards.
 * It takes a DashboardConfig that defines:
 * - Grid layout (columns, row height, gap)
 * - Widget definitions with positions and configurations
 *
 * Features:
 * - CSS Grid-based layout with configurable dimensions
 * - Each widget wrapped in WidgetErrorBoundary for fault isolation
 * - Runtime validation of dashboard configuration
 * - Loading state support with skeleton placeholders
 * - Memoized grid styles and error handlers for performance
 *
 * @example
 * ```tsx
 * // Basic dashboard rendering
 * const config: DashboardConfig = {
 *   dashboard_id: 'agent-ops',
 *   title: 'Agent Operations',
 *   layout: { columns: 12, row_height: 80, gap: 16 },
 *   widgets: [
 *     { widget_id: 'total-agents', type: 'metric_card', col: 0, row: 0, width: 3, height: 1, ... }
 *   ]
 * };
 *
 * <DashboardRenderer
 *   config={config}
 *   data={{ total_agents: 52, active_agents: 48 }}
 *   isLoading={isLoading}
 *   onWidgetError={(err, id) => console.error(`Widget ${id} failed:`, err)}
 * />
 * ```
 *
 * @param props - Component props
 * @returns A grid of rendered widgets
 */
export function DashboardRenderer({
  config,
  data,
  isLoading,
  className,
  onWidgetError,
  onWidgetRowClick,
}: DashboardRendererProps) {
  // Validate config synchronously before first render (crash fast if invalid)
  const validationError = useMemo(() => {
    try {
      validateDashboardConfig(config);
      return null;
    } catch (error) {
      console.error('Invalid dashboard config:', error);
      return error;
    }
  }, [config]);

  if (validationError) throw validationError;

  const { layout, widgets } = config;

  const gridStyle = useMemo(
    () => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
      // Use minmax for content-aware sizing: minimum row_height but grow to fit content
      gridAutoRows: `minmax(${layout.row_height}px, auto)`,
      gap: `${layout.gap}px`,
    }),
    [layout]
  );

  // Memoize error handler to prevent unnecessary re-renders
  const handleWidgetError = useCallback(
    (error: Error, _errorInfo: React.ErrorInfo, widgetId: string) => {
      onWidgetError?.(error, widgetId);
    },
    [onWidgetError]
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
            <WidgetErrorBoundary
              widgetId={widget.widget_id}
              title={widget.title}
              onError={handleWidgetError}
            >
              <WidgetRenderer
                widget={widget}
                data={data}
                isLoading={isLoading}
                onRowClick={
                  onWidgetRowClick ? (row) => onWidgetRowClick(widget.widget_id, row) : undefined
                }
              />
            </WidgetErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
