// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 follow-up (operator 2026-11-11: "improve this page http://127.0.0.1:3001/delegation-evidence and make sure it
// follows our design system - one design system for all dashboard"). A live audit of Delegation Evidence against the
// other pages found: two section headings (Failure triage, Savings bridge) drawn with no icon and in raw capitals, as the
// panel's lookup did not name them; and Recent delegations opening a run by expanding the row in place behind a chevron,
// where the Runs table opens the kit's centred dialog with the run's facts in one card.
// Failure modes:
//   E1  an Evidence section heading has no icon, or reads in the raw capitals of its source title;
//   E2  the event-dash table cannot hand a row to the page (click or Enter), or still draws its chevron when it does;
//   E3  Recent delegations does not open the kit dialog, or the dialog's facts are not the one fact card.
//   E4  the decision export sits outside the Recent delegations panel (on Runs the exports are in the panel's toolbar);
//   E5  an export downloads at once, where Runs asks first (Lakshman 2026-11-04: "so that if someone mistakenly clicks
//       they will not download mistakenly").
//   E6  the dialog's backdrop grid sizes its column to the widest unbreakable line inside (a run's prompt as code), so
//       the dialog is centred thousands of pixels off-screen (measured live 2026-11-11: x = 3034 in a 1440px window).
//   E7  the dialog is portalled to <body>, outside main.ev-root, so the run's Prompt/Answer blocks, notes and Run path lose
//       the Evidence rules the inline Selected run panel has (measured live: the Prompt block 6754px wide in a 760px dialog).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, Panel } from '@/components/dashboard/event-dash/primitives';

afterEach(cleanup);
const EVIDENCE = readFileSync(path.resolve(__dirname, '../../src/pages/DelegationEvidencePage.tsx'), 'utf8');

describe('OMN-23330: Delegation Evidence follows the one design system', () => {
  it('E1: every section heading the page uses has its icon and reads in sentence case', () => {
    const titles = [...new Set([...EVIDENCE.matchAll(/<Panel\s+(?:[^>]*?\s)?title="([^"]+)"/g)].map(match => match[1]!))];
    expect(titles.length).toBeGreaterThanOrEqual(7);
    for (const title of titles) {
      const { container } = render(<Panel title={title}>body</Panel>);
      const heading = container.querySelector('h2')!;
      expect(heading.querySelector('.ev-panel-icon svg'), title).not.toBeNull();
      expect(heading.textContent, title).not.toMatch(/^[A-Z]{2,}( |$)/);
      cleanup();
    }
  });

  it('E2: a table with onOpen hands the row to the page on click and on Enter, with no chevron', () => {
    const onOpen = vi.fn();
    render(<DataTable columns={[{ key: 'id', label: 'Id' }]} rows={[{ id: 'run-a' }]} rowKey={row => row.id} onOpen={onOpen} />);
    expect(screen.queryByRole('button', { name: /Toggle details/ })).toBeNull();
    const row = screen.getByRole('button', { name: /run-a/ });
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen.mock.calls[0]![0]).toEqual({ id: 'run-a' });
  });

  it('E3: Recent delegations opens the kit dialog, its facts in the one fact card', () => {
    const recent = EVIDENCE.slice(EVIDENCE.indexOf('function RecentDelegations'), EVIDENCE.indexOf('function fixtureNoticeOf'));
    expect(recent).toMatch(/onOpen=/);
    expect(recent).toMatch(/<Dialog\b/);
    expect(recent).not.toMatch(/renderDetail=/);
    const detail = EVIDENCE.slice(EVIDENCE.indexOf('function DecisionDetail'), EVIDENCE.indexOf('function RecentDelegations'));
    expect(detail).toMatch(/<KV\s+cards/);
  });

  it('E4 E5: the export is in the Recent delegations panel and asks before it downloads', () => {
    const page = EVIDENCE.slice(EVIDENCE.indexOf('function RecentDelegations'), EVIDENCE.indexOf('function fixtureNoticeOf'));
    expect(page).toMatch(/<DecisionSampleExport\b/);
    const shell = EVIDENCE.slice(EVIDENCE.lastIndexOf('<EvPageShell'));
    expect(shell).not.toMatch(/<DecisionSampleExport\b/);
    const exporter = EVIDENCE.slice(EVIDENCE.indexOf('function DecisionSampleExport'), EVIDENCE.indexOf('// ── page'));
    expect(exporter).toMatch(/<ConfirmDialog\b/);
    expect(exporter).not.toMatch(/onClick=\{\(\) => downloadDecisionSample/);
  });

  it('E6: the dialog column is capped at the window, so long code cannot push the dialog off-screen', () => {
    const css = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/components/dialog.css'), 'utf8');
    expect(css).toMatch(/\.ds-dialog-backdrop\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.ds-dialog\s*\{[^}]*min-width:\s*0/);
  });

  it('E7: the dialog content carries the Evidence scope, laid out as a spaced grid inside the dialog', () => {
    const recent = EVIDENCE.slice(EVIDENCE.indexOf('function RecentDelegations'), EVIDENCE.indexOf('function fixtureNoticeOf'));
    expect(recent).toMatch(/<div className="ev-root ev-dialog-content">\{opened && <DecisionDetail row=\{opened\} \/>\}<\/div>/);
    const css = readFileSync(path.resolve(__dirname, '../../src/styles/event-dash.css'), 'utf8');
    // Its sections (fact card, Prompt/Answer, Run path) are spaced by Evidence's own grid gap (18px), not stacked touching.
    expect(css).toMatch(/\.ev-root\.ev-dialog-content\s*\{[^}]*display: grid; grid-template-columns: minmax\(0, 1fr\);[^}]*gap: 18px;[^}]*flex: none;[^}]*background: transparent;/);
  });
});
