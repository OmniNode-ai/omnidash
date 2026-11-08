// @vitest-environment jsdom
// OMN-22168 (product owner, Slack 2026-11-07 21:18Z; Lakshman 2026-11-08 "uniform in whole platform", "when hover to
// that number we can see full numbers"): every token count the pages print reads short by the one dashboard count rule
// (K, M, B, T: 535,306,002 reads 535.3M), and the exact count is on hover. Failure modes, each with a test below:
//   B1  a Usage token card still prints the full integer;
//   B2  the card's peak caption still prints the full integer;
//   B3  the in / out directions under Tokens processed still print full integers;
//   B4  shortening loses the exact count: it must be the hover title (and the directions' accessible name);
//   B5  a run table or the per-model usage table still prints full integers;
//   B6  a missing count reads a short zero instead of its typed state.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecentRunsTable, RunsTable, UsageKpis } from '@/pages/LocalDashboardPage';
import { TokenDirections } from '@/components/dashboard/usage/TokenDirections';
import { UsageByModelDayTable } from '@/components/dashboard/usage/UsageByModelDayWidget';

afterEach(cleanup);

// The figures from the product owner's screenshot of the Usage page.
const ALL = { window_kind: 'all', window_start: '', as_of: '2026-11-07T21:17:00Z', baseline_model: 'claude-sonnet-5-5', baseline_state: 'resolved',
  spend_usd: '3.66', counterfactual_usd: '1738.59', savings_usd: '1734.93', runs_total: 2687, runs_unknown_tokens: 0,
  tokens_in: 535306002, tokens_out: 66891210 };
const day = (start: string, tokensIn: number, tokensOut: number) =>
  ({ ...ALL, window_kind: 'day', window_start: start, tokens_in: tokensIn, tokens_out: tokensOut });
const ROWS = [ALL, day('2026-11-02', 30000000, 3649514), day('2026-11-03', 42390332, 2000000)];

const NOW = Date.parse('2026-11-07T22:00:00Z');
const run = { correlation_id: 'run-big-tokens', task_type: 'document', model_name: 'Qwen3.8-27B', quality_gate_passed: 1,
  quality_gate_detail: 'completed', terminal_ok: 1, terminal_failure_cause: null, tokens_input: 1234567, tokens_output: 52,
  data_source: 'real', created_at: '2026-11-07T21:10:00Z', written_at: '2026-11-07T21:10:00Z' };

const card = (label: string) => document.querySelector<HTMLElement>(`[data-kpi-card="${label}"]`)!;
const figure = (label: string) => card(label).querySelector<HTMLElement>('.local-dashboard-metric')!;
const tone = (root: ParentNode, name: 'tokens-in' | 'tokens-out') =>
  [...root.querySelectorAll<HTMLElement>(`[data-field-tone="${name}"]`)];

describe('big token counts read short, exact on hover', () => {
  it('B1, B4: the Usage token cards show 535.3M and 66.89M, the exact count on hover', () => {
    render(<UsageKpis rows={ROWS} />);
    expect(figure('Tokens in').textContent).toBe('535.3M');
    expect(figure('Tokens in').getAttribute('title')).toBe('535,306,002 tokens in');
    expect(figure('Tokens out').textContent).toBe('66.89M');
    expect(figure('Tokens out').getAttribute('title')).toBe('66,891,210 tokens out');
  });

  it('B2: each token card peak caption is short', () => {
    render(<UsageKpis rows={ROWS} />);
    expect(card('Tokens in').textContent).toContain('Peak 42.39M on Nov 3');
    expect(card('Tokens out').textContent).toContain('Peak 3.64M on Nov 2');
    expect(card('Tokens in').textContent).not.toContain('42,390,332');
  });

  it('B3, B4: the in / out directions are short, the exact counts on hover and in their names', () => {
    const { container } = render(<TokenDirections input={3032528} output={1425061} />);
    expect([...container.querySelectorAll('.local-token-direction strong')].map(node => node.textContent)).toEqual(['3.03M', '1.42M']);
    expect(screen.getByLabelText('Input tokens: 3,032,528').getAttribute('title')).toBe('Input tokens: 3,032,528');
    expect(screen.getByLabelText('Output tokens: 1,425,061').getAttribute('title')).toBe('Output tokens: 1,425,061');
  });

  it('B5, B4: the Runs table and the recent runs show short counts with the exact count on hover', () => {
    for (const view of [<RunsTable key="all" now={NOW} decisions={[run]} sessions={[]} />,
      <RecentRunsTable key="recent" now={NOW} decisions={[run]} sessions={[]} />]) {
      const { container, unmount } = render(view);
      const cells = tone(container, 'tokens-in');
      expect(cells.length).toBeGreaterThan(0);
      for (const cell of cells) {
        expect(cell.textContent).toBe('1.23M');
        expect(cell.closest('[title]')?.getAttribute('title')).toContain('1,234,567');
      }
      expect(container.textContent).not.toContain('1,234,567');
      unmount();
    }
  });

  it('B5, B4: the per-model usage table shows short counts with the exact count on hover', () => {
    const { container } = render(<UsageByModelDayTable rows={[{ tenant_id: 't', usage_day: '2026-11-07', model_id: 'qwen',
      cost_tier_name: 'local', input_tokens: 535306002, output_tokens: 66891210, measured_cost_usd: 0, unmeasured_call_count: 0,
      call_count: 3, call_share: 1 }]} />);
    const [tokensIn] = tone(container, 'tokens-in').filter(node => node.tagName === 'TD');
    expect(tokensIn!.textContent).toBe('535.3M');
    expect(tokensIn!.querySelector('[title]')?.getAttribute('title')).toBe('535,306,002 tokens in');
  });

  it('B6: a missing count keeps its typed state, never a short zero', () => {
    render(<UsageKpis rows={[{ ...ALL, tokens_in: null }]} />);
    expect(figure('Tokens in').textContent).toBe('Not measured');
    const { container } = render(<TokenDirections input={null} output={0} />);
    expect([...container.querySelectorAll('.local-token-direction strong')].map(node => node.textContent)).toEqual(['Not measured', '0']);
  });

  it('control: a count under a thousand is unchanged', () => {
    const { container } = render(<TokenDirections input={999} output={12} />);
    expect([...container.querySelectorAll('.local-token-direction strong')].map(node => node.textContent)).toEqual(['999', '12']);
  });
});
