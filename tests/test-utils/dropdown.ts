/**
 * OMN-22168: unit-test access to a kit Dropdown, by the label it names itself with (data-dropdown) and by option value
 * (data-value), the way a test reached a native <select> by its label and value before the Runs filters moved to it.
 */
import { fireEvent } from '@testing-library/react';

function trigger(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.ds-dropdown-trigger')].filter(el => el.dataset.dropdown === label);
  if (found.length !== 1) throw new Error(`expected one "${label}" dropdown, found ${found.length}`);
  return found[0]!;
}

function openList(label: string): HTMLElement {
  const button = trigger(label);
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
  const list = document.querySelector<HTMLElement>(`[role="listbox"][aria-label="${label}"]`);
  if (!list) throw new Error(`the "${label}" dropdown did not open`);
  return list;
}

const optionsOf = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('[role="option"]')];

/** Choose the option with this value, as fireEvent.change did on the select. */
export function chooseDropdown(label: string, value: string): void {
  const option = optionsOf(openList(label)).find(el => el.dataset.value === value);
  if (!option) throw new Error(`the "${label}" dropdown has no option "${value}"`);
  fireEvent.click(option);
}

/** The chosen option's value, as select.value read it. */
export function dropdownValue(label: string): string | null {
  return trigger(label).getAttribute('data-value');
}

/** The chosen option's text, as the select's checked option read it. */
export function dropdownText(label: string): string {
  return trigger(label).querySelector('.ds-dropdown-value')?.textContent ?? '';
}

/** Every option's value in order, as the select's options listed them; the list is closed again after. */
export function dropdownOptions(label: string): string[] {
  const list = openList(label);
  const values = optionsOf(list).map(el => el.dataset.value ?? '');
  fireEvent.keyDown(list, { key: 'Escape' });
  return values;
}
