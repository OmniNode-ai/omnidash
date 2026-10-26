import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { FrameLayout } from './components/frame/FrameLayout';
import { Header } from './components/frame/Header';
import { useFrameStore } from './store/store';
import { CommandPalette, useCommandPalette } from './components/dashboard/command-dispatch/CommandPalette';
import type { AppPage } from './store/types';
import { LocalDashboardPage, type LocalDashboardCache } from './pages/LocalDashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { DestinationIcon } from './navigation/destination-icons';
import { PAGE_LABELS, PAGE_PATHS, pageForPath } from './navigation/page-routes';

// Deferred destinations must not delay the six local pages at startup.
const DashboardView = lazy(() => import('./pages/DashboardView').then(module => ({ default: module.DashboardView })));
const FeatureFlagDashboard = lazy(() => import('./pages/FeatureFlagDashboard').then(module => ({ default: module.FeatureFlagDashboard })));
const InstructionEvalPage = lazy(() => import('./pages/InstructionEvalPage').then(module => ({ default: module.InstructionEvalPage })));

// OMN-12943 — ported event-dash views, lazily loaded so they add zero weight to
// the default dashboard bundle. Existing static page imports above are untouched.
const DelegationEvidencePage = lazy(() =>
  import('./pages/DelegationEvidencePage').then((m) => ({ default: m.DelegationEvidencePage })),
);
const EventBusPage = lazy(() => import('./pages/EventBusPage').then((m) => ({ default: m.EventBusPage })));
const ExperimentsPage = lazy(() => import('./pages/ExperimentsPage').then((m) => ({ default: m.ExperimentsPage })));
const SeaControlPage = lazy(() => import('./pages/SeaControlPage').then((m) => ({ default: m.SeaControlPage })));
// OMN-18771 — Lab observability tab (C4), lazily loaded on the same seam.
const LabPage = lazy(() => import('./pages/LabPage').then((m) => ({ default: m.LabPage })));

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
    case 'local-overview':      return <LocalDashboardPage pageName="overview" navigationCache={navigationCache} />;
    case 'local-runs':          return <LocalDashboardPage pageName="runs" syncUrl navigationCache={navigationCache} />;
    case 'local-workflow':      return <LocalDashboardPage pageName="workflow" syncUrl navigationCache={navigationCache} />;
    case 'local-usage':         return <LocalDashboardPage pageName="usage" navigationCache={navigationCache} />;
    case 'local-settings':      return <SettingsPage navigationCache={navigationCache} />;
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
