/**
 * IntentDistribution Component
 *
 * Displays a horizontal bar chart showing the distribution of intent categories
 * from the current session. Fetches data from /api/intents/distribution and
 * auto-refreshes at configurable intervals.
 *
 * @module components/intent/IntentDistribution
 * @see OMN-1458 - Real-time Intent Dashboard Panel
 */

import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Activity, AlertCircle } from 'lucide-react';
import { distributionToArray, type IntentCategoryCount } from '@shared/intent-types';
import { getIntentColor } from '@/lib/intent-colors';

/**
 * API response structure for intent distribution.
 * Matches the actual response from /api/intents/distribution
 */
interface IntentDistributionApiResponse {
  ok: boolean;
  distribution: Record<string, number>;
  total_intents: number;
  time_range_hours: number;
  execution_time_ms?: number;
  error?: string;
}

export interface IntentDistributionProps {
  /** Time range in hours for fetching data. Defaults to 24 hours. */
  timeRangeHours?: number;
  /** Refresh interval in milliseconds. Defaults to 30 seconds. */
  refreshInterval?: number;
  /** Additional CSS classes. */
  className?: string;
  /** Optional custom title. Defaults to "Today's Session Intents". */
  title?: string;
}

/**
 * Fetches intent distribution data from the API.
 */
async function fetchIntentDistribution(
  timeRangeHours: number
): Promise<IntentDistributionApiResponse> {
  const response = await fetch(`/api/intents/distribution?time_range_hours=${timeRangeHours}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch intent distribution: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.ok && data.error) {
    throw new Error(data.error);
  }
  return data;
}

/**
 * Skeleton loading state for the chart.
 */
function IntentDistributionSkeleton({ title, className }: { title: string; className?: string }) {
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-4 w-32 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 flex-1" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Error state display.
 */
function IntentDistributionError({
  title,
  message,
  className,
}: {
  title: string;
  message: string;
  className?: string;
}) {
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mb-2 text-destructive" />
          <p className="text-sm">Failed to load intent distribution</p>
          <p className="text-xs mt-1">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state when no data is available.
 */
function IntentDistributionEmpty({ title, className }: { title: string; className?: string }) {
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Activity className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">No intent data available</p>
          <p className="text-xs mt-1">Intents will appear as they are detected</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Custom tooltip for the bar chart.
 */
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: IntentCategoryCount }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-lg text-sm">
      <p className="font-medium capitalize">{data.category.replace(/_/g, ' ')}</p>
      <p className="text-muted-foreground">
        <span className="font-mono">{data.count.toLocaleString()}</span> events (
        {data.percentage.toFixed(1)}%)
      </p>
    </div>
  );
}

/**
 * IntentDistribution Component
 *
 * Renders a horizontal bar chart showing the distribution of intent categories
 * detected during the current session. The chart auto-refreshes at the specified
 * interval to show live data.
 *
 * @example
 * ```tsx
 * <IntentDistribution
 *   timeRangeHours={24}
 *   refreshInterval={30000}
 *   className="col-span-2"
 *   title="Today's Session Intents (Live)"
 * />
 * ```
 */
export function IntentDistribution({
  timeRangeHours = 24,
  refreshInterval = 30000,
  className,
  title = "Today's Session Intents",
}: IntentDistributionProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['intent-distribution', timeRangeHours],
    queryFn: () => fetchIntentDistribution(timeRangeHours),
    refetchInterval: refreshInterval,
  });

  if (isLoading) {
    return <IntentDistributionSkeleton title={title} className={className} />;
  }

  if (error) {
    return (
      <IntentDistributionError
        title={title}
        message={error instanceof Error ? error.message : 'Unknown error'}
        className={className}
      />
    );
  }

  // Convert distribution object to array with percentages
  const chartData = data ? distributionToArray(data.distribution, data.total_intents) : [];

  if (chartData.length === 0) {
    return <IntentDistributionEmpty title={title} className={className} />;
  }

  // Calculate chart height based on number of categories (40px per bar + padding)
  const chartHeight = Math.max(200, chartData.length * 40 + 20);

  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="w-3.5 h-3.5 text-green-500 animate-pulse" />
            <span>Live</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.total_intents.toLocaleString() ?? 0} total events in last{' '}
          {data?.time_range_hours ?? timeRangeHours}h
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => value.toLocaleString()}
            />
            <YAxis
              type="category"
              dataKey="category"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={100}
              tickFormatter={(value: string) =>
                value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
              }
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
            />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              label={{
                position: 'right',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 11,
                formatter: (_value: number, entry: { payload?: IntentCategoryCount }) => {
                  const percentage = entry?.payload?.percentage;
                  return percentage !== undefined ? `${percentage.toFixed(0)}%` : '';
                },
              }}
            >
              {chartData.map((entry) => (
                <Cell key={entry.category} fill={getIntentColor(entry.category)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default IntentDistribution;
