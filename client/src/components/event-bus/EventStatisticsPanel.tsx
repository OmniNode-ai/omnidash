/**
 * Event Statistics Panel Component
 *
 * Displays event bus statistics including total events, events by type, events by tenant, and events per minute.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { MetricCard } from '@/components/MetricCard';
import { Activity, TrendingUp, Users, Zap } from 'lucide-react';
import { eventBusSource } from '@/lib/data-sources';
import { POLLING_INTERVAL_MEDIUM, getPollingInterval } from '@/lib/constants/query-config';
import { MockBadge } from '@/components/MockBadge';
import { useState, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface EventStatisticsPanelProps {
  className?: string;
}

export function EventStatisticsPanel({ className }: EventStatisticsPanelProps) {
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  // Helper function to calculate fresh time range on each query
  const getTimeRangeDates = () => {
    const now = new Date();
    let start: Date;

    switch (timeRange) {
      case '1h':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    return { start, end: now };
  };

  const {
    data: statistics,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['event-bus-statistics', timeRange],
    queryFn: () => eventBusSource.getStatistics(getTimeRangeDates()),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_MEDIUM),
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30s
  });

  const isMock = statistics && (statistics as any).isMock;

  // Get top event types
  const topEventTypes = useMemo(() => {
    if (!statistics?.events_by_type) return [];
    return Object.entries(statistics.events_by_type)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [statistics]);

  // Get top tenants
  const topTenants = useMemo(() => {
    if (!statistics?.events_by_tenant) return [];
    return Object.entries(statistics.events_by_tenant)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [statistics]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Event Statistics</h3>
        <Select
          value={timeRange}
          onValueChange={(value: '1h' | '24h' | '7d' | '30d') => setTimeRange(value)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last hour</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last week</SelectItem>
            <SelectItem value="30d">Last month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isMock && <MockBadge label="MOCK DATA: Event Statistics" />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Events"
          value={isLoading ? '...' : (statistics?.total_events || 0).toLocaleString()}
          icon={Activity}
          status={isError ? 'error' : 'healthy'}
        />
        <MetricCard
          label="Events/min"
          value={isLoading ? '...' : (statistics?.events_per_minute || 0).toFixed(1)}
          icon={Zap}
          status={isError ? 'error' : 'healthy'}
        />
        <MetricCard
          label="Event Types"
          value={
            isLoading ? '...' : Object.keys(statistics?.events_by_type || {}).length.toString()
          }
          icon={TrendingUp}
          status={isError ? 'error' : 'healthy'}
        />
        <MetricCard
          label="Tenants"
          value={
            isLoading ? '...' : Object.keys(statistics?.events_by_tenant || {}).length.toString()
          }
          icon={Users}
          status={isError ? 'error' : 'healthy'}
        />
      </div>

      {!isLoading && statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Event Types */}
          <Card className="p-4">
            <h4 className="text-sm font-semibold mb-3">Top Event Types</h4>
            <div className="space-y-2">
              {topEventTypes.length > 0 ? (
                topEventTypes.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs truncate flex-1">{type}</span>
                    <span className="text-muted-foreground ml-2">{count.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No events</p>
              )}
            </div>
          </Card>

          {/* Top Tenants */}
          <Card className="p-4">
            <h4 className="text-sm font-semibold mb-3">Top Tenants</h4>
            <div className="space-y-2">
              {topTenants.length > 0 ? (
                topTenants.map(([tenant, count]) => (
                  <div key={tenant} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs truncate flex-1">{tenant}</span>
                    <span className="text-muted-foreground ml-2">{count.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No tenants</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {isError && (
        <Card className="p-4 border-destructive">
          <p className="text-sm text-destructive">Failed to load statistics</p>
        </Card>
      )}
    </div>
  );
}
