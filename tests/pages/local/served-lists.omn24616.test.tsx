// @vitest-environment jsdom
// OMN-24616 AC4: the local pages hold no provider or tier list of their own: a key renders by the one declared source
// (src/contracts/local-display-names.ts) or, when that does not know it, by its served name.
// The audit found provider labels and order, tier names in tables that disagree, and literal tier keys in the pages.
// Failure modes:
//   G1  a provider-id or tier-id literal remains under src/pages/local
//   L1  a provider the declared source does not know loses its place after the known ones
//   L2  a provider the declared source does not know is renamed ("Acme-labs") instead of keeping its served name
//   L3  a provider, tier or task type the code has never seen does not render by its served name
//   G2  a window-length list remains under src/pages/local instead of the one declared list
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelKeys, type ModelKeysClient } from '@/pages/local/model-keys';
import { taskLabel, tierLabel } from '@/pages/local/plain-text';
import { LOCAL_WINDOWS } from '@/contracts/local-windows';
import type { ModelProviderRow } from '@/services/models-api';

const LOCAL = join(process.cwd(), 'src/pages/local');
const PROVIDER_OR_TIER = /['"`](gemini|openrouter|openai|ollama|reflection|anthropic|local|cheap_cloud|cheap_frontier|premium_cloud|frontier|claude|cloud|harness|not_tier_routed)['"`]|\b(gemini|openrouter|openai|ollama|cheap_cloud|cheap_frontier|not_tier_routed)\s*:/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const row = (provider: string): ModelProviderRow => ({ provider, set_up: true, last_test: null, models: [] });

describe('OMN-24616 AC4: no provider or tier list of the pages\' own', () => {
  it('G1: no provider-id or tier-id literal under src/pages/local', () => {
    const offending = sources(LOCAL).flatMap((path) => readFileSync(path, 'utf8').split('\n')
      .map((line, index) => ({ path, line: index + 1, text: line }))
      .filter(({ text }) => !text.trim().startsWith('//') && !text.trim().startsWith('*') && PROVIDER_OR_TIER.test(text)));
    expect(offending.map(({ path, line, text }) => `${path.slice(LOCAL.length + 1)}:${line}: ${text.trim()}`)).toEqual([]);
  });

  it('G2: no window-length list under src/pages/local; the declared list drives them', () => {
    const WINDOW_LIST = /\[7, 15, 30, 90\]|'last-(7|15|30|90)'|'(7|15|30|90)d'|days: (7|15|30|90),? label/;
    const offending = sources(LOCAL).flatMap((path) => readFileSync(path, 'utf8').split('\n')
      .map((line, index) => ({ path, line: index + 1, text: line }))
      .filter(({ text }) => !text.trim().startsWith('//') && !text.trim().startsWith('*') && WINDOW_LIST.test(text)));
    expect(offending.map(({ path, line, text }) => `${path.slice(LOCAL.length + 1)}:${line}: ${text.trim()}`)).toEqual([]);
    expect(LOCAL_WINDOWS.map(window => window.days)).toEqual([0, 1, 7, 15, 30, 90]);
  });

  it('L1, L2, L3: known providers by the declared source, any other by its served name, in the served order', async () => {
    const served = [row('openai'), row('acme-labs'), row('gemini')];
    render(<ModelKeys client={{ list: async () => served } as ModelKeysClient} />);
    const cards = await screen.findAllByRole('article');
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['Gemini', 'OpenAI', 'acme-labs']);
  });

  it('L3: a tier and a task type never seen render by their served names', () => {
    expect(tierLabel('quantum_tier')).toBe('Quantum tier');
    expect(taskLabel('summarize_long_document')).toBe('summarize long document');
  });
});
