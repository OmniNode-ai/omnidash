import { MetricCard } from "@/components/MetricCard";
import { ServiceStatusGrid } from "@/components/ServiceStatusGrid";
import { RealtimeChart } from "@/components/RealtimeChart";
import { EventFeed } from "@/components/EventFeed";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ExportButton } from "@/components/ExportButton";
import { Server, Activity, AlertTriangle, Clock } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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

export default function PlatformHealth() {
  const [selectedService, setSelectedService] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // Fetch platform health from omniarchon with 15 second polling
  const { data: healthData, isLoading, error } = useQuery<PlatformHealthResponse>({
    queryKey: [`/api/intelligence/platform/health?timeWindow=${timeRange}`],
    queryFn: async () => {
      const omniarchonUrl = import.meta.env.VITE_INTELLIGENCE_SERVICE_URL || "http://localhost:8053";
      const response = await fetch(`${omniarchonUrl}/api/intelligence/platform/health?timeWindow=${timeRange}`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`);
      }
      return response.json();
    },
    refetchInterval: 15000, // Poll every 15 seconds
    refetchOnWindowFocus: true,
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  // Map health data to service status format for display
  const getIconForService = (serviceName: string): "server" | "database" | "api" | "web" => {
    if (serviceName.toLowerCase().includes('database') || serviceName.toLowerCase().includes('postgres')) {
      return 'database';
    }
    if (serviceName.toLowerCase().includes('kafka')) {
      return 'api';
    }
    return 'server';
  };

  const parseUptime = (uptimeStr?: string): number => {
    if (!uptimeStr) return 0;
    // Parse uptime strings like "99.9%" or "100%"
    const match = uptimeStr.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  };

  // Combine all services from health response
  const services: Array<{
    id: string;
    name: string;
    status: "healthy" | "degraded" | "down";
    uptime: number;
    responseTime: number;
    icon: "server" | "database" | "api" | "web";
  }> = healthData ? [
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
  ] : [];

  // Generate mock CPU/Memory data for now (can be replaced with real metrics later)
  const cpuData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 50 + Math.random() * 30,
  }));

  const memoryData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 60 + Math.random() * 20,
  }));

  // Generate events based on health status changes
  const events: Array<{ id: string; type: 'info' | 'warning' | 'error' | 'success'; message: string; timestamp: string; source: string }> = [];
  if (healthData) {
    const allServicesHealthy = services.every(s => s.status === 'healthy');
    const degradedServices = services.filter(s => s.status === 'degraded');
    const downServices = services.filter(s => s.status === 'down');

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

  const healthyServices = services.filter(s => s.status === 'healthy').length;
  const avgUptime = services.length > 0 ? (services.reduce((sum, s) => sum + s.uptime, 0) / services.length).toFixed(1) : '0.0';

  // Calculate average latency across all services
  const avgLatency = services.length > 0
    ? Math.round(services.reduce((sum, s) => sum + s.responseTime, 0) / services.length)
    : 0;

  // Count active alerts (services that are down or degraded)
  const activeAlerts = services.filter(s => s.status === 'down' || s.status === 'degraded').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Platform Health</h1>
          <p className="text-muted-foreground">
            Comprehensive system health monitoring and operational metrics
            {healthData && ` · ${services.length} services monitored`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
          <ExportButton
            data={{ services, healthData, cpuData, memoryData, events, metrics: { healthyServices, avgUptime, avgLatency, activeAlerts } }}
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
          <strong>Error loading health data:</strong> {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {healthData && (
        <>
          <div className="grid grid-cols-4 gap-6">
            <MetricCard
              label="Services Online"
              value={`${healthyServices}/${services.length}`}
              icon={Server}
              status={healthyServices === services.length ? "healthy" : healthyServices > 0 ? "warning" : "error"}
            />
            <MetricCard
              label="Avg Uptime"
              value={`${avgUptime}%`}
              icon={Activity}
              status={parseFloat(avgUptime) >= 99 ? "healthy" : parseFloat(avgUptime) >= 95 ? "warning" : "error"}
            />
            <MetricCard
              label="Active Alerts"
              value={activeAlerts.toString()}
              icon={AlertTriangle}
              status={activeAlerts === 0 ? "healthy" : activeAlerts <= 2 ? "warning" : "error"}
            />
            <MetricCard
              label="Avg Latency"
              value={`${avgLatency}ms`}
              icon={Clock}
              status={avgLatency < 100 ? "healthy" : avgLatency < 500 ? "warning" : "error"}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <RealtimeChart
              title="CPU Usage"
              data={cpuData}
              color="hsl(var(--chart-4))"
              showArea
            />
            <RealtimeChart
              title="Memory Usage"
              data={memoryData}
              color="hsl(var(--chart-5))"
              showArea
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <ServiceStatusGrid services={services} />
            </div>

            <EventFeed events={events} maxHeight={400} />
          </div>
        </>
      )}

      <DrillDownPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedService?.name || "Service Details"}
        data={selectedService || {}}
        type="service"
      />
    </div>
  );
}
