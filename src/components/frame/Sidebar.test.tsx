// OMN-13602: the multi-dashboard CRUD (create / switch / rename / delete) was
// removed with the widget builder. The sidebar is now a single fixed "Dashboard"
// entry plus the operator-tool nav groups. These tests cover the trimmed nav and
// page navigation. The Sidebar reads only the global Zustand store, so no
// RegistryProvider wrapper is needed anymore.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';
import { useFrameStore } from '@/store/store';

beforeEach(() => {
  useFrameStore.setState({ activePage: 'dashboard', sidebarCollapsed: false });
});

describe('Sidebar — trimmed nav (OMN-13602)', () => {
  it('renders a single Dashboard entry plus the operator-tool groups', () => {
    render(<Sidebar />);
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Delegation Evidence')).toBeInTheDocument();
    expect(screen.getByText('Event Bus')).toBeInTheDocument();
    expect(screen.getByText('Experimentation')).toBeInTheDocument();
    expect(screen.getByText('SEA Control Plane')).toBeInTheDocument();
    expect(screen.getByText('Instruction Eval')).toBeInTheDocument();
    expect(screen.getByText('Feature Flags')).toBeInTheDocument();
  });

  it('does NOT render any dashboard-CRUD affordance', () => {
    render(<Sidebar />);
    expect(screen.queryByRole('button', { name: /new dashboard/i })).toBeNull();
    expect(screen.queryByText(/no dashboards yet/i)).toBeNull();
  });

  it('clicking an operator tool sets the active page', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.click(screen.getByText('Event Bus'));
    expect(useFrameStore.getState().activePage).toBe('event-bus');
  });

  it('clicking the active operator tool toggles back to the dashboard', async () => {
    useFrameStore.setState({ activePage: 'event-bus' });
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.click(screen.getByText('Event Bus'));
    expect(useFrameStore.getState().activePage).toBe('dashboard');
  });

  it('does NOT render the workspace chip (removed — no workspaces concept)', () => {
    render(<Sidebar />);
    expect(screen.queryByText('Platform Eng')).not.toBeInTheDocument();
  });
});
