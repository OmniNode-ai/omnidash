/**
 * OMN-19993: how each status severity renders. Mirrors the default
 * `severity_roles` of omnibase_core's `ModelWidgetConfigStatusGrid`: every
 * severity has its own word and its own icon, so a status is never color alone.
 * The edge is the only colored part, and it comes from the theme tokens.
 *
 * Core names `question-diamond` for unknown; lucide-react has no such icon, so
 * `circle-help` stands in. It is still distinct from the other three.
 */
import { CircleCheck, CircleHelp, OctagonX, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { StatusGridSeverity } from '@shared/types/component-manifest';

export interface SeverityRole {
  label: string;
  iconName: string;
  Icon: LucideIcon;
  /** CSS color for the left edge: a theme token, never a literal color. */
  edge: string;
  /** Text color for the word. */
  textColor: 'ok' | 'warn' | 'bad' | 'secondary';
}

export const SEVERITY_ROLES: Record<StatusGridSeverity, SeverityRole> = {
  critical: { label: 'Critical', iconName: 'octagon-x', Icon: OctagonX, edge: 'var(--status-bad)', textColor: 'bad' },
  attention: { label: 'Attention', iconName: 'triangle-alert', Icon: TriangleAlert, edge: 'var(--status-warn)', textColor: 'warn' },
  unknown: { label: 'Unknown', iconName: 'circle-help', Icon: CircleHelp, edge: 'var(--text-tertiary)', textColor: 'secondary' },
  nominal: { label: 'Nominal', iconName: 'check-circle', Icon: CircleCheck, edge: 'var(--status-ok)', textColor: 'ok' },
};

/** Worst first, the order a reader scans for trouble. */
export const SEVERITY_ORDER: readonly StatusGridSeverity[] = ['critical', 'attention', 'unknown', 'nominal'];

export function SeverityIcon({ severity, size = 14 }: { severity: StatusGridSeverity; size?: number }) {
  const role = SEVERITY_ROLES[severity];
  const { Icon } = role;
  return <Icon size={size} strokeWidth={2} aria-hidden="true" data-icon={role.iconName} />;
}
