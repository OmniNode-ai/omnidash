// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 follow-up (operator review of Delegation Evidence's Selected run, 2026-11-11: "cards and make it great").
// A run's facts were a plain grid of labels and values. A card per fact followed; the operator then asked for "just one
// card" (and "one card scrollable" in the run dialog): all the facts in one card, each fact's icon and label in its field's
// colour (the colour the tables' columns wear), with no bar down any edge ("remove left side border"). The Runs page's
// run dialog uses the same look.
// Failure modes:
//   F1  the kit offers no card look for a fact list, or KV cannot take it;
//   F2  the facts are not one card (each fact is boxed, or the list has no card edge), a fact's label is not in its field
//       colour, or the look is outranked by the page rules that draw .kv and the fields list (both id-weighted);
//   F3  the Runs dialog or Evidence's Selected run does not use the cards, or a fact in the dialog has no field tone.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Fact, FactList } from '@/theme/design-system/components';
import { KV } from '@/components/dashboard/event-dash/primitives';
import { RunsTable } from '@/pages/LocalDashboardPage';

afterEach(cleanup);
const ROOT = path.resolve(__dirname, '../..');

describe('OMN-23330: a run\'s facts are cards, one kit look', () => {
  it('F1: FactList has a cards look and KV takes it', () => {
    const { container } = render(<><FactList look="cards"><Fact term="Model" data-field-tone="model">qwen</Fact></FactList>
      <KV cards items={[{ k: 'Model', v: 'qwen' }]} /></>);
    expect(container.querySelectorAll('.ds-fact-cards').length).toBe(2);
  });

  it('F2: the facts are one card, each label in its field colour, at a weight that outranks the page rules', () => {
    const css = readFileSync(path.join(ROOT, 'src/theme/design-system/components/fact-cards.css'), 'utf8');
    const list = /\.ds-fact-cards:not\(#ds-important\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(list).toMatch(/display:\s*grid/);
    expect(list).toMatch(/border:\s*1px solid/);
    expect(list).toMatch(/border-radius/);
    expect(list).toMatch(/background/);
    const fact = /\.ds-fact-cards > \*:not\(#ds-important\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(fact).not.toMatch(/border|background/);
    const label = /\.ds-fact-cards > \* > :is\(dt, \.k\):not\(#ds-important\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(label).toMatch(/color:[^;]*var\(--field-ink/);
  });

  it('F3: the Runs dialog uses the cards and gives every fact a field tone; Evidence\'s Selected run uses them too', () => {
    const run = { correlation_id: 'run-a', task_type: 'document', model_name: 'm', backend_id: 'b', host: 'h', latency_ms: 900,
      quality_gate_passed: 1, terminal_ok: 1, actual_score: '1', required_bar: '0.8', tokens_input: 1, tokens_output: 1,
      created_at: '2026-10-24T05:10:00Z', written_at: '2026-10-24T05:10:00Z' };
    render(<RunsTable now={Date.parse('2026-10-24T06:00:00Z')} decisions={[run]} sessions={[]} />);
    fireEvent.click(screen.getAllByRole('row').slice(1)[0]!.cells[2]!);
    const cards = screen.getByRole('dialog').querySelector('.ds-fact-cards')!;
    expect(cards).not.toBeNull();
    const untoned = [...cards.children].filter(fact => !fact.getAttribute('data-field-tone')).map(fact => fact.querySelector('dt')?.textContent);
    expect(untoned).toEqual([]);
    const evidence = readFileSync(path.join(ROOT, 'src/pages/DelegationEvidencePage.tsx'), 'utf8');
    expect(evidence).toMatch(/title="SELECTED RUN"[\s\S]{0,200}<KV\s+cards/);
  });
});
