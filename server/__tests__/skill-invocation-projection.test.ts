/**
 * Skill Invocation Projection Tests (OMN-6963)
 *
 * Validates that:
 * 1. skill-started.v1 and skill-completed.v1 topics are in topics.yaml
 * 2. The OmniclaudeProjectionHandler routes both topics correctly
 * 3. The old skill-invoked.v1 topic is NOT referenced anywhere
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { SUFFIX_OMNICLAUDE_SKILL_STARTED, SUFFIX_OMNICLAUDE_SKILL_COMPLETED } from '@shared/topics';
import { loadManifestTopics, resetManifestCache } from '../services/topic-manifest-loader';
import { OmniclaudeProjectionHandler } from '../consumers/read-model/omniclaude-projections';

describe('Skill Invocation Projection (OMN-6963)', () => {
  beforeEach(() => {
    resetManifestCache();
    process.env.TOPICS_MANIFEST_PATH = path.resolve(__dirname, '../../topics.yaml');
  });

  afterEach(() => {
    resetManifestCache();
    delete process.env.TOPICS_MANIFEST_PATH;
  });

  // --------------------------------------------------------------------------
  // Topic Registration
  // --------------------------------------------------------------------------

  it('should include skill-started.v1 in topics.yaml', () => {
    const topics = loadManifestTopics();
    expect(topics).toContain(SUFFIX_OMNICLAUDE_SKILL_STARTED);
  });

  it('should include skill-completed.v1 in topics.yaml', () => {
    const topics = loadManifestTopics();
    expect(topics).toContain(SUFFIX_OMNICLAUDE_SKILL_COMPLETED);
  });

  it('should NOT include the old skill-invoked.v1 in topics.yaml', () => {
    const topics = loadManifestTopics();
    expect(topics).not.toContain('onex.evt.omniclaude.skill-invoked.v1');
  });

  it('should have correct canonical topic names', () => {
    expect(SUFFIX_OMNICLAUDE_SKILL_STARTED).toBe('onex.evt.omniclaude.skill-started.v1');
    expect(SUFFIX_OMNICLAUDE_SKILL_COMPLETED).toBe('onex.evt.omniclaude.skill-completed.v1');
  });

  // --------------------------------------------------------------------------
  // Handler Routing
  // --------------------------------------------------------------------------

  it('OmniclaudeProjectionHandler should handle skill-started.v1', () => {
    const handler = new OmniclaudeProjectionHandler();
    expect(handler.canHandle(SUFFIX_OMNICLAUDE_SKILL_STARTED)).toBe(true);
  });

  it('OmniclaudeProjectionHandler should handle skill-completed.v1', () => {
    const handler = new OmniclaudeProjectionHandler();
    expect(handler.canHandle(SUFFIX_OMNICLAUDE_SKILL_COMPLETED)).toBe(true);
  });

  it('OmniclaudeProjectionHandler should NOT handle skill-invoked.v1', () => {
    const handler = new OmniclaudeProjectionHandler();
    expect(handler.canHandle('onex.evt.omniclaude.skill-invoked.v1')).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Topic Manifest Completeness
  // --------------------------------------------------------------------------

  it('topics.yaml should have exactly 2 skill-related topics', () => {
    const topics = loadManifestTopics();
    const skillTopics = topics.filter((t) => t.includes('skill-'));
    expect(skillTopics).toHaveLength(2);
    expect(skillTopics).toContain('onex.evt.omniclaude.skill-started.v1');
    expect(skillTopics).toContain('onex.evt.omniclaude.skill-completed.v1');
  });
});
