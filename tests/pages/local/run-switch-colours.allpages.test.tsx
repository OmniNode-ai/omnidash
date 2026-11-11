// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 follow-up (operator review of the Runs toolbar, 2026-11-11: "both toggle different color and use same toggle
// color to tooltip like you did for column name hover"). The two switches were one grey and one blue when on, their info
// icons grey, their tooltips the plain dark one. Each switch now wears its own field colour (Show all run fields: the run
// details field; Routing columns: the routing field) on its track and info icon, and its tooltip is the column headers'
// tinted card (the kit's .ds-column-tip) in that colour.
// Failure modes:
//   W1  the two switches share a colour, or have none;
//   W2  a switch's tooltip is not the column headers' tinted card;
//   W3  the track does not take the switch's colour, off (a tint) and on (solid).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RunsTable } from '@/pages/LocalDashboardPage';

afterEach(cleanup);

describe('OMN-23330: each Runs switch wears its own colour, tooltip included', () => {
  it('W1 W2: two different field tones, each wrapper the kit column-tip', () => {
    render(<RunsTable now={Date.parse('2026-10-24T06:00:00Z')} decisions={[{ correlation_id: 'r', created_at: '2026-10-24T05:10:00Z', written_at: '2026-10-24T05:10:00Z' }]} sessions={[]} />);
    const wrappers = ['Show all run fields', 'Routing columns'].map(name => screen.getByRole('checkbox', { name }).closest('.local-recent-switch')!);
    const tones = wrappers.map(wrapper => wrapper.getAttribute('data-field-tone'));
    expect(tones).toEqual(['run-details', 'routing']);
    for (const wrapper of wrappers) expect(wrapper.classList.contains('ds-column-tip')).toBe(true);
  });

  it('W3: the track is a tint of the switch colour when off and the colour when on', () => {
    const css = readFileSync(path.resolve(__dirname, '../../../src/styles/editorial.css'), 'utf8');
    expect(css).toMatch(/\.local-recent-switch\[data-field-tone\] input\[type="checkbox"\]:not\(#ds-important\)\s*\{[^}]*background:[^;]*var\(--field-ink\)/);
    expect(css).toMatch(/\.local-recent-switch\[data-field-tone\] input\[type="checkbox"\]:checked:not\(#ds-important\)\s*\{[^}]*background:\s*var\(--field-ink\)/);
    // The info icon is a kit component, so its rule lives in the kit's stylesheet (AC29).
    const kit = readFileSync(path.resolve(__dirname, '../../../src/theme/design-system/kit/editorial.css'), 'utf8');
    expect(kit).toMatch(/\.local-recent-switch\[data-field-tone\] \.ds-infotip:not\(#ds-important\)\s*\{[^}]*color:\s*var\(--field-ink\)/);
  });
});
