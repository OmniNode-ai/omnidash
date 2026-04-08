/**
 * Routing Feedback Dashboard (OMN-5284)
 *
 * Displays routing accuracy monitoring based on feedback events projected
 * from onex.evt.omniintelligence.routing-feedback-processed.v1.
 *
 * Sections:
 *   - Accuracy trend over time (line chart via CSS widths)
 *   - Feedback type distribution (positive/negative/correction counts)
 *   - Recent corrections table (original → corrected route)
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
import { AlertTriangle, TrendingUp, GitBranch, CheckCircle2, XCircle } from 'lucide-react';
import { POLLING_INTERVAL_MEDIUM } from '@/lib/constants/query-config';
import { useDemoMode } from '@/contexts/DemoModeContext';

// ============================================================================
// Types
// ============================================================================

interface RoutingFeedbackEvent {
  id: string;
  agent_id: string;
  feedback_type: string;
  original_route: string;
  corrected_route: string | null;
  accuracy_score: number | null;
  created_at: string;
}

interface FeedbackSummary {
  totalEvents: number;
  avgAccuracy: number | null;
  positiveCount: number;
  negativeCount: number;
  correctionCount: number;
}

interface DistributionEntry {
  feedbackType: string;
  count: number;
}

interface AccuracyTrendEntry {
  day: string;
  avgAccuracy: number | null;
  eventCount: number;
}

interface RoutingFeedbackResponse {
  events: RoutingFeedbackEvent[];
  summary: FeedbackSummary;
  distribution: DistributionEntry[];
  accuracyTrend: AccuracyTrendEntry[];
}

// ============================================================================
// Demo data
// ============================================================================

const DEMO_DATA: RoutingFeedbackResponse = {
  events: [
    {
      id: '1',
      agent_id: 'agent-omniclaude',
      feedback_type: 'correction',
      original_route: 'llm-coder',
      corrected_route: 'llm-fast',
      accuracy_score: 0.62, // fallback-ok: demo data
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      id: '2',
      agent_id: 'agent-omniintelligence',
      feedback_type: 'positive',
      original_route: 'llm-reasoning',
      corrected_route: null,
      accuracy_score: 0.94, // fallback-ok: demo data
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: '3',
      agent_id: 'agent-omniclaude',
      feedback_type: 'negative',
      original_route: 'llm-coder',
      corrected_route: null,
      accuracy_score: 0.31, // fallback-ok: demo data
      created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      id: '4',
      agent_id: 'agent-omniintelligence',
      feedback_type: 'correction',
      original_route: 'llm-fast',
      corrected_route: 'llm-coder',
      accuracy_score: 0.55, // fallback-ok: demo data
      created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
    {
      id: '5',
      agent_id: 'agent-omniclaude',
      feedback_type: 'positive',
      original_route: 'llm-coder',
      corrected_route: null,
      accuracy_score: 0.91, // fallback-ok: demo data
      created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
  ],
  summary: {
    totalEvents: 248,
    avgAccuracy: 0.73,
    positiveCount: 142,
    negativeCount: 58,
    correctionCount: 48,
  },
  distribution: [
    { feedbackType: 'positive', count: 142 },
    { feedbackType: 'negative', count: 58 },
    { feedbackType: 'correction', count: 48 },
  ],
  accuracyTrend: Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return {
      day: d.toISOString().slice(0, 10),
      avgAccuracy: 0.55 + Math.random() * 0.35,
      eventCount: Math.floor(10 + Math.random() * 20),
    };
  }),
};

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function accuracyColor(score: number): string {
  if (score >= 0.8) return 'text-emerald-500';
  if (score >= 0.6) return 'text-amber-500';
  return 'text-red-500';
}

function feedbackBadgeVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (type === 'positive') return 'default';
  if (type === 'negative') return 'destructive';
  if (type === 'correction') return 'secondary';
  return 'outline';
}

// ============================================================================
// Sub-components
// ============================================================================

function MetricTile({
  label,
  value,
  sub,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  colorClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${colorClass ?? ''}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function AccuracyTrendChart({ trend }: { trend: AccuracyTrendEntry[] }) {
  if (trend.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
        No trend data
      </div>
    );
  }

  const maxScore = 1.0;

  return (
    <div className="space-y-2">
      {trend.map((entry) => {
        const score = entry.avgAccuracy ?? 0;
        const pct = Math.round((score / maxScore) * 100);
        const barColor =
          score >= 0.8 ? 'bg-emerald-500' : score >= 0.6 ? 'bg-amber-500' : 'bg-red-500';

        return (
          <div key={entry.day} className="flex items-center gap-3 text-xs">
            <span className="w-16 text-muted-foreground shrink-0">{formatDay(entry.day)}</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`w-10 text-right font-mono ${accuracyColor(score)}`}>
              {(score * 100).toFixed(0)}%
            </span>
            <span className="w-14 text-right text-muted-foreground">{entry.eventCount} evt</span>
          </div>
        );
      })}
    </div>
  );
}

function DistributionChart({
  distribution,
  total,
}: {
  distribution: DistributionEntry[];
  total: number;
}) {
  if (total === 0 || distribution.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-muted-foreground text-sm">
        No feedback data
      </div>
    );
  }

  const colorMap: Record<string, string> = {
    positive: 'bg-emerald-500',
    negative: 'bg-red-500',
    correction: 'bg-amber-500',
  };

  return (
    <div className="space-y-3">
      {distribution.map((entry) => {
        const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
        const barColor = colorMap[entry.feedbackType] ?? 'bg-blue-500';
        return (
          <div key={entry.feedbackType} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="capitalize font-medium">{entry.feedbackType}</span>
              <span className="text-muted-foreground">
                {entry.count} ({pct}%)
              </span>
            </div>
            <div className="bg-muted rounded-full h-2 overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function RoutingFeedbackDashboard() {
  const { isDemoMode } = useDemoMode();

  const { data, isLoading, isError } = useQuery<RoutingFeedbackResponse>({
    queryKey: ['routing-feedback'],
    queryFn: async () => {
      const res = await fetch('/api/routing-feedback', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<RoutingFeedbackResponse>;
    },
    refetchInterval: POLLING_INTERVAL_MEDIUM,
    enabled: !isDemoMode,
  });

  const display = isDemoMode ? DEMO_DATA : data;

  if (isLoading && !isDemoMode) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Routing Feedback</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError && !isDemoMode) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load routing feedback</AlertTitle>
        <AlertDescription>Check the server logs for details.</AlertDescription>
      </Alert>
    );
  }

  const summary = display?.summary ?? {
    totalEvents: 0,
    avgAccuracy: null,
    positiveCount: 0,
    negativeCount: 0,
    correctionCount: 0,
  };

  const corrections = (display?.events ?? []).filter((e) => e.feedback_type === 'correction');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Routing Feedback</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Accuracy monitoring for omniintelligence routing decisions
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricTile
          label="Total Feedback Events"
          value={summary.totalEvents.toLocaleString()}
          icon={TrendingUp}
        />
        <MetricTile
          label="Avg Accuracy"
          value={
            summary.avgAccuracy !== null ? `${(summary.avgAccuracy * 100).toFixed(1)}%` : 'N/A'
          }
          icon={GitBranch}
          colorClass={summary.avgAccuracy !== null ? accuracyColor(summary.avgAccuracy) : undefined}
        />
        <MetricTile
          label="Positive"
          value={summary.positiveCount.toLocaleString()}
          sub="confirmed correct"
          icon={CheckCircle2}
          colorClass="text-emerald-500"
        />
        <MetricTile
          label="Corrections"
          value={summary.correctionCount.toLocaleString()}
          sub="route overridden"
          icon={XCircle}
          colorClass="text-amber-500"
        />
      </div>

      {/* Trend + Distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accuracy Trend (30 days)</CardTitle>
            <CardDescription>Daily average accuracy score</CardDescription>
          </CardHeader>
          <CardContent>
            <AccuracyTrendChart trend={display?.accuracyTrend ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback Distribution</CardTitle>
            <CardDescription>Breakdown by feedback type</CardDescription>
          </CardHeader>
          <CardContent>
            <DistributionChart
              distribution={display?.distribution ?? []}
              total={summary.totalEvents}
            />
          </CardContent>
        </Card>
      </div>

      {/* Corrections table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Corrections</CardTitle>
          <CardDescription>Feedback events where routing was overridden</CardDescription>
        </CardHeader>
        <CardContent>
          {corrections.length === 0 ? (
            <p className="text-muted-foreground text-sm">No corrections in recent events.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Original Route</TableHead>
                  <TableHead>Corrected Route</TableHead>
                  <TableHead>Accuracy Score</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corrections.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(event.created_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{event.agent_id}</TableCell>
                    <TableCell className="font-mono text-xs">{event.original_route}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.corrected_route ?? (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {event.accuracy_score !== null ? (
                        <span
                          className={`font-mono text-xs ${accuracyColor(event.accuracy_score)}`}
                        >
                          {(event.accuracy_score * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={feedbackBadgeVariant(event.feedback_type)}>
                        {event.feedback_type}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
