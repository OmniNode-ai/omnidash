// @vitest-environment jsdom
// OMN-23330 AC3 (the operator's 2026-11-09 review, reproduced live 2026-11-10 01:30Z: GET /models answered HTTP 502 and
// Settings showed "Model providers could not be read" above the two served provider keys): the notice shows only when
// no provider row is served, never above a served provider table.
// Failure modes:
//   N1  the provider list cannot be read but keys are served, and the page still shows the empty-state notice above them;
//   N2  the served keys vanish with the unread list, or lose a column (they stay in their table, Last used included);
//   N3  the failed read is hidden altogether: its reason and the terminal command must still be said, once, below;
//   N4  nothing is served and the list cannot be read, and the page shows no notice (the one case it belongs to);
//   N5  the list reads fine and a notice shows anyway.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelKeys, type ModelKeysClient } from '@/pages/local/model-keys';
import { ModelKeysError, type ModelProviderRow } from '@/services/models-api';

vi.mock('@/data-source/projection-base-url', () => ({ resolveCommandBaseUrl: () => '' }));

const NOTICE = 'Model providers could not be read';
const REASON = 'The dashboard answered HTTP 502.';
const KEYS = [
  { provider: 'gemini', name: 'llm.gemini.api_key', fingerprint: 'bd161cac', set_at: '2026-10-14T08:24:11Z', revoked_at: null },
  { provider: 'openrouter', name: 'llm.openrouter.api_key', fingerprint: 'a3d211d6', set_at: '2026-10-12T15:52:29Z', revoked_at: null },
];
const failing = (): ModelKeysClient => ({ list: vi.fn(async () => { throw new ModelKeysError(502, 'bad_gateway', REASON); }) });
const served = (rows: ModelProviderRow[]): ModelKeysClient => ({ list: vi.fn(async () => rows) });
const section = () => screen.getByRole('region', { name: 'Model providers' });

describe('OMN-23330 AC3: the providers notice shows only when no provider row is served', () => {
  it('N1, N2: an unread list with served keys shows the keys first, with no notice above them', async () => {
    render(<ModelKeys client={failing()} keys={KEYS} />);
    // The keys show while the list is read too; wait for the failed read, then read the table it leaves.
    await screen.findByText(REASON);
    const table = screen.getByRole('table', { name: 'Provider key references' });
    expect(within(section()).queryByText(NOTICE)).toBeNull();
    expect(within(table).getByRole('row', { name: /llm\.gemini\.api_key/ })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /llm\.openrouter\.api_key/ })).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader').map(header => header.textContent)).toContain('Last used');
  });

  it('N3: the unread list still says why, once, after the providers, with the terminal command', async () => {
    render(<ModelKeys client={failing()} keys={KEYS} />);
    await screen.findByText(REASON);
    const table = screen.getByRole('table', { name: 'Provider key references' });
    const reason = within(section()).getAllByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes(REASON));
    expect(reason).toHaveLength(1);
    expect(reason[0]!.textContent).toContain('onex models list');
    // After the served keys, never above them.
    expect(table.compareDocumentPosition(reason[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('N4: nothing served and the list unread: the notice is the page\'s one statement', async () => {
    render(<ModelKeys client={failing()} keys={[]} />);
    expect(await within(section()).findByText(NOTICE)).toBeInTheDocument();
    expect(section().textContent).toContain(REASON);
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('N5 control: a list that reads shows its providers and no notice', async () => {
    render(<ModelKeys client={served([{ provider: 'gemini', set_up: true, models: ['gemini-1'], last_test: null }] as unknown as ModelProviderRow[])} keys={KEYS.slice(0, 1)} />);
    await screen.findByRole('article', { name: 'Gemini' });
    expect(within(section()).queryByText(NOTICE)).toBeNull();
    expect(section().textContent).not.toContain(REASON);
  });
});
