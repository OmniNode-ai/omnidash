// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 AC34 (operator, chat 2026-11-11: chosen from a benchmark of 20 open-source dashboards): hovering or focusing a
// headline card's figure shows its exact value (every digit) and, when a previous window exists, the previous window's
// value and the absolute change; All time, which has no previous window, shows the exact value only.
// Failure modes:
//   D1  the detail rounds the value (1.14M instead of 1,144,630; $5.64 instead of $5.6412);
//   D2  the detail shows a previous value where none exists, or omits it where one does;
//   D3  the change has the wrong sign or size;
//   D4  the detail is unreachable by keyboard, or stays up after Escape.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FigureDetail, figureDetailLines } from '@/pages/local/page-headline';

describe('OMN-23330 AC34: a headline figure shows its exact value and the previous window on hover and focus', () => {
  it('D1: exact values keep every digit', () => {
    expect(figureDetailLines('count', 1144630, null, null)).toEqual(['Exact: 1,144,630']);
    expect(figureDetailLines('money', 5.64123, null, null)).toEqual(['Exact: $5.6412']);
    expect(figureDetailLines('count', 483, null, null)).toEqual(['Exact: 483']);
  });

  it('D2 D3: a previous window adds its value and the signed absolute change', () => {
    expect(figureDetailLines('money', 5.6412, 11.75, 7)).toEqual(['Exact: $5.6412', 'Previous 7 days: $11.7500', 'Change: −$6.1088']);
    expect(figureDetailLines('money', 0.25, 0, 7)).toEqual(['Exact: $0.2500', 'Previous 7 days: $0.0000', 'Change: +$0.2500']);
    expect(figureDetailLines('count', 483, 1610, 7)).toEqual(['Exact: 483', 'Previous 7 days: 1,610', 'Change: −1,127']);
    expect(figureDetailLines('count', 1000, 1000, 15)).toEqual(['Exact: 1,000', 'Previous 15 days: 1,000', 'Change: 0']);
  });

  it('D4: the detail shows on keyboard focus and hover, and Escape hides it', () => {
    render(<FigureDetail lines={['Exact: 1,144,630', 'Previous 7 days: 2,600,000']}><span>1.14M</span></FigureDetail>);
    const target = screen.getByText('1.14M').closest('[tabindex="0"]') as HTMLElement;
    expect(target).not.toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(target);
    expect(screen.getByRole('tooltip').textContent).toContain('Exact: 1,144,630');
    expect(screen.getByRole('tooltip').textContent).toContain('Previous 7 days: 2,600,000');
    expect(target.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(target.parentElement!);
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });
});
