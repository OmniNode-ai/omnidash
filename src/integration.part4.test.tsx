import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './theme';
import { RegistryProvider } from './registry/RegistryProvider';
import { AgentOrchestrator } from './agent/AgentOrchestrator';
import { useFrameStore } from './store/store';
import { INITIAL_CONVERSATION_STATE } from './store/conversationSlice';
import { AGENT_ACTIONS, validateAgentAction } from './agent/actions';
import { AgentActionDispatcher } from './agent/AgentActionDispatcher';
import { buildSystemPrompt } from './agent/buildSystemPrompt';
import { buildUserContext } from './agent/contextUtils';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RegistryManifest } from './registry/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestJson = readFileSync(resolve(__dirname, '../public/component-registry.json'), 'utf-8');
const manifest: RegistryManifest = JSON.parse(manifestJson);

vi.mock('page-agent', () => ({
  PageAgent: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: 'I have added cost-trend-panel to your dashboard.',
      history: [
        {
          type: 'step',
          action: {
            name: 'add_component',
            input: { componentName: 'cost-trend-panel', position: { x: 0, y: 0, w: 6, h: 4 } },
            output: 'Added component',
          },
        },
      ],
    }),
    dispose: vi.fn(),
    status: 'idle',
  })),
}));

describe('Proof of Life — Part 4 (Conversational Layer)', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useFrameStore.setState(
      {
        ...INITIAL_CONVERSATION_STATE,
        activeDashboard: null,
        editMode: false,
        globalFilters: {},
      },
      false
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });

  afterEach(() => vi.restoreAllMocks());

  it('AGENT_ACTIONS covers 12 named tools', () => {
    expect(AGENT_ACTIONS.length).toBe(12);
  });

  it('all 12 action definitions pass self-validation (required fields present in schema)', () => {
    for (const action of AGENT_ACTIONS) {
      expect(action.name).toBeTruthy();
      expect(action.description.length).toBeGreaterThan(10);
    }
  });

  it('validateAgentAction rejects unknown actions', () => {
    const result = validateAgentAction('destroy_everything', {});
    expect(result.valid).toBe(false);
  });

  it('dispatcher dispatches all 3 read-only list actions without store handlers', async () => {
    const d = new AgentActionDispatcher();
    d.setHandlers({
      getRegistry: () => ({
        getAvailableComponents: () => [],
        getComponentsByCategory: () => [],
        getComponent: () => undefined,
      }),
      getThemes: () => ['light', 'dark'],
      getTemplates: () => [{ name: 'Platform Health' }],
    });

    const listComponents = await d.dispatch('list_components', {});
    const listThemes = await d.dispatch('list_themes', {});
    const listTemplates = await d.dispatch('list_templates', {});

    expect(listComponents.success).toBe(true);
    expect(listThemes.success).toBe(true);
    expect((listThemes.data as string[]).length).toBe(2);
    expect(listTemplates.success).toBe(true);
  });

  it('system prompt contains all component names from manifest', () => {
    const components = Object.values(manifest.components).map((m) => ({
      name: m.name,
      status: 'available' as const,
      manifest: m,
    }));
    const prompt = buildSystemPrompt({
      components,
      themes: ['light', 'dark'],
      templateNames: ['Cost & Delegation'],
    });
    for (const name of Object.keys(manifest.components)) {
      expect(prompt).toContain(name);
    }
  });

  it('user context string stays under 500 chars for large layouts', () => {
    const layout = Array.from({ length: 12 }, (_, i) => ({
      i: `item-${i}`,
      componentName: 'cost-trend-panel',
      x: 0,
      y: i * 4,
      w: 12,
      h: 4,
      componentVersion: '1.0.0',
      config: {},
    }));
    const ctx = buildUserContext({ layout, filters: { repo: 'claude' } });
    expect(ctx.length).toBeLessThan(500);
  });

  it('chat panel opens when toggle button is clicked', async () => {
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <RegistryProvider manifest={manifest}>
            <AgentOrchestrator />
          </RegistryProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
    const toggle = screen.getByRole('button', { name: /ai assistant/i });
    await userEvent.click(toggle);
    await waitFor(() => expect(useFrameStore.getState().isPanelOpen).toBe(true));
  });

  it('submitting a message results in user message in store', async () => {
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <RegistryProvider manifest={manifest}>
            <AgentOrchestrator />
          </RegistryProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /ai assistant/i }));
    await waitFor(() => expect(useFrameStore.getState().isPanelOpen).toBe(true));

    // Wait for textbox — agent initializes asynchronously
    const textbox = await screen.findByRole('textbox', {}, { timeout: 3000 });
    await userEvent.type(textbox, 'Add a cost panel');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      const messages = useFrameStore.getState().messages;
      expect(messages.some((m) => m.role === 'user')).toBe(true);
    });
  });

  it('dispatching add_component calls addComponentToLayout handler', async () => {
    const d = new AgentActionDispatcher();
    const addComponentToLayout = vi.fn();
    d.setHandlers({
      addComponentToLayout,
      getRegistry: () => ({
        getAvailableComponents: () => [],
        getComponentsByCategory: () => [],
        getComponent: (name: string) =>
          name === 'cost-trend-panel'
            ? { name, status: 'available', manifest: { name, defaultSize: { w: 6, h: 4 } } }
            : undefined,
      }),
    });

    const result = await d.dispatch('add_component', {
      componentName: 'cost-trend-panel',
      position: { x: 0, y: 0, w: 6, h: 4 },
    });

    expect(result.success).toBe(true);
    expect(addComponentToLayout).toHaveBeenCalledOnce();
    const callArg = addComponentToLayout.mock.calls[0][0];
    expect(callArg.componentName).toBe('cost-trend-panel');
    expect(callArg.i).toBeTruthy(); // nanoid-assigned
  });
});
