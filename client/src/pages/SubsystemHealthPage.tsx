/**
 * Subsystem Health Dashboard Page (OMN-7007)
 *
 * Shows verification status for each platform subsystem, with:
 * - Last verification timestamp
 * - Status badge (PASS/WARN/FAIL/STALE)
 * - Test count and pass rate
 * - Staleness degradation (WARN after 8h, STALE after 24h)
 *
 * Data source: GET /api/subsystem-health
 * Writer: cron-closeout Phase E (POST /api/subsystem-health)
 *
 * @see OMN-6995 Platform Subsystem Verification epic
 */

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
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface SubsystemHealth {
  subsystem: string;
  status: string;
  originalStatus: string;
  testCount: number;
  passCount: number;
  failCount: number;
  passRate: number;
  lastVerified: string;
  runId: string;
}

interface SubsystemHealthResponse {
  subsystems: SubsystemHealth[];
  checkedAt: string;
  _demo?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; variant: string }> = {
  PASS: { icon: CheckCircle2, color: 'text-green-500', variant: 'default' },
  WARN: { icon: AlertTriangle, color: 'text-yellow-500', variant: 'secondary' },
  FAIL: { icon: XCircle, color: 'text-red-500', variant: 'destructive' },
  STALE: { icon: Clock, color: 'text-gray-400', variant: 'outline' },
  UNKNOWN: { icon: HelpCircle, color: 'text-gray-400', variant: 'outline' },
};

function formatAge(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ago`;
  }
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  return `${minutes}m ago`;
}

// ============================================================================
// Component
// ============================================================================

export default function SubsystemHealthPage() {
  const { data, isLoading, error } = useQuery<SubsystemHealthResponse>({
    queryKey: ['subsystem-health'],
    queryFn: () => fetch('/api/subsystem-health').then((r) => r.json()),
    refetchInterval: 60_000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-500">Failed to load subsystem health: {String(error)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subsystems = data?.subsystems ?? [];
  const passCount = subsystems.filter((s) => s.status === 'PASS').length;
  const failCount = subsystems.filter((s) => s.status === 'FAIL').length;
  const warnCount = subsystems.filter((s) => s.status === 'WARN' || s.status === 'STALE').length;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subsystem Health</h1>
        <p className="text-muted-foreground">
          Verification status from the last close-out cycle
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Subsystems</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{subsystems.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Passing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{passCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Failing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{failCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Warning / Stale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{warnCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Detail table */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Results</CardTitle>
          <CardDescription>
            Each row traces to a specific close-out run. Status degrades to WARN after 8h and STALE after 24h without fresh verification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subsystems.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center">
              No verification results yet. Run a close-out cycle to populate.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subsystem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Verified</TableHead>
                  <TableHead className="text-right">Tests</TableHead>
                  <TableHead className="text-right">Pass Rate</TableHead>
                  <TableHead>Run ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subsystems.map((sub) => {
                  const config = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.UNKNOWN;
                  const Icon = config.icon;
                  return (
                    <TableRow key={sub.subsystem}>
                      <TableCell className="font-medium">{sub.subsystem}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className={cn('h-4 w-4', config.color)} />
                          <Badge variant={config.variant as 'default' | 'secondary' | 'destructive' | 'outline'}>
                            {sub.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          sub.status === 'STALE' && 'text-red-400',
                          sub.status === 'WARN' && 'text-yellow-500',
                        )}>
                          {formatAge(sub.lastVerified)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{sub.testCount}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          sub.passRate === 100 && 'text-green-600 font-medium',
                          sub.passRate < 100 && sub.passRate > 0 && 'text-yellow-600',
                          sub.passRate === 0 && sub.testCount > 0 && 'text-red-600',
                        )}>
                          {sub.testCount > 0 ? `${sub.passRate}%` : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {sub.runId}
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
          Running in demo mode — no database configured.
        </p>
      )}
    </div>
  );
}
