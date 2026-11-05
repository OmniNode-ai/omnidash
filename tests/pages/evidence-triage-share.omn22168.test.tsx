// @vitest-environment jsdom
/**
 * OMN-22168 (Lakshman 2026-11-04, "make it modern"): each Failure triage row draws its share of the failures as a bar.
 * Failure modes: no bar at all; a bar whose fill is not the row's share; a bar drawn when the share is not served
 * (count or denominator missing, or a zero denominator), which would show a made-up proportion.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TriageRows } from '@/pages/DelegationEvidencePage';

const bars = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-triage-row] .ev-triage-share')];

describe('Failure triage share bars', () => {
  it('fills each bar to its row share of the failures', () => {
    const { container } = render(<TriageRows kind="model" denominator={3} rows={[
      { name: 'model-b', count: 2, href: '/runs?model=model-b' },
      { name: 'model-a', count: 1, href: '/runs?model=model-a' },
    ]} />);
    expect(bars(container).map(bar => bar.style.getPropertyValue('--share'))).toEqual(['66.667%', '33.333%']);
    expect(bars(container).every(bar => bar.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('draws no bar where the share is not served', () => {
    const { container: missingCount } = render(<TriageRows kind="task" denominator={3} rows={[{ name: 'x', count: null, href: '/runs' }]} />);
    expect(bars(missingCount)).toEqual([]);
    const { container: missingTotal } = render(<TriageRows kind="task" denominator={null} rows={[{ name: 'x', count: 2, href: '/runs' }]} />);
    expect(bars(missingTotal)).toEqual([]);
    const { container: zeroTotal } = render(<TriageRows kind="task" denominator={0} rows={[{ name: 'x', count: 0, href: '/runs' }]} />);
    expect(bars(zeroTotal)).toEqual([]);
  });
});
