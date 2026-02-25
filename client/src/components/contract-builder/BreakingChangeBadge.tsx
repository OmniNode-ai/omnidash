/**
 * BreakingChangeBadge
 *
 * Displays a warning badge when a contract version contains breaking changes
 * relative to the previous published version.
 *
 * Rules (from OMN-2559):
 * - Show warning badge on MAJOR version bump when breaking changes are detected
 * - Block MINOR/PATCH bump when breaking changes are present
 *
 * Usage:
 *   <BreakingChangeBadge analysis={breakingChangeAnalysis} />
 */

import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { BreakingChangeAnalysis } from '@/hooks/useContractRegistry';

interface BreakingChangeBadgeProps {
  analysis: BreakingChangeAnalysis;
  /** If true, show full details inline instead of only in tooltip */
  showDetails?: boolean;
}

/**
 * Badge shown on a MAJOR version bump when breaking changes are detected.
 * Also shown as a blocking error indicator when user tries MINOR/PATCH
 * bump while breaking changes exist.
 */
export function BreakingChangeBadge({ analysis, showDetails = false }: BreakingChangeBadgeProps) {
  if (!analysis.hasBreakingChanges) {
    return null;
  }

  const count = analysis.breakingChanges.length;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-700 cursor-help">
            <AlertTriangle className="w-3 h-3" />
            {count} breaking change{count !== 1 ? 's' : ''}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold text-sm">Breaking Changes Detected</p>
            <p className="text-xs text-muted-foreground">
              A MAJOR version bump is required. MINOR/PATCH bumps are blocked.
            </p>
            {analysis.breakingChanges.slice(0, 5).map((change, i) => (
              <div key={i} className="text-xs flex items-start gap-1">
                <ShieldAlert className="w-3 h-3 text-orange-500 mt-0.5 shrink-0" />
                <span>{change.message}</span>
              </div>
            ))}
            {analysis.breakingChanges.length > 5 && (
              <p className="text-xs text-muted-foreground">
                +{analysis.breakingChanges.length - 5} more
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Inline breaking change panel — shown in the publish / version bump workflow.
 * Lists all detected breaking changes with category and path.
 */
export function BreakingChangePanel({ analysis }: { analysis: BreakingChangeAnalysis }) {
  if (!analysis.hasBreakingChanges) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
        <Info className="w-4 h-4 text-green-500" />
        No breaking changes detected — {analysis.recommendedBump} bump recommended.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        <span className="text-sm font-semibold text-orange-800 dark:text-orange-300">
          Breaking Changes Detected — MAJOR bump required
        </span>
      </div>
      <p className="text-xs text-orange-700 dark:text-orange-400">
        The following changes are incompatible with existing consumers. A MINOR or PATCH version
        bump is blocked until breaking changes are resolved or a MAJOR bump is accepted.
      </p>
      <ul className="space-y-2">
        {analysis.breakingChanges.map((change, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <ShieldAlert className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-mono bg-orange-100 dark:bg-orange-900/40 px-1 rounded text-orange-700 dark:text-orange-300">
                {change.category}
              </span>
              {change.path && <span className="ml-1 text-muted-foreground">[{change.path}]</span>}
              <span className="ml-1">{change.message}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="text-xs text-orange-700 dark:text-orange-400">
        Suggested version:{' '}
        <span className="font-mono font-semibold">{analysis.toVersionSuggested}</span> (MAJOR bump
        from {analysis.fromVersion})
      </div>
    </div>
  );
}
