/**
 * LifecycleStateBadge
 * Color-coded badge for pattern lifecycle states
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type LifecycleState = 'candidate' | 'provisional' | 'validated' | 'deprecated';

interface LifecycleStateBadgeProps {
  state: LifecycleState | string;
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

const FALLBACK_CONFIG = {
  variant: 'outline' as const,
  className: 'border-gray-400 text-gray-500 dark:text-gray-400',
};

export function LifecycleStateBadge({ state, className }: LifecycleStateBadgeProps) {
  const config = stateConfig[state as LifecycleState];
  const { variant, className: stateClassName } = config ?? FALLBACK_CONFIG;
  const label = config?.label ?? state.charAt(0).toUpperCase() + state.slice(1);

  return (
    <Badge variant={variant} className={cn(stateClassName, className)}>
      {label}
    </Badge>
  );
}
