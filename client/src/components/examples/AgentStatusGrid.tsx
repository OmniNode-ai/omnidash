import { AgentStatusGrid } from '../AgentStatusGrid';

interface Agent {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'error' | 'offline';
  currentTask?: string;
  successRate: number;
  responseTime: number;
}

export default function AgentStatusGridExample() {
  //todo: remove mock functionality
  const agents: Agent[] = Array.from({ length: 12 }, (_, i) => ({
    id: `agent-${i + 1}`,
    name: `Agent ${i + 1}`,
    status: (['active', 'idle', 'error', 'offline'] as const)[i % 4],
    currentTask: i % 3 === 0 ? `Analyzing codebase ${i + 1}` : undefined,
    successRate: 85 + Math.floor(Math.random() * 15),
    responseTime: 50 + Math.floor(Math.random() * 150),
  }));

  const handleAgentClick = (agent: Agent) => {
    // Agent clicked - implement handler logic here
    void agent; // Prevent unused variable warning
  };

  return (
    <div className="p-6">
      <AgentStatusGrid agents={agents} onAgentClick={handleAgentClick} />
    </div>
  );
}
