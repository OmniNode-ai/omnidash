// @vitest-environment jsdom
// OMN-24616 AC5 (independent review of #517, finding 1): a page that throws shows its failure inside the frame, and
// leaving the failing address must bring the page back. The boundary was keyed by page only, so a crash caused by a
// query parameter (/overview?window=<bad>) could not be left through its own "Go to Overview" link or any other
// same-page address: the page key stayed the same and the error card stayed on screen.
//
// Failure modes, each with a test below:
//   R1  after a crash, a new address on the same page (resetKey changes) still shows the error card;
//   R2  a healthy page is remounted (its state lost, its reads restarted) whenever only the query string changes;
//   R3  a crash no longer shows the page's error card with its reason (guards the original AC5 behaviour).
import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageErrorBoundary } from '@/components/frame/PageErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Page({ fail }: { fail: boolean }) {
  if (fail) throw new Error('unknown window key');
  return <p>Overview figures</p>;
}

describe('OMN-24616 AC5: the page error boundary', () => {
  it('R3: a page that throws shows its failure and reason inside the frame', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PageErrorBoundary title="Overview" resetKey="/overview?window=bad"><Page fail /></PageErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toContain('Overview could not be shown: unknown window key');
  });

  it('R1: leaving the failing address on the same page shows the page again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(
      <PageErrorBoundary title="Overview" resetKey="/overview?window=bad"><Page fail /></PageErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    view.rerender(<PageErrorBoundary title="Overview" resetKey="/overview"><Page fail={false} /></PageErrorBoundary>);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Overview figures')).toBeTruthy();
  });

  it('R2: a healthy page is not remounted when only the address changes', () => {
    let mounts = 0;
    function Counted() {
      useEffect(() => { mounts += 1; }, []);
      return <p>Overview figures</p>;
    }
    const view = render(<PageErrorBoundary title="Overview" resetKey="/overview?window=7d"><Counted /></PageErrorBoundary>);
    view.rerender(<PageErrorBoundary title="Overview" resetKey="/overview?window=30d"><Counted /></PageErrorBoundary>);
    view.rerender(<PageErrorBoundary title="Overview" resetKey="/overview?window=90d"><Counted /></PageErrorBoundary>);

    expect(mounts).toBe(1);
    expect(screen.getByText('Overview figures')).toBeTruthy();
  });
});
