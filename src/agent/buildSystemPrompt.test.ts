import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './buildSystemPrompt';
import type { RegisteredComponent } from '@/registry/types';

const STUB_SIZE = { w: 6, h: 4 };
const STUB_CAPABILITIES = { supports_compare: false, supports_export: false, supports_fullscreen: false };
const STUB_EMPTY_STATE = { message: 'No data' };

const mockComponents: RegisteredComponent[] = [
  {
    name: 'cost-trend-panel',
    status: 'available',
    manifest: {
      name: 'cost-trend-panel',
      displayName: 'Cost Trend',
      description: 'Shows cost over time',
      category: 'metrics',
      version: '1.0.0',
      implementationKey: 'cost-trend-panel',
      configSchema: {},
      defaultSize: STUB_SIZE,
      minSize: STUB_SIZE,
      maxSize: { w: 12, h: 12 },
      dataSources: [],
      events: { emits: [], consumes: [] },
      emptyState: STUB_EMPTY_STATE,
      capabilities: STUB_CAPABILITIES,
    },
  },
  {
    name: 'event-stream',
    status: 'available',
    manifest: {
      name: 'event-stream',
      displayName: 'Event Stream',
      description: 'Streams events',
      category: 'stream',
      version: '1.0.0',
      implementationKey: 'event-stream',
      configSchema: {},
      defaultSize: { w: 12, h: 6 },
      minSize: { w: 6, h: 4 },
      maxSize: { w: 12, h: 12 },
      dataSources: [],
      events: { emits: [], consumes: [] },
      emptyState: STUB_EMPTY_STATE,
      capabilities: STUB_CAPABILITIES,
    },
  },
];

describe('buildSystemPrompt', () => {
  it('includes all available component names', () => {
    const prompt = buildSystemPrompt({ components: mockComponents, themes: ['light', 'dark'], templateNames: ['Platform Health'] });
    expect(prompt).toContain('cost-trend-panel');
    expect(prompt).toContain('event-stream');
  });

  it('includes available theme names', () => {
    const prompt = buildSystemPrompt({ components: mockComponents, themes: ['light', 'dark'], templateNames: [] });
    expect(prompt).toContain('light');
    expect(prompt).toContain('dark');
  });

  it('includes template names', () => {
    const prompt = buildSystemPrompt({ components: mockComponents, themes: [], templateNames: ['Platform Health', 'Cost & Delegation'] });
    expect(prompt).toContain('Platform Health');
    expect(prompt).toContain('Cost & Delegation');
  });

  it('warns against inventing component names', () => {
    const prompt = buildSystemPrompt({ components: mockComponents, themes: [], templateNames: [] });
    expect(prompt.toLowerCase()).toMatch(/only.*component names listed|never invent|use only/);
  });

  it('lists category for each component', () => {
    const prompt = buildSystemPrompt({ components: mockComponents, themes: [], templateNames: [] });
    expect(prompt).toContain('metrics');
    expect(prompt).toContain('stream');
  });
});
