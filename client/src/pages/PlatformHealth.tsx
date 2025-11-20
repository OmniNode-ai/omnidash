import { MetricCard } from '@/components/MetricCard';
import { ServiceStatusGrid } from '@/components/ServiceStatusGrid';
import { RealtimeChart } from '@/components/RealtimeChart';
import { EventFeed } from '@/components/EventFeed';
import { DrillDownModal } from '@/components/DrillDownModal';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { ExportButton } from '@/components/ExportButton';
import { SectionHeader } from '@/components/SectionHeader';
import { Server, Activity, AlertTriangle, Clock } from 'lucide-react';
import { useState } from 'react';
import { MockBadge } from '@/components/MockBadge';
import { ensureTimeSeries } from '@/components/mockUtils';
import { useQuery } from '@tanstack/react-query';
import { platformHealthSource } from '@/lib/data-sources';
import { HEALTH_QUERY_CONFIG } from '@/lib/constants/query-config';

// TypeScript interfaces for platform health endpoint
interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  uptime?: string;
  latency_ms?: number;
}

interface PlatformHealthResponse {
  database: ServiceHealth;
  kafka: ServiceHealth;
  services: ServiceHealth[];
}

// TypeScript interface for service registry
interface ServiceRegistryEntry {
  id: string;
  serviceName: string;
  serviceUrl: string;
  serviceType: string;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck: string | null;
}

export default function PlatformHealth() {
  const [selectedService] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // Use centralized data source
  const {
    data: healthDataResult,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['platform-health', timeRange],
    queryFn: () => platformHealthSource.fetchAll(timeRange),
    ...HEALTH_QUERY_CONFIG,
    refetchOnWindowFocus: true,
  });

  // Transform to expected format
  const healthData: PlatformHealthResponse | null = healthDataResult?.health
    ? {
        database: (healthDataResult.health as any).database || {
          name: 'Database',
          status: 'down' as const,
        },
        kafka: (healthDataResult.health as any).kafka || { name: 'Kafka', status: 'down' as const },
        services: (healthDataResult.health as any).services || [],
      }
    : null;

  const serviceRegistry: ServiceRegistryEntry[] = (healthDataResult?.services?.services || []).map(
    (s: any) => ({
      id: s.id || `service-${s.name}`,
      serviceName: s.name || s.serviceName || 'Unknown',
      serviceUrl: s.url || s.serviceUrl || '',
      serviceType: s.type || s.serviceType || 'unknown',
      healthStatus: (s.status || s.healthStatus || 'unhealthy') as
        | 'healthy'
        | 'degraded'
        | 'unhealthy',
      lastHealthCheck: s.lastHealthCheck || null,
    })
  );

  // Map health data to service status format for display
  const getIconForService = (serviceName: string): 'server' | 'database' | 'api' | 'web' => {
    if (
      serviceName.toLowerCase().includes('database') ||
      serviceName.toLowerCase().includes('postgres')
    ) {
      return 'database';
    }
    if (serviceName.toLowerCase().includes('kafka')) {
      return 'api';
    }
    return 'server';
  };

  const parseUptime = (uptimeStr?: string | number): number => {
    if (typeof uptimeStr === 'number') return uptimeStr;
    if (!uptimeStr) return 0;
    // Parse uptime strings like "99.9%" or "100%"
    const match = uptimeStr.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  };

  // Combine all services from health response
  const services: Array<{
    id: string;
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    uptime: number;
    responseTime: number;
    icon: 'server' | 'database' | 'api' | 'web';
  }> = healthData
    ? [
        {
          id: 'database',
          name: healthData.database.name,
          status: healthData.database.status,
          uptime: parseUptime(healthData.database.uptime),
          responseTime: healthData.database.latency_ms || 0,
          icon: 'database',
        },
        {
          id: 'kafka',
          name: healthData.kafka.name,
          status: healthData.kafka.status,
          uptime: parseUptime(healthData.kafka.uptime),
          responseTime: healthData.kafka.latency_ms || 0,
          icon: 'api',
        },
        ...healthData.services.map((service, idx) => ({
          id: `service-${idx}`,
          name: service.name,
          status: service.status,
          uptime: parseUptime(service.uptime),
          responseTime: service.latency_ms || 0,
          icon: getIconForService(service.name),
        })),
      ]
    : [];

  // Generate mock CPU/Memory data for now (can be replaced with real metrics later)
  const cpuDataEnsured = ensureTimeSeries(undefined, 55, 15);
  const memoryDataEnsured = ensureTimeSeries(undefined, 65, 12);

  // Generate events based on health status changes
  const events: Array<{
    id: string;
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    timestamp: string;
    source: string;
  }> = [];
  if (healthData) {
    const allServicesHealthy = services.every((s) => s.status === 'healthy');
    const degradedServices = services.filter((s) => s.status === 'degraded');
    const downServices = services.filter((s) => s.status === 'down');

    if (downServices.length > 0) {
      downServices.forEach((service, idx) => {
        events.push({
          id: `error-${idx}`,
          type: 'error',
          message: `${service.name} is down`,
          timestamp: new Date().toLocaleTimeString(),
          source: 'Health Check',
        });
      });
    }

    if (degradedServices.length > 0) {
      degradedServices.forEach((service, idx) => {
        events.push({
          id: `warning-${idx}`,
          type: 'warning',
          message: `${service.name} is degraded`,
          timestamp: new Date().toLocaleTimeString(),
          source: 'Health Check',
        });
      });
    }

    if (allServicesHealthy) {
      events.push({
        id: 'success',
        type: 'success',
        message: 'All services operational',
        timestamp: new Date().toLocaleTimeString(),
        source: 'Health Check',
      });
    }
  }

  const healthyServices = services.filter((s) => s.status === 'healthy').length;
  const avgUptime =
    services.length > 0
      ? (services.reduce((sum, s) => sum + s.uptime, 0) / services.length).toFixed(1)
      : '0.0';

  // Calculate average latency across all services
  const avgLatency =
    services.length > 0
      ? Math.round(services.reduce((sum, s) => sum + s.responseTime, 0) / services.length)
      : 0;

  // Count active alerts (services that are down or degraded)
  const activeAlerts = services.filter(
    (s) => s.status === 'down' || s.status === 'degraded'
  ).length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Platform Health"
        description={`Comprehensive system health monitoring and operational metrics${healthData ? ` · ${services.length} services monitored` : ''}`}
        details="Platform Health provides real-time monitoring of all infrastructure services including databases, message queues, microservices, and external APIs. Track service uptime, latency, active alerts, and resource utilization. Use this dashboard to quickly identify and respond to service degradation or outages before they impact users."
        level="h1"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
          <ExportButton
            data={{
              services,
              healthData,
              cpuData: cpuDataEnsured.data,
              memoryData: memoryDataEnsured.data,
              events,
              metrics: { healthyServices, avgUptime, avgLatency, activeAlerts },
            }}
            filename={`platform-health-${timeRange}-${new Date().toISOString().split('T')[0]}`}
            disabled={isLoading || !!error}
          />
        </div>
      </div>

      {isLoading && (
        <div className="text-center text-muted-foreground py-8">
          Loading platform health data...
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive rounded-lg p-4 text-destructive">
          <strong>Error loading health data:</strong>{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {healthData && (
        <>
          <div className="grid grid-cols-4 gap-6">
            <MetricCard
              label="Services Online"
              value={`${healthyServices}/${services.length}`}
              icon={Server}
              status={
                healthyServices === services.length
                  ? 'healthy'
                  : healthyServices > 0
                    ? 'warning'
                    : 'error'
              }
            />
            <MetricCard
              label="Avg Uptime"
              value={`${avgUptime}%`}
              icon={Activity}
              status={
                parseFloat(avgUptime) >= 99
                  ? 'healthy'
                  : parseFloat(avgUptime) >= 95
                    ? 'warning'
                    : 'error'
              }
            />
            <MetricCard
              label="Active Alerts"
              value={activeAlerts.toString()}
              icon={AlertTriangle}
              status={activeAlerts === 0 ? 'healthy' : activeAlerts <= 2 ? 'warning' : 'error'}
            />
            <MetricCard
              label="Avg Latency"
              value={`${avgLatency}ms`}
              icon={Clock}
              status={avgLatency < 100 ? 'healthy' : avgLatency < 500 ? 'warning' : 'error'}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              {cpuDataEnsured.isMock && <MockBadge label="MOCK DATA: CPU Usage" />}
              <RealtimeChart
                title="CPU Usage"
                data={cpuDataEnsured.data}
                color="hsl(var(--chart-4))"
                showArea
              />
            </div>
            <div>
              {memoryDataEnsured.isMock && <MockBadge label="MOCK DATA: Memory Usage" />}
              <RealtimeChart
                title="Memory Usage"
                data={memoryDataEnsured.data}
                color="hsl(var(--chart-5))"
                showArea
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <ServiceStatusGrid services={services} />
            </div>

            <EventFeed events={events} maxHeight={400} />
          </div>

          {/* Service Registry Grid */}
          {serviceRegistry && serviceRegistry.length > 0 && (
            <div className="mt-6">
              <SectionHeader
                title="Service Registry"
                description="Centralized registry of all platform services with health status and metadata."
                details="The Service Registry maintains a catalog of all microservices and infrastructure components. View service types, URLs, health status, and last health check times. This registry enables service discovery, health monitoring, and operational visibility across the entire platform."
                level="h2"
              />
              <div className="bg-card rounded-lg border p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {serviceRegistry.map((service) => {
                    // Map health status to color
                    const statusColor =
                      service.healthStatus === 'healthy'
                        ? 'text-green-500'
                        : service.healthStatus === 'degraded'
                          ? 'text-yellow-500'
                          : 'text-red-500';

                    const statusBg =
                      service.healthStatus === 'healthy'
                        ? 'bg-green-500/10'
                        : service.healthStatus === 'degraded'
                          ? 'bg-yellow-500/10'
                          : 'bg-red-500/10';

                    // Format last health check time
                    const lastCheck = service.lastHealthCheck
                      ? new Date(service.lastHealthCheck).toLocaleString()
                      : 'Never';

                    return (
                      <div
                        key={service.id}
                        className="bg-muted/50 rounded-lg p-4 border border-border hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-sm">{service.serviceName}</h3>
                          <div
                            className={`px-2 py-1 rounded-full text-xs font-medium ${statusBg} ${statusColor}`}
                          >
                            {service.healthStatus}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Type:</span>
                            <span>{service.serviceType}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">URL:</span>
                            <span className="truncate">{service.serviceUrl}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Last Check:</span>
                            <span>{lastCheck}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <DrillDownModal
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedService?.name || 'Service Details'}
        data={selectedService || {}}
        type="service"
        variant="modal"
      />
    </div>
  );
}
