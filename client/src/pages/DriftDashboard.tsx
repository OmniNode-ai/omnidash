/**
 * Contract Drift Dashboard (OMN-6753)
 *
 * Shows contract drift detection results from onex_change_control.
 * Data source: /api/contract-drift
 * Event topic: onex.evt.onex-change-control.contract-drift-detected.v1
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GitCompare } from 'lucide-react';

interface DriftEvent {
  id: number;
  repo: string;
  node_name: string | null;
  drift_type: string;
  severity: string | null;
  description: string | null;
  expected_value: string | null;
  actual_value: string | null;
  contract_path: string | null;
  detected_at: string;
}

interface DriftSummary {
  severity?: string;
  drift_type?: string;
  count: number;
}

interface DriftResponse {
  recent: DriftEvent[];
  bySeverity: DriftSummary[];
  byType: DriftSummary[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
};

export default function DriftDashboard() {
  const { data, isLoading } = useQuery<DriftResponse>({
    queryKey: ['contract-drift'],
    queryFn: async () => {
      const res = await fetch('/api/contract-drift');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const hasData = data && data.recent.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contract Drift</h1>
        <p className="text-muted-foreground mt-1">
          Cross-repo contract drift detection and governance
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : !hasData ? (
        <Card className="border-dashed">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <GitCompare className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle>No Drift Detected</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              No contract drift events have been recorded yet. Events from the{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">onex_change_control</code>{' '}
              service will appear here when drift is detected.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Badge variant="outline" className="font-mono text-xs">
              onex.evt.onex-change-control.contract-drift-detected.v1
            </Badge>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Severity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.bySeverity.map((s) => (
                    <Badge
                      key={s.severity}
                      className={
                        SEVERITY_COLORS[s.severity || 'low'] || 'bg-gray-100 text-gray-800'
                      }
                    >
                      {s.severity || 'unknown'}: {s.count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.byType.map((t) => (
                    <Badge key={t.drift_type} variant="outline">
                      {t.drift_type}: {t.count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent events table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Drift Events</CardTitle>
              <CardDescription>Last 100 detected contract drift events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">Repo</th>
                      <th className="pb-2 pr-4">Type</th>
                      <th className="pb-2 pr-4">Severity</th>
                      <th className="pb-2 pr-4">Description</th>
                      <th className="pb-2">Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((evt) => (
                      <tr key={evt.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-mono text-xs">{evt.repo}</td>
                        <td className="py-2 pr-4">{evt.drift_type}</td>
                        <td className="py-2 pr-4">
                          <Badge
                            className={
                              SEVERITY_COLORS[evt.severity || 'low'] || 'bg-gray-100 text-gray-800'
                            }
                          >
                            {evt.severity || 'unknown'}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 max-w-xs truncate">{evt.description || '-'}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {new Date(evt.detected_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
