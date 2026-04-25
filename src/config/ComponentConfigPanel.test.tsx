import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentConfigPanel } from './ComponentConfigPanel';
import { useFrameStore } from '@/store/store';
import { RegistryProvider } from '@/registry/RegistryProvider';
import { createEmptyDashboard } from '@shared/types/dashboard';
import type { RegistryManifest } from '@/registry/types';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Registry manifest with a non-trivial configSchema
// ---------------------------------------------------------------------------
const manifest: RegistryManifest = {
  manifestVersion: '1.0',
  generatedAt: '2026-04-19T00:00:00Z',
  components: {
    'test-widget': {
      name: 'test-widget',
      displayName: 'Test Widget',
      description: 'A test widget with a real schema',
      category: 'quality',
      version: '1.0.0',
      implementationKey: 'test/TestWidget',
      configSchema: {
        type: 'object',
        title: 'Test Widget Config',
        properties: {
          title: { type: 'string', title: 'Title' },
          count: { type: 'number', title: 'Count', minimum: 0 },
        },
        required: ['title'],
      },
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

// Test placement id used across tests
const PLACEMENT_ID = 'placement-abc';

function wrapper({ children }: { children: ReactNode }) {
  return <RegistryProvider manifest={manifest}>{children}</RegistryProvider>;
}

function renderPanel(placementId: string | null = PLACEMENT_ID) {
  return render(
    <ComponentConfigPanel placementId={placementId} onOpenChange={() => {}} />,
    { wrapper }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedDashboardWithPlacement(config: Record<string, unknown> = {}) {
  const dash = createEmptyDashboard('Test Dashboard', 'test');
  dash.layout = [
    {
      i: PLACEMENT_ID,
      componentName: 'test-widget',
      componentVersion: '1.0.0',
      x: 0,
      y: 0,
      w: 6,
      h: 4,
      config,
    },
  ];
  useFrameStore.getState().setActiveDashboard(dash);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComponentConfigPanel', () => {
  beforeEach(() => {
    useFrameStore.setState({
      editMode: false,
      activeDashboard: null,
      globalFilters: {},
      selectedPlacementId: null,
      placementDrafts: {},
    });
  });

  it('renders nothing when the placement does not exist', () => {
    const { container } = renderPanel('does-not-exist');
    expect(container.firstChild).toBeNull();
  });

  it('renders the form when a placement with a non-trivial schema is present', () => {
    seedDashboardWithPlacement();
    renderPanel();
    // The config panel is present
    expect(screen.getByTestId('config-panel')).toBeInTheDocument();
    // The "Title" field should be rendered by rjsf
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  it('editing the form updates the draft in the store', async () => {
    seedDashboardWithPlacement({ title: 'original' });
    renderPanel();

    const titleInput = screen.getByLabelText(/title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'new title');

    await waitFor(() => {
      const draft = useFrameStore.getState().placementDrafts[PLACEMENT_ID];
      expect(draft).toBeDefined();
      expect(draft.draftConfig['title']).toBe('new title');
    });
  });

  it('validation errors set the hasValidationErrors flag on the draft', async () => {
    // Start with a valid value so we can trigger an onChange by clearing it
    seedDashboardWithPlacement({ title: 'has value' });
    renderPanel();

    const titleInput = screen.getByLabelText(/title/i);
    // Clear the required field — rjsf liveValidate fires onChange with errors
    await userEvent.clear(titleInput);

    await waitFor(() => {
      const draft = useFrameStore.getState().placementDrafts[PLACEMENT_ID];
      expect(draft).toBeDefined();
      // An empty required field must set hasValidationErrors = true
      expect(draft.hasValidationErrors).toBe(true);
    });
  });

  it('Discard button removes the draft, restoring persisted config', async () => {
    seedDashboardWithPlacement({ title: 'persisted' });

    // Inject a draft so there is something to discard
    useFrameStore.getState().setDraftConfig(PLACEMENT_ID, { title: 'draft value' }, false);

    renderPanel();

    const discardBtn = screen.getByRole('button', { name: /discard config changes/i });
    await userEvent.click(discardBtn);

    // Draft should be gone; the persisted config remains untouched on the layout item
    const drafts = useFrameStore.getState().placementDrafts;
    expect(drafts[PLACEMENT_ID]).toBeUndefined();

    const persistedConfig = useFrameStore.getState().activeDashboard?.layout[0].config;
    expect(persistedConfig?.['title']).toBe('persisted');
  });

  it('anyPlacementHasValidationErrors returns false when no drafts have errors', () => {
    useFrameStore.getState().setDraftConfig('p1', { x: 1 }, false);
    useFrameStore.getState().setDraftConfig('p2', { x: 2 }, false);
    expect(useFrameStore.getState().anyPlacementHasValidationErrors()).toBe(false);
  });

  it('anyPlacementHasValidationErrors returns true when at least one draft has errors', () => {
    useFrameStore.getState().setDraftConfig('p1', { x: 1 }, false);
    useFrameStore.getState().setDraftConfig('p2', {}, true);
    expect(useFrameStore.getState().anyPlacementHasValidationErrors()).toBe(true);
  });
});
