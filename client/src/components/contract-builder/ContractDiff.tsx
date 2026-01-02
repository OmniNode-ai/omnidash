import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ContractStatusBadge } from './ContractStatusBadge';
import { useTheme } from '@/components/ThemeProvider';
import { diffLines, Change } from 'diff';
import type { Contract } from './models/types';

interface ContractDiffProps {
  /** The older version being compared */
  olderVersion: Contract;
  /** The newer version being compared */
  newerVersion: Contract;
  /** Called when user wants to go back */
  onBack: () => void;
  /** Called when user wants to view the older version */
  onViewOlder?: () => void;
  /** Called when user wants to view the newer version */
  onViewNewer?: () => void;
}

/**
 * Convert a contract to a displayable object for diffing
 * Excludes internal IDs and formats for readability
 */
function contractToDisplayObject(contract: Contract): Record<string, unknown> {
  return {
    name: contract.name,
    displayName: contract.displayName,
    version: contract.version,
    type: contract.type,
    status: contract.status,
    description: contract.description,
    metadata: {
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
      createdBy: contract.createdBy,
    },
  };
}

interface DiffLine {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: number | null;
}

/**
 * Compute a proper diff using the diff library (Myers algorithm)
 * Returns unified diff lines for rendering
 */
function computeDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): { lines: DiffLine[]; additions: number; deletions: number } {
  const oldJson = JSON.stringify(oldObj, null, 2);
  const newJson = JSON.stringify(newObj, null, 2);

  const changes: Change[] = diffLines(oldJson, newJson);

  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let lineNumber = 1;

  for (const change of changes) {
    const changeLines = change.value.split('\n');
    // Remove trailing empty string from split if line ends with \n
    if (changeLines[changeLines.length - 1] === '') {
      changeLines.pop();
    }

    for (const text of changeLines) {
      if (change.added) {
        lines.push({ text, type: 'added', lineNumber });
        additions++;
        lineNumber++;
      } else if (change.removed) {
        lines.push({ text, type: 'removed', lineNumber: null });
        deletions++;
      } else {
        lines.push({ text, type: 'unchanged', lineNumber });
        lineNumber++;
      }
    }
  }

  return { lines, additions, deletions };
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Contract Diff Component
 *
 * Displays a unified diff of two contract versions using Myers algorithm.
 * Highlights additions and removals with proper change detection.
 */
export function ContractDiff({
  olderVersion,
  newerVersion,
  onBack,
  onViewOlder,
  onViewNewer,
}: ContractDiffProps) {
  const { theme } = useTheme();

  // Compute the diff between the two versions
  const { lines, additions, deletions } = useMemo(() => {
    const oldObj = contractToDisplayObject(olderVersion);
    const newObj = contractToDisplayObject(newerVersion);
    return computeDiff(oldObj, newObj);
  }, [olderVersion, newerVersion]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to History
          </Button>
          <div className="h-6 w-px bg-border" />
          <span className="text-lg font-medium">Compare Versions</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <span className={theme === 'dark' ? 'text-green-400' : 'text-green-600'}>
            +{additions} additions
          </span>
          <span className={theme === 'dark' ? 'text-red-400' : 'text-red-600'}>
            −{deletions} deletions
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Version comparison banner */}
        <div className="diff-version-banner flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          {/* Version progression */}
          <div className="flex items-center gap-3">
            {/* Older version */}
            <div className="flex items-center gap-2">
              <span
                className={`font-mono font-semibold px-2 py-0.5 rounded ${theme === 'dark' ? 'bg-red-950/50 text-red-300' : 'bg-red-100 text-red-800'}`}
              >
                v{olderVersion.version}
              </span>
              <ContractStatusBadge status={olderVersion.status} />
              <span className="text-xs text-muted-foreground">
                {formatDate(olderVersion.updatedAt)}
              </span>
            </div>

            {/* Arrow */}
            <ArrowRight className="w-4 h-4 text-muted-foreground" />

            {/* Newer version */}
            <div className="flex items-center gap-2">
              <span
                className={`font-mono font-semibold px-2 py-0.5 rounded ${theme === 'dark' ? 'bg-green-950/50 text-green-300' : 'bg-green-100 text-green-800'}`}
              >
                v{newerVersion.version}
              </span>
              <ContractStatusBadge status={newerVersion.status} />
              <span className="text-xs text-muted-foreground">
                {formatDate(newerVersion.updatedAt)}
              </span>
            </div>
          </div>

          {/* View buttons */}
          <div className="flex items-center gap-2">
            {onViewOlder && (
              <Button variant="outline" size="sm" onClick={onViewOlder}>
                View v{olderVersion.version}
              </Button>
            )}
            {onViewNewer && (
              <Button variant="outline" size="sm" onClick={onViewNewer}>
                View v{newerVersion.version}
              </Button>
            )}
          </div>
        </div>

        {/* Unified diff view */}
        <Card className="flex-1 overflow-auto rounded-none border-0 bg-background">
          <div className="font-mono text-sm">
            {lines.map((line, index) => {
              let bgClass = '';
              let textClass = '';
              let indicator = ' ';

              if (line.type === 'removed') {
                bgClass = theme === 'dark' ? 'bg-red-950/50' : 'bg-red-100';
                textClass = theme === 'dark' ? 'text-red-300' : 'text-red-800';
                indicator = '−';
              } else if (line.type === 'added') {
                bgClass = theme === 'dark' ? 'bg-green-950/50' : 'bg-green-100';
                textClass = theme === 'dark' ? 'text-green-300' : 'text-green-800';
                indicator = '+';
              }

              return (
                <div key={index} className={`flex items-start ${bgClass}`}>
                  {/* Line number */}
                  <span className="w-12 shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border">
                    {line.lineNumber ?? ''}
                  </span>
                  {/* Change indicator */}
                  <span className={`w-6 shrink-0 text-center select-none font-bold ${textClass}`}>
                    {indicator}
                  </span>
                  {/* Content */}
                  <span className={`flex-1 px-2 whitespace-pre ${textClass}`}>{line.text}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
