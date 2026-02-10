import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: LucideIcon;
  className?: string;
  status?: 'healthy' | 'warning' | 'error' | 'offline';
  tooltip?: string;
  subtitle?: string;
  isLoading?: boolean;
}

export function MetricCard({
  label,
  value,
  trend,
  icon: Icon,
  className,
  status,
  tooltip,
  subtitle,
  isLoading,
}: MetricCardProps) {
  const labelContent = (
    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
  );

  // Status-based card styling for visual differentiation
  // The colored left border is the primary status indicator
  // Background tint is very subtle (3%) to avoid visual heaviness
  const statusCardStyles = {
    healthy: 'border-l-4 border-l-status-healthy bg-status-healthy/[0.03]',
    warning: 'border-l-4 border-l-status-warning bg-status-warning/[0.03]',
    error: 'border-l-4 border-l-status-error bg-status-error/[0.03]',
    offline: 'border-l-4 border-l-status-offline bg-status-offline/[0.03]',
  };

  return (
    <Card
      className={cn('py-3 px-4', status && statusCardStyles[status], className)}
      data-testid={`card-metric-${label.toLowerCase().replace(/\s/g, '-')}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {tooltip ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>{labelContent}</TooltipTrigger>
                <TooltipContent>
                  <p>{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            labelContent
          )}
          {isLoading ? (
            <Skeleton className="h-7 w-20" />
          ) : (
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold font-mono">{value}</div>
              {trend && (
                <div
                  className={cn(
                    'text-xs font-medium',
                    trend.isPositive ? 'text-status-healthy' : 'text-status-error'
                  )}
                >
                  {trend.isPositive ? '+' : ''}
                  {trend.value}%
                </div>
              )}
            </div>
          )}
          {isLoading ? (
            <Skeleton className="h-3 w-32 mt-1" />
          ) : subtitle ? (
            <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{subtitle}</div>
          ) : null}
        </div>
        {Icon && (
          <div
            className={cn(
              'p-2 rounded-lg flex-shrink-0',
              status === 'healthy' && 'bg-status-healthy/10 text-status-healthy',
              status === 'warning' && 'bg-status-warning/10 text-status-warning',
              status === 'error' && 'bg-status-error/10 text-status-error',
              !status && 'bg-primary/10 text-primary'
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </Card>
  );
}
