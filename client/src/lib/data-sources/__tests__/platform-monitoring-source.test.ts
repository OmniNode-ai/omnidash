import { describe, it, expect, beforeEach, vi } from 'vitest';
import { platformMonitoringSource } from '../platform-monitoring-source';
import type { SystemStatus, DeveloperMetrics, Incident } from '../platform-monitoring-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('PlatformMonitoringSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchSystemStatus', () => {
    it('should return real system status', async () => {
      const mockSystemStatus: SystemStatus = {
        overall: 'healthy',
        uptime: 99.9,
        lastIncident: new Date().toISOString(),
        responseTime: 150,
        services: [
          { name: 'PostgreSQL', status: 'healthy', uptime: 100, responseTime: 20, lastCheck: new Date().toISOString(), dependencies: [] },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/health/status', createMockResponse(mockSystemStatus)],
        ])
      );

      const result = await platformMonitoringSource.fetchSystemStatus('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockSystemStatus);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/health', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformMonitoringSource.fetchSystemStatus('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.overall).toBeDefined();
    });
  });

  describe('fetchDeveloperMetrics', () => {
    it('should return real developer metrics', async () => {
      const mockMetrics: DeveloperMetrics = {
        avgCommitsPerDay: 25,
        avgPullRequestsPerDay: 5,
        avgCodeReviewTime: 2,
        avgDeploymentTime: 15,
      };

      setupFetchMock(
        new Map([
          ['/api/developer/metrics', createMockResponse(mockMetrics)],
        ])
      );

      const result = await platformMonitoringSource.fetchDeveloperMetrics('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockMetrics);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/metrics', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformMonitoringSource.fetchDeveloperMetrics('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.avgCommitsPerDay).toBeGreaterThan(0);
    });
  });

  describe('fetchIncidents', () => {
    it('should return real incidents', async () => {
      const mockIncidents: Incident[] = [
        {
          id: 'incident-1',
          title: 'Service Degradation',
          severity: 'high',
          status: 'open',
          affectedServices: ['PostgreSQL'],
          startTime: '2024-01-01T00:00:00Z',
          endTime: undefined,
          description: 'Test incident',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/incidents', createMockResponse(mockIncidents)],
        ])
      );

      const result = await platformMonitoringSource.fetchIncidents('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockIncidents);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/incidents', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformMonitoringSource.fetchIncidents('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  describe('fetchAll', () => {
    it('should combine all monitoring data', async () => {
      const mockSystemStatus: SystemStatus = {
        overall: 'healthy',
        uptime: 99.9,
        lastIncident: new Date().toISOString(),
        responseTime: 150,
        services: [],
      };
      const mockMetrics: DeveloperMetrics = {
        totalDevelopers: 10,
        activeDevelopers: 8,
        avgCommitsPerDay: 25,
        avgPullRequestsPerDay: 5,
        avgCodeReviewTime: 2,
        avgDeploymentTime: 15,
        codeQualityScore: 85,
        testCoverage: 80,
        bugResolutionTime: 4,
      };
      const mockIncidents: Incident[] = [];

      setupFetchMock(
        new Map([
          ['/api/health/status', createMockResponse(mockSystemStatus)],
          ['/api/developer/metrics', createMockResponse(mockMetrics)],
          ['/api/incidents', createMockResponse(mockIncidents)],
        ])
      );

      const result = await platformMonitoringSource.fetchAll('24h');

      expect(result.systemStatus).toEqual(mockSystemStatus);
      expect(result.developerMetrics).toEqual(mockMetrics);
      expect(result.incidents).toEqual(mockIncidents);
      expect(result.isMock).toBe(false);
    });

    it('should mark as mock if any source fails', async () => {
      const mockStatus: SystemStatus = {
        overall: 'healthy',
        uptime: 99.9,
        lastIncident: new Date().toISOString(),
        responseTime: 150,
        services: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/health', createMockResponse(mockStatus)],
          ['/api/developer/metrics', createMockResponse(null, { status: 500 })],
          ['/api/incidents', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await platformMonitoringSource.fetchAll('24h');

      expect(result.isMock).toBe(true);
    });
  });
});

