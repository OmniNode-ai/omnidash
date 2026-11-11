// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 AC36 (operator, chat 2026-11-11: chosen from a benchmark of 20 open-source dashboards): single keys choose the
// window: A all time, T today, W last 7 days, F last 15, M last 30, Q last 90; "?" lists the keys and Escape closes the
// list; no key acts while typing in a field or with Ctrl, Cmd or Alt held.
// Failure modes:
//   K1  a key chooses no window, or the wrong one;
//   K2  a key acts while typing in an input, textarea, select or editable field;
//   K3  a key acts with a modifier held (it would steal the browser's own shortcuts);
//   K4  "?" lists no keys, or Escape leaves the list open.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WindowMenu, type WindowMenuOption } from '@/pages/local/window-menu';

const VALUES = ['all', 'today', 'last-7', 'last-15', 'last-30', 'last-90'] as const;
function setup() {
  const chosen: string[] = [];
  const options: WindowMenuOption[] = VALUES.map(value => ({ value, label: value, name: value, checked: value === 'all', onSelect: vi.fn(() => { chosen.push(value); }) }));
  const view = render(<><input aria-label="Run filter" /><textarea aria-label="Note" /><div contentEditable aria-label="Editable" /><WindowMenu labelledBy="x" options={options} current="All time" /></>);
  return { chosen, view };
}
const press = (key: string, init: KeyboardEventInit = {}, target: Element | Document = document.body) => act(() => { fireEvent.keyDown(target, { key, ...init }); });

describe('OMN-23330 AC36: single keys choose the window', () => {
  it('K1: each key chooses its window', () => {
    const { chosen } = setup();
    for (const key of ['a', 't', 'w', 'f', 'm', 'q']) press(key);
    expect(chosen).toEqual(['all', 'today', 'last-7', 'last-15', 'last-30', 'last-90']);
    press('W');
    expect(chosen.at(-1)).toBe('last-7');
  });

  it('K2: no key acts while typing in a field', () => {
    const { chosen } = setup();
    press('w', {}, screen.getByLabelText('Run filter'));
    press('m', {}, screen.getByLabelText('Note'));
    press('q', {}, screen.getByLabelText('Editable'));
    expect(chosen).toEqual([]);
  });

  it('K3: no key acts with Ctrl, Cmd or Alt held', () => {
    const { chosen } = setup();
    press('w', { ctrlKey: true });
    press('t', { metaKey: true });
    press('a', { altKey: true });
    expect(chosen).toEqual([]);
  });

  it('K4: "?" lists the keys and Escape closes the list', () => {
    setup();
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
    press('?', { shiftKey: true });
    const list = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    for (const text of ['A', 'All time', 'T', 'Today', 'W', 'Last 7 days', 'F', 'Last 15 days', 'M', 'Last 30 days', 'Q', 'Last 90 days']) expect(list.textContent).toContain(text);
    press('Escape');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
  });
});
