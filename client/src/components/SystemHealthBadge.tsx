/**
 * SystemHealthBadge Component
 *
 * Displays an at-a-glance health status indicator for a system or dashboard.
 * Shows HEALTHY (green), WARNING (yellow), CRITICAL (red), or UNKNOWN (gray)
 * based on the provided health data.
 *
 * @module components/SystemHealthBadge
 */

import { cn } from '@/lib/utils';
import { type SemanticHealthLevel } from '@/lib/health-utils';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';

/**
 * Health status level - re-exported from centralized health-utils for backward compatibility
 * @deprecated Use SemanticHealthLevel from @/lib/health-utils directly
 */
export type HealthLevel = SemanticHealthLevel;

/**
 * Props for the SystemHealthBadge component.
 */
export interface SystemHealthBadgeProps {
  /** The health level to display */
  status: SemanticHealthLevel;
  /** Optional tooltip/title text */
  title?: string;
  /** Optional className for additional styling */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

/**
 * Configuration for each health status level
 */
const STATUS_CONFIG: Record<
  SemanticHealthLevel,
  {
    label: string;
    icon: typeof CheckCircle2;
    containerClass: string;
    iconClass: string;
  }
> = {
  healthy: {
    label: 'HEALTHY',
    icon: CheckCircle2,
    containerClass:
      'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    iconClass: 'text-emerald-500',
  },
  warning: {
    label: 'WARNING',
    icon: AlertTriangle,
    containerClass: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400',
    iconClass: 'text-amber-500',
  },
  critical: {
    label: 'CRITICAL',
    icon: XCircle,
    containerClass: 'bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400',
    iconClass: 'text-red-500',
  },
  unknown: {
    label: 'UNKNOWN',
    icon: HelpCircle,
    containerClass: 'bg-gray-500/15 border-gray-500/30 text-gray-600 dark:text-gray-400',
    iconClass: 'text-gray-500',
  },
};

/**
 * A prominent health status badge for dashboard headers.
 *
 * Designed to immediately answer "Is the system healthy?" at a glance.
 * Uses semantic colors and clear labels for instant comprehension.
 *
 * @example
 * ```tsx
 * // Healthy system
 * <SystemHealthBadge status="healthy" />
 *
 * // System with warnings
 * <SystemHealthBadge status="warning" title="2 instances in warning state" />
 *
 * // Critical system state
 * <SystemHealthBadge status="critical" title="3 nodes failed" />
 * ```
 */
export function SystemHealthBadge({
  status,
  title,
  className,
  size = 'md',
}: SystemHealthBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-sm gap-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border font-semibold',
        sizeClasses[size],
        config.containerClass,
        className
      )}
      title={title}
    >
      <Icon className={cn(iconSizes[size], config.iconClass)} />
      <span>{config.label}</span>
    </div>
  );
}

/**
 * Calculate the overall health level from registry discovery data.
 *
 * Health calculation logic:
 * - CRITICAL: Any failed nodes OR critical health instances
 * - WARNING: Any pending nodes OR warning health instances (but no failed/critical)
 * - HEALTHY: All other cases (no failed, no pending, all good)
 *
 * @param data Health data containing node counts and health status
 * @returns The calculated health level
 */
export function calculateHealthLevel(data: {
  failed_nodes: number;
  pending_nodes: number;
  by_health?: {
    critical?: number;
    warning?: number;
  };
}): SemanticHealthLevel {
  // Extract values with safe defaults for missing/undefined properties
  const failedNodes = data.failed_nodes ?? 0;
  const pendingNodes = data.pending_nodes ?? 0;
  const criticalHealth = data.by_health?.critical ?? 0;
  const warningHealth = data.by_health?.warning ?? 0;

  // Critical: any failed nodes or critical health status
  if (failedNodes > 0 || criticalHealth > 0) {
    return 'critical';
  }

  // Warning: any pending nodes or warning health status (but no critical)
  if (pendingNodes > 0 || warningHealth > 0) {
    return 'warning';
  }

  // Healthy: no issues detected
  return 'healthy';
}

/**
 * Generate a descriptive tooltip for the health status.
 *
 * @param data Health data for generating the description
 * @param status The calculated health level
 * @returns A human-readable description of the health status
 */
export function getHealthTooltip(
  data: {
    total_nodes: number;
    active_nodes: number;
    failed_nodes: number;
    pending_nodes: number;
    by_health: {
      passing: number;
      warning: number;
      critical: number;
    };
  },
  status: SemanticHealthLevel
): string {
  const parts: string[] = [];

  if (status === 'critical') {
    if (data.failed_nodes > 0) {
      parts.push(`${data.failed_nodes} failed node${data.failed_nodes === 1 ? '' : 's'}`);
    }
    if (data.by_health.critical > 0) {
      parts.push(
        `${data.by_health.critical} critical instance${data.by_health.critical === 1 ? '' : 's'}`
      );
    }
  } else if (status === 'warning') {
    if (data.pending_nodes > 0) {
      parts.push(`${data.pending_nodes} pending node${data.pending_nodes === 1 ? '' : 's'}`);
    }
    if (data.by_health.warning > 0) {
      parts.push(
        `${data.by_health.warning} warning instance${data.by_health.warning === 1 ? '' : 's'}`
      );
    }
  } else if (status === 'unknown') {
    parts.push('Health status unavailable');
  } else {
    // healthy
    parts.push(`${data.active_nodes} of ${data.total_nodes} nodes active`);
    if (data.by_health.passing > 0) {
      parts.push(
        `${data.by_health.passing} instance${data.by_health.passing === 1 ? '' : 's'} passing`
      );
    }
  }

  return parts.join(', ');
}
