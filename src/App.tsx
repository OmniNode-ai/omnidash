import { FrameLayout } from './components/frame/FrameLayout';
import { Header } from './components/frame/Header';
import { DashboardView } from './pages/DashboardView';
import { FeatureFlagDashboard } from './pages/FeatureFlagDashboard';
import { TraceExplorerPage } from './pages/TraceExplorerPage';
import { SessionReplayPage } from './pages/SessionReplayPage';
import { SandboxMonitorPage } from './pages/SandboxMonitorPage';
import { VoiceSessionPage } from './pages/VoiceSessionPage';
import { AgentOrchestrator } from './agent/AgentOrchestrator';
import { useFrameStore } from './store/store';
import { CommandPalette, useCommandPalette } from './components/dashboard/command-dispatch/CommandPalette';
import type { AppPage } from './store/types';

function PageContent({ page }: { page: AppPage }) {
  switch (page) {
    case 'feature-flags': return <FeatureFlagDashboard />;
    case 'trace':   return <TraceExplorerPage />;
    case 'replay':  return <SessionReplayPage />;
    case 'sandbox': return <SandboxMonitorPage />;
    case 'voice':   return <VoiceSessionPage />;
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
