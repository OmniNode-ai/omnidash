// Agent Registry Data Source
export interface AgentDefinition {
  id: string;
  name: string;
  description?: string;
  category?: string;
  [key: string]: any;
}

interface AgentRegistryData {
  agents: AgentDefinition[];
  categories: string[];
  performance: any;
  routing: any;
  isMock: boolean;
}

class AgentRegistrySource {
  async fetchAgents(filters?: { category?: string; search?: string }): Promise<{ data: AgentDefinition[]; isMock: boolean }> {
    // First try to get active agents with performance data from intelligence API
    try {
      const response = await fetch(`/api/intelligence/agents/summary?timeWindow=24h`);
      if (response.ok) {
        const performanceData = await response.json();
        if (Array.isArray(performanceData) && performanceData.length > 0) {
          // Transform performance data into agent definitions
          const agents: AgentDefinition[] = performanceData.map((agent: any) => ({
            id: agent.agent || 'unknown',
            name: agent.agent || 'Unknown Agent',
            title: agent.agent?.replace('agent-', '').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Unknown Agent',
            description: `Active agent with ${agent.totalRequests || 0} requests`,
            category: this.inferCategory(agent.agent || ''),
            status: 'active',
            color: this.inferColor(this.inferCategory(agent.agent || '')),
            priority: 'medium' as const,
            capabilities: [],
            activationTriggers: [],
            domainContext: '',
            specializationLevel: 'specialist' as const,
            performance: {
              totalRuns: agent.totalRequests || 0,
              successRate: Math.max(0, Math.min(100, ((agent.successRate || agent.avgConfidence || 0) <= 1
                ? (agent.successRate || agent.avgConfidence || 0) * 100
                : (agent.successRate || agent.avgConfidence || 0)))),
              avgExecutionTime: (agent.avgRoutingTime || 0) / 1000,
              avgQualityScore: (agent.avgConfidence || 0) * 10,
              lastUsed: agent.lastSeen || new Date().toISOString(),
              popularity: agent.totalRequests || 0,
              efficiency: Math.max(0, Math.min(100, ((agent.successRate || agent.avgConfidence || 0) <= 1
                ? (agent.successRate || agent.avgConfidence || 0) * 100
                : (agent.successRate || agent.avgConfidence || 0)))),
            },
            lastUpdated: agent.lastSeen || new Date().toISOString(),
            version: '1.0.0',
            dependencies: [],
            tags: [],
          }));

          // Apply filters
          let filtered = agents;
          if (filters?.category && filters.category !== 'all') {
            filtered = filtered.filter(a => a.category === filters.category);
          }
          if (filters?.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(a => 
              a.name.toLowerCase().includes(searchLower) ||
              a.title.toLowerCase().includes(searchLower) ||
              (a.description && a.description.toLowerCase().includes(searchLower))
            );
          }

          return { data: filtered, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch from intelligence API, trying registry API', err);
    }

    // Fallback to static registry API
    try {
      const params = new URLSearchParams();
      if (filters?.category && filters.category !== 'all') params.append('category', filters.category);
      if (filters?.search) params.append('search', filters.search);
      
      const response = await fetch(`/api/agents/agents?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch agents, using mock data', err);
    }

    return {
      data: [],
      isMock: true,
    };
  }

  private inferCategory(agentName: string): string {
    const name = agentName.toLowerCase();
    if (name.includes('test') || name.includes('qa') || name.includes('quality')) return 'quality';
    if (name.includes('architect') || name.includes('design') || name.includes('architecture')) return 'architecture';
    if (name.includes('deploy') || name.includes('infrastructure') || name.includes('devops') || name.includes('server')) return 'infrastructure';
    if (name.includes('coordinator') || name.includes('workflow') || name.includes('polymorphic')) return 'coordination';
    if (name.includes('doc') || name.includes('knowledge') || name.includes('book')) return 'documentation';
    return 'development';
  }

  private inferColor(category: string): string {
    switch (category) {
      case 'development': return 'blue';
      case 'architecture': return 'purple';
      case 'quality': return 'green';
      case 'infrastructure': return 'orange';
      case 'coordination': return 'cyan';
      case 'documentation': return 'gray';
      default: return 'blue';
    }
  }

  async fetchCategories(): Promise<{ data: string[]; isMock: boolean }> {
    try {
      const response = await fetch('/api/agents/categories');
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch categories, using mock data', err);
    }

    return {
      data: ['Code Generation', 'Code Review', 'Testing', 'Documentation'],
      isMock: true,
    };
  }

  async fetchPerformance(): Promise<{ data: any; isMock: boolean }> {
    try {
      const response = await fetch('/api/agents/performance');
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch performance, using mock data', err);
    }

    return {
      data: {},
      isMock: true,
    };
  }

  async fetchRouting(): Promise<{ data: any; isMock: boolean }> {
    try {
      const response = await fetch('/api/agents/routing');
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch routing, using mock data', err);
    }

    return {
      data: {},
      isMock: true,
    };
  }

  async fetchAll(filters?: { category?: string; search?: string }): Promise<AgentRegistryData> {
    const [agents, categories, performance, routing] = await Promise.all([
      this.fetchAgents(filters),
      this.fetchCategories(),
      this.fetchPerformance(),
      this.fetchRouting(),
    ]);

    return {
      agents: agents.data,
      categories: categories.data,
      performance: performance.data,
      routing: routing.data,
      isMock: agents.isMock || categories.isMock || performance.isMock || routing.isMock,
    };
  }
}

export const agentRegistrySource = new AgentRegistrySource();

