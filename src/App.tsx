import { FrameLayout } from './components/frame/FrameLayout';
import { Header } from './components/frame/Header';
import { DashboardView } from './pages/DashboardView';
import { AgentOrchestrator } from './agent/AgentOrchestrator';

export function App() {
  return (
    <>
      <FrameLayout>
        <Header />
        <DashboardView />
      </FrameLayout>
      <AgentOrchestrator />
    </>
  );
}
