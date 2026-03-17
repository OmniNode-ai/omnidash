/**
 * Governance Dashboard (OMN-5291)
 *
 * Displays governance check results emitted by onex-change-control CLI tools.
 *
 * Data sources (via GovernanceProjection → governance_* tables):
 *   onex.evt.onex-change-control.governance-check-completed.v1
 *   onex.evt.onex-change-control.drift-detected.v1
 *   onex.evt.onex-change-control.cosmetic-compliance-scored.v1
 *
 * Shows:
 *   - Summary stat cards (7d window)
 *   - Recent governance checks table (passed/failed per check type)
 *   - Recent drift detections table (severity, kind, ticket)
 *   - Recent cosmetic compliance scores table
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { queryKeys } from '@/lib/query-keys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  ShieldCheck,
  GitBranch,
  Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataSourceEmptyState } from '@/components/EmptyState';
import type { GovernancePayload } from '../../../shared/governance-types';

// ============================================================================
// Helpers
// ============================================================================

function relativeTime(isoTs: string): string {
  if (!isoTs) return 'never';
  const ts = new Date(isoTs).getTime();
  if (isNaN(ts)) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function severityBadge(severity: string): 'default' | 'secondary' | 'destructive' {
  if (severity === 'error') return 'destructive';
  if (severity === 'warning') return 'secondary';
  return 'default';
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  title,
  value,
  icon: Icon,
  valueClass,
  isLoading,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  valueClass?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className={cn('text-2xl font-bold tabular-nums', valueClass)}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function GovernanceChecksTable({
  rows,
  isLoading,
}: {
  rows: GovernancePayload['recent_checks'];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Recent Governance Checks
        </CardTitle>
        <CardDescription>
          Last 50 results from{' '}
          <code className="text-xs">
            onex.evt.onex-change-control.governance-check-completed.v1
          </code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No governance check events yet. Run{' '}
            <code className="text-xs">validate-yaml</code> or{' '}
            <code className="text-xs">cosmetic-lint</code> to produce events.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">Violations</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.check_type}</TableCell>
                  <TableCell
                    className="max-w-[200px] truncate font-mono text-xs"
                    title={row.target}
                  >
                    {row.target}
                  </TableCell>
                  <TableCell>
                    {row.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={row.violation_count > 0 ? 'text-red-500' : 'text-green-500'}>
                      {row.violation_count}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(row.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DriftDetectionsTable({
  rows,
  isLoading,
}: {
  rows: GovernancePayload['recent_drifts'];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Drift Detections
        </CardTitle>
        <CardDescription>
          Last 50 drift events from{' '}
          <code className="text-xs">onex.evt.onex-change-control.drift-detected.v1</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No drift events yet. Drift is emitted by governance validators on schema mismatch.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Drift Kind</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.ticket_id || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{row.drift_kind}</TableCell>
                  <TableCell>
                    <Badge variant={severityBadge(row.severity)} className="text-xs">
                      {row.severity}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="max-w-[240px] truncate text-xs text-muted-foreground"
                    title={row.description}
                  >
                    {row.description}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(row.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CosmeticScoresTable({
  rows,
  isLoading,
}: {
  rows: GovernancePayload['recent_cosmetic'];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-4 w-4" />
          Cosmetic Compliance Scores
        </CardTitle>
        <CardDescription>
          Last 50 scores from{' '}
          <code className="text-xs">
            onex.evt.onex-change-control.cosmetic-compliance-scored.v1
          </code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No cosmetic compliance events yet. Run{' '}
            <code className="text-xs">cosmetic-lint check</code> to produce events.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Passed</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell
                    className="max-w-[200px] truncate font-mono text-xs"
                    title={row.target}
                  >
                    {row.target}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className={
                        row.score >= 0.9
                          ? 'text-green-500'
                          : row.score >= 0.7
                            ? 'text-yellow-500'
                            : 'text-red-500'
                      }
                    >
                      {fmtPct(row.score)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-green-500">
                    {row.passed_checks}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={row.failed_checks > 0 ? 'text-red-500' : 'text-green-500'}>
                      {row.failed_checks}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(row.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Dashboard
// ============================================================================

async function fetchGovernanceSnapshot(): Promise<GovernancePayload> {
  const res = await fetch('/api/governance/snapshot');
  if (!res.ok) throw new Error('Failed to fetch governance snapshot');
  return res.json() as Promise<GovernancePayload>;
}

export default function GovernanceDashboard() {
  const queryClient = useQueryClient();

  useWebSocket({
    onMessage: useCallback(
      (msg: { type: string }) => {
        if (msg.type === 'GOVERNANCE_INVALIDATE') {
          queryClient.invalidateQueries({ queryKey: queryKeys.governance.all });
        }
      },
      [queryClient]
    ),
    debug: false,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.governance.snapshot(),
    queryFn: fetchGovernanceSnapshot,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const summary = data?.summary;
  const isEmpty =
    !isLoading &&
    !isError &&
    (summary?.total_checks_7d ?? 0) === 0 &&
    (summary?.drift_events_7d ?? 0) === 0 &&
    (data?.recent_checks?.length ?? 0) === 0;

  return (
    <div className="space-y-6" data-testid="page-governance-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Governance</h1>
        <p className="text-muted-foreground">
          Schema validation, drift detection, and cosmetic compliance from{' '}
          <code className="text-xs">onex-change-control</code> CLI tools
        </p>
      </div>

      {isError && (
        <p className="text-sm text-destructive">Failed to load governance data.</p>
      )}

      {isEmpty && (
        <DataSourceEmptyState
          sourceName="Governance Events"
          producerName="onex-change-control CLI tools"
          instructions="Run validate-yaml, cosmetic-lint, or check-schema-purity to produce governance events."
        />
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Checks (7d)"
          value={isLoading ? '—' : String(summary?.total_checks_7d ?? 0)}
          icon={BarChart3}
          isLoading={isLoading}
        />
        <StatCard
          title="Passed (7d)"
          value={isLoading ? '—' : String(summary?.passed_checks_7d ?? 0)}
          icon={CheckCircle2}
          valueClass="text-green-500"
          isLoading={isLoading}
        />
        <StatCard
          title="Failed (7d)"
          value={isLoading ? '—' : String(summary?.failed_checks_7d ?? 0)}
          icon={XCircle}
          valueClass={(summary?.failed_checks_7d ?? 0) > 0 ? 'text-red-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="Drift Events (7d)"
          value={isLoading ? '—' : String(summary?.drift_events_7d ?? 0)}
          icon={AlertTriangle}
          valueClass={(summary?.drift_events_7d ?? 0) > 0 ? 'text-yellow-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="Avg Cosmetic Score"
          value={isLoading ? '—' : fmtPct(summary?.avg_cosmetic_score ?? 0)}
          icon={Gauge}
          valueClass={
            (summary?.avg_cosmetic_score ?? 0) >= 0.9
              ? 'text-green-500'
              : (summary?.avg_cosmetic_score ?? 0) >= 0.7
                ? 'text-yellow-500'
                : 'text-red-500'
          }
          isLoading={isLoading}
        />
      </div>

      {/* Tables */}
      <GovernanceChecksTable rows={data?.recent_checks ?? []} isLoading={isLoading} />
      <DriftDetectionsTable rows={data?.recent_drifts ?? []} isLoading={isLoading} />
      <CosmeticScoresTable rows={data?.recent_cosmetic ?? []} isLoading={isLoading} />
    </div>
  );
}
