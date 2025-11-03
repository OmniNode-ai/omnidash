// Agent Network Data Source
export interface Agent {
  id: string;
  name: string;
  category?: string;
  description?: string;
}

export interface RoutingDecision {
  fromAgent?: string;
  toAgent: string;
  confidence?: number;
  reason?: string;
}

interface AgentNetworkData {
  agents: Agent[];
  routingDecisions: RoutingDecision[];
  isMock: boolean;
}

class AgentNetworkSource {
  async fetchAgents(): Promise<{ data: Agent[]; isMock: boolean }> {
    try {
      const response = await fetch('/api/agents/agents');
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch agents, using mock data', err);
    }

    return {
      data: [
        { id: 'polymorphic-agent', name: 'Polymorphic Agent', category: 'Code Generation' },
        { id: 'code-reviewer', name: 'Code Reviewer', category: 'Review' },
        { id: 'test-generator', name: 'Test Generator', category: 'Testing' },
        { id: 'documentation-agent', name: 'Documentation Agent', category: 'Docs' },
      ],
      isMock: true,
    };
  }

  async fetchRoutingDecisions(): Promise<{ data: RoutingDecision[]; isMock: boolean }> {
    try {
      const response = await fetch('/api/agents/routing');
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch routing decisions, using mock data', err);
    }

    return {
      data: [],
      isMock: true,
    };
  }

  async fetchAll(): Promise<AgentNetworkData> {
    const [agents, routing] = await Promise.all([
      this.fetchAgents(),
      this.fetchRoutingDecisions(),
    ]);

    return {
      agents: agents.data,
      routingDecisions: routing.data,
      isMock: agents.isMock || routing.isMock,
    };
  }
}

export const agentNetworkSource = new AgentNetworkSource();


