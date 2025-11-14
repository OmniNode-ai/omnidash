/**
 * Event Bus Explorer Page
 * 
 * Dedicated dashboard for exploring and analyzing events from the event bus.
 */

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/SectionHeader";
import { ExportButton } from "@/components/ExportButton";
import { eventBusSource, type EventBusEvent, type EventQueryOptions } from "@/lib/data-sources";
import { EventSearchBar } from "@/components/event-bus/EventSearchBar";
import { EventStatisticsPanel } from "@/components/event-bus/EventStatisticsPanel";
import { EventChainVisualization } from "@/components/event-bus/EventChainVisualization";
import { EventTypeBadge } from "@/components/event-bus/EventTypeBadge";
import { EventPayloadViewer } from "@/components/event-bus/EventPayloadViewer";
import { EventBusHealthIndicator } from "@/components/event-bus/EventBusHealthIndicator";
import { POLLING_INTERVAL_MEDIUM } from "@/lib/constants/query-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { X } from "lucide-react";

export default function EventBusExplorer() {
  const [filters, setFilters] = useState<EventQueryOptions>({
    limit: 100,
    order_by: 'timestamp',
    order_direction: 'desc',
  });
  const [selectedEvent, setSelectedEvent] = useState<EventBusEvent | null>(null);
  const [selectedCorrelationId, setSelectedCorrelationId] = useState<string | null>(null);

  // Fetch events
  const { data: eventsData, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['event-bus-events', filters],
    queryFn: () => eventBusSource.queryEvents(filters),
    refetchInterval: POLLING_INTERVAL_MEDIUM,
    refetchOnWindowFocus: true,
  });

  // Fetch event chain if correlation ID is selected
  const { data: chainData, isLoading: isChainLoading } = useQuery({
    queryKey: ['event-bus-chain', selectedCorrelationId],
    queryFn: () => selectedCorrelationId 
      ? eventBusSource.getEventChain(selectedCorrelationId)
      : Promise.resolve([]),
    enabled: !!selectedCorrelationId,
    refetchInterval: POLLING_INTERVAL_MEDIUM,
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const events = eventsData?.events || [];
  const chainEvents = chainData || [];

  // Get unique event types for filter dropdown
  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    events.forEach(event => types.add(event.event_type));
    return Array.from(types).sort();
  }, [events]);

  const handleEventClick = (event: EventBusEvent) => {
    setSelectedEvent(event);
  };

  const handleCorrelationClick = (correlationId: string) => {
    setSelectedCorrelationId(correlationId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader
          title="Event Bus Explorer"
          description="Explore and analyze events from the event bus"
          details="Query events by type, tenant, namespace, correlation ID, and time range. View event chains, statistics, and detailed payloads."
          level="h1"
        />
        <EventBusHealthIndicator />
      </div>

      {/* Search and Filter Bar */}
      <EventSearchBar
        eventTypes={eventTypes}
        onFilterChange={setFilters}
      />

      {/* Statistics Panel */}
      <EventStatisticsPanel />

      {/* Event Chain Visualization (if correlation selected) */}
      {selectedCorrelationId && (
        <>
          {isChainLoading && (
            <Card className="mb-6 p-6">
              <Skeleton className="h-48 w-full" />
            </Card>
          )}
          {!isChainLoading && chainEvents.length > 0 && (
            <EventChainVisualization
              events={chainEvents}
              correlationId={selectedCorrelationId}
              onEventClick={handleEventClick}
            />
          )}
          {!isChainLoading && chainEvents.length === 0 && (
            <Card className="mb-6 p-6 text-center text-muted-foreground">
              <p>No events found for correlation ID "{selectedCorrelationId}".</p>
            </Card>
          )}
        </>
      )}

      {/* Events List */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">
            Events ({events.length})
          </h3>
          <ExportButton
            data={events}
            filename={`event-bus-events-${new Date().toISOString().split('T')[0]}`}
            disabled={isLoading || isError}
          />
        </div>

        {isError && (
          <Card className="p-4 border-destructive mb-4">
            <p className="text-sm text-destructive">
              Error loading events: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </Card>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading events...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No events found. Try adjusting your filters.
          </p>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.event_id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for event ${event.event_type}`}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => handleEventClick(event)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEventClick(event);
                    }
                  }}
                >
                  <div className="flex-shrink-0 w-24 text-xs text-muted-foreground font-mono">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EventTypeBadge eventType={event.event_type} />
                      {event.correlation_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          aria-label={`View event chain for correlation ${event.correlation_id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCorrelationClick(event.correlation_id!);
                          }}
                        >
                          Chain: {event.correlation_id.slice(0, 8)}...
                        </Button>
                      )}
                      {event.causation_id && (
                        <Badge variant="outline" className="text-xs font-mono">
                          Caused by: {event.causation_id.slice(0, 8)}...
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>
                        <span className="font-medium">Source:</span> {event.source}
                      </div>
                      <div>
                        <span className="font-medium">Tenant:</span> {event.tenant_id}
                        {event.namespace && (
                          <> • <span className="font-medium">Namespace:</span> {event.namespace}</>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      {/* Event Detail Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Event Details</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <ScrollArea className="max-h-[80vh]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4">
                    <div className="text-sm font-medium mb-2">Event Type</div>
                    <EventTypeBadge eventType={selectedEvent.event_type} />
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm font-medium mb-2">Event ID</div>
                    <code className="text-xs font-mono">{selectedEvent.event_id}</code>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm font-medium mb-2">Timestamp</div>
                    <div className="text-xs">{new Date(selectedEvent.timestamp).toLocaleString()}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm font-medium mb-2">Source</div>
                    <div className="text-xs">{selectedEvent.source}</div>
                  </Card>
                  {selectedEvent.correlation_id && (
                    <Card className="p-4">
                      <div className="text-sm font-medium mb-2">Correlation ID</div>
                      <code className="text-xs font-mono">{selectedEvent.correlation_id}</code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => handleCorrelationClick(selectedEvent.correlation_id!)}
                      >
                        View Chain
                      </Button>
                    </Card>
                  )}
                  {selectedEvent.causation_id && (
                    <Card className="p-4">
                      <div className="text-sm font-medium mb-2">Causation ID</div>
                      <code className="text-xs font-mono">{selectedEvent.causation_id}</code>
                    </Card>
                  )}
                </div>
                <EventPayloadViewer payload={selectedEvent.payload} />
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

