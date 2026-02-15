/**
 * TrendDrillDown
 *
 * A popover-style detail panel that appears when clicking a data point
 * on a trend chart. Shows that day's metrics with formatted values
 * and a close button.
 *
 * @see OMN-2049 F1 - Date drill-down from trend charts
 */

import { X, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

export interface DrillDownMetric {
  label: string;
  value: string;
  color?: string;
}

export interface TrendDrillDownData {
  date: string;
  metrics: DrillDownMetric[];
}

interface TrendDrillDownProps {
  data: TrendDrillDownData | null;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Floating card overlay that shows detailed metrics for a specific date
 * when a trend chart data point is clicked.
 *
 * Renders as an absolute-positioned card in the top-right of its
 * containing element (the chart's parent Card).
 */
export function TrendDrillDown({ data, onClose }: TrendDrillDownProps) {
  if (!data) return null;

  return (
    <Card className="absolute top-2 right-2 z-20 w-64 shadow-lg border-primary/20 bg-card/95 backdrop-blur-sm">
      <CardHeader className="pb-2 pr-10">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          {data.date}
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-7 w-7 p-0"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
          <span className="sr-only">Close</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        {data.metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{m.label}</span>
            <Badge
              variant="outline"
              className="font-mono text-xs"
              style={m.color ? { borderColor: m.color, color: m.color } : undefined}
            >
              {m.value}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
