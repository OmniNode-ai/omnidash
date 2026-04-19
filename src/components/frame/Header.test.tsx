import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './Header';
import { useFrameStore } from '@/store/store';
import { ThemeProvider } from '@/theme';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('Header — new dashboard flow', () => {
  beforeEach(() => {
    useFrameStore.getState().setActiveDashboard(null);
  });

  it('is hidden until the new-dashboard button is clicked', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.queryByLabelText('Dashboard name')).not.toBeInTheDocument();
  });

  it('submits an empty dashboard to the store and clears the form', async () => {
    const user = userEvent.setup();
    render(<Header />, { wrapper: Wrapper });

    await user.click(screen.getByLabelText('New dashboard'));
    const input = screen.getByLabelText('Dashboard name') as HTMLInputElement;
    await user.type(input, 'My Board');
    await user.click(screen.getByLabelText('Create dashboard'));

    const active = useFrameStore.getState().activeDashboard;
    expect(active).not.toBeNull();
    expect(active?.name).toBe('My Board');
    expect(active?.layout).toEqual([]);
    expect(screen.queryByLabelText('Dashboard name')).not.toBeInTheDocument();
  });

  it('cancel closes the form without touching the store', async () => {
    const user = userEvent.setup();
    render(<Header />, { wrapper: Wrapper });

    await user.click(screen.getByLabelText('New dashboard'));
    await user.type(screen.getByLabelText('Dashboard name'), 'Abandoned');
    await user.click(screen.getByLabelText('Cancel'));

    expect(useFrameStore.getState().activeDashboard).toBeNull();
    expect(screen.queryByLabelText('Dashboard name')).not.toBeInTheDocument();
  });

  it('rejects empty / whitespace-only names (Create button disabled)', async () => {
    const user = userEvent.setup();
    render(<Header />, { wrapper: Wrapper });

    await user.click(screen.getByLabelText('New dashboard'));
    const createBtn = screen.getByLabelText('Create dashboard') as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);

    await user.type(screen.getByLabelText('Dashboard name'), '   ');
    expect(createBtn.disabled).toBe(true);

    expect(useFrameStore.getState().activeDashboard).toBeNull();
  });
});
