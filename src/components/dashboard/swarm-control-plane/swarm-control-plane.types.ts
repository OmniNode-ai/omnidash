import type { SwarmRunRow } from '@/services/swarm-api';

export type { SwarmRunRow };

export type SwarmRunStatus = 'succeeded' | 'failed' | 'running' | 'pending' | 'unknown';

export function normalizeStatus(raw: string): SwarmRunStatus {
  switch (raw?.toLowerCase()) {
    case 'succeeded': return 'succeeded';
    case 'failed': return 'failed';
    case 'running': return 'running';
    case 'pending': return 'pending';
    default: return 'unknown';
  }
}

export interface SwarmControlPlaneConfig {
  maxRuns?: number;
}
