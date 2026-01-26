import { Badge } from '@/components/ui/badge';
import { type ProjectedNode, computeHealthStatus, type HealthStatus } from '@shared/schemas';
import { cn } from '@/lib/utils';

const healthConfig: Record<HealthStatus, { color: string; label: string }> = {
  healthy: { color: 'bg-green-500 text-white', label: 'Healthy' },
  degraded: { color: 'bg-yellow-500 text-black', label: 'Degraded' },
  unhealthy: { color: 'bg-red-500 text-white', label: 'Unhealthy' },
  unknown: { color: 'bg-gray-500 text-white', label: 'Unknown' },
};

interface HealthStatusBadgeProps {
  node: ProjectedNode;
  className?: string;
}

export function HealthStatusBadge({ node, className }: HealthStatusBadgeProps) {
  const status = computeHealthStatus(node);
  const config = healthConfig[status];

  return <Badge className={cn(config.color, className)}>{config.label}</Badge>;
}

// Also export a simpler version that takes status directly
interface StatusBadgeProps {
  status: HealthStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = healthConfig[status];
  return <Badge className={cn(config.color, className)}>{config.label}</Badge>;
}
