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
import { Activity, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventBusHealthIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function EventBusHealthIndicator({ className, showLabel = true }: EventBusHealthIndicatorProps) {
  const { data: status, isLoading } = useQuery({
    queryKey: ['event-bus-status'],
    queryFn: () => eventBusSource.getStatus(),
    refetchInterval: POLLING_INTERVAL_MEDIUM,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <Badge variant="outline" className={cn("gap-1.5", className)}>
        <Activity className="w-3 h-3 animate-pulse" />
        {showLabel && <span>Checking...</span>}
      </Badge>
    );
  }

  const isHealthy = status?.active && status?.connected;
  const statusText = status?.status || 'unknown';

  const StatusIcon = isHealthy ? CheckCircle2 : status?.active ? AlertCircle : XCircle;
  const statusColor = isHealthy 
    ? 'bg-green-500/10 text-green-600 border-green-500/20' 
    : status?.active 
    ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    : 'bg-red-500/10 text-red-600 border-red-500/20';

  const badge = (
    <Badge variant="outline" className={cn("gap-1.5", statusColor, className)}>
      <StatusIcon className="w-3 h-3" />
      {showLabel && (
        <span className="capitalize">{statusText}</span>
      )}
    </Badge>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <p><strong>Status:</strong> {statusText}</p>
            <p><strong>Active:</strong> {status?.active ? 'Yes' : 'No'}</p>
            <p><strong>Connected:</strong> {status?.connected ? 'Yes' : 'No'}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

