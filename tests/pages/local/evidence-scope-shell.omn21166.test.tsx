// @vitest-environment jsdom
// OMN-21166 part 14, AC79 in the page shell: the scope line is drawn under the Evidence title (the shell hides the old
// subtitle there, so a scope passed as the subtitle would never be seen). Failure mode V3: the line is not on the page.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EvPageShell } from '@/components/dashboard/event-dash/EvPageShell';

afterEach(cleanup);

describe('EvPageShell scope line', () => {
  it('V3: Delegation Evidence shows its scope under the title, and not the old subtitle', () => {
    render(<EvPageShell crumb="c" title="Delegation Evidence" sub="old subtitle" scope="All time · 623 delegations served"><p>body</p></EvPageShell>);
    const heading = screen.getByRole('heading', { level: 1, name: 'Delegation Evidence' });
    expect(heading.nextElementSibling).toHaveTextContent('All time · 623 delegations served');
    expect(screen.queryByText('old subtitle')).toBeNull();
  });
});
