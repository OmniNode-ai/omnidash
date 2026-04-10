import { FrameLayout } from './components/frame/FrameLayout';
import { DashboardBuilder } from './pages/DashboardBuilder';
import { AgentOrchestrator } from './agent/AgentOrchestrator';

export function App() {
  return (
    <>
      <FrameLayout>
        <DashboardBuilder />
      </FrameLayout>
      <AgentOrchestrator />
    </>
  );
}
