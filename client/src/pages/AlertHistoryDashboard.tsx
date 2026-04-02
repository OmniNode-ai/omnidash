/**
 * Alert History Dashboard
 *
 * Shows historical alert data from skill invocations (hook_health_alert,
 * slack_gate) plus current active alerts from the alert engine.
 *
 * Data source: GET /api/alert-history?window=24h
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, XCircle, AlertCircle, Info, Bell, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type AlertSeverity = 'critical' | 'error' | 'warning' | 'info';

interface AlertHistoryEntry {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  source: string;
  message: string;
  success: boolean;
  durationMs: number;
}

interface AlertHistoryStats {
  total24h: number;
  bySeverity: Record<AlertSeverity, number>;
  bySource: Record<string, number>;
  successRate: number | null;
}

interface AlertHistoryResponse {
  alerts: AlertHistoryEntry[];
  stats: AlertHistoryStats;
  activeAlerts: Array<{
    level: 'critical' | 'warning';
    message: string;
  }>;
  _demo?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { icon: typeof AlertTriangle; color: string; badgeVariant: string; bgClass: string }
> = {
  critical: {
    icon: XCircle,
    color: 'text-red-500',
    badgeVariant: 'destructive',
    bgClass: 'bg-red-500/10',
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-400',
    badgeVariant: 'destructive',
    bgClass: 'bg-red-400/10',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    badgeVariant: 'secondary',
    bgClass: 'bg-yellow-500/10',
  },
  info: {
    icon: Info,
    color: 'text-blue-400',
    badgeVariant: 'outline',
    bgClass: 'bg-blue-400/10',
  },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

// ============================================================================
// Component
// ============================================================================

export default function AlertHistoryDashboard() {
  const [window, setWindow] = useState('24h');

  const { data, isLoading, error } = useQuery<AlertHistoryResponse>({
    queryKey: ['alert-history', window],
    queryFn: async () => {
      const response = await fetch(`/api/alert-history?window=${window}`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Failed to load alert history (${response.status})`);
      }
      return (await response.json()) as AlertHistoryResponse;
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-500">Failed to load alert history: {String(error)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alerts = data?.alerts ?? [];
  const stats = data?.stats ?? {
    total24h: 0,
    bySeverity: { critical: 0, error: 0, warning: 0, info: 0 },
    bySource: {},
    successRate: null,
  };
  const activeAlerts = data?.activeAlerts ?? [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Alert History
          </h1>
          <p className="text-muted-foreground">
            Historical alerts from health checks and slack gate invocations
          </p>
        </div>
        <Select value={window} onValueChange={setWindow}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">1 hour</SelectItem>
            <SelectItem value="6h">6 hours</SelectItem>
            <SelectItem value="24h">24 hours</SelectItem>
            <SelectItem value="7d">7 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active alerts banner */}
      {activeAlerts.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Active Alerts ({activeAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {activeAlerts.map((alert, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant={alert.level === 'critical' ? 'destructive' : 'secondary'}>
                    {alert.level}
                  </Badge>
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total24h}</div>
            <p className="text-xs text-muted-foreground">in selected window</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-500">Critical / Error</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {stats.bySeverity.critical + stats.bySeverity.error}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.bySeverity.critical} critical, {stats.bySeverity.error} error
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-500">Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.bySeverity.warning}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Delivery Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">
                {stats.successRate != null ? `${(stats.successRate * 100).toFixed(0)}%` : 'N/A'}
              </div>
              <CheckCircle2
                className={cn(
                  'h-5 w-5',
                  stats.successRate != null && stats.successRate >= 0.95
                    ? 'text-green-500'
                    : 'text-yellow-500'
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">alert delivery success</p>
          </CardContent>
        </Card>
      </div>

      {/* Source breakdown */}
      {Object.keys(stats.bySource).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.bySource)
                .sort(([, a], [, b]) => b - a)
                .map(([source, count]) => (
                  <Badge key={source} variant="outline" className="text-sm">
                    {source}: {count}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert history table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
          <CardDescription>Alert-related skill invocations ordered by most recent</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mb-4 text-green-500/50" />
              <p className="text-lg font-medium">No alerts in this window</p>
              <p className="text-sm">All systems operating normally</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => {
                  const config = SEVERITY_CONFIG[alert.severity];
                  const Icon = config.icon;
                  return (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className={cn('h-4 w-4', config.color)} />
                          <Badge
                            variant={
                              config.badgeVariant as
                                | 'default'
                                | 'secondary'
                                | 'destructive'
                                | 'outline'
                            }
                          >
                            {alert.severity}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {alert.source}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-md truncate" title={alert.message}>
                        {alert.message}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span title={formatTimestamp(alert.timestamp)}>
                            {formatAge(alert.timestamp)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        {alert.durationMs > 0 ? `${alert.durationMs}ms` : '-'}
                      </TableCell>
                      <TableCell>
                        {alert.success ? (
                          <Badge variant="outline" className="text-green-500 border-green-500/30">
                            delivered
                          </Badge>
                        ) : (
                          <Badge variant="destructive">failed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data?._demo && (
        <p className="text-sm text-muted-foreground text-center">
          No alert history data available. Alert-related skill invocations will appear here when
          hook_health_alert or slack_gate skills are executed.
        </p>
      )}
    </div>
  );
}
