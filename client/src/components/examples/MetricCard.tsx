import { MetricCard } from '../MetricCard';
import { Activity, Cpu, Database } from 'lucide-react';

export default function MetricCardExample() {
  return (
    <div className="grid grid-cols-3 gap-6 p-6">
      <MetricCard
        label="Active Agents"
        value="52"
        trend={{ value: 12, isPositive: true }}
        icon={Activity}
        status="healthy"
      />
      <MetricCard label="CPU Usage" value="67%" icon={Cpu} status="warning" />
      <MetricCard
        label="Patterns Learned"
        value="25,847"
        trend={{ value: 8.5, isPositive: true }}
        icon={Database}
        status="healthy"
      />
    </div>
  );
}
