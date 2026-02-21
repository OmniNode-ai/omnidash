/**
 * NarrativeOverlay — View 4 of the "Why This Happened" panel (OMN-2471)
 *
 * Renders Layer 1 (causal provenance — authoritative) alongside Layer 2
 * (agent_rationale — assistive) with unambiguous visual distinction.
 *
 * Trust rules:
 *   1. Layer 2 is hidden by default; "Show Agent Narrative" toggle reveals it.
 *   2. Mismatch banner (red) appears when Layer 2 references factors not in Layer 1.
 *   3. Mismatch banner is visible even when Layer 2 is collapsed.
 *   4. Disclaimer text always shown inside Layer 2 container when visible.
 *
 * Visual distinction:
 *   Layer 1: standard card, structured data, white/dark background
 *   Layer 2: amber/italic, "assistive" label, disclaimer pinned at bottom
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  MessageSquare,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NarrativeOverlayData, RationaleMismatch } from '@shared/decision-record-types';

// ============================================================================
// Types
// ============================================================================

export interface NarrativeOverlayProps {
  data: NarrativeOverlayData;
  className?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * MismatchBanner — red warning banner shown when Layer 2 conflicts with Layer 1.
 * Visible even when Layer 2 is collapsed (shown in the toggle area).
 */
function MismatchBanner({ mismatches }: { mismatches: RationaleMismatch[] }) {
  if (mismatches.length === 0) return null;

  return (
    <Alert
      className="border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400"
      role="alert"
      data-testid="mismatch-banner"
    >
      <AlertTriangle className="h-4 w-4 text-red-500" />
      <AlertTitle className="text-sm font-semibold text-red-600 dark:text-red-400">
        MISMATCH: Agent narrative conflicts with Layer 1 provenance
      </AlertTitle>
      <AlertDescription className="mt-1">
        <ul className="space-y-1">
          {mismatches.map((m, i) => (
            <li
              key={i}
              className="text-xs"
              data-testid={`mismatch-item-${i}`}
            >
              <span className="font-medium">
                Agent narrative references &ldquo;{m.conflicting_reference}&rdquo;
              </span>
              {' — '}
              <span className="text-red-600/80 dark:text-red-400/80">{m.explanation}</span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Layer1ProvenancePanel — authoritative structured data card.
 */
function Layer1ProvenancePanel({
  summary,
}: {
  summary: NarrativeOverlayData['layer1_summary'];
}) {
  return (
    <div
      className="rounded-md border border-border bg-card p-4 space-y-3"
      data-testid="layer1-provenance-panel"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-green-500" />
        <span className="text-sm font-semibold">
          Causal Provenance (Layer 1 — Authoritative)
        </span>
      </div>

      <div className="space-y-2 divide-y divide-border">
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-muted-foreground">Selected</span>
          <span
            className="text-sm font-mono font-medium"
            data-testid="layer1-selected-candidate"
          >
            {summary.selected_candidate}
          </span>
        </div>

        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-muted-foreground">Constraints applied</span>
          <span
            className="text-sm font-mono"
            data-testid="layer1-constraints-count"
          >
            {summary.constraints_count}
          </span>
        </div>

        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-muted-foreground">Candidates evaluated</span>
          <span
            className="text-sm font-mono"
            data-testid="layer1-candidates-count"
          >
            {summary.candidates_count}
          </span>
        </div>

        {summary.score !== null && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Winning score</span>
            <span
              className="text-sm font-mono font-semibold text-green-600 dark:text-green-400"
              data-testid="layer1-score"
            >
              {summary.score.toFixed(2)}
            </span>
          </div>
        )}

        {summary.top_constraint && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Top constraint</span>
            <span
              className="text-xs font-mono text-foreground"
              data-testid="layer1-top-constraint"
            >
              {summary.top_constraint}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Layer2NarrativePanel — amber, italic, labeled as assistive.
 * Includes disclaimer text pinned at the bottom.
 */
function Layer2NarrativePanel({ rationale }: { rationale: string | null }) {
  return (
    <div
      className={cn(
        'rounded-md border border-amber-500/40 bg-amber-500/8 p-4 space-y-3'
      )}
      data-testid="layer2-narrative-panel"
    >
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          Agent Narrative (Layer 2 — Assistive, Not Authoritative)
        </span>
      </div>

      {rationale ? (
        <p
          className="text-sm italic text-foreground/80 leading-relaxed"
          data-testid="layer2-rationale-text"
        >
          &ldquo;{rationale}&rdquo;
        </p>
      ) : (
        <p
          className="text-sm italic text-muted-foreground"
          data-testid="layer2-rationale-text"
        >
          No agent narrative was recorded for this decision.
        </p>
      )}

      {/* Disclaimer — always visible when Layer 2 is shown */}
      <div
        className="flex items-start gap-2 pt-2 border-t border-amber-500/20"
        data-testid="layer2-disclaimer"
      >
        <Info className="h-3.5 w-3.5 text-amber-500/70 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700/70 dark:text-amber-400/70">
          This is a model-generated narrative. The structured provenance above is
          authoritative.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * NarrativeOverlay renders the agent narrative overlay with strict Layer 1/Layer 2
 * visual separation, mismatch detection, and explicit opt-in for Layer 2.
 */
export function NarrativeOverlay({ data, className }: NarrativeOverlayProps) {
  const [layer2Visible, setLayer2Visible] = useState(false);

  const hasMismatches = data.mismatches.length > 0;
  const hasRationale = data.agent_rationale !== null;

  return (
    <Card className={cn('w-full', className)} data-testid="narrative-overlay-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold">
            Why This Happened &rsaquo; Agent Narrative Overlay
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasMismatches && (
              <Badge
                variant="outline"
                className="text-xs bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
                data-testid="mismatch-count-badge"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                {data.mismatches.length} mismatch{data.mismatches.length !== 1 ? 'es' : ''}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Layer 1 is authoritative structured provenance. Layer 2 is a model-generated
          narrative — assistive only. Never confuse the two.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Layer 1 — always visible */}
        <Layer1ProvenancePanel summary={data.layer1_summary} />

        {/* Mismatch banner — visible even when Layer 2 is collapsed */}
        {hasMismatches && <MismatchBanner mismatches={data.mismatches} />}

        {/* Layer 2 toggle button */}
        <div
          className="flex items-center gap-3"
          data-testid="layer2-toggle-area"
        >
          <Button
            variant={layer2Visible ? 'secondary' : 'outline'}
            size="sm"
            className={cn(
              'text-xs',
              hasRationale
                ? 'text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/10'
                : 'text-muted-foreground'
            )}
            onClick={() => setLayer2Visible((v) => !v)}
            aria-expanded={layer2Visible}
            aria-label={layer2Visible ? 'Hide agent narrative' : 'Show agent narrative'}
            data-testid="layer2-toggle-btn"
          >
            {layer2Visible ? (
              <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 mr-1.5" />
            )}
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            {layer2Visible ? 'Hide Agent Narrative' : 'Show Agent Narrative'}
            {!hasRationale && (
              <span className="ml-1.5 text-muted-foreground">(none recorded)</span>
            )}
          </Button>

          {hasMismatches && !layer2Visible && (
            <span
              className="text-xs text-red-600 dark:text-red-400"
              data-testid="mismatch-collapsed-hint"
            >
              &#x26A0; Mismatch detected — review before relying on narrative
            </span>
          )}
        </div>

        {/* Layer 2 — revealed on toggle */}
        {layer2Visible && (
          <Layer2NarrativePanel rationale={data.agent_rationale} />
        )}
      </CardContent>
    </Card>
  );
}

export default NarrativeOverlay;
