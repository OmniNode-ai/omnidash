// OMN-21166 part 14, AC79: Delegation Evidence states its scope in one line under its title: how many delegations it
// serves and over which window. Failure modes:
//   V1  the line counts something other than the delegations the page's Delegations figure shows (two numbers for one
//       concept, against "one number everywhere");
//   V2  an unserved count reads as 0 delegations.
import { describe, expect, it } from 'vitest';
import { evidenceScopeLine } from '@/pages/DelegationEvidencePage';

describe('evidenceScopeLine', () => {
  it('V1: names the window and the same served count as the Delegations figure', () => {
    expect(evidenceScopeLine('623')).toBe('All time · 623 delegations served');
    expect(evidenceScopeLine('1')).toBe('All time · 1 delegation served');
    expect(evidenceScopeLine('59.19K')).toBe('All time · 59.19K delegations served');
  });

  it('V2: an unserved count stays in words', () => {
    expect(evidenceScopeLine('Not measured')).toBe('All time · delegations served: Not measured');
  });
});
