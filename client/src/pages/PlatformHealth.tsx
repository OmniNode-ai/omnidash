import { MetricCard } from "@/components/MetricCard";
import { ServiceStatusGrid } from "@/components/ServiceStatusGrid";
import { RealtimeChart } from "@/components/RealtimeChart";
import { EventFeed } from "@/components/EventFeed";
import { Server, Activity, AlertTriangle, Clock } from "lucide-react";

export default function PlatformHealth() {
  //todo: remove mock functionality
  const services = [
    { id: '1', name: 'API Gateway', status: 'healthy' as const, uptime: 99.9, responseTime: 45, icon: 'api' as const },
    { id: '2', name: 'PostgreSQL', status: 'healthy' as const, uptime: 99.8, responseTime: 12, icon: 'database' as const },
    { id: '3', name: 'Redis Cache', status: 'degraded' as const, uptime: 98.5, responseTime: 89, icon: 'database' as const },
    { id: '4', name: 'Web Server', status: 'healthy' as const, uptime: 99.7, responseTime: 23, icon: 'web' as const },
    { id: '5', name: 'Kafka Cluster', status: 'healthy' as const, uptime: 99.6, responseTime: 34, icon: 'server' as const },
    { id: '6', name: 'AI Agent Pool', status: 'healthy' as const, uptime: 99.4, responseTime: 67, icon: 'server' as const },
    { id: '7', name: 'WebSocket Server', status: 'healthy' as const, uptime: 99.5, responseTime: 18, icon: 'web' as const },
    { id: '8', name: 'Message Queue', status: 'healthy' as const, uptime: 99.7, responseTime: 28, icon: 'server' as const },
  ];

  const cpuData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 50 + Math.random() * 30,
  }));

  const memoryData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    value: 60 + Math.random() * 20,
  }));

  const events = [
    { id: '1', type: 'warning' as const, message: 'High CPU usage on Web Server', timestamp: '10:23:15', source: 'Monitor' },
    { id: '2', type: 'success' as const, message: 'Redis Cache recovered to normal state', timestamp: '10:23:12', source: 'Health Check' },
    { id: '3', type: 'info' as const, message: 'Scheduled maintenance completed', timestamp: '10:23:08', source: 'System' },
  ];

  const healthyServices = services.filter(s => s.status === 'healthy').length;
  const avgUptime = (services.reduce((sum, s) => sum + s.uptime, 0) / services.length).toFixed(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Platform Health</h1>
        <p className="text-muted-foreground">Comprehensive system health monitoring and operational metrics</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <MetricCard 
          label="Services Online"
          value={`${healthyServices}/${services.length}`}
          icon={Server}
          status="healthy"
        />
        <MetricCard 
          label="Avg Uptime"
          value={`${avgUptime}%`}
          trend={{ value: 0.2, isPositive: true }}
          icon={Activity}
          status="healthy"
        />
        <MetricCard 
          label="Active Alerts"
          value="2"
          icon={AlertTriangle}
          status="warning"
        />
        <MetricCard 
          label="System Uptime"
          value="44h 23m"
          icon={Clock}
          status="healthy"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ServiceStatusGrid services={services} />
        </div>
        
        <EventFeed events={events} maxHeight={400} />
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
    </div>
  );
}
