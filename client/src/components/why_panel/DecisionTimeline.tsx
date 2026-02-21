/**
 * DecisionTimeline — View 2 of the "Why This Happened" panel (OMN-2469)
 *
 * Chronological list of DecisionRecords for a session/workflow.
 * Each row shows: timestamp, decision_type, selected_candidate, candidates count.
 * Expand-in-place to reveal Layer 1 (constraints, scoring, tie-breaker).
 * Layer 2 (agent narrative) requires explicit click — hidden by default.
 *
 * Layer authority:
 *   Layer 1 (authoritative): structured constraints, scores, tie-breaker
 *   Layer 2 (assistive):     agent narrative — labeled as non-authoritative
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  DecisionRecord,
  DecisionType,
  DecisionTimelineRow,
} from '@shared/decision-record-types';

// ============================================================================
// Constants
// ============================================================================

const DECISION_TYPE_COLORS: Record<DecisionType, string> = {
  model_select:
    'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  tool_select:
    'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  route_select:
    'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30',
  default_apply:
    'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
};

const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  model_select: 'model_select',
  tool_select: 'tool_select',
  route_select: 'route_select',
  default_apply: 'default_apply',
};

// ============================================================================
// Types
// ============================================================================

export interface DecisionTimelineProps {
  rows: DecisionTimelineRow[];
  /** Called when user navigates from Layer 2 to candidate comparison view */
  onViewCandidates?: (decisionId: string) => void;
  className?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function fmtTime(iso: string): string {
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

function fmtScore(score: number): string {
  return score.toFixed(2);
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Layer1Detail — shows constraints, scoring, tie-breaker from the DecisionRecord.
 * Visible immediately on row expand (no extra click required).
 */
function Layer1Detail({ record }: { record: DecisionRecord }) {
  const selectedCandidate = record.candidates_considered.find((c) => c.selected);
  const metrics = selectedCandidate?.scoring_breakdown
    ? Object.entries(selectedCandidate.scoring_breakdown)
    : [];

  return (
    <div
      className="bg-muted/30 border-t border-border p-4 space-y-3"
      data-testid="layer1-detail"
    >
      {/* Constraints */}
      {record.constraints_applied.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Constraints
          </p>
          <div className="space-y-1">
            {record.constraints_applied.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-foreground font-mono">{c.description}</span>
                {c.eliminates.length > 0 && (
                  <span className="text-muted-foreground">
                    → eliminates: {c.eliminates.join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scoring breakdown */}
      {metrics.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Scoring ({record.selected_candidate})
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {metrics.map(([metric, score]) => (
              <div key={metric} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{metric}</span>
                <span className="font-mono font-medium">{fmtScore(score)}</span>
              </div>
            ))}
          </div>
          {selectedCandidate?.total_score !== undefined && (
            <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-border">
              <span className="font-semibold text-muted-foreground">Total</span>
              <span className="font-mono font-semibold">
                {fmtScore(selectedCandidate.total_score)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tie-breaker */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Tie-breaker
        </p>
        <p className="text-xs text-foreground">
          {record.tie_breaker ?? (
            <span className="text-muted-foreground">None (clear winner)</span>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Layer2Detail — agent narrative.
 * Hidden by default; requires explicit "Show agent narrative" click.
 * Visually distinct from Layer 1 (amber background, italic text).
 */
function Layer2Detail({ rationale }: { rationale: string | null }) {
  if (!rationale) {
    return (
      <div
        className="bg-amber-500/5 border-t border-amber-500/20 px-4 py-3"
        data-testid="layer2-detail"
      >
        <p className="text-xs text-muted-foreground italic">No agent narrative recorded.</p>
      </div>
    );
  }

  return (
    <div
      className="bg-amber-500/8 border-t border-amber-500/20 px-4 py-3 space-y-2"
      data-testid="layer2-detail"
    >
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
        >
          Agent Narrative (assistive, not authoritative)
        </Badge>
      </div>
      <p className="text-sm text-foreground italic leading-relaxed">&ldquo;{rationale}&rdquo;</p>
      <p className="text-xs text-muted-foreground">
        This is a model-generated narrative. The structured provenance above is authoritative.
      </p>
    </div>
  );
}

/**
 * TimelineRow — a single collapsible row in the decision timeline.
 */
function TimelineRow({
  row,
  onViewCandidates,
}: {
  row: DecisionTimelineRow;
  onViewCandidates?: (decisionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [layer2Visible, setLayer2Visible] = useState(false);

  const hasNarrative = row.full_record.agent_rationale !== null;

  return (
    <div
      className="border-b border-border last:border-0"
      data-testid={`timeline-row-${row.decision_id}`}
    >
      {/* Summary row */}
      <button
        type="button"
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          'hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          expanded && 'bg-muted/20'
        )}
        onClick={() => {
          setExpanded((v) => !v);
          if (expanded) setLayer2Visible(false);
        }}
        aria-expanded={expanded}
        aria-label={`${row.decision_type} decision at ${fmtTime(row.decided_at)}`}
        data-testid={`timeline-row-toggle-${row.decision_id}`}
      >
        {/* Expand icon */}
        <span className="text-muted-foreground shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>

        {/* Timestamp */}
        <span
          className="text-xs text-muted-foreground font-mono shrink-0 w-20"
          data-testid={`timeline-timestamp-${row.decision_id}`}
        >
          {fmtTime(row.decided_at)}
        </span>

        {/* Decision type badge */}
        <Badge
          variant="outline"
          className={cn(
            'text-xs font-mono shrink-0',
            DECISION_TYPE_COLORS[row.decision_type]
          )}
          data-testid={`timeline-type-${row.decision_id}`}
        >
          {DECISION_TYPE_LABELS[row.decision_type]}
        </Badge>

        {/* Selected candidate */}
        <span
          className="text-sm font-medium text-foreground flex-1 truncate"
          data-testid={`timeline-selected-${row.decision_id}`}
        >
          {row.selected_candidate}
        </span>

        {/* Candidates count */}
        <span
          className="text-xs text-muted-foreground shrink-0"
          data-testid={`timeline-candidates-count-${row.decision_id}`}
        >
          &#x25BA; {row.candidates_count} candidate{row.candidates_count !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Expanded: Layer 1 detail (immediately visible on expand) */}
      {expanded && (
        <div>
          <Layer1Detail record={row.full_record} />

          {/* Layer 2 toggle */}
          <div className="px-4 py-2 border-t border-border bg-muted/10 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'text-xs h-7',
                hasNarrative
                  ? 'text-amber-600 dark:text-amber-400 hover:text-amber-500'
                  : 'text-muted-foreground'
              )}
              onClick={() => setLayer2Visible((v) => !v)}
              aria-expanded={layer2Visible}
              data-testid={`show-narrative-btn-${row.decision_id}`}
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              {layer2Visible ? 'Hide agent narrative' : 'Show agent narrative'}
              {!hasNarrative && (
                <span className="ml-1 text-muted-foreground">(none recorded)</span>
              )}
            </Button>

            {onViewCandidates && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-muted-foreground"
                onClick={() => onViewCandidates(row.decision_id)}
                data-testid={`view-candidates-btn-${row.decision_id}`}
              >
                View candidate comparison &#x2197;
              </Button>
            )}
          </div>

          {/* Layer 2 content (hidden until explicitly clicked) */}
          {layer2Visible && <Layer2Detail rationale={row.full_record.agent_rationale} />}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * DecisionTimeline renders the chronological sequence of DecisionRecords
 * for a workflow session. Supports expand-in-place for Layer 1 detail,
 * and explicit opt-in for Layer 2 (agent narrative).
 */
export function DecisionTimeline({ rows, onViewCandidates, className }: DecisionTimelineProps) {
  // Sort chronologically (oldest first — "how did we get here" mental model)
  const sorted = [...rows].sort(
    (a, b) => new Date(a.decided_at).getTime() - new Date(b.decided_at).getTime()
  );

  return (
    <Card className={cn('w-full', className)} data-testid="decision-timeline-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Why This Happened &rsaquo; Decision Timeline
          </CardTitle>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            <Clock className="h-3 w-3 mr-1" />
            {sorted.length} decision{sorted.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Chronological sequence of system decisions. Expand a row to see Layer 1 provenance.
          Layer 2 (agent narrative) requires explicit action.
        </p>
      </CardHeader>

      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <div
            className="px-4 py-8 text-center text-sm text-muted-foreground"
            data-testid="decision-timeline-empty"
          >
            No decisions recorded for this session.
          </div>
        ) : (
          <div role="list" aria-label="Decision timeline" data-testid="decision-timeline-rows">
            {sorted.map((row) => (
              <div key={row.decision_id} role="listitem">
                <TimelineRow row={row} onViewCandidates={onViewCandidates} />
              </div>
            ))}
          </div>
        )}

        {/* Layer authority legend */}
        <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-sm bg-muted-foreground/50" />
            <span>Layer 1 (default visible on expand) — authoritative structured data</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-sm bg-amber-500/40" />
            <span>Layer 2 (requires click) — assistive agent narrative</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DecisionTimeline;
