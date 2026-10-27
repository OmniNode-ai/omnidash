// @vitest-environment jsdom
// OMN-21166 part 18 AC128 (Lakshman 2026-10-26: "each of 7 pages should be same style and great and clena unnseary
// things"): Credentials is one table, one row per provider: its state and models from GET /models beside its key
// reference, fingerprint and set time from tenant-credentials.v1. Failure modes declared before code:
//   C1  the two lists stay apart, or a provider's key lands on another provider's row;
//   C2  a key the projection serves is lost because GET /models does not list its provider;
//   C3  a secret or the full key reference id is shown (only the key name and the fingerprint prefix may show);
//   C4  columns that no key fills (Revoked, Expires, Bound host) still take the table's width; or one a key does fill
//       is hidden;
//   C5  provider names in two cases ("GEMINI" in one place, "gemini" in another);
//   C6  a provider with no key reads blank or invents one;
//   C7  GET /models cannot be read (or is still loading) and the served keys vanish with the provider list;
//   C8  one visit asks GET /models twice (React's development double mount ran the read twice).
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelKeys, type ModelKeysClient } from '@/pages/local/model-keys';
import type { ModelProviderRow } from '@/services/models-api';

vi.mock('@/data-source/projection-base-url', () => ({ resolveCommandBaseUrl: () => '' }));

const PROVIDERS: ModelProviderRow[] = [
  { provider: 'gemini', set_up: true, models: ['gemini-3.5-flash-lite'], last_test: { provider: 'gemini', status: 'passed', tested_at: 't' } },
  { provider: 'openrouter', set_up: true, models: ['nvidia/nemotron'], last_test: null },
  { provider: 'openai', set_up: false, models: [], last_test: null },
  { provider: 'ollama', set_up: false, models: [], last_test: null },
] as ModelProviderRow[];
const client = (list = PROVIDERS): ModelKeysClient => ({ list: vi.fn(async () => list) });
const key = (provider: string, over: Record<string, unknown> = {}) => ({
  provider, name: `llm.${provider}.api_key`, api_key_ref: `cred_localinstall_${provider}_0123456789abcdef`, fingerprint: `${provider.slice(0, 4)}abcd`,
  set_at: '2026-10-14T08:24:11+00:00', revoked_at: null, secret_value: 'sk-should-never-show', ...over,
});
const row = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}\\b`) });

describe('Credentials as one table', () => {
  it('C1, C5: each provider row carries its own key, under one set of title-case names', async () => {
    render(<ModelKeys client={client()} keys={[key('gemini'), key('openrouter', { set_at: '2026-10-12T15:52:29+00:00' })]} />);
    await screen.findByRole('table', { name: 'Model providers' });
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Provider', 'State', 'Models', 'Key ref', 'Fingerprint', 'Set', 'Set up with']);
    expect(within(row('Gemini')).getByText('llm.gemini.api_key')).toBeTruthy();
    expect(within(row('Gemini')).getByText('gemiabcd')).toBeTruthy();
    expect(within(row('OpenRouter')).getByText('Oct 12, 15:52:29 UTC')).toBeTruthy();
    expect(screen.getAllByRole('rowheader').map(h => h.textContent)).toEqual(['Gemini', 'OpenRouter', 'OpenAI', 'Ollama']);
  });

  it('C6: a provider with no key says so, never a blank', async () => {
    render(<ModelKeys client={client()} keys={[key('gemini')]} />);
    await screen.findByRole('table', { name: 'Model providers' });
    const cells = within(row('OpenAI')).getAllByRole('cell').map(c => c.textContent);
    expect(cells.slice(2, 5)).toEqual(['No key', '—', '—']);
  });

  it('C2: a key whose provider GET /models does not list keeps its own row', async () => {
    render(<ModelKeys client={client()} keys={[key('anthropic')]} />);
    await screen.findByRole('table', { name: 'Model providers' });
    // In one case with the listed providers (review fix): the served id with a capital first letter.
    expect(within(row('Anthropic')).getByText('llm.anthropic.api_key')).toBeTruthy();
  });

  it('C3: no secret and no full key reference id reaches the page', async () => {
    const { container } = render(<ModelKeys client={client()} keys={[key('gemini')]} />);
    await screen.findByRole('table', { name: 'Model providers' });
    expect(container.textContent).not.toContain('sk-should-never-show');
    expect(container.textContent).not.toContain('cred_localinstall_gemini');
  });

  it('C4: Expires and Bound host appear only when a key records one; Revoked never in the keys in use', async () => {
    const { unmount } = render(<ModelKeys client={client()} keys={[key('gemini')]} />);
    await screen.findByRole('table', { name: 'Model providers' });
    expect(screen.queryByRole('columnheader', { name: 'Expires' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Revoked' })).toBeNull();
    expect(screen.getByText('No key records an expiry or a bound host.')).toBeTruthy();
    unmount();
    render(<ModelKeys client={client()} keys={[key('gemini', { expires_at: '2026-12-01T00:00:00+00:00' })]} />);
    await screen.findByRole('table', { name: 'Model providers' });
    expect(screen.getByRole('columnheader', { name: 'Expires' })).toBeTruthy();
    expect(within(row('Gemini')).getByText('Dec 1, 00:00:00 UTC')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Bound host' })).toBeNull();
    // The column that stays hidden is named as such.
    expect(screen.getByText('No key records a bound host.')).toBeTruthy();
  });

  it('C7: when GET /models cannot be read, the served keys still show, with the reason', async () => {
    const failing: ModelKeysClient = { list: vi.fn(async () => { throw new Error('unreachable'); }) };
    render(<ModelKeys client={failing} keys={[key('openrouter')]} />);
    expect(await screen.findByText('The dashboard could not be reached.')).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Provider key references' });
    expect(within(table).getByRole('row', { name: /llm\.openrouter\.api_key/ })).toBeTruthy();
    expect(table.textContent).not.toContain('sk-should-never-show');
  });

  it('C8: a double mount (StrictMode) reads GET /models once', async () => {
    const counted = client();
    render(<StrictMode><ModelKeys client={counted} keys={[key('gemini')]} /></StrictMode>);
    await screen.findByRole('table', { name: 'Model providers' });
    expect(counted.list).toHaveBeenCalledTimes(1);
  });
});
