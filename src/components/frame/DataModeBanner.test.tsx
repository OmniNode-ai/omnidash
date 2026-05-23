import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DataModeBanner } from './DataModeBanner';

afterEach(() => vi.unstubAllEnvs());

describe('DataModeBanner', () => {
  it('shows fixture mode banner when VITE_DATA_SOURCE=file', () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'file');
    render(<DataModeBanner />);
    expect(screen.getByTestId('data-mode-banner')).toBeInTheDocument();
    expect(screen.getByText(/Fixture Mode/)).toBeInTheDocument();
  });

  it('shows sqlite banner when VITE_DATA_SOURCE=sqlite', () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'sqlite');
    render(<DataModeBanner />);
    expect(screen.getByTestId('data-mode-banner')).toBeInTheDocument();
    expect(screen.getByText(/Local Data \(SQLite\)/)).toBeInTheDocument();
  });

  it('renders nothing when VITE_DATA_SOURCE=http', () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    const { container } = render(<DataModeBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when VITE_DATA_SOURCE=postgres', () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'postgres');
    const { container } = render(<DataModeBanner />);
    expect(container.firstChild).toBeNull();
  });
});
