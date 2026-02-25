import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, GitCompare, FilePlus, MoreHorizontal, Eye } from 'lucide-react';
import { ContractStatusBadge } from './ContractStatusBadge';
import { BreakingChangeBadge } from './BreakingChangeBadge';
import type { Contract } from './models/types';
import type { BreakingChangeAnalysis } from '@/hooks/useContractRegistry';

interface ContractHistoryProps {
  /** The current contract being viewed */
  contract: Contract;
  /** All versions of this contract */
  allVersions: Contract[];
  onBack: () => void;
  /** Called when user wants to view a specific version */
  onViewVersion?: (contract: Contract) => void;
  /** Called when user wants to compare two versions */
  onCompareVersions?: (older: Contract, newer: Contract) => void;
  /** Called when user wants to create a new draft based on a version */
  onCreateDraftFromVersion?: (contract: Contract) => void;
  /**
   * Optional breaking-change analysis keyed by the version's contract ID (UUID).
   * When provided, versions with breaking changes display a warning badge.
   * Map key is the contract's `id` (version-specific UUID).
   */
  breakingChangesByVersionId?: Map<string, BreakingChangeAnalysis>;
}

// Format date for display
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Contract History Component
 *
 * Displays a timeline of all versions of a contract.
 * Allows users to:
 * - View the history of changes
 * - Select two versions to compare
 * - Navigate to view a specific version
 */
export function ContractHistory({
  contract,
  allVersions,
  onBack,
  onViewVersion,
  onCompareVersions,
  onCreateDraftFromVersion,
  breakingChangesByVersionId,
}: ContractHistoryProps) {
  // Track selected versions for comparison (max 2)
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());

  // Sort versions by version number (newest first) - they should already be sorted
  const sortedVersions = [...allVersions].sort((a, b) => {
    // Compare semantic versions
    const partsA = a.version.split('.').map(Number);
    const partsB = b.version.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA !== numB) return numB - numA; // Descending
    }
    return 0;
  });

  // Handle checkbox toggle for version selection
  const handleVersionToggle = (versionId: string) => {
    setSelectedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        // Only allow 2 selections max
        if (next.size >= 2) {
          // Remove the oldest selection (first in set)
          const firstKey = next.values().next().value;
          if (firstKey) {
            next.delete(firstKey);
          }
        }
        next.add(versionId);
      }
      return next;
    });
  };

  // Handle compare button click
  const handleCompare = () => {
    if (selectedVersions.size !== 2 || !onCompareVersions) return;

    const selectedArray = Array.from(selectedVersions);
    const version1 = sortedVersions.find((v) => v.id === selectedArray[0]);
    const version2 = sortedVersions.find((v) => v.id === selectedArray[1]);

    if (version1 && version2) {
      // Determine which is older/newer by version number
      const v1Parts = version1.version.split('.').map(Number);
      const v2Parts = version2.version.split('.').map(Number);
      let v1IsOlder = false;
      for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const n1 = v1Parts[i] || 0;
        const n2 = v2Parts[i] || 0;
        if (n1 < n2) {
          v1IsOlder = true;
          break;
        } else if (n1 > n2) {
          break;
        }
      }
      if (v1IsOlder) {
        onCompareVersions(version1, version2);
      } else {
        onCompareVersions(version2, version1);
      }
    }
  };

  // Quick compare with previous version
  const handleCompareWithPrevious = (currentIndex: number) => {
    if (currentIndex >= sortedVersions.length - 1 || !onCompareVersions) return;
    const current = sortedVersions[currentIndex];
    const previous = sortedVersions[currentIndex + 1];
    onCompareVersions(previous, current);
  };

  const canCompare = selectedVersions.size === 2 && onCompareVersions;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <span className="text-lg font-medium">
            Version History: {contract.displayName || contract.name}
          </span>
        </div>

        {onCompareVersions && (
          <Button size="sm" disabled={!canCompare} onClick={handleCompare}>
            <GitCompare className="w-4 h-4 mr-2" />
            Compare Selected ({selectedVersions.size}/2)
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Instructions */}
          {onCompareVersions && (
            <p className="text-sm text-muted-foreground mb-6">
              Select two versions to compare, or use the quick compare links.
            </p>
          )}

          {/* Version Timeline */}
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

            {/* Version entries */}
            <div className="space-y-4">
              {sortedVersions.map((version, index) => {
                const isSelected = selectedVersions.has(version.id);
                const isCurrent = version.id === contract.id;
                const hasPrevious = index < sortedVersions.length - 1;
                const breakingAnalysis = breakingChangesByVersionId?.get(version.id);

                return (
                  <div key={version.id} className="relative flex items-start gap-4">
                    {/* Timeline dot */}
                    <div
                      className={`relative z-10 w-3 h-3 rounded-full mt-2 ml-[18px] ${isCurrent ? 'bg-primary ring-4 ring-primary/20' : 'bg-muted-foreground/50'}`}
                    />

                    {/* Version card */}
                    <Card
                      className={`flex-1 p-4 bg-background ${isSelected ? 'ring-2 ring-primary' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {/* Checkbox for comparison */}
                          {onCompareVersions && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleVersionToggle(version.id)}
                              className="mt-1"
                            />
                          )}

                          <div className="space-y-1">
                            {/* Version number, status, and breaking change badge */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold">v{version.version}</span>
                              <ContractStatusBadge status={version.status} />
                              {isCurrent && (
                                <span className="text-xs text-muted-foreground">(viewing)</span>
                              )}
                              {breakingAnalysis && breakingAnalysis.hasBreakingChanges && (
                                <BreakingChangeBadge analysis={breakingAnalysis} />
                              )}
                            </div>

                            {/* Description placeholder - would come from commit message/changelog */}
                            <p className="text-sm text-muted-foreground">
                              {version.description || 'No description available'}
                            </p>

                            {/* Metadata */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{formatDate(version.updatedAt)}</span>
                              <span>({formatRelativeTime(version.updatedAt)})</span>
                              {version.createdBy && (
                                <span className="font-mono">{version.createdBy}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onViewVersion && !isCurrent && (
                              <DropdownMenuItem onClick={() => onViewVersion(version)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View this version
                              </DropdownMenuItem>
                            )}
                            {hasPrevious && onCompareVersions && (
                              <DropdownMenuItem onClick={() => handleCompareWithPrevious(index)}>
                                <GitCompare className="mr-2 h-4 w-4" />
                                Compare with previous
                              </DropdownMenuItem>
                            )}
                            {(onViewVersion || (hasPrevious && onCompareVersions)) &&
                              onCreateDraftFromVersion &&
                              version.status !== 'draft' && <DropdownMenuSeparator />}
                            {onCreateDraftFromVersion && version.status !== 'draft' && (
                              <DropdownMenuItem onClick={() => onCreateDraftFromVersion(version)}>
                                <FilePlus className="mr-2 h-4 w-4" />
                                Create new draft from this version
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Empty state */}
          {sortedVersions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No version history available.
            </div>
          )}

          {/* Single version message */}
          {sortedVersions.length === 1 && (
            <p className="text-sm text-muted-foreground text-center mt-6">
              This is the only version of this contract.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
