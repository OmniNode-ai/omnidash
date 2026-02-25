import { Badge } from '@/components/ui/badge';
import { CheckCircle2, FileEdit, Shield, Archive, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContractStatus } from './models/types';

interface ContractStatusBadgeProps {
  status: ContractStatus;
  className?: string;
}

const statusConfig: Record<
  ContractStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    colors: string;
  }
> = {
  draft: {
    label: 'Draft',
    icon: FileEdit,
    colors: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
  },
  validated: {
    label: 'Validated',
    icon: Shield,
    colors: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  published: {
    label: 'Published',
    icon: CheckCircle2,
    colors: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  },
  deprecated: {
    label: 'Deprecated',
    icon: AlertTriangle,
    colors: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  },
  archived: {
    label: 'Archived',
    icon: Archive,
    colors: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  },
};

export function ContractStatusBadge({ status, className }: ContractStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn('text-xs font-medium', config.colors, className)}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}
