/**
 * EventFeedWidget
 *
 * A contract-driven wrapper for event feed display that pulls data from DashboardData
 * based on the widget configuration.
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

interface EventFeedWidgetProps {
  widget: WidgetDefinition;
  config: WidgetConfigEventFeed;
  data: DashboardData;
  isLoading?: boolean;
}

/** Expected shape of event items in the data array */
interface EventItem {
  id?: string | number;
  timestamp?: string | number | Date;
  type?: 'info' | 'success' | 'warning' | 'error';
  severity?: 'info' | 'success' | 'warning' | 'error';
  message?: string;
  text?: string;
  description?: string;
  source?: string;
}

const DEFAULT_MAX_ITEMS = 50;

export function EventFeedWidget({ widget, config, data, isLoading }: EventFeedWidgetProps) {
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
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No events to display
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
    // Assume milliseconds timestamp
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
