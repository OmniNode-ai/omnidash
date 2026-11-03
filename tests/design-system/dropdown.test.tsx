// @vitest-environment jsdom
/**
 * OMN-22168 AC4: the kit's one Dropdown, which replaces every native <select> on the local pages (Lakshman 2026-11-03,
 * "do like overview?": the Runs filters opened the operating system's list, unlike Overview's ticked menu). Written
 * before the component. Failure modes:
 *   F1  the trigger does not say what is chosen, or is not named by its label for assistive tech;
 *   F2  the open list does not mark the chosen option, or marks it by colour alone (no tick);
 *   F3  the keyboard cannot open, move, choose or leave it (ArrowDown/Up, Home/End, Enter, Space, Escape, type-ahead);
 *   F4  choosing does not report the value, or the list stays open, or focus is lost instead of returning to the trigger;
 *   F5  Escape or a click outside changes the value;
 *   F6  an option's full name for assistive tech is lost when its visible label is short.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dropdown } from '@/design-system/components';

afterEach(cleanup);

const OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'passed', label: 'passed' },
  { value: 'failed', label: 'failed' },
  { value: 'Not recorded', label: 'Not recorded', name: 'Status not recorded' },
];

function setup(value = 'all') {
  const onChange = vi.fn();
  render(<><Dropdown label="Status" value={value} options={OPTIONS} onChange={onChange} /><p>outside</p></>);
  return { onChange, trigger: screen.getByRole('button', { name: /Status/ }) };
}

describe('Dropdown', () => {
  it('F1: the trigger is named by its label and shows the chosen option', () => {
    const { trigger } = setup('failed');
    expect(trigger).toHaveAccessibleName('Status: failed');
    expect(trigger).toHaveTextContent('failed');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('F2/F6: the open list marks the chosen option with a tick and keeps full names', () => {
    const { trigger } = setup('passed');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('listbox', { name: 'Status' });
    const options = screen.getAllByRole('option');
    expect(options.map(option => option.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false']);
    expect(options[1]!.querySelector('[data-tick]')).not.toBeNull();
    expect(options[0]!.querySelector('[data-tick]')).toBeNull();
    expect(screen.getByRole('option', { name: 'Status not recorded' })).toBeInTheDocument();
    expect(list).toHaveFocus();
    expect(list.getAttribute('aria-activedescendant')).toBe(options[1]!.id);
  });

  it('F3/F4: arrows, Home and End move; Enter chooses, closes and returns focus', () => {
    const { trigger, onChange } = setup('all');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const list = screen.getByRole('listbox');
    const ids = screen.getAllByRole('option').map(option => option.id);
    expect(list.getAttribute('aria-activedescendant')).toBe(ids[0]);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(list.getAttribute('aria-activedescendant')).toBe(ids[2]);
    fireEvent.keyDown(list, { key: 'End' });
    expect(list.getAttribute('aria-activedescendant')).toBe(ids[3]);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(list.getAttribute('aria-activedescendant'), 'stops at the last option').toBe(ids[3]);
    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(list.getAttribute('aria-activedescendant'), 'stops at the first option').toBe(ids[0]);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('passed');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('F3: Space chooses and typing a letter jumps to the next option starting with it', () => {
    const { trigger, onChange } = setup('all');
    fireEvent.click(trigger);
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'f' });
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'failed' }).id);
    fireEvent.keyDown(list, { key: ' ' });
    expect(onChange).toHaveBeenCalledWith('failed');
  });

  it('F4: a click on an option chooses it', () => {
    const { trigger, onChange } = setup('all');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Status not recorded' }));
    expect(onChange).toHaveBeenCalledWith('Not recorded');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('F5: Escape and a click outside close without changing the value', () => {
    const { trigger, onChange } = setup('all');
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
