import { lazy, Suspense, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { FrameLayout } from './components/frame/FrameLayout';
import { Header } from './components/frame/Header';
import { DashboardView } from './pages/DashboardView';
import { FeatureFlagDashboard } from './pages/FeatureFlagDashboard';
import { InstructionEvalPage } from './pages/InstructionEvalPage';
import { AgentOrchestrator } from './agent/AgentOrchestrator';
import { useFrameStore } from './store/store';
import { CommandPalette, useCommandPalette } from './components/dashboard/command-dispatch/CommandPalette';
import type { AppPage } from './store/types';
import { LocalDashboardPage } from './pages/LocalDashboardPage';
import { PAGE_PATHS, pageForPath } from './navigation/page-routes';

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

function PageContent({ page }: { page: AppPage }) {
  switch (page) {
    case 'feature-flags': return <FeatureFlagDashboard />;
    case 'eval':    return <InstructionEvalPage />;
    // OMN-12943 — additive route arms; existing arms + default untouched.
    case 'delegation-evidence': return <Suspense fallback={null}><DelegationEvidencePage /></Suspense>;
    case 'event-bus':           return <Suspense fallback={null}><EventBusPage /></Suspense>;
    case 'experiments':         return <Suspense fallback={null}><ExperimentsPage /></Suspense>;
    case 'sea-control':         return <Suspense fallback={null}><SeaControlPage /></Suspense>;
    case 'lab':                 return <Suspense fallback={null}><LabPage /></Suspense>;
    case 'local-overview':      return <LocalDashboardPage pageName="overview" />;
    case 'local-runs':          return <LocalDashboardPage pageName="runs" syncUrl />;
    case 'local-workflow':      return <LocalDashboardPage pageName="workflow" />;
    case 'local-usage':         return <LocalDashboardPage pageName="usage" />;
    case 'local-credentials':   return <LocalDashboardPage pageName="credentials" />;
    case 'local-api-keys':      return <LocalDashboardPage pageName="api-keys" />;
    default:        return <DashboardView />;
  }
}

export function App() {
  const [location, navigate] = useLocation();
  const page = pageForPath(location);
  const { isOpen, close } = useCommandPalette();

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
        ) : <PageContent page={page} />}
      </FrameLayout>
      <AgentOrchestrator />
      {isOpen && <CommandPalette onClose={close} />}
    </>
  );
}
