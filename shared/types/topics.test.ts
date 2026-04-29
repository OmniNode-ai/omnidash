import { describe, it, expect } from 'vitest';
import { TOPICS } from './topics';
import type { TopicSymbol } from './topics';

describe('TOPICS constant', () => {
  it('costTokenUsage key is present with correct value', () => {
    expect(TOPICS.costTokenUsage).toBe('onex.snapshot.projection.cost.token_usage.v1');
  });

  it('costTokenUsage value is assignable to TopicSymbol', () => {
    const topic: TopicSymbol = TOPICS.costTokenUsage;
    expect(topic).toBeDefined();
  });

  it('costByRepo key resolves to the correct topic string', () => {
    expect(TOPICS.costByRepo).toBe('onex.snapshot.projection.cost.by_repo.v1');
  });

  it('TopicSymbol union includes costByRepo value (compile-time assertion)', () => {
    const _: TopicSymbol = TOPICS.costByRepo;
    expect(_).toBe(TOPICS.costByRepo);
  });

  it('all topic values follow the onex.snapshot.projection naming convention', () => {
    for (const [key, value] of Object.entries(TOPICS)) {
      expect(value, `TOPICS.${key} must start with onex.snapshot.projection.`).toMatch(
        /^onex\.snapshot\.projection\./,
      );
    }
  });

  it('all topic values are unique (no accidental duplicates)', () => {
    const values = Object.values(TOPICS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
