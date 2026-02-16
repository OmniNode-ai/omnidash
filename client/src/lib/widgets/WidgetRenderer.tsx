/**
 * WidgetRenderer
 *
 * Dispatcher component that renders the appropriate widget type
 * based on the widget configuration's config_kind.
 */

import type { WidgetDefinition, DashboardData } from '@/lib/dashboard-schema';
import { MetricCardWidget } from './MetricCardWidget';
import { ChartWidget } from './ChartWidget';
import { TableWidget, type CustomCellRenderer } from './TableWidget';
import { StatusGridWidget } from './StatusGridWidget';
import { EventFeedWidget } from './EventFeedWidget';
import { Card } from '@/components/ui/card';

interface WidgetRendererProps {
  widget: WidgetDefinition;
  data: DashboardData;
  isLoading?: boolean;
  /**
   * Optional callback fired when a row is clicked in a table widget.
   * Passed through from DashboardRenderer to enable row selection handling.
   */
  onRowClick?: (row: Record<string, unknown>) => void;
  /**
   * Extra props forwarded to the rendered widget component.
   * Currently used to pass emptyTitle/emptyDescription to EventFeedWidget.
   */
  extraProps?: Record<string, unknown>;
}

export function WidgetRenderer({
  widget,
  data,
  isLoading,
  onRowClick,
  extraProps,
}: WidgetRendererProps) {
  const { config } = widget;

  switch (config.config_kind) {
    case 'metric_card':
      return <MetricCardWidget widget={widget} config={config} data={data} isLoading={isLoading} />;

    case 'chart':
      return <ChartWidget widget={widget} config={config} data={data} isLoading={isLoading} />;

    case 'table':
      return (
        <TableWidget
          widget={widget}
          config={config}
          data={data}
          isLoading={isLoading}
          onRowClick={onRowClick}
          customCellRenderers={
            extraProps?.customCellRenderers as Record<string, CustomCellRenderer> | undefined
          }
        />
      );

    case 'status_grid':
      return <StatusGridWidget widget={widget} config={config} data={data} isLoading={isLoading} />;

    case 'event_feed':
      return (
        <EventFeedWidget
          widget={widget}
          config={config}
          data={data}
          isLoading={isLoading}
          emptyTitle={extraProps?.emptyTitle as string | undefined}
          emptyDescription={extraProps?.emptyDescription as string | undefined}
        />
      );

    default: {
      // Type-safe exhaustive check
      const _exhaustive: never = config;
      return (
        <PlaceholderWidget
          title={widget.title}
          type="Unknown"
          description={`Widget type "${(config as { config_kind: string }).config_kind}" not recognized`}
        />
      );
    }
  }
}

/**
 * Placeholder widget for unimplemented widget types.
 */
function PlaceholderWidget({
  title,
  type,
  description,
}: {
  title: string;
  type: string;
  description: string;
}) {
  return (
    <Card className="h-full p-4 flex flex-col items-center justify-center border-dashed">
      <div className="text-sm font-medium text-muted-foreground mb-1">{type}</div>
      <div className="text-lg font-semibold mb-2">{title}</div>
      <div className="text-xs text-muted-foreground text-center">{description}</div>
    </Card>
  );
}
