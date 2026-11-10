import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { FrameLayout } from './components/frame/FrameLayout';
import { Header } from './components/frame/Header';
import { useFrameStore } from './store/store';
import { CommandPalette, useCommandPalette } from './components/dashboard/command-dispatch/CommandPalette';
import type { AppPage } from './store/types';
import type { LocalDashboardCache } from './pages/LocalDashboardPage';
// OMN-23330 AC22: the local pages' code loads lazily, but these stylesheets also style the app frame (sidebar, top bar),
// so they stay in the entry, in the order the pages imported them, until AC23 moves the frame's rules out of them.
import '@/theme/design-system/kit/local-dashboard.css';
import '@/styles/local-dashboard.css';
import '@/theme/design-system/kit/dashboard-cards.css';
import '@/styles/dashboard-cards.css';
import '@/theme/design-system/kit/seven-page-design.css';
import '@/styles/seven-page-design.css';
import '@/theme/design-system/kit/editorial.css';
import '@/styles/editorial.css';
import { DestinationIcon } from './navigation/destination-icons';
import { PAGE_LABELS, PAGE_PATHS, pageForPath } from './navigation/page-routes';

// Deferred destinations must not delay the six local pages at startup.
// OMN-23330 AC22: the local pages and Settings load with their own bundle too, so the entry carries none of their code
// (charts, echarts, stylesheets); the entry was 1.43 MB (428 KB gzipped) with them.
const LocalDashboardPage = lazy(() => import('./pages/LocalDashboardPage').then(module => ({ default: module.LocalDashboardPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })));
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
