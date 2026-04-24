import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Heading } from './Heading';

describe('Heading', () => {
  it.each([
    [1, 'H1', 'var(--text-4xl)'],
    [2, 'H2', 'var(--text-3xl)'],
    [3, 'H3', 'var(--text-2xl)'],
    [4, 'H4', 'var(--text-xl)'],
  ] as const)('level=%i renders <%s> with size %s by default', (level, tag, expectedSize) => {
    const { container } = render(<Heading level={level as 1|2|3|4}>t</Heading>);
    const el = container.firstChild as HTMLElement;
    expect(el.nodeName).toBe(tag);
    expect(el.style.fontSize).toBe(expectedSize);
  });

  it('default weight=semibold and leading=tight', () => {
    const { container } = render(<Heading level={2}>t</Heading>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.fontWeight).toBe('var(--weight-semibold)');
    expect(el.style.lineHeight).toBe('var(--leading-tight)');
  });

  it('size prop overrides default for level', () => {
    const { container } = render(<Heading level={1} size="xl">t</Heading>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('var(--text-xl)');
  });

  it('style prop wins over computed style', () => {
    const { container } = render(<Heading level={1} style={{ fontSize: '99px' }}>t</Heading>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('99px');
  });
});
