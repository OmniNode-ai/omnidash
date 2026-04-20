// Updated for OMN-43: Header no longer contains the new-dashboard inline form
// (that flow moved to Sidebar). These tests verify the new Topbar behavior.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';
import { ThemeProvider } from '@/theme';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('Header — topbar chrome', () => {
  it('renders breadcrumbs with "Dashboards" as current page', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByText('Dashboards')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('has a theme toggle button', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('renders Refresh, Help, and Notifications icon buttons', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('does NOT contain a "New dashboard" form (flow moved to Sidebar)', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.queryByLabelText('Dashboard name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New dashboard')).not.toBeInTheDocument();
  });
});
