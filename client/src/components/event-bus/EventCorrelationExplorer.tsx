/**
 * Event Correlation Explorer Component
 *
 * Dedicated view for exploring event correlations.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EventChainVisualization } from './EventChainVisualization';
import { EventTypeBadge } from './EventTypeBadge';
import { eventBusSource } from '@/lib/data-sources';
import { Search, Share2, Download } from 'lucide-react';

export interface EventCorrelationExplorerProps {
  className?: string;
}

export function EventCorrelationExplorer({ className }: EventCorrelationExplorerProps) {
  const [correlationId, setCorrelationId] = useState('');
  const [searchValue, setSearchValue] = useState('');

  const {
    data: events,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['event-correlation', correlationId],
    queryFn: () => eventBusSource.getEventChain(correlationId),
    enabled: !!correlationId,
  });

  const handleSearch = () => {
    if (searchValue.trim()) {
      setCorrelationId(searchValue.trim());
    }
  };

  const handleShare = () => {
    if (!correlationId) return;

    // Guard browser APIs for SSR compatibility
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      console.warn('Share functionality not available in SSR environment');
      return;
    }

    if (!navigator.clipboard) {
      console.warn('Clipboard API not available');
      return;
    }

    const url = `${window.location.origin}${window.location.pathname}?correlation=${correlationId}`;
    navigator.clipboard.writeText(url).catch((err) => {
      console.error('Failed to copy to clipboard:', err);
    });
  };

  const handleExport = () => {
    if (!events || events.length === 0) return;

    // Guard browser APIs for SSR compatibility
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.warn('Export functionality not available in SSR environment');
      return;
    }

    if (typeof URL === 'undefined' || !URL.createObjectURL) {
      console.warn('URL API not available');
      return;
    }

    try {
      const dataStr = JSON.stringify(events, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `correlation-${correlationId}-${new Date().toISOString()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export events:', err);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Explore Event Correlation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter correlation ID"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="font-mono text-xs"
            />
            <Button onClick={handleSearch} disabled={!searchValue.trim()}>
              <Search className="w-4 h-4 mr-1" />
              Search
            </Button>
            {correlationId && (
              <>
                <Button variant="outline" onClick={handleShare}>
                  <Share2 className="w-4 h-4 mr-1" />
                  Share
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={!events || events.length === 0}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </>
            )}
          </div>

          {correlationId && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Correlation ID:</span>
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded">{correlationId}</code>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground text-center">
              Loading correlation chain...
            </p>
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card className="border-destructive">
          <CardContent className="p-6">
            <p className="text-sm text-destructive text-center">
              Failed to load correlation chain. Please check the correlation ID.
            </p>
          </CardContent>
        </Card>
      )}

      {events && events.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Correlation Chain ({events.length} events)</CardTitle>
            </CardHeader>
            <CardContent>
              <EventChainVisualization events={events} correlationId={correlationId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Event Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {events.map((event) => (
                  <div
                    key={event.event_id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border"
                  >
                    <div className="flex-shrink-0 w-24 text-xs text-muted-foreground font-mono">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <EventTypeBadge eventType={event.event_type} />
                      <div className="text-xs text-muted-foreground">
                        <div>Source: {event.source}</div>
                        <div>Tenant: {event.tenant_id}</div>
                        {event.causation_id && (
                          <div>
                            Caused by:{' '}
                            <code className="font-mono">
                              {event.causation_id.length > 16
                                ? `${event.causation_id.slice(0, 16)}...`
                                : event.causation_id}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {events && events.length === 0 && correlationId && !isLoading && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground text-center">
              No events found for this correlation ID.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
