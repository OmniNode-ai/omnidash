/**
 * Pattern Volume Chart Panel (OMN-1804)
 *
 * Area chart showing pattern matches and injections over time.
 * Uses Recharts for visualization with Carbon Design color tokens.
 * Legend items are click-to-toggle via the shared ToggleableLegend primitive.
 */

import { useQuery } from '@tanstack/react-query';
import { extractionSource } from '@/lib/data-sources/extraction-source';
import { queryKeys } from '@/lib/query-keys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useToggleableLegend } from '@/hooks/useToggleableLegend';
import { ToggleableLegend } from '@/components/ToggleableLegend';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

function formatBucketLabel(bucket: string): string {
  try {
    const d = new Date(bucket);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return bucket;
  }
}

const SERIES_LABELS: Record<string, string> = {
  injections: 'Injections',
  patterns_matched: 'Patterns Matched',
};

interface PatternVolumeChartProps {
  window?: string;
}

export function PatternVolumeChart({ window: timeWindow = '24h' }: PatternVolumeChartProps) {
  const legend = useToggleableLegend();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.extraction.volume(timeWindow),
    queryFn: () => extractionSource.patternVolume(timeWindow),
    refetchInterval: 30_000,
  });

  const chartData = data?.points.map((p) => ({
    ...p,
    label: formatBucketLabel(p.bucket),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Pattern Volume</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Pattern matches and injections over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-48 w-full" />}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span>Failed to load pattern volume</span>
          </div>
        )}

        {!isLoading && !error && data && data.points.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No pattern volume data yet. Charts will populate when extraction events arrive.
          </div>
        )}

        {!isLoading && !error && chartData && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis
                tick={{ fontSize: 10 }}
                className="text-muted-foreground"
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend content={<ToggleableLegend legend={legend} labels={SERIES_LABELS} />} />
              <Area
                type="monotone"
                dataKey="injections"
                name="Injections"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.15}
                strokeWidth={1.5}
                hide={!legend.isActive('injections')}
              />
              <Area
                type="monotone"
                dataKey="patterns_matched"
                name="Patterns Matched"
                stroke="hsl(142 76% 36%)"
                fill="hsl(142 76% 36%)"
                fillOpacity={0.15}
                strokeWidth={1.5}
                hide={!legend.isActive('patterns_matched')}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
