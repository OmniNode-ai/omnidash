// @vitest-environment jsdom
// Found in the 2026-11-02 dashboard tour (Lakshman: "Fix all issues if we have"): two different served failure
// categories shortened to the same sentence shared a React key, which React warns can drop or duplicate rows.
// Failure modes: K1 rows whose shortened names match share a key (a row can vanish or repeat);
//                K2 rows that read the same cannot be told apart, because the full category is not offered.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TriageRows } from './DelegationEvidencePage';

afterEach(() => { vi.restoreAllMocks(); });

const same = 'Delegation refused: key rejected for a stored key on backend (model go…';
const rows = [
  { id: 'refused: model gemini-a', name: same, title: 'Delegation refused ... model gemini-a', count: 3, href: '/runs?status=failed' },
  { id: 'refused: model gemini-b', name: same, title: 'Delegation refused ... model gemini-b', count: 2, href: '/runs?status=failed' },
];

describe('Delegation Evidence failure rows', () => {
  it('K1: two categories that shorten to the same text are two rows with no duplicate-key error', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<TriageRows rows={rows} denominator={5} kind="category" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(errors.mock.calls.map(call => String(call[0])).filter(text => /same key/.test(text))).toEqual([]);
  });

  it('K2: each row offers its full category on hover', () => {
    render(<TriageRows rows={rows} denominator={5} kind="category" />);
    expect(screen.getAllByRole('link').map(link => link.getAttribute('title'))).toEqual(rows.map(row => row.title));
  });
});
