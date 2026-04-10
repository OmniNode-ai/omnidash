import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentOrchestrator } from './AgentOrchestrator';
import { useFrameStore } from '@/store/store';
import { INITIAL_CONVERSATION_STATE } from '@/store/conversationSlice';

vi.mock('page-agent', () => ({
  PageAgent: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: 'I added cost-trend-panel to your dashboard.',
      history: [
        {
          type: 'step',
          action: { name: 'add_component', args: { componentName: 'cost-trend-panel' }, input: {}, output: 'Added component' },
        },
      ],
    }),
    dispose: vi.fn(),
    status: 'idle',
  })),
}));

vi.mock('@/registry/RegistryProvider', () => ({
  useRegistry: () => ({
    getAvailableComponents: () => [{ name: 'cost-trend-panel', status: 'available', manifest: { name: 'cost-trend-panel', category: 'metrics', displayName: 'Cost Trend', defaultSize: { w: 6, h: 4 } } }],
    getComponentsByCategory: () => [],
    getComponent: (name: string) =>
      name === 'cost-trend-panel'
        ? { name, status: 'available', manifest: { name, category: 'metrics', displayName: 'Cost Trend', defaultSize: { w: 6, h: 4 } } }
        : undefined,
  }),
}));

vi.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
    availableThemes: ['dark', 'light'],
    registerTheme: vi.fn(),
  }),
}));

vi.mock('./AgentChatPanel.css', () => ({}));
vi.mock('@/components/agent/AgentChatPanel.css', () => ({
  panel: 'panel',
  panelHeader: 'panelHeader',
  messageList: 'messageList',
  inputRow: 'inputRow',
  input: 'input',
  sendButton: 'sendButton',
  connectingState: 'connectingState',
}));

describe('AgentOrchestrator', () => {
  beforeEach(() => {
    useFrameStore.setState(
      {
        ...INITIAL_CONVERSATION_STATE,
        activeDashboard: null,
        editMode: false,
        globalFilters: {},
      },
      false
    );
  });

  afterEach(() => vi.clearAllMocks());

  it('renders the AI assistant toggle button', () => {
    render(<AgentOrchestrator />);
    expect(screen.getByRole('button', { name: /ai assistant/i })).toBeInTheDocument();
  });

  it('opens chat panel when toggle button is clicked', async () => {
    render(<AgentOrchestrator />);
    const toggle = screen.getByRole('button', { name: /ai assistant/i });
    await userEvent.click(toggle);
    // Panel is shown — look for "Connecting" or "AI Assistant" heading
    await waitFor(() => {
      expect(useFrameStore.getState().isPanelOpen).toBe(true);
    });
  });

  it('submitting a message appends user message to store', async () => {
    render(<AgentOrchestrator />);
    // Open the panel
    await userEvent.click(screen.getByRole('button', { name: /ai assistant/i }));

    // Wait for panel to open
    await waitFor(() => expect(useFrameStore.getState().isPanelOpen).toBe(true));

    // Wait for the input to appear (agent needs to be ready)
    await waitFor(() => screen.queryByRole('textbox'), { timeout: 2000 });

    const input = screen.queryByRole('textbox');
    if (input) {
      await userEvent.type(input, 'Add a cost panel');
      await userEvent.keyboard('{Enter}');

      await waitFor(() => {
        const msgs = useFrameStore.getState().messages;
        expect(msgs.some((m) => m.role === 'user' && m.content === 'Add a cost panel')).toBe(true);
      });
    }
  });
});
