// @vitest-environment jsdom
// OMN-24473: when the Overview's decisions read stopped at the newest page (capped) and every served run is newer
// than the stored visit, older new runs may sit unread, so the counts are a floor, not a total. Failure modes, each
// with a test below:
//   S1  a capped read whose served runs are all after the visit drawn as an exact count instead of a floor
//   S2  a capped read drawn as a floor although a served run at or before the visit proves the read spans it
//   S3  an uncapped read drawn as a floor
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAST_VISIT_KEY, SinceLastVisit } from '@/pages/local/since-last-visit';

const NOW = Date.parse('2026-10-18T09:30:00Z');
const row = (at: string, passed: unknown = 1) => ({ written_at: at, quality_gate_passed: passed });
// Three runs after the stored visit, one of them failed; none at or before it.
const ROWS = [row('2026-10-17T19:00:00Z'), row('2026-10-18T08:00:00Z', 0), row('2026-10-18T09:00:00Z', null)];
const VISIT = String(Date.parse('2026-10-17T18:30:00Z'));

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe('OMN-24473: since your last visit against a capped read', () => {
  it('S1: a capped read whose served runs are all after the visit marks the counts as a floor', () => {
    window.localStorage.setItem(LAST_VISIT_KEY, VISIT);
    const status = render(<SinceLastVisit decisions={ROWS} now={NOW} capped />).getByRole('status', { name: 'Since your last visit' });
    expect(status).toHaveTextContent('Since your last visit · Oct 17, 18:30 UTC3+ new runs1+ failed');
    expect(status).toHaveAttribute('title', 'At least; only the newest runs were read');
  });

  it('S2: a capped read with a served run at or before the visit keeps the exact counts and no title', () => {
    window.localStorage.setItem(LAST_VISIT_KEY, VISIT);
    const status = render(<SinceLastVisit decisions={[...ROWS, row('2026-10-17T10:00:00Z')]} now={NOW} capped />)
      .getByRole('status', { name: 'Since your last visit' });
    expect(status).toHaveTextContent('Since your last visit · Oct 17, 18:30 UTC3 new runs1 failed');
    expect(status).not.toHaveAttribute('title');
  });

  it('S3: an uncapped read keeps the exact counts and no title', () => {
    window.localStorage.setItem(LAST_VISIT_KEY, VISIT);
    const status = render(<SinceLastVisit decisions={ROWS} now={NOW} />)
      .getByRole('status', { name: 'Since your last visit' });
    expect(status).toHaveTextContent('Since your last visit · Oct 17, 18:30 UTC3 new runs1 failed');
    expect(status).not.toHaveAttribute('title');
  });
});
