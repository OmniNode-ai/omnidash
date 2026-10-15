// @vitest-environment jsdom
// OMN-21015: the Workflow page's run summary shows more of what the runtime already serves for a run. A run's
// receipt says why it stopped, whether its answer was cut, what bar its score had to meet, how many tokens it used
// and how often it escalated; delegation.decisions.v1 serves each of those as a column of the run's row, and until
// now no page showed them (Lakshman, chat 2026-10-13 about 16:35Z, pointing at one run's receipt).
//
// Failure modes, each with a test below:
//   X1  a served field of the run is missing from its summary;
//   X2  a field the run's row does not carry reads 0, "no" or blank instead of Not recorded;
//   X3  Truncated shows the raw 0 or 1, says "no" for a row that does not say, or "yes" for a run that was not cut;
//   X4  a served zero (no escalations, no tokens out) is hidden as Not recorded: a measured zero is a figure;
//   X5  the page reads a field its contract does not declare, or one the captured lab catalogue does not serve.
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunSummary } from './LocalDashboardPage';

const run = (extra: Record<string, unknown> = {}) => ({
  correlation_id: 'run-a', quality_gate_passed: 1, quality_gate_detail: 'completed', actual_score: 1, required_bar: 0.8,
  task_type: 'document', model_name: 'local-model', backend_id: 'local-coder', host: 'lab-host', cost_tier_name: 'local',
  latency_ms: 743, tokens_input: 262, tokens_output: 7, finish_reason: 'stop', truncated: 0, escalation_count: 0, ...extra,
});
function fields(): Record<string, string> {
  const summary = screen.getByRole('region', { name: 'Run summary' });
  return Object.fromEntries(within(summary).getAllByRole('term').map((term) => [term.textContent ?? '', term.nextElementSibling?.textContent ?? '']));
}
const NEW = ['Required bar', 'Tokens in', 'Tokens out', 'Finish reason', 'Truncated', 'Escalations'];

describe('OMN-21015: the run summary shows the run\'s served facts', () => {
  it('X1: each served fact of the run is shown, as served', () => {
    render(<RunSummary decision={run()} />);
    const shown = fields();
    expect(NEW.map((label) => [label, shown[label]])).toEqual([
      ['Required bar', '0.8'], ['Tokens in', '262'], ['Tokens out', '7'], ['Finish reason', 'stop'], ['Truncated', 'no'], ['Escalations', '0'],
    ]);
    // What the summary showed before is still there.
    expect(shown['Quality score']).toBe('1');
    expect(shown.Model).toBe('local-model');
  });

  it('X2: a fact the row does not carry says Not recorded', () => {
    render(<RunSummary decision={run({ required_bar: null, tokens_input: undefined, tokens_output: null, finish_reason: '', truncated: null, escalation_count: undefined })} />);
    const shown = fields();
    expect(NEW.map((label) => shown[label])).toEqual(NEW.map(() => 'Not recorded'));
  });

  it.each([
    [1, 'yes'], [true, 'yes'], [0, 'no'], [false, 'no'],
  ])('X3: truncated served as %s reads %s', (served, text) => {
    render(<RunSummary decision={run({ truncated: served })} />);
    expect(fields().Truncated).toBe(text);
  });

  it('X3: a truncated value that is neither is shown as served, not guessed', () => {
    render(<RunSummary decision={run({ truncated: 'partial' })} />);
    expect(fields().Truncated).toBe('partial');
  });

  it('X4: a served zero is a figure and is shown', () => {
    render(<RunSummary decision={run({ tokens_output: 0, escalation_count: 0, required_bar: 0 })} />);
    const shown = fields();
    expect([shown['Tokens out'], shown.Escalations, shown['Required bar']]).toEqual(['0', '0', '0']);
  });

  it('X5: the Workflow contract declares each field the summary reads, and the lab catalogue serves each', () => {
    const contracts = JSON.parse(readFileSync('src/pages/local/workflow.contracts.yaml', 'utf8')) as {
      components: Array<{ data_bindings: Array<{ projection_topic: string; required_fields: string[] }> }>;
    };
    const binding = contracts.components.flatMap((c) => c.data_bindings).find((b) => b.projection_topic.endsWith('delegation.decisions.v1'));
    const catalogue = JSON.parse(readFileSync('src/pages/local/served-catalogue.lab.json', 'utf8')) as { exposures: Array<{ topic: string; columns: string[] }> };
    const served = catalogue.exposures.find((e) => e.topic.endsWith('delegation.decisions.v1'))?.columns ?? [];
    for (const field of ['required_bar', 'tokens_input', 'tokens_output', 'finish_reason', 'truncated', 'escalation_count']) {
      expect(`${field}: declared ${binding?.required_fields.includes(field)}, served ${served.includes(field)}`).toBe(`${field}: declared true, served true`);
    }
  });
});
