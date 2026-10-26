import { Activity, BadgeCheck, Blocks, ChartColumn, FlaskConical, Gauge, KeyRound, LayoutDashboard, LockKeyhole, Radio, Settings, Workflow, type LucideIcon } from 'lucide-react';
import type { AppPage } from '@/store/types';
import { PAGE_LABELS } from './page-routes';
import '@/styles/destination-identity.css';

/** One destination identity for sidebar entries and page headers. */
export const DESTINATION_ICONS: Partial<Record<AppPage, LucideIcon>> = {
  'local-overview': LayoutDashboard,
  'local-runs': Activity,
  'local-workflow': Workflow,
  'local-usage': ChartColumn,
  'local-settings': Settings,
  'delegation-evidence': BadgeCheck,
  experiments: FlaskConical,
  'sea-control': Blocks,
  'event-bus': Radio,
  lab: Gauge,
};
/** OMN-21166 part 26: the Settings sections keep the icons their pages had. */
export const SETTINGS_SECTION_ICONS = { 'api-keys': LockKeyhole, credentials: KeyRound } as const satisfies Record<string, LucideIcon>;
export function DestinationIcon({ page, size = 16 }: { page: AppPage; size?: number }) {
  const Icon = DESTINATION_ICONS[page];
  return Icon ? <Icon className="destination-icon" data-destination={page}
    data-semantic-concept={`destination:${page}`} data-semantic-label={PAGE_LABELS[page]}
    size={size} aria-hidden="true" /> : null;
}
