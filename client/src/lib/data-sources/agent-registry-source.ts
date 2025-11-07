// Agent Registry Data Source
import { USE_MOCK_DATA, AgentRegistryMockData } from '../mock-data';
import type { RecentActivity } from '../mock-data/agent-registry-mock';

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

export type { RecentActivity };

class AgentRegistrySource {
  async fetchAgents(filters?: { category?: string; search?: string; status?: string }): Promise<{ data: AgentDefinition[]; isMock: boolean }> {
    // Use the full registry API which has all agents with proper status information
    try {
      const params = new URLSearchParams();
      if (filters?.category && filters.category !== 'all') params.append('category', filters.category);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.status && filters.status !== 'all') params.append('status', filters.status);

      const response = await fetch(`/api/agents/agents?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch agents from registry API', err);
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

  async fetchAll(filters?: { category?: string; search?: string; status?: string }): Promise<AgentRegistryData> {
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

  async fetchRecentActivity(limit: number = 20): Promise<{ data: RecentActivity[]; isMock: boolean }> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      const mockData = AgentRegistryMockData.generateRecentActivities(limit);
      return { data: mockData, isMock: true };
    }

    try {
      const response = await fetch(`/api/intelligence/actions/recent?limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch recent activity from API, using mock data', err);
    }

    // Fallback to mock data if API fails
    const mockData = AgentRegistryMockData.generateRecentActivities(limit);
    return { data: mockData, isMock: true };
  }
}

export const agentRegistrySource = new AgentRegistrySource();

