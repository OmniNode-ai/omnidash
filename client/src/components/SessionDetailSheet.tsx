/**
 * SessionDetailSheet
 *
 * A right-side flyout panel that shows full session context when a
 * truncated session ID is clicked anywhere in the effectiveness dashboard.
 *
 * Shows: full session ID with copy button, agent name, detection method,
 * utilization score, latency breakdown, injection content summary, timestamp.
 *
 * @see OMN-2049 F3 - Session detail view
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DetailSheet } from '@/components/DetailSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { effectivenessSource } from '@/lib/data-sources/effectiveness-source';
import { queryKeys } from '@/lib/query-keys';
import { formatRelativeTime } from '@/lib/date-utils';
import { Copy, Check, User, Cpu, Activity, Clock, Layers, FileText } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface SessionDetailSheetProps {
  /** The session ID to show details for. Null closes the sheet. */
  sessionId: string | null;
  /** Called when the sheet is closed. */
  onClose: () => void;
}

// ============================================================================
// Sub-Components
// ============================================================================

function LatencyBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {value.toFixed(0)}ms
          <span className="text-muted-foreground ml-1">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function SessionDetailSheet({ sessionId, onClose }: SessionDetailSheetProps) {
  const [copied, setCopied] = useState(false);

  const { data: session, isLoading } = useQuery({
    queryKey: queryKeys.effectiveness.session(sessionId ?? ''),
    queryFn: () => effectivenessSource.sessionDetail(sessionId!),
    enabled: !!sessionId,
    staleTime: 60_000,
  });

  const handleCopy = useCallback(() => {
    if (!session) return;
    navigator.clipboard.writeText(session.session_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [session]);

  return (
    <DetailSheet
      open={!!sessionId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Session Details"
      subtitle={sessionId ? `Session ${sessionId.slice(0, 12)}...` : undefined}
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : session ? (
        <div className="space-y-6">
          {/* Session ID with copy */}
          <div>
            <div className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              Session ID
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted px-3 py-2 rounded break-all">
                {session.session_id}
              </code>
              <Button variant="outline" size="sm" className="shrink-0" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
          </div>

          {/* Key properties */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1">
                <User className="w-3 h-3" />
                Agent
              </div>
              <div className="text-sm font-medium">
                {session.agent_name ?? <span className="text-muted-foreground">Unknown</span>}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                Detection Method
              </div>
              {session.detection_method ? (
                <Badge variant="outline" className="text-xs">
                  {session.detection_method}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">--</span>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Utilization Score
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden max-w-[100px]">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={{ width: `${Math.round(session.utilization_score * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-sm">
                  {(session.utilization_score * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase mb-1">Cohort</div>
              <Badge
                variant="outline"
                className={
                  session.cohort === 'treatment'
                    ? 'text-blue-400 border-blue-500/30'
                    : 'text-zinc-400 border-zinc-500/30'
                }
              >
                {session.cohort.charAt(0).toUpperCase() + session.cohort.slice(1)}
              </Badge>
            </div>
          </div>

          {/* Latency breakdown */}
          <div className="border-t pt-4">
            <div className="text-xs text-muted-foreground uppercase mb-3 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Latency Breakdown
              <span className="font-mono text-foreground ml-auto">
                {session.latency_total_ms.toFixed(0)}ms total
              </span>
            </div>
            <div className="space-y-3">
              <LatencyBar
                label="Routing"
                value={session.latency_routing_ms}
                total={session.latency_total_ms}
                color="#3b82f6"
              />
              <LatencyBar
                label="Retrieval"
                value={session.latency_retrieval_ms}
                total={session.latency_total_ms}
                color="#8b5cf6"
              />
              <LatencyBar
                label="Injection"
                value={session.latency_injection_ms}
                total={session.latency_total_ms}
                color="#f59e0b"
              />
            </div>
          </div>

          {/* Patterns */}
          <div className="border-t pt-4">
            <div className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              Patterns Injected
            </div>
            <div className="text-lg font-mono font-bold">{session.pattern_count}</div>
          </div>

          {/* Injection Content Summary */}
          {session.injection_content_summary && (
            <div className="border-t pt-4">
              <div className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Injection Summary
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {session.injection_content_summary}
              </p>
            </div>
          )}

          {/* Timestamp */}
          <div className="border-t pt-4">
            <div className="text-xs text-muted-foreground uppercase mb-1">Timestamp</div>
            <div className="text-sm">
              {new Date(session.created_at).toLocaleString()}
              <span className="text-muted-foreground ml-2">
                ({formatRelativeTime(session.created_at)})
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No session data found.</div>
      )}
    </DetailSheet>
  );
}

// ============================================================================
// Clickable Session ID
// ============================================================================

interface ClickableSessionIdProps {
  sessionId: string;
  onClick: (id: string) => void;
  truncate?: number;
}

/**
 * Renders a truncated session ID that is clickable to open the session
 * detail sheet. Used across all effectiveness dashboard pages.
 */
export function ClickableSessionId({ sessionId, onClick, truncate = 8 }: ClickableSessionIdProps) {
  return (
    <span
      className="font-mono text-xs cursor-pointer text-primary/80 hover:text-primary hover:underline transition-colors"
      onClick={() => onClick(sessionId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick(sessionId);
      }}
      title={`View session ${sessionId}`}
    >
      {sessionId.slice(0, truncate)}...
    </span>
  );
}
