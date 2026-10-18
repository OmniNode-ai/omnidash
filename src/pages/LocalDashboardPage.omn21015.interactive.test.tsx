// @vitest-environment jsdom
// OMN-21015 stage 5, U3 and U4: a run can be opened from anywhere it is named, an id or a command can be copied, and
// Workflow shows the served steps as a diagram above the timeline.
//
// Failure modes, each with a test below:
//   I1  a run named in Overview (last run, recent runs) opens another run, or a run with no id gets a link;
//   I2  the copy button copies something other than the text it sits beside;
//   I3  with no clipboard the button throws, or says it copied;
//   I4  the diagram re-orders the served steps, drops one, or drops a kind it does not know;
//   I5  the diagram marks a step other than the one the terminal names as failing, or marks one when none is named;
//   I6  a diagram node leads to another step of the timeline than its own;
//   I7  a run with no steps draws an empty diagram;
//   I9  after a copy the text beside the button changes (Workflow moves to a newer run) and the button still says
//       Copied, although the clipboard holds the earlier text;
//   I10 a copy still unanswered when the text changes marks the new text Copied, or Copy failed, when it answers;
//   I11 dropping stale feedback also drops it for the text that was copied: a re-render with the same text, or a
//       copy of the new text, no longer says Copied;
//   I12 two copies overlap and the older one answers last, and its answer replaces the newer one's.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton, LastRunCard, RecentRunsTable, RunDiagram, RunTimeline } from './LocalDashboardPage';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const decision = (id: string | null, writtenAt: string) => ({
  correlation_id: id, written_at: writtenAt, created_at: writtenAt, quality_gate_passed: true, quality_gate_detail: 'completed',
  model_name: 'local-model', latency_ms: 813, tokens_input: 162, tokens_output: 52, task_type: 'summarization',
  cost_tier_name: 'local', actual_score: 1, backend_id: 'local-coder', host: 'lab',
});
const step = (sequence: number, kind: string, extra: Record<string, unknown> = {}) => ({
  correlation_id: 'r', step_sequence: sequence, step_kind: kind, started_at: `2026-10-13T10:00:0${sequence}+00:00`,
  duration_ms: null, outcome: 'succeeded', failure_cause: null, failing_step_sequence: null, ...extra,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OMN-21015 U4: a run opens from where it is named', () => {
  it('I1: the last run links to its own path', () => {
    render(<LastRunCard decisions={[decision('older', '2026-10-13T10:00:00Z'), decision('newest', '2026-10-13T11:00:00Z')]} sessions={[]} now={NOW} />);
    const link = screen.getByRole('link', { name: 'newest' });
    expect(link.getAttribute('href')).toBe('/workflow?correlation_id=newest');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('I1: each recent run links to its own path, and a run with no id has no link', () => {
    render(<RecentRunsTable decisions={[decision('run-a', '2026-10-13T10:00:00Z'), decision('run-b', '2026-10-13T11:00:00Z'), decision(null, '2026-10-13T09:00:00Z')]} sessions={[]} now={NOW} />);
    expect(screen.getAllByRole('link').filter(link => link.closest('tbody')).map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['run-b', '/workflow?correlation_id=run-b'],
      ['run-a', '/workflow?correlation_id=run-a'],
    ]);
  });
});

describe('OMN-21015 U1: a timestamp in a run table', () => {
  // I8: the cell lets a timestamp break in two places; the text it shows must still be the served text, whole.
  const timeCell = (runId: string) => screen.getByRole('link', { name: runId }).closest('tr')?.querySelector('td')?.textContent;

  // OMN-21166 R-A (Lakshman, 2026-10-18): an ISO time is written for reading; the served text stays whole on the element.
  it('I8: an ISO time reads as month, day and time with the served text on the element, a time in another form is shown as served, a missing one says Not recorded', () => {
    render(<RecentRunsTable
      decisions={[
        decision('run-iso', '2026-10-13T10:52:43.446325+00:00'),
        decision('run-odd', 'yesterday at noon'),
        { ...decision('run-none', '2026-10-13T09:00:00Z'), written_at: null },
      ]}
      sessions={[]}
      now={NOW}
    />);
    expect(timeCell('run-iso')).toBe('Oct 13, 10:52:43 UTC');
    expect(screen.getByRole('link', { name: 'run-iso' }).closest('tr')?.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-13T10:52:43.446325+00:00');
    expect(timeCell('run-odd')).toBe('yesterday at noon');
    expect(timeCell('run-none')).toBe('Not recorded');
  });
});

describe('OMN-21015 U4: copy', () => {
  it('I2: the button copies exactly the text it is given, and says so', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<CopyButton text={'onex delegate "ping"'} label="Copy the command" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy the command' })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('onex delegate "ping"');
    expect(screen.getByRole('button', { name: 'Copy the command' }).textContent).toContain('Copied');
  });

  it('I3: with no clipboard it says the copy failed, and never says Copied', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    render(<CopyButton text="abc" label="Copy the run id" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy the run id' })); });
    const button = screen.getByRole('button', { name: 'Copy the run id' });
    expect(button.textContent).toContain('Copy failed');
    expect(button.textContent).not.toContain('Copied');
  });

  it('I3: a clipboard that refuses says the copy failed', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    render(<CopyButton text="abc" label="Copy the run id" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy the run id' })); });
    expect(screen.getByRole('button', { name: 'Copy the run id' }).textContent).toContain('Copy failed');
  });

  /** A clipboard whose writes stay unanswered until the test answers them, in any order. */
  function heldClipboard() {
    const writes: Array<{ text: string; resolve: () => void; reject: (cause: Error) => void }> = [];
    const writeText = vi.fn((text: string) => new Promise<void>((resolve, reject) => { writes.push({ text, resolve, reject }); }));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    return writes;
  }
  const copyButton = () => screen.getByRole('button', { name: 'Copy the run id' });
  const click = async () => { await act(async () => { fireEvent.click(copyButton()); }); };

  it('I9: when the text beside the button changes, a finished copy of the earlier text is no longer announced', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } });
    const { rerender } = render(<CopyButton text="run-a" label="Copy the run id" />);
    await click();
    expect(copyButton().textContent).toContain('Copied');
    rerender(<CopyButton text="run-b" label="Copy the run id" />);
    expect(copyButton().textContent).not.toContain('Copied');
    expect(copyButton().getAttribute('data-state')).toBe('idle');
  });

  it('I9: a failed copy of the earlier text is not announced beside the new text either', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const { rerender } = render(<CopyButton text="run-a" label="Copy the run id" />);
    await click();
    expect(copyButton().textContent).toContain('Copy failed');
    rerender(<CopyButton text="run-b" label="Copy the run id" />);
    expect(copyButton().textContent).not.toContain('Copy failed');
    expect(copyButton().getAttribute('data-state')).toBe('idle');
  });

  it.each([
    ['succeeds', 'Copied'],
    ['fails', 'Copy failed'],
  ])('I10: a copy that %s after the text changed says nothing about the new text', async (how, announced) => {
    const writes = heldClipboard();
    const { rerender } = render(<CopyButton text="run-a" label="Copy the run id" />);
    await click();
    rerender(<CopyButton text="run-b" label="Copy the run id" />);
    await act(async () => { if (how === 'succeeds') writes[0]!.resolve(); else writes[0]!.reject(new Error('denied')); });
    expect(writes.map((write) => write.text)).toEqual(['run-a']);
    expect(copyButton().textContent).not.toContain(announced);
    expect(copyButton().getAttribute('data-state')).toBe('idle');
  });

  it('I11: the same text rendered again keeps saying Copied', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } });
    const { rerender } = render(<CopyButton text="run-a" label="Copy the run id" />);
    await click();
    rerender(<CopyButton text="run-a" label="Copy the run id" />);
    expect(copyButton().textContent).toContain('Copied');
  });

  it('I11: after the text changed, a copy of the new text copies it and says so', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { rerender } = render(<CopyButton text="run-a" label="Copy the run id" />);
    await click();
    rerender(<CopyButton text="run-b" label="Copy the run id" />);
    await click();
    expect(writeText.mock.calls.map((call) => call[0])).toEqual(['run-a', 'run-b']);
    expect(copyButton().textContent).toContain('Copied');
  });

  it('I12: of two overlapping copies, the one started last decides what the button says', async () => {
    const writes = heldClipboard();
    const { rerender } = render(<CopyButton text="run-a" label="Copy the run id" />);
    await click();
    rerender(<CopyButton text="run-b" label="Copy the run id" />);
    await click();
    expect(writes.map((write) => write.text)).toEqual(['run-a', 'run-b']);
    // The newer copy is answered first; the older one then fails late.
    await act(async () => { writes[1]!.resolve(); });
    expect(copyButton().textContent).toContain('Copied');
    await act(async () => { writes[0]!.reject(new Error('denied')); });
    expect(copyButton().textContent).toContain('Copied');
    expect(copyButton().textContent).not.toContain('Copy failed');
  });
});

describe('OMN-21015 U3: the run as a diagram', () => {
  const served = [step(1, 'request'), step(2, 'routing_decision'), step(3, 'provider_call'), step(4, 'quality_gate'), step(5, 'terminal')];
  const nodes = () => within(screen.getByRole('navigation', { name: 'Run steps, in the order served' })).getAllByRole('link');

  it('I4: one node per served step, in the order served, whatever that order is', () => {
    render(<RunDiagram steps={[served[4], served[0], served[2], served[1], served[3]]} />);
    expect(nodes().map((node) => node.getAttribute('data-step-kind'))).toEqual(['terminal', 'request', 'provider_call', 'routing_decision', 'quality_gate']);
  });

  it('I4: a kind the page does not know is a node, named as served', () => {
    render(<RunDiagram steps={[served[0], step(2, 'cache_lookup'), served[4]]} />);
    expect(nodes().map((node) => node.textContent)).toEqual(['Requestsucceeded', 'cache_lookupsucceeded', 'Terminalsucceeded']);
  });

  it('I5: the failing node is the one the terminal names, and only that one', () => {
    const failed = [
      served[0],
      step(2, 'provider_call', { outcome: 'failed', failure_cause: 'rate_limited' }),
      step(3, 'provider_call', { outcome: 'failed', failure_cause: 'timeout' }),
      step(4, 'terminal', { outcome: 'failed', failure_cause: 'timeout', failing_step_sequence: 3 }),
    ];
    render(<RunDiagram steps={failed} />);
    expect(nodes().map((node) => node.getAttribute('data-failing-step'))).toEqual([null, null, 'true', null]);
  });

  it('I5: a run with a failed step and no named failing step marks none', () => {
    render(<RunDiagram steps={[served[0], step(2, 'provider_call', { outcome: 'failed' }), step(3, 'terminal')]} />);
    expect(nodes().every((node) => node.getAttribute('data-failing-step') === null)).toBe(true);
  });

  it('I6: each node leads to its own step in the timeline', () => {
    render(<><RunDiagram steps={served} /><RunTimeline steps={served} /></>);
    const targets = nodes().map((node) => node.getAttribute('href'));
    expect(targets).toEqual(['#run-step-1', '#run-step-2', '#run-step-3', '#run-step-4', '#run-step-5']);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => `#${item.id}`)).toEqual(targets);
    expect(items[2].querySelector('strong')?.textContent).toBe('Provider call');
    expect(nodes()[2].getAttribute('data-step-kind')).toBe('provider_call');
  });

  it('I7: no steps, no diagram', () => {
    const { container } = render(<RunDiagram steps={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
