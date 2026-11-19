// @vitest-environment jsdom
// OMN-24616 AC7: a run opened from Runs shows a Runs breadcrumb that goes back to the same Runs view.
//
// Failure modes, each with a test below:
//   B1  a run opened from Runs offers no way back to Runs
//   B2  the way back drops the Runs filters the person had set
//   B3  a crafted from parameter sends the person off the dashboard, or to a page that is not Runs
//   B4  a run opened from anywhere else claims it came from Runs
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { Header } from '@/components/frame/Header';
import { RunsTable } from '@/pages/LocalDashboardPage';
import { ThemeProvider } from '@/theme';
import { readWorkflowFrom, workflowHref } from './workflow-url-state';

const NOW = Date.parse('2026-10-02T10:12:00Z');
const RUNS_VIEW = '/runs?status=failed&backend=local-qwen-coder';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><ThemeProvider>{children}</ThemeProvider></QueryClientProvider>;
}

function decision(id: string, writtenAt: string): Record<string, unknown> {
  return {
    correlation_id: id, written_at: writtenAt, created_at: writtenAt, model_name: 'Qwen3.8-27B',
    backend_id: 'local-qwen-coder', quality_gate_passed: false, quality_gate_detail: 'completed',
    tokens_input: 162, tokens_output: 52,
  };
}

describe('OMN-24616 AC7: the way back from a run to Runs', () => {
  it('B2: the address of a run opened from Runs carries that Runs view', () => {
    const href = workflowHref('run-1', RUNS_VIEW);
    expect(readWorkflowFrom(href.slice(href.indexOf('?')))).toBe(RUNS_VIEW);
  });

  it('B3: only a Runs address on this dashboard is carried or read', () => {
    for (const bad of ['https://example.com/runs', '//example.com/runs', '/overview', '/runsx', '/runs/../overview', 'javascript:alert(1)']) {
      expect(readWorkflowFrom(`?correlation_id=r&from=${encodeURIComponent(bad)}`)).toBeNull();
      expect(workflowHref('run-1', bad)).toBe(workflowHref('run-1'));
    }
  });

  it('B1, B2: the Runs table opens a run with its own view, and the run page breadcrumb goes back to it', () => {
    const { hook, searchHook } = memoryLocation({ path: RUNS_VIEW });
    render(<Router hook={hook} searchHook={searchHook}><RunsTable now={NOW} decisions={[decision('run-1', '2026-10-02T10:07:00Z')]} sessions={[]} syncUrl /></Router>);
    const open = screen.getAllByRole('link', { name: 'run-1' })[0]!;
    const href = open.getAttribute('href') ?? '';
    expect(readWorkflowFrom(href.slice(href.indexOf('?')))).toBe(RUNS_VIEW);

    window.history.replaceState(null, '', href);
    render(<Header />, { wrapper: Wrapper });
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Runs' })).toHaveAttribute('href', RUNS_VIEW);
    expect(within(crumbs).getByText('Workflow')).toHaveAttribute('aria-current', 'page');
  });

  it('B4: a run opened without a Runs view shows no Runs crumb', () => {
    window.history.replaceState(null, '', workflowHref('run-1'));
    render(<Header />, { wrapper: Wrapper });
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).queryByRole('link', { name: 'Runs' })).toBeNull();
  });
});
