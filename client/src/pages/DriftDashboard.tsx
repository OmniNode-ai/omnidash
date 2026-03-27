/**
 * Contract Drift Dashboard (OMN-6753)
 *
 * Will show contract drift detection results from onex_change_control.
 * Expected data source: onex.evt.onex-change-control.contract-drift-detected.v1
 *
 * The Kafka topic is declared in contract.yaml but no server-side projection
 * or API endpoint exists yet. This page renders a placeholder until the
 * backend wiring is built.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitCompare, ArrowRight } from 'lucide-react';

export default function DriftDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contract Drift</h1>
        <p className="text-muted-foreground mt-1">
          Cross-repo contract drift detection and governance
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <GitCompare className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription className="max-w-md mx-auto">
            This dashboard will display contract drift detection results from the{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">onex_change_control</code>{' '}
            service, including schema mismatches, version skew, and governance violations.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="flex flex-col items-center gap-3 mt-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Kafka topic</span>
              <ArrowRight className="w-3 h-3" />
              <Badge variant="outline" className="font-mono text-xs">
                onex.evt.onex-change-control.contract-drift-detected.v1
              </Badge>
            </div>
            <Badge variant="secondary">Pending backend projection</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
