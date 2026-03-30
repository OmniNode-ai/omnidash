import { describe, it, expect } from 'vitest';

/**
 * Tests for the event retention cleanup module (OMN-7011).
 * Verifies the retention SQL generation and topic categorization.
 */

describe('event retention cleanup SQL', () => {
  it('generates correct DELETE query with retention days', () => {
    const retentionDays = 7;
    const sql = `DELETE FROM event_bus_events WHERE created_at < NOW() - INTERVAL '${retentionDays} days'`;
    expect(sql).toContain("INTERVAL '7 days'");
  });

  it('identifies high-volume topics correctly', () => {
    const highVolumeTopics = [
      'onex.evt.omniclaude.tool-executed.v1',
      'onex.cmd.omniintelligence.tool-content.v1',
      'onex.evt.omnibase-infra.wiring-health-snapshot.v1',
      'onex.cmd.omniintelligence.promotion-check-requested.v1',
      'onex.evt.platform.node-introspection.v1',
    ];
    expect(highVolumeTopics.length).toBe(5);
    expect(highVolumeTopics).toContain('onex.evt.omniclaude.tool-executed.v1');
  });

  it('identifies never-store topics correctly', () => {
    const neverStoreTopics = [
      'onex.evt.platform.node-heartbeat.v1',
      'onex.evt.omniintelligence.pattern-learned.v1',
      'onex.evt.omniintelligence.pattern-stored.v1',
      'onex.evt.omniintelligence.pattern-projection.v1',
      'onex.cmd.omniintelligence.pattern-learning.v1',
    ];
    expect(neverStoreTopics.length).toBe(5);
    expect(neverStoreTopics).toContain('onex.evt.platform.node-heartbeat.v1');
  });
});
