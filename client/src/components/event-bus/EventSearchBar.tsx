/**
 * Event Search & Filter Bar Component
 * 
 * Powerful search and filter component for events.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { X, Search, Filter, Calendar } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import type { EventQueryOptions } from "@/lib/data-sources";

export interface EventSearchBarProps {
  onFilterChange: (filters: EventQueryOptions) => void;
  eventTypes?: string[];
  className?: string;
}

const QUICK_TIME_RANGES = [
  { label: 'Last hour', value: '1h' },
  { label: 'Last 24h', value: '24h' },
  { label: 'Last week', value: '7d' },
  { label: 'Last month', value: '30d' },
] as const;

export function EventSearchBar({ onFilterChange, eventTypes = [], className }: EventSearchBarProps) {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');
  const [correlationId, setCorrelationId] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Calculate time range dates
  const timeRangeDates = useMemo(() => {
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
      default:
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    return { start, end: now };
  }, [timeRange]);

  // Build filter options
  const buildFilters = useCallback(() => {
    const filters: EventQueryOptions = {
      start_time: timeRangeDates.start,
      end_time: timeRangeDates.end,
      limit: 100,
      order_by: 'timestamp',
      order_direction: 'desc',
    };

    if (eventTypeFilter) {
      filters.event_types = [eventTypeFilter];
    }
    if (correlationId) {
      filters.correlation_id = correlationId;
    }
    if (tenantId) {
      filters.tenant_id = tenantId;
    }
    if (source) {
      filters.source = source;
    }

    return filters;
  }, [eventTypeFilter, correlationId, tenantId, source, timeRangeDates]);

  // Apply filters when they change
  const handleFilterChange = useCallback(() => {
    onFilterChange(buildFilters());
  }, [buildFilters, onFilterChange]);

  // Clear all filters
  const handleClear = useCallback(() => {
    setEventTypeFilter('');
    setCorrelationId('');
    setTenantId('');
    setSource('');
    setTimeRange('24h');
    // Compute default time range inline to avoid stale closure
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    onFilterChange({
      start_time: start,
      end_time: now,
      limit: 100,
      order_by: 'timestamp',
      order_direction: 'desc',
    });
  }, [onFilterChange]);

  // Update filters when inputs change
  useEffect(() => {
    handleFilterChange();
  }, [handleFilterChange]);

  const hasActiveFilters = eventTypeFilter || correlationId || tenantId || source || timeRange !== '24h';

  return (
    <Card className={cn("p-4 space-y-4", className)}>
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Search & Filter Events</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="ml-auto"
        >
          <Filter className="w-4 h-4 mr-1" />
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Event Type Filter */}
        <div className="space-y-1">
          <label htmlFor="event-type-filter" className="text-xs text-muted-foreground">Event Type</label>
          <Select value={eventTypeFilter || 'all'} onValueChange={(value) => {
            setEventTypeFilter(value === 'all' ? '' : value);
          }}>
            <SelectTrigger id="event-type-filter">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {eventTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Correlation ID Search */}
        <div className="space-y-1">
          <label htmlFor="correlation-id-filter" className="text-xs text-muted-foreground">Correlation ID</label>
          <Input
            id="correlation-id-filter"
            placeholder="Search by correlation ID"
            value={correlationId}
            onChange={(e) => {
              setCorrelationId(e.target.value);
            }}
            className="font-mono text-xs"
          />
        </div>

        {/* Time Range */}
        <div className="space-y-1">
          <label htmlFor="time-range-filter" className="text-xs text-muted-foreground">Time Range</label>
          <Select value={timeRange} onValueChange={(value) => {
            setTimeRange(value);
          }}>
            <SelectTrigger id="time-range-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUICK_TIME_RANGES.map((range) => (
                <SelectItem key={range.value} value={range.value}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear Button */}
        <div className="flex items-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!hasActiveFilters}
            className="w-full"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t">
          <div className="space-y-1">
            <label htmlFor="tenant-id-filter" className="text-xs text-muted-foreground">Tenant ID</label>
            <Input
              id="tenant-id-filter"
              placeholder="Filter by tenant"
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value);
              }}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="source-filter" className="text-xs text-muted-foreground">Source</label>
            <Input
              id="source-filter"
              placeholder="Filter by source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
              }}
              className="font-mono text-xs"
            />
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {eventTypeFilter && (
            <Badge variant="secondary" className="text-xs">
              Type: {eventTypeFilter}
              <button
                onClick={() => {
                  setEventTypeFilter('');
                }}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {correlationId && (
            <Badge variant="secondary" className="text-xs">
              Correlation: {correlationId.length > 16 ? `${correlationId.slice(0, 16)}...` : correlationId}
              <button
                onClick={() => {
                  setCorrelationId('');
                }}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {tenantId && (
            <Badge variant="secondary" className="text-xs">
              Tenant: {tenantId}
              <button
                onClick={() => {
                  setTenantId('');
                }}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {source && (
            <Badge variant="secondary" className="text-xs">
              Source: {source}
              <button
                onClick={() => {
                  setSource('');
                }}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {timeRange !== '24h' && (
            <Badge variant="secondary" className="text-xs">
              <Calendar className="w-3 h-3 mr-1" />
              Time: {QUICK_TIME_RANGES.find(r => r.value === timeRange)?.label || timeRange}
              <button
                onClick={() => {
                  setTimeRange('24h');
                }}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}

