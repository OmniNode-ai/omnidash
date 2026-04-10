import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { AgentChatPanel } from './AgentChatPanel';

describe('AgentChatPanel', () => {
  it('renders closed by default (collapsed state)', () => {
    render(
      <AgentChatPanel
        isOpen={false}
        onToggle={vi.fn()}
        onSend={vi.fn().mockResolvedValue('ok')}
        isAgentReady={false}
      />
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders input when open', () => {
    render(
      <AgentChatPanel
        isOpen={true}
        onToggle={vi.fn()}
        onSend={vi.fn().mockResolvedValue('ok')}
        isAgentReady={true}
      />
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onSend with user message when form is submitted', async () => {
    const onSend = vi.fn().mockResolvedValue('Done');
    render(
      <AgentChatPanel
        isOpen={true}
        onToggle={vi.fn()}
        onSend={onSend}
        isAgentReady={true}
      />
    );
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Add a cost panel');
    await userEvent.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('Add a cost panel');
  });

  it('disables input while agent is thinking', () => {
    render(
      <AgentChatPanel
        isOpen={true}
        onToggle={vi.fn()}
        onSend={vi.fn()}
        isAgentReady={true}
        isThinking={true}
      />
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('shows loading state when agent is not ready', () => {
    render(
      <AgentChatPanel
        isOpen={true}
        onToggle={vi.fn()}
        onSend={vi.fn()}
        isAgentReady={false}
      />
    );
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('displays messages from props', () => {
    const messages = [
      { id: '1', role: 'user' as const, content: 'Add a cost panel', timestamp: Date.now(), actions: [] },
      { id: '2', role: 'assistant' as const, content: 'Adding cost-trend-panel...', timestamp: Date.now(), actions: [] },
    ];
    render(
      <AgentChatPanel
        isOpen={true}
        onToggle={vi.fn()}
        onSend={vi.fn()}
        isAgentReady={true}
        messages={messages}
      />
    );
    expect(screen.getByText('Add a cost panel')).toBeInTheDocument();
    expect(screen.getByText('Adding cost-trend-panel...')).toBeInTheDocument();
  });
});
