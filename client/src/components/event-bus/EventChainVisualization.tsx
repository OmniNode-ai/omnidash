/**
 * Event Chain Visualization Component
 * 
 * Visual timeline showing event chains with correlation/causation relationships.
 */

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { EventTypeBadge } from "./EventTypeBadge";
import type { EventBusEvent } from "@/lib/data-sources";
import { cn } from "@/lib/utils";

export interface EventChainVisualizationProps {
  events: EventBusEvent[];
  correlationId?: string;
  onEventClick?: (event: EventBusEvent) => void;
  className?: string;
}

interface EventNode {
  event: EventBusEvent;
  level: number;
  children: EventNode[];
}

function buildEventTree(events: EventBusEvent[]): EventNode[] {
  const eventMap = new Map<string, EventNode>();
  const roots: EventNode[] = [];

  // Create nodes
  events.forEach(event => {
    eventMap.set(event.event_id, {
      event,
      level: 0,
      children: [],
    });
  });

  // Build tree structure based on causation_id
  events.forEach(event => {
    const node = eventMap.get(event.event_id)!;
    if (event.causation_id) {
      const parent = eventMap.get(event.causation_id);
      if (parent) {
        parent.children.push(node);
        node.level = parent.level + 1;
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function formatTimestamp(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return timestamp;
  }
}

function EventNodeComponent({ 
  node, 
  onEventClick,
  maxLevel = 0 
}: { 
  node: EventNode; 
  onEventClick?: (event: EventBusEvent) => void;
  maxLevel: number;
}) {
  const indent = node.level * 40;

  return (
    <div className="relative">
      {/* Connection line */}
      {node.level > 0 && (
        <div
          className="absolute left-0 top-0 w-px bg-border"
          style={{ 
            left: `${indent - 20}px`,
            height: '20px',
          }}
        />
      )}

      <div
        data-testid="event-chain-node"
        className={cn(
          "flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors",
          onEventClick && "cursor-pointer"
        )}
        style={{ marginLeft: `${indent}px` }}
        onClick={onEventClick ? () => onEventClick(node.event) : undefined}
      >
        {/* Timeline indicator */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <div className="w-2 h-2 rounded-full bg-primary" />
          {node.children.length > 0 && (
            <div className="w-px h-full bg-border min-h-[20px]" />
          )}
        </div>

        {/* Event content */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <EventTypeBadge eventType={node.event.event_type} />
            <span className="text-xs text-muted-foreground font-mono">
              {formatTimestamp(node.event.timestamp)}
            </span>
            {node.event.causation_id && (
              <Badge variant="outline" className="text-xs">
                Causation: {node.event.causation_id.slice(0, 8)}...
              </Badge>
            )}
          </div>
          
          {node.event.source && (
            <div className="text-xs text-muted-foreground">
              Source: <span className="font-mono">{node.event.source}</span>
            </div>
          )}
        </div>
      </div>

      {/* Render children */}
      {node.children.length > 0 && (
        <div className="ml-4">
          {node.children.map((child) => (
            <EventNodeComponent
              key={child.event.event_id}
              node={child}
              onEventClick={onEventClick}
              maxLevel={maxLevel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function EventChainVisualization({ 
  events, 
  correlationId,
  onEventClick,
  className 
}: EventChainVisualizationProps) {
  const eventTree = useMemo(() => buildEventTree(events), [events]);
  const maxLevel = useMemo(() => {
    const getMaxLevel = (nodes: EventNode[]): number => {
      return Math.max(...nodes.map(node => 
        node.children.length > 0 
          ? Math.max(node.level, getMaxLevel(node.children))
          : node.level
      ));
    };
    return getMaxLevel(eventTree);
  }, [eventTree]);

  const handleExport = () => {
    const dataStr = JSON.stringify(events, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `event-chain-${correlationId || 'all'}-${new Date().toISOString().replace(/[:]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (events.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground text-center">
            No events in chain
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            Event Chain {correlationId && `(${correlationId.slice(0, 8)}...)`}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" />
            Export Chain
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {eventTree.map((root) => (
            <EventNodeComponent
              key={root.event.event_id}
              node={root}
              onEventClick={onEventClick}
              maxLevel={maxLevel}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

