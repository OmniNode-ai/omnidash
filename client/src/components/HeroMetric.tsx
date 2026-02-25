/**
 * Shared HeroMetric component for category landing pages.
 *
 * Displays a single prominent metric value with status-colored left border,
 * loading skeleton, and descriptive subtitle. Used as the primary KPI on
 * each Phase 2 category dashboard (OMN-2181).
 */

import { Card, CardContent } from '@/components/ui/card';

/** Props for the {@link HeroMetric} component. */
export interface HeroMetricProps {
  /** Short uppercase label displayed above the value. */
  label: string;
  /** Primary display value (e.g. "94.2%", "12 / 15"). */
  value: string;
  /** Explanatory text shown below the value. */
  subtitle: string;
  /** Optional RAG status controlling the left-border colour. */
  status?: 'healthy' | 'warning' | 'error';
  /** When true, renders a pulsing skeleton instead of the value. */
  isLoading?: boolean;
}

/** A large, status-coloured metric card used as the hero KPI on category dashboards. */
export function HeroMetric({ label, value, subtitle, status, isLoading }: HeroMetricProps) {
  const borderColor =
    status === 'healthy'
      ? 'border-status-healthy'
      : status === 'warning'
        ? 'border-status-warning'
        : status === 'error'
          ? 'border-status-error'
          : 'border-primary';

  return (
    <Card className={`border-l-4 ${borderColor} bg-gradient-to-r from-card to-card/80`}>
      <CardContent className="py-6 px-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
        {isLoading ? (
          <div className="h-12 w-32 bg-muted animate-pulse rounded" />
        ) : (
          <div className="text-5xl font-bold font-mono tracking-tight">{value}</div>
        )}
        <div className="text-sm text-muted-foreground mt-2">{subtitle}</div>
      </CardContent>
    </Card>
  );
}
