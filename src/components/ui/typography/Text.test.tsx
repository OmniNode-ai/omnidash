import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('renders a span by default with size=xl and color=primary', () => {
    const { container } = render(<Text>hello</Text>);
    const el = container.firstChild as HTMLElement;
    expect(el.nodeName).toBe('SPAN');
    expect(el.style.fontSize).toBe('var(--text-xl)');
    expect(el.style.color).toBe('var(--text-primary)');
    expect(el.textContent).toBe('hello');
  });

  it.each([
    ['xs', 'var(--text-xs)'], ['sm', 'var(--text-sm)'], ['md', 'var(--text-md)'],
    ['lg', 'var(--text-lg)'], ['xl', 'var(--text-xl)'], ['2xl', 'var(--text-2xl)'],
    ['3xl', 'var(--text-3xl)'], ['4xl', 'var(--text-4xl)'],
  ] as const)('size=%s → font-size %s', (size, expected) => {
    const { container } = render(<Text size={size}>x</Text>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe(expected);
  });

  it.each([
    ['primary', 'var(--text-primary)'], ['secondary', 'var(--text-secondary)'],
    ['tertiary', 'var(--text-tertiary)'], ['brand', 'var(--text-brand)'],
    ['ok', 'var(--text-ok)'], ['warn', 'var(--text-warn)'], ['bad', 'var(--text-bad)'],
    ['inherit', 'inherit'],
  ] as const)('color=%s → %s', (color, expected) => {
    const { container } = render(<Text color={color}>x</Text>);
    expect((container.firstChild as HTMLElement).style.color).toBe(expected);
  });

  it('family=mono → font-family var(--font-mono)', () => {
    const { container } = render(<Text family="mono">x</Text>);
    expect((container.firstChild as HTMLElement).style.fontFamily).toBe('var(--font-mono)');
  });

  it('weight=semibold → font-weight var(--weight-semibold)', () => {
    const { container } = render(<Text weight="semibold">x</Text>);
    expect((container.firstChild as HTMLElement).style.fontWeight).toBe('var(--weight-semibold)');
  });

  it('leading=tight → line-height var(--leading-tight)', () => {
    const { container } = render(<Text leading="tight">x</Text>);
    expect((container.firstChild as HTMLElement).style.lineHeight).toBe('var(--leading-tight)');
  });

  it('tabularNums → font-variant-numeric: tabular-nums', () => {
    const { container } = render(<Text tabularNums>12.34</Text>);
    expect((container.firstChild as HTMLElement).style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('truncate → overflow/ellipsis/nowrap', () => {
    const { container } = render(<Text truncate>long long long</Text>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.overflow).toBe('hidden');
    expect(el.style.textOverflow).toBe('ellipsis');
    expect(el.style.whiteSpace).toBe('nowrap');
  });

  it('style prop overrides computed style (escape hatch)', () => {
    const { container } = render(<Text size="md" style={{ fontSize: '99px' }}>x</Text>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('99px');
  });

  it('as="div" renders a div', () => {
    const { container } = render(<Text as="div">x</Text>);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('passes aria-label through', () => {
    const { container } = render(<Text aria-label="hello">x</Text>);
    expect(container.firstChild).toHaveAttribute('aria-label', 'hello');
  });
});
