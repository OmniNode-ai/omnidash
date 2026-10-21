// @vitest-environment jsdom
// OMN-20816: the Credentials page lists the model providers read-only, from the local dashboard's GET /models (the
// status `onex models list` prints). Keys change only in the terminal: the operator ruled on the ticket
// (2026-10-21T10:24:32Z) that the page has no key entry and stays read-only.
//
// Failure modes, each with a test below:
//   R1  the page cannot tell the states apart (not set up, set up and not tested, last test passed, last test failed
//       with the provider's reason), loses a provider's models, lists a provider it does not show, or reorders them;
//   R2  the page offers a way to change a key: a button, a form, an input of any kind, or a key field;
//   R3  Ollama's row does not say that onboarding sets it up, or a keyed row does not name the terminal command;
//   R4  a list that cannot be read shows an empty or invented table instead of saying so;
//   R5  the client can send a key or remove one: it exports a write, or issues anything but a GET of /models.
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelKeys, type ModelKeysClient } from '@/pages/local/model-keys';
import * as modelsApi from '@/services/models-api';
import { ModelKeysError, listModelKeys, type ModelProviderRow } from '@/services/models-api';

// A live local dashboard, served same-origin by `onex dashboard`.
vi.mock('@/data-source/projection-base-url', () => ({ resolveCommandBaseUrl: () => '' }));

function rows(overrides: Partial<Record<string, Partial<ModelProviderRow>>> = {}): ModelProviderRow[] {
  return (['gemini', 'openrouter', 'openai', 'ollama'] as const).map((provider) => ({
    provider, set_up: false, last_test: null, models: [], ...overrides[provider],
  }));
}

// Every state at once, with every keyed provider set up, so a page that offered Add, Replace or Remove would show it.
const EVERY_STATE = rows({
  gemini: { set_up: true, models: ['gemini-a'], last_test: null },
  openrouter: { set_up: true, models: ['openai/gpt-5-nano', 'anthropic/claude-x'], last_test: { provider: 'openrouter', status: 'passed', tested_at: 't1', model: 'openai/gpt-5-nano' } },
  openai: { set_up: true, models: ['gpt-5-nano'], last_test: { provider: 'openai', status: 'failed', tested_at: 't2', reason: '401 invalid api key' } },
});

function client(list: ModelProviderRow[], extra: Partial<ModelKeysClient> = {}): ModelKeysClient {
  return { list: vi.fn(async () => list), ...extra } as ModelKeysClient;
}

function row(name: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(`^${name}\\b`) });
}

afterEach(() => vi.restoreAllMocks());

describe('OMN-20816 read-only model providers on the Credentials page', () => {
  it('R1: lists the four providers in order, each in its served state with its models', async () => {
    render(<ModelKeys client={client(EVERY_STATE)} />);
    await screen.findByRole('table', { name: 'Model providers' });
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['Gemini', 'OpenRouter', 'OpenAI', 'Ollama']);
    expect(within(row('Gemini')).getByText('Set up, not tested yet')).toBeTruthy();
    expect(within(row('Gemini')).getByText('gemini-a')).toBeTruthy();
    expect(within(row('OpenRouter')).getByText('Last test passed')).toBeTruthy();
    expect(within(row('OpenRouter')).getByText('openai/gpt-5-nano')).toBeTruthy();
    expect(within(row('OpenRouter')).getByText('anthropic/claude-x')).toBeTruthy();
    expect(within(row('OpenAI')).getByText('Last test failed: 401 invalid api key')).toBeTruthy();
    expect(within(row('Ollama')).getByText('Not set up')).toBeTruthy();
    expect(screen.queryByText('Anthropic')).toBeNull();
  });

  it('R1: a provider the page does not show is dropped, not added as a row', async () => {
    const served = [...rows(), { provider: 'anthropic', set_up: true, last_test: null, models: ['claude-x'] }] as unknown as ModelProviderRow[];
    render(<ModelKeys client={client(served)} />);
    await screen.findByRole('table', { name: 'Model providers' });
    expect(screen.getAllByRole('rowheader')).toHaveLength(4);
    expect(screen.queryByText('claude-x')).toBeNull();
  });

  it('R2: there is no button, form, input or key field anywhere, whatever the states', async () => {
    const { container } = render(<ModelKeys client={client(EVERY_STATE)} />);
    await screen.findByRole('table', { name: 'Model providers' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(container.querySelectorAll('form, input, textarea, select, button, [contenteditable]')).toHaveLength(0);
    expect(screen.queryByText(/API key$/)).toBeNull();
  });

  it('R3: Ollama says onboarding sets it up, and each keyed provider names the terminal command', async () => {
    render(<ModelKeys client={client(EVERY_STATE)} />);
    await screen.findByRole('table', { name: 'Model providers' });
    expect(within(row('Ollama')).getByText(/onboarding/)).toBeTruthy();
    for (const [name, id] of [['Gemini', 'gemini'], ['OpenRouter', 'openrouter'], ['OpenAI', 'openai']] as const) {
      expect(within(row(name)).getByText(`onex models add ${id}`)).toBeTruthy();
    }
  });

  it('R4: a list that cannot be read says so and shows no table', async () => {
    render(<ModelKeys client={client([], { list: vi.fn(async () => { throw new ModelKeysError(0, 'file_mode', 'Model providers are listed on the live local dashboard.'); }) })} />);
    expect((await screen.findByRole('status')).textContent).toContain('Model providers are listed on the live local dashboard.');
    expect(screen.queryByRole('table', { name: 'Model providers' })).toBeNull();
  });

  it('R4: a dashboard that cannot be reached says so too', async () => {
    render(<ModelKeys client={client([], { list: vi.fn(async () => { throw new TypeError('fetch failed'); }) })} />);
    expect((await screen.findByRole('status')).textContent).toContain('could not be reached');
    expect(screen.queryByRole('table', { name: 'Model providers' })).toBeNull();
  });
});

describe('OMN-20816 models client', () => {
  it('R5: the client exports no write, only the list', () => {
    const functions = Object.entries(modelsApi).filter(([, value]) => typeof value === 'function').map(([name]) => name).sort();
    expect(functions).toEqual(['ModelKeysError', 'listModelKeys']);
  });

  it('R5: the page, on its live client, only ever GETs /models', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ providers: EVERY_STATE }), { status: 200 }));
    render(<ModelKeys />);
    await screen.findByRole('table', { name: 'Model providers' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url).endsWith('/models')).toBe(true);
      expect(init?.method ?? 'GET').toBe('GET');
      expect(init?.body ?? null).toBeNull();
    }
  });

  it('R5: a list refusal keeps the server text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: 'forbidden', detail: 'open the start URL again' }), { status: 403 }));
    await expect(listModelKeys()).rejects.toMatchObject({ status: 403, code: 'forbidden', message: 'open the start URL again' });
  });
});
