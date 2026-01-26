/**
 * Session Timeline Component
 *
 * Displays a chronological timeline of intents for a specific session.
 * Provides two visualization modes:
 * - Chart mode: Scatter plot with time on X-axis, categories on Y-axis
 * - List mode: Vertical timeline with clickable intent nodes
 *
 * Shows confidence scores as color intensity and supports click-to-detail.
 *
 * @see OMN-1458 - Real-time Intent Dashboard Panel
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Clock, MessageSquare, AlertCircle, Inbox, BarChart3, List } from 'lucide-react';
import type { IntentItem } from '@/components/intent/RecentIntents';
import {
  getIntentColor,
  getIntentBgClass,
  getConfidenceOpacity,
  getIntentColorWithConfidence,
  getConfidenceBadgeClasses,
  formatCategoryName,
} from '@/lib/intent-colors';

// ============================================================================
// Types
// ============================================================================

interface SessionIntentsResponse {
  ok: boolean;
  session_id: string;
  intents: IntentItem[];
  total_count: number;
  execution_time_ms?: number;
  error?: string;
}

/** View mode for the timeline visualization */
export type TimelineViewMode = 'chart' | 'list';

export interface SessionTimelineProps {
  /** The session ID to display intents for. If not provided, shows recent intents. */
  sessionId?: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when an intent is clicked */
  onIntentClick?: (intent: IntentItem) => void;
  /** Maximum height for the scroll area (default: 400) */
  maxHeight?: number;
  /** Whether to show the card wrapper (default: true) */
  showCard?: boolean;
  /** Polling interval in ms (0 = disabled, default: 0) */
  refetchInterval?: number;
  /** Default view mode (default: 'chart') */
  defaultView?: TimelineViewMode;
  /** Whether to show the view mode toggle (default: true) */
  showViewToggle?: boolean;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Format timestamp to readable time string
 */
function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Transform intents to chart data format
 */
interface ChartDataPoint {
  x: number; // timestamp in ms
  y: number; // category index
  z: number; // confidence (for size scaling)
  intent: IntentItem;
  category: string;
  color: string;
}

function transformToChartData(intents: IntentItem[], categoryOrder: string[]): ChartDataPoint[] {
  return intents.map((intent) => {
    const categoryIndex = categoryOrder.indexOf(intent.intent_category);
    // Clamp confidence to [0, 1] range before any calculations
    const clampedConfidence = Math.max(0, Math.min(1, intent.confidence));

    return {
      x: new Date(intent.created_at).getTime(),
      y: categoryIndex >= 0 ? categoryIndex : categoryOrder.length,
      z: 100 + clampedConfidence * 200, // Size range: 100-300
      intent,
      category: intent.intent_category,
      color: getIntentColorWithConfidence(intent.intent_category, clampedConfidence),
    };
  });
}

// ============================================================================
// Sub-Components
// ============================================================================

interface TimelineNodeProps {
  intent: IntentItem;
  isLast: boolean;
  onClick?: () => void;
}

function TimelineNode({ intent, isLast, onClick }: TimelineNodeProps) {
  // Clamp confidence to [0, 1] range before computing opacity
  const clampedConfidence = Math.max(0, Math.min(1, intent.confidence));
  const opacity = getConfidenceOpacity(clampedConfidence);
  const categoryColor = getIntentBgClass(intent.intent_category);

  return (
    <div
      className={cn('flex gap-4 group', onClick && 'cursor-pointer')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={
        onClick
          ? `View details for ${formatCategoryName(intent.intent_category)} intent`
          : undefined
      }
    >
      {/* Timeline rail with dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={cn('w-3 h-3 rounded-full', categoryColor)} style={{ opacity }} />
        {!isLast && <div className="w-px flex-1 min-h-[24px] bg-border" />}
      </div>

      {/* Intent content */}
      <div
        className={cn(
          'flex-1 pb-4 min-w-0',
          onClick &&
            'transition-all duration-200 rounded-lg -ml-1 pl-1 -mt-1 pt-1 -mr-2 pr-2 group-hover:bg-accent/50'
        )}
      >
        {/* Header: category badge + timestamp */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge variant="outline" className="text-xs" style={{ opacity }}>
            {formatCategoryName(intent.intent_category)}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(intent.created_at)}
          </span>
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              getConfidenceBadgeClasses(intent.confidence)
            )}
          >
            {(intent.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Keywords */}
        {intent.keywords && intent.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {intent.keywords.slice(0, 5).map((keyword, idx) => (
              <span
                key={idx}
                className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
              >
                {keyword}
              </span>
            ))}
            {intent.keywords.length > 5 && (
              <span className="text-xs text-muted-foreground">
                +{intent.keywords.length - 5} more
              </span>
            )}
          </div>
        )}

        {/* User context preview (if available) */}
        {intent.user_context && (
          <div className="text-xs text-muted-foreground line-clamp-2 flex items-start gap-1">
            <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span className="truncate">{intent.user_context}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <Skeleton className="w-3 h-3 rounded-full" />
            <Skeleton className="w-px h-12" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Inbox className="w-12 h-12 text-muted-foreground/50 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">No intents found</p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        Session {sessionId.length > 12 ? `${sessionId.slice(0, 12)}...` : sessionId} has no
        classified intents yet
      </p>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <AlertCircle className="w-12 h-12 text-destructive/50 mb-3" />
      <p className="text-sm font-medium text-destructive">Failed to load intents</p>
      <p className="text-xs text-muted-foreground mt-1">{error}</p>
    </div>
  );
}

// ============================================================================
// Chart Components
// ============================================================================

/**
 * Recharts tooltip payload item type.
 * Recharts can pass malformed or undefined payloads, so we use defensive typing.
 */
interface RechartsPayloadItem {
  payload?: ChartDataPoint;
  value?: number;
  name?: string;
  dataKey?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: RechartsPayloadItem[];
  /** Whether to show the "Click for details" hint */
  showClickHint?: boolean;
}

function ChartTooltip({ active, payload, showClickHint = false }: ChartTooltipProps) {
  // Defensive checks for Recharts payload
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  // Recharts can pass malformed payloads; guard against undefined
  const data = payload[0]?.payload;
  if (!data || !data.intent) {
    return null;
  }

  const intent = data.intent;
  const date = new Date(data.x);

  // Clamp confidence to [0, 1] range for display calculations
  const clampedConfidence = Math.max(0, Math.min(1, intent.confidence));

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-lg text-sm min-w-[200px]">
      {/* Timestamp */}
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span className="font-mono">
          {date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </div>

      {/* Category */}
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: getIntentColor(intent.intent_category) }}
        />
        <span className="font-medium">{formatCategoryName(intent.intent_category)}</span>
      </div>

      {/* Confidence */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <span>Confidence:</span>
        <span
          className={cn(
            'px-1.5 py-0.5 rounded-full font-medium',
            getConfidenceBadgeClasses(clampedConfidence)
          )}
        >
          {(clampedConfidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Session ID (truncated) - guard against null/undefined session_ref */}
      {intent.session_ref && (
        <div className="text-xs text-muted-foreground font-mono">
          Session:{' '}
          {intent.session_ref.length > 12
            ? `${intent.session_ref.slice(0, 12)}...`
            : intent.session_ref}
        </div>
      )}

      {/* Keywords */}
      {intent.keywords && intent.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {intent.keywords.slice(0, 3).map((keyword, idx) => (
            <span
              key={idx}
              className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
            >
              {keyword}
            </span>
          ))}
        </div>
      )}

      {/* Click hint - only shown when onIntentClick handler is provided (showClickHint=true) */}
      {/* This prevents misleading UI when clicking is disabled */}
      {showClickHint && (
        <div className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t">Click for details</div>
      )}
    </div>
  );
}

interface TimelineChartProps {
  intents: IntentItem[];
  onIntentClick?: (intent: IntentItem) => void;
  height?: number;
}

function TimelineChart({ intents, onIntentClick, height = 300 }: TimelineChartProps) {
  // Extract unique categories and sort alphabetically
  const categories = useMemo(() => {
    const unique = Array.from(new Set(intents.map((i) => i.intent_category)));
    return unique.sort();
  }, [intents]);

  // Transform intents to chart data
  const chartData = useMemo(() => transformToChartData(intents, categories), [intents, categories]);

  // Get time bounds for X-axis
  const { minTime, maxTime } = useMemo(() => {
    if (intents.length === 0) {
      const now = Date.now();
      return { minTime: now - 3600000, maxTime: now }; // Last hour
    }
    const times = intents.map((i) => new Date(i.created_at).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    const padding = (max - min) * 0.05 || 300000; // 5% padding or 5 min
    return { minTime: min - padding, maxTime: max + padding };
  }, [intents]);

  // Handle click on a data point
  const handleClick = (data: ChartDataPoint) => {
    if (onIntentClick) {
      onIntentClick(data.intent);
    }
  };

  if (intents.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 100 }}>
        <XAxis
          type="number"
          dataKey="x"
          domain={[minTime, maxTime]}
          tickFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            });
          }}
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          name="Time"
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[-0.5, categories.length - 0.5]}
          ticks={categories.map((_, i) => i)}
          tickFormatter={(value) => {
            const category = categories[value];
            return category ? formatCategoryName(category) : '';
          }}
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={90}
        />
        <ZAxis type="number" dataKey="z" range={[100, 400]} name="Confidence" />
        <Tooltip
          content={<ChartTooltip showClickHint={!!onIntentClick} />}
          cursor={{ strokeDasharray: '3 3', stroke: 'hsl(var(--muted-foreground))' }}
        />
        <Scatter
          data={chartData}
          onClick={(data: { payload?: ChartDataPoint } | null) => {
            // Recharts Scatter onClick passes an object with payload containing the original data point
            // Access the original ChartDataPoint via data.payload, not data directly
            const originalData = data?.payload;
            if (originalData) {
              handleClick(originalData);
            }
          }}
          style={{ cursor: onIntentClick ? 'pointer' : 'default' }}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.color}
              stroke={getIntentColor(entry.category)}
              strokeWidth={1}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function ChartLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-[250px] w-full" />
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SessionTimeline({
  sessionId,
  className,
  onIntentClick,
  maxHeight = 400,
  showCard = true,
  refetchInterval = 0,
  defaultView = 'chart',
  showViewToggle = true,
}: SessionTimelineProps) {
  const [viewMode, setViewMode] = useState<TimelineViewMode>(defaultView);

  // Determine API endpoint based on whether sessionId is provided
  const apiEndpoint = sessionId
    ? `/api/intents/session/${encodeURIComponent(sessionId)}`
    : '/api/intents/recent?limit=100';

  const { data, isLoading, error } = useQuery<SessionIntentsResponse>({
    queryKey: sessionId ? ['session-intents', sessionId] : ['recent-intents-timeline'],
    queryFn: async () => {
      const response = await fetch(apiEndpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch intents: ${response.statusText}`);
      }
      const json = await response.json();
      // Normalize response format between session and recent endpoints
      if (!sessionId && json.intents) {
        return {
          ok: json.ok ?? true,
          session_id: 'recent',
          intents: json.intents,
          total_count: json.total_count ?? json.intents.length,
        };
      }
      return json;
    },
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
    staleTime: 30000,
  });

  // Sort intents by created_at (ascending for chart, descending for list)
  const sortedIntents = useMemo(() => {
    if (!data?.intents) return [];
    const intents = [...data.intents];
    if (viewMode === 'chart') {
      // Ascending for chart (left to right = old to new)
      return intents.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    // Descending for list (top to bottom = new to old)
    return intents.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [data?.intents, viewMode]);

  // Calculate chart height based on number of categories
  const chartHeight = useMemo(() => {
    const categories = new Set(sortedIntents.map((i) => i.intent_category));
    return Math.max(200, categories.size * 50 + 60);
  }, [sortedIntents]);

  const displayLabel = sessionId
    ? sessionId.length > 24
      ? `${sessionId.slice(0, 24)}...`
      : sessionId
    : 'Recent Intents';

  const content = (
    <>
      {isLoading ? (
        viewMode === 'chart' ? (
          <ChartLoadingSkeleton />
        ) : (
          <LoadingSkeleton />
        )
      ) : error ? (
        <ErrorState error={error instanceof Error ? error.message : 'Unknown error'} />
      ) : !data?.ok && data?.error ? (
        <ErrorState error={data.error} />
      ) : sortedIntents.length === 0 ? (
        <EmptyState sessionId={sessionId || 'recent'} />
      ) : viewMode === 'chart' ? (
        <TimelineChart
          intents={sortedIntents}
          onIntentClick={onIntentClick}
          height={Math.min(chartHeight, maxHeight)}
        />
      ) : (
        <ScrollArea style={{ maxHeight: `${maxHeight}px` }}>
          <div className="space-y-0 pr-4">
            {sortedIntents.map((intent, index) => (
              <TimelineNode
                key={intent.intent_id}
                intent={intent}
                isLast={index === sortedIntents.length - 1}
                onClick={onIntentClick ? () => onIntentClick(intent) : undefined}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  );

  if (!showCard) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Session Timeline</CardTitle>
          <div className="flex items-center gap-2">
            {data?.total_count !== undefined && data.total_count > 0 && (
              <Badge variant="secondary" className="text-xs">
                {data.total_count} intent{data.total_count !== 1 ? 's' : ''}
              </Badge>
            )}
            {showViewToggle && (
              <div className="flex rounded-md border">
                <Button
                  variant={viewMode === 'chart' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0 rounded-r-none"
                  onClick={() => setViewMode('chart')}
                  title="Chart view"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0 rounded-l-none border-l"
                  onClick={() => setViewMode('list')}
                  title="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-mono">{displayLabel}</p>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

export default SessionTimeline;
