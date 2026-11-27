import type { AppPage } from '@/store/types';

/** One canonical URL for every existing top-level page. */
export const PAGE_PATHS: Record<AppPage, string> = {
  'local-overview': '/overview',
  'local-runs': '/runs',
  'local-workflow': '/workflow',
  'local-usage': '/usage',
  'local-settings': '/settings',
  dashboard: '/dashboard',
  'delegation-evidence': '/delegation-evidence',
  'event-bus': '/event-bus',
  experiments: '/experiments',
  'sea-control': '/agent-workbench',
  lab: '/lab',
  'feature-flags': '/feature-flags',
  eval: '/instruction-eval',
};

// OMN-26665 AC1: the Overview window (`window=7d` or `day=...`) this tab last showed. In memory only, so a fresh tab
// opens on all time. Every way back to Overview (sidebar, palette, "Go to Overview") reads it through `pagePath`.
let overviewWindowSearch = '';

/** Record the Overview's current address query; only its window or day is kept, and none means all time. */
export function rememberOverviewWindow(search: string): void {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  const window = params.get('window');
  const day = params.get('day');
  if (window !== null && day === null) kept.set('window', window);
  else if (day !== null && window === null) kept.set('day', day);
  overviewWindowSearch = kept.toString();
}

export function resetOverviewWindowMemory(): void { overviewWindowSearch = ''; }

/** The address that opens a page: Overview carries its remembered window, every other page is its canonical path. */
export function pagePath(page: AppPage): string {
  return page === 'local-overview' && overviewWindowSearch !== '' ? `${PAGE_PATHS[page]}?${overviewWindowSearch}` : PAGE_PATHS[page];
}

export function pageForPath(path: string): AppPage | null {
  const canonical = path.replace(/\/+$/, '') || '/';
  if (canonical === '/') return 'local-overview';
  return (Object.entries(PAGE_PATHS).find(([, value]) => value === canonical)?.[0] as AppPage | undefined) ?? null;
}

export const PAGE_LABELS: Record<AppPage, string> = {
  'local-overview': 'Overview', 'local-runs': 'Runs', 'local-workflow': 'Workflow',
  'local-usage': 'Usage', 'local-settings': 'Settings',
  dashboard: 'Dashboards', 'delegation-evidence': 'Delegation Evidence', 'event-bus': 'Event Bus',
  experiments: 'Experimentation', 'sea-control': 'Agent Workbench', lab: 'Lab',
  'feature-flags': 'Feature Flags', eval: 'Instruction Eval',
};
