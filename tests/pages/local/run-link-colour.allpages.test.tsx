// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 follow-up (operator review of the Runs table, 2026-11-11: "link should be blue color"). A run's id opens its
// path on Workflow, but it was drawn in the ink colour by two page rules (every dashboard link, and every link in the
// Runs table), so it did not read as a link. It now wears the link colour wherever a run's id is drawn.
// Failure modes:
//   L1  a run's id link carries no mark the link colour can be given by;
//   L2  no rule gives that mark the link colour, or it is too light to outrank the ink rules (both id-weighted).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { afterEach, describe, expect, it } from 'vitest';
import { RunRef } from '@/pages/local/page-shared';

afterEach(cleanup);

describe('OMN-23330: a run id is a blue link', () => {
  it('L1: the run id link carries the run-link mark', () => {
    render(<Router><RunRef id="ab7281260000000000000000fa32" short /></Router>);
    expect(screen.getByRole('link').classList.contains('ds-run-link')).toBe(true);
  });

  it('L2: the mark wears the link colour at a weight that outranks the ink rules', () => {
    const css = readFileSync(path.resolve(__dirname, '../../../src/styles/dashboard-cards.css'), 'utf8');
    expect(css).toMatch(/html body :is\(\.local-dashboard-page, main\.ev-root\) a\.ds-run-link:not\(#ds-important\)\s*\{[^}]*color:\s*var\(--ds-link\)/);
  });
});
