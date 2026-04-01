// SPDX-License-Identifier: MIT
/**
 * Eval Results Dashboard (OMN-6780)
 *
 * Displays A/B evaluation results comparing ONEX ON vs OFF modes.
 * Shows summary metrics, per-task comparison table, and trend chart.
 *
 * Data: PostgreSQL via /api/eval-results endpoints.
 * Falls back to mock data when backend is unavailable.
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface EvalSummary {
  total_tasks: number;
  onex_better_count: number;
  onex_worse_count: number;
  neutral_count: number;
  avg_latency_delta_ms: number;
  avg_token_delta: number;
  avg_success_rate_on: number;
  avg_success_rate_off: number;
  pattern_hit_rate_on: number;
}

interface EvalPair {
  task_id: string;
  verdict: 'onex_better' | 'onex_worse' | 'neutral' | 'incomplete';
  delta_metrics: Record<string, number>;
  onex_on_success: boolean;
  onex_off_success: boolean;
  onex_on_latency_ms: number;
  onex_off_latency_ms: number;
}

interface EvalReport {
  report_id: string;
  suite_id: string;
  suite_version: string;
  generated_at: string;
  pairs: EvalPair[];
  summary: EvalSummary;
}

// ============================================================================
// Mock data
// ============================================================================

const MOCK_REPORT: EvalReport = {
  report_id: 'eval-report-mock-001',
  suite_id: 'standard-eval-suite-v1',
  suite_version: '1.0.0',
  generated_at: new Date().toISOString(),
  pairs: [
    {
      task_id: 'eval-001-fix-import-error',
      verdict: 'onex_better',
      delta_metrics: { latency_ms: -120, token_count: -50 },
      onex_on_success: true,
      onex_off_success: true,
      onex_on_latency_ms: 180,
      onex_off_latency_ms: 300,
    },
    {
      task_id: 'eval-002-fix-pydantic-validation',
      verdict: 'onex_better',
      delta_metrics: { latency_ms: -80, token_count: -30 },
      onex_on_success: true,
      onex_off_success: false,
      onex_on_latency_ms: 220,
      onex_off_latency_ms: 300,
    },
    {
      task_id: 'eval-003-fix-kafka-topic-typo',
      verdict: 'neutral',
      delta_metrics: { latency_ms: 5, token_count: 2 },
      onex_on_success: true,
      onex_off_success: true,
      onex_on_latency_ms: 150,
      onex_off_latency_ms: 145,
    },
    {
      task_id: 'eval-004-extract-shared-validation',
      verdict: 'onex_better',
      delta_metrics: { latency_ms: -200, token_count: -100 },
      onex_on_success: true,
      onex_off_success: false,
      onex_on_latency_ms: 400,
      onex_off_latency_ms: 600,
    },
    {
      task_id: 'eval-005-rename-enum-values',
      verdict: 'onex_worse',
      delta_metrics: { latency_ms: 50, token_count: 20 },
      onex_on_success: true,
      onex_off_success: true,
      onex_on_latency_ms: 350,
      onex_off_latency_ms: 300,
    },
    {
      task_id: 'eval-006-add-eval-suite-loader',
      verdict: 'onex_better',
      delta_metrics: { latency_ms: -150, token_count: -80 },
      onex_on_success: true,
      onex_off_success: true,
      onex_on_latency_ms: 450,
      onex_off_latency_ms: 600,
    },
    {
      task_id: 'eval-007-add-eval-report-export',
      verdict: 'onex_better',
      delta_metrics: { latency_ms: -100, token_count: -60 },
      onex_on_success: true,
      onex_off_success: false,
      onex_on_latency_ms: 500,
      onex_off_latency_ms: 600,
    },
    {
      task_id: 'eval-008-review-handler-compliance',
      verdict: 'neutral',
      delta_metrics: { latency_ms: -10, token_count: 5 },
      onex_on_success: true,
      onex_off_success: true,
      onex_on_latency_ms: 290,
      onex_off_latency_ms: 300,
    },
    {
      task_id: 'eval-009-review-error-handling',
      verdict: 'onex_better',
      delta_metrics: { latency_ms: -90, token_count: -40 },
      onex_on_success: true,
      onex_off_success: true,
      onex_on_latency_ms: 210,
      onex_off_latency_ms: 300,
    },
    {
      task_id: 'eval-010-document-eval-models',
      verdict: 'neutral',
      delta_metrics: { latency_ms: -5, token_count: 10 },
      onex_on_success: true,
      onex_off_success: true,
      onex_on_latency_ms: 195,
      onex_off_latency_ms: 200,
    },
  ],
  summary: {
    total_tasks: 10,
    onex_better_count: 6,
    onex_worse_count: 1,
    neutral_count: 3,
    avg_latency_delta_ms: -70.0,
    avg_token_delta: -32.3,
    avg_success_rate_on: 1.0,
    avg_success_rate_off: 0.7,
    pattern_hit_rate_on: 0.8,
  },
};

// ============================================================================
// Verdict helpers
// ============================================================================

function verdictBadge(verdict: string) {
  switch (verdict) {
    case 'onex_better':
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">ONEX Better</Badge>
      );
    case 'onex_worse':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">ONEX Worse</Badge>;
    case 'neutral':
      return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Neutral</Badge>;
    default:
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Incomplete</Badge>
      );
  }
}

function deltaIcon(value: number) {
  if (value < -10) return <TrendingDown className="w-4 h-4 text-green-400 inline" />;
  if (value > 10) return <TrendingUp className="w-4 h-4 text-red-400 inline" />;
  return <Minus className="w-4 h-4 text-gray-400 inline" />;
}

// ============================================================================
// Component
// ============================================================================

export default function EvalResults() {
  const {
    data: report,
    isLoading,
    error,
  } = useQuery<EvalReport>({
    queryKey: ['eval-results', 'latest'],
    queryFn: async () => {
      const res = await fetch('/api/eval-results/latest');
      if (res.status === 404) {
        // No reports yet — return mock data for demo
        return MOCK_REPORT;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Eval Results</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!report) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Data</AlertTitle>
        <AlertDescription>No eval reports available. Run an eval suite first.</AlertDescription>
      </Alert>
    );
  }

  const { summary, pairs } = report;

  // Chart data: per-task latency comparison
  const chartData = pairs.map((p) => ({
    name: p.task_id.replace('eval-', '').replace(/-/g, ' ').substring(0, 20),
    'ONEX ON': p.onex_on_latency_ms,
    'ONEX OFF': p.onex_off_latency_ms,
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">A/B Eval Results</h1>
        <p className="text-muted-foreground">
          Suite: {report.suite_id} v{report.suite_version} | Report: {report.report_id}
        </p>
        <p className="text-xs text-muted-foreground">
          Generated: {new Date(report.generated_at).toLocaleString()}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">ONEX Better</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              <span className="text-2xl font-bold text-green-400">{summary.onex_better_count}</span>
              <span className="text-muted-foreground">/ {summary.total_tasks}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">ONEX Worse</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              <span className="text-2xl font-bold text-red-400">{summary.onex_worse_count}</span>
              <span className="text-muted-foreground">/ {summary.total_tasks}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency Delta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-400" />
              <span
                className={`text-2xl font-bold ${summary.avg_latency_delta_ms < 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {summary.avg_latency_delta_ms.toFixed(0)}ms
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.avg_latency_delta_ms < 0 ? 'ONEX is faster' : 'ONEX is slower'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-lg">
                ON:{' '}
                <span className="font-bold text-green-400">
                  {(summary.avg_success_rate_on * 100).toFixed(0)}%
                </span>
              </span>
              <span className="text-muted-foreground">vs</span>
              <span className="text-lg">
                OFF:{' '}
                <span className="font-bold text-gray-400">
                  {(summary.avg_success_rate_off * 100).toFixed(0)}%
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Latency Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Latency Comparison (ms)</CardTitle>
          <CardDescription>Per-task latency: ONEX ON vs OFF</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-30}
                textAnchor="end"
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="ONEX ON" fill="#22c55e" />
              <Bar dataKey="ONEX OFF" fill="#6b7280" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Per-Task Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Task Results</CardTitle>
          <CardDescription>{pairs.length} tasks evaluated</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Latency Delta</TableHead>
                <TableHead>Token Delta</TableHead>
                <TableHead>ON Success</TableHead>
                <TableHead>OFF Success</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((pair) => (
                <TableRow key={pair.task_id}>
                  <TableCell className="font-mono text-xs">{pair.task_id}</TableCell>
                  <TableCell>{verdictBadge(pair.verdict)}</TableCell>
                  <TableCell>
                    {deltaIcon(pair.delta_metrics?.latency_ms ?? 0)}{' '}
                    {(pair.delta_metrics?.latency_ms ?? 0).toFixed(0)}ms
                  </TableCell>
                  <TableCell>
                    {deltaIcon(pair.delta_metrics?.token_count ?? 0)}{' '}
                    {(pair.delta_metrics?.token_count ?? 0).toFixed(0)}
                  </TableCell>
                  <TableCell>
                    {pair.onex_on_success ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </TableCell>
                  <TableCell>
                    {pair.onex_off_success ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
