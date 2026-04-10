import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Providers } from '@/providers/Providers';
import { FrameLayout } from './FrameLayout';

describe('FrameLayout', () => {
  it('renders header with app title', () => {
    render(
      <Providers>
        <FrameLayout>
          <div>content</div>
        </FrameLayout>
      </Providers>
    );
    expect(screen.getByText('omnidash')).toBeInTheDocument();
  });

  it('renders children in main area', () => {
    render(
      <Providers>
        <FrameLayout>
          <div data-testid="dashboard-content">test content</div>
        </FrameLayout>
      </Providers>
    );
    expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
  });

  it('has a theme toggle button', () => {
    render(
      <Providers>
        <FrameLayout>
          <div>content</div>
        </FrameLayout>
      </Providers>
    );
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
  });
});
