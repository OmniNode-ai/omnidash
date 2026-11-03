// @vitest-environment jsdom
/**
 * OMN-22168 AC4: the kit's one Tooltip (Lakshman 2026-11-03, "add tooltip whenever needed so that user can see what's
 * that"). Explanations that CORE-10 cuts from the page move here. Written before the component. Failure modes:
 *   T1  the text shows on pointer hover but not on keyboard focus (or the reverse);
 *   T2  assistive tech never hears it: the target is not described by the tip while it shows;
 *   T3  Escape does not dismiss it, or leaving does not hide it;
 *   T4  the info button form has no name, so a reader cannot find what it explains.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { InfoTip, Tooltip } from '@/design-system/components';

afterEach(cleanup);

describe('Tooltip', () => {
  it('T1/T2/T3: shows on hover and focus, describes its target, hides on leave, blur and Escape', () => {
    render(<Tooltip text="Modelled saving against the baseline model"><button type="button">Savings</button></Tooltip>);
    const target = screen.getByRole('button', { name: 'Savings' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(target.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Modelled saving against the baseline model');
    expect(target).toHaveAccessibleDescription('Modelled saving against the baseline model');
    fireEvent.mouseLeave(target.parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(target);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(target);
    fireEvent.blur(target);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('T4: the info button is named for what it explains and opens the same tip', () => {
    render(<InfoTip label="About savings" text="Modelled saving against the baseline model" />);
    const button = screen.getByRole('button', { name: 'About savings' });
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Modelled saving against the baseline model');
    expect(button).toHaveAccessibleDescription('Modelled saving against the baseline model');
  });
});
