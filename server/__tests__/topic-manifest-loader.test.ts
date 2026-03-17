/**
 * Tests for TopicManifestLoader (OMN-5028, OMN-5251)
 *
 * Verifies:
 *   1. Manifest loads from project root (topics.yaml)
 *   2. Returns correct topic strings
 *   3. Validates manifest schema (rejects invalid)
 *   4. READ_MODEL_TOPICS is identical to manifest (OMN-5251: manifest is sole source)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import {
  loadTopicManifest,
  loadManifestTopics,
  resetManifestCache,
} from '../services/topic-manifest-loader';

describe('TopicManifestLoader', () => {
  beforeEach(() => {
    resetManifestCache();
  });

  afterEach(() => {
    resetManifestCache();
    delete process.env.TOPICS_MANIFEST_PATH;
  });

  it('loads manifest from project root', () => {
    // Point to the actual topics.yaml in the project root
    process.env.TOPICS_MANIFEST_PATH = path.resolve(__dirname, '../../topics.yaml');

    const manifest = loadTopicManifest();
    expect(manifest.version).toBe('1');
    expect(manifest.read_model_topics.length).toBeGreaterThan(0);
  });

  it('loadManifestTopics returns topic strings', () => {
    process.env.TOPICS_MANIFEST_PATH = path.resolve(__dirname, '../../topics.yaml');

    const topics = loadManifestTopics();
    expect(topics).toContain('onex.evt.omniclaude.agent-actions.v1');
    expect(topics).toContain('onex.evt.omniintelligence.llm-call-completed.v1');
  });

  it('caches result after first load', () => {
    process.env.TOPICS_MANIFEST_PATH = path.resolve(__dirname, '../../topics.yaml');

    const a = loadTopicManifest();
    const b = loadTopicManifest();
    expect(a).toBe(b);
  });

  it('throws when no manifest file is found', () => {
    process.env.TOPICS_MANIFEST_PATH = '/nonexistent/topics.yaml';
    // The loader tries env path first, then cwd/topics.yaml (which exists in
    // the test runner's cwd), so we also need to ensure cwd resolution fails.
    // We use a spy on process.cwd to return a path without topics.yaml.
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/no-such-dir');

    try {
      expect(() => loadTopicManifest()).toThrow('No topics.yaml found');
    } finally {
      cwdSpy.mockRestore();
    }
  });
});

describe('OMN-5251: READ_MODEL_TOPICS is derived from topics.yaml manifest', () => {
  beforeEach(() => {
    resetManifestCache();
  });

  afterEach(() => {
    resetManifestCache();
    delete process.env.TOPICS_MANIFEST_PATH;
  });

  it('READ_MODEL_TOPICS matches manifest exactly', async () => {
    process.env.TOPICS_MANIFEST_PATH = path.resolve(__dirname, '../../topics.yaml');

    const manifestTopics = loadManifestTopics();
    // READ_MODEL_TOPICS is populated from topics.yaml at module load time
    const { READ_MODEL_TOPICS } = await import('../read-model-consumer');

    // Both should contain exactly the same topics
    expect([...READ_MODEL_TOPICS].sort()).toEqual([...manifestTopics].sort());
  });

  it('manifest has at least one topic', () => {
    process.env.TOPICS_MANIFEST_PATH = path.resolve(__dirname, '../../topics.yaml');

    const topics = loadManifestTopics();
    expect(topics.length).toBeGreaterThan(0);
  });
});
