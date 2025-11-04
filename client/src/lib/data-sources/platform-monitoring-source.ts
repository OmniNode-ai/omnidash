// Platform Monitoring Data Source
export interface SystemStatus {
  overall: "healthy" | "degraded" | "critical";
  services: ServiceStatus[];
  uptime: number;
  lastIncident: string;
  responseTime: number;
}

export interface ServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "critical" | "maintenance";
  uptime: number;
  responseTime: number;
  lastCheck: string;
  dependencies: string[];
}

export interface DeveloperMetrics {
  totalDevelopers: number;
  activeDevelopers: number;
  avgCommitsPerDay: number;
  avgPullRequestsPerDay: number;
  avgCodeReviewTime: number;
  avgDeploymentTime: number;
  codeQualityScore: number;
  testCoverage: number;
  bugResolutionTime: number;
}

export interface Incident {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved" | "closed";
  affectedServices: string[];
  startTime: string;
  endTime?: string;
  description: string;
  assignee?: string;
}

interface PlatformMonitoringData {
  systemStatus: SystemStatus;
  developerMetrics: DeveloperMetrics;
  incidents: Incident[];
  isMock: boolean;
}

class PlatformMonitoringSource {
  async fetchSystemStatus(timeRange: string): Promise<{ data: SystemStatus; isMock: boolean }> {
    try {
      const response = await fetch(`/api/health/status?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch system status, using mock data', err);
    }

    // Mock fallback with realistic service data
    return {
      data: {
        overall: 'healthy',
        uptime: 99.9,
        lastIncident: new Date(Date.now() - 86400000).toISOString(),
        responseTime: 145,
        services: [
          { name: 'API Gateway', status: 'healthy', uptime: 99.95, responseTime: 45, lastCheck: new Date().toISOString(), dependencies: [] },
          { name: 'Agent Service', status: 'healthy', uptime: 99.92, responseTime: 120, lastCheck: new Date().toISOString(), dependencies: ['PostgreSQL'] },
          { name: 'PostgreSQL', status: 'healthy', uptime: 99.98, responseTime: 12, lastCheck: new Date().toISOString(), dependencies: [] },
          { name: 'Qdrant', status: 'healthy', uptime: 99.88, responseTime: 23, lastCheck: new Date().toISOString(), dependencies: [] },
          { name: 'Intelligence Service', status: 'healthy', uptime: 99.85, responseTime: 180, lastCheck: new Date().toISOString(), dependencies: ['PostgreSQL', 'Qdrant'] },
          { name: 'Event Stream', status: 'healthy', uptime: 99.90, responseTime: 8, lastCheck: new Date().toISOString(), dependencies: [] },
        ]
      },
      isMock: true,
    };
  }

  async fetchDeveloperMetrics(timeRange: string): Promise<{ data: DeveloperMetrics; isMock: boolean }> {
    try {
      const response = await fetch(`/api/developer/metrics?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch developer metrics, using mock data', err);
    }

    // Mock fallback
    return {
      data: {
        totalDevelopers: 24,
        activeDevelopers: 18,
        avgCommitsPerDay: 12.5,
        avgPullRequestsPerDay: 4.2,
        avgCodeReviewTime: 4.5,
        avgDeploymentTime: 15,
        codeQualityScore: 85,
        testCoverage: 78,
        bugResolutionTime: 2.5,
      },
      isMock: true,
    };
  }

  async fetchIncidents(timeRange: string): Promise<{ data: Incident[]; isMock: boolean }> {
    try {
      const response = await fetch(`/api/incidents?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch incidents, using mock data', err);
    }

    // Fallback: Return mock incidents (1 closed + 1 open for credibility)
    return {
      data: [
        {
          id: 'inc-1',
          title: 'Database Connection Pool Exhaustion',
          severity: 'high',
          status: 'resolved',
          affectedServices: ['PostgreSQL', 'Qdrant'],
          startTime: new Date(Date.now() - 172800000).toISOString(),
          endTime: new Date(Date.now() - 86400000).toISOString(),
          description: 'Connection pool reached 95% capacity during peak load',
          assignee: 'DevOps Team'
        },
        {
          id: 'inc-2',
          title: 'Increased API Response Time',
          severity: 'medium',
          status: 'investigating',
          affectedServices: ['API Gateway', 'Agent Service'],
          startTime: new Date(Date.now() - 3600000).toISOString(),
          description: 'p95 latency increased from 1.2s to 2.5s across multiple endpoints',
          assignee: 'Platform Team'
        }
      ],
      isMock: true,
    };
  }

  async fetchAll(timeRange: string): Promise<PlatformMonitoringData> {
    const [systemStatus, developerMetrics, incidents] = await Promise.all([
      this.fetchSystemStatus(timeRange),
      this.fetchDeveloperMetrics(timeRange),
      this.fetchIncidents(timeRange),
    ]);

    return {
      systemStatus: systemStatus.data,
      developerMetrics: developerMetrics.data,
      incidents: incidents.data,
      isMock: systemStatus.isMock || developerMetrics.isMock || incidents.isMock,
    };
  }
}

export const platformMonitoringSource = new PlatformMonitoringSource();



