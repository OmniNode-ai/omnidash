// @vitest-environment jsdom
// OMN-21166 AC27 (mockup build, 2026-10-18): the Runs table opens on its primary fields, with every one of its 18
// served fields one switch away. Chrome walk 2026-10-18: all 18 squeezed into one view cut ids to five characters
// and broke failure causes one letter per line.
//
// Failure modes, each with a test below:
//   P1  the table opens with all 18 fields at once (no compact view), or the switch cannot bring them back
//   P2  a field is dropped from the page instead of hidden by the layout, so it is lost to tests and assistive tech
//   P3  a long cause is cut with its full text lost
//   P4  a task type has no icon, or a missing task type is drawn as one
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunsTable } from './LocalDashboardPage';

const READABLE_CAUSE = 'Malformed output: response does not compile as Python: invalid syntax; Task mismatch: code generation response contains no code artifact';
const NOW = Date.parse('2026-10-18T08:00:00Z');
const CAUSE = 'MALFORMED: response does not compile as Python: invalid syntax; TASK_MISMATCH: code_generation response contains no code artifact';

function run(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    correlation_id: id, written_at: '2026-10-16T22:11:24Z', created_at: '2026-10-16T22:11:24Z', model_name: 'Qwen3.8-27B',
    quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 389, tokens_input: 222, tokens_output: 8,
    task_type: 'code_generation', backend_id: 'local-coder', host: '127.0.0.1', ...extra,
  };
}

const wrap = () => screen.getByRole('table').closest('.local-dashboard-table-wrap') as HTMLElement;

describe('OMN-21166 AC27: Runs opens compact, all fields one switch away', () => {
  it('P1, P2: compact by default; the switch shows all 18; every field stays in the page either way', () => {
    render(<RunsTable now={NOW} decisions={[run('run-a')]} sessions={[]} />);
    const toggle = screen.getByRole('checkbox', { name: 'Show all run fields' });
    expect(toggle).not.toBeChecked();
    expect(wrap()).not.toHaveClass('local-runs-wrap--all');
    expect(within(wrap()).getAllByRole('columnheader')).toHaveLength(18);
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(wrap()).toHaveClass('local-runs-wrap--all');
    expect(within(wrap()).getAllByRole('columnheader')).toHaveLength(18);
  });

  // OMN-19919 AC5: the cause shown is the label the detail leads with (the cause the filter and the Overview list use);
  // the whole detail stays on the row, as the cause's title and under "Read failure details".
  it('P3: a long cause keeps its whole text as its title', () => {
    render(<RunsTable now={NOW} decisions={[run('run-b', { quality_gate_passed: false, quality_gate_detail: CAUSE })]} sessions={[]} />);
    const cause = screen.getByTitle(READABLE_CAUSE);
    expect(cause).toHaveClass('local-runs-cause');
    expect(cause.textContent).toBe('Malformed output');
    expect(screen.getByText('Read failure details').closest('details')?.textContent).toBe(`Read failure details${READABLE_CAUSE}`);
  });

  it('P4: a task type carries its own icon; a missing one reads Not recorded with no icon', () => {
    render(<RunsTable now={NOW} decisions={[run('run-c'), run('run-d', { task_type: null, written_at: '2026-10-16T22:10:00Z', created_at: '2026-10-16T22:10:00Z' })]} sessions={[]} />);
    const task = within(wrap()).getByText('code generation', { exact: true }).closest('td')!;
    expect(task.querySelector('svg.lucide-code-xml')).not.toBeNull();
    const missing = screen.getByRole('row', { name: /run-d/ });
    const cells = within(missing).getAllByRole('cell');
    const index = within(wrap()).getAllByRole('columnheader').findIndex(cell => cell.textContent === 'Task type');
    expect(cells[index]!.textContent).toBe('Not recorded');
    expect(cells[index]!.querySelector('svg')).toBeNull();
  });
});
