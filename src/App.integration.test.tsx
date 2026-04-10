import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Providers } from './providers/Providers';
import { App } from './App';
import { useFrameStore } from './store/store';
import { eventBus } from './events/eventBus';

describe('Part 1 smoke proof — frame liveness, provider wiring, theme switching, local state/event behavior', () => {
  it('renders frame layout with header and main area', () => {
    render(
      <Providers>
        <App />
      </Providers>
    );
    expect(screen.getByText('omnidash')).toBeInTheDocument();
    expect(screen.getByText('omnidash v2')).toBeInTheDocument();
  });

  it('theme toggle switches between dark and light', async () => {
    render(
      <Providers>
        <App />
      </Providers>
    );
    const themeBtn = screen.getByRole('button', { name: /theme/i });
    expect(themeBtn.textContent).toBe('dark');

    await userEvent.click(themeBtn);
    expect(themeBtn.textContent).toBe('light');
    expect(document.body.classList.contains('theme-light')).toBe(true);

    await userEvent.click(themeBtn);
    expect(themeBtn.textContent).toBe('dark');
    expect(document.body.classList.contains('theme-dark')).toBe(true);
  });

  it('zustand store starts in view mode', () => {
    expect(useFrameStore.getState().editMode).toBe(false);
  });

  it('mitt event bus is functional', () => {
    let received = false;
    const handler = () => { received = true; };
    eventBus.on('component:node_selected', handler);
    eventBus.emit('component:node_selected', { nodeId: 'test', source: 'proof' });
    expect(received).toBe(true);
    eventBus.off('component:node_selected', handler);
  });
});
