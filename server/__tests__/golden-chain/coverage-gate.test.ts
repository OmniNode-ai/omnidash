/**
 * OMN-9845: Golden chain coverage gate placeholder for omnidash-v2.
 *
 * v2 uses a snapshot-projection architecture (src/data-source/) rather than
 * Kafka read-model consumers (server/consumers/read-model/). Topic strings are
 * the single source of truth in shared/types/topics.ts.
 *
 * Full golden-chain integration tests will be added as projection handlers are
 * implemented (tracked in OMN-9845 follow-up tasks).
 */
import { describe, it, expect } from 'vitest';
import { TOPICS } from '../../../shared/types/topics';

describe('golden-chain coverage gate', () => {
  it('TOPICS registry is non-empty', () => {
    expect(Object.keys(TOPICS).length).toBeGreaterThan(0);
  });

  it('all topic strings follow onex.snapshot.projection.* convention', () => {
    for (const [key, value] of Object.entries(TOPICS)) {
      expect(value, `TOPICS.${key} must start with onex.snapshot.projection.`).toMatch(
        /^onex\.snapshot\.projection\./,
      );
    }
  });
});
