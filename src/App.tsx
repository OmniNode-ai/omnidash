import { lazy, Suspense } from 'react';
import { FrameLayout } from './components/frame/FrameLayout';
import { Header } from './components/frame/Header';
import { DashboardView } from './pages/DashboardView';
import { FeatureFlagDashboard } from './pages/FeatureFlagDashboard';
import { InstructionEvalPage } from './pages/InstructionEvalPage';
import { AgentOrchestrator } from './agent/AgentOrchestrator';
import { useFrameStore } from './store/store';
import { CommandPalette, useCommandPalette } from './components/dashboard/command-dispatch/CommandPalette';
import type { AppPage } from './store/types';

// OMN-12943 — ported event-dash views, lazily loaded so they add zero weight to
// the default dashboard bundle. Existing static page imports above are untouched.
const DelegationEvidencePage = lazy(() =>
  import('./pages/DelegationEvidencePage').then((m) => ({ default: m.DelegationEvidencePage })),
);
const EventBusPage = lazy(() => import('./pages/EventBusPage').then((m) => ({ default: m.EventBusPage })));
const ExperimentsPage = lazy(() => import('./pages/ExperimentsPage').then((m) => ({ default: m.ExperimentsPage })));
const SeaControlPage = lazy(() => import('./pages/SeaControlPage').then((m) => ({ default: m.SeaControlPage })));

function PageContent({ page }: { page: AppPage }) {
  switch (page) {
    case 'feature-flags': return <FeatureFlagDashboard />;
    case 'eval':    return <InstructionEvalPage />;
    // OMN-12943 — additive route arms; existing arms + default untouched.
    case 'delegation-evidence': return <Suspense fallback={null}><DelegationEvidencePage /></Suspense>;
    case 'event-bus':           return <Suspense fallback={null}><EventBusPage /></Suspense>;
    case 'experiments':         return <Suspense fallback={null}><ExperimentsPage /></Suspense>;
    case 'sea-control':         return <Suspense fallback={null}><SeaControlPage /></Suspense>;
    default:        return <DashboardView />;
  }
}

export function App() {
  const activePage = useFrameStore((s) => s.activePage);
  const { isOpen, close } = useCommandPalette();

  return (
    <>
      <FrameLayout>
        <Header />
        <PageContent page={activePage} />
      </FrameLayout>
      <AgentOrchestrator />
      {isOpen && <CommandPalette onClose={close} />}
    </>
  );
}
