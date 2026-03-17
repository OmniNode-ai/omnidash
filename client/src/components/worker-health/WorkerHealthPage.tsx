/**
 * Runtime Health Page (OMN-3598)
 *
 * Displays Docker container health for runtime workers so you can answer:
 * "which containers are running?", "are any restarting excessively?",
 * and "is docker available on the host?"
 *
 * Data source: /api/worker-health (polled from docker inspect every 30s)
 *
 * Shows summary cards + worker table: Name | Status | Restarts | Health | Started
 * Color-coded: down=red, restarting=orange, healthy=green
 * Docker-unavailable warning banner when docker CLI is not reachable.
 */

import { useDataSource } from '@/hooks/useDataSource';
import { LocalDataUnavailableBanner } from '@/components/LocalDataUnavailableBanner';
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
  Server,
  Activity,
  Container,
  HeartPulse,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types (inline — API is the contract, not server imports)
// ============================================================================

interface WorkerHealthRecord {
  name: string;
  status: string;
  restartCount: number;
  health: string;
  startedAt: string | null;
  lastUpdated: string;
}

interface WorkerHealthSummary {
  total: number;
  healthy: number;
  restarting: number;
  down: number;
}

interface WorkerHealthPayload {
  workers: WorkerHealthRecord[];
  summary: WorkerHealthSummary;
  dockerAvailable: boolean;
  restartThreshold: number;
}

// ============================================================================
// Helpers
// ============================================================================

function relativeTime(isoTs: string | null): string {
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

function WorkerStatusIcon({ worker }: { worker: WorkerHealthRecord }) {
  if (worker.status !== 'running') return <XCircle className="h-4 w-4 text-red-500" />;
  if (worker.health === 'unhealthy') return <AlertTriangle className="h-4 w-4 text-orange-500" />;
  return <CheckCircle2 className="h-4 w-4 text-green-500" />;
}

function statusBadgeVariant(worker: WorkerHealthRecord, restartThreshold: number): string {
  if (worker.status !== 'running') return 'border-red-500 text-red-500';
  if (worker.restartCount > restartThreshold) return 'border-orange-500 text-orange-500';
  if (worker.health === 'unhealthy') return 'border-orange-500 text-orange-500';
  if (worker.health === 'starting') return 'border-yellow-500 text-yellow-500';
  return 'border-green-500 text-green-500';
}

function statusLabel(worker: WorkerHealthRecord, restartThreshold: number): string {
  if (worker.status !== 'running') return worker.status.toUpperCase();
  if (worker.restartCount > restartThreshold) return 'RESTARTING';
  if (worker.health === 'unhealthy') return 'UNHEALTHY';
  if (worker.health === 'starting') return 'STARTING';
  return 'HEALTHY';
}

function rowHighlightClass(worker: WorkerHealthRecord): string | undefined {
  if (worker.status !== 'running') return 'bg-red-50 dark:bg-red-950/20';
  if (worker.health === 'unhealthy') return 'bg-orange-50 dark:bg-orange-950/20';
  return undefined;
}

function restartCountClass(count: number, threshold: number): string {
  if (count === 0) return 'text-muted-foreground';
  if (count > threshold) return 'text-orange-500 font-semibold';
  return 'text-yellow-500';
}

function healthBadgeClass(health: string): string {
  switch (health) {
    case 'healthy':
      return 'border-green-500 text-green-500';
    case 'unhealthy':
      return 'border-red-500 text-red-500';
    case 'starting':
      return 'border-yellow-500 text-yellow-500';
    default:
      return 'border-muted-foreground text-muted-foreground';
  }
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

function DockerUnavailableBanner() {
  return (
    <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Docker CLI Unavailable
          </p>
          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
            The server cannot reach the Docker CLI. Container health data may be stale or empty.
            Ensure docker is installed and accessible to the omnidash server process.
          </p>
        </div>
      </div>
    </div>
  );
}

function WorkerTable({
  workers,
  restartThreshold,
  isLoading,
}: {
  workers: WorkerHealthRecord[];
  restartThreshold: number;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Container className="h-4 w-4" />
          Container Health
        </CardTitle>
        <CardDescription>
          Polled from <code className="text-xs">docker inspect</code> every 30s
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : workers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No runtime containers found.
            <br />
            Ensure Docker is running and containers matching{' '}
            <code className="text-xs">omnibase-infra-runtime-*</code> or{' '}
            <code className="text-xs">omninode-runtime*</code> are present.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Container</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Restarts</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((worker) => (
                <TableRow key={worker.name} className={rowHighlightClass(worker)}>
                  <TableCell
                    className="font-mono text-xs max-w-[260px] truncate"
                    title={worker.name}
                  >
                    {worker.name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <WorkerStatusIcon worker={worker} />
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs font-mono',
                          statusBadgeVariant(worker, restartThreshold)
                        )}
                      >
                        {statusLabel(worker, restartThreshold)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right text-xs tabular-nums font-mono',
                      restartCountClass(worker.restartCount, restartThreshold)
                    )}
                  >
                    {worker.restartCount}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('text-xs font-mono', healthBadgeClass(worker.health))}
                    >
                      {worker.health}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {relativeTime(worker.startedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {relativeTime(worker.lastUpdated)}
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
// Main Page
// ============================================================================

async function fetchWorkerHealth(): Promise<WorkerHealthPayload> {
  const res = await fetch('/api/worker-health');
  if (!res.ok) throw new Error('Failed to fetch worker health');
  return res.json() as Promise<WorkerHealthPayload>;
}

export default function WorkerHealthPage() {
  const { data, source, isLoading } = useDataSource({
    queryKey: ['worker-health', 'full'],
    queryFn: fetchWorkerHealth,
    fallbackData: {
      workers: [],
      summary: { total: 0, healthy: 0, restarting: 0, down: 0 },
      dockerAvailable: false,
      restartThreshold: 5,
    } as WorkerHealthPayload,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const workers = data?.workers ?? [];
  const summary = data?.summary ?? { total: 0, healthy: 0, restarting: 0, down: 0 };
  const dockerAvailable = data?.dockerAvailable ?? true;
  const restartThreshold = data?.restartThreshold ?? 5;

  return (
    <div className="space-y-6" data-testid="page-worker-health">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Runtime Health</h1>
        <p className="text-muted-foreground">
          Container status, restart counts, and Docker healthcheck state for runtime workers
        </p>
      </div>

      {source === 'unavailable' && <LocalDataUnavailableBanner />}

      {/* Docker unavailable warning */}
      {!isLoading && !dockerAvailable && <DockerUnavailableBanner />}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Workers"
          value={isLoading ? '\u2014' : String(summary.total)}
          icon={Server}
          isLoading={isLoading}
        />
        <StatCard
          title="Healthy"
          value={isLoading ? '\u2014' : String(summary.healthy)}
          icon={HeartPulse}
          valueClass={summary.healthy > 0 ? 'text-green-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="Restarting"
          value={isLoading ? '\u2014' : String(summary.restarting)}
          icon={Activity}
          valueClass={summary.restarting > 0 ? 'text-orange-500' : undefined}
          isLoading={isLoading}
        />
        <StatCard
          title="Down"
          value={isLoading ? '\u2014' : String(summary.down)}
          icon={XCircle}
          valueClass={summary.down > 0 ? 'text-red-500' : undefined}
          isLoading={isLoading}
        />
      </div>

      {/* Worker Table */}
      <WorkerTable workers={workers} restartThreshold={restartThreshold} isLoading={isLoading} />
    </div>
  );
}
