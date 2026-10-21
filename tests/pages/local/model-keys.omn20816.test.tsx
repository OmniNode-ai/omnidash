// @vitest-environment jsdom
// OMN-20816: the Credentials page adds, replaces and removes model keys, through the local dashboard's /models routes
// (the same path `onex models add|list|remove` runs).
//
// Failure modes, each with a test below:
//   K1  the page cannot tell the three states apart, or lists a provider it does not manage, or invents a row;
//   K2  an add sends something other than the provider, the key and the chosen models, or the key stays on screen;
//   K3  a failed pinned test reads as a pass, or loses the provider's reason;
//   K4  a remove runs without a confirmation, or a refusal (the last usable provider) is not shown;
//   K5  Ollama's row offers key controls it cannot honour;
//   K6  the key is written anywhere on the page after it is sent;
//   K7  a list that cannot be read shows an empty or invented table instead of saying so;
//   K8  the client sends the key anywhere but the PUT body, or loses the server's refusal text.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelKeys, type ModelKeysClient } from '@/pages/local/model-keys';
import { ModelKeysError, putModelKey, removeModelKey } from '@/services/models-api';
import type { ModelProviderRow } from '@/services/models-api';

// A live local dashboard, served same-origin by `onex dashboard`.
vi.mock('@/data-source/projection-base-url', () => ({ resolveCommandBaseUrl: () => '' }));

const KEY = 'sk-or-v1-synthetic-omn20816-page-0123456789';

function rows(overrides: Partial<Record<string, Partial<ModelProviderRow>>> = {}): ModelProviderRow[] {
  return (['gemini', 'openrouter', 'openai', 'ollama'] as const).map((provider) => ({
    provider, set_up: false, last_test: null, models: [], ...overrides[provider],
  }));
}

function client(list: ModelProviderRow[], extra: Partial<ModelKeysClient> = {}): ModelKeysClient {
  return {
    list: vi.fn(async () => list),
    put: vi.fn(async (provider: string) => ({ provider, status: 'passed', tested_at: '2026-10-21T09:00:00+00:00', model: 'm' })),
    remove: vi.fn(async () => undefined),
    ...extra,
  } as ModelKeysClient;
}

function row(name: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(`^${name}\\b`) });
}

afterEach(() => vi.restoreAllMocks());

describe('OMN-20816 model keys on the Credentials page', () => {
  it('K1: lists the four providers in order, each in its served state', async () => {
    render(<ModelKeys client={client(rows({
      openrouter: { set_up: true, models: ['openai/gpt-5-nano'], last_test: { provider: 'openrouter', status: 'passed', tested_at: 't1', model: 'openai/gpt-5-nano' } },
      openai: { set_up: true, models: ['gpt-5-nano'], last_test: { provider: 'openai', status: 'failed', tested_at: 't2', reason: '401 invalid api key' } },
    }))} />);
    await screen.findByRole('table', { name: 'Model providers' });
    const names = screen.getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(names).toEqual(['Gemini', 'OpenRouter', 'OpenAI', 'Ollama']);
    expect(within(row('Gemini')).getByText('Not set up')).toBeTruthy();
    expect(within(row('OpenRouter')).getByText('Last test passed')).toBeTruthy();
    expect(within(row('OpenRouter')).getByText('openai/gpt-5-nano')).toBeTruthy();
    expect(within(row('OpenAI')).getByText('Last test failed: 401 invalid api key')).toBeTruthy();
    expect(screen.queryByText('Anthropic')).toBeNull();
  });

  it('K2/K6: adds a key through a hidden field with the chosen model, then clears it and shows the test', async () => {
    const api = client(rows());
    render(<ModelKeys client={api} />);
    fireEvent.click(await within(await waitFor(() => row('OpenRouter'))).findByRole('button', { name: 'Add OpenRouter key' }));
    const key = screen.getByLabelText('OpenRouter API key') as HTMLInputElement;
    expect(key.type).toBe('password');
    fireEvent.change(key, { target: { value: KEY } });
    fireEvent.change(screen.getByLabelText('Model id'), { target: { value: 'openai/gpt-5-nano' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save and test' })); });
    expect(api.put).toHaveBeenCalledWith('openrouter', KEY, ['openai/gpt-5-nano']);
    expect(await screen.findByText('OpenRouter test passed')).toBeTruthy();
    // K6: the key is nowhere on the page once sent, in text or in any field.
    expect(document.body.textContent).not.toContain(KEY);
    for (const input of Array.from(document.querySelectorAll('input'))) expect(input.value).not.toBe(KEY);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('K2: several models are sent in the order typed, first tried first', async () => {
    const api = client(rows());
    render(<ModelKeys client={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Gemini key' }));
    fireEvent.change(screen.getByLabelText('Gemini API key'), { target: { value: 'AIza-synthetic' } });
    fireEvent.change(screen.getByLabelText('Model id'), { target: { value: ' gemini-a , gemini-b ' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save and test' })); });
    expect(api.put).toHaveBeenCalledWith('gemini', 'AIza-synthetic', ['gemini-a', 'gemini-b']);
  });

  it('K3: a failed test shows the provider reason, never a pass', async () => {
    const api = client(rows(), {
      put: vi.fn(async () => ({ provider: 'openai', status: 'failed', tested_at: 't', reason: '402 insufficient credits' })),
    } as Partial<ModelKeysClient>);
    render(<ModelKeys client={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add OpenAI key' }));
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: 'sk-synthetic' } });
    fireEvent.change(screen.getByLabelText('Model id'), { target: { value: 'gpt-5-nano' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save and test' })); });
    expect(await screen.findByText('OpenAI test failed: 402 insufficient credits')).toBeTruthy();
    expect(screen.queryByText('OpenAI test passed')).toBeNull();
  });

  it('K2: an add the server refuses shows its text and keeps nothing on screen', async () => {
    const api = client(rows(), {
      put: vi.fn(async () => { throw new ModelKeysError(422, 'refused', 'no-such/model is not in your key list. Nothing was stored.'); }),
    } as Partial<ModelKeysClient>);
    render(<ModelKeys client={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add OpenRouter key' }));
    fireEvent.change(screen.getByLabelText('OpenRouter API key'), { target: { value: KEY } });
    fireEvent.change(screen.getByLabelText('Model id'), { target: { value: 'no-such/model' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save and test' })); });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'no-such/model is not in your key list. Nothing was stored.');
    expect((screen.getByLabelText('OpenRouter API key') as HTMLInputElement).value).toBe('');
  });

  it('K4: remove asks first, then shows the refusal for the last usable provider', async () => {
    const api = client(rows({ gemini: { set_up: true, models: ['g'], last_test: { provider: 'gemini', status: 'passed', tested_at: 't' } } }), {
      remove: vi.fn(async () => { throw new ModelKeysError(409, 'last_usable_model', 'Gemini is the last model delegation can use, and at least one is required.'); }),
    } as Partial<ModelKeysClient>);
    render(<ModelKeys client={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Gemini key' }));
    expect(api.remove).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, remove the Gemini key' })); });
    expect(api.remove).toHaveBeenCalledWith('gemini');
    expect((await screen.findByRole('alert')).textContent).toContain('at least one is required');
  });

  it('K5: Ollama has no key controls and says how it is set up', async () => {
    render(<ModelKeys client={client(rows())} />);
    const ollama = await waitFor(() => row('Ollama'));
    expect(within(ollama).queryAllByRole('button')).toHaveLength(0);
    expect(within(ollama).getByText(/onboarding/)).toBeTruthy();
  });

  it('K7: a list that cannot be read says so and shows no table', async () => {
    render(<ModelKeys client={client([], { list: vi.fn(async () => { throw new ModelKeysError(0, 'file_mode', 'Model keys are managed on the live local dashboard.'); }) } as Partial<ModelKeysClient>)} />);
    expect((await screen.findByRole('status')).textContent).toContain('Model keys are managed on the live local dashboard.');
    expect(screen.queryByRole('table', { name: 'Model providers' })).toBeNull();
  });
});

describe('OMN-20816 models client', () => {
  it('K8: PUT sends the key and models only in the JSON body, and a refusal keeps the server text', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ provider: 'openrouter', test: { provider: 'openrouter', status: 'passed', tested_at: 't' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'last_usable_model', detail: 'at least one is required' }), { status: 409 }));
    const test = await putModelKey('openrouter', KEY, ['openai/gpt-5-nano']);
    expect(test.status).toBe('passed');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url).endsWith('/models/openrouter')).toBe(true);
    expect(String(url)).not.toContain(KEY);
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ key: KEY, models: ['openai/gpt-5-nano'] });
    await expect(removeModelKey('gemini')).rejects.toMatchObject({ status: 409, code: 'last_usable_model', message: 'at least one is required' });
    expect(String(fetchMock.mock.calls[1]![1]?.method)).toBe('DELETE');
  });
});
