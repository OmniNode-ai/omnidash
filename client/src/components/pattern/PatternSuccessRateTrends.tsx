/**
 * PatternSuccessRateTrends
 *
 * Line chart showing pattern success rate trends over time.
 * Part of OMN-1798: Pattern Health Visualization Widget
 */

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, TrendingUp, Activity } from 'lucide-react';
import type { PatlearnArtifact } from '@/lib/schemas/api-response-schemas';

// ===========================
// Types
// ===========================

type TimeWindow = '24h' | '7d' | '30d';

interface TrendDataPoint {
  time: string;
  date: Date;
  avgScore: number;
  count: number;
}

interface PatternSuccessRateTrendsProps {
  patterns: PatlearnArtifact[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  defaultWindow?: TimeWindow;
}

// ===========================
// Constants
// ===========================

const TIME_WINDOWS: { value: TimeWindow; label: string; days: number }[] = [
  { value: '24h', label: '24h', days: 1 },
  { value: '7d', label: '7d', days: 7 },
  { value: '30d', label: '30d', days: 30 },
];

// ===========================
// Data Processing
// ===========================

function generateTrendData(patterns: PatlearnArtifact[], window: TimeWindow): TrendDataPoint[] {
  const now = new Date();
  const config = TIME_WINDOWS.find((w) => w.value === window) ?? TIME_WINDOWS[1];
  const points: Map<string, { scores: number[]; count: number }> = new Map();

  // Determine bucket size based on window
  const bucketMs =
    window === '24h'
      ? 2 * 60 * 60 * 1000 // 2 hours
      : window === '7d'
        ? 24 * 60 * 60 * 1000 // 1 day
        : 2 * 24 * 60 * 60 * 1000; // 2 days

  const cutoff = new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);

  // Collect scores from pattern history and creation dates
  for (const pattern of patterns) {
    // Include pattern's composite score at its update/create time
    const updateDate = new Date(pattern.updatedAt ?? pattern.createdAt);
    if (updateDate >= cutoff) {
      const bucketKey = new Date(
        Math.floor(updateDate.getTime() / bucketMs) * bucketMs
      ).toISOString();

      if (!points.has(bucketKey)) {
        points.set(bucketKey, { scores: [], count: 0 });
      }
      const bucket = points.get(bucketKey)!;
      bucket.scores.push(pattern.compositeScore);
      bucket.count++;
    }

    // Include score history if available
    if (pattern.metrics?.scoreHistory) {
      for (const entry of pattern.metrics.scoreHistory) {
        const entryDate = new Date(entry.timestamp);
        if (entryDate >= cutoff) {
          const bucketKey = new Date(
            Math.floor(entryDate.getTime() / bucketMs) * bucketMs
          ).toISOString();

          if (!points.has(bucketKey)) {
            points.set(bucketKey, { scores: [], count: 0 });
          }
          const bucket = points.get(bucketKey)!;
          bucket.scores.push(entry.score);
          bucket.count++;
        }
      }
    }
  }

  // If no data, generate placeholder trend
  if (points.size === 0) {
    const numPoints = window === '24h' ? 12 : window === '7d' ? 7 : 15;
    const result: TrendDataPoint[] = [];

    for (let i = numPoints - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * bucketMs);
      const avgScore =
        patterns.length > 0
          ? patterns.reduce((sum, p) => sum + p.compositeScore, 0) / patterns.length
          : 0;

      result.push({
        time: formatTimeLabel(date, window),
        date,
        avgScore: avgScore * 100,
        count: 0,
      });
    }
    return result;
  }

  // Convert map to array and sort
  const result: TrendDataPoint[] = Array.from(points.entries())
    .map(([key, data]) => {
      const date = new Date(key);
      const avgScore =
        data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0;

      return {
        time: formatTimeLabel(date, window),
        date,
        avgScore: avgScore * 100, // Convert to percentage
        count: data.count,
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return result;
}

function formatTimeLabel(date: Date, window: TimeWindow): string {
  if (window === '24h') {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      hour12: true,
    });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

// ===========================
// Custom Tooltip
// ===========================

interface TooltipPayload {
  value: number;
  payload: TrendDataPoint;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.[0]) return null;

  const data = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-lg">
      <p className="font-medium text-sm">{data.time}</p>
      <p className="text-sm">
        <span className="text-muted-foreground">Avg Score: </span>
        <span className="font-mono text-green-500">{data.avgScore.toFixed(1)}%</span>
      </p>
      {data.count > 0 && (
        <p className="text-xs text-muted-foreground">
          {data.count} pattern{data.count !== 1 ? 's' : ''} updated
        </p>
      )}
    </div>
  );
}

// ===========================
// Main Component
// ===========================

export function PatternSuccessRateTrends({
  patterns,
  isLoading = false,
  isError = false,
  defaultWindow = '7d',
}: PatternSuccessRateTrendsProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(defaultWindow);

  const trendData = useMemo(
    () => (patterns ? generateTrendData(patterns, timeWindow) : []),
    [patterns, timeWindow]
  );

  const avgScore = useMemo(() => {
    if (!trendData.length) return 0;
    const sum = trendData.reduce((acc, point) => acc + point.avgScore, 0);
    return sum / trendData.length;
  }, [trendData]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Success Rate Trends
            </CardTitle>
            <div className="flex gap-1">
              {TIME_WINDOWS.map((w) => (
                <Skeleton key={w.value} className="h-7 w-10" />
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
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
            <TrendingUp className="h-4 w-4" />
            Success Rate Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[280px] text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load trends</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!patterns || patterns.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Success Rate Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[280px] text-center">
            <Activity className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">No trend data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Success Rate Trends
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Average: <span className="font-mono text-green-500">{avgScore.toFixed(1)}%</span>
            </p>
          </div>
          <div className="flex gap-1">
            {TIME_WINDOWS.map((w) => (
              <Button
                key={w.value}
                variant={timeWindow === w.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeWindow(w.value)}
                className="h-7 px-2 text-xs"
              >
                {w.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Reference line at average */}
            <ReferenceLine
              y={avgScore}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              opacity={0.5}
            />
            <Line
              type="monotone"
              dataKey="avgScore"
              stroke="#16a34a"
              strokeWidth={2}
              dot={{ r: 3, fill: '#16a34a' }}
              activeDot={{ r: 5, fill: '#16a34a' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
