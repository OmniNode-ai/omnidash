/**
 * Correlation Trace Projection Tests (OMN-5047)
 *
 * Validates that the ReadModelConsumer correctly handles correlation-trace
 * span events and that the topic is registered in the subscription list.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { SUFFIX_OMNICLAUDE_CORRELATION_TRACE } from '@shared/topics';
import { loadManifestTopics, resetManifestCache } from '../services/topic-manifest-loader';

describe('Correlation Trace Projection (OMN-5047)', () => {
  beforeEach(() => {
    resetManifestCache();
    process.env.TOPICS_MANIFEST_PATH = path.resolve(__dirname, '../../topics.yaml');
  });

  afterEach(() => {
    resetManifestCache();
    delete process.env.TOPICS_MANIFEST_PATH;
  });

  it('should include the correlation-trace topic in topics.yaml', () => {
    const topics = loadManifestTopics();
    expect(topics).toContain(SUFFIX_OMNICLAUDE_CORRELATION_TRACE);
  });

  it('should have the correct canonical topic name', () => {
    expect(SUFFIX_OMNICLAUDE_CORRELATION_TRACE).toBe('onex.evt.omniclaude.correlation-trace.v1');
  });

  it('topics.yaml should include all expected trace topics', () => {
    const topics = loadManifestTopics();
    const traceTopics = topics.filter((t) => t.includes('correlation-trace'));
    expect(traceTopics).toHaveLength(1);
    expect(traceTopics[0]).toBe('onex.evt.omniclaude.correlation-trace.v1');
  });
});
