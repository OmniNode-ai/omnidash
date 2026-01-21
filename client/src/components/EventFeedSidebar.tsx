/**
 * EventFeedSidebar Component
 *
 * Displays a live feed of registry events received via WebSocket.
 * Shows event type, timestamp, and relevant payload details with
 * color-coded styling based on event type.
 *
 * Features:
 * - Color-coded event type indicators
 * - Scrollable event list with configurable limit
 * - Clear events button
 * - Empty state handling for connected/disconnected states
 * - Event payload details (node_id, instance_id, state/health changes)
 *
 * @example
 * ```tsx
 * <EventFeedSidebar
 *   events={filteredEvents}
 *   isConnected={isConnected}
 *   onClearEvents={clearEvents}
 *   lastEventTime={stats.lastEventTime}
 * />
 * ```
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Radio, Activity, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_MAX_RECENT_EVENTS, type RecentRegistryEvent } from '@/hooks/useRegistryWebSocket';

/**
 * Event type styling configuration.
 * Maps event types to their visual representation (color, icon, background).
 */
export const EVENT_TYPE_STYLES: Record<string, { color: string; icon: string; bg: string }> = {
  NODE_REGISTERED: { color: 'text-green-500', icon: '+', bg: 'bg-green-500/10' },
  NODE_STATE_CHANGED: { color: 'text-blue-500', icon: '~', bg: 'bg-blue-500/10' },
  NODE_HEARTBEAT: { color: 'text-gray-500', icon: '*', bg: 'bg-gray-500/10' },
  NODE_DEREGISTERED: { color: 'text-red-500', icon: '-', bg: 'bg-red-500/10' },
  INSTANCE_HEALTH_CHANGED: { color: 'text-yellow-500', icon: '!', bg: 'bg-yellow-500/10' },
  INSTANCE_ADDED: { color: 'text-green-500', icon: '+', bg: 'bg-green-500/10' },
  INSTANCE_REMOVED: { color: 'text-red-500', icon: '-', bg: 'bg-red-500/10' },
};

/**
 * Format event type for display.
 * Converts SCREAMING_SNAKE_CASE to Title Case.
 *
 * @param type - Event type string (e.g., 'NODE_REGISTERED')
 * @returns Formatted string (e.g., 'Node Registered')
 */
export function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Format timestamp for display.
 * Returns time in HH:MM:SS format.
 *
 * @param date - Date object to format
 * @returns Formatted time string (e.g., '14:30:45')
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Props for the EventFeedSidebar component.
 */
export interface EventFeedSidebarProps {
  /**
   * Array of recent registry events to display.
   * Events are shown in the order provided (typically most recent first).
   */
  events: RecentRegistryEvent[];

  /**
   * Whether the WebSocket connection is active.
   * Affects empty state messaging.
   */
  isConnected: boolean;

  /**
   * Callback fired when user clicks the clear button.
   * Should clear the events array.
   */
  onClearEvents: () => void;

  /**
   * Optional timestamp of the last received event.
   * Displayed in the header when present.
   */
  lastEventTime?: Date | null;

  /**
   * Optional maximum number of events to display.
   * Defaults to DEFAULT_MAX_RECENT_EVENTS (50).
   */
  maxEvents?: number;

  /**
   * Optional additional CSS classes for the Card container.
   */
  className?: string;
}

/**
 * EventFeedSidebar displays a live feed of registry events.
 *
 * The sidebar shows real-time WebSocket events with color-coded indicators,
 * timestamps, and payload details. It handles both connected and disconnected
 * states with appropriate empty state messaging.
 */
export function EventFeedSidebar({
  events,
  isConnected,
  onClearEvents,
  lastEventTime,
  maxEvents = DEFAULT_MAX_RECENT_EVENTS,
  className,
}: EventFeedSidebarProps) {
  return (
    <Card className={cn('h-fit lg:sticky lg:top-4', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Live Events
          </CardTitle>
          <div className="flex items-center gap-2">
            {events.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearEvents}
                className="h-7 px-2 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            <Badge variant="outline" className="text-xs">
              {events.length}
            </Badge>
          </div>
        </div>
        {lastEventTime && (
          <p className="text-xs text-muted-foreground">Last event: {formatTime(lastEventTime)}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {isConnected ? (
              <>
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Waiting for registry events...</p>
                <p className="text-xs mt-1">Node and instance events will appear here</p>
              </>
            ) : (
              <>
                <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Not connected</p>
                <p className="text-xs mt-1">WebSocket connection required</p>
              </>
            )}
          </div>
        ) : (
          <ScrollArea className="h-[300px] md:h-[400px]">
            <div className="space-y-2 px-1">
              {events.slice(0, maxEvents).map((event, idx) => {
                const style = EVENT_TYPE_STYLES[event.type] || {
                  color: 'text-gray-500',
                  icon: '?',
                  bg: 'bg-gray-500/10',
                };
                return (
                  <div
                    key={`${event.id}-${idx}`}
                    className={cn(
                      'p-3 rounded-md text-xs border border-transparent hover:border-border transition-colors',
                      style.bg
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={cn('font-mono font-bold flex-shrink-0', style.color)}>
                          {style.icon}
                        </span>
                        <span className="font-medium">{formatEventType(event.type)}</span>
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap text-[10px]">
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    {event.payload && Object.keys(event.payload).length > 0 && (
                      <div className="mt-1 pl-5 text-muted-foreground space-y-0.5">
                        {'node_id' in event.payload && (
                          <p className="break-all">
                            <span className="text-muted-foreground/70">Node:</span>{' '}
                            <span className="font-mono">{String(event.payload.node_id)}</span>
                          </p>
                        )}
                        {'instance_id' in event.payload && (
                          <p className="break-all">
                            <span className="text-muted-foreground/70">Instance:</span>{' '}
                            <span className="font-mono">{String(event.payload.instance_id)}</span>
                          </p>
                        )}
                        {'new_state' in event.payload && (
                          <p>
                            State: {String(event.payload.previous_state)} &rarr;{' '}
                            {String(event.payload.new_state)}
                          </p>
                        )}
                        {'new_health' in event.payload && (
                          <p>
                            Health: {String(event.payload.previous_health)} &rarr;{' '}
                            {String(event.payload.new_health)}
                          </p>
                        )}
                        {'health_status' in event.payload && (
                          <p>Status: {String(event.payload.health_status)}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
