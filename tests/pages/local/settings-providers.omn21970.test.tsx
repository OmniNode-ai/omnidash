// @vitest-environment jsdom
// OMN-21970 AC10 (Lakshman 2026-11-02): Settings lists each provider GET /models serves as its own card, with the
// fields the backend serves for it and nothing it does not. Failure modes, declared before the code, each with a test:
//   P1  a failed test's full error (hundreds of characters) shows before it is opened;
//   P2  a failed test loses its failure class, or any served test field (time, model, backend, endpoint) is not shown;
//   P3  a field the backend leaves null renders anyway (an empty label, "null", or an invented value);
//   P4  a long model list runs on: more than three models show before it is opened, or the count of the rest is lost;
//   P5  tried_first and first_model are not shown when served, or shown when false or null;
//   P6  a provider name the page does not know is dropped instead of getting a card like the others;
//   P7  a provider that is not set up gives no set-up command;
//   P8  a key with no last_used_at stops reading Never (OMN-19996), or keys lose Last used inside the cards;
//   P9  the cards add a control: a button, form or input (the page stays read-only, OMN-20816).
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelKeys, type ModelKeysClient } from '@/pages/local/model-keys';
import type { ModelProviderRow } from '@/services/models-api';

vi.mock('@/data-source/projection-base-url', () => ({ resolveCommandBaseUrl: () => '' }));

const GEMINI_MODELS = Array.from({ length: 18 }, (_, index) => `gemini-model-${index + 1}`);
const REASON = "timeout: pinned_backend_failed: the run is pinned to backend 'byok-gemini' and does not move to another backend: Server error '503 Service Unavailable'";
const SERVED = [
  { provider: 'gemini', set_up: true, models: GEMINI_MODELS, tried_first: false, first_model: null,
    last_test: { provider: 'gemini', status: 'failed', tested_at: '2026-10-29T10:28:41+00:00', backend_id: 'byok-gemini', model: 'gemini-model-1', endpoint: null, reason: REASON } },
  { provider: 'openrouter', set_up: true, models: ['nvidia/nemotron:free', 'google/gemma:free'], tried_first: true, first_model: 'nvidia/nemotron:free',
    last_test: { provider: 'openrouter', status: 'passed', tested_at: '2026-10-28T09:00:00+00:00', backend_id: 'byok-openrouter', model: 'nvidia/nemotron:free', endpoint: 'https://openrouter.ai/api/v1', reason: null } },
  { provider: 'openai', set_up: false, models: [], last_test: null },
  { provider: 'ollama', set_up: false, models: [], last_test: null },
  { provider: 'acme_gateway', set_up: true, models: ['acme-1'], last_test: null },
] as unknown as ModelProviderRow[];
const client = (list = SERVED): ModelKeysClient => ({ list: vi.fn(async () => list) });
const KEYS = [{ provider: 'gemini', name: 'llm.gemini.api_key', fingerprint: 'bd161cac', set_at: '2026-10-14T08:24:11Z', revoked_at: null }];
const card = (name: string) => screen.getByRole('article', { name });

async function renderCards() {
  const view = render(<ModelKeys client={client()} keys={KEYS} />);
  await screen.findByRole('article', { name: 'Gemini' });
  return view;
}

describe('OMN-21970 AC10: one card per provider, served fields only', () => {
  it('P1: the full error is inside a closed disclosure, never shown before it is opened', async () => {
    await renderCards();
    const disclosure = within(card('Gemini')).getByText(REASON).closest('details');
    expect(disclosure).not.toBeNull();
    expect(disclosure?.open).toBe(false);
    expect(within(card('Gemini')).getByText('Show the full error')).toBeTruthy();
  });

  it('P2: a failed test shows its failure class and every served test field', async () => {
    await renderCards();
    const gemini = within(card('Gemini'));
    expect(gemini.getByText('Last test failed · timeout')).toBeTruthy();
    expect(gemini.getByText('Oct 29, 10:28:41 UTC')).toBeTruthy();
    expect(gemini.getByText('byok-gemini')).toBeTruthy();
    const openrouter = within(card('OpenRouter'));
    expect(openrouter.getByText('Last test passed')).toBeTruthy();
    expect(openrouter.getByText('https://openrouter.ai/api/v1')).toBeTruthy();
    expect(openrouter.getByText('byok-openrouter')).toBeTruthy();
  });

  it('P3: a null endpoint, first_model or last_test renders no label and no value', async () => {
    await renderCards();
    expect(within(card('Gemini')).queryByText('Endpoint')).toBeNull();
    expect(within(card('Gemini')).queryByText(/Tried first/)).toBeNull();
    expect(within(card('OpenAI')).queryByText('Last test')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bnull\b|undefined/);
  });

  it('P4: 18 models show 3 and "+15 more", the rest inside a closed disclosure', async () => {
    await renderCards();
    const models = within(card('Gemini')).getByRole('list', { name: 'Gemini models' });
    const shown = [...models.querySelectorAll(':scope > li')].map(item => item.textContent);
    expect(shown).toEqual(['gemini-model-1', 'gemini-model-2', 'gemini-model-3']);
    const more = within(card('Gemini')).getByText('+15 more').closest('details');
    expect(more?.open).toBe(false);
    expect(more?.querySelectorAll('li')).toHaveLength(15);
    expect(within(card('OpenRouter')).queryByText(/more$/)).toBeNull();
  });

  it('P5: Tried first shows with its first model when served, and not when false', async () => {
    await renderCards();
    expect(within(card('OpenRouter')).getByText('Tried first · nvidia/nemotron:free')).toBeTruthy();
    expect(within(card('Gemini')).queryByText(/Tried first/)).toBeNull();
  });

  it('P6: a provider name the page does not know gets a card like the others, after the four', async () => {
    await renderCards();
    expect(screen.getAllByRole('article').map(item => item.getAttribute('aria-label'))).toEqual(['Gemini', 'OpenRouter', 'OpenAI', 'Ollama', 'Acme_gateway']);
    expect(within(card('Acme_gateway')).getByText('acme-1')).toBeTruthy();
  });

  it('P7: a provider not set up says so and names its set-up command', async () => {
    await renderCards();
    expect(within(card('OpenAI')).getByText('Not set up')).toBeTruthy();
    expect(within(card('OpenAI')).getByText('onex models add openai')).toBeTruthy();
    expect(within(card('Ollama')).getByText(/onboarding/)).toBeTruthy();
  });

  it('P8: each key keeps Last used inside its provider card, Never when it has none', async () => {
    await renderCards();
    const key = within(card('Gemini')).getByRole('list', { name: 'Gemini keys' });
    expect(within(key).getByText('llm.gemini.api_key')).toBeTruthy();
    expect(within(key).getByText('bd161cac')).toBeTruthy();
    expect(within(key).getByText('Last used')).toBeTruthy();
    expect(within(key).getByText('Never')).toBeTruthy();
    expect(within(card('OpenAI')).getByText('No key')).toBeTruthy();
  });

  it('P9: the cards add no button, form, input or editable field', async () => {
    const { container } = await renderCards();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('form, input, textarea, select, button, [contenteditable]')).toHaveLength(0);
  });
});
