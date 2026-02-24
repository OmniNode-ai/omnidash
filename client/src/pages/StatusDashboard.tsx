/**
 * Status Dashboard (OMN-2658)
 *
 * Three-column layout:
 *   Left   — Linear Workstreams (epic progress bars)
 *   Center — PR Triage (cards grouped by triage_state)
 *   Right  — Live Activity (git hook feed)
 *
 * Data flows:
 *   - 60s polling via useQuery + live WebSocket STATUS_INVALIDATE invalidation
 *   - In-memory projection on the server (no DB tables for MVP)
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { statusSource } from '@/lib/data-sources/status-source';
import { queryKeys } from '@/lib/query-keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  GitMerge,
  XOctagon,
  Activity,
  Layers,
} from 'lucide-react';
import type { TriageState, GitHookEvent, WorkstreamStatus } from '@shared/status-types';
import type { GitHubPRStatusEvent } from '@shared/status-types';
import { formatDistanceToNow } from 'date-fns';

// ============================================================================
// Constants
// ============================================================================

const REFETCH_INTERVAL_MS = 60_000; // 60 seconds

// ============================================================================
// Triage helpers
// ============================================================================

const TRIAGE_LABELS: Record<TriageState, string> = {
  open: 'Open',
  ci_running: 'CI Running',
  ci_failed: 'CI Failed',
  approved_pending_ci: 'Approved / CI Pending',
  approved: 'Approved',
  changes_requested: 'Changes Requested',
  merged: 'Merged',
  closed: 'Closed',
};

const TRIAGE_ORDER: TriageState[] = [
  'ci_failed',
  'changes_requested',
  'ci_running',
  'approved_pending_ci',
  'open',
  'approved',
  'merged',
  'closed',
];

function triageBadge(state: TriageState): React.ReactElement {
  const variants: Record<TriageState, string> = {
    open: 'bg-slate-500/20 text-slate-300',
    ci_running: 'bg-yellow-500/20 text-yellow-300',
    ci_failed: 'bg-red-500/20 text-red-300',
    approved_pending_ci: 'bg-blue-500/20 text-blue-300',
    approved: 'bg-green-500/20 text-green-300',
    changes_requested: 'bg-orange-500/20 text-orange-300',
    merged: 'bg-purple-500/20 text-purple-300',
    closed: 'bg-gray-500/20 text-gray-400',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variants[state]}`}
    >
      {TRIAGE_LABELS[state]}
    </span>
  );
}

function triageIcon(state: TriageState): React.ReactElement {
  const cls = 'h-4 w-4 shrink-0';
  switch (state) {
    case 'ci_failed':
      return <XCircle className={`${cls} text-red-400`} />;
    case 'changes_requested':
      return <AlertTriangle className={`${cls} text-orange-400`} />;
    case 'ci_running':
      return <Loader2 className={`${cls} text-yellow-400 animate-spin`} />;
    case 'approved_pending_ci':
      return <Clock className={`${cls} text-blue-400`} />;
    case 'approved':
      return <CheckCircle2 className={`${cls} text-green-400`} />;
    case 'merged':
      return <GitMerge className={`${cls} text-purple-400`} />;
    case 'closed':
      return <XOctagon className={`${cls} text-gray-400`} />;
    default:
      return <GitBranch className={`${cls} text-slate-400`} />;
  }
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

// ============================================================================
// Sub-components
// ============================================================================

function WorkstreamCard({ ws }: { ws: WorkstreamStatus }) {
  const pct = Math.round(ws.progress * 100);
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight line-clamp-2">{ws.title}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {ws.completed}/{ws.total}
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {ws.tickets.slice(0, 5).map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground"
            title={t.title}
          >
            {t.id}
          </span>
        ))}
        {ws.tickets.length > 5 && (
          <span className="text-xs text-muted-foreground">+{ws.tickets.length - 5} more</span>
        )}
      </div>
    </div>
  );
}

function PRRow({ pr }: { pr: GitHubPRStatusEvent & { triage_state: TriageState } }) {
  const age = relativeTime(pr.timestamp);
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-b-0">
      <div className="mt-0.5">{triageIcon(pr.triage_state)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {triageBadge(pr.triage_state)}
          <span className="text-xs text-muted-foreground">{pr.repo}</span>
          <span className="text-xs text-muted-foreground">#{pr.pr_number}</span>
        </div>
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium hover:text-primary transition-colors line-clamp-1"
          title={pr.title}
        >
          {pr.title}
        </a>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span>{pr.author}</span>
          <span>{age}</span>
          {pr.linked_ticket && (
            <span className="rounded bg-muted px-1.5 py-0.5">{pr.linked_ticket}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function HookRow({ event }: { event: GitHookEvent }) {
  const age = relativeTime(event.timestamp);
  const failedGates = event.gates.filter((g) => !g.passed);
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-b-0">
      {event.success ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-400" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground">{event.hook}</span>
          <span className="text-xs text-muted-foreground">{event.repo}</span>
        </div>
        <span className="text-xs text-muted-foreground font-mono truncate block">
          {event.branch}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{age}</span>
          {failedGates.length > 0 && (
            <span className="text-xs text-red-400">
              Failed: {failedGates.map((g) => g.name).join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function StatusDashboard() {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.status.all }).catch(() => {});
  }, [queryClient]);

  // WebSocket for live invalidation on STATUS_INVALIDATE
  useWebSocket({
    debug: false,
    onMessage: useCallback(
      (msg: { type: string; data?: unknown }) => {
        if (msg.type === 'STATUS_INVALIDATE') {
          invalidateAll();
        }
      },
      [invalidateAll]
    ),
  });

  // Queries
  const { data: prsData, isLoading: prsLoading } = useQuery({
    queryKey: queryKeys.status.prs(),
    queryFn: () => statusSource.prs(),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 30_000,
  });

  const { data: hooksData, isLoading: hooksLoading } = useQuery({
    queryKey: queryKeys.status.hooks(50),
    queryFn: () => statusSource.hooks(50),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 30_000,
  });

  const { data: workstreamsData, isLoading: wsLoading } = useQuery({
    queryKey: queryKeys.status.workstreams(),
    queryFn: () => statusSource.workstreams(),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 30_000,
  });

  const { data: summaryData } = useQuery({
    queryKey: queryKeys.status.summary(),
    queryFn: () => statusSource.summary(),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 30_000,
  });

  // Flatten all PRs in triage order (excluding closed/merged by default)
  const allPRs: Array<GitHubPRStatusEvent & { triage_state: TriageState }> = [];
  if (prsData) {
    for (const state of TRIAGE_ORDER) {
      const bucket = prsData[state];
      if (bucket) allPRs.push(...bucket);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Status</h2>
          <p className="text-muted-foreground text-sm">
            Live PR triage, workstream progress, and git hook activity
          </p>
        </div>
        {summaryData && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <GitBranch className="h-4 w-4" />
              {summaryData.total_prs} PRs tracked
            </span>
            {summaryData.ci_failure_repos.length > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <XCircle className="h-4 w-4" />
                CI failures in: {summaryData.ci_failure_repos.join(', ')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Workstreams */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-primary" />
              Workstreams
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 overflow-y-auto max-h-[600px]">
            {wsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))
            ) : workstreamsData?.workstreams && workstreamsData.workstreams.length > 0 ? (
              workstreamsData.workstreams.map((ws) => <WorkstreamCard key={ws.id} ws={ws} />)
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Layers className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">No workstream data yet</p>
                <p className="text-xs mt-1">Waiting for onex.evt.linear.snapshot.v1 events</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CENTER: PR Triage */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4 text-primary" />
              PR Triage
              {summaryData && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {summaryData.triage_counts.ci_failed ?? 0} failed
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-y-auto max-h-[600px]">
            {prsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded mb-2" />
              ))
            ) : allPRs.length > 0 ? (
              <div>
                {allPRs.map((pr) => (
                  <PRRow key={`${pr.repo}:${pr.pr_number}`} pr={pr} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <GitBranch className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">No PR data yet</p>
                <p className="text-xs mt-1">Waiting for onex.evt.github.pr-status.v1 events</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Live Activity (hook feed) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Live Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-y-auto max-h-[600px]">
            {hooksLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded mb-2" />
              ))
            ) : hooksData && hooksData.length > 0 ? (
              <div>
                {hooksData.map((event, idx) => (
                  <HookRow
                    key={`${event.repo}:${event.branch}:${event.timestamp}:${idx}`}
                    event={event}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Activity className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">No hook activity yet</p>
                <p className="text-xs mt-1">Waiting for onex.evt.git.hook.v1 events</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
