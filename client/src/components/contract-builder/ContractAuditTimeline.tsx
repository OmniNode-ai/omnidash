/**
 * ContractAuditTimeline
 *
 * Scrollable audit timeline for a contract version.
 * Renders each audit entry as a chronological event with actor, action, timestamp,
 * status transitions, and version changes.
 */

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GitCommit,
  CheckCircle,
  Upload,
  Archive,
  Pencil,
  AlertCircle,
  ShieldOff,
} from 'lucide-react';
import { useContractAudit } from '@/hooks/useContractAudit';
import type { AuditEntry } from '@/hooks/useContractAudit';

// ============================================================================
// Helpers
// ============================================================================

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ActionMeta = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
};

const ACTION_META: Record<string, ActionMeta> = {
  created: { icon: GitCommit, label: 'Created', color: 'text-blue-500' },
  updated: { icon: Pencil, label: 'Updated', color: 'text-yellow-500' },
  validated: { icon: CheckCircle, label: 'Validated', color: 'text-green-500' },
  published: { icon: Upload, label: 'Published', color: 'text-purple-500' },
  deprecated: { icon: ShieldOff, label: 'Deprecated', color: 'text-orange-500' },
  archived: { icon: Archive, label: 'Archived', color: 'text-muted-foreground' },
};

function getActionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? { icon: AlertCircle, label: action, color: 'text-foreground' };
}

// ============================================================================
// Sub-components
// ============================================================================

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const meta = getActionMeta(entry.action);
  const Icon = meta.icon;

  return (
    <div className="flex gap-3 py-3">
      {/* Timeline track */}
      <div className="flex flex-col items-center">
        <div className={`mt-0.5 ${meta.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 w-px bg-border mt-2" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{meta.label}</span>
            {entry.toVersion && (
              <Badge variant="outline" className="text-xs font-mono">
                v{entry.toVersion}
              </Badge>
            )}
            {entry.fromStatus && entry.toStatus && entry.fromStatus !== entry.toStatus && (
              <span className="text-xs text-muted-foreground">
                {entry.fromStatus} → {entry.toStatus}
              </span>
            )}
          </div>
          <time className="text-xs text-muted-foreground shrink-0">
            {formatDateTime(entry.createdAt)}
          </time>
        </div>

        {entry.actor && (
          <p className="text-xs text-muted-foreground mt-0.5">
            by <span className="font-mono">{entry.actor}</span>
          </p>
        )}

        {entry.reason && (
          <p className="text-xs text-muted-foreground mt-1 italic">{entry.reason}</p>
        )}

        {Array.isArray(entry.evidence) && entry.evidence.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {(entry.evidence as string[]).map((ev, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {ev}
              </Badge>
            ))}
          </div>
        )}

        {entry.contentHash && (
          <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
            hash: {entry.contentHash.slice(0, 16)}…
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface ContractAuditTimelineProps {
  /** UUID primary key of the contract version (contracts.id) */
  contractId: string;
}

export function ContractAuditTimeline({ contractId }: ContractAuditTimelineProps) {
  const { data: entries, isLoading, error } = useContractAudit(contractId);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-4 h-4 rounded-full mt-0.5" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-destructive" />
        Failed to load audit log.
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground italic">
        No audit events recorded for this contract version.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-2">
        {entries.map((entry, idx) => (
          <div
            key={entry.id}
            className={
              idx === entries.length - 1 ? '[&>div>div:nth-child(1)>div:nth-child(2)]:hidden' : ''
            }
          >
            <AuditEntryRow entry={entry} />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
