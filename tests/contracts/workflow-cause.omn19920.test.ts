import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Missing declarations can escape the runtime render tests because the loader
// retains complete served rows. A stale catalogue or unanswered-question claim
// can separately mislead validation and closure after the ruling was recorded.
describe('OMN-19920 declared Workflow cause and recorded savings ruling', () => {
  it('declares the typed terminal cause on the same decisions binding as the outcome', () => {
    const page = JSON.parse(readFileSync('src/pages/local/workflow.contracts.yaml', 'utf8'));
    const bindings = page.components.find((component: {component_id: string}) => component.component_id === 'workflow-run-path').data_bindings;
    const decisions = bindings.find((binding: {binding_id: string}) => binding.binding_id === 'workflow-run-path-decisions');
    expect(decisions.projection_topic).toBe('onex.snapshot.projection.delegation.decisions.v1');
    expect(decisions.required_fields).toEqual(expect.arrayContaining(['correlation_id', 'terminal_ok', 'cost_usd']));
    expect(decisions.required_fields).toContain('terminal_failure_cause');
  });

  it('records that the live catalogue serves the cause field', () => {
    const catalogue = JSON.parse(readFileSync('src/pages/local/served-catalogue.lab.json', 'utf8'));
    const decisions = catalogue.exposures.find((exposure: {topic: string}) => exposure.topic === 'onex.snapshot.projection.delegation.decisions.v1');
    expect(decisions.status).toBe('ok');
    expect(decisions.columns).toContain('correlation_id');
    expect(decisions.columns).toContain('terminal_failure_cause');
  });

  it('records the October 22 ruling without claiming the savings question is unanswered', () => {
    const contract = readFileSync('contracts/OMN-19920.yaml', 'utf8');
    expect(contract).toContain('ticket_id: "OMN-19920"');
    expect(contract).toContain('2026-10-22');
    expect(contract).toContain('per-run saving stays on the Runs list only');
    expect(contract).not.toMatch(/still unanswered|waits on Jonah['’]s answer|waits on Jonah['’]s answer about/);
  });
});
