import { PerformanceThresholds } from '../PerformanceThresholds';

export default function PerformanceThresholdsExample() {
  //todo: remove mock functionality
  const thresholds = [
    { id: '1', name: 'CPU Usage', current: 67, max: 100, unit: '%', warning: 70, critical: 90 },
    { id: '2', name: 'Memory Usage', current: 5.2, max: 8, unit: 'GB', warning: 75, critical: 90 },
    {
      id: '3',
      name: 'Network I/O',
      current: 450,
      max: 1000,
      unit: 'Mbps',
      warning: 70,
      critical: 85,
    },
    {
      id: '4',
      name: 'Active Connections',
      current: 1250,
      max: 2000,
      unit: 'conns',
      warning: 75,
      critical: 90,
    },
  ];

  return (
    <div className="p-6 max-w-2xl">
      <PerformanceThresholds thresholds={thresholds} />
    </div>
  );
}
