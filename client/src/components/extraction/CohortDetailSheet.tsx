/**
 * CohortDetailSheet — unified flyout for Pipeline Health + Error Rates rows
 *
 * Both panels share the same grouping dimension (cohort), so one component
 * serves both. The caller passes a normalized CohortDetail payload and an
 * optional initialTab to control which section is focused on open.
 */

import { DetailSheet } from '@/components/DetailSheet';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ---------------------------------------------------------------------------
// Unified row detail contract
// ---------------------------------------------------------------------------

export interface CohortDetail {
  /** Display title (usually the cohort name) */
  title: string;
  /** Key/value facts about this cohort */
  facts: Array<{ label: string; value: string }>;
  /** Recent error samples (optional) */
  recent_errors?: Array<{
    session_id: string;
    created_at: string;
    session_outcome: string | null;
  }>;
}

export type CohortDetailTab = 'overview' | 'errors';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CohortDetailSheetProps {
  detail: CohortDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: CohortDetailTab;
}

export function CohortDetailSheet({
  detail,
  open,
  onOpenChange,
  initialTab = 'overview',
}: CohortDetailSheetProps) {
  if (!detail) return null;

  const hasErrors = detail.recent_errors && detail.recent_errors.length > 0;

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={detail.title}
      subtitle="Cohort detail"
    >
      <div className="space-y-6">
        {/* Facts section (always shown) */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Summary
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {detail.facts.map((fact) => (
              <div key={fact.label}>
                <span className="text-[10px] text-muted-foreground">{fact.label}</span>
                <p className="text-sm font-medium tabular-nums">{fact.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Errors section */}
        {(initialTab === 'errors' || hasErrors) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Recent Errors
              </h4>
              {hasErrors && (
                <Badge variant="outline" className="text-red-500 border-red-500/30 text-[10px]">
                  {detail.recent_errors!.length}
                </Badge>
              )}
            </div>
            {hasErrors ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Session</TableHead>
                    <TableHead className="text-xs">Outcome</TableHead>
                    <TableHead className="text-xs text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.recent_errors!.map((err) => (
                    <TableRow key={err.session_id}>
                      <TableCell className="text-xs font-mono truncate max-w-[140px]">
                        {err.session_id.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className="text-red-500 border-red-500/30 text-[10px]"
                        >
                          {err.session_outcome ?? 'unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">
                        {formatRelativeTime(err.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-xs text-muted-foreground">No recent errors for this cohort.</p>
            )}
          </div>
        )}
      </div>
    </DetailSheet>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Factory helpers to build CohortDetail from panel data
// ---------------------------------------------------------------------------

/** Build a CohortDetail from a PipelineHealthPanel row */
export function fromPipelineHealth(cohort: {
  cohort: string;
  total_events: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  avg_latency_ms: number | null;
}): CohortDetail {
  return {
    title: cohort.cohort,
    facts: [
      { label: 'Total Events', value: cohort.total_events.toLocaleString() },
      { label: 'Successes', value: cohort.success_count.toLocaleString() },
      { label: 'Failures', value: cohort.failure_count.toLocaleString() },
      { label: 'Success Rate', value: `${(cohort.success_rate * 100).toFixed(1)}%` },
      {
        label: 'Avg Latency',
        value: cohort.avg_latency_ms != null ? `${Math.round(cohort.avg_latency_ms)}ms` : '--',
      },
    ],
  };
}

/** Build a CohortDetail from an ErrorRatesPanel row */
export function fromErrorRate(entry: {
  cohort: string;
  total_events: number;
  failure_count: number;
  error_rate: number;
  recent_errors: Array<{
    session_id: string;
    created_at: string;
    session_outcome: string | null;
  }>;
}): CohortDetail {
  return {
    title: entry.cohort,
    facts: [
      { label: 'Total Events', value: entry.total_events.toLocaleString() },
      { label: 'Failures', value: entry.failure_count.toLocaleString() },
      { label: 'Error Rate', value: `${(entry.error_rate * 100).toFixed(1)}%` },
    ],
    recent_errors: entry.recent_errors,
  };
}
