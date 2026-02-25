/**
 * IntentVsPlan — View 1 of the "Why This Happened" panel (OMN-2468)
 *
 * Side-by-side diff: user's original intent (left) vs resolved plan (right).
 * Inferred values are highlighted in amber and link to their DecisionRecord.
 * Defaulted values link to default policy DecisionRecords.
 *
 * Trust invariant: Every inferred/defaulted value has a structured explanation.
 * Zero values require reading source code to understand their origin.
 *
 * Layout:
 *   ┌───────────────────────┬────────────────────────────────────┐
 *   │ Your Intent           │ Resolved Plan                      │
 *   │ ───────────────       │ ──────────────────────────────     │
 *   │ Model: (not specified)│ Model: claude-opus-4-6 [inferred]  │
 *   │ Tools: Read, Write    │ Tools: Read, Write, Bash [+Bash]   │
 *   └───────────────────────┴────────────────────────────────────┘
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Info, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IntentVsPlanData, IntentPlanField, ValueOrigin } from '@shared/decision-record-types';

// ============================================================================
// Types
// ============================================================================

export interface IntentVsPlanProps {
  data: IntentVsPlanData;
  /** Called when user clicks an inferred value to drill into its DecisionRecord */
  onDecisionClick?: (decisionId: string) => void;
  className?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function originLabel(origin: ValueOrigin): string {
  switch (origin) {
    case 'inferred':
      return 'inferred';
    case 'default':
      return 'default';
    case 'user_specified':
      return '';
  }
}

function originBadgeClass(origin: ValueOrigin): string {
  switch (origin) {
    case 'inferred':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'default':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
    case 'user_specified':
      return 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30';
  }
}

function formatIntentValue(value: string | null): string {
  return value ?? '(not specified)';
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * IntentCell — left column showing what the user specified (or didn't).
 */
function IntentCell({ field }: { field: IntentPlanField }) {
  const isUnspecified = field.intent_value === null;
  return (
    <div className="py-3 px-4 flex items-start gap-2">
      <span className="text-sm font-medium text-muted-foreground w-24 shrink-0">
        {field.field_name}:
      </span>
      <span
        className={cn(
          'text-sm',
          isUnspecified ? 'text-muted-foreground italic' : 'text-foreground'
        )}
        data-testid={`intent-value-${field.field_name.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {formatIntentValue(field.intent_value)}
      </span>
    </div>
  );
}

/**
 * ResolvedCell — right column showing the resolved value with origin tag.
 * Inferred/defaulted values are amber/blue and link to their DecisionRecord.
 */
function ResolvedCell({
  field,
  onDecisionClick,
}: {
  field: IntentPlanField;
  onDecisionClick?: (decisionId: string) => void;
}) {
  const hasLink = field.decision_id !== null && field.origin !== 'user_specified';
  const label = originLabel(field.origin);

  return (
    <div className="py-3 px-4 flex items-start gap-2">
      <span className="text-sm font-medium text-muted-foreground w-24 shrink-0">
        {field.field_name}:
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-sm text-foreground"
          data-testid={`resolved-value-${field.field_name.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {field.resolved_value}
        </span>
        {label && (
          <Tooltip>
            <TooltipTrigger asChild>
              {hasLink ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-5 px-1.5 py-0 text-xs rounded-sm border font-normal',
                    originBadgeClass(field.origin)
                  )}
                  onClick={() => field.decision_id && onDecisionClick?.(field.decision_id)}
                  data-testid={`origin-badge-${field.field_name.toLowerCase().replace(/\s+/g, '-')}`}
                  aria-label={`View DecisionRecord for ${field.field_name}`}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  {label}
                </Button>
              ) : (
                <Badge
                  variant="outline"
                  className={cn('h-5 px-1.5 text-xs', originBadgeClass(field.origin))}
                  data-testid={`origin-badge-${field.field_name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {label}
                </Badge>
              )}
            </TooltipTrigger>
            <TooltipContent>
              {field.origin === 'inferred'
                ? 'This value was inferred by the system. Click to see the DecisionRecord that produced it.'
                : field.origin === 'default'
                  ? 'This value was applied from a default policy. Click to see the policy DecisionRecord.'
                  : 'This value was specified by the user.'}
            </TooltipContent>
          </Tooltip>
        )}
        {field.origin === 'user_specified' && (
          <span className="text-xs text-green-500" aria-label="User specified">
            ✓
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * NoDecisionRecordWarning — shown when an inferred value has no linked DecisionRecord.
 * Trust invariant: this state must be visible, never hidden.
 */
function NoDecisionRecordWarning({ fieldName }: { fieldName: string }) {
  return (
    <div
      className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400 mt-0.5"
      role="alert"
      aria-label={`Missing DecisionRecord for ${fieldName}`}
      data-testid={`missing-decision-record-${fieldName.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <AlertCircle className="h-3 w-3 shrink-0" />
      <span>source unknown — no DecisionRecord found</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * IntentVsPlan renders the side-by-side comparison between user intent and
 * resolved plan for a single workflow execution.
 *
 * Read-only panel. Provenance is historical fact, not editable.
 */
export function IntentVsPlan({ data, onDecisionClick, className }: IntentVsPlanProps) {
  const inferredCount = data.fields.filter((f) => f.origin !== 'user_specified').length;
  const missingDecisionRecords = data.fields.filter(
    (f) => f.origin !== 'user_specified' && f.decision_id === null
  );

  return (
    <Card className={cn('w-full', className)} data-testid="intent-vs-plan-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Why This Happened &rsaquo; Intent vs Resolved Plan
          </CardTitle>
          <div className="flex items-center gap-2">
            {inferredCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    data-testid="inferred-count-badge"
                  >
                    <Info className="h-3 w-3 mr-1" />
                    {inferredCount} inferred
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {inferredCount} value{inferredCount !== 1 ? 's were' : ' was'} inferred or
                  defaulted by the system. Each links to its DecisionRecord.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Session: <code className="font-mono">{data.session_id}</code>
          {' · '}
          {new Date(data.executed_at).toLocaleString()}
        </p>
      </CardHeader>

      <CardContent className="p-0">
        {/* Trust invariant failure banner */}
        {missingDecisionRecords.length > 0 && (
          <div
            className="mx-4 mb-3 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2"
            role="alert"
            data-testid="trust-invariant-warning"
          >
            <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                Trust invariant: {missingDecisionRecords.length} inferred value
                {missingDecisionRecords.length !== 1 ? 's have' : ' has'} no linked DecisionRecord
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                These values show &ldquo;source unknown&rdquo;. This indicates a gap in provenance
                capture that should be fixed in the routing system.
              </p>
            </div>
          </div>
        )}

        {/* Column headers */}
        <div className="grid grid-cols-2 border-b border-border">
          <div className="px-4 py-2 bg-muted/30 border-r border-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Your Intent
            </p>
          </div>
          <div className="px-4 py-2 bg-muted/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resolved Plan
            </p>
          </div>
        </div>

        {/* Field rows */}
        <div
          className="divide-y divide-border"
          data-testid="intent-vs-plan-fields"
          role="table"
          aria-label="Intent vs Resolved Plan comparison"
        >
          {data.fields.map((field) => {
            const missingRecord =
              field.origin !== 'user_specified' && field.decision_id === null;
            return (
              <div
                key={field.field_name}
                className={cn(
                  'grid grid-cols-2',
                  field.origin === 'inferred' && 'bg-amber-500/5',
                  field.origin === 'default' && 'bg-blue-500/5'
                )}
                role="row"
                data-testid={`field-row-${field.field_name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {/* Left: user intent */}
                <div className="border-r border-border" role="cell">
                  <IntentCell field={field} />
                </div>

                {/* Right: resolved value */}
                <div role="cell">
                  <ResolvedCell field={field} onDecisionClick={onDecisionClick} />
                  {missingRecord && (
                    <div className="px-4 pb-2">
                      <NoDecisionRecordWarning fieldName={field.field_name} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3 w-3 text-amber-500" />
            <span>
              <span className="text-amber-600 dark:text-amber-400">[inferred]</span> = linked to
              DecisionRecord
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3 w-3 text-blue-500" />
            <span>
              <span className="text-blue-600 dark:text-blue-400">[default]</span> = linked to
              default policy
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-green-500">✓</span>
            <span>user specified</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default IntentVsPlan;
