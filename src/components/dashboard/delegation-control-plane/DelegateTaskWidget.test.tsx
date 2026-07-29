import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import DelegateTaskWidget from './DelegateTaskWidget';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DelegateTaskWidget', () => {
  it('renders task type and prompt as a standalone, always-visible action', () => {
    render(
      <DataSourceTestProvider client={queryClient}>
        <DelegateTaskWidget />
      </DataSourceTestProvider>,
    );

    expect(screen.getByText('Delegate Task')).toBeInTheDocument();
    expect(screen.getByText('Task type')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/describe the task to delegate/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dispatch/i })).toBeInTheDocument();
    expect(screen.queryByText(/\+ Trigger delegation/i)).not.toBeInTheDocument();
  });
});
