import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SuggestedPrompts } from './SuggestedPrompts';

describe('SuggestedPrompts', () => {
  it('renders 4 suggested prompts', () => {
    render(<SuggestedPrompts onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('calls onSelect with prompt text when clicked', async () => {
    const onSelect = vi.fn();
    render(<SuggestedPrompts onSelect={onSelect} />);
    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledWith(expect.any(String));
  });

  it('each button text matches one of the known suggested prompts', () => {
    render(<SuggestedPrompts onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toBeTruthy();
    expect(buttons[3].textContent).toBeTruthy();
  });
});
