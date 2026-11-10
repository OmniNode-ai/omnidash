// OMN-21166 part 14, AC79: Delegation Evidence states its scope in one line under its title: how many delegations it
// serves and over which window. Failure modes:
//   V1  the line counts something other than the delegations the page's Delegations figure shows (two numbers for one
//       concept, against "one number everywhere");
//   V2  an unserved count reads as 0 delegations.
import { describe, expect, it } from 'vitest';
import { evidenceScopeLine } from '@/pages/DelegationEvidencePage';

describe('evidenceScopeLine', () => {
  // OMN-23330 AC1/AC2 (Lakshman 2026-11-10, "All on metering"): the Delegations figure is metering-summary.v1's measured
  // count, so the scope line always names it as measured, never as every served decision.
  it('V1: names the window and the same measured count as the Delegations figure', () => {
    expect(evidenceScopeLine('623')).toBe('All time · 623 measured delegations');
    expect(evidenceScopeLine('1')).toBe('All time · 1 measured delegation');
    expect(evidenceScopeLine('59.19K')).toBe('All time · 59.19K measured delegations');
  });

  it('V2: an unserved count stays in words', () => {
    expect(evidenceScopeLine('Not measured')).toBe('All time · measured delegations: Not measured');
  });

  it('V3: the line never calls the figure every served decision', () => {
    for (const runs of ['650', '1', 'Not measured']) expect(String(evidenceScopeLine(runs))).not.toMatch(/served/);
  });
});
