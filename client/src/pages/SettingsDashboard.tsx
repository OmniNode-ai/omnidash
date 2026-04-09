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
import { Switch } from '@/components/ui/switch';
import { Server, Radio, Eye, EyeOff } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDashboardHealth } from '@/hooks/useDashboardHealth';
import { getDataSourceForRoute, isRouteLiveByHealth } from '@shared/data-source-route-map';
import type { DataSourceStatus } from '@/components/DataSourceHealthPanel';

interface RuntimeEnvironment {
  busId: string;
  kafkaBrokers: string;
  namespace: string;
}

interface HealthProbe {
  status: string;
  checks?: Record<string, { status: string }>;
}

/** Dashboard groups matching the sidebar Advanced sub-groups. */
const DASHBOARD_GROUPS: { label: string; items: { title: string; url: string }[] }[] = [
  {
    label: 'Monitoring',
    items: [
      { title: 'Event Stream', url: '/events' },
      { title: 'Pipeline Metrics', url: '/extraction' },
      { title: 'Injection Performance', url: '/effectiveness' },
      { title: 'Baselines & ROI', url: '/baselines' },
      { title: 'Cost Trends', url: '/cost-trends' },
      { title: 'CI Intelligence', url: '/ci-intelligence' },
      { title: 'Hostile Reviewer', url: '/hostile-reviewer' },
      { title: 'Agent Coordination', url: '/agent-coordination' },
      { title: 'Epic Pipeline', url: '/epic-pipeline' },
      { title: 'PR Watch', url: '/pr-watch' },
      { title: 'Pipeline Budget', url: '/pipeline-budget' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { title: 'Intent Signals', url: '/intents' },
      { title: 'Intent Drift', url: '/intent-drift' },
      { title: 'Pattern Intelligence', url: '/patterns' },
      { title: 'Pattern Enforcement', url: '/enforcement' },
      { title: 'Context Enrichment', url: '/enrichment' },
      { title: 'Context Effectiveness', url: '/context-effectiveness' },
      { title: 'LLM Routing', url: '/llm-routing' },
      { title: 'RL Routing', url: '/rl-routing' },
      { title: 'Objective Evaluation', url: '/objective' },
      { title: 'CDQA Gates', url: '/cdqa-gates' },
      { title: 'Plan Reviewer', url: '/plan-reviewer' },
      { title: 'Model Efficiency', url: '/model-efficiency' },
      { title: 'Delegation', url: '/delegation' },
      { title: 'Decision Store', url: '/decisions' },
      { title: 'OmniMemory', url: '/memory' },
      { title: 'Review Calibration', url: '/review-calibration' },
      { title: 'Skills', url: '/skills' },
      { title: 'Routing Feedback', url: '/routing-feedback' },
      { title: 'Pattern Lifecycle', url: '/pattern-lifecycle' },
      { title: 'Token Savings', url: '/savings' },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Node Registry', url: '/registry' },
      { title: 'Validation', url: '/validation' },
      { title: 'Pipeline Health', url: '/pipeline-health' },
      { title: 'DoD Verification', url: '/dod' },
      { title: 'Event Bus Health', url: '/event-bus-health' },
      { title: 'Topic Topology', url: '/topic-topology' },
      { title: 'Runtime Health', url: '/worker-health' },
      { title: 'LLM Health', url: '/llm-health' },
      { title: 'DLQ Monitor', url: '/dlq' },
      { title: 'Circuit Breaker', url: '/circuit-breaker' },
      { title: 'Feature Flags', url: '/feature-flags' },
      { title: 'Consumer Health', url: '/consumer-health' },
      { title: 'Runtime Errors', url: '/runtime-errors' },
      { title: 'Gate Decisions', url: '/gate-decisions' },
      { title: 'Debug Escalation', url: '/debug-escalation' },
      { title: 'Status', url: '/status' },
      { title: 'Wiring Health', url: '/wiring-health' },
      { title: 'Compliance', url: '/compliance' },
      { title: 'Doc Freshness', url: '/doc-freshness' },
      { title: 'Agents', url: '/agents' },
      { title: 'Contract Drift', url: '/drift' },
      { title: 'Pipeline', url: '/pipeline' },
      { title: 'Wiring Status', url: '/wiring-status' },
      { title: 'Subsystem Health', url: '/subsystem-health' },
      { title: 'Alert History', url: '/alert-history' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { title: 'Integration Catalog', url: '/integrations' },
      { title: 'Event Ledger', url: '/event-ledger' },
      { title: 'Correlation Trace', url: '/trace' },
      { title: 'Learned Insights', url: '/insights' },
    ],
  },
];

function DataStatusBadge({ status }: { status: DataSourceStatus | 'no_mapping' }) {
  if (status === 'no_mapping') return null;
  const styles: Record<string, string> = {
    live: 'bg-emerald-500/15 text-emerald-400',
    mock: 'bg-amber-500/15 text-amber-400',
    error: 'bg-red-500/15 text-red-400',
    offline: 'bg-gray-500/15 text-gray-400',
    expected_idle_local: 'bg-blue-500/15 text-blue-400',
    not_applicable: 'bg-gray-500/15 text-gray-400',
  };
  const labels: Record<string, string> = {
    live: 'Live',
    mock: 'Mock',
    error: 'Error',
    offline: 'Offline',
    expected_idle_local: 'Idle (Local)',
    not_applicable: 'N/A',
  };
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider ${styles[status] ?? ''}`}
    >
      {labels[status] ?? status}
    </span>
  );
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
  const {
    isRouteHidden,
    toggleRouteVisibility,
    isRouteForceShown,
    toggleRouteForceShow,
    hideNoData,
    setHideNoData,
  } = usePreferences();
  const { healthData } = useDashboardHealth();

  const getRouteStatus = (url: string): DataSourceStatus | 'no_mapping' => {
    const key = getDataSourceForRoute(url);
    if (!key) return 'no_mapping';
    if (!healthData) return 'no_mapping';
    return healthData[key]?.status ?? 'no_mapping';
  };

  const isAutoHidden = (url: string): boolean => {
    if (!hideNoData) return false;
    if (isRouteForceShown(url)) return false;
    const key = getDataSourceForRoute(url);
    if (!key) return false;
    return !isRouteLiveByHealth(url, healthData);
  };

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

      {/* Dashboard Visibility (OMN-7566) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-base">Dashboard Visibility</CardTitle>
          </div>
          <CardDescription>
            Toggle which dashboard pages appear in the sidebar. Hidden pages are removed from
            navigation but remain accessible via direct URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Global auto-hide toggle */}
          <div className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <EyeOff className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Hide pages without data</p>
                <p className="text-xs text-muted-foreground">
                  Automatically hide pages whose data source is offline or mock
                </p>
              </div>
            </div>
            <Switch
              checked={hideNoData}
              onCheckedChange={setHideNoData}
              aria-label="Toggle auto-hide pages without data"
              data-testid="hide-no-data-toggle"
            />
          </div>

          {DASHBOARD_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground/60 font-medium mb-3">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const status = getRouteStatus(item.url);
                  const hidden = isRouteHidden(item.url);
                  const autoHidden = isAutoHidden(item.url);
                  const forceShown = isRouteForceShown(item.url);
                  return (
                    <div
                      key={item.url}
                      className="flex items-center justify-between py-2 border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-sm ${hidden || autoHidden ? 'text-muted-foreground line-through' : ''}`}
                        >
                          {item.title}
                        </span>
                        <DataStatusBadge status={status} />
                        {autoHidden && !hidden && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">
                            Auto-hidden
                          </span>
                        )}
                        {forceShown && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 uppercase tracking-wider">
                            Pinned
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {autoHidden && !hidden && (
                          <button
                            onClick={() => toggleRouteForceShow(item.url)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            title={
                              forceShown ? 'Unpin (allow auto-hide)' : 'Pin (override auto-hide)'
                            }
                          >
                            {forceShown ? 'Unpin' : 'Pin'}
                          </button>
                        )}
                        {forceShown && !autoHidden && (
                          <button
                            onClick={() => toggleRouteForceShow(item.url)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            title="Unpin (allow auto-hide)"
                          >
                            Unpin
                          </button>
                        )}
                        <Switch
                          checked={!hidden}
                          onCheckedChange={() => toggleRouteVisibility(item.url)}
                          aria-label={`Toggle ${item.title} visibility`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
