/**
 * PatternActivityTimeline
 *
 * Vertical timeline showing recent pattern events.
 * Part of OMN-1798: Pattern Health Visualization Widget
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Clock, Plus, ArrowUp, Archive, Activity, Sparkles } from 'lucide-react';
import type { PatlearnArtifact, LifecycleState } from '@/lib/schemas/api-response-schemas';

// ===========================
// Types
// ===========================

interface TimelineEvent {
  id: string;
  type: 'created' | 'promoted' | 'deprecated' | 'score_change';
  patternName: string;
  patternId: string;
  timestamp: Date;
  state?: LifecycleState;
  previousState?: LifecycleState;
  score?: number;
}

interface PatternActivityTimelineProps {
  patterns: PatlearnArtifact[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  maxEvents?: number;
  onPatternClick?: (patternId: string) => void;
}

// ===========================
// Event Type Configuration
// ===========================

const EVENT_CONFIG: Record<
  TimelineEvent['type'],
  {
    icon: React.ElementType;
    label: string;
    color: string;
    bgColor: string;
  }
> = {
  created: {
    icon: Plus,
    label: 'Pattern discovered',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  promoted: {
    icon: ArrowUp,
    label: 'Pattern promoted',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  deprecated: {
    icon: Archive,
    label: 'Pattern deprecated',
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
  score_change: {
    icon: Sparkles,
    label: 'Score updated',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
};

// ===========================
// Time Formatting
// ===========================

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

// ===========================
// Event Derivation
// ===========================

function deriveEventsFromPatterns(
  patterns: PatlearnArtifact[],
  maxEvents: number
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const pattern of patterns) {
    // Created event
    if (pattern.createdAt) {
      events.push({
        id: `${pattern.id}-created`,
        type: 'created',
        patternName: pattern.patternName,
        patternId: pattern.id,
        timestamp: new Date(pattern.createdAt),
        state: pattern.lifecycleState,
      });
    }

    // State change events (if stateChangedAt differs from createdAt)
    if (pattern.stateChangedAt && pattern.stateChangedAt !== pattern.createdAt) {
      const eventType =
        pattern.lifecycleState === 'validated'
          ? 'promoted'
          : pattern.lifecycleState === 'deprecated'
            ? 'deprecated'
            : 'score_change';

      events.push({
        id: `${pattern.id}-state-${pattern.lifecycleState}`,
        type: eventType,
        patternName: pattern.patternName,
        patternId: pattern.id,
        timestamp: new Date(pattern.stateChangedAt),
        state: pattern.lifecycleState,
      });
    }

    // Score history events (last few score changes)
    if (pattern.metrics?.scoreHistory?.length) {
      // Take last 2 score changes per pattern
      const recentHistory = pattern.metrics.scoreHistory.slice(-2);
      for (const entry of recentHistory) {
        events.push({
          id: `${pattern.id}-score-${entry.timestamp}`,
          type: 'score_change',
          patternName: pattern.patternName,
          patternId: pattern.id,
          timestamp: new Date(entry.timestamp),
          score: entry.score,
        });
      }
    }
  }

  // Sort by timestamp descending and limit
  return events
    .sort(
      (a, b) =>
        b.timestamp.getTime() - a.timestamp.getTime() || a.patternName.localeCompare(b.patternName)
    )
    .slice(0, maxEvents);
}

// ===========================
// Timeline Item Component
// ===========================

function TimelineItem({
  event,
  isLast,
  onClick,
}: {
  event: TimelineEvent;
  isLast: boolean;
  onClick?: () => void;
}) {
  const config = EVENT_CONFIG[event.type];
  const Icon = config.icon;

  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={`
            flex items-center justify-center w-8 h-8 rounded-full
            ${config.bgColor} ${config.color}
          `}
        >
          <Icon className="w-4 h-4" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border min-h-[24px]" />}
      </div>

      {/* Event content */}
      <div className="flex-1 pb-4">
        <button
          type="button"
          onClick={onClick}
          className={`
            text-left w-full p-2 -ml-2 rounded-md transition-colors
            ${onClick ? 'hover:bg-muted cursor-pointer' : 'cursor-default'}
          `}
        >
          <p className="text-sm font-medium truncate">{event.patternName}</p>
          <p className="text-xs text-muted-foreground">
            {config.label}
            {event.score !== undefined && (
              <span className="ml-1 font-mono">({(event.score * 100).toFixed(0)}%)</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(event.timestamp)}
          </p>
        </button>
      </div>
    </div>
  );
}

// ===========================
// Main Component
// ===========================

export function PatternActivityTimeline({
  patterns,
  isLoading = false,
  isError = false,
  maxEvents = 10,
  onPatternClick,
}: PatternActivityTimelineProps) {
  const events = useMemo(
    () => (patterns ? deriveEventsFromPatterns(patterns, maxEvents) : []),
    [patterns, maxEvents]
  );

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[200px] text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load activity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[200px] text-center">
            <Activity className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] pr-4">
          <div className="space-y-0">
            {events.map((event, index) => (
              <TimelineItem
                key={event.id}
                event={event}
                isLast={index === events.length - 1}
                onClick={onPatternClick ? () => onPatternClick(event.patternId) : undefined}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
