import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RegistryProvider, useRegistry } from './RegistryProvider';
import type { RegistryManifest } from './types';

const testManifest: RegistryManifest = {
  manifestVersion: '1.0',
  generatedAt: '2026-04-10T00:00:00Z',
  components: {
    'test-widget': {
      name: 'test-widget',
      displayName: 'Test Widget',
      description: 'Test',
      category: 'quality',
      version: '1.0.0',
      implementationKey: 'test/TestWidget',
      configSchema: {},
      dataSources: [],
      events: { emits: [], consumes: [] },
      defaultSize: { w: 6, h: 4 },
      minSize: { w: 3, h: 2 },
      maxSize: { w: 12, h: 8 },
      emptyState: { message: 'No data' },
      capabilities: { supports_compare: false, supports_export: false, supports_fullscreen: false },
    },
  },
};

function Consumer() {
  const registry = useRegistry();
  const all = registry.getAvailableComponents();
  return <div data-testid="count">{all.length}</div>;
}

function StatusProbe({ onReady }: { onReady: (statuses: string[]) => void }) {
  const registry = useRegistry();
  onReady(registry.getAvailableComponents().map((c) => c.status));
  return null;
}

describe('RegistryProvider', () => {
  it('provides registry context to children', () => {
    render(
      <RegistryProvider manifest={testManifest}>
        <Consumer />
      </RegistryProvider>
    );
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('[OMN-39] resolves built-in component implementations eagerly so palette entries are available on first render', async () => {
    // Use the real generated manifest so we assert against the real componentImports map.
    const manifestJson = (await import('./component-registry.json')).default;
    const realManifest = manifestJson as unknown as RegistryManifest;

    let statuses: string[] = [];
    render(
      <RegistryProvider manifest={realManifest}>
        <StatusProbe onReady={(s) => (statuses = s)} />
      </RegistryProvider>
    );

    expect(statuses.length).toBeGreaterThanOrEqual(7);
    // At least the 7 built-ins should be resolved to 'available' (their implementationKey is in componentImports).
    expect(statuses.filter((s) => s === 'available').length).toBeGreaterThanOrEqual(7);
  });
});
