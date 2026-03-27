/**
 * Settings Dashboard (OMN-6753)
 *
 * Shows runtime environment configuration: bus identity, Kafka brokers,
 * namespace, and system health probe status.
 *
 * Data sources:
 * - /api/runtime-environment (bus ID, Kafka brokers, namespace)
 * - /api/health-probe (system health status)
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, Radio } from 'lucide-react';

interface RuntimeEnvironment {
  busId: string;
  kafkaBrokers: string;
  namespace: string;
}

interface HealthProbe {
  status: string;
  checks?: Record<string, { status: string }>;
}

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function SettingsDashboard() {
  const { data: env, isLoading: envLoading } = useQuery<RuntimeEnvironment>({
    queryKey: ['runtime-environment'],
    queryFn: async () => {
      const res = await fetch('/api/runtime-environment');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const { data: health, isLoading: healthLoading } = useQuery<HealthProbe>({
    queryKey: ['health-probe'],
    queryFn: async () => {
      const res = await fetch('/api/health-probe');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const isLoading = envLoading || healthLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Runtime environment configuration and system info
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Runtime Environment */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="text-base">Runtime Environment</CardTitle>
            </div>
            <CardDescription>Server configuration from /api/runtime-environment</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : env ? (
              <div>
                <ConfigRow label="Bus ID" value={env.busId} />
                <ConfigRow label="Kafka Brokers" value={env.kafkaBrokers} mono />
                <ConfigRow label="Namespace" value={env.namespace} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to load runtime environment.</p>
            )}
          </CardContent>
        </Card>

        {/* Health Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="text-base">System Health</CardTitle>
            </div>
            <CardDescription>Health probe status from /api/health-probe</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
              </div>
            ) : health ? (
              <div>
                <ConfigRow label="Overall Status" value={health.status} />
                {health.checks &&
                  Object.entries(health.checks).map(([name, check]) => (
                    <ConfigRow key={name} label={name} value={check.status} />
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to load health probe.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
