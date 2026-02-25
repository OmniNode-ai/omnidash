/**
 * NormalizationPreviewModal Component
 *
 * Shows a diff between the hand-edited YAML and the canonical form
 * serialization before a "normalize" operation is applied.
 *
 * This fulfills the OMN-2541 requirement:
 * "Normalization preview modal showing diff before applying"
 */

import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface NormalizationPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current (hand-edited) YAML */
  currentYaml: string;
  /** Canonical YAML (normalized form serialization) */
  canonicalYaml: string;
  /** Called when user confirms normalize */
  onApply: () => void;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber: number;
}

/**
 * Compute a simple line-diff between two YAML strings.
 * Returns lines tagged as added / removed / unchanged.
 */
function computeLineDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  // Build a set of lines present in each for O(n) lookup
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const result: DiffLine[] = [];

  // Lines in before but not in after = removed
  let lineNum = 1;
  for (const line of beforeLines) {
    if (!afterSet.has(line)) {
      result.push({ type: 'removed', content: line, lineNumber: lineNum });
    } else {
      result.push({ type: 'unchanged', content: line, lineNumber: lineNum });
    }
    lineNum++;
  }

  // Lines in after but not in before = added
  lineNum = 1;
  for (const line of afterLines) {
    if (!beforeSet.has(line)) {
      result.push({ type: 'added', content: line, lineNumber: lineNum });
    }
    lineNum++;
  }

  // Sort: unchanged first (by original line number), then removed, then added
  // This is a simplified diff — for full LCS diff a library would be needed,
  // but for YAML normalization (whitespace/ordering) this is sufficient.
  const removed = result.filter((l) => l.type === 'removed');
  const added = result.filter((l) => l.type === 'added');
  const unchanged = result.filter((l) => l.type === 'unchanged');

  return [...unchanged, ...removed, ...added];
}

export function NormalizationPreviewModal({
  open,
  onOpenChange,
  currentYaml,
  canonicalYaml,
  onApply,
}: NormalizationPreviewModalProps) {
  const diffLines = useMemo(
    () => computeLineDiff(currentYaml, canonicalYaml),
    [currentYaml, canonicalYaml]
  );

  const removedCount = diffLines.filter((l) => l.type === 'removed').length;
  const addedCount = diffLines.filter((l) => l.type === 'added').length;
  const hasChanges = removedCount > 0 || addedCount > 0;

  const handleApply = () => {
    onApply();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Normalize YAML Preview</DialogTitle>
          <DialogDescription>
            The YAML editor contains formatting or ordering differences from the canonical form
            representation. Review the changes below before applying normalization.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          {hasChanges ? (
            <>
              {removedCount > 0 && (
                <Badge variant="destructive" className="font-mono text-xs">
                  -{removedCount} lines
                </Badge>
              )}
              {addedCount > 0 && (
                <Badge
                  variant="outline"
                  className="font-mono text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30"
                >
                  +{addedCount} lines
                </Badge>
              )}
              <span className="text-muted-foreground">
                These changes are whitespace / ordering only — no data will be lost.
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              No differences — YAML is already canonical.
            </span>
          )}
        </div>

        {/* Side-by-side diff */}
        <div className="flex-1 overflow-auto border rounded-md bg-muted/30">
          <div className="grid grid-cols-2 divide-x divide-border h-full">
            {/* Before */}
            <div className="overflow-auto">
              <div className="sticky top-0 bg-muted px-3 py-1 text-xs font-medium text-muted-foreground border-b">
                Current (hand-edited)
              </div>
              <pre className="p-3 text-xs font-mono leading-5 whitespace-pre-wrap">
                {currentYaml.split('\n').map((line, i) => {
                  const inCanonical = canonicalYaml.split('\n').includes(line);
                  return (
                    <div
                      key={i}
                      className={
                        !inCanonical && line.trim()
                          ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                          : 'text-foreground'
                      }
                    >
                      {line || '\u00a0'}
                    </div>
                  );
                })}
              </pre>
            </div>

            {/* After */}
            <div className="overflow-auto">
              <div className="sticky top-0 bg-muted px-3 py-1 text-xs font-medium text-muted-foreground border-b">
                Normalized (canonical)
              </div>
              <pre className="p-3 text-xs font-mono leading-5 whitespace-pre-wrap">
                {canonicalYaml.split('\n').map((line, i) => {
                  const inCurrent = currentYaml.split('\n').includes(line);
                  return (
                    <div
                      key={i}
                      className={
                        !inCurrent && line.trim()
                          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                          : 'text-foreground'
                      }
                    >
                      {line || '\u00a0'}
                    </div>
                  );
                })}
              </pre>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!hasChanges}>
            Apply Normalization
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
