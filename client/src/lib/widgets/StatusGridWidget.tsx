/**
 * StatusGridWidget
 *
 * A contract-driven widget that renders a grid of status items (e.g., agent status,
 * service health). Each item displays a label and a status indicator with semantic colors.
 *
 * @module lib/widgets/StatusGridWidget
 */

import type {
  WidgetDefinition,
  WidgetConfigStatusGrid,
  DashboardData,
} from '@/lib/dashboard-schema';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Props for the StatusGridWidget component.
 *
 * @interface StatusGridWidgetProps
 */
interface StatusGridWidgetProps {
  /**
   * The widget definition containing common properties like
   * widget_id, title, and description.
   */
  widget: WidgetDefinition;

  /**
   * The status grid-specific configuration including:
   * - items_key: Key to look up the status items array in DashboardData
   * - id_field: Field name for item unique identifier
   * - label_field: Field name for item display label
   * - status_field: Field name for item status value
   * - columns: Number of columns in the grid (default: 4)
   * - show_labels: Whether to display labels (default: true)
   * - compact: Whether to use compact styling (default: false)
   */
  config: WidgetConfigStatusGrid;

  /**
   * The dashboard data object containing status items.
   * The widget looks for an array at config.items_key.
   */
  data: DashboardData;

  /**
   * When true, displays loading skeletons instead of actual items.
   *
   * @default false
   */
  isLoading?: boolean;
}

/** Status values that map to each semantic color */
const STATUS_HEALTHY = ['healthy', 'active', 'success', 'online', 'running', 'up', 'passed'];
const STATUS_WARNING = ['warning', 'degraded', 'pending', 'slow'];
const STATUS_ERROR = ['error', 'failed', 'down', 'critical', 'offline'];
// Everything else maps to inactive/gray

type StatusSeverity = 'healthy' | 'warning' | 'error' | 'inactive';

/**
 * Determines the semantic severity level from a status string.
 *
 * Maps various status string values to standardized severity levels:
 * - `healthy`: healthy, active, success, online, running, up, passed
 * - `warning`: warning, degraded, pending, slow
 * - `error`: error, failed, down, critical, offline
 * - `inactive`: any unrecognized status value
 *
 * @param status - The raw status string from data
 * @returns The normalized severity level for styling
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
 * Gets the Tailwind background class for a status indicator dot.
 *
 * @param severity - The semantic severity level
 * @returns Tailwind class for the background color (e.g., 'bg-status-healthy')
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
 * Gets the Tailwind classes for the status text badge.
 *
 * Returns combined background and text color classes for badge styling.
 * Uses 10% opacity backgrounds with full-opacity text for readability.
 *
 * @param severity - The semantic severity level
 * @returns Tailwind classes for background and text color
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
 * Gets the card border classes to emphasize non-healthy statuses.
 *
 * Warning and error items receive tinted borders for visual prominence.
 * Healthy and inactive items use the default card border.
 *
 * @param severity - The semantic severity level
 * @returns Tailwind class for the border color
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

/**
 * Internal representation of a status item after data extraction.
 *
 * @interface StatusItem
 */
interface StatusItem {
  /** Unique identifier for the item */
  id: string;
  /** Display label shown next to the status indicator */
  label: string;
  /** Raw status string from the data source */
  status: string;
  /** Computed severity level for styling */
  severity: StatusSeverity;
}

/**
 * Renders a grid of status indicators for monitoring multiple items.
 *
 * The StatusGridWidget displays a collection of status items in a responsive grid,
 * with each item showing a colored indicator dot and optional label. Ideal for:
 * - Service health monitoring
 * - Agent status displays
 * - Resource availability tracking
 *
 * Features:
 * - Semantic color mapping (healthy=green, warning=yellow, error=red, inactive=gray)
 * - Configurable grid columns
 * - Compact mode for dense displays
 * - Status count summary footer
 * - Animated pulse effect for healthy items
 *
 * @example
 * ```tsx
 * const config: WidgetConfigStatusGrid = {
 *   type: 'status_grid',
 *   items_key: 'services',
 *   id_field: 'id',
 *   label_field: 'name',
 *   status_field: 'status',
 *   columns: 4,
 *   show_labels: true
 * };
 *
 * <StatusGridWidget
 *   widget={widgetDef}
 *   config={config}
 *   data={{
 *     services: [
 *       { id: 'api', name: 'API Server', status: 'healthy' },
 *       { id: 'db', name: 'Database', status: 'warning' },
 *       { id: 'cache', name: 'Cache', status: 'error' }
 *     ]
 *   }}
 * />
 * ```
 *
 * @param props - Component props
 * @returns A grid of status cards with summary footer
 */
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
