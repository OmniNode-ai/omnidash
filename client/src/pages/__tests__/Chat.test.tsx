import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/ChatInterface', () => ({
  ChatInterface: () => <div data-testid="chat-interface">chat interface mock</div>,
}));

describe('Chat page', () => {
  it('renders heading and chat interface', async () => {
    const { default: Chat } = await import('../Chat');

    render(<Chat />);

    expect(screen.getByText('AI Query Assistant')).toBeInTheDocument();
    expect(
      screen.getByText('Ask questions about your platform using natural language')
    ).toBeInTheDocument();
    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
  });
});
