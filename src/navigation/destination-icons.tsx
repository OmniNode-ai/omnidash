import { Activity, BadgeCheck, Blocks, ChartColumn, FlaskConical, Gauge, KeyRound, LayoutDashboard, LockKeyhole, Radio, Workflow, type LucideIcon } from 'lucide-react';
import type { AppPage } from '@/store/types';
import '@/styles/destination-identity.css';

/** One destination identity for sidebar entries and page headers. */
const ICONS: Partial<Record<AppPage, LucideIcon>> = {
  'local-overview': LayoutDashboard,
  'local-runs': Activity,
  'local-workflow': Workflow,
  'local-usage': ChartColumn,
  'local-credentials': KeyRound,
  'local-api-keys': LockKeyhole,
  'delegation-evidence': BadgeCheck,
  experiments: FlaskConical,
  'sea-control': Blocks,
  'event-bus': Radio,
  lab: Gauge,
};
export function DestinationIcon({ page, size = 16 }: { page: AppPage; size?: number }) {
  const Icon = ICONS[page];
  return Icon ? <Icon size={size} aria-hidden="true" /> : null;
}
