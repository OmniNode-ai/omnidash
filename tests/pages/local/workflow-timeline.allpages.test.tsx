// @vitest-environment jsdom
// OMN-23330 AC13 (the operator's 2026-11-09 review of Workflow): the run timeline says "not recorded" once per step.
// Read 2026-11-10 in RunTimeline: a step with no start, no duration and (for a routing decision) no reason, candidates or
// confidence said it up to six times, once in its duration, once for its start time, once under its bar and once in each
// routing chip.
// Failure modes:
//   W1  a step says "not recorded" more than once;
//   W2  the one statement loses a fact: it must still name each missing fact (start, duration, reason, ...);
//   W3  a step with everything recorded says "not recorded" at all, or a measured value is dropped (a confidence of 0);
//   W4  a fact that is recorded is listed as missing.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunTimeline } from '@/pages/LocalDashboardPage';

const steps = (container: HTMLElement) => [...container.querySelectorAll('ol.local-dashboard-steps > li')] as HTMLElement[];
const count = (text: string) => (text.match(/not recorded/gi) ?? []).length;

describe('OMN-23330 AC13: the Workflow timeline says "not recorded" once per step', () => {
  it('W1, W2: a step with nothing recorded says it once, naming each missing fact', () => {
    const { container } = render(<RunTimeline steps={[
      { step_sequence: 1, step_kind: 'routing_decision', outcome: 'succeeded' },
      { step_sequence: 2, step_kind: 'provider_call', outcome: 'succeeded' },
    ]} />);
    const [routing, call] = steps(container);
    expect(count(routing!.textContent ?? '')).toBe(1);
    expect(count(call!.textContent ?? '')).toBe(1);
    const said = routing!.querySelector('[data-not-recorded]')?.textContent ?? '';
    for (const fact of ['start', 'duration', 'reason', 'candidates', 'confidence']) expect(said).toContain(fact);
    expect(call!.querySelector('[data-not-recorded]')?.textContent).toMatch(/start.*duration/);
  });

  it('W3: a fully recorded step never says it, and a measured confidence of 0 stays a value', () => {
    const { container } = render(<RunTimeline steps={[{ step_sequence: 1, step_kind: 'routing_decision', outcome: 'succeeded',
      started_at: '2026-11-10T01:00:00Z', duration_ms: 120, reason: 'cheapest', candidates: ['local'], confidence: 0 }]} />);
    const [step] = steps(container);
    expect(count(step!.textContent ?? '')).toBe(0);
    expect(step!.textContent).toContain('confidence: 0');
  });

  it('W4: only the missing facts are named', () => {
    const { container } = render(<RunTimeline steps={[{ step_sequence: 1, step_kind: 'provider_call', outcome: 'succeeded',
      started_at: '2026-11-10T01:00:00Z' }]} />);
    const [step] = steps(container);
    expect(count(step!.textContent ?? '')).toBe(1);
    const said = step!.querySelector('[data-not-recorded]')?.textContent ?? '';
    expect(said).toContain('duration');
    expect(said).not.toContain('start');
  });
});
