/**
 * EventFeedWidget
 *
 * A contract-driven wrapper for event feed display that pulls data from DashboardData
 * based on the widget configuration.
 *
 * @module lib/widgets/EventFeedWidget
 */

import { useRef, useEffect } from 'react';
import type {
  WidgetDefinition,
  WidgetConfigEventFeed,
  DashboardData,
} from '@/lib/dashboard-schema';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * Props for the EventFeedWidget component.
 *
 * @interface EventFeedWidgetProps
 */
interface EventFeedWidgetProps {
  /**
   * The widget definition containing common properties like
   * widget_id, title, and description.
   */
  widget: WidgetDefinition;

  /**
   * The event feed-specific configuration including:
   * - events_key: Key to look up the events array in DashboardData
   * - max_items: Maximum number of events to display (default: 50)
   * - show_timestamp: Whether to display timestamps (default: true)
   * - show_source: Whether to display event sources (default: true)
   * - show_severity: Whether to display severity badges (default: true)
   * - auto_scroll: Whether to auto-scroll to newest events (default: false)
   */
  config: WidgetConfigEventFeed;

  /**
   * The dashboard data object containing event items.
   * The widget looks for an array at config.events_key.
   */
  data: DashboardData;

  /**
   * When true, displays loading skeletons instead of actual events.
   *
   * @default false
   */
  isLoading?: boolean;

  /**
   * Custom title text for the empty state. Replaces the default
   * "No events to display" when the event array is empty.
   *
   * @default "No events to display"
   */
  emptyTitle?: string;

  /**
   * Custom description text for the empty state, rendered below emptyTitle.
   * Useful for providing context (e.g. connection status, snapshot time).
   *
   * @default undefined (no description shown)
   */
  emptyDescription?: string;
}

/**
 * Shape of individual event items in the event feed.
 *
 * Event data can come from various sources with different field names.
 * The component handles multiple field name variations for flexibility.
 *
 * @interface EventItem
 */
interface EventItem {
  /** Unique identifier for the event */
  id?: string | number;

  /** When the event occurred (ISO string, Unix timestamp, or Date) */
  timestamp?: string | number | Date;

  /** Event type/severity using 'type' field name */
  type?: 'info' | 'success' | 'warning' | 'error';

  /** Event type/severity using 'severity' field name (alternative to type) */
  severity?: 'info' | 'success' | 'warning' | 'error';

  /** Event message using 'message' field name */
  message?: string;

  /** Event message using 'text' field name (alternative) */
  text?: string;

  /** Event message using 'description' field name (alternative) */
  description?: string;

  /** Origin system or component that generated the event */
  source?: string;
}

const DEFAULT_MAX_ITEMS = 50;

/**
 * Renders a scrollable event feed showing system events, logs, or notifications.
 *
 * The EventFeedWidget displays a chronological list of events with:
 * - Severity indicators (color-coded bars and badges)
 * - Timestamps with relative formatting
 * - Source labels for event origin tracking
 * - Smooth entry animations for new events
 * - Auto-scroll to keep newest events visible
 *
 * Ideal for:
 * - Real-time system activity monitoring
 * - Error and warning log displays
 * - Notification feeds
 * - Audit trail views
 *
 * @example
 * ```tsx
 * const config: WidgetConfigEventFeed = {
 *   type: 'event_feed',
 *   events_key: 'system_events',
 *   max_items: 50,
 *   show_timestamp: true,
 *   show_source: true,
 *   show_severity: true,
 *   auto_scroll: true
 * };
 *
 * <EventFeedWidget
 *   widget={widgetDef}
 *   config={config}
 *   data={{
 *     system_events: [
 *       { id: 1, timestamp: '2024-01-20T10:30:00Z', type: 'info', message: 'Agent started', source: 'agent-1' },
 *       { id: 2, timestamp: '2024-01-20T10:31:00Z', type: 'warning', message: 'High memory usage', source: 'monitor' }
 *     ]
 *   }}
 * />
 * ```
 *
 * @param props - Component props
 * @returns A scrollable card containing event rows
 */
export function EventFeedWidget({
  widget,
  config,
  data,
  isLoading,
  emptyTitle,
  emptyDescription,
}: EventFeedWidgetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const maxItems = config.max_items ?? DEFAULT_MAX_ITEMS;

  // Extract events from data
  const rawEvents = data[config.events_key];
  const events: EventItem[] = Array.isArray(rawEvents) ? rawEvents : [];

  // Limit to max_items (newest first - assume array is already sorted)
  const displayEvents = events.slice(0, maxItems);

  // Auto-scroll effect - need to access the Radix ScrollArea Viewport element
  useEffect(() => {
    if (config.auto_scroll && scrollRef.current) {
      // Radix ScrollArea has a nested structure: Root > Viewport (scrollable)
      // The ref on ScrollArea points to Root which has overflow:hidden
      // We need to find the actual viewport element to scroll
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [displayEvents.length, config.auto_scroll]);

  if (isLoading) {
    return (
      <Card className="h-full p-4 flex flex-col">
        <h3 className="text-base font-semibold mb-4">{widget.title}</h3>
        <div className="flex-1 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonEvent key={i} />
          ))}
        </div>
      </Card>
    );
  }

  if (displayEvents.length === 0) {
    return (
      <Card className="h-full p-4 flex flex-col">
        <h3 className="text-base font-semibold mb-4">{widget.title}</h3>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-1">
          <span>{emptyTitle ?? 'No events to display'}</span>
          {emptyDescription && <span className="text-xs">{emptyDescription}</span>}
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full p-4 flex flex-col">
      <h3 className="text-base font-semibold mb-4">{widget.title}</h3>
      <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
        <div className="space-y-3">
          {displayEvents.map((event, index) => (
            <EventRow
              key={event.id ?? index}
              event={event}
              index={index}
              showTimestamp={config.show_timestamp}
              showSource={config.show_source}
              showSeverity={config.show_severity}
            />
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}

interface EventRowProps {
  event: EventItem;
  index: number;
  showTimestamp?: boolean;
  showSource?: boolean;
  showSeverity?: boolean;
}

function EventRow({
  event,
  index,
  showTimestamp = true,
  showSource = true,
  showSeverity = true,
}: EventRowProps) {
  const eventType = event.type ?? event.severity ?? 'info';
  const message = event.message ?? event.text ?? event.description ?? '';
  const timestamp = formatTimestamp(event.timestamp);

  return (
    <div
      className="flex gap-3 p-3 rounded-lg border bg-card border-border animate-slide-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Colored indicator bar */}
      <div className={cn('w-1 rounded shrink-0', getIndicatorColor(eventType))} />

      <div className="flex-1 min-w-0">
        {/* Metadata row */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {showTimestamp && timestamp && (
            <span className="ty-code text-muted-foreground">{timestamp}</span>
          )}
          {showSeverity && <SeverityBadge type={eventType} />}
          {showSource && event.source && (
            <Badge variant="outline" className="text-xs">
              {event.source}
            </Badge>
          )}
        </div>

        {/* Message content */}
        <div className="ty-body text-sm">{message}</div>
      </div>
    </div>
  );
}

function SeverityBadge({ type }: { type: EventItem['type'] }) {
  const variants: Record<NonNullable<EventItem['type']>, string> = {
    info: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-status-healthy/10 text-status-healthy border-status-healthy/20',
    warning: 'bg-status-warning/10 text-status-warning border-status-warning/20',
    error: 'bg-status-error/10 text-status-error border-status-error/20',
  };

  const labels: Record<NonNullable<EventItem['type']>, string> = {
    info: 'Info',
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
  };

  const eventType = type ?? 'info';

  return (
    <Badge variant="outline" className={cn('text-xs border', variants[eventType])}>
      {labels[eventType]}
    </Badge>
  );
}

function SkeletonEvent() {
  return (
    <div className="flex gap-3 p-3 rounded-lg border bg-card border-border animate-pulse">
      <div className="w-1 rounded bg-muted shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-4 w-12 bg-muted rounded" />
        </div>
        <div className="h-4 w-3/4 bg-muted rounded" />
      </div>
    </div>
  );
}

function getIndicatorColor(type: EventItem['type']): string {
  switch (type) {
    case 'success':
      return 'bg-status-healthy';
    case 'warning':
      return 'bg-status-warning';
    case 'error':
      return 'bg-status-error';
    case 'info':
    default:
      return 'bg-primary';
  }
}

function formatTimestamp(ts: EventItem['timestamp']): string | null {
  if (!ts) return null;

  if (typeof ts === 'string') {
    // If it's already a formatted string, return as-is
    // Try to parse and format if it looks like ISO date
    try {
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return formatDate(date);
      }
    } catch {
      // Return original string if parsing fails
    }
    return ts;
  }

  if (typeof ts === 'number') {
    // Note: Numeric timestamps assumed to be milliseconds. For Unix seconds, multiply by 1000.
    const date = new Date(ts);
    return formatDate(date);
  }

  if (ts instanceof Date) {
    return formatDate(ts);
  }

  return null;
}

function formatDate(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
