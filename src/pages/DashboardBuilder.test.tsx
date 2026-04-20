import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Providers } from '@/providers/Providers';
import { RegistryProvider } from '@/registry/RegistryProvider';
import { DashboardBuilder } from './DashboardBuilder';
import { useFrameStore } from '@/store/store';
import { createEmptyDashboard } from '@shared/types/dashboard';
import { layoutPersistence } from '@/layout/layout-persistence';
import type { RegistryManifest } from '@/registry/types';

const manifest: RegistryManifest = {
  manifestVersion: '1.0',
  generatedAt: '2026-04-10T00:00:00Z',
  components: {
    'test-widget': {
      name: 'test-widget',
      displayName: 'Test Widget',
      description: 'A test widget',
      category: 'metrics',
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

function renderBuilder() {
  return render(
    <Providers>
      <RegistryProvider manifest={manifest}>
        <DashboardBuilder />
      </RegistryProvider>
    </Providers>
  );
}

describe('DashboardBuilder', () => {
  beforeEach(() => {
    useFrameStore.setState({ editMode: false, activeDashboard: null, globalFilters: {} });
    const dash = createEmptyDashboard('Test Dashboard', 'jonah');
    useFrameStore.getState().setActiveDashboard(dash);
  });

  it('renders the dashboard name', () => {
    renderBuilder();
    expect(screen.getByText('Test Dashboard')).toBeInTheDocument();
  });

  it('shows Edit button in view mode', () => {
    renderBuilder();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('shows palette in edit mode', async () => {
    renderBuilder();
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByText('Test Widget')).toBeInTheDocument();
  });

  it('shows Save and Discard buttons in edit mode', async () => {
    renderBuilder();
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('[OMN-41] Save persists the active dashboard via layoutPersistence.write', async () => {
    const writeSpy = vi.spyOn(layoutPersistence, 'write').mockResolvedValue(undefined);
    // Test dashboard set up in beforeEach is named "Test Dashboard".
    const expectedName = useFrameStore.getState().activeDashboard!.name;

    renderBuilder();
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith(
      expectedName,
      expect.objectContaining({ name: expectedName, layout: expect.any(Array) })
    );

    writeSpy.mockRestore();
  });
});
