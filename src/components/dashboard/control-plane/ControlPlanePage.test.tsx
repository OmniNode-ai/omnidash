import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import type { ProtocolSnapshotSource } from '@/data-source';
import ControlPlanePage from './ControlPlanePage';
import { PromptInput } from './PromptInput';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const emptySource: ProtocolSnapshotSource = {
  async *readAll() {
    yield* [];
  },
};

describe('ControlPlanePage', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is only the node creation action, without embedded delegation or event feeds', () => {
    render(
      <DataSourceTestProvider client={queryClient} source={emptySource}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    expect(screen.getByText('Create Node')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/describe the node/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
    expect(screen.queryByText(/trigger delegation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pipeline events/i)).not.toBeInTheDocument();
  });

  it('fails fast in file mode without fabricating activity', async () => {
    render(
      <DataSourceTestProvider client={queryClient} source={emptySource}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/describe the node/i), {
      target: { value: 'Classify sentiment' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/submit failed/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the accepted correlation and refreshes the shared event stream', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    vi.stubEnv('VITE_HTTP_DATA_SOURCE_URL', 'http://backend.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ correlation_id: 'corr-live-123' }),
    }));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <DataSourceTestProvider client={queryClient} source={emptySource}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/describe the node/i), {
      target: { value: 'Classify sentiment' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/corr-live-123/i);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/system event stream/i);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['live-event-stream'] });
  });

  it('surfaces backend failures and refreshes the shared event stream', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    vi.stubEnv('VITE_HTTP_DATA_SOURCE_URL', 'http://backend.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        correlation_id: 'corr-failed-123',
        status: 'failed',
        error: 'model returned validation errors',
      }),
    }));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <DataSourceTestProvider client={queryClient} source={emptySource}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/describe the node/i), {
      target: { value: 'Classify sentiment' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/model returned validation errors/i);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['live-event-stream'] });
  });

  it('posts the generation command to the configured live backend', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    vi.stubEnv('VITE_HTTP_DATA_SOURCE_URL', 'http://backend.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ correlation_id: 'corr-proxy-1' }),
    }));

    render(
      <DataSourceTestProvider client={queryClient} source={emptySource}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/describe the node/i), {
      target: { value: 'Classify sentiment' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await screen.findByText(/corr-proxy-1/i);
    expect(fetch).toHaveBeenCalledWith(
      'http://backend.test/api/sea/generate',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('PromptInput', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps submit disabled for empty input when disabled is explicitly false', () => {
    render(<PromptInput onSubmit={vi.fn()} disabled={false} />);
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /generate/i })).toHaveClass('btn', 'primary');
  });
});
