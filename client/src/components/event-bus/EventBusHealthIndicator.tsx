/**
 * Event Bus Health Indicator Component
 * 
 * Shows event bus connection status and health metrics.
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { eventBusSource, type EventBusStatus } from "@/lib/data-sources";
import { POLLING_INTERVAL_MEDIUM } from "@/lib/constants/query-config";
import { Activity, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventBusHealthIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function EventBusHealthIndicator({ className, showLabel = true }: EventBusHealthIndicatorProps) {
  const { data: status, isLoading, isError, error } = useQuery({
    queryKey: ['event-bus-status'],
    queryFn: () => eventBusSource.getStatus(),
    refetchInterval: POLLING_INTERVAL_MEDIUM,
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30s
  });

  if (isLoading) {
    return (
      <Badge variant="outline" className={cn("gap-1.5", className)}>
        <Activity className="w-3 h-3 animate-pulse" />
        {showLabel && <span className="text-xs">Loading...</span>}
      </Badge>
    );
  }

  // Distinguish between error state and unknown state
  const effectiveStatus: EventBusStatus['status'] = isError 
    ? 'error' 
    : (status?.status || 'unknown');

  const getStatusIcon = (s: EventBusStatus['status']) => {
    switch (s) {
      case 'running': return CheckCircle2;
      case 'stopped': return XCircle;
      case 'connecting': return Clock;
      case 'error': return XCircle;
      case 'unknown': return AlertCircle;
      default: return AlertCircle;
    }
  };

  const getStatusColor = (s: EventBusStatus['status']) => {
    switch (s) {
      case 'running': return 'bg-green-500';
      case 'stopped': return 'bg-red-500';
      case 'connecting': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      case 'unknown': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const StatusIcon = getStatusIcon(effectiveStatus);
  const statusColor = getStatusColor(effectiveStatus);
  const statusText = effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1.5", className)}>
            <span className={cn("h-2 w-2 rounded-full", statusColor, effectiveStatus === 'connecting' && 'animate-pulse')} />
            {showLabel && <span className="text-xs">{statusText}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Event Bus Status: {statusText}</p>
          <p>Connection: {status?.connected ? 'Established' : 'Lost'}</p>
          {isError && <p className="text-destructive">Error: {error instanceof Error ? error.message : 'Unknown error'}</p>}
          {(effectiveStatus === 'stopped' || effectiveStatus === 'error') && <p className="text-destructive">Check server logs for errors.</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

