/**
 * OMN-9845: Golden chain coverage gate for omnidash-v2.
 *
 * v2 uses a snapshot-projection architecture (src/data-source/) rather than
 * Kafka read-model consumers (server/consumers/read-model/). Topic strings are
 * the single source of truth in shared/types/topics.ts.
 *
 * tsconfig.node.json (composite) cannot include shared/ without conflicting
 * with the frontend tsconfig's composite project references (TS6305). Topic
 * convention is verified here by reading the source file directly rather than
 * importing it as a TypeScript module.
 *
 * Full golden-chain integration tests will be added as projection handlers
 * are implemented (tracked in OMN-9845 follow-up tasks).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('golden-chain coverage gate', () => {
  it('shared/types/topics.ts exists and exports at least one topic', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../shared/types/topics.ts'),
      'utf8',
    );
    // TOPICS object must have at least one key
    expect(src).toMatch(/export\s+const\s+TOPICS\s*=/);
    // Must contain at least one onex.snapshot.projection.* value
    expect(src).toMatch(/onex\.snapshot\.projection\./);
  });

  it('all topic values in shared/types/topics.ts follow onex.snapshot.projection.* convention', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../shared/types/topics.ts'),
      'utf8',
    );
    const values = [...src.matchAll(/'(onex\.[^']+)'/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value, `topic value "${value}" must follow onex.snapshot.projection.* convention`).toMatch(
        /^onex\.snapshot\.projection\./,
      );
    }
  });
});
