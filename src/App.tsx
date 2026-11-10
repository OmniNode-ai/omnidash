import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { FrameLayout } from './components/frame/FrameLayout';
import { Header } from './components/frame/Header';
import { useFrameStore } from './store/store';
import { CommandPalette, useCommandPalette } from './components/dashboard/command-dispatch/CommandPalette';
import type { AppPage } from './store/types';
import type { LocalDashboardCache } from './pages/LocalDashboardPage';
// OMN-23330 AC23: the entry loads the app frame's rules (sidebar, top bar, app shell), in the order their page stylesheets
// had them; the page stylesheets themselves load with the pages that use them.
import '@/styles/frame/seven-page-design.css';
import '@/styles/frame/editorial.css';
import { DestinationIcon } from './navigation/destination-icons';
import { PAGE_LABELS, PAGE_PATHS, pageForPath } from './navigation/page-routes';

// Deferred destinations must not delay the six local pages at startup.
// OMN-23330 AC22: the local pages and Settings load with their own bundle too, so the entry carries none of their code
// (charts, echarts, stylesheets); the entry was 1.43 MB (428 KB gzipped) with them.
// OMN-23330 AC23: the page stylesheets load before a page's own chunk, so their links come ahead of the components'
// stylesheets, as when they were part of the entry (a page chunk alone linked them last, after Tooltip and DataTable).
const withPageSheets = <T,>(load: () => Promise<T>) => () => import('./theme/design-system/page-sheets').then(load);
const LocalDashboardPage = lazy(withPageSheets(() => import('./pages/LocalDashboardPage').then((m) => ({ default: m.LocalDashboardPage }))));
const SettingsPage = lazy(withPageSheets(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))));
const DashboardView = lazy(() => import('./pages/DashboardView').then(module => ({ default: module.DashboardView })));
const FeatureFlagDashboard = lazy(() => import('./pages/FeatureFlagDashboard').then(module => ({ default: module.FeatureFlagDashboard })));
const InstructionEvalPage = lazy(() => import('./pages/InstructionEvalPage').then(module => ({ default: module.InstructionEvalPage })));

// OMN-12943 — ported event-dash views, lazily loaded so they add zero weight to
// the default dashboard bundle. Existing static page imports above are untouched.
const DelegationEvidencePage = lazy(withPageSheets(() =>
  import('./pages/DelegationEvidencePage').then((m) => ({ default: m.DelegationEvidencePage })),
));
const EventBusPage = lazy(withPageSheets(() => import('./pages/EventBusPage').then((m) => ({ default: m.EventBusPage }))));
const ExperimentsPage = lazy(withPageSheets(() => import('./pages/ExperimentsPage').then((m) => ({ default: m.ExperimentsPage }))));
const SeaControlPage = lazy(withPageSheets(() => import('./pages/SeaControlPage').then((m) => ({ default: m.SeaControlPage }))));
// OMN-18771 — Lab observability tab (C4), lazily loaded on the same seam.
const LabPage = lazy(withPageSheets(() => import('./pages/LabPage').then((m) => ({ default: m.LabPage }))));

/** Keep the destination recognizable while its deferred bundle is loading. */
function LoadingPage({ page }: { page: AppPage }) {
  const title = PAGE_LABELS[page];
  return <main className="local-dashboard-page" data-destination={page} aria-label={`${title} page`} aria-busy="true">
    <header className="local-dashboard-header"><div className="local-dashboard-title"><span className="local-dashboard-page-icon" aria-hidden="true"><DestinationIcon page={page} size={20} /></span><div><h1>{title}</h1></div></div></header>
    <p className="local-page-loading" role="status">Loading {title}…</p>
  </main>;
}

function PageContent({ page, navigationCache }: { page: AppPage; navigationCache: LocalDashboardCache }) {
  switch (page) {
    case 'feature-flags': return <Suspense fallback={<LoadingPage page={page} />}><FeatureFlagDashboard /></Suspense>;
    case 'eval':    return <Suspense fallback={<LoadingPage page={page} />}><InstructionEvalPage /></Suspense>;
    // OMN-12943 — additive route arms; existing arms + default untouched.
    case 'delegation-evidence': return <Suspense fallback={<LoadingPage page={page} />}><DelegationEvidencePage /></Suspense>;
    case 'event-bus':           return <Suspense fallback={<LoadingPage page={page} />}><EventBusPage /></Suspense>;
    case 'experiments':         return <Suspense fallback={<LoadingPage page={page} />}><ExperimentsPage /></Suspense>;
    case 'sea-control':         return <Suspense fallback={<LoadingPage page={page} />}><SeaControlPage /></Suspense>;
    case 'lab':                 return <Suspense fallback={<LoadingPage page={page} />}><LabPage /></Suspense>;
    case 'local-overview':      return <Suspense fallback={<LoadingPage page={page} />}><LocalDashboardPage pageName="overview" navigationCache={navigationCache} /></Suspense>;
    case 'local-runs':          return <Suspense fallback={<LoadingPage page={page} />}><LocalDashboardPage pageName="runs" syncUrl navigationCache={navigationCache} /></Suspense>;
    case 'local-workflow':      return <Suspense fallback={<LoadingPage page={page} />}><LocalDashboardPage pageName="workflow" syncUrl navigationCache={navigationCache} /></Suspense>;
    case 'local-usage':         return <Suspense fallback={<LoadingPage page={page} />}><LocalDashboardPage pageName="usage" navigationCache={navigationCache} /></Suspense>;
    case 'local-settings':      return <Suspense fallback={<LoadingPage page={page} />}><SettingsPage navigationCache={navigationCache} /></Suspense>;
    default:        return <Suspense fallback={<LoadingPage page={page} />}><DashboardView /></Suspense>;
  }
}

export function App() {
  const [location, navigate] = useLocation();
  const page = pageForPath(location);
  const { isOpen, close } = useCommandPalette();
  const navigationCache = useRef<LocalDashboardCache>({ context: null, snapshots: new Map() });

  useEffect(() => { document.title = `${page === null ? 'Page not found' : PAGE_LABELS[page]} · OmniDash`; }, [page]);

  useEffect(() => {
    if (page === null) return;
    // URL owns navigation; the store mirrors it for existing command/workbench consumers.
    useFrameStore.setState({ activePage: page });
    if (location !== PAGE_PATHS[page]) {
      navigate(`${PAGE_PATHS[page]}${window.location.search}${window.location.hash}`, { replace: true });
    }
  }, [location, navigate, page]);

  return (
    <>
      <FrameLayout>
        <Header />
        {page === null ? (
          <main className="local-dashboard-page">
            <h1>Page not found</h1>
            <p>This URL does not match a dashboard page.</p>
            <Link href="/overview">Go to Overview</Link>
          </main>
        ) : <PageContent key={page} page={page} navigationCache={navigationCache.current} />}
      </FrameLayout>
      {/* Assistant deferred for MVP at composition: its hooks never mount. */}
      {isOpen && <CommandPalette onClose={close} />}
    </>
  );
}
