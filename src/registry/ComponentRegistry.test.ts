import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentRegistry } from './ComponentRegistry';
import type { ComponentManifest } from '@shared/types/component-manifest';

const mockManifest: ComponentManifest = {
  name: 'test-component',
  displayName: 'Test Component',
  description: 'A test',
  category: 'quality',
  version: '1.0.0',
  implementationKey: 'test/TestComponent',
  paletteVisibility: 'visible',
  authorityLabel: 'projection-backed',
  configSchema: { type: 'object', properties: { title: { type: 'string', default: 'Test' } }, additionalProperties: false },
  dataSources: [],
  events: { emits: [], consumes: [] },
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 8 },
  emptyState: { message: 'No data' },
  capabilities: { supports_compare: false, supports_export: false, supports_fullscreen: false },
};

describe('ComponentRegistry', () => {
  let registry: ComponentRegistry;

  beforeEach(() => {
    registry = new ComponentRegistry({
      manifestVersion: '1.0',
      generatedAt: '2026-04-10T00:00:00Z',
      components: { 'test-component': mockManifest },
    });
  });

  it('returns all components', () => {
    const all = registry.getAvailableComponents();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('test-component');
  });

  it('returns component by name', () => {
    const c = registry.getComponent('test-component');
    expect(c).toBeDefined();
    expect(c!.manifest.displayName).toBe('Test Component');
  });

  it('returns undefined for unknown component', () => {
    expect(registry.getComponent('nonexistent')).toBeUndefined();
  });

  it('filters by category', () => {
    const metrics = registry.getComponentsByCategory('quality');
    expect(metrics.length).toBe(1);
    expect(registry.getComponentsByCategory('activity').length).toBe(0);
  });

  it('validates config against restricted schema subset', () => {
    const result = registry.validateConfig('test-component', { title: 'Hello' });
    expect(result.valid).toBe(true);
  });

  it('marks components without implementation as not_implemented', () => {
    const c = registry.getComponent('test-component');
    expect(c!.status).toBe('not_implemented');
  });

  // OMN-12833 (A2.5): a component with a resolvable implementation key but
  // classified `hidden` by the one-backend sweep must NOT become `available`.
  it('forces hidden components to not_implemented even when the implementation resolves', async () => {
    const hiddenWithImpl: ComponentManifest = {
      ...mockManifest,
      name: 'event-stream',
      // event-stream has a real entry in componentImports (events/EventStream).
      implementationKey: 'events/EventStream',
      paletteVisibility: 'hidden',
      authorityLabel: 'hidden',
    };
    const visibleWithImpl: ComponentManifest = {
      ...mockManifest,
      name: 'event-stream-visible',
      implementationKey: 'events/EventStream',
      paletteVisibility: 'visible',
      authorityLabel: 'projection-backed',
    };
    const r = new ComponentRegistry({
      manifestVersion: '1.0',
      generatedAt: '2026-06-08T00:00:00Z',
      components: { 'event-stream': hiddenWithImpl, 'event-stream-visible': visibleWithImpl },
    });
    await r.resolveImplementations();
    expect(r.getComponent('event-stream')!.status).toBe('not_implemented');
    expect(r.getComponent('event-stream-visible')!.status).toBe('available');
  });
});
