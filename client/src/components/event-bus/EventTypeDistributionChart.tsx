/**
 * Event Type Distribution Chart Component
 * 
 * Chart showing event type distribution over time.
 */

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RealtimeChart } from "@/components/RealtimeChart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { EventBusEvent } from "@/lib/data-sources";
import { useState } from "react";

export interface EventTypeDistributionChartProps {
  events: EventBusEvent[];
  className?: string;
}

export function EventTypeDistributionChart({
  events,
  className
}: EventTypeDistributionChartProps) {
  const [selectedTenant, setSelectedTenant] = useState<string>('all');

  // Get unique tenants
  const tenants = useMemo(() => {
    const tenantSet = new Set<string>();
    events.forEach(e => tenantSet.add(e.tenant_id));
    return Array.from(tenantSet).sort();
  }, [events]);

  // Filter by tenant
  const filteredEvents = useMemo(() => {
    if (selectedTenant === 'all') return events;
    return events.filter(e => e.tenant_id === selectedTenant);
  }, [events, selectedTenant]);

  // Group events by type and time
  const chartData = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    filteredEvents.forEach(event => {
      typeCounts[event.event_type] = (typeCounts[event.event_type] || 0) + 1;
    });

    // Convert to time series format (simplified - in real implementation would group by time buckets)
    const now = Date.now();
    return Object.entries(typeCounts).map(([type, count]) => ({
      time: new Date(now).toISOString(),
      value: count,
      label: type,
    }));
  }, [filteredEvents]);

  // Get top event types
  const topTypes = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    filteredEvents.forEach(event => {
      typeCounts[event.event_type] = (typeCounts[event.event_type] || 0) + 1;
    });
    return Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));
  }, [filteredEvents]);

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Event Type Distribution</CardTitle>
          <Select value={selectedTenant} onValueChange={setSelectedTenant}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tenants</SelectItem>
              {tenants.map(tenant => (
                <SelectItem key={tenant} value={tenant}>
                  {tenant}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <RealtimeChart
          title="Events by Type"
          data={chartData}
          color="hsl(var(--chart-1))"
          showArea
        />
        <div>
          <h4 className="text-sm font-semibold mb-2">Top Event Types</h4>
          <div className="space-y-2">
            {topTypes.map(({ type, count }) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs truncate flex-1">{type}</span>
                <Badge variant="secondary" className="ml-2">
                  {count}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

