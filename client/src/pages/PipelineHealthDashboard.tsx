/**
 * Pipeline Health Dashboard (OMN-3192)
 *
 * Displays per-ticket pipeline state so you can answer
 * "what phase is OMN-XXXX on?" and "which pipelines are stuck?"
 * without reading state.yaml files manually.
 *
 * Data source: /api/pipeline-health (file-poll from ~/.claude/pipelines/{ticket_id}/state.yaml)
 *
 * Shows table: Ticket | Repo | Phase | Status | CDQA Gates | Last Updated | Cycle Time
 * Color-coded: stuck=red, blocked=orange, done=green, running=blue
 */

import { useQuery } from '@tanstack/react-query';
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
  Clock,
  Activity,
  Loader2,
  BarChart3,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineHealthSummary } from '../../../server/projections/pipeline-health-projection';

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

function cycleTime(startedAt: string, lastUpdated: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(lastUpdated).getTime();
  if (isNaN(start) || isNaN(end)) return '—';
  const diffMs = end - start;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function StatusIcon({ pipeline }: { pipeline: PipelineHealthSummary }) {
  if (pipeline.stuck) return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (pipeline.blocked) return <XCircle className="h-4 w-4 text-orange-500" />;
  switch (pipeline.status) {
    case 'done':
    case 'merged':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  }
}

function statusBadgeClass(pipeline: PipelineHealthSummary): string {
  if (pipeline.stuck) return 'border-red-500 text-red-500';
  if (pipeline.blocked) return 'border-orange-500 text-orange-500';
  switch (pipeline.status) {
    case 'done':
    case 'merged':
      return 'border-green-500 text-green-500';
    case 'failed':
      return 'border-red-500 text-red-500';
    default:
      return 'border-blue-500 text-blue-500';
  }
}

function statusLabel(pipeline: PipelineHealthSummary): string {
  if (pipeline.stuck) return 'STUCK';
  if (pipeline.blocked) return 'BLOCKED';
  return pipeline.status.toUpperCase();
}

function rowHighlightClass(pipeline: PipelineHealthSummary): string | undefined {
  if (pipeline.stuck) return 'bg-red-50 dark:bg-red-950/20';
  if (pipeline.blocked) return 'bg-orange-50 dark:bg-orange-950/20';
  return undefined;
}

function CdqaGatePills({ gates }: { gates: PipelineHealthSummary['cdqaGates'] }) {
  if (gates.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {gates.map((g, i) => (
        <span
          key={i}
          className={cn(
            'inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded',
            g.result === 'PASS' &&
              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            g.result === 'WARN' &&
              'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
            g.result === 'BLOCK' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          )}
          title={g.gate}
        >
          {g.result}
        </span>
      ))}
    </div>
  );
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

function PipelineTable({
  pipelines,
  isLoading,
}: {
  pipelines: PipelineHealthSummary[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Active Pipelines
        </CardTitle>
        <CardDescription>
          Polled from <code className="text-xs">~/.claude/pipelines/*/state.yaml</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : pipelines.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No pipeline state files found yet.
            <br />
            Pipeline states are written to{' '}
            <code className="text-xs">~/.claude/pipelines/&#123;ticket_id&#125;/state.yaml</code> by
            the ticket-pipeline skill.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>CDQA Gates</TableHead>
                <TableHead>Cycle Time</TableHead>
                <TableHead className="text-right">Last Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pipelines.map((pipeline) => (
                <TableRow key={pipeline.ticket_id} className={rowHighlightClass(pipeline)}>
                  <TableCell className="font-mono text-xs font-medium">
                    {pipeline.ticket_id}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[160px] truncate text-muted-foreground">
                    {pipeline.repo.replace('OmniNode-ai/', '')}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{pipeline.phase}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusIcon pipeline={pipeline} />
                      <Badge
                        variant="outline"
                        className={cn('text-xs font-mono', statusBadgeClass(pipeline))}
                      >
                        {statusLabel(pipeline)}
                      </Badge>
                    </div>
                    {pipeline.blocked && pipeline.blockedReason && (
                      <p className="text-[10px] text-orange-500 mt-1 max-w-[160px] truncate">
                        {pipeline.blockedReason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <CdqaGatePills gates={pipeline.cdqaGates} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {cycleTime(pipeline.startedAt, pipeline.lastUpdated)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(pipeline.lastUpdated)}
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

async function fetchPipelines(): Promise<PipelineHealthSummary[]> {
  const res = await fetch('/api/pipeline-health');
  if (!res.ok) throw new Error('Failed to fetch pipeline health');
  return res.json() as Promise<PipelineHealthSummary[]>;
}

export default function PipelineHealthDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.pipelineHealth.summaries(),
    queryFn: fetchPipelines,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const pipelines = data ?? [];

  const total = pipelines.length;
  const stuck = pipelines.filter((p) => p.stuck).length;
  const blocked = pipelines.filter((p) => p.blocked && !p.stuck).length;
  const active = pipelines.filter((p) => p.status === 'running' && !p.stuck && !p.blocked).length;
  const done = pipelines.filter((p) => p.status === 'done' || p.status === 'merged').length;

  return (
    <div className="space-y-6" data-testid="page-pipeline-health-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pipeline Health</h1>
        <p className="text-muted-foreground">
          Per-ticket pipeline state, stuck detection, and CDQA gate results
        </p>
      </div>

      {isError && <p className="text-sm text-destructive">Failed to load pipeline health data.</p>}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Pipelines"
          value={isLoading ? '—' : String(total)}
          icon={BarChart3}
          isLoading={isLoading}
        />
        <StatCard
          title="Running"
          value={isLoading ? '—' : String(active)}
          icon={Loader2}
          valueClass={active > 0 ? 'text-blue-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="Stuck (>30 min)"
          value={isLoading ? '—' : String(stuck)}
          icon={Clock}
          valueClass={stuck > 0 ? 'text-red-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="Blocked"
          value={isLoading ? '—' : String(blocked)}
          icon={Shield}
          valueClass={blocked > 0 ? 'text-orange-500' : undefined}
          isLoading={isLoading}
        />
      </div>

      {/* Done count as a secondary stat */}
      {!isLoading && done > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="text-green-500 font-semibold">{done}</span> pipeline
          {done !== 1 ? 's' : ''} completed (done / merged)
        </p>
      )}

      {/* Pipeline Table */}
      <PipelineTable pipelines={pipelines} isLoading={isLoading} />
    </div>
  );
}
