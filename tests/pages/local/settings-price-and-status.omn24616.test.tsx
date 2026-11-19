// @vitest-environment jsdom
// OMN-24616 AC8: Settings shows the baseline price itself, and provider status is re-read by Refresh and the poll.
// The audit found Settings saying "Found in the pricing manifest" instead of the price, and the provider status read
// once when the page opened, while the keys table beside it follows Refresh and the 30-second poll.
// Failure modes:
//   P1  the baseline price reads "Found in the pricing manifest", not the price per million tokens
//   P2  a row with no served price shows a made-up price instead of Not measured
//   K1  Refresh leaves the provider status as it was first read
//   K2  the poll leaves the provider status as it was first read
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PricingFacts } from '@/pages/local/pricing';
import { ModelKeys, type ModelKeysClient } from '@/pages/local/model-keys';
import { requestLocalPageRefresh } from '@/services/local-page-refresh';
import type { ModelProviderRow } from '@/services/models-api';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const allTime = (baseline: unknown) => ({
  window_kind: 'all', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0', baseline_state: 'resolved',
  summary_json: JSON.stringify({ baseline }),
});

describe('OMN-24616 AC8: the baseline price on Settings', () => {
  it('P1: shows the served price per million tokens', () => {
    render(<PricingFacts rows={[allTime({ model: 'claude-sonnet-5-5', price_in_per_1k: '0.002', price_out_per_1k: '0.01' })]} />);
    expect(screen.getByText('$2.00 in · $10.00 out per million tokens')).toBeInTheDocument();
    expect(screen.queryByText('Found in the pricing manifest')).toBeNull();
  });

  it('P2: no served price reads Not measured', () => {
    render(<PricingFacts rows={[allTime(null)]} />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
  });
});

const openai = (setUp: boolean): ModelProviderRow => ({ provider: 'openai', set_up: setUp, last_test: null, models: [] });

function changingClient(): { client: ModelKeysClient; list: ReturnType<typeof vi.fn> } {
  const list = vi.fn().mockResolvedValueOnce([openai(false)]).mockResolvedValue([openai(true)]);
  return { client: { list } as unknown as ModelKeysClient, list };
}

describe('OMN-24616 AC8: provider status follows Refresh and the poll', () => {
  it('K1: Refresh re-reads the provider status', async () => {
    const { client, list } = changingClient();
    render(<ModelKeys client={client} />);
    expect(await screen.findByText('Not set up')).toBeInTheDocument();
    await act(async () => { requestLocalPageRefresh(); });
    expect(await screen.findByText('Set up, not tested yet')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('K2: the poll re-reads the provider status', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { client, list } = changingClient();
    render(<ModelKeys client={client} refreshMs={30_000} />);
    expect(await screen.findByText('Not set up')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(await screen.findByText('Set up, not tested yet')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });
});
