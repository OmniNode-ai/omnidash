import { FrameLayout } from './components/frame/FrameLayout';
import { Header } from './components/frame/Header';
import { DashboardView } from './pages/DashboardView';
import { FeatureFlagDashboard } from './pages/FeatureFlagDashboard';
import { AgentOrchestrator } from './agent/AgentOrchestrator';
import { useFrameStore } from './store/store';

export function App() {
  const activePage = useFrameStore((s) => s.activePage);

  return (
    <>
      <FrameLayout>
        <Header />
        {activePage === 'feature-flags' ? <FeatureFlagDashboard /> : <DashboardView />}
      </FrameLayout>
      <AgentOrchestrator />
    </>
  );
}
