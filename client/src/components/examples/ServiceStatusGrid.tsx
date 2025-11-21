import { ServiceStatusGrid } from '../ServiceStatusGrid';

export default function ServiceStatusGridExample() {
  //todo: remove mock functionality
  const services = [
    {
      id: '1',
      name: 'API Gateway',
      status: 'healthy' as const,
      uptime: 99.9,
      responseTime: 45,
      icon: 'api' as const,
    },
    {
      id: '2',
      name: 'PostgreSQL',
      status: 'healthy' as const,
      uptime: 99.8,
      responseTime: 12,
      icon: 'database' as const,
    },
    {
      id: '3',
      name: 'Redis Cache',
      status: 'degraded' as const,
      uptime: 98.5,
      responseTime: 89,
      icon: 'database' as const,
    },
    {
      id: '4',
      name: 'Web Server',
      status: 'healthy' as const,
      uptime: 99.7,
      responseTime: 23,
      icon: 'web' as const,
    },
    {
      id: '5',
      name: 'Kafka Cluster',
      status: 'healthy' as const,
      uptime: 99.6,
      responseTime: 34,
      icon: 'server' as const,
    },
    {
      id: '6',
      name: 'AI Agent Pool',
      status: 'down' as const,
      uptime: 0,
      responseTime: 0,
      icon: 'server' as const,
    },
  ];

  return (
    <div className="p-6">
      <ServiceStatusGrid services={services} />
    </div>
  );
}
