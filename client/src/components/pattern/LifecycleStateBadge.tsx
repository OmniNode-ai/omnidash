/**
 * LifecycleStateBadge
 * Color-coded badge for pattern lifecycle states
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type LifecycleState = 'candidate' | 'provisional' | 'validated' | 'deprecated';

interface LifecycleStateBadgeProps {
  state: LifecycleState;
  className?: string;
}

const stateConfig: Record<
  LifecycleState,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }
> = {
  candidate: {
    label: 'Candidate',
    variant: 'outline',
    className: 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
  },
  provisional: {
    label: 'Provisional',
    variant: 'outline',
    className: 'border-blue-500 text-blue-600 dark:text-blue-400',
  },
  validated: {
    label: 'Validated',
    variant: 'default',
    className: 'bg-green-600 hover:bg-green-700',
  },
  deprecated: {
    label: 'Deprecated',
    variant: 'secondary',
    className: 'bg-gray-500 text-gray-100',
  },
};

export function LifecycleStateBadge({ state, className }: LifecycleStateBadgeProps) {
  const config = stateConfig[state];

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
