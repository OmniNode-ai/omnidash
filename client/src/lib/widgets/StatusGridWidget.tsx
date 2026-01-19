/**
 * StatusGridWidget
 *
 * A contract-driven widget that renders a grid of status items (e.g., agent status,
 * service health). Each item displays a label and a status indicator with semantic colors.
 */

import type {
  WidgetDefinition,
  WidgetConfigStatusGrid,
  DashboardData,
} from '@/lib/dashboard-schema';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatusGridWidgetProps {
  widget: WidgetDefinition;
  config: WidgetConfigStatusGrid;
  data: DashboardData;
  isLoading?: boolean;
}

/** Status values that map to each semantic color */
const STATUS_HEALTHY = ['healthy', 'active', 'success', 'online', 'running', 'up', 'passed'];
const STATUS_WARNING = ['warning', 'degraded', 'pending', 'slow'];
const STATUS_ERROR = ['error', 'failed', 'down', 'critical', 'offline'];
// Everything else maps to inactive/gray

type StatusSeverity = 'healthy' | 'warning' | 'error' | 'inactive';

/**
 * Determine the semantic severity from a status string.
 */
function getStatusSeverity(status: string): StatusSeverity {
  const normalized = status.toLowerCase().trim();

  if (STATUS_HEALTHY.includes(normalized)) {
    return 'healthy';
  }
  if (STATUS_WARNING.includes(normalized)) {
    return 'warning';
  }
  if (STATUS_ERROR.includes(normalized)) {
    return 'error';
  }
  return 'inactive';
}

/**
 * Get the Tailwind background class for a status indicator dot.
 */
function getStatusDotClass(severity: StatusSeverity): string {
  switch (severity) {
    case 'healthy':
      return 'bg-status-healthy';
    case 'warning':
      return 'bg-status-warning';
    case 'error':
      return 'bg-status-error';
    case 'inactive':
    default:
      return 'bg-status-offline';
  }
}

/**
 * Get the Tailwind classes for the status text badge.
 */
function getStatusBadgeClasses(severity: StatusSeverity): string {
  switch (severity) {
    case 'healthy':
      return 'bg-status-healthy/10 text-status-healthy';
    case 'warning':
      return 'bg-status-warning/10 text-status-warning';
    case 'error':
      return 'bg-status-error/10 text-status-error';
    case 'inactive':
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/**
 * Get the card border classes for emphasis on non-healthy statuses.
 */
function getStatusBorderClass(severity: StatusSeverity): string {
  switch (severity) {
    case 'warning':
      return 'border-status-warning/30';
    case 'error':
      return 'border-status-error/30';
    default:
      return 'border-card-border';
  }
}

interface StatusItem {
  id: string;
  label: string;
  status: string;
  severity: StatusSeverity;
}

export function StatusGridWidget({
  widget: _widget,
  config,
  data,
  isLoading,
}: StatusGridWidgetProps) {
  const columns = config.columns ?? 4;
  const showLabels = config.show_labels ?? true;
  const compact = config.compact ?? false;

  // Loading state with skeleton grid
  if (isLoading) {
    return (
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="p-3 animate-pulse">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // Extract items from data using the items_key
  const rawItems = data[config.items_key];

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
        No status items available
      </div>
    );
  }

  // Map raw items to typed status items
  const items: StatusItem[] = rawItems.map((item: Record<string, unknown>) => {
    const id = String(item[config.id_field] ?? '');
    const label = String(item[config.label_field] ?? '');
    const status = String(item[config.status_field] ?? 'unknown');
    const severity = getStatusSeverity(status);

    return { id, label, status, severity };
  });

  // Calculate status counts for summary
  const statusCounts = items.reduce(
    (acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    },
    {} as Record<StatusSeverity, number>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Status Grid */}
      <div
        className={cn('grid gap-2 flex-1', compact ? 'gap-1' : 'gap-2')}
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item) => (
          <Card
            key={item.id}
            className={cn(
              'transition-colors',
              compact ? 'p-2' : 'p-3',
              getStatusBorderClass(item.severity)
            )}
            title={`${item.label}: ${item.status}`}
          >
            <div className="flex items-center gap-2">
              {/* Status indicator dot */}
              <div
                className={cn(
                  'rounded-full flex-shrink-0',
                  compact ? 'h-2 w-2' : 'h-3 w-3',
                  getStatusDotClass(item.severity),
                  item.severity === 'healthy' && 'animate-pulse'
                )}
                aria-label={`Status: ${item.status}`}
              />

              {/* Label */}
              {showLabels && (
                <span className={cn('truncate font-medium', compact ? 'text-xs' : 'text-sm')}>
                  {item.label}
                </span>
              )}
            </div>

            {/* Status badge (non-compact only) */}
            {!compact && (
              <div
                className={cn(
                  'mt-2 text-xs px-2 py-0.5 rounded-md w-fit capitalize',
                  getStatusBadgeClasses(item.severity)
                )}
              >
                {item.status}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Count Summary */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
        {statusCounts.healthy > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-status-healthy" />
            <span>
              <span className="font-mono text-foreground">{statusCounts.healthy}</span> healthy
            </span>
          </div>
        )}
        {statusCounts.warning > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-status-warning" />
            <span>
              <span className="font-mono text-foreground">{statusCounts.warning}</span> warning
            </span>
          </div>
        )}
        {statusCounts.error > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-status-error" />
            <span>
              <span className="font-mono text-foreground">{statusCounts.error}</span> error
            </span>
          </div>
        )}
        {statusCounts.inactive > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-status-offline" />
            <span>
              <span className="font-mono text-foreground">{statusCounts.inactive}</span> inactive
            </span>
          </div>
        )}
        <span className="ml-auto">
          Total: <span className="font-mono text-foreground">{items.length}</span>
        </span>
      </div>
    </div>
  );
}
