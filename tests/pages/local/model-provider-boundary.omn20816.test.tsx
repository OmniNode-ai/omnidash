// @vitest-environment jsdom
// AC1: /models is independent of the tenant-credentials projection.
// Failure modes: pending, missing and failed projection; failed /models;
// duplicate mounting and accidental mutation controls. Healthy empty is the control.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ state: 'healthy' as string, list: vi.fn() }));
vi.mock('@/data-source', () => ({ createSnapshotSource: () => ({
  async *readAll() { yield []; },
  readSnapshot: async () => {
    if (h.state === 'pending') return new Promise(() => {});
    if (h.state === 'failed') throw new Error('credential projection unavailable');
    return { rows: [], rowCount: 0, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
  },
}) }));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/projection-tenant', async (original) => ({
  ...(await original<typeof import('@/data-source/projection-tenant')>()), resolveConfiguredTenant: () => 'review-tenant',
}));
vi.mock('@/data-source/exposure-census', () => ({ fetchExposureCensus: async () => ({
  rows: h.state === 'missing' ? [] : [{ topic: 'onex.snapshot.projection.tenant-credentials.v1', reachability: 'reachable' }],
}) }));
vi.mock('@/services/models-api', async (original) => ({
  ...(await original<typeof import('@/services/models-api')>()), listModelKeys: h.list,
}));
import { LocalDashboardPage } from '@/pages/LocalDashboardPage';
import { ModelKeysError } from '@/services/models-api';

beforeEach(() => {
  h.state = 'healthy';
  h.list.mockReset();
  h.list.mockResolvedValue(['gemini', 'openrouter', 'openai', 'ollama'].map(provider => ({
    provider, set_up: false, last_test: null, models: [],
  })));
});

it.each(['healthy', 'pending', 'missing', 'failed'])('AC1: %s credentials do not suppress or duplicate the independent provider read', async (state) => {
  h.state = state;
  render(<LocalDashboardPage pageName="credentials" />);
  const table = await screen.findByRole('table', { name: 'Model providers' });
  expect(table).toBeVisible();
  expect(screen.getAllByRole('table', { name: 'Model providers' })).toHaveLength(1);
  expect(h.list).toHaveBeenCalledTimes(1);
  expect(within(table).getAllByRole('rowheader').map(el => el.textContent)).toEqual(['Gemini', 'OpenRouter', 'OpenAI', 'Ollama']);
  expect(table.closest('[aria-busy="true"]')).toBeNull();
  const region = screen.getByRole('region', { name: 'Model providers' });
  expect(region.querySelector('input, textarea, select, form, button, [contenteditable="true"]')).toBeNull();
  if (state === 'healthy') { expect(await within(table).findByText('onex models add gemini')).toBeVisible(); expect(screen.queryByText('No provider credentials recorded')).toBeNull(); }
  if (state === 'pending') expect(screen.getByText('Loading data…')).toBeVisible();
  if (state === 'missing') expect(await screen.findByText('Not available yet: credentials.')).toBeVisible();
  if (state === 'failed') expect(await screen.findByRole('alert')).toHaveTextContent('data is unavailable.');
});

it('AC1: a failed models read retains its typed message independently of missing credentials', async () => {
  h.state = 'missing';
  h.list.mockRejectedValue(new ModelKeysError(503, 'server', 'Model provider service unavailable'));
  render(<LocalDashboardPage pageName="credentials" />);
  expect(await screen.findByText('Model provider service unavailable')).toBeVisible();
  expect(await screen.findByText('Not available yet: credentials.')).toBeVisible();
  expect(screen.queryByRole('table', { name: 'Model providers' })).toBeNull();
  expect(h.list).toHaveBeenCalledTimes(1);
});
