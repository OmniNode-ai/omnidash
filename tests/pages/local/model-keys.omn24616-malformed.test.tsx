// @vitest-environment jsdom
// OMN-24616 AC5 (page half for GET /models): a provider list with a malformed row shows the reason and no table.
// Failure modes:
//   P1 a malformed row renders as a provider with a set-up or test state it never had
//   P2 the reason is not shown on the page
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelKeys, type ModelKeysClient } from '@/pages/local/model-keys';
import { listModelKeys } from '@/services/models-api';

vi.mock('@/data-source/projection-base-url', () => ({ resolveCommandBaseUrl: () => '' }));

afterEach(() => vi.unstubAllGlobals());

describe('OMN-24616 AC5: the provider table after a malformed read', () => {
  it('names the malformed field and draws no provider', async () => {
    const body = { providers: [{ provider: 'openai', set_up: 'yes', last_test: null, models: [] }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    render(<ModelKeys client={{ list: listModelKeys } as ModelKeysClient} />);
    expect((await screen.findByRole('status')).textContent).toContain('malformed set_up');
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});
