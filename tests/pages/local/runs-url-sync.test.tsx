// @vitest-environment jsdom
// OMN-23309: the Runs table's URL sync rewrites the URL only while the path is /runs. The dashboard reviewer's
// 2026-11-06 review found a stale Runs table sending the browser back to /runs after the user had left it.
// Failure modes:
//   F1  a stale Runs table on another page rewrites the URL back to /runs;
//   F2  the fix stops /runs?page=99 from being replaced with its canonical page;
//   F3  the fix compares the full location, query included, and so never matches /runs (F2's case catches it).
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { RunsTable } from '@/pages/LocalDashboardPage';

afterEach(cleanup);

const decisions = [3, 2, 1].map(minute => ({
  correlation_id: `url-sync-run-${minute}`, created_at: `2026-11-06T13:0${minute}:00Z`,
  written_at: `2026-11-06T13:0${minute}:00Z`, model_name: 'model-a', quality_gate_passed: true, terminal_ok: true,
  tokens_input: 100, tokens_output: 10, cost_usd: '0', cost_tier_name: 'local', backend_id: 'local', data_source: 'real',
}));

function mount(path: string) {
  const memory = memoryLocation({ path, record: true });
  render(
    <Router hook={memory.hook} searchHook={memory.searchHook}>
      <RunsTable decisions={decisions} sessions={[]} syncUrl now={Date.parse('2026-11-06T14:00:00Z')} />
    </Router>,
  );
  return memory;
}

describe('OMN-23309: the Runs table rewrites the URL only on /runs', () => {
  it.each(['/overview?window=30d&page=8', '/usage?page=8', '/settings?section=access&page=8'])(
    'F1: leaving Runs for %s keeps the URL there',
    async destination => {
      const memory = mount('/runs');
      await act(async () => memory.navigate(destination));
      expect(memory.history.at(-1)).toBe(destination);
    },
  );

  it('F2/F3: on /runs a page past the last one is replaced with the canonical /runs', async () => {
    const memory = mount('/runs?page=99');
    await act(async () => {});
    expect(memory.history.at(-1)).toBe('/runs');
  });
});
