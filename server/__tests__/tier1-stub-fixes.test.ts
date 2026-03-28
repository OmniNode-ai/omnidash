/**
 * Tests for Tier 1 stub fixes (OMN-5602, OMN-5604, OMN-6758)
 *
 * Verifies:
 * - Pattern lifecycle projections handle promoted/stored/discovered events (OMN-5602)
 * - Agent status projection handles agent-status events (OMN-5604)
 * - Metrics routes use INTELLIGENCE_SERVICE_URL env var (OMN-6758)
 * - Read-model handler topic sets include all new topics
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// OMN-5602: Pattern lifecycle projection topic coverage
// ============================================================================

describe('OMN-5602: Pattern lifecycle topic coverage', () => {
  it('omniintelligence-projections handles promoted/stored/discovered topics', async () => {
    const {
      SUFFIX_INTELLIGENCE_PATTERN_PROMOTED,
      SUFFIX_INTELLIGENCE_PATTERN_STORED,
      SUFFIX_PATTERN_DISCOVERED,
    } = await import('@shared/topics');

    // Dynamically import the handler to check canHandle
    const { OmniintelligenceProjectionHandler } =
      await import('../consumers/read-model/omniintelligence-projections');
    const handler = new OmniintelligenceProjectionHandler();

    expect(handler.canHandle(SUFFIX_INTELLIGENCE_PATTERN_PROMOTED)).toBe(true);
    expect(handler.canHandle(SUFFIX_INTELLIGENCE_PATTERN_STORED)).toBe(true);
    expect(handler.canHandle(SUFFIX_PATTERN_DISCOVERED)).toBe(true);
  });

  it('handler still handles existing lifecycle transitioned topic', async () => {
    const { SUFFIX_INTELLIGENCE_PATTERN_LIFECYCLE_TRANSITIONED } = await import('@shared/topics');
    const { OmniintelligenceProjectionHandler } =
      await import('../consumers/read-model/omniintelligence-projections');
    const handler = new OmniintelligenceProjectionHandler();

    expect(handler.canHandle(SUFFIX_INTELLIGENCE_PATTERN_LIFECYCLE_TRANSITIONED)).toBe(true);
  });
});

// ============================================================================
// OMN-5604: Agent status projection topic coverage
// ============================================================================

describe('OMN-5604: Agent status projection topic coverage', () => {
  it('platform-projections handles agent-status topic', async () => {
    const { SUFFIX_AGENT_STATUS } = await import('@shared/topics');
    const { PlatformProjectionHandler } =
      await import('../consumers/read-model/platform-projections');
    const handler = new PlatformProjectionHandler();

    expect(handler.canHandle(SUFFIX_AGENT_STATUS)).toBe(true);
  });

  it('platform-projections still handles existing topics', async () => {
    const {
      SUFFIX_MEMORY_INTENT_STORED,
      SUFFIX_OMNICLAUDE_PR_VALIDATION_ROLLUP,
      SUFFIX_PLATFORM_DLQ_MESSAGE,
    } = await import('@shared/topics');
    const { PlatformProjectionHandler } =
      await import('../consumers/read-model/platform-projections');
    const handler = new PlatformProjectionHandler();

    expect(handler.canHandle(SUFFIX_MEMORY_INTENT_STORED)).toBe(true);
    expect(handler.canHandle(SUFFIX_OMNICLAUDE_PR_VALIDATION_ROLLUP)).toBe(true);
    expect(handler.canHandle(SUFFIX_PLATFORM_DLQ_MESSAGE)).toBe(true);
  });
});

// ============================================================================
// OMN-5604: Agent status schema definition
// ============================================================================

describe('OMN-5604: Agent status events schema', () => {
  it('agentStatusEvents table is exported from intelligence-schema', async () => {
    const schema = await import('@shared/intelligence-schema');
    expect(schema.agentStatusEvents).toBeDefined();
  });
});

// ============================================================================
// OMN-6758: Metrics routes env var usage
// ============================================================================

describe('OMN-6758: Metrics routes configuration', () => {
  it('metrics-routes.ts does not hardcode localhost:8053 in source', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const metricsRoutePath = path.resolve(__dirname, '../routes/intelligence/metrics-routes.ts');
    const content = fs.readFileSync(metricsRoutePath, 'utf-8');

    // The file should reference INTELLIGENCE_SERVICE_URL env var
    expect(content).toContain('INTELLIGENCE_SERVICE_URL');

    // The hardcoded URL should only appear as a fallback default, not as the primary URL
    const lines = content.split('\n');
    const hardcodedLines = lines.filter(
      (line) =>
        line.includes('http://localhost:8053') &&
        !line.trimStart().startsWith('//') &&
        !line.includes("|| 'http://localhost:8053'") &&
        !line.includes('|| "http://localhost:8053"')
    );

    expect(hardcodedLines).toEqual([]);
  });
});
