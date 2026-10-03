import type { AppPage } from '@/store/types';

/** One canonical URL for every existing top-level page. */
export const PAGE_PATHS: Record<AppPage, string> = {
  'local-overview': '/overview',
  'local-runs': '/runs',
  'local-workflow': '/workflow',
  'local-usage': '/usage',
  'local-credentials': '/credentials',
  'local-api-keys': '/api-keys',
  dashboard: '/dashboard',
  'delegation-evidence': '/delegation-evidence',
  'event-bus': '/event-bus',
  experiments: '/experiments',
  'sea-control': '/agent-workbench',
  lab: '/lab',
  'feature-flags': '/feature-flags',
  eval: '/instruction-eval',
};

export function pageForPath(path: string): AppPage | null {
  const canonical = path.replace(/\/+$/, '') || '/';
  if (canonical === '/') return 'local-overview';
  return (Object.entries(PAGE_PATHS).find(([, value]) => value === canonical)?.[0] as AppPage | undefined) ?? null;
}

export const PAGE_LABELS: Record<AppPage, string> = {
  'local-overview': 'Overview', 'local-runs': 'Runs', 'local-workflow': 'Workflow',
  'local-usage': 'Usage', 'local-credentials': 'Credentials', 'local-api-keys': 'API Keys',
  dashboard: 'Dashboards', 'delegation-evidence': 'Delegation Evidence', 'event-bus': 'Event Bus',
  experiments: 'Experimentation', 'sea-control': 'Agent Workbench', lab: 'Lab',
  'feature-flags': 'Feature Flags', eval: 'Instruction Eval',
};
