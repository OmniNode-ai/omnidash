/**
 * Enhanced Event Feed Component
 *
 * Improved event feed with event bus integration, correlation grouping, and causation visualization.
 */

import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { EventTypeBadge } from './EventTypeBadge';
import { cn } from '@/lib/utils';
import type { EventBusEvent } from '@/lib/data-sources';
import { Link2 } from 'lucide-react';

export interface EnhancedEventFeedProps {
  events: EventBusEvent[];
  maxHeight?: number;
  onEventClick?: (event: EventBusEvent) => void;
  onCorrelationClick?: (correlationId: string) => void;
  className?: string;
}

function getStatusColor(eventType: string): string {
  if (eventType.includes('.failed.') || eventType.includes('.error.')) {
    return 'bg-status-error';
  }
  if (eventType.includes('.completed.') || eventType.includes('.success.')) {
    return 'bg-status-healthy';
  }
  if (eventType.includes('.started.') || eventType.includes('.requested.')) {
    return 'bg-status-warning';
  }
  return 'bg-primary';
}

export function EnhancedEventFeed({
  events,
  maxHeight = 400,
  onEventClick,
  onCorrelationClick,
  className,
}: EnhancedEventFeedProps) {
  const [groupedByCorrelation, setGroupedByCorrelation] = useState(true);

  // Group events by correlation_id
  const groupedEvents = useMemo(() => {
    if (!groupedByCorrelation) {
      return { ungrouped: events };
    }

    const groups: Record<string, EventBusEvent[]> = {};
    events.forEach((event) => {
      const key = event.correlation_id || 'ungrouped';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(event);
    });

    return groups;
  }, [events, groupedByCorrelation]);

  const formatTimestamp = (timestamp: string): string => {
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return timestamp;
    }
  };

  return (
    <Card className={cn('p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">Live Event Stream</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setGroupedByCorrelation(!groupedByCorrelation)}
        >
          {groupedByCorrelation ? 'Ungroup' : 'Group by Correlation'}
        </Button>
      </div>

      <ScrollArea className="pr-4" style={{ maxHeight: `${maxHeight}px` }}>
        <div className="space-y-4">
          {Object.entries(groupedEvents).map(([correlationId, groupEvents]) => (
            <div key={correlationId} className="space-y-2">
              {groupedByCorrelation && correlationId !== 'ungrouped' && (
                <div className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded text-xs">
                  <Link2 className="w-3 h-3" />
                  <span className="font-mono">
                    Correlation:{' '}
                    {correlationId.length > 16 ? `${correlationId.slice(0, 16)}...` : correlationId}
                  </span>
                  <Badge variant="secondary" className="ml-auto">
                    {groupEvents.length} events
                  </Badge>
                  {onCorrelationClick && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-xs px-2"
                      aria-label={`View event chain for correlation ${correlationId}`}
                      onClick={() => onCorrelationClick(correlationId)}
                    >
                      View Chain
                    </Button>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {groupEvents.map((event, index) => (
                  <div
                    key={event.event_id}
                    role={onEventClick ? 'button' : undefined}
                    tabIndex={onEventClick ? 0 : undefined}
                    aria-label={
                      onEventClick ? `View details for event ${event.event_type}` : undefined
                    }
                    className={cn(
                      'flex gap-3 p-3 rounded-lg border bg-card border-border',
                      index < 20 && 'animate-slide-in',
                      onEventClick &&
                        'cursor-pointer transition-all duration-200 ease-in-out hover:bg-accent/50 hover:scale-[1.01]'
                    )}
                    style={index < 20 ? { animationDelay: `${index * 50}ms` } : undefined}
                    onClick={onEventClick ? () => onEventClick(event) : undefined}
                    onKeyDown={
                      onEventClick
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onEventClick(event);
                            }
                          }
                        : undefined
                    }
                  >
                    <div className={cn('w-1 rounded', getStatusColor(event.event_type))} />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatTimestamp(event.timestamp)}
                        </span>
                        <EventTypeBadge eventType={event.event_type} />
                        {event.causation_id && (
                          <Badge variant="outline" className="text-xs font-mono">
                            Caused by:{' '}
                            {event.causation_id.length > 8
                              ? `${event.causation_id.slice(0, 8)}...`
                              : event.causation_id}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm">
                        <div className="text-xs text-muted-foreground mb-1">
                          Source: <span className="font-mono">{event.source}</span>
                        </div>
                        {event.payload &&
                          Object.keys(event.payload).length > 0 &&
                          (() => {
                            const json = JSON.stringify(event.payload);
                            const preview = json.slice(0, 100);
                            return (
                              <div className="text-xs text-muted-foreground truncate">
                                {json.length > 100 ? `${preview}...` : preview}
                              </div>
                            );
                          })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      {events.length === 0 && (
        <div className="p-6 text-center text-muted-foreground">
          <p className="text-sm">No events found. Waiting for new events...</p>
        </div>
      )}
    </Card>
  );
}
