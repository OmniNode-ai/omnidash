import { Badge } from '@/components/ui/badge';
import { Workflow, Zap, Database, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContractType } from './models/types';

interface ContractTypeBadgeProps {
  type: ContractType;
  className?: string;
}

const typeConfig: Record<
  ContractType,
  {
    label: string;
    icon: typeof Workflow;
    colors: string;
  }
> = {
  orchestrator: {
    label: 'Orchestrator',
    icon: Workflow,
    colors: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  },
  effect: {
    label: 'Effect',
    icon: Zap,
    colors: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  },
  reducer: {
    label: 'Reducer',
    icon: Database,
    colors: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  },
  compute: {
    label: 'Compute',
    icon: Cpu,
    colors: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
};

export function ContractTypeBadge({ type, className }: ContractTypeBadgeProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn('text-xs font-medium', config.colors, className)}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}
