import { AgentStatusGrid } from '../AgentStatusGrid';

export default function AgentStatusGridExample() {
  //todo: remove mock functionality
  const agents = Array.from({ length: 12 }, (_, i) => ({
    id: `agent-${i + 1}`,
    name: `Agent ${i + 1}`,
    status: (["active", "idle", "error", "offline"] as const)[i % 4],
    currentTask: i % 3 === 0 ? `Analyzing codebase ${i + 1}` : undefined,
    successRate: 85 + Math.floor(Math.random() * 15),
    responseTime: 50 + Math.floor(Math.random() * 150),
  }));

  return (
    <div className="p-6">
      <AgentStatusGrid 
        agents={agents} 
        onAgentClick={(agent) => console.log('Agent clicked:', agent)}
      />
    </div>
  );
}
