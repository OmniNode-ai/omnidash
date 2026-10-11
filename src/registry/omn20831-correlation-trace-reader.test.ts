// OMN-20831: the delegation control plane's Correlation Trace tab reads
// delegation.correlation-trace.v1 (DelegationCorrelationTracePanel -> fetchCorrelationTrace),
// so the component's manifest declares it. Without the declaration the omnibase_infra
// exposure-reader-coverage gate (OMN-17199) reports the bus-backed exposure as unread.
//
// Failure modes, each with a test below:
//   R1  the shipped manifest's delegation-control-plane names no correlation-trace dataSource;
//   R2  the panel stops reading the topic while the manifest still claims it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPICS } from '@shared/types/topics';
import type { RegistryManifest } from './types';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, './component-registry.json'), 'utf-8')) as RegistryManifest;
const TOPIC = 'onex.snapshot.projection.delegation.correlation-trace.v1';

describe('OMN-20831 correlation-trace reader declaration', () => {
  it('R1: delegation-control-plane declares the correlation-trace projection', () => {
    const sources = manifest.components['delegation-control-plane']?.dataSources ?? [];
    expect(sources.some((ds) => ds.type === 'projection' && ds.topic === TOPIC)).toBe(true);
  });

  it('R2: the topic symbol the panel reads through is the declared topic', () => {
    expect(TOPICS.delegationCorrelationTrace).toBe(TOPIC);
    const api = readFileSync(resolve(here, '../services/delegation-api.ts'), 'utf-8');
    expect(api).toContain('projectionUrl(\n    TOPICS.delegationCorrelationTrace,');
    const panel = readFileSync(
      resolve(here, '../components/dashboard/delegation-control-plane/DelegationCorrelationTracePanel.tsx'),
      'utf-8',
    );
    expect(panel).toContain('fetchCorrelationTrace');
  });
});
