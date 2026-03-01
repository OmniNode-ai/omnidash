/**
 * CDQA Gate Dashboard (OMN-3190)
 *
 * Displays CDQA gate evaluation results per PR so you can answer
 * "did CDQA pass for this PR?" without reading skill result JSON files.
 *
 * Data source: /api/cdqa-gates (file-poll from ~/.claude/skill-results/*\/cdqa-gate-log.json)
 * Kafka-backed projection is a follow-up ticket.
 *
 * Shows table: PR | Repo | Gates Run | Overall Result | Last Evaluated
 * Color-coded: PASS=green, WARN=yellow, BLOCK=red
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
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PrGateSummary } from '../../../server/projections/cdqa-gate-projection';

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

type OverallResult = 'PASS' | 'WARN' | 'BLOCK';

function resultBadgeVariant(result: OverallResult): 'default' | 'secondary' | 'destructive' {
  if (result === 'PASS') return 'default';
  if (result === 'BLOCK') return 'destructive';
  return 'secondary';
}

function resultTextClass(result: OverallResult): string {
  if (result === 'PASS') return 'text-green-500';
  if (result === 'BLOCK') return 'text-red-500';
  return 'text-yellow-500';
}

function ResultIcon({ result }: { result: OverallResult }) {
  if (result === 'PASS') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (result === 'BLOCK') return <XCircle className="h-4 w-4 text-red-500" />;
  return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
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

function GateTable({ summaries, isLoading }: { summaries: PrGateSummary[]; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          CDQA Gate Results per PR
        </CardTitle>
        <CardDescription>
          Aggregated from{' '}
          <code className="text-xs">~/.claude/skill-results/*/cdqa-gate-log.json</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : summaries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No CDQA gate evaluations found yet.
            <br />
            Gate results are written to{' '}
            <code className="text-xs">~/.claude/skill-results/*/cdqa-gate-log.json</code> by the
            CDQA gate skill.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PR</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead>Gates Run</TableHead>
                <TableHead>Overall Result</TableHead>
                <TableHead className="text-right">Last Evaluated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((summary) => (
                <TableRow
                  key={`${summary.repo}::${summary.pr_number}`}
                  className={
                    summary.overallResult === 'BLOCK' ? 'bg-red-50 dark:bg-red-950/20' : undefined
                  }
                >
                  <TableCell className="font-mono text-xs">#{summary.pr_number}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[180px] truncate">
                    {summary.repo}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1">
                      <span className="font-mono">{summary.gates.length}</span>
                      <span className="text-muted-foreground">
                        ({summary.gates.map((g) => g.gate).join(', ')})
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ResultIcon result={summary.overallResult} />
                      <Badge
                        variant={resultBadgeVariant(summary.overallResult)}
                        className="text-xs font-mono"
                      >
                        <span className={resultTextClass(summary.overallResult)}>
                          {summary.overallResult}
                        </span>
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(summary.lastEvaluated)}
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

async function fetchCdqaGateSummaries(): Promise<PrGateSummary[]> {
  const res = await fetch('/api/cdqa-gates');
  if (!res.ok) throw new Error('Failed to fetch CDQA gate summaries');
  return res.json() as Promise<PrGateSummary[]>;
}

export default function CdqaGateDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.cdqaGates.summaries(),
    queryFn: fetchCdqaGateSummaries,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const summaries = data ?? [];

  const totalPrs = summaries.length;
  const blocked = summaries.filter((s) => s.overallResult === 'BLOCK').length;
  const warned = summaries.filter((s) => s.overallResult === 'WARN').length;
  const passed = summaries.filter((s) => s.overallResult === 'PASS').length;

  return (
    <div className="space-y-6" data-testid="page-cdqa-gate-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CDQA Gate Results</h1>
        <p className="text-muted-foreground">
          Contract, compliance, and quality assurance gate evaluations per PR
        </p>
      </div>

      {isError && <p className="text-sm text-destructive">Failed to load CDQA gate data.</p>}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="PRs Evaluated"
          value={isLoading ? '—' : String(totalPrs)}
          icon={BarChart3}
          isLoading={isLoading}
        />
        <StatCard
          title="PASS"
          value={isLoading ? '—' : String(passed)}
          icon={CheckCircle2}
          valueClass="text-green-500"
          isLoading={isLoading}
        />
        <StatCard
          title="WARN"
          value={isLoading ? '—' : String(warned)}
          icon={AlertTriangle}
          valueClass={warned > 0 ? 'text-yellow-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="BLOCK"
          value={isLoading ? '—' : String(blocked)}
          icon={XCircle}
          valueClass={blocked > 0 ? 'text-red-500' : undefined}
          isLoading={isLoading}
        />
      </div>

      {/* Gate Results Table */}
      <GateTable summaries={summaries} isLoading={isLoading} />
    </div>
  );
}
