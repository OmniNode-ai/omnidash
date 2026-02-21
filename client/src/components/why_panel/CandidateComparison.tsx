/**
 * CandidateComparison — View 3 of the "Why This Happened" panel (OMN-2470)
 *
 * Comparison table for a single DecisionRecord: all candidates evaluated,
 * constraints applied (eliminated candidates crossed out), per-metric scores,
 * and tie-break logic.
 *
 * Answers "why wasn't X chosen?" for any alternative candidate.
 *
 * Layout:
 *   Candidate           | Latency | Context | Tools | Total | Status
 *   ✓ claude-opus-4-6   |  0.91   |  1.00   | 1.00  | 0.94  | SELECTED
 *     claude-sonnet-4-6 |  0.95   |  0.90   | 1.00  | 0.87  | —
 *   ~~claude-haiku-4-5~~|  1.00   |  ~~~~   |       |       | ELIMINATED
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  CandidateComparisonData,
  CandidateComparisonRow,
  DecisionType,
} from '@shared/decision-record-types';

// ============================================================================
// Types
// ============================================================================

export interface CandidateComparisonProps {
  data: CandidateComparisonData;
  className?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function fmtScore(score: number | null): string {
  if (score === null) return '—';
  return score.toFixed(2);
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 0.8) return 'text-green-600 dark:text-green-400';
  if (score >= 0.6) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function decisionTypeLabel(type: DecisionType): string {
  switch (type) {
    case 'model_select':
      return 'Model Selection';
    case 'tool_select':
      return 'Tool Selection';
    case 'route_select':
      return 'Route Selection';
    case 'default_apply':
      return 'Default Applied';
  }
}

function fmtTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * CandidateRow — single row in the comparison table.
 * Eliminated candidates use line-through styling.
 */
function CandidateRow({
  row,
  metrics,
}: {
  row: CandidateComparisonRow;
  metrics: string[];
}) {
  const baseClass = row.eliminated ? 'opacity-60' : '';

  return (
    <tr
      className={cn(
        'border-b border-border last:border-0',
        row.selected && 'bg-green-500/5',
        row.eliminated && 'bg-red-500/5',
        baseClass
      )}
      data-testid={`candidate-row-${row.id}`}
      aria-label={
        row.selected
          ? `${row.id} — selected`
          : row.eliminated
            ? `${row.id} — eliminated`
            : `${row.id} — not selected`
      }
    >
      {/* Candidate name */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {row.selected && (
            <CheckCircle2
              className="h-4 w-4 text-green-500 shrink-0"
              aria-label="Selected"
              data-testid={`selected-icon-${row.id}`}
            />
          )}
          {row.eliminated && !row.selected && (
            <XCircle
              className="h-4 w-4 text-red-500 shrink-0"
              aria-label="Eliminated"
              data-testid={`eliminated-icon-${row.id}`}
            />
          )}
          {!row.selected && !row.eliminated && (
            <MinusCircle
              className="h-4 w-4 text-muted-foreground shrink-0"
              aria-label="Not selected"
            />
          )}
          <span
            className={cn(
              'text-sm font-medium font-mono',
              row.eliminated && 'line-through text-muted-foreground',
              row.selected && 'text-foreground font-semibold'
            )}
            data-testid={`candidate-name-${row.id}`}
          >
            {row.id}
          </span>
        </div>
        {row.eliminated && row.elimination_reason && (
          <p
            className="text-xs text-red-600 dark:text-red-400 mt-0.5 ml-6"
            data-testid={`elimination-reason-${row.id}`}
          >
            ELIMINATED: {row.elimination_reason}
          </p>
        )}
      </td>

      {/* Per-metric score cells */}
      {metrics.map((metric) => {
        const score = row.scores[metric] ?? null;
        return (
          <td
            key={metric}
            className={cn(
              'px-3 py-3 text-center text-sm font-mono',
              row.eliminated && 'line-through',
              scoreColor(score)
            )}
            data-testid={`score-${row.id}-${metric}`}
          >
            {fmtScore(score)}
          </td>
        );
      })}

      {/* Total score */}
      <td
        className={cn(
          'px-3 py-3 text-center text-sm font-mono font-semibold',
          row.eliminated && 'line-through',
          scoreColor(row.total_score)
        )}
        data-testid={`total-score-${row.id}`}
      >
        {fmtScore(row.total_score)}
      </td>

      {/* Status */}
      <td className="px-4 py-3 text-center">
        {row.selected ? (
          <Badge
            className="text-xs bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
            variant="outline"
            data-testid={`status-badge-${row.id}`}
          >
            SELECTED
          </Badge>
        ) : row.eliminated ? (
          <Badge
            className="text-xs bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
            variant="outline"
            data-testid={`status-badge-${row.id}`}
          >
            ELIMINATED
          </Badge>
        ) : (
          <span
            className="text-xs text-muted-foreground"
            data-testid={`status-badge-${row.id}`}
          >
            —
          </span>
        )}
      </td>
    </tr>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * CandidateComparison renders the full candidate evaluation table for
 * a single DecisionRecord, including eliminated candidates, per-metric
 * scores, constraint list, and tie-breaker.
 */
export function CandidateComparison({ data, className }: CandidateComparisonProps) {
  // Sort: selected first, then non-eliminated, then eliminated
  const sortedRows = [...data.rows].sort((a, b) => {
    if (a.selected && !b.selected) return -1;
    if (!a.selected && b.selected) return 1;
    if (!a.eliminated && b.eliminated) return -1;
    if (a.eliminated && !b.eliminated) return 1;
    return (b.total_score ?? 0) - (a.total_score ?? 0);
  });

  const hasConstraints = data.constraints_applied.length > 0;
  const eliminatedCount = data.rows.filter((r) => r.eliminated).length;

  return (
    <Card className={cn('w-full', className)} data-testid="candidate-comparison-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold">
            Why This Happened &rsaquo; Candidate Comparison
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs text-muted-foreground font-mono">
              {decisionTypeLabel(data.decision_type)}
            </Badge>
            <Badge variant="outline" className="text-xs text-muted-foreground font-mono">
              @ {fmtTimestamp(data.decided_at)}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {data.rows.length} candidate{data.rows.length !== 1 ? 's' : ''} evaluated
          {eliminatedCount > 0 && `, ${eliminatedCount} eliminated by constraints`}.
          Answers &ldquo;why wasn&rsquo;t X chosen?&rdquo; for any alternative.
        </p>
      </CardHeader>

      <CardContent className="p-0">
        {/* Candidate comparison table */}
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm"
            data-testid="candidate-comparison-table"
            aria-label="Candidate comparison"
          >
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Candidate
                </th>
                {data.metric_columns.map((metric) => (
                  <th
                    key={metric}
                    className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                    data-testid={`metric-header-${metric}`}
                  >
                    {metric}
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <CandidateRow key={row.id} row={row} metrics={data.metric_columns} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Constraints section */}
        <div
          className="px-4 py-3 border-t border-border bg-muted/20"
          data-testid="constraints-section"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Constraints applied
          </p>
          {hasConstraints ? (
            <ul className="space-y-1" aria-label="Constraints applied">
              {data.constraints_applied.map((c, i) => (
                <li
                  key={i}
                  className="text-xs flex items-start gap-2"
                  data-testid={`constraint-item-${i}`}
                >
                  <span className="font-mono text-foreground">{c.description}</span>
                  {c.eliminates.length > 0 && (
                    <span className="text-red-500">
                      eliminates {c.eliminates.join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="text-xs text-muted-foreground"
              data-testid="no-constraints-message"
            >
              No constraints applied
            </p>
          )}
        </div>

        {/* Tie-breaker section */}
        <div
          className="px-4 py-3 border-t border-border bg-muted/20"
          data-testid="tie-breaker-section"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Tie-breaker
          </p>
          <p
            className="text-xs text-foreground"
            data-testid="tie-breaker-value"
          >
            {data.tie_breaker !== null ? (
              <>Tie-breaker: {data.tie_breaker}</>
            ) : (
              <span className="text-muted-foreground">No tie-breaker needed</span>
            )}
          </p>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span>Selected</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <XCircle className="h-3.5 w-3.5 text-red-500" />
            <span className="line-through">Eliminated by constraint</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Scored but not selected</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono text-muted-foreground">—</span>
            <span>Score not available</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CandidateComparison;
