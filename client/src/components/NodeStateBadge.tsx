import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NodeState } from '@shared/schemas';

const stateConfig: Record<NodeState, { color: string; label: string }> = {
  PENDING: { color: 'bg-gray-400 text-white', label: 'Registering' },
  ACTIVE: { color: 'bg-green-600 text-white', label: 'Active' },
  OFFLINE: { color: 'bg-red-600 text-white', label: 'Offline' },
};

interface NodeStateBadgeProps {
  state: NodeState;
  className?: string;
}

export function NodeStateBadge({ state, className }: NodeStateBadgeProps) {
  const config = stateConfig[state] || stateConfig.PENDING;
  return <Badge className={cn(config.color, className)}>{config.label}</Badge>;
}
